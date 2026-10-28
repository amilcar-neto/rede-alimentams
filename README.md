# Rede AlimentaMS – MVP

Plataforma que conecta estabelecimentos doadores a entidades receptoras.
Stack: Node.js + Express, PostgreSQL + PostGIS, JWT + bcrypt, Docker.

## Continuar o desenvolvimento automaticamente

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
Pré-requisitos, retomada, limites e testes em [Execução automática](docs/EXECUCAO_AUTOMATICA.md).

## Como rodar
Pré-requisito: Docker Desktop (ou Docker + Compose no Linux).

```bash
docker compose up --build
```
Abra http://localhost:3000

Para zerar o banco e recriar os dados de demonstração:
```bash
docker compose down -v && docker compose up --build
```

## Contas de demonstração (senha: 123456)
| Perfil | E-mail |
|---|---|
| Doador | comper@demo.com / sabor@demo.com / pao@demo.com |
| Receptora | esperanca@demo.com / amambai@demo.com |
| Receptora fora do raio de 10 km | longe@demo.com |

## Roteiro de demonstração
1. Entre como **Doador (Comper)** e publique um lote.
2. Entre como **ONG (Casa Esperança)**: o lote aparece ordenado por validade e distância. Clique em *Reservar retirada* e veja o código de 6 dígitos.
3. Volte ao **Doador**, digite o código e clique em *Confirmar retirada*.
4. Veja a doação em *Doações registradas* e os indicadores atualizados.
5. Teste as validações: quantidade 0 ou data vencida (Cenário 2). Entre como `longe@demo.com` e veja que nenhum lote aparece (raio de 10 km, PostGIS).

## API
| Método | Rota | Perfil |
|---|---|---|
| POST | /auth/register, /auth/login | público |
| GET | /lotes | doador / receptora |
| POST | /lotes | doador |
| PUT | /lotes/:id/reservar | receptora |
| PUT | /lotes/:id/confirmar-retirada | doador |
| GET | /doacoes, /indicadores | autenticado |
