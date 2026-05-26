"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, Zap, Clock, Volume2, Activity, Scale, BookOpen, Info, ChevronDown, ChevronRight,
} from "lucide-react";
import type { PulseVolumeMarker } from "@/lib/chart-shared";

interface TradingRulesCardProps {
  autoExpanded?: boolean;
  pvMarkers?: PulseVolumeMarker[];
}

// Map pvMarker types to rule section keys that should be highlighted
type RuleKey = "vol_decline_danger" | "vol_decline_position" | "vol_surge_strong" | "pulse_caution" | "pulse_decline_danger" | "shrink_rise" | "early_vol_drop" | "wash_trade" | "vol_rise" | "shrink_rise_warn";

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
    }
  }
  return active;
}

export function TradingRulesCard({ autoExpanded, pvMarkers = [] }: TradingRulesCardProps) {
  // null = no manual override; true/false = user explicitly toggled
  const [manualOverride, setManualOverride] = useState<boolean | null>(null);

  const activeRules = useMemo(() => getActiveRules(pvMarkers), [pvMarkers]);

  // Check if there are dangerous signals that should auto-expand
  const hasDangerSignal = activeRules.has("vol_decline_danger") || activeRules.has("pulse_decline_danger");

  // Default collapsed. Only expand when user manually expands.
  const expanded = manualOverride === true;

  // Helper: check if a rule is active and return highlight class
  const ruleClass = (key: RuleKey, baseClass = "") => {
    if (!activeRules.has(key)) return baseClass;
    // Return highlighted version
    return `${baseClass} ring-2 ring-red-500/50 bg-red-500/10`.trim();
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

  return (
    <Card className={`border-2 shadow-lg mb-4 ${hasDangerSignal ? "border-red-500/60 border-l-4 border-l-red-500 shadow-red-500/15 bg-gradient-to-br from-red-500/5 via-transparent to-transparent" : "border-amber-500/40 border-l-4 border-l-amber-500 shadow-amber-500/10 bg-gradient-to-br from-amber-500/5 via-transparent to-transparent"}`}>
      <CardHeader
        className={`pb-2 cursor-pointer select-none ${hasDangerSignal ? "bg-gradient-to-r from-red-500/15 to-orange-500/10 border-b border-red-500/30" : "bg-gradient-to-r from-amber-500/10 to-orange-500/5 border-b border-amber-500/20"}`}
        onClick={() => setManualOverride(prev => !prev)}
      >
        <CardTitle className={`text-base font-bold flex items-center gap-2 ${hasDangerSignal ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}>
          {expanded ? <ChevronDown className={`w-4 h-4 ${hasDangerSignal ? "text-red-500" : "text-amber-500"}`} /> : <ChevronRight className={`w-4 h-4 ${hasDangerSignal ? "text-red-500" : "text-amber-500"}`} />}
          <Scale className={`w-5 h-5 drop-shadow-[0_0_3px_rgba(245,158,11,0.5)] ${hasDangerSignal ? "text-red-500" : "text-amber-500"}`} />
          交易规矩
          {autoExpanded && <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-amber-500/10 text-amber-600 border-amber-500/25 animate-pulse">🔔 开盘提醒</Badge>}
          {hasDangerSignal && <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-red-500/15 text-red-600 border-red-500/30 animate-pulse">🚨 风险提醒</Badge>}
          <span className="text-[10px] font-normal text-muted-foreground ml-auto">{expanded ? "点击收起" : "点击展开"}</span>
        </CardTitle>
      </CardHeader>
      {expanded && <CardContent className="pt-0 space-y-3">
        {/* ── 做T自检三问 ── */}
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

        {/* ── 一、仓位阶梯 ── */}
        <div className="p-3 rounded-lg border border-red-500/20 bg-red-500/5">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
            <span className="text-xs font-semibold text-red-700 dark:text-red-300">一、仓位阶梯（大盘×板块×个股 三维决策）</span>
          </div>
          <div className="text-[11px] text-muted-foreground leading-relaxed space-y-1.5">
            <p className="text-foreground font-medium mb-1.5">以深证成指为大盘方向，按三维度共振数定仓位等级：</p>
            <div className="space-y-1">
              <div className="flex items-center gap-2 p-2 rounded-md border border-red-500/30 bg-red-500/10">
                <span className="inline-flex items-center justify-center w-8 h-7 rounded text-[10px] font-bold bg-red-500/20 text-red-600 border border-red-500/30 shrink-0">≤1/4</span>
                <div className="flex-1">
                  <span className="text-red-600 dark:text-red-400 font-bold text-xs">🚫 一级·极度危险</span>
                  <span className="text-red-500/70 text-[10px] ml-1">深证↓+板块↓+个股↓（三跌）</span>
                </div>
                <span className="text-[10px] text-red-500/60 shrink-0">25%</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-md border border-orange-500/25 bg-orange-500/8">
                <span className="inline-flex items-center justify-center w-8 h-7 rounded text-[10px] font-bold bg-orange-500/15 text-orange-600 border border-orange-500/25 shrink-0">≤1/3</span>
                <div className="flex-1">
                  <span className="text-orange-600 dark:text-orange-400 font-bold text-xs">⛔ 二级·高危</span>
                  <span className="text-orange-500/70 text-[10px] ml-1">任意两维度下跌（双跌）</span>
                </div>
                <span className="text-[10px] text-orange-500/60 shrink-0">33%</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-md border border-yellow-500/20 bg-yellow-500/5">
                <span className="inline-flex items-center justify-center w-8 h-7 rounded text-[10px] font-bold bg-yellow-500/10 text-yellow-600 border border-yellow-500/20 shrink-0">20%</span>
                <div className="flex-1">
                  <span className="text-yellow-600 dark:text-yellow-400 font-bold text-xs">🔸 三级·谨慎</span>
                  <span className="text-yellow-500/70 text-[10px] ml-1">单维度弱势+另一维度震荡</span>
                </div>
                <span className="text-[10px] text-yellow-500/60 shrink-0">20-25%</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-md border border-blue-500/20 bg-blue-500/5">
                <span className="inline-flex items-center justify-center w-8 h-7 rounded text-[10px] font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20 shrink-0">75%</span>
                <div className="flex-1">
                  <span className="text-blue-600 dark:text-blue-400 font-bold text-xs">🔹 四级·积极</span>
                  <span className="text-blue-500/70 text-[10px] ml-1">至少两维度上涨+一维度震荡</span>
                </div>
                <span className="text-[10px] text-blue-500/60 shrink-0">70-80%</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-md border border-green-500/25 bg-green-500/8">
                <span className="inline-flex items-center justify-center w-8 h-7 rounded text-[10px] font-bold bg-green-500/15 text-green-600 border border-green-500/25 shrink-0">95%</span>
                <div className="flex-1">
                  <span className="text-green-600 dark:text-green-400 font-bold text-xs">✅ 五级·最安全</span>
                  <span className="text-green-500/70 text-[10px] ml-1">深证↑+板块↑+个股↑（三涨）</span>
                </div>
                <span className="text-[10px] text-green-500/60 shrink-0">90-100%</span>
              </div>
            </div>
            <div className="mt-1.5 p-1.5 rounded border border-orange-500/10 bg-orange-500/5">
              <p className="text-orange-600 dark:text-orange-400 font-medium text-[10px]">💡 记忆口诀：三跌1/4、双跌1/3、单弱2成、双涨8成、三涨满仓</p>
            </div>
          </div>
        </div>

        {/* ── 二、做T策略选择 ── */}
        <div className="p-3 rounded-lg border border-violet-500/20 bg-violet-500/5">
          <div className="flex items-center gap-1.5 mb-2">
            <Zap className="w-3.5 h-3.5 text-violet-500" />
            <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">二、做T策略选择（正T vs 反T(先卖再买)）</span>
          </div>
          <div className="text-[11px] text-muted-foreground leading-relaxed space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="p-2 rounded-md border border-green-500/15 bg-green-500/5">
                <p className="text-green-600 dark:text-green-400 font-bold text-xs mb-1.5">🟢 正T（先买后卖）</p>
                <p className="text-foreground font-medium mb-1">适用场景：预期股价先跌后涨</p>
                <div className="space-y-0.5 text-[11px]">
                  <p>• 大盘↑+板块↑+个股↓ → 低吸良机</p>
                  <p>• 大盘震荡+板块↑+个股↓ → 板块保护下低吸</p>
                  <p>• 适合盘中低吸后反弹卖出，当天完成闭环</p>
                  <p>• 量能配合：缩量下跌→放量反弹</p>
                </div>
              </div>
              <div className="p-2 rounded-md border border-red-500/15 bg-red-500/5">
                <p className="text-red-600 dark:text-red-400 font-bold text-xs mb-1.5">🔴 反T(先卖再买)</p>
                <p className="text-foreground font-medium mb-1">适用场景：预期股价先涨后跌</p>
                <div className="space-y-0.5 text-[11px]">
                  <p>• 大盘↓+板块↓+个股↑ → 冲高减仓</p>
                  <p>• 大盘↓+板块震荡+个股↑ → 大盘压制下卖出</p>
                  <p>• 适合早盘冲高卖出、盘中回落买回，当天完成闭环</p>
                  <p>• 量能配合：缩量反弹→放量下跌</p>
                </div>
              </div>
            </div>
            <div className="p-1.5 rounded border border-violet-500/10 bg-violet-500/5">
              <p className="text-violet-600 dark:text-violet-400 font-medium text-[10px]">⚡ 核心原则：顺势做T！大盘涨时偏正T，大盘跌时偏反T(先卖再买)。三跌时严禁正T（不抄底），三涨时严禁反T(先卖再买)（不卖飞）。</p>
            </div>
          </div>
        </div>

        {/* ── 三、时间窗口规矩 ── */}
        <div className="p-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5">
          <div className="flex items-center gap-1.5 mb-2">
            <Clock className="w-3.5 h-3.5 text-cyan-500" />
            <span className="text-xs font-semibold text-cyan-700 dark:text-cyan-300">三、时间窗口规矩</span>
          </div>
          <div className="text-[11px] text-muted-foreground leading-relaxed space-y-1.5">
            <div className="grid grid-cols-1 gap-1.5">
              <div className="flex items-start gap-2 p-1.5 rounded border border-cyan-500/10 bg-cyan-500/5">
                <span className="text-cyan-600 dark:text-cyan-400 font-bold text-[10px] shrink-0 w-24">9:30-10:00</span>
                <div>
                  <span className="text-foreground font-medium">早盘观察期</span>
                  <span className="text-amber-500 text-[10px] ml-1">⚠ 仓位减半</span>
                  <p>开盘波动剧烈，方向不明。按仓位表×50%执行，不追涨不抄底。</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-1.5 rounded border border-cyan-500/10 bg-cyan-500/5">
                <span className="text-cyan-600 dark:text-cyan-400 font-bold text-[10px] shrink-0 w-24">10:00-11:30</span>
                <div>
                  <span className="text-foreground font-medium">上午操作期</span>
                  <span className="text-green-500 text-[10px] ml-1">✅ 按仓位表执行</span>
                  <p>趋势基本确立，可按仓位阶梯正常做T。重点关注大盘+板块方向确认。</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-1.5 rounded border border-cyan-500/10 bg-cyan-500/5">
                <span className="text-cyan-600 dark:text-cyan-400 font-bold text-[10px] shrink-0 w-24">13:00-14:00</span>
                <div>
                  <span className="text-foreground font-medium">午盘确认期</span>
                  <span className="text-yellow-500 text-[10px] ml-1">🔸 观察方向</span>
                  <p>午后方向可能与上午相反。若大盘午后翻绿，上午仓位立即缩减。</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-1.5 rounded border border-cyan-500/10 bg-cyan-500/5">
                <span className="text-cyan-600 dark:text-cyan-400 font-bold text-[10px] shrink-0 w-24">14:00-14:30</span>
                <div>
                  <span className="text-foreground font-medium">尾盘决策期</span>
                  <span className="text-orange-500 text-[10px] ml-1">⚠ 准备清仓</span>
                  <p>做T仓位必须在此区间完成平仓。大盘弱势时14:00即开始减仓。</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-1.5 rounded border border-red-500/10 bg-red-500/5">
                <span className="text-red-600 dark:text-red-400 font-bold text-[10px] shrink-0 w-24">14:30-15:00</span>
                <div>
                  <span className="text-foreground font-medium">收盘冲刺期</span>
                  <span className="text-red-500 text-[10px] ml-1">🚫 必须完成闭环</span>
                  <p>任何做T仓位必须在收盘前完成买卖闭环！严禁隔夜。尾盘拉升不追。</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── 四、止损止盈规矩 ── */}
        <div className="p-3 rounded-lg border border-rose-500/20 bg-rose-500/5">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
            <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">四、止损止盈规矩</span>
          </div>
          <div className="text-[11px] text-muted-foreground leading-relaxed space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="p-2 rounded-md border border-red-500/15 bg-red-500/5">
                <p className="text-red-600 dark:text-red-400 font-bold text-xs mb-1">🛑 止损规矩</p>
                <div className="space-y-1 text-[11px]">
                  <p>• <span className="text-foreground font-medium">单笔止损 -2%</span>：1万本金做T亏200元，无条件止损</p>
                  <p>• <span className="text-foreground font-medium">时间止损</span>：持仓超2小时未盈利，择机平仓</p>
                  <p>• <span className="text-foreground font-medium">信号止损</span>：出现强卖出信号，立即平仓</p>
                  <p>• <span className="text-foreground font-medium">大盘止损</span>：深证翻绿，所有做T仓位减半</p>
                  <p>• <span className="text-foreground font-medium">日亏损上限</span>：当日累计亏损达本金0.5%（1万亏50），停止当日所有做T</p>
                </div>
              </div>
              <div className="p-2 rounded-md border border-green-500/15 bg-green-500/5">
                <p className="text-green-600 dark:text-green-400 font-bold text-xs mb-1">💰 止盈规矩</p>
                <div className="space-y-1 text-[11px]">
                  <p>• <span className="text-foreground font-medium">首目标 +1.5%</span>：3000 T仓赚45元，先卖一半锁定利润</p>
                  <p>• <span className="text-foreground font-medium">二目标 +3%</span>：3000 T仓赚90元，全部卖出落袋</p>
                  <p>• <span className="text-foreground font-medium">冲高回落</span>：从最高点回落0.5%即卖出，宁可少赚不可倒亏</p>
                  <p>• <span className="text-foreground font-medium">大盘翻绿</span>：不管盈亏立即卖出，不抱幻想</p>
                </div>
              </div>
            </div>
            <div className="p-1.5 rounded border border-rose-500/10 bg-rose-500/5">
              <p className="text-rose-600 dark:text-rose-400 font-medium text-[10px]">⚠ 铁律：止损永远优先于止盈！做T亏1%是成本，亏5%是灾难。宁可少赚不可多亏。</p>
            </div>
          </div>
        </div>

        {/* ── 五、量能确认规矩 ── */}
        <div className={`p-3 rounded-lg border ${activeRules.has("vol_decline_danger") || activeRules.has("vol_surge_strong") || activeRules.has("pulse_caution") || activeRules.has("early_vol_drop") || activeRules.has("wash_trade") || activeRules.has("shrink_rise_warn") ? "border-red-500/40 bg-red-500/5" : "border-amber-500/20 bg-amber-500/5"}`}>
          <div className="flex items-center gap-1.5 mb-2">
            <Volume2 className={`w-3.5 h-3.5 ${activeRules.has("vol_decline_danger") ? "text-red-500 animate-pulse" : "text-amber-500"}`} />
            <span className={`text-xs font-semibold ${activeRules.has("vol_decline_danger") ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300"}`}>五、量能确认规矩</span>
            {(activeRules.has("vol_decline_danger") || activeRules.has("vol_surge_strong") || activeRules.has("pulse_caution") || activeRules.has("early_vol_drop") || activeRules.has("wash_trade") || activeRules.has("shrink_rise_warn")) && (
              <Badge variant="outline" className="text-[9px] h-4 px-1 bg-red-500/15 text-red-600 border-red-500/30 animate-pulse ml-1">⚠ 量能异动</Badge>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground leading-relaxed space-y-1.5">
            <div className="grid grid-cols-1 gap-1.5">
              <div className={`flex items-start gap-2 p-1.5 rounded border ${ruleClass("shrink_rise", "border-amber-500/10")}`}>
                <span className="text-amber-500 text-xs shrink-0">📊</span>
                <div>
                  <span className="text-foreground font-medium">缩量下跌 → 不急于买入</span>
                  <p>缩量说明卖盘不活跃，但也说明买盘不积极。等放量企稳再参与。</p>
                </div>
              </div>
              <div className={`flex items-start gap-2 p-1.5 rounded border ${ruleClass("shrink_rise_warn", "border-amber-500/10")}`}>
                <span className="text-amber-500 text-xs shrink-0">⚠️</span>
                <div className="flex-1">
                  <div className="flex items-center">
                    <span className="text-foreground font-medium">缩量上涨 → 虚涨，谨防回落</span>
                    {activeBadge("shrink_rise_warn")}
                  </div>
                  <p>量能跟不上价格上涨，说明买盘不足。不可追涨，等放量确认再参与。</p>
                </div>
              </div>
              <div className={`flex items-start gap-2 p-1.5 rounded border ${ruleClass("vol_surge_strong", "border-amber-500/10")}`}>
                <span className="text-amber-500 text-xs shrink-0">📈</span>
                <div className="flex-1">
                  <div className="flex items-center">
                    <span className="text-foreground font-medium">放量上涨 → 确认强势，可加仓</span>
                    {activeBadge("vol_surge_strong")}
                  </div>
                  <p>量价齐升是最健康的走势，可在回调时按仓位表上限操作。</p>
                </div>
              </div>
              <div className={`flex items-start gap-2 p-1.5 rounded border ${ruleClass("vol_rise", "border-amber-500/10")}`}>
                <span className="text-amber-500 text-xs shrink-0">💪</span>
                <div className="flex-1">
                  <div className="flex items-center">
                    <span className="text-foreground font-medium">量增价涨 → 健康上涨信号</span>
                    {activeBadge("vol_rise")}
                  </div>
                  <p>温和放量+持续上涨是最安全的做多信号。可按仓位表正常操作。</p>
                </div>
              </div>
              <div className={`flex items-start gap-2 p-1.5 rounded border ${ruleClass("pulse_caution", "border-amber-500/10")}`}>
                <span className="text-amber-500 text-xs shrink-0">⚡</span>
                <div className="flex-1">
                  <div className="flex items-center">
                    <span className="text-foreground font-medium">脉冲放量 → 关注异动，谨慎追入</span>
                    {activeBadge("pulse_caution")}
                  </div>
                  <p>突然放量可能是主力试盘或诱多。观察5分钟内是否持续，不追脉冲量。</p>
                </div>
              </div>
              <div className={`flex items-start gap-2 p-1.5 rounded border ${ruleClass("early_vol_drop", "border-amber-500/10")}`}>
                <span className="text-orange-500 text-xs shrink-0">🌅</span>
                <div className="flex-1">
                  <div className="flex items-center">
                    <span className="text-foreground font-medium">早盘缩量下跌 → 弱势信号</span>
                    {activeBadge("early_vol_drop")}
                  </div>
                  <p>开盘30分钟内缩量下跌，说明市场不看好。不急于抄底，等放量企稳再参与。</p>
                </div>
              </div>
              <div className={`flex items-start gap-2 p-1.5 rounded border ${ruleClass("wash_trade", "border-amber-500/10")}`}>
                <span className="text-purple-500 text-xs shrink-0">🔄</span>
                <div className="flex-1">
                  <div className="flex items-center">
                    <span className="text-foreground font-medium">对倒洗盘 → 观望，不参与</span>
                    {activeBadge("wash_trade")}
                  </div>
                  <p>放量但价格不动，可能是主力对倒。不追涨不杀跌，等待方向明确。</p>
                </div>
              </div>
              <div className={`flex items-start gap-2 p-1.5 rounded border ${activeRules.has("vol_decline_danger") ? "border-red-500/40 bg-red-500/10" : "border-amber-500/10"}`}>
                <span className={`text-xs shrink-0 ${activeRules.has("vol_decline_danger") ? "text-red-500 animate-pulse" : "text-amber-500"}`}>📉</span>
                <div className="flex-1">
                  <div className="flex items-center">
                    <span className={`font-medium ${activeRules.has("vol_decline_danger") ? "text-red-600 dark:text-red-400" : "text-foreground"}`}>放量下跌 → 最危险，规避</span>
                    {activeBadge("vol_decline_danger")}
                  </div>
                  <p className={activeRules.has("vol_decline_danger") ? "text-red-600/80" : ""}>放量下跌说明抛压沉重，即使有买入信号也要降一个仓位等级。</p>
                  {activeRules.has("vol_decline_danger") && (
                    <p className="text-red-600 dark:text-red-400 font-bold text-[10px] mt-1">⚠ 当前检测到放量下跌信号！建议立即降低仓位，规避风险。</p>
                  )}
                </div>
              </div>
            </div>
            <div className="p-1.5 rounded border border-amber-500/10 bg-amber-500/5">
              <p className="text-amber-600 dark:text-amber-400 font-medium text-[10px]">💡 量能是价格方向的确认器：无量上涨不可信，放量下跌要远离。</p>
            </div>
          </div>
        </div>

        {/* ── 六、放量下跌专题 ── */}
        <div className={`p-3 rounded-lg border-2 ${activeRules.has("vol_decline_danger") ? "border-red-500/60 bg-gradient-to-br from-red-500/8 via-red-500/3 to-transparent shadow-red-500/10 shadow-md" : "border-red-500/25 bg-red-500/3"}`}>
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle className={`w-4 h-4 ${activeRules.has("vol_decline_danger") ? "text-red-500 animate-pulse" : "text-red-500"}`} />
            <span className={`text-xs font-bold ${activeRules.has("vol_decline_danger") ? "text-red-700 dark:text-red-300 animate-pulse" : "text-red-700 dark:text-red-300"}`}>六、放量下跌专题（最危险信号·必须掌握）</span>
            {activeRules.has("vol_decline_danger") && (
              <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-red-500/20 text-red-600 border-red-500/40 animate-pulse ml-1">🚨 当前触发</Badge>
            )}
          </div>

          <div className="text-[11px] text-muted-foreground leading-relaxed space-y-2">

            {/* 1. 定义与识别 */}
            <div className={`p-2 rounded-md border ${activeRules.has("vol_decline_danger") ? "border-red-500/40 bg-red-500/10" : "border-red-500/15 bg-red-500/5"}`}>
              <p className="text-red-600 dark:text-red-400 font-bold text-xs mb-1.5">📖 什么是放量下跌？</p>
              <p className="mb-2">成交量显著放大（1.5-2倍以上均量）的同时股价持续下跌，说明<strong className="text-red-600 dark:text-red-400">大量资金在抛售</strong>，是日内做T最危险的信号。分时图上表现为：白线持续下行，下方成交量柱明显放大变长。</p>
              <p className="text-foreground font-semibold text-[11px] mb-1">📐 量化识别标准</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[10px]">
                <div className="flex items-start gap-1.5 p-1.5 rounded border border-red-500/10 bg-red-500/5">
                  <span className="text-red-500 shrink-0">📊</span>
                  <div><span className="text-foreground font-medium">量能标准</span>：窗口均量 ≥ 1.2倍基线均量（5min/15min/30min窗口）</div>
                </div>
                <div className="flex items-start gap-1.5 p-1.5 rounded border border-red-500/10 bg-red-500/5">
                  <span className="text-red-500 shrink-0">📉</span>
                  <div><span className="text-foreground font-medium">价格标准</span>：窗口内价格下跌 ≥ 0.3%</div>
                </div>
                <div className="flex items-start gap-1.5 p-1.5 rounded border border-red-500/10 bg-red-500/5">
                  <span className="text-red-500 shrink-0">⏱️</span>
                  <div><span className="text-foreground font-medium">下跌分钟占比</span>：≥ 50%分钟收跌</div>
                </div>
                <div className="flex items-start gap-1.5 p-1.5 rounded border border-red-500/10 bg-red-500/5">
                  <span className="text-red-500 shrink-0">⚡</span>
                  <div><span className="text-foreground font-medium">量价齐跌</span>：下跌+放量分钟占比 ≥ 10%</div>
                </div>
              </div>
              <div className="mt-1.5 p-1.5 rounded border border-red-500/10 bg-red-500/5 text-[10px]">
                <span className="text-red-500">🔍</span> <span className="text-foreground font-medium">分时图特征</span>：白线持续下行 + 下方成交量柱明显放大变长 + 均线斜率向下
              </div>
            </div>

            {/* 2. 四种细分类型 */}
            <div>
              <p className="text-foreground font-semibold text-[11px] mb-1.5">🔬 放量下跌的四种细分类型</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                <div className="p-2 rounded-md border border-red-500/25 bg-red-500/5">
                  <p className="text-red-600 dark:text-red-400 font-bold text-[11px] mb-1">🔨 砸盘式放量下跌</p>
                  <div className="text-[10px] space-y-0.5">
                    <p><span className="text-foreground font-medium">特征</span>：单分钟或连续2-3分钟突放巨量（3-5倍均量），价格瞬间跳水1-2%</p>
                    <p><span className="text-foreground font-medium">分时图</span>：突然出现的超长成交量柱 + 白线急挫</p>
                    <p><span className="text-red-500/80">常见于：早盘主力出货、利空消息冲击、大单砸盘</span></p>
                  </div>
                </div>
                <div className="p-2 rounded-md border border-orange-500/25 bg-orange-500/5">
                  <p className="text-orange-600 dark:text-orange-400 font-bold text-[11px] mb-1">🌧️ 阴跌式放量下跌</p>
                  <div className="text-[10px] space-y-0.5">
                    <p><span className="text-foreground font-medium">特征</span>：量能温和放大（1.2-1.5倍），价格持续缓慢下跌，5分钟K线连续收阴</p>
                    <p><span className="text-foreground font-medium">分时图</span>：白线缓慢下行 + 成交量柱略高于均量</p>
                    <p><span className="text-orange-500 font-medium">⚠ 比砸盘式更危险——看似不急，实则在持续出货</span></p>
                  </div>
                </div>
                <div className="p-2 rounded-md border border-yellow-500/25 bg-yellow-500/5">
                  <p className="text-yellow-600 dark:text-yellow-400 font-bold text-[11px] mb-1">📉 跳水式放量下跌</p>
                  <div className="text-[10px] space-y-0.5">
                    <p><span className="text-foreground font-medium">特征</span>：短暂横盘后突然放量跳水，量能阶梯式放大（1.5→2→3倍）</p>
                    <p><span className="text-foreground font-medium">分时图</span>：横盘 → 破位 → 加速下跌</p>
                    <p><span className="text-yellow-500/80">常见于：跌破关键支撑位触发止损盘、午后方向确认后集中卖出</span></p>
                  </div>
                </div>
                <div className="p-2 rounded-md border border-purple-500/25 bg-purple-500/5">
                  <p className="text-purple-600 dark:text-purple-400 font-bold text-[11px] mb-1">⚡ 脉冲式放量下跌</p>
                  <div className="text-[10px] space-y-0.5">
                    <p><span className="text-foreground font-medium">特征</span>：短时间内放量下跌后又快速缩量企稳，形成V型或脉冲低点</p>
                    <p><span className="text-foreground font-medium">分时图</span>：突然的长量柱 + 白线V型回升</p>
                    <p><span className="text-purple-500/80">可能是主力试压或洗盘，但不排除后续再次放量下跌</span></p>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. 三种时段形态 */}
            <div>
              <p className="text-foreground font-semibold text-[11px] mb-1.5">⏰ 三种时段的放量下跌形态</p>
              <div className="grid grid-cols-1 gap-1.5">
                <div className="flex items-start gap-2 p-2 rounded border border-red-500/20 bg-red-500/5">
                  <span className="text-red-600 dark:text-red-400 font-bold text-[10px] shrink-0 w-20">9:30-10:00</span>
                  <div>
                    <span className="text-red-600 dark:text-red-400 font-bold text-[11px]">早盘放量下杀 → 极度危险 🔴</span>
                    <p>开盘即放量下跌，说明主力资金出逃坚决。全天大概率继续走弱，<strong className="text-red-600 dark:text-red-400">严禁抄底</strong>，反T(先卖再买)冲高卖出后不急于买回。</p>
                    <p className="text-red-500 font-medium text-[10px] mt-1">🚨 若开盘5分钟内即放量下杀，当日不做正T</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 p-2 rounded border border-orange-500/20 bg-orange-500/5">
                  <span className="text-orange-600 dark:text-orange-400 font-bold text-[10px] shrink-0 w-20">10:00-14:00</span>
                  <div>
                    <span className="text-orange-600 dark:text-orange-400 font-bold text-[11px]">盘中放量下跌 → 高危需辨别 🟠</span>
                    <p>可能是主力洗盘也可能是真正出货。关键看：是否跌破关键支撑位、量能是否持续放大。若连续3根5分钟K线放量下跌，按真正出货处理。</p>
                    <p className="text-orange-500 font-medium text-[10px] mt-1">🔑 辨别洗盘vs出货关键：看5分钟后量能是否持续放大，缩量=洗盘可能，持续放量=出货</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 p-2 rounded border border-yellow-500/20 bg-yellow-500/5">
                  <span className="text-yellow-600 dark:text-yellow-400 font-bold text-[10px] shrink-0 w-20">14:00-15:00</span>
                  <div>
                    <span className="text-yellow-600 dark:text-yellow-400 font-bold text-[11px]">尾盘放量下跌 → 恐慌信号 🟡</span>
                    <p>尾盘恐慌性抛售，次日可能低开。做T仓位必须在此之前已清仓，持股者不追加，等次日观察。尾盘放量下跌不抄底。</p>
                    <p className="text-yellow-600 font-medium text-[10px] mt-1">⚠ 尾盘放量下跌次日大概率低开，做T者当日必须已清仓</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 4. 分时图量化识别标准 */}
            <div className={`p-2 rounded-md border ${activeRules.has("vol_decline_danger") ? "border-red-500/30 bg-red-500/8" : "border-red-500/15 bg-red-500/5"}`}>
              <p className="text-foreground font-semibold text-[11px] mb-1.5">📋 分时图量化识别标准</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[10px]">
                <div className="flex items-start gap-1.5 p-1 rounded bg-green-500/5">
                  <span className="text-green-500 shrink-0">✅</span>
                  <span>白线持续下行，低点不断降低</span>
                </div>
                <div className="flex items-start gap-1.5 p-1 rounded bg-green-500/5">
                  <span className="text-green-500 shrink-0">✅</span>
                  <span>成交量柱明显高于前30分钟平均水平</span>
                </div>
                <div className="flex items-start gap-1.5 p-1 rounded bg-green-500/5">
                  <span className="text-green-500 shrink-0">✅</span>
                  <span>均线（黄线）斜率向下</span>
                </div>
                <div className="flex items-start gap-1.5 p-1 rounded bg-green-500/5">
                  <span className="text-green-500 shrink-0">✅</span>
                  <span>下跌时量柱放大，反弹时量柱缩小（量价背离）</span>
                </div>
                <div className="flex items-start gap-1.5 p-1 rounded bg-green-500/5">
                  <span className="text-green-500 shrink-0">✅</span>
                  <span>连续3根以上1分钟K线收阴且放量</span>
                </div>
                <div className="flex items-start gap-1.5 p-1 rounded bg-green-500/5">
                  <span className="text-green-500 shrink-0">✅</span>
                  <span>价格跌破均价线且量能放大</span>
                </div>
              </div>
            </div>

            {/* 5. 应对策略矩阵 */}
            <div>
              <p className="text-foreground font-semibold text-[11px] mb-1.5">📋 放量下跌应对策略矩阵</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b border-red-500/15">
                      <th className="text-left py-1.5 px-1.5 text-red-600 dark:text-red-400 font-semibold">场景</th>
                      <th className="text-left py-1.5 px-1.5 text-red-600 dark:text-red-400 font-semibold">危险等级</th>
                      <th className="text-left py-1.5 px-1.5 text-red-600 dark:text-red-400 font-semibold">仓位上限</th>
                      <th className="text-left py-1.5 px-1.5 text-red-600 dark:text-red-400 font-semibold">操作策略</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border/30 bg-red-500/10">
                      <td className="py-1.5 px-1.5 font-medium">三跌+放量下跌</td>
                      <td className="py-1.5 px-1.5"><span className="text-red-600 font-bold">🔴 极危</span></td>
                      <td className="py-1.5 px-1.5"><span className="text-red-500 font-bold">空仓</span></td>
                      <td className="py-1.5 px-1.5"><span className="text-red-500 font-medium">不参与任何做T</span></td>
                    </tr>
                    <tr className="border-b border-border/30 bg-red-500/5">
                      <td className="py-1.5 px-1.5 font-medium">双跌+放量下跌</td>
                      <td className="py-1.5 px-1.5"><span className="text-red-600 font-bold">🔴 高危</span></td>
                      <td className="py-1.5 px-1.5"><span className="text-red-500 font-bold">≤1/4</span></td>
                      <td className="py-1.5 px-1.5"><span className="text-red-500 font-medium">反T(先卖再买)冲高卖出</span></td>
                    </tr>
                    <tr className="border-b border-border/30 bg-orange-500/5">
                      <td className="py-1.5 px-1.5 font-medium">单跌+放量下跌</td>
                      <td className="py-1.5 px-1.5"><span className="text-orange-500 font-bold">🟠 中危</span></td>
                      <td className="py-1.5 px-1.5"><span className="text-orange-500 font-bold">≤1/3</span></td>
                      <td className="py-1.5 px-1.5"><span className="text-orange-500 font-medium">仓位降一级，反T为主</span></td>
                    </tr>
                    <tr className="border-b border-border/30">
                      <td className="py-1.5 px-1.5 font-medium">大盘涨+放量下跌</td>
                      <td className="py-1.5 px-1.5"><span className="text-yellow-500 font-bold">🟡 需警惕</span></td>
                      <td className="py-1.5 px-1.5"><span className="text-yellow-500 font-bold">≤1/3</span></td>
                      <td className="py-1.5 px-1.5"><span className="text-yellow-500 font-medium">个股独立风险，反T卖出</span></td>
                    </tr>
                    <tr className="border-b border-border/30 bg-red-500/8">
                      <td className="py-1.5 px-1.5 font-medium">放量下跌+跌破均价线</td>
                      <td className="py-1.5 px-1.5"><span className="text-red-600 font-bold">🔴 极危</span></td>
                      <td className="py-1.5 px-1.5"><span className="text-red-500 font-bold">≤1/4</span></td>
                      <td className="py-1.5 px-1.5"><span className="text-red-500 font-medium">反T卖出，均价线下不做正T</span></td>
                    </tr>
                    <tr className="border-b border-border/30 bg-red-500/10">
                      <td className="py-1.5 px-1.5 font-medium">放量下跌+大盘暴跌(&gt;2%)</td>
                      <td className="py-1.5 px-1.5"><span className="text-red-600 font-bold">🔴 极危</span></td>
                      <td className="py-1.5 px-1.5"><span className="text-red-500 font-bold">空仓</span></td>
                      <td className="py-1.5 px-1.5"><span className="text-red-500 font-medium">全面撤退，不做任何T</span></td>
                    </tr>
                    <tr>
                      <td className="py-1.5 px-1.5 font-medium">放量下跌后缩量企稳</td>
                      <td className="py-1.5 px-1.5"><span className="text-green-500 font-bold">🟢 可观察</span></td>
                      <td className="py-1.5 px-1.5"><span className="text-green-500 font-bold">≤1/3</span></td>
                      <td className="py-1.5 px-1.5"><span className="text-green-500 font-medium">企稳15分钟后可轻仓正T</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 6. 信号强度等级 */}
            <div>
              <p className="text-foreground font-semibold text-[11px] mb-1.5">⚡ 信号强度等级（分时图识别）</p>
              <div className="grid grid-cols-1 gap-1.5">
                <div className={`flex items-start gap-2 p-1.5 rounded border ${activeRules.has("vol_decline_danger") ? "border-red-500/40 bg-red-500/10 ring-1 ring-red-500/30" : "border-red-500/15"}`}>
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-bold bg-red-500/20 text-red-600 border border-red-500/30 shrink-0">强</span>
                  <div>
                    <span className="text-red-600 dark:text-red-400 font-bold text-[11px]">强信号(≥50分)：连续5根以上1分钟K线放量下跌</span>
                    <p>窗口均量≥1.5倍基线，价格跌≥1%，下跌量占比≥70%。抛压持续且坚决，主力大概率在出货。立即降仓至1/4以下，反T(先卖再买)为主。{activeRules.has("vol_decline_danger") && <span className="text-red-600 font-bold">← 当前状态</span>}</p>
                  </div>
                </div>
                <div className={`flex items-start gap-2 p-1.5 rounded border ${activeRules.has("pulse_decline_danger") ? "border-orange-500/30 bg-orange-500/8" : "border-orange-500/15"}`}>
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-bold bg-orange-500/15 text-orange-600 border border-orange-500/25 shrink-0">中</span>
                  <div>
                    <span className="text-orange-600 dark:text-orange-400 font-bold text-[11px]">中信号(30-49分)：脉冲放量+下跌</span>
                    <p>窗口均量≥1.2倍基线，价格跌≥0.5%，下跌量占比≥50%。可能是主力试压或部分出货。仓位降至1/3以下，观察后续5分钟是否继续放量。{activeRules.has("pulse_decline_danger") && <span className="text-orange-600 font-bold">← 当前状态</span>}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 p-1.5 rounded border border-yellow-500/15">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-bold bg-yellow-500/10 text-yellow-600 border border-yellow-500/20 shrink-0">弱</span>
                  <div>
                    <span className="text-yellow-600 dark:text-yellow-400 font-bold text-[11px]">弱信号(10-29分)：单次放量下杀后快速企稳</span>
                    <p>窗口均量≥1.1倍基线。可能是短线资金出局或散户恐慌，不一定持续下跌。维持现有仓位，但不加仓，等确认方向。</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 7. 放量下跌后的企稳判断 */}
            <div className="p-2 rounded-md border border-green-500/20 bg-green-500/5">
              <p className="text-green-600 dark:text-green-400 font-bold text-[11px] mb-1.5">🟢 放量下跌后的企稳判断（重新入场决策）</p>
              <div className="space-y-1.5 text-[11px]">
                <div>
                  <p className="text-foreground font-semibold text-[10px] mb-0.5">📉 缩量企稳信号</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[10px]">
                    <div className="flex items-start gap-1 p-1 rounded border border-green-500/10 bg-green-500/5">
                      <span className="text-green-500 shrink-0">✅</span>
                      <span>成交量柱降至均量的50%以下</span>
                    </div>
                    <div className="flex items-start gap-1 p-1 rounded border border-green-500/10 bg-green-500/5">
                      <span className="text-green-500 shrink-0">✅</span>
                      <span>白线走平（5分钟内波动&lt;0.2%）</span>
                    </div>
                    <div className="flex items-start gap-1 p-1 rounded border border-green-500/10 bg-green-500/5">
                      <span className="text-green-500 shrink-0">✅</span>
                      <span>均线斜率趋于平缓</span>
                    </div>
                    <div className="flex items-start gap-1 p-1 rounded border border-green-500/10 bg-green-500/5">
                      <span className="text-green-500 shrink-0">✅</span>
                      <span>价格不再创新低</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-1.5 p-1 rounded border border-green-500/15 bg-green-500/8">
                  <span className="text-green-500 shrink-0">⏱️</span>
                  <div><span className="text-foreground font-medium">企稳确认时间</span>：至少<strong className="text-green-600 dark:text-green-400">15分钟</strong>缩量企稳后才可考虑参与</div>
                </div>
                <div className="flex items-start gap-1.5 p-1 rounded border border-red-500/15 bg-red-500/5">
                  <span className="text-red-500 shrink-0">❌</span>
                  <div><span className="text-foreground font-medium">假企稳识别</span>：缩量2-3分钟后再次放量下跌=假企稳，必须等更长时间</div>
                </div>
                <div className="flex items-start gap-1.5 p-1 rounded border border-amber-500/15 bg-amber-500/5">
                  <span className="text-amber-500 shrink-0">🔑</span>
                  <div><span className="text-foreground font-medium">可参与条件</span>：缩量企稳15分钟 + 价格站上均价线 + 大盘不弱 → 可轻仓正T</div>
                </div>
              </div>
            </div>

            {/* 8. 放量下跌与做T策略的结合 */}
            <div className="p-2 rounded-md border border-violet-500/20 bg-violet-500/5">
              <p className="text-violet-600 dark:text-violet-400 font-bold text-[11px] mb-1.5">🎯 放量下跌与做T策略的结合</p>
              <div className="space-y-1.5 text-[11px]">
                <div className="p-1.5 rounded border border-green-500/15 bg-green-500/5">
                  <p className="text-green-600 dark:text-green-400 font-bold text-[10px] mb-0.5">🟢 正T（先买后卖）</p>
                  <p>放量下跌期间<strong className="text-red-600">严禁正T</strong>！必须等缩量企稳15分钟后才可考虑。</p>
                  <p className="text-foreground font-medium text-[10px]">正T介入点：放量下跌→缩量企稳→价格站上均价线→轻仓买入→反弹卖出</p>
                </div>
                <div className="p-1.5 rounded border border-red-500/15 bg-red-500/5">
                  <p className="text-red-600 dark:text-red-400 font-bold text-[10px] mb-0.5">🔴 反T（先卖后买）</p>
                  <p>放量下跌是反T的<strong className="text-red-600">最佳卖出时机</strong>！看到放量下跌信号立即卖出，等缩量企稳后再买回。</p>
                  <p className="text-foreground font-medium text-[10px]">买回条件：缩量15分钟 + 不再创新低 + 价格回到均价线附近</p>
                </div>
                <div className="p-1.5 rounded border border-orange-500/15 bg-orange-500/5">
                  <p className="text-orange-600 dark:text-orange-400 font-bold text-[10px] mb-0.5">⚠️ 仓位控制</p>
                  <p>放量下跌信号下，所有做T仓位上限降低一级：</p>
                  <div className="text-[10px] space-y-0.5 mt-0.5">
                    <p>• 三跌+放量 = <span className="text-red-600 font-bold">空仓</span></p>
                    <p>• 双跌+放量 = <span className="text-red-500 font-bold">≤1/4</span></p>
                    <p>• 单跌+放量 = <span className="text-orange-500 font-bold">≤1/3</span></p>
                  </div>
                </div>
              </div>
            </div>

            {/* 9. 常见误区 */}
            <div className="p-2 rounded-md border border-red-500/15 bg-red-500/3">
              <p className="text-red-600 dark:text-red-400 font-bold text-[11px] mb-1.5">❌ 放量下跌的常见误区</p>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-start gap-1.5">
                  <span className="text-red-500 shrink-0">✗</span>
                  <div>
                    <span className="text-foreground font-medium">"放量下跌是主力洗盘，应该加仓"</span>
                    <p className="text-red-500/70">→ 日内做T不猜主力意图！洗盘还是出货事后才知道，做T首要保本。</p>
                  </div>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-red-500 shrink-0">✗</span>
                  <div>
                    <span className="text-foreground font-medium">"放量下跌后一定会有反弹"</span>
                    <p className="text-red-500/70">→ 不一定！放量下跌可能持续一整天。即使反弹，也先避险再说。</p>
                  </div>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-red-500 shrink-0">✗</span>
                  <div>
                    <span className="text-foreground font-medium">"大盘涨的放量下跌不危险"</span>
                    <p className="text-red-500/70">→ 错！个股独立放量下跌说明自身有问题（利好出尽、业绩地雷等），比跟跌更危险。</p>
                  </div>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-red-500 shrink-0">✗</span>
                  <div>
                    <span className="text-foreground font-medium">"放量下跌跌多了就可以抄底"</span>
                    <p className="text-red-500/70">→ 放量下跌不接飞刀！必须等缩量企稳至少15分钟才可考虑参与。</p>
                  </div>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-red-500 shrink-0">✗</span>
                  <div>
                    <span className="text-foreground font-medium">"放量下跌时均线还在向上就不危险"</span>
                    <p className="text-red-500/70">→ 错！均线有滞后性，放量下跌已经发生，均线拐头只是时间问题。</p>
                  </div>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-red-500 shrink-0">✗</span>
                  <div>
                    <span className="text-foreground font-medium">"放量下跌只发生在弱势股"</span>
                    <p className="text-red-500/70">→ 错！强势股放量下跌更危险，可能是利好出尽或主力获利了结，跌幅往往更大。</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 10. 操作口诀 */}
            <div className={`p-2 rounded-md border ${activeRules.has("vol_decline_danger") ? "border-red-500/40 bg-red-500/10" : "border-red-500/15 bg-red-500/5"}`}>
              <p className="text-red-600 dark:text-red-400 font-bold text-xs mb-1">🔑 放量下跌操作口诀</p>
              <div className="text-[11px] space-y-0.5 text-foreground">
                <p>• <span className="font-bold">见放量下跌先避险</span>，仓位降级是关键</p>
                <p>• <span className="font-bold">不抄底、不接飞刀</span>，等缩量企稳再看</p>
                <p>• <span className="font-bold">三跌+放量 = 必空仓</span>，任何理由都不参与</p>
                <p>• <span className="font-bold">放量下跌只做反T</span>（先卖再买），不做正T</p>
                <p>• <span className="font-bold">企稳15分钟是前提</span>，未企稳不入场</p>
                <p>• <span className="font-bold">量能持续放大=出货</span>，量能萎缩=洗盘可能，但做T不赌方向</p>
                <p>• <span className="font-bold">企稳15分钟+站上均价线</span>= 可轻仓正T的最低条件</p>
              </div>
            </div>

            {/* 11. 当前状态提示 */}
            {activeRules.has("vol_decline_danger") && (
              <div className="p-2 rounded-md border-2 border-red-500/50 bg-red-500/10 animate-pulse">
                <p className="text-red-600 dark:text-red-400 font-bold text-xs">🚨 当前检测到放量下跌信号！</p>
                <p className="text-red-600/80 text-[11px] mt-1">建议立即：①降低仓位至1/4以下 ②以反T(先卖再买)为主 ③观察是否持续放量 ④等缩量企稳15分钟后再考虑参与</p>
              </div>
            )}
          </div>
        </div>

        {/* ── 七、大盘影响说明 ── */}
        <div className="p-3 rounded-lg border border-orange-500/20 bg-orange-500/5">
          <div className="flex items-center gap-1.5 mb-2">
            <Activity className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-xs font-semibold text-orange-700 dark:text-orange-300">七、大盘（深证成指）仓位调节器</span>
          </div>
          <div className="text-[11px] text-muted-foreground leading-relaxed space-y-2">
            <p className="text-foreground font-medium">大盘方向是仓位"调节器"，在阶梯基础上微调：</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="p-2 rounded border border-red-500/15 bg-red-500/5">
                <p className="text-red-600 dark:text-red-400 font-medium text-[11px] mb-1">🔻 深证下跌：全面收紧</p>
                <div className="space-y-0.5 text-[11px]">
                  <p>• 三跌场景 → 降至1/4（最低级）</p>
                  <p>• 双跌场景 → 不超1/3</p>
                  <p>• 逆势走强 → 上限降低5-10%</p>
                  <p>• 暴跌(&gt;2%) → 空仓，不参与</p>
                </div>
              </div>
              <div className="p-2 rounded border border-green-500/15 bg-green-500/5">
                <p className="text-green-600 dark:text-green-400 font-medium text-[11px] mb-1">🔺 深证上涨：适度放宽</p>
                <div className="space-y-0.5 text-[11px]">
                  <p>• 三涨场景 → 可达90-100%</p>
                  <p>• 双涨场景 → 上限提升至70-80%</p>
                  <p>• 个股回调 → 低吸好时机</p>
                  <p>• 翻红信号 → 仓位可提升一级</p>
                </div>
              </div>
            </div>
            <div className="mt-1 p-1.5 rounded border border-orange-500/10 bg-orange-500/5">
              <p className="text-orange-600 dark:text-orange-400 font-medium text-[10px]">为什么选深证成指？覆盖深市中小盘和成长股，比上证50灵敏，比创业板指稳定，跌破关键支撑=市场整体走弱。</p>
            </div>
          </div>
        </div>

        {/* ── 八、仓位速查表 ── */}
        <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
          <div className="flex items-center gap-1.5 mb-2">
            <Scale className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">八、仓位速查表</span>
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
                <tr className="border-b border-border/30 bg-red-500/10">
                  <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 跌</span></td>
                  <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 跌</span></td>
                  <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 跌</span></td>
                  <td className="py-1.5 px-2"><span className="text-red-500 font-bold">≤1/4</span></td>
                  <td className="py-1.5 px-2"><span className="text-red-500 font-medium">反T(先卖再买)/空仓</span></td>
                  <td className="py-1.5 px-2"><span className="text-red-600 dark:text-red-400 font-medium">三跌！最危险</span></td>
                </tr>
                <tr className="border-b border-border/30 bg-red-500/5">
                  <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 跌</span></td>
                  <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 跌</span></td>
                  <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 涨</span></td>
                  <td className="py-1.5 px-2"><span className="text-orange-500 font-bold">≤1/3</span></td>
                  <td className="py-1.5 px-2"><span className="text-red-500 font-medium">反T(先卖再买)冲高卖</span></td>
                  <td className="py-1.5 px-2">逆势走强，大环境差</td>
                </tr>
                <tr className="border-b border-border/30">
                  <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 跌</span></td>
                  <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 涨</span></td>
                  <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 跌</span></td>
                  <td className="py-1.5 px-2 font-medium">15-20%</td>
                  <td className="py-1.5 px-2"><span className="text-yellow-600 font-medium">轻仓正T</span></td>
                  <td className="py-1.5 px-2">大盘拖累，板块独木难支</td>
                </tr>
                <tr className="border-b border-border/30">
                  <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 跌</span></td>
                  <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 涨</span></td>
                  <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 涨</span></td>
                  <td className="py-1.5 px-2 font-medium">20-30%</td>
                  <td className="py-1.5 px-2"><span className="text-yellow-600 font-medium">反T(先卖再买)冲高卖</span></td>
                  <td className="py-1.5 px-2">逆势板块，大盘压制</td>
                </tr>
                <tr className="border-b border-border/30">
                  <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 涨</span></td>
                  <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 跌</span></td>
                  <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 跌</span></td>
                  <td className="py-1.5 px-2"><span className="text-orange-500 font-bold">≤1/3</span></td>
                  <td className="py-1.5 px-2"><span className="text-green-600 font-medium">正T低吸</span></td>
                  <td className="py-1.5 px-2">大盘好但板块差</td>
                </tr>
                <tr className="border-b border-border/30">
                  <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 涨</span></td>
                  <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 跌</span></td>
                  <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 涨</span></td>
                  <td className="py-1.5 px-2 font-medium">25-30%</td>
                  <td className="py-1.5 px-2"><span className="text-red-500 font-medium">反T(先卖再买)冲高卖</span></td>
                  <td className="py-1.5 px-2">大盘支撑，个股逆板块</td>
                </tr>
                <tr className="border-b border-border/30">
                  <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 涨</span></td>
                  <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 涨</span></td>
                  <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 跌</span></td>
                  <td className="py-1.5 px-2 font-medium">25-30%</td>
                  <td className="py-1.5 px-2"><span className="text-green-600 font-medium">正T低吸</span></td>
                  <td className="py-1.5 px-2">大盘+板块支撑</td>
                </tr>
                <tr className="border-b border-border/30 bg-green-500/8">
                  <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 涨</span></td>
                  <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 涨</span></td>
                  <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 涨</span></td>
                  <td className="py-1.5 px-2 font-bold text-green-600">90-100%</td>
                  <td className="py-1.5 px-2"><span className="text-green-600 font-medium">正T/反T(先卖再买)均可</span></td>
                  <td className="py-1.5 px-2"><span className="text-green-600 dark:text-green-400 font-medium">三涨！最安全</span></td>
                </tr>
                <tr>
                  <td className="py-1.5 px-2"><span className="text-gray-400">— 盘</span></td>
                  <td className="py-1.5 px-2"><span className="text-gray-400">— 盘</span></td>
                  <td className="py-1.5 px-2"><span className="text-gray-400">— 盘</span></td>
                  <td className="py-1.5 px-2 font-medium">15-25%</td>
                  <td className="py-1.5 px-2"><span className="text-gray-400 font-medium">观望</span></td>
                  <td className="py-1.5 px-2">方向不明，轻仓试探</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ── 九、禁忌规矩 ── */}
        <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-center gap-1.5 mb-2">
            <BookOpen className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">九、禁忌规矩（绝对不可违反）</span>
          </div>
          <div className="text-[11px] text-muted-foreground leading-relaxed space-y-1.5">
            <div className="flex items-start gap-2">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-red-500/10 text-red-500 border border-red-500/20 shrink-0 mt-0.5">1</span>
              <div>
                <span className="text-foreground font-medium">深证成指暴跌（跌幅 &gt; 2%）→ 空仓，不参与任何做T</span>
                <p>系统性风险下技术分析失效，80%以上个股跟跌。</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-red-500/10 text-red-500 border border-red-500/20 shrink-0 mt-0.5">2</span>
              <div>
                <span className="text-foreground font-medium">做T必须当天完成买卖，严禁隔夜</span>
                <p>做T是日内波动差价，隔夜=投机。大盘弱势时尤其不能隔夜。</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-red-500/10 text-red-500 border border-red-500/20 shrink-0 mt-0.5">3</span>
              <div>
                <span className="text-foreground font-medium">单只股票仓位不超过总资金的40%</span>
                <p>无论信号多强，单一标的风险过于集中。大盘下跌时降至25%以下。</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-red-500/10 text-red-500 border border-red-500/20 shrink-0 mt-0.5">4</span>
              <div>
                <span className="text-foreground font-medium">ST股、退市风险股不参与</span>
                <p>基本面风险无法通过技术分析化解。</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-red-500/10 text-red-500 border border-red-500/20 shrink-0 mt-0.5">5</span>
              <div>
                <span className="text-foreground font-medium">亏损后加仓翻本 → 绝对禁止</span>
                <p>做T亏损后越买越多是最大的坑。亏损说明判断有误，应减仓而非加仓。</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-red-500/10 text-red-500 border border-red-500/20 shrink-0 mt-0.5">6</span>
              <div>
                <span className="text-foreground font-medium">跌停板股票不参与做T</span>
                <p>跌停=流动性枯竭，无法卖出完成做T闭环。涨停同理，买入后可能无法卖出。</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── 十、动态调节规矩 ── */}
        <div className={`p-3 rounded-lg border ${activeRules.has("vol_decline_position") ? "border-red-500/40 bg-red-500/5" : "border-orange-500/20 bg-orange-500/5"}`}>
          <div className="flex items-center gap-1.5 mb-2">
            <Activity className={`w-3.5 h-3.5 ${activeRules.has("vol_decline_position") ? "text-red-500" : "text-orange-500"}`} />
            <span className={`text-xs font-semibold ${activeRules.has("vol_decline_position") ? "text-red-700 dark:text-red-300" : "text-orange-700 dark:text-orange-300"}`}>十、动态调节规矩（根据盘面实时调整）</span>
            {activeRules.has("vol_decline_position") && (
              <Badge variant="outline" className="text-[9px] h-4 px-1 bg-red-500/15 text-red-600 border-red-500/30 animate-pulse ml-1">⚠ 触发</Badge>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground leading-relaxed space-y-1.5">
            <div className="grid grid-cols-1 gap-1.5">
              <div className="flex items-start gap-2 p-1.5 rounded border border-red-500/10 bg-red-500/5">
                <span className="text-red-500 text-xs shrink-0">🔻</span>
                <div>
                  <span className="text-foreground font-medium">深证连续3天下跌 → 仓位上限减半</span>
                  <p>市场信心崩塌，即使有个股信号也极度谨慎。原1/3→1/6，原30%→15%。</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-1.5 rounded border border-green-500/10 bg-green-500/5">
                <span className="text-green-500 text-xs shrink-0">🔺</span>
                <div>
                  <span className="text-foreground font-medium">深证翻红（跌→涨）→ 加仓信号</span>
                  <p>大盘由弱转强，保守仓位→正常仓位。1/4→1/3，20%→30%。</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-1.5 rounded border border-red-500/10 bg-red-500/5">
                <span className="text-red-500 text-xs shrink-0">⛔</span>
                <div>
                  <span className="text-foreground font-medium">板块暴跌 + 大盘下跌 → 清仓观望</span>
                  <p>行业级利空+系统性风险，个股上涨只是暂时抗跌。</p>
                </div>
              </div>
              <div className={`flex items-start gap-2 p-1.5 rounded border ${activeRules.has("vol_decline_position") ? "border-red-500/40 bg-red-500/10 ring-1 ring-red-500/30" : "border-amber-500/10"}`}>
                <span className={`text-xs shrink-0 ${activeRules.has("vol_decline_position") ? "text-red-500 animate-pulse" : "text-amber-500"}`}>📉</span>
                <div className="flex-1">
                  <div className="flex items-center">
                    <span className={`font-medium ${activeRules.has("vol_decline_position") ? "text-red-600 dark:text-red-400" : "text-foreground"}`}>放量下跌 → 仓位降一级</span>
                    {activeBadge("vol_decline_position")}
                  </div>
                  <p className={activeRules.has("vol_decline_position") ? "text-red-600/80" : ""}>抛压沉重时，所有仓位建议下调一个等级。如原30%→20%。</p>
                  {activeRules.has("vol_decline_position") && (
                    <p className="text-red-600 dark:text-red-400 font-bold text-[10px] mt-1">⚠ 当前检测到放量下跌！建议立即将仓位下调一个等级。</p>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-2 p-1.5 rounded border border-amber-500/10">
                <span className="text-amber-500 text-xs shrink-0">🔄</span>
                <div>
                  <span className="text-foreground font-medium">连续2次做T亏损 → 当天停止交易</span>
                  <p>市场节奏与判断不一致，停下来观察。大盘下跌时1次亏损即停。</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── 十一、实战案例 ── */}
        <div className="p-3 rounded-lg border border-rose-500/20 bg-rose-500/5">
          <div className="flex items-center gap-1.5 mb-2">
            <Info className="w-3.5 h-3.5 text-rose-500" />
            <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">十一、实战案例</span>
          </div>
          <div className="text-[11px] text-muted-foreground leading-relaxed space-y-2">
            <div className="p-2 rounded-md border border-red-500/10 bg-red-500/5">
              <p className="text-red-600 dark:text-red-400 font-medium mb-1">场景1（三跌）：深证跌1.8% + 半导体跌1.5% + 个股跌2.3%</p>
              <div className="space-y-0.5">
                <p>→ <span className="text-red-500 font-bold">一级·≤1/4仓</span>，策略：<span className="text-red-500 font-medium">反T(先卖再买)冲高卖</span>，1万资金最多用2500</p>
                <p>• 买入2.5万，跌3%亏750元（总0.75%）→ 可控</p>
                <p>• 满仓1万，跌3%亏300元（总3%）→ 不可接受</p>
                <p>• 若个股冲高翻红，反T(先卖再买)卖出后不买回</p>
              </div>
            </div>
            <div className="p-2 rounded-md border border-green-500/10 bg-green-500/5">
              <p className="text-green-600 dark:text-green-400 font-medium mb-1">场景2（三涨）：深证涨1.2% + 半导体涨0.8% + 个股涨1.5%</p>
              <div className="space-y-0.5">
                <p>→ <span className="text-green-500 font-bold">五级·90-100%仓</span>，策略：<span className="text-green-500 font-medium">正T/反T(先卖再买)均可</span>，1万资金可用9000-10000</p>
                <p>• 正T：回调时买入8万，反弹1.5%赚1200元</p>
                <p>• 反T(先卖再买)：冲高卖出8万，回落买回赚差价</p>
                <p>• 但大盘突然翻绿 → 立即降仓至1/3以下</p>
              </div>
            </div>
            <div className="p-2 rounded-md border border-yellow-500/10 bg-yellow-500/5">
              <p className="text-yellow-600 dark:text-yellow-400 font-medium mb-1">场景3（双跌+大盘涨）：深证涨0.8% + 半导体跌1.5% + 个股跌2.3%</p>
              <div className="space-y-0.5">
                <p>→ <span className="text-orange-500 font-bold">二级·≤1/3仓</span>，策略：<span className="text-green-600 font-medium">正T低吸</span></p>
                <p>• 大盘有支撑但板块弱，仓位≤3.3万</p>
                <p>• 等个股止跌企稳后买入，冲高即卖</p>
                <p>• 若板块转涨 → 可提升至25-30%</p>
              </div>
            </div>
            <div className="p-2 rounded-md border border-emerald-500/10 bg-emerald-500/5">
              <p className="text-emerald-600 dark:text-emerald-400 font-medium mb-1">场景4（大盘弱+板块个股强）：深证跌0.5% + 半导体涨1.2% + 个股涨2.3%</p>
              <div className="space-y-0.5">
                <p>→ <span className="text-yellow-500 font-bold">三级·20-30%仓</span>，策略：<span className="text-red-500 font-medium">反T(先卖再买)冲高卖</span></p>
                <p>• 板块和个股逆大盘走强，有独立行情</p>
                <p>• 但大盘压制下需控仓，冲高先卖后买回</p>
                <p>• 若大盘转涨 → 提升至30-40%；板块转跌 → 降至1/4</p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>}
    </Card>
  );
}
