"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Settings, Users, CreditCard, Mail, Bot, SlidersHorizontal, Menu, X, LogOut, Sparkles, Bell, ClipboardList, Monitor, KeyRound, Timer, Sliders } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import type { Features } from "@/lib/features";
import type { PlatformInfo } from "@/lib/platform";
import { iconUrl } from "@/lib/platform-shared";
import { versionBadge } from "@/lib/ui-conventions";
import version from "../../../version.json";
import UserIdentity from "@/components/UserIdentity";

interface NavItem { href: string; label: string; icon: React.ElementType; exact?: boolean }
interface Props {
  user: { email: string; displayName?: string | null };
  features: Features;
  platform: PlatformInfo;
}

export default function AdminSidebar({ user, features, platform }: Props) {
  const path = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleLogout = () => { window.location.href = "/api/auth/logout"; };

  const allNavItems: NavItem[] = [
    { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { href: "/admin/connections", label: "Connections", icon: Monitor },
    { href: "/admin/credentials", label: "Credentials", icon: KeyRound },
    { href: "/admin/settings", label: "Settings", icon: SlidersHorizontal },
    ...(features.audit ? [{ href: "/admin/audit", label: "Audit", icon: ClipboardList }] : []),
    ...(features.users ? [{ href: "/admin/users", label: "Users", icon: Users }] : []),
    ...(features.payments ? [{ href: "/admin/payments", label: "Payments", icon: CreditCard }] : []),
    ...(features.featureCatalog ? [{ href: "/admin/features", label: "Features", icon: Sparkles }] : []),
    ...(features.subscriptions ? [{ href: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard }] : []),
    ...(features.notifications ? [{ href: "/admin/notifications", label: "Notifications", icon: Bell }] : []),
    ...(features.m365 ? [{ href: "/admin/m365", label: "Microsoft 365", icon: Settings }] : []),
    ...(features.email ? [{ href: "/admin/email", label: "Email Settings", icon: Mail }] : []),
    ...(features.ai ? [{ href: "/admin/ai", label: "Artificial Intelligence", icon: Bot }] : []),
  ];

  const navLink = (item: NavItem, onClick?: () => void, inDrawer = false) => {
    const active = item.exact ? path === item.href : path.startsWith(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onClick}
        className={cn(
          "group flex items-center gap-2.5 rounded-md px-3 text-sm transition-all duration-150",
          inDrawer ? "py-2" : "py-1",
          active ? "nav-active font-medium" : "text-foreground/80 hover:bg-secondary hover:text-foreground"
        )}
      >
        <item.icon className={cn("h-4 w-4 shrink-0", active ? "nav-active-icon" : "opacity-50 group-hover:opacity-80")} />
        {item.label}
      </Link>
    );
  };

  const managementItems: NavItem[] = [
    { href: "/admin/connections", label: "Connections", icon: Monitor },
    { href: "/admin/credentials", label: "Credentials", icon: KeyRound },
    { href: "/admin/protocol-settings", label: "Protocols", icon: Sliders },
    { href: "/admin/connection-settings", label: "Session", icon: Timer },
  ];
  const systemItems: NavItem[] = allNavItems.filter(i => i.href !== "/admin" && !managementItems.some(m => m.href === i.href));

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
            <span className={`${versionBadge} mt-1`}>v{version.version}</span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 flex flex-col">
          {navLink({ href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true })}
          <div className="mt-3">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Management</p>
            <div className="flex flex-col">
              {managementItems.map(item => navLink(item))}
            </div>
          </div>
          <div className="mt-3">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">System</p>
            <div className="flex flex-col">
              {systemItems.map(item => navLink(item))}
            </div>
          </div>
        </nav>

        <div className="p-3 border-t space-y-1">
          <UserIdentity user={user} className="px-2 py-2 cursor-default" />
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
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-bold text-base tracking-tight text-foreground truncate leading-tight">{platform.name}</span>
            <span className={versionBadge}>v{version.version}</span>
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
            <nav className="flex-1 overflow-y-auto p-3 flex flex-col">
              {navLink({ href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true }, () => setDrawerOpen(false), true)}
              <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Management</p>
              {managementItems.map(item => navLink(item, () => setDrawerOpen(false), true))}
              <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">System</p>
              {systemItems.map(item => navLink(item, () => setDrawerOpen(false), true))}
            </nav>

            {/* User + logout */}
            <div className="p-3 border-t shrink-0 space-y-1">
              <UserIdentity user={user} className="px-2 py-2" />
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
