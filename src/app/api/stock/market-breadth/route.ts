import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/stock/market-breadth
 * Fetch A-share market breadth data (涨跌家数) from East Money API
 * Returns up/down/flat stock counts + 2-min interval history for the current trading day
 * 
 * Persistence: saves every 2-min snapshot to SQLite (MarketBreadthSnapshot)
 * Fallback: if live API fails, loads today's history from database
 */

export interface BreadthHistoryPoint {
  time: string;     // "09:30", "09:32", ...
  totalUp: number;
  totalDown: number;
  totalFlat: number;
  limitUp: number;
  limitDown: number;
}

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
  limitUp: number;
  limitDown: number;
  timestamp: number;
  history: BreadthHistoryPoint[];
  fromCache?: boolean; // true if data loaded from DB fallback
}

function getCurrent2MinSlot(): string {
  const now = new Date();
  const h = (now.getUTCHours() + 8) % 24;
  const m = now.getUTCMinutes();
  const slotMin = Math.floor(m / 2) * 2;
  return `${String(h).padStart(2, "0")}:${String(slotMin).padStart(2, "0")}`;
}

function getTodayDateStr(): string {
  const now = new Date();
  const utcNow = now.getTime();
  const chinaOffset = 8 * 60 * 60 * 1000;
  const d = new Date(utcNow + chinaOffset);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// In-memory cache: 15s TTL for raw data fetch
let cached: { data: Omit<MarketBreadthData, "history">; ts: number } | null = null;
const CACHE_TTL = 15_000;

// ── Database helpers ──

async function saveSnapshotToDb(date: string, time: string, data: Omit<MarketBreadthData, "history">) {
  try {
    await db.marketBreadthSnapshot.upsert({
      where: { date_time: { date, time } },
      create: {
        date,
        time,
        shUp: data.shUp,
        shDown: data.shDown,
        shFlat: data.shFlat,
        szUp: data.szUp,
        szDown: data.szDown,
        szFlat: data.szFlat,
        totalUp: data.totalUp,
        totalDown: data.totalDown,
        totalFlat: data.totalFlat,
        limitUp: data.limitUp,
        limitDown: data.limitDown,
      },
      update: {
        shUp: data.shUp,
        shDown: data.shDown,
        shFlat: data.shFlat,
        szUp: data.szUp,
        szDown: data.szDown,
        szFlat: data.szFlat,
        totalUp: data.totalUp,
        totalDown: data.totalDown,
        totalFlat: data.totalFlat,
        limitUp: data.limitUp,
        limitDown: data.limitDown,
      },
    });
  } catch (err) {
    console.error("Failed to save breadth snapshot to DB:", err);
  }
}

async function loadHistoryFromDb(date: string): Promise<BreadthHistoryPoint[]> {
  try {
    const rows = await db.marketBreadthSnapshot.findMany({
      where: { date },
      orderBy: { time: "asc" },
    });
    return rows.map(r => ({
      time: r.time,
      totalUp: r.totalUp,
      totalDown: r.totalDown,
      totalFlat: r.totalFlat,
      limitUp: r.limitUp,
      limitDown: r.limitDown,
    }));
  } catch (err) {
    console.error("Failed to load breadth history from DB:", err);
    return [];
  }
}

async function loadLatestFromDb(date: string): Promise<Omit<MarketBreadthData, "history"> | null> {
  try {
    const row = await db.marketBreadthSnapshot.findFirst({
      where: { date },
      orderBy: { time: "desc" },
    });
    if (!row) return null;
    return {
      shUp: row.shUp,
      shDown: row.shDown,
      shFlat: row.shFlat,
      szUp: row.szUp,
      szDown: row.szDown,
      szFlat: row.szFlat,
      totalUp: row.totalUp,
      totalDown: row.totalDown,
      totalFlat: row.totalFlat,
      limitUp: row.limitUp,
      limitDown: row.limitDown,
      timestamp: Date.now(),
    };
  } catch (err) {
    console.error("Failed to load latest breadth from DB:", err);
    return null;
  }
}

export async function GET() {
  const todayStr = getTodayDateStr();
  const currentSlot = getCurrent2MinSlot();

  // Only record during extended hours (9:00 ~ 15:30) to cover pre/post market
  const slotH = parseInt(currentSlot.slice(0, 2));
  const slotM = parseInt(currentSlot.slice(3, 5));
  const slotVal = slotH * 100 + slotM;
  const isRecordableTime = slotVal >= 900 && slotVal <= 1530;

  // Determine if we need to re-fetch from live API
  const needsFetch = !cached || Date.now() - cached.ts >= CACHE_TTL;

  let rawData: Omit<MarketBreadthData, "history">;
  let fromCache = false;

  if (needsFetch) {
    try {
      rawData = await fetchMarketBreadth();
      cached = { data: rawData, ts: Date.now() };

      // ── Save snapshot to database (await to ensure persistence) ──
      if (isRecordableTime && rawData.totalUp + rawData.totalDown > 0) {
        await saveSnapshotToDb(todayStr, currentSlot, rawData);
      }
    } catch (err) {
      console.error("market-breadth live fetch error:", err);
      // ── Fallback: try database ──
      if (cached) {
        rawData = cached.data;
      } else {
        const dbData = await loadLatestFromDb(todayStr);
        if (dbData) {
          rawData = dbData;
          fromCache = true;
        } else {
          return NextResponse.json({ error: "Failed to fetch market breadth and no cached data available" }, { status: 500 });
        }
      }
    }
  } else {
    rawData = cached!.data;
  }

  // ── Load history from database (always, for consistency) ──
  const history = await loadHistoryFromDb(todayStr);

  // If current slot data is newer than the last history point, add it
  const lastHistoryTime = history.length > 0 ? history[history.length - 1].time : "";
  if (rawData.totalUp + rawData.totalDown > 0 && currentSlot > lastHistoryTime && isRecordableTime) {
    // Ensure current data is in the history
    const currentPoint: BreadthHistoryPoint = {
      time: currentSlot,
      totalUp: rawData.totalUp,
      totalDown: rawData.totalDown,
      totalFlat: rawData.totalFlat,
      limitUp: rawData.limitUp,
      limitDown: rawData.limitDown,
    };
    if (history.length === 0 || history[history.length - 1].time !== currentSlot) {
      history.push(currentPoint);
    } else {
      history[history.length - 1] = currentPoint;
    }
    // Also ensure it's saved to DB (await)
    await saveSnapshotToDb(todayStr, currentSlot, rawData);
  }

  const result: MarketBreadthData = {
    ...rawData,
    history,
    fromCache,
  };

  return NextResponse.json(result);
}

async function fetchMarketBreadth(): Promise<Omit<MarketBreadthData, "history">> {
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
