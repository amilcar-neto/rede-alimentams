# Roteiro de capturas — versão entregue

**Conferência visual humana PENDENTE. Nenhum print foi produzido neste complemento.** Executar após revisão final e estabilização da versão. As seções abaixo são destinos propostos no relatório técnico novo; numeração/títulos finais [GRUPO]. Não editar os documentos originais para encaixar as capturas.

Preparar banco e sessões conforme [roteiro de demo](ROTEIRO_DEMO.md). Todas as contas usam senha fictícia `123456`. Usar somente dados/arquivos sintéticos; não capturar senha digitada, JWT, ferramentas de armazenamento ou configuração de ambiente. Guardar capturas em pasta escolhida pelo grupo [GRUPO] e registrar versão/commit, data, fuso America/Campo_Grande, dispositivo, tamanho da tela e resultado. Não usar imagens de uma versão anterior como evidência atual.

| Captura sugerida | Conta / preparação e tela | Estado esperado / conferência | Destino no relatório |
|---|---|---|---|
| 01-entrada | Sem sessão → “Entrar”. | Identidade do app e campos de acesso, sem senha visível. | Solução / interface |
| 02-cadastro | Sem sessão → “Criar conta”, perfil receptora. Não precisa enviar. | CNPJ, bairro, endereço, responsável, telefone, aceite e opção de comprovante. Não alegar aprovação cadastral. | Requisitos / cadastro |
| 03-termos | Link dos termos → `/termos.html`. | Termo/privacidade e marcadores [VERIFICAR]/[GRUPO] preservados; sem afirmar validação jurídica. | Limitações / privacidade |
| 04-painel | Comper, banco recém-criado, antes da nova doação. | Indicadores preenchidos, entidades, TMR/TEC e metas. Anotar os números reais; não usar valores de banco contaminado por testes. | Solução / indicadores |
| 05-publicacao | Comper → “Publicar lote”, preencher o Cenário 1 sem enviar ainda. | Frutas, 50 kg, validade futura, retirada até e prévia de imagem sintética se escolhida. | Desenvolvimento / lotes |
| 06-notificacoes | Esperança e Amambai autenticadas antes de Comper publicar; abrir sino em cada sessão. | Novo aviso referente ao mesmo lote. Para alegar tempo real, registrar observação sem refresh; print isolado comprova a central, não a latência WebSocket. | Redes / Cenário 1 |
| 07-lotes | Esperança → “Lotes disponíveis”, antes de reservar. | Validade, distância, limite de retirada, lotes do seed com o placeholder “Sem foto” e, se publicado no ensaio, um lote com foto. | Solução / geolocalização e anexos |
| 08-janela | Esperança → reservar novo lote da demo. | Início/fim futuros, intervalo ≤ 2 h e dentro de “retirar até”. Capturar antes de enviar ou registrar janela confirmada. | Regras de negócio / reserva |
| 09-reserva-qr | Esperança depois da reserva do lote novo. | Código de seis dígitos e QR legíveis. Dados estritamente sintéticos; não reutilizar `482915` neste lote. | Testes / Cenário 1 |
| 10-doador-reserva | Comper → “Meus lotes” depois da reserva. | ONG reservante e janela de retirada. | Desenvolvimento / ciclo de vida |
| 11-qr-celular | Celular do doador abre QR mostrado por Esperança. | Lote e código preenchidos após login Comper, checklist ainda sem marcação automática. Registrar dispositivo e câmera real; se simulado, rotular simulação. | Testes / Cenário 1 |
| 12-checklist | Comper, simulação sanitária concluída antes de confirmar. | Embalagem íntegra, temperatura adequada e dentro da validade. Não é vistoria sanitária de alimento real. | Regras / rastreabilidade |
| 13-historico | Comper → “Doações registradas”; Esperança → “Doações recebidas”. | Nova doação 50 kg aparece uma vez; link do comprovante. | Testes / resultado ponta a ponta |
| 14-comprovante | Uma das partes abre comprovante novo. | Partes/CNPJs sintéticos, lote, kg, instante, checklist, hash e QR público; aviso sobre ICP-Brasil. | Desenvolvimento / comprovante |
| 15-verificacao | Sem sessão, link público `/verificar/:hash` do comprovante. | “Comprovante válido”, hash e dados mínimos; sem cadastro completo ou código de retirada. | Segurança / verificação pública |
| 16-meus-numeros | Comper ou Esperança → “Meus números”. | Dados da própria conta, métricas e cadastro; anotar conta. Comparar painel antes/depois sem afirmar metas não atingidas. | Indicadores / resultados |
| 17-anexo-entidade | Esperança → “Meus números”, enviar comprovante sintético PDF/JPEG/PNG ≤ 1 MB e abrir. | Própria entidade consegue ler o arquivo; captura não prova isolamento de terceiros (há testes automatizados). | Desenvolvimento / cadastro e anexos |
| 18-validacoes | Comper → publicação, tentar quantidade 0; depois validade de ontem. | Duas mensagens de erro, sem publicar lote inválido. Identificar cada tentativa. | Testes / Cenário 2 |
| 19-fora-raio | `longe@demo.com` → “Lotes disponíveis”. | Sem lotes no raio de 10 km. | Testes / regra geográfica |
| 20-reserva-seed | Pão Nosso e Esperança, seed recém-criado → lote 21. | “Bolos e roscas”, código `482915`, fim da janela ~25 min após criação; observar tolerância antes da liberação. | Testes / expiração |
| 21-mobile | Repetir 07, 09 e 16 em celular/viewport real. | Sem cortes nos campos, QR legível e tabela navegável horizontalmente. Registrar dimensões e limitações. | Interface / usabilidade |
| 23-desistencia | Amambai → reservar lote do seed → “Desistir da reserva” → confirmação no cartão. | Pergunta de confirmação; depois aviso verde e lote disponível de novo; sino do doador com “desistiu da reserva”. | Solução / Fluxo 4 (redirecionamento) |
| 24-cancelar-lote | Comper → “Cancelar lote” num lote reservado → confirmar. | Lote some de “Meus lotes”; na ONG que reservou, aviso urgente “cancelou o lote”. | Solução / Fluxo 2 |
| 22-carga | Abrir `docs/testes/resultado-carga.md` após execução concluída. | Mostrar 20/200, média, p95, erros e uma reserva vencedora; legendas de método e limites. É relatório de teste, não print de produção. | Testes / Cenário 3 |

Não é necessário esperar a liberação do lote 21 durante a demo de 5–7 min. Se capturar a liberação, registrar consulta após janela + tolerância e o momento real; não atribuir disparo a cronômetro/worker, pois o ciclo é atualizado nas rotas de lotes.

Conferir cada arquivo salvo abrindo a imagem: legibilidade, tela inteira ou recorte intencional, legenda correta e ausência de dados reais. Capturar comprovante em visualização de impressão/PDF apenas se efetivamente feito; não declarar impressão física pelo print do navegador. Revisão jurídica, ensaio, QR físico, celular, rede/HTTPS e ambiente de apresentação continuam humanos [GRUPO]. Tentativa automatizada neste complemento: `browsers: []`, `The browser access host is unavailable`; negativa anterior do Edge preservada. Não houve captura nem revisão humana pelo agente.
