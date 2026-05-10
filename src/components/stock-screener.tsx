"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Filter,
  RefreshCw,
  TrendingUp,
  Zap,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  ChevronUp,
  ChevronDown,
  AlertCircle,
  Loader2,
  BarChart3,
  Target,
  Database,
  ChevronDown as ChevronDownIcon,
  ChevronUp as ChevronUpIcon,
  X,
  SlidersHorizontal,
  Bookmark,
  BookmarkPlus,
  Trash2,
  Check,
  Settings,
  Save,
  Eye,
  EyeOff,
  Cpu,
  Shield,
  Star,
  Clock,
  Sparkles,
} from "lucide-react";

import { formatMarketCap, formatAmount, loadWatchlist, addToWatchlist, removeFromWatchlist, isInWatchlist, type WatchlistItem, useAutoRefresh, computeScreenerStats, isTradingHours } from "@/lib/screener-shared";
import { cachedFetch } from "@/lib/client-cache";

// ── Types ──────────────────────────────────────────────

interface ScreenerStock {
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
  circulatingMarketCap: number;
  pe: number;
  pb: number;
  amplitude: number;
  mainNetInflow: number;
  sellVol: number;
  buyVol: number;
  buySellRatio: number;
  pricePosition: number;
  gapUpRate: number;
  pulseScore: number;
  pulseDetail: string;
  volumeSurgeScore: number;
  volumeSurgeDetail: string;
  progressiveVolScore: number;
  progressiveVolDetail: string;
  evaluation: string;
  evaluationDetail: string;
  reliabilityScore: number;
  reliabilityDetail: string;
  volumeRatio: number;
  compositeScore: number;
  compositeDetail: string;
  resonanceTags: string;
  vwapPosition: string;
  vwapPositionDetail: string;
  capitalTrend: string;
  capitalTrendDetail: string;
  // ── v5.0 进阶筛选字段 ──
  consecutiveUpDays: number;
  limitUpStrength: number;
  largeOrderRatio: number;
  openingStrength: string;
  vwapDeviation: number;
  lateSessionActivity: string;
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
  cached?: boolean;
}

type SortField = "compositeScore" | "pulseScore" | "changePercent" | "marketCap" | "turnover" | "amplitude" | "mainNetInflow" | "volumeSurgeScore" | "progressiveVolScore" | "reliabilityScore";
type SortOrder = "asc" | "desc";

// ── Helper Functions ───────────────────────────────────

function getPulseScoreColor(score: number): string {
  if (score >= 70) return "text-red-500";
  if (score >= 50) return "text-orange-500";
  if (score >= 30) return "text-yellow-500";
  if (score >= 20) return "text-lime-500";
  if (score >= 10) return "text-emerald-400";
  return "text-gray-400";
}

function getPulseScoreBg(score: number): string {
  if (score >= 70) return "bg-red-500/10 border-red-500/30";
  if (score >= 50) return "bg-orange-500/10 border-orange-500/30";
  if (score >= 30) return "bg-yellow-500/10 border-yellow-500/30";
  if (score >= 20) return "bg-lime-500/10 border-lime-500/30";
  if (score >= 10) return "bg-emerald-500/10 border-emerald-500/30";
  return "bg-gray-500/10 border-gray-500/30";
}

function getPulseLabel(score: number): string {
  if (score >= 70) return "强脉冲";
  if (score >= 50) return "中脉冲";
  if (score >= 30) return "弱脉冲";
  if (score >= 20) return "轻微脉冲";
  if (score >= 10) return "微弱脉冲";
  return "无脉冲";
}

function getVolumeSurgeScoreColor(score: number): string {
  if (score >= 70) return "text-red-500";
  if (score >= 50) return "text-orange-500";
  if (score >= 30) return "text-yellow-500";
  if (score >= 20) return "text-lime-500";
  if (score >= 10) return "text-emerald-400";
  return "text-gray-400";
}

function getVolumeSurgeScoreBg(score: number): string {
  if (score >= 70) return "bg-red-500/10 border-red-500/30";
  if (score >= 50) return "bg-orange-500/10 border-orange-500/30";
  if (score >= 30) return "bg-yellow-500/10 border-yellow-500/30";
  if (score >= 20) return "bg-lime-500/10 border-lime-500/30";
  if (score >= 10) return "bg-emerald-500/10 border-emerald-500/30";
  return "bg-gray-500/10 border-gray-500/30";
}

function getVolumeSurgeLabel(score: number): string {
  if (score >= 70) return "强放量拉升";
  if (score >= 50) return "中放量拉升";
  if (score >= 30) return "弱放量拉升";
  if (score >= 20) return "轻微放量拉升";
  if (score >= 10) return "微弱放量拉升";
  return "无放量拉升";
}

function getProgressiveVolScoreColor(score: number): string {
  if (score >= 70) return "text-red-500";
  if (score >= 50) return "text-orange-500";
  if (score >= 30) return "text-yellow-500";
  if (score >= 20) return "text-lime-500";
  if (score >= 10) return "text-emerald-400";
  return "text-gray-400";
}

function getProgressiveVolScoreBg(score: number): string {
  if (score >= 70) return "bg-red-500/10 border-red-500/30";
  if (score >= 50) return "bg-orange-500/10 border-orange-500/30";
  if (score >= 30) return "bg-yellow-500/10 border-yellow-500/30";
  if (score >= 20) return "bg-lime-500/10 border-lime-500/30";
  if (score >= 10) return "bg-emerald-500/10 border-emerald-500/30";
  return "bg-gray-500/10 border-gray-500/30";
}

function getProgressiveVolLabel(score: number): string {
  if (score >= 70) return "强递增";
  if (score >= 50) return "中递增";
  if (score >= 30) return "弱递增";
  if (score >= 20) return "轻微递增";
  if (score >= 10) return "微弱递增";
  return "无递增";
}

function getEvaluationStyle(label: string): { bg: string; text: string; icon: string } {
  switch (label) {
    case "强势续涨": return { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300", icon: "🔥" };
    case "温和看多": return { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-300", icon: "📈" };
    case "震荡整理": return { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-300", icon: "↔️" };
    case "弱势回调": return { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-300", icon: "📉" };
    case "拉高出货": return { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-300", icon: "⚠️" };
    case "观望等待": return { bg: "bg-gray-100 dark:bg-gray-900/30", text: "text-gray-700 dark:text-gray-300", icon: "⏳" };
    default: return { bg: "bg-gray-50 dark:bg-gray-800", text: "text-gray-500", icon: "" };
  }
}

function getReliabilityScoreColor(score: number): string {
  if (score >= 70) return "text-emerald-500";
  if (score >= 50) return "text-lime-500";
  if (score >= 30) return "text-yellow-500";
  if (score >= 15) return "text-orange-500";
  return "text-gray-400";
}

function getReliabilityScoreBg(score: number): string {
  if (score >= 70) return "bg-emerald-500/10 border-emerald-500/30";
  if (score >= 50) return "bg-lime-500/10 border-lime-500/30";
  if (score >= 30) return "bg-yellow-500/10 border-yellow-500/30";
  if (score >= 15) return "bg-orange-500/10 border-orange-500/30";
  return "bg-gray-500/10 border-gray-500/30";
}

function getReliabilityLabel(score: number): string {
  if (score >= 70) return "高可靠";
  if (score >= 50) return "较可靠";
  if (score >= 30) return "中等";
  if (score >= 15) return "一般";
  return "低";
}

function getCompositeScoreColor(score: number): string {
  if (score >= 80) return "text-red-500";
  if (score >= 65) return "text-orange-500";
  if (score >= 50) return "text-yellow-500";
  if (score >= 35) return "text-lime-500";
  if (score >= 20) return "text-emerald-400";
  return "text-gray-400";
}

function getCompositeScoreBg(score: number): string {
  if (score >= 80) return "bg-red-500/10 border-red-500/30";
  if (score >= 65) return "bg-orange-500/10 border-orange-500/30";
  if (score >= 50) return "bg-yellow-500/10 border-yellow-500/30";
  if (score >= 35) return "bg-lime-500/10 border-lime-500/30";
  if (score >= 20) return "bg-emerald-500/10 border-emerald-500/30";
  return "bg-gray-500/10 border-gray-500/30";
}

function getCompositeLabel(score: number): string {
  if (score >= 80) return "极佳";
  if (score >= 65) return "优秀";
  if (score >= 50) return "良好";
  if (score >= 35) return "一般";
  if (score >= 20) return "偏弱";
  return "弱势";
}

function getVwapPositionLabel(pos: string): { text: string; color: string } {
  switch (pos) {
    case "above_vwap": return { text: "均线上方", color: "text-red-500" };
    case "below_vwap": return { text: "均线下方", color: "text-green-500" };
    case "near_vwap": return { text: "均线附近", color: "text-yellow-500" };
    case "cross_up": return { text: "上穿均线", color: "text-red-500" };
    case "cross_down": return { text: "下穿均线", color: "text-green-500" };
    default: return { text: "--", color: "text-muted-foreground" };
  }
}

function getCapitalTrendLabel(trend: string): { text: string; color: string; icon: string } {
  switch (trend) {
    case "strong_inflow": return { text: "大幅流入", color: "text-red-500", icon: "\uD83D\uDD25" };
    case "moderate_inflow": return { text: "温和流入", color: "text-orange-500", icon: "\uD83D\uDCC8" };
    case "neutral": return { text: "中性", color: "text-muted-foreground", icon: "\u27A1\uFE0F" };
    case "outflow": return { text: "流出", color: "text-green-500", icon: "\uD83D\uDCC9" };
    case "strong_outflow": return { text: "大幅流出", color: "text-green-600", icon: "\u26A0\uFE0F" };
    default: return { text: "--", color: "text-muted-foreground", icon: "" };
  }
}

// ── Popular sectors for quick selection ────────────────

const POPULAR_SECTORS = [
  // ── 科技 ──
  { label: "通信", emoji: "📡" },
  { label: "半导体", emoji: "💎" },
  { label: "人工智能", emoji: "🤖" },
  { label: "算力", emoji: "🖥️" },
  { label: "软件", emoji: "💻" },
  { label: "信创", emoji: "🔒" },
  { label: "消费电子", emoji: "📱" },
  { label: "机器人", emoji: "🦾" },
  { label: "华为", emoji: "📲" },
  { label: "鸿蒙", emoji: "🦋" },
  { label: "游戏", emoji: "🎮" },
  { label: "传媒", emoji: "🎬" },
  { label: "云计算", emoji: "☁️" },
  { label: "大数据", emoji: "📊" },
  { label: "网络安全", emoji: "🔐" },
  { label: "元宇宙", emoji: "🥽" },
  { label: "物联网", emoji: "🔗" },
  { label: "数字货币", emoji: "💰" },
  // ── 新能源 ──
  { label: "新能源", emoji: "☀️" },
  { label: "光伏", emoji: "🌞" },
  { label: "锂电池", emoji: "🔋" },
  { label: "储能", emoji: "🔌" },
  { label: "新能源车", emoji: "🚗" },
  { label: "汽车", emoji: "🚘" },
  { label: "充电桩", emoji: "⛽" },
  { label: "风电", emoji: "🌬️" },
  { label: "氢能源", emoji: "🧪" },
  { label: "核能", emoji: "☢️" },
  // ── 医药 ──
  { label: "医药", emoji: "💊" },
  { label: "中药", emoji: "🌿" },
  { label: "创新药", emoji: "💉" },
  { label: "医疗器械", emoji: "🏥" },
  { label: "医美", emoji: "💆" },
  { label: "CRO", emoji: "🔬" },
  { label: "疫苗", emoji: "🦠" },
  { label: "血制品", emoji: "🩸" },
  // ── 金融 ──
  { label: "银行", emoji: "🏦" },
  { label: "证券", emoji: "📈" },
  { label: "保险", emoji: "🛡️" },
  { label: "多元金融", emoji: "🏛️" },
  // ── 消费 ──
  { label: "消费", emoji: "🛒" },
  { label: "白酒", emoji: "🍶" },
  { label: "食品", emoji: "🍜" },
  { label: "家电", emoji: "📺" },
  { label: "旅游", emoji: "✈️" },
  { label: "零售", emoji: "🏪" },
  { label: "纺织服装", emoji: "🧵" },
  { label: "宠物", emoji: "🐾" },
  { label: "预制菜", emoji: "🍱" },
  // ── 周期/资源 ──
  { label: "煤炭", emoji: "⛏️" },
  { label: "钢铁", emoji: "🔩" },
  { label: "有色", emoji: "🟡" },
  { label: "稀土", emoji: "🧲" },
  { label: "黄金", emoji: "🥇" },
  { label: "石油", emoji: "🛢️" },
  { label: "化工", emoji: "🧫" },
  { label: "建材", emoji: "🧱" },
  { label: "水泥", emoji: "🧱" },
  // ── 制造 ──
  { label: "军工", emoji: "🛡️" },
  { label: "国防", emoji: "🎖️" },
  { label: "航空", emoji: "🛩️" },
  { label: "造船", emoji: "🚢" },
  { label: "电力", emoji: "⚡" },
  { label: "绿电", emoji: "🌱" },
  { label: "机械", emoji: "⚙️" },
  { label: "地产", emoji: "🏠" },
  { label: "建筑", emoji: "🏗️" },
  // ── 农业 ──
  { label: "农业", emoji: "🌾" },
  { label: "养殖", emoji: "🐷" },
  { label: "种业", emoji: "🌱" },
  { label: "化肥", emoji: "🧴" },
  // ── 交通物流 ──
  { label: "物流", emoji: "📦" },
  { label: "港口", emoji: "⚓" },
  { label: "高铁", emoji: "🚄" },
  // ── 环保 ──
  { label: "环保", emoji: "♻️" },
  { label: "碳交易", emoji: "🌍" },
  // ── 其他 ──
  { label: "教育", emoji: "📚" },
  { label: "跨境电商", emoji: "🌐" },
];

// ── Custom Presets (localStorage) ─────────────────────────

interface CustomPreset {
  id: string;
  name: string;
  filters: ScreenerFilters;
  createdAt: number;
}

const CUSTOM_PRESETS_KEY = "screener-custom-presets";

function loadCustomPresets(): CustomPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCustomPresets(presets: CustomPreset[]): void {
  try {
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets));
  } catch {
    // ignore quota errors
  }
}

// ── Module-level client cache (persists across tab switches) ────────

interface ClientCacheEntry {
  result: ScreenerResult;
  lastFetchTime: string;
  timestamp: number;
  filters: ScreenerFilters;
}
const CLIENT_CACHE_TTL = 3 * 60 * 1000; // 3 minutes

let clientCache: ClientCacheEntry | null = null;

// ── Filter State Type ──────────────────────────────────

interface ScreenerFilters {
  sector: string;
  minChange: number;
  maxChange: number;
  maxMarketCap: number;
  pulseThreshold: number;
  enablePulse: boolean;
  pulseTimeStart: string; // HH:mm format, e.g. "09:30"
  pulseTimeEnd: string;   // HH:mm format, e.g. "10:30"
  enableVolumeSurge: boolean;
  volumeSurgeThreshold: number;
  enableProgressiveVol: boolean;
  progressiveVolThreshold: number;
  // ── Enhanced conditions ──
  minTurnover: number;
  maxTurnover: number;
  minPE: number;
  maxPE: number;
  minVolumeRatio: number;
  mainNetInflowRequired: boolean;
  minAmplitude: number;
  maxAmplitude: number;
  enableMATrend: boolean;
  maTrendType: string; // "above_ma5" | "above_ma10" | "above_ma20" | "bullish_alignment"
  evaluationFilter: string[]; // 只显示特定评估标签
  minCompositeScore: number;  // 最低综合评分
  // ── New v4.0 conditions ──
  maxCirculatingMarketCap: number; // 最大流通市值(亿)，0=不限
  minPB: number;              // 最小市净率
  maxPB: number;              // 最大市净率，0=不限
  minBuySellRatio: number;    // 最小外盘/内盘比率，0=不限
  minPricePosition: number;   // 最小日内价格位置分位(0-100)，0=不限
  minGapUpRate: number;       // 最小开盘跳空幅度%，0=不限
  // ── v5.0 进阶筛选 ──
  minConsecutiveUpDays: number;   // 最小连涨天数，0=不限
  minLimitUpStrength: number;     // 最小封板强度，0=不限
  minLargeOrderRatio: number;     // 最小大单占比%，0=不限
  openingStrengthFilter: string;  // 开盘强弱筛选，""=不限
  maxVwapDeviation: number;       // 最大均价偏离度%，0=不限
  minVwapDeviation: number;       // 最小均价偏离度%，0=不限
  enableLateSessionFilter: boolean; // 是否启用尾盘异动筛选
  lateSessionType: string;        // 尾盘异动类型: "late_rally" | "late_drop"
}

const DEFAULT_FILTERS: ScreenerFilters = {
  sector: "通信",
  minChange: -5,
  maxChange: 10,
  maxMarketCap: 200,
  pulseThreshold: 10,
  enablePulse: true,
  pulseTimeStart: "09:30",
  pulseTimeEnd: "10:30",
  enableVolumeSurge: true,
  volumeSurgeThreshold: 10,
  enableProgressiveVol: true,
  progressiveVolThreshold: 10,
  // Enhanced conditions
  minTurnover: 0,
  maxTurnover: 100,
  minPE: 0,
  maxPE: 500,
  minVolumeRatio: 0,
  mainNetInflowRequired: false,
  minAmplitude: 0,
  maxAmplitude: 20,
  enableMATrend: false,
  maTrendType: "above_ma5",
  evaluationFilter: [],
  minCompositeScore: 0,
  // New v4.0 conditions
  maxCirculatingMarketCap: 0,
  minPB: 0,
  maxPB: 0,
  minBuySellRatio: 0,
  minPricePosition: 0,
  minGapUpRate: 0,
  // v5.0 进阶筛选
  minConsecutiveUpDays: 0,
  minLimitUpStrength: 0,
  minLargeOrderRatio: 0,
  openingStrengthFilter: "",
  maxVwapDeviation: 0,
  minVwapDeviation: 0,
  enableLateSessionFilter: false,
  lateSessionType: "late_rally",
};

// ── Component ──────────────────────────────────────────

interface StockScreenerProps {
  onSelectStock?: (symbol: string) => void;
}

export function StockScreener({ onSelectStock }: StockScreenerProps) {
  const [result, setResult] = useState<ScreenerResult | null>(clientCache?.result ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("compositeScore");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [lastFetchTime, setLastFetchTime] = useState<string>(clientCache?.lastFetchTime ?? "");
  const [isFromCache, setIsFromCache] = useState(!!clientCache);

  // Filter states
  const [filters, setFilters] = useState<ScreenerFilters>(clientCache?.filters ?? DEFAULT_FILTERS);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [sectorInput, setSectorInput] = useState(clientCache?.filters.sector ?? "通信");
  const [showSectorDropdown, setShowSectorDropdown] = useState(false);
  const sectorDropdownRef = useRef<HTMLDivElement>(null);

  // Custom presets
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>([]);
  const [presetNameInput, setPresetNameInput] = useState("");
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [deletingPresetId, setDeletingPresetId] = useState<string | null>(null);

  // Strategy panel states
  const [strategyExpanded, setStrategyExpanded] = useState(false);
  const [strategyTab, setStrategyTab] = useState("overview");
  const [strategyFactors, setStrategyFactors] = useState<any[]>([]);
  const [strategyConfig, setStrategyConfig] = useState<Record<string, Record<string, number>>>({});
  const [strategyLoading, setStrategyLoading] = useState(false);
  const strategyFetchedRef = useRef(false);
  const [editingParamKey, setEditingParamKey] = useState<string | null>(null);
  const [editingParamValue, setEditingParamValue] = useState<string>("");

  // Watchlist state
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);

  // Auto-refresh state
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);

  // Stats expanded state
  const [statsExpanded, setStatsExpanded] = useState(false);

  // Load custom presets from localStorage on mount
  useEffect(() => {
    setCustomPresets(loadCustomPresets());
  }, []);

  // Load watchlist on mount
  useEffect(() => {
    setWatchlist(loadWatchlist());
  }, []);

  // Listen for watchlist changes from other components/tabs
  useEffect(() => {
    const handler = () => setWatchlist(loadWatchlist());
    window.addEventListener("screener-watchlist-changed", handler);
    return () => window.removeEventListener("screener-watchlist-changed", handler);
  }, []);

  // Track page visibility for auto-refresh
  useEffect(() => {
    const handleVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Auto-refresh during trading hours
  useAutoRefresh(() => {
    if (!loading) fetchScreenerData(false);
  }, autoRefreshEnabled && pageVisible);

  // Close sector dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (sectorDropdownRef.current && !sectorDropdownRef.current.contains(e.target as Node)) {
        setShowSectorDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchScreenerData = useCallback(async (forceRefresh = false, customFilters?: ScreenerFilters) => {
    const f = customFilters || filters;
    setLoading(true);
    setError(null);
    setIsFromCache(false);
    try {
      const params = new URLSearchParams({
        minChange: String(f.minChange),
        maxChange: String(f.maxChange),
        maxMarketCap: String(f.maxMarketCap),
        pulseThreshold: String(f.pulseThreshold),
        sector: f.sector,
        pulseTimeStart: f.pulseTimeStart,
        pulseTimeEnd: f.pulseTimeEnd,
        volumeSurgeThreshold: String(f.volumeSurgeThreshold),
        progressiveVolThreshold: String(f.progressiveVolThreshold),
        // Enhanced conditions
        minTurnover: String(f.minTurnover),
        maxTurnover: String(f.maxTurnover),
        minPE: String(f.minPE),
        maxPE: String(f.maxPE),
        minVolumeRatio: String(f.minVolumeRatio),
        minAmplitude: String(f.minAmplitude),
        maxAmplitude: String(f.maxAmplitude),
        maTrendType: f.maTrendType,
      });
      if (!f.enablePulse) params.set("pulse", "false");
      if (!f.enableVolumeSurge) params.set("volumeSurge", "false");
      if (!f.enableProgressiveVol) params.set("progressiveVol", "false");
      if (f.mainNetInflowRequired) params.set("mainNetInflowRequired", "true");
      if (f.enableMATrend) params.set("enableMATrend", "true");
      if (f.maxCirculatingMarketCap > 0) params.set("maxCirculatingMarketCap", String(f.maxCirculatingMarketCap));
      if (f.minPB > 0) params.set("minPB", String(f.minPB));
      if (f.maxPB > 0) params.set("maxPB", String(f.maxPB));
      if (f.minBuySellRatio > 0) params.set("minBuySellRatio", String(f.minBuySellRatio));
      if (f.minPricePosition > 0) params.set("minPricePosition", String(f.minPricePosition));
      if (f.minGapUpRate > 0) params.set("minGapUpRate", String(f.minGapUpRate));
      // v5.0 进阶筛选
      if (f.minConsecutiveUpDays > 0) params.set("minConsecutiveUpDays", String(f.minConsecutiveUpDays));
      if (f.minLimitUpStrength > 0) params.set("minLimitUpStrength", String(f.minLimitUpStrength));
      if (f.minLargeOrderRatio > 0) params.set("minLargeOrderRatio", String(f.minLargeOrderRatio));
      if (f.openingStrengthFilter) params.set("openingStrengthFilter", f.openingStrengthFilter);
      if (f.maxVwapDeviation > 0) params.set("maxVwapDeviation", String(f.maxVwapDeviation));
      if (f.minVwapDeviation > 0) params.set("minVwapDeviation", String(f.minVwapDeviation));
      if (f.enableLateSessionFilter) params.set("enableLateSessionFilter", "true");
      if (f.enableLateSessionFilter && f.lateSessionType) params.set("lateSessionType", f.lateSessionType);
      if (forceRefresh) params.set("refresh", "1");
      const data: ScreenerResult = await cachedFetch<ScreenerResult>(
        `screener:${params.toString()}`,
        async () => {
          const res = await fetch(`/api/stock/screener?${params}`);
          if (!res.ok) throw new Error("选股失败");
          return res.json();
        },
        forceRefresh ? 0 : 180_000 // 3 min cache, 0 for force refresh
      );

      if (data.success) {
        const fetchTime = new Date().toLocaleTimeString("zh-CN");
        setResult(data);
        setLastFetchTime(fetchTime);
        setIsFromCache(!!data.cached);
        // Update client cache
        clientCache = { result: data, lastFetchTime: fetchTime, timestamp: Date.now(), filters: f };
      } else {
        setError(data.error || "选股失败");
      }
    } catch (e: any) {
      setError(e.message || "网络错误");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Auto-fetch on mount: always restore cache immediately,
  // then silently refresh in background if cache is stale
  useEffect(() => {
    if (clientCache) {
      // Always restore from cache first (instant display)
      setResult(clientCache.result);
      setLastFetchTime(clientCache.lastFetchTime);
      setFilters(clientCache.filters);
      setSectorInput(clientCache.filters.sector);
      setIsFromCache(true);

      // If cache is stale, silently refresh in background
      if (Date.now() - clientCache.timestamp >= CLIENT_CACHE_TTL) {
        fetchScreenerData(false, clientCache.filters);
      }
    } else {
      // No cache at all, fetch fresh data
      fetchScreenerData();
    }
  }, []);

  // Sort stocks
  const sortedStocks = React.useMemo(() => {
    if (!result?.stocks) return [];
    const stocks = [...result.stocks];
    stocks.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (sortOrder === "desc") return (bVal as number) - (aVal as number);
      return (aVal as number) - (bVal as number);
    });
    return stocks;
  }, [result?.stocks, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronUp className="w-3 h-3 opacity-30" />;
    return sortOrder === "desc"
      ? <ChevronDown className="w-3 h-3 opacity-80" />
      : <ChevronUp className="w-3 h-3 opacity-80" />;
  };

  // Handle filter changes
  const handleFilterChange = (key: keyof ScreenerFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleSectorSelect = (sector: string) => {
    setSectorInput(sector);
    handleFilterChange("sector", sector);
    setShowSectorDropdown(false);
  };

  const handleSectorInputConfirm = () => {
    if (sectorInput.trim()) {
      handleFilterChange("sector", sectorInput.trim());
    }
    setShowSectorDropdown(false);
  };

  // Apply filters and fetch
  const handleApplyFilters = () => {
    // Update sector from input
    if (sectorInput.trim() && sectorInput.trim() !== filters.sector) {
      const newFilters = { ...filters, sector: sectorInput.trim() };
      setFilters(newFilters);
      fetchScreenerData(true, newFilters);
    } else {
      fetchScreenerData(true);
    }
  };

  // Reset to defaults
  const handleResetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setSectorInput(DEFAULT_FILTERS.sector);
  };

  // Save current filters as a custom preset
  const handleSavePreset = () => {
    const name = presetNameInput.trim() || `${filters.sector} ${filters.minChange}%~${filters.maxChange}%`;
    const newPreset: CustomPreset = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      filters: { ...filters },
      createdAt: Date.now(),
    };
    const updated = [newPreset, ...customPresets];
    setCustomPresets(updated);
    saveCustomPresets(updated);
    setPresetNameInput("");
    setShowSavePreset(false);
  };

  // Delete a custom preset
  const handleDeletePreset = (id: string) => {
    const updated = customPresets.filter(p => p.id !== id);
    setCustomPresets(updated);
    saveCustomPresets(updated);
    setDeletingPresetId(null);
  };

  // Apply a custom preset
  const handleApplyPreset = (preset: CustomPreset) => {
    setFilters(preset.filters);
    setSectorInput(preset.filters.sector);
  };

  // Check if filters have changed from defaults
  const filtersChanged = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  // Compute cache remaining time for display
  const cacheRemaining = React.useMemo(() => {
    if (!clientCache) return 0;
    const elapsed = Date.now() - clientCache.timestamp;
    return Math.max(0, Math.ceil((CLIENT_CACHE_TTL - elapsed) / 1000));
  }, [lastFetchTime, isFromCache]);

  // ── Strategy Panel: fetch data on first expand ──
  const fetchStrategyData = useCallback(async () => {
    if (strategyFetchedRef.current) return;
    setStrategyLoading(true);
    try {
      const [factorsRes, configRes] = await Promise.all([
        fetch("/api/stock/strategy-factors"),
        fetch("/api/stock/strategy-config"),
      ]);
      const factorsData = await factorsRes.json();
      const configData = await configRes.json();
      if (factorsData.factors) setStrategyFactors(factorsData.factors);
      if (configData.configs) setStrategyConfig(configData.configs);
      strategyFetchedRef.current = true;
    } catch {
      // silently fail
    } finally {
      setStrategyLoading(false);
    }
  }, []);

  const handleStrategyExpand = () => {
    const next = !strategyExpanded;
    setStrategyExpanded(next);
    if (next && !strategyFetchedRef.current) {
      fetchStrategyData();
    }
  };

  // Toggle factor enabled/disabled
  const handleFactorToggle = async (factorId: string, enabled: boolean) => {
    try {
      await fetch("/api/stock/strategy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "factor", id: factorId, data: { enabled } }),
      });
      setStrategyFactors(prev => prev.map(f => f.id === factorId ? { ...f, enabled } : f));
    } catch {
      // silently fail
    }
  };

  // Update factor field (strength, tMode, timeWindow)
  const handleFactorFieldChange = async (factorId: string, field: string, value: string) => {
    try {
      await fetch("/api/stock/strategy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "factor", id: factorId, data: { [field]: value } }),
      });
      setStrategyFactors(prev => prev.map(f => f.id === factorId ? { ...f, [field]: value } : f));
    } catch {
      // silently fail
    }
  };

  // Save strategy config param
  const handleConfigSave = async (indicatorKey: string, paramKey: string, value: number) => {
    try {
      await fetch("/api/stock/strategy-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ indicatorKey, paramKey, value }),
      });
      setStrategyConfig(prev => ({
        ...prev,
        [indicatorKey]: { ...(prev[indicatorKey] || {}), [paramKey]: value },
      }));
    } catch {
      // silently fail
    }
    setEditingParamKey(null);
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header: Criteria Tags */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Filter className="w-4 h-4 text-emerald-500" />
              智能选股
            </CardTitle>
            <div className="flex items-center gap-2">
              {isFromCache && cacheRemaining > 0 && (
                <Badge variant="outline" className="text-xs py-0 px-1.5 gap-1 bg-blue-500/5 border-blue-500/20 text-blue-600 dark:text-blue-300">
                  <Database className="w-3 h-3" />
                  缓存 {cacheRemaining}s
                </Badge>
              )}
              {lastFetchTime && (
                <span className="text-xs text-muted-foreground">
                  更新于 {lastFetchTime}
                </span>
              )}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={autoRefreshEnabled ? "default" : "outline"}
                      size="sm"
                      onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
                      className="h-7 text-xs gap-1 relative"
                    >
                      <Clock className="w-3 h-3" />
                      {autoRefreshEnabled && isTradingHours() && (
                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {autoRefreshEnabled ? "自动刷新已开启（交易时段每分钟刷新）" : "自动刷新已关闭，点击开启"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchScreenerData(true)}
                disabled={loading}
                className="h-7 text-xs gap-1"
              >
                {loading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                刷新
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {/* Active Criteria Tags */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
              <BarChart3 className="w-3 h-3" />
              {filters.sector}板块
            </Badge>
            <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
              <Target className="w-3 h-3" />
              主板
            </Badge>
            <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
              <TrendingUp className="w-3 h-3" />
              涨幅{filters.minChange}%~{filters.maxChange}%
            </Badge>
            <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
              <BarChart3 className="w-3 h-3" />
              市值&lt;{filters.maxMarketCap}亿
            </Badge>
            <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
              <AlertCircle className="w-3 h-3" />
              排除ST/创业板/科创板/北交
            </Badge>
            {(filters.enablePulse || filters.enableVolumeSurge || filters.enableProgressiveVol) && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-amber-500/5 border-amber-500/20 text-amber-700 dark:text-amber-300">
                <Zap className="w-3 h-3" />
                {filters.enablePulse && `脉冲≥${filters.pulseThreshold}`}
                {filters.enablePulse && (filters.enableVolumeSurge || filters.enableProgressiveVol) && " OR "}
                {filters.enableVolumeSurge && `放量拉升≥${filters.volumeSurgeThreshold}`}
                {filters.enableVolumeSurge && filters.enableProgressiveVol && " OR "}
                {filters.enableProgressiveVol && `递增≥${filters.progressiveVolThreshold}`}
                {" | "}{filters.pulseTimeStart}~{filters.pulseTimeEnd}
              </Badge>
            )}
            {filters.minTurnover > 0 && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-teal-500/5 border-teal-500/20 text-teal-700 dark:text-teal-300">
                换手{filters.minTurnover}~{filters.maxTurnover}%
              </Badge>
            )}
            {filters.minVolumeRatio > 0 && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-teal-500/5 border-teal-500/20 text-teal-700 dark:text-teal-300">
                量比≥{filters.minVolumeRatio}
              </Badge>
            )}
            {filters.mainNetInflowRequired && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-red-500/5 border-red-500/20 text-red-700 dark:text-red-300">
                主力净流入
              </Badge>
            )}
            {filters.enableMATrend && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                <Cpu className="w-3 h-3" />
                {filters.maTrendType === "above_ma5" ? "站上MA5" : filters.maTrendType === "above_ma10" ? "站上MA10" : filters.maTrendType === "above_ma20" ? "站上MA20" : "多头排列"}
              </Badge>
            )}
            {filters.evaluationFilter.length > 0 && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-orange-500/5 border-orange-500/20 text-orange-700 dark:text-orange-300">
                评估: {filters.evaluationFilter.join("/")}
              </Badge>
            )}
            {filters.minCompositeScore > 0 && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-rose-500/5 border-rose-500/20 text-rose-700 dark:text-rose-300">
                <Target className="w-3 h-3" />
                综合≥{filters.minCompositeScore}
              </Badge>
            )}
            {filters.maxCirculatingMarketCap > 0 && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-teal-500/5 border-teal-500/20 text-teal-700 dark:text-teal-300">
                流通市值≤{filters.maxCirculatingMarketCap}亿
              </Badge>
            )}
            {filters.maxPB > 0 && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-teal-500/5 border-teal-500/20 text-teal-700 dark:text-teal-300">
                PB {filters.minPB>0?`${filters.minPB}~`:"≤"}{filters.maxPB}
              </Badge>
            )}
            {filters.minBuySellRatio > 0 && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-red-500/5 border-red-500/20 text-red-700 dark:text-red-300">
                外/内盘≥{filters.minBuySellRatio}
              </Badge>
            )}
            {filters.minPricePosition > 0 && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                日内分位≥{filters.minPricePosition}%
              </Badge>
            )}
            {filters.minGapUpRate > 0 && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-amber-500/5 border-amber-500/20 text-amber-700 dark:text-amber-300">
                跳空≥{filters.minGapUpRate}%
              </Badge>
            )}
            {filters.minConsecutiveUpDays > 0 && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-purple-500/5 border-purple-500/20 text-purple-700 dark:text-purple-300">
                连涨≥{filters.minConsecutiveUpDays}天
              </Badge>
            )}
            {filters.minLimitUpStrength > 0 && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-red-500/5 border-red-500/20 text-red-700 dark:text-red-300">
                封板≥{filters.minLimitUpStrength}
              </Badge>
            )}
            {filters.minLargeOrderRatio > 0 && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-teal-500/5 border-teal-500/20 text-teal-700 dark:text-teal-300">
                大单占比≥{filters.minLargeOrderRatio}%
              </Badge>
            )}
            {filters.openingStrengthFilter && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-orange-500/5 border-orange-500/20 text-orange-700 dark:text-orange-300">
                {filters.openingStrengthFilter === "strong_open" ? "强开盘" : "弱开盘"}
              </Badge>
            )}
            {filters.maxVwapDeviation > 0 && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-yellow-500/5 border-yellow-500/20 text-yellow-700 dark:text-yellow-300">
                偏离≤{filters.maxVwapDeviation}%
              </Badge>
            )}
            {filters.minVwapDeviation > 0 && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-yellow-500/5 border-yellow-500/20 text-yellow-700 dark:text-yellow-300">
                偏离≥{filters.minVwapDeviation}%
              </Badge>
            )}
            {filters.enableLateSessionFilter && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-violet-500/5 border-violet-500/20 text-violet-700 dark:text-violet-300">
                {filters.lateSessionType === "late_rally" ? "尾盘拉升" : "尾盘跳水"}
              </Badge>
            )}
          </div>

          {/* Watchlist/Favorites Section */}
          {watchlist.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Star className="w-3 h-3 text-yellow-500" />
                自选
              </span>
              {watchlist.map((item) => (
                <button
                  key={item.symbol}
                  onClick={() => onSelectStock?.(item.symbol)}
                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md border border-yellow-500/20 bg-yellow-500/5 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-500/10 transition-colors"
                >
                  <Star className="w-2.5 h-2.5 fill-yellow-500 text-yellow-500" />
                  {item.name}
                  {item.changePercent !== undefined && (
                    <span className={item.changePercent >= 0 ? "text-red-500" : "text-green-500"}>
                      {item.changePercent >= 0 ? "+" : ""}{item.changePercent.toFixed(2)}%
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Expand/Collapse Filter Panel */}
          <button
            onClick={() => setFiltersExpanded(!filtersExpanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <SlidersHorizontal className="w-3 h-3" />
            {filtersExpanded ? "收起筛选条件" : "编辑筛选条件"}
            {filtersExpanded ? (
              <ChevronUpIcon className="w-3 h-3" />
            ) : (
              <ChevronDownIcon className="w-3 h-3" />
            )}
            {filtersChanged && !filtersExpanded && (
              <span className="ml-1 w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
            )}
          </button>

          {/* Editable Filter Panel */}
          {filtersExpanded && (
            <div className="mt-3 p-4 rounded-lg border border-border/50 bg-muted/30 space-y-4">
              {/* Row 1: Sector */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">板块关键词</Label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 max-w-xs" ref={sectorDropdownRef}>
                    <div className="relative">
                      <Input
                        value={sectorInput}
                        onChange={(e) => {
                          setSectorInput(e.target.value);
                          setShowSectorDropdown(true);
                        }}
                        onFocus={() => setShowSectorDropdown(true)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSectorInputConfirm();
                        }}
                        placeholder="输入板块名称..."
                        className="h-8 text-xs pr-8"
                      />
                      {sectorInput && (
                        <button
                          onClick={() => {
                            setSectorInput("");
                            handleFilterChange("sector", "");
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    {/* Quick select dropdown */}
                    {showSectorDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-popover border border-border rounded-md shadow-lg p-2 max-h-48 overflow-y-auto">
                        <div className="text-xs text-muted-foreground mb-1.5 px-1">热门板块</div>
                        <div className="flex flex-wrap gap-1">
                          {POPULAR_SECTORS.filter(s =>
                            !sectorInput || s.label.includes(sectorInput)
                          ).map((s) => (
                            <button
                              key={s.label}
                              onClick={() => handleSectorSelect(s.label)}
                              className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                                filters.sector === s.label
                                  ? "bg-primary/10 border-primary/30 text-primary"
                                  : "bg-background border-border hover:bg-muted"
                              }`}
                            >
                              {s.emoji} {s.label}
                            </button>
                          ))}
                          {sectorInput && !POPULAR_SECTORS.some(s => s.label === sectorInput) && (
                            <button
                              onClick={() => handleSectorSelect(sectorInput.trim())}
                              className="text-xs px-2 py-1 rounded-md border border-dashed border-primary/30 text-primary hover:bg-primary/10"
                            >
                              🔍 搜索 &quot;{sectorInput}&quot;
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Row 2: Change % range */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    涨幅范围 ({filters.minChange}% ~ {filters.maxChange}%)
                  </Label>
                  <div className="flex items-center gap-3">
                    <Slider
                      min={-5}
                      max={10}
                      step={0.5}
                      value={[filters.minChange, filters.maxChange]}
                      onValueChange={([min, max]) => {
                        handleFilterChange("minChange", min);
                        handleFilterChange("maxChange", max);
                      }}
                      className="flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={filters.minChange}
                      onChange={(e) => handleFilterChange("minChange", parseFloat(e.target.value) || 0)}
                      className="h-7 text-xs w-20"
                      step={0.5}
                    />
                    <span className="text-xs text-muted-foreground">~</span>
                    <Input
                      type="number"
                      value={filters.maxChange}
                      onChange={(e) => handleFilterChange("maxChange", parseFloat(e.target.value) || 0)}
                      className="h-7 text-xs w-20"
                      step={0.5}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>

                {/* Market Cap */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    最大市值 ({filters.maxMarketCap}亿)
                  </Label>
                  <div className="flex items-center gap-3">
                    <Slider
                      min={10}
                      max={2000}
                      step={10}
                      value={[filters.maxMarketCap]}
                      onValueChange={([v]) => handleFilterChange("maxMarketCap", v)}
                      className="flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={filters.maxMarketCap}
                      onChange={(e) => handleFilterChange("maxMarketCap", parseFloat(e.target.value) || 200)}
                      className="h-7 text-xs w-20"
                      step={10}
                    />
                    <span className="text-xs text-muted-foreground">亿元</span>
                  </div>
                </div>
              </div>

              {/* Row 3: Pulse, Volume surge & Progressive volume detection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <Zap className="w-3 h-3" />
                      脉冲拉升检测
                    </Label>
                    <Switch
                      checked={filters.enablePulse}
                      onCheckedChange={(v) => handleFilterChange("enablePulse", v)}
                    />
                  </div>
                  {filters.enablePulse && (
                    <>
                      <div className="flex items-center gap-3">
                        <Slider
                          min={0}
                          max={100}
                          step={5}
                          value={[filters.pulseThreshold]}
                          onValueChange={([v]) => handleFilterChange("pulseThreshold", v)}
                          className="flex-1"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={filters.pulseThreshold}
                          onChange={(e) => handleFilterChange("pulseThreshold", parseInt(e.target.value) || 10)}
                          className="h-7 text-xs w-20"
                          step={5}
                        />
                        <span className="text-xs text-muted-foreground">
                          最低脉冲评分 (0-100)
                        </span>
                      </div>
                    </>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      放量拉升检测
                    </Label>
                    <Switch
                      checked={filters.enableVolumeSurge}
                      onCheckedChange={(v) => handleFilterChange("enableVolumeSurge", v)}
                    />
                  </div>
                  {filters.enableVolumeSurge && (
                    <>
                      <div className="flex items-center gap-3">
                        <Slider
                          min={0}
                          max={100}
                          step={5}
                          value={[filters.volumeSurgeThreshold]}
                          onValueChange={([v]) => handleFilterChange("volumeSurgeThreshold", v)}
                          className="flex-1"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={filters.volumeSurgeThreshold}
                          onChange={(e) => handleFilterChange("volumeSurgeThreshold", parseInt(e.target.value) || 10)}
                          className="h-7 text-xs w-20"
                          step={5}
                        />
                        <span className="text-xs text-muted-foreground">
                          最低放量拉升评分 (0-100)
                        </span>
                      </div>
                    </>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <Activity className="w-3 h-3" />
                      递增放量检测
                    </Label>
                    <Switch
                      checked={filters.enableProgressiveVol}
                      onCheckedChange={(v) => handleFilterChange("enableProgressiveVol", v)}
                    />
                  </div>
                  {filters.enableProgressiveVol && (
                    <>
                      <div className="flex items-center gap-3">
                        <Slider
                          min={0}
                          max={100}
                          step={5}
                          value={[filters.progressiveVolThreshold]}
                          onValueChange={([v]) => handleFilterChange("progressiveVolThreshold", v)}
                          className="flex-1"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={filters.progressiveVolThreshold}
                          onChange={(e) => handleFilterChange("progressiveVolThreshold", parseInt(e.target.value) || 10)}
                          className="h-7 text-xs w-20"
                          step={5}
                        />
                        <span className="text-xs text-muted-foreground">
                          最低递增评分 (0-100)
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Shared time range for all detections */}
                {(filters.enablePulse || filters.enableVolumeSurge || filters.enableProgressiveVol) && (
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">检测时段</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={filters.pulseTimeStart}
                        onChange={(e) => handleFilterChange("pulseTimeStart", e.target.value)}
                        className="h-7 text-xs w-24"
                        min="09:30"
                        max="15:00"
                        step="300"
                      />
                      <span className="text-xs text-muted-foreground">~</span>
                      <Input
                        type="time"
                        value={filters.pulseTimeEnd}
                        onChange={(e) => handleFilterChange("pulseTimeEnd", e.target.value)}
                        className="h-7 text-xs w-24"
                        min="09:30"
                        max="15:00"
                        step="300"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button
                        onClick={() => {
                          handleFilterChange("pulseTimeStart", "09:30");
                          handleFilterChange("pulseTimeEnd", "10:30");
                        }}
                        className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                          filters.pulseTimeStart === "09:30" && filters.pulseTimeEnd === "10:30"
                            ? "bg-primary/10 border-primary/30 text-primary"
                            : "bg-background border-border hover:bg-muted"
                        }`}
                      >
                        开盘1h
                      </button>
                      <button
                        onClick={() => {
                          handleFilterChange("pulseTimeStart", "09:30");
                          handleFilterChange("pulseTimeEnd", "10:00");
                        }}
                        className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                          filters.pulseTimeStart === "09:30" && filters.pulseTimeEnd === "10:00"
                            ? "bg-primary/10 border-primary/30 text-primary"
                            : "bg-background border-border hover:bg-muted"
                        }`}
                      >
                        开盘30m
                      </button>
                      <button
                        onClick={() => {
                          handleFilterChange("pulseTimeStart", "09:30");
                          handleFilterChange("pulseTimeEnd", "11:30");
                        }}
                        className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                          filters.pulseTimeStart === "09:30" && filters.pulseTimeEnd === "11:30"
                            ? "bg-primary/10 border-primary/30 text-primary"
                            : "bg-background border-border hover:bg-muted"
                        }`}
                      >
                        早盘
                      </button>
                      <button
                        onClick={() => {
                          handleFilterChange("pulseTimeStart", "13:00");
                          handleFilterChange("pulseTimeEnd", "14:00");
                        }}
                        className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                          filters.pulseTimeStart === "13:00" && filters.pulseTimeEnd === "14:00"
                            ? "bg-primary/10 border-primary/30 text-primary"
                            : "bg-background border-border hover:bg-muted"
                        }`}
                      >
                        午盘1h
                      </button>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      脉冲/放量拉升共享此时段，关系为 <span className="text-amber-500 font-medium">OR</span>（满足其一即可）
                    </div>
                  </div>
                )}
              </div>

              {/* Composite Score filter */}
              <div className="space-y-2">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Target className="w-3 h-3" />
                    最低综合评分
                  </Label>
                  <div className="flex items-center gap-3">
                    <Slider
                      min={0}
                      max={100}
                      step={5}
                      value={[filters.minCompositeScore]}
                      onValueChange={([v]) => handleFilterChange("minCompositeScore", v)}
                      className="flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={filters.minCompositeScore}
                      onChange={(e) => handleFilterChange("minCompositeScore", parseInt(e.target.value) || 0)}
                      className="h-7 text-xs w-20"
                      step={5}
                    />
                    <span className="text-xs text-muted-foreground">
                      最低综合评分 (0-100)
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <button onClick={() => handleFilterChange("minCompositeScore", 0)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minCompositeScore === 0 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>不限</button>
                    <button onClick={() => handleFilterChange("minCompositeScore", 30)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minCompositeScore === 30 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>≥30</button>
                    <button onClick={() => handleFilterChange("minCompositeScore", 50)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minCompositeScore === 50 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>≥50</button>
                    <button onClick={() => handleFilterChange("minCompositeScore", 65)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minCompositeScore === 65 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>≥65</button>
                  </div>
                </div>
              </div>

              {/* ── Row 4: Enhanced Screening Conditions ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-xs font-medium text-muted-foreground">增强筛选条件</span>
                  <span className="text-[10px] text-muted-foreground/60">（条件越多，选股越可靠）</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Turnover range */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      换手率 ({filters.minTurnover}% ~ {filters.maxTurnover}%)
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={filters.minTurnover}
                        onChange={(e) => handleFilterChange("minTurnover", parseFloat(e.target.value) || 0)}
                        className="h-7 text-xs w-16"
                        step={0.5}
                        min={0}
                      />
                      <span className="text-xs text-muted-foreground">~</span>
                      <Input
                        type="number"
                        value={filters.maxTurnover}
                        onChange={(e) => handleFilterChange("maxTurnover", parseFloat(e.target.value) || 100)}
                        className="h-7 text-xs w-16"
                        step={0.5}
                        min={0}
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button onClick={() => { handleFilterChange("minTurnover", 0); handleFilterChange("maxTurnover", 100); }} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minTurnover === 0 && filters.maxTurnover === 100 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>不限</button>
                      <button onClick={() => { handleFilterChange("minTurnover", 1); handleFilterChange("maxTurnover", 100); }} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minTurnover === 1 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>≥1%</button>
                      <button onClick={() => { handleFilterChange("minTurnover", 2); handleFilterChange("maxTurnover", 15); }} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minTurnover === 2 && filters.maxTurnover === 15 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>适中2-15%</button>
                      <button onClick={() => { handleFilterChange("minTurnover", 3); handleFilterChange("maxTurnover", 8); }} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minTurnover === 3 && filters.maxTurnover === 8 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>最优3-8%</button>
                    </div>
                  </div>

                  {/* PE range */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      市盈率PE ({filters.minPE} ~ {filters.maxPE})
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={filters.minPE}
                        onChange={(e) => handleFilterChange("minPE", parseFloat(e.target.value) || 0)}
                        className="h-7 text-xs w-16"
                        step={5}
                        min={0}
                      />
                      <span className="text-xs text-muted-foreground">~</span>
                      <Input
                        type="number"
                        value={filters.maxPE}
                        onChange={(e) => handleFilterChange("maxPE", parseFloat(e.target.value) || 500)}
                        className="h-7 text-xs w-16"
                        step={5}
                        min={0}
                      />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button onClick={() => { handleFilterChange("minPE", 0); handleFilterChange("maxPE", 500); }} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minPE === 0 && filters.maxPE === 500 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>不限</button>
                      <button onClick={() => { handleFilterChange("minPE", 0); handleFilterChange("maxPE", 30); }} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.maxPE === 30 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>≤30</button>
                      <button onClick={() => { handleFilterChange("minPE", 0); handleFilterChange("maxPE", 60); }} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.maxPE === 60 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>≤60</button>
                      <button onClick={() => { handleFilterChange("minPE", 10); handleFilterChange("maxPE", 40); }} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minPE === 10 && filters.maxPE === 40 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>10-40</button>
                    </div>
                  </div>

                  {/* Volume ratio & Main net inflow */}
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">
                        量比下限 ({filters.minVolumeRatio})
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={filters.minVolumeRatio}
                          onChange={(e) => handleFilterChange("minVolumeRatio", parseFloat(e.target.value) || 0)}
                          className="h-7 text-xs w-16"
                          step={0.5}
                          min={0}
                        />
                        <div className="flex flex-wrap gap-1">
                          <button onClick={() => handleFilterChange("minVolumeRatio", 0)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minVolumeRatio === 0 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>不限</button>
                          <button onClick={() => handleFilterChange("minVolumeRatio", 1)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minVolumeRatio === 1 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>≥1</button>
                          <button onClick={() => handleFilterChange("minVolumeRatio", 1.5)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minVolumeRatio === 1.5 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>≥1.5</button>
                          <button onClick={() => handleFilterChange("minVolumeRatio", 2)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minVolumeRatio === 2 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>≥2</button>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <Shield className="w-3 h-3" />
                        要求主力净流入
                      </Label>
                      <Switch
                        checked={filters.mainNetInflowRequired}
                        onCheckedChange={(v) => handleFilterChange("mainNetInflowRequired", v)}
                      />
                    </div>
                  </div>
                </div>

                {/* Amplitude & MA Trend */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Amplitude range */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      振幅范围 ({filters.minAmplitude}% ~ {filters.maxAmplitude}%)
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={filters.minAmplitude}
                        onChange={(e) => handleFilterChange("minAmplitude", parseFloat(e.target.value) || 0)}
                        className="h-7 text-xs w-16"
                        step={0.5}
                        min={0}
                      />
                      <span className="text-xs text-muted-foreground">~</span>
                      <Input
                        type="number"
                        value={filters.maxAmplitude}
                        onChange={(e) => handleFilterChange("maxAmplitude", parseFloat(e.target.value) || 20)}
                        className="h-7 text-xs w-16"
                        step={0.5}
                        min={0}
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button onClick={() => { handleFilterChange("minAmplitude", 0); handleFilterChange("maxAmplitude", 20); }} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minAmplitude === 0 && filters.maxAmplitude === 20 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>不限</button>
                      <button onClick={() => { handleFilterChange("minAmplitude", 2); handleFilterChange("maxAmplitude", 20); }} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minAmplitude === 2 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>≥2%</button>
                      <button onClick={() => { handleFilterChange("minAmplitude", 3); handleFilterChange("maxAmplitude", 8); }} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minAmplitude === 3 && filters.maxAmplitude === 8 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>适中3-8%</button>
                    </div>
                  </div>

                  {/* MA Trend */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <Cpu className="w-3 h-3" />
                        均线趋势检测
                      </Label>
                      <Switch
                        checked={filters.enableMATrend}
                        onCheckedChange={(v) => handleFilterChange("enableMATrend", v)}
                      />
                    </div>
                    {filters.enableMATrend && (
                      <div className="flex flex-wrap gap-1">
                        {[
                          { value: "above_ma5", label: "站上MA5" },
                          { value: "above_ma10", label: "站上MA10" },
                          { value: "above_ma20", label: "站上MA20" },
                          { value: "bullish_alignment", label: "多头排列" },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => handleFilterChange("maTrendType", opt.value)}
                            className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                              filters.maTrendType === opt.value
                                ? "bg-primary/10 border-primary/30 text-primary"
                                : "bg-background border-border hover:bg-muted"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {filters.enableMATrend && (
                      <div className="text-[10px] text-amber-500 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        启用均线检测会增加请求耗时
                      </div>
                    )}
                  </div>

                  {/* Evaluation label filter */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">评估标签筛选</Label>
                    <div className="flex flex-wrap gap-1">
                      {[
                        { label: "强势续涨", icon: "🔥" },
                        { label: "温和看多", icon: "📈" },
                        { label: "震荡整理", icon: "↔️" },
                        { label: "弱势回调", icon: "📉" },
                      ].map((opt) => {
                        const isSelected = filters.evaluationFilter.includes(opt.label);
                        return (
                          <button
                            key={opt.label}
                            onClick={() => {
                              const newFilter = isSelected
                                ? filters.evaluationFilter.filter((l: string) => l !== opt.label)
                                : [...filters.evaluationFilter, opt.label];
                              handleFilterChange("evaluationFilter", newFilter);
                            }}
                            className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                              isSelected
                                ? "bg-primary/10 border-primary/30 text-primary"
                                : "bg-background border-border hover:bg-muted"
                            }`}
                          >
                            {opt.icon} {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    {filters.evaluationFilter.length > 0 && (
                      <button
                        onClick={() => handleFilterChange("evaluationFilter", [])}
                        className="text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        清除筛选
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Row 5: New v4.0 Screening Conditions ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-xs font-medium text-muted-foreground">高级筛选条件</span>
                  <span className="text-[10px] text-muted-foreground/60">（v4.0新增，精准选股）</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Circulating Market Cap */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      最大流通市值 ({filters.maxCirculatingMarketCap > 0 ? `${filters.maxCirculatingMarketCap}亿` : "不限"})
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={filters.maxCirculatingMarketCap || ""}
                        onChange={(e) => handleFilterChange("maxCirculatingMarketCap", parseFloat(e.target.value) || 0)}
                        className="h-7 text-xs w-20"
                        step={20}
                        min={0}
                        placeholder="不限"
                      />
                      <span className="text-xs text-muted-foreground">亿</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button onClick={() => handleFilterChange("maxCirculatingMarketCap", 0)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.maxCirculatingMarketCap === 0 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>不限</button>
                      <button onClick={() => handleFilterChange("maxCirculatingMarketCap", 50)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.maxCirculatingMarketCap === 50 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>≤50亿</button>
                      <button onClick={() => handleFilterChange("maxCirculatingMarketCap", 100)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.maxCirculatingMarketCap === 100 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>≤100亿</button>
                      <button onClick={() => handleFilterChange("maxCirculatingMarketCap", 200)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.maxCirculatingMarketCap === 200 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>≤200亿</button>
                    </div>
                  </div>

                  {/* PB Range */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      市净率PB {filters.maxPB > 0 ? `(${filters.minPB>0?filters.minPB:0} ~ ${filters.maxPB})` : "(不限)"}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={filters.minPB || ""}
                        onChange={(e) => handleFilterChange("minPB", parseFloat(e.target.value) || 0)}
                        className="h-7 text-xs w-16"
                        step={0.5}
                        min={0}
                        placeholder="0"
                      />
                      <span className="text-xs text-muted-foreground">~</span>
                      <Input
                        type="number"
                        value={filters.maxPB || ""}
                        onChange={(e) => handleFilterChange("maxPB", parseFloat(e.target.value) || 0)}
                        className="h-7 text-xs w-16"
                        step={0.5}
                        min={0}
                        placeholder="不限"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button onClick={() => { handleFilterChange("minPB", 0); handleFilterChange("maxPB", 0); }} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.maxPB === 0 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>不限</button>
                      <button onClick={() => { handleFilterChange("minPB", 0); handleFilterChange("maxPB", 3); }} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.maxPB === 3 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>≤3</button>
                      <button onClick={() => { handleFilterChange("minPB", 0); handleFilterChange("maxPB", 5); }} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.maxPB === 5 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>≤5</button>
                      <button onClick={() => { handleFilterChange("minPB", 1); handleFilterChange("maxPB", 5); }} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minPB === 1 && filters.maxPB === 5 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>1~5</button>
                    </div>
                  </div>

                  {/* Buy/Sell Ratio + Price Position + Gap Up */}
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">
                        外盘/内盘比率 ≥ {filters.minBuySellRatio}
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={filters.minBuySellRatio || ""}
                          onChange={(e) => handleFilterChange("minBuySellRatio", parseFloat(e.target.value) || 0)}
                          className="h-7 text-xs w-16"
                          step={0.1}
                          min={0}
                          placeholder="0"
                        />
                        <span className="text-[10px] text-muted-foreground">外盘&gt;内盘=买方强</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <button onClick={() => handleFilterChange("minBuySellRatio", 0)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minBuySellRatio === 0 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>不限</button>
                        <button onClick={() => handleFilterChange("minBuySellRatio", 1)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minBuySellRatio === 1 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>≥1</button>
                        <button onClick={() => handleFilterChange("minBuySellRatio", 1.5)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minBuySellRatio === 1.5 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>≥1.5</button>
                        <button onClick={() => handleFilterChange("minBuySellRatio", 2)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minBuySellRatio === 2 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>≥2</button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">
                        日内价格分位 ≥ {filters.minPricePosition}%
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={filters.minPricePosition || ""}
                          onChange={(e) => handleFilterChange("minPricePosition", parseFloat(e.target.value) || 0)}
                          className="h-7 text-xs w-16"
                          step={10}
                          min={0}
                          max={100}
                          placeholder="0"
                        />
                        <span className="text-[10px] text-muted-foreground">越接近100越强势</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <button onClick={() => handleFilterChange("minPricePosition", 0)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minPricePosition === 0 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>不限</button>
                        <button onClick={() => handleFilterChange("minPricePosition", 60)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minPricePosition === 60 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>≥60%</button>
                        <button onClick={() => handleFilterChange("minPricePosition", 80)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minPricePosition === 80 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>≥80%</button>
                        <button onClick={() => handleFilterChange("minPricePosition", 90)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minPricePosition === 90 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>≥90%</button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">
                        开盘跳空 ≥ {filters.minGapUpRate}%
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={filters.minGapUpRate || ""}
                          onChange={(e) => handleFilterChange("minGapUpRate", parseFloat(e.target.value) || 0)}
                          className="h-7 text-xs w-16"
                          step={0.5}
                          min={0}
                          placeholder="0"
                        />
                        <span className="text-[10px] text-muted-foreground">高开=做多意愿强</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <button onClick={() => handleFilterChange("minGapUpRate", 0)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minGapUpRate === 0 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>不限</button>
                        <button onClick={() => handleFilterChange("minGapUpRate", 0.5)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minGapUpRate === 0.5 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>≥0.5%</button>
                        <button onClick={() => handleFilterChange("minGapUpRate", 1)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minGapUpRate === 1 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>≥1%</button>
                        <button onClick={() => handleFilterChange("minGapUpRate", 2)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minGapUpRate === 2 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>≥2%</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Row 6: v5.0 进阶筛选条件 ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Cpu className="w-3.5 h-3.5 text-purple-500" />
                  <span className="text-xs font-medium text-muted-foreground">v5.0 进阶筛选</span>
                  <span className="text-[10px] text-muted-foreground/60">（新增6项因子，精细选股）</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Consecutive Up Days */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      连涨天数 ≥ {filters.minConsecutiveUpDays}天
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={filters.minConsecutiveUpDays || ""}
                        onChange={(e) => handleFilterChange("minConsecutiveUpDays", parseInt(e.target.value) || 0)}
                        className="h-7 text-xs w-16"
                        step={1}
                        min={0}
                        max={10}
                        placeholder="0"
                      />
                      <span className="text-[10px] text-muted-foreground">0=不限，连续收阳天数</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button onClick={() => handleFilterChange("minConsecutiveUpDays", 0)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minConsecutiveUpDays === 0 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>不限</button>
                      <button onClick={() => handleFilterChange("minConsecutiveUpDays", 2)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minConsecutiveUpDays === 2 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>≥2天</button>
                      <button onClick={() => handleFilterChange("minConsecutiveUpDays", 3)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minConsecutiveUpDays === 3 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>≥3天</button>
                      <button onClick={() => handleFilterChange("minConsecutiveUpDays", 5)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minConsecutiveUpDays === 5 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>≥5天</button>
                    </div>
                  </div>

                  {/* Limit-Up Strength */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      封板强度 ≥ {filters.minLimitUpStrength}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={filters.minLimitUpStrength || ""}
                        onChange={(e) => handleFilterChange("minLimitUpStrength", parseInt(e.target.value) || 0)}
                        className="h-7 text-xs w-16"
                        step={10}
                        min={0}
                        max={100}
                        placeholder="0"
                      />
                      <span className="text-[10px] text-muted-foreground">0=不限，仅涨幅≥8%有效</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button onClick={() => handleFilterChange("minLimitUpStrength", 0)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minLimitUpStrength === 0 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>不限</button>
                      <button onClick={() => handleFilterChange("minLimitUpStrength", 30)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minLimitUpStrength === 30 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>≥30</button>
                      <button onClick={() => handleFilterChange("minLimitUpStrength", 50)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minLimitUpStrength === 50 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>≥50</button>
                      <button onClick={() => handleFilterChange("minLimitUpStrength", 70)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minLimitUpStrength === 70 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>≥70</button>
                    </div>
                  </div>

                  {/* Large Order Ratio */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      大单占比 ≥ {filters.minLargeOrderRatio}%
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={filters.minLargeOrderRatio || ""}
                        onChange={(e) => handleFilterChange("minLargeOrderRatio", parseFloat(e.target.value) || 0)}
                        className="h-7 text-xs w-16"
                        step={0.5}
                        min={0}
                        max={100}
                        placeholder="0"
                      />
                      <span className="text-[10px] text-muted-foreground">|主力净流入|/成交额</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button onClick={() => handleFilterChange("minLargeOrderRatio", 0)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minLargeOrderRatio === 0 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>不限</button>
                      <button onClick={() => handleFilterChange("minLargeOrderRatio", 2)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minLargeOrderRatio === 2 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>≥2%</button>
                      <button onClick={() => handleFilterChange("minLargeOrderRatio", 5)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minLargeOrderRatio === 5 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>≥5%</button>
                      <button onClick={() => handleFilterChange("minLargeOrderRatio", 8)} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minLargeOrderRatio === 8 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>≥8%</button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Opening Strength */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">开盘强弱</Label>
                    <div className="flex flex-wrap gap-1">
                      <button onClick={() => handleFilterChange("openingStrengthFilter", "")} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.openingStrengthFilter === "" ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>不限</button>
                      <button onClick={() => handleFilterChange("openingStrengthFilter", "strong_open")} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.openingStrengthFilter === "strong_open" ? "bg-red-500/10 border-red-500/30 text-red-600" : "bg-background border-border hover:bg-muted"}`}>强开盘</button>
                      <button onClick={() => handleFilterChange("openingStrengthFilter", "weak_open")} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.openingStrengthFilter === "weak_open" ? "bg-green-500/10 border-green-500/30 text-green-600" : "bg-background border-border hover:bg-muted"}`}>弱开盘</button>
                    </div>
                    <div className="text-[10px] text-muted-foreground">前15min均价vs昨收</div>
                  </div>

                  {/* VWAP Deviation */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      均价偏离度 {filters.maxVwapDeviation > 0 ? `≤${filters.maxVwapDeviation}%` : ""}{filters.minVwapDeviation > 0 ? ` ≥${filters.minVwapDeviation}%` : ""}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={filters.minVwapDeviation || ""}
                        onChange={(e) => handleFilterChange("minVwapDeviation", parseFloat(e.target.value) || 0)}
                        className="h-7 text-xs w-14"
                        step={0.5}
                        min={0}
                        placeholder="最小"
                      />
                      <span className="text-xs text-muted-foreground">~</span>
                      <Input
                        type="number"
                        value={filters.maxVwapDeviation || ""}
                        onChange={(e) => handleFilterChange("maxVwapDeviation", parseFloat(e.target.value) || 0)}
                        className="h-7 text-xs w-14"
                        step={0.5}
                        min={0}
                        placeholder="最大"
                      />
                      <span className="text-[10px] text-muted-foreground">%</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button onClick={() => { handleFilterChange("minVwapDeviation", 0); handleFilterChange("maxVwapDeviation", 0); }} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minVwapDeviation === 0 && filters.maxVwapDeviation === 0 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>不限</button>
                      <button onClick={() => { handleFilterChange("minVwapDeviation", 0); handleFilterChange("maxVwapDeviation", 2); }} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.maxVwapDeviation === 2 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>≤2%</button>
                      <button onClick={() => { handleFilterChange("minVwapDeviation", 1); handleFilterChange("maxVwapDeviation", 5); }} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minVwapDeviation === 1 && filters.maxVwapDeviation === 5 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>1-5%</button>
                      <button onClick={() => { handleFilterChange("minVwapDeviation", 2); handleFilterChange("maxVwapDeviation", 0); }} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.minVwapDeviation === 2 && filters.maxVwapDeviation === 0 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}>≥2%</button>
                    </div>
                  </div>

                  {/* Late Session Activity */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        尾盘异动检测
                      </Label>
                      <Switch
                        checked={filters.enableLateSessionFilter}
                        onCheckedChange={(v) => handleFilterChange("enableLateSessionFilter", v)}
                      />
                    </div>
                    {filters.enableLateSessionFilter && (
                      <>
                        <div className="flex flex-wrap gap-1">
                          <button onClick={() => handleFilterChange("lateSessionType", "late_rally")} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.lateSessionType === "late_rally" ? "bg-red-500/10 border-red-500/30 text-red-600" : "bg-background border-border hover:bg-muted"}`}>尾盘拉升</button>
                          <button onClick={() => handleFilterChange("lateSessionType", "late_drop")} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filters.lateSessionType === "late_drop" ? "bg-green-500/10 border-green-500/30 text-green-600" : "bg-background border-border hover:bg-muted"}`}>尾盘跳水</button>
                        </div>
                        <div className="text-[10px] text-muted-foreground">14:30-15:00价格变动&gt;1%</div>
                      </>
                    )}
                  </div>
                </div>
              </div>

                {/* Quick presets & Custom presets */}
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">快捷预设</Label>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => {
                          setFilters(DEFAULT_FILTERS);
                          setSectorInput(DEFAULT_FILTERS.sector);
                        }}
                        className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                          !filtersChanged
                            ? "bg-primary/10 border-primary/30 text-primary"
                            : "bg-background border-border hover:bg-muted"
                        }`}
                      >
                        默认(脉冲+放量拉升)
                      </button>
                      <button
                        onClick={() => {
                          const f: ScreenerFilters = { sector: "通信", minChange: -5, maxChange: 10, maxMarketCap: 200, pulseThreshold: 30, enablePulse: true, pulseTimeStart: "09:30", pulseTimeEnd: "10:30", enableVolumeSurge: true, volumeSurgeThreshold: 30, enableProgressiveVol: true, progressiveVolThreshold: 10, minTurnover: 2, maxTurnover: 15, minPE: 0, maxPE: 60, minVolumeRatio: 1.5, mainNetInflowRequired: true, minAmplitude: 2, maxAmplitude: 20, enableMATrend: false, maTrendType: "above_ma5", evaluationFilter: [], minCompositeScore: 0, maxCirculatingMarketCap: 0, minPB: 0, maxPB: 0, minBuySellRatio: 0, minPricePosition: 0, minGapUpRate: 0, minConsecutiveUpDays: 0, minLimitUpStrength: 0, minLargeOrderRatio: 0, openingStrengthFilter: "", maxVwapDeviation: 0, minVwapDeviation: 0, enableLateSessionFilter: false, lateSessionType: "late_rally" };
                          setFilters(f);
                          setSectorInput("通信");
                        }}
                        className="text-xs px-2.5 py-1 rounded-md border bg-background border-border hover:bg-muted transition-colors"
                      >
                        🔥 激进策略
                      </button>
                      <button
                        onClick={() => {
                          const f: ScreenerFilters = { sector: "通信", minChange: 0, maxChange: 5, maxMarketCap: 500, pulseThreshold: 10, enablePulse: true, pulseTimeStart: "09:30", pulseTimeEnd: "10:30", enableVolumeSurge: true, volumeSurgeThreshold: 10, enableProgressiveVol: true, progressiveVolThreshold: 10, minTurnover: 2, maxTurnover: 8, minPE: 5, maxPE: 40, minVolumeRatio: 1, mainNetInflowRequired: true, minAmplitude: 1, maxAmplitude: 10, enableMATrend: true, maTrendType: "above_ma10", evaluationFilter: ["强势续涨", "温和看多"], minCompositeScore: 30, maxCirculatingMarketCap: 0, minPB: 0, maxPB: 0, minBuySellRatio: 0, minPricePosition: 0, minGapUpRate: 0, minConsecutiveUpDays: 2, minLimitUpStrength: 0, minLargeOrderRatio: 3, openingStrengthFilter: "strong_open", maxVwapDeviation: 0, minVwapDeviation: 0, enableLateSessionFilter: false, lateSessionType: "late_rally" };
                          setFilters(f);
                          setSectorInput("通信");
                        }}
                        className="text-xs px-2.5 py-1 rounded-md border bg-background border-border hover:bg-muted transition-colors"
                      >
                        🛡️ 稳健策略
                      </button>
                      <button
                        onClick={() => {
                          const f: ScreenerFilters = { sector: "通信", minChange: 0, maxChange: 10, maxMarketCap: 1000, pulseThreshold: 10, enablePulse: true, pulseTimeStart: "09:30", pulseTimeEnd: "10:30", enableVolumeSurge: true, volumeSurgeThreshold: 10, enableProgressiveVol: true, progressiveVolThreshold: 10, minTurnover: 1, maxTurnover: 100, minPE: 0, maxPE: 500, minVolumeRatio: 1, mainNetInflowRequired: false, minAmplitude: 0, maxAmplitude: 20, enableMATrend: true, maTrendType: "above_ma5", evaluationFilter: [], minCompositeScore: 0, maxCirculatingMarketCap: 0, minPB: 0, maxPB: 0, minBuySellRatio: 0, minPricePosition: 0, minGapUpRate: 0, minConsecutiveUpDays: 0, minLimitUpStrength: 0, minLargeOrderRatio: 0, openingStrengthFilter: "", maxVwapDeviation: 0, minVwapDeviation: 0, enableLateSessionFilter: false, lateSessionType: "late_rally" };
                          setFilters(f);
                          setSectorInput("通信");
                        }}
                        className="text-xs px-2.5 py-1 rounded-md border bg-background border-border hover:bg-muted transition-colors"
                      >
                        📊 均线策略
                      </button>
                      <button
                        onClick={() => {
                          const f: ScreenerFilters = { sector: "通信", minChange: -3, maxChange: 3, maxMarketCap: 500, pulseThreshold: 10, enablePulse: false, pulseTimeStart: "09:30", pulseTimeEnd: "10:30", enableVolumeSurge: true, volumeSurgeThreshold: 10, enableProgressiveVol: true, progressiveVolThreshold: 10, minTurnover: 0, maxTurnover: 8, minPE: 0, maxPE: 40, minVolumeRatio: 0.5, mainNetInflowRequired: true, minAmplitude: 0, maxAmplitude: 6, enableMATrend: true, maTrendType: "above_ma20", evaluationFilter: ["温和看多", "震荡整理"], minCompositeScore: 0, maxCirculatingMarketCap: 0, minPB: 0, maxPB: 0, minBuySellRatio: 0, minPricePosition: 0, minGapUpRate: 0, minConsecutiveUpDays: 0, minLimitUpStrength: 0, minLargeOrderRatio: 0, openingStrengthFilter: "", maxVwapDeviation: 3, minVwapDeviation: 0, enableLateSessionFilter: false, lateSessionType: "late_rally" };
                          setFilters(f);
                          setSectorInput("通信");
                        }}
                        className="text-xs px-2.5 py-1 rounded-md border bg-background border-border hover:bg-muted transition-colors"
                      >
                        🎯 低吸策略
                      </button>
                      <button
                        onClick={() => {
                          const f: ScreenerFilters = { sector: "半导体", minChange: -5, maxChange: 10, maxMarketCap: 500, pulseThreshold: 10, enablePulse: true, pulseTimeStart: "09:30", pulseTimeEnd: "10:30", enableVolumeSurge: true, volumeSurgeThreshold: 10, enableProgressiveVol: true, progressiveVolThreshold: 10, minTurnover: 0, maxTurnover: 100, minPE: 0, maxPE: 500, minVolumeRatio: 0, mainNetInflowRequired: false, minAmplitude: 0, maxAmplitude: 20, enableMATrend: false, maTrendType: "above_ma5", evaluationFilter: [], minCompositeScore: 0, maxCirculatingMarketCap: 0, minPB: 0, maxPB: 0, minBuySellRatio: 0, minPricePosition: 0, minGapUpRate: 0, minConsecutiveUpDays: 0, minLimitUpStrength: 0, minLargeOrderRatio: 0, openingStrengthFilter: "", maxVwapDeviation: 0, minVwapDeviation: 0, enableLateSessionFilter: false, lateSessionType: "late_rally" };
                          setFilters(f);
                          setSectorInput("半导体");
                        }}
                        className="text-xs px-2.5 py-1 rounded-md border bg-background border-border hover:bg-muted transition-colors"
                      >
                        💎 半导体宽幅
                      </button>
                      <button
                        onClick={() => {
                          const f: ScreenerFilters = { sector: "人工智能", minChange: -5, maxChange: 10, maxMarketCap: 1000, pulseThreshold: 10, enablePulse: true, pulseTimeStart: "09:30", pulseTimeEnd: "10:30", enableVolumeSurge: true, volumeSurgeThreshold: 10, enableProgressiveVol: true, progressiveVolThreshold: 10, minTurnover: 0, maxTurnover: 100, minPE: 0, maxPE: 500, minVolumeRatio: 0, mainNetInflowRequired: false, minAmplitude: 0, maxAmplitude: 20, enableMATrend: false, maTrendType: "above_ma5", evaluationFilter: [], minCompositeScore: 0, maxCirculatingMarketCap: 0, minPB: 0, maxPB: 0, minBuySellRatio: 0, minPricePosition: 0, minGapUpRate: 0, minConsecutiveUpDays: 0, minLimitUpStrength: 0, minLargeOrderRatio: 0, openingStrengthFilter: "", maxVwapDeviation: 0, minVwapDeviation: 0, enableLateSessionFilter: false, lateSessionType: "late_rally" };
                          setFilters(f);
                          setSectorInput("人工智能");
                        }}
                        className="text-xs px-2.5 py-1 rounded-md border bg-background border-border hover:bg-muted transition-colors"
                      >
                        🤖 AI大市值
                      </button>
                      <button
                        onClick={() => {
                          const f: ScreenerFilters = { sector: "通信", minChange: -5, maxChange: 10, maxMarketCap: 500, pulseThreshold: 10, enablePulse: true, pulseTimeStart: "09:30", pulseTimeEnd: "10:30", enableVolumeSurge: true, volumeSurgeThreshold: 10, enableProgressiveVol: true, progressiveVolThreshold: 10, minTurnover: 1, maxTurnover: 100, minPE: 0, maxPE: 500, minVolumeRatio: 1, mainNetInflowRequired: true, minAmplitude: 0, maxAmplitude: 20, enableMATrend: false, maTrendType: "above_ma5", evaluationFilter: [], minCompositeScore: 0, maxCirculatingMarketCap: 0, minPB: 0, maxPB: 0, minBuySellRatio: 1, minPricePosition: 60, minGapUpRate: 0, minConsecutiveUpDays: 2, minLimitUpStrength: 0, minLargeOrderRatio: 3, openingStrengthFilter: "strong_open", maxVwapDeviation: 0, minVwapDeviation: 0, enableLateSessionFilter: true, lateSessionType: "late_rally" };
                          setFilters(f);
                          setSectorInput("通信");
                        }}
                        className="text-xs px-2.5 py-1 rounded-md border bg-background border-border hover:bg-muted transition-colors"
                      >
                        🚀 v5.0强势策略
                      </button>
                    </div>
                  </div>

                  {/* Custom presets */}
                  {customPresets.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <Bookmark className="w-3 h-3" />
                        我的预设
                      </Label>
                      <div className="flex flex-wrap gap-1.5">
                        {customPresets.map((preset) => (
                          <div key={preset.id} className="group relative">
                            <button
                              onClick={() => handleApplyPreset(preset)}
                              className={`text-xs px-2.5 py-1 rounded-md border transition-colors pr-7 ${
                                JSON.stringify(filters) === JSON.stringify(preset.filters)
                                  ? "bg-primary/10 border-primary/30 text-primary"
                                  : "bg-amber-500/5 border-amber-500/20 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                              }`}
                            >
                              📌 {preset.name}
                            </button>
                            {deletingPresetId === preset.id ? (
                              <div className="absolute -top-0.5 -right-0.5 flex items-center gap-0.5">
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeletePreset(preset.id); }}
                                  className="w-4 h-4 flex items-center justify-center rounded-full bg-red-500 text-white"
                                >
                                  <Check className="w-2.5 h-2.5" />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setDeletingPresetId(null); }}
                                  className="w-4 h-4 flex items-center justify-center rounded-full bg-muted text-muted-foreground"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); setDeletingPresetId(preset.id); }}
                                className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full bg-muted/80 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/20 hover:text-red-500"
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Save current as preset */}
                  <div className="space-y-2">
                    {showSavePreset ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={presetNameInput}
                          onChange={(e) => setPresetNameInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSavePreset();
                            if (e.key === "Escape") setShowSavePreset(false);
                          }}
                          placeholder={`预设名称 (默认: ${filters.sector} ${filters.minChange}%~${filters.maxChange}%)`}
                          className="h-7 text-xs flex-1"
                          autoFocus
                        />
                        <Button
                          size="sm"
                          onClick={handleSavePreset}
                          className="h-7 text-xs gap-1"
                        >
                          <Check className="w-3 h-3" />
                          保存
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setShowSavePreset(false); setPresetNameInput(""); }}
                          className="h-7 text-xs"
                        >
                          取消
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowSavePreset(true)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <BookmarkPlus className="w-3 h-3" />
                        保存当前条件为预设
                      </button>
                    )}
                  </div>
                </div>

              <Separator />

              {/* Action buttons */}
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetFilters}
                  className="h-7 text-xs gap-1"
                >
                  重置条件
                </Button>
                <Button
                  size="sm"
                  onClick={handleApplyFilters}
                  disabled={loading}
                  className="h-7 text-xs gap-1"
                >
                  {loading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Search className="w-3 h-3" />
                  )}
                  开始选股
                </Button>
              </div>
            </div>
          )}

          {/* Stats */}
          {result && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>板块: <strong className="text-foreground">{result.sectorName}</strong></span>
                <span>板块总数: <strong className="text-foreground">{result.totalCount}</strong></span>
                <span>筛选结果: <strong className="text-emerald-500">{result.filteredCount}</strong>只</span>
                {result.filteredCount > 0 && (
                  <button
                    onClick={() => setStatsExpanded(!statsExpanded)}
                    className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors ml-auto"
                  >
                    <BarChart3 className="w-3 h-3" />
                    {statsExpanded ? "收起统计" : "展开统计"}
                    {statsExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                )}
              </div>

              {/* Collapsible Statistics Section */}
              {statsExpanded && result.filteredCount > 0 && (() => {
                const pulseStats = computeScreenerStats(result.stocks.map(s => s.pulseScore));
                const progVolStats = computeScreenerStats(result.stocks.map(s => s.progressiveVolScore));
                const evalCounts: Record<string, number> = {};
                const evalLabels = ["强势续涨", "温和看多", "震荡整理", "弱势回调", "拉高出货", "观望等待"];
                result.stocks.forEach(s => {
                  if (s.evaluation) {
                    evalCounts[s.evaluation] = (evalCounts[s.evaluation] || 0) + 1;
                  }
                });
                const maxPulseCount = Math.max(...pulseStats.distribution.map(d => d.count), 1);
                const maxProgVolCount = Math.max(...progVolStats.distribution.map(d => d.count), 1);

                return (
                  <div className="p-3 rounded-lg border border-border/50 bg-muted/20 space-y-3">
                    {/* Pulse Score Distribution */}
                    <div>
                      <div className="text-[10px] font-medium text-muted-foreground mb-1.5">脉冲评分分布 (均值:{pulseStats.avg} 中位数:{pulseStats.median})</div>
                      <div className="flex items-end gap-0.5 h-8">
                        {pulseStats.distribution.map((d, i) => (
                          <div key={d.range} className="flex-1 flex flex-col items-center gap-0.5">
                            <div
                              className="w-full rounded-t-sm transition-all"
                              style={{
                                height: `${Math.max((d.count / maxPulseCount) * 100, 2)}%`,
                                backgroundColor: i >= 7 ? "rgb(239 68 68 / 0.6)" : i >= 5 ? "rgb(249 115 22 / 0.5)" : i >= 3 ? "rgb(234 179 8 / 0.4)" : "rgb(156 163 175 / 0.3)",
                              }}
                              title={`${d.range}: ${d.count}只 (${d.percent}%)`}
                            />
                            <span className="text-[7px] text-muted-foreground leading-none">{d.range.split('-')[0]}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Progressive Volume Score Distribution */}
                    <div>
                      <div className="text-[10px] font-medium text-muted-foreground mb-1.5">递增放量评分分布 (均值:{progVolStats.avg} 中位数:{progVolStats.median})</div>
                      <div className="flex items-end gap-0.5 h-8">
                        {progVolStats.distribution.map((d, i) => (
                          <div key={d.range} className="flex-1 flex flex-col items-center gap-0.5">
                            <div
                              className="w-full rounded-t-sm transition-all"
                              style={{
                                height: `${Math.max((d.count / maxProgVolCount) * 100, 2)}%`,
                                backgroundColor: i >= 7 ? "rgb(168 85 247 / 0.6)" : i >= 5 ? "rgb(249 115 22 / 0.5)" : i >= 3 ? "rgb(234 179 8 / 0.4)" : "rgb(156 163 175 / 0.3)",
                              }}
                              title={`${d.range}: ${d.count}只 (${d.percent}%)`}
                            />
                            <span className="text-[7px] text-muted-foreground leading-none">{d.range.split('-')[0]}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Evaluation Distribution */}
                    <div>
                      <div className="text-[10px] font-medium text-muted-foreground mb-1.5">评估分布</div>
                      <div className="flex flex-wrap gap-1.5">
                        {evalLabels.map((label) => {
                          const count = evalCounts[label] || 0;
                          const style = getEvaluationStyle(label);
                          return (
                            <span key={label} className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}>
                              {style.icon} {label}
                              <strong className="font-mono">{count}</strong>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Smart Recommendation Summary */}
      {result && result.filteredCount > 0 && (() => {
        const top3 = sortedStocks.slice(0, 3);
        const avgComp = sortedStocks.reduce((s, st) => s + (st.compositeScore || 0), 0) / sortedStocks.length;
        const resonanceCount = sortedStocks.filter(s => s.resonanceTags && s.resonanceTags.length > 0).length;
        const inflowCount = sortedStocks.filter(s => s.capitalTrend === "strong_inflow" || s.capitalTrend === "moderate_inflow").length;
        const aboveVwapCount = sortedStocks.filter(s => s.vwapPosition === "above_vwap" || s.vwapPosition === "cross_up").length;
        return (
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4 text-rose-500" />
                <span className="text-sm font-semibold">智能推荐</span>
                <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-rose-500/5 border-rose-500/20 text-rose-700 dark:text-rose-300">
                  TOP {Math.min(3, top3.length)}
                </Badge>
              </div>
              {/* Top picks */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                {top3.map((stock, idx) => {
                  const compColor = getCompositeScoreColor(stock.compositeScore);
                  const compBg = getCompositeScoreBg(stock.compositeScore);
                  const isUp = stock.changePercent >= 0;
                  const changeColor = isUp ? "text-red-500" : "text-green-500";
                  return (
                    <button
                      key={stock.symbol}
                      onClick={() => onSelectStock?.(stock.symbol)}
                      className="p-2.5 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors text-left"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-base">{idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉"}</span>
                          <span className="text-sm font-bold">{stock.name}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">{stock.symbol}</span>
                        </div>
                        <Badge variant="outline" className={`text-[10px] py-0 px-1.5 font-mono ${compBg} ${compColor} border`}>
                          {stock.compositeScore}分
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className={`font-mono font-medium ${changeColor}`}>
                          {isUp ? "+" : ""}{stock.changePercent.toFixed(2)}%
                        </span>
                        {stock.resonanceTags && (
                          <span className="text-[10px] text-rose-500 font-medium">🎯{stock.resonanceTags}</span>
                        )}
                        {stock.vwapPosition && stock.vwapPosition !== "no_data" && (
                          <span className={`text-[10px] ${getVwapPositionLabel(stock.vwapPosition).color}`}>
                            📏{getVwapPositionLabel(stock.vwapPosition).text}
                          </span>
                        )}
                      </div>
                      {stock.evaluation && stock.evaluation !== "待评估" && (
                        <div className="mt-1">
                          <Badge variant="outline" className={`${getEvaluationStyle(stock.evaluation).bg} ${getEvaluationStyle(stock.evaluation).text} text-[10px] py-0 px-1`}>
                            {getEvaluationStyle(stock.evaluation).icon} {stock.evaluation}
                          </Badge>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              {/* Quick stats */}
              <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                <span>平均综合评分 <strong className="text-foreground">{avgComp.toFixed(0)}</strong></span>
                <span>共振标的 <strong className="text-rose-500">{resonanceCount}</strong>只</span>
                <span>资金流入 <strong className="text-red-500">{inflowCount}</strong>只</span>
                <span>均线上方 <strong className="text-emerald-500">{aboveVwapCount}</strong>只</span>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Results Table */}
      <Card className="border-border/50 shadow-sm flex-1 flex flex-col min-h-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            筛选结果
            {result && (
              <Badge variant="secondary" className="text-xs font-normal">
                {result.filteredCount}只
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 flex-1 min-h-0 overflow-auto">
          {loading && !result ? (
            // Loading skeleton
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-2">
                  <Skeleton className="w-16 h-4" />
                  <Skeleton className="w-20 h-4" />
                  <Skeleton className="w-14 h-4" />
                  <Skeleton className="w-14 h-4" />
                  <Skeleton className="w-16 h-4" />
                  <Skeleton className="w-20 h-4" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <AlertCircle className="w-8 h-8 mb-2 text-red-400" />
              <p className="text-sm">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchScreenerData(true)}
                className="mt-3"
              >
                重试
              </Button>
            </div>
          ) : sortedStocks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Search className="w-8 h-8 mb-2" />
              <p className="text-sm">暂无符合条件的股票</p>
              <p className="text-xs mt-1">请尝试调整筛选条件或稍后刷新</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[90px] text-xs font-medium">代码</TableHead>
                    <TableHead className="w-[80px] text-xs font-medium">名称</TableHead>
                    <TableHead
                      className="w-[75px] text-xs font-medium cursor-pointer select-none hover:text-foreground"
                      onClick={() => handleSort("compositeScore")}
                    >
                      <div className="flex items-center gap-0.5">
                        综合评分 <SortIcon field="compositeScore" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="w-[70px] text-xs font-medium cursor-pointer select-none hover:text-foreground"
                      onClick={() => handleSort("reliabilityScore")}
                    >
                      <div className="flex items-center gap-0.5">
                        可靠度 <SortIcon field="reliabilityScore" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="w-[70px] text-xs font-medium cursor-pointer select-none hover:text-foreground"
                      onClick={() => handleSort("pulseScore")}
                    >
                      <div className="flex items-center gap-0.5">
                        脉冲 <SortIcon field="pulseScore" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="w-[70px] text-xs font-medium cursor-pointer select-none hover:text-foreground"
                      onClick={() => handleSort("volumeSurgeScore")}
                    >
                      <div className="flex items-center gap-0.5">
                        放量拉升 <SortIcon field="volumeSurgeScore" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="w-[70px] text-xs font-medium cursor-pointer select-none hover:text-foreground"
                      onClick={() => handleSort("progressiveVolScore")}
                    >
                      <div className="flex items-center gap-0.5">
                        递增 <SortIcon field="progressiveVolScore" />
                      </div>
                    </TableHead>
                    <TableHead className="w-[65px] text-xs font-medium">最新价</TableHead>
                    <TableHead
                      className="w-[65px] text-xs font-medium cursor-pointer select-none hover:text-foreground"
                      onClick={() => handleSort("changePercent")}
                    >
                      <div className="flex items-center gap-0.5">
                        涨跌幅 <SortIcon field="changePercent" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="w-[55px] text-xs font-medium cursor-pointer select-none hover:text-foreground"
                      onClick={() => handleSort("turnover")}
                    >
                      <div className="flex items-center gap-0.5">
                        换手% <SortIcon field="turnover" />
                      </div>
                    </TableHead>
                    <TableHead className="w-[50px] text-xs font-medium">量比</TableHead>
                    <TableHead
                      className="w-[75px] text-xs font-medium cursor-pointer select-none hover:text-foreground"
                      onClick={() => handleSort("mainNetInflow")}
                    >
                      <div className="flex items-center gap-0.5">
                        主力净流 <SortIcon field="mainNetInflow" />
                      </div>
                    </TableHead>
                    <TableHead className="text-center text-xs">评估</TableHead>
                    <TableHead className="w-[60px] text-xs font-medium">PE</TableHead>
                    <TableHead className="w-[45px] text-xs font-medium">PB</TableHead>
                    <TableHead className="w-[45px] text-xs font-medium">外/内</TableHead>
                    <TableHead className="w-[45px] text-xs font-medium">分位</TableHead>
                    <TableHead className="w-[45px] text-xs font-medium">连涨</TableHead>
                    <TableHead className="w-[45px] text-xs font-medium">封板</TableHead>
                    <TableHead className="w-[45px] text-xs font-medium">大单%</TableHead>
                    <TableHead className="w-[50px] text-xs font-medium">开盘</TableHead>
                    <TableHead className="w-[45px] text-xs font-medium">偏离</TableHead>
                    <TableHead className="w-[50px] text-xs font-medium">尾盘</TableHead>
                    <TableHead className="text-xs font-medium min-w-[120px]">信号详情</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    // Apply client-side evaluation filter and composite score filter
                    const displayStocks = (filters.evaluationFilter.length > 0
                      ? sortedStocks.filter(s => filters.evaluationFilter.includes(s.evaluation))
                      : sortedStocks
                    ).filter(s => s.compositeScore >= filters.minCompositeScore);
                    return displayStocks;
                  })().map((stock, idx) => {
                    const isUp = stock.changePercent >= 0;
                    const changeColor = isUp ? "text-red-500" : "text-green-500";
                    const compColor = getCompositeScoreColor(stock.compositeScore);
                    const compBg = getCompositeScoreBg(stock.compositeScore);
                    const compLabel = getCompositeLabel(stock.compositeScore);
                    const pulseColor = getPulseScoreColor(stock.pulseScore);
                    const pulseBg = getPulseScoreBg(stock.pulseScore);
                    const pulseLabel = getPulseLabel(stock.pulseScore);
                    const volSurgeColor = getVolumeSurgeScoreColor(stock.volumeSurgeScore);
                    const volSurgeBg = getVolumeSurgeScoreBg(stock.volumeSurgeScore);
                    const volSurgeLabel = getVolumeSurgeLabel(stock.volumeSurgeScore);
                    const progVolColor = getProgressiveVolScoreColor(stock.progressiveVolScore);
                    const progVolBg = getProgressiveVolScoreBg(stock.progressiveVolScore);
                    const progVolLabel = getProgressiveVolLabel(stock.progressiveVolScore);
                    const mainFlowColor = stock.mainNetInflow >= 0 ? "text-red-500" : "text-green-500";
                    const relColor = getReliabilityScoreColor(stock.reliabilityScore);
                    const relBg = getReliabilityScoreBg(stock.reliabilityScore);
                    const relLabel = getReliabilityLabel(stock.reliabilityScore);
                    const inWatchlist = watchlist.some(w => w.symbol === stock.symbol);
                    const rankBadge = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : null;

                    return (
                      <TableRow
                        key={stock.symbol}
                        className={`cursor-pointer hover:bg-muted/50 transition-colors ${idx % 2 === 0 ? "bg-background" : "bg-muted/20"}`}
                        onClick={() => onSelectStock?.(stock.symbol)}
                      >
                        <TableCell className="text-xs font-mono py-2">
                          <div className="flex items-center gap-1">
                            {rankBadge && <span className="text-xs">{rankBadge}</span>}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (inWatchlist) {
                                  const updated = removeFromWatchlist(stock.symbol);
                                  setWatchlist(updated);
                                } else {
                                  const updated = addToWatchlist(stock.symbol, stock.name, "智能选股", stock.price, stock.changePercent);
                                  setWatchlist(updated);
                                }
                              }}
                              className="focus:outline-none flex-shrink-0"
                              title={inWatchlist ? "移出自选" : "加入自选"}
                            >
                              {inWatchlist ? (
                                <Star className="w-3.5 h-3.5 fill-yellow-500 text-yellow-500" />
                              ) : (
                                <Star className="w-3.5 h-3.5 text-muted-foreground/40 hover:text-yellow-500 transition-colors" />
                              )}
                            </button>
                            <span>{stock.symbol}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-medium py-2 max-w-[80px] truncate">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="truncate block">{stock.name}</span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                {stock.name} ({stock.exchange})
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell className="py-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-1 cursor-help">
                                  <Badge
                                    variant="outline"
                                    className={`text-xs py-0 px-1.5 font-mono ${compBg} ${compColor} border`}
                                  >
                                    {stock.compositeScore}
                                  </Badge>
                                  <span className={`text-[10px] ${compColor}`}>
                                    {compLabel}
                                  </span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs text-xs">
                                <div>综合评分: {stock.compositeScore}/100</div>
                                {stock.compositeDetail && <div className="text-muted-foreground">{stock.compositeDetail}</div>}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell className="py-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-1 cursor-help">
                                  <Badge
                                    variant="outline"
                                    className={`text-xs py-0 px-1.5 font-mono ${relBg} ${relColor} border`}
                                  >
                                    {stock.reliabilityScore}
                                  </Badge>
                                  <span className={`text-[10px] ${relColor}`}>
                                    {relLabel}
                                  </span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs text-xs">
                                <div>可靠度: {stock.reliabilityScore}/100</div>
                                <div className="text-muted-foreground">{stock.reliabilityDetail || "综合评分"}</div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell className="py-2">
                          <div className="flex items-center gap-1">
                            <Badge
                              variant="outline"
                              className={`text-xs py-0 px-1.5 font-mono ${pulseBg} ${pulseColor} border`}
                            >
                              {stock.pulseScore}
                            </Badge>
                            <span className={`text-[10px] ${pulseColor}`}>
                              {pulseLabel}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-2">
                          <div className="flex items-center gap-1">
                            <Badge
                              variant="outline"
                              className={`text-xs py-0 px-1.5 font-mono ${volSurgeBg} ${volSurgeColor} border`}
                            >
                              {stock.volumeSurgeScore}
                            </Badge>
                            <span className={`text-[10px] ${volSurgeColor}`}>
                              {volSurgeLabel}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-2">
                          <div className="flex items-center gap-1">
                            <Badge
                              variant="outline"
                              className={`text-xs py-0 px-1.5 font-mono ${progVolBg} ${progVolColor} border`}
                            >
                              {stock.progressiveVolScore}
                            </Badge>
                            <span className={`text-[10px] ${progVolColor}`}>
                              {progVolLabel}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className={`text-xs font-mono py-2 ${changeColor}`}>
                          {stock.price.toFixed(2)}
                        </TableCell>
                        <TableCell className={`text-xs font-mono py-2 font-medium ${changeColor}`}>
                          <div className="flex items-center gap-0.5">
                            {isUp ? (
                              <ArrowUpRight className="w-3 h-3" />
                            ) : (
                              <ArrowDownRight className="w-3 h-3" />
                            )}
                            {stock.changePercent.toFixed(2)}%
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-mono py-2">
                          {stock.turnover.toFixed(2)}
                        </TableCell>
                        <TableCell className={`text-xs font-mono py-2 ${stock.volumeRatio >= 1.5 ? "text-amber-500" : stock.volumeRatio >= 1 ? "text-foreground" : "text-muted-foreground"}`}>
                          {stock.volumeRatio > 0 ? stock.volumeRatio.toFixed(2) : "--"}
                        </TableCell>
                        <TableCell className={`text-xs font-mono py-2 ${mainFlowColor}`}>
                          {stock.mainNetInflow >= 0 ? "+" : ""}
                          {formatAmount(stock.mainNetInflow)}
                        </TableCell>
                        <TableCell className="text-center">
                          {stock.evaluation && stock.evaluation !== "待评估" ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className={`${getEvaluationStyle(stock.evaluation).bg} ${getEvaluationStyle(stock.evaluation).text} text-xs cursor-help`}>
                                    {getEvaluationStyle(stock.evaluation).icon} {stock.evaluation}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs text-xs">
                                  {stock.evaluationDetail}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-mono py-2 text-muted-foreground">
                          {stock.pe > 0 ? stock.pe.toFixed(1) : "--"}
                        </TableCell>
                        <TableCell className="text-xs font-mono py-2 text-muted-foreground">
                          {stock.pb > 0 ? stock.pb.toFixed(1) : "--"}
                        </TableCell>
                        <TableCell className="text-xs font-mono py-2">
                          {stock.buySellRatio > 0 ? (
                            <span className={stock.buySellRatio >= 1.5 ? "text-red-500" : stock.buySellRatio >= 1 ? "text-orange-500" : "text-muted-foreground"}>
                              {stock.buySellRatio.toFixed(1)}
                            </span>
                          ) : "--"}
                        </TableCell>
                        <TableCell className="text-xs font-mono py-2">
                          {stock.pricePosition > 0 ? (
                            <span className={stock.pricePosition >= 80 ? "text-red-500" : stock.pricePosition >= 60 ? "text-orange-500" : "text-muted-foreground"}>
                              {stock.pricePosition.toFixed(0)}%
                            </span>
                          ) : "--"}
                        </TableCell>
                        {/* v5.0 new columns */}
                        <TableCell className="text-xs font-mono py-2">
                          {stock.consecutiveUpDays > 0 ? (
                            <span className={stock.consecutiveUpDays >= 3 ? "text-red-500 font-medium" : stock.consecutiveUpDays >= 2 ? "text-orange-500" : "text-muted-foreground"}>
                              {stock.consecutiveUpDays}天
                            </span>
                          ) : "--"}
                        </TableCell>
                        <TableCell className="text-xs font-mono py-2">
                          {stock.limitUpStrength > 0 ? (
                            <span className={stock.limitUpStrength >= 70 ? "text-red-500 font-medium" : stock.limitUpStrength >= 50 ? "text-orange-500" : "text-yellow-500"}>
                              {stock.limitUpStrength}
                            </span>
                          ) : "--"}
                        </TableCell>
                        <TableCell className="text-xs font-mono py-2">
                          {stock.largeOrderRatio > 0 ? (
                            <span className={stock.largeOrderRatio >= 5 ? "text-red-500 font-medium" : stock.largeOrderRatio >= 3 ? "text-orange-500" : "text-muted-foreground"}>
                              {stock.largeOrderRatio.toFixed(1)}
                            </span>
                          ) : "--"}
                        </TableCell>
                        <TableCell className="text-xs font-mono py-2">
                          {stock.openingStrength === "strong_open" ? (
                            <span className="text-red-500 font-medium">强</span>
                          ) : stock.openingStrength === "weak_open" ? (
                            <span className="text-green-500">弱</span>
                          ) : (
                            <span className="text-muted-foreground">中</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-mono py-2">
                          {stock.vwapDeviation !== 0 ? (
                            <span className={Math.abs(stock.vwapDeviation) >= 3 ? "text-orange-500" : "text-muted-foreground"}>
                              {stock.vwapDeviation > 0 ? "+" : ""}{stock.vwapDeviation.toFixed(1)}
                            </span>
                          ) : "--"}
                        </TableCell>
                        <TableCell className="text-xs font-mono py-2">
                          {stock.lateSessionActivity === "late_rally" ? (
                            <span className="text-red-500 font-medium">拉升</span>
                          ) : stock.lateSessionActivity === "late_drop" ? (
                            <span className="text-green-500">跳水</span>
                          ) : (
                            <span className="text-muted-foreground">--</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs py-2 text-muted-foreground max-w-[200px] truncate">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="truncate block">
                                  {stock.resonanceTags && <span className="text-rose-500 font-medium">🎯{stock.resonanceTags} </span>}
                                  {stock.compositeScore > 0 && <span className="text-emerald-500">🛡{stock.compositeDetail}</span>}
                                  {stock.compositeScore > 0 && (stock.pulseScore > 0 || stock.volumeSurgeScore > 0 || stock.progressiveVolScore > 0) && " | "}
                                  {stock.pulseScore > 0 && <span className="text-amber-500">⚡{stock.pulseDetail}</span>}
                                  {stock.pulseScore > 0 && (stock.volumeSurgeScore > 0 || stock.progressiveVolScore > 0) && " | "}
                                  {stock.volumeSurgeScore > 0 && <span className="text-blue-500">📊{stock.volumeSurgeDetail}</span>}
                                  {stock.volumeSurgeScore > 0 && stock.progressiveVolScore > 0 && " | "}
                                  {stock.progressiveVolScore > 0 && <span className="text-purple-500">📈{stock.progressiveVolDetail}</span>}
                                  {stock.vwapPosition && stock.vwapPosition !== "no_data" && <span className="text-teal-500"> 📏{getVwapPositionLabel(stock.vwapPosition).text}</span>}
                                  {stock.capitalTrend && stock.capitalTrend !== "neutral" && <span className={getCapitalTrendLabel(stock.capitalTrend).color}> {getCapitalTrendLabel(stock.capitalTrend).icon}{getCapitalTrendLabel(stock.capitalTrend).text}</span>}
                                  {stock.compositeScore === 0 && stock.pulseScore === 0 && stock.volumeSurgeScore === 0 && stock.progressiveVolScore === 0 && "无信号"}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs max-w-[350px]">
                                {stock.resonanceTags && <div className="text-rose-500 font-medium">🎯 共振: {stock.resonanceTags}</div>}
                                {stock.compositeScore > 0 && <div>🛡 综合: {stock.compositeDetail}</div>}
                                {stock.pulseScore > 0 && <div>⚡ 脉冲: {stock.pulseDetail}</div>}
                                {stock.volumeSurgeScore > 0 && <div>📊 放量拉升: {stock.volumeSurgeDetail}</div>}
                                {stock.progressiveVolScore > 0 && <div>📈 递增: {stock.progressiveVolDetail}</div>}
                                {stock.vwapPosition && stock.vwapPosition !== "no_data" && <div>📏 均价线: {stock.vwapPositionDetail}</div>}
                                {stock.capitalTrend && stock.capitalTrend !== "neutral" && <div>💰 资金: {stock.capitalTrendDetail}</div>}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Strategy Panel ── */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-2">
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={handleStrategyExpand}
          >
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Settings className="w-4 h-4 text-emerald-500" />
              选股策略面板
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                v5.0
              </Badge>
            </CardTitle>
            <div className="flex items-center gap-2">
              {strategyLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />}
              {strategyExpanded ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
          </div>
        </CardHeader>
        {strategyExpanded && (
          <CardContent className="pt-0">
            <Tabs value={strategyTab} onValueChange={setStrategyTab}>
              <TabsList className="w-full h-8 p-0.5 mb-3 flex flex-wrap">
                <TabsTrigger value="overview" className="text-[10px] h-7 flex-1 min-w-0">总纲</TabsTrigger>
                <TabsTrigger value="filters" className="text-[10px] h-7 flex-1 min-w-0">筛选条件</TabsTrigger>
                <TabsTrigger value="scoring" className="text-[10px] h-7 flex-1 min-w-0">评分体系</TabsTrigger>
                <TabsTrigger value="evaluation" className="text-[10px] h-7 flex-1 min-w-0">评估模型</TabsTrigger>
                <TabsTrigger value="factors" className="text-[10px] h-7 flex-1 min-w-0">DB因子</TabsTrigger>
                <TabsTrigger value="params" className="text-[10px] h-7 flex-1 min-w-0">参数</TabsTrigger>
              </TabsList>

              {/* ── Tab 1: Overview ── */}
              {strategyTab === "overview" && (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg border border-border bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="h-4 w-4 text-emerald-500" />
                      <span className="text-sm font-bold">智能选股策略 v5.0</span>
                    </div>
                    <div className="text-xs text-foreground/80">
                      基于板块热点的智能选股系统，结合脉冲拉升检测、放量拉升识别、递增放量检测、多维增强筛选（含v4.0条件：流通市值、PB市净率、内外盘比、日内分位、开盘跳空）与v5.0进阶筛选（连涨天数、封板强度、大单占比、开盘强弱、均价偏离度、尾盘异动），以及综合可靠度评分模型，从板块成分股中筛选最具短线爆发潜力且可靠性最高的标的。
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <Shield className="w-3 h-3" />
                      选股流程
                    </div>
                    <div className="text-xs text-foreground/80 p-3 rounded-lg bg-muted/30 border border-border/50 space-y-1.5">
                      <div className="flex items-start gap-2"><Badge className="text-[8px] h-3.5 px-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 shrink-0">Step 1</Badge><span>板块搜索 → 关键词匹配东方财富板块代码，支持别名自动扩展</span></div>
                      <div className="flex items-start gap-2"><Badge className="text-[8px] h-3.5 px-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 shrink-0">Step 2</Badge><span>板块成分股获取 → 分页拉取所有板块成分股实时数据</span></div>
                      <div className="flex items-start gap-2"><Badge className="text-[8px] h-3.5 px-1 bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 shrink-0">Step 3</Badge><span>硬性过滤 → 主板/ST/创业板/科创板/北交/ETF/涨跌幅/市值/换手/PE/量比/振幅/流通市值/PB/内外盘/分位/跳空/连涨/封板/大单/开盘强弱/均价偏离/尾盘异动</span></div>
                      <div className="flex items-start gap-2"><Badge className="text-[8px] h-3.5 px-1 bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 shrink-0">Step 4</Badge><span>分时检测 → 逐股获取1分钟数据，运行脉冲/放量拉升/递增放量检测，评分0-100</span></div>
                      <div className="flex items-start gap-2"><Badge className="text-[8px] h-3.5 px-1 bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 shrink-0">Step 5</Badge><span>OR过滤 → 脉冲/放量拉升/递增放量满足任一阈值即通过（OR关系）</span></div>
                      <div className="flex items-start gap-2"><Badge className="text-[8px] h-3.5 px-1 bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 shrink-0">Step 6</Badge><span>综合评估 → 股票评估标签 + VWAP位置 + 资金趋势 + 多因子共振 + 综合评分 + 可靠度评分</span></div>
                      <div className="flex items-start gap-2"><Badge className="text-[8px] h-3.5 px-1 bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 shrink-0">Step 7</Badge><span>均线趋势过滤（可选） → 获取日K线，检测站上MA5/MA10/MA20/多头排列</span></div>
                      <div className="flex items-start gap-2"><Badge className="text-[8px] h-3.5 px-1 bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 shrink-0">Step 8</Badge><span>排序输出 → 按综合评分↓ → 可靠度↓ → 涨跌幅↓ 排序</span></div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">选股标准</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="p-2.5 rounded-lg border border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                        <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 mb-1">必选条件（硬性过滤）</div>
                        <ul className="text-[10px] text-foreground/70 space-y-0.5">
                          <li>- 主板标的（600/601/603/605, 000/001/002）</li>
                          <li>- 排除ETF</li>
                          <li>- 指定板块成分股</li>
                          <li>- 涨跌幅在设定范围内</li>
                          <li>- 总市值不超过上限</li>
                          <li>- 脉冲/放量拉升/递增放量（OR）</li>
                        </ul>
                      </div>
                      <div className="p-2.5 rounded-lg border border-red-200 bg-red-50/50 dark:border-red-900/40 dark:bg-red-950/20">
                        <div className="text-[10px] font-bold text-red-700 dark:text-red-300 mb-1">排除规则</div>
                        <ul className="text-[10px] text-foreground/70 space-y-0.5">
                          <li>- ST/*ST/SST/S*ST</li>
                          <li>- 创业板(300/301)</li>
                          <li>- 科创板(688/689)</li>
                          <li>- 北交所(8/4开头)</li>
                          <li>- ETF基金(51/56/58/15/16/18)</li>
                          <li>- 价格≤0 或 昨收≤0</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">评分体系总览</div>
                    <div className="p-2.5 rounded-lg border border-border bg-muted/30 space-y-2">
                      <div className="flex items-center gap-2 text-[10px]">
                        <Badge className="bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 text-[9px] h-4 px-1.5">综合</Badge>
                        <span className="text-foreground/70">6维加权评分（脉冲20%+放量拉升20%+递增15%+评估15%+资金15%+VWAP15%），含5类多因子共振检测</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px]">
                        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 text-[9px] h-4 px-1.5">脉冲</Badge>
                        <span className="text-foreground/70">5维检测（急速拉升35+冲高25+回落15+放量10+跳空10），评分0-100</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px]">
                        <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 text-[9px] h-4 px-1.5">放量拉升</Badge>
                        <span className="text-foreground/70">7维检测（量价齐升30+递增放量25+量能扩张15+集中买入15+拉高幅度10+拉升速度5+Gate门控），放量不涨最高5分且扣分</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px]">
                        <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 text-[9px] h-4 px-1.5">递增放量</Badge>
                        <span className="text-foreground/70">5维检测（序列长度30+价格涨幅25+量增长率15+多轮递增10+均步增速8+占比7），评分0-100</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px]">
                        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 text-[9px] h-4 px-1.5">可靠度</Badge>
                        <span className="text-foreground/70">8维评分（信号25+量比15+主力15+换手10+PE10+价格10+均线15+评估5）</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px]">
                        <Badge className="bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300 text-[9px] h-4 px-1.5">v4.0新增</Badge>
                        <span className="text-foreground/70">流通市值/PB市净率/内外盘比/日内分位/开盘跳空 5项增强条件</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px]">
                        <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 text-[9px] h-4 px-1.5">v5.0进阶</Badge>
                        <span className="text-foreground/70">连涨天数/封板强度/大单占比/开盘强弱/均价偏离度/尾盘异动 6项进阶条件</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Tab 2: Filter Conditions ── */}
              {strategyTab === "filters" && (
                <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                  {/* Hard filters */}
                  <div>
                    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-2">
                      <Shield className="w-3 h-3 text-red-500" />
                      一、硬性过滤条件（必须满足）
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[10px] h-7 w-24">条件</TableHead>
                          <TableHead className="text-[10px] h-7">规则</TableHead>
                          <TableHead className="text-[10px] h-7 w-16">数据源</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[
                          { name: "主板标的", rule: "代码匹配：600/601/603/605(沪), 000/001/002(深)", src: "代码" },
                          { name: "排除ETF", rule: "代码前缀匹配：51/56/58/15/16/18开头排除", src: "代码" },
                          { name: "排除ST", rule: "名称匹配：ST/*ST/SST/S*ST 均排除", src: "名称" },
                          { name: "排除创业板", rule: "代码300/301开头排除（20%涨跌幅）", src: "代码" },
                          { name: "排除科创板", rule: "代码688/689开头排除（20%涨跌幅）", src: "代码" },
                          { name: "排除北交所", rule: "代码8/4开头排除（30%涨跌幅）", src: "代码" },
                          { name: "价格有效性", rule: "最新价>0 且 昨收>0", src: "实时" },
                          { name: "涨跌幅范围", rule: `minChange(${filters.minChange}%) ≤ 涨跌幅 ≤ maxChange(${filters.maxChange}%)`, src: "f3" },
                          { name: "总市值", rule: `总市值 ≤ ${filters.maxMarketCap}亿（原始单位:元÷1亿）`, src: "f20" },
                        ].map((row) => (
                          <TableRow key={row.name}>
                            <TableCell className="text-xs py-1 font-medium">{row.name}</TableCell>
                            <TableCell className="text-[10px] py-1 text-muted-foreground">{row.rule}</TableCell>
                            <TableCell className="py-1"><Badge variant="outline" className="text-[8px] h-3.5 px-1">{row.src}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Optional filters */}
                  <div>
                    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-2">
                      <SlidersHorizontal className="w-3 h-3 text-amber-500" />
                      二、增强筛选条件（可选，0=不限）
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[10px] h-7 w-24">条件</TableHead>
                          <TableHead className="text-[10px] h-7">规则</TableHead>
                          <TableHead className="text-[10px] h-7 w-16">当前值</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[
                          { name: "换手率", rule: "minTurnover ≤ 换手率 ≤ maxTurnover", val: `${filters.minTurnover}~${filters.maxTurnover}%` },
                          { name: "PE市盈率", rule: "PE>0时: minPE ≤ PE ≤ maxPE; PE≤0不过滤", val: `${filters.minPE}~${filters.maxPE}` },
                          { name: "量比", rule: "量比 ≥ minVolumeRatio", val: `≥${filters.minVolumeRatio}` },
                          { name: "主力净流入", rule: "开启后: 主力净流入 > 0", val: filters.mainNetInflowRequired ? "已开启" : "未开启" },
                          { name: "振幅", rule: "minAmplitude ≤ 振幅 ≤ maxAmplitude", val: `${filters.minAmplitude}~${filters.maxAmplitude}%` },
                          { name: "均线趋势", rule: "可选: 站上MA5/站上MA10/站上MA20/多头排列", val: filters.enableMATrend ? filters.maTrendType : "未开启" },
                          { name: "评估标签", rule: "只显示指定评估标签的股票", val: filters.evaluationFilter.length > 0 ? filters.evaluationFilter.join("/") : "不限" },
                          { name: "综合评分", rule: "综合评分 ≥ minCompositeScore", val: `≥${filters.minCompositeScore}` },
                        ].map((row) => (
                          <TableRow key={row.name}>
                            <TableCell className="text-xs py-1 font-medium">{row.name}</TableCell>
                            <TableCell className="text-[10px] py-1 text-muted-foreground">{row.rule}</TableCell>
                            <TableCell className="py-1"><Badge variant="outline" className="text-[8px] h-3.5 px-1">{row.val}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* v4.0 new conditions */}
                  <div>
                    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-2">
                      <Sparkles className="w-3 h-3 text-purple-500" />
                      三、v4.0新增条件（可选，0=不限）
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[10px] h-7 w-28">条件</TableHead>
                          <TableHead className="text-[10px] h-7">计算规则</TableHead>
                          <TableHead className="text-[10px] h-7">逻辑</TableHead>
                          <TableHead className="text-[10px] h-7 w-16">当前值</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[
                          { name: "流通市值", calc: "f21字段(元)÷1亿", logic: "流通市值 ≤ maxCirculatingMarketCap亿", val: filters.maxCirculatingMarketCap > 0 ? `≤${filters.maxCirculatingMarketCap}亿` : "不限" },
                          { name: "PB市净率", calc: "f23字段", logic: "PB>0时: minPB ≤ PB ≤ maxPB", val: filters.maxPB > 0 ? `${filters.minPB}~${filters.maxPB}` : "不限" },
                          { name: "内外盘比", calc: "外盘(f112)/内盘(f100)，f100=0时: 外盘>0为99否则0", logic: "外盘/内盘 ≥ minBuySellRatio（>1表示买盘更强）", val: filters.minBuySellRatio > 0 ? `≥${filters.minBuySellRatio}` : "不限" },
                          { name: "日内分位", calc: "(现价-最低)/(最高-最低)×100，最高=最低时: 50", logic: "日内分位 ≥ minPricePosition%（值越大越接近日内高点）", val: filters.minPricePosition > 0 ? `≥${filters.minPricePosition}%` : "不限" },
                          { name: "开盘跳空", calc: "(开盘价-昨收)/昨收×100", logic: "跳空幅度 ≥ minGapUpRate%（正值=高开跳空）", val: filters.minGapUpRate > 0 ? `≥${filters.minGapUpRate}%` : "不限" },
                        ].map((row) => (
                          <TableRow key={row.name}>
                            <TableCell className="text-xs py-1 font-medium">{row.name}</TableCell>
                            <TableCell className="text-[10px] py-1 text-muted-foreground">{row.calc}</TableCell>
                            <TableCell className="text-[10px] py-1 text-muted-foreground">{row.logic}</TableCell>
                            <TableCell className="py-1"><Badge variant="outline" className="text-[8px] h-3.5 px-1">{row.val}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* v5.0 advanced conditions */}
                  <div>
                    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-2">
                      <Sparkles className="w-3 h-3 text-violet-500" />
                      四、v5.0进阶筛选条件（可选，0=不限）
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[10px] h-7 w-28">条件</TableHead>
                          <TableHead className="text-[10px] h-7">计算规则</TableHead>
                          <TableHead className="text-[10px] h-7">筛选逻辑</TableHead>
                          <TableHead className="text-[10px] h-7 w-16">当前值</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[
                          { name: "连涨天数", calc: "近期连续收阳天数（日K线级别）", logic: "连涨天数 ≥ minConsecutiveUpDays天（趋势延续确认）", val: filters.minConsecutiveUpDays > 0 ? `≥${filters.minConsecutiveUpDays}天` : "不限" },
                          { name: "封板强度", calc: "涨停封单占比，反映封板意愿强弱，0-100分", logic: "封板强度 ≥ minLimitUpStrength（值越大封板越坚决）", val: filters.minLimitUpStrength > 0 ? `≥${filters.minLimitUpStrength}` : "不限" },
                          { name: "大单占比", calc: "大单成交额/总成交额×100%，反映机构参与度", logic: "大单占比 ≥ minLargeOrderRatio%（值越大机构参与越积极）", val: filters.minLargeOrderRatio > 0 ? `≥${filters.minLargeOrderRatio}%` : "不限" },
                          { name: "开盘强弱", calc: "开盘15分钟走势判断: 强势/弱势/中性", logic: "strong_open=强开盘（高开高走），weak_open=弱开盘（低开低走）", val: filters.openingStrengthFilter ? (filters.openingStrengthFilter === "strong_open" ? "强开盘" : "弱开盘") : "不限" },
                          { name: "均价偏离度", calc: "(现价-VWAP均价)/VWAP均价×100%", logic: "minVwapDeviation ≤ 偏离度 ≤ maxVwapDeviation（可筛选偏离过大或过小的标的）", val: (filters.minVwapDeviation > 0 || filters.maxVwapDeviation > 0) ? `${filters.minVwapDeviation || "−∞"}~${filters.maxVwapDeviation || "+∞"}%` : "不限" },
                          { name: "尾盘异动", calc: "14:30后走势判断: 尾盘拉升/尾盘跳水/无", logic: "late_rally=尾盘拉升（抢筹信号），late_drop=尾盘跳水（出逃信号）", val: filters.enableLateSessionFilter ? (filters.lateSessionType === "late_rally" ? "尾盘拉升" : "尾盘跳水") : "未开启" },
                        ].map((row) => (
                          <TableRow key={row.name}>
                            <TableCell className="text-xs py-1 font-medium">{row.name}</TableCell>
                            <TableCell className="text-[10px] py-1 text-muted-foreground">{row.calc}</TableCell>
                            <TableCell className="text-[10px] py-1 text-muted-foreground">{row.logic}</TableCell>
                            <TableCell className="py-1"><Badge variant="outline" className="text-[8px] h-3.5 px-1">{row.val}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pulse/VolumeSurge/ProgressiveVol OR filter */}
                  <div>
                    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-2">
                      <Zap className="w-3 h-3 text-amber-500" />
                      五、分时检测过滤（OR关系）
                    </div>
                    <div className="p-2.5 rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20">
                      <div className="text-[10px] text-foreground/80 space-y-1">
                        <div>• 三个检测因子为 <span className="font-bold text-amber-700 dark:text-amber-300">OR 关系</span>：任一因子评分≥对应阈值即通过</div>
                        <div>• 脉冲检测: {filters.enablePulse ? `已开启，阈值≥${filters.pulseThreshold}` : "已关闭"}</div>
                        <div>• 放量拉升检测: {filters.enableVolumeSurge ? `已开启，阈值≥${filters.volumeSurgeThreshold}` : "已关闭"}</div>
                        <div>• 递增放量检测: {filters.enableProgressiveVol ? `已开启，阈值≥${filters.progressiveVolThreshold}` : "已关闭"}</div>
                        <div>• 检测时段: {filters.pulseTimeStart} ~ {filters.pulseTimeEnd}</div>
                        <div>• 评分通过后还需进行: 评估标签 → VWAP位置 → 资金趋势 → 共振检测 → 综合评分</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Tab 3: Scoring System ── */}
              {strategyTab === "scoring" && (
                <div className="space-y-4 max-h-[520px] overflow-y-auto pr-1">
                  {/* Pulse detection factors */}
                  <div>
                    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-2">
                      <Zap className="w-3 h-3 text-amber-500" />
                      脉冲拉升检测（5策略，满分100）
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[10px] h-7 w-20">策略</TableHead>
                          <TableHead className="text-[10px] h-7 w-14">最高分</TableHead>
                          <TableHead className="text-[10px] h-7">评分规则</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[
                          { name: "急速拉升", max: "35分", rule: "5分钟窗口最大涨幅: ≥3%→35, ≥2%→25, ≥1.5%→20, ≥1%→12, ≥0.5%→5" },
                          { name: "开盘冲高", max: "25分", rule: "开盘到早盘最高涨幅: ≥3%→25, ≥2%→18, ≥1.5%→12, ≥1%→8, ≥0.5%→3" },
                          { name: "冲高回落", max: "15分", rule: "峰值后回落0.5~5%且峰值在前半段→15, 仅峰值在前半段→8" },
                          { name: "放量配合", max: "10分", rule: "峰值量/均量: ≥2→10, ≥1.5→6, ≥1.2→3" },
                          { name: "跳空高开", max: "10分", rule: "(开盘-昨收)/昨收: ≥1%→10, ≥0.5%→5, >0%→2" },
                        ].map((row) => (
                          <TableRow key={row.name}>
                            <TableCell className="text-xs py-1.5 font-medium">{row.name}</TableCell>
                            <TableCell className="text-xs py-1.5">
                              <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300">
                                {row.max}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-[10px] py-1.5 text-muted-foreground">{row.rule}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Volume surge factors */}
                  <div>
                    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-2">
                      <TrendingUp className="w-3 h-3 text-blue-500" />
                      放量拉升检测（7策略+Gate门控，满分100）
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[10px] h-7 w-24">策略</TableHead>
                          <TableHead className="text-[10px] h-7 w-14">最高分</TableHead>
                          <TableHead className="text-[10px] h-7">评分规则</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[
                          { name: "量价齐升", max: "30分", rule: "最大量/均量 × 同分钟涨幅: 量比≥3且涨>0.3%→30; 放量下跌→-5分" },
                          { name: "递增放量拉升", max: "25分", rule: "连续量递增+价格涨: ≥5分钟且涨>0.5%→25; 递增但下跌→-5分" },
                          { name: "量能扩张+正涨幅", max: "15分", rule: "窗口均量/基准量 + 正涨幅: ≥2x且涨>1%→15; 扩张但下跌→-3分" },
                          { name: "集中买入占比", max: "15分", rule: "放量+上涨分钟占比: ≥40%→15, ≥30%→12, ≥20%→8, ≥10%→4" },
                          { name: "放量拉高幅度", max: "10分", rule: "最大量前后3分钟价格涨幅: ≥3%→10, ≥2%→8, ≥1%→5, ≥0.5%→3" },
                          { name: "拉升速度", max: "5分", rule: "3分钟窗口最大涨幅: ≥2%→5, ≥1%→3, ≥0.5%→1" },
                          { name: "Gate门控", max: "封顶5分", rule: "如无任何价格上涨(涨幅≤0.1%且最大量分钟跌且3分钟涨幅≤0.3%)，评分封顶5分（放量滞涨）" },
                        ].map((row) => (
                          <TableRow key={row.name}>
                            <TableCell className="text-xs py-1.5 font-medium">{row.name}</TableCell>
                            <TableCell className="text-xs py-1.5">
                              <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300">
                                {row.max}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-[10px] py-1.5 text-muted-foreground">{row.rule}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Progressive volume factors */}
                  <div>
                    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-2">
                      <Activity className="w-3 h-3 text-purple-500" />
                      递增放量检测（5策略，满分100）
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[10px] h-7 w-24">策略</TableHead>
                          <TableHead className="text-[10px] h-7 w-14">最高分</TableHead>
                          <TableHead className="text-[10px] h-7">评分规则</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[
                          { name: "最长递增序列", max: "30分", rule: "连续量递增分钟数: ≥8→30, ≥6→25, ≥5→20, ≥4→15, ≥3→10" },
                          { name: "递增期间涨幅", max: "25分", rule: "递增序列内价格涨幅: ≥3%→25, ≥2%→20, ≥1%→15, ≥0.5%→10, ≥0%→3; 下跌→-5分" },
                          { name: "量增长速率", max: "15分", rule: "末量/首量增长率: ≥300%→15, ≥200%→12, ≥100%→8, ≥50%→5, ≥20%→3" },
                          { name: "多轮递增", max: "10分", rule: "递增序列轮数(含价格涨): ≥3轮且≥2轮涨→10, ≥2轮且≥1轮涨→6" },
                          { name: "均步增速+占比", max: "15分", rule: "平均每步增长率≥50%→8, ≥30%→5; 递增量/总量≥50%→7, ≥30%→4" },
                        ].map((row) => (
                          <TableRow key={row.name}>
                            <TableCell className="text-xs py-1.5 font-medium">{row.name}</TableCell>
                            <TableCell className="text-xs py-1.5">
                              <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300">
                                {row.max}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-[10px] py-1.5 text-muted-foreground">{row.rule}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Composite scoring */}
                  <div>
                    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-2">
                      <Target className="w-3 h-3 text-rose-500" />
                      综合评分模型（6维加权）
                    </div>
                    <div className="p-2.5 rounded-lg border border-border bg-muted/30">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {[
                          { name: "脉冲评分", weight: "20%", score: "0-100", color: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
                          { name: "放量拉升评分", weight: "20%", score: "0-100", color: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
                          { name: "递增放量评分", weight: "15%", score: "0-100", color: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300" },
                          { name: "评估信号", weight: "15%", score: "0-100", color: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" },
                          { name: "资金趋势", weight: "15%", score: "0-100", color: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300" },
                          { name: "VWAP位置", weight: "15%", score: "0-100", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
                        ].map((item) => (
                          <div key={item.name} className="p-2 rounded border border-border/50 bg-background/50">
                            <div className="flex items-center gap-1 mb-1">
                              <Badge className={`text-[8px] h-3.5 px-1 ${item.color}`}>{item.weight}</Badge>
                              <span className="text-[10px] font-medium">{item.name}</span>
                            </div>
                            <div className="text-[9px] text-muted-foreground">评分范围: {item.score}</div>
                          </div>
                        ))}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-2">
                        公式: 综合分 = 脉冲×0.20 + 放量拉升×0.20 + 递增×0.15 + 评估×0.15 + 资金×0.15 + VWAP×0.15，四舍五入保留1位小数，范围0-100
                      </div>
                    </div>
                  </div>

                  {/* Resonance detection */}
                  <div>
                    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-2">
                      <Sparkles className="w-3 h-3 text-orange-500" />
                      多因子共振检测（8类，含v5.0新增3类）
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[10px] h-7 w-28">共振类型</TableHead>
                          <TableHead className="text-[10px] h-7">触发条件</TableHead>
                          <TableHead className="text-[10px] h-7 w-16">版本</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[
                          { name: "脉冲放量共振", rule: "pulseScore ≥ 40 AND volumeSurgeScore ≥ 40", ver: "v4.0" },
                          { name: "递增放量共振", rule: "progressiveVolScore ≥ 40 AND (pulseScore ≥ 30 OR volumeSurgeScore ≥ 30)", ver: "v4.0" },
                          { name: "三因子共振", rule: "pulseScore ≥ 40 AND volumeSurgeScore ≥ 40 AND progressiveVolScore ≥ 40", ver: "v4.0" },
                          { name: "资金量能共振", rule: "资金趋势含inflow AND (pulseScore ≥ 30 OR volumeSurgeScore ≥ 30)", ver: "v4.0" },
                          { name: "均线共振", rule: "VWAP位置=above_vwap或cross_up AND (pulseScore ≥ 30 OR volumeSurgeScore ≥ 30)", ver: "v4.0" },
                          { name: "开盘资金共振", rule: "开盘强弱=strong_open AND 资金趋势含inflow（强开盘+主力流入=涨势确认）", ver: "v5.0" },
                          { name: "大单量能共振", rule: "大单占比≥10% AND (pulseScore ≥ 30 OR volumeSurgeScore ≥ 30)（机构合力）", ver: "v5.0" },
                          { name: "尾盘资金共振", rule: "尾盘异动=late_rally AND 资金趋势含inflow（尾盘抢筹+主力流入=次日高开概率大）", ver: "v5.0" },
                        ].map((row) => (
                          <TableRow key={row.name}>
                            <TableCell className="text-xs py-1 font-medium">{row.name}</TableCell>
                            <TableCell className="text-[10px] py-1 text-muted-foreground font-mono">{row.rule}</TableCell>
                            <TableCell className="py-1"><Badge variant="outline" className={`text-[8px] h-3.5 px-1 ${row.ver === "v5.0" ? "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300" : "bg-muted/50 text-muted-foreground"}`}>{row.ver}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* ── Tab 4: Evaluation Model ── */}
              {strategyTab === "evaluation" && (
                <div className="space-y-4 max-h-[520px] overflow-y-auto pr-1">
                  <div className="p-3 rounded-lg border border-border bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="h-4 w-4 text-purple-500" />
                      <span className="text-sm font-bold">股票评估模型</span>
                    </div>
                    <div className="text-xs text-foreground/80">
                      基于多空因子评分，综合脉冲评分、放量拉升评分、递增放量评分与市场数据，输出6级评估标签。多空差值(bullish-bearish)决定最终标签。
                    </div>
                  </div>

                  {/* Evaluation labels */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      { label: "强势续涨", desc: "多头强势，动能充沛，短线有望继续上涨", range: "看多-看空≥5", ...getEvaluationStyle("强势续涨") },
                      { label: "温和看多", desc: "偏多格局，动能尚可，注意节奏", range: "差值2~4", ...getEvaluationStyle("温和看多") },
                      { label: "震荡整理", desc: "多空均衡，方向不明，建议观望", range: "差值-1~1", ...getEvaluationStyle("震荡整理") },
                      { label: "弱势回调", desc: "偏空格局，动能偏弱，谨慎操作", range: "差值-3~-2", ...getEvaluationStyle("弱势回调") },
                      { label: "拉高出货", desc: "强势看空，警惕主力出货，避免追高", range: "差值≤-5或主力流出+涨", ...getEvaluationStyle("拉高出货") },
                      { label: "观望等待", desc: "信号不明确，建议观望等待", range: "看空≥6且差值<2", ...getEvaluationStyle("观望等待") },
                    ].map((item) => (
                      <div key={item.label} className="p-2.5 rounded-lg border border-border">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Badge className={`text-[9px] h-4 px-1.5 ${item.bg} ${item.text} border-0`}>
                            {item.icon} {item.label}
                          </Badge>
                        </div>
                        <div className="text-[10px] text-muted-foreground mb-1">{item.desc}</div>
                        <div className="text-[9px] text-muted-foreground/60">阈值: {item.range}</div>
                      </div>
                    ))}
                  </div>

                  {/* Bullish factors */}
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-2">看多因子详情（24项，含v5.0新增6项）</div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[10px] h-7">因子</TableHead>
                          <TableHead className="text-[10px] h-7 w-12">权重</TableHead>
                          <TableHead className="text-[10px] h-7">触发条件</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[
                          { name: "强脉冲/放量信号", weight: "+3", desc: "max(脉冲分,放量拉升分)≥70" },
                          { name: "中等信号", weight: "+2", desc: "max(脉冲分,放量拉升分)≥50" },
                          { name: "价格接近日高", weight: "+2", desc: "价格≥日内高点×99%(距高点<1%)" },
                          { name: "价格接近新高", weight: "+1", desc: "价格≥日内高点×97%(距高点<3%)" },
                          { name: "主力大幅净流入", weight: "+2", desc: "主力净流入/成交额 > 5%" },
                          { name: "主力净流入", weight: "+1", desc: "主力净流入/成交额 > 2%" },
                          { name: "换手率适中", weight: "+1", desc: "3% ≤ 换手率 ≤ 15%" },
                          { name: "涨幅强劲", weight: "+2", desc: "涨跌幅 > 2%" },
                          { name: "涨幅偏强", weight: "+1", desc: "涨跌幅 > 1%" },
                          { name: "市值适中", weight: "+1", desc: "50亿 ≤ 总市值 ≤ 200亿" },
                          { name: "脉冲+放量共振", weight: "+2", desc: "脉冲分≥40 且 放量拉升分≥40" },
                          { name: "强递增放量", weight: "+2", desc: "递增放量评分≥70" },
                          { name: "递增放量", weight: "+2", desc: "递增放量评分≥50" },
                          { name: "轻微递增", weight: "+1", desc: "递增放量评分≥30" },
                          { name: "递增放量共振", weight: "+1", desc: "递增≥40 且 (脉冲≥30 或 放量拉升≥30)" },
                          { name: "量比偏强", weight: "+1", desc: "量比 ≥ 1.5" },
                          { name: "低振幅抗跌", weight: "+1", desc: "振幅≤3% 且 -1%≤涨跌幅≤0%" },
                          { name: "PE估值合理", weight: "+1", desc: "0 < PE ≤ 30" },
                          { name: "连涨趋势", weight: "+2", desc: "连涨天数 ≥ 3天（趋势延续信号）" },
                          { name: "大单主导", weight: "+2", desc: "大单占比 ≥ 10%（机构积极介入）" },
                          { name: "强开盘", weight: "+2", desc: "开盘15分钟均价高于昨收0.5%以上（做多意愿强烈）" },
                          { name: "尾盘抢筹", weight: "+2", desc: "14:30后涨幅>1%（资金尾盘抢筹）" },
                          { name: "均价线附近", weight: "+1", desc: "均价偏离度绝对值 < 1%（方向待选择，风险可控）" },
                        ].map(f => (
                          <TableRow key={f.name}>
                            <TableCell className="text-xs py-1 font-medium">{f.name}</TableCell>
                            <TableCell className="py-1">
                              <Badge className="text-[9px] h-4 px-1 bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">{f.weight}</Badge>
                            </TableCell>
                            <TableCell className="text-[10px] py-1 text-muted-foreground">{f.desc}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Bearish factors */}
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-2">看空因子详情（15项，含v5.0新增3项）</div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[10px] h-7">因子</TableHead>
                          <TableHead className="text-[10px] h-7 w-12">权重</TableHead>
                          <TableHead className="text-[10px] h-7">触发条件</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[
                          { name: "长上影线", weight: "-3", desc: "上影线/最高价 > 3%（冲高回落明显）" },
                          { name: "上影线", weight: "-2", desc: "上影线/最高价 > 2%" },
                          { name: "主力大幅净流出", weight: "-3", desc: "主力净流出/成交额 > 5%" },
                          { name: "主力净流出", weight: "-2", desc: "主力净流出/成交额 > 2%" },
                          { name: "主力轻微流出", weight: "-1", desc: "主力净流出/成交额 > 0" },
                          { name: "换手率过高", weight: "-3", desc: "换手率 > 20%（过度投机）" },
                          { name: "换手率偏高", weight: "-1", desc: "换手率 > 15%" },
                          { name: "高开低走", weight: "-2", desc: "开盘>昨收 且 当前价<昨收" },
                          { name: "盘面偏弱", weight: "-1", desc: "当前价<开盘 且 跌幅>2%" },
                          { name: "大幅震荡偏弱", weight: "-2", desc: "振幅>6% 且 涨幅<1%" },
                          { name: "脉冲后回落", weight: "-1", desc: "脉冲分≥50 但 涨幅<1.5%" },
                          { name: "小盘易操控", weight: "-1", desc: "总市值 < 30亿" },
                          { name: "弱开盘", weight: "-2", desc: "开盘15分钟均价低于昨收0.3%以上（卖压明显）" },
                          { name: "尾盘出逃", weight: "-2", desc: "14:30后跌幅>1%（资金尾盘出逃）" },
                          { name: "均价偏离过大", weight: "-1", desc: "均价偏离度绝对值 > 3%（过度偏离，回归压力大）" },
                        ].map(f => (
                          <TableRow key={f.name}>
                            <TableCell className="text-xs py-1 font-medium">{f.name}</TableCell>
                            <TableCell className="py-1">
                              <Badge className="text-[9px] h-4 px-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{f.weight}</Badge>
                            </TableCell>
                            <TableCell className="text-[10px] py-1 text-muted-foreground">{f.desc}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* VWAP position */}
                  <div>
                    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-2">
                      <BarChart3 className="w-3 h-3 text-teal-500" />
                      VWAP均价线位置检测
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[10px] h-7 w-20">位置</TableHead>
                          <TableHead className="text-[10px] h-7 w-14">评分</TableHead>
                          <TableHead className="text-[10px] h-7">判定逻辑</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[
                          { pos: "above_vwap", score: "90分", logic: "价格偏离VWAP > 0.5%（上方）" },
                          { pos: "cross_up", score: "85分", logic: "近5分钟内从均线下方突破到上方" },
                          { pos: "near_vwap", score: "70分", logic: "价格偏离VWAP ≤ 0.5%（贴近均线）" },
                          { pos: "cross_down", score: "40分", logic: "近5分钟内从均线上方跌破到下方" },
                          { pos: "below_vwap", score: "30分", logic: "价格偏离VWAP > 0.5%（下方）" },
                          { pos: "no_data", score: "50分", logic: "无分时数据或成交量异常" },
                        ].map((row) => (
                          <TableRow key={row.pos}>
                            <TableCell className="text-xs py-1 font-medium">{row.pos}</TableCell>
                            <TableCell className="text-xs py-1">
                              <Badge variant="outline" className="text-[9px] h-4 px-1.5">{row.score}</Badge>
                            </TableCell>
                            <TableCell className="text-[10px] py-1 text-muted-foreground">{row.logic}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Capital trend */}
                  <div>
                    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-2">
                      <Activity className="w-3 h-3 text-rose-500" />
                      资金趋势分析
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[10px] h-7 w-28">趋势</TableHead>
                          <TableHead className="text-[10px] h-7 w-14">评分</TableHead>
                          <TableHead className="text-[10px] h-7">判定逻辑</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[
                          { trend: "strong_inflow", score: "100分", logic: "主力净流入/成交额 > 5%（大幅流入）" },
                          { trend: "moderate_inflow", score: "75分", logic: "主力净流入/成交额 > 2%（温和流入）" },
                          { trend: "neutral", score: "50分", logic: "主力净流入/成交额 -2%~2%（中性）" },
                          { trend: "outflow", score: "25分", logic: "主力净流入/成交额 < -2%（流出）" },
                          { trend: "strong_outflow", score: "10分", logic: "主力净流入/成交额 < -5%（大幅流出）" },
                        ].map((row) => (
                          <TableRow key={row.trend}>
                            <TableCell className="text-xs py-1 font-medium">{row.trend}</TableCell>
                            <TableCell className="text-xs py-1">
                              <Badge variant="outline" className="text-[9px] h-4 px-1.5">{row.score}</Badge>
                            </TableCell>
                            <TableCell className="text-[10px] py-1 text-muted-foreground">{row.logic}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* ── Tab 5: DB Factors ── */}
              {strategyTab === "factors" && (
                <div className="space-y-3">
                  {strategyLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
                      <span className="ml-2 text-xs text-muted-foreground">加载因子数据...</span>
                    </div>
                  ) : strategyFactors.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-8">暂无因子数据</div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Database className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-xs font-medium">策略因子 ({strategyFactors.length})</span>
                          <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                            已启用 {strategyFactors.filter(f => f.enabled).length}/{strategyFactors.length}
                          </Badge>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[10px] gap-1"
                          onClick={() => { strategyFetchedRef.current = false; fetchStrategyData(); }}
                        >
                          <RefreshCw className="w-3 h-3" />
                          刷新
                        </Button>
                      </div>
                      <div className="max-h-96 overflow-y-auto rounded-lg border border-border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-[10px] h-7 w-8">状态</TableHead>
                              <TableHead className="text-[10px] h-7">因子名</TableHead>
                              <TableHead className="text-[10px] h-7">类别</TableHead>
                              <TableHead className="text-[10px] h-7">信号</TableHead>
                              <TableHead className="text-[10px] h-7">强度</TableHead>
                              <TableHead className="text-[10px] h-7">T模式</TableHead>
                              <TableHead className="text-[10px] h-7">时间窗</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {strategyFactors.map((factor) => (
                              <TableRow key={factor.id}>
                                <TableCell className="py-1.5">
                                  <button
                                    onClick={() => handleFactorToggle(factor.id, !factor.enabled)}
                                    className="focus:outline-none"
                                    title={factor.enabled ? "点击禁用" : "点击启用"}
                                  >
                                    {factor.enabled ? (
                                      <Eye className="w-3.5 h-3.5 text-emerald-500" />
                                    ) : (
                                      <EyeOff className="w-3.5 h-3.5 text-gray-400" />
                                    )}
                                  </button>
                                </TableCell>
                                <TableCell className="text-xs py-1.5 font-medium max-w-[120px] truncate" title={factor.name}>
                                  {factor.name}
                                </TableCell>
                                <TableCell className="py-1.5">
                                  <Badge variant="outline" className="text-[9px] h-4 px-1">{factor.category}</Badge>
                                </TableCell>
                                <TableCell className="py-1.5">
                                  <Badge className={`text-[9px] h-4 px-1 ${factor.signalType === "buy" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : factor.signalType === "sell" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}`}>
                                    {factor.signalType === "buy" ? "买" : factor.signalType === "sell" ? "卖" : "止损"}
                                  </Badge>
                                </TableCell>
                                <TableCell className="py-1.5">
                                  <Select
                                    value={factor.strength || "medium"}
                                    onValueChange={(v) => handleFactorFieldChange(factor.id, "strength", v)}
                                  >
                                    <SelectTrigger className="h-5 text-[9px] w-14 px-1.5">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="strong">强</SelectItem>
                                      <SelectItem value="medium">中</SelectItem>
                                      <SelectItem value="weak">弱</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell className="py-1.5">
                                  <Select
                                    value={factor.tMode || "正T"}
                                    onValueChange={(v) => handleFactorFieldChange(factor.id, "tMode", v)}
                                  >
                                    <SelectTrigger className="h-5 text-[9px] w-12 px-1.5">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="正T">正T</SelectItem>
                                      <SelectItem value="反T">反T</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell className="py-1.5">
                                  <Select
                                    value={factor.timeWindow || "any"}
                                    onValueChange={(v) => handleFactorFieldChange(factor.id, "timeWindow", v)}
                                  >
                                    <SelectTrigger className="h-5 text-[9px] w-16 px-1.5">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="any">任意</SelectItem>
                                      <SelectItem value="sell_window">卖窗</SelectItem>
                                      <SelectItem value="buy_window">买窗</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── Tab 6: Indicator Params ── */}
              {strategyTab === "params" && (
                <div className="space-y-3">
                  {strategyLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
                      <span className="ml-2 text-xs text-muted-foreground">加载参数数据...</span>
                    </div>
                  ) : (
                    Object.entries(strategyConfig).map(([indicatorKey, params]) => {
                      const indicatorNames: Record<string, string> = {
                        macd: "MACD 参数",
                        vwap: "VWAP 偏离度",
                        rsi: "RSI 参数",
                        boll: "布林带参数",
                        volume: "成交量参数",
                      };
                      const paramLabels: Record<string, Record<string, string>> = {
                        macd: { fastPeriod: "快线EMA周期", slowPeriod: "慢线EMA周期", signalPeriod: "信号线EMA周期" },
                        vwap: { deviationSell: "卖出偏离阈值(%)", deviationBuy: "买回偏离阈值(%)" },
                        rsi: { rsiPeriod: "RSI周期", oversold: "超卖阈值", overbought: "超买阈值" },
                        boll: { bollPeriod: "布林带周期", bollMultiplier: "标准差倍数" },
                        volume: { volumeMultiplier: "放量倍数阈值", volumeMultiplierStrong: "强放量倍数", volumeShrinkRatio: "缩量比例", volumePulseMultiplier: "脉冲放量倍数", consecutiveShrinkBars: "连续缩量根数" },
                      };
                      return (
                        <div key={indicatorKey} className="p-3 rounded-lg border border-border">
                          <div className="text-xs font-medium mb-2 flex items-center gap-1.5">
                            <Cpu className="w-3 h-3 text-muted-foreground" />
                            {indicatorNames[indicatorKey] || indicatorKey}
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {Object.entries(params).map(([paramKey, value]) => {
                              const paramId = `${indicatorKey}.${paramKey}`;
                              const isEditing = editingParamKey === paramId;
                              return (
                                <div key={paramKey} className="flex items-center gap-1.5 p-1.5 rounded bg-muted/30">
                                  <span className="text-[10px] text-muted-foreground min-w-0 flex-shrink-0">
                                    {(paramLabels[indicatorKey] || {})[paramKey] || paramKey}
                                  </span>
                                  {isEditing ? (
                                    <Input
                                      type="number"
                                      value={editingParamValue}
                                      onChange={(e) => setEditingParamValue(e.target.value)}
                                      onBlur={() => {
                                        const numVal = parseFloat(editingParamValue);
                                        if (!isNaN(numVal)) {
                                          handleConfigSave(indicatorKey, paramKey, numVal);
                                        } else {
                                          setEditingParamKey(null);
                                        }
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          const numVal = parseFloat(editingParamValue);
                                          if (!isNaN(numVal)) {
                                            handleConfigSave(indicatorKey, paramKey, numVal);
                                          } else {
                                            setEditingParamKey(null);
                                          }
                                        } else if (e.key === "Escape") {
                                          setEditingParamKey(null);
                                        }
                                      }}
                                      className="h-5 text-[10px] w-16 px-1"
                                      autoFocus
                                    />
                                  ) : (
                                    <button
                                      className="text-xs font-mono font-medium hover:text-emerald-600 transition-colors"
                                      onClick={() => {
                                        setEditingParamKey(paramId);
                                        setEditingParamValue(String(value));
                                      }}
                                      title="点击编辑"
                                    >
                                      {typeof value === "number" ? (Number.isInteger(value) ? value : value.toFixed(2)) : value}
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </Tabs>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
