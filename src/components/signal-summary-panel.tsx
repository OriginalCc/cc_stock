"use client";

import React from "react";
import type { KLineItem, ChartMode } from "@/hooks/use-stock-data";
import type { TSignal, PulseVolumeMarker } from "@/lib/chart-shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  BarChart3,
  Minus,
  Zap,
  Shield,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────

interface SignalCounts {
  buyCount: number;
  strongBuys: number;
  sellCount: number;
  strongSells: number;
  totalSigs: number;
  strongSigs: number;
  mediumSigs: number;
  weakSigs: number;
  confluenceCount: number;
  keyLevelCount: number;
  vwapSlopeCount: number;
  indexRegimeCount: number;
}

interface SignalSummaryPanelProps {
  chartMode: ChartMode;
  chartData: KLineItem[];
  liveTimeline: Array<{ time: string; price: number; avgPrice: number; volume: number; amount: number; changePercent: number }>;
  timeline: Array<{ time: string; price: number; avgPrice: number; volume: number; amount: number; changePercent: number }>;
  timelineSignals: (TSignal | null)[];
  latestTimelineSignal: TSignal | null;
  latestSignal: { type: string; strength: string; reason: string } | null;
  signalCounts: SignalCounts;
  pvMarkers: PulseVolumeMarker[];
}

// ── Component ──────────────────────────────────────────

export function SignalSummaryPanel({
  chartMode,
  chartData,
  liveTimeline,
  timeline,
  timelineSignals,
  latestTimelineSignal,
  latestSignal,
  signalCounts,
  pvMarkers,
}: SignalSummaryPanelProps) {
  return (
    <Card className="mt-4">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Zap className="h-4 w-4" />
          做T信号分析
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {chartMode === "timeline" && signalCounts.totalSigs > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <div className="text-red-500"><TrendingUp className="h-4 w-4" /></div>
                <div>
                  <div className="text-xs text-muted-foreground">买入信号</div>
                  <div className="text-sm font-medium text-red-500">
                    {signalCounts.buyCount}个 {signalCounts.strongBuys > 0 && `(强信号${signalCounts.strongBuys}个)`}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <div className="text-green-500"><TrendingDown className="h-4 w-4" /></div>
                <div>
                  <div className="text-xs text-muted-foreground">卖出信号</div>
                  <div className="text-sm font-medium text-green-500">
                    {signalCounts.sellCount}个 {signalCounts.strongSells > 0 && `(强信号${signalCounts.strongSells}个)`}
                  </div>
                </div>
              </div>

              {(() => {
                const lastTL = liveTimeline[liveTimeline.length - 1];
                if (!lastTL) return null;
                const aboveVWAP = lastTL.price > lastTL.avgPrice;
                const dev = ((lastTL.price - lastTL.avgPrice) / lastTL.avgPrice * 100).toFixed(2);
                return (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <div className={aboveVWAP ? "text-red-500" : "text-green-500"}>
                      <Activity className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">价格/均价</div>
                      <div className={`text-sm font-medium ${aboveVWAP ? "text-red-500" : "text-green-500"}`}>
                        {aboveVWAP ? "均线上方" : "均线下方"} ({aboveVWAP ? "+" : ""}{dev}%)
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Pulse & Volume Surge Markers Summary */}
            {pvMarkers.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {pvMarkers.map((m, i) => (
                  <div key={`pvm-${i}`} className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border ${
                    m.type === "pulse"
                      ? "bg-amber-500/5 border-amber-500/20 text-amber-700 dark:text-amber-300"
                      : "bg-cyan-500/5 border-cyan-500/20 text-cyan-700 dark:text-cyan-300"
                  }`}>
                    {m.type === "pulse" ? <Zap className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                    <span className="font-mono">{m.time}</span>
                    <span className="font-medium">{m.label}</span>
                    <span className="text-muted-foreground">{m.detail}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Signal Timeline */}
            <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
              {(() => {
                const startIdx = Math.max(0, timelineSignals.length - 50);
                return timelineSignals.slice(startIdx).map((sig, i) => {
                  if (!sig) return null;
                  const origIdx = startIdx + i;
                  const hasEnhance = sig.description?.includes("共振") || sig.description?.includes("确认→") || sig.description?.includes("大盘");
                  return (
                    <div key={`sig-${origIdx}`} className="flex items-center gap-2 text-xs p-2 rounded bg-muted/30">
                      <Badge variant={sig.type === "buy" ? "default" : "destructive"} className="text-xs h-5 shrink-0">
                        {sig.type === "buy" ? "买" : "卖"}
                      </Badge>
                      <span className="font-mono text-muted-foreground">{timeline[origIdx]?.time}</span>
                      <span className={sig.type === "buy" ? "text-red-500" : "text-green-500"}>{sig.reason}</span>
                      <span className="text-muted-foreground ml-auto">
                        {sig.strength === "strong" ? "强" : sig.strength === "medium" ? "中" : "弱"}
                      </span>
                      {hasEnhance && (
                        <Shield className="h-3 w-3 text-amber-500 shrink-0" title={sig.description} />
                      )}
                    </div>
                  );
                });
              })()}
            </div>

            {/* v3.6 胜率增强提示 */}
            {(() => {
              const { totalSigs, strongSigs, confluenceCount, keyLevelCount, vwapSlopeCount, indexRegimeCount } = signalCounts;
              const strongRatio = totalSigs > 0 ? (strongSigs / totalSigs * 100).toFixed(0) : "0";
              const enhancements: { icon: string; label: string; count: number; color: string }[] = [
                { icon: "🎯", label: "因子共振", count: confluenceCount, color: "text-amber-600 dark:text-amber-400" },
                { icon: "📍", label: "关键价位", count: keyLevelCount, color: "text-blue-600 dark:text-blue-400" },
                { icon: "📐", label: "均价拐头", count: vwapSlopeCount, color: "text-purple-600 dark:text-purple-400" },
                { icon: "🌐", label: "大盘联动", count: indexRegimeCount, color: "text-teal-600 dark:text-teal-400" },
              ];
              const activeEnhancements = enhancements.filter(e => e.count > 0);
              if (activeEnhancements.length === 0) return null;

              return (
                <div className="mt-3 p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Shield className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">胜率增强 (v3.6)</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">强信号占比 {strongRatio}%</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {activeEnhancements.map(e => (
                      <span key={e.label} className={`inline-flex items-center gap-1 text-[10px] ${e.color}`}>
                        <span>{e.icon}</span>
                        <span>{e.label}</span>
                        <span className="font-mono font-bold">{e.count}</span>
                      </span>
                    ))}
                  </div>
                  <div className="text-[9px] text-muted-foreground mt-1.5 leading-relaxed">
                    {confluenceCount > 0 && "多因子共振确认的信号胜率显著高于单因子。"}
                    {keyLevelCount > 0 && "关键价位附近的信号更可靠。"}
                    {vwapSlopeCount > 0 && "均价线拐头确认趋势反转。"}
                    {indexRegimeCount > 0 && "大盘方向与个股信号一致时增强。"}
                  </div>
                </div>
              );
            })()}

            {latestTimelineSignal && (
              <div className="mt-4 p-3 rounded-lg border border-border">
                <div className="flex items-start gap-2">
                  <Badge
                    variant={latestTimelineSignal.type === "buy" ? "default" : "destructive"}
                    className="shrink-0 mt-0.5"
                  >
                    {latestTimelineSignal.type === "buy" ? "做多T" : "做空T"}
                  </Badge>
                  <div className="text-sm text-muted-foreground">
                    {latestTimelineSignal.reason}。信号强度:{" "}
                    {latestTimelineSignal.strength === "strong" ? "强" : latestTimelineSignal.strength === "medium" ? "中" : "弱"}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : chartData.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(() => {
                const lastItem = chartData[chartData.length - 1];
                const prevItem = chartData.length > 1 ? chartData[chartData.length - 2] : null;

                let macdSignal = "震荡";
                let macdColor = "text-muted-foreground";
                let macdIcon = <Minus className="h-4 w-4" />;

                if (lastItem?.dif != null && lastItem?.dea != null && prevItem?.dif != null && prevItem?.dea != null) {
                  if (prevItem.dif! <= prevItem.dea! && lastItem.dif! > lastItem.dea!) {
                    macdSignal = "金叉买入";
                    macdColor = "text-red-500";
                    macdIcon = <TrendingUp className="h-4 w-4" />;
                  } else if (prevItem.dif! >= prevItem.dea! && lastItem.dif! < lastItem.dea!) {
                    macdSignal = "死叉卖出";
                    macdColor = "text-green-500";
                    macdIcon = <TrendingDown className="h-4 w-4" />;
                  } else if (lastItem.dif! > lastItem.dea!) {
                    macdSignal = "多头趋势";
                    macdColor = "text-red-500";
                    macdIcon = <TrendingUp className="h-4 w-4" />;
                  } else {
                    macdSignal = "空头趋势";
                    macdColor = "text-green-500";
                    macdIcon = <TrendingDown className="h-4 w-4" />;
                  }
                }

                return (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <div className={macdColor}>{macdIcon}</div>
                    <div>
                      <div className="text-xs text-muted-foreground">MACD信号</div>
                      <div className={`text-sm font-medium ${macdColor}`}>{macdSignal}</div>
                    </div>
                  </div>
                );
              })()}

              {(() => {
                const lastItem = chartData[chartData.length - 1];
                const avgVol = chartData.slice(-20).reduce((s, d) => s + d.volume, 0) / Math.min(20, chartData.length);
                const volRatio = lastItem && avgVol > 0 ? lastItem.volume / avgVol : 1;

                let volSignal = "正常量";
                let volColor = "text-muted-foreground";

                if (volRatio > 2) { volSignal = "放量"; volColor = "text-orange-500"; }
                else if (volRatio > 1.5) { volSignal = "温和放量"; volColor = "text-yellow-500"; }
                else if (volRatio < 0.5) { volSignal = "缩量"; volColor = "text-blue-500"; }

                return (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <div className={volColor}><BarChart3 className="h-4 w-4" /></div>
                    <div>
                      <div className="text-xs text-muted-foreground">量能状态</div>
                      <div className={`text-sm font-medium ${volColor}`}>{volSignal} ({volRatio.toFixed(2)}x)</div>
                    </div>
                  </div>
                );
              })()}

              {(() => {
                const lastItem = chartData[chartData.length - 1];
                let trendSignal = "整理";
                let trendColor = "text-muted-foreground";

                if (lastItem?.ma5 != null && lastItem?.ma10 != null && lastItem?.ma20 != null) {
                  if (lastItem.ma5! > lastItem.ma10! && lastItem.ma10! > lastItem.ma20!) {
                    trendSignal = "多头排列"; trendColor = "text-red-500";
                  } else if (lastItem.ma5! < lastItem.ma10! && lastItem.ma10! < lastItem.ma20!) {
                    trendSignal = "空头排列"; trendColor = "text-green-500";
                  }
                }

                return (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <div className={trendColor}><Activity className="h-4 w-4" /></div>
                    <div>
                      <div className="text-xs text-muted-foreground">均线趋势</div>
                      <div className={`text-sm font-medium ${trendColor}`}>{trendSignal}</div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {latestSignal && latestSignal.type !== "hold" && (
              <div className="mt-4 p-3 rounded-lg border border-border">
                <div className="flex items-start gap-2">
                  <Badge
                    variant={latestSignal.type === "buy" ? "default" : "destructive"}
                    className="shrink-0 mt-0.5"
                  >
                    {latestSignal.type === "buy" ? "做多T" : "做空T"}
                  </Badge>
                  <div className="text-sm text-muted-foreground">
                    {latestSignal.reason}。信号强度:{" "}
                    {latestSignal.strength === "strong" ? "强" : latestSignal.strength === "medium" ? "中" : "弱"}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
