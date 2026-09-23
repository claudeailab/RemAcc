import { NextResponse } from "next/server";
import { getSetting } from "@/lib/encryption";

export async function GET() {
  const publicKey = await getSetting("push_vapidPublicKey");
  if (!publicKey) return NextResponse.json({ error: "Not configured" }, { status: 404 });
  return NextResponse.json({ publicKey });
}
