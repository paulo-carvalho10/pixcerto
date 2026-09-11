/**
 * CRC16 / CCITT-FALSE, o algoritmo que o campo 63 do BR Code exige.
 *
 * Parametros (catalogo CRC RevEng, entrada CRC-16/IBM-3740):
 *   polinomio    0x1021
 *   valor inicial 0xFFFF
 *   entrada refletida  nao
 *   saida refletida    nao
 *   XOR final    0x0000
 *   check("123456789") = 0x29B1
 *
 * Nao confunda com CRC-16/ARC ou CRC-16/XMODEM: os tres usam nomes parecidos e
 * produzem resultados diferentes. O valor de conferencia acima esta coberto por
 * teste justamente para travar essa escolha.
 */
const POLYNOMIAL = 0x1021;
const INITIAL_VALUE = 0xffff;

const encoder = new TextEncoder();

/**
 * Calcula o CRC sobre os bytes da entrada.
 *
 * Uma string e convertida para UTF-8 antes do calculo. Para um BR Code valido,
 * que e sempre ASCII, isso coincide com percorrer a string caractere a
 * caractere; a conversao existe para que o decodificador tambem produza o
 * resultado certo diante de um payload malformado com acentos.
 */
export function crc16(input: string | Uint8Array): number {
  const bytes = typeof input === 'string' ? encoder.encode(input) : input;

  let crc = INITIAL_VALUE;

  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      // O teste do bit mais alto acontece antes do deslocamento.
      crc = (crc & 0x8000) !== 0 ? (crc << 1) ^ POLYNOMIAL : crc << 1;
      crc &= 0xffff;
    }
  }

  return crc;
}

/** O mesmo CRC, no formato que vai dentro do payload: 4 hexadecimais maiusculos. */
export function crc16Hex(input: string | Uint8Array): string {
  return crc16(input).toString(16).toUpperCase().padStart(4, '0');
}
