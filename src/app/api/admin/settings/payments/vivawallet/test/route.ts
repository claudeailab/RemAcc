import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getSetting } from "@/lib/encryption";

export async function POST() {
  await requireAdmin();
  const [clientId, clientSecret, liveMode] = await Promise.all([
    getSetting("vivawallet_clientId"),
    getSetting("vivawallet_clientSecret"),
    getSetting("vivawallet_liveMode"),
  ]);
  if (!clientId || !clientSecret) return NextResponse.json({ error: "Viva not configured" }, { status: 400 });

  const url = liveMode === "true"
    ? "https://accounts.vivapayments.com/connect/token"
    : "https://demo-accounts.vivapayments.com/connect/token";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
    });
    if (!res.ok) return NextResponse.json({ error: `Auth failed (${res.status})` }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Connection failed" }, { status: 400 });
  }
}
