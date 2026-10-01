import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { setSetting } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";
import { getVncSettings } from "@/lib/protocol-settings";
import { z } from "zod";

const schema = z.object({
  colorDepth: z.enum(["8", "16", "24", "32"]),
  encoding: z.enum(["tight", "zrle", "ultra", "copyrect", "hextile", "zlib", "corre", "rre", "raw"]),
  readOnly: z.boolean(),
  swapRedBlue: z.boolean(),
  cursor: z.enum(["remote", "local", "none"]),
});

export async function GET() {
  await requireAdmin();
  return NextResponse.json(await getVncSettings());
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  await setSetting("vnc_settings", JSON.stringify(parsed.data));
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "update", resource: "vnc_settings", detail: "", ip });
  return NextResponse.json({ ok: true });
}
