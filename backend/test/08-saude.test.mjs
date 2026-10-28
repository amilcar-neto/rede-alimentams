import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { call } from './helpers.mjs';

const raiz = (caminho) => fileURLToPath(new URL('../../' + caminho, import.meta.url));
const ler = (caminho) => readFile(raiz(caminho), 'utf8');

// Serviços do compose (YAML simples, 2 espaços): nome -> linhas do bloco.
function servicos(texto) {
  const blocos = {};
  let atual = null;
  let dentro = false;
  for (const linha of texto.split(/\r?\n/)) {
    if (/^services:\s*$/.test(linha)) { dentro = true; continue; }
    if (dentro && /^\S/.test(linha)) dentro = false;
    if (!dentro) continue;
    const nome = linha.match(/^ {2}([\w-]+):\s*$/);
    if (nome) { atual = nome[1]; blocos[atual] = []; } else if (atual) blocos[atual].push(linha);
  }
  return blocos;
}
function portasPublicadas(linhas) {
  const portas = [];
  let emPortas = false;
  for (const linha of linhas) {
    if (/^ {4}ports:\s*$/.test(linha)) { emPortas = true; continue; }
    if (emPortas && /^ {6}-\s*/.test(linha)) portas.push(linha.replace(/^ {6}-\s*/, '').replace(/["']/g, '').trim());
    else if (emPortas && !/^\s*(#.*)?$/.test(linha)) emPortas = false;
  }
  return portas;
}

test('GET /saude é público e responde { ok, banco }', async () => {
  const r = await call('GET', '/saude');
  assert.equal(r.s, 200);
  assert.deepEqual(r.d, { ok: true, banco: true });
});

test('GET /saude devolve 503 sem detalhes quando o banco está indisponível', async () => {
  const porta = '3101';
  const servidor = spawn(process.execPath, ['src/server.js'], {
    cwd: raiz('backend'),
    env: { ...process.env, PORT: porta, NODE_ENV: 'test', JWT_SECRET: 'segredo-ficticio-exclusivo-dos-testes',
      DATABASE_URL: 'postgres://ninguem:ninguem@127.0.0.1:1/inexistente' },
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  try {
    await new Promise((resolve, reject) => {
      const prazo = setTimeout(() => reject(new Error('Servidor sem banco não iniciou.')), 10000);
      servidor.stdout.on('data', (c) => { if (c.toString().includes('rodando')) { clearTimeout(prazo); resolve(); } });
      servidor.once('exit', () => { clearTimeout(prazo); reject(new Error('Servidor sem banco encerrou.')); });
    });
    const resposta = await fetch(`http://127.0.0.1:${porta}/saude`, { signal: AbortSignal.timeout(10000) });
    assert.equal(resposta.status, 503);
    assert.deepEqual(await resposta.json(), { ok: false, banco: false });
  } finally {
    servidor.kill();
    if (servidor.exitCode === null && servidor.signalCode === null) await once(servidor, 'exit');
  }
});

test('Respostas trazem cabeçalhos de segurança, sem CSP de script', async () => {
  for (const url of ['/saude', '/', '/lotes']) {
    const resposta = await fetch('http://127.0.0.1:3100' + url, { signal: AbortSignal.timeout(10000) });
    assert.equal(resposta.headers.get('x-content-type-options'), 'nosniff', url);
    assert.equal(resposta.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', url);
    assert.equal(resposta.headers.get('x-frame-options'), 'DENY', url);
    assert.equal(resposta.headers.get('content-security-policy'), null, url);
  }
});

test('docker-compose.prod.yml: db, app e caddy; só o Caddy publica 80/443', async () => {
  const texto = await ler('docker-compose.prod.yml');
  const blocos = servicos(texto);
  assert.deepEqual(Object.keys(blocos).sort(), ['app', 'caddy', 'db']);
  assert.doesNotMatch(texto, /(^|[^\d])5432:/m, 'porta 5432 não pode ser publicada');
  assert.doesNotMatch(texto, /(^|[^\d])3000:\d/m, 'porta 3000 não pode ser publicada');
  assert.deepEqual(portasPublicadas(blocos.db), []);
  assert.deepEqual(portasPublicadas(blocos.app), []);
  const caddy = portasPublicadas(blocos.caddy);
  assert.ok(caddy.includes('80:80') && caddy.includes('443:443'), 'Caddy publica 80 e 443');
  for (const p of caddy) assert.match(p, /^(80:80|443:443(\/udp)?)$/, 'porta inesperada no Caddy: ' + p);
  for (const nome of ['db', 'app', 'caddy'])
    assert.ok(blocos[nome].some((l) => /^ {4}restart: unless-stopped\s*$/.test(l)), nome + ' sem restart: unless-stopped');
  assert.match(texto, /^volumes:\s*\n\s+pgdata:/m, 'volume persistente do banco');
  assert.match(texto, /pgdata:\/var\/lib\/postgresql\/data/);
  // Configuração vem do .env: nenhum valor literal de credencial no compose.
  for (const v of ['POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB', 'JWT_SECRET', 'DOMINIO'])
    assert.match(texto, new RegExp('\\$\\{' + v + '\\}'), v + ' deve vir do .env');
  assert.match(texto, /NODE_ENV: production/);
});

test('Caddyfile usa {$DOMINIO}, proxy para app:3000 e compressão', async () => {
  const texto = await ler('deploy/Caddyfile');
  assert.match(texto, /^\{\$DOMINIO\}\s*\{/m);
  assert.match(texto, /reverse_proxy app:3000/);
  assert.match(texto, /encode\b/);
});

test('.env.example só tem placeholders e o .env real é ignorado pelo Git', async () => {
  const texto = await ler('.env.example');
  const valores = Object.fromEntries(texto.split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  assert.deepEqual(Object.keys(valores).sort(), ['DOMINIO', 'JWT_SECRET', 'POSTGRES_DB', 'POSTGRES_PASSWORD', 'POSTGRES_USER']);
  assert.match(valores.POSTGRES_PASSWORD, /^troque-/);
  assert.match(valores.JWT_SECRET, /^troque-/);
  assert.match(valores.DOMINIO, /exemplo\.com\.br$/);
  const ignorado = await ler('.gitignore');
  assert.match(ignorado, /^\.env$/m);
});

test('docs/DEPLOY.md cobre os passos de implantação e a seção de Redes', async () => {
  const texto = await ler('docs/DEPLOY.md');
  for (const trecho of ['O que isto tem de Redes', 'DNS', 'tipo A', '22', '80', '443', 'TLS 1.3', 'proxy reverso',
    'Upgrade', 'docker compose -f docker-compose.prod.yml', 'logs', 'pg_dump', '/saude'])
    assert.ok(texto.toLowerCase().includes(trecho.toLowerCase()), 'DEPLOY.md sem: ' + trecho);
});
