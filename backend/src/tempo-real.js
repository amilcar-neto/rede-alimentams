// Entrega em tempo real (WebSocket em /ws). A fonte de verdade é a tabela notificacoes:
// o servidor grava o destinatário na mesma instrução da transição e este módulo só empurra
// o que já foi confirmado. Falha de envio nunca desfaz nem falha a operação.
const jwt = require('jsonwebtoken');
const { WebSocketServer } = require('ws');

const PRAZO_AUTENTICACAO_MS = 5000;
const MAX_CONEXOES_POR_USUARIO = 5;
const CODIGO_LIMITE_SESSOES = 4001; // próprio: o front não reconecta, senão as abas se expulsariam em ciclo
const INTERVALO_PING_MS = 30000;
const MAX_TIMER_MS = 2 ** 31 - 1;
const TIPOS = ['lote_publicado', 'lote_liberado', 'lote_reservado', 'retirada_confirmada'];

// Colunas devolvidas pelas instruções que criam notificações (RETURNING).
const COLUNAS = 'id, usuario_id, lote_id, tipo, urgente, mensagem, criado_em';

// Sem JWT, código de retirada ou cadastro das partes: só o que a central de notificações mostra.
function paraCliente(n) {
  return {
    id: n.id, tipo: n.tipo, urgente: n.urgente === true, mensagem: n.mensagem,
    lote_id: n.lote_id, criado_em: n.criado_em, lida: false,
  };
}

function valida(n) {
  return n && Number.isInteger(n.usuario_id) && Number.isInteger(n.id) && TIPOS.includes(n.tipo);
}

// O primeiro frame é o JWT puro (opcionalmente com o prefixo "Bearer "), nunca na URL.
function extrairToken(dados, binario) {
  if (binario) return null;
  const texto = dados.toString('utf8').trim();
  const token = texto.startsWith('Bearer ') ? texto.slice(7).trim() : texto;
  return token && token.length <= 4096 ? token : null;
}

function criarTempoReal({ segredo, log = console.error }) {
  const conexoes = new Map(); // usuario_id → Set<WebSocket> já autenticados
  let wss = null;

  function registrar(ws, usuarioId) {
    let grupo = conexoes.get(usuarioId);
    if (!grupo) conexoes.set(usuarioId, grupo = new Set());
    grupo.add(ws);
    // Limite por usuário: a conexão mais antiga cede lugar.
    while (grupo.size > MAX_CONEXOES_POR_USUARIO) {
      const antiga = grupo.values().next().value;
      grupo.delete(antiga);
      antiga.close(CODIGO_LIMITE_SESSOES, 'Muitas conexões abertas para esta conta.');
    }
  }

  function remover(ws) {
    const grupo = conexoes.get(ws.usuarioId);
    if (!grupo) return;
    grupo.delete(ws);
    if (!grupo.size) conexoes.delete(ws.usuarioId);
  }

  function autenticar(ws, dados, binario) {
    clearTimeout(ws.prazo);
    const token = extrairToken(dados, binario);
    let usuario;
    try { usuario = token && jwt.verify(token, segredo); } catch { usuario = null; }
    if (!usuario || !Number.isInteger(usuario.id)) return ws.close(1008, 'Autenticação inválida.');
    ws.usuarioId = usuario.id;
    ws.autenticado = true;
    registrar(ws, usuario.id);
    // A sessão do WS não sobrevive ao JWT.
    const restante = (usuario.exp ?? 0) * 1000 - Date.now();
    ws.expiracao = setTimeout(() => ws.close(1008, 'Sessão expirada.'), Math.min(Math.max(restante, 0), MAX_TIMER_MS));
    ws.expiracao.unref?.();
    ws.send(JSON.stringify({ tipo: 'autenticado' }));
  }

  function anexar(servidor) {
    if (!servidor) return;
    wss = new WebSocketServer({ server: servidor, path: '/ws', maxPayload: 8192 });
    wss.on('error', (erro) => log('Erro no servidor WebSocket.', erro));
    wss.on('connection', (ws) => {
      ws.autenticado = false;
      ws.viva = true;
      ws.prazo = setTimeout(() => { if (!ws.autenticado) ws.close(1008, 'Autenticação necessária.'); },
        PRAZO_AUTENTICACAO_MS);
      ws.on('pong', () => { ws.viva = true; });
      ws.on('message', (dados, binario) => { if (!ws.autenticado) autenticar(ws, dados, binario); });
      ws.on('error', () => ws.terminate());
      ws.on('close', () => { clearTimeout(ws.prazo); clearTimeout(ws.expiracao); remover(ws); });
    });
    const batida = setInterval(() => {
      for (const ws of wss.clients) {
        if (!ws.viva) { ws.terminate(); continue; }
        ws.viva = false;
        try { ws.ping(); } catch { ws.terminate(); }
      }
    }, INTERVALO_PING_MS);
    batida.unref?.();
    wss.on('close', () => clearInterval(batida));
  }

  // Entrega cada notificação apenas às conexões do seu destinatário.
  function publicar(notificacoes) {
    try {
      for (const n of notificacoes || []) {
        if (!valida(n)) continue;
        const grupo = conexoes.get(n.usuario_id);
        if (!grupo) continue;
        const quadro = JSON.stringify(paraCliente(n));
        for (const ws of grupo) {
          if (ws.readyState === 1) ws.send(quadro, (erro) => { if (erro) ws.terminate(); });
        }
      }
    } catch (erro) {
      log('Falha ao enviar notificações em tempo real.', erro);
    }
  }

  function fechar() {
    for (const grupo of conexoes.values()) for (const ws of grupo) ws.terminate();
    conexoes.clear();
    wss?.close();
  }

  return { anexar, publicar, fechar, conexoes };
}

module.exports = { criarTempoReal, COLUNAS, TIPOS, paraCliente };
