import type { QrMatrix } from './render.js';

/**
 * Desenho da matriz em canvas, para gerar PNG.
 *
 * O PNG e desenhado a partir da mesma matriz que gera o SVG, e nao convertido a
 * partir do SVG. Converter passaria por carregar uma imagem e esbarraria em
 * diferencas de suavizacao entre navegadores; desenhar retangulo a retangulo
 * garante modulo com borda exata, que e o que um leitor de QR precisa.
 */

export interface QrCanvasOptions {
  /** Pixels por modulo. */
  readonly escala?: number;
  /** Margem em modulos. */
  readonly margem?: number;
  readonly dark?: string;
  readonly light?: string;
}

/** Lado minimo do PNG exportado, em pixels. */
const LADO_MINIMO = 720;

export function desenharQrEmCanvas(
  canvas: HTMLCanvasElement,
  matrix: QrMatrix,
  opcoes: QrCanvasOptions = {},
): void {
  const margem = opcoes.margem ?? 4;
  const total = matrix.size + margem * 2;
  // Escala inteira: uma fracionaria deixaria os modulos com larguras
  // desiguais depois do arredondamento e prejudicaria a leitura.
  const escala = opcoes.escala ?? Math.max(4, Math.ceil(LADO_MINIMO / total));

  canvas.width = total * escala;
  canvas.height = total * escala;

  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    throw new Error('Nao foi possivel obter o contexto 2d do canvas.');
  }

  ctx.fillStyle = opcoes.light ?? '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = opcoes.dark ?? '#0f172a';
  for (let linha = 0; linha < matrix.size; linha += 1) {
    for (let coluna = 0; coluna < matrix.size; coluna += 1) {
      if (matrix.modules[linha]?.[coluna] === true) {
        ctx.fillRect((coluna + margem) * escala, (linha + margem) * escala, escala, escala);
      }
    }
  }
}

export function canvasParaBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error('Nao foi possivel gerar o PNG.'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}
