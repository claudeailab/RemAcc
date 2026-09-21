import type { MetadataRoute } from "next";
import { getPlatformInfo } from "@/lib/platform";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const platform = await getPlatformInfo();
  return {
    name: platform.name,
    short_name: platform.name,
    description: `${platform.name} application`,
    start_url: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#09090b",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
