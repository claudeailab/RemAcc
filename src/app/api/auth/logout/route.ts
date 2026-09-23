import { NextRequest, NextResponse } from "next/server";
import { deleteSession } from "@/lib/auth";

async function logout(req: NextRequest) {
  const token = req.cookies.get("webapp-session")?.value;
  if (token) await deleteSession(token);
  const res = NextResponse.redirect(new URL("/login", req.url));
  res.cookies.delete("webapp-session");
  return res;
}

export async function GET(req: NextRequest) { return logout(req); }
export async function POST(req: NextRequest) { return logout(req); }
