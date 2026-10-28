# Implantação em VPS (genérica)

Guia para o grupo subir a Rede AlimentaMS em um VPS Linux com Docker. Os arquivos
são genéricos: nenhum domínio, IP ou segredo real fica no repositório. Esta
versão foi preparada e validada **localmente** (testes automatizados e leitura dos
arquivos); o deploy no VPS é feito pelo grupo e o resultado deve ser registrado por
quem executar.

Arquivos envolvidos: `docker-compose.prod.yml`, `deploy/Caddyfile`, `.env.example`.

## Arquitetura

```
Internet ──80/443──> Caddy ──(rede interna Docker)──> app:3000 ──> db:5432
```

- Só o **Caddy** publica portas no host (80 e 443). `app` e `db` não têm `ports:`.
- O banco usa o volume `pgdata`; os certificados ficam em `caddy_data`.
- Todos os serviços têm `restart: unless-stopped`.

## Pré-requisitos

- VPS Linux com Docker e o plugin Docker Compose instalados.
- Um domínio ou subdomínio sob controle do grupo.

## Passo a passo

### 1. DNS

Crie um registro **tipo A** do domínio escolhido apontando para o IP público do VPS
(e AAAA, se usar IPv6). Aguarde a propagação: o Caddy só obtém o certificado se o
nome já resolver para o servidor.

### 2. Firewall

Libere apenas SSH, HTTP e HTTPS (exemplo com `ufw`):

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp   # opcional: HTTP/3
sudo ufw enable
```

Observação: o Docker insere regras próprias de `iptables` e pode ignorar o `ufw` para
portas publicadas pelos contêineres. Por isso o compose de produção não publica
`5432` nem `3000`: não confie no firewall para esconder portas publicadas.
Se o provedor tiver firewall externo, aplique a mesma regra (22/80/443).

### 3. Código e configuração

```bash
git clone <URL-DO-REPOSITORIO> rede-alimentams
cd rede-alimentams
cp .env.example .env
nano .env            # trocar TODOS os valores
```

No `.env`:

- `DOMINIO`: o nome do passo 1 (sem `https://`).
- `POSTGRES_PASSWORD`: senha longa e aleatória. Use apenas letras e números (ex.:
  `openssl rand -hex 24`), pois ela compõe a `DATABASE_URL`.
- `JWT_SECRET`: segredo aleatório longo (ex.: `openssl rand -hex 48`). Com
  `NODE_ENV=production` a aplicação se recusa a iniciar sem ele.
- O `.env` real nunca deve ser versionado nem enviado em mensagens (já está no
  `.gitignore`).

### 4. Subir

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

Na primeira subida (volume vazio) o Postgres executa `db/init.sql` e cria o schema.

### 5. Verificar

- `https://SEU-DOMINIO/saude` deve responder `{"ok":true,"banco":true}`
  (503 com `{"ok":false,"banco":false}` se a aplicação não alcançar o banco).
- `https://SEU-DOMINIO/` abre o front com cadeado válido.
- `docker compose -f docker-compose.prod.yml ps` mostra `app` como `healthy`.
- De outra máquina, as portas 5432 e 3000 do VPS devem estar **fechadas**.

### 6. Logs

```bash
docker compose -f docker-compose.prod.yml logs -f --tail=100 app
docker compose -f docker-compose.prod.yml logs -f caddy   # certificado, erros de proxy
docker compose -f docker-compose.prod.yml logs db
```

Problemas comuns de certificado: DNS ainda não propagou ou a porta 80/443 está
bloqueada (firewall do VPS ou do provedor). Os logs do `caddy` mostram o motivo.

### 7. Backup e restauração

Backup lógico com `pg_dump`:

```bash
docker compose -f docker-compose.prod.yml exec -T db \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup-$(date +%F).sql
```

Guarde o arquivo fora do VPS (ele contém dados de usuários). Restauração em um banco
vazio:

```bash
docker compose -f docker-compose.prod.yml exec -T db \
  sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"' < backup-AAAA-MM-DD.sql
```

Teste a restauração em outro ambiente antes de depender dela.

### 8. Atualizar a aplicação

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

**Atenção:** reconstruir os contêineres atualiza o código, mas **não reaplica o
schema** em um volume já existente: `db/init.sql` só roda com o volume vazio. Se um
lote alterar tabelas ou colunas:

1. Faça o backup (passo 7) antes de qualquer coisa.
2. Aplique as alterações de schema manualmente (`ALTER TABLE ...` via `psql` no contêiner
   `db`), usando as mudanças do `db/init.sql` como referência; ou
3. Se os dados puderem ser descartados (ex.: ambiente de demonstração), recrie o volume
   — **apaga todos os dados**: `docker compose -f docker-compose.prod.yml down -v` e suba
   de novo.

Não use `down -v` sem backup e sem decisão consciente do grupo.

### 9. Contas de demonstração

O `db/init.sql` inclui usuários e lotes de demonstração com senha conhecida
(`123456`, documentada no README). Em um VPS acessível pela Internet isso é um risco:
[GRUPO] decidir se o ambiente é só de demonstração; caso contrário, remover ou trocar as
senhas dessas contas depois da primeira subida.

## O que isto tem de Redes

Seção de apoio ao relatório.

- **DNS:** o registro tipo A associa o nome do domínio ao IP do VPS. O navegador resolve
  o nome antes de abrir a conexão; a Autoridade Certificadora também usa o DNS (e o
  acesso à porta 80/443 do nome) para validar que o servidor controla o domínio.
- **Portas e firewall:** 22 (SSH, administração), 80 (HTTP: desafio do certificado e
  redirecionamento para HTTPS) e 443 (HTTPS; UDP 443 para HTTP/3). Tudo o mais fica
  fechado. PostgreSQL (5432) e a aplicação Node (3000) só existem na rede interna do
  Docker, acessíveis pelo nome de serviço (`db`, `app`), nunca pela Internet.
- **TLS 1.3 e HTTPS automático:** o Caddy obtém e renova certificados (Let's Encrypt)
  sozinho e negocia TLS, preferindo a versão 1.3 quando o cliente suporta. Para conferir
  o que o servidor aceita: `openssl s_client -connect SEU-DOMINIO:443 -tls1_3`.
  [VERIFICAR] versões mínimas e cifras padrão da versão do Caddy usada, antes de citar
  no relatório.
- **Proxy reverso:** o Caddy termina o TLS e encaminha o tráfego em HTTP puro para
  `app:3000` pela rede interna. A aplicação confia no cabeçalho `X-Forwarded-*` do proxy
  (`trust proxy`), para enxergar o IP e o protocolo originais do cliente. Também
  comprime as respostas (`encode`).
- **Upgrade do WebSocket:** o WebSocket começa como uma requisição HTTP com
  `Connection: Upgrade` / `Upgrade: websocket`; o servidor responde `101 Switching
  Protocols` e a mesma conexão TCP passa a transportar quadros. O `reverse_proxy` do
  Caddy repassa esse Upgrade sem configuração extra, e sob HTTPS o cliente usa `wss://`.
- **Cabeçalhos de segurança:** `X-Content-Type-Options: nosniff`, `Referrer-Policy` e
  `X-Frame-Options: DENY`. Não há `Content-Security-Policy` de script porque o front usa
  handlers inline.

## Limites desta validação

- Nenhum VPS, DNS, certificado ou firewall foi acessado ou testado pelos agentes.
- Testes locais cobrem `/saude`, cabeçalhos e a ausência de `5432:`/`3000:` publicados no
  compose de produção; não substituem a verificação do passo 5 no servidor real.
- A sintaxe do compose e do Caddyfile não foi executada por `docker compose config` /
  `caddy validate` nesta etapa; fazer na primeira subida.
