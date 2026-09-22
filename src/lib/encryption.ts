import crypto from "crypto";

const KEY = crypto.createHash("sha256").update(process.env.WEBAPP_ENCRYPTION_KEY ?? "").digest();
const ALGO = "aes-256-gcm";

// Env var overrides for settings — when set, they take precedence over the DB.
// This lets docker-compose pre-configure integrations without touching the admin UI.
export const ENV_SETTING_MAP: Record<string, string> = {
  // AI
  anthropic_apiKey:        "WEBAPP_ANTHROPIC_API_KEY",
  anthropic_model:         "WEBAPP_ANTHROPIC_MODEL",
  openai_apiKey:           "WEBAPP_OPENAI_API_KEY",
  openai_model:            "WEBAPP_OPENAI_MODEL",
  // Email / SMTP
  smtp_host:               "WEBAPP_SMTP_HOST",
  smtp_port:               "WEBAPP_SMTP_PORT",
  smtp_ssl:                "WEBAPP_SMTP_SSL",
  smtp_user:               "WEBAPP_SMTP_USER",
  smtp_password:           "WEBAPP_SMTP_PASSWORD",
  smtp_fromName:           "WEBAPP_SMTP_FROM_NAME",
  smtp_fromEmail:          "WEBAPP_SMTP_FROM_EMAIL",
  // Microsoft 365
  m365_clientId:           "WEBAPP_M365_CLIENT_ID",
  m365_clientSecret:       "WEBAPP_M365_CLIENT_SECRET",
  m365_tenantId:           "WEBAPP_M365_TENANT_ID",
  m365_expiryDate:         "WEBAPP_M365_EXPIRY_DATE",
  m365_reminderDays:       "WEBAPP_M365_REMINDER_DAYS",
  // Stripe
  stripe_liveMode:         "WEBAPP_STRIPE_LIVE_MODE",
  stripe_publishableKey:   "WEBAPP_STRIPE_PUBLISHABLE_KEY",
  stripe_secretKey:        "WEBAPP_STRIPE_SECRET_KEY",
  stripe_webhookSecret:    "WEBAPP_STRIPE_WEBHOOK_SECRET",
  // PayPal
  paypal_enabled:          "WEBAPP_PAYPAL_ENABLED",
  paypal_liveMode:         "WEBAPP_PAYPAL_LIVE_MODE",
  paypal_clientId:         "WEBAPP_PAYPAL_CLIENT_ID",
  paypal_clientSecret:     "WEBAPP_PAYPAL_CLIENT_SECRET",
  // Viva Wallet
  vivawallet_enabled:      "WEBAPP_VIVA_ENABLED",
  vivawallet_liveMode:     "WEBAPP_VIVA_LIVE_MODE",
  vivawallet_clientId:     "WEBAPP_VIVA_CLIENT_ID",
  vivawallet_clientSecret: "WEBAPP_VIVA_CLIENT_SECRET",
  vivawallet_merchantId:   "WEBAPP_VIVA_MERCHANT_ID",
};

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(":");
}

export function decrypt(ciphertext: string): string {
  const [ivHex, tagHex, dataHex] = ciphertext.split(":");
  const decipher = crypto.createDecipheriv(ALGO, KEY, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return decipher.update(Buffer.from(dataHex, "hex")) + decipher.final("utf8");
}

export async function getSetting(key: string): Promise<string | null> {
  const envVar = ENV_SETTING_MAP[key];
  if (envVar) {
    const val = process.env[envVar];
    if (val !== undefined && val !== "") return val;
  }
  const { db } = await import("./db");
  const { settings } = await import("./db/schema");
  const { eq } = await import("drizzle-orm");
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).limit(1);
  if (!row) return null;
  try { return decrypt(row.value); } catch { return null; }
}

export async function setSetting(key: string, value: string): Promise<void> {
  const { db } = await import("./db");
  const { settings } = await import("./db/schema");
  const { sql } = await import("drizzle-orm");
  const encrypted = encrypt(value);
  await db.insert(settings).values({ key, value: encrypted })
    .onDuplicateKeyUpdate({ set: { value: sql`values(value)`, updatedAt: sql`now()` } });
}
