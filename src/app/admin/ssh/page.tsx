"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { pageWrapper, pageInner, pageTitle, muted } from "@/lib/ui-conventions";

interface SshSettings {
  port: number;
  fontSize: number;
  fontFamily: string;
  scrollback: number;
  keepaliveInterval: number;
  readyTimeout: number;
}

const DEFAULTS: SshSettings = {
  port: 22, fontSize: 13, fontFamily: "Cascadia Code, Fira Code, monospace",
  scrollback: 5000, keepaliveInterval: 25, readyTimeout: 15,
};

export default function SshSettingsPage() {
  const [form, setForm] = useState<SshSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/settings/ssh");
      if (r.ok) setForm({ ...DEFAULTS, ...(await r.json()) });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    setSaving(true);
    try {
      const r = await fetch("/api/admin/settings/ssh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (r.ok) toast.success("SSH settings saved");
      else toast.error((await r.json()).error ?? "Save failed");
    } finally { setSaving(false); }
  }

  function set<K extends keyof SshSettings>(key: K, val: SshSettings[K]) {
    setForm(f => ({ ...f, [key]: val }));
  }

  if (loading) return <div className={pageWrapper}><div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin" /></div></div>;

  return (
    <div className={pageWrapper}>
      <div className={pageInner}>
        <div className="flex items-center justify-between mb-6">
          <h1 className={pageTitle}>SSH Settings</h1>
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}Save
          </Button>
        </div>

        <div className="space-y-6 max-w-xl">
          <div className="rounded-lg border p-4 space-y-4">
            <p className="text-sm font-medium">Connection</p>
            <div className="flex flex-col gap-1.5">
              <Label>Default Port</Label>
              <Input type="number" min={1} max={65535} value={form.port} onChange={e => set("port", parseInt(e.target.value) || 22)} className="w-32" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Ready Timeout <span className={muted}>(seconds)</span></Label>
              <p className={`text-xs ${muted}`}>How long to wait for SSH handshake</p>
              <Input type="number" min={5} max={120} value={form.readyTimeout} onChange={e => set("readyTimeout", parseInt(e.target.value) || 15)} className="w-32" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Keepalive Interval <span className={muted}>(seconds, 0 = off)</span></Label>
              <p className={`text-xs ${muted}`}>Send keepalive to prevent idle disconnects</p>
              <Input type="number" min={0} max={300} value={form.keepaliveInterval} onChange={e => set("keepaliveInterval", parseInt(e.target.value))} className="w-32" />
            </div>
          </div>

          <div className="rounded-lg border p-4 space-y-4">
            <p className="text-sm font-medium">Terminal</p>
            <div className="flex flex-col gap-1.5">
              <Label>Font Family</Label>
              <Input value={form.fontFamily} onChange={e => set("fontFamily", e.target.value)} placeholder="Cascadia Code, Fira Code, monospace" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Font Size <span className={muted}>(px)</span></Label>
                <Input type="number" min={8} max={32} value={form.fontSize} onChange={e => set("fontSize", parseInt(e.target.value) || 13)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Scrollback <span className={muted}>(lines)</span></Label>
                <Input type="number" min={100} max={50000} value={form.scrollback} onChange={e => set("scrollback", parseInt(e.target.value) || 5000)} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
