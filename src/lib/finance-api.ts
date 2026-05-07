/**
 * Finance API utility - calls the Finance API through the gateway
 */

const GATEWAY_URL = process.env.FINANCE_GATEWAY_URL || "http://172.25.136.193:8080";
const API_PREFIX = "/external/finance";

async function financeFetch(endpoint: string, params: Record<string, string>) {
  const url = new URL(`${GATEWAY_URL}${API_PREFIX}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });

  const response = await fetch(url.toString(), {
    headers: {
      "X-Z-AI-From": "Z",
      "Content-Type": "application/json",
    },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`Finance API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// ── Types ──────────────────────────────────────────────

export interface StockSearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  close: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap: number;
  peRatio: number;
  week52High: number;
  week52Low: number;
  avgVolume: number;
}

export interface KLineData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjClose?: number;
}

// ── API Functions ──────────────────────────────────────

export async function searchStocks(query: string): Promise<StockSearchResult[]> {
  try {
    const data = await financeFetch("/v1/markets/search", { search: query });
    const body = data?.body || data;

    if (Array.isArray(body)) {
      return body.slice(0, 20).map((item: any) => ({
        symbol: item.symbol || item.ticker || "",
        name: item.shortname || item.longname || item.name || item.shortName || item.longName || "",
        exchange: item.exchDisp || item.exchange || item.exchDisp || "",
        type: item.typeDisp || item.quoteType || item.type || "",
      }));
    }

    // Some responses nest data
    const results = body?.results || body?.data || [];
    if (Array.isArray(results)) {
      return results.slice(0, 20).map((item: any) => ({
        symbol: item.symbol || item.ticker || "",
        name: item.shortname || item.longname || item.name || item.shortName || item.longName || "",
        exchange: item.exchDisp || item.exchange || "",
        type: item.typeDisp || item.quoteType || item.type || "",
      }));
    }

    return [];
  } catch (error) {
    console.error("Stock search error:", error);
    return [];
  }
}

export async function getStockQuote(ticker: string, type: string = "STOCKS"): Promise<StockQuote | null> {
  try {
    // Use snapshot quotes API which provides richer data
    const data = await financeFetch("/v1/markets/stock/quotes", { ticker });
    const body = data?.body || data;

    // The body is an array of quotes
    const quote = Array.isArray(body) ? body[0] : body;
    if (!quote) return null;

    // Helper to parse number from various formats
    const parseNum = (v: any): number => {
      if (v == null) return 0;
      if (typeof v === "object" && "raw" in v) return Number(v.raw) || 0;
      if (typeof v === "string") {
        const cleaned = v.replace(/[$,%\s]/g, "");
        return Number(cleaned) || 0;
      }
      return Number(v) || 0;
    };

    // Helper to parse percentage - API returns values like -0.199467 for -0.20%
    const parsePercent = (v: any): number => {
      if (v == null) return 0;
      if (typeof v === "string") {
        const cleaned = v.replace(/[%\s]/g, "");
        return Number(cleaned) || 0;
      }
      return Number(v) || 0;
    };

    return {
      symbol: quote.symbol || ticker,
      name: quote.shortName || quote.longName || quote.companyName || quote.name || ticker,
      price: parseNum(quote.regularMarketPrice || quote.lastSalePrice),
      prevClose: parseNum(quote.regularMarketPreviousClose),
      open: parseNum(quote.regularMarketOpen),
      high: parseNum(quote.regularMarketDayHigh),
      low: parseNum(quote.regularMarketDayLow),
      close: parseNum(quote.regularMarketPrice || quote.lastSalePrice),
      change: parseNum(quote.regularMarketChange || quote.netChange),
      changePercent: parsePercent(quote.regularMarketChangePercent || quote.percentageChange),
      volume: parseNum(quote.regularMarketVolume || quote.volume),
      marketCap: parseNum(quote.marketCap),
      peRatio: parseNum(quote.trailingPE),
      week52High: parseNum(quote.fiftyTwoWeekHigh),
      week52Low: parseNum(quote.fiftyTwoWeekLow),
      avgVolume: parseNum(quote.averageDailyVolume3Month),
    };
  } catch (error) {
    console.error("Stock quote error:", error);
    return null;
  }
}

export async function getStockHistory(
  symbol: string,
  interval: string = "5m",
  limit: number = 200
): Promise<KLineData[]> {
  try {
    const data = await financeFetch("/v2/markets/stock/history", {
      symbol,
      interval,
      limit: String(limit),
    });

    const body = data?.body || data;

    // Handle different response formats
    let candles: any[] = [];

    if (Array.isArray(body)) {
      candles = body;
    } else if (body?.candles) {
      candles = body.candles;
    } else if (body?.data) {
      candles = Array.isArray(body.data) ? body.data : [];
    } else if (body?.results) {
      candles = body.results;
    }

    if (!candles.length) {
      // Try V1 API format
      const v1Data = await financeFetch("/v1/markets/stock/history", {
        symbol,
        interval,
        diffandsplits: "false",
      });
      const v1Body = v1Data?.body || v1Data;
      if (Array.isArray(v1Body)) {
        candles = v1Body;
      } else if (v1Body?.candles) {
        candles = v1Body.candles;
      }
    }

    return candles.map((candle: any) => {
      // Handle timestamp conversion
      let dateStr = "";
      if (candle.date || candle.datetime || candle.timestamp) {
        const ts = Number(candle.date || candle.datetime || candle.timestamp);
        if (ts > 1e12) {
          // Milliseconds
          dateStr = new Date(ts).toLocaleString("zh-CN", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          });
        } else if (ts > 1e9) {
          // Seconds
          dateStr = new Date(ts * 1000).toLocaleString("zh-CN", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          });
        } else {
          dateStr = String(candle.date || candle.datetime || candle.timestamp);
        }
      }

      return {
        date: dateStr,
        open: Number(candle.open || 0),
        high: Number(candle.high || candle.high_price || 0),
        low: Number(candle.low || candle.low_price || 0),
        close: Number(candle.close || candle.close_price || 0),
        volume: Number(candle.volume || 0),
        adjClose: candle.adjClose ? Number(candle.adjClose) : undefined,
      };
    }).filter((item: KLineData) => item.close > 0);
  } catch (error) {
    console.error("Stock history error:", error);
    return [];
  }
}
