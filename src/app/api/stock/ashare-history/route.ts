import { NextRequest, NextResponse } from "next/server";
import { getAShareKLine, isAShare } from "@/lib/ashare-api";
import { getStockHistory } from "@/lib/finance-api";
import { calculateMACD, generateMACDSignals, calculateSMA } from "@/lib/indicators";

// Scale mapping for Sina API
const INTERVAL_SCALE_MAP: Record<string, number> = {
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "60m": 60,
  "1h": 60,
  "1d": 240,
  "1wk": 1440,
};

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol") || "";
  const interval = request.nextUrl.searchParams.get("interval") || "5m";
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "300", 10);

  if (!symbol) {
    return NextResponse.json({ error: "缺少股票代码" }, { status: 400 });
  }

  try {
    let history: { date: string; open: number; high: number; low: number; close: number; volume: number }[] = [];

    if (isAShare(symbol)) {
      const scale = INTERVAL_SCALE_MAP[interval] || 5;
      history = await getAShareKLine(symbol, scale, limit);
    } else {
      // Use existing Finance API for non-A-share stocks
      history = await getStockHistory(symbol, interval, limit);
    }

    if (history.length === 0) {
      return NextResponse.json({
        symbol,
        interval,
        data: [],
        latestSignal: null,
      });
    }

    // Calculate MACD
    const closePrices = history.map((h) => h.close);
    const macdData = calculateMACD(closePrices);
    const signals = generateMACDSignals(macdData);

    // Calculate moving averages
    const ma5 = calculateSMA(closePrices, 5);
    const ma10 = calculateSMA(closePrices, 10);
    const ma20 = calculateSMA(closePrices, 20);

    // Combine data
    const combinedData = history.map((item, i) => ({
      ...item,
      ma5: isNaN(ma5[i]) ? null : Number(ma5[i].toFixed(2)),
      ma10: isNaN(ma10[i]) ? null : Number(ma10[i].toFixed(2)),
      ma20: isNaN(ma20[i]) ? null : Number(ma20[i].toFixed(2)),
      dif: isNaN(macdData[i].dif) ? null : macdData[i].dif,
      dea: isNaN(macdData[i].dea) ? null : macdData[i].dea,
      macd: isNaN(macdData[i].macd) ? null : macdData[i].macd,
      signal: signals[i],
    }));

    // Find latest signal
    const latestSignal = signals.filter((s) => s.type !== "hold").pop() || signals[signals.length - 1];

    return NextResponse.json({
      symbol,
      interval,
      count: combinedData.length,
      data: combinedData,
      latestSignal,
    });
  } catch (error: any) {
    console.error("History API error:", error);
    return NextResponse.json({ error: "获取历史数据失败" }, { status: 500 });
  }
}
