# Revisão FINAL — baseline..HEAD

> **Retomada em 28/10/2026:** revisão revalidada no HEAD `c489df014c6e4005f105de2ac6cfb7f4fb9d4856`. Resultado **continue**; F1–F3 permanecem necessários. A seção final deste arquivo registra as verificações novas e distingue as evidências históricas preservadas abaixo. `block_reason: permission_denied` preserva a negativa anterior do Docker, sem reclassificá-la ou contorná-la.
>
> **Revisão independente claude em 28/10/2026 (HEAD `14e85fe`):** resultado **continue**; F1 e F2 reproduzidos agora em navegador real (Claude in Chrome), F3 reconferido. Ver a seção "Revisão independente — claude — HEAD 14e85fe".
>
> **Revisão das correções, claude, 28/10/2026 (HEAD `1d74e5c`):** resultado **ready**; F1–F3 corrigidos e conferidos (suíte 158/158, F1 e F2 em navegador real). Conferência visual humana e pendências [GRUPO] continuam abertas. Ver a última seção, "Revisão das correções F1–F3 — claude — HEAD 1d74e5c".

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

## Revisão independente — claude — HEAD 14e85fe (28/10/2026)

Esta seção é o resultado mais recente; as seções acima são preservadas como evidência histórica (codex), inclusive a negativa de acesso à configuração do Docker, que **não** foi repetida, contornada nem reclassificada aqui. Ferramenta: claude; modelo efetivo/esforço não informados pelo cliente. Executor único, sem subagentes.

### Versão e escopo

- Branch `lote/FINAL`, árvore limpa no início. Baseline `cf88651`; HEAD `14e85feea7fffd8b443c2b08305a5d206f95ee85`; main `7d12d35`. `main..HEAD` contém apenas este relatório (commits `c489df0` e `14e85fe`, "FINAL wip: codex review"); nenhum código, teste, schema ou roteiro mudou depois do commit integrado `7d12d35`. Intervalo funcional revisado: `baseline..HEAD` (62 arquivos, 7.961 inserções, 175 remoções).
- Lidos AGENTS.md, seções de revisão final do PLANO_AGENTES.md (§4.3 e §6), LOG.md e este relatório. `docs/agentes/progresso/FINAL.md` continua inexistente; não foi criado porque esta fase autoriza escrever somente este arquivo. O checklist FINAL fica aqui.
- Leitura própria de `backend/src/server.js` (rotas, `atualizarStatus`, reserva, confirmação transacional, foto, QR, comprovante, `/verificar`, notificações), `backend/src/tempo-real.js`, trechos de `index.html` (máscara, cadastro, tempo real), `docs/DEPLOY.md` §7 e "Limites", `docker-compose.prod.yml` e testes 06/07. README/roteiros não foram relidos integralmente; aproveito a conferência das revisões anteriores identificadas por commit.

### Achados — confirmação independente

- **F1 (Média) — confirmado em navegador real.** `backend/src/tempo-real.js:45–48` fecha a conexão mais antiga com 1008; `backend/public/index.html:791–805` trata 1008 consultando `/notificacoes` e reconectando, e `tentativasWs = 0` a cada `autenticado` mantém a espera em 1 s. Reprodução: servidor local `node backend/src/server.js` (porta 3000, banco descartável de testes), conta demo do seed `amambai@demo.com` (receptora, id 5) em **seis abas** do mesmo navegador. Medido por `performance.getEntriesByType('resource')` em cada aba: após ~57 s, **11 requisições a `/notificacoes` em cada uma das cinco abas novas** e 10 na primeira; na sexta aba, **13 → 17 requisições em 15 s** sem qualquer ação do usuário. Todas as abas exibiam `ws.readyState = 1` e `tentativasWs = 0` no instante da leitura, ou seja, a alternância continua (expulsa → reconecta em 1 s → expulsa outra). O ciclo não converge e gera carga contínua; nenhum teste da suíte cobre seis sessões com o front.
- **F2 (Média) — confirmado em navegador real.** `backend/public/index.html:140` (`maxlength="16"`) + `:196–202` (`mascararTelefone`). Texto `+55 67 99999-0006` colocado na área de transferência e colado com Ctrl+V no campo "Telefone do responsável" do formulário real: valor resultante **`(67) 9999-9000`** (captura de tela e leitura do campo; `maxLength` = 16). O backend aceita esse formato (dígitos `6799999000`), portanto o cadastro gravaria outro número sem erro. Formulário **não** enviado; nenhuma conta criada. O teste `backend/test/07-cadastro-kpis.test.mjs:386–394` chama a máscara com o texto completo, sem aplicar `maxlength`, e por isso passa com o defeito presente.
- **F3 (Média) — reconferido estaticamente.** `docs/DEPLOY.md:110–113`: `psql` sem `-v ON_ERROR_STOP=1`, aplicado ao serviço `db` cujo primeiro boot já executa `db/init.sql` (`docker-compose.prod.yml:14`), que cria tabelas e seed; não há passo para obter o "banco vazio" pedido em `:107–108`. `backup-*.sql` é gerado dentro do clone (`:104`) e não é ignorado no `.gitignore`. `docs/DEPLOY.md:177–178` ainda diz que `docker compose config` não foi executado, em divergência com a evidência histórica da revisão L07. Nenhum dump/restauração executado.

Concordo com a classificação **média** dos três: nenhum permite acesso indevido, confirmação de doação alheia ou vazamento de dados; mas F2 grava silenciosamente um dado de cadastro errado, F1 degrada o tempo real e gera carga contínua, e F3 pode levar o grupo a uma restauração parcial sem parada. As correções são pequenas e precedem prints definitivos/entrega; por isso mantenho **continue**.

### Observações novas (baixa, sem correção obrigatória neste lote)

- **B1 — Baixa.** `PUT /lotes/:id/confirmar-retirada` (`backend/src/server.js:403–429`) não limita tentativas de código. Só o doador dono do lote reservado pode tentar, sem ganho de acesso a dados de terceiros, mas ele poderia registrar "entrega" sem a presença da receptora por força bruta dos 10⁶ códigos dentro da janela + tolerância. Sugestão futura: limitar tentativas por lote. Limitação registrada; não motiva o `continue`.
- Achados baixos anteriores (pré-consulta da reserva `server.js:347–360`, texto fixo de tolerância no front, resposta de notificação em voo entre sessões, E2E histórico) continuam presentes e documentados acima.

### Áreas do escopo FINAL conferidas nesta sessão

| Área | Conclusão desta revisão |
|---|---|
| Autorização | Rotas de escrita com `autenticar` + `exigirPerfil`; `/perfil/comprovante` exige receptora e lê só o próprio `usuario_id`; comprovante de doação 403 para terceiros; foto 404 fora da regra de visibilidade. |
| Concorrência e expiração | Reserva por `UPDATE ... WHERE status='disponivel'` com raio na mesma instrução; confirmação em transação com dono, código, validade e tolerância; `atualizarStatus` com `FOR UPDATE` ordenado e expiração antes da liberação (correção L03/A1 presente). |
| Exposição pública | `/verificar/:hash` valida formato e devolve página mínima; `/saude` só booleanos; `/bairros` lista estática. |
| WebSocket | JWT só no primeiro frame, prazo de 5 s, expiração alinhada ao JWT, destinatários gravados em SQL no raio. Resta F1. |
| SQL | Valores externos parametrizados; interpolações restantes são constantes do código (`tipo`, `titulo`, `FUSO`, coluna derivada do perfil). |
| Deploy | Só o Caddy publica 80/443 no compose de produção; `JWT_SECRET` obrigatório em produção. Resta F3. Sem build/Compose/Caddy/VPS nesta sessão. |
| Documentação | Inconsistência `DEPLOY.md:177` (F3). Relatório técnico consolidado não está no repositório: pendência humana [GRUPO]. |

### Verificações executadas nesta sessão

- **`npm.cmd test` em backend/: EXIT 0; 157 testes, 157 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo; duration_ms 38076,2381.** Reset exclusivo de `alimentams_test` a partir de `db/init.sql`. Nenhum teste alterado. A suíte terminou **antes** de iniciar o servidor manual (mesmo banco).
- `git diff --check cf88651..HEAD -- backend db docker-compose.prod.yml docs/DEPLOY.md README.md`: código 0 (o whitespace histórico já registrado fica em arquivos de progresso/evidência fora desse filtro).
- Servidor manual: somente `node backend/src/server.js` em segundo plano ("Rede AlimentaMS rodando em http://localhost:3000"); encerrado ao final pela ferramenta de tarefas; sondagem TCP posterior em 127.0.0.1:3000 → **ECONNREFUSED**.
- Navegador: extensão Claude in Chrome conectada (navegador Chromium cujas abas novas abrem `edge://newtab/`; UA reporta `Chrome/156`). A aba trazia sessão residual de conta sintética de teste ("ONG Revisão L06"), encerrada com "Sair". Usada somente a conta demo do seed com a senha documentada no README, pela função `demo()` do próprio front. Todas as abas criadas foram fechadas e a sessão encerrada (`localStorage.token = null`). Nenhum formulário enviado, nenhuma conta criada, nenhuma captura salva.
- Uma leitura de `navigator.clipboard.readText()` travou o avaliador de JavaScript da aba por 45 s (provável pedido de permissão do navegador); não foi repetida nem contornada. F2 foi verificado pela captura de tela e por leitura direta do campo.
- Docker/Compose não reexecutados; a negativa histórica permanece registrada acima, sem reclassificação. Carga não repetida (sem mudança funcional desde `0600bb4`; o script sobrescreveria `docs/testes/resultado-carga.md`, vedado nesta fase).
- Sem acesso a VPS, publicação, mensagens, dados reais, leitura de `.env`, alteração de código/testes/plano/instruções/controlador/fila/.agentes ou operações Git. Único arquivo escrito: este relatório.

### Checklist FINAL (claude)

- [x] Confirmar baseline/HEAD/main e ausência de mudança funcional após `7d12d35`.
- [x] Revisar por conta própria autorização, concorrência/expiração, exposição pública, WS, SQL e deploy.
- [x] Executar `npm test` em banco descartável antes do servidor manual.
- [x] Reproduzir F1 e F2 no navegador real; reconferir F3 no guia.
- [x] Encerrar servidor, abas e sessão do navegador.
- [ ] Corrigir F1 (`backend/src/tempo-real.js:45–48`, `backend/public/index.html:791–805`) com regressão de seis conexões e reação do front.
- [ ] Corrigir F2 (`backend/public/index.html:140`, `:196–202`) e ajustar `backend/test/07-cadastro-kpis.test.mjs:386` para aplicar `maxlength` antes da máscara (`+55 67 99999-0006` e `+55 (67) 99999-0006`).
- [ ] Corrigir F3 (`docs/DEPLOY.md:102–115` e `:177`): destino realmente vazio, `ON_ERROR_STOP`, verificação pós-restauração, backup fora do clone.
- [ ] **Conferência visual humana PENDENTE** do fluxo completo: executar os seis passos do "Roteiro humano exato" acima e os 22 estados de `docs/ROTEIRO_PRINTS.md`, em banco recém-carregado, após as correções. Esta sessão conferiu no navegador apenas F1 e F2; não fez demo completa, prints, câmera, celular, impressão ou seletor nativo de arquivos.
- [ ] Pendências humanas [GRUPO]: revisão jurídica [VERIFICAR], relatório técnico consolidado, build/Compose/Caddy/DNS/TLS no VPS, backup/restauração real, ensaio, capturas definitivas e entrega. Nada disso foi feito ou aprovado nesta revisão.

### Conclusão

**continue.** Sem achado crítico/alto, mas F1, F2 e F3 (médios, reproduzidos/confirmados) são correções necessárias antes do aceite final e dos prints definitivos. Encaminhar fase de correção autorizada com os arquivos:linha acima, `npm test` e nova revisão do commit corrigido. `block_reason: none` nesta sessão: nenhuma permissão foi negada e nenhuma ferramenta faltou; a negativa histórica do Docker continua registrada como `permission_denied` nas seções anteriores.

## Revisão das correções F1–F3 — claude — HEAD 1d74e5c (28/10/2026)

Esta seção é o resultado mais recente; as anteriores ficam como evidência histórica, inclusive a negativa de acesso à configuração do Docker (`permission_denied`, sessão codex), que não foi repetida, contornada nem reclassificada. Ferramenta: claude; modelo efetivo/esforço não informados pelo cliente. Executor único, sem subagentes.

### Versão e escopo

- Branch `lote/FINAL`, árvore limpa no início. Baseline `cf88651`; HEAD `1d74e5cb60ce097c4a01fb86f7c480755b514d61`; main `7d12d35`. Diff acumulado `baseline..HEAD`: 63 arquivos, 8.147 inserções, 175 remoções.
- Mudança desde a última revisão (`14e85fe..1d74e5c`, "FINAL wip: claude implement"): `backend/src/tempo-real.js`, `backend/public/index.html` (maxlength e ramo 4001), testes 06 e 07 (só acréscimos), `docs/DEPLOY.md` §7 e "Limites", `LOG.md` e o novo `progresso/FINAL.md`. Lidos integralmente o diff e o contexto de `iniciarTempoReal`/`fecharConexao`/`mostrarAviso`, `mascararTelefone`, `validacao.telefone`, `registrar` em `tempo-real.js`, a imagem/montagem do `db` no compose de produção e o checklist/LOG do FINAL.

### Conferência dos achados

- **F1 — resolvido.** `backend/src/tempo-real.js:9,49`: a conexão que cede a vaga fecha com `4001` (faixa de aplicação 4000–4999), distinto do `1008` de autenticação. `backend/public/index.html:804–810`: em 4001 o front consulta `/notificacoes` por HTTP, mostra aviso e retorna antes de agendar reconexão; não há outro gatilho de reconexão automática (`iniciarTempoReal` só é chamado no login/restauração de sessão, `:304`, e pelo próprio temporizador). Teste de servidor novo (`backend/test/06-notificacoes.test.mjs:418–429`) abre seis conexões reais: só a mais antiga fecha, com 4001, e as cinco restantes recebem `lote_publicado`; teste de front (`:404–415`) confere ausência de nova tentativa e o aviso. **Navegador real (Claude in Chrome), nesta sessão:** conta demo `amambai@demo.com` em seis abas; a primeira ficou com `ws = null`, `tentativasWs = 0` e 2 consultas a `/notificacoes`; as outras cinco com `readyState = 1` e 1 consulta cada. **Depois de mais 20 s, contagens idênticas** (na revisão de `14e85fe`, a sexta aba ia de 13 para 17 consultas em 15 s). O ciclo de expulsão não ocorre mais.
- **F2 — resolvido.** `backend/public/index.html:140`: `maxlength="20"`, igual ao limite de `validacao.telefone` (`backend/src/validacao.js:139`); a máscara (`:196–202`) continua limitando a 11 dígitos. O teste 07 (`backend/test/07-cadastro-kpis.test.mjs:392–398`) lê o `maxlength` do HTML e trunca antes da máscara, cobrindo quatro formatos, sem afrouxar asserções antigas; com o valor anterior (16) ele falharia. **Navegador real, nesta sessão:** formulário de cadastro, inserção com `document.execCommand('insertText')` no campo focado (edição equivalente à do usuário, `maxLength` = 20): `+55 67 99999-0006` → `(67) 99999-0006`; `+55 (67) 99999-0006` → `(67) 99999-0006`; `+55 67 3333-0001` → `(67) 3333-0001`. Campo limpo depois; formulário **não** enviado, nenhuma conta criada. A colagem real pela área de transferência (Ctrl+V) não foi repetida.
- **F3 — resolvido no documento.** `docs/DEPLOY.md:98–151`: backup em `~/backups` (fora do clone, `chmod 700`), explicação de por que o banco do serviço não está vazio (init.sql no primeiro boot), ensaio em `restaura_teste` criado vazio, `psql -v ON_ERROR_STOP=1` (`:124`), verificação por contagens (`usuarios`, `lotes`, `notificacoes` existem em `db/init.sql`), remoção do banco de ensaio e sequência de substituição com parada do `app` e decisão [GRUPO]. `:213–216` distingue o `docker compose config` histórico do L07 da negativa da revisão final e declara que backup/restauração não foram executados. **Não executado nesta revisão** (sem Docker/VPS; negativa histórica não contornada).

### Observações novas (baixa, sem correção obrigatória)

- **B2 — Baixa.** O aviso do 4001 usa `mostrarAviso`, que some após 8 s (`backend/public/index.html:760`); depois disso a aba suspensa não indica que está sem tempo real (no teste o aviso já estava oculto ao ler a aba). As notificações continuam acessíveis pelo sino/HTTP e a decisão está registrada em `progresso/FINAL.md`. Melhoria futura: indicador persistente.
- **B3 — Baixa / não verificado.** A imagem `postgis/postgis:16-3.4` (`docker-compose.prod.yml:6`) instala extensões auxiliares do PostGIS no banco do serviço, que entrarão no dump. Eventuais conflitos dessas extensões na restauração **não foram verificados**. Com `ON_ERROR_STOP` e o ensaio em `restaura_teste` (passo 1), qualquer falha aparece sem afetar o banco em uso; por isso o ensaio do grupo em ambiente descartável é obrigatório antes de depender do procedimento (já declarado em `docs/DEPLOY.md:150–151`).
- O passo 3 de `DEPLOY.md` (substituir produção) está em prosa, sem bloco de comandos literal; aceitável por exigir decisão [GRUPO], mas o grupo deve registrar os comandos exatos ao ensaiar.
- B1 (tentativas de código em `confirmar-retirada`, `backend/src/server.js:403–429`) e os achados baixos anteriores permanecem registrados como limitações.

### Verificações executadas nesta sessão

- **`npm.cmd test` em backend/: 158 testes, 158 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo; duration_ms 38865,5901.** Reset exclusivo de `alimentams_test` a partir de `db/init.sql`; suíte concluída **antes** do servidor manual.
- `git diff --check 7d12d35..HEAD -- backend docs/DEPLOY.md`: código 0.
- Servidor manual: somente `node backend/src/server.js` em segundo plano ("Rede AlimentaMS rodando em http://localhost:3000"), encerrado pela ferramenta de tarefas; sondagem TCP posterior em 127.0.0.1:3000 → **ECONNREFUSED**.
- Navegador: Claude in Chrome conectado. Usada só a conta demo do seed pelo botão de demonstração do próprio front; sessão encerrada com "Sair"; as seis abas criadas foram fechadas. Nenhum formulário enviado, nenhuma conta criada, nenhuma captura salva.
- Não executados: Docker/Compose, `caddy validate`, backup/restauração, carga (sem mudança no cenário medido; o script sobrescreveria `docs/testes/resultado-carga.md`). Sem VPS, publicação, mensagens, dados reais, leitura de `.env`, alteração de código/testes/plano/instruções/controlador/fila/.agentes ou operações Git. Único arquivo escrito: este relatório.

### Checklist FINAL (revisão das correções)

- [x] Confirmar versão e isolar a mudança `14e85fe..1d74e5c`.
- [x] F1: código, regressões de servidor e front, e conferência em seis abas reais sem ciclo.
- [x] F2: `maxlength` alinhado ao servidor, regressão que aplica o limite do HTML, conferência no formulário real.
- [x] F3: destino vazio, `ON_ERROR_STOP`, verificação, backup fora do clone e limites documentais corrigidos.
- [x] `npm test` verde em banco descartável; servidor, abas e sessão encerrados.
- [ ] **Conferência visual humana PENDENTE** (não feita nesta sessão): em banco recém-carregado de `db/init.sql`, executar os seis passos do "Roteiro humano exato" (seção "Checklist FINAL e verificações humanas" acima) e os 22 estados de `docs/ROTEIRO_PRINTS.md`, incluindo celular, câmera/QR, seletor nativo de arquivos, impressão, colagem real de telefone com +55 pela área de transferência e seis abas reais da mesma conta (conferir aviso e estabilidade).
- [ ] Pendências humanas [GRUPO]: revisão jurídica [VERIFICAR], relatório técnico consolidado, build/Compose/Caddy/DNS/TLS no VPS, ensaio real de backup/restauração (inclui B3), capturas definitivas e entrega. Nada disso foi feito ou aprovado.

### Conclusão

**ready.** F1, F2 e F3 estão corrigidos, com regressões que falhariam no código anterior e conferência própria (navegador para F1/F2, leitura para F3); nenhum achado crítico/alto em `baseline..HEAD`. B1–B3 são baixas e ficam registradas como limitações. Este aceite técnico não substitui a conferência visual humana, as pendências [GRUPO], prints definitivos, deploy ou entrega, que continuam por fazer. `block_reason: none` nesta sessão.
