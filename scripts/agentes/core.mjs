import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';

export const SCHEMA = JSON.parse(fs.readFileSync(new URL('./resposta.schema.json', import.meta.url), 'utf8'));
export const iso = () => new Date().toISOString();
export function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(temp, file);
}
export function readJson(file, fallback) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
}
export function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
export function acquireLock(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(file, JSON.stringify({ pid: process.pid, childPid: null, started: iso() }), { flag: 'wx' });
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const owner = readJson(file); // Corrupt lock: stop rather than risk two executors.
    if (owner.unsafeTermination) throw new Error('Encerramento anterior não confirmado. Verifique processos antes de remover a trava manualmente.');
    if (alive(owner.pid) || alive(owner.childPid)) throw new Error('Já existe execução ativa (ou processo filho pendente). Não inicie outra.');
    fs.unlinkSync(file);
    return acquireLock(file);
  }
  return {
    child(pid, unsafeTermination = false) { atomicJson(file, { pid: process.pid, childPid: pid, unsafeTermination, started: iso() }); },
    release() { if (readJson(file, {}).pid === process.pid) fs.unlinkSync(file); },
  };
}

// Claude remains active until its own quota is exhausted. Only a quota response
// changes quota state; explicit tool handoffs do not masquerade as quota.
export class Scheduler {
  constructor(saved = {}) {
    this.provider = saved.provider ?? 'codex';
    this.limited = saved.limited ?? { codex: false, claude: false };
    this.retryAt = saved.retryAt ?? { codex: null, claude: null };
    this.waitUntil = saved.waitUntil ?? null;
  }
  success() { this.limited[this.provider] = false; this.retryAt[this.provider] = null; }
  quota(retryAt, now, retryMs) {
    this.limited[this.provider] = true;
    this.retryAt[this.provider] = retryAt ?? null;
    if (this.provider === 'codex') { this.provider = 'claude'; return 'switch'; }
    this.provider = 'codex';
    if (!this.limited.codex) return 'switch';
    const known = Object.values(this.retryAt).map(Date.parse).filter(t => Number.isFinite(t) && t > now);
    this.waitUntil = new Date(Math.max(now + 60_000, Math.min(now + retryMs, ...known))).toISOString();
    return 'wait';
  }
  newCycle() {
    this.provider = 'codex';
    this.limited = { codex: false, claude: false };
    this.waitUntil = null;
  }
  toJSON() { return { provider: this.provider, limited: this.limited, retryAt: this.retryAt, waitUntil: this.waitUntil }; }
}

function jsonLines(text) {
  return text.split(/\r?\n/).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
}
function validReport(report) {
  return report && ['continue', 'ready', 'blocked'].includes(report.status)
    && (report.block_reason === undefined || ['none', 'tool_unavailable', 'permission_denied', 'other'].includes(report.block_reason))
    && (report.status === 'blocked' || !report.block_reason || report.block_reason === 'none')
    && typeof report.summary === 'string' && typeof report.next_step === 'string'
    && Array.isArray(report.evidence) && report.evidence.every(x => typeof x === 'string');
}
export function classify(provider, execution) {
  if (execution.timedOut) return { kind: 'error', reason: 'Tempo limite da chamada/silêncio excedido. Não presumir cota; verificar processos e logs.' };
  if (execution.stopped) return { kind: 'stopped', reason: 'Parada solicitada.' };
  const events = jsonLines(execution.stdout ?? '');
  const final = provider === 'claude' ? events.findLast(e => e.type === 'result') : null;
  const errors = events.filter(e => ['error', 'turn.failed'].includes(e.type)
    || (e.type === 'assistant' && typeof e.error === 'string'));
  if (final?.is_error || String(final?.subtype ?? '').startsWith('error')) errors.push(final);
  const rateEvents = events.filter(e => e.type === 'rate_limit_event' && e.rate_limit_info?.status === 'rejected');
  errors.push(...rateEvents);
  // Examine provider errors only, never successful assistant/tool transcripts.
  const errorText = errors.map(e => JSON.stringify(e)).join('\n') + '\n' + (execution.stderr ?? '');
  const quota = /usage_limit_reached|insufficient_quota|you(?:'|’)ve hit your (?:usage )?limit|you have hit your (?:usage )?limit|usage limit (?:reached|exceeded)|out of (?:extra )?usage|weekly limit (?:reached|exceeded)|limite de uso (?:atingido|excedido)/i.test(errorText)
    || rateEvents.some(e => /five_hour|seven_day/i.test(JSON.stringify(e.rate_limit_info)))
    || (provider === 'claude' && errors.some(e => e.error === 'rate_limit'))
    || (provider === 'claude' && final?.is_error && /rate_limit/.test(JSON.stringify(final)));
  if (quota) {
    let retryAt = null;
    for (const event of [...errors, ...rateEvents]) {
      const obj = event.rate_limit_info ?? event.error ?? event;
      for (const key of ['resetsAt', 'resets_at', 'reset_at', 'retry_at']) {
        const value = obj?.[key];
        const ms = typeof value === 'number' ? value * (value < 1e12 ? 1000 : 1) : Date.parse(value);
        if (Number.isFinite(ms) && ms > Date.now()) retryAt = new Date(ms).toISOString();
      }
    }
    return { kind: 'quota', retryAt, reason: 'Limite de uso informado pelo provedor.' };
  }
  if (final?.permission_denials?.length) return { kind: 'error', reason: 'Claude informou permissões negadas; corrigir configuração sem repetir a chamada.' };
  if (execution.code !== 0 || errors.length) return { kind: 'error', reason: 'Falha de CLI, autenticação, rede ou configuração; consulte o log local desta chamada.' };
  let report = final?.structured_output;
  if (provider === 'codex') {
    const message = events.findLast(e => e.type === 'item.completed' && e.item?.type === 'agent_message')?.item?.text;
    try { report = JSON.parse(message ?? ''); } catch { /* Invalid final report is an error. */ }
  }
  if (!validReport(report)) return { kind: 'error', reason: 'CLI terminou sem resposta estruturada válida; nada será aprovado automaticamente.' };
  const init = events.find(e => e.type === 'system' && e.subtype === 'init');
  return { kind: 'success', report, sessionId: init?.session_id ?? events.find(e => e.type === 'thread.started')?.thread_id ?? null, actualModel: init?.model ?? 'nao_verificado' };
}

export function findCommand(name, env = process.env, platform = process.platform) {
  if (path.isAbsolute(name)) {
    if (!fs.existsSync(name)) throw new Error(`Executável não encontrado: ${name}`);
    return name;
  }
  const extensions = platform === 'win32' ? ['.exe', '.cmd', '.ps1', ''] : [''];
  for (const dir of (env.PATH ?? env.Path ?? '').split(path.delimiter)) {
    for (const ext of extensions) {
      const candidate = path.join(dir, name.endsWith(ext) && ext ? name : name + ext);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        if (platform === 'win32' && /claude\.(?:cmd|ps1)$/i.test(candidate)) {
          const native = path.join(dir, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
          if (fs.existsSync(native)) return native;
        }
        return candidate;
      }
    }
  }
  throw new Error(`Comando ${name} não encontrado no PATH.`);
}

export function providerCommand(provider, config, root, task, phase) {
  const critical = task.critical || phase === 'review';
  const spec = config[provider];
  const model = provider === 'claude' && phase === 'review' ? spec.reviewModel : spec.model;
  const effort = critical ? spec.criticalEffort : spec.effort;
  if (provider === 'codex') return {
    command: findCommand(spec.command), model, effort,
    args: ['exec', '--json', '--sandbox', 'workspace-write', '-c', 'approval_policy="never"',
      '-c', `model_reasoning_effort="${effort}"`, '--model', model,
      '--output-schema', path.join(root, 'scripts/agentes/resposta.schema.json'), '-'],
  };
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--model', model, '--effort', effort, '--json-schema', JSON.stringify(SCHEMA),
    '--permission-prompts', 'none'];
  if (spec.chrome === true) args.push('--chrome');
  if (spec.permissionMode === 'bypassPermissions') args.push('--dangerously-skip-permissions');
  else args.push('--permission-mode', 'dontAsk');
  // Native mode is NOT a filesystem sandbox. bypassPermissions is an explicit
  // local user choice; it does not change this Codex session's own sandbox.
  if (['native', 'native-restricted'].includes(spec.isolation)) return { command: findCommand(spec.command), args, model, effort };
  throw new Error('Este adaptador suporta isolation=native ou native-restricted. Contêiner exige adaptador próprio validado.');
}

export function runProcess(command, args, options = {}) {
  const { cwd, input = '', logFile, env = process.env, timeoutMs = 120_000, idleMs = timeoutMs,
    shouldStop = () => false, onSpawn = () => {}, onOutput = () => {} } = options;
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawn(command, args, { cwd, env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (e) { reject(e); return; }
    let stdout = '', stderr = '', timedOut = false, stopped = false, terminating = false, treeTerminationFailed = false;
    let lastOutput = Date.now();
    const started = Date.now();
    const stream = logFile ? fs.createWriteStream(logFile, { flags: 'a' }) : null;
    const consume = (kind, data) => {
      lastOutput = Date.now();
      const text = data.toString();
      if (kind === 'stdout') stdout = (stdout + text).slice(-8_000_000);
      else stderr = (stderr + text).slice(-1_000_000);
      stream?.write(text);
      onOutput(kind, text);
    };
    child.stdout.on('data', data => consume('stdout', data));
    child.stderr.on('data', data => consume('stderr', data));
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    // Wait for close, not just exit: streams and the old process must be finished
    // before another provider can edit this workspace.
    const timer = setInterval(() => {
      if (terminating) return;
      stopped = shouldStop();
      timedOut = Date.now() - started > timeoutMs || Date.now() - lastOutput > idleMs;
      if (!stopped && !timedOut) return;
      terminating = true;
      if (process.platform === 'win32') {
        const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        const fallback = () => { treeTerminationFailed = true; child.kill('SIGKILL'); };
        killer.on('error', fallback);
        killer.on('close', code => { if (code !== 0) fallback(); });
      } else child.kill('SIGKILL');
    }, 250);
    child.on('spawn', () => onSpawn(child.pid));
    child.on('error', e => { clearInterval(timer); stream?.end(); reject(e); });
    child.on('close', code => { clearInterval(timer); stream?.end(); resolve({ code, stdout, stderr, timedOut, stopped, treeTerminationFailed }); });
    child.stdin.on('error', () => {}); // Early quota/auth exit may close stdin.
    child.stdin.end(input);
  });
}

export function git(root, args, allowFailure = false) {
  const result = spawnSync(findCommand('git'), args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 60_000 });
  if (result.error) throw result.error;
  if (result.status && !allowFailure) throw new Error(`Git falhou (${args[0]}): ${result.stderr.trim()}`);
  return result;
}
export function fingerprint(root, includeProgress = false) {
  const files = git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).stdout.split('\0').filter(Boolean).sort();
  const hash = crypto.createHash('sha256');
  for (const file of files) {
    if (!includeProgress && file.startsWith('docs/agentes/')) continue;
    const full = path.join(root, file);
    hash.update(file);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) hash.update(fs.readFileSync(full));
    else hash.update('<deleted>');
  }
  return hash.digest('hex');
}
export function protectedFingerprint(root) {
  const hash = crypto.createHash('sha256');
  const walk = rel => {
    const full = path.join(root, rel);
    if (!fs.existsSync(full)) { hash.update(rel + ':missing'); return; }
    if (fs.statSync(full).isDirectory()) {
      for (const file of fs.readdirSync(full).sort()) walk(path.join(rel, file));
    } else hash.update(rel).update(fs.readFileSync(full));
  };
  for (const rel of ['AGENTS.md', 'CLAUDE.md', 'PLANO_AGENTES.md', '.gitignore', '.claude', 'scripts/agentes', 'agentes.cmd', 'docker-compose.test.yml', 'ANALISE_CONFORMIDADE.md']) walk(rel);
  return hash.digest('hex');
}
