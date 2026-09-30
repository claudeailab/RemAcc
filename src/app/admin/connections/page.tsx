"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Loader2, Plus, Pencil, Trash2, Copy, ChevronRight,
  Folder, FolderOpen, Monitor, FolderPlus, Globe, Upload, Download,
  CheckSquare, Check,
} from "lucide-react";
import { pageWrapper, pageInner, pageTitle, muted } from "@/lib/ui-conventions";

interface FolderRow { id: number; name: string; parentId: number | null; credentialId: number | null }
interface Connection { id: number; name: string; host: string; port: number | null; protocol: string; folderId: number | null; credentialId: number | null; notes: string | null; options: string | null }
interface Credential { id: number; name: string; username: string }
interface ShadowOptions { sessionId: number; control: boolean; noConsent: boolean }

const PROTO_BADGE: Record<string, string> = {
  rdp: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  vnc: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  ssh: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  web: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
};
const DSM_BADGE = "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300";

function isDsm(c: Connection) {
  try { return !!(c.options && JSON.parse(c.options).dsmPlugin); } catch { return false; }
}

// Is `ancestorId` an ancestor of `targetId` in the folder tree?
function isAncestor(folders: FolderRow[], ancestorId: number, targetId: number): boolean {
  let cur: number | null = targetId;
  while (cur !== null) {
    if (cur === ancestorId) return true;
    cur = folders.find(f => f.id === cur)?.parentId ?? null;
  }
  return false;
}

type DragItem = { kind: "folder"; id: number } | { kind: "conn"; id: number };

// Returns folders in DFS order with their depth, excluding `excludeId` and its descendants
function flattenFolders(all: FolderRow[], excludeId?: number): { id: number; name: string; depth: number }[] {
  const excluded = new Set<number>();
  if (excludeId !== undefined) {
    const queue = [excludeId];
    while (queue.length) {
      const cur = queue.shift()!;
      excluded.add(cur);
      all.filter(f => f.parentId === cur).forEach(f => queue.push(f.id));
    }
  }
  const result: { id: number; name: string; depth: number }[] = [];
  function visit(parentId: number | null, depth: number) {
    all
      .filter(f => f.parentId === parentId && !excluded.has(f.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(f => { result.push({ id: f.id, name: f.name, depth }); visit(f.id, depth + 1); });
  }
  visit(null, 0);
  return result;
}

const DRAG_HANDLE = (
  <svg className="h-3 w-3 shrink-0 text-muted-foreground/25 group-hover:text-muted-foreground/50 cursor-grab transition-colors" width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
    <circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/>
    <circle cx="2" cy="6" r="1.2"/><circle cx="6" cy="6" r="1.2"/>
    <circle cx="2" cy="10" r="1.2"/><circle cx="6" cy="10" r="1.2"/>
  </svg>
);

export default function ConnectionsPage() {
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // Edit mode — drag/drop only active when enabled
  const [editMode, setEditMode] = useState(false);

  // Drag / drop
  const [dragging, setDragging] = useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<number | "root" | null>(null);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "folder" | "conn"; id: number; name: string } | null>(null);

  // Folder dialog
  const [folderDialog, setFolderDialog] = useState(false);
  const [folderSaving, setFolderSaving] = useState(false);
  const [folderForm, setFolderForm] = useState({ id: 0, name: "", parentId: "", credentialId: "" });

  // Connection dialog
  const [connDialog, setConnDialog] = useState(false);
  const [connSaving, setConnSaving] = useState(false);
  const [connForm, setConnForm] = useState({ id: 0, name: "", host: "", port: "", protocol: "rdp", folderId: "", credentialId: "" });
  const [shadow, setShadow] = useState<ShadowOptions>({ sessionId: 0, control: true, noConsent: true });
  const [dsmPlugin, setDsmPlugin] = useState(false);

  // Select / bulk delete
  const [selectMode, setSelectMode] = useState(false);
  const [selectedFolders, setSelectedFolders] = useState<Set<number>>(new Set());
  const [selectedConns, setSelectedConns] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState(false);

  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await fetch("/api/admin/import", { method: "POST", body: form });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Import failed"); return; }
      toast.success(`Imported ${d.created} connections, skipped ${d.skipped} duplicates`);
      load();
    } finally { setImporting(false); }
  }

  async function handleExport() {
    const r = await fetch("/api/admin/export");
    if (!r.ok) { toast.error("Export failed"); return; }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "connections.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fr, cr, cdr] = await Promise.all([
        fetch("/api/admin/folders"),
        fetch("/api/admin/connections"),
        fetch("/api/admin/credentials"),
      ]);
      const [fd, cd, cdd] = await Promise.all([fr.json(), cr.json(), cdr.json()]);
      setFolders(fd.folders ?? []);
      setConnections(cd.connections ?? []);
      setCredentials(cdd.credentials ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-match credential when creating a folder whose name matches a credential
  useEffect(() => {
    if (!folderDialog || folderForm.id || folderForm.credentialId) return;
    const match = credentials.find(c => c.name.toLowerCase() === folderForm.name.toLowerCase());
    if (match) setFolderForm(f => ({ ...f, credentialId: String(match.id) }));
  }, [folderForm.name, folderDialog, folderForm.id, folderForm.credentialId, credentials]);

  // ── Select / bulk delete ─────────────────────────────────────────────────────

  function enterSelectMode() {
    setSelectMode(true);
    setSelectedFolders(new Set());
    setSelectedConns(new Set());
    setEditMode(false);
  }
  function exitSelectMode() {
    setSelectMode(false);
    setSelectedFolders(new Set());
    setSelectedConns(new Set());
  }
  function toggleFolderSel(id: number) {
    setSelectedFolders(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleConnSel(id: number) {
    setSelectedConns(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function executeBulkDelete() {
    setBulkDeleting(true);
    try {
      for (const id of selectedConns) await fetch(`/api/admin/connections?id=${id}`, { method: "DELETE" });
      for (const id of selectedFolders) await fetch(`/api/admin/folders?id=${id}`, { method: "DELETE" });
      toast.success(`Deleted ${selectedFolders.size + selectedConns.size} item${selectedFolders.size + selectedConns.size === 1 ? "" : "s"}`);
      exitSelectMode();
      setBulkConfirm(false);
      load();
    } finally { setBulkDeleting(false); }
  }

  function toggle(id: number) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  // ── Folder CRUD ─────────────────────────────────────────────────────────────

  function openNewFolder(parentId?: number) {
    setFolderForm({ id: 0, name: "", parentId: parentId ? String(parentId) : "", credentialId: "" });
    setFolderDialog(true);
  }
  function openEditFolder(f: FolderRow) {
    setFolderForm({ id: f.id, name: f.name, parentId: f.parentId?.toString() ?? "", credentialId: f.credentialId?.toString() ?? "" });
    setFolderDialog(true);
  }
  async function saveFolder() {
    setFolderSaving(true);
    try {
      const method = folderForm.id ? "PUT" : "POST";
      const r = await fetch("/api/admin/folders", {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(folderForm.id ? { id: folderForm.id } : {}),
          name: folderForm.name,
          parentId: folderForm.parentId ? Number(folderForm.parentId) : null,
          credentialId: folderForm.credentialId ? Number(folderForm.credentialId) : null,
        }),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Save failed"); return; }
      toast.success(folderForm.id ? "Folder updated" : "Folder created");
      setFolderDialog(false);
      load();
    } finally { setFolderSaving(false); }
  }

  async function cloneFolder(f: FolderRow) {
    async function cloneRec(src: FolderRow, destParentId: number | null, name: string) {
      const r = await fetch("/api/admin/folders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId: destParentId, credentialId: src.credentialId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      for (const c of connections.filter(c => c.folderId === src.id)) {
        await fetch("/api/admin/connections", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: c.name, host: c.host, port: c.port, protocol: c.protocol, folderId: d.id, credentialId: c.credentialId, notes: c.notes ?? undefined, options: c.options ?? undefined }),
        });
      }
      for (const sub of folders.filter(sf => sf.parentId === src.id)) await cloneRec(sub, d.id, sub.name);
    }
    try { await cloneRec(f, f.parentId, `${f.name} (copy)`); toast.success("Folder cloned"); }
    catch (e: unknown) { toast.error((e as Error).message || "Clone failed"); }
    load();
  }

  async function deleteFolder(id: number) {
    const r = await fetch(`/api/admin/folders?id=${id}`, { method: "DELETE" });
    if (!r.ok) { toast.error("Delete failed"); return; }
    toast.success("Folder deleted");
    setDeleteTarget(null);
    load();
  }

  // ── Connection CRUD ──────────────────────────────────────────────────────────

  function openNewConn(folderId?: number) {
    setConnForm({ id: 0, name: "", host: "", port: "", protocol: "rdp", folderId: folderId ? String(folderId) : "", credentialId: "" });
    setShadow({ sessionId: 0, control: true, noConsent: true });
    setDsmPlugin(false);
    setConnDialog(true);
  }
  function openEditConn(c: Connection) {
    setConnForm({ id: c.id, name: c.name, host: c.host, port: c.port?.toString() ?? "", protocol: c.protocol, folderId: c.folderId?.toString() ?? "", credentialId: c.credentialId?.toString() ?? "" });
    let opts: Record<string, unknown> = {};
    try { if (c.options) opts = JSON.parse(c.options); } catch {}
    const s = (opts.shadow ?? {}) as Partial<ShadowOptions>;
    setShadow({ sessionId: s.sessionId ?? 0, control: s.control ?? true, noConsent: s.noConsent ?? true });
    setDsmPlugin(!!(opts.dsmPlugin));
    setConnDialog(true);
  }
  async function saveConn() {
    setConnSaving(true);
    try {
      const opts: Record<string, unknown> = {};
      if (connForm.protocol === "rdp" && shadow.sessionId > 0) opts.shadow = shadow;
      if (connForm.protocol === "vnc" && dsmPlugin) opts.dsmPlugin = true;
      const r = await fetch("/api/admin/connections", {
        method: connForm.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(connForm.id ? { id: connForm.id } : {}),
          name: connForm.name, host: connForm.host,
          port: connForm.protocol === "web" ? null : (connForm.port ? Number(connForm.port) : null),
          protocol: connForm.protocol,
          folderId: connForm.folderId ? Number(connForm.folderId) : null,
          credentialId: connForm.protocol === "web" ? null : (connForm.credentialId ? Number(connForm.credentialId) : null),
          options: Object.keys(opts).length > 0 ? JSON.stringify(opts) : undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Save failed"); return; }
      toast.success(connForm.id ? "Connection updated" : "Connection created");
      setConnDialog(false);
      load();
    } finally { setConnSaving(false); }
  }

  async function cloneConn(c: Connection) {
    const r = await fetch("/api/admin/connections", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `${c.name} (copy)`, host: c.host, port: c.port, protocol: c.protocol, folderId: c.folderId, credentialId: c.credentialId, options: c.options ?? undefined }),
    });
    if (!r.ok) { toast.error("Clone failed"); return; }
    toast.success("Connection cloned");
    load();
  }

  async function deleteConn(id: number) {
    const r = await fetch(`/api/admin/connections?id=${id}`, { method: "DELETE" });
    if (!r.ok) { toast.error("Delete failed"); return; }
    toast.success("Connection deleted");
    setDeleteTarget(null);
    load();
  }

  // ── Drag / drop ──────────────────────────────────────────────────────────────

  async function commitDrop(target: number | "root") {
    if (!dragging) return;
    const newParent = target === "root" ? null : target;
    setDragging(null);
    setDropTarget(null);

    if (dragging.kind === "conn") {
      const c = connections.find(c => c.id === dragging.id);
      if (!c || c.folderId === newParent) return;
      setConnections(prev => prev.map(x => x.id === dragging.id ? { ...x, folderId: newParent } : x));
      const r = await fetch("/api/admin/connections", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, name: c.name, host: c.host, port: c.port, protocol: c.protocol, folderId: newParent, credentialId: c.credentialId, options: c.options ?? undefined }),
      });
      if (!r.ok) { toast.error("Move failed"); load(); }
    } else {
      const f = folders.find(f => f.id === dragging.id);
      if (!f || f.parentId === newParent) return;
      if (target !== "root" && (target === dragging.id || isAncestor(folders, dragging.id, target))) return;
      const r = await fetch("/api/admin/folders", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: f.id, name: f.name, parentId: newParent, credentialId: f.credentialId }),
      });
      if (!r.ok) { toast.error("Move failed"); return; }
      load();
    }
  }

  // ── Tree rendering ───────────────────────────────────────────────────────────

  function renderConn(c: Connection, depth: number) {
    const dim = dragging?.kind === "conn" && dragging.id === c.id;
    const checked = selectedConns.has(c.id);
    return (
      <div
        key={c.id}
        draggable={editMode}
        onDragStart={editMode ? (e => { e.dataTransfer.effectAllowed = "move"; setDragging({ kind: "conn", id: c.id }); }) : undefined}
        onDragEnd={editMode ? (() => { setDragging(null); setDropTarget(null); }) : undefined}
        onClick={selectMode ? () => toggleConnSel(c.id) : undefined}
        style={{ paddingLeft: depth * 16 + 8 }}
        className={`flex items-center gap-1.5 py-1 pr-2 rounded group transition-colors ${dim ? "opacity-40" : ""} ${selectMode ? "cursor-pointer hover:bg-secondary/40" : "hover:bg-secondary/40"} ${checked ? "bg-primary/8" : ""}`}
      >
        {selectMode ? (
          <span className={`shrink-0 flex items-center justify-center h-4 w-4 rounded border transition-colors ${checked ? "bg-primary border-primary text-primary-foreground" : "border-input"}`}>
            {checked && <Check className="h-2.5 w-2.5" />}
          </span>
        ) : editMode && DRAG_HANDLE}
        {c.protocol === "web"
          ? <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          : <Monitor className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        }
        <span className="text-sm truncate flex-1">{c.name}</span>
        <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded shrink-0 ${PROTO_BADGE[c.protocol] ?? ""}`}>{c.protocol}</span>
        {isDsm(c) && <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded shrink-0 ${DSM_BADGE}`}>DSM</span>}
        <span className={`text-xs truncate max-w-[140px] hidden sm:block ${muted}`}>{c.host}{c.port ? `:${c.port}` : ""}</span>
        {!selectMode && (
          <div className="flex items-center gap-0.5 shrink-0 ml-1" onClick={e => e.stopPropagation()}>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEditConn(c)}><Pencil className="h-3 w-3" /></Button>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => cloneConn(c)}><Copy className="h-3 w-3" /></Button>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setDeleteTarget({ kind: "conn", id: c.id, name: c.name })}><Trash2 className="h-3 w-3 text-destructive" /></Button>
          </div>
        )}
      </div>
    );
  }

  function renderFolder(f: FolderRow, depth = 0): React.ReactNode {
    const isOpen = expanded.has(f.id);
    const subs = folders.filter(sf => sf.parentId === f.id);
    const folderConns = connections.filter(c => c.folderId === f.id);
    const cred = credentials.find(c => c.id === f.credentialId);
    const dim = dragging?.kind === "folder" && dragging.id === f.id;
    const isDropTarget = dropTarget === f.id;
    const canReceiveDrop = dragging !== null && !(
      dragging.kind === "folder" && (dragging.id === f.id || isAncestor(folders, dragging.id, f.id))
    );
    const checked = selectedFolders.has(f.id);

    return (
      <div key={f.id}>
        <div
          draggable={editMode}
          onDragStart={editMode ? (e => { e.dataTransfer.effectAllowed = "move"; setDragging({ kind: "folder", id: f.id }); }) : undefined}
          onDragEnd={editMode ? (() => { setDragging(null); setDropTarget(null); }) : undefined}
          onDragOver={editMode && canReceiveDrop ? (e => { e.preventDefault(); setDropTarget(f.id); }) : undefined}
          onDragLeave={editMode ? (e => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDropTarget(prev => prev === f.id ? null : prev); }) : undefined}
          onDrop={editMode ? (e => { e.preventDefault(); commitDrop(f.id); }) : undefined}
          onClick={selectMode ? () => toggleFolderSel(f.id) : undefined}
          style={{ paddingLeft: depth * 16 + 8 }}
          className={`flex items-center gap-1 py-1 pr-2 rounded group transition-colors
            ${dim ? "opacity-40" : ""}
            ${selectMode ? "cursor-pointer" : ""}
            ${isDropTarget ? "bg-primary/10 ring-1 ring-inset ring-primary/40" : checked ? "bg-primary/8" : "hover:bg-secondary/50"}`}
        >
          {selectMode ? (
            <span className={`shrink-0 flex items-center justify-center h-4 w-4 rounded border transition-colors ml-0.5 ${checked ? "bg-primary border-primary text-primary-foreground" : "border-input"}`}>
              {checked && <Check className="h-2.5 w-2.5" />}
            </span>
          ) : editMode && DRAG_HANDLE}
          {!selectMode && (
            <button
              type="button"
              className="p-0.5 shrink-0"
              style={{ visibility: subs.length > 0 || folderConns.length > 0 ? "visible" : "hidden" }}
              onClick={e => { e.stopPropagation(); toggle(f.id); }}
            >
              <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
            </button>
          )}
          <button
            type="button"
            className="flex items-center gap-1.5 min-w-0 flex-1 text-left"
            onClick={e => { if (selectMode) { e.stopPropagation(); toggleFolderSel(f.id); } else toggle(f.id); }}
          >
            {isOpen
              ? <FolderOpen className="h-3.5 w-3.5 text-primary shrink-0" />
              : <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            }
            <span className="text-sm font-medium truncate">{f.name}</span>
            {cred && <span className={`text-xs truncate ${muted}`}>({cred.name})</span>}
            {(subs.length + folderConns.length) > 0 && (
              <span className={`text-[10px] shrink-0 ${muted}`}>{subs.length + folderConns.length}</span>
            )}
          </button>
          {!selectMode && (
            <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
              <Button size="icon" variant="ghost" className="h-6 w-6" title="Add connection here" onClick={() => { openNewConn(f.id); if (!isOpen) toggle(f.id); }}><Plus className="h-3 w-3" /></Button>
              <Button size="icon" variant="ghost" className="h-6 w-6" title="Add subfolder" onClick={() => openNewFolder(f.id)}><FolderPlus className="h-3 w-3" /></Button>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEditFolder(f)}><Pencil className="h-3 w-3" /></Button>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => cloneFolder(f)}><Copy className="h-3 w-3" /></Button>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setDeleteTarget({ kind: "folder", id: f.id, name: f.name })}><Trash2 className="h-3 w-3 text-destructive" /></Button>
            </div>
          )}
        </div>
        {isOpen && (
          <div>
            {subs.map(s => renderFolder(s, depth + 1))}
            {folderConns.map(c => renderConn(c, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  const rootFolders = folders.filter(f => !f.parentId);
  const unassigned = connections.filter(c => !c.folderId);
  const shadowEnabled = shadow.sessionId > 0;
  const empty = folders.length === 0 && connections.length === 0;

  return (
    <div className={pageWrapper}>
      <div className={pageInner}>
        <div className="flex items-center justify-between mb-4">
          <h1 className={pageTitle}>Connections</h1>
          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleImport} />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={importing}>
              {importing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}Import
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1" />Export
            </Button>
            {selectMode ? (
              <Button variant="outline" size="sm" onClick={exitSelectMode}>Cancel</Button>
            ) : (
              <Button variant="outline" size="sm" onClick={enterSelectMode}>
                <CheckSquare className="h-4 w-4 mr-1" />Select
              </Button>
            )}
            {!selectMode && (editMode ? (
              <Button variant="outline" size="sm" onClick={() => { setEditMode(false); setDragging(null); setDropTarget(null); }}>
                Done
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
                <Pencil className="h-4 w-4 mr-1" />Edit Layout
              </Button>
            ))}
            <Button variant="outline" size="sm" onClick={() => openNewFolder()}>
              <FolderPlus className="h-4 w-4 mr-1" />Add Folder
            </Button>
            <Button size="sm" onClick={() => openNewConn()}>
              <Plus className="h-4 w-4 mr-1" />Add Connection
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : empty ? (
          <p className={`text-center py-12 text-sm ${muted}`}>No connections yet.</p>
        ) : (
          <div className="rounded-lg border">
            {selectMode && (
              <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30">
                <span className={`text-sm flex-1 ${muted}`}>
                  {selectedFolders.size + selectedConns.size} selected
                </span>
                {(selectedFolders.size + selectedConns.size) > 0 && (
                  <Button size="sm" variant="destructive" onClick={() => setBulkConfirm(true)}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" />Delete
                  </Button>
                )}
              </div>
            )}
            <div className="py-1">
              {rootFolders.map(f => renderFolder(f))}
              {unassigned.map(c => renderConn(c, 0))}
            </div>
            {editMode && dragging && (
              <div
                onDragOver={e => { e.preventDefault(); setDropTarget("root"); }}
                onDragLeave={e => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDropTarget(prev => prev === "root" ? null : prev); }}
                onDrop={e => { e.preventDefault(); commitDrop("root"); }}
                className={`border-t py-2 px-4 text-xs text-center select-none transition-colors ${dropTarget === "root" ? "bg-primary/10 text-primary" : `${muted}`}`}
              >
                Drop here to remove from folder
              </div>
            )}
          </div>
        )}

        {/* ── Folder dialog ─────────────────────────────────────────────── */}
        <Dialog open={folderDialog} onOpenChange={setFolderDialog}>
          <DialogContent>
            <DialogHeader><DialogTitle>{folderForm.id ? "Edit Folder" : "Add Folder"}</DialogTitle></DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Name</Label>
                <Input value={folderForm.name} onChange={e => setFolderForm(f => ({ ...f, name: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") saveFolder(); }} autoFocus />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Parent Folder <span className={muted}>(optional)</span></Label>
                <Select value={folderForm.parentId || "none"} onValueChange={v => setFolderForm(f => ({ ...f, parentId: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="None (root)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (root)</SelectItem>
                    {flattenFolders(folders, folderForm.id || undefined).map(({ id, name, depth }) => (
                      <SelectItem key={id} value={String(id)}>
                        {"  ".repeat(depth)}{depth > 0 ? "└ " : ""}{name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Credential <span className={muted}>(inherited by connections)</span></Label>
                <Select value={folderForm.credentialId || "none"} onValueChange={v => setFolderForm(f => ({ ...f, credentialId: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {credentials.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}{c.username ? ` (${c.username})` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFolderDialog(false)}>Cancel</Button>
              <Button onClick={saveFolder} disabled={folderSaving}>{folderSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Connection dialog ─────────────────────────────────────────── */}
        <Dialog open={connDialog} onOpenChange={setConnDialog}>
          <DialogContent>
            <DialogHeader><DialogTitle>{connForm.id ? "Edit Connection" : "Add Connection"}</DialogTitle></DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Name</Label>
                <Input placeholder="e.g. Web Server 01" value={connForm.name} onChange={e => setConnForm(f => ({ ...f, name: e.target.value }))} autoFocus />
              </div>
              {connForm.protocol === "web" ? (
                <div className="flex flex-col gap-1.5">
                  <Label>URL</Label>
                  <Input placeholder="https://example.com" value={connForm.host} onChange={e => setConnForm(f => ({ ...f, host: e.target.value }))} />
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 flex flex-col gap-1.5">
                    <Label>Host / IP</Label>
                    <Input placeholder="192.168.1.10" value={connForm.host} onChange={e => setConnForm(f => ({ ...f, host: e.target.value }))} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Port <span className={muted}>(optional)</span></Label>
                    <Input type="number" value={connForm.port} onChange={e => setConnForm(f => ({ ...f, port: e.target.value }))} />
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Label>Protocol</Label>
                <Select value={connForm.protocol} onValueChange={v => setConnForm(f => ({ ...f, protocol: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rdp">RDP</SelectItem>
                    <SelectItem value="vnc">VNC</SelectItem>
                    <SelectItem value="ssh">SSH</SelectItem>
                    <SelectItem value="web">Web</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Folder <span className={muted}>(optional)</span></Label>
                <Select value={connForm.folderId || "none"} onValueChange={v => setConnForm(f => ({ ...f, folderId: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="No folder" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No folder</SelectItem>
                    {flattenFolders(folders).map(({ id, name, depth }) => (
                      <SelectItem key={id} value={String(id)}>
                        {"  ".repeat(depth)}{depth > 0 ? "└ " : ""}{name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {connForm.protocol !== "web" && (
                <div className="flex flex-col gap-1.5">
                  <Label>Credential <span className={muted}>(overrides folder)</span></Label>
                  <Select value={connForm.credentialId || "none"} onValueChange={v => setConnForm(f => ({ ...f, credentialId: v === "none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Inherit from folder" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Inherit from folder</SelectItem>
                      {credentials.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}{c.username ? ` (${c.username})` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {connForm.protocol === "rdp" && (
                <div className="rounded-lg border p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Shadow Session</p>
                    <Switch checked={shadowEnabled} onCheckedChange={v => setShadow(s => ({ ...s, sessionId: v ? 1 : 0 }))} />
                  </div>
                  {shadowEnabled && (
                    <div className="space-y-3">
                      <div className="flex flex-col gap-1.5">
                        <Label>Session ID</Label>
                        <Input type="number" min={1} max={9999} className="w-28" value={shadow.sessionId} onChange={e => setShadow(s => ({ ...s, sessionId: Math.max(1, parseInt(e.target.value) || 1) }))} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div><Label>Control</Label><p className={`text-xs ${muted}`}>Take control of the session (not view-only)</p></div>
                        <Switch checked={shadow.control} onCheckedChange={v => setShadow(s => ({ ...s, control: v }))} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div><Label>No Consent Prompt</Label><p className={`text-xs ${muted}`}>Shadow without asking the remote user</p></div>
                        <Switch checked={shadow.noConsent} onCheckedChange={v => setShadow(s => ({ ...s, noConsent: v }))} />
                      </div>
                    </div>
                  )}
                </div>
              )}
              {connForm.protocol === "vnc" && (
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
              <Button variant="outline" onClick={() => setConnDialog(false)}>Cancel</Button>
              <Button onClick={saveConn} disabled={connSaving}>{connSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Bulk delete dialog ───────────────────────────────────────── */}
        <Dialog open={bulkConfirm} onOpenChange={setBulkConfirm}>
          <DialogContent>
            <DialogHeader><DialogTitle>Delete Selected Items</DialogTitle></DialogHeader>
            <p className="text-sm">
              Delete {selectedFolders.size + selectedConns.size} item{selectedFolders.size + selectedConns.size === 1 ? "" : "s"}?
              {selectedFolders.size > 0 && " Folders and all their contents will be permanently removed."}
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBulkConfirm(false)}>Cancel</Button>
              <Button variant="destructive" onClick={executeBulkDelete} disabled={bulkDeleting}>
                {bulkDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Delete dialog ─────────────────────────────────────────────── */}
        <Dialog open={deleteTarget !== null} onOpenChange={() => setDeleteTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete {deleteTarget?.kind === "folder" ? "Folder" : "Connection"}</DialogTitle>
            </DialogHeader>
            {deleteTarget?.kind === "folder" ? (
              <p className="text-sm">Delete <strong>{deleteTarget.name}</strong>? All subfolders will be deleted. Connections inside will be moved to the root level.</p>
            ) : (
              <p className="text-sm">Delete <strong>{deleteTarget?.name}</strong>? This cannot be undone.</p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => {
                if (!deleteTarget) return;
                deleteTarget.kind === "folder" ? deleteFolder(deleteTarget.id) : deleteConn(deleteTarget.id);
              }}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
