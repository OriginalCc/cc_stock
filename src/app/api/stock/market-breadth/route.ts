import { NextResponse } from "next/server";

/**
 * GET /api/stock/market-breadth
 * Fetch A-share market breadth data (涨跌家数) from East Money API
 * Returns up/down/flat stock counts + 5-min interval history for the current trading day
 */

export interface BreadthHistoryPoint {
  time: string;     // "09:30", "09:35", ...
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
}

// ── In-memory 5-min history cache ──
// Key: date string "2025-01-15", Value: sorted array of BreadthHistoryPoint
const historyStore: Map<string, BreadthHistoryPoint[]> = new Map();
let lastHistoryTime = "";  // Last 5-min slot recorded, e.g. "09:35"

function getCurrent5MinSlot(): string {
  const now = new Date();
  // Use China timezone
  const h = (now.getUTCHours() + 8) % 24;
  const m = now.getUTCMinutes();
  const slotMin = Math.floor(m / 5) * 5;
  return `${String(h).padStart(2, "0")}:${String(slotMin).padStart(2, "0")}`;
}

function getTodayDateStr(): string {
  const now = new Date();
  const h = (now.getUTCHours() + 8) % 24;
  const utcNow = now.getTime();
  const chinaOffset = 8 * 60 * 60 * 1000;
  const chinaTime = new Date(utcNow + chinaOffset);
  // Adjust if UTC+8 pushes to next day
  const d = new Date(utcNow + chinaOffset);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// Cache: 15s TTL for raw data fetch
let cached: { data: Omit<MarketBreadthData, "history">; ts: number } | null = null;
const CACHE_TTL = 15_000;

export async function GET() {
  // Determine if we need to re-fetch
  const needsFetch = !cached || Date.now() - cached.ts >= CACHE_TTL;

  let rawData: Omit<MarketBreadthData, "history">;

  if (needsFetch) {
    try {
      rawData = await fetchMarketBreadth();
      cached = { data: rawData, ts: Date.now() };
    } catch (err) {
      console.error("market-breadth error:", err);
      if (cached) {
        rawData = cached.data;
      } else {
        return NextResponse.json({ error: "Failed to fetch market breadth" }, { status: 500 });
      }
    }
  } else {
    rawData = cached!.data;
  }

  // ── Record history point (5-min interval) ──
  const todayStr = getTodayDateStr();
  const currentSlot = getCurrent5MinSlot();

  // Only record during trading hours (9:25 ~ 15:05)
  const slotH = parseInt(currentSlot.slice(0, 2));
  const slotM = parseInt(currentSlot.slice(3, 5));
  const slotVal = slotH * 60 + slotM;
  const isTradingTime = (slotVal >= 925 && slotVal <= 1135) || (slotVal >= 1300 && slotVal <= 1505);

  if (isTradingTime && currentSlot !== lastHistoryTime) {
    const history = historyStore.get(todayStr) || [];
    // Check if this slot already exists (avoid duplicates)
    const existingIdx = history.findIndex(p => p.time === currentSlot);
    const point: BreadthHistoryPoint = {
      time: currentSlot,
      totalUp: rawData.totalUp,
      totalDown: rawData.totalDown,
      totalFlat: rawData.totalFlat,
      limitUp: rawData.limitUp,
      limitDown: rawData.limitDown,
    };
    if (existingIdx >= 0) {
      history[existingIdx] = point; // Update existing
    } else {
      history.push(point);
    }
    historyStore.set(todayStr, history);
    lastHistoryTime = currentSlot;
  }

  // Clean up old dates (keep only today)
  for (const key of historyStore.keys()) {
    if (key !== todayStr) historyStore.delete(key);
  }

  const result: MarketBreadthData = {
    ...rawData,
    history: historyStore.get(todayStr) || [],
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
