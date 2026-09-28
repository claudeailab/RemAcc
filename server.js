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
  const guacd = spawn('guacd', ['-f', '-b', '127.0.0.1', '-l', '4822', '-L', 'debug'], {
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
  const params = {
    ...base,
    hostname: details.host,
    port: String(details.port),
    username: details.credential?.username ?? '',
    password: details.credential?.password ?? '',
    ...(details.credential?.domain ? { domain: details.credential.domain } : {}),
  };

  // Connect to guacd immediately — do not wait for first browser message.
  // The browser's guacamole client waits for `ready` and then streams;
  // all handshake (select → args → connect) is handled server-side.
  const tcp = new net.Socket();
  let buf = '';
  let streaming = false;

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
        if (wsConn.readyState === 1) wsConn.send(instr);
      }
    }
  });

  tcp.on('close', () => { try { wsConn.close(); } catch {} });

  wsConn.on('message', data => {
    if (!streaming) return;
    const str = data.toString();
    log(`WS ${protocol} id=${id}: ← browser: ${str.slice(0, 200)}`);
    try { const p = guacParse(str); if (p[0] === 'size' && (p[1] === '0' || p[2] === '0')) { log(`WS ${protocol} id=${id}: dropped 0x0 size`); return; } } catch {}
    tcp.write(str);
  });
  wsConn.on('close', async () => {
    if (!streaming) { try { tcp.destroy(); } catch {} return; }
    const grace = await getSessionGrace();
    if (grace > 0 && !tcp.destroyed) {
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
