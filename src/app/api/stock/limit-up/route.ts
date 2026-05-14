import { NextRequest, NextResponse } from "next/server";
import { getCachedTimeline, setCachedTimeline } from "@/lib/server-timeline-cache";

export const dynamic = "force-dynamic";

// ── Server-side Cache ───────────────────────────────────
const cache = new Map<string, { data: LimitUpResult; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getTodayKey(): string {
  const now = new Date();
  const china = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
  return `${china.getFullYear()}-${String(china.getMonth() + 1).padStart(2, "0")}-${String(china.getDate()).padStart(2, "0")}`;
}

// ── Types ──────────────────────────────────────────────

interface LimitUpResult {
  success: boolean;
  date: string;
  sectors: SectorAnalysis[];
  timestamp: string;
  cached?: boolean;
  error?: string;
}

interface SectorAnalysis {
  sectorCode: string;
  sectorName: string;
  sectorChangePercent: number;
  limitUpCount: number;
  totalStocks: number;
  stocks: LimitUpStock[];
  newsAnalysis: {
    driver: string;
    catalysts: string[];
    outlook: string;
    keyEvents: string[];
  };
}

interface LimitUpStock {
  symbol: string;
  name: string;
  exchange: string;
  price: number;
  prevClose: number;
  changePercent: number;
  turnover: number;
  marketCap: number;
  mainNetInflow: number;
  // Technical analysis
  lockTime: string; // 封板时间 "09:32" or "--"
  lockStrength: number; // 封板强度 0-100
  breakCount: number; // 开板次数
  volumeRatio: number; // 量比
  limitUpType: string; // 一字板/秒板/早板/午板/尾板
  consecutiveDays: number; // 连板天数
  amplitude: number; // 振幅
  pe: number;
  pulseDetail: string; // 封板详情描述
}

// ── ZAI SDK Instance ────────────────────────────────────
let zaiInstance: any = null;
async function getZAI() {
  if (!zaiInstance) {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

// ── Step 1: Get Top Hot Sectors ────────────────────────

interface HotSector {
  code: string;
  name: string;
  changePercent: number;
  price: number;
}

async function getTopHotSectors(topN: number = 3): Promise<HotSector[]> {
  try {
    const url = `http://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=${topN}&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:2&fields=f2,f3,f4,f12,f14`;
    const resp = await fetch(url, {
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) return [];

    const data = await resp.json();
    const diff = data?.data?.diff;
    if (!Array.isArray(diff) || diff.length === 0) return [];

    return diff
      .map((item: any) => ({
        code: String(item.f12 || ""),
        name: String(item.f14 || ""),
        changePercent: parseFloat(item.f3) || 0,
        price: parseFloat(item.f2) || 0,
      }))
      .filter((s) => s.code && s.name && s.changePercent > 0)
      .slice(0, topN);
  } catch (error) {
    console.error("Get top hot sectors error:", error);
    return [];
  }
}

// ── Step 2: Get Limit-Up Stocks for a Sector ───────────

interface RawStockData {
  code: string;
  name: string;
  price: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  changePercent: number;
  changeAmount: number;
  volume: number;
  amount: number;
  turnover: number;
  amplitude: number;
  pe: number;
  marketCap: number;
  circulatingMarketCap: number;
  mainNetInflow: number;
  f128: number; // 量比 (if available)
  f136: number;
  f140: number;
  f141: number;
}

async function getSectorStocks(sectorCode: string): Promise<{ stocks: RawStockData[]; total: number }> {
  const allStocks: RawStockData[] = [];
  let total = 0;
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= 5) {
    try {
      const url = `http://push2.eastmoney.com/api/qt/clist/get?pn=${page}&pz=50&po=1&np=1&fltt=2&invt=2&fid=f3&fs=b:${sectorCode}&fields=f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f14,f15,f16,f17,f18,f20,f21,f23,f24,f25,f26,f22,f11,f62,f128,f140,f141,f136`;
      const resp = await fetch(url, {
        next: { revalidate: 0 },
        signal: AbortSignal.timeout(15000),
      });

      if (!resp.ok) break;

      const data = await resp.json();
      const diff = data?.data?.diff;
      total = data?.data?.total || 0;

      if (!Array.isArray(diff) || diff.length === 0) {
        hasMore = false;
        break;
      }

      for (const s of diff) {
        const code = String(s.f12 || "");
        const name = String(s.f14 || "");
        const price = parseFloat(s.f2) || 0;
        const prevClose = parseFloat(s.f18) || 0;
        const open = parseFloat(s.f17) || 0;

        if (price <= 0 || prevClose <= 0) continue;

        allStocks.push({
          code,
          name,
          price,
          prevClose,
          open,
          high: parseFloat(s.f15) || 0,
          low: parseFloat(s.f16) || 0,
          changePercent: parseFloat(s.f3) || 0,
          changeAmount: parseFloat(s.f4) || 0,
          volume: parseFloat(s.f5) || 0,
          amount: parseFloat(s.f6) || 0,
          amplitude: parseFloat(s.f7) || 0,
          turnover: parseFloat(s.f8) || 0,
          pe: parseFloat(s.f9) || 0,
          marketCap: parseFloat(s.f20) || 0,
          circulatingMarketCap: parseFloat(s.f21) || 0,
          mainNetInflow: parseFloat(s.f62) || 0,
          f128: parseFloat(s.f128) || 0,
          f136: parseFloat(s.f136) || 0,
          f140: parseFloat(s.f140) || 0,
          f141: parseFloat(s.f141) || 0,
        });
      }

      if (allStocks.length >= total || diff.length < 50) {
        hasMore = false;
      } else {
        page++;
      }
    } catch (error) {
      console.error(`Get sector stocks page ${page} error:`, error);
      hasMore = false;
    }
  }

  return { stocks: allStocks, total };
}

// ── Stock Classification Helpers ───────────────────────

function isETF(code: string): boolean {
  return (
    code.startsWith("51") ||
    code.startsWith("56") ||
    code.startsWith("58") ||
    code.startsWith("15") ||
    code.startsWith("16") ||
    code.startsWith("18")
  );
}

function isST(name: string): boolean {
  return /ST|\\*ST|SST|S\\*ST/.test(name.toUpperCase());
}

function isBSE(code: string): boolean {
  return code.startsWith("8") || code.startsWith("4");
}

function isChiNext(code: string): boolean {
  return code.startsWith("300") || code.startsWith("301");
}

function isSTAR(code: string): boolean {
  return code.startsWith("688") || code.startsWith("689");
}

/**
 * Get the limit-up threshold percentage for a stock
 * Main board: 10%, ChiNext/STAR: 20%
 */
function getLimitUpPercent(code: string): number {
  if (isChiNext(code) || isSTAR(code)) return 20;
  return 10;
}

/**
 * Check if a stock is at limit-up today
 * Main board: >= 9.9% (allow for floating point), ChiNext/STAR: >= 19.9%
 */
function isLimitUp(changePercent: number, code: string): boolean {
  const threshold = getLimitUpPercent(code);
  // Use 0.1% margin to account for floating point / display rounding
  return changePercent >= threshold - 0.1;
}

/**
 * Calculate the limit-up price given prevClose and board type
 */
function getLimitUpPrice(prevClose: number, code: string): number {
  const pct = getLimitUpPercent(code) / 100;
  // Chinese market rounds limit-up price to 2 decimal places (toward nearest)
  return Math.round(prevClose * (1 + pct) * 100) / 100;
}

// ── Step 3: Technical Analysis via Timeline ────────────

interface TimelinePoint {
  time: string; // "09:30"
  price: number;
  volume: number;
}

async function getStockTimeline(symbol: string): Promise<TimelinePoint[]> {
  // Check shared cache first
  const cached = getCachedTimeline(symbol);
  if (cached) return cached;

  try {
    // Convert to Sina/Tencent format
    let sinaSymbol: string;
    if (symbol.startsWith("6")) {
      sinaSymbol = `sh${symbol}`;
    } else {
      sinaSymbol = `sz${symbol}`;
    }

    const url = `https://web.ifzq.gtimg.cn/appstock/app/minute/query?_var=min_data&code=${sinaSymbol}`;
    const resp = await fetch(url, {
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(5000),
    });

    if (!resp.ok) return [];

    const text = await resp.text();
    if (!text) return [];

    const jsonStr = text.replace(/^min_data=/, "");
    const data = JSON.parse(jsonStr);
    const stockData = data?.data?.[sinaSymbol]?.data?.data;
    if (!Array.isArray(stockData)) return [];

    const result = stockData
      .filter((entry: any) => typeof entry === "string")
      .map((entry: string) => {
        const parts = entry.split(" ");
        if (parts.length < 4) return null;
        const timeRaw = parts[0];
        const price = parseFloat(parts[1]);
        const cumVol = parseInt(parts[2]);
        if (isNaN(price) || price <= 0) return null;
        return {
          time: `${timeRaw.substring(0, 2)}:${timeRaw.substring(2, 4)}`,
          price,
          volume: cumVol,
        };
      })
      .filter(Boolean) as TimelinePoint[];

    // Store in shared cache after successful fetch
    if (result.length > 0) {
      setCachedTimeline(symbol, result);
    }
    return result;
  } catch (error) {
    return [];
  }
}

interface TechnicalAnalysis {
  lockTime: string; // "09:32" or "--"
  lockStrength: number; // 0-100
  breakCount: number; // 开板次数
  limitUpType: string; // 一字板/秒板/早板/午板/尾板
  consecutiveDays: number;
  volumeRatio: number;
  pulseDetail: string;
}

/**
 * Analyze limit-up technical characteristics from timeline data
 */
function analyzeLimitUpTechnical(
  timeline: TimelinePoint[],
  stock: RawStockData
): TechnicalAnalysis {
  const limitUpPrice = getLimitUpPrice(stock.prevClose, stock.code);
  const result: TechnicalAnalysis = {
    lockTime: "--",
    lockStrength: 0,
    breakCount: 0,
    limitUpType: "未知",
    consecutiveDays: 1,
    volumeRatio: stock.f128 || 0,
    pulseDetail: "",
  };

  if (!timeline || timeline.length < 2) {
    // No timeline data – try to infer from basic data
    if (stock.open >= limitUpPrice && stock.high <= limitUpPrice) {
      result.limitUpType = "一字板";
      result.lockTime = "09:25";
      result.lockStrength = 100;
      result.breakCount = 0;
      result.pulseDetail = "开盘一字涨停，全天未开板";
    } else {
      result.pulseDetail = "分时数据不足，无法分析封板详情";
    }
    return result;
  }

  // ── Check for 一字板 (one-character board): open = high = limit-up price ──
  if (stock.open >= limitUpPrice && stock.high <= limitUpPrice && stock.low >= limitUpPrice) {
    result.limitUpType = "一字板";
    result.lockTime = "09:25";
    result.lockStrength = 100;
    result.breakCount = 0;
    result.pulseDetail = "开盘一字涨停，全天未开板";
    return result;
  }

  // ── Find first time price reached limit-up ──
  let firstLockIdx = -1;
  for (let i = 0; i < timeline.length; i++) {
    if (timeline[i].price >= limitUpPrice) {
      firstLockIdx = i;
      break;
    }
  }

  if (firstLockIdx === -1) {
    // Price never reached limit-up in timeline (might have reached between minutes)
    result.pulseDetail = "分时未显示涨停价，可能盘中触及";
    return result;
  }

  result.lockTime = timeline[firstLockIdx].time;

  // ── Count break times (开板次数) ──
  let breakCount = 0;
  let wasAtLimit = true;
  for (let i = firstLockIdx + 1; i < timeline.length; i++) {
    const atLimit = timeline[i].price >= limitUpPrice;
    if (wasAtLimit && !atLimit) {
      breakCount++;
    }
    wasAtLimit = atLimit;
  }

  result.breakCount = breakCount;

  // ── Calculate lock strength (封板强度) ──
  // Ratio of minutes at or above limit-up price vs total trading minutes after first lock
  const totalMinutesAfterLock = timeline.length - firstLockIdx;
  if (totalMinutesAfterLock > 0) {
    const minutesAtLimit = timeline.slice(firstLockIdx).filter((t) => t.price >= limitUpPrice).length;
    result.lockStrength = Math.round((minutesAtLimit / totalMinutesAfterLock) * 100);
  }

  // ── Determine limit-up type based on lock time ──
  const lockHour = parseInt(result.lockTime.split(":")[0]);
  const lockMinute = parseInt(result.lockTime.split(":")[1]);

  if (firstLockIdx <= 5) {
    // Locked within first 5 minutes
    result.limitUpType = "秒板";
  } else if (lockHour < 10 || (lockHour === 10 && lockMinute < 30)) {
    result.limitUpType = "早板";
  } else if (lockHour < 13 || (lockHour === 13 && lockMinute < 30)) {
    result.limitUpType = "午板";
  } else if (lockHour >= 14) {
    result.limitUpType = "尾板";
  } else {
    result.limitUpType = "午板"; // default for 13:30-14:00
  }

  // ── Build pulse detail string ──
  const details: string[] = [];
  details.push(`${result.lockTime}封板`);

  if (breakCount === 0) {
    details.push("未开板");
  } else {
    details.push(`开板${breakCount}次`);
  }

  details.push(`封板强度${result.lockStrength}%`);

  if (result.volumeRatio > 0) {
    details.push(`量比${result.volumeRatio.toFixed(1)}`);
  }

  result.pulseDetail = details.join("，");

  return result;
}

/**
 * Estimate consecutive limit-up days from daily K-line data
 */
async function estimateConsecutiveDays(symbol: string, currentChangePercent: number): Promise<number> {
  if (currentChangePercent < 9.9) return 1;

  try {
    const sinaSymbol = symbol.startsWith("6") ? `sh${symbol}` : `sz${symbol}`;
    const url = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${sinaSymbol}&scale=240&ma=no&datalen=10`;
    const resp = await fetch(url, {
      headers: { Referer: "https://finance.sina.com.cn" },
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(5000),
    });

    if (!resp.ok) return 1;

    const text = await resp.text();
    if (!text || text === "null") return 1;

    const data = JSON.parse(text);
    if (!Array.isArray(data) || data.length < 2) return 1;

    const limitPct = isChiNext(symbol) || isSTAR(symbol) ? 19.9 : 9.9;

    // Count consecutive limit-up days from the most recent
    let count = 1; // Today counts as 1
    for (let i = data.length - 2; i >= 0; i--) {
      const close = parseFloat(data[i].close) || 0;
      const prevClose = i > 0 ? parseFloat(data[i - 1].close) || 0 : 0;

      if (prevClose > 0 && close > 0) {
        const pctChange = ((close - prevClose) / prevClose) * 100;
        if (pctChange >= limitPct) {
          count++;
        } else {
          break;
        }
      } else {
        break;
      }
    }

    return count;
  } catch {
    return 1;
  }
}

// ── Step 4: News/Sentiment Analysis ────────────────────

async function searchWeb(query: string, num: number = 6) {
  const zai = await getZAI();
  return zai.functions.invoke("web_search", {
    query,
    num,
    recency_days: 2,
  });
}

async function readArticleContent(url: string): Promise<string | null> {
  try {
    const zai = await getZAI();
    const result = await zai.functions.invoke("page_reader", { url });
    if (result?.data?.html) {
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

interface NewsAnalysisResult {
  driver: string;
  catalysts: string[];
  outlook: string;
  keyEvents: string[];
}

async function analyzeSectorNews(
  sectorName: string,
  sectorChangePercent: number,
  limitUpStocks: { name: string; symbol: string; changePercent: number; lockTime: string; limitUpType: string }[]
): Promise<NewsAnalysisResult> {
  const defaultResult: NewsAnalysisResult = {
    driver: `${sectorName}板块今日大涨${sectorChangePercent.toFixed(2)}%，${limitUpStocks.length}股涨停`,
    catalysts: limitUpStocks.slice(0, 5).map((s) => `${s.name}涨停`),
    outlook: "需关注后续资金跟进情况",
    keyEvents: [],
  };

  try {
    // Search for sector news and catalysts
    const stockNames = limitUpStocks.slice(0, 5).map((s) => s.name).join("、");
    const queries = [
      { label: "板块驱动", query: `${sectorName}板块 涨停 利好 驱动 政策 资讯` },
      { label: "个股催化", query: `${stockNames} 涨停 催化 利好 公告 新闻` },
      { label: "行业趋势", query: `${sectorName} 行业趋势 产业链 投资逻辑 资金` },
    ];

    const searchPromises = queries.map(async (q) => {
      try {
        const results = await searchWeb(q.query, 4);
        return { label: q.label, results: Array.isArray(results) ? results : [] };
      } catch {
        return { label: q.label, results: [] };
      }
    });

    const searchGroupResults = await Promise.allSettled(searchPromises);
    const groups = searchGroupResults
      .filter((r): r is PromiseFulfilledResult<{ label: string; results: any[] }> => r.status === "fulfilled")
      .map((r) => r.value);

    // Deduplicate by URL
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
            searchLabel: group.label,
            url: item.url,
          });
        }
      }
    }

    // Read top 2 articles for more context
    const articleReadPromises = allNews.slice(0, 2).map(async (item) => {
      const content = await readArticleContent(item.url);
      return { ...item, fullContent: content };
    });
    const enrichedResults = await Promise.allSettled(articleReadPromises);
    const finalNews = allNews.map((item, i) => {
      if (i < 2) {
        const settled = enrichedResults[i];
        if (settled.status === "fulfilled" && settled.value.fullContent) {
          return { ...item, fullContent: settled.value.fullContent };
        }
      }
      return item;
    });

    // Build LLM context
    const newsByGroup: Record<string, string[]> = {};
    for (const item of finalNews) {
      const label = item.searchLabel;
      if (!newsByGroup[label]) newsByGroup[label] = [];
      let entry = `• ${item.title}\n  摘要: ${item.snippet}\n  来源: ${item.source}`;
      if (item.fullContent) {
        entry += `\n  详细: ${item.fullContent}`;
      }
      newsByGroup[label].push(entry);
    }

    const groupedContext = Object.entries(newsByGroup)
      .map(([label, items]) => `【${label}】\n${items.join("\n\n")}`)
      .join("\n\n");

    const stocksInfo = limitUpStocks
      .slice(0, 8)
      .map((s) => `${s.name}(${s.symbol}) 涨幅${s.changePercent.toFixed(2)}% ${s.limitUpType} ${s.lockTime !== "--" ? s.lockTime + "封板" : ""}`)
      .join("\n");

    const context = `以下是${sectorName}板块涨停分析相关资讯：

板块概况：${sectorName}板块今日涨${sectorChangePercent.toFixed(2)}%，共${limitUpStocks.length}只个股涨停。

涨停个股：
${stocksInfo}

${groupedContext}

请综合以上资讯，分析${sectorName}板块今日涨停的驱动因素、个股催化因素和后市展望。`;

    const zai = await getZAI();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "assistant",
          content: `你是一位资深的A股涨停板分析专家，擅长分析板块涨停潮的驱动逻辑和后市演绎。
请根据提供的板块和个股信息及新闻资讯，综合分析该板块涨停的驱动因素。

返回JSON格式，包含以下字段：
- driver: 板块涨停核心驱动因素（50字以内，点明核心逻辑）
- catalysts: 个股催化因素数组（3-5个，每个20字以内）
- outlook: 后市展望（80字以内，包含风险提示）
- keyEvents: 关键事件数组（2-4个近期重要事件，每个15字以内）

只返回JSON，不要其他文字。`,
        },
        { role: "user", content: context },
      ],
      thinking: { type: "disabled" },
    });

    const content = completion.choices[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        driver: parsed.driver || defaultResult.driver,
        catalysts: Array.isArray(parsed.catalysts) ? parsed.catalysts : defaultResult.catalysts,
        outlook: parsed.outlook || defaultResult.outlook,
        keyEvents: Array.isArray(parsed.keyEvents) ? parsed.keyEvents : defaultResult.keyEvents,
      };
    }
  } catch (error) {
    console.error("News analysis error:", error);
  }

  return defaultResult;
}

// ── Main Handler ────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const forceRefresh = searchParams.get("refresh") === "1";
  const todayKey = getTodayKey();

  // Check cache
  const cacheKey = `limit-up-${todayKey}`;
  if (!forceRefresh) {
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json({ ...cached.data, cached: true });
    }
  }

  const sectorResults: SectorAnalysis[] = [];
  const errors: string[] = [];

  try {
    // ── Step 1: Get top 3 hot sectors ──
    const topSectors = await getTopHotSectors(3);

    if (topSectors.length === 0) {
      const result: LimitUpResult = {
        success: false,
        date: todayKey,
        sectors: [],
        timestamp: new Date().toISOString(),
        error: "未能获取热门板块数据，可能非交易时段或接口异常",
      };
      return NextResponse.json(result);
    }

    // ── Step 2 & 3: For each sector, get stocks and analyze ──
    for (const sector of topSectors) {
      try {
        const { stocks: allStocks, total: totalStocks } = await getSectorStocks(sector.code);

        // Filter for limit-up stocks
        const limitUpRaw = allStocks.filter((s) => {
          // Skip ETFs, ST, BSE
          if (isETF(s.code)) return false;
          if (isST(s.name)) return false;
          if (isBSE(s.code)) return false;
          // Must be at limit-up
          return isLimitUp(s.changePercent, s.code);
        });

        if (limitUpRaw.length === 0) {
          sectorResults.push({
            sectorCode: sector.code,
            sectorName: sector.name,
            sectorChangePercent: sector.changePercent,
            limitUpCount: 0,
            totalStocks,
            stocks: [],
            newsAnalysis: {
              driver: `${sector.name}板块今日涨${sector.changePercent.toFixed(2)}%，无个股涨停`,
              catalysts: [],
              outlook: "板块上涨但无涨停股，跟涨性质较多",
              keyEvents: [],
            },
          });
          continue;
        }

        // ── Step 3: Technical analysis for each limit-up stock ──
        const limitUpStocks: LimitUpStock[] = [];
        const batchSize = 10;

        for (let i = 0; i < limitUpRaw.length; i += batchSize) {
          const batch = limitUpRaw.slice(i, i + batchSize);

          const batchPromises = batch.map(async (stock) => {
            try {
              const timeline = await getStockTimeline(stock.code);
              const tech = analyzeLimitUpTechnical(timeline, stock);

              // Estimate consecutive days (only for top stocks to save API calls)
              let consecutiveDays = 1;
              if (limitUpRaw.indexOf(stock) < 10) {
                consecutiveDays = await estimateConsecutiveDays(stock.code, stock.changePercent);
              }

              // Calculate volume ratio
              let volumeRatio = stock.f128;
              if (!volumeRatio || volumeRatio <= 0) {
                // Estimate: if today's turnover is significantly higher than average
                // Use a rough heuristic based on turnover rate
                volumeRatio = stock.turnover > 5 ? stock.turnover / 3 : stock.turnover > 2 ? 1.5 : 1;
              }

              return {
                symbol: stock.code,
                name: stock.name,
                exchange: stock.code.startsWith("6") ? "SH" : "SZ",
                price: stock.price,
                prevClose: stock.prevClose,
                changePercent: stock.changePercent,
                turnover: stock.turnover,
                marketCap: stock.marketCap,
                mainNetInflow: stock.mainNetInflow,
                lockTime: tech.lockTime,
                lockStrength: tech.lockStrength,
                breakCount: tech.breakCount,
                volumeRatio: Math.round(volumeRatio * 10) / 10,
                limitUpType: tech.limitUpType,
                consecutiveDays,
                amplitude: stock.amplitude,
                pe: stock.pe,
                pulseDetail: tech.pulseDetail,
              } as LimitUpStock;
            } catch (error) {
              // Return basic info even if timeline analysis fails
              return {
                symbol: stock.code,
                name: stock.name,
                exchange: stock.code.startsWith("6") ? "SH" : "SZ",
                price: stock.price,
                prevClose: stock.prevClose,
                changePercent: stock.changePercent,
                turnover: stock.turnover,
                marketCap: stock.marketCap,
                mainNetInflow: stock.mainNetInflow,
                lockTime: "--",
                lockStrength: 0,
                breakCount: 0,
                volumeRatio: stock.f128 || 0,
                limitUpType: "未知",
                consecutiveDays: 1,
                amplitude: stock.amplitude,
                pe: stock.pe,
                pulseDetail: "分析失败",
              } as LimitUpStock;
            }
          });

          const batchResults = await Promise.allSettled(batchPromises);
          for (const r of batchResults) {
            if (r.status === "fulfilled" && r.value) {
              limitUpStocks.push(r.value);
            }
          }
        }

        // Sort: by lock strength desc, then by consecutive days desc, then by lock time asc
        limitUpStocks.sort((a, b) => {
          // 一字板 first
          const typeOrder: Record<string, number> = { "一字板": 0, "秒板": 1, "早板": 2, "午板": 3, "尾板": 4, "未知": 5 };
          const typeDiff = (typeOrder[a.limitUpType] ?? 5) - (typeOrder[b.limitUpType] ?? 5);
          if (typeDiff !== 0) return typeDiff;

          // Then by consecutive days desc
          if (b.consecutiveDays !== a.consecutiveDays) return b.consecutiveDays - a.consecutiveDays;

          // Then by lock strength desc
          if (b.lockStrength !== a.lockStrength) return b.lockStrength - a.lockStrength;

          // Then by change percent desc
          return b.changePercent - a.changePercent;
        });

        // ── Step 4: News analysis for the sector ──
        let newsAnalysis;
        try {
          newsAnalysis = await analyzeSectorNews(
            sector.name,
            sector.changePercent,
            limitUpStocks.map((s) => ({
              name: s.name,
              symbol: s.symbol,
              changePercent: s.changePercent,
              lockTime: s.lockTime,
              limitUpType: s.limitUpType,
            }))
          );
        } catch (error) {
          console.error(`News analysis for ${sector.name} error:`, error);
          newsAnalysis = {
            driver: `${sector.name}板块今日涨${sector.changePercent.toFixed(2)}%，${limitUpStocks.length}股涨停`,
            catalysts: limitUpStocks.slice(0, 5).map((s) => `${s.name}涨停`),
            outlook: "分析异常，请手动查看相关资讯",
            keyEvents: [],
          };
        }

        sectorResults.push({
          sectorCode: sector.code,
          sectorName: sector.name,
          sectorChangePercent: sector.changePercent,
          limitUpCount: limitUpStocks.length,
          totalStocks,
          stocks: limitUpStocks,
          newsAnalysis,
        });
      } catch (error: any) {
        console.error(`Sector ${sector.name} analysis error:`, error);
        errors.push(`${sector.name}: ${error.message || "分析失败"}`);
        // Push partial result for this sector
        sectorResults.push({
          sectorCode: sector.code,
          sectorName: sector.name,
          sectorChangePercent: sector.changePercent,
          limitUpCount: 0,
          totalStocks: 0,
          stocks: [],
          newsAnalysis: {
            driver: `${sector.name}板块分析异常`,
            catalysts: [],
            outlook: "分析失败，请稍后重试",
            keyEvents: [],
          },
        });
      }
    }

    const result: LimitUpResult = {
      success: true,
      date: todayKey,
      sectors: sectorResults,
      timestamp: new Date().toISOString(),
      ...(errors.length > 0 ? { error: errors.join("; ") } : {}),
    };

    // Cache the result
    cache.set(cacheKey, { data: result, timestamp: Date.now() });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Limit-up analysis error:", error);

    // Return partial results if we have any
    if (sectorResults.length > 0) {
      const result: LimitUpResult = {
        success: true,
        date: todayKey,
        sectors: sectorResults,
        timestamp: new Date().toISOString(),
        error: `部分分析异常: ${error.message || "未知错误"}`,
      };
      return NextResponse.json(result);
    }

    return NextResponse.json(
      {
        success: false,
        date: todayKey,
        sectors: [],
        timestamp: new Date().toISOString(),
        error: error.message || "涨停分析失败",
      } as LimitUpResult,
      { status: 500 }
    );
  }
}
