// Somente erros deste tipo são apresentados como entrada inválida.
class ErroValidacao extends Error {}

function falhar(mensagem) { throw new ErroValidacao(mensagem); }

function corpo(valor, campos) {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor))
    falhar('O corpo da requisição deve ser um objeto JSON.');
  if (Object.keys(valor).some((campo) => !campos.includes(campo)))
    falhar('A requisição contém campos não permitidos.');
  return valor;
}

function texto(valor, campo, maximo) {
  if (typeof valor !== 'string') falhar(`${campo} deve ser texto.`);
  const normalizado = valor.trim();
  if (!normalizado) falhar(`${campo} é obrigatório(a).`);
  if (normalizado.length > maximo || normalizado.includes('\0'))
    falhar(`${campo} deve ter no máximo ${maximo} caracteres, sem caractere nulo.`);
  return normalizado;
}

function opcao(valor, campo, opcoes) {
  const normalizado = texto(valor, campo, 80);
  if (!opcoes.includes(normalizado)) falhar(`${campo} inválido(a).`);
  return normalizado;
}

function email(valor) {
  const normalizado = texto(valor, 'E-mail', 254).toLowerCase();
  const partes = normalizado.split('@');
  const local = partes[0], dominio = partes[1];
  if (partes.length !== 2 || local.length > 64 ||
      !/^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/.test(local) ||
      !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(dominio || ''))
    falhar('E-mail inválido.');
  return normalizado;
}

function senha(valor, minimo = 6) {
  if (typeof valor !== 'string' || !valor.trim() || valor.includes('\0') ||
      valor.length < minimo || Buffer.byteLength(valor, 'utf8') > 72)
    falhar(`A senha deve ter ao menos ${minimo} caracteres e no máximo 72 bytes, sem caractere nulo.`);
  return valor;
}

function cnpj(valor) {
  const entrada = texto(valor, 'CNPJ', 18);
  if (!/^(?:\d{14}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})$/.test(entrada)) falhar('CNPJ inválido.');
  const digitos = entrada.replace(/\D/g, '');
  if (/^(\d)\1{13}$/.test(digitos)) falhar('CNPJ inválido.');
  for (const tamanho of [12, 13]) {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(digitos[i]) * ((tamanho - 1 - i) % 8 + 2);
    const resto = soma % 11;
    if (Number(digitos[tamanho]) !== (resto < 2 ? 0 : 11 - resto)) falhar('CNPJ inválido.');
  }
  return digitos;
}

const CATEGORIAS = ['Hortifrúti', 'Panificados', 'Laticínios', 'Refeições prontas', 'Não perecíveis'];
function quantidade(valor) {
  if (typeof valor === 'string') {
    const entrada = texto(valor, 'Quantidade', 16);
    if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(entrada)) falhar('Quantidade inválida. Use até duas casas decimais.');
    valor = Number(entrada);
  }
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0 || valor > 10000 ||
      Math.abs(valor * 100 - Math.round(valor * 100)) > 1e-7)
    falhar('Quantidade inválida: informe mais de zero e até 10.000 kg, com até duas casas decimais.');
  // Impede arredondamento para zero pelo NUMERIC(10,2).
  if (Math.round(valor * 100) === 0) falhar('A quantidade mínima é 0,01 kg.');
  return valor;
}

function data(valor) {
  const entrada = texto(valor, 'Data de validade', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entrada) || entrada.startsWith('0000-')) falhar('Data de validade inválida.');
  const instante = new Date(entrada + 'T00:00:00Z');
  if (!Number.isFinite(instante.getTime()) || instante.toISOString().slice(0, 10) !== entrada)
    falhar('Data de validade inválida.');
  return entrada;
}

// Data e hora local de Campo Grande, sem fuso: AAAA-MM-DDTHH:MM (fim do dia = 00:00 do dia seguinte).
function dataHora(valor, campo) {
  const entrada = texto(valor, campo, 16);
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(entrada);
  if (!m) falhar(`${campo} inválido(a). Use o formato AAAA-MM-DDTHH:MM.`);
  const hora = Number(m[2]), minuto = Number(m[3]);
  const instante = new Date(m[1] + 'T00:00:00Z');
  if (m[1].startsWith('0000-') || !Number.isFinite(instante.getTime()) ||
      instante.toISOString().slice(0, 10) !== m[1] || hora > 23 || minuto > 59)
    falhar(`${campo} inválido(a).`);
  return entrada;
}

// Decodifica base64 puro (sem prefixo data:) com limite de tamanho; o chamador identifica o tipo pela assinatura.
function bytesBase64(valor, maximo, mensagemTamanho, mensagemInvalida) {
  const maximoBase64 = Math.ceil(maximo / 3) * 4;
  if (valor.length > maximoBase64) falhar(mensagemTamanho);
  if (valor.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(valor)) falhar(mensagemInvalida);
  const dados = Buffer.from(valor, 'base64');
  if (dados.length > maximo) falhar(mensagemTamanho);
  return dados;
}
const ehJpeg = (d) => d.length >= 3 && d[0] === 0xff && d[1] === 0xd8 && d[2] === 0xff;
const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ehPng = (d) => d.length > ASSINATURA_PNG.length && d.subarray(0, 8).equals(ASSINATURA_PNG);
const ehPdf = (d) => d.length > 8 && /^%PDF-[12]\.\d/.test(d.subarray(0, 8).toString('latin1'));

// Foto do lote (L03): base64 puro de JPEG ou PNG, até 400 KB. O tipo vem da assinatura dos bytes,
// nunca do que o cliente declara. Ausente ou null = lote sem foto.
const FOTO_MAX_BYTES = 400 * 1024;
function foto(valor) {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'string' || !valor) falhar('A foto deve ser uma imagem JPEG ou PNG em base64.');
  const dados = bytesBase64(valor, FOTO_MAX_BYTES, 'A foto deve ter no máximo 400 KB.',
    'Foto inválida: envie a imagem JPEG ou PNG em base64, sem prefixo.');
  if (ehJpeg(dados)) return { dados, tipo: 'image/jpeg' };
  if (ehPng(dados)) return { dados, tipo: 'image/png' };
  return falhar('O arquivo enviado não é uma imagem JPEG ou PNG válida.');
}

// Comprovante de entidade sem fins lucrativos (L06): PDF, JPEG ou PNG em base64, até 1 MB, tipo pela assinatura.
const COMPROVANTE_MAX_BYTES = 1024 * 1024;
function comprovante(valor) {
  if (typeof valor !== 'string' || !valor) falhar('O comprovante deve ser um arquivo PDF, JPEG ou PNG em base64.');
  const dados = bytesBase64(valor, COMPROVANTE_MAX_BYTES, 'O comprovante deve ter no máximo 1 MB.',
    'Comprovante inválido: envie o arquivo PDF, JPEG ou PNG em base64, sem prefixo.');
  if (ehPdf(dados)) return { dados, tipo: 'application/pdf' };
  if (ehJpeg(dados)) return { dados, tipo: 'image/jpeg' };
  if (ehPng(dados)) return { dados, tipo: 'image/png' };
  return falhar('O arquivo enviado não é um PDF, JPEG ou PNG válido.');
}

// Telefone brasileiro: aceita máscara e +55; guarda só DDD + número (10 ou 11 dígitos).
function telefone(valor) {
  const entrada = texto(valor, 'Telefone', 20);
  if (!/^(?:\+?55\s?)?(?:\(\d{2}\)|\d{2})\s?\d{4,5}-?\d{4}$/.test(entrada)) falhar('Telefone inválido. Informe DDD e número.');
  let digitos = entrada.replace(/\D/g, '');
  if (digitos.length > 11 && digitos.startsWith('55')) digitos = digitos.slice(2);
  if (!/^[1-9]\d[2-9]\d{7,8}$/.test(digitos) || (digitos.length === 11 && digitos[2] !== '9'))
    falhar('Telefone inválido. Informe DDD e número.');
  return digitos;
}

// O aceite do Termo de Responsabilidade e da Política de Privacidade só vale como o booleano true.
function aceite(valor) {
  if (valor !== true)
    falhar('É obrigatório aceitar o Termo de Responsabilidade e a Política de Privacidade.');
  return true;
}

function id(valor) {
  if (typeof valor !== 'string' || !/^[1-9]\d{0,9}$/.test(valor) || Number(valor) > 2147483647)
    falhar('ID inválido: informe um inteiro positivo.');
  return Number(valor);
}

function codigo(valor) {
  const normalizado = texto(valor, 'Código de retirada', 8);
  if (!/^\d{6}$/.test(normalizado)) falhar('Código de retirada inválido: informe seis dígitos.');
  return normalizado;
}

module.exports = { ErroValidacao, corpo, texto, opcao, email, senha, cnpj, CATEGORIAS, quantidade, data, dataHora, foto, FOTO_MAX_BYTES, comprovante, COMPROVANTE_MAX_BYTES, telefone, aceite, id, codigo };
