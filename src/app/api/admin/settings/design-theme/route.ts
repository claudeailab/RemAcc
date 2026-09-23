import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";

const DESIGN_THEMES = ["default", "slate", "midnight", "forest", "rose", "obsidian"] as const;
const schema = z.object({ designTheme: z.enum(DESIGN_THEMES) });

export async function GET(req: NextRequest) {
  await requireAdmin();
  const val = req.cookies.get("webapp-design-theme")?.value ?? "default";
  const designTheme = (DESIGN_THEMES as readonly string[]).includes(val) ? val : "default";
  return NextResponse.json({ designTheme });
}

export async function POST(req: NextRequest) {
  await requireAdmin();
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { designTheme } = parsed.data;
  const isSecure = req.headers.get("x-forwarded-proto") === "https";
  const res = NextResponse.json({ ok: true });
  res.cookies.set("webapp-design-theme", designTheme, {
    httpOnly: false,
    secure: isSecure,
    sameSite: "lax",
    maxAge: 365 * 24 * 60 * 60,
    path: "/",
  });
  return res;
}
