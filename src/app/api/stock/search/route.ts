import { NextRequest, NextResponse } from "next/server";
import { searchStocks } from "@/lib/finance-api";

export async function GET(request: NextRequest) {
  const searchQuery = request.nextUrl.searchParams.get("q");

  if (!searchQuery || searchQuery.trim().length === 0) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results = await searchStocks(searchQuery.trim());
    return NextResponse.json({ results });
  } catch (error: any) {
    console.error("Search API error:", error);
    return NextResponse.json(
      { error: "搜索失败", results: [] },
      { status: 500 }
    );
  }
}
