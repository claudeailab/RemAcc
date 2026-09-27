import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

export async function GET() {
  await requireAdmin();
  const raw = await getSetting("connection_session_grace");
  const sessionGrace = raw ? parseInt(raw, 10) : 0;
  return NextResponse.json({ sessionGrace: isNaN(sessionGrace) ? 0 : sessionGrace });
}

const schema = z.object({
  sessionGrace: z.number().int().min(0).max(300),
});

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  await setSetting("connection_session_grace", String(parsed.data.sessionGrace));
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "update", resource: "connections", detail: `sessionGrace=${parsed.data.sessionGrace}`, ip });
  return NextResponse.json({ ok: true });
}
