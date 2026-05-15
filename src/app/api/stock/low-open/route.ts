import { NextRequest, NextResponse } from "next/server";

/**
 * Low-Open Stock Screener API
 * GET /api/stock/low-open
 *
 * Finds stocks that opened significantly lower than previous close.
 * "低开" = (open - prevClose) / prevClose <= -minOpenGap%
 *
 * Features:
 * - Filter by sector/板块 or scan full market
 * - Minimum low-open gap threshold (default -5%)
 * - Recovery analysis: is the stock bouncing back from the low open?
 * - Scoring system based on recovery potential
 */

// ── Server-side Cache ───────────────────────────────────
const lowOpenCache = new Map<string, { data: LowOpenResult; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour – only refresh when user clicks refresh button

// ── Types ──────────────────────────────────────────────

interface LowOpenStock {
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
  marketCap: number;
  pe: number;
  amplitude: number;
  mainNetInflow: number;
  volumeRatio: number;
  openGapRate: number;        // 低开幅度% (negative number, e.g. -5.2)
  recoveryRate: number;       // 恢复幅度% (from open to current price)
  recoveryScore: number;      // 恢复评分 0-100
  recoveryDetail: string;     // 恢复描述
  lowOpenPattern: string;     // 低开模式: 低开高走/低开低走/低开震荡/低开企稳
  sectorName: string;         // 所属板块
  // ── Enhanced Factors ──
  gapFillRate: number;        // 缺口回补率%: how much of the gap has been filled
  supportStrength: number;    // 支撑强度: position within day's range (0-100)
  volumeConfirm: number;      // 量价确认分: 0-100
  mainForceScore: number;     // 主力资金分: 0-100
  valuationSafety: number;    // 估值安全分: 0-100
  elasticityScore: number;    // 弹性评分: 0-100
  gapDepthScore: number;      // 缺口深度分: 0-100
  compositeScore: number;     // 综合胜率分: 0-100
}

interface LowOpenResult {
  success: boolean;
  stocks: LowOpenStock[];
  totalCount: number;
  filteredCount: number;
  sectorName: string;
  timestamp: string;
  error?: string;
  cached?: boolean;
}

// ── Sector Search ──────────────────────────────────────

async function findSectorsByKeyword(keyword: string): Promise<{ code: string; name: string }[]> {
  const results: { code: string; name: string }[] = [];
  const seen = new Set<string>();
  const keywords = [keyword];
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

    // ── 医药 ──
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
  if (aliases[keyword]) keywords.push(...aliases[keyword]);

  for (const kw of keywords) {
    try {
      const url = `http://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(kw)}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=10`;
      const resp = await fetch(url, { next: { revalidate: 0 }, signal: AbortSignal.timeout(8000) });
      if (!resp.ok) continue;
      const data = await resp.json();
      const items = data?.QuotationCodeTable?.Data;
      if (!Array.isArray(items)) continue;
      for (const entry of items) {
        if (entry.Classify !== "BK") continue;
        const code: string = entry.Code || "";
        const name: string = entry.Name || "";
        const matchesKeyword = keywords.some(k => name.includes(k));
        if (matchesKeyword && !seen.has(code)) {
          seen.add(code);
          results.push({ code, name });
        }
      }
    } catch { /* ignore */ }
  }
  return results;
}

async function getSectorStocks(sectorCode: string, pageSize = 200): Promise<any[]> {
  const allStocks: any[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore && page <= 5) {
    try {
      const url = `http://push2.eastmoney.com/api/qt/clist/get?pn=${page}&pz=${pageSize}&po=1&np=1&fltt=2&invt=2&fid=f3&fs=b:${sectorCode}&fields=f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f14,f15,f16,f17,f18,f20,f21,f23,f24,f25,f26,f22,f11,f62,f128,f140,f141,f136`;
      const resp = await fetch(url, { next: { revalidate: 0 }, signal: AbortSignal.timeout(15000) });
      if (!resp.ok) break;
      const data = await resp.json();
      const diff = data?.data?.diff;
      if (!Array.isArray(diff) || diff.length === 0) { hasMore = false; break; }
      allStocks.push(...diff);
      const total = data?.data?.total || 0;
      if (allStocks.length >= total || diff.length < pageSize) hasMore = false;
      else page++;
    } catch { hasMore = false; }
  }
  return allStocks;
}

/**
 * Fetch all A-share stocks from EastMoney (full market scan)
 * Sorted by change percent ascending (biggest drops first)
 */
async function getAllAShares(pageSize = 500): Promise<any[]> {
  const allStocks: any[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore && page <= 10) {
    try {
      // Sort by f3 (changePercent) ascending - biggest losers first
      const url = `http://push2.eastmoney.com/api/qt/clist/get?pn=${page}&pz=${pageSize}&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048&fields=f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f14,f15,f16,f17,f18,f20,f21,f23,f24,f25,f26,f22,f11,f62,f128,f140,f141,f136`;
      const resp = await fetch(url, { next: { revalidate: 0 }, signal: AbortSignal.timeout(15000) });
      if (!resp.ok) break;
      const data = await resp.json();
      const diff = data?.data?.diff;
      if (!Array.isArray(diff) || diff.length === 0) { hasMore = false; break; }
      allStocks.push(...diff);
      const total = data?.data?.total || 0;
      if (allStocks.length >= total || diff.length < pageSize) hasMore = false;
      else page++;
    } catch { hasMore = false; }
  }
  return allStocks;
}

// ── Board/Type Check Helpers ────────────────────────────

function isMainBoard(code: string): boolean {
  if (/^60[0135]\d{3}$/.test(code)) return true;
  if (/^00[01]\d{3}$/.test(code)) return true;
  if (/^002\d{3}$/.test(code)) return true;
  return false;
}

function isST(name: string): boolean {
  return /ST|\\*ST|SST|S\\*ST/.test(name.toUpperCase());
}

function isETF(code: string): boolean {
  return code.startsWith("51") || code.startsWith("56") || code.startsWith("58") ||
         code.startsWith("15") || code.startsWith("16") || code.startsWith("18");
}

// ── Recovery Analysis ──────────────────────────────────

/**
 * Analyze the recovery pattern of a low-open stock.
 * Returns a score (0-100) and pattern label.
 */
function analyzeRecovery(stock: {
  open: number; prevClose: number; price: number; high: number; low: number;
  changePercent: number; volume: number; amount: number; turnover: number;
  mainNetInflow: number; volumeRatio: number; amplitude: number;
}): { score: number; pattern: string; detail: string } {
  const { open, prevClose, price, high, low, changePercent, volume, amount, turnover, mainNetInflow, volumeRatio, amplitude } = stock;

  if (open <= 0 || prevClose <= 0) return { score: 0, pattern: "数据不足", detail: "数据不足" };

  const openGapRate = ((open - prevClose) / prevClose) * 100;
  const recoveryRate = ((price - open) / open) * 100;
  const maxRecoveryRate = ((high - open) / open) * 100;
  const upperShadow = high > Math.max(open, price) ? ((high - Math.max(open, price)) / high) * 100 : 0;

  let score = 0;
  const details: string[] = [];

  // ── Recovery strength (most important, 0-35 points) ──
  if (recoveryRate >= 5) { score += 35; details.push(`强劲反弹${recoveryRate.toFixed(1)}%`); }
  else if (recoveryRate >= 3) { score += 28; details.push(`明显反弹${recoveryRate.toFixed(1)}%`); }
  else if (recoveryRate >= 2) { score += 22; details.push(`反弹${recoveryRate.toFixed(1)}%`); }
  else if (recoveryRate >= 1) { score += 15; details.push(`小幅反弹${recoveryRate.toFixed(1)}%`); }
  else if (recoveryRate >= 0) { score += 5; details.push("价格企稳"); }
  else if (recoveryRate >= -1) { score += 2; details.push("弱势整理"); }
  else { score += 0; details.push(`继续下跌${Math.abs(recoveryRate).toFixed(1)}%`); }

  // ── Max recovery (intraday high vs open, 0-20 points) ──
  if (maxRecoveryRate >= 5) { score += 20; details.push(`最高反弹${maxRecoveryRate.toFixed(1)}%`); }
  else if (maxRecoveryRate >= 3) { score += 15; }
  else if (maxRecoveryRate >= 2) { score += 10; }
  else if (maxRecoveryRate >= 1) { score += 5; }

  // ── Volume support (0-15 points) ──
  if (volumeRatio >= 3) { score += 15; details.push(`量比${volumeRatio.toFixed(1)}放量明显`); }
  else if (volumeRatio >= 2) { score += 12; details.push(`量比${volumeRatio.toFixed(1)}放量`); }
  else if (volumeRatio >= 1.5) { score += 8; details.push("温和放量"); }
  else if (volumeRatio >= 1) { score += 3; }

  // ── Turnover rate (0-10 points) ──
  if (turnover >= 3 && turnover <= 10) { score += 10; details.push("换手适中"); }
  else if (turnover >= 1 && turnover < 3) { score += 5; }
  else if (turnover > 10 && turnover <= 20) { score += 3; }
  else if (turnover > 20) { score += 0; details.push("换手过高"); }

  // ── Main force net inflow (0-10 points) ──
  if (mainNetInflow > 0 && amount > 0) {
    const inflowRatio = Math.abs(mainNetInflow) / amount;
    if (inflowRatio > 0.05) { score += 10; details.push("主力大幅流入"); }
    else if (inflowRatio > 0.02) { score += 7; details.push("主力流入"); }
    else { score += 3; }
  } else if (mainNetInflow < 0 && amount > 0) {
    const outflowRatio = Math.abs(mainNetInflow) / amount;
    if (outflowRatio > 0.05) { score -= 5; details.push("主力大幅流出"); }
    else if (outflowRatio > 0.02) { score -= 3; details.push("主力流出"); }
  }

  // ── Low-open gap magnitude bonus (deeper low open = more potential) ──
  const absGap = Math.abs(openGapRate);
  if (absGap >= 7) { score += 5; details.push(`深幅低开${absGap.toFixed(1)}%`); }
  else if (absGap >= 5) { score += 3; }

  // ── Upper shadow check (冲高回落 = less ideal) ──
  if (upperShadow > 2 && recoveryRate < 1) { score -= 5; details.push("冲高回落"); }

  // ── Amplitude check ──
  if (amplitude >= 8 && recoveryRate >= 2) { score += 3; details.push("大振幅反弹"); }
  else if (amplitude >= 5 && recoveryRate >= 1) { score += 1; }

  // Cap at 0-100
  score = Math.max(0, Math.min(100, score));

  // Determine pattern
  let pattern: string;
  if (recoveryRate >= 2) pattern = "低开高走";
  else if (recoveryRate >= 0.5) pattern = "低开企稳";
  else if (recoveryRate >= -0.5) pattern = "低开震荡";
  else pattern = "低开低走";

  return {
    score,
    pattern,
    detail: details.length > 0 ? details.join("，") : (score > 0 ? "轻微恢复" : "无明显恢复"),
  };
}

// ── Enhanced Factor Computation ────────────────────────

interface FactorInput {
  price: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  volumeRatio: number;
  amount: number;
  mainNetInflow: number;
  pe: number;
  amplitude: number;
  openGapRate: number;
  recoveryRate: number;
}

interface FactorOutput {
  gapFillRate: number;
  supportStrength: number;
  volumeConfirm: number;
  mainForceScore: number;
  valuationSafety: number;
  elasticityScore: number;
  gapDepthScore: number;
  compositeScore: number;
}

function computeFactors(stock: FactorInput): FactorOutput {
  const { price, prevClose, open, high, low, volumeRatio, amount, mainNetInflow, pe, amplitude, openGapRate, recoveryRate } = stock;

  // ── 1. gapFillRate (缺口回补率) ──
  let gapFillRate = 0;
  if (prevClose !== open && open > 0) {
    // (price - open) / (prevClose - open) * 100
    // When price > prevClose, gapFillRate > 100% (over-filled)
    // When price < open, gapFillRate < 0% (gap widened)
    gapFillRate = ((price - open) / (prevClose - open)) * 100;
  }

  // ── 2. supportStrength (支撑强度, 0-100) ──
  let supportStrength = 50; // default midpoint
  if (high > low) {
    supportStrength = ((price - low) / (high - low)) * 100;
  }

  // ── 3. volumeConfirm (量价确认分, 0-100) ──
  let volumeConfirm = 50;
  if (recoveryRate > 0 && volumeRatio >= 2) {
    volumeConfirm = 90 + Math.min(10, (volumeRatio - 2) * 5); // 90-100
  } else if (recoveryRate > 0 && volumeRatio >= 1.5) {
    volumeConfirm = 70 + Math.min(19, (volumeRatio - 1.5) * 38); // 70-89
  } else if (recoveryRate > 0 && volumeRatio >= 1) {
    volumeConfirm = 50 + Math.min(19, (volumeRatio - 1) * 38); // 50-69
  } else if (recoveryRate > 0 && volumeRatio < 1) {
    volumeConfirm = 30 + Math.min(19, volumeRatio * 19); // 30-49
  } else if (recoveryRate <= 0 && volumeRatio >= 2) {
    volumeConfirm = 20 + Math.min(19, (volumeRatio - 2) * 9.5); // 20-39
  } else if (recoveryRate <= 0 && volumeRatio < 2) {
    volumeConfirm = 10 + Math.min(19, volumeRatio * 9.5); // 10-29
  }
  // Bonus for significant amount (>1e8)
  if (amount > 1e8) volumeConfirm = Math.min(100, volumeConfirm + 5);
  if (amount > 5e8) volumeConfirm = Math.min(100, volumeConfirm + 3);
  volumeConfirm = Math.round(Math.max(0, Math.min(100, volumeConfirm)));

  // ── 4. mainForceScore (主力资金分, 0-100) ──
  let mainForceScore = 50;
  if (amount > 0) {
    const inflowRatio = Math.abs(mainNetInflow) / amount;
    if (mainNetInflow > 0) {
      mainForceScore = 50 + inflowRatio * 500;
    } else if (mainNetInflow < 0) {
      mainForceScore = 50 - inflowRatio * 500;
    }
  }
  mainForceScore = Math.round(Math.max(0, Math.min(100, mainForceScore)));

  // ── 5. valuationSafety (估值安全分, 0-100) ──
  let valuationSafety = 40;
  if (pe < 0) {
    valuationSafety = 10; // 亏损
  } else if (pe === 0) {
    valuationSafety = 40; // no data
  } else if (pe <= 15) {
    valuationSafety = 90; // 低估值安全
  } else if (pe <= 30) {
    valuationSafety = 70; // 合理估值
  } else if (pe <= 50) {
    valuationSafety = 50; // 偏高
  } else if (pe <= 100) {
    valuationSafety = 30; // 高估值风险
  } else {
    valuationSafety = 15; // 极高估值
  }

  // ── 6. elasticityScore (弹性评分, 0-100) ──
  let elasticityScore = 0;
  // Base: recoveryRate * 10, capped at 50
  elasticityScore = Math.min(50, recoveryRate * 10);
  // Upper shadow for bonus check
  const upperShadow = high > Math.max(open, price) ? ((high - Math.max(open, price)) / high) * 100 : 0;

  if (amplitude >= 5 && recoveryRate > 0) {
    elasticityScore += 20 + Math.min(10, (amplitude - 5) * 2); // 20-30 bonus
  } else if (amplitude >= 3 && recoveryRate > 1) {
    elasticityScore += 10 + Math.min(10, (amplitude - 3) * 5); // 10-20 bonus
  }
  if (upperShadow < 1 && recoveryRate > 0) {
    elasticityScore += 10; // 无上影线=涨得稳
  }
  elasticityScore = Math.round(Math.max(0, Math.min(100, elasticityScore)));

  // ── 7. gapDepthScore (缺口深度分, 0-100) ──
  const absGap = Math.abs(openGapRate);
  let gapDepthScore = 30; // default for <2%
  if (absGap >= 2 && absGap < 4) {
    gapDepthScore = 60;
  } else if (absGap >= 4 && absGap < 7) {
    gapDepthScore = 80;
  } else if (absGap >= 7 && absGap < 9) {
    gapDepthScore = 65;
  } else if (absGap >= 9) {
    gapDepthScore = 40;
  }

  // ── 8. compositeScore (综合胜率分, 0-100) ──
  // Normalize each factor to 0-100, then weighted sum
  // gapFillRate: can be negative or >100, normalize: clamp to 0-100 for weighting
  const normalizedGapFill = Math.max(0, Math.min(100, gapFillRate));
  const normalizedSupport = Math.max(0, Math.min(100, supportStrength));

  const compositeScore = Math.round(Math.max(0, Math.min(100,
    normalizedGapFill * 0.20 +
    normalizedSupport * 0.15 +
    volumeConfirm * 0.20 +
    mainForceScore * 0.15 +
    valuationSafety * 0.10 +
    elasticityScore * 0.10 +
    gapDepthScore * 0.10
  )));

  return {
    gapFillRate: Math.round(gapFillRate * 100) / 100,
    supportStrength: Math.round(supportStrength * 10) / 10,
    volumeConfirm,
    mainForceScore,
    valuationSafety,
    elasticityScore,
    gapDepthScore,
    compositeScore,
  };
}

// ── Main Handler ────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sectorKeyword = searchParams.get("sector") || "";
  const minOpenGap = parseFloat(searchParams.get("minOpenGap") || "-5");
  const maxMarketCap = parseFloat(searchParams.get("maxMarketCap") || "0");
  const minMarketCap = parseFloat(searchParams.get("minMarketCap") || "0");
  const includeChiNext = searchParams.get("includeChiNext") === "true";
  const includeSTAR = searchParams.get("includeSTAR") === "true";
  const minTurnover = parseFloat(searchParams.get("minTurnover") || "0");
  const maxTurnover = parseFloat(searchParams.get("maxTurnover") || "100");
  const minVolumeRatio = parseFloat(searchParams.get("minVolumeRatio") || "0");
  const sortBy = searchParams.get("sortBy") || "recoveryScore";
  const limit = parseInt(searchParams.get("limit") || "50");
  const forceRefresh = searchParams.get("refresh") === "1";

  // Cache key
  const cacheKey = `${sectorKeyword}|${minOpenGap}|${maxMarketCap}|${minMarketCap}|${includeChiNext}|${includeSTAR}|${minTurnover}|${maxTurnover}|${minVolumeRatio}|${sortBy}|${limit}`;
  if (!forceRefresh) {
    const cached = lowOpenCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json({ ...cached.data, cached: true });
    }
  }

  try {
    let rawStocks: any[] = [];
    let sectorName = "";

    if (sectorKeyword) {
      // Sector-based scan
      const sectors = await findSectorsByKeyword(sectorKeyword);
      if (sectors.length === 0) {
        return NextResponse.json({
          success: false, stocks: [], totalCount: 0, filteredCount: 0,
          sectorName: "", timestamp: new Date().toISOString(),
          error: `未找到"${sectorKeyword}"相关板块`,
        } as LowOpenResult);
      }
      const allSectorNames = sectors.map(s => s.name).join("、");
      sectorName = allSectorNames;

      for (const sector of sectors) {
        const stocks = await getSectorStocks(sector.code);
        rawStocks.push(...stocks);
      }

      // Deduplicate
      const seenCodes = new Set<string>();
      rawStocks = rawStocks.filter((s: any) => {
        const code = String(s.f12 || "");
        if (seenCodes.has(code)) return false;
        seenCodes.add(code);
        return true;
      });
    } else {
      // Full market scan
      rawStocks = await getAllAShares();
      sectorName = "全市场";
    }

    // ── Parse and filter ──
    const candidates: LowOpenStock[] = [];

    for (const stock of rawStocks) {
      const code = String(stock.f12 || "");
      const name = String(stock.f14 || "");

      if (isETF(code)) continue;
      if (isST(name)) continue;

      // Board filtering
      const isMB = isMainBoard(code);
      const isCN = code.startsWith("300") || code.startsWith("301");
      const isSM = code.startsWith("688") || code.startsWith("689");
      const isBSE = code.startsWith("8") || code.startsWith("4");

      if (isBSE) continue;
      if (!isMB && !isCN && !isSM) continue;
      if (isCN && !includeChiNext) continue;
      if (isSM && !includeSTAR) continue;

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
      const marketCap = parseFloat(stock.f20) || 0;
      const mainNetInflow = parseFloat(stock.f62) || 0;
      const volumeRatio = parseFloat(stock.f10) || 0;

      if (price <= 0 || prevClose <= 0 || open <= 0) continue;

      // Calculate open gap rate
      const openGapRate = ((open - prevClose) / prevClose) * 100;

      // Filter: low open gap must be <= minOpenGap (e.g., -5%)
      if (openGapRate > minOpenGap) continue;

      // Filter: market cap
      const marketCapYi = marketCap / 1e8;
      if (maxMarketCap > 0 && marketCapYi > maxMarketCap) continue;
      if (minMarketCap > 0 && marketCapYi < minMarketCap) continue;
      if (marketCapYi <= 0) continue;

      // Filter: turnover
      if (turnover < minTurnover || turnover > maxTurnover) continue;

      // Filter: volume ratio
      if (minVolumeRatio > 0 && volumeRatio < minVolumeRatio) continue;

      // Recovery analysis
      const recovery = analyzeRecovery({
        open, prevClose, price, high, low, changePercent,
        volume, amount, turnover, mainNetInflow, volumeRatio, amplitude,
      });

      const recoveryRate = ((price - open) / open) * 100;

      // Compute enhanced factors
      const factors = computeFactors({
        price, prevClose, open, high, low, volumeRatio, amount,
        mainNetInflow, pe, amplitude, openGapRate, recoveryRate,
      });

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
        pe,
        amplitude,
        mainNetInflow,
        volumeRatio,
        openGapRate,
        recoveryRate,
        recoveryScore: recovery.score,
        recoveryDetail: recovery.detail,
        lowOpenPattern: recovery.pattern,
        sectorName: String(stock.f128 || stock.f140 || ""),
        // ── Enhanced Factors ──
        gapFillRate: factors.gapFillRate,
        supportStrength: factors.supportStrength,
        volumeConfirm: factors.volumeConfirm,
        mainForceScore: factors.mainForceScore,
        valuationSafety: factors.valuationSafety,
        elasticityScore: factors.elasticityScore,
        gapDepthScore: factors.gapDepthScore,
        compositeScore: factors.compositeScore,
      });
    }

    // ── Sort ──
    candidates.sort((a, b) => {
      if (sortBy === "compositeScore") {
        if (b.compositeScore !== a.compositeScore) return b.compositeScore - a.compositeScore;
        return b.recoveryScore - a.recoveryScore;
      } else if (sortBy === "openGapRate") {
        return a.openGapRate - b.openGapRate;
      } else if (sortBy === "changePercent") {
        return b.changePercent - a.changePercent;
      } else if (sortBy === "recoveryRate") {
        return b.recoveryRate - a.recoveryRate;
      } else {
        if (b.recoveryScore !== a.recoveryScore) return b.recoveryScore - a.recoveryScore;
        return b.recoveryRate - a.recoveryRate;
      }
    });

    const filteredStocks = candidates.slice(0, limit);

    const result: LowOpenResult = {
      success: true,
      stocks: filteredStocks,
      totalCount: rawStocks.length,
      filteredCount: candidates.length,
      sectorName,
      timestamp: new Date().toISOString(),
    };

    lowOpenCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("Low-open screener error:", e);
    return NextResponse.json({
      success: false, stocks: [], totalCount: 0, filteredCount: 0,
      sectorName: "", timestamp: new Date().toISOString(),
      error: e.message || "低开选股查询失败",
    } as LowOpenResult);
  }
}
