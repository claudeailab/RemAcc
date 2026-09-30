"use client";

import "@xterm/xterm/css/xterm.css";
import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2, Monitor, Folder, FolderOpen, Search, X, Menu, Terminal, Globe, ExternalLink,
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
  url?: string;
}

const PROTO_BADGE: Record<string, string> = {
  rdp: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  vnc: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  ssh: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  web: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
};

// ---------------------------------------------------------------------------
// SSH Panel — xterm.js over WebSocket
// ---------------------------------------------------------------------------
function SshPanel({ session, active }: { session: Session; active: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<{ fit: () => void } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let keepalive: ReturnType<typeof setInterval> | null = null;
    const obs = new ResizeObserver(() => fitRef.current?.fit());

    async function start() {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);
      if (cancelled || !containerRef.current) return;

      const term = new Terminal({
        cursorBlink: true,
        fontFamily: '"Cascadia Code", "Fira Code", monospace',
        fontSize: 13,
        lineHeight: 1.2,
        scrollback: 5000,
        allowTransparency: false,
        // Let xterm handle ctrl sequences; we only intercept what the browser steals
        macOptionIsMeta: false,
        theme: { background: "#111111", foreground: "#e0e0e0", cursor: "#e0e0e0" },
      });
      termRef.current = term;

      const fit = new FitAddon();
      fitRef.current = fit as unknown as { fit: () => void };
      term.loadAddon(fit);
      term.open(containerRef.current);
      fit.fit();
      obs.observe(containerRef.current);

      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${location.host}/ws/ssh/${session.id}`);
      wsRef.current = ws;
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        fit.fit();
        term.focus();
      };
      ws.onmessage = e => {
        const data = e.data instanceof ArrayBuffer ? new Uint8Array(e.data) : e.data;
        term.write(data as string);
      };
      ws.onclose = () => term.write("\r\n\x1b[33m[Session closed]\x1b[0m\r\n");
      ws.onerror  = () => term.write("\r\n\x1b[31m[Connection error]\x1b[0m\r\n");

      const send = (obj: object) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
      };

      term.onData((d: string) => send({ type: "data", data: d }));
      term.onResize(({ cols, rows }: { cols: number; rows: number }) => send({ type: "resize", cols, rows }));

      // Ctrl+V — paste from clipboard (browser intercepts it before xterm)
      term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
        if (e.type !== "keydown") return true;
        if (e.ctrlKey && !e.altKey && !e.metaKey && e.key === "v") {
          e.preventDefault();
          navigator.clipboard.readText().then(t => send({ type: "data", data: t })).catch(() => {});
          return false;
        }
        return true;
      });

      // Right-click paste, like PuTTY
      term.element?.addEventListener("contextmenu", (e: Event) => {
        e.preventDefault();
        navigator.clipboard.readText().then(t => send({ type: "data", data: t })).catch(() => {});
      });

      // Keepalive so idle SSH sessions aren't dropped by the server's TCP timeout
      keepalive = setInterval(() => send({ type: "ping" }), 25000);
    }

    start().catch(e => console.error("SSH panel error", e));

    return () => {
      cancelled = true;
      obs.disconnect();
      if (keepalive) clearInterval(keepalive);
      const ws = wsRef.current;
      ws?.close();
      termRef.current?.dispose();
      termRef.current = null;
      wsRef.current = null;
      fitRef.current = null;
    };
  }, [session.id]);

  // Refocus and refit when this panel becomes the active tab
  useEffect(() => {
    if (active) {
      setTimeout(() => {
        fitRef.current?.fit();
        termRef.current?.focus();
      }, 50);
    }
  }, [active]);

  return (
    <div
      className="absolute inset-0"
      style={{
        opacity: active ? 1 : 0,
        pointerEvents: active ? "auto" : "none",
        background: "#111111",
      }}
    >
      {/* padding:8px gives a small gutter; box-sizing keeps the terminal from overflowing */}
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", padding: "8px", boxSizing: "border-box" }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Web Panel — iframe embedding
// ---------------------------------------------------------------------------
function proxiedUrl(session: Session) {
  let rest = "/";
  try {
    const u = new URL(/^https?:\/\//i.test(session.url ?? "") ? session.url! : `http://${session.url}`);
    rest = u.pathname + u.search + u.hash;
  } catch {}
  return `/webproxy/${session.id}${rest}`;
}

function WebPanel({ session, active }: { session: Session; active: boolean }) {
  const src = proxiedUrl(session);
  return (
    <div
      className="absolute inset-0 flex flex-col"
      style={{ opacity: active ? 1 : 0, pointerEvents: active ? "auto" : "none" }}
    >
      <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-background/80 backdrop-blur shrink-0">
        <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className={`text-xs truncate flex-1 ${muted}`}>{session.url}</span>
        <a
          href={src}
          target="_blank"
          rel="noopener"
          className="shrink-0"
          title="Open in browser tab"
        >
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors" />
        </a>
      </div>
      <iframe
        src={src}
        className="flex-1 w-full border-0 bg-white"
        allow="fullscreen"
        // No allow-top-navigation*: proxied pages are same-origin and would otherwise frame-bust out of RemAcc
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-pointer-lock"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Guacamole Panel — RDP + VNC in-browser via guacd
// ---------------------------------------------------------------------------
// Fewest equal side-by-side monitors whose aspect ratio is a real monitor's (5:4 … 16:9);
// a single ultrawide (21:9) matches none and stays one screen
function monitorCount(w: number, h: number) {
  for (let n = 1; n <= 4; n++) {
    const r = w / n / h;
    if (r >= 1.2 && r <= 1.85) return n;
  }
  return 1;
}

const CTRL_ALT_DEL = [0xffe3, 0xffe9, 0xffff]; // Control_L, Alt_L, Delete

function GuacPanel({ session, active }: { session: Session; active: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  const [status, setStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const [errorMsg, setErrorMsg] = useState("");
  useEffect(() => { activeRef.current = active; }, [active]);

  const scaleRef = useRef(1);
  // Multi-monitor remotes: show one monitor at a time (index) or all (-1); remembered per connection
  const screenKey = `remacc_screen_${session.id}`;
  const [screens, setScreens] = useState(1);
  const [screen, setScreen] = useState(() => {
    try { return Number(localStorage.getItem(screenKey) ?? 0); } catch { return 0; }
  });
  const screensRef = useRef(1);
  const screenRef = useRef(screen);
  const rescaleRef = useRef<() => void>(() => {});
  const clientRef = useRef<any>(null);

  function sendCtrlAltDel() {
    const c = clientRef.current;
    if (!c) return;
    CTRL_ALT_DEL.forEach(k => c.sendKeyEvent(1, k));
    [...CTRL_ALT_DEL].reverse().forEach(k => c.sendKeyEvent(0, k));
  }

  function chooseScreen(i: number) {
    setScreen(i);
    screenRef.current = i;
    try { localStorage.setItem(screenKey, String(i)); } catch {}
    rescaleRef.current();
  }

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let client: any = null;
    let keyboard: any = null;
    let tunnelRef: any = null;
    let obs: ResizeObserver | null = null;
    let keepalive: ReturnType<typeof setInterval> | null = null;
    let cleanupMouse: (() => void) | null = null;

    async function start() {
      const mod = await import("guacamole-common-js");
      const Guac = (mod as any).default ?? mod;
      if (cancelled || !containerRef.current) return;

      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const wsPath = session.protocol === "rdp"
        ? `/ws/rdp/${session.id}`
        : `/ws/vnc/${session.id}`;
      const tunnel = new Guac.WebSocketTunnel(`${proto}//${location.host}${wsPath}`);
      tunnelRef = tunnel;
      client = new Guac.Client(tunnel);
      clientRef.current = client;

      const display = client.getDisplay();
      const displayEl: HTMLElement = display.getElement();
      displayEl.style.position = "absolute";
      displayEl.style.transformOrigin = "0 0";
      containerRef.current.appendChild(displayEl);

      // Side-by-side monitors of equal size, inferred from the aspect ratio (VNC has no layout info)
      function visibleRange() {
        const dw = display.getWidth();
        const n = screensRef.current;
        const k = screenRef.current;
        const vw = dw / n;
        return n > 1 && k >= 0 && k < n ? { x0: k * vw, vw } : { x0: 0, vw: dw };
      }

      function scaleDisplay() {
        const cw = containerRef.current?.offsetWidth ?? 1;
        const ch = containerRef.current?.offsetHeight ?? 1;
        const dw = display.getWidth();
        const dh = display.getHeight();
        if (dw === 0 || dh === 0) return;
        const n = monitorCount(dw, dh);
        if (n !== screensRef.current) { screensRef.current = n; setScreens(n); }
        const { x0, vw } = visibleRange();
        const scale = Math.min(cw / vw, ch / dh);
        scaleRef.current = scale;
        displayEl.style.left = (cw - vw * scale) / 2 - x0 * scale + "px";
        displayEl.style.top  = Math.max(0, (ch - dh * scale) / 2) + "px";
        displayEl.style.clipPath = `inset(0 ${(dw - x0 - vw) * scale}px 0 ${x0 * scale}px)`;
        display.scale(scale);
      }
      rescaleRef.current = scaleDisplay;

      display.onresize = scaleDisplay;
      obs = new ResizeObserver(scaleDisplay);
      obs.observe(containerRef.current);

      // Native mouse events — bypass Guacamole.Mouse entirely for exact coords.
      // getBoundingClientRect() on the container gives viewport position without
      // any transform confusion; subtract display offset and divide by scale.
      const container = containerRef.current;
      let btnLeft = false, btnMiddle = false, btnRight = false;

      function remoteCoords(e: MouseEvent) {
        const rect = container.getBoundingClientRect();
        const s = scaleRef.current || 1;
        const ox = parseFloat(displayEl.style.left) || 0;
        const oy = parseFloat(displayEl.style.top)  || 0;
        const { x0, vw } = visibleRange(); // keep the pointer on the monitor being shown
        return {
          x: Math.max(x0, Math.min(x0 + vw - 1, Math.round((e.clientX - rect.left - ox) / s))),
          y: Math.max(0, Math.min(display.getHeight() - 1, Math.round((e.clientY - rect.top  - oy) / s))),
        };
      }

      function sendMouse(coords: { x: number; y: number }, up = false, down = false) {
        if (!activeRef.current || !client) return;
        client.sendMouseState({ ...coords, left: btnLeft, middle: btnMiddle, right: btnRight, up, down });
      }

      const onMouseMove    = (e: MouseEvent)  => sendMouse(remoteCoords(e));
      const onMouseDown    = (e: MouseEvent)  => {
        if (e.button === 0) btnLeft   = true;
        else if (e.button === 1) btnMiddle = true;
        else if (e.button === 2) btnRight  = true;
        sendMouse(remoteCoords(e));
      };
      const onMouseUp      = (e: MouseEvent)  => {
        const c = remoteCoords(e);
        if (e.button === 0) btnLeft   = false;
        else if (e.button === 1) btnMiddle = false;
        else if (e.button === 2) btnRight  = false;
        sendMouse(c);
      };
      const onWheel        = (e: WheelEvent)  => { e.preventDefault(); sendMouse(remoteCoords(e), e.deltaY < 0, e.deltaY > 0); };
      const onContextMenu  = (e: Event)        => e.preventDefault();

      container.addEventListener("mousemove",   onMouseMove);
      container.addEventListener("mousedown",   onMouseDown);
      document .addEventListener("mouseup",     onMouseUp);
      container.addEventListener("wheel",       onWheel, { passive: false });
      container.addEventListener("contextmenu", onContextMenu);

      cleanupMouse = () => {
        container.removeEventListener("mousemove",   onMouseMove);
        container.removeEventListener("mousedown",   onMouseDown);
        document .removeEventListener("mouseup",     onMouseUp);
        container.removeEventListener("wheel",       onWheel);
        container.removeEventListener("contextmenu", onContextMenu);
      };

      keyboard = new Guac.Keyboard(document);
      keyboard.onkeydown = (keysym: number) => { if (activeRef.current && client) client.sendKeyEvent(1, keysym); };
      keyboard.onkeyup   = (keysym: number) => { if (activeRef.current && client) client.sendKeyEvent(0, keysym); };

      tunnel.onerror = (err: any) => {
        console.error("[Guac tunnel]", err);
        setStatus("error");
        setErrorMsg(err?.message ?? "Tunnel error");
      };
      client.onerror = (err: any) => {
        console.error("[Guac client]", err);
        setStatus("error");
        setErrorMsg(err?.message ?? String(err?.code ?? "Connection failed"));
      };
      client.onstatechange = (state: number) => {
        if (state === 3) setStatus("connected");
        if (state === 5) { setStatus("error"); setErrorMsg("Disconnected"); }
      };

      keepalive = setInterval(() => {
        try { tunnel.sendMessage("nop"); } catch {}
      }, 25000);

      client.connect();
    }

    start().catch(e => console.error("GuacPanel error", e));

    return () => {
      cancelled = true;
      cleanupMouse?.();
      obs?.disconnect();
      if (keepalive) clearInterval(keepalive);
      if (keyboard) { try { keyboard.reset(); } catch {} }
      if (client)   { try { client.disconnect(); } catch {} }
      client = null;
      clientRef.current = null;
    };
  }, [session.id, session.protocol]);

  useEffect(() => {
    if (active) setTimeout(() => window.dispatchEvent(new Event("resize")), 50);
  }, [active]);

  return (
    <div
      className="absolute inset-0 overflow-hidden bg-black"
      style={{ opacity: active ? 1 : 0, pointerEvents: active ? "auto" : "none" }}
    >
      <div ref={containerRef} className="w-full h-full relative overflow-hidden" />
      {status === "connected" && (
        <div
          className="absolute right-2 top-2 z-10 flex gap-2"
          onMouseDown={e => e.stopPropagation()}
          onMouseUp={e => e.stopPropagation()}
        >
          <button
            type="button" title="Send Ctrl+Alt+Del to the remote computer" onClick={sendCtrlAltDel}
            className="rounded-md border bg-background/90 px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur transition-colors hover:bg-muted"
          >
            Ctrl+Alt+Del
          </button>
          {screens > 1 && (
            <div className="flex overflow-hidden rounded-md border bg-background/90 text-xs font-medium shadow-sm backdrop-blur">
              {Array.from({ length: screens }, (_, i) => (
                <button
                  key={i} type="button" title={`Screen ${i + 1}`} onClick={() => chooseScreen(i)}
                  className={`px-3 py-1.5 transition-colors ${screen === i ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                type="button" title="All screens" onClick={() => chooseScreen(-1)}
                className={`px-3 py-1.5 transition-colors ${screen === -1 || screen >= screens ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                All
              </button>
            </div>
          )}
        </div>
      )}
      {status !== "connected" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-center px-6">
            {status === "connecting" ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin text-white/60" />
                <p className="text-sm text-white/60">Connecting…</p>
              </>
            ) : (
              <>
                <p className="text-sm text-red-400 font-medium">Connection failed</p>
                {errorMsg && <p className="text-xs text-white/40 max-w-xs">{errorMsg}</p>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
let sessionCounter = 0;
const SESSION_STORE = "remacc_sessions";

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
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const [manualWidth, setManualWidth] = useState(false);
  const isDragging = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Restore sessions from localStorage on mount so a page refresh reconnects
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_STORE);
      if (!raw) return;
      const { sessions: saved, activeKey: savedKey } = JSON.parse(raw);
      if (!Array.isArray(saved) || saved.length === 0) return;
      // Advance counter past any restored keys to avoid collisions
      const maxN = saved.reduce((m: number, s: Session) => {
        const n = parseInt(s.key.slice(1), 10);
        return isNaN(n) ? m : Math.max(m, n);
      }, 0);
      sessionCounter = maxN;
      setSessions(saved);
      setActiveKey(savedKey ?? saved[saved.length - 1].key);
    } catch {}
  }, []);

  // Persist sessions to localStorage whenever they change
  useEffect(() => {
    try {
      if (sessions.length > 0) {
        localStorage.setItem(SESSION_STORE, JSON.stringify({ sessions, activeKey }));
      } else {
        localStorage.removeItem(SESSION_STORE);
      }
    } catch {}
  }, [sessions, activeKey]);

  // Auto-resize sidebar to fit content when user hasn't manually sized it
  useEffect(() => {
    if (manualWidth) return;
    const el = contentRef.current;
    if (!el) return;
    const w = el.scrollWidth + 16;
    setSidebarWidth(Math.max(180, Math.min(520, w)));
  }, [expanded, connections, folders, manualWidth]);

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    setManualWidth(true);
    isDragging.current = true;
    const startX = e.clientX;
    const startW = sidebarWidth;
    function onMove(ev: MouseEvent) {
      if (!isDragging.current) return;
      setSidebarWidth(Math.max(160, Math.min(520, startW + ev.clientX - startX)));
    }
    function onUp() {
      isDragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/connections");
      const d = await r.json();
      setConnections(d.connections ?? []);
      setFolders(d.folders ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleConnect(conn: Connection) {
    // If this connection already has an open session, just switch to it
    const existing = sessions.find(s => s.id === conn.id);
    if (existing) {
      setActiveKey(existing.key);
      setSidebarOpen(false);
      return;
    }

    if (conn.protocol === "web") {
      const key = `s${++sessionCounter}`;
      setSessions(prev => [...prev, { key, id: conn.id, name: conn.name, protocol: conn.protocol, url: conn.host }]);
      setActiveKey(key);
      setSidebarOpen(false);
      return;
    }

    setConnecting(conn.id);
    setSidebarOpen(false);
    try {
      const r = await fetch(`/api/connections/${conn.id}/connect`);
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Connection failed"); return; }
      const key = `s${++sessionCounter}`;
      setSessions(prev => [...prev, { key, id: conn.id, name: conn.name, protocol: conn.protocol }]);
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
    const connected = sessions.some(s => s.id === c.id);
    return (
      <button
        key={c.id}
        onClick={() => handleConnect(c)}
        disabled={connecting === c.id}
        className="w-full flex items-center gap-2 py-1.5 px-2 rounded hover:bg-secondary/60 transition-colors text-left disabled:opacity-60"
      >
        {connecting === c.id
          ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
          : (
            <span className="relative shrink-0">
              <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
              {connected && (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-500 ring-1 ring-background" />
              )}
            </span>
          )
        }
        <span className="text-sm whitespace-nowrap">{c.name}</span>
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
          <span className="text-sm font-medium whitespace-nowrap">{f.name}</span>
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
          <Input className="pl-8 h-8 text-sm" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>
      <div ref={contentRef} className="flex-1 overflow-y-auto p-1.5">
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
                activeKey === s.key ? "bg-secondary font-medium" : "hover:bg-secondary/60 text-muted-foreground"
              }`}
            >
              {s.protocol === "ssh" ? <Terminal className="h-3 w-3 shrink-0" /> : s.protocol === "web" ? <Globe className="h-3 w-3 shrink-0" /> : <Monitor className="h-3 w-3 shrink-0" />}
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

      {/* Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {sidebarOpen && (
          <div className="md:hidden absolute inset-0 z-10 bg-black/50" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Sidebar */}
        <div
          className={`
            flex-col border-r bg-background overflow-hidden
            absolute md:relative z-20 md:z-auto h-full
            transition-transform duration-200 ease-in-out
            ${sidebarOpen ? "translate-x-0 flex" : "-translate-x-full md:translate-x-0 hidden md:flex"}
          `}
          style={{ width: sidebarWidth, minWidth: 160, maxWidth: 520, flexShrink: 0 }}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b md:hidden">
            <span className="text-sm font-medium">Connections</span>
            <button onClick={() => setSidebarOpen(false)} className="p-1 rounded hover:bg-secondary">
              <X className="h-4 w-4" />
            </button>
          </div>
          {sidebarContent}
        </div>

        {/* Drag handle between sidebar and content — desktop only */}
        <div
          className="hidden md:flex items-center justify-center w-1 h-full cursor-col-resize shrink-0 hover:bg-primary/50 active:bg-primary/70 transition-colors z-10"
          onMouseDown={startResize}
        />

        {/* Session area */}
        <div className="flex-1 relative overflow-hidden">
          {sessions.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Monitor className="h-10 w-10 text-muted-foreground/30" />
              <p className={`text-sm ${muted}`}>Select a connection to start a session</p>
              <button className="md:hidden text-xs text-primary underline" onClick={() => setSidebarOpen(true)}>
                Open connections
              </button>
            </div>
          ) : (
            sessions.map(s =>
              s.protocol === "ssh" ? (
                <SshPanel key={s.key} session={s} active={s.key === activeKey} />
              ) : s.protocol === "web" ? (
                <WebPanel key={s.key} session={s} active={s.key === activeKey} />
              ) : (
                <GuacPanel key={s.key} session={s} active={s.key === activeKey} />
              )
            )
          )}
        </div>
      </div>
    </div>
  );
}
