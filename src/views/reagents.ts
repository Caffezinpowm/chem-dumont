import type { ChemData } from '../types';
import { defaultSortForQuery, filterReagents } from '../lib/search';
import { appHref, replaceRoute } from '../lib/router';
import { fmtInt, esc } from '../lib/text';
import { emptyState, pageHeading, reagentCard } from '../lib/components';
import {
  groupFromSlug,
  groupLabel,
  isHiddenByDefault,
  NO_GROUP_ID,
  orderedGroups,
  ungroupedCount,
} from '../lib/groups';
import type { ViewResult } from './types';

interface ListState {
  query: string;
  group: string;
  includeAbstract: boolean;
  includeConsumables: boolean;
  onlyDispensable: boolean;
  onlyWithRecipe: boolean;
  sort: string;
}

const SORT_OPTIONS = [
  { value: 'relevancia', label: 'Relevância da busca' },
  { value: 'nome', label: 'Nome (A–Z)' },
  { value: 'nome-desc', label: 'Nome (Z–A)' },
  { value: 'grupo', label: 'Grupo' },
  { value: 'receitas', label: 'Mais receitas' },
  { value: 'efeitos', label: 'Mais efeitos' },
  { value: 'dispensaveis', label: 'Dispensáveis primeiro' },
];

function parseState(data: ChemData, query: URLSearchParams): ListState {
  let group = query.get('grupo') ?? '';
  if (group === '__none__' || group === 'sem-grupo') {
    group = NO_GROUP_ID;
  } else if (group) {
    const bySlug = groupFromSlug(data, group);
    if (bySlug) group = bySlug.id;
    else if (!orderedGroups(data).includes(group)) group = '';
  }
  const includeConsumables = query.get('consumiveis') === '1' || isHiddenByDefault(group);
  const queryText = query.get('q') ?? '';
  const requestedSort = query.get('ordem');
  return {
    query: queryText,
    group,
    includeAbstract: query.get('abstratos') === '1',
    includeConsumables,
    onlyDispensable: query.get('dispensaveis') === '1',
    onlyWithRecipe: query.get('receita') === '1',
    sort: SORT_OPTIONS.some((option) => option.value === requestedSort)
      ? requestedSort!
      : defaultSortForQuery(queryText),
  };
}

function stateQuery(state: ListState): string {
  const params = new URLSearchParams();
  if (state.query.trim()) params.set('q', state.query.trim());
  if (state.group) params.set('grupo', state.group);
  if (state.includeAbstract) params.set('abstratos', '1');
  if (state.includeConsumables) params.set('consumiveis', '1');
  if (state.onlyDispensable) params.set('dispensaveis', '1');
  if (state.onlyWithRecipe) params.set('receita', '1');
  if (state.sort !== defaultSortForQuery(state.query)) params.set('ordem', state.sort);
  return params.toString();
}

export function reagentsView(data: ChemData, query: URLSearchParams): ViewResult {
  const initial = parseState(data, query);
  const groups = orderedGroups(data);
  const abstractCount = data.reagentes.filter((reagent) => reagent.abstrato).length;
  const consumableCount = data.reagentes.filter(
    (reagent) => !reagent.abstrato && isHiddenByDefault(reagent.grupo),
  ).length;
  return {
    title: 'Reagentes — Guia de Chem',
    html: `
      <div class="page page--list">
        <div class="container">
          ${pageHeading({
            eyebrow: 'catálogo completo',
            title: 'Reagentes',
            intro: `${fmtInt(data.meta.contagens.reagentes_total)} protótipos lidos do fork. Por padrão, ${fmtInt(abstractCount)} abstratos e ${fmtInt(consumableCount)} bebidas/comidas ficam fora da lista.`,
            actions: `<a class="button button--ghost" href="${appHref('/grupos')}">Ver por grupo</a>`,
          })}
          <section class="filter-panel" aria-label="Filtros de reagentes">
            <div class="filter-panel__search">
              <label class="sr-only" for="filtro-busca">Buscar reagentes</label>
              <span class="search-icon" aria-hidden="true">⌕</span>
              <input id="filtro-busca" type="search" placeholder="Nome em pt-BR, id ou ingrediente…" value="${esc(initial.query)}" autocomplete="off" spellcheck="false" />
              <button class="clear-search" type="button" data-clear-search aria-label="Limpar busca" ${initial.query ? '' : 'hidden'}>×</button>
            </div>
            <div class="filter-panel__row">
              <label class="field field--compact">
                <span>Grupo</span>
                <select id="filtro-grupo">
                  <option value="">Todos os grupos</option>
                  ${groups
                    .map(
                      (group) =>
                        `<option value="${esc(group)}" ${group === initial.group ? 'selected' : ''}>${esc(groupLabel(group))} (${fmtInt(data.meta.contagens.reagentes_por_grupo[group] ?? 0)})</option>`,
                    )
                    .join('')}
                  ${
                    ungroupedCount(data)
                      ? `<option value="${NO_GROUP_ID}" ${initial.group === NO_GROUP_ID ? 'selected' : ''}>Sem grupo (${fmtInt(ungroupedCount(data))})</option>`
                      : ''
                  }
                </select>
              </label>
              <label class="field field--compact">
                <span>Ordenar por</span>
                <select id="filtro-ordem">
                  ${SORT_OPTIONS.map(
                    (option) =>
                      `<option value="${option.value}" ${option.value === initial.sort ? 'selected' : ''}>${option.label}</option>`,
                  ).join('')}
                </select>
              </label>
              <div class="filter-panel__toggles">
                <label class="check"><input type="checkbox" id="filtro-abstratos" ${initial.includeAbstract ? 'checked' : ''} /><span>Incluir abstratos</span></label>
                <label class="check"><input type="checkbox" id="filtro-consumiveis" ${initial.includeConsumables ? 'checked' : ''} /><span>Incluir bebidas e comidas</span></label>
                <label class="check"><input type="checkbox" id="filtro-dispensaveis" ${initial.onlyDispensable ? 'checked' : ''} /><span>Somente dispensáveis</span></label>
                <label class="check"><input type="checkbox" id="filtro-receita" ${initial.onlyWithRecipe ? 'checked' : ''} /><span>Somente com receita</span></label>
              </div>
              <button class="button button--ghost button--small filter-reset" type="button" data-clear-all>Limpar filtros</button>
            </div>
            <p class="filter-panel__note" data-filter-summary></p>
          </section>
          <div class="list-toolbar">
            <p class="list-count" data-list-count aria-live="polite"></p>
            <p class="muted small">Bebidas, comidas e abstratos podem ser liberados nos filtros. “Somente dispensáveis” inclui fontes ocultas do dispensador.</p>
          </div>
          <div class="card-grid card-grid--list" data-reagent-results></div>
        </div>
      </div>
    `,
    mount(main) {
      const queryInput = main.querySelector<HTMLInputElement>('#filtro-busca');
      const groupSelect = main.querySelector<HTMLSelectElement>('#filtro-grupo');
      const sortSelect = main.querySelector<HTMLSelectElement>('#filtro-ordem');
      const abstractInput = main.querySelector<HTMLInputElement>('#filtro-abstratos');
      const consumablesInput = main.querySelector<HTMLInputElement>('#filtro-consumiveis');
      const dispensableInput = main.querySelector<HTMLInputElement>('#filtro-dispensaveis');
      const recipeInput = main.querySelector<HTMLInputElement>('#filtro-receita');
      const results = main.querySelector<HTMLElement>('[data-reagent-results]');
      const count = main.querySelector<HTMLElement>('[data-list-count]');
      const summary = main.querySelector<HTMLElement>('[data-filter-summary]');
      const clearSearch = main.querySelector<HTMLButtonElement>('[data-clear-search]');
      const clearAll = main.querySelector<HTMLButtonElement>('[data-clear-all]');
      if (
        !queryInput ||
        !groupSelect ||
        !sortSelect ||
        !abstractInput ||
        !consumablesInput ||
        !dispensableInput ||
        !recipeInput ||
        !results ||
        !count ||
        !summary
      ) {
        return;
      }
      let state = { ...initial };
      let timer = 0;

      const apply = (options: { updateUrl?: boolean; focusResults?: boolean } = {}) => {
        const hadQuery = state.query.trim().length > 0;
        const hasQuery = queryInput.value.trim().length > 0;
        // Ao começar uma busca, a ordem padrão passa a ser relevância. Se o
        // usuário escolheu outra ordem explicitamente, ela é preservada.
        if (hasQuery && !hadQuery && sortSelect.value === 'nome') sortSelect.value = 'relevancia';
        if (!hasQuery && sortSelect.value === 'relevancia') sortSelect.value = 'nome';
        state = {
          query: queryInput.value,
          group: groupSelect.value,
          includeAbstract: abstractInput.checked,
          includeConsumables: consumablesInput.checked || isHiddenByDefault(groupSelect.value),
          onlyDispensable: dispensableInput.checked,
          onlyWithRecipe: recipeInput.checked,
          sort: sortSelect.value,
        };
        consumablesInput.checked = state.includeConsumables;
        if (clearSearch) clearSearch.hidden = !state.query;
        const filtered = filterReagents(data, state);
        if (options.updateUrl !== false) replaceRoute(`/reagentes${stateQuery(state) ? `?${stateQuery(state)}` : ''}`);
        count.textContent = `${fmtInt(filtered.length)} de ${fmtInt(data.reagentes.length)} reagentes`;
        const active: string[] = [];
        if (state.query.trim()) active.push(`busca “${state.query.trim()}”`);
        if (state.group) active.push(`grupo ${groupLabel(state.group)}`);
        if (state.includeAbstract) active.push('abstratos incluídos');
        if (state.includeConsumables) active.push('bebidas/comidas incluídas');
        if (state.onlyDispensable) {
          active.push(
            state.includeConsumables
              ? 'somente dispensáveis'
              : 'somente dispensáveis (inclui grupos ocultos)',
          );
        }
        if (state.onlyWithRecipe) active.push('somente com receita');
        summary.textContent = active.length ? `Filtros ativos: ${active.join(' · ')}` : 'Sem filtros adicionais.';
        results.innerHTML = filtered.length
          ? filtered.map((reagent) => reagentCard(reagent, { showGroup: !state.group })).join('')
          : emptyState(
              'Nenhum reagente encontrado',
              state.query
                ? 'Tente outro termo, limpe a busca ou libere bebidas/comidas e reagentes abstratos.'
                : 'Esta combinação de filtros não retornou reagentes.',
              '<button class="button button--primary" type="button" data-empty-clear>Limpar filtros</button>',
            );
        results.querySelector<HTMLButtonElement>('[data-empty-clear]')?.addEventListener('click', () => {
          queryInput.value = '';
          groupSelect.value = '';
          abstractInput.checked = false;
          consumablesInput.checked = false;
          dispensableInput.checked = false;
          recipeInput.checked = false;
          sortSelect.value = 'nome';
          apply();
          queryInput.focus();
        });
        if (options.focusResults) count.focus();
      };

      const schedule = () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => apply(), 120);
      };

      queryInput.addEventListener('input', schedule);
      for (const control of [groupSelect, sortSelect, abstractInput, consumablesInput, dispensableInput, recipeInput]) {
        control.addEventListener('change', () => {
          if (groupSelect.value && isHiddenByDefault(groupSelect.value)) consumablesInput.checked = true;
          apply();
        });
      }
      queryInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          window.clearTimeout(timer);
          apply();
        }
        if (event.key === 'Escape') {
          queryInput.value = '';
          apply();
        }
      });
      clearSearch?.addEventListener('click', () => {
        queryInput.value = '';
        apply();
        queryInput.focus();
      });
      clearAll?.addEventListener('click', () => {
        queryInput.value = '';
        groupSelect.value = '';
        abstractInput.checked = false;
        consumablesInput.checked = false;
        dispensableInput.checked = false;
        recipeInput.checked = false;
        sortSelect.value = 'nome';
        apply();
        queryInput.focus();
      });
      apply({ updateUrl: false });
    },
  };
}
