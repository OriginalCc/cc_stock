import { NextRequest, NextResponse } from "next/server";
import { getStockSector, getSectorTimeline } from "@/lib/ashare-api";
import { fetchGuarded } from "@/lib/fetch-guard";

// Track recent failures per-key (not global) to avoid blocking ALL stocks
const sectorErrors = new Map<string, number>();
const SECTOR_ERROR_COOLDOWN = 5000; // Reduced from 10s to 5s — shorter cooldown allows faster recovery

// Cleanup old error entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of sectorErrors) {
    if (now - timestamp > 30000) sectorErrors.delete(key); // Clean up entries older than 30s (was 60s)
  }
}, 30000);

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

  // Per-key error cooldown instead of global — only block the specific symbol/sector that failed
  const errorKey = symbol || sectorCode;
  const lastError = sectorErrors.get(errorKey);
  if (lastError && Date.now() - lastError < SECTOR_ERROR_COOLDOWN) {
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
        // Add hint about why sector info might be null
        _debug: "Sector lookup returned no result — stock may not have sector classification",
      });
    }

    if (type === "info") {
      const result = { success: true, symbol, sectorInfo };
      return NextResponse.json(result);
    }

    // type === "full": also fetch timeline
    // Use try-catch for timeline fetch so that sector info is still returned even if timeline fails
    let timelineData: { items: any[]; prevClose: number } | null = null;
    try {
      timelineData = await fetchGuarded(
        `sector-timeline:${sectorInfo.code}`,
        async () => getSectorTimeline(sectorInfo.code),
        cacheTTL
      );
    } catch (timelineError) {
      console.error("Sector timeline fetch failed (non-fatal):", timelineError);
      // Return sector info even without timeline data
    }

    const result = { success: true, symbol, sectorInfo, data: timelineData || { items: [], prevClose: 0 } };
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Sector API error:", error);
    // Only set per-key error, not global
    sectorErrors.set(errorKey, Date.now());
    return NextResponse.json(
      { success: false, error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}
