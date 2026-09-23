import { NextResponse } from "next/server";
import { getRawSetting } from "@/lib/encryption";

export async function GET() {
  const publicKey = await getRawSetting("vapid_publicKey");
  if (!publicKey) return NextResponse.json({ error: "Not configured" }, { status: 404 });
  return NextResponse.json({ publicKey });
}
