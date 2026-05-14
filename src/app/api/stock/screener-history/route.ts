import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAShareKLine } from "@/lib/ashare-api";

// GET: Fetch screener history records with stats
export async function GET(request: NextRequest) {
  try {
    const days = parseInt(request.nextUrl.searchParams.get("days") || "30");
    const page = parseInt(request.nextUrl.searchParams.get("page") || "1");
    const pageSize = parseInt(request.nextUrl.searchParams.get("pageSize") || "100");
    const sector = request.nextUrl.searchParams.get("sector") || "";
    const screenerType = request.nextUrl.searchParams.get("screenerType") || "";

    const where: any = {
      recordDate: {
        gte: getDateNDaysAgo(days),
      },
    };
    if (sector) {
      where.sectorName = sector;
    }
    if (screenerType) {
      where.screenerType = screenerType;
    }

    const records = await db.screenerHistoryRecord.findMany({
      where,
      orderBy: [{ recordDate: "desc" }, { recordTime: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const total = await db.screenerHistoryRecord.count({ where });

    // Compute overall stats
    const verifiedRecords = records.filter((r) => r.isVerified);
    const avgNextDayChange =
      verifiedRecords.length > 0
        ? verifiedRecords.reduce((sum, r) => sum + r.avgNextDayChange, 0) / verifiedRecords.length
        : 0;
    const avgDay3Change =
      verifiedRecords.length > 0
        ? verifiedRecords.reduce((sum, r) => sum + r.avgDay3Change, 0) / verifiedRecords.length
        : 0;
    const avgDay5Change =
      verifiedRecords.length > 0
        ? verifiedRecords.reduce((sum, r) => sum + r.avgDay5Change, 0) / verifiedRecords.length
        : 0;
    const positiveCount = verifiedRecords.filter((r) => r.avgNextDayChange > 0).length;
    const day3PositiveCount = verifiedRecords.filter((r) => r.avgDay3Change > 0).length;
    const day5PositiveCount = verifiedRecords.filter((r) => r.avgDay5Change > 0).length;
    const accuracy = verifiedRecords.length > 0 ? (positiveCount / verifiedRecords.length) * 100 : 0;

    // Parse stocks from JSON for each record
    const parsedRecords = records.map((r) => {
      let nextDayChanges: Record<string, number> = {};
      let day3Changes: Record<string, number> = {};
      let day5Changes: Record<string, number> = {};
      try {
        if (r.nextDayChangesJson) nextDayChanges = JSON.parse(r.nextDayChangesJson);
      } catch {}
      try {
        if (r.day3ChangesJson) day3Changes = JSON.parse(r.day3ChangesJson);
      } catch {}
      try {
        if (r.day5ChangesJson) day5Changes = JSON.parse(r.day5ChangesJson);
      } catch {}
      return {
        ...r,
        stocks: JSON.parse(r.stocksJson),
        filters: JSON.parse(r.filtersJson),
        nextDayChanges,
        day3Changes,
        day5Changes,
      };
    });

    // ── Stats by screener type ──
    const allRecords = await db.screenerHistoryRecord.findMany({
      where: { recordDate: { gte: getDateNDaysAgo(days) } },
      select: {
        sectorName: true,
        screenerType: true,
        avgNextDayChange: true,
        avgDay3Change: true,
        avgDay5Change: true,
        isVerified: true,
        stockCount: true,
      },
    });

    // ── Stats by sector ──
    const sectorStats: Record<string, { count: number; verified: number; avgChange: number; avgDay3: number; avgDay5: number; positive: number; day3Positive: number; day5Positive: number; totalStocks: number }> = {};
    for (const r of allRecords) {
      if (!sectorStats[r.sectorName]) {
        sectorStats[r.sectorName] = { count: 0, verified: 0, avgChange: 0, avgDay3: 0, avgDay5: 0, positive: 0, day3Positive: 0, day5Positive: 0, totalStocks: 0 };
      }
      sectorStats[r.sectorName].count++;
      sectorStats[r.sectorName].totalStocks += r.stockCount;
      if (r.isVerified) {
        sectorStats[r.sectorName].verified++;
        sectorStats[r.sectorName].avgChange += r.avgNextDayChange;
        sectorStats[r.sectorName].avgDay3 += r.avgDay3Change;
        sectorStats[r.sectorName].avgDay5 += r.avgDay5Change;
        if (r.avgNextDayChange > 0) sectorStats[r.sectorName].positive++;
        if (r.avgDay3Change > 0) sectorStats[r.sectorName].day3Positive++;
        if (r.avgDay5Change > 0) sectorStats[r.sectorName].day5Positive++;
      }
    }
    for (const ss of Object.values(sectorStats)) {
      if (ss.verified > 0) {
        ss.avgChange = ss.avgChange / ss.verified;
        ss.avgDay3 = ss.avgDay3 / ss.verified;
        ss.avgDay5 = ss.avgDay5 / ss.verified;
      }
    }

    // ── Top performing stocks across all verified records ──
    const stockPerformance: Record<string, { name: string; appearances: number; nextDayChanges: number[]; day3Changes: number[]; day5Changes: number[]; avgChange: number }> = {};
    for (const r of parsedRecords) {
      if (!r.isVerified) continue;
      for (const stock of r.stocks as Array<{ symbol: string; name: string; [key: string]: any }>) {
        if (!stockPerformance[stock.symbol]) {
          stockPerformance[stock.symbol] = { name: stock.name, appearances: 0, nextDayChanges: [], day3Changes: [], day5Changes: [], avgChange: 0 };
        }
        stockPerformance[stock.symbol].appearances++;
        const nextDayChange = r.nextDayChanges[stock.symbol];
        if (nextDayChange != null) stockPerformance[stock.symbol].nextDayChanges.push(nextDayChange);
        const day3Change = r.day3Changes[stock.symbol];
        if (day3Change != null) stockPerformance[stock.symbol].day3Changes.push(day3Change);
        const day5Change = r.day5Changes[stock.symbol];
        if (day5Change != null) stockPerformance[stock.symbol].day5Changes.push(day5Change);
      }
    }
    // Compute avg per stock
    for (const sp of Object.values(stockPerformance)) {
      if (sp.nextDayChanges.length > 0) {
        sp.avgChange = sp.nextDayChanges.reduce((a, b) => a + b, 0) / sp.nextDayChanges.length;
      }
    }
    // Sort by appearances desc, take top 30
    const topStocks = Object.entries(stockPerformance)
      .map(([symbol, data]) => ({ symbol, ...data }))
      .sort((a, b) => b.appearances - a.appearances || b.avgChange - a.avgChange)
      .slice(0, 30);

    // Available sectors for filter dropdown
    const availableSectors = Object.keys(sectorStats).sort();

    return NextResponse.json({
      records: parsedRecords,
      total,
      stats: {
        totalRecords: total,
        verifiedCount: verifiedRecords.length,
        accuracy: Number(accuracy.toFixed(1)),
        avgNextDayChange: Number(avgNextDayChange.toFixed(2)),
        avgDay3Change: Number(avgDay3Change.toFixed(2)),
        avgDay5Change: Number(avgDay5Change.toFixed(2)),
        positiveCount,
        negativeCount: verifiedRecords.length - positiveCount,
        day3PositiveCount,
        day5PositiveCount,
      },
      sectorStats,
      topStocks,
      availableSectors,
    });
  } catch (error: any) {
    console.error("Screener history GET error:", error);
    return NextResponse.json({ error: error.message || "查询失败" }, { status: 500 });
  }
}

// POST: Save screener results / Verify
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, records } = body;

    // Action: verify — backfill multi-day results for unverified records
    if (action === "verify") {
      const unverified = await db.screenerHistoryRecord.findMany({
        where: { isVerified: false },
        orderBy: [{ recordDate: "desc" }, { recordTime: "desc" }],
        take: 50,
      });

      if (unverified.length === 0) {
        return NextResponse.json({ message: "没有需要验证的记录", verified: 0, skipped: 0, details: [] });
      }

      const today = getTodayDate();
      let verifiedCount = 0;
      let skippedToday = 0;
      const details: Array<{ recordDate: string; recordTime: string; sectorName: string; status: string; stockVerified: number; avgChange: number; avgDay3: number; avgDay5: number }> = [];

      for (const record of unverified) {
        // Can't verify today's records (no next-day data yet)
        if (record.recordDate >= today) {
          skippedToday++;
          continue;
        }

        try {
          const stocks: Array<{ symbol: string; name: string; price: number; changePercent: number; [key: string]: any }> = JSON.parse(record.stocksJson);
          if (!stocks || stocks.length === 0) continue;

          const symbols = stocks.map((s) => s.symbol);
          const nextDayChanges: Record<string, number> = {};
          const day3Changes: Record<string, number> = {};
          const day5Changes: Record<string, number> = {};

          // Fetch daily K-line for each stock to get multi-day changes
          // Need at least 10 trading days of data after record date for 5-day verification
          for (let i = 0; i < symbols.length; i += 10) {
            const batch = symbols.slice(i, i + 10);
            const results = await Promise.allSettled(
              batch.map(async (sym) => {
                // Get recent 20 daily K-lines (enough to find next 5+ trading days after recordDate)
                const kline = await getAShareKLine(sym, 240, 20);
                return { symbol: sym, kline };
              })
            );

            for (const result of results) {
              if (result.status !== "fulfilled" || !result.value.kline) continue;
              const { symbol: sym, kline } = result.value;
              if (!Array.isArray(kline) || kline.length === 0) continue;

              // Sort kline by date ascending
              const sorted = [...kline].sort((a: any, b: any) => a.date.localeCompare(b.date));

              // Find all trading days after recordDate
              const futureDays = sorted.filter((k: any) => k.date > record.recordDate && k.close > 0);
              if (futureDays.length === 0) continue;

              // The entry price is the close of the last trading day on or before recordDate
              // For simplicity, use the open of the first future day as entry (simulates buying at next-day open)
              const entryClose = futureDays[0].open > 0 ? futureDays[0].open : futureDays[0].close;

              // Day 1: next trading day close vs entry open
              if (futureDays.length >= 1) {
                const day1Close = futureDays[0].close;
                if (entryClose > 0) {
                  nextDayChanges[sym] = Number((((day1Close - entryClose) / entryClose) * 100).toFixed(2));
                }
              }

              // Day 3: 3rd trading day close vs entry open
              if (futureDays.length >= 3) {
                const day3Close = futureDays[2].close;
                if (entryClose > 0) {
                  day3Changes[sym] = Number((((day3Close - entryClose) / entryClose) * 100).toFixed(2));
                }
              }

              // Day 5: 5th trading day close vs entry open
              if (futureDays.length >= 5) {
                const day5Close = futureDays[4].close;
                if (entryClose > 0) {
                  day5Changes[sym] = Number((((day5Close - entryClose) / entryClose) * 100).toFixed(2));
                }
              }
            }
          }

          // Compute averages
          const nextDayValues = Object.values(nextDayChanges);
          const day3Values = Object.values(day3Changes);
          const day5Values = Object.values(day5Changes);

          const avgNextDay = nextDayValues.length > 0 ? nextDayValues.reduce((a, b) => a + b, 0) / nextDayValues.length : 0;
          const avgDay3 = day3Values.length > 0 ? day3Values.reduce((a, b) => a + b, 0) / day3Values.length : 0;
          const avgDay5 = day5Values.length > 0 ? day5Values.reduce((a, b) => a + b, 0) / day5Values.length : 0;

          if (nextDayValues.length > 0) {
            await db.screenerHistoryRecord.update({
              where: { id: record.id },
              data: {
                avgNextDayChange: Number(avgNextDay.toFixed(2)),
                nextDayChangesJson: JSON.stringify(nextDayChanges),
                avgDay3Change: Number(avgDay3.toFixed(2)),
                day3ChangesJson: JSON.stringify(day3Changes),
                avgDay5Change: Number(avgDay5.toFixed(2)),
                day5ChangesJson: JSON.stringify(day5Changes),
                isVerified: true,
                verifiedAt: new Date(),
              },
            });
            verifiedCount++;
            details.push({
              recordDate: record.recordDate,
              recordTime: record.recordTime,
              sectorName: record.sectorName,
              status: "verified",
              stockVerified: nextDayValues.length,
              avgChange: Number(avgNextDay.toFixed(2)),
              avgDay3: Number(avgDay3.toFixed(2)),
              avgDay5: Number(avgDay5.toFixed(2)),
            });
          } else {
            details.push({
              recordDate: record.recordDate,
              recordTime: record.recordTime,
              sectorName: record.sectorName,
              status: "no_data",
              stockVerified: 0,
              avgChange: 0,
              avgDay3: 0,
              avgDay5: 0,
            });
          }
        } catch (e) {
          console.error(`Verify record ${record.id} error:`, e);
          details.push({
            recordDate: record.recordDate,
            recordTime: record.recordTime,
            sectorName: record.sectorName,
            status: "error",
            stockVerified: 0,
            avgChange: 0,
            avgDay3: 0,
            avgDay5: 0,
          });
        }
      }

      return NextResponse.json({
        message: skippedToday > 0
          ? `验证完成（今日${skippedToday}条记录需次日才能验证）`
          : "验证完成",
        verified: verifiedCount,
        skipped: skippedToday,
        details,
      });
    }

    // Action: save — save screener results
    if (action === "save" && records) {
      const saved: Array<{ id: string; recordDate: string; recordTime: string; sectorName: string }> = [];

      for (const rec of records) {
        const { recordDate, recordTime, sectorName, screenerType, stockCount, stocksJson, filtersJson } = rec;
        if (!recordDate || !recordTime || !sectorName) continue;

        const result = await db.screenerHistoryRecord.upsert({
          where: {
            recordDate_recordTime_sectorName: {
              recordDate,
              recordTime,
              sectorName,
            },
          },
          create: {
            recordDate,
            recordTime,
            screenerType: screenerType || "stock",
            sectorName,
            stockCount: stockCount || 0,
            stocksJson: stocksJson || "[]",
            filtersJson: filtersJson || "{}",
          },
          update: {
            stockCount: stockCount || 0,
            stocksJson: stocksJson || "[]",
            filtersJson: filtersJson || "{}",
          },
        });

        saved.push({
          id: result.id,
          recordDate: result.recordDate,
          recordTime: result.recordTime,
          sectorName: result.sectorName,
        });
      }

      return NextResponse.json({ success: true, saved });
    }

    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (error: any) {
    console.error("Screener history POST error:", error);
    return NextResponse.json({ error: error.message || "保存失败" }, { status: 500 });
  }
}

// DELETE: Delete old records
export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (id) {
      await db.screenerHistoryRecord.delete({ where: { id } });
      return NextResponse.json({ success: true });
    }

    // Delete all records older than 60 days
    const cutoff = getDateNDaysAgo(60);
    const result = await db.screenerHistoryRecord.deleteMany({
      where: { recordDate: { lt: cutoff } },
    });
    return NextResponse.json({ success: true, deleted: result.count });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "删除失败" }, { status: 500 });
  }
}

// Helper: get today's date string in China timezone
function getTodayDate(): string {
  const now = new Date();
  const chinaTime = new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60000);
  return chinaTime.toISOString().split("T")[0];
}

// Helper: get date string N days ago
function getDateNDaysAgo(n: number): string {
  const now = new Date();
  const chinaTime = new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60000);
  chinaTime.setDate(chinaTime.getDate() - n);
  return chinaTime.toISOString().split("T")[0];
}
