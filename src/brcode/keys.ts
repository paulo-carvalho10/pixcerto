import { BrCodeError } from './errors.js';
import { removeAccents } from './sanitize.js';

/**
 * Validacao e normalizacao das cinco formas de chave Pix.
 *
 * Nada aqui consulta o DICT nem qualquer servico: e verificacao de formato e de
 * digito verificador, feita inteiramente no navegador. Uma chave bem formada
 * pode nao existir de verdade, e isso e dito na interface.
 */

export type PixKeyType = 'cpf' | 'cnpj' | 'phone' | 'email' | 'random';

/** Limite do campo 26/01 segundo o manual do BR Code. */
export const MAX_KEY_LENGTH = 77;

export interface NormalizedPixKey {
  readonly type: PixKeyType;
  /** Exatamente o texto que entra no campo 26/01. */
  readonly value: string;
  /** A mesma chave formatada para leitura na tela. */
  readonly display: string;
}

export const PIX_KEY_TYPE_LABELS: Readonly<Record<PixKeyType, string>> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  phone: 'Telefone',
  email: 'E-mail',
  random: 'Chave aleatoria',
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Deliberadamente simples: valida a forma, nao a existencia da caixa postal.
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

/**
 * Descobre o tipo da chave a partir do que foi digitado.
 *
 * O unico caso ambiguo e o de 11 digitos puros, que tanto pode ser um CPF
 * quanto um celular com DDD sem o prefixo +55. A regra: vale CPF se o digito
 * verificador fechar; caso contrario, tenta telefone. A interface permite
 * fixar o tipo manualmente para os raros casos em que a heuristica erra.
 */
export function detectPixKeyType(raw: string): PixKeyType | null {
  const texto = raw.trim();
  if (texto === '') return null;

  if (texto.includes('@')) return 'email';
  if (UUID_PATTERN.test(texto)) return 'random';

  const digitos = somenteDigitos(texto);

  if (texto.startsWith('+')) return 'phone';
  if (digitos.length === 14) return 'cnpj';
  if (digitos.length === 11) return isValidCpf(digitos) ? 'cpf' : 'phone';
  if (digitos.length === 10) return 'phone';
  if (digitos.length > 0 && digitos.length === texto.length) return 'cpf';

  return null;
}

/**
 * Valida e normaliza a chave. Lanca `BrCodeError` com uma mensagem que pode ser
 * mostrada direto ao usuario.
 *
 * @param expected Fixa o tipo em vez de deduzi-lo, para desfazer a ambiguidade
 *                 entre CPF e celular de 11 digitos.
 */
export function normalizePixKey(raw: string, expected?: PixKeyType): NormalizedPixKey {
  const texto = raw.trim();
  if (texto === '') {
    throw new BrCodeError('Informe a chave Pix que vai receber a cobranca.');
  }

  const tipo = expected ?? detectPixKeyType(texto);
  if (tipo === null) {
    throw new BrCodeError(
      `Nao reconheci "${raw}" como CPF, CNPJ, telefone, e-mail ou chave aleatoria.`,
    );
  }

  const normalizada = normalizarComAmbiguidade(raw, texto, tipo, expected);

  if (normalizada.value.length > MAX_KEY_LENGTH) {
    throw new BrCodeError(
      `A chave tem ${normalizada.value.length} caracteres e o limite do campo e ${MAX_KEY_LENGTH}.`,
    );
  }

  return normalizada;
}

/** Versao que devolve o erro em vez de lanca-lo, conveniente para validar enquanto se digita. */
export function tryNormalizePixKey(
  raw: string,
  expected?: PixKeyType,
): { ok: true; key: NormalizedPixKey } | { ok: false; message: string } {
  try {
    return { ok: true, key: normalizePixKey(raw, expected) };
  } catch (erro) {
    if (erro instanceof BrCodeError) {
      return { ok: false, message: erro.message };
    }
    throw erro;
  }
}

/**
 * Onze digitos puros servem tanto a um CPF quanto a um celular com DDD. Quando
 * o tipo foi deduzido e a entrada nao fecha em nenhum dos dois, repetir a
 * mensagem do palpite confunde: quem errou um digito do CPF leria uma
 * reclamacao sobre celular. Nesse caso a mensagem cita as duas leituras.
 */
function normalizarComAmbiguidade(
  raw: string,
  texto: string,
  tipo: PixKeyType,
  expected: PixKeyType | undefined,
): NormalizedPixKey {
  try {
    return normalizarPorTipo(texto, tipo);
  } catch (erro) {
    const ambiguo = expected === undefined && /^\d{11}$/.test(somenteDigitos(texto));
    if (ambiguo && erro instanceof BrCodeError) {
      throw new BrCodeError(
        `"${raw}" tem 11 digitos, mas nao e um CPF valido (o digito verificador nao ` +
          'confere) nem um celular valido. Confira os numeros ou escolha o tipo da chave.',
      );
    }
    throw erro;
  }
}

function normalizarPorTipo(texto: string, tipo: PixKeyType): NormalizedPixKey {
  switch (tipo) {
    case 'cpf':
      return normalizarCpf(texto);
    case 'cnpj':
      return normalizarCnpj(texto);
    case 'phone':
      return normalizarTelefone(texto);
    case 'email':
      return normalizarEmail(texto);
    case 'random':
      return normalizarAleatoria(texto);
  }
}

function normalizarCpf(texto: string): NormalizedPixKey {
  const digitos = somenteDigitos(texto);
  if (digitos.length !== 11) {
    throw new BrCodeError(`Um CPF tem 11 digitos; "${texto}" tem ${digitos.length}.`);
  }
  if (!isValidCpf(digitos)) {
    throw new BrCodeError('CPF invalido: o digito verificador nao confere.');
  }
  const display = `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
  return { type: 'cpf', value: digitos, display };
}

function normalizarCnpj(texto: string): NormalizedPixKey {
  const digitos = somenteDigitos(texto);
  if (digitos.length !== 14) {
    throw new BrCodeError(`Um CNPJ tem 14 digitos; "${texto}" tem ${digitos.length}.`);
  }
  if (!isValidCnpj(digitos)) {
    throw new BrCodeError('CNPJ invalido: o digito verificador nao confere.');
  }
  const display =
    `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}` +
    `/${digitos.slice(8, 12)}-${digitos.slice(12)}`;
  return { type: 'cnpj', value: digitos, display };
}

/**
 * No payload o telefone vai sempre no formato internacional, sem espaco nem
 * pontuacao: "+5511987654321". Um numero digitado sem o codigo do pais recebe
 * o +55.
 */
function normalizarTelefone(texto: string): NormalizedPixKey {
  const digitos = somenteDigitos(texto);

  let nacional: string;
  if (texto.trim().startsWith('+')) {
    if (!digitos.startsWith('55')) {
      throw new BrCodeError('Chave de telefone no Pix precisa ser um numero brasileiro (+55).');
    }
    nacional = digitos.slice(2);
  } else if (digitos.length > 11 && digitos.startsWith('55')) {
    nacional = digitos.slice(2);
  } else {
    nacional = digitos;
  }

  if (nacional.length !== 10 && nacional.length !== 11) {
    throw new BrCodeError(
      `Telefone invalido: esperava DDD mais 8 ou 9 digitos, recebi ${nacional.length} digitos.`,
    );
  }

  const ddd = nacional.slice(0, 2);
  if (Number(ddd) < 11) {
    throw new BrCodeError(`DDD invalido: "${ddd}".`);
  }

  const assinante = nacional.slice(2);
  if (assinante.length === 9 && !assinante.startsWith('9')) {
    throw new BrCodeError('Celular com 9 digitos precisa comecar com 9.');
  }

  const value = `+55${nacional}`;
  const display = `+55 (${ddd}) ${formatarAssinante(assinante)}`;
  return { type: 'phone', value, display };
}

function formatarAssinante(assinante: string): string {
  const corte = assinante.length === 9 ? 5 : 4;
  return `${assinante.slice(0, corte)}-${assinante.slice(corte)}`;
}

function normalizarEmail(texto: string): NormalizedPixKey {
  // O DICT guarda e-mails em minusculas; acentos nao sao aceitos em chave.
  const limpo = removeAccents(texto.trim()).toLowerCase();
  if (!EMAIL_PATTERN.test(limpo)) {
    throw new BrCodeError(`E-mail invalido: "${texto}".`);
  }
  return { type: 'email', value: limpo, display: limpo };
}

function normalizarAleatoria(texto: string): NormalizedPixKey {
  const limpo = texto.trim().toLowerCase();
  if (!UUID_PATTERN.test(limpo)) {
    throw new BrCodeError(
      'Chave aleatoria invalida: esperava 32 hexadecimais no formato 8-4-4-4-12.',
    );
  }
  return { type: 'random', value: limpo, display: limpo };
}

function somenteDigitos(texto: string): string {
  return texto.replace(/\D/g, '');
}

/** Digito verificador de CPF, modulo 11 com pesos decrescentes. */
export function isValidCpf(digitos: string): boolean {
  if (!/^\d{11}$/.test(digitos)) return false;
  // Sequencias como 00000000000 passam na conta mas nao sao CPFs.
  if (/^(\d)\1{10}$/.test(digitos)) return false;

  const numeros = [...digitos].map(Number) as number[];

  for (const posicao of [9, 10] as const) {
    let soma = 0;
    for (let i = 0; i < posicao; i += 1) {
      soma += (numeros[i] as number) * (posicao + 1 - i);
    }
    const resto = (soma * 10) % 11;
    const esperado = resto === 10 ? 0 : resto;
    if (esperado !== numeros[posicao]) return false;
  }

  return true;
}

/** Digito verificador de CNPJ, modulo 11 com a sequencia de pesos 2..9. */
export function isValidCnpj(digitos: string): boolean {
  if (!/^\d{14}$/.test(digitos)) return false;
  if (/^(\d)\1{13}$/.test(digitos)) return false;

  const numeros = [...digitos].map(Number) as number[];
  const pesosPrimeiro = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const pesosSegundo = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  for (const [pesos, posicao] of [
    [pesosPrimeiro, 12],
    [pesosSegundo, 13],
  ] as const) {
    let soma = 0;
    for (let i = 0; i < pesos.length; i += 1) {
      soma += (numeros[i] as number) * (pesos[i] as number);
    }
    const resto = soma % 11;
    const esperado = resto < 2 ? 0 : 11 - resto;
    if (esperado !== numeros[posicao]) return false;
  }

  return true;
}
