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
  limitUp?: number;
  limitDown?: number;
  shUp?: number;
  shDown?: number;
  szUp?: number;
  szDown?: number;
}

// ── Colors ──
const UP_COLOR = "#dc2626";
const DOWN_COLOR = "#059669";

export function MarketBreadthChart({ history, currentUp, currentDown, currentFlat, limitUp = 0, limitDown = 0, shUp = 0, shDown = 0, szUp = 0, szDown = 0 }: MarketBreadthChartProps) {
  // Merge current live data into the last history point for real-time display
  const data = useMemo(() => {
    if (history.length === 0 && currentUp === 0 && currentDown === 0) return [];
    if (history.length === 0) {
      const now = new Date();
      const h = (now.getUTCHours() + 8) % 24;
      const m = now.getUTCMinutes();
      const time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      return [{ time, totalUp: currentUp, totalDown: currentDown, totalFlat: currentFlat, limitUp: 0, limitDown: 0 }];
    }
    const last = history[history.length - 1];
    if (last.totalUp !== currentUp || last.totalDown !== currentDown) {
      const now = new Date();
      const h = (now.getUTCHours() + 8) % 24;
      const m = now.getUTCMinutes();
      const time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      return [...history, { time, totalUp: currentUp, totalDown: currentDown, totalFlat: currentFlat, limitUp: 0, limitDown: 0 }];
    }
    return history;
  }, [history, currentUp, currentDown, currentFlat]);

  // Chart dimensions
  const w = 640;
  const h = 180;
  const px = 45;  // left padding for labels
  const pr = 12;  // right padding
  const pt = 15;  // top padding
  const pb = 25;  // bottom padding for time labels
  const chartW = w - px - pr;
  const chartH = h - pt - pb;

  const { upPath, downPath, diffPath, xTicks, yTicks, zeroLineY, toY } = useMemo(() => {
    if (data.length < 2) {
      // Single point: still compute toY for dot rendering
      const yMax = Math.max(currentUp, currentDown, 100);
      const yNiceMax = Math.ceil(yMax / 500) * 500 || 500;
      const yPad = yNiceMax * 0.1;
      const yTop = yNiceMax + yPad;
      const yBottom = -yNiceMax - yPad;
      const yRange = yTop - yBottom;
      const toY = (v: number) => pt + (1 - (v - yBottom) / yRange) * chartH;
      return { upPath: "", downPath: "", diffPath: "", xTicks: [], yTicks: [], zeroLineY: toY(0), toY };
    }

    // Calculate diff = up - down for each point
    const points = data.map(d => ({ ...d, diff: d.totalUp - d.totalDown }));

    // Y range: show both absolute up/down counts and diff
    const maxUp = Math.max(...points.map(d => d.totalUp));
    const maxDown = Math.max(...points.map(d => d.totalDown));
    const maxAbsDiff = Math.max(...points.map(d => Math.abs(d.diff)));
    const yMax = Math.max(maxUp, maxDown, maxAbsDiff, 100);
    const yNiceMax = Math.ceil(yMax / 500) * 500 || 500;
    const yPad = yNiceMax * 0.1;
    const yTop = yNiceMax + yPad;
    const yBottom = -yNiceMax - yPad;
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

    // X-axis ticks: show every few points depending on data length
    const tickInterval = Math.max(1, Math.floor(points.length / 8));
    const xTicks = points
      .filter((_, i) => i % tickInterval === 0 || i === points.length - 1)
      .map((d, idx, arr) => {
        // Find the actual index in the original array
        const originalIdx = idx * tickInterval;
        const actualIdx = idx === arr.length - 1 ? points.length - 1 : originalIdx;
        return { x: toX(actualIdx), label: d.time };
      });

    // Y-axis ticks
    const yStep = Math.ceil(yNiceMax / 3 / 500) * 500 || 500;
    const yTicks: { y: number; label: string }[] = [];
    for (let v = -yNiceMax; v <= yNiceMax; v += yStep) {
      if (v === 0) continue; // Skip zero, draw separately
      yTicks.push({ y: toY(v), label: v > 0 ? `+${v}` : `${v}` });
    }
    yTicks.push({ y: toY(0), label: "0" });

    return { upPath, downPath, diffPath, xTicks, yTicks, zeroLineY, toY };
  }, [data, chartW, chartH, px, pt, pb, pr, currentUp, currentDown]);

  // Derived stats
  const lastPt = data[data.length - 1];
  const diff = lastPt ? lastPt.totalUp - lastPt.totalDown : 0;
  const diffColor = diff >= 0 ? UP_COLOR : DOWN_COLOR;
  const total = lastPt ? lastPt.totalUp + lastPt.totalDown + currentFlat || 1 : 1;
  const ratio = lastPt ? ((lastPt.totalUp / total) * 100).toFixed(1) : "50.0";
  const isBullish = currentUp > currentDown;

  const cardCls = `bg-card rounded-lg border border-border overflow-hidden ${isBullish ? 'bg-red-500/5 border-red-500/20' : 'bg-green-500/5 border-green-500/20'}`;

  // ── No data ──
  if (data.length === 0) {
    return (
      <Card className="border overflow-hidden">
        <CardContent className="p-2 sm:p-2.5">
          <div className="text-xs text-muted-foreground text-center py-4">等待涨跌家数数据...</div>
        </CardContent>
      </Card>
    );
  }

  // ── Single data point: show summary + dot chart ──
  if (data.length < 2) {
    const d0 = data[0];
    const x0 = px;
    const yUp0 = toY(d0.totalUp);
    const yDown0 = toY(d0.totalDown);

    return (
      <div className={cardCls}>
        <div className="px-2 pt-2 pb-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-foreground/80">市场涨跌家数</span>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: UP_COLOR }} />上涨</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: DOWN_COLOR }} />下跌</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 rounded bg-blue-500" style={{ strokeDasharray: "2,1" }} />涨跌差</span>
            </div>
          </div>
          {/* Summary stats */}
          <div className="flex items-center gap-3 mb-1">
            <div className="flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: UP_COLOR }} />
              <span className="font-bold tabular-nums text-[11px]" style={{ color: UP_COLOR }}>{currentUp}</span>
              <span className="text-[9px] text-muted-foreground">涨</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: DOWN_COLOR }} />
              <span className="font-bold tabular-nums text-[11px]" style={{ color: DOWN_COLOR }}>{currentDown}</span>
              <span className="text-[9px] text-muted-foreground">跌</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
              <span className="text-muted-foreground font-bold tabular-nums text-[11px]">{currentFlat}</span>
              <span className="text-[9px] text-muted-foreground">平</span>
            </div>
            {(limitUp > 0 || limitDown > 0) && (
              <div className="flex items-center gap-2 pl-2 border-l border-border">
                {limitUp > 0 && <span className="text-[10px] text-red-500 font-medium tabular-nums">涨停 {limitUp}</span>}
                {limitDown > 0 && <span className="text-[10px] text-green-500 font-medium tabular-nums">跌停 {limitDown}</span>}
              </div>
            )}
          </div>
        </div>
        <div className="px-2 pb-2 pt-1">
          <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: 180 }}>
            {/* Zero reference line */}
            <line x1={px} y1={toY(0)} x2={w - pr} y2={toY(0)} stroke="currentColor" className="text-muted-foreground" strokeWidth={0.5} strokeDasharray="4,3" />
            {/* Dashed horizontal lines from left to point */}
            <line x1={px} y1={yUp0} x2={x0 + 20} y2={yUp0} stroke={UP_COLOR} strokeWidth={0.8} strokeDasharray="4,3" opacity={0.5} />
            <line x1={px} y1={yDown0} x2={x0 + 20} y2={yDown0} stroke={DOWN_COLOR} strokeWidth={0.8} strokeDasharray="4,3" opacity={0.5} />
            {/* Dots */}
            <circle cx={x0 + 20} cy={yUp0} r={3} fill={UP_COLOR} />
            <circle cx={x0 + 20} cy={yUp0} r={1.2} fill="#fff" opacity={0.6} />
            <circle cx={x0 + 20} cy={yDown0} r={3} fill={DOWN_COLOR} />
            <circle cx={x0 + 20} cy={yDown0} r={1.2} fill="#fff" opacity={0.6} />
            {/* Value labels */}
            <text x={x0 + 28} y={yUp0 + 3} fontSize={9} fontWeight={700} fill={UP_COLOR}>{d0.totalUp}</text>
            <text x={x0 + 28} y={yDown0 + 3} fontSize={9} fontWeight={700} fill={DOWN_COLOR}>{d0.totalDown}</text>
          </svg>
          {/* Ratio bar */}
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[9px] font-bold tabular-nums w-8 text-right" style={{ color: UP_COLOR }}>{ratio}%</span>
            <div className="flex-1 h-2.5 rounded-full overflow-hidden flex bg-muted/30 relative">
              <div className="h-full rounded-l-full transition-all duration-700" style={{ width: `${ratio}%`, backgroundColor: UP_COLOR, opacity: 0.75 }} />
              <div className="h-full rounded-r-full transition-all duration-700" style={{ width: `${100 - parseFloat(ratio)}%`, backgroundColor: DOWN_COLOR, opacity: 0.75 }} />
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-muted-foreground/20 -translate-x-1/2" />
            </div>
            <span className="text-[9px] font-bold tabular-nums w-8" style={{ color: DOWN_COLOR }}>{(100 - parseFloat(ratio)).toFixed(1)}%</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Multi-point chart (original simple approach) ──
  const lastDiff = lastPt.totalUp - lastPt.totalDown;

  return (
    <div className={cardCls}>
      {/* Header + summary */}
      <div className="px-2 pt-2 pb-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold text-foreground/80">市场涨跌家数</span>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: UP_COLOR }} />上涨</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: DOWN_COLOR }} />下跌</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 rounded bg-blue-500" style={{ strokeDasharray: "2,1" }} />涨跌差</span>
          </div>
        </div>
        <div className="flex items-center gap-3 mb-1">
          <div className="flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: UP_COLOR }} />
            <span className="font-bold tabular-nums text-[11px]" style={{ color: UP_COLOR }}>{currentUp}</span>
            <span className="text-[9px] text-muted-foreground">涨</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: DOWN_COLOR }} />
            <span className="font-bold tabular-nums text-[11px]" style={{ color: DOWN_COLOR }}>{currentDown}</span>
            <span className="text-[9px] text-muted-foreground">跌</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
            <span className="text-muted-foreground font-bold tabular-nums text-[11px]">{currentFlat}</span>
            <span className="text-[9px] text-muted-foreground">平</span>
          </div>
          {(limitUp > 0 || limitDown > 0) && (
            <div className="flex items-center gap-2 pl-2 border-l border-border">
              {limitUp > 0 && <span className="text-[10px] text-red-500 font-medium tabular-nums">涨停 {limitUp}</span>}
              {limitDown > 0 && <span className="text-[10px] text-green-500 font-medium tabular-nums">跌停 {limitDown}</span>}
            </div>
          )}
          {(shUp > 0 || szUp > 0) && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pl-2 border-l border-border">
              <span className="tabular-nums">沪 {shUp}:{shDown}</span>
              <span className="text-muted-foreground/30">|</span>
              <span className="tabular-nums">深 {szUp}:{szDown}</span>
              <span className="text-muted-foreground/30">|</span>
              <span className="font-medium tabular-nums" style={{ color: diffColor }}>差 {diff >= 0 ? "+" : ""}{diff}</span>
            </div>
          )}
        </div>
      </div>

      {/* SVG Chart */}
      <div className="px-2">
        <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: 180 }}>
          {/* Background grid lines */}
          {yTicks.map((t, i) => (
            <line key={`y-${i}`} x1={px} y1={t.y} x2={w - pr} y2={t.y} stroke="currentColor" className="text-border" strokeWidth={0.5} strokeDasharray={t.label === "0" ? "4,3" : "2,3"} />
          ))}
          {/* Zero line (prominent) */}
          <line x1={px} y1={zeroLineY} x2={w - pr} y2={zeroLineY} stroke="currentColor" className="text-muted-foreground" strokeWidth={1} strokeDasharray="4,3" />

          {/* Up count area fill */}
          {(() => {
            const upVals = data.map(d => d.totalUp);
            const maxVal = Math.max(...upVals, 100);
            const range = maxVal || 1;
            const toYArea = (v: number) => pt + (1 - v / range) * (chartH * 0.45);
            const toXArea = (i: number) => px + (i / (data.length - 1)) * chartW;
            const areaPath = `M${toXArea(0)},${toYArea(upVals[0])} ` +
              upVals.map((v, i) => `L${toXArea(i).toFixed(1)},${toYArea(v).toFixed(1)}`).join(" ") +
              ` L${toXArea(data.length - 1)},${pt + chartH * 0.45} L${toXArea(0)},${pt + chartH * 0.45} Z`;
            return <path d={areaPath} fill="rgba(220,38,38,0.08)" />;
          })()}

          {/* Down count area fill */}
          {(() => {
            const downVals = data.map(d => d.totalDown);
            const maxVal = Math.max(...downVals, 100);
            const range = maxVal || 1;
            const toYArea = (v: number) => pt + (1 - v / range) * (chartH * 0.45);
            const toXArea = (i: number) => px + (i / (data.length - 1)) * chartW;
            const areaPath = `M${toXArea(0)},${toYArea(downVals[0])} ` +
              downVals.map((v, i) => `L${toXArea(i).toFixed(1)},${toYArea(v).toFixed(1)}`).join(" ") +
              ` L${toXArea(data.length - 1)},${pt + chartH * 0.45} L${toXArea(0)},${pt + chartH * 0.45} Z`;
            return <path d={areaPath} fill="rgba(5,150,105,0.08)" />;
          })()}

          {/* Up count line */}
          <path d={upPath} fill="none" stroke={UP_COLOR} strokeWidth={1.5} strokeLinejoin="round" />
          {/* Down count line */}
          <path d={downPath} fill="none" stroke={DOWN_COLOR} strokeWidth={1.5} strokeLinejoin="round" />
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
          {(() => {
            const lastX = px + ((data.length - 1) / (data.length - 1)) * chartW;
            const lastY = toY(lastDiff);
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
          {(() => {
            const lastUp = lastPt.totalUp;
            const lastDown = lastPt.totalDown;
            const lastX = px + ((data.length - 1) / (data.length - 1)) * chartW;
            const upY = toY(lastUp);
            const downY = toY(lastDown);
            return (
              <g>
                <text x={w - pr + 2} y={upY} fontSize={8} fontFamily="monospace" fontWeight={600} fill={UP_COLOR} dominantBaseline="middle">{lastUp}</text>
                <text x={w - pr + 2} y={downY} fontSize={8} fontFamily="monospace" fontWeight={600} fill={DOWN_COLOR} dominantBaseline="middle">{lastDown}</text>
              </g>
            );
          })()}

          {/* Axes */}
          <line x1={px} y1={pt} x2={px} y2={h - pb} stroke="currentColor" className="text-border" strokeWidth={0.3} />
          <line x1={px} y1={h - pb} x2={w - pr} y2={h - pb} stroke="currentColor" className="text-border" strokeWidth={0.3} />
        </svg>
      </div>

      {/* Bottom ratio bar */}
      <div className="px-2 pb-2 pt-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-bold tabular-nums w-8 text-right" style={{ color: UP_COLOR }}>{ratio}%</span>
          <div className="flex-1 h-2.5 rounded-full overflow-hidden flex bg-muted/30 relative">
            <div className="h-full rounded-l-full transition-all duration-700" style={{ width: `${ratio}%`, backgroundColor: UP_COLOR, opacity: 0.75 }} />
            <div className="h-full rounded-r-full transition-all duration-700" style={{ width: `${100 - parseFloat(ratio)}%`, backgroundColor: DOWN_COLOR, opacity: 0.75 }} />
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-muted-foreground/20 -translate-x-1/2" />
          </div>
          <span className="text-[9px] font-bold tabular-nums w-8" style={{ color: DOWN_COLOR }}>{(100 - parseFloat(ratio)).toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}
