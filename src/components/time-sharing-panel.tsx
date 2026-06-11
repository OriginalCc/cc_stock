"use client";

import dynamic from "next/dynamic";
import React, { useState, useRef, useMemo, useEffect, useCallback, useDeferredValue } from "react";
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
import {
  type TSignal,
  type MergedSignal,
  type PulseVolumeMarker,
  REGIME_CONFIG,
  T_MODE_CONFIG,
  formatVolume,
  formatAmount,
  formatPrice,
  generateTimelineSignals,
  getStrengthLabel,
  getStrengthColor,
  pvParseTime,
} from "@/lib/chart-shared";
import { fullDayDataCache, regimeDetailCache, intradayIntentCache, FingerprintCache } from "@/lib/fingerprint-cache";
import { ALL_TRADE_TIMES } from "@/lib/trading-times";
import {
  detectMarketRegimeDetail,
  getTimeWindow,
  type Strength,
  type RegimeDetail,
} from "@/lib/t-strategy";
import { analyzeIntradayIntent, type IntradayIntentResult } from "@/lib/institutional-intent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

// ── Overlay computation cache ──
// Avoids recomputing signals/labels when recharts gives us new object refs
// but the underlying data hasn't actually changed (e.g. during crosshair moves).
const overlayCache = new FingerprintCache<{
  signalResult: { signalElements: React.ReactNode[]; prioritySignalElements: React.ReactNode[]; bubbleElements: React.ReactNode[] } | null;
  pvPlacedLabels: PlacedLabel[];
}>();

const banCache = new FingerprintCache<{
  tier: "mild" | "medium" | "strong" | "extreme";
  banEndTime: number;
  banEndTimeStr: string;
  declineScore: number;
  dropRate: number;
  volRatio: number;
  speedIndex: number;
  stabilityIndex: number;
  waveCount: number;
  vwapDeviation: number;
  gapDownRate: number;
  dangerIndex: number;
  earlyLifted: boolean;
} | null>();

// Dynamic import for MiniTimelinePanel (code-split for faster page load)
const MiniTimelinePanel = dynamic(() => import("@/components/mini-timeline-panel").then(m => ({ default: m.MiniTimelinePanel })), { ssr: false });

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

// ── Tooltip Components ─────────────────────────────────

const TimelineTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  if (!data || !data.hasData) return null;

  const isUp = data.changePercent >= 0;
  const signal = data.tSignal as TSignal | undefined;

  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-xs min-w-[160px]">
      <div className="font-medium mb-2 text-foreground">{data.time}</div>
      <div className="grid grid-cols-2 gap-y-1 gap-x-3">
        <span className="text-muted-foreground">价格</span>
        <span className={`text-right font-mono ${isUp ? "text-red-500" : "text-green-500"}`}>{formatPrice(data.price)}</span>
        <span className="text-muted-foreground">均价</span>
        <span className="text-right font-mono text-yellow-500">{formatPrice(data.avgPrice)}</span>
        <span className="text-muted-foreground">涨跌</span>
        <span className={`text-right font-mono ${isUp ? "text-red-500" : "text-green-500"}`}>{data.changePercent?.toFixed(2) ?? "--"}%</span>
        <span className="text-muted-foreground">成交量</span>
        <span className="text-right font-mono">{formatVolume(data.volume)}</span>
        <span className="text-muted-foreground">成交额</span>
        <span className="text-right font-mono text-yellow-500">{formatAmount(data.volume * 100 * (data.price ?? 0))}</span>
      </div>
      {signal && (
        <div className="mt-2 pt-2 border-t border-border">
          <Badge variant={signal.type === "buy" ? "default" : signal.type === "stoploss" ? "outline" : "destructive"} className="text-xs">
            {signal.type === "buy" ? "买入" : signal.type === "stoploss" ? "止损" : "卖出"} · {signal.reason}
            {signal.strength === "strong" ? " (强)" : signal.strength === "medium" ? " (中)" : " (弱)"}
          </Badge>
          {signal.tMode && (
            <div className="text-[10px] text-muted-foreground mt-1">
              模式: {signal.tMode} {signal.timeWindow && `· ${signal.timeWindow}`}
            </div>
          )}
          {signal.description && (
            <div className="text-[10px] text-muted-foreground">{signal.description}</div>
          )}
        </div>
      )}
    </div>
  );
};

const TimelineVolumeTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload as TimelineItem & { volColor?: string; hasData?: boolean };
  if (!data || !data.hasData) return null;
  const isUp = data.changePercent >= 0;

  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-xs min-w-[140px]">
      <div className="font-medium mb-1 text-foreground">{data.time}</div>
      <div className="grid grid-cols-2 gap-y-1 gap-x-3">
        <span className="text-muted-foreground">成交量</span>
        <span className="text-right font-mono">{formatVolume(data.volume)}</span>
        <span className="text-muted-foreground">成交额</span>
        <span className="text-right font-mono text-yellow-500">{formatAmount(data.volume * 100 * (data.price ?? 0))}</span>
        <span className="text-muted-foreground">价格</span>
        <span className={`text-right font-mono ${isUp ? "text-red-500" : "text-green-500"}`}>{formatPrice(data.price)}</span>
      </div>
    </div>
  );
};

const TimelineMACDTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  if (!data || !data.hasData) return null;

  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-xs min-w-[160px]">
      <div className="font-medium mb-2 text-foreground">{data.time || data.date || ""}</div>
      <div className="grid grid-cols-2 gap-y-1 gap-x-3">
        <span className="text-muted-foreground">DIF</span>
        <span className="text-right font-mono">{data.dif != null ? data.dif.toFixed(4) : "--"}</span>
        <span className="text-muted-foreground">DEA</span>
        <span className="text-right font-mono">{data.dea != null ? data.dea.toFixed(4) : "--"}</span>
        <span className="text-muted-foreground">MACD</span>
        <span className={`text-right font-mono ${data.macd != null && data.macd > 0 ? "text-red-500" : "text-green-500"}`}>
          {data.macd != null ? data.macd.toFixed(4) : "--"}
        </span>
      </div>
    </div>
  );
};

// ── Pulse/Volume Surge Renderer for Timeline Chart ──────
// Renders colored markers on the timeline chart for pulse and volume surge events.
// Pulse = lightning bolt icon (⚡) in orange/amber
// Volume surge = rising arrow icon (📈) in cyan/teal

// ── Extract Pulse/Volume marker data from chart points (shared by standalone & combined renderers) ──

function extractPulseVolumePoints(formattedGraphicalItems: any[]): { x: number; y: number; marker: PulseVolumeMarker }[] {
  let priceLineData: any[] = [];
  for (const item of formattedGraphicalItems) {
    if (item?.props?.points && Array.isArray(item.props.points)) {
      const stroke = item.props.stroke || item?.props?.lineProps?.stroke;
      if (stroke === "#eab308" || stroke === "#facc15" || stroke === "#ca8a04") continue;
      if (priceLineData.length === 0) {
        priceLineData = item.props.points;
      }
    }
  }
  if (priceLineData.length === 0) return [];

  const markers: PulseVolumeMarker[] = [];
  const seen = new Set<string>();
  for (const point of priceLineData) {
    const pvMarker = point?.payload?.pvMarker as PulseVolumeMarker[] | undefined;
    if (pvMarker && Array.isArray(pvMarker)) {
      for (const m of pvMarker) {
        const key = `${m.time}-${m.type}`;
        if (!seen.has(key)) {
          seen.add(key);
          markers.push(m);
        }
      }
    }
  }
  if (markers.length === 0) return [];

  // Build a Map for O(1) lookup instead of O(n) find per marker
  const timeMap = new Map<string, any>();
  for (const p of priceLineData) {
    if (p?.payload?.time) timeMap.set(p.payload.time, p);
  }
  const result: { x: number; y: number; marker: PulseVolumeMarker }[] = [];
  for (const marker of markers) {
    const matchPoint = timeMap.get(marker.time);
    if (!matchPoint) continue;
    result.push({ x: matchPoint.x, y: matchPoint.y, marker });
  }
  return result;
}

// ── Render a single Pulse/Volume marker as prominent SVG ──
// v2: Much more prominent than before — larger markers, bolder labels, white glow

// ── Compute label positioning info for a single PV marker ──

interface PvLabelLayout {
  isAbove: boolean;      // label is above the price point
  labelY: number;        // vertical center-ish of the pill
  pillW: number;
  pillH: number;
  displayLabel: string;
}

function computePvLabelLayout(x: number, y: number, marker: PulseVolumeMarker): PvLabelLayout {
  const isPulse = marker.type === "pulse";
  const isProgressiveVol = marker.type === "progressive_vol";
  const isVolRise = marker.type === "vol_rise";
  const isAbove = isPulse || isProgressiveVol || isVolRise;

  const amountStr = marker.amount > 0 ? formatAmount(marker.amount) : "";
  const displayLabel = amountStr ? `${marker.label} ${amountStr}` : marker.label;

  const estimatedCharWidth = 7.5;
  const pillW = Math.max(84, Math.min(160, Math.round(displayLabel.length * estimatedCharWidth + 8)));
  const pillH = 16;

  const labelY = isAbove ? y - 52 : y + 36;

  return { isAbove, labelY, pillW, pillH, displayLabel };
}

// ── Compute bounding rect of a label pill ──

function computePvLabelRect(x: number, layout: PvLabelLayout): { x: number; y: number; width: number; height: number } {
  if (layout.isAbove) {
    return {
      x: x - layout.pillW / 2,
      y: layout.labelY - layout.pillH / 2 - 2,
      width: layout.pillW,
      height: layout.pillH,
    };
  } else {
    return {
      x: x - layout.pillW / 2,
      y: layout.labelY - 2,
      width: layout.pillW,
      height: layout.pillH,
    };
  }
}

// ── Resolve label overlaps by shifting labels vertically ──

interface PlacedLabel {
  idx: number;
  x: number;         // marker x (original price point)
  y: number;         // marker y (price point)
  marker: PulseVolumeMarker;
  layout: PvLabelLayout;
  adjustedLabelY: number; // may be shifted for overlap avoidance
  adjustedX: number;     // label x may be shifted horizontally for same-time markers
}

function resolvePvLabelOverlaps(
  markerPoints: { x: number; y: number; marker: PulseVolumeMarker }[],
): PlacedLabel[] {
  if (markerPoints.length === 0) return [];

  // Step 0: Detect markers at the same time point and spread them horizontally
  // so pulse and progressive_vol each get their own connection line
  const timeGroups = new Map<string, number[]>(); // time -> indices into markerPoints
  markerPoints.forEach((pt, idx) => {
    const t = pt.marker.time;
    if (!timeGroups.has(t)) timeGroups.set(t, []);
    timeGroups.get(t)!.push(idx);
  });

  const HORIZONTAL_SPREAD = 28; // pixels to spread each marker from center
  const xOffsets = new Map<number, number>(); // markerPoints index -> x offset
  for (const [, indices] of timeGroups) {
    if (indices.length <= 1) {
      xOffsets.set(indices[0], 0);
    } else {
      // Spread evenly around center
      const total = indices.length;
      indices.forEach((mpIdx, i) => {
        const offset = (i - (total - 1) / 2) * HORIZONTAL_SPREAD;
        xOffsets.set(mpIdx, offset);
      });
    }
  }

  // Step 1: Compute default layouts (use adjusted x for label positioning)
  const placed: PlacedLabel[] = markerPoints.map((pt, idx) => {
    const xOff = xOffsets.get(idx) || 0;
    const adjustedX = pt.x + xOff;
    const layout = computePvLabelLayout(adjustedX, pt.y, pt.marker);
    return { idx, x: pt.x, y: pt.y, marker: pt.marker, layout, adjustedLabelY: layout.labelY, adjustedX };
  });

  // Step 2: Compute label rects and resolve overlaps
  // Sort by adjustedX to make overlap detection efficient
  placed.sort((a, b) => a.adjustedX - b.adjustedX);

  const GAP = 3; // minimum gap between labels
  const placedRects: { x: number; y: number; width: number; height: number }[] = [];

  for (const p of placed) {
    let rect = computePvLabelRect(p.adjustedX, { ...p.layout, labelY: p.adjustedLabelY });

    // Try placing at default position first
    let overlapFound = true;
    let attempts = 0;
    const maxAttempts = 8;

    while (overlapFound && attempts < maxAttempts) {
      overlapFound = false;
      for (const pr of placedRects) {
        // Check if this rect overlaps with any placed rect
        if (
          rect.x < pr.x + pr.width + GAP &&
          rect.x + rect.width + GAP > pr.x &&
          rect.y < pr.y + pr.height + GAP &&
          rect.y + rect.height + GAP > pr.y
        ) {
          overlapFound = true;
          // Shift label further away from the price point
          if (p.layout.isAbove) {
            p.adjustedLabelY -= 18; // shift up more
          } else {
            p.adjustedLabelY += 18; // shift down more
          }
          rect = computePvLabelRect(p.adjustedX, { ...p.layout, labelY: p.adjustedLabelY });
          break;
        }
      }
      attempts++;
    }

    // If still overlapping after max attempts, try horizontal shift instead
    if (overlapFound) {
      // Reset vertical position to default
      p.adjustedLabelY = p.layout.labelY;
      rect = computePvLabelRect(p.adjustedX, { ...p.layout, labelY: p.adjustedLabelY });

      // Try shifting right
      const shiftedRight = { ...rect, x: rect.x + rect.width * 0.7 };
      let rightOk = true;
      for (const pr of placedRects) {
        if (
          shiftedRight.x < pr.x + pr.width + GAP &&
          shiftedRight.x + shiftedRight.width + GAP > pr.x &&
          shiftedRight.y < pr.y + pr.height + GAP &&
          shiftedRight.y + shiftedRight.height + GAP > pr.y
        ) {
          rightOk = false;
          break;
        }
      }
      if (rightOk) {
        rect = shiftedRight;
      } else {
        // Try shifting left
        const shiftedLeft = { ...rect, x: rect.x - rect.width * 0.7 };
        let leftOk = true;
        for (const pr of placedRects) {
          if (
            shiftedLeft.x < pr.x + pr.width + GAP &&
            shiftedLeft.x + shiftedLeft.width + GAP > pr.x &&
            shiftedLeft.y < pr.y + pr.height + GAP &&
            shiftedLeft.y + shiftedLeft.height + GAP > pr.y
          ) {
            leftOk = false;
            break;
          }
        }
        if (leftOk) {
          rect = shiftedLeft;
        }
      }
    }

    placedRects.push(rect);
  }

  return placed;
}

// ── Render a single Pulse/Volume marker as prominent SVG ──
// v3: Accepts optional adjustedLabelY for overlap avoidance

function renderPulseVolumeMarker(
  x: number,
  y: number,
  marker: PulseVolumeMarker,
  idx: number,
  adjustedLabelY?: number,
  adjustedX?: number,
): React.ReactNode {
  const isPulse = marker.type === "pulse";
  const isProgressiveVol = marker.type === "progressive_vol";
  const isPulseDecline = marker.type === "pulse_decline";
  const isVolumeDecline = marker.type === "volume_decline";
  const isEarlyVolDrop = marker.type === "early_vol_drop";
  const isSlowDecline = marker.type === "slow_decline";
  const isWashTrade = marker.type === "wash_trade";
  const isVolRise = marker.type === "vol_rise";
  const isShrinkRise = marker.type === "shrink_rise";
  const isDecline = isPulseDecline || isVolumeDecline || isEarlyVolDrop || isSlowDecline;

  // Color schemes — A股惯例：上涨=红色，下跌=绿色
  // 上涨类(pulse, progressive_vol, vol_rise)用红色，下跌类(pulse_decline, volume_decline, early_vol_drop)用绿色
  let bgColor: string, borderColor: string, textColor: string, iconColor: string, glowColor: string;
  const isAbove = isPulse || isProgressiveVol || isVolRise;
  const defaultLabelY = isAbove ? y - 52 : y + 36;
  const labelY = adjustedLabelY ?? defaultLabelY;
  const labelX = adjustedX ?? x; // label center x (may be shifted for same-time markers)

  // Volume decline strength for visual emphasis
  const volDeclineStrength = isVolumeDecline ? Math.abs(marker.score) : 0;
  const isStrongDecline = isVolumeDecline && volDeclineStrength >= 30;

  if (isPulse) {
    bgColor = "rgba(245, 158, 11, 0.25)";
    borderColor = "rgba(245, 158, 11, 0.85)";
    textColor = "#b45309";
    iconColor = "#f59e0b";
    glowColor = "rgba(245, 158, 11, 0.35)";
  } else if (isProgressiveVol) {
    // 温和放量上涨 — 红色（A股：上涨=红）
    bgColor = "rgba(239, 68, 68, 0.25)";
    borderColor = "rgba(239, 68, 68, 0.85)";
    textColor = "#991b1b";
    iconColor = "#ef4444";
    glowColor = "rgba(239, 68, 68, 0.35)";
  } else if (isPulseDecline) {
    bgColor = "rgba(22, 163, 74, 0.25)";
    borderColor = "rgba(22, 163, 74, 0.85)";
    textColor = "#166534";
    iconColor = "#16a34a";
    glowColor = "rgba(22, 163, 74, 0.35)";
  } else if (isVolumeDecline) {
    // 放量下跌 — 根据强度递进绿色（A股：下跌=绿）
    if (volDeclineStrength >= 50) {
      bgColor = "rgba(22, 163, 74, 0.35)";
      borderColor = "rgba(22, 163, 74, 1)";
      textColor = "#166534";
      iconColor = "#16a34a";
      glowColor = "rgba(22, 163, 74, 0.5)";
    } else if (volDeclineStrength >= 30) {
      bgColor = "rgba(34, 197, 94, 0.3)";
      borderColor = "rgba(34, 197, 94, 0.95)";
      textColor = "#166534";
      iconColor = "#22c55e";
      glowColor = "rgba(34, 197, 94, 0.4)";
    } else {
      bgColor = "rgba(34, 197, 94, 0.2)";
      borderColor = "rgba(34, 197, 94, 0.8)";
      textColor = "#166534";
      iconColor = "#22c55e";
      glowColor = "rgba(34, 197, 94, 0.3)";
    }
  } else if (isEarlyVolDrop) {
    bgColor = "rgba(249, 115, 22, 0.25)";
    borderColor = "rgba(249, 115, 22, 0.85)";
    textColor = "#9a3412";
    iconColor = "#f97316";
    glowColor = "rgba(249, 115, 22, 0.35)";
  } else if (isSlowDecline) {
    // 阴跌 — 暗绿色（A股：下跌=绿，阴跌用更暗的绿表示隐蔽性）
    bgColor = "rgba(20, 120, 60, 0.25)";
    borderColor = "rgba(20, 120, 60, 0.85)";
    textColor = "#14532d";
    iconColor = "#15803d";
    glowColor = "rgba(20, 120, 60, 0.35)";
  } else if (isWashTrade) {
    bgColor = "rgba(139, 92, 246, 0.25)";
    borderColor = "rgba(139, 92, 246, 0.85)";
    textColor = "#5b21b6";
    iconColor = "#8b5cf6";
    glowColor = "rgba(139, 92, 246, 0.35)";
  } else if (isVolRise) {
    // 放量上涨 — 红色（A股：上涨=红）
    bgColor = "rgba(239, 68, 68, 0.25)";
    borderColor = "rgba(239, 68, 68, 0.85)";
    textColor = "#991b1b";
    iconColor = "#ef4444";
    glowColor = "rgba(239, 68, 68, 0.35)";
  } else if (isShrinkRise) {
    bgColor = "rgba(234, 179, 8, 0.25)";
    borderColor = "rgba(234, 179, 8, 0.85)";
    textColor = "#854d0e";
    iconColor = "#eab308";
    glowColor = "rgba(234, 179, 8, 0.35)";
  } else {
    bgColor = "rgba(6, 182, 212, 0.25)";
    borderColor = "rgba(6, 182, 212, 0.85)";
    textColor = "#0e7490";
    iconColor = "#06b6d4";
    glowColor = "rgba(6, 182, 212, 0.35)";
  }

  // Format amount for display
  const amountStr = marker.amount > 0 ? formatAmount(marker.amount) : "";
  const displayLabel = amountStr ? `${marker.label} ${amountStr}` : marker.label;

  // Dynamic pill width based on label length
  const estimatedCharWidth = 7.5;
  const pillW = Math.max(84, Math.min(160, Math.round(displayLabel.length * estimatedCharWidth + 8)));
  const pillH = 16;
  const pillRx = 4;

  return (
    <g key={`pv-${marker.type}-${idx}`}>
      {/* 放量下跌危险区域：绿色半透明光晕（A股：下跌=绿） */}
      {isVolumeDecline && (
        <>
          <circle cx={x} cy={y} r={isStrongDecline ? 22 : 16}
            fill={volDeclineStrength >= 50 ? "rgba(22, 163, 74, 0.08)" : "rgba(34, 197, 94, 0.06)"}
            stroke="none"
          />
          <circle cx={x} cy={y} r={isStrongDecline ? 15 : 11}
            fill={volDeclineStrength >= 50 ? "rgba(22, 163, 74, 0.12)" : "rgba(34, 197, 94, 0.08)"}
            stroke="none"
          />
        </>
      )}
      {/* Connecting line from price point to label (may be offset horizontally) */}
      <line
        x1={x} y1={y} x2={labelX} y2={labelY}
        stroke={borderColor} strokeWidth={isStrongDecline ? 1.5 : 1} strokeDasharray="3 2"
      />
      {/* Marker dot on price line — larger & bolder for volume_decline */}
      <circle
        cx={x} cy={y} r={isStrongDecline ? 8 : isVolumeDecline ? 7 : 6}
        fill={bgColor} stroke={iconColor} strokeWidth={isStrongDecline ? 2.5 : 2}
      />
      {/* Pulsing glow ring around dot */}
      <circle
        cx={x} cy={y} r={isStrongDecline ? 12 : 9}
        fill="none" stroke={glowColor} strokeWidth={isStrongDecline ? 2 : 1.5}
        strokeDasharray="2 2" opacity={isStrongDecline ? 0.9 : 0.7}
      />
      {/* 强放量下跌额外脉冲环 */}
      {volDeclineStrength >= 50 && (
        <circle
          cx={x} cy={y} r={16}
          fill="none" stroke="rgba(22, 163, 74, 0.3)" strokeWidth={1}
          strokeDasharray="3 3" opacity={0.5}
        />
      )}
      {/* Icon inside dot */}
      <text
        x={x} y={y + 1}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={isVolumeDecline ? 8 : 7} fill={iconColor} fontWeight="bold"
      >
        {isPulse ? "⚡" : isPulseDecline ? "📉" : isProgressiveVol ? "📈" : isVolumeDecline ? "⚠" : isSlowDecline ? "▼" : "▲"}
      </text>
      {/* White glow behind label pill for readability */}
      <rect
        x={labelX - pillW / 2 - 1.5} y={(isAbove ? labelY - pillH / 2 - 2 : labelY - 2) - 1.5}
        width={pillW + 3} height={pillH + 3}
        rx={pillRx + 1} ry={pillRx + 1}
        fill="white" fillOpacity={0.85}
      />
      {/* Label background pill */}
      <rect
        x={labelX - pillW / 2} y={isAbove ? labelY - pillH / 2 - 2 : labelY - 2}
        width={pillW} height={pillH}
        rx={pillRx} ry={pillRx}
        fill={bgColor} stroke={borderColor} strokeWidth={isStrongDecline ? 1.5 : 1}
      />
      {/* Label text — larger & bolder */}
      <text
        x={labelX} y={isAbove ? labelY + 1 : labelY + 7}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={isVolumeDecline ? 9.5 : 9} fontWeight={isVolumeDecline ? 800 : 700} fill={textColor}
      >
        {displayLabel}
      </text>
    </g>
  );
}

// ── Standalone PulseVolumeRenderer (kept for backward compat, uses shared extract+render) ──

function PulseVolumeRenderer(props: any) {
  const { formattedGraphicalItems, xAxisMap, yAxisMap } = props;
  if (!formattedGraphicalItems || !xAxisMap || !yAxisMap) return null;

  const xAxis = Object.values(xAxisMap)[0] as any;
  const yAxis = Object.values(yAxisMap)[0] as any;
  if (!xAxis || !yAxis) return null;

  const markerPoints = extractPulseVolumePoints(formattedGraphicalItems);
  if (markerPoints.length === 0) return null;

  // Resolve label overlaps
  const placedLabels = resolvePvLabelOverlaps(markerPoints);

  return (
    <g className="pulse-volume-markers">
      {placedLabels.map((p) => renderPulseVolumeMarker(p.x, p.y, p.marker, p.idx, p.adjustedLabelY, p.adjustedX))}
    </g>
  );
}

// ── Timeline Signal Rendering Logic (pure function, stateless) ────
// v6: Strong=label+triangle, Medium=amber dot+badge, Weak=gray dot only
// Extracted as a pure function so the combined overlay can control layer order.

function computeTimelineSignalElements(
  formattedGraphicalItems: any[],
  xAxisMap: any,
  yAxisMap: any,
  expandedIds: Set<string>,
  toggleExpand: (id: string) => void,
): { signalElements: React.ReactNode[]; prioritySignalElements: React.ReactNode[]; bubbleElements: React.ReactNode[] } | null {
  if (!formattedGraphicalItems || !xAxisMap || !yAxisMap) return null;

  const xAxis = Object.values(xAxisMap)[0] as any;
  const yAxis = Object.values(yAxisMap)[0] as any;
  if (!xAxis || !yAxis) return null;

  // Get data points from the price line
  let priceLineData: any[] = [];
  for (const item of formattedGraphicalItems) {
    if (item?.props?.points && Array.isArray(item.props.points)) {
      const stroke = item.props.stroke || item?.props?.lineProps?.stroke;
      // Skip avgPrice (yellow dashed) line
      if (stroke === "#eab308" || stroke === "#facc15" || stroke === "#ca8a04") continue;
      if (priceLineData.length === 0) {
        priceLineData = item.props.points;
      }
    }
  }
  if (priceLineData.length === 0) return null;

  // ── Step 1: Collect all signal points ──
  const allSignals: { x: number; y: number; signal: TSignal; index: number }[] = [];
  priceLineData.forEach((point: any, i: number) => {
    const signal = point?.payload?.tSignal as TSignal | undefined | null;
    if (!signal) return;
    allSignals.push({ x: point.x, y: point.y, signal, index: i });
  });

  if (allSignals.length === 0) return null;

  // ── Step 2: Smart merge - same direction (buy/sell), wider distance ──
  // Adaptive merge distance: fewer data points = tighter merge to avoid swallowing early signals
  const MERGE_DISTANCE_X = priceLineData.length <= 20 ? 15 : 30;
  const strengthOrder: Record<string, number> = { strong: 3, medium: 2, weak: 1 };
  const merged: MergedSignal[] = [];
  const used = new Set<number>();

  for (let i = 0; i < allSignals.length; i++) {
    if (used.has(i)) continue;
    const s = allSignals[i];
    const direction: "up" | "down" = s.signal.type === "buy" ? "up" : "down";
    const group: typeof allSignals = [s];
    used.add(i);

    for (let j = i + 1; j < allSignals.length; j++) {
      if (used.has(j)) continue;
      const next = allSignals[j];
      const nextDir: "up" | "down" = next.signal.type === "buy" ? "up" : "down";
      if (nextDir === direction && (next.x - s.x) <= MERGE_DISTANCE_X) {
        group.push(next);
        used.add(j);
      } else if ((next.x - s.x) > MERGE_DISTANCE_X) {
        break;
      }
    }

    let bestStrength: Strength = "weak";
    let bestIdx = 0;
    let hasCustomFactor = false;
    let overriddenStrengthCap: Strength | null = null;
    const uniqueReasons = new Set<string>();
    const customReasonSet = new Set<string>();
    for (let k = 0; k < group.length; k++) {
      const g = group[k];
      uniqueReasons.add(g.signal.reason);
      if (g.signal.strengthOverridden) {
        if (overriddenStrengthCap === null || strengthOrder[g.signal.strength] < strengthOrder[overriddenStrengthCap]) {
          overriddenStrengthCap = g.signal.strength;
        }
      }
      if (strengthOrder[g.signal.strength] > strengthOrder[bestStrength]) {
        bestStrength = g.signal.strength;
        bestIdx = k;
      }
      if (g.signal.description?.startsWith("自定义因子[")) {
        hasCustomFactor = true;
        customReasonSet.add(g.signal.reason);
      }
    }

    if (overriddenStrengthCap !== null && strengthOrder[overriddenStrengthCap] < strengthOrder[bestStrength]) {
      bestStrength = overriddenStrengthCap;
      for (let k = 0; k < group.length; k++) {
        if (group[k].signal.strength === overriddenStrengthCap) {
          bestIdx = k;
          break;
        }
      }
    }

    const representative = group[bestIdx];

    merged.push({
      id: `sig-${s.index}-${direction}`,
      x: representative.x,
      y: representative.y,
      type: s.signal.type,
      reasons: Array.from(uniqueReasons),
      strength: bestStrength,
      count: group.length,
      originalIndex: s.index,
      direction,
      isCustom: hasCustomFactor,
      customReasons: customReasonSet,
      hasOverriddenStrength: overriddenStrengthCap !== null,
    });
  }

  // ── Step 3: Strong + Medium signals get text labels ──
  const labelRects: { x: number; y: number; width: number; height: number }[] = [];
  const LABEL_GAP = 2; // 最小间距，避免标签紧贴

  function overlapsAny(rect: { x: number; y: number; width: number; height: number }, rects: typeof labelRects): boolean {
    for (const r of rects) {
      if (rect.x - LABEL_GAP < r.x + r.width && rect.x + rect.width + LABEL_GAP > r.x &&
          rect.y - LABEL_GAP < r.y + r.height && rect.y + rect.height + LABEL_GAP > r.y) {
        return true;
      }
    }
    return false;
  }

  interface LabelPlan {
    merged: MergedSignal;
    labelRect: { x: number; y: number; width: number; height: number } | null;
    labelText: string;
    showLabel: boolean;
    labelFontSize: number;
    labelIsBig: boolean;
    labelStrength: "strong" | "medium" | "weak";
  }

  const labelPlans: LabelPlan[] = [];
  const assignedLabels = new Map<number, LabelPlan>();

  // strong 信号优先放置，medium 其次，按 x 位置排序
  const labeledIndices = merged
    .map((_, i) => i)
    .filter((i) => merged[i].strength === "strong" || merged[i].strength === "medium")
    .sort((a, b) => {
      // strong 排前面，同 strength 按 x 排序
      const sa = merged[a].strength === "strong" ? 0 : 1;
      const sb = merged[b].strength === "strong" ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return merged[a].x - merged[b].x;
    });

  for (const idx of labeledIndices) {
    const m = merged[idx];
    const isBuy = m.direction === "up";
    const isStrong = m.strength === "strong";
    const isGapUpSell = m.reasons.includes("高开卖出");
    const isKeyBuySignal = m.reasons.includes("放量下跌买点") || m.reasons.includes("缩量底部买点") || m.reasons.includes("次低点缩量买入");
    // v6.2: 核心卖点信号也使用大标签
    const isKeySellSignal = !isBuy && (
      m.reasons.includes("均线引力卖点") ||
      m.reasons.includes("次高点放量卖出") ||
      m.reasons.includes("冲高减速见顶") ||
      m.reasons.includes("放量上涨卖点") ||
      m.reasons.includes("缩量滞涨") ||
      m.reasons.includes("脉冲拉升缩量滞涨")
    );
    const isBigLabel = isStrong && (isGapUpSell || isKeyBuySignal || isKeySellSignal); // 只有strong信号才使用大标签

    const strengthTag = `(${getStrengthLabel(m.strength)})`;
    let labelText: string;
    const fmtCustom = (text: string) => {
      const base = m.customReasons?.has(text) ? `自定义[${text}]` : text;
      return `${base}${strengthTag}`;
    };
    if (m.count >= 3) {
      labelText = fmtCustom(`${m.reasons[0]} ×${m.count}`);
    } else if (m.count === 2) {
      const combined = m.reasons.slice(0, 2).join("/");
      labelText = fmtCustom(combined.length > 6 ? `${m.reasons[0]}+1` : combined);
    } else {
      labelText = fmtCustom(m.reasons[0]);
    }

    // v6.3: 标签大小按信号强度分3级 — 大/中/小
    // strong+核心因子(放量下跌买点/均线引力卖点等) = 大标签
    // strong+普通因子(高开卖出/其他) = 中标签
    // medium = 小标签
    const labelFontSize = isBigLabel ? 11 : isStrong ? 9 : 7;
    let textWidth = 0;
    for (const ch of labelText) {
      textWidth += ch.charCodeAt(0) > 127 ? labelFontSize : labelFontSize * 0.55;
    }
    const padX = isBigLabel ? 7 : isStrong ? 5 : 3;
    const labelW = textWidth + padX * 2;
    const labelH = isBigLabel ? 20 : isStrong ? 16 : 12;

    // 根据信号强度决定标签偏移距离
    const markerOffset = (isKeyBuySignal || isKeySellSignal) ? 34 : isStrong ? 30 : 22;
    const labelGap = (isKeyBuySignal || isKeySellSignal) ? 6 : isStrong ? 8 : 5;
    let labelY: number;
    if (isBuy) {
      labelY = m.y + markerOffset + labelGap;
    } else {
      labelY = m.y - markerOffset - labelGap - labelH;
    }

    let labelRect = { x: m.x - labelW / 2, y: labelY, width: labelW, height: labelH };

    let placed = false;

    // 尝试1: 默认位置
    if (!overlapsAny(labelRect, labelRects)) {
      placed = true;
    }

    // 尝试2-3: 左右偏移
    if (!placed) {
      const shiftR = { ...labelRect, x: labelRect.x + labelRect.width * 0.6 };
      if (!overlapsAny(shiftR, labelRects)) {
        labelRect = shiftR;
        placed = true;
      } else {
        const shiftL = { ...labelRect, x: labelRect.x - labelRect.width * 0.6 };
        if (!overlapsAny(shiftL, labelRects)) {
          labelRect = shiftL;
          placed = true;
        }
      }
    }

    // 尝试4-5: 更大左右偏移
    if (!placed) {
      const shiftR2 = { ...labelRect, x: labelRect.x + labelRect.width * 1.2 };
      if (!overlapsAny(shiftR2, labelRects)) {
        labelRect = shiftR2;
        placed = true;
      } else {
        const shiftL2 = { ...labelRect, x: labelRect.x - labelRect.width * 1.2 };
        if (!overlapsAny(shiftL2, labelRects)) {
          labelRect = shiftL2;
          placed = true;
        }
      }
    }

    // 尝试6-7: 垂直偏移（向下/向上额外偏移一个标签高度）
    if (!placed) {
      const shiftDown = { ...labelRect, y: labelRect.y + labelH + 4 };
      if (!overlapsAny(shiftDown, labelRects)) {
        labelRect = shiftDown;
        placed = true;
      } else {
        const shiftUp = { ...labelRect, y: labelRect.y - labelH - 4 };
        if (!overlapsAny(shiftUp, labelRects)) {
          labelRect = shiftUp;
          placed = true;
        }
      }
    }

    // 尝试8: 缩短文本后重试
    if (!placed) {
      const sfmt = (text: string) => {
        const base = m.customReasons?.has(text) ? `自定义[${text}]` : text;
        return `${base}${strengthTag}`;
      };
      const shortText = m.count > 1 ? sfmt(`${m.reasons[0]}×${m.count}`) : sfmt(m.reasons[0].slice(0, 4));
      let sw = 0;
      for (const ch of shortText) sw += ch.charCodeAt(0) > 127 ? labelFontSize : labelFontSize * 0.55;
      const shortW = sw + padX * 2;
      const shortRect = { x: m.x - shortW / 2, y: labelY, width: shortW, height: labelH };
      if (!overlapsAny(shortRect, labelRects)) {
        labelRect = shortRect;
        labelText = shortText;
        placed = true;
      }
    }

    // 尝试9: 缩短文本+左右偏移
    if (!placed) {
      const sfmt = (text: string) => {
        const base = m.customReasons?.has(text) ? `自定义[${text}]` : text;
        return `${base}${strengthTag}`;
      };
      const shortText = m.count > 1 ? sfmt(`${m.reasons[0]}×${m.count}`) : sfmt(m.reasons[0].slice(0, 4));
      let sw = 0;
      for (const ch of shortText) sw += ch.charCodeAt(0) > 127 ? labelFontSize : labelFontSize * 0.55;
      const shortW = sw + padX * 2;
      const shortRectR = { x: m.x - shortW / 2 + shortW * 0.6, y: labelY, width: shortW, height: labelH };
      if (!overlapsAny(shortRectR, labelRects)) {
        labelRect = shortRectR;
        labelText = shortText;
        placed = true;
      } else {
        const shortRectL = { x: m.x - shortW / 2 - shortW * 0.6, y: labelY, width: shortW, height: labelH };
        if (!overlapsAny(shortRectL, labelRects)) {
          labelRect = shortRectL;
          labelText = shortText;
          placed = true;
        }
      }
    }

    if (placed) {
      labelRects.push(labelRect);
    }

    assignedLabels.set(idx, { merged: m, labelRect: placed ? labelRect : null, labelText, showLabel: placed, labelFontSize, labelIsBig: isBigLabel, labelStrength: m.strength });
  }

  for (let i = 0; i < merged.length; i++) {
    if (assignedLabels.has(i)) continue;
    assignedLabels.set(i, { merged: merged[i], labelRect: null, labelText: "", showLabel: false, labelFontSize: 8, labelIsBig: false, labelStrength: merged[i].strength });
  }

  for (let i = 0; i < merged.length; i++) {
    labelPlans.push(assignedLabels.get(i)!);
  }

  // ── Step 4: Render ──

  // v6.3: 标签样式按强度分3级
  const getLabelStyle = (strength: "strong" | "medium" | "weak") => {
    switch (strength) {
      case "strong": return { rx: 4, strokeWidth: 1.0, strokeOpacity: 0.6, fillOpacity: 0.95, fontWeight: "800" as const, connWidth: 1.5, connOpacity: 0.9 };
      case "medium": return { rx: 3, strokeWidth: 0.6, strokeOpacity: 0.4, fillOpacity: 0.88, fontWeight: "600" as const, connWidth: 1.0, connOpacity: 0.7 };
      case "weak": return { rx: 2, strokeWidth: 0.4, strokeOpacity: 0.3, fillOpacity: 0.80, fontWeight: "500" as const, connWidth: 0.8, connOpacity: 0.5 };
    }
  };

  const renderCountBadge = (m: MergedSignal, badgeCx: number, badgeCy: number, badgeColor: string, badgeTextColor: string): { badgeSvg: React.ReactNode; bubbleSvg: React.ReactNode } => {
    if (m.count <= 1) return { badgeSvg: null, bubbleSvg: null };
    const isExpanded = expandedIds.has(m.id);
    const badgeR = 6;

    const badgeSvg = (
      <g style={{ cursor: "pointer" }} onClick={() => toggleExpand(m.id)}>
        <circle cx={badgeCx} cy={badgeCy} r={badgeR} fill={badgeColor} stroke="white" strokeWidth={0.6} />
        <text x={badgeCx} y={badgeCy} textAnchor="middle" dominantBaseline="middle" fill={badgeTextColor} fontSize={7} fontWeight="bold">
          {m.count}
        </text>
      </g>
    );

    if (!isExpanded) return { badgeSvg, bubbleSvg: null };

    const lineHeight = 12;
    const fontSize = 8;
    const padX = 5;
    const padY = 4;
    const lines = m.reasons.map(r => m.customReasons?.has(r) ? `自定义[${r}]` : r);
    const maxTextWidth = Math.max(...lines.map(line => {
      let w = 0;
      for (const ch of line) w += ch.charCodeAt(0) > 127 ? fontSize : fontSize * 0.55;
      return w;
    }));
    const bubbleW = maxTextWidth + padX * 2 + 6;
    const bubbleH = lines.length * lineHeight + padY * 2;
    const bubbleX = badgeCx + badgeR + 4;
    const bubbleY = badgeCy - bubbleH / 2;

    const bubbleSvg = (
      <g key={`bubble-${m.id}`} style={{ cursor: "pointer" }} onClick={() => toggleExpand(m.id)}>
        <line x1={badgeCx + badgeR} y1={badgeCy} x2={bubbleX} y2={badgeCy} stroke={badgeColor} strokeWidth={0.5} strokeDasharray="2 1" opacity={0.5} />
        <rect x={bubbleX} y={bubbleY} width={bubbleW} height={bubbleH} rx={4} fill="white" fillOpacity={0.97} stroke={badgeColor} strokeWidth={0.8} />
        {lines.map((reason, ri) => (
          <text
            key={ri}
            x={bubbleX + padX + 4}
            y={bubbleY + padY + ri * lineHeight + lineHeight / 2}
            dominantBaseline="middle"
            fill="#1f2937"
            fontSize={fontSize}
            fontWeight={ri === 0 ? "600" : "400"}
          >
            <tspan fill={badgeColor} fontSize={6}>● </tspan>
            {reason}
          </text>
        ))}
      </g>
    );

    return { badgeSvg, bubbleSvg };
  };

  const bubbleElements: React.ReactNode[] = [];
  const prioritySignalElements: React.ReactNode[] = []; // 高开卖出/放量下跌买点 — 渲染到最顶层
  const signalElements: React.ReactNode[] = [];

  labelPlans.forEach((plan, i) => {
    const m = plan.merged;
    const isBuy = m.direction === "up";
    const isStoploss = m.type === "stoploss";

    let markerColor: string;
    let labelBgColor: string;
    let badgeColor: string;
    let badgeTextColor: string;

    // 买点统一#dc2626鲜红，卖点统一#16a34a鲜绿
    if (m.isCustom) {
      markerColor = isBuy ? "#8b5cf6" : "#a78bfa";
      labelBgColor = isBuy ? "#dc2626" : "#16a34a";
      badgeColor = markerColor;
      badgeTextColor = "white";
    } else if (isStoploss) {
      markerColor = "#f59e0b";
      labelBgColor = "#92400e";
      badgeColor = markerColor;
      badgeTextColor = "white";
    } else {
      markerColor = isBuy ? "#dc2626" : "#16a34a";
      labelBgColor = isBuy ? "#dc2626" : "#16a34a";
      badgeColor = markerColor;
      badgeTextColor = "white";
    }

    if (m.strength === "strong") {
      const isGapUpSellSignal = m.reasons.includes("高开卖出");
      const isKeyBuySignalR = m.reasons.includes("放量下跌买点") || m.reasons.includes("缩量底部买点") || m.reasons.includes("次低点缩量买入");
      // v6.2: 核心卖点因子 — 均线引力/次高点放量/冲高减速见顶/放量上涨卖点/缩量滞涨
      const isKeySellSignalR = !isBuy && (
        m.reasons.includes("均线引力卖点") ||
        m.reasons.includes("次高点放量卖出") ||
        m.reasons.includes("冲高减速见顶") ||
        m.reasons.includes("放量上涨卖点") ||
        m.reasons.includes("缩量滞涨") ||
        m.reasons.includes("脉冲拉升缩量滞涨")
      );
      const isBigMarker = isGapUpSellSignal || isKeyBuySignalR || isKeySellSignalR;
      const markerSize = isBigMarker ? 9 : 6;
      const badgeCx = m.x + markerSize + 4;
      const badgeCy = isBuy ? m.y - markerSize * 0.3 : m.y + markerSize * 0.3;
      const { badgeSvg, bubbleSvg } = renderCountBadge(m, badgeCx, badgeCy, badgeColor, badgeTextColor);
      if (bubbleSvg) bubbleElements.push(bubbleSvg);

      // 核心买点使用优化渲染 — 醒目V底三角+脉冲圆点+发光+粗实线连接
      if (isKeyBuySignalR && isBuy) {
        const dotR = 6;
        const triOffset = 20;
        const glowR = 16;
        const el = (
          <g key={`tl-sig-${m.originalIndex}-${i}`}>
            {/* 外圈发光 — 两层叠加更醒目 */}
            <circle cx={m.x} cy={m.y} r={glowR} fill={markerColor} fillOpacity={0.12} />
            <circle cx={m.x} cy={m.y} r={glowR - 3} fill={markerColor} fillOpacity={0.2} stroke={markerColor} strokeWidth={0.8} strokeOpacity={0.5} />
            {/* 价格线上的锚点圆 */}
            <circle cx={m.x} cy={m.y} r={dotR} fill={markerColor} stroke="white" strokeWidth={2} />
            {/* 锚点到三角的连接线 — 粗实线更明显 */}
            <line x1={m.x} y1={m.y + dotR + 1} x2={m.x} y2={m.y + triOffset - markerSize * 0.6} stroke={markerColor} strokeWidth={2} opacity={0.9} />
            <polygon
              points={`${m.x},${m.y + triOffset - markerSize} ${m.x - markerSize * 1.0},${m.y + triOffset + markerSize * 0.7} ${m.x + markerSize * 1.0},${m.y + triOffset + markerSize * 0.7}`}
              fill={markerColor}
              stroke="white"
              strokeWidth={1.0}
            />
            <text
              x={m.x}
              y={m.y + triOffset + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="white"
              fontSize={7}
              fontWeight="bold"
            >
              买
            </text>
            {badgeSvg}
            {plan.showLabel && plan.labelRect && (
              <>
                {/* 三角到文字标签的连接线 */}
                <line
                  x1={m.x}
                  y1={m.y + triOffset + markerSize * 0.7}
                  x2={plan.labelRect.x + plan.labelRect.width / 2}
                  y2={plan.labelRect.y}
                  stroke={markerColor}
                  strokeWidth={getLabelStyle(plan.labelStrength).connWidth}
                  opacity={getLabelStyle(plan.labelStrength).connOpacity}
                />
                <rect
                  x={plan.labelRect.x - 1}
                  y={plan.labelRect.y - 1}
                  width={plan.labelRect.width + 2}
                  height={plan.labelRect.height + 2}
                  rx={getLabelStyle(plan.labelStrength).rx + 1}
                  fill="none"
                  stroke="white"
                  strokeWidth={1.0}
                  strokeOpacity={0.3}
                />
                <rect
                  x={plan.labelRect.x}
                  y={plan.labelRect.y}
                  width={plan.labelRect.width}
                  height={plan.labelRect.height}
                  rx={getLabelStyle(plan.labelStrength).rx}
                  fill={labelBgColor}
                  fillOpacity={getLabelStyle(plan.labelStrength).fillOpacity}
                  stroke={markerColor}
                  strokeWidth={getLabelStyle(plan.labelStrength).strokeWidth}
                  strokeOpacity={getLabelStyle(plan.labelStrength).strokeOpacity}
                />
                <text
                  x={plan.labelRect.x + plan.labelRect.width / 2}
                  y={plan.labelRect.y + plan.labelRect.height / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="white"
                  fontSize={plan.labelFontSize}
                  fontWeight={getLabelStyle(plan.labelStrength).fontWeight}
                >
                  {plan.labelText}
                </text>
              </>
            )}
          </g>
        );
        prioritySignalElements.push(el);
        return;
      }

      // 核心卖点 — 醒目倒三角+脉冲圆点+发光+粗实线连接
      if (isKeySellSignalR && !isBuy) {
        const dotR = 6;
        const triOffset = 20;
        const glowR = 16;
        const el = (
          <g key={`tl-sig-${m.originalIndex}-${i}`}>
            {/* 外圈发光 — 两层叠加 */}
            <circle cx={m.x} cy={m.y} r={glowR} fill={markerColor} fillOpacity={0.12} />
            <circle cx={m.x} cy={m.y} r={glowR - 3} fill={markerColor} fillOpacity={0.2} stroke={markerColor} strokeWidth={0.8} strokeOpacity={0.5} />
            {/* 价格线上的锚点圆 */}
            <circle cx={m.x} cy={m.y} r={dotR} fill={markerColor} stroke="white" strokeWidth={2} />
            {/* 锚点到倒三角的连接线 */}
            <line x1={m.x} y1={m.y - dotR - 1} x2={m.x} y2={m.y - triOffset + markerSize * 0.6} stroke={markerColor} strokeWidth={2} opacity={0.9} />
            {/* 倒三角（卖点朝下） */}
            <polygon
              points={`${m.x},${m.y - triOffset + markerSize} ${m.x - markerSize * 1.0},${m.y - triOffset - markerSize * 0.7} ${m.x + markerSize * 1.0},${m.y - triOffset - markerSize * 0.7}`}
              fill={markerColor}
              stroke="white"
              strokeWidth={1.0}
            />
            <text
              x={m.x}
              y={m.y - triOffset - 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="white"
              fontSize={7}
              fontWeight="bold"
            >
              卖
            </text>
            {badgeSvg}
            {plan.showLabel && plan.labelRect && (
              <>
                {/* 倒三角到文字标签的连接线 */}
                <line
                  x1={m.x}
                  y1={m.y - triOffset - markerSize * 0.7}
                  x2={plan.labelRect.x + plan.labelRect.width / 2}
                  y2={plan.labelRect.y + plan.labelRect.height}
                  stroke={markerColor}
                  strokeWidth={getLabelStyle(plan.labelStrength).connWidth}
                  opacity={getLabelStyle(plan.labelStrength).connOpacity}
                />
                <rect
                  x={plan.labelRect.x - 1}
                  y={plan.labelRect.y - 1}
                  width={plan.labelRect.width + 2}
                  height={plan.labelRect.height + 2}
                  rx={getLabelStyle(plan.labelStrength).rx + 1}
                  fill="none"
                  stroke="white"
                  strokeWidth={1.0}
                  strokeOpacity={0.3}
                />
                <rect
                  x={plan.labelRect.x}
                  y={plan.labelRect.y}
                  width={plan.labelRect.width}
                  height={plan.labelRect.height}
                  rx={getLabelStyle(plan.labelStrength).rx}
                  fill={labelBgColor}
                  fillOpacity={getLabelStyle(plan.labelStrength).fillOpacity}
                  stroke={markerColor}
                  strokeWidth={getLabelStyle(plan.labelStrength).strokeWidth}
                  strokeOpacity={getLabelStyle(plan.labelStrength).strokeOpacity}
                />
                <text
                  x={plan.labelRect.x + plan.labelRect.width / 2}
                  y={plan.labelRect.y + plan.labelRect.height / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="white"
                  fontSize={plan.labelFontSize}
                  fontWeight={getLabelStyle(plan.labelStrength).fontWeight}
                >
                  {plan.labelText}
                </text>
              </>
            )}
          </g>
        );
        prioritySignalElements.push(el);
        return;
      }

      // 其他strong信号 — 高开卖出也放入优先层，确保显示在最前面
      const isPrioritySignal = isGapUpSellSignal;
      const el = (
        <g key={`tl-sig-${m.originalIndex}-${i}`}>
          {isStoploss ? (
            <polygon
              points={`${m.x},${m.y - markerSize} ${m.x + markerSize},${m.y} ${m.x},${m.y + markerSize} ${m.x - markerSize},${m.y}`}
              fill={markerColor}
              stroke="white"
              strokeWidth={0.8}
            />
          ) : isBuy ? (
            <polygon
              points={`${m.x},${m.y - markerSize} ${m.x - markerSize * 0.9},${m.y + markerSize * 0.6} ${m.x + markerSize * 0.9},${m.y + markerSize * 0.6}`}
              fill={markerColor}
              stroke="white"
              strokeWidth={0.8}
            />
          ) : (
            <polygon
              points={`${m.x},${m.y + markerSize} ${m.x - markerSize * 0.9},${m.y - markerSize * 0.6} ${m.x + markerSize * 0.9},${m.y - markerSize * 0.6}`}
              fill={markerColor}
              stroke="white"
              strokeWidth={0.8}
            />
          )}
          {badgeSvg}
          {plan.showLabel && plan.labelRect && (
            <>
              <line
                x1={m.x}
                y1={isBuy ? m.y + markerSize : m.y - markerSize}
                x2={plan.labelRect.x + plan.labelRect.width / 2}
                y2={isBuy ? plan.labelRect.y : plan.labelRect.y + plan.labelRect.height}
                stroke={markerColor}
                strokeWidth={getLabelStyle(plan.labelStrength).connWidth}
                opacity={getLabelStyle(plan.labelStrength).connOpacity}
              />
              <rect
                x={plan.labelRect.x - 1}
                y={plan.labelRect.y - 1}
                width={plan.labelRect.width + 2}
                height={plan.labelRect.height + 2}
                rx={getLabelStyle(plan.labelStrength).rx + 1}
                fill="none"
                stroke="white"
                strokeWidth={1.0}
                strokeOpacity={0.3}
              />
              <rect
                x={plan.labelRect.x}
                y={plan.labelRect.y}
                width={plan.labelRect.width}
                height={plan.labelRect.height}
                rx={getLabelStyle(plan.labelStrength).rx}
                fill={labelBgColor}
                fillOpacity={getLabelStyle(plan.labelStrength).fillOpacity}
                stroke={m.isCustom ? "#c084fc" : markerColor}
                strokeWidth={m.isCustom ? 0.8 : getLabelStyle(plan.labelStrength).strokeWidth}
                strokeDasharray={m.isCustom ? "2 1" : "none"}
                strokeOpacity={m.isCustom ? 1 : getLabelStyle(plan.labelStrength).strokeOpacity}
              />
              <text
                x={plan.labelRect.x + plan.labelRect.width / 2}
                y={plan.labelRect.y + plan.labelRect.height / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="white"
                fontSize={plan.labelFontSize}
                fontWeight={getLabelStyle(plan.labelStrength).fontWeight}
              >
                {plan.labelText}
              </text>
            </>
          )}
        </g>
      );
      if (isPrioritySignal) {
        prioritySignalElements.push(el);
      } else {
        signalElements.push(el);
      }
      return;
    } else if (m.strength === "medium") {
      const dotRadius = 5;
      const glowR = 8;
      const badgeCx = m.x + dotRadius + 4;
      const badgeCy = m.y - dotRadius + 1;
      const { badgeSvg, bubbleSvg } = renderCountBadge(m, badgeCx, badgeCy, badgeColor, badgeTextColor);
      if (bubbleSvg) bubbleElements.push(bubbleSvg);

      // 买点统一#dc2626鲜红，卖点统一#16a34a鲜绿
      const mediumLabelBg = isBuy ? "#dc2626" : "#16a34a";

      signalElements.push(
        <g key={`tl-sig-${m.originalIndex}-${i}`}>
          {/* 发光圈让medium信号也更醒目 */}
          <circle cx={m.x} cy={m.y} r={glowR} fill={markerColor} fillOpacity={0.12} />
          <circle
            cx={m.x}
            cy={m.y}
            r={dotRadius}
            fill={markerColor}
            fillOpacity={0.9}
            stroke="white"
            strokeWidth={1.2}
          />
          {isBuy ? (
            <polygon
              points={`${m.x},${m.y - 2.5} ${m.x - 2},${m.y + 1} ${m.x + 2},${m.y + 1}`}
              fill="white"
              fillOpacity={0.9}
            />
          ) : (
            <polygon
              points={`${m.x},${m.y + 2.5} ${m.x - 2},${m.y - 1} ${m.x + 2},${m.y - 1}`}
              fill="white"
              fillOpacity={0.9}
            />
          )}
          {badgeSvg}
          {plan.showLabel && plan.labelRect && (
            <>
              <line
                x1={m.x}
                y1={isBuy ? m.y + dotRadius : m.y - dotRadius}
                x2={plan.labelRect.x + plan.labelRect.width / 2}
                y2={isBuy ? plan.labelRect.y : plan.labelRect.y + plan.labelRect.height}
                stroke={markerColor}
                strokeWidth={getLabelStyle(plan.labelStrength).connWidth}
                opacity={getLabelStyle(plan.labelStrength).connOpacity}
              />
              <rect
                x={plan.labelRect.x}
                y={plan.labelRect.y}
                width={plan.labelRect.width}
                height={plan.labelRect.height}
                rx={getLabelStyle(plan.labelStrength).rx}
                fill={mediumLabelBg}
                fillOpacity={getLabelStyle(plan.labelStrength).fillOpacity}
                stroke={markerColor}
                strokeWidth={getLabelStyle(plan.labelStrength).strokeWidth}
                strokeOpacity={getLabelStyle(plan.labelStrength).strokeOpacity}
              />
              <text
                x={plan.labelRect.x + plan.labelRect.width / 2}
                y={plan.labelRect.y + plan.labelRect.height / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="white"
                fontSize={plan.labelFontSize}
                fontWeight={getLabelStyle(plan.labelStrength).fontWeight}
              >
                {plan.labelText}
              </text>
            </>
          )}
        </g>
      );
    } else {
      const dotRadius = 4;
      const glowR = 6;
      signalElements.push(
        <g key={`tl-sig-${m.originalIndex}-${i}`}>
          {/* v5.8: weak信号也加发光圈，提升可见性 */}
          <circle cx={m.x} cy={m.y} r={glowR} fill={markerColor} fillOpacity={0.1} />
          <circle
            cx={m.x}
            cy={m.y}
            r={dotRadius}
            fill={markerColor}
            fillOpacity={0.8}
            stroke="white"
            strokeWidth={1.0}
          />
          {isBuy ? (
            <polygon
              points={`${m.x},${m.y - 2} ${m.x - 1.5},${m.y + 0.8} ${m.x + 1.5},${m.y + 0.8}`}
              fill="white"
              fillOpacity={0.85}
            />
          ) : (
            <polygon
              points={`${m.x},${m.y + 2} ${m.x - 1.5},${m.y - 0.8} ${m.x + 1.5},${m.y - 0.8}`}
              fill="white"
              fillOpacity={0.85}
            />
          )}
        </g>
      );
    }
  });

  return { signalElements, prioritySignalElements, bubbleElements };
}

// ── Intent segment overlay removed — intent segments now rendered as an external bar outside the chart ──

// ── Build a lightweight fingerprint from formattedGraphicalItems ──
// Only checks the price line's last point position and signal/marker counts.
// If these haven't changed, the expensive computation can be skipped.
function buildOverlayFingerprint(
  formattedGraphicalItems: any[],
  xAxisMap: any,
  yAxisMap: any,
  expandedIds: Set<string>,
): string {
  if (!formattedGraphicalItems || !xAxisMap || !yAxisMap) return "empty";
  let priceLineLen = 0;
  let lastX = 0, lastY = 0;
  let signalCount = 0;
  let pvCount = 0;
  for (const item of formattedGraphicalItems) {
    if (item?.props?.points && Array.isArray(item.props.points)) {
      const stroke = item.props.stroke || item?.props?.lineProps?.stroke;
      if (stroke === "#eab308" || stroke === "#facc15" || stroke === "#ca8a04") continue;
      if (priceLineLen === 0) {
        const pts = item.props.points;
        priceLineLen = pts.length;
        if (pts.length > 0) {
          lastX = pts[pts.length - 1].x;
          lastY = pts[pts.length - 1].y;
        }
        // Count signals and pv markers in one pass
        for (const p of pts) {
          if (p?.payload?.tSignal) signalCount++;
          const pv = p?.payload?.pvMarker;
          if (pv && Array.isArray(pv)) pvCount += pv.length;
        }
      }
    }
  }
  // Include expanded IDs in fingerprint so toggleExpand triggers re-render
  const expandedKey = expandedIds.size > 0 ? Array.from(expandedIds).sort().join(",") : "";
  return `${priceLineLen}:${(lastX ?? 0).toFixed(1)}:${(lastY ?? 0).toFixed(1)}:${signalCount}:${pvCount}:${expandedKey}`;
}

// ── VWAP (均线) 禁止买卖标注 ─────────────────────────────
// 在均线旁标注"禁止买卖"：均线上方+0.3%禁买，均线下方-0.3%禁卖，±0.3%内禁止买卖
// 做T核心原则：低吸高抛 → 均线下0.3%外买入，均线上0.3%外卖出，均线附近不操作

function VwapBanAnnotations({ vwapPoints, pricePoints }: { vwapPoints: any[]; pricePoints: any[] }) {
  if (vwapPoints.length < 2) return null;

  const totalPoints = vwapPoints.length;
  // Adaptive label count: show 1 label as soon as VWAP appears, scale up as data grows
  const LABEL_COUNT = totalPoints < 10 ? 1
    : Math.min(3, Math.max(1, Math.floor(totalPoints / 60)));
  
  const positions: number[] = [];
  // With very few points, place the single label at the latest point for visibility
  if (totalPoints < 10) {
    positions.push(totalPoints - 1);
  } else {
    const spacing = Math.floor(totalPoints / (LABEL_COUNT + 1));
    for (let i = 1; i <= LABEL_COUNT; i++) {
      positions.push(spacing * i);
    }
  }

  // ── Build the ±0.3% shaded band along the VWAP line ──
  // We create a polygon path: upper boundary = VWAP + 0.3%, lower = VWAP - 0.3%
  // Since we only have pixel coords, we need the Y-axis scale to convert
  // Instead, we can estimate: find the pixel distance for 0.3% from a few sample points
  // Using the price data payload to calculate the ratio of pixels to percentage
  const bandElements: React.ReactNode[] = [];
  const labelElements: React.ReactNode[] = [];

  // ── Calculate pixels-per-percent using VWAP data ──
  // Since vwapPoints[i].y = yAxis.scale(avgPrice), we can directly compute
  // how many pixels correspond to 0.3% of the price at any sample point
  const sampleIdx = Math.floor(totalPoints / 2);
  const sampleVwapPt = vwapPoints[sampleIdx];
  const sampleAvgPrice = sampleVwapPt?.payload?.avgPrice;

  // Method 1: Use price vs avgPrice pixel difference
  let pxPerPercent = 0;
  if (sampleAvgPrice && sampleAvgPrice > 0) {
    const samplePricePt = pricePoints[sampleIdx];
    if (samplePricePt) {
      const priceDiffPx = samplePricePt.y - sampleVwapPt.y; // positive = price below vwap in SVG coords
      const priceDiffPct = ((samplePricePt.payload.price - sampleAvgPrice) / sampleAvgPrice) * 100;
      if (Math.abs(priceDiffPct) > 0.01) {
        pxPerPercent = priceDiffPx / priceDiffPct;
      }
    }
  }

  // Method 2: If price ≈ avgPrice, use the chart's Y range to estimate pxPerPercent
  // The chart shows [yMin, yMax] which maps to the full pixel height
  if (pxPerPercent === 0 && sampleAvgPrice && sampleAvgPrice > 0 && pricePoints.length >= 2) {
    // 1% of the sampleAvgPrice in price units
    const onePctInPrice = sampleAvgPrice * 0.01;
    // Use the first and last price points to estimate the scale
    const firstPt = pricePoints[0];
    const midPt = pricePoints[Math.floor(pricePoints.length / 2)];
    if (firstPt && midPt && firstPt.payload?.price && midPt.payload?.price) {
      const priceRange = Math.abs(firstPt.payload.price - midPt.payload.price) || sampleAvgPrice * 0.02;
      const pxRange = Math.abs(firstPt.y - midPt.y) || 100;
      pxPerPercent = (pxRange / priceRange) * onePctInPrice;
    }
  }

  // Method 3: Final fallback — estimate from chart dimensions
  if (pxPerPercent === 0 && pricePoints.length >= 2) {
    const chartHeight = Math.abs(pricePoints[0].y - pricePoints[pricePoints.length - 1].y) || 100;
    // Assume chart shows roughly ±3% range
    pxPerPercent = chartHeight / 6;
  }

  // 0.3% in pixels
  const bandPx = Math.abs(pxPerPercent * 0.3);

  // Build the band polygon as a series of rectangles between upper and lower boundaries
  if (bandPx > 1) {
    // Create the band as a single path
    const upperPath: string[] = [];
    const lowerPath: string[] = [];
    
    // Sample every few points for performance
    const step = Math.max(1, Math.floor(totalPoints / 120));
    for (let i = 0; i < totalPoints; i += step) {
      const pt = vwapPoints[i];
      if (!pt || pt.x == null || pt.y == null) continue;
      upperPath.push(`${pt.x},${pt.y - bandPx}`);
      lowerPath.push(`${pt.x},${pt.y + bandPx}`);
    }
    // Add the last point
    const lastPt = vwapPoints[totalPoints - 1];
    if (lastPt && lastPt.x != null && lastPt.y != null) {
      upperPath.push(`${lastPt.x},${lastPt.y - bandPx}`);
      lowerPath.push(`${lastPt.x},${lastPt.y + bandPx}`);
    }

    // Only need 2 points to draw a band segment
    if (upperPath.length >= 2) {
      // Polygon: go forward along upper, then backward along lower
      const points = [...upperPath, ...lowerPath.reverse()].join(' ');
      bandElements.push(
        <polygon
          key="vwap-band"
          points={points}
          fill="#ca8a04"
          fillOpacity={0.10}
          stroke="none"
        />
      );
      // Upper boundary line (VWAP + 0.3%)
      bandElements.push(
        <polyline
          key="vwap-band-upper"
          points={upperPath.join(' ')}
          fill="none"
          stroke="#ca8a04"
          strokeWidth={0.6}
          strokeOpacity={0.35}
          strokeDasharray="3 3"
        />
      );
      // Lower boundary line (VWAP - 0.3%)
      bandElements.push(
        <polyline
          key="vwap-band-lower"
          points={lowerPath.reverse().join(' ')}
          fill="none"
          stroke="#ca8a04"
          strokeWidth={0.6}
          strokeOpacity={0.35}
          strokeDasharray="3 3"
        />
      );
    }
  }

  // ── Place labels at key positions ──
  const lastVwapX = vwapPoints[totalPoints - 1]?.x ?? 0;
  for (const pos of positions) {
    const vwapPt = vwapPoints[pos];
    const pricePt = pricePoints[pos];
    if (!vwapPt || !pricePt || vwapPt.x == null || vwapPt.y == null) continue;

    const x = vwapPt.x;
    const y = vwapPt.y;
    const priceY = pricePt.y;
    const payload = vwapPt.payload;
    const avgPrice = payload?.avgPrice ?? 0;
    const curPrice = payload?.price ?? 0;
    
    // Calculate deviation from VWAP in percentage
    const devPct = avgPrice > 0 ? ((curPrice - avgPrice) / avgPrice) * 100 : 0;
    const absDevPct = Math.abs(devPct);
    
    let label: string;
    let subLabel: string;
    let color: string;
    let offsetY: number;

    if (absDevPct <= 0.3) {
      // Within ±0.3% of VWAP → 禁止买卖 (both buying AND selling)
      label = "禁止买卖";
      subLabel = `均线±0.3%震荡区`;
      color = "#ca8a04"; // amber/yellow to match VWAP line
      offsetY = priceY < y ? -22 : 22; // offset away from VWAP
    } else if (devPct > 0.3) {
      // Price above VWAP + 0.3% → 禁买 (only sell allowed)
      label = "禁买";
      subLabel = "均线上方高抛区";
      color = "#dc2626"; // red
      offsetY = -18;
    } else {
      // Price below VWAP - 0.3% → 禁卖 (only buy allowed)
      label = "禁卖";
      subLabel = "均线下方低吸区";
      color = "#16a34a"; // green
      offsetY = 18;
    }

    const pillWidth = label.length > 2 ? 56 : 44;
    // When label is at the rightmost position (latest data point), shift it left
    // to avoid being clipped by the chart boundary
    const isAtRightEdge = pos === totalPoints - 1;
    const labelOffsetX = isAtRightEdge ? -pillWidth / 2 - 4 : 0;

    labelElements.push(
      <g key={`vwap-ban-${pos}`}>
        {/* Small indicator dot on VWAP line */}
        <circle cx={x} cy={y} r={2.5} fill={color} fillOpacity={0.6} />
        {/* Main label pill */}
        <rect
          x={x - pillWidth / 2 + labelOffsetX}
          y={y + offsetY - 8}
          width={pillWidth}
          height={16}
          rx={3}
          fill={color}
          fillOpacity={0.15}
          stroke={color}
          strokeWidth={0.8}
          strokeOpacity={0.5}
        />
        <text
          x={x + labelOffsetX}
          y={y + offsetY + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={9}
          fontWeight={700}
          fill={color}
          fillOpacity={0.85}
          fontFamily="sans-serif"
        >
          {label}
        </text>
        {/* Sub-label */}
        <text
          x={x + labelOffsetX}
          y={y + offsetY + (offsetY < 0 ? -12 : 12)}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={7}
          fontWeight={500}
          fill={color}
          fillOpacity={0.45}
          fontFamily="sans-serif"
        >
          {subLabel}
        </text>
      </g>
    );
  }

  return (
    <g className="vwap-ban-annotations">
      {/* Band (bottom layer) */}
      {bandElements}
      {/* Labels (on top of band) */}
      {labelElements}
    </g>
  );
}

// ── Combined Chart Overlay Renderer ──────────────────────
// Ensures proper layer order:
//   Layer 0 (bottom): 均线禁止买卖标注
//   Layer 1: 分时因子 signal markers & labels
//   Layer 2 (middle): 选股标记 pulse/volume markers (ON TOP of factor signals)
//   Layer 3 (top):    Expanded bubbles (interactive, must be on top for usability)

function CombinedChartOverlay(props: any) {
  const { formattedGraphicalItems, xAxisMap, yAxisMap } = props;
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Extract VWAP (avgPrice) line points for "禁止买卖" annotations ──
  // Strategy: Find ANY line's points (all payloads contain both price and avgPrice),
  // then compute VWAP pixel Y positions using yAxis.scale(avgPrice).
  // This is much more robust than trying to identify which line IS the VWAP line.
  const vwapAnnotations = useMemo(() => {
    if (!formattedGraphicalItems || !xAxisMap || !yAxisMap) return null;

    const yAxis = Object.values(yAxisMap)[0] as any;
    if (!yAxis?.scale) return null;

    // Find the first line with points that has payload with avgPrice
    let sourcePoints: any[] | null = null;
    for (let i = 0; i < formattedGraphicalItems.length; i++) {
      const item = formattedGraphicalItems[i];
      if (item?.props?.points && Array.isArray(item.props.points) && item.props.points.length > 0) {
        const pts = item.props.points;
        // Check if the first point with data has avgPrice in payload
        for (const pt of pts) {
          if (pt?.payload?.avgPrice != null && pt?.payload?.price != null) {
            sourcePoints = pts;
            break;
          }
        }
        if (sourcePoints) break;
      }
    }

    if (!sourcePoints || sourcePoints.length === 0) return null;

    // Filter to only points that have actual data (hasData === true)
    const validPoints = sourcePoints.filter((pt: any) =>
      pt?.payload?.hasData === true &&
      pt?.payload?.avgPrice != null &&
      pt?.payload?.price != null &&
      pt.x != null
    );

    if (validPoints.length < 2) return null;

    // Compute both price and VWAP pixel positions from the same source points
    const pricePoints = validPoints.map((pt: any) => ({
      x: pt.x,
      y: yAxis.scale(pt.payload.price),
      payload: pt.payload,
    }));

    const vwapPoints = validPoints.map((pt: any) => ({
      x: pt.x,
      y: yAxis.scale(pt.payload.avgPrice),
      payload: pt.payload,
    }));

    return { vwapPoints, pricePoints };
  }, [formattedGraphicalItems, xAxisMap, yAxisMap]);

  // ── Fingerprint-based cache for overlay computation ──
  // recharts creates new formattedGraphicalItems on every render, even if the data
  // hasn't changed. The fingerprint is cheap to compute (one pass over points) and
  // lets us skip the heavy signal extraction + overlap resolution when data is the same.
  const fp = buildOverlayFingerprint(formattedGraphicalItems, xAxisMap, yAxisMap, expandedIds);

  const { signalResult, pvPlacedLabels } = fp !== "empty"
    ? overlayCache.compute(fp, () => {
        // Compute signal elements (factor signals)
        const sr = computeTimelineSignalElements(
          formattedGraphicalItems, xAxisMap, yAxisMap, expandedIds, toggleExpand
        );

        // Compute PV marker points (screener markers)
        const pvPoints = extractPulseVolumePoints(formattedGraphicalItems);

        // Resolve PV label overlaps
        const pvLabels = pvPoints.length > 0 ? resolvePvLabelOverlaps(pvPoints) : [];

        return { signalResult: sr, pvPlacedLabels: pvLabels };
      })
    : { signalResult: null, pvPlacedLabels: [] as PlacedLabel[] };

  if (!signalResult && pvPlacedLabels.length === 0 && !vwapAnnotations) return null;

  return (
    <g>
      {/* Layer 0 (bottom-most): 均线禁止买卖标注 — 挨着均线显示 */}
      {vwapAnnotations && <VwapBanAnnotations vwapPoints={vwapAnnotations.vwapPoints} pricePoints={vwapAnnotations.pricePoints} />}
      {/* Layer 1: 分时因子 signal markers & labels (常规信号) */}
      {signalResult?.signalElements}
      {/* Layer 2 (middle): 选股标记 pulse/volume markers — ON TOP of factor signals */}
      {pvPlacedLabels.length > 0 && (
        <g className="pulse-volume-markers">
          {pvPlacedLabels.map((p) => renderPulseVolumeMarker(p.x, p.y, p.marker, p.idx, p.adjustedLabelY, p.adjustedX))}
        </g>
      )}
      {/* Layer 3: 优先信号（高开卖出/放量下跌买点）— 确保显示在最前面，不被PV标签遮挡 */}
      {signalResult?.prioritySignalElements}
      {/* Layer 4 (top): Expanded bubbles — interactive, must be on top for usability */}
      {signalResult?.bubbleElements}
    </g>
  );
}

// ── Legacy TimelineSignalRenderer (kept for backward compat, delegates to computeTimelineSignalElements) ──

function TimelineSignalRenderer(props: any) {
  const { formattedGraphicalItems, xAxisMap, yAxisMap } = props;
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const result = computeTimelineSignalElements(formattedGraphicalItems, xAxisMap, yAxisMap, expandedIds, toggleExpand);
  if (!result) return null;

  return (
    <g>
      {result.signalElements}
      {result.prioritySignalElements}
      {result.bubbleElements}
    </g>
  );
}

// ── Custom Percentage Y-Axis Tick (deep red/green color coding) ───

function PercentYTick(props: { x?: number; y?: number; payload?: { value?: number }; index?: number; visibleTicksCount?: number }) {
  const { x = 0, y = 0, payload } = props;
  const val = payload?.value ?? 0;
  const isPositive = val > 0.001;
  const isZero = Math.abs(val) <= 0.001;
  // Deep colors: red-600 for positive, green-600 for negative, muted for zero
  const fill = isZero ? "#6b7280" : isPositive ? "#dc2626" : "#16a34a";
  const text = isZero ? "0.00%" : val > 0 ? `+${val.toFixed(2)}%` : `${val.toFixed(2)}%`;
  return (
    <text x={x} y={y} textAnchor="end" dominantBaseline="middle" fill={fill} fontSize={10} fontWeight="600">
      {text}
    </text>
  );
}

// ── 同花顺风格 分时图 (Unified Three-Panel) ──────────

/**
 * Custom shallow-equivalent comparison for TimeSharingPanel props.
 * Compares array/object props by content fingerprint instead of reference,
 * so React.memo can actually skip re-renders when data hasn't changed.
 */
function timeSharingPropsEqual(
  prev: React.ComponentProps<typeof TimeSharingPanel>,
  next: React.ComponentProps<typeof TimeSharingPanel>
): boolean {
  // Quick primitive checks first
  if (
    prev.prevClose !== next.prevClose ||
    prev.symbol !== next.symbol ||
    prev.visibleMinutes !== next.visibleMinutes ||
    prev.zoomIdx !== next.zoomIdx ||
    prev.maxZoomIdx !== next.maxZoomIdx ||
    prev.panOffset !== next.panOffset ||
    prev.prevDayMA5 !== next.prevDayMA5 ||
    prev.activeIndexKey !== next.activeIndexKey
  ) return false;

  // Data array: compare length + last item fingerprint (most frequent change)
  const pd = prev.data, nd = next.data;
  if (pd.length !== nd.length) return false;
  if (pd.length > 0) {
    const pLast = pd[pd.length - 1], nLast = nd[nd.length - 1];
    if (pLast.price !== nLast.price || pLast.time !== nLast.time || pLast.volume !== nLast.volume) return false;
  }

  // Signals: compare length + last signal type/reason + first signal
  const ps = prev.signals, ns = next.signals;
  if (ps.length !== ns.length) return false;
  if (ps.length > 0) {
    const pSig = ps[ps.length - 1], nSig = ns[ns.length - 1];
    if (pSig?.type !== nSig?.type || pSig?.reason !== nSig?.reason) return false;
    // Also check first signal to catch new signals at the start
    const pFirst = ps[0], nFirst = ns[0];
    if (pFirst?.type !== nFirst?.type || pFirst?.reason !== nFirst?.reason) return false;
  }

  // MACD data: compare length + last MACD values (most likely to change)
  if (prev.macdData.length !== next.macdData.length) return false;
  if (prev.macdData.length > 0) {
    const pm = prev.macdData[prev.macdData.length - 1];
    const nm = next.macdData[next.macdData.length - 1];
    if (pm.dif !== nm.dif || pm.macd !== nm.macd) return false;
  }

  // Key price levels: compare length + first level price
  if ((prev.keyPriceLevels?.length || 0) !== (next.keyPriceLevels?.length || 0)) return false;
  if (prev.keyPriceLevels && prev.keyPriceLevels.length > 0 && next.keyPriceLevels && next.keyPriceLevels.length > 0) {
    if (prev.keyPriceLevels[0].price !== next.keyPriceLevels[0].price) return false;
  }

  // PV markers: compare length + last marker time
  if ((prev.pvMarkers?.length || 0) !== (next.pvMarkers?.length || 0)) return false;
  if (prev.pvMarkers && prev.pvMarkers.length > 0 && next.pvMarkers && next.pvMarkers.length > 0) {
    if (prev.pvMarkers[prev.pvMarkers.length - 1].time !== next.pvMarkers[next.pvMarkers.length - 1].time) return false;
  }

  // Regime objects: compare regime string
  if (prev.szIndexRegime?.regime !== next.szIndexRegime?.regime) return false;
  if (prev.sectorRegime?.regime !== next.sectorRegime?.regime) return false;
  if (prev.sectorInfo?.code !== next.sectorInfo?.code) return false;
  if (prev.sectorLoading !== next.sectorLoading) return false;
  if (prev.indexLoading !== next.indexLoading) return false;

  // Index timeline data: compare items length for active key + last item price
  const prevIdxData = prev.indexTimelineData?.[prev.activeIndexKey || "sz"];
  const nextIdxData = next.indexTimelineData?.[next.activeIndexKey || "sz"];
  if ((prevIdxData?.items.length || 0) !== (nextIdxData?.items.length || 0)) return false;
  if (prevIdxData && prevIdxData.items.length > 0 && nextIdxData && nextIdxData.items.length > 0) {
    const piLast = prevIdxData.items[prevIdxData.items.length - 1];
    const niLast = nextIdxData.items[nextIdxData.items.length - 1];
    if (piLast.price !== niLast.price) return false;
  }

  // Sector timeline data: compare items length + last item price
  if ((prev.sectorTimelineData?.items.length || 0) !== (next.sectorTimelineData?.items.length || 0)) return false;
  if (prev.sectorTimelineData && prev.sectorTimelineData.items.length > 0 && next.sectorTimelineData && next.sectorTimelineData.items.length > 0) {
    const psLast = prev.sectorTimelineData.items[prev.sectorTimelineData.items.length - 1];
    const nsLast = next.sectorTimelineData.items[next.sectorTimelineData.items.length - 1];
    if (psLast.price !== nsLast.price) return false;
  }

  // Callbacks and config are stable refs (useCallback in parent)

  // Recent day lows: compare length + each low value
  if ((prev.recentDayLows?.length || 0) !== (next.recentDayLows?.length || 0)) return false;
  if (prev.recentDayLows && next.recentDayLows) {
    for (let i = 0; i < prev.recentDayLows.length; i++) {
      if (prev.recentDayLows[i].low !== next.recentDayLows[i].low) return false;
    }
  }

  return true;
}

export const TimeSharingPanel = React.memo(function TimeSharingPanel({
  data,
  prevClose,
  symbol,
  signals,
  macdData,
  visibleMinutes = 241,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  zoomIdx = 0,
  maxZoomIdx = 4,
  prevDayMA5,
  szIndexRegime,
  activeIndexKey,
  indexConfig,
  onCycleIndex,
  keyPriceLevels,
  panOffset = 0,
  onPanOffsetChange,
  sectorRegime,
  sectorInfo,
  sectorLoading,
  onRetrySector,
  pvMarkers,
  stockName,
  indexTimelineData,
  sectorTimelineData,
  indexLoading,
  onRetryIndex,
  recentDayLows,
}: {
  data: TimelineItem[];
  prevClose: number;
  symbol: string;
  signals: (TSignal | null)[];
  macdData: { time: string; dif: number | null; dea: number | null; macd: number | null }[];
  visibleMinutes?: number;
  onZoomIn?: (cursorRatio?: number) => void;
  onZoomOut?: (cursorRatio?: number) => void;
  onZoomReset?: () => void;
  zoomIdx?: number;
  maxZoomIdx?: number;
  prevDayMA5?: number | null;
  szIndexRegime?: RegimeDetail | null;
  activeIndexKey?: string;
  indexConfig?: Record<string, { symbol: string; label: string; shortLabel: string }>;
  onCycleIndex?: () => void;
  keyPriceLevels?: { price: number; name: string; type: "support" | "resistance" }[];
  panOffset?: number;
  onPanOffsetChange?: (offset: number) => void;
  sectorRegime?: RegimeDetail | null;
  sectorInfo?: { code: string; name: string } | null;
  sectorLoading?: boolean;
  onRetrySector?: () => void;
  pvMarkers?: PulseVolumeMarker[];
  stockName?: string;
  indexTimelineData?: Record<string, { items: TimelineItem[]; prevClose: number }>;
  sectorTimelineData?: { items: TimelineItem[]; prevClose: number };
  indexLoading?: boolean;
  onRetryIndex?: () => void;
  recentDayLows?: { date: string; low: number }[];
}) {
  // v5.8: 低价股/ETF（昨收<5元）价格显示3位小数，避免分时线变平线
  const priceDps = (prevClose > 0 && prevClose < 5) ? 3 : 2;
  const priceFmt = (v: number | undefined | null) => v != null ? v.toFixed(priceDps) : "--";
  const priceFmtVal = (v: number) => v.toFixed(priceDps);

  // ── Build full-day timeline template (240 minutes total) ──
  // A-share trading day: 09:30-11:30 (120min) + 13:00-15:00 (120min)
  // Performance: fingerprint cache to skip rebuilding 242 objects when data hasn't meaningfully changed.
  const { fullDayData, timeTicks } = useMemo(() => {
    if (data.length === 0) return { fullDayData: [], timeTicks: [] };

    // Fingerprint: data length + last 3 prices/volumes + signal/MACD/pv counts + prevClose
    const last3 = data.slice(-3).map(d => `${(d.price ?? 0).toFixed(2)}:${d.volume}`).join(',');
    const fp = `${data.length}:${last3}:${prevClose}:${signals.filter(Boolean).length}:${macdData.length}:${pvMarkers?.length || 0}`;

    // Check if we can reuse the cached fullDayData via FingerprintCache
    const cached = fullDayDataCache.compute(fp, () => {
      // Use pre-computed allTimes array (constant for A-share)
      const allTimes = ALL_TRADE_TIMES;

      // Build signal map by time
      const signalByTime = new Map<string, TSignal>();
      signals.forEach((s, i) => {
        if (s && data[i]) signalByTime.set(data[i].time, s);
      });

      // ── Filter buy signals in early decline ban zone ──
      // 快速检测：不依赖 pvMarkers，3根数据即可触发
      {
        const earlyData = data.filter(d => {
          const mins = pvParseTime(d.time);
          return mins >= 570 && mins < 630;
        });
        let shouldFilter = false;
        let banEndTime = 585; // default 9:45

        if (earlyData.length >= 3) {
          const openPrice = earlyData[0].price;
          const lastEarlyPrice = earlyData[earlyData.length - 1].price;
          const earlyNetChange = openPrice > 0 ? ((lastEarlyPrice - openPrice) / openPrice) * 100 : 0;
          const belowPrevClose = prevClose > 0 && lastEarlyPrice < prevClose;

          // 条件1: pvMarkers 有下跌标记
          let hasPvDecline = false;
          if (pvMarkers && pvMarkers.length > 0) {
            const earlyDeclines = pvMarkers.filter(m =>
              (m.type === "volume_decline" || m.type === "pulse_decline"
                || m.type === "early_vol_drop" || m.type === "slow_decline")
              && pvParseTime(m.time) >= 570 && pvParseTime(m.time) <= 630
            );
            if (earlyDeclines.length > 0 && earlyData.length >= 5) {
              if (earlyNetChange <= 0 && !(prevClose > 0 && lastEarlyPrice > prevClose)) {
                hasPvDecline = true;
                banEndTime = Math.min(630, 585 + earlyDeclines.length * 5);
              }
            }
          }

          // 条件2: 纯价格下跌快速检测（3根即可，不依赖pvMarkers）
          let quickDecline = false;
          if (!hasPvDecline && earlyNetChange <= 0 && belowPrevClose) {
            let downCount = 0;
            for (let k = 1; k < earlyData.length; k++) {
              if (earlyData[k].price < earlyData[k - 1].price) downCount++;
            }
            const mostlyDropping = downCount >= Math.floor(earlyData.length / 2);
            const dropFromOpen = openPrice > 0 ? ((openPrice - lastEarlyPrice) / openPrice) * 100 : 0;
            if (dropFromOpen >= 0.3 && mostlyDropping) {
              quickDecline = true;
              banEndTime = Math.min(610, 580 + Math.round(dropFromOpen * 8));
            }
          }

          shouldFilter = hasPvDecline || quickDecline;
        }

        if (shouldFilter) {
          const keysToRemove: string[] = [];
          signalByTime.forEach((sig, time) => {
            if (sig.type === "buy" && pvParseTime(time) < banEndTime) {
              keysToRemove.push(time);
            }
          });
          keysToRemove.forEach(k => signalByTime.delete(k));
        }
      }

      // Build MACD map by time
      const macdByTime = new Map<string, { dif: number; dea: number; macd: number }>();
      for (const m of macdData) {
        if (m.dif != null && m.dea != null && m.macd != null) {
          macdByTime.set(m.time, { dif: m.dif, dea: m.dea, macd: m.macd });
        }
      }

      // Build pulse/volume marker map by time
      const pvMarkerByTime = new Map<string, PulseVolumeMarker[]>();
      if (pvMarkers && pvMarkers.length > 0) {
        for (const m of pvMarkers) {
          const existing = pvMarkerByTime.get(m.time) || [];
          existing.push(m);
          pvMarkerByTime.set(m.time, existing);
        }
      }

      // Build actual data map by time
      const dataByTime = new Map<string, TimelineItem>();
      data.forEach((d) => dataByTime.set(d.time, d));

      // Pre-compute prevActual for each time point — O(n) instead of O(n²)
      // Avoids nested loop searching backwards for each data point
      const prevActualMap = new Map<string, TimelineItem | null>();
      let prevItem: TimelineItem | null = null;
      for (const d of data) {
        prevActualMap.set(d.time, prevItem);
        prevItem = d;
      }

      // Merge: fill full day, actual data where available, null placeholders elsewhere
      const lastActualIdx = data.length > 0 ? allTimes.indexOf(data[data.length - 1].time) : -1;
      const fullDay = allTimes.map((time, idx) => {
        const actual = dataByTime.get(time);
        const hasData = actual != null;
        // Only show data up to the last actual time (no future data)
        const isFuture = idx > lastActualIdx && lastActualIdx >= 0;
        if (hasData && !isFuture) {
          const prevActual = prevActualMap.get(time) ?? null;
          const safePrevClose = prevClose > 0 ? prevClose : data[0].price;
          return {
            idx,
            time,
            price: actual.price,
            avgPrice: actual.avgPrice,
            volume: actual.volume,
            changePercent: actual.changePercent,
            volUp: prevActual ? actual.price >= prevActual.price : actual.price >= safePrevClose,
            tSignal: signalByTime.get(time) || undefined,
            pvMarker: pvMarkerByTime.get(time) || undefined,
            dif: macdByTime.get(time)?.dif ?? undefined,
            dea: macdByTime.get(time)?.dea ?? undefined,
            macd: macdByTime.get(time)?.macd ?? undefined,
            hasData: true,
          };
        }
        // Empty slot (no data yet or future)
        return {
          idx, time,
          price: null as unknown as number,
          avgPrice: null as unknown as number,
          volume: 0,
          changePercent: 0,
          volUp: true,
          tSignal: undefined,
          dif: null as unknown as number,
          dea: null as unknown as number,
          macd: null as unknown as number,
          hasData: false,
        };
      });

      // Key time ticks for X-axis labels
      const keyTimes = ["09:30", "10:00", "10:30", "11:00", "11:30", "13:00", "13:30", "14:00", "14:30", "15:00"];
      const ticks = keyTimes.map((t) => allTimes.indexOf(t)).filter((i) => i >= 0);

      return { fullDayData: fullDay, timeTicks: ticks };
    });

    return cached;
  }, [data, prevClose, signals, macdData, pvMarkers]);

  // ── Crosshair state: shared across all three panels ──
  const [crosshairIdx, setCrosshairIdx] = useState<number | null>(null);
  const deferredCrosshairIdx = useDeferredValue(crosshairIdx);
  // Throttle crosshair updates to ~15fps to avoid excessive re-renders during mouse hover
  const lastCrosshairUpdateRef = useRef(0);
  const setCrosshairIdxThrottled = useCallback((idx: number | null) => {
    if (idx === null) { setCrosshairIdx(null); return; }
    const now = performance.now();
    if (now - lastCrosshairUpdateRef.current >= 66) { // ~15fps
      lastCrosshairUpdateRef.current = now;
      setCrosshairIdx(idx);
    }
  }, []);
  // Stable chart mouse handlers (prevent recharts from re-rendering on new function refs)
  const handleChartMouseMove = useCallback((state: any) => {
    if (state?.activeTooltipIndex != null) {
      setCrosshairIdxThrottled(state.activeTooltipIndex);
    }
  }, [setCrosshairIdxThrottled]);
  const handleChartMouseLeave = useCallback(() => {
    setCrosshairIdxThrottled(null);
  }, [setCrosshairIdxThrottled]);

  // ── Drag-to-pan & scroll-to-pan state ──
  const dragRef = useRef<{ startX: number; startPanOffset: number; isDragging: boolean }>({ startX: 0, startPanOffset: 0, isDragging: false });
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Refs for stable event handlers
  const panOffsetRef = useRef(panOffset);
  const visibleMinutesRef = useRef(visibleMinutes);
  const fullDayDataRef = useRef(fullDayData);
  const onPanOffsetChangeRef = useRef(onPanOffsetChange);
  const onZoomInRef = useRef(onZoomIn);
  const onZoomOutRef = useRef(onZoomOut);
  const zoomIdxRef = useRef(zoomIdx);
  const maxZoomIdxRef = useRef(maxZoomIdx);
  useEffect(() => {
    panOffsetRef.current = panOffset;
    visibleMinutesRef.current = visibleMinutes;
    fullDayDataRef.current = fullDayData;
    onPanOffsetChangeRef.current = onPanOffsetChange;
    onZoomInRef.current = onZoomIn;
    onZoomOutRef.current = onZoomOut;
    zoomIdxRef.current = zoomIdx;
    maxZoomIdxRef.current = maxZoomIdx;
  }, [panOffset, visibleMinutes, fullDayData, onPanOffsetChange, onZoomIn, onZoomOut, zoomIdx, maxZoomIdx]);

  // ── Drag-to-pan & scroll-to-pan (stable native events via ref pattern) ──
  useEffect(() => {
    // Pan helper — defined inside effect to avoid memoization issues
    const applyPanOffset = (rawOffset: number) => {
      const fdd = fullDayDataRef.current;
      const vm = visibleMinutesRef.current;
      const lastIdx = fdd.reduce((last: number, item: { hasData: boolean }, idx: number) => (item.hasData ? idx : last), -1);
      const maxOffset = Math.max(0, lastIdx - vm + 1);
      onPanOffsetChangeRef.current?.(Math.max(0, Math.min(rawOffset, maxOffset)));
    };

    const container = chartContainerRef.current;
    if (!container) return;

    const isZoomed = () => visibleMinutesRef.current < fullDayDataRef.current.length;

    const onMouseDown = (e: MouseEvent) => {
      // Left-click drag when zoomed, any click drag when not
      if (e.button !== 0) return; // only left-click
      if (!isZoomed()) return;
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { startX: e.clientX, startPanOffset: panOffsetRef.current, isDragging: true };
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current.isDragging) return;
      e.preventDefault();
      const dx = e.clientX - dragRef.current.startX;
      const containerWidth = container.clientWidth || 600;
      const vm = visibleMinutesRef.current;
      const estimatedPoints = Math.min(vm, fullDayDataRef.current.length);
      const pixelsPerPoint = containerWidth / estimatedPoints;
      const pointDelta = Math.round(dx / pixelsPerPoint);
      // Drag right → see newer data → decrease offset; Drag left → see older data → increase offset
      const newOffset = dragRef.current.startPanOffset - pointDelta;
      applyPanOffset(newOffset);
    };

    const onMouseUp = () => {
      if (dragRef.current.isDragging) {
        dragRef.current.isDragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    const onContextMenu = (e: Event) => {
      if (dragRef.current.isDragging) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // Scroll wheel: zoom in/out; Shift+scroll or horizontal scroll: pan
    const onWheel = (e: WheelEvent) => {
      // Only allow zoom on the price chart — skip if cursor is over VOL or MACD panels
      const target = e.target as HTMLElement;
      const panel = target.closest('[data-chart-panel]');
      if (panel && (panel.getAttribute('data-chart-panel') === 'vol' || panel.getAttribute('data-chart-panel') === 'macd')) {
        // Don't intercept — let the page scroll naturally
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      // Shift+scroll or horizontal scroll → pan (when zoomed)
      if (e.shiftKey || e.deltaX !== 0) {
        if (!isZoomed()) return;
        const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
        const scrollStep = Math.sign(delta) * Math.max(1, Math.round(Math.abs(delta) / 40));
        const newOffset = panOffsetRef.current + scrollStep;
        applyPanOffset(newOffset);
        return;
      }

      // Normal vertical scroll → zoom in/out centered on cursor position
      const rect = container.getBoundingClientRect();
      const cursorRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

      // deltaY < 0 (scroll up) → zoom in, deltaY > 0 (scroll down) → zoom out
      if (e.deltaY < 0) {
        // Zoom in
        if (zoomIdxRef.current < (maxZoomIdxRef.current ?? 4)) {
          onZoomInRef.current?.(cursorRatio);
        }
      } else if (e.deltaY > 0) {
        // Zoom out
        if (zoomIdxRef.current > 0) {
          onZoomOutRef.current?.(cursorRatio);
        }
      }
    };

    container.addEventListener('mousedown', onMouseDown, true);
    container.addEventListener('contextmenu', onContextMenu, true);
    container.addEventListener('wheel', onWheel, { passive: false, capture: true });
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('contextmenu', onContextMenu, true);

    return () => {
      container.removeEventListener('mousedown', onMouseDown, true);
      container.removeEventListener('contextmenu', onContextMenu, true);
      container.removeEventListener('wheel', onWheel, true);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('contextmenu', onContextMenu, true);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []); // empty deps — stable listeners via refs

  // ── Memoized: zoom slicing + all derived calculations ──
  const {
    zoomData, xDomain, zoomTimeTicks, isZoomed, safePrevClose,
    yMin, yMax, percentMin, percentMax,
    buySignals, sellSignals, stoplossSignals,
    maxVolume, macdMin, macdMax, macdPad,
    lastItem, lastSignal, barSize, lastDataIdx,
    highestPrice, lowestPrice,
  } = useMemo(() => {
    // ── Zoom: slice fullDayData to show only visibleMinutes ──
    const lastDataIdx = fullDayData.reduce((last, item, idx) => (item.hasData ? idx : last), -1);
    const totalSlots = fullDayData.length;

    // Calculate the visible range
    let zd: typeof fullDayData;
    let xd: [number, number];
    let ztt: number[];

    if (visibleMinutes >= totalSlots || lastDataIdx < 0) {
      zd = fullDayData;
      xd = [0, totalSlots - 1];
      ztt = timeTicks;
    } else {
      const baseEndIdx = lastDataIdx;
      const endIdx = Math.min(baseEndIdx, Math.max(visibleMinutes - 1, baseEndIdx - panOffset));
      const startIdx = Math.max(0, endIdx - visibleMinutes + 1);
      // Create new objects with idx to avoid mutating shared fullDayData references
      zd = fullDayData.slice(startIdx, endIdx + 1).map((d, i) => ({ ...d, idx: i }));
      xd = [0, zd.length - 1];

      const tickInterval = zd.length <= 60 ? 10 : zd.length <= 120 ? 20 : 30;
      ztt = [];
      for (let i = 0; i < zd.length; i += tickInterval) {
        ztt.push(i);
      }
      if (ztt[ztt.length - 1] !== zd.length - 1) {
        ztt.push(zd.length - 1);
      }
    }

    const iz = visibleMinutes < totalSlots;

    // Smart Y-axis auto-scaling
    const spc = prevClose > 0 ? prevClose : data[0]?.price ?? 0;
    const visiblePrices = zd.filter(d => d.hasData && d.price != null).map(d => d.price!);
    const visibleAvgPrices = zd.filter(d => d.hasData && d.avgPrice != null).map(d => d.avgPrice!);
    const ap = visiblePrices.length > 0 ? visiblePrices : data.map((d) => d.price);
    const aap = visibleAvgPrices.length > 0 ? visibleAvgPrices : data.filter(d => d.avgPrice != null).map(d => d.avgPrice!);

    // Use reduce for min/max to avoid call stack issues with spread on large arrays
    const allVals = [...ap, ...aap];
    const dMin = allVals.reduce((mn, v) => (v < mn ? v : mn), allVals[0] ?? 0);
    const dMax = allVals.reduce((mx, v) => (v > mx ? v : mx), allVals[0] ?? 0);
    const dRange = dMax - dMin || spc * 0.001;
    const pad = Math.max(dRange * 0.2, spc * 0.002);

    let ymn = dMin - pad;
    let ymx = dMax + pad;
    const pcm = spc * 0.002;
    if (spc < ymn) ymn = spc - pcm;
    else if (spc > ymx) ymx = spc + pcm;

    // Ensure 5-day low line is always within Y-axis domain
    if (recentDayLows && recentDayLows.length > 0) {
      for (const dl of recentDayLows) {
        if (dl.low > 0 && dl.low < ymn) ymn = dl.low - pcm;
      }
    }

    const pMin = ((ymn - spc) / spc) * 100;
    const pMax = ((ymx - spc) / spc) * 100;

    // Count signals
    let bs = 0, ss = 0, sls = 0;
    for (const s of signals) {
      if (s?.type === "buy") bs++;
      else if (s?.type === "sell") ss++;
      else if (s?.type === "stoploss") sls++;
    }

    // Volume range (use reduce to avoid spread)
    const mv = data.reduce((mx, d) => (d.volume > mx ? d.volume : mx), 1);

    // MACD range — use ZOOMED data (not full macdData) so Y-axis adapts when zoomed
    const macdVals = zd.filter(d => d.dif != null).flatMap((d) => [d.dif, d.dea, d.macd as number]).filter((v): v is number => v != null);
    let mMin = macdVals.length ? macdVals.reduce((mn, v) => (v < mn ? v : mn), macdVals[0]) : -1;
    let mMax = macdVals.length ? macdVals.reduce((mx, v) => (v > mx ? v : mx), macdVals[0]) : 1;
    // Ensure zero line is always visible in MACD chart
    if (mMin > 0) mMin = 0;
    if (mMax < 0) mMax = 0;
    const mPad = (mMax - mMin) * 0.05 || 0.05;

    // Last item & last signal
    const li = data[data.length - 1];
    let ls: typeof signals[number] = null;
    for (let i = signals.length - 1; i >= 0; i--) {
      if (signals[i]) { ls = signals[i]; break; }
    }

    const brs = zd.length > 200 ? 2 : zd.length > 100 ? 3 : zd.length > 60 ? 4 : 5;

    // Highest & lowest price in visible data
    let hi = -Infinity, lo = Infinity;
    for (const d of zd) {
      if (!d.hasData) continue;
      if (d.price > hi) hi = d.price;
      if (d.price < lo) lo = d.price;
    }
    const highestPrice = isFinite(hi) ? hi : null;
    const lowestPrice = isFinite(lo) ? lo : null;

    return {
      zoomData: zd, xDomain: xd, zoomTimeTicks: ztt, isZoomed: iz, safePrevClose: spc,
      yMin: ymn, yMax: ymx, percentMin: pMin, percentMax: pMax,
      buySignals: bs, sellSignals: ss, stoplossSignals: sls,
      maxVolume: mv, macdMin: mMin, macdMax: mMax, macdPad: mPad,
      lastItem: li, lastSignal: ls, barSize: brs, lastDataIdx,
      highestPrice, lowestPrice,
    };
  }, [fullDayData, data, visibleMinutes, panOffset, timeTicks, prevClose, signals, macdData, recentDayLows]);

  // ── Crosshair item (must be after zoomData is computed) ──
  const crosshairItem = deferredCrosshairIdx != null && deferredCrosshairIdx >= 0 && deferredCrosshairIdx < zoomData.length
    ? zoomData[deferredCrosshairIdx]
    : null;

  // ── Memoize detectMarketRegimeDetail (was called inside IIFE on every render) ──
  // Performance: fingerprint cache to avoid recomputation when only last price ticks slightly
  const regimeDetail = useMemo(() => {
    const fp = `${data.length}:${data.slice(-3).map(d => (d.price ?? 0).toFixed(2)).join(',')}:${prevClose}`;
    return regimeDetailCache.compute(fp, () => detectMarketRegimeDetail(data, prevClose));
  }, [data, prevClose]);

  // ── Intraday institutional intent analysis ──
  // Performance: fingerprint cache to skip heavy analysis when data barely changed
  const intradayIntent = useMemo(() => {
    if (data.length < 20 || prevClose <= 0) return null;
    const fp = `${data.length}:${data.slice(-5).map(d => `${(d.price ?? 0).toFixed(2)}:${d.volume}`).join(',')}:${prevClose}`;
    return intradayIntentCache.compute(fp, () => analyzeIntradayIntent(data, prevClose));
  }, [data, prevClose]);

  // ── 早盘放量下跌禁买检测（智能动态分级制 v2） ──
  // 多维度综合评分，精确计算量比，动态调整禁买截止时间：
  //   1. 精确量比：从原始成交量数据计算，而非估算
  //   2. 下跌速度：急跌 vs 阴跌，速度越快越危险
  //   3. 企稳判断：已止跌反弹可提前解除
  //   4. 多波下跌：连续多波比单波更危险
  //   5. VWAP偏离：远离均价更危险
  //   6. 跳空低开：结合量能判断
  //   7. 动态时间：基于危险指数精确计算禁买截止时间
  // ── Short-circuit: after 10:30, the ban result is frozen (only relevant in first hour) ──
  // We check time inside the memo so React Compiler can still preserve memoization
  const earlyVolDeclineBan = useMemo((): {
    tier: "mild" | "medium" | "strong" | "extreme";
    banEndTime: number; // minutes from midnight
    banEndTimeStr: string;
    declineScore: number;
    dropRate: number;
    volRatio: number;
    speedIndex: number;       // 下跌速度指数 0-100
    stabilityIndex: number;   // 企稳指数 0-100 (越高越稳)
    waveCount: number;        // 下跌波数
    vwapDeviation: number;    // VWAP偏离度(%)
    gapDownRate: number;      // 跳空低开幅度(%)
    dangerIndex: number;      // 综合危险指数 0-100
    earlyLifted: boolean;     // 是否因企稳提前解禁
  } | null => {
    // Fingerprint cache to skip heavy 300+ line computation when data hasn't changed
    // Include early data summary to catch pure-price-decline (not just pvMarkers)
    const earlyDataFp = data.filter(d => { const m = pvParseTime(d.time); return m >= 570 && m < 630; }).slice(-5).map(d => `${(d.price ?? 0).toFixed(2)}:${(d.avgPrice ?? 0).toFixed(2)}`).join(',');
    const fp = `${pvMarkers?.length}:${pvMarkers?.filter(m => m.type === "volume_decline" || m.type === "pulse_decline" || m.type === "early_vol_drop" || m.type === "slow_decline").map(m => `${m.time}:${m.type}`).join(',')}:${data.length}:${data.slice(-3).map(d => `${(d.price ?? 0).toFixed(2)}:${d.volume}`).join(',')}:${prevClose}:early=${earlyDataFp}`;
    return banCache.compute(fp, () => {
    // ── 0. 提取早盘原始数据 ──（提前计算，pvMarkers 和纯价格检测都要用）
    const earlyData = data.filter(d => {
      const mins = pvParseTime(d.time);
      return mins >= 570 && mins < 630;
    });

    // ── 0-FAST: 快速检测（只需3根数据即可触发） ──
    // 不等 pvMarkers（需10根），纯基于价格/量判断，第一时间显示禁买区
    if (earlyData.length >= 3 && earlyData.length < 5) {
      const openPrice = earlyData[0].price;
      const lastPrice = earlyData[earlyData.length - 1].price;
      const dropFromOpen = openPrice > 0 ? ((openPrice - lastPrice) / openPrice) * 100 : 0;
      const belowPrevClose = prevClose > 0 && lastPrice < prevClose;
      // 3根中2根以上下跌
      let downCount = 0;
      for (let k = 1; k < earlyData.length; k++) {
        if (earlyData[k].price < earlyData[k - 1].price) downCount++;
      }
      const mostlyDropping = downCount >= Math.floor(earlyData.length / 2);
      // 放量下跌检测：后几根量 > 前几根
      const firstHalfVol = earlyData.slice(0, Math.ceil(earlyData.length / 2)).reduce((s, d) => s + d.volume, 0);
      const secondHalfVol = earlyData.slice(Math.ceil(earlyData.length / 2)).reduce((s, d) => s + d.volume, 0);
      const volIncreasing = secondHalfVol > firstHalfVol * 1.2;

      if (dropFromOpen >= 0.3 && belowPrevClose && (mostlyDropping || volIncreasing)) {
        const quickDanger = Math.min(60, Math.round(dropFromOpen * 15 + (volIncreasing ? 15 : 0) + (mostlyDropping ? 10 : 0)));
        let quickTier: "mild" | "medium" | "strong" | "extreme" = "mild";
        let quickBanEnd = 580;
        if (quickDanger >= 50) { quickTier = "strong"; quickBanEnd = 610; }
        else if (quickDanger >= 30) { quickTier = "medium"; quickBanEnd = 595; }
        else { quickTier = "mild"; quickBanEnd = 580; }
        const banH = Math.floor(quickBanEnd / 60);
        const banM = quickBanEnd % 60;
        return {
          tier: quickTier, banEndTime: quickBanEnd,
          banEndTimeStr: `${banH.toString().padStart(2, '0')}:${banM.toString().padStart(2, '0')}`,
          declineScore: Math.round(dropFromOpen * 10), dropRate: dropFromOpen,
          volRatio: volIncreasing ? 1.5 : 1, speedIndex: Math.round(dropFromOpen * 10),
          stabilityIndex: 0, waveCount: 1, vwapDeviation: 0,
          gapDownRate: prevClose > 0 && openPrice > 0 ? ((prevClose - openPrice) / prevClose) * 100 : 0,
          dangerIndex: quickDanger, earlyLifted: false,
        };
      }
      // 数据太少且不符合快速条件，暂不触发
      return null;
    }

    if (earlyData.length < 5) return null;

    const openPrice = earlyData[0].price;
    const lowPrice = Math.min(...earlyData.map(d => d.price));
    const highPrice = Math.max(...earlyData.map(d => d.price));
    const lastEarlyPrice = earlyData[earlyData.length - 1].price;

    // ── 0.5 二次校验：早盘整体趋势 ──
    const earlyNetChange = openPrice > 0
      ? ((lastEarlyPrice - openPrice) / openPrice) * 100 : 0;
    // 早盘整体上涨 → 不是真正的下跌，不触发禁买
    if (earlyNetChange > 0) return null;
    // 相对昨收上涨 → 也不是真正的下跌
    if (prevClose > 0 && lastEarlyPrice > prevClose) return null;

    // ── 1. 收集早盘下跌标记（扩展：含缩量下跌和阴跌） ──
    let earlyVolDeclines: PulseVolumeMarker[] = [];
    if (pvMarkers && pvMarkers.length > 0) {
      earlyVolDeclines = pvMarkers.filter(m => {
        if (m.type !== "volume_decline" && m.type !== "pulse_decline"
            && m.type !== "early_vol_drop" && m.type !== "slow_decline") return false;
        const mins = pvParseTime(m.time);
        return mins >= 570 && mins <= 630;
      });
    }

    // ── 1.5 补充检测：纯价格下跌（不依赖pvMarkers） ──
    // 始终执行（不再要求 earlyVolDeclines 为空），确保第一时间能检测到下跌
    {
      const dropFromOpen = openPrice > 0 ? ((openPrice - lastEarlyPrice) / openPrice) * 100 : 0;
      const belowPrevClose = prevClose > 0 && lastEarlyPrice < prevClose;
      // 检查近5分钟是否持续走低（降低门槛：2根下跌即可）
      const recent5 = earlyData.slice(-5);
      let recentDownCount = 0;
      for (let k = 1; k < recent5.length; k++) {
        if (recent5[k].price < recent5[k - 1].price) recentDownCount++;
      }
      const recentDropping = recentDownCount >= 2 && recent5.length >= 2;
      // 检查均价线是否在下移（降低门槛：2根下降即可）
      let avgDeclining = false;
      if (earlyData.length >= 3) {
        const recentAvg = earlyData.slice(-5).map(d => d.avgPrice);
        let avgDownCount = 0;
        for (let k = 1; k < recentAvg.length; k++) {
          if (recentAvg[k] < recentAvg[k - 1]) avgDownCount++;
        }
        avgDeclining = avgDownCount >= 2;
      }

      // 降低触发门槛：0.3%即可触发（原来是0.5%），且不再需要同时满足belowPrevClose
      if (dropFromOpen >= 0.3 && (recentDropping || avgDeclining || belowPrevClose)) {
        // 检查是否已有同类型的标记，避免重复
        const alreadyHasDecline = earlyVolDeclines.some(m => m.type === "slow_decline");
        if (!alreadyHasDecline) {
          earlyVolDeclines.push({
            time: earlyData[earlyData.length - 1].time,
            type: "slow_decline",
            score: -Math.min(50, Math.round(dropFromOpen * 10 + (avgDeclining ? 10 : 0))),
            label: `持续下跌 跌${dropFromOpen.toFixed(1)}%`,
            detail: `早盘从开盘跌${dropFromOpen.toFixed(1)}%，${belowPrevClose ? '低于昨收' : '均价线下行'}`,
            amount: 0,
          });
        }
      }
    }

    if (earlyVolDeclines.length === 0) return null;

    // ── 4. 精确计算量比 ──
    // 用全日数据的前15分钟作为基线，计算早盘量比
    const allData = data;
    const baselineLen = Math.min(15, allData.length);
    const baselineAvgVol = allData.slice(0, baselineLen).reduce((s, d) => s + d.volume, 0) / baselineLen;
    // 早盘下跌时段的均量
    const declineMinutes = earlyData.filter(d => d.price < openPrice);
    const declineAvgVol = declineMinutes.length > 0
      ? declineMinutes.reduce((s, d) => s + d.volume, 0) / declineMinutes.length : baselineAvgVol;
    const volRatio = baselineAvgVol > 0 ? declineAvgVol / baselineAvgVol : 1;

    // ── 5. 下跌速度指数 ──
    // 找到最大连续下跌段，计算速度
    let maxDropPerMin = 0;
    let totalDropMinutes = 0;
    let totalDropAmount = 0;
    for (let i = 1; i < earlyData.length; i++) {
      const prevP = earlyData[i - 1].price;
      const curP = earlyData[i].price;
      if (prevP > 0 && curP < prevP) {
        const dropPct = ((prevP - curP) / prevP) * 100;
        totalDropMinutes++;
        totalDropAmount += dropPct;
        if (dropPct > maxDropPerMin) maxDropPerMin = dropPct;
      }
    }
    // speedIndex: 最大单分钟跌幅 * 10 + 平均每分钟跌幅 * 20
    const avgDropPerMin = totalDropMinutes > 0 ? totalDropAmount / totalDropMinutes : 0;
    const speedIndex = Math.min(100, Math.round(maxDropPerMin * 10 + avgDropPerMin * 20));

    // ── 6. 企稳判断 ──
    // 检查低点后的走势：是否反弹、是否缩量
    let lowIdx = 0;
    let lowP = Infinity;
    for (let i = 0; i < earlyData.length; i++) {
      if (earlyData[i].price < lowP) { lowP = earlyData[i].price; lowIdx = i; }
    }
    const afterLow = earlyData.slice(lowIdx);
    let stabilityIndex = 0;
    if (afterLow.length >= 3) {
      // 反弹幅度
      const reboundRate = lowP > 0 ? ((afterLow[afterLow.length - 1].price - lowP) / lowP) * 100 : 0;
      // 反弹后是否站稳（不创新低）
      const madeNewLow = afterLow.slice(1).some(d => d.price < lowP);
      // 低点后缩量程度
      const afterLowAvgVol = afterLow.reduce((s, d) => s + d.volume, 0) / afterLow.length;
      const beforeLowAvgVol = earlyData.slice(0, Math.max(1, lowIdx)).reduce((s, d) => s + d.volume, 0) / Math.max(1, lowIdx);
      const volShrink = beforeLowAvgVol > 0 ? afterLowAvgVol / beforeLowAvgVol : 1;

      // 企稳指数综合
      if (!madeNewLow) stabilityIndex += 30;
      if (reboundRate >= 1) stabilityIndex += 30;
      else if (reboundRate >= 0.5) stabilityIndex += 20;
      else if (reboundRate >= 0.2) stabilityIndex += 10;
      if (volShrink < 0.6) stabilityIndex += 25;
      else if (volShrink < 0.8) stabilityIndex += 15;
      else if (volShrink < 1) stabilityIndex += 5;
      // 低点后上涨分钟占比
      const upAfterLow = afterLow.filter((d, i) => i > 0 && d.price > afterLow[i - 1].price).length;
      const upRatio = (afterLow.length - 1) > 0 ? upAfterLow / (afterLow.length - 1) : 0;
      if (upRatio >= 0.6) stabilityIndex += 15;
      else if (upRatio >= 0.5) stabilityIndex += 8;

      // ── VWAP回穿检测（关键增强） ──
      // 价格从均线下方回到均线上方 = 最强企稳信号
      // 计算早盘均价线
      let totalAmount = 0, totalVol = 0;
      for (const d of earlyData) {
        totalAmount += d.price * d.volume;
        totalVol += d.volume;
      }
      const earlyVWAP = totalVol > 0 ? totalAmount / totalVol : 0;
      if (earlyVWAP > 0) {
        // 检查最新价格是否回到均线上方
        const lastFewPrices = afterLow.slice(-5);
        const aboveVWAPCount = lastFewPrices.filter(d => d.price > earlyVWAP).length;
        if (aboveVWAPCount >= 3) {
          // 最近5分钟中3+分钟在均线上方 = 强势企稳
          stabilityIndex += 20;
        } else if (aboveVWAPCount >= 2) {
          stabilityIndex += 10;
        }
      }
    }

    // ── 7. 多波下跌检测 ──
    // 找下跌-反弹-再下跌的模式，每波低点更低
    let waveCount = 0;
    {
      const prices = earlyData.map(d => d.price);
      // 用5分钟滑动窗口找局部低点
      const windowSize = 5;
      const localLows: { idx: number; price: number }[] = [];
      for (let i = 0; i <= prices.length - windowSize; i++) {
        const slice = prices.slice(i, i + windowSize);
        const minVal = Math.min(...slice);
        const minIdx = i + slice.indexOf(minVal);
        if (minIdx === i + Math.floor(windowSize / 2)) {
          localLows.push({ idx: minIdx, price: minVal });
        }
      }
      // 去重：相邻的局部低点合并
      const filteredLows: typeof localLows = [];
      for (const low of localLows) {
        if (filteredLows.length === 0 || low.idx - filteredLows[filteredLows.length - 1].idx >= 5) {
          filteredLows.push(low);
        }
      }
      // 计算波数：连续创新低的局部低点序列
      if (filteredLows.length >= 2) {
        for (let i = 1; i < filteredLows.length; i++) {
          if (filteredLows[i].price < filteredLows[i - 1].price * 0.998) {
            waveCount++;
          }
        }
        waveCount = Math.min(waveCount, 4); // 最多4波
      } else {
        waveCount = 1;
      }
    }

    // ── 8. VWAP偏离度 ──
    // 早盘均价
    let vwapDeviation = 0;
    {
      let totalAmount = 0, totalVol = 0;
      for (const d of earlyData) {
        totalAmount += d.price * d.volume;
        totalVol += d.volume;
      }
      const vwap = totalVol > 0 ? totalAmount / totalVol : 0;
      vwapDeviation = vwap > 0 ? ((lastEarlyPrice - vwap) / vwap) * 100 : 0;
    }

    // ── 9. 跳空低开 ──
    const gapDownRate = prevClose > 0 && openPrice > 0
      ? ((prevClose - openPrice) / prevClose) * 100 : 0;

    // ── 10. 综合危险指数 ──
    const dropRate = openPrice > 0 ? ((openPrice - lowPrice) / openPrice) * 100 : 0;
    const absScore = Math.abs(earlyVolDeclines.reduce((best, m) =>
      Math.abs(m.score) > Math.abs(best.score) ? m : best
    , earlyVolDeclines[0]).score);

    // 判断下跌类型组合（影响危险指数权重）
    const hasVolDecline = earlyVolDeclines.some(m => m.type === "volume_decline");
    const hasPulseDecline = earlyVolDeclines.some(m => m.type === "pulse_decline");
    const hasSlowDecline = earlyVolDeclines.some(m => m.type === "slow_decline");
    const hasEarlyVolDrop = earlyVolDeclines.some(m => m.type === "early_vol_drop");
    // 多类型叠加 = 更危险
    const typeCount = [hasVolDecline, hasPulseDecline, hasSlowDecline, hasEarlyVolDrop].filter(Boolean).length;

    let dangerIndex = 0;

    // A. 跌幅 (权重 25%)
    if (dropRate >= 4) dangerIndex += 25;
    else if (dropRate >= 3) dangerIndex += 22;
    else if (dropRate >= 2) dangerIndex += 18;
    else if (dropRate >= 1.5) dangerIndex += 14;
    else if (dropRate >= 1) dangerIndex += 10;
    else if (dropRate >= 0.5) dangerIndex += 5;

    // B. 精确量比 (权重 20%)
    if (volRatio >= 4) dangerIndex += 20;
    else if (volRatio >= 3) dangerIndex += 17;
    else if (volRatio >= 2.5) dangerIndex += 14;
    else if (volRatio >= 2) dangerIndex += 11;
    else if (volRatio >= 1.5) dangerIndex += 7;
    else if (volRatio >= 1.2) dangerIndex += 3;

    // C. 下跌速度 (权重 15%)
    if (speedIndex >= 50) dangerIndex += 15;
    else if (speedIndex >= 30) dangerIndex += 12;
    else if (speedIndex >= 20) dangerIndex += 9;
    else if (speedIndex >= 10) dangerIndex += 5;
    else dangerIndex += 2;

    // D. 信号分数 (权重 8%)
    if (absScore >= 60) dangerIndex += 8;
    else if (absScore >= 40) dangerIndex += 6;
    else if (absScore >= 25) dangerIndex += 5;
    else if (absScore >= 15) dangerIndex += 3;
    else dangerIndex += 1;

    // E. 多波下跌 (权重 8%)
    if (waveCount >= 3) dangerIndex += 8;
    else if (waveCount >= 2) dangerIndex += 6;
    else dangerIndex += 2;

    // F. 跳空低开 (权重 7%)
    if (gapDownRate >= 2) dangerIndex += 7;
    else if (gapDownRate >= 1) dangerIndex += 5;
    else if (gapDownRate >= 0.5) dangerIndex += 3;

    // G. VWAP偏离 (权重 5%) - 偏离越大越危险
    const absVwapDev = Math.abs(vwapDeviation);
    if (absVwapDev >= 2) dangerIndex += 5;
    else if (absVwapDev >= 1.5) dangerIndex += 4;
    else if (absVwapDev >= 1) dangerIndex += 2;
    else dangerIndex += 1;

    // H. 下跌类型叠加加成 (权重 7%) - 多种下跌类型共存更危险
    if (typeCount >= 3) dangerIndex += 7;
    else if (typeCount >= 2) dangerIndex += 4;
    else dangerIndex += 1;

    // I. 阴跌加成 — 阴跌意味着趋势性下跌，比单次脉冲更危险
    if (hasSlowDecline) dangerIndex += 5;

    // J. 企稳折扣 - 已企稳则降低危险指数（最多打4折，比之前更激进）
    const stabilityDiscount = stabilityIndex / 100; // 0~1
    dangerIndex = Math.round(dangerIndex * (1 - stabilityDiscount * 0.6)); // 最多打4折

    dangerIndex = Math.max(0, Math.min(100, dangerIndex));

    // ── 11. 分级判定 + 动态禁买时间 ──
    let tier: "mild" | "medium" | "strong" | "extreme";
    // 动态计算禁买截止时间（基于危险指数）
    // 基础时间9:45(585min)，每10点危险指数增加5分钟
    // 最短9:45(585)，最长10:30(630)
    let banEndTime: number;
    let banEndTimeStr: string;
    let earlyLifted = false;

    if (dangerIndex >= 70) {
      tier = "extreme";
      banEndTime = 630; // 10:30
    } else if (dangerIndex >= 50) {
      tier = "strong";
      // 动态：50→10:10(610), 69→10:25(625)
      banEndTime = 585 + Math.round((dangerIndex - 30) / 70 * 45);
      banEndTime = Math.min(625, Math.max(610, banEndTime));
    } else if (dangerIndex >= 30) {
      tier = "medium";
      // 动态：30→9:55(595), 49→10:05(605)
      banEndTime = 585 + Math.round((dangerIndex - 15) / 55 * 20);
      banEndTime = Math.min(605, Math.max(595, banEndTime));
    } else {
      tier = "mild";
      // 动态：0→9:40(580), 29→9:50(590)
      banEndTime = 580 + Math.round(dangerIndex / 30 * 10);
      banEndTime = Math.min(590, Math.max(580, banEndTime));
    }

    // ── 12. 企稳提前解禁 ──
    // 如果企稳指数很高(>=60)且当前已过下跌低点时刻+10分钟，可以提前解禁
    if (stabilityIndex >= 60 && lowIdx > 0) {
      const lowTime = pvParseTime(earlyData[lowIdx].time);
      const potentialLiftTime = lowTime + 10; // 低点后10分钟
      // 只在企稳显著时提前，且不能早于基础禁买时间的50%
      const minBanTime = 570 + Math.round((banEndTime - 570) * 0.5);
      const adjustedBanEnd = Math.max(minBanTime, potentialLiftTime);
      if (adjustedBanEnd < banEndTime) {
        banEndTime = adjustedBanEnd;
        earlyLifted = true;
      }
    }

    // 对齐到5分钟整数（方便显示）
    banEndTime = Math.round(banEndTime / 5) * 5;
    banEndTime = Math.min(630, Math.max(580, banEndTime));
    const banH = Math.floor(banEndTime / 60);
    const banM = banEndTime % 60;
    banEndTimeStr = `${banH.toString().padStart(2, '0')}:${banM.toString().padStart(2, '0')}`;

    return {
      tier, banEndTime, banEndTimeStr, declineScore: absScore, dropRate,
      volRatio, speedIndex, stabilityIndex, waveCount, vwapDeviation,
      gapDownRate, dangerIndex, earlyLifted,
    };
    }); // banCache.compute
  }, [pvMarkers, data, prevClose]);

  // ── Memoize position rule computation (was inline IIFE) ──
  const positionRule = useMemo(() => {
    const stockPct = lastItem.changePercent;
    const sectorDown = sectorRegime?.regime === '下跌趋势' || sectorRegime?.regime === '横盘末期';
    const stockDown = stockPct < 0;
    const sectorUp = sectorRegime?.regime === '上升通道';
    const stockUp = stockPct >= 0;
    const hasSectorInfo = !!sectorRegime;
    const mktDown = szIndexRegime?.regime === '下跌趋势' || szIndexRegime?.regime === '横盘末期';
    const mktUp = szIndexRegime?.regime === '上升通道';
    const hasMktInfo = !!szIndexRegime;

    let posLabel = '';
    let posColor = '';
    let posBg = '';
    let tDir = '';

    if (hasMktInfo && mktDown && hasSectorInfo && sectorDown && stockDown) {
      posLabel = '1/4仓'; tDir = '反T'; posColor = 'text-green-600 dark:text-green-400'; posBg = 'bg-green-500/15 border-green-500/35';
    } else if (hasMktInfo && mktDown && hasSectorInfo && sectorDown && stockUp) {
      posLabel = '1/3仓'; tDir = '反T'; posColor = 'text-red-600 dark:text-red-400'; posBg = 'bg-red-500/15 border-red-500/30';
    } else if (hasMktInfo && mktDown && hasSectorInfo && sectorUp && stockDown) {
      posLabel = '20%仓'; tDir = '正T'; posColor = 'text-amber-600 dark:text-amber-400'; posBg = 'bg-amber-500/15 border-amber-500/30';
    } else if (hasMktInfo && mktDown && hasSectorInfo && sectorUp && stockUp) {
      posLabel = '25%仓'; tDir = '反T'; posColor = 'text-yellow-600 dark:text-yellow-400'; posBg = 'bg-yellow-500/15 border-yellow-500/30';
    } else if (hasMktInfo && mktUp && hasSectorInfo && sectorDown && stockDown) {
      posLabel = '1/3仓'; tDir = '正T'; posColor = 'text-orange-600 dark:text-orange-400'; posBg = 'bg-orange-500/15 border-orange-500/30';
    } else if (hasMktInfo && mktUp && hasSectorInfo && sectorDown && stockUp) {
      posLabel = '30%仓'; tDir = '反T'; posColor = 'text-yellow-600 dark:text-yellow-400'; posBg = 'bg-yellow-500/15 border-yellow-500/30';
    } else if (hasMktInfo && mktUp && hasSectorInfo && sectorUp && stockDown) {
      posLabel = '30%仓'; tDir = '正T'; posColor = 'text-blue-600 dark:text-blue-400'; posBg = 'bg-blue-500/15 border-blue-500/30';
    } else if (hasMktInfo && mktUp && hasSectorInfo && sectorUp && stockUp) {
      posLabel = '满仓'; tDir = '正反T'; posColor = 'text-red-600 dark:text-red-400'; posBg = 'bg-red-500/15 border-red-500/30';
    } else if (!hasMktInfo && hasSectorInfo && sectorDown && stockDown) {
      posLabel = '1/3仓'; tDir = '反T'; posColor = 'text-green-600 dark:text-green-400'; posBg = 'bg-green-500/15 border-green-500/30';
    } else if (!hasMktInfo && hasSectorInfo && sectorDown && stockUp) {
      posLabel = '25%仓'; tDir = '反T'; posColor = 'text-amber-600 dark:text-amber-400'; posBg = 'bg-amber-500/15 border-amber-500/30';
    } else if (!hasMktInfo && hasSectorInfo && sectorUp && stockUp) {
      posLabel = '75%仓'; tDir = '正T'; posColor = 'text-red-600 dark:text-red-400'; posBg = 'bg-red-500/15 border-red-500/30';
    } else if (!hasMktInfo && hasSectorInfo && sectorUp && stockDown) {
      posLabel = '25%仓'; tDir = '正T'; posColor = 'text-yellow-600 dark:text-yellow-400'; posBg = 'bg-yellow-500/15 border-yellow-500/30';
    } else if (!hasSectorInfo && stockDown) {
      posLabel = '轻仓'; tDir = '观望'; posColor = 'text-amber-600 dark:text-amber-400'; posBg = 'bg-amber-500/10 border-amber-500/25';
    } else if (!hasSectorInfo && stockUp) {
      posLabel = '可参与'; tDir = '正T'; posColor = 'text-red-600 dark:text-red-400'; posBg = 'bg-red-500/10 border-red-500/25';
    } else {
      posLabel = '轻仓'; tDir = '观望'; posColor = 'text-gray-500 dark:text-gray-400'; posBg = 'bg-gray-500/10 border-gray-500/25';
    }

    const mktDir = hasMktInfo ? (mktDown ? '↓' : mktUp ? '↑' : '—') : '…';
    const secDir = hasSectorInfo ? (sectorDown ? '↓' : sectorUp ? '↑' : '—') : '…';
    const stkDir = stockDown ? '↓' : '↑';

    return { posLabel, posColor, posBg, tDir, mktDir, secDir, stkDir, hasMktInfo, mktDown, mktUp, hasSectorInfo, sectorDown, sectorUp, stockDown, stockUp };
  }, [lastItem, sectorRegime, szIndexRegime]);

  // ── Memoize position banner (was inline IIFE) ──
  const positionBanner = useMemo(() => {
    const { hasMktInfo, mktDown, mktUp, hasSectorInfo, sectorDown, sectorUp, stockDown, stockUp } = positionRule;
    const isTripleDown = hasMktInfo && mktDown && hasSectorInfo && sectorDown && stockDown;
    const isTripleUp = hasMktInfo && mktUp && hasSectorInfo && sectorUp && stockUp;
    const isDualDown = (hasMktInfo ? mktDown : true) && hasSectorInfo && sectorDown && stockDown;

    if (isTripleDown) {
      return { type: '3down' as const };
    }
    if (isTripleUp) {
      return { type: '3up' as const };
    }
    if (isDualDown && !isTripleDown) {
      return { type: '2down' as const, hasMktInfo };
    }
    if (hasMktInfo && mktDown && hasSectorInfo && sectorUp && stockUp) {
      return { type: 'mkt_down_sector_stock_up' as const };
    }
    if (hasMktInfo && mktUp && hasSectorInfo && sectorDown && stockDown) {
      return { type: 'mkt_up_sector_stock_down' as const };
    }
    if (hasMktInfo && mktUp && hasSectorInfo && sectorUp && stockDown) {
      return { type: 'mkt_up_sector_up_stock_down' as const };
    }
    if (hasSectorInfo && sectorDown && stockUp) {
      return { type: 'sector_down_stock_up' as const };
    }
    if (hasSectorInfo && sectorUp && stockDown) {
      return { type: 'sector_up_stock_down' as const, hasMktInfo, mktUp };
    }
    if (!hasSectorInfo && hasMktInfo && mktDown && stockDown) {
      return { type: 'no_sector_mkt_stock_down' as const };
    }
    if (!hasSectorInfo && stockDown) {
      return { type: 'no_sector_stock_down' as const };
    }
    return null;
  }, [positionRule]);

  // ── Memoize time window (was inline IIFE) ──
  const timeWindowDisplay = useMemo(() => {
    const lastTime = data[data.length - 1]?.time;
    if (!lastTime) return null;
    const tw = getTimeWindow(lastTime);
    const twColor = tw === "开盘观察" || tw === "尾盘不操作" ? "text-muted-foreground" :
                    tw.includes("卖出") ? "text-green-500" : "text-red-500";
    return { text: tw, color: twColor };
  }, [data]);

  // ── Memoize ban mask index (computed once, used 6 times across 3 panels) ──
  const banMaskIdx = useMemo(() => {
    if (!earlyVolDeclineBan) return -1;
    return zoomData.findIndex(d => d.time === earlyVolDeclineBan.banEndTimeStr);
  }, [earlyVolDeclineBan, zoomData]);

  // ── Memoize tooltip components (stable references to avoid re-renders) ──
  const timelineTooltipEl = useMemo(() => <TimelineTooltip />, []);
  const volumeTooltipEl = useMemo(() => <TimelineVolumeTooltip />, []);
  const macdTooltipEl = useMemo(() => <TimelineMACDTooltip />, []);
  const tooltipWrapperStyle = useMemo(() => ({ background: 'transparent' as const, border: 'none' as const }), []);

  if (data.length === 0) return null;

  return (
    <div
      ref={chartContainerRef}
      className="bg-card rounded-lg border border-border overflow-hidden"
    >
      {/* Header - 同花顺 style info bar */}
      <div className="px-3 py-2 border-b border-border/50 flex items-center gap-3 text-xs flex-wrap">
        <span className="font-medium text-sm text-foreground">{symbol}</span>
        <span className={`font-bold tabular-nums ${lastItem.changePercent >= 0 ? "text-red-500" : "text-green-500"}`}>
          {formatPrice(lastItem.price)}
        </span>
        <span className={`tabular-nums ${lastItem.changePercent >= 0 ? "text-red-500" : "text-green-500"}`}>
          {lastItem.changePercent >= 0 ? "+" : ""}{(lastItem.changePercent ?? 0).toFixed(2)}%
        </span>
        {/* Position Rule Badge - 5-tier ladder + T-direction hint */}
        {(() => {
          const { posLabel, posColor, posBg, tDir, mktDir, secDir, stkDir } = positionRule;
          return (
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold ${posBg} ${posColor}`}
              title={`仓位阶梯：深证${mktDir} 板块${secDir} 个股${stkDir} → ${posLabel} | 策略：${tDir}`}
            >
              <span>{posLabel}</span>
              <span className="text-[9px] opacity-70 font-medium">|</span>
              <span className={`text-[9px] font-bold ${tDir === '反T' ? 'text-red-400' : tDir === '正T' ? 'text-green-400' : tDir === '正反T' ? 'text-blue-400' : 'text-gray-400'}`}>{tDir === '反T' ? '反T(先卖再买)' : tDir === '正反T' ? '正T/反T(先卖再买)' : tDir}</span>
            </span>
          );
        })()}
        <div className="h-3 w-px bg-border" />
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 bg-blue-500 rounded" />
          <span className="text-muted-foreground">价格</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-[1.5px] bg-yellow-400 rounded" style={{ borderBottom: "1.5px dashed #ca8a04" }} />
          <span className="text-muted-foreground">均价</span>
        </span>
        {prevDayMA5 != null && (
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-[2px] bg-yellow-500 rounded" style={{ borderBottom: "2px dashed #eab308", opacity: 0.9 }} />
            <span className="text-[10px] text-yellow-500 font-medium">MA5</span>
          </span>
        )}

        <span className="flex items-center gap-1">
          <span className="inline-block w-0 h-0 border-l-[3px] border-r-[3px] border-b-[5px] border-l-transparent border-r-transparent border-b-red-500" />
          <span className="text-[9px] text-red-500">强</span>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-500" />
          <span className="text-[9px] text-orange-500">中</span>
          <span className="inline-block w-1 h-1 rounded-full bg-gray-400" />
          <span className="text-[9px] text-gray-400">弱</span>
        </span>
        {/* Support/Resistance legend */}
        {keyPriceLevels && keyPriceLevels.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="flex items-center gap-0.5">
              <span className="inline-block w-4 h-0 border-t-[2px] border-dashed border-green-600" />
              <span className="text-[10px] text-green-600 font-medium">支撑</span>
            </span>
            <span className="flex items-center gap-0.5">
              <span className="inline-block w-4 h-0 border-t-[2px] border-dashed border-red-600" />
              <span className="text-[10px] text-red-600 font-medium">压力</span>
            </span>
          </span>
        )}
        {/* Intraday Intent Badge */}
        {intradayIntent && intradayIntent.overall.intent !== "观察" && intradayIntent.overall.intent !== "震荡" && (() => {
          const { overall, segments } = intradayIntent;
          const isAccOrMarkup = overall.intent === "吸筹" || overall.intent === "拉升";
          const isDist = overall.intent === "出货";
          const badgeBg = isAccOrMarkup
            ? "bg-red-500/10 border-red-500/30"
            : isDist
              ? "bg-green-500/10 border-green-500/30"
              : "bg-yellow-500/10 border-yellow-500/30";
          const badgeText = isAccOrMarkup
            ? "text-red-600 dark:text-red-400"
            : isDist
              ? "text-green-600 dark:text-green-400"
              : "text-yellow-600 dark:text-yellow-400";
          return (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${badgeBg} ${badgeText}`}>
              <span>{overall.icon}</span>
              <span>主力:{overall.intent}</span>
              <span className="opacity-60">{overall.confidence}%</span>
              {segments.length > 0 && (
                <span className="text-[8px] opacity-50">
                  ({segments.map(s => s.intent === "观察" ? "" : `${s.label}${s.intent}`).filter(Boolean).join("→")})
                </span>
              )}
            </span>
          );
        })()}
        {buySignals > 0 && (
          <span className="flex items-center gap-1 text-red-500">
            ▲ 买{buySignals}
          </span>
        )}
        {/* 早盘放量下跌禁买警告 */}
        {earlyVolDeclineBan && (() => {
          const ban = earlyVolDeclineBan;
          const now = new Date();
          const curMins = now.getHours() * 60 + now.getMinutes();
          if (curMins >= ban.banEndTime) return null;
          const tierLabel = { mild: "轻微", medium: "中等", strong: "强烈", extreme: "极端" }[ban.tier];
          return (
            <span className="flex items-center gap-1 text-red-500 font-bold animate-pulse" title={`危险指数:${ban.dangerIndex} 跌幅:${ban.dropRate.toFixed(1)}% 量比:${ban.volRatio.toFixed(1)}x 速度:${ban.speedIndex} 企稳:${ban.stabilityIndex} 波数:${ban.waveCount}${ban.earlyLifted ? ' (提前解禁)' : ''}`}>
              🚫 {ban.banEndTimeStr}前禁买({tierLabel}) 危险{ban.dangerIndex}
            </span>
          );
        })()}
        {sellSignals > 0 && (
          <span className="flex items-center gap-1 text-green-500">
            ▼ 卖{sellSignals}
          </span>
        )}
        {stoplossSignals > 0 && (
          <span className="flex items-center gap-1 text-yellow-500">
            ◆ 止损{stoplossSignals}
          </span>
        )}
        {/* Market Regime Badge - prominent + T-mode recommendation */}
        {(() => {
          const detail = regimeDetail;
          const cfg = REGIME_CONFIG[detail.regime] || REGIME_CONFIG["震荡市"];

          // T-mode recommendation based on regime
          const tCfg = T_MODE_CONFIG[detail.regime] || T_MODE_CONFIG["震荡市"];

          return (
            <>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}
                title={detail.description}
              >
                {stockName && <span className="opacity-80">{stockName}</span>}
                <span>{cfg.icon}</span>
                <span>{detail.regime}</span>
                <span className="opacity-60">{detail.confidence}%</span>
              </span>
              <span
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[9px] font-semibold ${tCfg.bg} ${tCfg.text}`}
                title={tCfg.tip}
              >
                <span>▸</span>
                <span>{tCfg.label}</span>
              </span>
            </>
          );
        })()}
        {/* Sector Regime Badge - shows industry sector trend */}
        {sectorInfo && (() => {
          const shortName = sectorInfo.name.length > 4 ? sectorInfo.name.slice(0, 4) : sectorInfo.name;
          if (sectorRegime) {
            const cfg = REGIME_CONFIG[sectorRegime.regime] || REGIME_CONFIG["震荡市"];
            return (
              <span
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[9px] font-semibold ${cfg.bg} ${cfg.text}`}
                title={`${sectorInfo.name}板块: ${sectorRegime.description}\n板块走势与个股信号方向一致时增强，反向时降级`}
              >
                <span className="opacity-80">{shortName}</span>
                <span>{cfg.icon}</span>
                <span>{sectorRegime.regime}</span>
                <span className="opacity-60">{sectorRegime.confidence}%</span>
              </span>
            );
          }
          // Show sector name even without regime data (e.g., before timeline loads)
          return (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[9px] font-semibold bg-emerald-600/10 border-emerald-600/20 text-emerald-700 dark:text-emerald-300"
              title={`${sectorInfo.name}板块: 数据加载中...`}
            >
              <span className="opacity-80">{shortName}</span>
              <span className="opacity-60">加载中</span>
            </span>
          );
        })()}
        {/* Sector retry button - shown when sectorInfo is missing for A-share stocks */}
        {!sectorInfo && onRetrySector && (
          <button
            onClick={onRetrySector}
            disabled={sectorLoading}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[9px] font-semibold bg-muted/50 border-muted-foreground/20 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="板块数据未加载，点击重新请求"
          >
            {sectorLoading ? (
              <>
                <span className="inline-block w-2.5 h-2.5 border-[1.5px] border-current border-t-transparent rounded-full animate-spin" />
                <span>加载中</span>
              </>
            ) : (
              <>
                <RotateCcw className="w-2.5 h-2.5" />
                <span>板块</span>
              </>
            )}
          </button>
        )}
        {/* Index retry button - shown when index timeline data is empty */}
        {(!indexTimelineData?.[activeIndexKey || "sz"]?.items?.length) && onRetryIndex && (
          <button
            onClick={onRetryIndex}
            disabled={indexLoading}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[9px] font-semibold bg-blue-500/10 border-blue-500/20 text-blue-500 hover:bg-blue-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="指数分时数据未加载，点击重新请求"
          >
            {indexLoading ? (
              <>
                <span className="inline-block w-2.5 h-2.5 border-[1.5px] border-current border-t-transparent rounded-full animate-spin" />
                <span>加载中</span>
              </>
            ) : (
              <>
                <RotateCcw className="w-2.5 h-2.5" />
                <span>指数</span>
              </>
            )}
          </button>
        )}
        {/* Market Index Regime Badge - click to cycle 深/沪/创 */}
        {szIndexRegime && (() => {
          const cfg = REGIME_CONFIG[szIndexRegime.regime] || REGIME_CONFIG["震荡市"];
          const idxInfo = indexConfig?.[activeIndexKey || "sz"];
          const shortLabel = idxInfo?.shortLabel || "深";
          const fullLabel = idxInfo?.label || "深证成指(骗人指数)";
          return (
            <span
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[9px] font-semibold cursor-pointer select-none hover:opacity-80 active:scale-95 transition-all ${cfg.bg} ${cfg.text}`}
              title={`${fullLabel}: ${szIndexRegime.description}\n点击切换指数`}
              onClick={onCycleIndex}
            >
              <span className="opacity-80">{shortLabel}</span>
              <span>{cfg.icon}</span>
              <span>{szIndexRegime.regime}</span>
              <span className="opacity-60">{szIndexRegime.confidence}%</span>
            </span>
          );
        })()}
        {lastSignal && (
          <Badge variant={lastSignal.type === "buy" ? "default" : lastSignal.type === "stoploss" ? "outline" : "destructive"} className="text-[10px] h-5">
            {lastSignal.type === "buy" ? "买入" : lastSignal.type === "stoploss" ? "止损" : "卖出"} · {lastSignal.reason}
          </Badge>
        )}
        {/* Time Window Indicator */}
        {timeWindowDisplay && (
          <span className={`text-[10px] ${timeWindowDisplay.color}`}>
            {timeWindowDisplay.text}
          </span>
        )}
        {/* Crosshair data display */}
        {crosshairItem?.hasData && (() => {
          const pct = crosshairItem.changePercent;
          const isUp = pct >= 0;
          return (
            <span className="flex items-center gap-2 text-[10px] tabular-nums">
              <span className="text-muted-foreground">{crosshairItem.time}</span>
              <span className={isUp ? "text-red-600" : "text-green-600"}>{formatPrice(crosshairItem.price)}</span>
              <span className={isUp ? "text-red-600" : "text-green-600"}>{isUp ? "+" : ""}{pct?.toFixed(2)}%</span>
              {crosshairItem.volume > 0 && (
                <>
                  <span className="text-muted-foreground">Vol {formatVolume(crosshairItem.volume)}</span>
                  <span className="text-yellow-500">Amt {formatAmount(crosshairItem.volume * 100 * (crosshairItem.price ?? 0))}</span>
                </>
              )}
              {crosshairItem.dif != null && (
                <span className="text-blue-600">DIF {(crosshairItem.dif ?? 0).toFixed(3)}</span>
              )}
              {crosshairItem.dea != null && (
                <span className="text-orange-600">DEA {(crosshairItem.dea ?? 0).toFixed(3)}</span>
              )}
              {crosshairItem.macd != null && (
                <span className={crosshairItem.macd >= 0 ? "text-red-600" : "text-green-600"}>MACD {(crosshairItem.macd ?? 0).toFixed(3)}</span>
              )}
            </span>
          );
        })()}
        {/* Zoom Controls - timeline panel */}
        <div className="ml-auto flex items-center gap-1">
          {isZoomed && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => {
                const maxOffset = Math.max(0, lastDataIdx - visibleMinutes + 1);
                const step = Math.max(1, Math.round(visibleMinutes * 0.3));
                onPanOffsetChange?.(Math.min((panOffset || 0) + step, maxOffset));
              }}
              disabled={(panOffset || 0) >= Math.max(0, lastDataIdx - visibleMinutes + 1)}
              title="向左平移（查看更早数据）"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={onZoomIn}
            disabled={zoomIdx >= maxZoomIdx}
            title="放大（减少时间范围）"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <span className="text-[10px] text-muted-foreground tabular-nums min-w-[40px] text-center">
            {isZoomed ? `${visibleMinutes}分` : "全天"}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={onZoomOut}
            disabled={zoomIdx <= 0}
            title="缩小（增加时间范围）"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          {isZoomed && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => {
                const step = Math.max(1, Math.round(visibleMinutes * 0.3));
                onPanOffsetChange?.(Math.max(0, (panOffset || 0) - step));
              }}
              disabled={(panOffset || 0) <= 0}
              title="向右平移（查看最新数据）"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          )}
          {isZoomed && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground"
              onClick={onZoomReset}
              title="重置为全天视图"
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* ─── Early Volume Decline Ban Banner (智能动态分级 v2) ─── */}
      {earlyVolDeclineBan && (() => {
        const ban = earlyVolDeclineBan;
        const now = new Date();
        const curMins = now.getHours() * 60 + now.getMinutes();
        const isStillBeforeBan = curMins < ban.banEndTime;
        const tierLabel = { mild: "轻微", medium: "中等", strong: "强烈", extreme: "极端" }[ban.tier];
        const tierDesc = {
          mild: "早盘小幅放量回调",
          medium: "早盘放量下跌",
          strong: "早盘强势放量下跌",
          extreme: "早盘恐慌性暴跌",
        }[ban.tier];
        const tierBg = {
          mild: "bg-amber-500/12 border-amber-500/25",
          medium: "bg-red-500/12 border-red-500/25",
          strong: "bg-red-600/15 border-red-600/30",
          extreme: "bg-red-700/20 border-red-700/35",
        }[ban.tier];
        const tierText = {
          mild: "text-amber-700 dark:text-amber-400",
          medium: "text-red-600 dark:text-red-400",
          strong: "text-red-700 dark:text-red-300",
          extreme: "text-red-800 dark:text-red-200",
        }[ban.tier];
        const tierSubText = {
          mild: "text-amber-600 dark:text-amber-400",
          medium: "text-red-500",
          strong: "text-red-600 dark:text-red-300",
          extreme: "text-red-700 dark:text-red-200",
        }[ban.tier];
        return (
          <div className={`px-3 py-1.5 ${tierBg} border-b flex items-center justify-center gap-2 flex-wrap`}>
            <span className="text-red-500 text-xs">🚫</span>
            <span className={`text-xs font-bold ${tierText}`}>
              {tierDesc}，{ban.banEndTimeStr}前禁止买入！
            </span>
            <span className={`text-[10px] font-bold ${tierSubText}`}>
              | 危险{ban.dangerIndex} · 跌{ban.dropRate.toFixed(1)}% · 量比{ban.volRatio.toFixed(1)}x · 速度{ban.speedIndex} · {ban.waveCount}波 · {tierLabel}
            </span>
            {ban.earlyLifted && <span className="text-[10px] text-green-400 font-bold">✅ 企稳提前解禁</span>}
            {isStillBeforeBan && !ban.earlyLifted && <span className="text-[10px] text-red-400 animate-pulse">⏳ 当前仍在禁买期</span>}
          </div>
        );
      })()}

      {/* ─── Position Rule Banner on Chart (5-tier + T-direction) ─── */}
      {positionBanner?.type === '3down' && (
        <div className="px-3 py-1.5 bg-green-500/10 border-b border-green-500/20 flex items-center justify-center gap-2">
          <span className="text-red-500 text-xs">🚫</span>
          <span className="text-xs font-bold text-green-600 dark:text-green-400">
            三跌！深证↓+板块↓+个股↓ ≤ 1/4仓
          </span>
          <span className="text-[10px] text-green-500 font-bold">| 反T(先卖再买)/空仓</span>
          <span className="text-[10px] text-green-500/70">极度危险，保留3/4后备</span>
        </div>
      )}
      {positionBanner?.type === '3up' && (
        <div className="px-3 py-1.5 bg-red-500/10 border-b border-red-500/20 flex items-center justify-center gap-2">
          <span className="text-red-500 text-xs">✅</span>
          <span className="text-xs font-bold text-red-600 dark:text-red-400">
            三涨！深证↑+板块↑+个股↑ 90-100%仓
          </span>
          <span className="text-[10px] text-red-400 font-bold">| 正T/反T(先卖再买)均可</span>
          <span className="text-[10px] text-red-500/70">最安全，积极做T</span>
        </div>
      )}
      {positionBanner?.type === '2down' && (
        <div className="px-3 py-1.5 bg-green-500/10 border-b border-green-500/20 flex items-center justify-center gap-2">
          <span className="text-green-500 text-xs">⛔</span>
          <span className="text-xs font-bold text-green-600 dark:text-green-400">
            {positionBanner.hasMktInfo ? '深证↓+' : ''}板块↓+个股↓ = 双跌！≤ 1/3仓
          </span>
          <span className="text-[10px] text-orange-400 font-bold">| 反T(先卖再买)冲高卖</span>
          <span className="text-[10px] text-green-500/70">保留2/3后备资金</span>
        </div>
      )}
      {positionBanner?.type === 'mkt_down_sector_stock_up' && (
        <div className="px-3 py-1.5 bg-yellow-500/10 border-b border-yellow-500/20 flex items-center justify-center gap-2">
          <span className="text-yellow-500 text-xs">🔸</span>
          <span className="text-xs font-bold text-yellow-600 dark:text-yellow-400">
            深证↓ 但板块↑+个股↑ 20-30%仓
          </span>
          <span className="text-[10px] text-red-400 font-bold">| 反T(先卖再买)冲高卖</span>
          <span className="text-[10px] text-yellow-500/70">大盘压制，适度参与</span>
        </div>
      )}
      {positionBanner?.type === 'mkt_up_sector_stock_down' && (
        <div className="px-3 py-1.5 bg-orange-500/8 border-b border-orange-500/15 flex items-center justify-center gap-2">
          <span className="text-orange-500 text-xs">⚠️</span>
          <span className="text-xs font-bold text-orange-600 dark:text-orange-400">
            深证↑ 但板块↓+个股↓ ≤ 1/3仓
          </span>
          <span className="text-[10px] text-green-400 font-bold">| 正T低吸</span>
          <span className="text-[10px] text-orange-500/70">大盘支撑但板块弱势</span>
        </div>
      )}
      {positionBanner?.type === 'mkt_up_sector_up_stock_down' && (
        <div className="px-3 py-1.5 bg-blue-500/8 border-b border-blue-500/15 flex items-center justify-center gap-2">
          <span className="text-blue-500 text-xs">🔹</span>
          <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
            深证↑+板块↑+个股↓ 25-30%仓
          </span>
          <span className="text-[10px] text-green-400 font-bold">| 正T低吸良机</span>
          <span className="text-[10px] text-blue-500/70">大盘+板块支撑</span>
        </div>
      )}
      {positionBanner?.type === 'sector_down_stock_up' && (
        <div className="px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-center gap-2">
          <span className="text-amber-500 text-xs">⚠️</span>
          <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
            板块↓+个股↑ 20-30%仓
          </span>
          <span className="text-[10px] text-red-400 font-bold">| 反T(先卖再买)冲高卖</span>
          <span className="text-[10px] text-amber-500/70">逆板块走强需谨慎</span>
        </div>
      )}
      {positionBanner?.type === 'sector_up_stock_down' && (
        <div className="px-3 py-1.5 bg-yellow-500/10 border-b border-yellow-500/20 flex items-center justify-center gap-2">
          <span className="text-yellow-500 text-xs">🔻</span>
          <span className="text-xs font-bold text-yellow-600 dark:text-yellow-400">
            板块↑+个股↓ {positionBanner.hasMktInfo && positionBanner.mktUp ? '25-30%' : '20-30%'}仓
          </span>
          <span className="text-[10px] text-green-400 font-bold">| 正T低吸</span>
          <span className="text-[10px] text-yellow-500/70">回调可低吸</span>
        </div>
      )}
      {positionBanner?.type === 'no_sector_mkt_stock_down' && (
        <div className="px-3 py-1.5 bg-green-500/5 border-b border-green-500/10 flex items-center justify-center gap-2">
          <span className="text-green-500 text-xs">🔻</span>
          <span className="text-xs font-medium text-green-600/80 dark:text-green-400/80">
            深证↓+个股↓，大盘弱势注意控仓
          </span>
          <span className="text-[10px] text-green-400 font-bold">| 反T(先卖再买)</span>
          {onRetrySector && <button onClick={onRetrySector} disabled={sectorLoading} className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[9px] font-semibold bg-green-500/10 border-green-500/20 text-green-500 hover:bg-green-500/20 transition-colors disabled:opacity-50" title="板块数据未加载，点击重新请求">{sectorLoading ? <span className="inline-block w-2.5 h-2.5 border-[1.5px] border-current border-t-transparent rounded-full animate-spin" /> : <RotateCcw className="w-2.5 h-2.5" />}<span>加载板块</span></button>}
        </div>
      )}
      {positionBanner?.type === 'no_sector_stock_down' && (
        <div className="px-3 py-1.5 bg-amber-500/5 border-b border-amber-500/10 flex items-center justify-center gap-2">
          <span className="text-amber-500 text-xs">🔻</span>
          <span className="text-xs font-medium text-amber-600/80 dark:text-amber-400/80">
            个股下跌，注意控制仓位
          </span>
          {onRetrySector && <button onClick={onRetrySector} disabled={sectorLoading} className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[9px] font-semibold bg-amber-500/10 border-amber-500/20 text-amber-500 hover:bg-amber-500/20 transition-colors disabled:opacity-50" title="板块数据未加载，点击重新请求">{sectorLoading ? <span className="inline-block w-2.5 h-2.5 border-[1.5px] border-current border-t-transparent rounded-full animate-spin" /> : <RotateCcw className="w-2.5 h-2.5" />}<span>加载板块</span></button>}
        </div>
      )}

      {/* ─── Panel 1: Price Chart ─── */}
      <div className="relative overflow-visible">
        <ResponsiveContainer width="100%" height={isZoomed ? 620 : 530}>
          <ComposedChart
            data={zoomData}
            margin={{ top: 36, right: 82, left: 2, bottom: 0 }}
            onMouseMove={handleChartMouseMove}
            onMouseLeave={handleChartMouseLeave}
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
              domain={xDomain}
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={{ stroke: "hsl(var(--border))", strokeWidth: 0.5 }}
              interval={0}
              ticks={zoomTimeTicks}
              tickFormatter={(idx: number) => {
                const item = zoomData[idx];
                return item?.time || "";
              }}
            />
            <YAxis
              yAxisId="price"
              domain={[yMin, yMax]}
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              width={55}
              tickFormatter={(v: number) => formatPrice(v)}
            />
            <YAxis
              yAxisId="percent"
              orientation="right"
              domain={[percentMin, percentMax]}
              tick={false}
              tickLine={false}
              axisLine={false}
              width={1}
            />
            <Tooltip content={timelineTooltipEl} cursor={false} wrapperStyle={tooltipWrapperStyle} />
            {/* Percent labels on right edge of plot area - aligned with MA5 / reference line labels */}
            <Customized component={(props: any) => {
              const yAxisMap = props.yAxisMap;
              if (!yAxisMap) return null;
              const yAxis = yAxisMap.price;
              if (!yAxis || !yAxis.scale) return null;
              const yScale = yAxis.scale;
              // Use offset to get exact plot area dimensions for label positioning
              // This ensures percentage labels align with ReferenceLine labels (MA5, etc.)
              const offset = props.offset;
              if (!offset) return null;
              // Position labels at the right edge of plot area + small padding
              // recharts ReferenceLine with position="right" places labels at ~plotAreaRight + 5
              const labelX = offset.left + offset.width + 5;
              // Generate percent labels at evenly spaced Y positions
              const priceTicks: number[] = [];
              const tickStep = (yMax - yMin) / 5;
              for (let i = 0; i <= 5; i++) {
                priceTicks.push(yMin + tickStep * i);
              }
              return (
                <g>
                  {priceTicks.map((price, i) => {
                    const yPx = yScale(price);
                    const pct = ((price - safePrevClose) / safePrevClose) * 100;
                    const isZero = Math.abs(pct) < 0.01;
                    const fill = isZero ? "#6b7280" : pct > 0 ? "#dc2626" : "#16a34a";
                    const text = isZero ? "" : pct > 0 ? `+${pct.toFixed(2)}%` : `${pct.toFixed(2)}%`;
                    if (!text) return null;
                    return (
                      <text
                        key={`pct-${i}`}
                        x={labelX}
                        y={yPx}
                        textAnchor="start"
                        dominantBaseline="middle"
                        fill={fill}
                        fontSize={9}
                        fontWeight="600"
                        opacity={0.8}
                      >
                        {text}
                      </text>
                    );
                  })}
                </g>
              );
            }} />
            <ReferenceLine
              yAxisId="price"
              y={safePrevClose}
              stroke="#6b7280"
              strokeWidth={1.2}
              strokeOpacity={0.8}
              label={{
                value: "0%",
                position: "right" as const,
                fill: "#6b7280",
                fontSize: 11,
                fontWeight: 700,
              }}
            />
            {/* Today's MA lines as dashed references */}
            {prevDayMA5 != null && prevDayMA5 >= yMin && prevDayMA5 <= yMax && (
              <ReferenceLine
                yAxisId="price"
                y={prevDayMA5}
                stroke="#eab308"
                strokeDasharray="8 4"
                strokeWidth={1.2}
                strokeOpacity={0.9}
                label={{ value: `MA5 ${formatPrice(prevDayMA5)}`, position: "right", fill: "#eab308", fontSize: 10, fillOpacity: 1 }}
              />
            )}

            {/* Support & Resistance Levels as dashed lines */}
            {keyPriceLevels?.filter(l => l.price >= yMin && l.price <= yMax).map((level, li) => {
              // Support = green tones, Resistance = red/orange tones
              // Skip 昨收价 (already drawn as the main reference line above)
              if (level.name === "昨收价") return null;
              // Skip 涨停/跌停 (usually far out of visible range, too distracting)
              if (level.name.startsWith("涨停") || level.name.startsWith("跌停")) return null;
              // Skip 整数关口 (user requested to hide)
              if (level.name.includes("整数关")) return null;
              // Skip Fibonacci回撤位 (user requested to hide)
              if (level.name.startsWith("Fib")) return null;
              // Skip 日内高/低 (replaced by dedicated highest/lowest markers with percentage)
              if (level.name.startsWith("日内高") || level.name.startsWith("日内低")) return null;
              const isSupport = level.type === "support";
              const lineColor = isSupport ? "#16a34a" : "#dc2626";  // green-600 / red-600 (stronger)
              return (
                <ReferenceLine
                  key={`keylevel-${li}`}
                  yAxisId="price"
                  y={level.price}
                  stroke={lineColor}
                  strokeDasharray="6 4"
                  strokeWidth={1.4}
                  strokeOpacity={0.85}
                  label={{
                    value: `${isSupport ? "▲" : "▼"}${level.name}`,
                    position: "right" as const,
                    fill: lineColor,
                    fontSize: 8,
                    fillOpacity: 0.9,
                  }}
                />
              );
            })}
            {/* Lunch break vertical divider between 11:30 and 13:00 */}
            {!isZoomed && (() => {
              const lunchIdx = Math.floor(zoomData.length / 2);
              if (lunchIdx > 0) {
                return (
                  <ReferenceLine
                    yAxisId="price"
                    x={lunchIdx}
                    stroke="hsl(var(--border))"
                    strokeWidth={0.5}
                    strokeDasharray="2 4"
                  />
                );
              }
              return null;
            })()}
            {/* ── 早盘放量下跌禁买区（智能动态分级 v2） ── */}
            {earlyVolDeclineBan && (() => {
              const ban = earlyVolDeclineBan;
              const banIdx = banMaskIdx;
              if (banIdx < 0) return null;
              const tierColor = { mild: "#f59e0b", medium: "#ef4444", strong: "#dc2626", extreme: "#991b1b" }[ban.tier];
              return (<>
                <ReferenceLine yAxisId="price" x={banIdx} stroke={tierColor} strokeWidth={1} strokeDasharray="4 3" strokeOpacity={0.7} label={{ value: `${ban.banEndTimeStr} 禁买线`, position: "insideTopRight", fill: tierColor, fontSize: 9, fontWeight: 700, fillOpacity: 0.8 }} />
              </>);
            })()}
            {/* ── 早盘放量下跌禁买蒙版（智能动态分级 v2） ── */}
            <Customized component={(props: any) => {
              if (!earlyVolDeclineBan) return null;
              const ban = earlyVolDeclineBan;
              const banIdx = banMaskIdx;
              if (banIdx < 0) return null;
              const { xAxisMap, offset } = props;
              if (!xAxisMap || !offset) return null;
              const xAxis = xAxisMap[Object.keys(xAxisMap)[0]];
              if (!xAxis || !xAxis.scale) return null;
              const xScale = xAxis.scale;
              const x1 = xScale(0);
              const x2 = xScale(banIdx);
              const y1 = offset.top;
              const y2 = offset.top + offset.height;
              const w = x2 - x1;
              const h = y2 - y1;
              if (w <= 0 || h <= 0) return null;
              const tierColor = { mild: "#f59e0b", medium: "#ef4444", strong: "#dc2626", extreme: "#991b1b" }[ban.tier];
              const tierLabel = { mild: "轻微", medium: "中等", strong: "强烈", extreme: "极端" }[ban.tier];
              // 根据危险指数动态调整蒙版透明度（加深版）
              const bgOpacity = 0.06 + (ban.dangerIndex / 100) * 0.20;
              const diagLines: React.ReactNode[] = [];
              const gap = 14;
              for (let i = -h; i < w + h; i += gap) {
                diagLines.push(
                  <line key={i} x1={i} y1={0} x2={i - h} y2={h} stroke={tierColor} strokeWidth={1.2} strokeOpacity={0.30} />
                );
              }
              const extraInfo = ban.earlyLifted ? `${tierLabel}·提前解禁` : `${tierLabel}·危险${ban.dangerIndex}`;
              return (
                <g>
                  <defs>
                    <clipPath id="ban-clip">
                      <rect x={x1} y={y1} width={w} height={h} />
                    </clipPath>
                  </defs>
                  {/* 半透明蒙版底色 */}
                  <rect x={x1} y={y1} width={w} height={h} fill={tierColor} fillOpacity={bgOpacity} />
                  {/* 斜线条纹 */}
                  <g clipPath="url(#ban-clip)">
                    <g transform={`translate(${x1},${y1})`}>
                      {diagLines}
                    </g>
                  </g>
                  {/* 边框 */}
                  <rect x={x1} y={y1} width={w} height={h} fill="none" stroke={tierColor} strokeWidth={1.0} strokeOpacity={0.45} />
                  {/* 禁买文字 */}
                  <text x={x1 + w / 2} y={y1 + h / 2 - 8} textAnchor="middle" fontSize={13} fontWeight={800} fill={tierColor} fillOpacity={0.60} fontFamily="sans-serif">禁买区</text>
                  <text x={x1 + w / 2} y={y1 + h / 2 + 10} textAnchor="middle" fontSize={10} fontWeight={600} fill={tierColor} fillOpacity={0.50} fontFamily="sans-serif">{ban.banEndTimeStr}前禁止买入 · {extraInfo}</text>
                </g>
              );
            }} />
            {/* Highest & Lowest price dashed lines + labels */}
            {highestPrice != null && highestPrice !== safePrevClose && (
              <ReferenceLine
                yAxisId="price"
                y={highestPrice}
                stroke="#ef4444"
                strokeDasharray="8 4"
                strokeWidth={1.8}
              />
            )}
            {lowestPrice != null && lowestPrice !== safePrevClose && (
              <ReferenceLine
                yAxisId="price"
                y={lowestPrice}
                stroke="#22c55e"
                strokeDasharray="8 4"
                strokeWidth={1.8}
              />
            )}
            <Customized component={(props: any) => {
              const { yAxisMap, offset } = props;
              if (!yAxisMap || (highestPrice == null && lowestPrice == null) || safePrevClose <= 0) return null;
              const yAxis = yAxisMap.price;
              if (!yAxis || !yAxis.scale) return null;
              const yScale = yAxis.scale;
              const labelX = offset ? offset.left + offset.width + 5 : 0;
              const els: React.ReactNode[] = [];
              if (highestPrice != null) {
                const y = yScale(highestPrice);
                if (y != null && !isNaN(y)) {
                  const pct = ((highestPrice - safePrevClose) / safePrevClose * 100);
                  els.push(
                    <g key="hi-tag">
                      <rect x={labelX} y={y - 17} width={76} height={34} rx={3} fill="#ef4444" fillOpacity={0.6} />
                      <text x={labelX + 38} y={y - 2} textAnchor="middle" fontSize={10} fontFamily="monospace" fontWeight={700} fill="#ffffff">{formatPrice(highestPrice)}</text>
                      <text x={labelX + 38} y={y + 12} textAnchor="middle" fontSize={9} fontFamily="monospace" fontWeight={600} fill="rgba(255,255,255,0.85)">+{pct.toFixed(2)}%</text>
                    </g>
                  );
                }
              }
              if (lowestPrice != null) {
                const y = yScale(lowestPrice);
                if (y != null && !isNaN(y)) {
                  const pct = ((lowestPrice - safePrevClose) / safePrevClose * 100);
                  els.push(
                    <g key="lo-tag">
                      <rect x={labelX} y={y - 17} width={76} height={34} rx={3} fill="#22c55e" fillOpacity={0.6} />
                      <text x={labelX + 38} y={y - 2} textAnchor="middle" fontSize={10} fontFamily="monospace" fontWeight={700} fill="#ffffff">{formatPrice(lowestPrice)}</text>
                      <text x={labelX + 38} y={y + 12} textAnchor="middle" fontSize={9} fontFamily="monospace" fontWeight={600} fill="rgba(255,255,255,0.85)">{pct >= 0 ? "+" : ""}{pct.toFixed(2)}%</text>
                    </g>
                  );
                }
              }
              return els.length > 0 ? <g>{els}</g> : null;
            }} />
            {/* Area fill below price line - 同花顺 style */}
            <Area
              yAxisId="price"
              type="monotone"
              dataKey="price"
              stroke="none"
              fill="#3b82f6"
              fillOpacity={0.06}
              isAnimationActive={false}
            />
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="price"
              stroke="#3b82f6"
              dot={false}
              strokeWidth={isZoomed ? 1.5 : 1}
              isAnimationActive={false}
            />
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="avgPrice"
              stroke="#ca8a04"
              dot={false}
              strokeWidth={isZoomed ? 1.8 : 1.3}
              strokeDasharray="5 3"
              isAnimationActive={false}
            />
            {/* Lowest price among last 5 trading days — thick gradient line (after Area/Line so it renders on top) */}
            {recentDayLows && recentDayLows.length > 0 && recentDayLows
              .map((item, i) => {
                const parts = item.date.split("-");
                const dateLabel = parts.length >= 3 ? `${parts[1]}/${parts[2]}` : item.date;
                return (
                  <Customized key={`recentlow-${i}`} component={(props: any) => {
                    const { xAxisMap, yAxisMap, offset } = props;
                    if (!xAxisMap || !yAxisMap || !offset) return null;
                    // Use explicit 'price' axis key instead of Object.values()[0]
                    // to avoid accidentally using the 'percent' axis
                    const yAxis = (yAxisMap as any).price ?? Object.values(yAxisMap)[0] as any;
                    if (!yAxis?.scale) return null;
                    const y = yAxis.scale(item.low);
                    const x1 = offset.left;
                    const x2 = offset.left + offset.width;
                    return (
                      <g>
                        {/* Gradient definition — userSpaceOnUse for reliable rendering on horizontal lines */}
                        <defs>
                          <linearGradient id="recentLowGrad" x1={x1} y1={y} x2={x2} y2={y} gradientUnits="userSpaceOnUse">
                            <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.6" />
                            <stop offset="20%" stopColor="#f97316" stopOpacity="0.9" />
                            <stop offset="50%" stopColor="#ef4444" stopOpacity="1" />
                            <stop offset="80%" stopColor="#dc2626" stopOpacity="1" />
                            <stop offset="100%" stopColor="#b91c1c" stopOpacity="1" />
                          </linearGradient>
                          {/* Glow filter — stronger blur */}
                          <filter id="recentLowGlow" x="-5%" y="-100%" width="110%" height="300%">
                            <feGaussianBlur stdDeviation="5" result="blur" />
                            <feMerge>
                              <feMergeNode in="blur" />
                              <feMergeNode in="SourceGraphic" />
                            </feMerge>
                          </filter>
                        </defs>
                        {/* Wide glow layer — soft halo */}
                        <line
                          x1={x1} y1={y} x2={x2} y2={y}
                          stroke="url(#recentLowGrad)"
                          strokeWidth={8}
                          strokeOpacity={0.15}
                          filter="url(#recentLowGlow)"
                        />
                        {/* Medium glow layer */}
                        <line
                          x1={x1} y1={y} x2={x2} y2={y}
                          stroke="url(#recentLowGrad)"
                          strokeWidth={4}
                          strokeOpacity={0.3}
                        />
                        {/* Main gradient line */}
                        <line
                          x1={x1} y1={y} x2={x2} y2={y}
                          stroke="url(#recentLowGrad)"
                          strokeWidth={1.5}
                          strokeLinecap="round"
                        />
                        {/* Bright core line */}
                        <line
                          x1={x1} y1={y} x2={x2} y2={y}
                          stroke="white"
                          strokeWidth={0.8}
                          strokeOpacity={0.25}
                        />
                        {/* Label pill inside left edge of chart area */}
                        {(() => {
                          const pillW = 116;
                          const pillH = 24;
                          // Place pill just inside the left chart edge so it's never clipped
                          const pillX = x1 + 4;
                          return (
                            <>
                              {/* Pill glow */}
                              <rect
                                x={pillX - 2}
                                y={y - pillH / 2 - 2}
                                width={pillW + 4}
                                height={pillH + 4}
                                rx={14}
                                fill="#dc2626"
                                fillOpacity={0.25}
                                filter="url(#recentLowGlow)"
                              />
                              {/* Pill background */}
                              <rect
                                x={pillX}
                                y={y - pillH / 2}
                                width={pillW}
                                height={pillH}
                                rx={12}
                                fill="#dc2626"
                                fillOpacity={0.95}
                                stroke="#fca5a5"
                                strokeWidth={1}
                              />
                              <text
                                x={pillX + pillW / 2}
                                y={y + 1}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fill="white"
                                fontSize={10}
                                fontWeight="900"
                              >
                                {`▼5日最低 ${dateLabel} ${formatPrice(item.low)}`}
                              </text>
                            </>
                          );
                        })()}
                      </g>
                    );
                  }} />
                );
              })
            }
            {/* ── VWAP Ban Zone Annotations (均线±0.3%三层标注) ── */}
            <Customized component={(props: any) => {
              const { yAxisMap, xAxisMap, offset } = props;
              if (!yAxisMap || !xAxisMap || !offset) return null;
              const yAxis = yAxisMap.price;
              const xAxis = xAxisMap[Object.keys(xAxisMap)[0]];
              if (!yAxis || !yAxis.scale || !xAxis || !xAxis.scale) return null;
              const yScale = yAxis.scale;
              const xScale = xAxis.scale;

              // Collect VWAP data points
              const pts: { idx: number; avg: number }[] = [];
              for (let i = 0; i < zoomData.length; i++) {
                const d = zoomData[i];
                if (d.hasData && d.avgPrice != null && d.avgPrice > 0) {
                  pts.push({ idx: i, avg: d.avgPrice });
                }
              }
              if (pts.length < 2) return null;

              const plotLeft = offset.left;
              const plotRight = offset.left + offset.width;

              // Build SVG path strings for each zone band
              // Each band is a closed polygon: forward along upper boundary, backward along lower boundary
              const buildBandPath = (
                upperFn: (avg: number) => number, // price → y-pixel for upper edge
                lowerFn: (avg: number) => number, // price → y-pixel for lower edge
              ) => {
                const fwd: string[] = []; // upper boundary (left→right)
                const bwd: string[] = []; // lower boundary (right→left)
                for (let i = 0; i < pts.length; i++) {
                  const x = Math.max(Math.min(xScale(pts[i].idx), plotRight), plotLeft);
                  const yU = upperFn(pts[i].avg);
                  const yL = lowerFn(pts[i].avg);
                  fwd.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${yU.toFixed(1)}`);
                  bwd.push(`${x.toFixed(1)},${yL.toFixed(1)}`);
                }
                return fwd.join(' ') + ' ' + bwd.reverse().join(' ').replace(/^[ML]/, 'L') + ' Z';
              };

              // Three zones around VWAP:
              // Inner: VWAP ±0.1% → 禁止买卖 (yellow)
              // Upper: VWAP +0.1% ~ +0.3% → 禁卖 (green)
              // Lower: VWAP -0.3% ~ -0.1% → 禁买 (red)
              const innerPct = 0.001;
              const outerPct = 0.003;

              const innerPath = buildBandPath(
                (avg) => yScale(avg * (1 + innerPct)),
                (avg) => yScale(avg * (1 - innerPct)),
              );
              const upperPath = buildBandPath(
                (avg) => yScale(avg * (1 + outerPct)),
                (avg) => yScale(avg * (1 + innerPct)),
              );
              const lowerPath = buildBandPath(
                (avg) => yScale(avg * (1 - innerPct)),
                (avg) => yScale(avg * (1 - outerPct)),
              );

              // Labels: sparse, placed at strategic positions along the VWAP line
              const els: React.ReactNode[] = [];
              const labelCount = pts.length <= 10 ? 1 : pts.length <= 50 ? 2 : Math.min(4, Math.floor(pts.length / 60) + 1);
              const step = Math.max(1, Math.floor(pts.length / (labelCount + 1)));
              const labelPositions = [];
              for (let i = step; i < pts.length; i += step) {
                labelPositions.push(i);
              }
              // Always include near the right edge (latest data)
              if (labelPositions.length === 0 || labelPositions[labelPositions.length - 1] < pts.length - 3) {
                labelPositions.push(Math.max(0, pts.length - 2));
              }

              const labelFontSize = 8;
              for (const pi of labelPositions) {
                const pt = pts[pi];
                const x = Math.min(xScale(pt.idx) + 8, plotRight - 60);
                const avg = pt.avg;

                // Inner zone label
                const yInnerMid = (yScale(avg * (1 + innerPct)) + yScale(avg * (1 - innerPct))) / 2;
                els.push(
                  <text key={`vwap-inner-${pi}`} x={x} y={yInnerMid} dominantBaseline="middle" textAnchor="start" fontSize={labelFontSize} fontWeight={600} fill="#eab308" fillOpacity={0.65}>禁止买卖</text>
                );
                // Upper zone label
                const yUpperMid = (yScale(avg * (1 + outerPct)) + yScale(avg * (1 + innerPct))) / 2;
                els.push(
                  <text key={`vwap-upper-${pi}`} x={x} y={yUpperMid} dominantBaseline="middle" textAnchor="start" fontSize={labelFontSize} fontWeight={600} fill="#22c55e" fillOpacity={0.6}>禁卖</text>
                );
                // Lower zone label
                const yLowerMid = (yScale(avg * (1 - innerPct)) + yScale(avg * (1 - outerPct))) / 2;
                els.push(
                  <text key={`vwap-lower-${pi}`} x={x} y={yLowerMid} dominantBaseline="middle" textAnchor="start" fontSize={labelFontSize} fontWeight={600} fill="#ef4444" fillOpacity={0.6}>禁买</text>
                );
              }

              return (
                <g>
                  <path d={innerPath} fill="#eab308" fillOpacity={0.10} stroke="none" />
                  <path d={upperPath} fill="#22c55e" fillOpacity={0.07} stroke="none" />
                  <path d={lowerPath} fill="#ef4444" fillOpacity={0.07} stroke="none" />
                  {els}
                </g>
              );
            }} />
            {/* Crosshair vertical line - shared across panels */}
            {deferredCrosshairIdx != null && crosshairItem?.hasData && (
              <ReferenceLine yAxisId="price" x={deferredCrosshairIdx} stroke="#64748b" strokeWidth={1.2} strokeDasharray="5 3" />
            )}
            {/* ── Best Buy Period Overlay (10:30-11:30) for declining stocks ── */}
            {lastItem && lastItem.price > 0 && safePrevClose > 0 && lastItem.price < safePrevClose && (() => {
              // Find 10:30 and 11:30 indices in zoomData
              const startItem = zoomData.find(d => d.time === "10:30");
              const endItem = zoomData.find(d => d.time === "11:30");
              if (startItem == null || endItem == null) return null;
              return (
                <Customized component={(props: any) => {
                  const { xAxisMap, yAxisMap, offset } = props;
                  if (!xAxisMap || !yAxisMap || !offset) return null;
                  const xAxis = Object.values(xAxisMap)[0] as any;
                  const yAxis = Object.values(yAxisMap)[0] as any;
                  if (!xAxis?.scale || !yAxis?.scale) return null;

                  const xStart = xAxis.scale(startItem.idx);
                  const xEnd = xAxis.scale(endItem.idx);
                  const plotTop = offset.top;
                  const plotHeight = offset.height;

                  if (xEnd - xStart < 5) return null; // Too narrow to show

                  const midX = (xStart + xEnd) / 2;
                  // Place badge at the top of the overlay area
                  const badgeY = plotTop + 22;

                  return (
                    <g>
                      {/* Semi-transparent green mask (A股：买入=绿色) */}
                      <defs>
                        <linearGradient id="bestBuyGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#16a34a" stopOpacity="0.18" />
                          <stop offset="30%" stopColor="#22c55e" stopOpacity="0.10" />
                          <stop offset="100%" stopColor="#16a34a" stopOpacity="0.04" />
                        </linearGradient>
                        {/* Animated dash for border */}
                        <filter id="bestBuyGlow">
                          <feGaussianBlur stdDeviation="2" result="blur" />
                          <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                          </feMerge>
                        </filter>
                      </defs>
                      {/* Main overlay rectangle */}
                      <rect
                        x={xStart}
                        y={plotTop}
                        width={xEnd - xStart}
                        height={plotHeight}
                        fill="url(#bestBuyGrad)"
                        stroke="#22c55e"
                        strokeWidth={1.5}
                        strokeDasharray="6 3"
                        strokeOpacity={0.7}
                        rx={3}
                      />
                      {/* Top banner bar — solid green strip */}
                      <rect
                        x={xStart}
                        y={plotTop}
                        width={xEnd - xStart}
                        height={38}
                        fill="#16a34a"
                        fillOpacity={0.10}
                        rx={3}
                      />
                      {/* Left boundary label */}
                      <g>
                        <rect
                          x={xStart - 1}
                          y={plotTop + 4}
                          width={32}
                          height={14}
                          rx={3}
                          fill="#16a34a"
                          fillOpacity={0.9}
                        />
                        <text
                          x={xStart + 15}
                          y={plotTop + 11}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="white"
                          fontSize={8}
                          fontWeight="700"
                        >
                          10:30
                        </text>
                      </g>
                      {/* Right boundary label */}
                      <g>
                        <rect
                          x={xEnd - 31}
                          y={plotTop + 4}
                          width={32}
                          height={14}
                          rx={3}
                          fill="#16a34a"
                          fillOpacity={0.9}
                        />
                        <text
                          x={xEnd - 15}
                          y={plotTop + 11}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="white"
                          fontSize={8}
                          fontWeight="700"
                        >
                          11:30
                        </text>
                      </g>
                      {/* Prominent reminder badge — positioned at top of overlay */}
                      <g filter="url(#bestBuyGlow)">
                        {/* Badge background */}
                        <rect
                          x={midX - 70}
                          y={badgeY - 13}
                          width={140}
                          height={26}
                          rx={13}
                          fill="#16a34a"
                          fillOpacity={0.92}
                          stroke="#bbf7d0"
                          strokeWidth={1.5}
                        />
                        {/* Pulsing ring around badge */}
                        <rect
                          x={midX - 74}
                          y={badgeY - 17}
                          width={148}
                          height={34}
                          rx={17}
                          fill="none"
                          stroke="#22c55e"
                          strokeWidth={2}
                          strokeDasharray="4 4"
                          opacity={0.6}
                        >
                          <animate
                            attributeName="stroke-dashoffset"
                            from="0"
                            to="16"
                            dur="1.5s"
                            repeatCount="indefinite"
                          />
                          <animate
                            attributeName="opacity"
                            values="0.6;0.2;0.6"
                            dur="2s"
                            repeatCount="indefinite"
                          />
                        </rect>
                        {/* Main text */}
                        <text
                          x={midX}
                          y={badgeY + 1}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="white"
                          fontSize={12}
                          fontWeight="800"
                          letterSpacing="0.5"
                        >
                          买入最佳时期
                        </text>
                      </g>
                      {/* Secondary hint text below badge */}
                      <text
                        x={midX}
                        y={badgeY + 20}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="#166534"
                        fontSize={9}
                        fontWeight="600"
                        opacity={0.8}
                      >
                        下跌股10:30~11:30易现低点，关注买入时机
                      </text>
                    </g>
                  );
                }} />
              );
            })()}
            <Customized component={CombinedChartOverlay} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ─── External Intent Timeline Bar (主力意图分段条) ─── */}
      {intradayIntent && intradayIntent.segments.length > 0 && (() => {
        // Trading time ranges (in minutes from midnight)
        // Morning: 570 (9:30) – 690 (11:30) = 120 min
        // Afternoon: 780 (13:00) – 900 (15:00) = 120 min
        // Total active trading: 240 min (lunch gap excluded)
        const MORNING_START = 570;
        const MORNING_END = 690;
        const AFTERNOON_START = 780;
        const AFTERNOON_END = 900;
        const TOTAL_ACTIVE_MIN = 240; // 120 + 120

        const timeToMin = (t: string): number => {
          const [h, m] = t.split(":").map(Number);
          return h * 60 + m;
        };

        // Convert a clock-minute value to a percentage position (0-100%) on the timeline
        // Accounts for lunch break gap
        const minToPercent = (m: number): number => {
          if (m <= MORNING_END) {
            // Morning session
            return ((m - MORNING_START) / TOTAL_ACTIVE_MIN) * 100;
          } else {
            // Afternoon session (shift by lunch gap)
            return ((m - AFTERNOON_START + (MORNING_END - MORNING_START)) / TOTAL_ACTIVE_MIN) * 100;
          }
        };

        const segments = intradayIntent.segments.filter(s => s.intent !== "观察");

        // Intent color mapping: 吸筹=红, 出货=绿, 洗盘=黄, 拉升=红, 震荡=灰
        const getIntentColors = (intent: string) => {
          switch (intent) {
            case "吸筹": return { bg: "bg-red-500/20", border: "border-red-500/50", text: "text-red-600 dark:text-red-400", dot: "bg-red-500" };
            case "出货": return { bg: "bg-green-500/20", border: "border-green-500/50", text: "text-green-600 dark:text-green-400", dot: "bg-green-500" };
            case "洗盘": return { bg: "bg-yellow-500/20", border: "border-yellow-500/50", text: "text-yellow-600 dark:text-yellow-400", dot: "bg-yellow-500" };
            case "拉升": return { bg: "bg-red-500/20", border: "border-red-500/50", text: "text-red-600 dark:text-red-400", dot: "bg-red-500" };
            case "震荡": return { bg: "bg-gray-500/15", border: "border-gray-500/40", text: "text-gray-600 dark:text-gray-400", dot: "bg-gray-400" };
            default: return { bg: "bg-gray-500/10", border: "border-gray-500/30", text: "text-gray-500", dot: "bg-gray-400" };
          }
        };

        return (
          <div className="px-2 pt-0 pb-0.5">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[9px] text-muted-foreground font-medium select-none">主力意图</span>
              {segments.length > 0 && (
                <div className="flex items-center gap-1">
                  {segments.map((seg, i) => {
                    const colors = getIntentColors(seg.intent);
                    return (
                      <span key={i} className={`inline-flex items-center gap-0.5 text-[8px] font-semibold ${colors.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                        {seg.label}{seg.intent}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Timeline bar with colored segments */}
            <div className="relative h-4 rounded-sm border border-border/50 bg-muted/20 overflow-hidden">
              {/* Lunch break divider */}
              <div className="absolute top-0 bottom-0 left-1/2 w-px bg-border/60 z-10" />
              {/* Segments */}
              {intradayIntent.segments.map((seg, i) => {
                if (seg.intent === "观察") {
                  // Still render a subtle placeholder for 观察 segments
                  const startPct = minToPercent(timeToMin(seg.startTime));
                  const endPct = minToPercent(timeToMin(seg.endTime));
                  const width = endPct - startPct;
                  return (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 bg-muted/10"
                      style={{ left: `${startPct}%`, width: `${width}%` }}
                    />
                  );
                }
                const colors = getIntentColors(seg.intent);
                const startPct = minToPercent(timeToMin(seg.startTime));
                const endPct = minToPercent(timeToMin(seg.endTime));
                const width = endPct - startPct;
                return (
                  <div
                    key={i}
                    className={`absolute top-0 bottom-0 flex items-center justify-center border-x ${colors.border} ${colors.bg} transition-all`}
                    style={{ left: `${startPct}%`, width: `${width}%` }}
                    title={`${seg.label} ${seg.startTime}-${seg.endTime}: ${seg.intent} (${seg.confidence}%) — ${seg.topReason}`}
                  >
                    <span className={`text-[8px] font-bold leading-none truncate px-0.5 ${colors.text}`}>
                      {seg.intent}
                    </span>
                  </div>
                );
              })}
              {/* Time labels at edges */}
              <span className="absolute left-0.5 top-1/2 -translate-y-1/2 text-[7px] text-muted-foreground/50 select-none">9:30</span>
              <span className="absolute right-0.5 top-1/2 -translate-y-1/2 text-[7px] text-muted-foreground/50 select-none">15:00</span>
            </div>
          </div>
        );
      })()}

      {/* ─── Divider ─── */}
      <div className="h-px bg-border/50" />

      {/* ─── Panel 2: Volume Chart ─── */}
      <div data-chart-panel="vol">
        <div className="flex items-center gap-2 px-2 py-0.5 text-[9px] select-none pointer-events-none">
          <span className="text-muted-foreground font-medium">VOL</span>
        </div>
        <ResponsiveContainer width="100%" height={165}>
          <ComposedChart
            data={zoomData}
            margin={{ top: 0, right: 9, left: 2, bottom: 0 }}
            onMouseMove={handleChartMouseMove}
            onMouseLeave={handleChartMouseLeave}
          >
            <XAxis dataKey="idx" type="number" domain={xDomain} tick={false} tickLine={false} axisLine={false} />
            {/* Hidden left YAxis to align with price chart */}
            <YAxis
              yAxisId="vol-left"
              domain={[0, maxVolume * 1.01]}
              tick={false}
              tickLine={false}
              axisLine={false}
              width={55}
            />
            <YAxis
              yAxisId="vol-right"
              orientation="right"
              domain={[0, maxVolume * 1.01]}
              tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              width={50}
              tickFormatter={(v: number) => formatVolume(v)}
            />
            <Tooltip content={volumeTooltipEl} cursor={false} wrapperStyle={tooltipWrapperStyle} />
            {/* Lunch break vertical divider */}
            {!isZoomed && <ReferenceLine yAxisId="vol-right" x={Math.floor(zoomData.length / 2)} stroke="hsl(var(--border))" strokeWidth={0.5} strokeDasharray="2 4" />}
            {/* ── 早盘放量下跌禁买蒙版 (成交量图，智能动态分级 v2) ── */}
            {earlyVolDeclineBan && (() => {
              const ban = earlyVolDeclineBan;
              const banIdx = banMaskIdx;
              if (banIdx < 0) return null;
              const tierColor = { mild: "#f59e0b", medium: "#ef4444", strong: "#dc2626", extreme: "#991b1b" }[ban.tier];
              return (<>
                <ReferenceLine yAxisId="vol-right" x={banIdx} stroke={tierColor} strokeWidth={1} strokeDasharray="4 3" strokeOpacity={0.6} />
              </>);
            })()}
            <Customized component={(props: any) => {
              if (!earlyVolDeclineBan) return null;
              const ban = earlyVolDeclineBan;
              const banIdx = banMaskIdx;
              if (banIdx < 0) return null;
              const { xAxisMap, offset } = props;
              if (!xAxisMap || !offset) return null;
              const xAxis = xAxisMap[Object.keys(xAxisMap)[0]];
              if (!xAxis || !xAxis.scale) return null;
              const xScale = xAxis.scale;
              const x1 = xScale(0);
              const x2 = xScale(banIdx);
              const y1 = offset.top;
              const y2 = offset.top + offset.height;
              const w = x2 - x1;
              const h = y2 - y1;
              if (w <= 0 || h <= 0) return null;
              const tierColor = { mild: "#f59e0b", medium: "#ef4444", strong: "#dc2626", extreme: "#991b1b" }[ban.tier];
              const bgOpacity = 0.06 + (ban.dangerIndex / 100) * 0.20;
              const diagLines: React.ReactNode[] = [];
              const gap = 14;
              for (let i = -h; i < w + h; i += gap) {
                diagLines.push(<line key={i} x1={i} y1={0} x2={i - h} y2={h} stroke={tierColor} strokeWidth={1.2} strokeOpacity={0.30} />);
              }
              return (
                <g>
                  <defs><clipPath id="ban-clip-vol"><rect x={x1} y={y1} width={w} height={h} /></clipPath></defs>
                  <rect x={x1} y={y1} width={w} height={h} fill={tierColor} fillOpacity={bgOpacity} />
                  <g clipPath="url(#ban-clip-vol)"><g transform={`translate(${x1},${y1})`}>{diagLines}</g></g>
                  <rect x={x1} y={y1} width={w} height={h} fill="none" stroke={tierColor} strokeWidth={1.0} strokeOpacity={0.45} />
                </g>
              );
            }} />
            <Bar
              yAxisId="vol-right"
              dataKey="volume"
              isAnimationActive={false}
              barSize={barSize}
              shape={timelineVolumeBarShape}
            />
            {/* Crosshair vertical line - shared across panels */}
            {deferredCrosshairIdx != null && crosshairItem?.hasData && (
              <ReferenceLine yAxisId="vol-right" x={deferredCrosshairIdx} stroke="#64748b" strokeWidth={1.2} strokeDasharray="5 3" />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ─── Divider ─── */}
      <div className="h-px bg-border/50" />

      {/* ─── Panel 3: MACD Chart ─── */}
      <div data-chart-panel="macd">
        <div className="flex items-center gap-2 px-2 py-0.5 text-[9px] select-none pointer-events-none">
          <span className="text-muted-foreground font-medium">MACD</span>
          <span className="flex items-center gap-0.5">
            <span className="inline-block w-2 h-0.5 bg-blue-600 rounded" />
            <span className="text-blue-600">DIF</span>
          </span>
          <span className="flex items-center gap-0.5">
            <span className="inline-block w-2 h-0.5 bg-orange-600 rounded" />
            <span className="text-orange-600">DEA</span>
          </span>
        </div>
        <ResponsiveContainer width="100%" height={120}>
          <ComposedChart
            data={zoomData}
            margin={{ top: 0, right: 9, left: 2, bottom: 0 }}
            onMouseMove={handleChartMouseMove}
            onMouseLeave={handleChartMouseLeave}
          >
            <XAxis
              dataKey="idx"
              type="number"
              domain={xDomain}
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={{ stroke: "hsl(var(--border))", strokeWidth: 0.5 }}
              interval={0}
              ticks={zoomTimeTicks}
              tickFormatter={(idx: number) => {
                const item = zoomData[idx];
                return item?.time || "";
              }}
            />
            {/* Hidden left YAxis to align with price chart */}
            <YAxis
              yAxisId="macd-left"
              domain={[macdMin - macdPad, macdMax + macdPad]}
              tick={false}
              tickLine={false}
              axisLine={false}
              width={55}
            />
            <YAxis
              yAxisId="macd-right"
              orientation="right"
              domain={[macdMin - macdPad, macdMax + macdPad]}
              tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              width={50}
              tickFormatter={(v: number) => (v ?? 0).toFixed(3)}
            />
            <Tooltip content={macdTooltipEl} cursor={false} wrapperStyle={tooltipWrapperStyle} />
            <ReferenceLine yAxisId="macd-right" y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 2" strokeWidth={0.5} />
            {/* Lunch break vertical divider */}
            {!isZoomed && <ReferenceLine yAxisId="macd-right" x={Math.floor(zoomData.length / 2)} stroke="hsl(var(--border))" strokeWidth={0.5} strokeDasharray="2 4" />}
            {/* ── 早盘放量下跌禁买蒙版 (MACD图，智能动态分级 v2) ── */}
            {earlyVolDeclineBan && (() => {
              const ban = earlyVolDeclineBan;
              const banIdx = banMaskIdx;
              if (banIdx < 0) return null;
              const tierColor = { mild: "#f59e0b", medium: "#ef4444", strong: "#dc2626", extreme: "#991b1b" }[ban.tier];
              return (<>
                <ReferenceLine yAxisId="macd-right" x={banIdx} stroke={tierColor} strokeWidth={1} strokeDasharray="4 3" strokeOpacity={0.6} />
              </>);
            })()}
            <Customized component={(props: any) => {
              if (!earlyVolDeclineBan) return null;
              const ban = earlyVolDeclineBan;
              const banIdx = banMaskIdx;
              if (banIdx < 0) return null;
              const { xAxisMap, offset } = props;
              if (!xAxisMap || !offset) return null;
              const xAxis = xAxisMap[Object.keys(xAxisMap)[0]];
              if (!xAxis || !xAxis.scale) return null;
              const xScale = xAxis.scale;
              const x1 = xScale(0);
              const x2 = xScale(banIdx);
              const y1 = offset.top;
              const y2 = offset.top + offset.height;
              const w = x2 - x1;
              const h = y2 - y1;
              if (w <= 0 || h <= 0) return null;
              const tierColor = { mild: "#f59e0b", medium: "#ef4444", strong: "#dc2626", extreme: "#991b1b" }[ban.tier];
              const bgOpacity = 0.06 + (ban.dangerIndex / 100) * 0.20;
              const diagLines: React.ReactNode[] = [];
              const gap = 14;
              for (let i = -h; i < w + h; i += gap) {
                diagLines.push(<line key={i} x1={i} y1={0} x2={i - h} y2={h} stroke={tierColor} strokeWidth={1.2} strokeOpacity={0.30} />);
              }
              return (
                <g>
                  <defs><clipPath id="ban-clip-macd"><rect x={x1} y={y1} width={w} height={h} /></clipPath></defs>
                  <rect x={x1} y={y1} width={w} height={h} fill={tierColor} fillOpacity={bgOpacity} />
                  <g clipPath="url(#ban-clip-macd)"><g transform={`translate(${x1},${y1})`}>{diagLines}</g></g>
                  <rect x={x1} y={y1} width={w} height={h} fill="none" stroke={tierColor} strokeWidth={1.0} strokeOpacity={0.45} />
                </g>
              );
            }} />
            <Bar
              yAxisId="macd-right"
              dataKey="macd"
              isAnimationActive={false}
              barSize={barSize}
              shape={timelineMacdBarShape}
            />
            <Line
              yAxisId="macd-right"
              type="monotone"
              dataKey="dif"
              stroke="#2563eb"
              dot={false}
              strokeWidth={1.2}
              isAnimationActive={false}
            />
            <Line
              yAxisId="macd-right"
              type="monotone"
              dataKey="dea"
              stroke="#ea580c"
              dot={false}
              strokeWidth={1.2}
              isAnimationActive={false}
            />
            {/* Crosshair vertical line - shared across panels */}
            {deferredCrosshairIdx != null && crosshairItem?.hasData && (
              <ReferenceLine yAxisId="macd-right" x={deferredCrosshairIdx} stroke="#64748b" strokeWidth={1.2} strokeDasharray="5 3" />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ─── Market Index & Sector Mini Timelines ─── */}
      {(() => {
        const szData = indexTimelineData?.[activeIndexKey || "sz"];
        const idxInfo = indexConfig?.[activeIndexKey || "sz"];
        const hasIdxData = szData && szData.items.length > 0;
        const hasSectorData = sectorTimelineData.items.length > 0 && sectorInfo;

        // Show index retry placeholder when data is missing
        const idxRetryPlaceholder = !hasIdxData && onRetryIndex ? (
          <div className="rounded-lg border bg-card p-3 flex items-center justify-center gap-2 text-muted-foreground">
            <span className="text-xs">{idxInfo?.label || "深证成指(骗人指数)"}分时数据未加载</span>
            <button
              onClick={onRetryIndex}
              disabled={indexLoading}
              className="inline-flex items-center gap-0.5 px-2 py-1 rounded border text-[9px] font-semibold bg-blue-500/10 border-blue-500/20 text-blue-500 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
              title="点击重新请求指数分时数据"
            >
              {indexLoading ? (
                <>
                  <span className="inline-block w-2.5 h-2.5 border-[1.5px] border-current border-t-transparent rounded-full animate-spin" />
                  <span>加载中</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-2.5 h-2.5" />
                  <span>重新加载</span>
                </>
              )}
            </button>
          </div>
        ) : null;

        if (!hasIdxData && !hasSectorData) {
          return idxRetryPlaceholder;
        }

        const regimeBadge = (regime: RegimeDetail | null) => {
          if (!regime) return null;
          const cfg = REGIME_CONFIG[regime.regime] || REGIME_CONFIG["震荡市"];
          return <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[9px] font-semibold ${cfg.bg} ${cfg.text}`}><span>{cfg.icon}</span><span>{regime.regime}</span></span>;
        };

        return (
          <div className="mt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {hasSectorData && <MiniTimelinePanel title={`${sectorInfo.name}板块`} data={sectorTimelineData.items} prevClose={sectorTimelineData.prevClose} badge={<div className="ml-auto">{regimeBadge(sectorRegime)}</div>} />}
              {hasIdxData && <MiniTimelinePanel title={idxInfo?.label || "深证成指(骗人指数)"} data={szData.items} prevClose={szData.prevClose} badge={<div className="flex items-center gap-1 ml-auto">{regimeBadge(szIndexRegime)}{onCycleIndex && <span className="text-[8px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none" onClick={onCycleIndex} title="点击切换指数">切换</span>}</div>} />}
              {!hasIdxData && idxRetryPlaceholder}
            </div>
          </div>
        );
      })()}
    </div>
  );
}, timeSharingPropsEqual);
