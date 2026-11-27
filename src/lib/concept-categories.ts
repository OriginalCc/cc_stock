/**
 * 概念归类引擎：把东财概念板块名（及个股贴切概念名）归入少数可读的「热点主题大类」。
 *
 * 动机：热点面板每日 Top8 常被同一大类的细分概念占据（流感/独家药品/特色药 → 医药），
 * 直接看榜单难以回答「今天热点是什么」。归类后可以：
 *   1. 面板顶部聚合出「热点主题：医药×3 · AI×2 …」，一眼看出主线
 *   2. 每个概念按钮带类别色点，流感/特色药 同色即同族
 *   3. 点击主题大类 → 直接按「整类概念」筛选个股（比单一概念更宽的筛选口径）
 *
 * 为什么自建词典：东财概念是扁平清单（无公开大类映射）；开盘啦题材库、同花顺分类
 * 均无免费数据源（tushare kpl_concept 需 5000 积分）。自建两层匹配：
 *   1. OVERRIDES 精确覆盖：易误伤的特例（如 医废处理→环保 而非医药）
 *   2. 分词/子串规则（顺序敏感，先匹配先赢）：覆盖 550+ 板块全集与未来新增板块
 *      未命中任何规则 → other
 *
 * 规则顺序即优先级：医药在最前（医/药/疫苗…），风格·持仓在最后兜底收编
 * 大盘股/昨日涨停/基金重仓等非题材板块。经验证对东财概念板块全量 554 个的
 * 分类覆盖率 >99%（other 仅剩无主题归属的新造词）。
 */

export interface ConceptCategory {
  id: string;
  name: string;
  /** 类别色点（tailwind bg 类，用于面板色点与主题徽章） */
  dot: string;
  /** 子串规则（大小写不敏感，按类别数组顺序先匹配先赢） */
  patterns: string[];
  /** 精确名单（ patterns 之外需要整名指定的板块） */
  exact?: string[];
}

// ── 类别定义（顺序敏感） ─────────────────────────────────

export const CONCEPT_CATEGORIES: ConceptCategory[] = [
  {
    id: "pharma",
    name: "医药医疗",
    dot: "bg-rose-500",
    exact: ["CRO", "合成生物"],
    patterns: [
      "医", "药", "疫苗", "流感", "肝炎", "肝素", "青蒿素", "阿兹海默", "螺杆菌",
      "病毒防治", "病原体", "重组蛋白", "单抗", "细胞", "基因", "免疫", "维生素",
      "诊断", "DRG", "DIP", "SPD", "CXO", "生殖", "大麻", "保健品", "健康",
    ],
  },
  {
    id: "ai",
    name: "人工智能",
    dot: "bg-violet-500",
    patterns: [
      "ai", "人工智能", "GPT", "DeepSeek", "Kimi", "智谱", "MLOps", "算力", "大模型",
      "机器视觉", "虚拟数字人", "数字人", "数据中心", "液冷", "服务器", "云计算",
      "边缘计算", "东数西算", "智算", "语音", "生物识别", "脑机接口",
    ],
  },
  {
    id: "platform",
    name: "平台生态",
    dot: "bg-fuchsia-500",
    patterns: [
      "华为", "鸿蒙", "苹果", "小米", "荣耀", "特斯拉", "英伟达", "蚂蚁", "百度",
      "阿里", "腾讯", "快手", "拼多多", "抖音", "字节", "小红书", "京东", "美团",
    ],
  },
  {
    id: "semis",
    name: "半导体",
    dot: "bg-purple-500",
    patterns: [
      "芯片", "半导体", "存储", "内存", "封装", "EDA", "光刻", "中芯", "碳化硅",
      "氮化镓", "IGBT", "PCB", "MLCC", "被动元件", "大基金",
    ],
  },
  {
    id: "robot",
    name: "机器人·智造",
    dot: "bg-orange-500",
    patterns: [
      "机器人", "减速器", "执行器", "伺服", "工业母机", "工业互联网", "工业化",
      "3D打印", "传感器", "高端装备", "工程机械", "同步磁阻电机", "智能制造", "PLC",
    ],
  },
  {
    id: "finance",
    name: "金融",
    dot: "bg-yellow-600",
    exact: ["北交所概念"],
    patterns: [
      "金融", "券商", "银行", "参股", "支付", "数字货币", "期货", "化债",
      "AMC", "REITs", "创投", "IPO", "独角兽", "租赁",
    ],
  },
  {
    id: "digital",
    name: "数字经济",
    dot: "bg-cyan-600",
    patterns: [
      "数据", "信创", "软件", "操作系统", "区块链", "Web3", "ERP", "财税", "身份证",
      "知识产权", "智慧", "VPN", "网络安全", "国资云", "数字水印", "数字孪生",
      "数字经济", "互联网", "安防",
    ],
  },
  {
    id: "defense",
    name: "军工·航天",
    dot: "bg-red-500",
    patterns: [
      "军工", "军民融合", "航天", "航空", "空间站", "航母", "船舶", "大飞机", "飞机",
      "无人机", "低空", "飞行汽车", "eVTOL", "民爆", "兵器",
    ],
  },
  {
    id: "telecom",
    name: "通信·卫星",
    dot: "bg-teal-500",
    patterns: [
      "5G", "6G", "通信", "光模块", "光纤", "CPO", "铜缆", "毫米波", "卫星", "北斗",
      "导航", "量子", "物联网", "WiFi", "IPv6", "UWB", "基站",
    ],
  },
  {
    id: "auto",
    name: "汽车产业链",
    dot: "bg-stone-500",
    patterns: [
      "汽车", "新能源车", "驾驶", "车联网", "网约车", "两轮车", "充电桩", "快充", "换电",
      "轮毂电机", "胎压监测", "电子车牌", "电子后视镜", "ETC", "EDR", "激光雷达",
      "一体化压铸",
    ],
  },
  {
    id: "newenergy",
    name: "新能源·电力",
    dot: "bg-emerald-500",
    patterns: [
      "光伏", "风能", "风电", "储能", "电池", "氢能", "核能", "核电", "核聚变",
      "钙钛矿", "HJT", "TOPCon", "特高压", "电网", "虚拟电厂", "电力", "发电",
      "抽水蓄能", "地热能", "热泵", "超导", "输电", "硅能源", "水电", "新能源",
      "电容", "集流体",
    ],
  },
  {
    id: "ce",
    name: "消费电子",
    dot: "bg-pink-500",
    patterns: [
      "消费电子", "OLED", "LED", "显示", "面板", "超清视频", "视频", "裸眼3D",
      "3D玻璃", "3D摄像头", "屏下摄像", "电子纸", "折叠屏", "柔性屏", "耳机",
      "穿戴", "音箱", "家居", "电视", "虚拟现实", "增强现实", "混合现实", "全息",
      "无线充电", "玻璃基板", "空间计算", "照明",
    ],
  },
  {
    id: "consumer",
    name: "消费",
    dot: "bg-amber-600",
    patterns: [
      "白酒", "酿酒", "啤酒", "乳业", "预制菜", "调味品", "代糖", "食品", "人造肉",
      "免税", "退税", "旅游", "酒店", "露营", "冰雪", "体育", "彩票", "化妆品",
      "宠物", "婴童", "托育", "养老", "零售", "电商", "C2M", "团购", "供销社",
      "电子烟", "品牌", "首发经济", "地摊", "共享经济", "味蕾", "统一大市场",
      "内贸流通", "网红", "包装材料", "新消费",
    ],
  },
  {
    id: "media",
    name: "传媒·文娱",
    dot: "bg-lime-600",
    patterns: [
      "游戏", "短剧", "影视", "电竞", "竞技", "阅读", "教育", "元宇宙", "文娱",
      "谷子", "盲盒", "IP",
    ],
  },
  {
    id: "resource",
    name: "资源·周期",
    dot: "bg-orange-700",
    patterns: [
      "黄金", "稀土", "金属", "稀缺资源", "锂矿", "开采", "页岩气", "可燃冰",
      "天然气", "油气", "油服", "海工装备", "冶金", "钢铁", "煤炭", "石油", "小金属",
    ],
  },
  {
    id: "chemical",
    name: "化工·新材料",
    dot: "bg-green-600",
    patterns: [
      "化工", "气体", "染料", "磷", "氟", "环氧", "钛白粉", "草甘膦", "PVDF",
      "塑料", "石墨烯", "碳纤维", "碳基", "PEEK", "纳米银", "蓝宝石", "新材料",
      "培育钻石", "抗菌面料", "有机硅", "硅", "玻纤", "氦气", "造纸", "印刷",
    ],
  },
  {
    id: "infra",
    name: "基建·区域",
    dot: "bg-yellow-700",
    patterns: [
      "基建", "建设", "管网", "建筑", "海绵", "城镇化", "雄安", "新区", "京津冀",
      "长江三角", "特区", "西部大开发", "东北振兴", "一带一路", "自贸", "自由贸易", "PPP",
      "租售同权", "房屋检测", "水利",
    ],
  },
  {
    id: "agri",
    name: "农业",
    dot: "bg-green-700",
    patterns: [
      "农业", "种植", "种业", "种子", "转基因", "粮食", "猪肉", "鸡肉", "水产",
      "养殖", "农机", "农药", "兽药", "动物疫苗", "化肥", "饲料", "乡村", "土地流转",
    ],
  },
  {
    id: "transport",
    name: "交运·物流",
    dot: "bg-sky-600",
    patterns: ["快递", "物流", "冷链", "高铁", "磁悬浮", "交运", "海洋经济", "港口", "航运", "机场"],
  },
  {
    id: "env",
    name: "环保·公用",
    dot: "bg-emerald-700",
    patterns: [
      "环保", "节能", "垃圾", "土壤修复", "尾气", "核污染", "噪声", "净水", "碳交易",
      "碳中和", "减排", "医废", "水务", "燃气",
    ],
  },
  {
    id: "event",
    name: "事件·改革",
    dot: "bg-stone-600",
    patterns: [
      "改革", "重组", "并购", "股权", "增持", "举牌", "回购", "中特估", "专精特新",
      "贬值", "中俄", "反内卷",
    ],
  },
  {
    id: "style",
    name: "风格·持仓",
    dot: "bg-neutral-400",
    exact: [
      "融资融券", "转债标的", "沪股通", "深股通", "AB股", "AH股", "B股", "GDR", "ST股",
      "次新股", "茅指数", "宁组合", "中字头", "东方财富热股", "证金持股", "密集调研",
      "外资背景", "养老金", "行业龙头", "创业板综", "创业成份", "价值股",
      "权重股", "趋势股", "题材股", "周期股", "反转股", "高成长股", "连续亏损",
      "上证50_", "上证180_", "上证380", "深成500", "深证100R", "央视50_", "中证500",
      "标准普尔", "富时罗素", "MSCI中国", "HS300_", "科创板做市商", "科创板做市股",
      "破增发价股", "近期摘帽", "百元股", "破净股", "长期破净", "破发股", "微利股",
    ],
    patterns: [
      "昨日", "最近多板", "新高", "新低", "摘帽", "破净", "破发", "市盈率", "市净率",
      "盘股", "微盘", "成长", "价值", "权重", "趋势", "题材", "周期", "反转", "低价",
      "百元", "微利", "亏损", "风格", "重仓", "新进", "增仓", "减仓", "股通", "做市",
      "调研", "龙头", "中字头", "融资", "转债", "红利", "上证", "深证", "深成", "央视",
      "中证", "MSCI", "富时", "标普", "HS300", "创业板", "预增", "预减", "扭亏", "首亏",
      "增发", "QFII", "社保", "私募", "基金", "机构", "大基金", "做市", "超跌", "信托",
    ],
  },
];

/** 兜底类别（无法归类的新板块） */
export const CONCEPT_CATEGORY_OTHER: ConceptCategory = {
  id: "other",
  name: "其他",
  dot: "bg-neutral-300 dark:bg-neutral-600",
  patterns: [],
};

/** 精确特例覆盖（优先级最高）：子串规则会误伤的板块在此整名指定 */
const OVERRIDES: Record<string, string> = {
  // 含 AI 但属于医药
  "AI制药（医疗）": "pharma",
  // 含「医」但属于环保
  "医废处理": "env",
  // 含「生物」但属于电力/识别
  "生物质能发电": "newenergy",
  "生物识别": "ai",
  // 含「机器人」但属于 AI 数字人
  "虚拟机器人": "ai",
  // 含「互联网」但属于通信卫星族
  "卫星互联网": "telecom",
  // 养老金是持仓类；养老概念才是消费
  "养老金": "style",
  // 农药兽药是农业化工，不是医药；转基因是农业不是基因测序
  "农药兽药": "agri",
  "转基因": "agri",
  // 风格聚合板但含行业词，会被先分类
  "医药医疗风格": "style",
  "金融地产风格": "style",
};

const CATEGORY_BY_ID = new Map<string, ConceptCategory>(
  [...CONCEPT_CATEGORIES, CONCEPT_CATEGORY_OTHER].map(c => [c.id, c])
);

/** 归类结果缓存（同一板块名会被反复查询：面板聚合 × 每日 × 个股概念 × 每行） */
const classifyCache = new Map<string, string>();

/**
 * 概念名 → 大类 id。流程：精确特例 → 按序类别（exact → 子串）→ other。
 * 对未知新板块安全降级到 other，永不抛错。
 */
export function classifyConcept(name: string): string {
  const key = name.trim();
  if (!key) return CONCEPT_CATEGORY_OTHER.id;
  const cached = classifyCache.get(key);
  if (cached) return cached;
  let result = CONCEPT_CATEGORY_OTHER.id;
  const lower = key.toLowerCase();
  do {
    const override = OVERRIDES[key];
    if (override) { result = override; break; }
    let matched = false;
    for (const cat of CONCEPT_CATEGORIES) {
      if (cat.exact?.includes(key)) { result = cat.id; matched = true; break; }
      if (cat.patterns.some(p => lower.includes(p.toLowerCase()))) {
        result = cat.id; matched = true; break;
      }
    }
    if (!matched) result = CONCEPT_CATEGORY_OTHER.id;
  } while (false);
  classifyCache.set(key, result);
  return result;
}

/** 类别 id → 类别元信息（未知 id 回退到 other） */
export function getConceptCategory(id: string): ConceptCategory {
  return CATEGORY_BY_ID.get(id) ?? CONCEPT_CATEGORY_OTHER;
}

/** 全部类别（含兜底），供图例/下拉使用 */
export function allConceptCategories(): ConceptCategory[] {
  return [...CONCEPT_CATEGORIES, CONCEPT_CATEGORY_OTHER];
}
