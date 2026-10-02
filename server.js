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
// Protocol settings + session grace (global values), cached; read with the
// connecting user's cookie because the route requires a signed-in user
// ---------------------------------------------------------------------------
let _protoSettings = null;
let _protoLastFetch = 0;

async function getProtoSettings(req) {
  const now = Date.now();
  if (now - _protoLastFetch > 30000) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/connections/settings`, {
        headers: { cookie: req.headers.cookie ?? '' }, redirect: 'manual',
      });
      if (r.ok) { _protoSettings = await r.json(); _protoLastFetch = now; }
      else err(`Protocol settings: API returned ${r.status}`);
    } catch (e) { err(`Protocol settings: ${e.message}`); }
  }
  return _protoSettings;
}

// Keeps SSH/RDP/VNC alive after browser disconnect
const pendingSessions = new Map(); // key: `ssh:id` | `rdp:id` | `vnc:id`

async function getSessionGrace(req) {
  return (await getProtoSettings(req))?.sessionGrace ?? 0;
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
const WINE_PREFIX_TEMPLATE = '/opt/uvnc-wine-template';
// Room for multi-monitor remotes at 1:1; x11vnc exports only the viewer window's rectangle
const SCREEN_W = 7680, SCREEN_H = 2160;
const xDisplays = new Set();    // X displays owned by running or starting DSM relays and web browsers
// Monitor selection (rfbSetSW -> vncDesktop::SetSW) is one server-wide setting on UltraVNC: one
// session per remote computer steps at a time, and never while another already shows all screens.
// "host:port" -> promise
const dsmSwitching = new Map();
const dsmSessions = new Set();  // running DSM relays: other viewers of the same computer change its screens too

// Displays 50-149 belong to this process, so lock/socket files of a display not in
// xDisplays are leftovers of a killed Xvfb. Reserved synchronously: no allocation race.
function allocDisplay() {
  for (let d = 50; d < 150; d++) {
    if (xDisplays.has(d)) continue;
    xDisplays.add(d);
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
    const fs = require('fs');
    const started = Date.now();
    // Prefix built into the image (tools/wine-prefix-template.sh); copied so the runtime user owns it
    if (!fs.existsSync(WINE_PREFIX) && fs.existsSync(WINE_PREFIX_TEMPLATE)) {
      try { require('child_process').execFileSync('cp', ['-r', '--no-dereference', '--preserve=mode,timestamps', WINE_PREFIX_TEMPLATE, WINE_PREFIX]); }
      catch (e) { err(`Wine prefix template copy failed: ${e.message}`); fs.rmSync(WINE_PREFIX, { recursive: true, force: true }); }
    }
    const env = { ...process.env, WINEPREFIX: WINE_PREFIX, WINEDEBUG: '-all', DISPLAY: '', WINEDLLOVERRIDES: 'mono=d;gecko=d' };
    const wb = spawn('wineboot', ['-i'], { env, stdio: 'ignore' });
    const done = () => { log(`Wine prefix ready in ${Date.now() - started} ms`); resolve(); };
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

// mono=d;gecko=d: prevent Wine from showing Mono/.NET and Gecko install dialogs
function dsmWineEnv(display) {
  return { ...process.env, DISPLAY: `:${display}`, WINEPREFIX: WINE_PREFIX, WINEDEBUG: '-all', WINEDLLOVERRIDES: 'mono=d;gecko=d' };
}

// Runs the Windows helper (tools/uvnc-switch.c) against this session's viewer -> { code, out }
const UVNC_SWITCH_EXE = require('path').join(__dirname, 'uvnc-switch.exe');
function uvncHelper(session, mode) {
  return new Promise(resolve => {
    let out = '';
    const p = spawn('wine', [UVNC_SWITCH_EXE, session.exeName, mode], { env: dsmWineEnv(session.display), stdio: ['ignore', 'pipe', 'ignore'] });
    p.stdout.on('data', d => { out += d; });
    p.on('exit', code => resolve({ code, out: out.trim() }));
    p.on('error', () => resolve({ code: -1, out: '' }));
  });
}

// Monitors the remote UltraVNC server reports (rfbMonitorInfo); 0 when it never reports them,
// null when the helper cannot query this session's viewer at all. The server sends it right after
// the viewer's SetEncodings, so once the viewer is up a missing count is final: poll briefly.
async function dsmMonitorCount(connId, session) {
  let last = null;
  for (const start = Date.now(); Date.now() - start < 1500 && !session.stopped; await sleep(250)) {
    last = await uvncHelper(session, 'count');
    if (last.code === 0 && +last.out > 0) return +last.out;
  }
  if (last && last.code !== 0) { err(`DSM id=${connId}: monitor count helper exited ${last.code}`); return null; }
  return 0;
}

// UltraVNC's "Select full desktop / switch monitor": the viewer asks the server for its next
// monitor; the viewer window takes the new size and followViewerWindow moves the relay with it.
async function switchDsmMonitor(connId, session) {
  const { code } = await uvncHelper(session, 'switch');
  if (code !== 0) err(`DSM id=${connId}: monitor switch helper exited ${code}`);
  return code === 0;
}

// Wider than 1.85:1 is what the browser counts as several monitors (monitorCount in the dashboard)
const isWide = win => win.w / win.h > 1.85;

// x11vnc runs -remote commands from its main loop and can miss -sync's deadline under load
// (production: "exit 1" after 3.6 s, the browser never got the new size and no bar appeared).
// A clip counts as applied only once x11vnc confirmed it and the browser received that size;
// until then the follow loop (every 500 ms) sends it again.
function applyClip(connId, session, win) {
  const clip = clipRect(win);
  const size = clip.split('+')[0];
  if (clip === session.clip) {
    if (!session.browserSize || session.browserSize === size || Date.now() - session.clipAt < 3000) return;
    log(`DSM id=${connId}: browser still at ${session.browserSize}, resending relay ${clip}`);
  }
  if (session.clipPending) return;
  if (clip !== session.clipLogged) {
    session.clipLogged = clip;
    log(`DSM id=${connId}: remote screen now ${win.w}x${win.h}, relay ${clip}`);
  }
  session.clipPending = clip;
  const x = spawn('x11vnc', ['-display', `:${session.display}`, '-sync', '-remote', `clip:${clip}`], { stdio: 'ignore' });
  const done = code => {
    session.clipPending = null;
    if (code === 0) { session.clip = clip; session.clipAt = Date.now(); }
    else err(`DSM id=${connId}: relay resize to ${clip} failed (x11vnc exit ${code}), retrying`);
  };
  x.on('exit', done);
  x.on('error', () => done(-1));
}

// Until the viewer window kept its size for stableMs (the remote finished rebuilding its desktop)
async function waitForStableWindow(session, stableMs = 1000, maxMs = 4000) {
  let last = null, since = Date.now();
  for (const start = Date.now(); Date.now() - start < maxMs && !session.stopped; await sleep(250)) {
    const win = await findViewerWindow(session.display, 640, 400).catch(() => null);
    const size = win && `${win.w}x${win.h}`;
    if (size !== last) { last = size; since = Date.now(); }
    else if (Date.now() - since >= stableMs) return;
  }
}

// UltraVNC starts on the primary monitor and can only step to the next one; the cycle depends on
// the server version (2012–2016: primary -> second -> all; 1.8: primary <-> all), so step one at a
// time until the remote sends all screens side by side; the browser then picks a screen locally.
// Equal monitors keep the size when stepping between them, so an unchanged size ends the step's
// wait instead of failing it. The wait must outlast a slow remote's answer: stepping again before
// it arrives overshoots past "all screens". -> true shown, false never side by side, null unknown
async function showAllDsmMonitors(connId, session, count, waitMs = 6000) {
  const sizeOf = win => `${win.w}x${win.h}`;
  let win = await findViewerWindow(session.display, 640, 400).catch(() => null);
  if (!win) { log(`DSM id=${connId}: viewer window not found, switching screens later`); return null; }
  if (isWide(win)) return true;
  for (let step = 0; step < (count > 1 ? count : 3) && !session.stopped && session.wantAll !== false; step++) {
    // The selection is server-wide: switching while another viewer already shows all screens would
    // turn them off for everyone. This viewer just has not received the new layout yet.
    if (await otherViewerShowsAll(session)) { log(`DSM id=${connId}: another viewer of this computer already shows all screens, not switching`); return null; }
    if (!await switchDsmMonitor(connId, session)) return false;
    const before = sizeOf(win);
    for (const start = Date.now(); Date.now() - start < waitMs && !session.stopped; await sleep(250)) {
      const next = await findViewerWindow(session.display, 640, 400).catch(() => null);
      if (next && sizeOf(next) !== before) { win = next; break; }
    }
    log(`DSM id=${connId}: screen step ${step + 1}: ${sizeOf(win)}`);
    if (isWide(win)) { log(`DSM id=${connId}: showing all screens (${sizeOf(win)})`); return true; }
  }
  log(`DSM id=${connId}: remote never sent a side-by-side view (now ${sizeOf(win)})`);
  return false;
}

async function otherViewerShowsAll(session) {
  const remote = `${session.remote.host}:${session.remote.port}`;
  for (const o of dsmSessions) {
    if (o === session || o.stopped || `${o.remote.host}:${o.remote.port}` !== remote) continue;
    const win = await findViewerWindow(o.display, 640, 400).catch(() => null);
    if (win && isWide(win)) return true;
  }
  return false;
}

// Runs in the background once the desktop is showing: the user can work on the primary screen at
// once. When all screens arrive the browser keeps showing the chosen screen (1 by default) at the
// same scale, so only the 1 | 2 | All bar appears.
function prepareDsmMonitors(connId, session) {
  // Unknown count (older UltraVNC servers never report it): step anyway, rather than hide screens.
  // The count only caps the steps and rules out single-monitor remotes, so it is asked in parallel.
  session.monitorCount = 0;
  session.wantAll = true;
  dsmMonitorCount(connId, session).then(n => {
    log(`DSM id=${connId}: ${n === null ? 'monitor count unavailable' : n ? `remote reports ${n} monitor(s)` : 'remote does not report its monitors (older UltraVNC server)'}`);
    if (n === 1) session.wantAll = false;
    else if (n) session.monitorCount = n;
  }).catch(() => {});
  keepAllDsmMonitors(connId, session, 300)
    .catch(e => err(`DSM id=${connId}: monitor switch: ${e.message}`))
    .finally(() => { session.allTries = []; }); // the session's own fallbacks get the full budget
}

// UltraVNC falls back to the primary monitor whenever it rebuilds its desktop (right after
// connecting, lock/unlock, UAC, Ctrl+Alt+Del). Wait for the remote to settle, then step back to
// all screens. Gives up on a remote without a side-by-side view, or one that falls back 3 times
// within a minute (stepping would only make it flicker).
async function keepAllDsmMonitors(connId, session, stableMs = 1000) {
  if (!session.wantAll || session.stepping || session.stopped) return;
  const now = Date.now();
  session.allTries = (session.allTries ?? []).filter(t => now - t < 60000);
  if (session.allTries.length >= 3) {
    session.wantAll = false;
    log(`DSM id=${connId}: remote keeps returning to one screen; no longer switching`);
    return;
  }
  session.allTries.push(now);
  session.stepping = true;
  const remote = `${session.remote.host}:${session.remote.port}`;
  let release;
  try {
    while (dsmSwitching.has(remote)) await dsmSwitching.get(remote); // another viewer of this computer
    dsmSwitching.set(remote, new Promise(r => { release = r; }));
    await waitForStableWindow(session, stableMs);
    if (session.stopped) return;
    if (await showAllDsmMonitors(connId, session, session.monitorCount) === false) {
      // With other viewers on this computer their switching can mask ours: try again later
      const others = [...dsmSessions].some(o => o !== session && `${o.remote.host}:${o.remote.port}` === remote);
      if (others) log(`DSM id=${connId}: other viewers of ${remote} are active, switching screens later`);
      else session.wantAll = false;
    }
  } finally {
    if (release) { dsmSwitching.delete(remote); release(); }
    session.stepping = false;
  }
}

// Keep the relay on the viewer window for the whole session: its size changes when the remote
// switches monitors or changes resolution, however long the remote takes (500 ms: a size change
// reaches the browser within ~1 s)
function followViewerWindow(connId, session) {
  const same = (a, b) => a && b && a.w === b.w && a.h === b.h && a.x === b.x && a.y === b.y;
  let prev = null, busy = false;
  session.follow = setInterval(async () => {
    if (busy || session.stopped) return;
    busy = true;
    try {
      const win = await findViewerWindow(session.display, 640, 400).catch(() => null);
      if (win && same(win, prev)) {
        applyClip(connId, session, win);
        if (!isWide(win)) keepAllDsmMonitors(connId, session).catch(e => err(`DSM id=${connId}: monitor switch: ${e.message}`));
      }
      prev = win;
    } finally { busy = false; }
  }, 500);
}

async function startDsmProxy(connId, host, vncPort, username, password) {
  const fs = require('fs');
  const path = require('path');

  const manifestPath = path.join(UVNC_DIR, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error('UltraVNC files not uploaded. Upload them in Admin → Protocol Settings → UltraVNC.');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!manifest.uvnc_plugin) throw new Error('DSM plugin file not uploaded');
  if (!manifest.uvnc_viewer) throw new Error('UltraVNC Viewer not uploaded');

  const display = allocDisplay();
  const procs = [];
  // Own copy of the viewer per session: the monitor-switch helper finds this viewer by exe name.
  // Not a hard link: Wine names every link of one file after the first one it opened.
  const exeName = `remacc-viewer-${display}.exe`;
  const session = { display, port: 0, stopped: false, procs, exeName, remote: { host, port: vncPort } };
  session.stop = () => {
    if (session.stopped) return;
    session.stopped = true;
    dsmSessions.delete(session);
    clearInterval(session.follow);
    for (const proc of procs) { try { proc.kill('SIGKILL'); } catch {} }
    fs.rmSync(path.join(UVNC_DIR, exeName), { force: true });
    removeDisplayFiles(display);
    xDisplays.delete(display);
    session.onStop?.();
    log(`DSM proxy id=${connId}: display=:${display} stopped`);
  };
  dsmSessions.add(session);
  const alive = () => { if (session.stopped) throw new Error('DSM session closed during startup'); };

  const t0 = Date.now();
  let tViewer = 0;
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

    const viewerPath = path.join(UVNC_DIR, exeName);
    fs.rmSync(viewerPath, { force: true });
    fs.copyFileSync(path.join(UVNC_DIR, manifest.uvnc_viewer), viewerPath);
    const wineEnv = dsmWineEnv(display);

    // -directx: under Wine the GDI path's WM_SIZE handler (Scrollbar_RecalculateSize) resizes
    // the window in an endless loop, so the viewer never requests a frame. The DirectX path skips it.
    // No -autoscaling: the viewer draws the remote 1:1, so every monitor stays at native resolution.
    // -noremotecursor: the server does not paint its cursor and the viewer draws none — a painted
    // cursor lags behind the browser's pointer and shows up as a second mouse.
    // -noemulate3: button presses are sent at once instead of being held on a timer for
    // left+right middle-button emulation (the browser sends real middle clicks).
    // -quality 3: a command-line launch uses Ultra2 at JPEG quality 80; 30 sends ~57% fewer bytes
    // per screen change with text still sharp (2 smudges it) — the VNC server link is the bottleneck.
    const wineArgs = [viewerPath, `${host}::${vncPort}`, '-dsmplugin', manifest.uvnc_plugin, '-shared', '-notoolbar', '-directx', '-noremotecursor', '-noemulate3', '-quality', '3'];
    if (password) wineArgs.push('-password', password);
    if (username) wineArgs.push('-user', username);

    const wine = spawn('wine', wineArgs, { env: wineEnv, cwd: UVNC_DIR, stdio: 'ignore' });
    procs.push(wine);
    wine.on('error', e => err(`Wine id=${connId} error: ${e.message}`));

    // Export exactly the viewer window (= the remote screen). If the viewer shows a dialog instead
    // (e.g. authentication failed), export a 1920x1080 area around it so the user can read and answer it.
    const found = await waitForViewerWindow(display, wine, alive);
    alive();
    tViewer = Date.now() - t0;
    const win = found?.screen ? found.win : null;
    const clip = win ? clipRect(win) : dialogRect(found?.win);
    const x11vnc = spawn('x11vnc', [
      '-display', `:${display}`, '-rfbport', String(session.port), '-clip', clip,
      '-nopw', '-forever', '-shared', '-quiet', '-localhost',
      '-wait', '1', '-defer', '1', // with XDAMAGE hints: ~30 ms lower latency than 5/5 polling
      '-nocursor',         // the browser's own pointer is the only cursor
    ], { stdio: 'ignore' });
    procs.push(x11vnc);
    x11vnc.on('error', e => err(`x11vnc id=${connId} error: ${e.message}`));

    await waitForPort(session.port);
    alive();
    log(`DSM proxy id=${connId}: display=:${display} port=${session.port} ${win ? 'screen' : 'viewer dialog'} ${clip} — ready in ${Date.now() - t0} ms (viewer ${tViewer} ms)`);
    session.clip = clip;
    session.clipAt = Date.now();
    session.clipLogged = clip;
    followViewerWindow(connId, session);
    if (win) prepareDsmMonitors(connId, session);
  } catch (e) {
    session.stop();
    throw e;
  }
  return session;
}

// Largest viewable viewer window (any .exe class — each session has its own display) at least minW x minH, excluding the connection status
// dialog. At 1:1 the viewer's main window has exactly the remote framebuffer's size.
async function findViewerWindow(display, minW, minH) {
  const { execFile } = require('child_process');
  const xwininfo = args => new Promise((resolve, reject) =>
    execFile('xwininfo', args, { env: { ...process.env, DISPLAY: `:${display}` } }, (e, out) => e ? reject(e) : resolve(out)));
  let best = null;
  for (const line of (await xwininfo(['-root', '-tree'])).split('\n')) {
    const m = line.match(/^\s+(0x[0-9a-f]+) (?:"(.*)"|\(has no name\)): \("[^"]+\.exe" [^)]*\)\s+(\d+)x(\d+)\+(-?\d+)\+(-?\d+)/);
    if (!m) continue;
    const [, id, name = '', w, h, x, y] = m;
    if (name.startsWith('UltraVNC Viewer Status') || +w < minW || +h < minH) continue;
    if (!best || +w * +h > best.w * best.h) best = { id, w: +w, h: +h, x: +x, y: +y };
  }
  if (!best) return null;
  return /Map State: IsViewable/.test(await xwininfo(['-id', best.id])) ? best : null;
}

// Wait for the viewer's main window with a stable geometry -> { screen: true, win }. A dialog that
// stays up for 3 s without a main window -> { screen: false, win }. Gives up after 30 s.
async function waitForViewerWindow(display, wine, alive) {
  const same = (a, b) => a && b && a.w === b.w && a.h === b.h && a.x === b.x && a.y === b.y;
  let prev = null;
  let dialogSince = 0;
  let dialog = null;
  const start = Date.now();
  while (Date.now() - start < 30000) {
    alive();
    if (wine.exitCode !== null) throw new Error('UltraVNC viewer exited before showing the remote screen');
    const win = await findViewerWindow(display, 640, 400).catch(() => null);
    if (same(win, prev)) return { screen: true, win };
    prev = win;
    dialog = win ? null : await findViewerWindow(display, 50, 30).catch(() => null);
    dialogSince = dialog ? dialogSince || Date.now() : 0;
    if (dialog && Date.now() - dialogSince >= 3000) return { screen: false, win: dialog };
    await sleep(250);
  }
  return dialog && { screen: false, win: dialog };
}

function clipRect(win) {
  const x = Math.max(0, win.x), y = Math.max(0, win.y);
  return `${Math.min(win.w, SCREEN_W - x)}x${Math.min(win.h, SCREEN_H - y)}+${x}+${y}`;
}

// 1920x1080 area centred on the dialog (or the screen), inside the screen
function dialogRect(win) {
  const cx = win ? win.x + (win.w >> 1) : SCREEN_W >> 1;
  const cy = win ? win.y + (win.h >> 1) : SCREEN_H >> 1;
  const x = Math.min(Math.max(0, cx - 960), SCREEN_W - 1920);
  const y = Math.min(Math.max(0, cy - 540), SCREEN_H - 1080);
  return `1920x1080+${x}+${y}`;
}

// The viewer's TCP connection to the UltraVNC server as the kernel sees it (iproute2 ss): bytes
// received, ms since the last send/receive, smoothed RTT. null when there is no such connection.
function vncLinkStats(ip, port) {
  const { execFile } = require('child_process');
  const dst = ip.includes(':') ? `[${ip}]:${port}` : `${ip}:${port}`;
  return new Promise(resolve => execFile('ss', ['-Htin', 'state', 'established', 'dst', dst], { timeout: 1000 }, (e, out) => {
    if (e || !out.includes('bytes_received:')) return resolve(null);
    const num = re => +(out.match(re)?.[1] ?? 0);
    resolve({ at: Date.now(), recv: num(/bytes_received:(\d+)/), lastsnd: num(/lastsnd:(\d+)/),
      lastrcv: num(/lastrcv:(\d+)/), rtt: num(/\brtt:([\d.]+)\//) });
  }));
}

// One log line per 10 s for a DSM session, to locate delays: frames/s and the browser round trip
// (guacd sync -> browser ack) cover network + browser; CPU% covers the relay processes; the VNC
// server link covers viewer <-> UltraVNC server. Each click/key press is traced hop by hop.
function startDsmDiag(connId, session) {
  const fs = require('fs');
  const os = require('os');
  const sent = new Map(); // guacd frame timestamp -> ms when relayed to the browser
  let frames = 0;
  let lags = [];
  let stopped = false;
  let ip = null;
  require('dns').promises.lookup(session.remote.host).then(r => { ip = r.address; }, () => {});
  const link = () => ip ? vncLinkStats(ip, session.remote.port) : Promise.resolve(null);
  const kb = bytes => (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0);
  const ms = v => v < 10 ? v.toFixed(1) : Math.round(v);
  let linkPrev = null, linkIn = 0, linkPeak = 0, rtt = null;
  const linkTimer = setInterval(async () => {
    const s = await link();
    if (!s) return;
    if (linkPrev) {
      const d = s.recv - linkPrev.recv;
      linkIn += d;
      linkPeak = Math.max(linkPeak, d * 1000 / Math.max(1, s.at - linkPrev.at));
    }
    linkPrev = s;
    rtt = s.rtt;
  }, 1000);

  // One input at a time, sampled every 50 ms for 6 s: when the viewer sent it to the UltraVNC server,
  // the bursts of data that server sent back (size, from/to), and when the relay passed the image
  // following the first burst on to the browser.
  let tracing = false;
  let buttons = 0;
  let images = [];
  async function trace(what) {
    if (tracing || !ip || stopped) return;
    tracing = true;
    images = [];
    const t0 = Date.now();
    const samples = [];
    while (Date.now() - t0 < 6000 && !stopped) {
      const s = await link();
      if (s) samples.push(s);
      await sleep(50);
    }
    tracing = false;
    if (samples.length < 2 || stopped) return;
    const rel = t => t === undefined ? '-' : `+${t - t0} ms`;
    const sentAt = samples.map(s => s.at - s.lastsnd).filter(t => t >= t0).sort((a, b) => a - b)[0];
    // A sample with new bytes ends its burst at its last packet (lastrcv); consecutive ones merge
    const bursts = [];
    for (let i = 1; i < samples.length; i++) {
      const bytes = samples[i].recv - samples[i - 1].recv;
      if (!bytes) continue;
      const end = Math.max(samples[i - 1].at, samples[i].at - samples[i].lastrcv);
      const last = bursts[bursts.length - 1];
      if (last?.i === i - 1) Object.assign(last, { bytes: last.bytes + bytes, end, i });
      else bursts.push({ start: samples[i - 1].at, end, bytes, i });
    }
    const big = bursts.filter(b => b.bytes >= 1024).slice(0, 4);
    const answer = big.length ? big.map(b => `${kb(b.bytes)} KB +${b.start - t0}..+${b.end - t0} ms`).join(', ') : 'nothing';
    log(`DSM id=${connId} ${what} trace: viewer -> VNC server by ${rel(sentAt)}; VNC server -> viewer ${answer}; ` +
        `relay -> browser ${big.length ? rel(images.find(t => t >= big[0].end)) : '-'}; ` +
        `VNC server link rtt ${ms(samples[samples.length - 1].rtt)} ms`);
  }
  const ticks = pid => {
    try { const f = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' '); return +f[11] + +f[12]; } catch { return 0; }
  };
  const names = { viewer: 'wine', x11vnc: 'x11vnc', Xvfb: 'Xvfb' };
  const sample = () => Object.fromEntries(Object.entries(names).map(([k, file]) =>
    [k, ticks(session.procs.find(p => p.spawnfile === file)?.pid)]));
  let prev = sample();
  const timer = setInterval(() => {
    const now = sample();
    const cpu = Object.fromEntries(Object.keys(now).map(k => [k, Math.round((now[k] - prev[k]) / 10)])); // 100 ticks/s over 10 s -> %
    prev = now;
    lags.sort((a, b) => a - b);
    const p50 = lags.length ? lags[lags.length >> 1] : '-';
    const max = lags.length ? lags[lags.length - 1] : '-';
    const cutoff = Date.now() - 30000;
    for (const [ts, t] of sent) if (t < cutoff) sent.delete(ts);
    const linkText = rtt === null ? '' : `, VNC server link rtt ${ms(rtt)} ms, in ${kb(linkIn / 10)} KB/s peak ${kb(linkPeak)} KB/s`;
    log(`DSM id=${connId}: ${(frames / 10).toFixed(1)} frames/s, browser round trip p50 ${p50} ms max ${max} ms, ` +
        `CPU% viewer ${cpu.viewer} x11vnc ${cpu.x11vnc} Xvfb ${cpu.Xvfb}, load ${os.loadavg()[0].toFixed(1)} on ${os.cpus().length} cores${linkText}`);
    frames = 0;
    lags = [];
    linkIn = 0;
    linkPeak = 0;
  }, 10000);
  return {
    frameSent(ts) { frames++; if (sent.size < 500) sent.set(ts, Date.now()); },
    frameAcked(ts) { const t = sent.get(ts); if (t !== undefined) { lags.push(Date.now() - t); sent.delete(ts); } },
    imageSent() { if (tracing && images.length < 1000) images.push(Date.now()); },
    input(p) {
      if (p[0] === 'mouse') {
        const b = +p[3] & 7;
        if (b && !buttons) trace('click');
        buttons = b;
      } else if (p[0] === 'key' && p[2] === '1') trace('key');
    },
    stop() { stopped = true; clearInterval(timer); clearInterval(linkTimer); },
  };
}

// ---------------------------------------------------------------------------
// Web connections: a minimal WebKitGTK browser (tools/remacc-browser.c) on its own Xvfb
// display inside the company network, streamed through x11vnc + guacd like VNC
// ---------------------------------------------------------------------------
const BROWSER = '/usr/local/bin/remacc-browser';

function webUrl(host) {
  return /^https?:\/\//i.test(host) ? host : `http://${host}`;
}

// Browser size = the RemAcc panel size, so pages render 1:1
const WEB_MAX_W = 3840, WEB_MAX_H = 2160;
const clampWebW = v => Math.min(WEB_MAX_W, Math.max(640, Math.round(Number(v)) || 1280));
const clampWebH = v => Math.min(WEB_MAX_H, Math.max(480, Math.round(Number(v)) || 800));

function webSize(req) {
  const q = new URL(req.url ?? '/', 'http://x').searchParams;
  return { width: clampWebW(q.get('w')), height: clampWebH(q.get('h')) };
}

async function startWebBrowser(connId, url, username, password, width, height) {
  const fs = require('fs');
  const display = allocDisplay();
  const home = `/tmp/remacc-web-${display}`;
  const procs = [];
  const session = { display, port: 0, stopped: false };
  session.stop = () => {
    if (session.stopped) return;
    session.stopped = true;
    // Own process groups: WebKit's network/web processes die with the browser
    for (const p of procs) { try { process.kill(-p.pid, 'SIGKILL'); } catch {} }
    fs.rmSync(home, { recursive: true, force: true });
    removeDisplayFiles(display);
    xDisplays.delete(display);
    session.onStop?.();
    log(`WEB id=${connId}: display=:${display} stopped`);
  };
  const run = (cmd, args, opts = {}) => {
    const p = spawn(cmd, args, { stdio: 'ignore', detached: true, ...opts });
    procs.push(p);
    p.on('error', e => err(`WEB id=${connId}: ${cmd} error: ${e.message}`));
    return p;
  };

  try {
    session.port = await findFreePort();
    // Full-size screen: the browser window (top-left) follows the user's panel and the relay
    // exports only that window, so a resized panel never shows black bars
    run('Xvfb', [`:${display}`, '-screen', '0', `${WEB_MAX_W}x${WEB_MAX_H}x24`, '-nolisten', 'tcp']);
    await waitForX(display);

    fs.rmSync(home, { recursive: true, force: true });
    fs.mkdirSync(home, { recursive: true });
    // Minimal env: the browser never sees RemAcc's secrets; credentials go through stdin only
    const browser = run(BROWSER, [], {
      stdio: ['pipe', 'ignore', 'ignore'],
      env: {
        DISPLAY: `:${display}`, HOME: home, PATH: '/usr/bin:/bin', LANG: 'C.UTF-8',
        NO_AT_BRIDGE: '1', GSETTINGS_BACKEND: 'memory', DBUS_SESSION_BUS_ADDRESS: 'disabled:',
        // No GPU in the container: CPU rendering into shared memory (lowest memory use)
        WEBKIT_SKIA_ENABLE_CPU_RENDERING: '1', WEBKIT_DISABLE_DMABUF_RENDERER: '1',
      },
    });
    browser.stdin.on('error', () => {});
    browser.stdin.write(`${url}\0${username}\0${password}\0${width}x${height}\0`); // stays open for resizes
    browser.on('exit', code => { if (!session.stopped) { log(`WEB id=${connId}: browser exited (${code})`); session.stop(); } });

    run('x11vnc', [
      '-display', `:${display}`, '-rfbport', String(session.port), '-clip', `${width}x${height}+0+0`,
      '-nopw', '-forever', '-shared', '-quiet', '-localhost',
      '-wait', '1', '-defer', '1',
      '-noprimary', // only explicit copies (Ctrl+C) reach the user's clipboard, not every selection
    ]);
    await waitForPort(session.port);
    if (session.stopped) throw new Error('browser exited during startup');
    session.size = `${width}x${height}`;
    session.resize = (w, h) => {
      const size = `${clampWebW(w)}x${clampWebH(h)}`;
      if (session.stopped || size === session.size) return;
      session.size = size;
      browser.stdin.write(`${size}\n`);
      const x = spawn('x11vnc', ['-display', `:${display}`, '-sync', '-remote', `clip:${size}+0+0`], { stdio: 'ignore' });
      x.on('exit', code => { if (code !== 0) err(`WEB id=${connId}: relay resize to ${size} failed (x11vnc exit ${code})`); });
      log(`WEB id=${connId}: panel resized to ${size}`);
    };
    log(`WEB id=${connId}: display=:${display} port=${session.port} ${width}x${height} ${url}${username ? ' (auto sign-in)' : ''}`);
  } catch (e) {
    session.stop();
    throw e;
  }
  return session;
}

// ---------------------------------------------------------------------------
// Guacamole WebSocket relay (RDP, VNC and web via guacd)
// ---------------------------------------------------------------------------
async function handleGuac(wsConn, req, id, protocol) {
  log(`WS ${protocol.toUpperCase()} connection id=${id}`);

  let details;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/connections/${id}/connect`, {
      headers: { cookie: req.headers.cookie ?? '' },
    });
    if (!res.ok) {
      err(`WS ${protocol} id=${id}: connect API returned ${res.status}`);
      wsConn.send(guacEncode(['error', `Access denied (${res.status})`, '769']));
      wsConn.close(1008);
      return;
    }
    details = await res.json();
  } catch (e) {
    err(`WS ${protocol} id=${id}: connect API error: ${e.message}`);
    wsConn.send(guacEncode(['error', `RemAcc could not load the connection: ${e.message}`, '512']));
    wsConn.close(1011);
    return;
  }
  if ((protocol === 'web') !== (details.protocol === 'web')) {
    err(`WS ${protocol} id=${id}: connection protocol is ${details.protocol}`);
    wsConn.send(guacEncode(['error', 'Wrong connection type', '768']));
    wsConn.close(1008);
    return;
  }
  // Resume this user's parked session, only after the connect API authorised them
  const key = `${protocol}:${id}:${details.user}`;
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
      const grace = await getSessionGrace(req);
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

  log(`WS ${protocol} id=${id}: user=${details.user} target=${protocol === 'web' ? details.host : `${details.host}:${details.port}`}`);

  const proto = await getProtoSettings(req);
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
  } else if (protocol === 'web') {
    // cursor 'local': x11vnc sends the browser's cursor shapes (pointer, hand, text)
    base = { ...VNC_DEFAULTS, 'color-depth': '24', cursor: 'local' };
  } else {
    const s = proto?.vnc ?? {};
    base = {
      ...VNC_DEFAULTS,
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
  // The browser's tunnel gives up after 15 s without data ("Server timeout"); relay startup and
  // monitor setup can take longer, so keep it alive until guacd streams
  const startupKeepalive = setInterval(() => { if (wsConn.readyState === 1) wsConn.send(guacEncode(['nop'])); }, 5000);
  wsConn.once('close', () => clearInterval(startupKeepalive));
  if (protocol === 'vnc' && details.options?.dsmPlugin) {
    // A socket that already closed must not start a relay
    if (wsConn.readyState !== 1) return;
    const start = () => startDsmProxy(id, details.host, parseInt(guacPort) || 5900, details.credential?.username ?? '', details.credential?.password ?? '');
    try {
      try { dsm = await start(); }
      catch (e) {
        // The UltraVNC server can drop a viewer that connects while it rebuilds its desktop (e.g.
        // another user's session just switched screens): one retry instead of an error
        if (!/viewer exited before/.test(e.message) || wsConn.readyState !== 1) throw e;
        log(`WS VNC id=${id}: ${e.message}, retrying once`);
        await sleep(2000);
        if (wsConn.readyState !== 1) return;
        dsm = await start();
      }
    } catch (e) {
      err(`WS VNC id=${id}: DSM proxy failed: ${e.message}`);
      if (wsConn.readyState === 1) wsConn.send(guacEncode(['error', 'DSM proxy error: ' + e.message, '514']));
      try { wsConn.close(1011); } catch {}
      return;
    }
    // The browser may have left (e.g. page reload) while the relay was starting
    if (wsConn.readyState !== 1) { dsm.stop(); return; }
    wsConn.once('close', dsm.stop);
    dsm.onStop = () => { try { wsConn.close(); } catch {} }; // the relay ended (e.g. the viewer exited)
    guacHost = '127.0.0.1';
    guacPort = String(dsm.port);
    base.cursor = 'local'; // the relay paints no cursor; 'remote' would add guacd's position dot
    log(`WS VNC id=${id}: using DSM proxy on 127.0.0.1:${dsm.port}`);
  }
  let web = null;
  if (protocol === 'web') {
    if (wsConn.readyState !== 1) return;
    const { width, height } = webSize(req);
    try {
      web = await startWebBrowser(id, webUrl(details.host), details.credential?.username ?? '', details.credential?.password ?? '', width, height);
    } catch (e) {
      err(`WS WEB id=${id}: browser failed: ${e.message}`);
      if (wsConn.readyState === 1) wsConn.send(guacEncode(['error', 'Browser error: ' + e.message, '514']));
      try { wsConn.close(1011); } catch {}
      return;
    }
    if (wsConn.readyState !== 1) { web.stop(); return; }
    wsConn.once('close', web.stop);
    web.onStop = () => { try { wsConn.close(); } catch {} };
    guacHost = '127.0.0.1';
    guacPort = String(web.port);
    base.width = String(width);
    base.height = String(height);
  }

  const shadow = details.options?.shadow ?? {};
  const params = {
    ...base,
    hostname: guacHost,
    port: guacPort,
    // Web credentials go to the browser (auto sign-in), never to guacd/x11vnc
    username: web ? '' : details.credential?.username ?? '',
    password: web ? '' : details.credential?.password ?? '',
    ...(details.credential?.domain && !web ? { domain: details.credential.domain } : {}),
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

      if (opcode === 'error') {
        // Also during the handshake (before `ready`), so the user sees why guacd gave up
        err(`WS ${protocol} id=${id} user=${details.user}: guacd error ${parts[2]}: ${parts[1]}`);
        if (wsConn.readyState === 1) wsConn.send(instr);
      } else if (opcode === 'args') {
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
        clearInterval(startupKeepalive);
        streaming = true;
        if (wsConn.readyState === 1) wsConn.send(instr);
      } else if (streaming) {
        // What the browser actually gets: its 1 | 2 | All bar follows this size
        if (dsm && opcode === 'size' && parts[1] === '0' && dsm.browserSize !== `${parts[2]}x${parts[3]}`) {
          dsm.browserSize = `${parts[2]}x${parts[3]}`;
          log(`DSM id=${id}: browser display now ${dsm.browserSize}`);
        }
        if (opcode === 'sync') diag?.frameSent(parts[1]);
        else if (opcode === 'img') diag?.imageSent();
        if (wsConn.readyState === 1) wsConn.send(instr);
      }
    }
  });

  tcp.on('close', () => {
    if (wsConn.readyState === 1) log(`WS ${protocol} id=${id} user=${details.user}: guacd closed the connection${streaming ? '' : ' during the handshake'}`);
    try { wsConn.close(); } catch {}
  });

  wsConn.on('message', data => {
    if (!streaming) return;
    const str = data.toString();
    try {
      const p = guacParse(str);
      if (p[0] === 'size' && (p[1] === '0' || p[2] === '0')) return;
      if (web && p[0] === 'size') { web.resize(p[1], p[2]); return; }
      if (p[0] === 'sync') diag?.frameAcked(p[1]);
      else diag?.input(p);
    } catch {}
    tcp.write(str);
  });
  wsConn.on('close', async () => {
    if (!streaming) { try { tcp.destroy(); } catch {} return; }
    const grace = await getSessionGrace(req);
    if (grace > 0 && !tcp.destroyed && !dsm && !web) {
      tcp.removeAllListeners('data');
      tcp.on('data', () => {}); // drain silently while parked
      storePendingSession(key, grace, { tcp, params }, s => { try { s.tcp.destroy(); } catch {} });
    } else {
      try { tcp.destroy(); } catch {}
    }
  });

  tcp.connect(4822, '127.0.0.1', () => {
    log(`WS ${protocol} id=${id}: connected to guacd`);
    tcp.write(guacEncode(['select', web ? 'vnc' : protocol]));
  });
}

// ---------------------------------------------------------------------------
// SSH WebSocket proxy
// ---------------------------------------------------------------------------
// Browser terminal size at connect, so the remote shell starts at the right size
function termSize(req) {
  const q = new URL(req.url ?? '/', 'http://x').searchParams;
  const clamp = (v, lo, hi, d) => Math.min(hi, Math.max(lo, Math.round(Number(v)) || d));
  return { cols: clamp(q.get('cols'), 20, 1000, 80), rows: clamp(q.get('rows'), 5, 500, 24) };
}

async function handleSSH(wsConn, req, id) {
  log(`WS SSH connection id=${id}`);

  // The browser may resize before the shell exists; keep its latest size
  const size = termSize(req);
  const earlyResize = raw => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'resize' && msg.cols > 0 && msg.rows > 0) { size.cols = msg.cols; size.rows = msg.rows; }
    } catch {}
  };
  wsConn.on('message', earlyResize);

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

    // Resume this user's parked session, only after the connect API authorised them
    const key = `ssh:${id}:${details.user}`;
    const pending = pendingSessions.get(key);
    if (pending && Date.now() < pending.expires) {
      pendingSessions.delete(key);
      wsConn.off('message', earlyResize);
      log(`WS SSH id=${id}: resuming parked session`);
      const session = pending.session;
      session.resize(size.rows, size.cols);
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
        const grace = await getSessionGrace(req);
        if (grace > 0) {
          storePendingSession(key, grace, { session }, s => s.session.destroy());
        } else {
          session.destroy();
        }
      });
      return;
    }

    if (!details.credential) {
      wsConn.send('\r\n\x1b[31mNo credentials configured for this connection\x1b[0m\r\n');
      wsConn.close(1008);
      return;
    }

    const ssh = new SSHClient();
    ssh.on('ready', () => {
      log(`WS SSH id=${id}: SSH ready`);
      ssh.shell({ term: 'xterm-256color', cols: size.cols, rows: size.rows }, (e, stream) => {
        wsConn.off('message', earlyResize);
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
          const grace = await getSessionGrace(req);
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
    const sshProto = (await getProtoSettings(req))?.ssh ?? {};
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
    const mWeb = path.match(/^\/ws\/web\/(\d+)$/);
    if (mSsh) wss.handleUpgrade(req, socket, head, ws => handleSSH(ws, req, parseInt(mSsh[1], 10)));
    else if (mRdp) wss.handleUpgrade(req, socket, head, ws => handleGuac(ws, req, parseInt(mRdp[1], 10), 'rdp'));
    else if (mVnc) wss.handleUpgrade(req, socket, head, ws => handleGuac(ws, req, parseInt(mVnc[1], 10), 'vnc'));
    else if (mWeb) wss.handleUpgrade(req, socket, head, ws => handleGuac(ws, req, parseInt(mWeb[1], 10), 'web'));
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
