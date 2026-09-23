import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/encryption";
import webpush from "web-push";

export async function GET() {
  await requireAdmin();
  let publicKey = await getSetting("push_vapidPublicKey");
  if (!publicKey) {
    const keys = webpush.generateVAPIDKeys();
    await Promise.all([
      setSetting("push_vapidPublicKey", keys.publicKey),
      setSetting("push_vapidPrivateKey", keys.privateKey),
    ]);
    publicKey = keys.publicKey;
  }
  return NextResponse.json({ publicKey });
}
