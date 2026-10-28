/** Base do Vite, sempre com barra final. */
export const BASE_URL = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

/**
 * Monta um link interno respeitando a base configurada (ex.: GitHub Pages).
 * `appHref('/reagentes')` → `/quimica-dumont/reagentes` quando base é essa.
 */
export function appHref(path: string): string {
  if (/^https?:\/\//i.test(path) || path.startsWith('mailto:')) return path;
  const clean = path.replace(/^\/+/, '');
  return `${BASE_URL}${clean}`;
}

/** Caminho de um asset em public/. */
export function assetHref(path: string): string {
  return appHref(path.replace(/^\/+/, ''));
}

/** Remove a base do pathname da URL atual. */
export function stripBase(pathname: string): string {
  if (pathname === BASE_URL.slice(0, -1)) return '/';
  if (pathname.startsWith(BASE_URL)) return `/${pathname.slice(BASE_URL.length)}`.replace(/\/+/g, '/');
  return pathname;
}

export interface RouteState {
  name:
    | 'home'
    | 'reagents'
    | 'reagent'
    | 'groups'
    | 'group'
    | 'calculator'
    | 'favorites'
    | 'about'
    | 'not-found';
  slug?: string;
  query: URLSearchParams;
  pathname: string;
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseRoute(pathname: string, query: URLSearchParams): RouteState {
  const path = pathname.replace(/\/+$/, '') || '/';
  const parts = path.split('/').filter(Boolean).map(decodeSegment);
  if (parts.length === 0) return { name: 'home', query, pathname: path };
  if (parts.length === 1) {
    switch (parts[0]) {
      case 'reagentes':
        return { name: 'reagents', query, pathname: path };
      case 'grupos':
        return { name: 'groups', query, pathname: path };
      case 'calculadora':
        return { name: 'calculator', query, pathname: path };
      case 'favoritos':
        return { name: 'favorites', query, pathname: path };
      case 'sobre':
      case 'creditos':
      case 'créditos':
        return { name: 'about', query, pathname: path };
      case 'index.html':
        return { name: 'home', query, pathname: '/' };
      default:
        return { name: 'not-found', query, pathname: path };
    }
  }
  if (parts.length === 2 && parts[0] === 'reagentes') {
    return { name: 'reagent', slug: parts[1], query, pathname: path };
  }
  if (parts.length === 2 && parts[0] === 'grupos') {
    return { name: 'group', slug: parts[1], query, pathname: path };
  }
  return { name: 'not-found', query, pathname: path };
}

export function route(current: RouteState): string {
  switch (current.name) {
    case 'home':
      return '/';
    case 'reagents':
      return `/reagentes${current.query.toString() ? `?${current.query}` : ''}`;
    case 'reagent':
      return `/reagentes/${encodeURIComponent(current.slug ?? '')}`;
    case 'groups':
      return '/grupos';
    case 'group':
      return `/grupos/${encodeURIComponent(current.slug ?? '')}`;
    case 'calculator':
      return `/calculadora${current.query.toString() ? `?${current.query}` : ''}`;
    case 'favorites':
      return '/favoritos';
    case 'about':
      return '/sobre';
    default:
      return current.pathname;
  }
}

type Renderer = (routeState: RouteState) => void;
let renderer: Renderer | null = null;
let initialized = false;

function currentRoutePath(): string {
  const path = stripBase(window.location.pathname);
  return `${path}${window.location.search}`;
}

export function navigate(path: string, options: { replace?: boolean; scroll?: boolean } = {}): void {
  const target = appHref(path);
  const url = new URL(target, window.location.href);
  const current = new URL(window.location.href);
  if (url.pathname === current.pathname && url.search === current.search && url.hash === current.hash) {
    if (options.scroll !== false) window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    return;
  }
  if (options.replace) window.history.replaceState({}, '', url);
  else window.history.pushState({}, '', url);
  if (renderer) renderer(parseRoute(stripBase(window.location.pathname), new URLSearchParams(window.location.search)));
  if (options.scroll !== false) {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }
}

/** Atualiza a URL sem re-renderizar a página (usado pelos filtros). */
export function replaceRoute(path: string): void {
  const target = appHref(path);
  window.history.replaceState({}, '', new URL(target, window.location.href));
}

export function startRouter(onRender: Renderer): void {
  renderer = onRender;
  if (initialized) return;
  initialized = true;
  window.addEventListener('popstate', () => {
    renderer?.(parseRoute(stripBase(window.location.pathname), new URLSearchParams(window.location.search)));
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  });
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target as Element | null;
    const anchor = target?.closest('a');
    if (!anchor) return;
    if (anchor.target && anchor.target !== '_self') return;
    if (anchor.hasAttribute('download')) return;
    const rawHref = anchor.getAttribute('href');
    if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('mailto:')) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin) return;
    const baseNoSlash = BASE_URL.endsWith('/') ? BASE_URL.slice(0, -1) : BASE_URL;
    if (url.pathname !== BASE_URL && !url.pathname.startsWith(BASE_URL) && url.pathname !== baseNoSlash) return;
    // Âncoras dentro da mesma rota são tratadas pelo navegador.
    if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return;
    event.preventDefault();
    const internalPath = `${stripBase(url.pathname)}${url.search}${url.hash}`;
    navigate(internalPath);
  });
  renderer(parseRoute(stripBase(window.location.pathname), new URLSearchParams(window.location.search)));
}

export { currentRoutePath };
