# Revisão L01 — Validações, robustez e CNPJ

- Data: 28/10/2026 (America/Campo_Grande). Ferramenta: claude; papel: revisor independente. Sem subagentes.
- Commit revisado: `0b01a50` (branch `lote/L01`), diff `main..HEAD`.
- Escopo: requisitos e aceite da seção L01 do PLANO_AGENTES.md, PENDENCIAS_L01.md, checklist L01 e LOG.md; código em `backend/src/server.js`, `backend/src/validacao.js`, `backend/public/index.html`, `db/init.sql`, `backend/test/02-validacoes.test.mjs` e `backend/test/helpers.mjs`.
- Nenhum código, teste ou outro arquivo foi alterado nesta revisão; somente este relatório foi escrito.

## Conclusão

**Correções necessárias (continue).** Não encontrei achado crítico nem alto. Encontrei **um achado médio** que viola diretamente a regra do AGENTS.md "entrada inválida não pode gerar 500", dentro do escopo de robustez deste lote, e que não tem justificativa registrada. A correção é pequena. Os demais achados são baixos ou informativos.

## Verificações feitas

| Item | Resultado |
|---|---|
| `npm test` em backend/ (nesta revisão) | código 0; **65 pass / 0 fail / 0 todo / 0 skipped / 0 cancelled**; node:test 8188 ms |
| Nove pendências do L00 (PENDENCIAS_L01.md) | Mapa `known` removido de `helpers.mjs`; `ok()` agora faz assert direto, sem TODO. Os nove casos passaram. As asserções originais não foram afrouxadas. |
| Tipo/trim/limites | `validacao.js:14-20`: verifica o tipo, aplica trim antes de checar vazio e o limite, e rejeita `\0`. Usado em todos os campos das cinco rotas. |
| `:id` inteiro positivo | `validacao.js` `id()`: `^[1-9]\d{0,9}$` e ≤ 2147483647; URL com escape inválido vira JSON 400 (`server.js:245`). |
| Quantidade 0 < kg ≤ 10.000 | Ok; até duas casas (NUMERIC(10,2)); string decimal aceita para compatibilidade com o formulário. |
| Data real | Ok; ida e volta pelo ISO rejeita 31/02, 29/02 em ano não bissexto e 0000. |
| Categoria fechada / e-mail | Ok (cinco categorias, igual ao `<select>` do front); regex de e-mail com limites de 64/254. |
| CNPJ por DV, com/sem máscara, normalizado | Pesos conferidos manualmente (5,4,3,2,9..2 / 6,5,..2). Testes conferem o valor gravado no banco = 14 dígitos. `…-81` aceito; `…-82` e `123` dão 400. |
| Seed com CNPJs fictícios válidos | 6 CNPJs sintéticos; o teste valida cada um com `validar.cnpj`. |
| JSON malformado → 400 JSON | Ok (`server.js:249`). |
| `pool.on('error')` | Ok (`server.js:19`); teste com pg injetado confirma que um erro de conexão ociosa não derruba o processo. |
| Produção sem JWT_SECRET não sobe | Ok; testado com ausente, vazio e só espaços. |
| Falha interna continua 500 | Ok: só `ErroValidacao` vira 400 (`server.js:40`); teste com pg injetado confirma o 500. |
| Fuzz por campo (register, login, POST /lotes, reservar, confirmar) | Coberto por `02-validacoes.test.mjs`: string, número, null, array, objeto, bool, undefined, espaços, `\0`, texto longo. Nenhum 500. |
| SQL parametrizado / autenticação e perfil | Inalterados e preservados. Validação de id/corpo ocorre depois de `autenticar`/`exigirPerfil`. |
| Express 4.22.3 / body-parser 1.20.9 | `req.body` vira `{}` quando não há corpo, então o `corpo(req.body, [])` da reserva funciona com o `api()` do front, que não envia corpo. |

### Sondagem manual da API (servidor local, banco descartável do ambiente)

Fiz requisições Node `fetch` contra `node backend/src/server.js` (porta 3000):

- `Content-Encoding: gzip` com corpo inválido → **500** `{"erro":"Erro interno do servidor."}`. Com `deflate`, o mesmo **500**. (Ver M1.)
- `Content-Encoding: br` → 415; `charset=latin9` → 415; corpo `"texto"` → 400; `text/plain` → 401 (o corpo é ignorado); campo extra ou `__proto__` → 400.

### Conferência visual (Claude in Chrome, http://localhost:3000)

Esta revisão executou a conferência visual de fato. O servidor foi encerrado e a aba fechada ao final. Prints não foram salvos em disco.

- Cadastro de ONG (perfil receptora): CNPJ **digitado** `11444777000161` mascarado para `11.444.777/0001-61`; conta criada com e-mail de teste `@example.test`.
- **Colagem** (simulada via `execCommand('insertText')`, que dispara `input` como uma colagem): `11222333000181` → `11.222.333/0001-81`; `11.222.333/0001-81` mantido. Colando ` 11.222.333/0001-81` (com espaço à esquerda), o resultado é `11.222.333/0001-8`, sem o último dígito (ver B1).
- ONG reservou o lote "Pães e panificados" e o código de retirada foi exibido. O doador demo `pao@demo.com` digitou o código `12a` e viu "Código de retirada inválido: informe seis dígitos.". Com o código correto, a retirada foi confirmada e o indicador passou de 51 para 59 kg.
- Aba Publicar: data padrão `2026-10-29` (amanhã em Campo Grande). Quantidade vazia → "Quantidade deve ter entre 1 e 16 caracteres, sem caractere nulo." (ver B2).
- `Sair` voltou à tela "Entrar" (correção de `sair()` presente).
- A conferência anterior do executor (erro `…-82`, aceite `…-81`, quantidade 2.5, login demo Comper) não foi repetida e continua registrada no checklist.

## Achados

### M1 — Médio — Corpo comprimido inválido gera 500

- **Arquivo:** `backend/src/server.js:244-257` (tratador de erros final).
- **Comportamento:** o body-parser 1.x converte erros de descompressão (zlib) com `createError(400, err)`, sem `type`. Nenhum ramo do tratador reconhece esse erro, então ele cai em `console.error` e em `res.status(500)`.
- **Reprodução:** `POST /auth/login` com `Content-Type: application/json`, `Content-Encoding: gzip` e corpo `xxxx` → `500 {"erro":"Erro interno do servidor."}`. O mesmo ocorre com `deflate`. Vale para qualquer rota JSON.
- **Impacto:** viola a regra "entrada inválida não pode gerar 500" (AGENTS.md; PLANO §5.5), dentro do objetivo de robustez do L01. Também polui os logs de erro interno com entrada de cliente. Não expõe dados. A suíte não detectaria a regressão.
- **Correção sugerida:** antes do fallback 500, tratar erros de cliente do parser de forma genérica, por exemplo `if (erro.expose && erro.status >= 400 && erro.status < 500) return res.status(erro.status).json({ erro: 'Requisição inválida.' })` (mensagem pt-BR, sem ecoar `erro.message`). Manter os ramos específicos já existentes. Adicionar teste em `02-validacoes.test.mjs` com `Content-Encoding: gzip` e corpo inválido esperando um 4xx em JSON.

### B1 — Baixo — Colar CNPJ com espaço/rótulo perde dígitos

- **Arquivo:** `backend/public/index.html:104` (`maxlength="18"`).
- **Comportamento:** o navegador trunca o texto colado em 18 caracteres antes de `mascararCnpj` filtrar os não dígitos. Ao colar ` 11.222.333/0001-81` (espaço à esquerda, comum ao copiar de documentos), o campo fica `11.222.333/0001-8`, e o servidor responde "CNPJ inválido." sem que o usuário perceba o motivo.
- **Correção sugerida:** remover `maxlength` (a máscara já limita a 14 dígitos com `slice(0, 14)`) ou ampliá-lo. Opcionalmente, cobrir no teste do front.

### B2 — Baixo — Mensagem técnica para campo vazio

- **Arquivo:** `backend/src/validacao.js:17-18`, usado em `:63` para a quantidade.
- **Comportamento:** quantidade vazia no formulário Publicar mostra "Quantidade deve ter entre 1 e 16 caracteres, sem caractere nulo.". Alimento vazio mostra mensagem do mesmo tipo. O status 400 está correto, mas o texto é confuso para o usuário final.
- **Correção sugerida:** separar a mensagem de vazio ("Informe <campo>.") da de excesso de tamanho.

### B3 — Baixo — Texto longo sem quebra estoura o card

- **Arquivo:** `backend/public/index.html` (CSS dos cards). O problema vem de antes do lote, mas agora o limite aceito é de 200 caracteres.
- **Comportamento:** o lote de teste com 200 `a` seguidos gerou rolagem horizontal na lista da ONG.
- **Correção sugerida:** `overflow-wrap: anywhere` no título do card. Pode ficar para L03/L08.

### I1 — Informativo — CNPJ alfanumérico [VERIFICAR]

- **Arquivo:** `backend/src/validacao.js` `cnpj()`.
- **Comportamento:** o validador aceita só dígitos. Pela IN RFB nº 2.229/2024 [VERIFICAR], CNPJs alfanuméricos passariam a ser emitidos a partir de julho/2026.
- **Impacto e recomendação:** o aceite do L01 é numérico e foi cumprido. Registrar como limitação ou melhoria futura no relatório, sem bloquear o lote.

### I2 — Informativo — Mudanças do controlador no mesmo diff

- **Arquivos:** `scripts/agentes/*`, `docs/EXECUCAO_AUTOMATICA.md` e `PLANO_AGENTES.md:141-142`, fora do escopo de produto do L01 e registrados no LOG como manutenção autorizada pelo usuário. Não reavaliei a decisão do usuário.
- **Inconsistência documental:** `PLANO_AGENTES.md:141` diz que a transferência "Não se aplica a permissão negada". Já `docs/EXECUCAO_AUTOMATICA.md:55-63` (modo `neverStop`) e `core.mjs` (`classify`) passaram a transferir e a seguir após `permission_denied`, e `--setting-sources user` faz o Claude ignorar as negações de `.claude/settings.json`. Recomendo que o controlador/grupo harmonize os documentos em tarefa de planejamento e integre essas mudanças sabendo que elas acompanham a branch do L01.
- `docs/testes/controlador-retomada-claude.txt` está em UTF-16 LE, e o git mostra o arquivo como binário no diff. Sugere-se regravá-lo em UTF-8.

### Qualidade dos testes

- Os testes são bons: fuzz por campo nas cinco operações, fronteiras (200/201 caracteres, 72/73 bytes de senha, 0,01 e 10.000 kg, bissexto, INT32), conferência do valor normalizado no banco, injeção de pg para o caso 500 e o listener de erro, e execução do script real do front em DOM mínimo, sem reimplementar as funções.
- Lacunas: não há teste para erros de corpo comprimido/encoding (M1). A colagem com caracteres extras além de 18 não é exercitada com `maxlength`, porque o DOM mínimo não aplica `maxlength` (B1). A correção de `sair()` não tem teste automatizado.

## Próximo passo

1. Corrigir M1 em `server.js` e adicionar o teste de regressão correspondente.
2. Opcional, recomendado: B1 e B2.
3. Rodar `npm test` em backend/ e devolver para nova revisão apenas do delta (M1). Os demais itens desta revisão permanecem válidos para o commit `0b01a50`.
