# Pendências reproduzidas no L00 — correção no L01

Em 28/10/2026, a primeira execução da adaptação de `e2e-api.mjs` em banco
recriado de `db/init.sql` confirmou **39 aprovações e 9 falhas** (48 verificações,
código 1). Aplicação sem alterações, baseline `cf88651`.

| Verificação | Esperado original | Observado | Evidência em backend/src/server.js |
|---|---|---|---|
| Validade `2026-02-31` | 400 | 500, erro interno | Linha 135: PostgreSQL 22008 ao converter data |
| Alimento numérico `123` | 400 | 500, erro interno | Linha 141: alimento.trim não é função |
| Categoria arbitrária | 400 | 201 com id | Linhas 130–141: ausência de allowlist |
| Quantidade `1e12` | 400 | 500, erro interno | Linha 138: PostgreSQL 22003, overflow numérico |
| Alimento somente espaços | 400 | 201 com id | Linha 141: trim após teste de presença |
| CNPJ `123` | 400 | 201 | Cadastro sem validação de CNPJ |
| E-mail `naoeemail` | 400 | 201 | Cadastro sem validação de formato |
| Senha numérica | Diferente de 500 | 500, erro interno | Linha 69: bcrypt rejeita tipo number |
| ID `abc` ao reservar | Diferente de 500 | 500, erro interno | Linha 150: PostgreSQL 22P02 |

Esses casos são executados, com as asserções originais, como TODO somente quando
a assinatura observada coincide com a registrada em `backend/test/helpers.mjs`.
Os casos corrigidos passam automaticamente sem TODO. Assinatura diferente ou
falha em qualquer outro caso retorna código não zero. Não há skip.

Para reproduzir todas as falhas como impeditivas, defina `TEST_STRICT_KNOWN=1`
antes de `npm test` em backend/. O L01 deve corrigir os nove casos e retirar
suas entradas da lista de pendências; não reduzir os critérios das asserções.

Limite: a assinatura de um 500 é o status e o JSON público; o erro interno
original está descrito acima. Uma causa interna diferente que produza a mesma
resposta pública exige investigação dos logs e não pode ser distinguida apenas
por essa assinatura.
