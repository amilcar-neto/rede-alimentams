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
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on('error', (erro) => console.error('Erro inesperado em conexão ociosa do banco.', erro));
const SEGREDO = process.env.JWT_SECRET || 'segredo-de-desenvolvimento';
const RAIO_METROS = 10000; // Fluxo 3: entidades num raio de até 10 km
const HOJE = "(now() AT TIME ZONE 'America/Campo_Grande')::date";

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

// ---------- Lotes ----------
// Doador: lista seus lotes em aberto. Receptora: lotes num raio de 10 km (PostGIS),
// ordenados por urgência de validade e depois por distância, + lotes que ela reservou.
app.get('/lotes', autenticar, rota(async (req, res) => {
  if (req.usuario.perfil === 'doador') {
    const r = await pool.query(
      `SELECT l.id, l.alimento, l.categoria, l.quantidade_kg, l.validade::text AS validade, l.status,
              (l.validade - ${HOJE}) AS dias, r.nome AS reservado_por_nome
         FROM lotes l LEFT JOIN usuarios r ON r.id = l.reservado_por
        WHERE l.doador_id = $1 AND l.status IN ('disponivel','reservado')
        ORDER BY l.validade, l.id`,
      [req.usuario.id]
    );
    return res.json(r.rows);
  }
  const r = await pool.query(
    `SELECT l.id, l.alimento, l.categoria, l.quantidade_kg, l.validade::text AS validade, l.status,
            (l.validade - ${HOJE}) AS dias, d.nome AS doador, d.bairro,
            ROUND((ST_Distance(d.localizacao, r.localizacao) / 1000)::numeric, 1) AS distancia_km,
            CASE WHEN l.reservado_por = $1 THEN l.codigo END AS codigo
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
  const ok = await pool.query(`SELECT $1::date >= ${HOJE} AS ok`, [validade]);
  if (!ok.rows[0].ok) return res.status(400).json({ erro: 'Não é permitido publicar lote com data de validade vencida.' });

  const r = await pool.query(
    `INSERT INTO lotes (doador_id, alimento, categoria, quantidade_kg, validade)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [req.usuario.id, alimento, categoria, qtd, validade]
  );
  res.status(201).json({ id: r.rows[0].id });
}));

// Reservar (somente receptora). Atômico: o UPDATE condicional garante que
// apenas a primeira entidade consiga reservar o lote.
app.put('/lotes/:id/reservar', autenticar, exigirPerfil('receptora'), rota(async (req, res) => {
  const id = validar.id(req.params.id);
  validar.corpo(req.body, []);
  const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const r = await pool.query(
    `UPDATE lotes l
        SET status = 'reservado', reservado_por = $2, reservado_em = now(), codigo = $3
      WHERE l.id = $1 AND l.status = 'disponivel' AND l.validade >= ${HOJE}
        AND EXISTS (SELECT 1 FROM usuarios d, usuarios r
                     WHERE d.id = l.doador_id AND r.id = $2
                       AND ST_DWithin(d.localizacao, r.localizacao, $4))
      RETURNING l.id, l.codigo`,
    [id, req.usuario.id, codigo, RAIO_METROS]
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
      await client.query('ROLLBACK');
      return res.status(400).json({ erro: 'Código inválido ou lote não está reservado.' });
    }
    const l = r.rows[0];
    await client.query(
      `INSERT INTO doacoes (lote_id, doador_id, receptor_id, alimento, quantidade_kg, codigo)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [l.id, l.doador_id, l.reservado_por, l.alimento, l.quantidade_kg, l.codigo]
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
