import {
  BrCodeError,
  buildPixPayload,
  formatCentsForDisplay,
  parseAmountToCents,
  type PixCharge,
  type PixChargeInput,
  type PixKeyType,
} from '../brcode/index.js';
import { canvasParaBlob, desenharQrEmCanvas } from '../qr/canvas.js';
import { buildQrMatrix, matrixToSvg } from '../qr/render.js';
import { el, escapar, mostrar, piscar, todos } from './dom.js';
import { baixarBlob, nomeDeArquivo } from './download.js';
import { abrirCartazes } from './poster.js';

/**
 * Geracao em lote: um QR por valor, para o mesmo recebedor.
 *
 * O recebedor vem da aba de geracao em vez de ser redigitado aqui. Sao os
 * mesmos dados, e mante-los em um lugar so evita a situacao em que as duas abas
 * discordam sobre quem esta cobrando.
 */

// Identificadores sem espaco de proposito: o padrao so aceita letras e digitos
// no txid, e um exemplo com espaco sairia saneado na tela como "CORTEEBARBA".
const EXEMPLO = ['25,00;CABELO', '45,00;CORTE', '70,00;CORTEBARBA', '15,00;SOBRANCELHA'].join(
  '\n',
);

/** Teto de seguranca: cada item gera uma matriz de QR e uma folha de cartaz. */
const MAXIMO_DE_ITENS = 60;

interface ItemDoLote {
  readonly cobranca: PixCharge;
  readonly rotulo: string;
}

export function iniciarLote(): void {
  const painel = el<HTMLElement>('[data-painel="lote"]');
  const campoValores = el<HTMLTextAreaElement>('#valores');
  const caixaErro = el<HTMLElement>('[data-loteErro]', painel);
  const caixaAcoes = el<HTMLElement>('[data-loteAcoes]', painel);
  const caixaGrade = el<HTMLElement>('[data-loteGrade]', painel);
  const caixaVazio = el<HTMLElement>('[data-loteVazio]', painel);

  let itens: ItemDoLote[] = [];

  function lerRecebedor(): Pick<
    PixChargeInput,
    'key' | 'keyType' | 'merchantName' | 'merchantCity' | 'description' | 'postalCode'
  > {
    const tipo = el<HTMLSelectElement>('#tipoChave').value;
    return {
      key: el<HTMLInputElement>('#chave').value,
      keyType: tipo === '' ? undefined : (tipo as PixKeyType),
      merchantName: el<HTMLInputElement>('#nome').value,
      merchantCity: el<HTMLInputElement>('#cidade').value,
      description: el<HTMLInputElement>('#descricao').value,
      postalCode: el<HTMLInputElement>('#cep').value,
    };
  }

  function atualizar(): void {
    const linhas = campoValores.value
      .split('\n')
      .map((linha) => linha.trim())
      .filter((linha) => linha !== '');

    if (linhas.length === 0) {
      limpar('Preencha o recebedor na primeira aba e liste os valores aqui.');
      return;
    }

    const recebedor = lerRecebedor();
    if (
      recebedor.key.trim() === '' ||
      recebedor.merchantName.trim() === '' ||
      recebedor.merchantCity.trim() === ''
    ) {
      limpar('Falta preencher chave, nome e cidade na aba "Gerar cobrança".');
      return;
    }

    if (linhas.length > MAXIMO_DE_ITENS) {
      mostrarErro(
        `São ${linhas.length} valores e o limite é ${MAXIMO_DE_ITENS}. ` +
          'Divida a lista em partes menores.',
      );
      return;
    }

    try {
      itens = linhas.map((linha, indice) => montarItem(linha, indice, recebedor));
    } catch (erro) {
      mostrarErro(erro instanceof BrCodeError ? erro.message : String(erro));
      return;
    }

    mostrar(caixaErro, false);
    mostrar(caixaVazio, false);
    mostrar(caixaAcoes, true);
    caixaGrade.innerHTML = itens.map(cartao).join('');
  }

  function limpar(mensagem: string): void {
    itens = [];
    caixaGrade.innerHTML = '';
    caixaVazio.textContent = mensagem;
    mostrar(caixaErro, false);
    mostrar(caixaAcoes, false);
    mostrar(caixaVazio, true);
  }

  function mostrarErro(mensagem: string): void {
    itens = [];
    caixaGrade.innerHTML = '';
    caixaErro.textContent = mensagem;
    mostrar(caixaErro, true);
    mostrar(caixaAcoes, false);
    mostrar(caixaVazio, false);
  }

  async function executarAcao(acao: string, botao: HTMLButtonElement): Promise<void> {
    if (itens.length === 0) return;

    if (acao === 'cartazes') {
      if (!abrirCartazes(itens.map((item) => item.cobranca))) {
        piscar(botao, 'Libere o pop-up', 2400);
      }
      return;
    }

    if (acao === 'png') {
      for (const item of itens) {
        const canvas = document.createElement('canvas');
        desenharQrEmCanvas(canvas, buildQrMatrix(item.cobranca.payload));
        const nome = nomeDeArquivo(['pix', item.cobranca.merchantName, item.rotulo], 'png');
        baixarBlob(nome, await canvasParaBlob(canvas));
        // Os navegadores engasgam com muitos downloads disparados de uma vez.
        await esperar(150);
      }
      piscar(botao, `${itens.length} arquivos`, 2000);
    }
  }

  el<HTMLButtonElement>('#exemploLote').addEventListener('click', () => {
    campoValores.value = EXEMPLO;
    atualizar();
  });

  campoValores.addEventListener('input', atualizar);

  // O lote depende do recebedor, que e digitado na outra aba.
  el<HTMLFormElement>('#formulario').addEventListener('input', () => {
    if (!painel.hasAttribute('hidden')) atualizar();
  });

  for (const botao of todos<HTMLButtonElement>('[data-loteAcao]', painel)) {
    botao.addEventListener('click', () => {
      void executarAcao(botao.dataset['loteAcao'] ?? '', botao).catch((erro: unknown) => {
        mostrarErro(String(erro));
      });
    });
  }

  // Ao entrar na aba, refaz com o recebedor que estiver preenchido no momento.
  for (const aba of todos<HTMLButtonElement>('.aba')) {
    if (aba.dataset['aba'] === 'lote') {
      aba.addEventListener('click', atualizar);
    }
  }
}

/**
 * Cada linha e "valor" ou "valor;identificador".
 *
 * O ponto e virgula separa porque o valor pode conter espaco ("R$ 25,00") e
 * ponto e virgula ("25,00") ja tem significado de decimal. Sem identificador, o
 * numero da linha serve de rotulo para o nome do arquivo.
 */
function montarItem(
  linha: string,
  indice: number,
  recebedor: Partial<PixChargeInput>,
): ItemDoLote {
  const [valorBruto = '', txidBruto = ''] = linha.split(';', 2).map((parte) => parte.trim());

  let centavos: number;
  try {
    centavos = parseAmountToCents(valorBruto);
  } catch (erro) {
    const motivo = erro instanceof BrCodeError ? erro.message : String(erro);
    throw new BrCodeError(`Linha ${indice + 1} ("${linha}"): ${motivo}`);
  }

  const cobranca = buildPixPayload({
    ...(recebedor as PixChargeInput),
    amount: centavos / 100,
    txid: txidBruto === '' ? undefined : txidBruto,
  });

  return {
    cobranca,
    rotulo: txidBruto === '' ? String(indice + 1) : txidBruto,
  };
}

function cartao(item: ItemDoLote): string {
  const svg = matrixToSvg(buildQrMatrix(item.cobranca.payload), {
    margin: 2,
    title: `QR Pix de ${formatCentsForDisplay(item.cobranca.amountCents ?? 0)}`,
  });

  const identificador =
    item.cobranca.txid === '***'
      ? ''
      : `<span class="cartao__txid">${escapar(item.cobranca.txid)}</span>`;

  return (
    `<figure class="cartao" data-payload="${escapar(item.cobranca.payload)}">` +
    `<div class="cartao__qr">${svg}</div>` +
    '<figcaption>' +
    `<strong>${escapar(formatCentsForDisplay(item.cobranca.amountCents ?? 0))}</strong>` +
    identificador +
    '</figcaption>' +
    '</figure>'
  );
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
