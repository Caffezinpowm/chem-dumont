import './styles.css';
import type { ChemData, SpriteData } from './types';
import { loadChemData, loadSpriteData } from './data';
import { startRouter, type RouteState } from './lib/router';
import { setupSearchBox } from './lib/components';
import {
  applyTheme,
  clearFavorites,
  currentTheme,
  refreshFavoriteButtons,
  toggleFavorite,
  toggleTheme,
} from './lib/state';
import { appShell, setActiveNav, showToast } from './views/shell';
import { homeView } from './views/home';
import { reagentsView } from './views/reagents';
import { reagentView } from './views/reagent';
import { groupsView, groupView } from './views/groups';
import { calculatorView } from './views/calculator';
import { favoritesView } from './views/favorites';
import { aboutView } from './views/about';
import { notFoundView } from './views/not-found';
import type { ViewResult } from './views/types';

const app = document.getElementById('app');

let currentRoute: RouteState | null = null;
let hasRendered = false;
let dataRef: ChemData | null = null;
let spritesRef: SpriteData | null = null;

function errorScreen(error: unknown): void {
  if (!app) return;
  const message = error instanceof Error ? error.message : String(error);
  app.setAttribute('aria-busy', 'false');
  app.innerHTML = `<div class="fatal">
    <div class="fatal__card">
      <p class="eyebrow">falha ao carregar</p>
      <h1>O guia não conseguiu abrir os dados.</h1>
      <p>O arquivo <code>data/chem.json</code> não respondeu. Se você está rodando o projeto localmente, rode a extração antes do servidor.</p>
      <pre><code>npm run extract
npm run dev</code></pre>
      <p class="fine-print">Detalhe técnico: ${message
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')}</p>
      <button class="button button--primary" type="button" onclick="window.location.reload()">Recarregar</button>
    </div>
  </div>`;
}

function viewFor(route: RouteState, data: ChemData, sprites: SpriteData | null): ViewResult {
  switch (route.name) {
    case 'home':
      return homeView(data);
    case 'reagents':
      return reagentsView(data, route.query);
    case 'reagent':
      return reagentView(data, route.slug, route.query);
    case 'groups':
      return groupsView(data, route.query);
    case 'group':
      return groupView(data, route.slug, route.query);
    case 'calculator':
      return calculatorView(data, route.query);
    case 'favorites':
      return favoritesView(data);
    case 'about':
      return aboutView(data, sprites);
    default:
      return notFoundView(data, route.pathname);
  }
}

function closeMenu(): void {
  const button = document.querySelector<HTMLButtonElement>('[data-nav-toggle]');
  const nav = document.querySelector<HTMLElement>('#menu-principal');
  button?.setAttribute('aria-expanded', 'false');
  nav?.classList.remove('is-open');
  const label = button?.querySelector<HTMLElement>('.sr-only');
  if (label) label.textContent = 'Abrir menu';
}

function scrollToHash(): void {
  if (!window.location.hash) return;
  const id = decodeURIComponent(window.location.hash.slice(1));
  if (!id) return;
  const target = document.getElementById(id);
  if (!target) return;
  window.setTimeout(() => {
    target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }, 0);
}

function renderRoute(route: RouteState, data: ChemData, sprites: SpriteData | null): void {
  const main = document.getElementById('conteudo');
  if (!main) return;
  const view = viewFor(route, data, sprites);
  currentRoute = route;
  main.innerHTML = view.html;
  document.title = view.title;
  setActiveNav(route.name);
  closeMenu();
  refreshFavoriteButtons(main);
  applyTheme(currentTheme());
  if (hasRendered) {
    window.requestAnimationFrame(() => main.focus({ preventScroll: true }));
  }
  try {
    const mounted = view.mount?.(main);
    if (mounted instanceof Promise) {
      void mounted.catch((error) => console.error('Falha ao montar a visualização', error));
    }
  } catch (error) {
    console.error('Falha ao montar a visualização', error);
  }
  scrollToHash();
  hasRendered = true;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* tenta o fallback abaixo */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const success = document.execCommand('copy');
    area.remove();
    return success;
  } catch {
    return false;
  }
}

function setupGlobalInteractions(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]').forEach((button) => {
    button.addEventListener('click', () => toggleTheme());
  });

  const navToggle = document.querySelector<HTMLButtonElement>('[data-nav-toggle]');
  navToggle?.addEventListener('click', () => {
    const nav = document.getElementById('menu-principal');
    if (!nav) return;
    const next = !nav.classList.contains('is-open');
    nav.classList.toggle('is-open', next);
    navToggle.setAttribute('aria-expanded', String(next));
    const label = navToggle.querySelector<HTMLElement>('.sr-only');
    if (label) label.textContent = next ? 'Fechar menu' : 'Abrir menu';
  });

  document.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    if (!target) return;

    const favorite = target.closest<HTMLButtonElement>('[data-favorite-id]');
    if (favorite) {
      event.preventDefault();
      const id = favorite.dataset.favoriteId;
      if (!id) return;
      const active = toggleFavorite(id);
      refreshFavoriteButtons();
      showToast(active ? 'Reagente adicionado aos favoritos.' : 'Reagente removido dos favoritos.');
      return;
    }

    if (target.closest('[data-print]')) {
      event.preventDefault();
      window.print();
      return;
    }

    const copyButton = target.closest<HTMLElement>('[data-copy-link]');
    if (copyButton) {
      event.preventDefault();
      void copyText(window.location.href).then((success) => {
        showToast(success ? 'Link copiado para a área de transferência.' : 'Não foi possível copiar o link.');
      });
      return;
    }

    if (target.closest('[data-clear-favorites]')) {
      event.preventDefault();
      clearFavorites();
      showToast('Todos os favoritos foram removidos.');
      return;
    }

    if (target.closest('#menu-principal a')) closeMenu();
  });

  document.addEventListener('chem:favorites-changed', () => {
    refreshFavoriteButtons();
    const main = document.getElementById('conteudo');
    if (currentRoute?.name === 'favorites' && main && dataRef) {
      const route = currentRoute;
      currentRoute = null;
      renderRoute(route, dataRef, spritesRef);
    }
  });

  // Atalho de busca: / ou Ctrl/Cmd+K.
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) return;
    const tag = (event.target as HTMLElement | null)?.tagName;
    const typing =
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      (event.target as HTMLElement | null)?.isContentEditable;
    const isShortcut =
      (!typing && event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) ||
      ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k');
    if (!isShortcut) return;
    event.preventDefault();
    const input = document.querySelector<HTMLInputElement>('#busca-global');
    if (input) {
      input.focus();
      input.select();
    }
  });
}

async function boot(): Promise<void> {
  if (!app) return;
  try {
    const [data, sprites] = await Promise.all([
      loadChemData(),
      loadSpriteData().catch((error) => {
        console.warn('sprites.json indisponível; créditos de sprite ficarão reduzidos.', error);
        return null;
      }),
    ]);
    dataRef = data;
    spritesRef = sprites;
    app.innerHTML = appShell(data);
    app.setAttribute('aria-busy', 'false');
    setupGlobalInteractions();
    applyTheme(currentTheme());
    const headerSearch = document.querySelector<HTMLElement>('[data-search-container]');
    if (headerSearch) setupSearchBox(headerSearch, data);
    startRouter((route) => renderRoute(route, data, sprites));
    if (window.location.hash) scrollToHash();
    document.documentElement.classList.add('is-ready');
  } catch (error) {
    console.error(error);
    errorScreen(error);
  }
}

void boot();
