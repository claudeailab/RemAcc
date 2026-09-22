// Browser-safe — no server imports. Used by client components.

export const DEFAULT_ICON = "solar:layers-bold";
export const DEFAULT_PRIMARY_COLOR = "#6366f1";
const DEFAULT_COLOR_ENCODED = "%236366f1";

export function iconUrl(icon: string, color = DEFAULT_COLOR_ENCODED): string {
  return `/api/icon?icon=${encodeURIComponent(icon)}&color=${color}`;
}
