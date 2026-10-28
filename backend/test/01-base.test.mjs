// Adaptado de docs/testes/e2e-api.mjs; verificações originais preservadas.
import { call, login, ok, dia, hoje, janela } from './helpers.mjs';

const comper = await login('comper@demo.com'), sabor = await login('sabor@demo.com');
const esp = await login('esperanca@demo.com'), amb = await login('amambai@demo.com'), longe = await login('longe@demo.com');
ok('Login das 5 contas demo', comper && sabor && esp && amb && longe);
ok('Login senha errada -> 401', (await call('POST', '/auth/login', { email: 'comper@demo.com', senha: 'x' })).s === 401);
ok('Sem token -> 401', (await call('GET', '/lotes')).s === 401);
ok('Token inválido -> 401', (await call('GET', '/lotes', undefined, 'abc')).s === 401);

// ---- Cenário 1: E2E hortifrúti 50 kg, Comper (Centro) -> Monte Castelo / Amambai
let r = await call('POST', '/lotes', { alimento: 'Frutas E2E', categoria: 'Hortifrúti', quantidade_kg: 50, validade: dia(2) }, comper);
ok('C1 publicar lote 50kg', r.s === 201, JSON.stringify(r.d));
const id = r.d?.id;
const le = (await call('GET', '/lotes', undefined, esp)).d, la = (await call('GET', '/lotes', undefined, amb)).d;
ok('C1 lote visível p/ ONG Monte Castelo', le.some((l) => l.id === id), `dist=${le.find((l) => l.id === id)?.distancia_km}km`);
ok('C1 lote visível p/ ONG Amambai', la.some((l) => l.id === id), `dist=${la.find((l) => l.id === id)?.distancia_km}km`);
const disp = le.filter((l) => l.status === 'disponivel');
const ordenado = disp.every((l, i) => i === 0 || l.validade > disp[i - 1].validade || (l.validade === disp[i - 1].validade && Number(l.distancia_km) >= Number(disp[i - 1].distancia_km)));
ok('C1 ordenação validade -> distância', ordenado, disp.map((l) => `${l.validade}/${l.distancia_km}`).join(' '));
ok('Receptora longe (fora 10km) não vê lotes', (await call('GET', '/lotes', undefined, longe)).d.length === 0);
ok('Receptora longe não consegue reservar', (await call('PUT', `/lotes/${id}/reservar`, janela(dia(2)), longe)).s === 409);
ok('Doador não pode reservar (RBAC)', (await call('PUT', `/lotes/${id}/reservar`, undefined, comper)).s === 403);
ok('Receptora não pode publicar (RBAC)', (await call('POST', '/lotes', { alimento: 'x', categoria: 'y', quantidade_kg: 1, validade: dia(1) }, esp)).s === 403);
r = await call('PUT', `/lotes/${id}/reservar`, janela(dia(2)), esp);
ok('C1 reservar gera código 6 dígitos', r.s === 200 && /^\d{6}$/.test(r.d.codigo), JSON.stringify(r.d));
const codigo = r.d.codigo;
ok('Segunda ONG não reserva lote já reservado', (await call('PUT', `/lotes/${id}/reservar`, janela(dia(2)), amb)).s === 409);
ok('ONG que não reservou não vê o código', !(await call('GET', '/lotes', undefined, amb)).d.some((l) => l.id === id));
ok('Outro doador não confirma lote alheio', (await call('PUT', `/lotes/${id}/confirmar-retirada`, { codigo }, sabor)).s === 400);
ok('Código errado rejeitado', (await call('PUT', `/lotes/${id}/confirmar-retirada`, { codigo: codigo === '000000' ? '111111' : '000000' }, comper)).s === 400);
const ind0 = (await call('GET', '/indicadores', undefined, comper)).d;
r = await call('PUT', `/lotes/${id}/confirmar-retirada`, { codigo }, comper);
ok('C1 confirmar retirada c/ código', r.s === 200);
ok('Confirmar 2x não duplica', (await call('PUT', `/lotes/${id}/confirmar-retirada`, { codigo }, comper)).s === 400);
const dd = (await call('GET', '/doacoes', undefined, comper)).d;
ok('C1 doação registrada (comprovante/log)', dd.some((x) => x.codigo === codigo && x.entidade === 'Casa de Apoio Esperança'));
ok('C1 doação aparece p/ receptora', (await call('GET', '/doacoes', undefined, esp)).d.some((x) => x.codigo === codigo));
const ind1 = (await call('GET', '/indicadores', undefined, comper)).d;
ok('C1 indicadores atualizados (+50kg)', ind1.kg - ind0.kg === 50, `${ind0.kg} -> ${ind1.kg}`);

// ---- Cenário 2: regras de negócio
const pub = (b) => call('POST', '/lotes', { alimento: 'Teste', categoria: 'Panificados', quantidade_kg: 5, validade: dia(1), ...b }, comper);
for (const [nome, b, esperado] of [
  ['qtd 0', { quantidade_kg: 0 }, 400], ['qtd negativa', { quantidade_kg: -3 }, 400], ['qtd texto', { quantidade_kg: 'abc' }, 400],
  ['qtd vazia', { quantidade_kg: '' }, 400], ['validade ontem', { validade: dia(-1) }, 400], ['validade inválida', { validade: '2026-02-31' }, 400],
  ['validade formato BR', { validade: '30/10/2026' }, 400], ['sem alimento', { alimento: '' }, 400], ['validade hoje (permitido)', { validade: hoje }, 201],
  ['alimento numérico (tipo errado)', { alimento: 123 }, 400], ['categoria arbitrária', { categoria: 'qualquer coisa' }, 400],
  ['qtd absurda 1e12', { quantidade_kg: 1e12 }, 400], ['alimento só espaços', { alimento: '   ' }, 400],
]) { const x = await pub(b); ok(`C2 ${nome} -> ${esperado}`, x.s === esperado, `status=${x.s} ${JSON.stringify(x.d)}`); }

// Cadastro
const em = `t${Date.now()}@x.com`;
const reg = (b) => call('POST', '/auth/register', { nome: 'ONG Teste', email: em, senha: '123456', perfil: 'receptora', bairro: 'Centro', cnpj: '11.222.333/0001-81', ...b });
r = await reg({}); ok('Cadastro receptora ok', r.s === 201);
ok('Cadastro e-mail duplicado -> 409', (await reg({})).s === 409);
ok('Cadastro senha curta -> 400', (await reg({ email: 'a' + em, senha: '123' })).s === 400);
ok('Cadastro perfil inválido -> 400', (await reg({ email: 'b' + em, perfil: 'admin' })).s === 400);
r = await reg({ email: 'c' + em, cnpj: '123' });
ok('Cadastro CNPJ inválido rejeitado (Fluxo 1)', r.s === 400, `status=${r.s}`);
r = await reg({ email: 'naoeemail' });
ok('Cadastro e-mail inválido rejeitado', r.s === 400, `status=${r.s}`);
r = await reg({ email: 'd' + em, senha: 12345678 });
ok('Cadastro senha numérica (tipo) não dá 500', r.s !== 500, `status=${r.s} ${JSON.stringify(r.d)}`);

// Robustez
r = await call('PUT', '/lotes/abc/reservar', undefined, esp);
ok('reservar id não numérico não dá 500', r.s !== 500, `status=${r.s} ${JSON.stringify(r.d)}`);
ok('login body vazio não dá 500', (await call('POST', '/auth/login', {})).s === 401);

// ---- Cenário 3: 20 requisições simultâneas de busca + reserva
r = await call('POST', '/lotes', { alimento: 'Carga', categoria: 'Panificados', quantidade_kg: 3, validade: dia(1) }, sabor);
const idc = r.d.id; const t0 = Date.now();
const reqs = [];
for (let i = 0; i < 10; i++) reqs.push(call('GET', '/lotes', undefined, i % 2 ? esp : amb));
for (let i = 0; i < 10; i++) reqs.push(call('PUT', `/lotes/${idc}/reservar`, janela(dia(1)), i % 2 ? esp : amb));
const out = await Promise.all(reqs); const ms = Date.now() - t0;
const sucessos = out.slice(10).filter((x) => x.s === 200).length;
ok('C3 20 req simultâneas sem erro 5xx', out.every((x) => x.s < 500), `${ms}ms`);
ok('C3 apenas 1 reserva vence a corrida', sucessos === 1, `sucessos=${sucessos}`);
// carga maior
const t1 = Date.now(); const big = await Promise.all(Array.from({ length: 200 }, (_, i) => call('GET', '/lotes', undefined, i % 2 ? esp : amb)));
ok('Extra: 200 GET /lotes simultâneos', big.every((x) => x.s === 200), `${Date.now() - t1}ms`);

// Indicadores globais x por usuário
ok('Indicadores são globais (não por doador)', JSON.stringify((await call('GET', '/indicadores', undefined, sabor)).d) === JSON.stringify((await call('GET', '/indicadores', undefined, comper)).d));
