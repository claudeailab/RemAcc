import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { folders, connections, credentials } from "@/lib/db/schema";
import { eq, inArray, isNull } from "drizzle-orm";
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

// PATCH ?action=match-credentials — assign credentials to all unset folders whose names match a credential (case-insensitive)
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  const url = new URL(req.url);
  if (url.searchParams.get("action") !== "match-credentials") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  const [allFolders, allCredentials] = await Promise.all([
    db.select({ id: folders.id, name: folders.name, credentialId: folders.credentialId }).from(folders),
    db.select({ id: credentials.id, name: credentials.name }).from(credentials),
  ]);
  const credByName = new Map(allCredentials.map(c => [c.name.toLowerCase(), c.id]));
  const credIds = new Set(allCredentials.map(c => c.id));
  const toUpdate = allFolders.filter(f => !(f.credentialId && credIds.has(f.credentialId)) && credByName.has(f.name.toLowerCase()));
  for (const f of toUpdate) {
    await db.update(folders).set({ credentialId: credByName.get(f.name.toLowerCase())! }).where(eq(folders.id, f.id));
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "update", resource: "folder", detail: `match-credentials: updated=${toUpdate.length}`, ip });
  return NextResponse.json({ ok: true, updated: toUpdate.length });
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  const url = new URL(req.url);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const idsParam = url.searchParams.get("ids");
  const singleId = Number(url.searchParams.get("id"));
  const rootIds = idsParam
    ? idsParam.split(",").map(Number).filter(Boolean)
    : singleId ? [singleId] : [];
  if (rootIds.length === 0) return NextResponse.json({ error: "Missing id(s)" }, { status: 400 });

  // Collect all descendant folder IDs (BFS over all roots)
  const allFolders = await db.select({ id: folders.id, parentId: folders.parentId }).from(folders);
  const toDelete = new Set<number>();
  const queue = [...rootIds];
  while (queue.length) {
    const cur = queue.shift()!;
    if (toDelete.has(cur)) continue;
    toDelete.add(cur);
    allFolders.filter(f => f.parentId === cur).forEach(f => queue.push(f.id));
  }

  const toDeleteArr = [...toDelete];
  await db.delete(connections).where(inArray(connections.folderId, toDeleteArr));
  await db.delete(folders).where(inArray(folders.id, toDeleteArr));

  await logAudit({ userEmail: admin.email, action: "delete", resource: "folder", detail: `roots=${rootIds.join(",")} cascade=${toDeleteArr.length}`, ip });
  return NextResponse.json({ ok: true });
}
