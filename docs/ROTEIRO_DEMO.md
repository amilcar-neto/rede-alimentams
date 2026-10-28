# Demonstração — 5 a 7 minutos

Roteiro do escopo entregue (L01–L08, incluindo L03/L06), baseado no Cenário 1 da Etapa 4: supermercado fictício do Centro publica 50 kg de frutas; ONGs de Monte Castelo e Amambai recebem aviso, uma reserva e a retirada é confirmada pelo QR. Somente dados sintéticos. **Ensaio humano, câmera física e conferência visual deste complemento PENDENTES**; este roteiro não é evidência de execução.

## Preparação fora do cronômetro

1. Usar banco descartável recém-carregado de `db/init.sql`: `docker compose down -v && docker compose up -d --build` uns 5 minutos antes de começar (o seed é relativo ao momento da criação). Nunca recriar volume com dados a preservar. Não rodar carga ou `npm test` durante a demo: ambos recriam o banco de testes.
2. Preparar três sessões independentes (perfis de navegador ou dispositivos distintos): `comper@demo.com` (Centro), `esperanca@demo.com` (Monte Castelo) e `amambai@demo.com` (Amambai). Senha fictícia comum `123456`. Abas do mesmo perfil compartilham login via localStorage; não confiar nelas para manter contas diferentes.
3. Deixar as duas ONGs autenticadas antes de publicar. Abrir o sino e anotar a contagem de avisos antes da demo. O seed só inclui aviso da reserva do Pão Nosso ao próprio doador; o novo aviso virá da publicação ao vivo.
4. Para QR físico (apresentação local com Docker, sem VPS): notebook e celular na mesma rede, de preferência o hotspot de um celular do grupo (a Wi-Fi da faculdade pode isolar aparelhos). Descobrir o IP do notebook (`ipconfig`), liberar a porta 3000 no Firewall do Windows e abrir as sessões das ONGs por `http://IP:3000`, ou subir com `BASE_URL=http://IP:3000`. Testar antes: o celular abre `http://IP:3000/saude`. `localhost` no celular aponta para o próprio celular. Sem HTTPS: o QR abre um link http comum, o que basta para a demo.
5. Conferir relógio e horários de **America/Campo_Grande**, escolher validade amanhã e retirada até daqui a 3 h (ou outro horário futuro compatível com a validade). Janela de reserva: daqui a 5 min até daqui a 60 min, no máximo 2 h e dentro do limite do lote.
6. Para mostrar upload, preparar uma imagem sintética JPEG/PNG; o navegador reduz para JPEG (lado máximo 1024 px) e o servidor limita a 400 KB. Alternativamente publicar sem foto e mostrar a miniatura geométrica sintética do lote 3, “Frutas variadas”, no seed. Ela não é foto de comida real.
7. Abrir previamente um comprovante do histórico para verificar que pop-ups estão permitidos no navegador. Usar contas demo, sem cadastrar pessoas reais ou enviar documentos reais.

## Execução cronometrada

| Tempo | Conta e ação | Resultado a conferir |
|---|---|---|
| 0:00–0:40 | Comper: apresentar indicadores globais e “Meus números”. | Histórico inicial de 16 doações; explicar que TMR mede publicação → reserva e TEC mede entregues ÷ (entregues + expirados). Metas < 90 min e > 92%; não prometer que o seed atinge ambas. |
| 0:40–1:40 | Comper → “Publicar lote”: “Frutas demo — Cenário 1”, categoria Hortifrúti, 50 kg, validade amanhã, limite de retirada escolhido. Anexar imagem sintética opcional e publicar. | Novo lote em “Meus lotes”, quantidade, validade e “retirar até”; miniatura se anexada. |
| 1:40–2:30 | Nas sessões Esperança e Amambai, observar toast/contador e abrir o sino sem recarregar antes. | Aviso de novo lote nas duas ONGs próximas via WebSocket; lote na lista, com validade e distância. Notificação é dentro do app, sem e-mail/push do sistema. Se só aparecer após consultar a central, registrar consulta HTTP, sem alegar entrega ao vivo. |
| 2:30–3:30 | Esperança → novo lote → reservar com a janela preparada. Amambai atualiza a lista. | Código de seis dígitos e QR para Esperança; lote indisponível para nova reserva na outra ONG. No Comper aparece quem retira e a janela. Não usar o código fixo do seed para este lote novo. |
| 3:30–4:40 | Exibir QR na sessão Esperança. Câmera nativa do celular do doador lê o QR e abre o app. Se necessário, entrar como Comper nesse celular. | Link preservado durante login; lote e código preenchidos no formulário de confirmação. QR não confirma automaticamente. Conferir os três itens sanitários apenas na simulação e confirmar. |
| 4:40–5:40 | Comper → “Doações registradas”; Esperança → “Doações recebidas”. Abrir comprovante da nova doação. | Uma doação de 50 kg, dados das partes, checklist, hash e QR de verificação. Seguir o link público `/verificar/:hash`: dados mínimos e “Comprovante válido”. Explicar que SHA-256 verificável não é certificado ICP-Brasil. |
| 5:40–6:30 | Atualizar painel e “Meus números”; abrir central da receptora. | Total global aumenta 50 kg e uma doação em relação ao valor anotado antes; conta própria mostra seus resultados e a ONG recebe aviso de retirada. Encerrar explicando raio de 10 km, expiração e limites da versão. |

Se o celular/rede não estiver pronto, executar a alternativa **declaradamente simulada**: abrir o link contido no QR na sessão Comper, ou digitar o código mostrado pela Esperança. Registrar qual alternativa foi usada; isso não comprova câmera física. Não apresentar falha como leitura concluída.

## Verificações adicionais fora dos 5–7 minutos

- Cenário 2: no Comper tentar quantidade zero e validade de ontem; mensagens de validação, sem novo lote. Voltar a valores válidos antes de fotografar a tela de publicação.
- Raio: `longe@demo.com` → “Lotes disponíveis”, sem lotes próximos. Não possui painel administrativo.
- Reserva próxima de expirar: `pao@demo.com` e `esperanca@demo.com`, lote 21 “Bolos e roscas”, código sintético `482915`. Janela termina cerca de 25 min após a criação do banco; liberação só após janela + tolerância (30 min por padrão) e consulta de lotes. Não esperar esse prazo na demo nem modificar timestamps manualmente para simular evidência humana.
- L06: mostrar cadastro com endereço, responsável, telefone e aceite de termos; em Esperança, “Meus números” permite enviar/abrir comprovante de entidade PDF/JPEG/PNG até 1 MB. Usar somente arquivo sintético. Textos legais [VERIFICAR]; contato [GRUPO]. Não afirmar revisão jurídica ou aprovação administrativa.
- Desistência e cancelamento: Amambai reserva um lote do seed e clica “Desistir da reserva” → confirma no próprio cartão. O lote volta para Esperança (aviso “disponível novamente”) e o doador recebe aviso. Em seguida, o doador clica “Cancelar lote” → confirma; o lote some das listas. Se havia reserva, a ONG recebe aviso urgente.
- Código errado: no doador, digitar código errado mostra quantas tentativas restam; após 5 erros, a confirmação daquele lote fica bloqueada por 15 min. Não fazer isso no lote do Cenário 1 durante a demo.
- Cenário 3: apresentar o [resultado de carga](testes/resultado-carga.md) gerado localmente; não executar a carga enquanto a demo estiver no mesmo banco.

## Registro humano pendente

Anotar data/fuso, versão/commit fornecido pelo controlador, contas, navegador/dispositivos, origem utilizada sem segredos, duração, resultado de cada etapa, QR real ou simulado, avisos ao vivo ou por consulta, falhas e arquivos de captura. Encerrar o servidor local iniciado para o ensaio. Neste complemento o navegador automatizado retornou `The browser access host is unavailable`; a negativa histórica de uso do Edge foi preservada, sem contorno. Não houve ensaio visual, câmera, impressão ou captura de tela nesta execução.
