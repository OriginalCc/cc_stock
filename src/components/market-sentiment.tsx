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
  const adRatio = totalUp / (totalUp + totalDown || 1);
  const adScore = Math.round(adRatio * 100);
  const adDesc = totalUp > totalDown
    ? `上涨${totalUp}家 > 下跌${totalDown}家，多方占优`
    : totalUp < totalDown
    ? `下跌${totalDown}家 > 上涨${totalUp}家，空方占优`
    : "涨跌持平";

  // ── Factor 2: Limit Up/Down Ratio (涨停跌停比) — weight 15 ──
  let limitScore = 50;
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
    const half = Math.floor(diffs.length / 2) || 1;
    const firstHalf = diffs.slice(0, half);
    const secondHalf = diffs.slice(half);
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    const improvement = secondAvg - firstAvg;
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
  const strengthRatio = diff / total;
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
    let regimeTotal = 0;
    const regimeLabels: string[] = [];
    for (const r of regimes) {
      let rScore = 50;
      if (r.regime === "上升通道") {
        rScore = 75 + r.momentum * 15;
        regimeLabels.push("上升");
      } else if (r.regime === "下跌趋势") {
        rScore = 25 + r.momentum * 15;
        regimeLabels.push("下跌");
      } else if (r.regime === "横盘末期") {
        rScore = 55;
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
    level = "极度恐慌"; color = "#16a34a"; bgClass = "bg-green-600/15 border-green-600/40";
  } else if (score <= 30) {
    level = "恐慌"; color = "#22c55e"; bgClass = "bg-green-500/12 border-green-500/30";
  } else if (score <= 42) {
    level = "偏弱"; color = "#84cc16"; bgClass = "bg-lime-500/12 border-lime-500/30";
  } else if (score <= 58) {
    level = "中性"; color = "#eab308"; bgClass = "bg-yellow-500/12 border-yellow-500/30";
  } else if (score <= 70) {
    level = "偏强"; color = "#f97316"; bgClass = "bg-orange-500/12 border-orange-500/30";
  } else if (score <= 85) {
    level = "乐观"; color = "#ef4444"; bgClass = "bg-red-500/12 border-red-500/30";
  } else {
    level = "极度乐观"; color = "#dc2626"; bgClass = "bg-red-600/15 border-red-600/40";
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

function getFactorColor(score: number): string {
  if (score >= 70) return "#dc2626";
  if (score >= 58) return "#ef4444";
  if (score >= 50) return "#f97316";
  if (score >= 42) return "#eab308";
  if (score >= 30) return "#84cc16";
  return "#22c55e";
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
  const gaugeR = 56;
  const gaugeCx = 80;
  const gaugeCy = 62;
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

  // Score needle
  const needleTip = polarToCart(gaugeCx, gaugeCy, gaugeR - 12, scoreAngle);
  const needleBase1 = polarToCart(gaugeCx, gaugeCy, 5, scoreAngle - 90);
  const needleBase2 = polarToCart(gaugeCx, gaugeCy, 5, scoreAngle + 90);

  // Trend arrow
  const trendIcon = trend === "up" ? "▲" : trend === "down" ? "▼" : "●";
  const trendColor = trend === "up" ? "#ef4444" : trend === "down" ? "#22c55e" : "#eab308";
  const trendLabel = trend === "up" ? "情绪回升" : trend === "down" ? "情绪走弱" : "情绪平稳";

  return (
    <Card className={`border overflow-hidden ${bgClass}`}>
      <CardContent className="px-3 py-2 sm:px-4 sm:py-2">
        {/* Header */}
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-bold text-foreground/90">市场情绪指数</span>
          <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${trendColor}20`, color: trendColor }}>
            {trendIcon} {trendLabel}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Gauge */}
          <div className="shrink-0">
            <svg width="160" height="90" viewBox="0 0 160 90" className="w-[140px]">
              <defs>
                <filter id="gaugeGlow" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feFlood floodColor={color} floodOpacity="0.35" />
                  <feComposite in2="blur" operator="in" />
                  <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <filter id="needleGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="1.5" result="blur" />
                  <feFlood floodColor={color} floodOpacity="0.5" />
                  <feComposite in2="blur" operator="in" />
                  <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              {/* Background arc: 绿→黄→红 渐变 segments */}
              <path d={gaugePath(gaugeStartAngle, gaugeStartAngle + gaugeRange * 0.15, gaugeR)}
                fill="none" stroke="#16a34a" strokeWidth={10} strokeLinecap="round" opacity={0.6} />
              <path d={gaugePath(gaugeStartAngle + gaugeRange * 0.15, gaugeStartAngle + gaugeRange * 0.30, gaugeR)}
                fill="none" stroke="#22c55e" strokeWidth={10} strokeLinecap="round" opacity={0.55} />
              <path d={gaugePath(gaugeStartAngle + gaugeRange * 0.30, gaugeStartAngle + gaugeRange * 0.42, gaugeR)}
                fill="none" stroke="#84cc16" strokeWidth={10} strokeLinecap="round" opacity={0.55} />
              <path d={gaugePath(gaugeStartAngle + gaugeRange * 0.42, gaugeStartAngle + gaugeRange * 0.58, gaugeR)}
                fill="none" stroke="#eab308" strokeWidth={10} strokeLinecap="round" opacity={0.55} />
              <path d={gaugePath(gaugeStartAngle + gaugeRange * 0.58, gaugeStartAngle + gaugeRange * 0.70, gaugeR)}
                fill="none" stroke="#f97316" strokeWidth={10} strokeLinecap="round" opacity={0.55} />
              <path d={gaugePath(gaugeStartAngle + gaugeRange * 0.70, gaugeStartAngle + gaugeRange * 0.85, gaugeR)}
                fill="none" stroke="#ef4444" strokeWidth={10} strokeLinecap="round" opacity={0.55} />
              <path d={gaugePath(gaugeStartAngle + gaugeRange * 0.85, gaugeEndAngle, gaugeR)}
                fill="none" stroke="#dc2626" strokeWidth={10} strokeLinecap="round" opacity={0.6} />

              {/* Active arc (filled portion up to score) — with glow */}
              <path d={gaugePath(gaugeStartAngle, scoreAngle, gaugeR - 1)}
                fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" filter="url(#gaugeGlow)" />

              {/* Needle — with glow */}
              <polygon
                points={`${needleTip.x.toFixed(1)},${needleTip.y.toFixed(1)} ${needleBase1.x.toFixed(1)},${needleBase1.y.toFixed(1)} ${needleBase2.x.toFixed(1)},${needleBase2.y.toFixed(1)}`}
                fill={color} filter="url(#needleGlow)"
              />
              <circle cx={gaugeCx} cy={gaugeCy} r={4} fill={color} />
              <circle cx={gaugeCx} cy={gaugeCy} r={2} fill="#fff" opacity={0.5} />

              {/* Score text — big & bold */}
              <text x={gaugeCx} y={gaugeCy + 24} textAnchor="middle" fontSize={24} fontWeight={900} fontFamily="monospace" fill={color}>
                {score}
              </text>
              {/* Level label */}
              <text x={gaugeCx} y={gaugeCy + 38} textAnchor="middle" fontSize={11} fontWeight={700} fill={color}>
                {level}
              </text>

              {/* Tick labels */}
              <text x={polarToCart(gaugeCx, gaugeCy, gaugeR + 14, gaugeStartAngle).x}
                y={polarToCart(gaugeCx, gaugeCy, gaugeR + 14, gaugeStartAngle).y + 3}
                textAnchor="middle" fontSize={8} fontWeight={600} fill="currentColor" className="text-muted-foreground">0</text>
              <text x={polarToCart(gaugeCx, gaugeCy, gaugeR + 14, gaugeStartAngle + gaugeRange * 0.5).x}
                y={polarToCart(gaugeCx, gaugeCy, gaugeR + 14, gaugeStartAngle + gaugeRange * 0.5).y + 3}
                textAnchor="middle" fontSize={8} fontWeight={600} fill="currentColor" className="text-muted-foreground">50</text>
              <text x={polarToCart(gaugeCx, gaugeCy, gaugeR + 14, gaugeEndAngle).x}
                y={polarToCart(gaugeCx, gaugeCy, gaugeR + 14, gaugeEndAngle).y + 3}
                textAnchor="middle" fontSize={8} fontWeight={600} fill="currentColor" className="text-muted-foreground">100</text>
            </svg>
          </div>

          {/* Factor breakdown */}
          <div className="flex-1 min-w-0 space-y-1.5">
            {Object.entries(factors).map(([key, f]) => {
              const fc = getFactorColor(f.score);
              return (
                <div key={key} className="group">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold w-16 shrink-0" style={{ color: fc }}>{f.label}</span>
                    <div className="flex-1 h-2.5 rounded-full bg-muted/30 overflow-hidden relative">
                      {/* Background track segments for context */}
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${f.score}%`, backgroundColor: fc, opacity: 0.85 }}
                      />
                    </div>
                    <span className="text-xs font-mono font-bold w-8 text-right tabular-nums" style={{ color: fc }}>
                      {f.score}
                    </span>
                  </div>
                  {/* Hover description */}
                  <div className="hidden group-hover:block text-[10px] text-muted-foreground/80 mt-0.5 pl-16 truncate">
                    {f.desc}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sentiment bar — bigger & bolder */}
        <div className="mt-2">
          <div className="h-3 w-full rounded-full overflow-hidden flex relative shadow-inner">
            <div className="h-full bg-green-600/80" style={{ width: "15%" }} />
            <div className="h-full bg-green-500/70" style={{ width: "15%" }} />
            <div className="h-full bg-lime-500/70" style={{ width: "12%" }} />
            <div className="h-full bg-yellow-500/70" style={{ width: "16%" }} />
            <div className="h-full bg-orange-500/70" style={{ width: "12%" }} />
            <div className="h-full bg-red-500/70" style={{ width: "15%" }} />
            <div className="h-full bg-red-600/80" style={{ width: "15%" }} />
            {/* Score indicator — prominent triangle marker */}
            <div className="absolute top-0 h-full transition-all duration-700" style={{ left: `${score}%`, transform: "translateX(-50%)" }}>
              <div className="w-1 h-full bg-white rounded-full shadow-[0_0_6px_2px_rgba(255,255,255,0.6)]" />
            </div>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-green-600 font-bold">恐慌</span>
            <span className="text-[10px] text-yellow-600 font-bold">中性</span>
            <span className="text-[10px] text-red-600 font-bold">乐观</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
