"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Customized,
} from "recharts";
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

// ── A-share trading day constants ──
const TOTAL_SLOTS = ALL_TRADE_TIMES.length; // 242
const MAX_SLOT_IDX = TOTAL_SLOTS - 1;       // 241

/** Map time string (HH:MM or HH:MM:SS) to a continuous slot position in A-share trading day */
function timeToSlot(timeStr: string): number {
  const parts = timeStr.split(":");
  const hRaw = parseInt(parts[0]);
  const mRaw = parseInt(parts[1]);
  const sRaw = parts.length > 2 ? parseInt(parts[2]) : 0;
  const h = Number.isNaN(hRaw) ? 9 : hRaw;
  const m = Number.isNaN(mRaw) ? 30 : mRaw;
  const s = Number.isNaN(sRaw) ? 0 : sRaw;

  const totalMin = h * 60 + m;

  if (totalMin < 570) return 0;
  if (totalMin <= 690) {
    return (totalMin - 570) + s / 60;
  }
  if (totalMin < 780) return 120;
  if (totalMin <= 900) {
    return 121 + (totalMin - 780) + s / 60;
  }
  return MAX_SLOT_IDX;
}

/** Format current time as HH:MM (China timezone) */
function formatTimeHM(): string {
  const now = new Date();
  const h = (now.getUTCHours() + 8) % 24;
  const m = now.getUTCMinutes();
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Get today's date string (China timezone) */
function getTodayStr(): string {
  const now = new Date();
  const utcNow = now.getTime();
  const chinaOffset = 8 * 60 * 60 * 1000;
  const d = new Date(utcNow + chinaOffset);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Catmull-Rom smooth curve through points with custom X positions */
function smoothCurvePath(
  values: number[],
  getX: (i: number) => number,
  toY: (v: number) => number,
): string {
  if (values.length < 2) return "";
  const points = values.map((v, i) => ({ x: getX(i), y: toY(v) }));
  if (points.length === 2)
    return `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)} L${points[1].x.toFixed(1)},${points[1].y.toFixed(1)}`;
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

/** Build between-lines area fill for one side */
function buildBetweenArea(
  data: BreadthHistoryPoint[],
  getX: (i: number) => number,
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
        const t =
          Math.abs(getTopVal(i - 1) - getBotVal(i - 1)) /
            (Math.abs(getTopVal(i) - getBotVal(i)) + Math.abs(getTopVal(i - 1) - getBotVal(i - 1))) || 0.5;
        const cx = getX(i - 1) + t * (getX(i) - getX(i - 1));
        const cy = toY(getTopVal(i - 1)) + t * (toY(getTopVal(i)) - toY(getTopVal(i - 1)));
        pathPts.push(`L${cx.toFixed(1)},${cy.toFixed(1)}`);
        inRegion = true;
      }
      if (!inRegion) { inRegion = true; }
      pathPts.push(`${pathPts.length === 0 ? "M" : "L"}${getX(i).toFixed(1)},${toY(getTopVal(i)).toFixed(1)}`);
    } else {
      if (inRegion) {
        if (i > 0) {
          const t =
            Math.abs(getTopVal(i - 1) - getBotVal(i - 1)) /
              (Math.abs(getTopVal(i) - getBotVal(i)) + Math.abs(getTopVal(i - 1) - getBotVal(i - 1))) || 0.5;
          const cx = getX(i - 1) + t * (getX(i) - getX(i - 1));
          const cy = toY(getTopVal(i - 1)) + t * (toY(getTopVal(i)) - toY(getTopVal(i - 1)));
          pathPts.push(`L${cx.toFixed(1)},${cy.toFixed(1)}`);
        }
        const closePts: string[] = [];
        for (let j = i - 1; j >= 0; j--) {
          if (j < i - 1 && !isTarget(j)) break;
          closePts.push(`L${getX(j).toFixed(1)},${toY(getBotVal(j)).toFixed(1)}`);
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
      closePts.push(`L${getX(j).toFixed(1)},${toY(getBotVal(j)).toFixed(1)}`);
    }
    if (closePts.length > 0) segments.push(pathPts.join(" ") + " " + closePts.join(" ") + " Z");
  }
  return segments.join(" ");
}

/** Build full-day template data (242 slots) for recharts */
function buildFullDayData(data: BreadthHistoryPoint[]) {
  const dataMap = new Map(data.map(d => [d.time, d]));
  return ALL_TRADE_TIMES.map((time, idx) => {
    const d = dataMap.get(time);
    return {
      idx,
      time,
      hasData: !!d,
      totalUp: d?.totalUp ?? 0,
      totalDown: d?.totalDown ?? 0,
      totalFlat: d?.totalFlat ?? 0,
    };
  });
}

export function MarketBreadthChart({
  history, currentUp, currentDown, currentFlat,
  limitUp = 0, limitDown = 0,
  shUp = 0, shDown = 0, szUp = 0, szDown = 0,
}: MarketBreadthChartProps) {
  // ── Client-side accumulation: merge server 1-min history with live data ──
  const [timeline, setTimeline] = useState<BreadthHistoryPoint[]>([]);
  const lastDateRef = useRef("");

  useEffect(() => {
    const todayStr = getTodayStr();

    setTimeline(prev => {
      // Reset on new day
      if (lastDateRef.current && lastDateRef.current !== todayStr) {
        lastDateRef.current = todayStr;
        if (history.length > 0) {
          return history.map(p => ({ ...p }));
        }
        return [];
      }
      lastDateRef.current = todayStr;

      // Step 1: Initialize from server history if empty
      if (prev.length === 0 && history.length > 0) {
        const base = history.map(p => ({ ...p }));
        if (currentUp > 0 || currentDown > 0) {
          const nowHM = formatTimeHM();
          const last = base[base.length - 1];
          if (!last || nowHM > last.time) {
            return [...base, { time: nowHM, totalUp: currentUp, totalDown: currentDown, totalFlat: currentFlat, limitUp: 0, limitDown: 0 }];
          }
          if (last.totalUp !== currentUp || last.totalDown !== currentDown) {
            return [...base.slice(0, -1), { ...last, totalUp: currentUp, totalDown: currentDown, totalFlat: currentFlat }];
          }
        }
        return base;
      }

      // Step 2: Merge new server history points (new minutes)
      let merged = [...prev];
      if (history.length > 0) {
        const prevTimeSet = new Set(prev.map(p => p.time));
        const newPts = history.filter(sp => !prevTimeSet.has(sp.time));
        if (newPts.length > 0) {
          merged = [...merged, ...newPts];
          merged.sort((a, b) => a.time.localeCompare(b.time));
        }
      }

      // Step 3: Update/add current live point
      if (currentUp > 0 || currentDown > 0) {
        const nowHM = formatTimeHM();
        const last = merged[merged.length - 1];

        if (!last || nowHM > last.time) {
          merged.push({ time: nowHM, totalUp: currentUp, totalDown: currentDown, totalFlat: currentFlat, limitUp: 0, limitDown: 0 });
        } else if (nowHM === last.time) {
          if (last.totalUp !== currentUp || last.totalDown !== currentDown) {
            merged = [...merged.slice(0, -1), { ...last, totalUp: currentUp, totalDown: currentDown, totalFlat: currentFlat }];
          }
        }
      } else if (currentUp === 0 && currentDown === 0 && history.length === 0) {
        return [];
      }

      return merged;
    });
  }, [history, currentUp, currentDown, currentFlat]);

  const data = timeline;

  // ── Build full-day template data for recharts ──
  const fullDayData = useMemo(() => buildFullDayData(data), [data]);

  // ── Y-axis domain ──
  const yNiceMax = useMemo(() => {
    if (data.length === 0) return 500;
    const allValues = data.flatMap(d => [d.totalUp, d.totalDown]);
    const max = Math.max(...allValues, 100);
    return Math.ceil(max / 500) * 500 || 500;
  }, [data]);

  const yStep = useMemo(() => Math.ceil(yNiceMax / 4 / 500) * 500 || 500, [yNiceMax]);
  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let v = 0; v <= yNiceMax; v += yStep) ticks.push(v);
    return ticks;
  }, [yNiceMax, yStep]);

  // ── Time ticks (same as time-sharing chart) ──
  const keyTimes = ["09:30", "10:00", "10:30", "11:00", "11:30", "13:00", "13:30", "14:00", "14:30", "15:00"];
  const timeTicks = useMemo(() =>
    keyTimes.map(t => ALL_TRADE_TIMES.indexOf(t)).filter(i => i >= 0),
  []);

  // ── Stats ──
  const lastPt = data[data.length - 1];
  const diff = lastPt ? lastPt.totalUp - lastPt.totalDown : 0;
  const total = lastPt ? lastPt.totalUp + lastPt.totalDown + currentFlat || 1 : 1;
  const ratio = lastPt ? ((lastPt.totalUp / total) * 100).toFixed(1) : "50.0";
  const isBullish = currentUp > currentDown;

  const cardCls = `bg-card rounded-lg border border-border overflow-hidden ${isBullish ? 'bg-red-500/5 border-red-500/20' : 'bg-green-500/5 border-green-500/20'}`;


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
              涨 {lastPt?.totalUp ?? currentUp}
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded"
              style={{ backgroundColor: `${DOWN_COLOR}18`, color: DOWN_COLOR }}>
              <span className="inline-block w-2.5 h-1 rounded-full" style={{ backgroundColor: DOWN_COLOR }} />
              跌 {lastPt?.totalDown ?? currentDown}
            </span>
            <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded"
              style={{ backgroundColor: diff >= 0 ? `${UP_COLOR}12` : `${DOWN_COLOR}12`, color: diff >= 0 ? UP_COLOR : DOWN_COLOR }}>
              差{diff >= 0 ? "+" : ""}{diff}
            </span>
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

      {/* Chart — using recharts for axis alignment with time-sharing chart */}
      <div className="px-2">
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart
            data={fullDayData}
            margin={{ top: 20, right: 82, left: 2, bottom: 20 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              opacity={0.15}
              vertical={false}
            />
            <XAxis
              dataKey="idx"
              type="number"
              domain={[0, MAX_SLOT_IDX]}
              ticks={timeTicks}
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={{ stroke: "hsl(var(--border))", strokeWidth: 0.5 }}
              interval={0}
              tickFormatter={(idx: number) => ALL_TRADE_TIMES[idx] || ""}
            />
            <YAxis
              domain={[0, yNiceMax]}
              ticks={yTicks}
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              width={55}
              tickFormatter={(v: number) => v === 0 ? "0" : `${v}`}
            />
            {/* Lunch break separator line */}
            <Customized component={() => {
              // This renders nothing visible but ensures recharts sets up the axes properly
              return null;
            }} />
            {/* Main chart overlay: curves, fills, dots, labels, pulse */}
            <Customized component={BreadthChartOverlay} breadthData={data} yNiceMax={yNiceMax} />
          </ComposedChart>
        </ResponsiveContainer>
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

// ── Customized component for the breadth chart overlay ──
// Renders Catmull-Rom curves, gradient fills, glow effects, data dots, pill labels, and pulse animations
// Uses recharts' xAxisMap/yAxisMap for coordinate mapping to ensure alignment with the time-sharing chart

interface BreadthOverlayProps {
  xAxisMap?: any;
  yAxisMap?: any;
  offset?: { left: number; top: number; width: number; height: number };
  breadthData?: BreadthHistoryPoint[];
  yNiceMax?: number;
}

function BreadthChartOverlay(props: BreadthOverlayProps) {
  const { xAxisMap, yAxisMap, breadthData, yNiceMax = 500 } = props;

  if (!xAxisMap || !yAxisMap || !breadthData || breadthData.length === 0) return null;

  const xAxis = Object.values(xAxisMap)[0] as any;
  const yAxis = Object.values(yAxisMap)[0] as any;
  if (!xAxis?.scale || !yAxis?.scale) return null;

  const xScale = xAxis.scale;
  const yScale = yAxis.scale;

  const data = breadthData;
  const toX = (i: number) => xScale(timeToSlot(data[i].time));
  const toY = (v: number) => yScale(v);

  // ── Smooth curves ──
  const upSmooth = data.length >= 2 ? smoothCurvePath(data.map(d => d.totalUp), toX, toY) : "";
  const downSmooth = data.length >= 2 ? smoothCurvePath(data.map(d => d.totalDown), toX, toY) : "";

  // ── Between-lines area fills ──
  const betweenRed = data.length >= 2 ? buildBetweenArea(data, toX, toY, "upDominant") : "";
  const betweenGreen = data.length >= 2 ? buildBetweenArea(data, toX, toY, "downDominant") : "";

  // ── Lunch break separator ──
  const lunchSlot = 120.5;
  const lunchX = xScale(lunchSlot);
  const plotTop = yScale(yNiceMax);
  const plotBottom = yScale(0);

  // ── Last point ──
  const lastPt = data[data.length - 1];
  const lastX = toX(data.length - 1);

  return (
    <g>
      {/* SVG Defs: gradients & filters */}
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

      {/* Lunch break separator — dashed vertical line between 11:30 and 13:00 */}
      <line x1={lunchX} y1={plotTop} x2={lunchX} y2={plotBottom}
        stroke="currentColor" className="text-muted-foreground/30" strokeWidth={0.5}
        strokeDasharray="4,3" />

      {/* Between-lines area fills */}
      {betweenRed && <path d={betweenRed} fill="url(#betweenRed)" />}
      {betweenGreen && <path d={betweenGreen} fill="url(#betweenGreen)" />}

      {/* Up line with glow */}
      {upSmooth && <path d={upSmooth} fill="none" stroke={UP_COLOR} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" filter="url(#upGlow)" />}
      {/* Down line with glow */}
      {downSmooth && <path d={downSmooth} fill="none" stroke={DOWN_COLOR} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" filter="url(#downGlow)" />}

      {/* Data point dots & pill labels — 只显示「最初」+「最新」+ 中间段3个点，避免数字挤到一起 */}
      {(() => {
        // ── 预计算哪些点需要显示标签：首点 + 末点 + 中间段均匀挑选3个 ──
        const showIdxSet = new Set<number>();
        if (data.length > 0) {
          showIdxSet.add(0);                  // 最初
          showIdxSet.add(data.length - 1);    // 最新
          // 中间段（排除首末）均匀挑选3个点
          if (data.length > 4) {
            const midStart = 1;
            const midEnd = data.length - 2;
            const midLen = midEnd - midStart + 1;
            if (midLen >= 3) {
              showIdxSet.add(midStart + Math.floor(midLen * 0.25));
              showIdxSet.add(midStart + Math.floor(midLen * 0.5));
              showIdxSet.add(midStart + Math.floor(midLen * 0.75));
            } else {
              for (let i = midStart; i <= midEnd; i++) showIdxSet.add(i);
            }
          } else {
            // 数据点很少，全部显示
            for (let i = 0; i < data.length; i++) showIdxSet.add(i);
          }
        }
        const upShow = data.map((_, i) => showIdxSet.has(i));
        const downShow = data.map((_, i) => showIdxSet.has(i));

        return data.map((d, i) => {
          const x = toX(i);
          const yUp = toY(d.totalUp);
          const yDown = toY(d.totalDown);
          const isLast = i === data.length - 1;

          const pillH = 14;
          const pillGap = 5;

          // 判断红线是否在绿线上方（SVG坐标系：y值小=视觉上方）
          const redIsAbove = yUp < yDown;

          // 红色药丸：永远远离绿线方向
          const upPillY = redIsAbove
            ? yUp - pillGap - pillH
            : yUp + pillGap;
          const upTextY = upPillY + pillH / 2;

          // 绿色药丸：永远远离红线方向
          const downPillY = redIsAbove
            ? yDown + pillGap
            : yDown - pillGap - pillH;
          const downTextY = downPillY + pillH / 2;

          // 计算药丸宽度（根据数字位数）
          const upPillW = Math.max(30, `${d.totalUp}`.length * 7.5 + 10);
          const downPillW = Math.max(30, `${d.totalDown}`.length * 7.5 + 10);

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

              {upShow[i] && (
                <>
                  <rect x={x - upPillW / 2} y={upPillY}
                    width={upPillW} height={pillH} rx={3.5} fill={UP_COLOR} opacity={0.92} />
                  <text x={x} y={upTextY}
                    textAnchor="middle" fontSize={9} fontFamily="monospace" fontWeight={800}
                    fill="#fff" dominantBaseline="middle">{d.totalUp}</text>
                </>
              )}
              {downShow[i] && (
                <>
                  <rect x={x - downPillW / 2} y={downPillY}
                    width={downPillW} height={pillH} rx={3.5} fill={DOWN_COLOR} opacity={0.92} />
                  <text x={x} y={downTextY}
                    textAnchor="middle" fontSize={9} fontFamily="monospace" fontWeight={800}
                    fill="#fff" dominantBaseline="middle">{d.totalDown}</text>
                </>
              )}
            </g>
          );
        });
      })()}

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
    </g>
  );
}
