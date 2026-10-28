# L08-complemento — seed, roteiros e carga

## Execução — 28/10/2026 (codex, implement)

Executor único; branch `lote/L08-complemento`, árvore limpa no início. Modelo solicitado/efetivo e esforço: `nao_verificado`. Sem commits, staging, troca de branch, VPS, publicação, dados reais ou mudanças em instruções/plano/controlador/configurações/.agentes/.git.

## Checklist e próximo passo

- [x] Ler AGENTS.md, seção L08 do plano, LOG, L08-nucleo e código atual; L03/L06 incluídos. Checklist do complemento inexistente no início.
- [x] Adicionar miniatura PNG geométrica sintética 160×96 (574 bytes) ao lote 3 do seed, preservando lotes sem foto, IDs e histórico. Teste novo validou bytes/tipo, entrega para Comper/Esperança, 404 fora do raio, lote sem imagem e `tem_foto` na listagem; nenhum teste anterior alterado.
- [x] Atualizar README para o escopo L03/L06, limites de dados/indicadores e instruções da carga.
- [x] Escrever demo de 5–7 min (Cenário 1: 50 kg de frutas, Centro → Monte Castelo/Amambai, notificação e QR) e roteiro de prints com contas/estados/seções. Referência consultada: texto do Cenário 1 em `docs/DAC_Etapa_4.docx` (somente leitura).
- [x] Executar carga isolada de busca e disputa de reserva com 20/200 requisições. `node test/carga.mjs` em backend/: código 0, PASSOU, 2026-10-28T08:16:22.092Z; relatório em `docs/testes/resultado-carga.md`.
- [x] Executar `npm test` em backend/, conferir diff e aceite. `npm.cmd test`: código 0, **157 testes / 157 pass / 0 fail / 0 skipped / 0 todo / 0 cancelled**, **35905,391 ms**. `node --check test/carga.mjs` e `git diff --check` sem erros. Diff e arquivos novos conferidos; nenhum código funcional ou teste anterior alterado/afrouxado.
- [ ] Conferência visual humana PENDENTE. Tentativa atual `cua.getState()`: `browsers: []`, `The browser access host is unavailable`. Negativa histórica `Computer Use was not approved to use Microsoft Edge` preservada; acesso negado não repetido nem contornado. Ferramentas de execução disponíveis não têm `run_in_background`; nenhum servidor visual manual iniciado. Roteiro humano exato em `docs/ROTEIRO_DEMO.md` e `docs/ROTEIRO_PRINTS.md`.

Próximo passo: controlador repete testes e encaminha revisão separada quando exigida, incluindo revisão final da correspondência entre produto, seed, README e roteiros. Grupo executa integralmente `docs/ROTEIRO_DEMO.md` e as 22 capturas/estados de `docs/ROTEIRO_PRINTS.md` após estabilização, registrando câmera real ou simulação, dispositivos, datas e resultados. Pendência visual isolada não impede ready por instrução expressa do usuário. Resultado desta fase: **ready**, `block_reason: none`; não equivale a revisão final/ensaio/prints concluídos.

## Decisões

- Sem dependências novas ou alterações no código funcional/schema: apenas seed, teste de acesso à miniatura, documentação e carga fora de npm test.
- Carga usa guarda existente `testConnection()` e reset do banco local exclusivo, servidor filho próprio na porta 3101, duas contas sintéticas próximas e ondas de busca/reserva 20/200; não reutiliza servidor de demonstração nem admite destino remoto. O reset é explicitamente documentado. “Uma reserva venceu” significa unicidade da disputa, sem relação com expiração.
- Roteiros distinguem câmera física, abertura simulada de link e digitação do código; WebSocket ao vivo e consulta HTTP também não são apresentados como equivalentes. Textos legais/contatos humanos permanecem [VERIFICAR]/[GRUPO].

## Evidências da carga e limites

| Operação | N | Média ms | p95 ms | HTTP | Erros inesperados |
|---|---:|---:|---:|---|---:|
| Busca | 20 | 115,62 | 124,01 | 20 × 200 | 0 |
| Reserva | 20 | 42,42 | 45,01 | 1 × 200; 19 × 409 | 0 |
| Busca | 200 | 308,76 | 332,97 | 200 × 200 | 0 |
| Reserva | 200 | 277,36 | 325,56 | 1 × 200; 199 × 409 | 0 |

440 requisições medidas; média/p95 incluem leitura/parse JSON. Em cada disputa: uma reserva vencedora, receptora conferida contra a requisição 200, exatamente um evento e uma notificação ao doador no PostgreSQL. Conflitos 409 esperados não são erros inesperados. Reset exclusivo `alimentams_test` a partir de `db/init.sql`, sem npm test simultâneo; servidor filho 3101 e cliente encerrados. Node v24.19.0 / Windows x64, 16 CPUs disponíveis. Execução única local com dois usuários e sem WS aberto: não mede usuários independentes, câmera, internet, VPS ou SLA. Banco final contém os dados sintéticos dessa carga, não é um seed intacto para prints.

Nenhum teste manual visual, print, QR físico, impressão, deploy, revisão jurídica ou revisão humana ocorreu nesta sessão. A tentativa de navegador e diagnóstico estão acima; servidor manual em 3000 não foi iniciado porque não há `run_in_background`. Consumo e duração total não informados pelo cliente. Pequena correção final apenas de acentos nos comentários do seed; SQL executável preservado após as verificações.
