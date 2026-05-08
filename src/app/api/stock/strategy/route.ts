import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { STRATEGY_OVERVIEW, DEFAULT_STRATEGY_CONFIG } from "@/lib/t-strategy";

// ── 做 T 策略参数与逻辑配置 (v3.0 基于滚动做T操作策略PDF) ──

export async function GET() {
  // Fetch factors from database
  const factors = await db.strategyFactor.findMany({
    orderBy: { priority: "desc" },
  });

  // Fetch logic from database
  const logicSteps = await db.strategyLogic.findMany({
    orderBy: { logicOrder: "asc" },
  });

  // Fetch indicator config overrides from database
  const configOverrides = await db.strategyConfig.findMany();
  const overrideMap = new Map<string, number>();
  for (const c of configOverrides) {
    overrideMap.set(`${c.indicatorKey}.${c.paramKey}`, parseFloat(c.value));
  }

  // Helper to get param value (override or default)
  const getParam = (indKey: string, paramKey: string, defaultVal: number): number => {
    return overrideMap.get(`${indKey}.${paramKey}`) ?? defaultVal;
  };

  const strategy = {
    version: STRATEGY_OVERVIEW.version,
    name: STRATEGY_OVERVIEW.name,
    basedOn: STRATEGY_OVERVIEW.basedOn,
    description: STRATEGY_OVERVIEW.corePhilosophy,

    // ── 核心理念 ──
    corePhilosophy: STRATEGY_OVERVIEW.corePhilosophy,
    basicPrinciples: STRATEGY_OVERVIEW.basicPrinciples,

    // ── 标的筛选标准 ──
    selectionCriteria: STRATEGY_OVERVIEW.selectionCriteria,

    // ── 技术指标参数 ──
    indicators: {
      macd: {
        name: "MACD (Moving Average Convergence Divergence)",
        description: "指数平滑异同移动平均线，用于判断趋势方向和强弱",
        params: [
          { key: "fastPeriod", label: "快线EMA周期", value: getParam("macd", "fastPeriod", DEFAULT_STRATEGY_CONFIG.macdFast), unit: "根K线", description: "短期指数移动平均线周期" },
          { key: "slowPeriod", label: "慢线EMA周期", value: getParam("macd", "slowPeriod", DEFAULT_STRATEGY_CONFIG.macdSlow), unit: "根K线", description: "长期指数移动平均线周期" },
          { key: "signalPeriod", label: "信号线EMA周期", value: getParam("macd", "signalPeriod", DEFAULT_STRATEGY_CONFIG.macdSignal), unit: "根K线", description: "DIF的信号线周期" },
        ],
        formulas: [
          { name: "DIF", formula: "DIF = EMA(12) - EMA(26)", description: "快慢线差值" },
          { name: "DEA", formula: "DEA = EMA(DIF, 9)", description: "DIF的信号线" },
          { name: "MACD柱", formula: "MACD = (DIF - DEA) × 2", description: "柱状图，反映多空力量" },
        ],
      },
      vwap: {
        name: "VWAP (Volume Weighted Average Price)",
        description: "成交量加权平均价（均价线），分时图核心参考线",
        params: [
          { key: "deviationSell", label: "卖出偏离阈值", value: getParam("vwap", "deviationSell", DEFAULT_STRATEGY_CONFIG.vwapDeviationSell), unit: "%", description: "偏离均价线超过此值考虑卖出（PDF=2%）" },
          { key: "deviationBuy", label: "买回偏离阈值", value: getParam("vwap", "deviationBuy", DEFAULT_STRATEGY_CONFIG.vwapDeviationBuy), unit: "%", description: "回到均价线附近此值内买回" },
          { key: "source", label: "数据源", value: "Tencent实时1分钟线", description: "使用实时1分钟数据计算VWAP" },
        ],
      },
      rsi: {
        name: "RSI (Relative Strength Index)",
        description: "相对强弱指标，衡量价格超买超卖程度（v3.2新增）",
        params: [
          { key: "rsiPeriod", label: "RSI周期", value: getParam("rsi", "rsiPeriod", DEFAULT_STRATEGY_CONFIG.rsiPeriod), unit: "根K线", description: "RSI计算周期，通常14" },
          { key: "oversold", label: "超卖阈值", value: getParam("rsi", "oversold", DEFAULT_STRATEGY_CONFIG.rsiOversold), unit: "", description: "RSI低于此值为超卖区" },
          { key: "overbought", label: "超买阈值", value: getParam("rsi", "overbought", DEFAULT_STRATEGY_CONFIG.rsiOverbought), unit: "", description: "RSI高于此值为超买区" },
        ],
        formulas: [
          { name: "RSI", formula: "RSI = 100 - 100/(1+RS), RS = avgGain/avgLoss", description: "相对强弱值" },
        ],
      },
      boll: {
        name: "Bollinger Bands (布林带)",
        description: "布林带指标，衡量价格波动区间和突破信号（v3.2新增）",
        params: [
          { key: "bollPeriod", label: "布林带周期", value: getParam("boll", "bollPeriod", DEFAULT_STRATEGY_CONFIG.bollPeriod), unit: "根K线", description: "SMA计算周期，通常20" },
          { key: "bollMultiplier", label: "标准差倍数", value: getParam("boll", "bollMultiplier", DEFAULT_STRATEGY_CONFIG.bollMultiplier), unit: "倍", description: "上下轨偏离中轨的标准差倍数，通常2" },
        ],
        formulas: [
          { name: "中轨", formula: "MID = SMA(close, 20)", description: "中轨=SMA" },
          { name: "上轨", formula: "UPPER = MID + 2×STD", description: "上轨=中轨+2倍标准差" },
          { name: "下轨", formula: "LOWER = MID - 2×STD", description: "下轨=中轨-2倍标准差" },
        ],
      },
      volume: {
        name: "成交量分析",
        description: "量价关系判断，包括放量、缩量、量价背离、脉冲放量",
        params: [
          { key: "volumeMultiplier", label: "放量倍数阈值", value: getParam("volume", "volumeMultiplier", DEFAULT_STRATEGY_CONFIG.volumeMultiplier), unit: "倍", description: "成交量超过均量此倍数视为放量" },
          { key: "volumeMultiplierStrong", label: "强放量倍数", value: getParam("volume", "volumeMultiplierStrong", DEFAULT_STRATEGY_CONFIG.volumeMultiplierStrong), unit: "倍", description: "超过此倍数为强放量" },
          { key: "volumeShrinkRatio", label: "缩量比例", value: getParam("volume", "volumeShrinkRatio", DEFAULT_STRATEGY_CONFIG.volumeShrinkRatio), unit: "", description: "成交量低于均量此比例为缩量" },
          { key: "volumePulseMultiplier", label: "脉冲放量倍数", value: getParam("volume", "volumePulseMultiplier", DEFAULT_STRATEGY_CONFIG.volumePulseMultiplier), unit: "倍", description: "成交量突增超过均量此倍数为脉冲放量（v3.2新增）" },
          { key: "consecutiveShrinkBars", label: "连续缩量根数", value: getParam("volume", "consecutiveShrinkBars", DEFAULT_STRATEGY_CONFIG.consecutiveShrinkBars), unit: "根", description: "连续成交量递减的K线根数（v3.2新增）" },
        ],
      },
    },

    // ── 分时信号规则（v3.2 优化版） ──
    timelineSignals: {
      name: "分时做T信号 (v3.2)",
      description: "基于PDF滚动做T操作策略，23条信号规则，含时间窗口过滤、量价背离、止损、差价底线、MACD柱转向、RSI超买超卖、布林带突破、脉冲放量、DIF零轴穿越、因子DB覆盖",
      rules: [
        {
          id: 0, name: "止损买回", type: "stoploss", priority: 0,
          description: "正T卖出后股价继续上涨超过1.5%，必须认亏买回保底仓",
          condition: "cur.price > lastSellPrice × (1 + 1.5%)",
          category: "STOPLOSS", tMode: "正T", timeWindow: "any",
          strengthRules: [{ condition: "触发止损", strength: "strong" }],
        },
        {
          id: 1, name: "MACD金叉", type: "buy", priority: 1,
          description: "DIF从下方上穿DEA，短期趋势转多（仅买入窗口生效）",
          condition: "prevDIF ≤ prevDEA && curDIF > curDEA",
          category: "MACD", tMode: "反T", timeWindow: "buy_window",
          strengthRules: [
            { condition: "MACD > 0（零轴上方金叉）", strength: "strong" },
            { condition: "MACD ≤ 0（零轴下方金叉）", strength: "medium" },
          ],
        },
        {
          id: 2, name: "MACD死叉", type: "sell", priority: 2,
          description: "DIF从上方下穿DEA，短期趋势转空（仅卖出窗口生效）",
          condition: "prevDIF ≥ prevDEA && curDIF < curDEA",
          category: "MACD", tMode: "正T", timeWindow: "sell_window",
          strengthRules: [
            { condition: "MACD < 0（零轴下方死叉）", strength: "strong" },
            { condition: "MACD ≥ 0（零轴上方死叉）", strength: "medium" },
          ],
        },
        {
          id: 3, name: "均价偏离过高", type: "sell", priority: 3,
          description: "价格偏离均价线超过2%且出现拐头回落（PDF核心卖出信号）",
          condition: "(cur.price - cur.avgPrice) / cur.avgPrice > 2% && prev.price > cur.price",
          category: "VWAP", tMode: "正T", timeWindow: "sell_window",
          strengthRules: [
            { condition: "偏离≥3%", strength: "strong" },
            { condition: "偏离2%-3%", strength: "medium" },
          ],
          threshold: { key: "vwapDeviationSell", label: "卖出偏离阈值", value: DEFAULT_STRATEGY_CONFIG.vwapDeviationSell, unit: "%" },
        },
        {
          id: 4, name: "跌破均价线", type: "sell", priority: 4,
          description: "价格从均线上方跌破到均线下方",
          condition: "prev.price > prev.avgPrice && cur.price < cur.avgPrice",
          category: "VWAP", tMode: "正T", timeWindow: "sell_window",
          strengthRules: [
            { condition: "涨跌幅 < -1%", strength: "strong" },
            { condition: "涨跌幅 ≥ -1%", strength: "medium" },
          ],
        },
        {
          id: 5, name: "量价背离", type: "sell", priority: 5,
          description: "股价创新高但成交量萎缩，短期见顶信号（PDF策略新增）",
          condition: "cur.price ≥ 近10根最高 && cur.volume < 近10根最大量 × 0.5",
          category: "DIVERGENCE", tMode: "正T", timeWindow: "sell_window",
          strengthRules: [{ condition: "触发量价背离", strength: "strong" }],
        },
        {
          id: 6, name: "均线支撑买回", type: "buy", priority: 6,
          description: "价格回到均价线附近企稳且不破均线（PDF核心买回信号）",
          condition: "偏离均价线 ≤ 0.3% && 价格从下方回到均线上方",
          category: "VWAP", tMode: "正T", timeWindow: "buy_window",
          strengthRules: [{ condition: "均线支撑有效", strength: "strong" }],
          threshold: { key: "vwapDeviationBuy", label: "买回偏离阈值", value: DEFAULT_STRATEGY_CONFIG.vwapDeviationBuy, unit: "%" },
        },
        {
          id: 7, name: "昨收价支撑", type: "buy", priority: 7,
          description: "价格回到昨收盘价附近企稳（PDF策略新增）",
          condition: "价格接近昨收 && 从下方回到昨收上方",
          category: "SUPPORT", tMode: "正T", timeWindow: "buy_window",
          strengthRules: [{ condition: "昨收支撑有效", strength: "medium" }],
        },
        {
          id: 8, name: "量缩价稳", type: "buy", priority: 8,
          description: "下跌过程中成交量明显缩小，抛压衰竭标志（PDF策略新增）",
          condition: "cur.volume < avgVol × 0.5 && 价格不创新低",
          category: "DIVERGENCE", tMode: "正T", timeWindow: "buy_window",
          strengthRules: [{ condition: "抛压衰竭", strength: "medium" }],
        },
        {
          id: 9, name: "放量拉升", type: "buy", priority: 9,
          description: "成交量显著放大且价格上涨，主力资金入场",
          condition: "cur.volume > avgVol × 2 && cur.price > prev.price && changePercent > 0",
          category: "VOLUME", tMode: "反T", timeWindow: "buy_window",
          strengthRules: [
            { condition: "成交量 > 3倍均量", strength: "strong" },
            { condition: "成交量 > 2倍均量", strength: "medium" },
          ],
        },
        {
          id: 10, name: "放量下挫", type: "sell", priority: 10,
          description: "成交量显著放大且价格下跌，主力资金出逃",
          condition: "cur.volume > avgVol × 2 && cur.price < prev.price && changePercent < 0",
          category: "VOLUME", tMode: "正T", timeWindow: "sell_window",
          strengthRules: [
            { condition: "成交量 > 3倍均量", strength: "strong" },
            { condition: "成交量 > 2倍均量", strength: "medium" },
          ],
        },
        {
          id: 11, name: "急跌反弹", type: "buy", priority: 11,
          description: "前一根急跌后当前价格回升，V型反转信号",
          condition: "prev急跌(< -0.3%) && cur价格回升",
          category: "MOMENTUM", tMode: "反T", timeWindow: "buy_window",
          strengthRules: [
            { condition: "前一根跌幅 < -0.8%", strength: "strong" },
            { condition: "前一根跌幅 ≥ -0.8%", strength: "weak" },
          ],
        },
        {
          id: 12, name: "冲高回落", type: "sell", priority: 12,
          description: "前一根急涨后当前价格回落，倒V型反转信号",
          condition: "prev冲高(> 0.3%) && cur价格回落",
          category: "MOMENTUM", tMode: "正T", timeWindow: "sell_window",
          strengthRules: [
            { condition: "前一根涨幅 > 0.8%", strength: "strong" },
            { condition: "前一根涨幅 ≤ 0.8%", strength: "weak" },
          ],
        },
        {
          id: 13, name: "突破均价线", type: "buy", priority: 13,
          description: "价格从均线下方突破到均线上方",
          condition: "prev.price < prev.avgPrice && cur.price > cur.avgPrice",
          category: "VWAP", tMode: "反T", timeWindow: "buy_window",
          strengthRules: [
            { condition: "涨跌幅 > 1%", strength: "strong" },
            { condition: "涨跌幅 ≤ 1%", strength: "medium" },
          ],
        },
        {
          id: 14, name: "MACD柱转正", type: "buy", priority: 14,
          description: "MACD柱线由负转正且持续放大，多头力量增强（v3.1新增）",
          condition: "prevMACD < 0 && curMACD > 0 && curMACD > prevMACD",
          category: "MACD", tMode: "反T", timeWindow: "buy_window",
          strengthRules: [
            { condition: "DIF > 0（零轴上方柱转正）", strength: "strong" },
            { condition: "DIF ≤ 0（零轴下方柱转正）", strength: "medium" },
          ],
        },
        {
          id: 15, name: "MACD柱转负", type: "sell", priority: 15,
          description: "MACD柱线由正转负且持续缩小，空头力量增强（v3.1新增）",
          condition: "prevMACD > 0 && curMACD < 0 && curMACD < prevMACD",
          category: "MACD", tMode: "正T", timeWindow: "sell_window",
          strengthRules: [
            { condition: "DIF < 0（零轴下方柱转负）", strength: "strong" },
            { condition: "DIF ≥ 0（零轴上方柱转负）", strength: "medium" },
          ],
        },
        {
          id: 16, name: "RSI超卖买回", type: "buy", priority: 16,
          description: "RSI(14)从超卖区(低于30)回升，超跌反弹信号（v3.2新增）",
          condition: "prevRSI < 30 && curRSI ≥ 30 && curRSI > prevRSI",
          category: "RSI", tMode: "反T", timeWindow: "buy_window",
          strengthRules: [
            { condition: "前一根RSI < 20（深度超卖）", strength: "strong" },
            { condition: "前一根RSI 20-30（一般超卖）", strength: "medium" },
          ],
        },
        {
          id: 17, name: "RSI超买卖出", type: "sell", priority: 17,
          description: "RSI(14)从超买区(高于70)回落，超买见顶信号（v3.2新增）",
          condition: "prevRSI > 70 && curRSI ≤ 70 && curRSI < prevRSI",
          category: "RSI", tMode: "正T", timeWindow: "sell_window",
          strengthRules: [
            { condition: "前一根RSI > 80（深度超买）", strength: "strong" },
            { condition: "前一根RSI 70-80（一般超买）", strength: "medium" },
          ],
        },
        {
          id: 18, name: "布林下轨反弹", type: "buy", priority: 18,
          description: "价格触及布林下轨后反弹，超卖支撑确认（v3.2新增）",
          condition: "prev.price ≤ prevBoll.lower && cur.price > curBoll.lower",
          category: "BOLL", tMode: "反T", timeWindow: "buy_window",
          strengthRules: [
            { condition: "跌破下轨0.2%以上", strength: "strong" },
            { condition: "触及下轨", strength: "medium" },
          ],
        },
        {
          id: 19, name: "布林上轨回落", type: "sell", priority: 19,
          description: "价格触及布林上轨后回落，超买压力确认（v3.2新增）",
          condition: "prev.price ≥ prevBoll.upper && cur.price < curBoll.upper",
          category: "BOLL", tMode: "正T", timeWindow: "sell_window",
          strengthRules: [
            { condition: "突破上轨0.2%以上", strength: "strong" },
            { condition: "触及上轨", strength: "medium" },
          ],
        },
        {
          id: 20, name: "连续缩量", type: "buy", priority: 20,
          description: "连续3根成交量递减且价格企稳，抛压衰竭标志（v3.2新增）",
          condition: "连续3根vol递减 && 价格稳定 && vol < 均量×0.5",
          category: "VOLUME_PATTERN", tMode: "正T", timeWindow: "buy_window",
          strengthRules: [{ condition: "连续缩量+价稳", strength: "medium" }],
        },
        {
          id: 21, name: "脉冲放量", type: "sell", priority: 21,
          description: "单根成交量突增5倍以上且价涨，警惕冲高回落（v3.2新增）",
          condition: "cur.volume > avgVol × 5 && changePercent > 0",
          category: "VOLUME_PATTERN", tMode: "正T", timeWindow: "sell_window",
          strengthRules: [
            { condition: "量比 > 10倍", strength: "strong" },
            { condition: "量比 5-10倍", strength: "medium" },
          ],
        },
        {
          id: 22, name: "DIF零轴上穿", type: "buy", priority: 22,
          description: "DIF线从零轴下方穿越到上方，趋势由空转多（v3.2新增）",
          condition: "prevDIF < 0 && curDIF ≥ 0",
          category: "MACD", tMode: "反T", timeWindow: "buy_window",
          strengthRules: [
            { condition: "MACD柱 > 0（多头确认）", strength: "strong" },
            { condition: "MACD柱 ≤ 0（趋势初转）", strength: "medium" },
          ],
        },
        {
          id: 23, name: "DIF零轴下穿", type: "sell", priority: 23,
          description: "DIF线从零轴上方穿越到下方，趋势由多转空（v3.2新增）",
          condition: "prevDIF > 0 && curDIF ≤ 0",
          category: "MACD", tMode: "正T", timeWindow: "sell_window",
          strengthRules: [
            { condition: "MACD柱 < 0（空头确认）", strength: "strong" },
            { condition: "MACD柱 ≥ 0（趋势初转）", strength: "medium" },
          ],
        },
      ],
      postProcess: {
        name: "信号去重",
        description: "连续同类型+同T模式信号只保留第一个，避免重复提示",
        rule: "遍历信号序列，若当前信号类型+T模式与前一个有效信号相同，则丢弃",
      },
      timeWindowFilter: {
        name: "时间窗口过滤",
        description: "不同时间段产生不同方向的信号，避免在开盘波动期和尾盘操作",
      },
      spreadFloor: {
        name: "差价底线",
        description: "买回信号需检查与卖出价的差价是否满足1.5%底线",
        rules: [
          { spread: "<1%", action: "绝对不做" },
          { spread: "1%-1.5%", action: "不推荐" },
          { spread: "1.5%-2%", action: "可以做" },
          { spread: "2%-3%", action: "理想做T区间" },
          { spread: ">3%", action: "优质做T机会" },
        ],
      },
    },

    // ── 时间窗口 ──
    timeWindows: STRATEGY_OVERVIEW.timeWindows,

    // ── 止损规则 ──
    stopLossRules: STRATEGY_OVERVIEW.stopLossRules,

    // ── 市场环境策略 ──
    marketRegimes: STRATEGY_OVERVIEW.marketRegimes,

    // ── 仓位管理 ──
    positionManagement: {
      basePosition: { label: "底仓", range: "60%-70%", rule: "任何情况下不用于做T" },
      tPosition: { label: "T仓", range: "30%-40%", rule: "固定不变，不因盈亏增减" },
      singleTQuantity: [
        { basePosition: "5000股以下", tQuantity: "500-1000股", note: "小仓位试水" },
        { basePosition: "5000-20000股", tQuantity: "1000-3000股", note: "中等仓位" },
        { basePosition: "20000股以上", tQuantity: "3000-5000股", note: "大仓位可分两笔做T" },
      ],
      dailyLimit: { maxCount: DEFAULT_STRATEGY_CONFIG.maxDailyTCount, rule: "单次做反后当日不再做第2次T；连续2天做T亏损，第3天停止做T" },
    },

    // ── 数据源配置 ──
    dataSources: {
      timeline: {
        name: "分时数据",
        primary: { provider: "Tencent财经", interval: "1分钟", description: "实时1分钟级别分时数据" },
        fallback: { provider: "Sina财经", interval: "5分钟", description: "Tencent不可用时的降级方案" },
        refreshInterval: 30,
        refreshUnit: "秒",
        tradingHours: [
          { session: "早盘", start: "09:30", end: "11:30" },
          { session: "午盘", start: "13:00", end: "15:00" },
        ],
        barsPerDay: 240,
      },
      quote: {
        name: "实时行情",
        provider: "Tencent股票API",
        refreshInterval: 30,
        refreshUnit: "秒",
      },
      kline: {
        name: "K线数据",
        provider: "Sina财经",
        intervals: ["5m", "15m", "30m", "1h", "1d", "1wk"],
        defaultInterval: "5m",
        defaultBars: 300,
      },
    },

    // ── 整体逻辑流程 ──
    logicFlow: {
      name: "滚动做T策略执行流程 (v3.0)",
      steps: [
        { step: 1, name: "数据采集", description: "并行获取实时行情、分时1分钟数据、K线数据" },
        { step: 2, name: "指标计算", description: "基于分时价格序列计算MACD(12,26,9)，VWAP均价线" },
        { step: 3, name: "市场环境判断", description: "基于均线趋势判断当前市场环境（震荡/上升/下跌/横盘）" },
        { step: 4, name: "时间窗口过滤", description: "根据当前时间判断操作窗口（卖出窗口/买回窗口/不操作）" },
        { step: 5, name: "止损检测", description: "优先检查是否触发止损条件（做反1.5%认亏买回）" },
        { step: 6, name: "分时信号检测", description: "按优先级0→13依次检测14个信号规则，含时间窗口过滤" },
        { step: 7, name: "差价底线检查", description: "买回信号需验证与卖出价的差价是否满足1.5%底线" },
        { step: 8, name: "做T次数限制", description: "每日最多2次做T，超限不再产生信号" },
        { step: 9, name: "信号去重", description: "连续同类型+同T模式信号只保留第一个" },
        { step: 10, name: "信号展示", description: "在分时图上用标记显示买卖信号，标注正T/反T模式和时间窗口" },
        { step: 11, name: "自动刷新", description: "每30秒自动刷新数据，重新计算指标和信号" },
      ],
      decisionTree: [
        {
          question: "是否触发止损条件？",
          yes: "输出止损买回信号（最高优先级）",
          no: "继续检测下一个规则",
        },
        {
          question: "当前是否在有效交易窗口？",
          yes: "根据窗口类型允许卖出或买入信号",
          no: "不产生任何信号（开盘观察期和尾盘不操作）",
        },
        {
          question: "MACD是否发生交叉？",
          yes: "判断金叉/死叉 → 检查MACD柱位置 → 结合时间窗口输出信号",
          no: "继续检测下一个规则",
        },
        {
          question: "价格是否大幅偏离均价线？",
          yes: "偏离>2%且拐头 → 正T卖出；回到均线附近 → 正T买回",
          no: "继续检测下一个规则",
        },
        {
          question: "是否出现量价背离？",
          yes: "价创新高+量缩 → 卖出信号；量缩价稳 → 买回信号",
          no: "继续检测下一个规则",
        },
        {
          question: "成交量是否异常放大？",
          yes: "判断放量方向 → 检查量比倍数 → 结合时间窗口输出信号",
          no: "继续检测下一个规则",
        },
        {
          question: "差价是否满足底线？",
          yes: "输出信号",
          no: "抑制买回信号（差价<1.5%不做T）",
        },
      ],
    },

    // ── 风控参数 ──
    riskControl: {
      name: "风控参数 (v3.0)",
      rules: [
        { key: "stopLoss", label: "止损幅度", description: "做反后认亏的幅度阈值", value: DEFAULT_STRATEGY_CONFIG.stopLossPercent, unit: "%" },
        { key: "spreadFloor", label: "差价底线", description: "差价不足此值坚决不做T", value: DEFAULT_STRATEGY_CONFIG.spreadFloor, unit: "%" },
        { key: "signalCooldown", label: "信号冷却", description: "连续同类型+同T模式信号去重", value: "自动" },
        { key: "strengthScoring", label: "强度评分", description: "strong > medium > weak，市场环境会降级强度", values: ["strong", "medium", "weak"] },
        { key: "macdWarmup", label: "MACD预热", description: "分时MACD需要至少26根1分钟K线", value: 26, unit: "根" },
        { key: "dailyTLimit", label: "每日做T上限", description: "每日最多做T次数", value: DEFAULT_STRATEGY_CONFIG.maxDailyTCount, unit: "次" },
        { key: "dataRefresh", label: "数据刷新间隔", description: "自动刷新数据的频率", value: 30, unit: "秒" },
        { key: "regimeAdjust", label: "环境适配", description: "根据市场环境自动调整信号强度和T仓比例", value: "自动" },
      ],
    },

    // ── Database factors & logic ──
    dbFactors: factors,
    dbLogicSteps: logicSteps,
  };

  return NextResponse.json(strategy);
}

// ── PUT: Update a strategy factor ──
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, id, data } = body;

    if (type === "factor" && id) {
      const updated = await db.strategyFactor.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.category !== undefined && { category: data.category }),
          ...(data.signalType !== undefined && { signalType: data.signalType }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.params !== undefined && { params: JSON.stringify(data.params) }),
          ...(data.enabled !== undefined && { enabled: data.enabled }),
          ...(data.priority !== undefined && { priority: data.priority }),
          ...(data.strength !== undefined && { strength: data.strength }),
          ...(data.tMode !== undefined && { tMode: data.tMode }),
          ...(data.timeWindow !== undefined && { timeWindow: data.timeWindow }),
        },
      });
      return NextResponse.json({ success: true, data: updated });
    }

    if (type === "logic" && id) {
      const updated = await db.strategyLogic.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.logicOrder !== undefined && { logicOrder: data.logicOrder }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
          ...(data.category !== undefined && { category: data.category }),
        },
      });
      return NextResponse.json({ success: true, data: updated });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch (error: any) {
    console.error("Strategy update error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ── POST: Create a new strategy factor or logic ──
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, data } = body;

    if (type === "factor") {
      const created = await db.strategyFactor.create({
        data: {
          name: data.name || "新因子",
          category: data.category || "CUSTOM",
          signalType: data.signalType || "buy",
          description: data.description || "",
          params: JSON.stringify(data.params || {}),
          enabled: data.enabled ?? true,
          priority: data.priority ?? 0,
          strength: data.strength || "medium",
          tMode: data.tMode || "正T",
          timeWindow: data.timeWindow || "any",
        },
      });
      return NextResponse.json({ success: true, data: created });
    }

    if (type === "logic") {
      const created = await db.strategyLogic.create({
        data: {
          name: data.name || "新逻辑",
          description: data.description || "",
          logicOrder: data.logicOrder ?? 0,
          isActive: data.isActive ?? true,
          category: data.category || "general",
        },
      });
      return NextResponse.json({ success: true, data: created });
    }

    // Initialize default factors if none exist
    if (type === "init") {
      const existingFactors = await db.strategyFactor.count();
      if (existingFactors === 0) {
        await db.strategyFactor.createMany({
          data: [
            { name: "止损买回", category: "STOPLOSS", signalType: "stoploss", description: "正T卖出后股价继续上涨超过1.5%，必须认亏买回保底仓", params: "{\"stopLossPercent\":1.5}", enabled: true, priority: 22, strength: "strong", tMode: "正T", timeWindow: "any" },
            { name: "MACD金叉", category: "MACD", signalType: "buy", description: "DIF从下方上穿DEA，短期趋势转多（仅买入窗口）", params: "{}", enabled: true, priority: 21, strength: "medium", tMode: "反T", timeWindow: "buy_window" },
            { name: "MACD死叉", category: "MACD", signalType: "sell", description: "DIF从上方下穿DEA，短期趋势转空（仅卖出窗口）", params: "{}", enabled: true, priority: 20, strength: "medium", tMode: "正T", timeWindow: "sell_window" },
            { name: "MACD柱转正", category: "MACD", signalType: "buy", description: "MACD柱线由负转正且持续放大，多头力量增强（v3.1新增）", params: "{}", enabled: true, priority: 19, strength: "medium", tMode: "反T", timeWindow: "buy_window" },
            { name: "MACD柱转负", category: "MACD", signalType: "sell", description: "MACD柱线由正转负且持续缩小，空头力量增强（v3.1新增）", params: "{}", enabled: true, priority: 18, strength: "medium", tMode: "正T", timeWindow: "sell_window" },
            { name: "DIF零轴上穿", category: "MACD", signalType: "buy", description: "DIF线从零轴下方穿越到上方，趋势由空转多（v3.2新增）", params: "{}", enabled: true, priority: 17, strength: "medium", tMode: "反T", timeWindow: "buy_window" },
            { name: "DIF零轴下穿", category: "MACD", signalType: "sell", description: "DIF线从零轴上方穿越到下方，趋势由多转空（v3.2新增）", params: "{}", enabled: true, priority: 16, strength: "medium", tMode: "正T", timeWindow: "sell_window" },
            { name: "均价偏离过高", category: "VWAP", signalType: "sell", description: "价格偏离均价线超过2%且出现拐头回落（PDF核心卖出信号）", params: "{\"vwapDeviationSell\":2.0}", enabled: true, priority: 15, strength: "medium", tMode: "正T", timeWindow: "sell_window" },
            { name: "跌破均价线", category: "VWAP", signalType: "sell", description: "价格从均线上方跌破到均线下方", params: "{}", enabled: true, priority: 14, strength: "medium", tMode: "正T", timeWindow: "sell_window" },
            { name: "量价背离", category: "DIVERGENCE", signalType: "sell", description: "股价创新高但成交量萎缩，短期见顶信号（PDF策略新增）", params: "{\"volumeShrinkRatio\":0.5}", enabled: true, priority: 13, strength: "strong", tMode: "正T", timeWindow: "sell_window" },
            { name: "均线支撑买回", category: "VWAP", signalType: "buy", description: "价格回到均价线附近企稳且不破均线（PDF核心买回信号）", params: "{\"vwapDeviationBuy\":0.3}", enabled: true, priority: 12, strength: "strong", tMode: "正T", timeWindow: "buy_window" },
            { name: "昨收价支撑", category: "SUPPORT", signalType: "buy", description: "价格回到昨收盘价附近企稳（PDF策略新增）", params: "{}", enabled: true, priority: 11, strength: "medium", tMode: "正T", timeWindow: "buy_window" },
            { name: "量缩价稳", category: "DIVERGENCE", signalType: "buy", description: "下跌过程中成交量明显缩小，抛压衰竭标志（PDF策略新增）", params: "{\"volumeShrinkRatio\":0.5}", enabled: true, priority: 10, strength: "medium", tMode: "正T", timeWindow: "buy_window" },
            { name: "放量拉升", category: "VOLUME", signalType: "buy", description: "成交量显著放大且价格上涨", params: "{\"volumeMultiplier\":2,\"volumeMultiplierStrong\":3}", enabled: true, priority: 9, strength: "medium", tMode: "反T", timeWindow: "buy_window" },
            { name: "放量下挫", category: "VOLUME", signalType: "sell", description: "成交量显著放大且价格下跌", params: "{\"volumeMultiplier\":2,\"volumeMultiplierStrong\":3}", enabled: true, priority: 8, strength: "medium", tMode: "正T", timeWindow: "sell_window" },
            { name: "RSI超卖买回", category: "RSI", signalType: "buy", description: "RSI(14)从超卖区(低于30)回升，超跌反弹信号（v3.2新增）", params: "{\"rsiPeriod\":14,\"oversold\":30}", enabled: true, priority: 7, strength: "medium", tMode: "反T", timeWindow: "buy_window" },
            { name: "RSI超买卖出", category: "RSI", signalType: "sell", description: "RSI(14)从超买区(高于70)回落，超买见顶信号（v3.2新增）", params: "{\"rsiPeriod\":14,\"overbought\":70}", enabled: true, priority: 6, strength: "medium", tMode: "正T", timeWindow: "sell_window" },
            { name: "布林下轨反弹", category: "BOLL", signalType: "buy", description: "价格触及布林下轨后反弹，超卖支撑确认（v3.2新增）", params: "{\"bollPeriod\":20,\"bollMultiplier\":2}", enabled: true, priority: 5, strength: "medium", tMode: "反T", timeWindow: "buy_window" },
            { name: "布林上轨回落", category: "BOLL", signalType: "sell", description: "价格触及布林上轨后回落，超买压力确认（v3.2新增）", params: "{\"bollPeriod\":20,\"bollMultiplier\":2}", enabled: true, priority: 4, strength: "medium", tMode: "正T", timeWindow: "sell_window" },
            { name: "连续缩量", category: "VOLUME_PATTERN", signalType: "buy", description: "连续3根成交量递减且价格企稳，抛压衰竭标志（v3.2新增）", params: "{\"consecutiveBars\":3,\"volumeShrinkRatio\":0.5}", enabled: true, priority: 3, strength: "medium", tMode: "正T", timeWindow: "buy_window" },
            { name: "脉冲放量", category: "VOLUME_PATTERN", signalType: "sell", description: "单根成交量突增5倍以上且价涨，警惕冲高回落（v3.2新增）", params: "{\"pulseMultiplier\":5,\"strongMultiplier\":10}", enabled: true, priority: 2, strength: "medium", tMode: "正T", timeWindow: "sell_window" },
            { name: "急跌反弹", category: "MOMENTUM", signalType: "buy", description: "前一根急跌后当前价格回升", params: "{\"dropThreshold\":-0.3,\"dropThresholdStrong\":-0.8}", enabled: true, priority: 1, strength: "weak", tMode: "反T", timeWindow: "buy_window" },
            { name: "冲高回落", category: "MOMENTUM", signalType: "sell", description: "前一根急涨后当前价格回落", params: "{\"riseThreshold\":0.3,\"riseThresholdStrong\":0.8}", enabled: true, priority: 0, strength: "weak", tMode: "正T", timeWindow: "sell_window" },
            { name: "突破均价线", category: "VWAP", signalType: "buy", description: "价格从均线下方突破到均线上方", params: "{}", enabled: true, priority: 0, strength: "medium", tMode: "反T", timeWindow: "buy_window" },
            // v3.3 新增因子
            { name: "价格偏离昨收", category: "SPREAD", signalType: "sell", description: "价格偏离昨收超过3%且开始回落，短期过度拉升后回归概率大", params: "{\"priceDeviationSell\":3.0}", enabled: true, priority: -1, strength: "weak", tMode: "正T", timeWindow: "sell_window" },
            { name: "量比异常放大", category: "VOLUME_PATTERN", signalType: "sell", description: "当前成交量远超此前均量（量比>2）且价涨，警惕冲高回落", params: "{\"volumeRatioThreshold\":2.0}", enabled: true, priority: -2, strength: "weak", tMode: "正T", timeWindow: "sell_window" },
            { name: "均价乖离回归", category: "VWAP", signalType: "buy", description: "价格之前在均线下方偏离较大，现在开始回归均线，买回信号", params: "{\"avgPriceDeviationReturn\":1.5}", enabled: true, priority: -3, strength: "medium", tMode: "正T", timeWindow: "buy_window" },
            { name: "DIF顶背离", category: "DIVERGENCE", signalType: "sell", description: "顶背离：价格创新高但DIF未创新高，多头动能减弱，上涨动能衰竭，强烈的看跌信号。动能背离(Momentum Divergence)：价格与动能指标出现反向走势", params: "{\"difDivergenceLookback\":20}", enabled: true, priority: -4, strength: "medium", tMode: "正T", timeWindow: "sell_window" },
            { name: "双底买回", category: "SUPPORT", signalType: "buy", description: "W底形态确认：回看周期内出现两个相近的低点，当前从第二个低点反弹", params: "{\"doubleBottomTolerance\":0.5,\"doubleBottomLookback\":30}", enabled: true, priority: -5, strength: "medium", tMode: "正T", timeWindow: "buy_window" },
            { name: "尾盘急跌", category: "MOMENTUM", signalType: "buy", description: "14:00-14:25出现急跌（非尾盘最后5分钟），低吸机会", params: "{\"lateDropThreshold\":-0.5}", enabled: true, priority: -6, strength: "medium", tMode: "反T", timeWindow: "buy_window" },
            { name: "均价拐头", category: "VWAP", signalType: "sell", description: "MACD柱状线收敛：均价线从持续上升转为开始下降，趋势转折信号", params: "{\"avgPriceTurnLookback\":5}", enabled: true, priority: -7, strength: "medium", tMode: "正T", timeWindow: "sell_window" },
          ],
        });
      }

      const existingLogic = await db.strategyLogic.count();
      if (existingLogic === 0) {
        await db.strategyLogic.createMany({
          data: [
            { name: "数据采集", description: "并行获取实时行情、分时1分钟数据、K线数据", logicOrder: 1, isActive: true, category: "data" },
            { name: "指标计算", description: "基于分时价格序列计算MACD(12,26,9)，VWAP均价线", logicOrder: 2, isActive: true, category: "calc" },
            { name: "市场环境判断", description: "基于均线趋势判断当前市场环境（震荡/上升/下跌/横盘）", logicOrder: 3, isActive: true, category: "regime" },
            { name: "时间窗口过滤", description: "根据当前时间判断操作窗口（卖出窗口/买回窗口/不操作）", logicOrder: 4, isActive: true, category: "time_window" },
            { name: "止损检测", description: "优先检查是否触发止损条件（做反1.5%认亏买回）", logicOrder: 5, isActive: true, category: "stoploss" },
            { name: "分时信号检测", description: "按优先级0→13依次检测14个信号规则", logicOrder: 6, isActive: true, category: "signal" },
            { name: "差价底线检查", description: "买回信号需验证与卖出价的差价是否满足1.5%底线", logicOrder: 7, isActive: true, category: "spread" },
            { name: "做T次数限制", description: "每日最多2次做T，超限不再产生信号", logicOrder: 8, isActive: true, category: "risk" },
            { name: "信号去重", description: "连续同类型+同T模式信号只保留第一个", logicOrder: 9, isActive: true, category: "filter" },
            { name: "信号展示", description: "在分时图上用标记显示买卖信号，标注正T/反T模式和时间窗口", logicOrder: 10, isActive: true, category: "display" },
            { name: "自动刷新", description: "每30秒自动刷新数据，重新计算指标和信号", logicOrder: 11, isActive: true, category: "system" },
          ],
        });
      }

      return NextResponse.json({ success: true, message: "Default strategy data initialized (v3.2)" });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch (error: any) {
    console.error("Strategy create error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ── DELETE: Remove a strategy factor or logic ──
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const id = searchParams.get("id");

    if (!type || !id) {
      return NextResponse.json({ error: "Missing type or id" }, { status: 400 });
    }

    if (type === "factor") {
      await db.strategyFactor.delete({ where: { id } });
      return NextResponse.json({ success: true });
    }

    if (type === "logic") {
      await db.strategyLogic.delete({ where: { id } });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (error: any) {
    console.error("Strategy delete error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
