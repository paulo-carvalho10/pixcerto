import qrcode from 'qrcode-generator';

/**
 * Geracao do QR a partir do payload.
 *
 * A biblioteca externa faz uma coisa so: transformar texto na matriz de modulos
 * pretos e brancos. O desenho e nosso, o que mantem o SVG pequeno e sob
 * controle, sem CSS nem fonte embutida, e permite gerar cartaz e PNG a partir
 * da mesma matriz.
 */

export type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

export interface QrMatrix {
  /** Modulos por lado, sem contar a margem. Sempre impar, de 21 em diante. */
  readonly size: number;
  /** `true` onde o modulo e escuro. Indexado por [linha][coluna]. */
  readonly modules: readonly (readonly boolean[])[];
}

export interface QrSvgOptions {
  /** Margem em modulos. O padrao do formato e 4, e reduzir atrapalha a leitura. */
  readonly margin?: number;
  readonly dark?: string;
  readonly light?: string;
  /** Quando definido, vira os atributos width e height do SVG, em pixels. */
  readonly size?: number;
  /** Texto para leitores de tela. */
  readonly title?: string;
}

/**
 * Nivel de correcao de erro.
 *
 * 'M' e o equilibrio usado aqui: recupera cerca de 15% de area danificada, o
 * suficiente para um cartaz impresso que vai receber dobra e sujeira, sem
 * inflar a matriz como 'Q' ou 'H' fariam num payload que ja passa de 100
 * caracteres.
 */
export const DEFAULT_ERROR_CORRECTION: ErrorCorrectionLevel = 'M';

export function buildQrMatrix(
  text: string,
  errorCorrection: ErrorCorrectionLevel = DEFAULT_ERROR_CORRECTION,
): QrMatrix {
  if (text === '') {
    throw new Error('Nao ha o que codificar: o texto esta vazio.');
  }

  // O tipo 0 deixa a biblioteca escolher a menor versao que comporte o texto.
  const qr = qrcode(0, errorCorrection);
  qr.addData(text, 'Byte');
  qr.make();

  const size = qr.getModuleCount();
  const modules: boolean[][] = [];

  for (let linha = 0; linha < size; linha += 1) {
    const atual: boolean[] = [];
    for (let coluna = 0; coluna < size; coluna += 1) {
      atual.push(qr.isDark(linha, coluna));
    }
    modules.push(atual);
  }

  return { size, modules };
}

/**
 * Desenha a matriz como um unico `<path>`.
 *
 * Um retangulo por modulo geraria centenas de elementos; um path unico com um
 * subcaminho por modulo produz um arquivo bem menor e abre igual em qualquer
 * visualizador.
 */
export function matrixToSvg(matrix: QrMatrix, options: QrSvgOptions = {}): string {
  const margin = options.margin ?? 4;
  const dark = options.dark ?? '#0f172a';
  const light = options.light ?? '#ffffff';
  const total = matrix.size + margin * 2;

  const partes: string[] = [];
  for (let linha = 0; linha < matrix.size; linha += 1) {
    for (let coluna = 0; coluna < matrix.size; coluna += 1) {
      if (matrix.modules[linha]?.[coluna] === true) {
        partes.push(`M${coluna + margin} ${linha + margin}h1v1h-1z`);
      }
    }
  }

  const dimensao =
    options.size === undefined ? '' : ` width="${options.size}" height="${options.size}"`;
  const titulo =
    options.title === undefined ? '' : `<title>${escaparXml(options.title)}</title>`;
  const rotulo =
    options.title === undefined ? ' role="img"' : ` role="img" aria-label="${escaparXml(options.title)}"`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}"${dimensao}` +
    `${rotulo} shape-rendering="crispEdges">` +
    `${titulo}` +
    `<rect width="${total}" height="${total}" fill="${light}"/>` +
    `<path fill="${dark}" d="${partes.join('')}"/>` +
    `</svg>`
  );
}

/** Atalho para o caminho mais comum: texto direto para SVG. */
export function renderQrSvg(
  text: string,
  options: QrSvgOptions & { errorCorrection?: ErrorCorrectionLevel } = {},
): string {
  const matrix = buildQrMatrix(text, options.errorCorrection ?? DEFAULT_ERROR_CORRECTION);
  return matrixToSvg(matrix, options);
}

function escaparXml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
