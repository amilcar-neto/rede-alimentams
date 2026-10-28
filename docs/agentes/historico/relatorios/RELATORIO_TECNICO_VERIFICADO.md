# Relatório Técnico de Projeto

## Rede AlimentaMS

**Plataforma de redistribuição de alimentos próximos ao vencimento em Campo Grande – MS**

Universidade Católica Dom Bosco (UCDB) · Tecnologia em Análise e Desenvolvimento de Sistemas (TADS)
Desafio de Articulação de Competências (DAC) — 1º e 2º semestres

**Integrantes:** Amilcar Silva Neto · Paulo Roberto Ribeiro Dias
**Professor orientador:** 
**Local e data:** Campo Grande – MS, outubro de 2026

**Fontes externas conferidas em 28 de outubro de 2026.** Os resultados técnicos correspondem ao MVP acadêmico concluído. Os marcadores **[GRUPO]** identificam informações de campo ou evidências que dependem dos integrantes. A conferência documental das leis não constitui certificação de conformidade para operação real.

---

## Resumo

A Rede AlimentaMS é uma aplicação web que conecta estabelecimentos que têm alimentos excedentes ou próximos do vencimento (supermercados, padarias, restaurantes) a entidades assistenciais de Campo Grande – MS. O doador publica um lote com quantidade, validade, horário limite de retirada e foto opcional. As entidades num raio de 10 km recebem aviso imediato no aplicativo, e a primeira que reservar fica com o lote, escolhendo uma janela de retirada. Na entrega, o doador lê um QR Code (ou digita um código de 6 dígitos), confere um checklist sanitário e confirma. O sistema então emite um comprovante digital com hash SHA-256 verificável publicamente e atualiza os indicadores de impacto: quilos salvos, refeições, CO₂e e água, tempo médio até a reserva e taxa de entrega.

O MVP foi construído com Node.js, Express, PostgreSQL/PostGIS e front-end em HTML, CSS e JavaScript, e roda com um único comando Docker. Foi validado por 176 testes automatizados, por uma verificação de ponta a ponta com 55 itens, por um teste de carga com até 200 requisições simultâneas e por conferências em navegador registradas nos documentos do projeto. O relato de leitura física do QR pelo celular depende do registro do grupo [GRUPO].

---

## 1. Problema

### 1.1 O que ocorre

Alimentos em perfeitas condições de consumo são descartados diariamente pelo varejo e pelo setor de alimentação por estarem próximos do vencimento, fora do padrão comercial ou em excesso. Ao mesmo tempo, entidades que atendem pessoas em insegurança alimentar (casas de apoio, cozinhas comunitárias, asilos, associações de bairro) têm dificuldade de abastecer suas despensas de forma regular.

O projeto trata de uma barreira específica: a **ligação rápida entre quem tem excedentes aptos ao consumo e as entidades que podem recebê-los**. A insegurança alimentar possui outras causas e não se resolve apenas com uma plataforma. O excedente perecível tem horas ou poucos dias de vida útil. Sem um canal ágil, o caminho mais simples para o estabelecimento é descartar.

### 1.2 Onde ocorre

O recorte do projeto é o município de **Campo Grande – MS**, onde se concentram os estabelecimentos doadores (redes de supermercados, padarias, restaurantes, feiras) e as entidades receptoras. O protótipo usa bairros reais da cidade (Centro, Monte Castelo, Amambai, Jardim dos Estados, Tiradentes, Coronel Antonino, Vila Carvalho) como referência geográfica.

> [GRUPO] Inserir aqui as evidências locais levantadas nas Etapas 1 a 3: estabelecimentos e entidades contatados, relatos colhidos, fotos ou números observados em Campo Grande.

### 1.3 Quem é afetado

- **Entidades assistenciais e as pessoas que elas atendem**, que perdem acesso a alimentos que seriam descartados.
- **Estabelecimentos doadores**, que arcam com custo de descarte e perdem a oportunidade de ter suas doações reconhecidas.
- **O município e o meio ambiente**, que recebem o resíduo orgânico.

### 1.4 Consequências

- **Social:** alimento que poderia complementar refeições de famílias vulneráveis deixa de chegar a elas. Na PNAD Contínua referente a 2024, o IBGE identificou insegurança alimentar em **24,2% dos domicílios brasileiros**, aproximadamente **18,9 milhões** [1]. São domicílios com algum grau de insegurança, não uma contagem de pessoas em fome grave; o dado nacional não é estimativa de Campo Grande.
- **Ambiental:** o alimento desperdiçado carrega a água, a energia e as emissões de gases de efeito estufa gastas para produzi-lo, além de gerar resíduo orgânico. O **Food Waste Index Report 2024**, do PNUMA, estima **1,05 bilhão de toneladas em 2022**, incluindo partes não comestíveis, em domicílios, serviços de alimentação e varejo [2]. O total não corresponde apenas a alimentos comestíveis disponíveis para doação e não deve ser atribuído ao Brasil ou a Campo Grande.
- **Econômica:** custo de descarte para o estabelecimento e valor perdido ao longo da cadeia.

### 1.5 Como é tratado atualmente

Há programas estruturados de redistribuição, como o **Sesc Mesa Brasil**, que recebe excedentes de parceiros e os direciona a instituições cadastradas, além de promover ações educativas [6]. Contatos diretos por telefone ou mensagens são uma alternativa de coordenação, cuja utilização local precisa ser documentada pelo grupo.

Não foi produzido um estudo comparativo que demonstre incapacidade dos programas existentes de atender pequenos lotes. A proposta acadêmica testa uma forma de organizar ofertas, reservas e registros em uma aplicação local. A existência de comprovantes e métricas em outros processos deve ser examinada caso a caso.

### 1.6 Onde a tecnologia contribui

A tecnologia atua nos pontos em que o processo manual falha:

1. **Descoberta:** avisar na hora as entidades próximas quando surge um lote.
2. **Disputa e compromisso:** garantir que só uma entidade fique com o lote e que ela retire dentro de uma janela definida.
3. **Prazo:** se a entidade não aparece, o lote volta automaticamente para as outras, em vez de vencer parado.
4. **Registro:** emitir comprovante verificável de cada doação e medir o impacto acumulado.

---

## 2. Justificativa

A relação com a sustentabilidade está no **funcionamento** do sistema, e não apenas no tema:

- cada confirmação registra a massa entregue; evitar descarte é o benefício pretendido, cuja comprovação em campo depende de acompanhar o destino efetivo do alimento;
- a priorização por validade e proximidade busca reduzir o tempo entre a oferta e a coleta, um fator relevante para alimentos perecíveis;
- a liberação de reservas vencidas, processada na próxima consulta à API, permite nova disputa entre entidades do raio; não há fila que escolha automaticamente a próxima entidade;
- os registros imutáveis e o comprovante dão segurança e reconhecimento ao doador, o que favorece doações recorrentes.

O projeto se relaciona à **meta 12.3 do ODS 12**, que prevê reduzir pela metade o desperdício mundial per capita no varejo e no consumo até 2030 e reduzir perdas nas cadeias de abastecimento, e à **meta 2.1 do ODS 2**, voltada ao acesso a alimentos seguros, nutritivos e suficientes [3–4]. Trata-se de alinhamento temático; não de comprovação de cumprimento das metas.

### 2.1 Marco legal conferido

A **Lei nº 15.224, de 30 de setembro de 2025**, instituiu a Política Nacional de Combate à Perda e ao Desperdício de Alimentos e criou o Selo Doador de Alimentos. Seu art. 19 **revogou a Lei nº 14.016/2020**. O art. 4º, VIII, prevê aplicativos e sites para aproximar doadores e receptores. O art. 14 condiciona a doação à validade e à segurança dos alimentos e prevê profissional habilitado nas situações descritas no § 1º, na forma de regulamento. O selo é concedido pelo poder público; não pelo aplicativo [5].

O checklist registra declarações dos usuários e não substitui avaliação profissional. A aplicação não concede selo, benefício fiscal ou certificação sanitária. A análise operacional deve considerar normas sanitárias aplicáveis à atividade, como a RDC Anvisa nº 216/2004 para serviços de alimentação, e regras locais [11].

### 2.2 Privacidade e limites da validação

A LGPD exige hipóteses legais de tratamento, transparência, direitos dos titulares e medidas de segurança. O aceite dos termos não equivale, sozinho, a consentimento válido para qualquer uso dos dados. Os arts. 7º, 8º, 9º, 16, 18 e 46 são referências para definir bases, informações, retenção, atendimento e segurança [10].

O MVP possui controles de acesso e minimização, mas os termos ainda contêm controlador, contato e prazo de guarda sem definição. A imutabilidade técnica não justifica retenção indefinida. São decisões pendentes para uso real, além da revisão dos termos, que ainda citam a lei revogada. O caráter acadêmico não dispensa automaticamente a análise das regras aplicáveis ao tratamento de dados pessoais. A demonstração mantém dados sintéticos.

---

## 3. Público beneficiado

| Público | Benefício |
|---|---|
| Entidades receptoras (ONGs, casas de apoio, cozinhas comunitárias) | Acesso rápido a alimentos próximos, com aviso imediato e horário de retirada combinado. |
| Pessoas atendidas pelas entidades | Complemento alimentar. |
| Estabelecimentos doadores | Destino rápido para o excedente, comprovante de cada doação e histórico do impacto gerado. |
| Gestão pública e sociedade | Indicadores agregados do volume salvo do descarte. |

---

## 4. Objetivos

### 4.1 Objetivo geral

Desenvolver e validar um MVP voltado a apoiar a redução do desperdício de alimentos em Campo Grande – MS, conectando doadores e entidades receptoras próximas de forma rápida, rastreável e mensurável.

### 4.2 Objetivos específicos

1. Permitir que estabelecimentos publiquem lotes de alimentos com validade, horário limite de retirada e foto.
2. Avisar em tempo real as entidades num raio de 10 km e garantir que apenas uma reserve cada lote.
3. Controlar a janela de retirada e devolver automaticamente à disponibilidade o lote não retirado.
4. Confirmar a entrega com código ou QR Code e checklist sanitário, emitindo comprovante verificável.
5. Registrar massa entregue e indicadores operacionais e demonstrar equivalências simuladas de refeições, CO₂e e água.
6. Validar o sistema com testes automatizados, testes de carga e demonstração.

---

## 5. Pesquisa

### 5.1 Soluções existentes

| Solução | Como funciona | Diferença em relação à Rede AlimentaMS |
|---|---|---|
| Bancos de alimentos e Sesc Mesa Brasil | Recebem excedentes de parceiros e distribuem a instituições cadastradas; também realizam ações educativas [6]. | A Rede AlimentaMS é um MVP de coordenação direta e não opera armazém ou transporte. Não se demonstrou superioridade sobre esses programas. |
| Too Good To Go | Referência internacional de venda de excedentes com desconto, com reserva e retirada pelo consumidor [7]. | Modelo comercial ao consumidor final; o MVP trabalha com doação a entidades. Não se afirma disponibilidade da empresa no Brasil. |
| Comida Invisível | A página oficial oferece conexão entre empresas e ONGs, documentação e capacitação em manipulação [8]. | Há sobreposição de objetivos; o MVP adota o recorte de Campo Grande e seu próprio fluxo de reserva. Não se conclui exclusividade ou ausência de recursos no concorrente. |
| Contato direto por telefone ou mensagens | Coordenação entre participantes; práticas locais dependem de levantamento [GRUPO]. | A aplicação reúne oferta, reserva e registro. Não se presume inexistência de controles fora dela. |

> [GRUPO] Complementar com a pesquisa de soluções feita na Etapa 3 e com o que foi ouvido de doadores e entidades.

### 5.2 Conclusão da pesquisa

A pesquisa documental fundamenta a escolha de um canal **local, com avisos e registros verificáveis**, sem provar uma lacuna exclusiva de mercado. A contribuição demonstrada pelo protótipo é reunir oferta, prazo e reserva única; quando a reserva é liberada, o lote volta a ser disputado. A adesão e a utilidade percebida em Campo Grande dependem de validação em campo.

---

## 6. Requisitos

### 6.1 Requisitos funcionais

| ID | Requisito | Situação |
|---|---|---|
| RF01 | Cadastro de doador e entidade com CNPJ (dígito verificador), endereço, bairro, responsável, telefone e aceite do termo/política de privacidade. | Implementado |
| RF02 | Entidade anexa comprovante de entidade sem fins lucrativos (PDF/JPEG/PNG até 1 MB). | Implementado |
| RF03 | Login com perfis doador e receptora. | Implementado |
| RF04 | Doador publica lote: alimento, categoria, quantidade (kg), validade, horário limite de retirada e foto opcional. | Implementado |
| RF05 | Entidade vê os lotes num raio de 10 km, ordenados por validade e distância. | Implementado |
| RF06 | Aviso em tempo real às entidades do raio quando um lote é publicado ou volta a ficar disponível. | Implementado |
| RF07 | Reserva com janela de retirada (até 2 h) e código de 6 dígitos; só a primeira entidade consegue reservar. | Implementado |
| RF08 | QR Code de retirada que abre a confirmação já preenchida no celular do doador. | Implementado |
| RF09 | Confirmação da retirada pelo doador com checklist sanitário obrigatório (embalagem, temperatura, validade). | Implementado |
| RF10 | Comprovante digital com hash SHA-256 e página pública de verificação. | Implementado |
| RF11 | Expiração do lote vencido e devolução automática da reserva não retirada. | Implementado |
| RF12 | Entidade pode desistir da reserva; doador pode cancelar o lote. | Implementado |
| RF13 | Painel de indicadores global e "Meus números" por usuário. | Implementado |
| RF14 | Painel administrativo para aprovar cadastros. | Não implementado (melhoria futura) |

### 6.2 Requisitos não funcionais

| ID | Requisito | Como foi atendido |
|---|---|---|
| RNF01 | Segurança de acesso | JWT com validade de 8 h, senhas com bcrypt, verificação de perfil em todas as rotas protegidas. |
| RNF02 | Integridade dos registros | Doações imutáveis no banco (gatilho bloqueia UPDATE/DELETE) e hash SHA-256 do comprovante. |
| RNF03 | Concorrência | Reserva e confirmação atômicas no banco; teste com 200 reservas simultâneas no mesmo lote. |
| RNF04 | Proteção de dados | Controles de acesso e dados mínimos; adequação integral à LGPD não demonstrada. Base legal, retenção e atendimento dependem de definição. |
| RNF05 | Usabilidade | Interface responsiva, mensagens de erro em português, confirmação no próprio cartão. |
| RNF06 | Portabilidade | Execução por `docker compose` em Windows, Linux ou Mac. |
| RNF07 | Robustez | Entrada inválida nunca gera erro 500; limites de tamanho de foto e anexo; limite de tentativas de login e de código. |

---

## 7. Solução proposta

### 7.1 Visão geral

A solução é uma aplicação web única, acessada pelo navegador do computador ou do celular, com dois perfis:

- **Doador:** publica lotes, acompanha quem reservou e em que horário, confirma a retirada, consulta doações e comprovantes e vê os próprios números.
- **Entidade receptora:** vê os lotes próximos, recebe avisos, reserva, mostra o código ou QR ao doador, pode desistir da reserva e consulta as doações recebidas.

### 7.2 Fluxos implementados

1. **Cadastro e validação:** o CNPJ é validado pelos dígitos verificadores; endereço, responsável, telefone e aceite do termo são obrigatórios; a entidade pode anexar o comprovante de entidade sem fins lucrativos.
2. **Publicação do lote:** o sistema recusa validade vencida, quantidade inválida e horário limite fora do prazo. A foto é reduzida no próprio navegador (até 1024 px) antes do envio, e o servidor confere pelo conteúdo do arquivo que ela é realmente JPEG ou PNG.
3. **Aviso e reserva:** ao publicar, todas as entidades num raio de 10 km recebem aviso imediato no aplicativo, marcado como **urgente** quando a validade é de hoje ou amanhã. A primeira entidade que reservar fica com o lote; as demais recebem "lote não está mais disponível".
4. **Retirada:** a entidade escolhe uma janela de até 2 horas e recebe código e QR Code. O doador lê o QR com a câmera do celular, que abre a confirmação com o código já preenchido; marca o checklist sanitário e confirma. O QR não confirma sozinho, de propósito: a conferência humana do alimento é obrigatória.
5. **Conclusão:** a doação é registrada de forma imutável, o comprovante é emitido e os indicadores são atualizados. A entidade é avisada da confirmação.

### 7.3 Redirecionamento (mitigação do risco de demora)

Se a janela de retirada termina e passam mais 30 minutos de tolerância sem confirmação, a reserva é desfeita e o lote volta a ficar disponível, com aviso às outras entidades do raio. A entidade também pode desistir antes, liberando o lote na hora. Lotes vencidos, ou que passaram do horário limite sem reserva, expiram.

### 7.4 Indicadores

| Indicador | Cálculo | Meta (Etapa 4) |
|---|---|---|
| kg salvos do descarte | soma das doações confirmadas | — |
| Refeições, CO₂e e água | kg × fator de conversão (2 refeições, 2,5 kg CO₂e e 350 L por kg) | — |
| Entidades beneficiadas | entidades distintas que receberam doações | — |
| TMR (tempo médio até a reserva) | média entre publicação e reserva | < 90 min |
| TEC (taxa de entrega concluída) | entregues ÷ (entregues + expirados) | > 92% |

Os fatores **2 refeições, 2,5 kg de CO₂e e 350 L por kg são parâmetros internos de simulação, sem fonte metodológica identificada para esta combinação**. Duas refeições por kg pressupõem uma porção de 500 g, sem assegurar adequação nutricional ou consumo efetivo. A pesquisa não fundamentou o uso universal dos dois fatores ambientais. Uma referência da FAO apresenta pegadas hídricas distintas para vegetais, frutas e outros grupos [12]. Portanto, os valores do painel não devem ser apresentados como emissões efetivamente evitadas ou água efetivamente economizada; seria necessário definir categorias, origem, cenário de descarte, transporte e método de avaliação. Os dados iniciais da demonstração incluem um histórico **simulado** de 30 dias (16 doações, 378 kg), para que o painel e os indicadores não comecem vazios. As doações feitas durante o uso somam a esse histórico.

---

## 8. Tecnologias

| Camada | Tecnologia | Por que |
|---|---|---|
| Front-end | HTML, CSS e JavaScript (sem framework) | Uma única página, sem etapa de build: simples de manter, testar e rodar no PC do avaliador. |
| Back-end | Node.js 24 + Express 4 | Assíncrono e orientado a eventos, adequado a muitas requisições curtas e a conexões WebSocket. |
| Tempo real | WebSocket (biblioteca `ws`) | Avisos instantâneos sem o cliente precisar ficar consultando o servidor. |
| Banco de dados | PostgreSQL 16 + PostGIS 3.4 | Transações para a reserva atômica; consultas geográficas de raio e distância. |
| Segurança | `jsonwebtoken` (JWT) e `bcryptjs` | Sessão sem estado no servidor e senhas com hash. |
| QR Code | `qrcode` | Geração do QR de retirada e do QR de verificação do comprovante. |
| Infraestrutura | Docker e Docker Compose | Um comando sobe banco e aplicação em qualquer sistema operacional. |
| Testes | `node:test` (nativo do Node) | Sem dependência extra; banco de testes exclusivo e descartável. |

**Mudança em relação à Etapa 4.** A proposta previa React/React Native (PWA), TypeScript e hospedagem em Vercel/Render. Pelo prazo, o grupo optou por:
- front-end em JavaScript puro;
- back-end em JavaScript;
- execução local com Docker.

A arquitetura e as regras de negócio previstas foram mantidas. Os arquivos para implantação em servidor com HTTPS automático foram preparados, mas ficaram fora do escopo desta entrega.

---

## 9. Arquitetura

### 9.1 Camadas

O sistema segue o modelo cliente-servidor em três camadas:

```
 Navegador (computador ou celular)
   index.html: interface, máscaras, redução da foto, leitura de QR via link
        │  HTTP/JSON (REST)          │  WebSocket /ws (avisos)
        ▼                            ▼
 Contêiner "app" — Node.js + Express (porta 3000)
   rotas REST, autenticação JWT, regras de negócio, comprovante/QR,
   módulo de tempo real (WebSocket)
        │  SQL parametrizado (pool de conexões)
        ▼
 Contêiner "db" — PostgreSQL 16 + PostGIS (rede interna do Docker)
   usuários, lotes, eventos, notificações, doações (imutáveis)
```

O banco **não** fica exposto fora do Docker: só o aplicativo o acessa, pela rede interna. Apenas a porta do aplicativo é publicada.

### 9.2 Modelo de dados

| Tabela | Conteúdo |
|---|---|
| `usuarios` | doadores e receptoras, com localização geográfica (`geography`, índice GIST), dados de contato e aceite do termo |
| `comprovantes_entidade` | anexo da entidade (até 1 MB) |
| `lotes` | oferta e seu ciclo de vida: disponível → reservado → entregue / expirado / cancelado |
| `eventos_lote` | histórico de cada transição (publicado, reservado, liberado, desistência, cancelado, expirado, entregue) |
| `notificacoes` | central de avisos por destinatário |
| `doacoes` | registro final com checklist, comprovante (JSON) e hash; protegido contra alteração por gatilho |

### 9.3 Principais rotas da API

| Rota | Função |
|---|---|
| `POST /auth/register`, `POST /auth/login` | cadastro e login |
| `GET /lotes`, `POST /lotes` | listar (por perfil e raio) e publicar |
| `PUT /lotes/:id/reservar` | reservar com janela |
| `PUT /lotes/:id/cancelar-reserva`, `PUT /lotes/:id/cancelar` | desistir / cancelar |
| `GET /lotes/:id/qrcode` | QR de retirada |
| `PUT /lotes/:id/confirmar-retirada` | confirmar com código e checklist |
| `GET /doacoes/:id/comprovante`, `GET /verificar/:hash` | comprovante e verificação pública |
| `GET /notificacoes`, WebSocket `/ws` | avisos |
| `GET /indicadores`, `GET /indicadores/meus` | painéis |

---

## 10. Desenvolvimento

### 10.1 Etapas

O desenvolvimento partiu da proposta da Etapa 4 e de um primeiro protótipo com o fluxo básico (publicar, reservar, confirmar). Uma análise de conformidade feita em 27/10/2026 comparou o protótipo com a proposta e encontrou:
- partes ausentes: QR Code, notificações, comprovante, foto, horário de retirada, validação de CNPJ e expiração de reservas;
- falhas de validação que geravam erro 500.

A partir dela, o trabalho foi dividido em lotes incrementais, cada um com testes e revisão antes de ser integrado:

| Lote | Entrega |
|---|---|
| L00 | Base de testes automatizados com banco exclusivo e descartável |
| L01 | Validações e robustez (nenhuma entrada inválida gera erro 500), CNPJ |
| L02 | Ciclo de vida: janela de retirada, expiração e devolução da reserva |
| L03 | Foto do lote e horário limite de retirada |
| L04 | Comprovante com hash, checklist sanitário, registro imutável e QR Code |
| L05 | Notificações em tempo real por WebSocket |
| L06 | Cadastro completo, termo/LGPD, anexo da entidade e indicadores TMR/TEC |
| L07 | Preparação para servidor (saúde da aplicação, cabeçalhos, arquivos de implantação) |
| L08 | Dados de demonstração, roteiros e teste de carga |
| Final | Revisão geral, desistência e cancelamento, limites de tentativas, ajustes visuais e empacotamento Docker |

Foram utilizados assistentes de IA, incluindo Codex e Claude, em implementação, testes, revisão e documentação, conforme os registros do repositório. A distribuição de responsabilidades entre os integrantes e eventuais exigências da disciplina para declarar esse uso devem ser confirmadas pelo grupo [GRUPO].

### 10.2 Decisões técnicas relevantes

- **Reserva atômica:** a reserva é uma única instrução `UPDATE … WHERE status = 'disponivel'` que também confere o raio. Se duas entidades clicam ao mesmo tempo, o banco garante que só uma vence.
- **Ciclo de vida sem processo agendado:** expirações e devoluções são aplicadas no início de cada consulta de lotes, em instruções atômicas com bloqueio de linhas (`FOR UPDATE`). É mais simples que um agendador, ao custo de a mudança acontecer na próxima consulta, e não no minuto exato.
- **Comprovante verificável:** o comprovante é um JSON em forma canônica (chaves ordenadas), cujo hash SHA-256 é gravado. A página `/verificar/:hash` recalcula o hash e mostra apenas dados mínimos. Isso garante integridade, mas **não** equivale a assinatura com certificado ICP-Brasil.
- **Tempo real com fonte de verdade no banco:** o aviso é gravado na mesma instrução que muda o lote. O WebSocket só entrega mais rápido: se a conexão cair, a central de notificações continua correta pela consulta normal.
- **Fuso horário:** todas as datas de negócio usam America/Campo_Grande, inclusive no banco, para evitar que "hoje" mude às 20h por causa do UTC.
- **Proteção contra adivinhação:** 5 códigos de retirada errados seguidos bloqueiam a confirmação daquele lote por 15 minutos. Logins errados também são limitados.

---

## 11. Articulação com as disciplinas

| Disciplina | Onde aparece no projeto |
|---|---|
| **Algoritmos e Programação** | Validação de CNPJ por dígitos verificadores; validação de datas e horários (inclusive datas inexistentes, como 31/02); ordenação por validade e distância; serialização canônica e hash SHA-256; regras do ciclo de vida do lote; tratamento de erros sem expor detalhes internos. |
| **Redes de Computadores** | Comunicação cliente-servidor por HTTP com API REST em JSON; WebSocket para avisos em tempo real, com autenticação no primeiro quadro, ping periódico e limite de conexões por conta; publicação de porta e rede interna do Docker; acesso pela rede local (IP do notebook) para o celular ler o QR; análise de firewall e de isolamento de clientes em redes Wi-Fi; HTTPS previsto com proxy reverso, não usado nesta entrega. |
| **Sistemas Operacionais** | Contêineres Linux (Alpine) isolando aplicação e banco; processos e verificação de saúde (o aplicativo só sobe depois que o banco está pronto); concorrência resolvida com transações e bloqueio de linhas; pool de conexões; variáveis de ambiente para configuração; persistência em volume Docker. |
| **Arquitetura de Computadores** | Imagem do PostGIS disponível só para x86-64 (amd64): em computadores com processador ARM (ex.: Mac com chip Apple) ela roda por emulação, o que foi declarado na configuração; redução da foto no navegador para economizar memória, rede e armazenamento (base64 aumenta o tamanho em cerca de 33%, por isso o limite de 400 KB vira cerca de 547 mil caracteres); índice espacial GIST para evitar varrer a tabela inteira; medição de latência no teste de carga. |
| **Projeto de Extensão em Sustentabilidade e Diversidade** | Problema real de desperdício e insegurança alimentar na comunidade local; indicadores de impacto ambiental e social; foco em entidades assistenciais. |

---

## 12. Testes

### 12.1 Estratégia

| Tipo | Ferramenta | Resultado |
|---|---|---|
| Testes automatizados (unidade, integração e API) | `npm test`, banco exclusivo recriado a cada execução | **176 testes, 176 aprovados** |
| Ponta a ponta contra a aplicação no Docker | `docs/testes/e2e-api.mjs` | **55 de 55 verificações aprovadas**, inclusive a partir do pacote de entrega descompactado numa pasta limpa |
| Carga | `backend/test/carga.mjs` | 440 requisições medidas, zero erros inesperados |
| Verificação visual | Navegador, roteiro do fluxo completo | Fluxo completo percorrido; ajustes visuais corrigidos |
| Leitura física do QR | Celular do grupo na mesma rede | Relato a documentar com data, aparelho e resultado; não é considerado evidência confirmada neste relatório sem esse registro [GRUPO]. |

Os testes automatizados cobrem, entre outros:
- autorização por perfil e acesso apenas aos próprios dados;
- entradas inválidas (tipos errados, datas inexistentes, valores fora do limite, JSON malformado), todas com erro 400 e nunca 500;
- disputa de reserva e confirmação concorrentes;
- janela, tolerância, expiração e devolução da reserva;
- comprovante, hash e imutabilidade do registro;
- notificações apenas para os destinatários corretos, inclusive pelo WebSocket;
- cálculo de TMR e TEC conferido contra consultas SQL independentes;
- interface (máscaras, formatação, botões) executada num ambiente simulado.

### 12.2 Cenários da Etapa 4

| Cenário | Resultado |
|---|---|
| **1 — Doação de 50 kg de hortifrúti** (Centro → Monte Castelo e Amambai) | Lote visível para as duas entidades (cerca de 2,9 km e 2,0 km), avisos em tempo real, reserva com código e QR, confirmação, comprovante e indicadores +50 kg. Entidade fora do raio não vê nem reserva. |
| **2 — Regras de negócio** | Validade retroativa, quantidade zero, negativa, texto ou acima do limite, data inexistente e campos vazios são recusados com mensagem clara. |
| **3 — 20 requisições simultâneas** | Ampliado para 20 e 200 (tabela abaixo). |

### 12.3 Teste de carga

Execução local em 28/10/2026 (Node 24, Windows, 16 CPUs, aplicação e banco na mesma máquina):

| Operação | Simultâneas | Média (ms) | p95 (ms) | Resultado |
|---|---:|---:|---:|---|
| Busca de lotes | 20 | 115,6 | 124,0 | 20 × 200 OK |
| Reserva do mesmo lote | 20 | 42,4 | 45,0 | 1 reserva vence, 19 recusadas (409) |
| Busca de lotes | 200 | 308,8 | 333,0 | 200 × 200 OK |
| Reserva do mesmo lote | 200 | 277,4 | 325,6 | 1 reserva vence, 199 recusadas (409) |

A unicidade da reserva também foi conferida diretamente no banco. Limites da medição: as requisições partiram da mesma máquina, sem rede real entre cliente e servidor. Não representam 200 usuários em dispositivos diferentes nem a capacidade de um servidor de produção. A medição foi feita antes dos ajustes finais, que não alteraram as consultas medidas.

### 12.4 Indicadores de validação (seção 6.1 da Etapa 4)

| KPI | Situação |
|---|---|
| TMR < 90 min | Calculado e exibido com a meta. O histórico simulado começa **acima** da meta; o valor não foi ajustado para "bater" a meta. |
| TEC > 92% | Calculado e exibido com a meta. |
| Acurácia geográfica | Raio e ordenação conferidos por testes, inclusive a entidade fora do raio. |
| Comprovante em 100% das doações | Garantido pelo banco: toda doação exige comprovante e hash válidos. |

---

## 13. Viabilidade

### 13.1 Técnica

A solução usa apenas tecnologias livres, maduras e amplamente documentadas. Roda em um notebook comum com Docker e já foi executada do zero a partir do pacote de entrega. O desempenho medido atende com folga ao Cenário 3.

### 13.2 Executiva

- **Custo de desenvolvimento:** não há orçamento consolidado. A stack permite execução local, mas tempo da equipe, equipamentos e serviços eventualmente usados também compõem custos [GRUPO].
- **Custo de operação:** a avaliação local não exige contratar hospedagem. Um piloto precisaria de dimensionamento, cotações datadas e orçamento de suporte, rede, armazenamento e backup; não se presume que um servidor pequeno seja suficiente [GRUPO].
- **Implantação:** os arquivos de servidor com HTTPS automático já foram preparados.
- **Adoção:** o maior desafio é o engajamento de doadores. A Etapa 4 propõe um piloto com 2 ou 3 redes de supermercados de Campo Grande [GRUPO: contatos ou interesse já obtidos].
- **Aspectos legais:** referências externas conferidas; a versão atual dos termos e da política requer atualização e decisões operacionais antes do uso com participantes reais. O MVP não é apresentado como sistema juridicamente certificado.

---

## 14. Relação com a sustentabilidade

| Dimensão | Contribuição do sistema |
|---|---|
| Ambiental | Potencial de aproveitar excedentes e reduzir descarte. O painel registra massa entregue e simula equivalências; o impacto real não foi medido. |
| Social | Potencial de apoiar entidades assistenciais. Ofertas são filtradas pelo raio e ordenadas por validade e distância; a primeira reserva válida vence. |
| Econômica | Pode apoiar o aproveitamento de produtos e a organização da coleta; economia financeira não foi medida. O comprovante registra a entrega. |

A sustentabilidade é uma regra do próprio sistema: o alimento de validade mais curta aparece primeiro, a reserva não retirada volta para outra entidade antes de vencer, e cada entrega alimenta o indicador de impacto.

---

## 15. Limitações

1. **Localização por bairro:** a posição do usuário é a do bairro escolhido entre 7 bairros cadastrados, sem geocodificação do endereço digitado. Dois cadastros no mesmo bairro ficam a 0 km um do outro.
2. **Sem painel administrativo:** cadastros entram aprovados; o comprovante da entidade não passa por análise.
3. **CNPJ** validado somente no formato numérico e por dígitos verificadores, sem consulta cadastral. A Receita Federal iniciou a emissão alfanumérica em julho de 2026, mantendo válidos os números anteriores; o MVP ainda não aceita os novos códigos com letras [9].
4. **Avisos só dentro do aplicativo**, sem notificação push do celular nem e-mail.
5. **Raio fixo de 10 km** e quantidade apenas em quilos.
6. **Sem modo offline (PWA).** O código numérico funciona sem o QR, mas o aplicativo precisa de rede.
7. **HTTP local:** a demonstração roda sem HTTPS. A configuração com HTTPS existe, mas não foi usada.
8. **Comprovante com hash**, não com certificado digital ICP-Brasil.
9. **Fatores ambientais** sem fundamentação identificada para uso real. **Textos legais** com referências e decisões operacionais a atualizar; controles técnicos não comprovam adequação jurídica integral.
10. **Histórico de demonstração simulado** e contas de teste com senha conhecida.

---

## 16. Melhorias futuras

- Painel administrativo com fila de aprovação de cadastros e exportação de relatório (CSV).
- Geocodificação do endereço e raio configurável, com raio maior para lotes volumosos.
- Notificação push e e-mail; aplicativo instalável (PWA) com reservas ativas disponíveis offline.
- Quantidade em unidades além de quilos.
- Implantação em servidor com HTTPS e domínio próprio.
- Compatibilidade com CNPJ alfanumérico, eventual consulta cadastral, definição da governança de dados e revisão dos termos.
- Fatores de impacto com fonte científica por categoria de alimento.

---

## 17. Conclusão

A Rede AlimentaMS responde à pergunta da DAC — *como a Tecnologia da Informação pode contribuir para reduzir um problema real de sustentabilidade* — com um sistema que **encurta o caminho entre o excedente e quem precisa dele**. O MVP entrega os cinco fluxos da proposta:

1. cadastro;
2. publicação do lote;
3. aviso em tempo real às entidades próximas;
4. retirada com QR Code e checklist sanitário;
5. comprovante verificável com indicadores de impacto.

A liberação de reservas não retiradas permite oferecer novamente o lote às entidades do raio. O processamento acontece nas consultas à API e não escolhe uma próxima entidade automaticamente.

Algumas promessas da Etapa 4 foram simplificadas (stack do front-end, hospedagem) ou adiadas (painel administrativo, PWA, push). Todas estão registradas como limitações e melhorias futuras, sem serem apresentadas como entregues. A qualidade do que foi entregue está sustentada por evidências reproduzíveis: testes automatizados, verificação de ponta a ponta, teste de carga e conferências de interface registradas. A evidência da leitura física do QR depende do registro do grupo.

---

## Referências

Fontes institucionais e páginas oficiais consultadas em 28 out. 2026. O ano de referência de cada dado é informado no texto.

[1] IBGE. PNAD Contínua Segurança Alimentar 2024. Apresentação da divulgação de 2025. https://agenciadenoticias.ibge.gov.br/media/com_mediaibge/arquivos/724f23c52823528787ba0ef28b7940e3.pdf

[2] UNEP. Food Waste Index Report 2024 e comunicado World squanders over 1 billion meals a day. 27 mar. 2024. https://www.unep.org/en/news-and-stories/press-release/world-squanders-over-1-billion-meals-day-un-report

[3] NAÇÕES UNIDAS BRASIL. ODS 12 Consumo e produção responsáveis. Meta 12.3. https://brasil.un.org/pt-br/sdgs/12

[4] NAÇÕES UNIDAS BRASIL. ODS 2 Fome zero e agricultura sustentável. Meta 2.1. https://brasil.un.org/pt-br/sdgs/2

[5] BRASIL. Lei nº 15.224, de 30 de setembro de 2025. Política Nacional de Combate à Perda e ao Desperdício de Alimentos e Selo Doador de Alimentos. DOU, 1 out. 2025. Texto e dados da norma na Câmara dos Deputados. https://www2.camara.leg.br/legin/fed/lei/2025/lei-15224-30-setembro-2025-798048-publicacaooriginal-176570-pl.html

[6] SESC. Sesc Mesa Brasil. https://www.sesc.com.br/assistencia/sesc-mesa-brasil/

[7] TOO GOOD TO GO. About us. Descrição do modelo de negócio. https://www.toogoodtogo.com/en-us/about-us

[8] COMIDA INVISÍVEL. Plataforma oficial. Seções Como funciona e Cadastre sua ONG. https://app.comidainvisivel.com.br/

[9] BRASIL. Ministério da Fazenda e Receita Federal. Receita Federal gera o primeiro CNPJ em formato alfanumérico. 31 jul. 2026. https://www.gov.br/fazenda/pt-br/assuntos/noticias/2026/julho/receita-federal-gera-o-primeiro-cnpj-em-formato-alfanumerico

[10] BRASIL. Lei nº 13.709, de 14 de agosto de 2018. Lei Geral de Proteção de Dados Pessoais. Texto atualizado, Câmara dos Deputados. https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html

[11] ANVISA. Resolução RDC nº 216, de 15 de setembro de 2004. Regulamento Técnico de Boas Práticas para Serviços de Alimentação. Ministério da Saúde. https://bvsms.saude.gov.br/bvs/saudelegis/anvisa/2004/res0216_15_09_2004.html

[12] FAO. The State of Food and Agriculture 2020. Tabela 1, pegada hídrica de grupos de alimentos. https://digitallibrary.un.org/record/3930108/files/cb1447en.pdf

[13] REDE ALIMENTAMS. Etapa 4, schema e código-fonte, README, suíte backend/test, registros de progresso e resultado de carga. Documentos locais do projeto, 2026.

---

## Apêndice A — Como executar

Pré-requisito: Docker Desktop.

1. Na pasta do projeto: `docker compose up -d --build`.
2. Abrir http://localhost:3000.
3. Entrar com as contas de demonstração (senha `123456`): doador `comper@demo.com`; entidade `esperanca@demo.com`.

Testes: ver README ("Testes"). Análise da proposta comparada ao que foi entregue: `docs/CONFORMIDADE.md`.

## Apêndice B — Capturas de tela

> [GRUPO] Inserir as capturas definitivas: login, painel, publicação, lista da entidade, reserva com QR, confirmação com checklist, comprovante, verificação pública, notificações e "Meus números".
