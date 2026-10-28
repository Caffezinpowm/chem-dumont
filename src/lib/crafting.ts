import type { ChemData, Recipe, Reagent } from '../types';
import {
  buildProductionPlan,
  primaryRecipe,
  recipeYield,
  type PlanNode,
  type ProductionPlan,
  type ShoppingItem,
} from './production';
import { fmt, formatTemperature } from './text';

export type CraftItemSource = ShoppingItem['source'] | 'reaction' | 'catalyst';

export interface CraftItem {
  id: string;
  nome: string;
  amount: number;
  catalyst: boolean;
  source: CraftItemSource;
  detail: string;
  reagent: Reagent | null;
}

export interface CraftOutput {
  id: string;
  nome: string;
  amount: number;
}

export interface CraftStep {
  key: string;
  kind: 'materials' | 'reaction';
  eyebrow: string;
  title: string;
  description: string;
  ingredients: CraftItem[];
  catalysts: CraftItem[];
  temperature: string | null;
  requirements: string[];
  output: CraftOutput | null;
  byproducts: CraftOutput[];
  effects: string[];
  recipeId: string | null;
  source: string | null;
  warnings: string[];
  isFinal: boolean;
  runs: number;
  yieldAmount: number;
}

export interface CraftProcedure {
  target: Reagent;
  recipe: Recipe;
  targetAmount: number;
  yieldAmount: number;
  runs: number;
  steps: CraftStep[];
  shopping: ShoppingItem[];
  catalysts: CraftItem[];
  containers: ProductionPlan['containers'];
  truncated: boolean;
  warnings: string[];
  plan: ProductionPlan;
}

function materialWarnings(plan: ProductionPlan): string[] {
  const warnings: string[] = [];
  if (plan.truncated) {
    warnings.push(
      'Há intermediários sem produção expandida por limite de profundidade ou de nós. Confira a lista de materiais e produza esses itens por outra rota antes de começar.',
    );
  }
  if (plan.shopping.some((item) => item.source === 'cycle')) {
    warnings.push(
      'A árvore encontrou um ciclo de produção. O item marcado como ciclo precisa ser coletado ou produzido por uma receita alternativa.',
    );
  }
  return warnings;
}

function outputList(recipe: Recipe, runs: number, targetId: string): CraftOutput[] {
  return recipe.produtos
    .filter((product) => product.id !== targetId)
    .map((product) => ({
      id: product.id,
      nome: product.nome,
      amount: product.quantidade * runs,
    }));
}

function reactionStep(
  node: PlanNode,
  recipe: Recipe,
  reagents: Map<string, Reagent>,
): CraftStep {
  const yieldAmount = recipeYield(recipe, node.id);
  const runs = yieldAmount > 0 ? node.amount / yieldAmount : 1;
  const ingredients: CraftItem[] = [];
  const catalysts: CraftItem[] = [];

  for (const ingredient of recipe.ingredientes) {
    const reagent = reagents.get(ingredient.id) ?? null;
    const item: CraftItem = {
      id: ingredient.id,
      nome: ingredient.nome,
      amount: ingredient.quantidade * runs,
      catalyst: ingredient.catalisador,
      source: ingredient.catalisador
        ? 'catalyst'
        : reagent?.dispensavel
          ? 'dispenser'
          : reagent && primaryRecipe(reagent)
            ? 'intermediate'
            : 'raw',
      detail: reagent?.dispensavel
        ? reagent.dispensavel_via ?? 'Disponível no ChemDispenser.'
        : '',
      reagent,
    };
    if (ingredient.catalisador) catalysts.push(item);
    else ingredients.push(item);
  }

  return {
    key: `reaction-${node.key}`,
    kind: 'reaction',
    eyebrow: node.isTarget ? 'lote final' : 'intermediário',
    title: `Produzir ${fmt(node.amount)}u de ${node.nome}`,
    description: `Receita ${recipe.id} · ${fmt(runs)} ${runs === 1 ? 'lote' : 'lotes'} para produzir ${fmt(node.amount)}u.`,
    ingredients,
    catalysts,
    temperature: formatTemperature(recipe.temperatura_min, recipe.temperatura_max),
    requirements: recipe.requer.map((requirement) => requirement.nome),
    output: {
      id: node.id,
      nome: node.nome,
      amount: node.amount,
    },
    byproducts: outputList(recipe, runs, node.id),
    effects: recipe.efeitos_da_reacao,
    recipeId: recipe.id,
    source: recipe.fonte,
    warnings: [],
    isFinal: node.isTarget,
    runs,
    yieldAmount,
  };
}

/**
 * Converte a árvore de produção em um roteiro de bancada: uma etapa de
 * separação dos materiais e, depois, cada reação em ordem topológica
 * (intermediários primeiro, lote final por último). Todos os números vêm
 * do plano e das receitas extraídas.
 */
export function buildCraftProcedure(
  data: ChemData,
  target: Reagent,
  recipe: Recipe,
  targetAmount: number,
  options: { maxDepth?: number; nodeLimit?: number } = {},
): CraftProcedure | null {
  const plan = buildProductionPlan(data, target, recipe, targetAmount, options);
  if (!plan) return null;

  const reagents = new Map(data.reagentes.map((reagent) => [reagent.id, reagent]));
  const operations: PlanNode[] = [];
  const visit = (node: PlanNode): void => {
    for (const child of node.children) {
      if (child.expanded && child.recipe) visit(child);
    }
    if (node.expanded && node.recipe) operations.push(node);
  };
  visit(plan.tree);

  const steps: CraftStep[] = [];
  const warnings = materialWarnings(plan);
  const materials: CraftItem[] = plan.shopping.map((item) => ({
    id: item.id,
    nome: item.nome,
    amount: item.amount,
    catalyst: false,
    source: item.source,
    detail: item.detail,
    reagent: item.reagent,
  }));
  const catalysts: CraftItem[] = plan.catalysts.map((item) => ({
    id: item.id,
    nome: item.nome,
    amount: item.amount,
    catalyst: true,
    source: 'catalyst',
    detail: item.detail,
    reagent: reagents.get(item.id) ?? null,
  }));

  if (materials.length || catalysts.length) {
    steps.push({
      key: 'materials',
      kind: 'materials',
      eyebrow: 'preparação',
      title: 'Separe os materiais',
      description: `Reúna os itens-base para ${fmt(plan.runs)} ${plan.runs === 1 ? 'lote' : 'lotes'} da receita ${recipe.id}.`,
      ingredients: materials,
      catalysts,
      temperature: null,
      requirements: [],
      output: null,
      byproducts: [],
      effects: [],
      recipeId: recipe.id,
      source: recipe.fonte,
      warnings,
      isFinal: false,
      runs: plan.runs,
      yieldAmount: plan.yieldAmount,
    });
  }

  for (const node of operations) {
    if (!node.recipe) continue;
    steps.push(reactionStep(node, node.recipe, reagents));
  }

  if (!steps.length) return null;
  return {
    target,
    recipe,
    targetAmount,
    yieldAmount: plan.yieldAmount,
    runs: plan.runs,
    steps,
    shopping: plan.shopping,
    catalysts,
    containers: plan.containers,
    truncated: plan.truncated,
    warnings,
    plan,
  };
}

/** Rótulo curto para a origem de um item na etapa de materiais. */
export function craftSourceLabel(source: CraftItemSource): string {
  switch (source) {
    case 'dispenser':
      return 'dispensador';
    case 'intermediate':
      return 'produzir antes';
    case 'raw':
      return 'sem receita';
    case 'cycle':
      return 'ciclo';
    case 'catalyst':
      return 'catalisador';
    default:
      return '';
  }
}
