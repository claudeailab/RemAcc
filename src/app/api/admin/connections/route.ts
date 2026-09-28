import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { logAudit } from "@/lib/audit";

const createSchema = z.object({
  name: z.string().min(1),
  host: z.string().min(1),
  port: z.number().int().positive().nullable().optional(),
  protocol: z.enum(["rdp", "vnc", "ssh"]),
  folderId: z.number().int().positive().nullable().optional(),
  credentialId: z.number().int().positive().nullable().optional(),
  notes: z.string().optional(),
  options: z.string().optional(),
});
const updateSchema = createSchema.partial().extend({ id: z.number().int().positive() });

export async function GET() {
  await requireAdmin();
  const rows = await db.select().from(connections).orderBy(connections.name);
  return NextResponse.json({ connections: rows });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { name, host, port, protocol, folderId, credentialId, notes, options } = parsed.data;
  await db.insert(connections).values({
    name, host, port: port ?? null, protocol, folderId: folderId ?? null, credentialId: credentialId ?? null, notes, options: options ?? null,
  });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "create", resource: "connection", detail: `name=${name} host=${host} proto=${protocol}`, ip });
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { id, ...rest } = parsed.data;
  const updates: Record<string, unknown> = {};
  if (rest.name !== undefined) updates.name = rest.name;
  if (rest.host !== undefined) updates.host = rest.host;
  if (rest.port !== undefined) updates.port = rest.port;
  if (rest.protocol !== undefined) updates.protocol = rest.protocol;
  if (rest.folderId !== undefined) updates.folderId = rest.folderId;
  if (rest.credentialId !== undefined) updates.credentialId = rest.credentialId;
  if (rest.notes !== undefined) updates.notes = rest.notes;
  if (rest.options !== undefined) updates.options = rest.options;
  await db.update(connections).set(updates).where(eq(connections.id, id));
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "update", resource: "connection", detail: `id=${id}`, ip });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await db.delete(connections).where(eq(connections.id, id));
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "delete", resource: "connection", detail: `id=${id}`, ip });
  return NextResponse.json({ ok: true });
}
