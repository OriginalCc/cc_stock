import { NextRequest, NextResponse } from "next/server";
import { getStockSector, getSectorTimeline } from "@/lib/ashare-api";

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

  try {
    if (type === "timeline" && sectorCode) {
      // Get sector timeline only
      const timelineData = await getSectorTimeline(sectorCode);
      return NextResponse.json({
        success: true,
        sectorCode,
        data: timelineData,
      });
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
      return NextResponse.json({
        success: true,
        symbol,
        sectorInfo,
      });
    }

    // type === "full": also fetch timeline
    const timelineData = await getSectorTimeline(sectorInfo.code);

    return NextResponse.json({
      success: true,
      symbol,
      sectorInfo,
      data: timelineData,
    });
  } catch (error: any) {
    console.error("Sector API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}
