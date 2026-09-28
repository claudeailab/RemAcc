import Link from "next/link";
import { getPlatformInfo } from "@/lib/platform";
import { iconUrl } from "@/lib/platform-shared";
import UserNavbarClient from "./UserNavbarClient";
import { readFileSync } from "fs";
import { join } from "path";

function getVersion() {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), "version.json"), "utf8")).version as string;
  } catch { return ""; }
}

export default async function UserNavbar() {
  const platform = await getPlatformInfo();
  const version = getVersion();
  return (
    <header className="sidebar-panel fixed top-0 inset-x-0 z-40 h-14 flex items-center justify-between px-4 border-b">
      <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0 relative"
          style={{ background: "color-mix(in srgb, var(--color-primary) 12%, transparent)" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={iconUrl(platform.icon, encodeURIComponent(platform.primaryColor))}
            alt=""
            className="h-6 w-6"
          />
        </div>
        <span className="font-bold text-base tracking-tight text-foreground truncate">{platform.name}</span>
        {version && (
          <span className="text-[10px] text-muted-foreground font-mono shrink-0">v{version}</span>
        )}
      </Link>
      <UserNavbarClient />
    </header>
  );
}
