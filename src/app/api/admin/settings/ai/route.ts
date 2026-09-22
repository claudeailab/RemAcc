import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  provider: z.enum(["anthropic", "openai"]),
  apiKey: z.string().optional(),
  model: z.string(),
  enabled: z.boolean().optional(),
});

export async function GET() {
  await requireAdmin();
  const [anthropicModel, openaiModel, anthropicKey, openaiKey, anthropicEnabled, openaiEnabled] = await Promise.all([
    getSetting("anthropic_model"),
    getSetting("openai_model"),
    getSetting("anthropic_apiKey"),
    getSetting("openai_apiKey"),
    getSetting("anthropic_enabled"),
    getSetting("openai_enabled"),
  ]);
  return NextResponse.json({
    anthropicModel: anthropicModel ?? "claude-sonnet-4-6",
    openaiModel: openaiModel ?? "gpt-4o",
    anthropicKeySet: !!anthropicKey,
    openaiKeySet: !!openaiKey,
    anthropicEnabled: anthropicEnabled !== "false",
    openaiEnabled: openaiEnabled !== "false",
  });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { provider, apiKey, model, enabled } = parsed.data;

  const prevModel = await getSetting(`${provider}_model`);
  if (apiKey) await setSetting(`${provider}_apiKey`, apiKey);
  await setSetting(`${provider}_model`, model);
  if (enabled !== undefined) await setSetting(`${provider}_enabled`, String(enabled));

  const changes: string[] = [];
  if (apiKey) changes.push("apiKey: [updated]");
  if (model !== (prevModel ?? "")) changes.push(`model: ${prevModel ?? "(unset)"}→${model}`);
  if (enabled !== undefined) changes.push(`enabled: ${enabled}`);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "update", resource: `settings.ai.${provider}`, detail: changes.join("; ") || "no changes", ip });
  return NextResponse.json({ ok: true });
}
