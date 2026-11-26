"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Flame,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Loader2,
} from "lucide-react";

// ── 近 5 日热点概念面板（每日概念板块涨幅前八） ─────────────────
// 数据：/api/stock/hot-concepts（东财概念板块，剔除风格类伪概念）
// 服务端后台渐进补全历史日 K（meta.complete），前端自动轮询直至收敛

interface HotConceptItem {
  code: string;
  name: string;
  changePercent: number;
  amountYi: number;
  volRatio: number | null;
  rank: number;
}

interface HotConceptDay {
  date: string;
  weekday: string;
  isToday: boolean;
  items: HotConceptItem[];
}

interface HotConceptFrequency {
  code: string;
  name: string;
  count: number;
  bestRank: number;
  totalGain: number | null;
  days: string[];
}

interface HotConceptsData {
  success: boolean;
  updatedAt: string;
  days: string[];
  perDay: HotConceptDay[];
  frequency: HotConceptFrequency[];
  meta: {
    todayBoards: number;
    boardsKnown: number;
    candidates: number;
    complete: boolean;
    warmupRunning: boolean;
    daysBack: number;
  };
  error?: string;
}

const RANK_STYLES = [
  "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40", // 1
  "bg-muted text-foreground/80 border-border",                               // 2
  "bg-muted/60 text-muted-foreground border-border/70",                      // 3
  "bg-muted/40 text-muted-foreground/85 border-border/60",                   // 4
  "bg-muted/30 text-muted-foreground/75 border-border/50",                   // 5
  "bg-muted/30 text-muted-foreground/70 border-border/50",                   // 6
  "bg-muted/20 text-muted-foreground/65 border-border/40",                   // 7
  "bg-muted/20 text-muted-foreground/60 border-border/40",                   // 8
];

function fmtPct(v: number): string {
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function pctColor(v: number): string {
  if (v > 0) return "text-red-500 dark:text-red-400";
  if (v < 0) return "text-green-600 dark:text-green-400";
  return "text-muted-foreground";
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function HotConceptsPanel() {
  const [data, setData] = useState<HotConceptsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollCount = useRef(0);
  const mounted = useRef(true);

  const load = useCallback(async (refresh: boolean) => {
    if (refresh) setRefreshing(true);
    setError(null);
    try {
      const resp = await fetch(`/api/stock/hot-concepts${refresh ? "?refresh=1" : ""}`);
      const json: HotConceptsData = await resp.json();
      if (!mounted.current) return;
      if (!resp.ok || !json?.success) throw new Error(json?.error || `HTTP ${resp.status}`);
      setData(json);
      // 服务端后台补全未完成 → 自动轮询直至收敛（最多 15 次）
      if (!json.meta?.complete && pollCount.current < 15) {
        pollCount.current += 1;
        if (pollTimer.current) clearTimeout(pollTimer.current);
        pollTimer.current = setTimeout(() => { if (mounted.current) load(false); }, 3000);
      }
    } catch (e: any) {
      if (!mounted.current) return;
      setError(e?.message || "加载失败");
      // 轮询中途失败（如东财瞬时限流）→ 预算内继续重试
      if (pollCount.current < 15) {
        pollCount.current += 1;
        if (pollTimer.current) clearTimeout(pollTimer.current);
        pollTimer.current = setTimeout(() => { if (mounted.current) load(false); }, 3000);
      }
    } finally {
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    load(false);
    return () => {
      mounted.current = false;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [load]);

  // 上榜次数（用于连续上榜火焰标记）：freqMap 只含 top8，这里从 perDay 重算
  const appearCount = useMemo(() => {
    const m = new Map<string, number>();
    if (!data) return m;
    for (const d of data.perDay) for (const it of d.items) m.set(it.code, (m.get(it.code) || 0) + 1);
    return m;
  }, [data]);

  const dayColumns = useMemo(() => (data ? [...data.perDay] : []), [data]); // 日期从小到大（升序）
  const freqChips = useMemo(() => (data?.frequency || []).filter(f => f.count >= 2).slice(0, 5), [data]);
  const incomplete = !!data && !data.meta.complete;
  const knownRatio = data && data.meta.candidates > 0
    ? Math.min(100, Math.round((data.meta.boardsKnown / data.meta.candidates) * 100))
    : 0;

  return (
    <Card className="border-border/50 shadow-sm" data-testid="hot-concepts-panel">
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Flame className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-semibold">近 5 日热点概念</h3>
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-amber-500/5 border-amber-500/20 text-amber-600 dark:text-amber-400">
              每日涨幅前八
            </Badge>
            {incomplete && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                后台补全中 {knownRatio}%
              </span>
            )}
            {data?.updatedAt && (
              <span className="text-[10px] text-muted-foreground hidden sm:inline">更新 {fmtTime(data.updatedAt)}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => { pollCount.current = 0; load(true); }}
              disabled={refreshing}
              aria-label="刷新热点概念"
              title="刷新（绕过缓存重新拉取）"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setCollapsed(c => !c)}
              aria-label={collapsed ? "展开热点概念面板" : "折叠热点概念面板"}
              aria-expanded={!collapsed}
            >
              {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>

        {collapsed ? null : loading && !data ? (
          /* Loading skeleton */
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 mt-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[104px] rounded-lg" />
            ))}
          </div>
        ) : error && !data ? (
          /* Error state */
          <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
            <div className="flex items-center gap-2 text-xs text-destructive">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              热点概念加载失败：{error}
            </div>
            <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={() => { pollCount.current = 0; load(true); }}>
              重试
            </Button>
          </div>
        ) : data && (data.perDay.length === 0) ? (
          <div className="mt-3 text-xs text-muted-foreground">暂无数据，请稍后刷新重试</div>
        ) : data ? (
          <>
            {/* 5 日榜单（日期从早到晚，今日在最右） */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 mt-3">
              {dayColumns.map(d => (
                <div key={d.date} className="rounded-lg border border-border/60 bg-muted/20 p-2.5 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <span className="text-xs font-semibold text-foreground/90">{d.date.slice(5).replace("-", "/")}</span>
                    <span className="flex items-center gap-1">
                      {d.isToday && (
                        <Badge className="h-4 px-1 py-0 text-[9px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30" variant="outline">
                          今日
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground">{d.weekday}</span>
                    </span>
                  </div>
                  <div className="space-y-1">
                    {d.items.length === 0 && (
                      <div className="text-[10px] text-muted-foreground py-1">数据补全中…</div>
                    )}
                    {d.items.map(it => {
                      const hot = appearCount.get(it.code) || 0;
                      return (
                        <div
                          key={it.code}
                          className="flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-accent/60 transition-colors min-w-0"
                          title={`${it.name}（${it.code}）\n当日 ${fmtPct(it.changePercent)} · 成交 ${it.amountYi} 亿${it.volRatio != null ? ` · 量能 ${it.volRatio}x` : ""}${hot >= 2 ? `\n近5日上榜 ${hot} 次` : ""}`}
                        >
                          <span
                            className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[9px] font-bold ${RANK_STYLES[it.rank - 1]}`}
                            aria-label={`第${it.rank}名`}
                          >
                            {it.rank}
                          </span>
                          <span className="flex-1 truncate text-xs font-medium">{it.name}</span>
                          {hot >= 2 && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400 shrink-0" title={`近5日上榜 ${hot} 次`}>
                              <Flame className="w-2.5 h-2.5" />
                              {hot}
                            </span>
                          )}
                          <span className={`shrink-0 text-xs font-semibold tabular-nums ${pctColor(it.changePercent)}`}>
                            {fmtPct(it.changePercent)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* 频次摘要 + 口径说明 */}
            <div className="mt-2.5 pt-2 border-t border-border/50 flex flex-wrap items-center gap-1.5">
              {freqChips.length > 0 && (
                <>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Flame className="w-3 h-3 text-amber-500" />
                    5 日上榜最多：
                  </span>
                  {freqChips.map(f => (
                    <Badge
                      key={f.code}
                      variant="outline"
                      className="h-5 px-1.5 py-0 text-[10px] gap-1 bg-amber-500/5 border-amber-500/25 text-amber-700 dark:text-amber-400"
                      title={`${f.name} 期内上榜 ${f.count} 次 · 最好名次第 ${f.bestRank} 名${f.totalGain != null ? ` · 5日累计 ${fmtPct(f.totalGain)}` : ""}`}
                    >
                      {f.name}
                      <span className="font-semibold">×{f.count}</span>
                    </Badge>
                  ))}
                </>
              )}
              <span className="text-[10px] text-muted-foreground ml-auto">
                东方财富概念板块（剔除昨日涨停/连板等风格类）· 今日为盘中实时涨幅 · 成交额单位：亿
              </span>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default HotConceptsPanel;
