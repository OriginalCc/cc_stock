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
  displayVolume: number; // 5-min aggregated volume for chart display (only non-zero at 5-min boundaries)
}

interface FiveDayTimelinePanelProps {
  symbol: string;
  quote: any;
  timeline: TimelineItem[];
  timelinePrevClose: number;
}

// ── Constants ──

/**
 * Generate the full list of 1-minute time slots for a trading day.
 * Returns ["09:30", "09:31", ..., "11:30", "13:00", "13:01", ..., "15:00"]
 * Total: 242 slots (121 morning + 121 afternoon)
 */
function generateFullDayTimeSlots(): string[] {
  const slots: string[] = [];
  // Morning: 9:30 - 11:30
  for (let h = 9; h <= 11; h++) {
    const startMin = h === 9 ? 30 : 0;
    const endMin = h === 11 ? 30 : 59;
    for (let m = startMin; m <= endMin; m++) {
      slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  // Afternoon: 13:00 - 15:00
  for (let h = 13; h <= 15; h++) {
    const endMin = h === 15 ? 0 : 59;
    for (let m = 0; m <= endMin; m++) {
      slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return slots;
}

/** Pre-computed full day time slots — each day gets exactly this many data points */
const FULL_DAY_SLOTS = generateFullDayTimeSlots(); // 242 slots
const SLOTS_PER_DAY = FULL_DAY_SLOTS.length;

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
 * Fetch 5-min K-line data, then we'll interpolate to 1-min granularity.
 * This ensures each day has the same number of data points for equal width.
 */
async function fetch5MinKLine(symbol: string, retryCount = 1): Promise<KLine5Min[]> {
  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
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

    if (attempt < retryCount) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  return [];
}

// ── Helper: parse "HH:MM" to total minutes from midnight ──

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// ── Helper: interpolate 5-min klines to 1-min data and pad to full day ──

interface MinuteBar {
  time: string;
  price: number;
  volume: number;
}

/**
 * Given a day's 5-min K-line bars, interpolate to 1-minute granularity,
 * then pad to FULL_DAY_SLOTS length so every day has the same data point count.
 *
 * Interpolation strategy:
 * - Each 5-min bar is placed at its starting time slot
 * - Between consecutive 5-min bars, we linearly interpolate the close price
 * - Volume is distributed evenly across the 5 minutes
 * - Before the first bar: use the first bar's open price, volume=0
 * - After the last bar: use the last bar's close price, volume=0
 */
function interpolateDayTo1Min(dayKlines: KLine5Min[]): MinuteBar[] {
  // Build a map: timeSlot → { price (close), volume }
  const fiveMinMap = new Map<string, { price: number; volume: number; open: number }>();
  for (const k of dayKlines) {
    const timeStr = k.date.split(" ")[1]?.slice(0, 5) || "";
    if (timeStr) {
      fiveMinMap.set(timeStr, { price: k.close, volume: Math.max(0, k.volume), open: k.open });
    }
  }

  // Get sorted 5-min anchor points with their slot indices
  const anchors: { slotIdx: number; price: number; volume: number }[] = [];
  for (let i = 0; i < FULL_DAY_SLOTS.length; i++) {
    const slot = FULL_DAY_SLOTS[i];
    const bar = fiveMinMap.get(slot);
    if (bar) {
      anchors.push({ slotIdx: i, price: bar.price, volume: bar.volume });
    }
  }

  // If no anchors at all, return empty bars
  if (anchors.length === 0) {
    return FULL_DAY_SLOTS.map(slot => ({ time: slot, price: 0, volume: 0 }));
  }

  const result: MinuteBar[] = new Array(SLOTS_PER_DAY);

  // Before first anchor: use first anchor's open price, volume=0
  const firstAnchor = anchors[0];
  for (let i = 0; i < firstAnchor.slotIdx; i++) {
    result[i] = { time: FULL_DAY_SLOTS[i], price: fiveMinMap.get(FULL_DAY_SLOTS[firstAnchor.slotIdx])?.open ?? firstAnchor.price, volume: 0 };
  }

  // Between anchors: linear interpolation
  for (let a = 0; a < anchors.length; a++) {
    const curr = anchors[a];
    // Place the anchor point itself — keep full 5-min volume at the anchor
    result[curr.slotIdx] = { time: FULL_DAY_SLOTS[curr.slotIdx], price: curr.price, volume: curr.volume };

    // Interpolate between current and next anchor
    if (a < anchors.length - 1) {
      const next = anchors[a + 1];
      const span = next.slotIdx - curr.slotIdx;
      if (span > 1) {
        // Interpolated minutes get volume=0 (volume is kept at the 5-min anchor)
        for (let j = curr.slotIdx + 1; j < next.slotIdx; j++) {
          const t = (j - curr.slotIdx) / span;
          const interpPrice = curr.price + (next.price - curr.price) * t;
          result[j] = { time: FULL_DAY_SLOTS[j], price: interpPrice, volume: 0 };
        }
      }
    }
  }

  // After last anchor: use last anchor's price, volume=0
  const lastAnchor = anchors[anchors.length - 1];
  for (let i = lastAnchor.slotIdx + 1; i < SLOTS_PER_DAY; i++) {
    result[i] = { time: FULL_DAY_SLOTS[i], price: lastAnchor.price, volume: 0 };
  }

  return result;
}

/**
 * Given a day's 1-minute live timeline data, pad to FULL_DAY_SLOTS length.
 * The timeline data is already at 1-minute granularity.
 */
function padLiveTimelineTo1Min(timelineData: TimelineItem[]): MinuteBar[] {
  // Build a map: time → { price, volume }
  const timeMap = new Map<string, { price: number; volume: number }>();
  for (const t of timelineData) {
    timeMap.set(t.time, { price: t.price, volume: t.volume });
  }

  // Aggregate 1-minute volume into 5-minute buckets
  // The display volume is the sum of 5 consecutive 1-min bars, placed at the 5-min boundary
  const vol5Min = new Map<string, number>();
  for (const slot of FULL_DAY_SLOTS) {
    const bar = timeMap.get(slot);
    if (bar && bar.volume > 0) {
      // Find the 5-min boundary this slot belongs to
      const [h, m] = slot.split(":").map(Number);
      const totalMin = h * 60 + m;
      // Map to 5-min boundary: e.g. 9:30→9:30, 9:31→9:30, 9:34→9:30, 9:35→9:35
      const boundaryMin = Math.floor(totalMin / 5) * 5;
      const bh = Math.floor(boundaryMin / 60);
      const bm = boundaryMin % 60;
      const boundaryKey = `${String(bh).padStart(2, "0")}:${String(bm).padStart(2, "0")}`;
      vol5Min.set(boundaryKey, (vol5Min.get(boundaryKey) || 0) + bar.volume);
    }
  }

  let lastPrice = 0;
  const result: MinuteBar[] = [];
  for (const slot of FULL_DAY_SLOTS) {
    const bar = timeMap.get(slot);
    if (bar && bar.price > 0) {
      lastPrice = bar.price;
      // Display volume: only show at 5-min boundaries, 0 elsewhere
      const [h, m] = slot.split(":").map(Number);
      const totalMin = h * 60 + m;
      const is5MinBoundary = totalMin % 5 === 0;
      const dispVol = is5MinBoundary ? (vol5Min.get(slot) || 0) : 0;
      result.push({ time: slot, price: bar.price, volume: dispVol });
    } else if (lastPrice > 0) {
      result.push({ time: slot, price: lastPrice, volume: 0 });
    } else {
      result.push({ time: slot, price: 0, volume: 0 });
    }
  }
  return result;
}

// ── Helper: convert to 5-day timeline format with equal-width days ──

function convertTo5DayTimeline(
  klines: KLine5Min[],
  currentTimeline: TimelineItem[],
  quote: any,
  timelinePrevClose: number
): { items: FiveDayTimelineItem[]; dayBoundaries: number[]; dayLabels: string[]; prevClose: number; firstDayRefClose: number } {
  if (klines.length === 0 && currentTimeline.length === 0) {
    return { items: [], dayBoundaries: [], dayLabels: [], prevClose: 0, firstDayRefClose: 0 };
  }

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
  let prevClose = 0;
  if (dates.length > 5) {
    const beforeFirstDate = dates[dates.length - 6];
    const beforeKlines = dayMap.get(beforeFirstDate);
    if (beforeKlines && beforeKlines.length > 0) {
      prevClose = beforeKlines[beforeKlines.length - 1].close;
    }
  }
  if (prevClose <= 0) {
    prevClose = timelinePrevClose || quote?.prevClose || 0;
  }
  let firstDayRefClose = prevClose;

  const dayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  // For each day, produce 1-minute bars (interpolated or live), then pad to SLOTS_PER_DAY
  const items: FiveDayTimelineItem[] = [];
  const dayBoundaries: number[] = [];
  const dayLabels: string[] = [];

  for (let di = 0; di < last5Dates.length; di++) {
    const dateStr = last5Dates[di];
    dayBoundaries.push(items.length);
    const d = new Date(dateStr + "T00:00:00");
    const dayLabel = dayNames[d.getDay()];
    dayLabels.push(`${dateStr.slice(5)} ${dayLabel}`);

    const isLastDay = di === last5Dates.length - 1;

    // Get 1-minute bars for this day
    let minuteBars: MinuteBar[];

    if (isLastDay && currentTimeline.length > 0) {
      // Last day: use live 1-minute timeline data (padded to full day)
      minuteBars = padLiveTimelineTo1Min(currentTimeline);
    } else {
      // Historical day: interpolate 5-min klines to 1-min
      const dayKlines = dayMap.get(dateStr) || [];
      minuteBars = interpolateDayTo1Min(dayKlines);
    }

    // Compute reference close for this day
    const dayOpen = minuteBars.length > 0 && minuteBars[0].price > 0
      ? minuteBars[0].price
      : (prevClose || 0);
    const refClose = prevClose > 0 ? prevClose : dayOpen;
    if (di === 0) firstDayRefClose = refClose;

    // Compute VWAP cumulatively across the day
    let cumVol = 0;
    let cumAmt = 0;

    for (let ti = 0; ti < minuteBars.length; ti++) {
      const bar = minuteBars[ti];
      const price = bar.price || prevClose || refClose;
      const barVol = bar.volume;

      cumVol += barVol;
      cumAmt += barVol * price;
      const avgPrice = cumVol > 0 ? cumAmt / cumVol : price;
      const changePercent = refClose > 0 ? ((price - refClose) / refClose) * 100 : 0;

      items.push({
        time: bar.time,
        price,
        avgPrice,
        volume: barVol,
        displayVolume: barVol, // volume is already 5-min aggregated at boundary slots
        changePercent: Number(changePercent.toFixed(2)),
        date: dateStr,
        dayIndex: di,
        dayLabel,
        isDayStart: ti === 0,
      });
    }

    // Update prevClose for next day = last price of this day
    const lastBar = minuteBars[minuteBars.length - 1];
    if (lastBar && lastBar.price > 0) {
      prevClose = lastBar.price;
    }
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
  if (!payload.displayVolume || payload.displayVolume <= 0) return null;
  const isUp = payload.changePercent >= 0;
  // Make each 5-min bar wider to span its 5-slot window
  const barWidth = Math.max(width * 4.2, width);
  return (
    <rect
      x={x}
      y={y}
      width={barWidth}
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
      const availableHeight = window.innerHeight - rect.top - 20;
      const priceH = Math.max(250, Math.floor(availableHeight * 0.85));
      setChartHeight(priceH);
    };

    updateHeight();
    window.addEventListener("resize", updateHeight);
    const timer = setTimeout(updateHeight, 100);
    return () => {
      window.removeEventListener("resize", updateHeight);
      clearTimeout(timer);
    };
  }, []);

  const loadData = useCallback(async (sym: string) => {
    const fetchId = ++fetchIdRef.current;
    setFetching(true);
    setFetchError(null);

    try {
      const data = await fetch5MinKLine(sym, 1);
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

  useEffect(() => {
    if (!symbol) return;
    loadData(symbol);
  }, [symbol, loadData]);

  const loading = fetching && !dataLoaded;

  // Convert to 5-day timeline format with 1-min interpolation and equal-width padding
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

    // Consider all items for range calculation (including interpolated)
    let maxDeviation = 0;
    for (const item of items) {
      const dev = Math.abs(item.price - refP);
      if (dev > maxDeviation) maxDeviation = dev;
    }
    const padding = maxDeviation * 0.2 || refP * 0.02;
    const minP = refP - maxDeviation - padding;
    const maxP = refP + maxDeviation + padding;

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
    return items.reduce((mx, d) => Math.max(mx, d.displayVolume), 1);
  }, [items]);

  // ── 5-day highest / lowest price (from all data points, including interpolated) ──
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
      const realItems = dayItems.filter(d => d.displayVolume > 0);
      const open = realItems.length > 0 ? realItems[0].price : dayItems[0].price;
      const close = realItems.length > 0 ? realItems[realItems.length - 1].price : dayItems[dayItems.length - 1].price;
      const high = realItems.reduce((mx, d) => Math.max(mx, d.price), open);
      const low = realItems.reduce((mn, d) => Math.min(mn, d.price), open);
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
    return Math.max(150, Math.floor(chartHeight * 0.35));
  }, [chartHeight]);

  // XAxis tick interval — with ~1210 data points, show ~12-15 labels
  const xTickInterval = useMemo(() => {
    return Math.max(1, Math.floor(items.length / 14));
  }, [items.length]);

  // Bar size — volume bars are at 5-min boundaries only (~240 visible bars)
  // so we can use a slightly wider bar with gaps between them
  const barSize = useMemo(() => {
    if (items.length > 1000) return 3;
    if (items.length > 500) return 4;
    return 5;
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

      {/* 5-Day Price Chart */}
      <Card className="py-0 flex-1">
        <CardContent className="pb-1 pt-1 px-2">
          <div className="flex items-center gap-2 px-1 pt-1.5 pb-0.5">
            <span className="text-xs font-medium text-muted-foreground">五日分时图</span>
            {quote && <span className="text-[10px] text-muted-foreground ml-auto">{quote.symbol} {quote.name}</span>}
          </div>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <ComposedChart data={items} syncId="5dayTimeline" margin={{ top: 4, right: 60, left: 0, bottom: 0 }}>
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
              <Tooltip content={<FiveDayTooltip />} cursor={{ stroke: "#94a3b8", strokeWidth: 1, strokeDasharray: "4 2" }} wrapperStyle={{ background: "transparent", border: "none" }} />
              {refClose > 0 && <ReferenceLine y={refClose} stroke="#64748b" strokeDasharray="4 4" strokeWidth={0.8} />}
              {highestPrice != null && <ReferenceLine y={highestPrice} stroke="#f87171" strokeDasharray="6 4" strokeWidth={0.8} />}
              {lowestPrice != null && <ReferenceLine y={lowestPrice} stroke="#4ade80" strokeDasharray="6 4" strokeWidth={0.8} />}
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
                connectNulls={false}
              />
              <Area type="monotone" dataKey="avgPrice" stroke="#eab308" strokeWidth={1} fill="none" dot={false} isAnimationActive={false} strokeDasharray="3 2" connectNulls={false} />
              <Line type="monotone" dataKey="price" stroke="#ef4444" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} />
              <Customized component={(props: any) => <DayBoundaryLines {...props} dayBoundaries={dayBoundaries} dayLabels={dayLabels} chartHeight={chartHeight} />} />
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

      {/* 5-Day Volume Chart */}
      <Card className="py-0 mt-1">
        <CardContent className="pb-1 pt-0 px-2">
          <div className="flex items-center px-1 pt-0.5 pb-0">
            <span className="text-[10px] text-muted-foreground">成交量</span>
          </div>
          <ResponsiveContainer width="100%" height={volumeChartHeight}>
            <ComposedChart data={items} syncId="5dayTimeline" margin={{ top: 2, right: 60, left: 0, bottom: 0 }}>
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
                  if (!data || data.displayVolume <= 0) return null;
                  const isUp = data.changePercent >= 0;
                  return (
                    <div className="bg-card border border-border rounded-lg p-2 shadow-xl text-xs">
                      <div className="font-medium text-foreground mb-1">{data.date} {data.time}</div>
                      <div className="grid grid-cols-2 gap-y-0.5 gap-x-2">
                        <span className="text-muted-foreground">成交量</span>
                        <span className="text-right font-mono">{formatVolume(data.displayVolume)}</span>
                        <span className="text-muted-foreground">价格</span>
                        <span className={`text-right font-mono ${isUp ? "text-red-500" : "text-green-500"}`}>{data.price?.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                }}
                cursor={{ stroke: "#94a3b8", strokeWidth: 1, strokeDasharray: "4 2" }}
                wrapperStyle={{ background: "transparent", border: "none" }}
              />
              <Bar
                dataKey="displayVolume"
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
