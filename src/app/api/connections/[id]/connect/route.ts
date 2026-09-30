import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { connections, folders, credentials, users, permission_groups } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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

  // Resolve credential: connection's own, then walk folder ancestors until found
  let credId = conn.credentialId ?? null;
  if (!credId && conn.folderId) {
    const allFolders = await db.select({ id: folders.id, parentId: folders.parentId, credentialId: folders.credentialId }).from(folders);
    let folderId: number | null = conn.folderId;
    while (folderId !== null && !credId) {
      const folder = allFolders.find(f => f.id === folderId);
      if (!folder) break;
      if (folder.credentialId) { credId = folder.credentialId; break; }
      folderId = folder.parentId ?? null;
    }
  }

  let cred: { username: string; password: string; domain: string | null } | null = null;
  if (credId) {
    const [row] = await db.select().from(credentials).where(eq(credentials.id, credId)).limit(1);
    if (row) {
      cred = { username: row.username, password: decrypt(row.password), domain: row.domain ?? null };
    }
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
  });
}
