import { calculateKDJ } from '@/lib/indicators';

/**
 * 滚动做T策略引擎 - 基于PDF策略文档优化
 * 
 * 核心改进（对比原版）：
 * 1. 时间窗口过滤 - 不同时段不同操作权限
 * 2. VWAP偏离度阈值提升到2%（原0.5%）→ 匹配PDF策略
 * 3. 量价背离检测（价创新高+量缩 → 卖出信号）
 * 4. 差价底线规则（<1.5%差价不产生信号）
 * 5. 止损信号（做反1.5%认亏买回）
 * 6. 正T/反T模式区分
 * 7. 均线趋势判断市场环境（震荡/上升/下跌）
 * 8. 每日做T次数限制（最多2次）
 * 9. 前日收盘价支撑位检测
 * 10. 量缩价稳买回信号
 */

// ── 类型定义 ──────────────────────────────────────────

export type TMode = "正T" | "反T"; // 正T=先卖后买（主推），反T=先买后卖（谨慎）
export type SignalType = "buy" | "sell" | "stoploss"; // stoploss=止损认亏买回
export type Strength = "strong" | "medium" | "weak";
export type MarketRegime = "震荡市" | "上升通道" | "下跌趋势" | "横盘末期";
export type TimeWindow = "开盘观察" | "正T卖出窗口" | "买回窗口" | "午后卖出窗口" | "午后买回窗口" | "尾盘不操作";

export interface TSignal {
  type: SignalType;
  reason: string;
  strength: Strength;
  tMode: TMode;           // 正T or 反T
  timeWindow: TimeWindow;  // 当前时间窗口
  spreadPct?: number;      // 差价百分比（如果适用）
  description?: string;    // 详细描述
  factorId?: string;       // 对应的因子ID（用于追踪）
  strengthOverridden?: boolean; // 用户在策略面板中显式覆盖了强度，合并时不可被升级
}

// ── 因子覆盖配置（连接DB）──────────────────────────────

export interface FactorOverride {
  name: string;          // 因子名称，需与信号规则名一致
  enabled: boolean;      // 是否启用
  priority: number;      // 优先级
  strength?: Strength;   // 覆盖强度
  tMode?: TMode;        // 覆盖做T模式
  timeWindow?: string;  // 覆盖时间窗口
}

/**
 * 从DB因子记录构建因子覆盖列表
 */
export function buildFactorOverridesFromDB(dbFactors: any[]): FactorOverride[] {
  return dbFactors.map(f => ({
    name: f.name,
    enabled: f.enabled ?? true,
    priority: f.priority ?? 0,
    strength: f.strength,
    tMode: f.tMode,
    timeWindow: f.timeWindow,
  }));
}

/**
 * 检查指定因子是否启用
 * - 止损买回(rule 0)始终启用，不可禁用
 * - 无覆盖配置时默认全部启用
 */
export function isFactorEnabled(factorName: string, overrides?: FactorOverride[]): boolean {
  // 止损规则始终启用，不可通过面板禁用
  if (factorName === "止损买回") return true;
  if (!overrides || overrides.length === 0) return true; // 无覆盖=全部启用
  const override = overrides.find(o => o.name === factorName);
  if (!override) return true; // 不在覆盖列表=启用
  return override.enabled;
}

/**
 * 获取因子的覆盖配置
 */
function getFactorOverride(factorName: string, overrides?: FactorOverride[]): FactorOverride | undefined {
  if (!overrides || overrides.length === 0) return undefined;
  return overrides.find(o => o.name === factorName);
}

export interface StrategyConfig {
  // MACD参数
  macdFast: number;
  macdSlow: number;
  macdSignal: number;

  // VWAP偏离度阈值
  vwapDeviationSell: number;   // 卖出时偏离均价线阈值 (%), PDF=2%
  vwapDeviationBuy: number;    // 买回时回到均价线附近阈值 (%)

  // 量价关系
  volumeMultiplier: number;      // 放量倍数, 2x
  volumeMultiplierStrong: number; // 强放量倍数, 3x
  volumeShrinkRatio: number;      // 缩量比例 <0.5
  volumePulseMultiplier: number;   // 脉冲放量倍数, 5x (v3.2新增)
  consecutiveShrinkBars: number;   // 连续缩量根数, 3 (v3.2新增)

  // 动量阈值
  momentumDropThreshold: number;     // 急跌阈值 %, -0.3%
  momentumDropStrong: number;        // 强急跌阈值 %, -0.8%
  momentumRiseThreshold: number;     // 冲高阈值 %, 0.3%
  momentumRiseStrong: number;        // 强冲高阈值 %, 0.8%

  // RSI参数 (v3.2新增)
  rsiPeriod: number;              // RSI计算周期, 14
  rsiOversold: number;            // RSI超卖阈值, 30
  rsiOverbought: number;          // RSI超买阈值, 70

  // 布林带参数 (v3.2新增)
  bollPeriod: number;             // 布林带计算周期, 20
  bollMultiplier: number;         // 布林带标准差倍数, 2

  // 差价底线
  spreadFloor: number;           // 差价底线 %, 1.5%
  spreadIdealMin: number;        // 理想做T区间下限 %, 2%
  spreadIdealMax: number;        // 理想做T区间上限 %, 3%

  // 止损
  stopLossPercent: number;       // 止损幅度 %, 1.5%

  // 仓位
  basePositionPct: number;       // 底仓比例 60-70%
  tPositionPct: number;          // T仓比例 30-40%

  // 做T限制
  maxDailyTCount: number;        // 每日最多做T次数

  // 标的筛选
  minDailyAmplitude: number;     // 日均振幅最低要求 %, 3%
  minDailyTurnover: number;      // 日均成交额最低 万, 5000万

  // v3.3 新增参数
  priceDeviationSell: number;    // 价格偏离昨收阈值 %, 3% (因子24)
  volumeRatioThreshold: number;  // 量比异常阈值, 2.0 (因子25)
  avgPriceDeviationReturn: number; // 均价乖离回归阈值 %, 1.5% (因子26)
  difDivergenceLookback: number; // DIF背离回看周期, 20 (因子27)
  doubleBottomTolerance: number; // 双底容差 %, 0.5% (因子28)
  doubleBottomLookback: number;  // 双底回看周期, 30 (因子28)
  lateDropThreshold: number;     // 尾盘急跌阈值 %, -0.5% (因子29)
  avgPriceTurnLookback: number;  // 均价拐头回看根数, 5 (因子30)

  // v3.7 自定义因子参数
  pulseDropLookback: number;      // 脉冲下跌回看周期, 20 (因子31)
  pulseDropThreshold: number;     // 脉冲下跌阈值 %, 1.0 (因子31)
  vwapFlatSlopeThreshold: number; // 均线走平斜率阈值, 0.02 (因子31)
  consolidationRangePct: number;  // 横盘振幅阈值 %, 0.5 (因子33)
  consolidationLookback: number;  // 横盘回看根数, 10 (因子33)
  volumeBreakoutMultiplier: number; // 放量突破倍数, 2.0 (因子34)

  // KDJ参数 (v3.9新增)
  kdjPeriod: number;              // KDJ计算周期, 9
  kdjM1: number;                  // KDJ的K平滑系数, 3
  kdjM2: number;                  // KDJ的D平滑系数, 3
  kdjOversold: number;            // KDJ超卖区阈值, 20
  kdjOverbought: number;          // KDJ超买区阈值, 80
  jExtremeLow: number;            // J线极端低值阈值, 0
  jExtremeHigh: number;           // J线极端高值阈值, 100
}

// ── 默认策略参数（基于PDF文档）──────────────────────────

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,

  vwapDeviationSell: 2.0,     // PDF: 偏离均价线超过2%考虑卖出
  vwapDeviationBuy: 0.3,      // PDF: 回到均价线附近(±0.3%)买入

  volumeMultiplier: 2,
  volumeMultiplierStrong: 3,
  volumeShrinkRatio: 0.5,     // 量缩 = 成交量 < 均量的50%
  volumePulseMultiplier: 5,    // v3.2: 脉冲放量 = 成交量 > 均量的5倍
  consecutiveShrinkBars: 3,    // v3.2: 连续缩量根数

  momentumDropThreshold: -0.3,
  momentumDropStrong: -0.8,
  momentumRiseThreshold: 0.3,
  momentumRiseStrong: 0.8,

  rsiPeriod: 14,              // v3.2: RSI周期
  rsiOversold: 30,            // v3.2: RSI超卖线
  rsiOverbought: 70,          // v3.2: RSI超买线

  bollPeriod: 20,             // v3.2: 布林带周期
  bollMultiplier: 2,          // v3.2: 布林带标准差倍数

  spreadFloor: 1.5,           // PDF: 差价不足1.5%坚决不动
  spreadIdealMin: 2.0,        // PDF: 2%-3%理想做T区间
  spreadIdealMax: 3.0,

  stopLossPercent: 1.5,       // PDF: 上涨超过卖出价1.5%必须买回

  basePositionPct: 65,        // PDF: 底仓60%-70%
  tPositionPct: 35,           // PDF: T仓30%-40%

  maxDailyTCount: 2,          // PDF: 每日最多2次

  minDailyAmplitude: 3.0,     // PDF: 日均振幅≥3%
  minDailyTurnover: 5000,     // PDF: 日均成交额≥5000万

  priceDeviationSell: 3.0,       // v3.3: 价格偏离昨收3%考虑卖出
  volumeRatioThreshold: 2.0,     // v3.3: 量比>2为异常
  avgPriceDeviationReturn: 1.5,  // v3.3: 偏离均价1.5%后回归
  difDivergenceLookback: 20,     // v3.3: DIF背离回看20根
  doubleBottomTolerance: 0.5,    // v3.3: 双底容差0.5%
  doubleBottomLookback: 30,      // v3.3: 双底回看30根
  lateDropThreshold: -0.5,       // v3.3: 尾盘急跌阈值-0.5%
  avgPriceTurnLookback: 5,       // v3.3: 均价拐头回看5根

  pulseDropLookback: 20,          // v3.7: 脉冲下跌回看20根
  pulseDropThreshold: 1.0,        // v3.7: 脉冲下跌阈值1%
  vwapFlatSlopeThreshold: 0.02,   // v3.7: 均线走平斜率阈值
  consolidationRangePct: 0.5,     // v3.7: 横盘振幅阈值0.5%
  consolidationLookback: 10,      // v3.7: 横盘回看10根
  volumeBreakoutMultiplier: 2.0,  // v3.7: 放量突破倍数2x

  kdjPeriod: 9,                   // v3.9: KDJ周期9
  kdjM1: 3,                       // v3.9: KDJ的K平滑系数
  kdjM2: 3,                       // v3.9: KDJ的D平滑系数
  kdjOversold: 20,                // v3.9: KDJ超卖区阈值20
  kdjOverbought: 80,              // v3.9: KDJ超买区阈值80
  jExtremeLow: 0,                 // v3.9: J线极端低值0
  jExtremeHigh: 100,              // v3.9: J线极端高值100
};

// ── 时间窗口判断 ──────────────────────────────────────

export function getTimeWindow(timeStr: string): TimeWindow {
  // timeStr format: "HH:MM"
  const [h, m] = timeStr.split(":").map(Number);
  const minutes = h * 60 + m;

  if (minutes >= 570 && minutes < 600) return "开盘观察";          // 9:30-10:00
  if (minutes >= 600 && minutes < 630) return "正T卖出窗口";      // 10:00-10:30
  if (minutes >= 630 && minutes < 690) return "买回窗口";         // 10:30-11:30
  if (minutes >= 780 && minutes < 840) return "午后卖出窗口";     // 13:00-14:00
  if (minutes >= 840 && minutes < 870) return "午后买回窗口";     // 14:00-14:30
  if (minutes >= 870 && minutes <= 900) return "尾盘不操作";      // 14:30-15:00

  return "尾盘不操作"; // 默认
}

/**
 * 判断当前时间窗口是否允许卖出信号
 */
export function isSellWindow(timeWindow: TimeWindow): boolean {
  // 所有交易时段均允许卖出信号
  return true;
}

/**
 * 判断当前时间窗口是否允许买入信号
 */
export function isBuyWindow(timeWindow: TimeWindow): boolean {
  // 所有交易时段均允许买入信号
  return true;
}

/**
 * 判断当前时间窗口是否允许任何操作
 */
export function isTradingWindow(timeWindow: TimeWindow): boolean {
  // 所有时段均为有效交易时段（用户要求移除开盘观察和尾盘不操作的限制）
  return true;
}

// ── 市场环境判断 ──────────────────────────────────────

/**
 * 行情识别详细结果
 */
export interface RegimeDetail {
  regime: MarketRegime;
  confidence: number;        // 0-100, 识别置信度
  slope: number;             // VWAP斜率 (正=上行, 负=下行)
  momentum: number;          // 动量得分 (正=多头, 负=空头)
  volatility: number;        // 波动率 (%)
  vwapPosition: number;      // 价格相对VWAP位置 (-1~1, 正=上方)
  priceVsPrevClose: number;  // 价格相对昨收 (%)
  trendConsistency: number;  // 趋势一致性 (0~1, 越高越单边)
  description: string;       // 行情描述
}

/**
 * 综合行情识别引擎 v3.2
 *
 * 核心逻辑（5维评分体系）：
 * 1. VWAP斜率 - 均价线方向判断趋势 (权重30%)
 * 2. 价格动量 - 连续涨/跌的力度 (权重25%)
 * 3. 波动率 - 区分趋势与震荡 (权重20%)
 * 4. 价格位置 - 相对均价线/昨收价的位置 (权重15%)
 * 5. 趋势一致性 - 价格与均线的同步率 (权重10%)
 *
 * 识别结果：
 * - 上升通道：VWAP持续上行 + 价格站稳均线上方 + 正动量
 * - 下跌趋势：VWAP持续下行 + 价格被压制在均线下方 + 负动量
 * - 震荡市：VWAP走平 + 价格穿越均线反复 + 低一致性
 * - 横盘末期：极低波动率 + 价格窄幅围绕昨收
 */
export function detectMarketRegime(
  timeline: { price: number; avgPrice: number; changePercent: number; volume?: number }[],
  prevClose: number
): MarketRegime {
  const detail = detectMarketRegimeDetail(timeline, prevClose);
  return detail.regime;
}

/**
 * 详细的行情识别，返回各维度评分
 */
export function detectMarketRegimeDetail(
  timeline: { price: number; avgPrice: number; changePercent: number; volume?: number }[],
  prevClose: number
): RegimeDetail {
  const defaultResult: RegimeDetail = {
    regime: "震荡市",
    confidence: 0,
    slope: 0,
    momentum: 0,
    volatility: 0,
    vwapPosition: 0,
    priceVsPrevClose: 0,
    trendConsistency: 0,
    description: "数据不足，默认震荡",
  };

  if (timeline.length < 10) return defaultResult;

  // ── 1. VWAP斜率计算 ──
  // 使用线性回归计算均价线斜率方向
  const lookback = Math.min(timeline.length, 60);
  const recentData = timeline.slice(-lookback);
  const avgPrices = recentData.map(d => d.avgPrice);

  let slopeSumX = 0, slopeSumY = 0, slopeSumXY = 0, slopeSumX2 = 0;
  const n = avgPrices.length;
  for (let i = 0; i < n; i++) {
    slopeSumX += i;
    slopeSumY += avgPrices[i];
    slopeSumXY += i * avgPrices[i];
    slopeSumX2 += i * i;
  }
  const vwapSlope = n > 1
    ? (n * slopeSumXY - slopeSumX * slopeSumY) / (n * slopeSumX2 - slopeSumX * slopeSumX)
    : 0;

  // 斜率归一化：以昨收价为基准，斜率/昨收 * 100 得到每分钟变化率(%)
  const slopeNorm = prevClose > 0 ? (vwapSlope / prevClose) * 10000 : 0; // 单位: 万分之一/分钟

  // ── 2. 动量计算 ──
  // 连续上涨/下跌的力度，用最近N根的涨跌幅加权和
  const momentumLookback = Math.min(timeline.length, 30);
  const recentChanges = timeline.slice(-momentumLookback);
  let momentumScore = 0;
  for (let i = 0; i < recentChanges.length; i++) {
    // 越近的数据权重越高
    const weight = (i + 1) / recentChanges.length;
    momentumScore += recentChanges[i].changePercent * weight;
  }

  // ── 3. 波动率计算 ──
  const changes = recentData.map(d => d.changePercent);
  const avgChange = changes.reduce((s, v) => s + v, 0) / changes.length;
  const variance = changes.reduce((s, v) => s + (v - avgChange) ** 2, 0) / changes.length;
  const volatility = Math.sqrt(variance); // 标准差 (%)

  // ── 4. 价格位置评分 ──
  const lastPrice = timeline[timeline.length - 1].price;
  const lastAvgPrice = timeline[timeline.length - 1].avgPrice;

  // 价格相对VWAP位置 (-1 ~ +1)
  const vwapPosition = lastAvgPrice > 0
    ? Math.max(-1, Math.min(1, ((lastPrice - lastAvgPrice) / lastAvgPrice) * 20)) // 5%偏离=满分
    : 0;

  // 价格相对昨收价 (%)
  const priceVsPrevClose = prevClose > 0
    ? ((lastPrice - prevClose) / prevClose) * 100
    : 0;

  // ── 5. 趋势一致性 ──
  // 价格在均价线同一侧的比例 (0.5=穿越频繁=震荡, 1=单边=趋势)
  const aboveVWAP = recentData.filter(d => d.price > d.avgPrice).length;
  const belowVWAP = recentData.filter(d => d.price < d.avgPrice).length;
  const trendConsistency = Math.max(aboveVWAP, belowVWAP) / recentData.length;

  // ── 综合评分 ──
  // 趋势得分: 正=上升, 负=下跌, 接近0=震荡
  const trendScore =
    slopeNorm * 30 +        // VWAP斜率 (权重30) - 每万分之0.1的斜率贡献0.3
    momentumScore * 0.25 +  // 动量 (权重25) - 每涨1%贡献0.25
    vwapPosition * 15 +     // 价格位置 (权重15)
    (priceVsPrevClose > 0.5 ? 10 : priceVsPrevClose < -0.5 ? -10 : 0) + // 昨收位置
    (trendConsistency > 0.7 ? (aboveVWAP > belowVWAP ? 10 : -10) : 0);  // 一致性加成

  // ── 判断行情 ──
  let regime: MarketRegime;
  let confidence: number;
  let description: string;

  // 横盘末期：极低波动率 + 窄幅
  if (volatility < 0.3 && Math.abs(priceVsPrevClose) < 0.5 && Math.abs(vwapSlope / (prevClose || 1)) < 0.00001) {
    regime = "横盘末期";
    confidence = Math.min(90, 50 + (1 - volatility / 0.3) * 40);
    description = `极低波动率${volatility.toFixed(2)}%，窄幅横盘，等待方向突破`;
  }
  // 上升通道：正趋势得分 + 足够的斜率和动量
  else if (trendScore > 8 && slopeNorm > 0.05 && momentumScore > 0.2) {
    regime = "上升通道";
    confidence = Math.min(95, 40 + Math.min(trendScore, 40) + trendConsistency * 20);
    description = `VWAP斜率上行${slopeNorm.toFixed(2)}，动量+${momentumScore.toFixed(2)}%，价格站稳均线上方`;
  }
  // 下跌趋势：负趋势得分 + 足够的负斜率和动量
  else if (trendScore < -8 && slopeNorm < -0.05 && momentumScore < -0.2) {
    regime = "下跌趋势";
    confidence = Math.min(95, 40 + Math.min(-trendScore, 40) + trendConsistency * 20);
    description = `VWAP斜率下行${slopeNorm.toFixed(2)}，动量${momentumScore.toFixed(2)}%，价格被压在均线下方`;
  }
  // 弱上升（趋势得分正但不够强）
  else if (trendScore > 3 && slopeNorm > 0) {
    regime = "震荡市";
    confidence = 40 + trendScore * 2;
    description = `偏强震荡，VWAP微上行但力度不足，动量+${momentumScore.toFixed(2)}%`;
  }
  // 弱下跌（趋势得分负但不够强）
  else if (trendScore < -3 && slopeNorm < 0) {
    regime = "震荡市";
    confidence = 40 + (-trendScore) * 2;
    description = `偏弱震荡，VWAP微下行但力度不足，动量${momentumScore.toFixed(2)}%`;
  }
  // 默认震荡
  else {
    regime = "震荡市";
    confidence = 30 + volatility * 10;
    description = `典型震荡行情，VWAP走平，波动率${volatility.toFixed(2)}%，适合高抛低吸`;
  }

  return {
    regime,
    confidence: Math.round(confidence),
    slope: slopeNorm,
    momentum: momentumScore,
    volatility,
    vwapPosition,
    priceVsPrevClose,
    trendConsistency,
    description,
  };
}

/**
 * 根据市场环境调整信号策略
 */
export function getRegimeAdjustment(regime: MarketRegime): {
  allowSell: boolean;
  allowBuy: boolean;
  tPositionScale: number;  // T仓比例缩放
  signalStrengthBoost: number; // 信号强度调整
  description: string;
} {
  switch (regime) {
    case "震荡市":
      return { allowSell: true, allowBuy: true, tPositionScale: 1.0, signalStrengthBoost: 0, description: "最适合做T，正T为主" };
    case "上升通道":
      return { allowSell: true, allowBuy: true, tPositionScale: 0.5, signalStrengthBoost: -1, description: "谨慎做T，只做正T，T仓降至20%，买回要快" };
    case "下跌趋势":
      return { allowSell: true, allowBuy: true, tPositionScale: 0.3, signalStrengthBoost: -1, description: "谨慎做T，买入信号降级，T仓降至10-15%" };
    case "横盘末期":
      return { allowSell: true, allowBuy: true, tPositionScale: 0.5, signalStrengthBoost: -1, description: "减少做T频率，信号降级，等待方向明确" };
  }
}

// ── 差价底线检查 ──────────────────────────────────────

/**
 * 检查当前差价是否满足做T底线
 * @param sellPrice 卖出价格
 * @param buyPrice 买回价格
 * @param prevClose 昨收价（用于计算百分比）
 */
export function checkSpreadFloor(
  sellPrice: number,
  buyPrice: number,
  prevClose: number,
  config: StrategyConfig = DEFAULT_STRATEGY_CONFIG
): { pass: boolean; spreadPct: number; level: "绝对不做" | "不推荐" | "可以做" | "理想做T" | "优质做T" } {
  const spreadPct = Math.abs(sellPrice - buyPrice) / prevClose * 100;

  if (spreadPct < 1) return { pass: false, spreadPct, level: "绝对不做" };
  if (spreadPct < config.spreadFloor) return { pass: false, spreadPct, level: "不推荐" };
  if (spreadPct < config.spreadIdealMin) return { pass: true, spreadPct, level: "可以做" };
  if (spreadPct < config.spreadIdealMax) return { pass: true, spreadPct, level: "理想做T" };
  return { pass: true, spreadPct, level: "优质做T" };
}

// ── 关键价位计算 ──────────────────────────────────────

interface KeyPriceLevel {
  price: number;
  name: string;
  type: "support" | "resistance";
}

/**
 * 计算关键价位（支撑/阻力位）
 * 用于信号增强：在关键价位附近的信号更可靠
 *
 * 计算依据：
 * 1. 昨收价上下整数关口（心理支撑/阻力）
 * 2. 日内高低点（已走出的极值位）
 * 3. 均价线（动态支撑/阻力）
 * 4. Fibonacci回撤位（基于日内高低点的动态支撑/阻力）
 */
export function computeKeyPriceLevels(
  prevClose: number,
  timeline: TimelinePoint[]
): KeyPriceLevel[] {
  const levels: KeyPriceLevel[] = [];
  if (prevClose <= 0 || timeline.length < 5) return levels;

  // 1. 整数关口（基于昨收价找最近的整数位）
  //    对于百元股：每5元一个关口；对于十元股：每0.5元一个关口
  const step = prevClose >= 100 ? 5 : prevClose >= 50 ? 2 : prevClose >= 20 ? 1 : 0.5;

  // 找昨收价上下的整数关口
  const baseLevel = Math.floor(prevClose / step) * step;

  // 下方整数关口 = 支撑
  const lowerLevel = baseLevel;
  if (Math.abs(lowerLevel - prevClose) / prevClose > 0.001) { // 避免与昨收重合
    levels.push({ price: lowerLevel, name: `${lowerLevel}整数关`, type: "support" });
  }
  // 上方整数关口 = 阻力
  const upperLevel = baseLevel + step;
  if (Math.abs(upperLevel - prevClose) / prevClose > 0.001) {
    levels.push({ price: upperLevel, name: `${upperLevel}整数关`, type: "resistance" });
  }
  // 再远一层
  levels.push({ price: lowerLevel - step, name: `${lowerLevel - step}整数关`, type: "support" });
  levels.push({ price: upperLevel + step, name: `${upperLevel + step}整数关`, type: "resistance" });

  // 2. 日内已走出的高低点（天然支撑阻力）
  const prices = timeline.map(d => d.price);
  const intradayHigh = Math.max(...prices);
  const intradayLow = Math.min(...prices);

  if (intradayHigh > prevClose * 1.005) {
    levels.push({ price: intradayHigh, name: `日内高${intradayHigh.toFixed(2)}`, type: "resistance" });
  }
  if (intradayLow < prevClose * 0.995) {
    levels.push({ price: intradayLow, name: `日内低${intradayLow.toFixed(2)}`, type: "support" });
  }

  // 3. 昨收价本身（重要心理关口）
  levels.push({ price: prevClose, name: "昨收价", type: prevClose > timeline[timeline.length - 1].price ? "resistance" : "support" });

  // 4. 涨跌停价位（极端位置，强支撑/阻力）
  const limitUp = prevClose * 1.1;
  const limitDown = prevClose * 0.9;
  levels.push({ price: limitUp, name: `涨停${limitUp.toFixed(2)}`, type: "resistance" });
  levels.push({ price: limitDown, name: `跌停${limitDown.toFixed(2)}`, type: "support" });

  // 5. Fibonacci回撤位（基于日内高低点的动态支撑/阻力）(v3.9新增)
  //    当日内振幅足够大（>1%）时计算Fibonacci回撤位
  const range = intradayHigh - intradayLow;
  const rangePct = intradayLow > 0 ? (range / intradayLow) * 100 : 0;
  if (rangePct > 1.0) {
    const fibRatios = [0.236, 0.382, 0.5, 0.618, 0.786];
    for (const ratio of fibRatios) {
      const fibPrice = intradayHigh - range * ratio;
      const pctLabel = (ratio * 100).toFixed(1);
      // Fibonacci回撤位在当前价上方 = 阻力，下方 = 支撑
      const lastPrice = timeline[timeline.length - 1].price;
      const fibType: "support" | "resistance" = fibPrice < lastPrice ? "support" : "resistance";
      levels.push({ price: fibPrice, name: `Fib ${pctLabel}%`, type: fibType });
    }
  }

  // 按价格排序，去重（相近价位合并）
  levels.sort((a, b) => a.price - b.price);
  const deduped: KeyPriceLevel[] = [];
  for (const level of levels) {
    if (deduped.length === 0 || Math.abs(level.price - deduped[deduped.length - 1].price) / level.price > 0.002) {
      deduped.push(level);
    }
  }

  return deduped;
}

// ── 自定义因子类型 & 动态条件评估器 (v3.8) ────────────────

export interface CustomFactorCondition {
  key: string;          // 条件标识
  label: string;        // 条件名称
  description: string;  // 条件描述
  category: "price" | "volume" | "indicator" | "trend";  // 分类
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

// ── 核心信号生成 ──────────────────────────────────────

interface TimelinePoint {
  time: string;
  price: number;
  avgPrice: number;
  volume: number;
  changePercent: number;
}

/**
 * 动态条件评估器 (v3.8)
 * 根据条件key，在分时线数据上逐根评估该条件是否满足
 * 返回 true 表示该条件在当前时间点 i 成立
 */
function evaluateCondition(
  conditionKey: string,
  timeline: TimelinePoint[],
  i: number,
  avgVol: number,
  prevClose: number,
  config: StrategyConfig,
  macdByTime: Map<string, { dif: number; dea: number; macd: number }>,
  rsiValues: number[],
  bollValues: { upper: number; middle: number; lower: number }[],
  kdjValuesParam?: { k: number; d: number; j: number }[],
  openPriceParam?: number,
): boolean {
  if (i < 2) return false;
  const cur = timeline[i];
  const prev = timeline[i - 1];

  switch (conditionKey) {
    // ── 价格形态 ──
    case "pulse_drop": {
      // 短时间内价格快速下跌超过1%
      const lookback = Math.min(i + 1, config.pulseDropLookback);
      const recentHigh = Math.max(...timeline.slice(i - lookback + 1, i + 1).map(d => d.price));
      const dropPct = ((recentHigh - cur.price) / recentHigh) * 100;
      return dropPct >= config.pulseDropThreshold;
    }
    case "pulse_rise": {
      // 短时间内价格快速上涨超过1%
      const lookback = Math.min(i + 1, config.pulseDropLookback);
      const recentLow = Math.min(...timeline.slice(i - lookback + 1, i + 1).map(d => d.price));
      const rallyPct = ((cur.price - recentLow) / recentLow) * 100;
      return rallyPct >= config.pulseDropThreshold;
    }
    case "price_above_vwap":
      return cur.price > cur.avgPrice;
    case "price_below_vwap":
      return cur.price < cur.avgPrice;
    case "vwap_cross_up":
      return prev.price < prev.avgPrice && cur.price > cur.avgPrice;
    case "vwap_cross_down":
      return prev.price > prev.avgPrice && cur.price < cur.avgPrice;
    case "double_bottom": {
      // 双底形态：在回看周期内找到两个相近的低点
      const lookback = Math.min(i, config.doubleBottomLookback);
      let minCount = 0;
      const threshold = prevClose * config.doubleBottomTolerance / 100;
      const curLow = cur.price;
      for (let k = Math.max(0, i - lookback); k < i; k++) {
        if (Math.abs(timeline[k].price - curLow) <= threshold) minCount++;
      }
      return minCount >= 1; // 至少有一个相近低点
    }
    case "prev_close_support": {
      // 价格回到昨收价附近企稳 (±0.3%)
      if (prevClose <= 0) return false;
      const devPct = Math.abs((cur.price - prevClose) / prevClose) * 100;
      return devPct < 0.3;
    }
    case "late_drop": {
      // 尾盘急跌：14:00后快速下跌
      const timeStr = cur.time;
      if (!timeStr.startsWith("14") && !timeStr.startsWith("1")) return false;
      const hour = parseInt(timeStr.split(":")[0]);
      if (hour < 14) return false;
      if (i < 1) return false;
      const dropPct = ((cur.price - prev.price) / prev.price) * 100;
      return dropPct <= -config.lateDropThreshold;
    }

    // ── 量能特征 ──
    case "vol_shrink": {
      // 成交量缩小至均量的50%以下，且前一分钟也缩量
      const volShrinking = cur.volume < avgVol * config.volumeShrinkRatio;
      const prevVolShrinking = prev.volume < avgVol * config.volumeShrinkRatio;
      return volShrinking && prevVolShrinking;
    }
    case "vol_expand":
      // 成交量显著放大至均量的2倍以上
      return cur.volume > avgVol * config.volumeBreakoutMultiplier;
    case "volume_price_divergence": {
      // 量价背离：价格创新高但量缩 / 价格创新低但量缩
      if (i < 5) return false;
      const recentPrices = timeline.slice(i - 5, i + 1).map(d => d.price);
      const recentVols = timeline.slice(i - 5, i + 1).map(d => d.volume);
      const maxPrice = Math.max(...recentPrices);
      const maxVol = Math.max(...recentVols);
      const minPrice = Math.min(...recentPrices);
      const minVol = Math.min(...recentVols);
      // 价格创新高但量在缩小（顶背离）或价格创新低但量在缩小（底背离）
      const topDivergence = cur.price === maxPrice && cur.volume < maxVol * 0.6;
      const bottomDivergence = cur.price === minPrice && cur.volume < maxVol * 0.6;
      return topDivergence || bottomDivergence;
    }

    // ── 技术指标 ──
    case "vwap_deviation_high":
      // 价格偏离VWAP超过2%
      return cur.avgPrice > 0 && ((cur.price - cur.avgPrice) / cur.avgPrice) * 100 > config.vwapDeviationSell;
    case "vwap_deviation_low":
      // 价格偏离VWAP超过-2%
      return cur.avgPrice > 0 && ((cur.price - cur.avgPrice) / cur.avgPrice) * 100 < -config.vwapDeviationSell;
    case "rsi_oversold":
      // RSI低于30
      return i < rsiValues.length && !isNaN(rsiValues[i]) && rsiValues[i] < config.rsiOversold;
    case "rsi_overbought":
      // RSI高于70
      return i < rsiValues.length && !isNaN(rsiValues[i]) && rsiValues[i] > config.rsiOverbought;
    case "boll_lower":
      // 价格触及布林带下轨
      return i < bollValues.length && !isNaN(bollValues[i].lower) && cur.price <= bollValues[i].lower * 1.002;
    case "boll_upper":
      // 价格触及布林带上轨
      return i < bollValues.length && !isNaN(bollValues[i].upper) && cur.price >= bollValues[i].upper * 0.998;
    case "macd_golden": {
      // MACD金叉：DIF上穿DEA
      const macd = macdByTime.get(cur.time);
      const prevMacd = macdByTime.get(prev.time);
      if (!macd || !prevMacd) return false;
      return prevMacd.dif <= prevMacd.dea && macd.dif > macd.dea;
    }
    case "macd_dead": {
      // MACD死叉：DIF下穿DEA
      const macd = macdByTime.get(cur.time);
      const prevMacd = macdByTime.get(prev.time);
      if (!macd || !prevMacd) return false;
      return prevMacd.dif >= prevMacd.dea && macd.dif < macd.dea;
    }

    // ── 趋势判断 ──
    case "vwap_flat": {
      // VWAP均价线斜率趋近于零（走平）
      const flatLookback = Math.min(5, i);
      const recentAvgPrices = timeline.slice(i - flatLookback + 1, i + 1).map(d => d.avgPrice);
      if (recentAvgPrices.length < 3) return false;
      const sn = recentAvgPrices.length;
      let sx = 0, sy = 0, sxy = 0, sx2 = 0;
      for (let k = 0; k < sn; k++) { sx += k; sy += recentAvgPrices[k]; sxy += k * recentAvgPrices[k]; sx2 += k * k; }
      const slope = (sn * sxy - sx * sy) / (sn * sx2 - sx * sx);
      const slopeNorm = prevClose > 0 ? Math.abs((slope / prevClose) * 10000) : 0;
      return slopeNorm < config.vwapFlatSlopeThreshold;
    }
    case "vwap_up": {
      // VWAP均价线斜率为正（上行）
      const flatLookback = Math.min(5, i);
      const recentAvgPrices = timeline.slice(i - flatLookback + 1, i + 1).map(d => d.avgPrice);
      if (recentAvgPrices.length < 3) return false;
      const sn = recentAvgPrices.length;
      let sx = 0, sy = 0, sxy = 0, sx2 = 0;
      for (let k = 0; k < sn; k++) { sx += k; sy += recentAvgPrices[k]; sxy += k * recentAvgPrices[k]; sx2 += k * k; }
      const slope = (sn * sxy - sx * sy) / (sn * sx2 - sx * sx);
      const slopeNorm = prevClose > 0 ? (slope / prevClose) * 10000 : 0;
      return slopeNorm > config.vwapFlatSlopeThreshold;
    }
    case "vwap_down": {
      // VWAP均价线斜率为负（下行）
      const flatLookback = Math.min(5, i);
      const recentAvgPrices = timeline.slice(i - flatLookback + 1, i + 1).map(d => d.avgPrice);
      if (recentAvgPrices.length < 3) return false;
      const sn = recentAvgPrices.length;
      let sx = 0, sy = 0, sxy = 0, sx2 = 0;
      for (let k = 0; k < sn; k++) { sx += k; sy += recentAvgPrices[k]; sxy += k * recentAvgPrices[k]; sx2 += k * k; }
      const slope = (sn * sxy - sx * sy) / (sn * sx2 - sx * sx);
      const slopeNorm = prevClose > 0 ? (slope / prevClose) * 10000 : 0;
      return slopeNorm < -config.vwapFlatSlopeThreshold;
    }
    case "consolidation": {
      // 缩量横盘：价格窄幅盘整+成交量萎缩
      if (i < config.consolidationLookback) return false;
      const lookStart = i - config.consolidationLookback + 1;
      // Check volume shrinking
      let allLowVol = true;
      for (let k = Math.max(lookStart, i - 4); k <= i; k++) {
        if (timeline[k].volume >= avgVol * 0.6) { allLowVol = false; break; }
      }
      // Check price range narrow
      const rangeSlice = timeline.slice(lookStart, i + 1);
      const rangeHigh = Math.max(...rangeSlice.map(d => d.price));
      const rangeLow = Math.min(...rangeSlice.map(d => d.price));
      const rangePct = prevClose > 0 ? ((rangeHigh - rangeLow) / prevClose) * 100 : 0;
      return allLowVol && rangePct < config.consolidationRangePct;
    }

    // ── 价格形态（补充） ──
    case "new_high": {
      // 创日内新高：当前价格为今日到目前为止的最高价
      const allPrices = timeline.slice(0, i + 1).map(d => d.price);
      return cur.price >= Math.max(...allPrices) && i > 5;
    }
    case "new_low": {
      // 创日内新低：当前价格为今日到目前为止的最低价
      const allPricesL = timeline.slice(0, i + 1).map(d => d.price);
      return cur.price <= Math.min(...allPricesL) && i > 5;
    }
    case "bounce_from_low": {
      // 低位反弹：从日内低点反弹超过1%
      if (i < 10) return false;
      const recentLowPrice = Math.min(...timeline.slice(Math.max(0, i - 30), i + 1).map(d => d.price));
      const bouncePct = ((cur.price - recentLowPrice) / recentLowPrice) * 100;
      return bouncePct >= 1.0 && cur.price > prev.price;
    }
    case "pullback_from_high": {
      // 高位回落：从日内高点回落超过1%
      if (i < 10) return false;
      const recentHighPrice = Math.max(...timeline.slice(Math.max(0, i - 30), i + 1).map(d => d.price));
      const pullbackPct = ((recentHighPrice - cur.price) / recentHighPrice) * 100;
      return pullbackPct >= 1.0 && cur.price < prev.price;
    }
    case "three_black_crows": {
      // 三连阴：连续3根分钟线收跌
      if (i < 3) return false;
      return timeline[i].price < timeline[i - 1].price &&
             timeline[i - 1].price < timeline[i - 2].price &&
             timeline[i - 2].price < timeline[i - 3].price;
    }
    case "three_white_soldiers": {
      // 三连阳：连续3根分钟线收涨
      if (i < 3) return false;
      return timeline[i].price > timeline[i - 1].price &&
             timeline[i - 1].price > timeline[i - 2].price &&
             timeline[i - 2].price > timeline[i - 3].price;
    }
    case "prev_close_resistance": {
      // 昨收价压力：价格从下方接近昨收价受阻回落
      if (prevClose <= 0 || i < 1) return false;
      const approachingFromBelow = prev.price < prevClose && cur.price >= prevClose * 0.997;
      const fallingBack = cur.price < cur.high || cur.price <= prev.price;
      return approachingFromBelow && cur.price <= prevClose * 1.003 && cur.price < prev.price;
    }
    case "late_rally": {
      // 尾盘拉升：14:00后快速上涨
      const timeStr2 = cur.time;
      const hour2 = parseInt(timeStr2.split(":")[0]);
      if (hour2 < 14) return false;
      if (i < 1) return false;
      const risePct = ((cur.price - prev.price) / prev.price) * 100;
      return risePct >= Math.abs(config.lateDropThreshold);
    }

    // ── 量能特征（补充） ──
    case "vol_sudden_spike": {
      // 突放巨量：成交量瞬间放大至均量5倍以上
      return cur.volume > avgVol * config.volumePulseMultiplier;
    }
    case "vol_dry_up": {
      // 地量：成交量降至均量20%以下
      return avgVol > 0 && cur.volume < avgVol * 0.2;
    }
    case "vol_climax": {
      // 天量：成交量创日内新高
      if (i < 10) return false;
      const maxVol = Math.max(...timeline.slice(0, i + 1).map(d => d.volume));
      return cur.volume >= maxVol;
    }
    case "vol_increasing": {
      // 量能递增：连续3分钟成交量逐步放大
      if (i < 3) return false;
      return timeline[i].volume > timeline[i - 1].volume &&
             timeline[i - 1].volume > timeline[i - 2].volume;
    }
    case "vol_decreasing": {
      // 量能递减：连续3分钟成交量逐步缩小
      if (i < 3) return false;
      return timeline[i].volume < timeline[i - 1].volume &&
             timeline[i - 1].volume < timeline[i - 2].volume;
    }

    // ── 技术指标（补充） ──
    case "rsi_mid_range": {
      // RSI中性区间：RSI在40-60之间
      return i < rsiValues.length && !isNaN(rsiValues[i]) &&
             rsiValues[i] >= 40 && rsiValues[i] <= 60;
    }
    case "boll_squeeze": {
      // 布林带收窄：布林带宽度收窄至近期最低
      if (i < config.bollPeriod || i >= bollValues.length || isNaN(bollValues[i].upper) || isNaN(bollValues[i].lower)) return false;
      const curWidth = bollValues[i].upper - bollValues[i].lower;
      const midPrice = bollValues[i].middle || prevClose;
      if (midPrice <= 0) return false;
      const curWidthPct = (curWidth / midPrice) * 100;
      // 布林带宽度小于2%视为收窄
      return curWidthPct < 2.0;
    }
    case "macd_above_zero": {
      // MACD零轴上方：DIF和DEA均在零轴上方
      const macdAZ = macdByTime.get(cur.time);
      if (!macdAZ) return false;
      return macdAZ.dif > 0 && macdAZ.dea > 0;
    }
    case "macd_below_zero": {
      // MACD零轴下方：DIF和DEA均在零轴下方
      const macdBZ = macdByTime.get(cur.time);
      if (!macdBZ) return false;
      return macdBZ.dif < 0 && macdBZ.dea < 0;
    }
    case "macd_histogram_shrink": {
      // MACD柱缩短：MACD红绿柱长度缩短，动能衰减
      const macdHS = macdByTime.get(cur.time);
      const prevMacdHS = macdByTime.get(prev.time);
      if (!macdHS || !prevMacdHS) return false;
      const curHist = Math.abs(macdHS.macd);
      const prevHist = Math.abs(prevMacdHS.macd);
      return curHist < prevHist && curHist > 0;
    }

    // ── 趋势判断（补充） ──
    case "trend_reversal_up": {
      // 趋势反转向上：下跌趋势后VWAP拐头向上
      if (i < config.avgPriceTurnLookback + 2) return false;
      // 之前VWAP在下行
      const prevSlopeSlice = timeline.slice(i - config.avgPriceTurnLookback - 1, i - 1).map(d => d.avgPrice);
      const curSlopeSlice = timeline.slice(i - config.avgPriceTurnLookback + 1, i + 1).map(d => d.avgPrice);
      if (prevSlopeSlice.length < 3 || curSlopeSlice.length < 3) return false;
      const calcSlope = (arr: number[]) => {
        const n = arr.length;
        let sx = 0, sy = 0, sxy = 0, sx2 = 0;
        for (let k = 0; k < n; k++) { sx += k; sy += arr[k]; sxy += k * arr[k]; sx2 += k * k; }
        return (n * sxy - sx * sy) / (n * sx2 - sx * sx);
      };
      const prevSlope = calcSlope(prevSlopeSlice);
      const curSlope = calcSlope(curSlopeSlice);
      const normPrev = prevClose > 0 ? (prevSlope / prevClose) * 10000 : 0;
      const normCur = prevClose > 0 ? (curSlope / prevClose) * 10000 : 0;
      return normPrev < -config.vwapFlatSlopeThreshold && normCur > config.vwapFlatSlopeThreshold;
    }
    case "trend_reversal_down": {
      // 趋势反转向下：上涨趋势后VWAP拐头向下
      if (i < config.avgPriceTurnLookback + 2) return false;
      const prevSlopeSliceD = timeline.slice(i - config.avgPriceTurnLookback - 1, i - 1).map(d => d.avgPrice);
      const curSlopeSliceD = timeline.slice(i - config.avgPriceTurnLookback + 1, i + 1).map(d => d.avgPrice);
      if (prevSlopeSliceD.length < 3 || curSlopeSliceD.length < 3) return false;
      const calcSlopeD = (arr: number[]) => {
        const n = arr.length;
        let sx = 0, sy = 0, sxy = 0, sx2 = 0;
        for (let k = 0; k < n; k++) { sx += k; sy += arr[k]; sxy += k * arr[k]; sx2 += k * k; }
        return (n * sxy - sx * sy) / (n * sx2 - sx * sx);
      };
      const prevSlopeD = calcSlopeD(prevSlopeSliceD);
      const curSlopeD = calcSlopeD(curSlopeSliceD);
      const normPrevD = prevClose > 0 ? (prevSlopeD / prevClose) * 10000 : 0;
      const normCurD = prevClose > 0 ? (curSlopeD / prevClose) * 10000 : 0;
      return normPrevD > config.vwapFlatSlopeThreshold && normCurD < -config.vwapFlatSlopeThreshold;
    }

    // ── 时间窗口 ──
    case "first_30min": {
      // 开盘30分钟 9:30-10:00
      const [h1, m1] = cur.time.split(":").map(Number);
      const mins1 = h1 * 60 + m1;
      return mins1 >= 570 && mins1 < 600;
    }
    case "morning_peak": {
      // 早盘高峰 10:00-11:00
      const [h2, m2] = cur.time.split(":").map(Number);
      const mins2 = h2 * 60 + m2;
      return mins2 >= 600 && mins2 < 660;
    }
    case "pre_lunch": {
      // 午前尾段 11:00-11:30
      const [h3, m3] = cur.time.split(":").map(Number);
      const mins3 = h3 * 60 + m3;
      return mins3 >= 660 && mins3 < 690;
    }
    case "afternoon_open": {
      // 午后开盘 13:00-13:30
      const [h4, m4] = cur.time.split(":").map(Number);
      const mins4 = h4 * 60 + m4;
      return mins4 >= 780 && mins4 < 810;
    }
    case "late_session": {
      // 尾盘时段 14:30-15:00
      const [h5, m5] = cur.time.split(":").map(Number);
      const mins5 = h5 * 60 + m5;
      return mins5 >= 870 && mins5 <= 900;
    }
    case "mid_day": {
      // 盘中平稳期 10:30-11:20 及 13:30-14:00
      const [h6, m6] = cur.time.split(":").map(Number);
      const mins6 = h6 * 60 + m6;
      return (mins6 >= 630 && mins6 < 680) || (mins6 >= 810 && mins6 < 840);
    }

    // ── 新增：价格形态进阶 ──
    case "five_bar_drop": {
      // 五连阴：连续5根分钟线收跌，空头加速
      if (i < 5) return false;
      for (let k = 0; k < 5; k++) {
        if (timeline[i - k].price >= timeline[i - k - 1].price) return false;
      }
      return true;
    }
    case "five_bar_rise": {
      // 五连阳：连续5根分钟线收涨，多头加速
      if (i < 5) return false;
      for (let k = 0; k < 5; k++) {
        if (timeline[i - k].price <= timeline[i - k - 1].price) return false;
      }
      return true;
    }
    case "vwap_touch_below": {
      // 触及均线后回落（下方）：价格从下方触及VWAP后未能突破
      if (i < 2) return false;
      const prev2 = timeline[i - 2];
      return prev2.price < prev2.avgPrice && prev.price >= prev.avgPrice * 0.998 && cur.price < cur.avgPrice;
    }
    case "vwap_touch_above": {
      // 触及均线后反弹（上方）：价格从上方触及VWAP后获得支撑
      if (i < 2) return false;
      const prev2a = timeline[i - 2];
      return prev2a.price > prev2a.avgPrice && prev.price <= prev.avgPrice * 1.002 && cur.price > cur.avgPrice;
    }
    case "price_gap_up": {
      // 向上跳空：当前分钟开盘价高于前一分钟最高价（简化用价格比较）
      if (i < 1) return false;
      const gapPct = ((cur.price - prev.price) / prev.price) * 100;
      return gapPct >= 0.5 && cur.volume > avgVol;
    }
    case "price_gap_down": {
      // 向下跳空：当前分钟价格低于前一分钟价格超过0.5%
      if (i < 1) return false;
      const gapDownPct = ((prev.price - cur.price) / prev.price) * 100;
      return gapDownPct >= 0.5 && cur.volume > avgVol;
    }

    // ── 新增：量能进阶 ──
    case "vol_climax_shrink": {
      // 天量后缩量：刚出现天量后立刻缩量，可能是脉冲结束
      if (i < 2) return false;
      const prevWasClimax = prev.volume >= Math.max(...timeline.slice(Math.max(0, i - 30), i).map(d => d.volume));
      const curShrinking = cur.volume < prev.volume * 0.5;
      return prevWasClimax && curShrinking;
    }
    case "vol_gradual_increase": {
      // 温和放量：连续5分钟成交量温和递增（每根不超过前根1.5倍但持续增长）
      if (i < 5) return false;
      for (let k = 0; k < 4; k++) {
        const ratio = timeline[i - k].volume / timeline[i - k - 1].volume;
        if (ratio <= 1.0 || ratio > 1.5) return false;
      }
      return true;
    }
    case "vol_price_up_sync": {
      // 量价齐升：价格上涨+量能放大，多头健康
      if (i < 1) return false;
      return cur.price > prev.price && cur.volume > prev.volume && cur.volume > avgVol;
    }
    case "vol_price_down_sync": {
      // 量价齐跌：价格下跌+量能放大，空头强势
      if (i < 1) return false;
      return cur.price < prev.price && cur.volume > prev.volume && cur.volume > avgVol;
    }

    // ── 新增：技术指标进阶 ──
    case "rsi_rebound": {
      // RSI超卖回升：RSI从超卖区（<30）回升到30以上
      if (i < 2 || i >= rsiValues.length) return false;
      return !isNaN(rsiValues[i]) && !isNaN(rsiValues[i - 1]) &&
             rsiValues[i - 1] < config.rsiOversold && rsiValues[i] >= config.rsiOversold;
    }
    case "rsi_pullback": {
      // RSI超买回落：RSI从超买区（>70）回落到70以下
      if (i < 2 || i >= rsiValues.length) return false;
      return !isNaN(rsiValues[i]) && !isNaN(rsiValues[i - 1]) &&
             rsiValues[i - 1] > config.rsiOverbought && rsiValues[i] <= config.rsiOverbought;
    }
    case "boll_middle_support": {
      // 布林中轨支撑：价格回落到布林中轨附近获得支撑
      if (i >= bollValues.length || isNaN(bollValues[i].middle)) return false;
      const middle = bollValues[i].middle;
      return cur.price >= middle * 0.995 && cur.price <= middle * 1.005;
    }
    case "macd_golden_zero": {
      // MACD零轴金叉：DIF和DEA在零轴附近金叉，更强势信号
      const macdGZ = macdByTime.get(cur.time);
      const prevMacdGZ = macdByTime.get(prev.time);
      if (!macdGZ || !prevMacdGZ) return false;
      return prevMacdGZ.dif <= prevMacdGZ.dea && macdGZ.dif > macdGZ.dea &&
             macdGZ.dif > -0.01 && macdGZ.dif < 0.05;
    }

    // ── 新增：趋势进阶 ──
    case "ma5_cross_up": {
      // 价格上穿MA5参考线：当前价格高于今MA5且前一根低于今MA5（简化：用近期均价模拟）
      if (!prevClose || prevClose <= 0 || i < 5) return false;
      // 用5分钟均线近似MA5
      const ma5cur = timeline.slice(Math.max(0, i - 4), i + 1).reduce((s, d) => s + d.price, 0) / Math.min(5, i + 1);
      const ma5prev = timeline.slice(Math.max(0, i - 5), i).reduce((s, d) => s + d.price, 0) / Math.min(5, i);
      return prev.price < ma5prev && cur.price > ma5cur;
    }
    case "ma5_cross_down": {
      // 价格下穿MA5参考线
      if (!prevClose || prevClose <= 0 || i < 5) return false;
      const ma5curD = timeline.slice(Math.max(0, i - 4), i + 1).reduce((s, d) => s + d.price, 0) / Math.min(5, i + 1);
      const ma5prevD = timeline.slice(Math.max(0, i - 5), i).reduce((s, d) => s + d.price, 0) / Math.min(5, i);
      return prev.price > ma5prevD && cur.price < ma5curD;
    }
    case "price_acceleration_up": {
      // 价格加速上涨：每分钟涨幅递增
      if (i < 3) return false;
      const c1 = timeline[i].price - timeline[i - 1].price;
      const c2 = timeline[i - 1].price - timeline[i - 2].price;
      const c3 = timeline[i - 2].price - timeline[i - 3].price;
      return c1 > c2 && c2 > c3 && c1 > 0;
    }
    case "price_acceleration_down": {
      // 价格加速下跌：每分钟跌幅递增
      if (i < 3) return false;
      const d1 = timeline[i - 1].price - timeline[i].price;
      const d2 = timeline[i - 2].price - timeline[i - 1].price;
      const d3 = timeline[i - 3].price - timeline[i - 2].price;
      return d1 > d2 && d2 > d3 && d1 > 0;
    }
    case "range_breakout_up": {
      // 区间向上突破：价格突破近20分钟价格区间上沿
      if (i < 20) return false;
      const range20 = timeline.slice(i - 20, i);
      const range20High = Math.max(...range20.map(d => d.price));
      return cur.price > range20High && cur.volume > avgVol;
    }
    case "range_breakout_down": {
      // 区间向下突破：价格跌破近20分钟价格区间下沿
      if (i < 20) return false;
      const range20D = timeline.slice(i - 20, i);
      const range20Low = Math.min(...range20D.map(d => d.price));
      return cur.price < range20Low && cur.volume > avgVol;
    }

    // ── 新增：时间窗口进阶 ──
    case "first_15min": {
      // 开盘15分钟 9:30-9:45，波动最剧烈
      const [h7, m7] = cur.time.split(":").map(Number);
      const mins7 = h7 * 60 + m7;
      return mins7 >= 570 && mins7 < 585;
    }
    case "last_15min": {
      // 收盘前15分钟 14:45-15:00，尾盘异动高发
      const [h8, m8] = cur.time.split(":").map(Number);
      const mins8 = h8 * 60 + m8;
      return mins8 >= 885 && mins8 <= 900;
    }
    case "afternoon_peak": {
      // 午后高峰 13:30-14:30，午后主要交易时段
      const [h9, m9] = cur.time.split(":").map(Number);
      const mins9 = h9 * 60 + m9;
      return mins9 >= 810 && mins9 < 870;
    }
    case "lunch_gap": {
      // 午间休市后首根 13:00-13:05，方向确认关键期
      const [h10, m10] = cur.time.split(":").map(Number);
      const mins10 = h10 * 60 + m10;
      return mins10 >= 780 && mins10 < 785;
    }

    // ── 新增：综合形态 ──
    case "v_shape_bottom": {
      // V型反转：急跌后快速反弹，形成V型底部
      if (i < 10) return false;
      const recentLowV = Math.min(...timeline.slice(Math.max(0, i - 10), i + 1).map(d => d.price));
      const recentHighV = Math.max(...timeline.slice(Math.max(0, i - 10), i + 1).map(d => d.price));
      const curIsNearHigh = cur.price >= recentHighV * 0.998;
      const hasDeepDip = (recentHighV - recentLowV) / recentHighV * 100 >= 1.5;
      return curIsNearHigh && hasDeepDip && cur.price > prev.price;
    }
    case "inverted_v_top": {
      // 倒V型反转：急涨后快速回落，形成倒V型顶部
      if (i < 10) return false;
      const recentLowIV = Math.min(...timeline.slice(Math.max(0, i - 10), i + 1).map(d => d.price));
      const recentHighIV = Math.max(...timeline.slice(Math.max(0, i - 10), i + 1).map(d => d.price));
      const curIsNearLow = cur.price <= recentLowIV * 1.002;
      const hasSharpRise = (recentHighIV - recentLowIV) / recentLowIV * 100 >= 1.5;
      return curIsNearLow && hasSharpRise && cur.price < prev.price;
    }
    case "higher_low": {
      // 底部抬高：近20分钟内低点逐步抬高，多头格局
      if (i < 20) return false;
      const seg1 = timeline.slice(i - 20, i - 10).map(d => d.price);
      const seg2 = timeline.slice(i - 10, i).map(d => d.price);
      const low1 = Math.min(...seg1);
      const low2 = Math.min(...seg2);
      return low2 > low1;
    }
    case "lower_high": {
      // 顶部降低：近20分钟内高点逐步降低，空头格局
      if (i < 20) return false;
      const seg1H = timeline.slice(i - 20, i - 10).map(d => d.price);
      const seg2H = timeline.slice(i - 10, i).map(d => d.price);
      const high1 = Math.max(...seg1H);
      const high2 = Math.max(...seg2H);
      return high2 < high1;
    }

    // ── KDJ指标 (v3.9新增) ──
    case "kdj_golden": {
      // KDJ金叉：K线上穿D线
      if (!kdjValuesParam || i >= kdjValuesParam.length || i < 1) return false;
      const curK = kdjValuesParam[i];
      const prevK = kdjValuesParam[i - 1];
      if (isNaN(curK.k) || isNaN(curK.d) || isNaN(prevK.k) || isNaN(prevK.d)) return false;
      return prevK.k <= prevK.d && curK.k > curK.d;
    }
    case "kdj_death": {
      // KDJ死叉：K线下穿D线
      if (!kdjValuesParam || i >= kdjValuesParam.length || i < 1) return false;
      const curKD = kdjValuesParam[i];
      const prevKD = kdjValuesParam[i - 1];
      if (isNaN(curKD.k) || isNaN(curKD.d) || isNaN(prevKD.k) || isNaN(prevKD.d)) return false;
      return prevKD.k >= prevKD.d && curKD.k < curKD.d;
    }
    case "j_oversold": {
      // J线超卖：J值低于极端低值阈值
      if (!kdjValuesParam || i >= kdjValuesParam.length) return false;
      const jVal = kdjValuesParam[i].j;
      return !isNaN(jVal) && jVal < config.jExtremeLow;
    }
    case "j_overbought": {
      // J线超买：J值高于极端高值阈值
      if (!kdjValuesParam || i >= kdjValuesParam.length) return false;
      const jValOB = kdjValuesParam[i].j;
      return !isNaN(jValOB) && jValOB > config.jExtremeHigh;
    }
    case "kdj_above_80": {
      // KDJ在80以上超买区：K或D值在80以上
      if (!kdjValuesParam || i >= kdjValuesParam.length) return false;
      const kdj80 = kdjValuesParam[i];
      return !isNaN(kdj80.k) && !isNaN(kdj80.d) && (kdj80.k > config.kdjOverbought || kdj80.d > config.kdjOverbought);
    }
    case "kdj_below_20": {
      // KDJ在20以下超卖区：K或D值在20以下
      if (!kdjValuesParam || i >= kdjValuesParam.length) return false;
      const kdj20 = kdjValuesParam[i];
      return !isNaN(kdj20.k) && !isNaN(kdj20.d) && (kdj20.k < config.kdjOversold || kdj20.d < config.kdjOversold);
    }

    case "gap_up_open": {
      // 高开：开盘价高于昨收价
      if (openPriceParam === undefined || prevClose <= 0) return false;
      return openPriceParam > prevClose;
    }
    case "gap_up_drop": {
      // 高开后回落：开盘价高于昨收价，且当前价格跌破开盘价0.01元
      if (openPriceParam === undefined || prevClose <= 0) return false;
      return openPriceParam > prevClose && cur.price <= openPriceParam - 0.01;
    }

    default:
      return false;
  }
}

/**
 * 生成做T交易信号（分析模式 - v3.9）
 * 
 * v3.8 改进（动态自定义因子）：
 * - 新增 customFactors 参数，支持用户自定义因子的动态评估
 * - 动态条件评估器 evaluateCondition() 支持50+种条件组合
 * - 用户在UI中创建的自定义因子会实时应用到分时线信号检测
 * - 所有条件必须同时满足才触发信号（AND逻辑）
 * 
 * v3.7 改进（自定义因子扩展）：
 * - 因子31: 脉冲下跌缩量企稳 — 脉冲下跌后量能萎缩+VWAP走平 → 强买信号
 * - 因子32: 脉冲拉升缩量滞涨 — 脉冲拉升后量能萎缩+VWAP走平 → 强卖信号
 * - 因子33: 缩量横盘突破 — 缩量窄幅盘整后价格向上突破 → 强买信号
 * - 因子34: 放量突破均线 — 成交量放大+价格从均线下方突破到上方 → 强买信号
 * - 因子35: KDJ金叉买入 — K线上穿D线(金叉)，尤其J<20超卖区更可靠 → 买入(反T)
 * - 因子36: KDJ死叉卖出 — K线下穿D线(死叉)，尤其J>80超买区更可靠 → 卖出(正T)
 * - 因子37: J线超卖反弹 — J值低于0后拐头向上 → 买入(反T)
 * - 因子38: J线超买回落 — J值高于100后拐头向下 → 卖出(正T)
 * - 因子39: 递增放量 — 连续3+分钟成交量递增+价格同步上涨 → 买入(反T)
 * - 因子40: 高开回落卖出 — 早盘高开股票，价格跌破开盘价0.01元 → 卖出(正T)
 * 
 * v3.6 改进（胜率增强系统）：
 * - 信号共振确认：2+个不同因子在3分钟内同方向触发，自动提升信号强度
 * - 关键价位增强：整数关口/日内高低/昨收/涨跌停附近的信号更可靠
 * - 波动率自适应：高波动环境过滤弱信号，低波动环境保留弱信号
 * - 均价线斜率加速度：斜率拐头确认趋势反转，增强信号
 * - 大盘联动加权：大盘趋势与个股信号方向一致时增强，反向时降级
 * 
 * v3.5 改进：
 * - 移除每日做T次数限制，展示所有因子触发点
 * - 移除买入信号对卖出信号的依赖（差价底线检查），每个因子独立触发
 * - 后处理仅去除连续相同因子名称的信号，不同因子可连续触发
 * - 止损信号仍保留（卖出后涨幅超1.5%认亏买回）
 * 
 * 原有策略逻辑：
 * - 时间窗口过滤 / VWAP偏离度 / 量价背离 / 正T反T模式 / 市场环境适配
 * - 因子1-15：MACD金叉死叉 / 均价偏离 / 跌破均价 / 量价背离 / 均线支撑买回 等
 * - 因子16-23(v3.2)：RSI超买卖 / 布林带 / 连续缩量 / 脉冲放量 / DIF零轴穿越
 * - 因子24-30(v3.3)：价格偏离昨收 / 量比异常 / 均价乖离回归 / DIF顶背离 / 双底 / 尾盘急跌 / 均价拐头
 * - 因子31-34(v3.7)：脉冲缩量企稳 / 脉冲缩量滞涨 / 缩量横盘突破 / 放量突破均线
 */
export function generateTimelineSignals(
  timeline: TimelinePoint[],
  macdData: { time: string; dif: number | null; dea: number | null; macd: number | null }[],
  prevClose: number,
  config: StrategyConfig = DEFAULT_STRATEGY_CONFIG,
  factorOverrides?: FactorOverride[],
  indexRegime?: RegimeDetail | null,
  customFactors?: CustomFactorDefinition[],
  sectorRegime?: RegimeDetail | null,
  openPrice?: number,
): (TSignal | null)[] {
  const signals: (TSignal | null)[] = new Array(timeline.length).fill(null);
  if (timeline.length < 3) return signals;

  // Build MACD lookup
  const macdByTime = new Map<string, { dif: number; dea: number; macd: number }>();
  for (const m of macdData) {
    if (m.dif != null && m.dea != null && m.macd != null) {
      macdByTime.set(m.time, { dif: m.dif, dea: m.dea, macd: m.macd });
    }
  }

  // Calculate average volume
  const avgVol = timeline.reduce((s, d) => s + d.volume, 0) / timeline.length;

  // ── v3.2: 计算RSI指标 ──
  const rsiValues: number[] = [];
  const closePrices = timeline.map(d => d.price);
  if (closePrices.length >= config.rsiPeriod + 1) {
    let gainSum = 0;
    let lossSum = 0;
    for (let i = 0; i < closePrices.length; i++) {
      if (i === 0) { rsiValues.push(NaN); continue; }
      const change = closePrices[i] - closePrices[i - 1];
      if (i <= config.rsiPeriod) {
        if (change > 0) gainSum += change; else lossSum += Math.abs(change);
        if (i < config.rsiPeriod) { rsiValues.push(NaN); continue; }
        const avgGain = gainSum / config.rsiPeriod;
        const avgLoss = lossSum / config.rsiPeriod;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsiValues.push(Number((100 - 100 / (1 + rs)).toFixed(2)));
      } else {
        const prevAvgGain = gainSum / config.rsiPeriod;
        const prevAvgLoss = lossSum / config.rsiPeriod;
        const curGain = change > 0 ? change : 0;
        const curLoss = change < 0 ? Math.abs(change) : 0;
        gainSum = prevAvgGain * (config.rsiPeriod - 1) + curGain;
        lossSum = prevAvgLoss * (config.rsiPeriod - 1) + curLoss;
        const avgGain = gainSum / config.rsiPeriod;
        const avgLoss = lossSum / config.rsiPeriod;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsiValues.push(Number((100 - 100 / (1 + rs)).toFixed(2)));
      }
    }
  } else {
    for (let i = 0; i < closePrices.length; i++) rsiValues.push(NaN);
  }

  // ── v3.2: 计算布林带 ──
  const bollValues: { upper: number; middle: number; lower: number }[] = [];
  if (closePrices.length >= config.bollPeriod) {
    for (let i = 0; i < closePrices.length; i++) {
      if (i < config.bollPeriod - 1) {
        bollValues.push({ upper: NaN, middle: NaN, lower: NaN });
        continue;
      }
      let sum = 0;
      for (let j = i - config.bollPeriod + 1; j <= i; j++) sum += closePrices[j];
      const sma = sum / config.bollPeriod;
      let variance = 0;
      for (let j = i - config.bollPeriod + 1; j <= i; j++) variance += (closePrices[j] - sma) ** 2;
      const stdDev = Math.sqrt(variance / config.bollPeriod);
      bollValues.push({
        upper: Number((sma + config.bollMultiplier * stdDev).toFixed(3)),
        middle: Number(sma.toFixed(3)),
        lower: Number((sma - config.bollMultiplier * stdDev).toFixed(3)),
      });
    }
  } else {
    for (let i = 0; i < closePrices.length; i++) bollValues.push({ upper: NaN, middle: NaN, lower: NaN });
  }

  // ── v3.9: 计算KDJ指标 ──
  // 分时线数据没有high/low，使用相邻分钟的价格构造估计的high/low
  // 每分钟的 estimated_high = max(当前价, 前一分钟价), estimated_low = min(当前价, 前一分钟价)
  const kdjHighs: number[] = [];
  const kdjLows: number[] = [];
  for (let i = 0; i < closePrices.length; i++) {
    if (i === 0) {
      kdjHighs.push(closePrices[i]);
      kdjLows.push(closePrices[i]);
    } else {
      kdjHighs.push(Math.max(closePrices[i], closePrices[i - 1]));
      kdjLows.push(Math.min(closePrices[i], closePrices[i - 1]));
    }
  }
  const kdjValues = calculateKDJ(kdjHighs, kdjLows, closePrices, config.kdjPeriod, config.kdjM1, config.kdjM2);

  // Detect market regime
  const regime = detectMarketRegime(timeline, prevClose);
  const regimeAdj = getRegimeAdjustment(regime);

  // Track last sell price for stop-loss detection only
  let lastSellPrice: number | null = null;

  // Track recent prices for volume-price divergence detection
  const recentHighPrice = (endIdx: number, lookback: number = 10): number => {
    const start = Math.max(0, endIdx - lookback);
    let maxP = -Infinity;
    for (let j = start; j <= endIdx; j++) {
      if (timeline[j].price > maxP) maxP = timeline[j].price;
    }
    return maxP;
  };

  const recentHighVolume = (endIdx: number, lookback: number = 10): number => {
    const start = Math.max(0, endIdx - lookback);
    let maxV = -Infinity;
    for (let j = start; j <= endIdx; j++) {
      if (timeline[j].volume > maxV) maxV = timeline[j].volume;
    }
    return maxV;
  };

  for (let i = 2; i < timeline.length; i++) {
    const cur = timeline[i];
    const prev = timeline[i - 1];
    const prev2 = timeline[i - 2];
    const macd = macdByTime.get(cur.time);
    const prevMacd = macdByTime.get(prev.time);

    // ── 时间窗口判断 ──
    const timeWindow = getTimeWindow(cur.time);

    // 开盘观察期和尾盘不操作期：不产生任何信号
    if (!isTradingWindow(timeWindow)) continue;

    // ── 止损信号检测（最高优先级，独立于主信号流） ──
    // 正T卖出后股价继续上涨超过1.5%，必须认亏买回
    if (lastSellPrice !== null && cur.price > lastSellPrice * (1 + config.stopLossPercent / 100)) {
      signals[i] = {
        type: "stoploss",
        reason: "止损买回",
        strength: "strong",
        tMode: "正T",
        timeWindow,
        spreadPct: ((cur.price - lastSellPrice) / lastSellPrice) * 100,
        description: `卖出后涨幅超${config.stopLossPercent}%，认亏买回保底仓`,
      };
      lastSellPrice = null; // Reset after stop-loss
      continue;
    }

    // ── 40. 高开回落卖出 → 卖出(正T) ── (v4.0新增, v4.1修复openPrice传递)
    // 早盘所有高开的股票，价格从开盘价下跌0.01元即触发卖出信号
    // 高开意味着隔夜情绪偏多，但开盘后回落说明多头力量不足，应及时高抛
    // 关键修复：chart-shared.ts的generateTimelineSignals缺少sectorRegime参数，
    // 导致page.tsx传入的sectorRegime被错误接收为openPrice，真正的openPrice被丢弃
    if (isFactorEnabled("高开回落卖出", factorOverrides) && openPrice !== undefined && typeof openPrice === 'number' && !isNaN(openPrice) && openPrice > 0 && openPrice > prevClose && isSellWindow(timeWindow) && regimeAdj.allowSell) {
      // 高开：开盘价 > 昨收价
      const gapUpPct = ((openPrice - prevClose) / prevClose) * 100;
      // 价格跌破开盘价0.01元即触发
      if (cur.price <= openPrice - 0.01) {
        // 只在第一次跌破时触发（检查之前没有同因子信号）
        let alreadyFired = false;
        for (let k = 0; k < i; k++) {
          if (signals[k] && signals[k]!.reason === "高开回落卖出") {
            alreadyFired = true;
            break;
          }
        }
        if (!alreadyFired) {
          const dropFromOpen = ((openPrice - cur.price) / openPrice) * 100;
          // 高开幅度越大，卖出信号越强
          // 所有小幅高开也使用strong强度，确保信号在图上清晰可见
          let strength: Strength = "strong";

          signals[i] = {
            type: "sell",
            reason: "高开回落卖出",
            strength,
            tMode: "正T",
            timeWindow,
            spreadPct: dropFromOpen,
            factorId: "factor_40",
            description: `高开${gapUpPct.toFixed(2)}%后跌破开盘价(回落${dropFromOpen.toFixed(2)}%)，自动卖出`,
          };
          lastSellPrice = cur.price;
          continue;
        }
      }
    }

    // ── 1. MACD金叉 → 买入信号 ──
    if (isFactorEnabled("MACD金叉", factorOverrides) && macd && prevMacd && isBuyWindow(timeWindow) && regimeAdj.allowBuy) {
      if (prevMacd.dif <= prevMacd.dea && macd.dif > macd.dea) {
        // 根据市场环境调整强度
        let strength: Strength = macd.macd > 0 ? "strong" : "medium";
        if (regimeAdj.signalStrengthBoost < 0) {
          if (strength === "strong") strength = "medium";
          else if (strength === "medium") strength = "weak";
        }

        signals[i] = {
          type: "buy",
          reason: "MACD金叉",
          strength,
          tMode: "反T",
          timeWindow,
          description: macd.macd > 0 ? "零轴上方金叉，强买入信号" : "零轴下方金叉",
        };
        continue;
      }
    }

    // ── 2. MACD死叉 → 卖出信号 ──
    if (isFactorEnabled("MACD死叉", factorOverrides) && macd && prevMacd && isSellWindow(timeWindow) && regimeAdj.allowSell) {
      if (prevMacd.dif >= prevMacd.dea && macd.dif < macd.dea) {
        let strength: Strength = macd.macd < 0 ? "strong" : "medium";
        if (regimeAdj.signalStrengthBoost < 0) {
          if (strength === "strong") strength = "medium";
          else if (strength === "medium") strength = "weak";
        }

        signals[i] = {
          type: "sell",
          reason: "MACD死叉",
          strength,
          tMode: "正T",
          timeWindow,
          description: macd.macd < 0 ? "零轴下方死叉，强卖出信号" : "零轴上方死叉",
        };
        lastSellPrice = cur.price;
        continue;
      }
    }

    // ── 3. VWAP偏离超阈值 + 拐头 → 正T卖出 ── (PDF核心策略)
    if (isFactorEnabled("均价偏离过高", factorOverrides) && isSellWindow(timeWindow) && regimeAdj.allowSell) {
      const vwapDeviation = ((cur.price - cur.avgPrice) / cur.avgPrice) * 100;
      // 价格在均线上方且偏离超过2%，且出现回落迹象
      if (vwapDeviation >= config.vwapDeviationSell && prev.price > cur.price) {
        const spreadCheck = checkSpreadFloor(cur.price, cur.avgPrice, prevClose, config);
        let strength: Strength = vwapDeviation >= 3 ? "strong" : "medium";
        if (regimeAdj.signalStrengthBoost < 0) {
          if (strength === "strong") strength = "medium";
          else if (strength === "medium") strength = "weak";
        }

        signals[i] = {
          type: "sell",
          reason: "均价偏离过高",
          strength,
          tMode: "正T",
          timeWindow,
          spreadPct: vwapDeviation,
          description: `偏离均价线${vwapDeviation.toFixed(1)}%，出现拐头回落`,
        };
        lastSellPrice = cur.price;
        continue;
      }
    }

    // ── 4. 价格跌破均价线 → 卖出 ──
    if (isFactorEnabled("跌破均价线", factorOverrides) && isSellWindow(timeWindow) && regimeAdj.allowSell) {
      if (prev.price > prev.avgPrice && cur.price < cur.avgPrice) {
        let strength: Strength = cur.changePercent < -1 ? "strong" : "medium";
        if (regimeAdj.signalStrengthBoost < 0) {
          if (strength === "strong") strength = "medium";
          else if (strength === "medium") strength = "weak";
        }

        signals[i] = {
          type: "sell",
          reason: "跌破均价线",
          strength,
          tMode: "正T",
          timeWindow,
          description: "价格从均线上方跌破到均线下方，空头力量增强",
        };
        lastSellPrice = cur.price;
        continue;
      }
    }

    // ── 5. 量价背离 → 卖出信号 ── (PDF策略新增)
    if (isFactorEnabled("量价背离", factorOverrides) && isSellWindow(timeWindow) && regimeAdj.allowSell && i >= 10) {
      const recentHighP = recentHighPrice(i, 10);
      const recentHighV = recentHighVolume(i, 10);
      // 价格创新高但成交量萎缩 → 短期见顶信号
      if (cur.price >= recentHighP && cur.volume < recentHighV * config.volumeShrinkRatio && cur.changePercent > 0) {
        signals[i] = {
          type: "sell",
          reason: "量价背离",
          strength: "strong",
          tMode: "正T",
          timeWindow,
          description: "股价创新高但成交量萎缩，短期见顶信号",
        };
        lastSellPrice = cur.price;
        continue;
      }
    }

    // ── 6. 价格回到均价线附近 + 不破均线 → 买入 ── (PDF核心买回信号)
    if (isFactorEnabled("均线支撑买回", factorOverrides) && isBuyWindow(timeWindow) && regimeAdj.allowBuy) {
      const vwapDeviation = Math.abs((cur.price - cur.avgPrice) / cur.avgPrice) * 100;
      if (vwapDeviation <= config.vwapDeviationBuy && prev.price < prev.avgPrice && cur.price >= cur.avgPrice) {
        signals[i] = {
          type: "buy",
          reason: "均线支撑买回",
          strength: "strong",
          tMode: "正T",
          timeWindow,
          description: "价格回到均价线附近企稳，正T买回信号",
        };
        lastSellPrice = null;
        continue;
      }
    }

    // ── 7. 前日收盘价支撑 → 买入 ── (PDF策略新增)
    if (isFactorEnabled("昨收价支撑", factorOverrides) && isBuyWindow(timeWindow) && regimeAdj.allowBuy && prevClose > 0) {
      const nearPrevClose = Math.abs(cur.price - prevClose) / prevClose * 100 < 0.3;
      const bouncing = prev.price < prevClose && cur.price >= prevClose;
      if (nearPrevClose && bouncing) {
        signals[i] = {
          type: "buy",
          reason: "昨收价支撑",
          strength: "medium",
          tMode: "正T",
          timeWindow,
          description: "价格回到昨收盘价附近企稳，重要心理支撑位",
        };
        lastSellPrice = null;
        continue;
      }
    }

    // ── 8. 量缩价稳 → 买入 ── (PDF策略新增)
    if (isFactorEnabled("量缩价稳", factorOverrides) && isBuyWindow(timeWindow) && regimeAdj.allowBuy) {
      const volumeShrinking = cur.volume < avgVol * config.volumeShrinkRatio;
      const priceStable = i >= 3 && cur.price >= Math.min(...timeline.slice(i - 3, i).map(d => d.price));
      if (volumeShrinking && priceStable && cur.changePercent < 0) {
        signals[i] = {
          type: "buy",
          reason: "量缩价稳",
          strength: "medium",
          tMode: "正T",
          timeWindow,
          description: "下跌过程中成交量明显缩小，抛压衰竭标志",
        };
        lastSellPrice = null;
        continue;
      }
    }

    // ── 9. 放量拉升 → 买入(反T) ──
    if (isFactorEnabled("放量拉升", factorOverrides) && isBuyWindow(timeWindow) && regimeAdj.allowBuy) {
      if (cur.volume > avgVol * config.volumeMultiplier && cur.price > prev.price && cur.changePercent > 0) {
        let strength: Strength = cur.volume > avgVol * config.volumeMultiplierStrong ? "strong" : "medium";
        if (regimeAdj.signalStrengthBoost < 0) {
          if (strength === "strong") strength = "medium";
          else if (strength === "medium") strength = "weak";
        }

        signals[i] = {
          type: "buy",
          reason: "放量拉升",
          strength,
          tMode: "反T",
          timeWindow,
          description: "成交量显著放大且价格上涨，主力资金入场",
        };

        continue;
      }
    }

    // ── 10. 放量下挫 → 卖出 ──
    if (isFactorEnabled("放量下挫", factorOverrides) && isSellWindow(timeWindow) && regimeAdj.allowSell) {
      if (cur.volume > avgVol * config.volumeMultiplier && cur.price < prev.price && cur.changePercent < 0) {
        let strength: Strength = cur.volume > avgVol * config.volumeMultiplierStrong ? "strong" : "medium";
        if (regimeAdj.signalStrengthBoost < 0) {
          if (strength === "strong") strength = "medium";
          else if (strength === "medium") strength = "weak";
        }

        signals[i] = {
          type: "sell",
          reason: "放量下挫",
          strength,
          tMode: "正T",
          timeWindow,
          description: "成交量显著放大且价格下跌，主力资金出逃",
        };
        lastSellPrice = cur.price;
        continue;
      }
    }

    // ── 11. 急跌反弹 → 买入(反T) ──
    if (isFactorEnabled("急跌反弹", factorOverrides) && isBuyWindow(timeWindow) && regimeAdj.allowBuy) {
      if (prev2.price > prev.price && prev.price < cur.price && prev.changePercent < config.momentumDropThreshold && cur.price > prev.price) {
        let strength: Strength = prev.changePercent < config.momentumDropStrong ? "strong" : "weak";

        signals[i] = {
          type: "buy",
          reason: "急跌反弹",
          strength,
          tMode: "反T",
          timeWindow,
          description: prev.changePercent < config.momentumDropStrong ? "深度急跌后V型反转" : "小幅急跌后反弹",
        };

        continue;
      }
    }

    // ── 12. 冲高回落 → 卖出(正T) ──
    if (isFactorEnabled("冲高回落", factorOverrides) && isSellWindow(timeWindow) && regimeAdj.allowSell) {
      if (prev2.price < prev.price && prev.price > cur.price && prev.changePercent > config.momentumRiseThreshold && cur.price < prev.price) {
        let strength: Strength = prev.changePercent > config.momentumRiseStrong ? "strong" : "weak";

        signals[i] = {
          type: "sell",
          reason: "冲高回落",
          strength,
          tMode: "正T",
          timeWindow,
          description: prev.changePercent > config.momentumRiseStrong ? "大幅冲高后倒V型回落" : "小幅冲高后回落",
        };
        lastSellPrice = cur.price;
        continue;
      }
    }

    // ── 13. 突破均价线(方向向上) → 买入 ── (保留原版逻辑但加时间窗口)
    if (isFactorEnabled("突破均价线", factorOverrides) && isBuyWindow(timeWindow) && regimeAdj.allowBuy) {
      if (prev.price < prev.avgPrice && cur.price > cur.avgPrice) {
        let strength: Strength = cur.changePercent > 1 ? "strong" : "medium";
        if (regimeAdj.signalStrengthBoost < 0) {
          if (strength === "strong") strength = "medium";
          else if (strength === "medium") strength = "weak";
        }

        signals[i] = {
          type: "buy",
          reason: "突破均价线",
          strength,
          tMode: "反T",
          timeWindow,
          description: "价格从均线下方突破到均线上方",
        };

        continue;
      }
    }

    // ── 14. MACD柱由负转正 → 买入 ── (v3.1新增)
    if (isFactorEnabled("MACD柱转正", factorOverrides) && macd && prevMacd && isBuyWindow(timeWindow) && regimeAdj.allowBuy) {
      if (prevMacd.macd < 0 && macd.macd > 0 && macd.macd > prevMacd.macd) {
        let strength: Strength = macd.dif > 0 ? "strong" : "medium";
        if (regimeAdj.signalStrengthBoost < 0) {
          if (strength === "strong") strength = "medium";
          else if (strength === "medium") strength = "weak";
        }

        signals[i] = {
          type: "buy",
          reason: "MACD柱转正",
          strength,
          tMode: "反T",
          timeWindow,
          description: macd.dif > 0 ? "零轴上方MACD柱由负转正，多头加速" : "MACD柱由负转正，短期偏多",
        };

        continue;
      }
    }

    // ── 15. MACD柱由正转负 → 卖出 ── (v3.1新增)
    if (isFactorEnabled("MACD柱转负", factorOverrides) && macd && prevMacd && isSellWindow(timeWindow) && regimeAdj.allowSell) {
      if (prevMacd.macd > 0 && macd.macd < 0 && macd.macd < prevMacd.macd) {
        let strength: Strength = macd.dif < 0 ? "strong" : "medium";
        if (regimeAdj.signalStrengthBoost < 0) {
          if (strength === "strong") strength = "medium";
          else if (strength === "medium") strength = "weak";
        }

        signals[i] = {
          type: "sell",
          reason: "MACD柱转负",
          strength,
          tMode: "正T",
          timeWindow,
          description: macd.dif < 0 ? "零轴下方MACD柱由正转负，空头加速" : "MACD柱由正转负，短期偏空",
        };
        lastSellPrice = cur.price;
        continue;
      }
    }

    // ── 16. RSI超卖买回 → 买入(反T) ── (v3.2新增)
    if (isFactorEnabled("RSI超卖买回", factorOverrides) && isBuyWindow(timeWindow) && regimeAdj.allowBuy) {
      const curRSI = rsiValues[i];
      const prevRSI = i >= 1 ? rsiValues[i - 1] : NaN;
      if (!isNaN(curRSI) && !isNaN(prevRSI)) {
        // RSI从超卖区(低于30)回升
        if (prevRSI < config.rsiOversold && curRSI >= config.rsiOversold && curRSI > prevRSI) {
          let strength: Strength = prevRSI < 20 ? "strong" : "medium";
          if (regimeAdj.signalStrengthBoost < 0) {
            if (strength === "strong") strength = "medium";
            else if (strength === "medium") strength = "weak";
          }


          signals[i] = {
            type: "buy",
            reason: "RSI超卖买回",
            strength,
            tMode: "反T",
            timeWindow,
            description: prevRSI < 20
              ? `RSI深度超卖后回升(${prevRSI.toFixed(0)}→${curRSI.toFixed(0)})，强反弹信号`
              : `RSI超卖区回升(${prevRSI.toFixed(0)}→${curRSI.toFixed(0)})，超跌反弹`,
          };
          lastSellPrice = null;
  
          continue;
        }
      }
    }

    // ── 17. RSI超买卖出 → 卖出(正T) ── (v3.2新增)
    if (isFactorEnabled("RSI超买卖出", factorOverrides) && isSellWindow(timeWindow) && regimeAdj.allowSell) {
      const curRSI = rsiValues[i];
      const prevRSI = i >= 1 ? rsiValues[i - 1] : NaN;
      if (!isNaN(curRSI) && !isNaN(prevRSI)) {
        // RSI从超买区(高于70)回落
        if (prevRSI > config.rsiOverbought && curRSI <= config.rsiOverbought && curRSI < prevRSI) {
          let strength: Strength = prevRSI > 80 ? "strong" : "medium";
          if (regimeAdj.signalStrengthBoost < 0) {
            if (strength === "strong") strength = "medium";
            else if (strength === "medium") strength = "weak";
          }

          signals[i] = {
            type: "sell",
            reason: "RSI超买卖出",
            strength,
            tMode: "正T",
            timeWindow,
            description: prevRSI > 80
              ? `RSI深度超买后回落(${prevRSI.toFixed(0)}→${curRSI.toFixed(0)})，强见顶信号`
              : `RSI超买区回落(${prevRSI.toFixed(0)}→${curRSI.toFixed(0)})，短期见顶`,
          };
          lastSellPrice = cur.price;
          continue;
        }
      }
    }

    // ── 18. 布林下轨反弹 → 买入(反T) ── (v3.2新增)
    if (isFactorEnabled("布林下轨反弹", factorOverrides) && isBuyWindow(timeWindow) && regimeAdj.allowBuy) {
      const boll = bollValues[i];
      const prevBoll = i >= 1 ? bollValues[i - 1] : null;
      if (boll && !isNaN(boll.lower) && prevBoll && !isNaN(prevBoll.lower)) {
        // 前一根触及或跌破下轨，当前从下轨反弹
        if (prev.price <= prevBoll.lower && cur.price > boll.lower && cur.price > prev.price) {
          let strength: Strength = prev.price < prevBoll.lower * 0.998 ? "strong" : "medium";
          if (regimeAdj.signalStrengthBoost < 0) {
            if (strength === "strong") strength = "medium";
            else if (strength === "medium") strength = "weak";
          }



          signals[i] = {
            type: "buy",
            reason: "布林下轨反弹",
            strength,
            tMode: "反T",
            timeWindow,
            description: "价格触及布林下轨后反弹，超卖支撑确认",
          };
          lastSellPrice = null;
  
          continue;
        }
      }
    }

    // ── 19. 布林上轨回落 → 卖出(正T) ── (v3.2新增)
    if (isFactorEnabled("布林上轨回落", factorOverrides) && isSellWindow(timeWindow) && regimeAdj.allowSell) {
      const boll = bollValues[i];
      const prevBoll = i >= 1 ? bollValues[i - 1] : null;
      if (boll && !isNaN(boll.upper) && prevBoll && !isNaN(prevBoll.upper)) {
        // 前一根触及或突破上轨，当前从上轨回落
        if (prev.price >= prevBoll.upper && cur.price < boll.upper && cur.price < prev.price) {
          let strength: Strength = prev.price > prevBoll.upper * 1.002 ? "strong" : "medium";
          if (regimeAdj.signalStrengthBoost < 0) {
            if (strength === "strong") strength = "medium";
            else if (strength === "medium") strength = "weak";
          }

          signals[i] = {
            type: "sell",
            reason: "布林上轨回落",
            strength,
            tMode: "正T",
            timeWindow,
            description: "价格触及布林上轨后回落，超买压力确认",
          };
          lastSellPrice = cur.price;
          continue;
        }
      }
    }

    // ── 20. 连续缩量 → 买入(正T) ── (v3.2新增)
    // 连续N根量递减+价格稳定 → 抛压衰竭
    if (isFactorEnabled("连续缩量", factorOverrides) && isBuyWindow(timeWindow) && regimeAdj.allowBuy && i >= config.consecutiveShrinkBars) {
      let allShrinking = true;
      for (let k = i - config.consecutiveShrinkBars + 1; k <= i; k++) {
        if (k < 1 || timeline[k].volume >= timeline[k - 1].volume) {
          allShrinking = false;
          break;
        }
      }
      if (allShrinking) {
        // 价格稳定：最后一根价格不低于N根前的价格
        const priceStable = cur.price >= timeline[i - config.consecutiveShrinkBars + 1].price;
        // 量已缩到均量以下
        const volShrunk = cur.volume < avgVol * config.volumeShrinkRatio;
        if (priceStable && volShrunk) {


          signals[i] = {
            type: "buy",
            reason: "连续缩量",
            strength: "medium",
            tMode: "正T",
            timeWindow,
            description: `连续${config.consecutiveShrinkBars}根成交量递减且价格企稳，抛压衰竭标志`,
          };
          lastSellPrice = null;
  
          continue;
        }
      }
    }

    // ── 21. 脉冲放量 → 卖出(正T) ── (v3.2新增)
    // 单根成交量突然超过均量5倍+价涨 → 警惕冲高回落
    if (isFactorEnabled("脉冲放量", factorOverrides) && isSellWindow(timeWindow) && regimeAdj.allowSell) {
      if (cur.volume > avgVol * config.volumePulseMultiplier && cur.changePercent > 0) {
        let strength: Strength = cur.volume > avgVol * config.volumePulseMultiplier * 2 ? "strong" : "medium";
        if (regimeAdj.signalStrengthBoost < 0) {
          if (strength === "strong") strength = "medium";
          else if (strength === "medium") strength = "weak";
        }

        signals[i] = {
          type: "sell",
          reason: "脉冲放量",
          strength,
          tMode: "正T",
          timeWindow,
          description: `成交量突增${(cur.volume / avgVol).toFixed(1)}倍且价涨，警惕冲高回落`,
        };
        lastSellPrice = cur.price;
        continue;
      }
    }

    // ── 22. DIF零轴上穿 → 买入(反T) ── (v3.2新增)
    if (isFactorEnabled("DIF零轴上穿", factorOverrides) && macd && prevMacd && isBuyWindow(timeWindow) && regimeAdj.allowBuy) {
      if (prevMacd.dif < 0 && macd.dif >= 0) {
        let strength: Strength = macd.macd > 0 ? "strong" : "medium";
        if (regimeAdj.signalStrengthBoost < 0) {
          if (strength === "strong") strength = "medium";
          else if (strength === "medium") strength = "weak";
        }



        signals[i] = {
          type: "buy",
          reason: "DIF零轴上穿",
          strength,
          tMode: "反T",
          timeWindow,
          description: macd.macd > 0
            ? "DIF从零轴下方穿越到上方且MACD柱为正，强多头信号"
            : "DIF穿越零轴向上，趋势转多",
        };
        lastSellPrice = null;

        continue;
      }
    }

    // ── 23. DIF零轴下穿 → 卖出(正T) ── (v3.2新增)
    if (isFactorEnabled("DIF零轴下穿", factorOverrides) && macd && prevMacd && isSellWindow(timeWindow) && regimeAdj.allowSell) {
      if (prevMacd.dif > 0 && macd.dif <= 0) {
        let strength: Strength = macd.macd < 0 ? "strong" : "medium";
        if (regimeAdj.signalStrengthBoost < 0) {
          if (strength === "strong") strength = "medium";
          else if (strength === "medium") strength = "weak";
        }

        signals[i] = {
          type: "sell",
          reason: "DIF零轴下穿",
          strength,
          tMode: "正T",
          timeWindow,
          description: macd.macd < 0
            ? "DIF从零轴上方穿越到下方且MACD柱为负，强空头信号"
            : "DIF穿越零轴向下，趋势转空",
        };
        lastSellPrice = cur.price;
        continue;
      }
    }

    // ── 24. 价格偏离昨收 → 卖出(正T) ── (v3.3新增)
    // 价格偏离昨收超过阈值(3%)，短期过度拉升/下跌后回归概率大
    if (isFactorEnabled("价格偏离昨收", factorOverrides) && prevClose > 0 && isSellWindow(timeWindow) && regimeAdj.allowSell) {
      const deviation = ((cur.price - prevClose) / prevClose) * 100;
      // 正偏离过大（过度拉升）→ 卖出
      if (deviation >= config.priceDeviationSell && cur.price < prev.price) {
        let strength: Strength = deviation >= 5 ? "strong" : deviation >= 4 ? "medium" : "weak";
        if (regimeAdj.signalStrengthBoost < 0) {
          if (strength === "strong") strength = "medium";
          else if (strength === "medium") strength = "weak";
        }

        signals[i] = {
          type: "sell",
          reason: "价格偏离昨收",
          strength,
          tMode: "正T",
          timeWindow,
          spreadPct: deviation,
          description: `价格偏离昨收+${deviation.toFixed(1)}%，过度拉升后回归概率大`,
        };
        lastSellPrice = cur.price;
        continue;
      }
    }

    // ── 25. 量比异常放大 → 卖出(正T) ── (v3.3新增)
    // 当前成交量远超此前均量（量比>2），且价涨，警惕冲高回落
    if (isFactorEnabled("量比异常放大", factorOverrides) && isSellWindow(timeWindow) && regimeAdj.allowSell) {
      // 计算此前N根的均量（不含当前）
      const volLookback = Math.min(i, 20);
      if (volLookback >= 5) {
        let prevVolSum = 0;
        for (let k = i - volLookback; k < i; k++) prevVolSum += timeline[k].volume;
        const prevAvgVol = prevVolSum / volLookback;
        const volumeRatio = prevAvgVol > 0 ? cur.volume / prevAvgVol : 0;

        if (volumeRatio >= config.volumeRatioThreshold && cur.changePercent > 0 && cur.price > prev.price) {
          let strength: Strength = volumeRatio >= 4 ? "strong" : volumeRatio >= 3 ? "medium" : "weak";
          if (regimeAdj.signalStrengthBoost < 0) {
            if (strength === "strong") strength = "medium";
            else if (strength === "medium") strength = "weak";
          }

          signals[i] = {
            type: "sell",
            reason: "量比异常放大",
            strength,
            tMode: "正T",
            timeWindow,
            description: `量比${volumeRatio.toFixed(1)}倍异常放大且价涨，警惕冲高回落`,
          };
          lastSellPrice = cur.price;
          continue;
        }
      }
    }

    // ── 26. 均价乖离回归 → 买入(正T) ── (v3.3新增)
    // 价格之前在均线下方偏离较大，现在开始回归均线
    if (isFactorEnabled("均价乖离回归", factorOverrides) && isBuyWindow(timeWindow) && regimeAdj.allowBuy) {
      const deviationBelow = ((cur.avgPrice - cur.price) / cur.avgPrice) * 100;
      // 当前价格仍低于均价，但正在向上回归
      if (cur.price < cur.avgPrice && deviationBelow >= config.avgPriceDeviationReturn
          && cur.price > prev.price && prev.price <= prev.avgPrice) {
        let strength: Strength = deviationBelow >= 2.5 ? "strong" : "medium";
        if (regimeAdj.signalStrengthBoost < 0) {
          if (strength === "strong") strength = "medium";
          else if (strength === "medium") strength = "weak";
        }



        signals[i] = {
          type: "buy",
          reason: "均价乖离回归",
          strength,
          tMode: "正T",
          timeWindow,
          spreadPct: deviationBelow,
          description: `价格低于均线${deviationBelow.toFixed(1)}%后开始回归，买回信号`,
        };
        lastSellPrice = null;

        continue;
      }
    }

    // ── 27. DIF顶背离 → 卖出(正T) ── (v3.3新增)
    // 价格创新高但DIF没创新高 → 上涨动能减弱
    if (isFactorEnabled("DIF顶背离", factorOverrides) && macd && isSellWindow(timeWindow) && regimeAdj.allowSell && i >= config.difDivergenceLookback) {
      // 找到回看周期内的价格最高点和对应的DIF
      const lookStart = i - config.difDivergenceLookback;
      let prevHighIdx = -1;
      let prevHighPrice = -Infinity;
      for (let k = lookStart; k < i; k++) {
        if (timeline[k].price > prevHighPrice) {
          prevHighPrice = timeline[k].price;
          prevHighIdx = k;
        }
      }
      // 当前价格创新高
      if (cur.price > prevHighPrice && prevHighIdx >= 0) {
        const prevHighMacd = macdByTime.get(timeline[prevHighIdx].time);
        // 但DIF没有创新高 → 顶背离
        if (prevHighMacd && macd.dif < prevHighMacd.dif && macd.dif > 0) {
          let strength: Strength = (prevHighMacd.dif - macd.dif) / prevHighMacd.dif > 0.2 ? "strong" : "medium";
          if (regimeAdj.signalStrengthBoost < 0) {
            if (strength === "strong") strength = "medium";
            else if (strength === "medium") strength = "weak";
          }

          signals[i] = {
            type: "sell",
            reason: "DIF顶背离",
            strength,
            tMode: "正T",
            timeWindow,
            description: "价格创新高但DIF未创新高，上涨动能减弱，见顶信号",
          };
          lastSellPrice = cur.price;
          continue;
        }
      }
    }

    // ── 28. 双底买回 → 买入(正T/反T) ── (v3.3新增)
    // W底形态：回看周期内出现两个相近的低点，当前从第二个低点反弹
    if (isFactorEnabled("双底买回", factorOverrides) && isBuyWindow(timeWindow) && regimeAdj.allowBuy && i >= config.doubleBottomLookback) {
      const lookStart = i - config.doubleBottomLookback;
      // 在回看区间找最低点
      let minIdx = lookStart;
      let minPrice = timeline[lookStart].price;
      for (let k = lookStart + 1; k <= i; k++) {
        if (timeline[k].price < minPrice) {
          minPrice = timeline[k].price;
          minIdx = k;
        }
      }
      // 最低点不能是当前点（需要反弹确认）
      if (minIdx < i - 2 && minIdx > lookStart) {
        // 在最低点之前找另一个相近低点（W底左脚）
        let leftBottomIdx = -1;
        let leftBottomPrice = Infinity;
        for (let k = lookStart; k < minIdx - 3; k++) {
          const priceDiff = Math.abs(timeline[k].price - minPrice) / minPrice * 100;
          if (priceDiff < config.doubleBottomTolerance && timeline[k].price < leftBottomPrice) {
            leftBottomPrice = timeline[k].price;
            leftBottomIdx = k;
          }
        }
        // 找到了双底，且当前价格在最低点上方（反弹确认）
        if (leftBottomIdx >= 0 && cur.price > minPrice * 1.001 && cur.price > prev.price) {
          let strength: Strength = cur.price > minPrice * 1.005 ? "strong" : "medium";
          if (regimeAdj.signalStrengthBoost < 0) {
            if (strength === "strong") strength = "medium";
            else if (strength === "medium") strength = "weak";
          }



          signals[i] = {
            type: "buy",
            reason: "双底买回",
            strength,
            tMode: "正T",
            timeWindow,
            description: `W底形态确认，两个低点相差<${config.doubleBottomTolerance}%，反弹买回`,
          };
          lastSellPrice = null;
  
          continue;
        }
      }
    }

    // ── 29. 尾盘急跌 → 买入(反T低吸) ── (v3.3新增)
    // 14:00-14:25出现急跌（但不是尾盘最后5分钟），低吸机会
    if (isFactorEnabled("尾盘急跌", factorOverrides) && isBuyWindow(timeWindow) && regimeAdj.allowBuy) {
      const [curH, curM] = cur.time.split(":").map(Number);
      const curMinutes = curH * 60 + curM;
      // 14:00-14:25区间（午后买回窗口的末段）
      if (curMinutes >= 840 && curMinutes <= 865) {
        // 当前分钟急跌
        if (cur.changePercent <= config.lateDropThreshold && cur.price < prev.price) {
          let strength: Strength = cur.changePercent <= -1.0 ? "strong" : "medium";
          if (regimeAdj.signalStrengthBoost < 0) {
            if (strength === "strong") strength = "medium";
            else if (strength === "medium") strength = "weak";
          }



          signals[i] = {
            type: "buy",
            reason: "尾盘急跌",
            strength,
            tMode: "反T",
            timeWindow,
            description: cur.changePercent <= -1.0
              ? `尾盘深度急跌${cur.changePercent.toFixed(2)}%，低吸机会`
              : `尾盘急跌${cur.changePercent.toFixed(2)}%，短线低吸`,
          };
          lastSellPrice = null;
  
          continue;
        }
      }
    }

    // ── 30. 均价拐头 → 卖出(正T) ── (v3.3新增)
    // 均价线从持续上升转为开始下降，趋势转折信号
    if (isFactorEnabled("均价拐头", factorOverrides) && isSellWindow(timeWindow) && regimeAdj.allowSell && i >= config.avgPriceTurnLookback + 2) {
      // 检查均价线是否由升转降
      const curAvg = cur.avgPrice;
      const prevAvg = prev.avgPrice;
      // 均价线开始下降 + 之前是上升的
      if (curAvg < prevAvg) {
        // 检查之前N根均价是否持续上升
        let wasRising = true;
        for (let k = i - config.avgPriceTurnLookback; k < i - 1; k++) {
          if (k >= 1 && timeline[k].avgPrice <= timeline[k - 1].avgPrice) {
            wasRising = false;
            break;
          }
        }
        if (wasRising && cur.price < curAvg) {
          let strength: Strength = cur.changePercent < -0.5 ? "strong" : "medium";
          if (regimeAdj.signalStrengthBoost < 0) {
            if (strength === "strong") strength = "medium";
            else if (strength === "medium") strength = "weak";
          }

          signals[i] = {
            type: "sell",
            reason: "均价拐头",
            strength,
            tMode: "正T",
            timeWindow,
            description: "均价线由升转降且价格跌破均线，趋势转折信号",
          };
          lastSellPrice = cur.price;
          continue;
        }
      }
    }

    // ── 31. 脉冲缩量企稳 → 买入(正T) ── (v3.7新增)
    // 脉冲下跌后卖出量能萎缩+VWAP走平 → 强买信号
    if (isFactorEnabled("脉冲缩量企稳", factorOverrides) && isBuyWindow(timeWindow) && regimeAdj.allowBuy && i >= 20) {
      // Condition 1: Pulse drop has occurred in the recent lookback period
      const pulseLookback = Math.min(i + 1, config.pulseDropLookback);
      const recentHigh = Math.max(...timeline.slice(i - pulseLookback + 1, i + 1).map(d => d.price));
      const dropPct = ((recentHigh - cur.price) / recentHigh) * 100;
      const pulseDropOccurred = dropPct >= config.pulseDropThreshold;

      // Condition 2: Selling volume shrinks (current volume < 50% of avg, AND previous bar also shrinking)
      const volumeShrinking31 = cur.volume < avgVol * config.volumeShrinkRatio;
      const prevVolumeShrinking31 = prev.volume < avgVol * config.volumeShrinkRatio;
      const consecutiveShrink31 = volumeShrinking31 && prevVolumeShrinking31;

      // Condition 3: VWAP flattening (slope of last 5 bars of avgPrice is nearly zero)
      const flatLookback = Math.min(5, i);
      const recentAvgPrices = timeline.slice(i - flatLookback + 1, i + 1).map(d => d.avgPrice);
      let vwapSlopeLocal = 0;
      if (recentAvgPrices.length >= 3) {
        const sn = recentAvgPrices.length;
        let sx = 0, sy = 0, sxy = 0, sx2 = 0;
        for (let k = 0; k < sn; k++) { sx += k; sy += recentAvgPrices[k]; sxy += k * recentAvgPrices[k]; sx2 += k * k; }
        vwapSlopeLocal = (sn * sxy - sx * sy) / (sn * sx2 - sx * sx);
      }
      const slopeNormLocal = prevClose > 0 ? Math.abs((vwapSlopeLocal / prevClose) * 10000) : 0;
      const vwapFlat = slopeNormLocal < config.vwapFlatSlopeThreshold;

      if (pulseDropOccurred && consecutiveShrink31 && vwapFlat) {
        signals[i] = {
          type: "buy",
          reason: "脉冲缩量企稳",
          strength: "strong",
          tMode: "正T",
          timeWindow,
          description: `脉冲下跌${dropPct.toFixed(1)}%后缩量企稳，VWAP走平，强买回信号`,
        };
        lastSellPrice = null;
        continue;
      }
    }

    // ── 32. 脉冲拉升缩量滞涨 → 卖出(正T) ── (v3.7新增)
    // 脉冲拉升后买入量能萎缩+VWAP走平 → 强卖信号
    if (isFactorEnabled("脉冲拉升缩量滞涨", factorOverrides) && isSellWindow(timeWindow) && regimeAdj.allowSell && i >= 20) {
      // Condition 1: Pulse rally has occurred in the recent lookback period
      const pulseLookback32 = Math.min(i + 1, config.pulseDropLookback);
      const recentLow = Math.min(...timeline.slice(i - pulseLookback32 + 1, i + 1).map(d => d.price));
      const rallyPct = ((cur.price - recentLow) / recentLow) * 100;
      const pulseRallyOccurred = rallyPct >= config.pulseDropThreshold;

      // Condition 2: Buying volume shrinks (current volume < 50% of avg, AND previous bar also shrinking)
      const volumeShrinking32 = cur.volume < avgVol * config.volumeShrinkRatio;
      const prevVolumeShrinking32 = prev.volume < avgVol * config.volumeShrinkRatio;
      const consecutiveShrink32 = volumeShrinking32 && prevVolumeShrinking32;

      // Condition 3: VWAP flattening (same logic as factor 31)
      const flatLookback32 = Math.min(5, i);
      const recentAvgPrices32 = timeline.slice(i - flatLookback32 + 1, i + 1).map(d => d.avgPrice);
      let vwapSlopeLocal32 = 0;
      if (recentAvgPrices32.length >= 3) {
        const sn32 = recentAvgPrices32.length;
        let sx32 = 0, sy32 = 0, sxy32 = 0, sx232 = 0;
        for (let k = 0; k < sn32; k++) { sx32 += k; sy32 += recentAvgPrices32[k]; sxy32 += k * recentAvgPrices32[k]; sx232 += k * k; }
        vwapSlopeLocal32 = (sn32 * sxy32 - sx32 * sy32) / (sn32 * sx232 - sx32 * sx32);
      }
      const slopeNormLocal32 = prevClose > 0 ? Math.abs((vwapSlopeLocal32 / prevClose) * 10000) : 0;
      const vwapFlat32 = slopeNormLocal32 < config.vwapFlatSlopeThreshold;

      if (pulseRallyOccurred && consecutiveShrink32 && vwapFlat32) {
        signals[i] = {
          type: "sell",
          reason: "脉冲拉升缩量滞涨",
          strength: "strong",
          tMode: "正T",
          timeWindow,
          description: `脉冲拉升${rallyPct.toFixed(1)}%后缩量滞涨，VWAP走平，强卖出信号`,
        };
        lastSellPrice = cur.price;
        continue;
      }
    }

    // ── 33. 缩量横盘突破 → 买入(反T) ── (v3.7新增)
    // 缩量窄幅盘整后价格向上突破 → 强买信号
    if (isFactorEnabled("缩量横盘突破", factorOverrides) && isBuyWindow(timeWindow) && regimeAdj.allowBuy && i >= config.consolidationLookback) {
      const lookStart33 = i - config.consolidationLookback + 1;

      // Condition (a): Last 5 bars have volume < 60% of average
      let allLowVol = true;
      for (let k = Math.max(lookStart33, i - 4); k <= i; k++) {
        if (timeline[k].volume >= avgVol * 0.6) {
          allLowVol = false;
          break;
        }
      }

      // Condition (b): Price range of last 10 bars < 0.5% of prevClose
      const rangeSlice = timeline.slice(lookStart33, i + 1);
      const rangeHigh = Math.max(...rangeSlice.map(d => d.price));
      const rangeLow = Math.min(...rangeSlice.map(d => d.price));
      const rangePct = prevClose > 0 ? ((rangeHigh - rangeLow) / prevClose) * 100 : 0;
      const narrowRange = rangePct < config.consolidationRangePct;

      // Condition (c): Current bar price breaks above the high of the consolidation range
      // (current price is the highest in the consolidation period)
      const breakoutAbove = cur.price > rangeHigh - 0.001 && cur.price > prev.price;

      if (allLowVol && narrowRange && breakoutAbove) {
        signals[i] = {
          type: "buy",
          reason: "缩量横盘突破",
          strength: "strong",
          tMode: "反T",
          timeWindow,
          description: `缩量横盘${rangePct.toFixed(2)}%后向上突破，强买入信号`,
        };
        lastSellPrice = null;
        continue;
      }
    }

    // ── 34. 放量突破均线 → 买入(反T) ── (v3.7新增)
    // 成交量放大+价格从均线下方突破到上方 → 强买信号
    if (isFactorEnabled("放量突破均线", factorOverrides) && isBuyWindow(timeWindow) && regimeAdj.allowBuy) {
      // Condition (a): cur.volume > avgVol * 2
      const volumeSurge = cur.volume > avgVol * config.volumeBreakoutMultiplier;
      // Condition (b): prev.price < prev.avgPrice (was below VWAP)
      const wasBelowVWAP = prev.price < prev.avgPrice;
      // Condition (c): cur.price > cur.avgPrice (now above VWAP)
      const nowAboveVWAP = cur.price > cur.avgPrice;

      if (volumeSurge && wasBelowVWAP && nowAboveVWAP) {
        signals[i] = {
          type: "buy",
          reason: "放量突破均线",
          strength: "strong",
          tMode: "反T",
          timeWindow,
          description: `成交量放大${(cur.volume / avgVol).toFixed(1)}倍突破均价线，强买入信号`,
        };
        lastSellPrice = null;
        continue;
      }
    }

    // ── 35. KDJ金叉买入 → 买入(反T) ── (v3.9新增)
    // K线从下方穿越D线(KD金叉)，尤其在超卖区(J<20)更可靠
    if (isFactorEnabled("KDJ金叉买入", factorOverrides) && isBuyWindow(timeWindow) && regimeAdj.allowBuy) {
      const curKDJ = kdjValues[i];
      const prevKDJ = i >= 1 ? kdjValues[i - 1] : null;
      if (curKDJ && !isNaN(curKDJ.k) && !isNaN(curKDJ.d) && prevKDJ && !isNaN(prevKDJ.k) && !isNaN(prevKDJ.d)) {
        // K线从下方穿越D线 = 金叉
        if (prevKDJ.k <= prevKDJ.d && curKDJ.k > curKDJ.d) {
          // J值在超卖区(低于20)时金叉更可靠 → strong，否则 medium
          const isOversold = curKDJ.j < config.kdjOversold;
          let strength: Strength = isOversold ? "strong" : "medium";
          if (regimeAdj.signalStrengthBoost < 0) {
            if (strength === "strong") strength = "medium";
            else if (strength === "medium") strength = "weak";
          }

          signals[i] = {
            type: "buy",
            reason: "KDJ金叉买入",
            strength,
            tMode: "反T",
            timeWindow,
            description: isOversold
              ? `KD金叉(K=${curKDJ.k.toFixed(1)}上穿D=${curKDJ.d.toFixed(1)})且J=${curKDJ.j.toFixed(1)}超卖区，强买入信号`
              : `KD金叉(K=${curKDJ.k.toFixed(1)}上穿D=${curKDJ.d.toFixed(1)})，买入信号`,
          };
          lastSellPrice = null;
          continue;
        }
      }
    }

    // ── 36. KDJ死叉卖出 → 卖出(正T) ── (v3.9新增)
    // K线从上方穿越D线(KD死叉)，尤其在超买区(J>80)更可靠
    if (isFactorEnabled("KDJ死叉卖出", factorOverrides) && isSellWindow(timeWindow) && regimeAdj.allowSell) {
      const curKDJ36 = kdjValues[i];
      const prevKDJ36 = i >= 1 ? kdjValues[i - 1] : null;
      if (curKDJ36 && !isNaN(curKDJ36.k) && !isNaN(curKDJ36.d) && prevKDJ36 && !isNaN(prevKDJ36.k) && !isNaN(prevKDJ36.d)) {
        // K线从上方穿越D线 = 死叉
        if (prevKDJ36.k >= prevKDJ36.d && curKDJ36.k < curKDJ36.d) {
          // J值在超买区(高于80)时死叉更可靠 → strong，否则 medium
          const isOverbought = curKDJ36.j > config.kdjOverbought;
          let strength: Strength = isOverbought ? "strong" : "medium";
          if (regimeAdj.signalStrengthBoost < 0) {
            if (strength === "strong") strength = "medium";
            else if (strength === "medium") strength = "weak";
          }

          signals[i] = {
            type: "sell",
            reason: "KDJ死叉卖出",
            strength,
            tMode: "正T",
            timeWindow,
            description: isOverbought
              ? `KD死叉(K=${curKDJ36.k.toFixed(1)}下穿D=${curKDJ36.d.toFixed(1)})且J=${curKDJ36.j.toFixed(1)}超买区，强卖出信号`
              : `KD死叉(K=${curKDJ36.k.toFixed(1)}下穿D=${curKDJ36.d.toFixed(1)})，卖出信号`,
          };
          lastSellPrice = cur.price;
          continue;
        }
      }
    }

    // ── 37. J线超卖反弹 → 买入(反T) ── (v3.9新增)
    // J值低于0(极端超卖)且开始拐头向上 → 反弹信号
    if (isFactorEnabled("J线超卖反弹", factorOverrides) && isBuyWindow(timeWindow) && regimeAdj.allowBuy) {
      const curKDJ37 = kdjValues[i];
      const prevKDJ37 = i >= 1 ? kdjValues[i - 1] : null;
      if (curKDJ37 && !isNaN(curKDJ37.j) && prevKDJ37 && !isNaN(prevKDJ37.j)) {
        // J值低于极端低值阈值 且 开始拐头向上
        if (curKDJ37.j < config.jExtremeLow && curKDJ37.j > prevKDJ37.j) {
          let strength: Strength = curKDJ37.j < -20 ? "strong" : "medium";
          if (regimeAdj.signalStrengthBoost < 0) {
            if (strength === "strong") strength = "medium";
            else if (strength === "medium") strength = "weak";
          }

          signals[i] = {
            type: "buy",
            reason: "J线超卖反弹",
            strength,
            tMode: "反T",
            timeWindow,
            description: `J值=${curKDJ37.j.toFixed(1)}极度超卖后拐头向上(${prevKDJ37.j.toFixed(1)}→${curKDJ37.j.toFixed(1)})，反弹信号`,
          };
          lastSellPrice = null;
          continue;
        }
      }
    }

    // ── 38. J线超买回落 → 卖出(正T) ── (v3.9新增)
    // J值高于100(极端超买)且开始拐头向下 → 回落信号
    if (isFactorEnabled("J线超买回落", factorOverrides) && isSellWindow(timeWindow) && regimeAdj.allowSell) {
      const curKDJ38 = kdjValues[i];
      const prevKDJ38 = i >= 1 ? kdjValues[i - 1] : null;
      if (curKDJ38 && !isNaN(curKDJ38.j) && prevKDJ38 && !isNaN(prevKDJ38.j)) {
        // J值高于极端高值阈值 且 开始拐头向下
        if (curKDJ38.j > config.jExtremeHigh && curKDJ38.j < prevKDJ38.j) {
          let strength: Strength = curKDJ38.j > 120 ? "strong" : "medium";
          if (regimeAdj.signalStrengthBoost < 0) {
            if (strength === "strong") strength = "medium";
            else if (strength === "medium") strength = "weak";
          }

          signals[i] = {
            type: "sell",
            reason: "J线超买回落",
            strength,
            tMode: "正T",
            timeWindow,
            description: `J值=${curKDJ38.j.toFixed(1)}极度超买后拐头向下(${prevKDJ38.j.toFixed(1)}→${curKDJ38.j.toFixed(1)})，回落信号`,
          };
          lastSellPrice = cur.price;
          continue;
        }
      }
    }
  }

  // ── 因子39: 递增放量 → 买入信号 ──
  // 连续3+分钟成交量逐步放大，且价格同步上涨 → 主力资金持续流入信号
  // 递增根数越多、价格上涨幅度越大、量增速越快 → 信号越强
  if (isFactorEnabled("递增放量", factorOverrides) && regimeAdj.allowBuy) {
    for (let i = 4; i < timeline.length; i++) {
      if (signals[i]) continue;

      const cur = timeline[i];
      const timeWindow = getTimeWindow(cur.time);
      if (!isBuyWindow(timeWindow)) continue;

      // Check for progressive volume: 3+ consecutive minutes of increasing volume
      // Look back from current position to find the longest progressive sequence ending at i
      let progLen = 1;
      for (let j = i; j > Math.max(1, i - 10); j--) {
        if (timeline[j].volume > timeline[j - 1].volume && timeline[j].volume > 0) {
          progLen++;
        } else {
          break;
        }
      }

      if (progLen >= 3) {
        const startIdx = i - progLen + 1;
        const startPrice = timeline[startIdx].price;
        const endPrice = cur.price;
        const priceRise = startPrice > 0 ? ((endPrice - startPrice) / startPrice) * 100 : 0;

        // Only generate signal if price is rising (量价齐升)
        if (priceRise > 0) {
          const startVol = timeline[startIdx].volume;
          const endVol = cur.volume;
          const volGrowth = startVol > 0 ? ((endVol - startVol) / startVol) * 100 : 0;

          // Calculate average step growth rate
          let totalStepGrowth = 0;
          let stepCount = 0;
          for (let j = startIdx + 1; j <= i; j++) {
            if (timeline[j - 1].volume > 0) {
              totalStepGrowth += (timeline[j].volume - timeline[j - 1].volume) / timeline[j - 1].volume;
              stepCount++;
            }
          }
          const avgStepGrowthRate = stepCount > 0 ? (totalStepGrowth / stepCount) * 100 : 0;

          // Determine signal strength
          let strength: Strength;
          if (progLen >= 6 && priceRise >= 1.5 && volGrowth >= 100) {
            strength = "strong";
          } else if (progLen >= 4 && priceRise >= 0.5) {
            strength = "medium";
          } else if (progLen >= 3 && priceRise > 0) {
            strength = "weak";
          } else {
            continue; // Not strong enough
          }

          // Adjust by regime
          if (regimeAdj.signalStrengthBoost < 0) {
            if (strength === "strong") strength = "medium";
            else if (strength === "medium") strength = "weak";
          }

          const detailParts: string[] = [];
          detailParts.push(`${progLen}分钟递增`);
          if (priceRise >= 0.5) detailParts.push(`涨${priceRise.toFixed(1)}%`);
          if (volGrowth >= 50) detailParts.push(`量增${volGrowth.toFixed(0)}%`);
          if (avgStepGrowthRate >= 20) detailParts.push(`均步增速${avgStepGrowthRate.toFixed(0)}%`);

          signals[i] = {
            type: "buy",
            reason: "递增放量",
            strength,
            tMode: "反T",
            timeWindow,
            description: detailParts.join("，") + "，主力资金持续流入",
          };
          lastSellPrice = null;
          continue;
        }
      }
    }
  }

  // ── v3.8: 动态自定义因子评估 ──
  // 评估用户在UI中创建的自定义因子（非内置因子）
  // 内置因子（factor_31-34）已由上面的硬编码逻辑处理，这里只处理用户自定义因子
  // 注意：自定义因子不限制时间窗口——用户自己定义了策略意图和条件，如需时间限制可在条件中选择时间窗口条件
  const userCustomFactors = (customFactors || []).filter(f => f.enabled && !f.isBuiltIn && f.conditions.length > 0);
  if (userCustomFactors.length > 0) {
    for (let i = 2; i < timeline.length; i++) {
      // 跳过已有信号的位置（硬编码因子优先级更高）
      if (signals[i]) continue;

      const cur = timeline[i];
      const timeWindow = getTimeWindow(cur.time);

      for (const factor of userCustomFactors) {
        // 自定义因子不强制匹配买回/卖出窗口——用户自定义条件已包含意图判断
        // 不限制时间窗口——用户如需时间过滤，可在条件中选择时间窗口条件（如"开盘30分钟"）
        // 市场环境：仅"横盘末期"（方向不明风险大）时阻止，其他环境均允许
        if (regime === "横盘末期") continue;

        // 评估该因子的所有条件（AND逻辑：所有条件必须同时满足）
        let allConditionsMet = true;
        for (const condition of factor.conditions) {
          const met = evaluateCondition(
            condition.key,
            timeline, i, avgVol, prevClose, config,
            macdByTime, rsiValues, bollValues, kdjValues,
            openPrice,
          );
          if (!met) {
            allConditionsMet = false;
            break;
          }
        }

        if (allConditionsMet) {
          signals[i] = {
            type: factor.signalType,
            reason: factor.name,
            strength: factor.strength,
            tMode: factor.tMode,
            timeWindow,
            description: `自定义因子[${factor.name}]触发：${factor.conditions.map(c => c.label).join(" + ")}`,
          };
          if (factor.signalType === "sell") {
            lastSellPrice = cur.price;
          } else {
            lastSellPrice = null;
          }
          break; // 同一时间点只取第一个匹配的自定义因子
        }
      }
    }
  }

  // ── 后处理 v3.6：信号增强系统 ──
  // 1. 信号去重：连续相同因子名称的信号只保留第一个
  let lastFactorName: string | null = null;
  for (let i = 0; i < signals.length; i++) {
    if (signals[i]) {
      if (signals[i]!.reason === lastFactorName) {
        signals[i] = null;
      } else {
        lastFactorName = signals[i]!.reason;
      }
    }
  }

  // 2. 信号共振确认：当2+个不同因子在3分钟内触发同方向信号，提升强度
  //    这是最有效的胜率提升手段——多因子共振远比单因子可靠
  const CONFLUENCE_WINDOW = 3; // 回看3根（3分钟）
  for (let i = 0; i < signals.length; i++) {
    if (!signals[i]) continue;
    const curSig = signals[i]!;
    const curDir: "buy" | "sell" = curSig.type === "buy" ? "buy" : "sell";

    // Count same-direction signals with different factor names in the window
    const factorNames = new Set<string>();
    factorNames.add(curSig.reason);
    let confluenceCount = 1;

    for (let j = Math.max(0, i - CONFLUENCE_WINDOW); j < i; j++) {
      if (signals[j]) {
        const prevSig = signals[j]!;
        const prevDir: "buy" | "sell" = prevSig.type === "buy" ? "buy" : "sell";
        if (prevDir === curDir && prevSig.reason !== curSig.reason) {
          if (!factorNames.has(prevSig.reason)) {
            factorNames.add(prevSig.reason);
            confluenceCount++;
          }
        }
      }
    }

    // Also check forward window (factors that fire after this one)
    for (let j = i + 1; j < Math.min(signals.length, i + CONFLUENCE_WINDOW + 1); j++) {
      if (signals[j]) {
        const nextSig = signals[j]!;
        const nextDir: "buy" | "sell" = nextSig.type === "buy" ? "buy" : "sell";
        if (nextDir === curDir && nextSig.reason !== curSig.reason) {
          if (!factorNames.has(nextSig.reason)) {
            factorNames.add(nextSig.reason);
            confluenceCount++;
          }
        }
      }
    }

    // Upgrade strength based on confluence count
    if (confluenceCount >= 3 && curSig.strength !== "strong") {
      signals[i] = {
        ...curSig,
        strength: "strong",
        description: curSig.description
          ? `${curSig.description} 【${confluenceCount}因子共振→强】`
          : `${confluenceCount}个因子共振确认，信号强度提升`,
      };
    } else if (confluenceCount >= 2 && curSig.strength === "weak") {
      signals[i] = {
        ...curSig,
        strength: "medium",
        description: curSig.description
          ? `${curSig.description} 【${confluenceCount}因子共振→中】`
          : `${confluenceCount}个因子共振确认，信号强度提升`,
      };
    } else if (confluenceCount >= 2 && curSig.strength === "medium") {
      // 2因子共振的中等信号，在描述中标注但不升级
      signals[i] = {
        ...curSig,
        description: curSig.description
          ? `${curSig.description} 【${confluenceCount}因子共振】`
          : `${confluenceCount}个因子共振确认`,
      };
    }
  }

  // 3. 关键价位附近信号增强
  //    昨日高点/低点、整数关口是天然的支撑阻力位
  //    在这些价位附近触发的信号可靠性更高
  if (prevClose > 0) {
    // 从K线数据推算关键价位（基于昨收价推算常见关键位）
    const keyLevels = computeKeyPriceLevels(prevClose, timeline);

    for (let i = 0; i < signals.length; i++) {
      if (!signals[i]) continue;
      const curSig = signals[i]!;
      const price = timeline[i].price;

      // Check proximity to key levels
      for (const level of keyLevels) {
        const proximity = Math.abs(price - level.price) / level.price * 100;

        if (proximity < 0.15) { // 价格在关键位0.15%范围内
          // 卖出信号在阻力位附近更可靠
          if (curSig.type === "sell" && level.type === "resistance") {
            if (curSig.strength === "weak") {
              signals[i] = {
                ...curSig,
                strength: "medium",
                description: curSig.description
                  ? `${curSig.description} 【${level.name}阻力确认→中】`
                  : `在${level.name}阻力位附近，信号增强`,
              };
            } else if (curSig.strength === "medium") {
              signals[i] = {
                ...curSig,
                strength: "strong",
                description: curSig.description
                  ? `${curSig.description} 【${level.name}阻力确认→强】`
                  : `在${level.name}阻力位附近，信号增强`,
              };
            }
            break;
          }
          // 买入信号在支撑位附近更可靠
          if (curSig.type === "buy" && level.type === "support") {
            if (curSig.strength === "weak") {
              signals[i] = {
                ...curSig,
                strength: "medium",
                description: curSig.description
                  ? `${curSig.description} 【${level.name}支撑确认→中】`
                  : `在${level.name}支撑位附近，信号增强`,
              };
            } else if (curSig.strength === "medium") {
              signals[i] = {
                ...curSig,
                strength: "strong",
                description: curSig.description
                  ? `${curSig.description} 【${level.name}支撑确认→强】`
                  : `在${level.name}支撑位附近，信号增强`,
              };
            }
            break;
          }
        }
      }
    }
  }

  // 4. 波动率自适应：高波动时放宽差价阈值，低波动时收严
  //    波动率用近期价格变化的标准差衡量
  if (timeline.length >= 20) {
    const recentChanges = timeline.slice(-20).map(d => d.changePercent);
    const avgChange = recentChanges.reduce((s, v) => s + v, 0) / recentChanges.length;
    const variance = recentChanges.reduce((s, v) => s + (v - avgChange) ** 2, 0) / recentChanges.length;
    const vol = Math.sqrt(variance);

    // 高波动环境（标准差>0.5%）：弱信号降级，避免噪声
    // 低波动环境（标准差<0.2%）：弱信号也可以考虑，因为波动小更安全
    if (vol > 0.5) {
      for (let i = 0; i < signals.length; i++) {
        if (signals[i] && signals[i]!.strength === "weak" && signals[i]!.type !== "stoploss") {
          // 高波动时弱信号不可靠，降为不显示
          signals[i] = null;
        }
      }
    }
  }

  // 5. 均价线斜率加速度检测
  //    当均价线从快速上升突然变缓，是冲高回落的早期预警
  //    当均价线从快速下降突然变缓，是探底回升的早期信号
  if (timeline.length >= 10) {
    for (let i = 0; i < signals.length; i++) {
      if (!signals[i]) continue;
      const curSig = signals[i]!;
      if (i < 5) continue;

      // 计算均价线斜率变化
      const curSlope = timeline[i].avgPrice - timeline[i - 1].avgPrice;
      const prevSlope = timeline[i - 1].avgPrice - timeline[i - 2].avgPrice;
      const slopeChange = curSlope - prevSlope;

      // 卖出信号 + 均价线斜率由正转负（加速度向下）→ 增强
      if (curSig.type === "sell" && prevSlope > 0 && slopeChange < -prevSlope * 0.5) {
        if (curSig.strength === "weak" || curSig.strength === "medium") {
          signals[i] = {
            ...curSig,
            strength: "strong",
            description: curSig.description
              ? `${curSig.description} 【均价线拐头确认→强】`
              : `均价线斜率由正转负，趋势反转确认`,
          };
        }
      }

      // 买入信号 + 均价线斜率由负转正（加速度向上）→ 增强
      if (curSig.type === "buy" && prevSlope < 0 && slopeChange > -prevSlope * 0.5) {
        if (curSig.strength === "weak" || curSig.strength === "medium") {
          signals[i] = {
            ...curSig,
            strength: "strong",
            description: curSig.description
              ? `${curSig.description} 【均价线拐头确认→强】`
              : `均价线斜率由负转正，趋势反转确认`,
          };
        }
      }
    }
  }

  // 6. 大盘联动加权：大盘趋势与个股信号方向一致时增强，反向时降级
  //    这是最重要的外部验证——当大盘也在上涨时，个股买入信号更可靠
  //    当大盘在下跌时，个股卖出信号更可靠
  if (indexRegime && indexRegime.confidence >= 40) {
    const isMarketUp = indexRegime.regime === "上升通道";
    const isMarketDown = indexRegime.regime === "下跌趋势";
    const isMarketOscillating = indexRegime.regime === "震荡市";

    for (let i = 0; i < signals.length; i++) {
      if (!signals[i]) continue;
      const curSig = signals[i]!;

      // 大盘上升 + 个股买入信号 → 增强置信度
      if (isMarketUp && curSig.type === "buy" && curSig.strength === "medium") {
        signals[i] = {
          ...curSig,
          strength: "strong",
          description: curSig.description
            ? `${curSig.description} 【大盘上升通道共振→强】`
            : `大盘上升通道，买入信号增强`,
        };
      }

      // 大盘下跌 + 个股卖出信号 → 增强置信度
      if (isMarketDown && curSig.type === "sell" && curSig.strength === "medium") {
        signals[i] = {
          ...curSig,
          strength: "strong",
          description: curSig.description
            ? `${curSig.description} 【大盘下跌通道共振→强】`
            : `大盘下跌通道，卖出信号增强`,
        };
      }

      // 大盘上升 + 个股卖出信号 → 降级（可能卖飞）
      if (isMarketUp && curSig.type === "sell" && curSig.strength === "weak") {
        signals[i] = null; // 弱卖出信号在牛市中过滤掉
      }

      // 大盘下跌 + 个股买入信号 → 降级（可能接飞刀）
      if (isMarketDown && curSig.type === "buy" && curSig.strength === "weak") {
        signals[i] = null; // 弱买入信号在熊市中过滤掉
      }

      // 大盘震荡 + 弱信号保留但标注（震荡市做T最安全）
      if (isMarketOscillating && curSig.strength === "weak") {
        // 保留弱信号但增加描述
        signals[i] = {
          ...curSig,
          description: curSig.description
            ? `${curSig.description} 【震荡市弱信号保留】`
            : `震荡市弱信号（高抛低吸环境）`,
        };
      }
    }
  }

  // 7. 板块联动加权：板块趋势与个股信号方向一致时增强，反向时降级
  //    板块比大盘更精准——同板块个股走势高度关联
  //    板块上升 + 个股滞涨 → 买入机会（补涨逻辑）
  //    板块下跌 + 个股抗跌 → 卖出机会（补跌逻辑）
  if (sectorRegime && sectorRegime.confidence >= 40) {
    const isSectorUp = sectorRegime.regime === "上升通道";
    const isSectorDown = sectorRegime.regime === "下跌趋势";
    const isSectorOscillating = sectorRegime.regime === "震荡市";

    for (let i = 0; i < signals.length; i++) {
      if (!signals[i]) continue;
      const curSig = signals[i]!;

      // 板块上升 + 个股买入信号 → 增强置信度
      if (isSectorUp && curSig.type === "buy" && curSig.strength === "medium") {
        signals[i] = {
          ...curSig,
          strength: "strong",
          description: curSig.description
            ? `${curSig.description} 【板块上升共振→强】`
            : `板块上升通道，买入信号增强`,
        };
      }

      // 板块下跌 + 个股卖出信号 → 增强置信度
      if (isSectorDown && curSig.type === "sell" && curSig.strength === "medium") {
        signals[i] = {
          ...curSig,
          strength: "strong",
          description: curSig.description
            ? `${curSig.description} 【板块下跌共振→强】`
            : `板块下跌通道，卖出信号增强`,
        };
      }

      // 板块上升 + 个股弱卖出信号 → 降级（板块向上，别急着卖）
      if (isSectorUp && curSig.type === "sell" && curSig.strength === "weak") {
        signals[i] = null; // 弱卖出信号在板块上涨中过滤掉
      }

      // 板块下跌 + 个股弱买入信号 → 降级（板块向下，别急着买）
      if (isSectorDown && curSig.type === "buy" && curSig.strength === "weak") {
        signals[i] = null; // 弱买入信号在板块下跌中过滤掉
      }

      // 板块震荡 + 中等信号标注（板块震荡=高抛低吸好时机）
      if (isSectorOscillating && curSig.strength === "medium") {
        signals[i] = {
          ...curSig,
          description: curSig.description
            ? `${curSig.description} 【板块震荡共振→中】`
            : `板块震荡市，高抛低吸信号`,
        };
      }
    }
  }

  // 8. 因子强度覆盖上限（用户在策略面板中设置的因子参数优先级最高）
  //    如果用户将某个因子设为"弱"，则该因子产生的信号强度最高只能为"弱"
  //    这确保用户对因子强度的显式设置不会被后续的共振/趋势增强等逻辑覆盖
  //    同时标记 strengthOverridden，防止渲染层合并时被升级
  if (factorOverrides && factorOverrides.length > 0) {
    const strengthRank: Record<string, number> = { weak: 1, medium: 2, strong: 3 };
    for (let i = 0; i < signals.length; i++) {
      if (!signals[i]) continue;
      const sig = signals[i]!;
      const override = getFactorOverride(sig.reason, factorOverrides);
      if (override?.strength) {
        const currentRank = strengthRank[sig.strength] || 2;
        const overrideRank = strengthRank[override.strength] || 2;
        // 只有当覆盖强度 < 当前强度时才降级（覆盖是上限，不是下限）
        if (overrideRank < currentRank) {
          signals[i] = {
            ...sig,
            strength: override.strength,
            strengthOverridden: true,
            description: sig.description
              ? `${sig.description} 【因子参数覆盖→${override.strength === "strong" ? "强" : override.strength === "medium" ? "中" : "弱"}】`
              : `因子参数覆盖强度为${override.strength === "strong" ? "强" : override.strength === "medium" ? "中" : "弱"}`,
          };
        }
      }
    }
  }

  return signals;
}

// ── 做T记录模板 ──────────────────────────────────────

export interface TRecord {
  date: string;
  stock: string;
  direction: TMode;
  sellPrice: number;
  buyPrice: number;
  quantity: number;
  spreadPct: number;
  fee: number;
  netProfit: number;
  disciplineCompliance: boolean;
}

/**
 * 计算做T成本
 * 卖出佣金(万2.5) + 买入佣金(万2.5) + 印花税(千1卖出) + 滑点
 */
export function calculateTCost(
  sellPrice: number,
  buyPrice: number,
  quantity: number,
  commissionRate: number = 0.00025,  // 万2.5
  stampTaxRate: number = 0.001,       // 千1
  slippage: number = 0.01             // 滑点百分比
): {
  sellCommission: number;
  buyCommission: number;
  stampTax: number;
  slippageCost: number;
  totalFee: number;
  grossProfit: number;
  netProfit: number;
  netReturnPct: number;
} {
  const sellAmount = sellPrice * quantity;
  const buyAmount = buyPrice * quantity;

  const sellCommission = Math.max(sellAmount * commissionRate, 5); // 最低5元
  const buyCommission = Math.max(buyAmount * commissionRate, 5);
  const stampTax = sellAmount * stampTaxRate;
  const slippageCost = (sellAmount + buyAmount) * slippage;

  const totalFee = sellCommission + buyCommission + stampTax + slippageCost;
  const grossProfit = sellAmount - buyAmount;
  const netProfit = grossProfit - totalFee;
  const netReturnPct = buyAmount > 0 ? (netProfit / buyAmount) * 100 : 0;

  return {
    sellCommission,
    buyCommission,
    stampTax,
    slippageCost,
    totalFee,
    grossProfit,
    netProfit,
    netReturnPct,
  };
}

// ── 策略概要信息（用于Admin Panel展示）──────────────────

export const STRATEGY_OVERVIEW = {
  version: "3.9",
  name: "滚动做T策略引擎 v3.9",
  basedOn: "滚动做T操作策略 PDF文档",
  corePhilosophy: "做T不是独立的盈利系统，而是持仓管理的优化工具。所有做T操作必须服务于\u201C降低持仓成本\u201D这一个目标。",
  basicPrinciples: [
    { id: 1, name: "底仓不动", desc: "底仓占总持仓60%-70%，任何情况下不用于做T" },
    { id: 2, name: "固定T仓", desc: "做T仓位固定为30%-40%，不因盈亏增减" },
    { id: 3, name: "当日必回", desc: "卖出的底仓当日必须买回，绝不隔夜降仓" },
    { id: 4, name: "差价底线", desc: "差价不足1.5%坚决不动" },
    { id: 5, name: "单次定量", desc: "每次做T的股数固定，不贪多" },
  ],
  selectionCriteria: {
    required: [
      { name: "日均振幅≥3%", desc: "连续20个交易日平均振幅低于3%的股票，做T没有利润空间" },
      { name: "日均成交额≥5000万", desc: "流动性不足的股票，买卖价差大，滑点成本高" },
      { name: "股性活跃有规律", desc: "观察该股近1个月的日内走势，判断是否有反复的冲高回落和探底回升" },
      { name: "对该股足够熟悉", desc: "至少跟踪观察了2周以上的日内走势" },
    ],
    exclude: [
      { name: "ST/*ST股", reason: "涨跌停5%，波动受限且风险极高" },
      { name: "次新股（上市<3月）", reason: "股性未定，波动无规律" },
      { name: "停牌前", reason: "复牌后可能连续涨跌停" },
      { name: "单边趋势", reason: "上涨做T必卖飞，下跌做T必越套越深" },
    ],
  },
  timeWindows: [
    { period: "9:30-10:00", feature: "开盘波动最大，方向不明确", action: "不操作，只观察", actionType: "observe" as const },
    { period: "10:00-10:30", feature: "主力意图显现，冲高或下探", action: "正T最佳卖出窗口", actionType: "sell" as const },
    { period: "10:30-11:30", feature: "走势趋于稳定", action: "正T买回 / 反T(先卖再买)买入窗口", actionType: "buy" as const },
    { period: "13:00-14:00", feature: "午后可能二次冲高", action: "第二次做T的卖出窗口", actionType: "sell" as const },
    { period: "14:00-14:30", feature: "尾盘方向逐渐明确", action: "第二次做T的买回窗口", actionType: "buy" as const },
    { period: "14:30-15:00", feature: "尾盘波动大，变数多", action: "不操作（极端低位除外）", actionType: "observe" as const },
  ],
  stopLossRules: [
    { scenario: "正T卖出后股价继续上涨", rule: "上涨超过卖出价1.5%时，必须买回（认亏买回）" },
    { scenario: "反T(先卖再买)买入后股价继续下跌", rule: "下跌超过买入价1.5%时，不在同日补仓，次日处理" },
    { scenario: "做T后股价突破关键位", rule: "放弃做T，回归持有策略" },
  ],
  marketRegimes: [
    { regime: "震荡市" as const, suitability: "最适合做T", strategy: "正T为主，高抛低吸，每日1-2次T", expectedReturn: "每月降低成本2%-5%" },
    { regime: "上升通道" as const, suitability: "谨慎做T", strategy: "只做正T，T仓降至20%，买回要快", expectedReturn: "每月降低成本1%-2%" },
    { regime: "下跌趋势" as const, suitability: "不建议做T", strategy: "只做正T卖出，T仓降至10-15%", expectedReturn: "不建议操作" },
    { regime: "横盘末期" as const, suitability: "等待方向选择", strategy: "减少做T频率，等待方向明确", expectedReturn: "暂停操作" },
  ],
  factorSummary: [
    { id: 31, name: "脉冲缩量企稳", type: "buy" as const, tMode: "正T" as const, strength: "strong" as const, version: "v3.7", description: "脉冲下跌后卖出量能萎缩+VWAP走平 → 强买回信号" },
    { id: 32, name: "脉冲拉升缩量滞涨", type: "sell" as const, tMode: "正T" as const, strength: "strong" as const, version: "v3.7", description: "脉冲拉升后买入量能萎缩+VWAP走平 → 强卖出信号" },
    { id: 33, name: "缩量横盘突破", type: "buy" as const, tMode: "反T" as const, strength: "strong" as const, version: "v3.7", description: "缩量窄幅盘整后价格向上突破 → 强买信号" },
    { id: 34, name: "放量突破均线", type: "buy" as const, tMode: "反T" as const, strength: "strong" as const, version: "v3.7", description: "成交量放大+价格从均线下方突破到上方 → 强买信号" },
    { id: 35, name: "KDJ金叉买入", type: "buy" as const, tMode: "反T" as const, strength: "strong" as const, version: "v3.9", description: "K线上穿D线(金叉)，J<20超卖区更可靠 → 买入信号" },
    { id: 36, name: "KDJ死叉卖出", type: "sell" as const, tMode: "正T" as const, strength: "strong" as const, version: "v3.9", description: "K线下穿D线(死叉)，J>80超买区更可靠 → 卖出信号" },
    { id: 37, name: "J线超卖反弹", type: "buy" as const, tMode: "反T" as const, strength: "medium" as const, version: "v3.9", description: "J值低于0后拐头向上 → 极端超卖反弹信号" },
    { id: 38, name: "J线超买回落", type: "sell" as const, tMode: "正T" as const, strength: "medium" as const, version: "v3.9", description: "J值高于100后拐头向下 → 极端超买回落信号" },
  ],
};
