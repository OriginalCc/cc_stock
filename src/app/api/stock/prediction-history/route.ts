import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Sector Prediction History API (板块预测历史 & 验证)
 *
 * GET  /api/stock/prediction-history          — 获取历史预测记录
 * POST /api/stock/prediction-history          — 保存今日预测（已存在的预测只更新推荐个股，不覆盖原始预测数据）
 * POST /api/stock/prediction-history?action=verify — 验证历史预测(回填次日实际涨跌幅)
 */

// ── Helper: Get previous trading day (skip weekends) ──────

function getPreviousTradingDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00+08:00");
  let day = d.getDay();
  // Go back 1-3 days to skip weekends
  if (day === 1) return new Date(d.getTime() - 3 * 86400000).toISOString().split("T")[0]; // Monday -> Friday
  if (day === 0) return new Date(d.getTime() - 2 * 86400000).toISOString().split("T")[0]; // Sunday -> Friday
  return new Date(d.getTime() - 86400000).toISOString().split("T")[0]; // Other -> previous day
}

// ── Helper: Check if a date is a weekday ──────────────────

function isWeekday(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00+08:00");
  const day = d.getDay();
  return day !== 0 && day !== 6;
}

// ── GET: Fetch history ──────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") || "30");
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "50");
  const verifiedOnly = searchParams.get("verified") === "1";
  const correctOnly = searchParams.get("correct") === "1";

  try {
    const where: any = {};

    if (verifiedOnly) where.isVerified = true;
    if (correctOnly) where.isCorrect = true;

    // Get total count
    const total = await db.sectorPredictionRecord.count({ where });

    // Get records, most recent first
    const records = await db.sectorPredictionRecord.findMany({
      where,
      orderBy: [{ predictDate: "desc" }, { score: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // Compute summary statistics
    const allVerified = await db.sectorPredictionRecord.findMany({
      where: { isVerified: true },
      select: { isCorrect: true, category: true, score: true, actualChange: true },
    });

    const totalVerified = allVerified.length;
    const totalCorrect = allVerified.filter(r => r.isCorrect === true).length;
    const accuracy = totalVerified > 0 ? (totalCorrect / totalVerified * 100) : 0;

    // Accuracy by category
    const categoryStats: Record<string, { total: number; correct: number; avgScore: number }> = {};
    for (const r of allVerified) {
      if (!categoryStats[r.category]) categoryStats[r.category] = { total: 0, correct: 0, avgScore: 0 };
      categoryStats[r.category].total++;
      categoryStats[r.category].avgScore += r.score;
      if (r.isCorrect) categoryStats[r.category].correct++;
    }
    for (const k of Object.keys(categoryStats)) {
      const s = categoryStats[k];
      s.avgScore = s.total > 0 ? s.avgScore / s.total : 0;
    }

    // Average actual change
    const avgActualChange = totalVerified > 0
      ? allVerified.reduce((sum, r) => sum + (r.actualChange || 0), 0) / totalVerified
      : 0;

    // Date range
    const dateRange = await db.sectorPredictionRecord.findMany({
      select: { predictDate: true },
      orderBy: { predictDate: "desc" },
      distinct: ["predictDate"],
      take: days,
    });
    const dates = dateRange.map(d => d.predictDate);

    return NextResponse.json({
      success: true,
      records,
      total,
      page,
      pageSize,
      stats: {
        totalVerified,
        totalCorrect,
        accuracy: Math.round(accuracy * 10) / 10,
        avgActualChange: Math.round(avgActualChange * 100) / 100,
        categoryStats,
      },
      dates,
    });
  } catch (error: any) {
    console.error("Prediction history GET error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Unknown error", records: [], total: 0, stats: {} },
      { status: 500 }
    );
  }
}

// ── POST: Save predictions or verify ────────────────────

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "save";

  try {
    // ── Verify action: fill in actual next-day results ──
    if (action === "verify") {
      return await verifyPredictions();
    }

    // ── Save action: save today's predictions ──
    const body = await request.json();
    const { predictions } = body as {
      predictions: Array<{
        code: string;
        name: string;
        category: string;
        categoryLabel: string;
        score: number;
        reasons: string[];
        changePercent: number;
        mainNetInflow: number;
        turnover: number;
        stocks?: Array<{
          symbol: string;
          name: string;
          changePercent: number;
          mainNetInflow: number;
          volumeRatio: number;
          turnover: number;
          recommendScore: number;
          recommendTag: string;
        }>;
      }>;
    };

    if (!Array.isArray(predictions) || predictions.length === 0) {
      return NextResponse.json(
        { success: false, error: "predictions array is required" },
        { status: 400 }
      );
    }

    // Get today's date in China timezone
    const now = new Date();
    const chinaOffset = 8 * 60;
    const chinaTime = new Date(now.getTime() + (chinaOffset + now.getTimezoneOffset()) * 60000);
    const todayStr = chinaTime.toISOString().split("T")[0];

    let saved = 0;
    let updated = 0;

    for (const pred of predictions) {
      // Upsert: create or update if same date + sectorCode
      const existing = await db.sectorPredictionRecord.findUnique({
        where: { predictDate_sectorCode: { predictDate: todayStr, sectorCode: pred.code } },
      });

      const reasonsStr = JSON.stringify(pred.reasons || []);
      // Include recommended stocks in reasons JSON as a special key
      const stocksStr = pred.stocks && pred.stocks.length > 0
        ? JSON.stringify(pred.stocks)
        : null;

      // Merge stocks into the reasons field as JSON: { reasons: [...], stocks: [...] }
      const reasonsData = JSON.stringify({
        reasons: pred.reasons || [],
        stocks: pred.stocks || [],
      });

      if (existing) {
        // ── Only update reasons/stocks data, NEVER overwrite original prediction snapshot ──
        // This preserves the original score, predictChange, mainNetInflow, turnover
        // from when the prediction was first saved, so verification remains accurate.
        // The only thing we update is the recommended stocks list (fetched asynchronously).
        await db.sectorPredictionRecord.update({
          where: { id: existing.id },
          data: {
            reasons: reasonsData,
          },
        });
        updated++;
      } else {
        await db.sectorPredictionRecord.create({
          data: {
            predictDate: todayStr,
            sectorCode: pred.code,
            sectorName: pred.name,
            category: pred.category,
            categoryLabel: pred.categoryLabel,
            score: pred.score,
            reasons: reasonsData,
            predictChange: pred.changePercent,
            mainNetInflow: pred.mainNetInflow,
            turnover: pred.turnover,
          },
        });
        saved++;
      }
    }

    return NextResponse.json({
      success: true,
      saved,
      updated,
      date: todayStr,
    });
  } catch (error: any) {
    console.error("Prediction history POST error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

// ── Verify: Fill actual next-day results for unverified predictions ──

async function verifyPredictions() {
  const now = new Date();
  const chinaOffset = 8 * 60;
  const chinaTime = new Date(now.getTime() + (chinaOffset + now.getTimezoneOffset()) * 60000);
  const todayStr = chinaTime.toISOString().split("T")[0];

  // Only verify predictions from the PREVIOUS trading day
  // Today's EastMoney data represents the "next day" for yesterday's predictions
  // Older predictions (2+ days) should have been verified on their respective next days
  const prevTradingDay = getPreviousTradingDay(todayStr);

  // Also try to verify any older unverified predictions (they may not have been
  // verified on their actual next day because the app wasn't opened).
  // For these, the actual data is approximate but still useful.
  const unverified = await db.sectorPredictionRecord.findMany({
    where: {
      isVerified: false,
      predictDate: { not: todayStr },
    },
    orderBy: { predictDate: "desc" },
  });

  if (unverified.length === 0) {
    return NextResponse.json({
      success: true,
      verified: 0,
      message: "没有需要验证的预测记录",
    });
  }

  // Separate into "timely" (previous trading day) and "overdue" (older)
  const timelyPredictions = unverified.filter(r => r.predictDate === prevTradingDay);
  const overduePredictions = unverified.filter(r => r.predictDate !== prevTradingDay);

  // Fetch current sector data from EastMoney — this represents TODAY's data
  // which is the correct "next day" data for yesterday's predictions
  const actualData = new Map<string, { changePercent: number; mainNetInflow: number }>();

  // Fetch industry sectors (larger page to cover more sectors)
  try {
    const url = `http://push2delay.eastmoney.com/api/qt/clist/get?pn=1&pz=300&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:2&fields=f3,f12,f62`;
    const resp = await fetch(url, { next: { revalidate: 0 }, signal: AbortSignal.timeout(10000) });
    if (resp.ok) {
      const data = await resp.json();
      const diff = data?.data?.diff;
      if (Array.isArray(diff)) {
        for (const item of diff) {
          const code = String(item.f12 || "");
          actualData.set(code, {
            changePercent: parseFloat(item.f3) || 0,
            mainNetInflow: parseFloat(item.f62) || 0,
          });
        }
      }
    }
  } catch (e) {
    console.error("Verify fetch industry error:", e);
  }

  // Fetch concept sectors
  try {
    const url = `http://push2delay.eastmoney.com/api/qt/clist/get?pn=1&pz=300&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:3&fields=f3,f12,f62`;
    const resp = await fetch(url, { next: { revalidate: 0 }, signal: AbortSignal.timeout(10000) });
    if (resp.ok) {
      const data = await resp.json();
      const diff = data?.data?.diff;
      if (Array.isArray(diff)) {
        for (const item of diff) {
          const code = String(item.f12 || "");
          actualData.set(code, {
            changePercent: parseFloat(item.f3) || 0,
            mainNetInflow: parseFloat(item.f62) || 0,
          });
        }
      }
    }
  } catch (e) {
    console.error("Verify fetch concept error:", e);
  }

  // Update each unverified record with actual data
  let verified = 0;
  let overdueVerified = 0;

  for (const record of unverified) {
    const actual = actualData.get(record.sectorCode);
    if (!actual) continue;

    const isCorrect = actual.changePercent > 0;
    const isTimely = record.predictDate === prevTradingDay;

    await db.sectorPredictionRecord.update({
      where: { id: record.id },
      data: {
        actualChange: actual.changePercent,
        actualMainNet: actual.mainNetInflow,
        isVerified: true,
        verifiedAt: new Date(),
        isCorrect,
      },
    });
    verified++;
    if (!isTimely) overdueVerified++;
  }

  const timelyCount = timelyPredictions.length;
  const overdueCount = overduePredictions.length;

  return NextResponse.json({
    success: true,
    verified,
    total: unverified.length,
    timelyCount,
    overdueCount,
    overdueVerified,
    prevTradingDay,
    message: `已验证 ${verified}/${unverified.length} 条预测${overdueVerified > 0 ? `（其中 ${overdueVerified} 条为延迟验证，数据可能不完全准确）` : ""}`,
  });
}
