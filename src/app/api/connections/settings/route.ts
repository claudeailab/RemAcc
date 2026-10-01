import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getRdpSettings, getVncSettings, getSshSettings, getSessionGrace } from "@/lib/protocol-settings";

export async function GET() {
  await requireSession();
  const [rdp, vnc, ssh, sessionGrace] = await Promise.all([getRdpSettings(), getVncSettings(), getSshSettings(), getSessionGrace()]);
  return NextResponse.json({ rdp, vnc, ssh, sessionGrace });
}
