"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Pencil, Trash2, Monitor } from "lucide-react";
import { pageWrapper, pageInner, pageTitle, muted } from "@/lib/ui-conventions";

interface Connection { id: number; name: string; host: string; port: number | null; protocol: string; folderId: number | null; credentialId: number | null; notes: string | null }
interface FolderRow { id: number; name: string; parentId: number | null }
interface Credential { id: number; name: string; username: string }

const PROTO_BADGE: Record<string, string> = {
  rdp: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  vnc: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  ssh: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
};

export default function ConnectionsPage() {
  const [list, setList] = useState<Connection[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ id: 0, name: "", host: "", port: "", protocol: "rdp", folderId: "", credentialId: "", notes: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cr, fr, cdr] = await Promise.all([
        fetch("/api/admin/connections"),
        fetch("/api/admin/folders"),
        fetch("/api/admin/credentials"),
      ]);
      const [cd, fd, cdd] = await Promise.all([cr.json(), fr.json(), cdr.json()]);
      setList(cd.connections ?? []);
      setFolders(fd.folders ?? []);
      setCredentials(cdd.credentials ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setForm({ id: 0, name: "", host: "", port: "", protocol: "rdp", folderId: "", credentialId: "", notes: "" });
    setDialogOpen(true);
  }

  function openEdit(c: Connection) {
    setForm({
      id: c.id, name: c.name, host: c.host,
      port: c.port?.toString() ?? "", protocol: c.protocol,
      folderId: c.folderId?.toString() ?? "",
      credentialId: c.credentialId?.toString() ?? "",
      notes: c.notes ?? "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const method = form.id ? "PUT" : "POST";
      const payload = {
        ...(form.id ? { id: form.id } : {}),
        name: form.name,
        host: form.host,
        port: form.port ? Number(form.port) : null,
        protocol: form.protocol,
        folderId: form.folderId ? Number(form.folderId) : null,
        credentialId: form.credentialId ? Number(form.credentialId) : null,
        notes: form.notes || undefined,
      };
      const r = await fetch("/api/admin/connections", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Save failed"); return; }
      toast.success(form.id ? "Connection updated" : "Connection created");
      setDialogOpen(false);
      load();
    } finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    const r = await fetch(`/api/admin/connections?id=${id}`, { method: "DELETE" });
    if (!r.ok) { toast.error("Delete failed"); return; }
    toast.success("Connection deleted");
    setDeleteId(null);
    load();
  }

  function folderPath(folderId: number | null): string {
    if (!folderId) return "";
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return "";
    if (folder.parentId) {
      const parent = folders.find(f => f.id === folder.parentId);
      return parent ? `${parent.name} / ${folder.name}` : folder.name;
    }
    return folder.name;
  }

  return (
    <div className={pageWrapper}>
      <div className={pageInner}>
        <div className="flex items-center justify-between mb-6">
          <h1 className={pageTitle}>Connections</h1>
          <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1" />Add Connection</Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : list.length === 0 ? (
          <p className={`text-center py-12 ${muted}`}>No connections yet.</p>
        ) : (
          <div className="space-y-2">
            {list.map(c => {
              const cred = credentials.find(cr => cr.id === c.credentialId);
              const fp = folderPath(c.folderId);
              return (
                <div key={c.id} className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <Monitor className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{c.name}</p>
                        <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${PROTO_BADGE[c.protocol] ?? ""}`}>{c.protocol}</span>
                      </div>
                      <p className={muted}>{c.host}{c.port ? `:${c.port}` : ""}{fp ? ` · ${fp}` : ""}</p>
                      {cred && <p className="text-xs text-primary">{cred.name}</p>}
                      {!cred && c.folderId && <p className={`text-xs ${muted}`}>Inherits credential from folder</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeleteId(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{form.id ? "Edit Connection" : "Add Connection"}</DialogTitle></DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Name</Label>
                <Input placeholder="e.g. Web Server 01" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 flex flex-col gap-1.5">
                  <Label>Host / IP</Label>
                  <Input placeholder="192.168.1.10" value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Port <span className={muted}>(opt)</span></Label>
                  <Input placeholder="3389" type="number" value={form.port} onChange={e => setForm(f => ({ ...f, port: e.target.value }))} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Protocol</Label>
                <Select value={form.protocol} onValueChange={v => setForm(f => ({ ...f, protocol: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rdp">RDP</SelectItem>
                    <SelectItem value="vnc">VNC</SelectItem>
                    <SelectItem value="ssh">SSH</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Folder <span className={muted}>(optional)</span></Label>
                <Select value={form.folderId || "none"} onValueChange={v => setForm(f => ({ ...f, folderId: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="No folder" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No folder</SelectItem>
                    {folders.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Credential <span className={muted}>(overrides folder)</span></Label>
                <Select value={form.credentialId || "none"} onValueChange={v => setForm(f => ({ ...f, credentialId: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Inherit from folder" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Inherit from folder</SelectItem>
                    {credentials.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name} ({c.username})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Notes <span className={muted}>(optional)</span></Label>
                <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Delete Connection</DialogTitle></DialogHeader>
            <p className="text-sm">Are you sure? This cannot be undone.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => deleteId && handleDelete(deleteId)}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
