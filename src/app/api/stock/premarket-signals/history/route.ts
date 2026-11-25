import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const STATS_DEFAULT = { opportunity: 0, watch: 0, risk: 0 };

// ── GET: 盘前研判历史快照（每日 08:35 定时任务的留存记录） ──
// 每个基准交易日一行（basisDate 唯一键，自动去重），按基准日倒序返回最近 12 条。
// 页面「历史」弹层用：展示每日 08:35 自动计算的时间留痕 + 机会/观察/风险分布。
export async function GET() {
  try {
    const rows = await db.premarketSignalSnapshot.findMany({
      orderBy: { basisDate: "desc" },
      take: 12,
    });

    const history = rows.map((r) => {
      let stats = { ...STATS_DEFAULT };
      try {
        const parsed = JSON.parse(r.payload) as { stats?: typeof STATS_DEFAULT };
        if (parsed?.stats && typeof parsed.stats === "object") {
          stats = { ...stats, ...parsed.stats };
        }
      } catch {
        // payload 损坏时用默认值，不阻断整体响应
      }
      return {
        basisDate: r.basisDate,
        computedAt: r.computedAt.toISOString(),
        stockCount: r.stockCount,
        stats,
      };
    });

    return NextResponse.json({ success: true, history });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "盘前研判历史快照获取失败";
    return NextResponse.json({ success: false, history: [], error: msg });
  }
}
