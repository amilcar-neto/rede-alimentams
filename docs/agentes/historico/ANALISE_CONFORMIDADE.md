# Análise de conformidade — Rede AlimentaMS × documentação

> Data da análise: 27/10/2026 · Entrega final (MVP + Relatório Técnico): **29/10/2026** · Apresentação: 03–06/11/2026
> Documentos de referência: `docs/02 e 01i DAC 262 TADS 26B.pdf` (Plano de Aprendizagem / DAC) e `docs/DAC_Etapa_4.docx` (definição da solução).

---

## 1. Resumo

**O fluxo principal funciona de ponta a ponta e foi testado rodando de verdade** (publicar lote → ONG próxima vê → reserva com código de 6 dígitos → doador confirma → doação registrada → indicadores atualizam). O raio de 10 km via PostGIS, o RBAC, a reserva atômica (só 1 ONG vence a disputa) e o Cenário 3 de carga passaram.

Porém o projeto **cobre cerca de 40–45% do que a Etapa 4 promete**. As maiores distâncias entre doc e código:

| # | Prometido na Etapa 4 | Situação |
|---|---|---|
| 1 | Frontend em **React / React Native (PWA)**, backend em **TypeScript** | HTML + JS puro num único arquivo; backend em JS puro |
| 2 | **QR Code** na retirada (Fluxo 4 e Cenário 1) | Só código numérico |
| 3 | **Notificação** push/e-mail/WebSocket de novos lotes (Fluxo 3 e Cenário 1) | Não existe |
| 4 | **Comprovante Digital de Doação** (Fluxo 5, KPI "100% de comprovantes") | Só uma linha na tabela "Doações registradas" |
| 5 | **Foto do lote**, horário de retirada, kg **ou unidades** (Fluxo 2) | Só alimento, categoria, kg, data |
| 6 | **Validação de CNPJ** + aprovação de perfil (Fluxo 1) | CNPJ é texto livre, sem validação; sem aprovação |
| 7 | **Expiração da reserva (1 h) e redirecionamento** para a próxima ONG (Riscos) | Reserva nunca expira |
| 8 | **Painel administrativo** / KPIs TMR e TEC (Seção 6.1) | Não existe perfil admin; KPIs não calculados |

Há também **9 bugs de validação** (5 deles derrubam a rota com erro 500) e **1 bug de regra de negócio sério**: é possível confirmar como "doado" um lote já vencido (seção 4).

**Recomendação geral:** não tentar migrar para React/TypeScript em 2 dias. Corrigir os bugs, implementar os itens de maior impacto na demonstração (QR Code, comprovante, expiração de reserva, foto, notificação simples) e **ajustar o Relatório Técnico** para descrever honestamente a stack real e listar o resto como "melhorias futuras" — o próprio plano da DAC pede seção de "limitações e melhorias futuras".

---

## 2. Como foi testado

Docker Desktop não funciona nesta máquina (o kernel do WSL 2 não está instalado e o `wsl --update` exige administrador). O projeto foi testado **sem Docker e sem admin**:

- PostgreSQL 16 portátil (pacote npm `@embedded-postgres/windows-x64` 16.13) + PostGIS 3.6.2 (bundle oficial do osgeo), rodando como processo do usuário na **porta 5433** (não mexe no PostgreSQL 18 já instalado na máquina, que não tem PostGIS).
- `db/init.sql` carregado sem erros; backend rodando com Node 22 em `localhost:3000`.
- Script de testes E2E da API: **`docs/testes/e2e-api.mjs`** (48 verificações; cobre os Cenários 1, 2 e 3 do doc + casos de borda). Rodar com `node docs/testes/e2e-api.mjs` com o servidor no ar e o banco recém-criado.
- Smoke test do frontend: página carrega (200), `/bairros` responde, JS sem erro de sintaxe. **Não foi feito teste clicando na interface** (sem navegador automatizado) — os fluxos foram exercitados pela API que o frontend usa.

Receita para rodar local sem Docker está no **Apêndice A**.

---

## 3. Resultado dos testes (39/48 passaram)

### Cenário 1 — E2E hortifrúti 50 kg (Comper/Centro → Monte Castelo e Amambai): ✅ fluxo OK, ❌ partes do roteiro do doc ausentes

| Verificação | Resultado |
|---|---|
| Publicar lote de 50 kg | ✅ |
| Lote visível para ONG Monte Castelo (2,9 km) e Amambai (2,0 km) | ✅ |
| Ordenação por validade e depois distância | ✅ |
| ONG fora do raio (`longe@demo.com`) não vê nem consegue reservar | ✅ |
| Reserva gera código de 6 dígitos; 2ª ONG não consegue reservar | ✅ |
| Código só visível para a ONG que reservou | ✅ |
| Outro doador / código errado não confirmam; confirmar 2× não duplica | ✅ |
| Doação registrada para doador e receptora; indicadores +50 kg | ✅ |
| "Verificação da **notificação imediata** para duas ONGs" | ❌ não existe notificação |
| "Leitura simulada de **QR Code**" | ❌ não existe QR Code |

### Cenário 2 — Regras de negócio (data retroativa / quantidade zerada): ✅ o que o doc pede passa, ❌ bordas falham

| Entrada | Esperado | Obtido |
|---|---|---|
| qtd 0, negativa, texto, vazia | 400 | ✅ 400 |
| validade ontem | 400 | ✅ 400 |
| validade `30/10/2026` (formato BR) | 400 | ✅ 400 |
| sem alimento | 400 | ✅ 400 |
| validade hoje | 201 | ✅ 201 (obs.: doc diz "posterior ao momento atual") |
| validade `2026-02-31` (data inexistente) | 400 | ❌ **500** |
| alimento numérico (`123`) | 400 | ❌ **500** |
| quantidade `1e12` (estoura `NUMERIC(10,2)`) | 400 | ❌ **500** |
| alimento só com espaços | 400 | ❌ 201 (lote com nome vazio) |
| categoria arbitrária (`"qualquer coisa"`) | 400 | ❌ 201 |

### Cadastro / robustez

| Verificação | Resultado |
|---|---|
| Cadastro OK, e-mail duplicado 409, senha curta 400, perfil inválido 400 | ✅ |
| CNPJ inválido (`"123"`) rejeitado | ❌ aceito |
| E-mail inválido (`"naoeemail"`) rejeitado | ❌ aceito |
| Senha enviada como número | ❌ **500** |
| `PUT /lotes/abc/reservar` (id não numérico) | ❌ **500** |
| Login com body vazio | ✅ 401 |

### Cenário 3 — 20 requisições simultâneas de busca e reserva: ✅

- 10 buscas + 10 reservas concorrentes no mesmo lote: **sem erros 5xx, exatamente 1 reserva venceu**, 391 ms no total.
- Extra: 200 `GET /lotes` simultâneos, todos 200, 810 ms.
- ⚠️ O doc fala em "via script de teste" — **não havia script no repositório**; agora há `docs/testes/e2e-api.mjs`, que serve de evidência para o relatório.

---

## 4. Bugs encontrados

| Sev. | Onde | Problema | Como reproduzir |
|---|---|---|---|
| **Alta** | `backend/src/server.js:148-175` | **Reserva nunca expira e lote vencido pode ser confirmado como doado.** O `UPDATE` de confirmação não checa validade; não há job/regra que libere reservas antigas. Contradiz a mitigação de risco "prazo de 1 h + redirecionamento" e cria problema sanitário (registro de doação de alimento vencido). | Lote reservado há 2 dias com validade de ontem → `confirmar-retirada` retorna 200. |
| Média | `server.js:133-136` | Data inexistente (`2026-02-31`) passa no regex e no `new Date` do JS (que "rola" para 03/03) e quebra no Postgres → 500. | `POST /lotes` com `validade: "2026-02-31"` |
| Média | `server.js:131,141` | `alimento.trim()` em valor não-string → 500; alimento só com espaços é aceito (verificação é feita antes do `trim`). | `alimento: 123` ou `"   "` |
| Média | `server.js:130-132` | Sem limite superior de quantidade; valor ≥ 10⁸ estoura `NUMERIC(10,2)` → 500. | `quantidade_kg: 1e12` |
| Média | `server.js:158` / `:175` | `:id` não numérico vai direto ao SQL → erro de cast → 500. | `PUT /lotes/abc/reservar` |
| Média | `server.js:62-69` | Cadastro sem validar tipos: senha numérica → `bcrypt.hash` lança → 500; e-mail sem formato; CNPJ sem validação (doc promete "validação automatizada de CNPJ"). | `senha: 12345678`, `email: "x"`, `cnpj: "123"` |
| Baixa | `server.js:131` | Categoria é texto livre no servidor (o `<select>` do front não protege a API). | `categoria: "qualquer"` |
| Baixa | `server.js:104` + `public/index.html:217` | Doador continua vendo lotes vencidos como disponíveis, com a etiqueta **"vence hoje"** mesmo quando venceram dias atrás (`dias <= 0`). | Deixar um lote do seed passar da validade. |
| Baixa | `public/index.html:271` | Data padrão "amanhã" é calculada em UTC: depois das 20h em Campo Grande vira "depois de amanhã". | Abrir "Publicar lote" após 20h. |
| Baixa | `public/index.html:208-212` | API devolve `entidades` beneficiadas (KPI citado no Fluxo 5), mas o painel não exibe. | — |
| Baixa | `server.js:14` | Se `JWT_SECRET` não estiver definido, usa segredo fixo no código. `docker-compose.yml` usa `troque-este-segredo`. | — |
| Info | `server.js` (geral) | Corpo JSON malformado devolve a página de erro HTML padrão do Express em vez de `{erro}`. | — |

---

## 5. Matriz de conformidade com a Etapa 4

Legenda: ✅ atende · 🟡 parcial · ❌ não atende

### 5.1 Módulos (Seção 1.1)

| Módulo | Status | Observação |
|---|---|---|
| Doador: cadastro, publicação de lotes | 🟡 | Sem foto, sem horário de retirada, sem unidades (só kg). |
| Doador: comprovante digital + histórico p/ Selo Doador (Lei 15.224/2025) | 🟡 | Há histórico em tabela; **não há comprovante** (PDF/página imprimível). |
| Receptora: interface mobile-friendly | ✅ | Layout responsivo funciona. |
| Receptora: raio de proximidade **configurável** | 🟡 | Raio fixo de 10 km no código (`RAIO_METROS`). |
| Receptora: **notificação** de novos lotes | ❌ | Precisa recarregar a página. |
| Receptora: reserva | ✅ | Atômica, testada sob concorrência. |
| Receptora: **agendamento de horário** de coleta | ❌ | |
| Logístico: distâncias via PostGIS, prioriza validade e proximidade | ✅ | `ST_DWithin` + `ST_Distance`, ordenação correta. |
| Gestão: dashboard kg / refeições / CO₂e / água | ✅ | Fatores demonstrativos, com nota explicativa (bom). |
| Gestão: **painel administrativo** e relatório auditável | ❌ | Não há perfil admin; indicadores são globais e iguais para todos. |

### 5.2 Stack (Seção 2.1)

| Camada | Doc | Real | Status |
|---|---|---|---|
| Frontend | React / React Native (PWA) | HTML + JS puro (`public/index.html`), sem manifest/service worker | ❌ |
| Backend | Node.js **TypeScript** + Express | Node.js **JavaScript** + Express | 🟡 |
| Banco | PostgreSQL + PostGIS | PostgreSQL 16 + PostGIS 3.4 | ✅ |
| Infra | Docker + Linux + Vercel/Render | Docker Compose (Linux/Alpine); sem deploy em nuvem | 🟡 |

### 5.3 Articulação com disciplinas (Seção 2.2)

| Disciplina | Promessa | Evidência no código |
|---|---|---|
| Algoritmos e Programação | validação de datas, estruturas, exceções, endpoints REST | ✅ presente (com os bugs da seção 4) |
| Redes | HTTP/REST/JSON ✅; **WebSockets** ❌; **TLS** ❌ | 🟡 |
| Sistemas Operacionais | Docker/Linux ✅, variáveis de ambiente ✅, concorrência ✅ (reserva atômica, pool de conexões) | ✅ |
| Arquitetura de Computadores | otimização de memória/CPU, E/S, dimensionamento | 🟡 só argumentável no relatório (índice GIST, pool); nada medido |

### 5.4 Arquitetura 3 camadas e banco (Seção 3.1)

- 3 camadas: ✅ (front estático → API Express → PostgreSQL).
- "Tabelas de usuários, estabelecimentos, doações, **agendamentos, avaliações e logs**": 🟡 existem `usuarios`, `lotes`, `doacoes`. Faltam agendamentos, avaliações e logs.
- "Emissão dos comprovantes digitais" no backend: ❌.

### 5.5 Segurança e LGPD (Seção 3.2)

| Item | Status |
|---|---|
| RBAC com JWT, expiração reduzida | ✅ (8 h; perfis doador/receptora testados) |
| "Armazenamento seguro no cliente" | 🟡 token em `localStorage` |
| bcrypt com salt | ✅ |
| HTTPS / TLS 1.3 | ❌ (aceitável num MVP local; citar no relatório) |
| Logs auditáveis **imutáveis** (data, doador, receptor, lote, código) | 🟡 `doacoes` grava tudo isso, mas a tabela pode ser alterada (sem trigger/append-only) |
| LGPD (consentimento, termo) | ❌ sem termo de uso/consentimento no cadastro |

### 5.6 Fluxos (Seção 4)

| Fluxo | Passo | Status |
|---|---|---|
| 1 Cadastro | CNPJ, razão social, bairro, e-mail | 🟡 sem endereço/responsável; bairro em lista fixa de 7 |
| | Validação automatizada de CNPJ | ❌ |
| | Comprovante de entidade sem fins lucrativos (ONG) | ❌ |
| | Aprovação do perfil antes de liberar acesso | ❌ acesso imediato |
| 2 Publicação | Categoria, quantidade, data limite | ✅ |
| | Quantidade em **unidades** e **horário** limite de retirada | ❌ |
| | **Foto** do lote | ❌ |
| | Validar vencimento posterior ao momento atual | ✅ (aceita "hoje") |
| 3 Geolocalização/reserva | Raio de 10 km | ✅ |
| | Raio expansível para lotes volumosos | ❌ |
| | Alerta push/e-mail às ONGs mais próximas | ❌ |
| | Primeira ONG aceita → status Reservado | ✅ |
| 4 Retirada | Janela de agendamento | ❌ |
| | Código de 6 dígitos | ✅ |
| | **QR Code** e leitura pelo doador | ❌ |
| | Confirmação registrada no sistema | ✅ |
| 5 Conclusão | Status Entregue | ✅ |
| | Comprovante Digital assinado eletronicamente | ❌ |
| | Indicadores (kg, CO₂e, entidades) atualizados em tempo real | 🟡 atualizam ao navegar; "entidades" não aparece na tela |

### 5.7 Riscos e mitigações (Seção 5)

| Risco | Mitigação prometida | Status |
|---|---|---|
| Conectividade | PWA offline + código numérico estático | 🟡 código numérico ✅, PWA offline ❌ |
| Demora na retirada | Prazo de 1 h + redirecionar para próxima ONG | ❌ (e é o bug de severidade alta) |
| Sanitário | Termo de responsabilidade no cadastro + checklist visual na baixa | ❌ |
| Engajamento | Campanha piloto | n/a (não é código) |

### 5.8 Validação (Seção 6)

| KPI | Status |
|---|---|
| TMR (publicação → reserva) | 🟡 dados existem (`criado_em`, `reservado_em`), mas não é calculado nem exibido |
| TEC (% lotes entregues sem perda) | ❌ não calculado; lotes vencidos não têm status próprio, então não dá para medir perda |
| Acurácia geográfica | ✅ testado (distâncias coerentes, fora do raio excluído) |
| 100% de comprovantes | ❌ não há comprovante |

---

## 6. Conformidade com o Plano de Aprendizagem (PDF da DAC)

| Exigência | Status |
|---|---|
| Problema real em MS, relação com sustentabilidade **na própria solução** | ✅ desperdício de alimentos em Campo Grande; indicadores de kg/CO₂e/água estão no produto |
| Entrega 1 — MVP funcional com as funcionalidades essenciais | ✅ fluxo principal demonstrável |
| Entrega 2 — **Relatório Técnico** (problema, justificativa, público, objetivos, pesquisa, requisitos, solução, tecnologias, arquitetura, desenvolvimento, **testes**, viabilidade, sustentabilidade, **limitações, melhorias futuras**, conclusão, referências) | ⚠️ **não está na pasta do projeto** — só a Etapa 4. Verificar onde está e se as seções de testes/limitações refletem o MVP real |
| Articular as 4 disciplinas | 🟡 ver 5.3 |
| Pré-entrega 3: "evidências dos testes" | 🟡 agora há `docs/testes/e2e-api.mjs` e os resultados da seção 3 |
| Critério "Qualidade técnica e funcionamento do MVP" (25%) | os 500 da seção 4 e a falta de QR/notificação/comprovante são o que a banca mais provavelmente vai notar |

---

## 7. Lacunas priorizadas para os 2 dias

Estimativas para alguém que já conhece a base; ajuste conforme a equipe.

### P0 — corrigir antes de qualquer coisa (≈ 2–3 h)
1. Todos os erros 500 da seção 4: validar tipos/strings (`typeof`, `trim` antes de checar vazio), id numérico, teto de quantidade, data real (validar no Postgres com tratamento de erro ou comparar componentes), senha/e-mail/categoria no servidor.
2. Validação de CNPJ (dígitos verificadores) — barato e está escrito no Fluxo 1.
3. Bloquear confirmação de lote vencido e **expirar reservas** (ex.: reserva com mais de 1 h ou lote vencido volta a `disponivel` / vira `expirado`). Pode ser feito na própria consulta (sem job), o que já atende a mitigação de risco do doc.
4. Status `expirado` (ou filtro) para lotes vencidos do doador; corrigir etiqueta "vence hoje".

### P1 — itens que o doc e o Cenário 1 citam explicitamente (≈ 1 dia)
5. **QR Code** do código de retirada (lib JS via CDN no front; doador pode digitar o código ou ler via câmera — leitura pode ser "simulada", como o próprio doc diz).
6. **Comprovante Digital de Doação** — página/print ou PDF com doador, CNPJ, entidade, lote, kg, data/hora, código e um hash (SHA-256) dos dados como "assinatura". Atende Fluxo 5 e o KPI de 100%.
7. **Notificação** simples de novos lotes: polling a cada X s ou Server-Sent Events/WebSocket (WebSocket reforça a disciplina de Redes).
8. **Foto do lote** (upload pequeno, guardado em disco ou base64 no banco) e **horário limite de retirada**.
9. Exibir "entidades beneficiadas", **TMR** e **TEC** no painel.
10. Termo de responsabilidade (checkbox) no cadastro + checklist sanitário na confirmação.

### P2 — só se sobrar tempo
11. Perfil **admin** com painel/relatório auditável e aprovação de cadastros.
12. Raio configurável pela ONG; quantidade em unidades.
13. PWA mínimo (manifest + service worker) — aproxima do "React Native (PWA)" sem reescrever.
14. Tabela de log append-only (trigger que impede UPDATE/DELETE em `doacoes`).

### Não recomendado no prazo
- Migrar para React e/ou TypeScript. Alto risco de quebrar o que funciona. Melhor registrar no relatório que a stack do MVP foi simplificada (HTML/JS + Express) e que React/TS ficam como evolução.
- Deploy HTTPS em nuvem — opcional; se fizerem, Render aceita Docker, mas exige PostGIS no banco gerenciado.

### Ajustes no Relatório Técnico (paralelo ao código)
- Atualizar stack real (Seção 2.1) e justificar a simplificação.
- Seção de testes com os resultados deste documento (Cenários 1–3) e do script.
- "Limitações e melhorias futuras" com tudo que ficar de fora da lista acima.
- Lei 15.224/2025: conferir número/data/ementa da lei citada antes de entregar.

---

## Apêndice A — Rodar local sem Docker e sem admin (Windows)

Usado nesta análise; útil também para os agentes que vão codar.

```bash
# 1) Baixar Postgres 16 portátil + PostGIS (uma vez)
mkdir pg && cd pg
curl -L -o pg.tgz https://registry.npmjs.org/@embedded-postgres/windows-x64/-/windows-x64-16.13.0-beta.16.tgz
curl -L -o postgis.zip https://download.osgeo.org/postgis/windows/pg16/postgis-bundle-pg16-3.6.2x64.zip
tar -xzf pg.tgz && unzip -q postgis.zip -d gis
cp -r gis/postgis-bundle-pg16-3.6.2x64/{bin,lib,share} package/native/

# 2) Criar e subir o banco na porta 5433
package/native/bin/initdb.exe -D data -U alimentams -A trust -E UTF8 --locale=C
package/native/bin/pg_ctl.exe -D data -l pg.log -o "-p 5433" -w start

# 3) Criar o banco e carregar o schema (o pacote portátil não traz psql;
#    usa o cliente do PostgreSQL 18 já instalado na máquina)
"/c/Program Files/PostgreSQL/18/bin/createdb.exe" -h localhost -p 5433 -U alimentams alimentams
"/c/Program Files/PostgreSQL/18/bin/psql.exe" -h localhost -p 5433 -U alimentams -d alimentams -f <projeto>/db/init.sql

# 4) Backend
cd <projeto>/backend && npm install
DATABASE_URL=postgres://alimentams@localhost:5433/alimentams JWT_SECRET=dev PORT=3000 node src/server.js

# 5) Testes (com banco recém-criado)
node <projeto>/docs/testes/e2e-api.mjs

# Parar o banco
package/native/bin/pg_ctl.exe -D data stop
# Zerar: parar, apagar a pasta data e repetir os passos 2–3
```

Observações:
- O banco usa autenticação `trust` (sem senha) — só para desenvolvimento local.
- O script E2E espera os dados do seed intactos; rode após recriar o banco.
- Para a apresentação, o `docker compose up --build` do README continua sendo o caminho oficial, mas **precisa de uma máquina com WSL 2 atualizado** (ou Linux/macOS). Testar isso antes de 03/11.
