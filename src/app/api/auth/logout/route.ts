import { NextRequest, NextResponse } from "next/server";
import { deleteSession, sessionCookieName } from "@/lib/auth";
import { getBaseUrl } from "@/lib/base-url";

async function logout(req: NextRequest) {
  // Delete whichever session cookie this request came from (auto-detect slot)
  for (const slot of [undefined, "2"]) {
    const name = sessionCookieName(slot);
    const token = req.cookies.get(name)?.value;
    if (token) { await deleteSession(token); }
  }
  const res = NextResponse.redirect(`${getBaseUrl(req)}/login`);
  res.cookies.delete("webapp-session");
  res.cookies.delete("webapp-session-2");
  return res;
}

export async function GET(req: NextRequest) { return logout(req); }
export async function POST(req: NextRequest) { return logout(req); }
