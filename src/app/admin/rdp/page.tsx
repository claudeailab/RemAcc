"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { pageWrapper, pageInner, pageTitle, muted } from "@/lib/ui-conventions";

interface RdpSettings {
  security: "nla" | "any" | "rdp" | "tls";
  width: number;
  height: number;
  colorDepth: "8" | "16" | "24" | "32";
  ignoreCert: boolean;
  enableWallpaper: boolean;
  enableFontSmoothing: boolean;
  enableTheming: boolean;
  normalizeClipboard: boolean;
  resizeMethod: "display-update" | "reconnect";
}

const DEFAULTS: RdpSettings = {
  security: "nla", width: 1280, height: 800, colorDepth: "32",
  ignoreCert: true, enableWallpaper: false, enableFontSmoothing: true,
  enableTheming: false, normalizeClipboard: true, resizeMethod: "display-update",
};

export default function RdpSettingsPage() {
  const [form, setForm] = useState<RdpSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/settings/rdp");
      if (r.ok) setForm({ ...DEFAULTS, ...(await r.json()) });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    setSaving(true);
    try {
      const r = await fetch("/api/admin/settings/rdp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (r.ok) toast.success("RDP settings saved");
      else toast.error((await r.json()).error ?? "Save failed");
    } finally { setSaving(false); }
  }

  function set<K extends keyof RdpSettings>(key: K, val: RdpSettings[K]) {
    setForm(f => ({ ...f, [key]: val }));
  }

  if (loading) return <div className={pageWrapper}><div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin" /></div></div>;

  return (
    <div className={pageWrapper}>
      <div className={pageInner}>
        <div className="flex items-center justify-between mb-6">
          <h1 className={pageTitle}>RDP Settings</h1>
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}Save
          </Button>
        </div>

        <div className="space-y-6 max-w-xl">
          {/* Security */}
          <div className="rounded-lg border p-4 space-y-4">
            <p className="text-sm font-medium">Security</p>
            <div className="flex flex-col gap-1.5">
              <Label>Security Mode</Label>
              <Select value={form.security} onValueChange={v => set("security", v as RdpSettings["security"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nla">NLA — Network Level Authentication (recommended for Windows 10/Server 2016+)</SelectItem>
                  <SelectItem value="any">Any — Negotiate (compatible with older servers)</SelectItem>
                  <SelectItem value="rdp">RDP — Classic RDP encryption</SelectItem>
                  <SelectItem value="tls">TLS — TLS encryption only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Ignore Certificate</Label>
                <p className={`text-xs ${muted}`}>Accept self-signed or untrusted certificates</p>
              </div>
              <Switch checked={form.ignoreCert} onCheckedChange={v => set("ignoreCert", v)} />
            </div>
          </div>

          {/* Display */}
          <div className="rounded-lg border p-4 space-y-4">
            <p className="text-sm font-medium">Display</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Default Width</Label>
                <Input type="number" min={640} max={7680} value={form.width} onChange={e => set("width", parseInt(e.target.value) || 1280)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Default Height</Label>
                <Input type="number" min={480} max={4320} value={form.height} onChange={e => set("height", parseInt(e.target.value) || 800)} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Color Depth</Label>
              <Select value={form.colorDepth} onValueChange={v => set("colorDepth", v as RdpSettings["colorDepth"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="8">8-bit (256 colors)</SelectItem>
                  <SelectItem value="16">16-bit (65K colors)</SelectItem>
                  <SelectItem value="24">24-bit (16M colors)</SelectItem>
                  <SelectItem value="32">32-bit (True color, recommended)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Resize Method</Label>
              <Select value={form.resizeMethod} onValueChange={v => set("resizeMethod", v as RdpSettings["resizeMethod"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="display-update">Display Update (Windows 8.1+)</SelectItem>
                  <SelectItem value="reconnect">Reconnect (reconnects to apply new size)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Performance */}
          <div className="rounded-lg border p-4 space-y-4">
            <p className="text-sm font-medium">Performance</p>
            {([
              ["enableFontSmoothing", "Font Smoothing", "ClearType text rendering"],
              ["enableWallpaper", "Wallpaper", "Show desktop background (increases bandwidth)"],
              ["enableTheming", "Theming", "Visual styles and Aero effects"],
              ["normalizeClipboard", "Normalize Clipboard", "Normalize line endings between platforms"],
            ] as [keyof RdpSettings, string, string][]).map(([key, label, desc]) => (
              <div key={key} className="flex items-center justify-between">
                <div>
                  <Label>{label}</Label>
                  <p className={`text-xs ${muted}`}>{desc}</p>
                </div>
                <Switch checked={form[key] as boolean} onCheckedChange={v => set(key, v as never)} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
