"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Pencil, Trash2, CloudDownload, Search } from "lucide-react";
import { pageWrapper, pageInner, pageTitle, muted } from "@/lib/ui-conventions";

interface User { id: number; email: string; username: string | null; displayName: string | null; source: string; groupId: number | null; disabled: boolean }
interface Group { id: number; name: string }
interface AzureDirectoryUser {
  oid: string;
  email: string;
  displayName: string | null;
  inPlatform: boolean;
  userId: number | null;
  groupId: number | null;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState({ id: 0, source: "local", username: "", email: "", displayName: "", password: "", groupId: "" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Azure browse state
  const [azureDialogOpen, setAzureDialogOpen] = useState(false);
  const [azureLoading, setAzureLoading] = useState(false);
  const [azureUsers, setAzureUsers] = useState<AzureDirectoryUser[]>([]);
  const [azureFilter, setAzureFilter] = useState("");
  const [azureSelected, setAzureSelected] = useState<Set<string>>(new Set());
  const [azureInitialInPlatform, setAzureInitialInPlatform] = useState<Set<string>>(new Set());
  const [azureGroupId, setAzureGroupId] = useState("");
  const [azureApplying, setAzureApplying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ur, gr] = await Promise.all([fetch("/api/admin/users"), fetch("/api/admin/groups")]);
      const [ud, gd] = await Promise.all([ur.json(), gr.json()]);
      setUsers(ud.users ?? []);
      setGroups(gd.groups ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setForm({ id: 0, source: "local", username: "", email: "", displayName: "", password: "", groupId: "" });
    setDialogOpen(true);
  }

  function openEdit(u: User) {
    setForm({ id: u.id, source: u.source, username: u.username ?? "", email: u.email, displayName: u.displayName ?? "", password: "", groupId: u.groupId?.toString() ?? "" });
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const method = form.id ? "PUT" : "POST";
      const payload = {
        ...(form.id ? { id: form.id } : {}),
        ...(form.username ? { username: form.username } : {}),
        ...(form.email ? { email: form.email } : {}),
        displayName: form.displayName || undefined,
        ...(form.password ? { password: form.password } : {}),
        groupId: form.groupId ? Number(form.groupId) : null,
      };
      const r = await fetch("/api/admin/users", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Save failed"); return; }
      toast.success(form.id ? "User updated" : "User created");
      setDialogOpen(false);
      load();
    } finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    const r = await fetch(`/api/admin/users?id=${id}`, { method: "DELETE" });
    if (!r.ok) { toast.error("Delete failed"); return; }
    toast.success("User deleted");
    setDeleteId(null);
    load();
  }

  async function handleToggle(id: number, disabled: boolean) {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, disabled } : u));
    const r = await fetch("/api/admin/users", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, disabled }) });
    if (!r.ok) {
      setUsers(prev => prev.map(u => u.id === id ? { ...u, disabled: !disabled } : u));
      toast.error("Update failed");
    }
  }

  async function browseAzure() {
    setAzureDialogOpen(true);
    setAzureLoading(true);
    setAzureFilter("");
    setAzureGroupId("");
    try {
      const r = await fetch("/api/admin/users/azure-users");
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Failed to fetch Azure users"); setAzureDialogOpen(false); return; }
      const all: AzureDirectoryUser[] = d.users ?? [];
      setAzureUsers(all);
      const inPlatform = new Set(all.filter(u => u.inPlatform).map(u => u.oid));
      setAzureInitialInPlatform(inPlatform);
      setAzureSelected(new Set(inPlatform));
    } finally { setAzureLoading(false); }
  }

  async function applyAzureChanges() {
    const toAdd = azureUsers.filter(u => azureSelected.has(u.oid) && !azureInitialInPlatform.has(u.oid));
    const toRemove = azureUsers.filter(u => !azureSelected.has(u.oid) && azureInitialInPlatform.has(u.oid) && u.userId !== null);

    if (toAdd.length === 0 && toRemove.length === 0) {
      setAzureDialogOpen(false);
      return;
    }

    setAzureApplying(true);
    try {
      if (toAdd.length > 0) {
        const r = await fetch("/api/admin/users/azure-add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            users: toAdd.map(u => ({
              oid: u.oid, email: u.email, displayName: u.displayName,
              groupId: azureGroupId ? Number(azureGroupId) : null,
            })),
          }),
        });
        const d = await r.json();
        if (!r.ok) { toast.error(d.error ?? "Failed to add users"); return; }
      }

      for (const u of toRemove) {
        const r = await fetch(`/api/admin/users?id=${u.userId}`, { method: "DELETE" });
        if (!r.ok) { toast.error(`Failed to remove ${u.email}`); return; }
      }

      const parts: string[] = [];
      if (toAdd.length > 0) parts.push(`Added ${toAdd.length} user${toAdd.length !== 1 ? "s" : ""}`);
      if (toRemove.length > 0) parts.push(`Removed ${toRemove.length} user${toRemove.length !== 1 ? "s" : ""}`);
      toast.success(parts.join(", "));
      setAzureDialogOpen(false);
      load();
    } finally { setAzureApplying(false); }
  }

  const filteredAzure = azureUsers.filter(u =>
    u.email.toLowerCase().includes(azureFilter.toLowerCase()) ||
    (u.displayName ?? "").toLowerCase().includes(azureFilter.toLowerCase())
  );

  const toAddCount = [...azureSelected].filter(oid => !azureInitialInPlatform.has(oid)).length;
  const toRemoveCount = [...azureInitialInPlatform].filter(oid => !azureSelected.has(oid)).length;
  const hasChanges = toAddCount > 0 || toRemoveCount > 0;

  const applyLabel = (() => {
    if (azureApplying) return null;
    if (!hasChanges) return "No changes";
    const parts: string[] = [];
    if (toAddCount > 0) parts.push(`Add ${toAddCount}`);
    if (toRemoveCount > 0) parts.push(`Remove ${toRemoveCount}`);
    return parts.join(" · ");
  })();

  const platformAzureUsers = users.filter(u => u.source === "azure");
  const localUsers = users.filter(u => u.source === "local");

  return (
    <div className={pageWrapper}>
      <div className={pageInner}>
        <h1 className={pageTitle}>Users</h1>
        <Tabs defaultValue="local" className="mt-6">
          <TabsList>
            <TabsTrigger value="local">Local Users</TabsTrigger>
            <TabsTrigger value="azure">Azure AD</TabsTrigger>
          </TabsList>

          <TabsContent value="local">
            <div className="flex justify-end mb-4">
              <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1" /> Add User</Button>
            </div>
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : localUsers.length === 0 ? (
              <p className={`text-center py-12 ${muted}`}>No local users yet.</p>
            ) : (
              <div className="space-y-2">
                {localUsers.map(u => (
                  <div key={u.id} className={`flex items-center justify-between rounded-lg border p-4 transition-opacity ${u.disabled ? "opacity-50" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm">{u.displayName ?? u.username ?? u.email}</p>
                      <p className={muted}>{u.username ?? u.email}</p>
                      {u.groupId && groups.find(g => g.id === u.groupId) && (
                        <p className="text-xs text-primary mt-0.5">{groups.find(g => g.id === u.groupId)?.name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch checked={!u.disabled} onCheckedChange={checked => handleToggle(u.id, !checked)} title={u.disabled ? "Enable access" : "Disable access"} />
                      <Button size="icon" variant="ghost" onClick={() => openEdit(u)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleteId(u.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="azure">
            <div className="flex justify-end mb-4">
              <Button variant="outline" onClick={browseAzure} size="sm">
                <CloudDownload className="h-4 w-4 mr-1.5" />Browse Azure AD
              </Button>
            </div>

            {platformAzureUsers.length === 0 ? (
              <p className={`text-center py-12 ${muted}`}>No Azure AD users on the platform yet.</p>
            ) : (
              <div className="space-y-2">
                {platformAzureUsers.map(u => (
                  <div key={u.id} className={`flex items-center justify-between rounded-lg border p-4 transition-opacity ${u.disabled ? "opacity-50" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm">{u.displayName ?? u.email}</p>
                      <p className={muted}>{u.email}</p>
                      {u.groupId && groups.find(g => g.id === u.groupId) && (
                        <p className="text-xs text-primary mt-0.5">{groups.find(g => g.id === u.groupId)?.name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-sky-600 border-sky-300 dark:text-sky-400 dark:border-sky-700">Azure</Badge>
                      <Switch checked={!u.disabled} onCheckedChange={checked => handleToggle(u.id, !checked)} title={u.disabled ? "Enable access" : "Disable access"} />
                      <Button size="icon" variant="ghost" onClick={() => openEdit(u)}><Pencil className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Create/edit dialog — local users: full form; Azure users: role + group only */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{form.id ? "Edit User" : "Add User"}</DialogTitle>
              {form.source === "azure" && (
                <p className="text-xs text-muted-foreground pt-1">
                  This is an Azure AD user. To change their name or email, update them in Azure AD.
                </p>
              )}
            </DialogHeader>
            <div className="flex flex-col gap-4">
              {form.source === "azure" ? (
                <>
                  <div className="rounded-lg border bg-muted/40 px-4 py-3 space-y-0.5">
                    <p className="text-sm font-medium">{form.displayName || form.email}</p>
                    {form.displayName && <p className="text-xs text-muted-foreground">{form.email}</p>}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Group</Label>
                    <Select value={form.groupId || "none"} onValueChange={v => setForm(f => ({ ...f, groupId: v === "none" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder="No group" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No group</SelectItem>
                        {groups.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label>Username</Label>
                    <Input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} autoComplete="off" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Display Name</Label>
                    <Input value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>{form.id ? "New Password (leave blank to keep)" : "Password"}</Label>
                    <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Group</Label>
                    <Select value={form.groupId || "none"} onValueChange={v => setForm(f => ({ ...f, groupId: v === "none" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder="No group" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No group</SelectItem>
                        {groups.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Azure browse dialog */}
        <Dialog open={azureDialogOpen} onOpenChange={setAzureDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Browse Azure AD</DialogTitle>
              <p className="text-xs text-muted-foreground pt-1">
                Checked users are on the platform. Uncheck to remove, check to add.
              </p>
            </DialogHeader>
            {azureLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <Label>Group for newly added users</Label>
                  <Select value={azureGroupId || "none"} onValueChange={v => setAzureGroupId(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="No group" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No group</SelectItem>
                      {groups.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    className="pl-8"
                    placeholder="Filter by name or email…"
                    value={azureFilter}
                    onChange={e => setAzureFilter(e.target.value)}
                  />
                </div>

                {filteredAzure.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No users match your filter.</p>
                ) : (
                  <div className="max-h-72 overflow-y-auto overflow-x-hidden space-y-1 border rounded-lg p-2">
                    <div className="flex justify-between text-xs text-muted-foreground px-1 pb-1">
                      <span>{filteredAzure.length} user{filteredAzure.length !== 1 ? "s" : ""}</span>
                      <div className="flex gap-3">
                        <button type="button" className="hover:text-foreground transition-colors"
                          onClick={() => setAzureSelected(prev => { const n = new Set(prev); filteredAzure.forEach(u => n.add(u.oid)); return n; })}>
                          Select all
                        </button>
                        <button type="button" className="hover:text-foreground transition-colors"
                          onClick={() => setAzureSelected(prev => { const n = new Set(prev); filteredAzure.forEach(u => n.delete(u.oid)); return n; })}>
                          Deselect all
                        </button>
                      </div>
                    </div>
                    {filteredAzure.map(u => (
                      <label key={u.oid} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/50 cursor-pointer min-w-0 w-full">
                        <input
                          type="checkbox"
                          checked={azureSelected.has(u.oid)}
                          onChange={() => {
                            const next = new Set(azureSelected);
                            next.has(u.oid) ? next.delete(u.oid) : next.add(u.oid);
                            setAzureSelected(next);
                          }}
                          className="h-4 w-4 rounded accent-primary shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{u.displayName ?? u.email}</p>
                          {u.displayName && <p className="text-xs text-muted-foreground truncate">{u.email}</p>}
                        </div>
                        {u.inPlatform && (
                          <Badge variant="outline" className="shrink-0 text-xs text-sky-600 border-sky-300 dark:text-sky-400 dark:border-sky-700">On platform</Badge>
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setAzureDialogOpen(false)}>Cancel</Button>
              <Button onClick={applyAzureChanges} disabled={azureApplying || azureLoading || !hasChanges}>
                {azureApplying ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Applying…</> : applyLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirm — local users only */}
        <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Remove User</DialogTitle></DialogHeader>
            <p className="text-sm">Are you sure? This action cannot be undone.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => deleteId && handleDelete(deleteId)}>Remove</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
