import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Scheduler, classify, acquireLock, readJson, atomicJson, providerCommand, runProcess, git } from './core.mjs';
import { runController, loadConfig, initialState, testEnvironment } from './cli.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MINUTE = 60_000;
const report = (status = 'ready') => ({ status, summary: 'Etapa verificada.', next_step: 'Continuar.', evidence: ['fixture local'] });
function response(provider, status = 'ready', extra = {}) {
  const body = { ...report(status), block_reason: 'none', ...extra };
  const event = provider === 'codex' ? { type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(body) } }
    : { type: 'result', is_error: false, structured_output: body };
  return { code: 0, stdout: JSON.stringify(event), stderr: '' };
}
const quota = () => ({ code: 1, stdout: JSON.stringify({ type: 'error', error: { code: 'usage_limit_reached' } }), stderr: '' });
function fixture(t) {
  const base = path.join(ROOT, '.agentes'); fs.mkdirSync(base, { recursive: true });
  const root = fs.mkdtempSync(path.join(base, 'teste-'));
  fs.writeFileSync(path.join(root, '.gitignore'), '.agentes/\n');
  fs.writeFileSync(path.join(root, 'app.txt'), 'baseline');
  t.after(() => {
    const resolved = path.resolve(root), allowed = path.resolve(base) + path.sep;
    if (!resolved.startsWith(allowed)) throw new Error('Limpeza de teste recusada fora do diretório permitido.');
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  return root;
}
// Existing tests cover the strict mode; never-stop has dedicated tests below.
function config() { return { ...loadConfig(ROOT), retryMinutes: 1, heartbeatMinutes: 1, neverStop: false }; }
const queue = [{ id: 'T00', section: 'T00', scope: 'fixture', critical: false }];

test('CLIs e testes recebem a conexão isolada, sem herdar banco de desenvolvimento', () => {
  const env = testEnvironment(config(), { DATABASE_URL: 'postgres://dev@localhost/alimentams', EXEMPLO: 'preservar' });
  assert.equal(new URL(env.DATABASE_URL).pathname, '/alimentams_test');
  assert.equal(env.DATABASE_URL, env.TEST_DATABASE_URL);
  assert.equal(env.EXEMPLO, 'preservar');
});
test('conexão explícita de testes prevalece, mas desenvolvimento e produção são recusados', () => {
  const connection = 'postgres://teste@localhost:5544/alimentams_test_usuario';
  assert.equal(testEnvironment(config(), { TEST_DATABASE_URL: connection }).DATABASE_URL, connection);
  for (const name of ['alimentams', 'postgres', 'production', 'alimentams_test%2Foutro']) {
    assert.throws(() => testEnvironment(config(), { TEST_DATABASE_URL: `postgres://localhost/${name}` }), /banco exclusivo/);
  }
});

test('prioridade começa no Codex; Claude permanece até esgotar', () => {
  const s = new Scheduler();
  assert.equal(s.provider, 'codex');
  assert.equal(s.quota(null, 0, 60 * MINUTE), 'switch');
  assert.equal(s.provider, 'claude');
  s.success(); assert.equal(s.provider, 'claude');
  assert.equal(s.quota(null, 0, 60 * MINUTE), 'wait');
  assert.equal(Date.parse(s.waitUntil), 60 * MINUTE);
  s.newCycle(); assert.equal(s.provider, 'codex');
});
test('renovação explícita antecipa a hora, sem inventar janela de cinco horas', () => {
  const s = new Scheduler();
  s.quota(new Date(10 * MINUTE).toISOString(), 0, 60 * MINUTE);
  s.quota(null, 0, 60 * MINUTE);
  assert.equal(Date.parse(s.waitUntil), 10 * MINUTE);
});
test('preferência e espera sobrevivem a reinício', () => {
  const s = new Scheduler(); s.quota(null, 100, 60 * MINUTE);
  const restored = new Scheduler(JSON.parse(JSON.stringify(s)));
  assert.equal(restored.provider, 'claude');
});
test('erro real de limite provoca fallback', () => {
  assert.equal(classify('codex', quota()).kind, 'quota');
  assert.equal(classify('claude', { code: 1, stdout: JSON.stringify({ type: 'assistant', error: 'rate_limit' }), stderr: '' }).kind, 'quota');
});
test('429 de rede, login, timeout e permissões não são classificados como cota', () => {
  for (const stderr of ['HTTP 429 Too Many Requests', 'Authentication required', 'Permission denied']) {
    assert.equal(classify('codex', { code: 1, stdout: '', stderr }).kind, 'error');
  }
  assert.equal(classify('codex', { ...response('codex'), timedOut: true }).kind, 'error');
  assert.equal(classify('claude', { code: 0, stdout: JSON.stringify({ type: 'result', permission_denials: [{ tool_name: 'Bash' }], structured_output: { ...report('blocked'), block_reason: 'permission_denied' } }) }).kind, 'error');
});
test('negativa contornada pelo Claude com etapa concluída segue para testes', () => {
  const outcome = classify('claude', { code: 0, stdout: JSON.stringify({ type: 'result', permission_denials: [{ tool_name: 'Bash' }], structured_output: report() }) });
  assert.equal(outcome.kind, 'success');
  assert.equal(outcome.permissionDenials, 1);
});
test('modo sem parada: Codex bloqueado sai e Claude conclui; erro do Claude espera e repete', async t => {
  const root = fixture(t), seen = []; let clock = Date.now(), claudeCalls = 0;
  await runController({ root, config: { ...config(), neverStop: true }, queue,
    execute: async ({ provider }) => {
      seen.push(provider);
      if (provider === 'codex') return response(provider, 'blocked', { block_reason: 'other' });
      claudeCalls++;
      return claudeCalls === 1 ? { code: 1, stdout: '', stderr: 'falha momentânea' } : response(provider);
    },
    now: () => clock, sleep: async ms => { clock += ms; },
    gate: async () => ({ code: 0, stdout: 'OK', stderr: '' }) });
  const state = readJson(path.join(root, '.agentes/estado.json'));
  assert.deepEqual(seen, ['codex', 'claude', 'claude']);
  assert.equal(state.status, 'concluido');
  assert.equal(state.scheduler.codexOff, false); // reset once the lot is integrated
});
test('modo sem parada: Claude limitado passa ao Codex; se Codex também limitar, espera renovação do Claude', () => {
  const s = new Scheduler({ provider: 'claude', codexOff: true });
  assert.equal(s.quota(new Date(20 * MINUTE).toISOString(), 0, 60 * MINUTE), 'switch');
  assert.equal(s.provider, 'codex');
  assert.equal(s.quota(null, 0, 60 * MINUTE), 'wait');
  assert.equal(Date.parse(s.waitUntil), 20 * MINUTE);
  s.newCycle(); assert.equal(s.provider, 'claude');
});
test('modo sem parada: Codex desativado volta a ser opção no lote seguinte', async t => {
  const root = fixture(t), seen = [];
  await runController({ root, config: { ...config(), neverStop: true },
    queue: [queue[0], { id: 'T01', section: 'T01', scope: 'fixture', critical: false }],
    execute: async ({ provider, task }) => {
      seen.push(`${provider}:${task.id}`);
      if (provider === 'codex' && task.id === 'T00') return response(provider, 'blocked', { block_reason: 'other' });
      if (provider === 'claude' && task.id === 'T01') return quota();
      return response(provider);
    }, gate: async () => ({ code: 0, stdout: 'OK', stderr: '' }) });
  assert.deepEqual(seen, ['codex:T00', 'claude:T00', 'claude:T01', 'codex:T01']);
});
test('menção a limite no conteúdo normal não esgota a ferramenta', () => {
  const r = report(); r.summary = "Documentação: You've hit your usage limit";
  const stdout = JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(r) } });
  assert.equal(classify('codex', { code: 0, stdout, stderr: '' }).kind, 'success');
});
test('respostas incompletas ou inválidas não aprovam etapa', () => {
  for (const stdout of ['', '{}', JSON.stringify({ type: 'result', structured_output: { status: 'ready' } })]) {
    assert.equal(classify('claude', { code: 0, stdout, stderr: '' }).kind, 'error');
  }
});
test('schema funciona nos formatos das duas CLIs', () => {
  for (const p of ['codex', 'claude']) assert.equal(classify(p, response(p)).report.status, 'ready');
});
test('adaptadores mantêm configuração de permissões explícita', () => {
  const c = config(); c.codex.command = process.execPath; c.claude.command = process.execPath;
  const codex = providerCommand('codex', c, ROOT, { critical: true }, 'implement');
  assert.ok(codex.args.includes('workspace-write')); assert.ok(codex.args.includes('model_reasoning_effort="high"'));
  assert.ok(!codex.args.includes('--dangerously-bypass-approvals-and-sandbox'));
  const claude = providerCommand('claude', c, ROOT, {}, 'review');
  assert.ok(claude.args.includes('--dangerously-skip-permissions')); assert.equal(claude.model, 'opus');
  assert.ok(claude.args.includes('--chrome'));
  c.claude.chrome = false;
  assert.ok(!providerCommand('claude', c, ROOT, {}, 'review').args.includes('--chrome'));
  c.claude.permissionMode = 'dontAsk';
  assert.ok(!providerCommand('claude', c, ROOT, {}, 'review').args.includes('--dangerously-skip-permissions'));
});
test('lock impede dois controladores e preserva PID do filho', t => {
  const file = path.join(fixture(t), 'lock.json');
  const lock = acquireLock(file); lock.child(process.pid);
  assert.throws(() => acquireLock(file), /ativa/);
  lock.child(null); lock.release(); assert.equal(fs.existsSync(file), false);
});
test('processo real recebe stdin com espaços e sem interpretação por shell', async t => {
  const root = fixture(t);
  const result = await runProcess(process.execPath, ['-e', "process.stdin.on('data',d=>process.stdout.write(d))"], { cwd: root, input: '$(inocente) `texto` com espaços\nsegunda linha', timeoutMs: 5000 });
  assert.equal(result.code, 0); assert.equal(result.stdout, '$(inocente) `texto` com espaços\nsegunda linha');
});
test('timeout encerra filho antes de devolver controle', async t => {
  let pid;
  const result = await runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { cwd: fixture(t), timeoutMs: 150, onSpawn: p => { pid = p; } });
  assert.equal(result.timedOut, true); assert.ok(pid);
  assert.throws(() => process.kill(pid, 0));
});
test('controlador integra lote só após gate local bem-sucedido', async t => {
  const root = fixture(t); let gates = 0;
  await runController({ root, config: config(), queue,
    execute: async ({ provider }) => { fs.writeFileSync(path.join(root, 'app.txt'), 'implementado'); return response(provider); },
    gate: async () => { gates++; return { code: 0, stdout: 'testes passaram', stderr: '' }; } });
  const state = readJson(path.join(root, '.agentes/estado.json'));
  assert.equal(state.status, 'concluido'); assert.equal(state.queue[0].status, 'ok'); assert.equal(gates, 1);
  assert.equal(git(root, ['branch', '--show-current']).stdout.trim(), 'main');
});
test('lote crítico exige sessão de revisão e aprovação antes do merge', async t => {
  const root = fixture(t), phases = [];
  await runController({ root, config: config(), queue: [{ ...queue[0], critical: true }],
    execute: async ({ provider, task }) => {
      phases.push(task.phase);
      if (task.phase === 'implement') fs.writeFileSync(path.join(root, 'app.txt'), 'implementado');
      return response(provider);
    }, gate: async () => ({ code: 0, stdout: 'OK', stderr: '' }) });
  assert.deepEqual(phases, ['implement', 'review']);
});
test('fallback conserva trabalho parcial e mantém Claude entre chamadas', async t => {
  const root = fixture(t), seen = [];
  await runController({ root, config: config(), queue,
    execute: async ({ provider }) => {
      seen.push(provider);
      fs.writeFileSync(path.join(root, 'app.txt'), `passo ${seen.length}`);
      return seen.length === 1 ? quota() : response(provider, seen.length === 2 ? 'continue' : 'ready');
    }, gate: async () => ({ code: 0, stdout: 'OK', stderr: '' }) });
  assert.deepEqual(seen, ['codex', 'claude', 'claude']);
  assert.match(git(root, ['log', '--oneline']).stdout, /codex implement/);
});
test('ferramenta indisponível transfere trabalho salvo ao Claude e mantém gate e revisão', async t => {
  const root = fixture(t), seen = [];
  await runController({ root, config: config(), queue: [{ ...queue[0], critical: true }],
    execute: async ({ provider, task, prompt }) => {
      seen.push(`${provider}:${task.phase}`);
      if (provider === 'codex') {
        fs.writeFileSync(path.join(root, 'app.txt'), 'parcial salvo');
        return response(provider, 'blocked', { block_reason: 'tool_unavailable', summary: 'Conector ausente.' });
      }
      assert.equal(fs.readFileSync(path.join(root, 'app.txt'), 'utf8'), 'parcial salvo');
      if (task.phase === 'implement') assert.match(prompt, /Conector ausente/);
      return response(provider);
    }, gate: async () => ({ code: 0, stdout: 'OK', stderr: '' }) });
  const state = readJson(path.join(root, '.agentes/estado.json'));
  assert.deepEqual(seen, ['codex:implement', 'claude:implement', 'claude:review']);
  assert.equal(state.status, 'concluido');
  assert.deepEqual(state.scheduler.limited, { codex: false, claude: false });
  assert.equal(state.queue[0].toolHandoff.to, 'claude');
});

test('negativa no Codex transfere uma vez ao Claude', async t => {
  const root = fixture(t), seen = [];
  await runController({ root, config: config(), queue,
    execute: async ({ provider }) => { seen.push(provider);
      return provider === 'codex' ? response(provider, 'blocked', { block_reason: 'permission_denied' }) : response(provider); },
    gate: async () => ({ code: 0, stdout: 'OK', stderr: '' }) });
  assert.deepEqual(seen, ['codex', 'claude']);
});
test('bloqueio legado e indisponibilidade sem evidência não transferem', async t => {
  for (const extra of [{ block_reason: undefined },
    { block_reason: 'other' }, { block_reason: 'tool_unavailable', evidence: [] }]) {
    const root = fixture(t), seen = [];
    await assert.rejects(runController({ root, config: config(), queue,
      execute: async ({ provider }) => { seen.push(provider); return response(provider, 'blocked', extra); }
    }), /Etapa verificada/);
    assert.deepEqual(seen, ['codex']);
    assert.equal(readJson(path.join(root, '.agentes/estado.json')).status, 'bloqueado');
  }
});

test('Claude também indisponível bloqueia e retomada não repete transferência', async t => {
  const root = fixture(t), seen = [];
  const execute = async ({ provider }) => {
    seen.push(provider); return response(provider, 'blocked', { block_reason: 'tool_unavailable' });
  };
  await assert.rejects(runController({ root, config: config(), queue, execute }), /Etapa verificada/);
  const statePath = path.join(root, '.agentes/estado.json');
  const state = readJson(statePath);
  assert.deepEqual(seen, ['codex', 'claude']);
  assert.equal(state.status, 'bloqueado');
  // Simulate a later quota cycle returning to Codex: persisted handoff still limits retries.
  state.scheduler.provider = 'codex'; atomicJson(statePath, state);
  await assert.rejects(runController({ root, config: config(), queue, execute, resume: true }), /Etapa verificada/);
  assert.deepEqual(seen, ['codex', 'claude', 'codex']);
});

test('duas cotas esperam e reiniciam hierarquia no Codex', async t => {
  const root = fixture(t), seen = []; let sleeps = 0, clock = Date.now();
  await runController({ root, config: config(), queue,
    execute: async ({ provider }) => { seen.push(provider); return seen.length <= 2 ? quota() : response(provider); },
    now: () => clock,
    sleep: async ms => { sleeps++; clock += ms; },
    gate: async () => ({ code: 0, stdout: 'OK', stderr: '' }) });
  assert.ok(sleeps > 0); assert.deepEqual(seen, ['codex', 'claude', 'codex']);
});
test('erro de login bloqueia sem chamar Claude', async t => {
  const root = fixture(t), seen = [];
  await assert.rejects(runController({ root, config: config(), queue,
    execute: async ({ provider }) => { seen.push(provider); return { code: 1, stdout: '', stderr: 'Login required' }; },
    gate: async () => { throw new Error('não deveria executar'); } }), /Falha de CLI/);
  assert.deepEqual(seen, ['codex']);
  assert.equal(readJson(path.join(root, '.agentes/estado.json')).status, 'bloqueado');
});
test('revisor que altera código é interrompido sem integrar', async t => {
  const root = fixture(t);
  await assert.rejects(runController({ root, config: config(), queue: [{ ...queue[0], critical: true }],
    execute: async ({ provider, task }) => { fs.writeFileSync(path.join(root, 'app.txt'), task.phase); return response(provider); },
    gate: async () => ({ code: 0, stdout: 'OK', stderr: '' }) }), /Revisor alterou/);
  assert.equal(git(root, ['show', 'main:app.txt']).stdout, 'baseline');
});
test('testes reprovados bloqueiam integração e permitem retomada após correção', async t => {
  const root = fixture(t); let calls = 0;
  const cfg = { ...config(), maxFixRounds: 1 };
  const execute = async ({ provider }) => {
    calls++; fs.writeFileSync(path.join(root, 'app.txt'), `tentativa ${calls}`); return response(provider);
  };
  await assert.rejects(runController({ root, config: cfg, queue, execute,
    gate: async () => ({ code: 1, stdout: 'regressão detectada', stderr: '' }) }), /Testes continuam falhando/);
  assert.equal(git(root, ['show', 'main:app.txt']).stdout, 'baseline');
  await runController({ root, config: cfg, queue, execute, resume: true,
    gate: async () => ({ code: 0, stdout: 'regressão corrigida', stderr: '' }) });
  assert.equal(readJson(path.join(root, '.agentes/estado.json')).status, 'concluido');
});
test('reinício conserva Claude como executor depois de bloqueio corrigido', async t => {
  const root = fixture(t); let calls = 0;
  await assert.rejects(runController({ root, config: config(), queue,
    execute: async ({ provider }) => {
      calls++;
      return calls === 1 ? quota() : { code: 1, stdout: '', stderr: 'configuração inválida' };
    } }), /Falha de CLI/);
  const state = readJson(path.join(root, '.agentes/estado.json'));
  assert.equal(state.scheduler.provider, 'claude');
  const seen = [];
  await runController({ root, config: config(), queue, resume: true,
    execute: async ({ provider }) => { seen.push(provider); return response(provider); },
    gate: async () => ({ code: 0, stdout: 'OK', stderr: '' }) });
  assert.deepEqual(seen, ['claude']);
});
test('retomar com seleção explícita chama Claude e preserva o diagnóstico anterior', async t => {
  const root = fixture(t), seen = [];
  await assert.rejects(runController({ root, config: config(), queue,
    execute: async ({ provider }) => response(provider, 'blocked', {
      block_reason: 'permission_denied', summary: 'Edge negado no Codex.' }) }), /Edge negado/);
  await runController({ root, config: config(), resume: true, requestedProvider: 'claude',
    execute: async ({ provider, prompt }) => {
      seen.push(provider);
      assert.match(prompt, /Edge negado no Codex/);
      assert.match(prompt, /usuário solicitou explicitamente/);
      return response(provider);
    }, gate: async () => ({ code: 0, stdout: 'OK', stderr: '' }) });
  assert.deepEqual(seen, ['claude']);
  assert.equal(readJson(path.join(root, '.agentes/estado.json')).status, 'concluido');
});

test('seleção explícita inválida é recusada antes de criar runtime', async t => {
  const root = fixture(t);
  await assert.rejects(runController({ root, config: config(), requestedProvider: 'claude' }), /apenas em retomar/);
  await assert.rejects(runController({ root, config: config(), resume: true, requestedProvider: 'outro' }), /apenas em retomar/);
  assert.equal(fs.existsSync(path.join(root, '.agentes')), false);
});

test('parar interrompe o ciclo sem chamar outro provedor', async t => {
  const root = fixture(t), seen = [];
  await runController({ root, config: config(), queue,
    execute: async ({ provider }) => {
      seen.push(provider); fs.writeFileSync(path.join(root, '.agentes/PARAR'), 'parar');
      return { ...response(provider), stopped: true };
    } });
  assert.deepEqual(seen, ['codex']);
  assert.equal(readJson(path.join(root, '.agentes/estado.json')).status, 'parado');
  assert.equal(fs.existsSync(path.join(root, '.agentes/execucao.lock')), false);
});
test('encerramento incerto mantém trava mesmo quando PID já não está ativo', t => {
  const file = path.join(fixture(t), 'lock.json');
  atomicJson(file, { pid: 2147483647, childPid: null, unsafeTermination: true });
  assert.throws(() => acquireLock(file), /Encerramento anterior não confirmado/);
});
test('falha ao encerrar testes mantém trava e não inicia outro executor', async t => {
  const root = fixture(t); let calls = 0;
  await assert.rejects(runController({ root, config: config(), queue,
    execute: async ({ provider }) => { calls++; return response(provider); },
    gate: async () => ({ code: 1, stdout: '', stderr: '', timedOut: true, treeTerminationFailed: true }) }), /processos de teste não confirmado/);
  assert.equal(calls, 1);
  assert.equal(readJson(path.join(root, '.agentes/execucao.lock')).unsafeTermination, true);
  assert.equal(git(root, ['show', 'main:app.txt']).stdout, 'baseline');
});
test('retomada após merge já feito não chama modelo nem duplica integração', async t => {
  const root = fixture(t);
  const id = ['-c', 'user.name=Teste', '-c', 'user.email=teste@localhost'];
  git(root, ['init', '-b', 'main']); git(root, ['add', '-A']); git(root, [...id, 'commit', '-m', 'baseline']); git(root, ['tag', 'baseline']);
  git(root, ['switch', '-c', 'lote/T00']); fs.writeFileSync(path.join(root, 'app.txt'), 'validado');
  git(root, ['add', '-A']); git(root, [...id, 'commit', '-m', 'implementado']);
  const validated = git(root, ['rev-parse', 'HEAD']).stdout.trim();
  git(root, ['switch', 'main']); git(root, [...id, 'merge', '--no-ff', 'lote/T00', '-m', 'merge anterior ao corte']);
  const originalHead = git(root, ['rev-parse', 'HEAD']).stdout.trim();
  const state = initialState(queue); state.gitReady = true; state.status = 'executando';
  state.queue[0].phase = 'integrate'; state.queue[0].validatedCommit = validated;
  atomicJson(path.join(root, '.agentes/estado.json'), state);
  await runController({ root, config: config(), queue, execute: async () => { throw new Error('não chamar modelo'); } });
  assert.equal(readJson(path.join(root, '.agentes/estado.json')).status, 'concluido');
  assert.equal(git(root, ['rev-parse', 'HEAD']).stdout.trim(), originalHead);
});
