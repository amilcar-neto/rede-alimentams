// Fumaça E2E da API Rede AlimentaMS (cenários da Etapa 4 + bordas), contra um servidor já rodando.
// Uso: node docs/testes/e2e-api.mjs   (E2E_URL muda o alvo; padrão http://localhost:3000)
// Cria lotes, reservas e uma conta: rode só contra banco descartável recém-criado com db/init.sql.
// A suíte oficial é `npm test` em backend/; este script é a verificação rápida e manual.
const B = process.env.E2E_URL || 'http://localhost:3000';
const res = [];
const ok = (nome, cond, info = '') => { res.push({ nome, ok: !!cond, info }); console.log(`${cond ? 'PASS' : 'FAIL'} | ${nome}${info ? ' | ' + info : ''}`); };
async function call(m, url, body, tok) {
  const r = await fetch(B + url, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  let d; try { d = await r.json(); } catch { d = null; }
  return { s: r.status, d };
}
const login = async (e) => (await call('POST', '/auth/login', { email: e, senha: '123456' })).d.token;
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Campo_Grande' }).format(new Date());
const dia = (n) => new Date(Date.parse(hoje) + n * 86400e3).toISOString().slice(0, 10);
// Contratos atuais: horário limite de retirada (fim do dia da validade), janela da reserva e checklist sanitário.
const ate = (validade) => `${dia(Math.round((Date.parse(validade) - Date.parse(hoje)) / 86400e3) + 1)}T00:00`;
const local = (min) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Campo_Grande', year: 'numeric',
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(Date.now() + min * 60000)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};
const janela = () => ({ janela_inicio: local(0), janela_fim: local(60) });
const checklist = { embalagem_integra: true, temperatura_adequada: true, dentro_validade: true };

const comper = await login('comper@demo.com'), sabor = await login('sabor@demo.com');
const esp = await login('esperanca@demo.com'), amb = await login('amambai@demo.com'), longe = await login('longe@demo.com');
ok('Login das 5 contas demo', comper && sabor && esp && amb && longe);
ok('Login senha errada -> 401', (await call('POST', '/auth/login', { email: 'comper@demo.com', senha: 'x' })).s === 401);
ok('Sem token -> 401', (await call('GET', '/lotes')).s === 401);
ok('Token inválido -> 401', (await call('GET', '/lotes', undefined, 'abc')).s === 401);

// ---- Cenário 1: E2E hortifrúti 50 kg, Comper (Centro) -> Monte Castelo / Amambai
let r = await call('POST', '/lotes', { alimento: 'Frutas E2E', categoria: 'Hortifrúti', quantidade_kg: 50, validade: dia(2), retirada_ate: ate(dia(2)) }, comper);
ok('C1 publicar lote 50kg', r.s === 201, JSON.stringify(r.d));
const id = r.d?.id;
const le = (await call('GET', '/lotes', undefined, esp)).d, la = (await call('GET', '/lotes', undefined, amb)).d;
ok('C1 lote visível p/ ONG Monte Castelo', le.some((l) => l.id === id), `dist=${le.find((l) => l.id === id)?.distancia_km}km`);
ok('C1 lote visível p/ ONG Amambai', la.some((l) => l.id === id), `dist=${la.find((l) => l.id === id)?.distancia_km}km`);
const disp = le.filter((l) => l.status === 'disponivel');
const ordenado = disp.every((l, i) => i === 0 || l.validade > disp[i - 1].validade || (l.validade === disp[i - 1].validade && Number(l.distancia_km) >= Number(disp[i - 1].distancia_km)));
ok('C1 ordenação validade -> distância', ordenado, disp.map((l) => `${l.validade}/${l.distancia_km}`).join(' '));
ok('Receptora longe (fora 10km) não vê lotes', (await call('GET', '/lotes', undefined, longe)).d.length === 0);
ok('Receptora longe não consegue reservar', (await call('PUT', `/lotes/${id}/reservar`, janela(), longe)).s === 409);
ok('Doador não pode reservar (RBAC)', (await call('PUT', `/lotes/${id}/reservar`, janela(), comper)).s === 403);
ok('Receptora não pode publicar (RBAC)', (await call('POST', '/lotes', { alimento: 'x', categoria: 'y', quantidade_kg: 1, validade: dia(1) }, esp)).s === 403);
r = await call('PUT', `/lotes/${id}/reservar`, janela(), esp);
ok('C1 reservar gera código 6 dígitos', r.s === 200 && /^\d{6}$/.test(r.d.codigo), JSON.stringify(r.d));
const codigo = r.d.codigo;
ok('Segunda ONG não reserva lote já reservado', (await call('PUT', `/lotes/${id}/reservar`, janela(), amb)).s === 409);
ok('ONG que não reservou não vê o código', !(await call('GET', '/lotes', undefined, amb)).d.some((l) => l.id === id));
ok('Outro doador não confirma lote alheio', (await call('PUT', `/lotes/${id}/confirmar-retirada`, { codigo, checklist }, sabor)).s === 400);
ok('Código errado rejeitado', (await call('PUT', `/lotes/${id}/confirmar-retirada`, { codigo: codigo === '000000' ? '111111' : '000000', checklist }, comper)).s === 400);
ok('Checklist incompleto rejeitado', (await call('PUT', `/lotes/${id}/confirmar-retirada`, { codigo, checklist: { ...checklist, temperatura_adequada: false } }, comper)).s === 400);
const ind0 = (await call('GET', '/indicadores', undefined, comper)).d;
r = await call('PUT', `/lotes/${id}/confirmar-retirada`, { codigo, checklist }, comper);
ok('C1 confirmar retirada c/ código', r.s === 200);
ok('C1 comprovante com hash SHA-256 verificável', /^[0-9a-f]{64}$/.test(r.d?.hash || '') && (await fetch(`${B}/verificar/${r.d.hash}`)).status === 200);
ok('Confirmar 2x não duplica', (await call('PUT', `/lotes/${id}/confirmar-retirada`, { codigo, checklist }, comper)).s === 400);
const dd = (await call('GET', '/doacoes', undefined, comper)).d;
ok('C1 doação registrada (comprovante/log)', dd.some((x) => x.codigo === codigo && x.entidade === 'Casa de Apoio Esperança'));
ok('C1 doação aparece p/ receptora', (await call('GET', '/doacoes', undefined, esp)).d.some((x) => x.codigo === codigo));
const ind1 = (await call('GET', '/indicadores', undefined, comper)).d;
ok('C1 indicadores atualizados (+50kg)', ind1.kg - ind0.kg === 50, `${ind0.kg} -> ${ind1.kg}`);

// ---- Cenário 2: regras de negócio
const pub = (b) => call('POST', '/lotes', { alimento: 'Teste', categoria: 'Panificados', quantidade_kg: 5, validade: dia(1), retirada_ate: ate(b.validade && /^\d{4}-\d{2}-\d{2}$/.test(b.validade) && !Number.isNaN(Date.parse(b.validade)) ? b.validade : dia(1)), ...b }, comper);
for (const [nome, b, esperado] of [
  ['qtd 0', { quantidade_kg: 0 }, 400], ['qtd negativa', { quantidade_kg: -3 }, 400], ['qtd texto', { quantidade_kg: 'abc' }, 400],
  ['qtd vazia', { quantidade_kg: '' }, 400], ['validade ontem', { validade: dia(-1) }, 400], ['validade inválida', { validade: '2026-02-31' }, 400],
  ['validade formato BR', { validade: '30/10/2026' }, 400], ['sem alimento', { alimento: '' }, 400], ['validade hoje (permitido)', { validade: hoje }, 201],
  ['alimento numérico (tipo errado)', { alimento: 123 }, 400], ['categoria arbitrária', { categoria: 'qualquer coisa' }, 400],
  ['qtd absurda 1e12', { quantidade_kg: 1e12 }, 400], ['alimento só espaços', { alimento: '   ' }, 400],
]) { const x = await pub(b); ok(`C2 ${nome} -> ${esperado}`, x.s === esperado, `status=${x.s} ${JSON.stringify(x.d)}`); }

// Cadastro
const em = `t${Date.now()}@x.com`;
const reg = (b) => call('POST', '/auth/register', { nome: 'ONG Teste', email: em, senha: '123456', perfil: 'receptora', bairro: 'Centro', cnpj: '11.222.333/0001-81',
  endereco: 'Rua Teste, 1 (fictício)', responsavel: 'Responsável Teste', telefone: '(67) 99999-0000', aceite_termos: true, ...b });
r = await reg({}); ok('Cadastro receptora ok', r.s === 201);
ok('Cadastro e-mail duplicado -> 409', (await reg({})).s === 409);
ok('Cadastro senha curta -> 400', (await reg({ email: 'a' + em, senha: '123' })).s === 400);
ok('Cadastro perfil inválido -> 400', (await reg({ email: 'b' + em, perfil: 'admin' })).s === 400);
ok('Cadastro CNPJ inválido rejeitado (Fluxo 1)', (await reg({ email: 'c' + em, cnpj: '123' })).s === 400);
ok('Cadastro e-mail inválido rejeitado', (await reg({ email: 'naoeemail' })).s === 400);
ok('Cadastro senha numérica (tipo) não dá 500', (await reg({ email: 'd' + em, senha: 12345678 })).s !== 500);
ok('Cadastro sem aceite dos termos -> 400', (await reg({ email: 'e' + em, aceite_termos: false })).s === 400);

// Robustez
ok('reservar id não numérico não dá 500', (await call('PUT', '/lotes/abc/reservar', janela(), esp)).s !== 500, `status=${(await call('PUT', '/lotes/abc/reservar', janela(), esp)).s}`);
ok('login body vazio não dá 500', (await call('POST', '/auth/login', {})).s === 401);

// ---- Cenário 3: 20 requisições simultâneas de busca + reserva
r = await call('POST', '/lotes', { alimento: 'Carga', categoria: 'Panificados', quantidade_kg: 3, validade: dia(1), retirada_ate: ate(dia(1)) }, sabor);
const idc = r.d.id; const t0 = Date.now();
const reqs = [];
for (let i = 0; i < 10; i++) reqs.push(call('GET', '/lotes', undefined, i % 2 ? esp : amb));
for (let i = 0; i < 10; i++) reqs.push(call('PUT', `/lotes/${idc}/reservar`, janela(), i % 2 ? esp : amb));
const out = await Promise.all(reqs); const ms = Date.now() - t0;
const sucessos = out.slice(10).filter((x) => x.s === 200).length;
ok('C3 20 req simultâneas sem erro 5xx', out.every((x) => x.s < 500), `${ms}ms`);
ok('C3 apenas 1 reserva vence a corrida', sucessos === 1, `sucessos=${sucessos}`);
// carga maior
const t1 = Date.now(); const big = await Promise.all(Array.from({ length: 200 }, (_, i) => call('GET', '/lotes', undefined, i % 2 ? esp : amb)));
ok('Extra: 200 GET /lotes simultâneos', big.every((x) => x.s === 200), `${Date.now() - t1}ms`);

// Indicadores globais x por usuário
ok('Indicadores são globais (não por doador)', JSON.stringify((await call('GET', '/indicadores', undefined, sabor)).d) === JSON.stringify((await call('GET', '/indicadores', undefined, comper)).d));
// Desistência e cancelamento (pós-revisão final)
r = await call('POST', '/lotes', { alimento: 'Desistência E2E', categoria: 'Panificados', quantidade_kg: 2, validade: dia(1), retirada_ate: ate(dia(1)) }, comper);
const idd = r.d.id;
await call('PUT', `/lotes/${idd}/reservar`, janela(), esp);
ok('ONG desiste da reserva', (await call('PUT', `/lotes/${idd}/cancelar-reserva`, undefined, esp)).s === 200);
ok('Lote volta para outra ONG', (await call('GET', '/lotes', undefined, amb)).d.some((l) => l.id === idd && l.status === 'disponivel'));
ok('Doador cancela o lote', (await call('PUT', `/lotes/${idd}/cancelar`, undefined, comper)).s === 200);
ok('Lote cancelado some para a ONG', !(await call('GET', '/lotes', undefined, amb)).d.some((l) => l.id === idd));

console.log(`\nTOTAL: ${res.filter((x) => x.ok).length}/${res.length} PASS`);
process.exitCode = res.every((x) => x.ok) ? 0 : 1;
