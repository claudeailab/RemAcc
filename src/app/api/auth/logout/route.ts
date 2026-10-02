import { NextRequest, NextResponse } from "next/server";
import { endSession } from "@/lib/auth";
import { getBaseUrl } from "@/lib/base-url";

async function logout(req: NextRequest) {
  const res = NextResponse.redirect(`${getBaseUrl(req)}/login`);
  await endSession(req, res);
  return res;
}

export async function GET(req: NextRequest) { return logout(req); }
export async function POST(req: NextRequest) { return logout(req); }
