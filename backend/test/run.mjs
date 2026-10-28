import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { once } from 'node:events';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { resetDatabase, testConnection } from './reset-db.mjs';

const backend = fileURLToPath(new URL('../', import.meta.url));
const children = new Set();
let stopping;
async function cleanup() {
  if (stopping) return stopping;
  stopping = Promise.all([...children].map(async (child) => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit');
    child.kill();
    const force = setTimeout(() => child.kill('SIGKILL'), 2000);
    try { await exited; } finally { clearTimeout(force); }
  }));
  return stopping;
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => { await cleanup(); process.exit(1); });
}
function launch(args, env, options = {}) {
  const child = spawn(process.execPath, args, { cwd: backend, env, stdio: 'inherit', ...options });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}
async function freePort() {
  const socket = net.createServer();
  await new Promise((resolve, reject) => {
    socket.once('error', () => reject(new Error('Porta 3100 ocupada; nenhum servidor existente será utilizado.')));
    socket.listen(3100, '127.0.0.1', resolve);
  });
  await new Promise((resolve) => socket.close(resolve));
}
async function ready(server, listening) {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    if (server.exitCode !== null || server.signalCode !== null) throw new Error('Servidor filho encerrou antes da prontidão.');
    if (listening()) {
      try {
        const response = await fetch('http://127.0.0.1:3100/bairros', { signal: AbortSignal.timeout(500) });
        if (response.ok && Array.isArray(await response.json())) return;
      } catch { /* prontidão ainda dentro do prazo */ }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Servidor filho não ficou pronto em 10 segundos.');
}

try {
  const { connectionString } = testConnection();
  const env = { ...process.env, NODE_ENV: 'test', PORT: '3100', DATABASE_URL: connectionString,
    TEST_DATABASE_URL: connectionString, JWT_SECRET: 'segredo-ficticio-exclusivo-dos-testes' };
  const files = (await readdir(new URL('./', import.meta.url))).filter((name) => name.endsWith('.test.mjs')).sort();
  if (!files.length) throw new Error('Nenhum arquivo *.test.mjs encontrado.');
  await freePort();
  await resetDatabase(env);
  let listening = false;
  const server = launch(['src/server.js'], env, { stdio: ['ignore', 'pipe', 'inherit'] });
  server.stdout.on('data', (chunk) => {
    process.stdout.write(chunk);
    if (chunk.toString().includes('Rede AlimentaMS rodando')) listening = true;
  });
  server.on('error', (error) => console.error('Falha ao iniciar servidor:', error.message));
  await ready(server, () => listening);
  // Sem isolamento por subprocesso: todos os processos iniciados ficam sob cleanup().
  const tests = launch(['--test', '--test-isolation=none', '--test-concurrency=1', '--test-timeout=60000', '--test-reporter=spec',
    ...files.map((name) => 'test/' + name)], env);
  const timeout = setTimeout(() => tests.kill('SIGKILL'), 90000);
  const serverDied = () => tests.kill();
  server.once('exit', serverDied);
  try {
    const [code] = await once(tests, 'exit');
    process.exitCode = code === 0 && server.exitCode === null && server.signalCode === null ? 0 : 1;
  } finally {
    clearTimeout(timeout);
    server.removeListener('exit', serverDied);
  }
} catch (error) {
  console.error(`Fundação de testes falhou: ${error.code || error.message}`);
  process.exitCode = 1;
} finally { await cleanup(); }
