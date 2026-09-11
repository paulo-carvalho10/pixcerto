import { describe, expect, it } from 'vitest';
import {
  detectPixKeyType,
  isValidCnpj,
  isValidCpf,
  normalizePixKey,
  tryNormalizePixKey,
} from '../keys.js';

/**
 * Todos os documentos abaixo sao ficticios. Os validos foram escolhidos por
 * terem digito verificador correto, nao por pertencerem a alguem.
 */
const CPF_VALIDO = '11144477735';
const CNPJ_VALIDO = '11222333000181';

describe('isValidCpf', () => {
  it('aceita CPF com digito verificador correto', () => {
    expect(isValidCpf(CPF_VALIDO)).toBe(true);
  });

  it('recusa digito verificador errado', () => {
    expect(isValidCpf('11144477734')).toBe(false);
    expect(isValidCpf('11144477725')).toBe(false);
  });

  it('recusa sequencias de digitos repetidos', () => {
    for (let d = 0; d <= 9; d += 1) {
      expect(isValidCpf(String(d).repeat(11)), String(d).repeat(11)).toBe(false);
    }
  });

  it('recusa entradas que nao sao 11 digitos', () => {
    expect(isValidCpf('1114447773')).toBe(false);
    expect(isValidCpf('111.444.777-35')).toBe(false);
  });
});

describe('isValidCnpj', () => {
  it('aceita CNPJ com digito verificador correto', () => {
    expect(isValidCnpj(CNPJ_VALIDO)).toBe(true);
  });

  it('recusa digito verificador errado', () => {
    expect(isValidCnpj('11222333000182')).toBe(false);
    expect(isValidCnpj('11222333000191')).toBe(false);
  });

  it('recusa sequencias repetidas e tamanhos errados', () => {
    expect(isValidCnpj('11111111111111')).toBe(false);
    expect(isValidCnpj('1122233300018')).toBe(false);
  });
});

describe('detectPixKeyType', () => {
  it('reconhece cada forma de chave', () => {
    expect(detectPixKeyType('contato@exemplo.com')).toBe('email');
    expect(detectPixKeyType('123e4567-e12b-12d1-a456-426655440000')).toBe('random');
    expect(detectPixKeyType(CNPJ_VALIDO)).toBe('cnpj');
    expect(detectPixKeyType(CPF_VALIDO)).toBe('cpf');
    expect(detectPixKeyType('+5511987654321')).toBe('phone');
    expect(detectPixKeyType('(11) 3456-7890')).toBe('phone');
  });

  it('resolve a ambiguidade de 11 digitos pelo digito verificador', () => {
    // CPF valido: e CPF.
    expect(detectPixKeyType(CPF_VALIDO)).toBe('cpf');
    // Celular com DDD tambem tem 11 digitos, mas nao fecha como CPF.
    expect(detectPixKeyType('11987654321')).toBe('phone');
  });

  it('devolve null para entrada vazia ou irreconhecivel', () => {
    expect(detectPixKeyType('')).toBeNull();
    expect(detectPixKeyType('   ')).toBeNull();
    expect(detectPixKeyType('nao e chave nenhuma')).toBeNull();
  });
});

describe('normalizePixKey', () => {
  it('devolve a chave no formato que entra no payload', () => {
    expect(normalizePixKey('111.444.777-35')).toMatchObject({
      type: 'cpf',
      value: CPF_VALIDO,
      display: '111.444.777-35',
    });

    expect(normalizePixKey('11.222.333/0001-81')).toMatchObject({
      type: 'cnpj',
      value: CNPJ_VALIDO,
      display: '11.222.333/0001-81',
    });

    expect(normalizePixKey('  Contato@Exemplo.COM  ')).toMatchObject({
      type: 'email',
      value: 'contato@exemplo.com',
    });

    expect(normalizePixKey('123E4567-E12B-12D1-A456-426655440000')).toMatchObject({
      type: 'random',
      value: '123e4567-e12b-12d1-a456-426655440000',
    });
  });

  it('normaliza telefone para o formato internacional', () => {
    const esperado = '+5511987654321';
    for (const entrada of [
      '+5511987654321',
      '+55 (11) 98765-4321',
      '11987654321',
      '(11) 98765-4321',
      '5511987654321',
    ]) {
      expect(normalizePixKey(entrada, 'phone').value, entrada).toBe(esperado);
    }
  });

  it('aceita telefone fixo de 8 digitos', () => {
    expect(normalizePixKey('(11) 3456-7890', 'phone').value).toBe('+551134567890');
  });

  it('permite fixar o tipo para desfazer a ambiguidade', () => {
    // 11900000083 e o caso genuinamente ambiguo: tem 11 digitos, fecha como
    // CPF e tambem e um celular plausivel (DDD 11, assinante comecando com 9).
    const AMBIGUO = '11900000083';
    expect(isValidCpf(AMBIGUO)).toBe(true);

    // Sem ajuda, a heuristica escolhe CPF porque o digito verificador fecha.
    expect(detectPixKeyType(AMBIGUO)).toBe('cpf');
    expect(normalizePixKey(AMBIGUO).type).toBe('cpf');

    // Fixando o tipo, a mesma entrada vira telefone.
    expect(normalizePixKey(AMBIGUO, 'phone').value).toBe(`+55${AMBIGUO}`);
  });

  it('escolhe telefone quando os 11 digitos nao fecham como CPF', () => {
    expect(detectPixKeyType('11987654321')).toBe('phone');
    expect(normalizePixKey('11987654321').value).toBe('+5511987654321');
  });

  it('recusa chaves malformadas com mensagem util', () => {
    expect(() => normalizePixKey('')).toThrow(/Informe a chave/);
    expect(() => normalizePixKey('11144477736', 'cpf')).toThrow(/digito verificador/);
    expect(() => normalizePixKey('sem-arroba', 'email')).toThrow(/E-mail invalido/);
    expect(() => normalizePixKey('12345', 'phone')).toThrow(/Telefone invalido/);
    expect(() => normalizePixKey('nao-e-uuid', 'random')).toThrow(/Chave aleatoria invalida/);
    expect(() => normalizePixKey('+1 555 0100', 'phone')).toThrow(/numero brasileiro/);
    expect(() => normalizePixKey('(11) 88765-4321', 'phone')).toThrow(/precisa comecar com 9/);
  });

  it('recusa chave acima de 77 caracteres', () => {
    const emailEnorme = `${'a'.repeat(70)}@exemplo.com`;
    expect(emailEnorme.length).toBeGreaterThan(77);
    expect(() => normalizePixKey(emailEnorme)).toThrow(/limite do campo e 77/);
  });
});

describe('tryNormalizePixKey', () => {
  it('devolve o erro em vez de lanca-lo', () => {
    const bom = tryNormalizePixKey(CPF_VALIDO);
    expect(bom.ok).toBe(true);

    const ruim = tryNormalizePixKey('11144477736', 'cpf');
    expect(ruim.ok).toBe(false);
    if (!ruim.ok) {
      expect(ruim.message).toMatch(/digito verificador/);
    }
  });
});
