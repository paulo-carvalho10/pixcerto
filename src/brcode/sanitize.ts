/**
 * O BR Code precisa ser ASCII imprimivel. Um "Joao" com til vira dois bytes em
 * UTF-8 e desalinha a contagem de tamanho do campo, o que faz o aplicativo do
 * banco recusar o QR. Todo texto livre passa por aqui antes de virar campo.
 */

/** Caracteres que a decomposicao Unicode nao resolve sozinha. */
const SUBSTITUICOES: ReadonlyMap<string, string> = new Map([
  ['ß', 'ss'], // eszett
  ['æ', 'ae'],
  ['Æ', 'AE'],
  ['ø', 'o'],
  ['Ø', 'O'],
  ['đ', 'd'],
  ['Đ', 'D'],
  ['ª', 'a'], // ordinal feminino
  ['º', 'o'], // ordinal masculino
  ['‘', "'"],
  ['’', "'"],
  ['“', '"'],
  ['”', '"'],
  ['–', '-'],
  ['—', '-'],
  ['…', '...'],
  [' ', ' '], // espaco inquebravel
]);

/**
 * Tira acentos preservando a letra base: "Cafe com Acucar" sai legivel, nao
 * mutilado. Usa decomposicao NFD e descarta as marcas combinantes.
 */
export function removeAccents(text: string): string {
  const substituido = [...text].map((char) => SUBSTITUICOES.get(char) ?? char).join('');
  return substituido.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Deixa o texto pronto para virar um campo EMV: sem acento, sem caractere fora
 * do ASCII imprimivel, sem espaco duplicado e dentro do limite de tamanho.
 *
 * Truncar em vez de recusar e deliberado: um nome comprido demais nao deve
 * impedir a pessoa de gerar a cobranca. A interface avisa quando isso acontece
 * comparando o texto original com o resultado.
 */
export function sanitizeText(text: string, maxLength: number): string {
  const semAcento = removeAccents(text);
  // A ordem importa: quebras de linha e tabulacoes viram espaco antes de o
  // filtro ASCII agir, senao "linha\numa" sairia como "linhauma". Depois de
  // remover simbolos o colapso se repete, para nao sobrar espaco duplo onde
  // havia um emoji entre duas palavras.
  const separadoresNormais = semAcento.replace(/\s+/g, ' ');
  const somenteAscii = separadoresNormais.replace(/[^\x20-\x7E]/g, '');
  return somenteAscii.replace(/ {2,}/g, ' ').trim().slice(0, maxLength);
}

/**
 * O txid (campo 62/05) e mais restrito que o texto livre: o padrao aceita
 * apenas letras e digitos, ate 25 caracteres.
 */
export function sanitizeTxid(text: string, maxLength = 25): string {
  return removeAccents(text)
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, maxLength);
}
