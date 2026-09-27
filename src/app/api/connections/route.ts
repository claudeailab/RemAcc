import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { connections, folders, users, permission_groups } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
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
  const [allConnections, allFolders] = await Promise.all([
    db.select().from(connections).orderBy(connections.name),
    db.select().from(folders).orderBy(folders.name),
  ]);
  return NextResponse.json({ connections: allConnections, folders: allFolders });
}
