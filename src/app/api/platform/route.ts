import { NextResponse } from "next/server";
import { getPlatformInfo, iconUrl } from "@/lib/platform";

export async function GET() {
  const info = await getPlatformInfo();
  return NextResponse.json({
    name: info.name,
    title: info.title,
    icon: info.icon,
    primaryColor: info.primaryColor,
    iconUrl: iconUrl(info.icon, encodeURIComponent(info.primaryColor)),
    iconUrlWhite: iconUrl(info.icon, "%23ffffff"),
  });
}
