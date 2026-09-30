import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { folders, connections } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { logAudit } from "@/lib/audit";

const TYPE_MAP: Record<string, string> = {
  rdp: "rdp", RDP: "rdp",
  vnc: "vnc", VNC: "vnc",
  ultravnc: "vnc", UltraVNC: "vnc",
  ssh: "ssh", SSH: "ssh",
  web: "web", WEB: "web",
};

function normalizeProtocol(type: string): string {
  return TYPE_MAP[type] ?? TYPE_MAP[type.toLowerCase()] ?? "vnc";
}

function isDsmType(type: string) {
  return type.toLowerCase() === "ultravnc";
}

function normalizeHost(ip: string, protocol: string): string {
  if (protocol === "web" && ip && !/^https?:\/\//i.test(ip)) {
    return `http://${ip}`;
  }
  return ip;
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws);

  // ── 1. Build folder tree from the data ──────────────────────────────────────
  // Map "ParentName\\SubName" → { parentName, subName }
  const folderPaths = new Set<string>();
  for (const row of rows) {
    const fp = (row["FOLDER"] ?? "").trim();
    if (fp) folderPaths.add(fp);
  }

  // Load existing folders once
  const existingFolders = await db.select().from(folders);

  // folderIdCache: "ParentName\\SubName" → id, "ParentName" → id
  const folderIdCache = new Map<string, number>();

  // Prime cache with existing folders by reconstructing their paths
  for (const f of existingFolders) {
    if (!f.parentId) {
      folderIdCache.set(f.name, f.id);
    }
  }
  for (const f of existingFolders) {
    if (f.parentId) {
      const parent = existingFolders.find(p => p.id === f.parentId);
      if (parent) folderIdCache.set(`${parent.name}\\${f.name}`, f.id);
    }
  }

  // Create missing folders
  for (const fp of folderPaths) {
    const parts = fp.split("\\");
    const parentName = parts[0];
    const subName = parts[1];

    // Ensure parent exists
    if (!folderIdCache.has(parentName)) {
      const result = await db.insert(folders).values({ name: parentName, parentId: null, credentialId: null }) as any;
      const parentId: number = result[0].insertId;
      folderIdCache.set(parentName, parentId);
    }

    if (subName && !folderIdCache.has(fp)) {
      const parentId = folderIdCache.get(parentName)!;
      const result = await db.insert(folders).values({ name: subName, parentId, credentialId: null }) as any;
      const subId: number = result[0].insertId;
      folderIdCache.set(fp, subId);
    }
  }

  // ── 2. Load existing connections for dedup ───────────────────────────────────
  const existingConns = await db.select({ name: connections.name, host: connections.host, protocol: connections.protocol }).from(connections);
  const existingKeys = new Set(existingConns.map(c => `${c.name}|${c.host}|${c.protocol}`));

  // ── 3. Insert connections ────────────────────────────────────────────────────
  let created = 0;
  let skipped = 0;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  for (const row of rows) {
    const rawIp   = (row["IP"]   ?? "").trim();
    const options = (row["OPTIONS"] ?? "").trim();
    const type    = (row["TYPE"] ?? "").trim();
    const name    = (row["NAME"] ?? "").trim();
    const folder  = (row["FOLDER"] ?? "").trim();

    if (!name || !rawIp || !type) { skipped++; continue; }

    const protocol = normalizeProtocol(type);
    const host = normalizeHost(rawIp, protocol);
    const dsm = isDsmType(type) || options.toUpperCase().includes("DSM");

    const key = `${name}|${host}|${protocol}`;
    if (existingKeys.has(key)) { skipped++; continue; }
    existingKeys.add(key);

    const folderId = folder ? (folderIdCache.get(folder) ?? null) : null;
    const opts = dsm ? JSON.stringify({ dsmPlugin: true }) : null;

    await db.insert(connections).values({
      name,
      host,
      port: null,
      protocol,
      folderId,
      credentialId: null,
      notes: null,
      options: opts,
    });
    created++;
  }

  await logAudit({
    userEmail: admin.email,
    action: "create",
    resource: "connection",
    detail: `import: created=${created} skipped=${skipped}`,
    ip,
  });

  return NextResponse.json({ ok: true, created, skipped, folders: folderIdCache.size });
}
