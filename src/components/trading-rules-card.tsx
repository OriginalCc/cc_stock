"use client";

import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertTriangle, Zap, Clock, Volume2, Activity, Scale, BookOpen, Info,
  ChevronDown, ChevronRight, Target, TrendingUp, Shield, BarChart3,
  Filter, Cpu, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import type { PulseVolumeMarker } from "@/lib/chart-shared";

interface TradingRulesCardProps {
  autoExpanded?: boolean;
  pvMarkers?: PulseVolumeMarker[];
}

// Map pvMarker types to rule section keys that should be highlighted
type RuleKey = "vol_decline_danger" | "vol_decline_position" | "vol_surge_strong" | "pulse_caution" | "pulse_decline_danger" | "shrink_rise" | "early_vol_drop" | "wash_trade" | "vol_rise" | "shrink_rise_warn" | "slow_decline";

function getActiveRules(markers: PulseVolumeMarker[]): Set<RuleKey> {
  const active = new Set<RuleKey>();
  for (const m of markers) {
    switch (m.type) {
      case "volume_decline":
        active.add("vol_decline_danger");
        active.add("vol_decline_position");
        break;
      case "volume_surge":
        active.add("vol_surge_strong");
        break;
      case "pulse":
        active.add("pulse_caution");
        break;
      case "pulse_decline":
        active.add("pulse_decline_danger");
        active.add("vol_decline_danger");
        break;
      case "early_vol_drop":
        active.add("early_vol_drop");
        active.add("vol_decline_danger");
        break;
      case "wash_trade":
        active.add("wash_trade");
        break;
      case "vol_rise":
        active.add("vol_rise");
        active.add("vol_surge_strong");
        break;
      case "shrink_rise":
        active.add("shrink_rise");
        active.add("shrink_rise_warn");
        break;
      case "slow_decline":
        active.add("slow_decline");
        active.add("vol_decline_danger");
        break;
    }
  }
  return active;
}

// Section IDs
type SectionId =
  | "selfcheck" | "selection"
  | "position_ladder" | "position_market" | "position_table" | "position_dynamic"
  | "strategy_choice" | "spread_floor" | "timewindow"
  | "buy_signals" | "sell_signals" | "volume_rules"
  | "stoploss" | "voldown_topic" | "voldown_buy" | "forbidden"
  | "market_regime" | "indicators"
  | "cases";

// Navigation group definition
interface NavGroup {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  items: { id: SectionId; label: string; triggerKeys?: RuleKey[]; isNew?: boolean }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: "prep",
    label: "开盘准备",
    icon: <Target className="w-3.5 h-3.5" />,
    color: "amber",
    items: [
      { id: "selfcheck", label: "自检三问" },
      { id: "selection", label: "标的筛选", isNew: true },
    ],
  },
  {
    id: "position",
    label: "仓位管理",
    icon: <Scale className="w-3.5 h-3.5" />,
    color: "red",
    items: [
      { id: "position_ladder", label: "仓位阶梯" },
      { id: "position_market", label: "大盘调节器" },
      { id: "position_table", label: "仓位速查表" },
      { id: "position_dynamic", label: "动态调节", triggerKeys: ["vol_decline_position"] },
    ],
  },
  {
    id: "strategy",
    label: "做T策略",
    icon: <Zap className="w-3.5 h-3.5" />,
    color: "violet",
    items: [
      { id: "strategy_choice", label: "正T vs 反T" },
      { id: "spread_floor", label: "差价底线", isNew: true },
      { id: "timewindow", label: "时间窗口" },
    ],
  },
  {
    id: "signals",
    label: "信号识别",
    icon: <Activity className="w-3.5 h-3.5" />,
    color: "emerald",
    items: [
      { id: "buy_signals", label: "买点信号", isNew: true },
      { id: "sell_signals", label: "卖点信号", isNew: true },
      { id: "volume_rules", label: "量能确认", triggerKeys: ["vol_decline_danger", "vol_surge_strong", "pulse_caution", "early_vol_drop", "wash_trade", "shrink_rise_warn", "vol_rise", "slow_decline"] },
    ],
  },
  {
    id: "risk",
    label: "风险管理",
    icon: <Shield className="w-3.5 h-3.5" />,
    color: "rose",
    items: [
      { id: "stoploss", label: "止损止盈" },
      { id: "voldown_topic", label: "放量下跌专题", triggerKeys: ["vol_decline_danger", "pulse_decline_danger"] },
      { id: "voldown_buy", label: "放量下跌买点" },
      { id: "forbidden", label: "禁忌规矩" },
    ],
  },
  {
    id: "market",
    label: "市场环境",
    icon: <TrendingUp className="w-3.5 h-3.5" />,
    color: "cyan",
    items: [
      { id: "market_regime", label: "行情识别", isNew: true },
      { id: "indicators", label: "技术指标", isNew: true },
    ],
  },
  {
    id: "practice",
    label: "实战",
    icon: <BookOpen className="w-3.5 h-3.5" />,
    color: "rose",
    items: [
      { id: "cases", label: "实战案例" },
    ],
  },
];

export const TradingRulesCard = React.memo(function TradingRulesCard({ autoExpanded, pvMarkers = [] }: TradingRulesCardProps) {
  const [manualOverride, setManualOverride] = useState<boolean | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>("selfcheck");

  const activeRules = useMemo(() => getActiveRules(pvMarkers), [pvMarkers]);
  const hasDangerSignal = activeRules.has("vol_decline_danger") || activeRules.has("pulse_decline_danger");
  const expanded = manualOverride === true;

  // Auto-select preferred section on open
  const preferredSection = useMemo<SectionId>(() => {
    if (hasDangerSignal) return "voldown_topic";
    if (activeRules.has("vol_decline_position")) return "position_dynamic";
    const volumeKeys: RuleKey[] = ["vol_decline_danger", "vol_surge_strong", "pulse_caution", "early_vol_drop", "wash_trade", "shrink_rise_warn", "vol_rise", "slow_decline"];
    if (volumeKeys.some(k => activeRules.has(k))) return "volume_rules";
    return "selfcheck";
  }, [hasDangerSignal, activeRules]);

  const handleToggleExpand = () => {
    const willExpand = manualOverride !== true;
    setManualOverride(prev => !prev);
    if (willExpand) setActiveSection(preferredSection);
  };

  // Helper: check if a section has any active trigger
  const sectionHasTrigger = (triggerKeys?: RuleKey[]): boolean => {
    if (!triggerKeys) return false;
    return triggerKeys.some(k => activeRules.has(k));
  };

  // Helper: render active indicator badge
  const activeBadge = (key: RuleKey) => {
    if (!activeRules.has(key)) return null;
    return (
      <Badge variant="outline" className="text-[9px] h-4 px-1 bg-red-500/15 text-red-600 border-red-500/30 animate-pulse ml-1">
        ⚠ 触发
      </Badge>
    );
  };

  // Helper: check rule active
  const isActive = (key: RuleKey) => activeRules.has(key);

  const groupColorMap: Record<string, { text: string; bg: string; border: string; hoverBg: string; activeBg: string; activeText: string }> = {
    amber: { text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", hoverBg: "hover:bg-amber-500/15", activeBg: "bg-amber-500/20", activeText: "text-amber-700 dark:text-amber-300" },
    red: { text: "text-red-600 dark:text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", hoverBg: "hover:bg-red-500/15", activeBg: "bg-red-500/20", activeText: "text-red-700 dark:text-red-300" },
    violet: { text: "text-violet-600 dark:text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/20", hoverBg: "hover:bg-violet-500/15", activeBg: "bg-violet-500/20", activeText: "text-violet-700 dark:text-violet-300" },
    emerald: { text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", hoverBg: "hover:bg-emerald-500/15", activeBg: "bg-emerald-500/20", activeText: "text-emerald-700 dark:text-emerald-300" },
    rose: { text: "text-rose-600 dark:text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/20", hoverBg: "hover:bg-rose-500/15", activeBg: "bg-rose-500/20", activeText: "text-rose-700 dark:text-rose-300" },
    cyan: { text: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/20", hoverBg: "hover:bg-cyan-500/15", activeBg: "bg-cyan-500/20", activeText: "text-cyan-700 dark:text-cyan-300" },
  };

  // ── Render sidebar navigation ──
  const renderSidebar = () => (
    <div className="w-44 shrink-0 border-r border-border/40 pr-2 hidden md:block">
      <ScrollArea className="h-full max-h-[500px]">
        <div className="space-y-3 py-1">
          {NAV_GROUPS.map(group => {
            const gc = groupColorMap[group.color] || groupColorMap.amber;
            return (
              <div key={group.id}>
                <div className={`flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold ${gc.text} uppercase tracking-wider`}>
                  {group.icon}
                  {group.label}
                </div>
                <div className="space-y-0.5 ml-1">
                  {group.items.map(item => {
                    const isActiveSection = activeSection === item.id;
                    const hasTrigger = sectionHasTrigger(item.triggerKeys);
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveSection(item.id)}
                        className={`w-full text-left flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors ${
                          isActiveSection
                            ? `${gc.activeBg} ${gc.activeText} font-semibold`
                            : `text-muted-foreground ${gc.hoverBg} hover:text-foreground`
                        }`}
                      >
                        <span className="truncate flex-1">{item.label}</span>
                        {item.isNew && (
                          <span className="text-[8px] font-bold px-1 py-0 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">NEW</span>
                        )}
                        {hasTrigger && (
                          <span className="text-red-500 text-[9px] leading-none animate-pulse shrink-0">⚠</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );

  // ── Render mobile navigation ──
  const renderMobileNav = () => (
    <div className="md:hidden mb-2">
      <div className="flex flex-wrap gap-1">
        {NAV_GROUPS.map(group => {
          const gc = groupColorMap[group.color] || groupColorMap.amber;
          return (
            <div key={group.id} className="flex items-center gap-0.5">
              {group.items.map(item => {
                const isActiveSection = activeSection === item.id;
                const hasTrigger = sectionHasTrigger(item.triggerKeys);
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id)}
                    className={`text-[9px] px-1.5 py-0.5 rounded-full transition-colors ${
                      isActiveSection
                        ? `${gc.activeBg} ${gc.activeText} font-semibold`
                        : "text-muted-foreground bg-muted/30 hover:bg-muted/50"
                    }`}
                  >
                    {item.label}
                    {hasTrigger && <span className="text-red-500 ml-0.5">⚠</span>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── Render content for the active section ──
  const renderContent = () => {
    switch (activeSection) {

      // ──────────── 开盘准备 ────────────
      case "selfcheck":
        return (
          <div className="p-3 rounded-lg border border-amber-500/30 bg-gradient-to-r from-amber-500/8 to-orange-500/5">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-base">🎯</span>
              <span className="text-xs font-bold text-amber-700 dark:text-amber-300">做T前必问三件事（3秒快速自检）</span>
            </div>
            <div className="text-[11px] leading-relaxed space-y-1.5">
              <div className="flex items-start gap-2 p-1.5 rounded border border-amber-500/10 bg-amber-500/5">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-bold bg-red-500/15 text-red-600 border border-red-500/25 shrink-0">1</span>
                <div>
                  <span className="text-foreground font-medium">大盘安全吗？</span>
                  <span className="text-muted-foreground ml-1">深证红盘✅ → 可做T；深证暴跌🚫 → 空仓</span>
                </div>
              </div>
              <div className="flex items-start gap-2 p-1.5 rounded border border-amber-500/10 bg-amber-500/5">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-bold bg-orange-500/15 text-orange-600 border border-orange-500/25 shrink-0">2</span>
                <div>
                  <span className="text-foreground font-medium">方向对了吗？</span>
                  <span className="text-muted-foreground ml-1">三跌偏反T(先卖再买)，三涨偏正T，方向错=白做</span>
                </div>
              </div>
              <div className="flex items-start gap-2 p-1.5 rounded border border-amber-500/10 bg-amber-500/5">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-bold bg-green-500/15 text-green-600 border border-green-500/25 shrink-0">3</span>
                <div>
                  <span className="text-foreground font-medium">仓位控住了吗？</span>
                  <span className="text-muted-foreground ml-1">1万资金：三跌≤2500，双跌≤3300，三涨≤4000</span>
                </div>
              </div>
            </div>
          </div>
        );

      case "selection":
        return (
          <div className="space-y-3">
            <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
              <div className="flex items-center gap-1.5 mb-2">
                <Filter className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">标的筛选标准（必须同时满足）</span>
              </div>
              <div className="text-[11px] text-muted-foreground leading-relaxed space-y-1.5">
                <div className="flex items-start gap-2 p-1.5 rounded border border-emerald-500/10 bg-emerald-500/5">
                  <span className="text-emerald-500 text-xs shrink-0">📊</span>
                  <div><span className="text-foreground font-medium">日均振幅 ≥ 3%</span><p>振幅太小做T差价不够，扣完手续费白忙</p></div>
                </div>
                <div className="flex items-start gap-2 p-1.5 rounded border border-emerald-500/10 bg-emerald-500/5">
                  <span className="text-emerald-500 text-xs shrink-0">💰</span>
                  <div><span className="text-foreground font-medium">日均成交额 ≥ 5000万</span><p>流动性不足的股票，冲高卖不出、急跌买不到</p></div>
                </div>
                <div className="flex items-start gap-2 p-1.5 rounded border border-emerald-500/10 bg-emerald-500/5">
                  <span className="text-emerald-500 text-xs shrink-0">✅</span>
                  <div><span className="text-foreground font-medium">非ST非停牌</span><p>特殊状态股票不可做T</p></div>
                </div>
                <div className="flex items-start gap-2 p-1.5 rounded border border-emerald-500/10 bg-emerald-500/5">
                  <span className="text-emerald-500 text-xs shrink-0">📈</span>
                  <div><span className="text-foreground font-medium">非涨跌停</span><p>已封板股票无日内操作空间</p></div>
                </div>
              </div>
            </div>
            <div className="p-3 rounded-lg border border-red-500/20 bg-red-500/5">
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                <span className="text-xs font-semibold text-red-700 dark:text-red-300">排除标的</span>
              </div>
              <div className="text-[11px] text-muted-foreground leading-relaxed space-y-1.5">
                <div className="flex items-start gap-2 p-1.5 rounded border border-red-500/10"><span className="text-red-500 text-xs shrink-0">🚫</span><div><span className="text-foreground font-medium">大盘蓝筹（银行/保险）</span><p>波动太小，做T空间不足</p></div></div>
                <div className="flex items-start gap-2 p-1.5 rounded border border-red-500/10"><span className="text-red-500 text-xs shrink-0">🚫</span><div><span className="text-foreground font-medium">成交量极度萎缩的股票</span><p>流动性风险</p></div></div>
                <div className="flex items-start gap-2 p-1.5 rounded border border-red-500/10"><span className="text-red-500 text-xs shrink-0">🚫</span><div><span className="text-foreground font-medium">刚上市新股</span><p>波动无规律，技术指标失效</p></div></div>
                <div className="flex items-start gap-2 p-1.5 rounded border border-red-500/10"><span className="text-red-500 text-xs shrink-0">🚫</span><div><span className="text-foreground font-medium">利空消息股</span><p>可能连续跌停</p></div></div>
              </div>
            </div>
          </div>
        );

      // ──────────── 仓位管理 ────────────
      case "position_ladder":
        return (
          <div className="p-3 rounded-lg border border-red-500/20 bg-red-500/5">
            <div className="flex items-center gap-1.5 mb-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
              <span className="text-xs font-semibold text-red-700 dark:text-red-300">仓位阶梯（大盘×板块×个股 三维决策）</span>
            </div>
            <div className="text-[11px] text-muted-foreground leading-relaxed space-y-1.5">
              <p className="text-foreground font-medium mb-1.5">以深证成指为大盘方向，按三维度共振数定仓位等级：</p>
              <div className="space-y-1">
                <div className="flex items-center gap-2 p-2 rounded-md border border-green-500/30 bg-green-500/10">
                  <span className="inline-flex items-center justify-center w-8 h-7 rounded text-[10px] font-bold bg-green-500/20 text-green-600 border border-green-500/30 shrink-0">≤1/4</span>
                  <div className="flex-1"><span className="text-green-600 dark:text-green-400 font-bold text-xs">🚫 一级·极度危险</span><span className="text-green-500/70 text-[10px] ml-1">深证↓+板块↓+个股↓（三跌）</span></div>
                  <span className="text-[10px] text-green-500/60 shrink-0">25%</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-md border border-orange-500/25 bg-orange-500/8">
                  <span className="inline-flex items-center justify-center w-8 h-7 rounded text-[10px] font-bold bg-orange-500/15 text-orange-600 border border-orange-500/25 shrink-0">≤1/3</span>
                  <div className="flex-1"><span className="text-orange-600 dark:text-orange-400 font-bold text-xs">⛔ 二级·高危</span><span className="text-orange-500/70 text-[10px] ml-1">任意两维度下跌（双跌）</span></div>
                  <span className="text-[10px] text-orange-500/60 shrink-0">33%</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-md border border-yellow-500/20 bg-yellow-500/5">
                  <span className="inline-flex items-center justify-center w-8 h-7 rounded text-[10px] font-bold bg-yellow-500/10 text-yellow-600 border border-yellow-500/20 shrink-0">20%</span>
                  <div className="flex-1"><span className="text-yellow-600 dark:text-yellow-400 font-bold text-xs">🔸 三级·谨慎</span><span className="text-yellow-500/70 text-[10px] ml-1">单维度弱势+另一维度震荡</span></div>
                  <span className="text-[10px] text-yellow-500/60 shrink-0">20-25%</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-md border border-blue-500/20 bg-blue-500/5">
                  <span className="inline-flex items-center justify-center w-8 h-7 rounded text-[10px] font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20 shrink-0">75%</span>
                  <div className="flex-1"><span className="text-blue-600 dark:text-blue-400 font-bold text-xs">🔹 四级·积极</span><span className="text-blue-500/70 text-[10px] ml-1">至少两维度上涨+一维度震荡</span></div>
                  <span className="text-[10px] text-blue-500/60 shrink-0">70-80%</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-md border border-red-500/25 bg-red-500/8">
                  <span className="inline-flex items-center justify-center w-8 h-7 rounded text-[10px] font-bold bg-red-500/15 text-red-600 border border-red-500/25 shrink-0">95%</span>
                  <div className="flex-1"><span className="text-red-600 dark:text-red-400 font-bold text-xs">✅ 五级·最安全</span><span className="text-red-500/70 text-[10px] ml-1">深证↑+板块↑+个股↑（三涨）</span></div>
                  <span className="text-[10px] text-red-500/60 shrink-0">90-100%</span>
                </div>
              </div>
              <div className="mt-1.5 p-1.5 rounded border border-orange-500/10 bg-orange-500/5">
                <p className="text-orange-600 dark:text-orange-400 font-medium text-[10px]">💡 记忆口诀：三跌1/4、双跌1/3、单弱2成、双涨8成、三涨满仓</p>
              </div>
            </div>
          </div>
        );

      case "position_market":
        return (
          <div className="p-3 rounded-lg border border-orange-500/20 bg-orange-500/5">
            <div className="flex items-center gap-1.5 mb-2">
              <Activity className="w-3.5 h-3.5 text-orange-500" />
              <span className="text-xs font-semibold text-orange-700 dark:text-orange-300">大盘（深证成指）仓位调节器</span>
            </div>
            <div className="text-[11px] text-muted-foreground leading-relaxed space-y-2">
              <p className="text-foreground font-medium">大盘方向是仓位"调节器"，在阶梯基础上微调：</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="p-2 rounded border border-green-500/15 bg-green-500/5">
                  <p className="text-green-600 dark:text-green-400 font-medium text-[11px] mb-1">🔻 深证下跌：全面收紧</p>
                  <div className="space-y-0.5 text-[11px]">
                    <p>• 三跌场景 → 降至1/4（最低级）</p>
                    <p>• 双跌场景 → 不超1/3</p>
                    <p>• 逆势走强 → 上限降低5-10%</p>
                    <p>• 暴跌(&gt;2%) → 空仓，不参与</p>
                  </div>
                </div>
                <div className="p-2 rounded border border-red-500/15 bg-red-500/5">
                  <p className="text-red-600 dark:text-red-400 font-medium text-[11px] mb-1">🔺 深证上涨：适度放宽</p>
                  <div className="space-y-0.5 text-[11px]">
                    <p>• 三涨场景 → 可达90-100%</p>
                    <p>• 双涨场景 → 上限提升至70-80%</p>
                    <p>• 个股回调 → 低吸好时机</p>
                    <p>• 翻红信号 → 仓位可提升一级</p>
                  </div>
                </div>
              </div>
              <div className="mt-1 p-1.5 rounded border border-orange-500/10 bg-orange-500/5">
                <p className="text-orange-600 dark:text-orange-400 font-medium text-[10px]">为什么选深证成指？覆盖深市中小盘和成长股，比上证50灵敏，比创业板指稳定。</p>
              </div>
            </div>
          </div>
        );

      case "position_table":
        return (
          <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
            <div className="flex items-center gap-1.5 mb-2">
              <Scale className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">仓位速查表</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="border-b border-amber-500/10">
                    <th className="text-left py-1.5 px-2 text-amber-600 dark:text-amber-400 font-semibold">深证</th>
                    <th className="text-left py-1.5 px-2 text-amber-600 dark:text-amber-400 font-semibold">板块</th>
                    <th className="text-left py-1.5 px-2 text-amber-600 dark:text-amber-400 font-semibold">个股</th>
                    <th className="text-left py-1.5 px-2 text-amber-600 dark:text-amber-400 font-semibold">建议仓位</th>
                    <th className="text-left py-1.5 px-2 text-amber-600 dark:text-amber-400 font-semibold">做T方向</th>
                    <th className="text-left py-1.5 px-2 text-amber-600 dark:text-amber-400 font-semibold">说明</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/30 bg-green-500/10"><td className="py-1.5 px-2"><span className="text-green-500">↓ 跌</span></td><td className="py-1.5 px-2"><span className="text-green-500">↓ 跌</span></td><td className="py-1.5 px-2"><span className="text-green-500">↓ 跌</span></td><td className="py-1.5 px-2"><span className="text-green-500 font-bold">≤1/4</span></td><td className="py-1.5 px-2"><span className="text-green-500">反T/空仓</span></td><td className="py-1.5 px-2"><span className="text-green-600 font-medium">三跌！</span></td></tr>
                  <tr className="border-b border-border/30"><td className="py-1.5 px-2"><span className="text-green-500">↓ 跌</span></td><td className="py-1.5 px-2"><span className="text-green-500">↓ 跌</span></td><td className="py-1.5 px-2"><span className="text-red-500">↑ 涨</span></td><td className="py-1.5 px-2"><span className="text-orange-500 font-bold">≤1/3</span></td><td className="py-1.5 px-2"><span className="text-red-500">反T冲高卖</span></td><td className="py-1.5 px-2">逆势走强</td></tr>
                  <tr className="border-b border-border/30"><td className="py-1.5 px-2"><span className="text-red-500">↑ 涨</span></td><td className="py-1.5 px-2"><span className="text-red-500">↑ 涨</span></td><td className="py-1.5 px-2"><span className="text-red-500">↑ 涨</span></td><td className="py-1.5 px-2 font-bold text-red-600">90-100%</td><td className="py-1.5 px-2"><span className="text-red-600">正T/反T均可</span></td><td className="py-1.5 px-2"><span className="text-red-600 font-medium">三涨！</span></td></tr>
                  <tr className="border-b border-border/30"><td className="py-1.5 px-2"><span className="text-gray-400">— 盘</span></td><td className="py-1.5 px-2"><span className="text-gray-400">— 盘</span></td><td className="py-1.5 px-2"><span className="text-gray-400">— 盘</span></td><td className="py-1.5 px-2">15-25%</td><td className="py-1.5 px-2"><span className="text-gray-400">观望</span></td><td className="py-1.5 px-2">方向不明</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        );

      case "position_dynamic":
        return (
          <div className={`p-3 rounded-lg border ${isActive("vol_decline_position") ? "border-red-500/40 bg-red-500/5" : "border-orange-500/20 bg-orange-500/5"}`}>
            <div className="flex items-center gap-1.5 mb-2">
              <Activity className={`w-3.5 h-3.5 ${isActive("vol_decline_position") ? "text-red-500" : "text-orange-500"}`} />
              <span className={`text-xs font-semibold ${isActive("vol_decline_position") ? "text-red-700 dark:text-red-300" : "text-orange-700 dark:text-orange-300"}`}>动态调节规矩（根据盘面实时调整）</span>
              {activeBadge("vol_decline_position")}
            </div>
            <div className="text-[11px] text-muted-foreground leading-relaxed space-y-1.5">
              <div className="flex items-start gap-2 p-1.5 rounded border border-red-500/10 bg-red-500/5"><span className="text-red-500 text-xs shrink-0">🔻</span><div><span className="text-foreground font-medium">深证连续3天下跌 → 仓位上限减半</span><p>原1/3→1/6，原30%→15%。</p></div></div>
              <div className="flex items-start gap-2 p-1.5 rounded border border-green-500/10 bg-green-500/5"><span className="text-green-500 text-xs shrink-0">🔺</span><div><span className="text-foreground font-medium">深证翻红（跌→涨）→ 加仓信号</span><p>1/4→1/3，20%→30%。</p></div></div>
              <div className="flex items-start gap-2 p-1.5 rounded border border-red-500/10 bg-red-500/5"><span className="text-red-500 text-xs shrink-0">⛔</span><div><span className="text-foreground font-medium">板块暴跌 + 大盘下跌 → 清仓观望</span><p>行业级利空+系统性风险。</p></div></div>
              <div className={`flex items-start gap-2 p-1.5 rounded border ${isActive("vol_decline_position") ? "border-red-500/40 bg-red-500/10 ring-1 ring-red-500/30" : "border-amber-500/10"}`}>
                <span className={`text-xs shrink-0 ${isActive("vol_decline_position") ? "text-red-500 animate-pulse" : "text-amber-500"}`}>📉</span>
                <div className="flex-1">
                  <div className="flex items-center"><span className={`font-medium ${isActive("vol_decline_position") ? "text-red-600 dark:text-red-400" : "text-foreground"}`}>放量下跌 → 仓位降一级</span>{activeBadge("vol_decline_position")}</div>
                  <p>抛压沉重时，所有仓位建议下调一个等级。如原30%→20%。</p>
                  {isActive("vol_decline_position") && <p className="text-red-600 dark:text-red-400 font-bold text-[10px] mt-1">⚠ 当前检测到放量下跌！建议立即将仓位下调一个等级。</p>}
                </div>
              </div>
              <div className="flex items-start gap-2 p-1.5 rounded border border-amber-500/10"><span className="text-amber-500 text-xs shrink-0">🔄</span><div><span className="text-foreground font-medium">连续2次做T亏损 → 当天停止交易</span><p>大盘下跌时1次亏损即停。</p></div></div>
            </div>
          </div>
        );

      // ──────────── 做T策略 ────────────
      case "strategy_choice":
        return (
          <div className="p-3 rounded-lg border border-violet-500/20 bg-violet-500/5">
            <div className="flex items-center gap-1.5 mb-2">
              <Zap className="w-3.5 h-3.5 text-violet-500" />
              <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">做T策略选择（正T vs 反T）</span>
            </div>
            <div className="text-[11px] text-muted-foreground leading-relaxed space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="p-2 rounded-md border border-green-500/15 bg-green-500/5">
                  <p className="text-green-600 dark:text-green-400 font-bold text-xs mb-1.5">🟢 正T（先买后卖）</p>
                  <p className="text-foreground font-medium mb-1">适用场景：预期股价先跌后涨</p>
                  <div className="space-y-0.5 text-[11px]">
                    <p>• 大盘↑+板块↑+个股↓ → 低吸良机</p>
                    <p>• 大盘震荡+板块↑+个股↓ → 板块保护下低吸</p>
                    <p>• 适合盘中低吸后反弹卖出</p>
                    <p>• 量能配合：缩量下跌→放量反弹</p>
                  </div>
                </div>
                <div className="p-2 rounded-md border border-red-500/15 bg-red-500/5">
                  <p className="text-red-600 dark:text-red-400 font-bold text-xs mb-1.5">🔴 反T(先卖再买)</p>
                  <p className="text-foreground font-medium mb-1">适用场景：预期股价先涨后跌</p>
                  <div className="space-y-0.5 text-[11px]">
                    <p>• 大盘↓+板块↓+个股↑ → 冲高减仓</p>
                    <p>• 大盘↓+板块震荡+个股↑ → 大盘压制下卖出</p>
                    <p>• 适合早盘冲高卖出、盘中回落买回</p>
                    <p>• 量能配合：缩量反弹→放量下跌</p>
                  </div>
                </div>
              </div>
              <div className="p-1.5 rounded border border-violet-500/10 bg-violet-500/5">
                <p className="text-violet-600 dark:text-violet-400 font-medium text-[10px]">⚡ 核心原则：顺势做T！三跌时严禁正T（不抄底），三涨时严禁反T（不卖飞）。</p>
              </div>
            </div>
          </div>
        );

      case "spread_floor":
        return (
          <div className="space-y-3">
            <div className="p-3 rounded-lg border border-violet-500/20 bg-violet-500/5">
              <div className="flex items-center gap-1.5 mb-2">
                <BarChart3 className="w-3.5 h-3.5 text-violet-500" />
                <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">差价底线规矩</span>
              </div>
              <div className="text-[11px] text-muted-foreground leading-relaxed space-y-2">
                <p className="text-foreground font-medium">差价 = |卖出价 - 买回价| / 昨收价 × 100%</p>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 p-2 rounded-md border border-gray-500/20 bg-gray-500/5">
                    <span className="inline-flex items-center justify-center w-12 h-6 rounded text-[9px] font-bold bg-gray-500/20 text-gray-500 shrink-0">&lt;1%</span>
                    <div className="flex-1"><span className="text-gray-500 font-bold text-xs">❌ 绝对不做</span></div>
                    <span className="text-[10px] text-gray-500/60 shrink-0">手续费都覆盖不了</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-md border border-orange-500/20 bg-orange-500/5">
                    <span className="inline-flex items-center justify-center w-12 h-6 rounded text-[9px] font-bold bg-orange-500/15 text-orange-600 shrink-0">1-1.5%</span>
                    <div className="flex-1"><span className="text-orange-600 font-bold text-xs">⚠ 不推荐</span></div>
                    <span className="text-[10px] text-orange-500/60 shrink-0">扣除成本后几乎无利润</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-md border border-yellow-500/20 bg-yellow-500/5">
                    <span className="inline-flex items-center justify-center w-12 h-6 rounded text-[9px] font-bold bg-yellow-500/10 text-yellow-600 shrink-0">1.5-2%</span>
                    <div className="flex-1"><span className="text-yellow-600 font-bold text-xs">🔸 可以做</span></div>
                    <span className="text-[10px] text-yellow-500/60 shrink-0">微利，需精准执行</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-md border border-green-500/20 bg-green-500/5">
                    <span className="inline-flex items-center justify-center w-12 h-6 rounded text-[9px] font-bold bg-green-500/15 text-green-600 shrink-0">2-3%</span>
                    <div className="flex-1"><span className="text-green-600 font-bold text-xs">✅ 理想做T</span></div>
                    <span className="text-[10px] text-green-500/60 shrink-0">最佳做T区间</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-md border border-emerald-500/25 bg-emerald-500/8">
                    <span className="inline-flex items-center justify-center w-12 h-6 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-600 shrink-0">&gt;3%</span>
                    <div className="flex-1"><span className="text-emerald-600 font-bold text-xs">🟢 优质做T</span></div>
                    <span className="text-[10px] text-emerald-500/60 shrink-0">难得机会，果断操作</span>
                  </div>
                </div>
                <div className="p-1.5 rounded border border-red-500/10 bg-red-500/5">
                  <p className="text-red-600 dark:text-red-400 font-bold text-[10px]">⚠ 铁律：差价不足1.5%坚决不动！宁可错过，不可做错。</p>
                </div>
              </div>
            </div>
          </div>
        );

      case "timewindow":
        return (
          <div className="p-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5">
            <div className="flex items-center gap-1.5 mb-2">
              <Clock className="w-3.5 h-3.5 text-cyan-500" />
              <span className="text-xs font-semibold text-cyan-700 dark:text-cyan-300">时间窗口规矩</span>
            </div>
            <div className="text-[11px] text-muted-foreground leading-relaxed space-y-1.5">
              <div className="flex items-start gap-2 p-1.5 rounded border border-cyan-500/10 bg-cyan-500/5"><span className="text-cyan-600 font-bold text-[10px] shrink-0 w-24">9:30-10:00</span><div><span className="text-foreground font-medium">早盘观察期</span><span className="text-amber-500 text-[10px] ml-1">⚠ 仓位减半</span><p>开盘波动剧烈，按仓位表×50%执行。</p></div></div>
              <div className="flex items-start gap-2 p-1.5 rounded border border-cyan-500/10 bg-cyan-500/5"><span className="text-cyan-600 font-bold text-[10px] shrink-0 w-24">10:00-11:30</span><div><span className="text-foreground font-medium">上午操作期</span><span className="text-green-500 text-[10px] ml-1">✅ 按仓位表执行</span><p>趋势基本确立，可正常做T。</p></div></div>
              <div className="flex items-start gap-2 p-1.5 rounded border border-cyan-500/10 bg-cyan-500/5"><span className="text-cyan-600 font-bold text-[10px] shrink-0 w-24">13:00-14:00</span><div><span className="text-foreground font-medium">午盘确认期</span><span className="text-yellow-500 text-[10px] ml-1">🔸 观察方向</span><p>午后方向可能与上午相反。</p></div></div>
              <div className="flex items-start gap-2 p-1.5 rounded border border-cyan-500/10 bg-cyan-500/5"><span className="text-cyan-600 font-bold text-[10px] shrink-0 w-24">14:00-14:30</span><div><span className="text-foreground font-medium">尾盘决策期</span><span className="text-orange-500 text-[10px] ml-1">⚠ 准备清仓</span><p>做T仓位必须在此区间完成平仓。</p></div></div>
              <div className="flex items-start gap-2 p-1.5 rounded border border-red-500/10 bg-red-500/5"><span className="text-red-600 font-bold text-[10px] shrink-0 w-24">14:30-15:00</span><div><span className="text-foreground font-medium">收盘冲刺期</span><span className="text-red-500 text-[10px] ml-1">🚫 必须完成闭环</span><p>任何做T仓位必须在收盘前完成买卖闭环！严禁隔夜。</p></div></div>
            </div>
          </div>
        );

      // ──────────── 信号识别 ────────────
      case "buy_signals":
        return (
          <div className="space-y-3">
            <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
              <div className="flex items-center gap-1.5 mb-2">
                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">买点信号因子（按信号强度排序）</span>
              </div>
              <div className="text-[11px] text-muted-foreground leading-relaxed space-y-2">
                {/* factor_43 */}
                <div className="p-2 rounded-md border-2 border-emerald-500/30 bg-emerald-500/5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">强</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">正T</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">80%权重</span>
                    <span className="text-xs font-bold text-emerald-600">factor_43 次低点缩量买入</span>
                  </div>
                  <p className="text-foreground text-[11px] mb-1">条件：股价下跌形成L1低点，反弹后回落形成L2次低点</p>
                  <div className="space-y-0.5 text-[10px]">
                    <p>• L2距L1 ≤ 1.5%（双底形态）</p>
                    <p>• L2距日内最低 ≤ 0.5%（接近日内低点）</p>
                    <p>• L2处缩量（&lt;70%均量或比L1处低30%+）</p>
                  </div>
                  <p className="text-emerald-600 text-[10px] mt-1">💡 解读：第二只脚落地+缩量=抛压衰竭，高概率反弹</p>
                </div>
                {/* factor_31 */}
                <div className="p-2 rounded-md border border-emerald-500/20 bg-emerald-500/3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">强</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">正T</span>
                    <span className="text-xs font-bold">factor_31 脉冲缩量企稳</span>
                  </div>
                  <p className="text-[10px]">脉冲下跌(急跌&gt;1%) + 量能萎缩(&lt;50%均量) + 均线走平 → 恐慌性下跌后卖压耗尽，企稳可买回</p>
                </div>
                {/* factor_33 */}
                <div className="p-2 rounded-md border border-emerald-500/20 bg-emerald-500/3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">强</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">反T</span>
                    <span className="text-xs font-bold">factor_33 缩量横盘突破</span>
                  </div>
                  <p className="text-[10px]">缩量横盘 + 放量 + 上穿均线 → 窄幅整理后主力发力突破，追涨信号</p>
                </div>
                {/* factor_34 */}
                <div className="p-2 rounded-md border border-emerald-500/20 bg-emerald-500/3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">强</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">反T</span>
                    <span className="text-xs font-bold">factor_34 放量突破均线</span>
                  </div>
                  <p className="text-[10px]">价格在均线下方 + 放量 + 上穿均线 → 均线下方积蓄动能后放量突破，反转信号</p>
                </div>
                {/* factor_41 */}
                <div className="p-2 rounded-md border border-amber-500/20 bg-amber-500/3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">弱</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">正T</span>
                    <span className="text-xs font-bold text-amber-600">factor_41 放量下跌买点（需谨慎）</span>
                  </div>
                  <p className="text-[10px] mb-1">前置条件(满足任一)：A.持续缩量后首次放量下跌 B.连续下跌3根+地量 C.触及布林下轨+量缩 D.尾盘急跌+量能递减</p>
                  <p className="text-[10px]">评分制：≥4分触发(前置2分+缩量确认1分+价格企稳1分+指标共振1分)。过滤：下跌趋势中不触发，MACD零轴下方不触发</p>
                </div>
              </div>
            </div>
          </div>
        );

      case "sell_signals":
        return (
          <div className="space-y-3">
            <div className="p-3 rounded-lg border border-rose-500/20 bg-rose-500/5">
              <div className="flex items-center gap-1.5 mb-2">
                <ArrowDownRight className="w-3.5 h-3.5 text-rose-500" />
                <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">卖点信号因子</span>
              </div>
              <div className="text-[11px] text-muted-foreground leading-relaxed space-y-2">
                {/* factor_32 */}
                <div className="p-2 rounded-md border-2 border-rose-500/30 bg-rose-500/5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">强</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">正T</span>
                    <span className="text-xs font-bold">factor_32 脉冲拉升缩量滞涨</span>
                  </div>
                  <p className="text-[10px]">脉冲拉升(急涨&gt;1%) + 量能萎缩(&lt;50%均量) + 均线走平 → 冲高后买盘耗尽，涨不动了→卖出信号</p>
                </div>
                {/* 高开卖出 */}
                <div className="p-2 rounded-md border border-rose-500/20 bg-rose-500/3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">强</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">反T</span>
                    <span className="text-xs font-bold">高开卖出信号</span>
                  </div>
                  <p className="text-[10px]">开盘价高于昨收1.5%以上 + 开盘后回落 → 高开低走=获利盘出逃，冲高即卖的好时机</p>
                  <p className="text-rose-600 text-[10px] mt-0.5">⚠ 高开&gt;3%为强卖出信号</p>
                </div>
                {/* 量价背离卖出 */}
                <div className="p-2 rounded-md border border-rose-500/20 bg-rose-500/3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">中</span>
                    <span className="text-xs font-bold">量价背离卖出</span>
                  </div>
                  <p className="text-[10px]">价格创新高但成交量缩小(&lt;60%峰值) → 涨不动了=顶背离，多头力量衰竭</p>
                </div>
                {/* VWAP偏离卖出 */}
                <div className="p-2 rounded-md border border-rose-500/20 bg-rose-500/3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">中</span>
                    <span className="text-xs font-bold">VWAP偏离卖出</span>
                  </div>
                  <p className="text-[10px]">价格偏离均价线超过2% → 偏离过大=回归压力大，冲高卖出</p>
                </div>
              </div>
            </div>
          </div>
        );

      case "volume_rules":
        return (
          <div className={`p-3 rounded-lg border ${isActive("vol_decline_danger") || isActive("vol_surge_strong") || isActive("pulse_caution") || isActive("early_vol_drop") || isActive("wash_trade") || isActive("shrink_rise_warn") ? "border-red-500/40 bg-red-500/5" : "border-amber-500/20 bg-amber-500/5"}`}>
            <div className="flex items-center gap-1.5 mb-2">
              <Volume2 className={`w-3.5 h-3.5 ${isActive("vol_decline_danger") ? "text-red-500 animate-pulse" : "text-amber-500"}`} />
              <span className={`text-xs font-semibold ${isActive("vol_decline_danger") ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300"}`}>量能确认规矩</span>
              {(isActive("vol_decline_danger") || isActive("vol_surge_strong") || isActive("pulse_caution") || isActive("early_vol_drop") || isActive("wash_trade") || isActive("shrink_rise_warn")) && (
                <Badge variant="outline" className="text-[9px] h-4 px-1 bg-red-500/15 text-red-600 border-red-500/30 animate-pulse ml-1">⚠ 量能异动</Badge>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground leading-relaxed space-y-1.5">
              <div className="flex items-start gap-2 p-1.5 rounded border border-amber-500/10"><span className="text-amber-500 text-xs shrink-0">📊</span><div><span className="text-foreground font-medium">缩量下跌 → 不急于买入</span><p>等放量企稳再参与。</p></div></div>
              <div className={`flex items-start gap-2 p-1.5 rounded border ${isActive("shrink_rise_warn") ? "border-red-500/40 bg-red-500/10 ring-1 ring-red-500/30" : "border-amber-500/10"}`}>
                <span className="text-amber-500 text-xs shrink-0">⚠️</span>
                <div className="flex-1"><div className="flex items-center"><span className="text-foreground font-medium">缩量上涨 → 虚涨，谨防回落</span>{activeBadge("shrink_rise_warn")}</div><p>量能跟不上，不可追涨。</p></div>
              </div>
              <div className={`flex items-start gap-2 p-1.5 rounded border ${isActive("vol_surge_strong") ? "border-red-500/40 bg-red-500/10" : "border-amber-500/10"}`}>
                <span className="text-amber-500 text-xs shrink-0">📈</span>
                <div className="flex-1"><div className="flex items-center"><span className="text-foreground font-medium">放量上涨 → 确认强势，可加仓</span>{activeBadge("vol_surge_strong")}</div><p>量价齐升最健康。</p></div>
              </div>
              <div className={`flex items-start gap-2 p-1.5 rounded border ${isActive("vol_rise") ? "border-red-500/40 bg-red-500/10" : "border-amber-500/10"}`}>
                <span className="text-amber-500 text-xs shrink-0">💪</span>
                <div className="flex-1"><div className="flex items-center"><span className="text-foreground font-medium">量增价涨 → 健康上涨信号</span>{activeBadge("vol_rise")}</div></div>
              </div>
              <div className={`flex items-start gap-2 p-1.5 rounded border ${isActive("pulse_caution") ? "border-red-500/40 bg-red-500/10" : "border-amber-500/10"}`}>
                <span className="text-amber-500 text-xs shrink-0">⚡</span>
                <div className="flex-1"><div className="flex items-center"><span className="text-foreground font-medium">脉冲放量 → 关注异动，谨慎追入</span>{activeBadge("pulse_caution")}</div><p>不追脉冲量。</p></div>
              </div>
              <div className={`flex items-start gap-2 p-1.5 rounded border ${isActive("early_vol_drop") ? "border-red-500/40 bg-red-500/10" : "border-amber-500/10"}`}>
                <span className="text-orange-500 text-xs shrink-0">🌅</span>
                <div className="flex-1"><div className="flex items-center"><span className="text-foreground font-medium">早盘缩量下跌 → 弱势信号</span>{activeBadge("early_vol_drop")}</div><p>不急于抄底。</p></div>
              </div>
              <div className={`flex items-start gap-2 p-1.5 rounded border ${isActive("slow_decline") ? "border-red-500/40 bg-red-500/10" : "border-amber-500/10"}`}>
                <span className="text-emerald-600 text-xs shrink-0">▼</span>
                <div className="flex-1"><div className="flex items-center"><span className="text-foreground font-medium">阴跌 → 持续走弱，严禁抄底</span>{activeBadge("slow_decline")}</div><p>阴跌比急跌更危险。</p></div>
              </div>
              <div className={`flex items-start gap-2 p-1.5 rounded border ${isActive("wash_trade") ? "border-red-500/40 bg-red-500/10" : "border-amber-500/10"}`}>
                <span className="text-purple-500 text-xs shrink-0">🔄</span>
                <div className="flex-1"><div className="flex items-center"><span className="text-foreground font-medium">对倒洗盘 → 观望，不参与</span>{activeBadge("wash_trade")}</div><p>等待方向明确。</p></div>
              </div>
              <div className={`flex items-start gap-2 p-1.5 rounded border ${isActive("vol_decline_danger") ? "border-red-500/40 bg-red-500/10" : "border-amber-500/10"}`}>
                <span className={`text-xs shrink-0 ${isActive("vol_decline_danger") ? "text-red-500 animate-pulse" : "text-amber-500"}`}>📉</span>
                <div className="flex-1">
                  <div className="flex items-center"><span className={`font-medium ${isActive("vol_decline_danger") ? "text-red-600 dark:text-red-400" : "text-foreground"}`}>放量下跌 → 最危险，规避</span>{activeBadge("vol_decline_danger")}</div>
                  <p>抛压沉重，即使有买入信号也要降仓位。</p>
                  {isActive("vol_decline_danger") && <p className="text-red-600 font-bold text-[10px] mt-1">⚠ 当前检测到放量下跌！建议立即降低仓位。</p>}
                </div>
              </div>
              <div className="p-1.5 rounded border border-amber-500/10 bg-amber-500/5">
                <p className="text-amber-600 dark:text-amber-400 font-medium text-[10px]">💡 量能是价格方向的确认器：无量上涨不可信，放量下跌要远离。</p>
              </div>
            </div>
          </div>
        );

      // ──────────── 风险管理 ────────────
      case "stoploss":
        return (
          <div className="p-3 rounded-lg border border-rose-500/20 bg-rose-500/5">
            <div className="flex items-center gap-1.5 mb-2">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
              <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">止损止盈规矩</span>
            </div>
            <div className="text-[11px] text-muted-foreground leading-relaxed space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="p-2 rounded-md border border-red-500/15 bg-red-500/5">
                  <p className="text-red-600 dark:text-red-400 font-bold text-xs mb-1">🛑 止损规矩</p>
                  <div className="space-y-1 text-[11px]">
                    <p>• <span className="text-foreground font-medium">单笔止损 -2%</span>：无条件止损</p>
                    <p>• <span className="text-foreground font-medium">时间止损</span>：持仓超2小时未盈利，择机平仓</p>
                    <p>• <span className="text-foreground font-medium">信号止损</span>：出现强卖出信号，立即平仓</p>
                    <p>• <span className="text-foreground font-medium">大盘止损</span>：深证翻绿，所有做T仓位减半</p>
                    <p>• <span className="text-foreground font-medium">日亏损上限</span>：累计亏损达本金0.5%，停止当日所有做T</p>
                  </div>
                </div>
                <div className="p-2 rounded-md border border-green-500/15 bg-green-500/5">
                  <p className="text-green-600 dark:text-green-400 font-bold text-xs mb-1">💰 止盈规矩</p>
                  <div className="space-y-1 text-[11px]">
                    <p>• <span className="text-foreground font-medium">首目标 +1.5%</span>：先卖一半锁定利润</p>
                    <p>• <span className="text-foreground font-medium">二目标 +3%</span>：全部卖出落袋</p>
                    <p>• <span className="text-foreground font-medium">冲高回落</span>：从最高点回落0.5%即卖出</p>
                    <p>• <span className="text-foreground font-medium">大盘翻绿</span>：不管盈亏立即卖出</p>
                  </div>
                </div>
              </div>
              <div className="p-1.5 rounded border border-rose-500/10 bg-rose-500/5">
                <p className="text-rose-600 dark:text-rose-400 font-medium text-[10px]">⚠ 铁律：止损永远优先于止盈！宁可少赚不可多亏。</p>
              </div>
            </div>
          </div>
        );

      case "voldown_topic":
        return (
          <div className={`p-3 rounded-lg border-2 ${isActive("vol_decline_danger") ? "border-red-500/60 bg-gradient-to-br from-red-500/8 via-red-500/3 to-transparent shadow-red-500/10 shadow-md" : "border-red-500/25 bg-red-500/3"}`}>
            <div className="flex items-center gap-1.5 mb-2">
              <AlertTriangle className={`w-4 h-4 ${isActive("vol_decline_danger") ? "text-red-500 animate-pulse" : "text-red-500"}`} />
              <span className="text-xs font-bold text-red-700 dark:text-red-300">放量下跌专题（最危险信号）</span>
              {isActive("vol_decline_danger") && <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-red-500/20 text-red-600 border-red-500/40 animate-pulse ml-1">🚨 当前触发</Badge>}
            </div>
            <div className="text-[11px] text-muted-foreground leading-relaxed space-y-2">
              <div className={`p-2 rounded-md border ${isActive("vol_decline_danger") ? "border-red-500/40 bg-red-500/10" : "border-red-500/15 bg-red-500/5"}`}>
                <p className="text-red-600 font-bold text-xs mb-1.5">📖 什么是放量下跌？</p>
                <p>成交量显著放大（1.5-2倍以上均量）的同时股价持续下跌，说明<strong className="text-red-600">大量资金在抛售</strong>，是日内做T最危险的信号。</p>
              </div>
              <div>
                <p className="text-foreground font-semibold text-[11px] mb-1.5">🔬 四种细分类型</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  <div className="p-2 rounded-md border border-red-500/25 bg-red-500/5"><p className="text-red-600 font-bold text-[11px] mb-0.5">🔨 砸盘式</p><p className="text-[10px]">突放巨量3-5倍，价格瞬间跳水1-2%</p></div>
                  <div className="p-2 rounded-md border border-orange-500/25 bg-orange-500/5"><p className="text-orange-600 font-bold text-[11px] mb-0.5">🌧️ 阴跌式</p><p className="text-[10px]">量能温和放大1.2-1.5倍，持续缓慢下跌，比砸盘式更危险</p></div>
                  <div className="p-2 rounded-md border border-yellow-500/25 bg-yellow-500/5"><p className="text-yellow-600 font-bold text-[11px] mb-0.5">📉 跳水式</p><p className="text-[10px]">横盘后突然放量跳水，量能阶梯式放大</p></div>
                  <div className="p-2 rounded-md border border-purple-500/25 bg-purple-500/5"><p className="text-purple-600 font-bold text-[11px] mb-0.5">⚡ 脉冲式</p><p className="text-[10px]">短时放量下跌后快速缩量企稳，形成V型</p></div>
                </div>
              </div>
              <div>
                <p className="text-foreground font-semibold text-[11px] mb-1.5">⏰ 三种时段形态</p>
                <div className="space-y-1.5">
                  <div className="flex items-start gap-2 p-1.5 rounded border border-red-500/15 bg-red-500/5"><span className="text-red-600 font-bold text-[10px] shrink-0 w-20">9:30-10:00</span><div><span className="text-red-600 font-bold text-[11px]">早盘放量下杀 → 极度危险 🔴</span><p>严禁抄底，反T冲高卖出后不急于买回。</p></div></div>
                  <div className="flex items-start gap-2 p-1.5 rounded border border-orange-500/15 bg-orange-500/5"><span className="text-orange-600 font-bold text-[10px] shrink-0 w-20">10:00-14:00</span><div><span className="text-orange-600 font-bold text-[11px]">盘中放量下跌 → 高危需辨别 🟠</span><p>看5分钟后量能是否持续放大。</p></div></div>
                  <div className="flex items-start gap-2 p-1.5 rounded border border-yellow-500/15 bg-yellow-500/5"><span className="text-yellow-600 font-bold text-[10px] shrink-0 w-20">14:00-15:00</span><div><span className="text-yellow-600 font-bold text-[11px]">尾盘放量下跌 → 恐慌信号 🟡</span><p>尾盘放量下跌不抄底，次日可能低开。</p></div></div>
                </div>
              </div>
              <div>
                <p className="text-foreground font-semibold text-[11px] mb-1.5">📋 应对策略矩阵</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px] border-collapse">
                    <thead><tr className="border-b border-red-500/15"><th className="text-left py-1 px-1.5 text-red-600 font-semibold">场景</th><th className="text-left py-1 px-1.5 text-red-600 font-semibold">危险等级</th><th className="text-left py-1 px-1.5 text-red-600 font-semibold">仓位上限</th><th className="text-left py-1 px-1.5 text-red-600 font-semibold">操作策略</th></tr></thead>
                    <tbody>
                      <tr className="border-b border-border/30 bg-red-500/10"><td className="py-1 px-1.5">三跌+放量下跌</td><td className="py-1 px-1.5"><span className="text-red-600 font-bold">🔴 极危</span></td><td className="py-1 px-1.5"><span className="text-red-500 font-bold">空仓</span></td><td className="py-1 px-1.5">不参与</td></tr>
                      <tr className="border-b border-border/30 bg-red-500/5"><td className="py-1 px-1.5">双跌+放量下跌</td><td className="py-1 px-1.5"><span className="text-red-600 font-bold">🔴 高危</span></td><td className="py-1 px-1.5">≤1/4</td><td className="py-1 px-1.5">反T冲高卖出</td></tr>
                      <tr className="border-b border-border/30"><td className="py-1 px-1.5">单跌+放量下跌</td><td className="py-1 px-1.5"><span className="text-orange-500 font-bold">🟠 中危</span></td><td className="py-1 px-1.5">≤1/3</td><td className="py-1 px-1.5">仓位降一级，反T为主</td></tr>
                      <tr className="border-b border-border/30 bg-green-500/5"><td className="py-1 px-1.5">放量下跌后缩量企稳</td><td className="py-1 px-1.5"><span className="text-green-500 font-bold">🟢 可观察</span></td><td className="py-1 px-1.5">≤1/3</td><td className="py-1 px-1.5">企稳15分钟后可轻仓正T</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        );

      case "voldown_buy":
        return (
          <div className="p-3 rounded-lg border border-green-500/20 bg-green-500/5">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-green-500 text-sm">🟢</span>
              <span className="text-xs font-bold text-green-700 dark:text-green-300">放量下跌买点规矩（放量下跌后何时买回）</span>
            </div>
            <div className="text-[11px] text-muted-foreground leading-relaxed space-y-2">
              <div className="p-2 rounded-md border border-green-500/15 bg-green-500/5">
                <p className="text-green-600 font-bold text-xs mb-1">🔑 核心原则：放量下跌后不急于买回！必须确认企稳</p>
                <p>放量下跌后至少等15分钟观察量能变化。缩量企稳=抛压衰竭的信号，此时才可考虑轻仓买入。</p>
              </div>
              <div>
                <p className="text-foreground font-semibold text-[11px] mb-1.5">前置条件（满足任一路径）</p>
                <div className="space-y-1">
                  <div className="flex items-start gap-2 p-1.5 rounded border border-green-500/10"><span className="text-green-500 shrink-0 text-xs">A</span><div><span className="text-foreground font-medium">持续缩量后首次放量下跌</span><p>前期缩量说明抛压减弱，首次放量可能是最后恐慌</p></div></div>
                  <div className="flex items-start gap-2 p-1.5 rounded border border-green-500/10"><span className="text-green-500 shrink-0 text-xs">B</span><div><span className="text-foreground font-medium">连续下跌3根+地量</span><p>连续下跌后出现地量=卖盘耗尽</p></div></div>
                  <div className="flex items-start gap-2 p-1.5 rounded border border-green-500/10"><span className="text-green-500 shrink-0 text-xs">C</span><div><span className="text-foreground font-medium">价格触及布林下轨+量缩</span><p>技术超卖+量能配合</p></div></div>
                  <div className="flex items-start gap-2 p-1.5 rounded border border-green-500/10"><span className="text-green-500 shrink-0 text-xs">D</span><div><span className="text-foreground font-medium">尾盘急跌+量能递减</span><p>尾盘恐慌性抛售衰减</p></div></div>
                </div>
              </div>
              <div className="p-2 rounded-md border border-amber-500/15 bg-amber-500/5">
                <p className="text-amber-600 font-bold text-xs mb-1">⚠ 评分制（≥4分触发）</p>
                <div className="text-[10px] space-y-0.5">
                  <p>• 满足前置条件 = 2分</p>
                  <p>• 缩量确认（量能&lt;均量50%）= 1分</p>
                  <p>• 价格企稳（3根K线不创新低）= 1分</p>
                  <p>• 指标共振（RSI&lt;30 / MACD金叉 / 布林下轨）= 1分</p>
                </div>
              </div>
              <div className="p-2 rounded-md border border-red-500/15 bg-red-500/5">
                <p className="text-red-600 font-bold text-xs mb-1">🚫 过滤规则（以下情况不触发买点）</p>
                <div className="text-[10px] space-y-0.5">
                  <p>• 下跌趋势中（VWAP持续下行）不触发</p>
                  <p>• MACD零轴下方不触发</p>
                  <p>• 放量下跌仍在持续时不触发（必须等缩量）</p>
                </div>
              </div>
            </div>
          </div>
        );

      case "forbidden":
        return (
          <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
            <div className="flex items-center gap-1.5 mb-2">
              <BookOpen className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">禁忌规矩（绝对不可违反）</span>
            </div>
            <div className="text-[11px] text-muted-foreground leading-relaxed space-y-1.5">
              <div className="flex items-start gap-2"><span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-red-500/10 text-red-500 border border-red-500/20 shrink-0 mt-0.5">1</span><div><span className="text-foreground font-medium">深证成指暴跌（跌幅 &gt; 2%）→ 空仓，不参与任何做T</span><p>系统性风险下技术分析失效。</p></div></div>
              <div className="flex items-start gap-2"><span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-red-500/10 text-red-500 border border-red-500/20 shrink-0 mt-0.5">2</span><div><span className="text-foreground font-medium">做T必须当天完成买卖，严禁隔夜</span><p>做T是日内波动差价，隔夜=投机。</p></div></div>
              <div className="flex items-start gap-2"><span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-red-500/10 text-red-500 border border-red-500/20 shrink-0 mt-0.5">3</span><div><span className="text-foreground font-medium">单只股票仓位不超过总资金的40%</span><p>单一标的风险过于集中。</p></div></div>
              <div className="flex items-start gap-2"><span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-red-500/10 text-red-500 border border-red-500/20 shrink-0 mt-0.5">4</span><div><span className="text-foreground font-medium">ST股、退市风险股不参与</span><p>基本面风险无法通过技术分析化解。</p></div></div>
              <div className="flex items-start gap-2"><span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-red-500/10 text-red-500 border border-red-500/20 shrink-0 mt-0.5">5</span><div><span className="text-foreground font-medium">亏损后加仓翻本 → 绝对禁止</span><p>亏损说明判断有误，应减仓而非加仓。</p></div></div>
              <div className="flex items-start gap-2"><span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-red-500/10 text-red-500 border border-red-500/20 shrink-0 mt-0.5">6</span><div><span className="text-foreground font-medium">跌停板股票不参与做T</span><p>跌停=流动性枯竭，无法卖出完成做T闭环。</p></div></div>
            </div>
          </div>
        );

      // ──────────── 市场环境 ────────────
      case "market_regime":
        return (
          <div className="space-y-3">
            <div className="p-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5">
              <div className="flex items-center gap-1.5 mb-2">
                <TrendingUp className="w-3.5 h-3.5 text-cyan-500" />
                <span className="text-xs font-semibold text-cyan-700 dark:text-cyan-300">市场环境4种行情及应对策略</span>
              </div>
              <div className="text-[11px] text-muted-foreground leading-relaxed space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="p-2 rounded-md border border-green-500/20 bg-green-500/5">
                    <p className="text-green-600 font-bold text-xs mb-1">✅ 震荡市</p>
                    <p className="text-[10px] mb-0.5">特征：VWAP走平，价格穿越均线反复</p>
                    <p className="text-[10px] mb-0.5">适合做T：✅ 最适合，正T为主</p>
                    <p className="text-[10px] mb-0.5">T仓比例：100%（正常）</p>
                    <p className="text-[10px]">策略：高抛低吸</p>
                  </div>
                  <div className="p-2 rounded-md border border-amber-500/20 bg-amber-500/5">
                    <p className="text-amber-600 font-bold text-xs mb-1">⚠️ 上升通道</p>
                    <p className="text-[10px] mb-0.5">特征：VWAP持续上行，价格站稳均线上方</p>
                    <p className="text-[10px] mb-0.5">适合做T：⚠️ 谨慎，只做正T</p>
                    <p className="text-[10px] mb-0.5">T仓比例：50%（降至20%）</p>
                    <p className="text-[10px]">策略：买回要快，避免卖飞</p>
                  </div>
                  <div className="p-2 rounded-md border border-red-500/20 bg-red-500/5">
                    <p className="text-red-600 font-bold text-xs mb-1">🔴 下跌趋势</p>
                    <p className="text-[10px] mb-0.5">特征：VWAP持续下行，价格被压在均线下方</p>
                    <p className="text-[10px] mb-0.5">适合做T：⚠️ 谨慎，买入信号降级</p>
                    <p className="text-[10px] mb-0.5">T仓比例：30%（降至10-15%）</p>
                    <p className="text-[10px]">策略：偏反T，冲高减仓</p>
                  </div>
                  <div className="p-2 rounded-md border border-yellow-500/20 bg-yellow-500/5">
                    <p className="text-yellow-600 font-bold text-xs mb-1">🔸 横盘末期</p>
                    <p className="text-[10px] mb-0.5">特征：极低波动率，价格窄幅围绕昨收</p>
                    <p className="text-[10px] mb-0.5">适合做T：⚠️ 减少，等待方向明确</p>
                    <p className="text-[10px] mb-0.5">T仓比例：50%</p>
                    <p className="text-[10px]">策略：减少做T频率</p>
                  </div>
                </div>
                <div className="p-2 rounded-md border border-cyan-500/15 bg-cyan-500/5">
                  <p className="text-cyan-600 font-bold text-xs mb-1">🔍 识别维度（5维评分体系）</p>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1 text-[9px]">
                    <div className="p-1 rounded bg-cyan-500/10 text-center"><span className="font-bold">VWAP斜率</span><br/>权重30%</div>
                    <div className="p-1 rounded bg-cyan-500/10 text-center"><span className="font-bold">价格动量</span><br/>权重25%</div>
                    <div className="p-1 rounded bg-cyan-500/10 text-center"><span className="font-bold">波动率</span><br/>权重20%</div>
                    <div className="p-1 rounded bg-cyan-500/10 text-center"><span className="font-bold">价格位置</span><br/>权重15%</div>
                    <div className="p-1 rounded bg-cyan-500/10 text-center"><span className="font-bold">趋势一致性</span><br/>权重10%</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case "indicators":
        return (
          <div className="space-y-3">
            <div className="p-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5">
              <div className="flex items-center gap-1.5 mb-2">
                <Cpu className="w-3.5 h-3.5 text-cyan-500" />
                <span className="text-xs font-semibold text-cyan-700 dark:text-cyan-300">核心技术指标及参数</span>
              </div>
              <div className="text-[11px] text-muted-foreground leading-relaxed space-y-2">
                <div className="p-2 rounded-md border border-cyan-500/15 bg-cyan-500/5">
                  <p className="text-cyan-600 font-bold text-xs mb-1">📈 MACD（趋势指标）</p>
                  <div className="text-[10px] space-y-0.5">
                    <p>参数：快线12 / 慢线26 / 信号线9</p>
                    <p>金叉(DIF上穿DEA)=买入信号，死叉(DIF下穿DEA)=卖出信号</p>
                    <p>零轴上方=多头市场，零轴下方=空头市场</p>
                  </div>
                </div>
                <div className="p-2 rounded-md border border-cyan-500/15 bg-cyan-500/5">
                  <p className="text-cyan-600 font-bold text-xs mb-1">📊 VWAP（均价线）</p>
                  <div className="text-[10px] space-y-0.5">
                    <p>卖出阈值：偏离均价线超过2%考虑卖出</p>
                    <p>买入阈值：回到均价线附近(±0.3%)买入</p>
                    <p>均线走平=方向不明，均线上行=趋势向上，均线下行=趋势向下</p>
                  </div>
                </div>
                <div className="p-2 rounded-md border border-cyan-500/15 bg-cyan-500/5">
                  <p className="text-cyan-600 font-bold text-xs mb-1">📉 RSI（超买超卖）</p>
                  <div className="text-[10px] space-y-0.5">
                    <p>参数：周期14 / 超卖线30 / 超买线70</p>
                    <p>RSI&lt;30=超卖(可能反弹)，RSI&gt;70=超买(可能回调)</p>
                    <p>RSI在40-60=中性区间(方向待选)</p>
                  </div>
                </div>
                <div className="p-2 rounded-md border border-cyan-500/15 bg-cyan-500/5">
                  <p className="text-cyan-600 font-bold text-xs mb-1">📏 布林带（波动率）</p>
                  <div className="text-[10px] space-y-0.5">
                    <p>参数：周期20 / 标准差倍数2</p>
                    <p>触及下轨=超卖信号，触及上轨=超买信号</p>
                    <p>带宽收窄至2%以内=即将变盘</p>
                  </div>
                </div>
                <div className="p-2 rounded-md border border-cyan-500/15 bg-cyan-500/5">
                  <p className="text-cyan-600 font-bold text-xs mb-1">⚡ KDJ（随机指标）</p>
                  <div className="text-[10px] space-y-0.5">
                    <p>参数：K周期9 / K平滑3 / D平滑3</p>
                    <p>超卖区20以下=可能反弹，超买区80以上=可能回调</p>
                    <p>J线&lt;0=极端超卖，J线&gt;100=极端超买</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      // ──────────── 实战 ────────────
      case "cases":
        return (
          <div className="p-3 rounded-lg border border-rose-500/20 bg-rose-500/5">
            <div className="flex items-center gap-1.5 mb-2">
              <Info className="w-3.5 h-3.5 text-rose-500" />
              <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">实战案例</span>
            </div>
            <div className="text-[11px] text-muted-foreground leading-relaxed space-y-2">
              <div className="p-2 rounded-md border border-green-500/10 bg-green-500/5">
                <p className="text-green-600 font-medium mb-1">场景1（三跌）：深证跌1.8% + 半导体跌1.5% + 个股跌2.3%</p>
                <div className="space-y-0.5">
                  <p>→ <span className="text-green-500 font-bold">一级·≤1/4仓</span>，策略：<span className="text-green-500 font-medium">反T冲高卖</span></p>
                  <p>• 买入2500，跌3%亏75元（总0.75%）→ 可控</p>
                  <p>• 满仓1万，跌3%亏300元（总3%）→ 不可接受</p>
                </div>
              </div>
              <div className="p-2 rounded-md border border-red-500/10 bg-red-500/5">
                <p className="text-red-600 font-medium mb-1">场景2（三涨）：深证涨1.2% + 半导体涨0.8% + 个股涨1.5%</p>
                <div className="space-y-0.5">
                  <p>→ <span className="text-red-500 font-bold">五级·90-100%仓</span>，策略：<span className="text-red-500 font-medium">正T/反T均可</span></p>
                  <p>• 但大盘突然翻绿 → 立即降仓至1/3以下</p>
                </div>
              </div>
              <div className="p-2 rounded-md border border-yellow-500/10 bg-yellow-500/5">
                <p className="text-yellow-600 font-medium mb-1">场景3（双跌+大盘涨）：深证涨0.8% + 半导体跌1.5% + 个股跌2.3%</p>
                <div className="space-y-0.5">
                  <p>→ <span className="text-orange-500 font-bold">二级·≤1/3仓</span>，策略：<span className="text-green-600 font-medium">正T低吸</span></p>
                </div>
              </div>
              <div className="p-2 rounded-md border border-emerald-500/10 bg-emerald-500/5">
                <p className="text-emerald-600 font-medium mb-1">场景4（大盘弱+板块个股强）：深证跌0.5% + 半导体涨1.2% + 个股涨2.3%</p>
                <div className="space-y-0.5">
                  <p>→ <span className="text-yellow-500 font-bold">三级·20-30%仓</span>，策略：<span className="text-red-500 font-medium">反T冲高卖</span></p>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Card className={`border-2 shadow-lg mb-4 ${hasDangerSignal ? "border-red-500/60 border-l-4 border-l-red-500 shadow-red-500/15 bg-gradient-to-br from-red-500/5 via-transparent to-transparent" : "border-amber-500/40 border-l-4 border-l-amber-500 shadow-amber-500/10 bg-gradient-to-br from-amber-500/5 via-transparent to-transparent"}`}>
      <CardHeader
        className={`pb-2 cursor-pointer select-none ${hasDangerSignal ? "bg-gradient-to-r from-red-500/15 to-orange-500/10 border-b border-red-500/30" : "bg-gradient-to-r from-amber-500/10 to-orange-500/5 border-b border-amber-500/20"}`}
        onClick={handleToggleExpand}
      >
        <CardTitle className={`text-base font-bold flex items-center gap-2 ${hasDangerSignal ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}>
          {expanded ? <ChevronDown className={`w-4 h-4 ${hasDangerSignal ? "text-red-500" : "text-amber-500"}`} /> : <ChevronRight className={`w-4 h-4 ${hasDangerSignal ? "text-red-500" : "text-amber-500"}`} />}
          <Scale className={`w-5 h-5 drop-shadow-[0_0_3px_rgba(245,158,11,0.5)] ${hasDangerSignal ? "text-red-500" : "text-amber-500"}`} />
          交易规矩
          <Badge variant="outline" className="text-[9px] h-4 px-1 ml-1">{NAV_GROUPS.reduce((acc, g) => acc + g.items.length, 0)}项</Badge>
          {autoExpanded && <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-amber-500/10 text-amber-600 border-amber-500/25 animate-pulse">🔔 开盘提醒</Badge>}
          {hasDangerSignal && <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-red-500/15 text-red-600 border-red-500/30 animate-pulse">🚨 风险提醒</Badge>}
          <span className="text-[10px] font-normal text-muted-foreground ml-auto">{expanded ? "点击收起" : "点击展开"}</span>
        </CardTitle>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0">
          {renderMobileNav()}
          <div className="flex gap-3">
            {renderSidebar()}
            <div className="flex-1 min-w-0 max-h-[500px] overflow-y-auto">
              {renderContent()}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
});
