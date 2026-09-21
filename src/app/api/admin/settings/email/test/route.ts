import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getSetting } from "@/lib/encryption";
import { getPlatformInfo } from "@/lib/platform";
import nodemailer from "nodemailer";

const schema = z.object({ to: z.string().email() });

export async function POST(req: NextRequest) {
  await requireAdmin();
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const host = await getSetting("smtp_host");
  const port = await getSetting("smtp_port");
  const ssl = await getSetting("smtp_ssl");
  const user = await getSetting("smtp_user");
  const password = await getSetting("smtp_password");
  const fromName = await getSetting("smtp_fromName");
  const fromEmail = await getSetting("smtp_fromEmail");

  if (!host || !fromEmail) return NextResponse.json({ error: "SMTP not configured" }, { status: 400 });

  const platform = await getPlatformInfo();

  try {
    const transporter = nodemailer.createTransport({
      host,
      port: Number(port ?? 587),
      secure: ssl === "true",
      auth: user && password ? { user, pass: password } : undefined,
    });
    await transporter.sendMail({ from: `${fromName} <${fromEmail}>`, to: parsed.data.to, subject: "Test Email", text: `This is a test email from ${platform.name}.` });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to send email" }, { status: 400 });
  }
}
