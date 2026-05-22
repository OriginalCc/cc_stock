import { NextRequest, NextResponse } from "next/server";
import { searchAShare } from "@/lib/ashare-api";
import { searchStocks } from "@/lib/finance-api";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") || "";
  const mode = request.nextUrl.searchParams.get("mode") || "auto"; // "ashare", "us", "auto"

  if (!query.trim()) {
    return NextResponse.json({ results: [] });
  }

  try {
    if (mode === "ashare") {
      const results = await searchAShare(query);
      return NextResponse.json({ results });
    }

    if (mode === "us") {
      const results = await searchStocks(query);
      return NextResponse.json({ results });
    }

    // Auto mode: try A-share first, then US
    const aShareResults = await searchAShare(query);
    if (aShareResults.length > 0) {
      return NextResponse.json({ results: aShareResults });
    }

    const usResults = await searchStocks(query);
    return NextResponse.json({ results: usResults });
  } catch (error: any) {
    console.error("Search API error:", error);
    return NextResponse.json({ error: "搜索失败", results: [] }, { status: 500 });
  }
}
