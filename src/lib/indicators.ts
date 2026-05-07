/**
 * Technical Indicators - MACD, EMA, SMA calculations
 * 
 * EMA/MACD algorithms follow 同花顺/通达信 standard:
 *   EMA(X, N): Y = [2*X + (N-1)*Y'] / (N+1)
 *   初始值: Y[0] = X[0]
 */

// ── EMA (Exponential Moving Average) ──────────────────
// 同花顺/通达信标准：EMA[0] = data[0]，从第一个数据点开始

export function calculateEMA(data: number[], period: number): number[] {
  const ema: number[] = [];
  if (data.length === 0) return ema;

  const multiplier = 2 / (period + 1);

  // 同花顺/通达信初始化：EMA首个值 = 第一个数据点
  ema[0] = data[0];

  // Calculate EMA: EMA[i] = (data[i] - EMA[i-1]) * multiplier + EMA[i-1]
  for (let i = 1; i < data.length; i++) {
    ema[i] = (data[i] - ema[i - 1]) * multiplier + ema[i - 1];
  }

  return ema;
}

// ── SMA (Simple Moving Average) ───────────────────────

export function calculateSMA(data: number[], period: number): number[] {
  const sma: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      sma.push(NaN);
      continue;
    }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += data[j];
    }
    sma.push(sum / period);
  }
  return sma;
}

// ── MACD ──────────────────────────────────────────────
// 同花顺/通达信标准算法:
//   DIF: EMA(CLOSE,12) - EMA(CLOSE,26)
//   DEA: EMA(DIF,9)
//   MACD: (DIF - DEA) * 2
// 所有值从第一个数据点开始（EMA[0]=X[0] 初始化）

export interface MACDData {
  dif: number;    // DIF line (MACD line) = EMA12 - EMA26
  dea: number;    // DEA line (Signal line) = EMA9 of DIF
  macd: number;   // MACD histogram = (DIF - DEA) * 2
}

export function calculateMACD(
  closePrices: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): MACDData[] {
  const result: MACDData[] = [];
  if (closePrices.length === 0) return result;

  const emaFast = calculateEMA(closePrices, fastPeriod);
  const emaSlow = calculateEMA(closePrices, slowPeriod);

  // Calculate DIF (available from index 0, 同花顺标准)
  const dif: number[] = [];
  for (let i = 0; i < closePrices.length; i++) {
    dif.push(emaFast[i] - emaSlow[i]);
  }

  // Calculate DEA: EMA of DIF (同花顺标准，DEA[0] = DIF[0])
  const dea = calculateEMA(dif, signalPeriod);

  // Calculate MACD histogram
  for (let i = 0; i < closePrices.length; i++) {
    result.push({
      dif: Number(dif[i].toFixed(4)),
      dea: Number(dea[i].toFixed(4)),
      macd: Number(((dif[i] - dea[i]) * 2).toFixed(4)),
    });
  }

  return result;
}

// ── KDJ ───────────────────────────────────────────────

export interface KDJData {
  k: number;
  d: number;
  j: number;
}

export function calculateKDJ(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 9,
  m1: number = 3,
  m2: number = 3
): KDJData[] {
  const result: KDJData[] = [];
  let prevK = 50;
  let prevD = 50;

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result.push({ k: NaN, d: NaN, j: NaN });
      continue;
    }

    let highestHigh = -Infinity;
    let lowestLow = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      highestHigh = Math.max(highestHigh, highs[j]);
      lowestLow = Math.min(lowestLow, lows[j]);
    }

    const rsv = highestHigh === lowestLow ? 50 : ((closes[i] - lowestLow) / (highestHigh - lowestLow)) * 100;
    const k = (2 / m1) * prevK + (1 / m1) * rsv;
    const d = (2 / m2) * prevD + (1 / m2) * k;
    const j = 3 * k - 2 * d;

    prevK = k;
    prevD = d;

    result.push({
      k: Number(k.toFixed(2)),
      d: Number(d.toFixed(2)),
      j: Number(j.toFixed(2)),
    });
  }

  return result;
}

// ── RSI ───────────────────────────────────────────────

export function calculateRSI(closePrices: number[], period: number = 14): number[] {
  const result: number[] = [];

  if (closePrices.length < 2) return result;

  let gainSum = 0;
  let lossSum = 0;

  for (let i = 0; i < closePrices.length; i++) {
    if (i === 0) {
      result.push(NaN);
      continue;
    }

    const change = closePrices[i] - closePrices[i - 1];

    if (i <= period) {
      if (change > 0) gainSum += change;
      else lossSum += Math.abs(change);

      if (i < period) {
        result.push(NaN);
        continue;
      }

      const avgGain = gainSum / period;
      const avgLoss = lossSum / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      result.push(Number((100 - 100 / (1 + rs)).toFixed(2)));
    } else {
      const prevAvgGain = gainSum / period;
      const prevAvgLoss = lossSum / period;

      const currentGain = change > 0 ? change : 0;
      const currentLoss = change < 0 ? Math.abs(change) : 0;

      gainSum = prevAvgGain * (period - 1) + currentGain;
      lossSum = prevAvgLoss * (period - 1) + currentLoss;

      const avgGain = gainSum / period;
      const avgLoss = lossSum / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      result.push(Number((100 - 100 / (1 + rs)).toFixed(2)));
    }
  }

  return result;
}

// ── Bollinger Bands ───────────────────────────────────

export interface BollingerData {
  upper: number;
  middle: number;
  lower: number;
}

export function calculateBollinger(
  closePrices: number[],
  period: number = 20,
  multiplier: number = 2
): BollingerData[] {
  const result: BollingerData[] = [];
  const sma = calculateSMA(closePrices, period);

  for (let i = 0; i < closePrices.length; i++) {
    if (isNaN(sma[i])) {
      result.push({ upper: NaN, middle: NaN, lower: NaN });
      continue;
    }

    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) {
      variance += Math.pow(closePrices[j] - sma[i], 2);
    }
    const stdDev = Math.sqrt(variance / period);

    result.push({
      upper: Number((sma[i] + multiplier * stdDev).toFixed(2)),
      middle: Number(sma[i].toFixed(2)),
      lower: Number((sma[i] - multiplier * stdDev).toFixed(2)),
    });
  }

  return result;
}

// ── Trading Signals (for T-trading) ──────────────────

export interface TradingSignal {
  type: "buy" | "sell" | "hold";
  strength: "strong" | "medium" | "weak";
  reason: string;
}

export function generateMACDSignals(macdData: MACDData[]): TradingSignal[] {
  const signals: TradingSignal[] = [];

  for (let i = 0; i < macdData.length; i++) {
    if (isNaN(macdData[i].dif) || isNaN(macdData[i].dea)) {
      signals.push({ type: "hold", strength: "weak", reason: "数据不足" });
      continue;
    }

    if (i < 1 || isNaN(macdData[i - 1].dif) || isNaN(macdData[i - 1].dea)) {
      signals.push({ type: "hold", strength: "weak", reason: "等待信号" });
      continue;
    }

    const prevDif = macdData[i - 1].dif;
    const currDif = macdData[i].dif;
    const prevDea = macdData[i - 1].dea;
    const currDea = macdData[i].dea;
    const prevMacd = macdData[i - 1].macd;
    const currMacd = macdData[i].macd;

    // Golden cross: DIF crosses above DEA
    if (prevDif <= prevDea && currDif > currDea) {
      const strength = currMacd > 0 ? "strong" : "medium";
      signals.push({
        type: "buy",
        strength,
        reason: currMacd > 0 ? "零轴上方金叉，强买入信号" : "零轴下方金叉，弱买入信号",
      });
    }
    // Death cross: DIF crosses below DEA
    else if (prevDif >= prevDea && currDif < currDea) {
      const strength = currMacd < 0 ? "strong" : "medium";
      signals.push({
        type: "sell",
        strength,
        reason: currMacd < 0 ? "零轴下方死叉，强卖出信号" : "零轴上方死叉，弱卖出信号",
      });
    }
    // MACD histogram turning from negative to positive
    else if (prevMacd < 0 && currMacd > 0 && currMacd > prevMacd) {
      signals.push({ type: "buy", strength: "medium", reason: "MACD柱由负转正" });
    }
    // MACD histogram turning from positive to negative
    else if (prevMacd > 0 && currMacd < 0 && currMacd < prevMacd) {
      signals.push({ type: "sell", strength: "medium", reason: "MACD柱由正转负" });
    }
    // DIF rising
    else if (currDif > prevDif && currDif > currDea) {
      signals.push({ type: "buy", strength: "weak", reason: "DIF上行，多头趋势" });
    }
    // DIF falling
    else if (currDif < prevDif && currDif < currDea) {
      signals.push({ type: "sell", strength: "weak", reason: "DIF下行，空头趋势" });
    } else {
      signals.push({ type: "hold", strength: "weak", reason: "震荡整理" });
    }
  }

  return signals;
}
