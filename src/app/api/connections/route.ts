import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { connections, folders } from "@/lib/db/schema";

export async function GET() {
  await requireSession();
  const [allConnections, allFolders] = await Promise.all([
    db.select().from(connections).orderBy(connections.name),
    db.select().from(folders).orderBy(folders.name),
  ]);
  return NextResponse.json({ connections: allConnections, folders: allFolders });
}
