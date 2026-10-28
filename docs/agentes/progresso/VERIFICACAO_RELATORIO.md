# Verificação de fontes do relatório — 28/10/2026

Pedido direto do usuário: verificar as pendências externas da versão Claude e a relação do projeto com a legislação. Executor único, Codex; sem subagentes. Modelo efetivo/esforço e consumo não informados pelo cliente.

## Checklist e evidências

- [x] Ler versão Claude completa, termos, registros de progresso/LOG, plano aplicável e diferenças em relação à entrega. Preservar versões anteriores e trabalho alheio.
- [x] Conferir Lei 15.224/2025 e dados da norma na Câmara: existência, data, publicação, revogação da 14.016/2020, aplicativos de microcoleta, selo e condições de doação. Planalto retornou bloqueio; fonte oficial alternativa Câmara acessada normalmente.
- [x] Consultar LGPD atualizada, RDC 216/2004, Receita Federal, IBGE, PNUMA, ONU, Sesc e páginas oficiais das soluções existentes. URLs e limites no relatório e em `docs/agentes/REVISAO_RELATORIO.md`.
- [x] Gerar nova cópia `docs/RELATORIO_TECNICO_VERIFICADO.md` a partir da versão Claude, sem apagar originais. Retirar marcadores externos mediante confirmação ou descrição explícita da ausência de fundamento. Manter apenas fatos exclusivos do grupo como [GRUPO].
- [x] Registrar limites legais e técnicos A1–A5, sem alterar termos, versão de aceite, código ou testes. Não certificar adequação operacional integral.
- [x] Gerar `docs/RELATORIO_TECNICO_VERIFICADO.pdf`, 17 páginas, com referências conferidas. Habilidade pdf aplicada. ReportLab/Poppler do runtime, inspeção de todas as páginas, ajustes de larguras, glifo CO2 e viúvas. Páginas inalteradas entre renderizações conferidas por SHA-256 das imagens; páginas alteradas reinspecionadas após última geração.
- [x] `npm.cmd test` em backend/, banco local exclusivo `alimentams_test`: código 0, **176/176**, 0 fail/cancelled/skipped/todo, **33251,8912 ms**. Runner recriou somente o banco de testes e encerrou os filhos. Testes e código preservados.
- [x] `git diff --check` e conferência das alterações documentais ao encerrar. Sem operações Git de escrita, runtime, configuração, controlador, fila, VPS, publicação, mensagens ou dados reais.

## Decisões

- Preservados os dois integrantes da versão Claude, conforme registro do LOG de dupla autorizada. Não reutilizada a capa antiga da Etapa 4.
- Referências de estatísticas indicam ano e universo: domicílios nacionais de 2024 e desperdício mundial de 2022; não atribuídas a Campo Grande.
- Fatores ambientais não fundamentados mantidos apenas como simulação interna; não alterados fatores do produto nesta revisão documental.
- Campo, custos, divisão individual, aparelho e capturas exigem informação do grupo. A afirmação de câmera real não foi confirmada por inferência.
- Resultado: verificação documental concluída; relatório acadêmico atualizado com limites explícitos. Conformidade integral para dados/doações reais não demonstrada. Próximo passo: grupo completa fatos próprios; eventuais correções operacionais A1–A5 devem ser tratadas em tarefas específicas, com validação aplicável.
