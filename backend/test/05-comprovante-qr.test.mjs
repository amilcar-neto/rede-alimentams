import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { call, login, dia, janela, checklist } from './helpers.mjs';
import { testClient, testConnection } from './reset-db.mjs';

const require = createRequire(import.meta.url);
const QRCode = require('qrcode');
const comprovantes = require('../src/comprovante.js');
const { canonico, hashDe, baseURL, urlQR, paginaComprovante, paginaVerificacao } = comprovantes;
const db = testClient(testConnection().connectionString);
let comper, esp, sabor, amb, lote, codigo, doacao;
await db.connect();
after(() => db.end());
const raw = (path, token) => fetch('http://127.0.0.1:3100' + path, {
  headers: token ? { Authorization: 'Bearer ' + token } : {}, signal: AbortSignal.timeout(10000),
});
async function preparar(alimento = 'L04 <img src=x onerror=alert(1)> & frutas') {
  const p = await call('POST', '/lotes', { alimento, categoria: 'Hortifrúti', quantidade_kg: 2.5, validade: dia(2) }, comper);
  assert.equal(p.s, 201);
  const r = await call('PUT', `/lotes/${p.d.id}/reservar`, janela(), esp);
  assert.equal(r.s, 200);
  return { lote: p.d.id, codigo: r.d.codigo };
}
const confirmar = (body, token = comper, id = lote) => call('PUT', `/lotes/${id}/confirmar-retirada`, body, token);
const lerDoacao = async (id) => (await db.query('SELECT * FROM doacoes WHERE id=$1', [id])).rows[0];

test('L04 prepara reserva sintética', async () => {
  [comper, esp, sabor, amb] = await Promise.all(['comper', 'esperanca', 'sabor', 'amambai'].map((n) => login(`${n}@demo.com`)));
  ({ lote, codigo } = await preparar());
});

test('L04 checklist ausente, incompleto, falso, tipos e campos extras → 400 sem entregar', async () => {
  const casos = [undefined, null, [], 'sim', true, {}, { embalagem_integra: true }, { ...checklist, extra: true }];
  for (const item of Object.keys(checklist)) {
    for (const valor of [false, 'true', 1, null, [], {}, undefined]) casos.push({ ...checklist, [item]: valor });
  }
  for (const valor of casos) {
    const r = await confirmar({ codigo, checklist: valor });
    assert.equal(r.s, 400, JSON.stringify(r));
    assert.deepEqual(Object.keys(r.d), ['erro']);
  }
  assert.equal((await db.query('SELECT status FROM lotes WHERE id=$1', [lote])).rows[0].status, 'reservado');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM doacoes WHERE lote_id=$1', [lote])).rows[0].n, 0);
});

test('L04 QR: somente a reservante, PNG exato do link esperado (BASE_URL ou Host)', async () => {
  const path = `/lotes/${lote}/qrcode`;
  assert.equal((await raw(path)).status, 401);
  for (const token of [comper, sabor, amb]) assert.equal((await raw(path, token)).status, 403);
  const r = await raw(path, esp);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /^image\/png/);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const base = (process.env.BASE_URL || 'http://127.0.0.1:3100').replace(/\/$/, '');
  const esperado = `${base}/#retirada/${lote}/${codigo}`;
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), await QRCode.toBuffer(esperado, {
    type: 'png', width: 280, margin: 4, errorCorrectionLevel: 'M',
  }));
  assert.equal((await raw('/lotes/abc/qrcode', esp)).status, 400);
  assert.equal((await raw('/lotes/2147483647/qrcode', esp)).status, 404);
});

test('L04 base URL respeita configuração e fallback sem mudar configurações do projeto', () => {
  const anterior = process.env.BASE_URL;
  const req = { protocol: 'http', get: () => 'localhost:3000' };
  try {
    delete process.env.BASE_URL;
    assert.equal(baseURL(req), 'http://localhost:3000');
    assert.throws(() => baseURL({ protocol: 'http', get: () => '[' }), (e) => e.constructor.name === 'ErroValidacao');
    assert.throws(() => baseURL({ protocol: 'javascript', get: () => 'localhost' }), (e) => e.constructor.name === 'ErroValidacao');
    process.env.BASE_URL = 'https://exemplo.test/';
    assert.equal(baseURL(req), 'https://exemplo.test');
    process.env.BASE_URL = 'javascript:alert(1)';
    assert.throws(() => baseURL(req), /BASE_URL/);
  } finally {
    if (anterior === undefined) delete process.env.BASE_URL; else process.env.BASE_URL = anterior;
  }
});

test('L04 Host estrito e link QR limitado em bytes; configuração inválida continua interna', async () => {
  const anterior = process.env.BASE_URL;
  const req = { protocol: 'http', get: () => 'localhost:3000' };
  const entradaInvalida = (e) => e.constructor.name === 'ErroValidacao';
  const configuracaoInvalida = (e) => !entradaInvalida(e) && /BASE_URL/.test(e.message);
  try {
    delete process.env.BASE_URL;
    const maximo = [63, 63, 63, 61].map((n) => 'a'.repeat(n)).join('.');
    for (const host of ['localhost:3000', '127.0.0.1:3000', '[::1]:3000', '[::1]', `${maximo}:65535`])
      assert.ok(baseURL({ ...req, get: () => host }).startsWith('http://'));
    for (const host of [undefined, '', '[', 'a'.repeat(3000) + '.test', 'a'.repeat(64) + '.test',
      maximo + 'a', '-exemplo.test', 'exemplo-.test', 'a..test', 'localhost:65536',
      'localhost:abc', 'localhost/path', 'usuario@localhost', 'localhost?x', 'localhost#x', ' localhost'])
      assert.throws(() => baseURL({ ...req, get: () => host }), entradaInvalida, String(host));
    const base = 'https://exemplo.test';
    const caminho = '/verificar/' + 'a'.repeat(64);
    process.env.BASE_URL = base + '/' + 'a'.repeat(1024 - base.length - 1 - caminho.length);
    const limite = urlQR(req, caminho);
    assert.equal(Buffer.byteLength(limite), 1024);
    assert.ok((await comprovantes.png(limite)).length > 0);
    process.env.BASE_URL += 'a';
    assert.throws(() => urlQR(req, caminho), configuracaoInvalida);
    process.env.BASE_URL = base + '/' + 'é'.repeat(200);
    assert.throws(() => urlQR(req, caminho), configuracaoInvalida); // URL percent-encoded excede o limite.
    process.env.BASE_URL = 'https://' + 'a'.repeat(64) + '.test';
    assert.throws(() => baseURL(req), configuracaoInvalida);
    process.env.BASE_URL = base + '/' + 'a'.repeat(3000);
    assert.throws(() => baseURL(req), configuracaoInvalida);
  } finally {
    if (anterior === undefined) delete process.env.BASE_URL; else process.env.BASE_URL = anterior;
  }
});

test('L04 regressão M1 por HTTP: Host excessivo → 400 JSON; encoder falha → 500 JSON', async () => {
  // Rotas, middleware JWT e Express reais; só banco e falha do encoder são simulados.
  const anterior = process.env.BASE_URL;
  const logs = [];
  const segredo = 'segredo-ficticio-l04-m1';
  let app, falharEncoder = false;
  const express = require('express');
  function criarApp() { app = express(); app.listen = () => {}; return app; }
  Object.assign(criarApp, express);
  class Pool {
    on() {}
    async query() { return { rows: [{ reservado_por: 4, status: 'reservado', codigo: '001234' }] }; }
  }
  const modulo = { ...comprovantes, png: async (url) => {
    if (falharEncoder) throw new Error('Falha sintética do encoder L04');
    return comprovantes.png(url);
  } };
  const server = createServer();
  try {
    delete process.env.BASE_URL;
    vm.runInNewContext(readFileSync(new URL('../src/server.js', import.meta.url), 'utf8'), {
      require: (nome) => nome === 'pg' ? { Pool } : nome === 'express' ? criarApp :
        nome === './validacao' ? require('../src/validacao.js') : nome === './comprovante' ? modulo : nome === './tempo-real' ? require('../src/tempo-real.js') : require(nome),
      __dirname: new URL('../src/', import.meta.url).pathname,
      process: { env: { NODE_ENV: 'test', JWT_SECRET: segredo } },
      console: { error: (e) => logs.push(e.message) },
    });
    server.on('request', app);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const token = require('jsonwebtoken').sign({ id: 4, perfil: 'receptora' }, segredo);
    const consultar = (host) => new Promise((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port: server.address().port, path: '/lotes/1/qrcode',
        headers: { Host: host, Authorization: 'Bearer ' + token } }, (res) => {
        const partes = [];
        res.on('data', (p) => partes.push(p));
        res.on('error', reject);
        res.on('end', () => resolve({ status: res.statusCode, tipo: res.headers['content-type'], body: Buffer.concat(partes) }));
      });
      req.on('error', reject);
      req.setTimeout(5000, () => req.destroy(new Error('Timeout HTTP da regressão L04')));
      req.end();
    });
    const valido = await consultar('localhost:3000');
    assert.equal(valido.status, 200);
    assert.match(valido.tipo, /^image\/png/);
    assert.deepEqual(valido.body, await comprovantes.png('http://localhost:3000/#retirada/1/001234'));
    for (const host of ['a'.repeat(3000) + '.test', '[', 'localhost/path']) {
      const r = await consultar(host);
      assert.equal(r.status, 400);
      assert.match(r.tipo, /^application\/json/);
      assert.deepEqual(JSON.parse(r.body), { erro: 'Endereço da requisição inválido.' });
    }
    assert.deepEqual(logs, []);
    falharEncoder = true;
    const interno = await consultar('localhost:3000');
    assert.equal(interno.status, 500);
    assert.match(interno.tipo, /^application\/json/);
    assert.deepEqual(JSON.parse(interno.body), { erro: 'Erro interno do servidor.' });
    assert.deepEqual(logs, ['Falha sintética do encoder L04']);
    falharEncoder = false;
    process.env.BASE_URL = 'https://exemplo.test/' + 'a'.repeat(3000);
    const configuracao = await consultar('localhost:3000');
    assert.equal(configuracao.status, 500);
    assert.match(configuracao.tipo, /^application\/json/);
    assert.deepEqual(JSON.parse(configuracao.body), { erro: 'Erro interno do servidor.' });
    assert.match(logs[1], /BASE_URL/);
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    if (anterior === undefined) delete process.env.BASE_URL; else process.env.BASE_URL = anterior;
  }
});

test('L04 confirmação concorrente emite uma única doação, com hash e checklist', async () => {
  assert.equal((await confirmar({ codigo, checklist }, esp)).s, 403);
  assert.equal((await confirmar({ codigo, checklist }, sabor)).s, 400);
  const respostas = await Promise.all(Array.from({ length: 8 }, () => confirmar({ codigo, checklist })));
  assert.equal(respostas.filter((r) => r.s === 200).length, 1);
  assert.ok(respostas.every((r) => [200, 400].includes(r.s)));
  const r = respostas.find((r) => r.s === 200);
  doacao = await lerDoacao(r.d.doacao_id);
  assert.match(r.d.hash, /^[0-9a-f]{64}$/);
  assert.equal(r.d.hash, doacao.hash);
  assert.deepEqual(doacao.checklist, checklist);
  const c = doacao.comprovante;
  assert.deepEqual(c.checklist, checklist);
  assert.equal(c.codigo, codigo);
  assert.equal(c.quantidade_kg, '2.50');
  assert.equal(c.data_hora, doacao.data_hora.toISOString());
  assert.equal(c.doador.cnpj, '00000001000136');
  assert.equal(c.receptora.cnpj, '00000004000170');
  assert.equal(doacao.hash, createHash('sha256').update(canonico(c)).digest('hex'));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM doacoes WHERE lote_id=$1', [lote])).rows[0].n, 1);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM eventos_lote WHERE lote_id=$1 AND tipo='entregue'", [lote])).rows[0].n, 1);
  const todas = (await db.query('SELECT hash, comprovante FROM doacoes')).rows;
  assert.ok(todas.length >= 1);
  for (const d of todas) { assert.match(d.hash, /^[0-9a-f]{64}$/); assert.equal(d.hash, hashDe(d.comprovante)); }
});

test('L04 canônico independe da ordem das chaves; mudança de cada campo afeta o hash', () => {
  assert.equal(canonico({ z: { b: 2, a: 'é' }, a: true }), '{"a":true,"z":{"a":"é","b":2}}');
  assert.equal(hashDe({ a: 1, b: { c: 2, d: 3 } }), hashDe({ b: { d: 3, c: 2 }, a: 1 }));
  for (const chave of Object.keys(doacao.comprovante)) {
    assert.notEqual(hashDe({ ...doacao.comprovante, [chave]: null }), doacao.hash, chave);
  }
});

test('L04 comprovante 200 para ambas as partes, 403 para terceiros, HTML seguro e QR público', async () => {
  const path = `/doacoes/${doacao.id}/comprovante`;
  assert.equal((await raw(path)).status, 401);
  for (const token of [sabor, amb]) assert.equal((await raw(path, token)).status, 403);
  for (const token of [comper, esp]) {
    const r = await raw(path, token);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /^text\/html/);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const html = await r.text();
    assert.ok(html.includes('00000001000136') && html.includes('00000004000170'));
    assert.ok(html.includes(doacao.hash) && html.includes(codigo));
    assert.match(html, /@media print/);
    assert.match(html, /Ctrl\+P/);
    assert.match(html, /Não é certificado ICP-Brasil/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt; &amp; frutas/);
    assert.doesNotMatch(html, /<img src=x/);
    const data = html.match(/src="data:image\/png;base64,([^"]+)"/)[1];
    const base = (process.env.BASE_URL || 'http://127.0.0.1:3100').replace(/\/$/, '');
    assert.deepEqual(Buffer.from(data, 'base64'), await QRCode.toBuffer(`${base}/verificar/${doacao.hash}`, {
      type: 'png', width: 280, margin: 4, errorCorrectionLevel: 'M',
    }));
  }
  assert.equal((await raw('/doacoes/abc/comprovante', comper)).status, 400);
  assert.equal((await raw('/doacoes/2147483647/comprovante', comper)).status, 404);
});

test('L04 verificar é público e mínimo; hash alterado/inválido/injeção → 404', async () => {
  const r = await raw(`/verificar/${doacao.hash}`);
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /Comprovante válido/);
  assert.match(html, /2\.50 kg/);
  // Remover o hash evita coincidência acidental de código numérico em sua sequência.
  const resumo = html.replaceAll(doacao.hash, '');
  for (const privado of [codigo, doacao.comprovante.alimento, 'Comper', 'Esperança', '00000001000136', '00000004000170', '@demo.com'])
    assert.ok(!resumo.includes(privado), privado);
  for (const hash of [doacao.hash.slice(0, 63) + (doacao.hash[63] === '0' ? '1' : '0'), 'abc', "' OR 1=1--", 'a'.repeat(65)])
    assert.equal((await raw('/verificar/' + encodeURIComponent(hash))).status, 404);
});

test('L04 UPDATE e DELETE diretos são bloqueados pelo banco e preservam o registro', async () => {
  for (const sql of ['UPDATE doacoes SET alimento=$2 WHERE id=$1', 'DELETE FROM doacoes WHERE id=$1']) {
    await assert.rejects(db.query(sql, sql.startsWith('UPDATE') ? [doacao.id, 'alterado'] : [doacao.id]),
      (e) => e.code === '55000' && /imutáveis/.test(e.message));
    assert.deepEqual(await lerDoacao(doacao.id), doacao);
  }
});

test('L04 snapshot permanece igual se o cadastro mudar; falha de integridade é interna', async () => {
  const u = doacao.comprovante.doador;
  try {
    await db.query('UPDATE usuarios SET nome=$2, cnpj=$3 WHERE id=$1', [u.id, 'Nome novo', '11222333000181']);
    const html = await (await raw(`/doacoes/${doacao.id}/comprovante`, comper)).text();
    assert.ok(html.includes(u.nome) && html.includes(u.cnpj));
    assert.ok(!html.includes('Nome novo'));
    const historico = await call('GET', '/doacoes', undefined, comper);
    assert.equal(historico.d.find((d) => d.id === doacao.id).doador, u.nome);
  } finally { await db.query('UPDATE usuarios SET nome=$2, cnpj=$3 WHERE id=$1', [u.id, u.nome, u.cnpj]); }
  const corrompido = { ...doacao, comprovante: { ...doacao.comprovante, quantidade_kg: '99.00' } };
  await assert.rejects(paginaComprovante(corrompido, 'http://localhost:3000'), /integridade/);
  assert.throws(() => paginaVerificacao(corrompido), /integridade/);
});

test('L04 regressão M2 por HTTP: integridade inválida → 500 application/json sem dados privados', async () => {
  // Express e renderização reais; só a leitura do banco é simulada para não violar a imutabilidade.
  const logs = [];
  let app, corromper = false;
  const express = require('express');
  function criarApp() { app = express(); app.listen = () => {}; return app; }
  Object.assign(criarApp, express);
  class Pool {
    on() {}
    async query() {
      return { rows: [{ hash: doacao.hash, comprovante: corromper
        ? { ...doacao.comprovante, quantidade_kg: '99.00' } : doacao.comprovante }] };
    }
  }
  const server = createServer();
  try {
    vm.runInNewContext(readFileSync(new URL('../src/server.js', import.meta.url), 'utf8'), {
      require: (nome) => nome === 'pg' ? { Pool } : nome === 'express' ? criarApp :
        nome === './validacao' ? require('../src/validacao.js') :
        nome === './comprovante' ? comprovantes : nome === './tempo-real' ? require('../src/tempo-real.js') : require(nome),
      __dirname: new URL('../src/', import.meta.url).pathname,
      process: { env: { NODE_ENV: 'test', JWT_SECRET: 'segredo-ficticio-l04-m2' } },
      console: { error: (e) => logs.push(e.message) },
    });
    server.on('request', app);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const url = `http://127.0.0.1:${server.address().port}/verificar/${doacao.hash}`;
    const consultar = () => fetch(url, { signal: AbortSignal.timeout(5000) });
    const valido = await consultar(); // Rota pública, sem token.
    assert.equal(valido.status, 200);
    assert.match(valido.headers.get('content-type'), /^text\/html/);
    assert.equal(valido.headers.get('cache-control'), 'no-store');
    assert.match(await valido.text(), /Comprovante válido/);
    assert.deepEqual(logs, []);
    corromper = true;
    const invalido = await consultar();
    assert.equal(invalido.status, 500);
    const corpo = await invalido.text();
    assert.deepEqual(JSON.parse(corpo), { erro: 'Erro interno do servidor.' });
    assert.match(invalido.headers.get('content-type'), /^application\/json/);
    assert.deepEqual(logs, ['Falha de integridade no comprovante.']);
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  }
});

test('L04 QR não permanece disponível após entrega ou liberação da reserva', async () => {
  assert.equal((await raw(`/lotes/${lote}/qrcode`, esp)).status, 409);
  const nova = await preparar('Reserva que envelhece');
  await db.query("UPDATE lotes SET janela_inicio=now()-interval '2 hours', janela_fim=now()-interval '40 minutes' WHERE id=$1", [nova.lote]);
  assert.equal((await raw(`/lotes/${nova.lote}/qrcode`, esp)).status, 403);
  const l = (await db.query('SELECT status, codigo FROM lotes WHERE id=$1', [nova.lote])).rows[0];
  assert.deepEqual(l, { status: 'disponivel', codigo: null });
});

test('L04 front preserva link no login, preenche código sem confirmar e envia checklist', async () => {
  const elementos = new Map();
  let chamadas = [];
  const ctx = {
    localStorage: { getItem: () => null },
    document: { getElementById(id) {
      if (!elementos.has(id)) elementos.set(id, { id, value: '', checked: false, innerHTML: '', focus() {}, scrollIntoView() {} });
      return elementos.get(id);
    } },
    window: { location: { hash: `#retirada/${lote}/001234` }, addEventListener() {} },
    fetch: async () => ({ json: async () => [] }),
  };
  vm.createContext(ctx);
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], ctx);
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(elementos.get('erroLogin').innerHTML, /Entre como doador/);
  vm.runInContext("usuario = {perfil:'doador'}", ctx);
  ctx.aplicarLinkRetirada([{ id: lote, status: 'reservado' }]);
  assert.equal(elementos.get('cod' + lote).value, '001234');
  assert.equal(chamadas.length, 0);
  assert.equal(ctx.window.location.hash, `#retirada/${lote}/001234`);
  assert.equal(ctx.document.getElementById('emb' + lote).checked, false);
  ctx.window.location.hash = '#retirada/1/12345<script>';
  assert.equal(ctx.linkRetirada(), null);
  ctx.window.location.hash = '';
  ctx.api = async (...args) => { chamadas.push(args); return { doacao_id: 7 }; };
  ctx.irPara = async () => {};
  for (const prefixo of ['emb', 'temp', 'val']) ctx.document.getElementById(prefixo + lote).checked = true;
  await ctx.confirmar(lote);
  assert.equal(chamadas.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(chamadas[0][2])), { codigo: '001234', checklist });
  assert.match(elementos.get('aviso').innerHTML, /abrirComprovante\(7\)/);
});
