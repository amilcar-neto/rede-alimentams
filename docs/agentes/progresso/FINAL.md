# Checklist FINAL — correções da revisão final

Ferramenta: claude (fase implement, 28/10/2026). Branch `lote/FINAL`. Sem commits, staging, .git/.agentes, VPS, publicação ou dados reais.
Origem: achados F1–F3 de [REVISAO_FINAL.md](../REVISAO_FINAL.md) (revisão independente do HEAD `14e85fe`). Modelo/esforço: `nao_verificado`.

## Correções

- [x] **F1 — limite de sessões do WebSocket.** `backend/src/tempo-real.js`: a conexão mais antiga que cede a vaga (6ª aba da mesma conta) fecha com código próprio **4001** (antes 1008, o mesmo de autenticação inválida). `backend/public/index.html` (`conexao.onclose`): em 4001 o front não reconecta, recarrega as notificações por HTTP e mostra "Tempo real suspenso…". Os demais códigos mantêm a reconexão com espera crescente. Decisão: sem reconexão automática (nem ao focar a aba), para não recriar o ciclo de expulsão; o tempo real volta ao recarregar a página.
- [x] **F2 — telefone colado com +55.** `backend/public/index.html:140`: `maxlength` de 16 → 20 (cabe `+55 (67) 99999-0006`); a máscara continua limitando a 11 dígitos.
- [x] **F3 — restauração em DEPLOY.md.** Passo 7 reescrito: backup em `~/backups` (fora do clone), restauração em banco realmente vazio (`CREATE DATABASE restaura_teste`), `psql -v ON_ERROR_STOP=1`, verificação por contagens, remoção do banco de ensaio e sequência para substituir produção (parar `app`, recriar o banco, restaurar, verificar, iniciar), com decisão do grupo [GRUPO]. "Limites desta validação" distingue o `docker compose config` do L07 da negativa da revisão final e registra que backup/restauração não foram executados.

## Testes

- [x] `backend/test/06-notificacoes.test.mjs`: (a) front — `onclose({code: 4001})` não agenda reconexão, não abre novo socket e mostra o aviso; (b) servidor — 6 conexões reais da mesma conta: só a mais antiga fecha, com 4001; as 5 restantes continuam abertas e recebem `lote_publicado`.
- [x] `backend/test/07-cadastro-kpis.test.mjs`: a máscara agora recebe o valor já cortado pelo `maxlength` lido do HTML; cobre `+55 67 99999-0006`, `+55 (67) 99999-0006`, `+55 67 3333-0001` e `5567999990006`. Nenhuma asserção anterior removida ou afrouxada.
- [x] `npm.cmd test` em backend/: **158 testes / 158 pass / 0 fail / 0 skipped / 0 todo / 0 cancelled**, ~38,9 s (antes 157; +1 teste de servidor, asserções novas nos dois existentes).
- Não executado: restauração real do DEPLOY.md (sem Docker/VPS), `caddy validate`.

## Conferência no navegador (Claude in Chrome, parcial)

- [x] F2: `maxLength` do campo `cTelefone` = 20 na página servida. A colagem real pelo teclado/área de transferência **não** foi repetida (a leitura do clipboard travou o avaliador na revisão anterior).
- [x] F1: com a conta demo do seed (`esperanca@demo.com`), o app logado abriu seu WebSocket; cinco sockets extras da mesma conta o expulsaram. Resultado: socket do app nulo, `tentativasWs` = 0 (sem reconexão), aviso "Tempo real suspenso…" exibido, os 5 extras abertos. Não é o cenário de seis abas reais, mas exercita o mesmo caminho do servidor e do front.
- [x] Servidor manual encerrado; aba fechada; `localStorage` limpo. Nenhum print salvo.
- **Conferência visual humana PENDENTE** (executar após estas correções, em banco recém-carregado): os 6 passos do roteiro humano de [REVISAO_FINAL.md](../REVISAO_FINAL.md) e os 22 estados de [ROTEIRO_PRINTS.md](../../ROTEIRO_PRINTS.md); inclui celular, QR, câmera, seletor nativo de arquivos, impressão e a colagem real de telefone com +55.

## Limitações e pendências

- B1 (baixa, não corrigida): `confirmar-retirada` sem limite de tentativas de código (`server.js:403–429`); limitação registrada, correção futura.
- Pendências humanas [GRUPO]: revisão jurídica [VERIFICAR], relatório técnico consolidado, build/Compose/Caddy/DNS/TLS no VPS, ensaio real de backup/restauração, capturas definitivas e entrega. Nada disso foi feito ou aprovado.
- Revisão independente do commit corrigido ainda não ocorreu; nenhum aceite final é concedido aqui.

## Próximo passo

Controlador repete `npm test` e chama nova revisão do commit corrigido (F1–F3). Depois o grupo faz a conferência visual humana completa e as pendências [GRUPO].
