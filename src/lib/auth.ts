import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest, NextResponse } from "next/server";
import { db } from "./db";
import { sessions, users, permission_groups } from "./db/schema";
import { and, eq, gt, inArray } from "drizzle-orm";
import crypto from "crypto";

// One browser can be signed in to several accounts at once: SESSION_COOKIE holds all their
// session tokens, ACTIVE_COOKIE names the user a request is for. Each tab re-claims
// ACTIVE_COOKIE for its own account when it gets focus (components/TabAccount.tsx).
export const SESSION_COOKIE = "webapp-session";
export const ACTIVE_COOKIE = "webapp-active";
const MAX_ACCOUNTS = 5;
const SESSION_SECONDS = 7 * 24 * 60 * 60;

const splitTokens = (v?: string) => (v ?? "").split(".").filter(Boolean).slice(0, MAX_ACCOUNTS);

async function liveSessions(tokens: string[]) {
  if (!tokens.length) return [];
  const rows = await db
    .select({ id: sessions.id, userId: sessions.userId, expiresAt: sessions.expiresAt })
    .from(sessions)
    .where(and(inArray(sessions.id, tokens), gt(sessions.expiresAt, new Date())))
    .limit(MAX_ACCOUNTS);
  return tokens.map(t => rows.find(r => r.id === t)).filter(r => r !== undefined);
}

function pick<T extends { userId: number }>(live: T[], active?: string) {
  if (!active) return live[live.length - 1] ?? null;
  return live.find(s => s.userId === Number(active)) ?? null;
}

export async function getSession() {
  const cookieStore = await cookies();
  const live = await liveSessions(splitTokens(cookieStore.get(SESSION_COOKIE)?.value));
  return pick(live, cookieStore.get(ACTIVE_COOKIE)?.value);
}

export async function getUser() {
  const session = await getSession();
  if (!session) return null;

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      displayName: users.displayName,
      groupId: users.groupId,
      permissions: permission_groups.permissions,
    })
    .from(users)
    .leftJoin(permission_groups, eq(users.groupId, permission_groups.id))
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!row) return null;
  const perms = JSON.parse(row.permissions ?? "[]") as string[];
  return { id: row.id, email: row.username ?? row.email, displayName: row.displayName, groupId: row.groupId, isAdmin: perms.includes("administrator") };
}

export async function requireSession() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await getUser();
  if (!user || !user.isAdmin) redirect("/login");
  return user;
}

function cookieBase(req: NextRequest) {
  return { secure: req.headers.get("x-forwarded-proto") === "https", sameSite: "lax" as const, path: "/", maxAge: SESSION_SECONDS };
}

function writeCookies(req: NextRequest, res: NextResponse, tokens: string[], activeUserId?: number) {
  const base = cookieBase(req);
  if (!tokens.length || activeUserId === undefined) {
    res.cookies.delete(SESSION_COOKIE);
    res.cookies.delete(ACTIVE_COOKIE);
    return;
  }
  res.cookies.set(SESSION_COOKIE, tokens.join("."), { ...base, httpOnly: true });
  res.cookies.set(ACTIVE_COOKIE, String(activeUserId), base);
}

// Signs userId in alongside the browser's other accounts; a repeat sign-in replaces that user's old session
export async function startSession(req: NextRequest, res: NextResponse, userId: number) {
  const live = await liveSessions(splitTokens(req.cookies.get(SESSION_COOKIE)?.value));
  const others = live.filter(s => s.userId !== userId);
  const dropped = [...live.filter(s => s.userId === userId), ...others.slice(0, Math.max(0, others.length - (MAX_ACCOUNTS - 1)))];
  if (dropped.length) await db.delete(sessions).where(inArray(sessions.id, dropped.map(s => s.id)));
  const kept = others.slice(-(MAX_ACCOUNTS - 1)).map(s => s.id);

  const id = crypto.randomBytes(32).toString("hex");
  await db.insert(sessions).values({ id, userId, expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000) });
  writeCookies(req, res, [...kept, id], userId);
}

// Signs out only the account this request is for; the browser's other accounts stay signed in
export async function endSession(req: NextRequest, res: NextResponse) {
  const live = await liveSessions(splitTokens(req.cookies.get(SESSION_COOKIE)?.value));
  const current = pick(live, req.cookies.get(ACTIVE_COOKIE)?.value);
  if (current) await db.delete(sessions).where(eq(sessions.id, current.id));
  const rest = live.filter(s => s !== current);
  writeCookies(req, res, rest.map(s => s.id), rest[rest.length - 1]?.userId);
}
