# Revisão independente — L05 (WebSocket e notificações por destinatário)

- Data: 28/10/2026. Ferramenta: claude; papel: revisor. Modelo efetivo/esforço: `nao_verificado`.
- Branch `lote/L05`, HEAD `5890cbe`; diff revisado: `main..HEAD` (11 arquivos, +872/−19).
- Lidos: AGENTS.md, PLANO_AGENTES.md (§4.3 e L05), checklist `progresso/L05.md`, `LOG.md`.
- Revisor não alterou código, testes, schema, plano, controlador ou `.agentes/`. Só este arquivo foi escrito.

## Resultado

**Aprovado (ready)** — sem achados críticos ou altos. Um achado **médio** (M1) com impacto
registrado abaixo e correção recomendada antes da revisão final; três achados baixos/informativos.

## Verificação dos requisitos

| Requisito (plano L05) | Situação | Evidência |
|---|---|---|
| WS em `/ws` no mesmo servidor HTTP | OK | `backend/src/server.js:500-501` (`tempoReal.anexar(servidor)`); `tempo-real.js:77` (`path: '/ws'`); teste "caminho diferente de /ws não abre" |
| JWT no primeiro frame, nunca na URL; sem token válido em 5 s → desconecta | OK | `tempo-real.js:29-34,59-72,80-81`; front `index.html` envia `credencial` em `onopen`; testes cobrem ocioso (~5 s), token na URL, lixo, forjado, expirado, binário → 1008 |
| `lote_publicado`/`lote_liberado` → receptoras no raio, urgente se vence em ≤ 1 dia | OK | `server.js:144-153` (`ST_DWithin` com `RAIO_METROS`, `(validade - HOJE) <= 1`, só `perfil='receptora'`); usado em `server.js:176-189` e `:242-253` |
| `lote_reservado` → doador | OK | `server.js:298-316`: destinatário `o.doador_id` do lote efetivamente reservado na mesma instrução; reserva recusada não gera linha (teste dedicado) |
| `retirada_confirmada` → receptora | OK | `server.js:368-376`: `l.reservado_por`, dentro da transação; envio após `COMMIT` |
| Tabela `notificacoes`, contador, marcar como lida, funciona sem WS | OK | `db/init.sql:47-60`; `server.js:420-447` filtram sempre por `usuario_id = req.usuario.id`; alheia → 404 indistinguível; `/lidas` restrito ao próprio |
| Front: conecta ao logar, reconecta com espera crescente, aviso e recarga | OK, com ressalva M1 | `index.html` `iniciarTempoReal`/`pararTempoReal`; backoff 1 s→30 s; `sair()` fecha a conexão |

Autorização por destinatário (foco da revisão): o destinatário é escolhido **no servidor, em SQL**, na
mesma instrução/transação da transição; `publicar()` (`tempo-real.js:101-115`) entrega cada quadro só ao
`Set` de conexões do `usuario_id` gravado; identidade do WS fixada no primeiro frame e não trocável
(mensagens posteriores ignoradas, `tempo-real.js:85`); sessão encerra no `exp` do JWT. Payload
(`paraCliente`) sem `usuario_id`, código de retirada, hash ou JWT. Interpolações em SQL
(`tipo`, `titulo`, `HOJE`, placeholders) são constantes do código; dados do usuário vão por parâmetro.
Mensagens com `alimento`/nome são escapadas no front (`esc()` no toast e na central).

## Achados

### M1 — Médio — Rotatividade infinita de reconexões com mais de 5 sessões da mesma conta

- **Onde:** `backend/src/tempo-real.js:45-48` (expulsa a conexão mais antiga com **1008**) combinado com
  `backend/public/index.html:561-562` (zera `tentativasWs` ao autenticar e recarrega notificações + lista)
  e `index.html:571-573` (em 1008 com token ainda válido, chama `carregarNotificacoes()` e reconecta em 1 s).
- **Comportamento:** com 6+ abas/dispositivos da mesma conta, a aba expulsa reconecta em 1 s, autentica
  (zera o backoff), expulsa a próxima mais antiga, que faz o mesmo — ciclo sem fim. Cada volta dispara
  `GET /notificacoes` (2×) e `GET /lotes` (que executa `atualizarStatus()`, com duas instruções de
  escrita com `FOR UPDATE`), e as abas ficam alternadamente sem tempo real.
- **Reprodução (feita nesta revisão, navegador, banco descartável):** app em `localhost:3000` logado como
  conta de seed receptora; na própria página, 5 clientes WS com a mesma lógica de reconexão do front e o
  mesmo token. Em 10 s: **12 autenticações, 8 fechamentos 1008** e **16 requisições HTTP** só da aba real
  do app; o ciclo não convergiu até os clientes serem encerrados.
- **Impacto:** carga contínua (~1–2 req/s por conta) e escritas repetidas no banco; não há vazamento de
  dados nem quebra de autorização. Gatilho plausível (equipe de ONG com várias abas/celulares).
- **Testes:** nenhum teste cobre o limite de 5 conexões nem a reação do front ao 1008 por excesso.
- **Correção sugerida:** fechar por excesso com código de aplicação distinto (ex.: 4000–4999) e, no
  front, não reconectar nesse código (ou só reconectar sem zerar o backoff); alternativamente, recusar a
  conexão **nova** em vez de expulsar a antiga. Adicionar teste de WS real (6 conexões) e do front.

### B1 — Baixo — Sem teto global de conexões não autenticadas

- `tempo-real.js:79-81`: cada conexão anônima vive até 5 s, sem limite global/por IP (`maxPayload` 8 KiB
  mitiga parte). Já registrado como limitação no checklist. Sugestão: limite de pendentes por IP/global.

### B2 — Baixo — Resposta atrasada da conta anterior pode aparecer após troca de conta

- `index.html:489-493`: `carregarNotificacoes()` em voo quando o usuário sai e entra com outra conta
  grava `notificacoes`/`naoLidas` da conta anterior na nova sessão (até a próxima recarga). Exige troca
  de conta no mesmo navegador dentro da latência da requisição. Sugestão: descartar a resposta se `token`
  mudou desde o início da chamada.

### B3 — Informativo — Liberação é preguiçosa

- `lote_liberado` só nasce quando alguma rota de lotes chama `atualizarStatus()` (`server.js:190`);
  `GET /notificacoes` (`server.js:423`) não dispara a transição. Coerente com o contrato de L02 (sem
  job); registrar no README/roteiro de L08.

### Limitações já registradas pelo executor (confirmadas, não impeditivas)

- Bancos existentes precisam da tabela `notificacoes` (sem migração); JWT não revogável; sem expurgo.

## Qualidade dos testes

- `backend/test/06-notificacoes.test.mjs` usa cliente `ws` real contra o servidor do runner e o banco
  `alimentams_test`: raio (dentro/fora, doadores, conexão anônima), ≤ 2 s, urgência (hoje/amanhã/2 dias),
  persistência sem WS, IDOR em marcar lida/marcar todas, 401/400/404, reserva recusada sem notificação,
  concorrência de liberação e de reserva (uma notificação por destinatário), expiração do JWT, segundo
  frame não troca identidade, front em VM (JWT só no primeiro frame, escape, backoff 1/2/4 s, logout).
- Detectariam regressões de destinatário, de vazamento de código e de autenticação. Lacuna: M1 (limite
  de conexões) sem teste. Alterações em 02/05 só acrescentam o mapeamento `./tempo-real` nos harnesses
  VM — conferido no diff, nenhuma asserção alterada.

## Execuções desta revisão

- `npm.cmd test` em `backend/`: **116 tests / 116 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo**,
  ~23,9 s (runner recriou `alimentams_test`).
- Navegador (Claude in Chrome), `node backend/src/server.js` em segundo plano, `http://localhost:3000`,
  conta de seed receptora próxima; lote publicado por conta de seed doadora (validade amanhã, nome com
  `<b>`): WS `readyState 1`, toast **vermelho (urgente)** com HTML **escapado**, contador do sino
  atualizado sem recarregar; central aberta em screenshot com itens, rótulo "urgente" e botões, sem
  overflow horizontal da central. Reprodução de M1 conforme acima. Aba fechada e servidor encerrado.
- Observação fora do escopo L05: a página tem overflow horizontal causado por cartões de lote com texto
  longo gerados por testes anteriores no banco descartável (elementos `.meta`/`.qtd` dos cartões), não
  pela central/toast.

## Conferência visual humana PENDENTE (restante do roteiro)

Feito nesta revisão apenas: aviso urgente, contador e central para a ONG próxima. Pendente em tela
(coberto por testes automatizados, não visto): (1) ONG distante (Longe Demais) em sessão isolada não
recebe nada; (2) reserva → aviso e central do doador, sem código; (3) retirada confirmada → aviso só à
reservante; (4) liberação por janela vencida → só receptoras próximas; (5) central com WS desativado,
marcar como lida e recarregar; (6) interromper/restabelecer WS e ver espera crescente; (7) sair e entrar
em outra conta sem avisos da anterior. Diagnóstico: sessões isoladas simultâneas e controle de tempo não
foram montados nesta revisão; roteiro completo em `progresso/L05.md`.

## Próximo passo

Controlador pode integrar (sem críticos/altos). Recomenda-se corrigir M1 (com teste) antes da revisão
final, e opcionalmente B1/B2; humano executa o restante do roteiro visual.
