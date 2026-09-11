import { crc16Hex } from './crc16.js';
import { parseTlv, type TlvNode } from './emv.js';
import { BrCodeError } from './errors.js';
import { detectPixKeyType, type PixKeyType } from './keys.js';
import { GUI_PIX, ID, SUB_ID, TXID_AUSENTE } from './payload.js';

/**
 * Leitura de um BR Code ja pronto: quebra a string na arvore de campos, confere
 * o CRC e resume o que aquele QR significa.
 *
 * E o contrapeso do gerador. Se `decodePix(buildPixPayload(x))` nao devolver
 * `x`, uma das duas metades esta errada, e o teste de ida e volta encontra isso
 * sem depender de nenhum aplicativo de banco.
 */

export interface DecodedField {
  readonly id: string;
  /** Nome legivel do campo, quando conhecido. */
  readonly name: string;
  readonly length: number;
  readonly value: string;
  /** Preenchido para os IDs que carregam outros campos dentro de si. */
  readonly children?: readonly DecodedField[];
}

export interface DecodedPixSummary {
  readonly key: string | null;
  readonly keyType: PixKeyType | null;
  readonly merchantName: string | null;
  readonly merchantCity: string | null;
  readonly amount: string | null;
  readonly txid: string | null;
  readonly description: string | null;
  readonly currency: string | null;
  readonly country: string | null;
  /** `true` quando o campo 01 marca uso unico, ou quando ha URL de payload. */
  readonly oneTime: boolean;
  /** QR dinamico traz a URL do payload em 26/25 no lugar da chave. */
  readonly payloadUrl: string | null;
}

export interface DecodedPix {
  /** `true` quando a estrutura foi lida e o CRC confere. */
  readonly ok: boolean;
  readonly fields: readonly DecodedField[];
  readonly crc: {
    /** Os 4 hexadecimais que vieram no campo 63, se havia um. */
    readonly declared: string | null;
    readonly calculated: string | null;
    readonly valid: boolean;
  };
  readonly summary: DecodedPixSummary;
  /** Tudo que esta fora do padrao, em linguagem direta. */
  readonly problems: readonly string[];
}

const NOMES_RAIZ: Readonly<Record<string, string>> = {
  '00': 'Versao do formato',
  '01': 'Metodo de iniciacao',
  '26': 'Dados da conta (Pix)',
  '52': 'Categoria do estabelecimento',
  '53': 'Moeda',
  '54': 'Valor',
  '55': 'Indicador de gorjeta',
  '56': 'Gorjeta fixa',
  '57': 'Gorjeta percentual',
  '58': 'Pais',
  '59': 'Nome do recebedor',
  '60': 'Cidade do recebedor',
  '61': 'CEP',
  '62': 'Dados adicionais',
  '63': 'CRC16',
  '64': 'Idioma',
};

const NOMES_CONTA: Readonly<Record<string, string>> = {
  '00': 'Identificador do arranjo (GUI)',
  '01': 'Chave Pix',
  '02': 'Descricao',
  '25': 'URL do payload (QR dinamico)',
};

const NOMES_ADICIONAIS: Readonly<Record<string, string>> = {
  '01': 'Numero do documento',
  '02': 'Telefone',
  '03': 'Identificador da loja',
  '04': 'Numero de fidelidade',
  '05': 'Identificador da cobranca (txid)',
  '06': 'Identificador do cliente',
  '07': 'Identificador do terminal',
  '08': 'Finalidade da transacao',
  '09': 'Dados adicionais do consumidor',
};

/** IDs cujo valor e, ele proprio, uma sequencia de campos. */
function ehTemplate(id: string): boolean {
  const n = Number(id);
  if (Number.isNaN(n)) return false;
  // 26..51 sao templates de conta; 62 dados adicionais; 64 idioma;
  // 80..99 ficam reservados para uso nao padronizado, tambem em TLV.
  return (n >= 26 && n <= 51) || n === 62 || n === 64 || (n >= 80 && n <= 99);
}

function nomeDoFilho(idPai: string, idFilho: string): string {
  const n = Number(idPai);
  if (n >= 26 && n <= 51) return NOMES_CONTA[idFilho] ?? `Campo ${idFilho}`;
  if (idPai === '62') return NOMES_ADICIONAIS[idFilho] ?? `Campo ${idFilho}`;
  return `Campo ${idFilho}`;
}

/**
 * Le um BR Code. Nunca lanca: problemas de estrutura viram `problems` e
 * `ok: false`, porque a tela de decodificacao precisa mostrar o que conseguiu
 * entender mesmo de um codigo quebrado.
 */
export function decodePix(input: string): DecodedPix {
  // Apenas quebras de linha e tabulacoes saem, porque aparecem quando o codigo
  // e copiado de um e-mail ou de uma mensagem que quebrou a linha. Espacos
  // internos ficam: "Fulano de Tal" e o valor real do campo 59, e remove-los
  // encurtaria o campo e desalinharia a leitura de tudo que vem depois.
  const payload = input.replace(/[\r\n\t\f\v]/g, '').trim();
  const problems: string[] = [];

  if (payload === '') {
    return vazio(['Cole um codigo Pix para analisar.']);
  }

  let raiz: TlvNode[];
  try {
    raiz = parseTlv(payload);
  } catch (erro) {
    const mensagem = erro instanceof BrCodeError ? erro.message : String(erro);
    return vazio([`Nao consegui separar os campos: ${mensagem}`]);
  }

  const crc = conferirCrc(payload, raiz, problems);
  const fields = raiz.map((node) => expandir(node, problems));
  const summary = resumir(raiz, problems);

  return { ok: problems.length === 0, fields, crc, summary, problems };
}

function vazio(problems: string[]): DecodedPix {
  return {
    ok: false,
    fields: [],
    crc: { declared: null, calculated: null, valid: false },
    summary: {
      key: null,
      keyType: null,
      merchantName: null,
      merchantCity: null,
      amount: null,
      txid: null,
      description: null,
      currency: null,
      country: null,
      oneTime: false,
      payloadUrl: null,
    },
    problems,
  };
}

function conferirCrc(
  payload: string,
  raiz: readonly TlvNode[],
  problems: string[],
): DecodedPix['crc'] {
  let offset = 0;
  let encontrado: TlvNode | null = null;

  for (const node of raiz) {
    if (node.id === ID.CRC) {
      encontrado = node;
      break;
    }
    offset += 4 + node.length;
  }

  if (encontrado === null) {
    problems.push('Falta o campo 63 com o CRC16.');
    return { declared: null, calculated: null, valid: false };
  }

  if (raiz[raiz.length - 1] !== encontrado) {
    problems.push('O campo 63 precisa ser o ultimo do payload.');
  }
  if (encontrado.length !== 4) {
    problems.push(`O CRC deveria ter 4 caracteres e tem ${encontrado.length}.`);
  }

  // O CRC cobre a string inteira ate o "6304", inclusive.
  const base = payload.slice(0, offset + 4);
  const calculated = crc16Hex(base);
  const declared = encontrado.value.toUpperCase();
  const valid = declared === calculated;

  if (!valid) {
    problems.push(`CRC nao confere: o codigo traz ${declared} e o calculado e ${calculated}.`);
  }

  return { declared, calculated, valid };
}

function expandir(node: TlvNode, problems: string[]): DecodedField {
  const name = NOMES_RAIZ[node.id] ?? `Campo ${node.id}`;

  if (!ehTemplate(node.id)) {
    return { id: node.id, name, length: node.length, value: node.value };
  }

  try {
    const filhos = parseTlv(node.value).map((filho) => ({
      id: filho.id,
      name: nomeDoFilho(node.id, filho.id),
      length: filho.length,
      value: filho.value,
    }));
    return { id: node.id, name, length: node.length, value: node.value, children: filhos };
  } catch (erro) {
    const mensagem = erro instanceof BrCodeError ? erro.message : String(erro);
    problems.push(`Campo ${node.id} deveria conter subcampos, mas nao pude le-los: ${mensagem}`);
    return { id: node.id, name, length: node.length, value: node.value };
  }
}

function resumir(raiz: readonly TlvNode[], problems: string[]): DecodedPixSummary {
  const porId = new Map(raiz.map((node) => [node.id, node.value]));

  const conta = acharContaPix(raiz, problems);
  const adicionais = lerSubcampos(porId.get(ID.ADDITIONAL_DATA));

  const key = conta?.get(SUB_ID.KEY) ?? null;
  const payloadUrl = conta?.get('25') ?? null;
  const txidBruto = adicionais?.get(SUB_ID.TXID) ?? null;

  const currency = porId.get(ID.CURRENCY) ?? null;
  const country = porId.get(ID.COUNTRY) ?? null;

  if (currency !== null && currency !== '986') {
    problems.push(`Moeda ${currency}: um Pix usa sempre 986 (real).`);
  }
  if (country !== null && country.toUpperCase() !== 'BR') {
    problems.push(`Pais ${country}: um Pix usa sempre BR.`);
  }

  return {
    key,
    keyType: key === null ? null : detectPixKeyType(key),
    merchantName: porId.get(ID.MERCHANT_NAME) ?? null,
    merchantCity: porId.get(ID.MERCHANT_CITY) ?? null,
    amount: porId.get(ID.AMOUNT) ?? null,
    txid: txidBruto === TXID_AUSENTE ? null : txidBruto,
    description: conta?.get(SUB_ID.DESCRIPTION) ?? null,
    currency,
    country,
    oneTime: porId.get(ID.INITIATION_METHOD) === '12' || payloadUrl !== null,
    payloadUrl,
  };
}

/**
 * O template do Pix costuma ser o 26, mas o padrao permite 26 a 51. Procura o
 * primeiro cujo GUI seja o do Banco Central.
 */
function acharContaPix(
  raiz: readonly TlvNode[],
  problems: string[],
): Map<string, string> | null {
  for (const node of raiz) {
    const n = Number(node.id);
    if (!(n >= 26 && n <= 51)) continue;

    const sub = lerSubcampos(node.value);
    const gui = sub?.get(SUB_ID.GUI);
    if (gui !== undefined && gui.toLowerCase() === GUI_PIX) {
      return sub;
    }
  }

  problems.push(`Nenhum campo traz o identificador "${GUI_PIX}": isso nao e um QR Pix.`);
  return null;
}

function lerSubcampos(valor: string | undefined): Map<string, string> | null {
  if (valor === undefined) return null;
  try {
    return new Map(parseTlv(valor).map((node) => [node.id, node.value]));
  } catch {
    return null;
  }
}
