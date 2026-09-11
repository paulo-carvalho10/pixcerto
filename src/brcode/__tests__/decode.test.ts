import { describe, expect, it } from 'vitest';
import { decodePix } from '../decode.js';
import { template } from '../emv.js';
import { buildPixPayload, fecharComCrc, type PixChargeInput } from '../payload.js';

const EXEMPLO_BACEN =
  '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-426655440000' +
  '5204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D';

const BASE = {
  key: '123e4567-e12b-12d1-a456-426655440000',
  merchantName: 'Fulano de Tal',
  merchantCity: 'BRASILIA',
} as const;

describe('decodePix — vetor oficial', () => {
  it('le o exemplo do manual do BR Code', () => {
    const lido = decodePix(EXEMPLO_BACEN);

    expect(lido.ok).toBe(true);
    expect(lido.problems).toEqual([]);
    expect(lido.crc).toEqual({ declared: '1D3D', calculated: '1D3D', valid: true });
    expect(lido.summary.key).toBe('123e4567-e12b-12d1-a456-426655440000');
    expect(lido.summary.keyType).toBe('random');
    expect(lido.summary.merchantName).toBe('Fulano de Tal');
    expect(lido.summary.merchantCity).toBe('BRASILIA');
    expect(lido.summary.amount).toBeNull();
    expect(lido.summary.txid).toBeNull();
  });

  it('monta a arvore de campos com nomes legiveis', () => {
    const { fields } = decodePix(EXEMPLO_BACEN);

    expect(fields.map((f) => f.id)).toEqual(['00', '26', '52', '53', '58', '59', '60', '62', '63']);

    const conta = fields.find((f) => f.id === '26');
    expect(conta?.name).toBe('Dados da conta (Pix)');
    expect(conta?.children?.map((c) => [c.id, c.name, c.value])).toEqual([
      ['00', 'Identificador do arranjo (GUI)', 'br.gov.bcb.pix'],
      ['01', 'Chave Pix', '123e4567-e12b-12d1-a456-426655440000'],
    ]);

    const adicionais = fields.find((f) => f.id === '62');
    expect(adicionais?.children?.[0]?.name).toBe('Identificador da cobranca (txid)');
  });

  it('aceita GUI em maiusculas', () => {
    const { payload } = buildPixPayload(BASE);
    const comGuiMaiusculo = payload.replace('br.gov.bcb.pix', 'BR.GOV.BCB.PIX');
    // Trocar a caixa nao muda o tamanho, entao so o CRC precisa ser refeito.
    const lido = decodePix(comGuiMaiusculo);
    expect(lido.summary.key).toBe(BASE.key);
    expect(lido.problems).toEqual([
      expect.stringMatching(/CRC nao confere/),
    ]);
  });
});

describe('decodePix — ida e volta', () => {
  const casos: [string, PixChargeInput][] = [
    ['sem valor', BASE],
    ['com valor', { ...BASE, amount: '1.234,56' }],
    ['com txid', { ...BASE, amount: '10,00', txid: 'PEDIDO2026' }],
    ['com descricao', { ...BASE, key: '11144477735', description: 'Corte de cabelo' }],
    ['com CEP', { ...BASE, postalCode: '70070-000' }],
    ['uso unico', { ...BASE, oneTime: true, amount: '99,90' }],
    ['chave email', { ...BASE, key: 'contato@exemplo.com' }],
    ['chave telefone', { ...BASE, key: '+5511987654321' }],
    ['chave cnpj', { ...BASE, key: '11222333000181', amount: '0,01' }],
  ];

  for (const [nome, entrada] of casos) {
    it(`recupera os dados de um payload gerado: ${nome}`, () => {
      const cobranca = buildPixPayload(entrada);
      const lido = decodePix(cobranca.payload);

      expect(lido.ok, lido.problems.join(' | ')).toBe(true);
      expect(lido.crc.valid).toBe(true);
      expect(lido.summary.key).toBe(cobranca.key.value);
      expect(lido.summary.merchantName).toBe(cobranca.merchantName);
      expect(lido.summary.merchantCity).toBe(cobranca.merchantCity);
      expect(lido.summary.description).toBe(cobranca.description);
      expect(lido.summary.oneTime).toBe(cobranca.oneTime);

      const txidEsperado = cobranca.txid === '***' ? null : cobranca.txid;
      expect(lido.summary.txid).toBe(txidEsperado);

      if (cobranca.amountCents === null) {
        expect(lido.summary.amount).toBeNull();
      } else {
        expect(lido.summary.amount).toBe((cobranca.amountCents / 100).toFixed(2));
      }
    });
  }
});

describe('decodePix — codigos problematicos', () => {
  it('acusa CRC adulterado', () => {
    const { payload } = buildPixPayload(BASE);
    const adulterado = payload.replace('Fulano de Tal', 'Fulana de Tal');

    const lido = decodePix(adulterado);
    expect(lido.ok).toBe(false);
    expect(lido.crc.valid).toBe(false);
    expect(lido.crc.declared).not.toBe(lido.crc.calculated);
    expect(lido.problems[0]).toMatch(/CRC nao confere/);
    // Mesmo invalido, o conteudo continua sendo mostrado.
    expect(lido.summary.merchantName).toBe('Fulana de Tal');
  });

  it('acusa ausencia do campo 63', () => {
    const { payload } = buildPixPayload(BASE);
    const lido = decodePix(payload.slice(0, -8));
    expect(lido.ok).toBe(false);
    expect(lido.problems).toContain('Falta o campo 63 com o CRC16.');
  });

  it('acusa texto que nao e um QR Pix', () => {
    // Troca o GUI por outro de mesmo tamanho: a estrutura continua valida,
    // mas nao e mais um Pix.
    const { payload } = buildPixPayload(BASE);
    const outroArranjo = payload.replace('br.gov.bcb.pix', 'com.exemplo.xx');

    const lido = decodePix(outroArranjo);
    expect(lido.ok).toBe(false);
    expect(lido.summary.key).toBeNull();
    expect(lido.problems.some((p) => p.includes('br.gov.bcb.pix'))).toBe(true);
  });

  it('acusa estrutura quebrada sem lancar excecao', () => {
    const lido = decodePix('0002012658xx');
    expect(lido.ok).toBe(false);
    expect(lido.fields).toEqual([]);
    expect(lido.problems[0]).toMatch(/Nao consegui separar os campos/);
  });

  it('pede um codigo quando a entrada esta vazia', () => {
    expect(decodePix('   ').problems[0]).toMatch(/Cole um codigo Pix/);
  });

  it('tolera quebras de linha de um copiar e colar', () => {
    const quebrado = `  ${EXEMPLO_BACEN.slice(0, 40)}\r\n${EXEMPLO_BACEN.slice(40)}\n  `;
    const lido = decodePix(quebrado);
    expect(lido.crc.valid).toBe(true);
    expect(lido.ok).toBe(true);
  });

  it('preserva os espacos que fazem parte do valor dos campos', () => {
    // Remover espacos internos encurtaria o campo 59 e desalinharia todo o
    // restante da leitura.
    const lido = decodePix(EXEMPLO_BACEN);
    expect(lido.summary.merchantName).toBe('Fulano de Tal');
    expect(lido.crc.valid).toBe(true);
  });

  it('reconhece um QR dinamico pela URL do payload', () => {
    const url = 'pix.exemplo.com/qr/v2/abc123def456ghi789jkl';
    const conta = template('26', [
      ['00', 'br.gov.bcb.pix'],
      ['25', url],
    ]);
    const semCrc =
      `000201${conta}52040000530398654041.00` +
      '5802BR5913Fulano de Tal6008BRASILIA62070503***';
    const { payload } = fecharComCrc(semCrc);

    const lido = decodePix(payload);
    expect(lido.crc.valid).toBe(true);
    expect(lido.summary.payloadUrl).toBe(url);
    expect(lido.summary.oneTime).toBe(true);
    expect(lido.summary.key).toBeNull();

    const campo26 = lido.fields.find((f) => f.id === '26');
    expect(campo26?.children?.find((c) => c.id === '25')?.name).toBe(
      'URL do payload (QR dinamico)',
    );
  });
});
