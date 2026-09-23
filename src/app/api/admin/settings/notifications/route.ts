import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getRawSetting, setRawSetting } from "@/lib/encryption";
import { db } from "@/lib/db";
import { push_subscriptions } from "@/lib/db/schema";
import webpush from "web-push";

export async function GET() {
  await requireAdmin();
  let publicKey = await getRawSetting("vapid_publicKey");
  let keysRegenerated = false;
  if (!publicKey) {
    // No keys yet — generate and invalidate all existing subscriptions
    const keys = webpush.generateVAPIDKeys();
    await Promise.all([
      setRawSetting("vapid_publicKey", keys.publicKey),
      setRawSetting("vapid_privateKey", keys.privateKey),
      db.delete(push_subscriptions),
    ]);
    publicKey = keys.publicKey;
    keysRegenerated = true;
  }
  return NextResponse.json({ publicKey, keysRegenerated });
}
