import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/stock/strategy-factors - 获取所有策略因子
export async function GET() {
  try {
    const factors = await db.strategyFactor.findMany({
      orderBy: [{ category: "asc" }, { priority: "desc" }],
    });

    const logic = await db.strategyLogic.findMany({
      orderBy: { logicOrder: "asc" },
    });

    // 如果数据库为空，初始化默认数据
    if (factors.length === 0) {
      await seedDefaultData();
      const seededFactors = await db.strategyFactor.findMany({
        orderBy: [{ category: "asc" }, { priority: "desc" }],
      });
      const seededLogic = await db.strategyLogic.findMany({
        orderBy: { logicOrder: "asc" },
      });
      return NextResponse.json({ factors: seededFactors, logic: seededLogic });
    }

    // ── Auto-migration: ensure new default factors exist in DB ──
    // If the DB was seeded before a new factor was added, we need to add it.
    const existingFactorNames = new Set(factors.map(f => f.name));
    const missingFactors = DEFAULT_FACTOR_SEEDS.filter(
      seed => !existingFactorNames.has(seed.name)
    );
    if (missingFactors.length > 0) {
      for (const factor of missingFactors) {
        await db.strategyFactor.create({ data: factor });
      }
      // Re-fetch after migration
      const allFactors = await db.strategyFactor.findMany({
        orderBy: [{ category: "asc" }, { priority: "desc" }],
      });
      return NextResponse.json({ factors: allFactors, logic });
    }

    return NextResponse.json({ factors, logic });
  } catch (error: any) {
    console.error("Strategy factors fetch error:", error);
    return NextResponse.json({ error: "获取策略因子失败" }, { status: 500 });
  }
}

// PUT /api/stock/strategy-factors - 更新策略因子
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, enabled, params, priority, strength } = body;

    if (!id) {
      return NextResponse.json({ error: "缺少因子ID" }, { status: 400 });
    }

    const updateData: any = {};
    if (enabled !== undefined) updateData.enabled = enabled;
    if (params !== undefined) updateData.params = typeof params === "string" ? params : JSON.stringify(params);
    if (priority !== undefined) updateData.priority = priority;
    if (strength !== undefined) updateData.strength = strength;

    const factor = await db.strategyFactor.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ factor });
  } catch (error: any) {
    console.error("Strategy factor update error:", error);
    return NextResponse.json({ error: "更新策略因子失败" }, { status: 500 });
  }
}

// POST /api/stock/strategy-factors - 新增策略因子
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, category, signalType, description, params, enabled, priority, strength } = body;

    if (!name || !category || !signalType || !description) {
      return NextResponse.json({ error: "缺少必要字段" }, { status: 400 });
    }

    const factor = await db.strategyFactor.create({
      data: {
        name,
        category,
        signalType,
        description,
        params: typeof params === "string" ? params : JSON.stringify(params || {}),
        enabled: enabled ?? true,
        priority: priority ?? 0,
        strength: strength ?? "medium",
      },
    });

    return NextResponse.json({ factor });
  } catch (error: any) {
    console.error("Strategy factor create error:", error);
    return NextResponse.json({ error: "创建策略因子失败" }, { status: 500 });
  }
}

// DELETE /api/stock/strategy-factors?id=xxx - 删除策略因子
export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "缺少因子ID" }, { status: 400 });
    }

    await db.strategyFactor.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Strategy factor delete error:", error);
    return NextResponse.json({ error: "删除策略因子失败" }, { status: 500 });
  }
}

// ── Default factor seeds for auto-migration ────────────────
// These factors are checked on every GET request and auto-created if missing.
// This ensures new factors added in code updates appear in the DB automatically.

const DEFAULT_FACTOR_SEEDS = [
  // v3.3 new factors
  { name: "价格偏离昨收", category: "SPREAD", signalType: "sell", description: "价格偏离昨收超过3%且开始回落，短期过度拉升后回归概率大", params: JSON.stringify({ priceDeviationSell: 3.0 }), enabled: true, priority: -1, strength: "weak", tMode: "正T", timeWindow: "sell_window" },
  { name: "量比异常放大", category: "VOLUME_PATTERN", signalType: "sell", description: "当前成交量远超此前均量（量比>2）且价涨，警惕冲高回落", params: JSON.stringify({ volumeRatioThreshold: 2.0 }), enabled: true, priority: -2, strength: "weak", tMode: "正T", timeWindow: "sell_window" },
  { name: "均价乖离回归", category: "VWAP", signalType: "buy", description: "价格之前在均线下方偏离较大，现在开始回归均线，买回信号", params: JSON.stringify({ avgPriceDeviationReturn: 1.5 }), enabled: true, priority: -3, strength: "medium", tMode: "正T", timeWindow: "buy_window" },
  { name: "DIF顶背离", category: "DIVERGENCE", signalType: "sell", description: "顶背离：价格创新高但DIF未创新高，多头动能减弱，上涨动能衰竭，强烈的看跌信号。动能背离(Momentum Divergence)：价格与动能指标出现反向走势", params: JSON.stringify({ difDivergenceLookback: 20 }), enabled: true, priority: -4, strength: "medium", tMode: "正T", timeWindow: "sell_window" },
  { name: "双底买回", category: "SUPPORT", signalType: "buy", description: "W底形态确认：回看周期内出现两个相近的低点，当前从第二个低点反弹", params: JSON.stringify({ doubleBottomTolerance: 0.5, doubleBottomLookback: 30 }), enabled: true, priority: -5, strength: "medium", tMode: "正T", timeWindow: "buy_window" },
  { name: "尾盘急跌", category: "MOMENTUM", signalType: "buy", description: "14:00-14:25出现急跌（非尾盘最后5分钟），低吸机会", params: JSON.stringify({ lateDropThreshold: -0.5 }), enabled: true, priority: -6, strength: "medium", tMode: "反T", timeWindow: "buy_window" },
  { name: "均价拐头", category: "VWAP", signalType: "sell", description: "MACD柱状线收敛：均价线从持续上升转为开始下降，趋势转折信号", params: JSON.stringify({ avgPriceTurnLookback: 5 }), enabled: true, priority: -7, strength: "medium", tMode: "正T", timeWindow: "sell_window" },
  // v3.10 new factor
  { name: "递增放量", category: "VOLUME_PATTERN", signalType: "buy", description: "连续3+分钟成交量逐步放大且价格同步上涨，主力资金持续流入信号（v3.10新增）", params: JSON.stringify({ minProgressiveLen: 3, strongProgressiveLen: 6 }), enabled: true, priority: 8, strength: "medium", tMode: "反T", timeWindow: "buy_window" },
  // v4.3 new factor
  { name: "高开卖出", category: "GAP_UP", signalType: "sell", description: "只要高开（开盘价>昨收价），立即显示卖出信号做正T（v4.3）", params: JSON.stringify({ gapUpPct: 0 }), enabled: true, priority: 23, strength: "strong", tMode: "正T", timeWindow: "sell_window" },
];

// ── 初始化默认数据 ──────────────────────────────────────

async function seedDefaultData() {
  const defaultFactors = [
    // ── v3.2 完整因子列表 (24条) ──
    { name: "止损买回", category: "STOPLOSS", signalType: "stoploss", description: "正T卖出后股价继续上涨超过1.5%，必须认亏买回保底仓", params: JSON.stringify({ stopLossPercent: 1.5 }), enabled: true, priority: 22, strength: "strong" },
    { name: "MACD金叉", category: "MACD", signalType: "buy", description: "DIF线上穿DEA线，短期动量转强。MACD柱线在零轴上方时为强信号。", params: JSON.stringify({ emaShort: 12, emaLong: 26, deaPeriod: 9, strongCondition: "macd > 0" }), enabled: true, priority: 21, strength: "medium" },
    { name: "MACD死叉", category: "MACD", signalType: "sell", description: "DIF线下穿DEA线，短期动量转弱。MACD柱线在零轴下方时为强信号。", params: JSON.stringify({ emaShort: 12, emaLong: 26, deaPeriod: 9, strongCondition: "macd < 0" }), enabled: true, priority: 20, strength: "medium" },
    { name: "MACD柱转正", category: "MACD", signalType: "buy", description: "MACD柱线由负转正且持续放大，多头力量增强（v3.1新增）", params: JSON.stringify({ strongCondition: "dif > 0" }), enabled: true, priority: 19, strength: "medium" },
    { name: "MACD柱转负", category: "MACD", signalType: "sell", description: "MACD柱线由正转负且持续缩小，空头力量增强（v3.1新增）", params: JSON.stringify({ strongCondition: "dif < 0" }), enabled: true, priority: 18, strength: "medium" },
    { name: "DIF零轴上穿", category: "MACD", signalType: "buy", description: "DIF线从零轴下方穿越到上方，趋势由空转多。MACD柱为正时为强信号（v3.2新增）", params: JSON.stringify({ strongCondition: "macd > 0" }), enabled: true, priority: 17, strength: "medium" },
    { name: "DIF零轴下穿", category: "MACD", signalType: "sell", description: "DIF线从零轴上方穿越到下方，趋势由多转空。MACD柱为负时为强信号（v3.2新增）", params: JSON.stringify({ strongCondition: "macd < 0" }), enabled: true, priority: 16, strength: "medium" },
    { name: "均价偏离过高", category: "VWAP", signalType: "sell", description: "价格偏离均价线超过2%且出现拐头回落（PDF核心卖出信号）", params: JSON.stringify({ vwapDeviationSell: 2.0 }), enabled: true, priority: 15, strength: "medium" },
    { name: "跌破均价线", category: "VWAP", signalType: "sell", description: "价格从均线上方跌破到均线下方，空方力量增强", params: JSON.stringify({}), enabled: true, priority: 14, strength: "medium" },
    { name: "量价背离", category: "DIVERGENCE", signalType: "sell", description: "股价创新高但成交量萎缩，短期见顶信号（PDF策略新增）", params: JSON.stringify({ volumeShrinkRatio: 0.5 }), enabled: true, priority: 13, strength: "strong" },
    { name: "均线支撑买回", category: "VWAP", signalType: "buy", description: "价格回到均价线附近企稳且不破均线（PDF核心买回信号）", params: JSON.stringify({ vwapDeviationBuy: 0.3 }), enabled: true, priority: 12, strength: "strong" },
    { name: "昨收价支撑", category: "SUPPORT", signalType: "buy", description: "价格回到昨收盘价附近企稳（PDF策略新增）", params: JSON.stringify({}), enabled: true, priority: 11, strength: "medium" },
    { name: "量缩价稳", category: "DIVERGENCE", signalType: "buy", description: "下跌过程中成交量明显缩小，抛压衰竭标志（PDF策略新增）", params: JSON.stringify({ volumeShrinkRatio: 0.5 }), enabled: true, priority: 10, strength: "medium" },
    { name: "放量拉升", category: "VOLUME", signalType: "buy", description: "成交量显著放大且价格上涨，资金主动买入意愿强烈", params: JSON.stringify({ volumeMultiplier: 2, strongMultiplier: 3 }), enabled: true, priority: 9, strength: "medium" },
    { name: "放量下挫", category: "VOLUME", signalType: "sell", description: "成交量显著放大且价格下跌，资金主动卖出意愿强烈", params: JSON.stringify({ volumeMultiplier: 2, strongMultiplier: 3 }), enabled: true, priority: 8, strength: "medium" },
    { name: "RSI超卖买回", category: "RSI", signalType: "buy", description: "RSI(14)从超卖区(低于30)回升，超跌反弹信号。RSI<20后回升为强信号（v3.2新增）", params: JSON.stringify({ rsiPeriod: 14, oversold: 30, strongCondition: "rsi_prev < 20" }), enabled: true, priority: 7, strength: "medium" },
    { name: "RSI超买卖出", category: "RSI", signalType: "sell", description: "RSI(14)从超买区(高于70)回落，超买见顶信号。RSI>80后回落为强信号（v3.2新增）", params: JSON.stringify({ rsiPeriod: 14, overbought: 70, strongCondition: "rsi_prev > 80" }), enabled: true, priority: 6, strength: "medium" },
    { name: "布林下轨反弹", category: "BOLL", signalType: "buy", description: "价格触及布林下轨后反弹，超卖支撑确认。跌破下轨0.2%以上为强信号（v3.2新增）", params: JSON.stringify({ bollPeriod: 20, bollMultiplier: 2, strongCondition: "price < lower * 0.998" }), enabled: true, priority: 5, strength: "medium" },
    { name: "布林上轨回落", category: "BOLL", signalType: "sell", description: "价格触及布林上轨后回落，超买压力确认。突破上轨0.2%以上为强信号（v3.2新增）", params: JSON.stringify({ bollPeriod: 20, bollMultiplier: 2, strongCondition: "price > upper * 1.002" }), enabled: true, priority: 4, strength: "medium" },
    { name: "连续缩量", category: "VOLUME_PATTERN", signalType: "buy", description: "连续3根成交量递减且价格企稳，抛压衰竭标志（v3.2新增）", params: JSON.stringify({ consecutiveBars: 3, volumeShrinkRatio: 0.5 }), enabled: true, priority: 3, strength: "medium" },
    { name: "脉冲放量", category: "VOLUME_PATTERN", signalType: "sell", description: "单根成交量突增5倍以上且价涨，警惕冲高回落（v3.2新增）", params: JSON.stringify({ pulseMultiplier: 5, strongMultiplier: 10 }), enabled: true, priority: 2, strength: "medium" },
    { name: "急跌反弹", category: "MOMENTUM", signalType: "buy", description: "前一根K线急跌后当前K线反弹，超跌反弹信号", params: JSON.stringify({ dipThreshold: -0.3, strongThreshold: -0.8 }), enabled: true, priority: 1, strength: "weak" },
    { name: "冲高回落", category: "MOMENTUM", signalType: "sell", description: "前一根K线冲高后当前K线回落，冲高回落信号", params: JSON.stringify({ surgeThreshold: 0.3, strongThreshold: 0.8 }), enabled: true, priority: 0, strength: "weak" },
    { name: "突破均价线", category: "VWAP", signalType: "buy", description: "价格从均线下方突破到均线上方，多方力量增强", params: JSON.stringify({}), enabled: true, priority: 0, strength: "medium" },
    { name: "递增放量", category: "VOLUME_PATTERN", signalType: "buy", description: "连续3+分钟成交量逐步放大且价格同步上涨，主力资金持续流入信号（v3.10新增）", params: JSON.stringify({ minProgressiveLen: 3, strongProgressiveLen: 6 }), enabled: true, priority: 8, strength: "medium" },
    { name: "高开卖出", category: "GAP_UP", signalType: "sell", description: "只要高开（开盘价>昨收价），立即显示卖出信号做正T（v4.3）", params: JSON.stringify({ gapUpPct: 0 }), enabled: true, priority: 23, strength: "strong" },
  ];

  for (const factor of defaultFactors) {
    await db.strategyFactor.create({ data: factor });
  }

  const defaultLogic = [
    {
      name: "数据采集与预处理",
      description: "获取1分钟分时数据（价格、成交量、均价），同时通过EMA计算MACD指标（DIF、DEA、MACD柱线）。需至少26根K线才能计算完整的MACD。",
      logicOrder: 1,
      category: "data",
      isActive: true,
    },
    {
      name: "MACD交叉判断",
      description: "检查MACD金叉/死叉信号及MACD柱转向信号。金叉=前一刻DIF≤DEA且当前DIF>DEA，死叉=前一刻DIF≥DEA且当前DIF<DEA。柱转正=MACD柱由负转正，柱转负=MACD柱由正转负。",
      logicOrder: 2,
      category: "macd",
      isActive: true,
    },
    {
      name: "均价线穿越判断",
      description: "检查价格是否穿越VWAP均价线及偏离度。偏离>2%+拐头=卖出，回到均线附近+不破均线=买入。",
      logicOrder: 3,
      category: "vwap",
      isActive: true,
    },
    {
      name: "量能异动与量价背离",
      description: "检查成交量异常放大/缩小及量价背离。放量+涨=买入，放量+跌=卖出，量缩价稳=买入，价创新高+量缩=卖出。",
      logicOrder: 4,
      category: "volume",
      isActive: true,
    },
    {
      name: "动量反转判断",
      description: "检查价格动量反转。急跌反弹（前一刻跌>0.3%后当前上涨）=买入，冲高回落（前一刻涨>0.3%后当前下跌）=卖出。",
      logicOrder: 5,
      category: "momentum",
      isActive: true,
    },
    {
      name: "支撑位判断",
      description: "检查昨收价支撑。价格回到昨收附近且从下方回到上方=买入信号。",
      logicOrder: 6,
      category: "support",
      isActive: true,
    },
    {
      name: "时间窗口过滤",
      description: "根据当前时间判断操作窗口：开盘观察/正T卖出窗口/买回窗口/午后卖出窗口/午后买回窗口/尾盘不操作。",
      logicOrder: 7,
      category: "time_window",
      isActive: true,
    },
    {
      name: "止损检测",
      description: "正T卖出后股价继续上涨超过1.5%，必须认亏买回保底仓。止损规则不可禁用。",
      logicOrder: 8,
      category: "stoploss",
      isActive: true,
    },
    {
      name: "差价底线检查",
      description: "买回信号需验证与卖出价的差价是否满足1.5%底线。差价不足1.5%不做T。",
      logicOrder: 9,
      category: "spread",
      isActive: true,
    },
    {
      name: "连续信号去重",
      description: "去除连续同类型+同T模式信号，只保留每组连续同类信号中的第一个。",
      logicOrder: 10,
      category: "filter",
      isActive: true,
    },
    {
      name: "DB因子覆盖",
      description: "从数据库读取因子启用/禁用状态，动态控制信号规则是否生效。止损规则不可禁用。",
      logicOrder: 11,
      category: "db_override",
      isActive: true,
    },
  ];

  for (const logic of defaultLogic) {
    await db.strategyLogic.create({ data: logic });
  }
}
