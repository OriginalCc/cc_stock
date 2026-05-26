"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  BookOpen,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Trash2,
} from "lucide-react";

// ── Data Model ──

interface TTradeRecord {
  id: string;
  symbol: string;
  stockName: string;
  date: string; // YYYY-MM-DD
  type: "正T" | "反T(先卖再买)";
  entryTime: string; // HH:MM
  entryPrice: number;
  exitTime: string; // HH:MM (empty if still open)
  exitPrice: number; // 0 if still open
  quantity: number; // 股数
  status: "open" | "closed";
  profit: number;
  profitPct: number;
  notes: string;
}

interface TTradeJournalProps {
  symbol: string;
  stockName?: string;
  currentPrice?: number;
}

// ── Helpers ──

function getChinaDateStr(): string {
  const now = new Date();
  const chinaOffset = 8 * 60;
  const chinaTime = new Date(now.getTime() + (chinaOffset + now.getTimezoneOffset()) * 60000);
  const y = chinaTime.getFullYear();
  const m = String(chinaTime.getMonth() + 1).padStart(2, "0");
  const d = String(chinaTime.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getChinaTimeStr(): string {
  const now = new Date();
  const chinaOffset = 8 * 60;
  const chinaTime = new Date(now.getTime() + (chinaOffset + now.getTimezoneOffset()) * 60000);
  const h = String(chinaTime.getHours()).padStart(2, "0");
  const m = String(chinaTime.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function calcProfit(
  type: "正T" | "反T(先卖再买)",
  entryPrice: number,
  exitPrice: number,
  quantity: number
): { profit: number; profitPct: number } {
  if (entryPrice <= 0 || exitPrice <= 0 || quantity <= 0) {
    return { profit: 0, profitPct: 0 };
  }
  let profit: number;
  if (type === "正T") {
    profit = (exitPrice - entryPrice) * quantity;
  } else {
    profit = (entryPrice - exitPrice) * quantity;
  }
  const profitPct = ((profit) / (entryPrice * quantity)) * 100;
  return { profit: Number(profit.toFixed(2)), profitPct: Number(profitPct.toFixed(2)) };
}

function getStorageKey(symbol: string): string {
  return `t-trade-journal-${symbol}`;
}

function loadTrades(symbol: string): TTradeRecord[] {
  try {
    const raw = localStorage.getItem(getStorageKey(symbol));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTrades(symbol: string, trades: TTradeRecord[]): void {
  try {
    localStorage.setItem(getStorageKey(symbol), JSON.stringify(trades));
  } catch {
    // storage full, ignore
  }
}

function loadSummary(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem("t-trade-journal-summary");
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveSummary(summary: Record<string, unknown>): void {
  try {
    localStorage.setItem("t-trade-journal-summary", JSON.stringify(summary));
  } catch {
    // ignore
  }
}

function formatMoney(val: number): string {
  const v = val ?? 0;
  if (v >= 0) return `+¥${v.toFixed(2)}`;
  return `-¥${Math.abs(v).toFixed(2)}`;
}

function formatPct(val: number): string {
  const v = val ?? 0;
  if (v >= 0) return `+${v.toFixed(2)}%`;
  return `${v.toFixed(2)}%`;
}

// ── Component ──

export const TTradeJournal = React.memo(function TTradeJournal({
  symbol,
  stockName,
  currentPrice,
}: TTradeJournalProps) {
  const [trades, setTrades] = useState<TTradeRecord[]>([]);
  const [mounted, setMounted] = useState(false);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [entryMode, setEntryMode] = useState<"buy" | "sell">("buy");
  const [statsExpanded, setStatsExpanded] = useState(false);
  const [expandedTradeId, setExpandedTradeId] = useState<string | null>(null);

  // Form state
  const [formType, setFormType] = useState<"正T" | "反T(先卖再买)">("正T");
  const [formQuantity, setFormQuantity] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formNotes, setFormNotes] = useState("");

  // Load trades from localStorage
  useEffect(() => {
    const data = loadTrades(symbol);
    queueMicrotask(() => {
      setTrades(data);
      setMounted(true);
    });
  }, [symbol]);

  // Save trades to localStorage whenever they change
  useEffect(() => {
    if (!mounted) return;
    saveTrades(symbol, trades);
    // Update summary
    const summary = loadSummary();
    summary[`${symbol}-lastUpdate`] = Date.now();
    saveSummary(summary);
  }, [trades, symbol, mounted]);

  // ── Derived data ──

  const todayStr = useMemo(() => getChinaDateStr(), []);

  const todayTrades = useMemo(
    () => trades.filter((t) => t.date === todayStr),
    [trades, todayStr]
  );

  const todayClosedTrades = useMemo(
    () => todayTrades.filter((t) => t.status === "closed"),
    [todayTrades]
  );

  const todayOpenTrades = useMemo(
    () => todayTrades.filter((t) => t.status === "open"),
    [todayTrades]
  );

  const todayTradeCount = todayClosedTrades.length;

  const todayWinCount = useMemo(
    () => todayClosedTrades.filter((t) => t.profit > 0).length,
    [todayClosedTrades]
  );

  const todayWinRate =
    todayClosedTrades.length > 0
      ? Math.round((todayWinCount / todayClosedTrades.length) * 100)
      : 0;

  const todayProfit = useMemo(
    () => todayClosedTrades.reduce((sum, t) => sum + t.profit, 0),
    [todayClosedTrades]
  );

  // Unrealized P&L for open trades
  const unrealizedProfit = useMemo(() => {
    if (!currentPrice || currentPrice <= 0) return 0;
    return todayOpenTrades.reduce((sum, t) => {
      const { profit } = calcProfit(t.type, t.entryPrice, currentPrice, t.quantity);
      return sum + profit;
    }, 0);
  }, [todayOpenTrades, currentPrice]);

  // Last 5 trading days stats
  const last5DayStats = useMemo(() => {
    // Get unique dates sorted desc, take up to 5
    const dates = [...new Set(trades.filter((t) => t.status === "closed").map((t) => t.date))].sort(
      (a, b) => b.localeCompare(a)
    );
    const last5 = dates.slice(0, 5);
    let winCount = 0;
    let totalClosed = 0;
    let totalProfit = 0;
    for (const date of last5) {
      const dayClosed = trades.filter((t) => t.date === date && t.status === "closed");
      totalClosed += dayClosed.length;
      winCount += dayClosed.filter((t) => t.profit > 0).length;
      totalProfit += dayClosed.reduce((sum, t) => sum + t.profit, 0);
    }
    return {
      winRate: totalClosed > 0 ? Math.round((winCount / totalClosed) * 100) : 0,
      profit: Number(totalProfit.toFixed(2)),
      days: last5.length,
    };
  }, [trades]);

  // Best trading time slot (based on winning trades)
  const bestTimeSlot = useMemo(() => {
    const winningTrades = trades.filter((t) => t.status === "closed" && t.profit > 0);
    if (winningTrades.length === 0) return null;

    // Group by 30-min slots
    const slotCounts: Record<string, number> = {};
    for (const t of winningTrades) {
      const [h, m] = t.entryTime.split(":").map(Number);
      const slotStart = m < 30 ? `${String(h).padStart(2, "0")}:00` : `${String(h).padStart(2, "0")}:30`;
      const slotEnd = m < 30 ? `${String(h).padStart(2, "0")}:30` : `${String(h + 1).padStart(2, "0")}:00`;
      const slot = `${slotStart}-${slotEnd}`;
      slotCounts[slot] = (slotCounts[slot] || 0) + 1;
    }

    const bestSlot = Object.entries(slotCounts).sort((a, b) => b[1] - a[1])[0];
    return bestSlot ? bestSlot[0] : null;
  }, [trades]);

  // Average T-trade profit percentage
  const avgProfitPct = useMemo(() => {
    const closedTrades = trades.filter((t) => t.status === "closed");
    if (closedTrades.length === 0) return 0;
    const avg = closedTrades.reduce((sum, t) => sum + t.profitPct, 0) / closedTrades.length;
    return Number(avg.toFixed(2));
  }, [trades]);

  // ── Actions ──

  const openEntryForm = useCallback(
    (mode: "buy" | "sell") => {
      setEntryMode(mode);
      // Smart default: if clicking "buy" and there's an open 反T trade, suggest closing it
      if (mode === "buy") {
        const openReverseT = todayOpenTrades.find((t) => t.type === "反T(先卖再买)");
        if (openReverseT) {
          // Suggest closing, but don't force - just pre-fill form type
          setFormType("反T(先卖再买)");
        } else {
          setFormType("正T");
        }
      } else {
        const openNormalT = todayOpenTrades.find((t) => t.type === "正T");
        if (openNormalT) {
          setFormType("正T");
        } else {
          setFormType("反T(先卖再买)");
        }
      }
      setFormPrice(currentPrice ? String(currentPrice.toFixed(2)) : "");
      setFormQuantity("");
      setFormNotes("");
      setShowEntryForm(true);
    },
    [currentPrice, todayOpenTrades]
  );

  const closeEntryForm = useCallback(() => {
    setShowEntryForm(false);
  }, []);

  const submitTrade = useCallback(() => {
    const price = parseFloat(formPrice);
    const qty = parseInt(formQuantity, 10);

    if (isNaN(price) || price <= 0) return;
    if (isNaN(qty) || qty <= 0) return;

    const nowTime = getChinaTimeStr();
    const newTrade: TTradeRecord = {
      id: generateId(),
      symbol,
      stockName: stockName || symbol,
      date: todayStr,
      type: formType,
      entryTime: nowTime,
      entryPrice: price,
      exitTime: "",
      exitPrice: 0,
      quantity: qty,
      status: "open",
      profit: 0,
      profitPct: 0,
      notes: formNotes.trim(),
    };

    setTrades((prev) => [newTrade, ...prev]);
    setShowEntryForm(false);
    setFormQuantity("");
    setFormNotes("");
  }, [formPrice, formQuantity, formType, formNotes, symbol, stockName, todayStr]);

  const closeTrade = useCallback(
    (tradeId: string) => {
      const closePrice = currentPrice || 0;
      if (closePrice <= 0) return;

      setTrades((prev) =>
        prev.map((t) => {
          if (t.id !== tradeId) return t;
          const { profit, profitPct } = calcProfit(t.type, t.entryPrice, closePrice, t.quantity);
          return {
            ...t,
            exitTime: getChinaTimeStr(),
            exitPrice: closePrice,
            status: "closed" as const,
            profit,
            profitPct,
          };
        })
      );
    },
    [currentPrice]
  );

  const deleteTrade = useCallback((tradeId: string) => {
    setTrades((prev) => prev.filter((t) => t.id !== tradeId));
  }, []);

  // ── Render helpers ──

  const profitColor = (val: number) =>
    val > 0 ? "text-red-500" : val < 0 ? "text-green-500" : "text-muted-foreground";

  const profitBg = (val: number) =>
    val > 0 ? "bg-red-500/10" : val < 0 ? "bg-green-500/10" : "bg-muted/50";

  if (!mounted) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            做T交易记录
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="h-20 flex items-center justify-center">
            <span className="text-xs text-muted-foreground animate-pulse">加载中...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            做T交易记录
            {stockName && (
              <span className="text-muted-foreground font-normal text-xs">· {stockName}</span>
            )}
            {todayTradeCount > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                今日 {todayTradeCount} 笔
              </Badge>
            )}
          </CardTitle>
          {todayTradeCount >= 2 && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 border-amber-500/50 text-amber-600"
            >
              <AlertTriangle className="w-3 h-3 mr-0.5" />
              达上限
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {/* ── Quick Entry Section ── */}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-8 text-xs gap-1 border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-red-800 dark:hover:bg-red-950"
            onClick={() => openEntryForm("buy")}
          >
            <Plus className="w-3 h-3" />
            记录买入
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-8 text-xs gap-1 border-green-200 hover:bg-green-50 hover:text-green-600 dark:border-green-800 dark:hover:bg-green-950"
            onClick={() => openEntryForm("sell")}
          >
            <Plus className="w-3 h-3" />
            记录卖出
          </Button>
        </div>

        {/* ── Daily Limit Warning ── */}
        {todayTradeCount >= 2 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="text-[11px] text-amber-700 dark:text-amber-400">
              今日做T已达上限，规则建议不超过2次
            </span>
          </div>
        )}

        {/* ── Entry Form ── */}
        {showEntryForm && (
          <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">
                {entryMode === "buy" ? "🟢 记录买入" : "🔴 记录卖出"}
              </span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={closeEntryForm}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* Type selector */}
            <div className="flex gap-1.5">
              <button
                onClick={() => setFormType("正T")}
                className={`flex-1 text-[11px] py-1.5 rounded-md border transition-colors ${
                  formType === "正T"
                    ? "bg-red-500/15 border-red-500/30 text-red-600 dark:text-red-400 font-medium"
                    : "border-border text-muted-foreground hover:border-border/80"
                }`}
              >
                正T（先买后卖）
              </button>
              <button
                onClick={() => setFormType("反T(先卖再买)")}
                className={`flex-1 text-[11px] py-1.5 rounded-md border transition-colors ${
                  formType === "反T(先卖再买)"
                    ? "bg-green-500/15 border-green-500/30 text-green-600 dark:text-green-400 font-medium"
                    : "border-border text-muted-foreground hover:border-border/80"
                }`}
              >
                反T（先卖再买）
              </button>
            </div>

            {/* Smart suggestion: if clicking buy and there's an open 反T, suggest closing */}
            {entryMode === "buy" &&
              todayOpenTrades.some((t) => t.type === "反T(先卖再买)") && (
                <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-blue-500/10 border border-blue-500/20">
                  <CheckCircle2 className="w-3 h-3 text-blue-500 shrink-0" />
                  <span className="text-[10px] text-blue-600 dark:text-blue-400">
                    有未平仓的反T记录，建议先平仓再开新仓
                  </span>
                </div>
              )}
            {entryMode === "sell" &&
              todayOpenTrades.some((t) => t.type === "正T") && (
                <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-blue-500/10 border border-blue-500/20">
                  <CheckCircle2 className="w-3 h-3 text-blue-500 shrink-0" />
                  <span className="text-[10px] text-blue-600 dark:text-blue-400">
                    有未平仓的正T记录，建议先平仓再开新仓
                  </span>
                </div>
              )}

            {/* Price & Quantity */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">价格</label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">股数</label>
                <Input
                  type="number"
                  step="100"
                  placeholder="100"
                  value={formQuantity}
                  onChange={(e) => setFormQuantity(e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">备注（可选）</label>
              <Input
                placeholder="记录交易理由..."
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                className="h-7 text-xs"
              />
            </div>

            {/* Submit */}
            <Button
              size="sm"
              className="w-full h-7 text-xs"
              onClick={submitTrade}
              disabled={!formPrice || parseFloat(formPrice) <= 0 || !formQuantity || parseInt(formQuantity, 10) <= 0}
            >
              <Plus className="w-3 h-3 mr-1" />
              确认记录
            </Button>
          </div>
        )}

        {/* ── Today's Trades ── */}
        <div className="space-y-1.5">
          {todayTrades.length === 0 && !showEntryForm && (
            <div className="py-6 text-center">
              <BookOpen className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">
                还没有做T记录，点击上方按钮开始记录你的做T交易
              </p>
            </div>
          )}

          {todayTrades.map((trade) => {
            const isOpen = trade.status === "open";
            const unrealized =
              isOpen && currentPrice && currentPrice > 0
                ? calcProfit(trade.type, trade.entryPrice, currentPrice, trade.quantity)
                : null;
            const displayProfit = isOpen ? unrealized?.profit ?? 0 : trade.profit;
            const displayPct = isOpen ? unrealized?.profitPct ?? 0 : trade.profitPct;
            const isExpanded = expandedTradeId === trade.id;

            return (
              <div
                key={trade.id}
                className={`rounded-lg border transition-colors ${
                  isOpen ? "border-amber-500/30 bg-amber-500/5" : "border-border/50"
                }`}
              >
                {/* Trade row */}
                <button
                  className="w-full text-left px-3 py-2 flex items-center gap-2"
                  onClick={() => setExpandedTradeId(isExpanded ? null : trade.id)}
                >
                  {/* Type badge */}
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 shrink-0 ${
                      trade.type === "正T"
                        ? "border-red-500/30 text-red-600 dark:text-red-400"
                        : "border-green-500/30 text-green-600 dark:text-green-400"
                    }`}
                  >
                    {trade.type === "正T" ? "正T" : "反T"}
                  </Badge>

                  {/* Price info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 text-[11px]">
                      <span className="font-mono">{(trade.entryPrice ?? 0).toFixed(2)}</span>
                      <span className="text-muted-foreground">→</span>
                      {isOpen ? (
                        <span className="text-muted-foreground italic">
                          {currentPrice?.toFixed(2) ?? "..."}
                        </span>
                      ) : (
                        <span className="font-mono">{(trade.exitPrice ?? 0).toFixed(2)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <Clock className="w-2.5 h-2.5" />
                      {trade.entryTime}
                      {!isOpen && trade.exitTime && <span>→ {trade.exitTime}</span>}
                      <span>· {trade.quantity}股</span>
                    </div>
                  </div>

                  {/* Profit */}
                  <div className="text-right shrink-0">
                    <div className={`text-[11px] font-medium font-mono ${profitColor(displayProfit)}`}>
                      {formatMoney(displayProfit)}
                    </div>
                    <div className={`text-[10px] font-mono ${profitColor(displayPct)}`}>
                      {formatPct(displayPct)}
                    </div>
                  </div>

                  {/* Status indicator */}
                  {isOpen && (
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
                  )}
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-3 pb-2 space-y-2 border-t border-border/30 pt-2">
                    {/* Notes */}
                    {trade.notes && (
                      <div className="text-[11px] text-muted-foreground">
                        📝 {trade.notes}
                      </div>
                    )}

                    {/* Detailed info */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                      <div>
                        <span className="text-muted-foreground">入场价：</span>
                        <span className="font-mono">{(trade.entryPrice ?? 0).toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">入场时间：</span>
                        <span className="font-mono">{trade.entryTime}</span>
                      </div>
                      {!isOpen && (
                        <>
                          <div>
                            <span className="text-muted-foreground">出场价：</span>
                            <span className="font-mono">{(trade.exitPrice ?? 0).toFixed(2)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">出场时间：</span>
                            <span className="font-mono">{trade.exitTime}</span>
                          </div>
                        </>
                      )}
                      {isOpen && currentPrice && currentPrice > 0 && (
                        <>
                          <div>
                            <span className="text-muted-foreground">当前价：</span>
                            <span className="font-mono">{currentPrice?.toFixed(2) ?? "--"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">浮动盈亏：</span>
                            <span className={`font-mono ${profitColor(unrealized?.profit ?? 0)}`}>
                              {formatMoney(unrealized?.profit ?? 0)}
                            </span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      {isOpen && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[10px] gap-1 flex-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            closeTrade(trade.id);
                          }}
                          disabled={!currentPrice || currentPrice <= 0}
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          按现价平仓
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[10px] gap-1 text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteTrade(trade.id);
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                        删除
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Statistics Dashboard (collapsible) ── */}
        <div className="border-t border-border/30 pt-2">
          <button
            className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
            onClick={() => setStatsExpanded(!statsExpanded)}
          >
            <span className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              做T统计
              {todayClosedTrades.length > 0 && (
                <span className={`font-mono text-[10px] ${profitColor(todayProfit)}`}>
                  ({formatMoney(todayProfit)})
                </span>
              )}
            </span>
            {statsExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {statsExpanded && (
            <div className="mt-2 space-y-2">
              {/* Today's stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2 rounded-md bg-muted/30 text-center">
                  <div className="text-[10px] text-muted-foreground mb-0.5">今日做T</div>
                  <div className="text-sm font-semibold">
                    {todayTradeCount}
                    <span className="text-[10px] text-muted-foreground font-normal">/2</span>
                  </div>
                </div>
                <div className="p-2 rounded-md bg-muted/30 text-center">
                  <div className="text-[10px] text-muted-foreground mb-0.5">今日胜率</div>
                  <div className="text-sm font-semibold">{todayWinRate}%</div>
                  {todayClosedTrades.length > 0 && (
                    <Progress value={todayWinRate} className="h-1 mt-1" />
                  )}
                </div>
                <div className={`p-2 rounded-md text-center ${profitBg(todayProfit)}`}>
                  <div className="text-[10px] text-muted-foreground mb-0.5">今日盈亏</div>
                  <div className={`text-sm font-semibold font-mono ${profitColor(todayProfit)}`}>
                    {formatMoney(todayProfit)}
                  </div>
                </div>
              </div>

              {/* Unrealized P&L */}
              {todayOpenTrades.length > 0 && currentPrice && currentPrice > 0 && (
                <div className={`p-2 rounded-md flex items-center justify-between ${profitBg(unrealizedProfit)}`}>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    未平仓浮动
                  </span>
                  <span className={`text-xs font-semibold font-mono ${profitColor(unrealizedProfit)}`}>
                    {formatMoney(unrealizedProfit)}
                  </span>
                </div>
              )}

              {/* Last 5 days stats */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded-md bg-muted/30 text-center">
                  <div className="text-[10px] text-muted-foreground mb-0.5">
                    近{last5DayStats.days}日胜率
                  </div>
                  <div className="text-sm font-semibold">{last5DayStats.winRate}%</div>
                  {last5DayStats.days > 0 && (
                    <Progress value={last5DayStats.winRate} className="h-1 mt-1" />
                  )}
                </div>
                <div className={`p-2 rounded-md text-center ${profitBg(last5DayStats.profit)}`}>
                  <div className="text-[10px] text-muted-foreground mb-0.5">
                    近{last5DayStats.days}日盈亏
                  </div>
                  <div className={`text-sm font-semibold font-mono ${profitColor(last5DayStats.profit)}`}>
                    {formatMoney(last5DayStats.profit)}
                  </div>
                </div>
              </div>

              {/* Best time slot & Avg profit */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded-md bg-muted/30 text-center">
                  <div className="text-[10px] text-muted-foreground mb-0.5">最佳时段</div>
                  <div className="text-[11px] font-semibold font-mono">
                    {bestTimeSlot || "—"}
                  </div>
                </div>
                <div className="p-2 rounded-md bg-muted/30 text-center">
                  <div className="text-[10px] text-muted-foreground mb-0.5">平均利润</div>
                  <div className={`text-[11px] font-semibold font-mono ${profitColor(avgProfitPct)}`}>
                    {avgProfitPct !== 0 ? formatPct(avgProfitPct) : "—"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
});
