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
  ReferenceArea,
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
  generateTimelineSignals,
  getStrengthLabel,
  getStrengthColor,
} from "@/lib/chart-shared";
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
        <span className={`text-right font-mono ${isUp ? "text-red-500" : "text-green-500"}`}>{data.price?.toFixed(2) ?? "--"}</span>
        <span className="text-muted-foreground">均价</span>
        <span className="text-right font-mono text-yellow-500">{data.avgPrice?.toFixed(2) ?? "--"}</span>
        <span className="text-muted-foreground">涨跌</span>
        <span className={`text-right font-mono ${isUp ? "text-red-500" : "text-green-500"}`}>{data.changePercent?.toFixed(2) ?? "--"}%</span>
        <span className="text-muted-foreground">成交量</span>
        <span className="text-right font-mono">{formatVolume(data.volume)}</span>
        <span className="text-muted-foreground">成交额</span>
        <span className="text-right font-mono text-yellow-500">{formatAmount(data.volume * 100 * data.price)}</span>
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
        <span className="text-right font-mono text-yellow-500">{formatAmount(data.volume * 100 * data.price)}</span>
        <span className="text-muted-foreground">价格</span>
        <span className={`text-right font-mono ${isUp ? "text-red-500" : "text-green-500"}`}>{data.price.toFixed(2)}</span>
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

  const result: { x: number; y: number; marker: PulseVolumeMarker }[] = [];
  for (const marker of markers) {
    const matchPoint = priceLineData.find((p: any) => p?.payload?.time === marker.time);
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
  const isEarlyVolDrop = marker.type === "early_vol_drop";
  const isWashTrade = marker.type === "wash_trade";
  const isVolRise = marker.type === "vol_rise";
  const isShrinkRise = marker.type === "shrink_rise";
  const isPulseRise = marker.type === "pulse_rise";
  const isAbove = isPulse || isProgressiveVol || isEarlyVolDrop || isWashTrade || isVolRise || isPulseRise;

  const amountStr = marker.amount > 0 ? formatAmount(marker.amount) : "";
  const displayLabel = amountStr ? `${marker.label} ${amountStr}` : marker.label;

  const isBigLabel = isEarlyVolDrop || isWashTrade || isVolRise || isShrinkRise || isPulseRise;
  const estimatedCharWidth = isBigLabel ? 8 : 7.5;
  const pillW = isBigLabel ? Math.max(100, Math.min(220, Math.round(displayLabel.length * estimatedCharWidth + 10))) : Math.max(84, Math.min(160, Math.round(displayLabel.length * estimatedCharWidth + 8)));
  const pillH = isBigLabel ? 16 : 16;

  const labelY = isAbove ? (isEarlyVolDrop ? y - 70 : isWashTrade ? y - 65 : isVolRise ? y - 65 : isPulseRise ? y - 65 : y - 52) : y + 36;

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
  svgWidth?: number,
  svgHeight?: number,
): PlacedLabel[] {
  if (markerPoints.length === 0) return [];

  // Boundary limits for labels — prevent labels from going outside visible area
  const SVG_W = svgWidth || 900;
  const SVG_H = svgHeight || 620;
  const TOP_MIN = 4;          // minimum labelY for above labels (px from SVG top)
  const BOTTOM_MAX = SVG_H - 4; // maximum labelY for below labels (px from SVG top)
  const LEFT_MIN = 10;        // minimum left edge of label pill
  const RIGHT_MAX = SVG_W - 10; // maximum right edge of label pill

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

  // Step 3: Boundary clamping — ensure all labels stay within visible area
  for (const p of placed) {
    // Clamp vertical position
    if (p.layout.isAbove) {
      // For above labels, ensure labelY - pillH/2 - 2 >= TOP_MIN
      const minLabelY = TOP_MIN + p.layout.pillH / 2 + 2;
      if (p.adjustedLabelY < minLabelY) {
        p.adjustedLabelY = minLabelY;
      }
    } else {
      // For below labels, ensure labelY + pillH <= BOTTOM_MAX
      const maxLabelY = BOTTOM_MAX - p.layout.pillH;
      if (p.adjustedLabelY > maxLabelY) {
        p.adjustedLabelY = maxLabelY;
      }
    }

    // Clamp horizontal position — ensure pill doesn't go off left/right edge
    const pillLeft = p.adjustedX - p.layout.pillW / 2;
    const pillRight = p.adjustedX + p.layout.pillW / 2;
    if (pillLeft < LEFT_MIN) {
      p.adjustedX = LEFT_MIN + p.layout.pillW / 2;
    } else if (pillRight > RIGHT_MAX) {
      p.adjustedX = RIGHT_MAX - p.layout.pillW / 2;
    }
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
  const isWashTrade = marker.type === "wash_trade";
  const isVolRise = marker.type === "vol_rise";
  const isShrinkRise = marker.type === "shrink_rise";
  const isPulseRise = marker.type === "pulse_rise";
  const isDecline = isPulseDecline || isVolumeDecline || isEarlyVolDrop;

  // Color schemes — brighter & more saturated for visibility
  // Decline markers use green tones (bearish in Chinese markets)
  // early_vol_drop uses RED for extreme danger (禁止买入)
  // wash_trade uses BLUE for opportunity (低吸机会)
  let bgColor: string, borderColor: string, textColor: string, iconColor: string, glowColor: string;
  const isAbove = isPulse || isProgressiveVol || isEarlyVolDrop || isWashTrade || isVolRise || isPulseRise;
  const defaultLabelY = isAbove ? (isEarlyVolDrop ? y - 90 : isWashTrade ? y - 80 : isVolRise ? y - 80 : isPulseRise ? y - 80 : y - 52) : y + 36;
  let labelY = adjustedLabelY ?? defaultLabelY;
  let labelX = adjustedX ?? x; // label center x (may be shifted for same-time markers)

  // Pre-compute label dimensions for boundary clamping (will be recomputed below for rendering)
  const _isBigLabel = isEarlyVolDrop || isWashTrade || isVolRise || isShrinkRise || isPulseRise;
  const _amountStr = marker.amount > 0 ? formatAmount(marker.amount) : "";
  const _displayLabel = _amountStr ? `${marker.label} ${_amountStr}` : marker.label;
  const _estimatedCharWidth = _isBigLabel ? 8 : 7.5;
  const _pillW = _isBigLabel ? Math.max(100, Math.min(220, Math.round(_displayLabel.length * _estimatedCharWidth + 10))) : Math.max(84, Math.min(160, Math.round(_displayLabel.length * _estimatedCharWidth + 8)));
  const _pillH = 16;
  // Safety clamp: ensure label stays within visible SVG area
  // Vertical clamp
  if (labelY - _pillH / 2 - 2 < 2) labelY = _pillH / 2 + 4;
  if (labelY + _pillH > 620) labelY = 620 - _pillH;
  // Horizontal clamp
  if (labelX - _pillW / 2 < 5) labelX = _pillW / 2 + 5;
  if (labelX + _pillW / 2 > 895) labelX = 895 - _pillW / 2;

  if (isPulse) {
    bgColor = "rgba(245, 158, 11, 0.25)";
    borderColor = "rgba(245, 158, 11, 0.85)";
    textColor = "#b45309";
    iconColor = "#f59e0b";
    glowColor = "rgba(245, 158, 11, 0.35)";
  } else if (isProgressiveVol) {
    bgColor = "rgba(16, 185, 129, 0.25)";
    borderColor = "rgba(16, 185, 129, 0.85)";
    textColor = "#047857";
    iconColor = "#10b981";
    glowColor = "rgba(16, 185, 129, 0.35)";
  } else if (isPulseDecline) {
    bgColor = "rgba(22, 163, 74, 0.25)";
    borderColor = "rgba(22, 163, 74, 0.85)";
    textColor = "#166534";
    iconColor = "#16a34a";
    glowColor = "rgba(22, 163, 74, 0.35)";
  } else if (isVolumeDecline) {
    bgColor = "rgba(34, 197, 94, 0.25)";
    borderColor = "rgba(34, 197, 94, 0.85)";
    textColor = "#15803d";
    iconColor = "#22c55e";
    glowColor = "rgba(34, 197, 94, 0.35)";
  } else if (isEarlyVolDrop) {
    // 早盘放量下跌 → 醒目红色（危险！禁止买入）
    bgColor = "rgba(239, 68, 68, 0.35)";
    borderColor = "rgba(239, 68, 68, 1)";
    textColor = "#ffffff";
    iconColor = "#ef4444";
    glowColor = "rgba(239, 68, 68, 0.6)";
  } else if (isWashTrade) {
    // 洗盘 → 蓝色（低吸机会）
    bgColor = "rgba(59, 130, 246, 0.30)";
    borderColor = "rgba(59, 130, 246, 1)";
    textColor = "#ffffff";
    iconColor = "#3b82f6";
    glowColor = "rgba(59, 130, 246, 0.5)";
  } else if (isVolRise) {
    // 放量拉升 → 橙红色（量价齐升·强势确认）
    bgColor = "rgba(234, 88, 12, 0.30)";
    borderColor = "rgba(234, 88, 12, 1)";
    textColor = "#ffffff";
    iconColor = "#ea580c";
    glowColor = "rgba(234, 88, 12, 0.5)";
  } else if (isShrinkRise) {
    // 缩量拉升 → 黄色警告（量价背离·警惕回调）
    bgColor = "rgba(202, 138, 4, 0.30)";
    borderColor = "rgba(202, 138, 4, 1)";
    textColor = "#ffffff";
    iconColor = "#ca8a04";
    glowColor = "rgba(202, 138, 4, 0.5)";
  } else if (isPulseRise) {
    // 脉冲上涨 → 橙色（短线冲高·不追涨）
    bgColor = "rgba(249, 115, 22, 0.30)";
    borderColor = "rgba(249, 115, 22, 1)";
    textColor = "#ffffff";
    iconColor = "#f97316";
    glowColor = "rgba(249, 115, 22, 0.5)";
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
  // early_vol_drop & wash_trade: wider pill + larger font for maximum visibility
  // (moved up before boundary clamping so pillW/pillH are available)
  const isBigLabel = isEarlyVolDrop || isWashTrade || isVolRise || isShrinkRise || isPulseRise;
  const estimatedCharWidth = isBigLabel ? 8 : 7.5;
  const pillW = isBigLabel ? Math.max(100, Math.min(220, Math.round(displayLabel.length * estimatedCharWidth + 10))) : Math.max(84, Math.min(160, Math.round(displayLabel.length * estimatedCharWidth + 8)));
  const pillH = 16;
  const pillRx = 4;

  return (
    <g key={`pv-${marker.type}-${idx}`}>
      {/* Connecting line from price point to label (may be offset horizontally) */}
      <line
        x1={x} y1={y} x2={labelX} y2={labelY}
        stroke={borderColor} strokeWidth={isBigLabel ? 1.5 : 1} strokeDasharray={isBigLabel ? "3 2" : "3 2"}
      />
      {/* Marker dot on price line */}
      <circle
        cx={x} cy={y} r={isBigLabel ? 7 : 6}
        fill={bgColor} stroke={iconColor} strokeWidth={isBigLabel ? 2.5 : 2}
      />
      {/* Pulsing glow ring around dot */}
      <circle
        cx={x} cy={y} r={isBigLabel ? 11 : 9}
        fill="none" stroke={glowColor} strokeWidth={isBigLabel ? 2 : 1.5}
        strokeDasharray="2 2" opacity={isBigLabel ? 0.9 : 0.7}
      />
      {isBigLabel && (
        <circle
          cx={x} cy={y} r={15}
          fill="none" stroke={glowColor} strokeWidth={1}
          strokeDasharray="3 3" opacity={0.4}
        />
      )}
      {/* Icon inside dot */}
      <text
        x={x} y={y + 1}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={isBigLabel ? 8 : 7} fill={isBigLabel ? "#ffffff" : iconColor} fontWeight="bold"
      >
        {isEarlyVolDrop ? "⚠" : isWashTrade ? "✓" : isVolRise ? "▲" : isPulseRise ? "⚡" : isShrinkRise ? "!" : isPulse ? "⚡" : isPulseDecline ? "📉" : isProgressiveVol ? "📈" : isVolumeDecline ? "▼" : "▲"}
      </text>
      {/* White glow behind label pill for readability */}
      <rect
        x={labelX - pillW / 2 - 1.5} y={(isAbove ? labelY - pillH / 2 - 2 : labelY - 2) - 1.5}
        width={pillW + 3} height={pillH + 3}
        rx={pillRx + 1} ry={pillRx + 1}
        fill={isBigLabel ? "rgba(0,0,0,0.5)" : "white"} fillOpacity={isBigLabel ? 0.5 : 0.85}
      />
      {/* Label background pill */}
      <rect
        x={labelX - pillW / 2} y={isAbove ? labelY - pillH / 2 - 2 : labelY - 2}
        width={pillW} height={pillH}
        rx={pillRx} ry={pillRx}
        fill={isEarlyVolDrop ? "rgba(239, 68, 68, 0.9)" : isWashTrade ? "rgba(59, 130, 246, 0.9)" : isVolRise ? "rgba(234, 88, 12, 0.9)" : isPulseRise ? "rgba(249, 115, 22, 0.9)" : isShrinkRise ? "rgba(202, 138, 4, 0.9)" : bgColor} stroke={borderColor} strokeWidth={isBigLabel ? 1.5 : 1}
      />
      {/* Label text */}
      <text
        x={labelX} y={isAbove ? labelY + (isBigLabel ? 0 : 1) : labelY + 7}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={isBigLabel ? 9 : 9} fontWeight={isBigLabel ? 800 : 700} fill={isBigLabel ? "#ffffff" : textColor}
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
): { signalElements: React.ReactNode[]; bubbleElements: React.ReactNode[] } | null {
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
  const MERGE_DISTANCE_X = 30;
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

  // ── Step 3: Only strong signals get text labels ──
  const labelRects: { x: number; y: number; width: number; height: number }[] = [];

  function overlapsAny(rect: { x: number; y: number; width: number; height: number }, rects: typeof labelRects): boolean {
    for (const r of rects) {
      if (rect.x < r.x + r.width && rect.x + rect.width > r.x &&
          rect.y < r.y + r.height && rect.y + rect.height > r.y) {
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
  }

  const labelPlans: LabelPlan[] = [];
  const assignedLabels = new Map<number, LabelPlan>();

  const strongIndices = merged
    .map((_, i) => i)
    .filter((i) => merged[i].strength === "strong")
    .sort((a, b) => merged[a].x - merged[b].x);

  for (const idx of strongIndices) {
    const m = merged[idx];
    const isBuy = m.direction === "up";

    let labelText: string;
    const fmtCustom = (text: string) => m.customReasons?.has(text) ? `自定义[${text}]` : text;
    if (m.count >= 3) {
      labelText = fmtCustom(`${m.reasons[0]} ×${m.count}`);
    } else if (m.count === 2) {
      const combined = m.reasons.slice(0, 2).join("/");
      labelText = fmtCustom(combined.length > 6 ? `${m.reasons[0]}+1` : combined);
    } else {
      labelText = fmtCustom(m.reasons[0]);
    }

    const labelFontSize = 8;
    let textWidth = 0;
    for (const ch of labelText) {
      textWidth += ch.charCodeAt(0) > 127 ? labelFontSize : labelFontSize * 0.55;
    }
    const padX = 4;
    const labelW = textWidth + padX * 2;
    const labelH = 14;

    const markerOffset = 30;
    const labelGap = 14;
    let labelY: number;
    if (isBuy) {
      labelY = m.y + markerOffset + labelGap;
    } else {
      labelY = m.y - markerOffset - labelGap - labelH;
    }

    // Boundary clamping for signal labels
    if (labelY < 2) labelY = 2;
    if (labelY + labelH > 610) labelY = 610 - labelH;

    let labelRect = { x: m.x - labelW / 2, y: labelY, width: labelW, height: labelH };

    // Horizontal boundary clamping
    if (labelRect.x < 5) labelRect = { ...labelRect, x: 5 };
    if (labelRect.x + labelRect.width > 895) labelRect = { ...labelRect, x: 895 - labelRect.width };

    let placed = false;
    if (!overlapsAny(labelRect, labelRects)) {
      placed = true;
    } else {
      const shifted = { ...labelRect, x: labelRect.x + labelRect.width * 0.6 };
      if (!overlapsAny(shifted, labelRects)) {
        labelRect = shifted;
        placed = true;
      } else {
        const shiftedL = { ...labelRect, x: labelRect.x - labelRect.width * 0.6 };
        if (!overlapsAny(shiftedL, labelRects)) {
          labelRect = shiftedL;
          placed = true;
        }
      }
    }

    if (!placed) {
      const sfmt = (text: string) => m.customReasons?.has(text) ? `自定义[${text}]` : text;
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

    if (placed) {
      labelRects.push(labelRect);
    }

    assignedLabels.set(idx, { merged: m, labelRect: placed ? labelRect : null, labelText, showLabel: placed });
  }

  for (let i = 0; i < merged.length; i++) {
    if (assignedLabels.has(i)) continue;
    assignedLabels.set(i, { merged: merged[i], labelRect: null, labelText: "", showLabel: false });
  }

  for (let i = 0; i < merged.length; i++) {
    labelPlans.push(assignedLabels.get(i)!);
  }

  // ── Step 4: Render ──
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

  const signalElements = labelPlans.map((plan, i) => {
    const m = plan.merged;
    const isBuy = m.direction === "up";
    const isStoploss = m.type === "stoploss";

    let markerColor: string;
    let labelBgColor: string;
    let badgeColor: string;
    let badgeTextColor: string;

    if (m.isCustom) {
      if (m.strength === "strong") {
        markerColor = isBuy ? "#8b5cf6" : "#a78bfa";
        labelBgColor = isBuy ? "#5b21b6" : "#6d28d9";
        badgeColor = markerColor;
        badgeTextColor = "white";
      } else if (m.strength === "medium") {
        markerColor = "#c084fc";
        badgeColor = markerColor;
        badgeTextColor = "white";
      } else {
        markerColor = "#a78bfa";
        badgeColor = "#a78bfa";
        badgeTextColor = "white";
      }
    } else if (m.strength === "strong") {
      markerColor = isStoploss ? "#f59e0b" : isBuy ? "#ef4444" : "#22c55e";
      labelBgColor = isStoploss ? "#92400e" : isBuy ? "#991b1b" : "#166534";
      badgeColor = markerColor;
      badgeTextColor = "white";
    } else if (m.strength === "medium") {
      markerColor = isStoploss ? "#d97706" : isBuy ? "#f97316" : "#06b6d4";
      badgeColor = markerColor;
      badgeTextColor = "white";
    } else {
      markerColor = "#9ca3af";
      badgeColor = "#9ca3af";
      badgeTextColor = "white";
    }

    if (m.strength === "strong") {
      const markerSize = 6;
      const badgeCx = m.x + markerSize + 4;
      const badgeCy = isBuy ? m.y - markerSize * 0.3 : m.y + markerSize * 0.3;
      const { badgeSvg, bubbleSvg } = renderCountBadge(m, badgeCx, badgeCy, badgeColor, badgeTextColor);
      if (bubbleSvg) bubbleElements.push(bubbleSvg);
      return (
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
                strokeWidth={1}
                strokeDasharray="3 2"
                opacity={0.8}
              />
              <rect
                x={plan.labelRect.x - 1}
                y={plan.labelRect.y - 1}
                width={plan.labelRect.width + 2}
                height={plan.labelRect.height + 2}
                rx={4}
                fill="none"
                stroke="white"
                strokeWidth={1.5}
                strokeOpacity={0.3}
              />
              <rect
                x={plan.labelRect.x}
                y={plan.labelRect.y}
                width={plan.labelRect.width}
                height={plan.labelRect.height}
                rx={3}
                fill={labelBgColor}
                fillOpacity={0.92}
                stroke={m.isCustom ? "#c084fc" : markerColor}
                strokeWidth={m.isCustom ? 0.8 : 0.5}
                strokeDasharray={m.isCustom ? "2 1" : "none"}
                strokeOpacity={m.isCustom ? 1 : 0.4}
              />
              <text
                x={plan.labelRect.x + plan.labelRect.width / 2}
                y={plan.labelRect.y + plan.labelRect.height / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="white"
                fontSize={8}
                fontWeight="600"
              >
                {plan.labelText}
              </text>
            </>
          )}
        </g>
      );
    } else if (m.strength === "medium") {
      const dotRadius = 6;
      const badgeCx = m.x + dotRadius + 4;
      const badgeCy = m.y - dotRadius + 1;
      const { badgeSvg, bubbleSvg } = renderCountBadge(m, badgeCx, badgeCy, badgeColor, badgeTextColor);
      if (bubbleSvg) bubbleElements.push(bubbleSvg);
      return (
        <g key={`tl-sig-${m.originalIndex}-${i}`}>
          <circle
            cx={m.x}
            cy={m.y}
            r={dotRadius}
            fill={markerColor}
            fillOpacity={0.85}
            stroke="white"
            strokeWidth={0.7}
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
        </g>
      );
    } else {
      const dotRadius = 4;
      return (
        <g key={`tl-sig-${m.originalIndex}-${i}`}>
          <circle
            cx={m.x}
            cy={m.y}
            r={dotRadius}
            fill={markerColor}
            fillOpacity={0.65}
            stroke="white"
            strokeWidth={0.5}
          />
        </g>
      );
    }
  });

  return { signalElements, bubbleElements };
}

// ── Intent segment overlay removed — intent segments now rendered as an external bar outside the chart ──

// ── Combined Chart Overlay Renderer ──────────────────────
// Ensures proper layer order:
//   Layer 1 (bottom): 分时因子 signal markers & labels
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

  // Compute signal elements (factor signals)
  const signalResult = computeTimelineSignalElements(
    formattedGraphicalItems, xAxisMap, yAxisMap, expandedIds, toggleExpand
  );

  // Compute PV marker points (screener markers)
  const pvPoints = extractPulseVolumePoints(formattedGraphicalItems);

  // Resolve PV label overlaps
  const pvPlacedLabels = pvPoints.length > 0 ? resolvePvLabelOverlaps(pvPoints) : [];

  if (!signalResult && pvPoints.length === 0) return null;

  return (
    <g>
      {/* Layer 1: 分时因子 signal markers & labels */}
      {signalResult?.signalElements}
      {/* Layer 2 (middle): 选股标记 pulse/volume markers — ON TOP of factor signals */}
      {pvPlacedLabels.length > 0 && (
        <g className="pulse-volume-markers">
          {pvPlacedLabels.map((p) => renderPulseVolumeMarker(p.x, p.y, p.marker, p.idx, p.adjustedLabelY, p.adjustedX))}
        </g>
      )}
      {/* Layer 3 (top): Expanded bubbles — interactive, must be on top for usability */}
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

  // Signals: compare length + last signal type/reason
  const ps = prev.signals, ns = next.signals;
  if (ps.length !== ns.length) return false;
  if (ps.length > 0) {
    const pSig = ps[ps.length - 1], nSig = ns[ns.length - 1];
    if (pSig?.type !== nSig?.type || pSig?.reason !== nSig?.reason) return false;
  }

  // MACD data: compare length
  if (prev.macdData.length !== next.macdData.length) return false;

  // Key price levels: compare length
  if ((prev.keyPriceLevels?.length || 0) !== (next.keyPriceLevels?.length || 0)) return false;

  // PV markers: compare length
  if ((prev.pvMarkers?.length || 0) !== (next.pvMarkers?.length || 0)) return false;

  // Regime objects: compare regime string
  if (prev.szIndexRegime?.regime !== next.szIndexRegime?.regime) return false;
  if (prev.sectorRegime?.regime !== next.sectorRegime?.regime) return false;
  if (prev.sectorInfo?.code !== next.sectorInfo?.code) return false;

  // Index timeline data: compare items length for active key
  const prevIdxData = prev.indexTimelineData?.[prev.activeIndexKey || "sz"];
  const nextIdxData = next.indexTimelineData?.[next.activeIndexKey || "sz"];
  if ((prevIdxData?.items.length || 0) !== (nextIdxData?.items.length || 0)) return false;

  // Sector timeline data: compare items length
  if ((prev.sectorTimelineData?.items.length || 0) !== (next.sectorTimelineData?.items.length || 0)) return false;

  // Callbacks and config are stable refs (useCallback in parent)
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
  pvMarkers,
  stockName,
  indexTimelineData,
  sectorTimelineData,
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
  pvMarkers?: PulseVolumeMarker[];
  stockName?: string;
  indexTimelineData?: Record<string, { items: TimelineItem[]; prevClose: number }>;
  sectorTimelineData?: { items: TimelineItem[]; prevClose: number };
}) {
  // ── Build full-day timeline template (240 minutes total) ──
  // A-share trading day: 09:30-11:30 (120min) + 13:00-15:00 (120min)
  const { fullDayData, timeTicks } = useMemo(() => {
    if (data.length === 0) return { fullDayData: [], timeTicks: [] };

    // Use pre-computed allTimes array (constant for A-share)
    const allTimes = ALL_TRADE_TIMES;

    // Build signal map by time
    const signalByTime = new Map<string, TSignal>();
    signals.forEach((s, i) => {
      if (s && data[i]) signalByTime.set(data[i].time, s);
    });

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
  }, [data, prevClose, signals, macdData, pvMarkers]);

  // ── Crosshair state: shared across all three panels ──
  const [crosshairIdx, setCrosshairIdx] = useState<number | null>(null);
  const deferredCrosshairIdx = useDeferredValue(crosshairIdx);

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
      zd = fullDayData.slice(startIdx, endIdx + 1);
      zd = zd.map((item, i) => ({ ...item, idx: i }));
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
  }, [fullDayData, data, visibleMinutes, panOffset, timeTicks, prevClose, signals, macdData]);

  // ── Crosshair item (must be after zoomData is computed) ──
  const crosshairItem = deferredCrosshairIdx != null && deferredCrosshairIdx >= 0 && deferredCrosshairIdx < zoomData.length
    ? zoomData[deferredCrosshairIdx]
    : null;

  // ── Memoize detectMarketRegimeDetail (was called inside IIFE on every render) ──
  const regimeDetail = useMemo(() => detectMarketRegimeDetail(data, prevClose), [data, prevClose]);

  // ── Intraday institutional intent analysis ──
  const intradayIntent = useMemo(() => {
    if (data.length < 20 || prevClose <= 0) return null;
    return analyzeIntradayIntent(data, prevClose);
  }, [data, prevClose]);

  // ── Memoize tooltip components (stable references to avoid re-renders) ──
  const timelineTooltipEl = useMemo(() => <TimelineTooltip />, []);
  const volumeTooltipEl = useMemo(() => <TimelineVolumeTooltip />, []);
  const macdTooltipEl = useMemo(() => <TimelineMACDTooltip />, []);
  const tooltipWrapperStyle = useMemo(() => ({ background: 'transparent' as const, border: 'none' as const }), []);

  if (data.length === 0) return null;

  return (
    <div
      ref={chartContainerRef}
      className="bg-card rounded-lg border border-border"
    >
      {/* ─── Early Morning Volume Drop DANGER Banner (禁止买入) ─── */}
      {pvMarkers && pvMarkers.some(m => m.type === "early_vol_drop") && (() => {
        const earlyDrop = pvMarkers.find(m => m.type === "early_vol_drop")!;
        const isExtreme = Math.abs(earlyDrop.score) >= 60;
        const isHigh = Math.abs(earlyDrop.score) >= 40;
        return (
          <div className={`relative overflow-hidden ${isExtreme ? 'bg-red-600' : isHigh ? 'bg-red-500' : 'bg-red-500/90'}`}>
            {/* Animated diagonal stripes for extreme danger */}
            {isExtreme && (
              <div className="stripe-move absolute inset-0 opacity-20" style={{
                backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(0,0,0,0.3) 8px, rgba(0,0,0,0.3) 16px)',
              }} />
            )}
            <div className="relative px-4 py-2 flex items-center justify-center gap-3">
              <span className="text-white text-base animate-pulse">🚫</span>
              <span className="text-white text-sm font-black tracking-wide">
                {isExtreme ? '极危(一级警告)！' : '危险(二级警告)！'}早盘放量下跌，禁止买入！
              </span>
              <span className="text-white/80 text-xs font-semibold border-l border-white/40 pl-3">
                {earlyDrop.detail}
              </span>
              <span className="text-white/60 text-[10px] font-mono">
                {Math.abs(earlyDrop.score)}分
              </span>
            </div>
          </div>
        );
      })()}

      {/* ─── Wash Trade / Shakeout Banner (洗盘-低吸机会) ─── */}
      {pvMarkers && pvMarkers.some(m => m.type === "wash_trade") && (() => {
        const washMarker = pvMarkers.find(m => m.type === "wash_trade")!;
        const isConfirmed = washMarker.score >= 50;
        return (
          <div className={`relative overflow-hidden ${isConfirmed ? 'bg-blue-600' : 'bg-blue-500/90'}`}>
            <div className="relative px-4 py-2 flex items-center justify-center gap-3">
              <span className="text-white text-base">{isConfirmed ? '✅' : '🔍'}</span>
              <span className="text-white text-sm font-bold tracking-wide">
                {isConfirmed ? '洗盘确认！' : '疑似洗盘'}急跌后快速拉回，可关注低吸机会
              </span>
              <span className="text-white/80 text-xs font-semibold border-l border-white/40 pl-3">
                {washMarker.detail}
              </span>
              <span className="text-white/60 text-[10px] font-mono">
                {washMarker.score}分
              </span>
            </div>
          </div>
        );
      })()}

      {/* Header - 同花顺 style info bar */}
      <div className="px-3 py-2 border-b border-border/50 flex items-center gap-3 text-xs flex-wrap">
        <span className="font-medium text-sm text-foreground">{symbol}</span>
        <span className={`font-bold tabular-nums ${lastItem.changePercent >= 0 ? "text-red-500" : "text-green-500"}`}>
          {lastItem.price.toFixed(2)}
        </span>
        <span className={`tabular-nums ${lastItem.changePercent >= 0 ? "text-red-500" : "text-green-500"}`}>
          {lastItem.changePercent >= 0 ? "+" : ""}{lastItem.changePercent.toFixed(2)}%
        </span>
        {/* Position Rule Badge - 5-tier ladder + T-direction hint */}
        {(() => {
          const stockPct = lastItem.changePercent;
          const sectorDown = sectorRegime?.regime === '下跌趋势' || sectorRegime?.regime === '横盘末期';
          const stockDown = stockPct < 0;
          const sectorUp = sectorRegime?.regime === '上升通道';
          const stockUp = stockPct >= 0;
          const hasSectorInfo = !!sectorRegime;

          // 大盘方向（深证成指为主）
          const mktDown = szIndexRegime?.regime === '下跌趋势' || szIndexRegime?.regime === '横盘末期';
          const mktUp = szIndexRegime?.regime === '上升通道';
          const hasMktInfo = !!szIndexRegime;

          let posLabel = '';
          let posColor = '';
          let posBg = '';
          let tDir = ''; // T-strategy hint: 正T / 反T / 空仓

          // ── 5-tier position ladder + T-direction ──
          if (hasMktInfo && mktDown && hasSectorInfo && sectorDown && stockDown) {
            // 一级：三跌 → ≤1/4仓，反T(先卖再买)/空仓
            posLabel = '1/4仓';
            tDir = '反T';
            posColor = 'text-red-700 dark:text-red-300';
            posBg = 'bg-red-500/20 border-red-500/40';
          } else if (hasMktInfo && mktDown && hasSectorInfo && sectorDown && stockUp) {
            // 二级：大盘↓+板块↓+个股↑ → ≤1/3仓，反T(先卖再买)冲高卖
            posLabel = '1/3仓';
            tDir = '反T';
            posColor = 'text-red-600 dark:text-red-400';
            posBg = 'bg-red-500/15 border-red-500/30';
          } else if (hasMktInfo && mktDown && hasSectorInfo && sectorUp && stockDown) {
            // 三级：大盘↓+板块↑+个股↓ → 15-20%，轻仓正T
            posLabel = '20%仓';
            tDir = '正T';
            posColor = 'text-amber-600 dark:text-amber-400';
            posBg = 'bg-amber-500/15 border-amber-500/30';
          } else if (hasMktInfo && mktDown && hasSectorInfo && sectorUp && stockUp) {
            // 三级：大盘↓+板块↑+个股↑ → 20-30%，反T(先卖再买)
            posLabel = '25%仓';
            tDir = '反T';
            posColor = 'text-yellow-600 dark:text-yellow-400';
            posBg = 'bg-yellow-500/15 border-yellow-500/30';
          } else if (hasMktInfo && mktUp && hasSectorInfo && sectorDown && stockDown) {
            // 二级：大盘↑+板块↓+个股↓ → ≤1/3，正T低吸
            posLabel = '1/3仓';
            tDir = '正T';
            posColor = 'text-orange-600 dark:text-orange-400';
            posBg = 'bg-orange-500/15 border-orange-500/30';
          } else if (hasMktInfo && mktUp && hasSectorInfo && sectorDown && stockUp) {
            // 三级：大盘↑+板块↓+个股↑ → 25-30%，反T(先卖再买)冲高卖
            posLabel = '30%仓';
            tDir = '反T';
            posColor = 'text-yellow-600 dark:text-yellow-400';
            posBg = 'bg-yellow-500/15 border-yellow-500/30';
          } else if (hasMktInfo && mktUp && hasSectorInfo && sectorUp && stockDown) {
            // 四级：大盘↑+板块↑+个股↓ → 25-30%，正T低吸
            posLabel = '30%仓';
            tDir = '正T';
            posColor = 'text-blue-600 dark:text-blue-400';
            posBg = 'bg-blue-500/15 border-blue-500/30';
          } else if (hasMktInfo && mktUp && hasSectorInfo && sectorUp && stockUp) {
            // 五级：三涨 → 90-100%，正T/反T(先卖再买)均可
            posLabel = '满仓';
            tDir = '正反T';
            posColor = 'text-green-600 dark:text-green-400';
            posBg = 'bg-green-500/15 border-green-500/30';
          } else if (!hasMktInfo && hasSectorInfo && sectorDown && stockDown) {
            // 二级回退：双跌 → ≤1/3
            posLabel = '1/3仓';
            tDir = '反T';
            posColor = 'text-red-600 dark:text-red-400';
            posBg = 'bg-red-500/15 border-red-500/30';
          } else if (!hasMktInfo && hasSectorInfo && sectorDown && stockUp) {
            posLabel = '25%仓';
            tDir = '反T';
            posColor = 'text-amber-600 dark:text-amber-400';
            posBg = 'bg-amber-500/15 border-amber-500/30';
          } else if (!hasMktInfo && hasSectorInfo && sectorUp && stockUp) {
            posLabel = '75%仓';
            tDir = '正T';
            posColor = 'text-green-600 dark:text-green-400';
            posBg = 'bg-green-500/15 border-green-500/30';
          } else if (!hasMktInfo && hasSectorInfo && sectorUp && stockDown) {
            posLabel = '25%仓';
            tDir = '正T';
            posColor = 'text-yellow-600 dark:text-yellow-400';
            posBg = 'bg-yellow-500/15 border-yellow-500/30';
          } else if (!hasSectorInfo && stockDown) {
            posLabel = '轻仓';
            tDir = '观望';
            posColor = 'text-amber-600 dark:text-amber-400';
            posBg = 'bg-amber-500/10 border-amber-500/25';
          } else if (!hasSectorInfo && stockUp) {
            posLabel = '可参与';
            tDir = '正T';
            posColor = 'text-green-600 dark:text-green-400';
            posBg = 'bg-green-500/10 border-green-500/25';
          } else {
            posLabel = '轻仓';
            tDir = '观望';
            posColor = 'text-gray-500 dark:text-gray-400';
            posBg = 'bg-gray-500/10 border-gray-500/25';
          }

          const mktDir = hasMktInfo ? (mktDown ? '↓' : mktUp ? '↑' : '—') : '…';
          const secDir = hasSectorInfo ? (sectorDown ? '↓' : sectorUp ? '↑' : '—') : '…';
          const stkDir = stockDown ? '↓' : '↑';

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
        {/* Market Index Regime Badge - click to cycle 深/沪/创 */}
        {szIndexRegime && (() => {
          const cfg = REGIME_CONFIG[szIndexRegime.regime] || REGIME_CONFIG["震荡市"];
          const idxInfo = indexConfig?.[activeIndexKey || "sz"];
          const shortLabel = idxInfo?.shortLabel || "深";
          const fullLabel = idxInfo?.label || "深证成指";
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
        {/* Sector Regime Badge - shows industry sector trend */}
        {sectorRegime && sectorInfo && (() => {
          const cfg = REGIME_CONFIG[sectorRegime.regime] || REGIME_CONFIG["震荡市"];
          // Truncate sector name for display (max 4 chars)
          const shortName = sectorInfo.name.length > 4 ? sectorInfo.name.slice(0, 4) : sectorInfo.name;
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
        })()}
        {lastSignal && (
          <Badge variant={lastSignal.type === "buy" ? "default" : lastSignal.type === "stoploss" ? "outline" : "destructive"} className="text-[10px] h-5">
            {lastSignal.type === "buy" ? "买入" : lastSignal.type === "stoploss" ? "止损" : "卖出"} · {lastSignal.reason}
          </Badge>
        )}
        {/* Time Window Indicator */}
        {(() => {
          const lastTime = data[data.length - 1]?.time;
          if (lastTime) {
            const tw = getTimeWindow(lastTime);
            const twColor = tw === "开盘观察" || tw === "尾盘不操作" ? "text-muted-foreground" :
                            tw.includes("卖出") ? "text-green-500" : "text-red-500";
            return (
              <span className={`text-[10px] ${twColor}`}>
                {tw}
              </span>
            );
          }
          return null;
        })()}
        {/* Crosshair data display */}
        {crosshairItem?.hasData && (() => {
          const pct = crosshairItem.changePercent;
          const isUp = pct >= 0;
          return (
            <span className="flex items-center gap-2 text-[10px] tabular-nums">
              <span className="text-muted-foreground">{crosshairItem.time}</span>
              <span className={isUp ? "text-red-600" : "text-green-600"}>{crosshairItem.price?.toFixed(2)}</span>
              <span className={isUp ? "text-red-600" : "text-green-600"}>{isUp ? "+" : ""}{pct?.toFixed(2)}%</span>
              {crosshairItem.volume > 0 && (
                <>
                  <span className="text-muted-foreground">Vol {formatVolume(crosshairItem.volume)}</span>
                  <span className="text-yellow-500">Amt {formatAmount(crosshairItem.volume * 100 * crosshairItem.price)}</span>
                </>
              )}
              {crosshairItem.dif != null && (
                <span className="text-blue-600">DIF {crosshairItem.dif.toFixed(3)}</span>
              )}
              {crosshairItem.dea != null && (
                <span className="text-orange-600">DEA {crosshairItem.dea.toFixed(3)}</span>
              )}
              {crosshairItem.macd != null && (
                <span className={crosshairItem.macd >= 0 ? "text-red-600" : "text-green-600"}>MACD {crosshairItem.macd.toFixed(3)}</span>
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

      {/* ─── Position Rule Banner on Chart (5-tier + T-direction) ─── */}
      {/* 中国股市颜色惯例：红=涨，绿=跌 */}
      {(() => {
        const lastPoint = data[data.length - 1];
        const stockPct = lastPoint?.changePercent ?? 0;
        const sectorDown = sectorRegime?.regime === '下跌趋势' || sectorRegime?.regime === '横盘末期';
        const stockDown = stockPct < 0;
        const sectorUp = sectorRegime?.regime === '上升通道';
        const stockUp = stockPct >= 0;
        const hasSectorInfo = !!sectorRegime;

        // 大盘方向（深证成指为主）
        const mktDown = szIndexRegime?.regime === '下跌趋势' || szIndexRegime?.regime === '横盘末期';
        const mktUp = szIndexRegime?.regime === '上升通道';
        const hasMktInfo = !!szIndexRegime;

        // 三维场景判断
        const isTripleDown = hasMktInfo && mktDown && hasSectorInfo && sectorDown && stockDown;
        const isTripleUp = hasMktInfo && mktUp && hasSectorInfo && sectorUp && stockUp;

        // 三跌：绿色系（跌=绿）
        if (isTripleDown) {
          return (
            <div className="px-3 py-1.5 bg-green-500/15 border-b border-green-500/25 flex items-center justify-center gap-2">
              <span className="text-green-500 text-xs">🚫</span>
              <span className="text-xs font-bold text-green-700 dark:text-green-300">
                三跌！深证↓+板块↓+个股↓ ≤ 1/4仓
              </span>
              <span className="text-[10px] text-green-400 font-bold">| 反T(先卖再买)/空仓</span>
              <span className="text-[10px] text-green-500/70">极度危险，保留3/4后备</span>
            </div>
          );
        }
        // 三涨：红色系（涨=红）
        if (isTripleUp) {
          return (
            <div className="px-3 py-1.5 bg-red-500/10 border-b border-red-500/20 flex items-center justify-center gap-2">
              <span className="text-red-500 text-xs">✅</span>
              <span className="text-xs font-bold text-red-600 dark:text-red-400">
                三涨！深证↑+板块↑+个股↑ 90-100%仓
              </span>
              <span className="text-[10px] text-red-400 font-bold">| 正T/反T(先卖再买)均可</span>
              <span className="text-[10px] text-red-500/70">最安全，积极做T</span>
            </div>
          );
        }
        // 双跌：绿色系（跌=绿）
        const isDualDown = (hasMktInfo ? mktDown : true) && hasSectorInfo && sectorDown && stockDown;
        if (isDualDown && !isTripleDown) {
          return (
            <div className="px-3 py-1.5 bg-green-500/10 border-b border-green-500/20 flex items-center justify-center gap-2">
              <span className="text-green-500 text-xs">⛔</span>
              <span className="text-xs font-bold text-green-600 dark:text-green-400">
                {hasMktInfo ? '深证↓+' : ''}板块↓+个股↓ = 双跌！≤ 1/3仓
              </span>
              <span className="text-[10px] text-amber-400 font-bold">| 反T(先卖再买)冲高卖</span>
              <span className="text-[10px] text-green-500/70">保留2/3后备资金</span>
            </div>
          );
        }
        // 大盘↓+板块↑+个股↑ (逆势走强)：黄色系（谨慎）
        if (hasMktInfo && mktDown && hasSectorInfo && sectorUp && stockUp) {
          return (
            <div className="px-3 py-1.5 bg-yellow-500/10 border-b border-yellow-500/20 flex items-center justify-center gap-2">
              <span className="text-yellow-500 text-xs">🔸</span>
              <span className="text-xs font-bold text-yellow-600 dark:text-yellow-400">
                深证↓ 但板块↑+个股↑ 20-30%仓
              </span>
              <span className="text-[10px] text-green-400 font-bold">| 反T(先卖再买)冲高卖</span>
              <span className="text-[10px] text-yellow-500/70">大盘压制，适度参与</span>
            </div>
          );
        }
        // 大盘↑+板块↓+个股↓ (大盘好但个股弱)：绿色系（个股跌=绿）
        if (hasMktInfo && mktUp && hasSectorInfo && sectorDown && stockDown) {
          return (
            <div className="px-3 py-1.5 bg-green-500/8 border-b border-green-500/15 flex items-center justify-center gap-2">
              <span className="text-green-500 text-xs">⚠️</span>
              <span className="text-xs font-bold text-green-600 dark:text-green-400">
                深证↑ 但板块↓+个股↓ ≤ 1/3仓
              </span>
              <span className="text-[10px] text-red-400 font-bold">| 正T低吸</span>
              <span className="text-[10px] text-green-500/70">大盘支撑但板块弱势</span>
            </div>
          );
        }
        // 大盘↑+板块↑+个股↓ (回调低吸)：红色系（大盘+板块涨=红）
        if (hasMktInfo && mktUp && hasSectorInfo && sectorUp && stockDown) {
          return (
            <div className="px-3 py-1.5 bg-red-500/8 border-b border-red-500/15 flex items-center justify-center gap-2">
              <span className="text-red-500 text-xs">🔹</span>
              <span className="text-xs font-bold text-red-600 dark:text-red-400">
                深证↑+板块↑+个股↓ 25-30%仓
              </span>
              <span className="text-[10px] text-red-400 font-bold">| 正T低吸良机</span>
              <span className="text-[10px] text-red-500/70">大盘+板块支撑</span>
            </div>
          );
        }
        // 板块↓+个股↑ (无大盘数据或大盘震荡)：琥珀色（逆板块走强需谨慎）
        if (hasSectorInfo && sectorDown && stockUp) {
          return (
            <div className="px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-center gap-2">
              <span className="text-amber-500 text-xs">⚠️</span>
              <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                板块↓+个股↑ 20-30%仓
              </span>
              <span className="text-[10px] text-red-400 font-bold">| 反T(先卖再买)冲高卖</span>
              <span className="text-[10px] text-amber-500/70">逆板块走强需谨慎</span>
            </div>
          );
        }
        // 板块↑+个股↓ (回调低吸)：红色系（板块涨=红）
        if (hasSectorInfo && sectorUp && stockDown) {
          return (
            <div className="px-3 py-1.5 bg-red-500/8 border-b border-red-500/15 flex items-center justify-center gap-2">
              <span className="text-red-500 text-xs">🔻</span>
              <span className="text-xs font-bold text-red-600 dark:text-red-400">
                板块↑+个股↓ {hasMktInfo && mktUp ? '25-30%' : '20-30%'}仓
              </span>
              <span className="text-[10px] text-red-400 font-bold">| 正T低吸</span>
              <span className="text-[10px] text-red-500/70">回调可低吸</span>
            </div>
          );
        }
        // 无板块信息 - 仅大盘+个股
        if (!hasSectorInfo && hasMktInfo && mktDown && stockDown) {
          return (
            <div className="px-3 py-1.5 bg-green-500/5 border-b border-green-500/10 flex items-center justify-center gap-2">
              <span className="text-green-500 text-xs">🔻</span>
              <span className="text-xs font-medium text-green-600/80 dark:text-green-400/80">
                深证↓+个股↓，大盘弱势注意控仓
              </span>
              <span className="text-[10px] text-green-400 font-bold">| 反T(先卖再买)</span>
            </div>
          );
        }
        if (!hasSectorInfo && stockDown) {
          return (
            <div className="px-3 py-1.5 bg-green-500/5 border-b border-green-500/10 flex items-center justify-center gap-2">
              <span className="text-green-500 text-xs">🔻</span>
              <span className="text-xs font-medium text-green-600/80 dark:text-green-400/80">
                个股下跌，注意控制仓位
              </span>
            </div>
          );
        }
        return null;
      })()}

      {/* ─── Panel 1: Price Chart ─── */}
      <div className="relative" style={{ overflow: 'visible' }}>
        <ResponsiveContainer width="100%" height={isZoomed ? 720 : 620}>
          <ComposedChart
            data={zoomData}
            margin={{ top: 50, right: 82, left: 2, bottom: 8 }}
            onMouseMove={(state: any) => {
              if (state?.activeTooltipIndex != null) {
                setCrosshairIdx(state.activeTooltipIndex);
              }
            }}
            onMouseLeave={() => setCrosshairIdx(null)}
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
              tickFormatter={(v: number) => v.toFixed(2)}
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
            {/* ── 交易时间窗口色带（根据交易规矩五时段划分） ── */}
            {!isZoomed && (() => {
              // 找到每个时间段在 zoomData 中的索引范围
              const findIdxByTime = (targetTime: string) => {
                for (let i = 0; i < zoomData.length; i++) {
                  if (zoomData[i].time >= targetTime) return i;
                }
                return -1;
              };
              const windows = [
                { start: "09:30", end: "10:00", label: "⚠ 早盘观察期", sublabel: "仓位减半", color: "rgba(245,158,11,0.06)", textColor: "#b45309" },
                { start: "10:00", end: "11:30", label: "✅ 上午操作期", sublabel: "按仓位表执行", color: "rgba(34,197,94,0.05)", textColor: "#166534" },
                { start: "13:00", end: "14:00", label: "🔸 午盘确认期", sublabel: "观察方向", color: "rgba(234,179,8,0.05)", textColor: "#a16207" },
                { start: "14:00", end: "14:30", label: "⚠ 尾盘决策期", sublabel: "准备清仓", color: "rgba(249,115,22,0.06)", textColor: "#c2410c" },
                { start: "14:30", end: "15:00", label: "🚫 收盘冲刺期", sublabel: "必须闭环", color: "rgba(239,68,68,0.07)", textColor: "#b91c1c" },
              ];
              return (
                <>
                  {windows.map((w, wi) => {
                    const si = findIdxByTime(w.start);
                    const ei = findIdxByTime(w.end);
                    if (si < 0 || ei < 0 || si >= ei) return null;
                    return (
                      <ReferenceArea
                        key={`tw-${wi}`}
                        xAxisId={0}
                        x1={si}
                        x2={ei}
                        yAxisId="price"
                        y1={yMin}
                        y2={yMax}
                        fill={w.color}
                        stroke="none"
                      />
                    );
                  })}
                </>
              );
            })()}
            {/* ── 时间窗口标签（图表顶部） ── */}
            <Customized component={(props: any) => {
              if (isZoomed) return null;
              const { xAxisMap, offset } = props;
              if (!xAxisMap || !offset) return null;
              const xAxis = Object.values(xAxisMap)[0] as any;
              if (!xAxis?.scale) return null;
              const xScale = xAxis.scale;

              const findIdxByTime = (targetTime: string) => {
                for (let i = 0; i < zoomData.length; i++) {
                  if (zoomData[i].time >= targetTime) return i;
                }
                return -1;
              };

              const windows = [
                { start: "09:30", end: "10:00", label: "⚠ 早盘观察", sub: "仓位减半", color: "#b45309" },
                { start: "10:00", end: "11:30", label: "✅ 上午操作", sub: "按仓位表", color: "#166534" },
                { start: "13:00", end: "14:00", label: "🔸 午盘确认", sub: "观察方向", color: "#a16207" },
                { start: "14:00", end: "14:30", label: "⚠ 尾盘决策", sub: "准备清仓", color: "#c2410c" },
                { start: "14:30", end: "15:00", label: "🚫 收盘冲刺", sub: "必须闭环", color: "#b91c1c" },
              ];

              return (
                <g>
                  {windows.map((w, wi) => {
                    const si = findIdxByTime(w.start);
                    const ei = findIdxByTime(w.end);
                    if (si < 0 || ei < 0 || si >= ei) return null;
                    const x1 = xScale(si);
                    const x2 = xScale(ei);
                    const midX = (x1 + x2) / 2;
                    const topY = offset.top + 2;
                    const width = x2 - x1;
                    // Only show label if window is wide enough
                    if (width < 50) return null;
                    return (
                      <g key={`twl-${wi}`}>
                        <rect x={x1} y={topY} width={width} height={14} rx={2}
                          fill={w.color} fillOpacity={0.1} stroke={w.color} strokeWidth={0.5} strokeOpacity={0.3}
                        />
                        <text x={midX} y={topY + 7} textAnchor="middle" dominantBaseline="middle"
                          fontSize={8} fontWeight={600} fill={w.color} fillOpacity={0.85}
                        >
                          {width > 100 ? `${w.label} ${w.sub}` : w.label}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            }} />
            {/* ── 止损止盈参考线（根据交易规矩四） ── */}
            {safePrevClose > 0 && (() => {
              const stopLoss = safePrevClose * 0.98;  // -2% 止损线
              const takeProfit1 = safePrevClose * 1.015; // +1.5% 首目标
              const takeProfit2 = safePrevClose * 1.03;  // +3% 二目标
              const els: React.ReactNode[] = [];
              if (stopLoss >= yMin && stopLoss <= yMax) {
                els.push(
                  <ReferenceLine
                    key="stoploss"
                    yAxisId="price"
                    y={stopLoss}
                    stroke="#dc2626"
                    strokeDasharray="4 3"
                    strokeWidth={1.5}
                    strokeOpacity={0.7}
                    label={{ value: `止损 -2% ${stopLoss.toFixed(2)}`, position: "insideBottomLeft", fill: "#dc2626", fontSize: 8, fillOpacity: 0.8 }}
                  />
                );
              }
              if (takeProfit1 >= yMin && takeProfit1 <= yMax) {
                els.push(
                  <ReferenceLine
                    key="tp1"
                    yAxisId="price"
                    y={takeProfit1}
                    stroke="#22c55e"
                    strokeDasharray="4 3"
                    strokeWidth={1.2}
                    strokeOpacity={0.6}
                    label={{ value: `止盈+1.5% ${takeProfit1.toFixed(2)}`, position: "insideTopLeft", fill: "#22c55e", fontSize: 8, fillOpacity: 0.8 }}
                  />
                );
              }
              if (takeProfit2 >= yMin && takeProfit2 <= yMax) {
                els.push(
                  <ReferenceLine
                    key="tp2"
                    yAxisId="price"
                    y={takeProfit2}
                    stroke="#16a34a"
                    strokeDasharray="6 3"
                    strokeWidth={1.2}
                    strokeOpacity={0.6}
                    label={{ value: `目标+3% ${takeProfit2.toFixed(2)}`, position: "insideTopLeft", fill: "#16a34a", fontSize: 8, fillOpacity: 0.8 }}
                  />
                );
              }
              return els;
            })()}
            {/* Today's MA lines as dashed references */}
            {prevDayMA5 != null && prevDayMA5 >= yMin && prevDayMA5 <= yMax && (
              <ReferenceLine
                yAxisId="price"
                y={prevDayMA5}
                stroke="#eab308"
                strokeDasharray="8 4"
                strokeWidth={1.2}
                strokeOpacity={0.9}
                label={{ value: `MA5 ${prevDayMA5.toFixed(2)}`, position: "right", fill: "#eab308", fontSize: 10, fillOpacity: 1 }}
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
                      <text x={labelX + 38} y={y - 2} textAnchor="middle" fontSize={10} fontFamily="monospace" fontWeight={700} fill="#ffffff">{highestPrice.toFixed(2)}</text>
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
                      <text x={labelX + 38} y={y - 2} textAnchor="middle" fontSize={10} fontFamily="monospace" fontWeight={700} fill="#ffffff">{lowestPrice.toFixed(2)}</text>
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
            {/* Crosshair vertical line - shared across panels */}
            {deferredCrosshairIdx != null && crosshairItem?.hasData && (
              <ReferenceLine yAxisId="price" x={deferredCrosshairIdx} stroke="#64748b" strokeWidth={1.2} strokeDasharray="5 3" />
            )}
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
        <ResponsiveContainer width="100%" height={190}>
          <ComposedChart
            data={zoomData}
            margin={{ top: 0, right: 9, left: 2, bottom: 0 }}
            onMouseMove={(state: any) => {
              if (state?.activeTooltipIndex != null) {
                setCrosshairIdx(state.activeTooltipIndex);
              }
            }}
            onMouseLeave={() => setCrosshairIdx(null)}
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
        <ResponsiveContainer width="100%" height={140}>
          <ComposedChart
            data={zoomData}
            margin={{ top: 0, right: 9, left: 2, bottom: 0 }}
            onMouseMove={(state: any) => {
              if (state?.activeTooltipIndex != null) {
                setCrosshairIdx(state.activeTooltipIndex);
              }
            }}
            onMouseLeave={() => setCrosshairIdx(null)}
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
              tickFormatter={(v: number) => v.toFixed(3)}
            />
            <Tooltip content={macdTooltipEl} cursor={false} wrapperStyle={tooltipWrapperStyle} />
            <ReferenceLine yAxisId="macd-right" y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 2" strokeWidth={0.5} />
            {/* Lunch break vertical divider */}
            {!isZoomed && <ReferenceLine yAxisId="macd-right" x={Math.floor(zoomData.length / 2)} stroke="hsl(var(--border))" strokeWidth={0.5} strokeDasharray="2 4" />}
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
        if (!hasIdxData && !hasSectorData) return null;

        const regimeBadge = (regime: RegimeDetail | null) => {
          if (!regime) return null;
          const cfg = REGIME_CONFIG[regime.regime] || REGIME_CONFIG["震荡市"];
          return <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[9px] font-semibold ${cfg.bg} ${cfg.text}`}><span>{cfg.icon}</span><span>{regime.regime}</span></span>;
        };

        return (
          <div className="mt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {hasIdxData && <MiniTimelinePanel title={idxInfo?.label || "深证成指"} data={szData.items} prevClose={szData.prevClose} badge={<div className="flex items-center gap-1 ml-auto">{regimeBadge(szIndexRegime)}{onCycleIndex && <span className="text-[8px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none" onClick={onCycleIndex} title="点击切换指数">切换</span>}</div>} />}
              {hasSectorData && <MiniTimelinePanel title={`${sectorInfo.name}板块`} data={sectorTimelineData.items} prevClose={sectorTimelineData.prevClose} badge={<div className="ml-auto">{regimeBadge(sectorRegime)}</div>} />}
            </div>
          </div>
        );
      })()}
    </div>
  );
}, timeSharingPropsEqual);
