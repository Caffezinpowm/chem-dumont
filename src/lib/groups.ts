import type { ChemData, Reagent } from '../types';
import { appHref } from './router';
import { slugify } from './text';

export interface GroupInfo {
  id: string;
  label: string;
  description: string;
  color: string;
  hiddenByDefault: boolean;
}

const GROUP_META: Record<string, Omit<GroupInfo, 'id'>> = {
  Elements: {
    label: 'Elementos',
    description: 'Substâncias básicas e metais usados como blocos de construção e reagentes de partida.',
    color: '#f0b74d',
    hiddenByDefault: false,
  },
  Medicine: {
    label: 'Medicina',
    description: 'Fármacos, antídotos e tratamentos disponíveis no fork.',
    color: '#54d6a3',
    hiddenByDefault: false,
  },
  Narcotics: {
    label: 'Narcóticos',
    description: 'Estimulantes, sedativos e substâncias de controle.',
    color: '#a78bfa',
    hiddenByDefault: false,
  },
  Pyrotechnic: {
    label: 'Pirotécnicos',
    description: 'Combustíveis, oxidantes e misturas que geram calor ou fogo.',
    color: '#ff8a58',
    hiddenByDefault: false,
  },
  Toxins: {
    label: 'Toxinas',
    description: 'Venenos, contaminantes e agentes de dano químico.',
    color: '#f35c78',
    hiddenByDefault: false,
  },
  Foods: {
    label: 'Comidas',
    description: 'Ingredientes e aditivos alimentares. Ocultos por padrão para manter o foco na química.',
    color: '#e7c64c',
    hiddenByDefault: true,
  },
  Botanical: {
    label: 'Botânica',
    description: 'Nutrientes, herbicidas e produtos usados no cultivo.',
    color: '#7bcf6f',
    hiddenByDefault: false,
  },
  Biological: {
    label: 'Biológicos',
    description: 'Sangue, seiva, toxinas naturais e outras substâncias orgânicas.',
    color: '#67c9d8',
    hiddenByDefault: false,
  },
  Special: {
    label: 'Especiais',
    description: 'Reagentes de eventos, anomalias e situações fora do fluxo comum.',
    color: '#d98cff',
    hiddenByDefault: false,
  },
  Others: {
    label: 'Outros',
    description: 'Reagentes que não se encaixam nas demais categorias do guia.',
    color: '#a0aaa3',
    hiddenByDefault: false,
  },
  Solids: {
    label: 'Sólidos',
    description: 'Substâncias sólidas e materiais especiais adicionados por forks.',
    color: '#b99775',
    hiddenByDefault: false,
  },
  AlcoholicDrinks: {
    label: 'Bebidas alcoólicas',
    description: 'Coquetéis e bebidas fermentadas. Ocultas por padrão.',
    color: '#df8d68',
    hiddenByDefault: true,
  },
  NonAlcoholicDrinks: {
    label: 'Bebidas não alcoólicas',
    description: 'Sucos, refrigerantes, cafés e misturas sem álcool. Ocultas por padrão.',
    color: '#73c6df',
    hiddenByDefault: true,
  },
  Exotic: {
    label: 'Exóticos',
    description: 'Reagentes de origem incomum ou adicionados por conteúdo crossover.',
    color: '#e6a4ff',
    hiddenByDefault: false,
  },
  Unknown: {
    label: 'Desconhecidos',
    description: 'Protótipos sem grupo declarado ou com grupo não reconhecido.',
    color: '#a0aaa3',
    hiddenByDefault: false,
  },
};

const FALLBACK_GROUP: Omit<GroupInfo, 'id'> = {
  label: 'Sem grupo',
  description: 'Protótipos sem grupo definido no repositório.',
  color: '#a0aaa3',
  hiddenByDefault: false,
};

/** Sentinela de interface para reagentes sem grupo no YAML. */
export const NO_GROUP_ID = '__none__';

const NO_GROUP_INFO: GroupInfo = { id: NO_GROUP_ID, ...FALLBACK_GROUP };

export function groupInfo(id: string | null | undefined): GroupInfo | null {
  if (!id) return null;
  if (id === NO_GROUP_ID || id === 'sem-grupo') return NO_GROUP_INFO;
  const meta = GROUP_META[id] ?? {
    ...FALLBACK_GROUP,
    label: id,
  };
  return { id, ...meta };
}

export function groupLabel(id: string | null | undefined): string {
  return groupInfo(id)?.label ?? 'Sem grupo';
}

export function groupSlug(id: string | null | undefined): string {
  if (!id) return 'sem-grupo';
  return slugify(groupLabel(id));
}

export function groupHref(id: string | null | undefined): string {
  return appHref(`/grupos/${groupSlug(id)}`);
}

export function groupFromSlug(data: ChemData, slug: string): GroupInfo | null {
  const target = slug.toLowerCase();
  for (const id of orderedGroups(data)) {
    if (groupSlug(id) === target) return groupInfo(id);
  }
  if (target === 'sem-grupo' || target === 'none') {
    return { ...NO_GROUP_INFO };
  }
  return null;
}

export function orderedGroups(data: ChemData): string[] {
  const present = new Set(
    data.reagentes
      .map((reagent) => reagent.grupo)
      .filter((group): group is string => typeof group === 'string' && group.length > 0),
  );
  const preferred = data.meta.grupos_guia.filter((group) => present.has(group));
  const leftovers = [...present].filter((group) => !preferred.includes(group)).sort((a, b) =>
    groupLabel(a).localeCompare(groupLabel(b), 'pt-BR'),
  );
  return [...preferred, ...leftovers];
}

export function groupReagents(data: ChemData, groupId: string): Reagent[] {
  if (groupId === NO_GROUP_ID) return data.reagentes.filter((reagent) => !reagent.grupo);
  return data.reagentes.filter((reagent) => reagent.grupo === groupId);
}

export function ungroupedCount(data: ChemData, includeAbstract = true): number {
  return data.reagentes.filter((reagent) => !reagent.grupo && (includeAbstract || !reagent.abstrato)).length;
}

export function isConsumableGroup(id: string | null | undefined): boolean {
  return id === 'Foods' || id === 'AlcoholicDrinks' || id === 'NonAlcoholicDrinks';
}

/** Grupos que começam ocultos na listagem e na busca global. */
export function isHiddenByDefault(id: string | null | undefined): boolean {
  return groupInfo(id)?.hiddenByDefault === true;
}

const GROUP_STYLE: Record<string, string> = Object.fromEntries(
  Object.entries(GROUP_META).map(([id, meta]) => [id, meta.color]),
);

export function groupColor(id: string | null | undefined): string {
  if (!id) return '#a0aaa3';
  return GROUP_STYLE[id] ?? '#a0aaa3';
}
