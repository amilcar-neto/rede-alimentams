# Executar a fundação de testes

Requisitos: Node.js 24 (validado com 24.19.0), dependências de backend/ instaladas,
PostgreSQL/PostGIS local e usuário de teste com permissão para recriar seu banco
e instalar as extensões de `db/init.sql`. Não usar dados reais.

O controlador existente fornece TEST_DATABASE_URL e DATABASE_URL de teste. Para
preparar o banco, usar o procedimento existente em
[Execução automática](../EXECUCAO_AUTOMATICA.md); não iniciar outro controlador
enquanto um executor estiver ativo.

Na pasta `backend/`, executar `npm test` (`npm.cmd test` no Windows quando
PowerShell selecionar npm.ps1 bloqueado pela política local). Não é necessário
alterar política de execução. Nenhum arquivo .env é lido pelo harness.

TEST_DATABASE_URL é obrigatória. Somente host local e nome `alimentams_test` ou
`alimentams_test_<sufixo>` (letras minúsculas, números e sublinhado) são aceitos;
parâmetros de URL são recusados. O reset valida antes de conectar, recria apenas
esse banco via pg e carrega `db/init.sql`, sem psql. O banco é descartável e
seus dados anteriores são removidos em cada execução. Nunca apontar para um
banco de desenvolvimento/produção, mesmo renomeado com sufixo de teste.

O runner recusa porta 3100 ocupada antes de resetar. Define DATABASE_URL do
servidor filho e TEST_DATABASE_URL dos testes para a mesma conexão validada,
usa segredo JWT fictício, aguarda prontidão por até 10 s e executa os arquivos
`test/*.test.mjs` em ordem, sem isolamento em subprocessos adicionais. O limite
por teste é 60 s e o processo de testes tem limite global de 90 s. Encerra os
filhos ao terminar, falhar ou receber SIGINT/SIGTERM, com escalada após 2 s.
Encerramento forçado do próprio runner pelo sistema operacional não permite
executar sua rotina de limpeza.

O resumo nativo do node:test informa pass/fail/cancelled/skipped/todo e detalhes
das asserções. Código 0 admite somente aprovações e pendências conhecidas
explicitamente reproduzidas. Erros novos, infraestrutura indisponível e timeout
retornam código não zero. As nove pendências e a execução estrita estão em
[Pendências do L01](PENDENCIAS_L01.md). Os logs de erro do servidor são mantidos.

O E2E histórico em docs/testes/e2e-api.mjs permanece intacto. O arquivo adaptado
preserva suas 48 verificações; o helper usa America/Campo_Grande para datas e
timeout HTTP de 10 s. Os testes de fundação adicionais verificam a recusa do
reset, preservação de sentinela, conexão compartilhada e falhas não conhecidas.
