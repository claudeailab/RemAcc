import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";
import webpush from "web-push";

export async function GET() {
  await requireAdmin();
  const publicKey = await getSetting("push_vapidPublicKey");
  return NextResponse.json({ configured: !!publicKey, publicKey: publicKey ?? null });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";

  const { generateKeys } = await req.json().catch(() => ({}));
  if (!generateKeys) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const keys = webpush.generateVAPIDKeys();
  await Promise.all([
    setSetting("push_vapidPublicKey", keys.publicKey),
    setSetting("push_vapidPrivateKey", keys.privateKey),
  ]);

  await logAudit({ userEmail: admin.email, action: "update", resource: "settings.notifications", detail: "Generated new VAPID keys", ip });
  return NextResponse.json({ ok: true, publicKey: keys.publicKey });
}
