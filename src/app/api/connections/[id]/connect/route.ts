import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { connections, folders, credentials, users, permission_groups } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession();
  if (!user.isAdmin) {
    const [row] = await db
      .select({ permissions: permission_groups.permissions })
      .from(users)
      .leftJoin(permission_groups, eq(users.groupId, permission_groups.id))
      .where(eq(users.id, user.id))
      .limit(1);
    const perms: string[] = JSON.parse(row?.permissions ?? "[]");
    if (!perms.includes("view_remote_connections")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const [conn] = await db.select().from(connections).where(eq(connections.id, id)).limit(1);
  if (!conn) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Resolve credential: connection's own, then each folder ancestor; IDs of deleted credentials are skipped
  const candidates: number[] = [];
  if (conn.credentialId) candidates.push(conn.credentialId);
  if (conn.folderId) {
    const allFolders = await db.select({ id: folders.id, parentId: folders.parentId, credentialId: folders.credentialId }).from(folders);
    const seen = new Set<number>();
    let folderId: number | null = conn.folderId;
    while (folderId !== null && !seen.has(folderId)) {
      seen.add(folderId);
      const folder = allFolders.find(f => f.id === folderId);
      if (!folder) break;
      if (folder.credentialId) candidates.push(folder.credentialId);
      folderId = folder.parentId ?? null;
    }
  }

  let cred: { username: string; password: string; domain: string | null } | null = null;
  if (candidates.length) {
    const rows = await db.select().from(credentials).where(inArray(credentials.id, candidates));
    const row = candidates.map(id => rows.find(r => r.id === id)).find(Boolean);
    if (row) cred = { username: row.username, password: decrypt(row.password), domain: row.domain ?? null };
  }

  const defaultPort = conn.protocol === "rdp" ? 3389 : conn.protocol === "ssh" ? 22 : 5900;
  let options: Record<string, unknown> = {};
  try { if (conn.options) options = JSON.parse(conn.options); } catch {}
  return NextResponse.json({
    id: conn.id,
    name: conn.name,
    host: conn.host,
    port: conn.port ?? defaultPort,
    protocol: conn.protocol,
    credential: cred,
    options,
    user: user.email,
  });
}
