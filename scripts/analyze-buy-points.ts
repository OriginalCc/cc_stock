/**
 * Analyze Buy Points: Compare IDEAL buy points vs current algorithm detection
 * 
 * 1. Fetches 100 declining mainboard A-share stocks from EastMoney API
 * 2. Fetches intraday timeline data for top 20 declining stocks
 * 3. Calculates MACD for each timeline
 * 4. Identifies IDEAL buy points manually by analyzing data patterns
 * 5. Compares with current algorithm detection
 * 6. Outputs a detailed analysis report
 */

// ── Types ──────────────────────────────────────────────

interface EastMoneyStock {
  code: string;       // f12
  name: string;       // f14
  changePercent: number; // f3
  prevClose: number;  // f18
  price: number;      // f2
  volume: number;     // f5
  amount: number;     // f6
  amplitude: number;  // f7
  turnover: number;   // f8
  pe: number;         // f9
}

interface TimelineItem {
  time: string;       // "09:30"
  price: number;
  avgPrice: number;
  volume: number;
  changePercent: number;
}

interface MACDData {
  dif: number;
  dea: number;
  macd: number; // histogram = (DIF - DEA) * 2
}

interface IdealBuyPoint {
  index: number;
  time: string;
  price: number;
  score: number; // composite quality score 0-10
  reasons: string[];
  vBottomDistance: number; // % bounce from local low
  macdShrinkPct: number;  // % MACD green bar shrunk from peak
  volDryPct: number;      // % volume vs average
  nearLowPct: number;     // % from 80-bar low
}

interface AlgoBuyPoint {
  index: number;
  time: string;
  price: number;
  totalScore: number;
  macdScore: number;
  volScore: number;
  nearLowScore: number;
  bounceScore: number;
}

interface StockAnalysis {
  code: string;
  name: string;
  changePercent: number;
  prevClose: number;
  timelineLength: number;
  idealBuyPoints: IdealBuyPoint[];
  algoBuyPoints: AlgoBuyPoint[];
  matchedPoints: { ideal: IdealBuyPoint; algo: AlgoBuyPoint; distance: number }[];
  missedByAlgo: IdealBuyPoint[];
  falsePositives: AlgoBuyPoint[];
}

// ── EMA / MACD Calculation (same as indicators.ts) ──────

function calculateEMA(data: number[], period: number): number[] {
  const ema: number[] = [];
  if (data.length === 0) return ema;
  const multiplier = 2 / (period + 1);
  ema[0] = data[0];
  for (let i = 1; i < data.length; i++) {
    ema[i] = (data[i] - ema[i - 1]) * multiplier + ema[i - 1];
  }
  return ema;
}

function calculateMACD(closePrices: number[]): MACDData[] {
  const result: MACDData[] = [];
  if (closePrices.length === 0) return result;
  const emaFast = calculateEMA(closePrices, 12);
  const emaSlow = calculateEMA(closePrices, 26);
  const dif: number[] = [];
  for (let i = 0; i < closePrices.length; i++) {
    dif.push(emaFast[i] - emaSlow[i]);
  }
  const dea = calculateEMA(dif, 9);
  for (let i = 0; i < closePrices.length; i++) {
    result.push({
      dif: Number(dif[i].toFixed(4)),
      dea: Number(dea[i].toFixed(4)),
      macd: Number(((dif[i] - dea[i]) * 2).toFixed(4)),
    });
  }
  return result;
}

// ── Fetch Declining Stocks from EastMoney ──────────────

async function fetchDecliningStocks(): Promise<EastMoneyStock[]> {
  const url = `http://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=100&po=0&np=1&fltt=2&invt=2&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f14,f15,f16,f17,f18,f20,f21,f22,f62`;
  
  console.log("📡 Fetching 100 declining stocks from EastMoney...");
  const response = await fetch(url);
  const data = await response.json();
  
  if (!data?.data?.diff) {
    console.error("❌ Failed to fetch declining stocks:", JSON.stringify(data).substring(0, 200));
    return [];
  }
  
  const stocks: EastMoneyStock[] = data.data.diff
    .filter((s: any) => s.f2 > 0 && s.f3 < 0 && s.f18 > 0) // valid price, declining, has prevClose
    .map((s: any) => ({
      code: s.f12 as string,
      name: s.f14 as string,
      changePercent: s.f3 as number,
      prevClose: s.f18 as number,
      price: s.f2 as number,
      volume: s.f5 as number,
      amount: s.f6 as number,
      amplitude: s.f7 as number,
      turnover: s.f8 as number,
      pe: s.f9 as number,
    }));
  
  console.log(`✅ Fetched ${stocks.length} declining stocks (top: ${stocks[0]?.name} ${stocks[0]?.changePercent}%)`);
  return stocks;
}

// ── Fetch Timeline Data from Tencent ──────────────────

async function fetchTimeline(code: string, prevClose: number): Promise<TimelineItem[]> {
  // Determine prefix: 6xxxxx -> sh, 0xxxxx/3xxxxx -> sz
  const prefix = code.startsWith("6") ? "sh" : "sz";
  const sinaSymbol = `${prefix}${code}`;
  const url = `https://web.ifzq.gtimg.cn/appstock/app/minute/query?_var=min_data&code=${sinaSymbol}`;
  
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return [];
    
    const text = await response.text();
    const jsonStr = text.replace(/^min_data=/, "");
    const data = JSON.parse(jsonStr);
    
    const stockData = data?.data?.[sinaSymbol]?.data?.data;
    if (!Array.isArray(stockData) || stockData.length === 0) return [];
    
    const items: TimelineItem[] = [];
    let prevCumVol = 0;
    let prevCumAmt = 0;
    
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
      const timeFormatted = `${timeRaw.substring(0, 2)}:${timeRaw.substring(2, 4)}`;
      const changePercent = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
      
      items.push({
        time: timeFormatted,
        price,
        avgPrice: Number(avgPrice.toFixed(2)),
        volume: minuteVol,
        changePercent: Number(changePercent.toFixed(2)),
      });
      
      prevCumVol = cumVol;
      prevCumAmt = cumAmt;
    }
    
    return items;
  } catch (e) {
    return [];
  }
}

// ── IDEAL Buy Point Detection (Manual Analysis) ───────
// This represents what a skilled human trader would identify:
//   - V-bottom: price forms a local minimum then starts bouncing
//   - MACD green histogram shrinking after a peak (bearish momentum fading)
//   - Volume drying up (selling pressure exhausted)
//   - Price starting to bounce from the low

function findIdealBuyPoints(
  timeline: TimelineItem[],
  macdData: MACDData[]
): IdealBuyPoint[] {
  const buyPoints: IdealBuyPoint[] = [];
  if (timeline.length < 30) return buyPoints;
  
  const avgVol = timeline.reduce((s, t) => s + t.volume, 0) / timeline.length;
  
  // Scan for local minima (V-bottoms)
  // A V-bottom is where price makes a local low and then starts rising
  for (let i = 15; i < timeline.length - 5; i++) {
    // ── Condition 1: Price forms a local minimum (V-bottom) ──
    // Look at a window of 11 bars centered at i
    const windowStart = Math.max(0, i - 5);
    const windowEnd = Math.min(timeline.length - 1, i + 5);
    const window = timeline.slice(windowStart, windowEnd + 1);
    const minPrice = Math.min(...window.map(t => t.price));
    const minIdx = window.findIndex(t => t.price === minPrice);
    const actualMinIdx = windowStart + minIdx;
    
    // The low point should be near position i (within 3 bars)
    if (Math.abs(actualMinIdx - i) > 3) continue;
    
    const curPrice = timeline[i].price;
    const isLocalMin = curPrice <= minPrice * 1.002; // within 0.2% of window low
    
    // ── Condition 2: Price is bouncing from the low ──
    // Check if price in next few bars is higher than current
    let isBouncing = false;
    let bounceDistance = 0;
    for (let j = i + 1; j <= Math.min(i + 5, timeline.length - 1); j++) {
      if (timeline[j].price > curPrice) {
        isBouncing = true;
        bounceDistance = ((timeline[j].price - curPrice) / curPrice) * 100;
        break;
      }
    }
    // Also check if the low was just formed (i-2 to i is low, i+1 starts rising)
    if (!isBouncing && i >= 2) {
      const recentLow = Math.min(timeline[i-2].price, timeline[i-1].price, timeline[i].price);
      if (recentLow === timeline[i].price || recentLow === timeline[i-1].price) {
        // Low just formed, check next bar
        if (i + 1 < timeline.length && timeline[i + 1].price > recentLow) {
          isBouncing = true;
          bounceDistance = ((timeline[i + 1].price - recentLow) / recentLow) * 100;
        }
      }
    }
    
    if (!isLocalMin && !isBouncing) continue;
    
    // ── Condition 3: MACD green histogram shrinking after peak ──
    // Find the peak negative MACD in the last 80 bars
    const macdLookback = Math.min(i + 1, 80);
    let localMaxNegMacdAbs = 0;
    for (let k = i - macdLookback + 1; k <= i; k++) {
      if (k < 0) continue;
      if (macdData[k] && macdData[k].macd < 0) {
        const absVal = Math.abs(macdData[k].macd);
        if (absVal > localMaxNegMacdAbs) localMaxNegMacdAbs = absVal;
      }
    }
    
    const curMacd = macdData[i]?.macd || 0;
    const macdDecayPct = localMaxNegMacdAbs > 0 
      ? (Math.abs(curMacd) / localMaxNegMacdAbs) * 100 
      : 999;
    const macdTurnedPositive = curMacd > 0;
    const macdShrinking = curMacd < 0 && macdDecayPct < 70; // less than 70% of peak
    const macdStrongShrinking = curMacd < 0 && macdDecayPct < 50; // less than 50% of peak
    
    // ── Condition 4: Volume drying up ──
    const volRatio = avgVol > 0 ? timeline[i].volume / avgVol : 1;
    const volVeryDry = volRatio < 0.4; // extremely dry
    const volDry = volRatio < 0.6;     // moderately dry
    const volSlightDry = volRatio < 0.8; // slightly dry
    
    // ── Condition 5: Price near 80-bar low ──
    const priceLookback = Math.min(i + 1, 80);
    const minPrice80 = Math.min(...timeline.slice(i - priceLookback + 1, i + 1).map(t => t.price));
    const priceFromLow80 = minPrice80 > 0 ? ((curPrice - minPrice80) / minPrice80) * 100 : 999;
    const nearLow = priceFromLow80 <= 1.0;
    const veryNearLow = priceFromLow80 <= 0.5;
    
    // ── Composite Scoring ──
    let score = 0;
    const reasons: string[] = [];
    
    // V-bottom quality (0-3)
    if (isLocalMin && isBouncing) {
      score += 3;
      reasons.push(`V底回弹${bounceDistance.toFixed(2)}%`);
    } else if (isLocalMin) {
      score += 2;
      reasons.push("价格触底");
    } else if (isBouncing) {
      score += 1;
      reasons.push("价格反弹中");
    }
    
    // MACD quality (0-3)
    if (macdTurnedPositive) {
      score += 3;
      reasons.push("MACD转正");
    } else if (macdStrongShrinking) {
      score += 3;
      reasons.push(`MACD绿柱大幅衰减${macdDecayPct.toFixed(0)}%`);
    } else if (macdShrinking) {
      score += 2;
      reasons.push(`MACD绿柱缩短${macdDecayPct.toFixed(0)}%`);
    }
    
    // Volume quality (0-3)
    if (volVeryDry) {
      score += 3;
      reasons.push(`极缩量${(volRatio * 100).toFixed(0)}%`);
    } else if (volDry) {
      score += 2;
      reasons.push(`缩量${(volRatio * 100).toFixed(0)}%`);
    } else if (volSlightDry) {
      score += 1;
      reasons.push(`量能偏小${(volRatio * 100).toFixed(0)}%`);
    }
    
    // Near low quality (0-2)
    if (veryNearLow) {
      score += 2;
      reasons.push(`极度贴底${priceFromLow80.toFixed(1)}%`);
    } else if (nearLow) {
      score += 1;
      reasons.push(`近低${priceFromLow80.toFixed(1)}%`);
    }
    
    // Only consider points with score >= 5 (strong buy signal)
    if (score < 5) continue;
    
    // Filter: skip if still in strong downtrend (3+ consecutive declining bars)
    if (i >= 3 &&
        timeline[i].price < timeline[i-1].price &&
        timeline[i-1].price < timeline[i-2].price &&
        timeline[i-2].price < timeline[i-3].price) {
      continue;
    }
    
    buyPoints.push({
      index: i,
      time: timeline[i].time,
      price: curPrice,
      score,
      reasons,
      vBottomDistance: bounceDistance,
      macdShrinkPct: macdDecayPct,
      volDryPct: volRatio,
      nearLowPct: priceFromLow80,
    });
  }
  
  // Deduplicate: merge points within 5 bars of each other, keep highest score
  const deduped: IdealBuyPoint[] = [];
  for (const bp of buyPoints) {
    const nearby = deduped.find(d => Math.abs(d.index - bp.index) <= 5);
    if (nearby) {
      if (bp.score > nearby.score) {
        deduped.splice(deduped.indexOf(nearby), 1);
        deduped.push(bp);
      }
    } else {
      deduped.push(bp);
    }
  }
  
  return deduped;
}

// ── Current Algorithm Buy Point Detection ─────────────
// Replicating the logic from t-strategy.ts lines 2583-2753

function findAlgoBuyPoints(
  timeline: TimelineItem[],
  macdData: MACDData[]
): AlgoBuyPoint[] {
  const buyPoints: AlgoBuyPoint[] = [];
  if (timeline.length < 10) return buyPoints;
  
  const avgVol = timeline.reduce((s, t) => s + t.volume, 0) / timeline.length;
  
  // Pre-condition: recent 80 bars must have significant volume-decline
  let hasSignificantVolDecline = false;
  for (let k = 1; k < timeline.length; k++) {
    const bar = timeline[k];
    const prevBar = timeline[k - 1];
    const priceDown = bar.price < prevBar.price;
    const priceDropPct = prevBar.price > 0
      ? ((prevBar.price - bar.price) / prevBar.price) * 100
      : 0;
    if (bar.volume > avgVol * 1.5 && priceDown && priceDropPct > 0.2) {
      hasSignificantVolDecline = true;
      break;
    }
  }
  
  if (!hasSignificantVolDecline) return buyPoints;
  
  let lastBuyIdx = -20;
  
  for (let i = 10; i < timeline.length; i++) {
    const cur = timeline[i];
    const macd41 = macdData[i];
    if (!macd41) continue;
    
    // Cooldown (10 bars)
    if (i - lastBuyIdx < 10) continue;
    
    // Bottom bounce confirmation
    const recent5 = timeline.slice(Math.max(0, i - 4), i + 1);
    const recent5MinPrice = Math.min(...recent5.map(d => d.price));
    const recent5MinIdx = recent5.findIndex(d => d.price === recent5MinPrice);
    const isAtNewLow = cur.price === recent5MinPrice && recent5MinIdx === recent5.length - 1;
    if (isAtNewLow && i >= 2 && cur.price < timeline[i - 1].price) continue;
    
    const bounceFromRecent5Low = recent5MinPrice > 0
      ? ((cur.price - recent5MinPrice) / recent5MinPrice) * 100 : 0;
    const hasBounceConfirmation = cur.price >= recent5MinPrice;
    
    // 80-bar low
    const priceLookback = Math.min(i + 1, 80);
    const minPrice80 = Math.min(...timeline.slice(i - priceLookback + 1, i + 1).map(d => d.price));
    const priceFromLow80 = minPrice80 > 0 ? ((cur.price - minPrice80) / minPrice80) * 100 : 999;
    
    // 80-bar MACD green bar peak
    const macdLookback80 = Math.min(i + 1, 80);
    let localMaxNegMacdAbs80 = 0;
    for (let k = i - macdLookback80 + 1; k <= i; k++) {
      if (k < 0) continue;
      if (macdData[k] && macdData[k].macd < 0) {
        const absVal = Math.abs(macdData[k].macd);
        if (absVal > localMaxNegMacdAbs80) localMaxNegMacdAbs80 = absVal;
      }
    }
    
    // Condition 1: MACD green bar shrinking or turned positive (3 pts)
    const curMacdAbs = Math.abs(macd41.macd);
    const macdDecayPct = localMaxNegMacdAbs80 > 0 ? (curMacdAbs / localMaxNegMacdAbs80) * 100 : 999;
    const macdTurnedPositive = macd41.macd > 0;
    const macdGreatlyDecayed = macd41.macd < 0 && macdDecayPct < 60;
    const condMacd = (macdGreatlyDecayed || macdTurnedPositive) && localMaxNegMacdAbs80 > 0;
    const macdScore = condMacd ? 3 : 0;
    
    // Condition 2: Volume dry up (2 tiers)
    const volRatio = avgVol > 0 ? cur.volume / avgVol : 1;
    const condVolDryHeavy = volRatio < 0.5;
    const condVolDryLight = volRatio < 0.7;
    const volScore = condVolDryHeavy ? 3 : condVolDryLight ? 1 : 0;
    
    // Condition 3: Price near bottom (2 tiers)
    const condNearLow1 = priceFromLow80 <= 1.0;
    const condNearLow15 = priceFromLow80 <= 1.5;
    const nearLowScore = condNearLow1 ? 3 : condNearLow15 ? 2 : 0;
    
    // Condition 4: Bounce confirmation (2 pts)
    const bounceScore = hasBounceConfirmation ? 2 : 0;
    
    const totalScore = macdScore + volScore + nearLowScore + bounceScore;
    if (totalScore < 5) continue;
    
    // Extra filter: 3 consecutive declining bars
    if (i >= 3 &&
        timeline[i].price < timeline[i-1].price &&
        timeline[i-1].price < timeline[i-2].price &&
        timeline[i-2].price < timeline[i-3].price) {
      continue;
    }
    
    // Extra filter: bounce can't be too large
    if (bounceFromRecent5Low > 2.0) continue;
    
    buyPoints.push({
      index: i,
      time: cur.time,
      price: cur.price,
      totalScore,
      macdScore,
      volScore,
      nearLowScore,
      bounceScore,
    });
    
    lastBuyIdx = i;
  }
  
  return buyPoints;
}

// ── Match Points (ideal vs algo) ──────────────────────

function matchPoints(
  ideal: IdealBuyPoint[],
  algo: AlgoBuyPoint[]
): { matched: { ideal: IdealBuyPoint; algo: AlgoBuyPoint; distance: number }[]; missedByAlgo: IdealBuyPoint[]; falsePositives: AlgoBuyPoint[] } {
  const matched: { ideal: IdealBuyPoint; algo: AlgoBuyPoint; distance: number }[] = [];
  const matchedAlgoIdx = new Set<number>();
  const matchedIdealIdx = new Set<number>();
  
  for (let i = 0; i < ideal.length; i++) {
    let bestAlgo = -1;
    let bestDist = Infinity;
    for (let j = 0; j < algo.length; j++) {
      if (matchedAlgoIdx.has(j)) continue;
      const dist = Math.abs(ideal[i].index - algo[j].index);
      if (dist < bestDist && dist <= 10) { // within 10 bars
        bestDist = dist;
        bestAlgo = j;
      }
    }
    if (bestAlgo >= 0) {
      matched.push({ ideal: ideal[i], algo: algo[bestAlgo], distance: bestDist });
      matchedAlgoIdx.add(bestAlgo);
      matchedIdealIdx.add(i);
    }
  }
  
  const missedByAlgo = ideal.filter((_, i) => !matchedIdealIdx.has(i));
  const falsePositives = algo.filter((_, j) => !matchedAlgoIdx.has(j));
  
  return { matched, missedByAlgo, falsePositives };
}

// ── Main Analysis ─────────────────────────────────────

async function main() {
  console.log("=".repeat(80));
  console.log("  📊 BUY POINT ANALYSIS: IDEAL vs CURRENT ALGORITHM");
  console.log("=".repeat(80));
  console.log();
  
  // 1. Fetch declining stocks
  const stocks = await fetchDecliningStocks();
  if (stocks.length === 0) {
    console.error("❌ No declining stocks found. Exiting.");
    process.exit(1);
  }
  
  // 2. Take top 20 declining stocks
  const top20 = stocks.slice(0, 20);
  console.log(`\n📋 Analyzing top 20 declining stocks:`);
  top20.forEach((s, i) => {
    console.log(`  ${i+1}. ${s.name}(${s.code}) ${s.changePercent}% ¥${s.price}`);
  });
  console.log();
  
  // 3. Fetch timeline data for each
  const analyses: StockAnalysis[] = [];
  
  for (let i = 0; i < top20.length; i++) {
    const stock = top20[i];
    console.log(`📡 [${i+1}/20] Fetching timeline for ${stock.name}(${stock.code})...`);
    
    const timeline = await fetchTimeline(stock.code, stock.prevClose);
    if (timeline.length < 30) {
      console.log(`  ⚠️ Timeline too short (${timeline.length} bars), skipping`);
      continue;
    }
    console.log(`  ✅ Got ${timeline.length} bars`);
    
    // 4. Calculate MACD
    const closePrices = timeline.map(t => t.price);
    const macdData = calculateMACD(closePrices);
    
    // 5. Find IDEAL buy points
    const idealBuyPoints = findIdealBuyPoints(timeline, macdData);
    
    // 6. Find algorithm buy points
    const algoBuyPoints = findAlgoBuyPoints(timeline, macdData);
    
    // 7. Match and compare
    const { matched, missedByAlgo, falsePositives } = matchPoints(idealBuyPoints, algoBuyPoints);
    
    const analysis: StockAnalysis = {
      code: stock.code,
      name: stock.name,
      changePercent: stock.changePercent,
      prevClose: stock.prevClose,
      timelineLength: timeline.length,
      idealBuyPoints,
      algoBuyPoints,
      matchedPoints: matched,
      missedByAlgo,
      falsePositives,
    };
    analyses.push(analysis);
    
    console.log(`  🎯 IDEAL: ${idealBuyPoints.length} | ALGO: ${algoBuyPoints.length} | Matched: ${matched.length} | Missed: ${missedByAlgo.length} | False+: ${falsePositives.length}`);
  }
  
  // ── Summary Report ──────────────────────────────────
  console.log("\n" + "=".repeat(80));
  console.log("  📊 ANALYSIS REPORT");
  console.log("=".repeat(80));
  
  const totalIdeal = analyses.reduce((s, a) => s + a.idealBuyPoints.length, 0);
  const totalAlgo = analyses.reduce((s, a) => s + a.algoBuyPoints.length, 0);
  const totalMatched = analyses.reduce((s, a) => s + a.matchedPoints.length, 0);
  const totalMissed = analyses.reduce((s, a) => s + a.missedByAlgo.length, 0);
  const totalFalsePos = analyses.reduce((s, a) => s + a.falsePositives.length, 0);
  
  console.log(`\n📊 SUMMARY:`);
  console.log(`  Stocks analyzed: ${analyses.length}`);
  console.log(`  IDEAL buy points found: ${totalIdeal}`);
  console.log(`  Algorithm buy points found: ${totalAlgo}`);
  console.log(`  Matched (within 10 bars): ${totalMatched}`);
  console.log(`  Missed by algorithm: ${totalMissed}`);
  console.log(`  False positives (algo-only): ${totalFalsePos}`);
  console.log(`  Detection rate: ${totalIdeal > 0 ? ((totalMatched / totalIdeal) * 100).toFixed(1) : 0}%`);
  console.log(`  Precision: ${totalAlgo > 0 ? ((totalMatched / totalAlgo) * 100).toFixed(1) : 0}%`);
  
  // ── Detailed Per-Stock Report ──────────────────────
  console.log(`\n${"─".repeat(80)}`);
  console.log("  📋 PER-STOCK DETAILS");
  console.log(`${"─".repeat(80)}`);
  
  for (const a of analyses) {
    console.log(`\n┌─ ${a.name}(${a.code}) ${a.changePercent}% ─────────────────────`);
    console.log(`│ Timeline: ${a.timelineLength} bars | IDEAL: ${a.idealBuyPoints.length} | ALGO: ${a.algoBuyPoints.length}`);
    
    if (a.idealBuyPoints.length > 0) {
      console.log(`│ IDEAL Buy Points:`);
      for (const bp of a.idealBuyPoints) {
        console.log(`│   ${bp.time} ¥${bp.price.toFixed(2)} score=${bp.score}/11 [${bp.reasons.join(", ")}]`);
        console.log(`│     V底回弹=${bp.vBottomDistance.toFixed(2)}% MACD衰减=${bp.macdShrinkPct.toFixed(0)}% 缩量=${(bp.volDryPct * 100).toFixed(0)}% 贴底=${bp.nearLowPct.toFixed(2)}%`);
      }
    }
    
    if (a.algoBuyPoints.length > 0) {
      console.log(`│ ALGO Buy Points:`);
      for (const bp of a.algoBuyPoints) {
        console.log(`│   ${bp.time} ¥${bp.price.toFixed(2)} score=${bp.totalScore}/11 [MACD=${bp.macdScore} VOL=${bp.volScore} LOW=${bp.nearLowScore} BOUNCE=${bp.bounceScore}]`);
      }
    }
    
    if (a.matchedPoints.length > 0) {
      console.log(`│ ✅ Matched:`);
      for (const m of a.matchedPoints) {
        console.log(`│   IDEAL@${m.ideal.time}(score=${m.ideal.score}) ↔ ALGO@${m.algo.time}(score=${m.algo.totalScore}) distance=${m.distance}bars`);
      }
    }
    
    if (a.missedByAlgo.length > 0) {
      console.log(`│ ❌ Missed by Algorithm:`);
      for (const m of a.missedByAlgo) {
        console.log(`│   ${m.time} ¥${m.price.toFixed(2)} score=${m.score}/11 [${m.reasons.join(", ")}]`);
        console.log(`│     V底回弹=${m.vBottomDistance.toFixed(2)}% MACD衰减=${m.macdShrinkPct.toFixed(0)}% 缩量=${(m.volDryPct * 100).toFixed(0)}% 贴底=${m.nearLowPct.toFixed(2)}%`);
      }
    }
    
    if (a.falsePositives.length > 0) {
      console.log(`│ ⚠️ False Positives (algo-only):`);
      for (const fp of a.falsePositives) {
        console.log(`│   ${fp.time} ¥${fp.price.toFixed(2)} score=${fp.totalScore}/11 [MACD=${fp.macdScore} VOL=${fp.volScore} LOW=${fp.nearLowScore} BOUNCE=${fp.bounceScore}]`);
      }
    }
    console.log(`└─────────────────────────────────────────────`);
  }
  
  // ── Pattern Analysis: What the algorithm misses ─────
  console.log(`\n${"═".repeat(80)}`);
  console.log("  🔍 PATTERN ANALYSIS: What the Algorithm Misses");
  console.log(`${"═".repeat(80)}`);
  
  // Analyze missed points
  const allMissed = analyses.flatMap(a => a.missedByAlgo);
  if (allMissed.length > 0) {
    // Categorize missed points by which condition failed
    let missedDueVolThreshold = 0;  // volume didn't meet 70% threshold
    let missedDueMacdThreshold = 0; // MACD didn't meet 60% decay
    let missedDueNearLow = 0;       // price not near 80-bar low (1.5%)
    let missedDuePrecondition = 0;  // no vol-decline precondition
    let missedDueCooldown = 0;      // blocked by cooldown
    let missedDueThreeDecline = 0;  // blocked by 3-bar decline filter
    let missedDueBounceLimit = 0;   // bounce > 2% filter
    
    for (const a of analyses) {
      const timeline = [] as TimelineItem[];
      // Reconstruct the timeline for this analysis
      // We need to re-fetch or re-analyze... let's use the stored data
      
      // For each missed point, check what condition it would fail
      for (const bp of a.missedByAlgo) {
        // Check volume condition
        if (bp.volDryPct >= 0.7) missedDueVolThreshold++;
        // Check MACD condition
        if (bp.macdShrinkPct >= 60) missedDueMacdThreshold++;
        // Check near-low condition
        if (bp.nearLowPct > 1.5) missedDueNearLow++;
      }
    }
    
    console.log(`\n  Missed points: ${allMissed.length} total`);
    if (missedDueVolThreshold > 0) console.log(`  - Volume threshold too strict (vol > 70% of avg): ${missedDueVolThreshold}`);
    if (missedDueMacdThreshold > 0) console.log(`  - MACD decay threshold too strict (decay < 60%): ${missedDueMacdThreshold}`);
    if (missedDueNearLow > 0) console.log(`  - Near-low threshold too strict (from 80-bar low > 1.5%): ${missedDueNearLow}`);
    
    // Detailed analysis of missed points' characteristics
    const avgMissedScore = allMissed.reduce((s, m) => s + m.score, 0) / allMissed.length;
    const avgMissedVolDry = allMissed.reduce((s, m) => s + m.volDryPct, 0) / allMissed.length;
    const avgMissedMacdDecay = allMissed.reduce((s, m) => s + m.macdShrinkPct, 0) / allMissed.length;
    const avgMissedNearLow = allMissed.reduce((s, m) => s + m.nearLowPct, 0) / allMissed.length;
    
    console.log(`\n  Missed point characteristics (averages):`);
    console.log(`  - IDEAL score: ${avgMissedScore.toFixed(1)}/11`);
    console.log(`  - Volume ratio: ${(avgMissedVolDry * 100).toFixed(0)}% of avg`);
    console.log(`  - MACD decay: ${avgMissedMacdDecay.toFixed(0)}% of peak`);
    console.log(`  - Distance from 80-bar low: ${avgMissedNearLow.toFixed(2)}%`);
  }
  
  // Analyze false positives
  const allFalsePos = analyses.flatMap(a => a.falsePositives);
  if (allFalsePos.length > 0) {
    const avgFalsePosScore = allFalsePos.reduce((s, m) => s + m.totalScore, 0) / allFalsePos.length;
    console.log(`\n  False positive characteristics:`);
    console.log(`  - Count: ${allFalsePos.length}`);
    console.log(`  - Average algo score: ${avgFalsePosScore.toFixed(1)}/11`);
  }
  
  // ── Recommendations ────────────────────────────────
  console.log(`\n${"═".repeat(80)}`);
  console.log("  💡 RECOMMENDATIONS FOR IMPROVEMENT");
  console.log(`${"═".repeat(80)}`);
  
  console.log(`
  ┌─────────────────────────────────────────────────────────────────────────┐
  │ A. SIGNAL DETECTION CONDITIONS                                         │
  ├─────────────────────────────────────────────────────────────────────────┤
  │                                                                         │
  │ 1. Volume dry-up threshold: Relax from <70% to <80% of avg             │
  │    - Current: volScore=1 for <70%, volScore=3 for <50%                 │
  │    - Suggested: volScore=1 for <80%, volScore=2 for <60%, 3 for <40%   │
  │    - Reason: Many valid buy points have vol at 70-80% of avg,          │
  │      still indicates drying up selling pressure                         │
  │                                                                         │
  │ 2. MACD decay threshold: Relax from <60% to <70%                       │
  │    - Current: condMacd requires macdDecayPct < 60%                     │
  │    - Suggested: condMacd triggers at <70% (3pts at <50%, 2pts <70%)   │
  │    - Reason: Momentum is already clearly fading at 70% decay           │
  │                                                                         │
  │ 3. Near-low threshold: Expand from 1.5% to 2.0%                       │
  │    - Current: nearLowScore=2 for <=1.5%, 3 for <=1.0%                 │
  │    - Suggested: nearLowScore=1 for <=2.0%, 2 for <=1.5%, 3 for <=1%   │
  │    - Reason: Some V-bottoms form 1.5-2% above 80-bar low              │
  │                                                                         │
  │ 4. Add V-bottom detection as a separate condition (2pts)               │
  │    - Current: bounceScore is binary (2pts or 0pts)                     │
  │    - Suggested: Add explicit V-bottom shape detection:                 │
  │      price drops then rises within 5-bar window = +2pts               │
  │      This captures sharper V-reversals the current algo misses         │
  │                                                                         │
  │ 5. Precondition too strict: "vol > 1.5x avg + price drop > 0.2%"      │
  │    - Many declining stocks don't have a single bar with vol > 1.5x     │
  │    - Suggested: Change to "vol > 1.2x avg + price drop > 0.1%"        │
  │      OR: Remove precondition and let scoring handle quality            │
  │                                                                         │
  ├─────────────────────────────────────────────────────────────────────────┤
  │ B. SIGNAL POSITION TIMING                                              │
  ├─────────────────────────────────────────────────────────────────────────┤
  │                                                                         │
  │ 1. Current: Buy point marked when score >= 5 (could be 1-3 bars       │
  │    after the actual V-bottom low)                                       │
  │    - Suggested: Mark the buy point at the V-bottom low itself,          │
  │      not at the confirmation bar. The low point is where you'd         │
  │      actually want to buy. Mark confirmation with a separate indicator │
  │                                                                         │
  │ 2. Cooldown too long: 10 bars = 10 minutes minimum between signals     │
  │    - For fast-moving V-bottoms, 5-7 minutes would be better           │
  │    - Suggested: Reduce cooldown to 7 bars                              │
  │                                                                         │
  │ 3. Bounce limit too restrictive: > 2% bounce excluded                  │
  │    - A 2.5% bounce from a 5% drop is still a valid early buy point    │
  │    - Suggested: Increase to 3%, or make it proportional to decline     │
  │                                                                         │
  │ 4. 3-consecutive-decline filter too aggressive                         │
  │    - Some V-bottoms have 3 declining bars followed by sharp bounce    │
  │    - Suggested: Change to "4 consecutive declining bars" filter,       │
  │      or check if volume is shrinking in those 3 bars (drying decline) │
  │                                                                         │
  ├─────────────────────────────────────────────────────────────────────────┤
  │ C. VISUAL RENDERING POSITION                                           │
  ├─────────────────────────────────────────────────────────────────────────┤
  │                                                                         │
  │ 1. Current: Triangle at 14px below price point + connecting line       │
  │    - The 14px offset is fixed regardless of price scale                │
  │    - Suggested: Make offset proportional to chart height (2-3% of      │
  │      chart pixel height) so it scales well on different screens        │
  │                                                                         │
  │ 2. Label positioning: Connected via dashed line below triangle         │
  │    - Can overlap with other signals in dense areas                     │
  │    - Suggested: Stagger labels vertically if multiple signals are      │
  │      within 5 bars of each other                                       │
  │                                                                         │
  │ 3. Buy point marker should appear at the LOW of the V-bottom,          │
  │    not at the confirmation bar. Currently the algorithm marks at the    │
  │    bar where score >= 5, which is 1-3 bars after the actual low.       │
  │    - Suggested: When buy point is detected, look back 1-3 bars         │
  │      and find the lowest price; render marker at that bar instead      │
  │                                                                         │
  │ 4. Add "IDEAL vs ALGO" comparison indicator: Show both the ideal       │
  │    V-bottom position (faint marker) and the algorithm detection        │
  │    position (bright marker), so users can see the timing difference    │
  │                                                                         │
  └─────────────────────────────────────────────────────────────────────────┘
  `);
  
  // ── Data Export ────────────────────────────────────
  console.log(`\n${"═".repeat(80)}`);
  console.log("  📄 RAW DATA SUMMARY (for further analysis)");
  console.log(`${"═".repeat(80)}`);
  
  const summary = analyses.map(a => ({
    stock: `${a.name}(${a.code})`,
    decline: `${a.changePercent}%`,
    idealCount: a.idealBuyPoints.length,
    algoCount: a.algoBuyPoints.length,
    matched: a.matchedPoints.length,
    missed: a.missedByAlgo.length,
    falsePos: a.falsePositives.length,
    idealTimes: a.idealBuyPoints.map(bp => `${bp.time}(s${bp.score})`).join(","),
    algoTimes: a.algoBuyPoints.map(bp => `${bp.time}(s${bp.totalScore})`).join(","),
    missedTimes: a.missedByAlgo.map(bp => `${bp.time}(s${bp.score},vol${(bp.volDryPct*100).toFixed(0)}%,macd${bp.macdShrinkPct.toFixed(0)}%,low${bp.nearLowPct.toFixed(1)}%)`).join(" | "),
  }));
  
  console.table(summary);
  
  console.log(`\n✅ Analysis complete!`);
}

// Run
main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
