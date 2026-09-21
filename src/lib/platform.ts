import { getSetting, setSetting } from "./encryption";
export { iconUrl, DEFAULT_ICON, DEFAULT_PRIMARY_COLOR } from "./platform-shared";

export interface PlatformInfo {
  name: string;
  title: string;
  icon: string;
  primaryColor: string;
}

export async function getPlatformInfo(): Promise<PlatformInfo> {
  const [name, title, icon, primaryColor] = await Promise.all([
    getSetting("platform_name"),
    getSetting("platform_title"),
    getSetting("platform_icon"),
    getSetting("platform_primary_color"),
  ]);
  return {
    name: name || "Platform",
    title: title || "",
    icon: icon || "solar:layers-bold",
    primaryColor: primaryColor || "#0d9488",
  };
}

export async function setPlatformInfo(info: Partial<PlatformInfo>) {
  await Promise.all([
    info.name !== undefined ? setSetting("platform_name", info.name) : Promise.resolve(),
    info.title !== undefined ? setSetting("platform_title", info.title) : Promise.resolve(),
    info.icon !== undefined ? setSetting("platform_icon", info.icon) : Promise.resolve(),
    info.primaryColor !== undefined ? setSetting("platform_primary_color", info.primaryColor) : Promise.resolve(),
  ]);
}
