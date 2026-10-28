import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { call, login, dia, hoje, janela, local, checklist } from './helpers.mjs';
import { testClient, testConnection } from './reset-db.mjs';

let comper, sabor, esperanca, amambai, longe;
const db = testClient(testConnection().connectionString);
await db.connect();

const publicar = async (token = comper, validade = dia(2)) => {
  const r = await call('POST', '/lotes', { alimento: 'Lote L02', categoria: 'Panificados', quantidade_kg: 4, validade }, token);
  assert.equal(r.s, 201, JSON.stringify(r));
  return r.d.id;
};
// Sem o 3º argumento envia uma janela válida; passar undefined explicitamente envia sem corpo.
const reservar = (id, token, ...corpo) => call('PUT', `/lotes/${id}/reservar`, corpo.length ? corpo[0] : janela(), token);
const confirmar = (id, codigo, token = comper) => call('PUT', `/lotes/${id}/confirmar-retirada`, { codigo, checklist }, token);
const estado = async (id) => (await db.query('SELECT * FROM lotes WHERE id=$1', [id])).rows[0];
const eventos = async (id) => (await db.query(
  'SELECT tipo, usuario_id FROM eventos_lote WHERE lote_id=$1 ORDER BY id', [id])).rows;
const tipos = async (id) => (await eventos(id)).map((e) => e.tipo);
const usuarioId = async (email) => (await db.query('SELECT id FROM usuarios WHERE email=$1', [email])).rows[0].id;
const envelhecer = (id, minutosApos) => db.query(
  `UPDATE lotes SET janela_inicio = now() - make_interval(mins => $2 + 60), janela_fim = now() - make_interval(mins => $2) WHERE id=$1`,
  [id, minutosApos]);
const doadorVe = async (id) => (await call('GET', '/lotes', undefined, comper)).d.find((l) => l.id === id);
const ongVe = async (id, token) => (await call('GET', '/lotes', undefined, token)).d.find((l) => l.id === id);
const mensagem = (r) => r.d?.erro ?? '';

test('L02 prepara contas sintéticas existentes', async () => {
  [comper, sabor, esperanca, amambai, longe] = await Promise.all(
    ['comper', 'sabor', 'esperanca', 'amambai', 'longe'].map((n) => login(`${n}@demo.com`)));
});

test('L02 janela inválida → 400 em JSON e o lote continua disponível', async () => {
  const id = await publicar(comper, hoje);
  const limite = dia(1) + 'T00:00';
  const casos = [
    ['sem janela', undefined, /Informe o início e o fim/],
    ['corpo vazio', {}, /Informe o início e o fim/],
    ['só início', { janela_inicio: local() }, /Informe o início e o fim/],
    ['fim antes do início', { janela_inicio: local(30), janela_fim: local(10) }, /depois do início/],
    ['fim igual ao início', { janela_inicio: local(10), janela_fim: local(10) }, /depois do início/],
    ['mais de 2 h', { janela_inicio: local(), janela_fim: local(121) }, /máximo 2 horas/],
    ['início no passado', { janela_inicio: local(-30), janela_fim: local(30) }, /passado/],
    ['fim no passado', { janela_inicio: local(-30), janela_fim: local(-20) }, /passado/],
    ['fora do limite (fim do dia da validade)', { janela_inicio: limite, janela_fim: dia(1) + 'T00:30' }, /fim do dia da validade/],
    ['formato com fuso', { janela_inicio: local() + ':00Z', janela_fim: local(30) }, /no máximo|formato/],
    ['data inexistente', { janela_inicio: '2026-02-31T10:00', janela_fim: '2026-02-31T11:00' }, /inválido/],
    ['hora 25', { janela_inicio: dia(1) + 'T25:00', janela_fim: dia(1) + 'T26:00' }, /inválido/],
    ['tipo número', { janela_inicio: 123, janela_fim: 456 }, /texto/],
    ['tipo null', { janela_inicio: null, janela_fim: null }, /texto/],
    ['tipo array', { janela_inicio: [], janela_fim: {} }, /texto/],
    ['campo extra', { ...janela(hoje), extra: 1 }, /não permitidos/],
  ];
  for (const [nome, corpo, padrao] of casos) {
    const r = await reservar(id, esperanca, corpo);
    assert.equal(r.s, 400, `${nome}: ${JSON.stringify(r)}`);
    assert.match(mensagem(r), padrao, nome);
    assert.deepEqual(Object.keys(r.d), ['erro']);
  }
  const lote = await estado(id);
  assert.equal(lote.status, 'disponivel');
  assert.equal(lote.janela_inicio, null);
  assert.deepEqual(await tipos(id), ['publicado']);
  // Janela válida dentro do limite do dia da validade.
  const ok = await reservar(id, esperanca, janela(hoje));
  assert.equal(ok.s, 200, JSON.stringify(ok));
});

test('L02 janela de exatamente 2 h é aceita; lote indisponível mantém 409', async () => {
  const id = await publicar();
  const dois = { janela_inicio: local(), janela_fim: local(120) };
  const r = await reservar(id, esperanca, dois);
  assert.equal(r.s, 200, JSON.stringify(r));
  assert.match(r.d.codigo, /^\d{6}$/);
  const lote = await estado(id);
  assert.equal(lote.status, 'reservado');
  assert.ok(lote.janela_fim - lote.janela_inicio >= 119 * 60000);
  assert.equal((await reservar(id, amambai)).s, 409);
  assert.equal((await reservar(2147483647, esperanca)).s, 409);
  assert.equal((await reservar(await publicar(), longe)).s, 409);
});

test('L02 doador e a ONG reservante veem a janela; outra ONG não vê o lote reservado', async () => {
  const id = await publicar();
  const corpo = { janela_inicio: local(), janela_fim: local(90) };
  const r = await reservar(id, esperanca, corpo);
  assert.equal(r.s, 200);
  const doador = await doadorVe(id);
  assert.equal(doador.status, 'reservado');
  assert.equal(doador.reservado_por_nome, 'Casa de Apoio Esperança');
  assert.equal(doador.janela_inicio, corpo.janela_inicio);
  assert.equal(doador.janela_fim, corpo.janela_fim);
  const ong = await ongVe(id, esperanca);
  assert.equal(ong.codigo, r.d.codigo);
  assert.equal(ong.janela_inicio, corpo.janela_inicio);
  assert.equal(ong.janela_fim, corpo.janela_fim);
  assert.equal(await ongVe(id, amambai), undefined);
});

test('L02 janela vencida volta a disponível, outra ONG reserva e o código antigo não confirma', async () => {
  const id = await publicar();
  const antiga = await reservar(id, esperanca);
  assert.equal(antiga.s, 200);
  const esperancaId = await usuarioId('esperanca@demo.com');

  // Dentro da tolerância (janela terminou há 10 min < 30 min): a reserva continua.
  await envelhecer(id, 10);
  assert.equal((await doadorVe(id)).status, 'reservado');
  assert.equal((await estado(id)).codigo, antiga.d.codigo);
  assert.deepEqual(await tipos(id), ['publicado', 'reservado']);

  // Além da tolerância (31 min): liberada, sem reserva nem código.
  await envelhecer(id, 31);
  const visto = await ongVe(id, amambai);
  assert.equal(visto?.status, 'disponivel');
  assert.equal(visto.codigo, null);
  const livre = await estado(id);
  assert.equal(livre.status, 'disponivel');
  for (const campo of ['reservado_por', 'reservado_em', 'codigo', 'janela_inicio', 'janela_fim'])
    assert.equal(livre[campo], null, campo);
  assert.equal((await doadorVe(id)).status, 'disponivel');
  assert.equal((await ongVe(id, esperanca)).codigo, null);
  assert.deepEqual(await eventos(id), [
    { tipo: 'publicado', usuario_id: await usuarioId('comper@demo.com') },
    { tipo: 'reservado', usuario_id: esperancaId },
    { tipo: 'liberado', usuario_id: esperancaId },
  ]);

  // O código antigo não confirma um lote sem reserva: 409.
  const semReserva = await confirmar(id, antiga.d.codigo);
  assert.equal(semReserva.s, 409, JSON.stringify(semReserva));
  assert.equal((await estado(id)).status, 'disponivel');

  // Redirecionamento: outra ONG reserva e recebe outro código.
  let nova = await reservar(id, amambai);
  assert.equal(nova.s, 200, JSON.stringify(nova));
  if (nova.d.codigo === antiga.d.codigo) { // 1 em 10^6: garante código distinto para o teste
    await envelhecer(id, 31);
    nova = await reservar(id, amambai);
  }
  assert.notEqual(nova.d.codigo, antiga.d.codigo);
  assert.equal((await confirmar(id, antiga.d.codigo)).s, 400);
  assert.equal((await estado(id)).status, 'reservado');
  assert.equal((await confirmar(id, nova.d.codigo)).s, 200);
  const final = await tipos(id);
  assert.equal(final.at(-1), 'entregue');
  assert.deepEqual(final.slice(0, 3), ['publicado', 'reservado', 'liberado']);
  assert.equal((await db.query('SELECT 1 FROM doacoes WHERE lote_id=$1', [id])).rowCount, 1);
  assert.equal((await db.query('SELECT receptor_id FROM doacoes WHERE lote_id=$1', [id])).rows[0].receptor_id,
    await usuarioId('amambai@demo.com'));
});

test('L02 chamadas simultâneas liberam a reserva uma única vez', async () => {
  const id = await publicar();
  assert.equal((await reservar(id, esperanca)).s, 200);
  await envelhecer(id, 45);
  const respostas = await Promise.all(Array.from({ length: 12 }, (_, i) =>
    call('GET', '/lotes', undefined, i % 2 ? comper : esperanca)));
  assert.ok(respostas.every((r) => r.s === 200), respostas.map((r) => r.s).join());
  assert.deepEqual(await tipos(id), ['publicado', 'reservado', 'liberado']);
});

test('L02 lote vencido disponível vira expirado: invisível às ONGs e não reservável', async () => {
  const id = await publicar(comper, hoje);
  await db.query(`UPDATE lotes SET validade = validade - 1 WHERE id=$1`, [id]);
  for (const token of [esperanca, amambai]) assert.equal(await ongVe(id, token), undefined);
  assert.equal((await estado(id)).status, 'expirado');
  assert.equal((await reservar(id, esperanca)).s, 409);
  assert.equal((await confirmar(id, '123456')).s, 409);
  const doador = await doadorVe(id);
  assert.equal(doador.status, 'expirado');
  assert.ok(doador.dias < 0);
  assert.deepEqual(await eventos(id), [
    { tipo: 'publicado', usuario_id: await usuarioId('comper@demo.com') },
    { tipo: 'expirado', usuario_id: null },
  ]);
  // Chamadas repetidas não duplicam o evento.
  await call('GET', '/lotes', undefined, comper);
  assert.deepEqual(await tipos(id), ['publicado', 'expirado']);
});

test('L02 lote reservado que vence não confirma, mesmo com o código correto (409)', async () => {
  const id = await publicar(comper, hoje);
  const r = await reservar(id, esperanca, janela(hoje));
  assert.equal(r.s, 200, JSON.stringify(r));
  await db.query(`UPDATE lotes SET validade = validade - 1 WHERE id=$1`, [id]);
  const tentativa = await confirmar(id, r.d.codigo);
  assert.equal(tentativa.s, 409, JSON.stringify(tentativa));
  assert.match(mensagem(tentativa), /expirou/);
  const lote = await estado(id);
  assert.equal(lote.status, 'expirado');
  assert.equal(lote.codigo, null);
  assert.equal(await ongVe(id, esperanca), undefined);
  assert.equal((await db.query('SELECT 1 FROM doacoes WHERE lote_id=$1', [id])).rowCount, 0);
  assert.deepEqual(await tipos(id), ['publicado', 'reservado', 'expirado']);
});

test('L02 confirmar em lote alheio ou entregue segue 400; só o dono vê 409 por estado', async () => {
  const id = await publicar(comper, hoje);
  await db.query(`UPDATE lotes SET validade = validade - 1 WHERE id=$1`, [id]);
  assert.equal((await confirmar(id, '123456', sabor)).s, 400);
  assert.equal((await confirmar(id, '123456', comper)).s, 409);
});

test('L02 histórico: publicado, reservado, entregue e lotes semeados', async () => {
  const id = await publicar();
  const r = await reservar(id, amambai);
  assert.equal((await confirmar(id, r.d.codigo)).s, 200);
  assert.deepEqual(await eventos(id), [
    { tipo: 'publicado', usuario_id: await usuarioId('comper@demo.com') },
    { tipo: 'reservado', usuario_id: await usuarioId('amambai@demo.com') },
    { tipo: 'entregue', usuario_id: await usuarioId('comper@demo.com') },
  ]);
  // Recusas não geram evento.
  const recusado = await publicar();
  await reservar(recusado, esperanca, { janela_inicio: local(), janela_fim: local(500) });
  assert.deepEqual(await tipos(recusado), ['publicado']);
  const semeados = await db.query(`SELECT count(*)::int AS n FROM eventos_lote WHERE lote_id <= 4 AND tipo='publicado'`);
  assert.equal(semeados.rows[0].n, 4);
  await assert.rejects(db.query(`INSERT INTO eventos_lote (lote_id, tipo) VALUES (1, 'inventado')`), { code: '23514' });
});

test('L02 "Meus lotes" do doador traz ativos e depois expirados; ONG nunca recebe expirados', async () => {
  const ativo = await publicar(sabor);
  const vencido = await publicar(sabor, hoje);
  await db.query(`UPDATE lotes SET validade = validade - 1 WHERE id=$1`, [vencido]);
  const lista = (await call('GET', '/lotes', undefined, sabor)).d;
  const posicao = (id) => lista.findIndex((l) => l.id === id);
  assert.ok(posicao(ativo) >= 0 && posicao(vencido) > posicao(ativo));
  assert.ok(lista.slice(0, posicao(vencido)).every((l) => l.status !== 'expirado'));
  assert.ok(lista.slice(posicao(vencido)).every((l) => l.status === 'expirado'));
  for (const token of [esperanca, amambai])
    assert.ok(!(await call('GET', '/lotes', undefined, token)).d.some((l) => l.status === 'expirado'));
});

test('L02 front: vencido ≠ vence hoje, janela hh:mm–hh:mm, ativos separados dos expirados e formulário de janela', async () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const elementos = new Map();
  let lotes = [];
  const contexto = {
    localStorage: { getItem: () => null },
    document: { getElementById: (nome) => {
      if (!elementos.has(nome)) elementos.set(nome, { value: '', innerHTML: '' });
      return elementos.get(nome);
    } },
    fetch: async () => ({ ok: true, status: 200, json: async () => lotes }),
  };
  vm.createContext(contexto);
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], contexto);
  assert.match(contexto.tagValidade(-1), /vencido/);
  assert.doesNotMatch(contexto.tagValidade(-3), /vence hoje/);
  assert.match(contexto.tagValidade(0), /vence hoje/);
  assert.match(contexto.tagValidade(1), /vence amanhã/);

  const agora = new Date('2026-10-28T15:00:00Z'); // 11:00 em Campo Grande
  assert.equal(contexto.agoraLocal(agora), '2026-10-28T11:00');
  assert.equal(contexto.agoraLocal(agora, 60), '2026-10-28T12:00');
  assert.equal(contexto.agoraLocal(new Date('2026-10-29T03:59:00Z')), '2026-10-28T23:59');
  assert.equal(contexto.agoraLocal(new Date('2026-10-29T04:00:00Z')), '2026-10-29T00:00');
  assert.equal(contexto.diaSeguinte('2026-12-31'), '2027-01-01');
  assert.equal(contexto.textoJanela({ janela_inicio: '2026-10-28T14:00', janela_fim: '2026-10-28T15:30' }, agora), '14:00–15:30');
  assert.equal(contexto.textoJanela({ janela_inicio: '2026-10-29T09:00', janela_fim: '2026-10-29T10:00' }, agora), '29/10 09:00–10:00');

  vm.runInContext("usuario = { perfil: 'doador', nome: 'Doador' }", contexto);
  lotes = [
    { id: 1, alimento: 'Ativo <b>', categoria: 'Panificados', quantidade_kg: '4.00', validade: '2026-10-30', status: 'reservado', dias: 2,
      reservado_por_nome: 'ONG <X>', janela_inicio: '2026-10-28T14:00', janela_fim: '2026-10-28T15:00' },
    { id: 2, alimento: 'Velho', categoria: 'Panificados', quantidade_kg: '1.00', validade: '2026-10-20', status: 'expirado', dias: -8,
      reservado_por_nome: null, janela_inicio: null, janela_fim: null },
  ];
  await contexto.telaLotes();
  let tela = elementos.get('conteudo').innerHTML;
  assert.match(tela, /retira entre <b>[^<]*–[^<]*<\/b>/);
  assert.ok(tela.includes('ONG &lt;X&gt;') && !tela.includes('ONG <X>'));
  assert.ok(tela.indexOf('Ativos') < tela.indexOf('Ativo &lt;b&gt;'));
  assert.ok(tela.indexOf('Expirados') > tela.indexOf('Ativo &lt;b&gt;') && tela.indexOf('Velho') > tela.indexOf('Expirados'));
  assert.doesNotMatch(tela.slice(tela.indexOf('Expirados')), /Confirmar retirada/);

  vm.runInContext("usuario = { perfil: 'receptora', nome: 'ONG' }", contexto);
  lotes = [{ id: 3, alimento: 'Pães', categoria: 'Panificados', quantidade_kg: '2.00', validade: '2026-10-29', status: 'disponivel',
    dias: 1, doador: 'Doador', bairro: 'Centro', distancia_km: '1.0' }];
  await contexto.telaLotes();
  tela = elementos.get('conteudo').innerHTML;
  assert.match(tela, /abrirReserva\(3, '2026-10-29'\)/);
  contexto.abrirReserva(3, '2026-10-29');
  const form = elementos.get('res3').innerHTML;
  assert.match(form, /id="ji3" type="datetime-local"/);
  assert.match(form, /id="jf3" type="datetime-local"/);
  assert.match(form, /max="2026-10-30T00:00"/);
  assert.match(form, /reservar\(3\)/);
});

test('L02 encerra a conexão de apoio com o banco de teste', () => db.end());
