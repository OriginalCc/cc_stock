"use client";

import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Activity,
  BarChart3,
  Zap,
  Gauge,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────

interface RiskAlertPanelProps {
  symbol: string;
  quote: {
    price: number;
    prevClose: number;
    open: number;
    high: number;
    low: number;
    volume: number;
    changePercent: number;
    turnover?: number;
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
    description?: string;
  } | null;
  szIndexRegime: {
    regime: string;
    confidence: number;
    description?: string;
  } | null;
  signalCounts: {
    buyCount: number;
    strongBuys: number;
    sellCount: number;
    strongSells: number;
    totalSigs: number;
  };
}

// ── Risk Level Type ────────────────────────────────────

type RiskLevel = "danger" | "warning" | "normal" | "safe" | "info" | "none";

interface RiskIndicator {
  id: string;
  title: string;
  icon: React.ReactNode;
  value: string;
  level: RiskLevel;
  levelLabel: string;
  suggestion: string;
}

// ── Color Mapping ──────────────────────────────────────

const LEVEL_COLORS: Record<RiskLevel, { icon: string; badge: string; badgeText: string }> = {
  danger: {
    icon: "text-red-500",
    badge: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/25",
    badgeText: "text-red-500",
  },
  warning: {
    icon: "text-amber-500",
    badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25",
    badgeText: "text-amber-500",
  },
  normal: {
    icon: "text-emerald-500",
    badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25",
    badgeText: "text-emerald-500",
  },
  safe: {
    icon: "text-blue-500",
    badge: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/25",
    badgeText: "text-blue-500",
  },
  info: {
    icon: "text-purple-500",
    badge: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/25",
    badgeText: "text-purple-500",
  },
  none: {
    icon: "text-muted-foreground",
    badge: "bg-muted text-muted-foreground border-border",
    badgeText: "text-muted-foreground",
  },
};

// ── Indicator Calculations ─────────────────────────────

function calcLimitDistance(
  quote: NonNullable<RiskAlertPanelProps["quote"]>
): RiskIndicator {
  const { price, prevClose } = quote;
  if (prevClose <= 0 || price <= 0) {
    return {
      id: "limit",
      title: "涨跌停距离",
      icon: <Gauge className="h-4 w-4" />,
      value: "--",
      level: "none",
      levelLabel: "无数据",
      suggestion: "无法计算",
    };
  }

  const limitUp = prevClose * 1.1;
  const limitDown = prevClose * 0.9;
  const distUp = ((limitUp - price) / price) * 100;
  const distDown = ((price - limitDown) / price) * 100;

  // Determine level based on the closer side
  const minDist = Math.min(distUp, distDown);
  let level: RiskLevel;
  let levelLabel: string;
  let suggestion: string;

  if (minDist <= 1) {
    level = "danger";
    levelLabel = "极度危险";
    suggestion = minDist === distUp ? "接近涨停，注意回落风险" : "接近跌停，注意止损";
  } else if (minDist <= 2) {
    level = "warning";
    levelLabel = "⚠️ 靠近极限";
    suggestion = minDist === distUp ? "临近涨停，谨慎追高" : "临近跌停，严控仓位";
  } else {
    level = "normal";
    levelLabel = "安全区间";
    suggestion = "距涨跌停较远";
  }

  return {
    id: "limit",
    title: "涨跌停距离",
    icon: <Gauge className="h-4 w-4" />,
    value: `↑${distUp.toFixed(1)}% ↓${distDown.toFixed(1)}%`,
    level,
    levelLabel,
    suggestion,
  };
}

function calcVWAPDeviation(
  quote: NonNullable<RiskAlertPanelProps["quote"]>,
  liveTimeline: RiskAlertPanelProps["liveTimeline"]
): RiskIndicator {
  if (liveTimeline.length === 0) {
    return {
      id: "vwap",
      title: "均价偏离",
      icon: <Activity className="h-4 w-4" />,
      value: "--",
      level: "none",
      levelLabel: "无数据",
      suggestion: "等待分时数据",
    };
  }

  const lastTL = liveTimeline[liveTimeline.length - 1];
  const avgPrice = lastTL.avgPrice;
  if (avgPrice <= 0) {
    return {
      id: "vwap",
      title: "均价偏离",
      icon: <Activity className="h-4 w-4" />,
      value: "--",
      level: "none",
      levelLabel: "无数据",
      suggestion: "均价数据缺失",
    };
  }

  const deviation = ((lastTL.price - avgPrice) / avgPrice) * 100;
  const absDev = Math.abs(deviation);
  const direction = deviation >= 0 ? "+" : "";
  let level: RiskLevel;
  let levelLabel: string;
  let suggestion: string;

  if (absDev >= 3) {
    level = "danger";
    levelLabel = "🔴 严重偏离";
    suggestion = deviation > 0 ? "严重高于均价，止损区域" : "严重低于均价，止损区域";
  } else if (absDev >= 2) {
    level = "warning";
    levelLabel = "🟡 偏离较大";
    suggestion = deviation > 0 ? "高于均价较多，考虑高抛" : "低于均价较多，考虑低吸";
  } else if (absDev >= 1) {
    level = "normal";
    levelLabel = "🟢 轻度偏离";
    suggestion = "偏离正常范围";
  } else {
    level = "safe";
    levelLabel = "⚪ 贴近均价";
    suggestion = "贴近均价，暂无T机会";
  }

  return {
    id: "vwap",
    title: "均价偏离",
    icon: <Activity className="h-4 w-4" />,
    value: `${direction}${deviation.toFixed(2)}%`,
    level,
    levelLabel,
    suggestion,
  };
}

function calcVolumeAnomaly(
  liveTimeline: RiskAlertPanelProps["liveTimeline"]
): RiskIndicator {
  if (liveTimeline.length < 6) {
    return {
      id: "volume",
      title: "量能异常",
      icon: <BarChart3 className="h-4 w-4" />,
      value: "--",
      level: "none",
      levelLabel: "无数据",
      suggestion: "数据不足",
    };
  }

  // Use recent 30 data points for average (or all available)
  const windowSize = Math.min(30, liveTimeline.length - 1);
  const recentVolumes = liveTimeline.slice(-windowSize - 1, -1);
  const avgVolume = recentVolumes.reduce((s, d) => s + d.volume, 0) / recentVolumes.length;
  const latestVolume = liveTimeline[liveTimeline.length - 1].volume;

  if (avgVolume <= 0) {
    return {
      id: "volume",
      title: "量能异常",
      icon: <BarChart3 className="h-4 w-4" />,
      value: "--",
      level: "none",
      levelLabel: "无数据",
      suggestion: "量能数据异常",
    };
  }

  const ratio = latestVolume / avgVolume;
  let level: RiskLevel;
  let levelLabel: string;
  let suggestion: string;

  if (ratio > 5) {
    level = "danger";
    levelLabel = "🔴 脉冲放量";
    suggestion = "异常脉冲，警惕主力出货";
  } else if (ratio > 3) {
    level = "warning";
    levelLabel = "🟡 显著放量";
    suggestion = "放量明显，关注方向选择";
  } else if (ratio > 2) {
    level = "info";
    levelLabel = "🟠 温和放量";
    suggestion = "温和放量，留意趋势加强";
  } else if (ratio < 0.3) {
    level = "safe";
    levelLabel = "🔵 极度缩量";
    suggestion = "极度缩量，变盘在即";
  } else {
    level = "normal";
    levelLabel = "⚪ 正常量能";
    suggestion = "量能正常";
  }

  return {
    id: "volume",
    title: "量能异常",
    icon: <BarChart3 className="h-4 w-4" />,
    value: `${ratio.toFixed(1)}x`,
    level,
    levelLabel,
    suggestion,
  };
}

function calcMarketRisk(
  szIndexRegime: RiskAlertPanelProps["szIndexRegime"]
): RiskIndicator {
  if (!szIndexRegime) {
    return {
      id: "market",
      title: "大盘风险",
      icon: <Shield className="h-4 w-4" />,
      value: "--",
      level: "none",
      levelLabel: "⚪ 暂无数据",
      suggestion: "大盘数据缺失",
    };
  }

  const { regime } = szIndexRegime;
  let level: RiskLevel;
  let levelLabel: string;
  let suggestion: string;

  if (regime === "下跌趋势") {
    level = "danger";
    levelLabel = "🔴 下跌趋势";
    suggestion = "大盘下跌，全面减仓";
  } else if (regime === "横盘末期") {
    level = "warning";
    levelLabel = "🟡 方向不明";
    suggestion = "大盘方向不明，控制仓位";
  } else if (regime === "上升通道") {
    level = "normal";
    levelLabel = "🟢 上升趋势";
    suggestion = "大盘上涨，可积极参与";
  } else if (regime === "震荡市") {
    level = "safe";
    levelLabel = "🔵 震荡市";
    suggestion = "大盘震荡，适合做T";
  } else {
    level = "none";
    levelLabel = "⚪ 未知";
    suggestion = "无法判断大盘状态";
  }

  return {
    id: "market",
    title: "大盘风险",
    icon: <Shield className="h-4 w-4" />,
    value: regime,
    level,
    levelLabel,
    suggestion,
  };
}

function calcSignalDensity(
  signalCounts: RiskAlertPanelProps["signalCounts"]
): RiskIndicator {
  const { totalSigs, buyCount, sellCount } = signalCounts;
  let level: RiskLevel;
  let levelLabel: string;

  if (totalSigs > 20) {
    level = "warning";
    levelLabel = "🟡 信号过多";
  } else if (totalSigs >= 10) {
    level = "normal";
    levelLabel = "🟢 信号适中";
  } else if (totalSigs >= 5) {
    level = "safe";
    levelLabel = "🔵 信号偏少";
  } else {
    level = "none";
    levelLabel = "⚪ 信号稀少";
  }

  const buyRatio = totalSigs > 0 ? ((buyCount / totalSigs) * 100).toFixed(0) : "0";
  const sellRatio = totalSigs > 0 ? ((sellCount / totalSigs) * 100).toFixed(0) : "0";

  let suggestion: string;
  if (totalSigs === 0) {
    suggestion = "无信号产生";
  } else if (buyCount > sellCount * 2) {
    suggestion = "买入信号占优";
  } else if (sellCount > buyCount * 2) {
    suggestion = "卖出信号占优";
  } else {
    suggestion = `买${buyRatio}%/卖${sellRatio}%`;
  }

  return {
    id: "signal",
    title: "信号密度",
    icon: <Zap className="h-4 w-4" />,
    value: `${totalSigs}个`,
    level,
    levelLabel,
    suggestion,
  };
}

function calcIntradayTrend(
  quote: NonNullable<RiskAlertPanelProps["quote"]>,
  liveTimeline: RiskAlertPanelProps["liveTimeline"]
): RiskIndicator {
  if (liveTimeline.length < 6) {
    return {
      id: "trend",
      title: "日内趋势",
      icon: <TrendingUp className="h-4 w-4" />,
      value: "--",
      level: "none",
      levelLabel: "无数据",
      suggestion: "数据不足",
    };
  }

  const lastTL = liveTimeline[liveTimeline.length - 1];
  const avgPrice = lastTL.avgPrice;
  const price = lastTL.price;
  const open = quote.open;
  const openChange = open > 0 ? ((price - open) / open) * 100 : 0;

  // Count how many times price crosses avgPrice
  let crossCount = 0;
  for (let i = 1; i < liveTimeline.length; i++) {
    const prev = liveTimeline[i - 1];
    const cur = liveTimeline[i];
    if (
      avgPrice > 0 &&
      ((prev.price <= avgPrice && cur.price > avgPrice) ||
        (prev.price >= avgPrice && cur.price < avgPrice))
    ) {
      crossCount++;
    }
  }

  // Price range (max - min) relative to open
  const prices = liveTimeline.map((d) => d.price);
  const maxP = Math.max(...prices);
  const minP = Math.min(...prices);
  const range = open > 0 ? ((maxP - minP) / open) * 100 : 0;

  let level: RiskLevel;
  let levelLabel: string;
  let suggestion: string;

  if (price > open && price > avgPrice && crossCount <= 2) {
    level = "danger";
    levelLabel = "🔴 上涨趋势";
    suggestion = "注意冲高回落";
  } else if (price < open && price < avgPrice && crossCount <= 2) {
    level = "normal";
    levelLabel = "🟢 下跌趋势";
    suggestion = "注意低吸机会";
  } else if (crossCount >= 3) {
    level = "safe";
    levelLabel = "🔵 震荡行情";
    suggestion = "适合高抛低吸";
  } else if (range < 1) {
    level = "none";
    levelLabel = "⚪ 横盘整理";
    suggestion = "等待突破";
  } else {
    // Default to oscillating
    level = "safe";
    levelLabel = "🔵 震荡行情";
    suggestion = "波动中适合做T";
  }

  const dirSymbol = openChange >= 0 ? "+" : "";

  return {
    id: "trend",
    title: "日内趋势",
    icon:
      level === "danger" ? (
        <TrendingUp className="h-4 w-4" />
      ) : level === "normal" ? (
        <TrendingDown className="h-4 w-4" />
      ) : (
        <Activity className="h-4 w-4" />
      ),
    value: `${dirSymbol}${openChange.toFixed(2)}%`,
    level,
    levelLabel,
    suggestion,
  };
}

// ── Overall Risk Calculation ───────────────────────────

function calcOverallRisk(indicators: RiskIndicator[]): {
  level: "high" | "medium" | "low";
  label: string;
  color: string;
  bgColor: string;
  icon: string;
  suggestion: string;
} {
  const dangerCount = indicators.filter(
    (i) => i.level === "danger"
  ).length;
  const warningCount = indicators.filter(
    (i) => i.level === "warning"
  ).length;

  if (dangerCount >= 1 || dangerCount + warningCount >= 3) {
    return {
      level: "high",
      label: "高风险",
      color: "text-red-600 dark:text-red-400",
      bgColor: "bg-red-500/10 border-red-500/25",
      icon: "🔴",
      suggestion: "当前风险较高，建议减仓或观望",
    };
  } else if (warningCount >= 1 || dangerCount + warningCount >= 1) {
    return {
      level: "medium",
      label: "中风险",
      color: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-500/10 border-amber-500/25",
      icon: "🟡",
      suggestion: "注意风险，控制仓位参与",
    };
  } else {
    return {
      level: "low",
      label: "低风险",
      color: "text-emerald-600 dark:text-emerald-400",
      bgColor: "bg-emerald-500/10 border-emerald-500/25",
      icon: "🟢",
      suggestion: "风险可控，可适度参与",
    };
  }
}

// ── Component ──────────────────────────────────────────

export const RiskAlertPanel = React.memo(function RiskAlertPanel({
  symbol,
  quote,
  liveTimeline,
  sectorRegime,
  szIndexRegime,
  signalCounts,
}: RiskAlertPanelProps) {
  // Only show when liveTimeline has enough data
  const indicators = useMemo(() => {
    if (liveTimeline.length <= 5) return [] as RiskIndicator[];

    const result: RiskIndicator[] = [];

    // 1. 涨跌停距离
    if (quote) {
      result.push(calcLimitDistance(quote));
    } else {
      result.push({
        id: "limit",
        title: "涨跌停距离",
        icon: <Gauge className="h-4 w-4" />,
        value: "--",
        level: "none",
        levelLabel: "无数据",
        suggestion: "无报价数据",
      });
    }

    // 2. 均价偏离
    if (quote) {
      result.push(calcVWAPDeviation(quote, liveTimeline));
    } else {
      result.push({
        id: "vwap",
        title: "均价偏离",
        icon: <Activity className="h-4 w-4" />,
        value: "--",
        level: "none",
        levelLabel: "无数据",
        suggestion: "无报价数据",
      });
    }

    // 3. 量能异常
    result.push(calcVolumeAnomaly(liveTimeline));

    // 4. 大盘风险
    result.push(calcMarketRisk(szIndexRegime));

    // 5. 信号密度
    result.push(calcSignalDensity(signalCounts));

    // 6. 日内趋势
    if (quote) {
      result.push(calcIntradayTrend(quote, liveTimeline));
    } else {
      result.push({
        id: "trend",
        title: "日内趋势",
        icon: <Activity className="h-4 w-4" />,
        value: "--",
        level: "none",
        levelLabel: "无数据",
        suggestion: "无报价数据",
      });
    }

    return result;
  }, [quote, liveTimeline, szIndexRegime, signalCounts]);

  const overallRisk = useMemo(
    () => calcOverallRisk(indicators),
    [indicators]
  );

  // Don't render if not enough data
  if (liveTimeline.length <= 5) {
    return null;
  }

  return (
    <Card className="mt-4">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Shield className="h-4 w-4" />
            风险仪表盘
          </CardTitle>
          <Badge
            className={`text-[11px] px-2 py-0.5 border ${overallRisk.bgColor} ${overallRisk.color}`}
            variant="outline"
          >
            {overallRisk.icon} {overallRisk.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {/* 6 Risk Indicator Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {indicators.map((ind) => {
            const colors = LEVEL_COLORS[ind.level];
            return (
              <div
                key={ind.id}
                className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/30 border border-border/50 hover:border-border transition-colors"
              >
                <div className={`mt-0.5 shrink-0 ${colors.icon}`}>
                  {ind.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs text-muted-foreground font-medium truncate">
                      {ind.title}
                    </span>
                    <span
                      className={`text-[10px] font-medium whitespace-nowrap ${colors.badgeText}`}
                    >
                      {ind.levelLabel}
                    </span>
                  </div>
                  <div className="text-sm font-semibold font-mono mt-0.5 truncate">
                    {ind.value}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                    {ind.suggestion}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Overall Risk Summary */}
        <div
          className={`mt-3 p-2.5 rounded-lg border ${overallRisk.bgColor} flex items-center gap-2`}
        >
          <AlertTriangle className={`h-4 w-4 shrink-0 ${overallRisk.color}`} />
          <span className={`text-xs font-medium ${overallRisk.color}`}>
            {overallRisk.suggestion}
          </span>
          <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
            {symbol}
          </span>
        </div>
      </CardContent>
    </Card>
  );
});
