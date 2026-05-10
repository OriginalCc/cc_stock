import { NextRequest, NextResponse } from "next/server";
import { getAShareTimeline, isAShare } from "@/lib/ashare-api";
import { fetchGuarded } from "@/lib/fetch-guard";

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol") || "";

  if (!symbol) {
    return NextResponse.json({ error: "缺少股票代码" }, { status: 400 });
  }

  if (!isAShare(symbol)) {
    return NextResponse.json({ error: "分时图仅支持A股和ETF", items: [], prevClose: 0 });
  }

  try {
    const result = await fetchGuarded(
      `timeline:${symbol}`,
      async (signal) => {
        try {
          return await getAShareTimeline(symbol);
        } catch {
          return { items: [], prevClose: 0 };
        }
      },
      10000 // 10s cache
    );
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Timeline API error:", error);
    return NextResponse.json({ error: "获取分时数据失败", items: [], prevClose: 0 }, { status: 500 });
  }
}
