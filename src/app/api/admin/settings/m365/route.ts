import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  enabled: z.boolean(),
  clientId: z.string(),
  clientSecret: z.string(),
  tenantId: z.string(),
  expiryDate: z.string().optional(),
  reminderDays: z.coerce.number().int().min(1).max(365).optional(),
  reminderEmail: z.string().email().optional().or(z.literal("")),
});

export async function GET() {
  await requireAdmin();
  const [enabled, clientId, tenantId, expiryDate, reminderDays, reminderEmail, clientSecret] = await Promise.all([
    getSetting("m365_enabled"),
    getSetting("m365_clientId"),
    getSetting("m365_tenantId"),
    getSetting("m365_expiryDate"),
    getSetting("m365_reminderDays"),
    getSetting("m365_reminderEmail"),
    getSetting("m365_clientSecret"),
  ]);
  return NextResponse.json({ data: { enabled: enabled !== "false", clientId: clientId ?? "", tenantId: tenantId ?? "", expiryDate: expiryDate ?? "", reminderDays: reminderDays ?? "30", reminderEmail: reminderEmail ?? "", clientSecretSet: !!clientSecret } });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { enabled, clientId, clientSecret, tenantId, expiryDate, reminderDays, reminderEmail } = parsed.data;

  const [prevClientId, prevTenantId, prevExpiry, prevReminder, prevReminderEmail] = await Promise.all([
    getSetting("m365_clientId"),
    getSetting("m365_tenantId"),
    getSetting("m365_expiryDate"),
    getSetting("m365_reminderDays"),
    getSetting("m365_reminderEmail"),
  ]);

  await setSetting("m365_enabled", String(enabled));
  await setSetting("m365_clientId", clientId);
  if (clientSecret) await setSetting("m365_clientSecret", clientSecret);
  await setSetting("m365_tenantId", tenantId);
  if (expiryDate) await setSetting("m365_expiryDate", expiryDate);
  if (reminderDays) await setSetting("m365_reminderDays", String(reminderDays));
  await setSetting("m365_reminderEmail", reminderEmail ?? "");

  const changes: string[] = [];
  changes.push(`enabled: ${enabled}`);
  if (clientId !== (prevClientId ?? "")) changes.push(`clientId: ${prevClientId ?? "(unset)"}→${clientId}`);
  if (clientSecret) changes.push("clientSecret: [updated]");
  if (tenantId !== (prevTenantId ?? "")) changes.push(`tenantId: ${prevTenantId ?? "(unset)"}→${tenantId}`);
  if (expiryDate && expiryDate !== (prevExpiry ?? "")) changes.push(`expiryDate: ${prevExpiry ?? "(unset)"}→${expiryDate}`);
  if (reminderDays && String(reminderDays) !== (prevReminder ?? "30")) changes.push(`reminderDays: ${prevReminder ?? "30"}→${reminderDays}`);
  if ((reminderEmail ?? "") !== (prevReminderEmail ?? "")) changes.push(`reminderEmail: ${prevReminderEmail ?? "(unset)"}→${reminderEmail ?? ""}`);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "update", resource: "settings.m365", detail: changes.join("; ") || "no changes", ip });
  return NextResponse.json({ ok: true });
}
