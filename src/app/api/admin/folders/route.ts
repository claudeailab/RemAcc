import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { folders, connections } from "@/lib/db/schema";
import { eq, isNull, or } from "drizzle-orm";
import { logAudit } from "@/lib/audit";

const createSchema = z.object({
  name: z.string().min(1),
  parentId: z.number().int().positive().nullable().optional(),
  credentialId: z.number().int().positive().nullable().optional(),
});
const updateSchema = createSchema.partial().extend({ id: z.number().int().positive() });

export async function GET() {
  await requireAdmin();
  const rows = await db.select().from(folders).orderBy(folders.name);
  return NextResponse.json({ folders: rows });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { name, parentId, credentialId } = parsed.data;
  await db.insert(folders).values({ name, parentId: parentId ?? null, credentialId: credentialId ?? null });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "create", resource: "folder", detail: `name=${name}`, ip });
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { id, name, parentId, credentialId } = parsed.data;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (parentId !== undefined) updates.parentId = parentId;
  if (credentialId !== undefined) updates.credentialId = credentialId;
  await db.update(folders).set(updates).where(eq(folders.id, id));
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "update", resource: "folder", detail: `id=${id}`, ip });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const [child] = await db.select({ id: folders.id }).from(folders).where(eq(folders.parentId, id)).limit(1);
  if (child) return NextResponse.json({ error: "Folder has sub-folders" }, { status: 409 });
  const [conn] = await db.select({ id: connections.id }).from(connections).where(eq(connections.folderId, id)).limit(1);
  if (conn) return NextResponse.json({ error: "Folder has connections" }, { status: 409 });
  await db.delete(folders).where(eq(folders.id, id));
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "delete", resource: "folder", detail: `id=${id}`, ip });
  return NextResponse.json({ ok: true });
}
