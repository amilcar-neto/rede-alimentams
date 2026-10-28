import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import WebSocket from 'ws';
import { call, login, dia, hoje, janela, checklist, retiradaAte } from './helpers.mjs';
import { testClient, testConnection } from './reset-db.mjs';

const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken');
const db = testClient(testConnection().connectionString);
await db.connect();

const URL_WS = 'ws://127.0.0.1:3100/ws';
const abertas = [];
let comper, sabor, esperanca, amambai, longe;
let ids = {};

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function aguardar(condicao, ms, descricao) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    const valor = condicao();
    if (valor) return valor;
    await dormir(25);
  }
  assert.fail('Tempo esgotado: ' + descricao);
}

// Cliente real do pacote ws: JWT no primeiro frame e fila de quadros recebidos.
function abrir(url = URL_WS) {
  const ws = new WebSocket(url);
  const c = { ws, quadros: [], fechou: null, codigo: null };
  ws.on('message', (dados) => c.quadros.push(JSON.parse(dados.toString())));
  ws.on('close', (codigo) => { c.fechou = Date.now(); c.codigo = codigo; });
  ws.on('error', () => {});
  abertas.push(c);
  c.aberto = new Promise((resolve) => { ws.on('open', resolve); ws.on('close', resolve); });
  return c;
}
async function conectar(token) {
  const c = abrir();
  await c.aberto;
  c.ws.send(token);
  await aguardar(() => c.quadros.some((q) => q.tipo === 'autenticado'), 2000, 'confirmação de autenticação');
  return c;
}
const recebido = (c, tipo, lote) => c.quadros.find((q) => q.tipo === tipo && q.lote_id === lote);
const esperarEvento = (c, tipo, lote, ms = 2000) => aguardar(() => recebido(c, tipo, lote), ms, `${tipo} do lote ${lote}`);
const semEvento = (c, lote) => assert.deepEqual(c.quadros.filter((q) => q.lote_id === lote), []);

const publicar = async (token = comper, validade = dia(3)) => {
  const r = await call('POST', '/lotes', { alimento: 'Lote L05', categoria: 'Panificados', quantidade_kg: 4, validade, retirada_ate: retiradaAte(validade) }, token);
  assert.equal(r.s, 201, JSON.stringify(r));
  return r.d.id;
};
const reservar = (id, token = esperanca) => call('PUT', `/lotes/${id}/reservar`, janela(), token);
const notificacoesDe = async (email, lote) => (await db.query(
  `SELECT n.* FROM notificacoes n JOIN usuarios u ON u.id = n.usuario_id WHERE u.email = $1 AND n.lote_id = $2 ORDER BY n.id`,
  [email, lote])).rows;
const envelhecer = (id) => db.query(
  `UPDATE lotes SET janela_inicio = now() - interval '120 minutes', janela_fim = now() - interval '60 minutes' WHERE id=$1`, [id]);

test('L05 prepara contas sintéticas existentes', async () => {
  [comper, sabor, esperanca, amambai, longe] = await Promise.all(
    ['comper', 'sabor', 'esperanca', 'amambai', 'longe'].map((n) => login(`${n}@demo.com`)));
});

test('L05 conexão sem token, com token inválido/expirado ou binário é derrubada; token na URL não autentica', async () => {
  const ociosa = abrir();               // nunca envia o JWT: cai em 5 s
  const naUrl = abrir(`${URL_WS}?token=${encodeURIComponent(esperanca)}`);
  const lixo = abrir();
  const forjado = abrir();
  const expirado = abrir();
  const binario = abrir();
  const segredo = process.env.JWT_SECRET;
  await Promise.all([ociosa, naUrl, lixo, forjado, expirado, binario].map((c) => c.aberto));
  const aberturaOciosa = Date.now();
  lixo.ws.send('isto-nao-e-um-jwt');
  forjado.ws.send(jwt.sign({ id: 4, perfil: 'receptora' }, 'outro-segredo'));
  expirado.ws.send(jwt.sign({ id: 4, perfil: 'receptora' }, segredo, { expiresIn: -10 }));
  binario.ws.send(Buffer.from(esperanca));
  for (const c of [lixo, forjado, expirado, binario]) {
    await aguardar(() => c.fechou, 2000, 'fechamento imediato');
    assert.equal(c.codigo, 1008);
    assert.deepEqual(c.quadros, []);
  }
  await aguardar(() => ociosa.fechou && naUrl.fechou, 7000, 'fechamento por falta de autenticação em 5 s');
  assert.equal(ociosa.codigo, 1008);
  assert.equal(naUrl.codigo, 1008);
  assert.ok(ociosa.fechou - aberturaOciosa >= 4000 && ociosa.fechou - aberturaOciosa < 6500, 'prazo de ~5 s');
  assert.deepEqual(ociosa.quadros, []);
});

test('L05 caminho diferente de /ws não abre WebSocket', async () => {
  const c = abrir('ws://127.0.0.1:3100/ws-outro');
  await c.aberto;
  assert.notEqual(c.ws.readyState, WebSocket.OPEN);
});

test('L05 lote_publicado: ONG no raio recebe em até 2 s; fora do raio, doadores e conexão sem JWT não recebem', async () => {
  const [ws1, ws2, wsLonge, wsDoador, wsOutroDoador] = await Promise.all(
    [esperanca, amambai, longe, comper, sabor].map(conectar));
  const anonima = abrir(); await anonima.aberto;
  const inicio = Date.now();
  const id = await publicar(comper, dia(3));
  ids.publicado = id;
  const evento = await esperarEvento(ws1, 'lote_publicado', id);
  await esperarEvento(ws2, 'lote_publicado', id);
  assert.ok(Date.now() - inicio < 2000);
  assert.equal(evento.urgente, false);
  assert.equal(evento.lida, false);
  assert.deepEqual(Object.keys(evento).sort(), ['criado_em', 'id', 'lida', 'lote_id', 'mensagem', 'tipo', 'urgente']);
  assert.match(evento.mensagem, /Lote L05/);
  await dormir(400);
  for (const c of [wsLonge, wsDoador, wsOutroDoador, anonima]) semEvento(c, id);
  assert.equal((await notificacoesDe('longe@demo.com', id)).length, 0);
  assert.equal((await notificacoesDe('comper@demo.com', id)).length, 0);
  assert.equal((await notificacoesDe('sabor@demo.com', id)).length, 0);
  for (const c of [ws1, ws2, wsLonge, wsDoador, wsOutroDoador, anonima]) c.ws.close();
});

test('L05 urgência: vence hoje ou amanhã é urgente; depois disso não', async () => {
  const c = await conectar(esperanca);
  const casos = [[hoje, true], [dia(1), true], [dia(2), false]];
  for (const [validade, urgente] of casos) {
    const id = await publicar(comper, validade);
    const q = await esperarEvento(c, 'lote_publicado', id);
    assert.equal(q.urgente, urgente, validade);
    assert.equal((await notificacoesDe('esperanca@demo.com', id))[0].urgente, urgente);
  }
  c.ws.close();
});

test('L05 persistência sem WebSocket: lista, contador e marcar como lida apenas das próprias', async () => {
  // Nenhuma conexão aberta: a publicação continua gravando as notificações.
  const id = await publicar(comper, dia(3));
  const minhas = await call('GET', '/notificacoes', undefined, esperanca);
  assert.equal(minhas.s, 200);
  assert.ok(Number.isInteger(minhas.d.nao_lidas) && minhas.d.nao_lidas >= 1);
  const nova = minhas.d.itens.find((n) => n.lote_id === id);
  assert.ok(nova, 'notificação da ONG próxima');
  assert.deepEqual(Object.keys(nova).sort(), ['criado_em', 'id', 'lida', 'lote_id', 'mensagem', 'tipo', 'urgente']);
  assert.equal(nova.lida, false);
  assert.equal(nova.tipo, 'lote_publicado');
  assert.ok(!(await call('GET', '/notificacoes', undefined, longe)).d.itens.some((n) => n.lote_id === id));
  assert.ok(!(await call('GET', '/notificacoes', undefined, comper)).d.itens.some((n) => n.lote_id === id));

  // IDOR: outra ONG não marca nem descobre a notificação alheia.
  const alheia = await call('PUT', `/notificacoes/${nova.id}/lida`, undefined, amambai);
  assert.equal(alheia.s, 404);
  assert.deepEqual(Object.keys(alheia.d), ['erro']);
  assert.equal((await db.query('SELECT lida_em FROM notificacoes WHERE id=$1', [nova.id])).rows[0].lida_em, null);
  assert.equal((await call('PUT', `/notificacoes/${nova.id}/lida`, undefined, comper)).s, 404);
  assert.equal((await call('PUT', '/notificacoes/2147483647/lida', undefined, esperanca)).s, 404);
  assert.equal((await call('PUT', '/notificacoes/abc/lida', undefined, esperanca)).s, 400);
  assert.equal((await call('PUT', `/notificacoes/${nova.id}/lida`)).s, 401);
  assert.equal((await call('GET', '/notificacoes')).s, 401);
  assert.equal((await call('PUT', '/notificacoes/lidas')).s, 401);

  const antes = minhas.d.nao_lidas;
  const marcada = await call('PUT', `/notificacoes/${nova.id}/lida`, undefined, esperanca);
  assert.equal(marcada.s, 200);
  assert.equal(marcada.d.lida, true);
  assert.equal((await call('PUT', `/notificacoes/${nova.id}/lida`, undefined, esperanca)).s, 200); // idempotente
  const depois = await call('GET', '/notificacoes', undefined, esperanca);
  assert.equal(depois.d.nao_lidas, antes - 1);
  assert.equal(depois.d.itens.find((n) => n.id === nova.id).lida, true);

  // "Marcar todas" também é restrito ao próprio usuário.
  const deAmambai = (await call('GET', '/notificacoes', undefined, amambai)).d.nao_lidas;
  assert.ok(deAmambai >= 1);
  const todas = await call('PUT', '/notificacoes/lidas', undefined, esperanca);
  assert.equal(todas.s, 200);
  assert.equal((await call('GET', '/notificacoes', undefined, esperanca)).d.nao_lidas, 0);
  assert.equal((await call('GET', '/notificacoes', undefined, amambai)).d.nao_lidas, deAmambai);
  assert.equal((await call('PUT', '/notificacoes/lidas', { extra: 1 }, esperanca)).s, 400);
});

test('L05 lote_reservado vai só ao doador, sem código de retirada; retirada_confirmada só à receptora que reservou', async () => {
  const [wsEsp, wsAmb, wsLonge, wsDoador, wsOutro] = await Promise.all(
    [esperanca, amambai, longe, comper, sabor].map(conectar));
  const id = await publicar(comper, dia(3));
  await esperarEvento(wsAmb, 'lote_publicado', id);
  const r = await reservar(id, esperanca);
  assert.equal(r.s, 200, JSON.stringify(r));
  const reservado = await esperarEvento(wsDoador, 'lote_reservado', id);
  assert.match(reservado.mensagem, /Casa de Apoio Esperança/);
  assert.ok(!reservado.mensagem.includes(r.d.codigo));
  assert.ok(!('codigo' in reservado) && !('usuario_id' in reservado));
  await dormir(400);
  for (const c of [wsEsp, wsAmb, wsLonge, wsOutro]) assert.equal(recebido(c, 'lote_reservado', id), undefined);
  const gravada = await notificacoesDe('comper@demo.com', id);
  assert.deepEqual(gravada.map((n) => n.tipo), ['lote_reservado']);
  assert.ok(!gravada[0].mensagem.includes(r.d.codigo));

  const confirmar = await call('PUT', `/lotes/${id}/confirmar-retirada`, { codigo: r.d.codigo, checklist }, comper);
  assert.equal(confirmar.s, 200, JSON.stringify(confirmar));
  const retirada = await esperarEvento(wsEsp, 'retirada_confirmada', id);
  assert.ok(!retirada.mensagem.includes(r.d.codigo));
  assert.ok(!JSON.stringify(retirada).includes(confirmar.d.hash));
  await dormir(400);
  for (const c of [wsAmb, wsLonge, wsDoador, wsOutro]) assert.equal(recebido(c, 'retirada_confirmada', id), undefined);
  assert.deepEqual((await notificacoesDe('esperanca@demo.com', id)).map((n) => n.tipo), ['lote_publicado', 'retirada_confirmada']);
  assert.equal((await notificacoesDe('amambai@demo.com', id)).some((n) => n.tipo === 'retirada_confirmada'), false);
  assert.equal((await notificacoesDe('comper@demo.com', id)).some((n) => n.tipo === 'retirada_confirmada'), false);
  for (const c of [wsEsp, wsAmb, wsLonge, wsDoador, wsOutro]) c.ws.close();
});

test('L05 reserva recusada ou fora do raio não cria notificação para o doador', async () => {
  const id = await publicar(comper, dia(3));
  assert.equal((await reservar(id, longe)).s, 409);
  assert.equal((await reservar(id, comper)).s, 403);
  assert.equal((await notificacoesDe('comper@demo.com', id)).length, 0);
  assert.equal((await call('PUT', `/lotes/${id}/reservar`, { janela_inicio: 'x', janela_fim: 'y' }, esperanca)).s, 400);
  assert.equal((await notificacoesDe('comper@demo.com', id)).length, 0);
});

test('L05 lote_liberado vai só às receptoras no raio; chamadas simultâneas geram uma notificação por destinatário', async () => {
  const id = await publicar(comper, dia(3));
  assert.equal((await reservar(id, esperanca)).s, 200);
  const [wsEsp, wsAmb, wsLonge, wsDoador, wsOutro] = await Promise.all(
    [esperanca, amambai, longe, comper, sabor].map(conectar));
  await envelhecer(id);
  // A liberação é preguiçosa: várias rotas de lotes ao mesmo tempo disputam a mesma transição.
  const respostas = await Promise.all([amambai, esperanca, amambai, longe, comper, esperanca, sabor, amambai]
    .map((t) => call('GET', '/lotes', undefined, t)));
  assert.ok(respostas.every((x) => x.s === 200));
  const liberado = await esperarEvento(wsAmb, 'lote_liberado', id);
  await esperarEvento(wsEsp, 'lote_liberado', id);
  assert.equal(liberado.urgente, false);
  await dormir(400);
  for (const c of [wsLonge, wsDoador, wsOutro]) semEvento(c, id);
  for (const c of [wsEsp, wsAmb]) assert.equal(c.quadros.filter((q) => q.tipo === 'lote_liberado' && q.lote_id === id).length, 1);
  for (const [email, esperado] of [['esperanca@demo.com', 1], ['amambai@demo.com', 1], ['longe@demo.com', 0], ['comper@demo.com', 0], ['sabor@demo.com', 0]]) {
    assert.equal((await notificacoesDe(email, id)).filter((n) => n.tipo === 'lote_liberado').length, esperado, email);
  }
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM eventos_lote WHERE lote_id=$1 AND tipo='liberado'`, [id])).rows[0].n, 1);
  for (const c of [wsEsp, wsAmb, wsLonge, wsDoador, wsOutro]) c.ws.close();
});

test('L05 liberação de lote que vence hoje ou amanhã é marcada urgente', async () => {
  const id = await publicar(comper, dia(1));
  assert.equal((await reservar(id, esperanca)).s, 200);
  await envelhecer(id);
  assert.equal((await call('GET', '/lotes', undefined, amambai)).s, 200);
  const n = (await notificacoesDe('amambai@demo.com', id)).find((x) => x.tipo === 'lote_liberado');
  assert.equal(n.urgente, true);
});

test('L03 reserva atrasada com horário limite vencido expira sem notificar lote_liberado', async () => {
  const id = await publicar(comper, dia(1));
  assert.equal((await reservar(id, esperanca)).s, 200);
  await envelhecer(id);
  await db.query(`UPDATE lotes SET retirada_ate = now() - interval '1 minute' WHERE id=$1`, [id]);
  const respostas = await Promise.all([amambai, esperanca, comper, amambai].map((t) => call('GET', '/lotes', undefined, t)));
  assert.ok(respostas.every((x) => x.s === 200));
  assert.equal((await db.query('SELECT status FROM lotes WHERE id=$1', [id])).rows[0].status, 'expirado');
  assert.equal((await db.query('SELECT codigo FROM lotes WHERE id=$1', [id])).rows[0].codigo, null);
  for (const email of ['esperanca@demo.com', 'amambai@demo.com', 'longe@demo.com', 'comper@demo.com'])
    assert.equal((await notificacoesDe(email, id)).some((n) => n.tipo === 'lote_liberado'), false, email);
  assert.deepEqual(
    (await db.query('SELECT tipo FROM eventos_lote WHERE lote_id=$1 ORDER BY id', [id])).rows.map((x) => x.tipo),
    ['publicado', 'reservado', 'expirado']);
  assert.equal((await reservar(id, amambai)).s, 409);
});

test('L05 reservas simultâneas do mesmo lote geram uma única notificação ao doador', async () => {
  const id = await publicar(comper, dia(3));
  const respostas = await Promise.all([esperanca, amambai, esperanca, amambai, longe, esperanca].map((t) => reservar(id, t)));
  assert.equal(respostas.filter((x) => x.s === 200).length, 1);
  assert.equal((await notificacoesDe('comper@demo.com', id)).filter((n) => n.tipo === 'lote_reservado').length, 1);
});

test('L05 a sessão do WebSocket não sobrevive ao JWT e não troca de identidade', async () => {
  const curto = jwt.sign({ id: (await db.query(`SELECT id FROM usuarios WHERE email='esperanca@demo.com'`)).rows[0].id, perfil: 'receptora' },
    process.env.JWT_SECRET, { expiresIn: 2 });
  const c = await conectar(curto);
  await aguardar(() => c.fechou, 4500, 'encerramento na expiração do JWT');
  assert.equal(c.codigo, 1008);

  // Um segundo frame não troca a identidade: a conexão da ONG distante continua sem ver o lote da ONG próxima.
  const wsLonge = await conectar(longe);
  wsLonge.ws.send(esperanca);
  const id = await publicar(comper, dia(3));
  const wsEsp = await conectar(esperanca);
  const id2 = await publicar(comper, dia(3));
  await esperarEvento(wsEsp, 'lote_publicado', id2);
  await dormir(300);
  semEvento(wsLonge, id);
  semEvento(wsLonge, id2);
  wsLonge.ws.close(); wsEsp.ws.close();
});

test('L05 front: JWT só no primeiro frame, aviso/contador escapados, central, reconexão com espera crescente e logout', async () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const elementos = new Map();
  const temporizadores = [];
  const sockets = [];
  const requisicoes = [];
  let itens = [{ id: 5, tipo: 'lote_publicado', urgente: false, mensagem: 'Antiga', lote_id: 1, criado_em: '2026-10-28T15:00:00Z', lida: false }];
  const novoElemento = () => {
    const classes = new Set();
    return {
      value: '', innerHTML: '', textContent: '', className: '', attrs: {},
      classList: {
        add: (c) => classes.add(c), remove: (c) => classes.delete(c),
        toggle: (c, forcar) => ((forcar ?? !classes.has(c)) ? classes.add(c) : classes.delete(c)),
        contains: (c) => classes.has(c),
      },
      setAttribute(k, v) { this.attrs[k] = v; },
    };
  };
  class FalsoWebSocket {
    constructor(url) { this.url = url; this.enviados = []; sockets.push(this); }
    send(dados) { this.enviados.push(dados); }
    close() { this.fechado = true; }
  }
  const contexto = {
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: {
      getElementById: (nome) => { if (!elementos.has(nome)) elementos.set(nome, novoElemento()); return elementos.get(nome); },
      querySelector: () => null, activeElement: null,
    },
    location: { protocol: 'https:', host: 'exemplo.test' },
    WebSocket: FalsoWebSocket,
    setTimeout: (fn, ms) => { temporizadores.push({ fn, ms, cancelado: false }); return temporizadores.length; },
    clearTimeout: (id) => { if (temporizadores[id - 1]) temporizadores[id - 1].cancelado = true; },
    fetch: async (url, opcoes = {}) => {
      requisicoes.push(`${opcoes.method || 'GET'} ${url}`);
      const corpo = url === '/notificacoes' ? { nao_lidas: itens.filter((n) => !n.lida).length, itens } : { ok: true };
      return { ok: true, status: 200, json: async () => corpo };
    },
  };
  vm.createContext(contexto);
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], contexto);
  await new Promise((resolve) => setImmediate(resolve)); // deixa a rotina de início do front terminar sem sessão
  vm.runInContext("token = 'jwt-secreto'; usuario = { perfil: 'receptora', nome: 'ONG' }; abaAtual = 'doacoes'", contexto);
  const el = (nome) => elementos.get(nome);
  const reconexoes = () => temporizadores.filter((t) => !t.cancelado && t.fn.name === 'iniciarTempoReal');
  const ultimaEspera = () => reconexoes().at(-1).ms;

  contexto.iniciarTempoReal();
  assert.equal(sockets[0].url, 'wss://exemplo.test/ws');
  assert.ok(!sockets[0].url.includes('jwt-secreto'));
  sockets[0].onopen();
  assert.deepEqual(sockets[0].enviados, ['jwt-secreto']);
  sockets[0].onmessage({ data: JSON.stringify({ tipo: 'autenticado' }) });

  await contexto.carregarNotificacoes();
  assert.equal(el('contador').textContent, '1');
  assert.ok(!el('contador').classList.contains('oculto'));

  sockets[0].onmessage({ data: JSON.stringify({ id: 6, tipo: 'lote_publicado', urgente: true, mensagem: '<img src=x onerror=alert(1)>', lote_id: 2, criado_em: '2026-10-28T16:00:00Z', lida: false }) });
  assert.equal(el('contador').textContent, '2');
  assert.ok(el('toast').innerHTML.includes('&lt;img') && !el('toast').innerHTML.includes('<img'));
  assert.ok(el('toast').className.includes('urgente'));
  sockets[0].onmessage({ data: JSON.stringify({ id: 6, tipo: 'lote_publicado', urgente: true, mensagem: 'duplicada', lote_id: 2, criado_em: '2026-10-28T16:00:00Z', lida: false }) });
  assert.equal(el('contador').textContent, '2');
  sockets[0].onmessage({ data: 'não é JSON' });
  sockets[0].onmessage({ data: JSON.stringify({ tipo: 'qualquer', mensagem: 1 }) });
  assert.equal(el('contador').textContent, '2');

  contexto.alternarCentral();
  assert.ok(!el('central').classList.contains('oculto'));
  assert.equal(el('sino').attrs['aria-expanded'], 'true');
  assert.ok(el('central').innerHTML.includes('&lt;img') && !el('central').innerHTML.includes('<img'));
  assert.match(el('central').innerHTML, /urgente/);
  assert.match(el('central').innerHTML, /marcarLida\(6\)/);
  itens = [{ ...itens[0], lida: true }];
  await contexto.marcarLida(6);
  assert.ok(requisicoes.includes('PUT /notificacoes/6/lida'));
  assert.equal(el('contador').textContent, '1');
  await contexto.marcarTodasLidas();
  assert.ok(requisicoes.includes('PUT /notificacoes/lidas'));
  assert.ok(el('contador').classList.contains('oculto'));

  // Reconexão com espera crescente (1 s, 2 s, 4 s) que zera após autenticar de novo.
  const esperas = [];
  for (let i = 0; i < 3; i++) {
    sockets.at(-1).onclose({ code: 1006 });
    esperas.push(ultimaEspera());
    const pendente = reconexoes().at(-1);
    pendente.cancelado = true;
    pendente.fn();
  }
  assert.deepEqual(esperas, [1000, 2000, 4000]);
  assert.equal(sockets.length, 4);
  sockets.at(-1).onopen();
  sockets.at(-1).onmessage({ data: JSON.stringify({ tipo: 'autenticado' }) });
  sockets.at(-1).onclose({ code: 1006 });
  assert.equal(ultimaEspera(), 1000);

  // Logout fecha a conexão e impede nova tentativa.
  const aberta = sockets.at(-1);
  assert.equal(reconexoes().length, 1);
  contexto.sair();
  assert.equal(reconexoes().length, 0);
  assert.ok(!aberta.fechado || aberta.onclose === null);
  assert.equal(el('contador').textContent, '0');
  assert.ok(el('central').classList.contains('oculto'));

  // Limite de sessões (4001): a aba que cedeu a vaga não reconecta nem expulsa outra em ciclo.
  vm.runInContext("token = 'jwt-secreto'; usuario = { perfil: 'receptora', nome: 'ONG' }", contexto);
  contexto.iniciarTempoReal();
  sockets.at(-1).onopen();
  sockets.at(-1).onmessage({ data: JSON.stringify({ tipo: 'autenticado' }) });
  const antes = sockets.length;
  const reconexoesAntes = reconexoes().length;
  sockets.at(-1).onclose({ code: 4001 });
  assert.equal(reconexoes().length, reconexoesAntes, 'sem nova tentativa de reconexão');
  assert.equal(sockets.length, antes);
  assert.match(el('toast').innerHTML, /Tempo real suspenso/);
  contexto.sair();
});

test('L05 sexta conexão da mesma conta fecha só a mais antiga com código 4001 próprio; as outras seguem entregando', async () => {
  const sessoes = [];
  for (let i = 0; i < 5; i++) sessoes.push(await conectar(esperanca));
  const sexta = await conectar(esperanca);
  await aguardar(() => sessoes[0].fechou, 2000, 'fechamento da conexão mais antiga');
  assert.equal(sessoes[0].codigo, 4001, 'código distinto de 1008 (autenticação) para o front não reconectar');
  await dormir(200);
  for (const c of [...sessoes.slice(1), sexta]) assert.equal(c.fechou, null, 'as demais continuam abertas');
  const id = await publicar(comper, dia(3));
  for (const c of [...sessoes.slice(1), sexta]) await esperarEvento(c, 'lote_publicado', id);
  for (const c of [...sessoes, sexta]) c.ws.close();
});

test('L05 encerra conexões de apoio', async () => {
  for (const c of abertas) { try { c.ws.terminate(); } catch { /* já fechada */ } }
  await db.end();
});
