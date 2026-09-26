import Link from "next/link";
import { getPlatformInfo } from "@/lib/platform";
import { iconUrl } from "@/lib/platform-shared";
import UserNavbarClient from "./UserNavbarClient";

export default async function UserNavbar() {
  const platform = await getPlatformInfo();
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
      </Link>
      <UserNavbarClient />
    </header>
  );
}
