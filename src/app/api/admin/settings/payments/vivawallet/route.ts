import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  enabled: z.boolean(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  merchantId: z.string().optional(),
  liveMode: z.boolean(),
});

export async function GET() {
  await requireAdmin();
  const [enabled, liveMode, clientId, clientSecret, merchantId] = await Promise.all([
    getSetting("vivawallet_enabled"),
    getSetting("vivawallet_liveMode"),
    getSetting("vivawallet_clientId"),
    getSetting("vivawallet_clientSecret"),
    getSetting("vivawallet_merchantId"),
  ]);
  return NextResponse.json({ data: {
    enabled: enabled === "true",
    liveMode: liveMode === "true",
    clientId: clientId ?? "",
    clientSecretSet: !!clientSecret,
    merchantId: merchantId ?? "",
  }});
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { enabled, clientId, clientSecret, merchantId, liveMode } = parsed.data;

  await setSetting("vivawallet_enabled", String(enabled));
  await setSetting("vivawallet_liveMode", String(liveMode));
  if (clientId !== undefined) await setSetting("vivawallet_clientId", clientId);
  if (clientSecret) await setSetting("vivawallet_clientSecret", clientSecret);
  if (merchantId !== undefined) await setSetting("vivawallet_merchantId", merchantId);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const changes: string[] = [
    `enabled=${enabled}`, `liveMode=${liveMode}`,
    ...(clientId !== undefined ? [`clientId="${clientId}"`] : []),
    ...(clientSecret ? ["clientSecret=set"] : []),
    ...(merchantId !== undefined ? [`merchantId="${merchantId}"`] : []),
  ];
  await logAudit({ userEmail: admin.email, action: "update", resource: "settings.vivawallet", detail: changes.join("; "), ip });
  return NextResponse.json({ ok: true });
}
