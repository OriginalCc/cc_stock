import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Cache results for 10 minutes
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000;

async function searchWeb(query: string, num = 10) {
  const ZAI = (await import("z-ai-web-dev-sdk")).default;
  const zai = await ZAI.create();
  return zai.functions.invoke("web_search", {
    query,
    num,
    recency_days: 1,
  });
}

async function analyzeWithLLM(context: string, type: "market" | "sector" | "stock") {
  const ZAI = (await import("z-ai-web-dev-sdk")).default;
  const zai = await ZAI.create();

  const systemPrompts: Record<string, string> = {
    market:
      "你是一位专业的A股大盘分析师。根据提供的资讯，分析今日大盘走势预判。你需要用JSON格式返回分析结果，包含：trend（上升/下降/震荡）、confidence（1-100的信心度）、summary（50字以内摘要）、keyFactors（2-3个关键因素数组）、suggestion（做T建议：正T/反T/观望）。只返回JSON，不要其他文字。",
    sector:
      "你是一位专业的A股行业板块分析师。根据提供的资讯，分析该板块今日走势预判。你需要用JSON格式返回分析结果，包含：trend（上升/下降/震荡）、confidence（1-100的信心度）、summary（50字以内摘要）、keyFactors（2-3个关键因素数组）、suggestion（做T建议：正T/反T/观望）。只返回JSON，不要其他文字。",
    stock:
      "你是一位专业的A股个股分析师。根据提供的资讯，分析该个股今日走势预判。你需要用JSON格式返回分析结果，包含：trend（上升/下降/震荡）、confidence（1-100的信心度）、summary（50字以内摘要）、keyFactors（2-3个关键因素数组）、suggestion（做T建议：正T/反T/观望）。只返回JSON，不要其他文字。",
  };

  const completion = await zai.chat.completions.create({
    messages: [
      { role: "assistant", content: systemPrompts[type] },
      { role: "user", content: context },
    ],
    thinking: { type: "disabled" },
  });

  const content = completion.choices[0]?.message?.content || "";
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {}
  return {
    trend: "震荡",
    confidence: 50,
    summary: content.slice(0, 50),
    keyFactors: ["资讯解析异常"],
    suggestion: "观望",
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol") || "";
    const type = (searchParams.get("type") || "market") as "market" | "sector" | "stock";
    const sectorName = searchParams.get("sectorName") || "";
    const stockName = searchParams.get("stockName") || "";

    // Check cache
    const cacheKey = `${type}-${symbol}-${sectorName}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json({ success: true, ...cached.data, cached: true });
    }

    // Step 1: Search for relevant news
    const queries: Record<string, string> = {
      market: "A股 大盘 今日 走势 资讯",
      sector: `A股 ${sectorName} 板块 今日 走势 资讯`,
      stock: `A股 ${stockName} ${symbol} 今日 走势 资讯`,
    };

    const searchQuery = queries[type] || queries.market;
    const searchResults = await searchWeb(searchQuery, 8);

    // Step 2: Format news for LLM analysis
    const newsContext = searchResults
      .slice(0, 6)
      .map((r: any, i: number) => `${i + 1}. ${r.name}\n   ${r.snippet}\n   来源: ${r.host_name} | ${r.date || "未知日期"}`)
      .join("\n\n");

    const contextMap: Record<string, string> = {
      market: `以下是今日A股大盘相关资讯：\n\n${newsContext}\n\n请分析大盘今日走势预判。`,
      sector: `以下是${sectorName}板块今日相关资讯：\n\n${newsContext}\n\n请分析${sectorName}板块今日走势预判。`,
      stock: `以下是${stockName}(${symbol})今日相关资讯：\n\n${newsContext}\n\n请分析${stockName}今日走势预判。`,
    };

    // Step 3: LLM Analysis
    const analysis = await analyzeWithLLM(contextMap[type], type);

    // Step 4: Compile result
    const result = {
      type,
      symbol,
      sectorName,
      news: searchResults.slice(0, 6).map((r: any) => ({
        title: r.name,
        snippet: r.snippet,
        source: r.host_name,
        date: r.date,
        url: r.url,
      })),
      analysis,
      timestamp: new Date().toISOString(),
    };

    // Cache the result
    cache.set(cacheKey, { data: result, timestamp: Date.now() });

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error("News analysis error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "资讯分析失败" },
      { status: 500 }
    );
  }
}
