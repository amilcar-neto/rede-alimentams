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
