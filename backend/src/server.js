// Rede AlimentaMS - Backend (Node.js + Express + PostgreSQL/PostGIS)
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const validar = require('./validacao');

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
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on('error', (erro) => console.error('Erro inesperado em conexão ociosa do banco.', erro));

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
const SEGREDO = process.env.JWT_SECRET || 'segredo-de-desenvolvimento';
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

// Fatores de conversão do painel (mesmos do protótipo, apenas demonstrativos)
const FATORES = { refeicoes: 2, co2: 2.5, agua: 350 };

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
  const b = validar.corpo(req.body, ['nome', 'email', 'senha', 'perfil', 'cnpj', 'bairro']);
  const nome = validar.texto(b.nome, 'Nome', 200);
  const email = validar.email(b.email);
  const senha = validar.senha(b.senha);
  const perfil = validar.opcao(b.perfil, 'Perfil', ['doador', 'receptora']);
  const cnpj = validar.cnpj(b.cnpj);
  const bairro = validar.opcao(b.bairro, 'Bairro', Object.keys(BAIRROS));
  const coord = BAIRROS[bairro];

  const hash = await bcrypt.hash(senha, 10);
  try {
    const r = await pool.query(
      `INSERT INTO usuarios (nome, email, senha_hash, perfil, cnpj, bairro, localizacao)
       VALUES ($1,$2,$3,$4,$5,$6, ST_SetSRID(ST_MakePoint($7,$8),4326)::geography)
       RETURNING id, nome, perfil`,
      [nome, email, hash, perfil, cnpj, bairro, coord[0], coord[1]]
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
  const r = await pool.query('SELECT id, nome, perfil, senha_hash FROM usuarios WHERE email = $1', [email]);
  const u = r.rows[0];
  if (!u || !(await bcrypt.compare(senha, u.senha_hash)))
    return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
  res.json({ token: gerarToken(u), usuario: { id: u.id, nome: u.nome, perfil: u.perfil } });
}));

// ---------- Ciclo de vida (sem job: chamado no início das rotas de lotes) ----------
// Cada passo é uma única instrução atômica; FOR UPDATE ordenado evita corrida e deadlock
// entre chamadas simultâneas (a segunda reavalia as linhas já atualizadas e as ignora).
async function atualizarStatus() {
  // Lote vencido → expirado (o código deixa de valer; a reserva fica como histórico).
  await pool.query(
    `WITH vencidos AS (
       SELECT id FROM lotes
        WHERE status IN ('disponivel','reservado') AND validade < ${HOJE}
        ORDER BY id FOR UPDATE
     ), expirados AS (
       UPDATE lotes l SET status = 'expirado', codigo = NULL
         FROM vencidos v WHERE l.id = v.id RETURNING l.id
     )
     INSERT INTO eventos_lote (lote_id, tipo, usuario_id) SELECT id, 'expirado', NULL FROM expirados`
  );
  // Janela encerrada há mais que a tolerância sem retirada → volta a disponível para a próxima ONG.
  await pool.query(
    `WITH atrasados AS (
       SELECT id, reservado_por FROM lotes
        WHERE status = 'reservado' AND janela_fim + make_interval(mins => $1) < now()
        ORDER BY id FOR UPDATE
     ), liberados AS (
       UPDATE lotes l
          SET status = 'disponivel', reservado_por = NULL, reservado_em = NULL, codigo = NULL,
              janela_inicio = NULL, janela_fim = NULL
         FROM atrasados a WHERE l.id = a.id RETURNING l.id, a.reservado_por
     )
     INSERT INTO eventos_lote (lote_id, tipo, usuario_id) SELECT id, 'liberado', reservado_por FROM liberados`,
    [TOLERANCIA_MINUTOS]
  );
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
            CASE WHEN l.reservado_por = $1 THEN l.codigo END AS codigo,
            CASE WHEN l.reservado_por = $1 THEN ${LOCAL('l.janela_inicio')} END AS janela_inicio,
            CASE WHEN l.reservado_por = $1 THEN ${LOCAL('l.janela_fim')} END AS janela_fim
       FROM lotes l
       JOIN usuarios d ON d.id = l.doador_id
       JOIN usuarios r ON r.id = $1
      WHERE (l.status = 'disponivel' AND l.validade >= ${HOJE}
             AND ST_DWithin(d.localizacao, r.localizacao, $2))
         OR (l.status = 'reservado' AND l.reservado_por = $1)
      ORDER BY (l.status = 'reservado') DESC, l.validade, distancia_km`,
    [req.usuario.id, RAIO_METROS]
  );
  res.json(r.rows);
}));

// Publicar lote (somente doador). Regras de negócio validadas no servidor.
app.post('/lotes', autenticar, exigirPerfil('doador'), rota(async (req, res) => {
  const b = validar.corpo(req.body, ['alimento', 'categoria', 'quantidade_kg', 'validade']);
  const alimento = validar.texto(b.alimento, 'Alimento', 200);
  const categoria = validar.opcao(b.categoria, 'Categoria', validar.CATEGORIAS);
  const qtd = validar.quantidade(b.quantidade_kg);
  const validade = validar.data(b.validade);
  await atualizarStatus();
  const ok = await pool.query(`SELECT $1::date >= ${HOJE} AS ok`, [validade]);
  if (!ok.rows[0].ok) return res.status(400).json({ erro: 'Não é permitido publicar lote com data de validade vencida.' });

  const r = await pool.query(
    `WITH novo AS (
       INSERT INTO lotes (doador_id, alimento, categoria, quantidade_kg, validade)
       VALUES ($1,$2,$3,$4,$5) RETURNING id
     ), evento AS (
       INSERT INTO eventos_lote (lote_id, tipo, usuario_id) SELECT id, 'publicado', $1 FROM novo
     )
     SELECT id FROM novo`,
    [req.usuario.id, alimento, categoria, qtd, validade]
  );
  res.status(201).json({ id: r.rows[0].id });
}));

// Reservar (somente receptora), escolhendo a janela de retirada (horário de Campo Grande):
// começa de agora em diante (folga de 5 min), dura no máximo 2 h e termina até o fim do dia da validade.
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
            now() AS agora,
            ((l.validade + 1)::timestamp AT TIME ZONE ${FUSO}) AS limite
       FROM lotes l WHERE l.id = $1`,
    [id, textoInicio, textoFim]
  );
  const lote = base.rows[0];
  if (!lote || lote.status !== 'disponivel' || !lote.vigente)
    return res.status(409).json({ erro: 'Este lote não está mais disponível para reserva.' });
  if (lote.inicio < lote.agora - INICIO_FOLGA_MINUTOS * 60000)
    throw new validar.ErroValidacao('O início da janela de retirada não pode estar no passado.');
  if (lote.fim <= lote.agora)
    throw new validar.ErroValidacao('O fim da janela de retirada deve estar no futuro.');
  if (lote.fim <= lote.inicio)
    throw new validar.ErroValidacao('O fim da janela deve ser depois do início.');
  if (lote.fim - lote.inicio > JANELA_MAX_MINUTOS * 60000)
    throw new validar.ErroValidacao('A janela de retirada pode ter no máximo 2 horas.');
  if (lote.fim > lote.limite)
    throw new validar.ErroValidacao('A janela de retirada deve terminar até o fim do dia da validade do lote.');

  const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const r = await pool.query(
    `WITH reserva AS (
       UPDATE lotes l
          SET status = 'reservado', reservado_por = $2, reservado_em = now(), codigo = $3,
              janela_inicio = $5, janela_fim = $6
        WHERE l.id = $1 AND l.status = 'disponivel' AND l.validade >= ${HOJE}
          AND EXISTS (SELECT 1 FROM usuarios d, usuarios r
                       WHERE d.id = l.doador_id AND r.id = $2
                         AND ST_DWithin(d.localizacao, r.localizacao, $4))
        RETURNING l.id, l.codigo
     ), evento AS (
       INSERT INTO eventos_lote (lote_id, tipo, usuario_id) SELECT id, 'reservado', $2 FROM reserva
     )
     SELECT id, codigo FROM reserva`,
    [id, req.usuario.id, codigo, RAIO_METROS, lote.inicio, lote.fim]
  );
  if (!r.rows.length)
    return res.status(409).json({ erro: 'Este lote não está mais disponível para reserva.' });
  res.json({ id: r.rows[0].id, codigo: r.rows[0].codigo });
}));

// Confirmar retirada (somente doador): valida o código e registra a doação.
app.put('/lotes/:id/confirmar-retirada', autenticar, exigirPerfil('doador'), rota(async (req, res) => {
  const id = validar.id(req.params.id);
  const b = validar.corpo(req.body, ['codigo']);
  const codigo = validar.codigo(b.codigo);
  await atualizarStatus();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `UPDATE lotes SET status = 'entregue'
        WHERE id = $1 AND doador_id = $2 AND status = 'reservado' AND codigo = $3
        RETURNING id, doador_id, reservado_por, alimento, quantidade_kg, codigo`,
      [id, req.usuario.id, codigo]
    );
    if (!r.rows.length) {
      // Lote do próprio doador expirado ou com a reserva liberada: conflito de estado (409).
      const atual = await client.query('SELECT status FROM lotes WHERE id = $1 AND doador_id = $2', [id, req.usuario.id]);
      await client.query('ROLLBACK');
      const status = atual.rows[0]?.status;
      if (status === 'expirado')
        return res.status(409).json({ erro: 'Este lote expirou e não pode mais ter a retirada confirmada.' });
      if (status === 'disponivel')
        return res.status(409).json({ erro: 'Este lote não tem reserva ativa: a reserva foi liberada ou ainda não existe.' });
      return res.status(400).json({ erro: 'Código inválido ou lote não está reservado.' });
    }
    const l = r.rows[0];
    await client.query(
      `INSERT INTO doacoes (lote_id, doador_id, receptor_id, alimento, quantidade_kg, codigo)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [l.id, l.doador_id, l.reservado_por, l.alimento, l.quantidade_kg, l.codigo]
    );
    await client.query(
      `INSERT INTO eventos_lote (lote_id, tipo, usuario_id) VALUES ($1,'entregue',$2)`,
      [l.id, l.doador_id]
    );
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

// ---------- Histórico e indicadores ----------
app.get('/doacoes', autenticar, rota(async (req, res) => {
  const coluna = req.usuario.perfil === 'doador' ? 'doador_id' : 'receptor_id';
  const r = await pool.query(
    `SELECT c.id, c.alimento, c.quantidade_kg, c.codigo, to_char(c.data_hora AT TIME ZONE 'America/Campo_Grande','DD/MM/YYYY HH24:MI') AS data,
            d.nome AS doador, e.nome AS entidade
       FROM doacoes c
       JOIN usuarios d ON d.id = c.doador_id
       JOIN usuarios e ON e.id = c.receptor_id
      WHERE c.${coluna} = $1
      ORDER BY c.data_hora DESC`,
    [req.usuario.id]
  );
  res.json(r.rows);
}));

app.get('/indicadores', autenticar, rota(async (req, res) => {
  const r = await pool.query(
    `SELECT COALESCE(SUM(quantidade_kg),0)::float AS kg, COUNT(DISTINCT receptor_id)::int AS entidades,
            COUNT(*)::int AS doacoes FROM doacoes`
  );
  const { kg, entidades, doacoes } = r.rows[0];
  res.json({
    kg,
    entidades,
    doacoes,
    refeicoes: Math.round(kg * FATORES.refeicoes),
    co2: Math.round(kg * FATORES.co2),
    agua: Math.round(kg * FATORES.agua),
  });
}));

// Falhas do parser não passam pelas rotas. Não expor o corpo recebido ou stack.
app.use((erro, req, res, next) => {
  if (erro instanceof URIError && erro.status === 400)
    return res.status(400).json({ erro: 'URL inválida. Confira o identificador informado.' });
  if (erro.type === 'entity.parse.failed')
    return res.status(400).json({ erro: 'JSON malformado. Envie um objeto JSON válido.' });
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
app.listen(PORTA, () => console.log(`Rede AlimentaMS rodando em http://localhost:${PORTA}`));
