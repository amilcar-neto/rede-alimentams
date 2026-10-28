const crypto = require('crypto');
const { isIP } = require('net');
const QRCode = require('qrcode');
const { corpo, ErroValidacao } = require('./validacao');

const ITENS = {
  embalagem_integra: 'Embalagem íntegra',
  temperatura_adequada: 'Temperatura adequada',
  dentro_validade: 'Dentro da validade',
};

function validarChecklist(valor) {
  corpo(valor, Object.keys(ITENS));
  if (Object.keys(ITENS).some((chave) => valor[chave] !== true))
    throw new ErroValidacao('Confirme os três itens do checklist sanitário.');
  return Object.fromEntries(Object.keys(ITENS).map((chave) => [chave, true]));
}

// Contrato v1: chaves ordenadas recursivamente, strings UTF-8 sem normalização extra,
// quantidade em string decimal (2 casas), instante ISO UTC com milissegundos.
function canonico(valor) {
  if (Array.isArray(valor)) return '[' + valor.map(canonico).join(',') + ']';
  if (valor !== null && typeof valor === 'object')
    return '{' + Object.keys(valor).sort().map((chave) => JSON.stringify(chave) + ':' + canonico(valor[chave])).join(',') + '}';
  return JSON.stringify(valor);
}
const hashDe = (dados) => crypto.createHash('sha256').update(canonico(dados), 'utf8').digest('hex');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function hostnameValido(hostname) {
  if (hostname.startsWith('[')) return isIP(hostname.slice(1, -1)) === 6;
  const nome = hostname.replace(/\.$/, '');
  return nome.length <= 253 && nome.split('.').every((parte) =>
    parte.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(parte));
}

// Limite conservador em bytes, abaixo da capacidade do QR em modo byte/M.
// Erro de configuração não deve ser apresentado como entrada inválida do usuário.
function limitarURL(url) {
  if (Buffer.byteLength(url, 'utf8') > 1024) {
    if (process.env.BASE_URL) throw new Error('BASE_URL excede o limite de 1024 bytes do link QR.');
    throw new ErroValidacao('Endereço da requisição inválido.');
  }
  return url;
}

function baseURL(req) {
  const configurada = process.env.BASE_URL;
  const host = configurada ? null : req.get('host');
  // Host deve conter somente autoridade, sem caminho, credenciais ou espaços.
  if (!configurada && (typeof host !== 'string' || host.length > 260
      || !/^(?:\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::[0-9]{1,5})?$/i.test(host)))
    throw new ErroValidacao('Endereço da requisição inválido.');
  const entrada = limitarURL(configurada || `${req.protocol}://${host}`);
  let base;
  try { base = new URL(entrada); }
  catch (e) {
    if (configurada) throw new Error('BASE_URL inválida.');
    throw new ErroValidacao('Endereço da requisição inválido.');
  }
  if (!['http:', 'https:'].includes(base.protocol) || !hostnameValido(base.hostname)
      || (!configurada && !hostnameValido(host.replace(/:\d+$/, '')))
      || base.username || base.password || base.search || base.hash) {
    if (configurada) throw new Error('BASE_URL deve ser uma URL HTTP(S) com hostname válido, sem credenciais, query ou fragmento.');
    throw new ErroValidacao('Endereço da requisição inválido.');
  }
  return limitarURL(base.href.replace(/\/$/, ''));
}

const urlQR = (req, caminho) => limitarURL(baseURL(req) + caminho);

const png = (url) => QRCode.toBuffer(url, { type: 'png', width: 280, margin: 4, errorCorrectionLevel: 'M' });
const dataLocal = (iso) => new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Campo_Grande', dateStyle: 'short', timeStyle: 'medium',
}).format(new Date(iso));

async function paginaComprovante(doacao, url) {
  const c = doacao.comprovante;
  if (hashDe(c) !== doacao.hash) throw new Error('Falha de integridade no comprovante.');
  const qr = (await png(url)).toString('base64');
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Comprovante de doação #${esc(doacao.id)}</title><style>
body{font:16px system-ui,sans-serif;color:#172c1a;max-width:760px;margin:30px auto;padding:20px}
h1{color:#1b5e20}dt{font-weight:bold;margin-top:12px}dd{margin:4px 0}code{overflow-wrap:anywhere}img{width:220px;max-width:100%}
@media print{body{margin:0;padding:0;font-size:12pt}.orientacao{display:none}a{color:inherit;text-decoration:none}}
</style><h1>Comprovante Digital de Doação</h1><p>Registro #${esc(doacao.id)} · Lote #${esc(c.lote_id)}</p><dl>
<dt>Doador</dt><dd>${esc(c.doador.nome)} · CNPJ: ${esc(cnpjBR(c.doador.cnpj))}</dd>
<dt>Entidade receptora</dt><dd>${esc(c.receptora.nome)} · CNPJ: ${esc(cnpjBR(c.receptora.cnpj))}</dd>
<dt>Alimento / quantidade</dt><dd>${esc(c.alimento)} · ${esc(kgBR(c.quantidade_kg))} kg</dd>
<dt>Data e hora (Campo Grande)</dt><dd>${esc(dataLocal(c.data_hora))}</dd>
<dt>Código da retirada</dt><dd>${esc(c.codigo)}</dd></dl>
<h2>Checklist sanitário confirmado</h2><ul>${Object.values(ITENS).map((nome) => `<li>${nome}: sim</li>`).join('')}</ul>
<h2>Verificação de integridade</h2><p>SHA-256: <code>${esc(doacao.hash)}</code></p>
<p>O hash permite verificar a integridade do registro. Não é certificado ICP-Brasil.</p>
<img alt="QR de verificação do comprovante" src="data:image/png;base64,${qr}"><p><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Verificar comprovante</a></p>
<details><summary>JSON canônico usado no hash (v1)</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(canonico(c))}</pre></details>
<p class="orientacao">Para imprimir ou salvar em PDF, use Imprimir no navegador (Ctrl+P).</p></html>`;
}

// Exibição em pt-BR (o hash continua calculado sobre o JSON canônico, que não muda).
const cnpjBR = (d) => String(d ?? '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
const kgBR = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

function paginaVerificacao(doacao) {
  // Exceção pública deliberada: não revelar nomes, CNPJs, IDs das partes, código,
  // alimento ou instante exato. O hash funciona como identificador não enumerável.
  if (hashDe(doacao.comprovante) !== doacao.hash) throw new Error('Falha de integridade no comprovante.');
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Verificação de comprovante</title><body style="font:18px system-ui;max-width:720px;margin:32px auto;padding:20px">
<h1>Comprovante válido</h1><p>Doação registrada com checklist sanitário completo.</p>
<p>Quantidade: ${esc(kgBR(doacao.comprovante.quantidade_kg))} kg.</p>
<p>Hash SHA-256: <code style="overflow-wrap:anywhere">${esc(doacao.hash)}</code></p>
<p>Integridade do registro verificada. Não é certificado ICP-Brasil.</p></body></html>`;
}

module.exports = { validarChecklist, canonico, hashDe, baseURL, urlQR, png, paginaComprovante, paginaVerificacao };
