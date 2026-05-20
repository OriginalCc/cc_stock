"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, Zap, Clock, Volume2, Activity, Scale, BookOpen, Info, ChevronDown, ChevronRight,
} from "lucide-react";

interface TradingRulesCardProps {
  autoExpanded?: boolean;
}

export function TradingRulesCard({ autoExpanded }: TradingRulesCardProps) {
  // null = no manual override; true/false = user explicitly toggled
  const [manualOverride, setManualOverride] = useState<boolean | null>(null);

  // Show expanded if: user explicitly expanded, or autoExpanded is active (and user hasn't manually collapsed)
  const expanded = manualOverride !== null ? manualOverride : !!autoExpanded;

  return (
    <Card className="border-2 border-amber-500/40 border-l-4 border-l-amber-500 shadow-lg shadow-amber-500/10 bg-gradient-to-br from-amber-500/5 via-transparent to-transparent mb-4">
      <CardHeader
        className="pb-2 bg-gradient-to-r from-amber-500/10 to-orange-500/5 border-b border-amber-500/20 cursor-pointer select-none"
        onClick={() => setManualOverride(prev => !prev)}
      >
        <CardTitle className="text-base font-bold flex items-center gap-2 text-amber-700 dark:text-amber-400">
          {expanded ? <ChevronDown className="w-4 h-4 text-amber-500" /> : <ChevronRight className="w-4 h-4 text-amber-500" />}
          <Scale className="w-5 h-5 text-amber-500 drop-shadow-[0_0_3px_rgba(245,158,11,0.5)]" />
          交易规矩
          {autoExpanded && <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-amber-500/10 text-amber-600 border-amber-500/25 animate-pulse">🔔 开盘提醒</Badge>}
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
                  <p>开盘波动剧烈，方向不明。按仓位表×50%执行，不追涨不抄底。<span className="text-red-500 font-semibold">若出现放量下跌红色警告，禁止买入！</span></p>
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
        <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
          <div className="flex items-center gap-1.5 mb-2">
            <Volume2 className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">五、量能确认规矩</span>
          </div>
          <div className="text-[11px] text-muted-foreground leading-relaxed space-y-1.5">
            <div className="grid grid-cols-1 gap-1.5">
              <div className="flex items-start gap-2 p-1.5 rounded border border-amber-500/10">
                <span className="text-amber-500 text-xs shrink-0">📊</span>
                <div>
                  <span className="text-foreground font-medium">缩量下跌 → 不急于买入</span>
                  <p>缩量说明卖盘不活跃，但也说明买盘不积极。等放量企稳再参与。</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-1.5 rounded border border-amber-500/10">
                <span className="text-amber-500 text-xs shrink-0">📈</span>
                <div>
                  <span className="text-foreground font-medium">放量上涨 → 确认强势，可加仓</span>
                  <p>量价齐升是最健康的走势，可在回调时按仓位表上限操作。</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-1.5 rounded border border-amber-500/10">
                <span className="text-amber-500 text-xs shrink-0">⚡</span>
                <div>
                  <span className="text-foreground font-medium">脉冲放量 → 关注异动，谨慎追入</span>
                  <p>突然放量可能是主力试盘或诱多。观察5分钟内是否持续，不追脉冲量。</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-1.5 rounded border border-amber-500/10">
                <span className="text-amber-500 text-xs shrink-0">📉</span>
                <div>
                  <span className="text-foreground font-medium">放量下跌 → 最危险，规避</span>
                  <p>放量下跌说明抛压沉重，即使有买入信号也要降一个仓位等级。<span className="text-red-500 font-semibold">早盘放量下跌尤其危险，主力出逃信号，当日禁止买入。</span></p>
                </div>
              </div>
            </div>
            <div className="p-1.5 rounded border border-amber-500/10 bg-amber-500/5">
              <p className="text-amber-600 dark:text-amber-400 font-medium text-[10px]">💡 量能是价格方向的确认器：无量上涨不可信，放量下跌要远离。</p>
            </div>
          </div>
        </div>

        {/* ── 六、大盘影响说明 ── */}
        <div className="p-3 rounded-lg border border-orange-500/20 bg-orange-500/5">
          <div className="flex items-center gap-1.5 mb-2">
            <Activity className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-xs font-semibold text-orange-700 dark:text-orange-300">六、大盘（深证成指）仓位调节器</span>
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

        {/* ── 七、仓位速查表 ── */}
        <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
          <div className="flex items-center gap-1.5 mb-2">
            <Scale className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">七、仓位速查表</span>
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
                  <td className="py-1.5 px-2"><span className="text-gray-400">横盘</span></td>
                  <td className="py-1.5 px-2"><span className="text-gray-400">横盘</span></td>
                  <td className="py-1.5 px-2"><span className="text-gray-400">横盘</span></td>
                  <td className="py-1.5 px-2 font-medium">15-25%</td>
                  <td className="py-1.5 px-2"><span className="text-gray-400 font-medium">观望</span></td>
                  <td className="py-1.5 px-2">方向不明，轻仓试探</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ── 八、禁忌规矩 ── */}
        <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-center gap-1.5 mb-2">
            <BookOpen className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">八、禁忌规矩（绝对不可违反）</span>
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
            <div className="flex items-start gap-2">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-red-500/15 text-red-500 border border-red-500/25 shrink-0 mt-0.5">7</span>
              <div>
                <span className="text-red-600 dark:text-red-400 font-bold">早盘放量下跌 → 禁止买入！</span>
                <p>9:30-10:00出现放量下跌（分时图红色警告），说明主力资金出逃、抛压沉重。此时抄底=接飞刀，下跌中继概率远大于触底反弹。即使盘中反弹也是诱多，大概率继续下探。</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-red-500/15 text-red-500 border border-red-500/25 shrink-0 mt-0.5">8</span>
              <div>
                <span className="text-red-600 dark:text-red-400 font-bold">早盘放量下跌后的"V型反转"不追</span>
                <p>早盘暴跌后的反弹多为空头回补或短线客博反弹，并非真正的买盘力量。常见走势：急跌→弱反弹→再破低。至少等到10:00后趋势确认再考虑参与。</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── 九、早盘放量下跌专题 ── */}
        <div className="p-3 rounded-lg border-2 border-red-500/40 bg-gradient-to-br from-red-500/10 via-red-500/5 to-transparent">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
            <span className="text-xs font-bold text-red-700 dark:text-red-300">九、早盘放量下跌专题（高危场景必读）</span>
            <span className="text-[10px] text-red-500/60 ml-auto">🚫 禁止买入</span>
          </div>
          <div className="text-[11px] text-muted-foreground leading-relaxed space-y-2">
            {/* 什么是早盘放量下跌 */}
            <div className="p-2 rounded-md border border-red-500/20 bg-red-500/5">
              <p className="text-red-600 dark:text-red-400 font-bold text-xs mb-1.5">📌 什么是早盘放量下跌？</p>
              <div className="space-y-1 text-[11px]">
                <p>指<span className="text-foreground font-medium">9:30-10:00</span>时间段内，股价持续下跌且成交量显著放大的走势。系统会自动检测并在分时图上显示<span className="text-red-500 font-bold">红色警告标记</span>和<span className="text-red-500 font-bold">"禁止买入"横幅</span>。</p>
                <p>判断依据：早盘跌幅、量比、下跌放量占比、急跌率、跳空低开等多维度综合评分，≥30分即触发警告。</p>
              </div>
            </div>

            {/* 为什么危险 */}
            <div className="p-2 rounded-md border border-red-500/20 bg-red-500/5">
              <p className="text-red-600 dark:text-red-400 font-bold text-xs mb-1.5">⚠️ 为什么早盘放量下跌最危险？</p>
              <div className="space-y-1 text-[11px]">
                <p>• <span className="text-foreground font-medium">主力出逃信号</span>：开盘即放量砸盘，说明大资金在集中出货，不是散户行为</p>
                <p>• <span className="text-foreground font-medium">信息不对称</span>：可能有利空消息市场尚未充分消化，机构先知先觉</p>
                <p>• <span className="text-foreground font-medium">下跌中继概率高</span>：统计显示早盘放量下跌后，继续下探概率超70%</p>
                <p>• <span className="text-foreground font-medium">反弹多为诱多</span>：缩量反弹→放量再跌是常见套路，抄底者成为下一波抛压</p>
                <p>• <span className="text-foreground font-medium">流动性陷阱</span>：放量下跌说明买盘承接不住，越买套越深</p>
              </div>
            </div>

            {/* 典型走势 */}
            <div className="p-2 rounded-md border border-red-500/20 bg-red-500/5">
              <p className="text-red-600 dark:text-red-400 font-bold text-xs mb-1.5">📉 早盘放量下跌的三种典型走势</p>
              <div className="space-y-1.5 text-[11px]">
                <div className="p-1.5 rounded border border-red-500/15 bg-red-500/3">
                  <span className="text-red-500 font-medium">走势A（最常见·60%）：单边下跌</span>
                  <p>9:30放量下杀 → 10:00继续跌 → 午后加速 → 收盘全天最低附近</p>
                  <p className="text-red-400">→ 抄底者全天被套，次日继续低开</p>
                </div>
                <div className="p-1.5 rounded border border-red-500/15 bg-red-500/3">
                  <span className="text-amber-500 font-medium">走势B（25%）：先跌后弱反弹再跌</span>
                  <p>9:30急跌 → 10:00-11:00反弹至开盘价附近 → 午后再次放量下破</p>
                  <p className="text-red-400">→ 反弹是空头回补不是企稳，二次下跌更猛烈</p>
                </div>
                <div className="p-1.5 rounded border border-green-500/15 bg-green-500/3">
                  <span className="text-green-500 font-medium">走势C（15%）：真V型反转</span>
                  <p>9:30急跌 → 10:00后持续放量拉升 → 收盘翻红</p>
                  <p className="text-amber-500">→ 极少出现，多为重大利好刺激，无法提前预判</p>
                </div>
              </div>
              <p className="mt-1.5 text-red-500/80 text-[10px] font-medium">💡 结论：3种走势中只有15%是V型反转，但V型无法提前判断。按纪律空仓观望，错过这15%也远好于被套70%。</p>
            </div>

            {/* 应对策略 */}
            <div className="p-2 rounded-md border border-red-500/20 bg-red-500/5">
              <p className="text-red-600 dark:text-red-400 font-bold text-xs mb-1.5">🛡️ 早盘放量下跌应对策略</p>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-start gap-2 p-1.5 rounded border border-red-500/10">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-bold bg-red-500/15 text-red-600 border border-red-500/25 shrink-0">1</span>
                  <div>
                    <span className="text-red-600 dark:text-red-400 font-bold">立即停止买入</span>
                    <p>看到红色警告 → 不抄底、不低吸、不加仓，任何买入念头都是错的</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 p-1.5 rounded border border-red-500/10">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-bold bg-orange-500/15 text-orange-600 border border-orange-500/25 shrink-0">2</span>
                  <div>
                    <span className="text-foreground font-medium">已有仓位考虑减仓</span>
                    <p>若持有该股且已盈利 → 冲高减仓锁定利润；若已亏损 → 反弹减仓止损</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 p-1.5 rounded border border-red-500/10">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-600 border border-amber-500/25 shrink-0">3</span>
                  <div>
                    <span className="text-foreground font-medium">等待10:00后确认方向</span>
                    <p>10:00前不操作。10:00后观察：若企稳放量反弹且大盘配合，方可小仓位试探</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 p-1.5 rounded border border-red-500/10">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-bold bg-yellow-500/15 text-yellow-600 border border-yellow-500/25 shrink-0">4</span>
                  <div>
                    <span className="text-foreground font-medium">午后操作更安全</span>
                    <p>13:00后方向更明确。若大盘翻红+个股放量企稳 → 可按仓位表20%轻仓正T</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 评分等级 */}
            <div className="p-2 rounded-md border border-red-500/20 bg-red-500/5">
              <p className="text-red-600 dark:text-red-400 font-bold text-xs mb-1.5">📊 警告等级说明</p>
              <div className="grid grid-cols-1 gap-1.5">
                <div className="flex items-center gap-2 p-1.5 rounded border border-red-500/30 bg-red-600/10">
                  <span className="text-red-500 font-bold text-[10px] w-12 shrink-0">≥60分</span>
                  <span className="text-red-600 dark:text-red-400 font-bold text-xs">⚠️ 极危(一级警告)！早盘放量暴跌</span>
                  <span className="text-[10px] text-red-500/70 ml-auto shrink-0">空仓！全天禁止买入</span>
                </div>
                <div className="flex items-center gap-2 p-1.5 rounded border border-red-500/20 bg-red-500/8">
                  <span className="text-red-500 font-bold text-[10px] w-12 shrink-0">40-59分</span>
                  <span className="text-red-600 dark:text-red-400 font-bold text-xs">🚫 危险(二级警告)！早盘放量下跌</span>
                  <span className="text-[10px] text-red-500/70 ml-auto shrink-0">禁止买入，10点后再评估</span>
                </div>
                <div className="flex items-center gap-2 p-1.5 rounded border border-red-500/15 bg-red-500/5">
                  <span className="text-red-500 font-bold text-[10px] w-12 shrink-0">30-39分</span>
                  <span className="text-amber-600 dark:text-amber-400 font-bold text-xs">⚠ 早盘放量下跌(三级警告)</span>
                  <span className="text-[10px] text-amber-500/70 ml-auto shrink-0">谨慎，仓位减半</span>
                </div>
              </div>
            </div>

            <div className="p-1.5 rounded border-2 border-red-500/25 bg-red-500/8">
              <p className="text-red-600 dark:text-red-400 font-bold text-[10px]">⚠ 铁律：早盘放量下跌 = 禁止买入！宁可错过15%的V型反转，也不去承担70%的继续下跌风险。做T的第一原则是保住本金，不是抓住每一次机会。</p>
            </div>
          </div>
        </div>

        {/* ── 十、动态调节规矩 ── */}
        <div className="p-3 rounded-lg border border-orange-500/20 bg-orange-500/5">
          <div className="flex items-center gap-1.5 mb-2">
            <Activity className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-xs font-semibold text-orange-700 dark:text-orange-300">十、动态调节规矩（根据盘面实时调整）</span>
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
              <div className="flex items-start gap-2 p-1.5 rounded border border-amber-500/10">
                <span className="text-amber-500 text-xs shrink-0">📉</span>
                <div>
                  <span className="text-foreground font-medium">放量下跌 → 仓位降一级</span>
                  <p>抛压沉重时，所有仓位建议下调一个等级。如原30%→20%。</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-1.5 rounded border border-red-500/15 bg-red-500/5">
                <span className="text-red-500 text-xs shrink-0">🚫</span>
                <div>
                  <span className="text-red-600 dark:text-red-400 font-bold">早盘放量下跌触发 → 全天空仓</span>
                  <p>红色警告一旦触发，当日该股不做任何买入操作。即使午后反弹也不追，次日再评估。</p>
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
            <div className="p-2 rounded-md border-2 border-red-500/30 bg-red-500/8">
              <p className="text-red-600 dark:text-red-400 font-bold mb-1">场景5（早盘放量下跌·高危）：9:35放量下跌红色警告触发，跌幅1.5%，量比2.5x</p>
              <div className="space-y-0.5">
                <p>→ <span className="text-red-500 font-bold">🚫 禁止买入！空仓观望</span></p>
                <p>• 即使午后反弹到+0.5%，也不追入（典型走势B：弱反弹再破低）</p>
                <p>• 若已持有 → 任何反弹都是减仓机会</p>
                <p>• 13:00后若大盘翻红+个股放量企稳 → 方可20%轻仓试探</p>
                <p>• 正确做法：全天不做该股，等待次日方向确认</p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>}
    </Card>
  );
}
