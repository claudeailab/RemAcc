"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2, Monitor, Folder, FolderOpen, Search,
  Copy, Check, Download, X, Menu, Terminal,
} from "lucide-react";
import { muted } from "@/lib/ui-conventions";

interface Connection { id: number; name: string; host: string; port: number | null; protocol: string; folderId: number | null; credentialId: number | null }
interface FolderRow { id: number; name: string; parentId: number | null; credentialId: number | null }
interface ConnectDetails { id: number; name: string; host: string; port: number; protocol: string; credential: { username: string; password: string; domain: string | null } | null }

interface Session {
  key: string;
  id: number;
  name: string;
  protocol: string;
  host: string;
  port: number;
  credential: ConnectDetails["credential"];
}

const PROTO_BADGE: Record<string, string> = {
  rdp: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  vnc: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  ssh: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
};

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value);
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

function CredPanel({ session, active }: { session: Session; active: boolean }) {
  function downloadRdp() {
    const lines = [
      "screen mode id:i:2", "use multimon:i:0", "desktopwidth:i:1920",
      "desktopheight:i:1080", "session bpp:i:32", "compression:i:1",
      "keyboardhook:i:2", "audiocapturemode:i:0", "videoplaybackmode:i:1",
      "connection type:i:7", "networkautodetect:i:1", "bandwidthautodetect:i:1",
      "displayconnectionbar:i:1",
      `full address:s:${session.host}:${session.port}`,
      `username:s:${session.credential?.domain ? `${session.credential.domain}\\` : ""}${session.credential?.username ?? ""}`,
      "authentication level:i:2", "prompt for credentials:i:0",
      "negotiate security layer:i:1", "enablecredsspsupport:i:1",
    ];
    const blob = new Blob([lines.join("\r\n")], { type: "application/rdp" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${session.name.replace(/[^a-z0-9]/gi, "_")}.rdp`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      className="absolute inset-0 flex items-start justify-center p-8 overflow-y-auto"
      style={{ opacity: active ? 1 : 0, pointerEvents: active ? "auto" : "none" }}
    >
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center gap-2">
          <Monitor className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-semibold text-lg">{session.name}</h2>
          <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${PROTO_BADGE[session.protocol] ?? ""}`}>
            {session.protocol.toUpperCase()}
          </span>
        </div>
        <div className="rounded-lg border p-3 space-y-0">
          <DetailRow label="Host" value={session.host} />
          <DetailRow label="Port" value={String(session.port)} />
          {session.credential && (
            <>
              {session.credential.domain && <DetailRow label="Domain" value={session.credential.domain} />}
              <DetailRow label="Username" value={session.credential.username} />
              <DetailRow label="Password" value={session.credential.password} secret />
            </>
          )}
          {!session.credential && (
            <p className={`text-xs py-2 ${muted}`}>No credentials configured.</p>
          )}
        </div>
        {session.protocol === "rdp" && (
          <Button className="w-full" onClick={downloadRdp}>
            <Download className="h-4 w-4 mr-2" />
            Download .rdp file
          </Button>
        )}
        {session.protocol === "vnc" && session.credential && (
          <div className="rounded-lg border p-3">
            <p className={`text-xs mb-1.5 ${muted}`}>VNC URL</p>
            <div className="flex items-center gap-2">
              <code className="text-xs font-mono flex-1 truncate">{`vnc://${session.host}:${session.port}`}</code>
              <CopyButton value={`vnc://${session.host}:${session.port}`} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SshPanel({ session, active }: { session: Session; active: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<{ fit: () => void } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let term: { write: (d: unknown) => void; onData: (cb: (d: string) => void) => void; onResize: (cb: (s: { cols: number; rows: number }) => void) => void; dispose: () => void; loadAddon: (a: unknown) => void; open: (el: HTMLElement) => void } | null = null;
    let ws: WebSocket | null = null;
    const obs = new ResizeObserver(() => fitRef.current?.fit());

    async function start() {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);
      if (cancelled || !containerRef.current) return;

      term = new Terminal({
        cursorBlink: true,
        fontFamily: '"Cascadia Code", "Fira Code", monospace',
        fontSize: 13,
        lineHeight: 1.2,
        scrollback: 2000,
        theme: { background: "#111111", foreground: "#e0e0e0", cursor: "#e0e0e0" },
      });
      const fit = new FitAddon();
      fitRef.current = fit as unknown as { fit: () => void };
      term.loadAddon(fit);
      term.open(containerRef.current);
      fit.fit();
      obs.observe(containerRef.current);

      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${proto}//${location.host}/ws/ssh/${session.id}`);
      ws.binaryType = "arraybuffer";

      ws.onopen = () => { fit.fit(); };
      ws.onmessage = e => {
        if (!term) return;
        const data = e.data instanceof ArrayBuffer ? new Uint8Array(e.data) : e.data;
        term.write(data as string);
      };
      ws.onclose = () => term?.write("\r\n\x1b[33m[Session closed]\x1b[0m\r\n");
      ws.onerror = () => term?.write("\r\n\x1b[31m[Connection error]\x1b[0m\r\n");

      term.onData((d: string) => {
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "data", data: d }));
      });
      term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "resize", cols, rows }));
      });
    }

    start().catch(e => console.error("SSH panel init error", e));

    return () => {
      cancelled = true;
      obs.disconnect();
      ws?.close();
      term?.dispose();
      fitRef.current = null;
    };
  }, [session.id]);

  useEffect(() => {
    if (active) setTimeout(() => fitRef.current?.fit(), 50);
  }, [active]);

  return (
    <div
      className="absolute inset-0"
      style={{
        opacity: active ? 1 : 0,
        pointerEvents: active ? "auto" : "none",
        background: "#111111",
        padding: "8px",
      }}
    >
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

let sessionCounter = 0;

export default function DashboardPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  async function handleConnect(conn: Connection) {
    setConnecting(conn.id);
    setSidebarOpen(false);
    try {
      const r = await fetch(`/api/connections/${conn.id}/connect`);
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Failed to get connection details"); return; }
      const key = `s${++sessionCounter}`;
      const session: Session = {
        key,
        id: conn.id,
        name: conn.name,
        protocol: conn.protocol,
        host: d.host,
        port: d.port,
        credential: d.credential,
      };
      setSessions(prev => [...prev, session]);
      setActiveKey(key);
    } finally { setConnecting(null); }
  }

  function closeSession(key: string) {
    setSessions(prev => {
      const next = prev.filter(s => s.key !== key);
      if (activeKey === key) setActiveKey(next.length > 0 ? next[next.length - 1].key : null);
      return next;
    });
  }

  const toggleFolder = (id: number) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const filtered = search.trim()
    ? connections.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.host.toLowerCase().includes(search.toLowerCase()))
    : null;

  function renderConn(c: Connection) {
    return (
      <button
        key={c.id}
        onClick={() => handleConnect(c)}
        disabled={connecting === c.id}
        className="w-full flex items-center gap-2 py-1.5 px-2 rounded hover:bg-secondary/60 transition-colors text-left disabled:opacity-60"
      >
        {connecting === c.id
          ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
          : <Monitor className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        }
        <span className="text-sm truncate flex-1">{c.name}</span>
        <span className={`text-[9px] font-semibold uppercase px-1 py-0.5 rounded shrink-0 ${PROTO_BADGE[c.protocol] ?? ""}`}>{c.protocol}</span>
      </button>
    );
  }

  function renderFolder(f: FolderRow, depth = 0): React.ReactNode {
    const isOpen = expanded.has(f.id);
    const folderConns = connections.filter(c => c.folderId === f.id);
    const subFolders = folders.filter(sf => sf.parentId === f.id);
    return (
      <div key={f.id} style={{ paddingLeft: depth * 12 }}>
        <button
          onClick={() => toggleFolder(f.id)}
          className="w-full flex items-center gap-2 py-1.5 px-2 rounded hover:bg-secondary/50 transition-colors text-left"
        >
          {isOpen
            ? <FolderOpen className="h-3.5 w-3.5 text-primary shrink-0" />
            : <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          }
          <span className="text-sm font-medium truncate">{f.name}</span>
        </button>
        {isOpen && (
          <div className="mt-0.5">
            {subFolders.map(sf => renderFolder(sf, depth + 1))}
            {folderConns.map(c => <div key={c.id} style={{ paddingLeft: (depth + 1) * 12 }}>{renderConn(c)}</div>)}
          </div>
        )}
      </div>
    );
  }

  const rootFolders = folders.filter(f => !f.parentId);
  const ungrouped = connections.filter(c => !c.folderId);

  const sidebarContent = (
    <>
      <div className="p-2 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-8 h-8 text-sm"
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-1.5">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : connections.length === 0 ? (
          <p className={`text-xs text-center py-8 ${muted}`}>No connections available.</p>
        ) : filtered !== null ? (
          <div className="space-y-0.5">
            {filtered.length === 0
              ? <p className={`text-xs text-center py-4 ${muted}`}>No results.</p>
              : filtered.map(c => renderConn(c))
            }
          </div>
        ) : (
          <div className="space-y-0.5">
            {rootFolders.map(f => renderFolder(f))}
            {ungrouped.map(c => renderConn(c))}
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col overflow-hidden bg-background">
      {/* Tab bar */}
      <div className="flex-none h-10 border-b flex items-center gap-1 px-2 overflow-x-auto shrink-0">
        <button
          className="md:hidden p-1.5 rounded hover:bg-secondary mr-1 shrink-0"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open sidebar"
        >
          <Menu className="h-4 w-4" />
        </button>
        {sessions.length === 0 ? (
          <span className={`text-xs ${muted} px-1`}>No active sessions — select a connection from the sidebar</span>
        ) : (
          sessions.map(s => (
            <button
              key={s.key}
              onClick={() => setActiveKey(s.key)}
              className={`flex items-center gap-1.5 px-3 h-7 rounded text-xs whitespace-nowrap transition-colors shrink-0 ${
                activeKey === s.key
                  ? "bg-secondary font-medium"
                  : "hover:bg-secondary/60 text-muted-foreground"
              }`}
            >
              {s.protocol === "ssh" ? <Terminal className="h-3 w-3 shrink-0" /> : <Monitor className="h-3 w-3 shrink-0" />}
              <span>{s.name}</span>
              <span className={`text-[9px] font-semibold uppercase px-1 py-0.5 rounded ${PROTO_BADGE[s.protocol] ?? ""}`}>{s.protocol}</span>
              <span
                role="button"
                onClick={e => { e.stopPropagation(); closeSession(s.key); }}
                className="ml-1 hover:bg-destructive/20 hover:text-destructive rounded p-0.5 transition-colors"
                aria-label="Close session"
              >
                <X className="h-3 w-3" />
              </span>
            </button>
          ))
        )}
      </div>

      {/* Body: sidebar + content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Mobile overlay backdrop */}
        {sidebarOpen && (
          <div
            className="md:hidden absolute inset-0 z-10 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <div className={`
          flex-col border-r bg-background overflow-hidden
          absolute md:relative z-20 md:z-auto
          w-64 h-full
          transition-transform duration-200 ease-in-out
          ${sidebarOpen ? "translate-x-0 flex" : "-translate-x-full md:translate-x-0 hidden md:flex"}
        `}>
          <div className="flex items-center justify-between px-3 py-2 border-b md:hidden">
            <span className="text-sm font-medium">Connections</span>
            <button onClick={() => setSidebarOpen(false)} className="p-1 rounded hover:bg-secondary">
              <X className="h-4 w-4" />
            </button>
          </div>
          {sidebarContent}
        </div>

        {/* Content area */}
        <div className="flex-1 relative overflow-hidden">
          {sessions.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Monitor className="h-10 w-10 text-muted-foreground/30" />
              <p className={`text-sm ${muted}`}>Select a connection to start a session</p>
              <button
                className="md:hidden text-xs text-primary underline"
                onClick={() => setSidebarOpen(true)}
              >
                Open connections
              </button>
            </div>
          ) : (
            sessions.map(s =>
              s.protocol === "ssh" ? (
                <SshPanel key={s.key} session={s} active={s.key === activeKey} />
              ) : (
                <CredPanel key={s.key} session={s} active={s.key === activeKey} />
              )
            )
          )}
        </div>
      </div>
    </div>
  );
}
