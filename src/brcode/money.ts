import { BrCodeError } from './errors.js';

/**
 * Valores circulam pelo projeto como centavos inteiros, nunca como float.
 * 0.1 + 0.2 em ponto flutuante nao da 0.3, e um centavo errado no campo 54
 * significa cobrar a pessoa errada por um valor errado.
 */

/** O campo 54 aceita no maximo 13 caracteres, e "9999999999.99" ja os ocupa. */
export const MAX_AMOUNT_CENTS = 999_999_999_999;

/**
 * Converte o que a pessoa digitou em centavos.
 *
 * Aceita as formas que aparecem no dia a dia: "10", "10,50", "10.50",
 * "R$ 1.234,56" e "1,234.56". A desambiguacao entre milhar e decimal segue
 * duas regras:
 *
 *   - havendo virgula, ela e o separador decimal e os pontos sao milhar;
 *   - havendo apenas pontos, o ultimo ponto so e decimal se vier seguido de
 *     um ou dois digitos e for o unico ponto da string.
 *
 * Assim "1.234" e mil duzentos e trinta e quatro e "1.23" e um real e vinte e
 * tres centavos, que e como as duas formas sao lidas na pratica.
 */
export function parseAmountToCents(input: string | number): number {
  const texto = typeof input === 'number' ? numberToDecimalString(input) : input;

  const limpo = texto.replace(/[R$\s ]/gi, '');
  if (limpo === '') {
    throw new BrCodeError('Informe um valor ou deixe o campo em branco para um QR de valor livre.');
  }
  if (limpo.startsWith('-')) {
    throw new BrCodeError('O valor de uma cobranca Pix nao pode ser negativo.');
  }
  if (!/^[0-9.,]+$/.test(limpo)) {
    throw new BrCodeError(`Valor invalido: "${input}". Use apenas digitos, ponto e virgula.`);
  }

  const { inteiro, fracao } = separarParteDecimal(limpo);

  if (inteiro === '' && fracao === '') {
    throw new BrCodeError(`Valor invalido: "${input}".`);
  }

  const centavos = arredondarParaCentavos(inteiro === '' ? '0' : inteiro, fracao);

  if (centavos <= 0) {
    throw new BrCodeError('O valor precisa ser maior que zero. Para deixar o pagador escolher, omita o valor.');
  }
  if (centavos > MAX_AMOUNT_CENTS) {
    throw new BrCodeError(
      `O valor passa do maximo representavel no campo 54 (${formatCentsForDisplay(MAX_AMOUNT_CENTS)}).`,
    );
  }

  return centavos;
}

/** Formata centavos como o campo 54 exige: ponto decimal e duas casas. */
export function formatCentsForPayload(cents: number): string {
  assertCentavosValidos(cents);
  const reais = Math.trunc(cents / 100);
  const resto = cents % 100;
  return `${reais}.${String(resto).padStart(2, '0')}`;
}

/** Formata centavos para leitura humana: "R$ 1.234,56". */
export function formatCentsForDisplay(cents: number): string {
  assertCentavosValidos(cents);
  const reais = Math.trunc(cents / 100);
  const resto = cents % 100;
  const comMilhar = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${comMilhar},${String(resto).padStart(2, '0')}`;
}

function assertCentavosValidos(cents: number): void {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new BrCodeError(`Centavos invalidos: ${cents}. Esperado um inteiro nao negativo.`);
  }
}

function numberToDecimalString(valor: number): string {
  if (!Number.isFinite(valor)) {
    throw new BrCodeError(`Valor invalido: ${valor}.`);
  }
  // toFixed(2) resolve o ruido de ponto flutuante antes de o texto ser lido.
  return valor.toFixed(2);
}

function separarParteDecimal(limpo: string): { inteiro: string; fracao: string } {
  const ultimaVirgula = limpo.lastIndexOf(',');
  const ultimoPonto = limpo.lastIndexOf('.');

  // Formato americano ("1,234.56"): o ponto aparece depois da virgula, entao a
  // virgula e separador de milhar e o ponto e o decimal.
  if (ultimaVirgula !== -1 && ultimoPonto > ultimaVirgula) {
    const semVirgulas = limpo.replace(/,/g, '');
    const corte = semVirgulas.lastIndexOf('.');
    return { inteiro: semVirgulas.slice(0, corte), fracao: semVirgulas.slice(corte + 1) };
  }

  if (ultimaVirgula !== -1) {
    const partes = limpo.split(',');
    if (partes.length > 2) {
      throw new BrCodeError(`Valor invalido: "${limpo}" tem mais de uma virgula.`);
    }
    const inteiro = (partes[0] ?? '').replace(/\./g, '');
    const fracao = partes[1] ?? '';
    return { inteiro, fracao };
  }

  const pontos = limpo.split('.');
  if (pontos.length === 1) {
    return { inteiro: limpo, fracao: '' };
  }
  const ultimo = pontos[pontos.length - 1] ?? '';
  const ehDecimal = pontos.length === 2 && ultimo.length > 0 && ultimo.length <= 2;

  if (ehDecimal) {
    return { inteiro: pontos[0] ?? '', fracao: ultimo };
  }
  return { inteiro: pontos.join(''), fracao: '' };
}

function arredondarParaCentavos(inteiro: string, fracao: string): number {
  const reais = Number(inteiro);
  if (!Number.isSafeInteger(reais)) {
    throw new BrCodeError('O valor e grande demais para ser representado com exatidao.');
  }

  const doisPrimeiros = fracao.slice(0, 2).padEnd(2, '0');
  const centavosDaFracao = Number(doisPrimeiros);
  const proximoDigito = Number(fracao[2] ?? '0');
  const arredondamento = proximoDigito >= 5 ? 1 : 0;

  return reais * 100 + centavosDaFracao + arredondamento;
}
