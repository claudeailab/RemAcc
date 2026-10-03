"use client";

import { createContext, useCallback, useContext } from "react";
import { DEFAULT_DATETIME, formatDateTime, type DateTimeSettings } from "@/lib/datetime-shared";

const DateTimeContext = createContext<DateTimeSettings>(DEFAULT_DATETIME);

export function DateTimeProvider({ settings, children }: { settings: DateTimeSettings; children: React.ReactNode }) {
  return <DateTimeContext.Provider value={settings}>{children}</DateTimeContext.Provider>;
}

export function useFormatDateTime() {
  const settings = useContext(DateTimeContext);
  return useCallback((value: Date | string | number, withTime = true) => formatDateTime(value, settings, withTime), [settings]);
}
