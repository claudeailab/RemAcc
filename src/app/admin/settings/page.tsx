"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Loader2, ChevronLeft, ChevronRight, Plus, Pencil, Trash2, CheckCircle2, Search } from "lucide-react";
import { pageWrapper, pageInner, pageTitle } from "@/lib/ui-conventions";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import type { FeatureKey } from "@/lib/features";
import { iconUrl, DEFAULT_ICON, DEFAULT_PRIMARY_COLOR } from "@/lib/platform-shared";

const FEATURE_LIST: { key: FeatureKey; label: string; description: string }[] = [
  { key: "users", label: "Users", description: "User management, registration, and profiles" },
  { key: "payments", label: "Payments", description: "Stripe, Viva, and PayPal billing" },
  { key: "subscriptions", label: "Subscriptions", description: "Subscription plans and management" },
  { key: "m365", label: "Microsoft 365", description: "Azure AD sync and Microsoft SSO login" },
  { key: "email", label: "Email / SMTP", description: "Transactional email via SMTP" },
  { key: "ai", label: "Artificial Intelligence", description: "Anthropic and OpenAI integrations" },
];

type Theme = "system" | "light" | "dark";

function ThemeButton({ value, current, label, onClick }: { value: Theme; current: Theme; label: string; onClick: (v: Theme) => void }) {
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-colors ${current === value ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
    >
      <div className={`h-10 w-16 rounded-md ${value === "light" ? "bg-[hsl(40_8%_98%)] border border-border" : value === "dark" ? "bg-[hsl(20_8%_9%)]" : "bg-gradient-to-br from-[hsl(40_8%_98%)] to-[hsl(20_8%_9%)]"}`} />
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}

interface AuditLog {
  id: number;
  userEmail: string | null;
  action: string;
  resource: string;
  detail: string | null;
  ip: string | null;
  createdAt: string;
}

function AuditTab() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/audit?page=${p}`);
      const d = await r.json();
      setLogs(d.logs ?? []);
      setPages(d.pages ?? 1);
      setTotal(d.total ?? 0);
      setPage(p);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(1); }, [load]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{total} total entries</p>
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : logs.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No audit logs yet.</p>
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="md:hidden flex flex-col divide-y divide-border rounded-lg border border-border">
            {logs.map(log => (
              <div key={log.id} className="p-3 space-y-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{log.action}</span>
                  <span className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</span>
                </div>
                <div className="text-sm font-medium truncate">{log.resource}</div>
                {log.userEmail && <div className="text-xs text-muted-foreground truncate">{log.userEmail}</div>}
                {log.detail && <div className="text-xs text-muted-foreground truncate">{log.detail}</div>}
              </div>
            ))}
          </div>
          {/* Desktop: table */}
          <div className="hidden md:block overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Time</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">User</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Action</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Resource</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Detail</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground text-xs">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{log.userEmail ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap"><span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{log.action}</span></td>
                    <td className="px-3 py-2 whitespace-nowrap">{log.resource}</td>
                    <td className="px-3 py-2 text-muted-foreground text-xs max-w-xs truncate">{log.detail ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground text-xs">{log.ip ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => load(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} of {pages}</span>
          <Button variant="outline" size="sm" disabled={page >= pages || loading} onClick={() => load(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function FeaturesTab() {
  const router = useRouter();
  const [features, setFeatures] = useState<Record<FeatureKey, boolean>>({
    users: true, payments: true, m365: true, email: true, ai: true, subscriptions: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<FeatureKey | null>(null);

  useEffect(() => {
    fetch("/api/admin/features").then(r => r.json()).then(d => {
      if (d.features) setFeatures(d.features);
      setLoading(false);
    });
  }, []);

  async function toggle(key: FeatureKey, value: boolean) {
    const prev = features[key];
    setFeatures(f => ({ ...f, [key]: value }));
    setSaving(key);
    try {
      const r = await fetch("/api/admin/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (!r.ok) {
        setFeatures(f => ({ ...f, [key]: prev }));
        toast.error("Failed to update feature");
      } else {
        toast.success(`${value ? "Enabled" : "Disabled"}`);
        router.refresh();
      }
    } finally { setSaving(null); }
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground mb-4">Disabled features are hidden from the navigation menu.</p>
      {FEATURE_LIST.map(({ key, label, description }) => (
        <div key={key} className="flex items-center justify-between rounded-xl border p-4 bg-card transition-colors hover:bg-muted/20">
          <div>
            <p className="font-medium text-sm">{label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
          <div className="flex items-center gap-2">
            {saving === key && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            <Switch
              checked={features[key]}
              onCheckedChange={v => toggle(key, v)}
              disabled={saving === key}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

interface Group {
  id: number;
  name: string;
  description: string | null;
  permissions: string[];
  userCount: number;
}

const defaultGroupForm = { name: "", description: "", permissions: [] as string[] };

function PermissionsTab() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ id: 0, ...defaultGroupForm });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/groups");
      const d = await r.json();
      setGroups(d.groups ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openNew() { setForm({ id: 0, ...defaultGroupForm }); setDialogOpen(true); }
  function openEdit(g: Group) {
    setForm({ id: g.id, name: g.name, description: g.description ?? "", permissions: g.permissions });
    setDialogOpen(true);
  }

  function togglePerm(key: string) {
    setForm(f => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter(p => p !== key)
        : [...f.permissions, key],
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const method = form.id ? "PUT" : "POST";
      const url = form.id ? `/api/admin/groups?id=${form.id}` : "/api/admin/groups";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, description: form.description || undefined, permissions: form.permissions }),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Save failed"); return; }
      toast.success(form.id ? "Group updated" : "Group created");
      setDialogOpen(false);
      load();
    } finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    const r = await fetch(`/api/admin/groups?id=${id}`, { method: "DELETE" });
    if (!r.ok) { toast.error("Delete failed"); return; }
    toast.success("Group deleted");
    setDeleteId(null);
    load();
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Define access groups and assign permissions to control what users can do.</p>
        <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1.5" />New Group</Button>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No groups yet. Create one to start assigning permissions.</p>
      ) : (
        <div className="space-y-3">
          {groups.map(g => (
            <div key={g.id} className="rounded-xl border p-4 bg-card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{g.name}</span>
                    <span className="text-xs text-muted-foreground">{g.userCount} user{g.userCount !== 1 ? "s" : ""}</span>
                  </div>
                  {g.description && <p className="text-xs text-muted-foreground mt-0.5">{g.description}</p>}
                  {g.permissions.length > 0 ? (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {g.permissions.map(p => {
                        const label = PLATFORM_PERMISSIONS.find(x => x.key === p)?.label ?? p;
                        return (
                          <span key={p} className="inline-flex items-center gap-1 text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                            <CheckCircle2 className="h-2.5 w-2.5" />{label}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1 italic">No permissions</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(g)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDeleteId(g.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form.id ? "Edit Group" : "New Group"}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Name</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Standard Users" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Permissions</Label>
              <div className="space-y-2">
                {PLATFORM_PERMISSIONS.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.permissions.includes(key)}
                      onChange={() => togglePerm(key)}
                      className="h-4 w-4 rounded accent-primary"
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Group</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Users assigned to this group will be unassigned. This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteId && handleDelete(deleteId)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr.buffer;
}

function NotificationsTab() {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [supported, setSupported] = useState(false);

  const checkSubscription = useCallback(async (key: string) => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(!!sub && sub.endpoint.length > 0 && key.length > 0);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setSupported("serviceWorker" in navigator && "PushManager" in window && "Notification" in window);
    fetch("/api/admin/settings/notifications").then(r => r.json()).then(d => {
      setPublicKey(d.publicKey);
      if (d.keysRegenerated) {
        // Server just generated new VAPID keys — any browser subscription is now stale
        setSubscribed(false);
      } else if (d.publicKey) {
        checkSubscription(d.publicKey);
      }
      setLoading(false);
    });
  }, [checkSubscription]);

  async function toggleSubscription() {
    if (!publicKey) return;
    setSubscribing(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (subscribed) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/push/subscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
        setSubscribed(false);
        toast.success("Notifications disabled for this device");
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") { toast.error("Notification permission denied"); return; }
        // Always unsubscribe any stale browser subscription first so the new
        // subscription uses the current VAPID key (prevents key mismatch)
        // Fetch the current VAPID key fresh so we never use a stale state value
        const vapidResp = await fetch("/api/push/vapid-public-key");
        if (!vapidResp.ok) throw new Error("Push not configured — please reload the page and try again");
        const { publicKey: currentKey } = await vapidResp.json();
        const existing = await reg.pushManager.getSubscription();
        if (existing) await existing.unsubscribe();
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToArrayBuffer(currentKey),
        });
        const json = sub.toJSON();
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
        });
        setSubscribed(true);
        toast.success("Notifications enabled for this device");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update notifications");
    } finally { setSubscribing(false); }
  }

  async function sendTest() {
    setTesting(true);
    try {
      const r = await fetch("/api/admin/settings/notifications/test", { method: "POST" });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error ?? "Test failed");
        if (d.expired) setSubscribed(false);
        return;
      }
      toast.success("Test notification sent");
    } finally { setTesting(false); }
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Receive push notifications when the platform is saved as an app on your device.
      </p>

      <div className="rounded-xl border p-4 bg-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Notifications on this device</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {!supported
                ? "Push notifications are not supported in this browser."
                : subscribed
                ? "Enabled — this device will receive notifications."
                : "Disabled — enable to receive notifications on this device."}
            </p>
          </div>
          {supported && (
            <Button
              size="sm"
              variant={subscribed ? "outline" : "default"}
              onClick={toggleSubscription}
              disabled={subscribing}
            >
              {subscribing ? <Loader2 className="h-4 w-4 animate-spin" /> : subscribed ? "Disable" : "Enable"}
            </Button>
          )}
        </div>
      </div>

      <div>
        <Button onClick={sendTest} disabled={testing || !subscribed} variant="outline" size="sm">
          {testing ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Sending…</> : "Send Test Notification"}
        </Button>
        {!subscribed && supported && (
          <p className="text-xs text-muted-foreground mt-2">Enable notifications on this device first.</p>
        )}
      </div>
    </div>
  );
}

const ICON_SETS = [
  { label: "All", value: "" },
  { label: "HugeIcons", value: "hugeicons" },
  { label: "Solar", value: "solar" },
  { label: "Material", value: "mdi" },
  { label: "Phosphor", value: "ph" },
  { label: "Lucide", value: "lucide" },
  { label: "Tabler", value: "tabler" },
];

const FEATURED_ICONS = [
  "solar:layers-bold", "solar:box-bold", "solar:planet-bold", "solar:rocket-bold",
  "solar:star-bold", "solar:diamond-bold", "solar:crown-bold", "solar:home-bold",
  "solar:settings-bold", "solar:shield-bold", "solar:chart-bold", "solar:cloud-bold",
  "mdi:application", "mdi:rocket-launch", "mdi:star-circle", "mdi:cube-outline",
  "mdi:shield-check", "mdi:cloud-outline", "mdi:home-variant", "mdi:cog",
  "ph:app-window-bold", "ph:rocket-bold", "ph:planet-bold", "ph:cube-bold",
  "ph:star-bold", "ph:house-bold", "ph:shield-check-bold", "ph:cloud-bold",
  "tabler:apps", "tabler:rocket", "tabler:star", "tabler:home",
  "lucide:layers", "lucide:box", "lucide:star", "lucide:home",
];

function IconPickerDialog({ value, onSelect, onClose }: {
  value: string;
  onSelect: (icon: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [setFilter, setSetFilter] = useState("");
  const [icons, setIcons] = useState<string[]>(FEATURED_ICONS);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setIcons(FEATURED_ICONS);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ query: query.trim(), limit: "60" });
        if (setFilter) params.set("prefixes", setFilter);
        const r = await fetch(`/api/icon/search?${params}`);
        const d = await r.json();
        setIcons(d.icons ?? []);
      } catch { setIcons([]); }
      finally { setLoading(false); }
    }, 350);
  }, [query, setFilter]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Choose an Icon</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-8"
              placeholder="Search 200,000+ icons…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ICON_SETS.map(s => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSetFilter(s.value)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${setFilter === s.value ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="min-h-[280px]">
            {loading ? (
              <div className="flex justify-center items-center h-40"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : icons.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No icons found. Try a different search.</p>
            ) : (
              <div className="grid grid-cols-8 sm:grid-cols-10 gap-1 max-h-72 overflow-y-auto pr-1">
                {icons.map(id => (
                  <button
                    key={id}
                    type="button"
                    title={id}
                    onClick={() => { onSelect(id); onClose(); }}
                    className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all hover:border-primary/50 hover:bg-primary/5 group ${id === value ? "border-primary bg-primary/10" : "border-transparent"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={iconUrl(id)}
                      alt={id}
                      className="h-6 w-6"
                      onError={e => { (e.target as HTMLImageElement).closest("button")!.style.display = "none"; }}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
          {!query && <p className="text-xs text-muted-foreground text-center">Showing suggestions — type to search all icons from HugeIcons, Material, Phosphor, Lucide, Tabler &amp; more</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlatformTab() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [original, setOriginal] = useState({ name: "", title: "" });

  useEffect(() => {
    fetch("/api/platform").then(r => r.json()).then(d => {
      const n = d.name ?? "";
      const t = d.title ?? "";
      setName(n); setTitle(t);
      setOriginal({ name: n, title: t });
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    setDirty(name !== original.name || title !== original.title);
  }, [name, title, original]);

  async function handleSave() {
    setSaving(true);
    try {
      const r = await fetch("/api/admin/settings/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || undefined, title }),
      });
      if (!r.ok) { toast.error("Save failed"); return; }
      toast.success("Platform settings saved");
      setOriginal({ name, title });
      setDirty(false);
      router.refresh();
    } finally { setSaving(false); }
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Set the name and title shown throughout the platform.</p>
      <div className="flex flex-col gap-1.5">
        <Label>Platform Name</Label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Platform" maxLength={80} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Platform Title <span className="text-muted-foreground font-normal text-xs">(optional subtitle)</span></Label>
        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Customer Portal" maxLength={160} />
      </div>
      <Button onClick={handleSave} disabled={saving || !dirty}>
        {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Saving…</> : "Save"}
      </Button>
    </div>
  );
}

function VisualAppearanceSection() {
  const router = useRouter();
  const [icon, setIcon] = useState(DEFAULT_ICON);
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_PRIMARY_COLOR);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [original, setOriginal] = useState({ icon: DEFAULT_ICON, primaryColor: DEFAULT_PRIMARY_COLOR });
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    fetch("/api/platform").then(r => r.json()).then(d => {
      const ic = d.icon ?? DEFAULT_ICON;
      const pc = d.primaryColor ?? DEFAULT_PRIMARY_COLOR;
      setIcon(ic); setPrimaryColor(pc);
      setOriginal({ icon: ic, primaryColor: pc });
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    setDirty(icon !== original.icon || primaryColor !== original.primaryColor);
  }, [icon, primaryColor, original]);

  async function handleSave() {
    setSaving(true);
    try {
      const r = await fetch("/api/admin/settings/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ icon, primaryColor }),
      });
      if (!r.ok) { toast.error("Save failed"); return; }
      toast.success("Appearance saved");
      setOriginal({ icon, primaryColor });
      setDirty(false);
      document.documentElement.style.setProperty("--color-primary", primaryColor);
      document.documentElement.style.setProperty("--color-ring", primaryColor);
      router.refresh();
    } finally { setSaving(false); }
  }

  const isValidHex = /^#[0-9a-fA-F]{6}$/.test(primaryColor);

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6 pt-6 border-t">
      <p className="text-sm font-medium">Appearance</p>
      <div className="flex flex-col gap-2">
        <Label>Icon</Label>
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 rounded-xl border-2 border-border bg-muted/30 flex items-center justify-center shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={iconUrl(icon)} alt="" className="h-9 w-9" />
          </div>
          <div>
            <p className="text-sm font-medium font-mono">{icon}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Powered by Iconify · 200,000+ icons</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setPickerOpen(true)}>
              Change Icon
            </Button>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label>Brand Color</Label>
        <div className="flex items-center gap-3">
          <label className="relative cursor-pointer group shrink-0">
            <div
              className="h-10 w-10 rounded-lg border-2 border-border shadow-sm transition-transform group-hover:scale-105"
              style={{ background: isValidHex ? primaryColor : DEFAULT_PRIMARY_COLOR }}
            />
            <input
              type="color"
              value={isValidHex ? primaryColor : DEFAULT_PRIMARY_COLOR}
              onChange={e => setPrimaryColor(e.target.value)}
              className="sr-only"
            />
          </label>
          <Input
            value={primaryColor}
            onChange={e => {
              const v = e.target.value;
              if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setPrimaryColor(v);
            }}
            className="w-28 font-mono text-sm"
            maxLength={7}
            placeholder="#0d9488"
          />
          <div
            className="h-10 flex-1 rounded-lg flex items-center gap-2 px-3 shrink min-w-0"
            style={{ background: isValidHex ? `linear-gradient(135deg, color-mix(in srgb, ${primaryColor} 82%, white) 0%, ${primaryColor} 60%, color-mix(in srgb, ${primaryColor} 72%, black) 100%)` : undefined }}
          >
            <div className="h-4 w-4 rounded bg-white/30 shrink-0" />
            <div className="h-2 w-16 rounded bg-white/50" />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-xs text-muted-foreground">Used for the sidebar, buttons, and accent colors.</p>
          {primaryColor !== DEFAULT_PRIMARY_COLOR && (
            <button
              type="button"
              onClick={() => setPrimaryColor(DEFAULT_PRIMARY_COLOR)}
              className="text-xs text-primary underline-offset-2 hover:underline shrink-0"
            >
              Reset to default
            </button>
          )}
        </div>
      </div>
      <Button onClick={handleSave} disabled={saving || !dirty || !isValidHex}>
        {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Saving…</> : "Save"}
      </Button>
      {pickerOpen && (
        <IconPickerDialog
          value={icon}
          onSelect={id => { setIcon(id); }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

export default function SettingsPage() {
  const [theme, setTheme] = useState<Theme>("system");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const stored = document.cookie.match(/webapp-theme=([^;]+)/)?.[1] as Theme | undefined;
    if (stored === "light" || stored === "dark" || stored === "system") setTheme(stored);
  }, []);

  async function applyTheme(t: Theme) {
    setTheme(t);
    setSaving(true);
    try {
      await fetch("/api/admin/settings/theme", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ theme: t }) });
      const html = document.documentElement;
      if (t === "system") {
        html.removeAttribute("data-theme");
      } else {
        html.setAttribute("data-theme", t);
      }
    } finally { setSaving(false); }
  }

  return (
    <div className={pageWrapper}>
      <div className={pageInner}>
        <h1 className={pageTitle}>Settings</h1>
        <Tabs defaultValue="platform" className="mt-6">
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="platform">Platform</TabsTrigger>
            <TabsTrigger value="visual">Visual</TabsTrigger>
            <TabsTrigger value="features">Features</TabsTrigger>
            <TabsTrigger value="permissions">Permissions</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
          </TabsList>
          <TabsContent value="platform">
            <Card><CardContent className="pt-6"><PlatformTab /></CardContent></Card>
          </TabsContent>
          <TabsContent value="visual">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div>
                  <p className="text-sm font-medium mb-3">Theme</p>
                  <div className="flex flex-wrap gap-3">
                    <ThemeButton value="system" current={theme} label="System" onClick={applyTheme} />
                    <ThemeButton value="light" current={theme} label="Light" onClick={applyTheme} />
                    <ThemeButton value="dark" current={theme} label="Dark" onClick={applyTheme} />
                  </div>
                  {saving && <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Saving…</p>}
                </div>
                <VisualAppearanceSection />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="features">
            <Card><CardContent className="pt-6"><FeaturesTab /></CardContent></Card>
          </TabsContent>
          <TabsContent value="permissions">
            <Card><CardContent className="pt-6"><PermissionsTab /></CardContent></Card>
          </TabsContent>
          <TabsContent value="notifications">
            <Card><CardContent className="pt-6"><NotificationsTab /></CardContent></Card>
          </TabsContent>
          <TabsContent value="audit">
            <Card><CardContent className="pt-6"><AuditTab /></CardContent></Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
