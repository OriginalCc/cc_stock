"use client";

import React from "react";
import { formatVolume } from "@/lib/chart-shared";
import { Badge } from "@/components/ui/badge";
import type { KLineItem } from "@/hooks/use-stock-data";

// ── Candlestick Renderer ──────────────────────────────

export function CandlestickRenderer(props: any) {
  const { formattedGraphicalItems, xAxisMap, yAxisMap } = props;
  if (!formattedGraphicalItems || !xAxisMap || !yAxisMap) return null;

  const xAxis = Object.values(xAxisMap)[0] as any;
  const yAxis = Object.values(yAxisMap)[0] as any;
  if (!xAxis || !yAxis) return null;

  const yScale = yAxis.scale;
  let barData: any[] = [];
  for (const item of formattedGraphicalItems) {
    if (item?.props?.data && Array.isArray(item.props.data)) {
      barData = item.props.data;
      break;
    }
  }
  if (barData.length === 0) return null;

  const sampleEntry = barData[0];
  const barWidth = sampleEntry?.width || 4;

  // Adjust candle body width proportionally, ensure minimum visibility
  const candleBodyRatio = barWidth > 8 ? 0.6 : barWidth > 5 ? 0.7 : 0.8;

  return (
    <g>
      {barData.map((entry: any, i: number) => {
        const { x, payload } = entry;
        if (!payload || !payload.close) return null;
        const { open, close, high, low } = payload;
        if (!open || !high || !low) return null;

        const isUp = close >= open;
        const color = isUp ? "#ef4444" : "#22c55e";

        const yHigh = yScale(high);
        const yLow = yScale(low);
        const yOpen = yScale(open);
        const yClose = yScale(close);

        const bodyTop = Math.min(yOpen, yClose);
        const bodyBottom = Math.max(yOpen, yClose);
        const bodyHeight = Math.max(bodyBottom - bodyTop, 1);
        const centerX = x + barWidth / 2;
        const bodyWidth = Math.max(barWidth * candleBodyRatio, 2);

        return (
          <g key={`candle-${i}`}>
            <line x1={centerX} y1={yHigh} x2={centerX} y2={bodyTop} stroke={color} strokeWidth={1} />
            <line x1={centerX} y1={bodyBottom} x2={centerX} y2={yLow} stroke={color} strokeWidth={1} />
            <rect x={centerX - bodyWidth / 2} y={bodyTop} width={bodyWidth} height={bodyHeight} fill={isUp ? "transparent" : color} stroke={color} strokeWidth={1} />
          </g>
        );
      })}
    </g>
  );
}

// ── Custom Tooltips ───────────────────────────────────

export const KLineTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload as KLineItem;
  if (!data) return null;

  const isUp = data.close >= data.open;
  const color = isUp ? "text-red-500" : "text-green-500";

  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-xs min-w-[180px]">
      <div className="font-medium mb-2 text-foreground">{data.date}</div>
      <div className="grid grid-cols-2 gap-y-1 gap-x-3">
        <span className="text-muted-foreground">开盘</span>
        <span className={`text-right font-mono ${color}`}>{data.open.toFixed(2)}</span>
        <span className="text-muted-foreground">收盘</span>
        <span className={`text-right font-mono ${color}`}>{data.close.toFixed(2)}</span>
        <span className="text-muted-foreground">最高</span>
        <span className="text-right font-mono text-red-500">{data.high.toFixed(2)}</span>
        <span className="text-muted-foreground">最低</span>
        <span className="text-right font-mono text-green-500">{data.low.toFixed(2)}</span>
        <span className="text-muted-foreground">成交量</span>
        <span className="text-right font-mono">{formatVolume(data.volume)}</span>
        {data.ma5 != null && (
          <>
            <span className="text-muted-foreground">MA5</span>
            <span className="text-right font-mono text-yellow-500">{data.ma5!.toFixed(2)}</span>
          </>
        )}
        {data.ma10 != null && (
          <>
            <span className="text-muted-foreground">MA10</span>
            <span className="text-right font-mono text-blue-500">{data.ma10!.toFixed(2)}</span>
          </>
        )}
        {data.ma20 != null && (
          <>
            <span className="text-muted-foreground">MA20</span>
            <span className="text-right font-mono text-purple-500">{data.ma20!.toFixed(2)}</span>
          </>
        )}
      </div>
      {data.dif != null && (
        <div className="mt-2 pt-2 border-t border-border grid grid-cols-2 gap-y-1 gap-x-3">
          <span className="text-muted-foreground">DIF</span>
          <span className="text-right font-mono">{data.dif.toFixed(4)}</span>
          <span className="text-muted-foreground">DEA</span>
          <span className="text-right font-mono">{data.dea?.toFixed(4)}</span>
          <span className="text-muted-foreground">MACD</span>
          <span className={`text-right font-mono ${data.macd != null && data.macd > 0 ? "text-red-500" : "text-green-500"}`}>
            {data.macd?.toFixed(4)}
          </span>
        </div>
      )}
      {data.signal && data.signal.type !== "hold" && (
        <div className="mt-2 pt-2 border-t border-border">
          <Badge variant={data.signal.type === "buy" ? "default" : "destructive"} className="text-xs">
            {data.signal.type === "buy" ? "买入" : "卖出"} · {data.signal.reason}
          </Badge>
        </div>
      )}
    </div>
  );
};

export const MACDTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload as KLineItem;
  if (!data || data.dif == null) return null;

  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-xs min-w-[160px]">
      <div className="font-medium mb-2 text-foreground">{data.date}</div>
      <div className="grid grid-cols-2 gap-y-1 gap-x-3">
        <span className="text-muted-foreground">DIF</span>
        <span className="text-right font-mono">{data.dif.toFixed(4)}</span>
        <span className="text-muted-foreground">DEA</span>
        <span className="text-right font-mono">{data.dea?.toFixed(4)}</span>
        <span className="text-muted-foreground">MACD</span>
        <span className={`text-right font-mono ${data.macd != null && data.macd > 0 ? "text-red-500" : "text-green-500"}`}>
          {data.macd?.toFixed(4)}
        </span>
      </div>
    </div>
  );
};

export const VolumeTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload as KLineItem;
  if (!data) return null;

  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-xs min-w-[140px]">
      <div className="font-medium mb-1 text-foreground">{data.date}</div>
      <div className="grid grid-cols-2 gap-y-1 gap-x-3">
        <span className="text-muted-foreground">成交量</span>
        <span className="text-right font-mono">{formatVolume(data.volume)}</span>
      </div>
    </div>
  );
};
