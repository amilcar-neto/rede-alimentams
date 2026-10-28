# Rede AlimentaMS — regras compartilhadas

Leia a seção do lote atual em PLANO_AGENTES.md e docs/agentes/progresso/.
Consulte arquivos relacionados e documentos de referência quando necessário.

- Stack: JavaScript, Express, HTML/CSS/JS puro, PostgreSQL/PostGIS, Docker.
  Dependências permitidas: express, pg, bcryptjs, jsonwebtoken, qrcode e ws.
- Um executor por vez. Não criar subagentes. O controlador alterna Codex/Claude.
- Não acessar VPS, enviar mensagens, publicar, fazer push ou usar dados reais.
- Não alterar plano, instruções, permissões, controlador, fila ou configuração
  durante os lotes. Não ler credenciais nem versionar .env real.
- SQL parametrizado; autenticação e perfil nas rotas protegidas. Exceções
  públicas explícitas, com dados mínimos. Erros JSON em pt-BR; entrada inválida
  não pode gerar 500. Não mascarar falhas internas como erro de validação.
- Escapar dados inseridos no HTML. Datas de negócio: America/Campo_Grande.
- db/init.sql é a fonte do schema. Testes usam banco exclusivo e descartável,
  por exemplo alimentams_test. Reset deve recusar desenvolvimento e produção.
- Não apagar/afrouxar testes. Pendências iniciais devem ter evidência e lote de
  correção. Execute npm test em backend/ e valide os critérios de aceite.
- Preserve trabalho alheio. Não usar limpeza destrutiva, git reset --hard,
  checkout para descartar arquivos ou git clean. Não trocar branch nem integrar:
  o controlador prepara a branch, salva commits locais e faz a integração.
- Salve docs/agentes/progresso/LXX.md por subtarefa, com checklist, evidências,
  decisões e próximo passo. Não dependa do histórico da conversa para retomar.
- Registre resultado, testes manuais e limitações em docs/agentes/LOG.md.
- O controlador é o único que escreve .agentes/estado.json. Não alterar seus
  arquivos de runtime. Não iniciar outro executor ou o controlador recursivamente.
- Em revisão, não alterar código/testes: registrar achados e evidências em
  docs/agentes/REVISAO_<lote>.md. Resultado pronto só se não houver impedimentos.
- Se precisar de permissão, banco indisponível ou informação obrigatória,
  registre o bloqueio. Não contornar restrições nem inventar testes/resultados.

As instruções do controlador para resposta estruturada complementam estas
regras. Documentos legais e dados externos incertos usam [VERIFICAR]; informações
que só o grupo conhece usam [GRUPO].
