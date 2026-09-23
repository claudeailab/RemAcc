import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { getRawSetting } from "@/lib/encryption";
import { db } from "@/lib/db";
import { push_subscriptions } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getPlatformInfo, iconUrl } from "@/lib/platform";
import { logAudit } from "@/lib/audit";
import webpush from "web-push";

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  const body = await req.json().catch(() => ({}));
  const deviceId: number | undefined = typeof body.deviceId === "number" ? body.deviceId : undefined;

  const [publicKey, privateKey] = await Promise.all([
    getRawSetting("vapid_publicKey"),
    getRawSetting("vapid_privateKey"),
  ]);
  if (!publicKey || !privateKey) {
    return NextResponse.json({ error: "Push notifications not configured. Enable notifications on this device first.", expired: true }, { status: 400 });
  }

  const baseWhere = and(eq(push_subscriptions.userId, admin.id), eq(push_subscriptions.enabled, true));
  const whereClause = deviceId !== undefined
    ? and(baseWhere, eq(push_subscriptions.id, deviceId))
    : baseWhere;

  const subs = await db
    .select({ id: push_subscriptions.id, label: push_subscriptions.label, endpoint: push_subscriptions.endpoint, p256dh: push_subscriptions.p256dh, auth: push_subscriptions.auth })
    .from(push_subscriptions)
    .where(whereClause);

  if (subs.length === 0) {
    return NextResponse.json({ error: "No active subscription found. Please tap Enable to subscribe this device.", expired: true }, { status: 400 });
  }

  const platform = await getPlatformInfo();
  // Apple Web Push requires an https:// subject; mailto: causes BadJwtToken on iOS.
  // Derive origin from the incoming request host header so it works on any deployment.
  const hdrs = await headers();
  const host = hdrs.get("host") ?? "localhost";
  webpush.setVapidDetails(`https://${host}`, publicKey, privateKey);

  const origin = `https://${host}`;
  const payload = JSON.stringify({
    title: platform.name,
    body: "Push notifications are working correctly.",
    icon: `${origin}${iconUrl(platform.icon, encodeURIComponent(platform.primaryColor))}`,
  });

  const results = await Promise.allSettled(
    subs.map(s =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
    )
  );

  // Categorise results per subscription
  const expiredIds: number[] = [];
  const failedIds: number[] = [];
  let sent = 0;

  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      sent++;
    } else {
      const err = r.reason as { statusCode?: number; body?: string };
      console.error("Push send failed:", { statusCode: err?.statusCode, body: err?.body, endpoint: subs[i].endpoint.slice(0, 60) });
      if (err?.statusCode === 410) {
        expiredIds.push(subs[i].id);
      } else {
        failedIds.push(subs[i].id);
      }
    }
  });

  if (expiredIds.length > 0) {
    await db.delete(push_subscriptions).where(inArray(push_subscriptions.id, expiredIds));
  }

  if (sent === 0) {
    const allExpired = expiredIds.length === results.length;
    if (allExpired) {
      return NextResponse.json({ error: "All subscriptions have expired. Please disable and re-enable notifications on this device.", expired: true }, { status: 400 });
    }
    const firstFailed = results.find(r => r.status === "rejected") as PromiseRejectedResult | undefined;
    const err = firstFailed?.reason as { statusCode?: number; body?: string } | undefined;
    if (err?.statusCode === 401 || err?.statusCode === 403) {
      return NextResponse.json({ error: `Push auth failed (${err.statusCode}): ${err.body || "no body"}`, expired: true }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to deliver notification. Please disable and re-enable notifications on this device.", expired: true }, { status: 400 });
  }

  const failed = expiredIds.length + failedIds.length;
  const target = deviceId !== undefined ? (subs[0]?.label ?? `device ${deviceId}`) : "all devices";
  await logAudit({ userEmail: admin.email, action: "send", resource: "notification", detail: `target=${target}; sent=${sent}; failed=${failed}`, ip });
  return NextResponse.json({ ok: true, sent, failed });
}
