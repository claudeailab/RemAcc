import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { plans } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { logAudit } from "@/lib/audit";

const planSchema = z.object({ name: z.string().min(1), monthlyPrice: z.number().int().min(0), yearlyPrice: z.number().int().min(0), features: z.array(z.string()).default([]) });
const updateSchema = planSchema.extend({ id: z.number().int().positive() });

function centsToStr(cents: number) { return `$${(cents / 100).toFixed(2)}`; }

export async function GET() {
  await requireAdmin();
  const list = await db.select().from(plans).limit(50);
  return NextResponse.json({ plans: list });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => null);
  const parsed = planSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { name, monthlyPrice, yearlyPrice, features } = parsed.data;
  await db.insert(plans).values({ name, monthlyPrice, yearlyPrice, features: JSON.stringify(features) });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "create", resource: "plan", detail: `name=${name}; monthly=${centsToStr(monthlyPrice)}; yearly=${centsToStr(yearlyPrice)}`, ip });
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { id, name, monthlyPrice, yearlyPrice, features } = parsed.data;

  const [existing] = await db.select({ name: plans.name, monthlyPrice: plans.monthlyPrice, yearlyPrice: plans.yearlyPrice })
    .from(plans).where(eq(plans.id, id)).limit(1);

  await db.update(plans).set({
    name: sql`${name}`,
    monthlyPrice: sql`${monthlyPrice}`,
    yearlyPrice: sql`${yearlyPrice}`,
    features: sql`${JSON.stringify(features)}`,
  }).where(eq(plans.id, id));

  const changes: string[] = [`id=${id}`];
  if (name !== existing?.name) changes.push(`name: ${existing?.name ?? "(unset)"}→${name}`);
  if (monthlyPrice !== existing?.monthlyPrice) changes.push(`monthly: ${centsToStr(existing?.monthlyPrice ?? 0)}→${centsToStr(monthlyPrice)}`);
  if (yearlyPrice !== existing?.yearlyPrice) changes.push(`yearly: ${centsToStr(existing?.yearlyPrice ?? 0)}→${centsToStr(yearlyPrice)}`);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "update", resource: "plan", detail: changes.join("; "), ip });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const [existing] = await db.select({ name: plans.name, monthlyPrice: plans.monthlyPrice, yearlyPrice: plans.yearlyPrice })
    .from(plans).where(eq(plans.id, id)).limit(1);
  await db.delete(plans).where(eq(plans.id, id));

  const parts = [`id=${id}`];
  if (existing) parts.push(`name=${existing.name}`, `monthly=${centsToStr(existing.monthlyPrice)}`, `yearly=${centsToStr(existing.yearlyPrice)}`);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "delete", resource: "plan", detail: parts.join("; "), ip });
  return NextResponse.json({ ok: true });
}
