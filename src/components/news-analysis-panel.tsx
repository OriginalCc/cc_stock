"use client";

import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  X,
  RefreshCw,
  Newspaper,
  Loader2,
  ExternalLink,
  Filter,
  History,
  Target,
  Zap,
  ThumbsUp,
  ThumbsDown,
  MinusCircle,
  TrendingUp,
  Trophy,
  Timer,
  ChevronRight,
} from "lucide-react";

// ── Props ──────────────────────────────────────────────

interface NewsAnalysisPanelProps {
  symbol: string;
  stockName?: string;
  isAShare: boolean;
  quote?: any;
  sectorInfo: { code: string; name: string } | null;
  newsData: Record<string, any>;
  setNewsData: (data: Record<string, any>) => void;
  newsLoading: boolean;
  setNewsLoading: (loading: boolean) => void;
  showNewsAnalysis: boolean;
  setShowNewsAnalysis: (show: boolean) => void;
}

// ── Component ──────────────────────────────────────────

export function NewsAnalysisPanel({
  symbol,
  stockName,
  isAShare,
  quote,
  sectorInfo,
  newsData,
  setNewsData,
  newsLoading,
  setNewsLoading,
  showNewsAnalysis,
  setShowNewsAnalysis,
}: NewsAnalysisPanelProps) {
  // ── News tab state ──
  const [newsActiveTab, setNewsActiveTab] = useState<"market" | "sector" | "stock" | "overseas">("market");

  // ── Prediction day: before 11:30 → 今日预判, after 11:30 → 明日预判 ──
  const predictionDay = useMemo(() => {
    const now = new Date();
    const china = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
    const h = china.getHours(), m = china.getMinutes();
    return (h < 11 || (h === 11 && m < 30)) ? "今日" : "明日";
  }, []);
  const currentPredictionDay = newsData[newsActiveTab]?.predictionDay || predictionDay;

  // Radar dimension labels vary by tab
  const radarLabelsByTab: Record<string, string[]> = {
    market: ["技术面", "资金面", "政策面", "情绪面"],
    sector: ["技术面", "资金面", "政策面", "情绪面"],
    stock: ["技术面", "资金面", "消息面", "情绪面"],
    overseas: ["美股走势", "港股走势", "资金流向", "政策消息"],
  };
  const radarLabels = radarLabelsByTab[newsActiveTab] || radarLabelsByTab.market;

  // ── News filter state ──
  const [newsFilterSource, setNewsFilterSource] = useState<string>("all");
  const [newsFilterDimension, setNewsFilterDimension] = useState<string>("all");
  const [newsFilterSentiment, setNewsFilterSentiment] = useState<string>("all");

  // ── News prediction history (persisted to localStorage) ──
  const NEWS_PREDICTION_KEY = "news_predictions";
  const [newsPredictions, setNewsPredictions] = useState<Array<{
    id: string; timestamp: string; symbol: string; type: string;
    trend: string; confidence: number; suggestion: string;
    riskLevel: string; newsSentiment: string; summary: string;
    actualResult?: "正确" | "部分正确" | "错误"; feedbackTime?: string;
  }>>([]);

  // Load predictions from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(NEWS_PREDICTION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setNewsPredictions(parsed);
      }
    } catch {}
  }, []);

  // Save predictions to localStorage when updated
  useEffect(() => {
    try { localStorage.setItem(NEWS_PREDICTION_KEY, JSON.stringify(newsPredictions)); } catch {}
  }, [newsPredictions]);

  // Save current prediction to history
  const savePrediction = useCallback((type: string, data: any) => {
    if (!data?.analysis) return;
    const a = data.analysis;
    const id = `${type}-${data.symbol}-${data.timestamp}`;
    setNewsPredictions(prev => {
      if (prev.some(p => p.id === id)) return prev;
      const entry = {
        id, timestamp: data.timestamp, symbol: data.symbol, type,
        trend: a.trend, confidence: a.confidence, suggestion: a.suggestion,
        riskLevel: a.riskLevel, newsSentiment: a.newsSentiment, summary: a.summary,
      };
      return [entry, ...prev].slice(0, 50);
    });
  }, []);

  // Record feedback on a prediction
  const recordPredictionFeedback = useCallback((id: string, result: "正确" | "部分正确" | "错误") => {
    setNewsPredictions(prev => prev.map(p =>
      p.id === id ? { ...p, actualResult: result, feedbackTime: new Date().toISOString() } : p
    ));
  }, []);

  // ── News cache freshness tracking ──
  const [newsCacheAge, setNewsCacheAge] = useState<number>(0);
  const NEWS_AUTO_REFRESH_INTERVAL = 30 * 60;

  // ── News localStorage cache helpers ──
  const getNewsCacheKey = useCallback((sym: string) => {
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
    return `news_${sym}_${today}`;
  }, []);

  const saveNewsCache = useCallback((sym: string, data: { market?: any; sector?: any; stock?: any }) => {
    try {
      const key = getNewsCacheKey(sym);
      localStorage.setItem(key, JSON.stringify({ data, savedAt: Date.now() }));
    } catch {}
  }, [getNewsCacheKey]);

  const loadNewsCache = useCallback((sym: string): { market?: any; sector?: any; stock?: any } | null => {
    try {
      const key = getNewsCacheKey(sym);
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed.savedAt && Date.now() - parsed.savedAt < 4 * 60 * 60 * 1000) {
        return parsed.data;
      }
      localStorage.removeItem(key);
      return null;
    } catch {
      return null;
    }
  }, [getNewsCacheKey]);

  // Clean up stale news cache entries from previous days (run once on mount)
  useEffect(() => {
    try {
      const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("news_") && !k.includes(today)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch {}
  }, []);

  // ── News Analysis: Computed data ──
  const currentNewsTabData = newsData[newsActiveTab];
  const filteredNews = useMemo(() => {
    if (!currentNewsTabData?.news) return [];
    return currentNewsTabData.news.filter((item: any) => {
      if (newsFilterSource !== "all" && item.sourceType !== newsFilterSource) return false;
      if (newsFilterDimension !== "all" && item.searchLabel !== newsFilterDimension) return false;
      return true;
    });
  }, [currentNewsTabData?.news, newsFilterSource, newsFilterDimension]);

  // Sentiment radar scores for SVG radar chart
  const sentimentScores = useMemo(() => {
    if (!currentNewsTabData?.analysis) return [50, 50, 50, 50];
    const a = currentNewsTabData.analysis;
    const textToScore = (text: string, base: number): number => {
      if (!text) return base;
      const lower = text.toLowerCase();
      if (lower.includes("强") && (lower.includes("多") || lower.includes("买") || lower.includes("上"))) return 85;
      if (lower.includes("弱") && (lower.includes("空") || lower.includes("卖") || lower.includes("下"))) return 20;
      if (lower.includes("多") || lower.includes("买") || lower.includes("上") || lower.includes("升")) return 70;
      if (lower.includes("空") || lower.includes("卖") || lower.includes("下") || lower.includes("降")) return 30;
      if (lower.includes("震荡") || lower.includes("中性") || lower.includes("观望")) return 50;
      return base;
    };
    return [
      textToScore(a.technicalView || "", a.trend === "上升" ? 70 : a.trend === "下降" ? 30 : 50),
      textToScore(a.capitalView || "", a.newsSentiment === "偏多" ? 70 : a.newsSentiment === "偏空" ? 30 : 50),
      textToScore(a.policyView || "", 50),
      textToScore(a.sentimentView || "", a.newsSentiment === "偏多" ? 65 : a.newsSentiment === "偏空" ? 35 : 50),
    ];
  }, [currentNewsTabData?.analysis]);

  // Prediction accuracy stats
  const predictionStats = useMemo(() => {
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
    const todayPredictions = newsPredictions.filter(p => p.timestamp && p.timestamp.startsWith(today));
    const withFeedback = todayPredictions.filter(p => p.actualResult);
    const correct = withFeedback.filter(p => p.actualResult === "正确").length;
    const partial = withFeedback.filter(p => p.actualResult === "部分正确").length;
    const wrong = withFeedback.filter(p => p.actualResult === "错误").length;
    const total = withFeedback.length;
    const accuracy = total > 0 ? Math.round((correct + partial * 0.5) / total * 100) : -1;
    return { todayTotal: todayPredictions.length, withFeedback: total, correct, partial, wrong, accuracy };
  }, [newsPredictions]);

  // ── News Analysis: fetch data from API ──
  const newsDataRef = useRef(newsData);
  newsDataRef.current = newsData;

  const fetchNewsAnalysis = useCallback(async (options?: { incremental?: boolean }) => {
    const isIncremental = options?.incremental === true;
    const currentNewsData = newsDataRef.current;
    if (!isIncremental || !currentNewsData.market) {
      setNewsLoading(true);
    }
    try {
      const sName = stockName || symbol;
      const sectorName = sectorInfo?.name || "";
      const params = new URLSearchParams();
      params.set("symbol", symbol);
      params.set("stockName", sName);
      params.set("sectorName", sectorName);

      if (isIncremental) {
        params.set("mode", "incremental");
        const lastTs = [currentNewsData.market, currentNewsData.sector, currentNewsData.stock, currentNewsData.overseas]
          .filter(Boolean)
          .map((d: any) => d.timestamp)
          .filter(Boolean)
          .sort()
          .pop();
        if (lastTs) params.set("lastTimestamp", lastTs);
      }

      const [marketRes, sectorRes, stockRes, overseasRes] = await Promise.allSettled([
        fetch(`/api/stock/news-analysis?${params}&type=market`),
        sectorName ? fetch(`/api/stock/news-analysis?${params}&type=sector`) : Promise.resolve(null),
        fetch(`/api/stock/news-analysis?${params}&type=stock`),
        fetch(`/api/stock/news-analysis?${params}&type=overseas`),
      ]);

      const newData: any = {};
      let anyUpdate = false;
      if (marketRes.status === "fulfilled" && marketRes.value) {
        const m = await marketRes.value.json();
        if (m.success && !m.noUpdate) { newData.market = m; anyUpdate = true; }
      }
      if (sectorRes.status === "fulfilled" && sectorRes.value) {
        const s = await sectorRes.value.json();
        if (s.success && !s.noUpdate) { newData.sector = s; anyUpdate = true; }
      }
      if (stockRes.status === "fulfilled" && stockRes.value) {
        const st = await stockRes.value.json();
        if (st.success && !st.noUpdate) { newData.stock = st; anyUpdate = true; }
      }
      if (overseasRes.status === "fulfilled" && overseasRes.value) {
        const o = await overseasRes.value.json();
        if (o.success && !o.noUpdate) { newData.overseas = o; anyUpdate = true; }
      }

      if (anyUpdate) {
        setNewsData((prev: Record<string, any>) => {
          const merged = { ...prev };
          if (newData.market) merged.market = newData.market;
          if (newData.sector) merged.sector = newData.sector;
          if (newData.stock) merged.stock = newData.stock;
          if (newData.overseas) merged.overseas = newData.overseas;
          saveNewsCache(symbol, merged);
          return merged;
        });
      }
    } catch (e) {
      console.error("News analysis fetch error:", e);
    } finally {
      setNewsLoading(false);
    }
  }, [symbol, stockName, sectorInfo, saveNewsCache, setNewsData, setNewsLoading]);

  // When symbol changes, reset newsData and load from cache for the new symbol
  const prevNewsSymbolRef = useRef(symbol);
  useEffect(() => {
    if (symbol !== prevNewsSymbolRef.current) {
      prevNewsSymbolRef.current = symbol;
      const cached = loadNewsCache(symbol);
      if (cached && (cached.market || cached.sector || cached.stock || cached.overseas)) {
        setNewsData(cached);
        setNewsLoading(false);
        fetchNewsAnalysis({ incremental: true });
      } else {
        setNewsData({});
      }
    }
  }, [symbol, loadNewsCache, fetchNewsAnalysis, setNewsData, setNewsLoading]);

  // Auto-fetch news analysis: load from localStorage cache first, then incremental refresh
  useEffect(() => {
    if (!showNewsAnalysis) return;
    if (!newsData.market && !newsLoading) {
      const cached = loadNewsCache(symbol);
      if (cached && (cached.market || cached.sector || cached.stock || cached.overseas)) {
        setNewsData(cached);
        fetchNewsAnalysis({ incremental: true });
        return;
      }
      fetchNewsAnalysis();
    }
  }, [showNewsAnalysis]);

  // ── News cache age timer + auto-refresh ──
  useEffect(() => {
    if (!showNewsAnalysis || !newsData.market) return;
    const timer = setInterval(() => {
      setNewsCacheAge(prev => {
        const next = prev + 1;
        if (next >= NEWS_AUTO_REFRESH_INTERVAL && !newsLoading) {
          fetchNewsAnalysis({ incremental: true });
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [showNewsAnalysis, newsData.market, newsLoading, fetchNewsAnalysis]);

  // Reset cache age when newsData updates
  useEffect(() => {
    if (newsData.market) {
      setNewsCacheAge(0);
      if (newsData.market?.analysis) savePrediction("market", newsData.market);
      if (newsData.sector?.analysis) savePrediction("sector", newsData.sector);
      if (newsData.stock?.analysis) savePrediction("stock", newsData.stock);
      if (newsData.overseas?.analysis) savePrediction("overseas", newsData.overseas);
    }
  }, [newsData.market?.timestamp, newsData.sector?.timestamp, newsData.stock?.timestamp, newsData.overseas?.timestamp]);

  // ── Expose fetchNewsAnalysis via ref so parent can call it ──
  // Store in a ref so the parent button handler can trigger it
  const fetchRef = useRef(fetchNewsAnalysis);
  fetchRef.current = fetchNewsAnalysis;
  // Expose for parent component to call
  useEffect(() => {
    // Attach to window so parent can trigger fetch
    (window as any).__newsFetchAnalysis = () => fetchRef.current();
    return () => { delete (window as any).__newsFetchAnalysis; };
  }, []);

  if (!showNewsAnalysis) return null;

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Newspaper className="h-4 w-4" />
            资讯分析 · {newsActiveTab === "overseas" ? "美港股分析" : `${currentPredictionDay}预判`}
            {newsActiveTab !== "overseas" && (
              <span className="text-[10px] text-muted-foreground font-normal">
                {currentPredictionDay === "今日" ? "(11:30前)" : "(11:30后)"}
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {newsData[newsActiveTab] && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Timer className="h-3 w-3" />
                {newsCacheAge < 60 ? `${newsCacheAge}秒前` :
                 newsCacheAge < 3600 ? `${Math.floor(newsCacheAge / 60)}分钟前` :
                 `${Math.floor(newsCacheAge / 3600)}小时前`}
                {newsCacheAge > 600 && (
                  <span className="text-amber-500 ml-0.5">·建议刷新</span>
                )}
              </span>
            )}
            {newsData[newsActiveTab]?.sourceDiversity && (
              <span className="text-[10px] text-muted-foreground">
                {Object.values(newsData[newsActiveTab].sourceDiversity).reduce((a: number, b: any) => a + Number(b), 0)}条 · {Object.keys(newsData[newsActiveTab].sourceDiversity).length}渠道
              </span>
            )}
            {newsData[newsActiveTab] && !newsData[newsActiveTab]?.cached && newsLoading && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                缓存·检查更新中
              </span>
            )}
            {!newsLoading && newsData[newsActiveTab] && !newsData[newsActiveTab]?.cached && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                本地缓存
              </span>
            )}
            {newsData[newsActiveTab]?.cached && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                服务端缓存
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs px-2"
              onClick={() => fetchNewsAnalysis()}
              disabled={newsLoading}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${newsLoading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setShowNewsAnalysis(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-3 px-4">
        {/* Tabs: 大盘 / 板块 / 个股 / 美港股 */}
        <div className="flex items-center gap-1 mb-4">
          {(["market", "sector", "stock", "overseas"] as const).map((tab) => {
            const labels = { market: "大盘分析", sector: "板块分析", stock: "个股分析", overseas: "美港股" };
            const icons = { market: "📈", sector: "🏭", stock: "📊", overseas: "🌍" };
            const disabled = tab === "sector" && !sectorInfo;
            return (
              <Button
                key={tab}
                variant={newsActiveTab === tab ? "default" : "ghost"}
                size="sm"
                className="h-7 text-xs px-3"
                onClick={() => { setNewsActiveTab(tab); setNewsFilterSource("all"); setNewsFilterDimension("all"); }}
                disabled={disabled}
              >
                <span className="mr-1">{icons[tab]}</span>
                {labels[tab]}
              </Button>
            );
          })}
          {predictionStats.withFeedback > 0 && (
            <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-1 ${
              predictionStats.accuracy >= 60 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' :
              predictionStats.accuracy >= 40 ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20' :
              'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
            }`}>
              <Target className="h-3 w-3" />
              {currentPredictionDay}预判准确率 {predictionStats.accuracy}%
            </span>
          )}
        </div>

        {/* Content */}
        {newsLoading && !newsData[newsActiveTab] ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {newsActiveTab === "market" ? `正在多渠道搜索大盘资讯，深度分析${currentPredictionDay}走势...` :
               newsActiveTab === "sector" ? `正在多渠道搜索板块资讯，深度分析${currentPredictionDay}走势...` :
               newsActiveTab === "overseas" ? `正在搜索隔夜美港股资讯，分析外盘影响...` :
               `正在多渠道搜索个股资讯，深度分析${currentPredictionDay}走势...`}
            </span>
            <span className="text-xs text-muted-foreground/60">搜索维度：宏观政策 · 资金流向 · 外盘影响 · 技术分析</span>
          </div>
        ) : newsData[newsActiveTab] ? (
          <div className="space-y-3">
            {(() => {
              const data = newsData[newsActiveTab];
              const analysis = data.analysis;
              if (!analysis) return null;

              const trendConfig: Record<string, { bg: string; text: string; icon: string; border: string }> = {
                "上升": { bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400", icon: "📈", border: "border-red-500/30" },
                "下降": { bg: "bg-green-500/10", text: "text-green-600 dark:text-green-400", icon: "📉", border: "border-green-500/30" },
                "震荡": { bg: "bg-yellow-500/10", text: "text-yellow-600 dark:text-yellow-400", icon: "↔️", border: "border-yellow-500/30" },
              };
              const cfg = trendConfig[analysis.trend] || trendConfig["震荡"];
              const suggestionConfig: Record<string, { bg: string; text: string }> = {
                "正T": { bg: "bg-blue-500/10 border-blue-500/30", text: "text-blue-600 dark:text-blue-400" },
                "反T": { bg: "bg-orange-500/10 border-orange-500/30", text: "text-orange-600 dark:text-orange-400" },
                "观望": { bg: "bg-gray-500/10 border-gray-500/30", text: "text-gray-600 dark:text-gray-400" },
              };
              const sCfg = suggestionConfig[analysis.suggestion] || suggestionConfig["观望"];
              const riskConfig: Record<string, { bg: string; text: string }> = {
                "高": { bg: "bg-red-500/15 border-red-500/30", text: "text-red-600 dark:text-red-400" },
                "中": { bg: "bg-yellow-500/15 border-yellow-500/30", text: "text-yellow-600 dark:text-yellow-400" },
                "低": { bg: "bg-green-500/15 border-green-500/30", text: "text-green-600 dark:text-green-400" },
              };
              const rCfg = riskConfig[analysis.riskLevel] || riskConfig["中"];
              const sentimentConfig: Record<string, { icon: string; text: string; color: string }> = {
                "偏多": { icon: "🔺", text: "偏多", color: "text-red-500" },
                "偏空": { icon: "🔻", text: "偏空", color: "text-green-500" },
                "中性": { icon: "↔️", text: "中性", color: "text-yellow-500" },
              };
              const sentCfg = sentimentConfig[analysis.newsSentiment] || sentimentConfig["中性"];

              return (
                <>
                  {/* ── Top: Trend Overview + Sentiment Radar ── */}
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                    {/* Left: Trend Overview Card (3 cols) */}
                    <div className={`sm:col-span-3 rounded-lg border p-4 ${cfg.bg} ${cfg.border}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{cfg.icon}</span>
                          <div>
                            <div className={`text-lg font-bold ${cfg.text}`}>
                              {newsActiveTab === "overseas" ? `A股影响：${analysis.trend}` : `${currentPredictionDay}预判：${analysis.trend}`}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {newsActiveTab === "market" ? "大盘" : newsActiveTab === "sector" ? `${data.sectorName}板块` : newsActiveTab === "overseas" ? "美港股" : quote?.name || symbol} · {data.timestamp ? new Date(data.timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "--"}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-semibold ${sCfg.bg} ${sCfg.text}`}>
                            {newsActiveTab === "overseas" ? "A股建议" : `${currentPredictionDay}建议`}：{analysis.suggestion}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium ${rCfg.bg} ${rCfg.text}`}>
                              风险{analysis.riskLevel}
                            </span>
                            <span className={`text-xs font-medium ${sentCfg.color}`}>
                              {sentCfg.icon} {sentCfg.text}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Confidence Bar */}
                      <div className="mb-3">
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                          <span>信心度</span>
                          <span className="font-medium">{analysis.confidence}%</span>
                        </div>
                        <div className="h-2 w-full bg-muted/30 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min(analysis.confidence || 0, 100)}%`,
                              backgroundColor: analysis.confidence >= 70 ? '#22c55e' : analysis.confidence >= 40 ? '#f59e0b' : '#ef4444',
                            }}
                          />
                        </div>
                      </div>

                      {/* Summary */}
                      <p className="text-sm text-foreground/80 mb-3">{analysis.summary}</p>

                      {/* Key Factors */}
                      {analysis.keyFactors && analysis.keyFactors.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {analysis.keyFactors.map((factor: string, i: number) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/50 text-xs text-muted-foreground">
                              <Zap className="h-3 w-3" />
                              {factor}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Right: Sentiment Radar Chart (2 cols) */}
                    <div className="sm:col-span-2 rounded-lg border border-border/50 bg-muted/5 p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground">情绪雷达</span>
                      </div>
                      <svg viewBox="0 0 200 180" className="w-full max-w-[200px] mx-auto">
                        {[20, 40, 60, 80, 100].map(level => {
                          const r = level * 0.7;
                          const pts = [
                            [100, 90 - r],
                            [100 + r * Math.sin(Math.PI / 2), 90 + r * Math.cos(Math.PI / 2)],
                            [100, 90 + r * 0.8],
                            [100 - r * Math.sin(Math.PI / 2), 90 + r * Math.cos(Math.PI / 2)],
                          ].map(p => p.join(",")).join(" ");
                          return <polygon key={level} points={pts} fill="none" stroke="currentColor" strokeOpacity={0.1} strokeWidth={0.5} />;
                        })}
                        {[[100, 90 - 70], [100 + 70 * Math.sin(Math.PI / 2), 90 + 70 * Math.cos(Math.PI / 2)], [100, 90 + 56], [100 - 70 * Math.sin(Math.PI / 2), 90 + 70 * Math.cos(Math.PI / 2)]].map((p, i) => (
                          <line key={i} x1={100} y1={90} x2={p[0]} y2={p[1]} stroke="currentColor" strokeOpacity={0.15} strokeWidth={0.5} />
                        ))}
                        {(() => {
                          const scores = sentimentScores;
                          const pts = scores.map((s, i) => {
                            const angle = -Math.PI / 2 + i * (Math.PI / 2);
                            const rr = s * 0.7;
                            return `${100 + rr * Math.cos(angle)},${90 + rr * Math.sin(angle)}`;
                          }).join(" ");
                          const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
                          const fill = avg >= 60 ? 'rgba(239,68,68,0.15)' : avg >= 40 ? 'rgba(234,179,8,0.15)' : 'rgba(34,197,94,0.15)';
                          const stroke = avg >= 60 ? '#ef4444' : avg >= 40 ? '#eab308' : '#22c55e';
                          return <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={1.5} />;
                        })()}
                        {sentimentScores.map((s, i) => {
                          const angle = -Math.PI / 2 + i * (Math.PI / 2);
                          const rr = s * 0.7;
                          const cx = 100 + rr * Math.cos(angle);
                          const cy = 90 + rr * Math.sin(angle);
                          const labelR = 78;
                          const lx = 100 + labelR * Math.cos(angle);
                          const ly = 90 + labelR * Math.sin(angle);
                          const labels = radarLabels;
                          return (
                            <g key={i}>
                              <circle cx={cx} cy={cy} r={3} fill={s >= 60 ? '#ef4444' : s >= 40 ? '#eab308' : '#22c55e'} />
                              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="text-[8px] fill-muted-foreground">{labels[i]}</text>
                              <text x={lx} y={ly + 9} textAnchor="middle" dominantBaseline="middle" className="text-[7px] fill-muted-foreground/60">{s}</text>
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                  </div>

                  {/* ── Top 5 Gaining Sectors (overseas only) ── */}
                  {newsActiveTab === "overseas" && analysis.topSectors && analysis.topSectors.length > 0 && (
                    <div className="rounded-lg border border-border/50 bg-muted/5 p-3">
                      <div className="flex items-center gap-1.5 mb-3">
                        <Trophy className="h-3.5 w-3.5 text-amber-500" />
                        <span className="text-xs font-medium">涨幅前五板块</span>
                        <span className="text-[10px] text-muted-foreground ml-1">美港股领涨行业及催动因素</span>
                      </div>
                      <div className="space-y-2">
                        {analysis.topSectors.map((sector: { name: string; market: string; change: string; driver: string }, idx: number) => {
                          const rankColors = [
                            "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
                            "bg-gray-400/15 text-gray-600 dark:text-gray-300 border-gray-400/30",
                            "bg-orange-700/15 text-orange-700 dark:text-orange-400 border-orange-700/30",
                            "bg-muted/30 text-muted-foreground border-border/50",
                            "bg-muted/30 text-muted-foreground border-border/50",
                          ];
                          const isPositive = sector.change?.startsWith("+") || parseFloat(sector.change) > 0;
                          return (
                            <div key={idx} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-muted/10 border border-border/30 hover:bg-muted/20 transition-colors">
                              <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${rankColors[idx] || rankColors[4]}`}>
                                {idx + 1}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-foreground/90 truncate">{sector.name}</span>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${sector.market === "美股" ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" : "bg-red-500/10 text-red-600 dark:text-red-400"}`}>
                                    {sector.market}
                                  </span>
                                </div>
                                <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                                  <Zap className="h-2.5 w-2.5 inline mr-0.5" />
                                  {sector.driver || "—"}
                                </div>
                              </div>
                              <span className={`shrink-0 text-sm font-bold ${isPositive ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                                {sector.change?.startsWith("+") || sector.change?.startsWith("-") ? sector.change : isPositive ? `+${sector.change}` : sector.change}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── AI Action Summary ── */}
                  <div className="rounded-lg border border-border/50 bg-gradient-to-r from-muted/10 to-muted/5 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Target className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs font-medium">AI 操作建议</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${sCfg.bg} ${sCfg.text}`}>
                        {analysis.suggestion}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${rCfg.bg} ${rCfg.text}`}>
                        风险{analysis.riskLevel}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      <div className="flex items-start gap-1.5">
                        <span className="shrink-0 mt-0.5">
                          {analysis.suggestion === "正T" ? "🔄" : analysis.suggestion === "反T" ? "🔃" : "⏸️"}
                        </span>
                        <span className="text-foreground/70">
                          {analysis.suggestion === "正T" ? "先买后卖：开盘逢低买入，反弹后卖出，适合预判上升行情" :
                           analysis.suggestion === "反T" ? "先卖后买：开盘逢高卖出，回调后买回，适合预判下降行情" :
                           "暂不操作：市场方向不明，等待信号确认后再行动"}
                        </span>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <span className="shrink-0 mt-0.5">📊</span>
                        <span className="text-foreground/70">
                          信心度{analysis.confidence}%{analysis.confidence >= 70 ? "，信号较强可适当加仓" : analysis.confidence >= 40 ? "，建议轻仓操作" : "，信号较弱建议观望"}
                        </span>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <span className="shrink-0 mt-0.5">⚠️</span>
                        <span className="text-foreground/70">
                          {analysis.riskLevel === "高" ? "高风险环境，严格控制仓位和止损" :
                           analysis.riskLevel === "中" ? "中等风险，注意仓位管理" :
                           "低风险环境，可适度操作"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* ── Multi-Dimensional Analysis Cards ── */}
                  {(analysis.technicalView || analysis.capitalView || analysis.policyView || analysis.sentimentView) && (
                    <div className="grid grid-cols-2 gap-2">
                      {analysis.technicalView && (
                        <div className="rounded-lg border border-border/50 bg-muted/10 p-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-xs">{newsActiveTab === "overseas" ? "🇺🇸" : "📊"}</span>
                            <span className="text-xs font-medium text-muted-foreground">{newsActiveTab === "overseas" ? "美股走势" : "技术面"}</span>
                            <span className={`ml-auto text-[9px] px-1 rounded ${
                              sentimentScores[0] >= 60 ? 'bg-red-500/10 text-red-500' :
                              sentimentScores[0] >= 40 ? 'bg-yellow-500/10 text-yellow-500' :
                              'bg-green-500/10 text-green-500'
                            }`}>
                              {sentimentScores[0] >= 60 ? '偏多' : sentimentScores[0] >= 40 ? '中性' : '偏空'}
                            </span>
                          </div>
                          <p className="text-xs text-foreground/80 leading-relaxed">{analysis.technicalView}</p>
                        </div>
                      )}
                      {analysis.capitalView && (
                        <div className="rounded-lg border border-border/50 bg-muted/10 p-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-xs">{newsActiveTab === "overseas" ? "🇭🇰" : "💰"}</span>
                            <span className="text-xs font-medium text-muted-foreground">{newsActiveTab === "overseas" ? "港股走势" : "资金面"}</span>
                            <span className={`ml-auto text-[9px] px-1 rounded ${
                              sentimentScores[1] >= 60 ? 'bg-red-500/10 text-red-500' :
                              sentimentScores[1] >= 40 ? 'bg-yellow-500/10 text-yellow-500' :
                              'bg-green-500/10 text-green-500'
                            }`}>
                              {sentimentScores[1] >= 60 ? '偏多' : sentimentScores[1] >= 40 ? '中性' : '偏空'}
                            </span>
                          </div>
                          <p className="text-xs text-foreground/80 leading-relaxed">{analysis.capitalView}</p>
                        </div>
                      )}
                      {analysis.policyView && (
                        <div className="rounded-lg border border-border/50 bg-muted/10 p-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-xs">📜</span>
                            <span className="text-xs font-medium text-muted-foreground">
                              {newsActiveTab === "overseas" ? "资金流向" : newsActiveTab === "stock" ? "消息面" : newsActiveTab === "sector" ? "政策/行业" : "政策面"}
                            </span>
                            <span className={`ml-auto text-[9px] px-1 rounded ${
                              sentimentScores[2] >= 60 ? 'bg-red-500/10 text-red-500' :
                              sentimentScores[2] >= 40 ? 'bg-yellow-500/10 text-yellow-500' :
                              'bg-green-500/10 text-green-500'
                            }`}>
                              {sentimentScores[2] >= 60 ? '偏多' : sentimentScores[2] >= 40 ? '中性' : '偏空'}
                            </span>
                          </div>
                          <p className="text-xs text-foreground/80 leading-relaxed">{analysis.policyView}</p>
                        </div>
                      )}
                      {analysis.sentimentView && (
                        <div className="rounded-lg border border-border/50 bg-muted/10 p-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-xs">🎭</span>
                            <span className="text-xs font-medium text-muted-foreground">
                              {newsActiveTab === "overseas" ? "政策消息" : "情绪面"}
                            </span>
                            <span className={`ml-auto text-[9px] px-1 rounded ${
                              sentimentScores[3] >= 60 ? 'bg-red-500/10 text-red-500' :
                              sentimentScores[3] >= 40 ? 'bg-yellow-500/10 text-yellow-500' :
                              'bg-green-500/10 text-green-500'
                            }`}>
                              {sentimentScores[3] >= 60 ? '偏多' : sentimentScores[3] >= 40 ? '中性' : '偏空'}
                            </span>
                          </div>
                          <p className="text-xs text-foreground/80 leading-relaxed">{analysis.sentimentView}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Detailed Reasoning (Collapsible) ── */}
                  {analysis.detailedReasoning && (
                    <details className="group">
                      <summary className="flex items-center gap-1 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
                        <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                        详细分析推理
                      </summary>
                      <div className="mt-2 p-3 rounded-lg bg-muted/10 border border-border/50">
                        <p className="text-xs text-foreground/70 leading-relaxed whitespace-pre-line">{analysis.detailedReasoning}</p>
                      </div>
                    </details>
                  )}

                  {/* ── Prediction Feedback ── */}
                  {(() => {
                    const currentPrediction = newsPredictions.find(p =>
                      p.id === `${newsActiveTab}-${data.symbol}-${data.timestamp}`
                    );
                    return (
                      <div className="rounded-lg border border-border/50 bg-muted/5 p-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <History className="h-3.5 w-3.5" />
                            <span>预判反馈</span>
                            {currentPrediction?.actualResult ? (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                currentPrediction.actualResult === "正确" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" :
                                currentPrediction.actualResult === "部分正确" ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" :
                                "bg-red-500/10 text-red-600 border-red-500/20"
                              }`}>
                                {currentPrediction.actualResult === "正确" ? "✓ " : currentPrediction.actualResult === "部分正确" ? "~ " : "✗ "}
                                {currentPrediction.actualResult}
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground/50">{currentPredictionDay}验证后反馈</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost" size="sm"
                              className="h-6 text-[10px] px-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                              onClick={() => recordPredictionFeedback(`${newsActiveTab}-${data.symbol}-${data.timestamp}`, "正确")}
                            >
                              <ThumbsUp className="h-3 w-3 mr-0.5" />准
                            </Button>
                            <Button
                              variant="ghost" size="sm"
                              className="h-6 text-[10px] px-1.5 text-yellow-600 hover:text-yellow-700 hover:bg-yellow-500/10"
                              onClick={() => recordPredictionFeedback(`${newsActiveTab}-${data.symbol}-${data.timestamp}`, "部分正确")}
                            >
                              <MinusCircle className="h-3 w-3 mr-0.5" />半
                            </Button>
                            <Button
                              variant="ghost" size="sm"
                              className="h-6 text-[10px] px-1.5 text-red-600 hover:text-red-700 hover:bg-red-500/10"
                              onClick={() => recordPredictionFeedback(`${newsActiveTab}-${data.symbol}-${data.timestamp}`, "错误")}
                            >
                              <ThumbsDown className="h-3 w-3 mr-0.5" />偏
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── Source Diversity Stats ── */}
                  {data.sourceDiversity && Object.keys(data.sourceDiversity).length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] text-muted-foreground">资讯渠道:</span>
                      {Object.entries(data.sourceDiversity).map(([type, count]: [string, any]) => {
                        const typeColors: Record<string, string> = {
                          "券商研报": "bg-purple-500/10 text-purple-600 dark:text-purple-400",
                          "财经媒体": "bg-blue-500/10 text-blue-600 dark:text-blue-400",
                          "政策公告": "bg-red-500/10 text-red-600 dark:text-red-400",
                          "投资社区": "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
                          "外媒": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                          "综合资讯": "bg-gray-500/10 text-gray-600 dark:text-gray-400",
                        };
                        return (
                          <button
                            key={type}
                            onClick={() => setNewsFilterSource(newsFilterSource === type ? "all" : type)}
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-opacity ${typeColors[type] || typeColors["综合资讯"]} ${newsFilterSource === type ? "opacity-100 ring-1 ring-current" : newsFilterSource !== "all" ? "opacity-40" : ""}`}
                          >
                            {type} {String(count)}
                          </button>
                        );
                      })}
                      {newsFilterSource !== "all" && (
                        <button onClick={() => setNewsFilterSource("all")} className="text-[10px] text-muted-foreground hover:text-foreground">✕ 清除</button>
                      )}
                    </div>
                  )}

                  {/* ── News Filter Bar ── */}
                  {data.news && data.news.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Filter className="h-3 w-3 text-muted-foreground" />
                      {data.searchGroups && data.searchGroups.length > 0 && (
                        <div className="flex items-center gap-1">
                          {data.searchGroups.map((g: string, i: number) => (
                            <button
                              key={i}
                              onClick={() => setNewsFilterDimension(newsFilterDimension === g ? "all" : g)}
                              className={`text-[10px] px-1.5 py-0.5 rounded transition-opacity ${
                                newsFilterDimension === g ? 'bg-primary/10 text-primary ring-1 ring-primary/30' :
                                newsFilterDimension !== "all" ? 'bg-muted/30 text-muted-foreground/40' :
                                'bg-muted/30 text-muted-foreground'
                              }`}
                            >
                              {g}
                            </button>
                          ))}
                          {newsFilterDimension !== "all" && (
                            <button onClick={() => setNewsFilterDimension("all")} className="text-[10px] text-muted-foreground hover:text-foreground">✕</button>
                          )}
                        </div>
                      )}
                      <span className="text-[10px] text-muted-foreground/50 ml-auto">
                        显示 {filteredNews.length}/{data.news.length} 条
                      </span>
                    </div>
                  )}
                </>
              );
            })()}

            {/* ── News List with Source Tags ── */}
            {filteredNews.length > 0 ? (
              <div>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {filteredNews.map((item: any, i: number) => {
                    const sourceTypeColors: Record<string, string> = {
                      "券商研报": "bg-purple-500/10 text-purple-600 dark:text-purple-400",
                      "财经媒体": "bg-blue-500/10 text-blue-600 dark:text-blue-400",
                      "政策公告": "bg-red-500/10 text-red-600 dark:text-red-400",
                      "投资社区": "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
                      "外媒": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                      "综合资讯": "bg-gray-500/10 text-gray-600 dark:text-gray-400",
                    };
                    const tagColor = sourceTypeColors[item.sourceType] || sourceTypeColors["综合资讯"];
                    const isImportant = ["券商研报", "政策公告"].includes(item.sourceType);
                    return (
                      <a
                        key={i}
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`block p-2.5 rounded-lg transition-colors group ${
                          isImportant ? 'bg-primary/5 hover:bg-primary/10 border border-primary/10' : 'bg-muted/20 hover:bg-muted/40'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-foreground/90 group-hover:text-foreground line-clamp-1 flex items-center gap-1">
                              {isImportant && <span className="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary font-bold shrink-0">重要</span>}
                              {item.title}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {item.snippet}
                            </div>
                          </div>
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-muted-foreground shrink-0 mt-0.5" />
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${tagColor}`}>
                            {item.sourceType}
                          </span>
                          {item.searchLabel && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground">
                              {item.searchLabel}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground/60 ml-auto">{item.source}</span>
                          {item.date && <span className="text-[10px] text-muted-foreground/60">· {item.date}</span>}
                        </div>
                      </a>
                    );
                  })}
                </div>
              </div>
            ) : newsData[newsActiveTab]?.news?.length > 0 ? (
              <div className="text-center py-4 text-xs text-muted-foreground">
                当前筛选条件下无匹配资讯，<button className="text-primary hover:underline" onClick={() => { setNewsFilterSource("all"); setNewsFilterDimension("all"); }}>清除筛选</button>
              </div>
            ) : null}

            {/* ── Prediction History ── */}
            {newsPredictions.length > 0 && (
              <details className="group">
                <summary className="flex items-center gap-1 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
                  <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                  预判历史记录
                  <span className="text-[10px] text-muted-foreground/50 ml-1">({newsPredictions.length}条)</span>
                  {predictionStats.withFeedback > 0 && (
                    <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${
                      predictionStats.accuracy >= 60 ? 'bg-emerald-500/10 text-emerald-600' :
                      predictionStats.accuracy >= 40 ? 'bg-yellow-500/10 text-yellow-600' :
                      'bg-red-500/10 text-red-600'
                    }`}>
                      今日准确率 {predictionStats.accuracy}%
                    </span>
                  )}
                </summary>
                <div className="mt-2 max-h-48 overflow-y-auto space-y-1.5">
                  {newsPredictions.slice(0, 20).map((p) => {
                    const typeLabels: Record<string, string> = { market: "大盘", sector: "板块", stock: "个股", overseas: "美港股" };
                    const trendColors: Record<string, string> = {
                      "上升": "text-red-600 dark:text-red-400",
                      "下降": "text-green-600 dark:text-green-400",
                      "震荡": "text-yellow-600 dark:text-yellow-400",
                    };
                    return (
                      <div key={p.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-muted/10 border border-border/30 text-xs">
                        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground">{typeLabels[p.type] || p.type}</span>
                        <span className={`font-medium ${trendColors[p.trend] || ""}`}>{p.trend}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground">{p.suggestion}</span>
                        <span className="text-muted-foreground/50 ml-auto">
                          {p.timestamp ? new Date(p.timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : ""}
                        </span>
                        {p.actualResult && (
                          <span className={`text-[10px] px-1 py-0.5 rounded ${
                            p.actualResult === "正确" ? "bg-emerald-500/10 text-emerald-600" :
                            p.actualResult === "部分正确" ? "bg-yellow-500/10 text-yellow-600" :
                            "bg-red-500/10 text-red-600"
                          }`}>
                            {p.actualResult === "正确" ? "✓" : p.actualResult === "部分正确" ? "~" : "✗"} {p.actualResult}
                          </span>
                        )}
                        {!p.actualResult && (
                          <div className="flex gap-0.5">
                            <button className="text-[10px] px-1 py-0.5 rounded hover:bg-emerald-500/10 text-emerald-600" onClick={() => recordPredictionFeedback(p.id, "正确")}>✓</button>
                            <button className="text-[10px] px-1 py-0.5 rounded hover:bg-yellow-500/10 text-yellow-600" onClick={() => recordPredictionFeedback(p.id, "部分正确")}>~</button>
                            <button className="text-[10px] px-1 py-0.5 rounded hover:bg-red-500/10 text-red-600" onClick={() => recordPredictionFeedback(p.id, "错误")}>✗</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </details>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Newspaper className="h-8 w-8 text-muted-foreground/40" />
            <span className="text-sm text-muted-foreground">点击"刷新"获取多渠道资讯分析</span>
            <span className="text-xs text-muted-foreground/60">覆盖：宏观政策 · 资金流向 · 外盘影响 · 技术分析 · 研报评级</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
