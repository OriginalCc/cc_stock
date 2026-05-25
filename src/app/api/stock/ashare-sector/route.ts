import { NextRequest, NextResponse } from "next/server";
import { getStockSector, getSectorTimeline } from "@/lib/ashare-api";
import { fetchGuarded } from "@/lib/fetch-guard";

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
 *
 * NOTE: Removed the error cooldown mechanism that was previously blocking
 * legitimate retry requests. The fetchGuarded cache + per-request timeout
 * is sufficient to prevent API hammering.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol") || "";
  const sectorCode = searchParams.get("sectorCode") || "";
  const type = searchParams.get("type") || "info";

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
    // Use shorter TTL (60s) to avoid caching null results for too long
    // when EastMoney API is temporarily unavailable
    const sectorInfo = await fetchGuarded(
      `sector-info:${symbol}`,
      async () => getStockSector(symbol),
      60000 // 1 min TTL (was 5min, reduced to retry faster on API failures)
    );

    if (!sectorInfo) {
      // Stock has no sector mapping — return success with null data
      // (Don't treat this as an error; the stock simply doesn't have sector data)
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

    // type === "full": also fetch timeline
    const timelineData = await fetchGuarded(
      `sector-timeline:${sectorInfo.code}`,
      async () => getSectorTimeline(sectorInfo.code),
      cacheTTL
    );
    const result = { success: true, symbol, sectorInfo, data: timelineData };
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Sector API error:", error);
    // Return a structured error response — the frontend will simply
    // keep showing stale data and retry on the next 30s cycle
    return NextResponse.json(
      { success: false, error: error.message || "Unknown error", sectorInfo: null, data: null },
      { status: 500 }
    );
  }
}
