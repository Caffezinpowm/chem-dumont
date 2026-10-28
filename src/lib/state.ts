const FAVORITES_KEY = 'chem:favoritos';
const THEME_KEY = 'chem:tema';

function readFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((item): item is string => typeof item === 'string' && item.length > 0))];
  } catch {
    return [];
  }
}

function writeFavorites(ids: string[]): void {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    /* A navegação continua sem persistência. */
  }
}

export function getFavorites(): string[] {
  return readFavorites();
}

export function clearFavorites(): void {
  writeFavorites([]);
  document.dispatchEvent(new CustomEvent('chem:favorites-changed', { detail: { cleared: true } }));
}

export function isFavorite(id: string): boolean {
  return readFavorites().includes(id);
}

export function toggleFavorite(id: string): boolean {
  const favorites = readFavorites();
  const index = favorites.indexOf(id);
  let active: boolean;
  if (index >= 0) {
    favorites.splice(index, 1);
    active = false;
  } else {
    favorites.push(id);
    active = true;
  }
  writeFavorites(favorites);
  document.dispatchEvent(new CustomEvent('chem:favorites-changed', { detail: { id, active } }));
  return active;
}

export function favoriteButton(id: string, compact = false): string {
  const active = isFavorite(id);
  return `<button
    type="button"
    class="favorite-button${active ? ' is-active' : ''}${compact ? ' favorite-button--compact' : ''}"
    data-favorite-id="${id}"
    aria-pressed="${active}"
    aria-label="${active ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}"
    title="${active ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}"
  >
    <span class="favorite-button__icon" aria-hidden="true">${active ? '★' : '☆'}</span>
    ${compact ? '' : `<span class="favorite-button__label">${active ? 'Favorito' : 'Favoritar'}</span>`}
  </button>`;
}

export function refreshFavoriteButtons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLButtonElement>('[data-favorite-id]').forEach((button) => {
    const id = button.dataset.favoriteId;
    if (!id) return;
    const active = isFavorite(id);
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', active ? 'Remover dos favoritos' : 'Adicionar aos favoritos');
    button.title = active ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
    const icon = button.querySelector('.favorite-button__icon');
    if (icon) icon.textContent = active ? '★' : '☆';
    const label = button.querySelector('.favorite-button__label');
    if (label) label.textContent = active ? 'Favorito' : 'Favoritar';
  });
}

export type Theme = 'light' | 'dark';

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* sem persistência */
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', theme === 'light' ? '#f4f1e8' : '#0c1210');
  document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]').forEach((button) => {
    button.setAttribute('aria-label', theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro');
    button.title = theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro';
    button.dataset.theme = theme;
  });
}

export function toggleTheme(): void {
  applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
}
