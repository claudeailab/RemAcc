"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Trash2, Folder, FolderOpen } from "lucide-react";
import { pageWrapper, pageInner, pageTitle, muted } from "@/lib/ui-conventions";

interface FolderRow { id: number; name: string; parentId: number | null; credentialId: number | null }
interface Credential { id: number; name: string; username: string }

export default function FoldersPage() {
  const [list, setList] = useState<FolderRow[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ id: 0, name: "", parentId: "", credentialId: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fr, cr] = await Promise.all([fetch("/api/admin/folders"), fetch("/api/admin/credentials")]);
      const [fd, cd] = await Promise.all([fr.json(), cr.json()]);
      setList(fd.folders ?? []);
      setCredentials(cd.credentials ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setForm({ id: 0, name: "", parentId: "", credentialId: "" });
    setDialogOpen(true);
  }

  function openEdit(f: FolderRow) {
    setForm({ id: f.id, name: f.name, parentId: f.parentId?.toString() ?? "", credentialId: f.credentialId?.toString() ?? "" });
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const method = form.id ? "PUT" : "POST";
      const payload = {
        ...(form.id ? { id: form.id } : {}),
        name: form.name,
        parentId: form.parentId ? Number(form.parentId) : null,
        credentialId: form.credentialId ? Number(form.credentialId) : null,
      };
      const r = await fetch("/api/admin/folders", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Save failed"); return; }
      toast.success(form.id ? "Folder updated" : "Folder created");
      setDialogOpen(false);
      load();
    } finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    setDeleteError("");
    const r = await fetch(`/api/admin/folders?id=${id}`, { method: "DELETE" });
    const d = await r.json();
    if (!r.ok) { setDeleteError(d.error ?? "Delete failed"); return; }
    toast.success("Folder deleted");
    setDeleteId(null);
    load();
  }

  // Build simple indented tree
  const roots = list.filter(f => !f.parentId).sort((a, b) => a.name.localeCompare(b.name));
  const children = (parentId: number) => list.filter(f => f.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name));

  function renderFolder(f: FolderRow, depth = 0) {
    const cred = credentials.find(c => c.id === f.credentialId);
    const subs = children(f.id);
    return (
      <div key={f.id}>
        <div className="flex items-center justify-between rounded-lg border p-4" style={{ marginLeft: depth * 20 }}>
          <div className="flex items-center gap-3 min-w-0">
            {subs.length > 0 ? <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" /> : <Folder className="h-4 w-4 text-muted-foreground shrink-0" />}
            <div className="min-w-0">
              <p className="font-medium text-sm">{f.name}</p>
              {cred && <p className={muted}>Credential: {cred.name}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="icon" variant="ghost" onClick={() => openEdit(f)}><Pencil className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" onClick={() => { setDeleteId(f.id); setDeleteError(""); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        </div>
        {subs.map(s => renderFolder(s, depth + 1))}
      </div>
    );
  }

  return (
    <div className={pageWrapper}>
      <div className={pageInner}>
        <div className="flex items-center justify-between mb-6">
          <h1 className={pageTitle}>Folders</h1>
          <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1" />Add Folder</Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : list.length === 0 ? (
          <p className={`text-center py-12 ${muted}`}>No folders yet.</p>
        ) : (
          <div className="space-y-2">{roots.map(f => renderFolder(f))}</div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{form.id ? "Edit Folder" : "Add Folder"}</DialogTitle></DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Name</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Parent Folder <span className={muted}>(optional)</span></Label>
                <Select value={form.parentId || "none"} onValueChange={v => setForm(f => ({ ...f, parentId: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="No parent (root)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No parent (root)</SelectItem>
                    {list.filter(f => f.id !== form.id).map(f => (
                      <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Credential <span className={muted}>(inherited by connections)</span></Label>
                <Select value={form.credentialId || "none"} onValueChange={v => setForm(f => ({ ...f, credentialId: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {credentials.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}{c.username ? ` (${c.username})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
            <DialogHeader><DialogTitle>Delete Folder</DialogTitle></DialogHeader>
            {deleteError ? (
              <p className="text-sm text-destructive">{deleteError}</p>
            ) : (
              <p className="text-sm">Are you sure? This cannot be undone.</p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
              {!deleteError && (
                <Button variant="destructive" onClick={() => deleteId && handleDelete(deleteId)}>Delete</Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
