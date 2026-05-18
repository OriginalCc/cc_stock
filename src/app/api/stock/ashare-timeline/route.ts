import { NextRequest, NextResponse } from "next/server";
import { getAShareTimeline, getAShareQuote, isAShare } from "@/lib/ashare-api";
import { fetchGuarded } from "@/lib/fetch-guard";

/**
 * Determine cache TTL based on trading status:
 * - During trading hours: 2s (supports 3s client-side refresh)
 * - Outside trading hours: 300s (data is static)
 */
function getTimelineCacheTTL(): number {
  const now = new Date();
  // Convert to China time (UTC+8)
  const chinaHour = (now.getUTCHours() + 8) % 24;
  const chinaMinute = now.getUTCMinutes();
  const isWeekday = now.getUTCDay() >= 1 && now.getUTCDay() <= 5;

  if (!isWeekday) return 300000; // 5 min on weekends

  // Trading hours: 9:25-11:30, 13:00-15:05 (with a small buffer)
  const isMorningSession = (chinaHour === 9 && chinaMinute >= 25) || chinaHour === 10 || (chinaHour === 11 && chinaMinute <= 35);
  const isAfternoonSession = (chinaHour === 13) || (chinaHour === 14) || (chinaHour === 15 && chinaMinute <= 5);

  if (isMorningSession || isAfternoonSession) return 2000; // 2s during trading (3s client refresh)
  return 300000; // 5 min outside trading hours
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol") || "";
  const includeQuote = request.nextUrl.searchParams.get("includeQuote") === "true";

  if (!symbol) {
    return NextResponse.json({ error: "缺少股票代码" }, { status: 400 });
  }

  if (!isAShare(symbol)) {
    return NextResponse.json({ error: "分时图仅支持A股和ETF", items: [], prevClose: 0 });
  }

  const cacheTTL = getTimelineCacheTTL();
  // FIX: was `cacheTTL <= 1000` but trading TTL is 2000, so isTrading was always false
  const isTrading = cacheTTL <= 3000;
  const maxAge = isTrading ? 0 : Math.min(Math.floor(cacheTTL / 1000), 30);
  const cacheHeaders = { "Cache-Control": `public, max-age=${maxAge}, must-revalidate` };

  try {
    // When includeQuote=true, fetch quote and timeline IN PARALLEL for faster loading
    // getAShareTimeline can fetch its own prevClose internally, so no need to wait
    if (includeQuote) {
      const [quoteResult, timelineResult] = await Promise.all([
        fetchGuarded(
          `quote:${symbol}`,
          async (signal) => {
            try {
              return await getAShareQuote(symbol);
            } catch {
              return null;
            }
          },
          cacheTTL
        ),
        fetchGuarded(
          `timeline:${symbol}`,
          async (signal) => {
            try {
              return await getAShareTimeline(symbol);
            } catch {
              return { items: [], prevClose: 0 };
            }
          },
          cacheTTL
        ),
      ]);

      const response: any = {
        ...timelineResult,
        quote: quoteResult ? {
          symbol: quoteResult.symbol,
          name: quoteResult.name,
          price: quoteResult.price,
          prevClose: quoteResult.prevClose,
          open: quoteResult.open,
          high: quoteResult.high,
          low: quoteResult.low,
          close: quoteResult.close,
          change: quoteResult.change,
          changePercent: quoteResult.changePercent,
          volume: quoteResult.volume * 100, // 手 → 股
          marketCap: quoteResult.marketCap * 10000, // 万元 → 元
          peRatio: quoteResult.pe,
          week52High: quoteResult.high52week,
          week52Low: quoteResult.low52week,
          avgVolume: 0,
          bidPrice: quoteResult.bidPrice,
          askPrice: quoteResult.askPrice,
          turnover: quoteResult.turnover,
          exchange: quoteResult.exchange,
          isAShare: true,
        } : null,
      };

      return NextResponse.json(response, { headers: cacheHeaders });
    }

    // No quote needed - just fetch timeline
    const result = await fetchGuarded(
      `timeline:${symbol}`,
      async (signal) => {
        try {
          return await getAShareTimeline(symbol);
        } catch {
          return { items: [], prevClose: 0 };
        }
      },
      cacheTTL
    );

    return NextResponse.json(result, { headers: cacheHeaders });
  } catch (error: any) {
    console.error("Timeline API error:", error);
    return NextResponse.json({ error: "获取分时数据失败", items: [], prevClose: 0 }, { status: 500 });
  }
}
