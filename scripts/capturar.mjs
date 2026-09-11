/**
 * Captura as telas do README e, de quebra, faz a verificacao visual que os
 * testes de DOM nao alcancam.
 *
 * O happy-dom nao calcula estilo, entao um teste la confere o atributo `hidden`
 * e passa mesmo quando uma regra de CSS anula esse atributo e deixa o painel na
 * tela. Foi exatamente o que aconteceu: `.painel { display: grid }` vencia a
 * regra do navegador para `[hidden]` e os tres paineis apareciam empilhados.
 * Aqui a checagem e pelo estilo computado, num Chromium de verdade.
 *
 * Uso:
 *   npm run build
 *   npm run preview        (em outro terminal)
 *   npm run capturas
 *
 * Requer o navegador do Playwright, instalado uma vez com:
 *   npx playwright install chromium
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env['PIXCERTO_URL'] ?? 'http://localhost:4173/';
const SAIDA = process.argv[2] ?? 'docs';
mkdirSync(SAIDA, { recursive: true });

const navegador = await chromium.launch();

async function abrir({ largura, altura, tema = 'light' }) {
  const contexto = await navegador.newContext({
    viewport: { width: largura, height: altura },
    deviceScaleFactor: 2,
    colorScheme: tema,
    locale: 'pt-BR',
  });
  const pagina = await contexto.newPage();
  const erros = [];
  pagina.on('pageerror', (e) => erros.push(String(e)));
  pagina.on('console', (m) => {
    if (m.type() === 'error') erros.push(m.text());
  });
  await pagina.goto(BASE, { waitUntil: 'networkidle' });
  return { contexto, pagina, erros };
}

async function capturar(pagina, nome) {
  await pagina.waitForTimeout(400);
  await pagina.screenshot({ path: `${SAIDA}/${nome}.png` });
  console.log(`gerado: ${nome}.png`);
}

/**
 * Conta paineis de fato visiveis, pelo estilo computado.
 * Conferir o atributo hidden nao bastaria: uma regra de display numa classe
 * vence a regra do navegador para [hidden] e deixa o painel na tela mesmo com o
 * atributo presente.
 */
async function paineisVisiveis(pagina) {
  return pagina.evaluate(() =>
    Array.from(document.querySelectorAll('[data-painel]'))
      .filter((p) => getComputedStyle(p).display !== 'none')
      .map((p) => p.dataset.painel),
  );
}

async function conferirPainelUnico(pagina, esperado, problemas) {
  const visiveis = await paineisVisiveis(pagina);
  console.log(`  paineis visiveis: [${visiveis.join(', ')}]`);
  if (visiveis.length !== 1 || visiveis[0] !== esperado) {
    problemas.push(
      `esperava so o painel "${esperado}" visivel, estao visiveis: [${visiveis.join(', ')}]`,
    );
  }
}

const problemas = [];

// 1. Aba gerar, com dados de exemplo.
{
  const { contexto, pagina, erros } = await abrir({ largura: 1280, altura: 980 });
  await pagina.click('#exemplo');
  await pagina.waitForSelector('[data-qr] svg');
  const svgs = await pagina.locator('[data-qr] svg').count();
  const payload = await pagina.inputValue('[data-payload]');
  console.log(`gerar: svg=${svgs} payload=${payload.length} chars`);
  if (svgs !== 1) problemas.push('QR nao apareceu na aba gerar');
  if (!payload.startsWith('000201')) problemas.push('payload invalido na tela');
  await conferirPainelUnico(pagina, 'gerar', problemas);
  await capturar(pagina, 'gerar');
  problemas.push(...erros);
  await contexto.close();
}

// 2. Aba de varios valores.
{
  const { contexto, pagina, erros } = await abrir({ largura: 1280, altura: 980 });
  await pagina.click('#exemplo');
  await pagina.click('.aba[data-aba="lote"]');
  await pagina.click('#exemploLote');
  await pagina.waitForSelector('[data-loteGrade] .cartao');
  const cartoes = await pagina.locator('[data-loteGrade] .cartao').count();
  console.log(`lote: ${cartoes} cartoes`);
  if (cartoes !== 4) problemas.push(`esperava 4 cartoes no lote, veio ${cartoes}`);
  await conferirPainelUnico(pagina, 'lote', problemas);
  await capturar(pagina, 'lote');
  problemas.push(...erros);
  await contexto.close();
}

// 3. Aba de conferencia.
{
  const { contexto, pagina, erros } = await abrir({ largura: 1280, altura: 980 });
  await pagina.click('.aba[data-aba="conferir"]');
  await pagina.click('#exemploConferir');
  await pagina.waitForSelector('.diagnostico');
  const classe = await pagina.locator('.diagnostico').getAttribute('class');
  const linhas = await pagina.locator('.campos tbody tr').count();
  console.log(`conferir: ${classe} / ${linhas} linhas de campo`);
  if (!classe.includes('diagnostico--ok')) problemas.push('exemplo de conferencia nao validou');
  await conferirPainelUnico(pagina, 'conferir', problemas);
  await capturar(pagina, 'conferir');
  problemas.push(...erros);
  await contexto.close();
}

// 4. Celular.
{
  const { contexto, pagina, erros } = await abrir({ largura: 390, altura: 1180 });
  await pagina.click('#exemplo');
  await pagina.waitForSelector('[data-qr] svg');
  // Confere que nao ha rolagem horizontal no celular.
  const estouro = await pagina.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  console.log(`celular: rolagem horizontal = ${estouro}`);
  if (estouro) problemas.push('a pagina rola na horizontal em 390px');
  await capturar(pagina, 'celular');
  problemas.push(...erros);
  await contexto.close();
}

// 5. Tema escuro.
{
  const { contexto, pagina, erros } = await abrir({ largura: 1280, altura: 980, tema: 'dark' });
  await pagina.click('#exemplo');
  await pagina.waitForSelector('[data-qr] svg');
  await capturar(pagina, 'escuro');
  problemas.push(...erros);
  await contexto.close();
}

await navegador.close();

if (problemas.length > 0) {
  console.log('\nPROBLEMAS:');
  for (const p of problemas) console.log(' - ' + p);
  process.exit(1);
}
console.log('\nSem erros de console e sem problemas de layout.');

