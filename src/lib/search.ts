import type { ChemData, Reagent } from '../types';
import { isHiddenByDefault } from './groups';
import { normalizeText } from './text';

interface IngredientTerm {
  label: string;
  normalized: string;
}

interface SearchEntry {
  reagent: Reagent;
  name: string;
  id: string;
  ingredients: IngredientTerm[];
}

export interface SearchOptions {
  includeAbstract?: boolean;
  includeConsumables?: boolean;
  limit?: number;
}

export interface SearchResult {
  reagent: Reagent;
  score: number;
  reason: string | null;
}

/** Ordem padrão: relevância enquanto há busca; alfabética quando o campo está vazio. */
export function defaultSortForQuery(query: string): 'relevancia' | 'nome' {
  return query.trim() ? 'relevancia' : 'nome';
}

let cachedData: ChemData | null = null;
let cachedIndex: SearchEntry[] = [];

function buildIndex(data: ChemData): SearchEntry[] {
  if (cachedData === data) return cachedIndex;
  const index: SearchEntry[] = data.reagentes.map((reagent) => {
    const seen = new Set<string>();
    const ingredients: IngredientTerm[] = [];
    for (const recipe of reagent.receitas) {
      for (const ingredient of recipe.ingredientes) {
        const key = ingredient.id.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        ingredients.push({ label: ingredient.nome, normalized: normalizeText(`${ingredient.nome} ${ingredient.id}`) });
      }
    }
    return {
      reagent,
      name: normalizeText(reagent.nome),
      id: normalizeText(reagent.id),
      ingredients,
    };
  });
  cachedData = data;
  cachedIndex = index;
  return index;
}

function subsequenceScore(haystack: string, needle: string): number {
  if (needle.length < 2 || haystack.length < needle.length) return 0;
  let index = 0;
  let gaps = 0;
  let last = -1;
  for (const char of needle) {
    const found = haystack.indexOf(char, index);
    if (found < 0) return 0;
    if (last >= 0 && found > last + 1) gaps += found - last - 1;
    last = found;
    index = found + 1;
  }
  return Math.max(40, 250 - gaps * 8 - Math.max(0, haystack.length - needle.length) * 2);
}

function fieldScore(haystack: string, needle: string): number {
  if (!haystack || !needle) return 0;
  if (haystack === needle) return 1000;
  if (haystack.startsWith(needle)) return 860 - Math.min(160, haystack.length - needle.length) * 2;
  if (haystack.includes(` ${needle}`)) return 780 - Math.min(120, haystack.length - needle.length);
  if (haystack.includes(needle)) return 700 - Math.min(100, haystack.length - needle.length);
  if (needle.length >= 2) return subsequenceScore(haystack, needle);
  return 0;
}

function entryScore(entry: SearchEntry, terms: string[]): { score: number; reason: string | null } {
  let total = 0;
  let reason: string | null = null;
  for (const term of terms) {
    const nameScore = fieldScore(entry.name, term);
    const idScore = fieldScore(entry.id, term) * 0.94;
    let ingredientScore = 0;
    let matchedIngredient: string | null = null;
    for (const ingredient of entry.ingredients) {
      const score = fieldScore(ingredient.normalized, term) * 0.72;
      if (score > ingredientScore) {
        ingredientScore = score;
        matchedIngredient = ingredient.label;
      }
    }
    const best = Math.max(nameScore, idScore, ingredientScore);
    if (!best) return { score: 0, reason: null };
    total += best;
    if (ingredientScore >= nameScore && ingredientScore >= idScore && matchedIngredient) {
      reason = `Ingrediente: ${matchedIngredient}`;
    }
  }
  // Pequeno empurrão para nomes mais curtos, que costumam ser mais relevantes.
  total -= Math.min(25, entry.name.length * 0.15);
  return { score: total, reason };
}

export function searchReagents(
  data: ChemData,
  rawQuery: string,
  options: SearchOptions = {},
): SearchResult[] {
  const query = normalizeText(rawQuery);
  if (!query) return [];
  const terms = query.split(/\s+/).filter(Boolean);
  const limit = options.limit ?? 12;
  const index = buildIndex(data);
  const results: SearchResult[] = [];
  for (const entry of index) {
    const reagent = entry.reagent;
    if (reagent.abstrato && !options.includeAbstract) continue;
    if (isHiddenByDefault(reagent.grupo) && !options.includeConsumables) continue;
    const scored = entryScore(entry, terms);
    if (scored.score > 0) results.push({ reagent, score: scored.score, reason: scored.reason });
  }
  results.sort((a, b) => b.score - a.score || a.reagent.nome.localeCompare(b.reagent.nome, 'pt-BR'));
  return results.slice(0, limit);
}

/** Lista completa usada pela página de reagentes, com busca textual. */
export function filterReagents(
  data: ChemData,
  options: {
    query: string;
    group: string;
    includeAbstract: boolean;
    includeConsumables: boolean;
    onlyDispensable: boolean;
    onlyWithRecipe: boolean;
    sort: string;
  },
): Reagent[] {
  const base = data.reagentes.filter((reagent) => {
    if (reagent.abstrato && !options.includeAbstract) return false;
    // O filtro de dispensáveis é uma consulta explícita ao estoque do dispensador:
    // ele também revela as bebidas/comidas ocultas que estão nos jugs.
    if (isHiddenByDefault(reagent.grupo) && !options.includeConsumables && !options.onlyDispensable) return false;
    if (options.group && options.group !== '__none__' && reagent.grupo !== options.group) return false;
    if (options.group === '__none__' && reagent.grupo) return false;
    if (options.onlyDispensable && !reagent.dispensavel) return false;
    if (options.onlyWithRecipe && reagent.receitas.length === 0) return false;
    return true;
  });

  let matched: Reagent[];
  if (options.query.trim()) {
    const results = searchReagents(data, options.query, {
      includeAbstract: options.includeAbstract,
      includeConsumables: options.includeConsumables || options.onlyDispensable,
      limit: Number.MAX_SAFE_INTEGER,
    });
    const allowed = new Set(base.map((reagent) => reagent.id));
    matched = results.map((result) => result.reagent).filter((reagent) => allowed.has(reagent.id));
  } else {
    matched = base;
  }

  const sorted = [...matched];
  switch (options.sort) {
    case 'relevancia':
      // `matched` já veio na ordem de pontuação da busca. Sem consulta, não há
      // relevância a preservar; cai para a ordem alfabética do caso padrão.
      if (!options.query.trim()) {
        sorted.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }) || a.id.localeCompare(b.id));
      }
      break;
    case 'nome-desc':
      sorted.sort((a, b) => b.nome.localeCompare(a.nome, 'pt-BR') || a.id.localeCompare(b.id));
      break;
    case 'grupo':
      sorted.sort(
        (a, b) =>
          (a.grupo ?? 'zzz').localeCompare(b.grupo ?? 'zzz') || a.nome.localeCompare(b.nome, 'pt-BR'),
      );
      break;
    case 'receitas':
      sorted.sort((a, b) => b.receitas.length - a.receitas.length || a.nome.localeCompare(b.nome, 'pt-BR'));
      break;
    case 'efeitos':
      sorted.sort(
        (a, b) =>
          b.efeitos.length + b.efeitos_planta.length - (a.efeitos.length + a.efeitos_planta.length) ||
          a.nome.localeCompare(b.nome, 'pt-BR'),
      );
      break;
    case 'dispensaveis':
      sorted.sort(
        (a, b) =>
          Number(b.dispensavel) - Number(a.dispensavel) || a.nome.localeCompare(b.nome, 'pt-BR'),
      );
      break;
    default:
      sorted.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }) || a.id.localeCompare(b.id));
  }
  return sorted;
}
