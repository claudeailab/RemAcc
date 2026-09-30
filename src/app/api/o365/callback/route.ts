import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/lib/encryption";
import { getBaseUrl } from "@/lib/base-url";
import { db } from "@/lib/db";
import { users, permission_groups } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? 0 : 4 - (b64.length % 4);
    return JSON.parse(Buffer.from(b64 + "=".repeat(pad), "base64").toString("utf8"));
  } catch { return {}; }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const storedState = req.cookies.get("azure-oauth-state")?.value;
  const base = getBaseUrl(req);

  const fail = (e: string) => {
    const res = NextResponse.redirect(`${base}/login?error=${e}`);
    res.cookies.delete("azure-oauth-state");
    return res;
  };

  if (!code || !state || state !== storedState) return fail("auth_failed");

  const clientId = await getSetting("m365_clientId");
  const clientSecret = await getSetting("m365_clientSecret");
  const tenantId = await getSetting("m365_tenantId");
  if (!clientId || !clientSecret || !tenantId) return fail("m365_not_configured");

  const redirectUri = `${base}/api/o365/callback`;

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        scope: "openid profile email",
      }),
    }
  );

  const tokenData = await tokenRes.json() as { id_token?: string };
  if (!tokenData.id_token) return fail("token_failed");

  const claims = decodeJwtPayload(tokenData.id_token);
  const oid = claims.oid as string | undefined;
  if (!oid) return fail("invalid_token");

  const [user] = await db
    .select({ id: users.id, email: users.email, groupId: users.groupId })
    .from(users)
    .where(eq(users.azureOid, oid))
    .limit(1);

  if (!user) {
    console.error(`[azure-sso] no_access: oid=${oid} not found in users table`);
    return fail("not_provisioned");
  }

  let isAdmin = false;
  if (user.groupId) {
    const [group] = await db
      .select({ permissions: permission_groups.permissions })
      .from(permission_groups)
      .where(eq(permission_groups.id, user.groupId))
      .limit(1);
    if (group) {
      const perms = JSON.parse(group.permissions || "[]") as string[];
      if (!perms.includes("access_dashboard") && !perms.includes("administrator") && !perms.includes("view_remote_connections")) {
        console.error(`[azure-sso] no_access: user=${user.email} groupId=${user.groupId} perms=[${perms.join(",")}] — missing access_dashboard or administrator`);
        return fail("no_access");
      }
      isAdmin = perms.includes("administrator");
    } else {
      console.error(`[azure-sso] no_access: user=${user.email} groupId=${user.groupId} — group record not found`);
      return fail("no_access");
    }
  } else {
    console.error(`[azure-sso] no_group: user=${user.email} — no group assigned`);
    return fail("no_group");
  }

  const token = await createSession(user.id);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await logAudit({ userEmail: user.email, action: "login", resource: "auth", detail: "azure_sso" });

  const redirectPath = isAdmin ? "/admin" : "/dashboard";
  const isSecure = req.headers.get("x-forwarded-proto") === "https";

  const res = NextResponse.redirect(`${base}${redirectPath}`);
  res.cookies.set("webapp-session", token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60,
    path: "/",
  });
  res.cookies.delete("azure-oauth-state");
  return res;
}
