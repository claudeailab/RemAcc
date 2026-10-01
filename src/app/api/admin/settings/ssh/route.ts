import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { setSetting } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";
import { getSshSettings } from "@/lib/protocol-settings";
import { z } from "zod";

const schema = z.object({
  fontSize: z.number().int().min(8).max(32),
  fontFamily: z.string().min(1).max(200),
  scrollback: z.number().int().min(100).max(50000),
  keepaliveInterval: z.number().int().min(0).max(300),
  readyTimeout: z.number().int().min(5).max(120),
});

export async function GET() {
  await requireAdmin();
  return NextResponse.json(await getSshSettings());
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  await setSetting("ssh_settings", JSON.stringify(parsed.data));
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "update", resource: "ssh_settings", detail: "", ip });
  return NextResponse.json({ ok: true });
}
