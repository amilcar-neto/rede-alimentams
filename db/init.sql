CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE usuarios (
  id            SERIAL PRIMARY KEY,
  nome          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  senha_hash    TEXT NOT NULL,
  perfil        TEXT NOT NULL CHECK (perfil IN ('doador','receptora')),
  cnpj          TEXT,
  bairro        TEXT NOT NULL,
  localizacao   geography(Point, 4326) NOT NULL,
  -- Cadastro completo (L06): contato do responsável e aceite do Termo de Responsabilidade e da
  -- Política de Privacidade (instante e versão aceitos). telefone guarda só os dígitos (DDD + número).
  endereco          TEXT NOT NULL,
  responsavel       TEXT NOT NULL,
  telefone          TEXT NOT NULL CHECK (telefone ~ '^[1-9][0-9][2-9][0-9]{7,8}$'),
  aceite_termos_em  TIMESTAMPTZ NOT NULL,
  termos_versao     TEXT NOT NULL,
  -- Situação do cadastro: aprovado por padrão; o extra X1 usa 'pendente' e 'rejeitado'.
  situacao      TEXT NOT NULL DEFAULT 'aprovado' CHECK (situacao IN ('aprovado','pendente','rejeitado')),
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_usuarios_geo ON usuarios USING GIST (localizacao);

-- Comprovante de entidade sem fins lucrativos (L06): PDF/JPEG/PNG de até 1 MB, tipo validado pelo
-- servidor. Um por entidade; só a própria entidade o lê.
CREATE TABLE comprovantes_entidade (
  usuario_id  INT PRIMARY KEY REFERENCES usuarios(id),
  arquivo     BYTEA NOT NULL CHECK (octet_length(arquivo) <= 1048576),
  tipo        TEXT NOT NULL CHECK (tipo IN ('application/pdf','image/jpeg','image/png')),
  enviado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE lotes (
  id             SERIAL PRIMARY KEY,
  doador_id      INT NOT NULL REFERENCES usuarios(id),
  alimento       TEXT NOT NULL,
  categoria      TEXT NOT NULL,
  quantidade_kg  NUMERIC(10,2) NOT NULL CHECK (quantidade_kg > 0),
  validade       DATE NOT NULL,
  status         TEXT NOT NULL DEFAULT 'disponivel'
                 CHECK (status IN ('disponivel','reservado','entregue','expirado')),
  reservado_por  INT REFERENCES usuarios(id),
  reservado_em   TIMESTAMPTZ,
  codigo         CHAR(6),
  janela_inicio  TIMESTAMPTZ,
  janela_fim     TIMESTAMPTZ,
  -- Horário limite de retirada (L03): até o fim do dia da validade; a janela da reserva respeita este limite.
  retirada_ate   TIMESTAMPTZ NOT NULL,
  -- Foto opcional (L03): JPEG/PNG de até 400 KB, validada pelo servidor; a listagem não carrega os bytes.
  foto           BYTEA,
  foto_tipo      TEXT,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((janela_inicio IS NULL) = (janela_fim IS NULL)),
  CHECK ((foto IS NULL) = (foto_tipo IS NULL)),
  CHECK (foto_tipo IS NULL OR foto_tipo IN ('image/jpeg','image/png')),
  CHECK (foto IS NULL OR octet_length(foto) <= 409600)
);
CREATE INDEX idx_lotes_status ON lotes (status);

-- Histórico do ciclo de vida. usuario_id é o ator (doador que publicou/entregou)
-- ou a ONG afetada (reservou/perdeu a reserva); nulo quando o sistema expira o lote.
CREATE TABLE eventos_lote (
  id          SERIAL PRIMARY KEY,
  lote_id     INT NOT NULL REFERENCES lotes(id),
  tipo        TEXT NOT NULL CHECK (tipo IN ('publicado','reservado','liberado','expirado','entregue')),
  usuario_id  INT REFERENCES usuarios(id),
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_eventos_lote ON eventos_lote (lote_id, id);

-- Central de notificações (L05): uma linha por destinatário, gravada na mesma instrução da
-- transição do lote. O WebSocket é só entrega adicional; sem ele a consulta HTTP continua valendo.
-- A mensagem não contém código de retirada nem dados de cadastro das partes.
CREATE TABLE notificacoes (
  id          SERIAL PRIMARY KEY,
  usuario_id  INT NOT NULL REFERENCES usuarios(id),
  lote_id     INT NOT NULL REFERENCES lotes(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL CHECK (tipo IN ('lote_publicado','lote_liberado','lote_reservado','retirada_confirmada')),
  urgente     BOOLEAN NOT NULL DEFAULT false,
  mensagem    TEXT NOT NULL,
  lida_em     TIMESTAMPTZ,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notificacoes_usuario ON notificacoes (usuario_id, id DESC);

CREATE TABLE doacoes (
  id           SERIAL PRIMARY KEY,
  lote_id      INT NOT NULL UNIQUE REFERENCES lotes(id),
  doador_id    INT NOT NULL REFERENCES usuarios(id),
  receptor_id  INT NOT NULL REFERENCES usuarios(id),
  alimento     TEXT NOT NULL,
  quantidade_kg NUMERIC(10,2) NOT NULL,
  codigo       CHAR(6) NOT NULL,
  data_hora    TIMESTAMPTZ NOT NULL DEFAULT now(),
  checklist    JSONB NOT NULL CHECK (checklist = '{"embalagem_integra":true,"temperatura_adequada":true,"dentro_validade":true}'::jsonb),
  comprovante  JSONB NOT NULL CHECK (jsonb_typeof(comprovante) = 'object'),
  hash         TEXT NOT NULL UNIQUE CHECK (hash ~ '^[0-9a-f]{64}$')
);

-- Log de doações: correções não podem sobrescrever nem remover o registro emitido.
CREATE FUNCTION impedir_alteracao_doacao() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Doações confirmadas são imutáveis.' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER doacoes_imutaveis BEFORE UPDATE OR DELETE ON doacoes
FOR EACH STATEMENT EXECUTE FUNCTION impedir_alteracao_doacao();

-- ===== Dados de demonstração (senha de todos: 123456) =====
-- CNPJs numéricos sintéticos com dígitos verificadores, sem consulta cadastral.
-- Coordenadas aproximadas de bairros de Campo Grande/MS
INSERT INTO usuarios (nome, email, senha_hash, perfil, cnpj, bairro, localizacao,
                      endereco, responsavel, telefone, aceite_termos_em, termos_versao) VALUES
 ('Supermercado Comper - Centro','comper@demo.com', crypt('123456', gen_salt('bf')),'doador','00000001000136','Centro',
   ST_SetSRID(ST_MakePoint(-54.6201,-20.4697),4326)::geography,
   'Rua Exemplo, 100 (fictício)', 'Responsável Demo Comper', '6733330001', now(), '2026-10-v1'),
 ('Restaurante Sabor MS','sabor@demo.com', crypt('123456', gen_salt('bf')),'doador','00000002000180','Jardim dos Estados',
   ST_SetSRID(ST_MakePoint(-54.5870,-20.4540),4326)::geography,
   'Rua Exemplo, 200 (fictício)', 'Responsável Demo Sabor', '6733330002', now(), '2026-10-v1'),
 ('Padaria Pão Nosso','pao@demo.com', crypt('123456', gen_salt('bf')),'doador','00000003000125','Monte Castelo',
   ST_SetSRID(ST_MakePoint(-54.5953,-20.4553),4326)::geography,
   'Rua Exemplo, 300 (fictício)', 'Responsável Demo Pão Nosso', '6733330003', now(), '2026-10-v1'),
 ('Casa de Apoio Esperança','esperanca@demo.com', crypt('123456', gen_salt('bf')),'receptora','00000004000170','Monte Castelo',
   ST_SetSRID(ST_MakePoint(-54.5960,-20.4570),4326)::geography,
   'Rua Exemplo, 400 (fictício)', 'Responsável Demo Esperança', '6733330004', now(), '2026-10-v1'),
 ('Cozinha Solidária Amambai','amambai@demo.com', crypt('123456', gen_salt('bf')),'receptora','00000005000114','Amambai',
   ST_SetSRID(ST_MakePoint(-54.6070,-20.4830),4326)::geography,
   'Rua Exemplo, 500 (fictício)', 'Responsável Demo Amambai', '6733330005', now(), '2026-10-v1'),
 ('Associação Longe Demais','longe@demo.com', crypt('123456', gen_salt('bf')),'receptora','00000006000169','Distrito distante',
   ST_SetSRID(ST_MakePoint(-54.9000,-20.9000),4326)::geography,
   'Rua Exemplo, 600 (fictício)', 'Responsável Demo Longe', '6733330006', now(), '2026-10-v1');

-- retirada_ate = fim do dia da validade (00:00 do dia seguinte, horário de Campo Grande).
INSERT INTO lotes (doador_id, alimento, categoria, quantidade_kg, validade, retirada_ate)
SELECT doador_id, alimento, categoria, kg, validade, ((validade + 1)::timestamp AT TIME ZONE 'America/Campo_Grande')
  FROM (VALUES
 (2,'Marmitas do dia','Refeições prontas',18, (now() AT TIME ZONE 'America/Campo_Grande')::date),
 (3,'Pães e panificados','Panificados',8,      (now() AT TIME ZONE 'America/Campo_Grande')::date + 1),
 (1,'Frutas variadas','Hortifrúti',50,         (now() AT TIME ZONE 'America/Campo_Grande')::date + 2),
 (1,'Iogurtes e queijos','Laticínios',15,      (now() AT TIME ZONE 'America/Campo_Grande')::date + 4)
  ) AS v(doador_id, alimento, categoria, kg, validade);

INSERT INTO eventos_lote (lote_id, tipo, usuario_id)
SELECT id, 'publicado', doador_id FROM lotes;

-- Histórico de 30 dias: 16 doações entregues, com lote, eventos e comprovante coerentes com o
-- fluxo atual (checklist completo, JSON canônico v1 e SHA-256 conferíveis em /verificar/:hash).
-- Datas relativas a hoje (America/Campo_Grande), sempre no passado: os indicadores começam com números.
-- Os lotes 1 a 4 acima permanecem os primeiros; o histórico recebe ids a partir do 5.
WITH h(n, doador_id, receptor_id, alimento, categoria, kg, dias, hora) AS (VALUES
  ( 1, 1, 4, 'Frutas variadas',     'Hortifrúti',         42.00, 30,  9),
  ( 2, 2, 5, 'Marmitas do dia',     'Refeições prontas',  20.00, 28, 14),
  ( 3, 3, 4, 'Pães e panificados',  'Panificados',         9.50, 26,  8),
  ( 4, 1, 5, 'Legumes e verduras',  'Hortifrúti',         35.00, 24, 10),
  ( 5, 2, 4, 'Arroz e feijão',      'Refeições prontas',  25.00, 22, 13),
  ( 6, 3, 5, 'Pães e panificados',  'Panificados',        12.00, 20,  8),
  ( 7, 1, 4, 'Iogurtes e queijos',  'Laticínios',         18.00, 18, 11),
  ( 8, 2, 5, 'Marmitas do dia',     'Refeições prontas',  16.00, 16, 14),
  ( 9, 1, 5, 'Frutas variadas',     'Hortifrúti',         50.00, 14,  9),
  (10, 3, 4, 'Pães e panificados',  'Panificados',         7.50, 12,  8),
  (11, 2, 4, 'Marmitas do dia',     'Refeições prontas',  22.00, 10, 14),
  (12, 1, 5, 'Legumes e verduras',  'Hortifrúti',         30.00,  8, 10),
  (13, 3, 5, 'Pães e panificados',  'Panificados',        11.00,  6,  8),
  (14, 1, 4, 'Iogurtes e queijos',  'Laticínios',         14.00,  4, 11),
  (15, 2, 5, 'Arroz e feijão',      'Refeições prontas',  28.00,  2, 13),
  (16, 1, 4, 'Frutas variadas',     'Hortifrúti',         38.00,  1,  9)
), t AS (
  SELECT h.*, lpad(((n * 104729) % 1000000)::text, 6, '0') AS codigo,
         (((now() AT TIME ZONE 'America/Campo_Grande')::date - dias) + hora * interval '1 hour')
           AT TIME ZONE 'America/Campo_Grande' AS entrega
    FROM h
), l AS (
  INSERT INTO lotes (doador_id, alimento, categoria, quantidade_kg, validade, status, reservado_por, reservado_em,
                     codigo, janela_inicio, janela_fim, retirada_ate, criado_em)
  SELECT doador_id, alimento, categoria, kg, (entrega AT TIME ZONE 'America/Campo_Grande')::date, 'entregue', receptor_id,
         entrega - interval '2 hours', codigo, entrega - interval '1 hour', entrega + interval '30 minutes',
         entrega + interval '2 hours', entrega - interval '5 hours'
    FROM t ORDER BY n
  RETURNING id, codigo
), ev AS (
  INSERT INTO eventos_lote (lote_id, tipo, usuario_id, criado_em)
  SELECT l.id, e.tipo,
         CASE e.tipo WHEN 'reservado' THEN t.receptor_id ELSE t.doador_id END,
         t.entrega - e.antes
    FROM l JOIN t USING (codigo)
   CROSS JOIN (VALUES ('publicado', interval '5 hours'), ('reservado', interval '2 hours'),
                      ('entregue', interval '0')) AS e(tipo, antes)
), c AS (
  SELECT l.id AS lote_id, t.*, d.nome AS d_nome, d.cnpj AS d_cnpj, r.nome AS r_nome, r.cnpj AS r_cnpj,
         to_char(t.entrega AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS instante
    FROM l JOIN t USING (codigo)
    JOIN usuarios d ON d.id = t.doador_id
    JOIN usuarios r ON r.id = t.receptor_id
), j AS (
  SELECT c.*,
    '{"alimento":' || to_json(alimento)::text ||
    ',"checklist":{"dentro_validade":true,"embalagem_integra":true,"temperatura_adequada":true}' ||
    ',"codigo":"' || codigo || '","data_hora":"' || instante || '"' ||
    ',"doador":{"cnpj":"' || d_cnpj || '","id":' || doador_id || ',"nome":' || to_json(d_nome)::text || '}' ||
    ',"lote_id":' || lote_id || ',"quantidade_kg":"' || kg::text || '"' ||
    ',"receptora":{"cnpj":"' || r_cnpj || '","id":' || receptor_id || ',"nome":' || to_json(r_nome)::text || '}' ||
    ',"versao":1}' AS canonico
    FROM c
)
INSERT INTO doacoes (lote_id, doador_id, receptor_id, alimento, quantidade_kg, codigo, data_hora, checklist, comprovante, hash)
SELECT lote_id, doador_id, receptor_id, alimento, kg, codigo, entrega,
       '{"embalagem_integra":true,"temperatura_adequada":true,"dentro_validade":true}'::jsonb,
       canonico::jsonb, encode(sha256(convert_to(canonico, 'UTF8')), 'hex')
  FROM j;

-- Reserva perto de expirar (Padaria Pão Nosso → Casa de Apoio Esperança): a janela termina em 25 min.
-- Passada a tolerância do fim da janela, a primeira consulta de lotes devolve o lote às receptoras.
-- Instantes relativos à criação do banco: em um banco antigo a reserva já terá sido liberada.
WITH reserva AS (
  INSERT INTO lotes (doador_id, alimento, categoria, quantidade_kg, validade, status, reservado_por, reservado_em,
                     codigo, janela_inicio, janela_fim, retirada_ate, criado_em)
  VALUES (3, 'Bolos e roscas', 'Panificados', 6, (now() AT TIME ZONE 'America/Campo_Grande')::date + 1,
          'reservado', 4, now() - interval '90 minutes', '482915',
          now() - interval '90 minutes', now() + interval '25 minutes',
          (((now() AT TIME ZONE 'America/Campo_Grande')::date + 2)::timestamp AT TIME ZONE 'America/Campo_Grande'),
          now() - interval '3 hours')
  RETURNING id
), ev AS (
  INSERT INTO eventos_lote (lote_id, tipo, usuario_id, criado_em)
  SELECT id, 'publicado', 3, now() - interval '3 hours' FROM reserva
  UNION ALL
  SELECT id, 'reservado', 4, now() - interval '90 minutes' FROM reserva
)
INSERT INTO notificacoes (usuario_id, lote_id, tipo, urgente, mensagem, criado_em)
SELECT 3, id, 'lote_reservado', false, 'Casa de Apoio Esperança reservou o lote: Bolos e roscas.', now() - interval '90 minutes'
  FROM reserva;
