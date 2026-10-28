# L08-nucleo — Seed compatível e README

## Execução — 28/10/2026 (claude, implement)

- Executor único, sem subagentes; branch `lote/L08-nucleo`. Modelo/esforço: `nao_verificado`. Sem commits, staging, .git, .agentes, VPS, publicação ou dados reais.
- **L08 completo continua PENDENTE** (L08-complemento: ROTEIRO_DEMO, ROTEIRO_PRINTS, carga.mjs, resultado-carga.md, fotos se L03/L06 forem incluídos).

## Checklist

- [x] Seed em db/init.sql (após os 4 lotes originais, que mantêm ids 1–4):
  - 16 doações históricas em 30 dias (ids de lote 5–20): lote `entregue`, eventos publicado→reservado→entregue, checklist completo, comprovante JSON canônico v1 e SHA-256 calculados no próprio SQL (conferíveis por `hashDe` e por `/verificar/:hash`).
  - 1 reserva perto de expirar (lote 21, Pão Nosso → Esperança, código 482915, janela termina 25 min após a criação do banco) + notificação `lote_reservado` ao doador.
  - Sem fotos (L03 adiado).
- [x] Teste novo `backend/test/09-seed.test.mjs` (4 testes): hash/comprovante, ciclo de eventos, indicadores/histórico, reserva.
- [x] README: funcionalidades, como rodar (Docker, local), testes, seed, roteiro, tabela de rotas (inclui QR, comprovante, verificar, notificações, WS).
- [x] `npm test` em backend/: 120 testes / 120 pass / 0 fail / 0 skipped / 0 todo / 0 cancelled, código 0, ~30 s (banco `alimentams_test`).

## Decisões

- Instantes relativos a `now()`: em bancos antigos a reserva do lote 21 já terá sido liberada; o teste aceita os dois estados. Bancos existentes não são migrados (recriar volume).
- Nenhum teste anterior alterado.

## Conferência visual

- Feita parcialmente via Claude in Chrome: `node backend/src/server.js` em segundo plano, http://localhost:3000 aberto (já havia sessão da Casa de Apoio Esperança no navegador): indicadores com números (inclui dados deixados pelos testes), lote "Bolos e roscas" reservado com código 482915 e QR, sino de notificações com contador. Servidor encerrado.
- **Conferência visual humana PENDENTE** para o restante: com banco recém-criado, entrar como comper@demo.com (indicadores, Doações registradas com 16 itens, comprovante com hash e página /verificar/:hash), esperanca@demo.com (reserva 482915 próxima de vencer; histórico), longe@demo.com (sem lotes).

## Próximo passo

Controlador repete testes e chama revisão separada; depois L08-complemento.
