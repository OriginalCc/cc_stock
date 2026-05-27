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

// ── Colors ──
const UP_COLOR = "#dc2626";
const DOWN_COLOR = "#059669";

function formatNowTime(): string {
  const now = new Date();
  const h = (now.getUTCHours() + 8) % 24;
  const m = now.getUTCMinutes();
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Catmull-Rom smooth curve through points */
function smoothCurvePath(values: number[], toX: (i: number) => number, toY: (v: number) => number): string {
  if (values.length < 2) return "";
  const points = values.map((v, i) => ({ x: toX(i), y: toY(v) }));
  if (points.length === 2) return `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)} L${points[1].x.toFixed(1)},${points[1].y.toFixed(1)}`;
  let path = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return path;
}

/** Build between-lines area fill for one side (up>down or down>up) */
function buildBetweenArea(
  data: BreadthHistoryPoint[],
  toX: (i: number) => number,
  toY: (v: number) => number,
  mode: "upDominant" | "downDominant",
): string {
  const n = data.length;
  if (n < 2) return "";
  const segments: string[] = [];
  const isTarget = (i: number) =>
    mode === "upDominant" ? data[i].totalUp >= data[i].totalDown : data[i].totalDown > data[i].totalUp;
  const getTopVal = (i: number) => mode === "upDominant" ? data[i].totalUp : data[i].totalDown;
  const getBotVal = (i: number) => mode === "upDominant" ? data[i].totalDown : data[i].totalUp;

  let inRegion = isTarget(0);
  let pathPts: string[] = [];

  for (let i = 0; i < n; i++) {
    const target = isTarget(i);
    if (target) {
      if (!inRegion && i > 0) {
        // Crossing in: interpolate
        const t = Math.abs(getTopVal(i - 1) - getBotVal(i - 1)) /
          (Math.abs(getTopVal(i) - getBotVal(i)) + Math.abs(getTopVal(i - 1) - getBotVal(i - 1))) || 0.5;
        const cx = toX(i - 1) + t * (toX(i) - toX(i - 1));
        const cy = toY(getTopVal(i - 1)) + t * (toY(getTopVal(i)) - toY(getTopVal(i - 1)));
        pathPts.push(`L${cx.toFixed(1)},${cy.toFixed(1)}`);
        inRegion = true;
      }
      if (!inRegion) { inRegion = true; }
      pathPts.push(`${pathPts.length === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(getTopVal(i)).toFixed(1)}`);
    } else {
      if (inRegion) {
        // Crossing out: interpolate on top line
        if (i > 0) {
          const t = Math.abs(getTopVal(i - 1) - getBotVal(i - 1)) /
            (Math.abs(getTopVal(i) - getBotVal(i)) + Math.abs(getTopVal(i - 1) - getBotVal(i - 1))) || 0.5;
          const cx = toX(i - 1) + t * (toX(i) - toX(i - 1));
          const cy = toY(getTopVal(i - 1)) + t * (toY(getTopVal(i)) - toY(getTopVal(i - 1)));
          pathPts.push(`L${cx.toFixed(1)},${cy.toFixed(1)}`);
        }
        // Close: go backward along bottom line
        const closePts: string[] = [];
        for (let j = i - 1; j >= 0; j--) {
          if (j < i - 1 && !isTarget(j)) break;
          closePts.push(`L${toX(j).toFixed(1)},${toY(getBotVal(j)).toFixed(1)}`);
        }
        if (closePts.length > 0) segments.push(pathPts.join(" ") + " " + closePts.join(" ") + " Z");
        pathPts = [];
        inRegion = false;
      }
    }
  }
  if (inRegion && pathPts.length > 0) {
    const closePts: string[] = [];
    for (let j = n - 1; j >= 0; j--) {
      if (!isTarget(j)) break;
      closePts.push(`L${toX(j).toFixed(1)},${toY(getBotVal(j)).toFixed(1)}`);
    }
    if (closePts.length > 0) segments.push(pathPts.join(" ") + " " + closePts.join(" ") + " Z");
  }
  return segments.join(" ");
}

export function MarketBreadthChart({ history, currentUp, currentDown, currentFlat }: MarketBreadthChartProps) {
  // Merge current live data
  const data = useMemo(() => {
    if (currentUp === 0 && currentDown === 0 && history.length === 0) return [];
    if (history.length === 0) {
      return [{ time: formatNowTime(), totalUp: currentUp, totalDown: currentDown, totalFlat: currentFlat, limitUp: 0, limitDown: 0 }];
    }
    const last = history[history.length - 1];
    if (last.totalUp !== currentUp || last.totalDown !== currentDown) {
      return [...history, { time: formatNowTime(), totalUp: currentUp, totalDown: currentDown, totalFlat: currentFlat, limitUp: 0, limitDown: 0 }];
    }
    return history;
  }, [history, currentUp, currentDown, currentFlat]);

  // ── All chart computations in a single useMemo (before early returns) ──
  const chart = useMemo(() => {
    if (data.length < 2) return null;

    const w = 640, h = 280;
    const px = 46, pr = 10, pt = 20, pb = 34;
    const chartW = w - px - pr;
    const chartH = h - pt - pb;

    const allValues = data.flatMap(d => [d.totalUp, d.totalDown]);
    const yMax = Math.max(...allValues, 100);
    const yNiceMax = Math.ceil(yMax / 500) * 500 || 500;
    const yPad = yNiceMax * 0.08;
    const yTop = yNiceMax + yPad;
    const yBottom = -yPad;
    const yRange = yTop - yBottom;

    const toX = (i: number) => px + (i / (data.length - 1)) * chartW;
    const toY = (v: number) => pt + (1 - (v - yBottom) / yRange) * chartH;

    const upSmooth = smoothCurvePath(data.map(d => d.totalUp), toX, toY);
    const downSmooth = smoothCurvePath(data.map(d => d.totalDown), toX, toY);
    const betweenRed = buildBetweenArea(data, toX, toY, "upDominant");
    const betweenGreen = buildBetweenArea(data, toX, toY, "downDominant");

    // X ticks
    const tickInterval = Math.max(1, Math.floor(data.length / 6));
    const xTicks: { x: number; label: string }[] = [];
    for (let i = 0; i < data.length; i++) {
      if (i % tickInterval === 0 || i === data.length - 1) xTicks.push({ x: toX(i), label: data[i].time });
    }

    // Y ticks
    const yStep = Math.ceil(yNiceMax / 4 / 500) * 500 || 500;
    const yTicks: { y: number; label: string }[] = [];
    for (let v = 0; v <= yNiceMax; v += yStep) yTicks.push({ y: toY(v), label: v === 0 ? "0" : `${v}` });

    const labelInterval = data.length <= 6 ? 1 : Math.max(1, Math.floor(data.length / 6));

    return {
      w, h, px, pr, pt, pb, chartW, chartH,
      toX, toY, upSmooth, downSmooth,
      betweenRed, betweenGreen,
      xTicks, yTicks, labelInterval,
    };
  }, [data]);

  const lastPt = data[data.length - 1];
  const diff = lastPt ? lastPt.totalUp - lastPt.totalDown : 0;
  const total = lastPt ? lastPt.totalUp + lastPt.totalDown + currentFlat || 1 : 1;
  const ratio = lastPt ? ((lastPt.totalUp / total) * 100).toFixed(1) : "50.0";

  // ── No data at all ──
  if (data.length === 0) {
    return (
      <Card className="border overflow-hidden">
        <CardContent className="p-3">
          <div className="text-xs text-muted-foreground text-center py-8">等待涨跌家数数据...</div>
        </CardContent>
      </Card>
    );
  }

  // ── Single data point ──
  if (data.length === 1 || !chart) {
    const pt0 = data[0];
    const sDiff = pt0.totalUp - pt0.totalDown;
    const sTotal = pt0.totalUp + pt0.totalDown + pt0.totalFlat || 1;
    const sRatio = ((pt0.totalUp / sTotal) * 100).toFixed(1);

    return (
      <Card className="border overflow-hidden">
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-foreground/80">涨跌家数分时</span>
            <span className="text-[10px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">第1个数据点</span>
          </div>
          <div className="flex items-center justify-center gap-6 py-4">
            <div className="text-center">
              <div className="text-2xl font-extrabold tabular-nums" style={{ color: UP_COLOR }}>{pt0.totalUp}</div>
              <div className="text-[10px] font-medium mt-0.5" style={{ color: UP_COLOR, opacity: 0.7 }}>上涨</div>
            </div>
            <div className="text-muted-foreground/30 text-xl font-light">:</div>
            <div className="text-center">
              <div className="text-2xl font-extrabold tabular-nums" style={{ color: DOWN_COLOR }}>{pt0.totalDown}</div>
              <div className="text-[10px] font-medium mt-0.5" style={{ color: DOWN_COLOR, opacity: 0.7 }}>下跌</div>
            </div>
            <div className="ml-4 pl-4 border-l border-border/60">
              <div className="text-2xl font-extrabold tabular-nums" style={{ color: sDiff >= 0 ? UP_COLOR : DOWN_COLOR }}>
                {sDiff >= 0 ? "+" : ""}{sDiff}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">涨跌差</div>
            </div>
          </div>
          <div className="h-3 w-full rounded-full overflow-hidden flex bg-muted/30">
            <div className="h-full rounded-l-full transition-all duration-500" style={{ width: `${sRatio}%`, backgroundColor: UP_COLOR, opacity: 0.8 }} />
            <div className="h-full rounded-r-full transition-all duration-500" style={{ width: `${100 - parseFloat(sRatio)}%`, backgroundColor: DOWN_COLOR, opacity: 0.8 }} />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[9px] font-bold tabular-nums" style={{ color: UP_COLOR }}>{sRatio}%</span>
            <span className="text-[9px] font-bold tabular-nums" style={{ color: DOWN_COLOR }}>{(100 - parseFloat(sRatio)).toFixed(1)}%</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Multi-point chart ──
  const { w, h, px: cPx, pt: cPt, pb: cPb, chartW: cW,
    toX, toY, upSmooth, downSmooth,
    betweenRed, betweenGreen,
    xTicks, yTicks, labelInterval } = chart;
  const lastX = toX(data.length - 1);

  return (
    <Card className="border overflow-hidden">
      <CardContent className="p-3">
        {/* Header with live stats */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-foreground/80">涨跌家数分时</span>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded"
              style={{ backgroundColor: `${UP_COLOR}18`, color: UP_COLOR }}>
              <span className="inline-block w-3 h-1 rounded-full" style={{ backgroundColor: UP_COLOR }} />
              涨 {lastPt.totalUp}
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded"
              style={{ backgroundColor: `${DOWN_COLOR}18`, color: DOWN_COLOR }}>
              <span className="inline-block w-3 h-1 rounded-full" style={{ backgroundColor: DOWN_COLOR }} />
              跌 {lastPt.totalDown}
            </span>
            <span className="inline-flex items-center text-xs font-bold px-2 py-0.5 rounded"
              style={{ backgroundColor: diff >= 0 ? `${UP_COLOR}12` : `${DOWN_COLOR}12`, color: diff >= 0 ? UP_COLOR : DOWN_COLOR }}>
              差{diff >= 0 ? "+" : ""}{diff}
            </span>
          </div>
        </div>

        {/* SVG Chart */}
        <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: 280 }}>
          <defs>
            <linearGradient id="betweenRed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={UP_COLOR} stopOpacity="0.28" />
              <stop offset="100%" stopColor={UP_COLOR} stopOpacity="0.04" />
            </linearGradient>
            <linearGradient id="betweenGreen" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={DOWN_COLOR} stopOpacity="0.28" />
              <stop offset="100%" stopColor={DOWN_COLOR} stopOpacity="0.04" />
            </linearGradient>
            <filter id="upGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feFlood floodColor={UP_COLOR} floodOpacity="0.25" />
              <feComposite in2="blur" operator="in" />
              <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="downGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feFlood floodColor={DOWN_COLOR} floodOpacity="0.25" />
              <feComposite in2="blur" operator="in" />
              <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Background grid */}
          {yTicks.map((t, i) => (
            <line key={`yg-${i}`} x1={cPx} y1={t.y} x2={cPx + cW} y2={t.y}
              stroke="currentColor" className="text-border" strokeWidth={0.3}
              strokeDasharray={t.label === "0" ? "none" : "3,4"} />
          ))}

          {/* Between-lines area fills */}
          {betweenRed && <path d={betweenRed} fill="url(#betweenRed)" />}
          {betweenGreen && <path d={betweenGreen} fill="url(#betweenGreen)" />}

          {/* Up line with glow */}
          <path d={upSmooth} fill="none" stroke={UP_COLOR} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" filter="url(#upGlow)" />
          {/* Down line with glow */}
          <path d={downSmooth} fill="none" stroke={DOWN_COLOR} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" filter="url(#downGlow)" />

          {/* Data point dots & pill labels */}
          {data.map((d, i) => {
            const x = toX(i);
            const yUp = toY(d.totalUp);
            const yDown = toY(d.totalDown);
            const isLast = i === data.length - 1;
            const isFirst = i === 0;
            const showLabel = isFirst || isLast || i % labelInterval === 0;
            const linesClose = Math.abs(yUp - yDown) < 20;

            return (
              <g key={`pt-${i}`}>
                <circle cx={x} cy={yUp} r={isLast ? 3 : 1.8} fill={UP_COLOR} />
                {isLast && <circle cx={x} cy={yUp} r={1.5} fill="#fff" opacity={0.6} />}
                <circle cx={x} cy={yDown} r={isLast ? 3 : 1.8} fill={DOWN_COLOR} />
                {isLast && <circle cx={x} cy={yDown} r={1.5} fill="#fff" opacity={0.6} />}

                {showLabel && (
                  <>
                    {/* Up pill */}
                    <rect x={x - 18} y={yUp - (linesClose ? 19 : 15) - 11}
                      width={36} height={13} rx={3} fill={UP_COLOR} opacity={0.92} />
                    <text x={x} y={yUp - (linesClose ? 19 : 15) - 4.5}
                      textAnchor="middle" fontSize={9} fontFamily="monospace" fontWeight={800}
                      fill="#fff" dominantBaseline="middle">{d.totalUp}</text>
                    {/* Down pill */}
                    <rect x={x - 18} y={yDown + (linesClose ? 7 : 7)}
                      width={36} height={13} rx={3} fill={DOWN_COLOR} opacity={0.92} />
                    <text x={x} y={yDown + (linesClose ? 7 : 7) + 6.5}
                      textAnchor="middle" fontSize={9} fontFamily="monospace" fontWeight={800}
                      fill="#fff" dominantBaseline="middle">{d.totalDown}</text>
                  </>
                )}
              </g>
            );
          })}

          {/* End pulse — Up */}
          <circle cx={lastX} cy={toY(lastPt.totalUp)} r={4} fill={UP_COLOR} opacity={0.2}>
            <animate attributeName="r" values="4;10;4" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.2;0.05;0.2" dur="2s" repeatCount="indefinite" />
          </circle>
          {/* End pulse — Down */}
          <circle cx={lastX} cy={toY(lastPt.totalDown)} r={4} fill={DOWN_COLOR} opacity={0.2}>
            <animate attributeName="r" values="4;10;4" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.2;0.05;0.2" dur="2s" repeatCount="indefinite" />
          </circle>

          {/* Y-axis labels */}
          {yTicks.map((t, i) => (
            <text key={`yl-${i}`} x={cPx - 5} y={t.y} textAnchor="end" dominantBaseline="middle"
              fontSize={7.5} fontFamily="monospace" fill="currentColor" className="text-muted-foreground/70">
              {t.label}
            </text>
          ))}

          {/* X-axis with tick marks */}
          {xTicks.map((t, i) => (
            <g key={`xl-${i}`}>
              <line x1={t.x} y1={h - cPb} x2={t.x} y2={h - cPb + 4}
                stroke="currentColor" className="text-foreground/30" strokeWidth={0.6} />
              <text x={t.x} y={h - 7} textAnchor="middle"
                fontSize={10} fontFamily="monospace" fontWeight={700} fill="currentColor" className="text-foreground/80">
                {t.label}
              </text>
            </g>
          ))}

          {/* Axes */}
          <line x1={cPx} y1={cPt} x2={cPx} y2={h - cPb} stroke="currentColor" className="text-border" strokeWidth={0.5} />
          <line x1={cPx} y1={h - cPb} x2={cPx + cW} y2={h - cPb} stroke="currentColor" className="text-border" strokeWidth={0.5} />
        </svg>

        {/* Bottom ratio bar */}
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[10px] font-bold tabular-nums w-9 text-right" style={{ color: UP_COLOR }}>{ratio}%</span>
          <div className="flex-1 h-3 rounded-full overflow-hidden flex bg-muted/30 relative">
            <div className="h-full rounded-l-full transition-all duration-700" style={{ width: `${ratio}%`, backgroundColor: UP_COLOR, opacity: 0.75 }} />
            <div className="h-full rounded-r-full transition-all duration-700" style={{ width: `${100 - parseFloat(ratio)}%`, backgroundColor: DOWN_COLOR, opacity: 0.75 }} />
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-muted-foreground/20 -translate-x-1/2" />
          </div>
          <span className="text-[10px] font-bold tabular-nums w-9" style={{ color: DOWN_COLOR }}>{(100 - parseFloat(ratio)).toFixed(1)}%</span>
        </div>
      </CardContent>
    </Card>
  );
}
