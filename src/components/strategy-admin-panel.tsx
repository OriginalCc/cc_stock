"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import {
  Settings,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Save,
  Database,
  Cpu,
  Zap,
  Eye,
  EyeOff,
  GitBranch,
  Shield,
  X,
  Clock,
  Pencil,
  Trash2,
  Activity,
  Newspaper,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Star,
} from "lucide-react";

// ── Strategy Admin Panel ───────────────────────────────

interface StrategyData {
  version: string;
  name: string;
  basedOn?: string;
  description: string;
  corePhilosophy?: string;
  basicPrinciples?: { id: number; name: string; desc: string }[];
  selectionCriteria?: {
    required: { name: string; desc: string }[];
    exclude: { name: string; reason: string }[];
  };
  indicators: Record<string, any>;
  timelineSignals: {
    name: string;
    description: string;
    rules: any[];
    postProcess: { name: string; description: string; rule: string };
    timeWindowFilter?: { name: string; description: string };
    spreadFloor?: { name: string; description: string; rules: { spread: string; action: string }[] };
  };
  timeWindows?: { period: string; feature: string; action: string; actionType: string }[];
  stopLossRules?: { scenario: string; rule: string }[];
  marketRegimes?: { regime: string; suitability: string; strategy: string; expectedReturn: string }[];
  positionManagement?: {
    basePosition: { label: string; range: string; rule: string };
    tPosition: { label: string; range: string; rule: string };
    singleTQuantity: { basePosition: string; tQuantity: string; note: string }[];
    dailyLimit: { maxCount: number; rule: string };
  };
  klineSignals: { name: string; description: string; rules: any[] };
  dataSources: Record<string, any>;
  logicFlow: {
    name: string;
    steps: { step: number; name: string; description: string }[];
    decisionTree: { question: string; yes: string; no: string }[];
  };
  riskControl: {
    name: string;
    rules: { key: string; label: string; description: string; value?: any; unit?: string; values?: string[] }[];
  };
  dbFactors: any[];
  dbLogicSteps: any[];
}

// ── Custom Factors Tab Component ──────────────────────────

interface CustomFactorCondition {
  key: string;          // 条件标识
  label: string;        // 条件名称
  description: string;  // 条件描述
  category: "price" | "volume" | "indicator" | "trend" | "time" | "pattern";  // 分类
}

interface CustomFactorDefinition {
  id: string;
  name: string;
  description: string;
  signalType: "buy" | "sell";
  tMode: "正T" | "反T";
  strength: "strong" | "medium" | "weak";
  conditions: CustomFactorCondition[];
  enabled: boolean;
  isBuiltIn: boolean;   // 是否内置因子
  dataSource: "分时线";  // 数据来源
}

// 预定义条件库（用户可组合）
const CONDITION_LIBRARY: CustomFactorCondition[] = [
  // ── 价格形态 ──
  { key: "pulse_drop", label: "脉冲下跌", description: "短时间内价格快速下跌超过1%，形成脉冲低点", category: "price" },
  { key: "pulse_rise", label: "脉冲拉升", description: "短时间内价格快速上涨超过1%，形成脉冲高点", category: "price" },
  { key: "price_above_vwap", label: "价格在均线上方", description: "当前价格高于VWAP均价线", category: "price" },
  { key: "price_below_vwap", label: "价格在均线下方", description: "当前价格低于VWAP均价线", category: "price" },
  { key: "vwap_cross_up", label: "上穿均线", description: "价格从均线下方突破到上方", category: "price" },
  { key: "vwap_cross_down", label: "下穿均线", description: "价格从均线上方跌破到下方", category: "price" },
  { key: "new_high", label: "创日内新高", description: "当前价格突破今日全部成交的最高价", category: "price" },
  { key: "new_low", label: "创日内新低", description: "当前价格跌破今日全部成交的最低价", category: "price" },
  { key: "bounce_from_low", label: "低位反弹", description: "从日内低点反弹超过1%，多方发力", category: "price" },
  { key: "pullback_from_high", label: "高位回落", description: "从日内高点回落超过1%，空方施压", category: "price" },
  { key: "three_black_crows", label: "三连阴", description: "连续3根分钟线收跌，短期空头加速", category: "price" },
  { key: "three_white_soldiers", label: "三连阳", description: "连续3根分钟线收涨，短期多头加速", category: "price" },
  { key: "five_bar_drop", label: "五连阴", description: "连续5根分钟线收跌，空头强势加速", category: "price" },
  { key: "five_bar_rise", label: "五连阳", description: "连续5根分钟线收涨，多头强势加速", category: "price" },
  { key: "double_bottom", label: "双底形态", description: "价格在相近位置形成两个低点，支撑确认", category: "price" },
  { key: "prev_close_support", label: "昨收价支撑", description: "价格回到昨收盘价附近企稳（±0.3%）", category: "price" },
  { key: "prev_close_resistance", label: "昨收价压力", description: "价格从下方接近昨收价受阻回落", category: "price" },
  { key: "late_drop", label: "尾盘急跌", description: "14:00后价格快速下跌，可能次日反弹", category: "price" },
  { key: "late_rally", label: "尾盘拉升", description: "14:00后价格快速上涨，可能次日回调", category: "price" },
  { key: "vwap_touch_below", label: "触及均线回落", description: "价格从下方触及VWAP后未能突破回落", category: "price" },
  { key: "vwap_touch_above", label: "触及均线反弹", description: "价格从上方触及VWAP后获得支撑反弹", category: "price" },
  { key: "price_gap_up", label: "向上跳空", description: "当前分钟价格跳高0.5%以上且放量", category: "price" },
  { key: "price_gap_down", label: "向下跳空", description: "当前分钟价格跳低0.5%以上且放量", category: "price" },
  { key: "price_acceleration_up", label: "加速上涨", description: "每分钟涨幅递增，多头动能加强", category: "price" },
  { key: "price_acceleration_down", label: "加速下跌", description: "每分钟跌幅递增，空头动能加强", category: "price" },
  { key: "range_breakout_up", label: "区间向上突破", description: "价格突破近20分钟价格区间上沿且放量", category: "price" },
  { key: "range_breakout_down", label: "区间向下突破", description: "价格跌破近20分钟价格区间下沿且放量", category: "price" },

  // ── 量能特征 ──
  { key: "vol_shrink", label: "量能萎缩", description: "成交量显著缩小至均量的50%以下，抛压/买压衰竭", category: "volume" },
  { key: "vol_expand", label: "放量", description: "成交量显著放大至均量的2倍以上，资金活跃", category: "volume" },
  { key: "vol_sudden_spike", label: "突放巨量", description: "成交量瞬间放大至均量5倍以上，异动明显", category: "volume" },
  { key: "vol_dry_up", label: "地量", description: "成交量降至均量20%以下，交投极度清淡", category: "volume" },
  { key: "vol_climax", label: "天量", description: "成交量创日内新高，多空激烈交锋", category: "volume" },
  { key: "volume_price_divergence", label: "量价背离", description: "价格创新高但量缩/价格创新低但量缩", category: "volume" },
  { key: "vol_increasing", label: "量能递增", description: "连续3分钟成交量逐步放大，动能增强", category: "volume" },
  { key: "vol_decreasing", label: "量能递减", description: "连续3分钟成交量逐步缩小，动能衰减", category: "volume" },
  { key: "vol_climax_shrink", label: "天量后缩量", description: "刚出现天量后立刻缩量，脉冲可能结束", category: "volume" },
  { key: "vol_gradual_increase", label: "温和放量", description: "连续5分钟成交量温和递增（1-1.5倍），健康放量", category: "volume" },
  { key: "vol_price_up_sync", label: "量价齐升", description: "价格上涨+量能放大，多头健康上涨", category: "volume" },
  { key: "vol_price_down_sync", label: "量价齐跌", description: "价格下跌+量能放大，空头强势下跌", category: "volume" },

  // ── 技术指标 ──
  { key: "vwap_deviation_high", label: "偏离均价过高", description: "价格偏离VWAP超过2%，存在回归压力", category: "indicator" },
  { key: "vwap_deviation_low", label: "偏离均价过低", description: "价格偏离VWAP超过-2%，存在反弹可能", category: "indicator" },
  { key: "rsi_oversold", label: "RSI超卖", description: "RSI指标低于30，短期超卖", category: "indicator" },
  { key: "rsi_overbought", label: "RSI超买", description: "RSI指标高于70，短期超买", category: "indicator" },
  { key: "rsi_mid_range", label: "RSI中性区间", description: "RSI在40-60之间，多空均衡，等待方向选择", category: "indicator" },
  { key: "rsi_rebound", label: "RSI超卖回升", description: "RSI从超卖区（<30）回升到30以上，反转信号", category: "indicator" },
  { key: "rsi_pullback", label: "RSI超买回落", description: "RSI从超买区（>70）回落到70以下，反转信号", category: "indicator" },
  { key: "boll_lower", label: "触及布林下轨", description: "价格触及布林带下轨，超卖信号", category: "indicator" },
  { key: "boll_upper", label: "触及布林上轨", description: "价格触及布林带上轨，超买信号", category: "indicator" },
  { key: "boll_squeeze", label: "布林带收窄", description: "布林带宽度收窄至2%以内，波动率降低，即将变盘", category: "indicator" },
  { key: "boll_middle_support", label: "布林中轨支撑", description: "价格回落到布林中轨附近获得支撑", category: "indicator" },
  { key: "macd_golden", label: "MACD金叉", description: "DIF上穿DEA，短期多头信号", category: "indicator" },
  { key: "macd_dead", label: "MACD死叉", description: "DIF下穿DEA，短期空头信号", category: "indicator" },
  { key: "macd_above_zero", label: "MACD零轴上方", description: "DIF和DEA均在零轴上方，多头市场", category: "indicator" },
  { key: "macd_below_zero", label: "MACD零轴下方", description: "DIF和DEA均在零轴下方，空头市场", category: "indicator" },
  { key: "macd_histogram_shrink", label: "MACD柱缩短", description: "MACD红绿柱长度缩短，动能衰减，可能变盘", category: "indicator" },
  { key: "macd_golden_zero", label: "MACD零轴金叉", description: "零轴附近金叉，更强势的多头信号", category: "indicator" },

  // ── 趋势判断 ──
  { key: "vwap_flat", label: "均线走平", description: "VWAP均价线斜率趋近于零，方向不明朗", category: "trend" },
  { key: "vwap_up", label: "均线上行", description: "VWAP均价线斜率为正，趋势向上", category: "trend" },
  { key: "vwap_down", label: "均线下行", description: "VWAP均价线斜率为负，趋势向下", category: "trend" },
  { key: "trend_reversal_up", label: "趋势反转向上", description: "下跌趋势后VWAP拐头向上，可能转多", category: "trend" },
  { key: "trend_reversal_down", label: "趋势反转向下", description: "上涨趋势后VWAP拐头向下，可能转空", category: "trend" },
  { key: "consolidation", label: "缩量横盘", description: "价格窄幅盘整+成交量萎缩，等待方向突破", category: "trend" },
  { key: "ma5_cross_up", label: "上穿5分钟均线", description: "价格上穿近5分钟均价线，短线转多", category: "trend" },
  { key: "ma5_cross_down", label: "下穿5分钟均线", description: "价格下穿近5分钟均价线，短线转空", category: "trend" },
  { key: "higher_low", label: "底部抬高", description: "近20分钟内低点逐步抬高，多头格局", category: "trend" },
  { key: "lower_high", label: "顶部降低", description: "近20分钟内高点逐步降低，空头格局", category: "trend" },

  // ── 时间窗口 ──
  { key: "first_15min", label: "开盘15分钟", description: "9:30-9:45，波动最剧烈，方向不明慎入", category: "time" },
  { key: "first_30min", label: "开盘30分钟", description: "9:30-10:00，开盘博弈剧烈，方向初现", category: "time" },
  { key: "morning_peak", label: "早盘高峰", description: "10:00-11:00，早盘主要交易时段", category: "time" },
  { key: "mid_day", label: "盘中平稳期", description: "10:30-11:20及13:30-14:00，走势相对平稳", category: "time" },
  { key: "pre_lunch", label: "午前尾段", description: "11:00-11:30，午前平仓/建仓时段", category: "time" },
  { key: "lunch_gap", label: "午后首5分钟", description: "13:00-13:05，午间方向确认关键期", category: "time" },
  { key: "afternoon_open", label: "午后开盘", description: "13:00-13:30，午后方向确认时段", category: "time" },
  { key: "afternoon_peak", label: "午后高峰", description: "13:30-14:30，午后主要交易时段", category: "time" },
  { key: "late_session", label: "尾盘时段", description: "14:30-15:00，尾盘资金博弈最激烈", category: "time" },
  { key: "last_15min", label: "收盘前15分钟", description: "14:45-15:00，尾盘异动高发期", category: "time" },

  // ── 综合形态 ──
  { key: "v_shape_bottom", label: "V型反转", description: "急跌后快速反弹，形成V型底部，强反转信号", category: "pattern" },
  { key: "inverted_v_top", label: "倒V型反转", description: "急涨后快速回落，形成倒V型顶部，强反转信号", category: "pattern" },
  { key: "strong_open", label: "强势开盘", description: "开盘15分钟均价高于昨收0.5%以上，做多意愿强烈", category: "pattern" },
  { key: "weak_open", label: "弱势开盘", description: "开盘15分钟均价低于昨收0.3%以上，卖压明显", category: "pattern" },
  { key: "late_rally", label: "尾盘拉升", description: "14:30后价格上涨超过1%，尾盘资金抢筹", category: "pattern" },
  { key: "late_drop", label: "尾盘急跌", description: "14:30后价格下跌超过1%，尾盘资金出逃", category: "pattern" },
  { key: "limit_up_lock", label: "封板锁定", description: "涨幅接近涨停且封板强度高，资金一致性看多", category: "pattern" },
  { key: "consecutive_up", label: "连续上涨", description: "连续多日收阳，短期多头趋势明确", category: "pattern" },
  { key: "large_order_dominant", label: "大单主导", description: "大单净流入占比高，机构资金积极介入", category: "pattern" },
  { key: "vwap_deviation_high", label: "偏离均价过高", description: "价格偏离VWAP均价超过2%，短线超买需注意回调", category: "pattern" },
  { key: "vwap_deviation_low", label: "偏离均价过低", description: "价格偏离VWAP均价超过-2%，短线超卖或有反弹机会", category: "pattern" },
  { key: "vwap_near", label: "紧贴均价", description: "价格紧贴VWAP均价运行(偏离<0.5%)，方向待选择", category: "pattern" },
  { key: "opening_gap_up", label: "跳空高开", description: "开盘价高于昨收1%以上，多头强势信号", category: "pattern" },
  { key: "opening_gap_down", label: "跳空低开", description: "开盘价低于昨收1%以上，空头强势信号", category: "pattern" },
];

// 内置自定义因子
const BUILT_IN_CUSTOM_FACTORS: CustomFactorDefinition[] = [
  {
    id: "factor_31",
    name: "脉冲缩量企稳",
    description: "脉冲下跌后卖出量能萎缩+VWAP走平 → 强买回信号。现象：股价脉冲下跌，经过一段走势后卖出量能萎缩，均线走平，视为强烈的买入信号。",
    signalType: "buy",
    tMode: "正T",
    strength: "strong",
    conditions: [
      { key: "pulse_drop", label: "脉冲下跌", description: "短时间内价格快速下跌超过1%", category: "price" },
      { key: "vol_shrink", label: "量能萎缩", description: "成交量缩小至均量的50%以下", category: "volume" },
      { key: "vwap_flat", label: "均线走平", description: "VWAP均价线斜率趋近于零", category: "trend" },
    ],
    enabled: true,
    isBuiltIn: true,
    dataSource: "分时线",
  },
  {
    id: "factor_32",
    name: "脉冲拉升缩量滞涨",
    description: "脉冲拉升后买入量能萎缩+VWAP走平 → 强卖出信号。现象：股价脉冲拉升，经过一段走势后买入量能萎缩，均线走平，视为强烈的卖出信号。",
    signalType: "sell",
    tMode: "正T",
    strength: "strong",
    conditions: [
      { key: "pulse_rise", label: "脉冲拉升", description: "短时间内价格快速上涨超过1%", category: "price" },
      { key: "vol_shrink", label: "量能萎缩", description: "成交量缩小至均量的50%以下", category: "volume" },
      { key: "vwap_flat", label: "均线走平", description: "VWAP均价线斜率趋近于零", category: "trend" },
    ],
    enabled: true,
    isBuiltIn: true,
    dataSource: "分时线",
  },
  {
    id: "factor_33",
    name: "缩量横盘突破",
    description: "缩量窄幅盘整后价格向上突破 → 强买信号。现象：股价窄幅横盘整理，成交量持续萎缩，突然放量突破盘整区间上沿。",
    signalType: "buy",
    tMode: "反T",
    strength: "strong",
    conditions: [
      { key: "consolidation", label: "缩量横盘", description: "价格窄幅盘整+成交量萎缩", category: "trend" },
      { key: "vol_expand", label: "放量", description: "成交量显著放大", category: "volume" },
      { key: "vwap_cross_up", label: "上穿均线", description: "价格从均线下方突破到上方", category: "price" },
    ],
    enabled: true,
    isBuiltIn: true,
    dataSource: "分时线",
  },
  {
    id: "factor_34",
    name: "放量突破均线",
    description: "成交量放大+价格从均线下方突破到上方 → 强买信号。现象：股价在均线下方运行一段时间后，伴随成交量放大突破均线。",
    signalType: "buy",
    tMode: "反T",
    strength: "strong",
    conditions: [
      { key: "price_below_vwap", label: "价格在均线下方", description: "当前价格低于VWAP均价线", category: "price" },
      { key: "vol_expand", label: "放量", description: "成交量显著放大", category: "volume" },
      { key: "vwap_cross_up", label: "上穿均线", description: "价格从均线下方突破到上方", category: "price" },
    ],
    enabled: true,
    isBuiltIn: true,
    dataSource: "分时线",
  },
];

const CUSTOM_FACTORS_STORAGE_KEY = "customFactors_v1";

function CustomFactorsTab() {
  // Initialize with defaults to avoid hydration mismatch (localStorage read after mount)
  const [customFactors, setCustomFactors] = useState<CustomFactorDefinition[]>(BUILT_IN_CUSTOM_FACTORS);
  // Read from localStorage after mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CUSTOM_FACTORS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as CustomFactorDefinition[];
        const builtInIds = BUILT_IN_CUSTOM_FACTORS.map(f => f.id);
        const userFactors = parsed.filter(f => !builtInIds.includes(f.id));
        const mergedBuiltIn = BUILT_IN_CUSTOM_FACTORS.map(bf => {
          const savedBf = parsed.find(f => f.id === bf.id);
          if (savedBf) return { ...bf, enabled: savedBf.enabled };
          return bf;
        });
        // Use microtask to avoid lint warning about setState in effect
        queueMicrotask(() => setCustomFactors([...mergedBuiltIn, ...userFactors]));
      }
    } catch {}
  }, []);

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingFactorId, setEditingFactorId] = useState<string | null>(null);
  const [newFactorName, setNewFactorName] = useState("");
  const [newFactorDesc, setNewFactorDesc] = useState("");
  const [newFactorSignal, setNewFactorSignal] = useState<"buy" | "sell">("buy");
  const [newFactorTMode, setNewFactorTMode] = useState<"正T" | "反T">("正T");
  const [newFactorStrength, setNewFactorStrength] = useState<"strong" | "medium" | "weak">("strong");
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [expandedFactorId, setExpandedFactorId] = useState<string | null>(null);
  const [conditionFilter, setConditionFilter] = useState<string>("all");

  // 保存到 localStorage
  useEffect(() => {
    try {
      localStorage.setItem(CUSTOM_FACTORS_STORAGE_KEY, JSON.stringify(customFactors));
      window.dispatchEvent(new CustomEvent('custom-factors-changed'));
    } catch {}
  }, [customFactors]);

  const toggleFactor = (id: string) => {
    setCustomFactors(prev => prev.map(f => f.id === id ? { ...f, enabled: !f.enabled } : f));
  };

  const deleteFactor = (id: string) => {
    const factor = customFactors.find(f => f.id === id);
    if (factor?.isBuiltIn) return;
    setCustomFactors(prev => prev.filter(f => f.id !== id));
  };

  const startEditFactor = (id: string) => {
    const factor = customFactors.find(f => f.id === id);
    if (!factor || factor.isBuiltIn) return;
    setEditingFactorId(id);
    setNewFactorName(factor.name);
    setNewFactorDesc(factor.description);
    setNewFactorSignal(factor.signalType);
    setNewFactorTMode(factor.tMode);
    setNewFactorStrength(factor.strength);
    setSelectedConditions(factor.conditions.map(c => c.key));
    setShowAddForm(true);
    setExpandedFactorId(null);
  };

  const resetForm = () => {
    setNewFactorName("");
    setNewFactorDesc("");
    setNewFactorSignal("buy");
    setNewFactorTMode("正T");
    setNewFactorStrength("strong");
    setSelectedConditions([]);
    setShowAddForm(false);
    setEditingFactorId(null);
    setConditionFilter("all");
  };

  const addFactor = () => {
    if (!newFactorName.trim() || selectedConditions.length === 0) return;
    const conditions = selectedConditions.map(key => CONDITION_LIBRARY.find(c => c.key === key)!).filter(Boolean);

    if (editingFactorId) {
      // 编辑模式：更新现有因子
      setCustomFactors(prev => prev.map(f => f.id === editingFactorId ? {
        ...f,
        name: newFactorName.trim(),
        description: newFactorDesc.trim() || `自定义因子：${newFactorName}`,
        signalType: newFactorSignal,
        tMode: newFactorTMode,
        strength: newFactorStrength,
        conditions,
      } : f));
    } else {
      // 新增模式
      const newFactor: CustomFactorDefinition = {
        id: `factor_custom_${Date.now()}`,
        name: newFactorName.trim(),
        description: newFactorDesc.trim() || `自定义因子：${newFactorName}`,
        signalType: newFactorSignal,
        tMode: newFactorTMode,
        strength: newFactorStrength,
        conditions,
        enabled: true,
        isBuiltIn: false,
        dataSource: "分时线",
      };
      setCustomFactors(prev => [...prev, newFactor]);
    }
    resetForm();
  };

  const toggleCondition = (key: string) => {
    setSelectedConditions(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const categoryLabels: Record<string, string> = {
    price: "价格形态",
    volume: "量能特征",
    indicator: "技术指标",
    trend: "趋势判断",
    time: "时间窗口",
    pattern: "综合形态",
  };
  const categoryColors: Record<string, string> = {
    price: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    volume: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    indicator: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
    trend: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    time: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    pattern: "bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300",
  };

  const filteredConditions = conditionFilter === "all"
    ? CONDITION_LIBRARY
    : CONDITION_LIBRARY.filter(c => c.category === conditionFilter);

  const enabledCount = customFactors.filter(f => f.enabled).length;
  const builtInFactors = customFactors.filter(f => f.isBuiltIn);
  const userFactors = customFactors.filter(f => !f.isBuiltIn);

  return (
    <div className="space-y-4">
      {/* 标题区域 */}
      <div className="p-4 rounded-lg border border-border bg-gradient-to-r from-violet-50 to-fuchsia-50 dark:from-violet-950/30 dark:to-fuchsia-950/30">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="h-4 w-4 text-violet-500" />
          <span className="text-sm font-bold">自定义因子 — 分时线策略组合器</span>
          <Badge variant="outline" className="text-[10px] h-5 bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300">
            v3.8
          </Badge>
          <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">
            已启用 {enabledCount}/{customFactors.length}
          </Badge>
        </div>
        <div className="text-xs text-foreground/80">
          自定义因子是基于<span className="font-bold text-violet-600 dark:text-violet-400">分时线（日内1分钟数据）</span>的策略组合。
          您可以将多个条件（价格形态、量能特征、技术指标、趋势判断）自由组合，创建属于自己的交易信号因子。
          每个因子的所有条件必须同时满足才会触发信号，<strong className="text-emerald-600 dark:text-emerald-400">信号会实时显示在分时图上</strong>。
        </div>
      </div>

      {/* 数据源提示 */}
      <div className="p-2.5 rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20 flex items-start gap-2">
        <Activity className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
        <div className="text-[10px] text-amber-700 dark:text-amber-400 leading-relaxed">
          <span className="font-bold">重要提示：</span>
          自定义因子作用于<span className="font-bold">分时线数据</span>（日内每分钟的价格和成交量），而非K线数据。
          分时线能够捕捉更细腻的日内脉冲、缩量、均线走平等微观特征，是做T操作的核心数据源。
          因子信号将显示在分时图上，帮助您精准把握日内高低点。
        </div>
      </div>

      {/* 内置自定义因子 */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">内置自定义因子</span>
          <Badge variant="outline" className="text-[9px] h-4 px-1.5">{builtInFactors.length}个</Badge>
        </div>
        <div className="space-y-2">
          {builtInFactors.map(factor => (
            <div key={factor.id} className="rounded-lg border border-border overflow-hidden">
              {/* 因子标题行 */}
              <div
                className="flex items-center gap-2 p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setExpandedFactorId(expandedFactorId === factor.id ? null : factor.id)}
              >
                {/* 启用开关 */}
                <button
                  className={`shrink-0 w-8 h-4.5 rounded-full transition-colors relative ${factor.enabled ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"}`}
                  onClick={(e) => { e.stopPropagation(); toggleFactor(factor.id); }}
                >
                  <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform ${factor.enabled ? "left-4" : "left-0.5"}`} />
                </button>

                {/* 信号类型图标 */}
                <div className={`shrink-0 w-5 h-5 rounded flex items-center justify-center ${factor.signalType === "buy" ? "bg-red-100 dark:bg-red-950/50" : "bg-green-100 dark:bg-green-950/50"}`}>
                  {factor.signalType === "buy" ? (
                    <ArrowUpRight className="h-3 w-3 text-red-500" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3 text-green-500" />
                  )}
                </div>

                {/* 因子名称和标签 */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold">{factor.name}</span>
                    <Badge className={`text-[9px] h-4 px-1 ${factor.strength === "strong" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : factor.strength === "medium" ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}`}>
                      {factor.strength === "strong" ? "强" : factor.strength === "medium" ? "中" : "弱"}
                    </Badge>
                    <Badge variant="outline" className="text-[9px] h-4 px-1">{factor.tMode}</Badge>
                    <Badge variant="outline" className="text-[9px] h-4 px-1 bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
                      {factor.dataSource}
                    </Badge>
                    {factor.enabled && (
                      <Badge className="text-[8px] h-4 px-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 animate-pulse">
                        ● 检测中
                      </Badge>
                    )}
                  </div>
                </div>

                {/* 条件数和展开箭头 */}
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[9px] h-4 px-1">{factor.conditions.length}条件</Badge>
                  {expandedFactorId === factor.id ? (
                    <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>
              </div>

              {/* 展开详情 */}
              {expandedFactorId === factor.id && (
                <div className="px-3 pb-3 pt-0 space-y-2 border-t border-border">
                  <div className="text-[10px] text-muted-foreground mt-2">{factor.description}</div>
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-medium text-foreground/80">条件组合（全部满足才触发）：</div>
                    {factor.conditions.map((cond, ci) => (
                      <div key={ci} className="flex items-start gap-2 p-2 rounded bg-muted/30">
                        <span className={`shrink-0 text-[8px] font-bold px-1.5 py-0.5 rounded ${categoryColors[cond.category]}`}>
                          {categoryLabels[cond.category]}
                        </span>
                        <div className="min-w-0">
                          <div className="text-[10px] font-medium">{cond.label}</div>
                          <div className="text-[9px] text-muted-foreground">{cond.description}</div>
                        </div>
                        {ci < factor.conditions.length - 1 && (
                          <span className="shrink-0 text-[8px] text-muted-foreground self-center ml-auto">AND</span>
                        )}
                      </div>
                    ))}
                  </div>
                  {/* 信号输出 */}
                  <div className="p-2 rounded bg-muted/50 flex items-center gap-2">
                    <span className="text-[9px] text-muted-foreground">触发信号：</span>
                    <Badge variant={factor.signalType === "buy" ? "default" : "destructive"} className="text-[9px] h-4">
                      {factor.signalType === "buy" ? "买入" : "卖出"}
                    </Badge>
                    <Badge className={`text-[9px] h-4 ${factor.strength === "strong" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : factor.strength === "medium" ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}`}>
                      {factor.strength === "strong" ? "强信号" : factor.strength === "medium" ? "中信号" : "弱信号"}
                    </Badge>
                    <Badge variant="outline" className="text-[9px] h-4">{factor.tMode}</Badge>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 用户自定义因子 */}
      {userFactors.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Star className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs font-medium">我的自定义因子</span>
            <Badge variant="outline" className="text-[9px] h-4 px-1.5">{userFactors.length}个</Badge>
          </div>
          <div className="space-y-2">
            {userFactors.map(factor => (
              <div key={factor.id} className="rounded-lg border border-border overflow-hidden">
                {/* 因子标题行 */}
                <div
                  className="flex items-center gap-2 p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedFactorId(expandedFactorId === factor.id ? null : factor.id)}
                >
                  <button
                    className={`shrink-0 w-8 h-4.5 rounded-full transition-colors relative ${factor.enabled ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"}`}
                    onClick={(e) => { e.stopPropagation(); toggleFactor(factor.id); }}
                  >
                    <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform ${factor.enabled ? "left-4" : "left-0.5"}`} />
                  </button>
                  <div className={`shrink-0 w-5 h-5 rounded flex items-center justify-center ${factor.signalType === "buy" ? "bg-red-100 dark:bg-red-950/50" : "bg-green-100 dark:bg-green-950/50"}`}>
                    {factor.signalType === "buy" ? (
                      <ArrowUpRight className="h-3 w-3 text-red-500" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3 text-green-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold">{factor.name}</span>
                      <Badge className={`text-[9px] h-4 px-1 ${factor.strength === "strong" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : factor.strength === "medium" ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}`}>
                        {factor.strength === "strong" ? "强" : factor.strength === "medium" ? "中" : "弱"}
                      </Badge>
                      <Badge variant="outline" className="text-[9px] h-4 px-1">{factor.tMode}</Badge>
                      {factor.enabled && (
                        <Badge className="text-[8px] h-4 px-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 animate-pulse">
                          ● 检测中
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[9px] h-4 px-1">{factor.conditions.length}条件</Badge>
                    <button
                      className="shrink-0 h-5 w-5 rounded flex items-center justify-center hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors"
                      onClick={(e) => { e.stopPropagation(); startEditFactor(factor.id); }}
                    >
                      <Pencil className="h-3 w-3 text-blue-500" />
                    </button>
                    <button
                      className="shrink-0 h-5 w-5 rounded flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors"
                      onClick={(e) => { e.stopPropagation(); deleteFactor(factor.id); }}
                    >
                      <Trash2 className="h-3 w-3 text-red-500" />
                    </button>
                    {expandedFactorId === factor.id ? (
                      <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                </div>
                {expandedFactorId === factor.id && (
                  <div className="px-3 pb-3 pt-0 space-y-2 border-t border-border">
                    <div className="text-[10px] text-muted-foreground mt-2">{factor.description}</div>
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-medium text-foreground/80">条件组合（全部满足才触发）：</div>
                      {factor.conditions.map((cond, ci) => (
                        <div key={ci} className="flex items-start gap-2 p-2 rounded bg-muted/30">
                          <span className={`shrink-0 text-[8px] font-bold px-1.5 py-0.5 rounded ${categoryColors[cond.category]}`}>
                            {categoryLabels[cond.category]}
                          </span>
                          <div className="min-w-0">
                            <div className="text-[10px] font-medium">{cond.label}</div>
                            <div className="text-[9px] text-muted-foreground">{cond.description}</div>
                          </div>
                          {ci < factor.conditions.length - 1 && (
                            <span className="shrink-0 text-[8px] text-muted-foreground self-center ml-auto">AND</span>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="p-2 rounded bg-muted/50 flex items-center gap-2">
                      <span className="text-[9px] text-muted-foreground">触发信号：</span>
                      <Badge variant={factor.signalType === "buy" ? "default" : "destructive"} className="text-[9px] h-4">
                        {factor.signalType === "buy" ? "买入" : "卖出"}
                      </Badge>
                      <Badge className={`text-[9px] h-4 ${factor.strength === "strong" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : factor.strength === "medium" ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}`}>
                        {factor.strength === "strong" ? "强信号" : factor.strength === "medium" ? "中信号" : "弱信号"}
                      </Badge>
                      <Badge variant="outline" className="text-[9px] h-4">{factor.tMode}</Badge>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 添加新因子按钮 */}
      {!showAddForm && (
        <button
          className="w-full p-3 rounded-lg border-2 border-dashed border-border hover:border-violet-300 hover:bg-violet-50/30 dark:hover:border-violet-700 dark:hover:bg-violet-950/10 transition-colors flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-violet-600 dark:hover:text-violet-400"
          onClick={() => setShowAddForm(true)}
        >
          <Plus className="h-4 w-4" />
          <span className="font-medium">新增自定义因子</span>
        </button>
      )}

      {/* 添加/编辑因子表单 */}
      {showAddForm && (
        <div className={`rounded-lg border p-4 space-y-3 ${editingFactorId ? "border-blue-200 bg-blue-50/30 dark:border-blue-900/40 dark:bg-blue-950/10" : "border-violet-200 bg-violet-50/30 dark:border-violet-900/40 dark:bg-violet-950/10"}`}>
          <div className="flex items-center gap-2">
            {editingFactorId ? (
              <>
                <Pencil className="h-4 w-4 text-blue-500" />
                <span className="text-xs font-bold">编辑自定义因子</span>
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 text-violet-500" />
                <span className="text-xs font-bold">新增自定义因子</span>
              </>
            )}
            <Badge variant="outline" className={`text-[9px] h-4 px-1.5 ml-auto ${editingFactorId ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" : "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300"}`}>
              分时线
            </Badge>
          </div>

          {/* 因子名称 */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground mb-1 block">因子名称 *</label>
            <Input
              value={newFactorName}
              onChange={(e) => setNewFactorName(e.target.value)}
              placeholder="例如：脉冲缩量企稳、双底反弹..."
              className="h-8 text-xs"
            />
          </div>

          {/* 因子描述 */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground mb-1 block">因子描述</label>
            <Textarea
              value={newFactorDesc}
              onChange={(e) => setNewFactorDesc(e.target.value)}
              placeholder="描述此因子的触发逻辑和使用场景..."
              className="h-16 text-xs resize-none"
            />
          </div>

          {/* 信号配置 */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground mb-1 block">信号方向</label>
              <div className="flex gap-1">
                <button
                  className={`flex-1 h-7 rounded text-[10px] font-medium transition-colors ${newFactorSignal === "buy" ? "bg-red-100 text-red-700 border border-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-800" : "bg-muted/50 text-muted-foreground border border-border"}`}
                  onClick={() => setNewFactorSignal("buy")}
                >
                  买入
                </button>
                <button
                  className={`flex-1 h-7 rounded text-[10px] font-medium transition-colors ${newFactorSignal === "sell" ? "bg-green-100 text-green-700 border border-green-300 dark:bg-green-950 dark:text-green-300 dark:border-green-800" : "bg-muted/50 text-muted-foreground border border-border"}`}
                  onClick={() => setNewFactorSignal("sell")}
                >
                  卖出
                </button>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground mb-1 block">做T模式</label>
              <div className="flex gap-1">
                <button
                  className={`flex-1 h-7 rounded text-[10px] font-medium transition-colors ${newFactorTMode === "正T" ? "bg-blue-100 text-blue-700 border border-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800" : "bg-muted/50 text-muted-foreground border border-border"}`}
                  onClick={() => setNewFactorTMode("正T")}
                >
                  正T
                </button>
                <button
                  className={`flex-1 h-7 rounded text-[10px] font-medium transition-colors ${newFactorTMode === "反T" ? "bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800" : "bg-muted/50 text-muted-foreground border border-border"}`}
                  onClick={() => setNewFactorTMode("反T")}
                >
                  反T
                </button>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground mb-1 block">信号强度</label>
              <div className="flex gap-1">
                {(["strong", "medium", "weak"] as const).map(s => (
                  <button
                    key={s}
                    className={`flex-1 h-7 rounded text-[10px] font-medium transition-colors ${newFactorStrength === s ? (s === "strong" ? "bg-red-100 text-red-700 border border-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-800" : s === "medium" ? "bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800" : "bg-gray-100 text-gray-700 border border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700") : "bg-muted/50 text-muted-foreground border border-border"}`}
                    onClick={() => setNewFactorStrength(s)}
                  >
                    {s === "strong" ? "强" : s === "medium" ? "中" : "弱"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 条件选择 */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-[10px] font-medium text-muted-foreground">选择条件 *（至少1个）</label>
              {selectedConditions.length > 0 && (
                <Badge variant="outline" className="text-[9px] h-4 px-1.5">已选 {selectedConditions.length}个</Badge>
              )}
            </div>
            {/* 条件分类筛选 */}
            <div className="flex gap-1 mb-2">
              {["all", "price", "volume", "indicator", "trend", "time", "pattern"].map(cat => (
                <button
                  key={cat}
                  className={`h-5 px-2 rounded text-[9px] font-medium transition-colors ${conditionFilter === cat ? "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" : "bg-muted/50 text-muted-foreground"}`}
                  onClick={() => setConditionFilter(cat)}
                >
                  {cat === "all" ? "全部" : categoryLabels[cat]}
                </button>
              ))}
            </div>
            {/* 条件网格 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto">
              {filteredConditions.map(cond => {
                const isSelected = selectedConditions.includes(cond.key);
                return (
                  <button
                    key={cond.key}
                    className={`p-1.5 rounded border text-left transition-colors ${isSelected ? "border-violet-300 bg-violet-50 dark:border-violet-700 dark:bg-violet-950/30" : "border-border bg-card hover:bg-muted/30"}`}
                    onClick={() => toggleCondition(cond.key)}
                  >
                    <div className="flex items-center gap-1">
                      <span className={`shrink-0 text-[7px] font-bold px-1 py-0.5 rounded ${categoryColors[cond.category]}`}>
                        {categoryLabels[cond.category]?.slice(0, 2)}
                      </span>
                      <span className={`text-[10px] font-medium ${isSelected ? "text-violet-700 dark:text-violet-300" : ""}`}>
                        {cond.label}
                      </span>
                      {isSelected && (
                        <span className="ml-auto text-violet-500 text-[10px]">✓</span>
                      )}
                    </div>
                    <div className="text-[8px] text-muted-foreground mt-0.5 line-clamp-2">{cond.description}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 已选条件预览 */}
          {selectedConditions.length > 0 && (
            <div className="p-2 rounded bg-muted/30 space-y-1.5">
              <div className="text-[10px] font-medium text-foreground/80">条件组合预览：</div>
              <div className="flex flex-wrap gap-1.5">
                {selectedConditions.map((key, i) => {
                  const cond = CONDITION_LIBRARY.find(c => c.key === key);
                  if (!cond) return null;
                  return (
                    <div key={key} className="flex items-center gap-1">
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${categoryColors[cond.category]}`}>
                        {cond.label}
                      </span>
                      {i < selectedConditions.length - 1 && (
                        <span className="text-[8px] text-muted-foreground font-bold">+</span>
                      )}
                    </div>
                  );
                })}
                <span className="text-[9px] text-muted-foreground">→</span>
                <Badge variant={newFactorSignal === "buy" ? "default" : "destructive"} className="text-[9px] h-4">
                  {newFactorSignal === "buy" ? "买入" : "卖出"}
                </Badge>
              </div>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={!newFactorName.trim() || selectedConditions.length === 0}
              onClick={addFactor}
            >
              <Save className="h-3 w-3 mr-1" />
              {editingFactorId ? "更新因子" : "保存因子"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={resetForm}
            >
              {editingFactorId ? "取消编辑" : "取消"}
            </Button>
          </div>
        </div>
      )}

      {/* 条件库参考 */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Database className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">分时线条件库参考</span>
          <Badge variant="outline" className="text-[9px] h-4 px-1.5">{CONDITION_LIBRARY.length}个条件</Badge>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(["price", "volume", "indicator", "trend", "time", "pattern"] as const).map(cat => (
            <div key={cat} className="rounded-lg border border-border p-2.5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${categoryColors[cat]}`}>
                  {categoryLabels[cat]}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {CONDITION_LIBRARY.filter(c => c.category === cat).length}个条件
                </span>
              </div>
              <div className="space-y-1">
                {CONDITION_LIBRARY.filter(c => c.category === cat).map(cond => (
                  <div key={cond.key} className="flex items-start gap-1.5 text-[9px]">
                    <span className="text-muted-foreground shrink-0">•</span>
                    <div>
                      <span className="font-medium">{cond.label}</span>
                      <span className="text-muted-foreground ml-1">{cond.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 底部提示 */}
      <div className="p-2.5 rounded-lg border border-border bg-muted/30 text-[10px] text-muted-foreground space-y-1">
        <div className="font-medium text-foreground/80">使用说明：</div>
        <ul className="space-y-0.5 list-disc list-inside">
          <li>自定义因子基于<strong>分时线</strong>（1分钟级别价格+成交量+VWAP均价线）数据检测</li>
          <li>每个因子的所有条件必须<strong>同时满足</strong>才会触发信号</li>
          <li>信号触发后会显示在分时图上，与其他策略信号合并展示</li>
          <li>内置因子（31-34）已集成到策略引擎中，启用/禁用即时生效</li>
          <li>用户新增的因子<strong className="text-emerald-600 dark:text-emerald-400">已支持自动检测</strong>，启用后会在分时图上实时显示信号</li>
          <li>建议：将高胜率的人工判断模式编码为自定义因子，逐步积累和优化</li>
        </ul>
      </div>
    </div>
  );
}

export function StrategyAdminPanel({ onFactorsChanged }: { onFactorsChanged?: (factors: any[]) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [strategyData, setStrategyData] = useState<StrategyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(false);
  const [editingFactorId, setEditingFactorId] = useState<string | null>(null);
  const [editingParamKey, setEditingParamKey] = useState<string | null>(null);
  const [editParamValue, setEditParamValue] = useState<string>("");

  const fetchStrategy = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stock/strategy");
      const data = await res.json();
      setStrategyData(data);
      // Notify parent of factor changes
      if (onFactorsChanged && data.dbFactors) {
        onFactorsChanged(data.dbFactors);
      }
    } catch (e) {
      console.error("Failed to fetch strategy data:", e);
    } finally {
      setLoading(false);
    }
  }, [onFactorsChanged]);

  useEffect(() => {
    if (isOpen && !strategyData) {
      fetchStrategy();
    }
  }, [isOpen, strategyData, fetchStrategy]);

  const handleInit = useCallback(async () => {
    setInitLoading(true);
    try {
      await fetch("/api/stock/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "init" }),
      });
      await fetchStrategy();
    } catch (e) {
      console.error("Failed to init strategy:", e);
    } finally {
      setInitLoading(false);
    }
  }, [fetchStrategy]);

  const handleToggleFactor = useCallback(async (id: string, enabled: boolean) => {
    try {
      await fetch("/api/stock/strategy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "factor", id, data: { enabled: !enabled } }),
      });
      if (strategyData) {
        const updatedFactors = strategyData.dbFactors.map((f: any) =>
          f.id === id ? { ...f, enabled: !enabled } : f
        );
        setStrategyData({
          ...strategyData,
          dbFactors: updatedFactors,
        });
        // Notify parent of factor changes
        if (onFactorsChanged) {
          onFactorsChanged(updatedFactors);
        }
      }
    } catch (e) {
      console.error("Failed to toggle factor:", e);
    }
  }, [strategyData, onFactorsChanged]);

  const handleDeleteFactor = useCallback(async (id: string) => {
    try {
      await fetch(`/api/stock/strategy?type=factor&id=${id}`, { method: "DELETE" });
      if (strategyData) {
        const updatedFactors = strategyData.dbFactors.filter((f: any) => f.id !== id);
        setStrategyData({
          ...strategyData,
          dbFactors: updatedFactors,
        });
        // Notify parent of factor changes
        if (onFactorsChanged) {
          onFactorsChanged(updatedFactors);
        }
      }
    } catch (e) {
      console.error("Failed to delete factor:", e);
    }
  }, [strategyData, onFactorsChanged]);

  // ── Update a single field of a DB factor ──
  const handleUpdateFactor = useCallback(async (id: string, field: string, value: any) => {
    try {
      await fetch("/api/stock/strategy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "factor", id, data: { [field]: value } }),
      });
      if (strategyData) {
        const updatedFactors = strategyData.dbFactors.map((f: any) =>
          f.id === id ? { ...f, [field]: value } : f
        );
        setStrategyData({ ...strategyData, dbFactors: updatedFactors });
        if (onFactorsChanged) onFactorsChanged(updatedFactors);
      }
    } catch (e) {
      console.error("Failed to update factor:", e);
    }
  }, [strategyData, onFactorsChanged]);

  // ── Update indicator param (saves to DB via a new config key) ──
  const handleUpdateIndicatorParam = useCallback(async (indicatorKey: string, paramKey: string, newValue: number) => {
    try {
      await fetch("/api/stock/strategy-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ indicatorKey, paramKey, value: newValue }),
      });
      // Update local state
      if (strategyData) {
        const newIndicators = { ...strategyData.indicators };
        if (newIndicators[indicatorKey]?.params) {
          newIndicators[indicatorKey] = {
            ...newIndicators[indicatorKey],
            params: newIndicators[indicatorKey].params.map((p: any) =>
              p.key === paramKey ? { ...p, value: newValue } : p
            ),
          };
        }
        setStrategyData({ ...strategyData, indicators: newIndicators });
      }
    } catch (e) {
      console.error("Failed to update indicator param:", e);
    }
  }, [strategyData]);

  const getCategoryColor = (category: string) => {
    switch (category.toUpperCase()) {
      case "MACD": return "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800";
      case "VWAP": return "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800";
      case "VOLUME": return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800";
      case "VOLUME_PATTERN": return "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800";
      case "MOMENTUM": return "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800";
      case "STOPLOSS": return "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800";
      case "DIVERGENCE": return "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800";
      case "SUPPORT": return "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800";
      case "RSI": return "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800";
      case "BOLL": return "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-950 dark:text-fuchsia-300 dark:border-fuchsia-800";
      case "TIME_WINDOW": return "bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800";
      case "SPREAD": return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800";
      case "REGIME": return "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800";
      default: return "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700";
    }
  };

  const getSignalBadge = (type: string) => {
    if (type === "buy") return "bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800";
    return "bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800";
  };

  const getLogicCategoryIcon = (category: string) => {
    switch (category) {
      case "data": return <Database className="h-3.5 w-3.5" />;
      case "calc": case "macd": return <Cpu className="h-3.5 w-3.5" />;
      case "signal": return <Zap className="h-3.5 w-3.5" />;
      case "filter": return <Eye className="h-3.5 w-3.5" />;
      case "display": return <Eye className="h-3.5 w-3.5" />;
      case "system": return <RefreshCw className="h-3.5 w-3.5" />;
      default: return <GitBranch className="h-3.5 w-3.5" />;
    }
  };

  const getLogicCategoryColor = (category: string) => {
    switch (category) {
      case "data": return "bg-blue-500";
      case "calc": case "macd": return "bg-purple-500";
      case "vwap": return "bg-yellow-500";
      case "signal": return "bg-red-500";
      case "volume": return "bg-blue-500";
      case "momentum": return "bg-orange-500";
      case "filter": return "bg-emerald-500";
      case "strength": return "bg-amber-500";
      case "display": return "bg-cyan-500";
      case "output": return "bg-rose-500";
      case "system": return "bg-gray-500";
      default: return "bg-gray-500";
    }
  };

  return (
    <Card className="mt-4">
      {/* Collapsible Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left"
      >
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Settings className="h-4 w-4 text-muted-foreground" />
            策略管理面板
            <Badge variant="outline" className="text-[10px] h-5 ml-1">
              {strategyData ? `v${strategyData.version}` : "--"}
            </Badge>
            <span className="ml-auto text-muted-foreground">
              {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </span>
          </CardTitle>
        </CardHeader>
      </button>

      {isOpen && (
        <CardContent className="px-4 pb-4">
          {/* Action Bar */}
          <div className="flex items-center gap-2 mb-4">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={fetchStrategy}
              disabled={loading}
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} />
              刷新
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={handleInit}
              disabled={initLoading}
            >
              <Save className={`h-3 w-3 mr-1 ${initLoading ? "animate-spin" : ""}`} />
              初始化默认参数
            </Button>
            <span className="text-xs text-muted-foreground ml-auto">
              {strategyData ? `${strategyData.dbFactors?.length || 0} 个因子 · ${strategyData.dbLogicSteps?.length || 0} 个逻辑步骤` : "加载中..."}
            </span>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="h-8 mb-4 flex-wrap">
              <TabsTrigger value="overview" className="text-xs px-3 h-6">策略总纲</TabsTrigger>
              <TabsTrigger value="factors" className="text-xs px-3 h-6">因子参数</TabsTrigger>
              <TabsTrigger value="timewindow" className="text-xs px-3 h-6">时间窗口</TabsTrigger>
              <TabsTrigger value="logic" className="text-xs px-3 h-6">逻辑流程</TabsTrigger>
              <TabsTrigger value="position" className="text-xs px-3 h-6">仓位管理</TabsTrigger>
              <TabsTrigger value="risk" className="text-xs px-3 h-6">风控参数</TabsTrigger>
              <TabsTrigger value="datasource" className="text-xs px-3 h-6">数据源</TabsTrigger>
              <TabsTrigger value="regime" className="text-xs px-3 h-6">趋势识别</TabsTrigger>
              <TabsTrigger value="corelogic" className="text-xs px-3 h-6">核心逻辑</TabsTrigger>
              <TabsTrigger value="customfactors" className="text-xs px-3 h-6">自定义因子</TabsTrigger>
              <TabsTrigger value="newsprinciple" className="text-xs px-3 h-6">资讯原理</TabsTrigger>
            </TabsList>

            {/* ── Tab: 策略总纲 ── */}
            {activeTab === "overview" && strategyData && (
              <div className="space-y-4">
                {/* Strategy Header */}
                <div className="p-4 rounded-lg border border-border bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-[10px] h-5 bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300">
                      v{strategyData.version}
                    </Badge>
                    <span className="text-sm font-bold">{strategyData.name}</span>
                  </div>
                  {strategyData.basedOn && (
                    <div className="text-[10px] text-muted-foreground mb-2">基于: {strategyData.basedOn}</div>
                  )}
                  {strategyData.corePhilosophy && (
                    <div className="text-xs text-foreground/80 italic border-l-2 border-emerald-400 pl-3">
                      {strategyData.corePhilosophy}
                    </div>
                  )}
                </div>

                {/* 5 Basic Principles */}
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">基本原则</div>
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                    {strategyData.basicPrinciples?.map((p) => (
                      <div key={p.id} className="p-2.5 rounded-lg border border-border bg-muted/30 text-center">
                        <div className="text-lg font-bold text-primary mb-1">{p.id}</div>
                        <div className="text-xs font-medium">{p.name}</div>
                        <div className="text-[10px] text-muted-foreground mt-1">{p.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Selection Criteria */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Required */}
                  <div className="p-3 rounded-lg border border-border">
                    <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-2 flex items-center gap-1">
                      <Shield className="h-3.5 w-3.5" />
                      必要条件（全部满足才操作）
                    </div>
                    <div className="space-y-1.5">
                      {strategyData.selectionCriteria?.required.map((c, i) => (
                        <div key={i} className="flex items-start gap-2 text-[10px]">
                          <span className="shrink-0 w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 flex items-center justify-center font-bold text-[8px]">✓</span>
                          <div>
                            <span className="font-medium">{c.name}</span>
                            <span className="text-muted-foreground ml-1">{c.desc}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Exclude */}
                  <div className="p-3 rounded-lg border border-border">
                    <div className="text-xs font-medium text-red-600 dark:text-red-400 mb-2 flex items-center gap-1">
                      <X className="h-3.5 w-3.5" />
                      排除条件（出现任一即不做T）
                    </div>
                    <div className="space-y-1.5">
                      {strategyData.selectionCriteria?.exclude.map((c, i) => (
                        <div key={i} className="flex items-start gap-2 text-[10px]">
                          <span className="shrink-0 w-4 h-4 rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 flex items-center justify-center font-bold text-[8px]">✗</span>
                          <div>
                            <span className="font-medium">{c.name}</span>
                            <span className="text-muted-foreground ml-1">{c.reason}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Market Regimes */}
                {strategyData.marketRegimes && strategyData.marketRegimes.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-2">不同行情下的做T策略</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                      {strategyData.marketRegimes.map((m) => {
                        const colorMap: Record<string, string> = {
                          "震荡市": "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30",
                          "上升通道": "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30",
                          "下跌趋势": "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30",
                          "横盘末期": "border-yellow-300 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30",
                        };
                        const textColorMap: Record<string, string> = {
                          "震荡市": "text-emerald-700 dark:text-emerald-300",
                          "上升通道": "text-red-700 dark:text-red-300",
                          "下跌趋势": "text-green-700 dark:text-green-300",
                          "横盘末期": "text-yellow-700 dark:text-yellow-300",
                        };
                        return (
                          <div key={m.regime} className={`p-2.5 rounded-lg border ${colorMap[m.regime] || "border-border bg-muted/30"}`}>
                            <div className={`text-xs font-bold ${textColorMap[m.regime] || ""}`}>{m.regime}</div>
                            <div className="text-[10px] text-muted-foreground mt-1">{m.suitability}</div>
                            <div className="text-[10px] mt-1">{m.strategy}</div>
                            <div className="text-[10px] text-muted-foreground mt-1">预期: {m.expectedReturn}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Stop Loss Rules */}
                {strategyData.stopLossRules && strategyData.stopLossRules.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-yellow-600 dark:text-yellow-400 mb-2 flex items-center gap-1">
                      <Shield className="h-3.5 w-3.5" />
                      止损规则
                    </div>
                    <div className="space-y-1.5">
                      {strategyData.stopLossRules.map((r, i) => (
                        <div key={i} className="p-2 rounded border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30 text-[10px]">
                          <span className="font-medium text-yellow-700 dark:text-yellow-300">{r.scenario}</span>
                          <span className="text-muted-foreground ml-2">{r.rule}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: 时间窗口 ── */}
            {activeTab === "timewindow" && strategyData && (
              <div className="space-y-4">
                {/* Time Windows */}
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    日内操作时间段对照表
                  </div>
                  <div className="space-y-2">
                    {strategyData.timeWindows?.map((tw, i) => {
                      const actionColorMap: Record<string, string> = {
                        observe: "border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/30",
                        sell: "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30",
                        buy: "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30",
                      };
                      const actionTextColorMap: Record<string, string> = {
                        observe: "text-gray-600 dark:text-gray-400",
                        sell: "text-green-700 dark:text-green-300",
                        buy: "text-red-700 dark:text-red-300",
                      };
                      const actionIconMap: Record<string, string> = {
                        observe: "👁️",
                        sell: "📉",
                        buy: "📈",
                      };
                      return (
                        <div key={i} className={`flex items-center gap-3 p-3 rounded-lg border ${actionColorMap[tw.actionType] || ""}`}>
                          <span className="text-lg shrink-0">{actionIconMap[tw.actionType] || "⏰"}</span>
                          <div className="shrink-0 w-24">
                            <span className="font-mono text-sm font-bold">{tw.period}</span>
                          </div>
                          <div className="flex-1">
                            <div className="text-xs">{tw.feature}</div>
                            <div className={`text-xs font-medium mt-0.5 ${actionTextColorMap[tw.actionType] || ""}`}>{tw.action}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Spread Floor Rules */}
                {strategyData.timelineSignals.spreadFloor && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-2">差价底线规则</div>
                    <div className="rounded-lg border border-border overflow-hidden">
                      <div className="grid grid-cols-[80px_1fr] gap-0 text-[10px] bg-muted/50 px-3 py-1.5 font-medium text-muted-foreground">
                        <span>差价比例</span>
                        <span>操作建议</span>
                      </div>
                      {strategyData.timelineSignals.spreadFloor.rules.map((r, i) => {
                        const levelColor = i === 0 ? "text-red-500" : i === 1 ? "text-orange-500" : i === 2 ? "text-yellow-600" : i === 3 ? "text-emerald-600" : "text-emerald-700";
                        return (
                          <div key={i} className="grid grid-cols-[80px_1fr] gap-0 text-[10px] px-3 py-1.5 border-t border-border/50 items-center">
                            <span className={`font-mono font-medium ${levelColor}`}>{r.spread}</span>
                            <span>{r.action}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: 仓位管理 ── */}
            {activeTab === "position" && strategyData && strategyData.positionManagement && (
              <div className="space-y-4">
                {/* Position Split */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 rounded-lg border border-border bg-muted/30 text-center">
                    <div className="text-2xl font-bold text-primary">{strategyData.positionManagement.basePosition.range}</div>
                    <div className="text-xs font-medium mt-1">{strategyData.positionManagement.basePosition.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">{strategyData.positionManagement.basePosition.rule}</div>
                  </div>
                  <div className="p-4 rounded-lg border border-border bg-muted/30 text-center">
                    <div className="text-2xl font-bold text-orange-500">{strategyData.positionManagement.tPosition.range}</div>
                    <div className="text-xs font-medium mt-1">{strategyData.positionManagement.tPosition.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">{strategyData.positionManagement.tPosition.rule}</div>
                  </div>
                </div>

                {/* Single T Quantity Table */}
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">单次做T仓位对照表</div>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <div className="grid grid-cols-3 gap-0 text-[10px] bg-muted/50 px-3 py-1.5 font-medium text-muted-foreground">
                      <span>底仓规模</span>
                      <span>单次T仓数量</span>
                      <span>说明</span>
                    </div>
                    {strategyData.positionManagement.singleTQuantity.map((q, i) => (
                      <div key={i} className="grid grid-cols-3 gap-0 text-[10px] px-3 py-1.5 border-t border-border/50 items-center">
                        <span className="font-mono">{q.basePosition}</span>
                        <span className="font-mono font-medium">{q.tQuantity}</span>
                        <span className="text-muted-foreground">{q.note}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Daily Limit */}
                <div className="p-3 rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30">
                  <div className="text-xs font-medium text-yellow-700 dark:text-yellow-300 mb-1">每日做T次数限制</div>
                  <div className="text-[10px]">
                    最多 <span className="font-bold">{strategyData.positionManagement.dailyLimit.maxCount}</span> 次做T
                    <span className="text-muted-foreground ml-2">{strategyData.positionManagement.dailyLimit.rule}</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── Tab: 因子参数 ── */}
            {activeTab === "factors" && strategyData && (
              <div className="space-y-4">
                {/* Indicator Cards — with editable params */}
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <Settings className="h-3 w-3" />
                    技术指标参数
                    <span className="text-[9px] text-muted-foreground/60 ml-2">点击数值可编辑</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {Object.entries(strategyData.indicators).map(([key, ind]: [string, any]) => (
                      <div key={key} className="p-3 rounded-lg border border-border bg-muted/30">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className={`text-[10px] h-5 ${getCategoryColor(key.toUpperCase())}`}>
                            {key.toUpperCase()}
                          </Badge>
                          <span className="text-xs font-medium">{ind.name}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mb-2">{ind.description}</p>
                        {ind.params && (
                          <div className="grid grid-cols-3 gap-1 text-[10px]">
                            {ind.params.map((p: any) => {
                              const paramId = `${key}-${p.key}`;
                              const isEditingThis = editingParamKey === paramId;
                              const isNumericParam = typeof p.value === "number" || !isNaN(Number(p.value));
                              return (
                                <div key={p.key} className="bg-background rounded px-1.5 py-1 text-center group relative">
                                  <div className="text-muted-foreground">{p.label}</div>
                                  {isNumericParam && p.key !== "source" ? (
                                    isEditingThis ? (
                                      <input
                                        type="number"
                                        step="any"
                                        autoFocus
                                        value={editParamValue}
                                        onChange={e => setEditParamValue(e.target.value)}
                                        onBlur={() => {
                                          const numVal = parseFloat(editParamValue);
                                          if (!isNaN(numVal)) {
                                            handleUpdateIndicatorParam(key, p.key, numVal);
                                          }
                                          setEditingParamKey(null);
                                        }}
                                        onKeyDown={e => {
                                          if (e.key === "Enter") {
                                            const numVal = parseFloat(editParamValue);
                                            if (!isNaN(numVal)) {
                                              handleUpdateIndicatorParam(key, p.key, numVal);
                                            }
                                            setEditingParamKey(null);
                                          } else if (e.key === "Escape") {
                                            setEditingParamKey(null);
                                          }
                                        }}
                                        className="w-full text-center font-mono font-medium text-[10px] bg-primary/10 border border-primary/30 rounded px-1 py-0.5 outline-none"
                                      />
                                    ) : (
                                      <button
                                        onClick={() => {
                                          setEditingParamKey(paramId);
                                          setEditParamValue(String(p.value));
                                        }}
                                        className="font-mono font-medium hover:bg-primary/10 hover:text-primary rounded px-1 py-0.5 transition-colors cursor-pointer w-full"
                                        title="点击编辑"
                                      >
                                        {p.value}{p.unit && <span className="text-muted-foreground">{p.unit}</span>}
                                      </button>
                                    )
                                  ) : (
                                    <div className="font-mono font-medium">{p.value}{p.unit && <span className="text-muted-foreground">{p.unit}</span>}</div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {ind.formulas && (
                          <div className="space-y-1 mt-2">
                            {ind.formulas.map((f: any) => (
                              <div key={f.name} className="text-[10px]">
                                <span className="font-medium text-foreground">{f.name}: </span>
                                <span className="font-mono text-muted-foreground">{f.formula}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Signal Rules Table */}
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">
                    {strategyData.timelineSignals.name} — {strategyData.timelineSignals.description}
                  </div>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <div className="grid grid-cols-[40px_80px_60px_50px_1fr_100px_80px_40px] gap-0 text-[10px] bg-muted/50 px-2 py-1.5 font-medium text-muted-foreground">
                      <span>优先</span>
                      <span>名称</span>
                      <span>类别</span>
                      <span>方向</span>
                      <span>条件</span>
                      <span>强度规则</span>
                      <span>阈值</span>
                      <span>启用</span>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {strategyData.timelineSignals.rules.map((rule: any) => {
                        // Find matching DB factor for override display
                        const dbFactor = strategyData.dbFactors?.find((f: any) => f.name === rule.name);
                        return (
                          <div key={rule.id} className="grid grid-cols-[40px_80px_60px_50px_1fr_100px_80px_40px] gap-0 text-[10px] px-2 py-1.5 border-t border-border/50 hover:bg-muted/20 items-center">
                            <span className="font-mono text-muted-foreground">{rule.priority}</span>
                            <span className="font-medium">{rule.name}</span>
                          <span>
                            <Badge variant="outline" className={`text-[9px] h-4 px-1 ${getCategoryColor(
                              rule.name.includes("MACD") || rule.name.includes("DIF") ? "MACD" :
                              rule.name.includes("均价") || rule.name.includes("突破") ? "VWAP" :
                              rule.name.includes("放量") ? "VOLUME" :
                              rule.name.includes("RSI") ? "RSI" :
                              rule.name.includes("布林") ? "BOLL" :
                              rule.name.includes("连续缩量") || rule.name.includes("脉冲") ? "VOLUME_PATTERN" :
                              rule.name.includes("止损") ? "STOPLOSS" :
                              rule.name.includes("量价") || rule.name.includes("量缩") ? "DIVERGENCE" :
                              rule.name.includes("昨收") ? "SUPPORT" : "MOMENTUM"
                            )}`}>
                              {rule.name.includes("MACD") || rule.name.includes("DIF") ? "MACD" :
                               rule.name.includes("均价") || rule.name.includes("突破") ? "VWAP" :
                               rule.name.includes("放量") ? "量" :
                               rule.name.includes("RSI") ? "RSI" :
                               rule.name.includes("布林") ? "BOLL" :
                               rule.name.includes("连续缩量") || rule.name.includes("脉冲") ? "量态" :
                               rule.name.includes("止损") ? "止损" :
                               rule.name.includes("量价") || rule.name.includes("量缩") ? "背离" :
                               rule.name.includes("昨收") ? "支撑" : "动量"}
                            </Badge>
                          </span>
                          <span>
                            <Badge variant="outline" className={`text-[9px] h-4 px-1 ${rule.type === "stoploss" ? "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800" : getSignalBadge(rule.type)}`}>
                              {rule.type === "buy" ? "买" : rule.type === "stoploss" ? "止损" : "卖"}
                            </Badge>
                          </span>
                          <span className="font-mono text-muted-foreground truncate" title={rule.condition}>
                            {rule.condition}
                          </span>
                          <span className="text-muted-foreground">
                            {rule.strengthRules?.map((sr: any, si: number) => (
                              <span key={si}>
                                {si > 0 && " | "}
                                <span className={sr.strength === "strong" ? "text-red-500" : sr.strength === "weak" ? "text-yellow-600" : "text-orange-500"}>
                                  {sr.strength === "strong" ? "强" : sr.strength === "medium" ? "中" : "弱"}
                                </span>
                              </span>
                            ))}
                            {dbFactor && dbFactor.strength && (
                              <span className="ml-1 text-primary font-medium" title={`DB覆盖: ${dbFactor.strength}`}>
                                →{dbFactor.strength === "strong" ? "强" : dbFactor.strength === "medium" ? "中" : "弱"}
                              </span>
                            )}
                          </span>
                          <span className="font-mono text-muted-foreground">
                            {rule.threshold
                              ? Array.isArray(rule.threshold)
                                ? rule.threshold.map((t: any) => t.value).join("/")
                                : rule.threshold.value
                              : "--"}
                          </span>
                          <span className="text-center text-green-500">✓</span>
                        </div>
                      );
                      })}
                    </div>
                  </div>
                  {/* Post-process note */}
                  <div className="mt-2 text-[10px] text-muted-foreground flex items-center gap-1">
                    <EyeOff className="h-3 w-3" />
                    {strategyData.timelineSignals.postProcess.name}：{strategyData.timelineSignals.postProcess.description}
                  </div>
                </div>

                {/* DB Factors Table — with inline editing */}
                {strategyData.dbFactors && strategyData.dbFactors.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <Database className="h-3 w-3" />
                      数据库因子配置
                      <span className="text-[9px] text-muted-foreground/60 ml-2">点击 强度/模式/窗口/优先级 可直接编辑</span>
                    </div>
                    <div className="rounded-lg border border-border overflow-hidden">
                      <div className="grid grid-cols-[40px_80px_50px_40px_55px_60px_60px_1fr_32px_32px] gap-0 text-[10px] bg-muted/50 px-2 py-1.5 font-medium text-muted-foreground">
                        <span>优先</span>
                        <span>名称</span>
                        <span>类别</span>
                        <span>方向</span>
                        <span>强度</span>
                        <span>模式</span>
                        <span>窗口</span>
                        <span>描述</span>
                        <span>启用</span>
                        <span>操作</span>
                      </div>
                      <div className="max-h-96 overflow-y-auto">
                        {strategyData.dbFactors.map((factor: any) => {
                          const isEditing = editingFactorId === factor.id;
                          return (
                            <div key={factor.id} className={`grid grid-cols-[40px_80px_50px_40px_55px_60px_60px_1fr_32px_32px] gap-0 text-[10px] px-2 py-1.5 border-t border-border/50 items-center ${isEditing ? "bg-primary/5 ring-1 ring-primary/20" : "hover:bg-muted/20"}`}>
                              {/* Priority — editable */}
                              <span>
                                <input
                                  type="number"
                                  value={factor.priority}
                                  onChange={e => handleUpdateFactor(factor.id, "priority", parseInt(e.target.value) || 0)}
                                  className="w-8 text-center font-mono text-[10px] bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none text-muted-foreground"
                                />
                              </span>
                              {/* Name */}
                              <span className="font-medium truncate" title={factor.name}>{factor.name}</span>
                              {/* Category */}
                              <span>
                                <Badge variant="outline" className={`text-[8px] h-4 px-1 ${getCategoryColor(factor.category)}`}>
                                  {factor.category.length > 5 ? factor.category.substring(0, 5) : factor.category}
                                </Badge>
                              </span>
                              {/* Signal type */}
                              <span>
                                <Badge variant="outline" className={`text-[8px] h-4 px-1 ${factor.signalType === "stoploss" ? "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800" : getSignalBadge(factor.signalType)}`}>
                                  {factor.signalType === "buy" ? "买" : factor.signalType === "stoploss" ? "止损" : "卖"}
                                </Badge>
                              </span>
                              {/* Strength — editable select */}
                              <span>
                                <Select
                                  value={factor.strength || "medium"}
                                  onValueChange={v => handleUpdateFactor(factor.id, "strength", v)}
                                >
                                  <SelectTrigger className="h-5 text-[9px] px-1 border-0 bg-transparent shadow-none gap-0.5 focus:ring-0 w-[52px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="strong">
                                      <span className="text-red-500 font-medium text-[10px]">强</span>
                                    </SelectItem>
                                    <SelectItem value="medium">
                                      <span className="text-orange-500 font-medium text-[10px]">中</span>
                                    </SelectItem>
                                    <SelectItem value="weak">
                                      <span className="text-yellow-600 font-medium text-[10px]">弱</span>
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              </span>
                              {/* T Mode — editable select */}
                              <span>
                                <Select
                                  value={factor.tMode || "正T"}
                                  onValueChange={v => handleUpdateFactor(factor.id, "tMode", v)}
                                >
                                  <SelectTrigger className="h-5 text-[9px] px-1 border-0 bg-transparent shadow-none gap-0.5 focus:ring-0 w-[56px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="正T"><span className="text-[10px]">正T</span></SelectItem>
                                    <SelectItem value="反T"><span className="text-[10px]">反T</span></SelectItem>
                                  </SelectContent>
                                </Select>
                              </span>
                              {/* Time Window — editable select */}
                              <span>
                                <Select
                                  value={factor.timeWindow || "any"}
                                  onValueChange={v => handleUpdateFactor(factor.id, "timeWindow", v)}
                                >
                                  <SelectTrigger className="h-5 text-[9px] px-1 border-0 bg-transparent shadow-none gap-0.5 focus:ring-0 w-[56px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="any"><span className="text-[10px]">任意</span></SelectItem>
                                    <SelectItem value="sell_window"><span className="text-[10px]">卖窗</span></SelectItem>
                                    <SelectItem value="buy_window"><span className="text-[10px]">买窗</span></SelectItem>
                                  </SelectContent>
                                </Select>
                              </span>
                              {/* Description */}
                              <span className="text-muted-foreground truncate" title={factor.description}>{factor.description}</span>
                              {/* Enabled toggle */}
                              <span>
                                <button
                                  onClick={() => handleToggleFactor(factor.id, factor.enabled)}
                                  className={`${factor.enabled ? "text-green-500" : "text-muted-foreground"}`}
                                  title={factor.enabled ? "点击禁用" : "点击启用"}
                                >
                                  {factor.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                                </button>
                              </span>
                              {/* Actions */}
                              <span className="flex items-center gap-0.5">
                                <TooltipProvider delayDuration={300}>
                                  <UITooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        onClick={() => setEditingFactorId(isEditing ? null : factor.id)}
                                        className={`${isEditing ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-[10px]">
                                      {isEditing ? "关闭编辑" : "编辑因子"}
                                    </TooltipContent>
                                  </UITooltip>
                                </TooltipProvider>
                                <button
                                  onClick={() => handleDeleteFactor(factor.id)}
                                  className="text-muted-foreground hover:text-destructive"
                                  title="删除"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: 逻辑流程 ── */}
            {activeTab === "logic" && strategyData && (
              <div className="space-y-6">
                {/* Execution Flow - Vertical Timeline */}
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1">
                    <GitBranch className="h-3 w-3" />
                    {strategyData.logicFlow.name}
                  </div>
                  <div className="space-y-0">
                    {strategyData.logicFlow.steps.map((step: any, idx: number) => {
                      const dbStep = strategyData.dbLogicSteps?.find((s: any) => s.logicOrder === step.step);
                      const stepCategory = dbStep?.category || "general";
                      return (
                        <div key={step.step} className="flex items-start gap-3">
                          {/* Timeline line + dot */}
                          <div className="flex flex-col items-center">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${getLogicCategoryColor(stepCategory)}`}>
                              {step.step}
                            </div>
                            {idx < strategyData.logicFlow.steps.length - 1 && (
                              <div className="w-0.5 h-8 bg-border" />
                            )}
                          </div>
                          {/* Content */}
                          <div className="flex-1 pb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium">{step.name}</span>
                              <Badge variant="outline" className="text-[9px] h-4 px-1">
                                {getLogicCategoryIcon(stepCategory)}
                              </Badge>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{step.description}</p>
                            {dbStep && !dbStep.isActive && (
                              <Badge variant="outline" className="text-[9px] h-4 mt-1 text-muted-foreground">已禁用</Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Decision Tree - Flowchart Layout */}
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1">
                    <GitBranch className="h-3 w-3" />
                    决策树
                  </div>
                  <div className="space-y-2">
                    {strategyData.logicFlow.decisionTree.map((node: any, idx: number) => (
                      <div key={idx} className="flex items-stretch gap-2">
                        {/* Question */}
                        <div className="flex-1 p-2 rounded-lg border border-purple-200 bg-purple-50 dark:bg-purple-950/30 dark:border-purple-800">
                          <div className="text-[10px] font-medium text-purple-700 dark:text-purple-300">{node.question}</div>
                        </div>
                        {/* Yes/No branches */}
                        <div className="flex flex-col gap-1 flex-1">
                          <div className="p-1.5 rounded border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 text-[10px]">
                            <span className="text-red-600 dark:text-red-400 font-medium">是 → </span>
                            <span className="text-muted-foreground">{node.yes}</span>
                          </div>
                          <div className="p-1.5 rounded border border-muted bg-muted/30 text-[10px]">
                            <span className="font-medium text-muted-foreground">否 → </span>
                            <span className="text-muted-foreground">{node.no}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* DB Logic Steps */}
                {strategyData.dbLogicSteps && strategyData.dbLogicSteps.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <Database className="h-3 w-3" />
                      数据库逻辑步骤
                    </div>
                    <div className="rounded-lg border border-border overflow-hidden">
                      <div className="grid grid-cols-[40px_1fr_1fr_60px_50px] gap-0 text-[10px] bg-muted/50 px-2 py-1.5 font-medium text-muted-foreground">
                        <span>序号</span>
                        <span>名称</span>
                        <span>描述</span>
                        <span>类别</span>
                        <span>状态</span>
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        {strategyData.dbLogicSteps.map((logic: any) => (
                          <div key={logic.id} className="grid grid-cols-[40px_1fr_1fr_60px_50px] gap-0 text-[10px] px-2 py-1.5 border-t border-border/50 hover:bg-muted/20 items-center">
                            <span className="font-mono text-muted-foreground">{logic.logicOrder}</span>
                            <span className="font-medium">{logic.name}</span>
                            <span className="text-muted-foreground truncate" title={logic.description}>{logic.description}</span>
                            <span>
                              <Badge variant="outline" className={`text-[9px] h-4 px-1 ${getCategoryColor(logic.category?.toUpperCase())}`}>
                                {logic.category}
                              </Badge>
                            </span>
                            <span className={logic.isActive ? "text-green-500" : "text-muted-foreground"}>
                              {logic.isActive ? "启用" : "禁用"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: 数据源 ── */}
            {activeTab === "datasource" && strategyData && (
              <div className="space-y-3">
                {Object.entries(strategyData.dataSources).map(([key, ds]: [string, any]) => (
                  <div key={key} className="p-3 rounded-lg border border-border bg-muted/30">
                    <div className="flex items-center gap-2 mb-2">
                      <Database className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{ds.name}</span>
                      <Badge variant="outline" className="text-[10px] h-5">{key}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      {ds.provider && (
                        <>
                          <span className="text-muted-foreground">数据源</span>
                          <span className="font-mono">{ds.provider}</span>
                        </>
                      )}
                      {ds.primary && (
                        <>
                          <span className="text-muted-foreground">主要源</span>
                          <span className="font-mono">{ds.primary.provider} ({ds.primary.interval})</span>
                        </>
                      )}
                      {ds.fallback && (
                        <>
                          <span className="text-muted-foreground">降级源</span>
                          <span className="font-mono">{ds.fallback.provider} ({ds.fallback.interval})</span>
                        </>
                      )}
                      {ds.interval && (
                        <>
                          <span className="text-muted-foreground">周期</span>
                          <span className="font-mono">{ds.interval}</span>
                        </>
                      )}
                      {ds.refreshInterval && (
                        <>
                          <span className="text-muted-foreground">刷新间隔</span>
                          <span className="font-mono">{ds.refreshInterval}{ds.refreshUnit || "秒"}</span>
                        </>
                      )}
                      {ds.intervals && (
                        <>
                          <span className="text-muted-foreground">支持周期</span>
                          <span className="font-mono">{ds.intervals.join(", ")}</span>
                        </>
                      )}
                      {ds.defaultInterval && (
                        <>
                          <span className="text-muted-foreground">默认周期</span>
                          <span className="font-mono">{ds.defaultInterval}</span>
                        </>
                      )}
                      {ds.defaultBars && (
                        <>
                          <span className="text-muted-foreground">默认K线数</span>
                          <span className="font-mono">{ds.defaultBars}</span>
                        </>
                      )}
                      {ds.barsPerDay && (
                        <>
                          <span className="text-muted-foreground">每日K线数</span>
                          <span className="font-mono">{ds.barsPerDay}</span>
                        </>
                      )}
                    </div>
                    {ds.tradingHours && (
                      <div className="mt-2">
                        <span className="text-[10px] text-muted-foreground">交易时段：</span>
                        {ds.tradingHours.map((th: any) => (
                          <Badge key={th.session} variant="outline" className="text-[9px] h-4 ml-1">
                            {th.session} {th.start}-{th.end}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── Tab: 风控参数 ── */}
            {activeTab === "risk" && strategyData && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{strategyData.riskControl.name}</span>
                </div>
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="grid grid-cols-[100px_1fr_80px_80px] gap-0 text-[10px] bg-muted/50 px-2 py-1.5 font-medium text-muted-foreground">
                    <span>参数</span>
                    <span>说明</span>
                    <span>值</span>
                    <span>可选值</span>
                  </div>
                  {strategyData.riskControl.rules.map((rule: any) => (
                    <div key={rule.key} className="grid grid-cols-[100px_1fr_80px_80px] gap-0 text-[10px] px-2 py-1.5 border-t border-border/50 hover:bg-muted/20 items-center">
                      <span className="font-medium">{rule.label}</span>
                      <span className="text-muted-foreground">{rule.description}</span>
                      <span className="font-mono">
                        {rule.value !== undefined ? String(rule.value) : "--"}
                        {rule.unit && <span className="text-muted-foreground ml-0.5">{rule.unit}</span>}
                      </span>
                      <span className="text-muted-foreground">
                        {rule.values ? rule.values.join("/") : "--"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Tab: 趋势识别 ── */}
            {activeTab === "regime" && (
              <div className="space-y-4">
                {/* 标题 */}
                <div className="p-4 rounded-lg border border-border bg-gradient-to-r from-violet-50 to-fuchsia-50 dark:from-violet-950/30 dark:to-fuchsia-950/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="h-4 w-4 text-violet-500" />
                    <span className="text-sm font-bold">趋势识别引擎 v3.2</span>
                    <Badge variant="outline" className="text-[10px] h-5 bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300">
                      5维评分
                    </Badge>
                  </div>
                  <div className="text-xs text-foreground/80">
                    基于分时数据的VWAP斜率、价格动量、波动率、价格位置、趋势一致性五个维度综合评分，自动识别当前行情属于上涨趋势、下跌趋势还是震荡行情，并据此调整做T策略的信号强度和仓位比例。
                  </div>
                </div>

                {/* 五维评分体系 */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">五维评分体系</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                    {[
                      { dim: "VWAP斜率", weight: "30%", icon: "📈", color: "bg-blue-500",
                        desc: "对均价线做线性回归，计算斜率方向和大小。斜率正=均线上行，负=均线下行，零=走平。",
                        formula: "slope = Σ(x·y) - n·x̄·ȳ / Σ(x²) - n·x̄²",
                        keypoint: "斜率归一化后，每万分之0.1/分钟视为有效趋势" },
                      { dim: "价格动量", weight: "25%", icon: "🚀", color: "bg-orange-500",
                        desc: "近30根分钟线的涨跌幅加权求和，越近的数据权重越高，反映短期多空力量。",
                        formula: "momentum = Σ(changeᵢ × wᵢ), wᵢ = i/n",
                        keypoint: "动量>0.2为多头有效，<-0.2为空头有效" },
                      { dim: "波动率", weight: "20%", icon: "📊", color: "bg-purple-500",
                        desc: "涨跌幅的标准差，衡量价格波动幅度。低波动=横盘/窄幅，高波动=趋势或剧烈震荡。",
                        formula: "volatility = √(Σ(x-μ)²/n)",
                        keypoint: "波动率<0.3%为极低（横盘末期），>1%为高波动" },
                      { dim: "价格位置", weight: "15%", icon: "🎯", color: "bg-emerald-500",
                        desc: "当前价格相对VWAP和昨收价的位置。站稳均线上方+高于昨收=多头，反之空头。",
                        formula: "position = (price-VWAP)/VWAP × 20, 限[-1,1]",
                        keypoint: "偏离VWAP 5%以上为满分，高于昨收0.5%以上加成" },
                      { dim: "趋势一致性", weight: "10%", icon: "🔗", color: "bg-amber-500",
                        desc: "价格在均价线同一侧的比例。一致性高=单边趋势，一致性低=反复穿越均线=震荡。",
                        formula: "consistency = max(above, below) / total",
                        keypoint: ">0.7为高一致性（趋势），0.5附近为低一致性（震荡）" },
                    ].map((item) => (
                      <div key={item.dim} className="rounded-lg border border-border p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{item.icon}</span>
                          <span className="text-xs font-bold">{item.dim}</span>
                          <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">
                            权重{item.weight}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground leading-relaxed">{item.desc}</p>
                        <div className="bg-muted/50 rounded px-2 py-1">
                          <code className="text-[9px] font-mono text-foreground/70">{item.formula}</code>
                        </div>
                        <div className="text-[9px] text-amber-600 dark:text-amber-400 flex items-start gap-1">
                          <span className="shrink-0 mt-px">💡</span>
                          <span>{item.keypoint}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 综合评分公式 */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">综合评分公式</span>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                    <div className="bg-card rounded px-3 py-2 border border-border">
                      <code className="text-[10px] font-mono leading-relaxed">
                        trendScore = slope×30 + momentum×0.25 + vwapPosition×15 + prevClose加成 + consistency加成
                      </code>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
                      <div className="flex items-start gap-2 p-2 rounded bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30">
                        <span className="text-red-500 font-bold shrink-0">多头加成</span>
                        <span className="text-muted-foreground">价格&gt;昨收+0.5%时+10分；一致性&gt;0.7且在均线上方+10分</span>
                      </div>
                      <div className="flex items-start gap-2 p-2 rounded bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900/30">
                        <span className="text-green-500 font-bold shrink-0">空头加成</span>
                        <span className="text-muted-foreground">价格&lt;昨收-0.5%时-10分；一致性&gt;0.7且在均线下方-10分</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 四种行情判断规则 */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">四种行情判断规则</span>
                  </div>
                  <div className="space-y-2">
                    {[
                      { regime: "上升通道", icon: "↑", color: "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20",
                        badge: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
                        conditions: ["综合趋势得分 > 8", "VWAP斜率 > 0.05 (万分之一/分钟)", "加权动量 > +0.2%"],
                        meaning: "均价线持续上行，价格站稳均线上方，多头力量占优",
                        strategy: "谨慎做T，只做正T，T仓降至20%，买回要快，避免卖飞",
                        signalAdj: "所有信号强度降1级" },
                      { regime: "下跌趋势", icon: "↓", color: "border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-950/20",
                        badge: "bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
                        conditions: ["综合趋势得分 < -8", "VWAP斜率 < -0.05 (万分之一/分钟)", "加权动量 < -0.2%"],
                        meaning: "均价线持续下行，价格被压制在均线下方，空头力量主导",
                        strategy: "不建议做T，仅正T卖出，T仓降至10-15%",
                        signalAdj: "禁止买入信号，卖出信号强度降1级" },
                      { regime: "震荡市", icon: "↔", color: "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20",
                        badge: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
                        conditions: ["综合趋势得分在-8到+8之间", "VWAP走平或斜率方向与动量不一致", "价格反复穿越均价线"],
                        meaning: "均价线走平，价格在均线附近上下波动，多空力量均衡",
                        strategy: "最适合做T！正T为主，高抛低吸，每日1-2次T",
                        signalAdj: "信号强度不调整，全部正常" },
                      { regime: "横盘末期", icon: "→", color: "border-yellow-200 bg-yellow-50 dark:border-yellow-900/40 dark:bg-yellow-950/20",
                        badge: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800",
                        conditions: ["波动率 < 0.3%", "价格偏离昨收 < 0.5%", "VWAP斜率接近零"],
                        meaning: "价格极窄幅波动，多空双方僵持，即将选择方向突破",
                        strategy: "减少做T频率，等待方向明确后再操作",
                        signalAdj: "信号强度降2级，买卖信号均受限" },
                    ].map((item) => (
                      <div key={item.regime} className={`rounded-lg border p-3 space-y-2 ${item.color}`}>
                        <div className="flex items-center gap-2">
                          <Badge className={`text-[10px] h-5 ${item.badge}`}>{item.icon} {item.regime}</Badge>
                        </div>
                        <div className="space-y-1.5">
                          <div className="text-[10px]">
                            <span className="font-semibold text-foreground/80">判定条件：</span>
                            <ul className="mt-1 space-y-0.5 ml-3">
                              {item.conditions.map((c, ci) => (
                                <li key={ci} className="text-muted-foreground flex items-start gap-1">
                                  <span className="text-foreground/40 shrink-0">•</span>
                                  <span className="font-mono">{c}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="text-[10px]">
                            <span className="font-semibold text-foreground/80">行情含义：</span>
                            <span className="text-muted-foreground ml-1">{item.meaning}</span>
                          </div>
                          <div className="text-[10px]">
                            <span className="font-semibold text-foreground/80">做T策略：</span>
                            <span className="text-muted-foreground ml-1">{item.strategy}</span>
                          </div>
                          <div className="text-[10px]">
                            <span className="font-semibold text-foreground/80">信号调整：</span>
                            <span className="text-amber-600 dark:text-amber-400 ml-1">{item.signalAdj}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 识别流程图 */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">识别流程</span>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <div className="flex flex-wrap items-center gap-1 text-[10px]">
                      {[
                        { label: "分时数据", sub: "price/VWAP/change", color: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
                        { label: "→", sub: "", color: "text-muted-foreground" },
                        { label: "计算5维指标", sub: "slope/momentum/volatility/position/consistency", color: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300" },
                        { label: "→", sub: "", color: "text-muted-foreground" },
                        { label: "综合评分", sub: "trendScore = Σ(维度×权重)", color: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" },
                        { label: "→", sub: "", color: "text-muted-foreground" },
                        { label: "阈值判定", sub: "score±8 / slope±0.05 / momentum±0.2", color: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
                        { label: "→", sub: "", color: "text-muted-foreground" },
                        { label: "行情标签", sub: "上升/下跌/震荡/横盘", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
                        { label: "→", sub: "", color: "text-muted-foreground" },
                        { label: "策略调整", sub: "仓位/信号/强度", color: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
                      ].map((step, si) => (
                        <div key={si} className="flex flex-col items-center">
                          {step.label === "→" ? (
                            <span className="text-muted-foreground font-bold">→</span>
                          ) : (
                            <div className={`rounded-md px-2 py-1 border border-current/10 ${step.color}`}>
                              <div className="font-semibold">{step.label}</div>
                              {step.sub && <div className="text-[8px] opacity-60 font-mono">{step.sub}</div>}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 置信度说明 */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">置信度计算</span>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-[10px]">
                    <p className="text-muted-foreground">置信度反映识别结果的可靠程度（0-100%），综合考虑了趋势得分的绝对值和趋势一致性：</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="p-2 rounded bg-card border border-border">
                        <div className="font-semibold text-foreground/80 mb-1">上升/下跌趋势</div>
                        <code className="text-[9px] font-mono">confidence = 40 + min(|score|, 40) + consistency × 20</code>
                        <p className="text-[9px] text-muted-foreground mt-1">趋势越强、一致性越高，置信度越高</p>
                      </div>
                      <div className="p-2 rounded bg-card border border-border">
                        <div className="font-semibold text-foreground/80 mb-1">横盘末期</div>
                        <code className="text-[9px] font-mono">confidence = 50 + (1 - volatility/0.3) × 40</code>
                        <p className="text-[9px] text-muted-foreground mt-1">波动率越低，横盘判定越确定</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Tab: 核心逻辑 ── */}
            {activeTab === "corelogic" && (
              <div className="space-y-4">
                {/* 标题 */}
                <div className="p-4 rounded-lg border border-border bg-gradient-to-r from-cyan-50 to-sky-50 dark:from-cyan-950/30 dark:to-sky-950/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Cpu className="h-4 w-4 text-cyan-500" />
                    <span className="text-sm font-bold">做T核心逻辑 — 提升胜率的十大维度</span>
                    <Badge variant="outline" className="text-[10px] h-5 bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300">
                      v3.6
                    </Badge>
                  </div>
                  <div className="text-xs text-foreground/80">
                    做T的胜负不只取决于单次信号，而是一套完整的决策体系。以下十个维度构成了高胜率做T的核心逻辑框架，每个维度都是独立的风控/增益环节，叠加使用可显著提升整体胜率。
                  </div>
                </div>

                {/* 维度1: 大盘联动 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 dark:from-blue-950/10 dark:to-indigo-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300">1</Badge>
                    <span className="text-xs font-bold">大盘联动 — 顺大势做小T</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">胜率贡献 15%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>做T不是孤立的个股行为，大盘走势决定了整体做多/做空的安全边际。当前系统已实现深证成指、上证指数、创业板指三大指数的实时趋势识别，点击行情标签可切换查看。</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                      <div className="p-2 rounded bg-card border border-border">
                        <div className="font-semibold text-foreground/80 mb-1">✅ 正确做法</div>
                        <ul className="space-y-0.5 text-muted-foreground">
                          <li>• 大盘震荡 → 个股做T安全区，可积极操作</li>
                          <li>• 大盘上升 → 仅做正T，防卖飞</li>
                          <li>• 大盘下跌 → 仅做正T卖出，不做反T</li>
                          <li>• 大盘方向与个股方向一致时，信号可信度更高</li>
                        </ul>
                      </div>
                      <div className="p-2 rounded bg-card border border-border">
                        <div className="font-semibold text-red-500 mb-1">❌ 常见错误</div>
                        <ul className="space-y-0.5 text-muted-foreground">
                          <li>• 大盘跳水时做反T（买入后被套）</li>
                          <li>• 大盘暴涨时做正T（卖出后买不回来）</li>
                          <li>• 忽略指数与个股的背离（指数涨个股跌）</li>
                          <li>• 只看个股不看大盘，逆势操作</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 维度2: VWAP偏离回归 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-emerald-50/50 to-teal-50/50 dark:from-emerald-950/10 dark:to-teal-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300">2</Badge>
                    <span className="text-xs font-bold">VWAP偏离回归 — 均价线是做T的锚</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">胜率贡献 20%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>VWAP（成交量加权平均价）是日内最重要的参考线。价格偏离VWAP越远，回归的概率越高，这是做T最核心的统计学基础。</p>
                    <div className="bg-muted/50 rounded p-2 mt-1 space-y-1">
                      <div className="font-semibold text-foreground/80 text-[10px]">偏离度与操作对应关系：</div>
                      <div className="grid grid-cols-2 gap-1.5 text-[9px]">
                        <div className="flex items-start gap-1 p-1.5 rounded bg-red-50 dark:bg-red-950/20">
                          <span className="text-red-500 font-bold shrink-0">+1.5%以上</span>
                          <span className="text-muted-foreground">正T卖出点（高抛）</span>
                        </div>
                        <div className="flex items-start gap-1 p-1.5 rounded bg-green-50 dark:bg-green-950/20">
                          <span className="text-green-500 font-bold shrink-0">-1.5%以上</span>
                          <span className="text-muted-foreground">正T买回点（低吸）</span>
                        </div>
                        <div className="flex items-start gap-1 p-1.5 rounded bg-amber-50 dark:bg-amber-950/20">
                          <span className="text-amber-500 font-bold shrink-0">±0.5%以内</span>
                          <span className="text-muted-foreground">震荡区，观望为主</span>
                        </div>
                        <div className="flex items-start gap-1 p-1.5 rounded bg-blue-50 dark:bg-blue-950/20">
                          <span className="text-blue-500 font-bold shrink-0">±1.0%附近</span>
                          <span className="text-muted-foreground">关注突破方向，准备操作</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-[9px] text-amber-600 dark:text-amber-400 flex items-start gap-1 mt-1">
                      <span className="shrink-0 mt-px">💡</span>
                      <span>关键技巧：震荡市中VWAP回归胜率极高（80%+），但在单边趋势中VWAP会持续偏离，此时应放弃VWAP回归策略，改为顺势操作。</span>
                    </div>
                  </div>
                </div>

                {/* 维度3: 量价配合 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-orange-50/50 to-amber-50/50 dark:from-orange-950/10 dark:to-amber-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300">3</Badge>
                    <span className="text-xs font-bold">量价配合 — 量在价先，无量不动</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">胜率贡献 15%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>成交量是价格变动的燃料。做T时必须确认"放量方向"与"操作方向"一致，否则信号不可靠。</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                      <div className="p-2 rounded bg-card border border-border space-y-1.5">
                        <div className="font-semibold text-foreground/80 text-[10px]">量价健康组合 ✅</div>
                        <ul className="space-y-0.5 text-[9px]">
                          <li>• <span className="text-red-500 font-semibold">放量上涨</span> → 多头有力，正T买回时机</li>
                          <li>• <span className="text-green-500 font-semibold">放量下跌</span> → 空头有力，正T卖出时机</li>
                          <li>• <span className="text-red-500 font-semibold">缩量回踩VWAP</span> → 洗盘结束，低吸机会</li>
                          <li>• <span className="text-green-500 font-semibold">缩量反弹至VWAP</span> → 反弹无力，高抛机会</li>
                        </ul>
                      </div>
                      <div className="p-2 rounded bg-card border border-border space-y-1.5">
                        <div className="font-semibold text-red-500 text-[10px]">量价背离危险 ⚠️</div>
                        <ul className="space-y-0.5 text-[9px]">
                          <li>• <span className="font-semibold">缩量新高</span> → 上涨动力不足，随时回落</li>
                          <li>• <span className="font-semibold">缩量新低</span> → 恐慌不足，可能止跌</li>
                          <li>• <span className="font-semibold">放量滞涨</span> → 主力出货，不宜追高</li>
                          <li>• <span className="font-semibold">放量不跌</span> → 主力吸筹，不宜杀跌</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 维度4: MACD背驰 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-purple-50/50 to-violet-50/50 dark:from-purple-950/10 dark:to-violet-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300">4</Badge>
                    <span className="text-xs font-bold">MACD背驰 — 抓转折的利器</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">胜率贡献 10%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>MACD背驰是判断趋势转折点最有效的技术之一。做T时利用背驰信号可以精准捕捉"高抛"和"低吸"的时机。</p>
                    <div className="bg-muted/50 rounded p-2 mt-1 space-y-1.5">
                      <div className="text-[10px]">
                        <span className="font-semibold text-red-500">顶背驰（卖出信号）：</span>
                        <span className="text-muted-foreground ml-1">价格创新高，但MACD红柱缩短/DIF不创新高 → 上涨动力衰竭，正T卖出</span>
                      </div>
                      <div className="text-[10px]">
                        <span className="font-semibold text-green-500">底背驰（买入信号）：</span>
                        <span className="text-muted-foreground ml-1">价格创新低，但MACD绿柱缩短/DIF不创新低 → 下跌动力衰竭，正T买回</span>
                      </div>
                      <div className="text-[9px] text-amber-600 dark:text-amber-400 flex items-start gap-1">
                        <span className="shrink-0 mt-px">💡</span>
                        <span>分时MACD背驰比日线背驰更频繁，但也更灵敏。建议配合VWAP位置确认：底背驰+价格低于VWAP = 高胜率买点；顶背驰+价格高于VWAP = 高胜率卖点。</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 维度5: 时段规律 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-rose-50/50 to-pink-50/50 dark:from-rose-950/10 dark:to-pink-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300">5</Badge>
                    <span className="text-xs font-bold">时段规律 — 做T的黄金时间窗</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">胜率贡献 10%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>A股日内有明显的时段特征，不同时段的做T胜率差异极大。系统已将时间窗口纳入信号因子体系。</p>
                    <div className="space-y-1.5 mt-2">
                      {[
                        { time: "09:30-10:00", label: "开盘冲高/杀跌期", desc: "开盘前30分钟波动最大，方向不确定", action: "观望为主，不急于操作", color: "bg-red-50 dark:bg-red-950/20 border-red-100 dark:border-red-900/30" },
                        { time: "10:00-10:30", label: "早盘确认期", desc: "开盘情绪消化，真实方向开始显现", action: "最佳正T卖出窗口（冲高回落）", color: "bg-orange-50 dark:bg-orange-950/20 border-orange-100 dark:border-orange-900/30" },
                        { time: "10:30-11:30", label: "早盘震荡期", desc: "多空博弈，波动适中", action: "适合做T，低吸高抛", color: "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30" },
                        { time: "13:00-13:30", label: "午盘方向期", desc: "午后开盘常出现方向选择", action: "确认方向后顺势做T", color: "bg-blue-50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900/30" },
                        { time: "14:00-14:30", label: "尾盘蓄势期", desc: "尾盘资金博弈加剧", action: "谨慎操作，防止尾盘拉升/杀跌", color: "bg-amber-50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900/30" },
                        { time: "14:30-15:00", label: "尾盘定局期", desc: "趋势基本定型，日内结算", action: "只平仓不开仓，确保日内回转", color: "bg-purple-50 dark:bg-purple-950/20 border-purple-100 dark:border-purple-900/30" },
                      ].map((slot) => (
                        <div key={slot.time} className={`flex items-start gap-2 p-2 rounded border ${slot.color}`}>
                          <div className="shrink-0 text-[9px] font-mono font-bold text-foreground/80 w-24">{slot.time}</div>
                          <div className="min-w-0">
                            <div className="text-[10px] font-semibold text-foreground/80">{slot.label}</div>
                            <div className="text-[9px] text-muted-foreground">{slot.desc}</div>
                            <div className="text-[9px] text-amber-600 dark:text-amber-400 mt-0.5">▸ {slot.action}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 维度6: 支撑阻力位 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-teal-50/50 to-cyan-50/50 dark:from-teal-950/10 dark:to-cyan-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300">6</Badge>
                    <span className="text-xs font-bold">支撑阻力位 — 价格的弹性边界</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">胜率贡献 8%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>做T的核心逻辑是"高抛低吸"，而"高"和"低"的判断需要参考支撑阻力位。系统已将均线位纳入参考线显示。</p>
                    <div className="bg-muted/50 rounded p-2 mt-1 space-y-1.5">
                      <div className="text-[10px] font-semibold text-foreground/80 mb-1">关键价格位识别方法：</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[9px]">
                        <div className="p-1.5 rounded bg-card border border-border">
                          <span className="font-semibold text-foreground/80">昨收价</span>
                          <span className="text-muted-foreground ml-1">— 多空分水岭，站稳=多，跌破=空</span>
                        </div>
                        <div className="p-1.5 rounded bg-card border border-border">
                          <span className="font-semibold text-foreground/80">VWAP均价</span>
                          <span className="text-muted-foreground ml-1">— 日内重心，偏离即回归</span>
                        </div>
                        <div className="p-1.5 rounded bg-card border border-border">
                          <span className="font-semibold text-foreground/80">MA5/MA10/MA20</span>
                          <span className="text-muted-foreground ml-1">— 短中期均线支撑/阻力</span>
                        </div>
                        <div className="p-1.5 rounded bg-card border border-border">
                          <span className="font-semibold text-foreground/80">日内高低点</span>
                          <span className="text-muted-foreground ml-1">— 突破/回踩的关键位</span>
                        </div>
                      </div>
                      <div className="text-[9px] text-amber-600 dark:text-amber-400 flex items-start gap-1 mt-1">
                        <span className="shrink-0 mt-px">💡</span>
                        <span>做T卖出点选择：价格触及上方阻力位（均线/VWAP上方偏离1.5%/日内高点）→ 正T卖出；买入点选择：价格回踩下方支撑位 → 正T买回。</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 维度7: 正T与反T选择 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-yellow-50/50 to-lime-50/50 dark:from-yellow-950/10 dark:to-lime-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300">7</Badge>
                    <span className="text-xs font-bold">正T vs 反T — 方向比努力更重要</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">胜率贡献 8%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>做T的第一步不是"何时操作"，而是"做正T还是反T"。方向选错，再精准的时机也白搭。系统已根据趋势识别自动推荐T方向。</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                      <div className="p-2.5 rounded-lg border border-red-200 bg-red-50/50 dark:border-red-900/40 dark:bg-red-950/20 space-y-1.5">
                        <div className="text-[10px] font-bold text-red-600 dark:text-red-400">正T（先卖后买）</div>
                        <div className="text-[9px] text-muted-foreground space-y-0.5">
                          <p>① 手中已有持仓 → 高位卖出 → 低位买回</p>
                          <p>② 风险：卖飞（卖出后继续涨，买不回来）</p>
                          <p>③ 适用：震荡市、下跌市</p>
                          <p>④ 优势：即使做错也不加仓，最大损失是卖飞</p>
                        </div>
                        <div className="text-[9px] p-1.5 rounded bg-red-100/50 dark:bg-red-950/30">
                          <span className="font-semibold">胜率场景：</span> 震荡市中VWAP上方卖出，回踩VWAP买回
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg border border-green-200 bg-green-50/50 dark:border-green-900/40 dark:bg-green-950/20 space-y-1.5">
                        <div className="text-[10px] font-bold text-green-600 dark:text-green-400">反T/倒T（先买后卖）</div>
                        <div className="text-[9px] text-muted-foreground space-y-0.5">
                          <p>① 手中已有持仓 → 低位加仓 → 高位卖出加仓部分</p>
                          <p>② 风险：加仓被套（买入后继续跌）</p>
                          <p>③ 适用：上升通道中</p>
                          <p>④ 劣势：做错会加大持仓，越套越深</p>
                        </div>
                        <div className="text-[9px] p-1.5 rounded bg-green-100/50 dark:bg-green-950/30">
                          <span className="font-semibold">胜率场景：</span> 上升通道中回踩VWAP买加仓，反弹卖出
                        </div>
                      </div>
                    </div>
                    <div className="text-[9px] text-red-500 dark:text-red-400 flex items-start gap-1 mt-1">
                      <span className="shrink-0 mt-px">⚠️</span>
                      <span>铁律：下跌趋势中严禁做反T！反T加仓被套是做T亏损的最大来源。</span>
                    </div>
                  </div>
                </div>

                {/* 维度8: 信号叠加确认 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-indigo-50/50 to-blue-50/50 dark:from-indigo-950/10 dark:to-blue-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300">8</Badge>
                    <span className="text-xs font-bold">信号叠加确认 — 多因子共振才出手</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">胜率贡献 8%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>单一信号容易产生假信号，多个信号同时确认时胜率大幅提升。系统当前有31个策略因子，信号合并后可看到叠加触发情况。</p>
                    <div className="bg-muted/50 rounded p-2 mt-1 space-y-1.5">
                      <div className="text-[10px] font-semibold text-foreground/80">信号强度与胜率对应关系：</div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-[9px]">
                          <Badge className="text-[8px] h-4 px-1.5 bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">强信号</Badge>
                          <span className="text-muted-foreground">3个以上因子同时触发 → 胜率 75%+ → 可操作</span>
                        </div>
                        <div className="flex items-center gap-2 text-[9px]">
                          <Badge className="text-[8px] h-4 px-1.5 bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">中信号</Badge>
                          <span className="text-muted-foreground">2个因子同时触发 → 胜率 55-65% → 谨慎操作</span>
                        </div>
                        <div className="flex items-center gap-2 text-[9px]">
                          <Badge className="text-[8px] h-4 px-1.5 bg-gray-100 text-gray-700 dark:bg-gray-950 dark:text-gray-300">弱信号</Badge>
                          <span className="text-muted-foreground">仅1个因子触发 → 胜率 40-50% → 观望为主</span>
                        </div>
                      </div>
                      <div className="text-[9px] text-amber-600 dark:text-amber-400 flex items-start gap-1 mt-1">
                        <span className="shrink-0 mt-px">💡</span>
                        <span>图表上的信号标记已合并同类信号并标注触发数量（如"×3"），点击标记可展开查看所有触发的因子名称。建议仅操作"强信号"标注的点。</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 维度9: 仓位控制 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-fuchsia-50/50 to-pink-50/50 dark:from-fuchsia-950/10 dark:to-pink-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-950 dark:text-fuchsia-300">9</Badge>
                    <span className="text-xs font-bold">仓位控制 — 活下来比赚得多更重要</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">风控贡献 3%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>做T的仓位管理直接决定了亏损时的绝对金额。仓位过重=赌博，仓位过轻=无效。系统已根据行情自动调整T仓比例。</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-2">
                      {[
                        { regime: "震荡市", ratio: "30-40%", color: "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800", note: "最安全，可满T仓" },
                        { regime: "上升通道", ratio: "15-20%", color: "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800", note: "防卖飞，轻仓" },
                        { regime: "下跌趋势", ratio: "10-15%", color: "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800", note: "仅正T，极轻仓" },
                        { regime: "横盘末期", ratio: "5-10%", color: "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800", note: "方向不明，极轻" },
                      ].map((item) => (
                        <div key={item.regime} className={`p-2 rounded border text-center ${item.color}`}>
                          <div className="text-[10px] font-semibold">{item.regime}</div>
                          <div className="text-sm font-bold text-primary my-0.5">{item.ratio}</div>
                          <div className="text-[9px] text-muted-foreground">{item.note}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 维度10: 止损纪律 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-red-50/50 to-orange-50/50 dark:from-red-950/10 dark:to-orange-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300">10</Badge>
                    <span className="text-xs font-bold">止损纪律 — 做T的最后一道防线</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">风控贡献 3%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>做T最大的敌人不是看错方向，而是看错后不止损。系统已内置止损信号（黄色菱形标记），触发时必须执行。</p>
                    <div className="bg-muted/50 rounded p-2 mt-1 space-y-1.5">
                      <div className="text-[10px] font-semibold text-foreground/80">止损触发条件：</div>
                      <ul className="space-y-0.5 text-[9px]">
                        <li>• 正T卖出后价格涨幅超过1.5% → 止损（买回），承认卖飞</li>
                        <li>• 反T买入后价格跌幅超过1.5% → 止损（卖出加仓），承认做反</li>
                        <li>• 日内亏损达到总持仓的0.5% → 停止当日所有做T操作</li>
                      </ul>
                      <div className="text-[9px] text-red-500 dark:text-red-400 flex items-start gap-1 mt-1">
                        <span className="shrink-0 mt-px">🚫</span>
                        <span>绝对禁止：亏损后加大仓位"摊薄成本"、扛单过夜、"这次一定对"的侥幸心理。做T是概率游戏，止损是保命符。</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 综合胜率公式 */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">综合胜率提升公式</span>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                    <div className="bg-card rounded px-3 py-2 border border-border">
                      <code className="text-[10px] font-mono leading-relaxed">
                        做T胜率 = 基础胜率(50%) × (1 + Σ(维度贡献率))
                      </code>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
                      <div className="flex items-start gap-2 p-2 rounded bg-cyan-50 dark:bg-cyan-950/20 border border-cyan-100 dark:border-cyan-900/30">
                        <span className="text-cyan-500 font-bold shrink-0">单维度使用</span>
                        <span className="text-muted-foreground">例如只用VWAP回归 → 胜率 = 50% × (1 + 20%) = 60%</span>
                      </div>
                      <div className="flex items-start gap-2 p-2 rounded bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
                        <span className="text-emerald-500 font-bold shrink-0">五维度叠加</span>
                        <span className="text-muted-foreground">VWAP+量价+大盘+时段+MACD → 胜率 = 50% × (1 + 70%) = 85%</span>
                      </div>
                      <div className="flex items-start gap-2 p-2 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30">
                        <span className="text-amber-500 font-bold shrink-0">全维度叠加</span>
                        <span className="text-muted-foreground">10维度全部满足 → 理论胜率可达90%+（但触发极少）</span>
                      </div>
                      <div className="flex items-start gap-2 p-2 rounded bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30">
                        <span className="text-red-500 font-bold shrink-0">实际建议</span>
                        <span className="text-muted-foreground">追求5-6维度叠加即可，胜率75-80%，操作频率适中</span>
                      </div>
                    </div>
                    <div className="text-[9px] text-muted-foreground flex items-start gap-1 mt-1">
                      <span className="shrink-0 mt-px">📌</span>
                      <span>注意：维度之间并非完全独立，实际叠加效果会有边际递减。以上公式仅为概念性说明，真实胜率需根据个股特性和市场环境动态评估。</span>
                    </div>
                  </div>
                </div>

                {/* 做T Checklist */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">做T前快速检查清单</span>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
                    {[
                      { check: "大盘趋势是否确认？", desc: "震荡/上升可做T，下跌仅正T卖出", ok: "✅" },
                      { check: "当前VWAP偏离度是否合适？", desc: "偏离VWAP 1%以上才有做T空间", ok: "✅" },
                      { check: "量价是否配合？", desc: "操作方向需与放量方向一致", ok: "✅" },
                      { check: "是否在合适的时间窗口？", desc: "10:00-10:30卖出，10:30-11:30低吸", ok: "✅" },
                      { check: "信号是否≥2个因子确认？", desc: "弱信号不做，至少中等强度", ok: "✅" },
                      { check: "仓位是否在控制范围内？", desc: "震荡市30-40%，下跌10-15%", ok: "✅" },
                      { check: "止损位是否已设定？", desc: "做T前先想好错了怎么办", ok: "✅" },
                    ].map((item, i) => (
                      <div key={i} className="flex items-start gap-2 text-[10px] p-1.5 rounded bg-card border border-border">
                        <span className="shrink-0">{item.ok}</span>
                        <span className="font-semibold text-foreground/80 shrink-0">{item.check}</span>
                        <span className="text-muted-foreground">— {item.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── 进阶维度分隔 ── */}
                <div className="pt-2">
                  <div className="p-3 rounded-lg border border-dashed border-cyan-300 dark:border-cyan-700 bg-gradient-to-r from-cyan-50/60 to-sky-50/60 dark:from-cyan-950/20 dark:to-sky-950/20">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="h-4 w-4 text-cyan-500" />
                      <span className="text-sm font-bold">进阶维度 — 从60%到80%的关键跳板</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      以上10个基础维度是做T的"必修课"，以下进阶维度则决定了你能否从"偶尔赚钱"升级为"稳定盈利"。进阶维度更注重<strong className="text-foreground/80">跨市场联动</strong>、<strong className="text-foreground/80">个股特性</strong>和<strong className="text-foreground/80">行为规律</strong>的深度利用。
                    </div>
                  </div>
                </div>

                {/* 维度11: 板块联动 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-sky-50/50 to-blue-50/50 dark:from-sky-950/10 dark:to-blue-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300">11</Badge>
                    <span className="text-xs font-bold">板块联动 — 跟着板块风向走</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">胜率贡献 8%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>个股不是孤立的，同一板块的股票往往同涨同跌。当板块整体启动时，个股做T的胜率显著提升；当板块退潮时，即使个股信号好看也要谨慎。</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                      <div className="p-2 rounded bg-card border border-border space-y-1.5">
                        <div className="font-semibold text-foreground/80 text-[10px]">板块信号确认 ✅</div>
                        <ul className="space-y-0.5 text-[9px]">
                          <li>• <span className="text-red-500 font-semibold">板块集体拉升</span> → 龙头不倒可做正T卖出</li>
                          <li>• <span className="text-green-500 font-semibold">板块集体回调</span> → 跌到位后可做正T买回</li>
                          <li>• <span className="text-red-500 font-semibold">板块龙头涨停</span> → 跟风股冲高是卖出时机</li>
                          <li>• <span className="text-green-500 font-semibold">板块利空出尽</span> → 恐慌低点可低吸</li>
                        </ul>
                      </div>
                      <div className="p-2 rounded bg-card border border-border space-y-1.5">
                        <div className="font-semibold text-red-500 text-[10px]">板块背离危险 ⚠️</div>
                        <ul className="space-y-0.5 text-[9px]">
                          <li>• <span className="font-semibold">板块下跌+个股独涨</span> → 补跌风险大，不做反T</li>
                          <li>• <span className="font-semibold">板块上涨+个股独跌</span> → 个股问题，不抄底</li>
                          <li>• <span className="font-semibold">板块轮动切换</span> → 前期热点退潮时减少做T</li>
                          <li>• <span className="font-semibold">冷门板块突然异动</span> → 多为一日游，不追高</li>
                        </ul>
                      </div>
                    </div>
                    <div className="text-[9px] text-amber-600 dark:text-amber-400 flex items-start gap-1 mt-1">
                      <span className="shrink-0 mt-px">💡</span>
                      <span>实操技巧：做T前先看同板块3-5只核心股的分时走势，如果方向一致则信号可信度+20%；如果出现分化则降低仓位或放弃操作。</span>
                    </div>
                  </div>
                </div>

                {/* 维度12: 竞价预判 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-amber-50/50 to-yellow-50/50 dark:from-amber-950/10 dark:to-yellow-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300">12</Badge>
                    <span className="text-xs font-bold">竞价预判 — 开盘前的第一手情报</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">胜率贡献 5%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>A股9:15-9:25的集合竞价蕴含了大量信息。竞价高开/低开的幅度和量能，往往预示了开盘后30分钟的方向。</p>
                    <div className="bg-muted/50 rounded p-2 mt-1 space-y-1.5">
                      <div className="text-[10px] font-semibold text-foreground/80 mb-1">竞价信号解读表：</div>
                      <div className="space-y-1">
                        <div className="flex items-start gap-2 text-[9px] p-1.5 rounded bg-red-50 dark:bg-red-950/20">
                          <span className="text-red-500 font-bold shrink-0 w-16">高开1%+</span>
                          <span className="text-muted-foreground">多头强势 → 开盘冲高是正T卖出窗口，注意10:00前后的冲高回落</span>
                        </div>
                        <div className="flex items-start gap-2 text-[9px] p-1.5 rounded bg-green-50 dark:bg-green-950/20">
                          <span className="text-green-500 font-bold shrink-0 w-16">低开1%+</span>
                          <span className="text-muted-foreground">空头强势 → 开盘杀跌是正T买回窗口，等10:00前后止跌再操作</span>
                        </div>
                        <div className="flex items-start gap-2 text-[9px] p-1.5 rounded bg-blue-50 dark:bg-blue-950/20">
                          <span className="text-blue-500 font-bold shrink-0 w-16">平开±0.3%</span>
                          <span className="text-muted-foreground">方向不明 → 等10:00后确认方向再做T，开盘不急操作</span>
                        </div>
                        <div className="flex items-start gap-2 text-[9px] p-1.5 rounded bg-purple-50 dark:bg-purple-950/20">
                          <span className="text-purple-500 font-bold shrink-0 w-16">竞价放量</span>
                          <span className="text-muted-foreground">竞价量是前日1.5倍+ → 开盘波动大，做T空间大但风险也大</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 维度13: 资金流向 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-emerald-50/50 to-cyan-50/50 dark:from-emerald-950/10 dark:to-cyan-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300">13</Badge>
                    <span className="text-xs font-bold">资金流向 — 跟着聪明钱走</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">胜率贡献 7%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>主力资金的进出方向是判断个股短期走势的核心依据。做T时如果资金方向与操作方向一致，胜率大幅提升。</p>
                    <div className="bg-muted/50 rounded p-2 mt-1 space-y-1.5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[9px]">
                        <div className="p-2 rounded bg-card border border-border">
                          <div className="font-semibold text-red-500 mb-1">主力净流入 + 正T卖出</div>
                          <span className="text-muted-foreground">主力在买你却卖？→ 不用怕，主力吸筹说明底部有支撑，卖出后回调概率大，能买回来</span>
                        </div>
                        <div className="p-2 rounded bg-card border border-border">
                          <div className="font-semibold text-green-500 mb-1">主力净流出 + 正T买回</div>
                          <span className="text-muted-foreground">主力在卖你却买？→ 危险！主力出货时低吸容易被套，应等主力流出放缓再操作</span>
                        </div>
                        <div className="p-2 rounded bg-card border border-border">
                          <div className="font-semibold text-blue-500 mb-1">北向资金持续流入</div>
                          <span className="text-muted-foreground">外资看好 → 正T安全边际高，卖飞概率低，可适当增加T仓</span>
                        </div>
                        <div className="p-2 rounded bg-card border border-border">
                          <div className="font-semibold text-amber-500 mb-1">北向资金持续流出</div>
                          <span className="text-muted-foreground">外资看空 → 减少做T频率，仅做正T卖出，不做反T加仓</span>
                        </div>
                      </div>
                      <div className="text-[9px] text-amber-600 dark:text-amber-400 flex items-start gap-1 mt-1">
                        <span className="shrink-0 mt-px">💡</span>
                        <span>核心原则：正T卖出的前提是"有人愿意高位接盘"（主力流入=有人接），正T买回的前提是"主力不再出货"（流出放缓=抛压减轻）。</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 维度14: 隔夜外盘影响 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-violet-50/50 to-purple-50/50 dark:from-violet-950/10 dark:to-purple-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300">14</Badge>
                    <span className="text-xs font-bold">隔夜外盘 — 全局视野下的方向预判</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">胜率贡献 5%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>A股开盘方向受隔夜外盘影响极大，特别是美股三大指数和A50期指。做T前了解外盘情况，可以提前预判开盘方向。</p>
                    <div className="bg-muted/50 rounded p-2 mt-1 space-y-1.5">
                      <div className="space-y-1">
                        <div className="flex items-start gap-2 text-[9px] p-1.5 rounded bg-red-50 dark:bg-red-950/20">
                          <span className="text-red-500 font-bold shrink-0 w-20">美股大涨+A50涨</span>
                          <span className="text-muted-foreground">A股高开概率90%+ → 开盘冲高做正T卖出</span>
                        </div>
                        <div className="flex items-start gap-2 text-[9px] p-1.5 rounded bg-green-50 dark:bg-green-950/20">
                          <span className="text-green-500 font-bold shrink-0 w-20">美股大跌+A50跌</span>
                          <span className="text-muted-foreground">A股低开概率90%+ → 等止跌做正T买回，开盘不追空</span>
                        </div>
                        <div className="flex items-start gap-2 text-[9px] p-1.5 rounded bg-amber-50 dark:bg-amber-950/20">
                          <span className="text-amber-500 font-bold shrink-0 w-20">美股跌+A50反弹</span>
                          <span className="text-muted-foreground">A股可能低开高走 → 低位可做正T买回</span>
                        </div>
                        <div className="flex items-start gap-2 text-[9px] p-1.5 rounded bg-blue-50 dark:bg-blue-950/20">
                          <span className="text-blue-500 font-bold shrink-0 w-20">外盘平静</span>
                          <span className="text-muted-foreground">A股按自身节奏走 → 以技术信号为主做T</span>
                        </div>
                      </div>
                      <div className="text-[9px] text-amber-600 dark:text-amber-400 flex items-start gap-1 mt-1">
                        <span className="shrink-0 mt-px">💡</span>
                        <span>关键时间点：A50期指在A股9:15竞价前已交易多时，其涨跌是最直接的A股开盘风向标。建议做T日先看A50走势再制定操作计划。</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 维度15: 个股波动率特性 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-lime-50/50 to-green-50/50 dark:from-lime-950/10 dark:to-green-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-lime-100 text-lime-700 border-lime-200 dark:bg-lime-950 dark:text-lime-300">15</Badge>
                    <span className="text-xs font-bold">个股波动率特性 — 选对股票做对T</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">胜率贡献 6%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>不是所有股票都适合做T。做T的前提是有足够的日内波动空间（振幅），波动率太低的股票做T成本都不够覆盖。</p>
                    <div className="bg-muted/50 rounded p-2 mt-1 space-y-1.5">
                      <div className="text-[10px] font-semibold text-foreground/80 mb-1">个股做T适配度评估：</div>
                      <div className="space-y-1.5">
                        {[
                          { label: "高波动股", range: "日均振幅>3%", examples: "科技/半导体/小盘成长", suitability: "★★★★★", note: "做T空间大，但止损要严格", color: "bg-red-50 dark:bg-red-950/20" },
                          { label: "中波动股", range: "日均振幅1.5-3%", examples: "白酒/新能源/医药", suitability: "★★★★☆", note: "做T首选，空间够且波动可控", color: "bg-emerald-50 dark:bg-emerald-950/20" },
                          { label: "低波动股", range: "日均振幅<1.5%", examples: "银行/公用事业/大盘蓝筹", suitability: "★★☆☆☆", note: "做T空间小，手续费占比高", color: "bg-amber-50 dark:bg-amber-950/20" },
                          { label: "涨停/跌停股", range: "一字板", examples: "停牌复牌/ST", suitability: "☆☆☆☆☆", note: "无法做T，流动性为零", color: "bg-gray-50 dark:bg-gray-950/20" },
                        ].map((item) => (
                          <div key={item.label} className={`flex items-center gap-2 text-[9px] p-1.5 rounded ${item.color}`}>
                            <span className="font-bold shrink-0 w-20 text-foreground/80">{item.label}</span>
                            <span className="text-muted-foreground shrink-0 w-28">{item.range}</span>
                            <span className="text-amber-500 shrink-0 w-16">{item.suitability}</span>
                            <span className="text-muted-foreground">{item.note}</span>
                          </div>
                        ))}
                      </div>
                      <div className="text-[9px] text-amber-600 dark:text-amber-400 flex items-start gap-1 mt-1">
                        <span className="shrink-0 mt-px">💡</span>
                        <span>做T选股公式：日均振幅 &gt; 1.5% + 日均成交额 &gt; 3亿 + 非ST + 流通市值 &gt; 100亿。满足以上条件的股票做T才有足够空间和流动性。</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 维度16: 连续做T衰减效应 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-rose-50/50 to-red-50/50 dark:from-rose-950/10 dark:to-red-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300">16</Badge>
                    <span className="text-xs font-bold">连续做T衰减 — 贪多必失的数学原理</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">风控贡献 4%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>日内做T存在明显的边际递减效应：第1次T胜率最高，第2次降低，第3次以后胜率急剧下降。这是因为每次T操作都在消耗日内波动空间。</p>
                    <div className="bg-muted/50 rounded p-2 mt-1 space-y-1.5">
                      <div className="text-[10px] font-semibold text-foreground/80 mb-1">日内做T次数与胜率关系：</div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-[9px]">
                          <span className="font-bold w-16 text-foreground/80">第1次T</span>
                          <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{width: "75%"}} />
                          </div>
                          <span className="text-emerald-600 font-bold w-12 text-right">~75%</span>
                        </div>
                        <div className="flex items-center gap-2 text-[9px]">
                          <span className="font-bold w-16 text-foreground/80">第2次T</span>
                          <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-amber-500 rounded-full" style={{width: "55%"}} />
                          </div>
                          <span className="text-amber-600 font-bold w-12 text-right">~55%</span>
                        </div>
                        <div className="flex items-center gap-2 text-[9px]">
                          <span className="font-bold w-16 text-foreground/80">第3次T</span>
                          <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-red-500 rounded-full" style={{width: "38%"}} />
                          </div>
                          <span className="text-red-600 font-bold w-12 text-right">~38%</span>
                        </div>
                        <div className="flex items-center gap-2 text-[9px]">
                          <span className="font-bold w-16 text-foreground/80">第4次T+</span>
                          <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-red-800 rounded-full" style={{width: "25%"}} />
                          </div>
                          <span className="text-red-800 font-bold w-12 text-right">&lt;25%</span>
                        </div>
                      </div>
                      <div className="text-[9px] text-red-500 dark:text-red-400 flex items-start gap-1 mt-1">
                        <span className="shrink-0 mt-px">⚠️</span>
                        <span>铁律：每日最多做2次T。第1次T是"吃鱼身"，第2次T是"吃鱼尾"，第3次以后就是"啃鱼刺"——容易扎嘴。做T不是高频交易，贪多必失。</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 维度17: 整数关口心理 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-teal-50/50 to-emerald-50/50 dark:from-teal-950/10 dark:to-emerald-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300">17</Badge>
                    <span className="text-xs font-bold">整数关口心理 — 价格的隐形引力</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">胜率贡献 3%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>A股投资者对整数关口（如10/20/50/100元）有强烈的心理预期。价格在整数关口附近往往出现犹豫、反复，做T时可利用这一规律。</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                      <div className="p-2 rounded bg-card border border-border space-y-1">
                        <div className="font-semibold text-foreground/80 text-[10px]">整数关口下方</div>
                        <ul className="space-y-0.5 text-[9px] text-muted-foreground">
                          <li>• 价格从下方接近整数位 → 抛压增大</li>
                          <li>• 正T卖出好时机（冲关失败概率高）</li>
                          <li>• 一旦突破整数位 → 短期加速上涨</li>
                        </ul>
                      </div>
                      <div className="p-2 rounded bg-card border border-border space-y-1">
                        <div className="font-semibold text-foreground/80 text-[10px]">整数关口上方</div>
                        <ul className="space-y-0.5 text-[9px] text-muted-foreground">
                          <li>• 价格从上方回踩整数位 → 买盘增多</li>
                          <li>• 正T买回好时机（支撑有效概率高）</li>
                          <li>• 一旦跌破整数位 → 短期加速下跌</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 维度18: 波动率周期 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-indigo-50/50 to-violet-50/50 dark:from-indigo-950/10 dark:to-violet-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300">18</Badge>
                    <span className="text-xs font-bold">波动率周期 — 收敛必扩张，扩张必收敛</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">胜率贡献 5%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>波动率存在周期性规律：极低波动之后必然出现大波动（方向选择），高波动之后必然回归低波动（震荡收敛）。这是做T择时的重要参考。</p>
                    <div className="bg-muted/50 rounded p-2 mt-1 space-y-1.5">
                      <div className="flex items-center gap-2 text-[9px]">
                        <div className="flex-1 flex items-center gap-1">
                          <span className="inline-block px-2 py-1 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-semibold">低波动收敛</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="inline-block px-2 py-1 rounded bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 font-semibold">方向选择</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="inline-block px-2 py-1 rounded bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 font-semibold">高波动扩张</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="inline-block px-2 py-1 rounded bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-semibold">回归收敛</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                        <div className="p-1.5 rounded bg-card border border-border text-[9px]">
                          <span className="font-semibold text-emerald-500">低波动期（横盘末期）</span>
                          <span className="text-muted-foreground ml-1">减少做T，等方向明确。突破方向出来后的第一次T胜率最高。</span>
                        </div>
                        <div className="p-1.5 rounded bg-card border border-border text-[9px]">
                          <span className="font-semibold text-red-500">高波动期（趋势中）</span>
                          <span className="text-muted-foreground ml-1">T空间大但方向明确，只做顺势T。波动率开始收窄时停止做T。</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 维度19: 尾盘信号 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-orange-50/50 to-amber-50/50 dark:from-orange-950/10 dark:to-amber-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300">19</Badge>
                    <span className="text-xs font-bold">尾盘信号 — 明日操作的前瞻指标</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">胜率贡献 4%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>14:30-15:00的尾盘走势包含重要的前瞻信息。尾盘的方向和强度往往预示次日开盘方向，可用于规划次日做T策略。</p>
                    <div className="bg-muted/50 rounded p-2 mt-1 space-y-1.5">
                      <div className="space-y-1">
                        <div className="flex items-start gap-2 text-[9px] p-1.5 rounded bg-red-50 dark:bg-red-950/20">
                          <span className="text-red-500 font-bold shrink-0 w-20">尾盘抢筹拉升</span>
                          <span className="text-muted-foreground">主力看好次日 → 次日高开概率大 → 提前规划正T卖出策略</span>
                        </div>
                        <div className="flex items-start gap-2 text-[9px] p-1.5 rounded bg-green-50 dark:bg-green-950/20">
                          <span className="text-green-500 font-bold shrink-0 w-20">尾盘放量杀跌</span>
                          <span className="text-muted-foreground">恐慌出逃 → 次日低开可能大 → 提前规划正T买回策略</span>
                        </div>
                        <div className="flex items-start gap-2 text-[9px] p-1.5 rounded bg-blue-50 dark:bg-blue-950/20">
                          <span className="text-blue-500 font-bold shrink-0 w-20">尾盘窄幅平收</span>
                          <span className="text-muted-foreground">方向不明 → 次日按信号操作，不预判方向</span>
                        </div>
                      </div>
                      <div className="text-[9px] text-amber-600 dark:text-amber-400 flex items-start gap-1 mt-1">
                        <span className="shrink-0 mt-px">💡</span>
                        <span>尾盘信号的核心价值：提前制定次日做T计划。有计划地做T比盘中临时决策胜率高20%以上。</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 维度20: 消息面过滤 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-gray-50/50 to-slate-50/50 dark:from-gray-950/10 dark:to-slate-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-950 dark:text-gray-300">20</Badge>
                    <span className="text-xs font-bold">消息面过滤 — 大事不做T，小事不慌张</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">风控贡献 3%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>重大消息（财报/政策/突发事件）会打破一切技术分析的假设。做T是基于"历史规律重演"的策略，而重大消息创造的是"前所未有的新局面"。</p>
                    <div className="bg-muted/50 rounded p-2 mt-1 space-y-1.5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="p-2 rounded border border-red-200 bg-red-50/50 dark:border-red-900/40 dark:bg-red-950/20">
                          <div className="text-[10px] font-bold text-red-500 mb-1">🚫 禁止做T的消息日</div>
                          <ul className="space-y-0.5 text-[9px] text-muted-foreground">
                            <li>• 个股财报发布日（业绩不确定性）</li>
                            <li>• 央行议息会议日（宏观不确定性）</li>
                            <li>• 重大政策发布窗口期</li>
                            <li>• 个股重大事项公告日</li>
                          </ul>
                        </div>
                        <div className="p-2 rounded border border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                          <div className="text-[10px] font-bold text-emerald-500 mb-1">✅ 消息消化后可做T</div>
                          <ul className="space-y-0.5 text-[9px] text-muted-foreground">
                            <li>• 利好消息高开低走 → 正T卖出窗口</li>
                            <li>• 利空消息低开高走 → 正T买回窗口</li>
                            <li>• 消息落地后波动率回归正常</li>
                            <li>• 市场过度反应后的修正行情</li>
                          </ul>
                        </div>
                      </div>
                      <div className="text-[9px] text-red-500 dark:text-red-400 flex items-start gap-1 mt-1">
                        <span className="shrink-0 mt-px">⚠️</span>
                        <span>核心原则：不确定时不做T。错过一次做T机会只是少赚，但在消息日做错T可能亏损数日的做T利润。宁可错过，不可做错。</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 进阶维度汇总 */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">20维全量胜率叠加</span>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                    <div className="bg-card rounded px-3 py-2 border border-border">
                      <code className="text-[10px] font-mono leading-relaxed">
                        基础10维(胜率85%) × 进阶10维加成 = 理论胜率上限 95%+
                      </code>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px]">
                      <div className="flex items-start gap-2 p-2 rounded bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
                        <span className="text-emerald-500 font-bold shrink-0">实操建议</span>
                        <span className="text-muted-foreground">基础10维是日常必检项，进阶10维在关键节点检查即可</span>
                      </div>
                      <div className="flex items-start gap-2 p-2 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30">
                        <span className="text-amber-500 font-bold shrink-0">高频检查</span>
                        <span className="text-muted-foreground">板块联动+资金流向+波动率特性，这3个进阶维度值得每次做T前确认</span>
                      </div>
                      <div className="flex items-start gap-2 p-2 rounded bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30">
                        <span className="text-red-500 font-bold shrink-0">低频检查</span>
                        <span className="text-muted-foreground">竞价预判+外盘+消息面，这3个维度每天开盘前检查一次即可</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Tab: 自定义因子 ── */}
            {activeTab === "customfactors" && (
              <CustomFactorsTab />
            )}

            {/* ── Tab: 资讯原理 ── */}
            {activeTab === "newsprinciple" && (
              <div className="space-y-4">
                {/* Header */}
                <div className="p-4 rounded-lg border border-border bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Newspaper className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <h3 className="text-base font-bold">资讯分析原理</h3>
                    <Badge variant="outline" className="text-[10px] h-5">v1.0</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    资讯分析模块通过多渠道、多维度搜索与AI深度分析，为做T操作提供消息面参考。系统自动聚合宏观政策、资金流向、外盘影响、技术分析等多个维度的资讯，结合全文深度阅读和LLM推理，输出走势预判（11:30前为今日预判，11:30后为明日预判）。
                  </p>
                </div>

                {/* Section 1: 多渠道搜索架构 */}
                <div className="rounded-lg border border-border/50 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-bold">1</span>
                    <h4 className="text-sm font-semibold">多渠道并行搜索架构</h4>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                    传统单一搜索容易遗漏关键信息。本系统采用<strong>4维度×3类型=12路并行搜索</strong>策略，确保资讯覆盖的全面性。
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {/* 大盘 */}
                    <div className="rounded-md border border-red-500/20 bg-red-500/5 p-3">
                      <div className="text-xs font-bold text-red-600 dark:text-red-400 mb-2">📈 大盘分析</div>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[11px] text-foreground/70">
                          <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-red-400" />宏观政策（央行/财政）
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-foreground/70">
                          <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-red-400" />资金流向（北向/融资融券）
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-foreground/70">
                          <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-red-400" />外盘影响（美股/纳斯达克）
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-foreground/70">
                          <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-red-400" />技术分析（支撑/压力位）
                        </div>
                      </div>
                    </div>
                    {/* 板块 */}
                    <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
                      <div className="text-xs font-bold text-amber-600 dark:text-amber-400 mb-2">🏭 板块分析</div>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[11px] text-foreground/70">
                          <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400" />行业政策（利好/利空）
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-foreground/70">
                          <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400" />板块资金（主力/龙头）
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-foreground/70">
                          <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400" />技术形态（走势预测）
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-foreground/70">
                          <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400" />关联市场（产业链/商品）
                        </div>
                      </div>
                    </div>
                    {/* 个股 */}
                    <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
                      <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mb-2">📊 个股分析</div>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[11px] text-foreground/70">
                          <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-400" />公司资讯（公告/新闻）
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-foreground/70">
                          <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-400" />研报评级（券商/目标价）
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-foreground/70">
                          <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-400" />技术分析（支撑/压力）
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-foreground/70">
                          <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-400" />资金动向（龙虎榜/大宗）
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 2: 深度阅读 */}
                <div className="rounded-lg border border-border/50 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 text-xs font-bold">2</span>
                    <h4 className="text-sm font-semibold">全文深度阅读（Web Reader）</h4>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                    仅依赖搜索摘要（snippet）容易丢失关键细节。系统对Top 2高相关性文章自动读取<strong>全文内容</strong>，提取纯文本后作为LLM分析的核心素材。
                  </p>
                  <div className="flex items-center gap-3 text-[11px]">
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-muted/30">
                      <span className="text-muted-foreground">搜索结果</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-medium">Top 2 文章</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-muted/30">
                      <span className="font-medium">page_reader</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-medium">HTML → 纯文本</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-muted/30">
                      <span className="font-medium">截取前1500字</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-medium">LLM深度分析</span>
                    </div>
                  </div>
                </div>

                {/* Section 3: 来源分类 */}
                <div className="rounded-lg border border-border/50 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 text-xs font-bold">3</span>
                    <h4 className="text-sm font-semibold">资讯来源自动分类</h4>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                    系统根据域名自动识别资讯来源类型，帮助判断信息可信度。不同来源的可信度权重不同，券商研报 &gt; 财经媒体 &gt; 政策公告 &gt; 外媒 &gt; 投资社区 &gt; 综合资讯。
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-purple-500/5 border border-purple-500/20">
                      <span className="shrink-0 w-2 h-2 rounded-full bg-purple-500" />
                      <div>
                        <div className="text-[11px] font-medium">券商研报</div>
                        <div className="text-[10px] text-muted-foreground">东方财富、同花顺</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-blue-500/5 border border-blue-500/20">
                      <span className="shrink-0 w-2 h-2 rounded-full bg-blue-500" />
                      <div>
                        <div className="text-[11px] font-medium">财经媒体</div>
                        <div className="text-[10px] text-muted-foreground">新浪、财新、第一财经</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-red-500/5 border border-red-500/20">
                      <span className="shrink-0 w-2 h-2 rounded-full bg-red-500" />
                      <div>
                        <div className="text-[11px] font-medium">政策公告</div>
                        <div className="text-[10px] text-muted-foreground">国务院、证监会、央行</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-cyan-500/5 border border-cyan-500/20">
                      <span className="shrink-0 w-2 h-2 rounded-full bg-cyan-500" />
                      <div>
                        <div className="text-[11px] font-medium">投资社区</div>
                        <div className="text-[10px] text-muted-foreground">雪球、股吧</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-amber-500/5 border border-amber-500/20">
                      <span className="shrink-0 w-2 h-2 rounded-full bg-amber-500" />
                      <div>
                        <div className="text-[11px] font-medium">外媒</div>
                        <div className="text-[10px] text-muted-foreground">路透社、彭博、CNBC</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-gray-500/5 border border-gray-500/20">
                      <span className="shrink-0 w-2 h-2 rounded-full bg-gray-500" />
                      <div>
                        <div className="text-[11px] font-medium">综合资讯</div>
                        <div className="text-[10px] text-muted-foreground">其他来源</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 4: AI分析流程 */}
                <div className="rounded-lg border border-border/50 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 text-xs font-bold">4</span>
                    <h4 className="text-sm font-semibold">AI多维度分析流程</h4>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                    LLM基于多渠道、全文深度阅读的内容，从<strong>四个维度</strong>进行全方位评估，输出结构化分析结果。
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-start gap-3 p-2.5 rounded-md bg-muted/10">
                      <span className="text-base shrink-0">📊</span>
                      <div>
                        <div className="text-xs font-medium">技术面分析</div>
                        <div className="text-[11px] text-muted-foreground">支撑位/压力位、K线形态、均线趋势、MACD/KDJ等技术指标信号</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-2.5 rounded-md bg-muted/10">
                      <span className="text-base shrink-0">💰</span>
                      <div>
                        <div className="text-xs font-medium">资金面分析</div>
                        <div className="text-[11px] text-muted-foreground">北向资金流向、主力资金进出、融资融券变化、大宗交易数据</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-2.5 rounded-md bg-muted/10">
                      <span className="text-base shrink-0">📜</span>
                      <div>
                        <div className="text-xs font-medium">政策/消息面分析</div>
                        <div className="text-[11px] text-muted-foreground">宏观政策、行业政策、公司公告、券商研报评级调整</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-2.5 rounded-md bg-muted/10">
                      <span className="text-base shrink-0">🎭</span>
                      <div>
                        <div className="text-xs font-medium">情绪面分析</div>
                        <div className="text-[11px] text-muted-foreground">市场恐慌/贪婪指数、投资者情绪、舆论风向、板块轮动情绪</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 5: 输出字段说明 */}
                <div className="rounded-lg border border-border/50 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-bold">5</span>
                    <h4 className="text-sm font-semibold">分析输出字段说明</h4>
                  </div>
                  <div className="space-y-2">
                    {[
                      { field: "trend", label: "走势预判", values: "上升 / 下降 / 震荡", desc: "综合四维分析得出的方向性判断（11:30前为今日预判，11:30后为明日预判）" },
                      { field: "confidence", label: "信心度", values: "1-100", desc: "对趋势判断的信心程度，≥70高信心，40-70中等，<40低信心" },
                      { field: "riskLevel", label: "风险等级", values: "高 / 中 / 低", desc: "操作风险评级，高=建议谨慎，低=相对安全" },
                      { field: "newsSentiment", label: "资讯情绪", values: "偏多🔺 / 偏空🔻 / 中性↔️", desc: "整体资讯面偏向看涨还是看跌" },
                      { field: "suggestion", label: "做T建议", values: "正T / 反T / 观望", desc: "基于趋势预判给出的具体做T方向建议" },
                      { field: "keyFactors", label: "关键因素", values: "3-5个", desc: "影响走势的核心驱动因素列表" },
                      { field: "technicalView", label: "技术面观点", values: "30字以内", desc: "技术面维度的独立判断摘要" },
                      { field: "capitalView", label: "资金面观点", values: "30字以内", desc: "资金面维度的独立判断摘要" },
                      { field: "policyView", label: "政策/消息面观点", values: "30字以内", desc: "政策消息面维度的独立判断摘要" },
                      { field: "sentimentView", label: "情绪面观点", values: "30字以内", desc: "市场情绪面维度的独立判断摘要" },
                      { field: "detailedReasoning", label: "详细推理", values: "200字以内", desc: "四维分析的完整推理过程，可展开查看" },
                    ].map((item, i) => (
                      <div key={i} className="flex items-start gap-3 p-2 rounded-md bg-muted/5 hover:bg-muted/15 transition-colors">
                        <code className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-muted/30 font-mono text-foreground/70">{item.field}</code>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium">{item.label}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground">{item.values}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{item.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section 6: 缓存策略 */}
                <div className="rounded-lg border border-border/50 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 text-xs font-bold">6</span>
                    <h4 className="text-sm font-semibold">缓存与更新策略</h4>
                  </div>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-teal-400" />
                      <span>缓存有效期：<strong className="text-foreground/80">10分钟</strong>，过期后需手动刷新</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-teal-400" />
                      <span>搜索时效：最近<strong className="text-foreground/80">2天</strong>内的资讯（recency_days=2）</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-teal-400" />
                      <span>去重策略：按URL去重，避免不同维度搜索结果重复</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-teal-400" />
                      <span>排序规则：按发布时间倒序，取最新Top 10条</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-teal-400" />
                      <span>深度阅读：仅对Top 2文章读取全文，平衡效率与深度</span>
                    </div>
                  </div>
                </div>

                {/* Section 7: 使用建议 */}
                <div className="rounded-lg border border-border/50 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 text-xs font-bold">7</span>
                    <h4 className="text-sm font-semibold">使用建议与风险提示</h4>
                  </div>
                  <div className="space-y-3">
                    <div className="p-3 rounded-md bg-red-500/5 border border-red-500/20">
                      <div className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">⚠️ 重要提示</div>
                      <div className="text-[11px] text-muted-foreground leading-relaxed">
                        资讯分析结果<strong>仅供参考</strong>，不构成投资建议。AI分析基于公开资讯和模型推理，可能存在偏差或遗漏。投资者应结合自身判断做出决策。
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {[
                        "多维度交叉验证：当技术面和资金面方向一致时，预判可靠性更高",
                        "关注信心度：信心度≥70的分析更值得关注，<40的建议谨慎参考",
                        "注意风险等级：高风险情况下即使趋势看涨也应控制仓位",
                        "收盘后刷新：收盘后资讯更全面，分析结果更准确",
                        "结合做T指数：资讯分析与做T指数、信号系统综合使用效果更佳",
                        "警惕单一来源：仅依赖一类渠道的资讯容易出现偏差",
                      ].map((tip, i) => (
                        <div key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                          <span className="shrink-0 mt-0.5 text-yellow-500">•</span>
                          <span>{tip}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Loading state */}
            {loading && !strategyData && (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                加载策略数据...
              </div>
            )}
          </Tabs>
        </CardContent>
      )}
    </Card>
  );
}
