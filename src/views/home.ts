import type { ChemData } from '../types';
import { dispenserReagents, featuredReagents, reagentHref, producibleReagents } from '../data';
import { appHref } from '../lib/router';
import { fmtInt, esc, capitalizeName, colorCss } from '../lib/text';
import {
  reagentCard,
  reagentSprite,
  searchBoxHtml,
  setupSearchBox,
  formulaLine,
} from '../lib/components';
import { groupColor, groupHref, groupLabel, isHiddenByDefault, orderedGroups } from '../lib/groups';
import type { ViewResult } from './types';

export function homeView(data: ChemData): ViewResult {
  const counts = data.meta.contagens;
  const featured = featuredReagents(data);
  const heroReagent = data.reagentes.find((reagent) => reagent.id === 'Dylovene') ?? featured[0] ?? null;
  const heroRecipe = heroReagent?.receitas.find((recipe) => recipe.principal) ?? heroReagent?.receitas[0] ?? null;
  const dispenser = dispenserReagents(data);
  const groups = orderedGroups(data).filter((group) => !isHiddenByDefault(group));
  const producible = producibleReagents(data).length;
  return {
    title: 'Guia de Chem — Dumont Station',
    html: `
      <section class="hero">
        <div class="hero__bg" aria-hidden="true"></div>
        <div class="container hero__inner">
          <div class="hero__copy">
            <p class="eyebrow"><span class="live-dot"></span> guia não oficial · gerado do fork dumont</p>
            <h1>Química de <span>Dumont</span> sem decorar planilha.</h1>
            <p class="hero__lede">
              Receitas, efeitos, cores e produção em árvore, extraídos diretamente dos YAML do
              repositório <strong>Dumont Station</strong>. Consulte, planeje o lote e leve a lista de compras para a rodada.
            </p>
            <div class="hero__search">
              ${searchBoxHtml({ id: 'busca-hero', variant: 'hero' })}
            </div>
            <div class="hero__quick">
              <a class="quick-link" href="${appHref('/reagentes?grupo=Medicine')}"><span aria-hidden="true">✚</span> Medicina</a>
              <a class="quick-link" href="${appHref('/reagentes?grupo=Toxins')}"><span aria-hidden="true">☣</span> Toxinas</a>
              <a class="quick-link" href="${appHref('/calculadora')}"><span aria-hidden="true">⌬</span> Calculadora</a>
              <a class="quick-link" href="${appHref('/reagentes?dispensaveis=1')}"><span aria-hidden="true">◫</span> Dispensador</a>
            </div>
          </div>
          <div class="hero__visual" aria-label="Visual gerado com sprite do repositório">
            <div class="hero-card" style="--hero-color:${heroReagent?.cor_hex ?? '#54d6a3'}">
              <div class="hero-card__topline"><span>REGISTRO DE AMOSTRA</span><span>${esc(heroReagent?.id.toUpperCase() ?? '—')}</span></div>
              <div class="hero-card__visual">
                ${heroReagent ? reagentSprite(heroReagent, 'lg') : ''}
                <span class="hero-card__ring" aria-hidden="true"></span>
                <span class="hero-card__ring hero-card__ring--two" aria-hidden="true"></span>
              </div>
              <div class="hero-card__name">
                <span class="hero-card__group">${esc(groupLabel(heroReagent?.grupo))}</span>
                <strong>${esc(capitalizeName(heroReagent?.nome ?? 'Sem amostra'))}</strong>
                <span class="hero-card__hex">${esc(heroReagent?.cor_hex ?? 'sem cor')}</span>
              </div>
              ${
                heroRecipe
                  ? `<div class="hero-card__formula">${formulaLine(heroRecipe, heroReagent?.id ?? '', 9)}</div>`
                  : ''
              }
              <div class="hero-card__footer">
                <span>${heroReagent ? `${heroReagent.efeitos.length} efeitos` : 'sem dados'}</span>
                <span>${heroReagent ? `${heroReagent.receitas.length} receita(s)` : ''}</span>
              </div>
            </div>
            <span class="hero-visual__caption">preenchimento de béquer tingido pela cor do protótipo</span>
          </div>
        </div>
      </section>

      <section class="container stats-band" aria-label="Números do guia">
        <div class="stat"><span class="stat__value">${fmtInt(counts.reagentes_total)}</span><span class="stat__label">reagentes lidos</span></div>
        <div class="stat"><span class="stat__value">${fmtInt(counts.reacoes_total)}</span><span class="stat__label">reações de produção</span></div>
        <div class="stat"><span class="stat__value">${fmtInt(counts.reagentes_dispensaveis)}</span><span class="stat__label">no ChemDispenser</span></div>
        <div class="stat"><span class="stat__value">${fmtInt(producible)}</span><span class="stat__label">reagentes produzíveis</span></div>
      </section>

      <div class="container home-grid">
        <section class="home-main">
          <div class="section-head">
            <div>
              <p class="eyebrow">atalhos de bancada</p>
              <h2>Entradas rápidas</h2>
            </div>
            <a class="text-link" href="${appHref('/reagentes')}">Ver todos <span aria-hidden="true">→</span></a>
          </div>
          <div class="shortcut-grid">
            <a class="shortcut-card" href="${appHref('/reagentes')}">
              <span class="shortcut-card__index">01</span>
              <span class="shortcut-card__icon" aria-hidden="true">⌕</span>
              <strong>Busca global</strong>
              <p>Nome em pt-BR, id do protótipo ou ingrediente de uma receita. A busca ignora acentos.</p>
            </a>
            <a class="shortcut-card" href="${appHref('/calculadora')}">
              <span class="shortcut-card__index">02</span>
              <span class="shortcut-card__icon" aria-hidden="true">⌬</span>
              <strong>Planeje um lote</strong>
              <p>Escolha o produto, a receita e a quantidade. Veja árvore, rendimento e recipientes.</p>
            </a>
            <a class="shortcut-card" href="${appHref('/grupos')}">
              <span class="shortcut-card__index">03</span>
              <span class="shortcut-card__icon" aria-hidden="true">▦</span>
              <strong>Guias por grupo</strong>
              <p>Resumos imprimíveis de medicina, toxinas, elementos e das demais categorias.</p>
            </a>
          </div>

          <div class="section-head section-head--spaced">
            <div>
              <p class="eyebrow">medicina</p>
              <h2>Para começar</h2>
            </div>
            <a class="text-link" href="${appHref('/reagentes?grupo=Medicine')}">Abrir medicina <span aria-hidden="true">→</span></a>
          </div>
          <div class="card-grid card-grid--featured">
            ${featured.map((reagent) => reagentCard(reagent)).join('')}
          </div>
        </section>

        <aside class="home-side">
          <section class="side-panel dispenser-panel">
            <div class="side-panel__head">
              <span class="eyebrow">ChemDispenser</span>
              <span class="status-pill"><span class="live-dot"></span> ${fmtInt(dispenser.length)} fontes</span>
            </div>
            <h2>Estoque inicial</h2>
            <p>O dispensador químico abastece frascos via <code>StorageFill</code>. Estes são os reagentes encontrados nos jugs.</p>
            <div class="chip-cloud">
              ${dispenser
                .map(
                  (reagent) =>
                    `<a class="reagent-chip" href="${reagentHref(reagent.id)}" style="--chip-color:${colorCss(reagent.cor_hex)}"><span class="reagent-chip__dot"></span>${esc(reagent.nome)}</a>`,
                )
                .join('')}
            </div>
            <a class="side-panel__link" href="${appHref('/reagentes?dispensaveis=1')}">Filtrar somente dispensáveis <span aria-hidden="true">→</span></a>
          </section>

          <section class="side-panel">
            <div class="side-panel__head"><span class="eyebrow">categorias</span><span class="muted small">${groups.length} visíveis</span></div>
            <h2>Grupos</h2>
            <div class="group-mini-list">
              ${groups
                .slice(0, 8)
                .map((group) => {
                  const count = counts.reagentes_por_grupo[group] ?? 0;
                  return `<a href="${groupHref(group)}" class="group-mini-row" style="--group-color:${groupColor(group)}">
                    <span class="group-dot"></span>
                    <span class="group-mini-row__name">${esc(groupLabel(group))}</span>
                    <span class="group-mini-row__count">${fmtInt(count)}</span>
                  </a>`;
                })
                .join('')}
            </div>
            <a class="side-panel__link" href="${appHref('/grupos')}">Todos os grupos <span aria-hidden="true">→</span></a>
          </section>

          <section class="side-panel note-panel">
            <span class="eyebrow">nota de mesa</span>
            <h2>Feito para consulta rápida</h2>
            <p>${fmtInt(counts.reagentes_nao_abstratos)} reagentes não abstratos. Bebidas, comidas e protótipos abstratos começam ocultos, mas podem ser exibidos nos filtros.</p>
            <a class="button button--ghost button--small" href="${appHref('/sobre')}">Como os dados são gerados</a>
          </section>
        </aside>
      </div>

      <section class="container home-groups" aria-labelledby="home-groups-title">
        <div class="section-head">
          <div><p class="eyebrow">panorama</p><h2 id="home-groups-title">Grupos do guia</h2></div>
          <span class="muted">${groups.map((group) => `${groupLabel(group)} ${fmtInt(counts.reagentes_por_grupo[group] ?? 0)}`).join(' · ')}</span>
        </div>
        <div class="group-strip">
          ${groups
            .map(
              (group) => `<a class="group-tile" href="${groupHref(group)}" style="--group-color:${groupColor(group)}">
                <span class="group-tile__count">${fmtInt(counts.reagentes_por_grupo[group] ?? 0)}</span>
                <span class="group-tile__name">${esc(groupLabel(group))}</span>
                <span class="group-tile__arrow" aria-hidden="true">→</span>
              </a>`,
            )
            .join('')}
        </div>
      </section>
    `,
    mount(main) {
      const hero = main.querySelector<HTMLElement>('.hero__search');
      if (hero) setupSearchBox(hero, data);
      const bigFormula = main.querySelector<HTMLElement>('.hero-card__formula');
      if (bigFormula) bigFormula.setAttribute('aria-label', 'Fórmula da receita principal da amostra');
    },
  };
}
