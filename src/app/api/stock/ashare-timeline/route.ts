import { NextRequest, NextResponse } from "next/server";
import { getAShareTimeline, isAShare } from "@/lib/ashare-api";

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol") || "";

  if (!symbol) {
    return NextResponse.json({ error: "缺少股票代码" }, { status: 400 });
  }

  if (!isAShare(symbol)) {
    return NextResponse.json({ error: "分时图仅支持A股和ETF", items: [], prevClose: 0 });
  }

  try {
    const result = await getAShareTimeline(symbol);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Timeline API error:", error);
    return NextResponse.json({ error: "获取分时数据失败" }, { status: 500 });
  }
}
