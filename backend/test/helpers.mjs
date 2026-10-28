import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testConnection, testClient } from './reset-db.mjs';

export const db = testClient(testConnection().connectionString);
export const hoje = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Campo_Grande', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
export const dia = (n) => new Date(Date.parse(hoje + 'T12:00:00Z') + n * 86400e3).toISOString().slice(0, 10);
// Contrato L04: confirmação exige os três itens sanitários afirmativos.
export const checklist = { embalagem_integra: true, temperatura_adequada: true, dentro_validade: true };

// Horário local de Campo Grande (AAAA-MM-DDTHH:MM), deslocado em minutos a partir de agora.
export function local(minutos = 0) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Campo_Grande', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(Date.now() + minutos * 60000));
  const valor = (tipo) => partes.find((p) => p.type === tipo).value;
  return `${valor('year')}-${valor('month')}-${valor('day')}T${valor('hour')}:${valor('minute')}`;
}

// Janela de retirada válida: de agora até 1 h depois, limitada ao fim do dia da validade.
export function janela(validade = dia(2), duracao = 60) {
  const limite = new Date(Date.parse(validade + 'T12:00:00Z') + 86400e3).toISOString().slice(0, 10) + 'T00:00';
  const fim = local(duracao);
  return { janela_inicio: local(), janela_fim: fim > limite ? limite : fim };
}

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
