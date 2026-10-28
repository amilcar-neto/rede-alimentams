import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { call, login, dia, hoje, janela, local, retiradaAte } from './helpers.mjs';
import { testClient, testConnection } from './reset-db.mjs';

const db = testClient(testConnection().connectionString);
await db.connect();

let comper, sabor, esperanca, amambai, longe;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const jpeg = (extra = 200) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(extra, 7), Buffer.from([0xff, 0xd9])]);
const JPEG = jpeg();
const b64 = (buffer) => buffer.toString('base64');

const lote = (extra = {}) => ({
  alimento: 'Lote L03', categoria: 'Panificados', quantidade_kg: 3, validade: dia(2), retirada_ate: retiradaAte(dia(2)), ...extra,
});
const publicar = async (extra, token = comper) => call('POST', '/lotes', lote(extra), token);
const publicarOk = async (extra, token = comper) => {
  const r = await publicar(extra, token);
  assert.equal(r.s, 201, JSON.stringify(r));
  return r.d.id;
};
const raw = (id, token) => fetch(`http://127.0.0.1:3100/lotes/${id}/foto`, {
  headers: token ? { Authorization: 'Bearer ' + token } : {}, signal: AbortSignal.timeout(10000),
});
const erro = (r, status = 400) => {
  assert.equal(r.s, status, JSON.stringify(r));
  assert.equal(typeof r.d?.erro, 'string');
};

test('L03 prepara contas sintéticas existentes', async () => {
  [comper, sabor, esperanca, amambai, longe] = await Promise.all(
    ['comper', 'sabor', 'esperanca', 'amambai', 'longe'].map((n) => login(`${n}@demo.com`)));
});

test('L03 publica com foto JPEG, com foto PNG e sem foto (201)', async () => {
  const comJpeg = await publicarOk({ foto: b64(JPEG) });
  const comPng = await publicarOk({ foto: b64(PNG) });
  const sem = await publicarOk({});
  const nulo = await publicarOk({ foto: null });
  const linhas = (await db.query(
    'SELECT id, foto_tipo, octet_length(foto) AS n FROM lotes WHERE id = ANY($1) ORDER BY id', [[comJpeg, comPng, sem, nulo]])).rows;
  assert.deepEqual(linhas.map((l) => [l.foto_tipo, l.n]),
    [['image/jpeg', JPEG.length], ['image/png', PNG.length], [null, null], [null, null]]);
});

test('L03 aceita foto de exatamente 400 KB e recusa 400 KB + 1 byte', async () => {
  const limite = jpeg(409600 - 6);
  assert.equal(limite.length, 409600);
  assert.equal((await publicar({ foto: b64(limite) })).s, 201);
  erro(await publicar({ foto: b64(jpeg(409600 - 5)) }));
});

test('L03 recusa arquivo que não é imagem JPEG/PNG, mesmo com tipo declarado', async () => {
  const casos = {
    texto: Buffer.from('isto não é uma imagem'),
    html: Buffer.from('<html><script>alert(1)</script></html>'),
    gif: Buffer.from('GIF89a' + 'x'.repeat(50)),
    pdf: Buffer.from('%PDF-1.4 ' + 'x'.repeat(50)),
    'png truncado': PNG.subarray(0, 5),
    'jpeg curto': Buffer.from([0xff, 0xd8]),
    'jpeg com assinatura errada': Buffer.from([0xff, 0xd8, 0x00, 0xe0, 1, 2, 3]),
  };
  for (const [nome, buffer] of Object.entries(casos)) {
    const r = await publicar({ foto: b64(buffer) });
    assert.match(JSON.stringify(r.d), /imagem|Foto inválida/, nome);
    erro(r);
  }
  // O cliente não escolhe o tipo: campos extras e prefixo data: são recusados.
  erro(await publicar({ foto_tipo: 'image/png', foto: b64(JPEG) }));
  erro(await publicar({ foto: 'data:image/jpeg;base64,' + b64(JPEG) }));
});

test('L03 fuzz do campo foto nunca retorna 500', async () => {
  for (const foto of [123, true, [], {}, '', '   ', '\0', 'x', '@@@@', 'abc', 'a'.repeat(547000), b64(JPEG) + '=']) {
    const r = await publicar({ foto });
    assert.notEqual(r.s, 500, JSON.stringify(foto).slice(0, 40));
    erro(r);
  }
});

test('L03 foto grande demais → 400 em JSON (inclusive acima do limite do corpo)', async () => {
  erro(await publicar({ foto: 'A'.repeat(547000) }));
  const r = await publicar({ foto: 'A'.repeat(800000) });
  erro(r);
  assert.match(r.d.erro, /400 KB/);
  // O limite maior vale só para POST /lotes: as demais rotas continuam com o limite padrão (413).
  const outra = await fetch('http://127.0.0.1:3100/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'x'.repeat(150000) }), signal: AbortSignal.timeout(10000),
  });
  assert.equal(outra.status, 413);
});

test('L03 retirada_ate é obrigatório, no futuro e até o fim do dia da validade', async () => {
  const semCampo = lote(); delete semCampo.retirada_ate;
  erro(await call('POST', '/lotes', semCampo, comper));
  const passado = await publicar({ retirada_ate: local(-30) });
  erro(passado);
  assert.match(passado.d.erro, /futuro/);
  erro(await publicar({ retirada_ate: local(-1) }));
  const depois = await publicar({ validade: dia(2), retirada_ate: dia(3) + 'T00:01' });
  erro(depois);
  assert.match(depois.d.erro, /fim do dia da validade/);
  // Validade de hoje: o limite é o fim de hoje, não o de amanhã.
  erro(await publicar({ validade: hoje, retirada_ate: dia(1) + 'T00:30' }));
  for (const retirada_ate of ['', '   ', 'amanhã', '2026-10-30', '2026-10-30 10:00', '2026-02-31T10:00', dia(1) + 'T25:00',
    dia(1) + 'T10:00:00Z', 123, true, null, [], {}, '\0', 'x'.repeat(40)]) {
    const r = await publicar({ retirada_ate });
    assert.notEqual(r.s, 500, JSON.stringify(retirada_ate));
    erro(r);
  }
  // Fronteiras válidas: exatamente o fim do dia da validade e um horário próximo no futuro.
  assert.equal((await publicar({ validade: dia(2), retirada_ate: dia(3) + 'T00:00' })).s, 201);
  assert.equal((await publicar({ retirada_ate: local(90) })).s, 201);
  assert.equal((await publicar({ validade: dia(5), retirada_ate: local(5) })).s, 201);
});

test('L03 listagem traz tem_foto e retirada_ate, nunca os bytes', async () => {
  const comFoto = await publicarOk({ foto: b64(JPEG), retirada_ate: dia(2) + 'T18:30' });
  const semFoto = await publicarOk({ retirada_ate: dia(2) + 'T17:15' });
  for (const token of [comper, esperanca, amambai]) {
    const lista = (await call('GET', '/lotes', undefined, token)).d;
    const a = lista.find((l) => l.id === comFoto), b = lista.find((l) => l.id === semFoto);
    assert.equal(a.tem_foto, true);
    assert.equal(b.tem_foto, false);
    assert.equal(a.retirada_ate, dia(2) + 'T18:30');
    assert.equal(b.retirada_ate, dia(2) + 'T17:15');
    for (const l of lista) {
      assert.equal('foto' in l, false);
      assert.equal('foto_tipo' in l, false);
    }
  }
});

test('L03 GET /lotes/:id/foto: dono e receptora do raio recebem a imagem original', async () => {
  const idJpeg = await publicarOk({ foto: b64(JPEG) });
  const idPng = await publicarOk({ foto: b64(PNG) });
  for (const token of [comper, esperanca, amambai]) {
    let r = await raw(idJpeg, token);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'image/jpeg');
    assert.match(r.headers.get('cache-control'), /private/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(Buffer.from(await r.arrayBuffer()), JPEG);
    r = await raw(idPng, token);
    assert.equal(r.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await r.arrayBuffer()), PNG);
  }
});

test('L03 GET /lotes/:id/foto: sem login, terceiros, fora do raio, sem foto e ids inválidos', async () => {
  const id = await publicarOk({ foto: b64(JPEG) });
  const semFoto = await publicarOk({});
  assert.equal((await raw(id)).status, 401);
  assert.equal((await raw(id, 'abc')).status, 401);
  // Receptora a mais de 10 km e outro doador não enxergam a foto (404, sem revelar o lote).
  for (const token of [longe, sabor]) {
    const r = await raw(id, token);
    assert.equal(r.status, 404);
    assert.match(r.headers.get('content-type'), /application\/json/);
    assert.equal(typeof (await r.json()).erro, 'string');
  }
  assert.equal((await raw(semFoto, comper)).status, 404);
  assert.equal((await raw(semFoto, esperanca)).status, 404);
  assert.equal((await raw(2147483647, comper)).status, 404);
  for (const ruim of ['abc', '0', '-1', '1.5', '99999999999', '1e3']) {
    const r = await raw(ruim, comper);
    assert.equal(r.status, 400, ruim);
    assert.match(r.headers.get('content-type'), /application\/json/);
  }
  assert.equal((await call('GET', '/lotes/1/foto', undefined, comper)).s, 404); // lote do seed sem foto
});

test('L03 foto de lote reservado: só a receptora que reservou (e o dono)', async () => {
  const id = await publicarOk({ foto: b64(JPEG) });
  assert.equal((await call('PUT', `/lotes/${id}/reservar`, janela(dia(2)), esperanca)).s, 200);
  assert.equal((await raw(id, esperanca)).status, 200);
  assert.equal((await raw(id, comper)).status, 200);
  assert.equal((await raw(id, amambai)).status, 404); // no raio, mas o lote já é de outra entidade
  assert.equal((await raw(id, sabor)).status, 404);
  assert.equal((await raw(id, longe)).status, 404);
});

test('L03 a janela de reserva respeita retirada_ate; depois do prazo o lote expira', async () => {
  const id = await publicarOk({ retirada_ate: local(90) });
  const inicio = local();
  const longa = await call('PUT', `/lotes/${id}/reservar`, { janela_inicio: inicio, janela_fim: local(120) }, esperanca);
  erro(longa);
  assert.match(longa.d.erro, /horário limite de retirada/);
  assert.equal((await call('PUT', `/lotes/${id}/reservar`, { janela_inicio: inicio, janela_fim: local(90) }, esperanca)).s, 200);

  // Lote disponível cujo prazo passou: some da lista da receptora, vira expirado e não reserva (409).
  const vencido = await publicarOk({ foto: b64(JPEG), retirada_ate: local(90) });
  await db.query(`UPDATE lotes SET retirada_ate = now() - interval '1 minute' WHERE id = $1`, [vencido]);
  assert.ok(!(await call('GET', '/lotes', undefined, amambai)).d.some((l) => l.id === vencido));
  assert.equal((await db.query('SELECT status FROM lotes WHERE id = $1', [vencido])).rows[0].status, 'expirado');
  assert.equal((await call('PUT', `/lotes/${vencido}/reservar`, janela(dia(2)), amambai)).s, 409);
  const doDoador = (await call('GET', '/lotes', undefined, comper)).d.find((l) => l.id === vencido);
  assert.equal(doDoador.status, 'expirado');
  assert.equal((await raw(vencido, amambai)).status, 404);
  assert.equal((await raw(vencido, comper)).status, 200); // o dono ainda vê a foto do próprio lote
  const eventos = (await db.query(`SELECT tipo FROM eventos_lote WHERE lote_id = $1 ORDER BY id`, [vencido])).rows.map((e) => e.tipo);
  assert.deepEqual(eventos, ['publicado', 'expirado']);
});

test('L03 banco recusa foto sem tipo, tipo desconhecido e foto acima de 400 KB', async () => {
  const id = await publicarOk({});
  for (const [foto, tipo] of [[JPEG, null], [null, 'image/png'], [JPEG, 'image/gif'], [Buffer.alloc(409601, 1), 'image/jpeg']]) {
    await assert.rejects(db.query('UPDATE lotes SET foto = $2, foto_tipo = $3 WHERE id = $1', [id, foto, tipo]), { code: '23514' });
  }
});

function contextoFront(extra = {}) {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const elementos = new Map();
  const contexto = {
    localStorage: { getItem: () => null },
    document: { getElementById: (nome) => {
      if (!elementos.has(nome)) elementos.set(nome, { value: '', innerHTML: '', classList: { add() {}, remove() {} } });
      return elementos.get(nome);
    } },
    fetch: async () => ({ ok: true, status: 200, json: async () => [] }),
    ...extra,
  };
  vm.createContext(contexto);
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], contexto);
  return { contexto, elementos, html };
}

test('L03 front: card com miniatura escapada e "retirar até dd/mm hh:mm"; reserva limitada ao horário', async () => {
  const { contexto, elementos } = contextoFront();
  assert.equal(contexto.textoRetirada('2026-10-29T18:30'), '29/10 18:30');
  const agora = new Date('2026-10-28T15:00:00Z'); // 11:00 em Campo Grande
  assert.equal(contexto.padraoRetirada('2026-10-28', agora), '2026-10-28T18:00');
  assert.equal(contexto.padraoRetirada('2026-10-29', agora), '2026-10-29T18:00');
  assert.equal(contexto.padraoRetirada('2026-10-28', new Date('2026-10-28T21:40:00Z')), '2026-10-29T00:00'); // 17:40: falta pouco

  const base = { categoria: 'Panificados', quantidade_kg: '2.00', validade: '2026-10-29', status: 'disponivel', dias: 1,
    doador: 'Doador', bairro: 'Centro', distancia_km: '1.0', retirada_ate: '2026-10-29T18:30' };
  vm.runInContext("usuario = { perfil: 'receptora', nome: 'ONG' }", contexto);
  const comFoto = contexto.cartaoLote({ ...base, id: 7, alimento: 'Pães "<img onerror=x>"', tem_foto: true }, false);
  assert.match(comFoto, /<img class="miniatura oculto" id="foto7" alt="Foto do lote: Pães &quot;&lt;img onerror=x&gt;&quot;">/);
  assert.match(comFoto, /retirar até <b>29\/10 18:30<\/b>/);
  assert.match(comFoto, /abrirReserva\(7, '2026-10-29', '2026-10-29T18:30'\)/);
  const semFoto = contexto.cartaoLote({ ...base, id: 8, alimento: 'Sem foto', tem_foto: false }, false);
  assert.doesNotMatch(semFoto, /miniatura|id="foto8"/);

  contexto.abrirReserva(7, '2026-10-29', '2026-10-29T18:30');
  const form = elementos.get('res7').innerHTML;
  assert.match(form, /max="2026-10-29T18:30"/);
  assert.match(form, /horário limite de retirada do lote \(29\/10 18:30\)/);
  contexto.abrirReserva(8, '2026-10-29', '2026-10-30T09:00'); // acima do fim do dia: vale o fim do dia
  assert.match(elementos.get('res8').innerHTML, /max="2026-10-30T00:00"/);

  vm.runInContext("usuario = { perfil: 'doador', nome: 'Doador' }", contexto);
  assert.match(contexto.cartaoLote({ ...base, id: 9, alimento: 'Meu', tem_foto: true, status: 'disponivel' }, true), /id="foto9"/);
});

test('L03 front: reduz a imagem no canvas (máx. 1024 px, JPEG 0,7) e baixa a qualidade se passar de 400 KB', async () => {
  const qualidades = [];
  const canvas = { width: 0, height: 0 };
  let tamanhos = { 0.7: 500 * 1024, 0.5: 100 * 1024, 0.35: 50 * 1024 };
  Object.assign(canvas, {
    getContext: () => ({ fillRect() {}, drawImage() {} }),
    toBlob(cb, tipo, q) { qualidades.push([tipo, q]); cb({ size: tamanhos[q] }); },
  });
  const { contexto } = contextoFront({
    Image: class { set src(_) { this.naturalWidth = 4000; this.naturalHeight = 3000; setTimeout(() => this.onload()); } },
    FileReader: class { readAsDataURL() { this.result = 'data:image/jpeg;base64,QUJD'; setTimeout(() => this.onload()); } },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
  });
  contexto.document.createElement = () => canvas;
  const imagem = (type = 'image/png') => ({ type });

  const r = await contexto.reduzirImagem(imagem());
  assert.equal(r.base64, 'QUJD');
  assert.deepEqual([canvas.width, canvas.height], [1024, 768]);
  assert.deepEqual(qualidades, [['image/jpeg', 0.7], ['image/jpeg', 0.5]]);

  qualidades.length = 0;
  tamanhos = { 0.7: 10, 0.5: 10, 0.35: 10 };
  await contexto.reduzirImagem(imagem('image/jpeg'));
  assert.deepEqual(qualidades, [['image/jpeg', 0.7]]);

  tamanhos = { 0.7: 999999, 0.5: 999999, 0.35: 999999 };
  await assert.rejects(contexto.reduzirImagem(imagem()), /400 KB/);
  await assert.rejects(contexto.reduzirImagem(imagem('application/pdf')), /imagem/);
});

test('L03 front: usa o token ao buscar a foto (nunca na URL) e remove o espaço quando falha', async () => {
  const chamadas = [];
  let remo = false;
  const elemento = { isConnected: true, classList: { remove() {} }, remove() { remo = true; } };
  const { contexto } = contextoFront({
    fetch: async (url, opcoes) => { chamadas.push([url, opcoes]); return { ok: false, status: 404, json: async () => ({ erro: 'Foto não encontrada.' }) }; },
  });
  contexto.document.getElementById = () => elemento;
  vm.runInContext("token = 'JWT-TESTE'", contexto);
  chamadas.length = 0; // descarta a carga inicial dos bairros
  await contexto.carregarFoto(5);
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0][0], '/lotes/5/foto');
  assert.equal(chamadas[0][1].headers.Authorization, 'Bearer JWT-TESTE');
  assert.equal(remo, true);
});

test('L03 encerra a conexão de apoio com o banco de teste', () => db.end());
