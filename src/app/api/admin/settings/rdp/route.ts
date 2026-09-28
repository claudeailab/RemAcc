import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

export const RDP_SETTING_DEFAULTS = {
  security: "nla" as const,
  width: 1280,
  height: 800,
  colorDepth: "32" as const,
  ignoreCert: true,
  enableWallpaper: false,
  enableFontSmoothing: true,
  enableTheming: false,
  normalizeClipboard: true,
  resizeMethod: "display-update" as const,
};

const schema = z.object({
  security: z.enum(["nla", "any", "rdp", "tls"]),
  width: z.number().int().min(640).max(7680),
  height: z.number().int().min(480).max(4320),
  colorDepth: z.enum(["8", "16", "24", "32"]),
  ignoreCert: z.boolean(),
  enableWallpaper: z.boolean(),
  enableFontSmoothing: z.boolean(),
  enableTheming: z.boolean(),
  normalizeClipboard: z.boolean(),
  resizeMethod: z.enum(["display-update", "reconnect"]),
});

export async function GET() {
  await requireAdmin();
  const raw = await getSetting("rdp_settings");
  const settings = raw ? { ...RDP_SETTING_DEFAULTS, ...JSON.parse(raw) } : RDP_SETTING_DEFAULTS;
  return NextResponse.json(settings);
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  await setSetting("rdp_settings", JSON.stringify(parsed.data));
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "update", resource: "rdp_settings", detail: "", ip });
  return NextResponse.json({ ok: true });
}
