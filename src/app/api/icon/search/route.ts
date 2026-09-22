import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("query") ?? "";
  const limit = req.nextUrl.searchParams.get("limit") ?? "60";
  const prefixes = req.nextUrl.searchParams.get("prefixes") ?? "";

  const params = new URLSearchParams({ query, limit });
  if (prefixes) params.set("prefixes", prefixes);

  try {
    const r = await fetch(`https://api.iconify.design/search?${params}`, {
      next: { revalidate: 300 },
    });
    if (!r.ok) return NextResponse.json({ icons: [] }, { status: r.status });
    const data = await r.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  } catch {
    return NextResponse.json({ icons: [] }, { status: 502 });
  }
}
