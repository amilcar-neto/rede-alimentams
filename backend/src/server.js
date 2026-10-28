// Rede AlimentaMS - Backend (Node.js + Express + PostgreSQL/PostGIS)
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const validar = require('./validacao');
const comprovantes = require('./comprovante');
const { criarTempoReal, COLUNAS: COLUNAS_NOTIFICACAO } = require('./tempo-real');

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET?.trim()) {
  throw new Error('JWT_SECRET é obrigatório em produção.');
}

const app = express();
// Atrás do Caddy (um único proxy): req.ip e req.protocol vêm de X-Forwarded-*.
app.set('trust proxy', 1);
// Sem CSP de script: o front usa handlers inline.
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
  });
  next();
});
// O corpo de POST /lotes pode levar a foto em base64 (400 KB viram ~547 mil caracteres) e o de
// PUT /perfil/comprovante o comprovante da entidade (1 MB vira ~1,4 milhão); as demais rotas mantêm
// o limite padrão pequeno. O envio do comprovante só é lido depois de autenticado.
const jsonPadrao = express.json();
const jsonLote = express.json({ limit: '700kb' });
const jsonComprovante = express.json({ limit: '1500kb' });
// O Express trata /lotes e /lotes/ como a mesma rota; o limite maior vale para as duas formas.
const ehPublicarLote = (req) => req.method === 'POST' && (req.path === '/lotes' || req.path === '/lotes/');
app.use((req, res, next) => {
  // Corpos grandes só são lidos depois de autenticados: requisição anônima recebe 401 sem leitura.
  if (ehPublicarLote(req)) return autenticar(req, res, () => jsonLote(req, res, next));
  if (req.method === 'PUT' && req.path === '/perfil/comprovante')
    return autenticar(req, res, () => jsonComprovante(req, res, next));
  return jsonPadrao(req, res, next);
});
app.use(express.static(path.join(__dirname, '..', 'public')));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on('error', (erro) => console.error('Erro inesperado em conexão ociosa do banco.', erro));
const SEGREDO = process.env.JWT_SECRET || 'segredo-de-desenvolvimento';
const tempoReal = criarTempoReal({ segredo: SEGREDO, log: (...args) => console.error(...args) });

// Saúde (pública, dados mínimos): usada pelo healthcheck do Docker e pelo grupo no VPS.
app.get('/saude', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, banco: true });
  } catch (e) {
    console.error('Falha na verificação de saúde do banco.', e);
    res.status(503).json({ ok: false, banco: false });
  }
});
const RAIO_METROS = 10000; // Fluxo 3: entidades num raio de até 10 km
const FUSO = "'America/Campo_Grande'";
const HOJE = `(now() AT TIME ZONE ${FUSO})::date`;
const JANELA_MAX_MINUTOS = 120;
const INICIO_FOLGA_MINUTOS = 5; // o formulário pode ficar aberto alguns minutos antes de enviar
const TOLERANCIA_MINUTOS = (() => {
  const n = Number(process.env.TOLERANCIA_MINUTOS);
  return Number.isInteger(n) && n >= 0 && n <= 1440 ? n : 30;
})();
// Horário local de Campo Grande, no mesmo formato aceito na entrada (AAAA-MM-DDTHH:MM).
const LOCAL = (coluna) => `to_char(${coluna} AT TIME ZONE ${FUSO}, 'YYYY-MM-DD"T"HH24:MI')`;

// Bairros disponíveis no cadastro (coordenadas aproximadas, [lng, lat])
const BAIRROS = {
  'Centro': [-54.6201, -20.4697],
  'Monte Castelo': [-54.5953, -20.4553],
  'Amambai': [-54.607, -20.483],
  'Jardim dos Estados': [-54.587, -20.454],
  'Tiradentes': [-54.57, -20.47],
  'Coronel Antonino': [-54.575, -20.439],
  'Vila Carvalho': [-54.6, -20.5],
};

// Confirmação de retirada: 5 códigos errados seguidos bloqueiam novas tentativas no lote por 15 min.
const MAX_TENTATIVAS_CODIGO = 5;
const BLOQUEIO_CODIGO_MINUTOS = 15;

// Login: até 10 erros por conta e 50 por IP a cada 15 min; depois, 429 até a janela acabar.
// Contagem em memória (um único processo); reiniciar o servidor zera os contadores.
const JANELA_LOGIN_MS = 15 * 60000;
const LIMITE_LOGIN = { conta: 10, ip: 50 };
const falhasLogin = new Map(); // chave → { n, desde }
function loginBloqueado(chaves) {
  const agora = Date.now();
  return chaves.some(([chave, maximo]) => {
    const f = falhasLogin.get(chave);
    return f && agora - f.desde < JANELA_LOGIN_MS && f.n >= maximo;
  });
}
function registrarFalhaLogin(chaves) {
  const agora = Date.now();
  // Limpeza preguiçosa (sem timer): descarta janelas vencidas quando o mapa cresce.
  if (falhasLogin.size > 1000)
    for (const [chave, f] of falhasLogin) if (agora - f.desde >= JANELA_LOGIN_MS) falhasLogin.delete(chave);
  for (const [chave] of chaves) {
    const f = falhasLogin.get(chave);
    if (!f || agora - f.desde >= JANELA_LOGIN_MS) falhasLogin.set(chave, { n: 1, desde: agora });
    else f.n += 1;
  }
}

// Fatores de conversão do painel: parâmetros internos de simulação, sem metodologia validada (a tela avisa).
const FATORES = { refeicoes: 2, co2: 2.5, agua: 350 };
// Metas do painel: TMR (tempo médio de reserva) abaixo de 90 min; TEC (taxa de entrega concluída) acima de 92%.
const METAS = { tmr_minutos: 90, tec_percentual: 92 };
// Versão do Termo de Responsabilidade e da Política de Privacidade (backend/public/termos.html) aceita no cadastro.
const TERMOS_VERSAO = '2026-10-v2'; // v2: Lei 15.224/2025 (v1 guardada em public/termos-2026-10-v1.html)

const rota = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    if (e instanceof validar.ErroValidacao) return res.status(400).json({ erro: e.message });
    console.error(e);
    res.status(500).json({ erro: 'Erro interno do servidor.' });
  });

// ---------- Autenticação e perfis (JWT + RBAC) ----------
function autenticar(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ erro: 'Faça login para continuar.' });
  try {
    req.usuario = jwt.verify(token, SEGREDO);
    next();
  } catch {
    res.status(401).json({ erro: 'Sessão expirada. Entre novamente.' });
  }
}

const exigirPerfil = (perfil) => (req, res, next) =>
  req.usuario.perfil === perfil
    ? next()
    : res.status(403).json({ erro: `Ação permitida apenas para o perfil ${perfil}.` });

const gerarToken = (u) =>
  jwt.sign({ id: u.id, nome: u.nome, perfil: u.perfil }, SEGREDO, { expiresIn: '8h' });

app.get('/bairros', (req, res) => res.json(Object.keys(BAIRROS)));

app.post('/auth/register', rota(async (req, res) => {
  const b = validar.corpo(req.body, ['nome', 'email', 'senha', 'perfil', 'cnpj', 'endereco', 'responsavel', 'telefone',
    'bairro', 'aceite_termos']);
  const nome = validar.texto(b.nome, 'Nome', 200);
  const email = validar.email(b.email);
  const senha = validar.senha(b.senha);
  const perfil = validar.opcao(b.perfil, 'Perfil', ['doador', 'receptora']);
  const cnpj = validar.cnpj(b.cnpj);
  const endereco = validar.texto(b.endereco, 'Endereço', 250);
  const responsavel = validar.texto(b.responsavel, 'Responsável', 200);
  const telefone = validar.telefone(b.telefone);
  const bairro = validar.opcao(b.bairro, 'Bairro', Object.keys(BAIRROS));
  validar.aceite(b.aceite_termos);
  const coord = BAIRROS[bairro];

  const hash = await bcrypt.hash(senha, 10);
  try {
    const r = await pool.query(
      `INSERT INTO usuarios (nome, email, senha_hash, perfil, cnpj, bairro, localizacao,
                             endereco, responsavel, telefone, aceite_termos_em, termos_versao)
       VALUES ($1,$2,$3,$4,$5,$6, ST_SetSRID(ST_MakePoint($7,$8),4326)::geography, $9,$10,$11, now(), $12)
       RETURNING id, nome, perfil`,
      [nome, email, hash, perfil, cnpj, bairro, coord[0], coord[1], endereco, responsavel, telefone, TERMOS_VERSAO]
    );
    res.status(201).json({ token: gerarToken(r.rows[0]), usuario: r.rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ erro: 'Este e-mail já está cadastrado.' });
    throw e;
  }
}));

app.post('/auth/login', rota(async (req, res) => {
  const b = validar.corpo(req.body, ['email', 'senha']);
  if (b.email === undefined || b.senha === undefined)
    return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
  const email = validar.email(b.email);
  const senha = validar.senha(b.senha, 1);
  const chaves = [[`conta:${req.ip}:${email}`, LIMITE_LOGIN.conta], [`ip:${req.ip}`, LIMITE_LOGIN.ip]];
  if (loginBloqueado(chaves))
    return res.status(429).set('Retry-After', String(JANELA_LOGIN_MS / 1000))
      .json({ erro: 'Muitas tentativas de login sem sucesso. Aguarde 15 minutos e tente novamente.' });
  const r = await pool.query('SELECT id, nome, perfil, senha_hash FROM usuarios WHERE email = $1', [email]);
  const u = r.rows[0];
  if (!u || !(await bcrypt.compare(senha, u.senha_hash))) {
    registrarFalhaLogin(chaves);
    return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
  }
  falhasLogin.delete(chaves[0][0]);
  res.json({ token: gerarToken(u), usuario: { id: u.id, nome: u.nome, perfil: u.perfil } });
}));

// ---------- Perfil e comprovante de entidade (L06) ----------
// Dados do próprio usuário; nada de outros cadastros.
app.get('/perfil', autenticar, rota(async (req, res) => {
  const r = await pool.query(
    `SELECT u.id, u.nome, u.email, u.perfil, u.cnpj, u.endereco, u.responsavel, u.telefone, u.bairro, u.situacao,
            u.aceite_termos_em, u.termos_versao, c.tipo AS comprovante_tipo, c.enviado_em AS comprovante_enviado_em,
            (c.usuario_id IS NOT NULL) AS tem_comprovante
       FROM usuarios u LEFT JOIN comprovantes_entidade c ON c.usuario_id = u.id
      WHERE u.id = $1`,
    [req.usuario.id]
  );
  if (!r.rows.length) return res.status(404).json({ erro: 'Cadastro não encontrado.' });
  res.json(r.rows[0]);
}));

// A entidade receptora anexa (ou substitui) o comprovante de entidade sem fins lucrativos.
app.put('/perfil/comprovante', autenticar, exigirPerfil('receptora'), rota(async (req, res) => {
  const b = validar.corpo(req.body, ['arquivo']);
  const arquivo = validar.comprovante(b.arquivo);
  const r = await pool.query(
    `INSERT INTO comprovantes_entidade (usuario_id, arquivo, tipo) VALUES ($1,$2,$3)
     ON CONFLICT (usuario_id) DO UPDATE SET arquivo = EXCLUDED.arquivo, tipo = EXCLUDED.tipo, enviado_em = now()
     RETURNING tipo, enviado_em, octet_length(arquivo) AS tamanho`,
    [req.usuario.id, arquivo.dados, arquivo.tipo]
  );
  res.json({ ok: true, ...r.rows[0] });
}));

// Só a própria entidade lê o arquivo (não há perfil administrador nesta versão).
app.get('/perfil/comprovante', autenticar, exigirPerfil('receptora'), rota(async (req, res) => {
  const r = await pool.query('SELECT arquivo, tipo FROM comprovantes_entidade WHERE usuario_id = $1', [req.usuario.id]);
  if (!r.rows.length) return res.status(404).json({ erro: 'Nenhum comprovante anexado.' });
  const extensao = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }[r.rows[0].tipo];
  res.set({ 'Cache-Control': 'private, no-store', 'Content-Disposition': `attachment; filename="comprovante-entidade.${extensao}"` })
    .type(r.rows[0].tipo).send(r.rows[0].arquivo);
}));

// ---------- Notificações (L05) ----------
// O destinatário é escolhido no servidor, em SQL, na mesma instrução que muda o lote.
// Receptoras: apenas as do raio de 10 km do doador; urgente quando a validade é de hoje ou amanhã.
const NOTIFICACOES_JSON = "(SELECT COALESCE(json_agg(x), '[]'::json) FROM notificadas x)";
const notificarReceptoras = (tipo, origem, titulo, raio, filtro = '') =>
  `notificadas AS (
       INSERT INTO notificacoes (usuario_id, lote_id, tipo, urgente, mensagem)
       SELECT r.id, o.id, '${tipo}', (o.validade - ${HOJE}) <= 1,
              '${titulo}: ' || o.alimento || ' (' || o.quantidade_kg::float8::text || ' kg) de ' || d.nome || '.'
         FROM ${origem} o
         JOIN usuarios d ON d.id = o.doador_id
         JOIN usuarios r ON r.perfil = 'receptora' AND ST_DWithin(d.localizacao, r.localizacao, ${raio}) ${filtro}
       RETURNING ${COLUNAS_NOTIFICACAO}
     )`;

// ---------- Ciclo de vida (sem job: chamado no início das rotas de lotes) ----------
// Cada passo é uma única instrução atômica; FOR UPDATE ordenado evita corrida e deadlock
// entre chamadas simultâneas (a segunda reavalia as linhas já atualizadas e as ignora).
async function atualizarStatus() {
  // Lote vencido → expirado (o código deixa de valer; a reserva fica como histórico). Lote ainda
  // disponível cujo horário limite de retirada passou também expira: ninguém mais consegue reservá-lo.
  // O mesmo vale para a reserva atrasada (janela + tolerância vencidas) cujo prazo já passou: não há
  // para quem liberar o lote, então ele expira aqui, sem notificação, antes do passo de liberação.
  await pool.query(
    `WITH vencidos AS (
       SELECT id FROM lotes
        WHERE (status IN ('disponivel','reservado') AND validade < ${HOJE})
           OR (status = 'disponivel' AND retirada_ate <= now())
           OR (status = 'reservado' AND retirada_ate <= now()
               AND janela_fim + make_interval(mins => $1) < now())
        ORDER BY id FOR UPDATE
     ), expirados AS (
       UPDATE lotes l SET status = 'expirado', codigo = NULL
         FROM vencidos v WHERE l.id = v.id RETURNING l.id
     )
     INSERT INTO eventos_lote (lote_id, tipo, usuario_id) SELECT id, 'expirado', NULL FROM expirados`,
    [TOLERANCIA_MINUTOS]
  );
  // Janela encerrada há mais que a tolerância sem retirada → volta a disponível para a próxima ONG
  // e avisa as receptoras no raio (a notificação nasce na mesma instrução da liberação).
  const liberacao = await pool.query(
    `WITH atrasados AS (
       SELECT id, reservado_por FROM lotes
        WHERE status = 'reservado' AND janela_fim + make_interval(mins => $1) < now()
        ORDER BY id FOR UPDATE
     ), liberados AS (
       UPDATE lotes l
          SET status = 'disponivel', reservado_por = NULL, reservado_em = NULL, codigo = NULL,
              janela_inicio = NULL, janela_fim = NULL
         FROM atrasados a WHERE l.id = a.id
       RETURNING l.id, l.doador_id, l.alimento, l.quantidade_kg, l.validade, a.reservado_por
     ), evento AS (
       INSERT INTO eventos_lote (lote_id, tipo, usuario_id) SELECT id, 'liberado', reservado_por FROM liberados
     ), ${notificarReceptoras('lote_liberado', 'liberados', 'Lote disponível novamente', '$2')}
     SELECT ${NOTIFICACOES_JSON} AS notificacoes`,
    [TOLERANCIA_MINUTOS, RAIO_METROS]
  );
  tempoReal.publicar(liberacao.rows[0]?.notificacoes);
}

// ---------- Lotes ----------
// Doador: lista seus lotes ativos e os expirados. Receptora: lotes num raio de 10 km (PostGIS),
// ordenados por urgência de validade e depois por distância, + lotes que ela reservou.
app.get('/lotes', autenticar, rota(async (req, res) => {
  await atualizarStatus();
  if (req.usuario.perfil === 'doador') {
    const r = await pool.query(
      `SELECT l.id, l.alimento, l.categoria, l.quantidade_kg, l.validade::text AS validade, l.status,
              (l.validade - ${HOJE}) AS dias, r.nome AS reservado_por_nome,
              ${LOCAL('l.retirada_ate')} AS retirada_ate, (l.foto IS NOT NULL) AS tem_foto,
              ${LOCAL('l.janela_inicio')} AS janela_inicio, ${LOCAL('l.janela_fim')} AS janela_fim
         FROM lotes l LEFT JOIN usuarios r ON r.id = l.reservado_por
        WHERE l.doador_id = $1 AND l.status IN ('disponivel','reservado','expirado')
        ORDER BY (l.status = 'expirado'),
                 CASE WHEN l.status = 'expirado' THEN l.validade END DESC,
                 l.validade, l.id`,
      [req.usuario.id]
    );
    return res.json(r.rows);
  }
  const r = await pool.query(
    `SELECT l.id, l.alimento, l.categoria, l.quantidade_kg, l.validade::text AS validade, l.status,
            (l.validade - ${HOJE}) AS dias, d.nome AS doador, d.bairro,
            ROUND((ST_Distance(d.localizacao, r.localizacao) / 1000)::numeric, 1) AS distancia_km,
            ${LOCAL('l.retirada_ate')} AS retirada_ate, (l.foto IS NOT NULL) AS tem_foto,
            CASE WHEN l.reservado_por = $1 THEN l.codigo END AS codigo,
            CASE WHEN l.reservado_por = $1 THEN ${LOCAL('l.janela_inicio')} END AS janela_inicio,
            CASE WHEN l.reservado_por = $1 THEN ${LOCAL('l.janela_fim')} END AS janela_fim,
            CASE WHEN l.reservado_por = $1 THEN $3::int END AS tolerancia_minutos
       FROM lotes l
       JOIN usuarios d ON d.id = l.doador_id
       JOIN usuarios r ON r.id = $1
      WHERE (l.status = 'disponivel' AND l.validade >= ${HOJE} AND l.retirada_ate > now()
             AND ST_DWithin(d.localizacao, r.localizacao, $2))
         OR (l.status = 'reservado' AND l.reservado_por = $1)
      ORDER BY (l.status = 'reservado') DESC, l.validade, distancia_km`,
    [req.usuario.id, RAIO_METROS, TOLERANCIA_MINUTOS]
  );
  res.json(r.rows);
}));

// Publicar lote (somente doador). Regras de negócio validadas no servidor.
app.post('/lotes', autenticar, exigirPerfil('doador'), rota(async (req, res) => {
  const b = validar.corpo(req.body, ['alimento', 'categoria', 'quantidade_kg', 'validade', 'retirada_ate', 'foto']);
  const alimento = validar.texto(b.alimento, 'Alimento', 200);
  const categoria = validar.opcao(b.categoria, 'Categoria', validar.CATEGORIAS);
  const qtd = validar.quantidade(b.quantidade_kg);
  const validade = validar.data(b.validade);
  if (b.retirada_ate === undefined) throw new validar.ErroValidacao('Informe o horário limite de retirada.');
  const textoAte = validar.dataHora(b.retirada_ate, 'Horário limite de retirada');
  const foto = validar.foto(b.foto);
  await atualizarStatus();
  const ok = await pool.query(
    `SELECT $1::date >= ${HOJE} AS ok, ($2::timestamp AT TIME ZONE ${FUSO}) AS ate, now() AS agora,
            (($1::date + 1)::timestamp AT TIME ZONE ${FUSO}) AS limite`,
    [validade, textoAte]
  );
  const { ate, agora, limite } = ok.rows[0];
  if (!ok.rows[0].ok) return res.status(400).json({ erro: 'Não é permitido publicar lote com data de validade vencida.' });
  if (ate <= agora) throw new validar.ErroValidacao('O horário limite de retirada deve estar no futuro.');
  if (ate > limite)
    throw new validar.ErroValidacao('O horário limite de retirada deve ser até o fim do dia da validade do lote.');

  const r = await pool.query(
    `WITH novo AS (
       INSERT INTO lotes (doador_id, alimento, categoria, quantidade_kg, validade, retirada_ate, foto, foto_tipo)
       VALUES ($1,$2,$3,$4,$5,$7,$8,$9) RETURNING id, doador_id, alimento, quantidade_kg, validade
     ), evento AS (
       INSERT INTO eventos_lote (lote_id, tipo, usuario_id) SELECT id, 'publicado', $1 FROM novo
     ), ${notificarReceptoras('lote_publicado', 'novo', 'Novo lote', '$6')}
     SELECT id, ${NOTIFICACOES_JSON} AS notificacoes FROM novo`,
    [req.usuario.id, alimento, categoria, qtd, validade, RAIO_METROS, ate, foto?.dados ?? null, foto?.tipo ?? null]
  );
  res.status(201).json({ id: r.rows[0].id });
  tempoReal.publicar(r.rows[0].notificacoes);
}));

// Reservar (somente receptora), escolhendo a janela de retirada (horário de Campo Grande):
// começa de agora em diante (folga de 5 min), dura no máximo 2 h e termina até o horário limite de
// retirada do lote (que, por sua vez, não passa do fim do dia da validade).
// Atômico: o UPDATE condicional garante que apenas a primeira entidade consiga reservar o lote.
app.put('/lotes/:id/reservar', autenticar, exigirPerfil('receptora'), rota(async (req, res) => {
  const id = validar.id(req.params.id);
  const b = validar.corpo(req.body, ['janela_inicio', 'janela_fim']);
  if (b.janela_inicio === undefined || b.janela_fim === undefined)
    throw new validar.ErroValidacao('Informe o início e o fim da janela de retirada.');
  const textoInicio = validar.dataHora(b.janela_inicio, 'Início da janela');
  const textoFim = validar.dataHora(b.janela_fim, 'Fim da janela');
  await atualizarStatus();

  const base = await pool.query(
    `SELECT l.status, l.validade >= ${HOJE} AS vigente,
            ($2::timestamp AT TIME ZONE ${FUSO}) AS inicio,
            ($3::timestamp AT TIME ZONE ${FUSO}) AS fim,
            now() AS agora, l.retirada_ate,
            ((l.validade + 1)::timestamp AT TIME ZONE ${FUSO}) AS limite
       FROM lotes l WHERE l.id = $1`,
    [id, textoInicio, textoFim]
  );
  const lote = base.rows[0];
  if (!lote || lote.status !== 'disponivel' || !lote.vigente)
    return res.status(409).json({ erro: 'Este lote não está mais disponível para reserva.' });
  if (lote.retirada_ate <= lote.agora)
    return res.status(409).json({ erro: 'O horário limite de retirada deste lote já passou.' });
  if (lote.inicio < lote.agora - INICIO_FOLGA_MINUTOS * 60000)
    throw new validar.ErroValidacao('O início da janela de retirada não pode estar no passado.');
  if (lote.fim <= lote.agora)
    throw new validar.ErroValidacao('O fim da janela de retirada deve estar no futuro.');
  if (lote.fim <= lote.inicio)
    throw new validar.ErroValidacao('O fim da janela deve ser depois do início.');
  if (lote.fim - lote.inicio > JANELA_MAX_MINUTOS * 60000)
    throw new validar.ErroValidacao('A janela de retirada pode ter no máximo 2 horas.');
  if (lote.fim > lote.retirada_ate && lote.retirada_ate < lote.limite)
    throw new validar.ErroValidacao('A janela de retirada deve terminar até o horário limite de retirada do lote.');
  if (lote.fim > lote.limite)
    throw new validar.ErroValidacao('A janela de retirada deve terminar até o fim do dia da validade do lote.');

  const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const r = await pool.query(
    `WITH reserva AS (
       UPDATE lotes l
          SET status = 'reservado', reservado_por = $2, reservado_em = now(), codigo = $3,
              janela_inicio = $5, janela_fim = $6, tentativas_codigo = 0, ultima_falha_codigo = NULL
        WHERE l.id = $1 AND l.status = 'disponivel' AND l.validade >= ${HOJE}
          AND EXISTS (SELECT 1 FROM usuarios d, usuarios r
                       WHERE d.id = l.doador_id AND r.id = $2
                         AND ST_DWithin(d.localizacao, r.localizacao, $4))
        RETURNING l.id, l.codigo, l.doador_id, l.alimento
     ), evento AS (
       INSERT INTO eventos_lote (lote_id, tipo, usuario_id) SELECT id, 'reservado', $2 FROM reserva
     ), notificadas AS (
       INSERT INTO notificacoes (usuario_id, lote_id, tipo, urgente, mensagem)
       SELECT o.doador_id, o.id, 'lote_reservado', false, u.nome || ' reservou o lote: ' || o.alimento || '.'
         FROM reserva o JOIN usuarios u ON u.id = $2
       RETURNING ${COLUNAS_NOTIFICACAO}
     )
     SELECT id, codigo, ${NOTIFICACOES_JSON} AS notificacoes FROM reserva`,
    [id, req.usuario.id, codigo, RAIO_METROS, lote.inicio, lote.fim]
  );
  if (!r.rows.length)
    return res.status(409).json({ erro: 'Este lote não está mais disponível para reserva.' });
  res.json({ id: r.rows[0].id, codigo: r.rows[0].codigo });
  tempoReal.publicar(r.rows[0].notificacoes);
}));

// Confirmar retirada (somente doador): valida o código e registra a doação.
app.put('/lotes/:id/confirmar-retirada', autenticar, exigirPerfil('doador'), rota(async (req, res) => {
  const id = validar.id(req.params.id);
  const b = validar.corpo(req.body, ['codigo', 'checklist']);
  const codigo = validar.codigo(b.codigo);
  const checklist = comprovantes.validarChecklist(b.checklist);
  await atualizarStatus();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Trava a linha do lote: tentativas simultâneas são contadas uma a uma.
    const atual = await client.query(
      `SELECT status, codigo,
              (tentativas_codigo >= $3 AND ultima_falha_codigo > now() - make_interval(mins => $4)) AS bloqueado
         FROM lotes WHERE id = $1 AND doador_id = $2 FOR UPDATE`,
      [id, req.usuario.id, MAX_TENTATIVAS_CODIGO, BLOQUEIO_CODIGO_MINUTOS]
    );
    const travado = atual.rows[0];
    if (travado?.status === 'reservado' && travado.bloqueado) {
      await client.query('ROLLBACK');
      return res.status(429).json({ erro: `Muitas tentativas com código errado. Aguarde ${BLOQUEIO_CODIGO_MINUTOS} minutos e confira o código com a entidade.` });
    }
    const r = await client.query(
      `UPDATE lotes SET status = 'entregue'
        WHERE id = $1 AND doador_id = $2 AND status = 'reservado' AND codigo = $3
          AND validade >= ${HOJE} AND janela_fim + make_interval(mins => $4) >= now()
        RETURNING id, doador_id, reservado_por, alimento, quantidade_kg, codigo`,
      [id, req.usuario.id, codigo, TOLERANCIA_MINUTOS]
    );
    if (!r.rows.length) {
      const status = travado?.status;
      // Código errado numa reserva ativa: conta para o bloqueio (a sequência recomeça após 15 min sem erro).
      if (status === 'reservado' && travado.codigo !== codigo) {
        const f = await client.query(
          `UPDATE lotes
              SET tentativas_codigo = CASE WHEN ultima_falha_codigo > now() - make_interval(mins => $2)
                                           THEN tentativas_codigo + 1 ELSE 1 END,
                  ultima_falha_codigo = now()
            WHERE id = $1 RETURNING tentativas_codigo`,
          [id, BLOQUEIO_CODIGO_MINUTOS]
        );
        await client.query('COMMIT');
        const restantes = MAX_TENTATIVAS_CODIGO - f.rows[0].tentativas_codigo;
        return res.status(400).json({ erro: restantes > 0
          ? `Código inválido. Restam ${restantes} tentativa(s) antes de um bloqueio de ${BLOQUEIO_CODIGO_MINUTOS} minutos.`
          : `Código inválido. Novas tentativas ficam bloqueadas por ${BLOQUEIO_CODIGO_MINUTOS} minutos.` });
      }
      // Lote do próprio doador expirado ou com a reserva liberada: conflito de estado (409).
      await client.query('ROLLBACK');
      if (status === 'expirado')
        return res.status(409).json({ erro: 'Este lote expirou e não pode mais ter a retirada confirmada.' });
      if (status === 'disponivel')
        return res.status(409).json({ erro: 'Este lote não tem reserva ativa: a reserva foi liberada ou ainda não existe.' });
      return res.status(400).json({ erro: 'Código inválido ou lote não está reservado.' });
    }
    const l = r.rows[0];
    const partes = await client.query('SELECT id, nome, cnpj FROM usuarios WHERE id = ANY($1::int[])',
      [[l.doador_id, l.reservado_por]]);
    const dataHora = (await client.query('SELECT now() AS instante')).rows[0].instante.toISOString();
    const dados = {
      versao: 1, lote_id: l.id,
      doador: partes.rows.find((u) => u.id === l.doador_id),
      receptora: partes.rows.find((u) => u.id === l.reservado_por),
      alimento: l.alimento, quantidade_kg: l.quantidade_kg,
      data_hora: dataHora, codigo: l.codigo, checklist,
    };
    const hash = comprovantes.hashDe(dados);
    const doacao = await client.query(
      `INSERT INTO doacoes (lote_id, doador_id, receptor_id, alimento, quantidade_kg, codigo, data_hora, checklist, comprovante, hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [l.id, l.doador_id, l.reservado_por, l.alimento, l.quantidade_kg, l.codigo, dataHora, checklist, dados, hash]
    );
    await client.query(
      `INSERT INTO eventos_lote (lote_id, tipo, usuario_id) VALUES ($1,'entregue',$2)`,
      [l.id, l.doador_id]
    );
    // Somente a receptora que reservou; o texto não leva o código de retirada.
    const aviso = await client.query(
      `INSERT INTO notificacoes (usuario_id, lote_id, tipo, urgente, mensagem)
       VALUES ($1,$2,'retirada_confirmada',false,$3) RETURNING ${COLUNAS_NOTIFICACAO}`,
      [l.reservado_por, l.id, `${dados.doador.nome} confirmou a retirada do lote: ${l.alimento}.`]
    );
    await client.query('COMMIT');
    res.json({ ok: true, doacao_id: doacao.rows[0].id, hash });
    tempoReal.publicar(aviso.rows);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

// A receptora desiste da reserva: o lote volta na hora para as demais entidades do raio, sem esperar
// a janela vencer. O doador é avisado; as outras receptoras recebem "disponível novamente".
app.put('/lotes/:id/cancelar-reserva', autenticar, exigirPerfil('receptora'), rota(async (req, res) => {
  const id = validar.id(req.params.id);
  validar.corpo(req.body ?? {}, []);
  await atualizarStatus();
  const r = await pool.query(
    `WITH liberados AS (
       UPDATE lotes l
          SET status = 'disponivel', reservado_por = NULL, reservado_em = NULL, codigo = NULL,
              janela_inicio = NULL, janela_fim = NULL
        WHERE l.id = $1 AND l.status = 'reservado' AND l.reservado_por = $2
       RETURNING l.id, l.doador_id, l.alimento, l.quantidade_kg, l.validade, l.retirada_ate
     ), evento AS (
       INSERT INTO eventos_lote (lote_id, tipo, usuario_id) SELECT id, 'reserva_cancelada', $2 FROM liberados
     ), aviso AS (
       INSERT INTO notificacoes (usuario_id, lote_id, tipo, urgente, mensagem)
       SELECT o.doador_id, o.id, 'reserva_cancelada', false,
              u.nome || ' desistiu da reserva do lote: ' || o.alimento || '. Ele voltou a ficar disponível.'
         FROM liberados o JOIN usuarios u ON u.id = $2
       RETURNING ${COLUNAS_NOTIFICACAO}
     ), ${notificarReceptoras('lote_liberado', 'liberados', 'Lote disponível novamente', '$3',
       'AND r.id <> $2 AND o.retirada_ate > now()')}
     SELECT id, (SELECT COALESCE(json_agg(x), '[]'::json)
                   FROM (SELECT * FROM aviso UNION ALL SELECT * FROM notificadas) x) AS notificacoes
       FROM liberados`,
    [id, req.usuario.id, RAIO_METROS]
  );
  if (!r.rows.length) return res.status(409).json({ erro: 'Você não tem reserva ativa neste lote.' });
  res.json({ ok: true });
  tempoReal.publicar(r.rows[0].notificacoes);
}));

// O doador retira a oferta (disponível ou reservada). Se havia reserva, a receptora é avisada.
// O lote cancelado sai das listas e não entra na TEC (não é falha de coleta); o evento fica no histórico.
app.put('/lotes/:id/cancelar', autenticar, exigirPerfil('doador'), rota(async (req, res) => {
  const id = validar.id(req.params.id);
  validar.corpo(req.body ?? {}, []);
  await atualizarStatus();
  const r = await pool.query(
    `WITH cancelados AS (
       UPDATE lotes l SET status = 'cancelado', codigo = NULL
        WHERE l.id = $1 AND l.doador_id = $2 AND l.status IN ('disponivel','reservado')
       RETURNING l.id, l.alimento, l.reservado_por AS receptora
     ), evento AS (
       INSERT INTO eventos_lote (lote_id, tipo, usuario_id) SELECT id, 'cancelado', $2 FROM cancelados
     ), notificadas AS (
       INSERT INTO notificacoes (usuario_id, lote_id, tipo, urgente, mensagem)
       SELECT c.receptora, c.id, 'lote_cancelado', true,
              d.nome || ' cancelou o lote: ' || c.alimento || '. Sua reserva foi desfeita; não é preciso ir retirar.'
         FROM cancelados c JOIN usuarios d ON d.id = $2
        WHERE c.receptora IS NOT NULL
       RETURNING ${COLUNAS_NOTIFICACAO}
     )
     SELECT id, ${NOTIFICACOES_JSON} AS notificacoes FROM cancelados`,
    [id, req.usuario.id]
  );
  if (!r.rows.length)
    return res.status(409).json({ erro: 'Só é possível cancelar um lote seu que esteja disponível ou reservado.' });
  res.json({ ok: true });
  tempoReal.publicar(r.rows[0].notificacoes);
}));

// Foto do lote (L03): só o doador dono ou a receptora que pode ver o lote (a mesma regra da listagem:
// disponível no raio de 10 km ou reservado por ela). Qualquer outro caso é 404, sem revelar se o lote existe.
app.get('/lotes/:id/foto', autenticar, rota(async (req, res) => {
  const id = validar.id(req.params.id);
  const r = await pool.query(
    `SELECT l.foto, l.foto_tipo FROM lotes l
      WHERE l.id = $1 AND l.foto IS NOT NULL
        AND (l.doador_id = $2
             OR EXISTS (SELECT 1 FROM usuarios u, usuarios d
                         WHERE u.id = $2 AND u.perfil = 'receptora' AND d.id = l.doador_id
                           AND ((l.status = 'disponivel' AND l.validade >= ${HOJE} AND l.retirada_ate > now()
                                 AND ST_DWithin(d.localizacao, u.localizacao, $3))
                                OR (l.status = 'reservado' AND l.reservado_por = u.id))))`,
    [id, req.usuario.id, RAIO_METROS]
  );
  if (!r.rows.length) return res.status(404).json({ erro: 'Foto não encontrada.' });
  res.set('Cache-Control', 'private, no-store').type(r.rows[0].foto_tipo).send(r.rows[0].foto);
}));

// QR de retirada: somente a receptora que mantém a reserva ativa.
app.get('/lotes/:id/qrcode', autenticar, exigirPerfil('receptora'), rota(async (req, res) => {
  const id = validar.id(req.params.id);
  await atualizarStatus();
  const r = await pool.query('SELECT reservado_por, status, codigo FROM lotes WHERE id=$1', [id]);
  const l = r.rows[0];
  if (!l) return res.status(404).json({ erro: 'Lote não encontrado.' });
  if (l.reservado_por !== req.usuario.id) return res.status(403).json({ erro: 'QR disponível apenas para a entidade que reservou.' });
  if (l.status !== 'reservado') return res.status(409).json({ erro: 'Este lote não tem reserva ativa.' });
  const url = comprovantes.urlQR(req, `/#retirada/${id}/${l.codigo}`);
  const imagem = await comprovantes.png(url);
  res.set('Cache-Control', 'no-store').type('png').send(imagem);
}));

app.get('/doacoes/:id/comprovante', autenticar, rota(async (req, res) => {
  const id = validar.id(req.params.id);
  const r = await pool.query('SELECT id, doador_id, receptor_id, hash, comprovante FROM doacoes WHERE id=$1', [id]);
  const d = r.rows[0];
  if (!d) return res.status(404).json({ erro: 'Doação não encontrada.' });
  if (![d.doador_id, d.receptor_id].includes(req.usuario.id))
    return res.status(403).json({ erro: 'Comprovante disponível apenas para as duas partes da doação.' });
  const html = await comprovantes.paginaComprovante(d, comprovantes.urlQR(req, `/verificar/${d.hash}`));
  res.set('Cache-Control', 'no-store').type('html').send(html);
}));

// Pública por decisão D8: nenhum dado de cadastro ou código de retirada é exposto.
app.get('/verificar/:hash', rota(async (req, res) => {
  const hash = req.params.hash;
  if (!/^[0-9a-f]{64}$/.test(hash)) return res.status(404).json({ erro: 'Comprovante não encontrado.' });
  const r = await pool.query('SELECT hash, comprovante FROM doacoes WHERE hash=$1', [hash]);
  if (!r.rows[0]) return res.status(404).json({ erro: 'Comprovante não encontrado.' });
  const html = comprovantes.paginaVerificacao(r.rows[0]);
  res.set('Cache-Control', 'no-store').type('html').send(html);
}));

// ---------- Central de notificações (cada usuário só enxerga e altera as próprias) ----------
const SELECT_NOTIFICACAO = 'id, tipo, urgente, mensagem, lote_id, criado_em, (lida_em IS NOT NULL) AS lida';

app.get('/notificacoes', autenticar, rota(async (req, res) => {
  const [itens, contagem] = await Promise.all([
    pool.query(`SELECT ${SELECT_NOTIFICACAO} FROM notificacoes WHERE usuario_id = $1 ORDER BY id DESC LIMIT 50`,
      [req.usuario.id]),
    pool.query('SELECT COUNT(*)::int AS n FROM notificacoes WHERE usuario_id = $1 AND lida_em IS NULL',
      [req.usuario.id]),
  ]);
  res.json({ nao_lidas: contagem.rows[0].n, itens: itens.rows });
}));

app.put('/notificacoes/lidas', autenticar, rota(async (req, res) => {
  validar.corpo(req.body ?? {}, []);
  const r = await pool.query(
    'UPDATE notificacoes SET lida_em = now() WHERE usuario_id = $1 AND lida_em IS NULL', [req.usuario.id]);
  res.json({ ok: true, marcadas: r.rowCount });
}));

app.put('/notificacoes/:id/lida', autenticar, rota(async (req, res) => {
  const id = validar.id(req.params.id);
  // Notificação de outro usuário é indistinguível de uma inexistente.
  const r = await pool.query(
    `UPDATE notificacoes SET lida_em = COALESCE(lida_em, now()) WHERE id = $1 AND usuario_id = $2
     RETURNING ${SELECT_NOTIFICACAO}`, [id, req.usuario.id]);
  if (!r.rows.length) return res.status(404).json({ erro: 'Notificação não encontrada.' });
  res.json(r.rows[0]);
}));

// ---------- Histórico e indicadores ----------
app.get('/doacoes', autenticar, rota(async (req, res) => {
  const coluna = req.usuario.perfil === 'doador' ? 'doador_id' : 'receptor_id';
  const r = await pool.query(
    `SELECT c.id, c.alimento, c.quantidade_kg, c.codigo, to_char(c.data_hora AT TIME ZONE 'America/Campo_Grande','DD/MM/YYYY HH24:MI') AS data,
            c.comprovante->'doador'->>'nome' AS doador, c.comprovante->'receptora'->>'nome' AS entidade
       FROM doacoes c
      WHERE c.${coluna} = $1
      ORDER BY c.data_hora DESC`,
    [req.usuario.id]
  );
  res.json(r.rows);
}));

// kg, refeições, CO₂e, água, entidades beneficiadas, TMR e TEC. `doador` e `receptora` restringem o cálculo
// às doações e lotes de um usuário (null = todos).
//  - TMR: média de (reservado_em − criado_em) em minutos, sobre os lotes com reserva registrada.
//  - TEC: entregues ÷ (entregues + expirados), em %, sobre os lotes já encerrados.
// Sem dados o valor é null (e a meta não é avaliada).
async function calcularIndicadores(doador, receptora) {
  const r = await pool.query(
    `SELECT
       (SELECT COALESCE(SUM(quantidade_kg),0)::float FROM doacoes
         WHERE ($1::int IS NULL OR doador_id = $1) AND ($2::int IS NULL OR receptor_id = $2)) AS kg,
       (SELECT COUNT(*)::int FROM doacoes
         WHERE ($1::int IS NULL OR doador_id = $1) AND ($2::int IS NULL OR receptor_id = $2)) AS doacoes,
       (SELECT COUNT(DISTINCT receptor_id)::int FROM doacoes
         WHERE ($1::int IS NULL OR doador_id = $1) AND ($2::int IS NULL OR receptor_id = $2)) AS entidades,
       (SELECT COUNT(DISTINCT doador_id)::int FROM doacoes
         WHERE ($1::int IS NULL OR doador_id = $1) AND ($2::int IS NULL OR receptor_id = $2)) AS doadores,
       l.tmr, l.entregues, l.expirados
     FROM (SELECT AVG(EXTRACT(EPOCH FROM reservado_em - criado_em) / 60)::float AS tmr,
                  COUNT(*) FILTER (WHERE status = 'entregue')::int AS entregues,
                  COUNT(*) FILTER (WHERE status = 'expirado')::int AS expirados
             FROM lotes
            WHERE ($1::int IS NULL OR doador_id = $1) AND ($2::int IS NULL OR reservado_por = $2)) l`,
    [doador, receptora]
  );
  const x = r.rows[0];
  const encerrados = x.entregues + x.expirados;
  const arredondar = (n) => Math.round(n * 10) / 10;
  const tmr = x.tmr === null ? null : arredondar(x.tmr);
  const tec = encerrados ? arredondar((x.entregues / encerrados) * 100) : null;
  return {
    kg: x.kg,
    entidades: x.entidades,
    doadores: x.doadores,
    doacoes: x.doacoes,
    refeicoes: Math.round(x.kg * FATORES.refeicoes),
    co2: Math.round(x.kg * FATORES.co2),
    agua: Math.round(x.kg * FATORES.agua),
    tmr_minutos: tmr,
    tec_percentual: tec,
    entregues: x.entregues,
    expirados: x.expirados,
    metas: {
      ...METAS,
      tmr_atingida: tmr === null ? null : tmr < METAS.tmr_minutos,
      tec_atingida: tec === null ? null : tec > METAS.tec_percentual,
    },
  };
}

app.get('/indicadores', autenticar, rota(async (req, res) => {
  await atualizarStatus();
  res.json(await calcularIndicadores(null, null));
}));

// "Meus números": só as doações e lotes do próprio usuário, conforme o perfil.
app.get('/indicadores/meus', autenticar, rota(async (req, res) => {
  await atualizarStatus();
  const doador = req.usuario.perfil === 'doador';
  const idUsuario = req.usuario.id;
  res.json({ perfil: req.usuario.perfil, ...(await calcularIndicadores(doador ? idUsuario : null, doador ? null : idUsuario)) });
}));

// Falhas do parser não passam pelas rotas. Não expor o corpo recebido ou stack.
app.use((erro, req, res, next) => {
  if (erro instanceof URIError && erro.status === 400)
    return res.status(400).json({ erro: 'URL inválida. Confira o identificador informado.' });
  if (erro.type === 'entity.parse.failed')
    return res.status(400).json({ erro: 'JSON malformado. Envie um objeto JSON válido.' });
  if (erro.type === 'entity.too.large' && ehPublicarLote(req))
    return res.status(400).json({ erro: 'A requisição é grande demais. A foto pode ter no máximo 400 KB.' });
  if (erro.type === 'entity.too.large' && req.method === 'PUT' && req.path === '/perfil/comprovante')
    return res.status(400).json({ erro: 'A requisição é grande demais. O comprovante pode ter no máximo 1 MB.' });
  if (erro.type === 'entity.too.large')
    return res.status(413).json({ erro: 'O corpo da requisição excede o tamanho permitido.' });
  if (erro.type === 'charset.unsupported' || erro.type === 'encoding.unsupported')
    return res.status(415).json({ erro: 'Codificação da requisição não suportada.' });
  if (erro.type === 'request.aborted' || erro.type === 'request.size.invalid')
    return res.status(400).json({ erro: 'Corpo da requisição incompleto ou tamanho inválido.' });
  // Demais erros do cliente (ex.: corpo comprimido inválido): não ecoar a mensagem original.
  if (erro.expose && erro.status >= 400 && erro.status < 500)
    return res.status(erro.status).json({ erro: 'Requisição inválida. Confira os dados enviados.' });
  console.error(erro);
  res.status(500).json({ erro: 'Erro interno do servidor.' });
});

const PORTA = process.env.PORT || 3000;
const servidor = app.listen(PORTA, () => console.log(`Rede AlimentaMS rodando em http://localhost:${PORTA}`));
tempoReal.anexar(servidor); // WebSocket /ws no mesmo servidor HTTP
