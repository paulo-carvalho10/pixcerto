/**
 * Erro de montagem ou leitura de um BR Code.
 *
 * Existe como classe propria para que a interface possa distinguir "o usuario
 * digitou algo invalido" de um defeito de programacao.
 */
export class BrCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrCodeError';
  }
}
