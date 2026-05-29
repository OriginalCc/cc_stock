import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/stock/watchlist — 获取所有自选股
export async function GET() {
  try {
    const items = await db.watchlistItem.findMany({
      orderBy: { addedAt: "desc" },
    });

    return NextResponse.json({
      items: items.map((item) => ({
        symbol: item.symbol,
        name: item.name,
        source: item.source,
        price: item.price,
        changePercent: item.changePercent,
        addedAt: item.addedAt.getTime(),
      })),
    });
  } catch (error) {
    console.error("Watchlist GET error:", error);
    return NextResponse.json({ items: [] });
  }
}

// POST /api/stock/watchlist — 添加自选股
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, name, source, price, changePercent } = body;

    if (!symbol || !name) {
      return NextResponse.json({ error: "symbol and name are required" }, { status: 400 });
    }

    // upsert: 如果已存在则更新，否则创建
    const item = await db.watchlistItem.upsert({
      where: { symbol },
      update: {
        name,
        source: source ?? "manual",
        price: price ?? null,
        changePercent: changePercent ?? null,
      },
      create: {
        symbol,
        name,
        source: source ?? "manual",
        price: price ?? null,
        changePercent: changePercent ?? null,
        addedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, item });
  } catch (error) {
    console.error("Watchlist POST error:", error);
    return NextResponse.json({ error: "Failed to add watchlist item" }, { status: 500 });
  }
}

// DELETE /api/stock/watchlist — 删除自选股
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol } = body;

    if (!symbol) {
      return NextResponse.json({ error: "symbol is required" }, { status: 400 });
    }

    await db.watchlistItem.deleteMany({
      where: { symbol },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Watchlist DELETE error:", error);
    return NextResponse.json({ error: "Failed to remove watchlist item" }, { status: 500 });
  }
}
