'use strict';
process.env.NODE_ENV = 'production';
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');
const { WebSocketServer } = require('ws');
const { Client: SSHClient } = require('ssh2');

const hostname = process.env.HOSTNAME ?? '0.0.0.0';
const port = parseInt(process.env.PORT ?? '8020', 10);

// ---------------------------------------------------------------------------
// Start guacd for in-browser RDP/VNC support
// ---------------------------------------------------------------------------
function startGuacd() {
  const guacd = spawn('guacd', ['-f', '-b', '127.0.0.1', '-l', '4822', '-L', 'error'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  guacd.stdout?.on('data', d => process.stdout.write('[guacd] ' + d));
  guacd.stderr?.on('data', d => process.stderr.write('[guacd] ' + d));
  guacd.on('error', err => {
    if (err.code === 'ENOENT') console.log('guacd not found; RDP/VNC unavailable');
    else console.error('[guacd] error:', err.message);
  });
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
  let details;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/connections/${id}/connect`, {
      headers: { cookie: req.headers.cookie ?? '' },
    });
    if (!res.ok) {
      wsConn.send(guacEncode(['error', 'Access denied', '0']));
      wsConn.close(1008);
      return;
    }
    details = await res.json();
  } catch (err) {
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

  // Wait for first browser message (guacamole-common-js connect handshake) then start guacd
  wsConn.once('message', () => {
    const tcp = new net.Socket();
    let buf = '';
    let streaming = false;

    tcp.on('error', err => {
      if (wsConn.readyState === 1) wsConn.send(guacEncode(['error', err.message, '514']));
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
          // Build connect instruction: map guacd's expected arg names to our values
          const values = parts.slice(1).map(name => params[name] ?? '');
          tcp.write(guacEncode(['connect', ...values]));
        } else if (opcode === 'ready') {
          streaming = true;
          if (wsConn.readyState === 1) wsConn.send(instr);
        } else if (streaming) {
          if (wsConn.readyState === 1) wsConn.send(instr);
        }
      }
    });

    tcp.on('close', () => { try { wsConn.close(); } catch {} });

    // Relay subsequent browser messages to guacd once streaming
    wsConn.on('message', data => {
      if (streaming) tcp.write(data.toString());
    });
    wsConn.on('close', () => tcp.destroy());

    // Connect to guacd and send SELECT
    tcp.connect(4822, '127.0.0.1', () => {
      tcp.write(guacEncode(['select', protocol]));
    });
  });

  wsConn.on('close', () => {}); // handled inside once('message')
}

// ---------------------------------------------------------------------------
// SSH WebSocket proxy
// ---------------------------------------------------------------------------
async function handleSSH(wsConn, req, id) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/connections/${id}/connect`, {
      headers: { cookie: req.headers.cookie ?? '' },
    });
    if (!res.ok) {
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
      ssh.shell({ term: 'xterm-256color', cols: 80, rows: 24 }, (err, stream) => {
        if (err) { wsConn.close(1011); return; }
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
    ssh.on('error', err => {
      if (wsConn.readyState === 1) wsConn.send(`\r\n\x1b[31mSSH error: ${err.message}\x1b[0m\r\n`);
      try { wsConn.close(1011); } catch {}
    });
    ssh.connect({
      host: details.host, port: details.port,
      username: details.credential.username, password: details.credential.password,
      readyTimeout: 15000, keepaliveInterval: 15000,
    });
  } catch (err) {
    if (wsConn.readyState === 1) wsConn.send(`\r\n\x1b[31mError: ${err.message}\x1b[0m\r\n`);
    try { wsConn.close(1011); } catch {}
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  startGuacd();

  const NextServer = require('./node_modules/next/dist/server/next-server').default;
  const conf = require('./.next/required-server-files.json');
  const app = new NextServer({
    dir: __dirname, port, hostname, customServer: true,
    conf: conf.config, minimalMode: true,
  });
  const nextHandler = app.getRequestHandler();

  const server = http.createServer(async (req, res) => {
    try { await nextHandler(req, res); }
    catch (err) { if (!res.headersSent) { res.statusCode = 500; res.end('Internal Server Error'); } }
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const url = req.url ?? '';
    const mSsh = url.match(/^\/ws\/ssh\/(\d+)$/);
    const mRdp = url.match(/^\/ws\/rdp\/(\d+)$/);
    const mVnc = url.match(/^\/ws\/vnc\/(\d+)$/);
    if (mSsh) wss.handleUpgrade(req, socket, head, ws => handleSSH(ws, req, parseInt(mSsh[1], 10)));
    else if (mRdp) wss.handleUpgrade(req, socket, head, ws => handleGuac(ws, req, parseInt(mRdp[1], 10), 'rdp'));
    else if (mVnc) wss.handleUpgrade(req, socket, head, ws => handleGuac(ws, req, parseInt(mVnc[1], 10), 'vnc'));
    else socket.destroy();
  });

  server.listen(port, hostname, () => console.log(`> Ready on http://${hostname}:${port}`));
}

main().catch(err => { console.error(err); process.exit(1); });
