# Rede AlimentaMS – MVP

Plataforma que conecta estabelecimentos doadores a entidades receptoras.
Stack: Node.js + Express, PostgreSQL + PostGIS, JWT + bcrypt, Docker.

![Tela da ONG: indicadores, lotes próximos e código de retirada com QR Code](docs/img/ong-lotes.png)

<sub>Tela da entidade receptora com os dados de demonstração (todos fictícios).</sub>

**Autores:** Amilcar Silva Neto e Paulo Roberto Ribeiro Dias. Projeto acadêmico do curso de Análise e Desenvolvimento de Sistemas da UCDB (Desafio de Articulação de Competências, 2026). Os dados de demonstração são todos fictícios.

**Desenvolvido com agentes de IA:** a implementação, os testes e as revisões foram feitos por Codex e Claude, com um controlador próprio (`agentes.cmd`, `scripts/agentes/`) que reveza entre os dois quando um chega no limite de uso e guarda o estado entre execuções. Cada lote deixa log, revisão e checklist. Nós definimos o escopo, as regras de negócio e os critérios de aceite, e validamos o resultado. Como funcionou: [docs/agentes/LEIA-ME.md](docs/agentes/LEIA-ME.md).

## Como rodar (3 passos)

Pré-requisito: **Docker Desktop** aberto (Windows/Mac) ou Docker + Compose (Linux). Primeira subida precisa de internet para baixar as imagens.

1. Na pasta do projeto: `docker compose up -d --build` (a primeira vez leva de 1 a 3 minutos).
2. Abra **http://localhost:3000**.
3. Entre com uma conta de demonstração (botões na tela de login; senha `123456`): doador `comper@demo.com`, entidade `esperanca@demo.com`.

Se a porta 3000 estiver ocupada: `PORTA=8080 docker compose up -d --build` (PowerShell: `$env:PORTA=8080; docker compose up -d --build`) e abra http://localhost:8080.
Para encerrar: `docker compose down`. Para começar do zero com os dados de demonstração: `docker compose down -v` e suba de novo.
Em Mac com chip Apple, o banco (imagem oficial do PostGIS, só amd64) roda por emulação e a primeira subida pode demorar mais.

O que foi entregue em relação aos requisitos do projeto (e o que ficou de fora): [docs/CONFORMIDADE.md](docs/CONFORMIDADE.md). Relatório técnico completo: [docs/RELATORIO_TECNICO_FINAL.md](docs/RELATORIO_TECNICO_FINAL.md).

## Funcionalidades
- Cadastro e login (JWT + bcrypt) de doadores e entidades receptoras, com CNPJ numérico ou alfanumérico (formato da Receita desde 07/2026) validado por dígito verificador.
- Doador publica lotes com horário limite de retirada (obrigatório, até o fim do dia da validade) e foto opcional (reduzida no navegador, JPEG/PNG de até 400 KB); a entidade receptora vê os lotes num raio de 10 km (PostGIS), ordenados por validade e distância, com miniatura e "retirar até dd/mm hh:mm".
- Reserva com janela de retirada (até 2 h, dentro do horário limite do lote) e código de 6 dígitos; só a primeira entidade consegue reservar.
- A entidade pode desistir da reserva: o lote volta na hora para as outras ONGs do raio (que são avisadas) e o doador recebe aviso. O doador pode cancelar um lote disponível ou reservado; havendo reserva, a ONG recebe aviso urgente. Lote cancelado sai das listas e não conta na TEC.
- Proteções contra adivinhação: 5 códigos de retirada errados seguidos bloqueiam a confirmação daquele lote por 15 min; 10 logins errados na mesma conta (ou 50 no mesmo IP) em 15 min dão 429. A contagem de login fica em memória e zera ao reiniciar o servidor.
- Ciclo de vida: lote vencido, ou ainda disponível depois do horário limite de retirada, vira `expirado`; reserva não retirada após a janela (mais tolerância) volta a `disponivel`.
- QR Code de retirada (link para o app com lote e código preenchidos) e confirmação pelo doador com checklist sanitário.
- Comprovante digital com hash SHA-256 e página pública de verificação (`/verificar/:hash`). Não é certificado ICP-Brasil.
- Notificações em tempo real por WebSocket (`/ws`) e central de notificações; sem WebSocket a consulta HTTP continua valendo.
- Cadastro completo (endereço, responsável, telefone) com aceite obrigatório do Termo de Responsabilidade e da Política de Privacidade (`/termos.html`, versão 2026-10-v2 com a Lei 15.224/2025; normas conferidas em fonte oficial, texto sem revisão jurídica; a v1 aceita pelas contas demo fica em `/termos-2026-10-v1.html`); a ONG pode anexar o comprovante de entidade sem fins lucrativos (PDF/JPEG/PNG ≤ 1 MB, tipo validado pelo conteúdo).
- Indicadores globais (kg, refeições, CO₂, água, entidades beneficiadas, TMR com meta < 90 min e TEC com meta > 92%), aba "Meus números" por perfil e histórico de doações.
- A foto só é entregue ao doador dono e a quem pode ver o lote (`GET /lotes/:id/foto`, com token).
- Fora desta versão: painel administrativo (aprovação de cadastros, coluna `situacao` reservada ao extra X1) e e-mail.

## Detalhes de execução

### Com Docker (avaliação e apresentação)
É o jeito recomendado de rodar a demonstração. A implantação em servidor ficou fora do escopo desta versão.

```bash
docker compose up -d --build
```
Abra http://localhost:3000. O banco não publica porta (só o app o acessa, pela rede interna do Docker; para inspecionar: `docker compose exec db psql -U alimentams`); o app fica aberto na rede local para o celular.

**Antes de cada demonstração, recrie o banco.** O `init.sql` só roda com o volume vazio, e o seed usa horários relativos à criação do banco (a reserva do seed expira ~25 min depois). O comando abaixo apaga o volume e todos os dados da demonstração:
```bash
docker compose down -v && docker compose up -d --build
```

**Celular lendo o QR:** no notebook, abra o app pelo IP da rede (ex.: `http://192.168.0.10:3000`, veja com `ipconfig`) ou suba com `BASE_URL=http://192.168.0.10:3000 docker compose up -d --build`. Se a ONG abrir por `localhost`, o QR leva `localhost`, que no celular aponta para o próprio celular. Libere a porta 3000 no Firewall do Windows (rede privada). Redes de faculdade costumam isolar os aparelhos entre si: se o celular não abrir o endereço, use o roteador do próprio celular (hotspot) para o notebook e o celular.

### Local (sem Docker para o app)
Requer Node.js e PostgreSQL com PostGIS. Crie o banco, carregue `db/init.sql` e inicie:

```bash
cd backend
npm install
# DATABASE_URL aponta para o banco (descartável) já carregado com db/init.sql
node src/server.js
```
Porta padrão 3000 (`PORT` altera).

### Testes
```bash
docker compose -f docker-compose.test.yml up -d        # banco de testes em 127.0.0.1:5433
cd backend
npm install
# PowerShell: $env:TEST_DATABASE_URL="postgres://alimentams_test:alimentams_test_local@127.0.0.1:5433/alimentams_test"
export TEST_DATABASE_URL=postgres://alimentams_test:alimentams_test_local@127.0.0.1:5433/alimentams_test
npm test
```
Usa um banco exclusivo e descartável (`alimentams_test`, porta 5433; veja `docker-compose.test.yml`), recriado a partir de `db/init.sql`. O reset recusa bancos de desenvolvimento e produção. O servidor de teste usa a porta 3100.

## Dados de demonstração (seed em `db/init.sql`)
Senha de todas as contas: `123456`. CNPJs são sintéticos.

| Perfil | E-mail |
|---|---|
| Doador | comper@demo.com / sabor@demo.com / pao@demo.com |
| Receptora | esperanca@demo.com / amambai@demo.com |
| Receptora fora do raio de 10 km | longe@demo.com |

O seed cria:
- 4 lotes disponíveis (validade hoje, amanhã, +2 e +4 dias), com horário limite no fim do dia da validade; nenhum lote do seed tem foto (os cartões mostram um placeholder neutro “Sem foto”);
- histórico de 30 dias: 16 doações entregues, com eventos e comprovantes de hash verificável, de modo que os indicadores já abrem com números;
- 1 reserva perto de expirar (Padaria Pão Nosso → Casa de Apoio Esperança, código `482915`, janela termina ~25 min após a criação do banco). Depois da janela mais a tolerância, o lote volta a ficar disponível na primeira consulta.

Os instantes são relativos ao momento da criação do banco; para reiniciar a demonstração, recrie apenas o banco descartável (comando acima). TMR/TEC refletem as definições da API, não garantia de metas: o histórico sintético reserva 3 h após publicar e começa com TMR acima de 90 min. Cadastros demo incluem contato fictício e aceite dos termos; nenhum comprovante de entidade é pré-carregado.

## Carga local (fora do npm test)

Em `backend/`, com `TEST_DATABASE_URL` apontando para banco local exclusivo `alimentams_test` (ou sufixo permitido):

```bash
node test/carga.mjs
```

**Recria integralmente o banco descartável** com `db/init.sql`; não executar junto com testes ou demo no mesmo banco. A guarda recusa banco de desenvolvimento/produção antes de conectar. Inicia e encerra seu próprio servidor de teste na porta 3101; recusa porta ocupada. Não acessa VPS nem lê `.env`.

Executa ondas de 20 e 200 buscas e de 20 e 200 disputas de reserva (440 requisições medidas), com duas ONGs sintéticas alternadas. Salva média, p95, status, erros inesperados e unicidade também conferida no banco em [resultado-carga.md](docs/testes/resultado-carga.md). Conflitos 409 são esperados: uma reserva vence e as outras são recusadas. É medição local de uma execução, sem garantia de capacidade em produção. A suíte oficial é `npm test`. `docs/testes/e2e-api.mjs` é uma fumaça manual (55 verificações) contra um servidor já rodando (`E2E_URL`, padrão `http://localhost:3000`); ela cria dados, então use só banco descartável recém-criado.

## API
| Método | Rota | Acesso |
|---|---|---|
| GET | /saude | público |
| GET | /bairros | público |
| POST | /auth/register, /auth/login | público (cadastro exige endereço, responsável, telefone e `aceite_termos: true`) |
| GET | /verificar/:hash | público (dados mínimos) |
| GET | /lotes | doador / receptora |
| POST | /lotes | doador (`retirada_ate` obrigatório; `foto` base64 opcional) |
| GET | /lotes/:id/foto | doador dono ou receptora que pode ver o lote |
| PUT | /lotes/:id/reservar | receptora |
| GET | /lotes/:id/qrcode | receptora que reservou |
| PUT | /lotes/:id/confirmar-retirada | doador (5 códigos errados → bloqueio de 15 min, 429) |
| PUT | /lotes/:id/cancelar-reserva | receptora que reservou (lote volta a disponível) |
| PUT | /lotes/:id/cancelar | doador dono, lote disponível ou reservado |
| GET | /doacoes | autenticado |
| GET | /indicadores | autenticado (painel global: kg, refeições, CO₂e, água, entidades, TMR e TEC com metas) |
| GET | /indicadores/meus | autenticado (os mesmos números, só do próprio usuário) |
| GET | /perfil | autenticado (próprio cadastro) |
| PUT, GET | /perfil/comprovante | receptora (anexo PDF/JPEG/PNG ≤ 1 MB em base64; só a própria entidade lê) |
| GET | /doacoes/:id/comprovante | doador ou receptora da doação |
| GET | /notificacoes | autenticado (apenas as próprias) |
| PUT | /notificacoes/lidas, /notificacoes/:id/lida | autenticado (apenas as próprias) |
| WS | /ws | JWT no primeiro frame |

## Mais documentação

- [Roteiro de demonstração](docs/ROTEIRO_DEMO.md) (5–7 min, Cenário 1) e [roteiro de prints](docs/ROTEIRO_PRINTS.md) para o relatório.
- [Implantação em servidor](docs/DEPLOY.md) com `docker-compose.prod.yml`, `deploy/Caddyfile` e `.env.example`: fora do escopo desta entrega, guardado como melhoria futura.
- Como o projeto foi desenvolvido (automação com agentes, logs, revisões e checklists): [docs/agentes/LEIA-ME.md](docs/agentes/LEIA-ME.md). Registros antigos em `docs/agentes/historico/`.
