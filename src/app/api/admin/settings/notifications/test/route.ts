import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getSetting } from "@/lib/encryption";
import { db } from "@/lib/db";
import { push_subscriptions } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getPlatformInfo } from "@/lib/platform";
import webpush from "web-push";

export async function POST(req: NextRequest) {
  void req;
  const admin = await requireAdmin();

  const [publicKey, privateKey] = await Promise.all([
    getSetting("push_vapidPublicKey"),
    getSetting("push_vapidPrivateKey"),
  ]);
  if (!publicKey || !privateKey) {
    return NextResponse.json({ error: "Push notifications not configured. Enable notifications on this device first." }, { status: 400 });
  }

  const subs = await db
    .select({ id: push_subscriptions.id, endpoint: push_subscriptions.endpoint, p256dh: push_subscriptions.p256dh, auth: push_subscriptions.auth })
    .from(push_subscriptions)
    .where(eq(push_subscriptions.userId, admin.id));

  if (subs.length === 0) {
    return NextResponse.json({ error: "No subscriptions found. Use the Enable button to subscribe this device first." }, { status: 400 });
  }

  const platform = await getPlatformInfo();
  webpush.setVapidDetails(`mailto:admin@${new URL(process.env.WEBAPP_URL ?? "http://localhost").hostname}`, publicKey, privateKey);

  const payload = JSON.stringify({
    title: platform.name,
    body: "Push notifications are working correctly.",
    icon: "/favicon.svg",
  });

  const results = await Promise.allSettled(
    subs.map(s =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
    )
  );

  // Clean up expired subscriptions (HTTP 410 Gone)
  const expiredIds = subs
    .filter((_, i) => {
      const r = results[i];
      if (r.status === "rejected") {
        const err = r.reason as { statusCode?: number };
        return err?.statusCode === 410;
      }
      return false;
    })
    .map(s => s.id);

  if (expiredIds.length > 0) {
    await db.delete(push_subscriptions).where(inArray(push_subscriptions.id, expiredIds));
  }

  const sent = results.filter(r => r.status === "fulfilled").length;

  if (sent === 0) {
    // All failed — give a specific reason
    const firstErr = results[0];
    if (firstErr.status === "rejected") {
      const err = firstErr.reason as { statusCode?: number; message?: string };
      if (err?.statusCode === 410 || expiredIds.length > 0) {
        return NextResponse.json({ error: "Subscription expired. Please disable and re-enable notifications on this device.", expired: true }, { status: 400 });
      }
      if (err?.statusCode === 401 || err?.statusCode === 403) {
        return NextResponse.json({ error: "VAPID key mismatch. Please disable and re-enable notifications on this device.", expired: true }, { status: 400 });
      }
      console.error("Push send failed:", err);
    }
    return NextResponse.json({ error: "Failed to deliver notification. Please disable and re-enable notifications on this device.", expired: true }, { status: 400 });
  }

  return NextResponse.json({ ok: true, sent });
}
