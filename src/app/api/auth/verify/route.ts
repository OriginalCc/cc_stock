import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const DEFAULT_PASSWORD = "888888";

/** Get current app password from DB, falling back to env var, then default */
async function getAppPassword(): Promise<string> {
  try {
    const config = await db.appConfig.findUnique({ where: { key: "app_password" } });
    if (config?.value) return config.value;
  } catch {
    // DB might not be ready yet
  }
  return process.env.APP_PASSWORD || DEFAULT_PASSWORD;
}

/** Verify password */
export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    if (!password || typeof password !== "string") {
      return NextResponse.json({ success: false, error: "请输入密码" }, { status: 400 });
    }
    const appPassword = await getAppPassword();
    if (password === appPassword) {
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ success: false, error: "密码错误" }, { status: 401 });
  } catch {
    return NextResponse.json({ success: false, error: "请求错误" }, { status: 400 });
  }
}

/** Change password – requires current password verification */
export async function PUT(request: NextRequest) {
  try {
    const { currentPassword, newPassword } = await request.json();
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ success: false, error: "请输入当前密码和新密码" }, { status: 400 });
    }
    if (typeof newPassword !== "string" || newPassword.length < 4) {
      return NextResponse.json({ success: false, error: "新密码至少4位" }, { status: 400 });
    }

    const appPassword = await getAppPassword();
    if (currentPassword !== appPassword) {
      return NextResponse.json({ success: false, error: "当前密码错误" }, { status: 401 });
    }

    // Upsert the new password into DB
    await db.appConfig.upsert({
      where: { key: "app_password" },
      update: { value: newPassword },
      create: { key: "app_password", value: newPassword },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Change password error:", e);
    return NextResponse.json({ success: false, error: "修改密码失败" }, { status: 500 });
  }
}
