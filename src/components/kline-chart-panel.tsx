"use client";

import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
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
  BarChart3,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { CandlestickRenderer, KLineTooltip, MACDTooltip, VolumeTooltip } from "@/components/chart-tooltips";

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

export function KLineChartPanel({
  allChartData,
  klineVisibleBars,
  setKlineVisibleBars,
  klinePanOffset,
  setKlinePanOffset,
  interval: _interval,
}: KLineChartPanelProps) {
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

  // ── K-line drag-to-pan & scroll-to-pan (stable native events via ref pattern) ──
  const klineDragRef = useRef<{ startX: number; startPanOffset: number; isDragging: boolean }>({ startX: 0, startPanOffset: 0, isDragging: false });
  const klineChartContainerRef = useRef<HTMLDivElement>(null);
  const klinePanOffsetRef = useRef(klinePanOffset);
  const klineVisibleBarsRef = useRef(klineVisibleBars);
  const allChartDataRef = useRef(allChartData);
  useEffect(() => {
    klinePanOffsetRef.current = klinePanOffset;
    klineVisibleBarsRef.current = klineVisibleBars;
    allChartDataRef.current = allChartData;
  }, [klinePanOffset, klineVisibleBars, allChartData]);

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
      if (!isZoomed()) return;
      const delta = e.deltaX !== 0 ? e.deltaX : (e.shiftKey ? e.deltaY : 0);
      if (delta === 0) return;
      e.preventDefault();
      e.stopPropagation();
      const scrollStep = Math.sign(delta) * Math.max(1, Math.round(Math.abs(delta) / 40));
      const newOffset = klinePanOffsetRef.current + scrollStep;
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
  const { minPrice, maxPrice, pricePadding, macdMin, macdMax, macdPadding, maxVolume } = useMemo(() => {
    const allPrices = chartData.flatMap((d) => [d.high, d.low]).filter(Boolean) as number[];
    const mnP = allPrices.length ? allPrices.reduce((mn, v) => (v < mn ? v : mn), allPrices[0]) : 0;
    const mxP = allPrices.length ? allPrices.reduce((mx, v) => (v > mx ? v : mx), allPrices[0]) : 100;
    const pp = (mxP - mnP) * 0.05;

    const macdVals = chartData
      .flatMap((d) => [d.dif, d.dea, d.macd])
      .filter((v): v is number => v != null);
    const mMin = macdVals.length ? macdVals.reduce((mn, v) => (v < mn ? v : mn), macdVals[0]) : -1;
    const mMax = macdVals.length ? macdVals.reduce((mx, v) => (v > mx ? v : mx), macdVals[0]) : 1;
    const mPad = (mMax - mMin) * 0.02 || 0.05;

    const mv = chartData.reduce((mx, d) => (d.volume > mx ? d.volume : mx), 1);

    return { minPrice: mnP, maxPrice: mxP, pricePadding: pp, macdMin: mMin, macdMax: mMax, macdPadding: mPad, maxVolume: mv };
  }, [chartData]);

  // ── Memoized tooltip components and wrapperStyle ──
  const tooltipWrapperStyle = useMemo(() => ({ background: 'transparent' as const, border: 'none' as const }), []);
  const klineTooltipEl = useMemo(() => <KLineTooltip />, []);
  const klineVolumeTooltipEl = useMemo(() => <VolumeTooltip />, []);
  const klineMacdTooltipEl = useMemo(() => <MACDTooltip />, []);

  return (
    <div ref={klineChartContainerRef} className="space-y-1">
      {/* K-Line Chart with Candlesticks */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center gap-4 text-xs flex-wrap">
            <CardTitle className="text-sm font-medium">K线走势</CardTitle>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-yellow-500" />
              MA5{chartData.length > 0 && chartData[chartData.length - 1]?.ma5 != null ? ` ${chartData[chartData.length - 1].ma5!.toFixed(2)}` : ''}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
              MA10{chartData.length > 0 && chartData[chartData.length - 1]?.ma10 != null ? ` ${chartData[chartData.length - 1].ma10!.toFixed(2)}` : ''}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-purple-500" />
              MA20{chartData.length > 0 && chartData[chartData.length - 1]?.ma20 != null ? ` ${chartData[chartData.length - 1].ma20!.toFixed(2)}` : ''}
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
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis domain={[minPrice - pricePadding, maxPrice + pricePadding]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={65} tickFormatter={(v: number) => v.toFixed(2)} />
              <Tooltip content={klineTooltipEl} cursor={false} wrapperStyle={tooltipWrapperStyle} />
              <Bar dataKey="close" opacity={0} isAnimationActive={false} barSize={chartData.length > 150 ? 5 : chartData.length > 80 ? 7 : chartData.length > 50 ? 9 : 12} />
              <Customized component={CandlestickRenderer} />
              <Line type="monotone" dataKey="ma5" stroke="#eab308" dot={false} strokeWidth={1} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="ma10" stroke="#3b82f6" dot={false} strokeWidth={1} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="ma20" stroke="#a855f7" dot={false} strokeWidth={1} connectNulls isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Volume Chart */}
      <Card>
        <CardHeader className="pb-1 pt-2 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            成交量
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-2 px-2">
          <ResponsiveContainer width="100%" height={160}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis domain={[0, maxVolume * 1.01]} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={65} tickFormatter={(v: number) => formatVolume(v)} />
              <Tooltip content={klineVolumeTooltipEl} cursor={false} wrapperStyle={tooltipWrapperStyle} />
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

      {/* MACD Chart */}
      <Card>
        <CardHeader className="pb-1 pt-2 px-4">
          <div className="flex items-center gap-4 text-xs flex-wrap">
            <CardTitle className="text-sm font-medium">MACD</CardTitle>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
              DIF
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-orange-500" />
              DEA
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-1.5 bg-red-500 rounded-sm" />
              <span className="inline-block w-3 h-1.5 bg-green-500 rounded-sm" />
              MACD柱
            </span>
          </div>
        </CardHeader>
        <CardContent className="pb-2 px-2">
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis domain={[macdMin - macdPadding, macdMax + macdPadding]} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={65} tickFormatter={(v: number) => v.toFixed(3)} />
              <Tooltip content={klineMacdTooltipEl} cursor={false} wrapperStyle={tooltipWrapperStyle} />
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
    </div>
  );
}
