import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';
import { once } from 'node:events';
import { call, login, dia, janela, checklist, retiradaAte } from './helpers.mjs';
import { testClient, testConnection } from './reset-db.mjs';

const require = createRequire(import.meta.url);
const validar = require('../src/validacao.js');
const cadastro = {
  nome: 'Entidade sintética L01', email: 'validacoes.l01@example.test', senha: '123456',
  perfil: 'receptora', bairro: 'Centro', cnpj: '11.222.333/0001-81',
  // Contrato L06: endereço, responsável, telefone e aceite obrigatório dos termos.
  endereco: 'Rua Sintética, 10', responsavel: 'Responsável Sintético', telefone: '(67) 99999-0001', aceite_termos: true,
};
const lote = { alimento: 'Alimento L01', categoria: 'Panificados', quantidade_kg: 1, validade: dia(2), retirada_ate: retiradaAte(dia(2)) };
const tipos = ['inválido', 123, null, [], {}, true, undefined, '   ', '\0', 'x'.repeat(300)];
let doador, receptora;

test('L01 prepara contas sintéticas existentes para validar rotas protegidas', async () => {
  doador = await login('comper@demo.com');
  receptora = await login('esperanca@demo.com');
});

function erroJson(response, status = 400) {
  assert.equal(response.s, status, JSON.stringify(response));
  assert.equal(typeof response.d?.erro, 'string');
  assert.ok(response.d.erro.length > 0);
  assert.deepEqual(Object.keys(response.d), ['erro']);
}

test('L01 fuzz de cada campo de cadastro rejeita tipos/valores inválidos com JSON 400', async () => {
  for (const campo of Object.keys(cadastro)) {
    for (const valor of tipos) {
      // Nome e senha são textos livres; estes valores textuais são válidos.
      if (['nome', 'senha', 'endereco', 'responsavel'].includes(campo) && valor === 'inválido') continue;
      // O aceite só vale como o booleano true.
      if (campo === 'aceite_termos' && valor === true) continue;
      erroJson(await call('POST', '/auth/register', { ...cadastro, [campo]: valor }));
    }
  }
});

test('L01 fuzz de cada campo de login não chega ao bcrypt com tipo errado', async () => {
  for (const campo of ['email', 'senha']) {
    for (const valor of tipos) {
      const response = await call('POST', '/auth/login', {
        email: 'comper@demo.com', senha: '123456', [campo]: valor,
      });
      const esperado = valor === undefined || (campo === 'senha' && valor === 'inválido') ? 401 : 400;
      erroJson(response, esperado);
    }
  }
});

test('L01 fuzz de cada campo de publicação mantém tipos explícitos e não retorna 500', async () => {
  for (const campo of Object.keys(lote)) {
    for (const valor of tipos) {
      const response = await call('POST', '/lotes', { ...lote, [campo]: valor }, doador);
      const valido = (campo === 'alimento' && valor === 'inválido') || (campo === 'quantidade_kg' && valor === 123);
      if (valido) assert.equal(response.s, 201);
      else erroJson(response);
    }
  }
});

test('L01 fuzz dos IDs nas duas operações impede casts inválidos no PostgreSQL', async () => {
  for (const id of ['abc', '0', '-1', '1.5', '1e2', '2147483648', '9999999999999999999999',
    'null', '[]', '{}', ' 1 ', '1 OR 1=1', '01']) {
    erroJson(await call('PUT', `/lotes/${encodeURIComponent(id)}/reservar`, {}, receptora));
    erroJson(await call('PUT', `/lotes/${encodeURIComponent(id)}/confirmar-retirada`, { codigo: '123456', checklist }, doador));
  }
  erroJson(await call('PUT', '/lotes/2147483647/reservar', janela(), receptora), 409);
  erroJson(await call('PUT', '/lotes/2147483647/confirmar-retirada', { codigo: '123456', checklist }, doador));
  for (const [operacao, corpo, token] of [['reservar', {}, receptora], ['confirmar-retirada', { codigo: '123456' }, doador]]) {
    for (const id of ['%ZZ', '%E0%A4%A'])
      erroJson(await call('PUT', `/lotes/${id}/${operacao}`, corpo, token));
  }
});

test('L01 fuzz do código e do corpo de reserva não modifica o estado', async () => {
  const publicado = await call('POST', '/lotes', lote, doador);
  assert.equal(publicado.s, 201);
  const id = publicado.d.id;
  // Reserva só aceita a janela: nenhum outro dado pode interferir na operação.
  for (const valor of tipos) {
    if (valor !== undefined) erroJson(await call('PUT', `/lotes/${id}/reservar`, { ...janela(), codigo: valor }, receptora));
    erroJson(await call('PUT', `/lotes/${id}/confirmar-retirada`, { codigo: valor, checklist }, doador));
  }
  const reservado = await call('PUT', `/lotes/${id}/reservar`, janela(), receptora);
  assert.equal(reservado.s, 200);
  // Código numérico JSON, inclusive o valor correto, deve ser rejeitado.
  erroJson(await call('PUT', `/lotes/${id}/confirmar-retirada`, { codigo: Number(reservado.d.codigo), checklist }, doador));
  const confirmado = await call('PUT', `/lotes/${id}/confirmar-retirada`, { codigo: ` ${reservado.d.codigo} `, checklist }, doador);
  assert.equal(confirmado.s, 200);
});

test('L01 corpos não objeto, JSON malformado e limite de tamanho retornam erros JSON', async () => {
  const rotas = [
    ['POST', '/auth/register'], ['POST', '/auth/login'], ['POST', '/lotes', doador],
    ['PUT', '/lotes/1/reservar', receptora], ['PUT', '/lotes/1/confirmar-retirada', doador],
  ];
  for (const [metodo, url, token] of rotas) {
    for (const corpo of ['texto', 123, null, [], true]) erroJson(await call(metodo, url, corpo, token));
    erroJson(await call(metodo, url, { extra: 1 }, token));
    const response = await fetch('http://127.0.0.1:3100' + url, {
      method: metodo, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: '{"campo":', signal: AbortSignal.timeout(10000),
    });
    assert.match(response.headers.get('content-type'), /application\/json/);
    erroJson({ s: response.status, d: await response.json() });
  }
  const response = await fetch('http://127.0.0.1:3100/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome: 'x'.repeat(110000) }), signal: AbortSignal.timeout(10000),
  });
  erroJson({ s: response.status, d: await response.json() }, 413);
});

test('L01 corpo comprimido inválido retorna erro 4xx em JSON, sem 500', async () => {
  for (const encoding of ['gzip', 'deflate']) {
    const response = await fetch('http://127.0.0.1:3100/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Encoding': encoding },
      body: 'isto não é um corpo comprimido', signal: AbortSignal.timeout(10000),
    });
    assert.match(response.headers.get('content-type'), /application\/json/);
    const d = await response.json();
    assert.ok(response.status >= 400 && response.status < 500, `${encoding}: ${response.status}`);
    erroJson({ s: response.status, d }, response.status);
  }
});

test('L01 mensagem de texto vazio é distinta da de excesso de tamanho', async () => {
  const vazio = await call('POST', '/auth/register', { ...cadastro, nome: '   ' });
  erroJson(vazio);
  assert.match(vazio.d.erro, /obrigat/);
  const longo = await call('POST', '/auth/register', { ...cadastro, nome: 'x'.repeat(300) });
  erroJson(longo);
  assert.match(longo.d.erro, /no máximo/);
});

test('L01 CNPJ com/sem máscara é normalizado e os dígitos verificadores são exigidos', async () => {
  const client = testClient(testConnection().connectionString);
  await client.connect();
  try {
    for (const [i, cnpj] of ['11.222.333/0001-81', '11222333000181', ' 11.222.333/0001-81 '].entries()) {
      const email = `cnpj.l01.${i}@example.test`;
      const response = await call('POST', '/auth/register', { ...cadastro, email, cnpj });
      assert.equal(response.s, 201);
      assert.equal((await client.query('SELECT cnpj FROM usuarios WHERE email=$1', [email])).rows[0].cnpj, '11222333000181');
    }
    for (const cnpj of ['11.222.333/0001-82', '123', '00000000000000', '11111111111111',
      '11x222333000181', '11222333/000181', '11.222.333/0001-81x', '']) {
      erroJson(await call('POST', '/auth/register', { ...cadastro, cnpj }));
    }
    const seed = await client.query('SELECT cnpj FROM usuarios WHERE email LIKE $1', ['%@demo.com']);
    assert.equal(seed.rowCount, 6);
    for (const { cnpj } of seed.rows) assert.equal(validar.cnpj(cnpj), cnpj);
  } finally { await client.end(); }
});

test('L01 trim, limites, e-mail e senha preservam valores e rejeitam excesso', async () => {
  const email = 'trim.l01@example.test';
  const senha = ' senha com espaços ';
  const response = await call('POST', '/auth/register', {
    ...cadastro, nome: ' Entidade trim ', email: ` ${email.toUpperCase()} `,
    senha, bairro: ' Centro ', perfil: ' receptora ',
  });
  assert.equal(response.s, 201);
  assert.equal(response.d.usuario.nome, 'Entidade trim');
  assert.equal((await call('POST', '/auth/login', { email, senha })).s, 200);
  erroJson(await call('POST', '/auth/login', { email, senha: senha.trim() }), 401);
  for (const extra of [
    { nome: 'n'.repeat(201) }, { email: 'a'.repeat(65) + '@example.test' },
    { email: 'a..b@example.test' }, { email: '<a>@example.test' }, { email: 'a@-example.test' },
    { email: 'a@example..test' }, { email: 'a@' + 'b'.repeat(64) + '.test' },
    { senha: 's'.repeat(73) }, { senha: 'á'.repeat(37) }, { bairro: '__proto__' }, { bairro: 'constructor' },
  ]) erroJson(await call('POST', '/auth/register', { ...cadastro, ...extra }));
  assert.equal((await call('POST', '/auth/register', { ...cadastro, email: 'limites.l01@example.test',
    nome: 'n'.repeat(200), senha: 'á'.repeat(36) })).s, 201);
});

test('L01 quantidade respeita precisão do schema e os limites de 0,01 a 10.000 kg', async () => {
  for (const quantidade_kg of [0, -1, 10000.01, 1e12, 0.001, 0.0000000001,
    true, false, [], [1], {}, '', '0x10', '1e2', '1,5', 'Infinity', '0.001']) {
    erroJson(await call('POST', '/lotes', { ...lote, quantidade_kg }, doador));
  }
  const client = testClient(testConnection().connectionString);
  await client.connect();
  try {
    for (const quantidade_kg of [0.01, 1.15, ' 2.50 ', '10000', 10000]) {
      const response = await call('POST', '/lotes', { ...lote, quantidade_kg }, doador);
      assert.equal(response.s, 201);
      const stored = (await client.query('SELECT quantidade_kg FROM lotes WHERE id=$1', [response.d.id])).rows[0];
      assert.equal(Number(stored.quantidade_kg), Number(quantidade_kg));
    }
  } finally { await client.end(); }
});

test('L01 datas reais incluem bissexto; categorias aceitam somente as cinco opções', async () => {
  for (const validade of ['2026-02-31', '2027-02-29', '2100-02-29', '2028-04-31', '0000-01-01',
    '2028-13-01', '2028-01-00', '2028-01-32', '28/10/2028', '2028-01-01T00:00:00Z']) {
    erroJson(await call('POST', '/lotes', { ...lote, validade }, doador));
  }
  assert.equal((await call('POST', '/lotes', { ...lote, validade: '2028-02-29' }, doador)).s, 201);
  assert.equal((await call('POST', '/lotes', { ...lote, validade: ' 2028-02-29 ' }, doador)).s, 201);
  for (const categoria of validar.CATEGORIAS)
    assert.equal((await call('POST', '/lotes', { ...lote, categoria }, doador)).s, 201);
  for (const extra of [{ alimento: 'a'.repeat(201) }, { categoria: 'Outros' }, { categoria: 'panificados' }])
    erroJson(await call('POST', '/lotes', { ...lote, ...extra }, doador));
  assert.equal((await call('POST', '/lotes', { ...lote, alimento: 'a'.repeat(200) }, doador)).s, 201);
  assert.equal((await call('POST', '/lotes', { ...lote, alimento: ' ' + 'a'.repeat(200) + ' ' }, doador)).s, 201);
});

test('L01 produção sem JWT_SECRET encerra antes de abrir porta ou conectar ao banco', () => {
  for (const segredo of [undefined, '', '   ']) {
    const env = { ...process.env, NODE_ENV: 'production', PORT: '0' };
    delete env.JWT_SECRET;
    delete env.DATABASE_URL;
    if (segredo !== undefined) env.JWT_SECRET = segredo;
    const result = spawnSync(process.execPath, ['src/server.js'], {
      cwd: new URL('../', import.meta.url), env, encoding: 'utf8', timeout: 5000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /JWT_SECRET é obrigatório em produção/);
    assert.doesNotMatch(result.stdout, /Rede AlimentaMS rodando/);
  }
});

test('L01 erro em conexão ociosa tem listener e falha interna de consulta permanece 500', async () => {
  // Injeta apenas o pg: não exige derrubar o banco nem alterar permissões.
  let pool, app;
  const logs = [];
  class Pool extends EventEmitter {
    constructor() { super(); pool = this; }
    async query() { throw new Error('Falha interna sintética L01'); }
  }
  const express = require('express');
  function criarApp() { app = express(); app.listen = () => {}; return app; }
  Object.assign(criarApp, express);
  vm.runInNewContext(readFileSync(new URL('../src/server.js', import.meta.url), 'utf8'), {
    require: (nome) => nome === 'pg' ? { Pool } : nome === 'express' ? criarApp :
      nome === './validacao' ? validar : nome === './comprovante' ? require('../src/comprovante.js') : nome === './tempo-real' ? require('../src/tempo-real.js') : require(nome),
    __dirname: new URL('../src/', import.meta.url).pathname,
    process: { env: { NODE_ENV: 'test', JWT_SECRET: 'segredo-sintetico-l01' } },
    console: { error: (...args) => logs.push(args) },
  });
  assert.doesNotThrow(() => pool.emit('error', new Error('Conexão ociosa sintética')));
  assert.equal(logs.length, 1);
  const server = require('http').createServer(app).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sintetico@example.test', senha: '123456' }),
      signal: AbortSignal.timeout(5000),
    });
    erroJson({ s: response.status, d: await response.json() }, 500);
    assert.equal(logs.length, 2);
    assert.match(logs[1][0].message, /Falha interna sintética/);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('L01 máscara e amanhã no front: digitação, colagem e viradas em Campo Grande', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  // Executa o script real com DOM mínimo; não replica as funções em teste.
  const elements = new Map();
  const context = {
    localStorage: { getItem: () => null },
    document: { getElementById: (id) => {
      if (!elements.has(id)) elements.set(id, { value: '', innerHTML: '' });
      return elements.get(id);
    } },
    fetch: async () => ({ json: async () => [] }),
  };
  vm.createContext(context);
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
  for (const [entrada, esperado] of [
    ['', ''], ['1', '1'], ['112', '11.2'], ['11222333000181', '11.222.333/0001-81'],
    ['11.222.333/0001-81', '11.222.333/0001-81'], ['11-222*333 0001 81 999', '11.222.333/0001-81'],
    ['12abc34501de35', '12.ABC.345/01DE-35'],
  ]) {
    const input = { value: entrada };
    context.mascararCnpj(input);
    assert.equal(input.value, esperado);
  }
  for (const [agora, esperado] of [
    ['2026-10-28T02:00:00Z', '2026-10-28'], ['2026-10-28T04:00:00Z', '2026-10-29'],
    ['2026-12-31T23:59:00Z', '2027-01-01'], ['2028-02-29T02:00:00Z', '2028-02-29'],
    ['2028-02-29T04:00:00Z', '2028-03-01'],
  ]) assert.equal(context.dataAmanha(new Date(agora)), esperado);
  context.telaPublicar();
  assert.match(elements.get('conteudo').innerHTML, /max="10000"/);
});
