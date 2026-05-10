import { NextRequest, NextResponse } from "next/server";
import { getAShareKLine, isAShare } from "@/lib/ashare-api";

/**
 * Lightweight 5-minute K-line endpoint for 5-day intraday chart.
 * Returns ONLY raw OHLCV data (no MACD/KDJ/MA computation) for fast response.
 */
export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol") || "";
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "250", 10);

  if (!symbol) {
    return NextResponse.json({ error: "缺少股票代码" }, { status: 400 });
  }

  if (!isAShare(symbol)) {
    return NextResponse.json({ error: "仅支持A股" }, { status: 400 });
  }

  try {
    const history = await getAShareKLine(symbol, 5, limit);

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
      count: data.length,
      data,
    });
  } catch (error: any) {
    console.error("5min-kline API error:", error);
    return NextResponse.json({ error: "获取5分钟K线数据失败" }, { status: 500 });
  }
}
