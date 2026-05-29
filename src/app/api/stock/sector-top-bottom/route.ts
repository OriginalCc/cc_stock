import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/stock/sector-top-bottom
 * Fetches industry sectors and concept sectors from EastMoney,
 * returns top 5 gainers and top 5 losers for each category.
 * Lightweight endpoint for the sector ranking card.
 */

// ── Types ──

interface SectorRankItem {
  code: string;
  name: string;
  changePercent: number;
  mainNetInflow: number;      // 元
  stocksUp: number;
  stocksDown: number;
  leadingStock: string;
  leadingStockChange: number;
}

interface SectorTopBottomResponse {
  success: boolean;
  timestamp: string;
  industry: {
    top5: SectorRankItem[];
    bottom5: SectorRankItem[];
  };
  concept: {
    top5: SectorRankItem[];
    bottom5: SectorRankItem[];
  };
}

// ── EastMoney API ──

const EM_BASE = "https://push2delay.eastmoney.com";
const SECTOR_FIELDS = "f2,f3,f12,f14,f62,f104,f105,f128,f140,f141";

async function fetchSectors(fs: string, pageSize: number = 100): Promise<any[]> {
  const url = `${EM_BASE}/api/qt/clist/get?pn=1&pz=${pageSize}&po=1&np=1&fltt=2&invt=2&fid=f3&fs=${fs}&fields=${SECTOR_FIELDS}`;
  try {
    const resp = await fetch(url, {
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(10000),
      headers: {
        "Referer": "https://quote.eastmoney.com/",
        "User-Agent": "Mozilla/5.0",
      },
    });
    if (!resp.ok) {
      console.error(`fetchSectors ${fs} returned status ${resp.status}`);
      return [];
    }
    const data = await resp.json();
    const diff = data?.data?.diff;
    if (!Array.isArray(diff)) {
      console.error(`fetchSectors ${fs} no diff array, response keys:`, Object.keys(data || {}));
      return [];
    }
    return diff;
  } catch (e) {
    console.error(`fetchSectors ${fs} error:`, e);
    return [];
  }
}

// ── Parse ──

function parseSectorRankItem(item: any): SectorRankItem {
  return {
    code: String(item.f12 || ""),
    name: String(item.f14 || ""),
    changePercent: parseFloat(item.f3) || 0,
    mainNetInflow: parseFloat(item.f62) || 0,
    stocksUp: parseInt(item.f104) || 0,
    stocksDown: parseInt(item.f105) || 0,
    leadingStock: String(item.f128 || item.f140 || ""),
    leadingStockChange: parseFloat(item.f141) || 0,
  };
}

// ── Cache ──

let cached: { data: SectorTopBottomResponse; ts: number } | null = null;
const CACHE_TTL = 30_000; // 30s during trading

// In-memory flag to prevent stale empty data from being cached permanently
let lastFetchHadIndustry = false;

// ── Route Handler ──

export async function GET() {
  const needsFetch = !cached || Date.now() - cached.ts >= CACHE_TTL;

  if (needsFetch) {
    try {
      // Fetch industry + concept sectors in parallel
      // po=1 sorts by f3 (changePercent) descending — top gainers first
      const [industryRaw, conceptRaw] = await Promise.all([
        fetchSectors("m:90+t:2", 100),
        fetchSectors("m:90+t:3", 100),
      ]);

      console.log(`sector-top-bottom: industry=${industryRaw.length}, concept=${conceptRaw.length}`);

      const industrySectors = industryRaw.map(parseSectorRankItem);
      const conceptSectors = conceptRaw.map(parseSectorRankItem);

      // If industry data is empty but we had it before, use stale data
      if (industrySectors.length === 0 && lastFetchHadIndustry && cached) {
        // Keep stale industry data from cache
        const staleIndustry = cached.data.industry;
        const conceptTop5 = conceptSectors.slice(0, 5);
        const conceptBottom5 = [...conceptSectors].reverse().slice(0, 5);

        const result: SectorTopBottomResponse = {
          success: true,
          timestamp: new Date().toISOString(),
          industry: staleIndustry,
          concept: { top5: conceptTop5, bottom5: conceptBottom5 },
        };
        cached = { data: result, ts: Date.now() };
      } else {
        // Top 5 gainers (already sorted desc by changePercent from API)
        // Bottom 5 losers (take last 5 from the desc-sorted array)
        const industryTop5 = industrySectors.slice(0, 5);
        const industryBottom5 = [...industrySectors].reverse().slice(0, 5);
        const conceptTop5 = conceptSectors.slice(0, 5);
        const conceptBottom5 = [...conceptSectors].reverse().slice(0, 5);

        const result: SectorTopBottomResponse = {
          success: true,
          timestamp: new Date().toISOString(),
          industry: { top5: industryTop5, bottom5: industryBottom5 },
          concept: { top5: conceptTop5, bottom5: conceptBottom5 },
        };

        if (industrySectors.length > 0) lastFetchHadIndustry = true;
        cached = { data: result, ts: Date.now() };
      }
    } catch (err) {
      console.error("sector-top-bottom error:", err);
      if (cached) {
        // Return stale cache on error
      } else {
        return NextResponse.json(
          { success: false, error: "Failed to fetch sector data" },
          { status: 500 }
        );
      }
    }
  }

  return NextResponse.json(cached!.data, {
    headers: { 'Cache-Control': 'public, max-age=15, s-maxage=15' },
  });
}
