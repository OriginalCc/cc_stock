"use client";

import React, { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Gauge,
  TrendingUp,
  TrendingDown,
  Activity,
  BarChart3,
  Shield,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────

interface TSuitabilityScoreProps {
  symbol: string;
  quote: {
    price: number;
    prevClose: number;
    open: number;
    high: number;
    low: number;
    volume: number;
    turnover?: number;
    marketCap?: number;
    peRatio?: number;
  } | null;
  liveTimeline: Array<{
    time: string;
    price: number;
    avgPrice: number;
    volume: number;
    changePercent: number;
  }>;
  sectorRegime: {
    regime: string;
    confidence: number;
    volatility?: number;
    description?: string;
  } | null;
  szIndexRegime: {
    regime: string;
    confidence: number;
    volatility?: number;
    description?: string;
  } | null;
}

// ── Score rating helpers ──────────────────────────────

function getScoreRating(score: number): {
  label: string;
  emoji: string;
  color: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
} {
  if (score >= 80) {
    return {
      label: "高度适宜",
      emoji: "🟢",
      color: "#22c55e",
      bgColor: "bg-green-500/5",
      borderColor: "border-green-500/25",
      textColor: "text-green-600 dark:text-green-400",
    };
  }
  if (score >= 60) {
    return {
      label: "基本适宜",
      emoji: "🟡",
      color: "#eab308",
      bgColor: "bg-yellow-500/5",
      borderColor: "border-yellow-500/25",
      textColor: "text-yellow-600 dark:text-yellow-400",
    };
  }
  if (score >= 40) {
    return {
      label: "勉强适宜",
      emoji: "🟠",
      color: "#f97316",
      bgColor: "bg-orange-500/5",
      borderColor: "border-orange-500/25",
      textColor: "text-orange-600 dark:text-orange-400",
    };
  }
  return {
    label: "不宜做T",
    emoji: "🔴",
    color: "#ef4444",
    bgColor: "bg-red-500/5",
    borderColor: "border-red-500/25",
    textColor: "text-red-600 dark:text-red-400",
  };
}

function getSuggestion(score: number): string {
  if (score >= 80) return "适合做T，抓住机会";
  if (score >= 60) return "可以做T，注意控制仓位";
  if (score >= 40) return "做T空间有限，谨慎操作";
  return "振幅不够/量能不足，建议观望";
}

// ── Scoring helpers (individual factors) ─────────────

function calcAmplitudeScore(
  quote: NonNullable<TSuitabilityScoreProps["quote"]>
): { score: number; value: number; label: string } {
  if (!quote.prevClose || quote.prevClose <= 0)
    return { score: 0, value: 0, label: "无数据" };
  const amplitude = ((quote.high - quote.low) / quote.prevClose) * 100;
  if (amplitude >= 4)
    return { score: 25, value: amplitude, label: "优质" };
  if (amplitude >= 3)
    return { score: 18, value: amplitude, label: "合格" };
  if (amplitude >= 2)
    return { score: 10, value: amplitude, label: "偏小" };
  return { score: 0, value: amplitude, label: "不宜做T" };
}

function calcVolatilityScore(
  liveTimeline: TSuitabilityScoreProps["liveTimeline"]
): { score: number; value: number; label: string } {
  if (liveTimeline.length < 5)
    return { score: 0, value: 0, label: "数据不足" };
  const changes = liveTimeline.map((d) => d.changePercent);
  const mean = changes.reduce((s, v) => s + v, 0) / changes.length;
  const variance =
    changes.reduce((s, v) => s + (v - mean) ** 2, 0) / changes.length;
  const std = Math.sqrt(variance);
  if (std >= 0.8) return { score: 20, value: std, label: "活跃" };
  if (std >= 0.5) return { score: 14, value: std, label: "一般" };
  if (std >= 0.3) return { score: 8, value: std, label: "偏低" };
  return { score: 3, value: std, label: "死水" };
}

function calcVolumeScore(
  quote: NonNullable<TSuitabilityScoreProps["quote"]>,
  liveTimeline: TSuitabilityScoreProps["liveTimeline"]
): { score: number; value: number; label: string } {
  if (liveTimeline.length < 5 || !quote.price || quote.price <= 0)
    return { score: 0, value: 0, label: "数据不足" };
  // Estimate daily turnover from timeline data
  const totalVolume = liveTimeline.reduce((s, d) => s + d.volume, 0);
  const avgPrice =
    liveTimeline.reduce((s, d) => s + d.price, 0) / liveTimeline.length;
  const estimatedTurnover = totalVolume * avgPrice * 100; // volume in 手, 1手=100股
  const turnoverYi = estimatedTurnover / 1e8; // 转换为亿
  const turnoverWan = estimatedTurnover / 1e4; // 转换为万

  if (turnoverWan >= 5000) return { score: 20, value: turnoverWan, label: "充足" };
  if (turnoverWan >= 3000) return { score: 14, value: turnoverWan, label: "一般" };
  if (turnoverWan >= 1000) return { score: 8, value: turnoverWan, label: "偏少" };
  return { score: 3, value: turnoverWan, label: "不足" };
}

function calcVWAPDeviationScore(
  liveTimeline: TSuitabilityScoreProps["liveTimeline"]
): { score: number; value: number; label: string } {
  if (liveTimeline.length < 5)
    return { score: 0, value: 0, label: "数据不足" };
  const last = liveTimeline[liveTimeline.length - 1];
  if (!last || !last.avgPrice || last.avgPrice <= 0)
    return { score: 0, value: 0, label: "无均价" };
  const deviation = Math.abs(
    ((last.price - last.avgPrice) / last.avgPrice) * 100
  );
  if (deviation >= 2) return { score: 15, value: deviation, label: "空间大" };
  if (deviation >= 1) return { score: 10, value: deviation, label: "有空间" };
  if (deviation >= 0.5) return { score: 6, value: deviation, label: "偏小" };
  return { score: 2, value: deviation, label: "太小" };
}

function calcMarketEnvScore(
  szIndexRegime: TSuitabilityScoreProps["szIndexRegime"]
): { score: number; value: string; label: string } {
  if (!szIndexRegime) return { score: 5, value: "无数据", label: "未知" };
  const regime = szIndexRegime.regime;
  if (regime === "震荡市") return { score: 10, value: regime, label: "最适合" };
  if (regime === "上升通道") return { score: 6, value: regime, label: "尚可" };
  if (regime === "下跌趋势") return { score: 3, value: regime, label: "不利" };
  if (regime === "横盘末期") return { score: 4, value: regime, label: "谨慎" };
  return { score: 5, value: regime, label: "一般" };
}

function calcSectorAlignmentScore(
  sectorRegime: TSuitabilityScoreProps["sectorRegime"],
  quote: NonNullable<TSuitabilityScoreProps["quote"]>
): { score: number; value: string; label: string } {
  if (!sectorRegime) return { score: 5, value: "无数据", label: "未知" };
  const stockUp = quote.price >= quote.prevClose;
  const sectorUp = sectorRegime.regime === "上升通道";
  const sectorDown = sectorRegime.regime === "下跌趋势";

  if ((stockUp && sectorUp) || (!stockUp && sectorDown))
    return { score: 10, value: "方向一致", label: "共振" };
  if (sectorRegime.regime === "震荡市")
    return { score: 7, value: "板块震荡", label: "中性" };
  if ((stockUp && sectorDown) || (!stockUp && sectorUp))
    return { score: 3, value: "方向相反", label: "背离" };
  return { score: 5, value: sectorRegime.regime, label: "一般" };
}

// ── Mini progress bar component ─────────────────────

function MiniProgressBar({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: string;
}) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="h-1.5 w-full bg-muted/30 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

// ── Format helper ────────────────────────────────────

function formatWan(v: number): string {
  if (v >= 10000) return `${(v / 10000).toFixed(1)}亿`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}千万`;
  return `${v.toFixed(0)}万`;
}

// ── Main Component ───────────────────────────────────

export const TSuitabilityScore = React.memo(function TSuitabilityScore({
  symbol,
  quote,
  liveTimeline,
  sectorRegime,
  szIndexRegime,
}: TSuitabilityScoreProps) {
  // Calculate all scores
  const scores = useMemo(() => {
    if (!quote || liveTimeline.length <= 5) return null;

    const amplitude = calcAmplitudeScore(quote);
    const volatility = calcVolatilityScore(liveTimeline);
    const volume = calcVolumeScore(quote, liveTimeline);
    const vwapDeviation = calcVWAPDeviationScore(liveTimeline);
    const marketEnv = calcMarketEnvScore(szIndexRegime);
    const sectorAlignment = calcSectorAlignmentScore(sectorRegime, quote);

    const total =
      amplitude.score +
      volatility.score +
      volume.score +
      vwapDeviation.score +
      marketEnv.score +
      sectorAlignment.score;

    return {
      amplitude,
      volatility,
      volume,
      vwapDeviation,
      marketEnv,
      sectorAlignment,
      total,
    };
  }, [quote, liveTimeline, sectorRegime, szIndexRegime]);

  // No quote or not enough timeline data
  if (!quote) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Gauge className="h-5 w-5 opacity-40" />
            <span className="text-sm">选择股票查看做T适宜度</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!scores) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Gauge className="h-5 w-5 opacity-40" />
            <span className="text-sm">等待分时数据加载...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const rating = getScoreRating(scores.total);
  const suggestion = getSuggestion(scores.total);

  // SVG circle params (matching T-Index style)
  const circleSize = 72;
  const strokeWidth = 6;
  const radius = 30;
  const circumference = Math.PI * radius;
  const progressArc = (scores.total / 100) * circumference;

  // Factor definitions for the grid
  const factors = [
    {
      icon: Activity,
      label: "日内振幅",
      score: scores.amplitude.score,
      max: 25,
      detail:
        scores.amplitude.value > 0
          ? `${scores.amplitude.value.toFixed(2)}%`
          : scores.amplitude.label,
      tag: scores.amplitude.label,
    },
    {
      icon: TrendingUp,
      label: "波动率",
      score: scores.volatility.score,
      max: 20,
      detail:
        scores.volatility.value > 0
          ? `${scores.volatility.value.toFixed(2)}%`
          : scores.volatility.label,
      tag: scores.volatility.label,
    },
    {
      icon: BarChart3,
      label: "量能充足",
      score: scores.volume.score,
      max: 20,
      detail:
        scores.volume.value > 0
          ? formatWan(scores.volume.value)
          : scores.volume.label,
      tag: scores.volume.label,
    },
    {
      icon: Gauge,
      label: "均价偏离",
      score: scores.vwapDeviation.score,
      max: 15,
      detail:
        scores.vwapDeviation.value > 0
          ? `${scores.vwapDeviation.value.toFixed(2)}%`
          : scores.vwapDeviation.label,
      tag: scores.vwapDeviation.label,
    },
    {
      icon: Shield,
      label: "大盘环境",
      score: scores.marketEnv.score,
      max: 10,
      detail: scores.marketEnv.value,
      tag: scores.marketEnv.label,
    },
    {
      icon: TrendingDown,
      label: "板块共振",
      score: scores.sectorAlignment.score,
      max: 10,
      detail: scores.sectorAlignment.value,
      tag: scores.sectorAlignment.label,
    },
  ];

  return (
    <Card className={`overflow-hidden ${rating.bgColor} ${rating.borderColor}`}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start gap-4">
          {/* Left: Score Circle */}
          <div className="relative shrink-0">
            <svg
              width={circleSize}
              height={circleSize}
              viewBox={`0 0 ${circleSize} ${circleSize}`}
            >
              <circle
                cx={circleSize / 2}
                cy={circleSize / 2}
                r={radius}
                fill="none"
                stroke="currentColor"
                className="text-muted/30"
                strokeWidth={strokeWidth}
                strokeDasharray={`${circumference}`}
                strokeDashoffset="0"
                transform={`rotate(-90 ${circleSize / 2} ${circleSize / 2})`}
                strokeLinecap="round"
              />
              <circle
                cx={circleSize / 2}
                cy={circleSize / 2}
                r={radius}
                fill="none"
                stroke={rating.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${progressArc} ${circumference}`}
                strokeDashoffset="0"
                transform={`rotate(-90 ${circleSize / 2} ${circleSize / 2})`}
                strokeLinecap="round"
                style={{
                  transition:
                    "stroke-dasharray 0.5s ease, stroke 0.5s ease",
                }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className="text-xl font-bold tabular-nums leading-none"
                style={{ color: rating.color }}
              >
                {scores.total}
              </span>
              <span className="text-[8px] text-muted-foreground mt-0.5">
                /100
              </span>
            </div>
          </div>

          {/* Right: Breakdown Grid */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-muted-foreground">
                做T适宜度
              </span>
              <Badge
                variant="outline"
                className={`text-[10px] h-5 px-1.5 ${rating.textColor}`}
              >
                {rating.emoji} {rating.label}
              </Badge>
            </div>

            <div className="grid grid-cols-3 gap-x-3 gap-y-2">
              {factors.map((f) => {
                const Icon = f.icon;
                const pct = (f.score / f.max) * 100;
                const barColor =
                  pct >= 70
                    ? rating.color
                    : pct >= 40
                    ? "#eab308"
                    : "#9ca3af";
                return (
                  <div key={f.label} className="min-w-0">
                    <div className="flex items-center gap-1 mb-0.5">
                      <Icon
                        className="h-3 w-3 shrink-0 text-muted-foreground"
                        style={{ color: barColor }}
                      />
                      <span className="text-[10px] text-muted-foreground truncate">
                        {f.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span
                        className="text-xs font-bold tabular-nums leading-none"
                        style={{ color: barColor }}
                      >
                        {f.score}
                      </span>
                      <span className="text-[9px] text-muted-foreground leading-none">
                        /{f.max}
                      </span>
                      <span className="text-[9px] text-muted-foreground leading-none ml-auto truncate">
                        {f.detail}
                      </span>
                    </div>
                    <MiniProgressBar
                      value={f.score}
                      max={f.max}
                      color={barColor}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom: Suggestion */}
        <div
          className={`mt-3 pt-2 border-t ${rating.borderColor} text-center`}
        >
          <span className={`text-xs font-medium ${rating.textColor}`}>
            {rating.emoji} {suggestion}
          </span>
        </div>
      </CardContent>
    </Card>
  );
});
