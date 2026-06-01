"use client";

import React from "react";
import { TrendingUp, TrendingDown, BarChart3 } from "lucide-react";

// ── Types ──

interface MarketLimitStatsProps {
  stats: {
    limitUp: {
      total: number;
      sealed: number;
      broken: number;
      sealRate: number;
      avgSealStrength: number;
      consecutiveStats: {
        firstBoard: number;
        secondBoard: number;
        thirdBoard: number;
        fourthPlus: number;
      };
      topSeals: {
        code: string;
        name: string;
        sealAmount: number;
        sealStrength: number;
        consecutiveDays: number;
        firstSealTime: string;
      }[];
      byTime: {
        morning: number;
        midday: number;
        afternoon: number;
        late: number;
      };
    };
    limitDown: {
      total: number;
      sealed: number;
      broken: number;
      sealRate: number;
      topBroken: {
        code: string;
        name: string;
        breakCount: number;
      }[];
    };
    contrast: {
      limitUpVsDown: number;
      netExtreme: number;
    };
  };
}

// ── Color constants (A-share convention: 红=涨, 绿=跌) ──

const UP_COLOR = "#dc2626";
const DOWN_COLOR = "#059669";
const UP_BG = "bg-red-500/8 border-red-500/20";
const DOWN_BG = "bg-green-500/8 border-green-500/20";

// ── Sub-components ──

/** Pill badge for metric display */
function MetricPill({
  label,
  value,
  color,
  bgColor,
}: {
  label: string;
  value: number | string;
  color: string;
  bgColor: string;
}) {
  return (
    <div
      className="flex flex-col items-center rounded-md px-2 py-1 min-w-[52px]"
      style={{ backgroundColor: bgColor }}
    >
      <span
        className="text-[10px] font-bold tabular-nums leading-tight"
        style={{ color }}
      >
        {value}
      </span>
      <span className="text-[8px] text-muted-foreground leading-tight mt-0.5">
        {label}
      </span>
    </div>
  );
}

/** Consecutive board pill with intensity-based coloring */
function BoardPill({
  label,
  count,
  maxCount,
  baseColor,
}: {
  label: string;
  count: number;
  maxCount: number;
  baseColor: string;
}) {
  const intensity = maxCount > 0 ? count / maxCount : 0;
  const opacity = 0.15 + intensity * 0.55;

  return (
    <div
      className="flex items-center gap-1 rounded-md px-1.5 py-0.5"
      style={{ backgroundColor: `${baseColor}${Math.round(opacity * 255).toString(16).padStart(2, "0")}` }}
    >
      <span className="text-[9px] text-muted-foreground whitespace-nowrap">{label}</span>
      <span
        className="text-[10px] font-bold tabular-nums"
        style={{ color: baseColor }}
      >
        {count}
      </span>
    </div>
  );
}

/** Horizontal stacked bar for time distribution */
function TimeDistributionBar({
  byTime,
  baseColor,
}: {
  byTime: { morning: number; midday: number; afternoon: number; late: number };
  baseColor: string;
}) {
  const total = byTime.morning + byTime.midday + byTime.afternoon + byTime.late;
  if (total === 0) {
    return (
      <div className="h-4 w-full rounded bg-muted/20 flex items-center justify-center">
        <span className="text-[8px] text-muted-foreground">无数据</span>
      </div>
    );
  }

  const segments = [
    { label: "早盘", value: byTime.morning },
    { label: "午前", value: byTime.midday },
    { label: "午后", value: byTime.afternoon },
    { label: "尾盘", value: byTime.late },
  ];

  const opacities = [0.9, 0.65, 0.45, 0.3];

  return (
    <div className="space-y-0.5">
      <div className="h-3 w-full rounded overflow-hidden flex">
        {segments.map((seg, i) => {
          const pct = (seg.value / total) * 100;
          return (
            <div
              key={seg.label}
              className="h-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                backgroundColor: baseColor,
                opacity: opacities[i],
              }}
              title={`${seg.label}: ${seg.value} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>
      <div className="flex">
        {segments.map((seg, i) => (
          <div
            key={seg.label}
            className="flex items-center gap-0.5"
            style={{ width: `${(seg.value / total) * 100}%`, minWidth: "0" }}
          >
            <span
              className="text-[7px] font-bold leading-none"
              style={{ color: baseColor, opacity: opacities[i] }}
            >
              {seg.value}
            </span>
            <span className="text-[7px] text-muted-foreground leading-none hidden sm:inline">
              {seg.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Compact stock list item */
function StockItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1 py-0.5 text-[10px] leading-tight border-b border-border/30 last:border-0">
      {children}
    </div>
  );
}

// ── Main Component ──

export function MarketLimitStats({ stats }: MarketLimitStatsProps) {
  const { limitUp, limitDown, contrast } = stats;

  // Empty state
  if (limitUp.total === 0 && limitDown.total === 0) {
    return (
      <div className="bg-card rounded-lg border border-border p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <BarChart3 className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[11px] font-semibold text-foreground/80">
            涨跌停详情
          </span>
        </div>
        <div className="text-[10px] text-muted-foreground text-center py-6">
          暂无涨跌停数据
        </div>
      </div>
    );
  }

  // Consecutive stats max for intensity calculation
  const consMax = Math.max(
    limitUp.consecutiveStats.firstBoard,
    limitUp.consecutiveStats.secondBoard,
    limitUp.consecutiveStats.thirdBoard,
    limitUp.consecutiveStats.fourthPlus,
    1
  );

  // Time distribution data
  const timeData = limitUp.byTime;

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      {/* Title */}
      <div className="px-2 pt-2 pb-1 flex items-center gap-1.5 border-b border-border/40">
        <BarChart3 className="w-3 h-3 text-muted-foreground" />
        <span className="text-[11px] font-semibold text-foreground/80">
          涨跌停详情
        </span>
      </div>

      {/* Two columns: 涨停 / 跌停 */}
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/40">
        {/* ── Left: 涨停 ── */}
        <div className={`p-2 ${UP_BG} rounded-none md:rounded-tl-none`}>
          {/* Section header */}
          <div className="flex items-center gap-1 mb-1.5">
            <TrendingUp className="w-3 h-3" style={{ color: UP_COLOR }} />
            <span
              className="text-[10px] font-bold"
              style={{ color: UP_COLOR }}
            >
              涨停
            </span>
            <span
              className="text-[9px] ml-auto tabular-nums"
              style={{ color: UP_COLOR }}
            >
              封板强度 {limitUp.avgSealStrength.toFixed(0)}%
            </span>
          </div>

          {/* 核心指标 */}
          <div className="flex flex-wrap gap-1 mb-2">
            <MetricPill
              label="总数"
              value={limitUp.total}
              color={UP_COLOR}
              bgColor="rgba(220,38,38,0.1)"
            />
            <MetricPill
              label="封板"
              value={limitUp.sealed}
              color={UP_COLOR}
              bgColor="rgba(220,38,38,0.1)"
            />
            <MetricPill
              label="开板"
              value={limitUp.broken}
              color="#ea580c"
              bgColor="rgba(234,88,12,0.1)"
            />
            <MetricPill
              label="封板率"
              value={`${limitUp.sealRate.toFixed(0)}%`}
              color={UP_COLOR}
              bgColor="rgba(220,38,38,0.1)"
            />
          </div>

          {/* 连板统计 */}
          <div className="mb-2">
            <div className="text-[9px] text-muted-foreground mb-1 font-medium">
              连板统计
            </div>
            <div className="flex flex-wrap gap-1">
              <BoardPill
                label="首板"
                count={limitUp.consecutiveStats.firstBoard}
                maxCount={consMax}
                baseColor={UP_COLOR}
              />
              <BoardPill
                label="2连"
                count={limitUp.consecutiveStats.secondBoard}
                maxCount={consMax}
                baseColor={UP_COLOR}
              />
              <BoardPill
                label="3连"
                count={limitUp.consecutiveStats.thirdBoard}
                maxCount={consMax}
                baseColor={UP_COLOR}
              />
              <BoardPill
                label="4+连"
                count={limitUp.consecutiveStats.fourthPlus}
                maxCount={consMax}
                baseColor={UP_COLOR}
              />
            </div>
          </div>

          {/* 时段分布 */}
          <div className="mb-2">
            <div className="text-[9px] text-muted-foreground mb-1 font-medium">
              时段分布
            </div>
            <TimeDistributionBar byTime={timeData} baseColor={UP_COLOR} />
          </div>

          {/* 封板资金TOP5 */}
          {limitUp.topSeals.length > 0 && (
            <div>
              <div className="text-[9px] text-muted-foreground mb-0.5 font-medium">
                封板资金TOP5
              </div>
              <div className="space-y-0">
                {limitUp.topSeals.slice(0, 5).map((stock) => (
                  <StockItem key={stock.code}>
                    <span
                      className="font-medium truncate max-w-[48px]"
                      style={{ color: UP_COLOR, fontSize: "10px" }}
                    >
                      {stock.name}
                    </span>
                    <span className="text-muted-foreground text-[8px] tabular-nums shrink-0">
                      {stock.firstSealTime}
                    </span>
                    <span className="text-[8px] tabular-nums ml-auto shrink-0" style={{ color: UP_COLOR }}>
                      {stock.sealStrength.toFixed(0)}%
                    </span>
                    {stock.consecutiveDays > 1 && (
                      <span className="text-[8px] bg-red-500/15 text-red-500 px-0.5 rounded shrink-0 tabular-nums">
                        {stock.consecutiveDays}连板
                      </span>
                    )}
                  </StockItem>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: 跌停 ── */}
        <div className={`p-2 ${DOWN_BG} rounded-none md:rounded-tr-none`}>
          {/* Section header */}
          <div className="flex items-center gap-1 mb-1.5">
            <TrendingDown className="w-3 h-3" style={{ color: DOWN_COLOR }} />
            <span
              className="text-[10px] font-bold"
              style={{ color: DOWN_COLOR }}
            >
              跌停
            </span>
          </div>

          {/* 核心指标 */}
          <div className="flex flex-wrap gap-1 mb-2">
            <MetricPill
              label="总数"
              value={limitDown.total}
              color={DOWN_COLOR}
              bgColor="rgba(5,150,105,0.1)"
            />
            <MetricPill
              label="封板"
              value={limitDown.sealed}
              color={DOWN_COLOR}
              bgColor="rgba(5,150,105,0.1)"
            />
            <MetricPill
              label="开板"
              value={limitDown.broken}
              color="#ca8a04"
              bgColor="rgba(202,138,4,0.1)"
            />
            <MetricPill
              label="封板率"
              value={`${limitDown.sealRate.toFixed(0)}%`}
              color={DOWN_COLOR}
              bgColor="rgba(5,150,105,0.1)"
            />
          </div>

          {/* 开板最多TOP5 */}
          {limitDown.topBroken.length > 0 && (
            <div>
              <div className="text-[9px] text-muted-foreground mb-0.5 font-medium">
                开板最多TOP5
              </div>
              <div className="space-y-0">
                {limitDown.topBroken.slice(0, 5).map((stock) => (
                  <StockItem key={stock.code}>
                    <span
                      className="font-medium truncate max-w-[64px]"
                      style={{ color: DOWN_COLOR, fontSize: "10px" }}
                    >
                      {stock.name}
                    </span>
                    <span className="text-[8px] tabular-nums ml-auto shrink-0 text-amber-600">
                      开板{stock.breakCount}次
                    </span>
                  </StockItem>
                ))}
              </div>
            </div>
          )}

          {/* When no topBroken data but has limitDown */}
          {limitDown.topBroken.length === 0 && limitDown.total > 0 && (
            <div className="text-[9px] text-muted-foreground text-center py-3">
              暂无开板数据
            </div>
          )}
        </div>
      </div>

      {/* ── 对比指标 ── */}
      <div className="px-2 py-1.5 border-t border-border/40 bg-muted/20">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-muted-foreground font-medium">
              涨停/跌停
            </span>
            <span
              className="text-[10px] font-bold tabular-nums"
              style={{
                color:
                  contrast.limitUpVsDown >= 1 ? UP_COLOR : DOWN_COLOR,
              }}
            >
              {contrast.limitUpVsDown.toFixed(1)}:1
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-muted-foreground font-medium">
              净极端
            </span>
            <span
              className="text-[10px] font-bold tabular-nums"
              style={{
                color: contrast.netExtreme >= 0 ? UP_COLOR : DOWN_COLOR,
              }}
            >
              {contrast.netExtreme >= 0 ? "+" : ""}
              {contrast.netExtreme}
            </span>
          </div>
          {/* Mini ratio bar */}
          <div className="flex-1 max-w-[100px] h-2 rounded-full overflow-hidden flex bg-muted/40">
            {limitUp.total + limitDown.total > 0 && (
              <>
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${(limitUp.total / (limitUp.total + limitDown.total)) * 100}%`,
                    backgroundColor: UP_COLOR,
                    opacity: 0.7,
                  }}
                />
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${(limitDown.total / (limitUp.total + limitDown.total)) * 100}%`,
                    backgroundColor: DOWN_COLOR,
                    opacity: 0.7,
                  }}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
