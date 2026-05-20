import { NextRequest, NextResponse } from "next/server";
import { searchAShare } from "@/lib/ashare-api";
import { searchStocks } from "@/lib/finance-api";
import { fetchGuarded } from "@/lib/fetch-guard";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") || "";
  const mode = request.nextUrl.searchParams.get("mode") || "auto"; // "ashare", "us", "auto"

  if (!query.trim()) {
    return NextResponse.json({ results: [] });
  }

  try {
    if (mode === "ashare") {
      const results = await fetchGuarded(
        `search:ashare:${query}`,
        async () => searchAShare(query),
        15000 // 15s server-side cache for search results
      );
      return NextResponse.json({ results });
    }

    if (mode === "us") {
      const results = await fetchGuarded(
        `search:us:${query}`,
        async () => searchStocks(query),
        15000
      );
      return NextResponse.json({ results });
    }

    // Auto mode: try A-share first, then US
    // Use server-side cache + dedup to avoid redundant external API calls
    const aShareResults = await fetchGuarded(
      `search:ashare:${query}`,
      async () => searchAShare(query),
      15000
    );
    if (aShareResults.length > 0) {
      return NextResponse.json({ results: aShareResults });
    }

    const usResults = await fetchGuarded(
      `search:us:${query}`,
      async () => searchStocks(query),
      15000
    );
    return NextResponse.json({ results: usResults });
  } catch (error: any) {
    console.error("Search API error:", error);
    return NextResponse.json({ error: "搜索失败", results: [] }, { status: 500 });
  }
}
