# Revisão independente — L04

- Data: 28/10/2026. Ferramenta: codex; papel: revisor único, sem subagentes. Modelo efetivo/esforço: não informados pelo cliente.
- Branch: `lote/L04`. HEAD revisado: `ca8f8801cd6b25e5852ad33799335953ec239a5b`.
- Base do lote: `main` em `f2aa942795e83b6d2d2a8304c39efb2308629a8e`; revisão do diff `main..HEAD`. `baseline` em `cf88651de874b8c1b0c0baaebf87f02f9e9e29c0` é a referência acumulada para a revisão FINAL, não a base deste lote.
- Lidos: AGENTS.md, seção L04 e regras de revisão do PLANO_AGENTES.md, checklist L04, LOG.md (incluindo evidências e negativas anteriores), diff de implementação/testes/dependências/schema e contexto de autenticação, validação, ciclo de vida e interface. Consultadas as revisões L02/L07 e as referências locais de conformidade.
- Árvore limpa no início. Único arquivo escrito nesta revisão: este relatório. Nenhum código, teste, checklist original, LOG, configuração ou arquivo do controlador alterado; sem commits, integração, publicação, VPS ou mensagens externas.

## Resultado: continue — uma correção necessária de prioridade média

Não foram identificados achados críticos ou altos. O achado M1 viola a regra explícita de que entrada inválida não pode gerar 500; precisa de correção e regressão antes do aceite. A pendência visual, isoladamente, não impede o lote, conforme a exceção expressa do usuário. `block_reason: none`: a revisão e os testes puderam ser concluídos.

## M1 — Média — Host excessivamente longo passa pela validação e gera 500 no QR

- **Locais:** `backend/src/comprovante.js:32`, `backend/src/comprovante.js:41`, `backend/src/comprovante.js:44` e `backend/src/server.js:358`–`359`. O wrapper que transforma a exceção em 500 está em `backend/src/server.js:70`–`74`.
- **Condição:** `BASE_URL` ausente, usando o fallback de Host previsto pelo plano. O construtor `URL` aceita um hostname de tamanho inválido; `baseURL` verifica protocolo, credenciais, query e fragmento, mas não limita o hostname nem o tamanho da entrada do QR. Uma reservante autenticada consegue provocar erro interno apenas alterando seu cabeçalho Host.
- **Reprodução direta executada**, via Node em `backend/`, sem editar arquivos nem abrir servidor: remover `BASE_URL` somente do processo temporário; calcular `baseURL({protocol:'http', get:() => 'a'.repeat(3000) + '.test'}) + '/#retirada/1/123456'`; chamar `await png(url)`. A base é aceita, mas o encoder lança `Error: The amount of data is too big to be stored in a QR Code`. A exceção não é `ErroValidacao`.
- **Confirmação executada no handler real:** carregado `server.js` em VM com registro das rotas, `listen` inerte e Pool simulado (sem conexão; retorno de reserva ativa pertencente à usuária sintética 4). Invocado o último handler de `/lotes/:id/qrcode`, com parâmetros e identidade válidos, capturando `status/json/type/send` da resposta. Resultado observado:

```json
{"hostLength":14,"status":200,"type":"png","bytes":1957}
{"hostLength":1,"status":400,"body":{"erro":"Endereço da requisição inválido."}}
{"hostLength":3005,"status":500,"type":"png","body":{"erro":"Erro interno do servidor."}}
{"logs":["The amount of data is too big to be stored in a QR Code"]}
```

- O primeiro Host foi `localhost:3000`; o segundo, `[`; o terceiro, o hostname sintético acima. Isso é evidência de execução isolada do handler, **não uma requisição HTTP real ou conferência pelo navegador**. A autenticação não foi exercitada nesse harness; seus testes reais estão na suíte.
- **Impacto:** requisição inválida vira erro interno, contrariando AGENTS.md. Além disso, `server.js:359` escolhe `image/png` antes de aguardar a geração; a falha ocorre após essa escolha, prejudicando o contrato de erro JSON. Não foi constatado acesso a dados de terceiros ou alteração indevida de estado.
- **Correção sugerida:** validar estritamente o Host de fallback e seu comprimento antes de gerar a URL; limitar a entrada do QR ao contrato suportado. Gerar o Buffer antes de definir o tipo PNG. Manter falhas reais do encoder/configuração como erros internos, sem converter indiscriminadamente qualquer exceção em 400.
- **Teste faltante:** `backend/test/05-comprovante-qr.test.mjs:66`–`80` só cobre fallback normal, URL malformada, protocolo e configuração inválida; não cobre limite de tamanho nem a resposta de erro da rota. Acrescentar regressão com Host excessivo e `BASE_URL` ausente: 400 com `Content-Type: application/json` e mensagem em pt-BR; preservar PNG no caso válido e 500 para falha interna verdadeira. A suíte atual passa mesmo com M1 presente.

## Requisitos e análise de risco

| Requisito | Evidência revisada | Resultado |
|---|---|---|
| Três itens sanitários obrigatórios e persistidos | `comprovante.js:11`–`15`; `server.js:293`–`295`, `331`–`333`; CHECK exato em `db/init.sql:58`; testes de campos ausentes, extras, falsos e tipos, com estado preservado | Atendido |
| SHA-256 canônico com partes/CNPJs, alimento, quantidade, instante, código e checklist | `server.js:319`–`333`; ordenação recursiva em `comprovante.js:20`–`26`; snapshot, decimal em duas casas e ISO UTC; teste confere todos os registros confirmados e alteração de campos | Atendido |
| Confirmação atômica e unicidade | UPDATE condicional e revalidação temporal, INSERT de doação/evento e COMMIT na mesma transação; ROLLBACK e release; UNIQUE por lote; oito confirmações concorrentes produzem uma doação/evento | Atendido |
| Comprovante apenas para as duas partes | `server.js:362`–`370`: autenticação, ID validado, comparação com os IDs persistidos, antes de gerar documento; testes reais 401/403/200/400/404 | Atendido |
| Imprimível, seguro e estável após mudança cadastral | HTML escapado, data America/Campo_Grande, checklist/hash/QR e orientação Ctrl+P; dados vêm do snapshot; teste de HTML malicioso e alteração de cadastro | Atendido por código/testes; layout pendente |
| Verificação pública mínima e integridade | `server.js:374`–`379`, consulta parametrizada e regex; hash recalculado antes de renderizar; conteúdo sem nomes, CNPJs, código, IDs, alimento ou instante; testes 200/404 e corrupção em memória | Atendido |
| Bloqueio de UPDATE e DELETE | Trigger de instrução em `db/init.sql:64`–`70`, SQLSTATE 55000; testes diretos no PostgreSQL preservam registro | Atendido |
| QR restrito à reservante, PNG e link esperado | `server.js:350`–`359`: perfil, dona da reserva e estado ativo; testes reais de 401/403/200, entrega/liberação e comparação dos bytes PNG com o link esperado | Atendido no fluxo válido; M1 no erro de entrada |
| Link de retirada após login, código visível, sem confirmação automática | Fragmento preservado, preenchimento do código e checklist desmarcado; respostas privadas buscadas com Bearer, sem JWT na URL; teste do script real em DOM mínimo | Atendido por inspeção/teste parcial; visual pendente |

Não há interpolação de entrada de usuário no SQL novo. O parâmetro de autorização do comprovante vem dos IDs persistidos, não do snapshot fornecido pelo cliente. O snapshot é criado no servidor e fica sob a mesma proteção contra UPDATE/DELETE. Não foi presumida proteção contra um administrador que altere schema/desative triggers; o aceite pede bloqueio de UPDATE/DELETE. A verificação de hash é de integridade do registro, sem alegação de certificado ICP-Brasil.

## Testes e limites das evidências

- `npm.cmd test`, executado nesta revisão em `backend/`: **99 testes / 99 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo**, código **0**, duração **17623,1177 ms**. Runner recriou exclusivamente `alimentams_test` de `db/init.sql` e encerrou os processos filhos. A guarda de reset foi lida antes da execução; não foram lidos arquivos de credenciais.
- `git diff --check main..HEAD`: código 0, sem erros.
- Ajustes nos testes antigos acrescentam o checklist obrigatório e a resolução do módulo no harness de falha interna; as assertivas anteriores foram preservadas.
- Cobertura boa de autorização, entrada sanitária, persistência, unicidade, concorrência, imutabilidade e XSS. A comparação de PNG usa o mesmo encoder, confirmando o payload esperado sem equivaler a leitura física por câmera.
- O teste do front em `05-comprovante-qr.test.mjs:190` usa DOM mínimo, atribui o usuário diretamente e substitui API/navegação. Não prova login completo, abertura de Blob em nova aba, renderização, impressão ou câmera; esses limites permanecem explícitos.
- Não há teste dedicado de falha no INSERT de doação/evento para verificar rollback; o caminho foi inspecionado e não foi encontrado defeito nele. Recomenda-se ampliar essa cobertura quando houver alteração transacional, sem tratar essa ausência isolada como segundo impedimento.
- A limitação já registrada de migração de bancos/recibos legados permanece: nenhuma migração foi aplicada e nenhum histórico inventado.

## Checklist da revisão e conferência visual humana PENDENTE

- [x] Revisar diff, contexto e requisitos de L04 independentemente das alegações do executor.
- [x] Executar a suíte e avaliar a qualidade dos testes.
- [x] Reproduzir e registrar M1 com arquivo:linha e limites da evidência.
- [x] Tentar acesso ao navegador e preservar diagnóstico anterior.
- [ ] **Conferência visual humana PENDENTE.** Tentativa desta revisão: `cua.getState()` retornou `browsers: []` e `Browsers: Error: The browser access host is unavailable`. O inventário nativo ainda lista Edge, mas a negativa histórica **`Computer Use was not approved to use Microsoft Edge`** está preservada no checklist/LOG do executor. Não foi repetido nem contornado o acesso negado; essa negativa não foi reclassificada como indisponibilidade. A exceção do usuário torna esta pendência visual não impeditiva, sem apagar sua causa.

Nenhuma tela, impressão, câmera, print ou revisão humana foi realizada nesta sessão. Não foi iniciado servidor manual em 3000 após a consulta do navegador; só os servidores controlados pela suíte foram executados e encerrados. A ferramenta de execução disponível não expõe o parâmetro `run_in_background`; não foi improvisado um lançamento alternativo para a conferência visual.

Roteiro exato retomado do checklist, a executar por humano com navegador autorizado e somente banco descartável:

1. Iniciar apenas `node backend/src/server.js` em segundo plano; abrir `http://localhost:3000`.
2. Entrar como demo Comper, publicar lote sintético com validade de amanhã e 2,50 kg; sair, entrar como Casa Esperança e reservar com janela de até 2 h. Conferir QR legível e código de seis dígitos, também em largura móvel.
3. Anotar o link `http://localhost:3000/#retirada/<id>/<codigo>`, sair e abri-lo. Conferir pedido de login e fragmento preservado. Entrar como Comper: código preenchido e três itens desmarcados. Confirmar sem os três itens deve falhar; marcá-los e confirmar deve registrar a retirada e oferecer o comprovante.
4. Abrir o comprovante pelo sucesso e pela aba Doações. Conferir partes/CNPJs sintéticos, alimento, 2,50 kg, horário Campo Grande, código, checklist, hash e QR. Abrir Ctrl+P, conferir prévia sem cortes e cancelar. Repetir acesso como receptora.
5. Abrir o link do QR de verificação sem login: válido, quantidade/hash e nenhum cadastro/código. Alterar um caractere do hash: 404. Como Sabor MS/Amambai, comprovante e QR alheios devem retornar 403 nas chamadas autenticadas.
6. Abrir link de retirada na conta receptora e com reserva inexistente: mensagem adequada, sem confirmação automática. Encerrar o servidor ao terminar.

## Próximo passo

Executor deve corrigir **M1** em `backend/src/comprovante.js:32`–`44` e `backend/src/server.js:359`, acrescentar a regressão em `backend/test/05-comprovante-qr.test.mjs` e executar `npm test` em `backend/`. Retornar o diff da correção para revalidação antes de integrar. Manter a conferência visual humana pendente conforme a exceção autorizada; o revisor não alterou o checklist original porque esta fase permite escrever somente este relatório.

---

## Revalidação independente — 28/10/2026 — HEAD fab4b2b

Esta seção registra o resultado vigente; o relatório anterior permanece acima como evidência histórica.

- Ferramenta: codex; papel: revisor único, sem subagentes. Modelo efetivo/esforço: não informados pelo cliente.
- Branch conferida: `lote/L04`; HEAD `fab4b2b25b86d7693ca8540e4dceff4c245018c2`.
- Base: `main` em `f2aa942795e83b6d2d2a8304c39efb2308629a8e`. Revisado o diff completo `main..HEAD`, além da correção desde `ca8f880`. `baseline..HEAD` fica reservado à revisão FINAL.
- Relidos AGENTS.md, seção L04/regras de revisão do plano, checklist L04, LOG e revisão anterior. Inspecionados implementação, schema, dependências, testes e contexto de autenticação, validação, transação, ciclo de vida e front; consultada ANALISE_CONFORMIDADE.md.
- Árvore limpa no início. Escrito somente `docs/agentes/REVISAO_L04.md`; nenhum código, teste, checklist, LOG, plano, configuração ou runtime alterado. Sem commits, integração, outros executores, VPS, publicação ou mensagens externas.

### Resultado vigente: continue — M1 resolvido; M2 médio exige correção

Não foram encontrados achados críticos ou altos. M1 foi corrigido e sua regressão passou. Há uma correção necessária no contrato JSON de erro da verificação pública (M2). A revisão não está bloqueada: `block_reason: none`. A pendência visual continua não impeditiva pela exceção expressa do usuário.

### M1 — Resolvido e revalidado

- `backend/src/comprovante.js:29`–`68`: autoridade Host validada, limites de hostname/labels, IPv6/porta e limite de 1024 bytes para o link completo, inclusive após normalização. `BASE_URL` inválida continua sendo falha interna.
- `backend/src/server.js:358`–`360`: geração do PNG termina antes da seleção de Content-Type. Comprovante também usa o limite do link em `server.js:370`.
- `backend/test/05-comprovante-qr.test.mjs:85` e `:125`: limites e regressão por HTTP com Express/JWT reais, banco simulado e falha sintética do encoder. Host excessivo/malformado retorna 400 JSON; falha interna/configuração retorna 500 JSON; fluxo válido preserva PNG. Os dois testes passaram na suíte desta revisão. Nenhum teste anterior foi removido ou afrouxado.

### M2 — Média — Falha de integridade pública retorna JSON anunciado como HTML

- **Local:** `backend/src/server.js:380`; contexto: wrapper de erro em `server.js:70`–`74` e exceção deliberada em `backend/src/comprovante.js:103`.
- **Comportamento:** a expressão `res.set(...).type('html').send(comprovantes.paginaVerificacao(...))` define `text/html` antes de avaliar a função que verifica a integridade. Se ela lança, o wrapper responde com `res.status(500).json(...)`, mas Express preserva o Content-Type já definido. Assim, o erro tem corpo JSON e cabeçalho HTML, contrariando o contrato de erros JSON do projeto.
- **Reprodução executada sem editar arquivos:** carregado o `server.js` real em VM com Express real e `app.listen` inerte; Pool simulado retorna hash de `{quantidade_kg:'2.50'}` com snapshot `{quantidade_kg:'99.00'}`. Um servidor HTTP efêmero, restrito a `127.0.0.1`, recebeu GET `/verificar/<hash>`. Não se desativou trigger nem se corrompeu o banco real. O servidor efêmero foi encerrado no `finally`.

```json
{"status":500,"tipo":"text/html; charset=utf-8","body":"{\"erro\":\"Erro interno do servidor.\"}","logs":["Falha de integridade no comprovante."]}
```

- **Impacto e limites:** falha real de integridade é classificada corretamente como interna, sem exposição de dados; o defeito está no tipo de resposta. Clientes que escolhem o tratamento pelo cabeçalho recebem uma representação incorreta. A reprodução simula dados inconsistentes; não demonstra que um usuário comum consiga criar tal inconsistência, burlar o trigger ou alterar um comprovante. A gravidade média decorre do descumprimento explícito do contrato de erro no caminho de integridade que o próprio lote implementa e testa.
- **Correção necessária:** avaliar `paginaVerificacao` e guardar o HTML antes de selecionar o tipo da resposta, como já foi feito para o PNG em M1. Preservar 500 para integridade inválida e a mensagem pública genérica, com `application/json`; não converter essa falha em 400/404.
- **Lacuna de teste:** `backend/test/05-comprovante-qr.test.mjs:285`–`287` só chama `paginaVerificacao` diretamente e comprova a exceção. Não verifica o caminho HTTP/cabeçalho do erro. Acrescentar regressão HTTP do handler real com banco simulado para integridade inválida (500 JSON), junto do caso válido (200 HTML). A suíte atual passa com M2 presente.

### Requisitos e qualidade reavaliados

| Critério/risco | Evidência atual | Conclusão |
|---|---|---|
| Checklist completo obrigatório | `server.js:293`–`295`, `comprovante.js:11`–`15`, CHECK em `db/init.sql:58`; inválidos retornam 400 e preservam estado | Atendido |
| Hash em todas as confirmações, snapshot estável e canônico | `server.js:319`–`333`, `comprovante.js:20`–`26`, colunas NOT NULL/UNIQUE; teste recalcula todos os hashes e altera cadastro sem mudar documento | Atendido |
| Atomicidade, concorrência e validade | UPDATE condicional + INSERT de doação/evento + COMMIT/ROLLBACK em `server.js:299`–`345`; oito confirmações produzem uma doação e um evento | Atendido |
| Comprovante privado e QR de retirada | `server.js:350`–`371`; autenticação, perfil da reservante, IDs persistidos das partes e estado; testes 200/401/403/404/409 e PNG esperado | Atendido |
| Verificação pública mínima | `server.js:375`–`380`, `comprovante.js:100`–`109`; hash parametrizado, integridade recalculada, sem cadastro/código/instante/alimento | Fluxo válido atendido; erro HTTP tem M2 |
| Imutabilidade | Trigger de instrução BEFORE UPDATE OR DELETE em `db/init.sql:64`–`70`; PostgreSQL recusa ambos com SQLSTATE 55000 | Atendido |
| HTML, datas e impressão | Escaping, snapshot, America/Campo_Grande, CSS print e QR de verificação | Código/testes atendidos; layout/impressão visual pendentes |
| Link de retirada e login | Fragmento preservado, doador recebe código, sem marcar checklist nem confirmar automaticamente; Bearer nas requisições privadas | Código/teste do script atendidos; navegador pendente |

Os ajustes dos testes antigos apenas incorporam o checklist obrigatório e o mapeamento do novo módulo no harness. O lock acrescenta `qrcode` e suas dependências transitivas; nenhuma dependência direta fora das permitidas foi incluída. SQL novo parametrizado; autorização usa os IDs persistidos. Não se presumiu proteção contra administrador que desative triggers. O lote não promete certificação ICP-Brasil.

### Execuções desta revisão

- Guarda do reset e runner lidos antes da suíte. `npm.cmd test` em `backend/`: código **0**, **101 testes / 101 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo**, **17793,9864 ms**. Saída confirma recriação exclusiva de `alimentams_test` a partir de `db/init.sql`; runner encerrou seus processos. Não foram lidos arquivos de credenciais.
- `git diff --check main..HEAD`: código **0**, sem erros.
- Reprodução HTTP de M2 descrita acima: executada nesta revisão, com resposta e log observados; não é teste visual ou corrupção do PostgreSQL.
- Cobertura efetiva de IDOR, validação, hash/snapshot, XSS, concorrência e UPDATE/DELETE. PNG comparado ao encoder para o payload esperado não comprova leitura por câmera. DOM mínimo não comprova login completo, abertura Blob, impressão ou layout. Falha transacional no INSERT ainda não tem regressão dedicada; caminho de rollback inspecionado, sem defeito encontrado.
- Migração de bancos legados permanece limitação já documentada; não aplicada nem ampliada nesta revisão.

### Checklist da revalidação e conferência visual humana PENDENTE

- [x] Revisar diff completo do lote e contexto independentemente das alegações do executor.
- [x] Executar npm test e avaliar a qualidade dos testes e das alterações anteriores.
- [x] Revalidar M1 e registrar M2 com arquivo:linha, reprodução e limites.
- [x] Tentar navegador e preservar as evidências anteriores.
- [ ] **Conferência visual humana PENDENTE.** Tentativa desta sessão com a skill computer-use e `cua.getState()`: `browsers: []`, `Browsers: Error: The browser access host is unavailable`. Edge continua no inventário nativo, mas a negativa histórica **`Computer Use was not approved to use Microsoft Edge`** permanece válida; não foi repetida, contornada nem reclassificada como ferramenta ausente.

Nenhuma tela do app, prévia de impressão, câmera ou print foi conferido nesta sessão. Não foi iniciado o app manual na porta 3000; o executor disponível não expõe `run_in_background`. Os únicos servidores executados nesta revisão foram os da suíte e o harness HTTP de M2, todos encerrados. Essa pendência não é o motivo de `continue`.

Roteiro exato preservado para humano com navegador autorizado e apenas banco descartável:

1. Iniciar somente `node backend/src/server.js` em segundo plano; abrir `http://localhost:3000`.
2. Como demo Comper, publicar lote sintético de amanhã e 2,50 kg; como Casa Esperança, reservar janela de até 2 h. Conferir QR e código de seis dígitos legíveis, também em largura móvel.
3. Anotar `http://localhost:3000/#retirada/<id>/<codigo>`, sair e abrir o link. Conferir pedido de login e fragmento preservado. Entrar como Comper: código preenchido, três itens desmarcados. Confirmar sem todos deve falhar; marcar os três e confirmar deve registrar doação e oferecer comprovante.
4. Abrir comprovante pelo sucesso e pela aba Doações; conferir partes/CNPJs sintéticos, alimento, 2,50 kg, data/hora Campo Grande, código, checklist, hash e QR. Abrir Ctrl+P, verificar prévia sem cortes e cancelar. Repetir como receptora.
5. Abrir link do QR público sem login: quantidade/hash e nenhum cadastro/código. Alterar um caractere do hash: 404. Como Sabor MS/Amambai, chamadas autenticadas a comprovante/QR alheios devem retornar 403.
6. Abrir link de retirada como receptora e com reserva inexistente: mensagem apropriada e nenhuma confirmação automática. Encerrar o servidor ao terminar.

### Próximo passo vigente

Corrigir **M2 em `backend/src/server.js:380`**, renderizando antes de selecionar HTML; acrescentar regressão HTTP ao teste de integridade de `backend/test/05-comprovante-qr.test.mjs:285`–`287`. A reprodução desta revisão devolveu **500 text/html com corpo JSON**; o esperado é **500 application/json**. Executar `npm test` em `backend/` e devolver o diff para revalidação antes de integrar. M1 está encerrado; preservar sua regressão e o roteiro visual humano pendente. O revisor não alterou o checklist/LOG originais por restrição expressa desta fase.

---

## Revalidação independente — 28/10/2026 — HEAD 82a950c

**Resultado vigente: ready — aprovado para o escopo L04, sem correções necessárias identificadas. `block_reason: none`.** M1 e M2 estão resolvidos. As conclusões anteriores de `continue` permanecem acima como histórico, substituídas por esta revalidação. A conferência visual humana continua pendente e não impede este aceite, conforme exceção expressa do usuário.

### Escopo e método

- Ferramenta: codex; papel: revisor único, sem subagentes ou outros executores. Modelo efetivo/esforço: não informados pelo cliente.
- Branch `lote/L04`; HEAD revisado: `82a950c3c8da299e38a8420595c6ce1ac6f9d0a2`.
- Base `main`: `f2aa942795e83b6d2d2a8304c39efb2308629a8e`. Revisado o diff completo `main..HEAD` e, separadamente, a correção M2 desde `2db1cd1`. `baseline` (`cf88651de874b8c1b0c0baaebf87f02f9e9e29c0`) permanece reservado ao diff acumulado `baseline..HEAD` na revisão FINAL.
- Lidos AGENTS.md, seção L04 e regras de revisão do PLANO_AGENTES.md, checklist L04, LOG.md, relatório anterior e referência local ANALISE_CONFORMIDADE.md. Inspecionados implementação, schema, interface, mudanças nos testes existentes, novos testes, dependência direta e contexto de autenticação, validação, ciclo de vida e runner/reset.
- Árvore limpa no início. Único arquivo escrito nesta sessão: `docs/agentes/REVISAO_L04.md`. Não foram alterados código, testes, checklist, LOG, plano, instruções, configurações ou runtime. Sem commits, staging, mudança de branch, integração, VPS, publicação, mensagens externas ou dados reais.

### Achados anteriores encerrados

**M1 — Resolvido, regressões preservadas e aprovadas.** `backend/src/comprovante.js:29`–`70` valida a autoridade Host e o hostname, limita o link completo após normalização e diferencia entrada inválida de configuração inválida. `backend/src/server.js:359` aguarda o encoder antes de selecionar PNG. Os testes em `backend/test/05-comprovante-qr.test.mjs:85` e `:125` exercitam limites e HTTP real com Express/JWT: Host excessivo/malformado recebe 400 JSON, encoder/configuração com falha recebem 500 JSON e o caso válido conserva os bytes do PNG esperado. A leitura do banco é simulada nessa regressão; autorização e persistência reais são verificadas pelos demais testes de integração.

**M2 — Resolvido e revalidado nesta sessão.** `backend/src/server.js:380` calcula `paginaVerificacao` antes de definir HTML em `:381`. A exceção de integridade chega ao wrapper `:70`–`74` sem Content-Type previamente selecionado. A regressão acrescentada em `backend/test/05-comprovante-qr.test.mjs:290` usa Express, rota e renderizador reais, com somente a leitura do banco simulada. Nesta execução, passaram tanto o caso válido (200 HTML e no-store) como o snapshot inconsistente (500 application/json, corpo genérico exato e log interno de integridade). A falha interna não foi convertida em validação nem ocultada como 404. A reprodução histórica antes da correção e o resultado vermelho registrados pelo executor foram preservados; nesta revalidação foi executada a versão corrigida.

### Aceite e riscos inspecionados

| Critério | Evidência de código e testes desta revisão | Resultado |
|---|---|---|
| Checklist sanitário obrigatório | `server.js:293`–`295`, `comprovante.js:12`–`16` e CHECK `db/init.sql:56`; casos ausentes, incompletos, falsos, tipos e campos extras retornam 400 sem entrega/doação | Atendido |
| Snapshot e SHA-256 em todas as confirmações | `server.js:319`–`333`, `comprovante.js:21`–`27`, NOT NULL/UNIQUE do schema; partes/CNPJs, alimento, quantidade decimal, instante, código e checklist entram no snapshot; testes recalculam hashes e verificam estabilidade após alteração cadastral | Atendido |
| Atomicidade e confirmação concorrente | UPDATE condicional, INSERT de doação/evento, COMMIT e ROLLBACK no mesmo cliente em `server.js:299`–`345`; validade/tolerância revalidadas no UPDATE; oito confirmações simultâneas produzem uma doação e um evento | Atendido |
| Comprovante restrito às partes | `server.js:363`–`371`: autenticação e comparação com IDs persistidos; testes 200 para ambas as partes, 403 para terceiros, 401 sem token, 400 para ID inválido e 404 inexistente | Atendido |
| Verificação pública mínima e integridade | `server.js:375`–`381`, `comprovante.js:100`–`110`; consulta parametrizada por hash, recomputação da integridade, resumo sem nomes/CNPJs/código/alimento/instante; 200 válido, 404 alterado e regressão M2 | Atendido |
| Imutabilidade | `db/init.sql:61`–`68`: trigger de instrução BEFORE UPDATE OR DELETE; testes executam ambos diretamente no PostgreSQL, recebem SQLSTATE 55000 e verificam registro preservado | Atendido |
| QR restrito, payload e código visível | `server.js:350`–`360`: perfil receptora, dona da reserva e estado; testes 200 image/png com payload esperado, 401/403 e indisponibilidade após entrega/liberação; front conserva código numérico | Atendido |
| Link de retirada, HTML e comprovante imprimível | `index.html:345`–`359`, `:389`–`395`, `:432`–`446`: fragmento/login, código com zeros, checklist não marcado automaticamente, requisição com Bearer sem JWT em URL; renderizador escapa conteúdo e usa Campo Grande, CSS print e QR público | Inspeção e testes atendidos; visual pendente |

Não foram encontrados novos achados críticos, altos ou médios que exijam correção neste escopo. A aprovação considera as condições de autorização, transação, schema e renderização acima, além do resultado dos testes.

### Execução e qualidade dos testes

- Antes da suíte, lidas as guardas de `backend/test/reset-db.mjs` e o runner: allowlist local `alimentams_test`/sufixos, recusa antes de conectar fora desse escopo, porta exclusiva e limpeza dos processos filhos. Nenhum arquivo de credenciais foi lido.
- `npm.cmd test` em `backend/`: **código 0; 102 testes / 102 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo; 17663,9688 ms**. Saída confirmou `Banco de teste recriado e db/init.sql carregado: alimentams_test`. Runner concluído e seus processos encerrados.
- `git diff --check main..HEAD`: **código 0**, sem erros.
- As mudanças nos testes anteriores acrescentam o checklist obrigatório e o mapeamento do módulo no harness, preservando as assertivas. A única dependência direta acrescentada é `qrcode`, permitida pelo plano.
- Há integração real com PostgreSQL/API para autorização, checklist, concorrência, snapshot e trigger. As regressões M1/M2 usam HTTP/Express reais e dados sintéticos simulados para os caminhos de falha. Não foram desativados triggers nem adulterados comprovantes reais.
- Limites da cobertura: comparação de PNG com o encoder prova o payload esperado, não leitura por câmera; DOM mínimo não comprova o fluxo completo no navegador, abertura de Blob, layout ou impressão. Rollback por falha induzida no INSERT ainda não tem teste dedicado; o caminho transacional foi inspecionado e não foi encontrado defeito. Isso permanece uma oportunidade de cobertura, sem correção obrigatória identificada.
- Bancos legados exigem atualização controlada do schema e estratégia para registros antigos, como já documentado pelo executor. Nenhuma migração foi executada; o aceite aqui corresponde ao schema fonte e ao banco descartável recriado.

### Checklist desta revisão e conferência visual humana PENDENTE

- [x] Revisar independentemente diff completo do lote e contexto.
- [x] Revalidar M1 e M2 sem alterar código ou testes.
- [x] Executar npm test em backend/ e avaliar qualidade/cobertura.
- [x] Tentar navegador e preservar evidências válidas e negativas anteriores.
- [ ] **Conferência visual humana PENDENTE.** Tentativa desta sessão, com skill computer-use e `cua.getState()`: `browsers: []`, erro **`Browsers: Error: The browser access host is unavailable`**. A negativa histórica **`Computer Use was not approved to use Microsoft Edge`** continua registrada e não foi repetida, contornada ou reclassificada como indisponibilidade.

Não houve tela do app, print, câmera, impressão ou revisão humana nesta sessão. O executor disponível não expõe `run_in_background`; não foi iniciado app manual em 3000 nem improvisado outro modo de lançamento. Foram executados somente os servidores controlados pela suíte, encerrados pelo runner. A exceção expressa do usuário permite este ready com a pendência visual; `block_reason: none` indica ausência de impedimento atual para concluir esta revisão, sem apagar o diagnóstico histórico de permissão negada.

Roteiro exato preservado para humano com navegador autorizado, somente banco descartável:

1. Iniciar somente `node backend/src/server.js` em segundo plano e abrir `http://localhost:3000`.
2. Entrar como demo Comper; publicar lote sintético de amanhã com 2,50 kg. Entrar como Casa Esperança; reservar janela de até 2 h. Conferir QR e código de seis dígitos legíveis, inclusive em largura móvel.
3. Anotar `http://localhost:3000/#retirada/<id>/<codigo>`, sair e abrir o link. Conferir pedido de login e fragmento preservado. Entrar como Comper: código preenchido, três itens desmarcados. Confirmar sem todos deve falhar; marcar os três e confirmar deve registrar a doação e oferecer o comprovante.
4. Abrir comprovante pelo sucesso e pela aba Doações; conferir nomes/CNPJs sintéticos, alimento, 2,50 kg, data/hora Campo Grande, código, checklist, hash e QR. Usar Ctrl+P, conferir prévia sem cortes e cancelar. Repetir acesso como receptora.
5. Abrir o link do QR público sem login: válido, quantidade/hash, sem cadastro/código. Alterar um caractere do hash: 404. Como Sabor MS/Amambai, chamadas autenticadas a comprovante/QR alheios devem retornar 403.
6. Abrir link de retirada como receptora e com reserva inexistente: mensagem adequada, sem confirmação automática. Encerrar o servidor ao terminar.

### Próximo passo vigente

L04 aprovado nesta revisão. O controlador pode prosseguir com seu fluxo de integração; o revisor não integrou nem publicou. Humano autorizado deve executar o roteiro visual pendente. Preservar as regressões M1/M2 e submeter mudanças posteriores à revisão proporcional; a revisão FINAL deverá usar `baseline..HEAD` e conferir a integração acumulada.
