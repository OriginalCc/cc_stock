"use client";

import React, { useMemo } from "react";

/* ── Types ── */
interface MarketChangeDistributionProps {
  buckets: {
    label: string;
    count: number;
    color: string;
    min?: number;
    max?: number;
  }[];
  total: number;
  median: number;
  avgChange: number;
  limitUpSealed: number;
  limitUpBroken: number;
  limitDownSealed: number;
  limitDownBroken: number;
}

/* ── Helpers ── */
const UP_COLOR = "#dc2626";
const DOWN_COLOR = "#059669";

function formatPct(v: number): string {
  return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
}

/* ── Component ── */
export function MarketChangeDistribution({
  buckets,
  total,
  median,
  avgChange,
  limitUpSealed,
  limitUpBroken,
  limitDownSealed,
  limitDownBroken,
}: MarketChangeDistributionProps) {
  /* ── Computed values ── */
  const maxCount = useMemo(
    () => Math.max(...buckets.map((b) => b.count), 1),
    [buckets],
  );

  const isBullish = median >= 0;

  // Find the row index where down-side buckets start (first bucket with min < 0)
  const downStartIndex = useMemo(() => {
    for (let i = 0; i < buckets.length; i++) {
      if (buckets[i].min !== undefined && buckets[i].min < 0) return i;
    }
    // Fallback: detect from label
    for (let i = 0; i < buckets.length; i++) {
      const lbl = buckets[i].label;
      if (lbl.startsWith("-") || lbl.includes("跌")) return i;
    }
    return buckets.length;
  }, [buckets]);

  /* ── Card class (same style as market-breadth-chart) ── */
  const cardCls = `bg-card rounded-lg border border-border overflow-hidden ${
    isBullish ? "bg-red-500/5 border-red-500/20" : "bg-green-500/5 border-green-500/20"
  }`;

  return (
    <div className={cardCls}>
      {/* ── Header ── */}
      <div className="px-3 pt-2.5 pb-1.5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-semibold text-foreground/80">涨跌幅分布</span>
          <span className="text-[9px] text-muted-foreground tabular-nums">{total}只</span>
        </div>

        {/* ── Statistics row ── */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px]">
          {/* 中位数 */}
          <div className="flex items-center gap-0.5">
            <span className="text-muted-foreground">中位数</span>
            <span
              className="font-bold tabular-nums"
              style={{ color: median >= 0 ? UP_COLOR : DOWN_COLOR }}
            >
              {formatPct(median)}
            </span>
          </div>
          {/* 均值 */}
          <div className="flex items-center gap-0.5">
            <span className="text-muted-foreground">均值</span>
            <span
              className="font-bold tabular-nums"
              style={{ color: avgChange >= 0 ? UP_COLOR : DOWN_COLOR }}
            >
              {formatPct(avgChange)}
            </span>
          </div>
          {/* 涨停封板 */}
          <div className="flex items-center gap-0.5">
            <span style={{ color: UP_COLOR }}>涨停</span>
            <span className="font-bold tabular-nums" style={{ color: UP_COLOR }}>
              {limitUpSealed}封
            </span>
            <span className="text-muted-foreground/40">/</span>
            <span className="font-bold tabular-nums" style={{ color: "#f87171" }}>
              {limitUpBroken}开
            </span>
          </div>
          {/* 跌停封板 */}
          <div className="flex items-center gap-0.5">
            <span style={{ color: DOWN_COLOR }}>跌停</span>
            <span className="font-bold tabular-nums" style={{ color: DOWN_COLOR }}>
              {limitDownSealed}封
            </span>
            <span className="text-muted-foreground/40">/</span>
            <span className="font-bold tabular-nums" style={{ color: "#34d399" }}>
              {limitDownBroken}开
            </span>
          </div>
        </div>
      </div>

      {/* ── Histogram ── */}
      <div className="px-3 pb-2.5 pt-0.5">
        <div className="relative">
          {/* Vertical center reference line at the 0% boundary */}
          {downStartIndex > 0 && downStartIndex < buckets.length && (
            <div
              className="absolute left-[38px] right-[30px] pointer-events-none"
              style={{
                top: `${downStartIndex * 20 + (downStartIndex > 0 ? 10 : 0) - 1}px`,
                height: "0px",
              }}
            >
              {/* The dashed horizontal separator is rendered inline below */}
            </div>
          )}

          {buckets.map((bucket, i) => {
            const widthPct = maxCount > 0 ? (bucket.count / maxCount) * 100 : 0;
            const isUp = i < downStartIndex;
            const isBoundaryRow = i === downStartIndex;

            return (
              <React.Fragment key={`bucket-${i}-${bucket.label}`}>
                {/* ── 0% boundary separator ── */}
                {isBoundaryRow && (
                  <div className="flex items-center gap-1.5 my-0.5">
                    <span className="w-10 shrink-0" />
                    <div className="flex-1 flex items-center gap-1">
                      <div className="flex-1 border-t border-dashed border-muted-foreground/25" />
                      <span className="text-[8px] text-muted-foreground/50 font-medium tabular-nums px-0.5">
                        0%
                      </span>
                      <div className="flex-1 border-t border-dashed border-muted-foreground/25" />
                    </div>
                    <span className="w-7 shrink-0" />
                  </div>
                )}

                {/* ── Bar row ── */}
                <div
                  className="flex items-center gap-1.5 group"
                  style={{ height: "18px" }}
                >
                  {/* Label */}
                  <span
                    className="text-[9px] font-medium w-10 text-right shrink-0 tabular-nums truncate"
                    style={{ color: bucket.color }}
                    title={bucket.label}
                  >
                    {bucket.label}
                  </span>

                  {/* Bar track */}
                  <div className="flex-1 h-3.5 relative rounded-sm overflow-hidden bg-muted/[0.06]">
                    {/* Bar fill */}
                    <div
                      className="h-full rounded-sm transition-all duration-500 ease-out relative overflow-hidden"
                      style={{
                        width: `${Math.max(widthPct, 0)}%`,
                        backgroundColor: bucket.color,
                        opacity: 0.88,
                      }}
                    >
                      {/* Top highlight gradient for depth */}
                      <div
                        className="absolute inset-0 rounded-sm pointer-events-none"
                        style={{
                          background:
                            "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 40%, transparent 60%, rgba(0,0,0,0.08) 100%)",
                        }}
                      />
                    </div>

                    {/* Vertical 0% reference line in the bar area */}
                    {/* Shown at 50% of bar width as a visual midpoint reference */}
                    {i === 0 && (
                      <div className="absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 bg-muted-foreground/[0.08] pointer-events-none" />
                    )}
                  </div>

                  {/* Count */}
                  <span
                    className="text-[10px] font-bold tabular-nums w-7 text-right shrink-0"
                    style={{ color: bucket.color }}
                  >
                    {bucket.count}
                  </span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
