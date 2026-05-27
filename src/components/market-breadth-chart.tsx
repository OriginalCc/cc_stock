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

interface MarketBreadthChartProps {
  history: BreadthHistoryPoint[];
  currentUp: number;
  currentDown: number;
  currentFlat: number;
}

export function MarketBreadthChart({ history, currentUp, currentDown, currentFlat }: MarketBreadthChartProps) {
  // Merge current live data: always append/update a "now" point
  const data = useMemo(() => {
    if (currentUp === 0 && currentDown === 0 && history.length === 0) return [];
    if (history.length === 0) {
      return [{ time: "now", totalUp: currentUp, totalDown: currentDown, totalFlat: currentFlat, limitUp: 0, limitDown: 0 }];
    }
    const last = history[history.length - 1];
    if (last.totalUp !== currentUp || last.totalDown !== currentDown) {
      return [...history, { time: "now", totalUp: currentUp, totalDown: currentDown, totalFlat: currentFlat, limitUp: 0, limitDown: 0 }];
    }
    return history;
  }, [history, currentUp, currentDown, currentFlat]);

  // Chart dimensions
  const w = 640;
  const h = 200;
  const px = 44;  // left padding for labels
  const pr = 52;  // right padding for value labels
  const pt = 10;  // top padding
  const pb = 22;  // bottom padding for time labels
  const chartW = w - px - pr;
  const chartH = h - pt - pb;

  // Core chart computation (hook must be before any early returns)
  const chartState = useMemo(() => {
    if (data.length < 2) return null;

    const points = data.map(d => ({ ...d, diff: d.totalUp - d.totalDown }));
    const maxAbsDiff = Math.max(...points.map(d => Math.abs(d.diff)), 100);
    // Round up to a nice number
    const yMax = Math.ceil(maxAbsDiff / 500) * 500 || 500;
    const yPad = yMax * 0.08;
    const yTop = yMax + yPad;
    const yBottom = -yMax - yPad;
    const yRange = yTop - yBottom;

    const toX = (i: number) => px + (i / (points.length - 1)) * chartW;
    const toY = (v: number) => pt + (1 - (v - yBottom) / yRange) * chartH;
    const zeroY = toY(0);

    // Diff line path
    const diffLinePath = points.map((d, i) =>
      `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(d.diff).toFixed(1)}`
    ).join(" ");

    // Red area (diff > 0): clip to above zero line
    // Build two area paths: one for positive (red), one for negative (green)
    const redAreaPath = buildDiffAreaPath(points, toX, toY, zeroY, "positive");
    const greenAreaPath = buildDiffAreaPath(points, toX, toY, zeroY, "negative");

    // Subtle up/down lines
    const upLinePath = points.map((d, i) =>
      `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(d.totalUp - d.totalDown + (d.totalUp > d.totalDown ? (d.totalUp - d.totalDown) * 0 : 0)).toFixed(1)}`
    ).join(" ");

    // X-axis ticks
    const tickInterval = Math.max(1, Math.floor(points.length / 6));
    const xTicks: { x: number; label: string }[] = [];
    for (let i = 0; i < points.length; i++) {
      if (i % tickInterval === 0 || i === points.length - 1) {
        xTicks.push({ x: toX(i), label: points[i].time === "now" ? "现" : points[i].time });
      }
    }

    // Y-axis ticks (only show diff scale)
    const yStep = Math.ceil(yMax / 2 / 500) * 500 || 500;
    const yTicks: { y: number; label: string }[] = [];
    for (let v = -yMax; v <= yMax; v += yStep) {
      yTicks.push({ y: toY(v), label: v === 0 ? "0" : (v > 0 ? `+${v}` : `${v}`) });
    }

    const lastPt = points[points.length - 1];
    const lastX = toX(points.length - 1);

    return {
      diffLinePath, redAreaPath, greenAreaPath, upLinePath,
      xTicks, yTicks, zeroY,
      lastDiff: lastPt.diff, lastUp: lastPt.totalUp, lastDown: lastPt.totalDown,
      lastX, yMax, yBottom, yTop, yRange, toY,
      points,
    };
  }, [data, chartW, chartH, px, pt, pb, pr]);

  // ── No data at all ──
  if (data.length === 0) {
    return (
      <Card className="border overflow-hidden">
        <CardContent className="p-2 sm:p-3">
          <div className="text-xs text-muted-foreground text-center py-6">等待涨跌家数数据...</div>
        </CardContent>
      </Card>
    );
  }

  // ── Single data point ──
  if (data.length === 1) {
    const pt0 = data[0];
    const diff = pt0.totalUp - pt0.totalDown;
    const diffColor = diff >= 0 ? "#dc2626" : "#16a34a";
    const total = pt0.totalUp + pt0.totalDown + pt0.totalFlat || 1;
    const ratio = ((pt0.totalUp / total) * 100).toFixed(1);

    return (
      <Card className="border overflow-hidden">
        <CardContent className="p-2 sm:p-3">
          {/* Header with current stats */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">涨跌家数分时</span>
            <span className="text-[10px] text-muted-foreground">采集第1个数据点，等待更多...</span>
          </div>
          {/* Big numbers display */}
          <div className="flex items-center justify-center gap-4 py-3">
            <div className="text-center">
              <div className="text-lg font-bold text-red-500 tabular-nums">{pt0.totalUp}</div>
              <div className="text-[10px] text-red-400">上涨</div>
            </div>
            <div className="text-muted-foreground/40 text-lg">:</div>
            <div className="text-center">
              <div className="text-lg font-bold text-green-500 tabular-nums">{pt0.totalDown}</div>
              <div className="text-[10px] text-green-400">下跌</div>
            </div>
            <div className="ml-3 pl-3 border-l border-border">
              <div className={`text-lg font-bold tabular-nums ${diff >= 0 ? "text-red-500" : "text-green-500"}`}>
                {diff >= 0 ? "+" : ""}{diff}
              </div>
              <div className="text-[10px] text-muted-foreground">涨跌差</div>
            </div>
          </div>
          {/* Ratio bar */}
          <div className="h-3 w-full rounded-full overflow-hidden flex bg-muted/30">
            <div className="h-full bg-red-500/80 transition-all duration-500" style={{ width: `${ratio}%` }} />
            <div className="h-full bg-green-500/80 transition-all duration-500" style={{ width: `${100 - parseFloat(ratio)}%` }} />
          </div>
          <div className="flex justify-between mt-0.5">
            <span className="text-[9px] text-red-400">{ratio}%</span>
            <span className="text-[9px] text-green-400">{(100 - parseFloat(ratio)).toFixed(1)}%</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Multi-point chart ──
  if (!chartState) return null;

  const { diffLinePath, redAreaPath, greenAreaPath,
    xTicks, yTicks, zeroY,
    lastDiff, lastUp, lastDown, lastX, yMax, yBottom, yTop, yRange, toY: toYFn,
    points } = chartState;

  const diffColor = lastDiff >= 0 ? "#dc2626" : "#16a34a";
  const total = lastUp + lastDown + currentFlat || 1;
  const ratio = ((lastUp / total) * 100).toFixed(1);

  return (
    <Card className="border overflow-hidden">
      <CardContent className="p-2 sm:p-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-muted-foreground">涨跌家数分时</span>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 bg-red-500/30 rounded-sm border border-red-500/50" />涨多</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 bg-green-500/30 rounded-sm border border-green-500/50" />跌多</span>
          </div>
        </div>

        {/* SVG Chart */}
        <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: 200 }}>
          <defs>
            <linearGradient id="redGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#22c55e" stopOpacity="0.35" />
            </linearGradient>
          </defs>

          {/* Background grid lines */}
          {yTicks.map((t, i) => (
            <line key={`yg-${i}`} x1={px} y1={t.y} x2={px + chartW} y2={t.y}
              stroke="currentColor" className="text-border" strokeWidth={0.4}
              strokeDasharray={t.label === "0" ? "none" : "2,3"} />
          ))}

          {/* Zero line (prominent) */}
          <line x1={px} y1={zeroY} x2={px + chartW} y2={zeroY}
            stroke="currentColor" className="text-muted-foreground" strokeWidth={0.8} />

          {/* Red area (diff > 0) */}
          {redAreaPath && <path d={redAreaPath} fill="url(#redGrad)" />}
          {/* Green area (diff < 0) */}
          {greenAreaPath && <path d={greenAreaPath} fill="url(#greenGrad)" />}

          {/* Diff line */}
          <path d={diffLinePath} fill="none" stroke={diffColor} strokeWidth={1.8} strokeLinejoin="round" />

          {/* End dot with pulse */}
          <circle cx={lastX} cy={toYFn(lastDiff)} r={4} fill={diffColor} opacity={0.3}>
            <animate attributeName="r" values="4;7;4" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.3;0.1;0.3" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx={lastX} cy={toYFn(lastDiff)} r={2.5} fill={diffColor} />

          {/* Y-axis labels */}
          {yTicks.map((t, i) => (
            <text key={`yl-${i}`} x={px - 4} y={t.y} textAnchor="end" dominantBaseline="middle"
              fontSize={8} fontFamily="monospace" fill="currentColor" className="text-muted-foreground">
              {t.label}
            </text>
          ))}

          {/* X-axis time labels */}
          {xTicks.map((t, i) => (
            <text key={`xl-${i}`} x={t.x} y={h - 4} textAnchor="middle"
              fontSize={8} fontFamily="monospace" fill="currentColor" className="text-muted-foreground">
              {t.label}
            </text>
          ))}

          {/* Right side: current values */}
          <g>
            {/* Diff value */}
            <text x={px + chartW + 4} y={toYFn(lastDiff)} fontSize={10} fontFamily="monospace" fontWeight={700}
              fill={diffColor} dominantBaseline="middle">
              {lastDiff >= 0 ? "+" : ""}{lastDiff}
            </text>
            {/* Up count */}
            <text x={px + chartW + 4} y={toYFn(Math.min(yMax, yMax * 0.7))} fontSize={8} fontFamily="monospace" fontWeight={600}
              fill="#ef4444" dominantBaseline="middle">
              ↑{lastUp}
            </text>
            {/* Down count */}
            <text x={px + chartW + 4} y={toYFn(Math.max(-yMax, -yMax * 0.7))} fontSize={8} fontFamily="monospace" fontWeight={600}
              fill="#22c55e" dominantBaseline="middle">
              ↓{lastDown}
            </text>
          </g>
        </svg>

        {/* Bottom ratio bar */}
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-[9px] text-red-400 font-medium tabular-nums w-8 text-right">{ratio}%</span>
          <div className="flex-1 h-2 rounded-full overflow-hidden flex bg-muted/30">
            <div className="h-full bg-red-500/70 transition-all duration-700" style={{ width: `${ratio}%` }} />
            <div className="h-full bg-green-500/70 transition-all duration-700" style={{ width: `${100 - parseFloat(ratio)}%` }} />
          </div>
          <span className="text-[9px] text-green-400 font-medium tabular-nums w-8">{(100 - parseFloat(ratio)).toFixed(1)}%</span>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Build SVG path for diff area fill, clipped above or below zero line.
 * Uses intersection calculation where the diff line crosses zero.
 */
function buildDiffAreaPath(
  points: { diff: number }[],
  toX: (i: number) => number,
  toY: (v: number) => number,
  zeroY: number,
  mode: "positive" | "negative"
): string {
  if (points.length < 2) return "";

  const segments: string[] = [];
  let inRegion = false;
  let pathParts: string[] = [];

  for (let i = 0; i < points.length; i++) {
    const d = points[i].diff;
    const isTarget = mode === "positive" ? d >= 0 : d <= 0;
    const x = toX(i);
    const y = toY(d);

    if (isTarget) {
      if (!inRegion) {
        // Entering the region — find intersection with zero line
        if (i > 0) {
          const prevD = points[i - 1].diff;
          const prevIsTarget = mode === "positive" ? prevD >= 0 : prevD <= 0;
          if (!prevIsTarget) {
            // Linear interpolation to find zero crossing
            const prevX = toX(i - 1);
            const prevY = toY(prevD);
            const t = Math.abs(prevD) / (Math.abs(prevD) + Math.abs(d));
            const crossX = prevX + t * (x - prevX);
            pathParts.push(`M${crossX.toFixed(1)},${zeroY.toFixed(1)}`);
          }
        }
        if (pathParts.length === 0) {
          pathParts.push(`M${x.toFixed(1)},${y.toFixed(1)}`);
        } else {
          pathParts.push(`L${x.toFixed(1)},${y.toFixed(1)}`);
        }
        inRegion = true;
      } else {
        pathParts.push(`L${x.toFixed(1)},${y.toFixed(1)}`);
      }
    } else {
      if (inRegion) {
        // Leaving the region — find intersection with zero line
        const prevD = points[i - 1].diff;
        const prevX = toX(i - 1);
        const prevY = toY(prevD);
        const t = Math.abs(prevD) / (Math.abs(prevD) + Math.abs(d));
        const crossX = prevX + t * (x - prevX);
        pathParts.push(`L${crossX.toFixed(1)},${zeroY.toFixed(1)}`);

        // Close the path back along zero line to start
        pathParts.push("Z");
        segments.push(pathParts.join(" "));
        pathParts = [];
        inRegion = false;
      }
    }
  }

  // If still in region at end, close it
  if (inRegion && pathParts.length > 0) {
    pathParts.push(`L${toX(points.length - 1).toFixed(1)},${zeroY.toFixed(1)}`);
    pathParts.push("Z");
    segments.push(pathParts.join(" "));
  }

  return segments.join(" ");
}
