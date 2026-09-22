import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const icon = req.nextUrl.searchParams.get("icon");
  const color = req.nextUrl.searchParams.get("color") ?? "%236366f1";
  if (!icon) return new NextResponse("Missing icon", { status: 400 });

  const colon = icon.indexOf(":");
  let upstreamUrl: string;
  if (colon === -1) {
    upstreamUrl = `https://api.iconify.design/${icon}.svg?color=${color}`;
  } else {
    const prefix = icon.slice(0, colon);
    const name = icon.slice(colon + 1);
    upstreamUrl = `https://api.iconify.design/${prefix}/${name}.svg?color=${color}`;
  }

  try {
    const r = await fetch(upstreamUrl, { next: { revalidate: 86400 } });
    if (!r.ok) return new NextResponse(null, { status: r.status });
    const svg = await r.text();
    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
