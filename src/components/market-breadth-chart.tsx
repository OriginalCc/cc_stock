"use client";

import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { ALL_TRADE_TIMES } from "@/lib/trading-times";

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

// ── Key time labels (same as TimeSharingPanel) ──
const KEY_TIMES = ["09:30", "10:00", "10:30", "11:00", "11:30", "13:00", "13:30", "14:00", "14:30", "15:00"];

// ── Pre-compute ALL_TRADE_TIMES index lookup ──
const TIME_INDEX_MAP = new Map<string, number>();
ALL_TRADE_TIMES.forEach((t, i) => TIME_INDEX_MAP.set(t, i));
const TOTAL_SLOTS = ALL_TRADE_TIMES.length; // 242

function formatNowTime(): string {
  const now = new Date();
  const h = (now.getUTCHours() + 8) % 24;
  const m = now.getUTCMinutes();
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Find the nearest ALL_TRADE_TIMES index for a given "HH:MM" time string */
function timeToSlotIdx(time: string): number {
  // Direct lookup first (fast path)
  const direct = TIME_INDEX_MAP.get(time);
  if (direct !== undefined) return direct;
  // Fallback: find nearest by parsing minutes
  const [hh, mm] = time.split(":").map(Number);
  const totalMin = hh * 60 + mm;
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < ALL_TRADE_TIMES.length; i++) {
    const [th, tm] = ALL_TRADE_TIMES[i].split(":").map(Number);
    const dist = Math.abs(th * 60 + tm - totalMin);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/** Catmull-Rom smooth curve through points, using absolute X positions */
function smoothCurvePath(xs: number[], values: number[], toY: (v: number) => number): string {
  const n = xs.length;
  if (n < 2) return "";
  const points = xs.map((x, i) => ({ x, y: toY(values[i]) }));
  if (n === 2) return `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)} L${points[1].x.toFixed(1)},${points[1].y.toFixed(1)}`;
  let path = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(n - 1, i + 2)];
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
  data: { totalUp: number; totalDown: number }[],
  xs: number[],
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
        const t = Math.abs(getTopVal(i - 1) - getBotVal(i - 1)) /
          (Math.abs(getTopVal(i) - getBotVal(i)) + Math.abs(getTopVal(i - 1) - getBotVal(i - 1))) || 0.5;
        const cx = xs[i - 1] + t * (xs[i] - xs[i - 1]);
        const cy = toY(getTopVal(i - 1)) + t * (toY(getTopVal(i)) - toY(getTopVal(i - 1)));
        pathPts.push(`L${cx.toFixed(1)},${cy.toFixed(1)}`);
        inRegion = true;
      }
      if (!inRegion) { inRegion = true; }
      pathPts.push(`${pathPts.length === 0 ? "M" : "L"}${xs[i].toFixed(1)},${toY(getTopVal(i)).toFixed(1)}`);
    } else {
      if (inRegion) {
        if (i > 0) {
          const t = Math.abs(getTopVal(i - 1) - getBotVal(i - 1)) /
            (Math.abs(getTopVal(i) - getBotVal(i)) + Math.abs(getTopVal(i - 1) - getBotVal(i - 1))) || 0.5;
          const cx = xs[i - 1] + t * (xs[i] - xs[i - 1]);
          const cy = toY(getTopVal(i - 1)) + t * (toY(getTopVal(i)) - toY(getTopVal(i - 1)));
          pathPts.push(`L${cx.toFixed(1)},${cy.toFixed(1)}`);
        }
        const closePts: string[] = [];
        for (let j = i - 1; j >= 0; j--) {
          if (j < i - 1 && !isTarget(j)) break;
          closePts.push(`L${xs[j].toFixed(1)},${toY(getBotVal(j)).toFixed(1)}`);
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
      closePts.push(`L${xs[j].toFixed(1)},${toY(getBotVal(j)).toFixed(1)}`);
    }
    if (closePts.length > 0) segments.push(pathPts.join(" ") + " " + closePts.join(" ") + " Z");
  }
  return segments.join(" ");
}

// ── Shared layout constants (must match TimeSharingPanel) ──
// TimeSharingPanel recharts:
//   margin: { left: 2, right: 82 }
//   YAxis width: 55 (left), 1 (right)
//   Effective left offset: 2 + 55 = 57px
//   Effective right offset: 82 + 1 = 83px
const CHART_LEFT_PX = 57;
const CHART_RIGHT_PX = 83;
const CHART_TOP_PX = 12;
const CHART_BOTTOM_PX = 20;
const CHART_HEIGHT = 190;

export function MarketBreadthChart({ history, currentUp, currentDown, currentFlat, limitUp = 0, limitDown = 0, shUp = 0, shDown = 0, szUp = 0, szDown = 0 }: MarketBreadthChartProps) {
  // ── Measure container width so SVG coords are 1:1 with pixels ──
  const svgWrapRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(640);

  const handleResize = useCallback((entries: ResizeObserverEntry[]) => {
    for (const entry of entries) {
      setContainerW(Math.round(entry.contentRect.width));
    }
  }, []);

  useEffect(() => {
    const el = svgWrapRef.current;
    if (!el) return;
    // Initial measurement
    setContainerW(Math.round(el.clientWidth));
    const ro = new ResizeObserver(handleResize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [handleResize]);

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

  // ── All chart computations in a single useMemo ──
  const chart = useMemo(() => {
    if (data.length < 2) return null;

    // viewBox width = actual container pixel width
    // This makes SVG coordinates 1:1 with screen pixels,
    // so our CHART_LEFT_PX/CHART_RIGHT_PX match recharts exactly.
    const w = containerW, h = CHART_HEIGHT;
    const px = CHART_LEFT_PX, pr = CHART_RIGHT_PX, pt = CHART_TOP_PX, pb = CHART_BOTTOM_PX;
    const chartW = w - px - pr;
    const chartH = h - pt - pb;

    // ── Map each data point to its ALL_TRADE_TIMES slot index ──
    const slotIndices = data.map(d => timeToSlotIdx(d.time));
    const idxMin = 0;
    const idxMax = TOTAL_SLOTS - 1; // 241

    // X mapping: slot index → pixel position
    const slotToX = (slotIdx: number) => px + ((slotIdx - idxMin) / (idxMax - idxMin)) * chartW;
    const toX = (i: number) => slotToX(slotIndices[i]);

    // Pre-compute absolute X positions for all data points
    const xs = data.map((_, i) => toX(i));

    const allValues = data.flatMap(d => [d.totalUp, d.totalDown]);
    const yMax = Math.max(...allValues, 100);
    const yNiceMax = Math.ceil(yMax / 500) * 500 || 500;
    const yPad = yNiceMax * 0.08;
    const yTop = yNiceMax + yPad;
    const yBottom = -yPad;
    const yRange = yTop - yBottom;

    const toY = (v: number) => pt + (1 - (v - yBottom) / yRange) * chartH;

    const upSmooth = smoothCurvePath(xs, data.map(d => d.totalUp), toY);
    const downSmooth = smoothCurvePath(xs, data.map(d => d.totalDown), toY);
    const betweenRed = buildBetweenArea(data, xs, toY, "upDominant");
    const betweenGreen = buildBetweenArea(data, xs, toY, "downDominant");

    // X ticks: use KEY_TIMES aligned with TimeSharingPanel
    const xTicks = KEY_TIMES
      .map(t => {
        const slotIdx = TIME_INDEX_MAP.get(t);
        if (slotIdx === undefined) return null;
        return { x: slotToX(slotIdx), label: t };
      })
      .filter(Boolean) as { x: number; label: string }[];

    // Y ticks
    const yStep = Math.ceil(yNiceMax / 4 / 500) * 500 || 500;
    const yTicks: { y: number; label: string }[] = [];
    for (let v = 0; v <= yNiceMax; v += yStep) yTicks.push({ y: toY(v), label: v === 0 ? "0" : `${v}` });

    // Label interval for data point labels (show fewer labels to avoid clutter)
    const labelInterval = data.length <= 6 ? 1 : Math.max(1, Math.floor(data.length / 6));

    return {
      w, h, px, pr, pt, pb, chartW, chartH,
      toX, toY, xs, slotToX,
      upSmooth, downSmooth,
      betweenRed, betweenGreen,
      xTicks, yTicks, labelInterval,
      lastX: xs[xs.length - 1],
    };
  }, [data, containerW]);

  const lastPt = data[data.length - 1];
  const diff = lastPt ? lastPt.totalUp - lastPt.totalDown : 0;
  const total = lastPt ? lastPt.totalUp + lastPt.totalDown + currentFlat || 1 : 1;
  const ratio = lastPt ? ((lastPt.totalUp / total) * 100).toFixed(1) : "50.0";
  const isBullish = currentUp > currentDown;

  // ── Summary stats row (shared across all states) ──
  const hasSecondaryRow = (limitUp > 0 || limitDown > 0) || (shUp > 0 || szUp > 0);
  const summaryRow = (
    <div className={`flex flex-col ${hasSecondaryRow ? 'gap-1' : ''}`}>
      {/* Row 1: 涨/跌/平 — main numbers, larger font */}
      <div className="flex items-center gap-3">
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
      </div>
      {/* Row 2: 涨停/跌停 + 沪/深/差 — secondary info */}
      {hasSecondaryRow && (
        <div className="flex items-center gap-2">
          {(limitUp > 0 || limitDown > 0) && (
            <div className="flex items-center gap-2">
              {limitUp > 0 && (
                <span className="text-[10px] text-red-500 font-medium tabular-nums">涨停 {limitUp}</span>
              )}
              {limitDown > 0 && (
                <span className="text-[10px] text-green-500 font-medium tabular-nums">跌停 {limitDown}</span>
              )}
            </div>
          )}
          {(shUp > 0 || szUp > 0) && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pl-2 border-l border-border">
              <span className="tabular-nums">沪 {shUp}:{shDown}</span>
              <span className="text-muted-foreground/30">|</span>
              <span className="tabular-nums">深 {szUp}:{szDown}</span>
              <span className="text-muted-foreground/30">|</span>
              <span className="font-medium tabular-nums" style={{ color: diff >= 0 ? UP_COLOR : DOWN_COLOR }}>差 {diff >= 0 ? "+" : ""}{diff}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ── Shared card class ──
  const cardCls = `bg-card rounded-lg border border-border overflow-hidden ${isBullish ? 'bg-red-500/5 border-red-500/20' : 'bg-green-500/5 border-green-500/20'}`;

  // ── No data at all ──
  if (data.length === 0) {
    return (
      <div className={cardCls}>
        <div className="px-2 pt-2 pb-1">
          <div className="text-[11px] font-semibold text-foreground/80 mb-1">市场涨跌家数</div>
          {summaryRow}
        </div>
        <div className="px-2 pb-2 pt-1">
          <div className="text-xs text-muted-foreground text-center py-3 border-t border-border/40">等待分时数据...</div>
        </div>
      </div>
    );
  }

  // ── Single data point ──
  if (data.length === 1 || !chart) {
    const pt0 = data[0];
    const sDiff = pt0.totalUp - pt0.totalDown;
    const sTotal = pt0.totalUp + pt0.totalDown + pt0.totalFlat || 1;
    const sRatio = ((pt0.totalUp / sTotal) * 100).toFixed(1);

    return (
      <div className={cardCls}>
        <div className="px-2 pt-2 pb-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-foreground/80">市场涨跌家数</span>
            <span className="text-[9px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-full">第1个数据点</span>
          </div>
          {summaryRow}
          <div className="h-2.5 w-full rounded-full overflow-hidden flex bg-muted/30 mt-1.5">
            <div className="h-full rounded-l-full transition-all duration-500" style={{ width: `${sRatio}%`, backgroundColor: UP_COLOR, opacity: 0.8 }} />
            <div className="h-full rounded-r-full transition-all duration-500" style={{ width: `${100 - parseFloat(sRatio)}%`, backgroundColor: DOWN_COLOR, opacity: 0.8 }} />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[9px] font-bold tabular-nums" style={{ color: UP_COLOR }}>{sRatio}%</span>
            <span className="text-[9px] font-bold tabular-nums" style={{ color: DOWN_COLOR }}>{(100 - parseFloat(sRatio)).toFixed(1)}%</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Multi-point chart ──
  const { w, h, px: cPx, pt: cPt, pb: cPb, chartW: cW,
    toX, toY, xs, slotToX,
    upSmooth, downSmooth,
    betweenRed, betweenGreen,
    xTicks, yTicks, labelInterval, lastX } = chart;

  return (
    <div className={cardCls}>
      {/* Header + summary — padded, like TimeSharingPanel's header px-3 */}
      <div className="px-2 pt-2 pb-1">
        <div className="text-[11px] font-semibold text-foreground/80 mb-1">市场涨跌家数</div>
        {summaryRow}
      </div>

      {/* SVG Chart — NO horizontal padding, spans full card width (same as recharts) */}
      <div ref={svgWrapRef} className="w-full">
        <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
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

          {/* Background grid — horizontal lines at Y tick positions */}
          {yTicks.map((t, i) => (
            <line key={`yg-${i}`} x1={cPx} y1={t.y} x2={cPx + cW} y2={t.y}
              stroke="currentColor" className="text-border" strokeWidth={0.3}
              strokeDasharray={t.label === "0" ? "none" : "3,4"} />
          ))}

          {/* Vertical grid at key times (same as TimeSharingPanel) */}
          {xTicks.map((t, i) => (
            <line key={`xg-${i}`} x1={t.x} y1={cPt} x2={t.x} y2={h - cPb}
              stroke="currentColor" className="text-border" strokeWidth={0.3} strokeDasharray="3,4" />
          ))}

          {/* Between-lines area fills */}
          {betweenRed && <path d={betweenRed} fill="url(#betweenRed)" />}
          {betweenGreen && <path d={betweenGreen} fill="url(#betweenGreen)" />}

          {/* Up line with glow */}
          <path d={upSmooth} fill="none" stroke={UP_COLOR} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" filter="url(#upGlow)" />
          {/* Down line with glow */}
          <path d={downSmooth} fill="none" stroke={DOWN_COLOR} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" filter="url(#downGlow)" />

          {/* Pre-compute label visibility: anti-overlap algorithm */}
          {(() => {
            // Pill half-width is 16px, so two pills need ≥36px between their centers
            const MIN_LABEL_GAP_PX = 36;
            const lastIdx = data.length - 1;
            const labeledIndices: number[] = [];
            let lastLabeledX = -Infinity;

            for (let i = 0; i < data.length; i++) {
              const isLast = i === lastIdx;
              const isFirst = i === 0;
              const isInterval = i % labelInterval === 0;
              if (!isFirst && !isLast && !isInterval) continue;

              const x = xs[i];
              // Check horizontal overlap with previous label
              if (x - lastLabeledX < MIN_LABEL_GAP_PX) {
                // Too close; skip unless this is the last point
                if (isLast) {
                  // Remove the previous label to make room for the last
                  if (labeledIndices.length > 0 && xs[labeledIndices[labeledIndices.length - 1]] + MIN_LABEL_GAP_PX > x) {
                    labeledIndices.pop();
                  }
                } else {
                  continue;
                }
              }
              labeledIndices.push(i);
              lastLabeledX = x;
            }
            return labeledIndices;
          })().map((i) => {
            const d = data[i];
            const x = xs[i];
            const yUp = toY(d.totalUp);
            const yDown = toY(d.totalDown);
            const isLast = i === data.length - 1;
            const pillH = 11;

            // Determine which line is visually on top (lower y = higher on screen)
            const upIsOnTop = yUp <= yDown;
            const yTop = upIsOnTop ? yUp : yDown;
            const yBot = upIsOnTop ? yDown : yUp;

            const baseUpOff = 22;
            const baseDownOff = 10;
            const minGap = 6;

            const topPillBottom = yTop - baseUpOff + pillH;
            const botPillTop = yBot + baseDownOff;
            const currentGap = botPillTop - topPillBottom;

            let topOff = baseUpOff;
            let botOff = baseDownOff;
            if (currentGap < minGap) {
              const extra = (minGap - currentGap) / 2 + 1;
              topOff += extra;
              botOff += extra;
            }

            let upPillY: number, downPillY: number;
            let upDashY1: number, upDashY2: number;
            let downDashY1: number, downDashY2: number;

            if (upIsOnTop) {
              upPillY = yUp - topOff;
              downPillY = yDown + botOff;
              upDashY1 = yUp; upDashY2 = upPillY + pillH;
              downDashY1 = yDown; downDashY2 = downPillY;
            } else {
              downPillY = yDown - topOff;
              upPillY = yUp + botOff;
              downDashY1 = yDown; downDashY2 = downPillY + pillH;
              upDashY1 = yUp; upDashY2 = upPillY;
            }

            return (
              <g key={`pt-${i}`}>
                <circle cx={x} cy={yUp} r={isLast ? 2.5 : 1.4} fill={UP_COLOR} />
                {isLast && <circle cx={x} cy={yUp} r={1} fill="#fff" opacity={0.6} />}
                <circle cx={x} cy={yDown} r={isLast ? 2.5 : 1.4} fill={DOWN_COLOR} />
                {isLast && <circle cx={x} cy={yDown} r={1} fill="#fff" opacity={0.6} />}

                <line x1={x} y1={upDashY1} x2={x} y2={upDashY2}
                  stroke={UP_COLOR} strokeWidth={0.4} strokeDasharray="2,2" opacity={0.4} />
                <line x1={x} y1={downDashY1} x2={x} y2={downDashY2}
                  stroke={DOWN_COLOR} strokeWidth={0.4} strokeDasharray="2,2" opacity={0.4} />

                <rect x={x - 16} y={upPillY}
                  width={32} height={pillH} rx={2.5} fill={UP_COLOR} opacity={0.88} />
                <text x={x} y={upPillY + pillH / 2}
                  textAnchor="middle" fontSize={9} fontFamily="monospace" fontWeight={700}
                  fill="#fff" dominantBaseline="middle">{d.totalUp}</text>
                <rect x={x - 16} y={downPillY}
                  width={32} height={pillH} rx={2.5} fill={DOWN_COLOR} opacity={0.88} />
                <text x={x} y={downPillY + pillH / 2}
                  textAnchor="middle" fontSize={9} fontFamily="monospace" fontWeight={700}
                  fill="#fff" dominantBaseline="middle">{d.totalDown}</text>
              </g>
            );
          })}

          {/* End pulse — Up */}
          <circle cx={lastX} cy={toY(lastPt.totalUp)} r={3} fill={UP_COLOR} opacity={0.15}>
            <animate attributeName="r" values="3;8;3" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.15;0.04;0.15" dur="2s" repeatCount="indefinite" />
          </circle>
          {/* End pulse — Down */}
          <circle cx={lastX} cy={toY(lastPt.totalDown)} r={3} fill={DOWN_COLOR} opacity={0.15}>
            <animate attributeName="r" values="3;8;3" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.15;0.04;0.15" dur="2s" repeatCount="indefinite" />
          </circle>

          {/* Y-axis labels */}
          {yTicks.map((t, i) => (
            <text key={`yl-${i}`} x={cPx - 5} y={t.y} textAnchor="end" dominantBaseline="middle"
              fontSize={7.5} fontFamily="monospace" fill="currentColor" className="text-muted-foreground/70">
              {t.label}
            </text>
          ))}

          {/* X-axis with tick marks (same key times as TimeSharingPanel) */}
          {xTicks.map((t, i) => (
            <g key={`xl-${i}`}>
              <line x1={t.x} y1={h - cPb} x2={t.x} y2={h - cPb + 3}
                stroke="currentColor" className="text-foreground/30" strokeWidth={0.4} />
              <text x={t.x} y={h - 7} textAnchor="middle"
                fontSize={8.5} fontFamily="monospace" fontWeight={600} fill="currentColor" className="text-foreground/80">
                {t.label}
              </text>
            </g>
          ))}

          {/* Axes */}
          <line x1={cPx} y1={cPt} x2={cPx} y2={h - cPb} stroke="currentColor" className="text-border" strokeWidth={0.3} />
          <line x1={cPx} y1={h - cPb} x2={cPx + cW} y2={h - cPb} stroke="currentColor" className="text-border" strokeWidth={0.3} />
        </svg>
      </div>

      {/* Bottom ratio bar — padded */}
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
