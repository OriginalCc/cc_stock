"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
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

/** Format current time as HH:MM:SS (China timezone) */
function formatTimeHMS(): string {
  const now = new Date();
  const h = (now.getUTCHours() + 8) % 24;
  const m = now.getUTCMinutes();
  const s = now.getUTCSeconds();
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Get today's date string (China timezone) */
function getTodayStr(): string {
  const now = new Date();
  const utcNow = now.getTime();
  const chinaOffset = 8 * 60 * 60 * 1000;
  const d = new Date(utcNow + chinaOffset);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Normalize server time (HH:MM) to HH:MM:SS for consistent comparison */
function normalizeTime(time: string): string {
  const parts = time.split(":");
  if (parts.length === 2) return time + ":00";
  return time;
}

/** Strip seconds for display: HH:MM:SS → HH:MM */
function displayTime(time: string): string {
  return time.length > 5 ? time.slice(0, 5) : time;
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
        if (i > 0) {
          const t = Math.abs(getTopVal(i - 1) - getBotVal(i - 1)) /
            (Math.abs(getTopVal(i) - getBotVal(i)) + Math.abs(getTopVal(i - 1) - getBotVal(i - 1))) || 0.5;
          const cx = toX(i - 1) + t * (toX(i) - toX(i - 1));
          const cy = toY(getTopVal(i - 1)) + t * (toY(getTopVal(i)) - toY(getTopVal(i - 1)));
          pathPts.push(`L${cx.toFixed(1)},${cy.toFixed(1)}`);
        }
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

export function MarketBreadthChart({ history, currentUp, currentDown, currentFlat, limitUp = 0, limitDown = 0, shUp = 0, shDown = 0, szUp = 0, szDown = 0 }: MarketBreadthChartProps) {
  // ── Client-side accumulation for real-time time-sharing chart ──
  // Server provides 1-min snapshots (HH:MM); we accumulate sub-minute points (HH:MM:SS) from each 15s poll
  const [timeline, setTimeline] = useState<BreadthHistoryPoint[]>([]);
  const lastDateRef = useRef("");

  useEffect(() => {
    const todayStr = getTodayStr();

    setTimeline(prev => {
      // Reset on new day
      if (lastDateRef.current && lastDateRef.current !== todayStr) {
        lastDateRef.current = todayStr;
        if (history.length > 0) {
          return history.map(p => ({ ...p, time: normalizeTime(p.time) }));
        }
        return [];
      }
      lastDateRef.current = todayStr;

      // Step 1: Initialize from server history if client timeline is empty
      if (prev.length === 0 && history.length > 0) {
        const base = history.map(p => ({ ...p, time: normalizeTime(p.time) }));
        // Also add current live point
        if (currentUp > 0 || currentDown > 0) {
          const nowTime = formatTimeHMS();
          const last = base[base.length - 1];
          if (!last || nowTime > last.time) {
            return [...base, { time: nowTime, totalUp: currentUp, totalDown: currentDown, totalFlat: currentFlat, limitUp: 0, limitDown: 0 }];
          }
          if (last.totalUp !== currentUp || last.totalDown !== currentDown) {
            return [...base.slice(0, -1), { ...last, totalUp: currentUp, totalDown: currentDown, totalFlat: currentFlat }];
          }
        }
        return base;
      }

      // Step 2: Merge new server points into client timeline
      let merged = prev;
      if (history.length > 0) {
        const normalizedHistory = history.map(p => ({ ...p, time: normalizeTime(p.time) }));
        const prevTimeSet = new Set(prev.map(p => p.time));
        const newServerPts = normalizedHistory.filter(sp => !prevTimeSet.has(sp.time));

        if (newServerPts.length > 0) {
          // Insert new server points at correct positions
          const combined = [...prev, ...newServerPts];
          combined.sort((a, b) => a.time.localeCompare(b.time));
          merged = combined;
        }
      }

      // Step 3: Add current live data point (sub-minute resolution)
      if (currentUp > 0 || currentDown > 0) {
        const nowTime = formatTimeHMS();
        const last = merged[merged.length - 1];

        if (!last || nowTime > last.time) {
          // Time advanced → append new point (sub-minute resolution!)
          return [...merged, { time: nowTime, totalUp: currentUp, totalDown: currentDown, totalFlat: currentFlat, limitUp: 0, limitDown: 0 }];
        }
        if (last.totalUp !== currentUp || last.totalDown !== currentDown) {
          // Same second but values changed → update last point
          return [...merged.slice(0, -1), { ...last, totalUp: currentUp, totalDown: currentDown, totalFlat: currentFlat }];
        }
      } else if (currentUp === 0 && currentDown === 0 && history.length === 0) {
        return [];
      }

      return merged;
    });
  }, [history, currentUp, currentDown, currentFlat]);

  const data = timeline;

  // ── Chart computations ──
  const chart = useMemo(() => {
    if (data.length < 2) return null;

    const w = 640, h = 280;
    const px = 46, pr = 10, pt = 20, pb = 26;
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

    // X ticks: show HH:MM labels at regular intervals
    const minutes = [...new Set(data.map(d => displayTime(d.time)))];
    const tickInterval = Math.max(1, Math.floor(minutes.length / 6));
    const xTicks: { x: number; label: string }[] = [];
    const selectedMinutes = minutes.filter((_, i) => i % tickInterval === 0 || i === minutes.length - 1);
    for (const min of selectedMinutes) {
      const idx = data.findIndex(d => displayTime(d.time) === min);
      if (idx >= 0) {
        xTicks.push({ x: toX(idx), label: min });
      }
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
  const diffColor = diff >= 0 ? UP_COLOR : DOWN_COLOR;
  const total = lastPt ? lastPt.totalUp + lastPt.totalDown + currentFlat || 1 : 1;
  const ratio = lastPt ? ((lastPt.totalUp / total) * 100).toFixed(1) : "50.0";
  const isBullish = currentUp > currentDown;

  const cardCls = `bg-card rounded-lg border border-border overflow-hidden ${isBullish ? 'bg-red-500/5 border-red-500/20' : 'bg-green-500/5 border-green-500/20'}`;

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
            <span className="text-[10px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full animate-pulse">采集数据中...</span>
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
        </div>
        <div className="px-2 pb-2 pt-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-bold tabular-nums w-8 text-right" style={{ color: UP_COLOR }}>{sRatio}%</span>
            <div className="flex-1 h-3 rounded-full overflow-hidden flex bg-muted/30 relative">
              <div className="h-full rounded-l-full transition-all duration-500" style={{ width: `${sRatio}%`, backgroundColor: UP_COLOR, opacity: 0.8 }} />
              <div className="h-full rounded-r-full transition-all duration-500" style={{ width: `${100 - parseFloat(sRatio)}%`, backgroundColor: DOWN_COLOR, opacity: 0.8 }} />
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-muted-foreground/20 -translate-x-1/2" />
            </div>
            <span className="text-[9px] font-bold tabular-nums w-8" style={{ color: DOWN_COLOR }}>{(100 - parseFloat(sRatio)).toFixed(1)}%</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Multi-point chart (real-time time-sharing) ──
  const { w, h, px: cPx, pt: cPt, pb: cPb, chartW: cW,
    toX, toY, upSmooth, downSmooth,
    betweenRed, betweenGreen,
    xTicks, yTicks, labelInterval } = chart;
  const lastX = toX(data.length - 1);

  return (
    <div className={cardCls}>
      {/* Header with live stats */}
      <div className="px-2 pt-2 pb-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold text-foreground/80">市场涨跌家数</span>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded"
              style={{ backgroundColor: `${UP_COLOR}18`, color: UP_COLOR }}>
              <span className="inline-block w-2.5 h-1 rounded-full" style={{ backgroundColor: UP_COLOR }} />
              涨 {lastPt.totalUp}
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded"
              style={{ backgroundColor: `${DOWN_COLOR}18`, color: DOWN_COLOR }}>
              <span className="inline-block w-2.5 h-1 rounded-full" style={{ backgroundColor: DOWN_COLOR }} />
              跌 {lastPt.totalDown}
            </span>
            <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded"
              style={{ backgroundColor: diff >= 0 ? `${UP_COLOR}12` : `${DOWN_COLOR}12`, color: diff >= 0 ? UP_COLOR : DOWN_COLOR }}>
              差{diff >= 0 ? "+" : ""}{diff}
            </span>
            <span className="text-[9px] text-muted-foreground tabular-nums">{data.length}点</span>
          </div>
        </div>
        {/* Extra stats row */}
        <div className="flex items-center gap-3">
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
            </div>
          )}
        </div>
      </div>

      {/* SVG Chart */}
      <div className="px-2">
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
                <circle cx={x} cy={yUp} r={isLast ? 3 : 1} fill={UP_COLOR} opacity={isLast ? 1 : 0.4} />
                <circle cx={x} cy={yDown} r={isLast ? 3 : 1} fill={DOWN_COLOR} opacity={isLast ? 1 : 0.4} />

                {isLast && (
                  <>
                    <circle cx={x} cy={yUp} r={1.5} fill="#fff" opacity={0.6} />
                    <circle cx={x} cy={yDown} r={1.5} fill="#fff" opacity={0.6} />
                  </>
                )}

                {showLabel && (
                  <>
                    <rect x={x - 15} y={yUp - (linesClose ? 17 : 13) - 10}
                      width={30} height={11} rx={3} fill={UP_COLOR} opacity={0.92} />
                    <text x={x} y={yUp - (linesClose ? 17 : 13) - 4.5}
                      textAnchor="middle" fontSize={7} fontFamily="monospace" fontWeight={800}
                      fill="#fff" dominantBaseline="middle">{d.totalUp}</text>
                    <rect x={x - 15} y={yDown + (linesClose ? 6 : 6)}
                      width={30} height={11} rx={3} fill={DOWN_COLOR} opacity={0.92} />
                    <text x={x} y={yDown + (linesClose ? 6 : 6) + 5.5}
                      textAnchor="middle" fontSize={7} fontFamily="monospace" fontWeight={800}
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
              <line x1={t.x} y1={h - cPb} x2={t.x} y2={h - cPb + 3}
                stroke="currentColor" className="text-muted-foreground/40" strokeWidth={0.5} />
              <text x={t.x} y={h - 6} textAnchor="middle"
                fontSize={7.5} fontFamily="monospace" fill="currentColor" className="text-muted-foreground/70">
                {t.label}
              </text>
            </g>
          ))}

          {/* Axes */}
          <line x1={cPx} y1={cPt} x2={cPx} y2={h - cPb} stroke="currentColor" className="text-border" strokeWidth={0.5} />
          <line x1={cPx} y1={h - cPb} x2={cPx + cW} y2={h - cPb} stroke="currentColor" className="text-border" strokeWidth={0.5} />
        </svg>
      </div>

      {/* Bottom ratio bar */}
      <div className="px-2 pb-2 pt-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-bold tabular-nums w-8 text-right" style={{ color: UP_COLOR }}>{ratio}%</span>
          <div className="flex-1 h-3 rounded-full overflow-hidden flex bg-muted/30 relative">
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
