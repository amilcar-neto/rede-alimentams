import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// A validação acontece antes de qualquer conexão ou comando destrutivo.
export function testConnection(env = process.env) {
  const connectionString = env.TEST_DATABASE_URL;
  if (!connectionString) throw new Error('Defina TEST_DATABASE_URL para um banco exclusivo de testes.');
  let url;
  try { url = new URL(connectionString); } catch { throw new Error('TEST_DATABASE_URL inválida.'); }
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !/^alimentams_test(?:_[a-z0-9_]+)?$/.test(database)
      || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      || url.search || url.hash) {
    throw new Error('Reset recusado: use banco local alimentams_test (ou alimentams_test_<sufixo>), sem parâmetros de URL.');
  }
  return { connectionString, database, url };
}

export function testClient(connectionString) {
  return new pg.Client({ connectionString, connectionTimeoutMillis: 5000, query_timeout: 15000 });
}

export async function resetDatabase(env = process.env) {
  const { connectionString, database, url } = testConnection(env);
  // Ler o schema antes de apagar o banco evita destruição quando o arquivo faltar.
  const schema = await readFile(new URL('../../db/init.sql', import.meta.url), 'utf8');
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = testClient(adminUrl.href);
  try {
    await admin.connect();
    const target = '"' + database + '"'; // nome restrito pela allowlist acima
    await admin.query(`DROP DATABASE IF EXISTS ${target} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${target}`);
  } finally { await admin.end(); }
  const client = testClient(connectionString);
  try {
    await client.connect();
    await client.query(schema);
    console.log(`Banco de teste recriado e db/init.sql carregado: ${database}`);
  } finally { await client.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await resetDatabase(); }
  catch (error) { console.error(`Reset falhou: ${error.code || error.message}`); process.exitCode = 1; }
}
