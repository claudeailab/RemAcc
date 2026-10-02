"use client";

import { LogOut, Sun, Moon, Monitor, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

type Theme = "system" | "light" | "dark";

function getInitialTheme(): Theme {
  if (typeof document === "undefined") return "system";
  const v = document.cookie.match(/(?:^|;\s*)webapp-theme=([^;]*)/)?.[1];
  return v === "light" || v === "dark" ? v : "system";
}

function UserNavbarClientInner() {
  const searchParams = useSearchParams();
  const slot = searchParams.get("s");
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => { setTheme(getInitialTheme()); }, []);

  function cycleTheme() {
    const next: Theme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    setTheme(next);
    if (next === "system") {
      document.cookie = "webapp-theme=; path=/; max-age=0";
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.cookie = `webapp-theme=${next}; path=/; max-age=31536000`;
      document.documentElement.setAttribute("data-theme", next);
    }
  }

  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const label = theme === "system" ? "Using system theme" : theme === "light" ? "Light mode" : "Dark mode";
  // Next available slot (slot 1 = default, slot 2 = second session)
  const nextSlot = slot && slot !== "1" ? null : "2";
  const logoutHref = `/api/auth/logout${slot && slot !== "1" ? `?s=${slot}` : ""}`;

  return (
    <>
      <button
        onClick={cycleTheme}
        title={label}
        aria-label={label}
        className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-secondary transition-colors shrink-0"
      >
        <Icon className="h-4 w-4" />
      </button>
      {nextSlot && (
        <a
          href={`/login?s=${nextSlot}`}
          target="_blank"
          rel="noopener noreferrer"
          title="Open a second session as a different user"
          aria-label="Open second session"
          className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-secondary transition-colors shrink-0"
        >
          <UserPlus className="h-4 w-4" />
        </a>
      )}
      <Button variant="ghost" size="sm" onClick={() => { window.location.href = logoutHref; }} className="text-muted-foreground">
        <LogOut className="h-4 w-4 mr-1.5" />
        Log out
      </Button>
    </>
  );
}

export default function UserNavbarClient() {
  return (
    <Suspense fallback={null}>
      <UserNavbarClientInner />
    </Suspense>
  );
}
