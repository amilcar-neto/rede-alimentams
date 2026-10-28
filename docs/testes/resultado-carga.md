# Resultado de carga local — L08-complemento

Gerado por `node test/carga.mjs` em 2026-10-28T08:16:22.092Z (UTC).
Resultado: **PASSOU**. Servidor filho e conexão ao banco encerrados.

## Ambiente e método

- Node v24.19.0; win32 10.0.19045 x64; 16 CPUs disponíveis.
- Express/PostgreSQL/PostGIS locais, banco exclusivo permitido por `testConnection()`, recriado de `db/init.sql`. Sem VPS e sem dados reais.
- Servidor filho próprio em 127.0.0.1:3101, sem servidor preexistente; execução isolada, sem npm test simultâneo.
- Para cada N: N buscas GET /lotes; depois N PUT de reserva disputam um novo lote de 50 kg. Duas contas sintéticas próximas alternadas. Total previsto: 440 requisições medidas.
- Logins, publicação e consultas SQL ficam fora da medição. As ondas são sequenciais; dentro de cada onda, Promise.all dispara todas as requisições sem aguardar respostas anteriores.
- Latência por requisição inclui HTTP e leitura/parse do JSON; média aritmética e p95 pelo posto ceil(0,95 × N). Duração é o tempo total da onda. Sem aquecimento dedicado ou repetição estatística.
- HTTP 409 na disputa é conflito esperado, separado de erros inesperados (outros status, falha de rede/timeout/JSON). Prazo por requisição: 30 s.

## Medições reais

| Operação | Simultâneas | Média (ms) | p95 (ms) | Onda (ms) | Status | Erros inesperados | 1 reserva venceu |
|---|---:|---:|---:|---:|---|---:|---|
| busca | 20 | 115.62 | 124.01 | 130.22 | {"200":20} | 0 | não se aplica |
| reserva | 20 | 42.42 | 45.01 | 51.85 | {"200":1,"409":19} | 0 | sim |
| busca | 200 | 308.76 | 332.97 | 379.16 | {"200":200} | 0 | não se aplica |
| reserva | 200 | 277.36 | 325.56 | 333.90 | {"200":1,"409":199} | 0 | sim |

Unicidade conferida também no PostgreSQL: status reservado, receptora igual à conta da requisição vencedora, exatamente um evento reservado e uma notificação de reserva ao doador por lote medido.

## Limites e reprodução

Em backend/, com TEST_DATABASE_URL para banco local alimentams_test (ou sufixo permitido), executar `node test/carga.mjs`. O comando **recria integralmente esse banco descartável** e sobrescreve este relatório; não executar junto com npm test ou demonstração no mesmo banco. Recusa desenvolvimento/produção antes de conectar. Não lê .env.

São requisições concorrentes do mesmo cliente/processo e máquina, com dois usuários, sem conexões WebSocket abertas. Não representam 200 usuários/dispositivos independentes, distribuição pela rede, capacidade do VPS ou garantia de SLA. O campo “1 reserva venceu” significa uma requisição ganhadora; não é expiração de janela. QR pelo celular, prints, HTTPS/rede externa e ensaio humano permanecem pendentes nos roteiros.
