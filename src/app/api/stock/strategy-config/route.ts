import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DEFAULT_STRATEGY_CONFIG } from "@/lib/t-strategy";

// ── Strategy Config API: Read/Write indicator parameters ──

// Map from (indicatorKey, paramKey) to DEFAULT_STRATEGY_CONFIG field
const CONFIG_MAP: Record<string, Record<string, { field: string; type: "number" | "string" }>> = {
  macd: {
    fastPeriod: { field: "macdFast", type: "number" },
    slowPeriod: { field: "macdSlow", type: "number" },
    signalPeriod: { field: "macdSignal", type: "number" },
  },
  vwap: {
    deviationSell: { field: "vwapDeviationSell", type: "number" },
    deviationBuy: { field: "vwapDeviationBuy", type: "number" },
  },
  rsi: {
    rsiPeriod: { field: "rsiPeriod", type: "number" },
    oversold: { field: "rsiOversold", type: "number" },
    overbought: { field: "rsiOverbought", type: "number" },
  },
  boll: {
    bollPeriod: { field: "bollPeriod", type: "number" },
    bollMultiplier: { field: "bollMultiplier", type: "number" },
  },
  volume: {
    volumeMultiplier: { field: "volumeMultiplier", type: "number" },
    volumeMultiplierStrong: { field: "volumeMultiplierStrong", type: "number" },
    volumeShrinkRatio: { field: "volumeShrinkRatio", type: "number" },
    volumePulseMultiplier: { field: "volumePulseMultiplier", type: "number" },
    consecutiveShrinkBars: { field: "consecutiveShrinkBars", type: "number" },
  },
};

// GET: Load all config overrides
export async function GET() {
  try {
    const configs = await db.strategyConfig.findMany();
    // Build an object with all overrides
    const overrides: Record<string, Record<string, number>> = {};
    for (const c of configs) {
      if (!overrides[c.indicatorKey]) overrides[c.indicatorKey] = {};
      overrides[c.indicatorKey][c.paramKey] = parseFloat(c.value);
    }

    // Merge with defaults
    const result: Record<string, Record<string, number>> = {};
    for (const [indKey, params] of Object.entries(CONFIG_MAP)) {
      result[indKey] = {};
      for (const [paramKey, meta] of Object.entries(params)) {
        const defaultVal = (DEFAULT_STRATEGY_CONFIG as any)[meta.field] ?? 0;
        result[indKey][paramKey] = overrides[indKey]?.[paramKey] ?? defaultVal;
      }
    }

    return NextResponse.json({ configs: result });
  } catch (error: any) {
    console.error("Strategy config GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT: Update a single indicator param
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { indicatorKey, paramKey, value } = body;

    if (!indicatorKey || !paramKey || value === undefined) {
      return NextResponse.json({ error: "Missing indicatorKey, paramKey or value" }, { status: 400 });
    }

    // Validate the key exists in our map
    if (!CONFIG_MAP[indicatorKey]?.[paramKey]) {
      return NextResponse.json({ error: `Unknown param: ${indicatorKey}.${paramKey}` }, { status: 400 });
    }

    const strValue = String(value);

    // Upsert: create or update
    const upserted = await db.strategyConfig.upsert({
      where: {
        indicatorKey_paramKey: { indicatorKey, paramKey },
      },
      update: { value: strValue },
      create: { indicatorKey, paramKey, value: strValue },
    });

    return NextResponse.json({ success: true, data: upserted });
  } catch (error: any) {
    console.error("Strategy config PUT error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
