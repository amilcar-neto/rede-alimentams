import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { call, login, dia, janela, checklist, retiradaAte } from './helpers.mjs';
import { testClient, testConnection } from './reset-db.mjs';

const db = testClient(testConnection().connectionString);
await db.connect();
after(() => db.end());

const BASE = 'http://127.0.0.1:3100';
let contador = 0;
const sufixo = Date.now();
const cadastro = (extra = {}) => ({
  nome: 'Entidade L06', email: `l06.${sufixo}.${++contador}@example.test`, senha: '123456', perfil: 'receptora',
  bairro: 'Centro', cnpj: '11.222.333/0001-81', endereco: 'Rua Sintética, 60', responsavel: 'Responsável L06',
  telefone: '(67) 99999-0006', aceite_termos: true, ...extra,
});
const registrar = async (extra = {}) => {
  const corpo = cadastro(extra);
  const r = await call('POST', '/auth/register', corpo);
  assert.equal(r.s, 201, JSON.stringify(r));
  return { token: r.d.token, id: r.d.usuario.id, email: corpo.email };
};
const erro = (r, status = 400) => {
  assert.equal(r.s, status, JSON.stringify(r));
  assert.equal(typeof r.d?.erro, 'string');
  assert.deepEqual(Object.keys(r.d), ['erro']);
};
const b64 = (buffer) => buffer.toString('base64');
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(300, 0x20), Buffer.from('\n%%EOF\n')]);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7), Buffer.from([0xff, 0xd9])]);
const MIB = 1024 * 1024;
const pdfDeTamanho = (n) => Buffer.concat([PDF, Buffer.alloc(n - PDF.length, 0x20)]);
const lerComprovante = (token) => fetch(`${BASE}/perfil/comprovante`, {
  headers: token ? { Authorization: 'Bearer ' + token } : {}, signal: AbortSignal.timeout(10000),
});

// ---------- Cadastro completo e aceite ----------
test('L06 cadastro completo grava endereço, responsável, telefone normalizado, aceite e situação aprovada', async () => {
  const corpo = cadastro({ telefone: ' (67) 99999-0006 ' });
  const antes = Date.now();
  const r = await call('POST', '/auth/register', corpo);
  assert.equal(r.s, 201, JSON.stringify(r));
  const u = (await db.query('SELECT * FROM usuarios WHERE email = $1', [corpo.email])).rows[0];
  assert.equal(u.endereco, corpo.endereco);
  assert.equal(u.responsavel, corpo.responsavel);
  assert.equal(u.telefone, '67999990006');
  assert.equal(u.situacao, 'aprovado');
  assert.equal(u.termos_versao, '2026-10-v1');
  const aceite = u.aceite_termos_em.getTime();
  assert.ok(aceite >= antes - 2000 && aceite <= Date.now() + 2000, 'aceite_termos_em é o instante do servidor');
});

test('L06 cadastro sem aceite, ou com aceite que não seja o booleano true, é 400 e não cria a conta', async () => {
  for (const aceite_termos of [undefined, false, null, 'true', 1, 'sim', [], {}, 'on']) {
    const corpo = cadastro({ aceite_termos });
    const r = await call('POST', '/auth/register', corpo);
    erro(r);
    assert.match(r.d.erro, /aceitar o Termo/);
    assert.equal((await db.query('SELECT 1 FROM usuarios WHERE email = $1', [corpo.email])).rowCount, 0);
  }
});

test('L06 endereço, responsável e telefone são obrigatórios e validados', async () => {
  for (const campo of ['endereco', 'responsavel', 'telefone']) {
    for (const valor of [undefined, '', '   ', 123, null, [], {}, true, '\0', 'x'.repeat(300)])
      erro(await call('POST', '/auth/register', cadastro({ [campo]: valor })));
  }
  for (const telefone of ['123', '(67) 12345-6789', '(00) 99999-9999', '(67) 89999-9999', 'abcdefghij', '67 9999-99999',
    '(67) 99999-99999', '+1 67 99999-0006', '(67) 0999-9999']) {
    erro(await call('POST', '/auth/register', cadastro({ telefone })));
  }
  const esperado = { '(67) 99999-0006': '67999990006', '67999990006': '67999990006', '(67) 3333-0001': '6733330001',
    '6733330001': '6733330001', '+55 67 99999-0006': '67999990006', '5567999990006': '67999990006', '(11)98888-7777': '11988887777' };
  for (const [telefone, digitos] of Object.entries(esperado)) {
    const corpo = cadastro({ telefone });
    assert.equal((await call('POST', '/auth/register', corpo)).s, 201, telefone);
    assert.equal((await db.query('SELECT telefone FROM usuarios WHERE email = $1', [corpo.email])).rows[0].telefone, digitos);
  }
});

test('L06 o doador também precisa de cadastro completo; o seed demo tem aceite e situação aprovada', async () => {
  const doador = cadastro({ perfil: 'doador' });
  assert.equal((await call('POST', '/auth/register', doador)).s, 201);
  erro(await call('POST', '/auth/register', { ...doador, email: 'x' + doador.email, aceite_termos: false }));
  const seed = (await db.query(`SELECT * FROM usuarios WHERE email LIKE '%@demo.com'`)).rows;
  assert.equal(seed.length, 6);
  for (const u of seed) {
    assert.equal(u.situacao, 'aprovado');
    assert.ok(u.aceite_termos_em && u.termos_versao && u.endereco && u.responsavel && /^\d{10,11}$/.test(u.telefone));
  }
});

test('L06 o banco recusa situação, telefone e comprovante inválidos', async () => {
  const { id } = await registrar();
  await assert.rejects(db.query(`UPDATE usuarios SET situacao = 'inexistente' WHERE id = $1`, [id]), { code: '23514' });
  await assert.rejects(db.query(`UPDATE usuarios SET telefone = '123' WHERE id = $1`, [id]), { code: '23514' });
  await assert.rejects(db.query(`UPDATE usuarios SET aceite_termos_em = NULL WHERE id = $1`, [id]), { code: '23502' });
  await assert.rejects(db.query(`INSERT INTO comprovantes_entidade (usuario_id, arquivo, tipo) VALUES ($1, 'x', 'text/html')`, [id]), { code: '23514' });
  await assert.rejects(db.query(`INSERT INTO comprovantes_entidade (usuario_id, arquivo, tipo) VALUES ($1, $2, 'image/png')`,
    [id, Buffer.alloc(MIB + 1, 1)]), { code: '23514' });
  for (const situacao of ['aprovado', 'pendente', 'rejeitado'])
    await db.query('UPDATE usuarios SET situacao = $2 WHERE id = $1', [id, situacao]);
});

// ---------- Termos ----------
test('L06 termos.html é público, traz termo e política com as citações legais marcadas [VERIFICAR]', async () => {
  const r = await fetch(`${BASE}/termos.html`, { signal: AbortSignal.timeout(10000) });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
  const html = await r.text();
  assert.match(html, /Termo de Responsabilidade/);
  assert.match(html, /Política de Privacidade/);
  assert.match(html, /id="termo"/);
  assert.match(html, /id="privacidade"/);
  assert.ok((html.match(/\[VERIFICAR\]/g) || []).length >= 5, 'citações legais marcadas');
  assert.match(html, /\[GRUPO\]/);
  assert.match(html, /não é certificado ICP-Brasil/i);
  // Toda citação de lei ou resolução vem acompanhada do marcador.
  for (const citacao of html.match(/(?:Lei nº|RDC ANVISA nº|Resolução RDC ANVISA nº)[^<]{0,40}/g) || [])
    assert.ok(html.includes(citacao) && html.indexOf('[VERIFICAR]', html.indexOf(citacao)) - html.indexOf(citacao) < 400, citacao);
  const versao = (await db.query(`SELECT termos_versao FROM usuarios WHERE email LIKE 'l06.%' LIMIT 1`)).rows[0].termos_versao;
  assert.ok(html.includes(versao), 'versão aceita consta no documento');
});

// ---------- Comprovante de entidade ----------
test('L06 ONG anexa PDF, JPEG e PNG (tipo pelo conteúdo), lê de volta o arquivo e o substitui', async () => {
  const ong = await registrar();
  for (const [arquivo, tipo, extensao] of [[PDF, 'application/pdf', 'pdf'], [JPEG, 'image/jpeg', 'jpg'], [PNG, 'image/png', 'png']]) {
    const r = await call('PUT', '/perfil/comprovante', { arquivo: b64(arquivo) }, ong.token);
    assert.equal(r.s, 200, JSON.stringify(r));
    assert.equal(r.d.tipo, tipo);
    assert.equal(r.d.tamanho, arquivo.length);
    const lido = await lerComprovante(ong.token);
    assert.equal(lido.status, 200);
    assert.equal(lido.headers.get('content-type'), tipo);
    assert.match(lido.headers.get('cache-control'), /no-store/);
    assert.equal(lido.headers.get('x-content-type-options'), 'nosniff');
    assert.match(lido.headers.get('content-disposition'), new RegExp(`attachment; filename="comprovante-entidade\\.${extensao}"`));
    assert.ok(Buffer.from(await lido.arrayBuffer()).equals(arquivo));
  }
  assert.equal((await db.query('SELECT count(*)::int AS n FROM comprovantes_entidade WHERE usuario_id = $1', [ong.id])).rows[0].n, 1);
  const perfil = (await call('GET', '/perfil', undefined, ong.token)).d;
  assert.equal(perfil.tem_comprovante, true);
  assert.equal(perfil.comprovante_tipo, 'image/png');
});

test('L06 anexo de exatamente 1 MB é aceito; 1 MB + 1 byte, conteúdo de outro tipo e base64 inválido são 400', async () => {
  const ong = await registrar();
  assert.equal((await call('PUT', '/perfil/comprovante', { arquivo: b64(pdfDeTamanho(MIB)) }, ong.token)).s, 200);
  const guardado = (await db.query('SELECT octet_length(arquivo) AS n FROM comprovantes_entidade WHERE usuario_id = $1', [ong.id])).rows[0].n;
  assert.equal(guardado, MIB);
  const invalidos = [
    b64(pdfDeTamanho(MIB + 1)),                                   // 1 byte acima do limite
    b64(Buffer.from('<html><script>alert(1)</script></html>')),  // HTML
    b64(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')),
    b64(Buffer.from('MZ' + 'x'.repeat(100))),                     // executável
    b64(Buffer.from('GIF89a' + 'x'.repeat(100))),                 // GIF
    b64(Buffer.from('texto simples, não é um arquivo')),
    b64(Buffer.from('%PDF-3.0\n' + ' '.repeat(100))),            // versão de PDF inexistente
    b64(Buffer.from('%PDF-')),                                    // assinatura sem corpo
    b64(Buffer.alloc(0)),
    'data:application/pdf;base64,' + b64(PDF),                    // prefixo data:
    b64(PDF).slice(0, -1),                                        // base64 truncado
    '%%%%', 'AAAA AAAA', 'não é base64', '',
    123, null, [], {}, true, undefined,
  ];
  for (const arquivo of invalidos) erro(await call('PUT', '/perfil/comprovante', { arquivo }, ong.token));
  // Nenhuma tentativa inválida altera o comprovante já guardado.
  const depois = (await db.query('SELECT octet_length(arquivo) AS n, tipo FROM comprovantes_entidade WHERE usuario_id = $1', [ong.id])).rows[0];
  assert.deepEqual([depois.n, depois.tipo], [MIB, 'application/pdf']);
});

test('L06 corpo do anexo: campos extras, corpo não objeto e corpo gigante retornam 400 em JSON', async () => {
  const ong = await registrar();
  erro(await call('PUT', '/perfil/comprovante', { arquivo: b64(PDF), tipo: 'image/png' }, ong.token));
  erro(await call('PUT', '/perfil/comprovante', { }, ong.token));
  for (const corpo of ['texto', 123, null, [], true]) erro(await call('PUT', '/perfil/comprovante', corpo, ong.token));
  const gigante = await call('PUT', '/perfil/comprovante', { arquivo: 'A'.repeat(2 * MIB) }, ong.token);
  erro(gigante);
  assert.match(gigante.d.erro, /1 MB/);
  const malformado = await fetch(`${BASE}/perfil/comprovante`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ong.token },
    body: '{"arquivo":', signal: AbortSignal.timeout(10000),
  });
  assert.equal(malformado.status, 400);
  assert.match(malformado.headers.get('content-type'), /application\/json/);
  assert.equal((await db.query('SELECT 1 FROM comprovantes_entidade WHERE usuario_id = $1', [ong.id])).rowCount, 0);
});

test('L06 comprovante: sem token é 401 (mesmo com corpo grande), doador é 403, e cada ONG lê só o próprio', async () => {
  erro(await call('PUT', '/perfil/comprovante', { arquivo: b64(PDF) }), 401);
  erro(await call('PUT', '/perfil/comprovante', { arquivo: 'A'.repeat(2 * MIB) }), 401);
  erro(await call('GET', '/perfil/comprovante'), 401);
  const doador = await registrar({ perfil: 'doador' });
  erro(await call('PUT', '/perfil/comprovante', { arquivo: b64(PDF) }, doador.token), 403);
  erro(await call('GET', '/perfil/comprovante', undefined, doador.token), 403);
  const a = await registrar(), b = await registrar();
  erro(await call('GET', '/perfil/comprovante', undefined, a.token), 404);
  assert.equal((await call('PUT', '/perfil/comprovante', { arquivo: b64(PDF) }, a.token)).s, 200);
  assert.equal((await call('PUT', '/perfil/comprovante', { arquivo: b64(PNG) }, b.token)).s, 200);
  assert.equal((await lerComprovante(a.token)).headers.get('content-type'), 'application/pdf');
  assert.equal((await lerComprovante(b.token)).headers.get('content-type'), 'image/png');
  // O doador não consegue ler o comprovante de uma ONG por nenhuma rota.
  for (const url of [`/perfil/comprovante?usuario=${a.id}`, `/perfil/comprovante/${a.id}`])
    assert.notEqual((await call('GET', url, undefined, doador.token)).s, 200);
  const perfilDoador = (await call('GET', '/perfil', undefined, doador.token)).d;
  assert.equal(perfilDoador.tem_comprovante, false);
});

test('L06 GET /perfil devolve só o próprio cadastro, sem senha', async () => {
  erro(await call('GET', '/perfil'), 401);
  const ong = await registrar({ telefone: '(67) 3333-0001' });
  const r = await call('GET', '/perfil', undefined, ong.token);
  assert.equal(r.s, 200);
  assert.equal(r.d.id, ong.id);
  assert.equal(r.d.email, ong.email);
  assert.equal(r.d.telefone, '6733330001');
  assert.equal(r.d.situacao, 'aprovado');
  assert.equal(r.d.cnpj, '11222333000181');
  assert.ok(r.d.aceite_termos_em && r.d.termos_versao);
  assert.equal(r.d.tem_comprovante, false);
  assert.ok(!('senha_hash' in r.d) && !('senha' in r.d) && !('localizacao' in r.d));
});

// ---------- KPIs ----------
const arredondar = (n) => Math.round(n * 10) / 10;
async function resumoGlobal() {
  const r = await db.query(
    `SELECT (SELECT COALESCE(SUM(quantidade_kg),0)::float FROM doacoes) AS kg,
            (SELECT COUNT(DISTINCT receptor_id)::int FROM doacoes) AS entidades,
            COALESCE(SUM(EXTRACT(EPOCH FROM reservado_em - criado_em) / 60), 0)::float AS soma_min,
            COUNT(reservado_em)::int AS reservas,
            COUNT(*) FILTER (WHERE status = 'entregue')::int AS entregues,
            COUNT(*) FILTER (WHERE status = 'expirado')::int AS expirados
       FROM lotes`);
  return r.rows[0];
}

// Publica, reserva e (opcionalmente) confirma um lote pela API; depois fixa o tempo entre publicação e reserva.
async function lote(doador, ong, { kg, minutos, confirmar = true }) {
  const publicado = await call('POST', '/lotes', {
    alimento: 'Lote KPI', categoria: 'Panificados', quantidade_kg: kg, validade: dia(2), retirada_ate: retiradaAte(dia(2)),
  }, doador.token);
  assert.equal(publicado.s, 201, JSON.stringify(publicado));
  const id = publicado.d.id;
  const reservado = await call('PUT', `/lotes/${id}/reservar`, janela(dia(2)), ong.token);
  assert.equal(reservado.s, 200, JSON.stringify(reservado));
  await db.query(`UPDATE lotes SET criado_em = reservado_em - make_interval(mins => $2) WHERE id = $1`, [id, minutos]);
  if (confirmar) {
    const c = await call('PUT', `/lotes/${id}/confirmar-retirada`, { codigo: reservado.d.codigo, checklist }, doador.token);
    assert.equal(c.s, 200, JSON.stringify(c));
  }
  return id;
}

test('L06 TMR e TEC batem com dados controlados; "Meus números" conta só o próprio usuário', async () => {
  const doador = await registrar({ perfil: 'doador' }), ong = await registrar();
  const outroDoador = await registrar({ perfil: 'doador' }), outraOng = await registrar();

  await call('GET', '/indicadores', undefined, doador.token); // atualiza o ciclo de vida antes do instantâneo
  const antes = await resumoGlobal();
  const globalAntes = (await call('GET', '/indicadores', undefined, doador.token)).d;
  assert.equal(globalAntes.kg, antes.kg);

  // Dados controlados: dois lotes entregues (30 e 60 min até a reserva) e um expirado (90 min).
  await lote(doador, ong, { kg: 10, minutos: 30 });
  await lote(doador, ong, { kg: 5.5, minutos: 60 });
  const expirado = await lote(doador, ong, { kg: 4, minutos: 90, confirmar: false });
  await db.query(`UPDATE lotes SET retirada_ate = now() - interval '1 minute', janela_inicio = now() - interval '3 hours',
                                   janela_fim = now() - interval '2 hours' WHERE id = $1`, [expirado]);
  // Um lote disponível (sem reserva) não entra no TMR nem no TEC.
  assert.equal((await call('POST', '/lotes', { alimento: 'Sem reserva', categoria: 'Panificados', quantidade_kg: 2,
    validade: dia(2), retirada_ate: retiradaAte(dia(2)) }, doador.token)).s, 201);

  // Dados de outro doador/ONG: não podem aparecer em "Meus números" do primeiro par.
  await lote(outroDoador, outraOng, { kg: 20, minutos: 100 });

  const doDoador = await call('GET', '/indicadores/meus', undefined, doador.token);
  assert.equal(doDoador.s, 200, JSON.stringify(doDoador));
  const daOng = await call('GET', '/indicadores/meus', undefined, ong.token);
  assert.equal(daOng.s, 200, JSON.stringify(daOng));
  for (const m of [doDoador.d, daOng.d]) {
    assert.equal(m.kg, 15.5);
    assert.equal(m.doacoes, 2);
    assert.equal(m.refeicoes, 31);
    assert.equal(m.co2, 39);
    assert.equal(m.agua, 5425);
    assert.equal(m.entregues, 2);
    assert.equal(m.expirados, 1);
    assert.equal(m.tmr_minutos, 60);
    assert.equal(m.tec_percentual, 66.7);
    assert.deepEqual(m.metas, { tmr_minutos: 90, tec_percentual: 92, tmr_atingida: true, tec_atingida: false });
  }
  assert.equal(doDoador.d.perfil, 'doador');
  assert.equal(doDoador.d.entidades, 1);
  assert.equal(daOng.d.perfil, 'receptora');
  assert.equal(daOng.d.doadores, 1);

  // O outro par vê só o seu lote: TMR 100 min (acima da meta) e TEC 100% (acima da meta).
  const outro = (await call('GET', '/indicadores/meus', undefined, outroDoador.token)).d;
  assert.deepEqual([outro.kg, outro.doacoes, outro.tmr_minutos, outro.tec_percentual], [20, 1, 100, 100]);
  assert.deepEqual(outro.metas, { tmr_minutos: 90, tec_percentual: 92, tmr_atingida: false, tec_atingida: true });

  // Global: acrescenta exatamente os 4 lotes reservados (30 + 60 + 90 + 100 min), 3 entregues e 1 expirado.
  const depois = await resumoGlobal();
  const g = (await call('GET', '/indicadores', undefined, doador.token)).d;
  assert.equal(depois.kg - antes.kg, 35.5);
  assert.equal(depois.reservas - antes.reservas, 4);
  assert.equal(depois.entregues - antes.entregues, 3);
  assert.equal(depois.expirados - antes.expirados, 1);
  assert.ok(Math.abs((depois.soma_min - antes.soma_min) - 280) < 0.01);
  assert.equal(g.kg, depois.kg);
  assert.equal(g.entidades, depois.entidades);
  assert.equal(g.entidades - globalAntes.entidades, 2);
  assert.equal(g.entregues, depois.entregues);
  assert.equal(g.expirados, depois.expirados);
  assert.ok(Math.abs(g.tmr_minutos - depois.soma_min / depois.reservas) <= 0.05 + 1e-9);
  assert.equal(g.tec_percentual, arredondar((depois.entregues / (depois.entregues + depois.expirados)) * 100));
  assert.equal(g.metas.tmr_atingida, g.tmr_minutos < 90);
  assert.equal(g.metas.tec_atingida, g.tec_percentual > 92);
  assert.deepEqual([g.metas.tmr_minutos, g.metas.tec_percentual], [90, 92]);
  // "Meus números" não vaza para o painel de outro usuário: o doador demo não ganha os 15,5 kg.
  const comper = await login('comper@demo.com');
  const mComper = (await call('GET', '/indicadores/meus', undefined, comper)).d;
  const kgComper = (await db.query(`SELECT COALESCE(SUM(quantidade_kg),0)::float AS kg FROM doacoes d JOIN usuarios u ON u.id = d.doador_id
                                     WHERE u.email = 'comper@demo.com'`)).rows[0].kg;
  assert.equal(mComper.kg, kgComper);
  assert.ok(g.kg > mComper.kg);
});

test('L06 meta do TMR é "menos de 90 min": exatamente 90 não atinge; sem dados, TMR/TEC são nulos', async () => {
  const doador = await registrar({ perfil: 'doador' }), ong = await registrar();
  const vazio = (await call('GET', '/indicadores/meus', undefined, doador.token)).d;
  assert.deepEqual([vazio.kg, vazio.doacoes, vazio.entidades, vazio.tmr_minutos, vazio.tec_percentual], [0, 0, 0, null, null]);
  assert.deepEqual(vazio.metas, { tmr_minutos: 90, tec_percentual: 92, tmr_atingida: null, tec_atingida: null });
  await lote(doador, ong, { kg: 1, minutos: 90 });
  const m = (await call('GET', '/indicadores/meus', undefined, ong.token)).d;
  assert.equal(m.tmr_minutos, 90);
  assert.equal(m.metas.tmr_atingida, false);
  assert.equal(m.tec_percentual, 100);
  assert.equal(m.metas.tec_atingida, true);
});

test('L06 indicadores exigem autenticação; /indicadores segue global e traz as métricas novas', async () => {
  erro(await call('GET', '/indicadores'), 401);
  erro(await call('GET', '/indicadores/meus'), 401);
  const comper = await login('comper@demo.com'), esperanca = await login('esperanca@demo.com');
  const a = (await call('GET', '/indicadores', undefined, comper)).d, b = (await call('GET', '/indicadores', undefined, esperanca)).d;
  assert.deepEqual(a, b);
  for (const chave of ['kg', 'refeicoes', 'co2', 'agua', 'entidades', 'doacoes', 'tmr_minutos', 'tec_percentual', 'metas'])
    assert.ok(chave in a, chave);
  assert.equal(a.refeicoes, Math.round(a.kg * 2));
});

// ---------- Front ----------
function contextoFront(extra = {}) {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const elementos = new Map();
  const contexto = {
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { getElementById: (nome) => {
      if (!elementos.has(nome)) elementos.set(nome, { value: '', innerHTML: '', checked: false, files: [], classList: { add() {}, remove() {}, toggle() {} } });
      return elementos.get(nome);
    } },
    fetch: async () => ({ ok: true, status: 200, json: async () => [] }),
    ...extra,
  };
  vm.createContext(contexto);
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], contexto);
  return { contexto, elementos, html };
}

test('L06 front: formulário de cadastro tem os campos novos, o aceite com link para os termos e o anexo da ONG', () => {
  const { html } = contextoFront();
  for (const id of ['cEndereco', 'cResponsavel', 'cTelefone', 'cAceite', 'cComprovante', 'boxComprovante']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /href="\/termos\.html#termo"/);
  assert.match(html, /href="\/termos\.html#privacidade"/);
  assert.match(html, /accept="application\/pdf,image\/jpeg,image\/png"/);
  assert.match(html, /\['numeros', 'Meus números'\]/);
});

test('L06 front: máscara do telefone, para fixo, celular e número colado com +55', () => {
  const { contexto, html } = contextoFront();
  const mascara = (valor) => { const input = { value: valor }; contexto.mascararTelefone(input); return input.value; };
  assert.equal(mascara('67999990006'), '(67) 99999-0006');
  assert.equal(mascara('6733330001'), '(67) 3333-0001');
  assert.equal(mascara('+55 67 99999-0006'), '(67) 99999-0006');
  // O navegador aplica o maxlength do campo antes do oninput: a colagem completa com +55 precisa caber.
  const maxlength = Number(html.match(/id="cTelefone"[^>]*maxlength="(\d+)"/)[1]);
  const cola = (valor) => mascara(valor.slice(0, maxlength));
  assert.equal(cola('+55 67 99999-0006'), '(67) 99999-0006');
  assert.equal(cola('+55 (67) 99999-0006'), '(67) 99999-0006');
  assert.equal(cola('+55 67 3333-0001'), '(67) 3333-0001');
  assert.equal(cola('5567999990006'), '(67) 99999-0006');
  assert.equal(mascara('679'), '(67) 9');
  assert.equal(mascara('67999'), '(67) 999');
  assert.equal(mascara('abc'), '');
});

test('L06 front: cadastro envia os campos novos e o aceite; anexo maior que 1 MB ou de outro tipo nem chega à rede', async () => {
  const chamadas = [];
  const { contexto, elementos } = contextoFront({
    fetch: async (url, opcoes) => { chamadas.push([url, opcoes]); return { ok: false, status: 400, json: async () => ({ erro: 'Recusado no teste.' }) }; },
  });
  const campo = (id, props) => { contexto.document.getElementById(id); Object.assign(elementos.get(id), props); };
  campo('cPerfil', { value: 'receptora' }); campo('cNome', { value: 'ONG' }); campo('cCnpj', { value: '11.222.333/0001-81' });
  campo('cEndereco', { value: 'Rua X, 1' }); campo('cResponsavel', { value: 'Fulana' }); campo('cTelefone', { value: '(67) 99999-0006' });
  campo('cBairro', { value: 'Centro' }); campo('cEmail', { value: 'a@b.co' }); campo('cSenha', { value: '123456' });
  campo('cAceite', { checked: true }); campo('cComprovante', { files: [] });
  chamadas.length = 0;
  await contexto.cadastrar();
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0][0], '/auth/register');
  const corpo = JSON.parse(chamadas[0][1].body);
  assert.deepEqual(corpo, { perfil: 'receptora', nome: 'ONG', cnpj: '11.222.333/0001-81', endereco: 'Rua X, 1', responsavel: 'Fulana',
    telefone: '(67) 99999-0006', bairro: 'Centro', email: 'a@b.co', senha: '123456', aceite_termos: true });
  assert.match(elementos.get('erroCadastro').innerHTML, /Recusado no teste/);

  chamadas.length = 0;
  for (const arquivo of [{ type: 'application/pdf', size: MIB + 1 }, { type: 'text/html', size: 10 }]) {
    campo('cComprovante', { files: [arquivo] });
    await contexto.cadastrar();
    assert.equal(chamadas.length, 0, 'não chama a API');
  }
  assert.match(elementos.get('erroCadastro').innerHTML, /PDF, JPEG ou PNG/);
  campo('cPerfil', { value: 'doador' });
  campo('cComprovante', { files: [{ type: 'text/html', size: 10 }] });
  await contexto.cadastrar(); // doador: o anexo é ignorado
  assert.equal(chamadas.length, 1);
});

test('L06 front: cartões do painel mostram TMR, TEC e as metas ao lado; sem dados aparece "—"', () => {
  const { contexto } = contextoFront();
  const base = { kg: 15.5, refeicoes: 31, co2: 39, agua: 5425, entidades: 2, doadores: 1, doacoes: 2 };
  const cheio = contexto.htmlIndicadores({ ...base, tmr_minutos: 60, tec_percentual: 66.7,
    metas: { tmr_minutos: 90, tec_percentual: 92, tmr_atingida: true, tec_atingida: false } });
  assert.match(cheio, /60 min/);
  assert.match(cheio, /66,7%/);
  assert.match(cheio, /Meta: menos de 90 min · meta atingida/);
  assert.match(cheio, /Meta: acima de 92% · meta não atingida/);
  assert.match(cheio, /entidades beneficiadas/);
  const vazio = contexto.htmlIndicadores({ ...base, tmr_minutos: null, tec_percentual: null,
    metas: { tmr_minutos: 90, tec_percentual: 92, tmr_atingida: null, tec_atingida: null } }, { entidades: ['doadores atendidos', 1], doacoes: true });
  assert.match(vazio, /—/);
  assert.match(vazio, /sem dados ainda/);
  assert.match(vazio, /doadores atendidos/);
  assert.match(vazio, /doações concluídas/);
});
