import { describe, expect, it } from 'vitest';
import { crc16, crc16Hex } from '../crc16.js';

describe('crc16', () => {
  it('reproduz o valor de conferencia do catalogo para CCITT-FALSE', () => {
    // "123456789" -> 0x29B1 e o check value publicado para esta variante.
    // Este teste e o que garante que nao trocamos por ARC, XMODEM ou KERMIT.
    expect(crc16('123456789')).toBe(0x29b1);
    expect(crc16Hex('123456789')).toBe('29B1');
  });

  it('devolve o valor inicial quando nao ha nada a processar', () => {
    expect(crc16('')).toBe(0xffff);
    expect(crc16Hex('')).toBe('FFFF');
  });

  it('mantem o resultado dentro de 16 bits', () => {
    const amostras = ['', 'A', 'pix', '0'.repeat(500), 'br.gov.bcb.pix'];
    for (const amostra of amostras) {
      const resultado = crc16(amostra);
      expect(resultado).toBeGreaterThanOrEqual(0);
      expect(resultado).toBeLessThanOrEqual(0xffff);
      expect(Number.isInteger(resultado)).toBe(true);
    }
  });

  it('sempre formata com quatro hexadecimais maiusculos', () => {
    const amostras = ['', 'A', 'pix', 'Fulano de Tal', '123456789'];
    for (const amostra of amostras) {
      expect(crc16Hex(amostra)).toMatch(/^[0-9A-F]{4}$/);
    }
  });

  it('muda quando um unico caractere muda', () => {
    expect(crc16('5913Fulano de Tal')).not.toBe(crc16('5913Fulano de Tak'));
  });

  it('aceita bytes crus e a string equivalente com o mesmo resultado', () => {
    const texto = 'br.gov.bcb.pix';
    const bytes = new TextEncoder().encode(texto);
    expect(crc16(bytes)).toBe(crc16(texto));
  });
});
