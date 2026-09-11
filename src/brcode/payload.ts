import { crc16Hex } from './crc16.js';
import { field, MAX_FIELD_LENGTH, template } from './emv.js';
import { BrCodeError } from './errors.js';
import { normalizePixKey, type NormalizedPixKey, type PixKeyType } from './keys.js';
import { formatCentsForPayload, parseAmountToCents } from './money.js';
import { sanitizeText, sanitizeTxid } from './sanitize.js';

/** IDs dos campos de primeiro nivel de um BR Code. */
export const ID = {
  PAYLOAD_FORMAT: '00',
  INITIATION_METHOD: '01',
  MERCHANT_ACCOUNT: '26',
  MERCHANT_CATEGORY_CODE: '52',
  CURRENCY: '53',
  AMOUNT: '54',
  COUNTRY: '58',
  MERCHANT_NAME: '59',
  MERCHANT_CITY: '60',
  POSTAL_CODE: '61',
  ADDITIONAL_DATA: '62',
  CRC: '63',
} as const;

/** Subcampos do template 26 (dados da conta) e do 62 (dados adicionais). */
export const SUB_ID = {
  GUI: '00',
  KEY: '01',
  DESCRIPTION: '02',
  TXID: '05',
} as const;

export const GUI_PIX = 'br.gov.bcb.pix';
export const CURRENCY_BRL = '986';
export const COUNTRY_BR = 'BR';
export const DEFAULT_MCC = '0000';
/** Quando nao ha identificador, o padrao manda enviar tres asteriscos. */
export const TXID_AUSENTE = '***';

export const MAX_MERCHANT_NAME = 25;
export const MAX_MERCHANT_CITY = 15;
export const MAX_TXID = 25;
export const MAX_DESCRIPTION = 72;

export interface PixChargeInput {
  /** Chave Pix do recebedor, como digitada. */
  readonly key: string;
  /** Fixa o tipo da chave; sem isso o tipo e deduzido. */
  readonly keyType?: PixKeyType | undefined;
  readonly merchantName: string;
  readonly merchantCity: string;
  /** Valor da cobranca. Omitir gera um QR de valor livre. */
  readonly amount?: string | number | null | undefined;
  /** Identificador da cobranca (campo 62/05). Ate 25 caracteres alfanumericos. */
  readonly txid?: string | undefined;
  /** Texto curto que alguns aplicativos exibem ao pagador (campo 26/02). */
  readonly description?: string | undefined;
  /** CEP do recebedor (campo 61), opcional. */
  readonly postalCode?: string | undefined;
  /**
   * `true` marca o QR como de uso unico (campo 01 = "12"). O padrao e estatico
   * e reutilizavel, que e o caso de uso deste gerador.
   */
  readonly oneTime?: boolean | undefined;
}

export interface PixCharge {
  /** A string completa do BR Code, pronta para virar QR ou ser copiada. */
  readonly payload: string;
  readonly key: NormalizedPixKey;
  readonly merchantName: string;
  readonly merchantCity: string;
  readonly amountCents: number | null;
  readonly txid: string;
  readonly description: string | null;
  readonly postalCode: string | null;
  readonly oneTime: boolean;
  /** Os quatro hexadecimais do campo 63. */
  readonly crc: string;
  /** Ajustes silenciosos que a interface deve mostrar, como truncamentos. */
  readonly warnings: readonly string[];
}

/**
 * Monta o BR Code estatico a partir dos dados da cobranca.
 *
 * Tudo acontece em memoria: nenhuma chave, nome ou valor sai do dispositivo.
 */
export function buildPixPayload(input: PixChargeInput): PixCharge {
  const warnings: string[] = [];

  const key = normalizePixKey(input.key, input.keyType);
  const merchantName = exigirTexto(
    sanitizeText(input.merchantName, MAX_MERCHANT_NAME),
    'nome do recebedor',
    input.merchantName,
  );
  const merchantCity = exigirTexto(
    sanitizeText(input.merchantCity, MAX_MERCHANT_CITY),
    'cidade do recebedor',
    input.merchantCity,
  );

  avisarTruncamento(warnings, 'nome do recebedor', input.merchantName, merchantName, MAX_MERCHANT_NAME);
  avisarTruncamento(warnings, 'cidade', input.merchantCity, merchantCity, MAX_MERCHANT_CITY);

  const amountCents = lerValor(input.amount);
  const txid = lerTxid(input.txid, warnings);
  const description = lerDescricao(input.description, key, warnings);
  const postalCode = lerCep(input.postalCode);
  const oneTime = input.oneTime === true;

  const campos: string[] = [];

  campos.push(field(ID.PAYLOAD_FORMAT, '01'));
  if (oneTime) {
    campos.push(field(ID.INITIATION_METHOD, '12'));
  }
  campos.push(montarContaPix(key, description));
  campos.push(field(ID.MERCHANT_CATEGORY_CODE, DEFAULT_MCC));
  campos.push(field(ID.CURRENCY, CURRENCY_BRL));
  if (amountCents !== null) {
    campos.push(field(ID.AMOUNT, formatCentsForPayload(amountCents)));
  }
  campos.push(field(ID.COUNTRY, COUNTRY_BR));
  campos.push(field(ID.MERCHANT_NAME, merchantName));
  campos.push(field(ID.MERCHANT_CITY, merchantCity));
  if (postalCode !== null) {
    campos.push(field(ID.POSTAL_CODE, postalCode));
  }
  campos.push(template(ID.ADDITIONAL_DATA, [[SUB_ID.TXID, txid]]));

  const { payload, crc } = fecharComCrc(campos.join(''));

  return {
    payload,
    key,
    merchantName,
    merchantCity,
    amountCents,
    txid,
    description,
    postalCode,
    oneTime,
    crc,
    warnings,
  };
}

/**
 * Acrescenta o campo 63 e o seu CRC.
 *
 * O detalhe que mais confunde nesse padrao: o CRC e calculado sobre a string ja
 * contendo "6304", o proprio cabecalho do campo do CRC. Por isso o prefixo e
 * concatenado antes do calculo.
 */
export function fecharComCrc(payloadSemCrc: string): { payload: string; crc: string } {
  const base = `${payloadSemCrc}${ID.CRC}04`;
  const crc = crc16Hex(base);
  return { payload: base + crc, crc };
}

function montarContaPix(key: NormalizedPixKey, description: string | null): string {
  const entradas: [string, string][] = [
    [SUB_ID.GUI, GUI_PIX],
    [SUB_ID.KEY, key.value],
  ];
  if (description !== null) {
    entradas.push([SUB_ID.DESCRIPTION, description]);
  }
  return template(ID.MERCHANT_ACCOUNT, entradas);
}

function exigirTexto(sanitizado: string, rotulo: string, original: string): string {
  if (sanitizado === '') {
    const motivo =
      original.trim() === ''
        ? 'o campo esta vazio'
        : 'o texto informado nao tem nenhum caractere aproveitavel';
    throw new BrCodeError(`Informe o ${rotulo}: ${motivo}.`);
  }
  return sanitizado;
}

function avisarTruncamento(
  warnings: string[],
  rotulo: string,
  original: string,
  resultado: string,
  limite: number,
): void {
  if (sanitizeText(original, Number.MAX_SAFE_INTEGER).length > resultado.length) {
    warnings.push(`O ${rotulo} foi cortado em ${limite} caracteres: "${resultado}".`);
  }
}

function lerValor(amount: PixChargeInput['amount']): number | null {
  if (amount === undefined || amount === null) return null;
  if (typeof amount === 'string' && amount.trim() === '') return null;
  return parseAmountToCents(amount);
}

function lerTxid(txid: string | undefined, warnings: string[]): string {
  if (txid === undefined || txid.trim() === '') return TXID_AUSENTE;

  const limpo = sanitizeTxid(txid, MAX_TXID);
  if (limpo === '') {
    throw new BrCodeError(
      `O identificador "${txid}" ficou vazio: o padrao aceita apenas letras e digitos.`,
    );
  }
  if (limpo.length < sanitizeTxid(txid, Number.MAX_SAFE_INTEGER).length) {
    warnings.push(`O identificador foi cortado em ${MAX_TXID} caracteres: "${limpo}".`);
  } else if (limpo !== txid.trim()) {
    warnings.push(`O identificador foi ajustado para "${limpo}": so letras e digitos sao aceitos.`);
  }
  return limpo;
}

/**
 * A descricao divide o campo 26 com a chave, e o campo inteiro cabe em 99
 * caracteres. Sobra para a descricao o que a chave nao usou, e uma chave longa
 * pode nao deixar espaco nenhum.
 */
function lerDescricao(
  description: string | undefined,
  key: NormalizedPixKey,
  warnings: string[],
): string | null {
  if (description === undefined || description.trim() === '') return null;

  const usadoPeloGui = 4 + GUI_PIX.length;
  const usadoPelaChave = 4 + key.value.length;
  const espacoLivre = MAX_FIELD_LENGTH - usadoPeloGui - usadoPelaChave - 4;
  const limite = Math.min(MAX_DESCRIPTION, espacoLivre);

  if (limite <= 0) {
    warnings.push(
      `A descricao foi descartada: a chave de ${key.value.length} caracteres ocupa todo o campo 26.`,
    );
    return null;
  }

  const sanitizada = sanitizeText(description, limite);
  if (sanitizada === '') return null;

  if (sanitizeText(description, Number.MAX_SAFE_INTEGER).length > sanitizada.length) {
    warnings.push(`A descricao foi cortada em ${limite} caracteres: "${sanitizada}".`);
  }
  return sanitizada;
}

function lerCep(postalCode: string | undefined): string | null {
  if (postalCode === undefined || postalCode.trim() === '') return null;

  const digitos = postalCode.replace(/\D/g, '');
  if (digitos.length !== 8) {
    throw new BrCodeError(`CEP invalido: "${postalCode}". Esperava 8 digitos.`);
  }
  return digitos;
}
