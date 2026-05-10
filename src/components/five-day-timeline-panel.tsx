"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Customized,
} from "recharts";
import type { TimelineItem } from "@/hooks/use-stock-data";
import { formatVolume } from "@/lib/chart-shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

// ── Types ──

interface FiveDayTimelineItem extends TimelineItem {
  date: string;       // YYYY-MM-DD
  dayIndex: number;   // 0-4 for the 5 days
  dayLabel: string;   // "周一", "周二", etc.
  isDayStart: boolean; // first bar of a new trading day
}

interface FiveDayTimelinePanelProps {
  symbol: string;
  quote: any;
  timeline: TimelineItem[];
  timelinePrevClose: number;
}

// ── Data Fetching ──

interface KLine5Min {
  date: string; // "2025-01-13 09:30:00"
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Fetch 5-min K-line data using the lightweight dedicated endpoint.
 * Falls back to the full ashare-history endpoint if the lightweight one fails.
 */
async function fetch5MinKLine(symbol: string, retryCount = 1): Promise<KLine5Min[]> {
  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      // Use the lightweight endpoint first (no MACD/KDJ computation)
      const res = await fetch(
        `/api/stock/ashare-5min-kline?symbol=${encodeURIComponent(symbol)}&limit=250`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (res.ok) {
        const data = await res.json();
        if (!data.error && Array.isArray(data.data) && data.data.length > 0) {
          return data.data.filter((d: any) => d.close > 0);
        }
      }

      // Fallback to the full ashare-history endpoint
      const res2 = await fetch(
        `/api/stock/ashare-history?symbol=${encodeURIComponent(symbol)}&interval=5m&limit=250`,
        { signal: AbortSignal.timeout(15000) }
      );
      if (res2.ok) {
        const data = await res2.json();
        if (!data.error && Array.isArray(data.data) && data.data.length > 0) {
          return data.data.filter((d: any) => d.close > 0);
        }
      }
    } catch (e) {
      console.error(`5min-kline fetch attempt ${attempt + 1} failed:`, e);
    }

    // Wait before retry (except on last attempt)
    if (attempt < retryCount) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  return [];
}

// ── Helper: convert 5-min K-line to 5-day timeline format ──

function convertTo5DayTimeline(
  klines: KLine5Min[],
  currentTimeline: TimelineItem[],
  quote: any,
  timelinePrevClose: number
): { items: FiveDayTimelineItem[]; dayBoundaries: number[]; dayLabels: string[]; prevClose: number; firstDayRefClose: number } {
  if (klines.length === 0 && currentTimeline.length === 0) {
    return { items: [], dayBoundaries: [], dayLabels: [], prevClose: 0, firstDayRefClose: 0 };
  }

  const items: FiveDayTimelineItem[] = [];
  const dayBoundaries: number[] = []; // indices where new days start
  const dayLabels: string[] = [];

  // Group klines by date
  const dayMap = new Map<string, KLine5Min[]>();
  for (const k of klines) {
    const dateKey = k.date.split(" ")[0];
    if (!dateKey) continue;
    if (!dayMap.has(dateKey)) dayMap.set(dateKey, []);
    dayMap.get(dateKey)!.push(k);
  }

  // Sort dates and take last 5
  const dates = Array.from(dayMap.keys()).sort();
  const last5Dates = dates.slice(-5);

  // Determine prevClose for the earliest day
  // If we have more than 5 dates, the close of the day before our 5-day window
  // is the reference. Otherwise, fall back to quote's prevClose or first bar's open.
  let prevClose = 0;
  if (dates.length > 5) {
    // The day before the 5-day window
    const beforeFirstDate = dates[dates.length - 6];
    const beforeKlines = dayMap.get(beforeFirstDate);
    if (beforeKlines && beforeKlines.length > 0) {
      prevClose = beforeKlines[beforeKlines.length - 1].close;
    }
  }
  if (prevClose <= 0) {
    prevClose = timelinePrevClose || quote?.prevClose || 0;
  }
  // Save the first day's reference close for the chart Y-axis center line
  let firstDayRefClose = prevClose;

  // For each day, compute avgPrice (VWAP) and changePercent relative to prevClose
  const dayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  for (let di = 0; di < last5Dates.length; di++) {
    const dateStr = last5Dates[di];
    const dayKlines = dayMap.get(dateStr) || [];

    if (dayKlines.length === 0) continue;

    dayBoundaries.push(items.length);
    const d = new Date(dateStr + "T00:00:00"); // Avoid timezone issues
    const dayLabel = dayNames[d.getDay()];
    dayLabels.push(`${dateStr.slice(5)} ${dayLabel}`);

    // Use the open of first bar as reference if no prevClose
    const dayOpen = dayKlines[0].open;
    const refClose = prevClose > 0 ? prevClose : dayOpen;
    // Save first day's reference
    if (di === 0) firstDayRefClose = refClose;

    // Compute VWAP for the day
    let cumVol = 0;
    let cumAmt = 0;

    for (let i = 0; i < dayKlines.length; i++) {
      const k = dayKlines[i];
      const barVol = Math.max(0, k.volume);
      cumVol += barVol;
      cumAmt += barVol * k.close;
      const avgPrice = cumVol > 0 ? cumAmt / cumVol : k.close;
      const changePercent = refClose > 0 ? ((k.close - refClose) / refClose) * 100 : 0;

      const timeStr = k.date.split(" ")[1]?.slice(0, 5) || "09:30";

      items.push({
        time: timeStr,
        price: k.close,
        avgPrice,
        volume: barVol,
        changePercent: Number(changePercent.toFixed(2)),
        date: dateStr,
        dayIndex: di,
        dayLabel,
        isDayStart: i === 0,
      });
    }

    // Update prevClose for next day = last close of this day
    prevClose = dayKlines[dayKlines.length - 1].close;
  }

  // If we have today's live timeline data, merge it for the last day
  if (currentTimeline.length > 0 && last5Dates.length > 0) {
    const todayStr = last5Dates[last5Dates.length - 1];
    // Remove the last day's kline-based items and replace with live data
    const lastDayStartIdx = dayBoundaries[dayBoundaries.length - 1];
    // Keep items before the last day
    const beforeLastDay = items.slice(0, lastDayStartIdx);

    // Rebuild last day with live timeline data
    const liveItems: FiveDayTimelineItem[] = [];
    let cumVol = 0;
    let cumAmt = 0;
    const refClose = beforeLastDay.length > 0
      ? beforeLastDay[beforeLastDay.length - 1].price
      : (quote?.prevClose || timelinePrevClose || currentTimeline[0]?.price || 0);

    for (let i = 0; i < currentTimeline.length; i++) {
      const t = currentTimeline[i];
      cumVol += t.volume;
      cumAmt += t.volume * t.price;
      const avgPrice = cumVol > 0 ? cumAmt / cumVol : t.price;
      const changePercent = refClose > 0 ? ((t.price - refClose) / refClose) * 100 : 0;

      liveItems.push({
        ...t,
        date: todayStr,
        dayIndex: last5Dates.length - 1,
        dayLabel: dayLabels[dayLabels.length - 1]?.split(" ")[1] || "",
        isDayStart: i === 0,
        avgPrice,
        changePercent: Number(changePercent.toFixed(2)),
      });
    }

    items.length = 0;
    items.push(...beforeLastDay, ...liveItems);
  }

  return { items, dayBoundaries, dayLabels, prevClose, firstDayRefClose };
}

// ── Tooltip ──

const FiveDayTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload as FiveDayTimelineItem | undefined;
  if (!data) return null;

  const isUp = data.changePercent >= 0;

  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-xs min-w-[180px]">
      <div className="font-medium mb-1.5 text-foreground">
        {data.date} {data.time}
      </div>
      <div className="grid grid-cols-2 gap-y-1 gap-x-3">
        <span className="text-muted-foreground">价格</span>
        <span className={`text-right font-mono ${isUp ? "text-red-500" : "text-green-500"}`}>{data.price?.toFixed(2)}</span>
        <span className="text-muted-foreground">均价</span>
        <span className="text-right font-mono text-yellow-500">{data.avgPrice?.toFixed(2)}</span>
        <span className="text-muted-foreground">涨跌幅</span>
        <span className={`text-right font-mono ${isUp ? "text-red-500" : "text-green-500"}`}>{data.changePercent?.toFixed(2)}%</span>
        <span className="text-muted-foreground">成交量</span>
        <span className="text-right font-mono">{formatVolume(data.volume)}</span>
      </div>
    </div>
  );
};

// ── Custom Y-Axis Tick with Percent ──

function PercentYTick(props: any) {
  const { x, y, payload, prevClose } = props;
  if (!prevClose || prevClose <= 0) {
    return (
      <text x={x} y={y} dy={4} textAnchor="end" fontSize={9} fontFamily="monospace" fill="#94a3b8">
        {payload.value.toFixed(2)}
      </text>
    );
  }
  const pct = ((payload.value - prevClose) / prevClose) * 100;
  const isUp = pct >= 0;
  return (
    <g>
      <text x={x} y={y} textAnchor="end" fontSize={9} fontFamily="monospace" fill={isUp ? "#ef4444" : "#16a34a"}>
        {payload.value.toFixed(2)}
      </text>
      <text x={x} y={y + 11} textAnchor="end" fontSize={7} fill={isUp ? "#ef4444" : "#16a34a"} opacity={0.7}>
        {isUp ? "+" : ""}{pct.toFixed(1)}%
      </text>
    </g>
  );
}

// ── Day Boundary Lines ──

function DayBoundaryLines(props: any) {
  const { formattedGraphicalItems, dayBoundaries, dayLabels, chartHeight } = props;
  if (!formattedGraphicalItems || dayBoundaries.length <= 1) return null;

  // Get x positions from the price line
  const priceLine = formattedGraphicalItems?.[0];
  if (!priceLine?.props?.points) return null;

  const points = priceLine.props.points;
  const result: React.ReactNode[] = [];

  for (let i = 1; i < dayBoundaries.length; i++) {
    const idx = dayBoundaries[i];
    if (idx < points.length && points[idx]) {
      const x = points[idx].x;
      result.push(
        <line key={`day-boundary-${i}`} x1={x} y1={0} x2={x} y2={chartHeight || "100%"} stroke="#475569" strokeWidth={1} strokeDasharray="4 3" />,
        <text key={`day-label-${i}`} x={x + 4} y={14} fontSize={9} fill="#94a3b8" fontWeight={500}>
          {dayLabels[i] || ""}
        </text>
      );
    }
  }

  // Also add the first day label
  if (dayBoundaries.length > 0 && dayBoundaries[0] < points.length && points[dayBoundaries[0]]) {
    const x = points[dayBoundaries[0]].x;
    result.push(
      <text key="day-label-0" x={x + 4} y={14} fontSize={9} fill="#94a3b8" fontWeight={500}>
        {dayLabels[0] || ""}
      </text>
    );
  }

  return <g>{result}</g>;
}

// ── Volume Bar Shape ──

function VolumeBarShape(props: any) {
  const { x, y, width, height, payload } = props;
  if (!height || Math.abs(height) < 0.3) return null;
  const isUp = payload.changePercent >= 0;
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      fill={isUp ? "rgba(239,68,68,1)" : "rgba(22,163,74,1)"}
    />
  );
}

// ── Main Component ──

export function FiveDayTimelinePanel({ symbol, quote, timeline, timelinePrevClose }: FiveDayTimelinePanelProps) {
  const [kline5Min, setKline5Min] = useState<KLine5Min[]>([]);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const fetchIdRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartHeight, setChartHeight] = useState(500);

  // Auto-fit chart height to window
  useEffect(() => {
    const updateHeight = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      // Available height = viewport height - container top position - some bottom padding
      const availableHeight = window.innerHeight - rect.top - 20;
      // Price chart takes ~75% of available space, volume ~18%, gap ~7%
      const priceH = Math.max(200, Math.floor(availableHeight * 0.75));
      setChartHeight(priceH);
    };

    // Initial calculation
    updateHeight();
    // Recalculate on resize
    window.addEventListener("resize", updateHeight);
    // Also recalculate after a short delay (for layout settling)
    const timer = setTimeout(updateHeight, 100);
    return () => {
      window.removeEventListener("resize", updateHeight);
      clearTimeout(timer);
    };
  }, []);

  // Fetch 5-min K-line data with proper cleanup and retry
  const loadData = useCallback(async (sym: string) => {
    const fetchId = ++fetchIdRef.current;
    setFetching(true);
    setFetchError(null);

    try {
      const data = await fetch5MinKLine(sym, 1);
      // Check if this fetch is still current
      if (fetchId !== fetchIdRef.current) return;
      setKline5Min(data);
      setDataLoaded(true);
      if (data.length === 0) {
        setFetchError("未获取到5分钟K线数据");
      }
    } catch (e) {
      if (fetchId !== fetchIdRef.current) return;
      setFetchError("获取数据失败，请重试");
    } finally {
      if (fetchId === fetchIdRef.current) {
        setFetching(false);
      }
    }
  }, []);

  // Initial fetch on mount and symbol change
  useEffect(() => {
    if (!symbol) return;
    loadData(symbol);
  }, [symbol, loadData]);

  const loading = fetching && !dataLoaded;

  // Convert to 5-day timeline format
  const { items, dayBoundaries, dayLabels, prevClose, firstDayRefClose } = useMemo(() => {
    if (kline5Min.length === 0 && timeline.length === 0) {
      return { items: [], dayBoundaries: [], dayLabels: [], prevClose: 0, firstDayRefClose: 0 };
    }
    return convertTo5DayTimeline(kline5Min, timeline, quote, timelinePrevClose);
  }, [kline5Min, timeline, quote, timelinePrevClose]);

  // Compute price range — symmetric around first day's reference close
  const { minPrice, maxPrice, refClose: chartRefClose, yTicks } = useMemo(() => {
    if (items.length === 0) return { minPrice: 0, maxPrice: 100, refClose: 0, yTicks: undefined as number[] | undefined };

    const refP = firstDayRefClose || items[0]?.price || 100;

    // Compute symmetric range around the reference
    let maxDeviation = 0;
    for (const item of items) {
      const dev = Math.abs(item.price - refP);
      if (dev > maxDeviation) maxDeviation = dev;
    }
    const padding = maxDeviation * 0.2 || refP * 0.02;
    const minP = refP - maxDeviation - padding;
    const maxP = refP + maxDeviation + padding;

    // Generate symmetric ticks around refClose
    const range = maxP - minP;
    const step = range / 4;
    const ticks = [
      refP - 2 * step,
      refP - step,
      refP,
      refP + step,
      refP + 2 * step,
    ];

    return { minPrice: minP, maxPrice: maxP, refClose: refP, yTicks: ticks };
  }, [items, firstDayRefClose]);

  const maxVolume = useMemo(() => {
    return items.reduce((mx, d) => Math.max(mx, d.volume), 1);
  }, [items]);

  // ── 5-day highest / lowest price ──
  const { highestPrice, lowestPrice } = useMemo(() => {
    if (items.length === 0) return { highestPrice: null, lowestPrice: null };
    let hi = -Infinity, lo = Infinity;
    for (const d of items) {
      if (d.price > hi) hi = d.price;
      if (d.price < lo) lo = d.price;
    }
    return { highestPrice: isFinite(hi) ? hi : null, lowestPrice: isFinite(lo) ? lo : null };
  }, [items]);

  // Compute daily stats for the header summary
  const dailyStats = useMemo(() => {
    if (items.length === 0) return [];
    const stats: { date: string; label: string; open: number; close: number; change: number; high: number; low: number }[] = [];
    for (let di = 0; di < dayBoundaries.length; di++) {
      const startIdx = dayBoundaries[di];
      const endIdx = di < dayBoundaries.length - 1 ? dayBoundaries[di + 1] : items.length;
      const dayItems = items.slice(startIdx, endIdx);
      if (dayItems.length === 0) continue;
      const open = dayItems[0].price;
      const close = dayItems[dayItems.length - 1].price;
      const high = dayItems.reduce((mx, d) => Math.max(mx, d.price), open);
      const low = dayItems.reduce((mn, d) => Math.min(mn, d.price), open);
      const refP = di > 0 ? stats[di - 1].close : (prevClose || open);
      const change = refP > 0 ? ((close - refP) / refP) * 100 : 0;
      stats.push({
        date: dayItems[0].date,
        label: dayLabels[di] || dayItems[0].date.slice(5),
        open, close, change, high, low,
      });
    }
    return stats;
  }, [items, dayBoundaries, dayLabels, prevClose]);

  // Volume chart height
  const volumeChartHeight = useMemo(() => {
    return Math.max(90, Math.floor(chartHeight * 0.35));
  }, [chartHeight]);

  // XAxis tick interval
  const xTickInterval = useMemo(() => {
    return Math.max(1, Math.floor(items.length / 12));
  }, [items.length]);

  // Bar size based on data density
  const barSize = useMemo(() => {
    if (items.length > 400) return 2;
    if (items.length > 200) return 3;
    return 4;
  }, [items.length]);

  if (loading) {
    return (
      <div ref={containerRef} className="flex items-center justify-center" style={{ height: `${Math.max(400, chartHeight + volumeChartHeight)}px` }}>
        <span className="text-sm text-muted-foreground animate-pulse">加载五日分时数据...</span>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div ref={containerRef} className="flex flex-col items-center justify-center gap-3" style={{ height: `${Math.max(400, chartHeight + volumeChartHeight)}px` }}>
        <span className="text-sm text-muted-foreground">
          {fetchError || "暂无五日分时数据"}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={() => loadData(symbol)}
          disabled={fetching}
        >
          <RefreshCw className={`h-3 w-3 mr-1 ${fetching ? "animate-spin" : ""}`} />
          重新加载
        </Button>
      </div>
    );
  }

  const refClose = chartRefClose;

  return (
    <div ref={containerRef} className="flex flex-col gap-0">
      {/* 5-Day Daily Summary Bar */}
      {dailyStats.length > 0 && (
        <Card className="py-0 mb-1.5">
          <CardContent className="py-1.5 px-3">
            <div className="flex items-center gap-3 overflow-x-auto">
              {dailyStats.map((ds, i) => {
                const isUp = ds.change >= 0;
                return (
                  <div key={i} className="flex items-center gap-1.5 shrink-0 text-xs">
                    <span className="text-muted-foreground font-medium">{ds.label.split(" ").pop() || ds.date.slice(5)}</span>
                    <span className={`font-mono font-semibold ${isUp ? "text-red-500" : "text-green-500"}`}>{ds.close.toFixed(2)}</span>
                    <span className={`font-mono text-[10px] ${isUp ? "text-red-500" : "text-green-500"}`}>
                      {isUp ? "+" : ""}{ds.change.toFixed(2)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 5-Day Price Chart — fills most of the viewport */}
      <Card className="py-0 flex-1">
        <CardContent className="pb-1 pt-1 px-2">
          <div className="flex items-center gap-2 px-1 pt-1.5 pb-0.5">
            <span className="text-xs font-medium text-muted-foreground">五日分时图</span>
            {quote && <span className="text-[10px] text-muted-foreground ml-auto">{quote.symbol} {quote.name}</span>}
          </div>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <ComposedChart data={items} margin={{ top: 4, right: 60, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} vertical={false} />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 9, fill: "#64748b" }}
                tickLine={false}
                axisLine={{ stroke: "#334155", strokeWidth: 0.5 }}
                interval={xTickInterval}
              />
              <YAxis
                domain={[minPrice, maxPrice]}
                tickLine={false}
                axisLine={false}
                width={65}
                tick={<PercentYTick prevClose={refClose} />}
                ticks={yTicks}
                tickCount={5}
              />
              <Tooltip content={<FiveDayTooltip />} cursor={{ strokeDasharray: "3 3" }} wrapperStyle={{ background: "transparent", border: "none" }} />
              {refClose > 0 && <ReferenceLine y={refClose} stroke="#64748b" strokeDasharray="4 4" strokeWidth={0.8} />}
              {/* Highest price dashed line */}
              {highestPrice != null && <ReferenceLine y={highestPrice} stroke="#f87171" strokeDasharray="6 4" strokeWidth={0.8} />}
              {/* Lowest price dashed line */}
              {lowestPrice != null && <ReferenceLine y={lowestPrice} stroke="#4ade80" strokeDasharray="6 4" strokeWidth={0.8} />}
              {/* Price area fill */}
              <Area
                type="monotone"
                dataKey="price"
                stroke="none"
                fill={(() => {
                  const lastItem = items[items.length - 1];
                  if (!lastItem) return "#ef4444";
                  return lastItem.price >= refClose ? "rgba(239,68,68,0.06)" : "rgba(22,163,74,0.06)";
                })()}
                isAnimationActive={false}
              />
              {/* Avg price line */}
              <Area type="monotone" dataKey="avgPrice" stroke="#eab308" strokeWidth={1} fill="none" dot={false} isAnimationActive={false} strokeDasharray="3 2" />
              {/* Price line */}
              <Line type="monotone" dataKey="price" stroke="#ef4444" strokeWidth={1.2} dot={false} isAnimationActive={false} />
              <Customized component={(props: any) => <DayBoundaryLines {...props} dayBoundaries={dayBoundaries} dayLabels={dayLabels} chartHeight={chartHeight} />} />
              {/* Highest / Lowest price tags on Y-axis */}
              <Customized component={(props: any) => {
                const { yAxisMap } = props;
                if (!yAxisMap || (highestPrice == null && lowestPrice == null)) return null;
                const yAxis = Object.values(yAxisMap)[0] as any;
                if (!yAxis) return null;
                const yScale = yAxis.scale;
                const chartRight = (yAxis.x || 0) + (yAxis.width || 0);
                const els: React.ReactNode[] = [];
                if (highestPrice != null) {
                  const y = yScale(highestPrice);
                  if (y != null && !isNaN(y)) {
                    els.push(
                      <g key="hi-tag">
                        <polygon points={`${chartRight - 8},${y + 5} ${chartRight + 2},${y + 5} ${chartRight - 3},${y - 3}`} fill="#f87171" />
                        <rect x={chartRight + 1} y={y - 10} width={62} height={20} rx={3} fill="#f87171" fillOpacity={0.85} />
                        <text x={chartRight + 32} y={y + 4} textAnchor="middle" fontSize={9} fontFamily="monospace" fontWeight={600} fill="#ffffff">
                          {highestPrice.toFixed(2)}
                        </text>
                      </g>
                    );
                  }
                }
                if (lowestPrice != null) {
                  const y = yScale(lowestPrice);
                  if (y != null && !isNaN(y)) {
                    els.push(
                      <g key="lo-tag">
                        <polygon points={`${chartRight - 8},${y - 5} ${chartRight + 2},${y - 5} ${chartRight - 3},${y + 3}`} fill="#4ade80" />
                        <rect x={chartRight + 1} y={y - 10} width={62} height={20} rx={3} fill="#4ade80" fillOpacity={0.85} />
                        <text x={chartRight + 32} y={y + 4} textAnchor="middle" fontSize={9} fontFamily="monospace" fontWeight={600} fill="#ffffff">
                          {lowestPrice.toFixed(2)}
                        </text>
                      </g>
                    );
                  }
                }
                return els.length > 0 ? <g>{els}</g> : null;
              }} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 5-Day Volume Chart — separate chart at bottom */}
      <Card className="py-0 mt-1">
        <CardContent className="pb-1 pt-0 px-2">
          <div className="flex items-center px-1 pt-0.5 pb-0">
            <span className="text-[10px] text-muted-foreground">成交量</span>
          </div>
          <ResponsiveContainer width="100%" height={volumeChartHeight}>
            <ComposedChart data={items} margin={{ top: 2, right: 60, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} vertical={false} />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 8, fill: "#64748b" }}
                tickLine={false}
                axisLine={{ stroke: "#334155", strokeWidth: 0.5 }}
                interval={xTickInterval}
              />
              <YAxis
                domain={[0, maxVolume * 1.2]}
                tickLine={false}
                axisLine={false}
                width={65}
                tickFormatter={(v: number) => formatVolume(v)}
                tick={{ fontSize: 8, fill: "#64748b" }}
                tickCount={3}
              />
              <Tooltip
                content={({ active, payload }: any) => {
                  if (!active || !payload?.length) return null;
                  const data = payload[0]?.payload as FiveDayTimelineItem | undefined;
                  if (!data) return null;
                  const isUp = data.changePercent >= 0;
                  return (
                    <div className="bg-card border border-border rounded-lg p-2 shadow-xl text-xs">
                      <div className="font-medium text-foreground mb-1">{data.date} {data.time}</div>
                      <div className="grid grid-cols-2 gap-y-0.5 gap-x-2">
                        <span className="text-muted-foreground">成交量</span>
                        <span className="text-right font-mono">{formatVolume(data.volume)}</span>
                        <span className="text-muted-foreground">价格</span>
                        <span className={`text-right font-mono ${isUp ? "text-red-500" : "text-green-500"}`}>{data.price?.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                }}
                cursor={{ strokeDasharray: "3 3" }}
                wrapperStyle={{ background: "transparent", border: "none" }}
              />
              <Bar
                dataKey="volume"
                isAnimationActive={false}
                barSize={barSize}
                shape={(props: any) => <VolumeBarShape {...props} />}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
