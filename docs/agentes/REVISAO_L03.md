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
