# Conformidade — Rede AlimentaMS × Etapa 4

> Versão de entrega, 28/10/2026. Substitui `ANALISE_CONFORMIDADE.md` (27/10), feita antes das correções.
> Referências: `docs/DAC_Etapa_4.docx` (definição da solução) e `docs/02 e 01i DAC 262 TADS 26B.pdf` (plano da DAC).
> Legenda: ✅ atende · 🟡 atende em parte (diferença explicada) · ❌ não implementado (registrado como melhoria futura).

## 1. Resumo

Os cinco fluxos da Etapa 4 funcionam de ponta a ponta: cadastro, publicação do lote, notificação e reserva no raio de 10 km, retirada com QR Code ou código de 6 dígitos, e comprovante com indicadores. Os três cenários de teste da seção 6.2 passam de forma automatizada.

As diferenças em relação ao que a Etapa 4 descreve são de três tipos:

- **Stack mais simples.** O front é HTML, CSS e JavaScript puro, sem React/React Native. O back-end é JavaScript, sem TypeScript. A execução é feita com Docker local, sem Vercel/Render.
- **Itens deixados de fora:** painel administrativo com aprovação de cadastros, raio configurável, PWA offline, notificação por push ou e-mail e quantidade em unidades.
- **Adaptações:**
  - o comprovante é "assinado" por hash SHA-256 verificável, não por certificado ICP-Brasil;
  - a validação de CNPJ confere os dígitos verificadores, sem consultar a Receita;
  - a localização é a do bairro escolhido, sem geocodificação do endereço digitado.

Evidências:
- `npm test`: 175 testes automatizados;
- `docs/testes/e2e-api.mjs`: 55 verificações de ponta a ponta;
- `docs/testes/resultado-carga.md`: carga com 20 e com 200 requisições simultâneas.

O mesmo `docker compose` foi validado do zero, a partir de uma cópia limpa do repositório.

## 2. Módulos (Etapa 4, seção 1.1)

| Promessa | Situação | Observação |
|---|---|---|
| Doador: cadastro e perfil | ✅ | CNPJ com dígito verificador, endereço, responsável, telefone e aceite do termo/política (data e versão gravadas). |
| Doador: publicar lote com tipo, quantidade, validade, foto e horário de retirada | 🟡 | Tudo presente, mas quantidade só em kg (sem unidades). Foto opcional, reduzida no navegador, até 400 KB. |
| Doador: comprovante digital e histórico (Selo Doador de Alimentos) | ✅ | Comprovante imprimível com hash SHA-256 e página pública `/verificar/:hash`; histórico e "Meus números". Relação com o Selo e a lei citada: [VERIFICAR]. |
| Doador: cancelar lote publicado | ✅ | Não estava na Etapa 4; acrescentado. A ONG com reserva recebe aviso urgente. |
| Receptora: interface para celular | 🟡 | Layout responsivo; não é PWA instalável. |
| Receptora: raio configurável | 🟡 | Raio fixo de 10 km (`RAIO_METROS`). |
| Receptora: notificação instantânea | 🟡 | WebSocket + central de notificações no app; sem push do sistema nem e-mail. |
| Receptora: reserva e agendamento de coleta | ✅ | Reserva atômica (só a primeira ONG vence) com janela de retirada de até 2 h. A ONG pode desistir; o lote volta na hora para as outras. |
| Logístico: distância via PostGIS, prioridade por validade e proximidade | ✅ | `ST_DWithin`/`ST_Distance`; lista ordenada por validade e depois por distância; aviso "urgente" para validade de hoje ou amanhã. |
| Logístico: raio expansível para lotes volumosos | ❌ | Melhoria futura. |
| Gestão: painel de kg, refeições, CO₂e e água | 🟡 | Funciona; os fatores (2 refeições, 2,5 kg CO₂e e 350 L por kg) são demonstrativos [VERIFICAR fonte]. |
| Gestão: painel administrativo e relatório auditável | 🟡 | Sem perfil administrador. A auditoria existe no banco: doações imutáveis (gatilho), histórico de eventos de cada lote e comprovantes verificáveis. Sem exportação CSV. |

## 3. Stack (seção 2.1)

| Camada | Etapa 4 | Entregue | Situação |
|---|---|---|---|
| Front-end | React / React Native (PWA) | HTML + CSS + JavaScript puro (`backend/public`) | ❌ (trocado) |
| Back-end | Node.js com TypeScript + Express | Node.js com JavaScript + Express | 🟡 |
| Banco | PostgreSQL + PostGIS | PostgreSQL 16 + PostGIS 3.4 | ✅ |
| Infraestrutura | Docker + Linux + Vercel/Render | Docker Compose (contêineres Linux), execução local | 🟡 |

Motivo da troca: prazo. Um único arquivo de front sem etapa de build é mais simples de manter, testar e rodar no PC do avaliador. Arquivos para implantar em servidor (Caddy com HTTPS automático) foram preparados no repositório do grupo, mas não foram usados nesta entrega.

## 4. Segurança e conformidade (seção 3.2)

| Promessa | Situação | Observação |
|---|---|---|
| RBAC com JWT de expiração curta | ✅ | Perfis doador/receptora em todas as rotas protegidas; token de 8 h. |
| Senhas com bcrypt | ✅ | Custo 10. |
| HTTPS / TLS 1.3 | ❌ | Execução local em HTTP. A configuração com HTTPS está pronta (Caddy), mas não foi usada. |
| Logs imutáveis de cada doação | ✅ | Gatilho no banco impede UPDATE/DELETE em `doacoes`; eventos de cada lote em `eventos_lote`. |
| Termo de responsabilidade / LGPD | 🟡 | Aceite obrigatório no cadastro; texto em `termos.html` sem revisão jurídica, citações legais [VERIFICAR]. |
| Proteções adicionais | ✅ | Não estavam na Etapa 4: 5 códigos de retirada errados bloqueiam o lote por 15 min; limite de tentativas de login; SQL parametrizado; HTML escapado; anexos validados pelo conteúdo do arquivo. |

## 5. Fluxos (seção 4)

| Fluxo | Situação | Observação |
|---|---|---|
| 1. Cadastro e validação | 🟡 | CNPJ só por dígito verificador (sem consulta à Receita); a ONG anexa o comprovante (PDF/JPEG/PNG até 1 MB); sem aprovação manual, o cadastro já entra aprovado. |
| 2. Publicação | ✅ | Categoria, kg, validade, horário limite e foto. Validade de hoje é aceita (a Etapa 4 diz "posterior ao momento atual"). |
| 3. Notificação, geolocalização e reserva | 🟡 | Todas as ONGs no raio de 10 km são avisadas ao vivo (WebSocket); sem push/e-mail. A primeira ONG que reservar fica com o lote. |
| 4. Agendamento, retirada e validação | ✅ | Janela de retirada, código de 6 dígitos e QR Code. O doador lê o QR com a câmera do celular, que abre a confirmação já preenchida, e confere o checklist sanitário. |
| 5. Conclusão, registro e indicadores | ✅ | Status "entregue", comprovante com hash e indicadores atualizados. |

## 6. Riscos e mitigações (seção 5)

| Risco | Mitigação da Etapa 4 | Situação |
|---|---|---|
| Conectividade na retirada | PWA offline + código numérico | 🟡 O código numérico funciona sem a câmera e sem o QR; não há modo offline. |
| Demora na retirada | Prazo curto e redirecionamento para a próxima ONG | ✅ Janela de até 2 h; passados o fim da janela e mais 30 min de tolerância, o lote volta a disponível e as ONGs do raio são avisadas. A ONG também pode desistir antes. |
| Qualidade sanitária | Termo no cadastro + checklist na baixa | ✅ Os dois são obrigatórios. |
| Engajamento de doadores | Campanha piloto | Fora do software. |

## 7. Critérios de validação (seção 6)

| KPI / cenário | Situação | Evidência |
|---|---|---|
| TMR (meta < 90 min) | ✅ | Calculado em `/indicadores` e em "Meus números"; o seed começa acima da meta de propósito (não se maquia o número). |
| TEC (meta > 92%) | ✅ | Entregues ÷ (entregues + expirados); lotes cancelados pelo doador ficam fora. |
| Acurácia geográfica | ✅ | Testes do raio de 10 km, da ordenação e da ONG fora do raio, que não vê nem reserva. |
| Comprovante em 100% das doações | ✅ | O banco exige hash e comprovante em toda doação; testes conferem o hash. |
| Cenário 1 (50 kg de frutas, Centro → Monte Castelo/Amambai) | ✅ | Automatizado e no roteiro de demonstração. Leitura com a câmera física: conferência humana. |
| Cenário 2 (validade retroativa, quantidade zero) | ✅ | Erros 400 com mensagem; nenhuma entrada inválida gera erro 500. |
| Cenário 3 (20 requisições simultâneas) | ✅ | 20 e 200 simultâneas sem erro inesperado; só uma reserva vence a disputa. |

## 8. Limitações conhecidas (para o relatório)

- **Localização por bairro:** o usuário escolhe entre 7 bairros de Campo Grande com coordenadas aproximadas, e o endereço digitado não é geocodificado. Dois cadastros no mesmo bairro ficam a 0 km um do outro.
- **Ciclo de vida sem processo agendado:** expiração e liberação de reservas acontecem na próxima consulta à API, não num horário exato.
- **Limite de login em memória:** zera ao reiniciar o servidor.
- **Contas de demonstração com senha conhecida** (`123456`), adequadas só para a demonstração.
- **Textos legais sem revisão jurídica.** Fatores ambientais demonstrativos.
- **Sem itens extras:** administrador (X1), raio configurável (X2) e PWA (X3).

## 9. Como conferir

Veja o README ("Como rodar", 3 passos). Testes: `cd backend && npm test`, com o banco de testes de `docker-compose.test.yml`.
