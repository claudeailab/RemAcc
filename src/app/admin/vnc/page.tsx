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

interface VncSettings {
  port: number;
  colorDepth: "8" | "16" | "24" | "32";
  encoding: string;
  readOnly: boolean;
  swapRedBlue: boolean;
  cursor: "remote" | "local" | "none";
}

const DEFAULTS: VncSettings = {
  port: 5900, colorDepth: "32", encoding: "tight",
  readOnly: false, swapRedBlue: false, cursor: "remote",
};

export default function VncSettingsPage() {
  const [form, setForm] = useState<VncSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/settings/vnc");
      if (r.ok) setForm({ ...DEFAULTS, ...(await r.json()) });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    setSaving(true);
    try {
      const r = await fetch("/api/admin/settings/vnc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (r.ok) toast.success("VNC settings saved");
      else toast.error((await r.json()).error ?? "Save failed");
    } finally { setSaving(false); }
  }

  function set<K extends keyof VncSettings>(key: K, val: VncSettings[K]) {
    setForm(f => ({ ...f, [key]: val }));
  }

  if (loading) return <div className={pageWrapper}><div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin" /></div></div>;

  return (
    <div className={pageWrapper}>
      <div className={pageInner}>
        <div className="flex items-center justify-between mb-6">
          <h1 className={pageTitle}>VNC Settings</h1>
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}Save
          </Button>
        </div>

        <div className="space-y-6 max-w-xl">
          <div className="rounded-lg border p-4 space-y-4">
            <p className="text-sm font-medium">Connection</p>
            <div className="flex flex-col gap-1.5">
              <Label>Default Port</Label>
              <Input type="number" min={1} max={65535} value={form.port} onChange={e => set("port", parseInt(e.target.value) || 5900)} className="w-32" />
            </div>
          </div>

          <div className="rounded-lg border p-4 space-y-4">
            <p className="text-sm font-medium">Display</p>
            <div className="flex flex-col gap-1.5">
              <Label>Color Depth</Label>
              <Select value={form.colorDepth} onValueChange={v => set("colorDepth", v as VncSettings["colorDepth"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="8">8-bit</SelectItem>
                  <SelectItem value="16">16-bit</SelectItem>
                  <SelectItem value="24">24-bit</SelectItem>
                  <SelectItem value="32">32-bit (recommended)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Encoding</Label>
              <Select value={form.encoding} onValueChange={v => set("encoding", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tight">Tight (best compression)</SelectItem>
                  <SelectItem value="zrle">ZRLE</SelectItem>
                  <SelectItem value="ultra">Ultra</SelectItem>
                  <SelectItem value="copyrect">CopyRect</SelectItem>
                  <SelectItem value="hextile">Hextile</SelectItem>
                  <SelectItem value="raw">Raw (fastest, no compression)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Cursor</Label>
              <Select value={form.cursor} onValueChange={v => set("cursor", v as VncSettings["cursor"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="remote">Remote (server renders cursor)</SelectItem>
                  <SelectItem value="local">Local (client renders cursor)</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Swap Red/Blue</Label>
                <p className={`text-xs ${muted}`}>Fix incorrect colors on some servers</p>
              </div>
              <Switch checked={form.swapRedBlue} onCheckedChange={v => set("swapRedBlue", v)} />
            </div>
          </div>

          <div className="rounded-lg border p-4 space-y-4">
            <p className="text-sm font-medium">Access</p>
            <div className="flex items-center justify-between">
              <div>
                <Label>Read Only</Label>
                <p className={`text-xs ${muted}`}>View only — keyboard and mouse input disabled</p>
              </div>
              <Switch checked={form.readOnly} onCheckedChange={v => set("readOnly", v)} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
