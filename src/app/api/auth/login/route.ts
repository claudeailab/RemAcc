import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcrypt";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
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

  // Auto-seed first admin
  const adminEmail = process.env.WEBAPP_ADMIN_EMAIL;
  const adminPassword = process.env.WEBAPP_ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, adminEmail)).limit(1);
    if (!existing) {
      const hash = await bcrypt.hash(adminPassword, 12);
      await db.insert(users).values({ email: adminEmail, role: "admin", source: "local", passwordHash: hash });
    }
  }

  const [user] = await db
    .select({ id: users.id, email: users.email, role: users.role, passwordHash: users.passwordHash, source: users.source })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (user?.source === "azure") {
    return NextResponse.json({ azureLogin: true });
  }

  if (!user?.passwordHash) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });

  const token = await createSession(user.id);
  const redirectPath = user.role === "admin" ? "/admin" : "/dashboard";
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
