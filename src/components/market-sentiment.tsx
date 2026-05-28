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
      limitRatio: { score: limitScore, weight: weights.limitRatio, label: "涨跌停比", desc: limitDesc },
      breadthTrend: { score: trendScore, weight: weights.breadthTrend, label: "情绪趋势", desc: trendDesc },
      breadthStrength: { score: strengthScore, weight: weights.breadthStrength, label: "多空强度", desc: strengthDesc },
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
            <svg width="180" height="100" viewBox="0 0 180 100" className="w-[160px]">
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
              <text x={gaugeCx} y={gaugeCy + 24} textAnchor="middle" fontSize={30} fontWeight={900} fontFamily="monospace" fill={color} filter="url(#scoreGlow)">
                {score}
              </text>
              {/* Level label — pill background */}
              <rect x={gaugeCx - 34} y={gaugeCy + 30} width={68} height={20} rx={6} fill={color} opacity={0.22} />
              <rect x={gaugeCx - 34} y={gaugeCy + 30} width={68} height={20} rx={6} fill="none" stroke={color} strokeWidth={1} opacity={0.3} />
              <text x={gaugeCx} y={gaugeCy + 44} textAnchor="middle" fontSize={13} fontWeight={800} fill={color}>
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

          {/* Factor breakdown — enhanced bars */}
          <div className="flex-1 min-w-0 space-y-2">
            {Object.entries(factors).map(([key, f]) => {
              const fc = getFactorColor(f.score);
              const scoreLevel = f.score >= 70 ? "强" : f.score >= 58 ? "偏强" : f.score >= 42 ? "中性" : f.score >= 30 ? "偏弱" : "弱";
              return (
                <div key={key} className="group">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-extrabold w-14 shrink-0" style={{ color: fc }}>{f.label}</span>
                    <div className="flex-1 h-4 rounded-full overflow-hidden relative" style={{ backgroundColor: getFactorBg(f.score), boxShadow: `inset 0 1px 3px ${fc}20` }}>
                      {/* Background scale marks */}
                      <div className="absolute inset-0 flex">
                        <div className="w-1/2 border-r border-white/5" />
                      </div>
                      <div
                        className="h-full rounded-full transition-all duration-700 relative"
                        style={{ width: `${f.score}%`, background: `linear-gradient(90deg, ${fc}cc, ${fc})`, boxShadow: `0 0 10px ${fc}40, inset 0 1px 0 rgba(255,255,255,0.25)` }}
                      >
                        {/* Shine highlight */}
                        <div className="absolute top-0 left-0 right-0 h-1/2 rounded-t-full" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.25) 0%, transparent 100%)" }} />
                      </div>
                    </div>
                    <span className="text-[11px] font-mono font-extrabold w-6 text-right tabular-nums" style={{ color: fc }}>
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
