import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  enabled: z.boolean(),
  host: z.string(),
  port: z.coerce.number().int().min(1).max(65535),
  ssl: z.boolean(),
  user: z.string(),
  password: z.string(),
  fromName: z.string(),
  fromEmail: z.union([z.string().email(), z.literal("")]),
});

export async function GET() {
  await requireAdmin();
  const [enabled, host, port, ssl, fromName, fromEmail, user, password] = await Promise.all([
    getSetting("smtp_enabled"),
    getSetting("smtp_host"),
    getSetting("smtp_port"),
    getSetting("smtp_ssl"),
    getSetting("smtp_fromName"),
    getSetting("smtp_fromEmail"),
    getSetting("smtp_user"),
    getSetting("smtp_password"),
  ]);
  return NextResponse.json({ data: { enabled: enabled !== "false", host: host ?? "", port: port ?? "587", ssl: ssl === "true", user: user ?? "", fromName: fromName ?? "", fromEmail: fromEmail ?? "", passwordSet: !!password } });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { enabled, host, port, ssl, user, password, fromName, fromEmail } = parsed.data;

  const [prevHost, prevPort, prevSsl, prevUser, prevFromName, prevFromEmail] = await Promise.all([
    getSetting("smtp_host"),
    getSetting("smtp_port"),
    getSetting("smtp_ssl"),
    getSetting("smtp_user"),
    getSetting("smtp_fromName"),
    getSetting("smtp_fromEmail"),
  ]);

  await Promise.all([
    setSetting("smtp_enabled", String(enabled)),
    setSetting("smtp_host", host),
    setSetting("smtp_port", String(port)),
    setSetting("smtp_ssl", String(ssl)),
    user ? setSetting("smtp_user", user) : Promise.resolve(),
    password ? setSetting("smtp_password", password) : Promise.resolve(),
    fromName ? setSetting("smtp_fromName", fromName) : Promise.resolve(),
    fromEmail ? setSetting("smtp_fromEmail", fromEmail) : Promise.resolve(),
  ]);

  const changes: string[] = [];
  changes.push(`enabled: ${enabled}`);
  if (host !== (prevHost ?? "")) changes.push(`host: ${prevHost ?? "(unset)"}→${host}`);
  if (String(port) !== (prevPort ?? "587")) changes.push(`port: ${prevPort ?? "587"}→${port}`);
  if (String(ssl) !== (prevSsl ?? "false")) changes.push(`ssl: ${prevSsl ?? "false"}→${ssl}`);
  if (user && user !== (prevUser ?? "")) changes.push(`user: ${prevUser ?? "(unset)"}→${user}`);
  if (password) changes.push("password: [updated]");
  if (fromName && fromName !== (prevFromName ?? "")) changes.push(`fromName: ${prevFromName ?? "(unset)"}→${fromName}`);
  if (fromEmail && fromEmail !== (prevFromEmail ?? "")) changes.push(`fromEmail: ${prevFromEmail ?? "(unset)"}→${fromEmail}`);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "update", resource: "settings.email", detail: changes.join("; ") || "no changes", ip });
  return NextResponse.json({ ok: true });
}
