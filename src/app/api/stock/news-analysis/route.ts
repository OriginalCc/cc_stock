import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Cache results for the current trading day (until 16:00 CST the next day if after hours)
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes – balance freshness vs cost

function getTodayKey(): string {
  const now = new Date();
  // Use China timezone for date key
  const china = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  return `${china.getFullYear()}-${String(china.getMonth() + 1).padStart(2, '0')}-${String(china.getDate()).padStart(2, '0')}`;
}

// Before 11:30 → predict today (今日预判), after 11:30 → predict tomorrow (明日预判)
function getPredictionDay(): { day: string; dayLabel: string } {
  const now = new Date();
  const china = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  const hour = china.getHours();
  const minute = china.getMinutes();
  if (hour < 11 || (hour === 11 && minute < 30)) {
    return { day: "今日", dayLabel: "今日预判" };
  }
  return { day: "明日", dayLabel: "明日预判" };
}

// Shared ZAI instance
let zaiInstance: any = null;
async function getZAI() {
  if (!zaiInstance) {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

// ── Step 1: Multi-angle search queries ──
const SEARCH_QUERIES: Record<string, (p: { sectorName: string; stockName: string; symbol: string; day: string }) => { label: string; query: string }[]> = {
  market: ({ day }) => [
    { label: "宏观政策", query: "A股 大盘 宏观政策 央行 财政 资讯" },
    { label: "资金流向", query: "A股 北向资金 融资融券 资金流向 今日" },
    { label: "外盘影响", query: "美股 纳斯达克 A股 影响 隔夜 外盘" },
    { label: "技术分析", query: `A股 大盘 技术分析 支撑 压力 ${day} 走势` },
  ],
  sector: ({ sectorName, day }) => [
    { label: "行业政策", query: `${sectorName} 板块 行业政策 利好 利空 资讯` },
    { label: "板块资金", query: `${sectorName} 板块 主力资金 龙头股 今日` },
    { label: "技术形态", query: `${sectorName} 板块 技术分析 走势 ${day} 预测` },
    { label: "关联市场", query: `${sectorName} 产业链 上下游 商品 价格` },
  ],
  stock: ({ stockName, symbol, day }) => [
    { label: "公司资讯", query: `${stockName} ${symbol} 公司公告 新闻 资讯` },
    { label: "研报评级", query: `${stockName} 研报 券商 评级 目标价` },
    { label: "技术分析", query: `${stockName} 技术分析 支撑 压力 ${day} 走势` },
    { label: "资金动向", query: `${stockName} 主力资金 北向 大宗交易 龙虎榜` },
  ],
  overseas: () => [
    { label: "美股行情", query: "美股 道琼斯 纳斯达克 标普500 隔夜 收盘 涨跌" },
    { label: "港股行情", query: "港股 恒生指数 恒生科技 收盘 涨跌 今日" },
    { label: "中概股", query: "中概股 隔夜 纳斯达克金龙指数 涨跌 ADR" },
    { label: "美股板块", query: "美股 板块 涨幅 排名 领涨 行业 隔夜" },
    { label: "港股板块", query: "港股 板块 涨幅 排名 领涨 行业 今日" },
    { label: "外盘资讯", query: "美股 港股 财报 经济数据 美联储 资讯" },
    { label: "A股影响", query: "隔夜外盘 美股 港股 A股 影响 开盘 预判" },
  ],
};

async function searchWeb(query: string, num = 6) {
  const zai = await getZAI();
  return zai.functions.invoke("web_search", {
    query,
    num,
    recency_days: 2,
  });
}

// ── Step 2: Read full content from top articles ──
async function readArticleContent(url: string): Promise<string | null> {
  try {
    const zai = await getZAI();
    const result = await zai.functions.invoke("page_reader", { url });
    if (result?.data?.html) {
      // Extract plain text from HTML, limit to 1500 chars for efficiency
      const text = result.data.html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim();
      return text.slice(0, 1500);
    }
    return null;
  } catch {
    return null;
  }
}

// ── Step 3: Classify news source type ──
function classifySource(hostName: string): string {
  const map: [string, string][] = [
    // 券商/研报
    ["eastmoney", "券商研报"], ["10jqka", "券商研报"], ["stockstar", "券商研报"],
    // 财经媒体
    ["sina", "财经媒体"], ["finance.sina", "财经媒体"], ["cs.com.cn", "财经媒体"],
    ["caixin", "财经媒体"], ["yicai", "财经媒体"], ["stcn", "财经媒体"],
    ["21jingji", "财经媒体"], ["jjckb", "财经媒体"], ["ce.cn", "财经媒体"],
    ["thepaper", "财经媒体"], ["guancha", "财经媒体"],
    // 政策/官方
    ["gov.cn", "政策公告"], ["csrc", "政策公告"], ["pbc", "政策公告"],
    ["ndrc", "政策公告"], ["sse", "政策公告"], ["szse", "政策公告"],
    // 互动/自媒体
    ["xueqiu", "投资社区"], ["guba", "投资社区"], ["zhihu", "投资社区"],
    ["tonghuashun", "投资社区"], ["snowball", "投资社区"],
    // 外媒
    ["reuters", "外媒"], ["bloomberg", "外媒"], ["wsj", "外媒"],
    ["ft", "外媒"], ["cnbc", "外媒"], ["yahoo", "外媒"],
    ["investing", "外媒"],
  ];
  const lower = hostName.toLowerCase();
  for (const [key, label] of map) {
    if (lower.includes(key)) return label;
  }
  return "综合资讯";
}

// ── Step 4: Enhanced LLM analysis with multi-dimensional output ──
async function analyzeWithLLM(context: string, type: "market" | "sector" | "stock" | "overseas", day: string) {
  const zai = await getZAI();

  const systemPrompts: Record<string, string> = {
    market:
      `你是一位资深的A股大盘分析师，拥有20年实战经验。请根据提供的多源资讯，综合分析大盘${day}走势。
你需要从技术面、资金面、政策面、情绪面四个维度进行全方位评估。

返回JSON格式，包含以下字段：
- trend: ${day}走势预判（上升/下降/震荡）
- confidence: 信心度1-100
- summary: 100字以内的综合摘要
- keyFactors: 3-5个关键影响因素数组
- suggestion: ${day}做T建议（正T/反T(先卖再买)/观望）
- riskLevel: 风险等级（高/中/低）
- newsSentiment: 整体资讯情绪（偏多/偏空/中性）
- technicalView: 技术面观点（30字以内）
- capitalView: 资金面观点（30字以内）
- policyView: 政策/消息面观点（30字以内）
- sentimentView: 市场情绪面观点（30字以内）
- detailedReasoning: 详细分析推理过程（200字以内）

只返回JSON，不要其他文字。`,

    sector:
      `你是一位资深的A股行业板块分析师，拥有15年行业研究经验。请根据提供的多源资讯，综合分析该板块${day}走势。
你需要从技术面、资金面、政策面、行业基本面四个维度进行全方位评估。

返回JSON格式，包含以下字段：
- trend: ${day}走势预判（上升/下降/震荡）
- confidence: 信心度1-100
- summary: 100字以内的综合摘要
- keyFactors: 3-5个关键影响因素数组
- suggestion: ${day}做T建议（正T/反T(先卖再买)/观望）
- riskLevel: 风险等级（高/中/低）
- newsSentiment: 整体资讯情绪（偏多/偏空/中性）
- technicalView: 技术面观点（30字以内）
- capitalView: 资金面观点（30字以内）
- policyView: 政策/行业面观点（30字以内）
- sentimentView: 板块情绪面观点（30字以内）
- detailedReasoning: 详细分析推理过程（200字以内）

只返回JSON，不要其他文字。`,

    stock:
      `你是一位资深的A股个股分析师，拥有15年个股投研经验。请根据提供的多源资讯，综合分析该个股${day}走势。
你需要从技术面、资金面、消息面、估值面四个维度进行全方位评估。

返回JSON格式，包含以下字段：
- trend: ${day}走势预判（上升/下降/震荡）
- confidence: 信心度1-100
- summary: 100字以内的综合摘要
- keyFactors: 3-5个关键影响因素数组
- suggestion: ${day}做T建议（正T/反T(先卖再买)/观望）
- riskLevel: 风险等级（高/中/低）
- newsSentiment: 整体资讯情绪（偏多/偏空/中性）
- technicalView: 技术面观点（30字以内）
- capitalView: 资金面观点（30字以内）
- policyView: 消息/公告面观点（30字以内）
- sentimentView: 市场情绪面观点（30字以内）
- detailedReasoning: 详细分析推理过程（200字以内）

只返回JSON，不要其他文字。`,

    overseas:
      `你是一位资深的全球市场分析师，精通美股、港股与A股联动分析。请根据提供的多源资讯，综合分析隔夜美港股表现对A股${day}走势的影响。
你需要从美股走势、港股走势、资金流向、政策消息四个维度进行全方位评估。

返回JSON格式，包含以下字段：
- trend: A股${day}走势预判（上升/下降/震荡）
- confidence: 信心度1-100
- summary: 100字以内的综合摘要（需包含美股港股关键指数涨跌数据）
- keyFactors: 3-5个关键影响因素数组
- suggestion: ${day}做T建议（正T/反T(先卖再买)/观望）
- riskLevel: 风险等级（高/中/低）
- newsSentiment: 整体资讯情绪（偏多/偏空/中性）
- technicalView: 美股技术面观点（30字以内，含主要指数涨跌幅）
- capitalView: 港股及资金面观点（30字以内，含恒生指数涨跌幅）
- policyView: 政策/消息面观点（30字以内，含美联储、经济数据等）
- sentimentView: 外盘情绪面观点（30字以内，中概股、A50期指等）
- topSectors: 涨幅前五的美股/港股板块数组，每个元素包含 name(板块名称)、market(美股/港股)、change(涨跌幅如+2.35%)、driver(催动上涨的核心因素，15字以内)
- detailedReasoning: 详细分析推理过程（200字以内）

只返回JSON，不要其他文字。`,
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
      const parsed = JSON.parse(jsonMatch[0]);
      // Ensure all fields have defaults
      return {
        trend: parsed.trend || "震荡",
        confidence: parsed.confidence || 50,
        summary: parsed.summary || "",
        keyFactors: Array.isArray(parsed.keyFactors) ? parsed.keyFactors : ["资讯解析异常"],
        suggestion: parsed.suggestion || "观望",
        riskLevel: parsed.riskLevel || "中",
        newsSentiment: parsed.newsSentiment || "中性",
        technicalView: parsed.technicalView || "",
        capitalView: parsed.capitalView || "",
        policyView: parsed.policyView || "",
        sentimentView: parsed.sentimentView || "",
        topSectors: Array.isArray(parsed.topSectors) ? parsed.topSectors : [],
        detailedReasoning: parsed.detailedReasoning || "",
      };
    }
  } catch {}
  return {
    trend: "震荡",
    confidence: 50,
    summary: content.slice(0, 100),
    keyFactors: ["资讯解析异常"],
    suggestion: "观望",
    riskLevel: "中",
    newsSentiment: "中性",
    technicalView: "",
    capitalView: "",
    policyView: "",
    sentimentView: "",
    topSectors: [],
    detailedReasoning: "",
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol") || "";
    const type = (searchParams.get("type") || "market") as "market" | "sector" | "stock" | "overseas";
    const sectorName = searchParams.get("sectorName") || "";
    const stockName = searchParams.get("stockName") || "";
    const mode = searchParams.get("mode") || ""; // "incremental" for smart refresh
    const lastTimestamp = searchParams.get("lastTimestamp") || ""; // ISO string of last cached data's timestamp

    // Check cache
    const cacheKey = `${type}-${symbol}-${sectorName}-${getTodayKey()}`;
    const cached = cache.get(cacheKey);

    // ── Incremental mode: return cached data if fresh enough ──
    if (mode === "incremental") {
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        // Server cache is still valid
        if (lastTimestamp && new Date(cached.data.timestamp) <= new Date(lastTimestamp)) {
          // Client already has the latest data – no update needed
          return NextResponse.json({ success: true, noUpdate: true });
        }
        // Server has newer data than client – return it
        return NextResponse.json({ success: true, ...cached.data, cached: true });
      }
      // Server cache expired or missing – fall through to full pipeline
    } else {
      // Normal mode (full fetch or manual refresh)
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return NextResponse.json({ success: true, ...cached.data, cached: true });
      }
    }

    const { day } = getPredictionDay();
    const params = { sectorName, stockName, symbol, day };
    const queryGroups = SEARCH_QUERIES[type]?.(params) || SEARCH_QUERIES.market(params);

    // Step 1: Sequential multi-angle search (throttled to avoid 429 rate limits)
    const groups: { label: string; results: any[] }[] = [];
    for (const g of queryGroups) {
      try {
        const results = await searchWeb(g.query, 5);
        groups.push({ label: g.label, results: Array.isArray(results) ? results : [] });
      } catch {
        groups.push({ label: g.label, results: [] });
      }
      // Small delay between searches to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));
    }

    // Deduplicate by URL and collect all news with source labels
    const seenUrls = new Set<string>();
    const allNews: any[] = [];
    for (const group of groups) {
      for (const item of group.results) {
        if (!seenUrls.has(item.url)) {
          seenUrls.add(item.url);
          allNews.push({
            title: item.name,
            snippet: item.snippet,
            source: item.host_name,
            sourceType: classifySource(item.host_name),
            searchLabel: group.label,
            date: item.date,
            url: item.url,
          });
        }
      }
    }

    // Sort by date (newest first), keep top 10
    allNews.sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
    const topNews = allNews.slice(0, 10);

    // Step 2: Read full content from top 2 most relevant articles (sequential to avoid 429)
    const finalNews = [...topNews];
    for (let i = 0; i < Math.min(2, topNews.length); i++) {
      try {
        const content = await readArticleContent(topNews[i].url);
        if (content) finalNews[i] = { ...topNews[i], fullContent: content };
        await new Promise(r => setTimeout(r, 500));
      } catch {
        // Skip failed article reads
      }
    }

    // Step 3: Build comprehensive LLM context
    const newsContextByGroup: Record<string, string[]> = {};
    for (const item of finalNews) {
      const label = item.searchLabel;
      if (!newsContextByGroup[label]) newsContextByGroup[label] = [];
      let entry = `• ${item.title}\n  摘要: ${item.snippet}\n  来源: ${item.source}(${item.sourceType}) | ${item.date || "未知日期"}`;
      if (item.fullContent) {
        entry += `\n  详细内容: ${item.fullContent}`;
      }
      newsContextByGroup[label].push(entry);
    }

    const groupedContext = Object.entries(newsContextByGroup)
      .map(([label, items]) => `【${label}】\n${items.join("\n\n")}`)
      .join("\n\n");

    const contextMap: Record<string, string> = {
      market: `以下是A股大盘多渠道最新资讯：\n\n${groupedContext}\n\n请综合以上多源资讯，从技术面、资金面、政策面、情绪面四个维度，分析大盘${day}走势预判。`,
      sector: `以下是${sectorName}板块多渠道最新资讯：\n\n${groupedContext}\n\n请综合以上多源资讯，从技术面、资金面、政策面、行业基本面四个维度，分析${sectorName}板块${day}走势预判。`,
      stock: `以下是${stockName}(${symbol})多渠道最新资讯：\n\n${groupedContext}\n\n请综合以上多源资讯，从技术面、资金面、消息面、估值面四个维度，分析${stockName}${day}走势预判。`,
      overseas: `以下是隔夜美港股及外盘多渠道最新资讯：\n\n${groupedContext}\n\n请综合以上多源资讯，从美股走势、港股走势、资金流向、政策消息四个维度，分析隔夜外盘对A股${day}走势的影响预判。`,
    };

    // Step 4: LLM Analysis
    const analysis = await analyzeWithLLM(contextMap[type], type, day);

    // Step 5: Compile result with source diversity stats
    const sourceTypes = new Map<string, number>();
    for (const item of finalNews) {
      sourceTypes.set(item.sourceType, (sourceTypes.get(item.sourceType) || 0) + 1);
    }

    const result = {
      type,
      symbol,
      sectorName,
      predictionDay: day,
      news: finalNews.map(({ fullContent, ...rest }) => rest),
      analysis,
      sourceDiversity: Object.fromEntries(sourceTypes),
      searchGroups: queryGroups.map((g) => g.label),
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
