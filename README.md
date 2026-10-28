# Rede AlimentaMS – MVP

Plataforma que conecta estabelecimentos doadores a entidades receptoras.
Stack: Node.js + Express, PostgreSQL + PostGIS, JWT + bcrypt, Docker.

## Continuar o desenvolvimento automaticamente

No terminal, na raiz do projeto:

```powershell
.\agentes.cmd diagnostico
.\agentes.cmd iniciar
```

Se faltar o banco na porta 5433, abra o Docker Desktop e execute
`.\agentes.cmd banco`; depois repita o diagnóstico. Isso prepara um banco
de testes separado do banco da aplicação.

O controlador usa Codex até atingir o limite, depois Claude até o limite; com
ambos limitados, espera uma hora e tenta Codex primeiro. Estado persiste entre
execuções. Use `.\agentes.cmd status` e `.\agentes.cmd parar` em outro terminal.
Não deixe agentes manuais editando a pasta ao mesmo tempo.

O Claude está configurado no modo nativo sem pedidos de permissão, conforme
escolha do usuário: isso dá acesso da conta Windows, não isolamento à pasta.
Pré-requisitos, retomada, limites e testes em [Execução automática](docs/EXECUCAO_AUTOMATICA.md).

## Funcionalidades
- Cadastro e login (JWT + bcrypt) de doadores e entidades receptoras, com CNPJ validado por dígito verificador.
- Doador publica lotes com horário limite de retirada (obrigatório, até o fim do dia da validade) e foto opcional (reduzida no navegador, JPEG/PNG de até 400 KB); a entidade receptora vê os lotes num raio de 10 km (PostGIS), ordenados por validade e distância, com miniatura e "retirar até dd/mm hh:mm".
- Reserva com janela de retirada (até 2 h, dentro do horário limite do lote) e código de 6 dígitos; só a primeira entidade consegue reservar.
- Ciclo de vida: lote vencido, ou ainda disponível depois do horário limite de retirada, vira `expirado`; reserva não retirada após a janela (mais tolerância) volta a `disponivel`.
- QR Code de retirada (link para o app com lote e código preenchidos) e confirmação pelo doador com checklist sanitário.
- Comprovante digital com hash SHA-256 e página pública de verificação (`/verificar/:hash`). Não é certificado ICP-Brasil.
- Notificações em tempo real por WebSocket (`/ws`) e central de notificações; sem WebSocket a consulta HTTP continua valendo.
- Indicadores globais (kg, refeições, CO₂, água) e histórico de doações.
- A foto só é entregue ao doador dono e a quem pode ver o lote (`GET /lotes/:id/foto`, com token).
- Fora desta versão: relatórios/admin (L06) e e-mail.

## Como rodar

### Com Docker
Pré-requisito: Docker Desktop (ou Docker + Compose no Linux).

```bash
docker compose up --build
```
Abra http://localhost:3000

Para zerar o banco e recriar os dados de demonstração:
```bash
docker compose down -v && docker compose up --build
```

### Local (sem Docker para o app)
Requer Node.js e PostgreSQL com PostGIS. Crie o banco, carregue `db/init.sql` e inicie:

```bash
cd backend
npm install
# DATABASE_URL aponta para o banco (descartável) já carregado com db/init.sql
node src/server.js
```
Porta padrão 3000 (`PORT` altera). Deploy em servidor: [docs/DEPLOY.md](docs/DEPLOY.md).

### Testes
```bash
cd backend
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
- 4 lotes disponíveis (validade hoje, amanhã, +2 e +4 dias), sem foto e com horário limite no fim do dia da validade;
- histórico de 30 dias: 16 doações entregues, com eventos e comprovantes de hash verificável, de modo que os indicadores já abrem com números;
- 1 reserva perto de expirar (Padaria Pão Nosso → Casa de Apoio Esperança, código `482915`, janela termina ~25 min após a criação do banco). Depois da janela mais a tolerância, o lote volta a ficar disponível na primeira consulta.

Os instantes são relativos ao momento da criação do banco; para reiniciar a demonstração, recrie o banco (comando acima).

## Roteiro de demonstração
1. Entre como **Doador (Comper)** e publique um lote.
2. Entre como **ONG (Casa Esperança)**: o lote aparece ordenado por validade e distância. Reserve a retirada com uma janela e veja o código de 6 dígitos.
3. Volte ao **Doador**, digite o código, marque o checklist e confirme a retirada.
4. Veja a doação em *Doações registradas*, o comprovante e os indicadores atualizados.
5. Teste as validações: quantidade 0 ou data vencida (Cenário 2). Entre como `longe@demo.com` e veja que nenhum lote aparece (raio de 10 km, PostGIS).

## API
| Método | Rota | Acesso |
|---|---|---|
| GET | /saude | público |
| GET | /bairros | público |
| POST | /auth/register, /auth/login | público |
| GET | /verificar/:hash | público (dados mínimos) |
| GET | /lotes | doador / receptora |
| POST | /lotes | doador (`retirada_ate` obrigatório; `foto` base64 opcional) |
| GET | /lotes/:id/foto | doador dono ou receptora que pode ver o lote |
| PUT | /lotes/:id/reservar | receptora |
| GET | /lotes/:id/qrcode | receptora que reservou |
| PUT | /lotes/:id/confirmar-retirada | doador |
| GET | /doacoes, /indicadores | autenticado |
| GET | /doacoes/:id/comprovante | doador ou receptora da doação |
| GET | /notificacoes | autenticado (apenas as próprias) |
| PUT | /notificacoes/lidas, /notificacoes/:id/lida | autenticado (apenas as próprias) |
| WS | /ws | JWT no primeiro frame |
