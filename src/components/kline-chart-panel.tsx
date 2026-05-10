"use client";

import React, { useState, useRef, useCallback, useMemo, useEffect, useLayoutEffect } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Customized,
} from "recharts";
import type { KLineItem, TimeInterval } from "@/hooks/use-stock-data";
import { formatVolume } from "@/lib/chart-shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { CandlestickRenderer, KLineTooltip, MACDTooltip, VolumeTooltip, KDJTooltip } from "@/components/chart-tooltips";

// ── Props ──────────────────────────────────────────────

interface KLineChartPanelProps {
  allChartData: KLineItem[];
  klineVisibleBars: number;
  setKlineVisibleBars: (n: number) => void;
  klinePanOffset: number;
  setKlinePanOffset: (n: number) => void;
  interval: TimeInterval;
}

// ── Component ──────────────────────────────────────────

export const KLineChartPanel = React.memo(function KLineChartPanel({
  allChartData,
  klineVisibleBars,
  setKlineVisibleBars,
  klinePanOffset,
  setKlinePanOffset,
  interval: _interval,
}: KLineChartPanelProps) {
  // ── Deferred sub-chart rendering for faster initial paint ──
  // Show main K-line chart immediately, render sub-charts after a short delay
  const [subChartsReady, setSubChartsReady] = useState(false);
  useEffect(() => {
    if (allChartData.length === 0) return;
    // Use requestIdleCallback for non-critical sub-chart rendering
    const raf = requestAnimationFrame(() => {
      setSubChartsReady(true);
    });
    return () => cancelAnimationFrame(raf);
  }, [allChartData.length > 0]);

  // ── Zoom Levels ──
  const ZOOM_LEVELS = [30, 50, 80, 120, 200, 300];
  const zoomIn = () => {
    setKlineVisibleBars((prev: number) => {
      const smaller = ZOOM_LEVELS.filter((l) => l < prev);
      return smaller.length > 0 ? smaller[smaller.length - 1] : prev;
    });
    setKlinePanOffset(0);
  };
  const zoomOut = () => {
    setKlineVisibleBars((prev: number) => {
      const larger = ZOOM_LEVELS.filter((l) => l > prev);
      return larger.length > 0 ? larger[0] : prev;
    });
    setKlinePanOffset(0);
  };
  const zoomReset = () => { setKlineVisibleBars(80); setKlinePanOffset(0); };

  // ── Slice chart data based on zoom level + pan offset ──
  const chartData = useMemo(() => {
    if (allChartData.length <= klineVisibleBars) return allChartData;
    const maxOffset = allChartData.length - klineVisibleBars;
    const offset = Math.max(0, Math.min(klinePanOffset, maxOffset));
    return allChartData.slice(-(klineVisibleBars + offset), allChartData.length - offset);
  }, [allChartData, klineVisibleBars, klinePanOffset]);

  // ── Synchronized Crosshair ──
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const handleChartMouseMove = useCallback((state: any) => {
    if (state?.activeTooltipIndex != null) {
      setActiveIndex(Number(state.activeTooltipIndex));
    }
  }, []);

  const handleChartMouseLeave = useCallback(() => {
    setActiveIndex(null);
  }, []);

  // Derived crosshair data
  const crosshairData = activeIndex != null && chartData[activeIndex] ? chartData[activeIndex] : null;

  // Ref for crosshair data (read by Customized SVG components via closure)
  const crosshairDataRef = useRef<KLineItem | null>(null);
  // Use useLayoutEffect to update the ref synchronously before browser paint
  useLayoutEffect(() => {
    crosshairDataRef.current = crosshairData;
  }, [crosshairData]);

  // ── Customized component factories (stable references, read from ref) ──

  const CrosshairPriceTag = useMemo(() => 
    function CrosshairPriceTagInner(props: any) {
      const cd = crosshairDataRef.current;
      if (!cd) return null;
      const { yAxisMap } = props;
      if (!yAxisMap) return null;
      const yAxis = Object.values(yAxisMap)[0] as any;
      if (!yAxis) return null;
      const yScale = yAxis.scale;
      const y = yScale(cd.close);
      if (y == null || isNaN(y)) return null;
      const chartRight = (yAxis.x || 0) + (yAxis.width || 0);
      return (
        <g>
          <rect x={chartRight + 1} y={y - 10} width={62} height={20} rx={3} fill="#1e293b" />
          <text x={chartRight + 32} y={y + 4} textAnchor="middle" fontSize={10} fontFamily="monospace" fill="#ffffff">
            {cd.close.toFixed(2)}
          </text>
        </g>
      );
    }
  , []);

  const CrosshairDateTag = useMemo(() =>
    function CrosshairDateTagInner(props: any) {
      const cd = crosshairDataRef.current;
      if (!cd) return null;
      const { xAxisMap, formattedGraphicalItems } = props;
      if (!xAxisMap) return null;
      const xAxis = Object.values(xAxisMap)[0] as any;
      if (!xAxis) return null;
      const xScale = xAxis.scale;
      const x = xScale(cd.date);
      if (x == null || isNaN(x)) return null;
      const bottom = (xAxis.y || 0) + (xAxis.height || 0);
      let barWidth = 8;
      for (const item of formattedGraphicalItems || []) {
        if (item?.props?.data?.[0]?.width) {
          barWidth = item.props.data[0].width;
          break;
        }
      }
      const centerX = x + barWidth / 2;
      const tagWidth = Math.max(cd.date.length * 7 + 10, 64);
      return (
        <g>
          <rect x={centerX - tagWidth / 2} y={bottom + 2} width={tagWidth} height={16} rx={3} fill="#1e293b" />
          <text x={centerX} y={bottom + 13} textAnchor="middle" fontSize={9} fontFamily="monospace" fill="#ffffff">
            {cd.date}
          </text>
        </g>
      );
    }
  , []);

  // ── K-line drag-to-pan & scroll-to-pan (stable native events via ref pattern) ──
  const klineDragRef = useRef<{ startX: number; startPanOffset: number; isDragging: boolean }>({ startX: 0, startPanOffset: 0, isDragging: false });
  const klineChartContainerRef = useRef<HTMLDivElement>(null);
  const klineMainCardRef = useRef<HTMLDivElement>(null); // ref for the K-line main chart card (zoom target)
  const klinePanOffsetRef = useRef(klinePanOffset);
  const klineVisibleBarsRef = useRef(klineVisibleBars);
  const allChartDataRef = useRef(allChartData);
  const setKlineVisibleBarsRef = useRef(setKlineVisibleBars);
  useEffect(() => {
    klinePanOffsetRef.current = klinePanOffset;
    klineVisibleBarsRef.current = klineVisibleBars;
    allChartDataRef.current = allChartData;
    setKlineVisibleBarsRef.current = setKlineVisibleBars;
  }, [klinePanOffset, klineVisibleBars, allChartData, setKlineVisibleBars]);

  // Pan helper — defined inside useEffect to avoid memoization issues
  useEffect(() => {
    const applyKlinePanOffset = (rawOffset: number) => {
      const acd = allChartDataRef.current;
      const vb = klineVisibleBarsRef.current;
      const maxOffset = Math.max(0, acd.length - vb);
      setKlinePanOffset(Math.max(0, Math.min(rawOffset, maxOffset)));
    };

    const container = klineChartContainerRef.current;
    if (!container) return;

    const isZoomed = () => allChartDataRef.current.length > klineVisibleBarsRef.current;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (!isZoomed()) return;
      e.preventDefault();
      e.stopPropagation();
      klineDragRef.current = { startX: e.clientX, startPanOffset: klinePanOffsetRef.current, isDragging: true };
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!klineDragRef.current.isDragging) return;
      e.preventDefault();
      const vb = klineVisibleBarsRef.current;
      const dx = e.clientX - klineDragRef.current.startX;
      const containerWidth = container.clientWidth || 600;
      const pixelsPerPoint = containerWidth / vb;
      const pointDelta = Math.round(dx / pixelsPerPoint);
      const newOffset = klineDragRef.current.startPanOffset - pointDelta;
      applyKlinePanOffset(newOffset);
    };

    const onMouseUp = () => {
      if (klineDragRef.current.isDragging) {
        klineDragRef.current.isDragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    const onContextMenu = (e: Event) => {
      if (klineDragRef.current.isDragging) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onWheel = (e: WheelEvent) => {
      const acd = allChartDataRef.current;
      const vb = klineVisibleBarsRef.current;

      // Only process zoom/pan when mouse is over the K-line main chart area
      const mainCard = klineMainCardRef.current;
      if (mainCard) {
        const mainRect = mainCard.getBoundingClientRect();
        const isOverMainChart = e.clientY >= mainRect.top && e.clientY <= mainRect.bottom
          && e.clientX >= mainRect.left && e.clientX <= mainRect.right;
        if (!isOverMainChart) return; // ignore wheel events on sub-charts
      }

      // Shift + scroll → pan (original behavior)
      if (e.shiftKey || e.deltaX !== 0) {
        if (acd.length <= vb) return;
        const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
        if (delta === 0) return;
        e.preventDefault();
        e.stopPropagation();
        const scrollStep = Math.sign(delta) * Math.max(1, Math.round(Math.abs(delta) / 40));
        const newOffset = klinePanOffsetRef.current + scrollStep;
        applyKlinePanOffset(newOffset);
        return;
      }

      // Vertical scroll → zoom in/out around cursor position
      const zoomDelta = e.deltaY;
      if (zoomDelta === 0) return;
      e.preventDefault();
      e.stopPropagation();

      const currentVB = vb;
      const step = Math.max(3, Math.round(currentVB * 0.08));
      let newVB: number;

      if (zoomDelta < 0) {
        newVB = Math.max(ZOOM_LEVELS[0], currentVB - step);
      } else {
        newVB = Math.min(Math.max(ZOOM_LEVELS[ZOOM_LEVELS.length - 1], acd.length), currentVB + step);
      }

      if (newVB === currentVB) return;

      const rect = container.getBoundingClientRect();
      const mouseXRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const maxOldOffset = Math.max(0, acd.length - currentVB);
      const currentOffset = Math.min(klinePanOffsetRef.current, maxOldOffset);
      const visibleStartIdx = acd.length - currentVB - currentOffset;
      const cursorDataIdx = visibleStartIdx + Math.round(mouseXRatio * (currentVB - 1));
      const newVisibleStartIdx = cursorDataIdx - Math.round(mouseXRatio * (newVB - 1));
      const newOffset = Math.max(0, Math.min(acd.length - newVB, acd.length - newVB - newVisibleStartIdx));

      setKlineVisibleBarsRef.current(newVB);
      applyKlinePanOffset(newOffset);
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
  }, [setKlinePanOffset]);

  // ── Y-axis ranges ──
  const { minPrice, maxPrice, pricePadding, macdMin, macdMax, macdPadding, maxVolume, kdjMin, kdjMax, kdjPadding } = useMemo(() => {
    const allPrices = chartData.flatMap((d) => [d.high, d.low]).filter(Boolean) as number[];
    const mnP = allPrices.length ? allPrices.reduce((mn, v) => (v < mn ? v : mn), allPrices[0]) : 0;
    const mxP = allPrices.length ? allPrices.reduce((mx, v) => (v > mx ? v : mx), allPrices[0]) : 100;
    const pp = (mxP - mnP) * 0.05;

    const macdVals = chartData.flatMap((d) => [d.dif, d.dea, d.macd]).filter((v): v is number => v != null);
    const mMin = macdVals.length ? macdVals.reduce((mn, v) => (v < mn ? v : mn), macdVals[0]) : -1;
    const mMax = macdVals.length ? macdVals.reduce((mx, v) => (v > mx ? v : mx), macdVals[0]) : 1;
    const mPad = (mMax - mMin) * 0.02 || 0.05;

    const mv = chartData.reduce((mx, d) => (d.volume > mx ? d.volume : mx), 1);

    const kdjVals = chartData.flatMap((d) => [d.k, d.d, d.j]).filter((v): v is number => v != null && !isNaN(v));
    const kMin = kdjVals.length ? kdjVals.reduce((mn, v) => (v < mn ? v : mn), kdjVals[0]) : 0;
    const kMax = kdjVals.length ? kdjVals.reduce((mx, v) => (v > mx ? v : mx), kdjVals[0]) : 100;
    const kPad = (kMax - kMin) * 0.05 || 5;

    return { minPrice: mnP, maxPrice: mxP, pricePadding: pp, macdMin: mMin, macdMax: mMax, macdPadding: mPad, maxVolume: mv, kdjMin: kMin, kdjMax: kMax, kdjPadding: kPad };
  }, [chartData]);

  // ── Memoized tooltip components and wrapperStyle ──
  const tooltipWrapperStyle = useMemo(() => ({ background: 'transparent' as const, border: 'none' as const }), []);
  const klineTooltipEl = useMemo(() => <KLineTooltip />, []);
  const klineVolumeTooltipEl = useMemo(() => <VolumeTooltip />, []);
  const klineMacdTooltipEl = useMemo(() => <MACDTooltip />, []);
  const klineKdjTooltipEl = useMemo(() => <KDJTooltip />, []);

  // Latest values for headers
  const latestKDJ = useMemo(() => {
    if (chartData.length === 0) return null;
    const last = chartData[chartData.length - 1];
    if (last.k == null) return null;
    return { k: last.k, d: last.d, j: last.j };
  }, [chartData]);

  // Display data: use crosshair data when active, otherwise latest
  const displayItem = crosshairData || (chartData.length > 0 ? chartData[chartData.length - 1] : null);

  // ── Lowest price in visible area ──
  const lowestPrice = useMemo(() => {
    if (chartData.length === 0) return null;
    let minLow = Infinity;
    for (const d of chartData) {
      if (d.low < minLow) minLow = d.low;
    }
    return minLow;
  }, [chartData]);

  const LowestPriceTag = useMemo(() =>
    function LowestPriceTagInner(props: any) {
      const lp = lowestPrice;
      if (lp == null || !isFinite(lp)) return null;
      const { yAxisMap } = props;
      if (!yAxisMap) return null;
      const yAxis = Object.values(yAxisMap)[0] as any;
      if (!yAxis) return null;
      const yScale = yAxis.scale;
      const y = yScale(lp);
      if (y == null || isNaN(y)) return null;
      const chartRight = (yAxis.x || 0) + (yAxis.width || 0);
      return (
        <g>
          {/* Down arrow triangle at the line */}
          <polygon points={`${chartRight - 8},${y - 5} ${chartRight + 2},${y - 5} ${chartRight - 3},${y + 3}`} fill="#16a34a" />
          {/* Price tag background */}
          <rect x={chartRight + 1} y={y - 10} width={62} height={20} rx={3} fill="#16a34a" />
          {/* Price text */}
          <text x={chartRight + 32} y={y + 4} textAnchor="middle" fontSize={10} fontFamily="monospace" fontWeight={600} fill="#ffffff">
            {lp.toFixed(2)}
          </text>
        </g>
      );
    }
  , [lowestPrice]);

  // ── Sub-chart title labels (rendered inside chart area, top-left) ──

  const VolumeTitleLabel = useMemo(() =>
    function VolumeTitleLabelInner() {
      const cd = crosshairDataRef.current;
      const vol = cd?.volume ?? (chartData.length > 0 ? chartData[chartData.length - 1].volume : null);
      return (
        <g>
          <text x={4} y={12} fontSize={10} fontWeight={500} fill="#94a3b8">成交量</text>
          {vol != null && (
            <text x={42} y={12} fontSize={10} fontFamily="monospace" fill="#e2e8f0">{formatVolume(vol)}</text>
          )}
        </g>
      );
    }
  , [chartData]);

  const KDJTitleLabel = useMemo(() =>
    function KDJTitleLabelInner() {
      const cd = crosshairDataRef.current;
      const kVal = cd?.k ?? latestKDJ?.k;
      const dVal = cd?.d ?? latestKDJ?.d;
      const jVal = cd?.j ?? latestKDJ?.j;
      return (
        <g>
          <text x={4} y={12} fontSize={10} fontWeight={500} fill="#94a3b8">KDJ</text>
          {kVal != null && (
            <text x={30} y={12} fill="#3b82f6" fontSize={10} fontFamily="monospace">K:{kVal.toFixed(2)}</text>
          )}
          {dVal != null && (
            <text x={90} y={12} fill="#f97316" fontSize={10} fontFamily="monospace">D:{dVal.toFixed(2)}</text>
          )}
          {jVal != null && (
            <text x={150} y={12} fill="#a855f7" fontSize={10} fontFamily="monospace">J:{jVal.toFixed(2)}</text>
          )}
        </g>
      );
    }
  , [latestKDJ]);

  const MACDTitleLabel = useMemo(() =>
    function MACDTitleLabelInner() {
      const cd = crosshairDataRef.current;
      const difVal = cd?.dif ?? (chartData.length > 0 ? chartData[chartData.length - 1].dif : null);
      const deaVal = cd?.dea ?? (chartData.length > 0 ? chartData[chartData.length - 1].dea : null);
      const macdVal = cd?.macd ?? (chartData.length > 0 ? chartData[chartData.length - 1].macd : null);
      return (
        <g>
          <text x={4} y={12} fontSize={10} fontWeight={500} fill="#94a3b8">MACD</text>
          {difVal != null && (
            <text x={42} y={12} fill="#3b82f6" fontSize={10} fontFamily="monospace">DIF:{difVal.toFixed(3)}</text>
          )}
          {deaVal != null && (
            <text x={114} y={12} fill="#f97316" fontSize={10} fontFamily="monospace">DEA:{deaVal.toFixed(3)}</text>
          )}
          {macdVal != null && (
            <text x={190} y={12} fill={macdVal >= 0 ? "#ef4444" : "#22c55e"} fontSize={10} fontFamily="monospace">MACD:{macdVal.toFixed(3)}</text>
          )}
        </g>
      );
    }
  , [chartData]);

  // ── Crosshair styles (more prominent) ──
  const crossStroke = "rgba(160, 170, 180, 0.85)";
  const crossGlow = "rgba(160, 170, 180, 0.15)";
  const crossDash = "5 3";
  const crossStrokeWidth = 1;
  const glowWidth = 6;

  // ── Overlay crosshair (continuous vertical line across all sub-charts) ──
  const [overlayX, setOverlayX] = useState<number | null>(null);

  const handleContainerMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (activeIndex != null) {
      const rect = e.currentTarget.getBoundingClientRect();
      setOverlayX(e.clientX - rect.left);
    }
  }, [activeIndex]);

  const handleContainerMouseLeave = useCallback(() => {
    setOverlayX(null);
  }, []);

  return (
    <div
      ref={klineChartContainerRef}
      className="space-y-1 relative"
      onMouseMove={handleContainerMouseMove}
      onMouseLeave={handleContainerMouseLeave}
    >
      {/* Continuous crosshair overlay - vertical line spanning all sub-charts */}
      {overlayX != null && activeIndex != null && (
        <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-20" style={{ overflow: 'visible' }}>
          {/* Glow */}
          <line x1={overlayX} y1={0} x2={overlayX} y2="100%" stroke={crossGlow} strokeWidth={glowWidth} />
          {/* Core line */}
          <line x1={overlayX} y1={0} x2={overlayX} y2="100%" stroke={crossStroke} strokeWidth={crossStrokeWidth} strokeDasharray={crossDash} />
        </svg>
      )}
      {/* K-Line Chart with Candlesticks */}
      <Card ref={klineMainCardRef}>
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center gap-3 text-xs flex-wrap">
            <CardTitle className="text-sm font-medium">K线走势</CardTitle>
            {displayItem && (
              <>
                <span className="text-muted-foreground tabular-nums">{displayItem.date}</span>
                <span>
                  开<span className={displayItem.close >= displayItem.open ? "text-red-500" : "text-green-500"} ml-1>{displayItem.open.toFixed(2)}</span>
                </span>
                <span>
                  高<span className="text-red-500 ml-1">{displayItem.high.toFixed(2)}</span>
                </span>
                <span>
                  低<span className="text-green-500 ml-1">{displayItem.low.toFixed(2)}</span>
                </span>
                <span>
                  收<span className={displayItem.close >= displayItem.open ? "text-red-500" : "text-green-500"} ml-1>{displayItem.close.toFixed(2)}</span>
                </span>
                <span>
                  量<span className="text-muted-foreground ml-1">{formatVolume(displayItem.volume)}</span>
                </span>
              </>
            )}
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-yellow-500" />
              MA5{displayItem?.ma5 != null ? ` ${displayItem.ma5!.toFixed(2)}` : ''}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
              MA10{displayItem?.ma10 != null ? ` ${displayItem.ma10!.toFixed(2)}` : ''}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-purple-500" />
              MA20{displayItem?.ma20 != null ? ` ${displayItem.ma20!.toFixed(2)}` : ''}
            </span>
            {/* Zoom Controls */}
            <div className="ml-auto flex items-center gap-1">
              {allChartData.length > klineVisibleBars && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => {
                    const maxOffset = allChartData.length - klineVisibleBars;
                    const step = Math.max(1, Math.round(klineVisibleBars * 0.3));
                    setKlinePanOffset(Math.min(klinePanOffset + step, maxOffset));
                  }}
                  disabled={klinePanOffset >= allChartData.length - klineVisibleBars}
                  title="向左平移（查看更早数据）"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={zoomIn}
                disabled={klineVisibleBars <= ZOOM_LEVELS[0]}
                title="放大（减少K线数）"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <span className="text-[10px] text-muted-foreground tabular-nums min-w-[48px] text-center">
                {chartData.length}根
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={zoomOut}
                disabled={klineVisibleBars >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1] || klineVisibleBars >= allChartData.length}
                title="缩小（增加K线数）"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              {allChartData.length > klineVisibleBars && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => {
                    const step = Math.max(1, Math.round(klineVisibleBars * 0.3));
                    setKlinePanOffset(Math.max(0, klinePanOffset - step));
                  }}
                  disabled={klinePanOffset <= 0}
                  title="向右平移（查看最新数据）"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground"
                onClick={zoomReset}
                title="重置缩放"
              >
                <RotateCcw className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pb-2 px-2">
          <ResponsiveContainer width="100%" height={460}>
            <ComposedChart
              data={chartData}
              margin={{ top: 10, right: 60, left: 0, bottom: 0 }}
              onMouseMove={handleChartMouseMove}
              onMouseLeave={handleChartMouseLeave}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis domain={[minPrice - pricePadding, maxPrice + pricePadding]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={65} tickFormatter={(v: number) => v.toFixed(2)} />
              <Tooltip content={klineTooltipEl} cursor={false} wrapperStyle={tooltipWrapperStyle} />
              {/* Crosshair lines - horizontal (price) only; vertical handled by overlay */}
              {crosshairData && <ReferenceLine y={crosshairData.close} stroke={crossGlow} strokeWidth={glowWidth} strokeDasharray={crossDash} />}
              {crosshairData && <ReferenceLine y={crosshairData.close} stroke={crossStroke} strokeWidth={crossStrokeWidth} strokeDasharray={crossDash} />}
              <Customized component={CrosshairPriceTag} />
              <Customized component={CrosshairDateTag} />
              {/* Lowest price dashed line */}
              {lowestPrice != null && isFinite(lowestPrice) && <ReferenceLine y={lowestPrice} stroke="#16a34a" strokeDasharray="6 4" strokeWidth={1.5} />}
              <Customized component={LowestPriceTag} />
              <Bar dataKey="close" opacity={0} isAnimationActive={false} barSize={chartData.length > 150 ? 5 : chartData.length > 80 ? 7 : chartData.length > 50 ? 9 : 12} />
              <Customized component={CandlestickRenderer} />
              <Line type="monotone" dataKey="ma5" stroke="#eab308" dot={false} strokeWidth={1} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="ma10" stroke="#3b82f6" dot={false} strokeWidth={1} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="ma20" stroke="#a855f7" dot={false} strokeWidth={1} connectNulls isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Volume Chart — deferred for faster initial paint */}
      {subChartsReady ? (
      <Card className="py-0">
        <CardContent className="pb-1 pt-1 px-2">
          <ResponsiveContainer width="100%" height={130}>
            <ComposedChart
              data={chartData}
              margin={{ top: 18, right: 60, left: 0, bottom: 0 }}
              onMouseMove={handleChartMouseMove}
              onMouseLeave={handleChartMouseLeave}
            >
              <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis domain={[0, maxVolume * 1.01]} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={65} tickFormatter={(v: number) => formatVolume(v)} />
              <Tooltip content={klineVolumeTooltipEl} cursor={false} wrapperStyle={tooltipWrapperStyle} />
              <Customized component={VolumeTitleLabel} />
              <Bar dataKey="volume" isAnimationActive={false} barSize={chartData.length > 150 ? 5 : chartData.length > 80 ? 7 : chartData.length > 50 ? 9 : 12}
                shape={(props: any) => {
                  const { x, y, width, height, payload } = props;
                  return <rect x={x} y={y} width={width} height={height} fill={payload.close >= payload.open ? "#ef4444" : "#16a34a"} />;
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      ) : (
        <Card className="py-0"><CardContent className="pb-1 pt-1 px-2"><div className="h-[130px] flex items-center justify-center"><span className="text-xs text-muted-foreground">加载中...</span></div></CardContent></Card>
      )}

      {/* KDJ Chart — deferred */}
      {subChartsReady ? (
      <Card className="py-0">
        <CardContent className="pb-1 pt-1 px-2">
          <ResponsiveContainer width="100%" height={170}>
            <ComposedChart
              data={chartData}
              margin={{ top: 18, right: 60, left: 0, bottom: 0 }}
              onMouseMove={handleChartMouseMove}
              onMouseLeave={handleChartMouseLeave}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis domain={[kdjMin - kdjPadding, kdjMax + kdjPadding]} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={65} tickFormatter={(v: number) => v.toFixed(0)} />
              <Tooltip content={klineKdjTooltipEl} cursor={false} wrapperStyle={tooltipWrapperStyle} />
              <Customized component={KDJTitleLabel} />
              <ReferenceLine y={20} stroke="#22c55e" strokeDasharray="3 3" opacity={0.4} />
              <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="3 3" opacity={0.4} />
              <ReferenceLine y={50} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" opacity={0.3} />
              <Line type="monotone" dataKey="k" stroke="#3b82f6" dot={false} strokeWidth={1.5} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="d" stroke="#f97316" dot={false} strokeWidth={1.5} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="j" stroke="#a855f7" dot={false} strokeWidth={1.5} connectNulls isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      ) : (
        <Card className="py-0"><CardContent className="pb-1 pt-1 px-2"><div className="h-[170px] flex items-center justify-center"><span className="text-xs text-muted-foreground">加载中...</span></div></CardContent></Card>
      )}

      {/* MACD Chart — deferred */}
      {subChartsReady ? (
      <Card className="py-0">
        <CardContent className="pb-1 pt-1 px-2">
          <ResponsiveContainer width="100%" height={170}>
            <ComposedChart
              data={chartData}
              margin={{ top: 18, right: 60, left: 0, bottom: 0 }}
              onMouseMove={handleChartMouseMove}
              onMouseLeave={handleChartMouseLeave}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis domain={[macdMin - macdPadding, macdMax + macdPadding]} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={65} tickFormatter={(v: number) => v.toFixed(3)} />
              <Tooltip content={klineMacdTooltipEl} cursor={false} wrapperStyle={tooltipWrapperStyle} />
              <Customized component={MACDTitleLabel} />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
              <Bar dataKey="macd" isAnimationActive={false} barSize={chartData.length > 150 ? 5 : chartData.length > 80 ? 7 : chartData.length > 50 ? 9 : 12}
                shape={(props: any) => {
                  const { x, y, width, height, payload } = props;
                  if (payload?.macd == null) return null;
                  const h = Math.abs(height || 0);
                  if (h < 0.3) return null;
                  const ry = height < 0 ? y + height : y;
                  return <rect x={x} y={ry} width={width} height={h} fill={payload.macd >= 0 ? "#ef4444" : "#16a34a"} />;
                }}
              />
              <Line type="monotone" dataKey="dif" stroke="#3b82f6" dot={false} strokeWidth={1.5} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="dea" stroke="#f97316" dot={false} strokeWidth={1.5} connectNulls isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      ) : (
        <Card className="py-0"><CardContent className="pb-1 pt-1 px-2"><div className="h-[170px] flex items-center justify-center"><span className="text-xs text-muted-foreground">加载中...</span></div></CardContent></Card>
      )}
    </div>
  );
});
