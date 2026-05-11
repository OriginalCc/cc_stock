import { NextRequest, NextResponse } from "next/server";

// ── Types ──────────────────────────────────────────────

interface SectorStock {
  symbol: string;
  name: string;
  exchange: string;
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
  marketCap: number;
  circulatingMarketCap: number;
  pe: number;
  mainNetInflow: number;
  volumeRatio: number;
  isST: boolean;
  isETF: boolean;
  board: string;
  recommendScore: number;
  recommendTag: string;
  recommendReason: string;
}

// ── Server-side Cache ──────────────────────────────────

const stocksCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 3 * 60 * 1000; // 3 minutes

// ── Board Detection ────────────────────────────────────

function getBoard(code: string): string {
  // 北交所: code starts with "8" or "4"
  if (code.startsWith("8") || code.startsWith("4")) return "北交所";
  // 创业板: code starts with "300" or "301"
  if (code.startsWith("300") || code.startsWith("301")) return "创业板";
  // 科创板: code starts with "688" or "689"
  if (code.startsWith("688") || code.startsWith("689")) return "科创板";
  // 沪市主板: 600xxx, 601xxx, 603xxx, 605xxx
  if (/^60[015]/.test(code)) return "主板";
  // 深市主板: 000xxx, 001xxx, 002xxx, 003xxx
  if (/^00[0123]/.test(code)) return "主板";
  return "其他";
}

function isMainBoard(code: string): boolean {
  return getBoard(code) === "主板";
}

// ── ST Detection ───────────────────────────────────────

function isSTStock(name: string): boolean {
  return /ST|\*ST|SST|S\*ST/.test(name);
}

// ── ETF Detection ──────────────────────────────────────

function isETFCode(code: string): boolean {
  return /^(51|56|58|15|16|18)/.test(code);
}

// ── Exchange Detection ─────────────────────────────────

function getExchange(code: string): string {
  if (code.startsWith("6") || code.startsWith("51") || code.startsWith("56") || code.startsWith("58")) return "SH";
  return "SZ";
}

// ── EastMoney API ──────────────────────────────────────

const EM_BASE = "http://push2delay.eastmoney.com";
const STOCK_FIELDS = "f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f14,f15,f16,f17,f18,f20,f21,f62";

async function fetchSectorStocks(sectorCode: string): Promise<any[]> {
  const url = `${EM_BASE}/api/qt/clist/get?pn=1&pz=200&po=1&np=1&fltt=2&invt=2&fid=f3&fs=b:${sectorCode}&fields=${STOCK_FIELDS}`;
  try {
    const resp = await fetch(url, { next: { revalidate: 0 }, signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return [];
    const data = await resp.json();
    const diff = data?.data?.diff;
    if (!Array.isArray(diff)) return [];
    return diff;
  } catch (e) {
    console.error("fetchSectorStocks error:", e);
    return [];
  }
}

// ── Parse Stock Data ───────────────────────────────────

function parseStockItem(item: any): SectorStock | null {
  const code = String(item.f12 || "");
  const name = String(item.f14 || "");

  if (!code || !name) return null;

  const price = parseFloat(item.f2) || 0;
  const changePercent = parseFloat(item.f3) || 0;
  const changeAmount = parseFloat(item.f4) || 0;
  const volume = parseFloat(item.f6) || 0;       // 成交额
  const turnover = parseFloat(item.f8) || 0;      // 换手率
  const amplitude = parseFloat(item.f7) || 0;     // 振幅
  const marketCap = parseFloat(item.f20) || 0;    // 总市值
  const circulatingMarketCap = parseFloat(item.f21) || 0; // 流通市值
  const pe = parseFloat(item.f9) || 0;            // 市盈率
  const mainNetInflow = parseFloat(item.f62) || 0; // 主力净流入
  const prevClose = price > 0 && changePercent !== 0 ? price / (1 + changePercent / 100) : price;
  const open = parseFloat(item.f17) || price;
  const high = parseFloat(item.f15) || price;
  const low = parseFloat(item.f16) || price;

  // Volume ratio approximation - not directly available, estimate from turnover
  // Volume ratio = today's turnover / average turnover (5-day)
  // Since we don't have average turnover, we'll use turnover as a proxy
  const volumeRatio = turnover > 0 ? Math.min(turnover / 3, 10) : 0; // Rough estimate

  const board = getBoard(code);
  const st = isSTStock(name);
  const etf = isETFCode(code);

  return {
    symbol: code,
    name,
    exchange: getExchange(code),
    price,
    prevClose: Number(prevClose.toFixed(2)),
    open,
    high,
    low,
    changePercent,
    changeAmount,
    volume,
    amount: volume, // EastMoney f6 is 成交额
    turnover,
    amplitude,
    marketCap,
    circulatingMarketCap,
    pe,
    mainNetInflow,
    volumeRatio: Number(volumeRatio.toFixed(1)),
    isST: st,
    isETF: etf,
    board,
    recommendScore: 0,
    recommendTag: "",
    recommendReason: "",
  };
}

// ── Scoring Engine ─────────────────────────────────────

interface ScoreFactor {
  score: number;
  tag: string;
  reason: string;
}

function scoreStock(
  stock: SectorStock,
  allStocks: SectorStock[],
  sectorChange: number
): ScoreFactor {
  let score = 50; // Base score
  let tag = "跟涨";
  const reasons: string[] = [];

  const inflowInYi = stock.mainNetInflow / 1e8;
  const isLeader = stock.changePercent >= sectorChange && stock.changePercent > 3;

  // ── Factor 1: Sector Leader (龙头) ──
  // Top performer in the sector by changePercent
  const sortedByChange = [...allStocks].sort((a, b) => b.changePercent - a.changePercent);
  const rank = sortedByChange.findIndex(s => s.symbol === stock.symbol);

  if (rank === 0 && stock.changePercent > 3) {
    score += 20;
    tag = "龙头";
    reasons.push("板块领涨龙头，涨幅居首");
  } else if (rank <= 2 && stock.changePercent > 2) {
    score += 12;
    if (tag === "跟涨") tag = "龙头";
    reasons.push("板块涨幅前三，龙头地位显著");
  }

  // ── Factor 2: Capital Positioning (资金蓄势) ──
  if (inflowInYi >= 1 && stock.changePercent < 3) {
    score += 15;
    if (tag !== "龙头") tag = "蓄势";
    reasons.push(`主力净流入${inflowInYi.toFixed(1)}亿，资金蓄势待发`);
  } else if (inflowInYi > 0.5 && stock.changePercent < 2) {
    score += 8;
    if (tag === "跟涨") tag = "蓄势";
    reasons.push("主力小幅流入，蓄势中");
  }

  // ── Factor 3: Catch-up Play (低位补涨) ──
  if (stock.changePercent < sectorChange * 0.3 && stock.changePercent > -1 && sectorChange > 1) {
    score += 12;
    if (tag === "跟涨") tag = "补涨";
    reasons.push("涨幅落后板块均值，补涨空间大");
  }

  // ── Factor 4: Volume Activity (量能活跃) ──
  if (stock.turnover >= 5) {
    score += 10;
    reasons.push(`换手率${stock.turnover.toFixed(1)}%，量能充沛`);
  } else if (stock.turnover >= 3) {
    score += 5;
    reasons.push("换手率较高，交投活跃");
  }

  // ── Factor 5: Turnover ──
  if (stock.volumeRatio >= 2) {
    score += 8;
    reasons.push(`量比${stock.volumeRatio.toFixed(1)}，放量明显`);
  } else if (stock.volumeRatio >= 1.5) {
    score += 4;
    reasons.push("量比偏高，关注放量");
  }

  // ── Factor 6: Trend Alignment ──
  if (stock.changePercent > 0 && sectorChange > 0) {
    score += 5;
    reasons.push("与板块趋势一致");
  }

  // ── Factor 7: Price Near High ──
  if (stock.amplitude > 0 && stock.changePercent > 0) {
    const nearHighRatio = (stock.price - stock.low) / (stock.high - stock.low || 1);
    if (nearHighRatio > 0.8) {
      score += 5;
      reasons.push("价格接近日内高点，强势特征");
    }
  }

  // ── Penalties ──

  // ST penalty
  if (stock.isST) {
    score -= 20;
    reasons.push("ST个股，风险较大");
  }

  // Low liquidity penalty
  if (stock.turnover < 0.5 && stock.turnover > 0) {
    score -= 10;
    reasons.push("流动性偏低");
  }

  // Market cap preference (mid-cap preferred)
  const capInYi = stock.marketCap / 1e8;
  if (capInYi >= 100 && capInYi <= 1000) {
    score += 5;
    reasons.push("中盘股，弹性较好");
  } else if (capInYi >= 50 && capInYi < 100) {
    score += 3;
  } else if (capInYi > 5000) {
    score -= 3;
    reasons.push("大盘股，弹性偏弱");
  } else if (capInYi < 30) {
    score -= 5;
    reasons.push("小盘股，波动风险较大");
  }

  // Negative change penalty
  if (stock.changePercent < -3) {
    score -= 10;
  } else if (stock.changePercent < -1) {
    score -= 5;
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    tag,
    reason: reasons.join("；"),
  };
}

// ── GET Handler ────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sectorCode = searchParams.get("sectorCode") || "";
  const sectorName = searchParams.get("sectorName") || "";
  const sectorChange = parseFloat(searchParams.get("sectorChange") || "0");
  const refresh = searchParams.get("refresh") === "1";
  const maxResults = parseInt(searchParams.get("maxResults") || "10");

  if (!sectorCode) {
    return NextResponse.json(
      { success: false, error: "sectorCode is required", stocks: [] },
      { status: 400 }
    );
  }

  // Check cache
  const cacheKey = `${sectorCode}|${maxResults}`;
  if (!refresh) {
    const cached = stocksCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json(cached.data);
    }
  }

  try {
    const rawStocks = await fetchSectorStocks(sectorCode);

    // Parse and filter
    const allParsed: SectorStock[] = [];
    for (const item of rawStocks) {
      const stock = parseStockItem(item);
      if (!stock) continue;

      // Skip ETF
      if (stock.isETF) continue;

      // Skip non-main board stocks
      if (!isMainBoard(stock.symbol)) continue;

      allParsed.push(stock);
    }

    // Score each stock
    for (const stock of allParsed) {
      const result = scoreStock(stock, allParsed, sectorChange);
      stock.recommendScore = result.score;
      stock.recommendTag = result.tag;
      stock.recommendReason = result.reason;
    }

    // Sort by score descending
    const rankedStocks = allParsed
      .sort((a, b) => b.recommendScore - a.recommendScore)
      .slice(0, maxResults);

    const result = {
      success: true,
      sectorCode,
      sectorName,
      sectorChange,
      stocks: rankedStocks,
      total: allParsed.length,
      timestamp: new Date().toISOString(),
    };

    // Update cache
    stocksCache.set(cacheKey, { data: result, timestamp: Date.now() });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Sector stocks API error:", error);
    return NextResponse.json(
      {
        success: false,
        sectorCode,
        sectorName,
        sectorChange,
        stocks: [],
        total: 0,
        error: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
