import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcrypt";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, permission_groups } from "@/lib/db/schema";
import { eq, sql, inArray } from "drizzle-orm";
import { logAudit } from "@/lib/audit";

const createSchema = z.object({
  username: z.string().min(1),
  email: z.string().email().optional(),
  displayName: z.string().optional(),
  password: z.string().min(8),
  groupId: z.number().int().positive().nullable().optional(),
});
const updateSchema = z.object({
  id: z.number().int().positive(),
  username: z.string().min(1).optional(),
  email: z.string().email().optional(),
  displayName: z.string().optional(),
  password: z.string().min(8).optional(),
  groupId: z.number().int().positive().nullable().optional(),
  disabled: z.boolean().optional(),
});

export async function GET() {
  await requireAdmin();
  const list = await db
    .select({ id: users.id, email: users.email, username: users.username, displayName: users.displayName, source: users.source, groupId: users.groupId, disabled: users.disabled })
    .from(users)
    .limit(200);
  return NextResponse.json({ users: list });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { username, email, displayName, password, groupId } = parsed.data;
  const effectiveEmail = email ?? username;
  const passwordHash = await bcrypt.hash(password, 12);
  await db.insert(users).values({ email: effectiveEmail, username, displayName, passwordHash, source: "local", groupId: groupId ?? null });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  const parts = [`username=${username}`];
  if (displayName) parts.push(`displayName=${displayName}`);
  if (groupId) parts.push(`groupId=${groupId}`);
  await logAudit({ userEmail: admin.email, action: "create", resource: "user", detail: parts.join("; "), ip });
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { id, username, email, displayName, password, groupId, disabled } = parsed.data;

  const [existing] = await db
    .select({ email: users.email, username: users.username, displayName: users.displayName, groupId: users.groupId, disabled: users.disabled })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;
  type UpdateSet = Parameters<ReturnType<typeof db.update<typeof users>>["set"]>[0];
  const set: UpdateSet = {};
  if (username) set.username = sql`${username}`;
  if (email) set.email = sql`${email}`;
  if (displayName !== undefined) set.displayName = sql`${displayName}`;
  if (passwordHash) set.passwordHash = sql`${passwordHash}`;
  if (groupId !== undefined) set.groupId = groupId;
  if (disabled !== undefined) set.disabled = disabled;
  if (Object.keys(set).length === 0) return NextResponse.json({ ok: true });
  await db.update(users).set(set).where(eq(users.id, id));

  // Resolve group names for readable audit entries
  let fromGroupName: string | null = null;
  let toGroupName: string | null = null;
  if (groupId !== undefined && groupId !== existing?.groupId) {
    const gIds = [existing?.groupId, groupId].filter((x): x is number => x != null);
    if (gIds.length > 0) {
      const gRows = await db.select({ id: permission_groups.id, name: permission_groups.name }).from(permission_groups).where(inArray(permission_groups.id, gIds));
      const gMap = new Map(gRows.map(g => [g.id, g.name]));
      fromGroupName = existing?.groupId != null ? (gMap.get(existing.groupId) ?? `#${existing.groupId}`) : null;
      toGroupName = groupId != null ? (gMap.get(groupId) ?? `#${groupId}`) : null;
    }
  }

  const who = existing?.email ?? `id=${id}`;
  const changes: string[] = [`user=${who}`];
  if (username && username !== existing?.username) changes.push(`username: ${existing?.username ?? "(unset)"}→${username}`);
  if (email && email !== existing?.email) changes.push(`email: ${existing?.email ?? "(unset)"}→${email}`);
  if (displayName !== undefined && displayName !== existing?.displayName) changes.push(`display name: ${existing?.displayName ?? "(unset)"}→${displayName || "(cleared)"}`);
  if (password) changes.push("password: [updated]");
  if (groupId !== undefined && groupId !== existing?.groupId) changes.push(`group: ${fromGroupName ?? "(none)"}→${toGroupName ?? "(none)"}`);
  if (disabled !== undefined && disabled !== existing?.disabled) changes.push(`disabled: ${existing?.disabled ?? false}→${disabled}`);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "update", resource: "user", detail: changes.join("; "), ip });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const [existing] = await db
    .select({ email: users.email, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  await db.delete(users).where(eq(users.id, id));

  const parts = [`id=${id}`];
  if (existing) {
    parts.push(`email=${existing.email}`);
    if (existing.displayName) parts.push(`displayName=${existing.displayName}`);
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "delete", resource: "user", detail: parts.join("; "), ip });
  return NextResponse.json({ ok: true });
}
