import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const prefix = req.nextUrl.searchParams.get("prefix");
  if (!prefix) return NextResponse.json({ icons: [] }, { status: 400 });

  try {
    const r = await fetch(`https://api.iconify.design/collection?prefix=${encodeURIComponent(prefix)}`, {
      next: { revalidate: 3600 },
    });
    if (!r.ok) return NextResponse.json({ icons: [] }, { status: r.status });
    const data = await r.json();
    // data.icons is an object keyed by icon name; return first 80 as full ids
    const names: string[] = Object.keys(data.icons ?? {}).slice(0, 80);
    const icons = names.map((n: string) => `${prefix}:${n}`);
    return NextResponse.json({ icons }, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch {
    return NextResponse.json({ icons: [] }, { status: 502 });
  }
}
