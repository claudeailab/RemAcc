import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { Toaster } from "sonner";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import TabAccount from "@/components/TabAccount";
import { getPlatformInfo, iconUrl } from "@/lib/platform";

const geist = Geist({ subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const platform = await getPlatformInfo();
  const favicon = iconUrl(platform.icon, encodeURIComponent(platform.primaryColor));
  return {
    title: platform.title ? `${platform.name} · ${platform.title}` : platform.name,
    description: platform.title || `${platform.name} application`,
    icons: { icon: favicon, apple: favicon },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#141414" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const theme = cookieStore.get("webapp-theme")?.value;
  const dataTheme = theme === "light" || theme === "dark" ? theme : undefined;
  const rawDesign = cookieStore.get("webapp-design-theme")?.value;
  const DESIGN_THEMES = ["default", "slate", "midnight", "forest", "rose", "obsidian"];
  const dataDesign = rawDesign && DESIGN_THEMES.includes(rawDesign) && rawDesign !== "default" ? rawDesign : undefined;
  const platform = await getPlatformInfo();

  return (
    <html
      lang="en"
      {...(dataTheme ? { "data-theme": dataTheme } : {})}
      {...(dataDesign ? { "data-design-theme": dataDesign } : {})}
      style={{ "--color-primary": platform.primaryColor, "--color-ring": platform.primaryColor } as React.CSSProperties}
    >
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className={geist.className}>
        {children}
        <Toaster richColors position="top-right" />
        <ServiceWorkerRegister />
        <TabAccount />
      </body>
    </html>
  );
}
