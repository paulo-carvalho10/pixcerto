import { describe, expect, it } from 'vitest';
import { removeAccents, sanitizeText, sanitizeTxid } from '../sanitize.js';

describe('removeAccents', () => {
  it('preserva a letra base', () => {
    expect(removeAccents('Jão Conceição')).toBe('Jao Conceicao');
    expect(removeAccents('São Paulo')).toBe('Sao Paulo');
    expect(removeAccents('ÁÉÍÓÚ')).toBe('AEIOU');
    expect(removeAccents('café com açúcar')).toBe('cafe com acucar');
  });

  it('resolve caracteres que a decomposicao Unicode nao cobre', () => {
    expect(removeAccents('ßrasil')).toBe('ssrasil');
    expect(removeAccents('1º andar')).toBe('1o andar');
    expect(removeAccents('Malmø')).toBe('Malmo');
    expect(removeAccents('“aspas”')).toBe('"aspas"');
  });

  it('nao mexe em texto que ja e ASCII', () => {
    expect(removeAccents('PADARIA DO ZE 123')).toBe('PADARIA DO ZE 123');
  });
});

describe('sanitizeText', () => {
  it('remove o que nao for ASCII imprimivel', () => {
    expect(sanitizeText('Loja ★ Feliz \u{1f600}', 50)).toBe('Loja Feliz');
  });

  it('colapsa espacos e apara as pontas', () => {
    expect(sanitizeText('  Padaria    do   Ze  ', 50)).toBe('Padaria do Ze');
    expect(sanitizeText('linha\numa\tdois', 50)).toBe('linha uma dois');
  });

  it('corta no limite pedido', () => {
    expect(sanitizeText('Estabelecimento Comercial Longo', 25)).toBe('Estabelecimento Comercial');
    expect(sanitizeText('Sao Jose dos Campos', 15)).toBe('Sao Jose dos Ca');
  });

  it('pode resultar em string vazia', () => {
    expect(sanitizeText('\u{1f600}\u{1f600}', 25)).toBe('');
    expect(sanitizeText('   ', 25)).toBe('');
  });
});

describe('sanitizeTxid', () => {
  it('mantem apenas letras e digitos', () => {
    expect(sanitizeTxid('pedido #12/A')).toBe('pedido12A');
    expect(sanitizeTxid('NF-e 2026.09')).toBe('NFe202609');
    expect(sanitizeTxid('mensalidade-março')).toBe('mensalidademarco');
  });

  it('corta em 25 caracteres por padrao', () => {
    expect(sanitizeTxid('A'.repeat(40))).toHaveLength(25);
  });

  it('pode resultar em string vazia', () => {
    expect(sanitizeTxid('###')).toBe('');
  });
});
