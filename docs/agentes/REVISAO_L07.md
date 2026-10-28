# Revisão independente — L07 (Pronto para o VPS, sem tocar no VPS)

- Data: 28/10/2026. Revisor: claude (fase review), sem subagentes. Branch `lote/L07` (HEAD `32aecc8`), diff `main..HEAD`.
- Escopo revisado: `.env.example`, `backend/src/server.js`, `backend/test/08-saude.test.mjs`, `deploy/Caddyfile`, `docker-compose.prod.yml`, `docs/DEPLOY.md`, `docs/agentes/LOG.md`, `docs/agentes/progresso/L07.md`.
- Nenhum acesso ao VPS, DNS ou rede externa. Nenhum arquivo além deste relatório foi alterado.

## Resultado

**Aprovado (ready)**: nenhum impedimento crítico ou alto. Há 1 achado médio e 3 baixos, listados abaixo como correções recomendadas. Nenhum deles bloqueia a integração, mas o achado M1 deve ser corrigido antes de o grupo depender da restauração do backup.

## Critérios do plano (seção L07)

| Requisito | Situação | Evidência |
|---|---|---|
| `GET /saude` → `{ ok, banco }` | OK | `server.js:32-40`; teste 200 e 503 sem detalhes; navegador: `{"ok":true,"banco":true}` |
| `trust proxy` | OK | `server.js:16` (`1`: um único proxy; o Caddy sobrescreve `X-Forwarded-For`) |
| `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, sem CSP | OK | `server.js:18-25`, antes do `static`; conferido em `/saude`, `/` e `/lotes` (401) no navegador e no teste |
| Compose com `db`, `app`, `caddy`; só o Caddy expõe portas | OK | `docker compose -f docker-compose.prod.yml --env-file .env.example config` (código 0): `ports` só no caddy — 80/tcp, 443/tcp, 443/udp |
| Variáveis do `.env`, volume persistente, `restart: unless-stopped` | OK | `docker-compose.prod.yml:9-11,27-28,49,15,58-61` e `restart` nos três serviços |
| Caddyfile com `{$DOMINIO}`, proxy `app:3000`, compressão | OK (sem `caddy validate`) | `deploy/Caddyfile:3-6`; Caddy não instalado localmente |
| `.env.example` só com placeholders | OK | valores `troque-...` e `app.exemplo.com.br`; `.gitignore` ignora `.env` e `.env.*` exceto o exemplo |
| `DEPLOY.md` (DNS A, firewall 22/80/443, subir, logs, `pg_dump`, seção de Redes) | OK, com ressalva M1 | `docs/DEPLOY.md` passos 1–9 e "O que isto tem de Redes" |
| Teste lê o compose e confirma ausência de `5432:`/`3000:` | OK | `08-saude.test.mjs:76-95` (regex + análise do bloco `ports` por serviço) |
| Verificação de segredos | OK | ver seção própria |

## Achados

### M1 — Média — Restauração do backup não funciona no banco de produção como descrito
- Local: `docs/DEPLOY.md:107-112`.
- O texto manda restaurar "em um banco vazio", mas não diz como obtê-lo. No compose de produção o `db/init.sql` roda na primeira subida e cria tabelas (`db/init.sql:4,17,32`, `CREATE TABLE` sem `IF NOT EXISTS`) e dados de demonstração. Um `pg_dump` simples (sem `--clean`) aplicado com `psql` sobre esse banco gera `relation ... already exists` e o `COPY` de `usuarios`/`lotes` falha por chave duplicada nos ids demo; como o `psql` segue sem `ON_ERROR_STOP`, a restauração parece concluída mas os dados não voltam.
- Correção sugerida: gerar o backup com `pg_dump --clean --if-exists` (ou `-Fc` + `pg_restore --clean --if-exists`), ou documentar a recriação do banco antes do `psql` (ex.: `dropdb`/`createdb` dentro do contêiner, ou volume novo) e usar `psql -v ON_ERROR_STOP=1`. Ajustar o teste do DEPLOY.md se a instrução mudar.

### B1 — Baixa — Documentação contradiz a evidência do lote
- Local: `docs/DEPLOY.md:177-178` diz que o compose não foi validado por `docker compose config`; `docs/agentes/progresso/L07.md` (Evidências) e esta revisão executaram `docker compose config` com sucesso. Só `caddy validate` não foi executado.
- Correção: ajustar a frase para "o compose foi renderizado por `docker compose config` localmente; o Caddyfile não foi validado por `caddy validate`".

### B2 — Baixa — Arquivo de backup gerado dentro do clone do repositório
- Local: `docs/DEPLOY.md:104` grava `backup-$(date +%F).sql` no diretório do repositório; `.gitignore` não cobre `*.sql`/`backup-*`. Um `git add .` no VPS poderia versionar dados de usuários.
- Correção: gravar fora do clone (ex.: `~/backups/`) ou incluir `backup-*.sql` no `.gitignore`.

### B3 — Baixa — `/saude` sem limite de tempo próprio para o banco
- Local: `backend/src/server.js:35` usa o `Pool` sem `connectionTimeoutMillis`; se o banco ficar inalcançável sem recusa de conexão, a requisição pode demorar até o timeout de TCP em vez de responder 503. O healthcheck do Docker (timeout 3 s) mitiga dentro do compose.
- Correção opcional: timeout curto na verificação (ex.: `connectionTimeoutMillis` no pool ou `Promise.race`).

### Observações (sem correção exigida neste lote)
- `backend/Dockerfile` (fora do diff) usa `npm install` sem copiar o `package-lock.json`: build de produção não reprodutível. Registrar para lote futuro.
- Contas demo com senha conhecida no `init.sql`: corretamente sinalizado como [GRUPO] em `docs/DEPLOY.md` §9.
- WebSocket ainda não existe no código; o DEPLOY.md descreve o Upgrade no proxy sem afirmar teste.

## Qualidade dos testes

- `08-saude.test.mjs` cobre 200 e 503 reais (servidor temporário em 3101 com banco inexistente, sem vazar detalhes), cabeçalhos em rota JSON pública, estática e 401, ausência de CSP, portas por serviço (incluindo bloqueio de `- "5432"` sem host via `portasPublicadas`), `restart`, volume, origem `${VAR}` das credenciais, `.env.example` e `.gitignore`. Os testes de compose/DEPLOY são textuais (YAML com indentação de 2 espaços); suficiente para o aceite, complementado aqui pelo `docker compose config`.
- Não foi detectado afrouxamento de testes existentes.

## Verificação de segredos

- `rg` não instalado; usada a ferramenta Grep (ripgrep) com padrões `password|senha|secret|segredo|token|api key|BEGIN ... KEY|postgres://|IPv4|ghp_|sk-|AKIA`, excluindo `node_modules`, `.agentes/`, `scripts/` e `docs/agentes/`.
- Resultados revisados: placeholders `troque-...` (`.env.example`), referências `${VAR}` (`docker-compose.prod.yml`), credenciais locais de dev/teste já existentes (`docker-compose.yml`, `docker-compose.test.yml` em 127.0.0.1), senha demo `123456` documentada, segredos fictícios dos testes. Nenhum domínio, IP de VPS ou chave real.
- `git ls-files`: único arquivo `.env*` versionado é `.env.example`; nenhum `.pem/.key/.pfx`. Ausência de domínio específico não foi tomada como prova de segurança.

## Execuções desta revisão

- `npm.cmd test` em `backend/` (banco descartável `alimentams_test`): **74 tests / 74 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo**, duration_ms 14374.8589.
- `docker compose -f docker-compose.prod.yml --env-file .env.example config`: código 0; portas publicadas apenas no `caddy` (80/tcp, 443/tcp, 443/udp). Nada foi subido.
- Navegador (Claude in Chrome): `node backend/src/server.js` em segundo plano na porta 3000 (DATABASE_URL do banco de testes). `http://localhost:3000/saude` exibiu `{"ok":true,"banco":true}`; via `fetch` na página, `/saude` 200, `/` 200 e `/lotes` 401 trouxeram `nosniff`, `strict-origin-when-cross-origin`, `DENY` e nenhum CSP. Tela de login renderizou e o link "Cadastre-se" (handler inline) abriu o formulário "Criar conta", confirmando que os cabeçalhos não quebram o front. Nenhum formulário enviado. Aba fechada e servidor encerrado. Sem prints salvos em disco.
- Não executado: `caddy validate` (Caddy ausente), qualquer teste no VPS (DNS, TLS, firewall, WebSocket).

## Próximo passo

Integrar o L07. Em seguida (mesmo lote de ajuste ou lote de documentação), corrigir M1 e, se possível, B1–B3. O grupo executa o DEPLOY.md no VPS e registra o resultado do passo 5.
