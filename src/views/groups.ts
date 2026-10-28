import type { ChemData, Reagent } from '../types';
import { appHref, replaceRoute } from '../lib/router';
import { reagentHref } from '../data';
import {
  colorToken,
  emptyState,
  formulaSummary,
  pageHeading,
  reagentCard,
} from '../lib/components';
import {
  groupFromSlug,
  groupHref,
  groupInfo,
  groupLabel,
  groupReagents,
  isHiddenByDefault,
  NO_GROUP_ID,
  orderedGroups,
  ungroupedCount,
} from '../lib/groups';
import { esc, fmtDate, fmtInt } from '../lib/text';
import { defaultSortForQuery, filterReagents } from '../lib/search';
import type { ViewResult } from './types';

const SORT_OPTIONS = [
  { value: 'relevancia', label: 'Relevância da busca' },
  { value: 'nome', label: 'Nome (A–Z)' },
  { value: 'nome-desc', label: 'Nome (Z–A)' },
  { value: 'receitas', label: 'Mais receitas' },
  { value: 'efeitos', label: 'Mais efeitos' },
];

function nonAbstractCount(data: ChemData, groupId: string): number {
  return groupReagents(data, groupId).filter((reagent) => !reagent.abstrato).length;
}

function principalRecipe(reagent: Reagent) {
  return reagent.receitas.find((recipe) => recipe.principal) ?? reagent.receitas[0] ?? null;
}

function effectsSummary(reagent: Reagent, limit = 2): string {
  const descriptions = reagent.efeitos.map((effect) => effect.descricao).filter(Boolean);
  if (!descriptions.length) {
    const thresholds = reagent.limiares.flatMap((threshold) => threshold.efeitos);
    if (!thresholds.length) return 'Sem efeitos metabólicos extraídos.';
    return thresholds.slice(0, limit).join('; ');
  }
  const shown = descriptions.slice(0, limit).join('; ');
  const extra = descriptions.length - limit;
  return `${shown}${extra > 0 ? `; +${extra}` : ''}.`;
}

function thresholdSummary(reagent: Reagent): string {
  if (!reagent.limiares.length) return '—';
  return reagent.limiares
    .slice(0, 2)
    .map((threshold) => {
      const range =
        threshold.minimo != null && threshold.maximo != null
          ? `${threshold.minimo}–${threshold.maximo}u`
          : threshold.minimo != null
            ? `≥ ${threshold.minimo}u`
            : threshold.maximo != null
              ? `≤ ${threshold.maximo}u`
              : 'sem valor';
      return `${range}: ${threshold.efeitos.slice(0, 1).join('') || 'sem efeito declarado'}${threshold.provavel_overdose ? ' (possível overdose)' : ''}`;
    })
    .join(' · ');
}

function guideTable(reagents: Reagent[], emptyMessage: string): string {
  if (!reagents.length) {
    return `<p class="muted">${esc(emptyMessage)}</p>`;
  }
  return `<div class="table-wrap">
    <table class="guide-table">
      <thead>
        <tr>
          <th scope="col">Reagente</th>
          <th scope="col">Cor</th>
          <th scope="col">Receita principal</th>
          <th scope="col">Efeitos</th>
          <th scope="col">Limiares</th>
        </tr>
      </thead>
      <tbody>
        ${reagents
          .map((reagent) => {
            const recipe = principalRecipe(reagent);
            return `<tr>
              <td>
                <a class="guide-table__name" href="${reagentHref(reagent.id)}">${esc(reagent.nome)}</a>
                <span class="guide-table__id">${esc(reagent.id)}</span>
                ${reagent.abstrato ? '<span class="pill pill--muted">abstrato</span>' : ''}
              </td>
              <td class="guide-table__color">${colorToken(reagent)}</td>
              <td>${recipe ? esc(formulaSummary(recipe, reagent.id)) : '<span class="muted">sem receita mapeada</span>'}</td>
              <td>${esc(effectsSummary(reagent, 3))}</td>
              <td>${esc(thresholdSummary(reagent))}</td>
            </tr>`;
          })
          .join('')}
      </tbody>
    </table>
  </div>`;
}

export function groupsView(data: ChemData, query: URLSearchParams): ViewResult {
  const showHidden = query.get('ocultos') === '1';
  const groups = orderedGroups(data);
  const visible = groups.filter((group) => !isHiddenByDefault(group));
  const hidden = groups.filter((group) => isHiddenByDefault(group));
  const shown = showHidden ? groups : visible;
  const groupsWithRecipes = data.reagentes.filter(
    (reagent) => !reagent.abstrato && reagent.receitas.length > 0,
  ).length;
  const ungrouped = ungroupedCount(data);
  return {
    title: 'Grupos — Guia de Chem',
    html: `<div class="page page--groups">
      <div class="container">
        ${pageHeading({
          eyebrow: 'panorama da química',
          title: 'Grupos',
          intro: 'Cada grupo reúne os protótipos do fork. As páginas trazem uma tabela de consulta e um guia compacto pronto para imprimir ou levar para a rodada.',
          actions: `<a class="button button--ghost" href="${appHref('/reagentes')}">Abrir catálogo</a>`,
        })}

        <div class="group-overview">
          <div class="group-overview__stat"><span>${fmtInt(data.meta.contagens.reagentes_total)}</span><small>protótipos lidos</small></div>
          <div class="group-overview__stat"><span>${fmtInt(groupsWithRecipes)}</span><small>com receita mapeada</small></div>
          <div class="group-overview__stat"><span>${fmtInt(groups.length)}</span><small>grupos declarados</small></div>
          <div class="group-overview__stat"><span>${fmtInt(ungrouped)}</span><small>sem grupo no YAML</small></div>
        </div>

        <div class="section-head">
          <div>
            <p class="eyebrow">categorias do repositório</p>
            <h2>Escolha um grupo</h2>
          </div>
          <div class="section-head__actions">
            <span class="muted small">${fmtInt(shown.length)} grupos ${showHidden ? 'exibidos' : 'visíveis'}</span>
            ${
              hidden.length
                ? `<a class="button button--ghost button--small" href="${showHidden ? appHref('/grupos') : appHref('/grupos?ocultos=1')}">
                    ${showHidden ? 'Ocultar bebidas e comidas' : `Mostrar bebidas e comidas (${hidden.length})`}
                  </a>`
                : ''
            }
          </div>
        </div>

        <div class="group-index">
          ${shown
            .map((group) => {
              const info = groupInfo(group);
              const count = nonAbstractCount(data, group);
              const rawCount = data.meta.contagens.reagentes_por_grupo[group] ?? groupReagents(data, group).length;
              const samples = groupReagents(data, group)
                .filter((reagent) => !reagent.abstrato)
                .slice(0, 3);
              return `<a class="group-card${isHiddenByDefault(group) ? ' group-card--hidden' : ''}" href="${groupHref(group)}" style="--group-color:${info?.color ?? '#a0aaa3'}">
                <span class="group-card__top">
                  <span class="group-dot" aria-hidden="true"></span>
                  <span class="group-card__eyebrow">${esc(group)}</span>
                  ${isHiddenByDefault(group) ? '<span class="pill pill--food">oculto por padrão</span>' : ''}
                </span>
                <strong class="group-card__title">${esc(groupLabel(group))}</strong>
                <span class="group-card__desc">${esc(info?.description ?? '')}</span>
                <span class="group-card__samples">${samples.map((reagent) => esc(reagent.nome)).join(' · ') || 'Sem amostras'}</span>
                <span class="group-card__footer">
                  <span><strong>${fmtInt(count)}</strong> não abstratos</span>
                  <span>${fmtInt(rawCount)} registros</span>
                  <span class="group-card__arrow" aria-hidden="true">→</span>
                </span>
              </a>`;
            })
            .join('')}
          ${
            ungrouped
              ? `<a class="group-card group-card--none" href="${groupHref(NO_GROUP_ID)}" style="--group-color:#a0aaa3">
                  <span class="group-card__top">
                    <span class="group-dot" aria-hidden="true"></span>
                    <span class="group-card__eyebrow">sem protótipo de grupo</span>
                  </span>
                  <strong class="group-card__title">Sem grupo</strong>
                  <span class="group-card__desc">Reagentes que não declaram <code>group</code> no YAML. Continuam no catálogo e na busca.</span>
                  <span class="group-card__samples">${groupReagents(data, NO_GROUP_ID)
                    .filter((reagent) => !reagent.abstrato)
                    .slice(0, 3)
                    .map((reagent) => esc(reagent.nome))
                    .join(' · ')}</span>
                  <span class="group-card__footer">
                    <span><strong>${fmtInt(ungrouped)}</strong> registros</span>
                    <span class="group-card__arrow" aria-hidden="true">→</span>
                  </span>
                </a>`
              : ''
          }
        </div>

        <div class="notice notice--info group-index__note">
          <strong>Por que alguns grupos começam ocultos?</strong>
          <p>Bebidas alcoólicas, bebidas não alcoólicas e comidas têm centenas de registros e não são o foco do guia de bancada. Elas continuam acessíveis por URL direta, pela busca completa e por este botão. Reagentes abstratos são ocultados separadamente em cada lista.</p>
        </div>
      </div>
    </div>`,
  };
}

export function groupView(
  data: ChemData,
  slug: string | undefined,
  query: URLSearchParams,
): ViewResult {
  const group = slug ? groupFromSlug(data, slug) : null;
  if (!group) {
    return {
      title: 'Grupo não encontrado — Guia de Chem',
      html: `<div class="container page">
        ${emptyState(
          'Grupo não encontrado',
          `Não encontrei um grupo com o slug <code>${esc(slug ?? '')}</code>.`,
          `<div class="button-row"><a class="button button--primary" href="${appHref('/grupos')}">Ver grupos</a><a class="button button--ghost" href="${appHref('/reagentes')}">Ver reagentes</a></div>`,
        )}
      </div>`,
    };
  }

  const info = groupInfo(group.id);
  const all = groupReagents(data, group.id);
  const initialQuery = query.get('q') ?? '';
  const includeAbstract = query.get('abstratos') === '1';
  const requestedSort = query.get('ordem');
  const sort = SORT_OPTIONS.some((option) => option.value === requestedSort)
    ? requestedSort!
    : defaultSortForQuery(initialQuery);
  const initial = {
    query: initialQuery,
    group: group.id,
    includeAbstract,
    includeConsumables: true,
    onlyDispensable: false,
    onlyWithRecipe: false,
    sort,
  };
  const filtered = filterReagents(data, initial);
  const total = all.length;
  const visibleCount = all.filter((reagent) => !reagent.abstrato).length;
  const abstractCount = total - visibleCount;
  const producible = all.filter((reagent) => reagent.receitas.length > 0).length;
  const hiddenNote = isHiddenByDefault(group.id)
    ? `<div class="notice notice--info"><strong>Grupo oculto nas listas gerais</strong><p>Este grupo não aparece por padrão no catálogo, na busca global nem no índice de grupos. Você chegou aqui por um link direto; tudo continua consultável e imprimível.</p></div>`
    : '';
  return {
    title: `${group.label} — Guia de Chem`,
    html: `<div class="page page--group" style="--group-color:${info?.color ?? '#a0aaa3'}">
      <div class="container">
        <nav class="breadcrumb" aria-label="Trilha de navegação">
          <a href="${appHref('/')}">Início</a><span aria-hidden="true">/</span>
          <a href="${appHref('/grupos')}">Grupos</a><span aria-hidden="true">/</span>
          <span aria-current="page">${esc(group.label)}</span>
        </nav>

        <header class="group-hero">
          <div class="group-hero__copy">
            <p class="eyebrow"><span class="group-dot" aria-hidden="true"></span> ${esc(group.id)}</p>
            <h1>${esc(group.label)}</h1>
            <p class="group-hero__desc">${esc(info?.description ?? '')}</p>
            <div class="group-hero__stats">
              <span><strong>${fmtInt(total)}</strong> registros</span>
              <span><strong>${fmtInt(visibleCount)}</strong> não abstratos</span>
              <span><strong>${fmtInt(producible)}</strong> com receita</span>
            </div>
            <div class="button-row">
              <button class="button button--primary button--small" type="button" data-print>Imprimir guia do grupo</button>
              <button class="button button--ghost button--small" type="button" data-copy-link>Copiar link</button>
              <a class="button button--ghost button--small" href="${appHref(`/reagentes?grupo=${encodeURIComponent(group.id)}&consumiveis=1`)}">Abrir no catálogo</a>
            </div>
          </div>
          <div class="group-hero__aside">
            <span class="group-hero__index">${String(orderedGroups(data).indexOf(group.id) + 1).padStart(2, '0')}</span>
            <span class="group-hero__mark" aria-hidden="true">${esc((group.label || '?').slice(0, 1))}</span>
            <p>Guia de consulta gerado a partir dos YAML do fork.</p>
          </div>
        </header>

        ${hiddenNote}

        <nav class="group-switcher" aria-label="Outros grupos">
          ${orderedGroups(data)
            .filter((other) => !isHiddenByDefault(other) || other === group.id)
            .map(
              (other) =>
                `<a href="${groupHref(other)}" class="${other === group.id ? 'is-active' : ''}" ${other === group.id ? 'aria-current="page"' : ''}>${esc(groupLabel(other))}</a>`,
            )
            .join('')}
          ${group.id === NO_GROUP_ID ? `<a href="${groupHref(NO_GROUP_ID)}" class="is-active" aria-current="page">Sem grupo</a>` : ''}
        </nav>

        <section class="filter-panel filter-panel--group" aria-label="Filtros do grupo">
          <div class="filter-panel__search">
            <label class="sr-only" for="grupo-busca">Buscar neste grupo</label>
            <span class="search-icon" aria-hidden="true">⌕</span>
            <input id="grupo-busca" type="search" placeholder="Nome, id ou ingrediente neste grupo…" value="${esc(initialQuery)}" autocomplete="off" spellcheck="false" />
            <button class="clear-search" type="button" data-group-clear aria-label="Limpar busca" ${initialQuery ? '' : 'hidden'}>×</button>
          </div>
          <div class="filter-panel__row">
            <label class="field field--compact">
              <span>Ordenar</span>
              <select data-group-sort>
                ${SORT_OPTIONS.map(
                  (option) =>
                    `<option value="${option.value}" ${option.value === initial.sort ? 'selected' : ''}>${option.label}</option>`,
                ).join('')}
              </select>
            </label>
            <div class="filter-panel__toggles">
              <label class="check"><input type="checkbox" data-group-abstract ${includeAbstract ? 'checked' : ''} /><span>Incluir abstratos (${fmtInt(abstractCount)})</span></label>
            </div>
            <button class="button button--ghost button--small filter-reset" type="button" data-group-clear-all>Limpar filtros</button>
          </div>
          <p class="filter-panel__note" data-group-summary></p>
        </section>

        <div class="list-toolbar">
          <p class="list-count" data-group-count aria-live="polite"></p>
          <p class="muted small">A tabela abaixo é a versão de impressão do grupo.</p>
        </div>

        <div class="card-grid card-grid--list" data-group-cards></div>

        <section class="print-guide" id="guia-de-grupo" aria-labelledby="guia-title">
          <header class="print-guide__head">
            <div>
              <p class="eyebrow screen-only">versão de bolso</p>
              <h2 id="guia-title">Guia rápido de ${esc(group.label)}</h2>
              <p class="muted">Receita principal, efeitos e limiares em uma tabela. Use o botão de impressão para gerar uma folha limpa.</p>
            </div>
            <button class="button button--ghost button--small screen-only" type="button" data-print>Imprimir</button>
          </header>
          <div class="print-only print-guide__print-head">
            <strong>Guia de Chem · Dumont Station</strong>
            <span>${esc(group.label)} · ${fmtDate(data.meta.gerado_em)}</span>
          </div>
          <div data-group-guide>${guideTable(filtered, 'Nenhum reagente corresponde aos filtros atuais.')}</div>
          <p class="print-guide__foot fine-print">
            Dados extraídos de <code>${esc(data.meta.repositorio)}</code>. Guia não oficial; o jogo é a fonte da verdade.
          </p>
        </section>
      </div>
    </div>`,
    mount(main) {
      const search = main.querySelector<HTMLInputElement>('#grupo-busca');
      const sortSelect = main.querySelector<HTMLSelectElement>('[data-group-sort]');
      const abstract = main.querySelector<HTMLInputElement>('[data-group-abstract]');
      const cards = main.querySelector<HTMLElement>('[data-group-cards]');
      const guide = main.querySelector<HTMLElement>('[data-group-guide]');
      const count = main.querySelector<HTMLElement>('[data-group-count]');
      const summary = main.querySelector<HTMLElement>('[data-group-summary]');
      const clear = main.querySelector<HTMLButtonElement>('[data-group-clear]');
      const clearAll = main.querySelector<HTMLButtonElement>('[data-group-clear-all]');
      if (
        !search ||
        !sortSelect ||
        !abstract ||
        !cards ||
        !guide ||
        !count ||
        !summary ||
        !clear ||
        !clearAll
      ) {
        return;
      }
      let timer = 0;
      let previousQuery = search.value;

      const apply = (options: { updateUrl?: boolean } = {}) => {
        const hadQuery = previousQuery.trim().length > 0;
        const hasQuery = search.value.trim().length > 0;
        if (hasQuery && !hadQuery && sortSelect.value === 'nome') sortSelect.value = 'relevancia';
        if (!hasQuery && sortSelect.value === 'relevancia') sortSelect.value = 'nome';
        previousQuery = search.value;
        const state = {
          query: search.value,
          group: group.id,
          includeAbstract: abstract.checked,
          includeConsumables: true,
          onlyDispensable: false,
          onlyWithRecipe: false,
          sort: sortSelect.value,
        };
        const results = filterReagents(data, state);
        clear.hidden = !state.query;
        cards.innerHTML = results.length
          ? results.map((reagent) => reagentCard(reagent, { showGroup: false })).join('')
          : emptyState(
              'Nenhum reagente neste recorte',
              'Tente outro termo ou inclua os reagentes abstratos.',
              '<button class="button button--primary" type="button" data-group-empty-clear>Limpar filtros</button>',
            );
        guide.innerHTML = guideTable(results, 'Nenhum reagente corresponde aos filtros atuais.');
        count.textContent = `${fmtInt(results.length)} de ${fmtInt(total)} registros · ${fmtInt(results.filter((reagent) => reagent.receitas.length > 0).length)} com receita`;
        const active: string[] = [];
        if (state.query.trim()) active.push(`busca “${state.query.trim()}”`);
        if (state.includeAbstract) active.push('abstratos incluídos');
        if (state.sort !== defaultSortForQuery(state.query)) {
          active.push(`ordem ${SORT_OPTIONS.find((option) => option.value === state.sort)?.label ?? state.sort}`);
        }
        summary.textContent = active.length ? `Filtros ativos: ${active.join(' · ')}` : 'Exibindo os reagentes não abstratos do grupo.';
        if (options.updateUrl !== false) {
          const params = new URLSearchParams();
          if (state.query.trim()) params.set('q', state.query.trim());
          if (state.includeAbstract) params.set('abstratos', '1');
          if (state.sort !== defaultSortForQuery(state.query)) params.set('ordem', state.sort);
          replaceRoute(`/grupos/${encodeURIComponent(slug ?? '')}${params.toString() ? `?${params}` : ''}`);
        }
        cards.querySelector<HTMLButtonElement>('[data-group-empty-clear]')?.addEventListener('click', reset);
      };

      const reset = () => {
        search.value = '';
        abstract.checked = false;
        sortSelect.value = 'nome';
        apply();
        search.focus();
      };

      const schedule = () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => apply(), 120);
      };

      search.addEventListener('input', schedule);
      search.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          window.clearTimeout(timer);
          apply();
        }
        if (event.key === 'Escape') {
          search.value = '';
          apply();
        }
      });
      sortSelect.addEventListener('change', () => apply());
      abstract.addEventListener('change', () => apply());
      clear.addEventListener('click', () => {
        search.value = '';
        apply();
        search.focus();
      });
      clearAll.addEventListener('click', reset);
      apply({ updateUrl: false });
    },
  };
}


