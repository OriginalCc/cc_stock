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
      return [{ time: formatNowTime(), totalUp: currentUp, totalDown: currentDown, totalFlat: currentFlat, limitUp: 0, limitDown: 0 }];
    }
    const last = history[history.length - 1];
    // If current data differs from last history point, append a "now" point
    if (last.totalUp !== currentUp || last.totalDown !== currentDown) {
      return [...history, { time: formatNowTime(), totalUp: currentUp, totalDown: currentDown, totalFlat: currentFlat, limitUp: 0, limitDown: 0 }];
    }
    return history;
  }, [history, currentUp, currentDown, currentFlat]);

  // Chart dimensions
  const w = 640;
  const h = 260;
  const px = 42;  // left padding for Y labels
  const pr = 58;  // right padding for value labels
  const pt = 16;  // top padding (more room for labels above up line)
  const pb = 24;  // bottom padding for time labels
  const chartW = w - px - pr;
  const chartH = h - pt - pb;

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

  // ── Multi-point chart with two lines ──
  // Compute Y range based on all up/down values
  const allValues = data.flatMap(d => [d.totalUp, d.totalDown]);
  const yMin = 0;
  const yMax = Math.max(...allValues, 100);
  // Round up to nice number
  const yNiceMax = Math.ceil(yMax / 500) * 500 || 500;
  const yPad = yNiceMax * 0.06;
  const yTop = yNiceMax + yPad;
  const yBottom = 0 - yPad;
  const yRange = yTop - yBottom;

  const toX = (i: number) => px + (i / (data.length - 1)) * chartW;
  const toY = (v: number) => pt + (1 - (v - yBottom) / yRange) * chartH;

  // Build line paths
  const upLinePath = data.map((d, i) =>
    `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(d.totalUp).toFixed(1)}`
  ).join(" ");

  const downLinePath = data.map((d, i) =>
    `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(d.totalDown).toFixed(1)}`
  ).join(" ");

  // Build area fills under each line
  const upAreaPath = upLinePath +
    ` L${toX(data.length - 1).toFixed(1)},${toY(0).toFixed(1)}` +
    ` L${toX(0).toFixed(1)},${toY(0).toFixed(1)} Z`;

  const downAreaPath = downLinePath +
    ` L${toX(data.length - 1).toFixed(1)},${toY(0).toFixed(1)}` +
    ` L${toX(0).toFixed(1)},${toY(0).toFixed(1)} Z`;

  // X-axis ticks: show time labels at regular intervals
  const tickInterval = Math.max(1, Math.floor(data.length / 7));
  const xTicks: { x: number; label: string }[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i % tickInterval === 0 || i === data.length - 1) {
      xTicks.push({ x: toX(i), label: data[i].time });
    }
  }

  // Y-axis ticks
  const yStep = Math.ceil(yNiceMax / 4 / 500) * 500 || 500;
  const yTicks: { y: number; label: string }[] = [];
  for (let v = 0; v <= yNiceMax; v += yStep) {
    yTicks.push({ y: toY(v), label: v === 0 ? "0" : `${v}` });
  }

  const lastPt = data[data.length - 1];
  const lastX = toX(data.length - 1);
  const diff = lastPt.totalUp - lastPt.totalDown;
  const total = lastPt.totalUp + lastPt.totalDown + currentFlat || 1;
  const ratio = ((lastPt.totalUp / total) * 100).toFixed(1);

  return (
    <Card className="border overflow-hidden">
      <CardContent className="p-2 sm:p-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-muted-foreground">涨跌家数分时</span>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-1.5 bg-red-600 rounded-sm" />
              <span className="text-red-600 font-semibold">上涨家数</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-1.5 bg-emerald-600 rounded-sm" />
              <span className="text-emerald-600 font-semibold">下跌家数</span>
            </span>
          </div>
        </div>

        {/* SVG Chart */}
        <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: 260 }}>
          <defs>
            {/* Red gradient for up area — more vivid */}
            <linearGradient id="upAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#dc2626" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#dc2626" stopOpacity="0.03" />
            </linearGradient>
            {/* Green gradient for down area — more vivid */}
            <linearGradient id="downAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#059669" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#059669" stopOpacity="0.03" />
            </linearGradient>
          </defs>

          {/* Background grid lines */}
          {yTicks.map((t, i) => (
            <line key={`yg-${i}`} x1={px} y1={t.y} x2={px + chartW} y2={t.y}
              stroke="currentColor" className="text-border" strokeWidth={0.4}
              strokeDasharray={t.label === "0" ? "none" : "2,3"} />
          ))}
          {/* Zero line (prominent) */}
          <line x1={px} y1={toY(0)} x2={px + chartW} y2={toY(0)}
            stroke="currentColor" className="text-muted-foreground" strokeWidth={0.6} />

          {/* Up area fill */}
          <path d={upAreaPath} fill="url(#upAreaGrad)" />
          {/* Down area fill */}
          <path d={downAreaPath} fill="url(#downAreaGrad)" />

          {/* Up line (red) — thicker, deeper red */}
          <path d={upLinePath} fill="none" stroke="#dc2626" strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
          {/* Down line (green) — thicker, deeper green */}
          <path d={downLinePath} fill="none" stroke="#059669" strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />

          {/* Data point dots & number labels */}
          {/* Determine label interval: show every point if <=8, otherwise thin out */}
          {data.map((d, i) => {
            const x = toX(i);
            const yUp = toY(d.totalUp);
            const yDown = toY(d.totalDown);
            const isLast = i === data.length - 1;
            const isFirst = i === 0;
            const labelInterval = data.length <= 8 ? 1 : Math.max(1, Math.floor(data.length / 8));
            const showLabel = isFirst || isLast || i % labelInterval === 0;
            const upLabelY = yUp - 5;
            const downLabelY = yDown + 10;

            return (
              <g key={`pt-${i}`}>
                {/* Up dot */}
                <circle cx={x} cy={yUp} r={isLast ? 3.5 : 2.5} fill="#dc2626" />
                {isLast && <circle cx={x} cy={yUp} r={2} fill="#fff" opacity={0.5} />}
                {/* Down dot */}
                <circle cx={x} cy={yDown} r={isLast ? 3.5 : 2.5} fill="#059669" />
                {isLast && <circle cx={x} cy={yDown} r={2} fill="#fff" opacity={0.5} />}

                {/* Number labels */}
                {showLabel && (
                  <>
                    {/* Up count label (above the up line) */}
                    <rect x={x - 14} y={upLabelY - 7} width={28} height={10} rx={2}
                      fill="#dc2626" opacity={0.12} />
                    <text x={x} y={upLabelY} textAnchor="middle"
                      fontSize={8} fontFamily="monospace" fontWeight={800}
                      fill="#dc2626">
                      {d.totalUp}
                    </text>
                    {/* Down count label (below the down line) */}
                    <rect x={x - 14} y={downLabelY - 7} width={28} height={10} rx={2}
                      fill="#059669" opacity={0.12} />
                    <text x={x} y={downLabelY} textAnchor="middle"
                      fontSize={8} fontFamily="monospace" fontWeight={800}
                      fill="#059669">
                      {d.totalDown}
                    </text>
                  </>
                )}
              </g>
            );
          })}

          {/* End dots with pulse - Up */}
          <circle cx={lastX} cy={toY(lastPt.totalUp)} r={5} fill="#dc2626" opacity={0.25}>
            <animate attributeName="r" values="5;9;5" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.25;0.08;0.25" dur="2s" repeatCount="indefinite" />
          </circle>

          {/* End dots with pulse - Down */}
          <circle cx={lastX} cy={toY(lastPt.totalDown)} r={5} fill="#059669" opacity={0.25}>
            <animate attributeName="r" values="5;9;5" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.25;0.08;0.25" dur="2s" repeatCount="indefinite" />
          </circle>

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
            {/* Up count */}
            <rect x={px + chartW + 1} y={toY(lastPt.totalUp) - 8} width={54} height={16} rx={3}
              fill="#dc2626" opacity={0.15} />
            <rect x={px + chartW + 1} y={toY(lastPt.totalUp) - 8} width={54} height={16} rx={3}
              fill="none" stroke="#dc2626" strokeWidth={0.6} opacity={0.4} />
            <text x={px + chartW + 6} y={toY(lastPt.totalUp)} fontSize={10} fontFamily="monospace" fontWeight={800}
              fill="#dc2626" dominantBaseline="middle">
              ↑{lastPt.totalUp}
            </text>
            {/* Down count */}
            <rect x={px + chartW + 1} y={toY(lastPt.totalDown) - 8} width={54} height={16} rx={3}
              fill="#059669" opacity={0.15} />
            <rect x={px + chartW + 1} y={toY(lastPt.totalDown) - 8} width={54} height={16} rx={3}
              fill="none" stroke="#059669" strokeWidth={0.6} opacity={0.4} />
            <text x={px + chartW + 6} y={toY(lastPt.totalDown)} fontSize={10} fontFamily="monospace" fontWeight={800}
              fill="#059669" dominantBaseline="middle">
              ↓{lastPt.totalDown}
            </text>
          </g>

          {/* Diff label at bottom right */}
          <rect x={px + chartW + 1} y={h - pb + 3} width={54} height={14} rx={3}
            fill={diff >= 0 ? "#dc2626" : "#059669"} opacity={0.12} />
          <text x={px + chartW + 6} y={h - pb + 10} fontSize={9} fontFamily="monospace" fontWeight={700}
            fill={diff >= 0 ? "#dc2626" : "#059669"} dominantBaseline="middle">
            差{diff >= 0 ? "+" : ""}{diff}
          </text>
        </svg>

        {/* Bottom ratio bar */}
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-[9px] text-red-600 font-bold tabular-nums w-8 text-right">{ratio}%</span>
          <div className="flex-1 h-2.5 rounded-full overflow-hidden flex bg-muted/30">
            <div className="h-full bg-red-600/80 transition-all duration-700" style={{ width: `${ratio}%` }} />
            <div className="h-full bg-emerald-600/80 transition-all duration-700" style={{ width: `${100 - parseFloat(ratio)}%` }} />
          </div>
          <span className="text-[9px] text-emerald-600 font-bold tabular-nums w-8">{(100 - parseFloat(ratio)).toFixed(1)}%</span>
        </div>
      </CardContent>
    </Card>
  );
}

/** Format current time as HH:MM in China timezone */
function formatNowTime(): string {
  const now = new Date();
  const h = (now.getUTCHours() + 8) % 24;
  const m = now.getUTCMinutes();
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
