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
  type: "pulse" | "volume_surge" | "progressive_vol" | "pulse_decline" | "volume_decline" | "early_vol_drop" | "wash_trade" | "vol_rise" | "shrink_rise" | "slow_decline";
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

  // ── 高开形态 ──
  { key: "gap_up_open", label: "高开", description: "开盘价高于昨收价，隔夜情绪偏多", category: "price" },
  { key: "gap_up_drop", label: "高开", description: "开盘价高于昨收价，隔夜情绪偏多，立即卖出做正T", category: "price" },

  // ── 放量下跌买点形态 (v5.3更新) ──
  { key: "macd_neg_near_peak", label: "MACD绿柱缩短/转正", description: "近80根内MACD柱出现过绿柱峰值，当前绿柱缩短至80%以下或已转正，空头动能释放确认", category: "indicator" },
  { key: "vol_dry_up_buy", label: "缩量", description: "成交量降至均量80%以下，抛压衰竭（极缩<50%更佳，缩量<70%中等）", category: "volume" },
  { key: "price_near_lowest", label: "价格在底部区域", description: "当前价格接近近80根最低价（2.5%以内），底部区域定位（贴底1%内更佳）", category: "price" },

  // ── 次低点缩量买点形态 (v6.0核心买点，80%权重) ──
  { key: "second_low_point", label: "第二个次低点", description: "价格先形成第一个低点L1，反弹后回落形成第二个次低点L2（L2≈L1±1.5%且接近日内最低价≤0.5%），底部确认", category: "price" },
  { key: "vol_shrink_at_second_low", label: "次低点缩量", description: "第二个次低点处成交量萎缩（<70%均量或比L1处低30%+），抛压衰竭标志", category: "volume" },
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
  {
    id: "factor_43",
    name: "次低点缩量买入",
    description: "第二个次低点+缩量=主力买点(80%权重)。股价下跌形成第一个低点L1，反弹后回落形成第二个次低点L2（L2需接近日内最低价≤0.5%），L2处成交量萎缩，抛压衰竭，高概率买入机会。",
    signalType: "buy",
    tMode: "正T",
    strength: "strong",
    conditions: [
      { key: "second_low_point", label: "第二个次低点", description: "价格先形成L1低点，反弹后回落形成L2次低点(L2≈L1±1.5%且接近日内最低价≤0.5%)", category: "price" },
      { key: "vol_shrink_at_second_low", label: "次低点缩量", description: "L2处成交量萎缩(<70%均量或比L1处低30%+)", category: "volume" },
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
  sectorRegime?: RegimeDetail | null,
  openPrice?: number,
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

  const optimizedSignals = generateOptimizedSignals(timeline, macdData, prevClose, undefined, factorOverrides, indexRegime, engineCustomFactors, sectorRegime, openPrice);

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

  // ── Volume Surge Detection (放量拉升) — Sliding Sub-Window ──
  {
    const increments: { time: string; price: number; vol: number; priceChange: number }[] = [];
    for (let i = 0; i < session.length; i++) {
      const prevPrice = i > 0 ? session[i - 1].price : prevClose;
      const priceChange = prevPrice > 0 ? ((session[i].price - prevPrice) / prevPrice) * 100 : 0;
      increments.push({ time: session[i].time, price: session[i].price, vol: session[i].volume, priceChange });
    }

    // Baseline: use BOTH first-15-min average AND full-session average,
    // pick the LOWER one to prevent inflated baseline when surge starts from the open.
    const baselineLen = Math.min(15, increments.length);
    const earlyBaselineVol = increments.slice(0, baselineLen)
      .reduce((s, t) => s + t.vol, 0) / baselineLen;
    const sessionAvgVol = increments.reduce((s, t) => s + t.vol, 0) / increments.length;
    const baselineVol = Math.min(earlyBaselineVol, sessionAvgVol);

    // Sliding sub-window scan for volume surge
    const subWindowSizes = [5, 8, 10, 15, 20, 30];
    let bestScore = 0;
    let bestMarker: PulseVolumeMarker | null = null;

    for (const winSize of subWindowSizes) {
      if (increments.length < winSize) continue;
      for (let start = 0; start <= increments.length - winSize; start++) {
        const subInc = increments.slice(start, start + winSize);
        const subSession = session.slice(start, start + winSize);

        const avgVol = subInc.reduce((s, t) => s + t.vol, 0) / subInc.length;
        const maxVol = Math.max(...subInc.map(t => t.vol));
        const maxVolIdx = subInc.findIndex(t => t.vol === maxVol);
        const volumeRatio = avgVol > 0 ? maxVol / avgVol : 1;
        const maxVolPriceChange = subInc[maxVolIdx]?.priceChange || 0;

        // Up-volume ratio: fraction of total volume from rising minutes
        const upVol = subInc.filter(t => t.priceChange > 0).reduce((s, t) => s + t.vol, 0);
        const totalVol = subInc.reduce((s, t) => s + t.vol, 0);
        const upVolRatio = totalVol > 0 ? upVol / totalVol : 0;

        // Progressive volume within sub-window
        let maxProgressiveLen = 1, curProgressiveLen = 1;
        let progressiveStart = 0, bestProgressiveStart = 0;
        for (let i = 1; i < subInc.length; i++) {
          if (subInc[i].vol > subInc[i - 1].vol && subInc[i].vol > 0) {
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
              const startP = subInc[bestProgressiveStart]?.price || 0;
              const endP = subInc[bestProgressiveStart + maxProgressiveLen - 1]?.price || 0;
              return startP > 0 ? ((endP - startP) / startP) * 100 : 0;
            })()
          : 0;

        // Sub-window volume ratio vs session baseline
        const windowVolRatio = baselineVol > 0 ? avgVol / baselineVol : 1;

        // Sub-window price gain
        const windowStartPrice = subSession[0].price;
        const windowEndPrice = subSession[subSession.length - 1].price;
        const windowPriceGain = windowStartPrice > 0 ? ((windowEndPrice - windowStartPrice) / windowStartPrice) * 100 : 0;

        // Up-minutes with high volume within sub-window
        const upWithHighVol = subInc.filter(t => t.priceChange > 0 && t.vol > avgVol).length;
        const upHighVolRatio = subInc.length > 0 ? upWithHighVol / subInc.length : 0;

        let volSurgeScore = 0;

        // A. 上涨成交量占比（核心指标）
        if (upVolRatio >= 0.8) volSurgeScore += 30;
        else if (upVolRatio >= 0.7) volSurgeScore += 25;
        else if (upVolRatio >= 0.6) volSurgeScore += 18;
        else if (upVolRatio >= 0.5) volSurgeScore += 10;
        else if (upVolRatio >= 0.4) volSurgeScore += 5;

        // B. 单分钟量比+上涨
        if (volumeRatio >= 3 && maxVolPriceChange > 0.3) volSurgeScore += 15;
        else if (volumeRatio >= 2.5 && maxVolPriceChange > 0.2) volSurgeScore += 12;
        else if (volumeRatio >= 2 && maxVolPriceChange > 0.1) volSurgeScore += 10;
        else if (volumeRatio >= 1.5 && maxVolPriceChange > 0) volSurgeScore += 5;

        // C. 递增放量+上涨
        if (maxProgressiveLen >= 5 && progressivePriceRise > 0.5) volSurgeScore += 15;
        else if (maxProgressiveLen >= 4 && progressivePriceRise > 0.3) volSurgeScore += 12;
        else if (maxProgressiveLen >= 3 && progressivePriceRise > 0.1) volSurgeScore += 8;
        else if (maxProgressiveLen >= 3) volSurgeScore += 4;

        // D. 放量程度
        if (windowVolRatio >= 2) volSurgeScore += 15;
        else if (windowVolRatio >= 1.5) volSurgeScore += 10;
        else if (windowVolRatio >= 1.2) volSurgeScore += 5;

        // E. 价格涨幅
        if (windowPriceGain >= 3) volSurgeScore += 15;
        else if (windowPriceGain >= 2) volSurgeScore += 12;
        else if (windowPriceGain >= 1) volSurgeScore += 8;
        else if (windowPriceGain >= 0.5) volSurgeScore += 4;

        // F. 量价齐升分钟占比
        if (upHighVolRatio >= 0.4) volSurgeScore += 10;
        else if (upHighVolRatio >= 0.3) volSurgeScore += 7;
        else if (upHighVolRatio >= 0.2) volSurgeScore += 4;
        else if (upHighVolRatio >= 0.1) volSurgeScore += 2;

        volSurgeScore = Math.min(volSurgeScore, 100);

        if (volSurgeScore > bestScore && volSurgeScore >= 10) {
          bestScore = volSurgeScore;
          const markTime = subInc[maxVolIdx]?.time || subSession[0].time;
          const details: string[] = [];
          if (upVolRatio >= 0.5) details.push(`${(upVolRatio * 100).toFixed(0)}%成交量上涨方`);
          if (volumeRatio >= 1.5) details.push(`${subInc[maxVolIdx]?.time || ""}量比${volumeRatio.toFixed(1)}x`);
          if (maxProgressiveLen >= 3) details.push(`${maxProgressiveLen}分钟递增放量${progressivePriceRise > 0 ? `涨${progressivePriceRise.toFixed(1)}%` : ""}`);
          if (windowPriceGain >= 0.5) details.push(`时段涨${windowPriceGain.toFixed(1)}%`);
          if (upHighVolRatio >= 0.2) details.push(`${(upHighVolRatio * 100).toFixed(0)}%放量上涨`);

          bestMarker = {
            time: markTime,
            type: "volume_surge",
            score: volSurgeScore,
            label: volSurgeScore >= 50 ? `强放量拉升 ${volSurgeScore}分` : volSurgeScore >= 30 ? `放量拉升 ${volSurgeScore}分` : `轻微放量拉升 ${volSurgeScore}分`,
            detail: details.length > 0 ? details.join("，") : "轻微放量拉升",
            amount: subInc[maxVolIdx] ? subInc[maxVolIdx].price * subInc[maxVolIdx].vol * 100 : 0,
          };
        }
      }
    }

    if (bestMarker) markers.push(bestMarker);
  }

  // ── Progressive Volume Detection (递增放量) ──
  {
    const increments: { time: string; price: number; vol: number; priceChange: number }[] = [];
    for (let i = 0; i < session.length; i++) {
      const prevVol = i > 0 ? session[i - 1].volume : 0;
      const curVol = session[i].volume;
      const vol = curVol; // volume is already per-minute from API, use directly
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

  // ── Pulse Decline Detection (脉冲下跌) v2 ──
  // 优化：多窗口扫描(3/5/8分钟) + 反弹减分(已反弹=危险降低) + 精确量比(跌时vs涨时)
  {
    // ── 多窗口扫描：捕捉不同速度的脉冲下跌 ──
    const pulseWindows = [3, 5, 8];
    let bestPulseDrop = 0;
    let bestPulseStartIdx = 0;
    let bestPulseEndIdx = 0;
    let bestPulseWinSize = 5;

    for (const winSize of pulseWindows) {
      if (session.length < winSize) continue;
      for (let i = 0; i <= session.length - winSize; i++) {
        const startPrice = session[i].price;
        const endPrice = session[i + winSize - 1].price;
        if (startPrice <= 0) continue;
        const dropRate = ((startPrice - endPrice) / startPrice) * 100;
        if (dropRate > bestPulseDrop) {
          bestPulseDrop = dropRate;
          bestPulseStartIdx = i;
          bestPulseEndIdx = i + winSize - 1;
          bestPulseWinSize = winSize;
        }
      }
    }

    const openPrice = session[0].price;
    const sessionLow = Math.min(...session.map(t => t.price));
    const openToLowRate = openPrice > 0 ? ((openPrice - sessionLow) / openPrice) * 100 : 0;

    // Find trough
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

    // ── 精确量比：下跌时段均量 vs 上涨时段均量 ──
    const downMins = session.filter((t, i) => i > 0 && t.price < session[i - 1].price);
    const upMins = session.filter((t, i) => i > 0 && t.price >= session[i - 1].price);
    const downAvgVol = downMins.length > 0 ? downMins.reduce((s, t) => s + t.volume, 0) / downMins.length : 0;
    const upAvgVol = upMins.length > 0 ? upMins.reduce((s, t) => s + t.volume, 0) / upMins.length : 0;
    const sessionAvgVol = session.reduce((sum, t) => sum + t.volume, 0) / session.length;
    // 量比 = 下跌均量 / 上涨均量，若上涨均量为0则用全日均量
    const declineVolRatio = upAvgVol > 0 ? downAvgVol / upAvgVol : (sessionAvgVol > 0 ? downAvgVol / sessionAvgVol : 1);

    const gapDownRate = openPrice > 0 && prevClose > 0 ? ((prevClose - openPrice) / prevClose) * 100 : 0;

    // ── 脉冲速度分类 ──
    // 3分钟窗口 = 极速脉冲, 5分钟 = 标准脉冲, 8分钟 = 延伸脉冲
    const isFastPulse = bestPulseWinSize <= 3 && bestPulseDrop >= 1;
    const isExtendedPulse = bestPulseWinSize >= 8 && bestPulseDrop >= 0.8;

    let declineScore = 0;

    // A. 最大跌幅 (核心)
    if (bestPulseDrop >= 3) declineScore += 35;
    else if (bestPulseDrop >= 2) declineScore += 25;
    else if (bestPulseDrop >= 1.5) declineScore += 20;
    else if (bestPulseDrop >= 1) declineScore += 12;
    else if (bestPulseDrop >= 0.5) declineScore += 5;

    // B. 开盘到低点跌幅
    if (openToLowRate >= 3) declineScore += 25;
    else if (openToLowRate >= 2) declineScore += 18;
    else if (openToLowRate >= 1.5) declineScore += 12;
    else if (openToLowRate >= 1) declineScore += 8;
    else if (openToLowRate >= 0.5) declineScore += 3;

    // C. 速度加成：极速脉冲更危险
    if (isFastPulse) declineScore += 8;
    else if (isExtendedPulse) declineScore += 3;

    // D. 精确量比（下跌均量 vs 上涨均量）
    if (declineVolRatio >= 3) declineScore += 12;
    else if (declineVolRatio >= 2) declineScore += 10;
    else if (declineVolRatio >= 1.5) declineScore += 7;
    else if (declineVolRatio >= 1.2) declineScore += 3;

    // E. 跳空低开
    if (gapDownRate >= 1) declineScore += 10;
    else if (gapDownRate >= 0.5) declineScore += 5;
    else if (gapDownRate > 0) declineScore += 2;

    // F. 反弹减分：已反弹 = 危险降低（核心修正）
    // 反弹越多，后续继续下跌的风险越小
    if (reboundRate >= 2) declineScore -= 12;
    else if (reboundRate >= 1) declineScore -= 8;
    else if (reboundRate >= 0.5) declineScore -= 4;

    declineScore = Math.max(0, Math.min(declineScore, 100));

    // ── 早盘整体趋势校验 ──
    const lastSessionPrice = session[session.length - 1]?.price || 0;
    const netChangeFromOpen = openPrice > 0
      ? ((lastSessionPrice - openPrice) / openPrice) * 100
      : 0;
    const netChangeFromPrevClose = prevClose > 0
      ? ((lastSessionPrice - prevClose) / prevClose) * 100
      : 0;
    if (netChangeFromOpen > 0.5) {
      declineScore = Math.min(declineScore, 3);
    } else if (netChangeFromOpen > 0) {
      declineScore = Math.round(declineScore * 0.3);
    } else if (netChangeFromPrevClose > 0.3) {
      declineScore = Math.round(declineScore * 0.5);
    }

    if (declineScore >= 10) {
      const negativeScore = -declineScore;
      const troughTime = session[troughIdx].time;
      const details: string[] = [];
      const speedLabel = isFastPulse ? "极速" : isExtendedPulse ? "延伸" : "";
      if (bestPulseDrop >= 1) details.push(`${session[bestPulseStartIdx].time}-${session[bestPulseEndIdx].time}${speedLabel}急跌${bestPulseDrop.toFixed(1)}%`);
      if (openToLowRate >= 1) details.push(`开盘跌${openToLowRate.toFixed(1)}%`);
      if (gapDownRate >= 0.5) details.push(`跳空低开${gapDownRate.toFixed(1)}%`);
      if (reboundRate >= 0.3 && troughIdx < session.length - 2) details.push(`探底回升${reboundRate.toFixed(1)}%`);
      if (declineVolRatio >= 1.5) details.push(`跌时量${declineVolRatio.toFixed(1)}x涨时`);

      // 计算脉冲下跌窗口成交金额
      const pulseDeclineAmount = session.slice(bestPulseStartIdx, bestPulseEndIdx + 1).reduce((sum, t) => sum + t.price * t.volume * 100, 0);

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

  // ── Volume Decline Detection (放量下跌) — Multi-Marker + Time-Period Strategy ──
  // 交易规矩中的放量下跌专题策略实现：
  // 1. 三时段形态：早盘放量下杀 / 盘中放量下跌 / 尾盘放量下跌
  // 2. 允许多个独立标记（不同时段可各产生一个）
  // 3. 标记在下跌起始点而非最高量分钟
  // 4. 滚动基线（30分钟）防止午后放量被全日稀释
  // 5. 窗口长度加分：持续下跌更有意义
  {
    const increments: { time: string; price: number; vol: number; priceChange: number }[] = [];
    for (let i = 0; i < session.length; i++) {
      const prevPrice = i > 0 ? session[i - 1].price : prevClose;
      const priceChange = prevPrice > 0 ? ((session[i].price - prevPrice) / prevPrice) * 100 : 0;
      increments.push({ time: session[i].time, price: session[i].price, vol: session[i].volume, priceChange });
    }

    if (increments.length >= 5) {
      // ── 基线计算：滚动30分钟基线 + 全日基线，取较低者 ──
      const sessionAvgVol = increments.reduce((s, t) => s + t.vol, 0) / increments.length;
      const baselineLen = Math.min(15, increments.length);
      const earlyBaselineVol = increments.slice(0, baselineLen)
        .reduce((s, t) => s + t.vol, 0) / baselineLen;
      const globalBaseline = Math.min(earlyBaselineVol, sessionAvgVol);

      // Helper: rolling baseline (30min window before current position)
      // [FIX] Return raw rolling average; the weighted baseline logic below handles
      // the choice between rolling vs global baseline intelligently.
      const getRollingBaseline = (pos: number): number => {
        const rollLen = 30;
        const rollStart = Math.max(0, pos - rollLen);
        const slice = increments.slice(rollStart, pos);
        if (slice.length < 5) return globalBaseline;
        return slice.reduce((s, t) => s + t.vol, 0) / slice.length;
      };

      // ── 时段判定 ──
      // 早盘: 0~30min (index 0~29), 盘中: 30~210min, 尾盘: 210~240min
      const getTimePeriod = (idx: number): "early" | "mid" | "late" => {
        if (idx < 30) return "early";
        if (idx >= Math.max(30, increments.length - 30)) return "late";
        return "mid";
      };

      // ── 滑动窗口扫描 ──
      const subWindowSizes = [5, 8, 10, 15, 20, 30];
      // 改为多标记：收集所有高分窗口，按时段分组取最优
      const candidateMarkers: { start: number; end: number; score: number; marker: PulseVolumeMarker; period: string }[] = [];

      for (const winSize of subWindowSizes) {
        if (increments.length < winSize) continue;
        for (let start = 0; start <= increments.length - winSize; start++) {
          const subInc = increments.slice(start, start + winSize);
          const subSession = session.slice(start, start + winSize);

          const avgVol = subInc.reduce((s, t) => s + t.vol, 0) / subInc.length;
          const rollingBaseline = getRollingBaseline(start);
          // [FIX] Use weighted baseline instead of always taking Math.min(rolling, global)
          // If rolling baseline is much lower than global (<0.5x), the rolling period might be
          // artificially low (e.g., lunch break), so use global baseline instead.
          // If rolling baseline period has declining prices, rolling baseline is more relevant.
          const rollSlice = increments.slice(Math.max(0, start - 30), start);
          const rollingPriceTrend = rollSlice.length >= 5
            ? (() => {
                const firstP = rollSlice[0]?.price || 0;
                const lastP = rollSlice[rollSlice.length - 1]?.price || 0;
                return firstP > 0 ? ((lastP - firstP) / firstP) * 100 : 0;
              })()
            : 0;
          let baseline: number;
          if (rollingBaseline < globalBaseline * 0.5 && rollingPriceTrend >= 0) {
            // Rolling period is suspiciously low (e.g., lunch break) and not declining → use global
            baseline = globalBaseline;
          } else if (rollingPriceTrend < -0.3) {
            // Rolling period has declining prices → rolling baseline is more relevant
            baseline = rollingBaseline;
          } else {
            // Default: use the lower of the two (original behavior)
            baseline = Math.min(rollingBaseline, globalBaseline);
          }

          // ── 1. 下跌成交量占比 ──
          const downVol = subInc.filter(t => t.priceChange < 0).reduce((s, t) => s + t.vol, 0);
          const totalVol = subInc.reduce((s, t) => s + t.vol, 0);
          const downVolRatio = totalVol > 0 ? downVol / totalVol : 0;

          // ── 2. 放量程度：窗口均量 vs 基线 ──
          const windowVolRatio = baseline > 0 ? avgVol / baseline : 1;

          // ── 3. 价格跌幅 ──
          const windowStartPrice = subSession[0].price;
          const windowEndPrice = subSession[subSession.length - 1].price;
          const windowPriceDrop = windowStartPrice > 0
            ? ((windowStartPrice - windowEndPrice) / windowStartPrice) * 100 : 0;

          // ── 4. 下跌分钟占比 ──
          const downMinutes = subInc.filter(t => t.priceChange < 0).length;
          const downMinuteRatio = subInc.length > 0 ? downMinutes / subInc.length : 0;

          // ── 5. 量价齐跌分钟占比 ──
          // [FIX] Use baseline instead of avgVol for high-volume comparison.
          // If the whole window is high-volume, avgVol will be high and few minutes
          // will exceed it. Using baseline (which represents normal volume) is more accurate.
          const downWithHighVol = subInc.filter(t => t.priceChange < 0 && t.vol > baseline).length;
          const downHighVolRatio = subInc.length > 0 ? downWithHighVol / subInc.length : 0;

          // ── 6. 递增放量+下跌连续段 ──
          let maxProgDeclineLen = 1, curProgDeclineLen = 1;
          let progDeclineStart = 0, bestProgDeclineStart = 0;
          for (let i = 1; i < subInc.length; i++) {
            if (subInc[i].vol > subInc[i - 1].vol && subInc[i].priceChange < 0 && subInc[i].vol > 0) {
              curProgDeclineLen++;
              if (curProgDeclineLen > maxProgDeclineLen) {
                maxProgDeclineLen = curProgDeclineLen;
                bestProgDeclineStart = progDeclineStart;
              }
            } else {
              curProgDeclineLen = 1;
              progDeclineStart = i;
            }
          }
          const progDeclinePriceDrop = maxProgDeclineLen >= 3
            ? (() => {
                const startP = subInc[bestProgDeclineStart]?.price || 0;
                const endP = subInc[bestProgDeclineStart + maxProgDeclineLen - 1]?.price || 0;
                return startP > 0 ? ((startP - endP) / startP) * 100 : 0;
              })()
            : 0;

          // ── 7. 最大单分钟放量 ──
          const maxVol = Math.max(...subInc.map(t => t.vol));
          const maxVolIdx = subInc.findIndex(t => t.vol === maxVol);
          const volumeRatio = avgVol > 0 ? maxVol / avgVol : 1;
          const maxVolPriceChange = subInc[maxVolIdx]?.priceChange || 0;

          // ── 8. 放量砸盘幅度 ──
          let dropRate = 0;
          if (maxVolIdx >= 2) {
            const preDropPrice = subInc[Math.max(0, maxVolIdx - 3)].price;
            const lowPrice = Math.min(
              ...subInc.slice(Math.max(0, maxVolIdx - 1), Math.min(subInc.length, maxVolIdx + 3)).map(t => t.price)
            );
            dropRate = preDropPrice > 0 ? ((preDropPrice - lowPrice) / preDropPrice) * 100 : 0;
          }

          // ── 综合评分 ──
          let score = 0;

          // A. 下跌成交量占比 (核心)
          if (downVolRatio >= 0.8) score += 30;
          else if (downVolRatio >= 0.7) score += 25;
          else if (downVolRatio >= 0.6) score += 18;
          else if (downVolRatio >= 0.5) score += 10;
          else if (downVolRatio >= 0.4) score += 5;

          // B. 放量程度
          if (windowVolRatio >= 3) score += 20;
          else if (windowVolRatio >= 2) score += 15;
          else if (windowVolRatio >= 1.5) score += 10;
          else if (windowVolRatio >= 1.2) score += 5;

          // C. 价格跌幅
          if (windowPriceDrop >= 3) score += 20;
          else if (windowPriceDrop >= 2) score += 15;
          else if (windowPriceDrop >= 1) score += 10;
          else if (windowPriceDrop >= 0.5) score += 6;
          else if (windowPriceDrop >= 0.3) score += 3;

          // D. 下跌分钟占比
          if (downMinuteRatio >= 0.8) score += 10;
          else if (downMinuteRatio >= 0.6) score += 6;
          else if (downMinuteRatio >= 0.5) score += 3;

          // E. 量价齐跌分钟占比
          if (downHighVolRatio >= 0.4) score += 10;
          else if (downHighVolRatio >= 0.3) score += 7;
          else if (downHighVolRatio >= 0.2) score += 4;
          else if (downHighVolRatio >= 0.1) score += 2;

          // F. 递增放量+下跌连续段
          if (maxProgDeclineLen >= 5 && progDeclinePriceDrop > 0.5) score += 15;
          else if (maxProgDeclineLen >= 4 && progDeclinePriceDrop > 0.3) score += 12;
          else if (maxProgDeclineLen >= 3 && progDeclinePriceDrop > 0.1) score += 8;
          else if (maxProgDeclineLen >= 3) score += 4;

          // G. 单分钟放量砸盘
          if (volumeRatio >= 3 && maxVolPriceChange < -0.3) score += 10;
          else if (volumeRatio >= 2 && maxVolPriceChange < -0.2) score += 7;
          else if (volumeRatio >= 2 && maxVolPriceChange < 0) score += 4;

          // H. 放量砸盘幅度
          if (dropRate >= 3) score += 8;
          else if (dropRate >= 2) score += 5;
          else if (dropRate >= 1) score += 3;

          // I. 窗口长度加分 — 持续放量下跌更有意义
          if (winSize >= 20 && windowPriceDrop >= 0.5) score += 8;
          else if (winSize >= 15 && windowPriceDrop >= 0.3) score += 5;
          else if (winSize >= 10 && windowPriceDrop >= 0.2) score += 3;

          // [FIX] Relaxed gating: penalty system instead of hard cap.
          // Original: AND gate — if EITHER condition fails, score capped at 5 (below threshold of 10).
          // This was too strict for stocks like 五粮液 with moderate volume decline.
          // New approach: penalty system with progressive reduction.
          const hasGenuineAmplification = windowVolRatio >= 1.2 || downHighVolRatio >= 0.2;
          const hasGenuineDecline = windowPriceDrop >= 0.2 && downMinuteRatio >= 0.5;
          if (!hasGenuineAmplification && !hasGenuineDecline) {
            // Both conditions fail → likely not real volume decline, hard cap
            score = Math.min(score, 5);
          } else if (!hasGenuineAmplification) {
            // Volume not clearly amplified → reduce by 40%
            score = Math.round(score * 0.6);
          } else if (!hasGenuineDecline) {
            // Price decline not clear enough → reduce by 50%
            score = Math.round(score * 0.5);
          }
          // If both conditions pass, no penalty applied

          // ── 早盘整体趋势校验 ──
          // 如果窗口在早盘(9:30~10:00)，但该时段整体价格是上涨的，
          // 说明只是上涨途中的回调而非真正的放量下跌，大幅降分。
          // 解决"哈药股份早盘在涨但被误判为放量下跌"的问题。
          const period = getTimePeriod(start);
          if (period === "early") {
            const earlySessionStart = session[0]?.price || 0;
            const earlySessionEnd = session[Math.min(29, session.length - 1)]?.price || 0;
            const earlyNetChange = earlySessionStart > 0
              ? ((earlySessionEnd - earlySessionStart) / earlySessionStart) * 100
              : 0;
            // 同时检查相对昨收的涨跌
            const changeFromPrevClose = prevClose > 0 && earlySessionEnd > 0
              ? ((earlySessionEnd - prevClose) / prevClose) * 100
              : 0;
            if (earlyNetChange > 0.5 || changeFromPrevClose > 0.5) {
              // 早盘整体上涨超过0.5% 或 相对昨收上涨超过0.5% → 重置到极低分
              score = Math.min(score, 3);
            } else if (earlyNetChange > 0 || changeFromPrevClose > 0) {
              // 早盘整体微涨 或 相对昨收微涨 → 大幅降分(70%折扣)
              score = Math.round(score * 0.3);
            } else if (earlyNetChange > -0.3) {
              // 早盘几乎平盘(-0.3%~0%) → 适度降分(50%折扣)
              score = Math.round(score * 0.5);
            }
            // 早盘下跌超过0.3% → 不降分，保留原始分数
          }
          // ── 盘中/尾盘趋势校验 ──
          // 即使不在早盘，如果当前价格相对昨收是上涨的，
          // 也不太可能是真正的放量下跌，适度降分。
          else {
            const currentPrice = session[session.length - 1]?.price || 0;
            const changeFromPrevCloseNow = prevClose > 0 && currentPrice > 0
              ? ((currentPrice - prevClose) / prevClose) * 100
              : 0;
            if (changeFromPrevCloseNow > 1) {
              // 当前相对昨收上涨超过1% → 适度降分(40%折扣)
              score = Math.round(score * 0.6);
            } else if (changeFromPrevCloseNow > 0.5) {
              // 当前相对昨收上涨0.5~1% → 轻度降分(70%折扣)
              score = Math.round(score * 0.8);
            }
          }

          score = Math.min(score, 100);

          // [FIX] Lowered threshold from 10 to 8 to catch more borderline cases
          if (score >= 8) {
            const negativeScore = -score;
            // 标记在下跌起始点：窗口内第一个下跌且放量的分钟（用baseline而非avgVol，更准确）
            const onsetIdx = subInc.findIndex(t => t.priceChange < 0 && t.vol > baseline);
            // 如果没找到量价齐跌的起始点，用第一个下跌分钟
            const fallbackIdx = subInc.findIndex(t => t.priceChange < 0);
            const markIdx = onsetIdx >= 0 ? onsetIdx : (fallbackIdx >= 0 ? fallbackIdx : 0);
            const markTime = subInc[markIdx]?.time || subSession[0].time;

            const details: string[] = [];
            if (downVolRatio >= 0.5) details.push(`${(downVolRatio * 100).toFixed(0)}%量下跌方`);
            if (windowVolRatio >= 1.5) details.push(`均量${windowVolRatio.toFixed(1)}x基线`);
            if (windowPriceDrop >= 0.5) details.push(`跌${windowPriceDrop.toFixed(1)}%`);
            if (maxProgDeclineLen >= 3 && progDeclinePriceDrop > 0) details.push(`${maxProgDeclineLen}连放量跌`);
            if (downHighVolRatio >= 0.2) details.push(`${(downHighVolRatio * 100).toFixed(0)}%量价齐跌`);
            if (dropRate >= 1) details.push(`砸盘${dropRate.toFixed(1)}%`);

            // 时段标注
            const periodLabel = period === "early" ? "早盘" : period === "late" ? "尾盘" : "";
            const strengthLabel = score >= 50 ? "强放量下跌" : score >= 30 ? "放量下跌" : "放量下跌";
            const warningIcon = score >= 50 ? "⚠" : score >= 30 ? "⚠" : "";

            candidateMarkers.push({
              start,
              end: start + winSize - 1,
              score,
              period,
              marker: {
                time: markTime,
                type: "volume_decline",
                score: negativeScore,
                label: `${periodLabel}${strengthLabel} ${negativeScore}分${warningIcon}`,
                detail: details.length > 0 ? details.join("，") : "放量下跌",
                amount: subSession.reduce((sum, t) => sum + t.price * t.volume * 100, 0),
              },
            });
          }
        }
      }

      // ── Simple Volume Decline Fallback Detection ──
      // [FIX] Added fallback for stocks that show clear session-level volume decline
      // but might not be caught by the sliding window approach.
      // If the overall session shows: price declining from open, declining-period volume
      // higher than rising-period volume, and majority of minutes are declining.
      {
        const openPrice = session[0]?.price || 0;
        const lastPrice = session[session.length - 1]?.price || 0;
        const overallPriceDrop = openPrice > 0 ? ((openPrice - lastPrice) / openPrice) * 100 : 0;

        // Split minutes into rising vs declining
        const risingMins = increments.filter(t => t.priceChange >= 0);
        const decliningMins = increments.filter(t => t.priceChange < 0);
        const downMinRatio = increments.length > 0 ? decliningMins.length / increments.length : 0;

        const avgRisingVol = risingMins.length > 0 ? risingMins.reduce((s, t) => s + t.vol, 0) / risingMins.length : 0;
        const avgDecliningVol = decliningMins.length > 0 ? decliningMins.reduce((s, t) => s + t.vol, 0) / decliningMins.length : 0;
        const decliningVolRatio = avgRisingVol > 0 ? avgDecliningVol / avgRisingVol : 0;

        // Only trigger if all three conditions are met
        // AND stock is actually below prevClose (not just below open)
        const belowPrevClose = prevClose > 0 && lastPrice < prevClose;
        if (overallPriceDrop > 0.5 && downMinRatio >= 0.6 && decliningVolRatio > 1.0 && belowPrevClose) {
          // Check if there's already a volume_decline marker overlapping with this
          const existingVDMarkers = candidateMarkers.filter(c => c.period === "mid" || c.period === "early");
          const alreadyHasVD = existingVDMarkers.length > 0;

          if (!alreadyHasVD) {
            // Calculate a simple score based on the strength of the signal
            let simpleScore = 0;
            if (overallPriceDrop >= 3) simpleScore += 25;
            else if (overallPriceDrop >= 2) simpleScore += 18;
            else if (overallPriceDrop >= 1) simpleScore += 12;
            else if (overallPriceDrop >= 0.5) simpleScore += 8;

            if (downMinRatio >= 0.8) simpleScore += 20;
            else if (downMinRatio >= 0.7) simpleScore += 14;
            else if (downMinRatio >= 0.6) simpleScore += 8;

            if (decliningVolRatio >= 2) simpleScore += 20;
            else if (decliningVolRatio >= 1.5) simpleScore += 14;
            else if (decliningVolRatio >= 1.2) simpleScore += 8;
            else if (decliningVolRatio >= 1.0) simpleScore += 4;

            simpleScore = Math.min(simpleScore, 50); // Cap at moderate strength

            if (simpleScore >= 8) {
              const negativeSimpleScore = -simpleScore;
              // Mark at the onset of decline: first declining minute with above-baseline volume
              const onsetIdx = increments.findIndex(t => t.priceChange < 0 && t.vol > globalBaseline);
              const fallbackOnsetIdx = increments.findIndex(t => t.priceChange < 0);
              const markIdx = onsetIdx >= 0 ? onsetIdx : (fallbackOnsetIdx >= 0 ? fallbackOnsetIdx : 0);
              const markTime = increments[markIdx]?.time || session[0].time;

              const details: string[] = [];
              details.push(`全日跌${overallPriceDrop.toFixed(1)}%`);
              details.push(`${(downMinRatio * 100).toFixed(0)}%分钟下跌`);
              if (decliningVolRatio > 1) details.push(`跌时量${decliningVolRatio.toFixed(1)}x涨时`);

              candidateMarkers.push({
                start: markIdx,
                end: increments.length - 1,
                score: simpleScore,
                period: "mid", // Assign to mid period for dedup
                marker: {
                  time: markTime,
                  type: "volume_decline",
                  score: negativeSimpleScore,
                  label: `放量下跌 ${negativeSimpleScore}分`,
                  detail: details.join("，"),
                  amount: increments[markIdx] ? increments[markIdx].price * increments[markIdx].vol * 100 : 0,
                },
              });
            }
          }
        }
      }

      // ── 去重：按时段分组，每组取最高分，且窗口不重叠 ──
      // 最多产生3个标记：早盘、盘中、尾盘各一个
      const periodGroups: Record<string, typeof candidateMarkers> = { early: [], mid: [], late: [] };
      for (const c of candidateMarkers) {
        periodGroups[c.period].push(c);
      }

      for (const period of ["early", "mid", "late"] as const) {
        const group = periodGroups[period];
        if (group.length === 0) continue;
        // 按分数降序排列
        group.sort((a, b) => b.score - a.score);
        // 取最高分且与已选标记窗口不重叠的
        const selected: typeof candidateMarkers = [];
        for (const c of group) {
          const overlaps = selected.some(s =>
            (c.start >= s.start && c.start <= s.end) || (c.end >= s.start && c.end <= s.end)
          );
          if (!overlaps) {
            selected.push(c);
          }
        }
        // 每个时段最多1个标记
        if (selected.length > 0) {
          markers.push(selected[0].marker);
        }
      }
    }
  }

  // ── Early Volume Drop Detection (早盘缩量下跌) ──
  // 检测开盘30分钟内出现缩量下跌的模式：价格持续走低但量能萎缩
  // 这通常是弱势信号，后续可能继续下跌
  {
    const first30End = Math.min(30, session.length);
    const earlySession = session.slice(0, first30End);
    if (earlySession.length >= 10) {
      const earlyAvgVol = earlySession.reduce((s, t) => s + t.volume, 0) / earlySession.length;
      const openPrice = earlySession[0].price;
      const earlyLow = Math.min(...earlySession.map(t => t.price));
      const earlyDropRate = openPrice > 0 ? ((openPrice - earlyLow) / openPrice) * 100 : 0;

      // 后半段量能 vs 前半段量能
      const halfLen = Math.floor(earlySession.length / 2);
      const firstHalfVol = earlySession.slice(0, halfLen).reduce((s, t) => s + t.volume, 0) / halfLen;
      const secondHalfVol = earlySession.slice(halfLen).reduce((s, t) => s + t.volume, 0) / (earlySession.length - halfLen);
      const volShrinkRatio = firstHalfVol > 0 ? secondHalfVol / firstHalfVol : 1;

      // 下跌分钟数占比
      let downCount = 0;
      for (let i = 1; i < earlySession.length; i++) {
        if (earlySession[i].price < earlySession[i - 1].price) downCount++;
      }
      const downRatio = (earlySession.length - 1) > 0 ? downCount / (earlySession.length - 1) : 0;

      let earlyVolDropScore = 0;
      if (earlyDropRate >= 2) earlyVolDropScore += 30;
      else if (earlyDropRate >= 1) earlyVolDropScore += 20;
      else if (earlyDropRate >= 0.5) earlyVolDropScore += 10;

      if (volShrinkRatio <= 0.5) earlyVolDropScore += 25;
      else if (volShrinkRatio <= 0.7) earlyVolDropScore += 18;
      else if (volShrinkRatio <= 0.85) earlyVolDropScore += 10;
      else if (volShrinkRatio < 1) earlyVolDropScore += 5;

      if (downRatio >= 0.7) earlyVolDropScore += 20;
      else if (downRatio >= 0.6) earlyVolDropScore += 12;
      else if (downRatio >= 0.5) earlyVolDropScore += 6;

      earlyVolDropScore = Math.min(earlyVolDropScore, 100);

      if (earlyVolDropScore >= 10) {
        const troughIdx = earlySession.reduce((best, t, i) => t.price < earlySession[best].price ? i : best, 0);
        const markTime = earlySession[troughIdx].time;
        const details: string[] = [];
        if (earlyDropRate >= 0.5) details.push(`开盘跌${earlyDropRate.toFixed(1)}%`);
        if (volShrinkRatio < 1) details.push(`量能缩减至${(volShrinkRatio * 100).toFixed(0)}%`);
        if (downRatio >= 0.5) details.push(`${(downRatio * 100).toFixed(0)}%分钟下跌`);
        const amount = earlySession.slice(halfLen).reduce((sum, t) => sum + t.price * t.volume * 100, 0);
        markers.push({
          time: markTime,
          type: "early_vol_drop",
          score: -earlyVolDropScore,
          label: earlyVolDropScore >= 30 ? `早盘缩量下跌 ${-earlyVolDropScore}分` : `轻微早盘缩量 ${-earlyVolDropScore}分`,
          detail: details.length > 0 ? details.join("，") : "早盘缩量",
          amount,
        });
      }
    }
  }

  // ── Slow Decline Detection (阴跌) ──
  // 检测慢速持续下跌模式：价格持续走低但单分钟跌幅不大，量能温和
  // 与脉冲下跌(急跌)和放量下跌(大成交量)不同，阴跌的特征是：
  //   1. 下跌分钟占比极高(>70%)但单分钟跌幅小
  //   2. 反弹微弱，每次反弹高度不超过前一波下跌的30%
  //   3. 量能不突增但下跌方向一致
  // 阴跌往往比急跌更危险：不易察觉、持股者不舍得止损、越套越深
  {
    // 构建局部increments（不依赖外部变量）
    const slowInc: { time: string; price: number; vol: number; priceChange: number }[] = [];
    for (let i = 0; i < session.length; i++) {
      const prevPrice = i > 0 ? session[i - 1].price : prevClose;
      const priceChange = prevPrice > 0 ? ((session[i].price - prevPrice) / prevPrice) * 100 : 0;
      slowInc.push({ time: session[i].time, price: session[i].price, vol: session[i].volume, priceChange });
    }
    const slowWindows = [15, 20, 30, 45];
    let bestSlowScore = 0;
    let bestSlowMarker: PulseVolumeMarker | null = null;

    for (const winSize of slowWindows) {
      if (session.length < winSize) continue;
      for (let start = 0; start <= session.length - winSize; start++) {
        const subSession = session.slice(start, start + winSize);
        const subInc = slowInc.slice(start, start + winSize);

        // 总跌幅
        const startP = subSession[0].price;
        const endP = subSession[subSession.length - 1].price;
        const totalDrop = startP > 0 ? ((startP - endP) / startP) * 100 : 0;

        // 下跌分钟占比
        const downMins = subInc.filter(t => t.priceChange < 0).length;
        const downRatio = subInc.length > 0 ? downMins / subInc.length : 0;

        // 最大单分钟反弹幅度（阴跌中反弹应很微弱）
        let maxRebound = 0;
        for (const t of subInc) {
          if (t.priceChange > 0 && t.priceChange > maxRebound) maxRebound = t.priceChange;
        }

        // 最大单分钟跌幅（阴跌中单分钟跌幅不大）
        let maxSingleDrop = 0;
        for (const t of subInc) {
          if (t.priceChange < 0 && Math.abs(t.priceChange) > maxSingleDrop) maxSingleDrop = Math.abs(t.priceChange);
        }

        // 下跌均量 vs 上涨均量
        const subDownMins = subInc.filter(t => t.priceChange < 0);
        const subUpMins = subInc.filter(t => t.priceChange >= 0);
        const subDownAvgVol = subDownMins.length > 0 ? subDownMins.reduce((s, t) => s + t.vol, 0) / subDownMins.length : 0;
        const subUpAvgVol = subUpMins.length > 0 ? subUpMins.reduce((s, t) => s + t.vol, 0) / subUpMins.length : 0;
        const subVolRatio = subUpAvgVol > 0 ? subDownAvgVol / subUpAvgVol : 1;

        // 只有持续下跌、单分钟跌幅不大、反弹微弱才算阴跌
        if (totalDrop < 0.5 || downRatio < 0.6 || maxSingleDrop > 1.5) continue;

        let slowScore = 0;

        // A. 下跌持续性 (核心)
        if (downRatio >= 0.85) slowScore += 25;
        else if (downRatio >= 0.75) slowScore += 20;
        else if (downRatio >= 0.65) slowScore += 14;
        else if (downRatio >= 0.55) slowScore += 8;

        // B. 总跌幅
        if (totalDrop >= 3) slowScore += 20;
        else if (totalDrop >= 2) slowScore += 15;
        else if (totalDrop >= 1.5) slowScore += 12;
        else if (totalDrop >= 1) slowScore += 8;
        else if (totalDrop >= 0.5) slowScore += 4;

        // C. 反弹微弱度（反弹越小越像阴跌）
        if (maxRebound < 0.2) slowScore += 15;
        else if (maxRebound < 0.3) slowScore += 12;
        else if (maxRebound < 0.5) slowScore += 8;
        else if (maxRebound < 0.8) slowScore += 4;

        // D. 下跌方向量能优势
        if (subVolRatio >= 2) slowScore += 15;
        else if (subVolRatio >= 1.5) slowScore += 10;
        else if (subVolRatio >= 1.2) slowScore += 6;
        else if (subVolRatio >= 1) slowScore += 2;

        // E. 窗口越长越有意义的阴跌
        if (winSize >= 30 && totalDrop >= 1) slowScore += 10;
        else if (winSize >= 20 && totalDrop >= 0.8) slowScore += 6;
        else if (winSize >= 15 && totalDrop >= 0.5) slowScore += 3;

        // F. 单分钟跌幅越小越像阴跌（与脉冲下跌区分）
        if (maxSingleDrop < 0.5 && totalDrop >= 1) slowScore += 10;
        else if (maxSingleDrop < 0.8 && totalDrop >= 0.8) slowScore += 5;

        slowScore = Math.min(slowScore, 100);

        if (slowScore > bestSlowScore && slowScore >= 10) {
          bestSlowScore = slowScore;
          const markTime = subSession[Math.floor(subSession.length / 2)].time;
          const details: string[] = [];
          details.push(`${downRatio >= 0.75 ? "持续" : "多数"}分钟下跌${(downRatio * 100).toFixed(0)}%`);
          if (totalDrop >= 0.5) details.push(`累计跌${totalDrop.toFixed(1)}%`);
          if (maxRebound < 0.3) details.push(`反弹极弱`);
          if (subVolRatio >= 1.2) details.push(`跌时量${subVolRatio.toFixed(1)}x`);

          bestSlowMarker = {
            time: markTime,
            type: "slow_decline",
            score: -slowScore,
            label: slowScore >= 40 ? `阴跌 ${-slowScore}分` : `轻微阴跌 ${-slowScore}分`,
            detail: details.join("，"),
            amount: subSession.reduce((sum, t) => sum + t.price * t.volume * 100, 0),
          };
        }
      }
    }

    if (bestSlowMarker) {
      markers.push(bestSlowMarker);
    }
  }

  // ── Wash Trade Detection (对倒洗盘) ──
  // 检测放量但价格基本不变的洗盘模式：成交量放大但价格在窄幅震荡
  // 通常是主力在吸筹或洗盘
  {
    const subWindowSizes = [10, 15, 20, 30];
    let bestWashScore = 0;
    let bestWashMarker: PulseVolumeMarker | null = null;

    for (const winSize of subWindowSizes) {
      if (session.length < winSize) continue;
      for (let start = 0; start <= session.length - winSize; start++) {
        const subSession = session.slice(start, start + winSize);
        const subAvgVol = subSession.reduce((s, t) => s + t.volume, 0) / subSession.length;
        const subMaxVol = Math.max(...subSession.map(t => t.volume));

        // 窗口内价格振幅
        const subHigh = Math.max(...subSession.map(t => t.price));
        const subLow = Math.min(...subSession.map(t => t.price));
        const subRange = subHigh > 0 ? ((subHigh - subLow) / subHigh) * 100 : 0;

        // 量比（vs全日基线）
        const sessionAvgVol = session.reduce((s, t) => s + t.volume, 0) / session.length;
        const volRatio = sessionAvgVol > 0 ? subAvgVol / sessionAvgVol : 1;

        // 单分钟巨量但价格不变
        const maxVolIdx = subSession.findIndex(t => t.volume === subMaxVol);
        const prevPrice = maxVolIdx > 0 ? subSession[maxVolIdx - 1].price : subSession[0].price;
        const maxVolPriceChange = prevPrice > 0 ? Math.abs(((subSession[maxVolIdx].price - prevPrice) / prevPrice) * 100) : 0;

        let washScore = 0;
        // A. 放量但价格振幅小（核心条件）
        if (volRatio >= 2 && subRange <= 0.5) washScore += 30;
        else if (volRatio >= 1.5 && subRange <= 0.8) washScore += 22;
        else if (volRatio >= 1.2 && subRange <= 1) washScore += 15;
        else if (volRatio >= 1 && subRange <= 0.5) washScore += 10;

        // B. 单分钟巨量但价格不变
        if (subMaxVol >= subAvgVol * 3 && maxVolPriceChange < 0.1) washScore += 20;
        else if (subMaxVol >= subAvgVol * 2 && maxVolPriceChange < 0.15) washScore += 12;
        else if (subMaxVol >= subAvgVol * 1.5 && maxVolPriceChange < 0.2) washScore += 6;

        // C. 放量程度
        if (volRatio >= 3) washScore += 15;
        else if (volRatio >= 2) washScore += 10;
        else if (volRatio >= 1.5) washScore += 5;

        washScore = Math.min(washScore, 100);

        if (washScore > bestWashScore && washScore >= 10) {
          bestWashScore = washScore;
          const markTime = subSession[maxVolIdx]?.time || subSession[0].time;
          const details: string[] = [];
          if (volRatio >= 1.5) details.push(`量能${volRatio.toFixed(1)}x均量`);
          if (subRange <= 1) details.push(`振幅仅${subRange.toFixed(2)}%`);
          if (subMaxVol >= subAvgVol * 2 && maxVolPriceChange < 0.15) details.push(`巨量无价变`);
          const amount = subSession[maxVolIdx] ? subSession[maxVolIdx].price * subSession[maxVolIdx].volume * 100 : 0;
          bestWashMarker = {
            time: markTime,
            type: "wash_trade",
            score: washScore,
            label: washScore >= 30 ? `对倒洗盘 ${washScore}分` : `疑似洗盘 ${washScore}分`,
            detail: details.length > 0 ? details.join("，") : "放量横盘",
            amount,
          };
        }
      }
    }
    if (bestWashMarker) markers.push(bestWashMarker);
  }

  // ── Volume Rise Detection (量增价涨) ──
  // 检测温和放量+价格上涨的模式，是健康的上涨信号
  {
    const subWindowSizes = [5, 8, 10, 15];
    let bestVolRiseScore = 0;
    let bestVolRiseMarker: PulseVolumeMarker | null = null;

    for (const winSize of subWindowSizes) {
      if (session.length < winSize) continue;
      for (let start = 0; start <= session.length - winSize; start++) {
        const subSession = session.slice(start, start + winSize);
        const subAvgVol = subSession.reduce((s, t) => s + t.volume, 0) / subSession.length;

        // 量比（vs全日基线）
        const sessionAvgVol = session.reduce((s, t) => s + t.volume, 0) / session.length;
        const volRatio = sessionAvgVol > 0 ? subAvgVol / sessionAvgVol : 1;

        // 窗口内净涨幅
        const startPrice = subSession[0].price;
        const endPrice = subSession[subSession.length - 1].price;
        const priceGain = startPrice > 0 ? ((endPrice - startPrice) / startPrice) * 100 : 0;

        // 上涨分钟占比
        let upCount = 0;
        for (let i = 1; i < subSession.length; i++) {
          if (subSession[i].price > subSession[i - 1].price) upCount++;
        }
        const upRatio = (subSession.length - 1) > 0 ? upCount / (subSession.length - 1) : 0;

        // 量价齐升分钟占比
        const upWithHighVol = subSession.filter((t, i) => {
          if (i === 0) return false;
          return t.price > subSession[i - 1].price && t.volume > subAvgVol;
        }).length;
        const upHighVolRatio = subSession.length > 0 ? upWithHighVol / subSession.length : 0;

        let volRiseScore = 0;
        // A. 温和放量+上涨
        if (volRatio >= 1.5 && priceGain >= 1) volRiseScore += 25;
        else if (volRatio >= 1.2 && priceGain >= 0.5) volRiseScore += 18;
        else if (volRatio >= 1 && priceGain >= 0.3) volRiseScore += 10;

        // B. 上涨分钟占比
        if (upRatio >= 0.7) volRiseScore += 20;
        else if (upRatio >= 0.6) volRiseScore += 12;
        else if (upRatio >= 0.5) volRiseScore += 6;

        // C. 量价齐升占比
        if (upHighVolRatio >= 0.3) volRiseScore += 15;
        else if (upHighVolRatio >= 0.2) volRiseScore += 10;
        else if (upHighVolRatio >= 0.1) volRiseScore += 5;

        // D. 价格涨幅
        if (priceGain >= 2) volRiseScore += 15;
        else if (priceGain >= 1) volRiseScore += 10;
        else if (priceGain >= 0.5) volRiseScore += 5;

        volRiseScore = Math.min(volRiseScore, 100);

        if (volRiseScore > bestVolRiseScore && volRiseScore >= 10) {
          bestVolRiseScore = volRiseScore;
          const peakIdx = subSession.reduce((best, t, i) => t.price > subSession[best].price ? i : best, 0);
          const markTime = subSession[peakIdx].time;
          const details: string[] = [];
          if (volRatio >= 1.2) details.push(`量能${volRatio.toFixed(1)}x`);
          if (priceGain >= 0.5) details.push(`涨${priceGain.toFixed(1)}%`);
          if (upRatio >= 0.6) details.push(`${(upRatio * 100).toFixed(0)}%分钟上涨`);
          const amount = subSession[peakIdx] ? subSession[peakIdx].price * subSession[peakIdx].volume * 100 : 0;
          bestVolRiseMarker = {
            time: markTime,
            type: "vol_rise",
            score: volRiseScore,
            label: volRiseScore >= 30 ? `量增价涨 ${volRiseScore}分` : `轻微量增 ${volRiseScore}分`,
            detail: details.length > 0 ? details.join("，") : "量增价涨",
            amount,
          };
        }
      }
    }
    if (bestVolRiseMarker) markers.push(bestVolRiseMarker);
  }

  // ── Shrink Rise Detection (缩量上涨) ──
  // 检测缩量+价格上涨的模式，是虚涨信号，后续可能回落
  {
    const subWindowSizes = [5, 8, 10, 15];
    let bestShrinkRiseScore = 0;
    let bestShrinkRiseMarker: PulseVolumeMarker | null = null;

    for (const winSize of subWindowSizes) {
      if (session.length < winSize) continue;
      for (let start = 0; start <= session.length - winSize; start++) {
        const subSession = session.slice(start, start + winSize);

        // 前后半段量能对比
        const halfLen = Math.floor(subSession.length / 2);
        const firstHalfVol = subSession.slice(0, halfLen).reduce((s, t) => s + t.volume, 0) / halfLen;
        const secondHalfVol = subSession.slice(halfLen).reduce((s, t) => s + t.volume, 0) / (subSession.length - halfLen);
        const volShrinkRatio = firstHalfVol > 0 ? secondHalfVol / firstHalfVol : 1;

        // 窗口内净涨幅
        const startPrice = subSession[0].price;
        const endPrice = subSession[subSession.length - 1].price;
        const priceGain = startPrice > 0 ? ((endPrice - startPrice) / startPrice) * 100 : 0;

        // 量比（vs全日基线）
        const sessionAvgVol = session.reduce((s, t) => s + t.volume, 0) / session.length;
        const subAvgVol = subSession.reduce((s, t) => s + t.volume, 0) / subSession.length;
        const volRatio = sessionAvgVol > 0 ? subAvgVol / sessionAvgVol : 1;

        let shrinkRiseScore = 0;
        // A. 缩量+上涨（核心条件）
        if (volShrinkRatio <= 0.5 && priceGain >= 0.5) shrinkRiseScore += 30;
        else if (volShrinkRatio <= 0.7 && priceGain >= 0.3) shrinkRiseScore += 22;
        else if (volShrinkRatio <= 0.85 && priceGain >= 0.2) shrinkRiseScore += 15;
        else if (volShrinkRatio < 1 && priceGain > 0) shrinkRiseScore += 8;

        // B. 量能低于均量
        if (volRatio <= 0.5 && priceGain > 0) shrinkRiseScore += 20;
        else if (volRatio <= 0.7 && priceGain > 0) shrinkRiseScore += 12;
        else if (volRatio <= 0.85 && priceGain > 0) shrinkRiseScore += 6;

        // C. 价格涨幅
        if (priceGain >= 2) shrinkRiseScore += 15;
        else if (priceGain >= 1) shrinkRiseScore += 10;
        else if (priceGain >= 0.5) shrinkRiseScore += 5;

        shrinkRiseScore = Math.min(shrinkRiseScore, 100);

        if (shrinkRiseScore > bestShrinkRiseScore && shrinkRiseScore >= 10) {
          bestShrinkRiseScore = shrinkRiseScore;
          const peakIdx = subSession.reduce((best, t, i) => t.price > subSession[best].price ? i : best, 0);
          const markTime = subSession[peakIdx].time;
          const details: string[] = [];
          if (volShrinkRatio < 1) details.push(`量能缩减至${(volShrinkRatio * 100).toFixed(0)}%`);
          if (priceGain >= 0.3) details.push(`涨${priceGain.toFixed(1)}%`);
          if (volRatio < 1) details.push(`低于均量${((1 - volRatio) * 100).toFixed(0)}%`);
          const amount = subSession[peakIdx] ? subSession[peakIdx].price * subSession[peakIdx].volume * 100 : 0;
          bestShrinkRiseMarker = {
            time: markTime,
            type: "shrink_rise",
            score: shrinkRiseScore,
            label: shrinkRiseScore >= 30 ? `缩量上涨 ${shrinkRiseScore}分` : `轻微缩量涨 ${shrinkRiseScore}分`,
            detail: details.length > 0 ? details.join("，") : "缩量上涨",
            amount,
          };
        }
      }
    }
    if (bestShrinkRiseMarker) markers.push(bestShrinkRiseMarker);
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
