import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/encryption";
import { db } from "@/lib/db";
import { push_subscriptions } from "@/lib/db/schema";
import webpush from "web-push";

export async function GET() {
  await requireAdmin();
  let publicKey = await getSetting("push_vapidPublicKey");
  if (!publicKey) {
    // Keys missing or decryption failed — regenerate and invalidate all subscriptions
    const keys = webpush.generateVAPIDKeys();
    await Promise.all([
      setSetting("push_vapidPublicKey", keys.publicKey),
      setSetting("push_vapidPrivateKey", keys.privateKey),
      db.delete(push_subscriptions), // all existing subscriptions are now invalid
    ]);
    publicKey = keys.publicKey;
  }
  return NextResponse.json({ publicKey });
}
