"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Loader2, Plus, Pencil, Trash2, Copy, Search, ChevronLeft, ChevronRight,
  Folder, FolderOpen, ChevronRight as Chevron, Monitor,
} from "lucide-react";
import { pageWrapper, pageInner, pageTitle, muted } from "@/lib/ui-conventions";

interface ShadowOptions { sessionId: number; control: boolean; noConsent: boolean }
interface Connection { id: number; name: string; host: string; port: number | null; protocol: string; folderId: number | null; credentialId: number | null; notes: string | null; options: string | null }
interface FolderRow { id: number; name: string; parentId: number | null }
interface Credential { id: number; name: string; username: string }

const PROTO_BADGE: Record<string, string> = {
  rdp: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  vnc: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  ssh: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
};

const PAGE_SIZE = 50;
const UNASSIGNED = -1; // sentinel for "no folder"

// ── Folder tree ───────────────────────────────────────────────────────────────

function FolderTree({
  folders, connections, selected, onSelect, onDrop,
  onCloneFolder, onEditFolder, onDeleteFolder,
}: {
  folders: FolderRow[];
  connections: Connection[];
  selected: number | null;
  onSelect: (id: number | null) => void;
  onDrop: (connectionId: number, folderId: number | null) => void;
  onCloneFolder: (folder: FolderRow) => void;
  onEditFolder: (folder: FolderRow) => void;
  onDeleteFolder: (folder: FolderRow) => void;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [dragOver, setDragOver] = useState<number | null>(undefined as unknown as null);

  function toggle(id: number) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function handleDragOver(e: React.DragEvent, folderId: number | null) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(folderId ?? UNASSIGNED);
  }

  function handleDrop(e: React.DragEvent, folderId: number | null) {
    e.preventDefault();
    setDragOver(null);
    const id = Number(e.dataTransfer.getData("connectionId"));
    if (id) onDrop(id, folderId);
  }

  function renderFolder(f: FolderRow, depth = 0): React.ReactNode {
    const isOpen = expanded.has(f.id);
    const isActive = selected === f.id;
    const isDragTarget = dragOver === f.id;
    const count = connections.filter(c => c.folderId === f.id).length;
    const children = folders.filter(sf => sf.parentId === f.id);
    return (
      <div key={f.id}>
        <div
          style={{ paddingLeft: 8 + depth * 14 }}
          className={`group flex items-center gap-1.5 py-1 pr-2 rounded cursor-pointer select-none text-sm transition-colors
            ${isActive ? "bg-primary/10 text-primary font-medium" : "hover:bg-secondary/60"}
            ${isDragTarget ? "ring-1 ring-primary bg-primary/10" : ""}`}
          onClick={() => onSelect(isActive ? null : f.id)}
          onDragOver={e => handleDragOver(e, f.id)}
          onDragLeave={() => setDragOver(null)}
          onDrop={e => handleDrop(e, f.id)}
        >
          <button
            type="button"
            className="shrink-0 p-0.5"
            onClick={e => { e.stopPropagation(); if (children.length > 0) toggle(f.id); }}
          >
            {children.length > 0
              ? <Chevron className={`h-3 w-3 transition-transform ${isOpen ? "rotate-90" : ""}`} />
              : <span className="w-3" />
            }
          </button>
          {isOpen ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary" /> : <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          <span className="truncate flex-1">{f.name}</span>
          {count > 0 && <span className="text-[10px] text-muted-foreground shrink-0 mr-0.5">{count}</span>}
          <div className="flex items-center gap-0 shrink-0" onClick={e => e.stopPropagation()}>
            <button type="button" className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted/60 text-muted-foreground/40 hover:text-foreground" onClick={() => onEditFolder(f)}><Pencil className="h-2.5 w-2.5" /></button>
            <button type="button" className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted/60 text-muted-foreground/40 hover:text-foreground" onClick={() => onCloneFolder(f)}><Copy className="h-2.5 w-2.5" /></button>
            <button type="button" className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted/60 text-muted-foreground/40 hover:text-destructive" onClick={() => onDeleteFolder(f)}><Trash2 className="h-2.5 w-2.5" /></button>
          </div>
        </div>
        {isOpen && children.map(c => renderFolder(c, depth + 1))}
      </div>
    );
  }

  const rootFolders = folders.filter(f => !f.parentId);
  const unassignedCount = connections.filter(c => !c.folderId).length;
  const isAllActive = selected === null;
  const isUnassignedActive = selected === UNASSIGNED;
  const isDragAll = dragOver === null;
  const isDragUnassigned = dragOver === UNASSIGNED;

  return (
    <div className="flex flex-col gap-0.5 p-1 text-sm">
      {/* All */}
      <div
        className={`flex items-center gap-1.5 py-1 px-2 rounded cursor-pointer select-none transition-colors
          ${isAllActive ? "bg-primary/10 text-primary font-medium" : "hover:bg-secondary/60"}`}
        onClick={() => onSelect(null)}
      >
        <Monitor className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="flex-1">All connections</span>
        <span className="text-[10px] text-muted-foreground">{connections.length}</span>
      </div>

      {/* Unassigned */}
      <div
        className={`flex items-center gap-1.5 py-1 px-2 rounded cursor-pointer select-none transition-colors
          ${isUnassignedActive ? "bg-primary/10 text-primary font-medium" : "hover:bg-secondary/60"}
          ${isDragUnassigned ? "ring-1 ring-primary bg-primary/10" : ""}`}
        onClick={() => onSelect(UNASSIGNED)}
        onDragOver={e => handleDragOver(e, null)}
        onDragLeave={() => setDragOver(null)}
        onDrop={e => handleDrop(e, null)}
      >
        <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-muted-foreground">Unassigned</span>
        {unassignedCount > 0 && <span className="text-[10px] text-muted-foreground">{unassignedCount}</span>}
      </div>

      {rootFolders.length > 0 && (
        <div className="mt-1 border-t pt-1">
          {rootFolders.map(f => renderFolder(f))}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

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
  const [selectedFolder, setSelectedFolder] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [form, setForm] = useState({ id: 0, name: "", host: "", port: "", protocol: "rdp", folderId: "", credentialId: "", notes: "" });
  const [shadow, setShadow] = useState<ShadowOptions>({ sessionId: 0, control: true, noConsent: true });
  const shadowEnabled = shadow.sessionId > 0;
  const [dsmPlugin, setDsmPlugin] = useState(false);
  const [deleteFolderId, setDeleteFolderId] = useState<number | null>(null);
  const [editFolder, setEditFolder] = useState<FolderRow | null>(null);
  const [editFolderName, setEditFolderName] = useState("");

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
    setForm({ id: 0, name: "", host: "", port: "", protocol: "rdp", folderId: selectedFolder && selectedFolder !== UNASSIGNED ? String(selectedFolder) : "", credentialId: "", notes: "" });
    setShadow({ sessionId: 0, control: true, noConsent: true });
    setDsmPlugin(false);
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
    let opts: Record<string, unknown> = {};
    try { if (c.options) opts = JSON.parse(c.options); } catch {}
    const s = (opts.shadow ?? {}) as Partial<ShadowOptions>;
    setShadow({ sessionId: s.sessionId ?? 0, control: s.control ?? true, noConsent: s.noConsent ?? true });
    setDsmPlugin(!!(opts.dsmPlugin));
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const method = form.id ? "PUT" : "POST";
      const opts: Record<string, unknown> = {};
      if (form.protocol === "rdp" && shadow.sessionId > 0) {
        opts.shadow = { sessionId: shadow.sessionId, control: shadow.control, noConsent: shadow.noConsent };
      }
      if (form.protocol === "vnc" && dsmPlugin) {
        opts.dsmPlugin = true;
      }
      const payload = {
        ...(form.id ? { id: form.id } : {}),
        name: form.name, host: form.host,
        port: form.port ? Number(form.port) : null,
        protocol: form.protocol,
        folderId: form.folderId ? Number(form.folderId) : null,
        credentialId: form.credentialId ? Number(form.credentialId) : null,
        notes: form.notes || undefined,
        options: Object.keys(opts).length > 0 ? JSON.stringify(opts) : undefined,
      };
      const r = await fetch("/api/admin/connections", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Save failed"); return; }
      toast.success(form.id ? "Connection updated" : "Connection created");
      setDialogOpen(false);
      load();
    } finally { setSaving(false); }
  }

  async function handleClone(c: Connection) {
    const r = await fetch("/api/admin/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `${c.name} (copy)`,
        host: c.host, port: c.port, protocol: c.protocol,
        folderId: c.folderId, credentialId: c.credentialId,
        notes: c.notes ?? undefined, options: c.options ?? undefined,
      }),
    });
    if (!r.ok) { toast.error("Clone failed"); return; }
    toast.success("Connection cloned");
    load();
  }

  async function handleDelete(id: number) {
    const r = await fetch(`/api/admin/connections?id=${id}`, { method: "DELETE" });
    if (!r.ok) { toast.error("Delete failed"); return; }
    toast.success("Connection deleted");
    setDeleteId(null);
    load();
  }

  async function handleDrop(connectionId: number, folderId: number | null) {
    const conn = list.find(c => c.id === connectionId);
    if (!conn || conn.folderId === folderId) return;
    // Optimistic update
    setList(prev => prev.map(c => c.id === connectionId ? { ...c, folderId } : c));
    const r = await fetch("/api/admin/connections", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: connectionId, name: conn.name, host: conn.host, port: conn.port, protocol: conn.protocol, folderId, credentialId: conn.credentialId, options: conn.options }),
    });
    if (!r.ok) {
      toast.error("Move failed");
      setList(prev => prev.map(c => c.id === connectionId ? { ...c, folderId: conn.folderId } : c));
    }
  }

  async function handleCloneFolder(folder: FolderRow) {
    async function cloneRecursive(srcId: number, destParentId: number | null, name: string) {
      const r = await fetch("/api/admin/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId: destParentId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed to create folder");
      const newId: number = d.id;
      const conns = list.filter(c => c.folderId === srcId);
      for (const c of conns) {
        await fetch("/api/admin/connections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: c.name, host: c.host, port: c.port, protocol: c.protocol, folderId: newId, credentialId: c.credentialId, notes: c.notes ?? undefined, options: c.options ?? undefined }),
        });
      }
      for (const sf of folders.filter(f => f.parentId === srcId)) {
        await cloneRecursive(sf.id, newId, sf.name);
      }
    }
    try {
      await cloneRecursive(folder.id, folder.parentId, `${folder.name} (copy)`);
      toast.success("Folder cloned");
      load();
    } catch (e: unknown) { toast.error((e as Error).message ?? "Clone failed"); }
  }

  function openEditFolder(folder: FolderRow) { setEditFolder(folder); setEditFolderName(folder.name); }

  async function handleEditFolder() {
    if (!editFolder || !editFolderName.trim()) return;
    const r = await fetch("/api/admin/folders", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editFolder.id, name: editFolderName.trim() }) });
    if (!r.ok) { toast.error("Rename failed"); return; }
    toast.success("Folder renamed");
    setEditFolder(null);
    load();
  }

  async function handleDeleteFolder(id: number) {
    const r = await fetch(`/api/admin/folders?id=${id}`, { method: "DELETE" });
    const d = await r.json();
    if (!r.ok) { toast.error(d.error ?? "Delete failed"); return; }
    toast.success("Folder deleted");
    setDeleteFolderId(null);
    load();
  }

  function folderName(folderId: number | null): string {
    if (!folderId) return "";
    return folders.find(f => f.id === folderId)?.name ?? "";
  }

  const filtered = useMemo(() => {
    let items = list;
    if (selectedFolder === UNASSIGNED) items = items.filter(c => !c.folderId);
    else if (selectedFolder !== null) {
      const allDescendants = new Set<number>();
      const addDescendants = (id: number) => {
        allDescendants.add(id);
        folders.filter(f => f.parentId === id).forEach(f => addDescendants(f.id));
      };
      addDescendants(selectedFolder);
      items = items.filter(c => c.folderId !== null && allDescendants.has(c.folderId));
    }
    const q = search.trim().toLowerCase();
    if (q) items = items.filter(c => c.name.toLowerCase().includes(q) || c.host.toLowerCase().includes(q) || c.protocol.includes(q));
    return items;
  }, [list, selectedFolder, search, folders]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function handleSearch(v: string) { setSearch(v); setPage(1); }
  function handleSelectFolder(id: number | null) { setSelectedFolder(id); setPage(1); setSearch(""); }

  return (
    <div className={pageWrapper}>
      <div className={pageInner}>
        <div className="flex items-center justify-between mb-4">
          <h1 className={pageTitle}>Connections</h1>
          <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1" />Add</Button>
        </div>

        <div className="flex gap-4">
          {/* Folder tree */}
          <div className="w-44 shrink-0 rounded-lg border overflow-hidden self-start">
            <FolderTree
              folders={folders}
              connections={list}
              selected={selectedFolder}
              onSelect={handleSelectFolder}
              onDrop={handleDrop}
              onCloneFolder={handleCloneFolder}
              onEditFolder={openEditFolder}
              onDeleteFolder={f => setDeleteFolderId(f.id)}
            />
          </div>

          {/* Connections table */}
          <div className="flex-1 min-w-0">
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input className="pl-8 h-8 text-sm" placeholder="Search…" value={search} onChange={e => handleSearch(e.target.value)} />
            </div>

            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : filtered.length === 0 ? (
              <p className={`text-center py-12 text-sm ${muted}`}>{search ? "No matches." : "No connections here."}</p>
            ) : (
              <>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="w-4 px-2 py-1.5" />
                        <th className="text-left px-3 py-1.5 font-medium text-xs text-muted-foreground">Name</th>
                        <th className="text-left px-3 py-1.5 font-medium text-xs text-muted-foreground hidden sm:table-cell">Host</th>
                        <th className="text-left px-3 py-1.5 font-medium text-xs text-muted-foreground">Proto</th>
                        <th className="text-left px-3 py-1.5 font-medium text-xs text-muted-foreground hidden md:table-cell">Folder</th>
                        <th className="px-2 py-1.5 w-14" />
                      </tr>
                    </thead>
                    <tbody>
                      {paged.map((c, i) => {
                        const fn = folderName(c.folderId);
                        const isDragging = draggingId === c.id;
                        return (
                          <tr
                            key={c.id}
                            draggable
                            onDragStart={e => { e.dataTransfer.setData("connectionId", String(c.id)); setDraggingId(c.id); }}
                            onDragEnd={() => setDraggingId(null)}
                            className={`border-b last:border-0 hover:bg-muted/20 transition-colors group cursor-grab active:cursor-grabbing
                              ${isDragging ? "opacity-40" : ""}
                              ${i % 2 === 0 ? "" : "bg-muted/5"}`}
                          >
                            <td className="px-2 py-1.5 text-muted-foreground/30 group-hover:text-muted-foreground/60">
                              <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
                                <circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/>
                                <circle cx="2" cy="6" r="1.2"/><circle cx="6" cy="6" r="1.2"/>
                                <circle cx="2" cy="10" r="1.2"/><circle cx="6" cy="10" r="1.2"/>
                              </svg>
                            </td>
                            <td className="px-3 py-1.5 font-medium truncate max-w-[140px]">{c.name}</td>
                            <td className={`px-3 py-1.5 font-mono text-xs truncate max-w-[160px] hidden sm:table-cell ${muted}`}>
                              {c.host}{c.port ? `:${c.port}` : ""}
                            </td>
                            <td className="px-3 py-1.5">
                              <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${PROTO_BADGE[c.protocol] ?? ""}`}>{c.protocol}</span>
                            </td>
                            <td className={`px-3 py-1.5 text-xs truncate max-w-[120px] hidden md:table-cell ${muted}`}>{fn}</td>
                            <td className="px-2 py-1.5">
                              <div className="flex items-center gap-0.5">
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEdit(c)}><Pencil className="h-3 w-3" /></Button>
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleClone(c)}><Copy className="h-3 w-3" /></Button>
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
          </div>
        </div>

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

              {form.protocol === "rdp" && (
                <div className="rounded-lg border p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Shadow Session</p>
                    <Switch
                      checked={shadowEnabled}
                      onCheckedChange={v => setShadow(s => ({ ...s, sessionId: v ? 1 : 0 }))}
                    />
                  </div>
                  {shadowEnabled && (
                    <div className="space-y-3">
                      <div className="flex flex-col gap-1.5">
                        <Label>Session ID</Label>
                        <Input
                          type="number" min={1} max={9999} className="w-28"
                          value={shadow.sessionId}
                          onChange={e => setShadow(s => ({ ...s, sessionId: Math.max(1, parseInt(e.target.value) || 1) }))}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Control</Label>
                          <p className={`text-xs ${muted}`}>Take control of the session (not view-only)</p>
                        </div>
                        <Switch checked={shadow.control} onCheckedChange={v => setShadow(s => ({ ...s, control: v }))} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>No Consent Prompt</Label>
                          <p className={`text-xs ${muted}`}>Shadow without asking the remote user</p>
                        </div>
                        <Switch checked={shadow.noConsent} onCheckedChange={v => setShadow(s => ({ ...s, noConsent: v }))} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {form.protocol === "vnc" && (
                <div className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">DSM Encryption</p>
                      <p className={`text-xs ${muted}`}>UltraVNC SecureVNCPlugin — requires files uploaded in Protocol Settings</p>
                    </div>
                    <Switch checked={dsmPlugin} onCheckedChange={setDsmPlugin} />
                  </div>
                </div>
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

        <Dialog open={editFolder !== null} onOpenChange={v => { if (!v) setEditFolder(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Rename Folder</DialogTitle></DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label>Name</Label>
              <Input value={editFolderName} onChange={e => setEditFolderName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleEditFolder(); }} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditFolder(null)}>Cancel</Button>
              <Button onClick={handleEditFolder} disabled={!editFolderName.trim()}>Rename</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteFolderId !== null} onOpenChange={() => setDeleteFolderId(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Delete Folder</DialogTitle></DialogHeader>
            <p className="text-sm">Are you sure? The folder must be empty to delete it.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteFolderId(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => deleteFolderId && handleDeleteFolder(deleteFolderId)}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
