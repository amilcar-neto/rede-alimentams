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
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_usuarios_geo ON usuarios USING GIST (localizacao);

CREATE TABLE lotes (
  id             SERIAL PRIMARY KEY,
  doador_id      INT NOT NULL REFERENCES usuarios(id),
  alimento       TEXT NOT NULL,
  categoria      TEXT NOT NULL,
  quantidade_kg  NUMERIC(10,2) NOT NULL CHECK (quantidade_kg > 0),
  validade       DATE NOT NULL,
  status         TEXT NOT NULL DEFAULT 'disponivel'
                 CHECK (status IN ('disponivel','reservado','entregue')),
  reservado_por  INT REFERENCES usuarios(id),
  reservado_em   TIMESTAMPTZ,
  codigo         CHAR(6),
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE doacoes (
  id           SERIAL PRIMARY KEY,
  lote_id      INT NOT NULL REFERENCES lotes(id),
  doador_id    INT NOT NULL REFERENCES usuarios(id),
  receptor_id  INT NOT NULL REFERENCES usuarios(id),
  alimento     TEXT NOT NULL,
  quantidade_kg NUMERIC(10,2) NOT NULL,
  codigo       CHAR(6) NOT NULL,
  data_hora    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== Dados de demonstração (senha de todos: 123456) =====
-- CNPJs numéricos sintéticos com dígitos verificadores, sem consulta cadastral.
-- Coordenadas aproximadas de bairros de Campo Grande/MS
INSERT INTO usuarios (nome, email, senha_hash, perfil, cnpj, bairro, localizacao) VALUES
 ('Supermercado Comper - Centro','comper@demo.com', crypt('123456', gen_salt('bf')),'doador','00000001000136','Centro',
   ST_SetSRID(ST_MakePoint(-54.6201,-20.4697),4326)::geography),
 ('Restaurante Sabor MS','sabor@demo.com', crypt('123456', gen_salt('bf')),'doador','00000002000180','Jardim dos Estados',
   ST_SetSRID(ST_MakePoint(-54.5870,-20.4540),4326)::geography),
 ('Padaria Pão Nosso','pao@demo.com', crypt('123456', gen_salt('bf')),'doador','00000003000125','Monte Castelo',
   ST_SetSRID(ST_MakePoint(-54.5953,-20.4553),4326)::geography),
 ('Casa de Apoio Esperança','esperanca@demo.com', crypt('123456', gen_salt('bf')),'receptora','00000004000170','Monte Castelo',
   ST_SetSRID(ST_MakePoint(-54.5960,-20.4570),4326)::geography),
 ('Cozinha Solidária Amambai','amambai@demo.com', crypt('123456', gen_salt('bf')),'receptora','00000005000114','Amambai',
   ST_SetSRID(ST_MakePoint(-54.6070,-20.4830),4326)::geography),
 ('Associação Longe Demais','longe@demo.com', crypt('123456', gen_salt('bf')),'receptora','00000006000169','Distrito distante',
   ST_SetSRID(ST_MakePoint(-54.9000,-20.9000),4326)::geography);

INSERT INTO lotes (doador_id, alimento, categoria, quantidade_kg, validade) VALUES
 (2,'Marmitas do dia','Refeições prontas',18, (now() AT TIME ZONE 'America/Campo_Grande')::date),
 (3,'Pães e panificados','Panificados',8,      (now() AT TIME ZONE 'America/Campo_Grande')::date + 1),
 (1,'Frutas variadas','Hortifrúti',50,         (now() AT TIME ZONE 'America/Campo_Grande')::date + 2),
 (1,'Iogurtes e queijos','Laticínios',15,      (now() AT TIME ZONE 'America/Campo_Grande')::date + 4);
