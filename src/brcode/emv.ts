import { BrCodeError } from './errors.js';

/**
 * O BR Code e uma sequencia de campos EMV no formato TLV:
 *
 *     ID (2 digitos) + Tamanho (2 digitos decimais) + Valor
 *
 * Exemplo: "5802BR" e o campo 58 (pais), com 2 caracteres, valendo "BR".
 *
 * Como o tamanho ocupa exatamente dois digitos, nenhum campo pode passar de 99
 * caracteres. Campos maiores que isso nao sao representaveis no formato.
 */
export const MAX_FIELD_LENGTH = 99;

const TWO_DIGITS = /^\d{2}$/;

/** ASCII imprimivel: espaco (0x20) ate til (0x7E). */
const ASCII_PRINTABLE = /^[\x20-\x7E]*$/;

/**
 * Monta um unico campo TLV.
 *
 * Recusa valores com acento ou caracteres de controle de proposito: o payload
 * precisa ser ASCII para que `value.length` (unidades UTF-16) seja igual a
 * contagem de bytes que o aplicativo do banco vai ler. Sanitize o texto antes
 * de chegar aqui.
 */
export function field(id: string, value: string): string {
  if (!TWO_DIGITS.test(id)) {
    throw new BrCodeError(`ID de campo invalido: "${id}". Use exatamente dois digitos.`);
  }
  if (!ASCII_PRINTABLE.test(value)) {
    throw new BrCodeError(
      `Campo ${id} contem caracteres fora do ASCII imprimivel. Remova acentos e simbolos antes de montar o payload.`,
    );
  }
  if (value.length > MAX_FIELD_LENGTH) {
    throw new BrCodeError(
      `Campo ${id} tem ${value.length} caracteres, acima do limite de ${MAX_FIELD_LENGTH} de um campo EMV.`,
    );
  }
  return id + String(value.length).padStart(2, '0') + value;
}

/**
 * Monta um campo cujo valor e, ele proprio, uma sequencia de campos TLV.
 * E o caso dos IDs 26 (dados do Pix) e 62 (dados adicionais).
 */
export function template(id: string, entries: readonly (readonly [string, string])[]): string {
  const inner = entries.map(([childId, childValue]) => field(childId, childValue)).join('');
  return field(id, inner);
}

/** Um campo lido de volta a partir de um BR Code. */
export interface TlvNode {
  readonly id: string;
  /** Tamanho declarado pelo proprio campo, ja convertido para numero. */
  readonly length: number;
  readonly value: string;
  /** Preenchido apenas para os IDs que carregam outros campos dentro de si. */
  readonly children?: readonly TlvNode[];
}

/**
 * Le uma sequencia TLV. Nao interpreta significado: apenas quebra a string nos
 * campos que ela declara e reclama quando os tamanhos nao fecham.
 */
export function parseTlv(input: string): TlvNode[] {
  const nodes: TlvNode[] = [];
  let cursor = 0;

  while (cursor < input.length) {
    if (cursor + 4 > input.length) {
      throw new BrCodeError(
        `Fim inesperado na posicao ${cursor}: sobraram ${input.length - cursor} caracteres, ` +
          'insuficientes para um ID e um tamanho.',
      );
    }

    const id = input.slice(cursor, cursor + 2);
    const rawLength = input.slice(cursor + 2, cursor + 4);

    if (!TWO_DIGITS.test(id)) {
      throw new BrCodeError(`ID invalido na posicao ${cursor}: "${id}" nao sao dois digitos.`);
    }
    if (!TWO_DIGITS.test(rawLength)) {
      throw new BrCodeError(
        `Tamanho invalido para o campo ${id} na posicao ${cursor + 2}: "${rawLength}" nao sao dois digitos.`,
      );
    }

    const length = Number(rawLength);
    const start = cursor + 4;
    const end = start + length;

    if (end > input.length) {
      throw new BrCodeError(
        `Campo ${id} declara ${length} caracteres, mas so restam ${input.length - start} ate o fim do texto.`,
      );
    }

    nodes.push({ id, length, value: input.slice(start, end) });
    cursor = end;
  }

  return nodes;
}
