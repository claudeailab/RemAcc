import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { binary_assets } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { logAudit } from "@/lib/audit";
import fs from "fs";
import path from "path";

const UVNC_DIR = "/tmp/uvnc";
const ALLOWED_KEYS = ["uvnc_viewer", "uvnc_plugin", "uvnc_pkey"] as const;
type UvncKey = typeof ALLOWED_KEYS[number];

async function writeManifest() {
  const rows = await db.select({ key: binary_assets.key, filename: binary_assets.filename })
    .from(binary_assets).then(r => r.filter(x => ALLOWED_KEYS.includes(x.key as UvncKey)));
  const manifest: Record<string, string> = {};
  for (const r of rows) manifest[r.key] = r.filename;
  if (!fs.existsSync(UVNC_DIR)) fs.mkdirSync(UVNC_DIR, { recursive: true });
  fs.writeFileSync(path.join(UVNC_DIR, "manifest.json"), JSON.stringify(manifest));
}

const KEY_LABELS: Record<UvncKey, string> = {
  uvnc_viewer: "UltraVNC Viewer (vncviewer.exe)",
  uvnc_plugin: "DSM Plugin (SecureVNCPlugin64.dsm)",
  uvnc_pkey:   "Client Key (.pkey)",
};

export async function GET() {
  await requireAdmin();
  const rows = await db.select({
    key: binary_assets.key,
    filename: binary_assets.filename,
    size: binary_assets.size,
    updatedAt: binary_assets.updatedAt,
  }).from(binary_assets).then(r => r.filter(x => ALLOWED_KEYS.includes(x.key as UvncKey)));

  const status = ALLOWED_KEYS.map(k => {
    const row = rows.find(r => r.key === k);
    return { key: k, label: KEY_LABELS[k], uploaded: !!row, filename: row?.filename ?? null, size: row?.size ?? null, updatedAt: row?.updatedAt ?? null };
  });
  return NextResponse.json(status);
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const key = req.nextUrl.searchParams.get("key") as UvncKey | null;
  if (!key || !ALLOWED_KEYS.includes(key)) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const bytes = await file.arrayBuffer();
  const buf = Buffer.from(bytes);
  const b64 = buf.toString("base64");
  const filename = file.name;

  await db.insert(binary_assets)
    .values({ key, filename, data: b64, size: buf.length })
    .onDuplicateKeyUpdate({ set: { filename, data: b64, size: buf.length } });

  // Write to disk immediately
  if (!fs.existsSync(UVNC_DIR)) fs.mkdirSync(UVNC_DIR, { recursive: true });
  fs.writeFileSync(path.join(UVNC_DIR, filename), buf);
  await writeManifest();

  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "update", resource: `uvnc_file:${key}`, detail: filename, ip });
  return NextResponse.json({ ok: true, filename, size: buf.length });
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  const key = req.nextUrl.searchParams.get("key") as UvncKey | null;
  if (!key || !ALLOWED_KEYS.includes(key)) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  const [existing] = await db.select().from(binary_assets).where(eq(binary_assets.key, key)).limit(1);
  if (existing) {
    await db.delete(binary_assets).where(eq(binary_assets.key, key));
    try { fs.unlinkSync(path.join(UVNC_DIR, existing.filename)); } catch {}
    await writeManifest();
  }

  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "delete", resource: `uvnc_file:${key}`, detail: "", ip });
  return NextResponse.json({ ok: true });
}
