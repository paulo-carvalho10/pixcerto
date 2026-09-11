import {
  decodePix,
  PIX_KEY_TYPE_LABELS,
  type DecodedPix,
} from '../brcode/index.js';
import { el, escapar, mostrar } from './dom.js';
import { tabelaDeCampos } from './fields.js';

/**
 * Painel de conferencia: cola-se um "Pix copia e cola" e ele mostra a arvore de
 * campos, o resumo e o veredito do CRC.
 *
 * Serve para duas coisas: entender um codigo recebido de terceiro e estudar o
 * formato, que e o motivo de a tabela mostrar ID, tamanho e valor crus ao lado
 * do nome de cada campo.
 */

const EXEMPLO =
  '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-426655440000' +
  '5204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D';

export function iniciarConferidor(): void {
  const painel = el<HTMLElement>('[data-painel="conferir"]');
  const campo = el<HTMLTextAreaElement>('#codigo');
  const saida = el<HTMLElement>('[data-conferir]', painel);
  const vazio = el<HTMLElement>('[data-conferirVazio]', painel);

  function atualizar(): void {
    if (campo.value.trim() === '') {
      saida.innerHTML = '';
      mostrar(vazio, true);
      return;
    }

    mostrar(vazio, false);
    saida.innerHTML = montar(decodePix(campo.value));
  }

  campo.addEventListener('input', atualizar);

  el<HTMLButtonElement>('#exemploConferir').addEventListener('click', () => {
    campo.value = EXEMPLO;
    atualizar();
  });

  atualizar();
}

function montar(lido: DecodedPix): string {
  return diagnostico(lido) + resumo(lido) + tabelaDeCampos(lido.fields);
}

function diagnostico(lido: DecodedPix): string {
  if (lido.ok) {
    return (
      '<div class="diagnostico diagnostico--ok">' +
      `<strong>Código válido.</strong> O CRC16 confere (${escapar(lido.crc.declared ?? '')}) ` +
      'e a estrutura segue o padrão do BR Code.' +
      '</div>'
    );
  }

  const itens = lido.problems.map((problema) => `<li>${escapar(problema)}</li>`).join('');
  return (
    '<div class="diagnostico diagnostico--erro">' +
    `<strong>${lido.problems.length === 1 ? 'Um problema' : `${lido.problems.length} problemas`} ` +
    'neste código:</strong>' +
    `<ul>${itens}</ul>` +
    '</div>'
  );
}

function resumo(lido: DecodedPix): string {
  const s = lido.summary;

  const linhas: [string, string | null][] = [
    ['Chave', s.key],
    ['Tipo da chave', s.keyType === null ? null : PIX_KEY_TYPE_LABELS[s.keyType]],
    ['URL do payload', s.payloadUrl],
    ['Recebedor', s.merchantName],
    ['Cidade', s.merchantCity],
    ['Valor', s.amount === null ? 'livre (definido por quem paga)' : `R$ ${s.amount}`],
    ['Identificador', s.txid ?? 'sem identificador (***)'],
    ['Descrição', s.description],
    ['Moeda', s.currency === '986' ? '986 (real)' : s.currency],
    ['País', s.country],
    ['Uso único', s.oneTime ? 'sim' : 'não'],
    [
      'CRC16',
      lido.crc.calculated === null
        ? null
        : lido.crc.valid
          ? `${lido.crc.declared} (confere)`
          : `${lido.crc.declared} declarado, ${lido.crc.calculated} calculado`,
    ],
  ];

  const itens = linhas
    .filter((par): par is [string, string] => par[1] !== null)
    .map(
      ([rotulo, valor]) =>
        `<div><dt>${escapar(rotulo)}</dt><dd>${escapar(valor)}</dd></div>`,
    )
    .join('');

  return `<dl class="resumo">${itens}</dl>`;
}
