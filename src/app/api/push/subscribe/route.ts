import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { push_subscriptions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

const schema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

export async function POST(req: NextRequest) {
  const user = await requireSession();
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { endpoint, keys } = parsed.data;

  // Upsert: remove old subscription for this endpoint, then insert
  await db.delete(push_subscriptions).where(eq(push_subscriptions.endpoint, endpoint));
  await db.insert(push_subscriptions).values({ userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await requireSession();
  const { endpoint } = await req.json().catch(() => ({}));
  if (!endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });

  await db.delete(push_subscriptions).where(
    and(eq(push_subscriptions.userId, user.id), eq(push_subscriptions.endpoint, endpoint))
  );
  return NextResponse.json({ ok: true });
}
