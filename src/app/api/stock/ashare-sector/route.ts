import { NextRequest, NextResponse } from "next/server";
import { getStockSector, getSectorTimeline } from "@/lib/ashare-api";
import { fetchGuarded } from "@/lib/fetch-guard";

// Track recent failures to avoid hammering a broken API
let lastSectorError = 0;
const SECTOR_ERROR_COOLDOWN = 60000; // 1 min cooldown after failure

// Trading-hour-aware TTL for sector timeline data
function getSectorCacheTTL(): number {
  const now = new Date();
  const chinaHour = (now.getUTCHours() + 8) % 24;
  const chinaMinute = now.getUTCMinutes();
  const isWeekday = now.getUTCDay() >= 1 && now.getUTCDay() <= 5;
  if (!isWeekday) return 300000;
  const isTrading = ((chinaHour === 9 && chinaMinute >= 25) || chinaHour === 10 || (chinaHour === 11 && chinaMinute <= 35)) ||
    (chinaHour === 13 || chinaHour === 14 || (chinaHour === 15 && chinaMinute <= 5));
  return isTrading ? 30000 : 300000; // 30s during trading, 5min otherwise
}

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

  // If sector API recently failed, return fallback immediately to avoid blocking server
  if (Date.now() - lastSectorError < SECTOR_ERROR_COOLDOWN) {
    return NextResponse.json({
      success: false,
      error: "Sector API temporarily unavailable",
      sectorInfo: null,
      data: null,
    });
  }

  const cacheTTL = getSectorCacheTTL();

  try {
    if (type === "timeline" && sectorCode) {
      const timelineData = await fetchGuarded(
        `sector-timeline:${sectorCode}`,
        async () => getSectorTimeline(sectorCode),
        cacheTTL
      );
      const result = { success: true, sectorCode, data: timelineData };
      return NextResponse.json(result);
    }

    if (!symbol) {
      return NextResponse.json(
        { success: false, error: "symbol parameter is required" },
        { status: 400 }
      );
    }

    // Get sector info for the stock
    const sectorInfo = await fetchGuarded(
      `sector-info:${symbol}`,
      async () => getStockSector(symbol),
      300000 // Sector info rarely changes, cache for 5 min
    );

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
      return NextResponse.json(result);
    }

    // type === "full": also fetch timeline in parallel
    const timelineData = await fetchGuarded(
      `sector-timeline:${sectorInfo.code}`,
      async () => getSectorTimeline(sectorInfo.code),
      cacheTTL
    );
    const result = { success: true, symbol, sectorInfo, data: timelineData };
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
