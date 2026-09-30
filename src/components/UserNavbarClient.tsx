"use client";

import { LogOut, Sun, Moon, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";

function getInitialTheme(): Theme {
  if (typeof document === "undefined") return "system";
  const v = document.cookie.match(/(?:^|;\s*)webapp-theme=([^;]*)/)?.[1];
  return v === "light" || v === "dark" ? v : "system";
}

export default function UserNavbarClient() {
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
      <Button variant="ghost" size="sm" onClick={() => { window.location.href = "/api/auth/logout"; }} className="text-muted-foreground">
        <LogOut className="h-4 w-4 mr-1.5" />
        Log out
      </Button>
    </>
  );
}
