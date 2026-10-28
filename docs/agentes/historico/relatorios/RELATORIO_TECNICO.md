# Rede AlimentaMS
## Relatório Técnico de Projeto

Universidade Católica Dom Bosco — UCDB

Curso de Tecnologia em Análise e Desenvolvimento de Sistemas — TADS

Desafio de Articulação de Competências — DAC

**Integrantes**

Amilcar Silva Neto

Paulo Roberto Ribeiro Dias

**Professor orientador**



**Redistribuição de excedentes alimentares em Campo Grande MS**

Versão final do MVP acadêmico

Campo Grande — MS

28 de outubro de 2026

<!-- pagina -->

## 1 Resumo do projeto

A Rede AlimentaMS é uma aplicação web que conecta estabelecimentos doadores de alimentos a entidades receptoras em Campo Grande, Mato Grosso do Sul. O MVP acadêmico está concluído e empacotado para avaliação. A solução permite cadastrar participantes, publicar excedentes, localizar ofertas próximas, reservar uma janela de retirada, confirmar a entrega e consultar comprovantes e indicadores.

A implementação final utiliza JavaScript, Node.js, Express, HTML, CSS, PostgreSQL e PostGIS, com execução por Docker Compose. A interface e a API são servidas pela mesma aplicação. O fluxo principal foi validado com dados sintéticos; a suíte executada em 28/10/2026 aprovou 176 testes, sem falhas, testes ignorados ou pendências automatizadas. O pacote de entrega identificado é `entrega/rede-alimentams.zip`.

O resultado demonstra a viabilidade técnica do processo de intermediação digital. Os números do painel de demonstração não representam doações reais, e os fatores ambientais são estimativas demonstrativas. A conclusão do MVP corresponde ao escopo acadêmico implementado. As seções 17 e 18 consolidam as fontes externas verificadas e os ajustes recomendados no produto; essas recomendações ainda não são funcionalidades entregues.

## 2 Problema e justificativa

O projeto aborda a dificuldade de aproximar, em tempo útil, estabelecimentos com excedentes ainda próprios para consumo e entidades capazes de coletá-los e distribuí-los. A perecibilidade torna essenciais a divulgação rápida, a proximidade geográfica e a clareza sobre os horários de retirada. A ausência de um registro compartilhado também dificulta acompanhar reservas e demonstrar as entregas realizadas.

O recorte territorial do protótipo é Campo Grande. Doadores incluem supermercados, padarias e outros estabelecimentos; receptoras incluem ONGs, cozinhas comunitárias e instituições assistenciais. As pessoas atendidas por essas entidades são beneficiárias indiretas. Famílias não possuem perfil de acesso direto nesta versão.

A justificativa reúne três dimensões: aproveitamento de alimentos que poderiam ser descartados; apoio ao acesso a alimentos pelas entidades; e organização do trabalho de oferta e coleta. A aplicação atua sobre informação, reserva e rastreabilidade. A inspeção dos alimentos, o transporte e a distribuição continuam sob responsabilidade dos participantes.

## 3 Objetivos

**Objetivo geral.** Desenvolver e demonstrar uma plataforma funcional que organize a redistribuição de excedentes alimentares entre doadores e entidades receptoras próximas.

**Objetivos específicos.** Validar os cadastros e as ofertas; apresentar lotes em um raio de 10 km; impedir reservas simultâneas do mesmo lote; controlar prazos; registrar a retirada mediante código ou QR Code e checklist; emitir comprovante verificável; e consolidar indicadores de operação e impacto estimado.

<!-- pagina -->

## 4 Pesquisa e fundamentação da solução

A pesquisa documental utilizou a definição técnica da Etapa 4, o plano de aprendizagem da DAC e referências institucionais sobre redistribuição de alimentos. O Sesc Mesa Brasil apresenta uma atuação que combina distribuição de alimentos e ações educativas em Nutrição e Serviço Social [1]. O Ministério do Desenvolvimento e Assistência Social destaca os bancos de alimentos como equipamentos que abastecem instituições e apoiam o combate ao desperdício [2].

Essas referências fundamentam a escolha de conectar doadores a entidades organizadas. A Rede AlimentaMS explora uma intermediação digital direta: o estabelecimento publica, a entidade reserva e a retirada é registrada na aplicação. Não houve integração técnica, parceria institucional ou reprodução dos sistemas internos dessas iniciativas.

| Referência ou abordagem | Contribuição para o projeto | Aplicação no MVP |
| --- | --- | --- |
| Sesc Mesa Brasil | Articulação entre doadores e entidades e orientação sobre alimentos | Perfis distintos e fluxo de doação rastreável |
| Bancos de alimentos descritos pelo MDS | Redistribuição voltada a instituições e à segurança alimentar | Público receptor institucional e registro das entregas |
| Definição técnica da Etapa 4 | Fluxos, requisitos e cenários de validação | Base para implementação e comparação do escopo entregue |

A análise não constitui levantamento de campo. A identificação de parceiros locais, o volume real de excedentes e a disponibilidade de veículos e voluntários dependem de validação com participantes [GRUPO]. O protótipo usa exclusivamente contas e operações sintéticas.

### 4.1 Dados e referências externas conferidos

Na PNAD Contínua referente a 2024, o IBGE registrou insegurança alimentar em **24,2% dos domicílios brasileiros**, cerca de **18,9 milhões** [9]. O indicador reúne os diferentes graus de insegurança; não corresponde ao número de pessoas em fome grave nem estima especificamente a situação de Campo Grande.

O Food Waste Index Report 2024, do PNUMA, estima **1,05 bilhão de toneladas desperdiçadas em 2022** nos domicílios, serviços de alimentação e varejo, incluindo partes não comestíveis [10]. Portanto, não representa somente excedentes comestíveis disponíveis para doação.

O projeto se relaciona à meta 12.3 do ODS 12, sobre redução do desperdício e das perdas até 2030, e à meta 2.1 do ODS 2, sobre acesso a alimentos seguros, nutritivos e suficientes [11–12]. Esse alinhamento não demonstra cumprimento das metas ou impacto real do protótipo.

### 4.2 Comparação com outras soluções

O Sesc Mesa Brasil redistribui excedentes para instituições cadastradas e realiza ações educativas [1]. O Too Good To Go oferece venda de excedentes com desconto ao consumidor, conforme seu modelo internacional [13]. A Comida Invisível descreve conexão entre empresas e ONGs, documentação e capacitação das entidades [14].

Essas referências confirmam abordagens existentes, sem demonstrar exclusividade ou superioridade da Rede AlimentaMS. Não se afirma presença do Too Good To Go no Brasil nem incapacidade dos bancos de alimentos de atender pequenos lotes. A contribuição do MVP é demonstrar um fluxo próprio de oferta, reserva e registro no recorte de Campo Grande. Parcerias e necessidades locais seguem dependentes do grupo.

<!-- pagina -->

## 5 Requisitos da versão entregue

| Código | Requisito funcional | Implementação |
| --- | --- | --- |
| RF01 | Cadastro e autenticação por perfil | Doador e receptora, CNPJ, contato e aceite dos termos |
| RF02 | Publicação de lotes | Alimento, categoria, kg, validade, limite de retirada e foto opcional |
| RF03 | Busca por proximidade | Raio fixo de 10 km e ordenação por validade e distância |
| RF04 | Reserva e agendamento | Janela de até duas horas e código de seis dígitos |
| RF05 | Controle do ciclo de vida | Expiração, liberação, desistência e cancelamento |
| RF06 | Confirmação da retirada | Doador autorizado, código e três verificações sanitárias |
| RF07 | Comprovante e histórico | Documento imprimível, hash e consulta pública mínima |
| RF08 | Notificações e indicadores | WebSocket, central persistente, painel global e pessoal |

Os requisitos não funcionais incluem isolamento dos dados por autorização, SQL parametrizado, tratamento de entradas inválidas, integridade transacional, datas de negócio em `America/Campo_Grande` e reprodução do ambiente por contêineres. A interface adapta o conteúdo à largura disponível; a execução pelo navegador requer conectividade com o servidor.

<!-- pagina -->

## 6 Tecnologias e arquitetura

A aplicação adota separação lógica entre apresentação, regras de negócio e persistência. A implantação acadêmica contém dois serviços: `app` e `db`. O Express entrega os arquivos estáticos e a API; o banco permanece acessível pela rede interna do Docker, sem porta publicada no Compose de entrega.

| Camada | Tecnologia entregue | Responsabilidade |
| --- | --- | --- |
| Apresentação | HTML, CSS e JavaScript puro | Formulários, lotes, reservas, notificações e painéis |
| Aplicação | Node.js 24 e Express | API HTTP/JSON, autenticação e regras de negócio |
| Persistência | PostgreSQL 16 e PostGIS 3.4 | Dados relacionais, transações e consultas geográficas |
| Comunicação ao vivo | Biblioteca ws | Entrega de eventos aos usuários autenticados |
| Identificação e comprovantes | bcryptjs, jsonwebtoken e qrcode | Hash de senha, tokens JWT e QR de retirada |
| Execução | Docker e Docker Compose | Serviços, rede, volume e inicialização reproduzível |

O navegador comunica-se com a aplicação por HTTP e WebSocket. A API utiliza o cliente `pg` para acessar o PostgreSQL. O PostGIS calcula a distância entre pontos geográficos por `ST_DWithin` e `ST_Distance`, com índice espacial GiST no cadastro. A localização é aproximada pelo bairro escolhido entre sete opções; não corresponde à geocodificação do endereço completo.

### 6.1 Estrutura de dados

O arquivo `db/init.sql` concentra o schema e os dados de demonstração. As tabelas principais são:

| Tabela | Conteúdo e vínculo principal |
| --- | --- |
| usuarios | Perfil, localização, contato, senha em hash e aceite dos termos |
| comprovantes_entidade | Anexo privado vinculado à entidade receptora |
| lotes | Oferta, quantidade, prazos, estado e reserva atual |
| eventos_lote | Histórico de publicação, reserva, liberação e encerramento |
| notificacoes | Avisos por destinatário e registro de leitura |
| doacoes | Entrega concluída, participantes, checklist, comprovante e hash |

Chaves estrangeiras preservam os relacionamentos. Restrições verificam quantidade positiva, estados permitidos e tamanhos dos arquivos. Cada lote pode originar apenas uma doação. Um gatilho impede alterações e exclusões dos registros de `doacoes`, preservando o registro emitido pelas operações normais da aplicação.

### 6.2 Decisões em relação à proposta inicial

React, React Native e TypeScript foram substituídos por JavaScript e uma interface web sem etapa de compilação. A execução final é local com Docker, em vez de hospedagem em nuvem ou VPS. Essas decisões reduziram a complexidade de preparação do ambiente do avaliador e mantiveram os fluxos essenciais. Configurações de implantação em servidor existentes no repositório são material de evolução futura.

<!-- pagina -->

## 7 Funcionamento e regras de negócio

### 7.1 Cadastro e publicação

O participante informa perfil, CNPJ, bairro, endereço, responsável e telefone e aceita os termos. O CNPJ é validado no formato numérico por dígitos verificadores, sem consulta à Receita Federal. O formato alfanumérico, cuja emissão foi iniciada em julho de 2026, ainda não é aceito; a correção recomendada está na seção 18 [15]. A entidade pode anexar comprovante de sua condição institucional; não existe aprovação administrativa manual nesta versão.

O doador publica o alimento com quantidade entre 0,01 e 10.000 kg, validade e horário limite de retirada. A validade do dia corrente é aceita quando os demais prazos são válidos. A foto é opcional, em JPEG ou PNG, limitada a 400 KB após redução no navegador. Os lotes iniciais de demonstração não possuem fotografias.

### 7.2 Busca e reserva

A receptora consulta as ofertas no raio de 10 km, ordenadas por validade e, em seguida, por distância. A reserva exige janela de até duas horas, respeitando o limite de retirada. A alteração do estado ocorre de forma atômica: quando várias entidades disputam o lote, somente uma reserva é aceita; as demais recebem conflito HTTP 409.

O sistema gera um código de seis dígitos e um QR Code com link de retirada. A entidade reservante visualiza esses dados. A abertura do link pelo doador leva à aplicação com o lote e o código preenchidos, preservando a exigência de autenticação e de autorização para confirmar.

### 7.3 Retirada e encerramento

O doador confirma o código e declara embalagem íntegra, temperatura adequada e alimento dentro da validade. A confirmação grava a doação, seu comprovante, hash e evento de entrega. A repetição da confirmação não cria outra doação. Os indicadores são recalculados a partir dos registros persistidos.

| Estado ou transição | Comportamento |
| --- | --- |
| Disponível para reservado | Primeira reserva válida obtém exclusividade |
| Reservado para entregue | Confirmação pelo doador com código e checklist |
| Reservado para disponível | Desistência da entidade ou fim da janela mais tolerância |
| Ativo para expirado | Vencimento ou encerramento do limite de retirada aplicável |
| Ativo para cancelado | Doador retira a oferta disponível ou reservada |

A tolerância padrão de liberação é de 30 minutos após a janela. Expiração e liberação são processadas nas consultas à API, sem processo agendado independente. Não existe fila para escolher automaticamente uma próxima entidade: o lote liberado volta à disputa. A desistência libera o lote e avisa o doador e outras entidades do raio; o cancelamento pelo doador avisa com urgência a entidade que possuía a reserva.

### 7.4 Notificações e comprovante

As notificações ficam no banco por destinatário e podem ser consultadas por HTTP. O WebSocket acrescenta entrega ao vivo e autentica o usuário no primeiro frame. O limite de cinco conexões por conta encerra a mais antiga; essa aba mantém a consulta HTTP, sem reconexão automática nesse caso.

O comprovante contém um registro canônico identificado por hash SHA-256 e uma página pública de verificação. O hash permite conferir integridade em relação ao registro; não é certificado ICP-Brasil nem comprovação autônoma de autoria ou de conformidade jurídica.

<!-- pagina -->

## 8 Segurança e proteção de dados

As rotas protegidas exigem autenticação e verificam o perfil e o vínculo do usuário com o recurso. Um doador não confirma lotes de outro; uma entidade não acessa o código de uma reserva alheia. A foto exige autorização, e o comprovante institucional é acessível apenas à própria entidade. As rotas públicas, como saúde, bairros e verificação de comprovante, possuem finalidades delimitadas.

As senhas são armazenadas com bcrypt, custo 10. O login emite JWT com validade de oito horas. Consultas utilizam parâmetros SQL, e dados inseridos no HTML passam por escape. As respostas de erro seguem JSON em português, distinguindo entradas inválidas de falhas internas. Os tipos dos anexos são verificados pelo conteúdo, e não apenas pela extensão informada.

Cinco códigos de retirada incorretos consecutivos bloqueiam a confirmação do lote por 15 minutos. O controle usa bloqueio transacional para evitar perda de contagem em requisições concorrentes. No login, dez falhas por conta e IP, ou cinquenta por IP, em 15 minutos geram HTTP 429. Esse último controle fica em memória e é reiniciado junto com o processo.

O cadastro registra data e versão do aceite dos termos. As referências legais foram conferidas, mas os termos da aplicação ainda citam a Lei 14.016/2020, revogada pela Lei 15.224/2025. Controlador, contato e prazo de retenção também permanecem indefinidos. A seção 17 explica os limites dessa verificação, e a seção 18 recomenda os ajustes. O protótipo não certifica conformidade integral com a LGPD ou regras sanitárias. A entrega local usa HTTP e parâmetros de demonstração; sua configuração não deve ser tratada como implantação operacional com dados reais.

## 9 Desenvolvimento e articulação das disciplinas

O desenvolvimento foi organizado em incrementos: fundação de testes e validações; ciclo de vida e concorrência; fotos e limites de retirada; QR e comprovantes; notificações; cadastro e indicadores; dados de demonstração, roteiros e carga. O fechamento incluiu cancelamentos, limites de tentativas, ajustes de interface e execução com Docker.

As alterações foram acompanhadas por testes de regressão e registros de progresso. Revisões documentaram problemas e correções, incluindo estabilidade das conexões de notificação, máscara de telefone e proteções do código de retirada. Os documentos históricos representam o estágio em que foram produzidos; o escopo deste relatório corresponde à implementação final.

| Disciplina | Aplicação concreta |
| --- | --- |
| Algoritmos e Programação | Validações, estados dos lotes, autenticação, API e testes |
| Redes de Computadores | HTTP, JSON, WebSocket, portas e acesso pela rede local |
| Sistemas Operacionais | Processos Node.js, contêineres Linux, variáveis e volumes |
| Arquitetura de Computadores | Análise de concorrência, memória, processamento e E/S no ensaio local |
| Sustentabilidade e Diversidade | Redistribuição de excedentes e apoio a entidades assistenciais |

A carga observada permite discutir o comportamento do ambiente acadêmico. Não foi realizado dimensionamento de infraestrutura para operação em larga escala nem avaliação da acessibilidade por usuários reais.

<!-- pagina -->

## 10 Testes e resultados

### 10.1 Estratégia e suíte automatizada

Os testes usam banco exclusivo e descartável, `alimentams_test`, separado da demonstração. O executor recria esse banco a partir de `db/init.sql`, inicia servidor próprio na porta 3100 e encerra os processos ao final. A guarda do reset recusa nomes e destinos fora do escopo local de testes.

Na execução inicial deste relatório, em 28/10/2026, `npm test` em `backend/` aprovou **176 de 176 testes**, com zero falhas, cancelados, ignorados ou itens a implementar. A duração informada pelo executor foi de aproximadamente **32,45 segundos**. Na conferência posterior de fontes, a suíte voltou a passar com 176 aprovações em cerca de 33,25 segundos. Esta atualização documental reaproveita essas execuções, sem atribuir a elas validação de recomendações ainda não implementadas. O resultado confirma o comportamento dos casos exercitados, sem equivaler a certificação de ausência de defeitos.

| Área | Comportamentos verificados |
| --- | --- |
| Cadastro e entradas | Tipos inválidos, CNPJ, datas, quantidade, corpo JSON e limites |
| Autorização | Perfis, propriedade, arquivos privados e acesso fora do raio |
| Ciclo de vida | Prazos, liberação, expiração, desistência e cancelamento |
| Concorrência | Reserva única, confirmação sem duplicação e operações conflitantes |
| Evidências e comunicação | Checklist, hash, dados públicos mínimos, WebSocket e notificações |
| Demonstração e apresentação | Seed, indicadores, formatação e comportamentos de interface em testes |

### 10.2 Cenários previstos na Etapa 4

O cenário principal publica 50 kg de frutas no Centro, verifica a visibilidade para entidades em Monte Castelo e Amambai, reserva, confirma a retirada e confere o registro e os indicadores. O cenário de exceções rejeita quantidade zero e validade retroativa com mensagens de erro. O cenário concorrente verifica buscas e disputa de reserva. A leitura física de QR por câmera não é inferida dos testes HTTP.

### 10.3 Evidências complementares registradas

O script de fumaça `docs/testes/e2e-api.mjs` possui registro de **55 verificações aprovadas**, inclusive contra a aplicação em contêiner no fechamento do projeto. O checklist de polimento registra navegação por publicação, reserva, desistência, cancelamento, link do QR, checklist e página de verificação. Essas são evidências anteriores preservadas, não novas execuções manuais desta atualização.

O roteiro de demonstração apresenta uma sequência de cinco a sete minutos. O roteiro de capturas contém os estados a conferir. Não foram acrescentadas capturas artificiais nem apresentada a leitura de código por HTTP como ensaio de câmera física. A conferência de largura em celular permanece uma limitação registrada no fechamento.

<!-- pagina -->

## 11 Ensaio de carga e indicadores

### 11.1 Carga local

O ensaio registrado em `docs/testes/resultado-carga.md`, de 28/10/2026, executou ondas de 20 e 200 buscas e de 20 e 200 tentativas de reserva. Foram medidas 440 requisições no ambiente local, com duas entidades sintéticas, Node.js v24.19.0 em Windows x64 e banco exclusivo.

| Operação | Requisições simultâneas | Média em ms | p95 em ms | Resultado HTTP |
| --- | --- | --- | --- | --- |
| Busca | 20 | 115,62 | 124,01 | 20 respostas 200 |
| Reserva | 20 | 42,42 | 45,01 | 1 resposta 200 e 19 conflitos 409 |
| Busca | 200 | 308,76 | 332,97 | 200 respostas 200 |
| Reserva | 200 | 277,36 | 325,56 | 1 resposta 200 e 199 conflitos 409 |

Não ocorreram erros inesperados. A unicidade da reserva também foi conferida no banco: um vencedor, um evento de reserva e uma notificação ao doador por disputa. O p95 indica o limite que abrange pelo menos 95% das latências ordenadas da amostra. Os tempos incluem HTTP e leitura do JSON.

Trata-se de execução única local, sem repetição estatística, sem WebSocket aberto e sem dispositivos independentes. Os resultados não demonstram capacidade para 200 usuários reais nem garantia de desempenho em outro ambiente. Esta medição foi preservada; não foi repetida para produzir o relatório.

### 11.2 Definições dos indicadores

O painel global e a aba pessoal usam os registros persistidos. A quantidade em kg corresponde às doações concluídas. Entidades beneficiadas são receptoras distintas nas entregas consideradas. O Tempo Médio de Reserva é a média, em minutos, do intervalo entre publicação e reserva nos lotes com reserva registrada, com meta demonstrativa inferior a 90 minutos.

A Taxa de Entrega Concluída é `entregues / (entregues + expirados) × 100`, com meta superior a 92%. Lotes cancelados não entram no denominador. Essa definição da versão entregue deve acompanhar a leitura do painel: não corresponde à proporção de todos os lotes publicados enquanto ainda existem ofertas ativas.

As conversões por kg são duas refeições, 2,5 kg de CO2e e 350 litros de água. **São parâmetros internos de simulação, sem fonte metodológica identificada para essa combinação.** Duas refeições por kg pressupõem 500 g por porção e não comprovam adequação nutricional ou refeições servidas. A FAO apresenta pegadas hídricas distintas por grupo de alimentos [19]. Não se deve aplicar um fator único como impacto real sem definir alimento, origem, descarte, transporte e método. A seção 18 recomenda explicitar essa condição também no produto.

O seed inclui seis contas fictícias, quatro lotes disponíveis, dezesseis entregas históricas em trinta dias e uma reserva próxima do fim da janela. O TMR inicial pode superar a meta, pois os dados sintéticos não foram ajustados para apresentar cumprimento artificial dos objetivos.

<!-- pagina -->

## 12 Execução e pacote de entrega

O pacote localizado é `entrega/rede-alimentams.zip`, com 138.546 bytes na conferência desta versão. A entrega é um arquivo do projeto executável por Docker Compose. O front-end é servido diretamente, sem processo de compilação de uma aplicação React. O relatório é um documento complementar ao pacote existente.

Para executar, o avaliador extrai o arquivo, abre um terminal na pasta que contém `docker-compose.yml` e executa `docker compose up -d --build`. Com Docker e Compose disponíveis, os serviços iniciam e a aplicação fica em `http://localhost:3000`. A primeira execução requer acesso para obter imagens e dependências. O endpoint `/saude` permite conferir a aplicação e a conexão com o banco.

As contas de demonstração incluem o doador `comper@demo.com` e a receptora `esperanca@demo.com`, com senha fictícia `123456`. A interface oferece botões para acesso de demonstração. Esses dados são exclusivos do protótipo acadêmico.

O PostgreSQL persiste os dados em volume, e `init.sql` é executado apenas na criação de um volume vazio. Os horários do seed são relativos à inicialização. A preparação de uma nova demonstração deve seguir o README e considerar que a recriação do volume elimina os dados locais daquele ambiente.

Para ler o QR em outro dispositivo, o endereço da aplicação deve ser alcançável pela rede local. `localhost` no celular aponta para o próprio aparelho. O README descreve acesso pelo IP do notebook e o parâmetro `BASE_URL`. A rede precisa permitir comunicação entre os dispositivos.

## 13 Viabilidade técnica e executiva

**Viabilidade técnica.** A execução em dois contêineres e a ausência de uma etapa de build do front simplificam a avaliação. O healthcheck do banco condiciona a inicialização da aplicação à disponibilidade do PostgreSQL. As dependências de execução são limitadas às seis bibliotecas previstas, e o schema centralizado permite reproduzir a base sintética.

**Viabilidade operacional.** A oferta e a reserva podem ser realizadas por navegador, mas o sucesso da coleta depende de pessoas, transporte, conservação e conectividade. O software organiza a interação e registra o encerramento; não executa a logística física nem atesta a qualidade dos alimentos. O uso em campo exige orientação dos participantes e definição de responsabilidades [GRUPO].

**Viabilidade econômica.** O escopo local dispensa contratação de hospedagem para a avaliação acadêmica. Não foi elaborado orçamento operacional nem calculado retorno financeiro. Uma expansão demandaria estimativas de suporte, armazenamento, hospedagem, cópias de segurança, conectividade e capacitação [GRUPO].

**Riscos.** Interrupções de rede impedem operações online; o código numérico substitui a câmera, mas não cria modo offline. A aproximação por bairro pode divergir da distância real. O checklist documenta declarações, sem substituir inspeção. Os prazos e a liberação de reservas reduzem a retenção de lotes, condicionados ao processamento pela API.

<!-- pagina -->

## 14 Relação com sustentabilidade

A relação com sustentabilidade está no fluxo implementado: disponibilizar excedentes ainda aptos ao consumo, aproximar entidades, reduzir a indisponibilidade por reservas abandonadas e registrar as entregas. A dimensão ambiental está no potencial de evitar descarte; a social, no apoio às entidades que atendem pessoas; e a econômica, na organização do aproveitamento de produtos e do esforço de coleta.

O indicador mais diretamente demonstrável no sistema é a massa registrada nas entregas. Os demais fatores traduzem essa massa em estimativas para comunicação do protótipo. Como a validação utilizou dados sintéticos, o projeto demonstra capacidade de registrar e acompanhar o processo, sem afirmar redução real do desperdício em Campo Grande.

## 15 Limitações e melhorias futuras

O escopo final mantém raio fixo de 10 km e localização aproximada por bairro. A quantidade é informada somente em kg. Não existem perfil administrador, aprovação manual, exportação CSV, PWA, modo offline, envio de e-mail ou push do sistema operacional. O anexo da entidade não é analisado por serviço externo.

O limite de login fica em memória, e a atualização dos estados vencidos depende de consultas. A execução acadêmica em HTTP não oferece a proteção de tráfego de uma implantação HTTPS. O hash do comprovante comprova integridade no fluxo implementado, sem assinatura digital certificada. A existência e o conteúdo das referências legais foram conferidos. A adequação dos termos e da operação concreta não foi certificada; os pontos identificados constam das seções 17 e 18.

As prioridades são corrigir as referências dos termos, comunicar corretamente a simulação dos indicadores, compatibilizar o CNPJ alfanumérico e definir a governança de dados para eventual uso real. As seções 17 e 18 detalham evidências e critérios de aceite. Validar o uso com instituições locais [GRUPO], avaliar acessibilidade e dispositivos reais, oferecer aprovação administrativa e geocodificação e planejar infraestrutura segura com backup testado são passos de evolução. Ajustar raio, adicionar unidades e exportar dados são ampliações funcionais possíveis.

## 16 Conclusão

A Rede AlimentaMS concluiu o MVP acadêmico com os cinco fluxos centrais: cadastro, publicação, reserva por proximidade, confirmação da retirada e registro com indicadores. O pacote de entrega está disponível, e a suíte atual passou em 176 testes. Os ensaios complementares documentam o fluxo completo e a reserva única sob disputa concorrente.

A implementação articula programação, redes, sistemas operacionais, persistência e sustentabilidade em uma solução demonstrável. As adaptações da proposta inicial foram explicitadas e não impedem o objetivo do protótipo. A adoção operacional e a comprovação de impacto real dependem de validação em campo, revisão jurídica e preparação de infraestrutura compatível com dados reais.

<!-- pagina -->

## 17 Verificação das fontes e limites legais

### 17.1 Doação de alimentos e selo

A **Lei 15.224, de 30 de setembro de 2025**, existe, institui a política nacional de combate à perda e ao desperdício, cria o Selo Doador de Alimentos e **revoga a Lei 14.016/2020**, conforme art. 19. O art. 4º, VIII, prevê aplicativos e sites para aproximar doadores e receptores. O art. 14 condiciona a doação à validade e à segurança; seu § 1º prevê profissional habilitado nas situações ali descritas, na forma de regulamento. O selo é concedido pelo poder público, não pela plataforma [16].

O checklist registra declarações e não substitui avaliação profissional. O comprovante não concede selo, benefício fiscal, certificação sanitária ou isenção geral de responsabilidade. Os arts. 15–17 tratam especificamente das doações realizadas nos termos da lei; seu enquadramento não deve ser generalizado para todos os serviços da aplicação.

A RDC Anvisa 216/2004 é referência de boas práticas para serviços de alimentação [18]. Não é uma autorização geral para qualquer doação. A atividade concreta deve considerar os regulamentos aplicáveis e as exigências estaduais e municipais. Esse levantamento operacional e a revisão especializada permanecem necessários antes de um piloto real [VERIFICAR].

### 17.2 Privacidade e proteção de dados

A LGPD, Lei 13.709/2018, em texto atualizado, exige hipóteses legais para tratamento, transparência, direitos dos titulares e medidas de segurança. Os arts. 7º, 8º, 9º, 16, 18 e 46 fundamentam a análise de bases, informação, guarda, atendimento e segurança [17]. O aceite dos termos não equivale, sozinho, a consentimento válido para qualquer finalidade.

A política atual deixa controlador, contato e retenção como informações do grupo. O gatilho de imutabilidade é um controle técnico e não fundamenta guarda indefinida de dados pessoais. São necessárias decisões para contato, correção, eliminação quando cabível, conservação justificada e acesso aos documentos anexados. Não se presume dispensa genérica da LGPD pelo caráter acadêmico. A demonstração permanece com dados sintéticos.

### 17.3 CNPJ e evidências da comparação

A Receita Federal anunciou a primeira emissão alfanumérica em 31/07/2026, preservando a validade dos CNPJs numéricos anteriores [15]. A implementação atual aceita somente números e, portanto, não atende algumas novas inscrições. Isso é uma limitação de compatibilidade, sem invalidar os cadastros numéricos existentes.

As referências externas resolvem a identificação das leis, estatísticas e modelos de soluções. Não confirmam entrevistas, parceiros, orçamento, capturas ou leitura física de QR do grupo. Esses fatos devem ser documentados pelos integrantes [GRUPO]. Foram usados Codex e Claude em programação, testes, revisão e documentação, conforme os registros; a divisão individual do trabalho e a forma de declarar esse uso à disciplina dependem do grupo.

<!-- pagina -->

## 18 Ajustes recomendados no MVP

As recomendações abaixo estão registradas para a próxima implementação e consolidação do relatório. **Nenhum desses ajustes foi executado nesta atualização documental.** O aceite deve se apoiar no comportamento realmente alterado e nos testes correspondentes. A conclusão acadêmica do MVP não equivale a autorização para usar dados e doações reais.

### 18.1 Referências dos termos e histórico de aceite

**Prioridade para o fechamento documental.** Em `backend/public/termos.html`, substituir a referência vigente à lei revogada pela Lei 15.224/2025. Explicar os limites do checklist e do comprovante, sem prometer selo, benefício fiscal ou ausência genérica de responsabilidade. Conferir também README e conformidade para evitar afirmações divergentes.

**Critério de aceite.** Cadastro e termos mostram a mesma versão e o aceite continua obrigatório. Não reescrever o texto já aceito mantendo o identificador `2026-10-v1`: definir nova versão no ponto de configuração usado pelo cadastro, preservar instantes/versões anteriores e manter uma cópia do texto anterior. Confirmar a gravação da nova versão e a preservação dos registros existentes. A redação jurídica operacional exige validação específica [VERIFICAR].

### 18.2 Apresentação das estimativas de impacto

**Prioridade para evitar afirmações sem fundamento.** Em `backend/public/index.html`, distinguir massa registrada, indicadores operacionais e equivalências simuladas. As telas global e pessoal devem explicar que refeições, CO2e e água são simulações com parâmetros internos sem método validado; não exibir esses números como resultados ambientais comprovados. Conferir a comunicação dos fatores de `backend/src/server.js` e a documentação.

**Critério de aceite.** Aviso visível junto aos indicadores nas duas telas e em qualquer apresentação/exportação desses números. Não substituir os fatores por valores de outra plataforma sem método aplicável. Preservar o cálculo de kg, TMR e TEC e seus testes; atualizar apenas as asserções de texto afetadas, sem afrouxar verificações de dados. Uma alternativa é ocultar as equivalências até existir metodologia, mantendo os indicadores operacionais.

### 18.3 Compatibilidade com CNPJ alfanumérico

**Prioridade de compatibilidade com novas inscrições.** Atualizar `backend/src/validacao.js`, máscara/entrada do cadastro em `backend/public/index.html` e formatação de CNPJ em comprovantes e verificações, usando o algoritmo oficial da Receita. Revisar limites HTML, expressões regulares e formatações que descartam letras. Não remover o suporte aos números existentes.

**Critério de aceite.** Formatos numérico e alfanumérico válidos são aceitos; dígitos verificadores incorretos e caracteres proibidos são recusados com erro de cliente em JSON, sem 500. Letras são preservadas e normalizadas de forma consistente no banco e nas telas. Cobrir cadastro, colagem, login da conta cadastrada e comprovante com dados sintéticos. Alterar `db/init.sql` somente se necessário, preservando dados e explicando a atualização dos bancos existentes.

<!-- pagina -->

### 18.4 Governança de dados antes do uso real

**Depende de decisão do grupo.** Definir controlador, canal de contato, finalidades e bases legais por tratamento, prazo/critério de retenção, acesso aos anexos e procedimento para direitos dos titulares. Preencher essas decisões na política; não inventar nome, e-mail, prazo ou fundamento jurídico para remover marcadores [GRUPO]. Não presumir consentimento universal pelo checkbox.

**Critério de aceite.** Política, operação e código correspondem às decisões aprovadas. A eventual correção/anonimização de dados precisa preservar a integridade documental e observar as hipóteses legais de conservação. Não retirar o gatilho de imutabilidade nem acrescentar exclusão irrestrita como solução automática. Em uma alteração de dados/schema, exigir plano de atualização e testes de autorização, retenção e integridade. A demonstração acadêmica pode manter essas decisões explicitamente fora do uso real, com dados sintéticos.

### 18.5 Preparação sanitária e operacional do piloto

**Depende do contexto real.** Identificar atividades e instituições participantes, responsabilidades pelo armazenamento, transporte, conservação e inspeção e exigências de profissional habilitado. Confrontar o fluxo com o art. 14 da Lei 15.224/2025 e as normas aplicáveis [16,18]. O software pode registrar evidências e responsáveis, mas não deve criar uma tela que simule habilitação profissional ou concessão do selo.

**Critério de aceite.** Requisitos operacionais documentados e validados antes de adicionar campos ou automatizar aprovações. Não afirmar conformidade apenas porque o usuário marcou três opções. Registrar a atividade e a evidência efetiva exigida, sem coletar documentos pessoais desnecessários. Regulamentos específicos do contexto ainda exigem análise [VERIFICAR].

### 18.6 Limites do escopo e validação das mudanças

Para o protótipo local, priorizar a precisão dos textos e os ajustes de compatibilidade. HTTPS, segredos operacionais, backup/restauração e retirada das contas de demonstração pertencem à preparação de eventual uso real; não publicar nem acessar VPS como parte da consolidação do relatório.

Após qualquer mudança funcional, executar `npm test` em `backend/` com banco exclusivo e descartável, acrescentar regressões proporcionais ao comportamento alterado e conferir os fluxos visuais afetados. Não apresentar os 176 testes anteriores como evidência de uma mudança futura ainda não executada. Atualizar o relatório e a conformidade a partir do resultado real.

O pacote atual foi produzido a partir de um commit. Se houver alterações no MVP, o responsável autorizado pelo controle de versão deverá salvar e reempacotar a versão correta, testar uma extração limpa e registrar quais verificações foram repetidas. Até isso ocorrer, as recomendações permanecem propostas, e o ZIP anterior não deve ser apresentado como contendo essas correções.

<!-- pagina -->

## 19 Referências

[1] SESC. Sesc Mesa Brasil. Disponível em: https://www.sesc.com.br/assistencia/sesc-mesa-brasil/. Acesso em: 28 out. 2026.

[2] BRASIL. Ministério do Desenvolvimento e Assistência Social, Família e Combate à Fome. Bancos de alimentos são estratégicos no combate ao desperdício. Disponível em: https://www.gov.br/mds/pt-br/noticias-e-conteudos/desenvolvimento-social/noticias-desenvolvimento-social/bancos-de-alimentos-sao-estrategicos-no-combate-ao-desperdicio. Acesso em: 28 out. 2026.

[3] UNIVERSIDADE CATÓLICA DOM BOSCO. Plano de aprendizagem do Desafio de Articulação de Competências. TADS, 2026. Documento fornecido ao grupo: `docs/02 e 01i DAC 262 TADS 26B.pdf`.

[4] SILVA NETO, Amilcar; DIAS, Paulo Roberto Ribeiro. Projeto de redistribuição de alimentos próximos ao vencimento. Etapa 4: definição da solução, tecnologias, arquitetura, fluxos, riscos e critérios de validação. Campo Grande, 25 set. 2026. Documento do grupo: `docs/DAC_Etapa_4.docx`.

[5] REDE ALIMENTAMS. Código-fonte e schema da versão de entrega. `backend/src/server.js`, `validacao.js`, `tempo-real.js`, `comprovante.js`, `backend/public/index.html`, `db/init.sql`, `backend/package.json` e `docker-compose.yml`. Repositório local, 28 out. 2026.

[6] REDE ALIMENTAMS. Documentação de execução e conformidade. `README.md` e `docs/CONFORMIDADE.md`. Repositório local, 28 out. 2026. Os registros de conformidade anteriores à última atualização podem mencionar 175 testes; a execução atual confirmou 176.

[7] REDE ALIMENTAMS. Evidências de testes. `backend/test/`, `docs/testes/e2e-api.mjs` e `docs/testes/resultado-carga.md`. Repositório local, 28 out. 2026. Suíte atual: 176 aprovações; fumaça registrada: 55 aprovações; carga histórica: 440 requisições.

[8] REDE ALIMENTAMS. Registros de desenvolvimento e validação. `docs/agentes/progresso/POLIMENTO.md`, `docs/agentes/REVISAO_FINAL.md`, `docs/ROTEIRO_DEMO.md` e `docs/ROTEIRO_PRINTS.md`. Repositório local, 28 out. 2026.

<!-- pagina -->

[9] IBGE. PNAD Contínua Segurança Alimentar 2024. Divulgação de 2025. https://agenciadenoticias.ibge.gov.br/media/com_mediaibge/arquivos/724f23c52823528787ba0ef28b7940e3.pdf

[10] UNEP. Food Waste Index Report 2024. Comunicado de 27 mar. 2024. https://www.unep.org/en/news-and-stories/press-release/world-squanders-over-1-billion-meals-day-un-report

[11] NAÇÕES UNIDAS BRASIL. ODS 12. Meta 12.3. https://brasil.un.org/pt-br/sdgs/12

[12] NAÇÕES UNIDAS BRASIL. ODS 2. Meta 2.1. https://brasil.un.org/pt-br/sdgs/2

[13] TOO GOOD TO GO. About us. Modelo de negócio. https://www.toogoodtogo.com/en-us/about-us

[14] COMIDA INVISÍVEL. Plataforma oficial. Como funciona e cadastro de ONGs. https://app.comidainvisivel.com.br/

[15] BRASIL. Ministério da Fazenda e Receita Federal. Receita Federal gera o primeiro CNPJ em formato alfanumérico. 31 jul. 2026. https://www.gov.br/fazenda/pt-br/assuntos/noticias/2026/julho/receita-federal-gera-o-primeiro-cnpj-em-formato-alfanumerico

[16] BRASIL. Lei 15.224, de 30 de setembro de 2025. Política Nacional de Combate à Perda e ao Desperdício de Alimentos e Selo Doador de Alimentos. DOU, 1 out. 2025. https://www2.camara.leg.br/legin/fed/lei/2025/lei-15224-30-setembro-2025-798048-publicacaooriginal-176570-pl.html

[17] BRASIL. Lei 13.709, de 14 de agosto de 2018. LGPD. Texto atualizado na Câmara dos Deputados. https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html

[18] ANVISA. RDC 216, de 15 de setembro de 2004. Boas práticas para serviços de alimentação. https://bvsms.saude.gov.br/bvs/saudelegis/anvisa/2004/res0216_15_09_2004.html

[19] FAO. The State of Food and Agriculture 2020. Tabela 1, pegadas hídricas por grupos de alimentos. https://digitallibrary.un.org/record/3930108/files/cb1447en.pdf

### Nota sobre evidências e referências legais

Os documentos internos sustentam as descrições técnicas e os resultados do protótipo. As fontes institucionais [1] e [2] fundamentam o contexto de redistribuição. As referências [9–19] foram conferidas em fontes oficiais/institucionais em 28/10/2026 e incorporadas a partir da verificação documental registrada em `docs/agentes/REVISAO_RELATORIO.md`. Confirmar fontes não certifica a operação real; os pontos ainda dependentes de decisões do grupo ou análise específica estão delimitados nas seções 17 e 18. Não foram utilizados dados pessoais reais nem realizadas entrevistas ou medições de impacto em campo.
