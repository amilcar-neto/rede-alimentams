# Verificação documental do relatório técnico

Data: 28/10/2026. Executor único: Codex, sem subagentes. Escopo: relatório do Claude, fontes externas marcadas e comparação documental com os termos e recursos do MVP. Sem alteração de código, testes ou textos aceitos na aplicação. As versões anteriores foram preservadas; a consolidação está em `docs/RELATORIO_TECNICO_VERIFICADO.md` e no PDF correspondente.

**Resultado:** fontes externas identificadas e texto corrigido para o relatório acadêmico. **Conformidade integral para operação real não demonstrada.** A conclusão do MVP permanece distinta de habilitação sanitária, adequação completa à LGPD, benefício fiscal ou concessão de selo. Esta é conferência documental e técnica, não parecer jurídico ou inspeção sanitária.

## 1 Leis e aplicação ao projeto

### Lei 15.224 de 2025 — confirmada

Existe, é de 30/09/2025 e foi publicada em 01/10/2025. Institui a política nacional de combate à perda e ao desperdício, cria o selo e revoga a Lei 14.016/2020. O cadastro da Câmara consultado não registra revogação expressa da nova lei.

O art. 4º, VIII, prevê aplicativos de aproximação entre doadores e receptores. Isso fundamenta a proposta, sem aprovar automaticamente um aplicativo. O art. 14 condiciona a doação à segurança e à validade; seu § 1º prevê profissional habilitado nas situações ali descritas, conforme regulamento. Os arts. 9–13 tratam do selo, concedido pelo Executivo. Os arts. 15–17 estabelecem regime específico para doações realizadas nos termos da lei; não autorizam promessa genérica de ausência de responsabilidade da plataforma.

Fonte: [texto da Lei 15.224/2025](https://www2.camara.leg.br/legin/fed/lei/2025/lei-15224-30-setembro-2025-798048-publicacaooriginal-176570-pl.html) e [dados da norma](https://www2.camara.leg.br/legin/fed/lei/2025/lei-15224-30-setembro-2025-798048-norma-pl.html).

**Achado A1 — relevante antes do uso real.** `backend/public/termos.html`, seção Responsabilidades do doador, ainda aponta a Lei 14.016/2020 como referência a conferir. Deve ser atualizada em tarefa própria, preservando o histórico de versões aceitas. A verificação do relatório não altera unilateralmente o texto dos termos nem a versão `2026-10-v1`.

**Achado A2 — requisito operacional.** O checklist de três campos não avalia habilitação profissional, cadeia de frio, estabelecimento ou qualidade nutricional. Não deve ser descrito como prova de cumprimento do art. 14. Os requisitos de atividade e as normas estaduais/municipais aplicáveis precisam ser definidos com os participantes e a autoridade competente [VERIFICAR]. A RDC 216/2004 existe e trata de serviços de alimentação; sua aplicação não equivale a uma norma única para qualquer doador ou categoria de alimento. Fonte: [Ministério da Saúde](https://bvsms.saude.gov.br/bvs/saudelegis/anvisa/2004/res0216_15_09_2004.html).

Não foi certificado o conjunto de regulamentos locais ou dos procedimentos de selo. O relatório não afirma que inexiste regulamentação: apenas não concede selo nem promete cumprimento de requisitos que o software não verifica.

### LGPD — lei confirmada, adequação incompleta

A Lei 13.709/2018 está disponível em texto atualizado. Os arts. 7º e 8º tratam das hipóteses e condições; o art. 9º, da transparência; o art. 16, da conservação após o tratamento; o art. 18, dos direitos; e o art. 46, da segurança.

**Achado A3 — relevante antes de dados reais.** A política ainda deixa controlador, contato e retenção como `[GRUPO]`. O aceite obrigatório não define por si só todas as bases legais. Faltam decisões documentadas para atendimento aos titulares e tratamento/guarda dos anexos e contatos. JWT, bcrypt e controle de acesso são controles técnicos, não certificação legal. O gatilho de imutabilidade não justifica guardar dados pessoais para sempre. HTTP e parâmetros de demonstração também não devem ser transpostos diretamente para produção.

Fonte: [LGPD atualizada na Câmara](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html). Não se conclui que todo dado é pessoal: informações dos responsáveis e documentos anexados podem conter dados de pessoas naturais. O caráter acadêmico não deve ser usado como dispensa genérica; a própria lei preserva os arts. 7º e 11 na hipótese acadêmica.

### CNPJ alfanumérico — limitação atual confirmada

**Achado A4 — compatibilidade.** `backend/src/validacao.js`, função de CNPJ, e a máscara do cadastro aceitam apenas o formato numérico. A Receita anunciou o primeiro código alfanumérico em 31/07/2026, mantendo válidos os anteriores. O relatório passou a registrar a limitação e a melhoria necessária. Isso não invalida os CNPJs numéricos existentes nem prova irregularidade de uma entidade; impede cadastrar algumas novas inscrições.

Fonte: [Receita Federal e Ministério da Fazenda](https://www.gov.br/fazenda/pt-br/assuntos/noticias/2026/julho/receita-federal-gera-o-primeiro-cnpj-em-formato-alfanumerico).

## 2 Estatísticas e sustentabilidade

| Item | Resultado | Correção no relatório |
| --- | --- | --- |
| IBGE | PNAD Contínua 2024: 24,2% dos domicílios, aproximadamente 18,9 milhões, com algum grau de insegurança alimentar | Ano, unidade e abrangência explícitos; não atribuir a Campo Grande ou chamar todos de fome grave |
| PNUMA | Relatório de 2024 estima 1,05 bilhão de toneladas em 2022, nos três setores estudados, incluindo partes não comestíveis | Não tratar o total como alimento comestível disponível para doação |
| ODS | Metas 12.3 e 2.1 confirmadas | Alinhamento temático, sem alegar cumprimento das metas pelo protótipo |
| Duas refeições por kg | Parâmetro aritmético equivalente a 500 g por refeição | Não é validação nutricional ou contagem de refeições servidas |
| 2,5 kg CO2e por kg | Sem fonte metodológica identificada que sustente seu uso universal neste projeto | Simulação interna, não emissão efetivamente evitada |
| 350 litros por kg | Sem fonte identificada para aplicação uniforme às categorias do projeto | Simulação interna, não água efetivamente economizada |

Fontes: [IBGE, apresentação PNAD 2024](https://agenciadenoticias.ibge.gov.br/media/com_mediaibge/arquivos/724f23c52823528787ba0ef28b7940e3.pdf), [PNUMA](https://www.unep.org/en/news-and-stories/press-release/world-squanders-over-1-billion-meals-day-un-report), [ODS 12](https://brasil.un.org/pt-br/sdgs/12), [ODS 2](https://brasil.un.org/pt-br/sdgs/2).

**Achado A5 — afirmação ambiental.** A pesquisa não encontrou suporte para a combinação fixa usada pelo MVP. Isso não prova inexistência de qualquer estudo com números parecidos: significa que não há fundamento identificado que valide esses parâmetros no escopo adotado. A [FAO, The State of Food and Agriculture 2020, tabela 1](https://digitallibrary.un.org/record/3930108/files/cb1447en.pdf) distingue grupos de alimentos. Até metodologias de outras plataformas são específicas de seu escopo: [Too Good To Go](https://www.toogoodtogo.com/en-ca/about-food-waste) informa fatores diferentes em seu estudo. Não foram transplantados fatores estrangeiros para o projeto. Um cálculo de impacto evitado exigiria cenário de descarte, categoria, origem, transporte e hipótese de substituição.

## 3 Soluções existentes

- [Sesc Mesa Brasil](https://www.sesc.com.br/assistencia/sesc-mesa-brasil/): redistribuição de excedentes a instituições cadastradas e ações educativas confirmadas. Retirada a alegação sem evidência de que não atende pequenos lotes. A atuação municipal corrente não foi presumida a partir de uma descrição nacional.
- [Too Good To Go](https://www.toogoodtogo.com/en-us/about-us): modelo de venda de excedentes com desconto confirmado; mantido como referência internacional, sem afirmar presença no Brasil.
- [Comida Invisível](https://app.comidainvisivel.com.br/): página oficial descreve conexão, documentação das ONGs e capacitação. Não foi realizada auditoria de todas as funcionalidades, cobertura ou eficácia da empresa. Retirada a alegação de que seria genericamente inferior ao MVP.
- Contatos por telefone/mensagens: não se pode concluir que nenhum doador tenha registros ou indicadores. Essas afirmações absolutas foram substituídas por uma comparação limitada ao fluxo implementado.

## 4 Outras correções de precisão

- O lote liberado volta à disponibilidade e à disputa; o código não implementa fila para escolher a próxima ONG. A transição depende de consulta à API.
- Registro de massa entregue não prova, isoladamente, que todo alimento seria descartado ou que foi consumido.
- O relato de câmera física ainda precisa de data, aparelho e resultado do grupo; não foi transformado em ensaio confirmado por esta revisão.
- Os dois integrantes da versão Claude foram preservados, conforme registro de dupla autorizada no LOG; não se reutilizou a capa de quatro integrantes da antiga Etapa 4.
- Campo, orçamento, papel individual, aparelho e capturas continuam `[GRUPO]`; fontes públicas não suprem esses fatos. O uso de Codex/Claude foi descrito com base nos registros, sem inventar a distribuição de trabalho entre integrantes.
- Excluídas referências bibliográficas genéricas não utilizadas como suporte e adicionados URLs verificáveis e datas de consulta.

## 5 Encaminhamento

O relatório verificado pode descrever o MVP acadêmico concluído com suas limitações explícitas. **Não há aceite de conformidade operacional integral.** Antes de um piloto real, tratar A1–A5 em tarefas próprias, definir responsáveis e procedimentos e validar exigências da atividade. A revisão preserva o aplicativo e os relatórios anteriores; não publica nem altera o pacote de entrega.
