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
  // Merge current live data into the last history point for real-time display
  const data = useMemo(() => {
    if (history.length === 0) return [];
    // If the last point differs significantly from current, add a "now" point
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

  const { upPath, downPath, diffPath, xTicks, yTicks, midY, zeroLineY } = useMemo(() => {
    if (data.length < 2) return { upPath: "", downPath: "", diffPath: "", xTicks: [], yTicks: [], midY: 0, zeroLineY: 0 };

    // Calculate diff = up - down for each point
    const points = data.map(d => ({ ...d, diff: d.totalUp - d.totalDown }));

    // Y range: show both absolute up/down counts and diff
    // Use max of (maxUp, maxDown, maxAbsDiff) to set scale
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

    // Up count line (red)
    const upPath = points.map((d, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(d.totalUp).toFixed(1)}`).join(" ");
    // Down count line (green)
    const downPath = points.map((d, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(d.totalDown).toFixed(1)}`).join(" ");
    // Diff line (blue dashed)
    const diffPath = points.map((d, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(d.diff).toFixed(1)}`).join(" ");

    // Zero line Y position
    const zeroLineY = toY(0);
    const midY = toY(0);

    // X-axis ticks: show every few points depending on data length
    const tickInterval = Math.max(1, Math.floor(points.length / 8));
    const xTicks = points
      .filter((_, i) => i % tickInterval === 0 || i === points.length - 1)
      .map((d, i, arr) => ({ x: toX(i * tickInterval), label: d.time === "now" ? "现" : d.time }));

    // Y-axis ticks
    const yStep = Math.ceil(yMax / 3 / 500) * 500;
    const yTicks: { y: number; label: string }[] = [];
    for (let v = -yMax; v <= yMax; v += yStep) {
      if (v === 0) continue; // Skip zero, draw separately
      yTicks.push({ y: toY(v), label: v > 0 ? `+${v}` : `${v}` });
    }
    yTicks.push({ y: toY(0), label: "0" });

    return { upPath, downPath, diffPath, xTicks, yTicks, midY, zeroLineY };
  }, [data, chartW, chartH, px, pt, pb, pr]);

  if (data.length < 2) {
    return (
      <Card className="border overflow-hidden">
        <CardContent className="p-2 sm:p-2.5">
          <div className="text-xs text-muted-foreground text-center py-4">涨跌家数分时图需要至少2个数据点（每5分钟采集一次）</div>
        </CardContent>
      </Card>
    );
  }

  const lastPoint = data[data.length - 1];
  const diff = lastPoint.totalUp - lastPoint.totalDown;
  const diffColor = diff >= 0 ? "#dc2626" : "#16a34a";

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
          {(() => {
            const points = data.map(d => d.totalUp);
            const maxVal = Math.max(...points, 100);
            const minVal = 0;
            const range = maxVal - minVal || 1;
            const toYArea = (v: number) => pt + (1 - (v - minVal) / range) * (chartH * 0.45);
            const toXArea = (i: number) => px + (i / (data.length - 1)) * chartW;
            const areaPath = `M${toXArea(0)},${toYArea(points[0])} ` +
              points.map((v, i) => `L${toXArea(i).toFixed(1)},${toYArea(v).toFixed(1)}`).join(" ") +
              ` L${toXArea(data.length - 1)},${pt + chartH * 0.45} L${toXArea(0)},${pt + chartH * 0.45} Z`;
            return <path d={areaPath} fill="rgba(239,68,68,0.08)" />;
          })()}

          {/* Down count area fill */}
          {(() => {
            const points = data.map(d => d.totalDown);
            const maxVal = Math.max(...points, 100);
            const minVal = 0;
            const range = maxVal - minVal || 1;
            const toYArea = (v: number) => pt + (1 - (v - minVal) / range) * (chartH * 0.45);
            const toXArea = (i: number) => px + (i / (data.length - 1)) * chartW;
            const areaPath = `M${toXArea(0)},${toYArea(points[0])} ` +
              points.map((v, i) => `L${toXArea(i).toFixed(1)},${toYArea(v).toFixed(1)}`).join(" ") +
              ` L${toXArea(data.length - 1)},${pt + chartH * 0.45} L${toXArea(0)},${pt + chartH * 0.45} Z`;
            return <path d={areaPath} fill="rgba(34,197,94,0.08)" />;
          })()}

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
          {data.length > 0 && (() => {
            const lastDiff = data[data.length - 1].totalUp - data[data.length - 1].totalDown;
            const lastX = px + ((data.length - 1) / (data.length - 1)) * chartW;
            // Map diff to Y using same scale as chart
            const maxUp = Math.max(...data.map(d => d.totalUp));
            const maxDown = Math.max(...data.map(d => d.totalDown));
            const yMax = Math.max(maxUp, maxDown, 100);
            const yPad = yMax * 0.1;
            const yTop = yMax + yPad;
            const yBottom = -yMax - yPad;
            const yRange = yTop - yBottom;
            const toY2 = (v: number) => pt + (1 - (v - yBottom) / yRange) * chartH;
            const lastY = toY2(lastDiff);
            return (
              <g>
                <circle cx={lastX} cy={lastY} r={3} fill={diffColor} />
                <text x={lastX + 6} y={lastY} fontSize={9} fontFamily="monospace" fontWeight={700} fill={diffColor} dominantBaseline="middle">
                  {lastDiff >= 0 ? "+" : ""}{lastDiff}
                </text>
              </g>
            );
          })()}

          {/* Latest up/down labels at the right end */}
          {data.length > 0 && (() => {
            const lastUp = data[data.length - 1].totalUp;
            const lastDown = data[data.length - 1].totalDown;
            const maxUp = Math.max(...data.map(d => d.totalUp));
            const maxDown = Math.max(...data.map(d => d.totalDown));
            const yMax = Math.max(maxUp, maxDown, 100);
            const yPad = yMax * 0.1;
            const yTop = yMax + yPad;
            const yBottom = -yMax - yPad;
            const yRange = yTop - yBottom;
            const toY2 = (v: number) => pt + (1 - (v - yBottom) / yRange) * chartH;
            const lastX = px + ((data.length - 1) / (data.length - 1)) * chartW;
            const upY = toY2(lastUp);
            const downY = toY2(lastDown);
            return (
              <g>
                <text x={w - pr + 2} y={upY} fontSize={8} fontFamily="monospace" fontWeight={600} fill="#ef4444" dominantBaseline="middle">{lastUp}</text>
                <text x={w - pr + 2} y={downY} fontSize={8} fontFamily="monospace" fontWeight={600} fill="#22c55e" dominantBaseline="middle">{lastDown}</text>
              </g>
            );
          })()}
        </svg>
      </CardContent>
    </Card>
  );
}
