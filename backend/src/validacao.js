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

module.exports = { ErroValidacao, corpo, texto, opcao, email, senha, cnpj, CATEGORIAS, quantidade, data, id, codigo };
