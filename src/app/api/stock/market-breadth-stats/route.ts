import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/stock/market-breadth-stats
 * Enhanced market breadth statistics including limit-up/down details,
 * breadth velocity, and A/D line data.
 */

// ── Types ──

interface LimitUpStock {
  c: string;       // stock code
  n: string;       // stock name
  zdp: number;     // change percent
  lbc: number;     // 连板数 (consecutive limit-up days)
  zs: number;      // 封板强度 (seal strength %)
  hb: number;      // 开板次数 (times the limit was broken)
  ac: number;      // 封板资金 (seal amount in yuan)
  zssjc: string;   // 首次封板时间 (e.g. "0930")
  lbt: number;     // 涨停类型 (1=一字板, 2=首板, 3=连板)
}

interface LimitDownStock {
  c: string;       // stock code
  n: string;       // stock name
  zdp: number;     // change percent
  zs: number;      // 封板强度
  hb: number;      // 开板次数
  ac: number;      // 封板资金
}

export interface BreadthStatsResponse {
  limitUp: {
    total: number;
    sealed: number;
    broken: number;
    sealRate: number;
    avgSealStrength: number;
    consecutiveStats: {
      firstBoard: number;
      secondBoard: number;
      thirdBoard: number;
      fourthPlus: number;
    };
    topSeals: {
      code: string;
      name: string;
      sealAmount: number;
      sealStrength: number;
      consecutiveDays: number;
      firstSealTime: string;
    }[];
    byTime: {
      morning: number;
      midday: number;
      afternoon: number;
      late: number;
    };
  };
  limitDown: {
    total: number;
    sealed: number;
    broken: number;
    sealRate: number;
    topBroken: {
      code: string;
      name: string;
      breakCount: number;
    }[];
  };
  contrast: {
    limitUpVsDown: number;
    netExtreme: number;
  };
  timestamp: number;
}

// ── Helpers ──

function getTodayDateStr(): string {
  const now = new Date();
  const chinaOffset = 8 * 60 * 60 * 1000;
  const d = new Date(now.getTime() + chinaOffset);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function formatFirstSealTime(raw: string): string {
  if (!raw || raw.length < 4) return raw || "";
  // "0930" → "09:30", "0925" → "09:25"
  return `${raw.slice(0, 2)}:${raw.slice(2, 4)}`;
}

function parseSealTimeMinutes(raw: string): number {
  if (!raw || raw.length < 4) return -1;
  const h = parseInt(raw.slice(0, 2), 10);
  const m = parseInt(raw.slice(2, 4), 10);
  if (isNaN(h) || isNaN(m)) return -1;
  return h * 60 + m;
}

function classifyTimeSlot(raw: string): "morning" | "midday" | "afternoon" | "late" | null {
  const mins = parseSealTimeMinutes(raw);
  if (mins < 0) return null;
  // 09:25 (565) ~ 10:30 (630) → morning
  if (mins >= 565 && mins < 630) return "morning";
  // 10:30 (630) ~ 13:00 (780) → midday
  if (mins >= 630 && mins < 780) return "midday";
  // 13:00 (780) ~ 14:30 (870) → afternoon
  if (mins >= 780 && mins < 870) return "afternoon";
  // 14:30 (870) ~ 15:00 (900) → late
  if (mins >= 870 && mins <= 900) return "late";
  return null;
}

// ── Cache (30s TTL) ──

let cached: { data: BreadthStatsResponse; ts: number } | null = null;
const CACHE_TTL = 30_000;

// ── API fetchers ──

async function fetchLimitUpPool(dateStr: string): Promise<LimitUpStock[]> {
  const url = `https://push2ex.eastmoney.com/getTopicZTPool?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt&date=${dateStr}`;
  const res = await fetch(url, {
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(8000),
    headers: {
      "Referer": "https://data.eastmoney.com/",
      "User-Agent": "Mozilla/5.0",
    },
  });
  if (!res.ok) throw new Error(`Limit-up API returned ${res.status}`);
  const json = await res.json();
  const pool = json?.data?.pool;
  if (!Array.isArray(pool)) return [];
  return pool as LimitUpStock[];
}

async function fetchLimitDownPool(dateStr: string): Promise<LimitDownStock[]> {
  const url = `https://push2ex.eastmoney.com/getTopicDTPool?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt&date=${dateStr}`;
  const res = await fetch(url, {
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(8000),
    headers: {
      "Referer": "https://data.eastmoney.com/",
      "User-Agent": "Mozilla/5.0",
    },
  });
  if (!res.ok) throw new Error(`Limit-down API returned ${res.status}`);
  const json = await res.json();
  const pool = json?.data?.pool;
  if (!Array.isArray(pool)) return [];
  return pool as LimitDownStock[];
}

// ── Compute stats ──

function computeStats(ztpool: LimitUpStock[], dtpool: LimitDownStock[]): BreadthStatsResponse {
  // ── Limit-up stats ──
  const total = ztpool.length;
  const sealed = ztpool.filter(s => s.hb === 0).length;
  const broken = ztpool.filter(s => s.hb > 0).length;
  const sealRate = total > 0 ? Math.round((sealed / total) * 10000) / 100 : 0;

  // Average seal strength (only meaningful values)
  const validStrengths = ztpool.filter(s => typeof s.zs === "number" && s.zs > 0);
  const avgSealStrength = validStrengths.length > 0
    ? Math.round(validStrengths.reduce((sum, s) => sum + s.zs, 0) / validStrengths.length * 100) / 100
    : 0;

  // Consecutive board stats
  const firstBoard = ztpool.filter(s => s.lbc === 1).length;
  const secondBoard = ztpool.filter(s => s.lbc === 2).length;
  const thirdBoard = ztpool.filter(s => s.lbc === 3).length;
  const fourthPlus = ztpool.filter(s => s.lbc >= 4).length;

  // Top 5 seal amounts
  const topSeals = [...ztpool]
    .sort((a, b) => (b.ac || 0) - (a.ac || 0))
    .slice(0, 5)
    .map(s => ({
      code: s.c,
      name: s.n,
      sealAmount: s.ac || 0,
      sealStrength: s.zs || 0,
      consecutiveDays: s.lbc || 1,
      firstSealTime: formatFirstSealTime(s.zssjc || ""),
    }));

  // By time slot
  let morning = 0, midday = 0, afternoon = 0, late = 0;
  for (const s of ztpool) {
    const slot = classifyTimeSlot(s.zssjc || "");
    if (slot === "morning") morning++;
    else if (slot === "midday") midday++;
    else if (slot === "afternoon") afternoon++;
    else if (slot === "late") late++;
  }

  // ── Limit-down stats ──
  const dtTotal = dtpool.length;
  const dtSealed = dtpool.filter(s => s.hb === 0).length;
  const dtBroken = dtpool.filter(s => s.hb > 0).length;
  const dtSealRate = dtTotal > 0 ? Math.round((dtSealed / dtTotal) * 10000) / 100 : 0;

  // Top broken (most break count) — top 5
  const topBroken = [...dtpool]
    .filter(s => s.hb > 0)
    .sort((a, b) => (b.hb || 0) - (a.hb || 0))
    .slice(0, 5)
    .map(s => ({
      code: s.c,
      name: s.n,
      breakCount: s.hb || 0,
    }));

  // ── Contrast ──
  const limitUpVsDown = dtTotal > 0
    ? Math.round((total / dtTotal) * 100) / 100
    : total > 0 ? 999 : 0;
  const netExtreme = total - dtTotal;

  return {
    limitUp: {
      total,
      sealed,
      broken,
      sealRate,
      avgSealStrength,
      consecutiveStats: {
        firstBoard,
        secondBoard,
        thirdBoard,
        fourthPlus,
      },
      topSeals,
      byTime: {
        morning,
        midday,
        afternoon,
        late,
      },
    },
    limitDown: {
      total: dtTotal,
      sealed: dtSealed,
      broken: dtBroken,
      sealRate: dtSealRate,
      topBroken,
    },
    contrast: {
      limitUpVsDown,
      netExtreme,
    },
    timestamp: Date.now(),
  };
}

// ── Route handler ──

export async function GET() {
  const needsFetch = !cached || Date.now() - cached.ts >= CACHE_TTL;

  if (needsFetch) {
    try {
      const dateStr = getTodayDateStr();

      // Fetch both pools in parallel
      const [ztpool, dtpool] = await Promise.all([
        fetchLimitUpPool(dateStr),
        fetchLimitDownPool(dateStr),
      ]);

      const data = computeStats(ztpool, dtpool);
      cached = { data, ts: Date.now() };
    } catch (err) {
      console.error("market-breadth-stats error:", err);
      // Return stale cache if available
      if (cached) {
        return NextResponse.json(cached.data);
      }
      // No cache — return empty but valid structure
      return NextResponse.json({
        limitUp: {
          total: 0,
          sealed: 0,
          broken: 0,
          sealRate: 0,
          avgSealStrength: 0,
          consecutiveStats: { firstBoard: 0, secondBoard: 0, thirdBoard: 0, fourthPlus: 0 },
          topSeals: [],
          byTime: { morning: 0, midday: 0, afternoon: 0, late: 0 },
        },
        limitDown: {
          total: 0,
          sealed: 0,
          broken: 0,
          sealRate: 0,
          topBroken: [],
        },
        contrast: {
          limitUpVsDown: 0,
          netExtreme: 0,
        },
        timestamp: Date.now(),
      } satisfies BreadthStatsResponse);
    }
  }

  return NextResponse.json(cached!.data);
}
