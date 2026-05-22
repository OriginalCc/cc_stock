// ── Shared types, constants, and helpers for chart components ──
// Extracted from page.tsx to reduce memory footprint

import type { TimelineItem } from "@/hooks/use-stock-data";
import type { FactorOverride, RegimeDetail, Strength, CustomFactorDefinition as EngineCustomFactorDefinition } from "@/lib/t-strategy";
import { generateTimelineSignals as generateOptimizedSignals } from "@/lib/t-strategy";
import { calculateMACD } from "@/lib/indicators";

// ── Types ──────────────────────────────────────────────

export interface TSignal {
  type: "buy" | "sell" | "stoploss";
  reason: string;
  strength: "strong" | "medium" | "weak";
  tMode?: string;
  timeWindow?: string;
  description?: string;
  strengthOverridden?: boolean; // 用户在策略面板中显式覆盖了强度，合并时不可被升级
}

export interface MergedSignal {
  id: string;
  x: number;
  y: number;
  type: "buy" | "sell" | "stoploss";
  reasons: string[];
  strength: Strength;
  count: number;
  originalIndex: number;
  direction: "up" | "down";
  isCustom?: boolean;
  customReasons?: Set<string>;
  hasOverriddenStrength?: boolean; // 合并组中有用户覆盖强度的信号，不可被升级
}

export interface PulseVolumeMarker {
  time: string;
  type: "pulse" | "volume_surge" | "progressive_vol" | "pulse_decline" | "volume_decline";
  score: number;
  label: string;
  detail: string;
  amount: number; // 成交金额（元），成交量(手) × 价格 × 100
}

export type IndexKey = "sz" | "sh" | "cyb";

export interface CustomFactorCondition {
  key: string;
  label: string;
  description: string;
  category: "price" | "volume" | "indicator" | "trend" | "time" | "pattern";
}

export interface CustomFactorDefinition {
  id: string;
  name: string;
  description: string;
  signalType: "buy" | "sell";
  tMode: "正T" | "反T";
  strength: "strong" | "medium" | "weak";
  conditions: CustomFactorCondition[];
  enabled: boolean;
  isBuiltIn: boolean;
  dataSource: "分时线";
}

export interface StrategyData {
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
  dbFactors?: any[];
  dbLogicSteps?: any[];
}

// ── Constants ─────────────────────────────────────────

export const INTERVALS: { value: string; label: string }[] = [
  { value: "5m", label: "5分" },
  { value: "15m", label: "15分" },
  { value: "30m", label: "30分" },
  { value: "1h", label: "60分" },
  { value: "1d", label: "日线" },
  { value: "1wk", label: "周线" },
];

export const DEFAULT_ASHARES = [
  { symbol: "600519", name: "贵州茅台" },
  { symbol: "000858", name: "五粮液" },
  { symbol: "601318", name: "中国平安" },
  { symbol: "002594", name: "比亚迪" },
  { symbol: "300750", name: "宁德时代" },
  { symbol: "600036", name: "招商银行" },
  { symbol: "000333", name: "美的集团" },
  { symbol: "601899", name: "紫金矿业" },
];

export const INDEX_CONFIG: Record<IndexKey, { symbol: string; label: string; shortLabel: string }> = {
  sz:  { symbol: "399001",    label: "深证成指", shortLabel: "深" },
  sh:  { symbol: "000001.SS", label: "上证指数", shortLabel: "沪" },
  cyb: { symbol: "399006",    label: "创业板指", shortLabel: "创" },
};
export const INDEX_KEYS: IndexKey[] = ["sz", "sh", "cyb"];

export const REGIME_CONFIG: Record<string, { bg: string; text: string; icon: string }> = {
  "上升通道": { bg: "bg-red-600/20 border-red-600/40", text: "text-red-700 dark:text-red-300", icon: "↑" },
  "下跌趋势": { bg: "bg-green-600/20 border-green-600/40", text: "text-green-700 dark:text-green-300", icon: "↓" },
  "震荡市":   { bg: "bg-emerald-600/20 border-emerald-600/40", text: "text-emerald-700 dark:text-emerald-300", icon: "↔" },
  "横盘末期": { bg: "bg-yellow-600/20 border-yellow-600/40", text: "text-yellow-700 dark:text-yellow-300", icon: "→" },
};

export const T_MODE_CONFIG: Record<string, { label: string; bg: string; text: string; tip: string }> = {
  "上升通道": { label: "正T/反T(先卖再买)", bg: "bg-orange-500/10 border-orange-500/25", text: "text-orange-600 dark:text-orange-400", tip: "偏强市场：正T为主（冲高卖出→回落买回），也可反T(先卖再买)（低吸→冲高卖出），T仓≤20%，买回要快" },
  "下跌趋势": { label: "仅正T", bg: "bg-red-500/10 border-red-500/25", text: "text-red-600 dark:text-red-400", tip: "偏弱市场：仅正T卖出（冲高卖出→回落买回），不做反T(先卖再买)，T仓≤15%，严格止损" },
  "震荡市":   { label: "正T", bg: "bg-blue-500/10 border-blue-500/25", text: "text-blue-600 dark:text-blue-400", tip: "震荡行情：最适合做正T（高抛低吸），T仓30-40%，差价≥1.5%再操作" },
  "横盘末期": { label: "观望", bg: "bg-gray-500/10 border-gray-500/25", text: "text-gray-600 dark:text-gray-400", tip: "方向不明：减少做T频率，等待趋势突破再操作" },
};

export const SIGNAL_PULSE_CSS = `
@keyframes signalPulse {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.3); opacity: 0.7; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes flashBorder {
  0% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
  50% { box-shadow: 0 0 12px 4px rgba(239,68,68,0.3); }
  100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
}
@keyframes flashBorderGreen {
  0% { box-shadow: 0 0 0 0 rgba(34,197,94,0.5); }
  50% { box-shadow: 0 0 12px 4px rgba(34,197,94,0.3); }
  100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
}
.animate-signal-pulse { animation: signalPulse 1.2s ease-in-out infinite; }
.animate-flash-red { animation: flashBorder 0.8s ease-out; }
.animate-flash-green { animation: flashBorderGreen 0.8s ease-out; }
`;

// ── Custom Factor Constants ───────────────────────────

export const CONDITION_LIBRARY: CustomFactorCondition[] = [
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
];

export const BUILT_IN_CUSTOM_FACTORS: CustomFactorDefinition[] = [
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

export const CUSTOM_FACTORS_STORAGE_KEY = "customFactors_v1";

// ── Helper Functions ──────────────────────────────────

export function formatNum(num: number, digits: number = 2) {
  if (!num && num !== 0) return "--";
  const fixed = num.toFixed(digits);
  if (digits === 0) return fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const [intPart, decPart] = fixed.split(".");
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${intFormatted}.${decPart}`;
}

export function formatVolume(vol: number) {
  if (!vol) return "--";
  if (vol >= 1e8) return (vol / 1e8).toFixed(2) + "亿";
  if (vol >= 1e4) return (vol / 1e4).toFixed(2) + "万";
  return vol.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatAmount(amount: number) {
  if (!amount) return "--";
  if (amount >= 1e8) return (amount / 1e8).toFixed(2) + "亿";
  if (amount >= 1e4) return (amount / 1e4).toFixed(2) + "万";
  return amount.toLocaleString();
}

export function formatMarketCap(val: number) {
  if (!val) return "--";
  if (val >= 1e12) return (val / 1e12).toFixed(2) + "万亿";
  if (val >= 1e8) return (val / 1e8).toFixed(2) + "亿";
  if (val >= 1e4) return (val / 1e4).toFixed(2) + "万";
  return val.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// ── Signal Alert Sound (Web Audio API) ─────────────────
let _audioCtx: AudioContext | null = null;
const getAudioContext = () => {
  if (!_audioCtx) _audioCtx = new AudioContext();
  return _audioCtx;
};
export const playAlertSound = (type: 'buy' | 'sell' | 'stoploss') => {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = type === 'buy' ? 880 : type === 'sell' ? 660 : 440;
    osc.type = type === 'stoploss' ? 'sawtooth' : 'sine';
    gain.gain.value = 0.3;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.stop(ctx.currentTime + 0.35);
  } catch {}
};

// ── T-Index Color Helpers ──────────────────────────────
export function getTIndexColor(score: number): string {
  if (score <= 30) return '#ef4444';
  if (score <= 50) return '#f97316';
  if (score <= 70) return '#84cc16';
  return '#22c55e';
}

export function getTIndexLabel(score: number): string {
  if (score <= 30) return '卖出区域';
  if (score <= 50) return '观望';
  if (score <= 70) return '可以做T';
  return '优质做T机会';
}

export function getTIndexLabelColor(score: number): string {
  if (score <= 30) return 'text-red-500';
  if (score <= 50) return 'text-orange-500';
  if (score <= 70) return 'text-lime-500';
  return 'text-green-500';
}

// ── Strength label helper ──────────────────────────────

export function getStrengthLabel(strength: "strong" | "medium" | "weak"): string {
  switch (strength) {
    case "strong": return "强";
    case "medium": return "中";
    case "weak": return "弱";
  }
}

export function getStrengthColor(strength: "strong" | "medium" | "weak"): string {
  switch (strength) {
    case "strong": return "#dc2626";
    case "medium": return "#f59e0b";
    case "weak": return "#9ca3af";
  }
}

// ── 做 T Signal Generation for Timeline ──────────────

export function generateTimelineSignals(
  timeline: TimelineItem[],
  macdData: { time: string; dif: number | null; dea: number | null; macd: number | null }[],
  prevClose: number,
  factorOverrides?: FactorOverride[],
  indexRegime?: RegimeDetail | null,
  customFactors?: CustomFactorDefinition[],
): (TSignal | null)[] {
  const engineCustomFactors: EngineCustomFactorDefinition[] | undefined = customFactors?.map(f => ({
    id: f.id,
    name: f.name,
    description: f.description,
    signalType: f.signalType,
    tMode: f.tMode,
    strength: f.strength,
    conditions: f.conditions.map(c => ({
      key: c.key,
      label: c.label,
      description: c.description,
      category: c.category,
    })),
    enabled: f.enabled,
    isBuiltIn: f.isBuiltIn,
    dataSource: f.dataSource as "分时线",
  }));

  const optimizedSignals = generateOptimizedSignals(timeline, macdData, prevClose, undefined, factorOverrides, indexRegime, engineCustomFactors);

  return optimizedSignals.map(s => {
    if (!s) return null;
    return {
      type: s.type,
      reason: s.reason,
      strength: s.strength,
      tMode: s.tMode,
      timeWindow: s.timeWindow,
      description: s.description,
      strengthOverridden: s.strengthOverridden,
    };
  });
}

// ── Pulse/Volume Surge Detection for Timeline Chart ──────

export function pvParseTime(timeStr: string): number {
  const parts = timeStr.split(":");
  if (parts.length !== 2) return 570;
  return (parseInt(parts[0]) || 9) * 60 + (parseInt(parts[1]) || 30);
}

export function detectPulseVolumeMarkers(
  timeline: TimelineItem[],
  prevClose: number,
  timeStart: string = "09:30",
  timeEnd: string = "15:00",
): PulseVolumeMarker[] {
  if (!timeline || timeline.length < 10 || prevClose <= 0) return [];

  const markers: PulseVolumeMarker[] = [];
  const startMin = pvParseTime(timeStart);
  const endMin = pvParseTime(timeEnd);

  const session = timeline.filter(t => {
    const totalMin = pvParseTime(t.time);
    return totalMin >= startMin && totalMin <= endMin;
  });

  if (session.length < 5) return [];

  // ── Pulse Surge Detection ──
  {
    let maxSurgeRate = 0;
    let surgeStartIdx = 0;
    let surgeEndIdx = 0;
    const windowSize = 5;

    for (let i = 0; i <= session.length - windowSize; i++) {
      const startPrice = session[i].price;
      const endPrice = session[i + windowSize - 1].price;
      if (startPrice <= 0) continue;
      const surgeRate = ((endPrice - startPrice) / startPrice) * 100;
      if (surgeRate > maxSurgeRate) {
        maxSurgeRate = surgeRate;
        surgeStartIdx = i;
        surgeEndIdx = i + windowSize - 1;
      }
    }

    const openPrice = session[0].price;
    const sessionHigh = Math.max(...session.map(t => t.price));
    const openToHighRate = openPrice > 0 ? ((sessionHigh - openPrice) / openPrice) * 100 : 0;

    let peakIdx = 0;
    let peakPrice = 0;
    for (let i = 0; i < session.length; i++) {
      if (session[i].price > peakPrice) {
        peakPrice = session[i].price;
        peakIdx = i;
      }
    }
    const lastPrice = session[session.length - 1].price;
    const pullbackRate = peakPrice > 0 ? ((peakPrice - lastPrice) / peakPrice) * 100 : 0;

    const avgVol = session.reduce((sum, t) => sum + t.volume, 0) / session.length;
    const peakVol = session[peakIdx]?.volume || 0;
    const volRatio = avgVol > 0 ? peakVol / avgVol : 1;

    const gapUpRate = openPrice > 0 && prevClose > 0 ? ((openPrice - prevClose) / prevClose) * 100 : 0;

    let pulseScore = 0;
    if (maxSurgeRate >= 3) pulseScore += 35;
    else if (maxSurgeRate >= 2) pulseScore += 25;
    else if (maxSurgeRate >= 1.5) pulseScore += 20;
    else if (maxSurgeRate >= 1) pulseScore += 12;
    else if (maxSurgeRate >= 0.5) pulseScore += 5;

    if (openToHighRate >= 3) pulseScore += 25;
    else if (openToHighRate >= 2) pulseScore += 18;
    else if (openToHighRate >= 1.5) pulseScore += 12;
    else if (openToHighRate >= 1) pulseScore += 8;
    else if (openToHighRate >= 0.5) pulseScore += 3;

    if (pullbackRate >= 0.5 && pullbackRate <= 5 && peakIdx < session.length - 2) pulseScore += 15;
    else if (pullbackRate > 0 && peakIdx < session.length / 2) pulseScore += 8;

    if (volRatio >= 2) pulseScore += 10;
    else if (volRatio >= 1.5) pulseScore += 6;
    else if (volRatio >= 1.2) pulseScore += 3;

    if (gapUpRate >= 1) pulseScore += 10;
    else if (gapUpRate >= 0.5) pulseScore += 5;
    else if (gapUpRate > 0) pulseScore += 2;

    pulseScore = Math.min(pulseScore, 100);

    if (pulseScore >= 10) {
      const peakTime = session[peakIdx].time;
      const details: string[] = [];
      if (maxSurgeRate >= 1) details.push(`${session[surgeStartIdx].time}-${session[surgeEndIdx].time}飙升${maxSurgeRate.toFixed(1)}%`);
      if (openToHighRate >= 1) details.push(`冲高${openToHighRate.toFixed(1)}%`);
      if (gapUpRate >= 0.5) details.push(`跳空${gapUpRate.toFixed(1)}%`);
      if (pullbackRate >= 0.3 && peakIdx < session.length - 2) details.push(`回落${pullbackRate.toFixed(1)}%`);
      if (volRatio >= 1.5) details.push(`放量${volRatio.toFixed(1)}x`);

      // 计算脉冲窗口成交金额 (surgeStartIdx ~ surgeEndIdx)
      const pulseAmount = session.slice(surgeStartIdx, surgeEndIdx + 1).reduce((sum, t) => sum + t.price * t.volume * 100, 0);

      markers.push({
        time: peakTime,
        type: "pulse",
        score: pulseScore,
        label: pulseScore >= 50 ? `强脉冲 ${pulseScore}分` : pulseScore >= 30 ? `脉冲 ${pulseScore}分` : `微脉冲 ${pulseScore}分`,
        detail: details.length > 0 ? details.join("，") : "轻微脉冲",
        amount: pulseAmount,
      });
    }
  }

  // ── Volume Surge Detection ──
  {
    const increments: { time: string; price: number; vol: number; priceChange: number }[] = [];
    for (let i = 0; i < session.length; i++) {
      const prevVol = i > 0 ? session[i - 1].volume : 0;
      const curVol = session[i].volume;
      const vol = i === 0 ? curVol : Math.max(0, curVol - prevVol);
      const prevPrice = i > 0 ? session[i - 1].price : prevClose;
      const priceChange = prevPrice > 0 ? ((session[i].price - prevPrice) / prevPrice) * 100 : 0;
      increments.push({ time: session[i].time, price: session[i].price, vol, priceChange });
    }

    const avgVol = increments.reduce((s, t) => s + t.vol, 0) / increments.length;
    const maxVol = Math.max(...increments.map(t => t.vol));
    const maxVolIdx = increments.findIndex(t => t.vol === maxVol);
    const volumeRatio = avgVol > 0 ? maxVol / avgVol : 1;
    const maxVolPriceChange = increments[maxVolIdx]?.priceChange || 0;

    let maxProgressiveLen = 1;
    let curProgressiveLen = 1;
    let progressiveStart = 0;
    let bestProgressiveStart = 0;
    for (let i = 1; i < increments.length; i++) {
      if (increments[i].vol > increments[i - 1].vol && increments[i].vol > 0) {
        curProgressiveLen++;
        if (curProgressiveLen > maxProgressiveLen) {
          maxProgressiveLen = curProgressiveLen;
          bestProgressiveStart = progressiveStart;
        }
      } else {
        curProgressiveLen = 1;
        progressiveStart = i;
      }
    }

    const progressivePriceRise = maxProgressiveLen >= 3
      ? (() => {
          const startP = increments[bestProgressiveStart]?.price || 0;
          const endP = increments[bestProgressiveStart + maxProgressiveLen - 1]?.price || 0;
          return startP > 0 ? ((endP - startP) / startP) * 100 : 0;
        })()
      : 0;

    const baselineVol = increments.slice(0, Math.min(5, increments.length))
      .reduce((s, t) => s + t.vol, 0) / Math.min(5, increments.length);
    const windowAvgVol = increments.reduce((s, t) => s + t.vol, 0) / increments.length;
    const windowVolRatio = baselineVol > 0 ? windowAvgVol / baselineVol : 1;

    const windowStartPrice = session[0].price;
    const windowEndPrice = session[session.length - 1].price;
    const windowPriceGain = windowStartPrice > 0 ? ((windowEndPrice - windowStartPrice) / windowStartPrice) * 100 : 0;

    const upWithHighVol = increments.filter(t => t.priceChange > 0 && t.vol > avgVol).length;
    const upHighVolRatio = increments.length > 0 ? upWithHighVol / increments.length : 0;

    let volSurgeScore = 0;
    if (volumeRatio >= 3 && maxVolPriceChange > 0.3) volSurgeScore += 30;
    else if (volumeRatio >= 2.5 && maxVolPriceChange > 0.2) volSurgeScore += 25;
    else if (volumeRatio >= 2 && maxVolPriceChange > 0.1) volSurgeScore += 20;
    else if (volumeRatio >= 1.5 && maxVolPriceChange > 0) volSurgeScore += 12;
    else if (volumeRatio >= 1.5) volSurgeScore += 5;

    if (maxProgressiveLen >= 5 && progressivePriceRise > 0.5) volSurgeScore += 25;
    else if (maxProgressiveLen >= 4 && progressivePriceRise > 0.3) volSurgeScore += 20;
    else if (maxProgressiveLen >= 3 && progressivePriceRise > 0.1) volSurgeScore += 15;
    else if (maxProgressiveLen >= 3) volSurgeScore += 5;

    if (windowVolRatio >= 2) volSurgeScore += 15;
    else if (windowVolRatio >= 1.5) volSurgeScore += 10;
    else if (windowVolRatio >= 1.2) volSurgeScore += 5;

    if (windowPriceGain >= 2 && upHighVolRatio >= 0.3) volSurgeScore += 15;
    else if (windowPriceGain >= 1 && upHighVolRatio >= 0.2) volSurgeScore += 10;
    else if (windowPriceGain >= 0.5 && upHighVolRatio >= 0.15) volSurgeScore += 5;

    if (upHighVolRatio >= 0.4) volSurgeScore += 10;
    else if (upHighVolRatio >= 0.3) volSurgeScore += 6;
    else if (upHighVolRatio >= 0.2) volSurgeScore += 3;

    if (volumeRatio >= 2 && maxVolPriceChange > 0) volSurgeScore += 5;

    volSurgeScore = Math.min(volSurgeScore, 100);

    if (volSurgeScore >= 10) {
      const markTime = increments[maxVolIdx]?.time || session[0].time;
      const details: string[] = [];
      if (volumeRatio >= 1.5) details.push(`${increments[maxVolIdx]?.time || ""}量比${volumeRatio.toFixed(1)}x`);
      if (maxProgressiveLen >= 3) details.push(`${maxProgressiveLen}分钟递增放量${progressivePriceRise > 0 ? `涨${progressivePriceRise.toFixed(1)}%` : ""}`);
      if (windowPriceGain >= 0.5) details.push(`时段涨${windowPriceGain.toFixed(1)}%`);
      if (upHighVolRatio >= 0.2) details.push(`${(upHighVolRatio * 100).toFixed(0)}%放量上涨`);

      markers.push({
        time: markTime,
        type: "volume_surge",
        score: volSurgeScore,
        label: volSurgeScore >= 50 ? `强放量拉升 ${volSurgeScore}分` : volSurgeScore >= 30 ? `放量拉升 ${volSurgeScore}分` : `轻微放量拉升 ${volSurgeScore}分`,
        detail: details.length > 0 ? details.join("，") : "轻微放量拉升",
        amount: increments[maxVolIdx] ? increments[maxVolIdx].price * increments[maxVolIdx].vol * 100 : 0,
      });
    }
  }

  // ── Progressive Volume Detection (递增放量) ──
  {
    const increments: { time: string; price: number; vol: number; priceChange: number }[] = [];
    for (let i = 0; i < session.length; i++) {
      const prevVol = i > 0 ? session[i - 1].volume : 0;
      const curVol = session[i].volume;
      const vol = i === 0 ? curVol : Math.max(0, curVol - prevVol);
      const prevPrice = i > 0 ? session[i - 1].price : prevClose;
      const priceChange = prevPrice > 0 ? ((session[i].price - prevPrice) / prevPrice) * 100 : 0;
      increments.push({ time: session[i].time, price: session[i].price, vol, priceChange });
    }

    // Find ALL progressive volume sequences (3+ consecutive increasing)
    interface ProgressiveSeq { startIdx: number; length: number; startPrice: number; endPrice: number; startVol: number; endVol: number; startTime: string; endTime: string; }
    const sequences: ProgressiveSeq[] = [];
    let curStart = 0;
    let curLen = 1;

    for (let i = 1; i < increments.length; i++) {
      if (increments[i].vol > increments[i - 1].vol && increments[i].vol > 0) {
        curLen++;
      } else {
        if (curLen >= 3) {
          sequences.push({
            startIdx: curStart, length: curLen,
            startPrice: increments[curStart].price, endPrice: increments[curStart + curLen - 1].price,
            startVol: increments[curStart].vol, endVol: increments[curStart + curLen - 1].vol,
            startTime: increments[curStart].time, endTime: increments[curStart + curLen - 1].time,
          });
        }
        curStart = i;
        curLen = 1;
      }
    }
    // Don't forget the last sequence
    if (curLen >= 3) {
      sequences.push({
        startIdx: curStart, length: curLen,
        startPrice: increments[curStart].price, endPrice: increments[curStart + curLen - 1].price,
        startVol: increments[curStart].vol, endVol: increments[curStart + curLen - 1].vol,
        startTime: increments[curStart].time, endTime: increments[curStart + curLen - 1].time,
      });
    }

    if (sequences.length > 0) {
      // Find the best sequence (longest)
      const bestSeq = sequences.reduce((best, seq) => seq.length > best.length ? seq : best, sequences[0]);
      const bestPriceRise = bestSeq.startPrice > 0
        ? ((bestSeq.endPrice - bestSeq.startPrice) / bestSeq.startPrice) * 100 : 0;
      const bestVolGrowth = bestSeq.startVol > 0
        ? ((bestSeq.endVol - bestSeq.startVol) / bestSeq.startVol) * 100 : 0;

      // Average step growth rate
      let totalStepGrowth = 0;
      let stepCount = 0;
      for (let i = bestSeq.startIdx + 1; i < bestSeq.startIdx + bestSeq.length; i++) {
        if (increments[i - 1].vol > 0) {
          totalStepGrowth += (increments[i].vol - increments[i - 1].vol) / increments[i - 1].vol;
          stepCount++;
        }
      }
      const avgStepGrowthRate = stepCount > 0 ? (totalStepGrowth / stepCount) * 100 : 0;

      // Multi-round progressive bonus
      const progressiveRounds = sequences.length;
      const sequencesWithPriceRise = sequences.filter(s => s.startPrice > 0 && s.endPrice > s.startPrice).length;

      // Total progressive volume ratio
      const totalProgressiveVol = sequences.reduce((sum, seq) => {
        let vol = 0;
        for (let i = seq.startIdx; i < seq.startIdx + seq.length; i++) vol += increments[i].vol;
        return sum + vol;
      }, 0);
      const totalVol = increments.reduce((s, t) => s + t.vol, 0);
      const progressiveVolRatio = totalVol > 0 ? totalProgressiveVol / totalVol : 0;

      // Calculate composite score
      let progScore = 0;
      if (bestSeq.length >= 8) progScore += 30;
      else if (bestSeq.length >= 6) progScore += 25;
      else if (bestSeq.length >= 5) progScore += 20;
      else if (bestSeq.length >= 4) progScore += 15;
      else if (bestSeq.length >= 3) progScore += 10;

      if (bestPriceRise >= 3) progScore += 25;
      else if (bestPriceRise >= 2) progScore += 20;
      else if (bestPriceRise >= 1) progScore += 15;
      else if (bestPriceRise >= 0.5) progScore += 10;
      else if (bestPriceRise >= 0) progScore += 3;
      if (bestPriceRise < -0.5) progScore -= 5;

      if (bestVolGrowth >= 300) progScore += 15;
      else if (bestVolGrowth >= 200) progScore += 12;
      else if (bestVolGrowth >= 100) progScore += 8;
      else if (bestVolGrowth >= 50) progScore += 5;
      else if (bestVolGrowth >= 20) progScore += 3;

      if (progressiveRounds >= 3 && sequencesWithPriceRise >= 2) progScore += 10;
      else if (progressiveRounds >= 2 && sequencesWithPriceRise >= 1) progScore += 6;
      else if (progressiveRounds >= 2) progScore += 3;

      if (avgStepGrowthRate >= 50) progScore += 8;
      else if (avgStepGrowthRate >= 30) progScore += 5;
      else if (avgStepGrowthRate >= 15) progScore += 3;

      if (progressiveVolRatio >= 0.5) progScore += 7;
      else if (progressiveVolRatio >= 0.3) progScore += 4;
      else if (progressiveVolRatio >= 0.2) progScore += 2;

      progScore = Math.max(0, Math.min(100, progScore));

      if (progScore >= 10) {
        // Mark at the end of the best progressive sequence
        const markTime = bestSeq.endTime;
        const details: string[] = [];
        if (bestSeq.length >= 3) {
          details.push(`${bestSeq.length}分钟递增${bestPriceRise >= 0 ? `涨${bestPriceRise.toFixed(1)}%` : `跌${Math.abs(bestPriceRise).toFixed(1)}%`}`);
        }
        if (progressiveRounds >= 2) {
          details.push(`${progressiveRounds}轮递增`);
        }
        if (bestVolGrowth >= 50) {
          details.push(`量增${bestVolGrowth.toFixed(0)}%`);
        }
        if (avgStepGrowthRate >= 15) {
          details.push(`均步增速${avgStepGrowthRate.toFixed(0)}%`);
        }
        if (progressiveVolRatio >= 0.3) {
          details.push(`递增量占比${(progressiveVolRatio * 100).toFixed(0)}%`);
        }

        markers.push({
          time: markTime,
          type: "progressive_vol",
          score: progScore,
          label: progScore >= 50 ? `强递增 ${progScore}分` : progScore >= 30 ? `递增 ${progScore}分` : `微递增 ${progScore}分`,
          detail: details.length > 0 ? details.join("，") : (progScore > 0 ? "轻微递增" : "无明显递增放量"),
          amount: (() => { let s = 0; for (let i = bestSeq.startIdx; i < bestSeq.startIdx + bestSeq.length; i++) s += session[i].price * session[i].volume * 100; return s; })(),
        });
      }
    }
  }

  // ── Pulse Decline Detection (脉冲下跌) ──
  {
    let maxDropRate = 0;
    let dropStartIdx = 0;
    let dropEndIdx = 0;
    const windowSize = 5;

    for (let i = 0; i <= session.length - windowSize; i++) {
      const startPrice = session[i].price;
      const endPrice = session[i + windowSize - 1].price;
      if (startPrice <= 0) continue;
      const dropRate = ((startPrice - endPrice) / startPrice) * 100; // positive = price dropped
      if (dropRate > maxDropRate) {
        maxDropRate = dropRate;
        dropStartIdx = i;
        dropEndIdx = i + windowSize - 1;
      }
    }

    const openPrice = session[0].price;
    const sessionLow = Math.min(...session.map(t => t.price));
    const openToLowRate = openPrice > 0 ? ((openPrice - sessionLow) / openPrice) * 100 : 0;

    // Find trough for rebound detection
    let troughIdx = 0;
    let troughPrice = Infinity;
    for (let i = 0; i < session.length; i++) {
      if (session[i].price < troughPrice) {
        troughPrice = session[i].price;
        troughIdx = i;
      }
    }
    const lastPrice = session[session.length - 1].price;
    const reboundRate = troughPrice > 0 ? ((lastPrice - troughPrice) / troughPrice) * 100 : 0;

    const avgVol = session.reduce((sum, t) => sum + t.volume, 0) / session.length;
    const troughVol = session[troughIdx]?.volume || 0;
    const volRatio = avgVol > 0 ? troughVol / avgVol : 1;

    const gapDownRate = openPrice > 0 && prevClose > 0 ? ((prevClose - openPrice) / prevClose) * 100 : 0;

    let declineScore = 0;
    if (maxDropRate >= 3) declineScore += 35;
    else if (maxDropRate >= 2) declineScore += 25;
    else if (maxDropRate >= 1.5) declineScore += 20;
    else if (maxDropRate >= 1) declineScore += 12;
    else if (maxDropRate >= 0.5) declineScore += 5;

    if (openToLowRate >= 3) declineScore += 25;
    else if (openToLowRate >= 2) declineScore += 18;
    else if (openToLowRate >= 1.5) declineScore += 12;
    else if (openToLowRate >= 1) declineScore += 8;
    else if (openToLowRate >= 0.5) declineScore += 3;

    if (reboundRate >= 0.5 && reboundRate <= 5 && troughIdx < session.length - 2) declineScore += 15;
    else if (reboundRate > 0 && troughIdx < session.length / 2) declineScore += 8;

    if (volRatio >= 2) declineScore += 10;
    else if (volRatio >= 1.5) declineScore += 6;
    else if (volRatio >= 1.2) declineScore += 3;

    if (gapDownRate >= 1) declineScore += 10;
    else if (gapDownRate >= 0.5) declineScore += 5;
    else if (gapDownRate > 0) declineScore += 2;

    declineScore = Math.min(declineScore, 100);

    if (declineScore >= 10) {
      const negativeScore = -declineScore; // 下跌得分为负
      const troughTime = session[troughIdx].time;
      const details: string[] = [];
      if (maxDropRate >= 1) details.push(`${session[dropStartIdx].time}-${session[dropEndIdx].time}急跌${maxDropRate.toFixed(1)}%`);
      if (openToLowRate >= 1) details.push(`开盘急跌${openToLowRate.toFixed(1)}%`);
      if (gapDownRate >= 0.5) details.push(`跳空低开${gapDownRate.toFixed(1)}%`);
      if (reboundRate >= 0.3 && troughIdx < session.length - 2) details.push(`探底回升${reboundRate.toFixed(1)}%`);
      if (volRatio >= 1.5) details.push(`放量砸盘${volRatio.toFixed(1)}x`);

      // 计算脉冲下跌窗口成交金额 (dropStartIdx ~ dropEndIdx)
      const pulseDeclineAmount = session.slice(dropStartIdx, dropEndIdx + 1).reduce((sum, t) => sum + t.price * t.volume * 100, 0);

      markers.push({
        time: troughTime,
        type: "pulse_decline",
        score: negativeScore,
        label: declineScore >= 50 ? `强脉冲下跌 ${negativeScore}分` : declineScore >= 30 ? `脉冲下跌 ${negativeScore}分` : `微脉冲下跌 ${negativeScore}分`,
        detail: details.length > 0 ? details.join("，") : "轻微下跌脉冲",
        amount: pulseDeclineAmount,
      });
    }
  }

  // ── Volume Decline Detection (放量下跌) ──
  {
    const increments: { time: string; price: number; vol: number; priceChange: number }[] = [];
    for (let i = 0; i < session.length; i++) {
      const prevVol = i > 0 ? session[i - 1].volume : 0;
      const curVol = session[i].volume;
      const vol = i === 0 ? curVol : Math.max(0, curVol - prevVol);
      const prevPrice = i > 0 ? session[i - 1].price : prevClose;
      const priceChange = prevPrice > 0 ? ((session[i].price - prevPrice) / prevPrice) * 100 : 0;
      increments.push({ time: session[i].time, price: session[i].price, vol, priceChange });
    }

    const avgVol = increments.reduce((s, t) => s + t.vol, 0) / increments.length;
    const maxVol = Math.max(...increments.map(t => t.vol));
    const maxVolIdx = increments.findIndex(t => t.vol === maxVol);
    const volumeRatio = avgVol > 0 ? maxVol / avgVol : 1;
    const maxVolPriceChange = increments[maxVolIdx]?.priceChange || 0;

    // Progressive volume with price drop
    let maxProgressiveLen = 1;
    let curProgressiveLen = 1;
    let progressiveStart = 0;
    let bestProgressiveStart = 0;
    for (let i = 1; i < increments.length; i++) {
      if (increments[i].vol > increments[i - 1].vol && increments[i].vol > 0) {
        curProgressiveLen++;
        if (curProgressiveLen > maxProgressiveLen) {
          maxProgressiveLen = curProgressiveLen;
          bestProgressiveStart = progressiveStart;
        }
      } else {
        curProgressiveLen = 1;
        progressiveStart = i;
      }
    }

    const progressivePriceDrop = maxProgressiveLen >= 3
      ? (() => {
          const startP = increments[bestProgressiveStart]?.price || 0;
          const endP = increments[bestProgressiveStart + maxProgressiveLen - 1]?.price || 0;
          return startP > 0 ? ((startP - endP) / startP) * 100 : 0;
        })()
      : 0;

    // Volume expansion above baseline
    const baselineVol = increments.slice(0, Math.min(5, increments.length))
      .reduce((s, t) => s + t.vol, 0) / Math.min(5, increments.length);
    const windowAvgVol = increments.reduce((s, t) => s + t.vol, 0) / increments.length;
    const windowVolRatio = baselineVol > 0 ? windowAvgVol / baselineVol : 1;

    // Window price drop
    const windowStartPrice = session[0].price;
    const windowEndPrice = session[session.length - 1].price;
    const windowPriceDrop = windowStartPrice > 0
      ? ((windowStartPrice - windowEndPrice) / windowStartPrice) * 100
      : 0;

    // Down-minutes with high volume
    const downWithHighVol = increments.filter(t => t.priceChange < 0 && t.vol > avgVol).length;
    const downHighVolRatio = increments.length > 0 ? downWithHighVol / increments.length : 0;

    // Price drop during volume peak
    let dropRate = 0;
    if (maxVolIdx >= 2) {
      const preDropPrice = increments[Math.max(0, maxVolIdx - 3)].price;
      const lowPrice = Math.min(
        ...increments.slice(Math.max(0, maxVolIdx - 1), Math.min(increments.length, maxVolIdx + 3)).map(t => t.price)
      );
      dropRate = preDropPrice > 0 ? ((preDropPrice - lowPrice) / preDropPrice) * 100 : 0;
    }

    let volDeclineScore = 0;
    const hasPriceDrop = windowPriceDrop > 0.1 || maxVolPriceChange < -0.1;

    if (volumeRatio >= 3 && maxVolPriceChange < -0.3) volDeclineScore += 30;
    else if (volumeRatio >= 2.5 && maxVolPriceChange < -0.2) volDeclineScore += 25;
    else if (volumeRatio >= 2 && maxVolPriceChange < -0.1) volDeclineScore += 20;
    else if (volumeRatio >= 2 && maxVolPriceChange < 0) volDeclineScore += 12;
    else if (volumeRatio >= 1.5 && maxVolPriceChange < -0.1) volDeclineScore += 10;
    else if (volumeRatio >= 1.5 && maxVolPriceChange < 0) volDeclineScore += 5;

    if (maxProgressiveLen >= 5 && progressivePriceDrop > 0.5) volDeclineScore += 25;
    else if (maxProgressiveLen >= 4 && progressivePriceDrop > 0.3) volDeclineScore += 20;
    else if (maxProgressiveLen >= 3 && progressivePriceDrop > 0.1) volDeclineScore += 15;
    else if (maxProgressiveLen >= 3 && progressivePriceDrop > 0) volDeclineScore += 8;

    if (windowVolRatio >= 2 && windowPriceDrop > 1) volDeclineScore += 15;
    else if (windowVolRatio >= 1.5 && windowPriceDrop > 0.5) volDeclineScore += 12;
    else if (windowVolRatio >= 1.5 && windowPriceDrop > 0.2) volDeclineScore += 8;
    else if (windowVolRatio >= 1.2 && windowPriceDrop > 0.1) volDeclineScore += 5;

    if (downHighVolRatio >= 0.4) volDeclineScore += 15;
    else if (downHighVolRatio >= 0.3) volDeclineScore += 12;
    else if (downHighVolRatio >= 0.2) volDeclineScore += 8;
    else if (downHighVolRatio >= 0.1) volDeclineScore += 4;

    if (dropRate >= 3) volDeclineScore += 10;
    else if (dropRate >= 2) volDeclineScore += 8;
    else if (dropRate >= 1) volDeclineScore += 5;
    else if (dropRate >= 0.5) volDeclineScore += 3;

    if (!hasPriceDrop) volDeclineScore = Math.min(volDeclineScore, 5);

    volDeclineScore = Math.min(volDeclineScore, 100);

    if (volDeclineScore >= 10) {
      const negativeScore = -volDeclineScore; // 下跌得分为负
      const markTime = increments[maxVolIdx]?.time || session[0].time;
      const details: string[] = [];
      if (volumeRatio >= 1.5) details.push(`${increments[maxVolIdx]?.time || ""}量比${volumeRatio.toFixed(1)}x`);
      if (maxProgressiveLen >= 3 && progressivePriceDrop > 0) details.push(`${maxProgressiveLen}分钟递增放量跌${progressivePriceDrop.toFixed(1)}%`);
      if (windowPriceDrop > 0.5) details.push(`时段跌${windowPriceDrop.toFixed(1)}%`);
      if (downHighVolRatio >= 0.2) details.push(`${(downHighVolRatio * 100).toFixed(0)}%放量下跌`);
      if (dropRate >= 1) details.push(`放量砸盘${dropRate.toFixed(1)}%`);

      markers.push({
        time: markTime,
        type: "volume_decline",
        score: negativeScore,
        label: volDeclineScore >= 50 ? `强放量下跌 ${negativeScore}分` : volDeclineScore >= 30 ? `放量下跌 ${negativeScore}分` : `轻微放量下跌 ${negativeScore}分`,
        detail: details.length > 0 ? details.join("，") : "轻微放量下跌",
        amount: increments[maxVolIdx] ? increments[maxVolIdx].price * increments[maxVolIdx].vol * 100 : 0,
      });
    }
  }

  return markers;
}

// ── Mini MACD Computation ─────────────────────────────

export function computeMiniMACD(items: TimelineItem[]): { time: string; dif: number | null; dea: number | null; macd: number | null }[] {
  if (items.length < 2) return items.map(d => ({ time: d.time, dif: null, dea: null, macd: null }));

  const prices = items.map(d => d.price);
  const macdResult = calculateMACD(prices);

  return items.map((d, i) => {
    const m = macdResult[i];
    if (isNaN(m.dif) || isNaN(m.dea) || isNaN(m.macd)) {
      return { time: d.time, dif: null, dea: null, macd: null };
    }
    return {
      time: d.time,
      dif: m.dif,
      dea: m.dea,
      macd: m.macd,
    };
  });
}
