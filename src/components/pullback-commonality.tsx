"use client";

import React, { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  Clock,
  Flame,
  Info,
  Layers,
  Lightbulb,
  TrendingUp,
  Zap,
  type LucideIcon,
} from "lucide-react";

// ── Types (mirror of the pullback API response shape) ──

interface KLineDay {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  changePct: number;
}

interface PullbackStock {
  symbol: string;
  name: string;
  limitUpDate: string;
  limitUpClose: number;
  preLimitUpClose: number;
  limitUpPct: number;
  currentPrice: number;
  currentChangePct: number;
  pullbackPct: number;
  approachPct: number;
  daysSinceLimitUp: number;
  maxPullbackPct: number;
  maxPullbackDate: string;
  klineSummary: KLineDay[];
  turnover: number;
  marketCap: number;
  volumeRatio: number;
}

// ── Stat helpers ───────────────────────────────────────

function median(nums: number[]): number {
  const valid = nums.filter(n => Number.isFinite(n));
  if (valid.length === 0) return 0;
  const sorted = [...valid].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function share(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

/** Per-stock derived metrics used by the commonality analysis */
interface StockExt {
  reboundFromLow: number; // 现价相对涨停后最低收盘价的涨幅(%)
  lowWindow: number;      // 回踩低点距涨停日的交易日数
  daysSinceLow: number;   // 低点距最新的交易日数(反弹启动耗时)
  streak: number;         // 连板数(涨停日向前连续涨停天数)
}

function buildExt(s: PullbackStock): StockExt {
  const kline = s.klineSummary || [];
  const luIdx = kline.findIndex(k => k.date === s.limitUpDate);
  const after = luIdx >= 0 ? kline.slice(luIdx + 1) : [];

  // 回踩低点 = 涨停日之后的最低收盘价
  let lowClose = Number.POSITIVE_INFINITY;
  let lowIdx = -1;
  after.forEach((k, i) => {
    if (k.close < lowClose) {
      lowClose = k.close;
      lowIdx = i;
    }
  });
  if (lowIdx < 0) lowClose = s.currentPrice;

  const reboundFromLow = lowClose > 0 ? ((s.currentPrice - lowClose) / lowClose) * 100 : 0;
  const lowWindow = lowIdx >= 0 ? lowIdx : 0;
  const daysSinceLow = lowIdx >= 0 ? after.length - 1 - lowIdx : 0;

  // 连板数: 涨停日向前连续涨停(含当日), 板块阈值由涨停日涨幅推断
  const threshold = s.limitUpPct >= 19.5 ? 19.5 : 9.5;
  let streak = 0;
  if (luIdx >= 0) {
    for (let i = luIdx; i >= 0; i--) {
      if (kline[i].changePct >= threshold) streak++;
      else break;
    }
  }
  return { reboundFromLow, lowWindow, daysSinceLow, streak };
}

interface CommonalityStats {
  n: number;
  // 反弹动能
  reboundShare: number;      // 自低点反弹 >= 3% 占比
  medianRebound: number;     // 自低点反弹中位(%)
  rebound10Share: number;    // 自低点反弹 >= 10% 占比
  todayUpShare: number;      // 今日收涨占比
  todayBigUpN: number;       // 今日涨幅 >= 9.5% 只数
  // 回踩结构
  fullGivebackShare: number; // approachPct >= 100 (完全回吐) 占比
  medianMaxPullback: number; // 最大回撤中位(%)
  // 时间窗口
  medianLowWindow: number;   // 低点距涨停交易日中位
  lowWindow38Share: number;  // 低点落在 3-8 交易日占比
  medianDaysSinceLow: number;// 低点距最新交易日中位
  // 涨停质量
  firstBoardShare: number;   // 首板占比
  twoBoardShare: number;     // 2 板占比
  threePlusBoardShare: number; // 3 板及以上占比
  board20Share: number;      // 20cm 板占比
  // 资金画像 (行情富化缺失时 valid 占比过低则不展示)
  enrichmentOk: boolean;
  medianTurnover: number;
  medianVolumeRatio: number;
  medianMarketCap: number;
  smallCapShare: number;     // 市值 < 100 亿占比(有效样本内)
  // 风险
  weakShare: number;         // 尚未脱离低点区域(反弹 < 3%)占比
}

const REBOUND_TH = 3; // 反弹确认线(%)

function computeStats(stocks: PullbackStock[]): CommonalityStats {
  const n = stocks.length;
  const ext = stocks.map(buildExt);

  const rebounded = ext.filter(e => e.reboundFromLow >= REBOUND_TH).length;
  const todayUp = stocks.filter(s => s.currentChangePct > 0).length;
  const todayBigUp = stocks.filter(s => s.currentChangePct >= 9.5).length;
  const fullGiveback = stocks.filter(s => s.approachPct >= 99.5).length;
  const lowWin38 = ext.filter(e => e.lowWindow >= 3 && e.lowWindow <= 8).length;

  const firstBoard = ext.filter(e => e.streak === 1).length;
  const twoBoard = ext.filter(e => e.streak === 2).length;
  const threePlus = ext.filter(e => e.streak >= 3).length;
  const board20 = stocks.filter(s => s.limitUpPct >= 19.5).length;

  // 行情富化数据(换手/量比/市值)可能整批缺失(为 0), 仅在有效样本充足时启用资金画像
  const capValid = stocks.filter(s => s.marketCap > 0);
  const enrichmentOk = capValid.length >= Math.max(5, n * 0.3);
  const smallCap = capValid.filter(s => s.marketCap < 100).length;

  return {
    n,
    reboundShare: share(rebounded, n),
    medianRebound: median(ext.map(e => e.reboundFromLow)),
    rebound10Share: share(ext.filter(e => e.reboundFromLow >= 10).length, n),
    todayUpShare: share(todayUp, n),
    todayBigUpN: todayBigUp,
    fullGivebackShare: share(fullGiveback, n),
    medianMaxPullback: median(stocks.map(s => s.maxPullbackPct)),
    medianLowWindow: median(ext.map(e => e.lowWindow)),
    lowWindow38Share: share(lowWin38, n),
    medianDaysSinceLow: median(ext.map(e => e.daysSinceLow)),
    firstBoardShare: share(firstBoard, n),
    twoBoardShare: share(twoBoard, n),
    threePlusBoardShare: share(threePlus, n),
    board20Share: share(board20, n),
    enrichmentOk,
    medianTurnover: median(stocks.filter(s => s.turnover > 0).map(s => s.turnover)),
    medianVolumeRatio: median(stocks.filter(s => s.volumeRatio > 0).map(s => s.volumeRatio)),
    medianMarketCap: median(capValid.map(s => s.marketCap)),
    smallCapShare: share(smallCap, capValid.length),
    weakShare: share(n - rebounded, n),
  };
}

// ── Sub-components ─────────────────────────────────────

function StatChip({ icon: Icon, label, value, sub, fg }: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  fg: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg border bg-muted/20">
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Icon className="w-3.5 h-3.5" />
        <span>{label}</span>
      </div>
      <span className={`text-lg font-bold font-mono ${fg}`}>{value}</span>
      <span className="text-[10px] text-muted-foreground">{sub}</span>
    </div>
  );
}

function InsightRow({ icon: Icon, iconColor, title, children }: {
  icon: LucideIcon;
  iconColor: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <div className={`mt-0.5 shrink-0 w-6 h-6 rounded-md flex items-center justify-center border ${iconColor}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="min-w-0">
        <span className="text-xs font-medium text-foreground">{title}</span>
        <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{children}</p>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────

export function PullbackCommonality({ stocks, timestamp }: {
  stocks: PullbackStock[];
  timestamp: string;
}) {
  const stats = useMemo(() => computeStats(stocks), [stocks]);
  const s = stats;

  const timeLabel = useMemo(() => {
    try {
      return new Date(timestamp).toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  }, [timestamp]);

  if (s.n < 5) return null;

  const chips: {
    icon: LucideIcon;
    label: string;
    value: string;
    sub: string;
    fg: string;
  }[] = [
    { icon: Layers, label: "样本总数", value: String(s.n), sub: "全部回踩股", fg: "text-foreground" },
    { icon: TrendingUp, label: "自低点反弹", value: `${s.reboundShare}%`, sub: "反弹 ≥ 3% 占比", fg: "text-emerald-600 dark:text-emerald-400" },
    { icon: Activity, label: "今日收涨", value: `${s.todayUpShare}%`, sub: "二次上攻占比", fg: "text-emerald-600 dark:text-emerald-400" },
    { icon: Zap, label: "中位反弹", value: `+${s.medianRebound.toFixed(1)}%`, sub: "自回踩低点", fg: "text-amber-600 dark:text-amber-400" },
    { icon: Flame, label: "首板占比", value: `${s.firstBoardShare}%`, sub: `2板 ${s.twoBoardShare}% / 3板+ ${s.threePlusBoardShare}%`, fg: "text-orange-600 dark:text-orange-400" },
    { icon: Clock, label: "低点窗口", value: `${s.medianLowWindow.toFixed(0)}天`, sub: "距涨停交易日中位", fg: "text-violet-600 dark:text-violet-400" },
  ];

  return (
    <Card className="border-border/50 shadow-sm" aria-label="涨停回踩再上涨共性归纳">
      <CardContent className="py-4 px-4 md:px-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-center">
              <Lightbulb className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <span className="text-sm font-semibold text-foreground">涨停回踩再上涨 · 共性归纳</span>
              <span className="block text-[10px] text-muted-foreground">
                基于本次扫描全部 {s.n} 只回踩样本动态计算{timeLabel ? ` · 数据时间 ${timeLabel}` : ""}
              </span>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] py-0 px-1.5 gap-1 bg-muted/40 text-muted-foreground">
            <Info className="w-2.5 h-2.5" />
            随扫描数据自动更新
          </Badge>
        </div>

        {/* Stat chips */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {chips.map((c, i) => (
            <StatChip key={i} icon={c.icon} label={c.label} value={c.value} sub={c.sub} fg={c.fg} />
          ))}
        </div>

        {/* Insight bullets */}
        <div className="space-y-3">
          <InsightRow icon={TrendingUp} iconColor="bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400" title="反弹动能普遍且启动快">
            {s.reboundShare}% 的个股已自回踩低点反弹 ≥3%（中位 +{s.medianRebound.toFixed(1)}%），今日 {s.todayUpShare}% 收涨、
            <b className="text-foreground">{s.todayBigUpN} 只</b>今日涨幅 ≥9.5%（再度封板或接近）——
            回踩并非趋势终结，低点出现后中位仅 {s.medianDaysSinceLow.toFixed(0)} 个交易日即展开二次上攻。
            但自低点反弹超 10% 的仅 {s.rebound10Share}%，多数反弹仍处于温和修复阶段。
          </InsightRow>

          <InsightRow icon={ArrowDownRight} iconColor="bg-orange-500/10 border-orange-500/30 text-orange-600 dark:text-orange-400" title="深回踩是主流形态">
            {s.fullGivebackShare}% 的个股已完全回吐涨停涨幅、回到起涨点附近甚至跌破，涨停后最大回撤中位 {s.medianMaxPullback.toFixed(1)}%。
            能在浅回踩（保留大部分涨幅）后直接续涨的是少数——多数个股需要经历「涨全部跌回去」的充分换手，才迎来二次上涨。
          </InsightRow>

          <InsightRow icon={Clock} iconColor="bg-violet-500/10 border-violet-500/30 text-violet-600 dark:text-violet-400" title="时间窗口集中在一周左右">
            回踩低点距涨停日中位 {s.medianLowWindow.toFixed(0)} 个交易日，{s.lowWindow38Share}% 的低点落在涨停后 3-8 天——
            「涨停后一周左右见低点、随后快速反抽」是本组样本的主要节奏，过早（1-2 天）与过晚（&gt;10 天）的低点占比都低。
          </InsightRow>

          <InsightRow icon={Flame} iconColor="bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400" title="首板股是回踩再涨的绝对主力">
            首板占 {s.firstBoardShare}%，2 板 {s.twoBoardShare}%、3 板及以上仅 {s.threePlusBoardShare}%；20cm 高弹性板块（创业/科创）占 {s.board20Share}%。
            首板涨停后的充分回踩是二次启动的高发土壤，而高位连板股一旦深回踩，多属于情绪退潮而非低吸机会。
          </InsightRow>

          {s.enrichmentOk && (
            <InsightRow icon={Activity} iconColor="bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400" title="资金画像偏向中小市值 + 高换手">
              有行情富化数据的样本中：换手率中位 {s.medianTurnover.toFixed(1)}%、量比中位 {s.medianVolumeRatio.toFixed(2)}、总市值中位 {s.medianMarketCap.toFixed(0)} 亿
              （其中 {s.smallCapShare}% 低于 100 亿）——小盘高换手带来的高波动，是涨停-回踩-再上涨循环的典型土壤。
            </InsightRow>
          )}

          <InsightRow icon={AlertTriangle} iconColor="bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400" title="反弹并非全部兑现，弱势股需甄别">
            仍有 {s.weakShare}% 的个股尚未脱离低点区域（自低点反弹 &lt;3%）——深回踩 + 跌破起涨点的组合里，
            只有企稳放量者才能进入「再上涨」阶段；对反弹乏力、阴跌不止的样本宜回避或等待右侧信号。
          </InsightRow>
        </div>

        {/* One-line conclusion */}
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3.5 py-3">
          <div className="flex items-start gap-2">
            <Lightbulb className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs leading-relaxed text-foreground">
              <b>一句话共性：</b>
              本期「涨停 → 回踩 → 再上涨」样本以首板股（{s.firstBoardShare}%）为主，涨停后约 {s.medianLowWindow.toFixed(0)} 个交易日完成深度回踩
              （最大回撤中位 {s.medianMaxPullback.toFixed(1)}%，{s.fullGivebackShare}% 跌回起涨点），
              低点出现后中位 {s.medianDaysSinceLow.toFixed(0)} 天即快速反抽——{s.reboundShare}% 自低点反弹 ≥3%、今日 {s.todayUpShare}% 收涨、{s.todayBigUpN} 只再度大涨。
              「深回踩换手 → 低位快速企稳 → 首板弹性修复」是本组再上涨股的共同路径。
            </p>
          </div>
        </div>

        {/* Methodology footnote */}
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          口径说明：反弹幅度 = 现价相对涨停后最低收盘价的涨幅；低点窗口 = 回踩低点距涨停日的交易日数；连板数 = 涨停日向前连续涨停天数；
          样本 = 本次扫描全部符合条件的回踩股（非筛选子集）。结论随每轮扫描数据动态更新，仅供研究参考，不构成投资建议。
        </p>
      </CardContent>
    </Card>
  );
}

export default PullbackCommonality;
