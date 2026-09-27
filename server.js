'use strict';
process.env.NODE_ENV = 'production';
const http = require('http');
const { WebSocketServer } = require('ws');
const { Client: SSHClient } = require('ssh2');

const hostname = process.env.HOSTNAME ?? '0.0.0.0';
const port = parseInt(process.env.PORT ?? '8020', 10);

async function main() {
  const NextServer = require('./node_modules/next/dist/server/next-server').default;
  const conf = require('./.next/required-server-files.json');
  const app = new NextServer({
    dir: __dirname,
    port,
    hostname,
    customServer: true,
    conf: conf.config,
    minimalMode: true,
  });
  const nextHandler = app.getRequestHandler();

  const server = http.createServer(async (req, res) => {
    try { await nextHandler(req, res); }
    catch (err) { if (!res.headersSent) { res.statusCode = 500; res.end('Internal Server Error'); } }
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const m = req.url && req.url.match(/^\/ws\/ssh\/(\d+)$/);
    if (m) wss.handleUpgrade(req, socket, head, ws => handleSSH(ws, req, parseInt(m[1], 10)));
    else socket.destroy();
  });

  server.listen(port, hostname, () => console.log(`> Ready on http://${hostname}:${port}`));
}

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
      host: details.host,
      port: details.port,
      username: details.credential.username,
      password: details.credential.password,
      readyTimeout: 15000,
      keepaliveInterval: 15000,
    });
  } catch (err) {
    if (wsConn.readyState === 1) wsConn.send(`\r\n\x1b[31mError: ${err.message}\x1b[0m\r\n`);
    try { wsConn.close(1011); } catch {}
  }
}

main().catch(err => { console.error(err); process.exit(1); });
