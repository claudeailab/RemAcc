import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { credentials } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { encrypt, decrypt } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";

const createSchema = z.object({
  name: z.string().min(1),
  username: z.string().default(""),
  password: z.string().min(1),
  domain: z.string().optional(),
  notes: z.string().optional(),
});
const updateSchema = createSchema.partial().extend({ id: z.number().int().positive() });

export async function GET() {
  await requireAdmin();
  const rows = await db.select({
    id: credentials.id,
    name: credentials.name,
    username: credentials.username,
    domain: credentials.domain,
    notes: credentials.notes,
    createdAt: credentials.createdAt,
  }).from(credentials).orderBy(credentials.name);
  return NextResponse.json({ credentials: rows });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { name, username, password, domain, notes } = parsed.data;
  await db.insert(credentials).values({ name, username, password: encrypt(password), domain, notes });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "create", resource: "credential", detail: `name=${name}`, ip });
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { id, name, username, password, domain, notes } = parsed.data;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (username !== undefined) updates.username = username;
  if (password !== undefined) updates.password = encrypt(password);
  if (domain !== undefined) updates.domain = domain;
  if (notes !== undefined) updates.notes = notes;
  await db.update(credentials).set(updates).where(eq(credentials.id, id));
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "update", resource: "credential", detail: `id=${id}`, ip });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await db.delete(credentials).where(eq(credentials.id, id));
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "delete", resource: "credential", detail: `id=${id}`, ip });
  return NextResponse.json({ ok: true });
}

export async function _getDecrypted(id: number) {
  const [row] = await db.select().from(credentials).where(eq(credentials.id, id)).limit(1);
  if (!row) return null;
  return { ...row, password: decrypt(row.password) };
}
