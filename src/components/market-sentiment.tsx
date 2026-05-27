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

interface SentimentResult {
  score: number;          // 0 ~ 100
  level: SentimentLevel;
  color: string;
  bgClass: string;
  factors: {
    adRatio: { score: number; weight: number; label: string; desc: string };
    limitRatio: { score: number; weight: number; label: string; desc: string };
    breadthTrend: { score: number; weight: number; label: string; desc: string };
    breadthStrength: { score: number; weight: number; label: string; desc: string };
    indexRegime: { score: number; weight: number; label: string; desc: string };
  };
  trend: "up" | "down" | "flat";
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

  // ── Factor 1: A/D Ratio (涨跌比率) — weight 30 ──
  const adRatio = totalUp / (totalUp + totalDown || 1); // 0~1, 0.5=neutral
  const adScore = Math.round(adRatio * 100); // 0~100
  const adDesc = totalUp > totalDown
    ? `上涨${totalUp}家 > 下跌${totalDown}家，多方占优`
    : totalUp < totalDown
    ? `下跌${totalDown}家 > 上涨${totalUp}家，空方占优`
    : "涨跌持平";

  // ── Factor 2: Limit Up/Down Ratio (涨停跌停比) — weight 15 ──
  let limitScore = 50; // neutral
  let limitDesc = "暂无涨跌停数据";
  if (limitUp > 0 || limitDown > 0) {
    const limitTotal = limitUp + limitDown;
    const limitRatio = limitUp / (limitTotal || 1);
    limitScore = Math.round(limitRatio * 100);
    if (limitUp > limitDown * 3) {
      limitDesc = `涨停${limitUp}家远超跌停${limitDown}家，市场极度亢奋`;
    } else if (limitUp > limitDown) {
      limitDesc = `涨停${limitUp}家 > 跌停${limitDown}家，做多情绪偏高`;
    } else if (limitDown > limitUp * 3) {
      limitDesc = `跌停${limitDown}家远超涨停${limitUp}家，恐慌蔓延`;
    } else if (limitDown > limitUp) {
      limitDesc = `跌停${limitDown}家 > 涨停${limitUp}家，做空情绪偏高`;
    } else {
      limitDesc = `涨停${limitUp}家 ≈ 跌停${limitDown}家，情绪均衡`;
    }
  }

  // ── Factor 3: Breadth Trend (涨跌差趋势) — weight 25 ──
  let trendScore = 50;
  let trendDirection: "up" | "down" | "flat" = "flat";
  let trendDesc = "趋势数据不足";
  if (breadthHistory.length >= 3) {
    const recent = breadthHistory.slice(-5);
    const diffs = recent.map(d => d.totalUp - d.totalDown);
    // Simple linear trend: compare first half avg vs second half avg
    const half = Math.floor(diffs.length / 2) || 1;
    const firstHalf = diffs.slice(0, half);
    const secondHalf = diffs.slice(half);
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    const improvement = secondAvg - firstAvg;

    // Normalize improvement to 0~100 scale
    // A change of ±500 is significant for a market with ~5000 stocks
    const trendNorm = Math.max(-1, Math.min(1, improvement / 500));
    trendScore = Math.round(50 + trendNorm * 50);

    if (improvement > 100) {
      trendDirection = "up";
      trendDesc = `涨跌差从${Math.round(firstAvg)}改善至${Math.round(secondAvg)}，情绪回升`;
    } else if (improvement < -100) {
      trendDirection = "down";
      trendDesc = `涨跌差从${Math.round(firstAvg)}恶化至${Math.round(secondAvg)}，情绪走弱`;
    } else {
      trendDirection = "flat";
      trendDesc = `涨跌差维持在${Math.round(secondAvg)}附近，趋势平稳`;
    }
  } else if (breadthHistory.length >= 1) {
    const lastDiff = breadthHistory[breadthHistory.length - 1].totalUp - breadthHistory[breadthHistory.length - 1].totalDown;
    trendScore = lastDiff >= 0 ? 60 : 40;
    trendDirection = lastDiff >= 0 ? "up" : "down";
    trendDesc = `当前涨跌差${lastDiff >= 0 ? "+" : ""}${lastDiff}，数据点不足判断趋势`;
  }

  // ── Factor 4: Breadth Strength (涨跌差幅度) — weight 15 ──
  const diff = totalUp - totalDown;
  const strengthRatio = diff / total; // -1 ~ 1
  const strengthScore = Math.round(50 + strengthRatio * 50);
  let strengthDesc: string;
  const absStrength = Math.abs(strengthRatio);
  if (absStrength > 0.4) {
    strengthDesc = strengthRatio > 0 ? "上涨家数压倒性优势" : "下跌家数压倒性优势";
  } else if (absStrength > 0.2) {
    strengthDesc = strengthRatio > 0 ? "多方明显占优" : "空方明显占优";
  } else if (absStrength > 0.05) {
    strengthDesc = strengthRatio > 0 ? "多方略占优" : "空方略占优";
  } else {
    strengthDesc = "多空基本均衡";
  }

  // ── Factor 5: Index Regime (大盘指数状态) — weight 15 ──
  let regimeScore = 50;
  let regimeDesc = "指数状态未知";
  const regimes = [indexRegimes.sh, indexRegimes.sz, indexRegimes.cyb].filter(Boolean) as IndexRegime[];
  if (regimes.length > 0) {
    // Average regime score across all indices
    let regimeTotal = 0;
    const regimeLabels: string[] = [];
    for (const r of regimes) {
      let rScore = 50;
      if (r.regime === "上升通道") {
        rScore = 75 + r.momentum * 15; // momentum is -1~1
        regimeLabels.push("上升");
      } else if (r.regime === "下跌趋势") {
        rScore = 25 + r.momentum * 15;
        regimeLabels.push("下跌");
      } else if (r.regime === "横盘末期") {
        rScore = 55; // slightly bullish bias (breakout anticipation)
        regimeLabels.push("横盘末期");
      } else {
        rScore = 50 + r.momentum * 10;
        regimeLabels.push("震荡");
      }
      regimeTotal += Math.max(0, Math.min(100, rScore));
    }
    regimeScore = Math.round(regimeTotal / regimes.length);
    const uniqueLabels = [...new Set(regimeLabels)];
    if (uniqueLabels.includes("上升") && !uniqueLabels.includes("下跌")) {
      regimeDesc = "主要指数处于上升通道";
    } else if (uniqueLabels.includes("下跌") && !uniqueLabels.includes("上升")) {
      regimeDesc = "主要指数处于下跌趋势";
    } else if (uniqueLabels.includes("上升") && uniqueLabels.includes("下跌")) {
      regimeDesc = "指数走势分化";
    } else if (uniqueLabels.includes("横盘末期")) {
      regimeDesc = "指数横盘酝酿方向";
    } else {
      regimeDesc = "指数震荡整理";
    }
  }

  // ── Weighted Final Score ──
  const weights = { adRatio: 30, limitRatio: 15, breadthTrend: 25, breadthStrength: 15, indexRegime: 15 };
  const finalScore = Math.round(
    (adScore * weights.adRatio +
      limitScore * weights.limitRatio +
      trendScore * weights.breadthTrend +
      strengthScore * weights.breadthStrength +
      regimeScore * weights.indexRegime) / 100
  );
  const score = Math.max(0, Math.min(100, finalScore));

  // ── Determine Level ──
  let level: SentimentLevel;
  let color: string;
  let bgClass: string;

  if (score <= 15) {
    level = "极度恐慌"; color = "#047857"; bgClass = "bg-emerald-800/15 border-emerald-700/40";
  } else if (score <= 30) {
    level = "恐慌"; color = "#059669"; bgClass = "bg-emerald-700/12 border-emerald-600/30";
  } else if (score <= 42) {
    level = "偏弱"; color = "#4d7c0f"; bgClass = "bg-lime-700/12 border-lime-600/30";
  } else if (score <= 58) {
    level = "中性"; color = "#a16207"; bgClass = "bg-yellow-700/12 border-yellow-600/30";
  } else if (score <= 70) {
    level = "偏强"; color = "#c2410c"; bgClass = "bg-orange-700/12 border-orange-600/30";
  } else if (score <= 85) {
    level = "乐观"; color = "#dc2626"; bgClass = "bg-red-700/12 border-red-600/30";
  } else {
    level = "极度乐观"; color = "#b91c1c"; bgClass = "bg-red-800/15 border-red-700/40";
  }

  return {
    score,
    level,
    color,
    bgClass,
    factors: {
      adRatio: { score: adScore, weight: weights.adRatio, label: "涨跌比率", desc: adDesc },
      limitRatio: { score: limitScore, weight: weights.limitRatio, label: "涨跌停比", desc: limitDesc },
      breadthTrend: { score: trendScore, weight: weights.breadthTrend, label: "情绪趋势", desc: trendDesc },
      breadthStrength: { score: strengthScore, weight: weights.breadthStrength, label: "多空强度", desc: strengthDesc },
      indexRegime: { score: regimeScore, weight: weights.indexRegime, label: "指数状态", desc: regimeDesc },
    },
    trend: trendDirection,
  };
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

  // Gauge arc SVG
  const gaugeR = 50;
  const gaugeCx = 70;
  const gaugeCy = 58;
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

  // Tick marks for gauge
  const tickMarks = [0, 15, 30, 42, 58, 70, 85, 100].map(v => {
    const angle = gaugeStartAngle + (v / 100) * gaugeRange;
    const inner = polarToCart(gaugeCx, gaugeCy, gaugeR - 6, angle);
    const outer = polarToCart(gaugeCx, gaugeCy, gaugeR + 2, angle);
    return { inner, outer, v };
  });

  // Score needle
  const needleTip = polarToCart(gaugeCx, gaugeCy, gaugeR - 10, scoreAngle);
  const needleBase1 = polarToCart(gaugeCx, gaugeCy, 4, scoreAngle - 90);
  const needleBase2 = polarToCart(gaugeCx, gaugeCy, 4, scoreAngle + 90);

  // Trend arrow
  const trendIcon = trend === "up" ? "↑" : trend === "down" ? "↓" : "→";
  const trendColor = trend === "up" ? "#dc2626" : trend === "down" ? "#059669" : "#a16207";

  return (
    <Card className={`border overflow-hidden ${bgClass}`}>
      <CardContent className="p-3 sm:p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">市场情绪指数</span>
          <span className="text-[10px] text-muted-foreground">
            {trendIcon} <span style={{ color: trendColor }}>{trend === "up" ? "情绪回升" : trend === "down" ? "情绪走弱" : "情绪平稳"}</span>
          </span>
        </div>

        <div className="flex items-start gap-3">
          {/* Gauge */}
          <div className="shrink-0">
            <svg width="140" height="90" viewBox="0 0 140 90" className="w-[140px]">
              {/* Background arc segments */}
              {/* 0-15 极度恐慌 (dark green) */}
              <path d={gaugePath(gaugeStartAngle, gaugeStartAngle + gaugeRange * 0.15, gaugeR)}
                fill="none" stroke="#047857" strokeWidth={8} strokeLinecap="round" opacity={0.75} />
              {/* 15-30 恐慌 */}
              <path d={gaugePath(gaugeStartAngle + gaugeRange * 0.15, gaugeStartAngle + gaugeRange * 0.30, gaugeR)}
                fill="none" stroke="#059669" strokeWidth={8} strokeLinecap="round" opacity={0.65} />
              {/* 30-42 偏弱 */}
              <path d={gaugePath(gaugeStartAngle + gaugeRange * 0.30, gaugeStartAngle + gaugeRange * 0.42, gaugeR)}
                fill="none" stroke="#4d7c0f" strokeWidth={8} strokeLinecap="round" opacity={0.65} />
              {/* 42-58 中性 */}
              <path d={gaugePath(gaugeStartAngle + gaugeRange * 0.42, gaugeStartAngle + gaugeRange * 0.58, gaugeR)}
                fill="none" stroke="#a16207" strokeWidth={8} strokeLinecap="round" opacity={0.65} />
              {/* 58-70 偏强 */}
              <path d={gaugePath(gaugeStartAngle + gaugeRange * 0.58, gaugeStartAngle + gaugeRange * 0.70, gaugeR)}
                fill="none" stroke="#c2410c" strokeWidth={8} strokeLinecap="round" opacity={0.65} />
              {/* 70-85 乐观 */}
              <path d={gaugePath(gaugeStartAngle + gaugeRange * 0.70, gaugeStartAngle + gaugeRange * 0.85, gaugeR)}
                fill="none" stroke="#dc2626" strokeWidth={8} strokeLinecap="round" opacity={0.65} />
              {/* 85-100 极度乐观 */}
              <path d={gaugePath(gaugeStartAngle + gaugeRange * 0.85, gaugeEndAngle, gaugeR)}
                fill="none" stroke="#991b1b" strokeWidth={8} strokeLinecap="round" opacity={0.75} />

              {/* Active arc (filled portion up to score) */}
              <path d={gaugePath(gaugeStartAngle, scoreAngle, gaugeR - 1)}
                fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" />

              {/* Needle */}
              <polygon
                points={`${needleTip.x.toFixed(1)},${needleTip.y.toFixed(1)} ${needleBase1.x.toFixed(1)},${needleBase1.y.toFixed(1)} ${needleBase2.x.toFixed(1)},${needleBase2.y.toFixed(1)}`}
                fill={color} opacity={0.9}
              />
              <circle cx={gaugeCx} cy={gaugeCy} r={3} fill={color} />

              {/* Score text */}
              <text x={gaugeCx} y={gaugeCy + 22} textAnchor="middle" fontSize={18} fontWeight={800} fontFamily="monospace" fill={color}>
                {score}
              </text>
              <text x={gaugeCx} y={gaugeCy + 34} textAnchor="middle" fontSize={9} fontWeight={600} fill={color}>
                {level}
              </text>

              {/* Tick labels */}
              <text x={polarToCart(gaugeCx, gaugeCy, gaugeR + 12, gaugeStartAngle).x} y={polarToCart(gaugeCx, gaugeCy, gaugeR + 12, gaugeStartAngle).y} textAnchor="middle" fontSize={7} fill="currentColor" className="text-muted-foreground">0</text>
              <text x={polarToCart(gaugeCx, gaugeCy, gaugeR + 12, gaugeStartAngle + gaugeRange * 0.5).x} y={polarToCart(gaugeCx, gaugeCy, gaugeR + 12, gaugeStartAngle + gaugeRange * 0.5).y} textAnchor="middle" fontSize={7} fill="currentColor" className="text-muted-foreground">50</text>
              <text x={polarToCart(gaugeCx, gaugeCy, gaugeR + 12, gaugeEndAngle).x} y={polarToCart(gaugeCx, gaugeCy, gaugeR + 12, gaugeEndAngle).y} textAnchor="middle" fontSize={7} fill="currentColor" className="text-muted-foreground">100</text>
            </svg>
          </div>

          {/* Factor breakdown */}
          <div className="flex-1 min-w-0 space-y-1.5 pt-0.5">
            {Object.entries(factors).map(([key, f]) => (
              <div key={key} className="group">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] text-muted-foreground w-14 shrink-0">{f.label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${f.score}%`,
                        backgroundColor: f.score >= 65 ? "#dc2626" : f.score >= 50 ? "#c2410c" : f.score >= 35 ? "#a16207" : "#059669",
                      }}
                    />
                  </div>
                  <span className="text-[10px] font-mono font-semibold w-7 text-right tabular-nums"
                    style={{ color: f.score >= 65 ? "#dc2626" : f.score >= 50 ? "#c2410c" : f.score >= 35 ? "#a16207" : "#059669" }}>
                    {f.score}
                  </span>
                </div>
                {/* Hover description */}
                <div className="hidden group-hover:block text-[9px] text-muted-foreground/80 mt-0.5 pl-14 truncate">
                  {f.desc}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sentiment bar */}
        <div className="mt-3">
          <div className="h-2.5 w-full rounded-full overflow-hidden flex relative">
            <div className="h-full bg-emerald-800/80" style={{ width: "15%" }} />
            <div className="h-full bg-emerald-700/70" style={{ width: "15%" }} />
            <div className="h-full bg-lime-700/70" style={{ width: "12%" }} />
            <div className="h-full bg-yellow-700/70" style={{ width: "16%" }} />
            <div className="h-full bg-orange-700/70" style={{ width: "12%" }} />
            <div className="h-full bg-red-700/70" style={{ width: "15%" }} />
            <div className="h-full bg-red-800/80" style={{ width: "15%" }} />
            {/* Score indicator */}
            <div className="absolute top-0 h-full transition-all duration-700" style={{ left: `${score}%`, transform: "translateX(-50%)" }}>
              <div className="w-0.5 h-full bg-white rounded-full shadow-sm" />
            </div>
          </div>
          <div className="flex justify-between mt-0.5">
            <span className="text-[8px] text-emerald-700">恐慌</span>
            <span className="text-[8px] text-yellow-700">中性</span>
            <span className="text-[8px] text-red-700">乐观</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
