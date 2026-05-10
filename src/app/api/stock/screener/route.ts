import { NextRequest, NextResponse } from "next/server";

/**
 * Stock Screener API
 * GET /api/stock/screener
 *
 * Screening criteria:
 * 1. 今日分时涨幅在0%至3%之间
 * 2. 通讯板块 (Communication sector)
 * 3. 开盘有脉冲拉升
 * 4. 主板 (Main board only)
 * 5. 排除ST
 * 6. 排除创业板 (300xxx)
 * 7. 排除科创板 (688xxx)
 * 8. 排除北交 (8xxxxx/4xxxxx)
 * 9. 市值<200亿
 */

// ── Server-side Cache ───────────────────────────────────
// Cache screener results to avoid re-running the full pipeline on every request.
// Key: query params string, Value: { data: ScreenerResult, timestamp }
const screenerCache = new Map<string, { data: ScreenerResult; timestamp: number }>();
const CACHE_TTL = 3 * 60 * 1000; // 3 minutes – balance freshness vs cost

/**
 * Build a cache key from query parameters
 */
function buildCacheKey(params: {
  minChange: number;
  maxChange: number;
  maxMarketCap: number;
  sector: string;
  pulseThreshold: number;
  pulse: boolean;
  pulseTimeStart: string;
  pulseTimeEnd: string;
  volumeSurge: boolean;
  volumeSurgeThreshold: number;
  progressiveVol: boolean;
  progressiveVolThreshold: number;
  minTurnover: number;
  maxTurnover: number;
  minPE: number;
  maxPE: number;
  minVolumeRatio: number;
  mainNetInflowRequired: boolean;
  minAmplitude: number;
  maxAmplitude: number;
  enableMATrend: boolean;
  maTrendType: string;
}): string {
  return `${params.sector}|${params.minChange}|${params.maxChange}|${params.maxMarketCap}|${params.pulseThreshold}|${params.pulse}|${params.pulseTimeStart}|${params.pulseTimeEnd}|${params.volumeSurge}|${params.volumeSurgeThreshold}|${params.progressiveVol}|${params.progressiveVolThreshold}|${params.minTurnover}|${params.maxTurnover}|${params.minPE}|${params.maxPE}|${params.minVolumeRatio}|${params.mainNetInflowRequired}|${params.minAmplitude}|${params.maxAmplitude}|${params.enableMATrend}|${params.maTrendType}`;
}

// ── Types ──────────────────────────────────────────────

interface ScreenerStock {
  symbol: string;           // 股票代码 e.g. "600050"
  name: string;             // 股票名称 e.g. "中国联通"
  exchange: string;         // 交易所 SH/SZ
  price: number;            // 最新价
  prevClose: number;        // 昨收
  open: number;             // 开盘价
  high: number;             // 最高价
  low: number;              // 最低价
  changePercent: number;    // 涨跌幅%
  changeAmount: number;     // 涨跌额
  volume: number;           // 成交量
  amount: number;           // 成交额
  turnover: number;         // 换手率%
  marketCap: number;        // 总市值(元)
  circulatingMarketCap: number; // 流通市值(元)
  pe: number;               // 市盈率(动)
  amplitude: number;        // 振幅%
  mainNetInflow: number;    // 主力净流入
  pulseScore: number;       // 脉冲拉升评分 0-100
  pulseDetail: string;      // 脉冲拉升描述
  volumeSurgeScore: number; // 放量拉升评分 0-100
  volumeSurgeDetail: string;// 放量拉升描述
  progressiveVolScore: number; // 递增放量评分 0-100
  progressiveVolDetail: string; // 递增放量描述
  evaluation: string;        // 股票评估标签
  evaluationDetail: string;  // 评估详情
  reliabilityScore: number;     // 综合可靠度评分 0-100
  reliabilityDetail: string;    // 可靠度详情
  volumeRatio: number;          // 量比
  compositeScore: number;       // 综合评分 0-100 (weighted combination of all factors)
  compositeDetail: string;      // 综合评分详情
  resonanceTags: string;        // 多因子共振标签 (comma-separated)
  vwapPosition: string;         // 均价线关系
  vwapPositionDetail: string;   // 均价线关系描述
  capitalTrend: string;         // 资金趋势
  capitalTrendDetail: string;   // 资金趋势描述
}

interface ScreenerResult {
  success: boolean;
  stocks: ScreenerStock[];
  totalCount: number;
  filteredCount: number;
  sectorName: string;
  sectorCode: string;
  timestamp: string;
  error?: string;
}

// ── Sector Search via EastMoney ─────────────────────────
// Dynamically search for sector codes based on keyword

/**
 * Search for sector codes via EastMoney suggest API
 * @param keyword - The sector keyword to search (e.g. "通信", "半导体", "新能源")
 */
async function findSectorsByKeyword(keyword: string): Promise<{ code: string; name: string }[]> {
  const results: { code: string; name: string }[] = [];
  const seen = new Set<string>();

  // Also search for common aliases
  const keywords = [keyword];
  // Add common alias mappings
  const aliases: Record<string, string[]> = {
    // ── 科技 ──
    "通信": ["通讯", "5G", "光通信"],
    "通讯": ["通信", "5G"],
    "半导体": ["芯片", "集成电路", "晶圆"],
    "芯片": ["半导体", "集成电路", "封测"],
    "人工智能": ["AI", "大模型", "ChatGPT", "AIGC", "算力"],
    "AI": ["人工智能", "大模型", "算力概念"],
    "算力": ["算力概念", "人工智能", "服务器", "GPU"],
    "软件": ["计算机", "信息技术", "信创"],
    "信创": ["国产软件", "操作系统", "数据库"],
    "云计算": ["云服务", "数据中心", "IDC"],
    "大数据": ["数据要素", "数据安全"],
    "网络安全": ["信息安全", "信安"],
    "游戏": ["网游", "手游", "电竞"],
    "传媒": ["影视", "短视频", "直播"],
    "消费电子": ["苹果产业链", "VR", "MR", "智能穿戴"],
    "元宇宙": ["VR", "AR", "虚拟现实", "元宇宙概念"],
    "机器人": ["工业机器人", "人形机器人", "自动化"],
    "物联网": ["IoT", "传感器"],
    "数字货币": ["区块链", "比特币", "加密货币"],
    "华为": ["华为概念", "华为汽车", "华为昇腾", "华为海思"],
    "鸿蒙": ["华为", "鸿蒙概念", "操作系统"],

    // ── 新能源 ──
    "新能源": ["光伏设备", "风电设备", "核电", "清洁能源"],
    "光伏": ["太阳能", "硅料", "硅片", "组件", "逆变器", "光伏设备"],
    "风电": ["风力发电", "风能", "海上风电", "风电设备"],
    "锂电池": ["锂电", "电池", "储能", "钠电池"],
    "储能": ["电池", "锂电池", "钠电池", "储能概念"],
    "新能源车": ["电动汽车", "智能驾驶", "自动驾驶", "汽车整车"],
    "汽车": ["新能源车", "汽车整车", "零部件"],
    "充电桩": ["充电", "换电"],
    "氢能源": ["氢能", "燃料电池"],
    "核能": ["核电", "核能核电"],

    // ── 医药（东方财富板块名为"医药生物"而非"医药"） ──
    "医药": ["医药生物", "化学制药", "医疗服务", "中药"],
    "医疗": ["医药生物", "医疗器械", "医疗服务"],
    "生物": ["生物医药", "基因", "CRO"],
    "CRO": ["医药外包", "CDMO"],
    "中药": ["中医药", "中成药"],
    "医疗器械": ["医疗设备", "体外诊断", "IVD"],
    "创新药": ["新药", "靶向药", "PD-1"],
    "医美": ["美容", "化妆品", "玻尿酸", "医美概念"],
    "疫苗": ["新冠", "免疫"],
    "血制品": ["血液制品", "免疫球蛋白"],

    // ── 金融 ──
    "银行": ["金融", "商业银行"],
    "证券": ["券商", "投行"],
    "券商": ["证券", "投行"],
    "保险": ["寿险", "财险", "养老金"],
    "金融": ["银行", "保险", "证券", "多元金融"],
    "多元金融": ["信托", "期货", "租赁"],

    // ── 消费 ──
    "消费": ["食品饮料", "白酒", "白色家电", "零售概念"],
    "白酒": ["茅台", "五粮液", "酒"],
    "食品": ["食品饮料", "食品加工", "调味品", "乳制品"],
    "家电": ["白色家电", "小家电", "智能家居"],
    "零售": ["商业百货", "超市", "免税", "零售概念"],
    "旅游": ["旅游酒店", "景区", "航空"],
    "教育": ["培训", "职教", "在线教育"],
    "纺织服装": ["服装家纺", "纺织制造", "纺织服饰"],
    "宠物": ["宠物食品", "宠物医疗"],
    "预制菜": ["速冻食品", "中央厨房"],

    // ── 周期/资源 ──
    "煤炭": ["能源", "焦煤", "动力煤", "煤炭开采"],
    "钢铁": ["特钢"],
    "有色": ["有色金属", "铜", "铝", "锌", "稀土"],
    "稀土": ["永磁", "稀有金属"],
    "黄金": ["贵金属", "金矿"],
    "石油": ["石油石化", "油气", "页岩油"],
    "化工": ["化学制品", "农药", "化肥", "聚氨酯"],
    "水泥": ["混凝土"],
    "建材": ["水泥", "玻璃", "建筑装饰", "建筑材料"],

    // ── 制造 ──
    "电力": ["发电", "火电", "水电", "绿电"],
    "绿电": ["清洁能源", "新能源发电"],
    "军工": ["国防", "航空航天", "兵器"],
    "国防": ["军工", "航天", "军备"],
    "航空": ["航空航天", "大飞机", "民航"],
    "造船": ["船舶", "航运", "集装箱"],
    "机械": ["工程机械", "专用设备", "数控机床"],
    "地产": ["房地产", "物业管理"],
    "房地产": ["地产", "物业"],
    "建筑": ["基建", "建筑装饰", "建筑节能", "建筑材料"],

    // ── 农业 ──
    "农业": ["农林牧渔", "种业", "养殖", "化肥"],
    "养殖": ["猪肉", "鸡肉", "渔业", "饲料", "养殖业"],
    "种业": ["种子", "转基因"],
    "化肥": ["农化", "磷化工", "钾肥"],

    // ── 交通物流 ──
    "港口": ["航运", "港口航运"],
    "物流": ["快递", "冷链", "仓储"],
    "高铁": ["轨交", "铁路", "城轨"],

    // ── 环保 ──
    "环保": ["节能", "水处理", "固废"],
    "碳交易": ["碳中和", "碳排放"],

    // ── 其他 ──
    "租赁": ["融资租赁"],
    "跨境电商": ["外贸", "出口"],
  };
  if (aliases[keyword]) {
    keywords.push(...aliases[keyword]);
  }

  for (const kw of keywords) {
    try {
      const url = `http://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(kw)}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=10`;
      const resp = await fetch(url, {
        next: { revalidate: 0 },
        signal: AbortSignal.timeout(8000),
      });

      if (!resp.ok) continue;
      const data = await resp.json();
      const items = data?.QuotationCodeTable?.Data;
      if (!Array.isArray(items)) continue;

      for (const entry of items) {
        if (entry.Classify !== "BK") continue;
        const code: string = entry.Code || "";
        const name: string = entry.Name || "";
        // Include sectors whose name contains the keyword or any alias
        const matchesKeyword = keywords.some(k => name.includes(k));
        if (matchesKeyword) {
          if (!seen.has(code)) {
            seen.add(code);
            results.push({ code, name });
          }
        }
      }
    } catch (e) {
      console.error("Sector search error:", e);
    }
  }

  return results;
}

/**
 * Get sector constituent stocks from EastMoney
 * Uses the push2 clist API to get all stocks in a sector with real-time data
 */
async function getSectorStocks(sectorCode: string, pageSize: number = 200): Promise<any[]> {
  const allStocks: any[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= 5) {
    try {
      const url = `http://push2.eastmoney.com/api/qt/clist/get?pn=${page}&pz=${pageSize}&po=1&np=1&fltt=2&invt=2&fid=f3&fs=b:${sectorCode}&fields=f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f14,f15,f16,f17,f18,f20,f21,f23,f24,f25,f26,f22,f11,f62,f128,f140,f141,f136`;
      const resp = await fetch(url, {
        next: { revalidate: 0 },
        signal: AbortSignal.timeout(15000),
      });

      if (!resp.ok) break;

      const data = await resp.json();
      const diff = data?.data?.diff;
      if (!Array.isArray(diff) || diff.length === 0) {
        hasMore = false;
        break;
      }

      allStocks.push(...diff);

      // Check if there are more pages
      const total = data?.data?.total || 0;
      if (allStocks.length >= total || diff.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    } catch (e) {
      console.error("Sector stocks fetch error:", e);
      hasMore = false;
    }
  }

  return allStocks;
}

/**
 * Fetch 1-minute timeline data for pulse detection
 */
async function getStockTimeline(symbol: string): Promise<{ time: string; price: number; volume: number }[]> {
  try {
    // Convert to Sina format
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

    return stockData
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
      .filter(Boolean) as { time: string; price: number; volume: number }[];
  } catch (e) {
    return [];
  }
}

function parseTimeToMinutes(timeStr: string): number {
  const parts = timeStr.split(":");
  if (parts.length !== 2) return 570; // default 09:30 = 9*60+30
  const h = parseInt(parts[0]) || 9;
  const m = parseInt(parts[1]) || 30;
  return h * 60 + m;
}

/**
 * Detect opening pulse surge pattern
 * Returns { score: 0-100, detail: string }
 *
 * A "pulse" means the stock had a rapid price increase shortly after market open.
 * Detection logic:
 * 1. Check if price rose rapidly in the specified time window
 * 2. Look for a quick surge where price increases >1.5% within 3-5 minutes
 * 3. The surge should be followed by a pullback (typical pulse pattern)
 *
 * @param timeStart - Start time in HH:mm format (default "09:30")
 * @param timeEnd - End time in HH:mm format (default "10:30")
 */
function detectPulseSurge(
  timeline: { time: string; price: number; volume: number }[],
  prevClose: number,
  open: number,
  timeStart: string = "09:30",
  timeEnd: string = "10:30",
): { score: number; detail: string } {
  if (!timeline || timeline.length < 5 || prevClose <= 0) {
    return { score: 0, detail: "数据不足" };
  }

  // Parse time range to minutes for comparison
  const startMin = parseTimeToMinutes(timeStart);
  const endMin = parseTimeToMinutes(timeEnd);

  // Filter to the specified time window
  const earlySession = timeline.filter(t => {
    const hour = parseInt(t.time.split(":")[0]);
    const minute = parseInt(t.time.split(":")[1]);
    const totalMin = hour * 60 + minute;
    return totalMin >= startMin && totalMin <= endMin;
  });

  if (earlySession.length < 3) {
    return { score: 0, detail: "早盘数据不足" };
  }

  // Strategy 1: Check for rapid surge in short window
  let maxSurgeRate = 0;
  let surgeStart = "";
  let surgeEnd = "";
  const windowSize = 5; // 5-minute window

  for (let i = 0; i <= earlySession.length - windowSize; i++) {
    const startPrice = earlySession[i].price;
    const endPrice = earlySession[i + windowSize - 1].price;
    if (startPrice <= 0) continue;

    const surgeRate = ((endPrice - startPrice) / startPrice) * 100;
    if (surgeRate > maxSurgeRate) {
      maxSurgeRate = surgeRate;
      surgeStart = earlySession[i].time;
      surgeEnd = earlySession[i + windowSize - 1].time;
    }
  }

  // Strategy 2: Check open-to-high surge in early session
  const openPrice = earlySession[0].price;
  const earlyHigh = Math.max(...earlySession.map(t => t.price));
  const openToHighRate = ((earlyHigh - openPrice) / openPrice) * 100;

  // Strategy 3: Check if there's a peak then pullback (classic pulse pattern)
  let peakIdx = 0;
  let peakPrice = 0;
  for (let i = 0; i < earlySession.length; i++) {
    if (earlySession[i].price > peakPrice) {
      peakPrice = earlySession[i].price;
      peakIdx = i;
    }
  }

  const lastEarlyPrice = earlySession[earlySession.length - 1].price;
  const pullbackRate = peakPrice > 0 ? ((peakPrice - lastEarlyPrice) / peakPrice) * 100 : 0;

  // Strategy 4: Check volume spike during surge (pulse usually has high volume)
  const avgVol = earlySession.reduce((sum, t) => sum + t.volume, 0) / earlySession.length;
  const peakVol = earlySession[peakIdx]?.volume || 0;
  const volumeRatio = avgVol > 0 ? peakVol / avgVol : 1;

  // Strategy 5: Gap up at open (开盘跳空) is also a pulse indicator
  const gapUpRate = ((openPrice - prevClose) / prevClose) * 100;

  // Calculate composite pulse score
  let score = 0;

  // Short-window surge (most important signal)
  if (maxSurgeRate >= 3) score += 35;
  else if (maxSurgeRate >= 2) score += 25;
  else if (maxSurgeRate >= 1.5) score += 20;
  else if (maxSurgeRate >= 1) score += 12;
  else if (maxSurgeRate >= 0.5) score += 5;

  // Open-to-high rate
  if (openToHighRate >= 3) score += 25;
  else if (openToHighRate >= 2) score += 18;
  else if (openToHighRate >= 1.5) score += 12;
  else if (openToHighRate >= 1) score += 8;
  else if (openToHighRate >= 0.5) score += 3;

  // Pullback after peak (classic pulse signature)
  if (pullbackRate >= 0.5 && pullbackRate <= 5 && peakIdx < earlySession.length - 2) {
    score += 15; // Peak followed by pullback = strong pulse signal
  } else if (pullbackRate > 0 && peakIdx < earlySession.length / 2) {
    score += 8;
  }

  // Volume spike
  if (volumeRatio >= 2) score += 10;
  else if (volumeRatio >= 1.5) score += 6;
  else if (volumeRatio >= 1.2) score += 3;

  // Gap up bonus
  if (gapUpRate >= 1) score += 10;
  else if (gapUpRate >= 0.5) score += 5;
  else if (gapUpRate > 0) score += 2;

  // Cap at 100
  score = Math.min(score, 100);

  // Build detail string
  const details: string[] = [];
  if (maxSurgeRate >= 1) {
    details.push(`${surgeStart}-${surgeEnd}飙升${maxSurgeRate.toFixed(1)}%`);
  }
  if (openToHighRate >= 1) {
    details.push(`开盘冲高${openToHighRate.toFixed(1)}%`);
  }
  if (gapUpRate >= 0.5) {
    details.push(`跳空${gapUpRate.toFixed(1)}%`);
  }
  if (pullbackRate >= 0.3 && peakIdx < earlySession.length - 2) {
    details.push(`冲高回落${pullbackRate.toFixed(1)}%`);
  }
  if (volumeRatio >= 1.5) {
    details.push(`放量拉升${volumeRatio.toFixed(1)}x`);
  }

  return {
    score,
    detail: details.length > 0 ? details.join("，") : (score > 0 ? "轻微脉冲" : "无明显脉冲"),
  };
}

/**
 * Detect volume surge WITH price rise pattern (放量拉升)
 * Returns { score: 0-100, detail: string }
 *
 * "放量拉升" = volume surge accompanied by price rise.
 * Key difference from generic "放量": this specifically requires the volume expansion
 * to coincide with upward price movement. Volume without price rise (放量滞涨) is
 * penalized, not rewarded.
 *
 * Detection strategies (all emphasize price-rise coupling):
 * 1. Volume spike + price rise in the same minute (量价齐升)
 * 2. Progressive volume increase with sustained price rise (递增放量拉升)
 * 3. Volume expansion ratio above baseline WITH positive price gain
 * 4. Concentrated buying: high % of up-minutes with above-average volume
 * 5. Price surge magnitude during volume peak (放量拉高幅度)
 * 6. Speed of rise during volume surge (拉升速度)
 *
 * @param timeStart - Start time in HH:mm format (default "09:30")
 * @param timeEnd - End time in HH:mm format (default "10:30")
 */
function detectVolumeSurge(
  timeline: { time: string; price: number; volume: number }[],
  prevClose: number,
  open: number,
  timeStart: string = "09:30",
  timeEnd: string = "10:30",
): { score: number; detail: string } {
  if (!timeline || timeline.length < 10 || prevClose <= 0) {
    return { score: 0, detail: "数据不足" };
  }

  // Parse time range
  const startMin = parseTimeToMinutes(timeStart);
  const endMin = parseTimeToMinutes(timeEnd);

  // Filter to the specified time window
  const session = timeline.filter(t => {
    const hour = parseInt(t.time.split(":")[0]);
    const minute = parseInt(t.time.split(":")[1]);
    const totalMin = hour * 60 + minute;
    return totalMin >= startMin && totalMin <= endMin;
  });

  if (session.length < 5) {
    return { score: 0, detail: "时段数据不足" };
  }

  // Calculate incremental volumes (each minute's actual volume)
  const increments: { time: string; price: number; vol: number; priceChange: number }[] = [];
  for (let i = 0; i < session.length; i++) {
    const prevVol = i > 0 ? session[i - 1].volume : 0;
    const curVol = session[i].volume;
    const vol = i === 0 ? curVol : Math.max(0, curVol - prevVol);
    const prevPrice = i > 0 ? session[i - 1].price : prevClose;
    const priceChange = prevPrice > 0 ? ((session[i].price - prevPrice) / prevPrice) * 100 : 0;
    increments.push({ time: session[i].time, price: session[i].price, vol, priceChange });
  }

  // ── Strategy 1: Volume spike + price rise (量价齐升) — MOST IMPORTANT ──
  const avgVol = increments.reduce((s, t) => s + t.vol, 0) / increments.length;
  const maxVol = Math.max(...increments.map(t => t.vol));
  const maxVolIdx = increments.findIndex(t => t.vol === maxVol);
  const volumeRatio = avgVol > 0 ? maxVol / avgVol : 1;
  const maxVolPriceChange = increments[maxVolIdx]?.priceChange || 0;

  // ── Strategy 2: Progressive volume increase WITH price rise (递增放量拉升) ──
  let maxProgressiveLen = 1;
  let curProgressiveLen = 1;
  let progressiveStart = 0;
  let bestProgressiveStart = 0;
  for (let i = 1; i < increments.length; i++) {
    if (increments[i].vol > increments[i - 1].vol && increments[i].vol > 0) {
      curProgressiveLen++;
      if (curProgressiveLen > maxProgressiveLen) {
        maxProgressiveLen = curProgressiveLen;
        bestProgressiveStart = progressiveStart;
      }
    } else {
      curProgressiveLen = 1;
      progressiveStart = i;
    }
  }

  const progressivePriceRise = maxProgressiveLen >= 3
    ? (() => {
        const startP = increments[bestProgressiveStart]?.price || 0;
        const endP = increments[bestProgressiveStart + maxProgressiveLen - 1]?.price || 0;
        return startP > 0 ? ((endP - startP) / startP) * 100 : 0;
      })()
    : 0;

  // ── Strategy 3: Volume expansion vs baseline WITH positive price gain ──
  const baselineVol = increments.slice(0, Math.min(5, increments.length))
    .reduce((s, t) => s + t.vol, 0) / Math.min(5, increments.length);
  const totalWindowVol = increments.reduce((s, t) => s + t.vol, 0);
  const windowAvgVol = totalWindowVol / increments.length;
  const windowVolRatio = baselineVol > 0 ? windowAvgVol / baselineVol : 1;

  // ── Strategy 4: Price gain in the window (must be positive for 放量拉升) ──
  const windowStartPrice = session[0].price;
  const windowEndPrice = session[session.length - 1].price;
  const windowPriceGain = windowStartPrice > 0
    ? ((windowEndPrice - windowStartPrice) / windowStartPrice) * 100
    : 0;

  // ── Strategy 5: Concentrated buying — up-minutes with above-average volume ──
  const upWithHighVol = increments.filter(t => t.priceChange > 0 && t.vol > avgVol).length;
  const upHighVolRatio = increments.length > 0 ? upWithHighVol / increments.length : 0;

  // ── Strategy 6: Price surge magnitude during volume peak (放量拉高幅度) ──
  // Find the minute with max volume, measure price rise from before that minute to the peak
  let surgeRiseRate = 0;
  if (maxVolIdx >= 2) {
    const preSurgePrice = increments[Math.max(0, maxVolIdx - 3)].price;
    const peakPrice = Math.max(
      ...increments.slice(Math.max(0, maxVolIdx - 1), Math.min(increments.length, maxVolIdx + 3)).map(t => t.price)
    );
    surgeRiseRate = preSurgePrice > 0 ? ((peakPrice - preSurgePrice) / preSurgePrice) * 100 : 0;
  }

  // ── Strategy 7: Speed of rise — max price increase in any 3-minute window ──
  let maxRiseSpeed = 0;
  let maxRiseStart = 0;
  for (let i = 0; i <= increments.length - 3; i++) {
    const startP = increments[i].price;
    const endP = increments[i + 2].price;
    if (startP > 0) {
      const riseRate = ((endP - startP) / startP) * 100;
      if (riseRate > maxRiseSpeed) {
        maxRiseSpeed = riseRate;
        maxRiseStart = i;
      }
    }
  }

  // ══════════════════════════════════════════════════
  // Calculate composite score — 放量拉升 (volume surge + price rise)
  // KEY: Volume without price rise gets ZERO or NEGATIVE score
  // ══════════════════════════════════════════════════
  let score = 0;

  // ── Gate check: if there's no meaningful price rise at all, score = 0 ──
  // "放量拉升" requires 拉升 (price rise). Pure volume without rise is "放量滞涨"
  const hasPriceRise = windowPriceGain > 0.1 || maxVolPriceChange > 0 || maxRiseSpeed > 0.3;

  // ── Strategy 1: Volume spike + price rise (量价齐升) — 30 points max ──
  // Only score if volume surge coincides with price rise
  if (volumeRatio >= 3 && maxVolPriceChange > 0.3) score += 30;
  else if (volumeRatio >= 2.5 && maxVolPriceChange > 0.2) score += 25;
  else if (volumeRatio >= 2 && maxVolPriceChange > 0.1) score += 20;
  else if (volumeRatio >= 2 && maxVolPriceChange > 0) score += 12;
  else if (volumeRatio >= 1.5 && maxVolPriceChange > 0.1) score += 10;
  else if (volumeRatio >= 1.5 && maxVolPriceChange > 0) score += 5;
  // Volume spike but price DROPPED — penalize (放量下跌 = bearish signal)
  else if (volumeRatio >= 2 && maxVolPriceChange < -0.1) score -= 5;
  else if (volumeRatio >= 1.5 && maxVolPriceChange < 0) score -= 2;

  // ── Strategy 2: Progressive volume WITH price rise (递增放量拉升) — 25 points max ──
  if (maxProgressiveLen >= 5 && progressivePriceRise > 0.5) score += 25;
  else if (maxProgressiveLen >= 4 && progressivePriceRise > 0.3) score += 20;
  else if (maxProgressiveLen >= 3 && progressivePriceRise > 0.1) score += 15;
  else if (maxProgressiveLen >= 3 && progressivePriceRise > 0) score += 8;
  // Progressive volume but price dropped — penalize
  else if (maxProgressiveLen >= 3 && progressivePriceRise < -0.3) score -= 5;

  // ── Strategy 3: Volume expansion above baseline WITH price gain — 15 points max ──
  if (windowVolRatio >= 2 && windowPriceGain > 1) score += 15;
  else if (windowVolRatio >= 1.5 && windowPriceGain > 0.5) score += 12;
  else if (windowVolRatio >= 1.5 && windowPriceGain > 0.2) score += 8;
  else if (windowVolRatio >= 1.2 && windowPriceGain > 0.1) score += 5;
  // Volume expansion but price dropped
  else if (windowVolRatio >= 1.5 && windowPriceGain < -0.5) score -= 3;

  // ── Strategy 4: Concentrated buying (放量+上涨分钟占比) — 15 points max ──
  if (upHighVolRatio >= 0.4) score += 15;
  else if (upHighVolRatio >= 0.3) score += 12;
  else if (upHighVolRatio >= 0.2) score += 8;
  else if (upHighVolRatio >= 0.1) score += 4;

  // ── Strategy 5: Price surge magnitude during volume peak (放量拉高幅度) — 10 points max ──
  if (surgeRiseRate >= 3) score += 10;
  else if (surgeRiseRate >= 2) score += 8;
  else if (surgeRiseRate >= 1) score += 5;
  else if (surgeRiseRate >= 0.5) score += 3;

  // ── Strategy 6: Rise speed (拉升速度) — 5 points max ──
  if (maxRiseSpeed >= 2) score += 5;
  else if (maxRiseSpeed >= 1) score += 3;
  else if (maxRiseSpeed >= 0.5) score += 1;

  // ── Final gate: if no price rise at all, cap score very low ──
  if (!hasPriceRise) {
    score = Math.min(score, 5); // 放量不涨 = max 5 points
  }

  // Cap at 0-100
  score = Math.max(0, Math.min(100, score));

  // Build detail string — emphasize the "拉升" aspect
  const details: string[] = [];
  if (volumeRatio >= 1.5 && maxVolPriceChange > 0) {
    details.push(`${increments[maxVolIdx]?.time || ""}量比${volumeRatio.toFixed(1)}x拉升${maxVolPriceChange.toFixed(1)}%`);
  } else if (volumeRatio >= 1.5 && maxVolPriceChange <= 0) {
    details.push(`${increments[maxVolIdx]?.time || ""}放量滞涨量比${volumeRatio.toFixed(1)}x`);
  }
  if (maxProgressiveLen >= 3 && progressivePriceRise > 0) {
    details.push(`${maxProgressiveLen}分钟递增拉升涨${progressivePriceRise.toFixed(1)}%`);
  } else if (maxProgressiveLen >= 3 && progressivePriceRise <= 0) {
    details.push(`${maxProgressiveLen}分钟递增放量未涨`);
  }
  if (windowPriceGain >= 0.5) {
    details.push(`时段涨幅${windowPriceGain.toFixed(1)}%`);
  } else if (windowPriceGain < -0.5) {
    details.push(`时段跌${Math.abs(windowPriceGain).toFixed(1)}%`);
  }
  if (surgeRiseRate >= 1) {
    details.push(`放量拉高${surgeRiseRate.toFixed(1)}%`);
  }
  if (upHighVolRatio >= 0.2) {
    details.push(`${(upHighVolRatio * 100).toFixed(0)}%放量上涨`);
  }
  if (maxRiseSpeed >= 1) {
    details.push(`${increments[maxRiseStart]?.time || ""}3分钟急拉${maxRiseSpeed.toFixed(1)}%`);
  }

  return {
    score,
    detail: details.length > 0 ? details.join("，") : (score > 0 ? "轻微放量拉升" : "无明显放量拉升"),
  };
}

/**
 * Detect progressive volume increase (递增放量)
 * Returns { score: 0-100, detail: string }
 *
 * "递增放量" means consecutive minutes with steadily increasing volume,
 * typically indicating sustained buying interest. Unlike pulse (rapid spike)
 * or general volume surge, this specifically focuses on the progressive
 * (step-by-step) volume increase pattern.
 *
 * Key detection:
 * 1. Longest consecutive sequence of volume increases
 * 2. Whether the progressive volume accompanies price rise
 * 3. Volume acceleration rate (how fast volume grows each step)
 * 4. Multi-round progressive patterns
 */
function detectProgressiveVolume(
  timeline: { time: string; price: number; volume: number }[],
  prevClose: number,
  open: number,
  timeStart: string = "09:30",
  timeEnd: string = "10:30",
): { score: number; detail: string } {
  if (!timeline || timeline.length < 10 || prevClose <= 0) {
    return { score: 0, detail: "数据不足" };
  }

  // Parse time range
  const startMin = parseTimeToMinutes(timeStart);
  const endMin = parseTimeToMinutes(timeEnd);

  // Filter to the specified time window
  const session = timeline.filter(t => {
    const hour = parseInt(t.time.split(":")[0]);
    const minute = parseInt(t.time.split(":")[1]);
    const totalMin = hour * 60 + minute;
    return totalMin >= startMin && totalMin <= endMin;
  });

  if (session.length < 5) {
    return { score: 0, detail: "时段数据不足" };
  }

  // Calculate incremental volumes (each minute's actual volume)
  const increments: { time: string; price: number; vol: number; priceChange: number }[] = [];
  for (let i = 0; i < session.length; i++) {
    const prevVol = i > 0 ? session[i - 1].volume : 0;
    const curVol = session[i].volume;
    const vol = i === 0 ? curVol : Math.max(0, curVol - prevVol);
    const prevPrice = i > 0 ? session[i - 1].price : prevClose;
    const priceChange = prevPrice > 0 ? ((session[i].price - prevPrice) / prevPrice) * 100 : 0;
    increments.push({ time: session[i].time, price: session[i].price, vol, priceChange });
  }

  // ── Strategy 1: Find ALL progressive volume sequences (3+ consecutive increasing) ──
  interface ProgressiveSeq { startIdx: number; length: number; startPrice: number; endPrice: number; startVol: number; endVol: number; startVolTime: string; endVolTime: string; }
  const sequences: ProgressiveSeq[] = [];
  let curStart = 0;
  let curLen = 1;

  for (let i = 1; i < increments.length; i++) {
    if (increments[i].vol > increments[i - 1].vol && increments[i].vol > 0) {
      curLen++;
    } else {
      if (curLen >= 3) {
        sequences.push({
          startIdx: curStart, length: curLen,
          startPrice: increments[curStart].price, endPrice: increments[curStart + curLen - 1].price,
          startVol: increments[curStart].vol, endVol: increments[curStart + curLen - 1].vol,
          startVolTime: increments[curStart].time, endVolTime: increments[curStart + curLen - 1].time,
        });
      }
      curStart = i;
      curLen = 1;
    }
  }
  // Don't forget the last sequence
  if (curLen >= 3) {
    sequences.push({
      startIdx: curStart, length: curLen,
      startPrice: increments[curStart].price, endPrice: increments[curStart + curLen - 1].price,
      startVol: increments[curStart].vol, endVol: increments[curStart + curLen - 1].vol,
      startVolTime: increments[curStart].time, endVolTime: increments[curStart + curLen - 1].time,
    });
  }

  if (sequences.length === 0) {
    return { score: 0, detail: "无明显递增放量" };
  }

  // ── Strategy 2: Analyze the best sequence ──
  const bestSeq = sequences.reduce((best, seq) => seq.length > best.length ? seq : best, sequences[0]);
  const bestPriceRise = bestSeq.startPrice > 0
    ? ((bestSeq.endPrice - bestSeq.startPrice) / bestSeq.startPrice) * 100 : 0;
  const bestVolGrowth = bestSeq.startVol > 0
    ? ((bestSeq.endVol - bestSeq.startVol) / bestSeq.startVol) * 100 : 0;

  // ── Strategy 3: Volume acceleration rate ──
  // How fast does volume grow per step in the best sequence?
  let totalStepGrowth = 0;
  let stepCount = 0;
  for (let i = bestSeq.startIdx + 1; i < bestSeq.startIdx + bestSeq.length; i++) {
    if (increments[i - 1].vol > 0) {
      totalStepGrowth += (increments[i].vol - increments[i - 1].vol) / increments[i - 1].vol;
      stepCount++;
    }
  }
  const avgStepGrowthRate = stepCount > 0 ? (totalStepGrowth / stepCount) * 100 : 0;

  // ── Strategy 4: Multi-round progressive (multiple sequences = sustained buying) ──
  const progressiveRounds = sequences.length;
  const totalPriceRise = sequences.reduce((sum, seq) => {
    return sum + (seq.startPrice > 0 ? ((seq.endPrice - seq.startPrice) / seq.startPrice) * 100 : 0);
  }, 0);
  const sequencesWithPriceRise = sequences.filter(s => s.startPrice > 0 && s.endPrice > s.startPrice).length;

  // ── Strategy 5: Total progressive volume vs total volume ratio ──
  const totalProgressiveVol = sequences.reduce((sum, seq) => {
    let vol = 0;
    for (let i = seq.startIdx; i < seq.startIdx + seq.length; i++) vol += increments[i].vol;
    return sum + vol;
  }, 0);
  const totalVol = increments.reduce((s, t) => s + t.vol, 0);
  const progressiveVolRatio = totalVol > 0 ? totalProgressiveVol / totalVol : 0;

  // ── Calculate composite score ──
  let score = 0;

  // Best sequence length (most important indicator)
  if (bestSeq.length >= 8) score += 30;
  else if (bestSeq.length >= 6) score += 25;
  else if (bestSeq.length >= 5) score += 20;
  else if (bestSeq.length >= 4) score += 15;
  else if (bestSeq.length >= 3) score += 10;

  // Price rise during progressive volume (very important)
  if (bestPriceRise >= 3) score += 25;
  else if (bestPriceRise >= 2) score += 20;
  else if (bestPriceRise >= 1) score += 15;
  else if (bestPriceRise >= 0.5) score += 10;
  else if (bestPriceRise >= 0) score += 3;
  // If price drops during progressive volume, penalize
  if (bestPriceRise < -0.5) score -= 5;

  // Volume growth rate in the sequence
  if (bestVolGrowth >= 300) score += 15;
  else if (bestVolGrowth >= 200) score += 12;
  else if (bestVolGrowth >= 100) score += 8;
  else if (bestVolGrowth >= 50) score += 5;
  else if (bestVolGrowth >= 20) score += 3;

  // Multi-round progressive bonus
  if (progressiveRounds >= 3 && sequencesWithPriceRise >= 2) score += 10;
  else if (progressiveRounds >= 2 && sequencesWithPriceRise >= 1) score += 6;
  else if (progressiveRounds >= 2) score += 3;

  // Average step growth rate (acceleration)
  if (avgStepGrowthRate >= 50) score += 8;
  else if (avgStepGrowthRate >= 30) score += 5;
  else if (avgStepGrowthRate >= 15) score += 3;

  // Progressive volume ratio
  if (progressiveVolRatio >= 0.5) score += 7;
  else if (progressiveVolRatio >= 0.3) score += 4;
  else if (progressiveVolRatio >= 0.2) score += 2;

  // Cap at 0-100
  score = Math.max(0, Math.min(100, score));

  // Build detail string
  const details: string[] = [];
  if (bestSeq.length >= 3) {
    details.push(`${bestSeq.length}分钟递增${bestPriceRise >= 0 ? `涨${bestPriceRise.toFixed(1)}%` : `跌${Math.abs(bestPriceRise).toFixed(1)}%`}`);
  }
  if (progressiveRounds >= 2) {
    details.push(`${progressiveRounds}轮递增`);
  }
  if (bestVolGrowth >= 50) {
    details.push(`量增${bestVolGrowth.toFixed(0)}%`);
  }
  if (avgStepGrowthRate >= 15) {
    details.push(`均步增速${avgStepGrowthRate.toFixed(0)}%`);
  }
  if (progressiveVolRatio >= 0.3) {
    details.push(`递增量占比${(progressiveVolRatio * 100).toFixed(0)}%`);
  }

  return {
    score,
    detail: details.length > 0 ? details.join("，") : (score > 0 ? "轻微递增" : "无明显递增放量"),
  };
}

/**
 * Check if a stock code belongs to main board
 * Main board: 600xxx, 601xxx, 603xxx, 605xxx (SH), 000xxx, 001xxx, 002xxx (SZ)
 */
function isMainBoard(code: string): boolean {
  // Shanghai main board
  if (/^60[0135]\d{3}$/.test(code)) return true;
  // Shenzhen main board (including 中小板 002xxx)
  if (/^00[01]\d{3}$/.test(code)) return true;
  if (/^002\d{3}$/.test(code)) return true;
  return false;
}

/**
 * Check if a stock name contains ST
 */
function isST(name: string): boolean {
  return /ST|\\*ST|SST|S\\*ST/.test(name.toUpperCase());
}

/**
 * Check if a stock code belongs to ChiNext (创业板)
 */
function isChiNext(code: string): boolean {
  return code.startsWith("300") || code.startsWith("301");
}

/**
 * Check if a stock code belongs to STAR Market (科创板)
 */
function isSTAR(code: string): boolean {
  return code.startsWith("688") || code.startsWith("689");
}

/**
 * Check if a stock code belongs to Beijing Stock Exchange (北交所)
 */
function isBSE(code: string): boolean {
  return code.startsWith("8") || code.startsWith("4");
}

/**
 * Check if a code is an ETF
 */
function isETF(code: string): boolean {
  return code.startsWith("51") || code.startsWith("56") || code.startsWith("58") ||
         code.startsWith("15") || code.startsWith("16") || code.startsWith("18");
}

/**
 * Evaluate a stock's short-term outlook based on multiple factors
 * Returns a label and detail string for the evaluation
 *
 * Labels: 强势续涨, 温和看多, 震荡整理, 拉高出货, 弱势回调, 观望等待
 */
function evaluateStock(stock: ScreenerStock): { label: string; detail: string } {
  let bullishScore = 0;
  let bearishScore = 0;
  const reasons: string[] = [];

  // ── Bullish factors ──

  // 1. Strong signal score (pulse + volume surge)
  const maxScore = Math.max(stock.pulseScore, stock.volumeSurgeScore);
  if (maxScore >= 70) { bullishScore += 3; reasons.push("强脉冲信号"); }
  else if (maxScore >= 50) { bullishScore += 2; reasons.push("中等信号"); }
  else if (maxScore >= 30) { bullishScore += 1; }

  // 2. Price near high (within 1% of day's high)
  if (stock.high > 0 && (stock.high - stock.price) / stock.high < 0.01) {
    bullishScore += 2; reasons.push("价格接近日高");
  } else if (stock.high > 0 && (stock.high - stock.price) / stock.high < 0.03) {
    bullishScore += 1;
  }

  // 3. Main force net inflow
  if (stock.mainNetInflow > 0) {
    const inflowRatio = Math.abs(stock.mainNetInflow) / (stock.amount || 1);
    if (inflowRatio > 0.05) { bullishScore += 2; reasons.push("主力大幅净流入"); }
    else if (inflowRatio > 0.02) { bullishScore += 1; reasons.push("主力净流入"); }
  }

  // 4. Moderate turnover (3%-15% is healthy)
  if (stock.turnover >= 3 && stock.turnover <= 15) {
    bullishScore += 1; reasons.push("换手适中");
  }

  // 5. Intraday strength (positive change with rising trend)
  if (stock.changePercent > 2) { bullishScore += 2; reasons.push("涨幅强劲"); }
  else if (stock.changePercent > 1) { bullishScore += 1; }

  // 6. Mid-to-large cap is more stable
  const capYi = stock.marketCap / 1e8;
  if (capYi >= 50 && capYi <= 200) {
    bullishScore += 1; reasons.push("市值适中");
  }

  // 7. Pulse + volume resonance
  if (stock.pulseScore >= 40 && stock.volumeSurgeScore >= 40) {
    bullishScore += 2; reasons.push("脉冲放量共振");
  }

  // 7b. Progressive volume increase (递增放量) is a strong bullish signal
  if (stock.progressiveVolScore >= 70) { bullishScore += 2; reasons.push("强递增放量"); }
  else if (stock.progressiveVolScore >= 50) { bullishScore += 2; reasons.push("递增放量"); }
  else if (stock.progressiveVolScore >= 30) { bullishScore += 1; reasons.push("轻微递增"); }

  // 7c. Progressive volume + pulse/volume surge resonance
  if (stock.progressiveVolScore >= 40 && (stock.pulseScore >= 30 || stock.volumeSurgeScore >= 30)) {
    bullishScore += 1; reasons.push("递增放量共振");
  }

  // 8. Volume ratio > 1.5 indicates active trading interest
  if (stock.volumeRatio >= 1.5) {
    bullishScore += 1; reasons.push("量比偏强");
  }

  // 9. Low amplitude with decline suggests stable consolidation
  if (stock.amplitude <= 3 && stock.changePercent >= -1 && stock.changePercent <= 0) {
    bullishScore += 1; reasons.push("低振幅抗跌");
  }

  // 10. PE < 30 and positive suggests reasonable valuation
  if (stock.pe > 0 && stock.pe <= 30) {
    bullishScore += 1; reasons.push("PE估值合理");
  }

  // ── Bearish factors ──

  // 1. Long upper shadow (冲高回落 signal)
  if (stock.high > stock.open && stock.high > stock.price) {
    const upperShadow = (stock.high - Math.max(stock.open, stock.price)) / stock.high;
    if (upperShadow > 0.03) { bearishScore += 3; reasons.push("长上影线"); }
    else if (upperShadow > 0.02) { bearishScore += 2; reasons.push("上影线"); }
    else if (upperShadow > 0.01) { bearishScore += 1; }
  }

  // 2. Main force net outflow
  if (stock.mainNetInflow < 0) {
    const outflowRatio = Math.abs(stock.mainNetInflow) / (stock.amount || 1);
    if (outflowRatio > 0.05) { bearishScore += 3; reasons.push("主力大幅净流出"); }
    else if (outflowRatio > 0.02) { bearishScore += 2; reasons.push("主力净流出"); }
    else { bearishScore += 1; }
  }

  // 3. High turnover (excessive speculation)
  if (stock.turnover > 20) { bearishScore += 3; reasons.push("换手过高"); }
  else if (stock.turnover > 15) { bearishScore += 1; }

  // 4. Price reversal (opened high but now low)
  if (stock.open > stock.prevClose && stock.price < stock.prevClose) {
    bearishScore += 2; reasons.push("高开低走");
  }

  // 5. Weak price (below open)
  if (stock.price < stock.open && stock.open > 0) {
    const dropFromOpen = (stock.open - stock.price) / stock.open;
    if (dropFromOpen > 0.02) { bearishScore += 1; reasons.push("盘面偏弱"); }
  }

  // 6. Large amplitude decline
  if (stock.amplitude > 6 && stock.changePercent < 1) {
    bearishScore += 2; reasons.push("大幅震荡偏弱");
  }

  // 7. Post-pulse decline (high pulse score but price dropping)
  if (stock.pulseScore >= 50 && stock.changePercent < 1.5) {
    bearishScore += 1; reasons.push("脉冲后回落");
  }

  // 8. Small cap manipulation risk
  if (capYi < 30) {
    bearishScore += 1; reasons.push("小盘易操控");
  }

  // ── Determine label ──
  const diff = bullishScore - bearishScore;

  let label: string;
  if (diff >= 5) label = "强势续涨";
  else if (diff >= 2) label = "温和看多";
  else if (diff >= -1) label = "震荡整理";
  else if (diff >= -3) label = "弱势回调";
  else if (diff >= -5) label = "拉高出货";
  else label = "观望等待";

  // Override: if strong bearish signals, force negative labels
  if (bearishScore >= 5 && diff < 2) {
    if (stock.mainNetInflow < 0 && stock.changePercent > 0) {
      label = "拉高出货";
    } else if (bearishScore >= 6) {
      label = "观望等待";
    }
  }

  const detail = reasons.length > 0 ? reasons.join("；") : "综合评估";

  return { label, detail };
}

/**
 * Detect VWAP position relative to current price
 * VWAP = Volume Weighted Average Price = cumulative(price * volume) / cumulative(volume)
 *
 * Since timeline data has CUMULATIVE volume, we first compute per-minute volumes.
 *
 * Returns:
 * - position: "above_vwap" | "below_vwap" | "near_vwap" | "cross_up" | "cross_down" | "no_data"
 * - detail: human-readable description
 */
function detectVWAPPosition(
  timeline: { time: string; price: number; volume: number }[],
  currentPrice: number,
): { position: string; detail: string } {
  if (!timeline || timeline.length < 3) {
    return { position: "no_data", detail: "无分时数据" };
  }

  // Calculate per-minute volumes and VWAP
  let cumulativePV = 0; // cumulative(price * per_minute_volume)
  let cumulativeVol = 0; // cumulative(per_minute_volume)
  const vwapPoints: { time: string; price: number; vwap: number }[] = [];

  for (let i = 0; i < timeline.length; i++) {
    const prevVol = i > 0 ? timeline[i - 1].volume : 0;
    const curCumVol = timeline[i].volume;
    const minuteVol = i === 0 ? curCumVol : Math.max(0, curCumVol - prevVol);

    cumulativePV += timeline[i].price * minuteVol;
    cumulativeVol += minuteVol;

    const vwap = cumulativeVol > 0 ? cumulativePV / cumulativeVol : timeline[i].price;
    vwapPoints.push({ time: timeline[i].time, price: timeline[i].price, vwap });
  }

  if (cumulativeVol <= 0) {
    return { position: "no_data", detail: "成交量数据异常" };
  }

  const currentVWAP = cumulativePV / cumulativeVol;
  const deviation = ((currentPrice - currentVWAP) / currentVWAP) * 100;

  // Check for recent cross events (within last 5 minutes)
  const recentCount = Math.min(5, vwapPoints.length);
  const recentPoints = vwapPoints.slice(-recentCount);

  let crossUp = false;
  let crossDown = false;
  for (let i = 1; i < recentPoints.length; i++) {
    const prevBelow = recentPoints[i - 1].price < recentPoints[i - 1].vwap;
    const prevAbove = recentPoints[i - 1].price > recentPoints[i - 1].vwap;
    const curAbove = recentPoints[i].price > recentPoints[i].vwap;
    const curBelow = recentPoints[i].price < recentPoints[i].vwap;
    if (prevBelow && curAbove) crossUp = true;
    if (prevAbove && curBelow) crossDown = true;
  }

  // Determine position
  let position: string;
  let detail: string;

  if (crossUp) {
    position = "cross_up";
    detail = `刚突破均价线(偏离${deviation > 0 ? "+" : ""}${deviation.toFixed(2)}%)`;
  } else if (crossDown) {
    position = "cross_down";
    detail = `刚跌破均价线(偏离${deviation > 0 ? "+" : ""}${deviation.toFixed(2)}%)`;
  } else if (Math.abs(deviation) <= 0.5) {
    position = "near_vwap";
    detail = `价格贴近均价线(偏离${deviation > 0 ? "+" : ""}${deviation.toFixed(2)}%)`;
  } else if (deviation > 0.5) {
    position = "above_vwap";
    detail = `均价线上方(偏离+${deviation.toFixed(2)}%)`;
  } else {
    position = "below_vwap";
    detail = `均价线下方(偏离${deviation.toFixed(2)}%)`;
  }

  return { position, detail };
}

/**
 * Analyze capital trend based on mainNetInflow and amount
 *
 * Classification:
 * - strong_inflow: mainNetInflow > 5% of amount (主力大幅流入)
 * - moderate_inflow: mainNetInflow > 2% of amount (主力温和流入)
 * - neutral: mainNetInflow between -2% and 2% of amount (资金中性)
 * - outflow: mainNetInflow < -2% of amount (主力流出)
 * - strong_outflow: mainNetInflow < -5% of amount (主力大幅流出)
 */
function analyzeCapitalTrend(
  mainNetInflow: number,
  amount: number,
): { trend: string; detail: string } {
  const safeAmount = amount || 1;
  const inflowRatio = (mainNetInflow / safeAmount) * 100;

  let trend: string;
  let detail: string;

  if (inflowRatio > 5) {
    trend = "strong_inflow";
    detail = `主力大幅流入(占比${inflowRatio.toFixed(1)}%)`;
  } else if (inflowRatio > 2) {
    trend = "moderate_inflow";
    detail = `主力温和流入(占比${inflowRatio.toFixed(1)}%)`;
  } else if (inflowRatio >= -2) {
    trend = "neutral";
    detail = `资金中性(占比${inflowRatio.toFixed(1)}%)`;
  } else if (inflowRatio >= -5) {
    trend = "outflow";
    detail = `主力流出(占比${inflowRatio.toFixed(1)}%)`;
  } else {
    trend = "strong_outflow";
    detail = `主力大幅流出(占比${inflowRatio.toFixed(1)}%)`;
  }

  return { trend, detail };
}

/**
 * Calculate composite score combining ALL factors with weights
 *
 * Weight allocation:
 * - pulseScore: 20% (脉冲拉升)
 * - volumeSurgeScore: 20% (放量拉升)
 * - progressiveVolScore: 15% (递增放量)
 * - evaluation signal: 15% (评估信号)
 * - capital trend: 15% (资金趋势)
 * - price position (VWAP): 15% (价格位置)
 *
 * Final composite score = sum of (weight * normalized_score), capped at 0-100
 */
function calculateCompositeScore(
  pulseScore: number,
  volumeSurgeScore: number,
  progressiveVolScore: number,
  evaluation: string,
  capitalTrend: string,
  vwapPosition: string,
): { score: number; detail: string } {
  // Normalize evaluation to a 0-100 score
  const evalScoreMap: Record<string, number> = {
    "强势续涨": 100,
    "温和看多": 75,
    "震荡整理": 50,
    "弱势回调": 30,
    "拉高出货": 20,
    "观望等待": 10,
  };
  const evalScore = evalScoreMap[evaluation] ?? 50;

  // Normalize capital trend to a 0-100 score
  const capitalScoreMap: Record<string, number> = {
    strong_inflow: 100,
    moderate_inflow: 75,
    neutral: 50,
    outflow: 25,
    strong_outflow: 10,
  };
  const capitalScore = capitalScoreMap[capitalTrend] ?? 50;

  // Normalize VWAP position to a 0-100 score
  const vwapScoreMap: Record<string, number> = {
    above_vwap: 90,
    near_vwap: 70,
    cross_up: 85,
    cross_down: 40,
    below_vwap: 30,
    no_data: 50,
  };
  const vwapScore = vwapScoreMap[vwapPosition] ?? 50;

  // Calculate weighted score
  const weightedScore =
    pulseScore * 0.20 +
    volumeSurgeScore * 0.20 +
    progressiveVolScore * 0.15 +
    evalScore * 0.15 +
    capitalScore * 0.15 +
    vwapScore * 0.15;

  const score = Math.max(0, Math.min(100, Math.round(weightedScore * 10) / 10));

  // Build detail string
  const details: string[] = [];
  if (pulseScore >= 30) details.push(`脉冲${pulseScore.toFixed(0)}`);
  if (volumeSurgeScore >= 30) details.push(`放量拉升${volumeSurgeScore.toFixed(0)}`);
  if (progressiveVolScore >= 30) details.push(`递增${progressiveVolScore.toFixed(0)}`);
  details.push(`评估${evalScore}`);
  details.push(`资金${capitalScore}`);
  details.push(`均价${vwapScore}`);

  return { score, detail: details.join("/") };
}

/**
 * Detect multi-factor resonance (多因子共振)
 *
 * Resonance rules:
 * - 脉冲放量共振: pulseScore >= 40 AND volumeSurgeScore >= 40
 * - 递增放量共振: progressiveVolScore >= 40 AND (pulseScore >= 30 OR volumeSurgeScore >= 30)
 * - 三因子共振: pulseScore >= 40 AND volumeSurgeScore >= 40 AND progressiveVolScore >= 40
 * - 资金量能共振: capitalTrend includes "inflow" AND (pulseScore >= 30 OR volumeSurgeScore >= 30)
 * - 均线共振: vwapPosition is "above_vwap" or "cross_up" AND (pulseScore >= 30 OR volumeSurgeScore >= 30)
 *
 * Returns comma-separated tags or empty string if no resonance
 */
function detectResonance(
  pulseScore: number,
  volumeSurgeScore: number,
  progressiveVolScore: number,
  capitalTrend: string,
  vwapPosition: string,
): string {
  const tags: string[] = [];

  // 脉冲放量共振
  if (pulseScore >= 40 && volumeSurgeScore >= 40) {
    tags.push("脉冲放量共振");
  }

  // 递增放量共振
  if (progressiveVolScore >= 40 && (pulseScore >= 30 || volumeSurgeScore >= 30)) {
    tags.push("递增放量共振");
  }

  // 三因子共振
  if (pulseScore >= 40 && volumeSurgeScore >= 40 && progressiveVolScore >= 40) {
    tags.push("三因子共振");
  }

  // 资金量能共振
  if (capitalTrend.includes("inflow") && (pulseScore >= 30 || volumeSurgeScore >= 30)) {
    tags.push("资金量能共振");
  }

  // 均线共振
  if ((vwapPosition === "above_vwap" || vwapPosition === "cross_up") && (pulseScore >= 30 || volumeSurgeScore >= 30)) {
    tags.push("均线共振");
  }

  return tags.join(",");
}

// ── Main Handler ────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const minChange = parseFloat(searchParams.get("minChange") || "-5");
  const maxChange = parseFloat(searchParams.get("maxChange") || "10");
  const maxMarketCap = parseFloat(searchParams.get("maxMarketCap") || "200"); // 亿元
  const sectorKeyword = searchParams.get("sector") || "通信";
  const pulseThreshold = parseInt(searchParams.get("pulseThreshold") || "10"); // 脉冲评分阈值
  const enablePulseDetection = searchParams.get("pulse") !== "false";
  const pulseTimeStart = searchParams.get("pulseTimeStart") || "09:30";
  const pulseTimeEnd = searchParams.get("pulseTimeEnd") || "10:30";
  const enableVolumeSurge = searchParams.get("volumeSurge") !== "false";
  const volumeSurgeThreshold = parseInt(searchParams.get("volumeSurgeThreshold") || "10");
  const enableProgressiveVol = searchParams.get("progressiveVol") !== "false";
  const progressiveVolThreshold = parseInt(searchParams.get("progressiveVolThreshold") || "10");
  const minTurnover = parseFloat(searchParams.get("minTurnover") || "0");
  const maxTurnover = parseFloat(searchParams.get("maxTurnover") || "100");
  const minPE = parseFloat(searchParams.get("minPE") || "0");
  const maxPE = parseFloat(searchParams.get("maxPE") || "500");
  const minVolumeRatio = parseFloat(searchParams.get("minVolumeRatio") || "0");
  const mainNetInflowRequired = searchParams.get("mainNetInflowRequired") === "true";
  const minAmplitude = parseFloat(searchParams.get("minAmplitude") || "0");
  const maxAmplitude = parseFloat(searchParams.get("maxAmplitude") || "20");
  const enableMATrend = searchParams.get("enableMATrend") === "true";
  const maTrendType = searchParams.get("maTrendType") || "above_ma5";
  const forceRefresh = searchParams.get("refresh") === "1";

  // Check server cache first
  const cacheKey = buildCacheKey({
    minChange, maxChange, maxMarketCap, sector: sectorKeyword,
    pulseThreshold, pulse: enablePulseDetection,
    pulseTimeStart, pulseTimeEnd,
    volumeSurge: enableVolumeSurge, volumeSurgeThreshold,
    progressiveVol: enableProgressiveVol, progressiveVolThreshold,
    minTurnover, maxTurnover, minPE, maxPE, minVolumeRatio,
    mainNetInflowRequired, minAmplitude, maxAmplitude,
    enableMATrend, maTrendType,
  });
  if (!forceRefresh) {
    const cached = screenerCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json({ ...cached.data, cached: true });
    }
  }

  try {
    // Step 1: Find sectors by keyword
    const sectors = await findSectorsByKeyword(sectorKeyword);
    if (sectors.length === 0) {
      return NextResponse.json({
        success: false,
        stocks: [],
        totalCount: 0,
        filteredCount: 0,
        sectorName: "",
        sectorCode: "",
        timestamp: new Date().toISOString(),
        error: `未找到"${sectorKeyword}"相关板块`,
      } as ScreenerResult);
    }

    // Step 2: Fetch stocks from all matching sectors
    const allRawStocks: any[] = [];
    let sectorName = "";
    let sectorCode = "";

    for (const sector of sectors) {
      const stocks = await getSectorStocks(sector.code);
      if (stocks.length > 0) {
        allRawStocks.push(...stocks);
        if (!sectorName) {
          sectorName = sector.name;
          sectorCode = sector.code;
        }
      }
    }

    // Combine sector names
    const allSectorNames = sectors.map(s => s.name).join("、");
    sectorName = allSectorNames || sectorName;
    sectorCode = sectors.map(s => s.code).join(",");

    // Deduplicate by stock code
    const seenCodes = new Set<string>();
    const uniqueStocks = allRawStocks.filter((s: any) => {
      const code = String(s.f12 || "");
      if (seenCodes.has(code)) return false;
      seenCodes.add(code);
      return true;
    });

    const totalCount = uniqueStocks.length;

    // Step 3: Parse and filter
    const candidates: ScreenerStock[] = [];

    for (const stock of uniqueStocks) {
      const code = String(stock.f12 || "");
      const name = String(stock.f14 || "");

      // Skip ETFs
      if (isETF(code)) continue;

      // Skip if not main board
      if (!isMainBoard(code)) continue;

      // Skip ST stocks
      if (isST(name)) continue;

      // Parse numeric fields
      const price = parseFloat(stock.f2) || 0;
      const prevClose = parseFloat(stock.f18) || 0;
      const open = parseFloat(stock.f17) || 0;
      const high = parseFloat(stock.f15) || 0;
      const low = parseFloat(stock.f16) || 0;
      const changePercent = parseFloat(stock.f3) || 0;
      const changeAmount = parseFloat(stock.f4) || 0;
      const volume = parseFloat(stock.f5) || 0;
      const amount = parseFloat(stock.f6) || 0;
      const amplitude = parseFloat(stock.f7) || 0;
      const turnover = parseFloat(stock.f8) || 0;
      const pe = parseFloat(stock.f9) || 0;
      const marketCap = parseFloat(stock.f20) || 0; // 总市值 in 元
      const circulatingMarketCap = parseFloat(stock.f21) || 0;
      const mainNetInflow = parseFloat(stock.f62) || 0;
      const volumeRatio = parseFloat(stock.f10) || 0;

      // Skip invalid data
      if (price <= 0 || prevClose <= 0) continue;

      // Filter: change percent between minChange and maxChange
      if (changePercent < minChange || changePercent > maxChange) continue;

      // Filter: market cap < maxMarketCap (convert from 元 to 亿)
      const marketCapYi = marketCap / 1e8;
      if (marketCapYi > maxMarketCap || marketCapYi <= 0) continue;

      // Filter: turnover rate
      if (turnover < minTurnover || turnover > maxTurnover) continue;

      // Filter: PE ratio (skip negative PE stocks if maxPE < 0 means include all)
      if (pe > 0 && (pe < minPE || pe > maxPE)) continue;

      // Filter: volume ratio
      if (volumeRatio < minVolumeRatio) continue;

      // Filter: main net inflow
      if (mainNetInflowRequired && mainNetInflow <= 0) continue;

      // Filter: amplitude
      if (amplitude < minAmplitude || amplitude > maxAmplitude) continue;

      candidates.push({
        symbol: code,
        name,
        exchange: code.startsWith("6") ? "SH" : "SZ",
        price,
        prevClose,
        open,
        high,
        low,
        changePercent,
        changeAmount,
        volume,
        amount,
        turnover,
        marketCap,
        circulatingMarketCap,
        pe,
        amplitude,
        mainNetInflow,
        pulseScore: 0,
        pulseDetail: "待检测",
        volumeSurgeScore: 0,
        volumeSurgeDetail: "待检测",
        progressiveVolScore: 0,
        progressiveVolDetail: "待检测",
        evaluation: "待评估",
        evaluationDetail: "",
        reliabilityScore: 0,
        reliabilityDetail: "",
        volumeRatio,
        compositeScore: 0,
        compositeDetail: "",
        resonanceTags: "",
        vwapPosition: "no_data",
        vwapPositionDetail: "",
        capitalTrend: "neutral",
        capitalTrendDetail: "",
      });
    }

    // Step 4: Pulse, Volume surge & Progressive volume detection for candidates
    const needPulse = enablePulseDetection;
    const needVolumeSurge = enableVolumeSurge;
    const needProgressiveVol = enableProgressiveVol;
    if ((needPulse || needVolumeSurge || needProgressiveVol) && candidates.length > 0) {
      // Fetch timeline data in batches (concurrent with limit)
      const batchSize = 5;
      for (let i = 0; i < candidates.length; i += batchSize) {
        const batch = candidates.slice(i, i + batchSize);
        const timelinePromises = batch.map(async (stock) => {
          const timeline = await getStockTimeline(stock.symbol);
          if (needPulse) {
            const pulseResult = detectPulseSurge(timeline, stock.prevClose, stock.open, pulseTimeStart, pulseTimeEnd);
            stock.pulseScore = pulseResult.score;
            stock.pulseDetail = pulseResult.detail;
          }
          if (needVolumeSurge) {
            const volResult = detectVolumeSurge(timeline, stock.prevClose, stock.open, pulseTimeStart, pulseTimeEnd);
            stock.volumeSurgeScore = volResult.score;
            stock.volumeSurgeDetail = volResult.detail;
          }
          if (needProgressiveVol) {
            const progResult = detectProgressiveVolume(timeline, stock.prevClose, stock.open, pulseTimeStart, pulseTimeEnd);
            stock.progressiveVolScore = progResult.score;
            stock.progressiveVolDetail = progResult.detail;
          }
          // Evaluate stock after detection
          const evalResult = evaluateStock(stock);
          stock.evaluation = evalResult.label;
          stock.evaluationDetail = evalResult.detail;

          // Detect VWAP position from timeline data
          const vwapResult = detectVWAPPosition(timeline, stock.price);
          stock.vwapPosition = vwapResult.position;
          stock.vwapPositionDetail = vwapResult.detail;

          // Analyze capital trend
          const capitalResult = analyzeCapitalTrend(stock.mainNetInflow, stock.amount);
          stock.capitalTrend = capitalResult.trend;
          stock.capitalTrendDetail = capitalResult.detail;

          // Detect resonance
          stock.resonanceTags = detectResonance(
            stock.pulseScore, stock.volumeSurgeScore, stock.progressiveVolScore,
            stock.capitalTrend, stock.vwapPosition,
          );

          // Calculate composite score
          const compResult = calculateCompositeScore(
            stock.pulseScore, stock.volumeSurgeScore, stock.progressiveVolScore,
            stock.evaluation, stock.capitalTrend, stock.vwapPosition,
          );
          stock.compositeScore = compResult.score;
          stock.compositeDetail = compResult.detail;
        });
        await Promise.allSettled(timelinePromises);
      }

      // Filter: pulse OR volumeSurge OR progressiveVol (OR relationship)
      // Stock passes if any enabled factor meets its threshold
      let filtered = candidates.filter(s => {
        const pulsePass = needPulse && s.pulseScore >= pulseThreshold;
        const volPass = needVolumeSurge && s.volumeSurgeScore >= volumeSurgeThreshold;
        const progPass = needProgressiveVol && s.progressiveVolScore >= progressiveVolThreshold;
        return pulsePass || volPass || progPass;
      });

      // Step 4b: MA trend detection if enabled
      if (enableMATrend && filtered.length > 0) {
        const maResults = new Map<string, { pass: boolean; detail: string }>();
        const maBatchSize = 5;
        for (let i = 0; i < filtered.length; i += maBatchSize) {
          const batch = filtered.slice(i, i + maBatchSize);
          const maPromises = batch.map(async (stock) => {
            const klineData = await fetchDailyKline(stock.symbol);
            const maResult = checkMATrend(klineData, stock.price, maTrendType);
            maResults.set(stock.symbol, maResult);
          });
          await Promise.allSettled(maPromises);
        }

        // Apply MA trend filter
        filtered = filtered.filter(s => {
          const maResult = maResults.get(s.symbol);
          return maResult ? maResult.pass : false;
        });

        // Calculate reliability scores with MA data
        for (const stock of filtered) {
          const maResult = maResults.get(stock.symbol);
          const reliability = calculateReliabilityScore(stock, maResult?.pass);
          stock.reliabilityScore = reliability.score;
          stock.reliabilityDetail = reliability.detail;
        }
      } else {
        // Calculate reliability scores without MA data
        for (const stock of filtered) {
          const reliability = calculateReliabilityScore(stock, false);
          stock.reliabilityScore = reliability.score;
          stock.reliabilityDetail = reliability.detail;
        }
      }

      // Sort by compositeScore (desc), then reliabilityScore (desc), then changePercent (desc)
      filtered.sort((a, b) => {
        if (b.compositeScore !== a.compositeScore) return b.compositeScore - a.compositeScore;
        if (b.reliabilityScore !== a.reliabilityScore) return b.reliabilityScore - a.reliabilityScore;
        return b.changePercent - a.changePercent;
      });

      const result: ScreenerResult = {
        success: true,
        stocks: filtered,
        totalCount,
        filteredCount: filtered.length,
        sectorName,
        sectorCode,
        timestamp: new Date().toISOString(),
      };

      // Store in server cache
      screenerCache.set(cacheKey, { data: result, timestamp: Date.now() });

      return NextResponse.json(result);
    }

    // Evaluate all candidates without pulse detection
    // Step 4b-alt: MA trend detection if enabled (no pulse/volume path)
    if (enableMATrend && candidates.length > 0) {
      const maResults = new Map<string, { pass: boolean; detail: string }>();
      const maBatchSize = 5;
      for (let i = 0; i < candidates.length; i += maBatchSize) {
        const batch = candidates.slice(i, i + maBatchSize);
        const maPromises = batch.map(async (stock) => {
          const klineData = await fetchDailyKline(stock.symbol);
          const maResult = checkMATrend(klineData, stock.price, maTrendType);
          maResults.set(stock.symbol, maResult);
        });
        await Promise.allSettled(maPromises);
      }

      // Apply MA trend filter
      const maFiltered = candidates.filter(s => {
        const maResult = maResults.get(s.symbol);
        return maResult ? maResult.pass : false;
      });

      // Evaluate and calculate reliability scores
      for (const stock of maFiltered) {
        const evalResult = evaluateStock(stock);
        stock.evaluation = evalResult.label;
        stock.evaluationDetail = evalResult.detail;
        const maResult = maResults.get(stock.symbol);
        const reliability = calculateReliabilityScore(stock, maResult?.pass);
        stock.reliabilityScore = reliability.score;
        stock.reliabilityDetail = reliability.detail;

        // Compute new fields (no timeline data in this path, so VWAP = no_data)
        stock.vwapPosition = "no_data";
        stock.vwapPositionDetail = "";
        const capitalResult = analyzeCapitalTrend(stock.mainNetInflow, stock.amount);
        stock.capitalTrend = capitalResult.trend;
        stock.capitalTrendDetail = capitalResult.detail;
        stock.resonanceTags = detectResonance(
          stock.pulseScore, stock.volumeSurgeScore, stock.progressiveVolScore,
          stock.capitalTrend, stock.vwapPosition,
        );
        const compResult = calculateCompositeScore(
          stock.pulseScore, stock.volumeSurgeScore, stock.progressiveVolScore,
          stock.evaluation, stock.capitalTrend, stock.vwapPosition,
        );
        stock.compositeScore = compResult.score;
        stock.compositeDetail = compResult.detail;
      }

      // Sort by compositeScore desc, then reliabilityScore desc, then changePercent desc
      maFiltered.sort((a, b) => {
        if (b.compositeScore !== a.compositeScore) return b.compositeScore - a.compositeScore;
        if (b.reliabilityScore !== a.reliabilityScore) return b.reliabilityScore - a.reliabilityScore;
        return b.changePercent - a.changePercent;
      });

      const maResult: ScreenerResult = {
        success: true,
        stocks: maFiltered,
        totalCount,
        filteredCount: maFiltered.length,
        sectorName,
        sectorCode,
        timestamp: new Date().toISOString(),
      };

      screenerCache.set(cacheKey, { data: maResult, timestamp: Date.now() });
      return NextResponse.json(maResult);
    }

    for (const stock of candidates) {
      const evalResult = evaluateStock(stock);
      stock.evaluation = evalResult.label;
      stock.evaluationDetail = evalResult.detail;
      const reliability = calculateReliabilityScore(stock, false);
      stock.reliabilityScore = reliability.score;
      stock.reliabilityDetail = reliability.detail;

      // Compute new fields (no timeline data in this path, so VWAP = no_data)
      stock.vwapPosition = "no_data";
      stock.vwapPositionDetail = "";
      const capitalResult = analyzeCapitalTrend(stock.mainNetInflow, stock.amount);
      stock.capitalTrend = capitalResult.trend;
      stock.capitalTrendDetail = capitalResult.detail;
      stock.resonanceTags = detectResonance(
        stock.pulseScore, stock.volumeSurgeScore, stock.progressiveVolScore,
        stock.capitalTrend, stock.vwapPosition,
      );
      const compResult = calculateCompositeScore(
        stock.pulseScore, stock.volumeSurgeScore, stock.progressiveVolScore,
        stock.evaluation, stock.capitalTrend, stock.vwapPosition,
      );
      stock.compositeScore = compResult.score;
      stock.compositeDetail = compResult.detail;
    }

    // Sort by compositeScore desc, then reliabilityScore desc, then changePercent desc
    candidates.sort((a, b) => {
      if (b.compositeScore !== a.compositeScore) return b.compositeScore - a.compositeScore;
      if (b.reliabilityScore !== a.reliabilityScore) return b.reliabilityScore - a.reliabilityScore;
      return b.changePercent - a.changePercent;
    });

    const result: ScreenerResult = {
      success: true,
      stocks: candidates,
      totalCount,
      filteredCount: candidates.length,
      sectorName,
      sectorCode,
      timestamp: new Date().toISOString(),
    };

    // Store in server cache
    screenerCache.set(cacheKey, { data: result, timestamp: Date.now() });

    return NextResponse.json(result);

  } catch (error: any) {
    console.error("Screener API error:", error);
    return NextResponse.json(
      {
        success: false,
        stocks: [],
        totalCount: 0,
        filteredCount: 0,
        sectorName: "",
        sectorCode: "",
        timestamp: new Date().toISOString(),
        error: error.message || "选股失败",
      } as ScreenerResult,
      { status: 500 }
    );
  }
}

// ── K-line MA Trend Detection ──────────────────────────

/**
 * Fetch the last 30 days of daily K-line data for MA trend detection
 */
async function fetchDailyKline(symbol: string): Promise<{ close: number; date: string }[]> {
  try {
    const sinaSymbol = symbol.startsWith("6") ? `sh${symbol}` : `sz${symbol}`;
    const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${sinaSymbol},day,,,30,qfq`;
    const resp = await fetch(url, {
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return [];
    const text = await resp.text();
    const data = JSON.parse(text);
    const klineData = data?.data?.[sinaSymbol]?.qfqday || data?.data?.[sinaSymbol]?.day;
    if (!Array.isArray(klineData)) return [];

    return klineData
      .map((entry: any[]) => ({
        date: String(entry[0] || ""),
        close: parseFloat(entry[2]) || 0,
      }))
      .filter((d: { close: number }) => d.close > 0);
  } catch {
    return [];
  }
}

/**
 * Check if a stock's price follows a specified MA trend
 */
function checkMATrend(
  klineData: { close: number; date: string }[],
  currentPrice: number,
  trendType: string,
): { pass: boolean; detail: string } {
  if (klineData.length < 20) {
    return { pass: false, detail: "K线数据不足" };
  }

  const closes = klineData.map(d => d.close);
  const ma5 = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const ma10 = closes.slice(-10).reduce((a, b) => a + b, 0) / 10;
  const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;

  switch (trendType) {
    case "above_ma5":
      return { pass: currentPrice > ma5, detail: currentPrice > ma5 ? `站上MA5(${ma5.toFixed(2)})` : `低于MA5(${ma5.toFixed(2)})` };
    case "above_ma10":
      return { pass: currentPrice > ma10, detail: currentPrice > ma10 ? `站上MA10(${ma10.toFixed(2)})` : `低于MA10(${ma10.toFixed(2)})` };
    case "above_ma20":
      return { pass: currentPrice > ma20, detail: currentPrice > ma20 ? `站上MA20(${ma20.toFixed(2)})` : `低于MA20(${ma20.toFixed(2)})` };
    case "bullish_alignment": {
      const isBullish = ma5 > ma10 && ma10 > ma20;
      return { pass: isBullish && currentPrice > ma5, detail: isBullish ? `多头排列(MA5>${ma5.toFixed(2)})` : `非多头排列` };
    }
    default:
      return { pass: true, detail: "未指定趋势类型" };
  }
}

/**
 * Calculate a comprehensive reliability score for a stock
 * Score range: 0-100, higher is more reliable
 */
function calculateReliabilityScore(stock: ScreenerStock, maPass?: boolean): { score: number; detail: string } {
  let score = 0;
  const details: string[] = [];

  // 1. Signal strength (pulse + volume surge) - 25 points
  const maxSignal = Math.max(stock.pulseScore, stock.volumeSurgeScore);
  if (maxSignal >= 70) { score += 25; details.push("强信号"); }
  else if (maxSignal >= 50) { score += 18; details.push("中信号"); }
  else if (maxSignal >= 30) { score += 12; details.push("弱信号"); }
  else if (maxSignal >= 10) { score += 5; }

  // 2. Volume ratio (量比) - 15 points
  if (stock.volumeRatio >= 2) { score += 15; details.push("量比强劲"); }
  else if (stock.volumeRatio >= 1.5) { score += 12; details.push("量比偏强"); }
  else if (stock.volumeRatio >= 1) { score += 8; details.push("量比正常"); }
  else if (stock.volumeRatio >= 0.5) { score += 3; }

  // 3. Main force net inflow - 15 points
  if (stock.mainNetInflow > 0) {
    const inflowRatio = Math.abs(stock.mainNetInflow) / (stock.amount || 1);
    if (inflowRatio > 0.05) { score += 15; details.push("主力强流入"); }
    else if (inflowRatio > 0.02) { score += 10; details.push("主力流入"); }
    else { score += 5; }
  }

  // 4. Turnover reasonableness - 10 points
  if (stock.turnover >= 2 && stock.turnover <= 8) { score += 10; details.push("换手适中"); }
  else if (stock.turnover >= 1 && stock.turnover <= 15) { score += 6; }
  else if (stock.turnover > 15) { score += 2; }

  // 5. PE reasonableness - 10 points
  if (stock.pe > 0 && stock.pe <= 30) { score += 10; details.push("PE合理"); }
  else if (stock.pe > 30 && stock.pe <= 60) { score += 6; }
  else if (stock.pe > 60) { score += 2; }

  // 6. Price position (near high is good for momentum) - 10 points
  if (stock.high > 0) {
    const posFromLow = (stock.price - stock.low) / (stock.high - stock.low);
    if (posFromLow > 0.8) { score += 10; details.push("价格强势"); }
    else if (posFromLow > 0.5) { score += 6; }
    else { score += 2; }
  }

  // 7. MA trend bonus - 15 points
  if (maPass) { score += 15; details.push("均线支撑"); }

  // 8. Evaluation label bonus
  if (stock.evaluation === "强势续涨") { score += 5; details.push("强势评估"); }
  else if (stock.evaluation === "温和看多") { score += 3; }

  // Cap at 100
  score = Math.min(score, 100);

  return { score, detail: details.length > 0 ? details.join("；") : "综合评分" };
}
