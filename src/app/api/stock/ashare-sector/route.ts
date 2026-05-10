import { NextRequest, NextResponse } from "next/server";
import { getStockSector, getSectorTimeline } from "@/lib/ashare-api";

// Server-side cache for sector data (reduce external API calls)
const sectorCache = new Map<string, { data: any; timestamp: number }>();
const SECTOR_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Track recent failures to avoid hammering a broken API
let lastSectorError = 0;
const SECTOR_ERROR_COOLDOWN = 60000; // 1 min cooldown after failure

/**
 * GET /api/stock/ashare-sector?symbol=600519&type=info
 *   → Returns sector info for the stock
 *
 * GET /api/stock/ashare-sector?sectorCode=BK0896&type=timeline
 *   → Returns sector intraday timeline data
 *
 * GET /api/stock/ashare-sector?symbol=600519&type=full
 *   → Returns both sector info + timeline data
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol") || "";
  const sectorCode = searchParams.get("sectorCode") || "";
  const type = searchParams.get("type") || "info";

  // Check cache first
  const cacheKey = `${symbol}|${sectorCode}|${type}`;
  const cached = sectorCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < SECTOR_CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  // If sector API recently failed, return fallback immediately to avoid blocking server
  if (Date.now() - lastSectorError < SECTOR_ERROR_COOLDOWN) {
    return NextResponse.json({
      success: false,
      error: "Sector API temporarily unavailable",
      sectorInfo: null,
      data: null,
    });
  }

  try {
    if (type === "timeline" && sectorCode) {
      const timelineData = await getSectorTimeline(sectorCode);
      const result = { success: true, sectorCode, data: timelineData };
      sectorCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return NextResponse.json(result);
    }

    if (!symbol) {
      return NextResponse.json(
        { success: false, error: "symbol parameter is required" },
        { status: 400 }
      );
    }

    // Get sector info for the stock
    const sectorInfo = await getStockSector(symbol);

    if (!sectorInfo) {
      return NextResponse.json({
        success: true,
        symbol,
        sectorInfo: null,
        data: null,
      });
    }

    if (type === "info") {
      const result = { success: true, symbol, sectorInfo };
      sectorCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return NextResponse.json(result);
    }

    // type === "full": also fetch timeline
    const timelineData = await getSectorTimeline(sectorInfo.code);
    const result = { success: true, symbol, sectorInfo, data: timelineData };
    sectorCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Sector API error:", error);
    lastSectorError = Date.now();
    return NextResponse.json(
      { success: false, error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}
