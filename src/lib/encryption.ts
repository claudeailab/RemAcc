import crypto from "crypto";

const KEY = crypto.createHash("sha256").update(process.env.WEBAPP_ENCRYPTION_KEY ?? "").digest();
const ALGO = "aes-256-gcm";

// Env var overrides for settings — when set, they take precedence over the DB.
// Uses explicit static process.env references (not dynamic bracket access) so
// Next.js / webpack can resolve them correctly at runtime.
export function getEnvOverride(key: string): string | undefined {
  switch (key) {
    // AI
    case "anthropic_enabled":       return process.env.WEBAPP_ANTHROPIC_ENABLED;
    case "anthropic_apiKey":        return process.env.WEBAPP_ANTHROPIC_API_KEY;
    case "anthropic_model":         return process.env.WEBAPP_ANTHROPIC_MODEL;
    case "openai_enabled":          return process.env.WEBAPP_OPENAI_ENABLED;
    case "openai_apiKey":           return process.env.WEBAPP_OPENAI_API_KEY;
    case "openai_model":            return process.env.WEBAPP_OPENAI_MODEL;
    // Email / SMTP
    case "smtp_enabled":            return process.env.WEBAPP_SMTP_ENABLED;
    case "smtp_host":               return process.env.WEBAPP_SMTP_HOST;
    case "smtp_port":               return process.env.WEBAPP_SMTP_PORT;
    case "smtp_ssl":                return process.env.WEBAPP_SMTP_SSL;
    case "smtp_user":               return process.env.WEBAPP_SMTP_USER;
    case "smtp_password":           return process.env.WEBAPP_SMTP_PASSWORD;
    case "smtp_fromName":           return process.env.WEBAPP_SMTP_FROM_NAME;
    case "smtp_fromEmail":          return process.env.WEBAPP_SMTP_FROM_EMAIL;
    // Microsoft 365
    case "m365_enabled":            return process.env.WEBAPP_M365_ENABLED;
    case "m365_clientId":           return process.env.WEBAPP_M365_CLIENT_ID;
    case "m365_clientSecret":       return process.env.WEBAPP_M365_CLIENT_SECRET;
    case "m365_tenantId":           return process.env.WEBAPP_M365_TENANT_ID;
    case "m365_expiryDate":         return process.env.WEBAPP_M365_EXPIRY_DATE;
    case "m365_reminderDays":       return process.env.WEBAPP_M365_REMINDER_DAYS;
    // Stripe
    case "stripe_enabled":          return process.env.WEBAPP_STRIPE_ENABLED;
    case "stripe_liveMode":         return process.env.WEBAPP_STRIPE_LIVE_MODE;
    case "stripe_publishableKey":   return process.env.WEBAPP_STRIPE_PUBLISHABLE_KEY;
    case "stripe_secretKey":        return process.env.WEBAPP_STRIPE_SECRET_KEY;
    case "stripe_webhookSecret":    return process.env.WEBAPP_STRIPE_WEBHOOK_SECRET;
    // PayPal
    case "paypal_enabled":          return process.env.WEBAPP_PAYPAL_ENABLED;
    case "paypal_liveMode":         return process.env.WEBAPP_PAYPAL_LIVE_MODE;
    case "paypal_clientId":         return process.env.WEBAPP_PAYPAL_CLIENT_ID;
    case "paypal_clientSecret":     return process.env.WEBAPP_PAYPAL_CLIENT_SECRET;
    // Viva Wallet
    case "vivawallet_enabled":      return process.env.WEBAPP_VIVA_ENABLED;
    case "vivawallet_liveMode":     return process.env.WEBAPP_VIVA_LIVE_MODE;
    case "vivawallet_clientId":     return process.env.WEBAPP_VIVA_CLIENT_ID;
    case "vivawallet_clientSecret": return process.env.WEBAPP_VIVA_CLIENT_SECRET;
    case "vivawallet_merchantId":   return process.env.WEBAPP_VIVA_MERCHANT_ID;
    default:                        return undefined;
  }
}

// Keys that can be overridden via env vars (for UI "locked" state detection)
export const ENV_SETTING_KEYS = new Set([
  "anthropic_enabled","anthropic_apiKey","anthropic_model",
  "openai_enabled","openai_apiKey","openai_model",
  "smtp_enabled","smtp_host","smtp_port","smtp_ssl","smtp_user","smtp_password","smtp_fromName","smtp_fromEmail",
  "m365_enabled","m365_clientId","m365_clientSecret","m365_tenantId","m365_expiryDate","m365_reminderDays",
  "stripe_enabled","stripe_liveMode","stripe_publishableKey","stripe_secretKey","stripe_webhookSecret",
  "paypal_enabled","paypal_liveMode","paypal_clientId","paypal_clientSecret",
  "vivawallet_enabled","vivawallet_liveMode","vivawallet_clientId","vivawallet_clientSecret","vivawallet_merchantId",
]);

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
  const envVal = getEnvOverride(key);
  if (envVal !== undefined && envVal !== "") return envVal;
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
