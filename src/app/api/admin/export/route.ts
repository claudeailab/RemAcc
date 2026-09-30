import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { folders, connections } from "@/lib/db/schema";

function buildFolderPath(folderRows: { id: number; name: string; parentId: number | null }[], folderId: number | null): string {
  if (!folderId) return "";
  const f = folderRows.find(r => r.id === folderId);
  if (!f) return "";
  if (f.parentId) {
    const parent = folderRows.find(r => r.id === f.parentId);
    return parent ? `${parent.name}\\${f.name}` : f.name;
  }
  return f.name;
}

function exportType(protocol: string, dsm: boolean): string {
  if (protocol === "vnc" && dsm) return "UltraVNC";
  return protocol.toUpperCase();
}

function isDsm(options: string | null): boolean {
  try { return !!(options && JSON.parse(options).dsmPlugin); } catch { return false; }
}

export async function GET() {
  await requireAdmin();

  const [folderRows, connRows] = await Promise.all([
    db.select().from(folders),
    db.select().from(connections).orderBy(connections.name),
  ]);

  const data = connRows.map(c => {
    const dsm = isDsm(c.options);
    return {
      IP: c.host,
      OPTIONS: dsm ? "DSM" : "",
      TYPE: exportType(c.protocol, dsm),
      NAME: c.name,
      FOLDER: buildFolderPath(folderRows, c.folderId),
    };
  });

  const ws = XLSX.utils.json_to_sheet(data, { header: ["IP", "OPTIONS", "TYPE", "NAME", "FOLDER"] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Connections");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const buffer = buf instanceof Buffer ? buf : Buffer.from(buf);

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="connections.xlsx"',
    },
  });
}
