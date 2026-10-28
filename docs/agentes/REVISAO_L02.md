# Revisão L02 — Ciclo de vida, janela, expiração e histórico

- Data: 28/10/2026. Revisor: claude (fase review, sem subagentes). Branch `lote/L02`, diff `main..HEAD` (commit `4a1686e`).
- Lidos: AGENTS.md, PLANO_AGENTES.md §L02, `docs/agentes/progresso/L02.md`, `docs/agentes/LOG.md`, diff completo de `server.js`, `validacao.js`, `init.sql`, `index.html`, testes `00/01/02/03` e `helpers.mjs`, `docs/DEPLOY.md` (atualização de schema).
- Nenhum código, teste ou outro arquivo alterado nesta revisão; só este relatório.

## Resultado: APROVADO (ready) — sem impedimentos críticos ou altos

## Critérios de aceite

| Critério | Situação | Evidência |
|---|---|---|
| Janela envelhecida no banco → lote volta, outra ONG reserva, código antigo não confirma | OK | `03-ciclo-vida`: "janela vencida volta a disponível…" (tolerância 10 min mantém; 31 min libera; código antigo → 409 sem reserva e 400 após nova reserva; nova ONG confirma; `doacoes.receptor_id` = Amambai) |
| Lote vencido → `expirado`, invisível às ONGs e não confirmável | OK | testes "lote vencido disponível vira expirado" e "lote reservado que vence não confirma… (409)"; consulta da receptora em `server.js` só traz `disponivel` vigente no raio ou `reservado` pela própria ONG |
| Janela inválida → 400 | OK | 16 casos (fim ≤ início, > 2 h, passado, além do fim do dia da validade, formato, tipos, campo extra), todos 400 JSON `{erro}` e lote intacto, sem evento |
| Histórico registrado | OK | `eventos_lote` com CHECK de tipo; publicado/reservado/liberado/expirado/entregue gravados na mesma instrução/transação da mudança de estado; recusas não geram evento; sem duplicação sob 12 GETs simultâneos |
| `atualizarStatus()` no início das rotas de lotes, sem job | OK | chamada em GET/POST `/lotes`, `reservar` e `confirmar-retirada` |
| Doador vê "ONG X retira entre hh:mm–hh:mm"; Ativos/Expirados; "vencido" ≠ "vence hoje" | OK | teste de front em VM + conferência visual abaixo |

## Análise de risco (transições de estado e concorrência)

- `atualizarStatus` (`server.js:140-168`): cada passo é um único comando com CTE `SELECT … ORDER BY id FOR UPDATE` → `UPDATE` → `INSERT` de evento. Sob READ COMMITTED, uma segunda chamada simultânea reavalia o `WHERE` na versão nova da linha (status já mudado) e a ignora; ordem por id evita deadlock. Confirmado pelo teste de 12 chamadas simultâneas (1 evento `liberado`).
- `reservar`: o `UPDATE` condicional continua sendo a garantia de exclusividade (`status='disponivel'`, validade, raio); a pré-consulta só valida a janela. Teste C3 (10 reservas simultâneas) segue com 1 sucesso.
- `confirmar-retirada`: transação com `UPDATE … status='reservado' AND codigo=$3`; uma liberação concorrente bloqueia/serializa e o `UPDATE` reavalia e falha → 409/400. 409 só é exposto ao dono do lote (alheio continua 400, sem vazar estado).
- SQL todo parametrizado (fuso e colunas interpolados são constantes do código). Saída no HTML passa por `esc()` (teste com `ONG <X>` e `Ativo <b>`).
- Decisão documentada e aceitável: lote reservado que vence vira `expirado` mesmo dentro da tolerância da janela.

## Achados (nenhum crítico/alto)

1. **Médio — validação da janela antes da checagem de raio vaza disponibilidade e contradiz o checklist.** `server.js:244-254` checa só status/validade antes de validar a janela; o raio só é verificado no `UPDATE` (`server.js:276`). Uma ONG fora do raio que envia janela inválida recebe 400 (revelando que o lote existe e está disponível), enquanto antes do L02 recebia sempre 409. O checklist (`progresso/L02.md:11`) afirma "fora do raio continua 409 (checado antes da janela)", o que só é verdade com janela válida (o teste usa janela válida). Correção sugerida: incluir `ST_DWithin` na pré-consulta e um caso de teste com `longe` + janela inválida → 409. Não bloqueia: dados expostos são mínimos (existência/disponibilidade de um id).
2. **Baixo — texto da tolerância fixo em 30 min.** `index.html:287` escreve "mais 30 min de tolerância", mas `TOLERANCIA_MINUTOS` é configurável por env (`server.js:48-51`). Com outro valor, a ONG recebe orientação errada.
3. **Baixo — reservas legadas sem janela.** Em banco existente migrado manualmente, um lote `reservado` com `janela_fim` NULL nunca é liberado (`server.js:157`, `NULL + intervalo < now()` é nulo) e `textoJanela` (`index.html:266`) faz `null.split` e quebra a tela "Meus lotes". Afeta só volumes antigos; sugerido registrar no DEPLOY/LOG o `ALTER` + tratamento (ex.: preencher janela ou liberar) dessas reservas.
4. **Baixo — possível intermitência de teste.** `03-ciclo-vida.test.mjs:75` monta `local()` e `local(120)` em instantes separados; se a virada de minuto ocorrer entre eles, a janela vira 121 min → 400. Raro, mas possível.
5. **Baixo (já registrado pelo executor)** — `docs/testes/e2e-api.mjs:32-35` ainda reserva sem janela (script histórico fora do `npm test`).
6. **Informativo (anterior ao L02)** — textos longos sem espaço (dados do fuzz L01) estouram os cartões e criam rolagem horizontal; visto na conferência.

## Testes executados nesta revisão

- `npm.cmd test` em `backend/` (banco descartável `alimentams_test`): **87 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo**, 17746,65 ms.
- Qualidade: testes novos verificam estado no banco, eventos com ator, corpo de erro e não regressão (C3 e fuzz L01 mantidos). Alterações em testes antigos só adaptam ao novo contrato (reserva exige janela) e à FK de `eventos_lote`; nenhuma asserção removida ou afrouxada.

## Conferência visual (feita nesta revisão — Claude in Chrome)

- Servidor `node backend/src/server.js` (porta 3000, banco descartável), encerrado ao final; aba fechada. Sem prints salvos em disco.
- Doador Comper: seções **Ativos** e **Expirados**; cartão reservado mostra "Casa de Apoio Esperança retira entre 02:23–03:23" com campo de código; 3 cartões expirados com etiqueta "expirado", texto "O prazo de validade passou sem retirada." e sem "Confirmar retirada".
- ONG Casa Esperança: "Reservar retirada" abre formulário `datetime-local` (02:24–03:24) com campos empilhados e legíveis; fim alterado para 05:24 (3 h) → erro inline "A janela de retirada pode ter no máximo 2 horas." com formulário aberto; fim 03:24 → reserva criada, cartão com código e "Retire entre 02:24–03:24 … (mais 30 min de tolerância)".
- Não verificado visualmente: etiqueta "vencido" (não havia lote nesse estado na tela; coberta por teste de front), liberação por janela vencida na tela (coberta por teste de API).

## Próximo passo

Integrar o lote. Recomenda-se tratar o achado 1 (e, se possível, 2–4) num ajuste curto ou num lote seguinte (L03, que altera o limite da janela, é o ponto natural).
