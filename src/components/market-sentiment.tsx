"use client";

import React, { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface BreadthHistoryPoint {
  time: string;
  totalUp: number;
  totalDown: number;
  totalFlat: number;
  limitUp: number;
  limitDown: number;
}

interface IndexRegime {
  regime: string;
  confidence: number;
  slope: number;
  momentum: number;
  volatility: number;
}

interface MarketSentimentProps {
  totalUp: number;
  totalDown: number;
  totalFlat: number;
  limitUp: number;
  limitDown: number;
  breadthHistory: BreadthHistoryPoint[];
  indexRegimes: {
    sh: IndexRegime | null;
    sz: IndexRegime | null;
    cyb: IndexRegime | null;
  };
}

// ── Sentiment Score Ranges ──
type SentimentLevel = "极度恐慌" | "恐慌" | "偏弱" | "中性" | "偏强" | "乐观" | "极度乐观";

interface FactorInfo {
  score: number;
  weight: number;
  label: string;
  desc: string;
}

interface SentimentResult {
  score: number;          // 0 ~ 100
  level: SentimentLevel;
  color: string;
  bgClass: string;
  factors: {
    adRatio: FactorInfo;
    limitIntensity: FactorInfo;
    breadthTrend: FactorInfo;
    trendAcceleration: FactorInfo;
    breadthStrength: FactorInfo;
    limitSpread: FactorInfo;
    indexRegime: FactorInfo;
  };
  trend: "up" | "down" | "flat";
}

// ── Helper: Sigmoid-based nonlinear mapping ──
// Maps raw ratio [0,1] → [0,100] with S-curve compression.
// Steeper at center (more sensitive around 50%), flatter at extremes.
function sigmoidMap(raw: number, steepness: number = 8): number {
  // raw is in [0,1], center at 0.5
  const x = (raw - 0.5) * steepness;
  const sig = 1 / (1 + Math.exp(-x));
  return Math.round(sig * 100);
}

// ── Helper: Exponential amplification for extreme values ──
// When multiple factors agree on direction, amplify the effect.
function extremeAmplify(score: number, factor: number = 1.3): number {
  // Distance from center (50)
  const dist = score - 50;
  // Apply power amplification: extreme values get pushed further
  const amplified = 50 + Math.sign(dist) * Math.pow(Math.abs(dist), factor) / Math.pow(50, factor - 1);
  return Math.max(0, Math.min(100, Math.round(amplified)));
}

// ── Helper: Exponential decay weight for time-series points ──
// More recent points get higher weight
function expDecayWeights(length: number, decay: number = 0.85): number[] {
  const weights: number[] = [];
  let sum = 0;
  for (let i = 0; i < length; i++) {
    const w = Math.pow(decay, length - 1 - i);
    weights.push(w);
    sum += w;
  }
  return weights.map(w => w / sum);
}

// ── Helper: Weighted average ──
function weightedAvg(values: number[], weights: number[]): number {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i] * weights[i];
  return sum;
}

// ── Helper: Linear regression slope ──
function linearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const weights = expDecayWeights(n, 0.8);
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i * weights[i];
    sumY += values[i] * weights[i];
    sumXY += i * values[i] * weights[i];
    sumXX += i * i * weights[i];
  }
  const denom = sumXX - sumX * sumX;
  if (Math.abs(denom) < 1e-10) return 0;
  return (sumXY - sumX * sumY) / denom;
}

function computeSentiment(
  totalUp: number,
  totalDown: number,
  totalFlat: number,
  limitUp: number,
  limitDown: number,
  breadthHistory: BreadthHistoryPoint[],
  indexRegimes: { sh: IndexRegime | null; sz: IndexRegime | null; cyb: IndexRegime | null },
): SentimentResult {
  const total = totalUp + totalDown + totalFlat || 1;

  // ══════════════════════════════════════════════════════
  // Factor 1: 涨跌比率 (A/D Ratio) — base weight 25
  // Sigmoid非线性映射，对50%附近更敏感，极端值压缩
  // ══════════════════════════════════════════════════════
  const adRatioRaw = totalUp / (totalUp + totalDown || 1);
  const adScore = sigmoidMap(adRatioRaw, 8);
  let adDesc: string;
  if (adRatioRaw > 0.75) {
    adDesc = `上涨${totalUp}家远超下跌${totalDown}家，多方压倒性占优`;
  } else if (adRatioRaw > 0.6) {
    adDesc = `上涨${totalUp}家明显多于下跌${totalDown}家，多方占优`;
  } else if (adRatioRaw > 0.52) {
    adDesc = `上涨${totalUp}家略多于下跌${totalDown}家，多方微优`;
  } else if (adRatioRaw >= 0.48) {
    adDesc = `涨跌基本持平（上${totalUp}/下${totalDown}），多空均衡`;
  } else if (adRatioRaw >= 0.4) {
    adDesc = `下跌${totalDown}家略多于上涨${totalUp}家，空方微优`;
  } else if (adRatioRaw >= 0.25) {
    adDesc = `下跌${totalDown}家明显多于上涨${totalUp}家，空方占优`;
  } else {
    adDesc = `下跌${totalDown}家远超上涨${totalUp}家，空方压倒性占优`;
  }

  // ══════════════════════════════════════════════════════
  // Factor 2: 涨跌停强度 (Limit Intensity) — base weight 15
  // 不只是比例，还考虑绝对数量占市场比例（扩散度）
  // 涨停家数/全市场 vs 跌停家数/全市场 → 反映市场极端程度
  // ══════════════════════════════════════════════════════
  let limitIntensityScore = 50;
  let limitIntensityDesc = "暂无涨跌停数据";
  if (limitUp > 0 || limitDown > 0) {
    const limitRatio = limitUp / (limitUp + limitDown || 1);
    // 基础分：涨跌停比例
    const ratioScore = sigmoidMap(limitRatio, 6);
    // 扩散度加成：涨跌停占全市场比例越高，说明极端情绪越强烈
    const limitTotal = limitUp + limitDown;
    const spreadRatio = limitTotal / total;
    // 扩散度加成：0%→0分, 2%→中等, 5%+→满分
    const spreadBoost = Math.min(1, spreadRatio / 0.03);
    // 方向性：涨停多→推高，跌停多→推低
    const directionFactor = (ratioScore - 50) / 50; // -1 ~ +1
    // 最终分数：基础50 + 方向性 * (基础偏移 + 扩散度加成)
    limitIntensityScore = Math.round(50 + directionFactor * (25 + spreadBoost * 25));
    limitIntensityScore = Math.max(0, Math.min(100, limitIntensityScore));

    if (limitUp > limitDown * 5) {
      limitIntensityDesc = `涨停${limitUp}家远超跌停${limitDown}家，市场极度亢奋`;
    } else if (limitUp > limitDown * 2) {
      limitIntensityDesc = `涨停${limitUp}家大幅多于跌停${limitDown}家，做多情绪高涨`;
    } else if (limitUp > limitDown) {
      limitIntensityDesc = `涨停${limitUp}家 > 跌停${limitDown}家，做多情绪偏高`;
    } else if (limitDown > limitUp * 5) {
      limitIntensityDesc = `跌停${limitDown}家远超涨停${limitUp}家，恐慌蔓延`;
    } else if (limitDown > limitUp * 2) {
      limitIntensityDesc = `跌停${limitDown}家大幅多于涨停${limitUp}家，做空情绪强烈`;
    } else if (limitDown > limitUp) {
      limitIntensityDesc = `跌停${limitDown}家 > 涨停${limitUp}家，做空情绪偏高`;
    } else {
      limitIntensityDesc = `涨停${limitUp}家 ≈ 跌停${limitDown}家，极端情绪均衡`;
    }
  }

  // ══════════════════════════════════════════════════════
  // Factor 3: 情绪趋势 (Breadth Trend) — base weight 20
  // 使用指数加权线性回归斜率，替代简单前后半均值对比
  // 近期数据权重更高，斜率方向和强度更准确
  // ══════════════════════════════════════════════════════
  let trendScore = 50;
  let trendDirection: "up" | "down" | "flat" = "flat";
  let trendDesc = "趋势数据不足";
  if (breadthHistory.length >= 4) {
    // 使用最近10个点（如果有），指数衰减加权
    const windowSize = Math.min(breadthHistory.length, 10);
    const recent = breadthHistory.slice(-windowSize);
    const diffs = recent.map(d => d.totalUp - d.totalDown);

    // 加权线性回归斜率
    const slope = linearSlope(diffs);

    // 斜率归一化：每分钟变化 ~10家为中等趋势，~50家为强趋势
    const slopeNorm = Math.max(-1, Math.min(1, slope / 30));
    trendScore = Math.round(50 + slopeNorm * 50);

    // 判断趋势方向：用最近3点的加权均值 vs 之前均值
    const recentDiff = diffs.slice(-3);
    const recentAvg = recentDiff.reduce((a, b) => a + b, 0) / recentDiff.length;
    const earlyDiff = diffs.slice(0, Math.max(1, diffs.length - 3));
    const earlyAvg = earlyDiff.reduce((a, b) => a + b, 0) / earlyDiff.length;
    const improvement = recentAvg - earlyAvg;

    if (improvement > 200) {
      trendDirection = "up";
      trendDesc = `涨跌差趋势强劲回升（斜率${slope.toFixed(1)}），情绪明显改善`;
    } else if (improvement > 50) {
      trendDirection = "up";
      trendDesc = `涨跌差趋势回升（斜率${slope.toFixed(1)}），情绪逐步改善`;
    } else if (improvement < -200) {
      trendDirection = "down";
      trendDesc = `涨跌差趋势急速恶化（斜率${slope.toFixed(1)}），情绪明显走弱`;
    } else if (improvement < -50) {
      trendDirection = "down";
      trendDesc = `涨跌差趋势下行（斜率${slope.toFixed(1)}），情绪逐步走弱`;
    } else {
      trendDirection = "flat";
      trendDesc = `涨跌差趋势平稳（斜率${slope.toFixed(1)}），情绪无明显变化`;
    }
  } else if (breadthHistory.length >= 1) {
    const lastDiff = breadthHistory[breadthHistory.length - 1].totalUp - breadthHistory[breadthHistory.length - 1].totalDown;
    trendScore = lastDiff >= 0 ? 60 : 40;
    trendDirection = lastDiff >= 0 ? "up" : "down";
    trendDesc = `当前涨跌差${lastDiff >= 0 ? "+" : ""}${lastDiff}，数据点不足判断趋势`;
  }

  // ══════════════════════════════════════════════════════
  // Factor 4: 趋势加速度 (Trend Acceleration) — base weight 10
  // 新增因子：趋势的变化率（二阶导数）
  // 情绪正在加速恶化/改善比匀速更值得关注
  // ══════════════════════════════════════════════════════
  let accelScore = 50;
  let accelDesc = "加速度数据不足";
  if (breadthHistory.length >= 6) {
    const windowSize = Math.min(breadthHistory.length, 12);
    const recent = breadthHistory.slice(-windowSize);
    const diffs = recent.map(d => d.totalUp - d.totalDown);

    // 将diffs分成3段，计算两段斜率之差（加速度）
    const third = Math.max(2, Math.floor(diffs.length / 3));
    const firstSlope = linearSlope(diffs.slice(0, third * 2));
    const secondSlope = linearSlope(diffs.slice(third));

    // 加速度 = 近期斜率 - 早期斜率
    const acceleration = secondSlope - firstSlope;

    // 归一化：加速度每分钟变化 ~5家/点为中等
    const accelNorm = Math.max(-1, Math.min(1, acceleration / 10));
    accelScore = Math.round(50 + accelNorm * 50);

    if (acceleration > 5) {
      accelDesc = `情绪改善加速中（加速度${acceleration.toFixed(1)}），反弹动能增强`;
    } else if (acceleration > 1) {
      accelDesc = `情绪改善略有加速（加速度${acceleration.toFixed(1)}）`;
    } else if (acceleration < -5) {
      accelDesc = `情绪恶化加速中（加速度${acceleration.toFixed(1)}），杀跌动能增强`;
    } else if (acceleration < -1) {
      accelDesc = `情绪恶化略有加速（加速度${acceleration.toFixed(1)}）`;
    } else {
      accelDesc = `情绪变化速率稳定（加速度${acceleration.toFixed(1)}），无加速迹象`;
    }
  }

  // ══════════════════════════════════════════════════════
  // Factor 5: 多空强度 (Breadth Strength) — base weight 10
  // 使用Sigmoid映射替代线性，避免极端值过度偏移
  // ══════════════════════════════════════════════════════
  const diff = totalUp - totalDown;
  const strengthRatio = diff / total;
  const strengthScore = sigmoidMap((strengthRatio + 1) / 2, 6);
  let strengthDesc: string;
  const absStrength = Math.abs(strengthRatio);
  if (absStrength > 0.5) {
    strengthDesc = strengthRatio > 0 ? "上涨家数压倒性优势" : "下跌家数压倒性优势";
  } else if (absStrength > 0.3) {
    strengthDesc = strengthRatio > 0 ? "多方明显占优" : "空方明显占优";
  } else if (absStrength > 0.1) {
    strengthDesc = strengthRatio > 0 ? "多方略占优" : "空方略占优";
  } else {
    strengthDesc = "多空基本均衡";
  }

  // ══════════════════════════════════════════════════════
  // Factor 6: 涨跌停扩散率 (Limit Spread) — base weight 10
  // 新增因子：涨跌停家数占全市场比例
  // 衡量市场极端情绪的广度，扩散率越高说明情绪越极端
  // ══════════════════════════════════════════════════════
  let spreadScore = 50;
  let spreadDesc = "无涨跌停扩散数据";
  if (limitUp > 0 || limitDown > 0) {
    const limitTotal = limitUp + limitDown;
    const spreadRate = limitTotal / total;
    // 涨停方向性
    const upDominance = limitUp / (limitTotal || 1);
    // 扩散率强度：0%→50分(中性), 1%→偏移10分, 3%→偏移25分, 5%+→偏移40分
    const intensity = Math.min(1, spreadRate / 0.04);
    const direction = (upDominance - 0.5) * 2; // -1 ~ +1
    spreadScore = Math.round(50 + direction * intensity * 45);
    spreadScore = Math.max(0, Math.min(100, spreadScore));

    const spreadPct = (spreadRate * 100).toFixed(2);
    if (spreadRate > 0.03) {
      spreadDesc = `涨跌停扩散率${spreadPct}%，极端情绪广泛蔓延`;
    } else if (spreadRate > 0.015) {
      spreadDesc = `涨跌停扩散率${spreadPct}%，极端情绪有所扩散`;
    } else if (spreadRate > 0.005) {
      spreadDesc = `涨跌停扩散率${spreadPct}%，极端情绪较集中`;
    } else {
      spreadDesc = `涨跌停扩散率${spreadPct}%，极端情绪较罕见`;
    }
  }

  // ══════════════════════════════════════════════════════
  // Factor 7: 指数状态 (Index Regime) — base weight 10
  // 考虑置信度加权，高置信度的判断权重更大
  // ══════════════════════════════════════════════════════
  let regimeScore = 50;
  let regimeDesc = "指数状态未知";
  const regimes = [indexRegimes.sh, indexRegimes.sz, indexRegimes.cyb].filter(Boolean) as IndexRegime[];
  if (regimes.length > 0) {
    let regimeWeightedTotal = 0;
    let regimeWeightSum = 0;
    const regimeLabels: string[] = [];
    for (const r of regimes) {
      let rScore = 50;
      const confidence = Math.max(0.3, Math.min(1, r.confidence || 0.5));

      if (r.regime === "上升通道") {
        rScore = 75 + Math.max(-15, Math.min(15, r.momentum * 15));
        regimeLabels.push("上升");
      } else if (r.regime === "下跌趋势") {
        rScore = 25 + Math.max(-15, Math.min(15, r.momentum * 15));
        regimeLabels.push("下跌");
      } else if (r.regime === "横盘末期") {
        rScore = 55 + (r.momentum || 0) * 5;
        regimeLabels.push("横盘末期");
      } else {
        rScore = 50 + Math.max(-10, Math.min(10, (r.momentum || 0) * 10));
        regimeLabels.push("震荡");
      }
      rScore = Math.max(0, Math.min(100, rScore));
      regimeWeightedTotal += rScore * confidence;
      regimeWeightSum += confidence;
    }
    regimeScore = Math.round(regimeWeightedTotal / (regimeWeightSum || 1));

    const uniqueLabels = [...new Set(regimeLabels)];
    if (uniqueLabels.includes("上升") && !uniqueLabels.includes("下跌")) {
      regimeDesc = "主要指数处于上升通道";
    } else if (uniqueLabels.includes("下跌") && !uniqueLabels.includes("上升")) {
      regimeDesc = "主要指数处于下跌趋势";
    } else if (uniqueLabels.includes("上升") && uniqueLabels.includes("下跌")) {
      regimeDesc = "指数走势分化，需谨慎";
    } else if (uniqueLabels.includes("横盘末期")) {
      regimeDesc = "指数横盘酝酿方向";
    } else {
      regimeDesc = "指数震荡整理";
    }
  }

  // ══════════════════════════════════════════════════════
  // Dynamic Weight Adjustment (动态权重调整)
  // 极端行情下提升涨跌停相关因子权重
  // ══════════════════════════════════════════════════════
  const baseWeights = {
    adRatio: 25,
    limitIntensity: 15,
    breadthTrend: 20,
    trendAcceleration: 10,
    breadthStrength: 10,
    limitSpread: 10,
    indexRegime: 10,
  };

  // 极端行情检测：涨跌停占比越高，涨跌停因子权重越大
  const limitActivity = (limitUp + limitDown) / total;
  const extremeBoost = Math.min(1, limitActivity / 0.03); // 3%以上为极端行情

  const weights = { ...baseWeights };
  if (extremeBoost > 0.2) {
    // 从涨跌比率和多空强度中各抽一部分权重给涨跌停因子
    const transferFromAD = Math.round(extremeBoost * 8);
    const transferFromStrength = Math.round(extremeBoost * 5);
    weights.adRatio -= transferFromAD;
    weights.breadthStrength -= transferFromStrength;
    weights.limitIntensity += transferFromAD;
    weights.limitSpread += transferFromStrength;
  }

  // 确保权重非负
  for (const key of Object.keys(weights) as (keyof typeof weights)[]) {
    weights[key] = Math.max(2, weights[key]);
  }

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);

  // ══════════════════════════════════════════════════════
  // Weighted Final Score with Extreme Amplification
  // ══════════════════════════════════════════════════════
  const rawScore = Math.round(
    (adScore * weights.adRatio +
      limitIntensityScore * weights.limitIntensity +
      trendScore * weights.breadthTrend +
      accelScore * weights.trendAcceleration +
      strengthScore * weights.breadthStrength +
      spreadScore * weights.limitSpread +
      regimeScore * weights.indexRegime) / totalWeight
  );

  // 极值共振放大：当3个以上因子同方向极端时，放大偏移
  const allScores = [adScore, limitIntensityScore, trendScore, accelScore, strengthScore, spreadScore, regimeScore];
  const extremeCount = allScores.filter(s => s <= 20 || s >= 80).length;
  const amplificationFactor = extremeCount >= 5 ? 1.4 : extremeCount >= 4 ? 1.3 : extremeCount >= 3 ? 1.15 : 1.0;

  const amplifiedScore = extremeAmplify(Math.max(0, Math.min(100, rawScore)), amplificationFactor);
  const score = Math.max(0, Math.min(100, amplifiedScore));

  // ══════════════════════════════════════════════════════
  // Determine Level
  // ══════════════════════════════════════════════════════
  let level: SentimentLevel;
  let color: string;
  let bgClass: string;

  if (score <= 15) {
    level = "极度恐慌"; color = "#059669"; bgClass = "bg-emerald-600/25 border-emerald-600/60";
  } else if (score <= 30) {
    level = "恐慌"; color = "#16a34a"; bgClass = "bg-green-600/20 border-green-600/50";
  } else if (score <= 42) {
    level = "偏弱"; color = "#65a30d"; bgClass = "bg-lime-600/20 border-lime-600/50";
  } else if (score <= 58) {
    level = "中性"; color = "#ca8a04"; bgClass = "bg-yellow-600/20 border-yellow-600/50";
  } else if (score <= 70) {
    level = "偏强"; color = "#ea580c"; bgClass = "bg-orange-600/20 border-orange-600/50";
  } else if (score <= 85) {
    level = "乐观"; color = "#dc2626"; bgClass = "bg-red-600/20 border-red-600/50";
  } else {
    level = "极度乐观"; color = "#b91c1c"; bgClass = "bg-red-700/25 border-red-700/60";
  }

  return {
    score,
    level,
    color,
    bgClass,
    factors: {
      adRatio: { score: adScore, weight: weights.adRatio, label: "涨跌比率", desc: adDesc },
      limitIntensity: { score: limitIntensityScore, weight: weights.limitIntensity, label: "涨跌停比", desc: limitIntensityDesc },
      breadthTrend: { score: trendScore, weight: weights.breadthTrend, label: "情绪趋势", desc: trendDesc },
      trendAcceleration: { score: accelScore, weight: weights.trendAcceleration, label: "趋势动能", desc: accelDesc },
      breadthStrength: { score: strengthScore, weight: weights.breadthStrength, label: "多空强度", desc: strengthDesc },
      limitSpread: { score: spreadScore, weight: weights.limitSpread, label: "极端扩散", desc: spreadDesc },
      indexRegime: { score: regimeScore, weight: weights.indexRegime, label: "指数状态", desc: regimeDesc },
    },
    trend: trendDirection,
  };
}

function getFactorColor(score: number): string {
  if (score >= 70) return "#b91c1c";
  if (score >= 58) return "#dc2626";
  if (score >= 50) return "#ea580c";
  if (score >= 42) return "#ca8a04";
  if (score >= 30) return "#65a30d";
  return "#16a34a";
}

function getFactorBg(score: number): string {
  if (score >= 70) return "rgba(185,28,28,0.18)";
  if (score >= 58) return "rgba(220,38,38,0.15)";
  if (score >= 50) return "rgba(234,88,12,0.15)";
  if (score >= 42) return "rgba(202,138,4,0.15)";
  if (score >= 30) return "rgba(101,163,13,0.15)";
  return "rgba(22,163,74,0.15)";
}

// CSS keyframes for pulse animation (injected once)
const PULSE_STYLE_ID = "sentiment-pulse-style";
if (typeof document !== "undefined" && !document.getElementById(PULSE_STYLE_ID)) {
  const style = document.createElement("style");
  style.id = PULSE_STYLE_ID;
  style.textContent = `
    @keyframes sentimentPulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }
    @keyframes needleSweep {
      0% { opacity: 0; }
      100% { opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

export function MarketSentiment({
  totalUp, totalDown, totalFlat,
  limitUp, limitDown,
  breadthHistory,
  indexRegimes,
}: MarketSentimentProps) {
  const result = useMemo(
    () => computeSentiment(totalUp, totalDown, totalFlat, limitUp, limitDown, breadthHistory, indexRegimes),
    [totalUp, totalDown, totalFlat, limitUp, limitDown, breadthHistory, indexRegimes]
  );

  const { score, level, color, bgClass, factors, trend } = result;

  // Gauge arc SVG — bigger dimensions
  const gaugeR = 62;
  const gaugeCx = 90;
  const gaugeCy = 66;
  const gaugeStartAngle = -225;
  const gaugeEndAngle = 45;
  const gaugeRange = gaugeEndAngle - gaugeStartAngle; // 270 degrees
  const scoreAngle = gaugeStartAngle + (score / 100) * gaugeRange;

  const polarToCart = (cx: number, cy: number, r: number, angleDeg: number) => {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  const gaugePath = (startAngle: number, endAngle: number, r: number) => {
    const s = polarToCart(gaugeCx, gaugeCy, r, startAngle);
    const e = polarToCart(gaugeCx, gaugeCy, r, endAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return `M${s.x.toFixed(1)},${s.y.toFixed(1)} A${r},${r} 0 ${largeArc} 1 ${e.x.toFixed(1)},${e.y.toFixed(1)}`;
  };

  // Score needle — longer, more dramatic
  const needleTip = polarToCart(gaugeCx, gaugeCy, gaugeR - 10, scoreAngle);
  const needleBase1 = polarToCart(gaugeCx, gaugeCy, 6, scoreAngle - 90);
  const needleBase2 = polarToCart(gaugeCx, gaugeCy, 6, scoreAngle + 90);
  // Counter-weight on the opposite side
  const needleTail = polarToCart(gaugeCx, gaugeCy, 14, scoreAngle + 180);

  // Trend arrow
  const trendIcon = trend === "up" ? "▲" : trend === "down" ? "▼" : "●";
  const trendColor = trend === "up" ? "#ef4444" : trend === "down" ? "#22c55e" : "#eab308";
  const trendLabel = trend === "up" ? "情绪回升" : trend === "down" ? "情绪走弱" : "情绪平稳";

  // Sentiment bar zone definitions
  const zones = [
    { label: "极度", width: "15%", bg: "bg-emerald-700" },
    { label: "恐慌", width: "15%", bg: "bg-green-600" },
    { label: "偏弱", width: "12%", bg: "bg-lime-600" },
    { label: "中性", width: "16%", bg: "bg-yellow-600" },
    { label: "偏强", width: "12%", bg: "bg-orange-600" },
    { label: "乐观", width: "15%", bg: "bg-red-600" },
    { label: "极度", width: "15%", bg: "bg-red-800" },
  ];

  // Factor entries for rendering — show 7 factors in compact layout
  const factorEntries = Object.entries(factors) as [string, FactorInfo][];

  return (
    <Card className={`border-2 overflow-hidden ${bgClass}`}>
      <CardContent className="px-3 py-2 sm:px-4 sm:py-2">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-extrabold text-foreground/90 tracking-wide">市场情绪指数</span>
          <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full"
            style={{ backgroundColor: `${trendColor}25`, color: trendColor, boxShadow: `0 0 8px ${trendColor}30` }}>
            {trendIcon} {trendLabel}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Gauge — larger & more dramatic */}
          <div className="shrink-0">
            <svg width="180" height="120" viewBox="0 0 180 120" className="w-[160px]">
              <defs>
                {/* Outer glow for the active arc */}
                <filter id="gaugeGlow" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="5" result="blur" />
                  <feFlood floodColor={color} floodOpacity="0.7" />
                  <feComposite in2="blur" operator="in" />
                  <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                {/* Needle glow */}
                <filter id="needleGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feFlood floodColor={color} floodOpacity="0.8" />
                  <feComposite in2="blur" operator="in" />
                  <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                {/* Score text glow */}
                <filter id="scoreGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="5" result="blur" />
                  <feFlood floodColor={color} floodOpacity="0.6" />
                  <feComposite in2="blur" operator="in" />
                  <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                {/* Radial gradient for gauge background */}
                <radialGradient id="gaugeBgGrad" cx="50%" cy="50%" r="60%">
                  <stop offset="0%" stopColor={color} stopOpacity="0.06" />
                  <stop offset="100%" stopColor={color} stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* Subtle inner glow circle */}
              <circle cx={gaugeCx} cy={gaugeCy} r={gaugeR - 18} fill="url(#gaugeBgGrad)" />

              {/* Background arc: 7 vivid segments with gaps */}
              <path d={gaugePath(gaugeStartAngle + 1.2, gaugeStartAngle + gaugeRange * 0.15 - 0.6, gaugeR)}
                fill="none" stroke="#059669" strokeWidth={16} strokeLinecap="round" opacity={0.95} />
              <path d={gaugePath(gaugeStartAngle + gaugeRange * 0.15 + 0.6, gaugeStartAngle + gaugeRange * 0.30 - 0.6, gaugeR)}
                fill="none" stroke="#16a34a" strokeWidth={16} strokeLinecap="round" opacity={0.90} />
              <path d={gaugePath(gaugeStartAngle + gaugeRange * 0.30 + 0.6, gaugeStartAngle + gaugeRange * 0.42 - 0.6, gaugeR)}
                fill="none" stroke="#65a30d" strokeWidth={16} strokeLinecap="round" opacity={0.90} />
              <path d={gaugePath(gaugeStartAngle + gaugeRange * 0.42 + 0.6, gaugeStartAngle + gaugeRange * 0.58 - 0.6, gaugeR)}
                fill="none" stroke="#ca8a04" strokeWidth={16} strokeLinecap="round" opacity={0.90} />
              <path d={gaugePath(gaugeStartAngle + gaugeRange * 0.58 + 0.6, gaugeStartAngle + gaugeRange * 0.70 - 0.6, gaugeR)}
                fill="none" stroke="#ea580c" strokeWidth={16} strokeLinecap="round" opacity={0.90} />
              <path d={gaugePath(gaugeStartAngle + gaugeRange * 0.70 + 0.6, gaugeStartAngle + gaugeRange * 0.85 - 0.6, gaugeR)}
                fill="none" stroke="#dc2626" strokeWidth={16} strokeLinecap="round" opacity={0.90} />
              <path d={gaugePath(gaugeStartAngle + gaugeRange * 0.85 + 0.6, gaugeEndAngle - 1.2, gaugeR)}
                fill="none" stroke="#b91c1c" strokeWidth={16} strokeLinecap="round" opacity={0.95} />

              {/* Tick marks at segment boundaries */}
              {[0, 0.15, 0.30, 0.42, 0.58, 0.70, 0.85, 1].map((ratio, i) => {
                const angle = gaugeStartAngle + gaugeRange * ratio;
                const inner = polarToCart(gaugeCx, gaugeCy, gaugeR - 10, angle);
                const outer = polarToCart(gaugeCx, gaugeCy, gaugeR + 2, angle);
                return (
                  <line key={i} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
                    stroke="white" strokeWidth={1.5} opacity={0.4} />
                );
              })}

              {/* Active arc (filled portion up to score) — bright & glowing */}
              <path d={gaugePath(gaugeStartAngle, scoreAngle, gaugeR - 2)}
                fill="none" stroke={color} strokeWidth={10} strokeLinecap="round" filter="url(#gaugeGlow)" opacity={0.95} />

              {/* Needle — with counter-weight and glow */}
              <line x1={needleTail.x} y1={needleTail.y} x2={needleTip.x} y2={needleTip.y}
                stroke={color} strokeWidth={2.5} filter="url(#needleGlow)" strokeLinecap="round" />
              <polygon
                points={`${needleTip.x.toFixed(1)},${needleTip.y.toFixed(1)} ${needleBase1.x.toFixed(1)},${needleBase1.y.toFixed(1)} ${needleBase2.x.toFixed(1)},${needleBase2.y.toFixed(1)}`}
                fill={color} filter="url(#needleGlow)"
              />
              {/* Center hub */}
              <circle cx={gaugeCx} cy={gaugeCy} r={7} fill="#1a1a2e" stroke={color} strokeWidth={2} />
              <circle cx={gaugeCx} cy={gaugeCy} r={3} fill={color} style={{ animation: "sentimentPulse 2s ease-in-out infinite" }} />

              {/* Score text — big, bold & glowing */}
              <text x={gaugeCx} y={gaugeCy + 22} textAnchor="middle" fontSize={28} fontWeight={900} fontFamily="monospace" fill={color} filter="url(#scoreGlow)">
                {score}
              </text>
              {/* Level label — pill background */}
              <rect x={gaugeCx - 32} y={gaugeCy + 28} width={64} height={18} rx={5} fill={color} opacity={0.22} />
              <rect x={gaugeCx - 32} y={gaugeCy + 28} width={64} height={18} rx={5} fill="none" stroke={color} strokeWidth={1} opacity={0.3} />
              <text x={gaugeCx} y={gaugeCy + 41} textAnchor="middle" fontSize={12} fontWeight={800} fill={color}>
                {level}
              </text>

              {/* Tick labels at 0, 50, 100 */}
              <text x={polarToCart(gaugeCx, gaugeCy, gaugeR + 16, gaugeStartAngle).x}
                y={polarToCart(gaugeCx, gaugeCy, gaugeR + 16, gaugeStartAngle).y + 3}
                textAnchor="middle" fontSize={9} fontWeight={700} fill="currentColor" className="text-muted-foreground">0</text>
              <text x={polarToCart(gaugeCx, gaugeCy, gaugeR + 16, gaugeStartAngle + gaugeRange * 0.5).x}
                y={polarToCart(gaugeCx, gaugeCy, gaugeR + 16, gaugeStartAngle + gaugeRange * 0.5).y + 3}
                textAnchor="middle" fontSize={9} fontWeight={700} fill="currentColor" className="text-muted-foreground">50</text>
              <text x={polarToCart(gaugeCx, gaugeCy, gaugeR + 16, gaugeEndAngle).x}
                y={polarToCart(gaugeCx, gaugeCy, gaugeR + 16, gaugeEndAngle).y + 3}
                textAnchor="middle" fontSize={9} fontWeight={700} fill="currentColor" className="text-muted-foreground">100</text>
            </svg>
          </div>

          {/* Factor breakdown — 7 factors in compact layout */}
          <div className="flex-1 min-w-0 space-y-1.5">
            {factorEntries.map(([key, f]) => {
              const fc = getFactorColor(f.score);
              return (
                <div key={key} className="group">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-[10px] font-extrabold w-14 shrink-0 truncate" style={{ color: fc }}>{f.label}</span>
                    <div className="flex-1 h-3 rounded-full overflow-hidden relative" style={{ backgroundColor: getFactorBg(f.score), boxShadow: `inset 0 1px 2px ${fc}15` }}>
                      {/* Background scale marks */}
                      <div className="absolute inset-0 flex">
                        <div className="w-1/2 border-r border-white/5" />
                      </div>
                      <div
                        className="h-full rounded-full transition-all duration-700 relative"
                        style={{ width: `${f.score}%`, background: `linear-gradient(90deg, ${fc}cc, ${fc})`, boxShadow: `0 0 8px ${fc}35, inset 0 1px 0 rgba(255,255,255,0.2)` }}
                      >
                        {/* Shine highlight */}
                        <div className="absolute top-0 left-0 right-0 h-1/2 rounded-t-full" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.2) 0%, transparent 100%)" }} />
                      </div>
                    </div>
                    <span className="text-[10px] font-mono font-extrabold w-6 text-right tabular-nums" style={{ color: fc }}>
                      {f.score}
                    </span>
                  </div>
                  {/* Hover description */}
                  <div className="hidden group-hover:block text-[10px] text-muted-foreground/80 mt-0.5 pl-14 truncate">
                    {f.desc}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sentiment bar — redesigned with separators and labels */}
        <div className="mt-2.5">
          <div className="h-6 w-full rounded-full overflow-hidden flex relative" style={{ boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.2)' }}>
            {zones.map((zone, i) => (
              <div key={i} className={`h-full ${zone.bg} ${i < zones.length - 1 ? 'border-r border-white/30' : ''} relative`} style={{ width: zone.width }}>
                {/* Subtle shine */}
                <div className="absolute inset-x-0 top-0 h-1/2" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.2) 0%, transparent 100%)" }} />
              </div>
            ))}
            {/* Zone labels inside bar */}
            <div className="absolute inset-0 flex items-center pointer-events-none">
              {zones.map((zone, i) => (
                <div key={i} style={{ width: zone.width }} className="flex justify-center items-center h-full">
                  <span className="text-[9px] font-bold text-white/90 drop-shadow-sm">{zone.label}</span>
                </div>
              ))}
            </div>
            {/* Score indicator line — prominent */}
            <div className="absolute top-0 h-full transition-all duration-700" style={{ left: `${score}%`, transform: "translateX(-50%)" }}>
              <div className="w-0.5 h-full bg-white/90 rounded-full" style={{ boxShadow: '0 0 12px 5px rgba(255,255,255,0.7), 0 0 4px 2px rgba(255,255,255,0.9)' }} />
            </div>
          </div>
          {/* Triangle pointer below the bar */}
          <div className="relative h-0" style={{ marginTop: '-1px' }}>
            <div className="absolute transition-all duration-700" style={{ left: `${score}%`, transform: "translateX(-50%)" }}>
              <svg width="16" height="9" viewBox="0 0 16 9" style={{ display: 'block' }}>
                <polygon points="8,0 0,9 16,9" fill={color} />
              </svg>
            </div>
          </div>
          {/* Bottom labels */}
          <div className="flex justify-between mt-1">
            <span className="text-[11px] text-emerald-600 font-extrabold">恐慌</span>
            <span className="text-[11px] text-yellow-600 font-extrabold">中性</span>
            <span className="text-[11px] text-red-600 font-extrabold">乐观</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
