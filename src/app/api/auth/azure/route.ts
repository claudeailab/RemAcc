import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/lib/encryption";
import { getBaseUrl } from "@/lib/base-url";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  const clientId = await getSetting("m365_clientId");
  const tenantId = await getSetting("m365_tenantId");
  const base = getBaseUrl(req);

  if (!clientId || !tenantId) {
    return NextResponse.redirect(`${base}/login?error=m365_not_configured`);
  }

  const email = req.nextUrl.searchParams.get("email") ?? "";
  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${base}/api/o365/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: "openid profile email",
    state,
  });
  if (email) params.set("login_hint", email);

  const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params}`;

  const res = NextResponse.redirect(authUrl);
  res.cookies.set("azure-oauth-state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
    secure: req.headers.get("x-forwarded-proto") === "https",
  });
  return res;
}
