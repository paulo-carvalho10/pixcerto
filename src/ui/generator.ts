import {
  BrCodeError,
  buildPixPayload,
  decodePix,
  formatCentsForDisplay,
  MAX_MERCHANT_CITY,
  MAX_MERCHANT_NAME,
  parseAmountToCents,
  PIX_KEY_TYPE_LABELS,
  sanitizeText,
  tryNormalizePixKey,
  type PixCharge,
  type PixChargeInput,
  type PixKeyType,
} from '../brcode/index.js';
import { canvasParaBlob, desenharQrEmCanvas } from '../qr/canvas.js';
import { buildQrMatrix, matrixToSvg, renderQrSvg, type QrMatrix } from '../qr/render.js';
import { el, escapar, mostrar, piscar, todos } from './dom.js';
import { baixarBlob, baixarTexto, copiarTexto, nomeDeArquivo } from './download.js';
import { tabelaDeCampos } from './fields.js';
import { abrirCartaz } from './poster.js';

interface EstadoGerador {
  cobranca: PixCharge | null;
  matriz: QrMatrix | null;
}

const EXEMPLO: Readonly<Record<string, string>> = {
  chave: 'contato@barbeariahorizonte.com.br',
  nome: 'Barbearia Horizonte',
  cidade: 'Sao Paulo',
  valor: '45,00',
  txid: 'CORTE2026',
};

export function iniciarGerador(): void {
  const formulario = el<HTMLFormElement>('#formulario');
  const painel = el<HTMLElement>('[data-painel="gerar"]');

  const campoChave = el<HTMLInputElement>('#chave');
  const campoTipo = el<HTMLSelectElement>('#tipoChave');
  const campoNome = el<HTMLInputElement>('#nome');
  const campoCidade = el<HTMLInputElement>('#cidade');
  const campoValor = el<HTMLInputElement>('#valor');
  const campoTxid = el<HTMLInputElement>('#txid');
  const campoDescricao = el<HTMLInputElement>('#descricao');
  const campoCep = el<HTMLInputElement>('#cep');
  const campoUsoUnico = el<HTMLInputElement>('#usoUnico');

  const caixaErro = el<HTMLElement>('[data-erro]', painel);
  const caixaConteudo = el<HTMLElement>('[data-conteudo]', painel);
  const caixaVazio = el<HTMLElement>('[data-vazio]', painel);
  const caixaQr = el<HTMLElement>('[data-qr]', painel);
  const caixaLegenda = el<HTMLElement>('[data-legenda]', painel);
  const caixaPayload = el<HTMLTextAreaElement>('[data-payload]', painel);
  const caixaAvisos = el<HTMLElement>('[data-avisos]', painel);
  const caixaCampos = el<HTMLElement>('[data-campos]', painel);

  const estado: EstadoGerador = { cobranca: null, matriz: null };

  function atualizar(): void {
    atualizarAjudaDaChave();
    atualizarContador(campoNome, MAX_MERCHANT_NAME);
    atualizarContador(campoCidade, MAX_MERCHANT_CITY);
    atualizarAjudaDoValor();
    atualizarAjudaDaDescricao();

    // Enquanto os tres campos obrigatorios nao estiverem preenchidos, o painel
    // fica no estado inicial em vez de mostrar erro a cada tecla digitada.
    const faltaPreencher =
      campoChave.value.trim() === '' ||
      campoNome.value.trim() === '' ||
      campoCidade.value.trim() === '';

    if (faltaPreencher) {
      estado.cobranca = null;
      estado.matriz = null;
      mostrar(caixaErro, false);
      mostrar(caixaConteudo, false);
      mostrar(caixaVazio, true);
      return;
    }

    try {
      const cobranca = buildPixPayload(lerFormulario());
      estado.cobranca = cobranca;
      estado.matriz = buildQrMatrix(cobranca.payload);
      desenharResultado(cobranca, estado.matriz);
    } catch (erro) {
      estado.cobranca = null;
      estado.matriz = null;
      mostrarErro(erro);
    }
  }

  function lerFormulario(): PixChargeInput {
    const tipo = campoTipo.value === '' ? undefined : (campoTipo.value as PixKeyType);

    return {
      key: campoChave.value,
      keyType: tipo,
      merchantName: campoNome.value,
      merchantCity: campoCidade.value,
      amount: campoValor.value,
      txid: campoTxid.value,
      description: campoDescricao.value,
      postalCode: campoCep.value,
      oneTime: campoUsoUnico.checked,
    };
  }

  function desenharResultado(cobranca: PixCharge, matriz: QrMatrix): void {
    mostrar(caixaErro, false);
    mostrar(caixaVazio, false);
    mostrar(caixaConteudo, true);

    caixaQr.innerHTML = matrixToSvg(matriz, {
      margin: 4,
      title: `QR Code Pix de ${cobranca.merchantName}`,
    });

    const valor =
      cobranca.amountCents === null
        ? '<strong>Valor livre</strong>'
        : `<strong>${escapar(formatCentsForDisplay(cobranca.amountCents))}</strong>`;

    caixaLegenda.innerHTML =
      `${valor}${escapar(cobranca.merchantName)} — ${escapar(cobranca.merchantCity)}<br>` +
      `<small>${escapar(PIX_KEY_TYPE_LABELS[cobranca.key.type])}: ${escapar(cobranca.key.display)}</small>`;

    caixaPayload.value = cobranca.payload;

    if (cobranca.warnings.length === 0) {
      mostrar(caixaAvisos, false);
      caixaAvisos.innerHTML = '';
    } else {
      mostrar(caixaAvisos, true);
      caixaAvisos.innerHTML = cobranca.warnings
        .map((aviso) => `<li>${escapar(aviso)}</li>`)
        .join('');
    }

    // A arvore vem do decodificador, e nao de um segundo caminho de montagem:
    // o que aparece na tela e o resultado de ler de volta o proprio payload.
    caixaCampos.innerHTML = tabelaDeCampos(decodePix(cobranca.payload).fields);
  }

  function mostrarErro(erro: unknown): void {
    const mensagem =
      erro instanceof BrCodeError
        ? erro.message
        : `Nao consegui gerar o codigo: ${String(erro)}`;

    caixaErro.textContent = mensagem;
    mostrar(caixaErro, true);
    mostrar(caixaConteudo, false);
    mostrar(caixaVazio, false);
  }

  function atualizarAjudaDaChave(): void {
    const ajuda = el<HTMLElement>('[data-ajuda="chave"]', painel);
    const bruto = campoChave.value.trim();

    if (bruto === '') {
      ajuda.textContent = 'CPF, CNPJ, telefone, e-mail ou chave aleatória.';
      ajuda.className = 'ajuda';
      campoChave.removeAttribute('aria-invalid');
      return;
    }

    const tipo = campoTipo.value === '' ? undefined : (campoTipo.value as PixKeyType);
    const resultado = tryNormalizePixKey(bruto, tipo);

    if (resultado.ok) {
      ajuda.textContent = `${PIX_KEY_TYPE_LABELS[resultado.key.type]} válido: ${resultado.key.display}`;
      ajuda.className = 'ajuda ajuda--ok';
      campoChave.removeAttribute('aria-invalid');
    } else {
      ajuda.textContent = resultado.message;
      ajuda.className = 'ajuda ajuda--erro';
      campoChave.setAttribute('aria-invalid', 'true');
    }
  }

  function atualizarContador(campo: HTMLInputElement, limite: number): void {
    const alvo = painel.querySelector<HTMLElement>(`[data-contador="${campo.id}"]`);
    if (alvo === null) return;

    // Conta o texto ja sanitizado: e o que de fato vai para o payload.
    const limpo = sanitizeText(campo.value, Number.MAX_SAFE_INTEGER);
    const excedeu = limpo.length > limite;

    alvo.textContent = excedeu
      ? `${limpo.length} de ${limite} caracteres — o excedente será cortado`
      : `${limpo.length} de ${limite} caracteres`;
    alvo.className = excedeu ? 'ajuda ajuda--erro' : 'ajuda';
  }

  function atualizarAjudaDoValor(): void {
    const ajuda = el<HTMLElement>('[data-ajuda="valor"]', painel);
    const bruto = campoValor.value.trim();

    if (bruto === '') {
      ajuda.textContent = 'Sem valor, quem paga escolhe quanto enviar.';
      ajuda.className = 'ajuda';
      campoValor.removeAttribute('aria-invalid');
      return;
    }

    try {
      const centavos = parseAmountToCents(bruto);
      ajuda.textContent = `Será cobrado ${formatCentsForDisplay(centavos)}.`;
      ajuda.className = 'ajuda ajuda--ok';
      campoValor.removeAttribute('aria-invalid');
    } catch (erro) {
      ajuda.textContent = erro instanceof BrCodeError ? erro.message : 'Valor inválido.';
      ajuda.className = 'ajuda ajuda--erro';
      campoValor.setAttribute('aria-invalid', 'true');
    }
  }

  function atualizarAjudaDaDescricao(): void {
    const ajuda = el<HTMLElement>('[data-ajuda="descricao"]', painel);
    const resultado = tryNormalizePixKey(
      campoChave.value,
      campoTipo.value === '' ? undefined : (campoTipo.value as PixKeyType),
    );

    if (!resultado.ok) {
      ajuda.textContent = 'A chave e a descrição dividem o mesmo campo de 99 caracteres.';
      ajuda.className = 'ajuda';
      return;
    }

    // 99 do campo 26, menos 18 do GUI, menos o cabecalho e a chave, menos o
    // cabecalho da propria descricao.
    const sobra = Math.max(0, Math.min(72, 99 - 18 - (4 + resultado.key.value.length) - 4));
    ajuda.textContent =
      sobra === 0
        ? 'Esta chave ocupa todo o campo 26: não sobra espaço para descrição.'
        : `Cabem ${sobra} caracteres ao lado desta chave.`;
    ajuda.className = sobra === 0 ? 'ajuda ajuda--erro' : 'ajuda';
  }

  /* ------------------------------- acoes ------------------------------- */

  async function executarAcao(acao: string, botao: HTMLButtonElement): Promise<void> {
    const cobranca = estado.cobranca;
    const matriz = estado.matriz;
    if (cobranca === null || matriz === null) return;

    const base = [
      'pix',
      cobranca.merchantName,
      cobranca.amountCents === null ? 'livre' : String(cobranca.amountCents / 100),
    ];

    switch (acao) {
      case 'copiar': {
        const copiou = await copiarTexto(cobranca.payload);
        piscar(botao, copiou ? 'Copiado!' : 'Não consegui copiar');
        if (!copiou) {
          caixaPayload.select();
        }
        break;
      }

      case 'png': {
        const canvas = document.createElement('canvas');
        desenharQrEmCanvas(canvas, matriz);
        baixarBlob(nomeDeArquivo(base, 'png'), await canvasParaBlob(canvas));
        break;
      }

      case 'svg': {
        const svg = renderQrSvg(cobranca.payload, {
          margin: 4,
          size: 512,
          title: `QR Code Pix de ${cobranca.merchantName}`,
        });
        baixarTexto(nomeDeArquivo(base, 'svg'), svg, 'image/svg+xml');
        break;
      }

      case 'cartaz': {
        if (!abrirCartaz(cobranca)) {
          piscar(botao, 'Libere o pop-up', 2400);
        }
        break;
      }

      case 'whatsapp': {
        // Sem numero de destino: abre o compartilhamento do WhatsApp e quem
        // escolhe o contato e a pessoa. Nada e enviado automaticamente.
        const valor =
          cobranca.amountCents === null
            ? ''
            : ` de ${formatCentsForDisplay(cobranca.amountCents)}`;
        const texto =
          `Cobrança Pix${valor} — ${cobranca.merchantName}\n\n` +
          `Copie o código abaixo no aplicativo do seu banco:\n\n${cobranca.payload}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
        break;
      }

      default:
        break;
    }
  }

  /* ------------------------------ ligacoes ------------------------------ */

  formulario.addEventListener('input', atualizar);
  formulario.addEventListener('change', atualizar);
  formulario.addEventListener('submit', (evento) => evento.preventDefault());

  el<HTMLButtonElement>('#exemplo').addEventListener('click', () => {
    campoChave.value = EXEMPLO['chave'] ?? '';
    campoNome.value = EXEMPLO['nome'] ?? '';
    campoCidade.value = EXEMPLO['cidade'] ?? '';
    campoValor.value = EXEMPLO['valor'] ?? '';
    campoTxid.value = EXEMPLO['txid'] ?? '';
    campoTipo.value = '';
    atualizar();
  });

  for (const botao of todos<HTMLButtonElement>('[data-acao]', painel)) {
    botao.addEventListener('click', () => {
      void executarAcao(botao.dataset['acao'] ?? '', botao).catch((erro: unknown) => {
        mostrarErro(erro);
      });
    });
  }

  caixaPayload.addEventListener('focus', () => caixaPayload.select());

  atualizar();
}
