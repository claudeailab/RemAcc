'use strict';
process.env.NODE_ENV = 'production';
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');

const hostname = process.env.HOSTNAME ?? '0.0.0.0';
const port = parseInt(process.env.PORT ?? '8020', 10);

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }
function err(msg) { console.error(`[${new Date().toISOString()}] ${msg}`); }

process.on('uncaughtException', e => { err(`UNCAUGHT: ${e.stack ?? e}`); process.exit(1); });
process.on('unhandledRejection', (r) => { err(`UNHANDLED REJECTION: ${r?.stack ?? r}`); });

// ---------------------------------------------------------------------------
// Protocol settings cache — fetched from API and applied to guacd connections
// ---------------------------------------------------------------------------
let _protoSettings = null;
let _protoLastFetch = 0;

async function getProtoSettings() {
  const now = Date.now();
  if (now - _protoLastFetch > 30000) {
    try {
      const [rdpR, vncR, sshR] = await Promise.all([
        fetch(`http://127.0.0.1:${port}/api/admin/settings/rdp`),
        fetch(`http://127.0.0.1:${port}/api/admin/settings/vnc`),
        fetch(`http://127.0.0.1:${port}/api/admin/settings/ssh`),
      ]);
      const [rdp, vnc, ssh] = await Promise.all([rdpR.json(), vncR.json(), sshR.json()]);
      _protoSettings = { rdp, vnc, ssh };
    } catch {}
    _protoLastFetch = now;
  }
  return _protoSettings;
}

// ---------------------------------------------------------------------------
// Session grace period — keeps SSH/RDP/VNC alive after browser disconnect
// ---------------------------------------------------------------------------
const pendingSessions = new Map(); // key: `ssh:id` | `rdp:id` | `vnc:id`
let _cachedGrace = 0;
let _graceLastFetch = 0;

async function getSessionGrace() {
  const now = Date.now();
  if (now - _graceLastFetch > 30000) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/admin/settings/connections`);
      if (r.ok) _cachedGrace = (await r.json()).sessionGrace ?? 0;
    } catch {}
    _graceLastFetch = now;
  }
  return _cachedGrace;
}

function storePendingSession(key, grace, sessionData, cleanupFn) {
  const expires = Date.now() + grace * 1000;
  pendingSessions.set(key, { ...sessionData, expires });
  log(`Session ${key} parked for ${grace}s`);
  setTimeout(() => {
    const s = pendingSessions.get(key);
    if (s && Date.now() >= s.expires) {
      pendingSessions.delete(key);
      log(`Session ${key} expired`);
      cleanupFn(s);
    }
  }, grace * 1000 + 500);
}

// SSH: buffer last 64KB of output so reconnect sees recent terminal state
class SshSession {
  constructor(ssh, stream) {
    this.ssh = ssh;
    this.stream = stream;
    this.ws = null;
    this.buf = Buffer.alloc(0);
    stream.on('data', d => this._relay(d));
    stream.stderr.on('data', d => this._relay(d));
    stream.on('close', () => { if (this.ws?.readyState === 1) { try { this.ws.close(); } catch {} } });
  }
  attach(ws) {
    this.ws = ws;
    if (this.buf.length > 0) { ws.send(this.buf); this.buf = Buffer.alloc(0); }
  }
  detach() { this.ws = null; }
  write(data) { try { this.stream.write(data); } catch {} }
  resize(rows, cols) { try { this.stream.setWindow(rows, cols, 0, 0); } catch {} }
  destroy() { try { this.stream.end(); this.ssh.end(); } catch {} }
  _relay(d) {
    if (this.ws?.readyState === 1) {
      this.ws.send(d);
    } else {
      const merged = Buffer.concat([this.buf, d]);
      this.buf = merged.length > 65536 ? merged.slice(merged.length - 65536) : merged;
    }
  }
}

// ---------------------------------------------------------------------------
// Start guacd for in-browser RDP/VNC support
// ---------------------------------------------------------------------------
function startGuacd() {
  log('Starting guacd...');
  const guacd = spawn('guacd', ['-f', '-b', '127.0.0.1', '-l', '4822', '-L', 'info'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  guacd.stdout?.on('data', d => process.stdout.write('[guacd] ' + d));
  guacd.stderr?.on('data', d => process.stderr.write('[guacd] ' + d));
  guacd.on('spawn', () => log('guacd spawned (pid ' + guacd.pid + ')'));
  guacd.on('error', e => {
    if (e.code === 'ENOENT') log('guacd not found — RDP/VNC unavailable');
    else err('[guacd] spawn error: ' + e.message);
  });
  guacd.on('exit', (code, signal) => log(`guacd exited code=${code} signal=${signal}`));
  process.on('exit', () => { try { guacd.kill(); } catch {} });
}

// ---------------------------------------------------------------------------
// Guacamole protocol helpers
// ---------------------------------------------------------------------------
function guacEncode(parts) {
  return parts.map(p => { const s = String(p ?? ''); return s.length + '.' + s; }).join(',') + ';';
}

function guacParse(str) {
  const parts = [];
  let i = 0;
  while (i < str.length) {
    const dot = str.indexOf('.', i);
    if (dot < 0) break;
    const len = parseInt(str.slice(i, dot), 10);
    if (isNaN(len)) break;
    parts.push(str.slice(dot + 1, dot + 1 + len));
    i = dot + 1 + len;
    if (str[i] === ';') break;
    if (str[i] === ',') { i++; continue; }
    break;
  }
  return parts;
}

const RDP_DEFAULTS = {
  // Core connection
  hostname: '', port: '3389', domain: '', username: '', password: '',
  // Display
  width: '1280', height: '800', dpi: '96', 'color-depth': '32',
  // Security — nla works for most modern Windows; freerdp falls back gracefully
  security: 'nla',
  'ignore-cert': 'true',
  'disable-auth': 'false',
  // Performance
  'enable-wallpaper': 'false', 'enable-theming': 'false',
  'enable-font-smoothing': 'true', 'enable-desktop-composition': 'false',
  'enable-menu-animations': 'false',
  // Clipboard + resize
  'normalize-clipboard': 'true',
  'resize-method': 'display-update',
  // Recording
  'create-recording-path': 'false',
  // Drive/clipboard/audio off by default
  'enable-drive': 'false',
  'enable-audio': 'false',
  // Gatewayed connections (empty = no gateway)
  'gateway-hostname': '', 'gateway-port': '443', 'gateway-username': '', 'gateway-password': '', 'gateway-domain': '',
};

const VNC_DEFAULTS = {
  hostname: '', port: '5900', password: '',
  'read-only': 'false', 'color-depth': '32',
  encoding: 'tight', 'swap-red-blue': 'false',
  cursor: 'remote',
};

// ---------------------------------------------------------------------------
// UltraVNC DSM proxy (Wine + Xvfb + x11vnc relay)
// ---------------------------------------------------------------------------
const UVNC_DIR = '/tmp/uvnc';
const WINE_PREFIX = '/tmp/uvnc-wine';
const SCREEN_W = 1920, SCREEN_H = 1080;
const dsmDisplays = new Set();  // X displays owned by running or starting DSM proxies
const dsmByConn = new Map();    // connId -> session; one relay per connection, latest wins

// Displays 50-149 belong to this process, so lock/socket files of a display not in
// dsmDisplays are leftovers of a killed Xvfb. Reserved synchronously: no allocation race.
function allocDisplay() {
  for (let d = 50; d < 150; d++) {
    if (dsmDisplays.has(d)) continue;
    dsmDisplays.add(d);
    removeDisplayFiles(d);
    return d;
  }
  throw new Error('No free X display');
}

function removeDisplayFiles(d) {
  const fs = require('fs');
  for (const f of [`/tmp/.X${d}-lock`, `/tmp/.X11-unix/X${d}`]) fs.rmSync(f, { force: true });
}

function findFreePort() {
  const net2 = require('net');
  return new Promise((resolve, reject) => {
    const srv = net2.createServer();
    srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
    srv.on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Poll until the X11 socket for a display exists, instead of a fixed sleep.
async function waitForX(display, timeoutMs = 5000) {
  const fs = require('fs');
  const sock = `/tmp/.X11-unix/X${display}`;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(sock)) return;
    await sleep(40);
  }
  throw new Error(`Xvfb :${display} did not come up`);
}

// Poll until a TCP port accepts connections (x11vnc ready to serve).
async function waitForPort(port, timeoutMs = 5000) {
  const net2 = require('net');
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await new Promise(res => {
      const s = net2.connect(port, '127.0.0.1');
      s.on('connect', () => { s.destroy(); res(true); });
      s.on('error', () => res(false));
    });
    if (ok) return;
    await sleep(40);
  }
  throw new Error(`port ${port} did not open`);
}

// Initialise the Wine prefix once and cache it, so the first real connection
// does not pay the cold wineboot cost. Warmed at startup, awaited on use.
let _winePrefixReady = null;
function ensureWinePrefix() {
  if (_winePrefixReady) return _winePrefixReady;
  _winePrefixReady = new Promise(resolve => {
    const env = { ...process.env, WINEPREFIX: WINE_PREFIX, WINEDEBUG: '-all', DISPLAY: '', WINEDLLOVERRIDES: 'mono=d;gecko=d' };
    const wb = spawn('wineboot', ['-i'], { env, stdio: 'ignore' });
    const done = () => resolve();
    wb.on('error', done); // proceed even if wineboot is unavailable
    wb.on('exit', () => {
      // wined3d GDI renderer: the viewer's Direct3D frames skip OpenGL (Mesa llvmpipe), ~50 ms faster per update
      const reg = spawn('wine', ['reg', 'add', 'HKCU\\Software\\Wine\\Direct3D', '/v', 'renderer', '/t', 'REG_SZ', '/d', 'gdi', '/f'], { env, stdio: 'ignore' });
      reg.on('exit', done);
      reg.on('error', done);
    });
  });
  return _winePrefixReady;
}

async function startDsmProxy(connId, host, vncPort, username, password) {
  const fs = require('fs');
  const path = require('path');

  const manifestPath = path.join(UVNC_DIR, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error('UltraVNC files not uploaded. Upload them in Admin → Protocol Settings → UltraVNC.');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!manifest.uvnc_plugin) throw new Error('DSM plugin file not uploaded');
  if (!manifest.uvnc_viewer) throw new Error('UltraVNC Viewer not uploaded');

  // A second viewer on the same server would be kicked (non-shared) and auto-reconnect,
  // fighting the first one — the newest browser session takes over.
  dsmByConn.get(connId)?.stop();
  const display = allocDisplay();
  const procs = [];
  const session = { display, port: 0, stopped: false, procs };
  session.stop = () => {
    if (session.stopped) return;
    session.stopped = true;
    for (const proc of procs) { try { proc.kill('SIGKILL'); } catch {} }
    removeDisplayFiles(display);
    dsmDisplays.delete(display);
    if (dsmByConn.get(connId) === session) dsmByConn.delete(connId);
    session.onStop?.();
    log(`DSM proxy id=${connId}: display=:${display} stopped`);
  };
  dsmByConn.set(connId, session);
  const alive = () => { if (session.stopped) throw new Error('DSM proxy superseded'); };

  try {
    await ensureWinePrefix();
    alive();
    session.port = await findFreePort();
    alive();

    const xvfb = spawn('Xvfb', [`:${display}`, '-screen', '0', `${SCREEN_W}x${SCREEN_H}x24`, '-nolisten', 'tcp'], { stdio: 'ignore' });
    procs.push(xvfb);
    xvfb.on('error', e => err(`Xvfb :${display} error: ${e.message}`));
    await waitForX(display);
    alive();

    // Start x11vnc before Wine so guacd can connect immediately and stream
    // the connection progress dialog live.
    const x11vnc = spawn('x11vnc', [
      '-display', `:${display}`, '-rfbport', String(session.port),
      '-nopw', '-forever', '-shared', '-quiet', '-localhost',
      '-wait', '1', '-defer', '1', // with XDAMAGE hints: ~30 ms lower latency than 5/5 polling
      '-nocursor',         // the browser's own pointer is the only cursor
    ], { stdio: 'ignore' });
    procs.push(x11vnc);
    x11vnc.on('error', e => err(`x11vnc id=${connId} error: ${e.message}`));

    const viewerPath = path.join(UVNC_DIR, manifest.uvnc_viewer);
    // mono=d;gecko=d: prevent Wine from showing Mono/.NET and Gecko install dialogs
    const wineEnv = { ...process.env, DISPLAY: `:${display}`, WINEPREFIX: WINE_PREFIX, WINEDEBUG: '-all', WINEDLLOVERRIDES: 'mono=d;gecko=d' };

    // -directx: under Wine the GDI path's WM_SIZE handler (Scrollbar_RecalculateSize) resizes
    // the window in an endless loop, so the viewer never requests a frame. The DirectX path skips it.
    // -autoscaling: fit any remote resolution into the Xvfb screen at a uniform ratio.
    // -noremotecursor: the server does not paint its cursor and the viewer draws none — a painted
    // cursor lags behind the browser's pointer and shows up as a second mouse.
    // -noemulate3: button presses are sent at once instead of being held on a timer for
    // left+right middle-button emulation (the browser sends real middle clicks).
    const wineArgs = [viewerPath, `${host}::${vncPort}`, '-dsmplugin', manifest.uvnc_plugin, '-notoolbar', '-directx', '-autoscaling', '-noremotecursor', '-noemulate3'];
    if (password) wineArgs.push('-password', password);
    if (username) wineArgs.push('-user', username);

    const wine = spawn('wine', wineArgs, { env: wineEnv, cwd: UVNC_DIR, stdio: 'ignore' });
    procs.push(wine);
    wine.on('error', e => err(`Wine id=${connId} error: ${e.message}`));

    await waitForPort(session.port);
    alive();
  } catch (e) {
    session.stop();
    throw e;
  }
  log(`DSM proxy id=${connId}: display=:${display} port=${session.port}`);
  return session;
}

// One log line per 10 s for a DSM session, to locate delays: frames/s and the browser round trip
// (guacd sync -> browser ack) cover network + browser; CPU% covers the relay processes.
function startDsmDiag(connId, session) {
  const fs = require('fs');
  const os = require('os');
  const sent = new Map(); // guacd frame timestamp -> ms when relayed to the browser
  let frames = 0;
  let lags = [];
  const ticks = pid => {
    try { const f = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' '); return +f[11] + +f[12]; } catch { return 0; }
  };
  let prev = session.procs.map(p => ticks(p.pid));
  const timer = setInterval(() => {
    const now = session.procs.map(p => ticks(p.pid));
    const cpu = now.map((t, i) => Math.round((t - (prev[i] ?? 0)) / 10)); // 100 ticks/s over 10 s -> %
    prev = now;
    lags.sort((a, b) => a - b);
    const p50 = lags.length ? lags[lags.length >> 1] : '-';
    const max = lags.length ? lags[lags.length - 1] : '-';
    const cutoff = Date.now() - 30000;
    for (const [ts, t] of sent) if (t < cutoff) sent.delete(ts);
    log(`DSM id=${connId}: ${(frames / 10).toFixed(1)} frames/s, browser round trip p50 ${p50} ms max ${max} ms, ` +
        `CPU% viewer ${cpu[2] ?? '-'} x11vnc ${cpu[1] ?? '-'} Xvfb ${cpu[0] ?? '-'}, load ${os.loadavg()[0].toFixed(1)} on ${os.cpus().length} cores`);
    frames = 0;
    lags = [];
  }, 10000);
  return {
    frameSent(ts) { frames++; if (sent.size < 500) sent.set(ts, Date.now()); },
    frameAcked(ts) { const t = sent.get(ts); if (t !== undefined) { lags.push(Date.now() - t); sent.delete(ts); } },
    stop() { clearInterval(timer); },
  };
}

// ---------------------------------------------------------------------------
// Guacamole WebSocket relay (RDP + VNC via guacd)
// ---------------------------------------------------------------------------
async function handleGuac(wsConn, req, id, protocol) {
  log(`WS ${protocol.toUpperCase()} connection id=${id}`);

  // Resume pending session if one exists
  const key = `${protocol}:${id}`;
  const pending = pendingSessions.get(key);
  if (pending && Date.now() < pending.expires) {
    pendingSessions.delete(key);
    log(`WS ${protocol} id=${id}: resuming parked session`);
    const { tcp, params } = pending;
    let currentWs = wsConn;
    // Re-attach TCP → WS relay
    tcp.removeAllListeners('data');
    let streaming = true;
    tcp.on('data', chunk => { if (currentWs.readyState === 1) currentWs.send(chunk.toString()); });
    tcp.on('close', () => { try { currentWs.close(); } catch {} });
    wsConn.on('message', data => {
      if (!streaming) return;
      const str = data.toString();
      try { const p = guacParse(str); if (p[0] === 'size' && (p[1] === '0' || p[2] === '0')) return; } catch {}
      tcp.write(str);
    });
    wsConn.on('close', async () => {
      const grace = await getSessionGrace();
      if (grace > 0 && !tcp.destroyed) {
        tcp.removeAllListeners('data');
        tcp.on('data', () => {}); // drain silently
        storePendingSession(key, grace, { tcp, params }, s => { try { s.tcp.destroy(); } catch {} });
      } else {
        try { tcp.destroy(); } catch {}
      }
    });
    return;
  }

  let details;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/connections/${id}/connect`, {
      headers: { cookie: req.headers.cookie ?? '' },
    });
    if (!res.ok) {
      err(`WS ${protocol} id=${id}: connect API returned ${res.status}`);
      wsConn.send(guacEncode(['error', 'Access denied', '0']));
      wsConn.close(1008);
      return;
    }
    details = await res.json();
  } catch (e) {
    err(`WS ${protocol} id=${id}: connect API error: ${e.message}`);
    wsConn.close(1011);
    return;
  }

  const proto = await getProtoSettings();
  let base;
  if (protocol === 'rdp') {
    const s = proto?.rdp ?? {};
    base = {
      ...RDP_DEFAULTS,
      security: s.security ?? RDP_DEFAULTS.security,
      width: String(s.width ?? 1280),
      height: String(s.height ?? 800),
      'color-depth': String(s.colorDepth ?? 32),
      'ignore-cert': (s.ignoreCert ?? true) ? 'true' : 'false',
      'enable-wallpaper': (s.enableWallpaper ?? false) ? 'true' : 'false',
      'enable-font-smoothing': (s.enableFontSmoothing ?? true) ? 'true' : 'false',
      'enable-theming': (s.enableTheming ?? false) ? 'true' : 'false',
      'normalize-clipboard': (s.normalizeClipboard ?? true) ? 'true' : 'false',
      'resize-method': s.resizeMethod ?? 'display-update',
    };
  } else {
    const s = proto?.vnc ?? {};
    base = {
      ...VNC_DEFAULTS,
      port: String(s.port ?? 5900),
      'color-depth': String(s.colorDepth ?? 32),
      encoding: s.encoding ?? 'tight',
      'read-only': (s.readOnly ?? false) ? 'true' : 'false',
      'swap-red-blue': (s.swapRedBlue ?? false) ? 'true' : 'false',
      cursor: s.cursor ?? 'remote',
    };
  }
  // DSM proxy: for VNC connections with dsmPlugin option, relay via Wine+Xvfb+x11vnc
  let guacHost = details.host;
  let guacPort = String(details.port);
  let dsm = null;
  if (protocol === 'vnc' && details.options?.dsmPlugin) {
    // A socket that already closed must not start (and supersede) a relay
    if (wsConn.readyState !== 1) return;
    try {
      dsm = await startDsmProxy(id, details.host, parseInt(guacPort) || 5900, details.credential?.username ?? '', details.credential?.password ?? '');
    } catch (e) {
      err(`WS VNC id=${id}: DSM proxy failed: ${e.message}`);
      if (wsConn.readyState === 1) wsConn.send(guacEncode(['error', 'DSM proxy error: ' + e.message, '514']));
      try { wsConn.close(1011); } catch {}
      return;
    }
    // The browser may have left (e.g. page reload) while the relay was starting
    if (wsConn.readyState !== 1) { dsm.stop(); return; }
    wsConn.once('close', dsm.stop);
    dsm.onStop = () => { try { wsConn.close(); } catch {} }; // superseded by a newer session
    guacHost = '127.0.0.1';
    guacPort = String(dsm.port);
    base.cursor = 'local'; // the relay paints no cursor; 'remote' would add guacd's position dot
    log(`WS VNC id=${id}: using DSM proxy on 127.0.0.1:${dsm.port}`);
  }

  const shadow = details.options?.shadow ?? {};
  const params = {
    ...base,
    hostname: guacHost,
    port: guacPort,
    username: details.credential?.username ?? '',
    password: details.credential?.password ?? '',
    ...(details.credential?.domain ? { domain: details.credential.domain } : {}),
    // RDP shadow options (passed through to guacd/FreeRDP if supported)
    ...(shadow.sessionId > 0 ? {
      'shadow': String(shadow.sessionId),
      'shadow-control': shadow.control ? 'true' : 'false',
      'shadow-no-consent': shadow.noConsent ? 'true' : 'false',
      'read-only': shadow.control ? 'false' : 'true',
    } : {}),
  };

  // Connect to guacd immediately — do not wait for first browser message.
  // The browser's guacamole client waits for `ready` and then streams;
  // all handshake (select → args → connect) is handled server-side.
  const tcp = new net.Socket();
  let buf = '';
  let streaming = false;
  const diag = dsm ? startDsmDiag(id, dsm) : null;
  if (diag) wsConn.once('close', diag.stop);

  tcp.on('error', e => {
    err(`WS ${protocol} id=${id}: guacd TCP error: ${e.message}`);
    if (wsConn.readyState === 1) wsConn.send(guacEncode(['error', e.message, '514']));
    try { wsConn.close(1011); } catch {}
  });

  tcp.on('data', chunk => {
    const raw = chunk.toString();
    buf += raw;
    let semi;
    while ((semi = buf.indexOf(';')) !== -1) {
      const instr = buf.slice(0, semi + 1);
      buf = buf.slice(semi + 1);
      const parts = guacParse(instr);
      const opcode = parts[0];

      if (opcode === 'args') {
        // Guacamole protocol requires: size + audio + video + image BEFORE connect
        const w = params.width || '1280';
        const h = params.height || '800';
        tcp.write(guacEncode(['size', w, h]));
        tcp.write(guacEncode(['audio']));
        tcp.write(guacEncode(['video']));
        tcp.write(guacEncode(['image', 'image/png', 'image/jpeg', 'image/webp']));
        const values = parts.slice(1).map(name => params[name] ?? '');
        log(`WS ${protocol} id=${id}: sending connect (${parts.length - 1} args) size=${w}x${h}`);
        tcp.write(guacEncode(['connect', ...values]));
      } else if (opcode === 'ready') {
        log(`WS ${protocol} id=${id}: guacd ready`);
        streaming = true;
        if (wsConn.readyState === 1) wsConn.send(instr);
      } else if (streaming) {
        if (opcode === 'sync') diag?.frameSent(parts[1]);
        if (wsConn.readyState === 1) wsConn.send(instr);
      }
    }
  });

  tcp.on('close', () => { try { wsConn.close(); } catch {} });

  wsConn.on('message', data => {
    if (!streaming) return;
    const str = data.toString();
    try {
      const p = guacParse(str);
      if (p[0] === 'size' && (p[1] === '0' || p[2] === '0')) return;
      if (p[0] === 'sync') diag?.frameAcked(p[1]);
    } catch {}
    tcp.write(str);
  });
  wsConn.on('close', async () => {
    if (!streaming) { try { tcp.destroy(); } catch {} return; }
    const grace = await getSessionGrace();
    if (grace > 0 && !tcp.destroyed && !dsm) {
      tcp.removeAllListeners('data');
      tcp.on('data', () => {}); // drain silently while parked
      storePendingSession(key, grace, { tcp, params }, s => { try { s.tcp.destroy(); } catch {} });
    } else {
      try { tcp.destroy(); } catch {}
    }
  });

  tcp.connect(4822, '127.0.0.1', () => {
    log(`WS ${protocol} id=${id}: connected to guacd`);
    tcp.write(guacEncode(['select', protocol]));
  });
}

// ---------------------------------------------------------------------------
// SSH WebSocket proxy
// ---------------------------------------------------------------------------
async function handleSSH(wsConn, req, id) {
  log(`WS SSH connection id=${id}`);

  // Resume pending session if one exists
  const key = `ssh:${id}`;
  const pending = pendingSessions.get(key);
  if (pending && Date.now() < pending.expires) {
    pendingSessions.delete(key);
    log(`WS SSH id=${id}: resuming parked session`);
    const session = pending.session;
    session.attach(wsConn);
    wsConn.send('\r\n\x1b[2m[reconnected]\x1b[0m\r\n');
    wsConn.on('message', raw => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'data') session.write(msg.data);
        else if (msg.type === 'resize') session.resize(msg.rows, msg.cols);
      } catch {}
    });
    wsConn.on('close', async () => {
      session.detach();
      const grace = await getSessionGrace();
      if (grace > 0) {
        storePendingSession(key, grace, { session }, s => s.session.destroy());
      } else {
        session.destroy();
      }
    });
    return;
  }

  try {
    const { Client: SSHClient } = require('ssh2');
    const res = await fetch(`http://127.0.0.1:${port}/api/connections/${id}/connect`, {
      headers: { cookie: req.headers.cookie ?? '' },
    });
    if (!res.ok) {
      err(`WS SSH id=${id}: connect API returned ${res.status}`);
      wsConn.send('\r\n\x1b[31mAccess denied\x1b[0m\r\n');
      wsConn.close(1008);
      return;
    }
    const details = await res.json();
    if (!details.credential) {
      wsConn.send('\r\n\x1b[31mNo credentials configured for this connection\x1b[0m\r\n');
      wsConn.close(1008);
      return;
    }

    const ssh = new SSHClient();
    ssh.on('ready', () => {
      log(`WS SSH id=${id}: SSH ready`);
      ssh.shell({ term: 'xterm-256color', cols: 80, rows: 24 }, (e, stream) => {
        if (e) { err(`WS SSH id=${id}: shell error: ${e.message}`); wsConn.close(1011); return; }
        const session = new SshSession(ssh, stream);
        session.attach(wsConn);
        wsConn.on('message', raw => {
          try {
            const msg = JSON.parse(raw.toString());
            if (msg.type === 'data') session.write(msg.data);
            else if (msg.type === 'resize') session.resize(msg.rows, msg.cols);
          } catch {}
        });
        wsConn.on('close', async () => {
          session.detach();
          const grace = await getSessionGrace();
          if (grace > 0) {
            storePendingSession(key, grace, { session }, s => s.session.destroy());
          } else {
            session.destroy();
          }
        });
      });
    });
    ssh.on('error', e => {
      err(`WS SSH id=${id}: ${e.message}`);
      if (wsConn.readyState === 1) wsConn.send(`\r\n\x1b[31mSSH error: ${e.message}\x1b[0m\r\n`);
      try { wsConn.close(1011); } catch {}
    });
    const sshProto = (await getProtoSettings())?.ssh ?? {};
    ssh.connect({
      host: details.host, port: details.port,
      username: details.credential.username, password: details.credential.password,
      readyTimeout: (sshProto.readyTimeout ?? 15) * 1000,
      keepaliveInterval: (sshProto.keepaliveInterval ?? 25) * 1000,
    });
  } catch (e) {
    err(`WS SSH id=${id}: ${e.stack ?? e.message}`);
    if (wsConn.readyState === 1) wsConn.send(`\r\n\x1b[31mError: ${e.message}\x1b[0m\r\n`);
    try { wsConn.close(1011); } catch {}
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  log(`Starting server — node ${process.version} port=${port}`);
  log(`ENV: NODE_ENV=${process.env.NODE_ENV} HOSTNAME=${hostname}`);

  // Log which required env vars are set (values redacted)
  const envKeys = ['REMACC_JWT_SECRET','REMACC_DB_HOST','REMACC_DB_PORT','REMACC_DB_USER','REMACC_DB_NAME','REMACC_ADMIN_EMAIL'];
  for (const k of envKeys) log(`  ${k}=${process.env[k] ? '(set)' : 'MISSING'}`);

  startGuacd();
  ensureWinePrefix(); // warm the Wine prefix in the background for fast first DSM connect

  // Verify critical directories exist
  const fs = require('fs');
  const staticDir = require('path').join(__dirname, '.next', 'static');
  const publicDir = require('path').join(__dirname, 'public');
  log(`Checking .next/static: ${fs.existsSync(staticDir) ? 'EXISTS' : 'MISSING'}`);
  if (fs.existsSync(staticDir)) {
    const chunks = require('path').join(staticDir, 'chunks');
    log(`  chunks/: ${fs.existsSync(chunks) ? 'EXISTS ('+fs.readdirSync(chunks).length+' files)' : 'MISSING'}`);
  }
  log(`Checking public/: ${fs.existsSync(publicDir) ? 'EXISTS ('+fs.readdirSync(publicDir).length+' files)' : 'MISSING'}`);

  log('Loading Next.js server...');
  let NextServer, conf;
  try {
    NextServer = require('./node_modules/next/dist/server/next-server').default;
    conf = require('./.next/required-server-files.json');
    log('Next.js modules loaded');
  } catch (e) {
    err('Failed to load Next.js modules: ' + (e.stack ?? e));
    process.exit(1);
  }

  const app = new NextServer({
    dir: __dirname, port, hostname, customServer: true,
    conf: conf.config,
  });

  log('Preparing Next.js app...');
  try {
    await app.prepare();
    log('Next.js app prepared');
  } catch (e) {
    err('Next.js prepare() failed: ' + (e.stack ?? e));
    process.exit(1);
  }

  const nextHandler = app.getRequestHandler();

  const path = require('path');
  const mime = {
    '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
    '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff',
    '.map': 'application/json', '.txt': 'text/plain',
  };

  // Serve a file from disk directly, bypassing Next.js handler
  function serveFile(baseDir, reqPath, res, noCache = false) {
    const filePath = path.join(baseDir, reqPath);
    if (!filePath.startsWith(baseDir + path.sep) && filePath !== baseDir) return false;
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return false;
    const ct = mime[path.extname(filePath)] ?? 'application/octet-stream';
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', noCache ? 'no-cache, no-store' : 'public, max-age=31536000, immutable');
    res.writeHead(200);
    fs.createReadStream(filePath).pipe(res);
    return true;
  }

  // Log the BUILD_ID and a sample of chunk names so we can verify consistency
  try {
    const buildId = fs.readFileSync(path.join(__dirname, '.next', 'BUILD_ID'), 'utf8').trim();
    const chunkFiles = fs.readdirSync(path.join(staticDir, 'chunks')).slice(0, 5);
    log(`BUILD_ID: ${buildId}`);
    log(`Sample chunks: ${chunkFiles.join(', ')}`);
  } catch {}

  const server = http.createServer(async (req, res) => {
    const start = Date.now();
    const urlPath = (req.url ?? '/').split('?')[0];
    try {
      // Serve /_next/static/ directly from disk — bypass Next.js handler
      if (urlPath.startsWith('/_next/static/')) {
        const rel = urlPath.slice('/_next/static'.length);
        if (serveFile(staticDir, rel, res, false)) return;
      }
      // Serve public/ files directly — Next.js standalone doesn't auto-serve them
      if (!urlPath.startsWith('/_next/') && !urlPath.startsWith('/api/')) {
        const noCache = urlPath === '/sw.js' || urlPath === '/manifest.json';
        if (serveFile(publicDir, urlPath, res, noCache)) return;
      }
      await nextHandler(req, res);
    } catch (e) {
      err(`Request ${req.method} ${req.url} error: ${e.stack ?? e}`);
      if (!res.headersSent) { res.statusCode = 500; res.end('Internal Server Error'); }
    } finally {
      if (req.url !== '/api/health') {
        log(`${req.method} ${req.url} ${res.statusCode ?? '?'} ${Date.now() - start}ms`);
      }
    }
  });

  const { WebSocketServer } = require('ws');
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const url = req.url ?? '';
    log(`WS upgrade: ${url}`);
    const path = url.split('?')[0];
    const mSsh = path.match(/^\/ws\/ssh\/(\d+)$/);
    const mRdp = path.match(/^\/ws\/rdp\/(\d+)$/);
    const mVnc = path.match(/^\/ws\/vnc\/(\d+)$/);
    if (mSsh) wss.handleUpgrade(req, socket, head, ws => handleSSH(ws, req, parseInt(mSsh[1], 10)));
    else if (mRdp) wss.handleUpgrade(req, socket, head, ws => handleGuac(ws, req, parseInt(mRdp[1], 10), 'rdp'));
    else if (mVnc) wss.handleUpgrade(req, socket, head, ws => handleGuac(ws, req, parseInt(mVnc[1], 10), 'vnc'));
    else { log(`WS upgrade rejected: ${url}`); socket.destroy(); }
  });

  await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, hostname, () => {
      log(`Ready on http://${hostname}:${port}`);
      resolve();
    });
  });
}

main().catch(e => { err('FATAL: ' + (e.stack ?? e)); process.exit(1); });
