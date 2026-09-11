import type { DecodedField } from '../brcode/index.js';
import { escapar } from './dom.js';

/**
 * Tabela com a arvore de campos TLV.
 *
 * E a parte didatica do projeto: mostra cada ID, o tamanho que ele declara e o
 * valor, com os subcampos dos templates recuados. Quem nunca viu um BR Code
 * consegue ligar a string crua ao significado de cada pedaco.
 */
export function tabelaDeCampos(campos: readonly DecodedField[]): string {
  const linhas = campos.flatMap((campo) => [
    linha(campo, false),
    ...(campo.children ?? []).map((filho) => linha(filho, true)),
  ]);

  return (
    '<div class="tabela-rolagem"><table class="campos">' +
    '<thead><tr><th>ID</th><th>Campo</th><th>Tam.</th><th>Valor</th></tr></thead>' +
    `<tbody>${linhas.join('')}</tbody>` +
    '</table></div>'
  );
}

function linha(campo: DecodedField, ehFilho: boolean): string {
  const marca = ehFilho ? ' data-filho="1"' : '';
  const valor = campo.value === '' ? '<em>vazio</em>' : escapar(campo.value);

  return (
    `<tr${marca}>` +
    `<td>${escapar(campo.id)}</td>` +
    `<td class="campos__nome">${escapar(campo.name)}</td>` +
    `<td>${campo.length}</td>` +
    `<td class="campos__valor">${valor}</td>` +
    '</tr>'
  );
}
