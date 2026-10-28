import type { ChemData, Container, Recipe, Reagent } from '../types';
import { fmt } from './text';

export interface PlanNode {
  key: string;
  id: string;
  nome: string;
  amount: number;
  reagent: Reagent | null;
  recipe: Recipe | null;
  catalyst: boolean;
  isTarget: boolean;
  expanded: boolean;
  cycle: boolean;
  depthLimited: boolean;
  nodeLimited: boolean;
  children: PlanNode[];
}

export interface ShoppingItem {
  id: string;
  nome: string;
  amount: number;
  source: 'dispenser' | 'intermediate' | 'raw' | 'cycle';
  detail: string;
  reagent: Reagent | null;
}

export interface CatalystItem {
  id: string;
  nome: string;
  amount: number;
  detail: string;
}

export interface ProductionPlan {
  target: Reagent;
  recipe: Recipe;
  targetAmount: number;
  yieldAmount: number;
  runs: number;
  tree: PlanNode;
  shopping: ShoppingItem[];
  catalysts: CatalystItem[];
  totalInput: number;
  containers: Container[];
  truncated: boolean;
}

export function recipeYield(recipe: Recipe, productId: string): number {
  return recipe.produtos.find((product) => product.id === productId)?.quantidade ?? 0;
}

export function primaryRecipe(reagent: Reagent): Recipe | null {
  return reagent.receitas.find((recipe) => recipe.principal) ?? reagent.receitas[0] ?? null;
}

export function containerSuggestions(data: ChemData, amount: number, limit = 3): Container[] {
  const sorted = [...data.recipientes].sort((a, b) => a.capacidade - b.capacidade);
  const enough = sorted.filter((container) => container.capacidade >= amount).slice(0, limit);
  if (enough.length) return enough;
  return sorted.slice(-limit).reverse();
}

interface BuildContext {
  data: ChemData;
  reagents: Map<string, Reagent>;
  nodeCount: number;
  nodeLimit: number;
  maxDepth: number;
}

function makeNode(
  context: BuildContext,
  id: string,
  amount: number,
  extra: Partial<PlanNode> = {},
): PlanNode {
  const reagent = context.reagents.get(id) ?? null;
  return {
    key: `${id}-${context.nodeCount++}`,
    id,
    nome: reagent?.nome ?? id,
    amount,
    reagent,
    recipe: null,
    catalyst: false,
    isTarget: false,
    expanded: false,
    cycle: false,
    depthLimited: false,
    nodeLimited: false,
    children: [],
    ...extra,
  };
}

function expandIngredients(
  context: BuildContext,
  parent: PlanNode,
  recipe: Recipe,
  runs: number,
  depth: number,
  path: Set<string>,
): void {
  for (const ingredient of recipe.ingredientes) {
    const amount = ingredient.quantidade * runs;
    if (!Number.isFinite(amount)) continue;
    const child = makeNode(context, ingredient.id, amount, {
      catalyst: ingredient.catalisador,
      isTarget: false,
    });
    parent.children.push(child);
    if (ingredient.catalisador) {
      // Catalisadores são necessários no meio reacional, mas não são consumidos.
      child.recipe = child.reagent ? primaryRecipe(child.reagent) : null;
      continue;
    }
    if (path.has(ingredient.id)) {
      child.cycle = true;
      child.recipe = child.reagent ? primaryRecipe(child.reagent) : null;
      continue;
    }
    if (context.nodeCount >= context.nodeLimit) {
      child.nodeLimited = true;
      child.recipe = child.reagent ? primaryRecipe(child.reagent) : null;
      continue;
    }
    if (depth >= context.maxDepth) {
      child.depthLimited = true;
      child.recipe = child.reagent ? primaryRecipe(child.reagent) : null;
      continue;
    }
    if (!child.reagent || child.reagent.dispensavel) {
      continue;
    }
    const nested = primaryRecipe(child.reagent);
    if (!nested) continue;
    const nestedYield = recipeYield(nested, child.id);
    if (!(nestedYield > 0)) continue;
    child.recipe = nested;
    child.expanded = true;
    const childPath = new Set(path);
    childPath.add(child.id);
    expandIngredients(context, child, nested, amount / nestedYield, depth + 1, childPath);
  }
}

function collectPlan(
  node: PlanNode,
  shopping: Map<string, ShoppingItem>,
  catalysts: Map<string, CatalystItem>,
  path: Set<string> = new Set(),
): void {
  if (node.catalyst) {
    const key = node.id;
    const existing = catalysts.get(key);
    if (existing) existing.amount += node.amount;
    else {
      catalysts.set(key, {
        id: node.id,
        nome: node.nome,
        amount: node.amount,
        detail: 'Não consumido pela reação; precisa estar presente.',
      });
    }
    return;
  }
  if (node.expanded && node.children.length > 0) {
    for (const child of node.children) collectPlan(child, shopping, catalysts, path);
    return;
  }
  if (node.isTarget) return;
  const source: ShoppingItem['source'] = node.cycle
    ? 'cycle'
    : node.reagent?.dispensavel
      ? 'dispenser'
      : node.recipe
        ? 'intermediate'
        : 'raw';
  const detail = node.cycle
    ? 'Ciclo de produção: colete ou use uma receita alternativa.'
    : node.reagent?.dispensavel
      ? 'Disponível no ChemDispenser.'
      : node.recipe
        ? 'Tem receita, mas não foi expandido por limite de profundidade/nós.'
        : 'Sem receita de produção mapeada no repositório.';
  const existing = shopping.get(node.id);
  if (existing) existing.amount += node.amount;
  else {
    shopping.set(node.id, {
      id: node.id,
      nome: node.nome,
      amount: node.amount,
      source,
      detail,
      reagent: node.reagent,
    });
  }
}

export function buildProductionPlan(
  data: ChemData,
  target: Reagent,
  recipe: Recipe,
  targetAmount: number,
  options: { maxDepth?: number; nodeLimit?: number } = {},
): ProductionPlan | null {
  const yieldAmount = recipeYield(recipe, target.id);
  if (!(yieldAmount > 0) || !(targetAmount > 0)) return null;
  const reagents = new Map(data.reagentes.map((reagent) => [reagent.id, reagent]));
  const context: BuildContext = {
    data,
    reagents,
    nodeCount: 0,
    nodeLimit: options.nodeLimit ?? 600,
    maxDepth: options.maxDepth ?? 7,
  };
  const runs = targetAmount / yieldAmount;
  const tree = makeNode(context, target.id, targetAmount, {
    reagent: target,
    recipe,
    isTarget: true,
    expanded: true,
  });
  expandIngredients(context, tree, recipe, runs, 0, new Set([target.id]));
  const shopping = new Map<string, ShoppingItem>();
  const catalysts = new Map<string, CatalystItem>();
  for (const child of tree.children) collectPlan(child, shopping, catalysts);
  const totalInput = recipe.ingredientes.reduce((sum, ingredient) => sum + ingredient.quantidade * runs, 0);
  const shoppingList = [...shopping.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const catalystList = [...catalysts.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const truncated = [...shoppingList].some((item) => item.source === 'intermediate' || item.source === 'cycle');
  return {
    target,
    recipe,
    targetAmount,
    yieldAmount,
    runs,
    tree,
    shopping: shoppingList,
    catalysts: catalystList,
    totalInput,
    containers: containerSuggestions(data, Math.max(targetAmount, totalInput)),
    truncated,
  };
}

export function totalShoppingVolume(plan: ProductionPlan): number {
  return plan.shopping.reduce((sum, item) => sum + item.amount, 0);
}

export function planSummary(plan: ProductionPlan): string {
  return `${fmt(plan.runs)} ${plan.runs === 1 ? 'lote' : 'lotes'} para ${fmt(plan.targetAmount)}u`;
}
