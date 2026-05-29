"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { TrendingUp, TrendingDown, RefreshCw } from "lucide-react";

// ── Types ──

interface SectorRankItem {
  code: string;
  name: string;
  changePercent: number;
  mainNetInflow: number;
  stocksUp: number;
  stocksDown: number;
  leadingStock: string;
  leadingStockChange: number;
}

interface SectorTopBottomData {
  success: boolean;
  timestamp: string;
  industry: {
    top5: SectorRankItem[];
    bottom5: SectorRankItem[];
  };
  concept: {
    top5: SectorRankItem[];
    bottom5: SectorRankItem[];
  };
}

// ── Helpers ──

const UP_COLOR = "#dc2626";
const DOWN_COLOR = "#059669";

function formatPct(v: number): string {
  return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
}

function formatInflow(v: number): string {
  const yi = v / 1e8;
  if (Math.abs(yi) >= 1) return yi.toFixed(1) + "亿";
  const wan = v / 1e4;
  if (Math.abs(wan) >= 1) return wan.toFixed(0) + "万";
  return v.toFixed(0);
}

// ── Tab type ──
type TabType = "industry" | "concept";

// ── Component ──

export function SectorTopBottomCard() {
  const [data, setData] = useState<SectorTopBottomData | null>(null);
  const [tab, setTab] = useState<TabType>("industry");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/stock/sector-top-bottom", {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success) {
        setData(json);
        setError(null);
      } else {
        throw new Error(json.error || "Unknown error");
      }
    } catch (e: any) {
      console.error("SectorTopBottom fetch error:", e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + 30s polling
  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, 30000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  const currentData = tab === "industry" ? data?.industry : data?.concept;

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      {/* Header */}
      <div className="px-3 pt-2.5 pb-1.5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-semibold text-foreground/80">板块涨跌排行</span>
          <div className="flex items-center gap-1">
            {loading && (
              <RefreshCw className="w-3 h-3 text-muted-foreground animate-spin" />
            )}
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 mb-1">
          <button
            onClick={() => setTab("industry")}
            className={`text-[10px] font-bold px-2 py-0.5 rounded transition-colors ${
              tab === "industry"
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground/80"
            }`}
          >
            行业板块
          </button>
          <button
            onClick={() => setTab("concept")}
            className={`text-[10px] font-bold px-2 py-0.5 rounded transition-colors ${
              tab === "concept"
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground/80"
            }`}
          >
            概念板块
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-3 pb-2.5">
        {error && !data ? (
          <div className="text-[10px] text-muted-foreground text-center py-4">
            加载失败，等待重试...
          </div>
        ) : !currentData ? (
          <div className="text-[10px] text-muted-foreground text-center py-4 animate-pulse">
            加载中...
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {/* 涨幅前五 */}
            <div>
              <div className="flex items-center gap-0.5 mb-1">
                <TrendingUp className="w-3 h-3" style={{ color: UP_COLOR }} />
                <span className="text-[10px] font-bold" style={{ color: UP_COLOR }}>
                  涨幅前5
                </span>
              </div>
              <div className="space-y-0.5">
                {currentData.top5.map((sector, i) => (
                  <SectorRow key={`top-${sector.code}-${i}`} sector={sector} rank={i + 1} isUp />
                ))}
              </div>
            </div>

            {/* 跌幅前五 */}
            <div>
              <div className="flex items-center gap-0.5 mb-1">
                <TrendingDown className="w-3 h-3" style={{ color: DOWN_COLOR }} />
                <span className="text-[10px] font-bold" style={{ color: DOWN_COLOR }}>
                  跌幅前5
                </span>
              </div>
              <div className="space-y-0.5">
                {currentData.bottom5.map((sector, i) => (
                  <SectorRow key={`bottom-${sector.code}-${i}`} sector={sector} rank={i + 1} isUp={false} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sector Row ──

function SectorRow({ sector, rank, isUp }: { sector: SectorRankItem; rank: number; isUp: boolean }) {
  const pctColor = isUp ? UP_COLOR : DOWN_COLOR;
  const inflowColor = sector.mainNetInflow >= 0 ? UP_COLOR : DOWN_COLOR;
  const inflowPrefix = sector.mainNetInflow >= 0 ? "+" : "";

  // Rank badge colors
  const rankBg = isUp
    ? rank === 1 ? "bg-red-600" : rank === 2 ? "bg-red-500" : rank === 3 ? "bg-red-400" : "bg-red-300"
    : rank === 1 ? "bg-emerald-700" : rank === 2 ? "bg-emerald-600" : rank === 3 ? "bg-emerald-500" : "bg-emerald-400";
  const rankText = rank <= 3 ? "text-white" : "text-white/90";

  return (
    <div className="flex items-center gap-1 group cursor-default" style={{ height: "22px" }}>
      {/* Rank badge */}
      <span className={`text-[8px] font-black w-4 h-4 rounded-sm flex items-center justify-center shrink-0 ${rankBg} ${rankText}`}>
        {rank}
      </span>

      {/* Sector name */}
      <span
        className="text-[10px] font-semibold truncate shrink-0 max-w-[48px]"
        style={{ color: pctColor }}
        title={sector.name}
      >
        {sector.name}
      </span>

      {/* Change percent */}
      <span
        className="text-[10px] font-bold tabular-nums shrink-0"
        style={{ color: pctColor }}
      >
        {formatPct(sector.changePercent)}
      </span>

      {/* Net inflow (tiny) */}
      <span
        className="text-[8px] font-medium tabular-nums text-muted-foreground/60 truncate hidden sm:inline"
        title={`主力净流入${inflowPrefix}${formatInflow(sector.mainNetInflow)}`}
      >
        {inflowPrefix}{formatInflow(sector.mainNetInflow)}
      </span>
    </div>
  );
}
