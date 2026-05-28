/**
 * A-Share (大A) Stock Data API
 * Uses Sina Finance API for historical/timeline data
 * Uses Tencent Stock API for real-time quotes with Chinese names
 */

// ── Types ──────────────────────────────────────────────

export interface AShareQuote {
  symbol: string;        // e.g. "600519"
  fullSymbol: string;    // e.g. "sh600519"
  name: string;          // Chinese name, e.g. "贵州茅台"
  price: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  close: number;
  change: number;
  changePercent: number;
  volume: number;        // 手 (lots)
  amount: number;        // 金额
  turnover: number;      // 换手率
  pe: number;
  marketCap: number;     // 亿元
  circulatingMarketCap: number;
  bidPrice: number;
  askPrice: number;
  bidVolume: number;
  askVolume: number;
  high52week: number;
  low52week: number;
  exchange: string;      // "SH" or "SZ"
}

export interface AShareKLineItem {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface AShareTimelineItem {
  time: string;       // "09:30", "09:31", etc. (1-minute interval)
  price: number;
  avgPrice: number;    // VWAP
  volume: number;
  changePercent: number; // vs prev close
}

// ── Helpers ────────────────────────────────────────────

/**
 * Convert stock code to Sina format
 * 6xxxxx -> sh6xxxxx (Shanghai)
 * 0xxxxx/3xxxxx -> sz0xxxxx/sz3xxxxx (Shenzhen)
 */
export function toSinaSymbol(code: string): string {
  const clean = code.replace(/\.(SS|SZ|ss|sz)$/, "");
  // If exchange suffix was explicitly provided, respect it
  if (/\.SS$/i.test(code)) return `sh${clean}`;
  if (/\.SZ$/i.test(code)) return `sz${clean}`;
  // Auto-detect from code prefix
  if (clean.startsWith("6")) return `sh${clean}`;   // Shanghai A-share
  if (clean.startsWith("51")) return `sh${clean}`; // Shanghai ETF (51xxxx)
  if (clean.startsWith("56")) return `sh${clean}`; // Shanghai ETF (56xxxx)
  if (clean.startsWith("58")) return `sh${clean}`; // Shanghai ETF (58xxxx)
  if (clean.startsWith("0") || clean.startsWith("3")) return `sz${clean}`;  // Shenzhen A-share
  if (clean.startsWith("15")) return `sz${clean}`; // Shenzhen ETF (15xxxx)
  if (clean.startsWith("16")) return `sz${clean}`; // Shenzhen ETF (16xxxx)
  if (clean.startsWith("18")) return `sz${clean}`; // Shenzhen ETF (18xxxx)
  // Default: try with sh prefix
  return `sh${clean}`;
}

/**
 * Convert stock code to Yahoo Finance format
 */
export function toYahooSymbol(code: string): string {
  const clean = code.replace(/\.(SS|SZ|ss|sz)$/, "");
  if (clean.startsWith("6") || clean.startsWith("51") || clean.startsWith("56") || clean.startsWith("58")) return `${clean}.SS`;
  if (clean.startsWith("0") || clean.startsWith("3") || clean.startsWith("15") || clean.startsWith("16") || clean.startsWith("18")) return `${clean}.SZ`;
  return code;
}

/**
 * Detect if a symbol is an A-share stock or ETF
 */
export function isAShare(symbol: string): boolean {
  const clean = symbol.replace(/\.(SS|SZ|ss|sz)$/, "");
  // Pure numeric codes like 600519, 000858, 300750, 510300, 159919
  if (/^\d{6}$/.test(clean)) return true;
  // With exchange suffix
  if (/\.(SS|SZ)$/i.test(symbol)) return true;
  return false;
}

/**
 * Get exchange from stock/ETF code
 */
export function getExchange(code: string): "SH" | "SZ" {
  const clean = code.replace(/\.(SS|SZ|ss|sz)$/, "");
  if (clean.startsWith("6") || clean.startsWith("51") || clean.startsWith("56") || clean.startsWith("58")) return "SH";
  return "SZ";
}

/**
 * Extract pure numeric code from symbol
 */
export function getPureCode(symbol: string): string {
  return symbol.replace(/\.(SS|SZ|ss|sz)$/, "");
}

/**
 * Check if a code is an ETF based on its prefix
 */
function isETFCode(code: string): boolean {
  const clean = code.replace(/\.(SS|SZ|ss|sz)$/, "");
  return clean.startsWith("51") || clean.startsWith("56") || clean.startsWith("58") ||
         clean.startsWith("15") || clean.startsWith("16") || clean.startsWith("18");
}

/**
 * Check if a code is a market index (上证/深证/创业板 etc.)
 * Index codes: 000001, 399001, 399006, 399005, 399300, 000300, 000016, 000905 etc.
 */
function isIndexCode(code: string): boolean {
  const clean = code.replace(/\.(SS|SZ|ss|sz)$/, "");
  // Shanghai indices: 000xxx (with .SS suffix or starts with 9)
  if (/^0000\d\d$/.test(clean) && code.toUpperCase().includes(".SS")) return true;
  // Shenzhen indices: 399xxx
  if (/^399\d{3}$/.test(clean)) return true;
  // CSI indices: 000300, 000905, 000016
  if (/^000(300|905|016|852|903|904)$/.test(clean)) return true;
  return false;
}

// ── Sina Finance API ───────────────────────────────────

/**
 * Fetch K-line data from Sina Finance
 * scale: 5/15/30/60 (minutes), 240 (daily), 1440 (weekly?)
 * datalen: number of bars
 */
export async function getAShareKLine(
  symbol: string,
  scale: number = 5,
  datalen: number = 300
): Promise<AShareKLineItem[]> {
  const sinaSymbol = toSinaSymbol(symbol);
  const url = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${sinaSymbol}&scale=${scale}&ma=no&datalen=${datalen}`;

  try {
    const response = await fetch(url, {
      headers: { "Referer": "https://finance.sina.com.cn" },
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(8000),
    });

    const text = await response.text();
    if (!text || text === "null") return [];

    const data = JSON.parse(text);
    if (!Array.isArray(data)) return [];

    return data.map((item: any) => ({
      date: item.day || item.date || "",
      open: parseFloat(item.open) || 0,
      high: parseFloat(item.high) || 0,
      low: parseFloat(item.low) || 0,
      close: parseFloat(item.close) || 0,
      volume: parseInt(item.volume) || 0,
    })).filter((item: AShareKLineItem) => item.close > 0);
  } catch (error) {
    console.error("Sina K-Line fetch error:", error);
    return [];
  }
}

// ── Tencent Stock API ──────────────────────────────────

/**
 * Fetch real-time quote from Tencent Stock API
 * Returns data with Chinese stock names
 */
export async function getAShareQuote(symbol: string): Promise<AShareQuote | null> {
  const sinaSymbol = toSinaSymbol(symbol);
  const url = `https://qt.gtimg.cn/q=${sinaSymbol}`;

  try {
    const response = await fetch(url, {
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return null;

    const buffer = await response.arrayBuffer();
    const text = new TextDecoder("gbk").decode(buffer);

    // Parse Tencent format: v_sh600519="1~贵州茅台~600519~1381.88~..."
    const match = text.match(/v_[^=]+="([^"]*)"/);
    if (!match) return null;

    const fields = match[1].split("~");
    if (fields.length < 50) return null;

    const code = fields[2];
    const name = fields[1];
    const price = parseFloat(fields[3]);
    const prevClose = parseFloat(fields[4]);
    const open = parseFloat(fields[5]);
    const volume = parseInt(fields[6]);     // 手
    const outerVol = parseInt(fields[7]);   // 外盘
    const innerVol = parseInt(fields[8]);   // 内盘
    const bid1Price = parseFloat(fields[9]);
    const ask1Price = parseFloat(fields[18]);
    const bid1Vol = parseInt(fields[10]);
    const ask1Vol = parseInt(fields[19]);
    const high = parseFloat(fields[33]) || price;
    const low = parseFloat(fields[34]) || price;
    const change = parseFloat(fields[31]);
    const changePercent = parseFloat(fields[32]);
    const turnover = parseFloat(fields[38]);
    const pe = parseFloat(fields[39]);
    const marketCap = parseFloat(fields[44]);      // 亿元
    const circulatingMarketCap = parseFloat(fields[45]); // 亿元
    const high52 = parseFloat(fields[47]);
    const low52 = parseFloat(fields[48]);

    return {
      symbol: code,
      fullSymbol: sinaSymbol,
      name,
      price,
      prevClose,
      open,
      high,
      low,
      close: price,
      change,
      changePercent,
      volume,
      amount: 0,
      turnover,
      pe,
      marketCap,
      circulatingMarketCap,
      bidPrice: bid1Price,
      askPrice: ask1Price,
      bidVolume: bid1Vol,
      askVolume: ask1Vol,
      high52week: high52,
      low52week: low52,
      exchange: getExchange(code),
    };
  } catch (error) {
    console.error("Tencent quote fetch error:", error);
    return null;
  }
}

// ── Search A-Share Stocks ──────────────────────────────

export interface AShareSearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

// Common A-share stocks & ETFs mapping for quick search
const POPULAR_ASHARES: Record<string, { name: string; exchange: string }> = {
  "600519": { name: "贵州茅台", exchange: "SH" },
  "000858": { name: "五粮液", exchange: "SZ" },
  "601318": { name: "中国平安", exchange: "SH" },
  "000001": { name: "平安银行", exchange: "SZ" },
  "600036": { name: "招商银行", exchange: "SH" },
  "002594": { name: "比亚迪", exchange: "SZ" },
  "300750": { name: "宁德时代", exchange: "SZ" },
  "601899": { name: "紫金矿业", exchange: "SH" },
  "000333": { name: "美的集团", exchange: "SZ" },
  "600900": { name: "长江电力", exchange: "SH" },
  "601012": { name: "隆基绿能", exchange: "SH" },
  "002475": { name: "立讯精密", exchange: "SZ" },
  "603259": { name: "药明康德", exchange: "SH" },
  "000568": { name: "泸州老窖", exchange: "SZ" },
  "600276": { name: "恒瑞医药", exchange: "SH" },
  "601398": { name: "工商银行", exchange: "SH" },
  "000651": { name: "格力电器", exchange: "SZ" },
  "600809": { name: "山西汾酒", exchange: "SH" },
  "002714": { name: "牧原股份", exchange: "SZ" },
  "601919": { name: "中远海控", exchange: "SH" },
  "600887": { name: "伊利股份", exchange: "SH" },
  "000002": { name: "万科A", exchange: "SZ" },
  "601166": { name: "兴业银行", exchange: "SH" },
  "600030": { name: "中信证券", exchange: "SH" },
  "300059": { name: "东方财富", exchange: "SZ" },
  "601888": { name: "中国中免", exchange: "SH" },
  "002415": { name: "海康威视", exchange: "SZ" },
  "600585": { name: "海螺水泥", exchange: "SH" },
  "000725": { name: "京东方A", exchange: "SZ" },
  "601668": { name: "中国建筑", exchange: "SH" },
  "600050": { name: "中国联通", exchange: "SH" },
  "300274": { name: "阳光电源", exchange: "SZ" },
  "002230": { name: "科大讯飞", exchange: "SZ" },
  "688981": { name: "中芯国际", exchange: "SH" },
  "000100": { name: "", exchange: "SZ" },
  // ── Popular ETFs ──
  "510300": { name: "沪深300ETF", exchange: "SH" },
  "510050": { name: "上证50ETF", exchange: "SH" },
  "510500": { name: "中证500ETF", exchange: "SH" },
  "512000": { name: "券商ETF", exchange: "SH" },
  "512010": { name: "医药ETF", exchange: "SH" },
  "512660": { name: "军工ETF", exchange: "SH" },
  "512880": { name: "证券ETF", exchange: "SH" },
  "515030": { name: "新能源车ETF", exchange: "SH" },
  "515790": { name: "光伏ETF", exchange: "SH" },
  "588000": { name: "科创50ETF", exchange: "SH" },
  "159919": { name: "沪深300ETF", exchange: "SZ" },
  "159915": { name: "创业板ETF", exchange: "SZ" },
  "159949": { name: "创业板50ETF", exchange: "SZ" },
  "159901": { name: "深证100ETF", exchange: "SZ" },
  "159922": { name: "中证500ETF", exchange: "SZ" },
  "159766": { name: "半导体ETF", exchange: "SZ" },
  "159869": { name: "游戏ETF", exchange: "SZ" },
  "159992": { name: "创新药ETF", exchange: "SZ" },
  "159601": { name: "A50ETF", exchange: "SZ" },
  "159632": { name: "半导体设备ETF", exchange: "SZ" },
};

/**
 * Search A-share stocks via Sina Suggestion API
 * Supports search by: stock code, Chinese name, pinyin abbreviation
 * Covers ALL A-share stocks (SH/SZ main board, ChiNext, STAR Market)
 *
 * Sina API response format (JSONP, GBK encoded):
 *   var suggestdata="keyword,marketType,code,fullCode,name,,name2,99,1,tags,,;..."; 
 *   or var suggestdata="";  (no results)
 *
 * Market type codes:
 *   11 = 上海A股 (sh, 6xxxxx)
 *   12 = 深圳A股 (sz, 0xxxxx/3xxxxx)
 *   13 = 科创板 (sh, 688xxx)
 *   31 = 港股, 41 = 美股, 86/87 = 期货, etc. (filtered out)
 */
export async function searchAShare(query: string): Promise<AShareSearchResult[]> {
  if (!query.trim()) return [];

  const results: AShareSearchResult[] = [];
  const q = query.trim();

  // ── Primary: Sina Suggestion API (covers ALL A-share stocks) ──
  try {
    const sinaUrl = `https://suggest3.sinajs.cn/suggest/type=&key=${encodeURIComponent(q)}&name=suggestdata`;
    const resp = await fetch(sinaUrl, {
      headers: { "Referer": "https://finance.sina.com.cn" },
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(8000),
    });

    if (resp.ok) {
      // Sina API returns GBK-encoded content, need to decode properly
      const buffer = await resp.arrayBuffer();
      const text = new TextDecoder("gbk").decode(buffer);

      // Parse JSONP: var suggestdata="...";  or  var suggestdata="";
      const match = text.match(/var\s+suggestdata\s*=\s*"([^"]*)"/);
      if (match && match[1]) {
        const entries = match[1].split(";").filter(Boolean);

        for (const entry of entries) {
          const parts = entry.split(",");
          if (parts.length < 5) continue;

          // Sina format: keyword, marketType, code, fullCode, name, ...
          const marketType = parts[1];  // "11"=SH A股, "12"=SZ A股, "203"=ETF
          const code = parts[2];        // e.g. "600519", "510300"
          const fullCode = parts[3];    // e.g. "sh600519", "sz159952"
          const name = parts[4];        // e.g. "贵州茅台", "创业板ETF广发"

          // Include A-share stocks and ETFs
          // Market types: 11=上海A股, 12=深圳A股, 203=场内ETF(带sh/sz前缀)
          if (!["11", "12", "203"].includes(marketType)) continue;

          // Validate code format: standard 6-digit codes
          if (!/^\d{6}$/.test(code)) continue;

          // Skip 北交所 (8xxxxx/9xxxxx) and 三板 (4xxxxx) stocks
          if (code.startsWith("8") || code.startsWith("9") || code.startsWith("4")) continue;

          // Detect exchange from fullCode prefix (more reliable than code prefix)
          const isSH = fullCode.startsWith("sh") || fullCode.startsWith("SH");
          const exchange = isSH ? "SH" : "SZ";

          // Detect type: ETF or A股
          // ETF codes: 51xxxx/56xxxx/58xxxx/588xxx(SH), 15xxxx/16xxxx/18xxxx(SZ)
          const isETF = marketType === "203" || isETFCode(code);

          if (!results.find(r => r.symbol === code)) {
            results.push({
              symbol: code,
              name,
              exchange,
              type: isETF ? "ETF" : "A股",
            });
          }

          // Limit to 15 results for dropdown display
          if (results.length >= 15) break;
        }
      }
    }
  } catch (e) {
    console.error("Sina suggestion API error:", e);
  }

  // ── Fallback: local popular stocks (if Sina API failed) ──
  if (results.length === 0) {
    const qLower = q.toLowerCase();
    for (const [code, info] of Object.entries(POPULAR_ASHARES)) {
      if (
        code.includes(qLower) ||
        info.name.includes(q) ||
        info.name.toLowerCase().includes(qLower)
      ) {
        results.push({
          symbol: code,
          name: info.name,
          exchange: info.exchange,
          type: isETFCode(code) ? "ETF" : "A股",
        });
      }
    }
  }

  return results;
}

// ── Timeline / 分时 Data ──────────────────────────────

/**
 * Get intraday timeline data for 分时图
 * Primary: Tencent minute API (provides real-time 1-min data)
 * Fallback: Sina 5-min K-line data (when Tencent API is unavailable)
 */
export async function getAShareTimeline(
  symbol: string,
  prevCloseFromQuote?: number
): Promise<{ items: AShareTimelineItem[]; prevClose: number }> {
  const sinaSymbol = toSinaSymbol(symbol);

  // If prevClose is provided externally, skip the separate quote fetch
  const quotePromise = prevCloseFromQuote
    ? Promise.resolve({ prevClose: prevCloseFromQuote } as any)
    : getAShareQuote(symbol);
  
  // Try Tencent minute API first (provides real 1-minute data)
  try {
    const [quote, tencentResult] = await Promise.all([
      quotePromise,
      getTencentMinuteData(sinaSymbol, prevCloseFromQuote || 0, symbol), // prevClose=0, will adjust later
    ]);
    const prevClose = quote?.prevClose || tencentResult.prevClose || 0;
    if (tencentResult.items.length > 0) {
      // Adjust changePercent with correct prevClose
      if (prevClose > 0 && tencentResult.items.some(item => item.changePercent === 0)) {
        for (const item of tencentResult.items) {
          item.changePercent = Number((((item.price - prevClose) / prevClose) * 100).toFixed(2));
        }
      }
      return { items: tencentResult.items, prevClose };
    }
  } catch (error) {
    console.error("Tencent minute data fetch error:", error);
  }

  // Fallback with quote
  try {
    const quote = await quotePromise;
    const prevClose = quote?.prevClose || 0;
    const sinaResult = await getSinaTimelineFallback(sinaSymbol, prevClose);
    if (sinaResult.items.length > 0) {
      return sinaResult;
    }
    return { items: [], prevClose };
  } catch (error) {
    console.error("Sina timeline fallback error:", error);
    return { items: [], prevClose: 0 };
  }
}

/**
 * Tencent minute data API - provides real-time 1-minute intraday data
 * Format: "HHMM price cumulative_volume cumulative_amount"
 */
async function getTencentMinuteData(
  sinaSymbol: string,
  prevClose: number,
  originalSymbol?: string
): Promise<{ items: AShareTimelineItem[]; prevClose: number }> {
  const url = `https://web.ifzq.gtimg.cn/appstock/app/minute/query?_var=min_data&code=${sinaSymbol}`;

  // Detect if this is a market index (VWAP formula differs from stocks)
  const isIndex = originalSymbol ? isIndexCode(originalSymbol) : false;

  const response = await fetch(url, {
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(5000), // 5s timeout (was default, explicit for clarity)
  });

  if (!response.ok) return { items: [], prevClose };

  const text = await response.text();
  if (!text) return { items: [], prevClose };

  // Parse JSONP-style response: min_data={...}
  const jsonStr = text.replace(/^min_data=/, "");
  const data = JSON.parse(jsonStr);

  // Navigate to the minute data array
  const stockData = data?.data?.[sinaSymbol]?.data?.data;
  if (!Array.isArray(stockData) || stockData.length === 0) {
    return { items: [], prevClose };
  }

  // Parse each minute entry: "HHMM price cumVolume cumAmount"
  const items: AShareTimelineItem[] = [];
  let prevCumVol = 0;
  let prevCumAmt = 0;
  // For indices: running sum of prices for simple moving average
  let indexPriceSum = 0;
  let indexPriceCount = 0;

  for (const entry of stockData) {
    if (typeof entry !== "string") continue;
    const parts = entry.split(" ");
    if (parts.length < 4) continue;

    const timeRaw = parts[0]; // "0930", "0931", etc.
    const price = parseFloat(parts[1]);
    const cumVol = parseInt(parts[2]); // cumulative volume (手 for stocks, different for indices)
    const cumAmt = parseFloat(parts[3]); // cumulative amount

    if (isNaN(price) || price <= 0) continue;

    // Per-minute volume = current cumulative - previous cumulative
    const minuteVol = cumVol - prevCumVol;

    // Calculate avgPrice (VWAP for stocks, SMA for indices)
    let avgPrice: number;
    if (isIndex) {
      // For indices, cumAmt/cumVol units don't map to a meaningful per-share VWAP.
      // Use a simple running average of prices instead.
      indexPriceSum += price;
      indexPriceCount++;
      avgPrice = indexPriceCount > 0 ? indexPriceSum / indexPriceCount : price;
    } else {
      // VWAP = cumulative amount / cumulative volume (in 元/手 → need to adjust)
      // cumAmt is in 元, cumVol is in 手, so VWAP = cumAmt / (cumVol * 100) per share
      avgPrice = cumVol > 0 ? cumAmt / (cumVol * 100) : price;
    }

    // Format time: "0930" → "09:30"
    const timeFormatted = `${timeRaw.substring(0, 2)}:${timeRaw.substring(2, 4)}`;

    const changePercent = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

    items.push({
      time: timeFormatted,
      price: Number(price.toFixed(2)),
      avgPrice: Number(avgPrice.toFixed(2)),
      volume: Math.max(minuteVol, 0), // per-minute volume
      changePercent: Number(changePercent.toFixed(2)),
    });

    prevCumVol = cumVol;
    prevCumAmt = cumAmt;
  }

  // Handle lunch break transition: keep 13:00 entry for line continuity
  // The 13:00 entry often has volume=0 (no new trades yet in afternoon session)
  // but it carries a valid price that's needed to connect the timeline
  // If 13:00 is missing entirely, add it using the 11:30 closing price
  const has1300 = items.some(item => item.time === "13:00");
  if (!has1300 && items.length > 0) {
    // Find the last morning session price (11:30 or earlier)
    const lastMorningItem = [...items].reverse().find(item => {
      const hour = parseInt(item.time.split(":")[0]);
      return hour <= 11;
    });
    if (lastMorningItem) {
      // Insert 13:00 entry at the right position with the morning close price
      const insertIdx = items.findIndex(item => {
        const hour = parseInt(item.time.split(":")[0]);
        return hour >= 13;
      });
      const new1300: AShareTimelineItem = {
        time: "13:00",
        price: lastMorningItem.price,
        avgPrice: lastMorningItem.avgPrice,
        volume: 0,
        changePercent: lastMorningItem.changePercent,
      };
      if (insertIdx >= 0) {
        items.splice(insertIdx, 0, new1300);
      } else {
        items.push(new1300);
      }
    }
  }

  return { items, prevClose };
}

/**
 * Fallback: Use Sina 5-minute K-line data for timeline
 * Used when Tencent minute API is unavailable
 */
async function getSinaTimelineFallback(
  sinaSymbol: string,
  prevClose: number
): Promise<{ items: AShareTimelineItem[]; prevClose: number }> {
  // Fetch 5-minute data for the most recent 48 bars (covers one trading day)
  const url = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${sinaSymbol}&scale=5&ma=no&datalen=48`;

  const response = await fetch(url, {
    headers: { "Referer": "https://finance.sina.com.cn" },
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) return { items: [], prevClose };

  const text = await response.text();
  if (!text || text === "null") return { items: [], prevClose };

  const data = JSON.parse(text);
  if (!Array.isArray(data)) return { items: [], prevClose };

  // Filter to only the most recent trading day
  if (data.length === 0) return { items: [], prevClose };

  const lastDate = (data[data.length - 1].day || "").split(" ")[0];
  const todayData = data.filter((item: any) => {
    const dateStr = item.day || "";
    return dateStr.startsWith(lastDate);
  });

  if (todayData.length === 0) return { items: [], prevClose };

  return buildTimelineDataFromKLine(todayData, prevClose);
}

function buildTimelineDataFromKLine(
  rawData: any[],
  prevClose: number
): { items: AShareTimelineItem[]; prevClose: number } {
  let totalAmount = 0;
  let totalVolume = 0;

  const items: AShareTimelineItem[] = rawData.map((item: any) => {
    const close = parseFloat(item.close) || 0;
    const vol = parseInt(item.volume) || 0;
    const dateStr = item.day || "";

    // Calculate VWAP
    const avgP = (parseFloat(item.high) + parseFloat(item.low)) / 2;
    totalAmount += avgP * vol;
    totalVolume += vol;
    const vwap = totalVolume > 0 ? totalAmount / totalVolume : close;

    // Extract time from date string
    const timePart = dateStr.includes(" ") ? dateStr.split(" ")[1] : dateStr;
    const timeShort = timePart.substring(0, 5); // "HH:MM"

    const changePercent = prevClose > 0 ? ((close - prevClose) / prevClose) * 100 : 0;

    return {
      time: timeShort,
      price: close,
      avgPrice: Number(vwap.toFixed(2)),
      volume: vol,
      changePercent: Number(changePercent.toFixed(2)),
    };
  });

  return { items, prevClose };
}

// ── Sector / 板块 Data (EastMoney API) ─────────────────

export interface SectorInfo {
  code: string;        // e.g. "BK0896"
  name: string;        // e.g. "白酒"
  quoteId: string;     // e.g. "90.BK0896"
  market: number;      // e.g. 90
}

export interface SectorTimelineItem {
  time: string;       // "09:30", "09:31"
  price: number;      // 板块指数价格
  avgPrice: number;   // 均价
  volume: number;     // 成交量
  changePercent: number;  // 涨跌幅%
}

/**
 * Convert a stock symbol to EastMoney secid format
 * 6xxxxx -> 1.600519 (Shanghai)
 * 0xxxxx/3xxxxx -> 0.000858 (Shenzhen)
 */
function toEastMoneySecid(symbol: string): string {
  const pureCode = getPureCode(symbol);
  if (pureCode.startsWith("6")) return `1.${pureCode}`;
  return `0.${pureCode}`;
}

/**
 * Get the industry sector info for a stock from EastMoney
 * Uses the push2 API with f127 field (industry sector name)
 * Then searches for the sector code via EastMoney suggest API
 * Fallback: local stock-sector mapping for popular stocks
 */
export async function getStockSector(symbol: string): Promise<SectorInfo | null> {
  try {
    const fallback = getStockSectorFallback(symbol);
    const secid = toEastMoneySecid(symbol);
    const url = `http://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f127`;

    // Use single AbortSignal.timeout instead of redundant Promise.race wrappers
    const response = await fetch(url, { next: { revalidate: 0 }, signal: AbortSignal.timeout(8000) });

    if (!response.ok) return fallback;

    const data = await response.json();
    if (!data) return fallback;

    const sectorName: string | undefined = data?.data?.f127;
    if (!sectorName) return fallback;

    // Strip Ⅱ/Ⅲ suffix (e.g. "白酒Ⅱ" → "白酒")
    const cleanedName = sectorName.replace(/[ⅡⅢⅣ]+$/, "").trim();
    if (!cleanedName) return fallback;

    const result = await searchSectorCode(cleanedName);
    return result || fallback;
  } catch (error) {
    console.error("getStockSector error:", error);
    return getStockSectorFallback(symbol);
  }
}

// Local fallback: stock → sector mapping for popular A-shares
// Expanded to cover ~60 most commonly traded stocks
const STOCK_SECTOR_MAP: Record<string, SectorInfo> = {
  // 白酒
  "600519": { code: "BK0896", name: "白酒", quoteId: "90.BK0896", market: 90 },
  "000858": { code: "BK0896", name: "白酒", quoteId: "90.BK0896", market: 90 },
  "000568": { code: "BK0896", name: "白酒", quoteId: "90.BK0896", market: 90 },
  "600809": { code: "BK0896", name: "白酒", quoteId: "90.BK0896", market: 90 },
  "000799": { code: "BK0896", name: "白酒", quoteId: "90.BK0896", market: 90 },
  // 保险
  "601318": { code: "BK0475", name: "保险", quoteId: "90.BK0475", market: 90 },
  "601601": { code: "BK0475", name: "保险", quoteId: "90.BK0475", market: 90 },
  // 银行
  "600036": { code: "BK0474", name: "银行", quoteId: "90.BK0474", market: 90 },
  "000001": { code: "BK0474", name: "银行", quoteId: "90.BK0474", market: 90 },
  "601398": { code: "BK0474", name: "银行", quoteId: "90.BK0474", market: 90 },
  "601288": { code: "BK0474", name: "银行", quoteId: "90.BK0474", market: 90 },
  "600016": { code: "BK0474", name: "银行", quoteId: "90.BK0474", market: 90 },
  "601166": { code: "BK0474", name: "银行", quoteId: "90.BK0474", market: 90 },
  // 汽车
  "002594": { code: "BK0481", name: "汽车整车", quoteId: "90.BK0481", market: 90 },
  "600104": { code: "BK0481", name: "汽车整车", quoteId: "90.BK0481", market: 90 },
  "000625": { code: "BK0481", name: "汽车整车", quoteId: "90.BK0481", market: 90 },
  "601127": { code: "BK0481", name: "汽车整车", quoteId: "90.BK0481", market: 90 },
  // 锂电池/新能源
  "300750": { code: "BK0478", name: "锂电池", quoteId: "90.BK0478", market: 90 },
  "002460": { code: "BK0478", name: "锂电池", quoteId: "90.BK0478", market: 90 },
  "002466": { code: "BK0478", name: "锂电池", quoteId: "90.BK0478", market: 90 },
  // 有色金属
  "601899": { code: "BK0479", name: "有色金属", quoteId: "90.BK0479", market: 90 },
  "600547": { code: "BK0479", name: "有色金属", quoteId: "90.BK0479", market: 90 },
  // 白色家电
  "000333": { code: "BK0484", name: "白色家电", quoteId: "90.BK0484", market: 90 },
  "000651": { code: "BK0484", name: "白色家电", quoteId: "90.BK0484", market: 90 },
  // 医药
  "600276": { code: "BK0734", name: "化学制药", quoteId: "90.BK0734", market: 90 },
  "000538": { code: "BK0734", name: "化学制药", quoteId: "90.BK0734", market: 90 },
  "300760": { code: "BK0735", name: "医疗器械", quoteId: "90.BK0735", market: 90 },
  "300015": { code: "BK0730", name: "医疗服务", quoteId: "90.BK0730", market: 90 },
  // 证券
  "600030": { code: "BK0473", name: "证券", quoteId: "90.BK0473", market: 90 },
  "300059": { code: "BK0473", name: "证券", quoteId: "90.BK0473", market: 90 },
  "601211": { code: "BK0473", name: "证券", quoteId: "90.BK0473", market: 90 },
  "000776": { code: "BK0473", name: "证券", quoteId: "90.BK0473", market: 90 },
  // 安防/半导体/科技
  "002415": { code: "BK0911", name: "安防", quoteId: "90.BK0911", market: 90 },
  "688981": { code: "BK0910", name: "半导体", quoteId: "90.BK0910", market: 90 },
  "002049": { code: "BK0910", name: "半导体", quoteId: "90.BK0910", market: 90 },
  "300014": { code: "BK0910", name: "半导体", quoteId: "90.BK0910", market: 90 },
  "002371": { code: "BK0910", name: "半导体", quoteId: "90.BK0910", market: 90 },
  "002230": { code: "BK0800", name: "人工智能", quoteId: "90.BK0800", market: 90 },
  "300418": { code: "BK0800", name: "人工智能", quoteId: "90.BK0800", market: 90 },
  // 电力/光伏
  "600900": { code: "BK0486", name: "电力", quoteId: "90.BK0486", market: 90 },
  "601012": { code: "BK0912", name: "光伏", quoteId: "90.BK0912", market: 90 },
  "300274": { code: "BK0912", name: "光伏", quoteId: "90.BK0912", market: 90 },
  "601865": { code: "BK0912", name: "光伏", quoteId: "90.BK0912", market: 90 },
  // 消费电子
  "002475": { code: "BK1037", name: "消费电子", quoteId: "90.BK1037", market: 90 },
  "000725": { code: "BK0733", name: "面板", quoteId: "90.BK0733", market: 90 },
  "002241": { code: "BK1037", name: "消费电子", quoteId: "90.BK1037", market: 90 },
  // 地产/建筑
  "601668": { code: "BK0469", name: "建筑装饰", quoteId: "90.BK0469", market: 90 },
  "600585": { code: "BK0732", name: "水泥", quoteId: "90.BK0732", market: 90 },
  "000002": { code: "BK0451", name: "房地产", quoteId: "90.BK0451", market: 90 },
  "001979": { code: "BK0451", name: "房地产", quoteId: "90.BK0451", market: 90 },
  // 旅游/食品
  "601888": { code: "BK0490", name: "旅游", quoteId: "90.BK0490", market: 90 },
  "600887": { code: "BK0482", name: "食品加工", quoteId: "90.BK0482", market: 90 },
  "600050": { code: "BK0489", name: "通信服务", quoteId: "90.BK0489", market: 90 },
  // 养殖/港口
  "002714": { code: "BK0470", name: "养殖业", quoteId: "90.BK0470", market: 90 },
  "601919": { code: "BK0480", name: "港口航运", quoteId: "90.BK0480", market: 90 },
  // 军工
  "600760": { code: "BK0481", name: "航天军工", quoteId: "90.BK0481", market: 90 },
  // 钢铁/煤炭
  "600019": { code: "BK0468", name: "钢铁", quoteId: "90.BK0468", market: 90 },
  "601088": { code: "BK0467", name: "煤炭", quoteId: "90.BK0467", market: 90 },
  // 石油
  "601857": { code: "BK0465", name: "石油", quoteId: "90.BK0465", market: 90 },
  "600028": { code: "BK0465", name: "石油", quoteId: "90.BK0465", market: 90 },
  // 互联网/传媒
  "300052": { code: "BK0744", name: "互联网", quoteId: "90.BK0744", market: 90 },
  // 软件
  "600588": { code: "BK0743", name: "软件", quoteId: "90.BK0743", market: 90 },
};

function getStockSectorFallback(symbol: string): SectorInfo | null {
  const pureCode = getPureCode(symbol);
  return STOCK_SECTOR_MAP[pureCode] || null;
}

/**
 * Search sector code by name via EastMoney suggest API
 */
export async function searchSectorCode(sectorName: string): Promise<SectorInfo | null> {
  try {
    const url = `http://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(sectorName)}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=5`;

    const response = await fetch(url, {
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const items = data?.QuotationCodeTable?.Data;
    if (!Array.isArray(items) || items.length === 0) return null;

    // Find the first BK (板块) entry
    const bkEntry = items.find((entry: any) => entry.Classify === "BK");
    if (!bkEntry) return null;

    return {
      code: bkEntry.Code,
      name: bkEntry.Name,
      quoteId: bkEntry.QuoteID,
      market: 90,
    };
  } catch (error) {
    console.error("searchSectorCode error:", error);
    return null;
  }
}

/**
 * Get sector intraday timeline data from EastMoney trends2 API
 * Returns 1-minute timeline data similar to AShareTimelineItem format
 */
export async function getSectorTimeline(sectorCode: string): Promise<{ items: SectorTimelineItem[]; prevClose: number }> {
  try {
    const url = `http://push2.eastmoney.com/api/qt/stock/trends2/get?secid=90.${sectorCode}&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13&fields2=f51,f52,f53,f54,f55,f56,f57,f58&iscr=0`;

    const response = await fetch(url, {
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    if (!response.ok) return { items: [], prevClose: 0 };

    const data = await response.json();
    const trendsData = data?.data;
    if (!trendsData) return { items: [], prevClose: 0 };

    // Extract prevClose from data.preClose or data.prePrice
    const prevClose = parseFloat(trendsData.preClose ?? trendsData.prePrice ?? 0);
    if (prevClose <= 0) return { items: [], prevClose: 0 };

    const trends: string[] = trendsData.trends;
    if (!Array.isArray(trends) || trends.length === 0) {
      return { items: [], prevClose };
    }

    const items: SectorTimelineItem[] = [];

    for (const entry of trends) {
      if (typeof entry !== "string") continue;
      // Format: "2026-05-06 09:30,2057.32,2057.32,2057.36,2056.88,237444,870721984.00,2057.315"
      // Fields: time,open,price,high,low,volume,amount,avgPrice
      const parts = entry.split(",");
      if (parts.length < 8) continue;

      const timeStr = parts[0]; // "2026-05-06 09:30"
      const price = parseFloat(parts[2]);
      const volume = parseInt(parts[5]);
      const avgPrice = parseFloat(parts[7]);

      if (isNaN(price) || price <= 0) continue;

      // Extract HH:MM from "2026-05-06 09:30"
      const timePart = timeStr.includes(" ") ? timeStr.split(" ")[1] : timeStr;
      const timeShort = timePart.substring(0, 5); // "HH:MM"

      const changePercent = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

      items.push({
        time: timeShort,
        price: Number(price.toFixed(2)),
        avgPrice: Number(avgPrice.toFixed(2)),
        volume,
        changePercent: Number(changePercent.toFixed(2)),
      });
    }

    return { items, prevClose };
  } catch (error) {
    console.error("getSectorTimeline error:", error);
    return { items: [], prevClose: 0 };
  }
}

/**
 * Format volume for A-shares (in 手/lots)
 */
export function formatAShareVolume(vol: number): string {
  if (!vol) return "--";
  if (vol >= 1e8) return (vol / 1e8).toFixed(2) + "亿手";
  if (vol >= 1e4) return (vol / 1e4).toFixed(2) + "万手";
  return vol.toLocaleString() + "手";
}

/**
 * Format amount in 万元 / 亿元
 */
export function formatAShareAmount(amount: number): string {
  if (!amount) return "--";
  if (amount >= 1e8) return (amount / 1e8).toFixed(2) + "亿";
  if (amount >= 1e4) return (amount / 1e4).toFixed(2) + "万";
  return amount.toLocaleString();
}
