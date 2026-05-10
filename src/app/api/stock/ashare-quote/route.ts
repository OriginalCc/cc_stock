import { NextRequest, NextResponse } from "next/server";
import { getAShareQuote, isAShare } from "@/lib/ashare-api";
import { getStockQuote } from "@/lib/finance-api";
import { fetchGuarded } from "@/lib/fetch-guard";

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol") || "";

  if (!symbol) {
    return NextResponse.json({ error: "缺少股票代码" }, { status: 400 });
  }

  try {
    // If A-share, use Sina/Tencent API
    if (isAShare(symbol)) {
      const quote = await fetchGuarded(
        `quote:${symbol}`,
        async (_signal) => getAShareQuote(symbol),
        10000 // 10s cache — quote data changes frequently during trading
      );
      if (!quote) {
        return NextResponse.json({ error: "未找到A股数据" }, { status: 404 });
      }
      return NextResponse.json({
        symbol: quote.symbol,
        name: quote.name,
        price: quote.price,
        prevClose: quote.prevClose,
        open: quote.open,
        high: quote.high,
        low: quote.low,
        close: quote.close,
        change: quote.change,
        changePercent: quote.changePercent,
        volume: quote.volume * 100, // Convert 手 to shares
        marketCap: quote.marketCap * 10000, // Convert 万元 to 元
        peRatio: quote.pe,
        week52High: quote.high52week,
        week52Low: quote.low52week,
        avgVolume: 0,
        bidPrice: quote.bidPrice,
        askPrice: quote.askPrice,
        turnover: quote.turnover,
        exchange: quote.exchange,
        isAShare: true,
      });
    }

    // Otherwise use the existing Finance API
    const quote = await getStockQuote(symbol);
    if (!quote) {
      return NextResponse.json({ error: "未找到股票数据" }, { status: 404 });
    }
    return NextResponse.json({ ...quote, isAShare: false });
  } catch (error: any) {
    console.error("Quote API error:", error);
    return NextResponse.json({ error: "获取行情失败" }, { status: 500 });
  }
}
