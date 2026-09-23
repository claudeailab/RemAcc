import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { feature_catalog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { logAudit } from "@/lib/audit";

export async function GET() {
  await requireAdmin();
  const items = await db.select().from(feature_catalog).orderBy(feature_catalog.createdAt);
  return NextResponse.json({ features: items });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const { name, description } = await req.json().catch(() => ({}));
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
  await db.insert(feature_catalog).values({ name: name.trim(), description: description?.trim() || null });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "create", resource: "feature_catalog", detail: `name=${name.trim()}`, ip });
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const admin = await requireAdmin();
  const { id, name, description } = await req.json().catch(() => ({}));
  if (typeof id !== "number" || !name?.trim()) return NextResponse.json({ error: "id and name required" }, { status: 400 });
  await db.update(feature_catalog).set({ name: name.trim(), description: description?.trim() || null }).where(eq(feature_catalog.id, id));
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "update", resource: "feature_catalog", detail: `id=${id}; name=${name.trim()}`, ip });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const [existing] = await db.select({ name: feature_catalog.name }).from(feature_catalog).where(eq(feature_catalog.id, id));
  await db.delete(feature_catalog).where(eq(feature_catalog.id, id));
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "delete", resource: "feature_catalog", detail: `name=${existing?.name ?? id}`, ip });
  return NextResponse.json({ ok: true });
}
