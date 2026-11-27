"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { classifyConcept, getConceptCategory } from "@/lib/concept-categories";
import {
  Flame,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Loader2,
  Layers,
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
    degraded?: boolean; // true = 东财不可用，当前为本地缓存快照（历史列完整，实时列可能延迟）
  };
  error?: string;
}

/** 每日主题 chips 上限：窄列内超出折叠为 +N（悬停 title 可见全部） */
const MAX_DAY_THEME_CHIPS = 4;

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

interface HotConceptsPanelProps {
  /** 当前选中的概念名（用于跨面板联动筛选，null/undefined = 未选） */
  selectedConcept?: string | null;
  /** 点击概念条目回调（传 null 表示取消选中） */
  onSelectConcept?: (concept: string | null) => void;
  /** 当前选中的概念大类 id（主题聚合行联动，null/undefined = 未选） */
  selectedCategoryId?: string | null;
  /** 点击主题大类回调（传 null 表示取消选中） */
  onSelectCategory?: (id: string | null) => void;
}

export function HotConceptsPanel({
  selectedConcept = null,
  onSelectConcept,
  selectedCategoryId = null,
  onSelectCategory,
}: HotConceptsPanelProps) {
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
      // 服务端后台补全未完成 → 自动轮询直至收敛（最多 15 次；降级快照时拉长间隔减少对受限上游的击打）
      if (!json.meta?.complete && pollCount.current < 15) {
        pollCount.current += 1;
        if (pollTimer.current) clearTimeout(pollTimer.current);
        pollTimer.current = setTimeout(() => { if (mounted.current) load(false); }, json.meta?.degraded ? 8000 : 3000);
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

  // 每日主题归类：单日 Top8 概念按大类归并（如 流感/独家药品/特色药 → 医药×6 · 消费×2），
  // 让「当天热点是什么」在每个日期列内一眼可读；排序按概念数降序，超出 MAX_DAY_THEME_CHIPS 折叠
  const perDayThemes = useMemo(() => {
    const m = new Map<string, { id: string; name: string; count: number }[]>();
    if (!data) return m;
    for (const d of data.perDay) {
      const seen = new Map<string, number>();
      for (const it of d.items) {
        const cid = classifyConcept(it.name);
        seen.set(cid, (seen.get(cid) || 0) + 1);
      }
      const arr = [...seen.entries()]
        .map(([id, count]) => ({ id, name: getConceptCategory(id).name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"));
      m.set(d.date, arr);
    }
    return m;
  }, [data]);

  // 热点主题聚合：把 5 日榜单出现过的概念按大类归并（如 流感/独家药品/特色药 → 医药），
  // 排序按期内上榜概念数降序，一眼看出主线；点击大类可整类筛选个股
  const themeChips = useMemo(() => {
    if (!data) return [];
    const seen = new Map<string, { id: string; name: string; concepts: string[] }>();
    for (const d of data.perDay) {
      for (const it of d.items) {
        const cid = classifyConcept(it.name);
        const g = seen.get(cid) ?? { id: cid, name: getConceptCategory(cid).name, concepts: [] };
        if (!g.concepts.includes(it.name)) g.concepts.push(it.name);
        seen.set(cid, g);
      }
    }
    return [...seen.values()].sort(
      (a, b) => b.concepts.length - a.concepts.length || a.name.localeCompare(b.name, "zh-CN")
    );
  }, [data]);
  const incomplete = !!data && !data.meta.complete;
  const knownRatio = data && data.meta.candidates > 0
    ? Math.min(100, Math.round((data.meta.boardsKnown / data.meta.candidates) * 100))
    : 0;

  // 点击概念 → 通知父组件筛选/取消（未接回调时条目仍可 hover 看详情，不响应点击）
  const toggleConcept = (name: string) => {
    if (!onSelectConcept) return;
    onSelectConcept(selectedConcept === name ? null : name);
  };
  // 点击主题大类 → 通知父组件整类筛选/取消
  const toggleCategory = (id: string) => {
    if (!onSelectCategory) return;
    onSelectCategory(selectedCategoryId === id ? null : id);
  };
  const clickable = typeof onSelectConcept === "function";
  const categoryClickable = typeof onSelectCategory === "function";

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
            {data?.meta?.degraded ? (
              <span
                className="flex items-center gap-1 text-[10px] text-muted-foreground"
                title="东财数据源暂时不可用（限流），当前为本地缓存快照：历史列完整，今日列口径为最近一次成功抓取；点击刷新可重试实时数据"
              >
                <AlertTriangle className="w-3 h-3 shrink-0 text-amber-500" />
                缓存降级
              </span>
            ) : incomplete && (
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
          /* Loading skeleton（高度对齐真实列：日期头 + 主题行 + 8 条概念） */
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 mt-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[128px] rounded-lg" />
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
            {/* 热点主题聚合（概念归类）：同期同族概念归并成主线 */}
            {themeChips.length > 0 && (
              <div className="mt-3 flex items-center gap-1.5 flex-wrap" data-testid="theme-agg-row">
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
                  <Layers className="w-3.5 h-3.5 text-amber-500" />
                  热点主题：
                </span>
                {themeChips.map(g => {
                  const cat = getConceptCategory(g.id);
                  const isActive = selectedCategoryId === g.id;
                  return (
                    <Badge
                      key={g.id}
                      variant="outline"
                      role={categoryClickable ? "button" : undefined}
                      aria-pressed={categoryClickable ? isActive : undefined}
                      onClick={categoryClickable ? () => toggleCategory(g.id) : undefined}
                      className={`h-6 px-2 py-0 text-[11px] gap-1.5 ${categoryClickable ? "cursor-pointer" : ""} ${
                        isActive
                          ? "ring-1 ring-amber-500/60 bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-400"
                          : "bg-muted/40 border-border/60 hover:bg-accent/60"
                      }`}
                      title={`${g.name}：期内 ${g.concepts.length} 个上榜概念（${g.concepts.slice(0, 6).join("、")}${g.concepts.length > 6 ? "…" : ""}）${categoryClickable ? `\n点击${isActive ? "取消" : ""}按该大类整类筛选个股` : ""}`}
                    >
                      <span className={`h-2 w-2 rounded-full shrink-0 ${cat.dot}`} aria-hidden />
                      {g.name}
                      <span className="font-semibold tabular-nums">×{g.concepts.length}</span>
                    </Badge>
                  );
                })}
              </div>
            )}

            {/* 5 日榜单（日期从早到晚，今日在最右；每日列内主题归类 chips） */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 mt-3">
              {dayColumns.map(d => {
                const dayThemes = perDayThemes.get(d.date) ?? [];
                const shownThemes = dayThemes.slice(0, MAX_DAY_THEME_CHIPS);
                const restThemes = dayThemes.length - shownThemes.length;
                return (
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
                  {shownThemes.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1.5" data-testid={`day-themes-${d.date}`}>
                      {shownThemes.map(g => {
                        const cat = getConceptCategory(g.id);
                        const themeActive = selectedCategoryId === g.id;
                        return (
                          <Badge
                            key={g.id}
                            variant="outline"
                            role={categoryClickable ? "button" : undefined}
                            aria-pressed={categoryClickable ? themeActive : undefined}
                            aria-label={`当日主题：${g.name}，${g.count} 个概念`}
                            onClick={categoryClickable ? () => toggleCategory(g.id) : undefined}
                            className={`h-[18px] px-1.5 py-0 text-[10px] gap-1 ${categoryClickable ? "cursor-pointer" : ""} ${
                              themeActive
                                ? "ring-1 ring-amber-500/60 bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-400"
                                : "bg-muted/50 border-border/50 text-muted-foreground hover:bg-accent/60"
                            }`}
                            title={`当日主题：${g.name}（${g.count} 个上榜概念）${categoryClickable ? `\n点击${themeActive ? "取消" : ""}按该大类整类筛选个股` : ""}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cat.dot}`} aria-hidden />
                            {g.name}
                            <span className="font-semibold tabular-nums">×{g.count}</span>
                          </Badge>
                        );
                      })}
                      {restThemes > 0 && (
                        <span
                          className="inline-flex h-[18px] items-center px-0.5 text-[10px] text-muted-foreground/70"
                          title={`其余主题：${dayThemes.slice(MAX_DAY_THEME_CHIPS).map(t => `${t.name}×${t.count}`).join("、")}`}
                        >
                          +{restThemes}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="space-y-1">
                    {d.items.length === 0 && (
                      <div className="text-[10px] text-muted-foreground py-1">数据补全中…</div>
                    )}
                    {d.items.map(it => {
                      const hot = appearCount.get(it.code) || 0;
                      const isActive = it.name === selectedConcept;
                      const cat = getConceptCategory(classifyConcept(it.name));
                      return (
                        <button
                          type="button"
                          key={it.code}
                          onClick={() => toggleConcept(it.name)}
                          disabled={!clickable}
                          aria-pressed={clickable ? isActive : undefined}
                          className={`flex w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition-colors min-w-0 ${clickable ? "cursor-pointer" : "cursor-default"} ${isActive ? "bg-amber-500/15 ring-1 ring-amber-500/50" : "hover:bg-accent/60"}`}
                          title={`${it.name}（${it.code}）· 归类：${cat.name}\n当日 ${fmtPct(it.changePercent)} · 成交 ${it.amountYi} 亿${it.volRatio != null ? ` · 量能 ${it.volRatio}x` : ""}${hot >= 2 ? `\n近5日上榜 ${hot} 次` : ""}${clickable ? `\n点击${isActive ? "取消" : ""}筛选该概念` : ""}`}
                        >
                          <span
                            className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[9px] font-bold ${RANK_STYLES[it.rank - 1]}`}
                            aria-label={`第${it.rank}名`}
                          >
                            {it.rank}
                          </span>
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${cat.dot}`}
                            aria-label={`归类：${cat.name}`}
                            title={`归类：${cat.name}`}
                          />
                          <span className={`flex-1 truncate text-xs font-medium ${isActive ? "text-amber-700 dark:text-amber-400" : ""}`}>{it.name}</span>
                          {hot >= 2 && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400 shrink-0" title={`近5日上榜 ${hot} 次`}>
                              <Flame className="w-2.5 h-2.5" />
                              {hot}
                            </span>
                          )}
                          <span className={`shrink-0 text-xs font-semibold tabular-nums ${pctColor(it.changePercent)}`}>
                            {fmtPct(it.changePercent)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                );
              })}
            </div>

            {/* 频次摘要 + 口径说明 */}
            <div className="mt-2.5 pt-2 border-t border-border/50 flex flex-wrap items-center gap-1.5">
              {freqChips.length > 0 && (
                <>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Flame className="w-3 h-3 text-amber-500" />
                    5 日上榜最多：
                  </span>
                  {freqChips.map(f => {
                    const chipsActive = f.name === selectedConcept;
                    return (
                      <Badge
                        key={f.code}
                        variant="outline"
                        role={clickable ? "button" : undefined}
                        aria-pressed={clickable ? chipsActive : undefined}
                        onClick={clickable ? () => toggleConcept(f.name) : undefined}
                        className={`h-5 px-1.5 py-0 text-[10px] gap-1 bg-amber-500/5 border-amber-500/25 text-amber-700 dark:text-amber-400 ${clickable ? "cursor-pointer" : ""} ${chipsActive ? "ring-1 ring-amber-500/60 bg-amber-500/15" : "hover:bg-amber-500/10"}`}
                        title={`${f.name} 期内上榜 ${f.count} 次 · 最好名次第 ${f.bestRank} 名${f.totalGain != null ? ` · 5日累计 ${fmtPct(f.totalGain)}` : ""}${clickable ? `\n点击${chipsActive ? "取消" : ""}筛选该概念` : ""}`}
                      >
                        {f.name}
                        <span className="font-semibold">×{f.count}</span>
                      </Badge>
                    );
                  })}
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
