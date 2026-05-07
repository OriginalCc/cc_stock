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
      "你是一位专业的A股大盘分析师。根据提供的资讯，综合分析大盘明日走势预判。你需要结合当日收盘情况、资金流向、政策消息、外盘影响等因素，判断明日大盘走势。用JSON格式返回分析结果，包含：trend（上升/下降/震荡）、confidence（1-100的信心度）、summary（50字以内摘要）、keyFactors（2-3个关键因素数组）、suggestion（明日做T建议：正T/反T/观望）。只返回JSON，不要其他文字。",
    sector:
      "你是一位专业的A股行业板块分析师。根据提供的资讯，综合分析该板块明日走势预判。你需要结合板块当日表现、资金进出、龙头股走势、行业政策等因素，判断明日板块走势。用JSON格式返回分析结果，包含：trend（上升/下降/震荡）、confidence（1-100的信心度）、summary（50字以内摘要）、keyFactors（2-3个关键因素数组）、suggestion（明日做T建议：正T/反T/观望）。只返回JSON，不要其他文字。",
    stock:
      "你是一位专业的A股个股分析师。根据提供的资讯，综合分析该个股明日走势预判。你需要结合个股当日走势、成交量变化、技术面形态、消息面利好利空等因素，判断明日个股走势。用JSON格式返回分析结果，包含：trend（上升/下降/震荡）、confidence（1-100的信心度）、summary（50字以内摘要）、keyFactors（2-3个关键因素数组）、suggestion（明日做T建议：正T/反T/观望）。只返回JSON，不要其他文字。",
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
      market: "A股 大盘 明日 走势 预测 资讯",
      sector: `A股 ${sectorName} 板块 明日 走势 预测 资讯`,
      stock: `A股 ${stockName} ${symbol} 明日 走势 预测 资讯`,
    };

    const searchQuery = queries[type] || queries.market;
    const searchResults = await searchWeb(searchQuery, 8);

    // Step 2: Format news for LLM analysis
    const newsContext = searchResults
      .slice(0, 6)
      .map((r: any, i: number) => `${i + 1}. ${r.name}\n   ${r.snippet}\n   来源: ${r.host_name} | ${r.date || "未知日期"}`)
      .join("\n\n");

    const contextMap: Record<string, string> = {
      market: `以下是A股大盘最新资讯：\n\n${newsContext}\n\n请综合以上资讯，结合当日收盘数据、资金流向、外盘表现、政策消息等，分析大盘明日走势预判。`,
      sector: `以下是${sectorName}板块最新资讯：\n\n${newsContext}\n\n请综合以上资讯，结合板块当日表现、资金进出、龙头股走势、行业政策等，分析${sectorName}板块明日走势预判。`,
      stock: `以下是${stockName}(${symbol})最新资讯：\n\n${newsContext}\n\n请综合以上资讯，结合个股当日走势、成交量变化、技术面形态、消息面利好利空等，分析${stockName}明日走势预判。`,
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
