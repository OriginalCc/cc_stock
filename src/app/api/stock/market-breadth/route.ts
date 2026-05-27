import { NextResponse } from "next/server";

/**
 * GET /api/stock/market-breadth
 * Fetch A-share market breadth data (涨跌家数) from East Money API
 * Returns up/down/flat stock counts for Shanghai, Shenzhen, and total market
 */

export interface MarketBreadthData {
  shUp: number;
  shDown: number;
  shFlat: number;
  szUp: number;
  szDown: number;
  szFlat: number;
  totalUp: number;
  totalDown: number;
  totalFlat: number;
  limitUp: number;    // 涨停数
  limitDown: number;  // 跌停数
  timestamp: number;
}

// Cache: 15s TTL
let cached: { data: MarketBreadthData; ts: number } | null = null;
const CACHE_TTL = 15_000;

export async function GET() {
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    const data = await fetchMarketBreadth();
    cached = { data, ts: Date.now() };
    return NextResponse.json(data);
  } catch (err) {
    console.error("market-breadth error:", err);
    // Return stale cache if available
    if (cached) return NextResponse.json(cached.data);
    return NextResponse.json({ error: "Failed to fetch market breadth" }, { status: 500 });
  }
}

async function fetchMarketBreadth(): Promise<MarketBreadthData> {
  // Use East Money real-time market breadth API
  // f104 = 上涨家数, f105 = 下跌家数, f106 = 平盘家数
  // f13 = market ID: 1=SH(1.000001), 0=SZ(0.399001)
  const url = "https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f1,f2,f3,f4,f6,f12,f13,f14,f104,f105,f106&secids=1.000001,0.399001";

  const res = await fetch(url, {
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(8000),
    headers: {
      "Referer": "https://quote.eastmoney.com/",
      "User-Agent": "Mozilla/5.0",
    },
  });

  if (!res.ok) throw new Error(`East Money API returned ${res.status}`);

  const json = await res.json();
  const items = json?.data?.diff;
  if (!items || !Array.isArray(items)) throw new Error("Invalid response format");

  let shUp = 0, shDown = 0, shFlat = 0;
  let szUp = 0, szDown = 0, szFlat = 0;

  for (const item of items) {
    const market = item.f13;
    const up = item.f104 ?? 0;
    const down = item.f105 ?? 0;
    const flat = item.f106 ?? 0;

    if (market === 1) {
      shUp = up;
      shDown = down;
      shFlat = flat;
    } else if (market === 0) {
      szUp = up;
      szDown = down;
      szFlat = flat;
    }
  }

  // Fetch limit up/down counts (non-critical, best-effort)
  let limitUp = 0;
  let limitDown = 0;
  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  try {
    const limitUpRes = await fetch(
      `https://push2ex.eastmoney.com/getTopicZTPool?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt&Ession=127733522&date=${todayStr}`,
      {
        next: { revalidate: 0 },
        signal: AbortSignal.timeout(5000),
        headers: { "Referer": "https://data.eastmoney.com/", "User-Agent": "Mozilla/5.0" },
      }
    );
    if (limitUpRes.ok) {
      const limitUpJson = await limitUpRes.json();
      if (limitUpJson?.data?.pool) {
        limitUp = limitUpJson.data.pool.length;
      }
    }
  } catch {
    // Non-critical
  }

  try {
    const limitDownRes = await fetch(
      `https://push2ex.eastmoney.com/getTopicDTPool?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt&Ession=127733522&date=${todayStr}`,
      {
        next: { revalidate: 0 },
        signal: AbortSignal.timeout(5000),
        headers: { "Referer": "https://data.eastmoney.com/", "User-Agent": "Mozilla/5.0" },
      }
    );
    if (limitDownRes.ok) {
      const limitDownJson = await limitDownRes.json();
      if (limitDownJson?.data?.pool) {
        limitDown = limitDownJson.data.pool.length;
      }
    }
  } catch {
    // Non-critical
  }

  return {
    shUp,
    shDown,
    shFlat,
    szUp,
    szDown,
    szFlat,
    totalUp: shUp + szUp,
    totalDown: shDown + szDown,
    totalFlat: shFlat + szFlat,
    limitUp,
    limitDown,
    timestamp: Date.now(),
  };
}
