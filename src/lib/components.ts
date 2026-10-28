import type { ChemData, Container, MetabolismEffect, Recipe, Reagent, Threshold } from '../types';
import { assetHref, appHref, navigate } from '../lib/router';
import { searchReagents } from '../lib/search';
import {
  buildProductionPlan,
  planSummary,
  recipeYield,
  totalShoppingVolume,
  type PlanNode,
  type ProductionPlan,
} from '../lib/production';
import {
  colorCss,
  displaySource,
  esc,
  fmt,
  fmtInt,
  formatTemperature,
  percent,
  sourceUrl,
} from '../lib/text';
import { favoriteButton } from '../lib/state';
import { groupColor, groupHref, groupLabel } from '../lib/groups';
import { reagentHref } from '../data';

const SPRITE_BASE = 'sprites/';

export function reagentSprite(reagent: Reagent, size: 'sm' | 'md' | 'lg' = 'md'): string {
  const hasColor = !!reagent.cor_hex;
  const color = hasColor ? reagent.cor_hex! : 'transparent';
  // O beaker.rsi declara a camada de líquido como beaker1..beaker6, desenhada
  // sobre o vidro e colorida pela solução. Usamos beaker5 (≈3/4) como amostra.
  const fillStyle = hasColor
    ? `--fill-mask:url('${assetHref(`${SPRITE_BASE}beaker.rsi/beaker5.png`)}')`
    : '';
  return `<span class="reagent-sprite reagent-sprite--${size}${hasColor ? '' : ' reagent-sprite--empty'}" style="--reagent-color:${color}" aria-hidden="true" title="Béquer com líquido tingido pela cor do reagente">
    <img class="reagent-sprite__glass" src="${assetHref(`${SPRITE_BASE}beaker.rsi/beaker.png`)}" alt="" width="32" height="32" loading="lazy" decoding="async" />
    ${hasColor ? `<span class="reagent-sprite__fill" style="${fillStyle}"></span>` : ''}
  </span>`;
}

export function colorToken(reagent: Reagent): string {
  if (!reagent.cor_hex) {
    return `<span class="color-token color-token--unknown"><span class="color-token__swatch" aria-hidden="true"></span><code>sem cor</code></span>`;
  }
  return `<span class="color-token"><span class="color-token__swatch" style="background:${esc(reagent.cor_hex)}" aria-hidden="true"></span><code>${esc(reagent.cor_hex)}</code></span>`;
}

function ingredientNames(recipe: Recipe, targetId: string): string {
  return recipe.ingredientes
    .map((ingredient) => `${fmt(ingredient.quantidade)}u ${ingredient.nome}${ingredient.catalisador ? ' (cat.)' : ''}`)
    .join(' + ');
}

export function formulaLine(recipe: Recipe, targetId: string, maxIngredients = 4): string {
  const shown = recipe.ingredientes.slice(0, maxIngredients);
  const hidden = recipe.ingredientes.length - shown.length;
  const parts = shown
    .map(
      (ingredient) =>
        `<span class="formula__ingredient">${fmt(ingredient.quantidade)}u ${esc(ingredient.nome)}${ingredient.catalisador ? ' <span class="formula__cat">cat.</span>' : ''}</span>`,
    )
    .join('<span class="formula__plus">+</span>');
  const target = recipe.produtos.find((product) => product.id === targetId) ?? recipe.produtos[0];
  const extra = hidden > 0 ? `<span class="formula__more">+${hidden}</span>` : '';
  return `<span class="formula">${parts}${extra}<span class="formula__arrow">→</span><span class="formula__result">${fmt(target?.quantidade ?? 0)}u</span></span>`;
}

export function formulaSummary(recipe: Recipe, targetId: string): string {
  const ingredients = ingredientNames(recipe, targetId);
  const target = recipe.produtos.find((product) => product.id === targetId) ?? recipe.produtos[0];
  return `${ingredients} → ${fmt(target?.quantidade ?? 0)}u`;
}

export function recipeCountLabel(reagent: Reagent): string {
  const count = reagent.receitas.length;
  if (!count) return 'sem receita mapeada';
  return `${fmtInt(count)} ${count === 1 ? 'receita' : 'receitas'}`;
}

export function reagentCard(reagent: Reagent, options: { showGroup?: boolean } = {}): string {
  const principal = reagent.receitas.find((recipe) => recipe.principal) ?? reagent.receitas[0] ?? null;
  const group = groupLabel(reagent.grupo);
  const isFood = reagent.grupo === 'Foods' || reagent.grupo === 'AlcoholicDrinks' || reagent.grupo === 'NonAlcoholicDrinks';
  const tags: string[] = [];
  if (reagent.abstrato) tags.push('<span class="pill pill--muted">abstrato</span>');
  if (reagent.dispensavel) tags.push('<span class="pill pill--dispenser">dispensador</span>');
  if (isFood) tags.push('<span class="pill pill--food">bebida/comida</span>');
  if (reagent.traducao === 'en-US') tags.push('<span class="pill pill--lang" title="Texto exibido em inglês por falta de pt-BR">EN</span>');
  else if (reagent.traducao === 'mista') tags.push('<span class="pill pill--lang" title="Parte do texto veio do fallback em inglês">EN parcial</span>');
  return `<article class="reagent-card" style="--group-color:${groupColor(reagent.grupo)}">
    <div class="reagent-card__top">
      <div class="reagent-card__visual">${reagentSprite(reagent, 'md')}</div>
      <div class="reagent-card__head">
        <div class="reagent-card__eyebrow">
          ${options.showGroup === false ? '' : `<a class="group-mini" href="${groupHref(reagent.grupo)}">${esc(group)}</a>`}
          <span class="reagent-id">${esc(reagent.id)}</span>
        </div>
        <h3 class="reagent-card__title"><a href="${reagentHref(reagent.id)}">${esc(reagent.nome)}</a></h3>
      </div>
      ${favoriteButton(reagent.id, true)}
    </div>
    <p class="reagent-card__desc">${esc(reagent.descricao || 'Sem descrição no repositório.')}</p>
    <div class="reagent-card__formula">${
      principal ? formulaLine(principal, reagent.id, 3) : '<span class="muted">Sem receita de produção no repositório.</span>'
    }</div>
    <div class="reagent-card__footer">
      <span class="reagent-card__meta">${esc(recipeCountLabel(reagent))}</span>
      ${colorToken(reagent)}
    </div>
    <div class="reagent-card__tags">${tags.join('')}</div>
  </article>`;
}

export function groupBadge(group: string | null, link = true): string {
  const label = groupLabel(group);
  const inner = `<span class="group-dot" aria-hidden="true"></span>${esc(label)}`;
  if (!link) return `<span class="group-badge" style="--group-color:${groupColor(group)}">${inner}</span>`;
  return `<a class="group-badge" style="--group-color:${groupColor(group)}" href="${groupHref(group)}">${inner}</a>`;
}

export function pageHeading(options: {
  eyebrow?: string;
  title: string;
  intro?: string;
  actions?: string;
}): string {
  return `<header class="page-heading">
    <div>
      ${options.eyebrow ? `<p class="eyebrow">${esc(options.eyebrow)}</p>` : ''}
      <h1>${esc(options.title)}</h1>
      ${options.intro ? `<p class="page-heading__intro">${options.intro}</p>` : ''}
    </div>
    ${options.actions ? `<div class="page-heading__actions">${options.actions}</div>` : ''}
  </header>`;
}

export function emptyState(title: string, text: string, action = ''): string {
  return `<div class="empty-state">
    <div class="empty-state__symbol" aria-hidden="true">⌬</div>
    <h2>${esc(title)}</h2>
    <p>${text}</p>
    ${action}
  </div>`;
}

export function searchBoxHtml(options: { id: string; variant?: 'header' | 'hero'; label?: string }): string {
  const id = options.id;
  const variant = options.variant ?? 'header';
  return `<form class="search-box search-box--${variant}" role="search" data-search-form>
    <label class="sr-only" for="${id}">Buscar reagentes por nome, id ou ingrediente</label>
    <span class="search-box__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false">
        <circle cx="10.5" cy="10.5" r="6.5"></circle>
        <path d="m15.5 15.5 4 4"></path>
      </svg>
    </span>
    <input
      id="${id}"
      class="search-box__input"
      type="search"
      name="q"
      placeholder="${variant === 'hero' ? 'Busque por nome, id ou ingrediente…' : 'Buscar reagente, id ou ingrediente'}"
      autocomplete="off"
      spellcheck="false"
      aria-controls="${id}-results"
      aria-expanded="false"
    />
    <button class="search-box__submit" type="submit">Buscar</button>
    <div class="search-panel" id="${id}-results" data-search-panel hidden></div>
    <p class="search-box__hint" id="${id}-hint">Texto em português ou id em inglês, ex.: <kbd>dylovene</kbd>, <kbd>silício</kbd>.</p>
  </form>`;
}

export function setupSearchBox(root: HTMLElement, data: ChemData): void {
  const form = root.querySelector<HTMLFormElement>('[data-search-form]');
  const input = form?.querySelector<HTMLInputElement>('input[type="search"]');
  const panel = form?.querySelector<HTMLElement>('[data-search-panel]');
  if (!form || !input || !panel) return;
  let activeIndex = -1;

  const hide = () => {
    panel.hidden = true;
    panel.innerHTML = '';
    activeIndex = -1;
    input.setAttribute('aria-expanded', 'false');
  };

  const links = () => [...panel.querySelectorAll<HTMLAnchorElement>('a')];

  const render = () => {
    const query = input.value.trim();
    if (!query) {
      hide();
      return;
    }
    const results = searchReagents(data, query, { limit: 7 });
    const hiddenCount = searchReagents(data, query, {
      limit: Number.MAX_SAFE_INTEGER,
      includeAbstract: true,
      includeConsumables: true,
    }).length - searchReagents(data, query, { limit: Number.MAX_SAFE_INTEGER }).length;
    let body = '';
    if (results.length) {
      body = `<ul class="search-panel__list">
        ${results
          .map(
            (result) => `<li>
              <a class="search-hit" href="${reagentHref(result.reagent.id)}">
                <span class="search-hit__dot" style="background:${result.reagent.cor_hex ?? 'var(--color-unknown)'}" aria-hidden="true"></span>
                <span class="search-hit__text">
                  <strong>${esc(result.reagent.nome)}</strong>
                  <small>${esc(result.reagent.id)} · ${esc(groupLabel(result.reagent.grupo))}${result.reason ? ` · ${esc(result.reason)}` : ''}</small>
                </span>
                <span class="search-hit__arrow" aria-hidden="true">↗</span>
              </a>
            </li>`,
          )
          .join('')}
      </ul>`;
    } else {
      body = `<p class="search-panel__empty">Nenhum reagente visível com esse termo. ${
        hiddenCount > 0 ? 'Há resultados entre bebidas/comidas ou reagentes abstratos ocultos.' : 'Tente outro nome ou id.'
      }</p>`;
    }
    panel.innerHTML = `${body}
      <a class="search-panel__all" href="${appHref(`/reagentes?q=${encodeURIComponent(query)}`)}">Ver busca completa e filtros <span aria-hidden="true">→</span></a>`;
    panel.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    activeIndex = -1;
  };

  const focusActive = () => {
    const all = links();
    if (!all.length) return;
    if (activeIndex < 0) activeIndex = 0;
    if (activeIndex >= all.length) activeIndex = all.length - 1;
    all.forEach((link, index) => link.classList.toggle('is-active', index === activeIndex));
    all[activeIndex]?.focus({ preventScroll: false });
    all[activeIndex]?.scrollIntoView({ block: 'nearest' });
  };

  input.addEventListener('input', render);
  input.addEventListener('focus', () => {
    if (input.value.trim()) render();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hide();
      input.blur();
    } else if (event.key === 'ArrowDown') {
      if (panel.hidden) render();
      if (!panel.hidden) {
        event.preventDefault();
        focusActive();
      }
    } else if (event.key === 'ArrowUp' && !panel.hidden) {
      event.preventDefault();
      const all = links();
      if (!all.length) return;
      activeIndex = activeIndex <= 0 ? all.length - 1 : activeIndex - 1;
      all.forEach((link, index) => link.classList.toggle('is-active', index === activeIndex));
      all[activeIndex]?.focus();
    }
  });

  panel.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Escape') return;
    if (event.key === 'Escape') {
      event.preventDefault();
      hide();
      input.focus();
      return;
    }
    event.preventDefault();
    const all = links();
    if (!all.length) return;
    activeIndex = event.key === 'ArrowDown' ? (activeIndex + 1) % all.length : (activeIndex - 1 + all.length) % all.length;
    all.forEach((link, index) => link.classList.toggle('is-active', index === activeIndex));
    all[activeIndex]?.focus();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const query = input.value.trim();
    hide();
    navigate(`/reagentes${query ? `?q=${encodeURIComponent(query)}` : ''}`);
  });

  document.addEventListener('click', (event) => {
    if (!form.contains(event.target as Node)) hide();
  });

  panel.addEventListener('click', (event) => {
    if ((event.target as Element).closest('a')) hide();
  });
}

export function metabolismLabel(effect: MetabolismEffect): string {
  const id = effect.grupo_metabolismo_nome ?? effect.grupo_metabolismo ?? 'Metabolismo';
  const labels: Record<string, string> = {
    Poison: 'Veneno',
    Drink: 'Bebida',
    Narcotic: 'Narcótico',
    Medicine: 'Medicina',
    Food: 'Comida',
    Gas: 'Gás',
    Alcohol: 'Álcool',
  };
  return labels[id] ?? id;
}

export function effectList(reagent: Reagent): string {
  if (!reagent.efeitos.length && !reagent.efeitos_planta.length) {
    return emptyState(
      'Sem efeitos de metabolismo',
      'O protótipo não declara efeitos metabólicos ou de planta neste fork.',
    );
  }
  const grouped = new Map<string, MetabolismEffect[]>();
  for (const effect of reagent.efeitos) {
    const key = effect.grupo_metabolismo ?? 'Metabolismo';
    const list = grouped.get(key) ?? [];
    list.push(effect);
    grouped.set(key, list);
  }
  const metabolismBlocks = [...grouped.entries()].map(
    ([group, effects]) => `<section class="effect-group">
      <div class="effect-group__head">
        <h3>${esc(metabolismLabel(effects[0]))}</h3>
        <span class="muted">${effects.length} ${effects.length === 1 ? 'efeito' : 'efeitos'}</span>
      </div>
      <ul class="effect-list">
        ${effects
          .map(
            (effect) => `<li class="effect-item">
              <div class="effect-item__top">
                <span class="tag">${esc(effect.tipo)}</span>
                ${effect.probabilidade != null ? `<span class="chance">${percent(effect.probabilidade)} de chance</span>` : ''}
              </div>
              <p>${esc(effect.descricao)}</p>
              ${
                effect.condicoes.length
                  ? `<ul class="condition-list">${effect.condicoes.map((condition) => `<li>${esc(condition)}</li>`).join('')}</ul>`
                  : ''
              }
              ${effect.taxa != null ? `<p class="muted small">Taxa de metabolização: ${fmt(effect.taxa)}</p>` : ''}
            </li>`,
          )
          .join('')}
      </ul>
    </section>`,
  );
  const plantBlock = reagent.efeitos_planta.length
    ? `<section class="effect-group">
        <div class="effect-group__head">
          <h3>Metabolismo de planta</h3>
          <span class="muted">${reagent.efeitos_planta.length} ${reagent.efeitos_planta.length === 1 ? 'efeito' : 'efeitos'}</span>
        </div>
        <ul class="effect-list">
          ${reagent.efeitos_planta
            .map(
              (effect) => `<li class="effect-item">
                <div class="effect-item__top"><span class="tag">${esc(effect.tipo)}</span></div>
                <p>${esc(effect.descricao)}</p>
                ${
                  effect.condicoes.length
                    ? `<ul class="condition-list">${effect.condicoes.map((condition) => `<li>${esc(condition)}</li>`).join('')}</ul>`
                    : ''
                }
              </li>`,
            )
            .join('')}
        </ul>
      </section>`
    : '';
  return `<div class="effects">${metabolismBlocks.join('')}${plantBlock}</div>`;
}

export function thresholdList(reagent: Reagent): string {
  if (!reagent.limiares.length) {
    return '<p class="muted">Nenhum limiar de concentração extraído para este reagente.</p>';
  }
  return `<div class="threshold-grid">
    ${reagent.limiares
      .map(
        (threshold: Threshold) => `<article class="threshold-card${threshold.provavel_overdose ? ' is-overdose' : ''}">
          <div class="threshold-card__head">
            <span class="threshold-amount">${thresholdText(threshold)}</span>
            ${threshold.provavel_overdose ? '<span class="pill pill--danger">possível overdose</span>' : ''}
          </div>
          <p class="muted small">${threshold.reagente === reagent.id ? 'Do próprio reagente' : `Reagente: ${esc(threshold.reagente_nome)}`}${
            threshold.ocorrencias > 1 ? ` · ${threshold.ocorrencias} ocorrências` : ''
          }</p>
          <ul class="threshold-effects">
            ${threshold.efeitos.map((effect) => `<li>${esc(effect)}</li>`).join('')}
          </ul>
        </article>`,
      )
      .join('')}
  </div>
  <p class="fine-print">A marcação “possível overdose” é uma heurística de apresentação do guia para limiares com mínimo ≥ 20u; o jogo é a fonte da verdade.</p>`;
}

function thresholdText(threshold: Threshold): string {
  if (threshold.minimo != null && threshold.maximo != null) {
    return `${fmt(threshold.minimo)}–${fmt(threshold.maximo)}u`;
  }
  if (threshold.minimo != null) return `≥ ${fmt(threshold.minimo)}u`;
  if (threshold.maximo != null) return `≤ ${fmt(threshold.maximo)}u`;
  return 'sem valor';
}

export function recipeDetails(recipe: Recipe, targetId: string): string {
  const target = recipe.produtos.find((product) => product.id === targetId);
  const byproducts = recipe.produtos.filter((product) => product.id !== targetId);
  const requirementText = recipe.requer.length
    ? recipe.requer.map((requirement) => `${requirement.nome} (${requirement.id})`).join(', ')
    : 'Nenhum equipamento obrigatório extra';
  const temperature = formatTemperature(recipe.temperatura_min, recipe.temperatura_max);
  return `<article class="recipe-card${recipe.principal ? ' is-primary' : ''}">
    <header class="recipe-card__head">
      <div>
        <div class="recipe-card__kicker">
          <span class="tag">${esc(recipe.id)}</span>
          ${recipe.principal ? '<span class="pill pill--primary">principal</span>' : ''}
          ${recipe.total_alternativas > 1 ? `<span class="pill" title="Todas as receitas mapeadas para este produto, incluindo esta">${fmtInt(recipe.total_alternativas)} receitas no total</span>` : ''}
        </div>
        <h3>${target ? `${fmt(target.quantidade)}u de ${esc(target.nome)}` : 'Produto não encontrado nesta reação'}</h3>
      </div>
      <a class="icon-link" href="${sourceUrl(recipe.fonte)}" target="_blank" rel="noopener noreferrer" title="Abrir YAML da reação no repositório">YAML ↗</a>
    </header>
    <div class="recipe-formula">${formulaLine(recipe, targetId, 99)}</div>
    <dl class="recipe-facts">
      <div><dt>Ingredientes</dt><dd>${recipe.ingredientes
        .map(
          (ingredient) =>
            `<a href="${reagentHref(ingredient.id)}">${esc(ingredient.nome)}</a> <span class="muted">${fmt(ingredient.quantidade)}u${ingredient.catalisador ? ' · catalisador' : ''}</span>`,
        )
        .join('<br>')}</dd></div>
      <div><dt>Rendimento</dt><dd>${fmt(target?.quantidade ?? 0)}u por reação${byproducts.length ? `<br><span class="muted">Também gera: ${byproducts.map((product) => `${esc(product.nome)} ${fmt(product.quantidade)}u`).join(', ')}</span>` : ''}</dd></div>
      <div><dt>Temperatura</dt><dd>${temperature}</dd></div>
      <div><dt>Equipamento</dt><dd>${esc(requirementText)}</dd></div>
      <div><dt>Quantizada</dt><dd>${recipe.quantizada ? 'Sim' : 'Não'}</dd></div>
      <div><dt>Fonte</dt><dd><code class="source-path">${esc(displaySource(recipe.fonte))}</code></dd></div>
    </dl>
    ${
      recipe.efeitos_da_reacao.length
        ? `<div class="recipe-effects"><strong>Efeitos da reação:</strong><ul>${recipe.efeitos_da_reacao.map((effect) => `<li>${esc(effect)}</li>`).join('')}</ul></div>`
        : ''
    }
    ${recipe.impacto != null ? `<p class="fine-print">Impacto declarado: ${esc(recipe.impacto)} · prioridade: ${fmt(recipe.prioridade)}</p>` : ''}
  </article>`;
}

function treeNodeHtml(node: PlanNode, depth: number): string {
  const labels: string[] = [];
  if (node.catalyst) labels.push('<span class="pill pill--catalyst">catalisador</span>');
  if (node.cycle) labels.push('<span class="pill pill--danger">ciclo</span>');
  if (node.depthLimited) labels.push('<span class="pill">limite de níveis</span>');
  if (node.nodeLimited) labels.push('<span class="pill">limite de nós</span>');
  if (node.reagent?.dispensavel) labels.push('<span class="pill pill--dispenser">dispensador</span>');
  const content = `<span class="tree-node__amount">${fmt(node.amount)}u</span>
    <span class="tree-node__info">
      <a href="${reagentHref(node.id)}">${esc(node.nome)}</a>
      <span class="tree-node__meta">${esc(node.id)}${node.recipe ? ` · ${esc(node.recipe.id)}` : ''}</span>
    </span>
    <span class="tree-node__labels">${labels.join('')}</span>`;
  if (node.children.length) {
    return `<li class="tree-item">
      <details class="tree-branch" ${depth < 2 ? 'open' : ''}>
        <summary>${content}</summary>
        <ul class="tree-list">${node.children.map((child) => treeNodeHtml(child, depth + 1)).join('')}</ul>
      </details>
    </li>`;
  }
  return `<li class="tree-item tree-leaf">${content}</li>`;
}

export function productionPlanHtml(plan: ProductionPlan, data: ChemData): string {
  const target = plan.target;
  const byproducts = plan.recipe.produtos.filter((product) => product.id !== target.id);
  const shoppingVolume = totalShoppingVolume(plan);
  const containers = plan.containers;
  return `<div class="plan">
    <div class="plan__stats">
      <div class="stat-mini"><span class="stat-mini__label">Lotes</span><strong>${fmt(plan.runs)}</strong></div>
      <div class="stat-mini"><span class="stat-mini__label">Rendimento</span><strong>${fmt(plan.yieldAmount)} u</strong></div>
      <div class="stat-mini"><span class="stat-mini__label">Volume de entrada</span><strong>${fmt(plan.totalInput)} u</strong></div>
      <div class="stat-mini"><span class="stat-mini__label">Ingredientes-base</span><strong>${plan.shopping.length}</strong></div>
    </div>
    <div class="plan__grid">
      <section class="plan-panel">
        <div class="plan-panel__head">
          <h3>Árvore de produção</h3>
          <span class="muted">${esc(planSummary(plan))}</span>
        </div>
        <p class="fine-print">As ramificações usam a receita principal de cada reagente. Um ciclo é interrompido e aparece na lista de compras.</p>
        <ul class="tree-list tree-list--root">
          <li class="tree-root">
            <div class="tree-node tree-node--root">
              <span class="tree-node__amount">${fmt(plan.targetAmount)}u</span>
              <span class="tree-node__info"><strong>${esc(target.nome)}</strong><span class="tree-node__meta">${esc(plan.recipe.id)}</span></span>
            </div>
            ${
              plan.tree.children.length
                ? `<ul class="tree-list">${plan.tree.children.map((child) => treeNodeHtml(child, 0)).join('')}</ul>`
                : '<p class="muted small">Este reagente é produzido diretamente na reação, sem ingredientes adicionais.</p>'
            }
          </li>
        </ul>
      </section>
      <section class="plan-panel">
        <div class="plan-panel__head">
          <h3>Lista de compras</h3>
          <span class="muted">${fmt(shoppingVolume)} u de folhas</span>
        </div>
        ${
          plan.shopping.length
            ? `<div class="table-wrap"><table class="data-table compact">
                <thead><tr><th>Reagente</th><th>Quantidade</th><th>Origem</th></tr></thead>
                <tbody>
                  ${plan.shopping
                    .map(
                      (item) => `<tr>
                        <td><a href="${reagentHref(item.id)}">${esc(item.nome)}</a><br><span class="muted small">${esc(item.id)}</span></td>
                        <td class="num">${fmt(item.amount)} u</td>
                        <td><span class="source-label source-label--${item.source}">${esc(sourceLabel(item.source))}</span><br><span class="muted small">${esc(item.detail)}</span></td>
                      </tr>`,
                    )
                    .join('')}
                </tbody>
              </table></div>`
            : '<p class="muted">Nenhuma matéria-prima leaf foi necessária.</p>'
        }
        ${
          plan.catalysts.length
            ? `<div class="catalyst-box">
                <h4>Catalisadores necessários</h4>
                <p class="muted small">Eles precisam estar presentes, mas não são consumidos pela reação.</p>
                <ul>${plan.catalysts
                  .map(
                    (item) =>
                      `<li><a href="${reagentHref(item.id)}">${esc(item.nome)}</a> <span class="muted">${fmt(item.amount)} u</span></li>`,
                  )
                  .join('')}</ul>
              </div>`
            : ''
        }
        ${
          byproducts.length
            ? `<div class="byproduct-box">
                <h4>Subprodutos</h4>
                <p>${byproducts
                  .map((product) => `${fmt(product.quantidade * plan.runs)} u de ${esc(product.nome)}`)
                  .join(', ')}</p>
              </div>`
            : ''
        }
      </section>
    </div>
    <section class="plan-panel plan-panel--wide">
      <div class="plan-panel__head">
        <h3>Recipientes</h3>
        <span class="muted">capacidades do repositório</span>
      </div>
      <p class="muted small">Para comportar o maior volume entre o produto desejado e o meio reacional (${fmt(Math.max(plan.targetAmount, plan.totalInput))} u). A divisão em vários recipientes pode ser necessária.</p>
      <div class="container-strip">
        ${
          containers.length
            ? containers
                .map(
                  (container: Container) => `<div class="container-chip">
                    <span class="container-chip__name">${esc(container.nome)}</span>
                    <strong>${fmt(container.capacidade)} u</strong>
                    <span class="muted small">${containersNeeded(plan, container)}</span>
                  </div>`,
                )
                .join('')
            : '<p class="muted">Nenhum recipiente compatível encontrado.</p>'
        }
      </div>
      <p class="fine-print">Cálculo de planejamento, não uma instrução de jogo. A reação pode ter requisitos de mistura ou temperatura que não mudam as proporções.</p>
    </section>
  </div>`;
}

function sourceLabel(source: string): string {
  switch (source) {
    case 'dispenser':
      return 'Dispensador';
    case 'intermediate':
      return 'Intermediário';
    case 'cycle':
      return 'Ciclo';
    default:
      return 'Sem receita';
  }
}

function containersNeeded(plan: ProductionPlan, container: Container): string {
  const volume = Math.max(plan.targetAmount, plan.totalInput);
  if (container.capacidade >= volume) return 'comporta o lote';
  const count = Math.ceil(volume / container.capacidade);
  return `≈ ${fmtInt(count)} recipientes`;
}

export function plannerHtml(options: {
  data: ChemData;
  target: Reagent;
  recipes: Recipe[];
  initialRecipeId?: string;
  targetAmount?: number;
  idPrefix: string;
}): string {
  const { data, target, recipes } = options;
  const defaultRecipe = recipes.find((recipe) => recipe.id === options.initialRecipeId) ?? recipes.find((r) => r.principal) ?? recipes[0];
  const amount = options.targetAmount && options.targetAmount > 0 ? options.targetAmount : defaultRecipe ? recipeYield(defaultRecipe, target.id) * 10 : 30;
  if (!defaultRecipe) return '';
  const initialPlan = buildProductionPlan(data, target, defaultRecipe, amount);
  return `<section class="planner" id="planejador" data-planner>
    <div class="planner__head">
      <div>
        <p class="eyebrow">planejamento</p>
        <h2>Calculadora de lote</h2>
        <p>Escolha a receita e a quantidade final. A árvore e a lista de compras são recalculadas na hora.</p>
      </div>
      <span class="planner__badge">estimativa</span>
    </div>
    <form class="planner-form" data-plan-form>
      <label class="field">
        <span>Receita</span>
        <select name="recipe">
          ${recipes
            .map(
              (recipe) =>
                `<option value="${esc(recipe.id)}" ${recipe.id === defaultRecipe.id ? 'selected' : ''}>${esc(recipe.id)} — ${esc(formulaSummary(recipe, target.id))}</option>`,
            )
            .join('')}
        </select>
      </label>
      <label class="field field--amount">
        <span>Quantidade final</span>
        <div class="input-unit">
          <input name="amount" type="number" min="0.1" step="0.1" value="${amount}" inputmode="decimal" />
          <span>u</span>
        </div>
      </label>
      <button class="button button--primary" type="submit">Calcular</button>
    </form>
    <div class="planner-output" data-plan-output aria-live="polite">
      ${initialPlan ? productionPlanHtml(initialPlan, data) : '<p class="muted">Não foi possível calcular esta receita.</p>'}
    </div>
  </section>`;
}

export function setupPlanner(
  root: HTMLElement,
  data: ChemData,
  target: Reagent,
  recipes: Recipe[],
  onChange?: (recipeId: string, amount: number) => void,
): void {
  const section = root.querySelector<HTMLElement>('[data-planner]');
  if (!section) return;
  const form = section.querySelector<HTMLFormElement>('[data-plan-form]');
  const select = section.querySelector<HTMLSelectElement>('select[name="recipe"]');
  const amountInput = section.querySelector<HTMLInputElement>('input[name="amount"]');
  const output = section.querySelector<HTMLElement>('[data-plan-output]');
  if (!form || !select || !amountInput || !output) return;

  const compute = (event?: Event) => {
    event?.preventDefault();
    const recipe = recipes.find((item) => item.id === select.value) ?? recipes[0];
    const amount = Math.max(0.1, Number(amountInput.value.replace(',', '.')) || 0);
    amountInput.value = String(amount);
    if (!recipe) return;
    const plan = buildProductionPlan(data, target, recipe, amount);
    output.innerHTML = plan ? productionPlanHtml(plan, data) : '<p class="muted">Não foi possível calcular esta receita.</p>';
    onChange?.(recipe.id, amount);
  };

  form.addEventListener('submit', compute);
  select.addEventListener('change', () => compute());
  amountInput.addEventListener('change', () => compute());
}

export function downloadReportLink(): string {
  return `<a class="button button--ghost" href="${assetHref('data/relatorio.md')}" target="_blank" rel="noopener noreferrer">Abrir relatório de extração ↗</a>`;
}
