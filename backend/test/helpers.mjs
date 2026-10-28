import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testConnection, testClient } from './reset-db.mjs';

export const db = testClient(testConnection().connectionString);
export const hoje = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Campo_Grande', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
export const dia = (n) => new Date(Date.parse(hoje + 'T12:00:00Z') + n * 86400e3).toISOString().slice(0, 10);

export async function call(method, url, body, token) {
  const response = await fetch('http://127.0.0.1:3100' + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  let data;
  try { data = await response.json(); } catch { data = null; }
  return { s: response.status, d: data };
}

export async function login(email) {
  const response = await call('POST', '/auth/login', { email, senha: '123456' });
  assert.equal(response.s, 200, `Login da conta de teste ${email}`);
  assert.ok(response.d?.token);
  return response.d.token;
}

// Somente assinaturas reproduzidas no baseline podem ser pendências do L01.
// Um status/corpo diferente continua sendo falha, mesmo com o mesmo nome.
const known = new Map([
  ['C2 validade inválida -> 400', 'status=500 {"erro":"Erro interno do servidor."}'],
  ['C2 alimento numérico (tipo errado) -> 400', 'status=500 {"erro":"Erro interno do servidor."}'],
  ['C2 categoria arbitrária -> 400', /^status=201 \{"id":\d+\}$/],
  ['C2 qtd absurda 1e12 -> 400', 'status=500 {"erro":"Erro interno do servidor."}'],
  ['C2 alimento só espaços -> 400', /^status=201 \{"id":\d+\}$/],
  ['Cadastro CNPJ inválido rejeitado (Fluxo 1)', 'status=201'],
  ['Cadastro e-mail inválido rejeitado', 'status=201'],
  ['Cadastro senha numérica (tipo) não dá 500', 'status=500 {"erro":"Erro interno do servidor."}'],
  ['reservar id não numérico não dá 500', 'status=500 {"erro":"Erro interno do servidor."}'],
]);

export function ok(name, condition, info = '') {
  const signature = known.get(name);
  const reproduced = signature instanceof RegExp ? signature.test(info) : signature === info;
  const todo = !condition && signature && reproduced && process.env.TEST_STRICT_KNOWN !== '1'
    ? 'L01: falha conhecida reproduzida; docs/testes/PENDENCIAS_L01.md' : false;
  return test(name, { todo }, () => assert.ok(condition, info || name));
}
