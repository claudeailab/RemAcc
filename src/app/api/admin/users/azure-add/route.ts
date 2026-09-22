import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  users: z.array(z.object({
    oid: z.string(),
    email: z.string().email(),
    displayName: z.string().nullable().optional(),
    groupId: z.number().int().positive().nullable().optional(),
  })).min(1).max(100),
});

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  for (const u of parsed.data.users) {
    await db.insert(users).values({
      email: u.email,
      displayName: u.displayName ?? null,
      source: "azure",
      azureOid: u.oid,
      groupId: u.groupId ?? null,
    }).onDuplicateKeyUpdate({
      set: {
        displayName: sql`values(display_name)`,
        azureOid: sql`values(azure_oid)`,
        groupId: sql`values(group_id)`,
      },
    });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const emails = parsed.data.users.map(u => u.email).join(", ");
  await logAudit({
    userEmail: admin.email,
    action: "create",
    resource: "user",
    detail: `azure_add; count=${parsed.data.users.length}; emails=${emails}`,
    ip,
  });

  return NextResponse.json({ ok: true, count: parsed.data.users.length });
}
