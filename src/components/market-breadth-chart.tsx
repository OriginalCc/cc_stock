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
    // If history is empty, create a single "now" point from current data
    if (history.length === 0) {
      return [{ time: "now", totalUp: currentUp, totalDown: currentDown, totalFlat: currentFlat, limitUp: 0, limitDown: 0 }];
    }
    // If the last point differs from current, add a "now" point
    const last = history[history.length - 1];
    if (last.totalUp !== currentUp || last.totalDown !== currentDown) {
      return [...history, { time: "now", totalUp: currentUp, totalDown: currentDown, totalFlat: currentFlat, limitUp: 0, limitDown: 0 }];
    }
    return history;
  }, [history, currentUp, currentDown, currentFlat]);

  // Chart dimensions
  const w = 600;
  const h = 160;
  const px = 40;  // left padding for labels
  const pr = 10;  // right padding
  const pt = 15;  // top padding
  const pb = 25;  // bottom padding for time labels
  const chartW = w - px - pr;
  const chartH = h - pt - pb;

  // All hooks must be called before any early returns
  const multiPointChart = useMemo(() => {
    if (data.length < 2) return null;

    // Calculate diff = up - down for each point
    const points = data.map(d => ({ ...d, diff: d.totalUp - d.totalDown }));

    const maxUp = Math.max(...points.map(d => d.totalUp));
    const maxDown = Math.max(...points.map(d => d.totalDown));
    const maxAbsDiff = Math.max(...points.map(d => Math.abs(d.diff)));
    const yMax = Math.max(maxUp, maxDown, maxAbsDiff, 100);
    const yPad = yMax * 0.1;
    const yMin = -yMax;
    const yTop = yMax + yPad;
    const yBottom = yMin - yPad;
    const yRange = yTop - yBottom;

    const toX = (i: number) => px + (i / (points.length - 1)) * chartW;
    const toY = (v: number) => pt + (1 - (v - yBottom) / yRange) * chartH;

    const upPath = points.map((d, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(d.totalUp).toFixed(1)}`).join(" ");
    const downPath = points.map((d, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(d.totalDown).toFixed(1)}`).join(" ");
    const diffPath = points.map((d, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(d.diff).toFixed(1)}`).join(" ");

    const zeroLineY = toY(0);

    // X-axis ticks
    const tickInterval = Math.max(1, Math.floor(points.length / 8));
    const xTicks: { x: number; label: string }[] = [];
    for (let i = 0; i < points.length; i++) {
      if (i % tickInterval === 0 || i === points.length - 1) {
        xTicks.push({ x: toX(i), label: points[i].time === "now" ? "现" : points[i].time });
      }
    }

    // Y-axis ticks
    const yStep = Math.ceil(yMax / 3 / 500) * 500;
    const yTicks: { y: number; label: string }[] = [];
    for (let v = -yMax; v <= yMax; v += yStep) {
      if (v === 0) continue;
      yTicks.push({ y: toY(v), label: v > 0 ? `+${v}` : `${v}` });
    }
    yTicks.push({ y: toY(0), label: "0" });

    // Right-end labels
    const lastDiff = data[data.length - 1].totalUp - data[data.length - 1].totalDown;
    const lastX = px + ((data.length - 1) / (data.length - 1)) * chartW;
    const lastUp = data[data.length - 1].totalUp;
    const lastDown = data[data.length - 1].totalDown;

    // Area fills
    const upAreaPath = (() => {
      const pts = data.map(d => d.totalUp);
      const maxVal = Math.max(...pts, 100);
      const range = maxVal || 1;
      const toYA = (v: number) => pt + (1 - v / range) * (chartH * 0.45);
      const toXA = (i: number) => px + (i / (data.length - 1)) * chartW;
      return `M${toXA(0)},${toYA(pts[0])} ` +
        pts.map((v, i) => `L${toXA(i).toFixed(1)},${toYA(v).toFixed(1)}`).join(" ") +
        ` L${toXA(data.length - 1)},${pt + chartH * 0.45} L${toXA(0)},${pt + chartH * 0.45} Z`;
    })();

    const downAreaPath = (() => {
      const pts = data.map(d => d.totalDown);
      const maxVal = Math.max(...pts, 100);
      const range = maxVal || 1;
      const toYA = (v: number) => pt + (1 - v / range) * (chartH * 0.45);
      const toXA = (i: number) => px + (i / (data.length - 1)) * chartW;
      return `M${toXA(0)},${toYA(pts[0])} ` +
        pts.map((v, i) => `L${toXA(i).toFixed(1)},${toYA(v).toFixed(1)}`).join(" ") +
        ` L${toXA(data.length - 1)},${pt + chartH * 0.45} L${toXA(0)},${pt + chartH * 0.45} Z`;
    })();

    return {
      upPath, downPath, diffPath, xTicks, yTicks, zeroLineY,
      upAreaPath, downAreaPath,
      lastDiff, lastX, lastUp, lastDown,
      yMax, yPad, yTop: yTop, yBottom: yBottom, yRange,
    };
  }, [data, chartW, chartH, px, pt, pb, pr]);

  // ── No data at all ──
  if (data.length === 0) {
    return (
      <Card className="border overflow-hidden">
        <CardContent className="p-2 sm:p-2.5">
          <div className="text-xs text-muted-foreground text-center py-4">等待涨跌家数数据...</div>
        </CardContent>
      </Card>
    );
  }

  // ── Single data point: show a simple summary ──
  if (data.length === 1) {
    const pt0 = data[0];
    const diff = pt0.totalUp - pt0.totalDown;
    const diffColor = diff >= 0 ? "#dc2626" : "#16a34a";

    const maxVal = Math.max(pt0.totalUp, pt0.totalDown, 100);
    const yPad2 = maxVal * 0.1;
    const yTop2 = maxVal + yPad2;
    const yBottom2 = -maxVal - yPad2;
    const yRange2 = yTop2 - yBottom2;
    const toY = (v: number) => pt + (1 - (v - yBottom2) / yRange2) * chartH;

    const singleX = chartW * 0.5 + px;
    const upY = toY(pt0.totalUp);
    const downY = toY(pt0.totalDown);
    const diffY = toY(diff);

    // Y-axis ticks
    const yStep = Math.ceil(maxVal / 3 / 500) * 500;
    const yTicks: { y: number; label: string }[] = [];
    for (let v = -maxVal; v <= maxVal; v += yStep) {
      if (v === 0) continue;
      yTicks.push({ y: toY(v), label: v > 0 ? `+${v}` : `${v}` });
    }
    yTicks.push({ y: toY(0), label: "0" });

    return (
      <Card className="border overflow-hidden">
        <CardContent className="p-2 sm:p-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">涨跌家数分时</span>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-red-500 rounded" />上涨</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-green-500 rounded" />下跌</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-blue-500 rounded" style={{ strokeDasharray: "2,1" }} />涨跌差</span>
            </div>
          </div>
          <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: 180 }}>
            {/* Background grid */}
            {yTicks.map((t, i) => (
              <line key={`y-${i}`} x1={px} y1={t.y} x2={w - pr} y2={t.y} stroke="currentColor" className="text-border" strokeWidth={0.5} strokeDasharray={t.label === "0" ? "4,3" : "2,3"} />
            ))}
            <line x1={px} y1={toY(0)} x2={w - pr} y2={toY(0)} stroke="currentColor" className="text-muted-foreground" strokeWidth={1} strokeDasharray="4,3" />

            {/* Single data point dots */}
            <circle cx={singleX} cy={upY} r={4} fill="#ef4444" />
            <circle cx={singleX} cy={downY} r={4} fill="#22c55e" />
            <circle cx={singleX} cy={diffY} r={4} fill="#3b82f6" />

            {/* Labels for single point */}
            <text x={singleX + 8} y={upY} fontSize={9} fontFamily="monospace" fontWeight={600} fill="#ef4444" dominantBaseline="middle">↑{pt0.totalUp}</text>
            <text x={singleX + 8} y={downY} fontSize={9} fontFamily="monospace" fontWeight={600} fill="#22c55e" dominantBaseline="middle">↓{pt0.totalDown}</text>
            <text x={singleX + 8} y={diffY} fontSize={9} fontFamily="monospace" fontWeight={700} fill={diffColor} dominantBaseline="middle">
              差{diff >= 0 ? "+" : ""}{diff}
            </text>

            {/* Y-axis labels */}
            {yTicks.map((t, i) => (
              <text key={`yl-${i}`} x={px - 4} y={t.y} textAnchor="end" dominantBaseline="middle" fontSize={8} fontFamily="monospace" fill="currentColor" className="text-muted-foreground">{t.label}</text>
            ))}

            {/* Waiting hint */}
            <text x={w / 2} y={h - 5} textAnchor="middle" fontSize={8} fontFamily="monospace" fill="currentColor" className="text-muted-foreground">
              采集第1个数据点，等待更多数据...
            </text>
          </svg>
        </CardContent>
      </Card>
    );
  }

  // ── Multi-point chart ──
  if (!multiPointChart) return null;

  const { upPath, downPath, diffPath, xTicks, yTicks, zeroLineY, upAreaPath, downAreaPath,
    lastDiff, lastX, lastUp, lastDown, yMax, yPad: yPad3, yTop: yTop3, yBottom: yBottom3, yRange: yRange3 } = multiPointChart;
  const diff = lastDiff;
  const diffColor = diff >= 0 ? "#dc2626" : "#16a34a";
  const toY2 = (v: number) => pt + (1 - (v - yBottom3) / yRange3) * chartH;

  return (
    <Card className="border overflow-hidden">
      <CardContent className="p-2 sm:p-2.5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">涨跌家数分时</span>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-red-500 rounded" />上涨</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-green-500 rounded" />下跌</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-blue-500 rounded" style={{ strokeDasharray: "2,1" }} />涨跌差</span>
          </div>
        </div>
        <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: 180 }}>
          {/* Background grid lines */}
          {yTicks.map((t, i) => (
            <line key={`y-${i}`} x1={px} y1={t.y} x2={w - pr} y2={t.y} stroke="currentColor" className="text-border" strokeWidth={0.5} strokeDasharray={t.label === "0" ? "4,3" : "2,3"} />
          ))}
          {/* Zero line (prominent) */}
          <line x1={px} y1={zeroLineY} x2={w - pr} y2={zeroLineY} stroke="currentColor" className="text-muted-foreground" strokeWidth={1} strokeDasharray="4,3" />

          {/* Up count area fill */}
          <path d={upAreaPath} fill="rgba(239,68,68,0.08)" />
          {/* Down count area fill */}
          <path d={downAreaPath} fill="rgba(34,197,94,0.08)" />

          {/* Up count line */}
          <path d={upPath} fill="none" stroke="#ef4444" strokeWidth={1.5} strokeLinejoin="round" />
          {/* Down count line */}
          <path d={downPath} fill="none" stroke="#22c55e" strokeWidth={1.5} strokeLinejoin="round" />
          {/* Diff line (dashed) */}
          <path d={diffPath} fill="none" stroke="#3b82f6" strokeWidth={1.2} strokeLinejoin="round" strokeDasharray="4,2" />

          {/* Y-axis labels */}
          {yTicks.map((t, i) => (
            <text key={`yl-${i}`} x={px - 4} y={t.y} textAnchor="end" dominantBaseline="middle" fontSize={8} fontFamily="monospace" fill="currentColor" className="text-muted-foreground">{t.label}</text>
          ))}

          {/* X-axis time labels */}
          {xTicks.map((t, i) => (
            <text key={`xl-${i}`} x={t.x} y={h - 5} textAnchor="middle" fontSize={8} fontFamily="monospace" fill="currentColor" className="text-muted-foreground">{t.label}</text>
          ))}

          {/* Current diff label at the right end */}
          <g>
            <circle cx={lastX} cy={toY2(diff)} r={3} fill={diffColor} />
            <text x={lastX + 6} y={toY2(diff)} fontSize={9} fontFamily="monospace" fontWeight={700} fill={diffColor} dominantBaseline="middle">
              {diff >= 0 ? "+" : ""}{diff}
            </text>
          </g>

          {/* Latest up/down labels at the right end */}
          <g>
            <text x={w - pr + 2} y={toY2(lastUp)} fontSize={8} fontFamily="monospace" fontWeight={600} fill="#ef4444" dominantBaseline="middle">{lastUp}</text>
            <text x={w - pr + 2} y={toY2(lastDown)} fontSize={8} fontFamily="monospace" fontWeight={600} fill="#22c55e" dominantBaseline="middle">{lastDown}</text>
          </g>
        </svg>
      </CardContent>
    </Card>
  );
}
