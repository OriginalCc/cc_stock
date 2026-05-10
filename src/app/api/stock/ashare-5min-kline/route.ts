import { NextRequest, NextResponse } from "next/server";
import { getAShareKLine, isAShare } from "@/lib/ashare-api";
import { fetchGuarded } from "@/lib/fetch-guard";

/**
 * Lightweight K-line endpoint for intraday charts.
 * Returns ONLY raw OHLCV data (no MACD/KDJ/MA computation) for fast response.
 * Supports scale parameter: 1, 5, 15, 30, 60 (minutes).
 * Uses fetchGuarded for deduplication and caching.
 */
export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol") || "";
  const scale = parseInt(request.nextUrl.searchParams.get("scale") || "5", 10);
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "250", 10);

  if (!symbol) {
    return NextResponse.json({ error: "缺少股票代码" }, { status: 400 });
  }

  if (!isAShare(symbol)) {
    return NextResponse.json({ error: "仅支持A股" }, { status: 400 });
  }

  // Validate scale
  const validScales = [1, 5, 15, 30, 60];
  const safeScale = validScales.includes(scale) ? scale : 5;

  try {
    const history = await fetchGuarded(
      `kline5m:${symbol}:${safeScale}:${limit}`,
      async (_signal) => getAShareKLine(symbol, safeScale, limit),
      60000 // 60s cache — K-line data changes slowly (5-min bars)
    );

    // Return lightweight data — only date, OHLCV
    const data = history.map((item) => ({
      date: item.date,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      volume: item.volume,
    }));

    return NextResponse.json({
      symbol,
      scale: safeScale,
      count: data.length,
      data,
    });
  } catch (error: any) {
    console.error("kline API error:", error);
    return NextResponse.json({ error: `获取${safeScale}分钟K线数据失败` }, { status: 500 });
  }
}
