import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { push_subscriptions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const admin = await requireAdmin();
  const subs = await db
    .select({
      id: push_subscriptions.id,
      label: push_subscriptions.label,
      enabled: push_subscriptions.enabled,
      endpointPrefix: push_subscriptions.endpoint,
      createdAt: push_subscriptions.createdAt,
    })
    .from(push_subscriptions)
    .where(eq(push_subscriptions.userId, admin.id));

  return NextResponse.json({
    devices: subs.map(s => ({
      id: s.id,
      label: s.label ?? "Unknown device",
      enabled: s.enabled,
      // expose only the first 60 chars of the endpoint so the client can identify "this device"
      endpointPrefix: (s.endpointPrefix ?? "").slice(0, 60),
      createdAt: s.createdAt,
    })),
  });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  const { id, label, enabled } = await req.json().catch(() => ({}));
  if (typeof id !== "number") return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const update: Partial<{ label: string; enabled: boolean }> = {};
  if (typeof label === "string") update.label = label.trim().slice(0, 255) || "Unknown device";
  if (typeof enabled === "boolean") update.enabled = enabled;
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  // Fetch label for audit before updating
  const [existing] = await db
    .select({ label: push_subscriptions.label })
    .from(push_subscriptions)
    .where(and(eq(push_subscriptions.id, id), eq(push_subscriptions.userId, admin.id)));
  const deviceLabel = existing?.label ?? `device ${id}`;

  await db
    .update(push_subscriptions)
    .set(update)
    .where(and(eq(push_subscriptions.id, id), eq(push_subscriptions.userId, admin.id)));

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  if (typeof update.enabled === "boolean") {
    await logAudit({ userEmail: admin.email, action: update.enabled ? "enable" : "disable", resource: "notification.device", detail: `label=${deviceLabel}`, ip });
  } else if (update.label) {
    await logAudit({ userEmail: admin.email, action: "update", resource: "notification.device", detail: `label=${deviceLabel}→${update.label}`, ip });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== "number") return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const [existing] = await db
    .select({ label: push_subscriptions.label })
    .from(push_subscriptions)
    .where(and(eq(push_subscriptions.id, id), eq(push_subscriptions.userId, admin.id)));
  const deviceLabel = existing?.label ?? `device ${id}`;

  await db
    .delete(push_subscriptions)
    .where(and(eq(push_subscriptions.id, id), eq(push_subscriptions.userId, admin.id)));

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "delete", resource: "notification.device", detail: `label=${deviceLabel}`, ip });

  return NextResponse.json({ ok: true });
}
