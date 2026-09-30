import Link from "next/link";
import { MessageSquarePlus } from "lucide-react";
import { getPlatformInfo } from "@/lib/platform";
import { iconUrl } from "@/lib/platform-shared";
import UserNavbarClient from "./UserNavbarClient";
import UserIdentity from "./UserIdentity";
import { getUser } from "@/lib/auth";
import { versionBadge } from "@/lib/ui-conventions";
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
  const user = await getUser();
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
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-base tracking-tight text-foreground truncate leading-tight">{platform.name}</span>
            {version && <span className={`${versionBadge} shrink-0`}>v{version}</span>}
          </div>
          {platform.title && (
            <span className="text-[11px] text-muted-foreground truncate leading-tight">{platform.title}</span>
          )}
        </div>
      </Link>
      <div className="flex items-center gap-2 min-w-0 ml-3">
        {user && <UserIdentity user={user} compact className="max-w-[40vw]" />}
        <UserNavbarClient />
        <a
          href="https://gd.mcd.cy/tickets/new"
          target="_blank"
          rel="noopener noreferrer"
          title="Report a bug or suggest an improvement"
          aria-label="Report a bug or suggest an improvement"
          className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-secondary transition-colors shrink-0"
        >
          <MessageSquarePlus className="h-4 w-4" />
        </a>
      </div>
    </header>
  );
}
