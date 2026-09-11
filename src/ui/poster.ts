import type { PixCharge } from '../brcode/index.js';
import { formatCentsForDisplay } from '../brcode/index.js';
import { renderQrSvg } from '../qr/render.js';
import { escapar } from './dom.js';

/**
 * Cartaz A4 para imprimir e deixar no balcao.
 *
 * O cartaz e montado numa janela separada em vez de uma area escondida na
 * pagina: assim ele leva a propria folha de estilo de impressao, sem herdar
 * nada do tema da aplicacao, e o tema escuro do sistema nao sai impresso num
 * fundo preto.
 *
 * A mesma janela atende o pedido de PDF do escopo. O dialogo de impressao de
 * todo navegador atual oferece "Salvar como PDF", o que evita carregar uma
 * biblioteca de geracao de PDF de algumas centenas de kilobytes para produzir
 * exatamente o mesmo arquivo.
 */
export function abrirCartaz(cobranca: PixCharge): boolean {
  const janela = window.open('', '_blank', 'width=840,height=1000');
  if (janela === null) {
    return false;
  }

  janela.document.write(montarCartaz([cobranca]));
  janela.document.close();
  janela.focus();
  return true;
}

/** Varias cobrancas, uma por folha. Usado na geracao em lote. */
export function abrirCartazes(cobrancas: readonly PixCharge[]): boolean {
  if (cobrancas.length === 0) return false;

  const janela = window.open('', '_blank', 'width=840,height=1000');
  if (janela === null) {
    return false;
  }

  janela.document.write(montarCartaz(cobrancas));
  janela.document.close();
  janela.focus();
  return true;
}

function montarCartaz(cobrancas: readonly PixCharge[]): string {
  const folhas = cobrancas.map((cobranca) => folha(cobranca)).join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Cartaz Pix — ${escapar(cobrancas[0]?.merchantName ?? 'PixCerto')}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #ffffff;
    color: #0f172a;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .folha {
    width: 100%;
    min-height: 247mm;
    padding: 10mm 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    page-break-after: always;
  }
  .folha:last-child { page-break-after: auto; }
  .titulo { font-size: 34pt; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 2mm; }
  .subtitulo { font-size: 14pt; color: #475569; margin: 0 0 8mm; }
  .qr { border: 1.5pt solid #cbd5e1; border-radius: 4mm; padding: 6mm; background: #fff; }
  .qr svg { width: 95mm; height: 95mm; display: block; }
  .valor { font-size: 40pt; font-weight: 800; margin: 8mm 0 1mm; }
  .valor--livre { font-size: 20pt; font-weight: 600; color: #475569; }
  .recebedor { font-size: 15pt; margin: 0 0 1mm; }
  .detalhe { font-size: 11pt; color: #64748b; margin: 0; }
  .codigo {
    margin: 8mm auto 0;
    max-width: 150mm;
    font-family: ui-monospace, Menlo, Consolas, monospace;
    font-size: 6.5pt;
    line-height: 1.45;
    color: #64748b;
    word-break: break-all;
  }
  .rodape {
    margin-top: 6mm;
    font-size: 9pt;
    color: #94a3b8;
    max-width: 150mm;
  }
  .instrucoes { font-size: 11pt; color: #334155; margin: 5mm 0 0; }
  @media screen {
    body { background: #e2e8f0; padding: 8mm; }
    .folha { background: #fff; box-shadow: 0 2px 12px rgba(15,23,42,.15); margin-bottom: 8mm; }
    .aviso-tela {
      max-width: 190mm; margin: 0 auto 8mm; padding: 4mm 6mm; border-radius: 3mm;
      background: #fff; border: 1px solid #cbd5e1; font-size: 11pt; color: #334155;
    }
  }
  @media print { .aviso-tela { display: none; } }
</style>
</head>
<body>
<div class="aviso-tela">
  <strong>Pronto para imprimir.</strong>
  Use Ctrl+P (ou Cmd+P) e escolha a impressora — ou "Salvar como PDF" para guardar o arquivo.
</div>
${folhas}
</body>
</html>`;
}

function folha(cobranca: PixCharge): string {
  const svg = renderQrSvg(cobranca.payload, {
    margin: 2,
    dark: '#0f172a',
    title: `QR Code Pix de ${cobranca.merchantName}`,
  });

  const valor =
    cobranca.amountCents === null
      ? '<p class="valor valor--livre">Valor a combinar</p>'
      : `<p class="valor">${escapar(formatCentsForDisplay(cobranca.amountCents))}</p>`;

  const identificador =
    cobranca.txid === '***'
      ? ''
      : `<p class="detalhe">Identificador: ${escapar(cobranca.txid)}</p>`;

  const descricao =
    cobranca.description === null
      ? ''
      : `<p class="detalhe">${escapar(cobranca.description)}</p>`;

  return `<section class="folha">
  <h1 class="titulo">Pague com Pix</h1>
  <p class="subtitulo">Aponte a câmera do seu banco para o código</p>
  <div class="qr">${svg}</div>
  ${valor}
  <p class="recebedor"><strong>${escapar(cobranca.merchantName)}</strong></p>
  <p class="detalhe">${escapar(cobranca.merchantCity)}</p>
  ${descricao}
  ${identificador}
  <p class="instrucoes">Se preferir, copie o código abaixo no aplicativo do seu banco.</p>
  <p class="codigo">${escapar(cobranca.payload)}</p>
  <p class="rodape">
    Confira o nome do recebedor no aplicativo antes de confirmar o pagamento.
  </p>
</section>`;
}
