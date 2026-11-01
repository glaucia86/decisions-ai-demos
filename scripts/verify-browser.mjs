import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const reserve = createServer();
reserve.listen(0, '127.0.0.1');
await once(reserve, 'listening');
const port = reserve.address().port;
await new Promise(resolve => reserve.close(resolve));
const base = `http://127.0.0.1:${port}`;
const env = { ...process.env, MESA_LIVE_ENABLED: 'false', OPENAI_API_KEY: '', MESA_LIVE_ACCESS_TOKEN: '', NEXT_TELEMETRY_DISABLED: '1', DEMO_BASE_URL: base, TRIAGE_BASE_URL: base };
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let serverLog = '';
server.stdout.on('data', c => { serverLog += c; });
server.stderr.on('data', c => { serverLog += c; });
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw Error(serverLog);
    try { if ((await fetch(base)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw Error('Local server did not become ready: ' + serverLog);
  for (const args of [['tests/browser.mjs'], ['--test', 'tests/triage-browser.mjs'], ['scripts/record-mock.mjs']]) {
    const child = spawn(process.execPath, args, { env, stdio: 'inherit', windowsHide: true });
    const [code] = await once(child, 'exit');
    if (code !== 0) throw Error(`${args.join(' ')} exited ${code}`);
  }
} finally {
  if (server.exitCode === null) { server.kill(); await once(server, 'exit'); }
}
