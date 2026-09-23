"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Settings, Users, CreditCard, Mail, Bot, SlidersHorizontal, Menu, X, LogOut, Sparkles } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import type { Features } from "@/lib/features";
import type { PlatformInfo } from "@/lib/platform";
import { iconUrl } from "@/lib/platform-shared";
import version from "../../../version.json";

interface NavItem { href: string; label: string; icon: React.ElementType; exact?: boolean }
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
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleLogout = () => { window.location.href = "/api/auth/logout"; };

  const allNavItems: NavItem[] = [
    { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { href: "/admin/settings", label: "Settings", icon: SlidersHorizontal },
    ...(features.users ? [{ href: "/admin/users", label: "Users", icon: Users }] : []),
    ...(features.payments ? [{ href: "/admin/payments", label: "Payments", icon: CreditCard }] : []),
    ...(features.featureCatalog ? [{ href: "/admin/features", label: "Features", icon: Sparkles }] : []),
    ...(features.subscriptions ? [{ href: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard }] : []),
    ...(features.m365 ? [{ href: "/admin/m365", label: "Microsoft 365", icon: Settings }] : []),
    ...(features.email ? [{ href: "/admin/email", label: "Email Settings", icon: Mail }] : []),
    ...(features.ai ? [{ href: "/admin/ai", label: "Artificial Intelligence", icon: Bot }] : []),
  ];

  const navLink = (item: NavItem, onClick?: () => void) => {
    const active = item.exact ? path === item.href : path.startsWith(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onClick}
        className={cn(
          "group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-all duration-150",
          active ? "nav-active font-medium" : "text-foreground/80 hover:bg-secondary hover:text-foreground"
        )}
      >
        <item.icon className={cn("h-4 w-4 shrink-0", active ? "nav-active-icon" : "opacity-50 group-hover:opacity-80")} />
        {item.label}
      </Link>
    );
  };

  const systemItems: NavItem[] = allNavItems.filter(i => i.href !== "/admin");

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside className="sidebar-panel hidden md:flex flex-col fixed inset-y-0 left-0 w-56 z-40 border-r">
        <div className="flex items-center gap-2.5 px-4 py-4 border-b">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg shrink-0 relative"
            style={{ background: "color-mix(in srgb, var(--color-primary) 12%, transparent)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={iconUrl(platform.icon, encodeURIComponent(platform.primaryColor))}
              alt=""
              className="h-8 w-8"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).nextElementSibling?.removeAttribute("hidden"); }}
            />
            <span hidden className="text-primary text-xs font-bold absolute">{platform.name.slice(0, 1).toUpperCase()}</span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-base tracking-tight text-foreground truncate leading-tight">{platform.name}</span>
            {platform.title && <span className="text-xs text-muted-foreground truncate leading-tight">{platform.title}</span>}
            <span className="text-xs text-foreground/60 font-mono font-semibold leading-tight">v{version.version}</span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 flex flex-col">
          {navLink({ href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true })}
          <div className="mt-5">
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">System</p>
            <div className="flex flex-col gap-0.5">
              {systemItems.map(item => navLink(item))}
            </div>
          </div>
        </nav>

        <div className="p-3 border-t space-y-1">
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-md cursor-default">
            <div
              className="h-7 w-7 rounded-full flex items-center justify-center text-primary text-[10px] font-bold shrink-0"
              style={{ background: "color-mix(in srgb, var(--color-primary) 12%, transparent)" }}
            >
              {initials(user.displayName ?? user.email)}
            </div>
            <span className="text-xs text-foreground/70 truncate">{user.displayName ?? user.email}</span>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-foreground/70 hover:bg-secondary hover:text-foreground transition-colors"
          >
            <LogOut className="h-4 w-4 opacity-50" />
            Log out
          </button>
        </div>
      </aside>

      {/* ── Mobile header ── */}
      <header className="sidebar-panel md:hidden fixed top-0 inset-x-0 z-40 h-14 flex items-center justify-between px-4 border-b">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0 relative"
            style={{ background: "color-mix(in srgb, var(--color-primary) 12%, transparent)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={iconUrl(platform.icon, encodeURIComponent(platform.primaryColor))}
              alt=""
              className="h-6 w-6"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).nextElementSibling?.removeAttribute("hidden"); }}
            />
            <span hidden className="text-primary text-[10px] font-bold absolute">{platform.name.slice(0, 1).toUpperCase()}</span>
          </div>
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="font-bold text-base tracking-tight text-foreground truncate leading-tight">{platform.name}</span>
            <span className="text-xs text-foreground/60 font-mono font-semibold shrink-0">v{version.version}</span>
          </div>
        </div>
        <button
          onClick={() => setDrawerOpen(true)}
          className="h-9 w-9 flex items-center justify-center rounded-md hover:bg-secondary transition-colors text-foreground/70"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* ── Mobile slide-in drawer ── */}
      <DialogPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="md:hidden fixed inset-0 z-50 bg-black/50 drawer-overlay" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="md:hidden sidebar-panel drawer-content fixed inset-y-0 left-0 z-50 w-72 flex flex-col border-r shadow-xl"
          >
            <DialogPrimitive.Title className="sr-only">Navigation menu</DialogPrimitive.Title>

            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 py-4 border-b shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0 relative"
                  style={{ background: "color-mix(in srgb, var(--color-primary) 12%, transparent)" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={iconUrl(platform.icon, encodeURIComponent(platform.primaryColor))}
                    alt=""
                    className="h-7 w-7"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).nextElementSibling?.removeAttribute("hidden"); }}
                  />
                  <span hidden className="text-primary text-[10px] font-bold absolute">{platform.name.slice(0, 1).toUpperCase()}</span>
                </div>
                <span className="font-bold text-base tracking-tight text-foreground truncate">{platform.name}</span>
              </div>
              <DialogPrimitive.Close className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-secondary transition-colors text-foreground/60 shrink-0">
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>

            {/* Nav */}
            <nav className="flex-1 overflow-y-auto p-3 flex flex-col gap-0.5">
              {allNavItems.map(item => navLink(item, () => setDrawerOpen(false)))}
            </nav>

            {/* User + logout */}
            <div className="p-3 border-t shrink-0 space-y-1">
              <div className="flex items-center gap-2.5 px-2 py-2 rounded-md">
                <div
                  className="h-8 w-8 rounded-full flex items-center justify-center text-primary text-[10px] font-bold shrink-0"
                  style={{ background: "color-mix(in srgb, var(--color-primary) 12%, transparent)" }}
                >
                  {initials(user.displayName ?? user.email)}
                </div>
                <span className="text-xs text-foreground/70 truncate">{user.displayName ?? user.email}</span>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-foreground/70 hover:bg-secondary hover:text-foreground transition-colors"
              >
                <LogOut className="h-4 w-4 opacity-50" />
                Log out
              </button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
