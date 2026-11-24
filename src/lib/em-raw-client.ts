/**
 * Shared raw node:http/https client for EastMoney endpoints (server-only).
 *
 * WHY RAW node:http INSTEAD OF GLOBAL fetch:
 * 1. Next.js patches global fetch in dev; inside the dev server many requests to
 *    the push2/push2his/push2ex family fail with "other side closed", while the
 *    same request from a standalone process succeeds most of the time.
 * 2. The EastMoney backends respond with the full body and then RST the
 *    connection (aggressive keep-alive killing + rate limiting). undici treats
 *    that premature close as fatal and DISCARDS the already-received body;
 *    curl tolerates it. Our raw client accumulates the body and accepts it when
 *    it parses as JSON, even if the socket ends abnormally.
 * 3. DNS round-robins across several backends, some of which drop connections
 *    outright. We resolve A records ourselves and try multiple IPs.
 *
 * Consumers: em-timeline-server.ts (分时), limit-up-pullback route (涨停回踩).
 * Rate limiting: the push2 endpoint family blocks per IP in bursts. Keep server
 * TTLs reasonable and never poll these endpoints directly.
 */

import http from "node:http";
import https from "node:https";
import dns from "node:dns";

export interface RawFetchResult {
  status: number;
  body: string;
}

function dnsResolve4(hostname: string): Promise<string[]> {
  return new Promise((resolve) => {
    dns.resolve4(hostname, (err, ips) => resolve(err || !Array.isArray(ips) ? [] : ips));
  });
}

/** Single attempt against one host/IP. Rejects when nothing usable arrived. */
function rawHttpFetchOnce(url: string, host: string, timeoutMs: number): Promise<RawFetchResult> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const isHttps = u.protocol === "https:";
    const mod = isHttps ? https : http;
    const port = u.port ? Number(u.port) : isHttps ? 443 : 80;

    let settled = false;
    const ok = (status: number, body: string) => {
      if (!settled) { settled = true; resolve({ status, body }); }
    };
    const fail = (e: Error) => {
      if (!settled) { settled = true; reject(e); }
    };

    let body = "";
    let statusCode = 0;

    const req = mod.request(
      {
        host,
        port,
        path: u.pathname + u.search,
        method: "GET",
        headers: {
          Host: u.host,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          Accept: "*/*",
          Connection: "close",
        },
        timeout: timeoutMs,
      },
      (res) => {
        statusCode = res.statusCode ?? 0;
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => { body += chunk; });
        res.on("end", () => ok(statusCode, body));
        // Premature close mid-body: the eastmoney backends do this routinely
        // (full body + immediate RST). Accept whatever JSON we accumulated.
        res.on("close", () => {
          if (!settled) {
            if (body.trim().startsWith("{")) ok(statusCode, body);
            else fail(new Error(`connection closed early (status ${statusCode}, ${body.length} bytes)`));
          }
        });
        res.on("error", (e) => {
          if (!settled) {
            if (body.trim().startsWith("{")) ok(statusCode, body);
            else fail(e);
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (e) => fail(e instanceof Error ? e : new Error(String(e))));
    req.end();
  });
}

/** Try the hostname plus every resolved A record until one yields a body. */
export async function emRawFetch(url: string, timeoutMs = 8000): Promise<RawFetchResult> {
  const u = new URL(url);
  const candidates = [u.hostname];
  for (const ip of await dnsResolve4(u.hostname)) {
    if (!candidates.includes(ip)) candidates.push(ip);
  }
  let lastErr: Error = new Error("no endpoints resolved");
  for (const host of candidates) {
    try {
      return await rawHttpFetchOnce(url, host, timeoutMs);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr;
}

/**
 * Fetch JSON from an EastMoney endpoint with retries and multi-IP fallback.
 * Returns the parsed JSON body, or null when every attempt failed.
 */
export async function emRawJson(
  urls: string | string[],
  attemptsPerUrl = 2,
  timeoutMs = 8000
): Promise<any | null> {
  const list = Array.isArray(urls) ? urls : [urls];
  for (const url of list) {
    for (let attempt = 0; attempt < attemptsPerUrl; attempt++) {
      try {
        const { status, body } = await emRawFetch(url, timeoutMs);
        if (status !== 200) break; // definitive status — don't retry same url
        return JSON.parse(body);
      } catch {
        // instant connection resets are cheap — retry
      }
    }
  }
  return null;
}
