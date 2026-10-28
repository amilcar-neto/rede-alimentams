// Polimento pós-revisão final: desistência de reserva, cancelamento de lote, limite de tentativas
// de código (B1) e de login, corpo grande anônimo em POST /lotes (A4) e ajustes do front.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { EventEmitter, once } from 'node:events';
import vm from 'node:vm';
import WebSocket from 'ws';
import { call, login, dia, janela, checklist, retiradaAte } from './helpers.mjs';
import { testClient, testConnection } from './reset-db.mjs';

const require = createRequire(import.meta.url);
const db = testClient(testConnection().connectionString);
await db.connect();

let comper, sabor, esperanca, amambai, longe;
const ids = {};

const publicar = async (token = comper, alimento = 'Lote polimento') => {
  const r = await call('POST', '/lotes', {
    alimento, categoria: 'Hortifrúti', quantidade_kg: 12.5, validade: dia(2), retirada_ate: retiradaAte(dia(2)),
  }, token);
  assert.equal(r.s, 201, JSON.stringify(r));
  return r.d.id;
};
const reservar = async (id, token) => {
  const r = await call('PUT', `/lotes/${id}/reservar`, janela(), token);
  assert.equal(r.s, 200, JSON.stringify(r));
  return r.d.codigo;
};
const confirmar = (id, codigo, token = comper) =>
  call('PUT', `/lotes/${id}/confirmar-retirada`, { codigo, checklist }, token);
const estado = async (id) => (await db.query('SELECT * FROM lotes WHERE id=$1', [id])).rows[0];
const eventos = async (id) => (await db.query(
  'SELECT tipo, usuario_id FROM eventos_lote WHERE lote_id=$1 ORDER BY id', [id])).rows;
const notificacoesDoLote = async (id) => (await db.query(
  'SELECT usuario_id, tipo, urgente, mensagem FROM notificacoes WHERE lote_id=$1 ORDER BY id', [id])).rows;
const errado = (codigo) => (codigo === '000000' ? '111111' : '000000');

test('preparação: logins e ids das contas demo', async () => {
  [comper, sabor, esperanca, amambai, longe] = await Promise.all(
    ['comper', 'sabor', 'esperanca', 'amambai', 'longe'].map((n) => login(`${n}@demo.com`)));
  const r = await db.query('SELECT id, email FROM usuarios');
  for (const u of r.rows) ids[u.email.split('@')[0]] = u.id;
});

// ---------- B1: tentativas de código ----------
test('B1: cinco códigos errados bloqueiam a confirmação por 15 min, inclusive com o código certo', async () => {
  const id = await publicar();
  const codigo = await reservar(id, esperanca);
  for (let restam = 4; restam >= 1; restam--) {
    const r = await confirmar(id, errado(codigo));
    assert.equal(r.s, 400);
    assert.match(r.d.erro, new RegExp(`Restam ${restam} tentativa`));
  }
  const quinta = await confirmar(id, errado(codigo));
  assert.equal(quinta.s, 400);
  assert.match(quinta.d.erro, /bloqueadas por 15 minutos/);
  const bloqueado = await confirmar(id, codigo);
  assert.equal(bloqueado.s, 429);
  assert.match(bloqueado.d.erro, /Muitas tentativas/);
  assert.equal((await estado(id)).status, 'reservado');

  // Passados os 15 min do último erro, o código certo volta a valer.
  await db.query(`UPDATE lotes SET ultima_falha_codigo = now() - interval '16 minutes' WHERE id=$1`, [id]);
  const ok = await confirmar(id, codigo);
  assert.equal(ok.s, 200, JSON.stringify(ok));
});

test('B1: erros de outro doador ou em lote não reservado não contam; erro antigo recomeça a sequência', async () => {
  const id = await publicar();
  const codigo = await reservar(id, esperanca);
  for (let i = 0; i < 6; i++) assert.equal((await confirmar(id, errado(codigo), sabor)).s, 400);
  assert.equal((await estado(id)).tentativas_codigo, 0);

  for (let i = 0; i < 4; i++) await confirmar(id, errado(codigo));
  await db.query(`UPDATE lotes SET ultima_falha_codigo = now() - interval '16 minutes' WHERE id=$1`, [id]);
  const r = await confirmar(id, errado(codigo));
  assert.match(r.d.erro, /Restam 4 tentativa/);
  assert.equal((await estado(id)).tentativas_codigo, 1);
});

test('B1: nova reserva zera o contador de erros', async () => {
  const id = await publicar();
  const codigo = await reservar(id, esperanca);
  for (let i = 0; i < 5; i++) await confirmar(id, errado(codigo));
  assert.equal((await call('PUT', `/lotes/${id}/cancelar-reserva`, undefined, esperanca)).s, 200);
  const novo = await reservar(id, amambai);
  const l = await estado(id);
  assert.equal(l.tentativas_codigo, 0);
  assert.equal(l.ultima_falha_codigo, null);
  assert.equal((await confirmar(id, novo)).s, 200);
});

test('B1: tentativas simultâneas são contadas uma a uma (sem perder incrementos)', async () => {
  const id = await publicar();
  const codigo = await reservar(id, esperanca);
  const respostas = await Promise.all(Array.from({ length: 8 }, () => confirmar(id, errado(codigo))));
  const status = respostas.map((r) => r.s).sort();
  assert.deepEqual(status, [400, 400, 400, 400, 400, 429, 429, 429]);
  assert.equal((await estado(id)).tentativas_codigo, 5);
});

// ---------- Desistência da reserva (receptora) ----------
test('Receptora desiste: lote volta disponível na hora, doador e demais ONGs do raio são avisados', async () => {
  const id = await publicar(comper, 'Desistência <i>');
  await reservar(id, esperanca);
  await db.query('DELETE FROM notificacoes WHERE lote_id=$1', [id]);

  const r = await call('PUT', `/lotes/${id}/cancelar-reserva`, undefined, esperanca);
  assert.equal(r.s, 200, JSON.stringify(r));
  const l = await estado(id);
  assert.equal(l.status, 'disponivel');
  for (const campo of ['reservado_por', 'reservado_em', 'codigo', 'janela_inicio', 'janela_fim']) assert.equal(l[campo], null);
  assert.deepEqual((await eventos(id)).at(-1), { tipo: 'reserva_cancelada', usuario_id: ids.esperanca });

  const avisos = await notificacoesDoLote(id);
  const doDoador = avisos.filter((n) => n.usuario_id === ids.comper);
  assert.equal(doDoador.length, 1);
  assert.equal(doDoador[0].tipo, 'reserva_cancelada');
  assert.match(doDoador[0].mensagem, /Casa de Apoio Esperança desistiu da reserva/);
  const liberados = avisos.filter((n) => n.tipo === 'lote_liberado').map((n) => n.usuario_id);
  assert.ok(liberados.includes(ids.amambai), 'outra ONG do raio é avisada');
  assert.ok(!liberados.includes(ids.esperanca), 'quem desistiu não recebe "disponível novamente"');
  assert.ok(!liberados.includes(ids.longe), 'ONG fora do raio não é avisada');

  // O lote reaparece para quem desistiu e para a outra ONG.
  for (const token of [esperanca, amambai])
    assert.equal((await call('GET', '/lotes', undefined, token)).d.find((x) => x.id === id)?.status, 'disponivel');
  assert.equal((await call('GET', `/lotes/${id}/qrcode`, undefined, esperanca)).s, 403);
});

test('Desistência: só a receptora que reservou, só com reserva ativa e sem corpo extra', async () => {
  const id = await publicar();
  await reservar(id, esperanca);
  const outra = await call('PUT', `/lotes/${id}/cancelar-reserva`, undefined, amambai);
  assert.equal(outra.s, 409);
  assert.equal((await estado(id)).status, 'reservado');
  assert.equal((await call('PUT', `/lotes/${id}/cancelar-reserva`, undefined, comper)).s, 403);
  assert.equal((await call('PUT', `/lotes/${id}/cancelar-reserva`)).s, 401);
  assert.equal((await call('PUT', `/lotes/${id}/cancelar-reserva`, { motivo: 'x' }, esperanca)).s, 400);
  assert.equal((await call('PUT', '/lotes/abc/cancelar-reserva', undefined, esperanca)).s, 400);
  assert.equal((await call('PUT', '/lotes/2147483647/cancelar-reserva', undefined, esperanca)).s, 409);
  assert.equal((await call('PUT', `/lotes/${id}/cancelar-reserva`, undefined, esperanca)).s, 200);
  assert.equal((await call('PUT', `/lotes/${id}/cancelar-reserva`, undefined, esperanca)).s, 409);
});

test('Desistências simultâneas: só uma vale e só um aviso chega ao doador', async () => {
  const id = await publicar();
  await reservar(id, esperanca);
  await db.query('DELETE FROM notificacoes WHERE lote_id=$1', [id]);
  const respostas = await Promise.all(Array.from({ length: 5 },
    () => call('PUT', `/lotes/${id}/cancelar-reserva`, undefined, esperanca)));
  assert.deepEqual(respostas.map((r) => r.s).sort(), [200, 409, 409, 409, 409]);
  const avisos = (await notificacoesDoLote(id)).filter((n) => n.tipo === 'reserva_cancelada');
  assert.equal(avisos.length, 1);
});

// ---------- Cancelamento do lote (doador) ----------
test('Doador cancela lote disponível: sai das listas e não conta como expirado na TEC', async () => {
  const antes = (await call('GET', '/indicadores/meus', undefined, comper)).d;
  const id = await publicar();
  const r = await call('PUT', `/lotes/${id}/cancelar`, undefined, comper);
  assert.equal(r.s, 200, JSON.stringify(r));
  assert.equal((await estado(id)).status, 'cancelado');
  assert.deepEqual((await eventos(id)).at(-1), { tipo: 'cancelado', usuario_id: ids.comper });
  assert.ok(!(await call('GET', '/lotes', undefined, comper)).d.some((x) => x.id === id));
  assert.ok(!(await call('GET', '/lotes', undefined, esperanca)).d.some((x) => x.id === id));
  assert.equal((await call('PUT', `/lotes/${id}/reservar`, janela(), esperanca)).s, 409);
  const depois = (await call('GET', '/indicadores/meus', undefined, comper)).d;
  assert.equal(depois.expirados, antes.expirados);
  assert.equal(depois.entregues, antes.entregues);
  // Nenhuma ONG é avisada do cancelamento de um lote sem reserva.
  assert.ok(!(await notificacoesDoLote(id)).some((n) => n.tipo === 'lote_cancelado'));
});

test('Doador cancela lote reservado: a ONG recebe aviso urgente e o código deixa de valer', async () => {
  const id = await publicar(comper, 'Cancelado <b>');
  const codigo = await reservar(id, amambai);
  const r = await call('PUT', `/lotes/${id}/cancelar`, undefined, comper);
  assert.equal(r.s, 200);
  const l = await estado(id);
  assert.equal(l.status, 'cancelado');
  assert.equal(l.codigo, null);
  const aviso = (await notificacoesDoLote(id)).filter((n) => n.tipo === 'lote_cancelado');
  assert.equal(aviso.length, 1);
  assert.equal(aviso[0].usuario_id, ids.amambai);
  assert.equal(aviso[0].urgente, true);
  assert.ok(!aviso[0].mensagem.includes(codigo));
  assert.notEqual((await confirmar(id, codigo)).s, 200);
  assert.equal((await call('GET', `/lotes/${id}/qrcode`, undefined, amambai)).s, 409);
  assert.ok(!(await call('GET', '/lotes', undefined, amambai)).d.some((x) => x.id === id));
});

test('Cancelamento: só o doador dono, só lote ativo; entregue/expirado/cancelado → 409', async () => {
  const id = await publicar();
  assert.equal((await call('PUT', `/lotes/${id}/cancelar`, undefined, sabor)).s, 409);
  assert.equal((await call('PUT', `/lotes/${id}/cancelar`, undefined, esperanca)).s, 403);
  assert.equal((await call('PUT', `/lotes/${id}/cancelar`)).s, 401);
  assert.equal((await call('PUT', `/lotes/${id}/cancelar`, { extra: 1 }, comper)).s, 400);
  assert.equal((await estado(id)).status, 'disponivel');
  assert.equal((await call('PUT', `/lotes/${id}/cancelar`, undefined, comper)).s, 200);
  assert.equal((await call('PUT', `/lotes/${id}/cancelar`, undefined, comper)).s, 409);

  const entregue = await publicar();
  assert.equal((await confirmar(entregue, await reservar(entregue, esperanca))).s, 200);
  assert.equal((await call('PUT', `/lotes/${entregue}/cancelar`, undefined, comper)).s, 409);
  assert.equal((await estado(entregue)).status, 'entregue');

  const expirado = await publicar();
  await db.query(`UPDATE lotes SET status='expirado' WHERE id=$1`, [expirado]);
  assert.equal((await call('PUT', `/lotes/${expirado}/cancelar`, undefined, comper)).s, 409);
});

test('Cancelar × confirmar ao mesmo tempo: o lote termina em um único estado coerente', async () => {
  const id = await publicar();
  const codigo = await reservar(id, esperanca);
  const [c, x] = await Promise.all([confirmar(id, codigo), call('PUT', `/lotes/${id}/cancelar`, undefined, comper)]);
  const l = await estado(id);
  const doacoes = (await db.query('SELECT count(*)::int AS n FROM doacoes WHERE lote_id=$1', [id])).rows[0].n;
  if (c.s === 200) { assert.equal(x.s, 409); assert.equal(l.status, 'entregue'); assert.equal(doacoes, 1); }
  else { assert.equal(x.s, 200); assert.equal(l.status, 'cancelado'); assert.equal(doacoes, 0); }
});

test('Avisos de cancelamento chegam em tempo real pelo WebSocket', async () => {
  const ws = new WebSocket('ws://127.0.0.1:3100/ws');
  const quadros = [];
  ws.on('message', (d) => quadros.push(JSON.parse(d.toString())));
  await once(ws, 'open');
  ws.send(comper);
  const esperar = async (cond) => {
    const fim = Date.now() + 5000;
    while (Date.now() < fim) { const q = quadros.find(cond); if (q) return q; await new Promise((r) => setTimeout(r, 25)); }
    assert.fail('quadro não recebido');
  };
  try {
    await esperar((q) => q.tipo === 'autenticado');
    const id = await publicar();
    await reservar(id, esperanca);
    await call('PUT', `/lotes/${id}/cancelar-reserva`, undefined, esperanca);
    const q = await esperar((m) => m.tipo === 'reserva_cancelada' && m.lote_id === id);
    assert.match(q.mensagem, /desistiu da reserva/);
  } finally { ws.close(); }
});

// ---------- A4 ----------
test('A4: POST /lotes anônimo com corpo grande recebe 401 sem leitura do corpo; /lotes/ segue as mesmas regras', async () => {
  for (const caminho of ['/lotes', '/lotes/']) {
    const anonimo = await fetch('http://127.0.0.1:3100' + caminho, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ foto: 'A'.repeat(650000) }), signal: AbortSignal.timeout(10000),
    });
    assert.equal(anonimo.status, 401);
    assert.match((await anonimo.json()).erro, /login/);
    const grande = await fetch('http://127.0.0.1:3100' + caminho, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + comper },
      body: JSON.stringify({ foto: 'A'.repeat(800000) }), signal: AbortSignal.timeout(10000),
    });
    assert.equal(grande.status, 400);
    assert.match((await grande.json()).erro, /400 KB/);
  }
  const barra = await call('POST', '/lotes/', {
    alimento: 'Com barra', categoria: 'Panificados', quantidade_kg: 1, validade: dia(2), retirada_ate: retiradaAte(dia(2)),
  }, comper);
  assert.equal(barra.s, 201);
});

// ---------- Limite de login (servidor isolado com banco simulado, para não bloquear a suíte) ----------
test('Login: 10 erros na mesma conta ou 50 no mesmo IP → 429 com Retry-After; outra conta segue livre', async () => {
  class Pool extends EventEmitter {
    async query() { return { rows: [] }; } // nenhuma conta existe: todo login é 401
  }
  const express = require('express');
  let app;
  function criarApp() { app = express(); app.listen = () => {}; return app; }
  Object.assign(criarApp, express);
  vm.runInNewContext(readFileSync(new URL('../src/server.js', import.meta.url), 'utf8'), {
    require: (nome) => nome === 'pg' ? { Pool } : nome === 'express' ? criarApp :
      nome.startsWith('./') ? require('../src/' + nome.slice(2) + '.js') : require(nome),
    __dirname: new URL('../src/', import.meta.url).pathname,
    process: { env: { NODE_ENV: 'test', JWT_SECRET: 'segredo-sintetico-login' } },
    console: { error: () => {}, log: () => {} },
  });
  const server = require('http').createServer(app).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const entrar = async (email) => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha: 'errada' }), signal: AbortSignal.timeout(5000),
    });
    return { s: r.status, d: await r.json(), retry: r.headers.get('retry-after') };
  };
  try {
    for (let i = 0; i < 10; i++) assert.equal((await entrar('alvo@example.test')).s, 401);
    const bloqueado = await entrar('alvo@example.test');
    assert.equal(bloqueado.s, 429);
    assert.equal(bloqueado.retry, '900');
    assert.match(bloqueado.d.erro, /Aguarde 15 minutos/);
    // E-mail com maiúsculas é a mesma conta.
    assert.equal((await entrar('ALVO@example.test')).s, 429);
    // Outra conta continua respondendo normalmente até o limite do IP (50 erros ao todo).
    for (let i = 0; i < 40; i++) assert.equal((await entrar(`conta${i}@example.test`)).s, 401);
    assert.equal((await entrar('mais-uma@example.test')).s, 429);
    // Entrada inválida não chega à contagem nem ao banco: continua 400.
    assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'x', senha: 'y' }),
    })).status, 400);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

// ---------- Front ----------
test('Front: botões de cancelar/desistir com confirmação no cartão, kg em pt-BR, tolerância do servidor e Enter no login', async () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="lSenha"[^>]*onkeydown="if \(event.key === 'Enter'\) entrar\(\)"/);
  assert.match(html, /id="cSenha"[^>]*onkeydown="if \(event.key === 'Enter'\) cadastrar\(\)"/);
  const elementos = new Map();
  let lotes = [];
  const chamadas = [];
  const contexto = {
    localStorage: { getItem: () => null },
    document: { getElementById: (nome) => {
      if (!elementos.has(nome)) elementos.set(nome, { value: '', innerHTML: '', classList: { toggle() {}, add() {}, remove() {} } });
      return elementos.get(nome);
    }, querySelectorAll: () => [] },
    fetch: async (url, opcoes = {}) => {
      chamadas.push([opcoes.method || 'GET', url]);
      return { ok: true, status: 200, json: async () => (url === '/lotes' ? lotes : {}) };
    },
  };
  vm.createContext(contexto);
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], contexto);
  assert.equal(contexto.kgBR('12.50'), '12,5');
  assert.equal(contexto.kgBR('1234.25'), '1.234,25');

  vm.runInContext("usuario = { perfil: 'doador', nome: 'Doador' }", contexto);
  lotes = [
    { id: 7, alimento: 'Disp', categoria: 'Panificados', quantidade_kg: '12.50', validade: '2026-10-30', status: 'disponivel', dias: 2 },
    { id: 8, alimento: 'Res', categoria: 'Panificados', quantidade_kg: '3.00', validade: '2026-10-30', status: 'reservado', dias: 2,
      reservado_por_nome: 'ONG', janela_inicio: '2026-10-28T14:00', janela_fim: '2026-10-28T15:00' },
    { id: 9, alimento: 'Exp', categoria: 'Panificados', quantidade_kg: '1.00', validade: '2026-10-20', status: 'expirado', dias: -8 },
  ];
  await contexto.telaLotes();
  let tela = elementos.get('conteudo').innerHTML;
  assert.match(tela, />12,5<small/);
  assert.match(tela, /perguntarCancelamento\(7, 'lote'\)/);
  assert.match(tela, /perguntarCancelamento\(8, 'lote'\)/);
  assert.doesNotMatch(tela, /perguntarCancelamento\(9/);
  assert.match(tela, /horário limite de retirada passou/);

  contexto.perguntarCancelamento(7, 'lote');
  assert.match(elementos.get('canc7').innerHTML, /class="confirmacao"/);
  assert.match(elementos.get('canc7').innerHTML, /cancelar\(7, 'lote'\)/);
  await contexto.cancelar(7, 'lote');
  assert.deepEqual(chamadas.find(([m]) => m === 'PUT'), ['PUT', '/lotes/7/cancelar']);
  assert.match(elementos.get('aviso').innerHTML, /Lote cancelado/);

  vm.runInContext("usuario = { perfil: 'receptora', nome: 'ONG' }", contexto);
  lotes = [{ id: 10, alimento: 'Minha', categoria: 'Panificados', quantidade_kg: '2.00', validade: '2026-10-29', status: 'reservado',
    dias: 1, doador: 'Doador', bairro: 'Centro', distancia_km: '1.0', codigo: '123456', tolerancia_minutos: 45,
    janela_inicio: '2026-10-28T14:00', janela_fim: '2026-10-28T15:00' }];
  await contexto.telaLotes();
  tela = elementos.get('conteudo').innerHTML;
  assert.match(tela, /mais 45 min de tolerância/);
  assert.match(tela, /perguntarCancelamento\(10, 'reserva'\)/);
  await contexto.cancelar(10, 'reserva');
  assert.ok(chamadas.some(([m, u]) => m === 'PUT' && u === '/lotes/10/cancelar-reserva'));
});

test('polimento: encerra a conexão de apoio com o banco de teste', () => db.end());
