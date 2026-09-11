/**
 * Download de arquivos gerados em memoria.
 *
 * Tudo e criado no proprio navegador a partir de um Blob local: nenhum dado sai
 * do dispositivo para virar arquivo.
 */

export function baixarBlob(nomeArquivo: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  // O objeto so pode ser revogado depois que o navegador iniciou o download.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function baixarTexto(nomeArquivo: string, conteudo: string, tipoMime: string): void {
  baixarBlob(nomeArquivo, new Blob([conteudo], { type: `${tipoMime};charset=utf-8` }));
}

/**
 * Monta um nome de arquivo seguro a partir de texto livre.
 * "Padaria do Ze" com valor 10.00 vira "pix-padaria-do-ze-10-00.png".
 */
export function nomeDeArquivo(partes: readonly string[], extensao: string): string {
  const miolo = partes
    .filter((parte) => parte.trim() !== '')
    .join('-')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  return `${miolo === '' ? 'pix' : miolo}.${extensao}`;
}

/**
 * Copia texto para a area de transferencia.
 *
 * A API moderna exige contexto seguro (https ou localhost). O caminho antigo
 * com execCommand fica como reserva para quando a pagina for aberta direto do
 * sistema de arquivos.
 */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard !== undefined && window.isSecureContext) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // Cai para a alternativa abaixo.
  }

  try {
    const area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const deuCerto = document.execCommand('copy');
    area.remove();
    return deuCerto;
  } catch {
    return false;
  }
}
