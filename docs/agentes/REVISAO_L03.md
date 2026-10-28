# Revisão L03 — Foto autorizada e horário limite de retirada

- Data: 28/10/2026. Revisor: claude (fase review), executor único, sem subagentes. Branch `lote/L03`, diff `main..HEAD` (commit 9af474f).
- Lidos: AGENTS.md, PLANO_AGENTES.md §L03, progresso/L03.md, LOG.md, diff completo (server.js, validacao.js, init.sql, index.html, testes, README).
- Nenhum código, teste ou documento além deste relatório foi alterado.

## Resultado: **continue** (1 achado alto)

Os critérios de aceite do plano estão cumpridos e cobertos por testes, mas a combinação do novo `retirada_ate` com a liberação de reservas do L02/L05 gera notificação urgente falsa, reproduzida abaixo. Precisa de correção e teste antes de integrar.

## Evidências

- `npm.cmd test` em backend/ (repetido nesta revisão): **137 tests / 137 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo**, ~29,9 s, banco `alimentams_test`.
- Aceite do plano conferido no código e nos testes de `backend/test/04-lote.test.mjs`:
  - com foto JPEG/PNG e sem foto → 201; 400 KB exatos → 201, +1 byte → 400;
  - não imagem (texto, HTML, GIF, PDF, PNG truncado, assinatura errada), fuzz e corpo acima do limite → 400 JSON, nunca 500;
  - `retirada_ate` ausente, no passado, depois do fim do dia da validade e formatos inválidos → 400;
  - foto: receptora fora do raio e outro doador → 404 JSON; sem token → 401; lote reservado → só a receptora que reservou e o dono.
- Segurança da foto: tipo decidido pela assinatura (`validacao.js`), CHECKs no banco (par foto/tipo, tipos permitidos, ≤ 409600 bytes), `Content-Type` só jpeg/png, `nosniff` global, `Cache-Control: private, no-store`; a listagem traz só `tem_foto`; o front busca a foto com o token (blob), sem token na URL. SQL parametrizado.
- Reprodução manual (servidor local em 3000, banco descartável, script temporário fora do repositório, já removido): ver achado A1.
- **Conferência visual pelo Claude in Chrome** (http://localhost:3000, contas do seed):
  - Doador comper: aba Publicar mostra "Retirar até" (padrão 29/10 18:00, max 30/10 00:00). Horário no passado → mensagem "O horário limite de retirada deve estar no futuro.".
  - PNG de 2400x1600 gerado na página e injetado por script (DataTransfer) foi reduzido a JPEG 1024x683 (~55 KB). Prévia exibida; publicação OK; card com miniatura e "retirar até 29/10 17:30".
  - Receptora amambai: mesmo card com miniatura carregada. O formulário de reserva tem max 29/10 17:30 e o texto do horário limite do lote.
  - Não visto: seletor de arquivo nativo, viewport móvel, receptora longe (coberta só por teste automatizado).

## Achados

### A1 — Alta — notificação urgente "Lote disponível novamente" para lote cujo horário limite já passou
- `backend/src/server.js:182` (liberação) e `:192` (`notificarReceptoras('lote_liberado', …)`). O passo de expiração em `:169` só considera `status = 'disponivel'` e roda antes da liberação.
- A janela da reserva deve terminar até `retirada_ate`, e a liberação só ocorre em `janela_fim + 30 min`. Por isso, quando `retirada_ate < janela_fim + tolerância`, a liberação devolve a `disponivel` um lote já sem prazo de retirada. O caso comum é a janela terminar no horário limite.
- Esse lote dispara notificação **urgente** (WS e central) para todas as receptoras no raio. Elas não o encontram na lista, a reserva devolve 409 e na consulta seguinte o lote vira `expirado`.
- Reproduzido: lote 88 publicado e reservado; no banco, janela_fim = now−40 min e retirada_ate = now−10 min. `GET /lotes` (amambai) → lote fora da lista, status `disponivel`. **8 notificações `lote_liberado` urgentes** gravadas (usuários 4, 5, 7, 9, 10, 11, 12, 13). Reserva da amambai → 409. Eventos: `publicado, reservado, liberado, expirado`.
- Nenhum teste cobre o caso: o teste do L03 só verifica a expiração de lote `disponivel`.
- Correção sugerida: na liberação, lote com `retirada_ate <= now()` deve ir direto a `expirado`, sem notificação. Exemplos: filtrar `retirada_ate > now()` em `atrasados` e expirar os demais, ou expirar no primeiro passo os reservados com janela + tolerância vencida e `retirada_ate <= now()`. Teste: reserva vencida com prazo passado não gera `lote_liberado` e termina `expirado`.

### A2 — Baixa — miniatura quebrada para bytes com assinatura válida mas não decodificáveis
- `backend/public/index.html:390` exibe a `<img>` sem `onerror`. O servidor aceita qualquer conteúdo com assinatura JPEG/PNG (conforme o plano). No navegador, os lotes de teste com "JPEG" sintético mostraram ícone de imagem quebrada com o texto alternativo.
- Sugestão: `onerror` remove a miniatura.

### A3 — Baixa — "retirar até 30/10 00:00" para lote válido até 29/10
- `backend/public/index.html:345`. O fim do dia é exibido como 00:00 do dia seguinte, e todos os lotes do seed e os padrões aparecem assim (visto no navegador: "válido até 29/10 · retirar até 30/10 00:00"). Isso pode confundir. Sugestão: exibir "29/10 23:59" ou "fim do dia 29/10".

### A4 — Baixa — limite de 700 KB aplicado antes da autenticação e só no caminho exato
- `backend/src/server.js:32` e `:529`. Requisições anônimas a POST /lotes têm até 700 KB analisados antes do 401, aceitável no MVP.
- `POST /lotes/` (barra final) cai no limite padrão e recebe 413 em vez de 400. O front não usa esse caminho.

### A5 — Baixa (conhecida) — `docs/testes/e2e-api.mjs` desatualizado
- O script histórico publica sem `retirada_ate` e agora recebe 400. A limitação já está registrada no LOG/checklist.

## Qualidade dos testes
- Bons: fronteiras exatas (400 KB, 00:00 do dia seguinte, validade de hoje), fuzz sem 500, autorização da foto por perfil/raio/reserva, CHECKs do banco e front em VM (escape do alt, token no header, redução no canvas).
- Os testes anteriores só ganharam `retirada_ate` no corpo, sem asserção removida ou afrouxada.
- Lacuna: interação liberação × `retirada_ate` (A1).

## Próximo passo
Corrigir A1 em `server.js:169-192` com teste em `04-lote.test.mjs` (ou `06-notificacoes`). A2/A3 são opcionais no mesmo ciclo. Depois, repetir `npm test` e fazer nova revisão.
Conferência visual humana segue pendente só para o seletor nativo de arquivo e o viewport móvel (roteiro no checklist L03).

---

## Revisão 2 — 28/10/2026 (claude, review) — commit 3cd37d0

- Revisor: claude, executor único, sem subagentes. Diff `main..HEAD` relido por completo, com atenção à correção `9af474f..3cd37d0` (server.js, index.html, 04-lote, 06-notificacoes). Achados da revisão 1 preservados acima. Só este relatório foi alterado.

### Resultado: **ready** (nenhum achado crítico, alto ou médio em aberto)

### Situação dos achados
- **A1 (alta) — corrigido.** `backend/src/server.js:169-180`: o primeiro passo de `atualizarStatus` expira os lotes `reservado` com `retirada_ate <= now()` e `janela_fim + tolerância < now()`. Isso acontece antes da liberação em `:184-199`, que aplica a mesma condição de atraso. Assim, o lote não volta a `disponivel`, não gera `lote_liberado` nem notificação e perde o código (`codigo = NULL`). Um lote atrasado cujo prazo ainda não passou continua sendo liberado normalmente, porque a nova reserva também fica limitada a `retirada_ate`.
  - Teste novo: `backend/test/06-notificacoes.test.mjs:252`. São 4 chamadas simultâneas a `GET /lotes`; o teste verifica status `expirado`, código nulo, nenhuma `lote_liberado` para 4 usuários (inclusive o doador), eventos exatamente `publicado, reservado, expirado` e nova reserva → 409.
  - O teste detectaria a regressão: sem o novo `OR`, a liberação geraria o evento `liberado` e as notificações, e as asserções falhariam.
- **A2 (baixa) — corrigido.** `backend/public/index.html:393`: `onerror` remove a miniatura. No navegador, a receptora amambai tinha 7 lotes com `tem_foto`. Só os 2 decodificáveis foram exibidos; os 5 de bytes sintéticos foram removidos, sem ícone quebrado.
- **A3 (baixa) — corrigido.** `backend/public/index.html:293-299`: 00:00 aparece como "fim do dia dd/mm" (dia anterior). Há asserção em `04-lote.test.mjs:237`. No navegador: "retirar até fim do dia 29/10" para lotes válidos até 29/10.
- **A4 (baixa) — em aberto, não impeditivo.** O limite de 700 KB é aplicado antes da autenticação, e `POST /lotes/` com barra final recebe 413 em vez de 400 (`server.js:32`, `:534`). O front não usa esse caminho.
- **A5 (baixa) — em aberto, não impeditivo.** `docs/testes/e2e-api.mjs` está desatualizado (sem `retirada_ate`), o que já está registrado no checklist/LOG.

### Evidências desta revisão
- `npm.cmd test` em backend/ (executado nesta revisão): **138 tests / 138 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo**, ~32,1 s, banco descartável `alimentams_test`.
- Testes anteriores: só ganharam `retirada_ate` no corpo de `POST /lotes` (helper `retiradaAte`), sem asserção removida ou afrouxada (diff conferido em 00, 01, 02, 03, 05 e 06).
- Aceite do plano L03, conferido no código e nos testes:
  - com e sem foto → 201;
  - não imagem ou foto grande demais → 400;
  - `retirada_ate` no passado → 400;
  - receptora fora do raio → 404 na foto.
  - A janela de reserva respeita `retirada_ate`: `server.js:305-306` e `:315-316`.
  - A listagem traz só `tem_foto`; não há `SELECT *` nem outro caminho que devolva os bytes (grep em `backend/src`).
- **Conferência no navegador (Claude in Chrome, http://localhost:3000, servidor `node backend/src/server.js` em segundo plano, já encerrado; aba fechada):**
  - Receptora amambai (sessão já salva no navegador): A2 e A3 conferidos como descrito acima. A resposta de `GET /lotes` não tem campo `foto`.
  - Doador comper (conta do seed), aba Publicar:
    - padrão "Retirar até" 29/10 18:00, máx. 30/10 00:00;
    - PNG semitransparente de 2000x1500 (88 KB), gerado na página e injetado no seletor por script (DataTransfer), reduzido a JPEG 1024x768 (~14 KB);
    - prévia com fundo branco (transparência tratada);
    - "Publicar lote" → mensagem de sucesso; o card do lote 89 mostra a miniatura e "retirar até 29/10 18:00".
  - Receptora longe (login do seed via `fetch` na página): `GET /lotes/89/foto` → 404, e o lote não aparece na listagem dela.
  - Não visto: seletor nativo de arquivos, viewport móvel e mensagens de erro do formulário de reserva (estas estão cobertas por testes).

### Conferência visual humana PENDENTE (não impeditiva)
- Roteiro: entrar como comper@demo.com → Publicar lote → escolher pelo **seletor nativo** uma foto real grande (JPEG e PNG) → ver a prévia → publicar uma vez com horário limite no passado (deve dar erro) e outra com horário válido. Depois:
  - entrar como amambai@demo.com → ver miniatura e "retirar até" → reservar com janela além do limite (deve dar erro);
  - repetir em **viewport móvel**.
- Diagnóstico: a extensão não aciona o seletor de arquivos do sistema operacional, por isso o arquivo foi injetado por script. O viewport móvel não foi testado nesta sessão.

### Próximo passo
Controlador pode integrar o L03. A4/A5 ficam como melhorias de baixa severidade (sugestão: tratar `/lotes/` no limite do corpo e atualizar `e2e-api.mjs` no L08). Conferência visual humana segue pendente conforme o roteiro acima.
