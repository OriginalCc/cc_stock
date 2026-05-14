import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAShareQuote, getAShareKLine } from "@/lib/ashare-api";

// GET: Fetch screener history records with stats
export async function GET(request: NextRequest) {
  try {
    const days = parseInt(request.nextUrl.searchParams.get("days") || "30");
    const page = parseInt(request.nextUrl.searchParams.get("page") || "1");
    const pageSize = parseInt(request.nextUrl.searchParams.get("pageSize") || "100");
    const sector = request.nextUrl.searchParams.get("sector") || ""; // filter by sector

    const where: any = {
      recordDate: {
        gte: getDateNDaysAgo(days),
      },
    };
    if (sector) {
      where.sectorName = sector;
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
    const positiveCount = verifiedRecords.filter((r) => r.avgNextDayChange > 0).length;
    const accuracy = verifiedRecords.length > 0 ? (positiveCount / verifiedRecords.length) * 100 : 0;

    // Parse stocks from JSON for each record
    const parsedRecords = records.map((r) => {
      let nextDayChanges: Record<string, number> = {};
      try {
        if (r.nextDayChangesJson) {
          nextDayChanges = JSON.parse(r.nextDayChangesJson);
        }
      } catch {}
      return {
        ...r,
        stocks: JSON.parse(r.stocksJson),
        filters: JSON.parse(r.filtersJson),
        nextDayChanges,
      };
    });

    // ── Stats by date ──
    const dateStats: Record<string, { count: number; verified: number; avgChange: number; positive: number }> = {};
    for (const r of parsedRecords) {
      if (!dateStats[r.recordDate]) {
        dateStats[r.recordDate] = { count: 0, verified: 0, avgChange: 0, positive: 0 };
      }
      dateStats[r.recordDate].count++;
      if (r.isVerified) {
        dateStats[r.recordDate].verified++;
        dateStats[r.recordDate].avgChange += r.avgNextDayChange;
        if (r.avgNextDayChange > 0) dateStats[r.recordDate].positive++;
      }
    }
    for (const ds of Object.values(dateStats)) {
      if (ds.verified > 0) {
        ds.avgChange = ds.avgChange / ds.verified;
      }
    }

    // ── Stats by sector (all records, not just current page) ──
    const allRecords = await db.screenerHistoryRecord.findMany({
      where: { recordDate: { gte: getDateNDaysAgo(days) } },
      select: { sectorName: true, avgNextDayChange: true, isVerified: true, stockCount: true },
    });
    const sectorStats: Record<string, { count: number; verified: number; avgChange: number; positive: number; totalStocks: number }> = {};
    for (const r of allRecords) {
      if (!sectorStats[r.sectorName]) {
        sectorStats[r.sectorName] = { count: 0, verified: 0, avgChange: 0, positive: 0, totalStocks: 0 };
      }
      sectorStats[r.sectorName].count++;
      sectorStats[r.sectorName].totalStocks += r.stockCount;
      if (r.isVerified) {
        sectorStats[r.sectorName].verified++;
        sectorStats[r.sectorName].avgChange += r.avgNextDayChange;
        if (r.avgNextDayChange > 0) sectorStats[r.sectorName].positive++;
      }
    }
    for (const ss of Object.values(sectorStats)) {
      if (ss.verified > 0) {
        ss.avgChange = ss.avgChange / ss.verified;
      }
    }

    // ── Top performing stocks across all verified records ──
    const stockPerformance: Record<string, { name: string; appearances: number; nextDayChanges: number[]; avgChange: number }> = {};
    for (const r of parsedRecords) {
      if (!r.isVerified) continue;
      for (const stock of r.stocks as Array<{ symbol: string; name: string; [key: string]: any }>) {
        if (!stockPerformance[stock.symbol]) {
          stockPerformance[stock.symbol] = { name: stock.name, appearances: 0, nextDayChanges: [], avgChange: 0 };
        }
        stockPerformance[stock.symbol].appearances++;
        const nextDayChange = r.nextDayChanges[stock.symbol];
        if (nextDayChange != null) {
          stockPerformance[stock.symbol].nextDayChanges.push(nextDayChange);
        }
      }
    }
    // Compute avg per stock
    for (const sp of Object.values(stockPerformance)) {
      if (sp.nextDayChanges.length > 0) {
        sp.avgChange = sp.nextDayChanges.reduce((a, b) => a + b, 0) / sp.nextDayChanges.length;
      }
    }
    // Sort by appearances desc, take top 20
    const topStocks = Object.entries(stockPerformance)
      .map(([symbol, data]) => ({ symbol, ...data }))
      .sort((a, b) => b.appearances - a.appearances || b.avgChange - a.avgChange)
      .slice(0, 20);

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
        positiveCount,
        negativeCount: verifiedRecords.length - positiveCount,
      },
      dateStats,
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

    // Action: verify — backfill next-day results for unverified records
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
      const details: Array<{ recordDate: string; recordTime: string; sectorName: string; status: string; stockVerified: number; avgChange: number }> = [];

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
          let totalChange = 0;
          let validCount = 0;
          const nextDayChanges: Record<string, number> = {};

          // Fetch daily K-line for each stock to get next-trading-day change
          // Batch in groups of 10 for parallelism
          for (let i = 0; i < symbols.length; i += 10) {
            const batch = symbols.slice(i, i + 10);
            const results = await Promise.allSettled(
              batch.map(async (sym) => {
                // Get recent 10 daily K-lines (enough to find next day after recordDate)
                const kline = await getAShareKLine(sym, 240, 10);
                return { symbol: sym, kline };
              })
            );

            for (const result of results) {
              if (result.status !== "fulfilled" || !result.value.kline) continue;
              const { symbol: sym, kline } = result.value;
              if (!Array.isArray(kline) || kline.length === 0) continue;

              // Find the next trading day after recordDate
              // K-line dates are in format "2026-05-10"
              const recordDateStr = record.recordDate;
              let nextDayKline = null;
              let foundRecordDate = false;
              for (const item of kline) {
                if (item.date === recordDateStr) {
                  foundRecordDate = true;
                  continue; // Skip the record date itself, we want the NEXT day
                }
                if (foundRecordDate && item.date > recordDateStr) {
                  nextDayKline = item;
                  break;
                }
                // Also handle case where recordDate is not in kline (e.g. recordDate is a weekend/holiday)
                if (!foundRecordDate && item.date > recordDateStr) {
                  nextDayKline = item;
                  break;
                }
              }

              if (nextDayKline && nextDayKline.close > 0) {
                // Calculate next-day change: we need the close of the trading day BEFORE the next day
                // The K-line "close" is the close price, and "open" is the open price
                // For next-day verification, we compare next-day close vs record-day close
                // But since we may not have the exact record-day close, we use:
                // nextDayChange = (nextDayClose - nextDayOpen) is NOT correct
                // Correct: nextDayChange = (nextDayClose - prevDayClose) / prevDayClose * 100
                // But the prevDayClose might not be the same as the screening-time price
                
                // Better approach: use the nextDayKline's open as the entry point
                // and close as the exit point for the day's gain
                // Actually, the standard "次日涨幅" is the change from previous close to next day's close
                // which is exactly what the K-line data represents if we look at the close vs prev close
                
                // Find the day before nextDayKline to get prev close
                const nextDayIdx = kline.findIndex(k => k.date === nextDayKline!.date);
                const prevClose = nextDayIdx > 0 ? kline[nextDayIdx - 1].close : 0;
                
                if (prevClose > 0) {
                  const nextDayChange = ((nextDayKline.close - prevClose) / prevClose) * 100;
                  nextDayChanges[sym] = Number(nextDayChange.toFixed(2));
                  totalChange += nextDayChange;
                  validCount++;
                }
              }
            }
          }

          if (validCount > 0) {
            const avgChange = totalChange / validCount;
            await db.screenerHistoryRecord.update({
              where: { id: record.id },
              data: {
                avgNextDayChange: Number(avgChange.toFixed(2)),
                nextDayChangesJson: JSON.stringify(nextDayChanges),
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
              stockVerified: validCount,
              avgChange: Number(avgChange.toFixed(2)),
            });
          } else {
            details.push({
              recordDate: record.recordDate,
              recordTime: record.recordTime,
              sectorName: record.sectorName,
              status: "no_data",
              stockVerified: 0,
              avgChange: 0,
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
        const { recordDate, recordTime, sectorName, stockCount, stocksJson, filtersJson } = rec;
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
