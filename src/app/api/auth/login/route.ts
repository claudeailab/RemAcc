import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcrypt";
import { db } from "@/lib/db";
import { users, permission_groups } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createSession } from "@/lib/auth";
import { isRateLimited } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (isRateLimited(`login:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { email, password } = parsed.data;

  // Auto-seed first admin with Administrators group
  const adminEmail = process.env.WEBAPP_ADMIN_EMAIL;
  const adminPassword = process.env.WEBAPP_ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, adminEmail)).limit(1);
    if (!existing) {
      // Ensure Administrators group exists
      let groupId: number;
      const [existingGroup] = await db
        .select({ id: permission_groups.id })
        .from(permission_groups)
        .where(eq(permission_groups.name, "Administrators"))
        .limit(1);
      if (existingGroup) {
        groupId = existingGroup.id;
      } else {
        const result = await db.insert(permission_groups).values({
          name: "Administrators",
          description: "Full admin panel access",
          permissions: '["administrator"]',
        });
        groupId = Number(result[0].insertId);
      }
      const hash = await bcrypt.hash(adminPassword, 12);
      await db.insert(users).values({ email: adminEmail, source: "local", passwordHash: hash, groupId });
    }
  }

  const [user] = await db
    .select({ id: users.id, email: users.email, groupId: users.groupId, passwordHash: users.passwordHash, source: users.source })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (user?.source === "azure") {
    return NextResponse.json({ azureLogin: true });
  }

  if (!user?.passwordHash) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });

  // Determine redirect based on group permissions
  let isAdmin = false;
  if (user.groupId) {
    const [group] = await db
      .select({ permissions: permission_groups.permissions })
      .from(permission_groups)
      .where(eq(permission_groups.id, user.groupId))
      .limit(1);
    if (group) {
      const perms = JSON.parse(group.permissions || "[]") as string[];
      isAdmin = perms.includes("administrator");
    }
  }

  const token = await createSession(user.id);
  const redirectPath = isAdmin ? "/admin" : "/dashboard";
  const isSecure = req.headers.get("x-forwarded-proto") === "https";
  await logAudit({ userEmail: user.email, action: "login", resource: "auth", ip });

  const res = NextResponse.json({ redirect: redirectPath });
  res.cookies.set("webapp-session", token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60,
    path: "/",
  });
  return res;
}
