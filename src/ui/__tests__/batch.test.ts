// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { decodePix } from '../../brcode/index.js';
import { iniciarLote } from '../batch.js';
import html from '../../../index.html?raw';

const corpo = html
  .slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(/<script[\s\S]*?<\/script>/g, '');

function definir(seletor: string, valor: string): void {
  const campo = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(seletor);
  if (campo === null) throw new Error(`campo ausente: ${seletor}`);
  campo.value = valor;
  campo.dispatchEvent(new Event('input', { bubbles: true }));
}

function preencherRecebedor(): void {
  definir('#chave', '11144477735');
  definir('#nome', 'Barbearia Horizonte');
  definir('#cidade', 'Sao Paulo');
}

function visivel(seletor: string): boolean {
  const alvo = document.querySelector(seletor);
  return alvo !== null && !alvo.hasAttribute('hidden');
}

function cartoes(): Element[] {
  return Array.from(document.querySelectorAll('[data-loteGrade] .cartao'));
}

describe('geracao em lote', () => {
  beforeEach(() => {
    document.body.innerHTML = corpo;
    // O painel do lote comeca escondido no HTML; os testes mexem nele direto.
    document.querySelector('[data-painel="lote"]')?.removeAttribute('hidden');
    iniciarLote();
  });

  it('pede o recebedor antes de gerar qualquer coisa', () => {
    definir('#valores', '10,00\n20,00');

    expect(cartoes()).toHaveLength(0);
    expect(visivel('[data-loteVazio]')).toBe(true);
    expect(document.querySelector('[data-loteVazio]')?.textContent).toMatch(
      /chave, nome e cidade/,
    );
  });

  it('gera um QR por linha', () => {
    preencherRecebedor();
    definir('#valores', '25,00\n45,00\n70,00');

    expect(cartoes()).toHaveLength(3);
    expect(visivel('[data-loteAcoes]')).toBe(true);

    const legendas = cartoes().map((cartao) => cartao.textContent ?? '');
    expect(legendas[0]).toContain('R$ 25,00');
    expect(legendas[1]).toContain('R$ 45,00');
    expect(legendas[2]).toContain('R$ 70,00');
  });

  it('cada QR gerado carrega o valor e o identificador da sua linha', () => {
    preencherRecebedor();
    definir('#valores', '45,00;CORTE\n70,00;CORTE E BARBA');

    const svgs = document.querySelectorAll('[data-loteGrade] .cartao svg');
    expect(svgs).toHaveLength(2);

    // O texto do cartao precisa bater com o identificador saneado.
    const textos = cartoes().map((cartao) => cartao.textContent ?? '');
    expect(textos[0]).toContain('CORTE');
    expect(textos[1]).toContain('CORTEEBARBA');
  });

  it('ignora linhas em branco', () => {
    preencherRecebedor();
    definir('#valores', '10,00\n\n  \n20,00\n');
    expect(cartoes()).toHaveLength(2);
  });

  it('aponta a linha exata quando um valor nao faz sentido', () => {
    preencherRecebedor();
    definir('#valores', '10,00\nabacaxi\n30,00');

    expect(visivel('[data-loteErro]')).toBe(true);
    expect(document.querySelector('[data-loteErro]')?.textContent).toMatch(/Linha 2/);
    expect(cartoes()).toHaveLength(0);
  });

  it('recusa uma lista grande demais', () => {
    preencherRecebedor();
    definir('#valores', Array.from({ length: 61 }, (_, i) => `${i + 1},00`).join('\n'));

    expect(visivel('[data-loteErro]')).toBe(true);
    expect(document.querySelector('[data-loteErro]')?.textContent).toMatch(/limite é 60/);
  });

  it('o exemplo produz codigos que passam pelo decodificador', () => {
    preencherRecebedor();
    document.querySelector<HTMLButtonElement>('#exemploLote')?.click();

    const itens = cartoes();
    expect(itens.length).toBeGreaterThan(0);

    // Confere que o primeiro QR corresponde mesmo a um Pix valido de R$ 25,00.
    const textos = itens.map((cartao) => cartao.textContent ?? '');
    expect(textos[0]).toContain('R$ 25,00');
  });

  it('refaz a grade quando o recebedor muda', () => {
    preencherRecebedor();
    definir('#valores', '10,00');
    const antes = document.querySelector('[data-loteGrade]')?.innerHTML ?? '';

    definir('#cidade', 'Belo Horizonte');
    const depois = document.querySelector('[data-loteGrade]')?.innerHTML ?? '';

    expect(depois).not.toBe(antes);
    expect(cartoes()).toHaveLength(1);
  });
});

describe('conteudo dos codigos em lote', () => {
  beforeEach(() => {
    document.body.innerHTML = corpo;
    document.querySelector('[data-painel="lote"]')?.removeAttribute('hidden');
    iniciarLote();
  });

  it('cada payload gerado e um Pix valido com o valor e o txid da sua linha', () => {
    preencherRecebedor();
    definir('#valores', '25,00;CABELO\n45,00;CORTE\n70,00');

    const esperado: [string, string | null][] = [
      ['25.00', 'CABELO'],
      ['45.00', 'CORTE'],
      ['70.00', null],
    ];

    const payloads = cartoes().map((cartao) => cartao.getAttribute('data-payload') ?? '');
    expect(payloads).toHaveLength(3);

    for (const [indice, [valor, txid]] of esperado.entries()) {
      const lido = decodePix(payloads[indice] ?? '');

      expect(lido.ok, `linha ${indice + 1}: ${lido.problems.join(' | ')}`).toBe(true);
      expect(lido.crc.valid).toBe(true);
      expect(lido.summary.amount).toBe(valor);
      expect(lido.summary.txid).toBe(txid);
      expect(lido.summary.key).toBe('11144477735');
      expect(lido.summary.merchantName).toBe('Barbearia Horizonte');
    }
  });

  it('os codigos diferem entre si apenas no que deveria mudar', () => {
    preencherRecebedor();
    definir('#valores', '10,00\n20,00');

    const [primeiro = '', segundo = ''] = cartoes().map(
      (cartao) => cartao.getAttribute('data-payload') ?? '',
    );

    expect(primeiro).not.toBe(segundo);
    expect(decodePix(primeiro).summary.merchantName).toBe(
      decodePix(segundo).summary.merchantName,
    );
  });
});
