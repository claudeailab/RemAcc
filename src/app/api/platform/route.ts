import { NextResponse } from "next/server";
import { getPlatformInfo, iconUrl } from "@/lib/platform";
import { getSetting } from "@/lib/encryption";

export async function GET() {
  const [info, enabled, clientId, clientSecret, tenantId] = await Promise.all([
    getPlatformInfo(),
    getSetting("m365_enabled"),
    getSetting("m365_clientId"),
    getSetting("m365_clientSecret"),
    getSetting("m365_tenantId"),
  ]);
  return NextResponse.json({
    name: info.name,
    title: info.title,
    icon: info.icon,
    primaryColor: info.primaryColor,
    iconUrl: iconUrl(info.icon, encodeURIComponent(info.primaryColor)),
    iconUrlWhite: iconUrl(info.icon, "%23ffffff"),
    azureLogin: enabled !== "false" && !!clientId && !!clientSecret && !!tenantId,
  });
}
