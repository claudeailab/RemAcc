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
  hostname: '', port: '3389', domain: '', username: '', password: '',
  width: '1280', height: '800', dpi: '96',
  'ignore-cert': 'true', security: 'any',
  'enable-wallpaper': 'false', 'enable-theming': 'false',
  'enable-font-smoothing': 'true', 'enable-desktop-composition': 'false',
  'enable-menu-animations': 'false',
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

  const base = protocol === 'rdp' ? RDP_DEFAULTS : VNC_DEFAULTS;
  const params = {
    ...base,
    hostname: details.host,
    port: String(details.port),
    username: details.credential?.username ?? '',
    password: details.credential?.password ?? '',
    ...(details.credential?.domain ? { domain: details.credential.domain } : {}),
  };

  wsConn.once('message', () => {
    const tcp = new net.Socket();
    let buf = '';
    let streaming = false;

    tcp.on('error', e => {
      err(`WS ${protocol} id=${id}: guacd TCP error: ${e.message}`);
      if (wsConn.readyState === 1) wsConn.send(guacEncode(['error', e.message, '514']));
      try { wsConn.close(1011); } catch {}
    });

    tcp.on('data', chunk => {
      buf += chunk.toString();
      let semi;
      while ((semi = buf.indexOf(';')) !== -1) {
        const instr = buf.slice(0, semi + 1);
        buf = buf.slice(semi + 1);
        const parts = guacParse(instr);
        const opcode = parts[0];

        if (opcode === 'args') {
          const values = parts.slice(1).map(name => params[name] ?? '');
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
      if (streaming) tcp.write(data.toString());
    });
    wsConn.on('close', () => tcp.destroy());

    tcp.connect(4822, '127.0.0.1', () => {
      log(`WS ${protocol} id=${id}: connected to guacd`);
      tcp.write(guacEncode(['select', protocol]));
    });
  });

  wsConn.on('close', () => {});
}

// ---------------------------------------------------------------------------
// SSH WebSocket proxy
// ---------------------------------------------------------------------------
async function handleSSH(wsConn, req, id) {
  log(`WS SSH connection id=${id}`);
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
        stream.on('data', data => { if (wsConn.readyState === 1) wsConn.send(data); });
        stream.stderr.on('data', data => { if (wsConn.readyState === 1) wsConn.send(data); });
        stream.on('close', () => { try { wsConn.close(); } catch {} });
        wsConn.on('message', raw => {
          try {
            const msg = JSON.parse(raw.toString());
            if (msg.type === 'data') stream.write(msg.data);
            else if (msg.type === 'resize') stream.setWindow(msg.rows, msg.cols, 0, 0);
          } catch {}
        });
        wsConn.on('close', () => { try { stream.end(); ssh.end(); } catch {} });
      });
    });
    ssh.on('error', e => {
      err(`WS SSH id=${id}: ${e.message}`);
      if (wsConn.readyState === 1) wsConn.send(`\r\n\x1b[31mSSH error: ${e.message}\x1b[0m\r\n`);
      try { wsConn.close(1011); } catch {}
    });
    ssh.connect({
      host: details.host, port: details.port,
      username: details.credential.username, password: details.credential.password,
      readyTimeout: 15000, keepaliveInterval: 15000,
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

  const server = http.createServer(async (req, res) => {
    const start = Date.now();
    try {
      await nextHandler(req, res);
    } catch (e) {
      err(`Request ${req.method} ${req.url} error: ${e.stack ?? e}`);
      if (!res.headersSent) { res.statusCode = 500; res.end('Internal Server Error'); }
    } finally {
      if (req.url !== '/api/health') {
        log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - start}ms`);
      }
    }
  });

  const { WebSocketServer } = require('ws');
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const url = req.url ?? '';
    log(`WS upgrade: ${url}`);
    const mSsh = url.match(/^\/ws\/ssh\/(\d+)$/);
    const mRdp = url.match(/^\/ws\/rdp\/(\d+)$/);
    const mVnc = url.match(/^\/ws\/vnc\/(\d+)$/);
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
