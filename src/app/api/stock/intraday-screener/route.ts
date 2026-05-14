import { NextRequest, NextResponse } from "next/server";
import { getCachedTimeline, setCachedTimeline } from "@/lib/server-timeline-cache";

/**
 * Intraday Screener API (分时智能选股)
 * GET /api/stock/intraday-screener
 *
 * Unlike the sector-based screener, this scans the ENTIRE A-share market
 * using EastMoney's ranking APIs and applies multi-dimensional intraday analysis.
 *
 * IMPORTANT: Timeline data is STRICTLY filtered to 09:30-10:30 (first 60 minutes)
 * for analysis, consistent with the early-screen API. Only falls back to full day
 * data if early session has < 5 data points.
 *
 * Screening strategies:
 * 1. 量比排行 - Volume ratio ranking (high volume = active interest)
 * 2. 涨速排行 - Rate of change ranking (rapid price increase)
 * 3. 均价线突破 - VWAP breakout (price > VWAP = strength)
 * 4. 放量突破 - Volume breakout (new high with volume)
 * 5. V型反转 - V-shape recovery detection
 * 6. 阶梯上涨 - Staircase/step pattern
 * 7. 分时MACD金叉 - Intraday MACD golden cross
 * 8. 资金流入 - Main force capital net inflow
 * 9. 量价齐升 - Volume-Price co-rise detection
 * 10. 突破新高 - New high breakout detection
 */

// ── Server-side Cache ───────────────────────────────────
const screenerCache = new Map<string, { data: IntradayScreenerResult; timestamp: number }>();
const CACHE_TTL = 3 * 60 * 1000; // 3 minutes

// ── Types ──────────────────────────────────────────────

interface IntradayStock {
  symbol: string;
  name: string;
  exchange: string;
  price: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  changePercent: number;
  changeAmount: number;
  volume: number;
  amount: number;
  turnover: number;
  marketCap: number;
  circulatingMarketCap: number;
  pe: number;
  amplitude: number;
  mainNetInflow: number;
  volumeRatio: number;
  // ── Intraday analysis scores ──
  vwapScore: number;           // 均价线关系评分
  vwapDetail: string;
  volumePatternScore: number;  // 量价配合评分
  volumePatternDetail: string;
  trendPatternScore: number;   // 分时形态评分 (V型/阶梯/突破)
  trendPatternDetail: string;
  macdScore: number;           // 分时MACD评分
  macdDetail: string;
  capitalFlowScore: number;    // 资金流向评分
  capitalFlowDetail: string;
  coRiseScore: number;         // 量价齐升评分
  coRiseDetail: string;
  breakoutScore: number;       // 突破新高评分
  breakoutDetail: string;
  // ── Composite ──
  compositeScore: number;      // 综合评分
  compositeDetail: string;
  patternTag: string;          // 形态标签
}

interface IntradayScreenerResult {
  success: boolean;
  stocks: IntradayStock[];
  totalCount: number;
  filteredCount: number;
  timestamp: string;
  strategy: string;
  timeWindow: string;          // "09:30-10:30" or "full_day"
  timeWindowDetail: string;    // Description of why
  error?: string;
  cached?: boolean;
}

// ── Helper: Board checks ────────────────────────────────

function isMainBoard(code: string): boolean {
  if (/^60[0135]\d{3}$/.test(code)) return true;
  if (/^00[01]\d{3}$/.test(code)) return true;
  if (/^002\d{3}$/.test(code)) return true;
  return false;
}

function isST(name: string): boolean {
  return /ST|\\*ST|SST|S\\*ST/.test(name.toUpperCase());
}

function isETF(code: string): boolean {
  return code.startsWith("51") || code.startsWith("56") || code.startsWith("58") ||
    code.startsWith("15") || code.startsWith("16") || code.startsWith("18");
}

// ── Popular sectors for full-market scanning ──────────

const SCAN_SECTORS = [
  { keyword: "通信", code: "BK0489" },
  { keyword: "半导体", code: "BK0910" },
  { keyword: "人工智能", code: "BK0800" },
  { keyword: "新能源", code: "BK0912" },
  { keyword: "医药", code: "BK0734" },
  { keyword: "军工", code: "BK0481" },
  { keyword: "汽车", code: "BK0481" },
  { keyword: "消费", code: "BK0482" },
  { keyword: "银行", code: "BK0474" },
  { keyword: "证券", code: "BK0473" },
  { keyword: "电力", code: "BK0486" },
  { keyword: "光伏", code: "BK0912" },
  { keyword: "锂电池", code: "BK0478" },
  { keyword: "白酒", code: "BK0896" },
  { keyword: "有色金属", code: "BK0479" },
  { keyword: "房地产", code: "BK0451" },
  { keyword: "煤炭", code: "BK0477" },
  { keyword: "钢铁", code: "BK0480" },
  { keyword: "化学制药", code: "BK0734" },
  { keyword: "面板", code: "BK0733" },
];

// ── Fetch all A-share stocks ──────────────────────────

async function fetchAllAShares(
  sortBy: string = "f10",
  sortOrder: string = "desc",
  pageSize: number = 200,
  minChange: number = -3,
  maxChange: number = 9,
  maxMarketCap: number = 500,
  minTurnover: number = 0,
  minVolumeRatio: number = 0.5,
): Promise<any[]> {
  // Approach 1: Try market-wide scan via EastMoney clist API
  const marketStocks = await fetchMarketWide(sortBy, sortOrder, pageSize);
  if (marketStocks.length >= 50) return marketStocks;

  // Approach 2: Fallback to multi-sector scan
  console.log("Market-wide scan returned few results, falling back to multi-sector scan...");
  return fetchMultiSector(pageSize);
}

async function fetchMarketWide(
  sortBy: string,
  sortOrder: string,
  pageSize: number,
): Promise<any[]> {
  const allStocks: any[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= 3) {
    try {
      const url = `http://push2.eastmoney.com/api/qt/clist/get?pn=${page}&pz=${pageSize}&po=${sortOrder === "desc" ? 1 : 0}&np=1&fltt=2&invt=2&fid=${sortBy}&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f14,f15,f16,f17,f18,f20,f21,f22,f62,f128,f140,f141,f136`;

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

      const total = data?.data?.total || 0;
      if (allStocks.length >= total || diff.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    } catch (e) {
      console.error("Market-wide fetch error:", e);
      hasMore = false;
    }
  }

  return allStocks;
}

async function fetchMultiSector(pageSize: number): Promise<any[]> {
  const allStocks: any[] = [];
  const seenCodes = new Set<string>();

  // Fetch top stocks from multiple sectors concurrently
  const sectorPromises = SCAN_SECTORS.map(async (sector) => {
    try {
      const url = `http://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=${Math.floor(pageSize / SCAN_SECTORS.length) + 10}&po=1&np=1&fltt=2&invt=2&fid=f3&fs=b:${sector.code}&fields=f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f14,f15,f16,f17,f18,f20,f21,f22,f62,f128,f140,f141,f136`;

      const resp = await fetch(url, {
        next: { revalidate: 0 },
        signal: AbortSignal.timeout(10000),
      });

      if (!resp.ok) return [];

      const data = await resp.json();
      const diff = data?.data?.diff;
      if (!Array.isArray(diff)) return [];

      return diff;
    } catch {
      return [];
    }
  });

  const results = await Promise.allSettled(sectorPromises);

  for (const result of results) {
    if (result.status === "fulfilled" && Array.isArray(result.value)) {
      for (const stock of result.value) {
        const code = String(stock.f12 || "");
        if (!seenCodes.has(code)) {
          seenCodes.add(code);
          allStocks.push(stock);
        }
      }
    }
  }

  return allStocks;
}

// ── Fetch 1-minute timeline data ───────────────────────

async function getStockTimeline(symbol: string): Promise<{ time: string; price: number; volume: number; avgPrice?: number }[]> {
  // Check shared cache first
  const cached = getCachedTimeline(symbol);
  if (cached) return cached;

  try {
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

    let prevCumVol = 0;
    const items: { time: string; price: number; volume: number; avgPrice?: number }[] = [];

    for (const entry of stockData) {
      if (typeof entry !== "string") continue;
      const parts = entry.split(" ");
      if (parts.length < 4) continue;
      const timeRaw = parts[0];
      const price = parseFloat(parts[1]);
      const cumVol = parseInt(parts[2]);
      const cumAmt = parseFloat(parts[3]);
      if (isNaN(price) || price <= 0) continue;

      const minuteVol = cumVol - prevCumVol;
      const avgPrice = cumVol > 0 ? cumAmt / (cumVol * 100) : price;

      items.push({
        time: `${timeRaw.substring(0, 2)}:${timeRaw.substring(2, 4)}`,
        price,
        volume: Math.max(minuteVol, 0),
        avgPrice: Number(avgPrice.toFixed(2)),
      });
      prevCumVol = cumVol;
    }

    // Store in shared cache after successful fetch
    if (items.length > 0) {
      setCachedTimeline(symbol, items);
    }
    return items;
  } catch (e) {
    return [];
  }
}

// ── Time Window Filter ─────────────────────────────────

/**
 * Filter timeline to only include data from 09:30-10:30 (first 60 minutes).
 * This ensures analysis uses STRICTLY early session data, same as early-screen API.
 */
function filterEarlyTimeline(
  timeline: { time: string; price: number; volume: number; avgPrice?: number }[],
): { time: string; price: number; volume: number; avgPrice?: number }[] {
  return timeline.filter(t => {
    const [h, m] = t.time.split(':').map(Number);
    if (h === 9 && m >= 30) return true;
    if (h === 10 && m <= 30) return true;
    return false;
  });
}

// ── Analysis Functions ──────────────────────────────────

/**
 * Analyze VWAP (均价线) relationship
 * - Price above VWAP = bullish
 * - Price crossing above VWAP = breakout signal
 * - VWAP slope positive = trend confirmation
 */
function analyzeVWAP(
  timeline: { time: string; price: number; volume: number; avgPrice?: number }[],
  currentPrice: number,
): { score: number; detail: string } {
  if (!timeline || timeline.length < 10) {
    return { score: 0, detail: "数据不足" };
  }

  let score = 0;
  const details: string[] = [];

  // 1. Current price vs VWAP
  const lastItem = timeline[timeline.length - 1];
  const vwap = lastItem.avgPrice || lastItem.price;

  if (currentPrice > vwap) {
    const premiumRate = ((currentPrice - vwap) / vwap) * 100;
    if (premiumRate >= 2) { score += 25; details.push(`高于均价${premiumRate.toFixed(1)}%`); }
    else if (premiumRate >= 1) { score += 18; details.push(`均价线上方${premiumRate.toFixed(1)}%`); }
    else if (premiumRate >= 0.3) { score += 12; details.push("站上均价线"); }
    else { score += 5; }
  } else if (currentPrice < vwap) {
    const discountRate = ((vwap - currentPrice) / vwap) * 100;
    if (discountRate >= 2) { score -= 5; details.push(`低于均价${discountRate.toFixed(1)}%`); }
    else { score += 0; details.push("均价线下方"); }
  }

  // 2. VWAP slope (recent 10 bars)
  const recentLen = Math.min(10, timeline.length);
  const recentItems = timeline.slice(-recentLen);
  let vwapSlopeCount = 0;
  for (let i = 1; i < recentItems.length; i++) {
    const prevAvg = recentItems[i - 1].avgPrice || recentItems[i - 1].price;
    const curAvg = recentItems[i].avgPrice || recentItems[i].price;
    if (curAvg > prevAvg) vwapSlopeCount++;
  }
  const vwapSlopeRatio = vwapSlopeCount / (recentItems.length - 1);
  if (vwapSlopeRatio >= 0.8) { score += 15; details.push("均价线上行"); }
  else if (vwapSlopeRatio >= 0.6) { score += 8; details.push("均价线偏强"); }

  // 3. VWAP crossover detection
  // Check if price recently crossed above VWAP
  const crossWindow = Math.min(15, timeline.length);
  const crossItems = timeline.slice(-crossWindow);
  let crossAbove = false;
  for (let i = 1; i < crossItems.length; i++) {
    const prevPrice = crossItems[i - 1].price;
    const prevAvg = crossItems[i - 1].avgPrice || prevPrice;
    const curPrice = crossItems[i].price;
    const curAvg = crossItems[i].avgPrice || curPrice;
    if (prevPrice <= prevAvg && curPrice > curAvg) {
      crossAbove = true;
      break;
    }
  }
  if (crossAbove) { score += 15; details.push("突破均价线"); }

  // 4. Price consistently above VWAP
  const consistLen = Math.min(20, timeline.length);
  const consistItems = timeline.slice(-consistLen);
  let aboveCount = 0;
  for (const item of consistItems) {
    if (item.price > (item.avgPrice || item.price)) aboveCount++;
  }
  const aboveRatio = aboveCount / consistLen;
  if (aboveRatio >= 0.8) { score += 15; details.push("均价线上运行"); }
  else if (aboveRatio >= 0.6) { score += 8; }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    detail: details.length > 0 ? details.join("，") : (score > 0 ? "均价线偏强" : "均价线偏弱"),
  };
}

/**
 * Analyze volume-price coordination
 * - Volume increases when price rises = healthy
 * - Volume decreases when price falls = healthy
 * - Price rises without volume = suspicious (可能拉高出货)
 * - Progressive volume increase = strong signal
 */
function analyzeVolumePrice(
  timeline: { time: string; price: number; volume: number }[],
  prevClose: number,
): { score: number; detail: string } {
  if (!timeline || timeline.length < 10) {
    return { score: 0, detail: "数据不足" };
  }

  let score = 0;
  const details: string[] = [];

  // Calculate incremental volumes (per-minute)
  const increments: { time: string; price: number; vol: number; priceChange: number }[] = [];
  for (let i = 0; i < timeline.length; i++) {
    // timeline volumes from getStockTimeline are already per-minute
    const vol = timeline[i].volume || 0;
    const prevPrice = i > 0 ? timeline[i - 1].price : prevClose;
    const priceChange = prevPrice > 0 ? ((timeline[i].price - prevPrice) / prevPrice) * 100 : 0;
    increments.push({ time: timeline[i].time, price: timeline[i].price, vol, priceChange });
  }

  if (increments.length < 5) return { score: 0, detail: "数据不足" };

  const avgVol = increments.reduce((s, t) => s + t.vol, 0) / increments.length;

  // 1. Up-volume ratio (上涨时放量 vs 下跌时放量)
  const upVols = increments.filter(t => t.priceChange > 0).map(t => t.vol);
  const downVols = increments.filter(t => t.priceChange < 0).map(t => t.vol);
  const avgUpVol = upVols.length > 0 ? upVols.reduce((s, v) => s + v, 0) / upVols.length : 0;
  const avgDownVol = downVols.length > 0 ? downVols.reduce((s, v) => s + v, 0) / downVols.length : 1;

  if (avgUpVol > 0 && avgDownVol > 0) {
    const volRatio = avgUpVol / avgDownVol;
    if (volRatio >= 2) { score += 25; details.push(`上涨放量${volRatio.toFixed(1)}x`); }
    else if (volRatio >= 1.5) { score += 18; details.push("量价配合好"); }
    else if (volRatio >= 1.2) { score += 10; details.push("量价尚可"); }
    else if (volRatio < 0.8) { score -= 5; details.push("价涨量缩"); }
  }

  // 2. Progressive volume increase (递增放量)
  let maxProgressiveLen = 1;
  let curProgressiveLen = 1;
  for (let i = 1; i < increments.length; i++) {
    if (increments[i].vol > increments[i - 1].vol && increments[i].vol > 0 && increments[i].priceChange > 0) {
      curProgressiveLen++;
      maxProgressiveLen = Math.max(maxProgressiveLen, curProgressiveLen);
    } else {
      curProgressiveLen = 1;
    }
  }
  if (maxProgressiveLen >= 5) { score += 20; details.push(`${maxProgressiveLen}连增量上涨`); }
  else if (maxProgressiveLen >= 3) { score += 10; details.push("递增放量"); }

  // 3. Volume spike with price rise
  const maxVol = Math.max(...increments.map(t => t.vol));
  const maxVolIdx = increments.findIndex(t => t.vol === maxVol);
  const maxVolPriceChange = increments[maxVolIdx]?.priceChange || 0;
  if (maxVol > avgVol * 2 && maxVolPriceChange > 0.2) {
    score += 15;
    details.push(`${increments[maxVolIdx]?.time || ""}放量拉升`);
  }

  // 4. Late session volume trend
  const lateLen = Math.min(15, increments.length);
  const lateItems = increments.slice(-lateLen);
  const lateUpVol = lateItems.filter(t => t.priceChange > 0 && t.vol > avgVol).length;
  const lateUpRatio = lateUpVol / lateLen;
  if (lateUpRatio >= 0.4) { score += 10; details.push("尾段放量上涨"); }
  else if (lateUpRatio >= 0.25) { score += 5; }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    detail: details.length > 0 ? details.join("，") : (score > 0 ? "量价尚可" : "量价不配合"),
  };
}

/**
 * Analyze intraday chart patterns - simplified and robust version
 */
function analyzeTrendPattern(
  timeline: { time: string; price: number; volume: number }[],
  prevClose: number,
  open: number,
  high: number,
  currentPrice: number,
): { score: number; detail: string; patternTag: string } {
  if (!timeline || timeline.length < 10 || prevClose <= 0) {
    return { score: 0, detail: "数据不足", patternTag: "" };
  }

  let score = 0;
  const details: string[] = [];
  let patternTag = "";
  const safeHigh = high > 0 ? high : currentPrice;
  const safeOpen = open > 0 ? open : prevClose;

  // 1. V-shape recovery: price dropped then recovered
  const prices = timeline.map(t => t.price);
  let minPrice = Infinity;
  let minIdx = 0;
  for (let i = 0; i < prices.length; i++) {
    if (prices[i] < minPrice && prices[i] > 0) {
      minPrice = prices[i];
      minIdx = i;
    }
  }

  if (minIdx > 3 && minIdx < prices.length - 3 && minPrice > 0) {
    const dropFromPrev = ((prevClose - minPrice) / prevClose) * 100;
    const recoveryFromMin = ((currentPrice - minPrice) / minPrice) * 100;

    if (dropFromPrev >= 1 && recoveryFromMin >= 2 && currentPrice > prevClose) {
      score += 25;
      details.push(`V型反转(跌${dropFromPrev.toFixed(1)}%→涨${recoveryFromMin.toFixed(1)}%)`);
      patternTag = "V型反转";
    } else if (dropFromPrev >= 0.5 && recoveryFromMin >= 1 && currentPrice >= prevClose) {
      score += 12;
      details.push("反弹回升");
      if (!patternTag) patternTag = "反弹";
    }
  }

  // 2. Breakout to new high
  if (safeHigh > 0 && currentPrice >= safeHigh * 0.995 && currentPrice > safeOpen) {
    score += 20;
    details.push("创新高");
    if (!patternTag) patternTag = "突破新高";
  } else if (safeHigh > 0 && currentPrice >= safeHigh * 0.98 && currentPrice > safeOpen) {
    score += 10;
    details.push("接近日高");
  }

  // 3. Open-to-current trend
  if (safeOpen > 0) {
    const openToCurrentRate = ((currentPrice - safeOpen) / safeOpen) * 100;
    if (openToCurrentRate >= 3) {
      score += 15;
      details.push(`开盘至今涨${openToCurrentRate.toFixed(1)}%`);
    } else if (openToCurrentRate >= 1.5) {
      score += 8;
    }
  }

  // 4. Low above prev close (support strength)
  if (safeHigh > prevClose) {
    const lowPrice = Math.min(...prices.filter(p => p > 0));
    if (lowPrice >= prevClose * 0.99) {
      score += 10;
      details.push("低点守稳昨收");
    }
  }

  // 5. Overall trend: compare first half vs second half
  if (prices.length >= 20) {
    const halfLen = Math.floor(prices.length / 2);
    let firstHalfSum = 0, secondHalfSum = 0;
    for (let i = 0; i < halfLen; i++) firstHalfSum += prices[i];
    for (let i = halfLen; i < prices.length; i++) secondHalfSum += prices[i];
    const firstHalfAvg = firstHalfSum / halfLen;
    const secondHalfAvg = secondHalfSum / (prices.length - halfLen);

    if (firstHalfAvg > 0 && secondHalfAvg > firstHalfAvg * 1.005 && currentPrice > prevClose) {
      score += 10;
      details.push("整体上行");
      if (!patternTag) patternTag = "上行趋势";
    }

    // Staircase detection
    const quarterLen = Math.floor(prices.length / 4);
    let risingQuarters = 0;
    for (let q = 1; q < 4; q++) {
      const qStart = prices[q * quarterLen];
      const qEnd = prices[Math.min((q + 1) * quarterLen - 1, prices.length - 1)];
      if (qEnd > qStart) risingQuarters++;
    }
    if (risingQuarters >= 2 && currentPrice > prevClose) {
      score += 10;
      details.push("阶梯上涨");
      if (!patternTag) patternTag = "阶梯上涨";
    }
  }

  // 6. Simple positive: above prevClose
  if (currentPrice > prevClose && score < 5) {
    score += 3;
    if (!patternTag) patternTag = "偏强";
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    detail: details.length > 0 ? details.join("，") : (score > 0 ? "趋势尚可" : "无明显形态"),
    patternTag,
  };
}

/**
 * Analyze intraday MACD signals
 * - Golden cross = bullish
 * - MACD turning positive = bullish
 * - Divergence = warning
 */
function analyzeMACD(
  timeline: { time: string; price: number }[],
): { score: number; detail: string } {
  if (!timeline || timeline.length < 30) {
    return { score: 0, detail: "数据不足" };
  }

  const prices = timeline.map(t => t.price);

  // Calculate MACD (12, 26, 9) - same as chart-shared indicators
  const ema12: number[] = [];
  const ema26: number[] = [];
  const dif: number[] = [];
  const dea: number[] = [];
  const macd: number[] = [];

  for (let i = 0; i < prices.length; i++) {
    const p = prices[i];
    if (i === 0) {
      ema12.push(p);
      ema26.push(p);
      dif.push(0);
      dea.push(0);
      macd.push(0);
    } else {
      ema12.push(ema12[i - 1] * 11 / 13 + p * 2 / 13);
      ema26.push(ema26[i - 1] * 25 / 27 + p * 2 / 27);
      dif.push(ema12[i] - ema26[i]);
      dea.push(dea[i - 1] * 8 / 10 + dif[i] * 2 / 10);
      macd.push((dif[i] - dea[i]) * 2);
    }
  }

  let score = 0;
  const details: string[] = [];
  const len = prices.length;

  // 1. Golden cross detection (DIF crosses above DEA)
  const checkLen = Math.min(20, len - 1);
  let goldenCross = false;
  let goldenCrossIdx = -1;
  for (let i = len - checkLen; i < len; i++) {
    if (i > 0 && dif[i - 1] <= dea[i - 1] && dif[i] > dea[i]) {
      goldenCross = true;
      goldenCrossIdx = i;
      break;
    }
  }
  if (goldenCross) {
    score += 30;
    details.push("MACD金叉");
  }

  // 2. DIF turning positive
  if (dif[len - 1] > 0 && dif[len - 2] <= 0) {
    score += 20;
    details.push("DIF转正");
  } else if (dif[len - 1] > 0) {
    score += 10;
    details.push("DIF为正");
  }

  // 3. MACD histogram turning positive
  if (macd[len - 1] > 0 && macd[len - 2] <= 0) {
    score += 15;
    details.push("红柱出现");
  } else if (macd[len - 1] > 0 && macd[len - 1] > macd[len - 2]) {
    score += 10;
    details.push("红柱增长");
  }

  // 4. DIF above DEA (bullish alignment)
  if (dif[len - 1] > dea[len - 1]) {
    score += 10;
    details.push("DIF>DEA");
  }

  // 5. Zero line position
  if (dif[len - 1] > 0 && dea[len - 1] > 0) {
    score += 10;
    details.push("零轴上方");
  }

  // 6. Bottom divergence detection
  // Price making lower lows while MACD making higher lows
  const recentLen = Math.min(30, len);
  const recentPrices = prices.slice(-recentLen);
  const recentDif = dif.slice(-recentLen);

  if (recentLen >= 15) {
    const halfLen = Math.floor(recentLen / 2);
    const firstHalfMinPrice = Math.min(...recentPrices.slice(0, halfLen));
    const secondHalfMinPrice = Math.min(...recentPrices.slice(halfLen));
    const firstHalfMinDif = Math.min(...recentDif.slice(0, halfLen));
    const secondHalfMinDif = Math.min(...recentDif.slice(halfLen));

    if (secondHalfMinPrice < firstHalfMinPrice && secondHalfMinDif > firstHalfMinDif) {
      score += 10;
      details.push("底背离迹象");
    }
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    detail: details.length > 0 ? details.join("，") : (score > 0 ? "MACD偏强" : "MACD偏弱"),
  };
}

/**
 * Analyze capital flow (资金流向)
 */
function analyzeCapitalFlow(
  mainNetInflow: number,
  amount: number,
  changePercent: number,
): { score: number; detail: string } {
  let score = 0;
  const details: string[] = [];

  if (mainNetInflow > 0 && amount > 0) {
    const inflowRatio = mainNetInflow / amount;
    if (inflowRatio > 0.1) { score += 30; details.push("主力大幅流入"); }
    else if (inflowRatio > 0.05) { score += 22; details.push("主力明显流入"); }
    else if (inflowRatio > 0.02) { score += 15; details.push("主力净流入"); }
    else { score += 5; details.push("主力微流入"); }

    // Inflow + price rise = strong
    if (changePercent > 2) { score += 15; details.push("资金推升"); }
    else if (changePercent > 0.5) { score += 8; }
  } else if (mainNetInflow < 0) {
    const outflowRatio = Math.abs(mainNetInflow) / (amount || 1);
    if (outflowRatio > 0.05) {
      score -= 5;
      details.push("主力流出");
    }
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    detail: details.length > 0 ? details.join("，") : (score > 0 ? "资金偏多" : "资金中性"),
  };
}

/**
 * Analyze Volume-Price Co-rise (量价齐升)
 * A strong bullish signal where BOTH volume and price rise together consistently.
 */
function analyzeVolumePriceCoRise(
  timeline: { time: string; price: number; volume: number }[],
  prevClose: number,
): { score: number; detail: string } {
  if (!timeline || timeline.length < 10 || prevClose <= 0) {
    return { score: 0, detail: "数据不足" };
  }

  let score = 0;
  const details: string[] = [];

  // Calculate per-minute changes
  const changes: { time: string; priceChange: number; volChange: number; isCoRise: boolean }[] = [];
  for (let i = 1; i < timeline.length; i++) {
    const priceChange = ((timeline[i].price - timeline[i - 1].price) / timeline[i - 1].price) * 100;
    const volChange = timeline[i - 1].volume > 0
      ? ((timeline[i].volume - timeline[i - 1].volume) / timeline[i - 1].volume) * 100
      : 0;
    changes.push({
      time: timeline[i].time,
      priceChange,
      volChange,
      isCoRise: priceChange > 0 && volChange > 0,
    });
  }

  // 1. Count consecutive co-rise minutes
  let maxCoRiseLen = 0;
  let curCoRiseLen = 0;
  for (const c of changes) {
    if (c.isCoRise) {
      curCoRiseLen++;
      maxCoRiseLen = Math.max(maxCoRiseLen, curCoRiseLen);
    } else {
      curCoRiseLen = 0;
    }
  }

  if (maxCoRiseLen >= 8) { score += 30; details.push(`${maxCoRiseLen}分钟量价齐升`); }
  else if (maxCoRiseLen >= 5) { score += 22; details.push(`${maxCoRiseLen}分钟量价齐升`); }
  else if (maxCoRiseLen >= 3) { score += 12; details.push("量价齐升"); }

  // 2. Overall co-rise ratio
  const coRiseCount = changes.filter(c => c.isCoRise).length;
  const coRiseRatio = changes.length > 0 ? coRiseCount / changes.length : 0;
  if (coRiseRatio >= 0.5) { score += 25; details.push(`量价齐升占比${(coRiseRatio * 100).toFixed(0)}%`); }
  else if (coRiseRatio >= 0.35) { score += 15; details.push("量价配合偏强"); }
  else if (coRiseRatio >= 0.25) { score += 8; }

  // 3. Price rise + volume rise in same direction (not just both positive)
  // Check if large volume bars align with price up
  const avgVol = timeline.reduce((s, t) => s + t.volume, 0) / timeline.length;
  const bigVolUpBars = changes.filter((c, idx) => {
    const volIdx = idx + 1;
    return c.priceChange > 0 && volIdx < timeline.length && timeline[volIdx].volume > avgVol * 1.5;
  });
  if (bigVolUpBars.length >= 3) { score += 15; details.push("放量上涨密集"); }
  else if (bigVolUpBars.length >= 2) { score += 8; }

  // 4. Sustained: both average price change and average volume change are positive
  const avgPriceChange = changes.reduce((s, c) => s + c.priceChange, 0) / changes.length;
  const avgVolChange = changes.reduce((s, c) => s + c.volChange, 0) / changes.length;
  if (avgPriceChange > 0 && avgVolChange > 0) { score += 10; details.push("整体量价齐升"); }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    detail: details.length > 0 ? details.join("，") : (score > 0 ? "量价尚可" : "量价背离"),
  };
}

/**
 * Analyze New High Breakout (突破新高)
 * Detect if the stock is breaking to new intraday highs with volume confirmation.
 */
function analyzeNewHighBreakout(
  timeline: { time: string; price: number; volume: number }[],
  prevClose: number,
  high: number,
  currentPrice: number,
): { score: number; detail: string } {
  if (!timeline || timeline.length < 10 || prevClose <= 0) {
    return { score: 0, detail: "数据不足" };
  }

  let score = 0;
  const details: string[] = [];
  const prices = timeline.map(t => t.price);

  // 1. Current price vs prev close (breaking yesterday's high is very strong)
  if (currentPrice > prevClose * 1.03) { score += 20; details.push("突破昨收3%+"); }
  else if (currentPrice > prevClose * 1.02) { score += 15; details.push("突破昨收2%+"); }
  else if (currentPrice > prevClose * 1.01) { score += 8; details.push("高于昨收"); }

  // 2. Track new high counts (how many times price makes a new high)
  let runningHigh = prices[0];
  let newHighCount = 0;
  let lastNewHighIdx = 0;
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > runningHigh) {
      runningHigh = prices[i];
      newHighCount++;
      lastNewHighIdx = i;
    }
  }

  if (newHighCount >= 10) { score += 25; details.push(`${newHighCount}次创新高`); }
  else if (newHighCount >= 5) { score += 18; details.push(`${newHighCount}次创新高`); }
  else if (newHighCount >= 3) { score += 10; details.push("多次创新高"); }

  // 3. Recent breakout (new high in last 10 minutes = very fresh)
  const recentLen = Math.min(10, prices.length);
  const recentHighs = prices.slice(-recentLen).filter((p, i) => {
    const prevPrices = prices.slice(0, prices.length - recentLen + i);
    return prevPrices.length > 0 && p > Math.max(...prevPrices);
  });
  if (recentHighs.length >= 2) { score += 20; details.push("近期突破新高"); }
  else if (recentHighs.length >= 1) { score += 10; details.push("刚刚创新高"); }

  // 4. Current price near the day's high (within 0.5%)
  const dayHigh = Math.max(...prices);
  if (currentPrice >= dayHigh * 0.995) { score += 15; details.push("价格接近日高"); }
  else if (currentPrice >= dayHigh * 0.99) { score += 8; }

  // 5. Volume confirmation on breakout
  const avgVol = timeline.reduce((s, t) => s + t.volume, 0) / timeline.length;
  if (lastNewHighIdx > 0 && timeline[lastNewHighIdx].volume > avgVol * 1.5) {
    score += 10; details.push("突破放量确认");
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    detail: details.length > 0 ? details.join("，") : (score > 0 ? "偏强" : "未突破"),
  };
}

// ── Composite Score Calculation ─────────────────────────

function calculateCompositeScore(stock: IntradayStock): { score: number; detail: string; label: string } {
  // Weighted composite score with 7 dimensions
  const weights = {
    vwap: 0.15,
    volumePattern: 0.20,
    trendPattern: 0.20,
    macd: 0.10,
    capitalFlow: 0.10,
    coRise: 0.15,      // 量价齐升
    breakout: 0.10,    // 突破新高
  };

  const weighted =
    stock.vwapScore * weights.vwap +
    stock.volumePatternScore * weights.volumePattern +
    stock.trendPatternScore * weights.trendPattern +
    stock.macdScore * weights.macd +
    stock.capitalFlowScore * weights.capitalFlow +
    stock.coRiseScore * weights.coRise +
    stock.breakoutScore * weights.breakout;

  const score = Math.round(Math.max(0, Math.min(100, weighted)));

  // Determine label
  let label: string;
  if (score >= 70) label = "强推";
  else if (score >= 55) label = "推荐";
  else if (score >= 40) label = "关注";
  else if (score >= 25) label = "观望";
  else label = "偏弱";

  // Build detail
  const parts: string[] = [];
  if (stock.vwapScore >= 30) parts.push(stock.vwapDetail);
  if (stock.volumePatternScore >= 30) parts.push(stock.volumePatternDetail);
  if (stock.trendPatternScore >= 30) parts.push(stock.trendPatternDetail);
  if (stock.macdScore >= 30) parts.push(stock.macdDetail);
  if (stock.capitalFlowScore >= 30) parts.push(stock.capitalFlowDetail);
  if (stock.coRiseScore >= 30) parts.push(stock.coRiseDetail);
  if (stock.breakoutScore >= 30) parts.push(stock.breakoutDetail);

  return {
    score,
    detail: parts.length > 0 ? parts.join("；") : "综合评估",
    label,
  };
}

// ── Main Handler ────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const strategy = searchParams.get("strategy") || "composite";
  const minChange = parseFloat(searchParams.get("minChange") || "-3");
  const maxChange = parseFloat(searchParams.get("maxChange") || "9");
  const maxMarketCap = parseFloat(searchParams.get("maxMarketCap") || "500");
  const minTurnover = parseFloat(searchParams.get("minTurnover") || "1");
  const minVolumeRatio = parseFloat(searchParams.get("minVolumeRatio") || "0.5");
  const minCompositeScore = parseInt(searchParams.get("minCompositeScore") || "30");
  const maxResults = parseInt(searchParams.get("maxResults") || "50");
  const forceRefresh = searchParams.get("refresh") === "1";
  const enableChiNext = searchParams.get("chiNext") === "true";
  const enableSTAR = searchParams.get("star") === "true";

  // Check cache
  const cacheKey = `${strategy}|${minChange}|${maxChange}|${maxMarketCap}|${minTurnover}|${minVolumeRatio}|${minCompositeScore}|${maxResults}|${enableChiNext}|${enableSTAR}`;
  if (!forceRefresh) {
    const cached = screenerCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json({ ...cached.data, cached: true });
    }
  }

  try {
    // Step 1: Determine sort field based on strategy
    let sortBy = "f3"; // default: sort by change %
    if (strategy === "volume_ratio") sortBy = "f10";      // 量比
    else if (strategy === "capital_flow") sortBy = "f62";  // 主力净流入
    else if (strategy === "turnover") sortBy = "f8";       // 换手率
    else if (strategy === "amount") sortBy = "f6";         // 成交额
    else if (strategy === "composite") sortBy = "f10";     // 量比优先筛选

    // Step 2: Fetch stocks from EastMoney
    const rawStocks = await fetchAllAShares(
      sortBy, "desc", 200,
      minChange, maxChange, maxMarketCap, minTurnover, minVolumeRatio
    );

    if (rawStocks.length === 0) {
      return NextResponse.json({
        success: false,
        stocks: [],
        totalCount: 0,
        filteredCount: 0,
        timestamp: new Date().toISOString(),
        strategy,
        timeWindow: "full_day",
        timeWindowDetail: "无股票数据",
        error: "未获取到股票数据",
      } as IntradayScreenerResult);
    }

    // Step 3: Parse and filter
    const candidates: IntradayStock[] = [];

    for (const stock of rawStocks) {
      const code = String(stock.f12 || "");
      const name = String(stock.f14 || "");

      if (isETF(code)) continue;
      if (isST(name)) continue;

      // Board filter
      if (!enableChiNext && (code.startsWith("300") || code.startsWith("301"))) continue;
      if (!enableSTAR && (code.startsWith("688") || code.startsWith("689"))) continue;
      if (code.startsWith("8") || code.startsWith("4")) continue; // 北交所

      // Main board or explicitly enabled
      if (!isMainBoard(code) && !enableChiNext && !enableSTAR) continue;

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
      const marketCap = parseFloat(stock.f20) || 0;
      const circulatingMarketCap = parseFloat(stock.f21) || 0;
      const mainNetInflow = parseFloat(stock.f62) || 0;
      const volumeRatio = parseFloat(stock.f10) || 0;

      if (price <= 0 || prevClose <= 0) continue;
      if (changePercent < minChange || changePercent > maxChange) continue;

      const marketCapYi = marketCap / 1e8;
      if (marketCapYi > maxMarketCap || marketCapYi <= 0) continue;
      if (turnover < minTurnover) continue;
      if (volumeRatio < minVolumeRatio) continue;

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
        volumeRatio,
        vwapScore: 0,
        vwapDetail: "",
        volumePatternScore: 0,
        volumePatternDetail: "",
        trendPatternScore: 0,
        trendPatternDetail: "",
        macdScore: 0,
        macdDetail: "",
        capitalFlowScore: 0,
        capitalFlowDetail: "",
        coRiseScore: 0,
        coRiseDetail: "",
        breakoutScore: 0,
        breakoutDetail: "",
        compositeScore: 0,
        compositeDetail: "",
        patternTag: "",
      });
    }

    // Step 4: Intraday analysis for candidates (batch fetch timelines)
    if (candidates.length > 0) {
      let earlyDataCount = 0;

      const batchSize = 10;
      for (let i = 0; i < candidates.length; i += batchSize) {
        const batch = candidates.slice(i, i + batchSize);
        const timelinePromises = batch.map(async (stock) => {
          try {
            const fullTimeline = await getStockTimeline(stock.symbol);

            // Filter to first 60 minutes (9:30-10:30) - STRICT early session only
            const earlyTimeline = filterEarlyTimeline(fullTimeline);
            const timeline = earlyTimeline.length >= 5 ? earlyTimeline : fullTimeline;

            if (earlyTimeline.length >= 5) earlyDataCount++;

            // VWAP analysis
            try {
              const vwapResult = analyzeVWAP(timeline, stock.price);
              stock.vwapScore = vwapResult.score;
              stock.vwapDetail = vwapResult.detail;
            } catch (e) { /* skip */ }

            // Volume-price analysis
            try {
              const volResult = analyzeVolumePrice(timeline, stock.prevClose);
              stock.volumePatternScore = volResult.score;
              stock.volumePatternDetail = volResult.detail;
            } catch (e) { /* skip */ }

            // Trend pattern analysis
            try {
              const safeOpen = stock.open > 0 ? stock.open : stock.price;
              const safeHigh = stock.high > 0 ? stock.high : stock.price;
              const trendResult = analyzeTrendPattern(timeline, stock.prevClose, safeOpen, safeHigh, stock.price);
              stock.trendPatternScore = trendResult.score;
              stock.trendPatternDetail = trendResult.detail;
              stock.patternTag = trendResult.patternTag;
            } catch (e) { /* skip - defaults to 0 */ }

            // MACD analysis
            try {
              const macdResult = analyzeMACD(timeline);
              stock.macdScore = macdResult.score;
              stock.macdDetail = macdResult.detail;
            } catch (e) { /* skip */ }

            // Capital flow analysis (no timeline dependency)
            try {
              const capitalResult = analyzeCapitalFlow(stock.mainNetInflow, stock.amount, stock.changePercent);
              stock.capitalFlowScore = capitalResult.score;
              stock.capitalFlowDetail = capitalResult.detail;
            } catch (e) { /* skip */ }

            // Volume-Price Co-rise analysis
            try {
              const coRiseResult = analyzeVolumePriceCoRise(timeline, stock.prevClose);
              stock.coRiseScore = coRiseResult.score;
              stock.coRiseDetail = coRiseResult.detail;
            } catch (e) { /* skip */ }

            // New High Breakout analysis
            try {
              const safeHigh = stock.high > 0 ? stock.high : stock.price;
              const breakoutResult = analyzeNewHighBreakout(timeline, stock.prevClose, safeHigh, stock.price);
              stock.breakoutScore = breakoutResult.score;
              stock.breakoutDetail = breakoutResult.detail;
            } catch (e) { /* skip */ }

            // Calculate composite score
            try {
              const composite = calculateCompositeScore(stock);
              stock.compositeScore = composite.score;
              stock.compositeDetail = composite.detail;
              stock.patternTag = stock.patternTag || composite.label;
            } catch (e) { /* skip */ }
          } catch (e) {
            console.error(`Intraday analysis error for ${stock.symbol}:`, e);
          }
        });
        await Promise.allSettled(timelinePromises);
      }

      // Filter by composite score
      const filtered = candidates.filter(s => s.compositeScore >= minCompositeScore);

      // Sort by composite score
      filtered.sort((a, b) => {
        if (b.compositeScore !== a.compositeScore) return b.compositeScore - a.compositeScore;
        return b.changePercent - a.changePercent;
      });

      // Limit results
      const resultStocks = filtered.slice(0, maxResults);

      // Determine time window info
      const usedEarlySession = earlyDataCount > 0;
      const timeWindow = usedEarlySession ? "09:30-10:30" : "full_day";
      const timeWindowDetail = usedEarlySession
        ? `严格使用开盘1小时数据(${earlyDataCount}/${candidates.length}只使用早段数据)`
        : "早段数据不足5个点，回退至全天数据";

      const result: IntradayScreenerResult = {
        success: true,
        stocks: resultStocks,
        totalCount: rawStocks.length,
        filteredCount: filtered.length,
        timestamp: new Date().toISOString(),
        strategy,
        timeWindow,
        timeWindowDetail,
      };

      screenerCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return NextResponse.json(result);
    }

    return NextResponse.json({
      success: true,
      stocks: [],
      totalCount: rawStocks.length,
      filteredCount: 0,
      timestamp: new Date().toISOString(),
      strategy,
      timeWindow: "full_day",
      timeWindowDetail: "无候选股票",
    } as IntradayScreenerResult);
  } catch (e: any) {
    console.error("Intraday screener error:", e);
    return NextResponse.json({
      success: false,
      stocks: [],
      totalCount: 0,
      filteredCount: 0,
      timestamp: new Date().toISOString(),
      strategy,
      timeWindow: "full_day",
      timeWindowDetail: "异常回退",
      error: e.message || "选股服务异常",
    } as IntradayScreenerResult);
  }
}
