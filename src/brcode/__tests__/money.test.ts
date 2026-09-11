import { describe, expect, it } from 'vitest';
import { BrCodeError } from '../errors.js';
import {
  formatCentsForDisplay,
  formatCentsForPayload,
  MAX_AMOUNT_CENTS,
  parseAmountToCents,
} from '../money.js';

describe('parseAmountToCents', () => {
  it('le as formas comuns de digitar dinheiro', () => {
    const casos: [string | number, number][] = [
      ['10', 1000],
      ['10,5', 1050],
      ['10,50', 1050],
      ['10.50', 1050],
      ['0,01', 1],
      ['R$ 25,75', 2575],
      ['R$25.75', 2575],
      ['1.234,56', 123456],
      ['1,234.56', 123456],
      [25.75, 2575],
      [0.1, 10],
    ];

    for (const [entrada, esperado] of casos) {
      expect(parseAmountToCents(entrada), String(entrada)).toBe(esperado);
    }
  });

  it('trata ponto isolado como milhar quando nao parece decimal', () => {
    // "1.234" tem tres digitos depois do ponto: e mil duzentos e trinta e quatro.
    expect(parseAmountToCents('1.234')).toBe(123400);
    expect(parseAmountToCents('1.234.567')).toBe(123456700);
    // "1.23" tem dois: e um real e vinte e tres centavos.
    expect(parseAmountToCents('1.23')).toBe(123);
  });

  it('nao acumula erro de ponto flutuante', () => {
    // 0.1 + 0.2 em float da 0.30000000000000004; em centavos da 30.
    expect(parseAmountToCents('0,1') + parseAmountToCents('0,2')).toBe(30);
    expect(parseAmountToCents('1234567,89')).toBe(123456789);
  });

  it('arredonda a terceira casa para cima a partir de 5', () => {
    expect(parseAmountToCents('1,005')).toBe(101);
    expect(parseAmountToCents('1,004')).toBe(100);
    expect(parseAmountToCents('1,999')).toBe(200);
  });

  it('recusa valores que nao fazem sentido para uma cobranca', () => {
    expect(() => parseAmountToCents('0')).toThrow(/maior que zero/);
    expect(() => parseAmountToCents('0,00')).toThrow(/maior que zero/);
    expect(() => parseAmountToCents('-5')).toThrow(/negativo/);
    expect(() => parseAmountToCents('abc')).toThrow(BrCodeError);
    expect(() => parseAmountToCents('')).toThrow(BrCodeError);
    expect(() => parseAmountToCents('1,2,3')).toThrow(/mais de uma virgula/);
  });

  it('recusa valor acima do que o campo 54 comporta', () => {
    expect(parseAmountToCents('9999999999,99')).toBe(MAX_AMOUNT_CENTS);
    expect(() => parseAmountToCents('99999999999,99')).toThrow(/campo 54/);
  });
});

describe('formatCentsForPayload', () => {
  it('usa ponto decimal e sempre duas casas', () => {
    expect(formatCentsForPayload(1)).toBe('0.01');
    expect(formatCentsForPayload(100)).toBe('1.00');
    expect(formatCentsForPayload(1050)).toBe('10.50');
    expect(formatCentsForPayload(123456)).toBe('1234.56');
  });

  it('nunca passa de 13 caracteres, o limite do campo', () => {
    expect(formatCentsForPayload(MAX_AMOUNT_CENTS)).toBe('9999999999.99');
    expect(formatCentsForPayload(MAX_AMOUNT_CENTS)).toHaveLength(13);
  });
});

describe('formatCentsForDisplay', () => {
  it('formata no padrao brasileiro', () => {
    expect(formatCentsForDisplay(1)).toBe('R$ 0,01');
    expect(formatCentsForDisplay(1050)).toBe('R$ 10,50');
    expect(formatCentsForDisplay(123456)).toBe('R$ 1.234,56');
    expect(formatCentsForDisplay(123456789)).toBe('R$ 1.234.567,89');
  });
});
