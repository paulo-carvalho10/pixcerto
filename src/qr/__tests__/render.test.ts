import { describe, expect, it } from 'vitest';
import { buildPixPayload } from '../../brcode/index.js';
import { buildQrMatrix, matrixToSvg, renderQrSvg, type QrMatrix } from '../render.js';

const PAYLOAD = buildPixPayload({
  key: '123e4567-e12b-12d1-a456-426655440000',
  merchantName: 'Fulano de Tal',
  merchantCity: 'BRASILIA',
}).payload;

describe('buildQrMatrix', () => {
  it('produz uma matriz quadrada com tamanho valido de QR', () => {
    const matrix = buildQrMatrix(PAYLOAD);

    expect(matrix.modules).toHaveLength(matrix.size);
    for (const linha of matrix.modules) {
      expect(linha).toHaveLength(matrix.size);
    }

    // As versoes de QR vao de 21x21 (v1) subindo de 4 em 4 modulos.
    expect(matrix.size).toBeGreaterThanOrEqual(21);
    expect((matrix.size - 21) % 4).toBe(0);
  });

  it('coloca os tres padroes de deteccao nos cantos certos', () => {
    const matrix = buildQrMatrix(PAYLOAD);
    const ultimo = matrix.size - 7;

    // Um finder pattern e um quadrado 7x7: borda escura, anel claro, nucleo 3x3.
    for (const [linha0, coluna0] of [
      [0, 0],
      [0, ultimo],
      [ultimo, 0],
    ] as const) {
      expect(ehFinderPattern(matrix, linha0, coluna0), `canto ${linha0},${coluna0}`).toBe(true);
    }

    // O canto inferior direito nao tem finder pattern.
    expect(ehFinderPattern(matrix, ultimo, ultimo)).toBe(false);
  });

  it('cresce conforme o texto aumenta', () => {
    const curto = buildQrMatrix('PIX');
    const longo = buildQrMatrix('A'.repeat(400));
    expect(longo.size).toBeGreaterThan(curto.size);
  });

  it('gera matriz maior com correcao de erro mais alta', () => {
    const media = buildQrMatrix(PAYLOAD, 'M');
    const alta = buildQrMatrix(PAYLOAD, 'H');
    expect(alta.size).toBeGreaterThanOrEqual(media.size);
  });

  it('recusa texto vazio', () => {
    expect(() => buildQrMatrix('')).toThrow(/texto esta vazio/);
  });
});

describe('matrixToSvg', () => {
  it('monta um SVG com viewBox contando a margem dos dois lados', () => {
    const matrix = buildQrMatrix(PAYLOAD);
    const svg = matrixToSvg(matrix, { margin: 4 });
    const total = matrix.size + 8;

    expect(svg.startsWith('<svg ')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain(`viewBox="0 0 ${total} ${total}"`);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('desenha um subcaminho por modulo escuro', () => {
    const matrix = buildQrMatrix(PAYLOAD);
    const svg = matrixToSvg(matrix);

    const escuros = matrix.modules.flat().filter(Boolean).length;
    const subcaminhos = (svg.match(/M\d+ \d+h1v1h-1z/g) ?? []).length;
    expect(subcaminhos).toBe(escuros);
  });

  it('respeita cores, tamanho e margem informados', () => {
    const matrix = buildQrMatrix(PAYLOAD);
    const svg = matrixToSvg(matrix, {
      margin: 2,
      dark: '#123456',
      light: '#fedcba',
      size: 320,
    });

    expect(svg).toContain(`viewBox="0 0 ${matrix.size + 4} ${matrix.size + 4}"`);
    expect(svg).toContain('width="320" height="320"');
    expect(svg).toContain('fill="#123456"');
    expect(svg).toContain('fill="#fedcba"');
  });

  it('escapa o titulo para nao quebrar o XML', () => {
    const matrix = buildQrMatrix('PIX');
    const svg = matrixToSvg(matrix, { title: 'Pix de "Ze" & Cia <teste>' });

    expect(svg).toContain('<title>Pix de &quot;Ze&quot; &amp; Cia &lt;teste&gt;</title>');
    expect(svg).not.toContain('<teste>');
  });

  it('tem tantos modulos escuros quanto claros, em ordem de grandeza', () => {
    // Um QR bem formado fica perto de metade e metade; um erro grosseiro de
    // leitura da matriz produziria quase tudo claro ou quase tudo escuro.
    const matrix = buildQrMatrix(PAYLOAD);
    const total = matrix.size * matrix.size;
    const escuros = matrix.modules.flat().filter(Boolean).length;
    const proporcao = escuros / total;

    expect(proporcao).toBeGreaterThan(0.3);
    expect(proporcao).toBeLessThan(0.7);
  });
});

describe('renderQrSvg', () => {
  it('vai do texto direto ao SVG', () => {
    const svg = renderQrSvg(PAYLOAD, { size: 256, title: 'Cobranca Pix' });
    expect(svg).toContain('width="256"');
    expect(svg).toContain('<title>Cobranca Pix</title>');
  });
});

/** Confere o quadrado 7x7 de deteccao: borda escura, anel claro, nucleo 3x3 escuro. */
function ehFinderPattern(matrix: QrMatrix, linha0: number, coluna0: number): boolean {
  for (let linha = 0; linha < 7; linha += 1) {
    for (let coluna = 0; coluna < 7; coluna += 1) {
      const naBorda = linha === 0 || linha === 6 || coluna === 0 || coluna === 6;
      const noAnel = linha === 1 || linha === 5 || coluna === 1 || coluna === 5;
      const esperado = naBorda ? true : noAnel ? false : true;

      if (matrix.modules[linha0 + linha]?.[coluna0 + coluna] !== esperado) {
        return false;
      }
    }
  }
  return true;
}
