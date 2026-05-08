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

// ── Server-side Cache ───────────────────────────────────
// Cache screener results to avoid re-running the full pipeline on every request.
// Key: query params string, Value: { data: ScreenerResult, timestamp }
const screenerCache = new Map<string, { data: ScreenerResult; timestamp: number }>();
const CACHE_TTL = 3 * 60 * 1000; // 3 minutes – balance freshness vs cost

/**
 * Build a cache key from query parameters
 */
function buildCacheKey(params: {
  minChange: number;
  maxChange: number;
  maxMarketCap: number;
  sector: string;
  pulseThreshold: number;
  pulse: boolean;
  pulseTimeStart: string;
  pulseTimeEnd: string;
  volumeSurge: boolean;
  volumeSurgeThreshold: number;
}): string {
  return `${params.sector}|${params.minChange}|${params.maxChange}|${params.maxMarketCap}|${params.pulseThreshold}|${params.pulse}|${params.pulseTimeStart}|${params.pulseTimeEnd}|${params.volumeSurge}|${params.volumeSurgeThreshold}`;
}

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
  volumeSurgeScore: number; // 放量拉升评分 0-100
  volumeSurgeDetail: string;// 放量拉升描述
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

// ── Sector Search via EastMoney ─────────────────────────
// Dynamically search for sector codes based on keyword

/**
 * Search for sector codes via EastMoney suggest API
 * @param keyword - The sector keyword to search (e.g. "通信", "半导体", "新能源")
 */
async function findSectorsByKeyword(keyword: string): Promise<{ code: string; name: string }[]> {
  const results: { code: string; name: string }[] = [];
  const seen = new Set<string>();

  // Also search for common aliases
  const keywords = [keyword];
  // Add common alias mappings
  const aliases: Record<string, string[]> = {
    "通信": ["通讯"],
    "通讯": ["通信"],
    "半导体": ["芯片"],
    "芯片": ["半导体"],
    "新能源": ["光伏", "风电"],
    "医药": ["医疗", "生物"],
    "军工": ["国防"],
    "消费": ["食品", "白酒"],
    "银行": ["金融"],
    "证券": ["券商"],
    "汽车": ["新能源车"],
    "地产": ["房地产"],
    "煤炭": ["能源"],
    "钢铁": ["有色"],
    "人工智能": ["AI", "大模型"],
  };
  if (aliases[keyword]) {
    keywords.push(...aliases[keyword]);
  }

  for (const kw of keywords) {
    try {
      const url = `http://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(kw)}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=10`;
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
        // Include sectors whose name contains the keyword or any alias
        const matchesKeyword = keywords.some(k => name.includes(k));
        if (matchesKeyword) {
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

function parseTimeToMinutes(timeStr: string): number {
  const parts = timeStr.split(":");
  if (parts.length !== 2) return 570; // default 09:30 = 9*60+30
  const h = parseInt(parts[0]) || 9;
  const m = parseInt(parts[1]) || 30;
  return h * 60 + m;
}

/**
 * Detect opening pulse surge pattern
 * Returns { score: 0-100, detail: string }
 *
 * A "pulse" means the stock had a rapid price increase shortly after market open.
 * Detection logic:
 * 1. Check if price rose rapidly in the specified time window
 * 2. Look for a quick surge where price increases >1.5% within 3-5 minutes
 * 3. The surge should be followed by a pullback (typical pulse pattern)
 *
 * @param timeStart - Start time in HH:mm format (default "09:30")
 * @param timeEnd - End time in HH:mm format (default "10:30")
 */
function detectPulseSurge(
  timeline: { time: string; price: number; volume: number }[],
  prevClose: number,
  open: number,
  timeStart: string = "09:30",
  timeEnd: string = "10:30",
): { score: number; detail: string } {
  if (!timeline || timeline.length < 5 || prevClose <= 0) {
    return { score: 0, detail: "数据不足" };
  }

  // Parse time range to minutes for comparison
  const startMin = parseTimeToMinutes(timeStart);
  const endMin = parseTimeToMinutes(timeEnd);

  // Filter to the specified time window
  const earlySession = timeline.filter(t => {
    const hour = parseInt(t.time.split(":")[0]);
    const minute = parseInt(t.time.split(":")[1]);
    const totalMin = hour * 60 + minute;
    return totalMin >= startMin && totalMin <= endMin;
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
 * Detect volume surge pattern (放量拉升)
 * Returns { score: 0-100, detail: string }
 *
 * A "volume surge" means the stock had significantly increased trading volume
 * accompanied by a price increase. Unlike pulse (which is a rapid spike then pullback),
 * volume surge focuses on sustained buying pressure with expanding volume.
 *
 * Detection logic:
 * 1. Compare volume in the time window vs. earlier baseline volume
 * 2. Check if volume expansion coincides with price rise
 * 3. Look for continuous volume increase (递增放量)
 * 4. Check if the volume surge is accompanied by sustained price gain (not just a spike)
 *
 * @param timeStart - Start time in HH:mm format (default "09:30")
 * @param timeEnd - End time in HH:mm format (default "10:30")
 */
function detectVolumeSurge(
  timeline: { time: string; price: number; volume: number }[],
  prevClose: number,
  open: number,
  timeStart: string = "09:30",
  timeEnd: string = "10:30",
): { score: number; detail: string } {
  if (!timeline || timeline.length < 10 || prevClose <= 0) {
    return { score: 0, detail: "数据不足" };
  }

  // Parse time range
  const startMin = parseTimeToMinutes(timeStart);
  const endMin = parseTimeToMinutes(timeEnd);

  // Filter to the specified time window
  const session = timeline.filter(t => {
    const hour = parseInt(t.time.split(":")[0]);
    const minute = parseInt(t.time.split(":")[1]);
    const totalMin = hour * 60 + minute;
    return totalMin >= startMin && totalMin <= endMin;
  });

  if (session.length < 5) {
    return { score: 0, detail: "时段数据不足" };
  }

  // Calculate incremental volumes (each minute's actual volume)
  const increments: { time: string; price: number; vol: number; priceChange: number }[] = [];
  for (let i = 0; i < session.length; i++) {
    const prevVol = i > 0 ? session[i - 1].volume : 0;
    const curVol = session[i].volume;
    const vol = i === 0 ? curVol : Math.max(0, curVol - prevVol);
    const prevPrice = i > 0 ? session[i - 1].price : prevClose;
    const priceChange = prevPrice > 0 ? ((session[i].price - prevPrice) / prevPrice) * 100 : 0;
    increments.push({ time: session[i].time, price: session[i].price, vol, priceChange });
  }

  // Strategy 1: Volume ratio - max single-minute volume vs average
  const avgVol = increments.reduce((s, t) => s + t.vol, 0) / increments.length;
  const maxVol = Math.max(...increments.map(t => t.vol));
  const maxVolIdx = increments.findIndex(t => t.vol === maxVol);
  const volumeRatio = avgVol > 0 ? maxVol / avgVol : 1;

  // Strategy 2: Check if volume surge coincides with price rise
  const maxVolPriceChange = increments[maxVolIdx]?.priceChange || 0;
  const volUpWithPrice = volumeRatio >= 1.5 && maxVolPriceChange > 0;

  // Strategy 3: Progressive volume increase (递增放量)
  // Check if there are 3+ consecutive minutes with increasing volume
  let maxProgressiveLen = 1;
  let curProgressiveLen = 1;
  let progressiveStart = 0;
  let bestProgressiveStart = 0;
  for (let i = 1; i < increments.length; i++) {
    if (increments[i].vol > increments[i - 1].vol && increments[i].vol > 0) {
      curProgressiveLen++;
      if (curProgressiveLen > maxProgressiveLen) {
        maxProgressiveLen = curProgressiveLen;
        bestProgressiveStart = progressiveStart;
      }
    } else {
      curProgressiveLen = 1;
      progressiveStart = i;
    }
  }

  // Check if progressive volume is accompanied by price rise
  const progressivePriceRise = maxProgressiveLen >= 3
    ? (() => {
        const startP = increments[bestProgressiveStart]?.price || 0;
        const endP = increments[bestProgressiveStart + maxProgressiveLen - 1]?.price || 0;
        return startP > 0 ? ((endP - startP) / startP) * 100 : 0;
      })()
    : 0;

  // Strategy 4: Total volume in the window vs baseline (first 5 min)
  const baselineVol = increments.slice(0, Math.min(5, increments.length))
    .reduce((s, t) => s + t.vol, 0) / Math.min(5, increments.length);
  const totalWindowVol = increments.reduce((s, t) => s + t.vol, 0);
  const windowAvgVol = totalWindowVol / increments.length;
  const windowVolRatio = baselineVol > 0 ? windowAvgVol / baselineVol : 1;

  // Strategy 5: Price gain in the window
  const windowStartPrice = session[0].price;
  const windowEndPrice = session[session.length - 1].price;
  const windowPriceGain = windowStartPrice > 0
    ? ((windowEndPrice - windowStartPrice) / windowStartPrice) * 100
    : 0;

  // Strategy 6: Number of up-minutes with above-average volume
  const upWithHighVol = increments.filter(t => t.priceChange > 0 && t.vol > avgVol).length;
  const upHighVolRatio = increments.length > 0 ? upWithHighVol / increments.length : 0;

  // Calculate composite score
  let score = 0;

  // Single-minute volume spike with price rise (most important)
  if (volumeRatio >= 3 && maxVolPriceChange > 0.3) score += 30;
  else if (volumeRatio >= 2.5 && maxVolPriceChange > 0.2) score += 25;
  else if (volumeRatio >= 2 && maxVolPriceChange > 0.1) score += 20;
  else if (volumeRatio >= 1.5 && maxVolPriceChange > 0) score += 12;
  else if (volumeRatio >= 1.5) score += 5;

  // Progressive volume increase with price rise
  if (maxProgressiveLen >= 5 && progressivePriceRise > 0.5) score += 25;
  else if (maxProgressiveLen >= 4 && progressivePriceRise > 0.3) score += 20;
  else if (maxProgressiveLen >= 3 && progressivePriceRise > 0.1) score += 15;
  else if (maxProgressiveLen >= 3) score += 5;

  // Window volume ratio vs baseline
  if (windowVolRatio >= 2) score += 15;
  else if (windowVolRatio >= 1.5) score += 10;
  else if (windowVolRatio >= 1.2) score += 5;

  // Sustained price gain with volume
  if (windowPriceGain >= 2 && upHighVolRatio >= 0.3) score += 15;
  else if (windowPriceGain >= 1 && upHighVolRatio >= 0.2) score += 10;
  else if (windowPriceGain >= 0.5 && upHighVolRatio >= 0.15) score += 5;

  // Up-minutes with high volume ratio
  if (upHighVolRatio >= 0.4) score += 10;
  else if (upHighVolRatio >= 0.3) score += 6;
  else if (upHighVolRatio >= 0.2) score += 3;

  // Volume up + price up together
  if (volUpWithPrice && volumeRatio >= 2) score += 5;

  // Cap at 100
  score = Math.min(score, 100);

  // Build detail string
  const details: string[] = [];
  if (volumeRatio >= 1.5) {
    details.push(`${increments[maxVolIdx]?.time || ""}量比${volumeRatio.toFixed(1)}x`);
  }
  if (maxProgressiveLen >= 3) {
    details.push(`${maxProgressiveLen}分钟递增放量${progressivePriceRise > 0 ? `涨${progressivePriceRise.toFixed(1)}%` : ""}`);
  }
  if (windowVolRatio >= 1.2) {
    details.push(`窗口均量${windowVolRatio.toFixed(1)}x基准`);
  }
  if (windowPriceGain >= 0.5) {
    details.push(`时段涨幅${windowPriceGain.toFixed(1)}%`);
  }
  if (upHighVolRatio >= 0.2) {
    details.push(`${(upHighVolRatio * 100).toFixed(0)}%放量上涨`);
  }

  return {
    score,
    detail: details.length > 0 ? details.join("，") : (score > 0 ? "轻微放量" : "无明显放量"),
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
  const minChange = parseFloat(searchParams.get("minChange") || "-5");
  const maxChange = parseFloat(searchParams.get("maxChange") || "10");
  const maxMarketCap = parseFloat(searchParams.get("maxMarketCap") || "200"); // 亿元
  const sectorKeyword = searchParams.get("sector") || "通信";
  const pulseThreshold = parseInt(searchParams.get("pulseThreshold") || "10"); // 脉冲评分阈值
  const enablePulseDetection = searchParams.get("pulse") !== "false";
  const pulseTimeStart = searchParams.get("pulseTimeStart") || "09:30";
  const pulseTimeEnd = searchParams.get("pulseTimeEnd") || "10:30";
  const enableVolumeSurge = searchParams.get("volumeSurge") !== "false";
  const volumeSurgeThreshold = parseInt(searchParams.get("volumeSurgeThreshold") || "10");
  const forceRefresh = searchParams.get("refresh") === "1";

  // Check server cache first
  const cacheKey = buildCacheKey({
    minChange, maxChange, maxMarketCap, sector: sectorKeyword,
    pulseThreshold, pulse: enablePulseDetection,
    pulseTimeStart, pulseTimeEnd,
    volumeSurge: enableVolumeSurge, volumeSurgeThreshold,
  });
  if (!forceRefresh) {
    const cached = screenerCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json({ ...cached.data, cached: true });
    }
  }

  try {
    // Step 1: Find sectors by keyword
    const sectors = await findSectorsByKeyword(sectorKeyword);
    if (sectors.length === 0) {
      return NextResponse.json({
        success: false,
        stocks: [],
        totalCount: 0,
        filteredCount: 0,
        sectorName: "",
        sectorCode: "",
        timestamp: new Date().toISOString(),
        error: `未找到"${sectorKeyword}"相关板块`,
      } as ScreenerResult);
    }

    // Step 2: Fetch stocks from all matching sectors
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
        volumeSurgeScore: 0,
        volumeSurgeDetail: "待检测",
      });
    }

    // Step 4: Pulse & Volume surge detection for candidates
    const needPulse = enablePulseDetection;
    const needVolumeSurge = enableVolumeSurge;
    if ((needPulse || needVolumeSurge) && candidates.length > 0) {
      // Fetch timeline data in batches (concurrent with limit)
      const batchSize = 5;
      for (let i = 0; i < candidates.length; i += batchSize) {
        const batch = candidates.slice(i, i + batchSize);
        const timelinePromises = batch.map(async (stock) => {
          const timeline = await getStockTimeline(stock.symbol);
          if (needPulse) {
            const pulseResult = detectPulseSurge(timeline, stock.prevClose, stock.open, pulseTimeStart, pulseTimeEnd);
            stock.pulseScore = pulseResult.score;
            stock.pulseDetail = pulseResult.detail;
          }
          if (needVolumeSurge) {
            const volResult = detectVolumeSurge(timeline, stock.prevClose, stock.open, pulseTimeStart, pulseTimeEnd);
            stock.volumeSurgeScore = volResult.score;
            stock.volumeSurgeDetail = volResult.detail;
          }
        });
        await Promise.allSettled(timelinePromises);
      }

      // Filter: pulse OR volumeSurge (OR relationship)
      // Stock passes if: (pulse enabled AND pulseScore >= threshold) OR (volumeSurge enabled AND volumeSurgeScore >= threshold)
      const filtered = candidates.filter(s => {
        const pulsePass = needPulse && s.pulseScore >= pulseThreshold;
        const volPass = needVolumeSurge && s.volumeSurgeScore >= volumeSurgeThreshold;
        return pulsePass || volPass;
      });

      // Sort by max of the two scores (desc), then change percent (desc)
      filtered.sort((a, b) => {
        const aMax = Math.max(a.pulseScore, a.volumeSurgeScore);
        const bMax = Math.max(b.pulseScore, b.volumeSurgeScore);
        if (bMax !== aMax) return bMax - aMax;
        return b.changePercent - a.changePercent;
      });

      const result: ScreenerResult = {
        success: true,
        stocks: filtered,
        totalCount,
        filteredCount: filtered.length,
        sectorName,
        sectorCode,
        timestamp: new Date().toISOString(),
      };

      // Store in server cache
      screenerCache.set(cacheKey, { data: result, timestamp: Date.now() });

      return NextResponse.json(result);
    }

    // No pulse detection: sort by change percent desc
    candidates.sort((a, b) => b.changePercent - a.changePercent);

    const result: ScreenerResult = {
      success: true,
      stocks: candidates,
      totalCount,
      filteredCount: candidates.length,
      sectorName,
      sectorCode,
      timestamp: new Date().toISOString(),
    };

    // Store in server cache
    screenerCache.set(cacheKey, { data: result, timestamp: Date.now() });

    return NextResponse.json(result);

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
