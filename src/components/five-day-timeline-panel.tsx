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
import { formatVolume, formatAmount } from "@/lib/chart-shared";
import { analyzeFiveDayIntent, type FiveDayIntentResult, type DayIntentResult } from "@/lib/institutional-intent";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, ZoomIn, ZoomOut, Maximize2, ShieldAlert, TrendingUp, TrendingDown, Activity, Eye, BookOpen, ChevronDown, ChevronUp } from "lucide-react";

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

function generateFullDayTimeSlots(): string[] {
  const slots: string[] = [];
  for (let h = 9; h <= 11; h++) {
    const startMin = h === 9 ? 30 : 0;
    const endMin = h === 11 ? 30 : 59;
    for (let m = startMin; m <= endMin; m++) {
      slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  for (let h = 13; h <= 15; h++) {
    const endMin = h === 15 ? 0 : 59;
    for (let m = 0; m <= endMin; m++) {
      slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return slots;
}

const FULL_DAY_SLOTS = generateFullDayTimeSlots();
const SLOTS_PER_DAY = FULL_DAY_SLOTS.length;

// ── Data Fetching ──

interface KLine5Min {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function fetch5MinKLine(symbol: string, retryCount = 1): Promise<KLine5Min[]> {
  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      // Try the lightweight 5min-kline endpoint first (no MACD computation = faster)
      const res = await fetch(
        `/api/stock/ashare-5min-kline?symbol=${encodeURIComponent(symbol)}&limit=250`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (res.ok) {
        const data = await res.json();
        if (!data.error && Array.isArray(data.data) && data.data.length > 0) {
          return data.data.filter((d: any) => d.close > 0);
        }
      }
      // Fallback to full history endpoint (slower, has MACD/KDJ computation)
      const res2 = await fetch(
        `/api/stock/ashare-history?symbol=${encodeURIComponent(symbol)}&interval=5m&limit=250`,
        { signal: AbortSignal.timeout(12000) }
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
    // Only wait before retry, not after the first attempt
    if (attempt < retryCount) {
      await new Promise(r => setTimeout(r, 500)); // Reduced from 1500ms to 500ms
    }
  }
  return [];
}

// ── Helpers ──

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

interface MinuteBar {
  time: string;
  price: number;
  volume: number;
}

function interpolateDayTo1Min(dayKlines: KLine5Min[]): MinuteBar[] {
  const fiveMinMap = new Map<string, { price: number; volume: number; open: number }>();
  for (const k of dayKlines) {
    const timeStr = k.date.split(" ")[1]?.slice(0, 5) || "";
    if (timeStr) {
      fiveMinMap.set(timeStr, { price: k.close, volume: Math.max(0, k.volume), open: k.open });
    }
  }
  const anchors: { slotIdx: number; price: number; volume: number }[] = [];
  for (let i = 0; i < FULL_DAY_SLOTS.length; i++) {
    const bar = fiveMinMap.get(FULL_DAY_SLOTS[i]);
    if (bar) anchors.push({ slotIdx: i, price: bar.price, volume: bar.volume });
  }
  if (anchors.length === 0) return FULL_DAY_SLOTS.map(slot => ({ time: slot, price: 0, volume: 0 }));

  const result: MinuteBar[] = new Array(SLOTS_PER_DAY);
  const firstAnchor = anchors[0];
  for (let i = 0; i < firstAnchor.slotIdx; i++) {
    result[i] = { time: FULL_DAY_SLOTS[i], price: fiveMinMap.get(FULL_DAY_SLOTS[firstAnchor.slotIdx])?.open ?? firstAnchor.price, volume: 0 };
  }
  for (let a = 0; a < anchors.length; a++) {
    const curr = anchors[a];
    result[curr.slotIdx] = { time: FULL_DAY_SLOTS[curr.slotIdx], price: curr.price, volume: curr.volume };
    if (a < anchors.length - 1) {
      const next = anchors[a + 1];
      const span = next.slotIdx - curr.slotIdx;
      if (span > 1) {
        for (let j = curr.slotIdx + 1; j < next.slotIdx; j++) {
          const t = (j - curr.slotIdx) / span;
          result[j] = { time: FULL_DAY_SLOTS[j], price: curr.price + (next.price - curr.price) * t, volume: 0 };
        }
      }
    }
  }
  const lastAnchor = anchors[anchors.length - 1];
  for (let i = lastAnchor.slotIdx + 1; i < SLOTS_PER_DAY; i++) {
    result[i] = { time: FULL_DAY_SLOTS[i], price: lastAnchor.price, volume: 0 };
  }
  return result;
}

// Tencent timeline API returns volume in 手 (lots, 1 lot = 100 shares),
// while Sina K-line API returns volume in 股 (shares).
// For the 5-day chart where both sources are mixed, we must convert
// timeline volume to 股 by multiplying by 100 so units are consistent.
const VOL_LOT_TO_SHARE = 100;

function padLiveTimelineTo1Min(timelineData: TimelineItem[]): MinuteBar[] {
  const timeMap = new Map<string, { price: number; volume: number }>();
  for (const t of timelineData) timeMap.set(t.time, { price: t.price, volume: t.volume });

  const vol5Min = new Map<string, number>();
  for (const slot of FULL_DAY_SLOTS) {
    const bar = timeMap.get(slot);
    if (bar && bar.volume > 0) {
      const [h, m] = slot.split(":").map(Number);
      const totalMin = h * 60 + m;
      const boundaryMin = Math.floor(totalMin / 5) * 5;
      const bh = Math.floor(boundaryMin / 60);
      const bm = boundaryMin % 60;
      const boundaryKey = `${String(bh).padStart(2, "0")}:${String(bm).padStart(2, "0")}`;
      vol5Min.set(boundaryKey, (vol5Min.get(boundaryKey) || 0) + bar.volume * VOL_LOT_TO_SHARE);
    }
  }

  let lastPrice = 0;
  const result: MinuteBar[] = [];
  for (const slot of FULL_DAY_SLOTS) {
    const bar = timeMap.get(slot);
    if (bar && bar.price > 0) {
      lastPrice = bar.price;
      const [h, m] = slot.split(":").map(Number);
      const totalMin = h * 60 + m;
      const is5MinBoundary = totalMin % 5 === 0;
      result.push({ time: slot, price: bar.price, volume: is5MinBoundary ? (vol5Min.get(slot) || 0) : 0 });
    } else if (lastPrice > 0) {
      result.push({ time: slot, price: lastPrice, volume: 0 });
    } else {
      result.push({ time: slot, price: 0, volume: 0 });
    }
  }
  return result;
}

function convertTo5DayTimeline(
  klines: KLine5Min[],
  currentTimeline: TimelineItem[],
  quote: any,
  timelinePrevClose: number
): { items: FiveDayTimelineItem[]; dayBoundaries: number[]; dayLabels: string[]; prevClose: number; firstDayRefClose: number } {
  if (klines.length === 0 && currentTimeline.length === 0) {
    return { items: [], dayBoundaries: [], dayLabels: [], prevClose: 0, firstDayRefClose: 0 };
  }
  const dayMap = new Map<string, KLine5Min[]>();
  for (const k of klines) {
    const dateKey = k.date.split(" ")[0];
    if (!dateKey) continue;
    if (!dayMap.has(dateKey)) dayMap.set(dateKey, []);
    dayMap.get(dateKey)!.push(k);
  }
  const dates = Array.from(dayMap.keys()).sort();
  const last5Dates = dates.slice(-5);
  let prevClose = 0;
  if (dates.length > 5) {
    const beforeKlines = dayMap.get(dates[dates.length - 6]);
    if (beforeKlines && beforeKlines.length > 0) prevClose = beforeKlines[beforeKlines.length - 1].close;
  }
  if (prevClose <= 0) prevClose = timelinePrevClose || quote?.prevClose || 0;
  let firstDayRefClose = prevClose;
  const dayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
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
    const minuteBars = isLastDay && currentTimeline.length > 0
      ? padLiveTimelineTo1Min(currentTimeline)
      : interpolateDayTo1Min(dayMap.get(dateStr) || []);
    const dayOpen = minuteBars.length > 0 && minuteBars[0].price > 0 ? minuteBars[0].price : (prevClose || 0);
    const refClose = prevClose > 0 ? prevClose : dayOpen;
    if (di === 0) firstDayRefClose = refClose;
    let cumVol = 0, cumAmt = 0;
    for (let ti = 0; ti < minuteBars.length; ti++) {
      const bar = minuteBars[ti];
      const price = bar.price || prevClose || refClose;
      cumVol += bar.volume;
      cumAmt += bar.volume * price;
      const avgPrice = cumVol > 0 ? cumAmt / cumVol : price;
      const changePercent = refClose > 0 ? ((price - refClose) / refClose) * 100 : 0;
      items.push({
        time: bar.time, price, avgPrice, volume: bar.volume, displayVolume: bar.volume,
        changePercent: Number(changePercent.toFixed(2)), date: dateStr, dayIndex: di, dayLabel, isDayStart: ti === 0,
      });
    }
    const lastBar = minuteBars[minuteBars.length - 1];
    if (lastBar && lastBar.price > 0) prevClose = lastBar.price;
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
      <div className="font-medium mb-1.5 text-foreground">{data.date} {data.time}</div>
      <div className="grid grid-cols-2 gap-y-1 gap-x-3">
        <span className="text-muted-foreground">价格</span>
        <span className={`text-right font-mono ${isUp ? "text-red-500" : "text-green-500"}`}>{data.price?.toFixed(2)}</span>
        <span className="text-muted-foreground">均价</span>
        <span className="text-right font-mono text-yellow-500">{data.avgPrice?.toFixed(2)}</span>
        <span className="text-muted-foreground">涨跌幅</span>
        <span className={`text-right font-mono ${isUp ? "text-red-500" : "text-green-500"}`}>{data.changePercent?.toFixed(2)}%</span>
        <span className="text-muted-foreground">成交量</span>
        <span className="text-right font-mono">{formatVolume(data.volume)}</span>
        <span className="text-muted-foreground">成交额</span>
        <span className="text-right font-mono text-yellow-500">{formatAmount(data.volume * 100 * data.price)}</span>
      </div>
    </div>
  );
};

// ── Custom Y-Axis Tick ──

function PercentYTick(props: any) {
  const { x, y, payload, prevClose } = props;
  if (!prevClose || prevClose <= 0) {
    return <text x={x} y={y} dy={4} textAnchor="end" fontSize={9} fontFamily="monospace" fill="#94a3b8">{payload.value.toFixed(2)}</text>;
  }
  const pct = ((payload.value - prevClose) / prevClose) * 100;
  const isZero = Math.abs(pct) < 0.01;
  const isUp = pct >= 0;

  if (isZero) {
    return (
      <g>
        <text x={x} y={y} textAnchor="end" fontSize={10} fontFamily="monospace" fontWeight={700} fill="#ef4444">{payload.value.toFixed(2)}</text>
        <text x={x} y={y + 12} textAnchor="end" fontSize={8} fontWeight={600} fill="#ef4444" opacity={0.8}>0.0%</text>
      </g>
    );
  }

  return (
    <g>
      <text x={x} y={y} textAnchor="end" fontSize={9} fontFamily="monospace" fill={isUp ? "#ef4444" : "#16a34a"}>{payload.value.toFixed(2)}</text>
      <text x={x} y={y + 11} textAnchor="end" fontSize={7} fill={isUp ? "#ef4444" : "#16a34a"} opacity={0.7}>{isUp ? "+" : ""}{pct.toFixed(1)}%</text>
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
        <text key={`day-label-${i}`} x={x + 4} y={14} fontSize={9} fill="#94a3b8" fontWeight={500}>{dayLabels[i] || ""}</text>
      );
    }
  }
  if (dayBoundaries.length > 0 && dayBoundaries[0] < points.length && points[dayBoundaries[0]]) {
    result.push(<text key="day-label-0" x={points[dayBoundaries[0]].x + 4} y={14} fontSize={9} fill="#94a3b8" fontWeight={500}>{dayLabels[0] || ""}</text>);
  }
  return <g>{result}</g>;
}

// ── Volume Bar Shape ──

function VolumeBarShape(props: any) {
  const { x, y, width, height, payload } = props;
  if (!height || Math.abs(height) < 0.3) return null;
  if (!payload.displayVolume || payload.displayVolume <= 0) return null;
  const isUp = payload.changePercent >= 0;
  const barWidth = Math.max(width * 4.2, width);
  return <rect x={x} y={y} width={barWidth} height={height} fill={isUp ? "rgba(239,68,68,1)" : "rgba(22,163,74,1)"} />;
}

// ── Institutional Intent Analysis Panel ──

function InstitutionalIntentPanel({ result }: { result: FiveDayIntentResult }) {
  const { overallIntent, dailyIntents, trendPhase, riskLevel } = result;

  const riskLabel = ["", "低", "较低", "中等", "较高", "高"][riskLevel] || "中等";
  const riskColor = riskLevel >= 4 ? "text-red-500" : riskLevel >= 3 ? "text-yellow-500" : "text-green-500";

  return (
    <div className={`rounded-lg border-2 ${overallIntent.borderColor} ${overallIntent.bgColor} p-4 mb-2`}>
      {/* Overall header */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="text-xl font-bold">{overallIntent.icon}</span>
        <span className={`text-base font-bold ${overallIntent.color}`}>
          主力意图：{overallIntent.intent}
        </span>
        <Badge variant="outline" className={`text-xs h-6 ${overallIntent.color} ${overallIntent.borderColor}`}>
          置信度 {overallIntent.confidence}%
        </Badge>
        <Badge variant="outline" className={`text-xs h-6 ${riskColor} border-current/30`}>
          风险{riskLabel}
        </Badge>
        <span className="text-sm text-muted-foreground">·</span>
        <span className="text-sm text-muted-foreground font-medium">{trendPhase}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <Eye className="w-4 h-4 text-muted-foreground" />
          <span className={`text-sm font-medium ${overallIntent.color}`}>{overallIntent.suggestion}</span>
        </div>
      </div>

      {/* Reasons */}
      {overallIntent.reasons.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
          {overallIntent.reasons.map((r, i) => (
            <span key={i}>• {r}</span>
          ))}
        </div>
      )}

      {/* Daily breakdown */}
      {dailyIntents.length > 0 && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {dailyIntents.map((d, i) => (
            <div
              key={i}
              className={`rounded-md border ${d.intent.borderColor} ${d.intent.bgColor} px-3 py-2`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-sm font-medium text-foreground">{d.dayLabel}</span>
                <span className="text-sm">{d.intent.icon}</span>
                <span className={`text-xs font-bold ${d.intent.color}`}>{d.intent.intent}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className={`font-mono ${d.changePercent >= 0 ? "text-red-500" : "text-green-500"}`}>
                  {d.changePercent >= 0 ? "+" : ""}{d.changePercent.toFixed(2)}%
                </span>
                <span className="text-muted-foreground">量{formatVolume(d.totalVolume)}</span>
              </div>
              {d.intent.reasons.length > 0 && (
                <div className="text-[11px] text-muted-foreground mt-1 leading-snug">
                  {d.intent.reasons[0]}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Volume/Price pattern summary */}
      <div className="mt-3 flex items-center gap-5 text-xs text-muted-foreground">
        <span>量能特征：{overallIntent.volumePattern}</span>
        <span>价格特征：{overallIntent.pricePattern}</span>
      </div>
    </div>
  );
}

// ── Intent Explanation Panel (collapsible) ──

function IntentExplanationPanel() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card/50 mt-3 mb-2">
      <button
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(prev => !prev)}
      >
        <BookOpen className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium text-foreground">主力意图识别原理说明</span>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-muted-foreground ml-auto" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground ml-auto" />
        }
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-4 text-xs text-muted-foreground leading-relaxed">
          {/* 核心原理 */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-1.5">核心原理</h4>
            <p>主力资金的操作必然在<strong className="text-foreground">量价关系</strong>上留下痕迹。通过分析5日分时图中的成交量与价格走势的配合模式，可以推断主力是在悄悄买入（吸筹）、高位抛售（出货）、震仓洗盘（洗盘）还是强力上攻（拉升）。</p>
          </div>

          {/* 吸筹 */}
          <div className="rounded-md border border-green-500/20 bg-green-500/5 p-3">
            <h4 className="text-sm font-semibold text-green-600 dark:text-green-400 mb-1.5">🟢 吸筹 — 主力悄悄买入</h4>
            <div className="space-y-1">
              <p><strong className="text-foreground">量价配合：</strong>上涨时放量、下跌时缩量，说明主力在上涨时积极买入，下跌时不愿卖出</p>
              <p><strong className="text-foreground">均价线回归：</strong>价格围绕均价线震荡回升，说明主力在均价线附近持续吸筹</p>
              <p><strong className="text-foreground">V型回升：</strong>早盘下探后午后回升，主力利用早盘打压吸筹</p>
              <p><strong className="text-foreground">尾盘放量：</strong>尾盘成交量大于开盘，主力在收盘前抢筹</p>
              <p><strong className="text-foreground">量能均匀：</strong>成交量分布均匀无剧烈波动，说明主力稳步吸筹而非散户冲动交易</p>
            </div>
          </div>

          {/* 出货 */}
          <div className="rounded-md border border-red-500/20 bg-red-500/5 p-3">
            <h4 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-1.5">🔴 出货 — 主力高位抛售</h4>
            <div className="space-y-1">
              <p><strong className="text-foreground">下跌放量：</strong>价格下跌伴随大量成交，主力借高位大量抛售筹码</p>
              <p><strong className="text-foreground">冲高回落：</strong>价格冲高后跌破均价线，主力拉高引诱跟风后出货</p>
              <p><strong className="text-foreground">早盘冲高回落：</strong>开盘快速拉高后持续下跌，利用开盘人气派发</p>
              <p><strong className="text-foreground">假突破：</strong>放量上攻但收盘偏弱，主力制造突破假象吸引买盘后出货</p>
              <p><strong className="text-foreground">开盘放量滞涨：</strong>开盘成交量很大但涨幅有限，主力趁开盘活跃出货</p>
              <p><strong className="text-foreground">尾盘放量下杀：</strong>收盘前放量下跌，主力尾盘集中抛售</p>
            </div>
          </div>

          {/* 洗盘 */}
          <div className="rounded-md border border-yellow-500/20 bg-yellow-500/5 p-3">
            <h4 className="text-sm font-semibold text-yellow-600 dark:text-yellow-400 mb-1.5">🟡 洗盘 — 主力震仓清洗浮筹</h4>
            <div className="space-y-1">
              <p><strong className="text-foreground">快速下探收回：</strong>日内大幅下探后迅速收回，主力故意打压制造恐慌</p>
              <p><strong className="text-foreground">大振幅小涨跌：</strong>日内振幅大但收盘变化小，说明主力在震荡中清洗浮筹</p>
              <p><strong className="text-foreground">低位放量缩量回升：</strong>低位出现放量（恐慌盘涌出），随后缩量回升（主力不再抛售）</p>
            </div>
          </div>

          {/* 拉升 */}
          <div className="rounded-md border border-red-500/20 bg-red-500/5 p-3">
            <h4 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-1.5">🚀 拉升 — 主力强力上攻</h4>
            <div className="space-y-1">
              <p><strong className="text-foreground">放量拉升：</strong>涨幅大于1.5%且上涨段成交量占比高，主力大举进攻</p>
              <p><strong className="text-foreground">收盘近高点：</strong>收盘价接近日内最高价，说明主力全天控盘且无出货意愿</p>
              <p><strong className="text-foreground">午后突破：</strong>午后放量突破早盘高点，主力选择午后发力</p>
              <p><strong className="text-foreground">远超均价线：</strong>价格远高于均价线，说明主力持续推升</p>
              <p><strong className="text-foreground">量能递增：</strong>成交量逐步放大，资金持续涌入</p>
            </div>
          </div>

          {/* 综合判断 */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-1.5">五日综合判断逻辑</h4>
            <div className="space-y-1">
              <p>1. 每日独立分析量价特征，计算吸筹/出货/洗盘/拉升各项评分</p>
              <p>2. 取评分最高的意图作为当日判断，评分越高置信度越高</p>
              <p>3. 五日综合采用<strong className="text-foreground">时间加权</strong>：越近的日期权重越大（最近一日权重最高）</p>
              <p>4. 根据综合得分判断主力阶段：底部吸筹区 / 震荡吸筹区 / 拉升初期 / 拉升后期 / 高位出货区 / 洗盘整理区</p>
            </div>
          </div>

          {/* 免责 */}
          <div className="pt-1 border-t border-border">
            <p className="text-[11px] italic">以上识别逻辑基于量价关系的技术分析，仅供参考，不构成投资建议。主力行为可能存在伪装，实际操作请结合多维度信息综合判断。</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ──

const MIN_VISIBLE_POINTS = 60;  // ~1 hour of 1-min data
const ZOOM_STEP = 0.15;         // 15% zoom per scroll tick

export const FiveDayTimelinePanel = React.memo(function FiveDayTimelinePanel({ symbol, quote, timeline, timelinePrevClose }: FiveDayTimelinePanelProps) {
  const [kline5Min, setKline5Min] = useState<KLine5Min[]>([]);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const fetchIdRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartWrapperRef = useRef<HTMLDivElement>(null);
  const [chartHeight, setChartHeight] = useState(500);

  // ── Zoom & Pan State ──
  const [visibleRange, setVisibleRange] = useState<[number, number] | null>(null); // null = show all
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartRange = useRef<[number, number]>([0, 0]);

  // Auto-fit chart height
  useEffect(() => {
    const updateHeight = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const availableHeight = window.innerHeight - rect.top - 20;
      setChartHeight(Math.max(300, Math.floor(availableHeight * 0.92)));
    };
    updateHeight();
    window.addEventListener("resize", updateHeight);
    const timer = setTimeout(updateHeight, 100);
    return () => { window.removeEventListener("resize", updateHeight); clearTimeout(timer); };
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
      if (data.length === 0) setFetchError("未获取到5分钟K线数据");
    } catch (e) {
      if (fetchId !== fetchIdRef.current) return;
      setFetchError("获取数据失败，请重试");
    } finally {
      if (fetchId === fetchIdRef.current) setFetching(false);
    }
  }, []);

  useEffect(() => { if (symbol) loadData(symbol); }, [symbol, loadData]);

  // Reset zoom on symbol change
  useEffect(() => { setVisibleRange(null); }, [symbol]);

  const loading = fetching && !dataLoaded;

  // Full data
  const { items, dayBoundaries, dayLabels, prevClose, firstDayRefClose } = useMemo(() => {
    if (kline5Min.length === 0 && timeline.length === 0) return { items: [], dayBoundaries: [], dayLabels: [], prevClose: 0, firstDayRefClose: 0 };
    return convertTo5DayTimeline(kline5Min, timeline, quote, timelinePrevClose);
  }, [kline5Min, timeline, quote, timelinePrevClose]);

  // ── Institutional Intent Analysis ──
  const intentResult = useMemo(() => {
    if (items.length < 10 || dayBoundaries.length === 0) return null;
    return analyzeFiveDayIntent(items, dayBoundaries, dayLabels, prevClose);
  }, [items, dayBoundaries, dayLabels, prevClose]);

  // ── Visible slice ──
  const totalItems = items.length;
  const [visStart, visEnd] = visibleRange || [0, totalItems];
  const visibleItems = useMemo(() => items.slice(visStart, visEnd), [items, visStart, visEnd]);

  // Adjust dayBoundaries to visible slice
  const visibleDayBoundaries = useMemo(() => {
    const bounds: number[] = [];
    for (const b of dayBoundaries) {
      const adj = b - visStart;
      if (adj >= 0 && adj < visEnd - visStart) bounds.push(adj);
    }
    return bounds;
  }, [dayBoundaries, visStart, visEnd]);

  // ── Wheel zoom handler ──
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    if (totalItems === 0) return;

    const currentStart = visibleRange ? visibleRange[0] : 0;
    const currentEnd = visibleRange ? visibleRange[1] : totalItems;
    const currentCount = currentEnd - currentStart;

    // Mouse position ratio within chart
    const wrapper = chartWrapperRef.current;
    let mouseRatio = 0.5; // default center
    if (wrapper) {
      const rect = wrapper.getBoundingClientRect();
      if (rect.width > 0) {
        mouseRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      }
    }

    // Mouse index in data space
    const mouseIdx = currentStart + mouseRatio * currentCount;

    // Zoom factor: scroll up (deltaY < 0) = zoom in, scroll down = zoom out
    const zoomFactor = e.deltaY < 0 ? (1 - ZOOM_STEP) : (1 + ZOOM_STEP);
    let newCount = Math.round(currentCount * zoomFactor);
    newCount = Math.max(MIN_VISIBLE_POINTS, Math.min(totalItems, newCount));

    // Calculate new start/end, keeping mouse position anchored
    const leftRatio = mouseRatio;
    const rightRatio = 1 - mouseRatio;
    let newStart = Math.round(mouseIdx - leftRatio * newCount);
    let newEnd = newStart + newCount;

    if (newStart < 0) { newStart = 0; newEnd = Math.min(totalItems, newCount); }
    if (newEnd > totalItems) { newEnd = totalItems; newStart = Math.max(0, totalItems - newCount); }

    // If showing all data, reset to null
    if (newEnd - newStart >= totalItems) {
      setVisibleRange(null);
    } else {
      setVisibleRange([newStart, newEnd]);
    }
  }, [totalItems, visibleRange]);

  // Attach wheel event (passive: false to allow preventDefault)
  useEffect(() => {
    const wrapper = chartWrapperRef.current;
    if (!wrapper) return;
    wrapper.addEventListener("wheel", handleWheel, { passive: false });
    return () => wrapper.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // ── Drag pan handler ──
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (visibleRange === null) return; // only pan when zoomed
    if (e.button !== 0) return; // left click only
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartRange.current = [...visibleRange] as [number, number];
    e.preventDefault();
  }, [visibleRange]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const wrapper = chartWrapperRef.current;
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    if (rect.width <= 0) return;

    const dx = e.clientX - dragStartX.current;
    const pixelsPerPoint = rect.width / (dragStartRange.current[1] - dragStartRange.current[0]);
    const indexShift = Math.round(-dx / pixelsPerPoint);

    let newStart = dragStartRange.current[0] + indexShift;
    let newEnd = dragStartRange.current[1] + indexShift;
    const count = newEnd - newStart;

    if (newStart < 0) { newStart = 0; newEnd = count; }
    if (newEnd > totalItems) { newEnd = totalItems; newStart = totalItems - count; }

    setVisibleRange([newStart, newEnd]);
  }, [totalItems]);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // ── Computed values based on visible slice ──
  const { minPrice, maxPrice, refClose: chartRefClose, yTicks } = useMemo(() => {
    if (visibleItems.length === 0) return { minPrice: 0, maxPrice: 100, refClose: 0, yTicks: undefined as number[] | undefined };
    const refP = firstDayRefClose || visibleItems[0]?.price || 100;
    let maxDeviation = 0;
    for (const item of visibleItems) {
      const dev = Math.abs(item.price - refP);
      if (dev > maxDeviation) maxDeviation = dev;
    }
    const padding = maxDeviation * 0.2 || refP * 0.02;
    const minP = refP - maxDeviation - padding;
    const maxP = refP + maxDeviation + padding;
    const range = maxP - minP;
    const step = range / 4;
    return { minPrice: minP, maxPrice: maxP, refClose: refP, yTicks: [refP - 2 * step, refP - step, refP, refP + step, refP + 2 * step] };
  }, [visibleItems, firstDayRefClose]);

  const maxVolume = useMemo(() => visibleItems.reduce((mx, d) => Math.max(mx, d.displayVolume), 1), [visibleItems]);

  const { highestPrice, lowestPrice } = useMemo(() => {
    if (visibleItems.length === 0) return { highestPrice: null, lowestPrice: null };
    let hi = -Infinity, lo = Infinity;
    for (const d of visibleItems) { if (d.price > hi) hi = d.price; if (d.price < lo) lo = d.price; }
    return { highestPrice: isFinite(hi) ? hi : null, lowestPrice: isFinite(lo) ? lo : null };
  }, [visibleItems]);

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
      stats.push({ date: dayItems[0].date, label: dayLabels[di] || dayItems[0].date.slice(5), open, close, change, high, low });
    }
    return stats;
  }, [items, dayBoundaries, dayLabels, prevClose]);

  const volumeChartHeight = useMemo(() => Math.max(130, Math.floor(chartHeight * 0.28)), [chartHeight]);

  const xTickInterval = useMemo(() => Math.max(1, Math.floor(visibleItems.length / 14)), [visibleItems.length]);

  const barSize = useMemo(() => {
    if (visibleItems.length > 800) return 3;
    if (visibleItems.length > 400) return 4;
    if (visibleItems.length > 200) return 5;
    return 6;
  }, [visibleItems.length]);

  // Zoom percentage for indicator
  const zoomPercent = visibleRange ? Math.round((visEnd - visStart) / totalItems * 100) : 100;

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
        <span className="text-sm text-muted-foreground">{fetchError || "暂无五日分时数据"}</span>
        <Button variant="outline" size="sm" className="text-xs" onClick={() => loadData(symbol)} disabled={fetching}>
          <RefreshCw className={`h-3 w-3 mr-1 ${fetching ? "animate-spin" : ""}`} />重新加载
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
                    <span className={`font-mono text-[10px] ${isUp ? "text-red-500" : "text-green-500"}`}>{isUp ? "+" : ""}{ds.change.toFixed(2)}%</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Institutional Intent Analysis ── */}
      {intentResult && <InstitutionalIntentPanel result={intentResult} />}

      {/* Zoom Controls & Indicator */}
      <div className="flex items-center gap-1 px-1 mb-1">
        <div className="flex items-center gap-1 mr-2">
          <Button
            variant="outline" size="sm" className="h-6 w-6 p-0"
            onClick={() => {
              if (totalItems === 0) return;
              const curStart = visibleRange ? visibleRange[0] : 0;
              const curEnd = visibleRange ? visibleRange[1] : totalItems;
              const curCount = curEnd - curStart;
              const newCount = Math.max(MIN_VISIBLE_POINTS, Math.round(curCount * 0.75));
              const center = Math.round((curStart + curEnd) / 2);
              let ns = center - Math.round(newCount / 2);
              let ne = ns + newCount;
              if (ns < 0) { ns = 0; ne = Math.min(totalItems, newCount); }
              if (ne > totalItems) { ne = totalItems; ns = Math.max(0, totalItems - newCount); }
              setVisibleRange([ns, ne]);
            }}
            title="放大"
          >
            <ZoomIn className="h-3 w-3" />
          </Button>
          <Button
            variant="outline" size="sm" className="h-6 w-6 p-0"
            onClick={() => {
              if (totalItems === 0) return;
              const curStart = visibleRange ? visibleRange[0] : 0;
              const curEnd = visibleRange ? visibleRange[1] : totalItems;
              const curCount = curEnd - curStart;
              const newCount = Math.min(totalItems, Math.round(curCount * 1.35));
              const center = Math.round((curStart + curEnd) / 2);
              let ns = center - Math.round(newCount / 2);
              let ne = ns + newCount;
              if (ns < 0) { ns = 0; ne = Math.min(totalItems, newCount); }
              if (ne > totalItems) { ne = totalItems; ns = Math.max(0, totalItems - newCount); }
              if (ne - ns >= totalItems) setVisibleRange(null);
              else setVisibleRange([ns, ne]);
            }}
            title="缩小"
          >
            <ZoomOut className="h-3 w-3" />
          </Button>
          {visibleRange && (
            <Button
              variant="outline" size="sm" className="h-6 px-2 text-[10px]"
              onClick={() => setVisibleRange(null)}
              title="重置缩放"
            >
              <Maximize2 className="h-3 w-3 mr-1" />全景
            </Button>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">
          {zoomPercent < 100 ? `${zoomPercent}%` : "全景"}
        </span>
        <span className="text-[10px] text-muted-foreground ml-auto">
          滚轮缩放 · 拖拽平移
        </span>
      </div>

      {/* Chart wrapper — handles wheel zoom & drag pan */}
      <div
        ref={chartWrapperRef}
        className="select-none"
        onMouseDown={(e) => { e.currentTarget.style.cursor = "grabbing"; handleMouseDown(e); }}
        onMouseMove={handleMouseMove}
        onMouseUp={(e) => { e.currentTarget.style.cursor = visibleRange ? "grab" : "default"; handleMouseUp(); }}
        onMouseLeave={(e) => { e.currentTarget.style.cursor = visibleRange ? "grab" : "default"; handleMouseUp(); }}
        style={{ cursor: visibleRange ? "grab" : "default" }}
      >
        {/* 5-Day Price Chart */}
        <Card className="py-0 flex-1">
          <CardContent className="pb-1 pt-1 px-2">
            <div className="flex items-center gap-2 px-1 pt-1.5 pb-0.5">
              <span className="text-xs font-medium text-muted-foreground">五日分时图</span>
              {quote && <span className="text-[10px] text-muted-foreground ml-auto">{quote.symbol} {quote.name}</span>}
            </div>
            <ResponsiveContainer width="100%" height={chartHeight}>
              <ComposedChart data={visibleItems} syncId="5dayTimeline" margin={{ top: 4, right: 80, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} vertical={false} />
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={{ stroke: "#334155", strokeWidth: 0.5 }} interval={xTickInterval} />
                <YAxis domain={[minPrice, maxPrice]} tickLine={false} axisLine={false} width={65} tick={<PercentYTick prevClose={refClose} />} ticks={yTicks} tickCount={5} />
                <Tooltip content={<FiveDayTooltip />} cursor={{ stroke: "#94a3b8", strokeWidth: 1, strokeDasharray: "4 2" }} wrapperStyle={{ background: "transparent", border: "none" }} />
                {refClose > 0 && <ReferenceLine y={refClose} stroke="#64748b" strokeWidth={0.8} />}
                {highestPrice != null && <ReferenceLine y={highestPrice} stroke="#ef4444" strokeDasharray="8 4" strokeWidth={1.8} />}
                {lowestPrice != null && <ReferenceLine y={lowestPrice} stroke="#22c55e" strokeDasharray="8 4" strokeWidth={1.8} />}
                <Area type="monotone" dataKey="price" stroke="none" fill={(() => { const last = visibleItems[visibleItems.length - 1]; return last?.price >= refClose ? "rgba(239,68,68,0.06)" : "rgba(22,163,74,0.06)"; })()} isAnimationActive={false} connectNulls={false} />
                <Line type="monotone" dataKey="avgPrice" stroke="#ca8a04" strokeWidth={1.5} fill="none" dot={false} isAnimationActive={false} strokeDasharray="5 3" connectNulls={false} />
                <Line type="monotone" dataKey="price" stroke="#ef4444" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} />
                <Customized component={(props: any) => <DayBoundaryLines {...props} dayBoundaries={visibleDayBoundaries} dayLabels={dayLabels} chartHeight={chartHeight} />} />
                <Customized component={(props: any) => {
                  const { yAxisMap } = props;
                  if (!yAxisMap || (highestPrice == null && lowestPrice == null) || refClose <= 0) return null;
                  const yAxis = Object.values(yAxisMap)[0] as any;
                  if (!yAxis) return null;
                  const yScale = yAxis.scale;
                  const chartRight = (yAxis.x || 0) + (yAxis.width || 0);
                  const els: React.ReactNode[] = [];
                  if (highestPrice != null) {
                    const y = yScale(highestPrice);
                    if (y != null && !isNaN(y)) {
                      const pct = ((highestPrice - refClose) / refClose * 100);
                      els.push(
                        <g key="hi-tag">
                          <polygon points={`${chartRight - 8},${y + 5} ${chartRight + 2},${y + 5} ${chartRight - 3},${y - 3}`} fill="#ef4444" />
                          <rect x={chartRight + 1} y={y - 17} width={76} height={34} rx={3} fill="#ef4444" fillOpacity={0.6} />
                          <text x={chartRight + 39} y={y - 2} textAnchor="middle" fontSize={10} fontFamily="monospace" fontWeight={700} fill="#ffffff">{highestPrice.toFixed(2)}</text>
                          <text x={chartRight + 39} y={y + 12} textAnchor="middle" fontSize={9} fontFamily="monospace" fontWeight={600} fill="rgba(255,255,255,0.85)">+{pct.toFixed(2)}%</text>
                        </g>
                      );
                    }
                  }
                  if (lowestPrice != null) {
                    const y = yScale(lowestPrice);
                    if (y != null && !isNaN(y)) {
                      const pct = ((lowestPrice - refClose) / refClose * 100);
                      els.push(
                        <g key="lo-tag">
                          <polygon points={`${chartRight - 8},${y - 5} ${chartRight + 2},${y - 5} ${chartRight - 3},${y + 3}`} fill="#22c55e" />
                          <rect x={chartRight + 1} y={y - 17} width={76} height={34} rx={3} fill="#22c55e" fillOpacity={0.6} />
                          <text x={chartRight + 39} y={y - 2} textAnchor="middle" fontSize={10} fontFamily="monospace" fontWeight={700} fill="#ffffff">{lowestPrice.toFixed(2)}</text>
                          <text x={chartRight + 39} y={y + 12} textAnchor="middle" fontSize={9} fontFamily="monospace" fontWeight={600} fill="rgba(255,255,255,0.85)">{pct >= 0 ? "+" : ""}{pct.toFixed(2)}%</text>
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
              <ComposedChart data={visibleItems} syncId="5dayTimeline" margin={{ top: 2, right: 80, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} vertical={false} />
                <XAxis dataKey="time" tick={{ fontSize: 8, fill: "#64748b" }} tickLine={false} axisLine={{ stroke: "#334155", strokeWidth: 0.5 }} interval={xTickInterval} />
                <YAxis domain={[0, maxVolume * 1.2]} tickLine={false} axisLine={false} width={65} tickFormatter={(v: number) => formatVolume(v)} tick={{ fontSize: 8, fill: "#64748b" }} tickCount={3} />
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
                          <span className="text-muted-foreground">成交额</span>
                          <span className="text-right font-mono text-yellow-500">{formatAmount(data.displayVolume * 100 * data.price)}</span>
                          <span className="text-muted-foreground">价格</span>
                          <span className={`text-right font-mono ${isUp ? "text-red-500" : "text-green-500"}`}>{data.price?.toFixed(2)}</span>
                        </div>
                      </div>
                    );
                  }}
                  cursor={{ stroke: "#94a3b8", strokeWidth: 1, strokeDasharray: "4 2" }}
                  wrapperStyle={{ background: "transparent", border: "none" }}
                />
                <Bar dataKey="displayVolume" isAnimationActive={false} barSize={barSize} shape={VolumeBarShape} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Intent Explanation Panel — 底部说明 */}
      <IntentExplanationPanel />
    </div>
  );
});
