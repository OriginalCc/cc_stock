import { NextRequest, NextResponse } from "next/server";

// ── Types ──────────────────────────────────────────────

interface SectorItem {
  code: string;
  name: string;
  price: number;
  changePercent: number;
  changeAmount: number;
  volume: number;
  turnover: number;
  amplitude: number;
  mainNetInflow: number;
  mainNetInflowRatio: number;
  stocksUp: number;
  stocksDown: number;
  leadingStock: string;
  leadingStockChange: number;
  leadingStockCode: string;
  superLargeNet: number;
  largeNet: number;
}

interface RotationPrediction {
  code: string;
  name: string;
  changePercent: number;
  mainNetInflow: number;
  turnover: number;
  score: number;
  reasons: string[];
  category: "capital_gathering" | "pullback_recovery" | "momentum_shift" | "adjacent_chain";
  categoryLabel: string;
}

// ── Server-side Cache ──────────────────────────────────

const rotationCache: {
  data: any;
  timestamp: number;
} | null = null;

let cachedRotation: { data: any; timestamp: number } | null = null;
const CACHE_TTL = 3 * 60 * 1000; // 3 minutes

// ── EastMoney API ──────────────────────────────────────

const EM_BASE = "http://push2delay.eastmoney.com";
const SECTOR_FIELDS = "f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f14,f15,f16,f17,f18,f20,f21,f62,f66,f72,f78,f84,f104,f105,f128,f136,f140,f141,f184";

async function fetchSectors(fs: string, pageSize: number = 200): Promise<any[]> {
  const url = `${EM_BASE}/api/qt/clist/get?pn=1&pz=${pageSize}&po=1&np=1&fltt=2&invt=2&fid=f3&fs=${fs}&fields=${SECTOR_FIELDS}`;
  try {
    const resp = await fetch(url, { next: { revalidate: 0 }, signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return [];
    const data = await resp.json();
    const diff = data?.data?.diff;
    if (!Array.isArray(diff)) return [];
    return diff;
  } catch (e) {
    console.error("fetchSectors error:", e);
    return [];
  }
}

// ── Parse Sector Data ──────────────────────────────────

function parseSectorItem(item: any): SectorItem {
  const mainNetInflow = parseFloat(item.f62) || 0;           // 主力净流入 (元)
  const mainNetInflowRatio = parseFloat(item.f184) || 0;     // 主力净流入占比 (%)
  const superLargeNet = parseFloat(item.f66) || 0;           // 超大单净流入
  const largeNet = parseFloat(item.f72) || 0;                // 大单净流入

  return {
    code: String(item.f12 || ""),
    name: String(item.f14 || ""),
    price: parseFloat(item.f2) || 0,
    changePercent: parseFloat(item.f3) || 0,
    changeAmount: parseFloat(item.f4) || 0,
    volume: parseFloat(item.f6) || 0,       // 成交额 (元)
    turnover: parseFloat(item.f8) || 0,     // 换手率 %
    amplitude: parseFloat(item.f7) || 0,    // 振幅
    mainNetInflow,
    mainNetInflowRatio,
    stocksUp: parseInt(item.f104) || 0,     // 上涨家数
    stocksDown: parseInt(item.f105) || 0,   // 下跌家数
    leadingStock: String(item.f140 || ""),
    leadingStockChange: parseFloat(item.f141) || 0,
    leadingStockCode: String(item.f128) || "",
    superLargeNet,
    largeNet,
  };
}

// ── Trading Phase Detection ────────────────────────────

function getTradingPhase(): string {
  const now = new Date();
  const chinaOffset = 8 * 60;
  const chinaTime = new Date(now.getTime() + (chinaOffset + now.getTimezoneOffset()) * 60000);
  const day = chinaTime.getDay();
  const h = chinaTime.getHours();
  const m = chinaTime.getMinutes();
  const timeNum = h * 100 + m;

  // Weekend
  if (day === 0 || day === 6) return "休市";

  // Weekday phases
  if (timeNum < 915) return "盘前";
  if (timeNum >= 915 && timeNum < 930) return "集合竞价";
  if (timeNum >= 930 && timeNum < 1130) return "早盘交易";
  if (timeNum >= 1130 && timeNum < 1300) return "午间休市";
  if (timeNum >= 1300 && timeNum < 1500) return "午后交易";
  if (timeNum >= 1500 && timeNum < 1530) return "盘后集合竞价";
  return "收盘";
}

// ── Rotation Analysis ──────────────────────────────────

function identifyCoolingSectors(sectors: SectorItem[]): SectorItem[] {
  // Cooling: price still up but capital is flowing out
  return sectors.filter(s =>
    s.changePercent > 0.5 &&
    s.mainNetInflow < 0 &&
    s.mainNetInflowRatio < -0.5
  ).sort((a, b) => {
    // Sort by: more price up + more capital out = more dangerous
    const scoreA = a.changePercent - a.mainNetInflowRatio;
    const scoreB = b.changePercent - b.mainNetInflowRatio;
    return scoreB - scoreA;
  });
}

function identifyRisingSectors(sectors: SectorItem[]): SectorItem[] {
  // Rising: capital flowing in, price hasn't fully reflected yet
  return sectors.filter(s =>
    s.mainNetInflow > 0 &&
    s.mainNetInflowRatio > 0.5 &&
    s.changePercent > -1 &&
    s.changePercent < 3 &&
    s.turnover > 1
  ).sort((a, b) => {
    const scoreA = a.mainNetInflowRatio + (3 - a.changePercent);
    const scoreB = b.mainNetInflowRatio + (3 - b.changePercent);
    return scoreB - scoreA;
  });
}

// ── Prediction Engine ──────────────────────────────────

// Industry chain adjacency map
const CHAIN_MAP: Record<string, string[]> = {
  "半导体": ["消费电子", "电子元件", "光伏设备", "人工智能"],
  "消费电子": ["半导体", "电子元件", "光学光电子", "元宇宙"],
  "锂电池": ["新能源汽车", "有色金属", "光伏设备", "储能"],
  "新能源汽车": ["锂电池", "汽车零部件", "充电桩", "无人驾驶"],
  "光伏设备": ["锂电池", "储能", "半导体", "新能源"],
  "人工智能": ["半导体", "软件开发", "云计算", "大数据"],
  "证券": ["银行", "保险", "多元金融"],
  "银行": ["证券", "保险", "房地产"],
  "白酒": ["食品饮料", "旅游酒店", "消费"],
  "化学制药": ["中药", "医疗器械", "生物制品"],
  "中药": ["化学制药", "医疗器械", "生物制品"],
  "房地产开发": ["建筑装饰", "建材", "家居用品"],
  "煤炭行业": ["电力", "钢铁", "有色金属"],
  "电力": ["煤炭行业", "光伏设备", "风电设备"],
  "军工": ["航空航天", "电子元件", "通信设备"],
  "游戏": ["传媒", "人工智能", "元宇宙"],
  "医疗器械": ["化学制药", "中药", "生物制品"],
};

function findAdjacentHotSectors(
  sectorName: string,
  hotSectorNames: Set<string>
): string[] {
  const adjacent: string[] = [];
  const chains = CHAIN_MAP[sectorName];
  if (chains) {
    for (const chain of chains) {
      if (hotSectorNames.has(chain)) {
        adjacent.push(chain);
      }
    }
  }
  // Also check reverse: if any hot sector lists this sector as adjacent
  for (const [key, values] of Object.entries(CHAIN_MAP)) {
    if (values.includes(sectorName) && hotSectorNames.has(key)) {
      if (!adjacent.includes(key)) adjacent.push(key);
    }
  }
  return adjacent;
}

function generatePredictions(
  sectors: SectorItem[],
  conceptSectors: SectorItem[]
): RotationPrediction[] {
  const allSectors = [...sectors, ...conceptSectors];
  const predictions: RotationPrediction[] = [];

  // Get set of currently hot sector names for chain analysis
  const hotSectorNames = new Set(
    allSectors
      .filter(s => s.changePercent > 2)
      .map(s => s.name)
  );

  for (const s of allSectors) {
    const inflowInYi = s.mainNetInflow / 1e8;    // Convert to 亿
    const ratio = s.mainNetInflowRatio;

    // 1. 资金蓄势型 (capital_gathering)
    if (
      inflowInYi >= 2 &&
      ratio >= 1 &&
      s.changePercent < 3 &&
      s.changePercent > -1
    ) {
      const score = Math.min(95, Math.round(
        50 +
        Math.min(inflowInYi, 20) * 1.5 +
        Math.min(ratio, 5) * 3 +
        (s.turnover > 2 ? 5 : 0)
      ));
      predictions.push({
        code: s.code,
        name: s.name,
        changePercent: s.changePercent,
        mainNetInflow: s.mainNetInflow,
        turnover: s.turnover,
        score,
        reasons: [
          `主力净流入${inflowInYi.toFixed(1)}亿，占比${ratio.toFixed(1)}%，资金大幅蓄势`,
          `当前涨幅${s.changePercent.toFixed(2)}%，价格尚未充分反映资金流入`,
          s.turnover > 2 ? `换手率${s.turnover.toFixed(1)}%，交投活跃` : "资金持续流入中",
        ],
        category: "capital_gathering",
        categoryLabel: "资金蓄势",
      });
      continue; // Don't double-assign
    }

    // 2. 回调企稳型 (pullback_recovery)
    if (
      s.changePercent < 0 &&
      s.changePercent > -3 &&
      inflowInYi > 1 &&
      ratio > 0.5
    ) {
      const score = Math.min(90, Math.round(
        45 +
        Math.min(inflowInYi, 15) * 1.5 +
        Math.min(ratio, 4) * 3 +
        (s.stocksUp > s.stocksDown ? 5 : 0)
      ));
      predictions.push({
        code: s.code,
        name: s.name,
        changePercent: s.changePercent,
        mainNetInflow: s.mainNetInflow,
        turnover: s.turnover,
        score,
        reasons: [
          `板块回调${Math.abs(s.changePercent).toFixed(2)}%，但主力逆势净流入${inflowInYi.toFixed(1)}亿`,
          `主力净流入占比${ratio.toFixed(1)}%，资金在低位积极承接`,
          `上涨${s.stocksUp}家/下跌${s.stocksDown}家，个股分化中企稳信号明显`,
        ],
        category: "pullback_recovery",
        categoryLabel: "回调企稳",
      });
      continue;
    }

    // 3. 动能切换型 (momentum_shift)
    if (
      s.turnover >= 3 &&
      ratio > 0.3 &&
      s.changePercent > 0 &&
      s.changePercent < 4
    ) {
      const score = Math.min(85, Math.round(
        40 +
        Math.min(s.turnover, 10) * 2 +
        Math.min(ratio, 4) * 2.5 +
        Math.min(s.changePercent, 3) * 3
      ));
      predictions.push({
        code: s.code,
        name: s.name,
        changePercent: s.changePercent,
        mainNetInflow: s.mainNetInflow,
        turnover: s.turnover,
        score,
        reasons: [
          `换手率${s.turnover.toFixed(1)}%，量能显著放大`,
          `主力净流入占比${ratio.toFixed(1)}%，资金加速进场`,
          `涨幅${s.changePercent.toFixed(2)}%，动能切换初期`,
        ],
        category: "momentum_shift",
        categoryLabel: "动能切换",
      });
      continue;
    }

    // 4. 产业链联动型 (adjacent_chain)
    const adjacentHot = findAdjacentHotSectors(s.name, hotSectorNames);
    if (
      adjacentHot.length > 0 &&
      s.changePercent < 2 &&
      s.mainNetInflow > 0
    ) {
      const score = Math.min(80, Math.round(
        35 +
        adjacentHot.length * 8 +
        Math.min(inflowInYi, 10) * 1 +
        (s.turnover > 1.5 ? 5 : 0)
      ));
      predictions.push({
        code: s.code,
        name: s.name,
        changePercent: s.changePercent,
        mainNetInflow: s.mainNetInflow,
        turnover: s.turnover,
        score,
        reasons: [
          `关联热门板块【${adjacentHot.join("、")}】表现强势`,
          `产业链联动效应，资金有望向本板块溢出`,
          s.mainNetInflow > 0 ? `主力已小幅流入${inflowInYi.toFixed(1)}亿，先知先觉` : "关注资金流向变化",
        ],
        category: "adjacent_chain",
        categoryLabel: "产业链联动",
      });
      continue;
    }
  }

  // Sort by score descending, max 15
  predictions.sort((a, b) => b.score - a.score);
  return predictions.slice(0, 15);
}

// ── Rotation Summary ───────────────────────────────────

function buildRotationSummary(
  hotSectors: SectorItem[],
  conceptSectors: SectorItem[],
  coolingSectors: SectorItem[],
  risingSectors: SectorItem[],
  predictions: RotationPrediction[]
): string {
  const parts: string[] = [];

  if (hotSectors.length > 0) {
    const top3 = hotSectors.slice(0, 3).map(s => s.name).join("、");
    parts.push(`今日热门：${top3}`);
  }

  if (conceptSectors.length > 0) {
    const top3 = conceptSectors.slice(0, 3).map(s => s.name).join("、");
    parts.push(`概念领涨：${top3}`);
  }

  if (coolingSectors.length > 0) {
    const names = coolingSectors.slice(0, 3).map(s => s.name).join("、");
    parts.push(`降温警惕：${names}`);
  }

  if (risingSectors.length > 0) {
    const names = risingSectors.slice(0, 3).map(s => s.name).join("、");
    parts.push(`蓄势关注：${names}`);
  }

  if (predictions.length > 0) {
    const topPred = predictions[0];
    parts.push(`明日重点：${topPred.name}（${topPred.categoryLabel}，${topPred.score}分）`);
  }

  return parts.join("；");
}

// ── GET Handler ────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const refresh = searchParams.get("refresh") === "1";
  const type = searchParams.get("type") || "all";        // all | industry | concept
  const sectorType = searchParams.get("sectorType") || ""; // Optional filter

  // Check cache
  if (!refresh && cachedRotation && Date.now() - cachedRotation.timestamp < CACHE_TTL) {
    return NextResponse.json(cachedRotation.data, {
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' },
    });
  }

  try {
    const tradingPhase = getTradingPhase();

    // Fetch industry + concept sectors in parallel
    const [industryRaw, conceptRaw] = await Promise.all([
      (type === "all" || type === "industry")
        ? fetchSectors("m:90+t:2", 200)
        : Promise.resolve([]),
      (type === "all" || type === "concept")
        ? fetchSectors("m:90+t:3", 200)
        : Promise.resolve([]),
    ]);

    // Parse sector items
    const industrySectors = industryRaw.map(parseSectorItem);
    const conceptSectors = conceptRaw.map(parseSectorItem);

    // Sort by different criteria
    const hotSectorsByChange = [...industrySectors]
      .sort((a, b) => b.changePercent - a.changePercent);

    const hotSectorsByCapital = [...industrySectors]
      .sort((a, b) => b.mainNetInflow - a.mainNetInflow);

    const hotSectorsByVolume = [...industrySectors]
      .sort((a, b) => b.volume - a.volume);

    const hotConceptSectors = [...conceptSectors]
      .sort((a, b) => b.changePercent - a.changePercent);

    // Rotation analysis
    const allSectors = [...industrySectors, ...conceptSectors];
    const coolingSectors = identifyCoolingSectors(allSectors);
    const risingSectors = identifyRisingSectors(allSectors);

    // Prediction engine
    const predictions = generatePredictions(industrySectors, conceptSectors);

    // Build summary
    const rotationSummary = buildRotationSummary(
      hotSectorsByChange,
      hotConceptSectors,
      coolingSectors,
      risingSectors,
      predictions
    );

    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      tradingPhase,
      hotSectorsByChange,
      hotSectorsByCapital,
      hotSectorsByVolume,
      hotConceptSectors,
      coolingSectors,
      risingSectors,
      predictions,
      rotationSummary,
    };

    // Update cache
    cachedRotation = { data: result, timestamp: Date.now() };

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' },
    });
  } catch (error: any) {
    console.error("Sector rotation API error:", error);
    return NextResponse.json(
      {
        success: false,
        timestamp: new Date().toISOString(),
        tradingPhase: getTradingPhase(),
        hotSectorsByChange: [],
        hotSectorsByCapital: [],
        hotSectorsByVolume: [],
        hotConceptSectors: [],
        coolingSectors: [],
        risingSectors: [],
        predictions: [],
        rotationSummary: "",
        error: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
