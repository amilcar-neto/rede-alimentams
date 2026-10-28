# Progresso compartilhado

O controlador cria seu estado em `.agentes/estado.json` na primeira execução.
Checklists dos lotes, LOG.md e relatórios de revisão serão criados aqui pelos
agentes conforme o trabalho ocorrer. Nada foi declarado concluído antecipadamente.

Comandos e configuração: [Execução automática](../EXECUCAO_AUTOMATICA.md).

## Desenvolvimento com agentes (bastidores do projeto)

No terminal, na raiz do projeto:

```powershell
.\agentes.cmd diagnostico
.\agentes.cmd iniciar
```

Se faltar o banco na porta 5433, abra o Docker Desktop e execute
`.\agentes.cmd banco`; depois repita o diagnóstico. Isso prepara um banco
de testes separado do banco da aplicação.

O controlador usa Codex até atingir o limite, depois Claude até o limite; com
ambos limitados, espera uma hora e tenta Codex primeiro. Estado persiste entre
execuções. Use `.\agentes.cmd status` e `.\agentes.cmd parar` em outro terminal.
Não deixe agentes manuais editando a pasta ao mesmo tempo.

O Claude está configurado no modo nativo sem pedidos de permissão, conforme
escolha do usuário: isso dá acesso da conta Windows, não isolamento à pasta.
Pré-requisitos, retomada, limites e testes em [Execução automática](../EXECUCAO_AUTOMATICA.md).
