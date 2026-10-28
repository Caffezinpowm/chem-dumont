import type { ChemData, Reagent, SpriteData } from './types';
import { appHref, assetHref } from './lib/router';

let chemPromise: Promise<ChemData> | null = null;
let spritesPromise: Promise<SpriteData> | null = null;
const reagentCache = new Map<string, Map<string, Reagent> | null>();

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(assetHref(path), { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Falha ao carregar ${path}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

export function loadChemData(): Promise<ChemData> {
  if (!chemPromise) {
    chemPromise = fetchJson<ChemData>('data/chem.json').catch((error) => {
      chemPromise = null;
      throw error;
    });
  }
  return chemPromise;
}

export function loadSpriteData(): Promise<SpriteData> {
  if (!spritesPromise) {
    spritesPromise = fetchJson<SpriteData>('data/sprites.json').catch((error) => {
      spritesPromise = null;
      throw error;
    });
  }
  return spritesPromise;
}

/** Busca por id sem diferenciar maiúsculas/minúsculas. */
export function findReagent(data: ChemData, idOrSlug: string | null | undefined): Reagent | null {
  if (!idOrSlug) return null;
  const key = idOrSlug.toLowerCase();
  let index = reagentCache.get('main');
  if (index === undefined) {
    index = new Map();
    for (const reagent of data.reagentes) index.set(reagent.id.toLowerCase(), reagent);
    reagentCache.set('main', index);
  }
  if (!index) return null;
  return index.get(key) ?? null;
}

export function reagentHref(id: string): string {
  return appHref(`/reagentes/${encodeURIComponent(id.toLowerCase())}`);
}

export function producibleReagents(data: ChemData): Reagent[] {
  return data.reagentes
    .filter((reagent) => !reagent.abstrato && reagent.receitas.length > 0)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function allReagentGroups(data: ChemData): string[] {
  return Object.keys(data.meta.contagens.reagentes_por_grupo);
}

export function featuredReagents(data: ChemData): Reagent[] {
  const preferred = ['Dylovene', 'Bicaridine', 'Charcoal', 'Epinephrine', 'Hyronalin', 'Tricordrazine'];
  const byId = new Map(data.reagentes.map((r) => [r.id, r]));
  const featured = preferred.map((id) => byId.get(id)).filter((r): r is Reagent => !!r && !r.abstrato);
  if (featured.length >= 4) return featured.slice(0, 4);
  return data.reagentes.filter((r) => !r.abstrato && r.grupo === 'Medicine' && r.receitas.length > 0).slice(0, 4);
}

export function dispenserReagents(data: ChemData): Reagent[] {
  const set = new Set(data.meta.dispenser.reagentes);
  return data.reagentes
    .filter((reagent) => set.has(reagent.id))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
