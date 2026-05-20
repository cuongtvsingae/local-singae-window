const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

function isPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const onDone = (ok) => {
      try { socket.destroy(); } catch (_) {}
      resolve(ok);
    };
    socket.setTimeout(650);
    socket.once('error', () => onDone(false));
    socket.once('timeout', () => onDone(false));
    socket.connect(port, host, () => onDone(true));
  });
}

let child = null;

async function ensureItSupportChild() {
  const port = Number(process.env.IT_SUPPORT_CHILD_PORT || 1104);
  const already = await isPortOpen(port);
  if (already) return { started: false, port };
  if (child && !child.killed) return { started: false, port };

  const cwd = path.resolve(__dirname);
  // run: node src/server.js (the cloned app)
  child = spawn(process.execPath, ['src/server.js'], {
    cwd,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: process.env.IT_SUPPORT_CHILD_HOST || process.env.HOST || '127.0.0.1'
    },
    stdio: 'inherit',
    windowsHide: true
  });

  child.on('exit', () => {
    child = null;
  });

  return { started: true, port };
}

module.exports = {
  ensureItSupportChild
};

