import type { ChemData } from '../types';
import { appHref } from '../lib/router';
import { searchBoxHtml } from '../lib/components';
import { esc, fmtDate, fmtInt } from '../lib/text';

const NAV_ITEMS = [
  { path: '/reagentes', label: 'Reagentes', route: 'reagents' },
  { path: '/grupos', label: 'Grupos', route: 'groups' },
  { path: '/calculadora', label: 'Calculadora', route: 'calculator' },
  { path: '/favoritos', label: 'Favoritos', route: 'favorites' },
] as const;

export function appShell(data: ChemData): string {
  return `
    <header class="site-header">
      <div class="container site-header__inner">
        <a class="brand" href="${appHref('/')}" aria-label="Guia de Chem — página inicial">
          <span class="brand__mark" aria-hidden="true">
            <svg viewBox="0 0 48 48" width="34" height="34" role="img" aria-hidden="true">
              <path d="M18 7h12M21 7v10L11 36a5 5 0 0 0 4.3 7.5h17.4A5 5 0 0 0 37 36L27 17V7" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M16 34c4-3 6 3 10 0s6 2 8-1l3 4.5A5 5 0 0 1 32.7 44H15.3A5 5 0 0 1 11 36.5z" fill="currentColor" opacity=".35"/>
            </svg>
          </span>
          <span class="brand__text">
            <strong>Guia de Chem</strong>
            <small>Dumont Station</small>
          </span>
        </a>
        <nav class="main-nav" id="menu-principal" aria-label="Navegação principal">
          ${NAV_ITEMS.map((item) => `<a href="${appHref(item.path)}" data-nav="${item.route}">${item.label}</a>`).join('')}
        </nav>
        <div class="header-tools">
          <div class="header-search" data-search-container>
            ${searchBoxHtml({ id: 'busca-global', variant: 'header' })}
          </div>
          <button class="theme-toggle" type="button" data-theme-toggle aria-label="Alternar tema">
            <span class="theme-toggle__sun" aria-hidden="true">☀</span>
            <span class="theme-toggle__moon" aria-hidden="true">◐</span>
          </button>
          <button class="nav-toggle" type="button" data-nav-toggle aria-controls="menu-principal" aria-expanded="false">
            <span class="nav-toggle__bars" aria-hidden="true"></span>
            <span class="sr-only">Abrir menu</span>
          </button>
        </div>
      </div>
    </header>
    <main id="conteudo" tabindex="-1"></main>
    <footer class="site-footer">
      <div class="container site-footer__inner">
        <div class="site-footer__brand">
          <span class="brand__mark" aria-hidden="true">⌬</span>
          <div>
            <strong>Guia de Chem</strong>
            <p>Guia não oficial da química de <strong>Dumont Station</strong>. O jogo é a fonte da verdade.</p>
          </div>
        </div>
        <div class="site-footer__columns">
          <div>
            <h2>Navegar</h2>
            <a href="${appHref('/reagentes')}">Todos os reagentes</a>
            <a href="${appHref('/grupos')}">Grupos</a>
            <a href="${appHref('/calculadora')}">Calculadora</a>
            <a href="${appHref('/favoritos')}">Favoritos</a>
          </div>
          <div>
            <h2>Projeto</h2>
            <a href="${appHref('/sobre')}">Créditos e fontes</a>
            <a href="https://github.com/Project-Dumont/Dumont-Station" target="_blank" rel="noopener noreferrer">Repositório ↗</a>
            <a href="${appHref('/data/relatorio.md')}" target="_blank" rel="noopener noreferrer">Relatório de extração ↗</a>
          </div>
          <div>
            <h2>Dados</h2>
            <p>${fmtInt(data.meta.contagens.reagentes_nao_abstratos)} reagentes visíveis<br>${fmtInt(data.meta.contagens.reacoes_total)} reações</p>
            <p class="fine-print">Gerado em ${esc(fmtDate(data.meta.gerado_em))}</p>
          </div>
        </div>
      </div>
      <div class="container site-footer__bottom">
        <p>Não afiliado à Project Dumont ou Space Station 14.</p>
        <p>Assets CC-BY-SA-3.0 · <a href="${appHref('/sobre')}">ver créditos</a></p>
      </div>
    </footer>
    <div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
  `;
}

export function setActiveNav(routeName: string): void {
  document.querySelectorAll<HTMLAnchorElement>('[data-nav]').forEach((link) => {
    const active =
      link.dataset.nav === routeName ||
      (routeName === 'reagent' && link.dataset.nav === 'reagents') ||
      (routeName === 'group' && link.dataset.nav === 'groups') ||
      (routeName === 'home' && false);
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

export function showToast(message: string): void {
  const toast = document.querySelector<HTMLElement>('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  toast.classList.add('is-visible');
  window.clearTimeout(Number(toast.dataset.timer ?? 0));
  const timer = window.setTimeout(() => {
    toast.classList.remove('is-visible');
    window.setTimeout(() => {
      toast.hidden = true;
    }, 180);
  }, 2600);
  toast.dataset.timer = String(timer);
}
