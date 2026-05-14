import { NextRequest, NextResponse } from "next/server";
import { getCachedTimeline, setCachedTimeline } from "@/lib/server-timeline-cache";

/**
 * Early Trading Screener API (开盘1小时选股)
 * GET /api/stock/early-screen
 *
 * Key difference from intraday-screener:
 * - Focuses ONLY on the first 60 minutes of trading (9:30 - 10:30)
 * - Uses early-specific analysis strategies
 * - Can screen stocks during early trading, no need to wait for full day
 *
 * Early-specific strategies:
 * 1. 高开强走 - Gap up and maintain upward momentum
 * 2. 低开反转 - Gap down then reverse upward
 * 3. 开盘放量 - Opening volume surge (institutional activity)
 * 4. 量比飙升 - Volume ratio spike in early session
 * 5. 均价线快速突破 - Quick VWAP breakthrough and hold
 * 6. 早盘MACD金叉 - Early MACD golden cross
 * 7. 主力早盘抢筹 - Early institutional capital inflow
 * 8. 分时阶梯启动 - Staircase pattern starting early
 */

// ── Server-side Cache ───────────────────────────────────
const earlyScreenCache = new Map<string, { data: EarlyScreenResult; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour – only refresh when user clicks refresh button

// ── Types ──────────────────────────────────────────────

interface EarlyScreenStock {
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
  // ── Early-specific scores ──
  openingPatternScore: number;      // 开盘形态 (高开强走/低开反转)
  openingPatternDetail: string;
  earlyVolumeScore: number;         // 早盘放量评分
  earlyVolumeDetail: string;
  earlyVwapScore: number;           // 早盘均价线关系
  earlyVwapDetail: string;
  earlyTrendScore: number;          // 早盘趋势形态
  earlyTrendDetail: string;
  earlyMacdScore: number;           // 早盘MACD评分
  earlyMacdDetail: string;
  earlyCapitalScore: number;        // 早盘资金评分
  earlyCapitalDetail: string;
  earlyCoRiseScore: number;          // 量价齐升评分
  earlyCoRiseDetail: string;
  earlyBreakoutScore: number;        // 突破新高评分
  earlyBreakoutDetail: string;
  // ── Composite ──
  earlyCompositeScore: number;      // 早盘综合评分
  earlyCompositeDetail: string;
  patternTag: string;               // 形态标签
  // ── Early-specific data ──
  openGapRate: number;              // 开盘缺口比例 (%)
  first30MinChange: number;         // 前30分钟涨跌幅 (%)
  first60MinChange: number;         // 前60分钟涨跌幅 (%)
  earlyVolumeRatio: number;         // 早盘量比 (前60min成交量 vs 正常水平)
}

interface EarlyScreenResult {
  success: boolean;
  stocks: EarlyScreenStock[];
  totalCount: number;
  filteredCount: number;
  timestamp: string;
  strategy: string;
  tradingPhase: string;            // "开盘15分钟" | "开盘30分钟" | "开盘1小时" | "盘中" | "非交易时间"
  minutesSinceOpen: number;        // 距开盘经过分钟数
  error?: string;
  cached?: boolean;
}

// ── Board checks ────────────────────────────────────

function isMainBoard(code: string): boolean {
  if (/^60[0135]\d{3}$/.test(code)) return true;
  if (/^00[01]\d{3}$/.test(code)) return true;
  if (/^002\d{3}$/.test(code)) return true;
  return false;
}

function isST(name: string): boolean {
  return /ST|\*ST|SST|S\*ST/.test(name.toUpperCase());
}

function isETF(code: string): boolean {
  return code.startsWith("51") || code.startsWith("56") || code.startsWith("58") ||
    code.startsWith("15") || code.startsWith("16") || code.startsWith("18");
}

// ── Trading Phase Detection ─────────────────────────

function getTradingPhase(): { phase: string; minutesSinceOpen: number } {
  const now = new Date();
  const chinaOffset = 8 * 60;
  const chinaTime = new Date(now.getTime() + (chinaOffset + now.getTimezoneOffset()) * 60000);
  const h = chinaTime.getHours();
  const m = chinaTime.getMinutes();
  const dayOfWeek = chinaTime.getDay();

  // Weekend
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return { phase: "非交易时间", minutesSinceOpen: 0 };
  }

  // Before market
  if (h < 9 || (h === 9 && m < 30)) {
    return { phase: "非交易时间", minutesSinceOpen: 0 };
  }

  // Morning session
  if (h === 9 && m >= 30) {
    const mins = m - 30;
    if (mins <= 15) return { phase: "开盘15分钟", minutesSinceOpen: mins + 1 };
    if (mins <= 30) return { phase: "开盘30分钟", minutesSinceOpen: mins + 1 };
    return { phase: "开盘1小时", minutesSinceOpen: mins + 1 };
  }
  if (h === 10) {
    const mins = 30 + m + 1;
    if (mins <= 60) return { phase: "开盘1小时", minutesSinceOpen: mins };
    return { phase: "盘中", minutesSinceOpen: mins };
  }
  if (h === 11 && m <= 30) {
    return { phase: "盘中", minutesSinceOpen: 30 + 60 + m + 1 };
  }

  // Lunch break
  if ((h === 11 && m > 30) || (h === 12)) {
    return { phase: "午休", minutesSinceOpen: 121 };
  }

  // Afternoon session
  if (h >= 13 && h < 15) {
    return { phase: "盘中", minutesSinceOpen: 121 + (h - 13) * 60 + m + 1 };
  }

  // After market
  return { phase: "收盘", minutesSinceOpen: 242 };
}

// ── Fetch A-share stocks ────────────────────────────

async function fetchAllAShares(
  sortBy: string = "f10",
  pageSize: number = 300,
): Promise<any[]> {
  const allStocks: any[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= 3) {
    try {
      const url = `http://push2.eastmoney.com/api/qt/clist/get?pn=${page}&pz=${pageSize}&po=1&np=1&fltt=2&invt=2&fid=${sortBy}&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f14,f15,f16,f17,f18,f20,f21,f22,f62,f128,f140,f141,f136`;

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
      console.error("Early screen fetch error:", e);
      hasMore = false;
    }
  }

  return allStocks;
}

// ── Fetch 1-minute timeline data ───────────────────────

async function getStockTimeline(symbol: string): Promise<{
  time: string; price: number; volume: number; avgPrice?: number;
}[]> {
  // Check shared cache first
  const cached = getCachedTimeline(symbol);
  if (cached) return cached;

  try {
    const sinaSymbol = symbol.startsWith("6") ? `sh${symbol}` : `sz${symbol}`;

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

// ── Early Trading Analysis Functions ─────────────────

/**
 * Analyze opening pattern (开盘形态)
 * - 高开强走: Open above prevClose AND maintain upward
 * - 低开反转: Open below but reverse above prevClose quickly
 * - 平开上攻: Open near prevClose then push up
 */
function analyzeOpeningPattern(
  timeline: { time: string; price: number; volume: number; avgPrice?: number }[],
  prevClose: number,
  open: number,
  currentPrice: number,
): { score: number; detail: string; openGapRate: number } {
  if (!timeline || timeline.length < 5 || prevClose <= 0) {
    return { score: 0, detail: "数据不足", openGapRate: 0 };
  }

  let score = 0;
  const details: string[] = [];
  const openGapRate = open > 0 ? ((open - prevClose) / prevClose) * 100 : 0;

  // Categorize opening type
  const isGapUp = openGapRate >= 1;
  const isGapDown = openGapRate <= -1;
  const isFlatOpen = Math.abs(openGapRate) < 1;

  // 1. Gap up and continue rising (高开强走)
  if (isGapUp) {
    if (currentPrice > open) {
      // Continuation after gap up
      const continuationRate = ((currentPrice - open) / open) * 100;
      if (continuationRate >= 2) { score += 30; details.push(`高开强走+${continuationRate.toFixed(1)}%`); }
      else if (continuationRate >= 1) { score += 22; details.push(`高开续涨+${continuationRate.toFixed(1)}%`); }
      else if (continuationRate >= 0) { score += 12; details.push("高开持稳"); }
    } else if (currentPrice >= prevClose) {
      // Gap up but pulled back, still above prevClose
      score += 8;
      details.push("高开回落但守稳");
    } else {
      // Gap up then fell below - bad
      score -= 5;
      details.push("高开低走(警惕)");
    }
  }

  // 2. Gap down reversal (低开反转) - Very strong signal
  if (isGapDown) {
    if (currentPrice > prevClose) {
      // Full reversal - very bullish
      const reversalRate = ((currentPrice - open) / open) * 100;
      score += 35;
      details.push(`低开反转+${reversalRate.toFixed(1)}%`);
    } else if (currentPrice > open) {
      // Partial reversal
      const reversalRate = ((currentPrice - open) / open) * 100;
      if (reversalRate >= 1) { score += 18; details.push(`低开回升+${reversalRate.toFixed(1)}%`); }
      else { score += 8; details.push("低开回升"); }
    } else {
      score -= 3;
      details.push("低开低走");
    }
  }

  // 3. Flat open and push up (平开上攻)
  if (isFlatOpen) {
    if (currentPrice > prevClose) {
      const pushRate = ((currentPrice - prevClose) / prevClose) * 100;
      if (pushRate >= 2) { score += 25; details.push(`平开上攻+${pushRate.toFixed(1)}%`); }
      else if (pushRate >= 1) { score += 15; details.push("平开走强"); }
      else { score += 8; details.push("平开微涨"); }
    }
  }

  // 4. Opening 15-min momentum
  const first15Min = timeline.filter(t => {
    const [h, m] = t.time.split(':').map(Number);
    return (h === 9 && m >= 30 && m <= 44) || (h === 9 && m >= 30);
  }).slice(0, 15);

  if (first15Min.length >= 5) {
    const firstPrice = first15Min[0].price;
    const last15Price = first15Min[first15Min.length - 1].price;
    if (firstPrice > 0 && last15Price > firstPrice) {
      const momentum15 = ((last15Price - firstPrice) / firstPrice) * 100;
      if (momentum15 >= 1.5) { score += 15; details.push(`开盘15分钟强势+${momentum15.toFixed(1)}%`); }
      else if (momentum15 >= 0.5) { score += 8; details.push("开盘动能偏强"); }
    }
  }

  // 5. Never broke below open price (开盘价支撑)
  const allAboveOpen = timeline.every(t => t.price >= open * 0.995);
  if (allAboveOpen && currentPrice > open) {
    score += 10;
    details.push("未破开盘价");
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    detail: details.length > 0 ? details.join("，") : (score > 0 ? "开盘形态尚可" : "开盘形态偏弱"),
    openGapRate: Number(openGapRate.toFixed(2)),
  };
}

/**
 * Analyze early volume pattern (早盘放量)
 * - First 30 min volume vs expected
 * - Volume acceleration
 * - Big volume bars with price rise
 */
function analyzeEarlyVolume(
  timeline: { time: string; price: number; volume: number; avgPrice?: number }[],
  prevClose: number,
  volumeRatio: number,
): { score: number; detail: string; earlyVolumeRatio: number; first30MinChange: number; first60MinChange: number } {
  if (!timeline || timeline.length < 5 || prevClose <= 0) {
    return { score: 0, detail: "数据不足", earlyVolumeRatio: 0, first30MinChange: 0, first60MinChange: 0 };
  }

  let score = 0;
  const details: string[] = [];

  // Split into early segments
  const first15Min = timeline.slice(0, Math.min(15, timeline.length));
  const first30Min = timeline.slice(0, Math.min(30, timeline.length));
  const first60Min = timeline.slice(0, Math.min(60, timeline.length));

  // Calculate per-minute average volumes
  const totalVol = timeline.reduce((s, t) => s + t.volume, 0);
  const avgVol = totalVol / timeline.length;

  const vol15 = first15Min.reduce((s, t) => s + t.volume, 0);
  const vol30 = first30Min.reduce((s, t) => s + t.volume, 0);
  const vol60 = first60Min.reduce((s, t) => s + t.volume, 0);

  const avgVol15 = first15Min.length > 0 ? vol15 / first15Min.length : 0;
  const avgVol30 = first30Min.length > 0 ? vol30 / first30Min.length : 0;
  const avgVol60 = first60Min.length > 0 ? vol60 / first60Min.length : 0;

  // Early volume ratio (first 60 min vs overall average)
  const earlyVolumeRatio = avgVol > 0 ? avgVol60 / avgVol : volumeRatio;

  // Calculate price changes
  const first30MinChange = first30Min.length > 0
    ? ((first30Min[first30Min.length - 1].price - prevClose) / prevClose) * 100
    : 0;
  const first60MinChange = first60Min.length > 0
    ? ((first60Min[first60Min.length - 1].price - prevClose) / prevClose) * 100
    : 0;

  // 1. First 15 min volume surge
  if (avgVol15 > 0 && avgVol > 0) {
    const ratio15 = avgVol15 / avgVol;
    if (ratio15 >= 3) { score += 25; details.push(`开盘15分钟放量${ratio15.toFixed(1)}x`); }
    else if (ratio15 >= 2) { score += 18; details.push(`开盘放量${ratio15.toFixed(1)}x`); }
    else if (ratio15 >= 1.5) { score += 10; details.push("开盘量增"); }
  }

  // 2. Volume ratio from quote data
  if (volumeRatio >= 3) { score += 20; details.push(`量比${volumeRatio.toFixed(1)}(极度活跃)`); }
  else if (volumeRatio >= 2) { score += 15; details.push(`量比${volumeRatio.toFixed(1)}(明显放量)`); }
  else if (volumeRatio >= 1.5) { score += 8; details.push("量比偏高"); }

  // 3. Volume-price coordination in early session
  const upBars = first60Min.filter((t, i) => {
    const prevPrice = i > 0 ? first60Min[i - 1].price : prevClose;
    return t.price > prevPrice && t.volume > avgVol;
  });
  const upRatio = first60Min.length > 0 ? upBars.length / first60Min.length : 0;
  if (upRatio >= 0.3) { score += 15; details.push("上涨放量明显"); }
  else if (upRatio >= 0.15) { score += 8; details.push("上涨有量配合"); }

  // 4. Volume acceleration (递增放量 in early session)
  let maxAccel = 1;
  let curAccel = 1;
  for (let i = 1; i < Math.min(20, timeline.length); i++) {
    if (timeline[i].volume > timeline[i - 1].volume && timeline[i].price > timeline[i - 1].price) {
      curAccel++;
      maxAccel = Math.max(maxAccel, curAccel);
    } else {
      curAccel = 1;
    }
  }
  if (maxAccel >= 5) { score += 12; details.push(`${maxAccel}连增量上攻`); }
  else if (maxAccel >= 3) { score += 6; details.push("递增放量"); }

  // 5. Giant volume bar with price rise (单分钟巨量拉升)
  const maxVolBar = first60Min.reduce((max, t) => t.volume > max.volume ? t : max, { volume: 0, price: 0, time: "" } as any);
  if (maxVolBar.volume > avgVol * 3 && first60MinChange > 0) {
    score += 10;
    details.push(`${maxVolBar.time || "早盘"}巨量拉升`);
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    detail: details.length > 0 ? details.join("，") : (score > 0 ? "早盘量能尚可" : "早盘量能不足"),
    earlyVolumeRatio: Number(earlyVolumeRatio.toFixed(2)),
    first30MinChange: Number(first30MinChange.toFixed(2)),
    first60MinChange: Number(first60MinChange.toFixed(2)),
  };
}

/**
 * Analyze early VWAP relationship (早盘均价线)
 * - Quick VWAP breakthrough and hold
 * - VWAP slope in early session
 */
function analyzeEarlyVWAP(
  timeline: { time: string; price: number; volume: number; avgPrice?: number }[],
  currentPrice: number,
): { score: number; detail: string } {
  if (!timeline || timeline.length < 10) {
    return { score: 0, detail: "数据不足" };
  }

  let score = 0;
  const details: string[] = [];

  const lastItem = timeline[timeline.length - 1];
  const vwap = lastItem.avgPrice || lastItem.price;

  // 1. Current price vs VWAP
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

  // 2. Quick VWAP breakthrough (突破均价线的时间)
  let crossIdx = -1;
  for (let i = 1; i < timeline.length; i++) {
    const prevPrice = timeline[i - 1].price;
    const prevAvg = timeline[i - 1].avgPrice || prevPrice;
    const curPrice = timeline[i].price;
    const curAvg = timeline[i].avgPrice || curPrice;
    if (prevPrice <= prevAvg && curPrice > curAvg) {
      crossIdx = i;
      break;
    }
  }

  if (crossIdx >= 0) {
    if (crossIdx < 15) { score += 20; details.push(`快速突破均价(${timeline[crossIdx].time})`); }
    else if (crossIdx < 30) { score += 12; details.push("较早突破均价线"); }
    else { score += 5; details.push("突破均价线"); }
  }

  // 3. VWAP slope in early session
  const recentLen = Math.min(15, timeline.length);
  const recentItems = timeline.slice(-recentLen);
  let vwapUpCount = 0;
  for (let i = 1; i < recentItems.length; i++) {
    const prevAvg = recentItems[i - 1].avgPrice || recentItems[i - 1].price;
    const curAvg = recentItems[i].avgPrice || recentItems[i].price;
    if (curAvg > prevAvg) vwapUpCount++;
  }
  const slopeRatio = vwapUpCount / (recentItems.length - 1);
  if (slopeRatio >= 0.8) { score += 15; details.push("均价线上行"); }
  else if (slopeRatio >= 0.6) { score += 8; details.push("均价线偏强"); }

  // 4. Consistently above VWAP
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
 * Analyze early trend pattern (早盘趋势形态)
 * - Staircase pattern starting early
 * - V-shape in early session
 * - Clean upward channel
 */
function analyzeEarlyTrend(
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
  const prices = timeline.map(t => t.price);

  // 1. Early V-shape (within first 30 min)
  const earlyPrices = prices.slice(0, Math.min(30, prices.length));
  if (earlyPrices.length >= 10) {
    let minPrice = Infinity;
    let minIdx = 0;
    for (let i = 0; i < earlyPrices.length; i++) {
      if (earlyPrices[i] < minPrice && earlyPrices[i] > 0) {
        minPrice = earlyPrices[i];
        minIdx = i;
      }
    }

    if (minIdx > 3 && minIdx < earlyPrices.length - 3) {
      const dropFromPrev = ((prevClose - minPrice) / prevClose) * 100;
      const recoveryFromMin = ((currentPrice - minPrice) / minPrice) * 100;

      if (dropFromPrev >= 1 && recoveryFromMin >= 2 && currentPrice > prevClose) {
        score += 28;
        details.push(`早盘V型反转(跌${dropFromPrev.toFixed(1)}%→涨${recoveryFromMin.toFixed(1)}%)`);
        patternTag = "早盘V反转";
      }
    }
  }

  // 2. Early staircase (阶梯启动)
  const quarterLen = Math.floor(prices.length / 4);
  if (quarterLen >= 3) {
    let risingQuarters = 0;
    const quarterAvgs: number[] = [];
    for (let q = 0; q < 4; q++) {
      const start = q * quarterLen;
      const end = Math.min(start + quarterLen, prices.length);
      const segment = prices.slice(start, end);
      const avg = segment.reduce((s, p) => s + p, 0) / segment.length;
      quarterAvgs.push(avg);
    }
    for (let q = 1; q < 4; q++) {
      if (quarterAvgs[q] > quarterAvgs[q - 1]) risingQuarters++;
    }
    if (risingQuarters >= 2 && currentPrice > prevClose) {
      score += 22;
      details.push("阶梯上涨启动");
      if (!patternTag) patternTag = "阶梯启动";
    }
  }

  // 3. Strong: current near high
  if (high > 0 && currentPrice >= high * 0.995) {
    score += 18;
    details.push("接近日高");
    if (!patternTag) patternTag = "创出新高";
  } else if (high > 0 && currentPrice >= high * 0.98) {
    score += 10;
    details.push("高位运行");
  }

  // 4. Open-to-current trend
  const safeOpen = open > 0 ? open : prevClose;
  if (safeOpen > 0) {
    const openToCurrent = ((currentPrice - safeOpen) / safeOpen) * 100;
    if (openToCurrent >= 3) {
      score += 15;
      details.push(`开盘至今涨${openToCurrent.toFixed(1)}%`);
    } else if (openToCurrent >= 1.5) {
      score += 8;
    }
  }

  // 5. Low above prevClose (strong support)
  const minInTimeline = Math.min(...prices.filter(p => p > 0));
  if (minInTimeline >= prevClose * 0.995) {
    score += 10;
    details.push("低点守稳昨收");
  }

  // 6. Price above prevClose
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
 * Analyze early MACD signals
 */
function analyzeEarlyMACD(
  timeline: { time: string; price: number }[],
): { score: number; detail: string } {
  if (!timeline || timeline.length < 20) {
    return { score: 0, detail: "数据不足" };
  }

  const prices = timeline.map(t => t.price);

  // Calculate MACD (12, 26, 9)
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

  // 1. Golden cross
  const checkLen = Math.min(15, len - 1);
  let goldenCross = false;
  for (let i = len - checkLen; i < len; i++) {
    if (i > 0 && dif[i - 1] <= dea[i - 1] && dif[i] > dea[i]) {
      goldenCross = true;
      break;
    }
  }
  if (goldenCross) {
    score += 30;
    details.push("早盘MACD金叉");
  }

  // 2. DIF turning positive
  if (dif[len - 1] > 0) {
    if (dif[len - 2] <= 0) {
      score += 20;
      details.push("DIF转正");
    } else {
      score += 10;
      details.push("DIF为正");
    }
  }

  // 3. MACD histogram positive
  if (macd[len - 1] > 0) {
    if (macd[len - 2] <= 0) {
      score += 15;
      details.push("红柱出现");
    } else if (macd[len - 1] > macd[len - 2]) {
      score += 10;
      details.push("红柱增长");
    }
  }

  // 4. DIF > DEA
  if (dif[len - 1] > dea[len - 1]) {
    score += 10;
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    detail: details.length > 0 ? details.join("，") : (score > 0 ? "MACD偏强" : "MACD偏弱"),
  };
}

/**
 * Analyze early capital flow (早盘资金流向)
 */
function analyzeEarlyCapital(
  mainNetInflow: number,
  amount: number,
  changePercent: number,
): { score: number; detail: string } {
  let score = 0;
  const details: string[] = [];

  if (mainNetInflow > 0 && amount > 0) {
    const inflowRatio = mainNetInflow / amount;
    if (inflowRatio > 0.1) { score += 35; details.push("主力大幅抢筹"); }
    else if (inflowRatio > 0.05) { score += 25; details.push("主力明显流入"); }
    else if (inflowRatio > 0.02) { score += 15; details.push("主力早盘流入"); }
    else { score += 5; details.push("主力微流入"); }

    // Capital + price rise = strong signal
    if (changePercent > 3) { score += 15; details.push("资金推升明显"); }
    else if (changePercent > 1) { score += 8; details.push("资金推动上涨"); }
  } else if (mainNetInflow < 0) {
    const outflowRatio = Math.abs(mainNetInflow) / (amount || 1);
    if (outflowRatio > 0.05) {
      score -= 5;
      details.push("主力流出");
    }
  } else {
    details.push("资金中性");
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    detail: details.length > 0 ? details.join("，") : (score > 0 ? "资金偏多" : "资金中性"),
  };
}

/**
 * Analyze early Volume-Price Co-rise (量价齐升)
 * Strong bullish signal where BOTH volume and price rise together consistently
 */
function analyzeEarlyCoRise(
  timeline: { time: string; price: number; volume: number }[],
  prevClose: number,
): { score: number; detail: string } {
  if (!timeline || timeline.length < 5 || prevClose <= 0) {
    return { score: 0, detail: "数据不足" };
  }

  let score = 0;
  const details: string[] = [];

  // Calculate per-minute changes
  const changes: { priceChange: number; volChange: number; isCoRise: boolean }[] = [];
  for (let i = 1; i < timeline.length; i++) {
    const priceChange = ((timeline[i].price - timeline[i - 1].price) / timeline[i - 1].price) * 100;
    const volChange = timeline[i - 1].volume > 0
      ? ((timeline[i].volume - timeline[i - 1].volume) / timeline[i - 1].volume) * 100
      : 0;
    changes.push({
      priceChange,
      volChange,
      isCoRise: priceChange > 0 && volChange > 0,
    });
  }

  if (changes.length < 3) return { score: 0, detail: "数据不足" };

  // 1. Consecutive co-rise minutes
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

  // 3. Sustained averages
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
 * Analyze early New High Breakout (突破新高)
 * Detect if the stock is breaking to new intraday highs with volume confirmation
 */
function analyzeEarlyBreakout(
  timeline: { time: string; price: number; volume: number }[],
  prevClose: number,
  high: number,
  currentPrice: number,
): { score: number; detail: string } {
  if (!timeline || timeline.length < 5 || prevClose <= 0) {
    return { score: 0, detail: "数据不足" };
  }

  let score = 0;
  const details: string[] = [];
  const prices = timeline.map(t => t.price);

  // 1. Current price vs prev close
  if (currentPrice > prevClose * 1.03) { score += 20; details.push("突破昨收3%+"); }
  else if (currentPrice > prevClose * 1.02) { score += 15; details.push("突破昨收2%+"); }
  else if (currentPrice > prevClose * 1.01) { score += 8; details.push("高于昨收"); }

  // 2. New high count
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

  // 3. Recent breakout
  const recentLen = Math.min(10, prices.length);
  const recentHighs = prices.slice(-recentLen).filter((p, i) => {
    const prevPrices = prices.slice(0, prices.length - recentLen + i);
    return prevPrices.length > 0 && p > Math.max(...prevPrices);
  });
  if (recentHighs.length >= 2) { score += 20; details.push("近期突破新高"); }
  else if (recentHighs.length >= 1) { score += 10; details.push("刚刚创新高"); }

  // 4. Price near day's high
  const dayHigh = Math.max(...prices);
  if (currentPrice >= dayHigh * 0.995) { score += 15; details.push("价格接近日高"); }
  else if (currentPrice >= dayHigh * 0.99) { score += 8; }

  // 5. Volume confirmation
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

function calculateEarlyCompositeScore(stock: EarlyScreenStock): { score: number; detail: string; label: string } {
  // Weighted composite - emphasizing opening pattern, early volume, and co-rise
  const weights = {
    openingPattern: 0.20,   // 开盘形态
    earlyVolume: 0.20,      // 早盘量能
    earlyVwap: 0.12,        // 均价线
    earlyTrend: 0.12,       // 早盘趋势
    earlyMacd: 0.08,        // MACD
    earlyCapital: 0.08,     // 资金
    earlyCoRise: 0.12,      // 量价齐升
    earlyBreakout: 0.08,    // 突破新高
  };

  const weighted =
    stock.openingPatternScore * weights.openingPattern +
    stock.earlyVolumeScore * weights.earlyVolume +
    stock.earlyVwapScore * weights.earlyVwap +
    stock.earlyTrendScore * weights.earlyTrend +
    stock.earlyMacdScore * weights.earlyMacd +
    stock.earlyCapitalScore * weights.earlyCapital +
    stock.earlyCoRiseScore * weights.earlyCoRise +
    stock.earlyBreakoutScore * weights.earlyBreakout;

  const score = Math.round(Math.max(0, Math.min(100, weighted)));

  let label: string;
  if (score >= 70) label = "强推";
  else if (score >= 55) label = "推荐";
  else if (score >= 40) label = "关注";
  else if (score >= 25) label = "观望";
  else label = "偏弱";

  const parts: string[] = [];
  if (stock.openingPatternScore >= 30) parts.push(stock.openingPatternDetail);
  if (stock.earlyVolumeScore >= 30) parts.push(stock.earlyVolumeDetail);
  if (stock.earlyVwapScore >= 30) parts.push(stock.earlyVwapDetail);
  if (stock.earlyTrendScore >= 30) parts.push(stock.earlyTrendDetail);
  if (stock.earlyMacdScore >= 30) parts.push(stock.earlyMacdDetail);
  if (stock.earlyCapitalScore >= 30) parts.push(stock.earlyCapitalDetail);
  if (stock.earlyCoRiseScore >= 30) parts.push(stock.earlyCoRiseDetail);
  if (stock.earlyBreakoutScore >= 30) parts.push(stock.earlyBreakoutDetail);

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
  const minChange = parseFloat(searchParams.get("minChange") || "-2");
  const maxChange = parseFloat(searchParams.get("maxChange") || "9");
  const maxMarketCap = parseFloat(searchParams.get("maxMarketCap") || "500");
  const minTurnover = parseFloat(searchParams.get("minTurnover") || "1");
  const minVolumeRatio = parseFloat(searchParams.get("minVolumeRatio") || "1");
  const minCompositeScore = parseInt(searchParams.get("minCompositeScore") || "25");
  const maxResults = parseInt(searchParams.get("maxResults") || "50");
  const forceRefresh = searchParams.get("refresh") === "1";
  const enableChiNext = searchParams.get("chiNext") === "true";
  const enableSTAR = searchParams.get("star") === "true";

  // Get trading phase
  const { phase: tradingPhase, minutesSinceOpen } = getTradingPhase();

  // Check cache
  const cacheKey = `${strategy}|${minChange}|${maxChange}|${maxMarketCap}|${minTurnover}|${minVolumeRatio}|${minCompositeScore}|${maxResults}|${enableChiNext}|${enableSTAR}`;
  if (!forceRefresh) {
    const cached = earlyScreenCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json({ ...cached.data, cached: true });
    }
  }

  try {
    // Step 1: Determine sort field based on strategy
    let sortBy = "f10"; // default: volume ratio (best for early screening)
    if (strategy === "volume_ratio") sortBy = "f10";
    else if (strategy === "capital_flow") sortBy = "f62";
    else if (strategy === "turnover") sortBy = "f8";
    else if (strategy === "change") sortBy = "f3";
    else if (strategy === "composite") sortBy = "f10"; // volume ratio first for early

    // Step 2: Fetch stocks from EastMoney
    const rawStocks = await fetchAllAShares(sortBy, 300);

    if (rawStocks.length === 0) {
      return NextResponse.json({
        success: false,
        stocks: [],
        totalCount: 0,
        filteredCount: 0,
        timestamp: new Date().toISOString(),
        strategy,
        tradingPhase,
        minutesSinceOpen,
        error: "未获取到股票数据",
      } as EarlyScreenResult);
    }

    // Step 3: Parse and filter
    const candidates: EarlyScreenStock[] = [];

    for (const stock of rawStocks) {
      const code = String(stock.f12 || "");
      const name = String(stock.f14 || "");

      if (isETF(code)) continue;
      if (isST(name)) continue;

      // Board filter
      if (!enableChiNext && (code.startsWith("300") || code.startsWith("301"))) continue;
      if (!enableSTAR && (code.startsWith("688") || code.startsWith("689"))) continue;
      if (code.startsWith("8") || code.startsWith("4")) continue; // 北交所

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
        openingPatternScore: 0,
        openingPatternDetail: "",
        earlyVolumeScore: 0,
        earlyVolumeDetail: "",
        earlyVwapScore: 0,
        earlyVwapDetail: "",
        earlyTrendScore: 0,
        earlyTrendDetail: "",
        earlyMacdScore: 0,
        earlyMacdDetail: "",
        earlyCapitalScore: 0,
        earlyCapitalDetail: "",
        earlyCoRiseScore: 0,
        earlyCoRiseDetail: "",
        earlyBreakoutScore: 0,
        earlyBreakoutDetail: "",
        earlyCompositeScore: 0,
        earlyCompositeDetail: "",
        patternTag: "",
        openGapRate: 0,
        first30MinChange: 0,
        first60MinChange: 0,
        earlyVolumeRatio: 0,
      });
    }

    // Step 4: Early trading analysis for candidates (batch)
    if (candidates.length > 0) {
      const batchSize = 10;
      for (let i = 0; i < candidates.length; i += batchSize) {
        const batch = candidates.slice(i, i + batchSize);
        const timelinePromises = batch.map(async (stock) => {
          try {
            // Only use the first 60 minutes of timeline data
            const fullTimeline = await getStockTimeline(stock.symbol);
            // Filter to first 60 minutes (9:30-10:30)
            const earlyTimeline = fullTimeline.filter(t => {
              const [h, m] = t.time.split(':').map(Number);
              if (h === 9 && m >= 30) return true;
              if (h === 10 && m <= 30) return true;
              return false;
            });

            // STRICT: only use early session data (09:30-10:30)
            // Lower threshold to 5 - if we have at least 5 minutes of early data, use it
            // This ensures we strictly screen based on opening hour patterns
            const timeline = earlyTimeline.length >= 5 ? earlyTimeline : fullTimeline;

            // Opening pattern analysis
            try {
              const result = analyzeOpeningPattern(timeline, stock.prevClose, stock.open, stock.price);
              stock.openingPatternScore = result.score;
              stock.openingPatternDetail = result.detail;
              stock.openGapRate = result.openGapRate;
            } catch (e) { /* skip */ }

            // Early volume analysis
            try {
              const result = analyzeEarlyVolume(timeline, stock.prevClose, stock.volumeRatio);
              stock.earlyVolumeScore = result.score;
              stock.earlyVolumeDetail = result.detail;
              stock.earlyVolumeRatio = result.earlyVolumeRatio;
              stock.first30MinChange = result.first30MinChange;
              stock.first60MinChange = result.first60MinChange;
            } catch (e) { /* skip */ }

            // Early VWAP analysis
            try {
              const result = analyzeEarlyVWAP(timeline, stock.price);
              stock.earlyVwapScore = result.score;
              stock.earlyVwapDetail = result.detail;
            } catch (e) { /* skip */ }

            // Early trend analysis
            try {
              const safeOpen = stock.open > 0 ? stock.open : stock.price;
              const safeHigh = stock.high > 0 ? stock.high : stock.price;
              const result = analyzeEarlyTrend(timeline, stock.prevClose, safeOpen, safeHigh, stock.price);
              stock.earlyTrendScore = result.score;
              stock.earlyTrendDetail = result.detail;
              stock.patternTag = result.patternTag;
            } catch (e) { /* skip */ }

            // Early MACD analysis
            try {
              const result = analyzeEarlyMACD(timeline);
              stock.earlyMacdScore = result.score;
              stock.earlyMacdDetail = result.detail;
            } catch (e) { /* skip */ }

            // Early capital analysis
            try {
              const result = analyzeEarlyCapital(stock.mainNetInflow, stock.amount, stock.changePercent);
              stock.earlyCapitalScore = result.score;
              stock.earlyCapitalDetail = result.detail;
            } catch (e) { /* skip */ }

            // Early Volume-Price Co-rise analysis (量价齐升)
            try {
              const result = analyzeEarlyCoRise(timeline, stock.prevClose);
              stock.earlyCoRiseScore = result.score;
              stock.earlyCoRiseDetail = result.detail;
            } catch (e) { /* skip */ }

            // Early New High Breakout analysis (突破新高)
            try {
              const safeHigh = stock.high > 0 ? stock.high : stock.price;
              const result = analyzeEarlyBreakout(timeline, stock.prevClose, safeHigh, stock.price);
              stock.earlyBreakoutScore = result.score;
              stock.earlyBreakoutDetail = result.detail;
            } catch (e) { /* skip */ }

            // Calculate composite score
            try {
              const composite = calculateEarlyCompositeScore(stock);
              stock.earlyCompositeScore = composite.score;
              stock.earlyCompositeDetail = composite.detail;
              stock.patternTag = stock.patternTag || composite.label;
            } catch (e) { /* skip */ }
          } catch (e) {
            console.error(`Early analysis error for ${stock.symbol}:`, e);
          }
        });
        await Promise.allSettled(timelinePromises);
      }

      // Filter by composite score
      const filtered = candidates.filter(s => s.earlyCompositeScore >= minCompositeScore);

      // Sort by composite score
      filtered.sort((a, b) => {
        if (b.earlyCompositeScore !== a.earlyCompositeScore) return b.earlyCompositeScore - a.earlyCompositeScore;
        return b.changePercent - a.changePercent;
      });

      // Limit results
      const resultStocks = filtered.slice(0, maxResults);

      const result: EarlyScreenResult = {
        success: true,
        stocks: resultStocks,
        totalCount: rawStocks.length,
        filteredCount: filtered.length,
        timestamp: new Date().toISOString(),
        strategy,
        tradingPhase,
        minutesSinceOpen,
      };

      earlyScreenCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return NextResponse.json(result);
    }

    return NextResponse.json({
      success: true,
      stocks: [],
      totalCount: rawStocks.length,
      filteredCount: 0,
      timestamp: new Date().toISOString(),
      strategy,
      tradingPhase,
      minutesSinceOpen,
    } as EarlyScreenResult);
  } catch (e: any) {
    console.error("Early screen error:", e);
    return NextResponse.json({
      success: false,
      stocks: [],
      totalCount: 0,
      filteredCount: 0,
      timestamp: new Date().toISOString(),
      strategy,
      tradingPhase,
      minutesSinceOpen,
      error: e.message || "选股服务异常",
    } as EarlyScreenResult);
  }
}
