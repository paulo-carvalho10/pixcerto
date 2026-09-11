/** Busca um elemento e falha alto se ele nao existir. */
export function el<T extends Element>(seletor: string, raiz: ParentNode = document): T {
  const encontrado = raiz.querySelector<T>(seletor);
  if (encontrado === null) {
    throw new Error(`Elemento nao encontrado: ${seletor}`);
  }
  return encontrado;
}

export function todos<T extends Element>(seletor: string, raiz: ParentNode = document): T[] {
  return Array.from(raiz.querySelectorAll<T>(seletor));
}

/** Escapa texto vindo do usuario antes de entrar em HTML montado a mao. */
export function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Mostra ou esconde pelo atributo hidden, e nao por estilo. */
export function mostrar(elemento: Element, visivel: boolean): void {
  if (visivel) {
    elemento.removeAttribute('hidden');
  } else {
    elemento.setAttribute('hidden', '');
  }
}

/**
 * Troca o texto de um botao por uma confirmacao curta e devolve o original.
 * Usado no "Copiar", em que um retorno visivel vale mais que um alerta.
 */
export function piscar(botao: HTMLButtonElement, texto: string, ms = 1600): void {
  const original = botao.dataset['textoOriginal'] ?? botao.textContent ?? '';
  botao.dataset['textoOriginal'] = original;
  botao.textContent = texto;
  botao.disabled = true;

  window.setTimeout(() => {
    botao.textContent = original;
    botao.disabled = false;
  }, ms);
}
