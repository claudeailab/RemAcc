import { getSetting } from "@/lib/encryption";

export const RDP_SETTING_DEFAULTS = {
  security: "nla" as const,
  width: 1280,
  height: 800,
  colorDepth: "32" as const,
  ignoreCert: true,
  enableWallpaper: false,
  enableFontSmoothing: true,
  enableTheming: false,
  normalizeClipboard: true,
  resizeMethod: "display-update" as const,
};

export const VNC_SETTING_DEFAULTS = {
  colorDepth: "32" as const,
  encoding: "tight" as const,
  readOnly: false,
  swapRedBlue: false,
  cursor: "remote" as const,
};

export const SSH_SETTING_DEFAULTS = {
  fontSize: 13,
  fontFamily: "Cascadia Code, Fira Code, monospace",
  scrollback: 5000,
  keepaliveInterval: 25,
  readyTimeout: 15,
};

async function readJson<T extends object>(key: string, defaults: T): Promise<T> {
  const raw = await getSetting(key);
  if (!raw) return defaults;
  try { return { ...defaults, ...JSON.parse(raw) }; } catch { return defaults; }
}

export const getRdpSettings = () => readJson("rdp_settings", RDP_SETTING_DEFAULTS);
export const getVncSettings = () => readJson("vnc_settings", VNC_SETTING_DEFAULTS);
export const getSshSettings = () => readJson("ssh_settings", SSH_SETTING_DEFAULTS);

export async function getSessionGrace() {
  const n = parseInt((await getSetting("connection_session_grace")) ?? "", 10);
  return isNaN(n) ? 0 : n;
}
