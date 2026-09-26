"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Monitor, Folder, FolderOpen, Search, Copy, Check, Download } from "lucide-react";
import { pageWrapper, pageInner, pageTitle, muted } from "@/lib/ui-conventions";

interface Connection { id: number; name: string; host: string; port: number | null; protocol: string; folderId: number | null; credentialId: number | null }
interface FolderRow { id: number; name: string; parentId: number | null; credentialId: number | null }
interface ConnectDetails { id: number; name: string; host: string; port: number; protocol: string; credential: { username: string; password: string; domain: string | null } | null }

const PROTO_BADGE: Record<string, string> = {
  rdp: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  vnc: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
};

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button onClick={copy} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors shrink-0">
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function DetailRow({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b last:border-0">
      <span className="text-xs text-muted-foreground w-20 shrink-0">{label}</span>
      <span className={`text-sm font-mono flex-1 min-w-0 truncate ${secret && !show ? "blur-sm select-none" : ""}`}>{value}</span>
      <div className="flex items-center gap-1 shrink-0">
        {secret && (
          <button onClick={() => setShow(v => !v)} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground text-xs">
            {show ? "hide" : "show"}
          </button>
        )}
        <CopyButton value={value} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [connectDetails, setConnectDetails] = useState<ConnectDetails | null>(null);
  const [connecting, setConnecting] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/connections");
      const d = await r.json();
      setConnections(d.connections ?? []);
      setFolders(d.folders ?? []);
      setExpanded(new Set((d.folders ?? []).map((f: FolderRow) => f.id)));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleConnect(id: number) {
    setConnecting(id);
    try {
      const r = await fetch(`/api/connections/${id}/connect`);
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Failed to get connection details"); return; }
      setConnectDetails(d);
    } finally { setConnecting(null); }
  }

  function downloadRdp(details: ConnectDetails) {
    const lines = [
      "screen mode id:i:2",
      "use multimon:i:0",
      "desktopwidth:i:1920",
      "desktopheight:i:1080",
      "session bpp:i:32",
      "compression:i:1",
      "keyboardhook:i:2",
      "audiocapturemode:i:0",
      "videoplaybackmode:i:1",
      "connection type:i:7",
      "networkautodetect:i:1",
      "bandwidthautodetect:i:1",
      "displayconnectionbar:i:1",
      `full address:s:${details.host}:${details.port}`,
      `username:s:${details.credential?.domain ? `${details.credential.domain}\\` : ""}${details.credential?.username ?? ""}`,
      "authentication level:i:2",
      "prompt for credentials:i:0",
      "negotiate security layer:i:1",
      "enablecredsspsupport:i:1",
    ];
    const blob = new Blob([lines.join("\r\n")], { type: "application/rdp" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${details.name.replace(/[^a-z0-9]/gi, "_")}.rdp`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = search.trim()
    ? connections.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.host.toLowerCase().includes(search.toLowerCase()))
    : null;

  const toggleFolder = (id: number) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  function renderConnection(c: Connection) {
    return (
      <div key={c.id} className="flex items-center justify-between rounded-lg border p-3 bg-background hover:bg-secondary/30 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <Monitor className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{c.name}</span>
              <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${PROTO_BADGE[c.protocol] ?? ""}`}>{c.protocol.toUpperCase()}</span>
            </div>
            <p className={muted}>{c.host}{c.port ? `:${c.port}` : ""}</p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleConnect(c.id)}
          disabled={connecting === c.id}
          className="shrink-0 ml-2"
        >
          {connecting === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Connect"}
        </Button>
      </div>
    );
  }

  function renderFolder(f: FolderRow, depth = 0) {
    const isOpen = expanded.has(f.id);
    const folderConns = connections.filter(c => c.folderId === f.id);
    const subFolders = folders.filter(sf => sf.parentId === f.id);
    const isEmpty = folderConns.length === 0 && subFolders.length === 0;
    return (
      <div key={f.id} style={{ marginLeft: depth * 16 }}>
        <button
          onClick={() => toggleFolder(f.id)}
          className="w-full flex items-center gap-2 py-2 px-3 rounded-md hover:bg-secondary/50 transition-colors text-left"
        >
          {isOpen ? <FolderOpen className="h-4 w-4 text-primary shrink-0" /> : <Folder className="h-4 w-4 text-muted-foreground shrink-0" />}
          <span className="text-sm font-medium">{f.name}</span>
          {!isEmpty && <span className={`text-xs ml-1 ${muted}`}>{folderConns.length + subFolders.length}</span>}
        </button>
        {isOpen && (
          <div className="mt-1 space-y-1.5 pl-3">
            {subFolders.map(sf => renderFolder(sf, depth + 1))}
            {folderConns.map(c => renderConnection(c))}
            {isEmpty && <p className={`text-xs pl-3 pb-2 ${muted}`}>Empty folder</p>}
          </div>
        )}
      </div>
    );
  }

  const rootFolders = folders.filter(f => !f.parentId);
  const ungrouped = connections.filter(c => !c.folderId);

  return (
    <div className={pageWrapper}>
      <div className={pageInner}>
        <div className="flex items-center justify-between mb-6">
          <h1 className={pageTitle}>Connections</h1>
          <span className={muted}>{connections.length} connection{connections.length !== 1 ? "s" : ""}</span>
        </div>

        {connections.length > 0 && (
          <div className="relative mb-4">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-9"
              placeholder="Search by name or host…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : connections.length === 0 ? (
          <p className={`text-center py-12 ${muted}`}>No connections available.</p>
        ) : filtered !== null ? (
          <div className="space-y-1.5">
            {filtered.length === 0 ? (
              <p className={`text-center py-8 ${muted}`}>No results.</p>
            ) : filtered.map(c => renderConnection(c))}
          </div>
        ) : (
          <div className="space-y-1">
            {rootFolders.map(f => renderFolder(f))}
            {ungrouped.length > 0 && (
              <div className={rootFolders.length > 0 ? "mt-3" : ""}>
                {rootFolders.length > 0 && <p className={`text-xs px-3 pb-2 ${muted}`}>Ungrouped</p>}
                <div className="space-y-1.5">{ungrouped.map(c => renderConnection(c))}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Connect details modal */}
      <Dialog open={!!connectDetails} onOpenChange={() => setConnectDetails(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Monitor className="h-4 w-4" />
              {connectDetails?.name}
              {connectDetails && (
                <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${PROTO_BADGE[connectDetails.protocol] ?? ""}`}>
                  {connectDetails.protocol.toUpperCase()}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {connectDetails && (
            <div className="space-y-4">
              <div className="rounded-lg border p-3 space-y-0">
                <DetailRow label="Host" value={connectDetails.host} />
                <DetailRow label="Port" value={String(connectDetails.port)} />
                {connectDetails.credential && (
                  <>
                    {connectDetails.credential.domain && <DetailRow label="Domain" value={connectDetails.credential.domain} />}
                    <DetailRow label="Username" value={connectDetails.credential.username} />
                    <DetailRow label="Password" value={connectDetails.credential.password} secret />
                  </>
                )}
              </div>

              {connectDetails.protocol === "rdp" && (
                <Button className="w-full" onClick={() => downloadRdp(connectDetails)}>
                  <Download className="h-4 w-4 mr-2" />
                  Download .rdp file
                </Button>
              )}

              {!connectDetails.credential && (
                <p className={`text-xs text-center ${muted}`}>No credentials configured for this connection.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
