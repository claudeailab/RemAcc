"use client";

import { useEffect } from "react";

const KEY = "remacc_account";
const readActive = () => document.cookie.match(/(?:^|;\s*)webapp-active=(\d+)/)?.[1];

// Keeps each browser tab on the account it was loaded as: the page load used the active account,
// so remember it for this tab, and make it active again whenever the tab is brought to the front
// or used (every navigation starts with a click or key press in the tab).
export default function TabAccount() {
  useEffect(() => {
    try {
      const id = readActive();
      if (id) sessionStorage.setItem(KEY, id);
    } catch {}

    const claim = () => {
      if (document.visibilityState !== "visible") return;
      try {
        const id = sessionStorage.getItem(KEY);
        if (id && id !== readActive()) {
          document.cookie = `webapp-active=${id}; path=/; max-age=604800; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
        }
      } catch {}
    };
    const winEvents = ["focus", "pageshow", "pointerdown", "keydown"] as const;
    winEvents.forEach(e => window.addEventListener(e, claim, true));
    document.addEventListener("visibilitychange", claim);
    return () => {
      winEvents.forEach(e => window.removeEventListener(e, claim, true));
      document.removeEventListener("visibilitychange", claim);
    };
  }, []);
  return null;
}
