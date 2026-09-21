"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Settings, Users, CreditCard, Mail, Bot, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Features } from "@/lib/features";
import type { PlatformInfo } from "@/lib/platform";
import { iconUrl } from "@/lib/platform-shared";
import version from "../../../version.json";

interface NavItem { href: string; label: string; icon: React.ElementType }
interface Props {
  user: { email: string; displayName?: string | null };
  features: Features;
  platform: PlatformInfo;
}

function initials(str: string) {
  const parts = str.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return str.slice(0, 2).toUpperCase();
}

export default function AdminSidebar({ user, features, platform }: Props) {
  const path = usePathname();

  const navLink = (href: string, label: string, Icon: React.ElementType, exact = false) => {
    const active = exact ? path === href : path.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        className={cn(
          "group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-all duration-150",
          active
            ? "nav-active font-medium"
            : "text-foreground/80 hover:bg-secondary hover:text-foreground"
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0", active ? "nav-active-icon" : "opacity-50 group-hover:opacity-80")} />
        {label}
      </Link>
    );
  };

  const navGroup = (title: string, items: NavItem[]) => {
    if (items.length === 0) return null;
    return (
      <div className="mt-5">
        <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </p>
        <div className="flex flex-col gap-0.5">
          {items.map(({ href, label, icon: Icon }) => navLink(href, label, Icon))}
        </div>
      </div>
    );
  };

  const systemItems: NavItem[] = [
    { href: "/admin/settings", label: "Settings", icon: SlidersHorizontal },
    { href: "/admin/users", label: "Users", icon: Users },
    ...(features.payments ? [{ href: "/admin/payments", label: "Payments", icon: CreditCard }] : []),
    ...(features.subscriptions ? [{ href: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard }] : []),
    ...(features.m365 ? [{ href: "/admin/m365", label: "Microsoft 365", icon: Settings }] : []),
    ...(features.email ? [{ href: "/admin/email", label: "Email Settings", icon: Mail }] : []),
    ...(features.ai ? [{ href: "/admin/ai", label: "Artificial Intelligence", icon: Bot }] : []),
  ];

  const mobileItems = [
    { href: "/admin", label: "Home", icon: LayoutDashboard, exact: true },
    { href: "/admin/users", label: "Users", icon: Users },
    ...(features.payments ? [{ href: "/admin/payments", label: "Payments", icon: CreditCard }] : []),
    ...(features.subscriptions ? [{ href: "/admin/subscriptions", label: "Plans", icon: CreditCard }] : []),
    ...(features.ai ? [{ href: "/admin/ai", label: "AI", icon: Bot }] : []),
  ];

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sidebar-panel hidden md:flex flex-col fixed inset-y-0 left-0 w-56 z-40 border-r">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg shrink-0 relative"
            style={{ background: "color-mix(in srgb, var(--color-primary) 12%, transparent)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={iconUrl(platform.icon, encodeURIComponent(platform.primaryColor))}
              alt=""
              className="h-5 w-5"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).nextElementSibling?.removeAttribute("hidden"); }}
            />
            <span hidden className="text-primary text-xs font-bold absolute">{platform.name.slice(0, 1).toUpperCase()}</span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-sm tracking-tight text-foreground truncate">{platform.name}</span>
            {platform.title && <span className="text-[10px] text-muted-foreground truncate">{platform.title}</span>}
            <span className="text-[11px] text-foreground/50 font-mono font-medium">v{version.version}</span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 flex flex-col">
          {navLink("/admin", "Dashboard", LayoutDashboard, true)}
          {navGroup("System", systemItems)}
        </nav>

        {/* User */}
        <div className="p-3 border-t">
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-secondary transition-colors cursor-default">
            <div
              className="h-7 w-7 rounded-full flex items-center justify-center text-primary text-[10px] font-bold shrink-0"
              style={{ background: "color-mix(in srgb, var(--color-primary) 12%, transparent)" }}
            >
              {initials(user.displayName ?? user.email)}
            </div>
            <span className="text-xs text-foreground/70 truncate">{user.displayName ?? user.email}</span>
          </div>
        </div>
      </aside>

      {/* Mobile bottom bar */}
      <nav className="sidebar-panel md:hidden fixed bottom-0 inset-x-0 border-t z-40 flex">
        {mobileItems.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? path === href : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2 text-xs transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="truncate max-w-[4rem]">{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
