import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getSetting } from "@/lib/encryption";
import { db } from "@/lib/db";
import { push_subscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getPlatformInfo } from "@/lib/platform";
import webpush from "web-push";

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();

  const [publicKey, privateKey] = await Promise.all([
    getSetting("push_vapidPublicKey"),
    getSetting("push_vapidPrivateKey"),
  ]);
  if (!publicKey || !privateKey) {
    return NextResponse.json({ error: "Push notifications not configured. Generate VAPID keys first." }, { status: 400 });
  }

  const subs = await db
    .select({ endpoint: push_subscriptions.endpoint, p256dh: push_subscriptions.p256dh, auth: push_subscriptions.auth })
    .from(push_subscriptions)
    .where(eq(push_subscriptions.userId, admin.id));

  if (subs.length === 0) {
    return NextResponse.json({ error: "No subscriptions found. Subscribe this browser first using the button below." }, { status: 400 });
  }

  const platform = await getPlatformInfo();
  webpush.setVapidDetails(`mailto:admin@localhost`, publicKey, privateKey);

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

  const sent = results.filter(r => r.status === "fulfilled").length;
  if (sent === 0) {
    return NextResponse.json({ error: "Failed to deliver notification. The subscription may have expired — try re-subscribing." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, sent });
}
