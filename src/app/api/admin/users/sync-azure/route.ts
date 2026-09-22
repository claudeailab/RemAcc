import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getSetting } from "@/lib/encryption";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { ConfidentialClientApplication } from "@azure/msal-node";

interface AzureUser { id: string; mail: string | null; userPrincipalName: string; displayName: string | null }

export async function POST() {
  await requireAdmin();
  const clientId = await getSetting("m365_clientId");
  const clientSecret = await getSetting("m365_clientSecret");
  const tenantId = await getSetting("m365_tenantId");
  if (!clientId || !clientSecret || !tenantId) {
    return NextResponse.json({ error: "M365 not configured" }, { status: 400 });
  }

  try {
    const app = new ConfidentialClientApplication({ auth: { clientId, clientSecret, authority: `https://login.microsoftonline.com/${tenantId}` } });
    const token = await app.acquireTokenByClientCredential({ scopes: ["https://graph.microsoft.com/.default"] });
    if (!token?.accessToken) return NextResponse.json({ error: "Could not get token" }, { status: 400 });

    const res = await fetch("https://graph.microsoft.com/v1.0/users?$select=id,mail,userPrincipalName,displayName&$top=100", {
      headers: { Authorization: `Bearer ${token.accessToken}` },
    });
    const data = await res.json() as { value: AzureUser[] };
    const azureUsers = data.value ?? [];

    let count = 0;
    for (const u of azureUsers) {
      const email = u.mail ?? u.userPrincipalName;
      if (!email) continue;
      await db.insert(users).values({ email, displayName: u.displayName, source: "azure", azureOid: u.id })
        .onDuplicateKeyUpdate({ set: { displayName: sql`values(display_name)`, azureOid: sql`values(azure_oid)` } });
      count++;
    }
    return NextResponse.json({ ok: true, count });
  } catch {
    return NextResponse.json({ error: "Sync failed" }, { status: 400 });
  }
}
