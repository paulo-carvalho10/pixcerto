// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { buildPixPayload } from '../../brcode/index.js';
import { iniciarGerador } from '../generator.js';
// O proprio index.html do projeto, cru. Se um seletor mudar la, o teste quebra.
import html from '../../../index.html?raw';

/**
 * Teste de fiacao da interface.
 *
 * Carrega o index.html de verdade, liga o gerador nele e digita nos campos.
 * Serve para pegar o tipo de defeito que o typecheck nao ve: um seletor que
 * mudou de nome no HTML, um data-attribute escrito errado ou um evento que
 * deixou de disparar o redesenho.
 */

// O <script> do modulo sai: quem liga a interface no teste e o proprio
// iniciarGerador(), e deixar a tag faria o happy-dom tentar carregar o arquivo.
const corpo = html
  .slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(/<script[\s\S]*?<\/script>/g, '');

function digitar(seletor: string, valor: string): void {
  const campo = document.querySelector<HTMLInputElement>(seletor);
  if (campo === null) throw new Error(`campo ausente: ${seletor}`);
  campo.value = valor;
  campo.dispatchEvent(new Event('input', { bubbles: true }));
}

function visivel(seletor: string): boolean {
  const alvo = document.querySelector(seletor);
  return alvo !== null && !alvo.hasAttribute('hidden');
}

describe('interface do gerador', () => {
  beforeEach(() => {
    document.body.innerHTML = corpo;
    iniciarGerador();
  });

  it('comeca no estado vazio, sem QR e sem erro', () => {
    expect(visivel('[data-vazio]')).toBe(true);
    expect(visivel('[data-conteudo]')).toBe(false);
    expect(visivel('[data-erro]')).toBe(false);
  });

  it('desenha o QR e o payload assim que os campos obrigatorios sao preenchidos', () => {
    digitar('#chave', '123e4567-e12b-12d1-a456-426655440000');
    digitar('#nome', 'Fulano de Tal');
    digitar('#cidade', 'BRASILIA');

    expect(visivel('[data-conteudo]')).toBe(true);
    expect(visivel('[data-vazio]')).toBe(false);

    const payload = document.querySelector<HTMLTextAreaElement>('[data-payload]');
    expect(payload?.value).toBe(
      '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-426655440000' +
        '5204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D',
    );

    const svg = document.querySelector('[data-qr] svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('viewBox')).toMatch(/^0 0 \d+ \d+$/);
  });

  it('refaz o QR quando o valor muda', () => {
    digitar('#chave', '11144477735');
    digitar('#nome', 'Padaria do Ze');
    digitar('#cidade', 'Sao Paulo');

    const payloadEl = document.querySelector<HTMLTextAreaElement>('[data-payload]');
    const semValor = payloadEl?.value ?? '';

    digitar('#valor', '10,50');
    const comValor = payloadEl?.value ?? '';

    expect(comValor).not.toBe(semValor);
    expect(comValor).toContain('540510.50');
    expect(
      comValor,
    ).toBe(
      buildPixPayload({
        key: '11144477735',
        merchantName: 'Padaria do Ze',
        merchantCity: 'Sao Paulo',
        amount: '10,50',
      }).payload,
    );
  });

  it('mostra o erro quando a chave nao fecha, sem apagar o painel', () => {
    digitar('#chave', '11144477736'); // digito verificador errado
    digitar('#nome', 'Fulano de Tal');
    digitar('#cidade', 'BRASILIA');

    expect(visivel('[data-erro]')).toBe(true);
    expect(visivel('[data-conteudo]')).toBe(false);

    // 11 digitos que nao fecham como CPF nem como celular: a mensagem precisa
    // citar as duas leituras, e nao so a do palpite que a heuristica fez.
    const mensagem = document.querySelector('[data-erro]')?.textContent ?? '';
    expect(mensagem).toMatch(/CPF/);
    expect(mensagem).toMatch(/celular/);
  });

  it('reclama do CPF quando o tipo foi fixado pelo usuario', () => {
    document.querySelector<HTMLSelectElement>('#tipoChave')!.value = 'cpf';
    digitar('#chave', '11144477736');
    digitar('#nome', 'Fulano de Tal');
    digitar('#cidade', 'BRASILIA');

    expect(document.querySelector('[data-erro]')?.textContent).toMatch(/digito verificador/);
  });

  it('valida a chave enquanto se digita', () => {
    const ajuda = () => document.querySelector('[data-ajuda="chave"]');

    digitar('#chave', '111.444.777-35');
    expect(ajuda()?.className).toContain('ajuda--ok');
    expect(ajuda()?.textContent).toContain('CPF válido');

    digitar('#chave', '111.444.777-36');
    expect(ajuda()?.className).toContain('ajuda--erro');
    expect(document.querySelector('#chave')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('conta os caracteres que realmente vao para o payload', () => {
    digitar('#nome', 'João da Conceição');
    // "Joao da Conceicao" tem 17 caracteres depois de remover os acentos.
    expect(document.querySelector('[data-contador="nome"]')?.textContent).toContain(
      '17 de 25 caracteres',
    );

    digitar('#nome', 'Estabelecimento Comercial Muito Longo');
    expect(document.querySelector('[data-contador="nome"]')?.className).toContain('ajuda--erro');
  });

  it('avisa quando corta o nome e mostra o aviso na tela', () => {
    digitar('#chave', '11144477735');
    digitar('#nome', 'Estabelecimento Comercial Muito Longo');
    digitar('#cidade', 'Sao Paulo');

    expect(visivel('[data-avisos]')).toBe(true);
    expect(document.querySelector('[data-avisos]')?.textContent).toMatch(/cortado em 25/);
  });

  it('mostra a arvore de campos lida de volta do proprio payload', () => {
    digitar('#chave', '11144477735');
    digitar('#nome', 'Padaria do Ze');
    digitar('#cidade', 'Sao Paulo');

    const tabela = document.querySelector('[data-campos]');
    expect(tabela?.textContent).toContain('Identificador do arranjo (GUI)');
    expect(tabela?.textContent).toContain('br.gov.bcb.pix');
    expect(tabela?.textContent).toContain('CRC16');
  });

  it('o botao de exemplo preenche e gera um codigo valido', () => {
    document.querySelector<HTMLButtonElement>('#exemplo')?.click();

    expect(visivel('[data-conteudo]')).toBe(true);
    const payload = document.querySelector<HTMLTextAreaElement>('[data-payload]')?.value ?? '';
    expect(payload.startsWith('000201')).toBe(true);
    expect(payload).toContain('barbeariahorizonte');
  });

  it('nao deixa escapar HTML vindo dos campos de texto', () => {
    digitar('#chave', '11144477735');
    digitar('#nome', '<img src=x onerror=alert(1)>');
    digitar('#cidade', 'Sao Paulo');

    const legenda = document.querySelector('[data-legenda]');
    expect(legenda?.querySelector('img')).toBeNull();
    expect(legenda?.innerHTML).toContain('&lt;img');
  });
});
