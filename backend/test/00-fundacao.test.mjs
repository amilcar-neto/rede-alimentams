import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resetDatabase, testConnection } from './reset-db.mjs';
import { call, login, db, dia } from './helpers.mjs';

test('Reset recusa nomes/URLs não autorizados antes de conectar e preserva dados', async () => {
  await db.connect();
  try {
    await db.query('CREATE TABLE sentinela_l00 (valor text)');
    await db.query('INSERT INTO sentinela_l00 VALUES ($1)', ['preservado']);
    const original = testConnection().url;
    for (const name of ['alimentams', 'alimentams_dev', 'alimentams_prod', 'postgres', 'outro_test', 'alimentams_test;DROP DATABASE postgres']) {
      const url = new URL(original);
      url.pathname = '/' + name;
      await assert.rejects(resetDatabase({ TEST_DATABASE_URL: url.href }), /Reset recusado/);
    }
    for (const invalid of [undefined, '', 'invalida', 'postgres://localhost/alimentams_test?dbname=alimentams',
      'postgres://example.invalid/alimentams_test', 'https://localhost/alimentams_test']) {
      await assert.rejects(resetDatabase({ TEST_DATABASE_URL: invalid }));
    }
    assert.equal((await db.query('SELECT valor FROM sentinela_l00')).rows[0].valor, 'preservado');
  } finally {
    await db.query('DROP TABLE IF EXISTS sentinela_l00');
    await db.end();
  }
});

test('Servidor filho e cliente pg usam o mesmo banco de teste', async () => {
  // Outro cliente: helpers.db acima já encerrou sua conexão.
  const { testClient } = await import('./reset-db.mjs');
  const client = testClient(testConnection().connectionString);
  await client.connect();
  try {
    assert.equal((await client.query('SELECT current_database() AS nome')).rows[0].nome, testConnection().database);
    const response = await call('POST', '/lotes', {
      alimento: 'Sentinela conexão L00', categoria: 'Panificados', quantidade_kg: 1, validade: dia(1),
    }, await login('comper@demo.com'));
    assert.equal(response.s, 201);
    assert.equal((await client.query('SELECT alimento FROM lotes WHERE id=$1', [response.d.id])).rows[0]?.alimento,
      'Sentinela conexão L00');
    await client.query('DELETE FROM eventos_lote WHERE lote_id=$1', [response.d.id]);
    await client.query('DELETE FROM lotes WHERE id=$1', [response.d.id]);
  } finally { await client.end(); }
});

test('Falha nova e mudança de assinatura conhecida retornam código não zero', () => {
  for (const [name, info] of [
    ['Falha inédita L00', 'status=500'],
    ['C2 validade inválida -> 400', 'status=503'],
  ]) {
    const script = `import { ok } from './test/helpers.mjs'; ok(${JSON.stringify(name)}, false, ${JSON.stringify(info)});`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: new URL('../', import.meta.url), env: process.env, encoding: 'utf8', timeout: 10000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /fail 1/);
    assert.match(result.stdout, /todo 0/);
  }
});
