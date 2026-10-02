import { NextRequest, NextResponse } from "next/server";
import { deleteSession, sessionCookieName } from "@/lib/auth";
import { getBaseUrl } from "@/lib/base-url";

async function logout(req: NextRequest) {
  const slot = req.nextUrl.searchParams.get("s") ?? undefined;
  const cookieName = sessionCookieName(slot);
  const token = req.cookies.get(cookieName)?.value;
  if (token) await deleteSession(token);
  const res = NextResponse.redirect(`${getBaseUrl(req)}/login${slot ? `?s=${slot}` : ""}`);
  res.cookies.delete(cookieName);
  return res;
}

export async function GET(req: NextRequest) { return logout(req); }
export async function POST(req: NextRequest) { return logout(req); }
