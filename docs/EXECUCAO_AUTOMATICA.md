# Execução automática: Codex → Claude

Na raiz do projeto, em um terminal do VS Code:

```powershell
.\agentes.cmd diagnostico
.\agentes.cmd iniciar
```

Também funciona sem o atalho: `node scripts/agentes/cli.mjs iniciar`.
Requisitos: Node.js 20 ou superior, Git, Codex CLI e Claude Code autenticados,
PostgreSQL/PostGIS local e dependências do backend. Diagnóstico não chama modelos.
O controlador encontra o executável nativo do Claude instalado via npm no Windows,
sem executar o atalho PowerShell bloqueado pela política de scripts.

Para preparar um banco de testes separado, abra o Docker Desktop e aguarde o
engine iniciar. Depois execute na raiz:

```powershell
.\agentes.cmd banco
.\agentes.cmd diagnostico
.\agentes.cmd iniciar
```

O primeiro comando usa `docker-compose.test.yml`, baixa a imagem se necessário,
sobe só PostgreSQL/PostGIS e aguarda o healthcheck. A porta 5433 é publicada
apenas em 127.0.0.1. Projeto/volume de testes são separados do Compose da aplicação.
O controlador fornece `TEST_DATABASE_URL` e `DATABASE_URL` de testes para ambas
as CLIs e para `npm test`; o L00 ainda implementa a guarda de reset no harness.
Não use `down -v` no Compose da aplicação para preparar os testes.

As abas interativas abertas não são controladas pelo script. Não deixe outro
Codex/Claude editando esta pasta enquanto o controlador estiver ativo. A pasta
e o histórico de arquivos são compartilhados; conversas e limites não são.

## Comandos

| Comando | Efeito |
|---|---|
| `.\agentes.cmd banco` | Sobe apenas o banco descartável de testes pelo Docker |
| `.\agentes.cmd iniciar` | Inicia ou continua; não ignora bloqueios anteriores |
| `.\agentes.cmd status` | Mostra lote, ferramenta, próximo horário e motivo de parada |
| `.\agentes.cmd parar` | Solicita interrupção; o processo filho é encerrado antes de liberar a pasta |
| `.\agentes.cmd retomar` | Retoma após você corrigir um bloqueio |
| `.\agentes.cmd diagnostico` | Verifica executáveis e autenticação sem enviar prompts |
| `.\agentes.cmd testar` | Roda testes locais do controlador, com provedores simulados |

`Ctrl+C` também solicita parada. Aguarde o controlador confirmar o encerramento
antes de abrir outra execução. Se a árvore de processos não puder ser encerrada,
ele mantém a trava e exige verificação manual; não presume que a pasta está livre.

## Hierarquia e relógio

1. Codex executa as etapas até informar cota esgotada.
2. Claude assume a etapa pendente e continua até sua própria cota esgotar.
3. Com ambos limitados, o controlador espera 60 minutos e começa por Codex.
4. Se Codex continuar limitado, tenta Claude. Se ambos falharem por cota, repete
   a espera. Não há limite de ciclos de cota enquanto houver trabalho pendente.

Exceção autorizada: se Codex retornar `blocked` com `block_reason: tool_unavailable`
e evidência de ferramenta ausente ou desconectada, o controlador salva o trabalho
e transfere a etapa pendente ao Claude uma única vez por lote. Claude verifica
se possui acesso autorizado (inclusive conexão à extensão Claude no Edge), executa
o roteiro restante e registra evidências. A extensão instalada não comprova conexão
com a CLI. Testes e revisão continuam obrigatórios antes da integração.

A transferência persiste entre retomadas, não marca cota esgotada e não ocorre
se Claude já estiver limitado. Se Claude também não conseguir, o controlador para.
Negativa de permissão (`permission_denied`), bloqueio antigo sem classificação,
falta de evidência, banco, login e erros de CLI continuam bloqueando. Não
reclassificar negativas históricas como ferramenta ausente para provocar a troca.
Para solicitar explicitamente uma retomada pelo Claude com sua própria conexão
autorizada à extensão, use `agentes.cmd retomar --claude`. O controlador registra
a escolha, preserva o diagnóstico anterior e seleciona Claude sem simular cota.
Isso não autoriza contornar negativas de acesso. Se Claude também receber uma
negativa, a execução para. Não há aceite visual até o roteiro ser executado.

O adaptador Claude habilita a integração da extensão com `--chrome`, confirmado
no `--help` da CLI instalada. O nome dessa opção é da CLI; a compatibilidade e
conexão com a extensão instalada no Edge precisam ser verificadas na execução.
`claude.chrome: false` desativa a integração na configuração. O comando retomar
deve ser executado pelo operador, com nenhum outro executor ativo.

Claude não é interrompido para sondar Codex. Cada tentativa é uma execução real
do trabalho pendente, sem chamadas extras de sondagem. Datas explícitas e
estruturadas de renovação podem antecipar a próxima tentativa. Sem elas, o
controlador usa uma hora; não calcula uma nova janela de cinco horas apenas
porque houve resposta. Limites semanais continuam valendo.

Há aviso no console e sinal sonoro ao entrar em espera e aviso periódico durante
chamadas com atividade. O som depende do terminal; não é notificação push nem
alarme do Windows. Horários são gravados em ISO UTC e exibidos no fuso da máquina.
Computador deve ficar ligado, sem suspensão, e o terminal precisa permanecer
aberto. Este comando não instala serviço nem agenda execução após reinicialização;
após reiniciar o PC, execute o mesmo comando para continuar.

## Permissões desta instalação

Conforme a escolha do usuário, o adaptador Claude está em `native` com
`bypassPermissions`: usa `--dangerously-skip-permissions`, igual à aba manual.
Isso dá acesso da conta Windows e **não é sandbox limitada ao projeto**.
Regras, revisão e verificação de arquivos protegidos reduzem erros, mas não
impedem nem desfazem comandos externos. Não há isolamento de sistema operacional
implementado neste controlador.

Codex usa `workspace-write` e `approval_policy=never`: não solicita aprovação
humana; uma operação não autorizada pode ser negada e bloquear o trabalho. Não
remove sandbox nem contorna regras administradas. O modo do Claude não amplia as
permissões desta sessão do Codex.

Para Claude voltar ao modo de permissões configuradas no projeto, crie
`.agentes/config.local.json`:

```json
{
  "claude": {
    "permissionMode": "dontAsk"
  }
}
```

`dontAsk` nega o que exigiria confirmação e não equivale a isolamento por pasta.
Autenticação expirada, comandos negados, falhas de banco, rede, travamento e
resposta inválida provocam parada com diagnóstico. Não são classificados como
cota e não disparam alternância infinita. Não é possível garantir execução sem
intervenção diante de todo erro de ambiente.

## Modelos e configuração

`scripts/agentes/config.json` contém os padrões. `.agentes/config.local.json`
sobrescreve apenas os campos locais, sem versionar credenciais. Padrões: Codex
`gpt-6.1-sol` medium/high conforme risco; Claude Sonnet, Opus para revisão.
Aliases do Claude são registrados como solicitados; modelo efetivo é registrado
quando a CLI o informa. Não há substituição silenciosa de configuração pelo
controlador; limitações ou escolhas internas do cliente aparecem nos logs quando
ele as expõe. Confirme disponibilidade em sua conta.

Configurações de tempo: `retryMinutes` e `heartbeatMinutes` = 60;
`idleTimeoutMinutes` = 45; `callTimeoutMinutes` = 120;
`testTimeoutMinutes` = 15; `maxNoProgress` = 3; `maxFixRounds` = 2.
Uma chamada muito demorada pode ser interrompida por esses limites, sem ser
tratada como cota. Ajuste os valores locais quando houver evidência de necessidade.

Banco: antes da primeira noite, confira PostgreSQL/PostGIS na porta 5433.
O L00 cria o harness e deve usar banco descartável `alimentams_test`, recusando
reset de desenvolvimento/produção. Pode fornecer a conexão de teste ao terminal
por `TEST_DATABASE_URL` ou `testDatabaseUrl` na configuração local; o nome deve ser
`alimentams_test` ou `alimentams_test_<sufixo>`. A URL padrão contém apenas as
credenciais locais descartáveis do Compose de testes. Não inclua credenciais reais
no Git. Sem banco funcional, o
executor deve registrar bloqueio, em vez de inventar resultados.

## Progresso, Git e revisão

- `.agentes/estado.json`: fila executada, fase, ferramenta preferida, modelos,
  horários, testes, próxima tentativa e histórico das chamadas.
- `.agentes/eventos.jsonl`: eventos do controlador.
- `.agentes/execucoes/`: saídas locais das CLIs e testes; podem conter conteúdo
  do projeto e não são versionadas. Não compartilhar sem revisão.
- `docs/agentes/progresso/`, `LOG.md` e `REVISAO_*.md`: evidências compartilhadas
  produzidas pelos executores/revisores e preservadas nos commits.

Não edite estado ou configuração enquanto o controlador estiver rodando.
A trava `.agentes/execucao.lock` impede dois controladores; não impede uma pessoa
de abrir outro agente manualmente. Trava antiga só é removida automaticamente se
os PIDs registrados não estiverem ativos e não houver encerramento incerto.

Na primeira execução, se não houver Git, cria `main`, baseline e tag `baseline`.
Em repositório existente, exige primeira execução limpa na `main` e preserva
histórico. Commits automáticos usam identidade explícita por comando
`Rede AlimentaMS Automacao <automacao@localhost>`, sem mudar sua configuração Git.
O controlador salva commits parciais ao fim de cada chamada, inclusive por cota.
O agente salva checklists durante a chamada. Corte abrupto ainda pode deixar
alterações sem commit: elas são preservadas para reconciliação na retomada.

Cada lote tem branch própria. O controlador roda `npm test` no backend antes de
concluir; lotes críticos passam por outra chamada de revisão. O revisor registra
achados; código alterado pelo revisor provoca parada. Testes verdes não garantem
ausência de bugs e a revisão não é uma barreira de segurança do sistema operacional.
Merge na main ocorre só após os gates previstos. Integração interrompida pode ser
retomada sem refazer uma chamada já aprovada.

A fila versionada está em `scripts/agentes/fila.json`: L00, L01, L07, L02, L04,
L05, L08-nucleo, L03, L06, L08-complemento e FINAL. X1–X3 não entram automaticamente.
O estado guarda uma cópia da fila; alterar o arquivo depois de iniciar não muda
silenciosamente o que está em andamento. Mudanças de escopo exigem planejamento
com o controlador parado. Ao concluir a fila, ele encerra: não inventa novas
tarefas para continuar gastando cota. Deploy, revisão humana e entrega continuam
com o grupo, conforme o plano.

## Verificações antes de deixar rodando

Rode diagnóstico e acompanhe o primeiro lote. Os testes do controlador são
offline: simulam limites, alternância, revisão, bloqueios e retomada, sem provar
que a conta possui cota ou que o banco está pronto. Falha real ainda não conhecida
deve interromper para inspeção, não ser convertida automaticamente em cota.

Referências: [OpenAI Docs — modo não interativo](https://learn.chatgpt.com/docs/non-interactive-mode),
[Claude Code — execução programática](https://code.claude.com/docs/en/headless),
[Docker Compose — iniciar e aguardar serviços](https://docs.docker.com/reference/cli/docker/compose/up/).
