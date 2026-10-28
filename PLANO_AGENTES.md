# Plano de execução — Rede AlimentaMS (v3.1, controlador Codex → Claude)

> v3.1 · 28/10/2026 · Meta: núcleo pronto até 28/10 à noite · Entrega: 30/10 às 22h · Apresentação: 03–06/11.
>
> Base: `ANALISE_CONFORMIDADE.md`. Objetivo: protótipo fiel à Etapa 4, exceto pelas decisões explícitas deste plano, testado e pronto para deploy pelo grupo. O relatório começa pelas seções independentes do código e incorpora resultados reais depois.
>
> Este documento define trabalho futuro. Arquivos, testes e automações descritos nos lotes só existem depois de implementados e verificados. Atualizar o plano não executa os lotes.

## 0. Organização da v3.1

- **Lotes são etapas de entrega**, não agentes permanentes. L00–L08 e extras mantêm o escopo funcional e seus critérios de aceite, com ajustes na fundação e na ordem de entrega.
- **Um executor por vez** implementa, testa e corrige. Uma sessão separada revisa conforme o risco e antes da entrega.
- Plano, regras e progresso são compartilhados entre Claude e Codex. Comandos, modelos e permissões são configurados para cada ferramenta.
- L00 cria a fundação de testes. Por solicitação do usuário, o controlador já foi incorporado e alterna Codex → Claude conforme cota; acompanhe o primeiro lote antes de deixar rodando.
- Há uma única ordem e calendário vigentes. Capacidade é estimada pelo consumo e duração observados, sem contar janelas de cinco horas como garantia de conclusão.

---

## 1. Decisões fixas

| # | Decisão |
|---|---|
| D1 | **Stack atual mantida:** Node.js + Express (JavaScript), HTML/CSS/JS puro em um só `index.html`, PostgreSQL + PostGIS, Docker. Sem React, TypeScript ou build. |
| D2 | Dependências permitidas: `express`, `pg`, `bcryptjs`, `jsonwebtoken`, `qrcode`, `ws`. **Nenhuma outra.** |
| D3 | Notificações em tempo real por **WebSocket** (`ws`) + central de notificações dentro do app. **Sem e-mail** (exigiria SMTP e credenciais) → melhoria futura. |
| D4 | QR Code gerado no servidor (`qrcode`), sem CDN. O QR leva a um **link de retirada**: a câmera nativa do celular do doador abre o app com o lote e o código já preenchidos. |
| D5 | CNPJ validado por **dígito verificador**. Sem consulta à Receita/BrasilAPI → melhoria futura. |
| D6 | Desenvolvimento e testes **locais**. Banco de testes exclusivo na porta 5433, pelo `docker-compose.test.yml` ou PostgreSQL/PostGIS local equivalente. A apresentação roda no **VPS**. |
| D7 | Repositório com **arquivos de deploy genéricos** (`SEU_DOMINIO`, `.env.example`). **Nunca** domínio, IP, senha, chave ou `.env` real. **Agentes nunca acessam o VPS.** |
| D8 | "Assinatura eletrônica" do comprovante = **hash SHA-256 verificável** por uma página pública. O relatório deixa claro que não é certificado ICP-Brasil. |

---

## 2. Papéis, modelos e delegação

### 2.1 Equipe mínima

| Papel | Responsabilidade | Quando existe |
|---|---|---|
| Executor | Implementar um lote, testar, corrigir e registrar evidências | Um por vez; pode continuar entre lotes enquanto o contexto for útil |
| Revisor | Conferir comportamento, segurança, concorrência, aceite e testes | Sessão separada nos gatilhos da seção 4.3 e na revisão final |
| Especialista eventual | Responder uma questão delimitada com evidências | Só quando houver ganho concreto de conhecimento, contexto separado ou trabalho independente |
| Grupo | Revisão humana, dados de campo, VPS, prints e entrega | Em paralelo, sem disputar os mesmos arquivos |

O executor também faz as correções. Não há corretor fixo nem orquestrador de IA separado. Testes são processos locais; um script não consome tokens por si, mas as chamadas a modelos consomem uso.

### 2.2 Perfis iniciais de modelo

São escolhas iniciais, não equivalências de desempenho entre fornecedores. Confirmar disponibilidade, versão do cliente e esforços suportados na conta.

| Perfil | Trabalho | Codex: modelo e esforço | Claude: família |
|---|---|---|---|
| Padrão | Implementação habitual, testes e correções delimitadas | `gpt-6.1-sol`, `medium` | Sonnet |
| Crítico | Raciocínio sobre concorrência, autorização, ciclo de vida e revisão de maior risco | `gpt-6.1-sol`, `high` | Opus quando a dificuldade justificar; Sonnet pode implementar com revisão separada |
| Leve | Busca delimitada, resumo e documentação simples | `gpt-6-luna`, `high` | Haiku |

- L00/L01/L03/L06/L07/L08 começam no perfil padrão. Revisar anexos e acesso a dados especialmente em L03/L06.
- L02/L04/L05 usam o perfil crítico para decisões difíceis e revisão; isso não exige mais agentes ou o modelo mais caro em toda edição.
- Perfil leve é opcional; não criar especialista só para ocupá-lo. Não usá-lo como único responsável por autenticação, autorização, reservas ou testes de concorrência.
- Elevar capacidade diante de dificuldade demonstrada: falhas repetidas sem hipótese nova, dependências difíceis de reconciliar ou decisão de segurança não resolvida. Registrar motivo e orçamento; não repetir o mesmo prompt indefinidamente.

**Configuração verificável:** definir ferramenta, papel, modelo solicitado e esforço quando suportado antes da chamada. No Claude, resolver a família para o ID completo disponível na conta e registrá-lo; aliases podem mudar de versão. No Codex, configurar modelo e esforço no mecanismo suportado pelo cliente. Não presumir equivalência entre controles de esforço dos produtos.

Registrar modelo efetivo quando o cliente o informar; caso contrário, `nao_verificado`. Documentar substituições antes de continuar. Respeitar restrições da conta/sessão. Escrever o nome no prompt não garante seleção do modelo.

### 2.3 Critérios para delegar

- **Padrão: sem subagentes.** Revisão pode ocorrer em outra sessão sequencial, inclusive na outra ferramenta.
- Antes de delegar, registrar objetivo, justificativa, entradas, saída esperada, modelo, limite da tarefa e arquivos que podem ser alterados.
- Não delegar edições simultâneas de `server.js`, `index.html`, `init.sql`, estado ou logs. O executor consolida resultados.
- Paralelismo apenas para tarefas independentes, preferencialmente leitura, com benefício claro frente ao custo de contexto e integração. Não criar agentes automaticamente por lote nem permitir delegação recursiva por padrão.
- Sessão nova é útil para revisão independente, troca de ferramenta ou contexto degradado; não é obrigatória a cada lote.

## 3. Fase 0 — Preparação

- [ ] Conferir ambiente local e PostgreSQL + PostGIS na porta 5433. Se usar a instalação portátil da análise, manter dados fora de pasta temporária.
- [ ] Com Docker Desktop aberto, `agentes.cmd banco` prepara o banco de testes separado. Controlador fornece `TEST_DATABASE_URL` e `DATABASE_URL` de testes às CLIs; L00 deve aproveitar essas variáveis e recusar reset de bancos fora do escopo de testes.
- [ ] Conferir Git antes de inicializar. Se ausente, criar repositório, `.gitignore` e commit/tag `baseline`; preservar histórico existente. Trabalho inicialmente local.
- [ ] Escolher Claude ou Codex; confirmar modelo da seção 2.2 e registrar consumo disponível e horário, sem credenciais.
- [ ] Validar permissões da ferramenta para editar o projeto, executar Node/testes, instalar dependências permitidas e usar Git local. `.claude/settings.json` não se aplica ao Codex; respeitar sandbox e políticas do ambiente escolhido.
- [ ] Proteger documentos de referência, segredos e acesso ao VPS. Durante implementação, o executor não altera este plano, regras ou suas permissões; mudanças nesses documentos ficam em tarefa explícita de planejamento.
- [ ] Rodar `agentes.cmd diagnostico`, conferir banco e executar L00 acompanhado. Não depender da primeira execução noturna sem validar ambiente e passagem entre CLIs.

## 4. Execução e retomada entre ferramentas

### 4.1 Registros mínimos

| Arquivo | Conteúdo | Responsável |
|---|---|---|
| `AGENTS.md` | Regras comuns da seção 5, sem comandos exclusivos de fornecedor | Já criado; mudanças só em tarefa de planejamento |
| `CLAUDE.md` | Orientação curta para ler `AGENTS.md` e particularidades necessárias do Claude | Já criado; evitar duplicar regras |
| `.agentes/estado.json` | Fila; por lote: status, escopo, dependências, início/fim com fuso, tentativas, branch, último commit, testes, pendências, motivo e revisão necessária | Controlador; executor não edita o estado |
| `docs/agentes/progresso/LXX.md` | Checklist, evidências, decisões, trabalho parcial e próximo passo | Executor |
| `docs/agentes/LOG.md` | Resultado, testes manuais, limitações, duração e consumo observado quando disponível | Executor |
| `docs/agentes/REVISAO_<escopo>.md` | Achados, evidências, commit revisado, correções e conclusão | Revisor; executor registra correções sem apagar achados |

Status: `pendente`, `em_andamento`, `aguardando_cota`, `aguardando_revisao`, `bloqueado`, `ok` ou `falhou`. `ok` exige escopo declarado, testes e revisões cumpridos. Escopo reduzido não equivale a lote completo.

Por execução, registrar `ferramenta`, `papel`, `modelo_solicitado`, `modelo_efetivo`, `esforco` (ou `nao_aplicavel`), `session_id` opcional e motivo de troca. Preservar o histórico ao trocar ferramenta/modelo. O ID de sessão é específico do cliente e auxiliar; não é requisito de retomada.

### 4.2 Ciclo de trabalho

1. Ler estado, checklist e Git. Escolher lote com dependências atendidas. Conferir alterações existentes antes de trocar branch; preservar trabalho alheio.
2. Criar ou retomar `lote/LXX` a partir da `main` validada. Registrar escopo, modelo e início. Um executor altera o projeto.
3. Implementar em passos coerentes. Salvar checklist e commits parciais locais após subtarefas relevantes. Marcar `[x]` com evidência; manter pendências explícitas.
4. Rodar `npm test` **em `backend/`**, examinar diff e conferir cada critério de aceite. Validar manualmente fluxos visíveis quando houver mudança de interface. Não integrar apenas porque o teste retornou zero.
5. Em falha, investigar e aplicar uma rodada delimitada de correção. Persistindo a mesma falha sem avanço, registrar diagnóstico e marcar `bloqueado` ou `falhou`. Nova tentativa exige hipótese ou condição diferente; turnos não são medida universal entre clientes.
6. Aplicar revisão da seção 4.3 quando exigida; enquanto pendente, marcar `aguardando_revisao`. Achados críticos/altos impedem integração; médios precisam de correção ou justificativa e impacto registrados. Correções críticas/altas voltam ao revisor.
7. Integrar na `main` após aceite, testes e revisão aplicável. Registrar commit resultante, escopo e evidências. Dependentes só avançam com dependências atendidas.
8. Em interrupção/cota: salvar checklist e commit parcial quando possível, motivo e próximo passo. Após corte abrupto, reconciliar arquivos e Git antes de confiar no estado. Retomar na mesma sessão se disponível ou em sessão nova de qualquer ferramenta.

**Prompt compartilhado de execução:**

> Leia AGENTS.md, a seção do lote LXX em PLANO_AGENTES.md e o checklist existente. Confira estado e Git. Execute o escopo registrado, começando pelos arquivos listados e consultando dependências necessárias. Não crie subagentes por padrão. Salve progresso e commits parciais, valide o aceite e rode npm test em backend/. Registre testes, limitações e próximo passo. Não integre mudanças que ainda exijam revisão.

**Prompt compartilhado de retomada:**

> Retome LXX seguindo AGENTS.md. Leia estado, checklist, log e alterações/commits da branch. Confira evidências dos itens concluídos e continue do próximo passo pendente, sem refazer trabalho válido. A sessão anterior pode ser de outra ferramenta; arquivos e código são a fonte do progresso.

### 4.3 Revisão proporcional ao risco

- **Todo lote:** executor confere diff, aceite e testes; isso não substitui revisão independente quando exigida abaixo.
- **Gatilho de risco:** sessão separada antes da integração de mudanças em autenticação/autorização, concorrência de reservas, transições de estado, comprovantes públicos, anexos, destinatários de WebSocket e exposição de portas/segredos. Inclui L02/L04/L05, partes relevantes de L01/L03/L06/L07 e extras que afetem esses comportamentos.
- **Revisão final:** após todo o escopo escolhido, inclusive opcionais, antes dos prints definitivos/entrega. Reaproveitar revisões anteriores identificando commit e resultado; conferir integração e mudanças posteriores.
- Sessão de revisão recebe requisitos e evidências, mas verifica código por conta própria. Trocar de fornecedor é opcional.
- Revisor examina diff e contexto necessário, sem editar código. Registrar prioridade, arquivo:linha, comportamento, reprodução ou evidência, impacto e sugestão de correção. Conferir se testes detectariam a regressão. Evitar cosmética e não ocultar problemas graves por limite arbitrário de achados.
- Testes verdes não provam ausência de falhas. Revisão final inclui fluxo de demonstração e correspondência entre produto, README, roteiros e relatório.
- Mudança posterior exige testes e revisão proporcionais ao risco, atualizando o commit revisado; não incluir funcionalidades após revisão final sem revalidar o que mudou.

### 4.4 Controlador incorporado — prioridade fixa

Implementação: `scripts/agentes/cli.mjs`, com entrada `agentes.cmd`. Instruções completas em [docs/EXECUCAO_AUTOMATICA.md](docs/EXECUCAO_AUTOMATICA.md).

- Iniciar/continuar: `agentes.cmd iniciar`. Ver estado: `agentes.cmd status`. Parar: `agentes.cmd parar`. Após corrigir bloqueio: `agentes.cmd retomar`.
- Codex executa até cota esgotada; Claude assume e executa até sua própria cota esgotar. Não interromper Claude para sondar Codex. Quando ambos estiverem limitados, aguardar uma hora e tentar Codex primeiro, depois Claude. Repetir enquanto houver trabalho e a parada não for solicitada.
- Datas estruturadas de renovação podem antecipar uma tentativa. Uma resposta bem-sucedida não inicia, por inferência, uma janela de cinco horas. Limites semanais continuam valendo.
- Estado persistente, avisos de horário e trava de execução única. Só uma CLI altera o projeto. Não manter agentes manuais editando em paralelo.
- O controlador prepara branches, salva commits ao fim de chamadas e integra após testes/revisão; os agentes salvam checklist durante as chamadas, sem controlar Git. Essa divisão substitui as operações manuais de Git da seção 4.2 quando executado por este comando.
- Codex usa sandbox workspace-write sem prompts. Conforme escolha explícita do usuário, Claude usa executável nativo e `--dangerously-skip-permissions`: acesso da conta Windows, sem isolamento ao diretório. Instruções e revisão não impedem acesso externo. O controlador não amplia a sandbox desta sessão do Codex.
- Autenticação, permissão negada, erro desconhecido, travamento, falta de banco e falhas repetidas bloqueiam a execução; não são tratados como cota. A fila concluída encerra o processo. Não há promessa de execução infinita sem intervenção nem criação automática de tarefas novas.
- Configuração por ferramenta em `scripts/agentes/config.json`; sobrescritas locais em `.agentes/config.local.json`. Sem novas dependências de aplicação. Testes offline do controlador não consomem cota e não substituem a validação real do ambiente.


---

## 5. Regras compartilhadas (registradas em AGENTS.md)

1. Comece por `AGENTS.md`, seção do lote, estado/checklist e arquivos listados. Consulte dependências necessárias. PDF/DOCX e análise podem esclarecer requisitos; não é preciso relê-los em cada lote.
2. Stack/dependências fixas (D1/D2). Front em `backend/public/index.html`, sem build/CDN.
3. `db/init.sql` é fonte do schema. Testes usam banco exclusivo e descartável. Nunca resetar banco de desenvolvimento com dados úteis ou produção. Procedimento de schema no VPS cabe ao grupo.
4. SQL parametrizado. Rotas protegidas exigem autenticação/perfil; exceções públicas devem ser explícitas, com resposta mínima e testes de acesso. Rotas novas têm testes relevantes de sucesso, erro e autorização quando aplicável.
5. Erros da API em JSON `{ "erro": "..." }`, pt-BR. Entrada inválida gera erro de cliente, não 500; não mascarar falha interna legítima como 400.
6. Dados inseridos em HTML passam por escape apropriado; usar `esc()` onde compatível. Textos pt-BR: Disponível, Reservado, Entregue, Comprovante Digital de Doação.
7. Datas de negócio em `America/Campo_Grande`.
8. Não apagar/afrouxar testes para aprovar implementação. Pendências iniciais têm nome, justificativa e lote de correção. Não versionar segredos, domínio/IP reais do VPS ou `.env` real. Exemplos e endereços locais devem ser claramente fictícios/locais.
9. Salvar checklist, evidência e commit parcial por subtarefa relevante. Preservar trabalho alheio, sem limpeza destrutiva.
10. Encerrar com testes, aceite, commit e `LOG.md`: mudança, verificações, limitações, pendências, consumo observado e próximo passo. Não declarar conclusão sem evidência.
11. Um executor por vez. Modelos/delegação seguem seção 2; revisão/integração seguem seção 4. O próprio executor corrige falhas.
12. Respeitar permissões e D1–D8. Não acessar VPS nem alterar documentos de referência, plano, instruções ou permissões durante implementação. Mudanças desses documentos exigem tarefa explícita de planejamento.

---

## 6. Lotes

Formato: **Objetivo · Arquivos · Fazer · Aceite**. Abreviações: `server.js` = `backend/src/server.js`, `index.html` = `backend/public/index.html`, `init.sql` = `db/init.sql`, `test/` = `backend/test/`. Orçamento observado por execução, sem turnos fixos por lote.

### L00 — Fundação mínima (com acompanhamento)

- **Arquivos de trabalho:** `backend/package.json`, `backend/test/*` (novos), `docs/testes/e2e-api.mjs` (origem), `docs/agentes/progresso/`, `docs/agentes/LOG.md`. Regras, fila e estado existentes são referências de leitura, não arquivos a reescrever.
- **Fazer:**
  - Conferir regras existentes em `AGENTS.md` e referência em `CLAUDE.md`, sem reescrevê-las. Conferir leitura pela ferramenta usada.
  - Conferir Git/baseline preparados pelo controlador, preservando histórico. Não alterar branch, staging ou commits pelo agente.
  - `backend/test/reset-db.mjs`: via `pg`, recriar banco de teste exclusivo (ex.: `alimentams_test`) e carregar `db/init.sql`, sem depender de `psql`. Exigir nome permitido para testes e recusar desenvolvimento/produção antes de DROP. Servidor filho e testes devem usar a mesma conexão de teste.
  - `backend/test/run.mjs` (`npm test`): por `test/*.test.mjs`, reset de teste → servidor filho na porta 3100 → espera limitada por prontidão → teste → encerramento garantido dos processos. Resumo de aprovados/falhas/pendentes e detalhes das falhas. Código diferente de zero em falha.
  - `backend/test/helpers.mjs`: `call`, `login`, `ok`, `dia(n)` e cliente `pg` do banco de teste.
  - Adaptar E2E para `test/01-base.test.mjs`, identificando falhas conhecidas e evidências associadas ao L01. Referência histórica: 39 aprovações/9 falhas; confirmar resultado atual sem forçar contagens ou ocultar falhas novas como pendências.
  - Conferir fila existente e registrar progresso/evidências sem editar o estado do controlador. Usar o controlador existente, sem modificá-lo neste lote.
- **Aceite:**
  - `npm test` reproduz o comportamento inicial e mostra pendências conhecidas, sem ocultar falhas novas.
  - Reset recusa banco não autorizado sem alterar dados; servidor filho usa banco de teste.
  - Nova sessão reconstrói regras e próximo passo por Git/checklist sem histórico do chat. Não é necessário iniciar L01 para testar retomada.
  - Duração, consumo disponível e limitações registrados; fundação de testes validada usando o controlador já incorporado.

---

### L01 — Validações, robustez e CNPJ

- **Arquivos:** `backend/src/server.js`, `backend/src/validacao.js` (novo), `db/init.sql` (seed), `backend/public/index.html`, `test/02-validacoes.test.mjs`.
- **Fazer:**
  - Validar **tipo** de todo campo; `trim` antes de checar vazio; limites de tamanho.
  - `:id` inteiro positivo; quantidade entre 0 e 10.000 kg (excluindo 0); validade como **data real**.
  - Categoria em lista fechada; e-mail válido; **CNPJ por dígito verificador** (com ou sem máscara, guardado normalizado). Seed com CNPJs válidos fictícios.
  - JSON malformado → 400 em JSON.
  - `pool.on('error')`.
  - Com `NODE_ENV=production`, sem `JWT_SECRET` o servidor não sobe.
  - Máscara de CNPJ no front.
  - Corrigir o "amanhã" em UTC no front.
- **Aceite:**
  - Todas as pendências conhecidas atribuídas ao L01 passam a ser aprovadas; conferir a lista registrada no L00, sem depender de contagem histórica fixa.
  - Fuzz (string, número, null, array, objeto em cada campo de register, login, `POST /lotes`, reservar e confirmar) **nunca** retorna 500.
  - `11.222.333/0001-81` é aceito; `…-82` e `123` dão 400.

### L02 — Ciclo de vida: janela de retirada, expiração e redirecionamento (Fluxo 4 + risco "demora")

- **Depende de:** L01.
- **Arquivos:** `server.js`, `init.sql`, `index.html`, `test/03-ciclo-vida.test.mjs`.
- **Fazer:**
  - Ao reservar, a ONG escolhe a **janela de retirada** (início/fim, máx. 2 h, dentro de agora … limite de retirada do lote; até o L03, o limite é o fim do dia da validade).
  - Função `atualizarStatus()`, chamada no início das rotas de lotes (sem job):
    - reserva cuja janela terminou há mais de `TOLERANCIA_MINUTOS` (padrão 30) sem retirada → volta a `disponivel`, limpa reserva e código (redirecionamento para a próxima ONG da fila);
    - lote vencido → novo status `expirado`.
  - Tabela `eventos_lote` (histórico: publicado, reservado, liberado, expirado, entregue).
  - `confirmar-retirada` recusa lote expirado ou com reserva liberada (409).
  - Doador vê "ONG X retira entre hh:mm–hh:mm". Aba "Meus lotes" separa ativos de expirados. Corrigir a etiqueta "vence hoje" para lotes vencidos.
- **Aceite:**
  - Teste envelhece a janela no banco → o lote volta, outra ONG reserva e o código antigo não confirma.
  - Lote vencido → `expirado`, invisível para ONGs e não confirmável.
  - Janela inválida (fim antes do início, mais de 2 h, fora do limite) → 400.
  - Histórico registrado.

### L03 — Lote completo: foto e horário limite de retirada (Fluxo 2)

- **Depende de:** L02.
- **Arquivos:** `server.js`, `init.sql`, `index.html`, `test/04-lote.test.mjs`.
- **Fazer:**
  - **Foto:** o front reduz a imagem com `<canvas>` (máx. 1024 px, JPEG ~0,7) e envia em base64. O servidor valida tipo real (assinatura JPEG/PNG) e tamanho (≤ 400 KB) e guarda em `bytea`.
  - `GET /lotes/:id/foto` só para o dono ou para receptora que pode ver o lote. A listagem traz só `tem_foto`. Ajustar o limite do `express.json`.
  - **`retirada_ate`** (data e hora): obrigatório, no futuro e até o fim do dia da validade. A janela do L02 passa a respeitar esse limite.
  - Card com miniatura e "retirar até dd/mm hh:mm".
- **Aceite:**
  - Com foto e sem foto → 201.
  - Arquivo que não é imagem, ou grande demais → 400.
  - `retirada_ate` no passado → 400.
  - Receptora fora do raio → 403/404 na foto.

### L04 — Comprovante Digital, checklist sanitário, log imutável e QR Code (Fluxos 4 e 5)

- **Depende de:** L02.
- **Arquivos:** `server.js`, `init.sql`, `index.html`, `backend/package.json` (+`qrcode`), `test/05-comprovante-qr.test.mjs`.
- **Fazer:**
  - **Checklist sanitário** obrigatório na confirmação: 3 itens (embalagem íntegra, temperatura adequada, dentro da validade), gravados em `doacoes.checklist` (jsonb).
  - **`doacoes.hash`** = SHA-256 de um JSON canônico (partes, CNPJs, alimento, quantidade, data/hora, código, checklist).
  - `GET /doacoes/:id/comprovante`: página imprimível, só para as duas partes da doação.
  - `GET /verificar/:hash`, **público**: resumo **sem dados pessoais**.
  - **Trigger** que bloqueia UPDATE e DELETE em `doacoes`.
  - `GET /lotes/:id/qrcode` (PNG), só para a receptora que reservou. O QR leva a `BASE_URL/#retirada/<id>/<codigo>`; `BASE_URL` vem de env ou do `Host`.
  - No front, a rota `#retirada/...` abre a confirmação preenchida para o doador (pede login se preciso). O comprovante traz um QR apontando para `/verificar/<hash>`. O código numérico continua visível (plano B offline).
- **Aceite:**
  - Confirmação sem checklist completo → 400.
  - Comprovante: 200 para as partes, 403 para terceiros.
  - `/verificar`: 200 com hash válido, 404 com hash alterado.
  - `UPDATE doacoes` direto no banco falha.
  - 100% das doações confirmadas têm hash.
  - QR: `image/png` para a dona da reserva, 403 para os outros, e o link gerado é o esperado.

### Revisão do L04

Antes de integrar, aplicar seção 4.3: autorização/IDOR em comprovante e QR, verificação pública, checklist, hash, imutabilidade e testes. Registrar `docs/agentes/REVISAO_L04.md`; executor corrige na própria branch. Não é checkpoint acumulado obrigatório adicional nem agente permanente.

---

### L05 — Notificações em tempo real (Fluxo 3)

- **Depende de:** L02.
- **Arquivos:** `server.js` ou `backend/src/tempo-real.js` (novo), `init.sql`, `index.html`, `backend/package.json` (+`ws`), `test/06-notificacoes.test.mjs`.
- **Fazer:**
  - WebSocket em `/ws`, no mesmo servidor HTTP. Autenticação: o **primeiro frame é o JWT** (nunca na URL); sem token válido em 5 s, desconecta.
  - Eventos:
    - `lote_publicado` e `lote_liberado` → receptoras **dentro do raio**, marcadas como "urgente" se vence em ≤ 1 dia;
    - `lote_reservado` → doador;
    - `retirada_confirmada` → receptora.
  - Tabela `notificacoes` (sino com contador, marcar como lida). Funciona mesmo sem o WebSocket.
  - Front: conecta ao logar, reconecta com espera crescente, mostra aviso e recarrega a lista.
- **Aceite:**
  - Cliente `ws` no teste: a ONG dentro do raio recebe `lote_publicado` em até 2 s; a ONG fora do raio **não** recebe.
  - Conexão sem token é derrubada.
  - Notificações persistidas e marcáveis como lidas.

### L06 — Cadastro completo, termo de responsabilidade/LGPD e KPIs (Fluxo 1, risco sanitário, seção 6.1)

- **Depende de:** L01 e L02.
- **Arquivos:** `server.js`, `init.sql`, `index.html`, `backend/public/termos.html` (novo), `test/07-cadastro-kpis.test.mjs`.
- **Fazer:**
  - Cadastro com **endereço, responsável e telefone**.
  - **Aceite obrigatório** do Termo de Responsabilidade e da Política de Privacidade (`aceite_termos_em`). Em `termos.html`, as citações legais vêm marcadas `[VERIFICAR]`.
  - ONG pode anexar o **comprovante de entidade sem fins lucrativos** (PDF/JPEG/PNG ≤ 1 MB, tipo real validado).
  - Coluna `situacao` (padrão `aprovado`; usada pelo extra X1).
  - Painel com kg, refeições, CO₂e, água, **entidades beneficiadas**, **TMR** (média de `reservado_em − criado_em`, em minutos, meta < 90) e **TEC** (entregues ÷ (entregues + expirados), meta > 92%), com a meta ao lado.
  - "Meus números" por perfil.
- **Aceite:**
  - Cadastro sem aceite → 400; anexo inválido → 400.
  - TMR e TEC batem com dados controlados do teste.
  - "Meus números" só conta as doações do próprio usuário.

### L07 — Pronto para o VPS, sem tocar no VPS (D6/D7)

- **Arquivos:** `docker-compose.prod.yml`, `deploy/Caddyfile`, `.env.example`, `server.js`, `docs/DEPLOY.md`, `test/08-saude.test.mjs`.
- **Fazer:**
  - `GET /saude` → `{ ok, banco }`.
  - `trust proxy`.
  - Cabeçalhos `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`. **Sem CSP de script** (o front usa handlers inline).
  - `docker-compose.prod.yml`:
    - `db`, `app` e `caddy`; **só o Caddy expõe portas** (80/443);
    - variáveis vindas do `.env`; volume persistente; `restart: unless-stopped`.
  - `Caddyfile` com `{$DOMINIO}`: HTTPS automático, proxy para `app:3000` (o WebSocket passa sozinho), compressão.
  - `.env.example` só com placeholders.
  - `DEPLOY.md` genérico:
    - DNS tipo A, firewall 22/80/443, subir o compose, logs, backup com `pg_dump`;
    - uma seção **"O que isto tem de Redes"** (DNS, portas, TLS 1.3, proxy reverso, upgrade do WebSocket), que alimenta o relatório.
- **Aceite:**
  - `/saude` testado.
  - O teste lê o `docker-compose.prod.yml` e confirma que **não** há `5432:` nem `3000:` publicados.
  - Verificação de segredos com `rg` ou ferramenta equivalente: procurar credenciais e valores reais de configuração nos arquivos versionados, excluindo dependências e documentos de terceiros. Revisar os resultados; URLs de documentação, exemplos fictícios e endereços locais de teste não são segredos. Não considerar a ausência de um domínio específico prova de segurança.

### L08 — Seed de demonstração, README e roteiros

- **Arquivos:** `db/init.sql` (seed), `README.md`, `docs/ROTEIRO_DEMO.md`, `docs/ROTEIRO_PRINTS.md`, `backend/test/carga.mjs`, `docs/testes/resultado-carga.md`.
- **Fazer:**
  - Seed com histórico de 30 dias (indicadores começam com números), lotes com e sem foto, uma reserva perto de expirar.
  - README atualizado (funcionalidades, rotas, contas, como rodar com Docker, local e testes).
  - `ROTEIRO_DEMO.md`: a demo de 5–7 min reproduzindo o **Cenário 1** com notificação e QR pelo celular.
  - `ROTEIRO_PRINTS.md`: cada tela, com conta, estado esperado e seção do relatório onde entra.
  - `carga.mjs` (fora do `npm test`): 20 e 200 requisições simultâneas, com tempo médio, p95, erros e "1 reserva venceu"; resultado salvo em `resultado-carga.md`.
- **Aceite:** `npm test` verde com o seed novo; os roteiros só citam o que existe; o resultado de carga foi gerado.

### Revisão final do escopo entregue

Após todos os lotes escolhidos e correções, revisar `git diff baseline..main`, relatórios por lote e fluxo integrado. Registrar commit e conclusão em `docs/agentes/REVISAO_FINAL.md`, com foco em:

- autorização, concorrência de reservas e expiração;
- comprovantes, QR, exposição pública e anexos implementados;
- autenticação e destinatários de WebSocket dentro do raio;
- deploy, portas, segredos e limites da validação local;
- consistência entre seed, README, roteiros, produto e relatório;
- testes relevantes e pendências impeditivas.

Executor corrige em branch própria e revisor verifica achados críticos/altos; atualizar commit final revisado. Não declarar implementados os itens adiados.

---

### Extras (só se sobrar cota; senão viram "melhorias futuras")

- **X1 — Admin e aprovação de cadastros:** perfil admin via seed; cadastro novo fica `pendente`; o admin vê a fila e o anexo da ONG e aprova ou recusa; relatório auditável com exportação CSV.
- **X2 — Raio configurável (5/10/15/20 km) e lote volumoso** (≥ 100 kg visível até 20 km), aplicados na listagem, na reserva e nas notificações.
- **X3 — PWA:** manifest + service worker; reservas ativas (código + QR) visíveis offline.

**Dependências e escopos:**

- L00 → todos; L01 → L02/L07; L02 → L03/L04/L05/L06.
- **L08-nucleo** (subescopo de L08): seed compatível com o que existe + README, após L01/L02/L04/L05/L07. Foto não é exigida enquanto L03 estiver adiado. Registrar L08 como parcial, com complemento pendente.
- **L08-complemento:** roteiros, carga e atualização de seed/README após decidir inclusão de L03/L06. Depende dos lotes escolhidos, não de itens explicitamente adiados.
- Extras: X1 após L06; X2 após L02/L05, compatível com L03 se incluído; X3 após L04 e estabilização do front. Todos dependem do núcleo validado e exigem testes e atualização de L08 quando mudarem comportamentos.

**Ordem vigente:**

`L00 → L01 → L07 → L02 → L04 → L05 → L08-nucleo`

Revisões por risco ocorrem **antes de integrar cada lote aplicável**. Meta do núcleo: 28/10 à noite, sujeita ao progresso real; sem promessa de execução noturna contínua.

**Depois, por prioridade e capacidade até congelamento:**

`L03 → L06 → L08-complemento → extras selecionados → atualização de L08 → revisão final → prints definitivos`

Se L03/L06 forem adiados, registrar e seguir para L08-complemento. Roteiros e carga descrevem o escopo entregue. Antes de extras, reservar tempo para revisão final, correções e relatório. Repetir carga somente se mudanças posteriores afetarem o cenário medido.

L07 vem cedo para o grupo testar DNS, HTTPS, firewall e proxy no VPS. Agentes preparam arquivos genéricos e validação local; grupo faz deploy. Não presumir que reconstruir contêineres aplica schema em volume existente: documentar backup e procedimento de atualização em L07.

## 7. Calendário vigente — entrega 30/10 às 22h

Datas são metas; estado e evidências mostram andamento real. Reavaliar duração e consumo após L00/L01, reservando tempo para revisão/correção.

| Quando | Trabalho técnico: Claude ou Codex | Grupo, em paralelo |
|---|---|---|
| **27/10, noite** | Fase 0 + L00 acompanhado; iniciar L01 após fundação validada | Conferir ambiente, regras e retomada; não depender de automação inexistente |
| **28/10** | Concluir núcleo na ordem da seção 6, com revisões por risco | Testar VPS após L07; iniciar relatório independente do código; testar QR quando disponível |
| **29/10** | Selecionar L03/L06; L08-complemento; extras só com margem; revisão final ao encerrar escopo | Revisar fluxos/limitações, escrever seções técnicas, preparar prints definitivos após estabilização |
| **30/10, até 12h** | Encerrar correções/revisão final; congelar funcionalidades ao meio-dia | Confirmar versão e prints finais |
| **30/10, 12h–18h** | Só bug crítico impeditivo da demo, com testes/revisão da mudança | Fechar relatório, conferir marcadores, gerar zip sem `.env`/`node_modules`; atualizar prints afetados |
| **30/10, 22h** | Entrega oficial; pacote pronto preferencialmente até 18h | Enviar material conferido |
| **31/10–02/11** | Sem novas funcionalidades no material entregue | Ensaiar demo; cada integrante explica os lotes sob sua responsabilidade |

**Regra de corte:** X3 → X2 → X1 → L06 → L03. Registrar ausências como limitações/melhorias futuras, sem alegar conformidade completa. Preservar L00/L01/L02/L04/L05/L07, seed/README e roteiros de L08, revisão final e evidências dos testes. Se até o núcleo estiver em risco, comunicar bloqueio e renegociar escopo explicitamente, sem declarar conclusão sem aceite.

Mudanças após revisão final atualizam testes, revisão e documentos afetados. Código, prints e relatório devem representar a mesma versão.

---

## 8. Fase 3 — Relatório Técnico novo (começa em paralelo em 28/10; seções técnicas depois do protótipo)

- Fontes: Etapa 4 (texto-base), código final, `LOG.md`, `REVISAO_*.md`, resultados dos testes e da carga, `DEPLOY.md`, prints.
- Seções exigidas pela DAC: problema, justificativa, público, objetivos, pesquisa, requisitos, solução, tecnologias, arquitetura, desenvolvimento, **testes**, viabilidade, sustentabilidade, **limitações**, **melhorias futuras**, conclusão, referências, articulação com as 4 disciplinas.
- Mudanças em relação à Etapa 4:
  - stack real (D1);
  - VPS próprio no lugar de Vercel/Render, descrito de forma genérica (D7);
  - WebSocket + central de notificações em vez de push/e-mail (D3);
  - hash SHA-256 como assinatura (D8);
  - resultados reais dos Cenários 1–3 e dos KPIs.
- O executor pode redigir o rascunho com perfil padrão em etapa separada; não é necessário agente fixo de redação. Toda citação legal ou dado externo vem marcado `[VERIFICAR]`; o que só o grupo sabe (Etapas 1–3, pesquisa de campo), `[GRUPO]`. **Nada inventado.**

---

## 9. Riscos do plano

| Risco | Mitigação |
|---|---|
| Cota/sessão termina no meio do lote | Checklist, commits parciais e próximo passo; retomar por arquivos em qualquer ferramenta |
| Troca de pessoa/máquina/fornecedor | Regras comuns e evidências; ID de sessão opcional; revalidar configuração local |
| Modelo herdado/substituído sem perceber | Registrar solicitado/efetivo/esforço e substituições; conferir disponibilidade |
| Agentes demais ou edição concorrente | Um executor por vez; delegação delimitada pela seção 2.3 |
| Automação consome prazo do produto | Controlador já incorporado; L00 fica focado nos testes, sem expandir automação |
| Loop de correção/espera | Rodada delimitada, hipótese nova para retentar, orçamento observado e parada registrada |
| Permissão/cliente incompatível | Validar ferramenta; não presumir flags ou permissões equivalentes |
| Teste verde oculta requisito ausente | Aceite por comportamento, revisão por risco e revisão final do commit entregue |
| Reset/deploy perde dados | Banco exclusivo de testes, guarda antes de DROP; backup/schema pelo grupo |
| Grupo não entende código | LOG, testes manuais e responsabilidade dos integrantes por lotes |
| Dados do VPS expostos | D7, verificação L07, revisão e placeholders |
| Mudança depois de prints/revisão | Revalidar diff/testes/documentos; atualizar commit final |

---

## 10. Para quem assumir a execução

1. Usar conta própria na ferramenta escolhida; confirmar cliente, modelo e permissões. Claude e Codex podem alternar, sem execuções escrevendo simultaneamente.
2. Transferir código, histórico Git quando existente, instruções e `docs/agentes/`. Não copiar credenciais, `.env` real, sessões autenticadas ou banco com dados pessoais. Preparar dependências/banco local novamente.
3. Ler `AGENTS.md`, plano e registros. Se fundação ainda não existir, começar pela seção 3/L00; não presumir script, testes ou estado criados.
4. Conferir Git, estado, checklist e revisão mais recente. Reconciliar divergências antes de editar. `aguardando_revisao` exige revisão; `bloqueado`/`falhou` exige diagnóstico e condição de retomada.
5. Configurar Claude ou Codex conforme seção 2.2 e registrar execução. Não copiar permissões entre ferramentas presumindo equivalência.
6. Retomar branch e usar prompt da seção 4.2. Sem sessão antiga, continuar pelo código/evidências; não reiniciar lote concluído nem alterar histórico da fila para esconder falha.
7. Conferir adaptadores e configuração do controlador incorporado e executar `agentes.cmd iniciar` ou `retomar`, conforme o estado. Não abrir outro executor manual editando a pasta ao mesmo tempo.
8. Preservar referências, trabalho alheio e itens concluídos. Mudança de escopo/regras/plano fica explícita em tarefa de planejamento. Agentes não acessam VPS.

## 11. Referências de configuração

Consultadas na revisão de 27/10/2026. Conferir novamente ao configurar outro cliente; modelos e recursos dependem da conta e versão instalada.

- [OpenAI Docs — subagentes, modelos, esforço e configuração](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [Claude Code — configuração de modelos e aliases](https://code.claude.com/docs/en/model-config)
- [Claude Code — subagentes e seleção de modelos](https://code.claude.com/docs/en/sub-agents)
