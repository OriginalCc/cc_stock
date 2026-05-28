import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

/**
 * GET /api/stock/market-breadth
 * Fetch A-share market breadth data (涨跌家数) from East Money API
 * Returns up/down/flat stock counts + 2-min interval history for the current trading day
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
}

// ── Persistent 2-min history store (file-based) ──
const DATA_DIR = join(process.cwd(), "db");
const HISTORY_FILE = join(DATA_DIR, "market-breadth-history.json");

interface PersistedHistory {
  date: string;
  points: BreadthHistoryPoint[];
  lastSlot: string;
}

function loadPersistedHistory(): PersistedHistory | null {
  try {
    if (!existsSync(HISTORY_FILE)) return null;
    const raw = readFileSync(HISTORY_FILE, "utf-8");
    const data = JSON.parse(raw) as PersistedHistory;
    // Only return if it's today's data
    const todayStr = getTodayDateStr();
    if (data.date !== todayStr) return null;
    return data;
  } catch {
    return null;
  }
}

function persistHistory(date: string, points: BreadthHistoryPoint[], lastSlot: string) {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    const data: PersistedHistory = { date, points, lastSlot };
    writeFileSync(HISTORY_FILE, JSON.stringify(data), "utf-8");
  } catch (err) {
    console.error("Failed to persist breadth history:", err);
  }
}

// In-memory cache loaded from file on first request
let memoryHistory: { date: string; points: BreadthHistoryPoint[]; lastSlot: string } | null = null;
let historyLoaded = false;

function ensureHistoryLoaded() {
  if (!historyLoaded) {
    memoryHistory = loadPersistedHistory();
    historyLoaded = true;
  }
}

function getCurrent2MinSlot(): string {
  const now = new Date();
  // Use China timezone
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

// Cache: 15s TTL for raw data fetch
let cached: { data: Omit<MarketBreadthData, "history">; ts: number } | null = null;
const CACHE_TTL = 15_000;

export async function GET() {
  // Load persisted history on first request
  ensureHistoryLoaded();

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

  // ── Record history point (2-min interval) ──
  const todayStr = getTodayDateStr();
  const currentSlot = getCurrent2MinSlot();

  // Only record during extended hours (9:00 ~ 15:30) to cover pre/post market
  const slotH = parseInt(currentSlot.slice(0, 2));
  const slotM = parseInt(currentSlot.slice(3, 5));
  const slotVal = slotH * 100 + slotM;  // HHMM format: 9:30 = 930, 11:22 = 1122
  const isRecordableTime = slotVal >= 900 && slotVal <= 1530;

  // Reset history if date changed
  if (memoryHistory && memoryHistory.date !== todayStr) {
    memoryHistory = null;
  }

  // Always record if history is empty (first data point), otherwise only during recordable hours
  const shouldRecord = isRecordableTime || !memoryHistory || memoryHistory.points.length === 0;

  if (shouldRecord && rawData.totalUp + rawData.totalDown > 0) {
    // Initialize history for today if needed
    if (!memoryHistory) {
      memoryHistory = { date: todayStr, points: [], lastSlot: "" };
    }

    const points = memoryHistory.points;

    // Always record/update: new slot → add point, same slot → update with latest data
    const existingIdx = points.findIndex(p => p.time === currentSlot);
    const point: BreadthHistoryPoint = {
      time: currentSlot,
      totalUp: rawData.totalUp,
      totalDown: rawData.totalDown,
      totalFlat: rawData.totalFlat,
      limitUp: rawData.limitUp,
      limitDown: rawData.limitDown,
    };
    if (existingIdx >= 0) {
      points[existingIdx] = point; // Update existing slot with latest data
    } else {
      points.push(point); // New time slot
    }
    memoryHistory.lastSlot = currentSlot;

    // Persist to file after each update
    persistHistory(todayStr, points, currentSlot);
  }

  const result: MarketBreadthData = {
    ...rawData,
    history: memoryHistory?.points || [],
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
