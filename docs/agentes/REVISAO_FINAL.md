# Revisão FINAL — baseline..HEAD

> **Retomada em 28/10/2026:** revisão revalidada no HEAD `c489df014c6e4005f105de2ac6cfb7f4fb9d4856`. Resultado **continue**; F1–F3 permanecem necessários. A seção final deste arquivo registra as verificações novas e distingue as evidências históricas preservadas abaixo. `block_reason: permission_denied` preserva a negativa anterior do Docker, sem reclassificá-la ou contorná-la.

Data: 28/10/2026. Ferramenta: codex. Papel: revisor independente, executor único, sem subagentes. Modelo solicitado/efetivo e esforço: `nao_verificado` pelo cliente. Branch recebida: `lote/FINAL`.

**Resultado: continue — três correções de prioridade média necessárias antes do aceite final.** Não foi identificado achado crítico/alto no produto no escopo examinado. A suíte verde não encerra os achados F1–F3. A revisão não autoriza prints definitivos, deploy, entrega ou aprovação humana.

`block_reason: permission_denied`: a tentativa adicional de validação do Compose emitiu negativa ao ler a configuração do Docker, detalhada abaixo. Essa negativa é preservada como permissão negada; não foi reclassificada como ferramenta ausente. As correções F1–F3, e não a pendência visual ou essa validação opcional, motivam o `continue`.

## Versão, escopo e preservação

- Baseline: `cf88651de874b8c1b0c0baaebf87f02f9e9e29c0`.
- HEAD revisado: `7d12d35224e404023c4a0bd5b77b6ecdcadfcd35` (L08-complemento integrado). `main` aponta para o mesmo commit; portanto `main..HEAD` está vazio e o intervalo correto desta revisão é **`baseline..HEAD`**.
- Diff acumulado: 61 arquivos, 7.812 inserções e 175 remoções. Árvore limpa no início. Não houve troca de branch, staging, commit ou integração pelo revisor.
- Lidos AGENTS.md, seção Revisão final e requisitos relacionados do plano, LOG, progressos e revisões anteriores, código de aplicação/schema, testes, README, DEPLOY e roteiros. `docs/agentes/progresso/FINAL.md` não existia; não foi criado porque esta fase autoriza escrever somente este relatório. Checklist e limitações do FINAL ficam aqui, sem modificar LOG ou outros documentos.
- A integração acumulada contém os commits revisados `ccd67c1` (L01), `32aecc8` (L07), `4a1686e` (L02), `ca8f880` (revalidação L04), `5890cbe` (L05), `3cd37d0` (revalidação L03), `ca5a442` (L06) e `0600bb4` (L08-complemento). Todos foram conferidos como ancestrais de HEAD com `git merge-base --is-ancestor`.
- Reaproveitadas as evidências históricas com identificação dos commits; nenhuma conferência de navegador de outro lote é apresentada como execução desta sessão. As correções L01/M1, L04/M1–M2 e L03/A1 continuam presentes e suas regressões passaram na suíte atual.
- Único arquivo escrito pelo revisor: `docs/agentes/REVISAO_FINAL.md`. Nenhuma alteração em código, testes, plano, instruções, configuração, controlador, fila, runtime, documentos originais ou `.git`. Sem acesso ao VPS, publicação, mensagens ou dados reais.

## Achados com correção necessária

### F1 — Média — mais de cinco sessões da mesma conta mantêm reconexão e consultas sem convergir

**Local:** `backend/src/tempo-real.js:45`–`48`, combinado com `backend/public/index.html:791`–`805`. Retoma o M1 da revisão L05, que recomendou correção antes da revisão final e permanece sem resolução no HEAD.

Ao autenticar a sexta conexão, o servidor fecha a mais antiga com 1008. O front continua reconectando para esse código; a autenticação bem-sucedida zera `tentativasWs`, de modo que cada sessão expulsa reconecta em 1 segundo e expulsa outra. Além da instabilidade do tempo real, cada fechamento/reautenticação dispara consultas HTTP; quando a lista está aberta, sua recarga também executa as escritas do ciclo de vida.

**Evidência atual:** executados os arquivos reais `tempo-real.js` e o script de `index.html` em contextos VM, com seis sessões, JWT sintético válido para o mesmo ID, transporte WebSocket/DOM e relógio simulados em memória. Sem abrir porta ou iniciar o app. Após executar doze callbacks de reconexão: **18 autenticações, 13 fechamentos, 25 consultas a `/notificacoes`, cinco conexões ativas**; todas as doze esperas programadas foram **1.000 ms**. O ciclo continuava produzindo um novo callback. Isso é uma reprodução lógica determinística, não medição de latência ou teste visual. A revisão L05 também contém reprodução histórica por navegador no commit `5890cbe`.

**Impacto:** uma equipe com seis abas/dispositivos da mesma conta produz carga contínua e sessões alternadamente desconectadas. Não foi identificado vazamento de destinatários. O limite de conexões não consegue estabilizar o cliente atual.

**Correção sugerida:** distinguir excesso de conexões de autenticação expirada com código de aplicação e fazer o front suspender a reconexão automática nesse caso, com orientação ao usuário. Acrescentar regressão com seis conexões e reação do front; comprovar que não resta ciclo de substituição nem consultas repetidas após o limite. Os 157 testes atuais não cobrem essa combinação.

### F2 — Média — telefone colado com +55 pode ser cadastrado com outro número

**Local:** `backend/public/index.html:140` (`maxlength="16"`), `:196`–`202` (máscara) e `:267` (envio). Retoma o M1 da revisão L06, ainda presente.

O navegador limita a entrada antes do `oninput`. Assim, a promessa da máscara de aceitar colagem com +55 não é cumprida para formatos usuais maiores que 16 caracteres. Os dígitos perdidos não são recuperados e o resultado pode continuar sendo um telefone aceito pelo backend.

**Evidência atual:** no script real do front em VM, a entrada sintética `+55 67 99999-0006`, truncada a 16 caracteres conforme o atributo HTML, passou pela função real `mascararTelefone` e resultou em **`(67) 9999-9000`**. A função real `validacao.telefone` aceitou esse resultado como **`6799999000`**, em vez dos dígitos pretendidos `67999990006`. Não foi cadastrado usuário nesta reprodução. Não houve colagem visual nesta sessão; a revisão L06 contém a reprodução histórica em navegador no commit `ca5a442`.

**Impacto:** cadastro de um contato incorreto sem erro, prejudicando o contato entre as partes. É um defeito de integridade do cadastro, não apenas formatação. O teste atual chama a máscara sem aplicar `maxlength` e passa com o problema presente.

**Correção sugerida:** permitir a entrada completa dos formatos aceitos (por exemplo, limite de 20 caracteres, alinhado ao servidor), conservando a limitação por dígitos da máscara. Acrescentar regressão que aplique a restrição HTML antes do evento, incluindo `+55 67 99999-0006` e `+55 (67) 99999-0006`, e confira os dígitos enviados.

### F3 — Média — roteiro de restauração não prepara o banco vazio nem interrompe ao primeiro erro

**Local:** `docs/DEPLOY.md:103`–`112`, em conjunto com `docker-compose.prod.yml:14` e `db/init.sql:4`. Retoma o M1 da revisão L07; os comandos continuam iguais no HEAD.

O guia gera dump SQL simples e manda aplicá-lo ao banco do serviço `db`, exigindo verbalmente um banco vazio, mas sem explicar como obtê-lo. A primeira inicialização normal desse serviço já aplica `init.sql` com tabelas, triggers e seed. Reaplicar o dump nesse destino encontra objetos e IDs existentes; o comando de `psql` também não usa `ON_ERROR_STOP`, permitindo que a execução continue após erros. A instrução genérica de testar em outro ambiente não torna a sequência reproduzível.

**Evidência:** leitura dos comandos, da montagem de `init.sql` e dos `CREATE TABLE`/INSERTs do schema; achado histórico e consequência descritos em REVISAO_L07.md. **Não foi executado dump ou restauração nesta revisão**, nem se afirma perda de dados observada. A suíte atual apenas confere elementos textuais do guia e não demonstra restauração bem-sucedida.

**Impacto:** o grupo pode seguir a sequência no serviço recém-inicializado e obter restauração parcial/falha sem parada inequívoca. O requisito de banco vazio precisa ter um procedimento concreto, com aviso e autorização humanos para qualquer descarte.

**Correção sugerida:** documentar restauração em destino realmente vazio ou uma estratégia explícita de limpeza/restauração, exigir interrupção em erro e verificar os dados restaurados. Usar backup fora do clone; o exemplo atual grava `backup-*.sql` dentro dele e `.gitignore` não ignora esse padrão (achado baixo anterior). Validar em ambiente descartável separado, sem tocar no VPS ou em dados reais. Atualizar também `docs/DEPLOY.md:177`: a revisão L07 registrou `docker compose config` bem-sucedido, embora o guia ainda afirme que não foi executado naquela etapa; distinguir essa evidência histórica da tentativa atual com negativa.

## Conferência integrada e aceite

| Área | Verificação e conclusão |
|---|---|
| Validação, autenticação e SQL | `validacao.js` impõe tipos, limites, CNPJ/DV, datas e IDs; somente ErroValidacao vira 400. JSON malformado/compressão inválida têm regressões. JWT/RBAC nas operações de publicação, reserva e confirmação; consultas com valores externos parametrizados. Produção recusa segredo JWT ausente. |
| Reserva e ciclo de vida | UPDATE condicional garante vencedor único; confirmação tem transação, código, dono, validade e tolerância. Expiração/liberação/eventos estão cobertos por concorrência na suíte. A correção L03/A1 expira reserva atrasada com prazo passado antes de liberar, sem falsa notificação. Atualização é por demanda, não worker/cronômetro. |
| QR, comprovantes e acesso público | QR exige a receptora reservante; comprovante completo só às partes. Snapshot/hash canônico e trigger de imutabilidade presentes. `/verificar/:hash` recalcula integridade e publica resumo mínimo, sem nomes/CNPJs/código. Erro de integridade preserva 500 JSON. HTML dinâmico escapado e tokens não inseridos nas URLs de anexos/WS. |
| Anexos | Fotos JPEG/PNG ≤ 400 KB só ao dono/receptora autorizada; comprovante PDF/JPEG/PNG ≤ 1 MB só à própria ONG. Tipo por assinatura, sem validação completa do documento; não afirmar inspeção sanitária, antivírus ou aprovação administrativa. Downloads protegidos têm no-store. |
| WebSocket | Destinatários gravados pelo servidor na mesma instrução/transação, raio de 10 km para publicação/liberação, demais eventos às partes corretas. JWT no primeiro frame, expiração e persistência HTTP testadas. Resta F1; limite de conexões anônimas e expurgo continuam melhorias futuras. |
| Cadastro e indicadores | Aceite com instante/versão, situação padrão aprovado, termos com [VERIFICAR]/[GRUPO]. KPIs globais e próprios conferidos pela suíte, incluindo SQL independente e isolamento. TMR ignora reservas liberadas, decisão já documentada. Resta F2. |
| Seed e roteiro | Quatro lotes disponíveis, miniatura geométrica sintética no lote 3, dezesseis doações históricas, reserva 21 de Pão Nosso/Esperança com código 482915. README/roteiros correspondem ao produto, distinguem código novo do seed, sessões independentes, QR físico/simulado, WS/consulta HTTP e TMR inicialmente acima da meta. |
| Deploy | Compose de produção publica 80/443 somente no Caddy; app/db sem ports, volumes e variáveis presentes. Desenvolvimento publica 3000/5432, não confundir com produção. Dependências diretas limitadas às seis permitidas. Resta F3. Nenhum build, contêiner, TLS, DNS, firewall ou VPS foi validado nesta sessão. |
| Relatório e entrega | Roteiro de prints contém destinos propostos para o relatório técnico, com numeração [GRUPO]. Não foi localizado relatório técnico novo consolidado entre os arquivos versionados; documentos originais não foram alterados. Consolidação, capturas e entrega permanecem humanas; este relatório de revisão não as substitui. Extras X1/X2/X3 não implementados e não aprovados como entregues. |

Achados anteriores menores preservados, sem elevar artificialmente a severidade: pré-consulta da reserva fora do raio pode revelar existência/disponibilidade por mensagens diferentes (`server.js:347`–`383`, L02); tolerância fixa de 30 min no texto do front apesar de configuração variável (`index.html:461`); aliases com barra final/maiúsculas caem no limite padrão do parser (`server.js:35`–`38`); resposta de notificação em voo pode atravessar troca de sessão (`index.html:721`–`727`, L05); script E2E histórico não acompanha o contrato atual, explicitamente identificado como histórico no README. Nenhum permite confirmar doação ou ler comprovante de outra parte no fluxo examinado. Exigem acompanhamento, mas não são o motivo adicional deste `continue`.

As mudanças preexistentes em `scripts/agentes/*`, plano e execução automática também pertencem ao diff acumulado. A revisão L01 já separou inconsistências de política do controlador para tarefa de planejamento. Ainda há divergência entre `PLANO_AGENTES.md:141`–`142` (negação não autoriza transferência/continuação), `docs/EXECUCAO_AUTOMATICA.md` (modo neverStop e retomadas) e a lógica de transferência incluindo permission_denied em `scripts/agentes/cli.mjs`. Registrar para harmonização pelo responsável, sem executar/alterar controlador, permissões ou fila nesta fase. Nenhuma dessas descrições foi usada para contornar a negativa atual.

## Verificações executadas e evidências preservadas

- **`npm.cmd test` em backend/: código 0; 157 testes, 157 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo; duration_ms 37811.3485.** Reset exclusivo de `alimentams_test` a partir de `db/init.sql`, seguido dos servidores controlados pela suíte. Não foram apagados/afrouxados testes. Não executar essa suíte junto com demo no mesmo banco.
- Encerramento: sondagem TCP posterior em 127.0.0.1 retornou **ECONNREFUSED em 3100 e 3101**. Não foi iniciado servidor manual em 3000; não havia servidor manual desta revisão a encerrar.
- Reproduções F1/F2 em memória, com código real e simulação explicitada acima; nenhuma porta, arquivo de teste ou configuração criada por elas.
- Carga: preservado `docs/testes/resultado-carga.md`, execução histórica de `0600bb4`, 2026-10-28T08:16:22.092Z, 440 requisições, zero erros inesperados e 1 vencedor em cada disputa de 20/200. O script e suas verificações SQL foram lidos. **Carga não repetida**, pois sobrescreve outro arquivo, o que esta revisão proíbe, e não houve alteração funcional posterior ao cenário medido. Não equivale a 200 usuários nem SLA/VPS.
- Segredos: `git ls-files` mostra apenas `.env.example` entre `.env*` e nenhum arquivo de chave privada versionado. Busca `git grep -I` por assinaturas de chave privada, AKIA e tokens gh*/sk não encontrou correspondências. Referências de configuração do produto/compose revisadas: placeholders, `${VAR}`, senha demo e credenciais locais fictícias. Busca adicional de IPv4 nos textos versionados não identificou endereço não local. Não se leu `.env` real nem valores de ambiente; ausência de padrão não prova ausência universal de segredos.
- `git diff --check baseline..HEAD` apontou whitespace preexistente em `progresso/L05.md:56,59,61,64` e linha vazia no fim de `docs/testes/L01-execucao.txt:80`; cosmético, preservado. Não declarar esse check acumulado como verde.
- Tentativa extra: `docker compose --env-file .env.example -f docker-compose.prod.yml config --quiet` emitiu **`Error loading config file: open C:\Users\groun\.docker\config.json: Acesso negado`**. A chamada agrupava também descoberta de executáveis e terminou com código 1; não se atribui esse código isoladamente ao Compose nem se afirma validação completa bem-sucedida. Nenhuma alteração de DOCKER_CONFIG, leitura direta, elevação ou repetição para contornar o arquivo negado.
- **Alternativa permitida após a negativa:** leitura programática de `docker-compose.prod.yml`, com assertivas para os três serviços, ausência de `ports` no app/db e publicação 80/443 no Caddy: passou. Complementa os testes 08 já aprovados; não substitui validação sintática integral ou deploy. Descoberta de `caddy`, `psql` e `pg_dump` não retornou executáveis; não se tentou instalar ou obter acesso alternativo ao Docker.
- A evidência histórica de `docker compose config` aprovado pertence à revisão L07/commit `32aecc8`; não foi apagada nem apresentada como teste atual. `caddy validate`, build da imagem Node 20 e restauração continuam sem nova execução.

## Checklist FINAL e verificações humanas

- [x] Identificar baseline/HEAD/main, árvore inicial e ancestralidade da integração.
- [x] Examinar autorização, concorrência, ciclo de vida, dados públicos, QR, anexos, WS e limites documentais.
- [x] Reaproveitar revisões por commit e verificar correções de risco anteriores no código e na suíte atual.
- [x] Executar npm test e registrar contagem, duração, banco e encerramento.
- [x] Revalidar pendências F1/F2 com evidência independente, manter F3 com evidência estática e limites explícitos.
- [x] Conferir seed, README, roteiros, carga histórica, portas e arquivos versionados de configuração.
- [ ] Corrigir e revalidar F1–F3; **aceite final ainda não concedido**.
- [ ] **Conferência visual humana PENDENTE.** Tentativa atual `cua.getState()` retornou `browsers: []` e `Browsers: Error: The browser access host is unavailable`. Negativa histórica `Computer Use was not approved to use Microsoft Edge` preservada; não foi repetida por acesso nativo nem contornada por outro navegador. O executor desta CLI não expõe `run_in_background`; não foi improvisado outro modo de iniciar o app. A pendência visual isolada não bloqueia o lote por instrução expressa do usuário.

**Roteiro humano exato, após correções e estabilização:**

1. Preparar banco descartável recém-carregado de `db/init.sql`, sem dados reais, sem suíte/carga simultânea. Iniciar somente `node backend/src/server.js` na raiz, em segundo plano pelo mecanismo autorizado, e abrir `http://localhost:3000`. Registrar commit, data/fuso America/Campo_Grande, navegador, dispositivos e origem sem segredos.
2. Executar integralmente `docs/ROTEIRO_DEMO.md`: sessões independentes Comper/Esperança/Amambai, todas autenticadas antes da publicação; Comper publica 50 kg de frutas, validade amanhã, retirada futura e foto sintética; observar aviso nas duas ONGs sem refresh, reservar com Esperança e conferir indisponibilidade na Amambai e janela no Comper.
3. Abrir QR em câmera física do doador com origem acessível ao celular; conferir preservação do link no login, código preenchido, checklist não marcado automaticamente e confirmação única. Se usar link/código manual, registrar simulação. Abrir comprovante pelas duas partes, impressão/prévia apenas se realizada, e verificação pública sem sessão. Conferir +50 kg e uma doação, sem afirmar metas não atingidas.
4. Fazer as 22 capturas/estados de `docs/ROTEIRO_PRINTS.md`, incluindo login/cadastro/termos, foto e ausência de foto, erros de quantidade/validade, ONG longe, Meus números e anexos exclusivamente sintéticos. Abrir cada captura salva e conferir legibilidade e legenda. Guardar destinos/numeração do relatório pelo grupo [GRUPO].
5. Repetir cadastro/publicação/reserva/QR/painel/termos em celular. Usar seletor nativo para JPEG/PNG e PDF; confirmar prévia/redução, erros de limite e abrir comprovante PDF real de conteúdo sintético. Após F2, colar os dois formatos +55 e conferir dígitos. Após F1, abrir seis sessões da mesma conta e conferir comportamento estável no limite.
6. Conferir WS reconectando, central por HTTP sem WS, reserva/retirada para destinatários corretos e liberação somente após janela+tolerância e consulta. Para lote 21, usar Pão Nosso/Esperança e código 482915 somente no seed; não alterar timestamps para simular evidência humana. Encerrar o servidor iniciado ao terminar.

Permanecem humanos [GRUPO]: validação jurídica dos textos [VERIFICAR], contato/controlador/prazo de retenção, consolidação do relatório técnico, decisão sobre contas demo, migração/backup/restauração, build/Compose/Caddy, DNS/TLS/firewall/WebSocket no ambiente de apresentação, câmera/rede, ensaio cronometrado, capturas definitivas e entrega. O revisor não acessa VPS para resolver essas pendências. Nenhum print, deploy, entrega, revisão jurídica ou aprovação humana foi produzido/inventado nesta sessão.

## Próximo passo

O controlador deve encaminhar **F1 (`backend/src/tempo-real.js:45` e `backend/public/index.html:791`), F2 (`backend/public/index.html:140`) e F3 (`docs/DEPLOY.md:103`–`112`, com atualização de `:177`)** a uma fase de correção autorizada. Preservar os achados e regressões existentes, executar `npm test` em backend/ e retornar o novo commit à revisão. Revalidar limite de sessões, integridade do telefone e procedimento de restauração antes do aceite final. Não promover a conferência visual pendente a realizada; o grupo executará o roteiro acima em acesso próprio autorizado. Harmonização das instruções do controlador requer tarefa separada do responsável, não mudanças pelo executor deste lote.

## Retomada da revisão — HEAD c489df0 (28/10/2026)

Esta seção é o resultado mais recente. O conteúdo anterior é preservado como evidência da primeira revisão, incluindo a negativa de acesso à configuração do Docker e a alternativa estática já tentada. Nenhuma negativa foi reclassificada como indisponibilidade. Não houve nova tentativa de acesso ao arquivo negado, alteração de configuração ou elevação.

### Versão e conferência independente

- Branch recebida e mantida: `lote/FINAL`; árvore limpa no início. Baseline confirmada: `cf88651de874b8c1b0c0baaebf87f02f9e9e29c0`; HEAD: `c489df014c6e4005f105de2ac6cfb7f4fb9d4856`; main: `7d12d35224e404023c4a0bd5b77b6ecdcadfcd35`.
- **Atualização da informação histórica acima:** agora `main..HEAD` contém somente este relatório (111 linhas acrescentadas pelo commit `c489df0`). Nenhum código, teste, schema ou roteiro mudou desde o commit integrado já revisado. O intervalo funcional continua sendo `baseline..HEAD`; diff acumulado atual: 62 arquivos, 7.923 inserções e 175 remoções.
- Relidos AGENTS.md, seção Revisão final do plano, LOG e relatório existente. `docs/agentes/progresso/FINAL.md` continua inexistente; o checklist fica exclusivamente neste relatório, conforme autorização de escrita desta fase.
- Examinados novamente o diff acumulado de backend/schema e o contexto de autenticação, autorização, reserva/expiração, confirmação transacional, anexos, QR/hash e WebSocket. Conferidos os pontos dos achados com as revisões L05/L06/L07 e a cobertura dos testes; README, roteiros de demo/prints e resultado histórico de carga continuam compatíveis com os limites registrados. Nenhum novo achado crítico/alto identificado no escopo examinado; isso não dispensa F1–F3.

### Verificações desta retomada

- **`npm.cmd test`, em backend/: exit code 0; 157 testes, 157 pass, 0 fail/cancelled/skipped/todo; duration_ms 38298.8134.** Runner leu a guarda de reset e recriou exclusivamente `alimentams_test` de `db/init.sql`; iniciou o servidor da suíte em 3100 e encerrou seus filhos. Não houve edição de testes. Sondagem TCP posterior em 127.0.0.1 confirmou **ECONNREFUSED em 3100 e 3101**.
- **F1 reproduzido novamente sem rede/navegador:** módulo real `tempo-real.js` em VM, JWT sintético válido para um mesmo ID, funções reais `iniciarTempoReal`/`fecharConexao` extraídas do front e transporte/temporizadores simulados. Seis clientes e doze callbacks de reconexão resultaram em **18 autenticações, 13 fechamentos, 25 consultas a notificações, cinco conexões ativas e um callback ainda pendente**. As doze esperas foram **1.000 ms**. Evidência confirma a combinação `tempo-real.js:45–48` com `index.html:791–805`; os testes atuais exercitam reconexão, mas não estabilização com seis sessões.
- **F2 reproduzido novamente sem cadastro/navegador:** atributo real `maxlength="16"` aplicado por truncamento simulado antes da função real `mascararTelefone`. Entrada `+55 67 99999-0006` virou **`(67) 9999-9000`**; validador real do servidor aceitou **`6799999000`**, diferente do pretendido **`67999990006`**. Evidência confirma `index.html:140`, `:196–202` e envio em `:267`. O teste de máscara vigente não aplica a restrição HTML.
- **F3 reconferido estaticamente:** `docs/DEPLOY.md:103–112` ainda restaura com `psql` sem `ON_ERROR_STOP`, no serviço cujo primeiro boot monta `db/init.sql` (`docker-compose.prod.yml:14`), sem passos para preparar o destino vazio. Schema cria tabelas e popula seed. Não foram executados dump/restauração nem inferida perda de dados observada. A divergência documental de `docs/DEPLOY.md:177` também permanece.
- `git diff --check baseline..HEAD` voltou a apontar whitespace histórico em `progresso/L05.md:56,59,61,64` e `docs/testes/L01-execucao.txt:80`. Não declarado verde; achado cosmético preservado. A chamada agrupada terminou com código 0 porque seu último comando era leitura de log, o que não muda os diagnósticos do diff.
- Carga não repetida: não houve mudança funcional desde a medição e o script sobrescreveria outro arquivo, vedado nesta fase. Os números de `resultado-carga.md` permanecem evidência histórica, não execução nova.
- Tentativa de navegador nesta retomada: **`cua.getState()` retornou `browsers: []` e `Browsers: Error: The browser access host is unavailable`**. Skill computer-use lida. O inventário de apps não foi usado para contornar a negativa histórica de Edge. A ferramenta de execução disponível continua sem parâmetro `run_in_background`; nenhum servidor manual em 3000 foi iniciado e não houve servidor manual desta retomada a encerrar.
- Não houve teste visual, captura, câmera, impressão, deploy, entrega, revisão jurídica ou aprovação humana nesta retomada. Ferramenta: codex; modelo efetivo/esforço não informados pelo cliente. Sem subagentes, outro executor, acesso ao VPS, mensagens, dados reais ou leitura de credenciais. Único arquivo escrito: este relatório; sem Git staging/commit/integração.

### Checklist de retomada e encaminhamento

- [x] Confirmar versão e ausência de mudança funcional desde a revisão anterior; reexaminar diff e contexto de risco.
- [x] Executar suíte em banco descartável e verificar encerramento dos servidores de teste.
- [x] Reproduzir F1/F2 com código real em memória e reconferir F3 no guia/schema.
- [x] Preservar evidências válidas, negativas de acesso e distinção entre testes atuais e históricos.
- [ ] Corrigir F1: distinguir limite de sessões e suspender a reconexão que perpetua expulsões, com regressão integrada de seis clientes (`backend/src/tempo-real.js:45–48`; `backend/public/index.html:791–805`).
- [ ] Corrigir F2: permitir colagem completa dos formatos aceitos antes da máscara e testar a restrição do campo com dígitos enviados (`backend/public/index.html:140`, `:196–202`, `:267`).
- [ ] Corrigir F3: documentar destino vazio reproduzível, interrupção em erro, verificação de restauração e limites reais da validação (`docs/DEPLOY.md:103–112`, `:177`; contexto `docker-compose.prod.yml:14`). Qualquer validação deve usar ambiente descartável e acesso próprio autorizado, sem contornar o Docker negado.
- [ ] **Conferência visual humana PENDENTE**: executar exatamente os seis passos do roteiro humano acima e os 22 estados de `docs/ROTEIRO_PRINTS.md`, após correções. Diagnóstico atual registrado; pendência visual isolada não impede aceite conforme instrução expressa do usuário.
- [ ] Grupo conclui as demais verificações humanas e documentais listadas acima, sem presumir aprovação, prints ou entrega.

**Conclusão atual: continue.** As três correções médias continuam necessárias, sem justificativa de aceite que elimine seus impactos. Encaminhar a fase de correção autorizada, executar testes e devolver o novo commit à revisão. **`block_reason: permission_denied`** identifica a negativa de Docker já registrada e ainda sem validação completa; não é `tool_unavailable`. A falta de navegador não é a razão do `continue` e não foi usada para bloquear isoladamente o lote.
