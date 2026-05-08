import { NextRequest, NextResponse } from "next/server";

/**
 * Stock Screener API
 * GET /api/stock/screener
 *
 * Screening criteria:
 * 1. 今日分时涨幅在0%至3%之间
 * 2. 通讯板块 (Communication sector)
 * 3. 开盘有脉冲拉升
 * 4. 主板 (Main board only)
 * 5. 排除ST
 * 6. 排除创业板 (300xxx)
 * 7. 排除科创板 (688xxx)
 * 8. 排除北交 (8xxxxx/4xxxxx)
 * 9. 市值<200亿
 */

// ── Types ──────────────────────────────────────────────

interface ScreenerStock {
  symbol: string;           // 股票代码 e.g. "600050"
  name: string;             // 股票名称 e.g. "中国联通"
  exchange: string;         // 交易所 SH/SZ
  price: number;            // 最新价
  prevClose: number;        // 昨收
  open: number;             // 开盘价
  high: number;             // 最高价
  low: number;              // 最低价
  changePercent: number;    // 涨跌幅%
  changeAmount: number;     // 涨跌额
  volume: number;           // 成交量
  amount: number;           // 成交额
  turnover: number;         // 换手率%
  marketCap: number;        // 总市值(元)
  circulatingMarketCap: number; // 流通市值(元)
  pe: number;               // 市盈率(动)
  amplitude: number;        // 振幅%
  mainNetInflow: number;    // 主力净流入
  pulseScore: number;       // 脉冲拉升评分 0-100
  pulseDetail: string;      // 脉冲拉升描述
}

interface ScreenerResult {
  success: boolean;
  stocks: ScreenerStock[];
  totalCount: number;
  filteredCount: number;
  sectorName: string;
  sectorCode: string;
  timestamp: string;
  error?: string;
}

// ── Communication sector codes in EastMoney ─────────────
// 通信设备 BK0899, 通信服务 BK0489
// We'll search for the right sector dynamically
const COMMUNICATION_SECTOR_KEYWORDS = ["通信", "通讯"];

/**
 * Search for communication sector codes via EastMoney suggest API
 */
async function findCommunicationSectors(): Promise<{ code: string; name: string }[]> {
  const results: { code: string; name: string }[] = [];
  const seen = new Set<string>();

  for (const keyword of COMMUNICATION_SECTOR_KEYWORDS) {
    try {
      const url = `http://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(keyword)}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=10`;
      const resp = await fetch(url, {
        next: { revalidate: 0 },
        signal: AbortSignal.timeout(8000),
      });

      if (!resp.ok) continue;
      const data = await resp.json();
      const items = data?.QuotationCodeTable?.Data;
      if (!Array.isArray(items)) continue;

      for (const entry of items) {
        if (entry.Classify !== "BK") continue;
        const code: string = entry.Code || "";
        const name: string = entry.Name || "";
        // Only include communication-related sectors
        if (
          name.includes("通信") ||
          name.includes("通讯") ||
          name.includes("通信设备") ||
          name.includes("通信服务")
        ) {
          if (!seen.has(code)) {
            seen.add(code);
            results.push({ code, name });
          }
        }
      }
    } catch (e) {
      console.error("Sector search error:", e);
    }
  }

  return results;
}

/**
 * Get sector constituent stocks from EastMoney
 * Uses the push2 clist API to get all stocks in a sector with real-time data
 */
async function getSectorStocks(sectorCode: string, pageSize: number = 200): Promise<any[]> {
  const allStocks: any[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= 5) {
    try {
      const url = `http://push2.eastmoney.com/api/qt/clist/get?pn=${page}&pz=${pageSize}&po=1&np=1&fltt=2&invt=2&fid=f3&fs=b:${sectorCode}&fields=f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f14,f15,f16,f17,f18,f20,f21,f23,f24,f25,f26,f22,f11,f62,f128,f140,f141,f136`;
      const resp = await fetch(url, {
        next: { revalidate: 0 },
        signal: AbortSignal.timeout(15000),
      });

      if (!resp.ok) break;

      const data = await resp.json();
      const diff = data?.data?.diff;
      if (!Array.isArray(diff) || diff.length === 0) {
        hasMore = false;
        break;
      }

      allStocks.push(...diff);

      // Check if there are more pages
      const total = data?.data?.total || 0;
      if (allStocks.length >= total || diff.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    } catch (e) {
      console.error("Sector stocks fetch error:", e);
      hasMore = false;
    }
  }

  return allStocks;
}

/**
 * Fetch 1-minute timeline data for pulse detection
 */
async function getStockTimeline(symbol: string): Promise<{ time: string; price: number; volume: number }[]> {
  try {
    // Convert to Sina format
    let sinaSymbol: string;
    if (symbol.startsWith("6")) {
      sinaSymbol = `sh${symbol}`;
    } else {
      sinaSymbol = `sz${symbol}`;
    }

    const url = `https://web.ifzq.gtimg.cn/appstock/app/minute/query?_var=min_data&code=${sinaSymbol}`;
    const resp = await fetch(url, {
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(5000),
    });

    if (!resp.ok) return [];

    const text = await resp.text();
    if (!text) return [];

    const jsonStr = text.replace(/^min_data=/, "");
    const data = JSON.parse(jsonStr);
    const stockData = data?.data?.[sinaSymbol]?.data?.data;
    if (!Array.isArray(stockData)) return [];

    return stockData
      .filter((entry: any) => typeof entry === "string")
      .map((entry: string) => {
        const parts = entry.split(" ");
        if (parts.length < 4) return null;
        const timeRaw = parts[0];
        const price = parseFloat(parts[1]);
        const cumVol = parseInt(parts[2]);
        if (isNaN(price) || price <= 0) return null;
        return {
          time: `${timeRaw.substring(0, 2)}:${timeRaw.substring(2, 4)}`,
          price,
          volume: cumVol,
        };
      })
      .filter(Boolean) as { time: string; price: number; volume: number }[];
  } catch (e) {
    return [];
  }
}

/**
 * Detect opening pulse surge pattern
 * Returns { score: 0-100, detail: string }
 *
 * A "pulse" means the stock had a rapid price increase shortly after market open.
 * Detection logic:
 * 1. Check if price rose rapidly in the first 15 minutes (09:30-09:45)
 * 2. Look for a quick surge where price increases >1.5% within 3-5 minutes
 * 3. The surge should be followed by a pullback (typical pulse pattern)
 */
function detectPulseSurge(
  timeline: { time: string; price: number; volume: number }[],
  prevClose: number,
  open: number
): { score: number; detail: string } {
  if (!timeline || timeline.length < 5 || prevClose <= 0) {
    return { score: 0, detail: "数据不足" };
  }

  // Filter to first 30 minutes of trading (09:30-10:00)
  const earlySession = timeline.filter(t => {
    const hour = parseInt(t.time.split(":")[0]);
    const minute = parseInt(t.time.split(":")[1]);
    if (hour === 9 && minute >= 30) return true;
    if (hour === 10 && minute === 0) return true;
    return false;
  });

  if (earlySession.length < 3) {
    return { score: 0, detail: "早盘数据不足" };
  }

  // Strategy 1: Check for rapid surge in short window
  let maxSurgeRate = 0;
  let surgeStart = "";
  let surgeEnd = "";
  const windowSize = 5; // 5-minute window

  for (let i = 0; i <= earlySession.length - windowSize; i++) {
    const startPrice = earlySession[i].price;
    const endPrice = earlySession[i + windowSize - 1].price;
    if (startPrice <= 0) continue;

    const surgeRate = ((endPrice - startPrice) / startPrice) * 100;
    if (surgeRate > maxSurgeRate) {
      maxSurgeRate = surgeRate;
      surgeStart = earlySession[i].time;
      surgeEnd = earlySession[i + windowSize - 1].time;
    }
  }

  // Strategy 2: Check open-to-high surge in early session
  const openPrice = earlySession[0].price;
  const earlyHigh = Math.max(...earlySession.map(t => t.price));
  const openToHighRate = ((earlyHigh - openPrice) / openPrice) * 100;

  // Strategy 3: Check if there's a peak then pullback (classic pulse pattern)
  let peakIdx = 0;
  let peakPrice = 0;
  for (let i = 0; i < earlySession.length; i++) {
    if (earlySession[i].price > peakPrice) {
      peakPrice = earlySession[i].price;
      peakIdx = i;
    }
  }

  const lastEarlyPrice = earlySession[earlySession.length - 1].price;
  const pullbackRate = peakPrice > 0 ? ((peakPrice - lastEarlyPrice) / peakPrice) * 100 : 0;

  // Strategy 4: Check volume spike during surge (pulse usually has high volume)
  const avgVol = earlySession.reduce((sum, t) => sum + t.volume, 0) / earlySession.length;
  const peakVol = earlySession[peakIdx]?.volume || 0;
  const volumeRatio = avgVol > 0 ? peakVol / avgVol : 1;

  // Strategy 5: Gap up at open (开盘跳空) is also a pulse indicator
  const gapUpRate = ((openPrice - prevClose) / prevClose) * 100;

  // Calculate composite pulse score
  let score = 0;

  // Short-window surge (most important signal)
  if (maxSurgeRate >= 3) score += 35;
  else if (maxSurgeRate >= 2) score += 25;
  else if (maxSurgeRate >= 1.5) score += 20;
  else if (maxSurgeRate >= 1) score += 12;
  else if (maxSurgeRate >= 0.5) score += 5;

  // Open-to-high rate
  if (openToHighRate >= 3) score += 25;
  else if (openToHighRate >= 2) score += 18;
  else if (openToHighRate >= 1.5) score += 12;
  else if (openToHighRate >= 1) score += 8;
  else if (openToHighRate >= 0.5) score += 3;

  // Pullback after peak (classic pulse signature)
  if (pullbackRate >= 0.5 && pullbackRate <= 5 && peakIdx < earlySession.length - 2) {
    score += 15; // Peak followed by pullback = strong pulse signal
  } else if (pullbackRate > 0 && peakIdx < earlySession.length / 2) {
    score += 8;
  }

  // Volume spike
  if (volumeRatio >= 2) score += 10;
  else if (volumeRatio >= 1.5) score += 6;
  else if (volumeRatio >= 1.2) score += 3;

  // Gap up bonus
  if (gapUpRate >= 1) score += 10;
  else if (gapUpRate >= 0.5) score += 5;
  else if (gapUpRate > 0) score += 2;

  // Cap at 100
  score = Math.min(score, 100);

  // Build detail string
  const details: string[] = [];
  if (maxSurgeRate >= 1) {
    details.push(`${surgeStart}-${surgeEnd}飙升${maxSurgeRate.toFixed(1)}%`);
  }
  if (openToHighRate >= 1) {
    details.push(`开盘冲高${openToHighRate.toFixed(1)}%`);
  }
  if (gapUpRate >= 0.5) {
    details.push(`跳空${gapUpRate.toFixed(1)}%`);
  }
  if (pullbackRate >= 0.3 && peakIdx < earlySession.length - 2) {
    details.push(`冲高回落${pullbackRate.toFixed(1)}%`);
  }
  if (volumeRatio >= 1.5) {
    details.push(`放量${volumeRatio.toFixed(1)}x`);
  }

  return {
    score,
    detail: details.length > 0 ? details.join("，") : (score > 0 ? "轻微脉冲" : "无明显脉冲"),
  };
}

/**
 * Check if a stock code belongs to main board
 * Main board: 600xxx, 601xxx, 603xxx, 605xxx (SH), 000xxx, 001xxx, 002xxx (SZ)
 */
function isMainBoard(code: string): boolean {
  // Shanghai main board
  if (/^60[0135]\d{3}$/.test(code)) return true;
  // Shenzhen main board (including 中小板 002xxx)
  if (/^00[01]\d{3}$/.test(code)) return true;
  if (/^002\d{3}$/.test(code)) return true;
  return false;
}

/**
 * Check if a stock name contains ST
 */
function isST(name: string): boolean {
  return /ST|\\*ST|SST|S\\*ST/.test(name.toUpperCase());
}

/**
 * Check if a stock code belongs to ChiNext (创业板)
 */
function isChiNext(code: string): boolean {
  return code.startsWith("300") || code.startsWith("301");
}

/**
 * Check if a stock code belongs to STAR Market (科创板)
 */
function isSTAR(code: string): boolean {
  return code.startsWith("688") || code.startsWith("689");
}

/**
 * Check if a stock code belongs to Beijing Stock Exchange (北交所)
 */
function isBSE(code: string): boolean {
  return code.startsWith("8") || code.startsWith("4");
}

/**
 * Check if a code is an ETF
 */
function isETF(code: string): boolean {
  return code.startsWith("51") || code.startsWith("56") || code.startsWith("58") ||
         code.startsWith("15") || code.startsWith("16") || code.startsWith("18");
}

// ── Main Handler ────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const minChange = parseFloat(searchParams.get("minChange") || "0");
  const maxChange = parseFloat(searchParams.get("maxChange") || "3");
  const maxMarketCap = parseFloat(searchParams.get("maxMarketCap") || "200"); // 亿元
  const sectorKeyword = searchParams.get("sector") || "通信";
  const pulseThreshold = parseInt(searchParams.get("pulseThreshold") || "20"); // 脉冲评分阈值
  const enablePulseDetection = searchParams.get("pulse") !== "false";

  try {
    // Step 1: Find communication sectors
    const sectors = await findCommunicationSectors();
    if (sectors.length === 0) {
      return NextResponse.json({
        success: false,
        stocks: [],
        totalCount: 0,
        filteredCount: 0,
        sectorName: "",
        sectorCode: "",
        timestamp: new Date().toISOString(),
        error: "未找到通讯板块",
      } as ScreenerResult);
    }

    // Step 2: Fetch stocks from all communication sectors
    const allRawStocks: any[] = [];
    let sectorName = "";
    let sectorCode = "";

    for (const sector of sectors) {
      const stocks = await getSectorStocks(sector.code);
      if (stocks.length > 0) {
        allRawStocks.push(...stocks);
        if (!sectorName) {
          sectorName = sector.name;
          sectorCode = sector.code;
        }
      }
    }

    // Combine sector names
    const allSectorNames = sectors.map(s => s.name).join("、");
    sectorName = allSectorNames || sectorName;
    sectorCode = sectors.map(s => s.code).join(",");

    // Deduplicate by stock code
    const seenCodes = new Set<string>();
    const uniqueStocks = allRawStocks.filter((s: any) => {
      const code = String(s.f12 || "");
      if (seenCodes.has(code)) return false;
      seenCodes.add(code);
      return true;
    });

    const totalCount = uniqueStocks.length;

    // Step 3: Parse and filter
    const candidates: ScreenerStock[] = [];

    for (const stock of uniqueStocks) {
      const code = String(stock.f12 || "");
      const name = String(stock.f14 || "");

      // Skip ETFs
      if (isETF(code)) continue;

      // Skip if not main board
      if (!isMainBoard(code)) continue;

      // Skip ST stocks
      if (isST(name)) continue;

      // Parse numeric fields
      const price = parseFloat(stock.f2) || 0;
      const prevClose = parseFloat(stock.f18) || 0;
      const open = parseFloat(stock.f17) || 0;
      const high = parseFloat(stock.f15) || 0;
      const low = parseFloat(stock.f16) || 0;
      const changePercent = parseFloat(stock.f3) || 0;
      const changeAmount = parseFloat(stock.f4) || 0;
      const volume = parseFloat(stock.f5) || 0;
      const amount = parseFloat(stock.f6) || 0;
      const amplitude = parseFloat(stock.f7) || 0;
      const turnover = parseFloat(stock.f8) || 0;
      const pe = parseFloat(stock.f9) || 0;
      const marketCap = parseFloat(stock.f20) || 0; // 总市值 in 元
      const circulatingMarketCap = parseFloat(stock.f21) || 0;
      const mainNetInflow = parseFloat(stock.f62) || 0;

      // Skip invalid data
      if (price <= 0 || prevClose <= 0) continue;

      // Filter: change percent between minChange and maxChange
      if (changePercent < minChange || changePercent > maxChange) continue;

      // Filter: market cap < maxMarketCap (convert from 元 to 亿)
      const marketCapYi = marketCap / 1e8;
      if (marketCapYi > maxMarketCap || marketCapYi <= 0) continue;

      candidates.push({
        symbol: code,
        name,
        exchange: code.startsWith("6") ? "SH" : "SZ",
        price,
        prevClose,
        open,
        high,
        low,
        changePercent,
        changeAmount,
        volume,
        amount,
        turnover,
        marketCap,
        circulatingMarketCap,
        pe,
        amplitude,
        mainNetInflow,
        pulseScore: 0,
        pulseDetail: "待检测",
      });
    }

    // Step 4: Pulse detection for candidates
    if (enablePulseDetection && candidates.length > 0) {
      // Fetch timeline data in batches (concurrent with limit)
      const batchSize = 5;
      for (let i = 0; i < candidates.length; i += batchSize) {
        const batch = candidates.slice(i, i + batchSize);
        const timelinePromises = batch.map(async (stock) => {
          const timeline = await getStockTimeline(stock.symbol);
          const pulseResult = detectPulseSurge(timeline, stock.prevClose, stock.open);
          stock.pulseScore = pulseResult.score;
          stock.pulseDetail = pulseResult.detail;
        });
        await Promise.allSettled(timelinePromises);
      }

      // Filter by pulse threshold
      const pulseFiltered = candidates.filter(s => s.pulseScore >= pulseThreshold);

      // Sort by pulse score (desc), then change percent (desc)
      pulseFiltered.sort((a, b) => {
        if (b.pulseScore !== a.pulseScore) return b.pulseScore - a.pulseScore;
        return b.changePercent - a.changePercent;
      });

      return NextResponse.json({
        success: true,
        stocks: pulseFiltered,
        totalCount,
        filteredCount: pulseFiltered.length,
        sectorName,
        sectorCode,
        timestamp: new Date().toISOString(),
      } as ScreenerResult);
    }

    // No pulse detection: sort by change percent desc
    candidates.sort((a, b) => b.changePercent - a.changePercent);

    return NextResponse.json({
      success: true,
      stocks: candidates,
      totalCount,
      filteredCount: candidates.length,
      sectorName,
      sectorCode,
      timestamp: new Date().toISOString(),
    } as ScreenerResult);

  } catch (error: any) {
    console.error("Screener API error:", error);
    return NextResponse.json(
      {
        success: false,
        stocks: [],
        totalCount: 0,
        filteredCount: 0,
        sectorName: "",
        sectorCode: "",
        timestamp: new Date().toISOString(),
        error: error.message || "选股失败",
      } as ScreenerResult,
      { status: 500 }
    );
  }
}
