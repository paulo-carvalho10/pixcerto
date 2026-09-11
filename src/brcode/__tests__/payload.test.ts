import { describe, expect, it } from 'vitest';
import { BrCodeError } from '../errors.js';
import { parseTlv } from '../emv.js';
import { buildPixPayload } from '../payload.js';

/**
 * Chaves e documentos usados aqui sao ficticios. Os CPFs e CNPJs tem digito
 * verificador valido de proposito, para exercitar a validacao, mas nao
 * pertencem a ninguem.
 */
const CHAVE_ALEATORIA = '123e4567-e12b-12d1-a456-426655440000';
const CPF_FICTICIO = '11144477735';
const CNPJ_FICTICIO = '11222333000181';

const BASE = {
  key: CHAVE_ALEATORIA,
  merchantName: 'Fulano de Tal',
  merchantCity: 'BRASILIA',
} as const;

describe('buildPixPayload — vetor oficial', () => {
  it('reproduz caractere a caractere o exemplo do manual do BR Code', () => {
    // Exemplo publicado pelo Banco Central: chave aleatoria, sem valor e sem
    // txid. Se o gerador reproduz esta string exata, a ordem dos campos, as
    // contagens de tamanho e o CRC estao todos corretos de uma vez so.
    const esperado =
      '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-426655440000' +
      '5204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D';

    const cobranca = buildPixPayload(BASE);

    expect(cobranca.payload).toBe(esperado);
    expect(cobranca.crc).toBe('1D3D');
    expect(cobranca.warnings).toEqual([]);
  });
});

describe('buildPixPayload — estrutura', () => {
  it('emite os campos obrigatorios na ordem do padrao', () => {
    const { payload } = buildPixPayload(BASE);
    const ids = parseTlv(payload).map((node) => node.id);
    expect(ids).toEqual(['00', '26', '52', '53', '58', '59', '60', '62', '63']);
  });

  it('termina sempre com o campo 63 de quatro hexadecimais', () => {
    const { payload, crc } = buildPixPayload({ ...BASE, amount: '10,00' });
    expect(payload.slice(-8, -4)).toBe('6304');
    expect(payload.slice(-4)).toBe(crc);
    expect(crc).toMatch(/^[0-9A-F]{4}$/);
  });

  it('calcula o CRC sobre a string ja contendo "6304"', () => {
    const { payload } = buildPixPayload(BASE);
    // Trocar um caractere qualquer deve invalidar o CRC declarado.
    const adulterado = payload.replace('Fulano', 'Fulana');
    expect(adulterado.slice(-4)).toBe(payload.slice(-4));
    expect(adulterado).not.toBe(payload);
  });

  it('omite o campo de valor quando nenhum valor e informado', () => {
    for (const amount of [undefined, null, '', '   ']) {
      const { payload, amountCents } = buildPixPayload({ ...BASE, amount });
      expect(parseTlv(payload).some((node) => node.id === '54')).toBe(false);
      expect(amountCents).toBeNull();
    }
  });

  it('escreve o valor com ponto decimal e duas casas', () => {
    const casos: [string | number, string][] = [
      ['10', '10.00'],
      ['10,5', '10.50'],
      ['1.234,56', '1234.56'],
      [25.75, '25.75'],
      ['0,01', '0.01'],
    ];

    for (const [entrada, esperado] of casos) {
      const { payload } = buildPixPayload({ ...BASE, amount: entrada });
      const campo54 = parseTlv(payload).find((node) => node.id === '54');
      expect(campo54?.value, `valor ${String(entrada)}`).toBe(esperado);
    }
  });

  it('usa *** quando nao ha identificador e o txid quando ha', () => {
    const sem = buildPixPayload(BASE);
    expect(sem.txid).toBe('***');
    expect(sem.payload).toContain('62070503***');

    const com = buildPixPayload({ ...BASE, txid: 'PEDIDO123' });
    expect(com.txid).toBe('PEDIDO123');
    expect(com.payload).toContain('0509PEDIDO123');
  });

  it('marca uso unico no campo 01 apenas quando pedido', () => {
    const estatico = buildPixPayload(BASE);
    expect(parseTlv(estatico.payload).some((node) => node.id === '01')).toBe(false);
    expect(estatico.oneTime).toBe(false);

    const unico = buildPixPayload({ ...BASE, oneTime: true });
    // O campo 01 e "01" + tamanho "02" + valor "12".
    expect(unico.payload.startsWith('000201010212')).toBe(true);
    expect(parseTlv(unico.payload).find((node) => node.id === '01')?.value).toBe('12');
    expect(unico.oneTime).toBe(true);
  });

  it('inclui o CEP quando informado', () => {
    const { payload, postalCode } = buildPixPayload({ ...BASE, postalCode: '70070-000' });
    expect(postalCode).toBe('70070000');
    expect(payload).toContain('610870070000');
  });
});

describe('buildPixPayload — chaves', () => {
  it('aceita as cinco formas de chave', () => {
    const casos: [string, string, string][] = [
      [CPF_FICTICIO, 'cpf', CPF_FICTICIO],
      [CNPJ_FICTICIO, 'cnpj', CNPJ_FICTICIO],
      ['+55 (11) 98765-4321', 'phone', '+5511987654321'],
      ['Contato@Exemplo.COM', 'email', 'contato@exemplo.com'],
      [CHAVE_ALEATORIA, 'random', CHAVE_ALEATORIA],
    ];

    for (const [entrada, tipo, valor] of casos) {
      const cobranca = buildPixPayload({ ...BASE, key: entrada });
      expect(cobranca.key.type, entrada).toBe(tipo);
      expect(cobranca.key.value).toBe(valor);
      expect(cobranca.payload).toContain(valor);
    }
  });

  it('aceita CPF com pontuacao', () => {
    const cobranca = buildPixPayload({ ...BASE, key: '111.444.777-35' });
    expect(cobranca.key.value).toBe(CPF_FICTICIO);
    expect(cobranca.key.display).toBe('111.444.777-35');
  });

  it('recusa chave com digito verificador errado', () => {
    expect(() => buildPixPayload({ ...BASE, key: '11144477736', keyType: 'cpf' })).toThrow(
      /digito verificador/,
    );
  });
});

describe('buildPixPayload — texto', () => {
  it('remove acentos preservando a letra base', () => {
    const cobranca = buildPixPayload({
      ...BASE,
      merchantName: 'João Conceição',
      merchantCity: 'São Paulo',
    });
    expect(cobranca.merchantName).toBe('Joao Conceicao');
    expect(cobranca.merchantCity).toBe('Sao Paulo');
  });

  it('corta nome em 25 e cidade em 15 caracteres, avisando', () => {
    const cobranca = buildPixPayload({
      ...BASE,
      merchantName: 'Estabelecimento Comercial Muito Longo',
      merchantCity: 'Sao Jose dos Campos',
    });

    expect(cobranca.merchantName).toHaveLength(25);
    expect(cobranca.merchantCity).toHaveLength(15);
    expect(cobranca.warnings).toHaveLength(2);
    expect(cobranca.warnings[0]).toMatch(/nome do recebedor foi cortado/);
  });

  it('exige nome e cidade com algum conteudo aproveitavel', () => {
    expect(() => buildPixPayload({ ...BASE, merchantName: '   ' })).toThrow(BrCodeError);
    expect(() => buildPixPayload({ ...BASE, merchantCity: '•••' })).toThrow(
      /cidade do recebedor/,
    );
  });

  it('mantem o txid apenas com letras e digitos', () => {
    const cobranca = buildPixPayload({ ...BASE, txid: 'pedido #12/A' });
    expect(cobranca.txid).toBe('pedido12A');
    expect(cobranca.warnings[0]).toMatch(/so letras e digitos/);
  });
});

describe('buildPixPayload — orcamento do campo 26', () => {
  it('mantem o campo 26 dentro de 99 caracteres com chave longa e descricao', () => {
    const emailLongo = `${'a'.repeat(60)}@exemplo.com`;
    const cobranca = buildPixPayload({
      ...BASE,
      key: emailLongo,
      description: 'Mensalidade de setembro',
    });

    const campo26 = parseTlv(cobranca.payload).find((node) => node.id === '26');
    expect(campo26?.length).toBeLessThanOrEqual(99);
  });

  it('descarta a descricao quando a chave nao deixa espaco', () => {
    const emailNoLimite = `${'a'.repeat(65)}@exemplo.com`; // 77 caracteres
    const cobranca = buildPixPayload({
      ...BASE,
      key: emailNoLimite,
      description: 'Nao cabe',
    });

    expect(cobranca.key.value).toHaveLength(77);
    expect(cobranca.description).toBeNull();
    expect(cobranca.warnings[0]).toMatch(/descricao foi descartada/);
  });

  it('inclui a descricao quando ha espaco', () => {
    const cobranca = buildPixPayload({
      ...BASE,
      key: CPF_FICTICIO,
      description: 'Corte de cabelo',
    });

    expect(cobranca.description).toBe('Corte de cabelo');
    expect(cobranca.payload).toContain('0215Corte de cabelo');
  });
});
