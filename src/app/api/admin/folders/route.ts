import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { folders, connections } from "@/lib/db/schema";
import { eq, inArray, isNull, or } from "drizzle-orm";
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await db.insert(folders).values({ name, parentId: parentId ?? null, credentialId: credentialId ?? null }) as any;
  const id: number = result[0].insertId;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "create", resource: "folder", detail: `name=${name}`, ip });
  return NextResponse.json({ ok: true, id });
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

  // Collect all descendant folder IDs (BFS)
  const allFolders = await db.select({ id: folders.id, parentId: folders.parentId }).from(folders);
  const toDelete: number[] = [];
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift()!;
    toDelete.push(cur);
    allFolders.filter(f => f.parentId === cur).forEach(f => queue.push(f.id));
  }

  // Unassign connections in all affected folders
  await db.update(connections).set({ folderId: null }).where(inArray(connections.folderId, toDelete));
  // Delete folders deepest-first (reverse BFS order)
  for (let i = toDelete.length - 1; i >= 0; i--) {
    await db.delete(folders).where(eq(folders.id, toDelete[i]));
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "delete", resource: "folder", detail: `id=${id} cascade=${toDelete.length}`, ip });
  return NextResponse.json({ ok: true });
}
