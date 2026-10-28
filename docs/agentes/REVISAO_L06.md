# Revisão L06 — Cadastro completo, termo/LGPD, anexo de entidade e KPIs

- Data: 28/10/2026 · Revisor: claude (revisão independente) · Branch `lote/L06`, diff `main..HEAD` (commit `ca5a442`).
- Escopo lido: `AGENTS.md`, `PLANO_AGENTES.md` §L06, `docs/agentes/progresso/L06.md`, `docs/agentes/LOG.md`, diff completo
  (`server.js`, `validacao.js`, `init.sql`, `index.html`, `termos.html`, `README.md`, testes 01/02/07).
- Sem alterações em código, testes, plano, instruções, controlador, `.agentes/` ou `.git`. Único arquivo escrito: este relatório.

## Resultado

**Aprovado (ready)** — nenhum achado crítico ou alto. Um achado médio (máscara de telefone ao colar) e quatro baixos,
recomendados para correção em lote futuro, sem impedir a integração.

## Critérios de aceite do plano

| Critério | Situação | Evidência |
|---|---|---|
| Cadastro com endereço, responsável e telefone | OK | `server.js:118-140`; `validacao.js` `telefone()`; `init.sql:13-21`; teste 07 "endereço, responsável e telefone são obrigatórios" |
| Aceite obrigatório (`aceite_termos_em`) | OK | `validacao.aceite` só aceita `true`; `now()` do servidor + `termos_versao`; teste 07 com 9 valores inválidos e verificação de que a conta não é criada; navegador: erro "É obrigatório aceitar…" sem aceite |
| `termos.html` com citações legais `[VERIFICAR]` | OK | RDC 216/2004, Lei 14.016/2020, CDC, LGPD 13.709/2018, base legal, artigos de direitos, guarda e valor do comprovante marcados `[VERIFICAR]`; controlador/contato/prazo `[GRUPO]`; aviso de ausência de revisão jurídica; conferido no navegador |
| Anexo PDF/JPEG/PNG ≤ 1 MB, tipo real | OK | Assinatura de bytes (`ehPdf/ehJpeg/ehPng`), base64 estrito, CHECK no banco (tamanho e tipo); teste 07: 1 MB exato aceito, 1 MB+1, HTML, SVG, MZ, GIF, `%PDF-3.0`, prefixo `data:` → 400; navegador: HTML renomeado .pdf, 2 MB e .txt recusados com mensagem em pt-BR |
| Anexo inválido → 400 | OK | idem; corpo gigante → 400 JSON (`server.js` handler de `entity.too.large`) |
| Coluna `situacao` padrão `aprovado` | OK | `init.sql` CHECK aprovado/pendente/rejeitado; teste 07 |
| Painel com kg, refeições, CO₂e, água, entidades, TMR e TEC com meta ao lado | OK | `calcularIndicadores` (`server.js:566-612`); `htmlIndicadores` (index.html); navegador: TMR 90,3 min "meta não atingida", TEC 78,8% |
| TMR/TEC batem com dados controlados | OK | teste 07: 30/60/90 min → TMR 60, TEC 66,7%; global conferido contra SQL independente; limite estrito de 90 min |
| "Meus números" só do próprio usuário | OK | filtro `doador_id`/`reservado_por` e `doador_id`/`receptor_id`; teste 07 com dois pares doador/ONG e conta demo Comper |

## Segurança e acesso a dados (revisão por risco: anexos)

- `PUT /perfil/comprovante` autentica antes de ler o corpo de 1,5 MB (`server.js:36-37`); sem token com corpo de 2 MB → 401 (teste 07).
- `GET /perfil/comprovante`: só a própria receptora (sem parâmetro de id), doador 403, `Content-Disposition: attachment`,
  `Cache-Control: private, no-store`, `nosniff` global. Rotas com `?usuario=` ou `/:id` não expõem outro comprovante (teste 07).
- `GET /perfil` não devolve `senha_hash` nem `localizacao`. Nenhuma consulta existente usa `SELECT *` em `usuarios`;
  o comprovante de doação continua só com `id, nome, cnpj` (`server.js:431`) — telefone/endereço não vazam.
- SQL parametrizado em todas as consultas novas. Front escapa os dados de cadastro (`esc` em `campo()`); no navegador o
  responsável `Revisor <b>x</b>` apareceu como texto literal.

## Achados

### M1 — Média: colar telefone formatado com +55 grava outro número sem aviso
- `backend/public/index.html:140` (`maxlength="16"` em `cTelefone`) combinado com `mascararTelefone` (`index.html:195-203`,
  comentário "aceita colar com +55").
- Evidência (Claude in Chrome, inserção via `document.execCommand('insertText')`, que respeita `maxlength` como a colagem):
  `"+55 67 99999-0006"` (17 caracteres) → campo fica `"(67) 9999-9000"`; `"+55 (67) 99999-0006"` → `"(55) 6799-9990"`.
  Ambos passam na validação do servidor (10 dígitos válidos) e seriam gravados como telefone errado. `"+5567999990006"`,
  `"55 67 99999 0006"` e `"(67) 99999-0006"` ficam corretos. O servidor sozinho aceita `"+55 67 99999-0006"` corretamente;
  o defeito é só o truncamento do `maxlength` antes da máscara.
- O teste de front `07-cadastro-kpis.test.mjs` ("máscara do telefone…") chama a função diretamente, sem `maxlength`, por isso não pega o caso.
- Correção sugerida: aumentar `maxlength` (ex.: 20, igual ao limite do servidor) ou removê-lo e limitar só pelos dígitos na
  máscara; acrescentar asserção de front que simule a truncagem.
- Não bloqueia: o usuário vê o valor mascarado antes de enviar.

### B1 — Baixa: limite/autenticação do anexo depende da grafia exata do caminho
- `backend/src/server.js:36` compara `req.path === '/perfil/comprovante'`, mas o roteamento do Express é insensível a
  maiúsculas e aceita barra final. Evidência no navegador (sessão autenticada, PDF de ~200 KB):
  `/perfil/comprovante` → 200; `/PERFIL/comprovante` e `/perfil/comprovante/` → 413 "excede o tamanho permitido".
  Não há bypass de autenticação (a rota mantém `autenticar` e o limite cai para 100 KB). Mesmo padrão do achado A4 do L03.

### B2 — Baixa: mensagem de erro de leitura fala em "imagem" para PDF
- `backend/public/index.html:614` (`lerBase64`, reaproveitado por `enviarComprovante`): "Não foi possível ler a imagem." também para PDF.

### B3 — Baixa: `docs/testes/e2e-api.mjs` desatualizado
- O cadastro antigo (sem endereço/responsável/telefone/aceite) agora retorna 400; `ANALISE_CONFORMIDADE.md:37` ainda indica
  rodar o script. Limitação já registrada no checklist (equivale ao A5 do L03).

### B4 — Baixa (observação): TMR ignora reservas liberadas
- Liberação limpa `reservado_em` (`server.js:245`), então lotes reservados e depois liberados saem do TMR. Decisão
  documentada em `progresso/L06.md`; coerente com a fórmula do plano. Também documentado: TMR do seed começa acima da meta.

Observação sem severidade: no `PUT /perfil/comprovante` o `autenticar` roda duas vezes (middleware e rota); é redundante e inofensivo.

## Qualidade dos testes

- `07-cadastro-kpis.test.mjs` (18 testes) cobre aceite com valores não booleanos, anexos inválidos variados e tamanho exato,
  corpo malformado/gigante, 401/403/404, isolamento entre ONGs, CHECKs do banco, TMR/TEC com dados controlados e comparação
  com SQL independente, e o front em VM. Asserções verificam status, formato `{erro}` e estado no banco (nada criado/alterado).
- Adaptações em `01-base` e `02-validacoes` só acrescentam os campos novos ao contrato; o fuzz passou a cobrir os campos novos.
  Nenhuma asserção removida ou afrouxada.
- Lacuna: máscara de telefone com `maxlength` (M1).

## Testes executados nesta revisão

- `npm.cmd test` em `backend/` (banco descartável `alimentams_test`): **156 testes / 156 pass / 0 fail / 0 cancelled /
  0 skipped / 0 todo**, ~38,6 s.

## Conferência visual (Claude in Chrome, app local `node backend/src/server.js`, porta 3000, banco descartável)

Feito nesta revisão:
- Cadastro de ONG: campos novos visíveis; sem aceite → "É obrigatório aceitar o Termo de Responsabilidade e a Política de Privacidade.";
  com aceite → conta criada e comprovante PDF enviado logo depois (arquivo injetado por `DataTransfer`, não pelo seletor nativo).
- "Meus números" da ONG nova: zeros, "—" e "sem dados ainda" em TMR/TEC com as metas; cadastro com CNPJ/telefone formatados,
  situação Aprovado, termos aceitos com versão 2026-10-v1 (print de tela visto, não salvo em disco).
- Substituição do comprovante: HTML disfarçado de PDF, arquivo de 2 MB e .txt recusados; PNG aceito → "Anexado (PNG)".
- Clique real em "Abrir comprovante enviado": nova aba `blob:http://localhost:3000` com a imagem 1×1; aba fechada.
- Painel global: TMR 90,3 min (meta não atingida) e TEC 78,8%. `/termos.html` aberto, marcadores destacados.
- Defeito M1 e caminhos de B1 reproduzidos no navegador.
- Uma tentativa de usar `navigator.clipboard.writeText` para colagem real travou a avaliação de script (timeout do CDP); não repetida.
- Servidor encerrado ao final (porta 3000 conferida livre). Ficou no banco de testes uma conta sintética `rev.l06.*@example.test`.

**Conferência visual humana PENDENTE** para:
1. Seletor nativo de arquivos (escolher PDF real ≤ 1 MB no cadastro da ONG e em "Meus números") e abrir um PDF real em "Abrir comprovante enviado".
2. Colagem real (Ctrl+V) de `+55 67 99999-0006` no telefone — esperado hoje: número errado (M1); após correção, `(67) 99999-0006`.
3. Layout do cadastro, do painel com TMR/TEC e de `/termos.html` em celular (viewport estreito); rolagem completa dos termos.
4. Clique nos links "Termo de Responsabilidade" e "Política de Privacidade" do aceite (devem abrir em nova aba na âncora certa).

Roteiro: banco recém-criado → `node backend/src/server.js` → Cadastre-se como ONG → preencher tudo, colar o telefone do item 2,
escolher PDF real, tentar sem aceite (erro) e depois marcar → Meus números → Abrir comprovante → Substituir por PNG → tentar
arquivo de 2 MB e .txt renomeado para .pdf (erros) → entrar como comper@demo.com e esperanca@demo.com e comparar painel global
com "Meus números" → abrir `/termos.html` no celular.

## Próximo passo

Controlador pode integrar o L06. Em lote futuro: corrigir M1 (`index.html:140`, `maxlength`) com teste; opcionalmente B1–B3.
Humano executa o roteiro visual pendente acima.
