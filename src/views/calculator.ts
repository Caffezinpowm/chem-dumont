import type { ChemData, Recipe, Reagent } from '../types';
import { appHref, replaceRoute } from '../lib/router';
import { findReagent, producibleReagents, reagentHref } from '../data';
import {
  emptyState,
  formulaSummary,
  groupBadge,
  pageHeading,
  productionPlanHtml,
  reagentSprite,
  recipeDetails,
} from '../lib/components';
import { buildProductionPlan, recipeYield } from '../lib/production';
import { favoriteButton } from '../lib/state';
import { esc, fmt, fmtInt, formatTemperature } from '../lib/text';
import { groupLabel, NO_GROUP_ID, orderedGroups } from '../lib/groups';
import type { ViewResult } from './types';

function initialAmount(recipe: Recipe | null, raw: string | null): number {
  const parsed = Number((raw ?? '').replace(',', '.'));
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return recipe ? Math.max(recipeYield(recipe, recipe.produto_alvo) * 10, 30) : 30;
}

function targetInfo(reagent: Reagent): string {
  return `<div class="calc-target">
    <div class="calc-target__visual">${reagentSprite(reagent, 'lg')}</div>
    <div class="calc-target__copy">
      <div class="calc-target__eyebrow">${groupBadge(reagent.grupo)}<code class="reagent-id">${esc(reagent.id)}</code></div>
      <h2>${esc(reagent.nome)}</h2>
      <p>${esc(reagent.descricao || 'Sem descrição no repositório.')}</p>
      <div class="calc-target__links">
        <a class="text-link" href="${reagentHref(reagent.id)}">Abrir ficha completa <span aria-hidden="true">→</span></a>
      </div>
    </div>
    ${favoriteButton(reagent.id, true)}
  </div>`;
}

function recipeOptions(reagent: Reagent, selectedId: string | null): string {
  return reagent.receitas
    .map(
      (recipe) =>
        `<option value="${esc(recipe.id)}" ${recipe.id === selectedId ? 'selected' : ''}>${esc(recipe.id)} — ${esc(formulaSummary(recipe, reagent.id))}${recipe.principal ? ' (principal)' : ''}</option>`,
    )
    .join('');
}

function targetOptions(data: ChemData, selectedId: string): string {
  const producible = producibleReagents(data);
  const groups = orderedGroups(data).filter((group) =>
    producible.some((reagent) => reagent.grupo === group),
  );
  const blocks = groups.map(
    (group) => `<optgroup label="${esc(groupLabel(group))}">
      ${producible
        .filter((reagent) => reagent.grupo === group)
        .map(
          (reagent) =>
            `<option value="${esc(reagent.id)}" ${reagent.id === selectedId ? 'selected' : ''}>${esc(reagent.nome)} — ${esc(reagent.id)}</option>`,
        )
        .join('')}
    </optgroup>`,
  );
  const ungrouped = producible.filter((reagent) => !reagent.grupo);
  if (ungrouped.length) {
    blocks.push(`<optgroup label="Sem grupo">
      ${ungrouped
        .map(
          (reagent) =>
            `<option value="${esc(reagent.id)}" ${reagent.id === selectedId ? 'selected' : ''}>${esc(reagent.nome)} — ${esc(reagent.id)}</option>`,
        )
        .join('')}
    </optgroup>`);
  }
  return blocks.join('');
}

function conditionsHtml(recipe: Recipe): string {
  const requirements = recipe.requer.length
    ? recipe.requer.map((requirement) => esc(requirement.nome)).join(', ')
    : 'nenhum extra';
  return `<div class="calc-conditions">
    <div><span>Temperatura</span><strong>${esc(formatTemperature(recipe.temperatura_min, recipe.temperatura_max))}</strong></div>
    <div><span>Equipamento</span><strong>${requirements}</strong></div>
    <div><span>Quantizada</span><strong>${recipe.quantizada ? 'sim' : 'não'}</strong></div>
    <div><span>Rendimento</span><strong>${fmt(recipeYield(recipe, recipe.produto_alvo))} u</strong></div>
  </div>`;
}

function outputHtml(data: ChemData, reagent: Reagent, recipe: Recipe, amount: number): string {
  const plan = buildProductionPlan(data, reagent, recipe, amount);
  return `${targetInfo(reagent)}
    ${conditionsHtml(recipe)}
    ${plan ? productionPlanHtml(plan, data) : `<div class="notice notice--warning"><strong>Não foi possível montar a árvore</strong><p>Confira a quantidade e a receita escolhida.</p></div>`}
    <details class="more-recipes calc-recipe-source">
      <summary>Ver os dados completos desta receita</summary>
      <div class="recipe-stack">${recipeDetails(recipe, reagent.id)}</div>
    </details>`;
}

export function calculatorView(data: ChemData, query: URLSearchParams): ViewResult {
  const producible = producibleReagents(data);
  const requested = findReagent(data, query.get('reagente'));
  const target =
    requested && !requested.abstrato && requested.receitas.length
      ? requested
      : findReagent(data, 'Dylovene') ?? producible[0];
  if (!target) {
    return {
      title: 'Calculadora — Guia de Chem',
      html: `<div class="container page">${emptyState(
        'Nenhum produto produzível',
        'O conjunto de dados não trouxe reações com produto. Regenere os dados a partir do repositório.',
        `<a class="button button--primary" href="${appHref('/')}">Voltar ao início</a>`,
      )}</div>`,
    };
  }
  const recipe =
    target.receitas.find((item) => item.id === query.get('receita')) ??
    target.receitas.find((item) => item.principal) ??
    target.receitas[0];
  const amount = initialAmount(recipe, query.get('qtd'));
  const groupCount = new Set(producible.map((reagent) => reagent.grupo ?? NO_GROUP_ID)).size;
  return {
    title: 'Calculadora de lotes — Guia de Chem',
    html: `<div class="page page--calculator">
      <div class="container">
        ${pageHeading({
          eyebrow: 'planejamento de bancada',
          title: 'Calculadora de lotes',
          intro: 'Escolha o produto, a rota e a quantidade final. A árvore de produção, a lista de compras e os recipientes são recalculados com as proporções extraídas do fork.',
          actions: `<button class="button button--ghost" type="button" data-copy-link>Copiar link do cálculo</button>`,
        })}

        <div class="calc-layout">
          <aside class="calc-side">
            <form class="calc-form" data-calc-form>
              <div class="calc-form__head">
                <span class="eyebrow">parâmetros</span>
                <span class="muted small">${fmtInt(producible.length)} produtos · ${fmtInt(groupCount)} grupos</span>
              </div>
              <label class="field">
                <span>Produto final</span>
                <select name="target" data-calc-target>
                  ${targetOptions(data, target.id)}
                </select>
              </label>
              <label class="field">
                <span>Receita</span>
                <select name="recipe" data-calc-recipe>
                  ${recipeOptions(target, recipe.id)}
                </select>
              </label>
              <label class="field">
                <span>Quantidade final</span>
                <div class="input-unit">
                  <input name="amount" data-calc-amount type="number" min="0.1" step="0.1" value="${amount}" inputmode="decimal" />
                  <span>u</span>
                </div>
              </label>
              <p class="fine-print">A calculadora usa a receita principal para expandir os ingredientes intermediários. As alternativas ficam disponíveis na lista de receitas.</p>
              <button class="button button--primary button--block" type="submit">Calcular lote</button>
            </form>

            <section class="calc-shortcuts">
              <span class="eyebrow">atalhos</span>
              <h2>Produtos frequentes</h2>
              <div class="chip-cloud">
                ${['Dylovene', 'Bicaridine', 'Charcoal', 'Epinephrine', 'Tricordrazine']
                  .filter((id) => producible.some((reagent) => reagent.id === id))
                  .map((id) => {
                    const reagent = producible.find((item) => item.id === id)!;
                    return `<a class="reagent-chip" href="${appHref(`/calculadora?reagente=${encodeURIComponent(id)}`)}" style="--chip-color:${reagent.cor_hex ?? 'var(--color-unknown)'}"><span class="reagent-chip__dot"></span>${esc(reagent.nome)}</a>`;
                  })
                  .join('')}
              </div>
              <p class="fine-print">O cálculo é uma estimativa de proporção. Requisitos de mistura, temperatura e equipamento não alteram as quantidades.</p>
            </section>

            <section class="calc-shortcuts">
              <span class="eyebrow">referência</span>
              <h2>Como ler o resultado</h2>
              <dl class="calc-legend">
                <div><dt>Lotes</dt><dd>quantas vezes a reação precisa rodar para chegar à quantidade final.</dd></div>
                <div><dt>Folhas</dt><dd>reagentes sem receita posterior ou disponíveis no dispensador; entram na lista de compras.</dd></div>
                <div><dt>Catalisadores</dt><dd>precisam estar presentes, mas não são consumidos pela reação.</dd></div>
              </dl>
            </section>
          </aside>

          <div class="calc-main">
            <div class="calc-result-head">
              <div>
                <p class="eyebrow">resultado</p>
                <h2>Plano de produção</h2>
              </div>
              <span class="planner__badge">estimativa</span>
            </div>
            <div class="calc-output" data-calc-output aria-live="polite">
              ${outputHtml(data, target, recipe, amount)}
            </div>
          </div>
        </div>
      </div>
    </div>`,
    mount(main) {
      const form = main.querySelector<HTMLFormElement>('[data-calc-form]');
      const targetSelect = main.querySelector<HTMLSelectElement>('[data-calc-target]');
      const recipeSelect = main.querySelector<HTMLSelectElement>('[data-calc-recipe]');
      const amountInput = main.querySelector<HTMLInputElement>('[data-calc-amount]');
      const output = main.querySelector<HTMLElement>('[data-calc-output]');
      if (!form || !targetSelect || !recipeSelect || !amountInput || !output) return;

      const getTarget = () => findReagent(data, targetSelect.value) ?? target;
      const getRecipe = (reagent: Reagent) =>
        reagent.receitas.find((item) => item.id === recipeSelect.value) ??
        reagent.receitas.find((item) => item.principal) ??
        reagent.receitas[0];

      const updateUrl = (reagent: Reagent, recipeId: string, amount: number) => {
        replaceRoute(
          `/calculadora?reagente=${encodeURIComponent(reagent.id.toLowerCase())}&receita=${encodeURIComponent(recipeId)}&qtd=${encodeURIComponent(String(amount))}`,
        );
      };

      const compute = (options: { targetChanged?: boolean; updateUrl?: boolean } = {}) => {
        const reagent = getTarget();
        if (options.targetChanged) {
          recipeSelect.innerHTML = recipeOptions(reagent, reagent.receitas.find((item) => item.principal)?.id ?? reagent.receitas[0]?.id ?? null);
        }
        const nextRecipe = getRecipe(reagent);
        if (!nextRecipe) {
          output.innerHTML = `<div class="notice notice--warning"><strong>Sem receita utilizável</strong><p>Este produto não tem uma reação de produção mapeada.</p></div>`;
          return;
        }
        const amount = Math.max(0.1, Number(amountInput.value.replace(',', '.')) || 0);
        amountInput.value = String(amount);
        output.innerHTML = outputHtml(data, reagent, nextRecipe, amount);
        if (options.updateUrl !== false) updateUrl(reagent, nextRecipe.id, amount);
      };

      targetSelect.addEventListener('change', () => compute({ targetChanged: true }));
      recipeSelect.addEventListener('change', () => compute());
      amountInput.addEventListener('change', () => compute());
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        compute();
      });
    },
  };
}
