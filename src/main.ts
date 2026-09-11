import './styles.css';
import { iniciarLote } from './ui/batch.js';
import { iniciarConferidor } from './ui/checker.js';
import { el, mostrar, todos } from './ui/dom.js';
import { iniciarGerador } from './ui/generator.js';

function iniciarAbas(): void {
  const abas = todos<HTMLButtonElement>('.aba');

  for (const aba of abas) {
    aba.addEventListener('click', () => {
      const alvo = aba.dataset['aba'];
      if (alvo === undefined) return;

      for (const outra of abas) {
        const ativa = outra === aba;
        outra.setAttribute('aria-selected', String(ativa));
      }

      for (const painel of todos<HTMLElement>('[data-painel]')) {
        mostrar(painel, painel.dataset['painel'] === alvo);
      }
    });
  }
}

function mostrarVersao(): void {
  el<HTMLElement>('[data-versao]').textContent = `v${__APP_VERSION__}`;
}

iniciarAbas();
iniciarGerador();
iniciarLote();
iniciarConferidor();
mostrarVersao();
