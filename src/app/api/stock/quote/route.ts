import { NextRequest, NextResponse } from "next/server";
import { getStockQuote } from "@/lib/finance-api";

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker");
  const type = request.nextUrl.searchParams.get("type") || "STOCKS";

  if (!ticker) {
    return NextResponse.json({ error: "缺少股票代码" }, { status: 400 });
  }

  try {
    const quote = await getStockQuote(ticker, type);
    if (!quote) {
      return NextResponse.json({ error: "未找到股票数据" }, { status: 404 });
    }
    return NextResponse.json(quote);
  } catch (error: any) {
    console.error("Quote API error:", error);
    return NextResponse.json(
      { error: "获取行情失败" },
      { status: 500 }
    );
  }
}
