"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Upload, CheckCircle2, XCircle, Trash2 } from "lucide-react";
import { pageWrapper, pageInner, pageTitle, muted } from "@/lib/ui-conventions";

// ── RDP ──────────────────────────────────────────────────────────────────────

interface RdpSettings {
  security: "nla" | "any" | "rdp" | "tls";
  width: number; height: number;
  colorDepth: "8" | "16" | "24" | "32";
  ignoreCert: boolean; enableWallpaper: boolean;
  enableFontSmoothing: boolean; enableTheming: boolean;
  normalizeClipboard: boolean; resizeMethod: "display-update" | "reconnect";
}
const RDP_DEFAULTS: RdpSettings = {
  security: "nla", width: 1280, height: 800, colorDepth: "32",
  ignoreCert: true, enableWallpaper: false, enableFontSmoothing: true,
  enableTheming: false, normalizeClipboard: true, resizeMethod: "display-update",
};

function RdpTab() {
  const [form, setForm] = useState<RdpSettings>(RDP_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/settings/rdp");
      if (r.ok) setForm({ ...RDP_DEFAULTS, ...(await r.json()) });
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

  function set<K extends keyof RdpSettings>(key: K, val: RdpSettings[K]) { setForm(f => ({ ...f, [key]: val })); }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="space-y-4 max-w-xl">
      <div className="rounded-lg border p-4 space-y-4">
        <p className="text-sm font-medium">Security</p>
        <div className="flex flex-col gap-1.5">
          <Label>Security Mode</Label>
          <Select value={form.security} onValueChange={v => set("security", v as RdpSettings["security"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="nla">NLA — Network Level Authentication (recommended)</SelectItem>
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

      <Button onClick={handleSave} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}Save RDP Settings
      </Button>
    </div>
  );
}

// ── VNC ──────────────────────────────────────────────────────────────────────

interface VncSettings {
  colorDepth: "8" | "16" | "24" | "32";
  encoding: string; readOnly: boolean; swapRedBlue: boolean;
  cursor: "remote" | "local" | "none";
}
const VNC_DEFAULTS: VncSettings = {
  colorDepth: "32", encoding: "tight",
  readOnly: false, swapRedBlue: false, cursor: "remote",
};

function VncTab() {
  const [form, setForm] = useState<VncSettings>(VNC_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/settings/vnc");
      if (r.ok) setForm({ ...VNC_DEFAULTS, ...(await r.json()) });
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

  function set<K extends keyof VncSettings>(key: K, val: VncSettings[K]) { setForm(f => ({ ...f, [key]: val })); }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="space-y-4 max-w-xl">
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

      <Button onClick={handleSave} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}Save VNC Settings
      </Button>
    </div>
  );
}

// ── SSH ──────────────────────────────────────────────────────────────────────

interface SshSettings {
  fontSize: number; fontFamily: string;
  scrollback: number; keepaliveInterval: number; readyTimeout: number;
}
const SSH_DEFAULTS: SshSettings = {
  fontSize: 13, fontFamily: "Cascadia Code, Fira Code, monospace",
  scrollback: 5000, keepaliveInterval: 25, readyTimeout: 15,
};

function SshTab() {
  const [form, setForm] = useState<SshSettings>(SSH_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/settings/ssh");
      if (r.ok) setForm({ ...SSH_DEFAULTS, ...(await r.json()) });
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

  function set<K extends keyof SshSettings>(key: K, val: SshSettings[K]) { setForm(f => ({ ...f, [key]: val })); }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="space-y-4 max-w-xl">
      <div className="rounded-lg border p-4 space-y-4">
        <p className="text-sm font-medium">Connection</p>
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

      <Button onClick={handleSave} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}Save SSH Settings
      </Button>
    </div>
  );
}

// ── UltraVNC DSM ─────────────────────────────────────────────────────────────

interface UvncFileStatus {
  key: string; label: string; uploaded: boolean;
  filename: string | null; size: number | null; updatedAt: string | null;
}

function UltraVncTab() {
  const [files, setFiles] = useState<UvncFileStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/settings/uvnc");
      if (r.ok) setFiles(await r.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleUpload(key: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(key);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/api/admin/settings/uvnc?key=${key}`, { method: "POST", body: fd });
      if (r.ok) { toast.success("File uploaded"); await load(); }
      else toast.error((await r.json()).error ?? "Upload failed");
    } finally { setUploading(null); e.target.value = ""; }
  }

  async function handleDelete(key: string) {
    setDeleting(key);
    try {
      const r = await fetch(`/api/admin/settings/uvnc?key=${key}`, { method: "DELETE" });
      if (r.ok) { toast.success("File removed"); await load(); }
      else toast.error("Delete failed");
    } finally { setDeleting(null); }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="space-y-4 max-w-xl">
      <div className="rounded-lg border p-4 space-y-1">
        <p className="text-sm font-medium">UltraVNC DSM Plugin Files</p>
        <p className={`text-xs ${muted}`}>
          Upload the DSM plugin (.dsm), client key (.pkey), and UltraVNC Viewer binary (.exe) to enable DSM-encrypted VNC connections. The server relays them via Wine.
        </p>
      </div>

      <div className="rounded-lg border divide-y">
        {files.map(f => (
          <div key={f.key} className="flex items-center justify-between p-3 gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {f.uploaded
                ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                : <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />}
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{f.label}</p>
                {f.filename && <p className={`text-xs ${muted} truncate`}>{f.filename} · {f.size ? (f.size / 1024).toFixed(0) + " KB" : ""}</p>}
                {!f.uploaded && <p className={`text-xs ${muted}`}>Not uploaded</p>}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <label className="cursor-pointer">
                <input type="file" className="hidden" onChange={e => handleUpload(f.key, e)} />
                <span className="inline-flex items-center gap-1 text-xs border rounded px-2 py-1 hover:bg-accent transition-colors">
                  {uploading === f.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                  {f.uploaded ? "Replace" : "Upload"}
                </span>
              </label>
              {f.uploaded && (
                <button
                  className="inline-flex items-center gap-1 text-xs border rounded px-2 py-1 hover:bg-destructive hover:text-destructive-foreground transition-colors"
                  onClick={() => handleDelete(f.key)}
                  disabled={deleting === f.key}
                >
                  {deleting === f.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border p-4 space-y-1 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Required files</p>
        <p><span className="font-mono">SecureVNCPlugin64.dsm</span> — the DSM plugin DLL (renamed .dsm)</p>
        <p><span className="font-mono">*.pkey</span> — client private key for authentication</p>
        <p><span className="font-mono">vncviewer.exe</span> — UltraVNC Viewer Windows binary</p>
        <p className="pt-1">Once uploaded, enable "Use DSM Plugin" on individual VNC connections.</p>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ProtocolSettingsPage() {
  return (
    <div className={pageWrapper}>
      <div className={pageInner}>
        <h1 className={pageTitle}>Protocol Settings</h1>
        <Tabs defaultValue="rdp" className="mt-6">
          <TabsList>
            <TabsTrigger value="rdp">RDP</TabsTrigger>
            <TabsTrigger value="vnc">VNC</TabsTrigger>
            <TabsTrigger value="ssh">SSH</TabsTrigger>
            <TabsTrigger value="uvnc">UltraVNC</TabsTrigger>
          </TabsList>
          <TabsContent value="rdp" className="mt-4"><RdpTab /></TabsContent>
          <TabsContent value="vnc" className="mt-4"><VncTab /></TabsContent>
          <TabsContent value="ssh" className="mt-4"><SshTab /></TabsContent>
          <TabsContent value="uvnc" className="mt-4"><UltraVncTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
