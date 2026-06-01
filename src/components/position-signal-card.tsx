"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, ShieldAlert, ShieldQuestion, ShieldCheck, Shield,
  TrendingUp, TrendingDown, Minus, Scale,
} from "lucide-react";
import type { RegimeDetail } from "@/lib/t-strategy";

// ── Types ──

type Direction = "up" | "down" | "flat";

interface PositionSignalCardProps {
  /** 深证成指 regime */
  indexRegime: RegimeDetail | null;
  /** 板块 regime */
  sectorRegime: RegimeDetail | null;
  /** 个股涨跌幅 % */
  stockChangePercent: number | undefined;
  /** 个股名称 */
  stockName?: string;
  /** 深证名称标签，如 "深证" */
  indexLabel?: string;
  /** 板块名称 */
  sectorName?: string;
}

// ── Helpers ──

function regimeToDirection(regime: RegimeDetail | null): Direction {
  if (!regime) return "flat";
  switch (regime.regime) {
    case "上升通道": return "up";
    case "下跌趋势": return "down";
    case "横盘末期": return "flat";
    case "震荡市":
      // 震荡市用 slope 判断偏强/偏弱
      if (regime.slope > 0.03) return "up";
      if (regime.slope < -0.03) return "down";
      return "flat";
    default: return "flat";
  }
}

function changeToDirection(change: number | undefined): Direction {
  if (change === undefined || change === null) return "flat";
  if (change > 0.2) return "up";
  if (change < -0.2) return "down";
  return "flat";
}

interface PositionLevel {
  key: string;
  icon: React.ReactNode;
  label: string;
  detail: string;
  strategy: string;
  position: string;
  color: string;
  bgColor: string;
  borderColor: string;
  dangerLevel: number; // 1-5, 5 = most dangerous
}

const LEVELS: Record<string, PositionLevel> = {
  "3down": {
    key: "3down",
    icon: <ShieldAlert className="w-5 h-5" />,
    label: "三跌",
    detail: "极度危险，保留3/4后备",
    strategy: "反T(先卖再买)/空仓",
    position: "≤1/4仓",
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/40",
    dangerLevel: 5,
  },
  "2down": {
    key: "2down",
    icon: <ShieldAlert className="w-5 h-5" />,
    label: "双跌",
    detail: "高危，保留2/3后备",
    strategy: "反T(先卖再买)冲高卖",
    position: "≤1/3仓",
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/40",
    dangerLevel: 4,
  },
  "1down1flat": {
    key: "1down1flat",
    icon: <ShieldQuestion className="w-5 h-5" />,
    label: "单弱+震荡",
    detail: "谨慎，方向不明",
    strategy: "轻仓观察",
    position: "20-25%",
    color: "text-yellow-600 dark:text-yellow-400",
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/30",
    dangerLevel: 3,
  },
  "2up": {
    key: "2up",
    icon: <Shield className="w-5 h-5" />,
    label: "双涨",
    detail: "积极，可适度操作",
    strategy: "正T低吸/反T(先卖再买)均可",
    position: "70-80%",
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
    dangerLevel: 2,
  },
  "3up": {
    key: "3up",
    icon: <ShieldCheck className="w-5 h-5" />,
    label: "三涨",
    detail: "最安全，可积极做T",
    strategy: "正T/反T(先卖再买)均可",
    position: "90-100%",
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/40",
    dangerLevel: 1,
  },
  "neutral": {
    key: "neutral",
    icon: <Scale className="w-5 h-5" />,
    label: "震荡",
    detail: "方向不明，轻仓试探",
    strategy: "观望为主",
    position: "15-25%",
    color: "text-gray-500 dark:text-gray-400",
    bgColor: "bg-gray-500/10",
    borderColor: "border-gray-500/30",
    dangerLevel: 3,
  },
  "1up1down": {
    key: "1up1down",
    icon: <AlertTriangle className="w-5 h-5" />,
    label: "分歧",
    detail: "涨跌互现，谨慎操作",
    strategy: "看个股方向定正/反T",
    position: "20-30%",
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    dangerLevel: 3,
  },
};

function computePositionLevel(
  indexDir: Direction,
  sectorDir: Direction,
  stockDir: Direction,
): PositionLevel {
  const ups = [indexDir, sectorDir, stockDir].filter(d => d === "up").length;
  const downs = [indexDir, sectorDir, stockDir].filter(d => d === "down").length;
  const flats = [indexDir, sectorDir, stockDir].filter(d => d === "flat").length;

  // 三跌
  if (downs >= 3) return LEVELS["3down"];
  // 三涨
  if (ups >= 3) return LEVELS["3up"];
  // 双跌（含三跌已处理）
  if (downs >= 2) return LEVELS["2down"];
  // 双涨（含三涨已处理）
  if (ups >= 2) return LEVELS["2up"];
  // 单跌+震荡
  if (downs === 1 && flats >= 1 && ups === 0) return LEVELS["1down1flat"];
  // 单涨+震荡
  if (ups === 1 && flats >= 1 && downs === 0) return LEVELS["2up"]; // treat as 震荡偏强
  // 一涨一跌一平 → 分歧
  if (ups === 1 && downs === 1) return LEVELS["1up1down"];
  // 全震荡
  if (flats >= 2) return LEVELS["neutral"];

  return LEVELS["neutral"];
}

function directionLabel(dir: Direction): string {
  switch (dir) {
    case "up": return "↑ 涨";
    case "down": return "↓ 跌";
    case "flat": return "— 盘";
  }
}

function directionColor(dir: Direction): string {
  switch (dir) {
    case "up": return "text-red-500 dark:text-red-400";
    case "down": return "text-green-500 dark:text-green-400";
    case "flat": return "text-gray-400 dark:text-gray-500";
  }
}

// ── Component ──

export const PositionSignalCard = React.memo(function PositionSignalCard({
  indexRegime,
  sectorRegime,
  stockChangePercent,
  stockName,
  indexLabel = "深证",
  sectorName,
}: PositionSignalCardProps) {
  const indexDir = regimeToDirection(indexRegime);
  const sectorDir = regimeToDirection(sectorRegime);
  const stockDir = changeToDirection(stockChangePercent);

  const level = computePositionLevel(indexDir, sectorDir, stockDir);
  const Icon = level.icon;

  return (
    <Card className={`border-2 ${level.borderColor} ${level.bgColor} shadow-lg`}>
      <CardContent className="p-2 sm:p-2.5">
        {/* 主信号行 */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`flex items-center gap-1.5 text-lg font-bold ${level.color}`}>
            {Icon}
            {level.label}
          </span>
          <span className={`text-sm font-semibold ${level.color}`}>
            {level.position}
          </span>
          <span className="text-muted-foreground text-xs">|</span>
          <span className={`text-sm font-medium ${level.color}`}>
            {level.strategy}
          </span>
          <span className="text-muted-foreground text-xs">|</span>
          <span className={`text-xs ${level.color}`}>
            {level.detail}
          </span>
        </div>

        {/* 三维度指标 */}
        <div className="flex items-center gap-3 mt-1 text-xs">
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">{indexLabel}</span>
            <span className={`font-bold ${directionColor(indexDir)}`}>
              {directionLabel(indexDir)}
            </span>
          </div>
          <span className="text-muted-foreground">+</span>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">
              {sectorName ? `${sectorName}` : "板块"}
            </span>
            <span className={`font-bold ${directionColor(sectorDir)}`}>
              {directionLabel(sectorDir)}
            </span>
          </div>
          <span className="text-muted-foreground">+</span>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">
              {stockName || "个股"}
            </span>
            <span className={`font-bold ${directionColor(stockDir)}`}>
              {directionLabel(stockDir)}
              {stockChangePercent !== undefined && (
                <span className="font-mono ml-0.5">
                  ({(stockChangePercent ?? 0) >= 0 ? "+" : ""}{(stockChangePercent ?? 0).toFixed(2)}%)
                </span>
              )}
            </span>
          </div>
        </div>

        {/* 仓位速查条 */}
        <div className="mt-1 flex items-center gap-1">
          {[
            { label: "≤1/4", active: level.key === "3down", color: "bg-green-500" },
            { label: "≤1/3", active: level.key === "2down", color: "bg-green-500" },
            { label: "20%", active: level.key === "1down1flat" || level.key === "1up1down", color: "bg-yellow-500" },
            { label: "70-80%", active: level.key === "2up", color: "bg-red-500" },
            { label: "90-100%", active: level.key === "3up", color: "bg-red-500" },
          ].map((item, i) => (
            <div
              key={i}
              className={`flex-1 h-5 rounded-sm flex items-center justify-center text-[9px] font-bold transition-all ${
                item.active
                  ? `${item.color} text-white shadow-sm scale-105`
                  : "bg-muted/30 text-muted-foreground"
              }`}
            >
              {item.label}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
});
