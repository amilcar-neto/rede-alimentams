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

// Pendências L00 corrigidas no L01: toda falha agora é impeditiva.
export function ok(name, condition, info = '') {
  return test(name, () => assert.ok(condition, info || name));
}
