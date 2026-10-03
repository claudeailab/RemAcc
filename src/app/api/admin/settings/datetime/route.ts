import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getDateTimeSettings, setDateTimeSettings } from "@/lib/datetime";
import { DATE_FORMATS, TIME_FORMATS, isTimeZone } from "@/lib/datetime-shared";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  timezone: z.string().max(64).refine(isTimeZone),
  dateFormat: z.enum(DATE_FORMATS),
  timeFormat: z.enum(TIME_FORMATS),
});

export async function GET() {
  await requireAdmin();
  return NextResponse.json(await getDateTimeSettings());
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  await setDateTimeSettings(parsed.data);
  revalidatePath("/admin", "layout");
  const { timezone, dateFormat, timeFormat } = parsed.data;
  await logAudit({
    userEmail: admin.email, action: "update", resource: "datetime",
    detail: `timezone=${timezone}; dateFormat=${dateFormat}; timeFormat=${timeFormat}`,
    ip: req.headers.get("x-forwarded-for") ?? "unknown",
  });
  return NextResponse.json({ ok: true });
}
