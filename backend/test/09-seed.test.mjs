import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { call, login } from './helpers.mjs';
import { testClient, testConnection } from './reset-db.mjs';

const require = createRequire(import.meta.url);
const comprovantes = require('../src/comprovante');
const db = testClient(testConnection().connectionString);
await db.connect();
after(() => db.end());

// Lotes 1-4 são os originais; 5-20 o histórico de 30 dias; 21 a reserva perto de expirar.
test('L08 seed: 16 doações históricas em 30 dias, com hash SHA-256 e comprovante verificáveis', async () => {
  const r = await db.query(
    `SELECT d.*, (now() AT TIME ZONE 'America/Campo_Grande')::date - (d.data_hora AT TIME ZONE 'America/Campo_Grande')::date AS dias
       FROM doacoes d WHERE lote_id BETWEEN 5 AND 20 ORDER BY lote_id`);
  assert.equal(r.rowCount, 16);
  for (const d of r.rows) {
    assert.ok(d.dias >= 1 && d.dias <= 30, `doação ${d.id} fora dos 30 dias`);
    assert.equal(comprovantes.hashDe(d.comprovante), d.hash);
    assert.equal(d.comprovante.lote_id, d.lote_id);
    assert.equal(d.comprovante.quantidade_kg, d.quantidade_kg);
    assert.equal(d.comprovante.data_hora, d.data_hora.toISOString());
    assert.equal(d.comprovante.doador.id, d.doador_id);
    assert.equal(d.comprovante.receptora.id, d.receptor_id);
  }
  const comper = await login('comper@demo.com');
  const verificacao = await fetch('http://127.0.0.1:3100/verificar/' + r.rows[0].hash);
  assert.equal(verificacao.status, 200);
  assert.match(await verificacao.text(), /Comprovante válido/);
  const comprovante = await call('GET', `/doacoes/${r.rows[0].id}/comprovante`, undefined, comper);
  assert.notEqual(comprovante.s, 500);
});

test('L08 seed: lotes e eventos do histórico seguem o ciclo publicado → reservado → entregue', async () => {
  const r = await db.query(
    `SELECT l.id, l.status, array_agg(e.tipo ORDER BY e.id) AS tipos
       FROM lotes l JOIN eventos_lote e ON e.lote_id = l.id WHERE l.id BETWEEN 5 AND 20 GROUP BY l.id, l.status`);
  assert.equal(r.rowCount, 16);
  for (const l of r.rows) {
    assert.equal(l.status, 'entregue');
    assert.deepEqual(l.tipos, ['publicado', 'reservado', 'entregue']);
  }
});

test('L08 seed: indicadores iniciais com números e tela de doador/receptora com histórico', async () => {
  const comper = await login('comper@demo.com');
  const esperanca = await login('esperanca@demo.com');
  const ind = (await call('GET', '/indicadores', undefined, comper)).d;
  assert.ok(ind.kg >= 400 && ind.doacoes >= 16 && ind.entidades >= 2 && ind.refeicoes > 0 && ind.co2 > 0 && ind.agua > 0);
  assert.ok((await call('GET', '/doacoes', undefined, comper)).d.length >= 7);
  assert.ok((await call('GET', '/doacoes', undefined, esperanca)).d.length >= 8);
});

test('L08 seed: reserva perto de expirar existe, é da Esperança e a janela termina em breve', async () => {
  const r = await db.query(
    `SELECT l.*, u.email, extract(epoch FROM l.janela_fim - now()) AS restante FROM lotes l
       JOIN usuarios u ON u.id = l.reservado_por WHERE l.id = 21`);
  const l = r.rows[0];
  // Se o banco já passou da tolerância, a liberação automática pode ter devolvido o lote.
  if (l && l.status === 'reservado') {
    assert.equal(l.email, 'esperanca@demo.com');
    assert.equal(l.codigo, '482915');
    assert.ok(l.restante <= 25 * 60 + 5);
  } else {
    assert.equal((await db.query('SELECT status FROM lotes WHERE id = 21')).rows[0].status, 'disponivel');
  }
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM eventos_lote WHERE lote_id = 21 AND tipo = 'publicado'`)).rows[0].n, 1);
});

test('L08 complemento: miniatura PNG do seed acessível às partes e lote sem imagem preservado', async () => {
  const comper = await login('comper@demo.com');
  const esperanca = await login('esperanca@demo.com');
  const longe = await login('longe@demo.com');
  const seed = (await db.query('SELECT foto, foto_tipo FROM lotes WHERE id = $1', [3])).rows[0];
  assert.equal(seed.foto_tipo, 'image/png');
  assert.deepEqual(seed.foto.subarray(0, 8), Buffer.from('89504e470d0a1a0a', 'hex'));
  assert.equal(seed.foto.readUInt32BE(16), 160);
  assert.equal(seed.foto.readUInt32BE(20), 96);
  for (const token of [comper, esperanca]) {
    const r = await fetch('http://127.0.0.1:3100/lotes/3/foto', { headers: { Authorization: 'Bearer ' + token } });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /image\/png/);
    assert.deepEqual(Buffer.from(await r.arrayBuffer()), seed.foto);
  }
  assert.equal((await call('GET', '/lotes/3/foto', undefined, longe)).s, 404);
  assert.equal((await call('GET', '/lotes/1/foto', undefined, comper)).s, 404);
  const lista = (await call('GET', '/lotes', undefined, comper)).d;
  assert.equal(lista.find((l) => l.id === 3).tem_foto, true);
  assert.equal(lista.find((l) => l.id === 4).tem_foto, false);
});
