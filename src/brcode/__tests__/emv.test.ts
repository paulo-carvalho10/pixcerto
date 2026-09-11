import { describe, expect, it } from 'vitest';
import { BrCodeError } from '../errors.js';
import { field, MAX_FIELD_LENGTH, parseTlv, template } from '../emv.js';

describe('field', () => {
  it('monta ID, tamanho de dois digitos e valor', () => {
    expect(field('58', 'BR')).toBe('5802BR');
    expect(field('53', '986')).toBe('5303986');
    expect(field('00', '01')).toBe('000201');
  });

  it('preenche o tamanho com zero a esquerda', () => {
    expect(field('59', 'Fulano de Tal')).toBe('5913Fulano de Tal');
    expect(field('62', '')).toBe('6200');
  });

  it('nao preenche o tamanho de valores com dois digitos de comprimento', () => {
    expect(field('01', '0'.repeat(10))).toBe('01100000000000');
  });

  it('aceita exatamente o limite de 99 caracteres', () => {
    const valor = 'x'.repeat(MAX_FIELD_LENGTH);
    expect(field('26', valor)).toBe(`2699${valor}`);
  });

  it('recusa valor acima de 99 caracteres', () => {
    expect(() => field('26', 'x'.repeat(100))).toThrow(BrCodeError);
    expect(() => field('26', 'x'.repeat(100))).toThrow(/limite de 99/);
  });

  it('recusa ID que nao sejam dois digitos', () => {
    for (const id of ['5', '580', 'AB', '', '5a']) {
      expect(() => field(id, 'BR')).toThrow(BrCodeError);
    }
  });

  it('recusa acentos e caracteres de controle', () => {
    expect(() => field('59', 'Joao Antonio Café')).toThrow(/ASCII/);
    expect(() => field('59', 'Fulano\n')).toThrow(/ASCII/);
  });
});

describe('template', () => {
  it('aninha campos dentro de outro campo', () => {
    const resultado = template('26', [
      ['00', 'br.gov.bcb.pix'],
      ['01', 'teste@exemplo.com'],
    ]);

    const interno = '0014br.gov.bcb.pix0117teste@exemplo.com';
    expect(resultado).toBe(`26${String(interno.length).padStart(2, '0')}${interno}`);
  });

  it('recusa quando o conteudo aninhado estoura o limite do campo externo', () => {
    expect(() => template('26', [['01', 'x'.repeat(96)]])).toThrow(BrCodeError);
  });
});

describe('parseTlv', () => {
  it('le de volta os campos que field produziu', () => {
    const entrada = field('00', '01') + field('58', 'BR') + field('59', 'Fulano de Tal');
    expect(parseTlv(entrada)).toEqual([
      { id: '00', length: 2, value: '01' },
      { id: '58', length: 2, value: 'BR' },
      { id: '59', length: 13, value: 'Fulano de Tal' },
    ]);
  });

  it('devolve lista vazia para entrada vazia', () => {
    expect(parseTlv('')).toEqual([]);
  });

  it('preserva campos de valor vazio', () => {
    expect(parseTlv('6200')).toEqual([{ id: '62', length: 0, value: '' }]);
  });

  it('nao interpreta o conteudo de um template', () => {
    const [node] = parseTlv(template('26', [['00', 'br.gov.bcb.pix']]));
    expect(node?.value).toBe('0014br.gov.bcb.pix');
    expect(node?.children).toBeUndefined();
  });

  it('reclama quando o tamanho declarado passa do fim do texto', () => {
    expect(() => parseTlv('5820BR')).toThrow(/so restam/);
  });

  it('reclama quando sobram caracteres insuficientes para um cabecalho', () => {
    expect(() => parseTlv('5802BR58')).toThrow(/Fim inesperado/);
  });

  it('reclama de tamanho nao numerico', () => {
    expect(() => parseTlv('58AABR')).toThrow(/Tamanho invalido/);
  });

  it('reclama de ID nao numerico', () => {
    expect(() => parseTlv('XY02BR')).toThrow(/ID invalido/);
  });
});
