// Fora de npm test. Banco local exclusivo validado antes de qualquer conexão/reset.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resetDatabase, testConnection, testClient } from './reset-db.mjs';

const backend = fileURLToPath(new URL('../', import.meta.url));
const base = 'http://127.0.0.1:3101';
const resultados = [];
let server, db, falha = false, fase = 'preparação', listening = false;
const inicio = new Date().toISOString();
const pausa = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const local = (ms) => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Campo_Grande', year: 'numeric',
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(Date.now() + ms));
  const v = (t) => p.find((x) => x.type === t).value;
  return `${v('year')}-${v('month')}-${v('day')}T${v('hour')}:${v('minute')}`;
};
async function api(method, path, token, body) {
  const response = await fetch(base + path, { method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  return { status: response.status, data: await response.json() };
}
async function login(email) {
  const r = await api('POST', '/auth/login', null, { email, senha: '123456' });
  assert.equal(r.status, 200, 'Login sintético');
  assert.ok(r.data.token);
  return r.data.token;
}
async function onda(n, tipo, executar) {
  const inicioOnda = performance.now();
  // Todas as operações são disparadas antes de aguardar qualquer resposta.
  const respostas = await Promise.all(Array.from({ length: n }, async (_, i) => {
    const t = performance.now();
    try { return { ...await executar(i), ms: performance.now() - t, i }; }
    catch { return { status: 'rede/timeout/JSON', ms: performance.now() - t, i }; }
  }));
  const tempos = respostas.map((r) => r.ms).sort((a, b) => a - b);
  const contagem = {};
  for (const r of respostas) contagem[r.status] = (contagem[r.status] || 0) + 1;
  const erros = respostas.filter((r) => r.status !== 200 && !(tipo === 'reserva' && r.status === 409)).length;
  const linha = { n, tipo, media: tempos.reduce((a, b) => a + b, 0) / n,
    p95: tempos[Math.ceil(n * .95) - 1], duracao: performance.now() - inicioOnda, contagem, erros };
  resultados.push(linha);
  return { linha, respostas };
}
async function encerrar() {
  if (server && server.exitCode === null && server.signalCode === null) {
    const fim = once(server, 'exit');
    server.kill();
    const limite = setTimeout(() => server.kill('SIGKILL'), 2000);
    try { await fim; } finally { clearTimeout(limite); }
  }
  if (db) { await db.end(); db = null; }
}
for (const sinal of ['SIGINT', 'SIGTERM']) process.on(sinal, async () => { await encerrar(); process.exit(1); });

try {
  const { connectionString } = testConnection();
  // Não utilizar servidor preexistente nem enviar carga para um endereço configurável.
  const porta = net.createServer();
  await new Promise((resolve, reject) => {
    porta.once('error', () => reject(new Error('Porta 3101 ocupada; carga recusada.')));
    porta.listen(3101, '127.0.0.1', resolve);
  });
  await new Promise((resolve) => porta.close(resolve));
  const env = { ...process.env, NODE_ENV: 'test', PORT: '3101', DATABASE_URL: connectionString,
    TEST_DATABASE_URL: connectionString, JWT_SECRET: 'segredo-ficticio-exclusivo-da-carga' };
  fase = 'reset do banco exclusivo';
  await resetDatabase(env);
  fase = 'prontidão do servidor filho';
  server = spawn(process.execPath, ['src/server.js'], { cwd: backend, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let erroServidor = false;
  server.on('error', () => { erroServidor = true; });
  server.stdout.on('data', (c) => { if (c.toString().includes('Rede AlimentaMS rodando')) listening = true; });
  // Consumir stderr sem imprimir dados de ambiente/credenciais.
  let stderrBytes = 0;
  server.stderr.on('data', (c) => { stderrBytes += c.length; });
  const prazo = Date.now() + 10000;
  let pronto = false;
  while (Date.now() < prazo) {
    if (erroServidor || server.exitCode !== null || server.signalCode !== null) throw new Error('Servidor filho encerrou.');
    if (listening) {
      try { pronto = (await api('GET', '/bairros')).status === 200; } catch { /* dentro do prazo */ }
      if (pronto) break;
    }
    await pausa(100);
  }
  assert.ok(pronto, 'Servidor pronto em 10 s');
  db = testClient(connectionString);
  await db.connect();
  const comper = await login('comper@demo.com');
  const ongs = [await login('esperanca@demo.com'), await login('amambai@demo.com')];
  for (const n of [20, 200]) {
    fase = `busca ${n}`;
    const busca = await onda(n, 'busca', (i) => api('GET', '/lotes', ongs[i % 2]));
    assert.equal(busca.linha.erros, 0, 'Todas as buscas devem retornar 200');
    fase = `publicação para reserva ${n}`;
    const criado = await api('POST', '/lotes', comper, { alimento: `Frutas sintéticas carga ${n}`, categoria: 'Hortifrúti',
      quantidade_kg: 50, validade: local(2 * 86400000).slice(0, 10), retirada_ate: local(4 * 3600000) });
    assert.equal(criado.status, 201);
    const id = criado.data.id;
    const janela = { janela_inicio: local(60000), janela_fim: local(3600000) };
    fase = `reserva ${n}`;
    const reserva = await onda(n, 'reserva', (i) => api('PUT', `/lotes/${id}/reservar`, ongs[i % 2], janela));
    const estado = (await db.query(`SELECT l.status, l.reservado_por,
      (SELECT count(*)::int FROM eventos_lote WHERE lote_id=l.id AND tipo='reservado') AS eventos,
      (SELECT count(*)::int FROM notificacoes WHERE lote_id=l.id AND tipo='lote_reservado') AS avisos
      FROM lotes l WHERE l.id=$1`, [id])).rows[0];
    const vencedoras = reserva.respostas.filter((r) => r.status === 200);
    reserva.linha.unica = vencedoras.length === 1 && reserva.linha.contagem[409] === n - 1
      && estado.status === 'reservado' && estado.eventos === 1 && estado.avisos === 1;
    if (vencedoras.length === 1) {
      const email = vencedoras[0].i % 2 === 0 ? 'esperanca@demo.com' : 'amambai@demo.com';
      const usuario = (await db.query('SELECT id FROM usuarios WHERE email=$1', [email])).rows[0];
      reserva.linha.unica &&= estado.reservado_por === usuario.id;
    }
    assert.equal(reserva.linha.erros, 0);
    assert.ok(reserva.linha.unica, 'Exatamente 1 reserva venceu, com 1 evento e 1 notificação ao doador');
  }
  assert.equal(server.exitCode, null, 'Servidor permanece ativo');
  assert.equal(stderrBytes, 0, 'Sem erros no stderr do servidor');
} catch (error) {
  falha = true;
  console.error(`Carga falhou na fase ${fase}: ${error.code || error.message}`);
  process.exitCode = 1;
} finally {
  await encerrar();
}

const f = (n) => n.toFixed(2);
const texto = `# Resultado de carga local — L08-complemento

Gerado por \`node test/carga.mjs\` em ${inicio} (UTC).
Resultado: **${falha ? 'FALHOU' : 'PASSOU'}**. ${falha ? `Fase interrompida: ${fase}.` : 'Servidor filho e conexão ao banco encerrados.'}

## Ambiente e método

- Node ${process.version}; ${os.platform()} ${os.release()} ${os.arch()}; ${os.availableParallelism()} CPUs disponíveis.
- Express/PostgreSQL/PostGIS locais, banco exclusivo permitido por \`testConnection()\`, recriado de \`db/init.sql\`. Sem VPS e sem dados reais.
- Servidor filho próprio em 127.0.0.1:3101, sem servidor preexistente; execução isolada, sem npm test simultâneo.
- Para cada N: N buscas GET /lotes; depois N PUT de reserva disputam um novo lote de 50 kg. Duas contas sintéticas próximas alternadas. Total previsto: 440 requisições medidas.
- Logins, publicação e consultas SQL ficam fora da medição. As ondas são sequenciais; dentro de cada onda, Promise.all dispara todas as requisições sem aguardar respostas anteriores.
- Latência por requisição inclui HTTP e leitura/parse do JSON; média aritmética e p95 pelo posto ceil(0,95 × N). Duração é o tempo total da onda. Sem aquecimento dedicado ou repetição estatística.
- HTTP 409 na disputa é conflito esperado, separado de erros inesperados (outros status, falha de rede/timeout/JSON). Prazo por requisição: 30 s.

## Medições reais

| Operação | Simultâneas | Média (ms) | p95 (ms) | Onda (ms) | Status | Erros inesperados | 1 reserva venceu |
|---|---:|---:|---:|---:|---|---:|---|
${resultados.map((r) => `| ${r.tipo} | ${r.n} | ${f(r.media)} | ${f(r.p95)} | ${f(r.duracao)} | ${JSON.stringify(r.contagem)} | ${r.erros} | ${r.tipo === 'reserva' ? r.unica ? 'sim' : 'não' : 'não se aplica'} |`).join('\n')}

Unicidade conferida também no PostgreSQL: status reservado, receptora igual à conta da requisição vencedora, exatamente um evento reservado e uma notificação de reserva ao doador por lote medido.

## Limites e reprodução

Em backend/, com TEST_DATABASE_URL para banco local alimentams_test (ou sufixo permitido), executar \`node test/carga.mjs\`. O comando **recria integralmente esse banco descartável** e sobrescreve este relatório; não executar junto com npm test ou demonstração no mesmo banco. Recusa desenvolvimento/produção antes de conectar. Não lê .env.

São requisições concorrentes do mesmo cliente/processo e máquina, com dois usuários, sem conexões WebSocket abertas. Não representam 200 usuários/dispositivos independentes, distribuição pela rede, capacidade do VPS ou garantia de SLA. O campo “1 reserva venceu” significa uma requisição ganhadora; não é expiração de janela. QR pelo celular, prints, HTTPS/rede externa e ensaio humano permanecem pendentes nos roteiros.\n`;
await writeFile(new URL('../../docs/testes/resultado-carga.md', import.meta.url), texto, 'utf8');
console.log(`Relatório de carga salvo; resultado ${falha ? 'FALHOU' : 'PASSOU'}.`);
