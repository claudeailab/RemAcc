"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { pageWrapper, pageInner, pageTitle, muted } from "@/lib/ui-conventions";

interface Connection { id: number; name: string; host: string; port: number | null; protocol: string; folderId: number | null; credentialId: number | null; notes: string | null }
interface FolderRow { id: number; name: string; parentId: number | null }
interface Credential { id: number; name: string; username: string }

const PROTO_BADGE: Record<string, string> = {
  rdp: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  vnc: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  ssh: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
};

const PAGE_SIZE = 50;

export default function ConnectionsPage() {
  const [list, setList] = useState<Connection[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
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

  function folderName(folderId: number | null): string {
    if (!folderId) return "";
    return folders.find(f => f.id === folderId)?.name ?? "";
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.host.toLowerCase().includes(q) ||
      c.protocol.includes(q)
    );
  }, [list, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function handleSearch(v: string) {
    setSearch(v);
    setPage(1);
  }

  return (
    <div className={pageWrapper}>
      <div className={pageInner}>
        <div className="flex items-center justify-between mb-4">
          <h1 className={pageTitle}>Connections</h1>
          <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1" />Add</Button>
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-8 h-8 text-sm"
            placeholder="Search by name, host, or protocol…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <p className={`text-center py-12 text-sm ${muted}`}>{search ? "No matches." : "No connections yet."}</p>
        ) : (
          <>
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Name</th>
                    <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground hidden sm:table-cell">Host</th>
                    <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Proto</th>
                    <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground hidden md:table-cell">Folder</th>
                    <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground hidden lg:table-cell">Credential</th>
                    <th className="px-2 py-2 w-16" />
                  </tr>
                </thead>
                <tbody>
                  {paged.map((c, i) => {
                    const cred = credentials.find(cr => cr.id === c.credentialId);
                    const fn = folderName(c.folderId);
                    return (
                      <tr
                        key={c.id}
                        className={`border-b last:border-0 hover:bg-muted/20 transition-colors group ${i % 2 === 0 ? "" : "bg-muted/5"}`}
                      >
                        <td className="px-3 py-1.5 font-medium truncate max-w-[140px]">{c.name}</td>
                        <td className={`px-3 py-1.5 font-mono text-xs truncate max-w-[160px] hidden sm:table-cell ${muted}`}>
                          {c.host}{c.port ? `:${c.port}` : ""}
                        </td>
                        <td className="px-3 py-1.5">
                          <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${PROTO_BADGE[c.protocol] ?? ""}`}>{c.protocol}</span>
                        </td>
                        <td className={`px-3 py-1.5 text-xs truncate max-w-[120px] hidden md:table-cell ${muted}`}>{fn}</td>
                        <td className={`px-3 py-1.5 text-xs truncate max-w-[120px] hidden lg:table-cell ${muted}`}>{cred?.name ?? ""}</td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEdit(c)}><Pencil className="h-3 w-3" /></Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setDeleteId(c.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                <span>{filtered.length} total · page {currentPage} of {totalPages}</span>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" disabled={currentPage === 1} onClick={() => setPage(p => p - 1)}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" disabled={currentPage === totalPages} onClick={() => setPage(p => p + 1)}>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
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
                  <Label>Port <span className={muted}>(optional)</span></Label>
                  <Input type="number" value={form.port} onChange={e => setForm(f => ({ ...f, port: e.target.value }))} />
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
                    {credentials.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}{c.username ? ` (${c.username})` : ""}</SelectItem>)}
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
