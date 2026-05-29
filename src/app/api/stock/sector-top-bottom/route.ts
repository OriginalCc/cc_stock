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
const FETCH_HEADERS = {
  "Referer": "https://quote.eastmoney.com/",
  "User-Agent": "Mozilla/5.0",
};

/**
 * Fetch top N gainers (po=1, desc) and top N losers (po=0, asc) for a sector type.
 * This avoids needing to paginate through all sectors — just grab top/bottom 5 directly.
 */
async function fetchSectorTopBottom(fs: string, n: number = 5): Promise<{ topN: any[]; bottomN: any[] }> {
  // po=1 sorts f3 descending (top gainers first)
  // po=0 sorts f3 ascending (top losers first)
  const [topRes, bottomRes] = await Promise.all([
    fetch(`${EM_BASE}/api/qt/clist/get?pn=1&pz=${n}&po=1&np=1&fltt=2&invt=2&fid=f3&fs=${fs}&fields=${SECTOR_FIELDS}`, {
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(10000),
      headers: FETCH_HEADERS,
    }),
    fetch(`${EM_BASE}/api/qt/clist/get?pn=1&pz=${n}&po=0&np=1&fltt=2&invt=2&fid=f3&fs=${fs}&fields=${SECTOR_FIELDS}`, {
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(10000),
      headers: FETCH_HEADERS,
    }),
  ]);

  const parseDiff = async (res: Response): Promise<any[]> => {
    if (!res.ok) return [];
    try {
      const data = await res.json();
      const diff = data?.data?.diff;
      return Array.isArray(diff) ? diff : [];
    } catch {
      return [];
    }
  };

  const [topDiff, bottomDiff] = await Promise.all([parseDiff(topRes), parseDiff(bottomRes)]);
  return { topN: topDiff, bottomN: bottomDiff };
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

// ── Route Handler ──

export async function GET() {
  const needsFetch = !cached || Date.now() - cached.ts >= CACHE_TTL;

  if (needsFetch) {
    try {
      // Fetch industry + concept sectors top/bottom 5 in parallel (4 requests total)
      const [industryResult, conceptResult] = await Promise.all([
        fetchSectorTopBottom("m:90+t:2", 5),
        fetchSectorTopBottom("m:90+t:3", 5),
      ]);

      const industryTop5 = industryResult.topN.map(parseSectorRankItem);
      const industryBottom5 = industryResult.bottomN.map(parseSectorRankItem);
      const conceptTop5 = conceptResult.topN.map(parseSectorRankItem);
      const conceptBottom5 = conceptResult.bottomN.map(parseSectorRankItem);

      const result: SectorTopBottomResponse = {
        success: true,
        timestamp: new Date().toISOString(),
        industry: { top5: industryTop5, bottom5: industryBottom5 },
        concept: { top5: conceptTop5, bottom5: conceptBottom5 },
      };

      cached = { data: result, ts: Date.now() };
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
