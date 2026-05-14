"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  History,
  TrendingUp,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  Loader2,
  Trash2,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  CalendarDays,
  Trophy,
  PieChart,
  Save,
  AlertTriangle,
  BarChart3,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────

interface ScreenerStock {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  compositeScore?: number;
  evaluation?: string;
  pulseScore?: number;
  volumeSurgeScore?: number;
  reliabilityScore?: number;
  [key: string]: any;
}

interface HistoryRecord {
  id: string;
  recordDate: string;
  recordTime: string;
  screenerType: string;
  sectorName: string;
  stockCount: number;
  stocks: ScreenerStock[];
  filters: Record<string, any>;
  avgNextDayChange: number;
  nextDayChanges: Record<string, number>;
  day3Changes: Record<string, number>;
  day5Changes: Record<string, number>;
  avgDay3Change: number;
  avgDay5Change: number;
  isVerified: boolean;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Stats {
  totalRecords: number;
  verifiedCount: number;
  accuracy: number;
  avgNextDayChange: number;
  avgDay3Change: number;
  avgDay5Change: number;
  positiveCount: number;
  negativeCount: number;
  day3PositiveCount: number;
  day5PositiveCount: number;
}

interface SectorStat {
  count: number;
  verified: number;
  avgChange: number;
  avgDay3: number;
  avgDay5: number;
  positive: number;
  day3Positive: number;
  day5Positive: number;
  totalStocks: number;
}

interface TopStock {
  symbol: string;
  name: string;
  appearances: number;
  nextDayChanges: number[];
  day3Changes: number[];
  day5Changes: number[];
  avgChange: number;
}

// ── Screener type labels ──
const SCREENER_TYPE_LABELS: Record<string, string> = {
  stock: "智能选股",
  intraday: "分时选股",
  early: "早盘选股",
  low_open: "低开选股",
  limit_up: "涨停分析",
};

// ── Component ──────────────────────────────────────────

export function ScreenerHistoryPanel({ onSelectStock }: { onSelectStock?: (symbol: string) => void }) {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [sectorStats, setSectorStats] = useState<Record<string, SectorStat>>({});
  const [topStocks, setTopStocks] = useState<TopStock[]>([]);
  const [availableSectors, setAvailableSectors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ message: string; verified: number; skipped: number; details: any[] } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [sectorFilter, setSectorFilter] = useState("");
  const [tab, setTab] = useState<"records" | "sector" | "top">("records");
  const [saving, setSaving] = useState(false);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ days: String(days) });
      if (sectorFilter) params.set("sector", sectorFilter);
      const res = await fetch(`/api/stock/screener-history?${params}`);
      if (!res.ok) throw new Error("查询失败");
      const data = await res.json();
      setRecords(data.records || []);
      setStats(data.stats || null);
      setSectorStats(data.sectorStats || {});
      setTopStocks(data.topStocks || []);
      setAvailableSectors(data.availableSectors || []);
    } catch (e) {
      console.error("Fetch history error:", e);
    } finally {
      setLoading(false);
    }
  }, [days, sectorFilter]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleVerify = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await fetch("/api/stock/screener-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify" }),
      });
      const data = await res.json();
      setVerifyResult(data);
      await fetchHistory();
    } catch (e) {
      console.error("Verify error:", e);
      setVerifyResult({ message: "验证请求失败", verified: 0, skipped: 0, details: [] });
    } finally {
      setVerifying(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/stock/screener-history?id=${id}`, { method: "DELETE" });
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      console.error("Delete error:", e);
    }
  };

  // Manual save: save current screener results immediately
  const handleManualSave = async () => {
    setSaving(true);
    try {
      const cacheData = localStorage.getItem("screener-last-result");
      if (!cacheData) {
        setSaving(false);
        return;
      }
      const now = new Date();
      const chinaTime = new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60000);
      const recordDate = chinaTime.toISOString().split("T")[0];
      const h = chinaTime.getHours();
      const m = chinaTime.getMinutes();
      const recordTime = m >= 30 ? `${String(h).padStart(2, "0")}:30` : `${String(h).padStart(2, "0")}:00`;

      const parsed = JSON.parse(cacheData);
      if (!parsed.stocks || parsed.stocks.length === 0) {
        setSaving(false);
        return;
      }

      const stocksToSave = parsed.stocks.map((s: any) => ({
        symbol: s.symbol,
        name: s.name,
        price: s.price,
        changePercent: s.changePercent,
        compositeScore: s.compositeScore,
        evaluation: s.evaluation,
        pulseScore: s.pulseScore,
        volumeSurgeScore: s.volumeSurgeScore,
        reliabilityScore: s.reliabilityScore,
      }));

      await fetch("/api/stock/screener-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          records: [{
            recordDate,
            recordTime,
            screenerType: parsed.screenerType || "stock",
            sectorName: parsed.sector || "未知",
            stockCount: stocksToSave.length,
            stocksJson: JSON.stringify(stocksToSave),
            filtersJson: JSON.stringify(parsed.filters || {}),
          }],
        }),
      });
      await fetchHistory();
    } catch (e) {
      console.error("Manual save error:", e);
    } finally {
      setSaving(false);
    }
  };

  // Group records by date
  const groupedRecords = useMemo(() => {
    const groups: Record<string, HistoryRecord[]> = {};
    for (const r of records) {
      if (!groups[r.recordDate]) groups[r.recordDate] = [];
      groups[r.recordDate].push(r);
    }
    return groups;
  }, [records]);

  const dateKeys = Object.keys(groupedRecords).sort((a, b) => b.localeCompare(a));

  // Sorted sector stats
  const sortedSectorStats = useMemo(() => {
    return Object.entries(sectorStats)
      .sort(([, a], [, b]) => b.avgChange - a.avgChange)
      .filter(([, v]) => v.verified > 0);
  }, [sectorStats]);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header Stats */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <History className="w-4 h-4 text-amber-500" />
              历史选股验证
            </CardTitle>
            <div className="flex items-center gap-2">
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="h-7 text-xs border border-border rounded px-1.5 bg-background"
              >
                <option value={7}>近7天</option>
                <option value={15}>近15天</option>
                <option value={30}>近30天</option>
                <option value={60}>近60天</option>
              </select>
              <select
                value={sectorFilter}
                onChange={(e) => setSectorFilter(e.target.value)}
                className="h-7 text-xs border border-border rounded px-1.5 bg-background max-w-[100px]"
              >
                <option value="">全部板块</option>
                {availableSectors.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchHistory}
                disabled={loading}
                className="h-7 text-xs gap-1"
              >
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                刷新
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {/* Stats Row */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
              <div className="rounded-lg border border-border/50 p-3 bg-muted/30">
                <div className="text-xs text-muted-foreground mb-1">总记录数</div>
                <div className="text-lg font-bold">{stats.totalRecords}</div>
              </div>
              <div className="rounded-lg border border-border/50 p-3 bg-muted/30">
                <div className="text-xs text-muted-foreground mb-1">已验证</div>
                <div className="text-lg font-bold">{stats.verifiedCount}<span className="text-xs text-muted-foreground ml-1">/ {stats.totalRecords}</span></div>
              </div>
              <div className="rounded-lg border border-border/50 p-3 bg-muted/30">
                <div className="text-xs text-muted-foreground mb-1">次日胜率</div>
                <div className={`text-lg font-bold ${stats.accuracy >= 50 ? "text-red-500" : "text-green-500"}`}>
                  {stats.accuracy.toFixed(1)}%
                </div>
              </div>
              <div className="rounded-lg border border-border/50 p-3 bg-muted/30">
                <div className="text-xs text-muted-foreground mb-1">次日均幅</div>
                <div className={`text-lg font-bold ${stats.avgNextDayChange >= 0 ? "text-red-500" : "text-green-500"}`}>
                  {stats.avgNextDayChange >= 0 ? "+" : ""}{stats.avgNextDayChange.toFixed(2)}%
                </div>
              </div>
              <div className="rounded-lg border border-border/50 p-3 bg-muted/30">
                <div className="text-xs text-muted-foreground mb-1">3日均幅</div>
                <div className={`text-lg font-bold ${stats.avgDay3Change >= 0 ? "text-red-500" : "text-green-500"}`}>
                  {stats.avgDay3Change >= 0 ? "+" : ""}{stats.avgDay3Change.toFixed(2)}%
                </div>
              </div>
              <div className="rounded-lg border border-border/50 p-3 bg-muted/30">
                <div className="text-xs text-muted-foreground mb-1">5日均幅</div>
                <div className={`text-lg font-bold ${stats.avgDay5Change >= 0 ? "text-red-500" : "text-green-500"}`}>
                  {stats.avgDay5Change >= 0 ? "+" : ""}{stats.avgDay5Change.toFixed(2)}%
                </div>
              </div>
              <div className="rounded-lg border border-border/50 p-3 bg-muted/30">
                <div className="text-xs text-muted-foreground mb-1">5日走强率</div>
                <div className={`text-lg font-bold ${stats.day5PositiveCount > stats.verifiedCount - stats.day5PositiveCount ? "text-red-500" : "text-green-500"}`}>
                  {stats.verifiedCount > 0 ? ((stats.day5PositiveCount / stats.verifiedCount) * 100).toFixed(1) : "0"}%
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Button
              variant="default"
              size="sm"
              onClick={handleVerify}
              disabled={verifying}
              className="h-8 text-xs gap-1"
            >
              {verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              验证历史记录
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualSave}
              disabled={saving}
              className="h-8 text-xs gap-1"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              手动保存当前选股
            </Button>
            <span className="text-[10px] text-muted-foreground">
              验证: 获取1/3/5日后续行情 | 保存: 立即记录当前选股结果
            </span>
          </div>

          {/* Verify Result Feedback */}
          {verifyResult && (
            <div className={`mb-3 rounded-lg border p-3 text-xs ${
              verifyResult.verified > 0
                ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                : verifyResult.skipped > 0
                ? "bg-amber-500/5 border-amber-500/20 text-amber-700 dark:text-amber-300"
                : "bg-muted/50 border-border/50 text-muted-foreground"
            }`}>
              <div className="flex items-center gap-2 font-medium mb-1">
                {verifyResult.verified > 0 ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5" />
                )}
                {verifyResult.message}
              </div>
              {verifyResult.verified > 0 && (
                <div className="text-[10px] text-muted-foreground ml-5">
                  成功验证 {verifyResult.verified} 条记录
                  {verifyResult.details.filter(d => d.status === "verified").map((d, i) => (
                    <span key={i} className="ml-2">
                      {d.recordDate} {d.sectorName}: 次日{d.avgChange >= 0 ? "+" : ""}{d.avgChange}% | 3日{d.avgDay3 >= 0 ? "+" : ""}{d.avgDay3}% | 5日{d.avgDay5 >= 0 ? "+" : ""}{d.avgDay5}%
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Sub-tabs */}
          <div className="flex items-center border border-border rounded-md overflow-hidden w-fit">
            <button
              onClick={() => setTab("records")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 ${tab === "records" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              历史记录
            </button>
            <button
              onClick={() => setTab("sector")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 ${tab === "sector" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
            >
              <PieChart className="w-3.5 h-3.5" />
              板块分析
            </button>
            <button
              onClick={() => setTab("top")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 ${tab === "top" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
            >
              <Trophy className="w-3.5 h-3.5" />
              个股排行
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Tab Content */}
      {tab === "records" && (
        <Card className="border-border/50 shadow-sm flex-1">
          <CardContent className="p-4">
            {loading && records.length === 0 ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : records.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">暂无历史选股记录</p>
                <p className="text-xs mt-1">选股结果会自动保存，也可手动保存</p>
              </div>
            ) : (
              <div className="max-h-[calc(100vh-460px)] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                {dateKeys.map((date) => (
                  <div key={date} className="mb-4">
                    <div className="flex items-center gap-2 mb-2 sticky top-0 bg-background z-10 py-1">
                      <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-sm font-semibold">{date}</span>
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                        {groupedRecords[date].length}条
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      {groupedRecords[date].map((record) => (
                        <RecordCard
                          key={record.id}
                          record={record}
                          expanded={expandedId === record.id}
                          onToggle={() => setExpandedId(expandedId === record.id ? null : record.id)}
                          onDelete={handleDelete}
                          onSelectStock={onSelectStock}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "sector" && (
        <Card className="border-border/50 shadow-sm flex-1">
          <CardContent className="p-4">
            {sortedSectorStats.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <PieChart className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">暂无板块统计数据</p>
                <p className="text-xs mt-1">验证历史记录后可查看板块表现</p>
              </div>
            ) : (
              <div className="max-h-[calc(100vh-460px)] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs h-8 py-0">排名</TableHead>
                      <TableHead className="text-xs h-8 py-0">板块</TableHead>
                      <TableHead className="text-xs h-8 py-0 text-right">记录数</TableHead>
                      <TableHead className="text-xs h-8 py-0 text-right">次日胜率</TableHead>
                      <TableHead className="text-xs h-8 py-0 text-right">次日均幅</TableHead>
                      <TableHead className="text-xs h-8 py-0 text-right">3日均幅</TableHead>
                      <TableHead className="text-xs h-8 py-0 text-right">5日均幅</TableHead>
                      <TableHead className="text-xs h-8 py-0 text-right">5日走强率</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedSectorStats.map(([name, s], idx) => {
                      const winRate = s.verified > 0 ? (s.positive / s.verified) * 100 : 0;
                      const day5WinRate = s.verified > 0 ? (s.day5Positive / s.verified) * 100 : 0;
                      return (
                        <TableRow key={name} className="hover:bg-muted/30">
                          <TableCell className="text-xs py-2">
                            {idx < 3 ? (
                              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                                idx === 0 ? "bg-amber-500/20 text-amber-600" :
                                idx === 1 ? "bg-gray-400/20 text-gray-500" :
                                "bg-orange-400/20 text-orange-500"
                              }`}>{idx + 1}</span>
                            ) : (
                              <span className="text-muted-foreground ml-1.5">{idx + 1}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs py-2 font-medium">{name}</TableCell>
                          <TableCell className="text-xs py-2 text-right text-muted-foreground">{s.count}</TableCell>
                          <TableCell className={`text-xs py-2 text-right font-mono font-medium ${winRate >= 50 ? "text-red-500" : "text-green-500"}`}>
                            {winRate.toFixed(1)}%
                          </TableCell>
                          <TableCell className={`text-xs py-2 text-right font-mono font-medium ${s.avgChange >= 0 ? "text-red-500" : "text-green-500"}`}>
                            {s.avgChange >= 0 ? "+" : ""}{s.avgChange.toFixed(2)}%
                          </TableCell>
                          <TableCell className={`text-xs py-2 text-right font-mono font-medium ${s.avgDay3 >= 0 ? "text-red-500" : "text-green-500"}`}>
                            {s.avgDay3 >= 0 ? "+" : ""}{s.avgDay3.toFixed(2)}%
                          </TableCell>
                          <TableCell className={`text-xs py-2 text-right font-mono font-medium ${s.avgDay5 >= 0 ? "text-red-500" : "text-green-500"}`}>
                            {s.avgDay5 >= 0 ? "+" : ""}{s.avgDay5.toFixed(2)}%
                          </TableCell>
                          <TableCell className={`text-xs py-2 text-right font-mono font-medium ${day5WinRate >= 50 ? "text-red-500" : "text-green-500"}`}>
                            {day5WinRate.toFixed(1)}%
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
      )}

      {tab === "top" && (
        <Card className="border-border/50 shadow-sm flex-1">
          <CardContent className="p-4">
            {topStocks.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">暂无个股排行数据</p>
                <p className="text-xs mt-1">验证历史记录后可查看个股表现排名</p>
              </div>
            ) : (
              <div className="max-h-[calc(100vh-460px)] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs h-8 py-0">排名</TableHead>
                      <TableHead className="text-xs h-8 py-0">代码</TableHead>
                      <TableHead className="text-xs h-8 py-0">名称</TableHead>
                      <TableHead className="text-xs h-8 py-0 text-right">入选</TableHead>
                      <TableHead className="text-xs h-8 py-0 text-right">次日均幅</TableHead>
                      <TableHead className="text-xs h-8 py-0 text-right">次日胜率</TableHead>
                      <TableHead className="text-xs h-8 py-0 text-right">3日均幅</TableHead>
                      <TableHead className="text-xs h-8 py-0 text-right">5日均幅</TableHead>
                      <TableHead className="text-xs h-8 py-0 text-right">5日走强率</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topStocks.map((stock, idx) => {
                      const verified = stock.nextDayChanges.length;
                      const wins = stock.nextDayChanges.filter(c => c > 0).length;
                      const winRate = verified > 0 ? (wins / verified) * 100 : 0;
                      const day3Verified = stock.day3Changes.length;
                      const day3Wins = stock.day3Changes.filter(c => c > 0).length;
                      const avgDay3 = day3Verified > 0 ? stock.day3Changes.reduce((a, b) => a + b, 0) / day3Verified : 0;
                      const day5Verified = stock.day5Changes.length;
                      const day5Wins = stock.day5Changes.filter(c => c > 0).length;
                      const avgDay5 = day5Verified > 0 ? stock.day5Changes.reduce((a, b) => a + b, 0) / day5Verified : 0;
                      const day5WinRate = day5Verified > 0 ? (day5Wins / day5Verified) * 100 : 0;
                      return (
                        <TableRow
                          key={stock.symbol}
                          className="hover:bg-muted/30 cursor-pointer"
                          onClick={() => onSelectStock?.(stock.symbol)}
                        >
                          <TableCell className="text-xs py-2">
                            {idx < 3 ? (
                              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                                idx === 0 ? "bg-amber-500/20 text-amber-600" :
                                idx === 1 ? "bg-gray-400/20 text-gray-500" :
                                "bg-orange-400/20 text-orange-500"
                              }`}>{idx + 1}</span>
                            ) : (
                              <span className="text-muted-foreground ml-1.5">{idx + 1}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs py-2 font-mono">{stock.symbol}</TableCell>
                          <TableCell className="text-xs py-2 font-medium">{stock.name}</TableCell>
                          <TableCell className="text-xs py-2 text-right">
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-blue-500/5 border-blue-500/20 text-blue-600">
                              {stock.appearances}次
                            </Badge>
                          </TableCell>
                          <TableCell className={`text-xs py-2 text-right font-mono font-medium ${stock.avgChange >= 0 ? "text-red-500" : "text-green-500"}`}>
                            {stock.avgChange >= 0 ? "+" : ""}{stock.avgChange.toFixed(2)}%
                          </TableCell>
                          <TableCell className={`text-xs py-2 text-right font-mono ${winRate >= 50 ? "text-red-500" : "text-green-500"}`}>
                            {verified > 0 ? `${winRate.toFixed(0)}%` : "--"}
                          </TableCell>
                          <TableCell className={`text-xs py-2 text-right font-mono font-medium ${avgDay3 >= 0 ? "text-red-500" : "text-green-500"}`}>
                            {day3Verified > 0 ? `${avgDay3 >= 0 ? "+" : ""}${avgDay3.toFixed(2)}%` : "--"}
                          </TableCell>
                          <TableCell className={`text-xs py-2 text-right font-mono font-medium ${avgDay5 >= 0 ? "text-red-500" : "text-green-500"}`}>
                            {day5Verified > 0 ? `${avgDay5 >= 0 ? "+" : ""}${avgDay5.toFixed(2)}%` : "--"}
                          </TableCell>
                          <TableCell className={`text-xs py-2 text-right font-mono ${day5WinRate >= 50 ? "text-red-500" : "text-green-500"}`}>
                            {day5Verified > 0 ? `${day5WinRate.toFixed(0)}%` : "--"}
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
      )}
    </div>
  );
}

// ── Record Card ────────────────────────────────────────

function RecordCard({
  record,
  expanded,
  onToggle,
  onDelete,
  onSelectStock,
}: {
  record: HistoryRecord;
  expanded: boolean;
  onToggle: () => void;
  onDelete: (id: string) => void;
  onSelectStock?: (symbol: string) => void;
}) {
  const isPositive = record.avgNextDayChange > 0;
  const nextDayChanges = record.nextDayChanges || {};
  const day3Changes = record.day3Changes || {};
  const day5Changes = record.day5Changes || {};
  const screenerLabel = SCREENER_TYPE_LABELS[record.screenerType] || record.screenerType;

  // Compute per-record stock stats
  const verifiedStocks = Object.values(nextDayChanges);
  const stockWinCount = verifiedStocks.filter(c => c > 0).length;
  const stockWinRate = verifiedStocks.length > 0 ? (stockWinCount / verifiedStocks.length) * 100 : 0;

  // 5-day "走强" rate
  const day5Values = Object.values(day5Changes);
  const day5WinCount = day5Values.filter(c => c > 0).length;
  const day5WinRate = day5Values.length > 0 ? (day5WinCount / day5Values.length) * 100 : 0;

  return (
    <div className="rounded-lg border border-border/50 overflow-hidden">
      {/* Header Row */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-blue-500/5 border-blue-500/20 text-blue-600 dark:text-blue-300 shrink-0">
          <Clock className="w-2.5 h-2.5 mr-0.5" />
          {record.recordTime}
        </Badge>
        <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-purple-500/5 border-purple-500/20 text-purple-600 dark:text-purple-300 shrink-0">
          {screenerLabel}
        </Badge>
        <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-300 shrink-0">
          {record.sectorName}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {record.stockCount}只
        </span>
        <div className="ml-auto flex items-center gap-2">
          {record.isVerified ? (
            <>
              <Badge
                variant="outline"
                className={`text-[10px] py-0 px-1.5 ${
                  isPositive
                    ? "bg-red-500/5 border-red-500/20 text-red-600"
                    : "bg-green-500/5 border-green-500/20 text-green-600"
                }`}
              >
                {isPositive ? <ArrowUpRight className="w-2.5 h-2.5 mr-0.5" /> : <ArrowDownRight className="w-2.5 h-2.5 mr-0.5" />}
                次日{isPositive ? "+" : ""}{record.avgNextDayChange.toFixed(2)}%
              </Badge>
              {record.avgDay5Change !== 0 && (
                <Badge
                  variant="outline"
                  className={`text-[10px] py-0 px-1.5 ${
                    record.avgDay5Change > 0
                      ? "bg-amber-500/5 border-amber-500/20 text-amber-600"
                      : "bg-muted/50 text-muted-foreground"
                  }`}
                >
                  <BarChart3 className="w-2.5 h-2.5 mr-0.5" />
                  5日{record.avgDay5Change > 0 ? "+" : ""}{record.avgDay5Change.toFixed(2)}%
                </Badge>
              )}
              {verifiedStocks.length > 0 && (
                <Badge
                  variant="outline"
                  className={`text-[10px] py-0 px-1.5 ${
                    stockWinRate >= 50
                      ? "bg-amber-500/5 border-amber-500/20 text-amber-600"
                      : "bg-muted/50 text-muted-foreground"
                  }`}
                >
                  <Target className="w-2.5 h-2.5 mr-0.5" />
                  胜率{stockWinRate.toFixed(0)}%
                </Badge>
              )}
            </>
          ) : (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-muted/50 text-muted-foreground">
              待验证
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); onDelete(record.id); }}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      </div>

      {/* Expanded Detail */}
      {expanded && record.stocks.length > 0 && (
        <div className="border-t border-border/50 px-3 py-2 bg-muted/10">
          {/* Summary bar for verified records */}
          {record.isVerified && verifiedStocks.length > 0 && (
            <div className="flex items-center gap-3 mb-2 px-1 py-1.5 rounded bg-background/50 border border-border/30 text-[10px] flex-wrap">
              <span className="text-muted-foreground">验证概要:</span>
              <span className="text-red-500 flex items-center gap-0.5"><ArrowUpRight className="w-2.5 h-2.5" />{stockWinCount}涨</span>
              <span className="text-green-500 flex items-center gap-0.5"><ArrowDownRight className="w-2.5 h-2.5" />{verifiedStocks.length - stockWinCount}跌</span>
              <span className="text-muted-foreground">|</span>
              <span>次日胜率<span className={stockWinRate >= 50 ? "text-amber-600" : "text-muted-foreground"}>{stockWinRate.toFixed(0)}%</span></span>
              {day5Values.length > 0 && (
                <>
                  <span className="text-muted-foreground">|</span>
                  <span>5日走强率<span className={day5WinRate >= 50 ? "text-amber-600" : "text-muted-foreground"}>{day5WinRate.toFixed(0)}%</span></span>
                  <span className="text-muted-foreground">|</span>
                  <span>3日均<span className={record.avgDay3Change >= 0 ? "text-red-500" : "text-green-500"}>{record.avgDay3Change >= 0 ? "+" : ""}{record.avgDay3Change.toFixed(2)}%</span></span>
                  <span>5日均<span className={record.avgDay5Change >= 0 ? "text-red-500" : "text-green-500"}>{record.avgDay5Change >= 0 ? "+" : ""}{record.avgDay5Change.toFixed(2)}%</span></span>
                </>
              )}
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-[10px] h-7 py-0 w-24">代码</TableHead>
                <TableHead className="text-[10px] h-7 py-0">名称</TableHead>
                <TableHead className="text-[10px] h-7 py-0 text-right w-20">当时涨幅</TableHead>
                <TableHead className="text-[10px] h-7 py-0 text-right w-20">综合评分</TableHead>
                {record.isVerified && (
                  <>
                    <TableHead className="text-[10px] h-7 py-0 text-right w-20">次日</TableHead>
                    <TableHead className="text-[10px] h-7 py-0 text-right w-20">3日</TableHead>
                    <TableHead className="text-[10px] h-7 py-0 text-right w-20">5日</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {record.stocks.map((stock) => {
                const nextChange = nextDayChanges[stock.symbol];
                const day3Change = day3Changes[stock.symbol];
                const day5Change = day5Changes[stock.symbol];
                return (
                  <TableRow
                    key={stock.symbol}
                    className="hover:bg-muted/30 cursor-pointer"
                    onClick={() => onSelectStock?.(stock.symbol)}
                  >
                    <TableCell className="text-xs py-1 font-mono">{stock.symbol}</TableCell>
                    <TableCell className="text-xs py-1">{stock.name}</TableCell>
                    <TableCell className={`text-xs py-1 text-right font-mono ${stock.changePercent >= 0 ? "text-red-500" : "text-green-500"}`}>
                      {stock.changePercent >= 0 ? "+" : ""}{stock.changePercent?.toFixed(2) ?? "--"}%
                    </TableCell>
                    <TableCell className="text-xs py-1 text-right font-mono">
                      {stock.compositeScore != null ? (
                        <span className={stock.compositeScore >= 50 ? "text-orange-500" : "text-muted-foreground"}>
                          {stock.compositeScore}
                        </span>
                      ) : "--"}
                    </TableCell>
                    {record.isVerified && (
                      <>
                        <TableCell className={`text-xs py-1 text-right font-mono font-medium ${getChangeColor(nextChange)}`}>
                          {formatChange(nextChange)}
                        </TableCell>
                        <TableCell className={`text-xs py-1 text-right font-mono font-medium ${getChangeColor(day3Change)}`}>
                          {formatChange(day3Change)}
                        </TableCell>
                        <TableCell className={`text-xs py-1 text-right font-mono font-medium ${getChangeColor(day5Change)}`}>
                          {formatChange(day5Change)}
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──

function getChangeColor(change: number | undefined): string {
  if (change == null) return "text-muted-foreground";
  if (change > 0) return "text-red-500";
  if (change < 0) return "text-green-500";
  return "text-muted-foreground";
}

function formatChange(change: number | undefined): React.ReactNode {
  if (change == null) return <span className="flex items-center justify-end gap-0.5"><AlertTriangle className="w-2.5 h-2.5" />--</span>;
  return (
    <span className="flex items-center justify-end gap-0.5">
      {change > 0 ? <ArrowUpRight className="w-2.5 h-2.5" /> :
       change < 0 ? <ArrowDownRight className="w-2.5 h-2.5" /> : null}
      {change > 0 ? "+" : ""}{change.toFixed(2)}%
    </span>
  );
}
