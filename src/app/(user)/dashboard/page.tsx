"use client";

import "@xterm/xterm/css/xterm.css";
import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2, Monitor, Folder, FolderOpen, Search, X, Menu, Terminal, Globe, ArrowLeft, ArrowRight, RotateCw, Home,
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
      const [[{ Terminal }, { FitAddon }], settings] = await Promise.all([
        Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]),
        fetch("/api/connections/settings").then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      if (cancelled || !containerRef.current) return;
      const ssh = settings?.ssh;

      const term = new Terminal({
        cursorBlink: true,
        fontFamily: ssh?.fontFamily ?? '"Cascadia Code", "Fira Code", monospace',
        fontSize: ssh?.fontSize ?? 13,
        lineHeight: 1.2,
        scrollback: ssh?.scrollback ?? 5000,
        allowTransparency: false,
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
      const ws = new WebSocket(`${proto}//${location.host}/ws/ssh/${session.id}?cols=${term.cols}&rows=${term.rows}`);
      wsRef.current = ws;
      ws.binaryType = "arraybuffer";

      // Resizes before the socket opened were dropped; send the current size once it is open
      ws.onopen = () => {
        fit.fit();
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
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

      // Copy on select, like PuTTY (Ctrl+C goes to the remote shell as an interrupt)
      term.onSelectionChange(() => {
        const text = term.getSelection();
        if (text) navigator.clipboard.writeText(text).catch(() => {});
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
      className="absolute inset-0 flex flex-col overflow-hidden"
      style={{
        opacity: active ? 1 : 0,
        pointerEvents: active ? "auto" : "none",
        background: "#111111",
      }}
    >
      <div
        ref={containerRef}
        className="flex-1 min-h-0 w-full"
        style={{ padding: "8px", boxSizing: "border-box" }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Guacamole Panel — RDP + VNC in-browser via guacd
// ---------------------------------------------------------------------------
interface Rect { x: number; y: number; w: number; h: number }

// Fewest equal monitors (side by side, or stacked) whose aspect ratio is a real monitor's
// (5:4 … 16:9); a single ultrawide (21:9) matches none and stays one screen
function equalMonitors(r: Rect): Rect[] {
  for (let n = 1; n <= 4; n++) {
    const wide = r.w / n / r.h, tall = r.w / (r.h / n);
    if (wide >= 1.2 && wide <= 1.85) return Array.from({ length: n }, (_, i) => ({ x: r.x + (i * r.w) / n, y: r.y, w: r.w / n, h: r.h }));
    if (tall >= 1.2 && tall <= 1.85) return Array.from({ length: n }, (_, i) => ({ x: r.x, y: r.y + (i * r.h) / n, w: r.w, h: r.h / n }));
  }
  return [r];
}

// UltraVNC's all-screens picture is the remote's virtual desktop, black where no monitor is (the
// protocol carries no monitor positions). Splits the lit area into bands of rows or columns where
// its outline steps, recursively (side by side, stacked, offset, mixed sizes); a part without a
// visible step is split into equal monitors. One rectangle when no multi-monitor layout is found.
function findMonitors(px: Uint8ClampedArray, w: number, h: number): Rect[] {
  const lit = (x: number, y: number) => { const i = (y * w + x) * 4; return px[i] > 8 || px[i + 1] > 8 || px[i + 2] > 8; };
  const median = (v: number[], k: number) => v.map((n, i) => {
    if (n < 0) return -1;
    const win = v.slice(Math.max(0, i - k), i + k + 1).filter(m => m >= 0).sort((a, b) => a - b);
    return win[win.length >> 1];
  });
  type Band = { from: number; to: number; lo: number; hi: number };
  const same = (m: Band, n: Band) => Math.abs(m.lo - n.lo) <= 8 && Math.abs(m.hi - n.hi) <= 8;
  const holds = (n: Band | undefined, b: Band) => !!n && b.lo >= n.lo - 8 && b.hi <= n.hi + 8;

  // Runs of lines across r (rows when alongY) whose lit extent stays the same
  function bands(r: Rect, alongY: boolean): Rect[] {
    const len = alongY ? r.h : r.w, cross = alongY ? r.w : r.h;
    const at = alongY ? (i: number, j: number) => lit(r.x + j, r.y + i) : (i: number, j: number) => lit(r.x + i, r.y + j);
    const lo: number[] = [], hi: number[] = [];
    for (let i = 0; i < len; i++) {
      let a = 0, b = cross - 1;
      while (a < cross && !at(i, a)) a++;
      while (b > a && !at(i, b)) b--;
      lo.push(a < cross ? a : -1); hi.push(a < cross ? b : -1);
    }
    const L = median(lo, 15), H = median(hi, 15); // ignore stray lines
    const out: Band[] = [];
    for (let i = 0; i < len; i++) {
      if (L[i] < 0) continue;
      const last = out[out.length - 1];
      if (last && same(last, { from: i, to: i, lo: L[i], hi: H[i] })) last.to = i; // dark lines in between join too
      else out.push({ from: i, to: i, lo: L[i], hi: H[i] });
    }
    // Dark content at a monitor's edge only narrows its lit extent, so a band too short to be a
    // monitor joins a neighbour whose extent contains it: sandwiched ones (a dark window) first
    for (;;) {
      for (let i = out.length - 1; i > 0; i--) if (same(out[i - 1], out[i])) { out[i - 1].to = out[i].to; out.splice(i, 1); }
      const pick = out.map((b, i) => ({ b, around: [out[i - 1], out[i + 1]].filter(n => holds(n, b)) as Band[] }))
        .filter(c => c.b.to - c.b.from < 360 && c.around.length)
        .sort((m, n) => n.around.length - m.around.length || (m.b.to - m.b.from) - (n.b.to - n.b.from))[0];
      if (!pick) break;
      // Prefer the neighbour that ends up with a real monitor's shape, then the closest extent
      const shape = (n: Band) => {
        const len = Math.max(n.to, pick.b.to) - Math.min(n.from, pick.b.from) + 1, span = n.hi - n.lo + 1;
        const a = alongY ? span / len : len / span;
        return Math.min(...[16 / 9, 16 / 10, 4 / 3, 5 / 4, 21 / 9].map(m => Math.abs(a - m)));
      };
      const gap = (n: Band) => Math.abs(n.lo - pick.b.lo) + Math.abs(n.hi - pick.b.hi);
      const host = pick.around.sort((m, n) => shape(m) - shape(n) || gap(m) - gap(n))[0];
      host.from = Math.min(host.from, pick.b.from); host.to = Math.max(host.to, pick.b.to);
      out.splice(out.indexOf(pick.b), 1);
    }
    return out.map(b => alongY
      ? { x: r.x + b.lo, y: r.y + b.from, w: b.hi - b.lo + 1, h: b.to - b.from + 1 }
      : { x: r.x + b.from, y: r.y + b.lo, w: b.to - b.from + 1, h: b.hi - b.lo + 1 });
  }

  // A part shaped like one monitor is one (its dark content must not split it further)
  function split(r: Rect, depth: number): Rect[] {
    if (depth > 0 && r.w / r.h >= 1.15 && r.w / r.h <= 2.4) return [r];
    if (depth < 3) for (const alongY of [true, false]) {
      const parts = bands(r, alongY);
      if (parts.length >= 2) return parts.flatMap(p => split(p, depth + 1));
    }
    return equalMonitors(r);
  }

  const whole = { x: 0, y: 0, w, h };
  const rects = split(whole, 0);
  return rects.length >= 2 && rects.length <= 4 && rects.every(r => r.w >= 480 && r.h >= 360) ? rects : [whole];
}

const CTRL_ALT_DEL = [0xffe3, 0xffe9, 0xffff]; // Control_L, Alt_L, Delete
// Web: shortcuts handled by the server-side browser (tools/remacc-browser.c)
const BROWSER_KEYS = {
  back: [0xffe9, 0xff51],    // Alt_L, Left
  forward: [0xffe9, 0xff53], // Alt_L, Right
  reload: [0xffc2],          // F5
  home: [0xffe9, 0xff50],    // Alt_L, Home
};

// guacd sends only "Aborted. See logs." for upstream failures; its status code says what happened
const GUAC_STATUS_TEXT: Record<number, string> = {
  0x0200: "The connection was closed by the server.",
  0x0202: "The remote computer did not respond.",
  0x0203: "The remote computer reported an error.",
  0x0207: "The remote computer refused the connection or could not be reached. If someone else is connected to it, it may allow only one viewer at a time.",
  0x0208: "The remote computer is busy or refused the connection.",
  0x0209: "Another session took over this connection.",
  0x0301: "The remote computer rejected the credentials.",
  0x0303: "Access to the remote computer was denied.",
};

function guacErrorText(err: any) {
  const msg = err?.message && err.message !== "Aborted. See logs." ? err.message : "";
  return msg || GUAC_STATUS_TEXT[err?.code] || (err?.code ? `Connection failed (code ${err.code})` : "");
}

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
  const monitorsRef = useRef<Rect[]>([]);
  const screenRef = useRef(screen);
  const rescaleRef = useRef<() => void>(() => {});
  const clientRef = useRef<any>(null);

  const isWeb = session.protocol === "web";

  function sendKeys(keys: number[]) {
    const c = clientRef.current;
    if (!c) return;
    keys.forEach(k => c.sendKeyEvent(1, k));
    [...keys].reverse().forEach(k => c.sendKeyEvent(0, k));
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
    let obs: ResizeObserver | null = null;
    let keepalive: ReturnType<typeof setInterval> | null = null;
    let sizeTimer: ReturnType<typeof setTimeout> | null = null;
    let cleanupMouse: (() => void) | null = null;

    async function start() {
      const mod = await import("guacamole-common-js");
      const Guac = (mod as any).default ?? mod;
      if (cancelled || !containerRef.current) return;

      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const wsPath = `/ws/${session.protocol === "web" ? "web" : session.protocol === "rdp" ? "rdp" : "vnc"}/${session.id}`;
      // Web: the server-side browser gets this panel's size, so pages render 1:1. The tunnel
      // appends "?" + connect data to its URL, so the size travels as that data.
      const connectData = session.protocol === "web"
        ? `w=${containerRef.current.offsetWidth}&h=${containerRef.current.offsetHeight}`
        : "";
      const tunnel = new Guac.WebSocketTunnel(`${proto}//${location.host}${wsPath}`);
      client = new Guac.Client(tunnel);
      clientRef.current = client;

      const display = client.getDisplay();
      const displayEl: HTMLElement = display.getElement();
      displayEl.style.position = "absolute";
      displayEl.style.transformOrigin = "0 0";
      containerRef.current.appendChild(displayEl);

      // The part of the remote picture on show: the chosen monitor, or all of it
      function visibleRect(): Rect {
        const all = { x: 0, y: 0, w: display.getWidth(), h: display.getHeight() };
        return monitorsRef.current.length > 1 ? monitorsRef.current[screenRef.current] ?? all : all;
      }

      function setMonitors(rects: Rect[]) {
        monitorsRef.current = rects;
        setScreens(rects.length);
      }

      function scaleDisplay() {
        const cw = containerRef.current?.offsetWidth ?? 1;
        const ch = containerRef.current?.offsetHeight ?? 1;
        const dw = display.getWidth();
        const dh = display.getHeight();
        if (dw === 0 || dh === 0) return;
        const r = visibleRect();
        const scale = Math.min(cw / r.w, ch / r.h);
        scaleRef.current = scale;
        // Whole pixels, crop rounded outward: no sliver of the neighbouring monitor at the edges
        displayEl.style.left = Math.round((cw - r.w * scale) / 2 - r.x * scale) + "px";
        displayEl.style.top  = Math.round(Math.max(0, (ch - r.h * scale) / 2) - r.y * scale) + "px";
        const edge = (v: number) => (v > 0 ? Math.ceil(v * scale) : 0) + "px";
        displayEl.style.clipPath = `inset(${edge(r.y)} ${edge(dw - r.x - r.w)} ${edge(dh - r.y - r.h)} ${edge(r.x)})`;
        display.scale(scale);
      }
      rescaleRef.current = scaleDisplay;

      // Monitor layout: equal side-by-side monitors at once from the size, then the real layout from
      // the picture's black filler once it has been drawn (a few tries: the first frames arrive in parts)
      let layoutTimers: ReturnType<typeof setTimeout>[] = [];
      function detectLayout() {
        const dw = display.getWidth(), dh = display.getHeight();
        if (session.protocol === "web" || dw === 0 || dh === 0) return;
        const canvas: HTMLCanvasElement = display.getDefaultLayer().getCanvas();
        const rects = findMonitors(canvas.getContext("2d")!.getImageData(0, 0, dw, dh).data, dw, dh);
        if (JSON.stringify(rects) !== JSON.stringify(monitorsRef.current)) { setMonitors(rects); scaleDisplay(); }
      }
      display.onresize = () => {
        const dw = display.getWidth(), dh = display.getHeight();
        setMonitors(session.protocol === "web" ? [] : equalMonitors({ x: 0, y: 0, w: dw, h: dh }));
        scaleDisplay();
        layoutTimers.forEach(clearTimeout);
        layoutTimers = [1500, 4000, 10000].map(ms => setTimeout(() => { if (!cancelled) detectLayout(); }, ms));
      };
      // Web: the server-side browser follows the panel's size, so pages always fill it 1:1
      obs = new ResizeObserver(() => {
        scaleDisplay();
        if (session.protocol !== "web") return;
        if (sizeTimer) clearTimeout(sizeTimer);
        sizeTimer = setTimeout(() => {
          const el = containerRef.current;
          if (el && el.offsetWidth > 0 && el.offsetHeight > 0) client?.sendSize(el.offsetWidth, el.offsetHeight);
        }, 300);
      });
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
        const r = visibleRect(); // keep the pointer on the monitor being shown
        return {
          x: Math.max(r.x, Math.min(r.x + r.w - 1, Math.round((e.clientX - rect.left - ox) / s))),
          y: Math.max(r.y, Math.min(r.y + r.h - 1, Math.round((e.clientY - rect.top  - oy) / s))),
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

      // The first error is the cause (e.g. the VNC server's reason); the socket closing after it must not replace it
      tunnel.onerror = (err: any) => {
        console.error("[Guac tunnel]", err);
        setStatus("error");
        setErrorMsg(prev => prev || guacErrorText(err) || GUAC_STATUS_TEXT[0x0200]);
      };
      client.onerror = (err: any) => {
        console.error("[Guac client]", err);
        setStatus("error");
        setErrorMsg(prev => prev || guacErrorText(err) || "Connection failed");
      };
      client.onstatechange = (state: number) => {
        if (state === 3) {
          setStatus("connected");
          // Web: the size sent at connect can predate the final layout; resizes before now were dropped
          const el = containerRef.current;
          if (session.protocol === "web" && el && el.offsetWidth > 0 && el.offsetHeight > 0) client?.sendSize(el.offsetWidth, el.offsetHeight);
        }
        if (state === 5) { setStatus("error"); setErrorMsg(prev => prev || "Disconnected"); }
      };

      keepalive = setInterval(() => {
        try { tunnel.sendMessage("nop"); } catch {}
      }, 25000);

      client.connect(connectData);
    }

    start().catch(e => console.error("GuacPanel error", e));

    return () => {
      cancelled = true;
      cleanupMouse?.();
      obs?.disconnect();
      if (sizeTimer) clearTimeout(sizeTimer);
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

  const navButton = (title: string, keys: number[], Icon: typeof Home) => (
    <Button
      type="button" variant="ghost" size="icon" className="h-7 w-7" title={title} aria-label={title}
      onClick={() => sendKeys(keys)} disabled={status !== "connected"}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );

  return (
    <div
      className="absolute inset-0 flex flex-col overflow-hidden bg-black"
      style={{ opacity: active ? 1 : 0, pointerEvents: active ? "auto" : "none" }}
    >
      {isWeb && (
        <div className="flex items-center gap-0.5 px-2 py-1 border-b bg-background shrink-0">
          {navButton("Back", BROWSER_KEYS.back, ArrowLeft)}
          {navButton("Forward", BROWSER_KEYS.forward, ArrowRight)}
          {navButton("Reload", BROWSER_KEYS.reload, RotateCw)}
          {navButton("Home", BROWSER_KEYS.home, Home)}
          {session.url && <span className={`ml-2 text-xs truncate ${muted}`}>{session.url}</span>}
        </div>
      )}
      <div ref={containerRef} className="flex-1 min-h-0 w-full relative overflow-hidden" />
      {status === "connected" && !isWeb && (
        <div
          className="absolute right-2 top-2 z-10 flex flex-col gap-1.5 items-end"
          onMouseDown={e => e.stopPropagation()}
          onMouseUp={e => e.stopPropagation()}
        >
          <button
            type="button" title="Send Ctrl+Alt+Del to the remote computer" onClick={() => sendKeys(CTRL_ALT_DEL)}
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
// Open tabs are restored per account, so two accounts' dashboards in one browser stay separate
const sessionStore = () => `remacc_sessions_${document.cookie.match(/(?:^|;\s*)webapp-active=(\d+)/)?.[1] ?? ""}`;

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
  const sidebarRef = useRef<HTMLDivElement>(null);
  const storeKey = useRef("");

  // Restore sessions from localStorage on mount so a page refresh reconnects
  useEffect(() => {
    try {
      storeKey.current = sessionStore();
      const raw = localStorage.getItem(storeKey.current);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const saved: Session[] = Array.isArray(parsed.sessions) ? parsed.sessions : [];
      const savedKey = saved.some((s: Session) => s.key === parsed.activeKey) ? parsed.activeKey : null;
      if (saved.length === 0) return;
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
        localStorage.setItem(storeKey.current, JSON.stringify({ sessions, activeKey }));
      } else {
        localStorage.removeItem(storeKey.current);
      }
    } catch {}
  }, [sessions, activeKey]);

  // Auto-resize sidebar before paint. Temporarily remove the width constraint so
  // the panel can report its intrinsic scrollWidth, then lock it in.
  useLayoutEffect(() => {
    if (manualWidth) return;
    const el = sidebarRef.current;
    if (!el) return;
    el.style.width = "max-content";
    const w = Math.max(180, Math.min(520, el.scrollWidth + 16));
    el.style.width = "";
    setSidebarWidth(w);
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

    setConnecting(conn.id);
    setSidebarOpen(false);
    try {
      const r = await fetch(`/api/connections/${conn.id}/connect`);
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Connection failed"); return; }
      const key = `s${++sessionCounter}`;
      setSessions(prev => [...prev, { key, id: conn.id, name: conn.name, protocol: conn.protocol, ...(conn.protocol === "web" ? { url: conn.host } : {}) }]);
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
              {c.protocol === "web"
                ? <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                : <Monitor className="h-3.5 w-3.5 text-muted-foreground" />}
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
          ref={sidebarRef}
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
