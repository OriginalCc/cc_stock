"use client";

import React, { useMemo } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { TimelineItem } from "@/hooks/use-stock-data";
import { formatVolume, formatPrice, computeMiniMACD } from "@/lib/chart-shared";
import { ALL_TRADE_TIMES } from "@/lib/trading-times";

// ── Stable shape renderers (module-level to avoid re-creating on every render) ──

function timelineVolumeBarShape(props: any) {
  const { x, y, width, height, payload } = props;
  if (!payload?.hasData) return null;
  return <rect x={x} y={y} width={width} height={height} fill={payload.volUp ? "#ef4444" : "#16a34a"} />;
}

function timelineMacdBarShape(props: any) {
  const { x, y, width, height, payload } = props;
  if (payload?.macd == null) return null;
  const h = Math.abs(height || 0);
  if (h < 0.3) return null;
  const ry = height < 0 ? y + height : y;
  return <rect x={x} y={ry} width={width} height={h} fill={payload.macd >= 0 ? "#ef4444" : "#16a34a"} />;
}

// ── Mini Percentage Y-Axis Tick (smaller font for mini panel) ──

function MiniPercentYTick(props: { x?: number; y?: number; payload?: { value?: number }; index?: number; visibleTicksCount?: number }) {
  const { x = 0, y = 0, payload } = props;
  const val = payload?.value ?? 0;
  const isPositive = val > 0.001;
  const isZero = Math.abs(val) <= 0.001;
  const fill = isZero ? "#6b7280" : isPositive ? "#dc2626" : "#16a34a";
  const text = isZero ? "0.00%" : val > 0 ? `+${val.toFixed(2)}%` : `${val.toFixed(2)}%`;
  return (
    <text x={x} y={y} textAnchor="end" dominantBaseline="middle" fill={fill} fontSize={8} fontWeight="600">
      {text}
    </text>
  );
}

// ── Compact Mini Timeline Panel (for index/sector overview) ──

export const MiniTimelinePanel = React.memo(function MiniTimelinePanel({
  title,
  data,
  prevClose,
  badge,
}: {
  title: string;
  data: TimelineItem[];
  prevClose: number;
  badge?: React.ReactNode;
}) {
  // Build full-day template
  const { fullDayData, timeTicks } = useMemo(() => {
    if (data.length === 0) return { fullDayData: [], timeTicks: [] };

    // ── Truncate API-pre-populated future minutes ──
    // Tencent API returns full session data with flat (last known) prices for future minutes.
    // Cut these off so the price line doesn't extend as a horizontal line into the future.
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const isMorningSession = (h === 9 && m >= 30) || (h === 10) || (h === 11 && m <= 30);
    const isAfternoonSession = (h >= 13 && h < 15) || (h === 15 && m === 0);
    let truncated = data;
    if (isMorningSession || isAfternoonSession) {
      const curMin = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const lastValidIdx = data.reduce((lastIdx: number, d: TimelineItem, i: number) => {
        if (d.time <= curMin) return i;
        return lastIdx;
      }, -1);
      if (lastValidIdx >= 0 && lastValidIdx < data.length - 1) {
        truncated = data.slice(0, lastValidIdx + 1);
      }
    }

    const allTimes = ALL_TRADE_TIMES;

    const dataByTime = new Map<string, TimelineItem>();
    truncated.forEach(d => dataByTime.set(d.time, d));
    const lastActualIdx = truncated.length > 0 ? allTimes.indexOf(truncated[truncated.length - 1].time) : -1;

    const fullDay = allTimes.map((time, idx) => {
      const actual = dataByTime.get(time);
      const hasData = actual != null && idx <= lastActualIdx;
      if (hasData) {
        const safePrevClose = prevClose > 0 ? prevClose : truncated[0].price;
        const prevActual = (() => {
          for (let j = truncated.length - 1; j >= 0; j--) { if (truncated[j].time < time) return truncated[j]; }
          return null;
        })();
        return {
          idx, time,
          price: actual.price,
          avgPrice: actual.avgPrice,
          volume: actual.volume,
          changePercent: actual.changePercent,
          volUp: prevActual ? actual.price >= prevActual.price : actual.price >= safePrevClose,
          hasData: true,
        };
      }
      return {
        idx, time,
        price: null as unknown as number,
        avgPrice: null as unknown as number,
        volume: 0,
        changePercent: 0,
        volUp: true,
        hasData: false,
      };
    });

    const keyTimes = ["09:30", "10:30", "11:30", "13:00", "14:00", "15:00"];
    const ticks = keyTimes.map(t => allTimes.indexOf(t)).filter(i => i >= 0);

    return { fullDayData: fullDay, timeTicks: ticks };
  }, [data, prevClose]);

  // Compute MACD (use same truncation logic as fullDayData)
  const macdData = useMemo(() => {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const isMorningSession = (h === 9 && m >= 30) || (h === 10) || (h === 11 && m <= 30);
    const isAfternoonSession = (h >= 13 && h < 15) || (h === 15 && m === 0);
    let macdInput = data;
    if (isMorningSession || isAfternoonSession) {
      const curMin = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const lastValidIdx = data.reduce((lastIdx: number, d: TimelineItem, i: number) => {
        if (d.time <= curMin) return i;
        return lastIdx;
      }, -1);
      if (lastValidIdx >= 0 && lastValidIdx < data.length - 1) {
        macdInput = data.slice(0, lastValidIdx + 1);
      }
    }
    return computeMiniMACD(macdInput);
  }, [data]);
  const macdByTime = new Map(macdData.map(m => [m.time, m]));

  // Merge MACD into fullDayData
  const chartData = useMemo(() => fullDayData.map(d => ({
    ...d,
    dif: macdByTime.get(d.time)?.dif ?? undefined,
    dea: macdByTime.get(d.time)?.dea ?? undefined,
    macd: macdByTime.get(d.time)?.macd ?? undefined,
  })), [fullDayData, macdByTime]);

  const { safePrevClose, yMin, yMax, percentMin, percentMax, maxVolume, barSize, macdMin, macdMax, macdPad, lastItem, isUp } = useMemo(() => {
    if (data.length === 0) return { safePrevClose: 0, yMin: 0, yMax: 1, percentMin: 0, percentMax: 0, maxVolume: 1, barSize: 2, macdMin: -1, macdMax: 1, macdPad: 0.1, lastItem: null as never, isUp: true };
    const spc = prevClose > 0 ? prevClose : data[0].price;

    // Smart Y-axis (same as main chart)
    const allPrices = data.map(d => d.price);
    const allAvgPrices = data.filter(d => d.avgPrice != null).map(d => d.avgPrice!);
    // Use reduce for min/max to avoid call stack issues with spread on large arrays
    const combined = [...allPrices, ...allAvgPrices];
    const dataMin = combined.reduce((mn, v) => (v < mn ? v : mn), combined[0] ?? 0);
    const dataMax = combined.reduce((mx, v) => (v > mx ? v : mx), combined[0] ?? 0);
    const dataRange = dataMax - dataMin || spc * 0.001;
    const padding = Math.max(dataRange * 0.2, spc * 0.002);
    let ymn = dataMin - padding;
    let ymx = dataMax + padding;
    const prevCloseMargin = spc * 0.002;
    if (spc < ymn) ymn = spc - prevCloseMargin;
    else if (spc > ymx) ymx = spc + prevCloseMargin;

    const pMin = ((ymn - spc) / spc) * 100;
    const pMax = ((ymx - spc) / spc) * 100;

    const mv = data.reduce((mx, d) => (d.volume > mx ? d.volume : mx), 1);
    const bs = chartData.length > 200 ? 2 : chartData.length > 100 ? 3 : 4;

    // MACD range
    const macdValues = macdData.flatMap(d => [d.dif, d.dea, d.macd]).filter((v): v is number => v != null);
    const mMin = macdValues.length ? macdValues.reduce((mn, v) => (v < mn ? v : mn), macdValues[0]) : -1;
    const mMax = macdValues.length ? macdValues.reduce((mx, v) => (v > mx ? v : mx), macdValues[0]) : 1;
    const mPad = (mMax - mMin) * 0.02 || 0.05;

    // Last data info
    const li = data[data.length - 1];
    const iu = li.changePercent >= 0;

    return { safePrevClose: spc, yMin: ymn, yMax: ymx, percentMin: pMin, percentMax: pMax, maxVolume: mv, barSize: bs, macdMin: mMin, macdMax: mMax, macdPad: mPad, lastItem: li, isUp: iu };
  }, [data, prevClose, chartData, macdData]);

  if (data.length === 0) return null;

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      {/* Header */}
      <div className="px-3 py-1.5 border-b border-border/50 flex items-center gap-2 text-xs">
        <span className="font-medium text-foreground">{title}</span>
        <span className={`font-bold tabular-nums text-xs ${isUp ? "text-red-500" : "text-green-500"}`}>
          {formatPrice(lastItem.price)}
        </span>
        <span className={`tabular-nums text-[10px] ${isUp ? "text-red-500" : "text-green-500"}`}>
          {isUp ? "+" : ""}{(lastItem.changePercent ?? 0).toFixed(2)}%
        </span>
        {badge}
      </div>

      {/* Price Chart */}
      <ResponsiveContainer width="100%" height={120}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 45, left: 2, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.12} vertical={false} />
          <XAxis
            dataKey="idx" type="number" domain={[0, chartData.length - 1]}
            tick={{ fontSize: 7, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false} axisLine={{ stroke: "hsl(var(--border))", strokeWidth: 0.3 }}
            interval={0} ticks={timeTicks}
            tickFormatter={(idx: number) => chartData[idx]?.time || ""}
          />
          <YAxis
            yAxisId="price" domain={[yMin, yMax]}
            tick={{ fontSize: 7, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false} axisLine={false} width={42}
            tickFormatter={(v: number) => formatPrice(v)}
          />
          <YAxis
            yAxisId="percent" orientation="right" domain={[percentMin, percentMax]}
            tick={<MiniPercentYTick />}
            tickLine={false} axisLine={false} width={44}
          />
          <ReferenceLine yAxisId="price" y={prevClose} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 2" strokeWidth={0.4} />
          <Area yAxisId="price" type="monotone" dataKey="price" stroke="none" fill="#3b82f6" fillOpacity={0.06} connectNulls isAnimationActive={false} />
          <Line yAxisId="price" type="monotone" dataKey="price" stroke="#3b82f6" dot={false} strokeWidth={0.8} connectNulls isAnimationActive={false} />
          <Line yAxisId="price" type="monotone" dataKey="avgPrice" stroke="#ca8a04" dot={false} strokeWidth={1.0} strokeDasharray="4 2" connectNulls isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Divider */}
      <div className="h-px bg-border/30" />

      {/* Volume */}
      <div className="flex items-center px-2 text-[7px] text-muted-foreground select-none pointer-events-none">
        <span className="font-medium">VOL</span>
      </div>
      <ResponsiveContainer width="100%" height={32}>
        <ComposedChart data={chartData} margin={{ top: 0, right: 45, left: 2, bottom: 0 }}>
          <XAxis dataKey="idx" type="number" domain={[0, chartData.length - 1]} tick={false} tickLine={false} axisLine={false} />
          <YAxis yAxisId="vol" domain={[0, maxVolume * 1.1]} tick={false} tickLine={false} axisLine={false} width={42} />
          <YAxis yAxisId="vol-r" orientation="right" domain={[0, maxVolume * 1.1]} tick={{ fontSize: 6, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={38} tickFormatter={(v: number) => formatVolume(v)} />
          <Bar yAxisId="vol-r" dataKey="volume" isAnimationActive={false} barSize={barSize}
            shape={timelineVolumeBarShape}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Divider */}
      <div className="h-px bg-border/30" />

      {/* MACD */}
      <div className="flex items-center gap-2 px-2 text-[7px] select-none pointer-events-none">
        <span className="font-medium text-muted-foreground">MACD</span>
        <span className="flex items-center gap-0.5">
          <span className="inline-block w-1.5 h-0.5 bg-blue-600 rounded" />
          <span className="text-blue-600">DIF</span>
        </span>
        <span className="flex items-center gap-0.5">
          <span className="inline-block w-1.5 h-0.5 bg-orange-600 rounded" />
          <span className="text-orange-600">DEA</span>
        </span>
      </div>
      <ResponsiveContainer width="100%" height={36}>
        <ComposedChart data={chartData} margin={{ top: 0, right: 45, left: 2, bottom: 0 }}>
          <XAxis dataKey="idx" type="number" domain={[0, chartData.length - 1]} tick={false} tickLine={false} axisLine={false} />
          <YAxis yAxisId="macd" domain={[macdMin - macdPad, macdMax + macdPad]} tick={false} tickLine={false} axisLine={false} width={42} />
          <YAxis yAxisId="macd-r" orientation="right" domain={[macdMin - macdPad, macdMax + macdPad]} tick={{ fontSize: 6, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={38} tickFormatter={(v: number) => (v ?? 0).toFixed(3)} />
          <ReferenceLine yAxisId="macd-r" y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 2" strokeWidth={0.3} />
          <Bar yAxisId="macd-r" dataKey="macd" isAnimationActive={false} barSize={barSize}
            shape={timelineMacdBarShape}
          />
          <Line yAxisId="macd-r" type="monotone" dataKey="dif" stroke="#2563eb" dot={false} strokeWidth={0.8} connectNulls isAnimationActive={false} />
          <Line yAxisId="macd-r" type="monotone" dataKey="dea" stroke="#ea580c" dot={false} strokeWidth={0.8} connectNulls isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
});
