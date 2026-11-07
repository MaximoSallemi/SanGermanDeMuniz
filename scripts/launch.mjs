import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 4310);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('PORT debe ser un puerto entre 1024 y 65535.');
const url = `http://127.0.0.1:${port}`;
function openBrowser() {
  const command =
    process.platform === 'win32'
      ? 'explorer.exe'
      : process.platform === 'darwin'
        ? 'open'
        : 'xdg-open';
  const browser = spawn(command, [url], { windowsHide: true, stdio: 'ignore' });
  browser.on('error', () => console.log(`Abrí ${url} en el navegador.`));
}
let existing = false;
try {
  const r = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1000) });
  existing = (await r.json()).application === 'san-german';
} catch {}
if (existing) {
  console.log(`La aplicación ya está iniciada en ${url}`);
  openBrowser();
} else {
  const server = spawn(process.execPath, [resolve(root, 'build/server/index.js')], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  });
  let exited = false;
  let ready = false;
  server.on('exit', (code) => {
    exited = true;
    process.exitCode = code ?? 0;
  });
  server.on('error', (error) => {
    console.error(error.message);
    exited = true;
    process.exitCode = 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
  for (let attempt = 0; attempt < 60 && !exited; attempt++) {
    await wait(300);
    try {
      const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1000) });
      if ((await response.json()).application === 'san-german') {
        ready = true;
        openBrowser();
        break;
      }
    } catch {}
  }
  if (!ready && !exited) {
    console.error('El servidor no respondió a tiempo. Revisá los mensajes de esta ventana.');
    server.kill();
    process.exitCode = 1;
  }
}
