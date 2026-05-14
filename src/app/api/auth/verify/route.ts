import { NextRequest, NextResponse } from "next/server";

const APP_PASSWORD = process.env.APP_PASSWORD || "888888";

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    if (password === APP_PASSWORD) {
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ success: false, error: "密码错误" }, { status: 401 });
  } catch {
    return NextResponse.json({ success: false, error: "请求错误" }, { status: 400 });
  }
}
