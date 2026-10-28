import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import net from 'node:net';
import { atomicJson, readJson, acquireLock, Scheduler, classify, providerCommand,
  findCommand, runProcess, git, fingerprint, protectedFingerprint, iso } from './core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MINUTE = 60_000;
// Recoverable stop: with config.neverStop, the controller switches/waits instead of ending.
class SoftStop extends Error {}
const identity = ['-c', 'user.name=Rede AlimentaMS Automacao', '-c', 'user.email=automacao@localhost'];

export function loadConfig(root) {
  const base = readJson(path.join(root, 'scripts/agentes/config.json'));
  const local = readJson(path.join(root, '.agentes/config.local.json'), {});
  const config = { ...base, ...local, codex: { ...base.codex, ...local.codex }, claude: { ...base.claude, ...local.claude } };
  for (const name of ['retryMinutes', 'heartbeatMinutes', 'idleTimeoutMinutes', 'callTimeoutMinutes', 'testTimeoutMinutes', 'maxNoProgress', 'maxFixRounds']) {
    if (!Number.isFinite(config[name]) || config[name] <= 0) throw new Error(`Configuração inválida: ${name}`);
  }
  return config;
}

export function testEnvironment(config, env = process.env) {
  const connection = env.TEST_DATABASE_URL || config.testDatabaseUrl;
  const url = new URL(connection);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !/^alimentams_test(?:_[a-z0-9_]+)?$/.test(decodeURIComponent(url.pathname.slice(1)))) {
    throw new Error('TEST_DATABASE_URL deve apontar para banco exclusivo alimentams_test (ou alimentams_test_<sufixo>).');
  }
  return { ...env, TEST_DATABASE_URL: connection, DATABASE_URL: connection };
}

function paths(root) {
  const runtime = path.join(root, '.agentes');
  return { runtime, state: path.join(runtime, 'estado.json'), lock: path.join(runtime, 'execucao.lock'),
    stop: path.join(runtime, 'PARAR'), logs: path.join(runtime, 'execucoes'), events: path.join(runtime, 'eventos.jsonl') };
}
export function initialState(queue) {
  return { version: 1, status: 'parado', createdAt: iso(), updatedAt: iso(), scheduler: new Scheduler().toJSON(),
    current: 0, history: [], queue: queue.map(task => ({ ...task, status: 'pendente', phase: task.id === 'FINAL' ? 'review' : 'implement', fixRounds: 0, noProgress: 0, feedback: '', branch: `lote/${task.id}`, tests: null })) };
}
function logEvent(p, event, message, details = {}) {
  const record = { at: iso(), event, message, ...details };
  fs.appendFileSync(p.events, JSON.stringify(record) + '\n');
  console.log(`[${new Date().toLocaleString('pt-BR')}] ${message}`);
}
function save(p, state, scheduler) {
  state.scheduler = scheduler.toJSON(); state.updatedAt = iso(); atomicJson(p.state, state);
}
function checkpoint(root, message) {
  const branch = git(root, ['branch', '--show-current']).stdout.trim();
  if (branch === 'main') throw new Error('Tentativa de salvar lote diretamente na main.');
  git(root, ['add', '-A']);
  const staged = git(root, ['diff', '--cached', '--name-only']).stdout;
  if (staged.split(/\r?\n/).some(name => /(^|\/)(\.env(?:\.(?!example$).*)?|id_rsa|id_ed25519|credentials)$|\.(?:pem|pfx|key)$/i.test(name))) {
    throw new Error('Arquivo potencialmente sensível no staging. Revise manualmente antes de continuar.');
  }
  if (staged.trim()) git(root, [...identity, 'commit', '-m', message]);
  return git(root, ['rev-parse', 'HEAD']).stdout.trim();
}
function setupGit(root, state) {
  if (!fs.existsSync(path.join(root, '.git'))) {
    git(root, ['init', '-b', 'main']);
    git(root, ['add', '-A']);
    git(root, [...identity, 'commit', '-m', 'baseline: projeto e controlador antes dos lotes']);
    git(root, ['tag', 'baseline']);
  } else if (!state.gitReady) {
    if (git(root, ['status', '--porcelain']).stdout.trim()) throw new Error('Git existente tem alterações sem commit. Preserve e registre seu trabalho antes da primeira execução.');
    if (git(root, ['branch', '--show-current']).stdout.trim() !== 'main') throw new Error('Primeira execução exige branch main.');
    if (git(root, ['rev-parse', '--verify', 'baseline'], true).status) git(root, ['tag', 'baseline']);
  }
  state.gitReady = true;
}
function prepareTask(root, task) {
  const current = git(root, ['branch', '--show-current']).stdout.trim();
  if (current === task.branch) return;
  if (git(root, ['status', '--porcelain']).stdout.trim()) throw new Error('Há alterações fora da branch esperada. Não vou descartá-las ou trocar de branch.');
  if (current !== 'main') throw new Error(`Branch inesperada: ${current}. Esperava main ou ${task.branch}.`);
  const exists = git(root, ['show-ref', '--verify', `refs/heads/${task.branch}`], true).status === 0;
  git(root, exists ? ['switch', task.branch] : ['switch', '-c', task.branch]);
}

function integrate(root, task, state, p, scheduler) {
  if (git(root, ['status', '--porcelain']).stdout.trim()) throw new Error('Há mudanças depois da validação; não integrar sem novos testes.');
  if (git(root, ['rev-parse', task.branch]).stdout.trim() !== task.validatedCommit) throw new Error('Branch mudou depois da validação; revise antes de integrar.');
  git(root, ['switch', 'main']);
  const alreadyMerged = git(root, ['merge-base', '--is-ancestor', task.validatedCommit, 'main'], true).status === 0;
  if (!alreadyMerged) {
    if (git(root, ['merge-base', '--is-ancestor', 'main', task.branch], true).status) throw new Error('Main divergiu do lote validado; integração exige revisão manual.');
    git(root, [...identity, 'merge', '--no-ff', task.branch, '-m', `${task.id}: integrar lote validado`]);
  }
  task.status = 'ok'; task.finishedAt = iso(); task.integratedCommit = git(root, ['rev-parse', 'HEAD']).stdout.trim();
  state.current++;
  scheduler.codexOff = false; // A Codex failure only sidelines it for the lot where it happened.
  save(p, state, scheduler);
  logEvent(p, 'complete', `${task.id} validado e integrado. Próximo lote mantém ${scheduler.provider} até o limite.`);
}

export function makePrompt(task, provider) {
  const review = task.phase === 'review';
  return `Você está no projeto Rede AlimentaMS. Leia AGENTS.md, PLANO_AGENTES.md seção ${task.section},
o checklist docs/agentes/progresso/${task.id}.md e docs/agentes/LOG.md quando existirem.
Ferramenta atual: ${provider}. Lote: ${task.id}. Escopo autorizado: ${task.scope}
Fase: ${task.phase}. Branch já preparada: ${task.branch}.
${review ? `Faça revisão independente do diff main..HEAD (baseline..HEAD no FINAL), contexto e evidências.
Não edite código, testes ou outros arquivos: escreva somente docs/agentes/REVISAO_${task.id}.md.
ready significa aprovado sem impedimentos críticos/altos; continue significa há correções necessárias,
que devem constar com arquivo:linha e evidência em summary/next_step e no relatório. Não aprove só por testes verdes.`
    : `Implemente apenas este lote em passos coerentes. Salve checklist e próximo passo durante o trabalho.
O controlador executa os testes novamente e chama revisão separada quando exigida.
Não faça commits, troca de branch, merge, git add, não altere .git: o controlador cuida disso.
ready significa que todo o escopo desta etapa e seus critérios de aceite estão satisfeitos.
continue significa progresso parcial salvo; blocked significa impedimento que não se resolve sem intervenção.
O L00 deve aproveitar AGENTS.md/CLAUDE.md existentes, sem reescrever regras ou controlador.
Banco ausente, permissão negada ou dependência obrigatória faltante: informe blocked com diagnóstico.`}
Informe block_reason: none sem bloqueio; tool_unavailable somente quando a ferramenta necessária
não existe/não está conectada nesta CLI, com evidência concreta; permission_denied para qualquer
negativa de acesso/permissão; other para banco, autenticação ou demais impedimentos.
Não reclassifique uma negativa já registrada como indisponibilidade. No Claude, se precisar de
navegador, use a extensão Claude in Chrome (ferramentas mcp__claude-in-chrome__*); não presuma que está conectada.
Para abrir o app local: rode somente \`node backend/src/server.js\` em segundo plano (run_in_background),
sem combinar com curl, wget, sleep, & ou redirecionamentos (curl é proibido pelas regras do projeto).
O ambiente já aponta DATABASE_URL para o banco descartável de testes; a porta padrão é 3000.
Confira pelo navegador (http://localhost:3000) e encerre o servidor ao terminar.
Se um comando for negado, tente uma alternativa permitida antes de informar blocked.
Conferência visual: tente pelo navegador. Se, depois de tentar, ela for impossível nesta CLI, NÃO bloqueie
o lote só por isso: registre no checklist "Conferência visual humana PENDENTE" com o roteiro exato e o
diagnóstico, e siga (ready se todo o restante do escopo e dos testes estiver cumprido). Nunca declare a
conferência visual como feita sem tê-la feito.
Retome o roteiro pendente e preserve as evidências válidas. Nunca contorne uma negativa de permissão.
Não crie subagentes nem abra outros executores. Não altere controlador, fila, configurações, instruções,
plano, documentos originais ou .agentes/. Não acesse VPS, não publique nem envie mensagens.
Último retorno/feedback: ${task.feedback || 'nenhum; confira os arquivos e o Git.'}
Responda no schema fornecido: status (continue/ready/blocked), summary, next_step, evidence (lista) e block_reason.
Não declare testes, prints, deploy ou revisão humana que não ocorreram.`;
}

async function runTests(root, config, p, controls) {
  const packageFile = path.join(root, 'backend/package.json');
  if (!readJson(packageFile, {}).scripts?.test) return { code: 1, stdout: '', stderr: 'backend/package.json ainda não define npm test.' };
  const npmCli = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  let command, args;
  if (fs.existsSync(npmCli)) { command = process.execPath; args = [npmCli, 'test']; }
  else if (process.platform !== 'win32') { command = findCommand('npm'); args = ['test']; }
  else throw new Error('npm-cli.js não localizado junto ao Node. Verifique sua instalação Node/npm.');
  return runProcess(command, args, { cwd: path.join(root, 'backend'), logFile: path.join(p.logs, `${Date.now()}-testes.log`),
    env: testEnvironment(config),
    timeoutMs: config.testTimeoutMinutes * MINUTE, idleMs: config.testTimeoutMinutes * MINUTE, ...controls });
}

export async function runController({ root = ROOT, config = loadConfig(root), queue,
  execute, gate = runTests, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now, resume = false,
  requestedProvider } = {}) {
  if (requestedProvider !== undefined && (!resume || requestedProvider !== 'claude')) {
    throw new Error('Seleção explícita suportada apenas em retomar --claude.');
  }
  const p = paths(root); fs.mkdirSync(p.logs, { recursive: true });
  const lock = acquireLock(p.lock);
  let interrupted = false;
  const onSignal = () => { interrupted = true; };
  process.on('SIGINT', onSignal); process.on('SIGTERM', onSignal);
  const shouldStop = () => interrupted || fs.existsSync(p.stop);
  let state, scheduler;
  try {
    if (fs.existsSync(p.stop)) fs.unlinkSync(p.stop);
    state = readJson(p.state) ?? initialState(queue ?? readJson(path.join(root, 'scripts/agentes/fila.json')));
    scheduler = new Scheduler(state.scheduler);
    if (state.status === 'concluido') { console.log('Plano já concluído. Veja .agentes/estado.json e os relatórios.'); return; }
    if (state.status === 'bloqueado' && !resume) throw new Error('Execução bloqueada: corrija o motivo e use agentes.cmd retomar.');
    setupGit(root, state);
    if (requestedProvider) {
      scheduler.provider = requestedProvider;
      scheduler.waitUntil = null;
      const task = state.queue[state.current];
      if (task) task.feedback = `${task.feedback || ''}\nO usuário solicitou explicitamente retomar pelo Claude. Verifique a conexão própria autorizada com a extensão do navegador e execute o roteiro pendente. A negativa anterior do Codex permanece registrada; não altere permissões nem contorne negativas. Se sua conexão também for negada ou indisponível, informe blocked com o diagnóstico.`;
      logEvent(p, 'provider-request', 'Retomada pelo Claude solicitada explicitamente pelo usuário; verificar acesso próprio autorizado.');
    }
    state.status = 'executando'; save(p, state, scheduler);
    logEvent(p, 'start', `Controlador iniciado. Preferência atual: ${scheduler.provider}.`);
    let nextHeartbeat = Date.now() + config.heartbeatMinutes * MINUTE;
    while (state.current < state.queue.length && !shouldStop()) {
      const task = state.queue[state.current];
      try {
      if (task.phase === 'integrate') { integrate(root, task, state, p, scheduler); continue; }
      if (scheduler.waitUntil) {
        state.status = 'aguardando_cota'; save(p, state, scheduler);
        logEvent(p, 'wait', `Aguardando. Próxima tentativa: ${new Date(scheduler.waitUntil).toLocaleString('pt-BR')}; ${scheduler.codexOff ? 'Claude (Codex desativado nesta execução)' : 'Codex primeiro'}.`, { until: scheduler.waitUntil });
        process.stdout.write('\x07');
        while (now() < Date.parse(scheduler.waitUntil) && !shouldStop()) await sleep(Math.min(1000, Date.parse(scheduler.waitUntil) - now()));
        if (shouldStop()) break;
        scheduler.newCycle(); state.status = 'executando'; save(p, state, scheduler);
      }
      prepareTask(root, task);
      task.startedAt ??= iso(); task.status = task.phase === 'review' ? 'aguardando_revisao' : 'em_andamento';
      const before = fingerprint(root, true);
      const codeBefore = fingerprint(root);
      const protectedBefore = protectedFingerprint(root);
      const provider = scheduler.provider;
      const invocation = { startedAt: iso(), provider, task: task.id, phase: task.phase };
      state.history.push(invocation); save(p, state, scheduler);
      logEvent(p, 'call', `${provider.toUpperCase()} — ${task.id} — ${task.phase}.`);
      const logFile = path.join(p.logs, `${Date.now()}-${provider}-${task.id}.jsonl`);
      const controls = { shouldStop, onSpawn: pid => { lock.child(pid); invocation.pid = pid; save(p, state, scheduler); } };
      let result;
      if (execute) result = await execute({ provider, task, prompt: makePrompt(task, provider), logFile, controls, env: testEnvironment(config) });
      else {
        const spec = providerCommand(provider, config, root, task, task.phase);
        Object.assign(invocation, { requestedModel: spec.model, effort: spec.effort }); save(p, state, scheduler);
        result = await runProcess(spec.command, spec.args, { cwd: root, input: makePrompt(task, provider), logFile,
          env: testEnvironment(config),
          timeoutMs: config.callTimeoutMinutes * MINUTE, idleMs: config.idleTimeoutMinutes * MINUTE, ...controls,
          onOutput() {
            if (Date.now() > nextHeartbeat) {
              logEvent(p, 'heartbeat', `Aviso periódico: ${provider} continua em ${task.id}.`);
              process.stdout.write('\x07'); nextHeartbeat = Date.now() + config.heartbeatMinutes * MINUTE;
            }
          } });
      }
      if (result.treeTerminationFailed) {
        lock.child(invocation.pid, true);
        throw new Error('Não foi possível confirmar encerramento da árvore de processos. Verifique processos e .agentes/execucao.lock antes de retomar.');
      }
      lock.child(null);
      invocation.endedAt = iso(); invocation.exitCode = result.code;
      if (protectedFingerprint(root) !== protectedBefore) throw new Error('Um arquivo protegido foi alterado. Revise o diff antes de retomar.');
      if (git(root, ['branch', '--show-current']).stdout.trim() !== task.branch) throw new Error('O executor trocou a branch; confira o Git antes de continuar.');
      if (task.phase === 'review' && fingerprint(root) !== codeBefore) throw new Error('Revisor alterou código/arquivos fora do relatório; revisão interrompida.');
      const outcome = classify(provider, result); invocation.outcome = outcome.kind;
      if (outcome.kind === 'stopped' || shouldStop()) break;
      task.lastCommit = checkpoint(root, `${task.id} wip: ${provider} ${task.phase}`);
      if (outcome.kind === 'quota') {
        scheduler.quota(outcome.retryAt, now(), config.retryMinutes * MINUTE);
        task.status = 'aguardando_cota';
        logEvent(p, 'quota', `${provider} atingiu limite; progresso salvo.`, { retryAt: outcome.retryAt });
        save(p, state, scheduler); continue;
      }
      if (outcome.kind !== 'success') throw new SoftStop(outcome.reason);
      if (outcome.permissionDenials) logEvent(p, 'permission-denials', `${task.id}: ${outcome.permissionDenials} comando(s) negado(s); o executor seguiu com alternativa.`);
      scheduler.success();
      Object.assign(invocation, { actualModel: outcome.actualModel, sessionId: outcome.sessionId, report: outcome.report });
      const report = outcome.report;
      task.feedback = `${report.summary}\nPróximo passo: ${report.next_step}`;
      logEvent(p, 'response', `${task.id}: ${report.summary}`, { status: report.status });
      if (report.status === 'blocked') {
        // Codex has no approved browser here; Claude has its own (Chrome extension). Hand off
        // once per lot so Claude can try with its own access. Claude's own denial still blocks.
        if (provider === 'codex' && ['tool_unavailable', 'permission_denied'].includes(report.block_reason)
          && report.evidence.length && !task.toolHandoff && !scheduler.limited.claude) {
          task.toolHandoff = { from: provider, to: 'claude', at: iso(), reason: report.summary,
            blockReason: report.block_reason, evidence: report.evidence };
          scheduler.provider = 'claude';
          task.feedback += '\nTransferência única do Codex para o Claude (ferramenta indisponível ou acesso negado no Codex). Use seu próprio acesso autorizado, retome o roteiro pendente e registre evidências; se não conseguir, informe blocked. A negativa do Codex continua registrada; não contorne negativas.';
          logEvent(p, 'tool-handoff', `${task.id}: Codex sem acesso à ferramenta; Claude tentará a etapa pendente uma vez.`);
          save(p, state, scheduler); continue;
        }
        throw new SoftStop(task.feedback);
      }
      if (report.status === 'continue' && fingerprint(root, true) === before) task.noProgress++;
      else task.noProgress = 0;
      if (task.noProgress >= config.maxNoProgress) throw new SoftStop('Chamadas repetidas sem alterações verificáveis; interrompendo para evitar consumo indefinido.');
      if (task.phase === 'review' && report.status === 'continue') {
        task.fixRounds++;
        if (task.fixRounds > config.maxFixRounds) throw new SoftStop('Limite de rodadas de correção atingido; confira revisão e feedback.');
        task.phase = 'implement';
      } else if (report.status === 'ready') {
        const testResult = await gate(root, config, p, controls);
        if (testResult.treeTerminationFailed) {
          lock.child(readJson(p.lock, {}).childPid, true);
          throw new Error('Encerramento dos processos de teste não confirmado; confira a árvore antes de retomar.');
        }
        lock.child(null);
        if (shouldStop() || testResult.stopped) break;
        task.tests = { at: iso(), passed: testResult.code === 0 && !testResult.timedOut, output: `${testResult.stdout}\n${testResult.stderr}`.slice(-12_000) };
        if (!task.tests.passed) {
          task.fixRounds++;
          task.feedback = `O controlador executou npm test e falhou:\n${task.tests.output}`;
          task.phase = 'implement';
          if (task.fixRounds > config.maxFixRounds) throw new SoftStop(`Testes continuam falhando após rodadas de correção:\n${task.tests.output}`);
          logEvent(p, 'test-failure', `Testes de ${task.id} falharam; executor receberá a saída.`);
        } else if (task.phase === 'implement' && task.critical) {
          task.phase = 'review'; task.feedback = 'Implementação pronta e npm test passou. Verifique requisitos, diff e qualidade dos testes.';
        } else {
          task.validatedCommit = checkpoint(root, `${task.id}: concluído e validado`);
          task.phase = 'integrate';
          save(p, state, scheduler); // Crash after merge can resume without another model call.
          integrate(root, task, state, p, scheduler);
        }
      }
      save(p, state, scheduler);
      } catch (error) {
        // Never-stop mode: blocks, CLI errors and exhausted retry rounds do not end the night.
        // Codex is switched off and Claude carries on; Claude itself retries after retryMinutes.
        // Safety errors (protected files, branch change, reviewer editing code, stuck processes) still stop.
        if (!(error instanceof SoftStop) || !config.neverStop) throw error;
        const failed = scheduler.provider;
        task.noProgress = 0; task.fixRounds = 0;
        task.softFailures = (task.softFailures ?? 0) + 1;
        task.feedback = `${error.message}\nModo sem parada: resolva o impedimento com alternativas permitidas; se algo depender de pessoa (ex.: conferência visual), registre como pendência humana com roteiro e prossiga. Não declare nada que não ocorreu.`;
        if (failed === 'codex' && !scheduler.codexOff) {
          scheduler.codexOff = true; scheduler.provider = 'claude';
          logEvent(p, 'codex-off', `${task.id}: Codex parou (${error.message.split('\n')[0]}). Seguindo só com o Claude.`);
        } else if (failed === 'codex' && scheduler.limited.claude) {
          // Codex covered for a rate-limited Claude and failed: wait for Claude's reset.
          scheduler.provider = 'claude';
          const reset = Date.parse(scheduler.retryAt.claude);
          scheduler.waitUntil = new Date(Number.isFinite(reset) && reset > now() ? reset : now() + config.retryMinutes * MINUTE).toISOString();
          logEvent(p, 'soft-retry', `${task.id}: Codex não conseguiu cobrir o Claude limitado. Aguardando renovação do Claude.`);
        } else {
          scheduler.provider = 'claude';
          scheduler.waitUntil = new Date(now() + config.retryMinutes * MINUTE).toISOString();
          logEvent(p, 'soft-retry', `${task.id}: Claude parou (${error.message.split('\n')[0]}). Nova tentativa em ${config.retryMinutes} min.`);
        }
        save(p, state, scheduler);
      }
    }
    state.status = state.current === state.queue.length ? 'concluido' : 'parado';
    save(p, state, scheduler);
    logEvent(p, 'stop', state.status === 'concluido' ? 'Fila concluída. Verificações humanas continuam registradas nos relatórios.' : 'Parada concluída. Progresso preservado.');
  } catch (error) {
    if (state && scheduler) { state.status = 'bloqueado'; state.reason = error.message; save(p, state, scheduler); }
    logEvent(p, 'blocked', `Interrompido: ${error.message}`); throw error;
  } finally {
    process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal);
    // Never remove a lock that still points to a running child.
    const owner = readJson(p.lock, {});
    if (!owner.childPid && !owner.unsafeTermination) lock.release();
  }
}

async function doctor(root, config) {
  let failures = 0;
  for (const provider of ['codex', 'claude']) {
    try {
      const spec = providerCommand(provider, config, root, { critical: false }, 'implement');
      const result = await runProcess(spec.command, ['--version'], { cwd: root, timeoutMs: 15_000 });
      if (result.code !== 0) throw new Error('CLI/imagem indisponível neste ambiente.');
      console.log(`OK ${provider}: ${spec.command}; modelo=${spec.model}; esforço=${spec.effort}`);
      if (provider === 'codex') {
        const auth = await runProcess(spec.command, ['login', 'status'], { cwd: root, timeoutMs: 15_000 });
        if (auth.code !== 0) throw new Error('Login/configuração do Codex indisponível. Abra codex no seu terminal para autenticar/verificar.');
        console.log('OK autenticação/configuração Codex.');
      } else if (config.claude.isolation !== 'docker') {
        const auth = await runProcess(spec.command, ['auth', 'status'], { cwd: root, timeoutMs: 15_000 });
        if (auth.code !== 0) throw new Error('Login do Claude indisponível. Abra claude no seu terminal para autenticar.');
        console.log('OK autenticação Claude.');
      }
    } catch (e) { failures++; console.log(`PENDENTE ${provider}: ${e.message}`); }
  }
  try { console.log(`OK Git: ${git(root, ['--version']).stdout.trim()}`); } catch (e) { failures++; console.log(e.message); }
  const databaseUrl = new URL(testEnvironment(config).TEST_DATABASE_URL);
  const databaseAddress = `${databaseUrl.hostname}:${databaseUrl.port || 5432}`;
  const databaseOpen = await new Promise(resolve => {
    const socket = net.createConnection({ host: databaseUrl.hostname, port: Number(databaseUrl.port || 5432) });
    const finish = ok => { socket.destroy(); resolve(ok); };
    socket.setTimeout(2000);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
  if (databaseOpen) console.log(`OK conexão TCP ${databaseAddress}; PostgreSQL/PostGIS será validado pelos testes do L00.`);
  else { failures++; console.log(`PENDENTE banco: ${databaseAddress} não acessível; confira PostgreSQL/PostGIS antes de deixar rodando.`); }
  console.log(`Node ${process.version}. Claude: ${config.claude.isolation}, permissão=${config.claude.permissionMode}.`);
  console.log('Diagnóstico não envia prompts, não consome chamadas de modelo e não confirma disponibilidade de cota.');
  return failures;
}

async function main() {
  const command = process.argv[2] ?? 'iniciar';
  const p = paths(ROOT);
  const config = loadConfig(ROOT);
  if (command === 'status') {
    const state = readJson(p.state, null);
    if (!state) { console.log('Ainda não iniciado. Use agentes.cmd diagnostico e agentes.cmd iniciar.'); return; }
    console.log(JSON.stringify({ status: state.status, lote: state.queue[state.current]?.id ?? 'fila concluída',
      ferramenta: state.scheduler.provider, proximaTentativa: state.scheduler.waitUntil, atualizado: state.updatedAt,
      motivo: state.reason ?? null, progresso: `${state.current}/${state.queue.length}`, processo: readJson(p.lock, null) }, null, 2));
    return;
  }
  if (command === 'parar') { fs.mkdirSync(p.runtime, { recursive: true }); fs.writeFileSync(p.stop, iso()); console.log('Parada solicitada. O controlador encerrará o processo filho antes de liberar a pasta.'); return; }
  if (command === 'diagnostico') { process.exitCode = (await doctor(ROOT, config)) ? 1 : 0; return; }
  if (command === 'banco') {
    console.log('Subindo banco de testes na porta 5433. Docker Desktop precisa estar aberto.');
    const result = spawnSync(findCommand('docker'), ['compose', '-f', path.join(ROOT, 'docker-compose.test.yml'),
      'up', '-d', '--wait', '--wait-timeout', '120'], { cwd: ROOT, stdio: 'inherit', windowsHide: true });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
    if (!process.exitCode) console.log('Banco disponível. Rode agentes.cmd diagnostico para conferir as CLIs e a porta.');
    return;
  }
  if (command === 'testar') {
    const result = spawnSync(process.execPath, ['--test', path.join(ROOT, 'scripts/agentes/core.test.mjs')], { stdio: 'inherit', windowsHide: true });
    process.exitCode = result.status ?? 1; return;
  }
  if (!['iniciar', 'retomar'].includes(command)) throw new Error('Comandos: banco, iniciar, retomar, status, parar, diagnostico, testar.');
  const options = process.argv.slice(3);
  if (options.some(option => option !== '--claude') || (options.length && command !== 'retomar')) {
    throw new Error('Opção suportada: agentes.cmd retomar --claude.');
  }
  await runController({ resume: command === 'retomar', requestedProvider: options.includes('--claude') ? 'claude' : undefined });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
