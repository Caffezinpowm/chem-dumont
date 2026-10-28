import type { ChemData, Recipe, Reagent } from '../types';
import { appHref, replaceRoute } from '../lib/router';
import { findReagent, reagentHref } from '../data';
import {
  colorToken,
  effectList,
  emptyState,
  pageHeading,
  plannerHtml,
  recipeDetails,
  reagentSprite,
  setupPlanner,
  thresholdList,
  formulaSummary,
} from '../lib/components';
import {
  capitalizeName,
  colorCss,
  displayOrigin,
  displaySource,
  esc,
  fmt,
  fmtInt,
  hexAlpha,
  sourceUrl,
  shortSource,
} from '../lib/text';
import { favoriteButton } from '../lib/state';
import { groupBadge } from '../lib/components';
import { recipeYield } from '../lib/production';
import { fabricationModalHtml, setupFabrication } from '../lib/fabrication';
import type { ViewResult } from './types';

function translationNote(reagent: Reagent): string {
  if (reagent.traducao === 'pt-BR') return '';
  const englishFields = Object.entries(reagent.traducao_campos)
    .filter(([, source]) => source === 'en-US')
    .map(([field]) => ({ nome: 'nome', descricao: 'descrição', aparencia_fisica: 'aparência', sabor: 'sabor' })[field])
    .filter(Boolean);
  if (!englishFields.length) return '';
  return `<div class="notice notice--lang">
    <strong>Fallback de idioma</strong>
    <p>Sem tradução pt-BR para ${englishFields.join(', ')}. O guia mostra o texto original em inglês em vez de inventar uma tradução.</p>
  </div>`;
}

function abstractNote(reagent: Reagent): string {
  if (!reagent.abstrato) return '';
  return `<div class="notice notice--warning">
    <strong>Protótipo abstrato</strong>
    <p>Este registro serve de base para outros reagentes e é ocultado por padrão na lista e na busca global. Ele continua acessível por URL direta.</p>
  </div>`;
}

function usedInSection(reagent: Reagent): string {
  if (!reagent.usado_em.length) {
    return emptyState('Nenhum uso como ingrediente', 'Nenhuma reação do fork declara este reagente entre os ingredientes.');
  }
  return `<div class="usedin-list">
    ${reagent.usado_em
      .map(
        (use) => `<article class="usedin-card">
          <div class="usedin-card__head">
            <span class="tag">${esc(use.reacao_id)}</span>
            ${use.catalisador ? '<span class="pill pill--catalyst">catalisador</span>' : ''}
            <a class="icon-link" href="${sourceUrl(use.fonte)}" target="_blank" rel="noopener noreferrer">YAML ↗</a>
          </div>
          <p>Produz ${use.produtos
            .map(
              (product) =>
                `<a href="${reagentHref(product.id)}">${esc(product.nome)}</a> <span class="muted">${fmt(product.quantidade)}u</span>`,
            )
            .join(', ')}.</p>
          <p class="fine-print"><code>${esc(displaySource(use.fonte))}</code> · origem ${esc(displayOrigin(use.origem))}</p>
        </article>`,
      )
      .join('')}
  </div>`;
}

function otherRecipes(reagent: Reagent, recipes: Recipe[]): string {
  if (!recipes.length) return '';
  return `<details class="more-recipes">
    <summary>Ver ${recipes.length} ${recipes.length === 1 ? 'receita alternativa' : 'receitas alternativas'}</summary>
    <div class="recipe-stack">${recipes.map((recipe) => recipeDetails(recipe, reagent.id)).join('')}</div>
  </details>`;
}

export function reagentView(data: ChemData, slug: string | undefined, query: URLSearchParams): ViewResult {
  const reagent = findReagent(data, slug);
  if (!reagent) {
    return {
      title: 'Reagente não encontrado — Guia de Chem',
      html: `<div class="container page"><div class="notfound-inline">
        ${emptyState(
          'Reagente não encontrado',
          `Não encontrei um protótipo com o id <code>${esc(slug ?? '')}</code> nos dados extraídos.`,
          `<div class="button-row"><a class="button button--primary" href="${appHref('/reagentes')}">Ver todos os reagentes</a><a class="button button--ghost" href="${appHref('/')}">Voltar ao início</a></div>`,
        )}
      </div></div>`,
    };
  }

  const recipes = reagent.receitas;
  const principal = recipes.find((recipe) => recipe.principal) ?? recipes[0] ?? null;
  const alternatives = principal ? recipes.filter((recipe) => recipe !== principal) : [];
  const requestedRecipe = query.get('receita');
  const selectedRecipe = recipes.find((recipe) => recipe.id === requestedRecipe) ?? principal;
  const requestedQty = Number((query.get('qtd') ?? '').replace(',', '.'));
  const defaultQty =
    requestedQty > 0 && Number.isFinite(requestedQty)
      ? requestedQty
      : selectedRecipe
        ? Math.max(selectedRecipe.rendimento || 0, 30)
        : 30;
  const color = reagent.cor_hex ?? null;
  const style = `--reagent-accent:${colorCss(color)};--reagent-soft:${hexAlpha(color, 0.14)};--reagent-soft-2:${hexAlpha(color, 0.05)}`;
  const translator = reagent.traducao_campos;
  return {
    title: `${capitalizeName(reagent.nome)} (${reagent.id}) — Guia de Chem`,
    html: `<div class="page page--detail" style="${style}">
      <div class="container">
        <nav class="breadcrumb" aria-label="Trilha de navegação">
          <a href="${appHref('/')}">Início</a><span aria-hidden="true">/</span>
          <a href="${appHref('/reagentes')}">Reagentes</a><span aria-hidden="true">/</span>
          <span aria-current="page">${esc(capitalizeName(reagent.nome))}</span>
        </nav>

        <header class="reagent-hero">
          <div class="reagent-hero__visual">${reagentSprite(reagent, 'lg')}</div>
          <div class="reagent-hero__copy">
            <div class="reagent-hero__eyebrow">
              ${groupBadge(reagent.grupo)}
              <code class="reagent-id reagent-id--large">${esc(reagent.id)}</code>
              ${reagent.abstrato ? '<span class="pill pill--muted">abstrato</span>' : ''}
              ${reagent.dispensavel ? '<span class="pill pill--dispenser">no dispensador</span>' : ''}
              ${reagent.traducao !== 'pt-BR' ? `<span class="pill pill--lang">${reagent.traducao === 'en-US' ? 'texto em inglês' : 'tradução parcial'}</span>` : ''}
            </div>
            <div class="reagent-hero__title-row">
              <h1>${esc(capitalizeName(reagent.nome))}</h1>
              ${favoriteButton(reagent.id)}
            </div>
            <p class="reagent-hero__desc">${esc(reagent.descricao || 'Sem descrição no repositório.')}</p>
            <div class="reagent-hero__facts">
              <div class="fact"><span class="fact__label">Cor</span>${colorToken(reagent)}</div>
              <div class="fact"><span class="fact__label">Origem</span><span>${esc(displayOrigin(reagent.origem))}</span></div>
              <div class="fact"><span class="fact__label">Receitas</span><span>${fmtInt(recipes.length)} ${recipes.length === 1 ? 'rota' : 'rotas'}</span></div>
              <div class="fact"><span class="fact__label">Usado em</span><span>${fmtInt(reagent.usado_em.length)} ${reagent.usado_em.length === 1 ? 'reação' : 'reações'}</span></div>
            </div>
            <div class="button-row">
              ${principal ? '<button class="button button--primary button--small" type="button" data-craft-open>Fabricar</button>' : ''}
              <button class="button button--ghost button--small" type="button" data-copy-link>Copiar link</button>
              <a class="button button--ghost button--small" href="${sourceUrl(reagent.fonte)}" target="_blank" rel="noopener noreferrer">Ver YAML ↗</a>
              ${selectedRecipe ? `<a class="button button--ghost button--small" href="#producao">Planilhar lote</a>` : ''}
            </div>
          </div>
          <div class="reagent-hero__aside" aria-label="Resumo">
            <span class="eyebrow">resumo de bancada</span>
            ${
              principal
                ? `<div class="hero-formula">
                    <span class="muted small">Receita principal</span>
                    <strong>${esc(formulaSummary(principal, reagent.id))}</strong>
                    <span class="muted small">${esc(principal.id)}</span>
                  </div>`
                : `<p class="muted">Sem receita mapeada.</p>`
            }
            ${
              reagent.limiares.length
                ? `<div class="hero-threshold">
                    <span class="muted small">Limiares extraídos</span>
                    ${reagent.limiares
                      .slice(0, 3)
                      .map(
                        (threshold) =>
                          `<span class="mini-threshold${threshold.provavel_overdose ? ' is-overdose' : ''}">${threshold.minimo != null ? `≥ ${fmt(threshold.minimo)}u` : threshold.maximo != null ? `≤ ${fmt(threshold.maximo)}u` : '—'}</span>`,
                      )
                      .join('')}
                  </div>`
                : ''
            }
            <p class="fine-print">Prefixo tintado: sprite de béquer do repositório. Não representa a cor de pílulas.</p>
          </div>
        </header>

        ${abstractNote(reagent)}
        ${translationNote(reagent)}

        <nav class="section-nav" aria-label="Nesta página">
          <a href="#efeitos">Efeitos</a>
          <a href="#limiares">Limiares</a>
          ${recipes.length ? '<a href="#producao">Produção</a>' : ''}
          <a href="#usos">Usado em</a>
          <a href="#metadados">Metadados</a>
        </nav>

        <div class="detail-layout">
          <div class="detail-main">
            <section class="content-section" id="efeitos">
              <div class="section-head">
                <div><p class="eyebrow">metabolismo</p><h2>Efeitos</h2></div>
                <span class="muted">${fmtInt(reagent.efeitos.length + reagent.efeitos_planta.length)} ${reagent.efeitos.length + reagent.efeitos_planta.length === 1 ? 'entrada' : 'entradas'}</span>
              </div>
              ${effectList(reagent)}
            </section>

            <section class="content-section" id="producao">
              <div class="section-head">
                <div><p class="eyebrow">síntese</p><h2>Produção</h2></div>
                ${recipes.length > 1 ? `<span class="muted">${fmtInt(recipes.length)} rotas encontradas</span>` : ''}
              </div>
              ${
                principal
                  ? `${recipeDetails(principal, reagent.id)}
                    ${plannerHtml({
                      data,
                      target: reagent,
                      recipes,
                      initialRecipeId: selectedRecipe?.id,
                      targetAmount: defaultQty,
                      idPrefix: reagent.id,
                    })}
                    ${otherRecipes(reagent, alternatives)}`
                  : `${emptyState(
                      'Sem receita de produção',
                      reagent.dispensavel
                        ? 'Este reagente não tem reação de produção mapeada, mas aparece no conteúdo dos jugs do ChemDispenser.'
                        : 'Nenhuma reação do fork produz este reagente. A obtenção pode depender de outro sistema ou de conteúdo não prototipado.',
                    )}`
              }
            </section>

            <section class="content-section" id="usos">
              <div class="section-head">
                <div><p class="eyebrow">dependências</p><h2>Usado em</h2></div>
                <span class="muted">${fmtInt(reagent.usado_em.length)} ${reagent.usado_em.length === 1 ? 'reação' : 'reações'}</span>
              </div>
              ${usedInSection(reagent)}
            </section>
          </div>

          <aside class="detail-side">
            <section class="content-section" id="limiares">
              <div class="section-head"><div><p class="eyebrow">concentração</p><h2>Limiares</h2></div></div>
              ${thresholdList(reagent)}
            </section>

            <section class="content-section">
              <div class="section-head"><div><p class="eyebrow">ficha</p><h2>Aparência e sabor</h2></div></div>
              <dl class="meta-list">
                <div><dt>Aparência física</dt><dd>${esc(reagent.descricao_fisica ?? 'Não declarada')}</dd></div>
                <div><dt>Sabor</dt><dd>${esc(reagent.sabor ?? 'Não declarado')}</dd></div>
                <div><dt>Grupo</dt><dd>${groupBadge(reagent.grupo)}</dd></div>
                <div><dt>Abstrato</dt><dd>${reagent.abstrato ? 'Sim' : 'Não'}</dd></div>
                <div><dt>Dispensador</dt><dd>${reagent.dispensavel ? esc(reagent.dispensavel_via ?? 'Sim') : 'Não'}</dd></div>
              </dl>
            </section>

            <section class="content-section" id="metadados">
              <div class="section-head"><div><p class="eyebrow">procedência</p><h2>Metadados</h2></div></div>
              <dl class="meta-list">
                <div><dt>ID</dt><dd><code>${esc(reagent.id)}</code></dd></div>
                <div><dt>Origem</dt><dd>${esc(displayOrigin(reagent.origem))}</dd></div>
                <div><dt>Arquivo</dt><dd><a href="${sourceUrl(reagent.fonte)}" target="_blank" rel="noopener noreferrer"><code>${esc(shortSource(displaySource(reagent.fonte)))}</code></a></dd></div>
                <div><dt>Locale do nome</dt><dd>${esc(translator.nome)}${
                  reagent.chaves_locale.nome ? `<br><code class="small">${esc(reagent.chaves_locale.nome)}</code>` : ''
                }</dd></div>
                <div><dt>Locale da descrição</dt><dd>${esc(translator.descricao)}${
                  reagent.chaves_locale.descricao ? `<br><code class="small">${esc(reagent.chaves_locale.descricao)}</code>` : ''
                }</dd></div>
              </dl>
              <p class="fine-print">Os nomes, cores, receitas e efeitos vêm dos YAML. A tradução manual da interface não altera os fatos extraídos.</p>
            </section>
          </aside>
        </div>
      </div>
      ${fabricationModalHtml(reagent, recipes, selectedRecipe?.id, defaultQty)}
    </div>`,
    mount(main) {
      if (selectedRecipe) {
        setupPlanner(main, data, reagent, recipes, (recipeId, amount) => {
          replaceRoute(
            `/reagentes/${encodeURIComponent(reagent.id.toLowerCase())}?receita=${encodeURIComponent(recipeId)}&qtd=${encodeURIComponent(String(amount))}`,
          );
        });
        setupFabrication(main, data, reagent, recipes, {
          initialRecipeId: selectedRecipe.id,
          initialAmount: defaultQty,
        });
      }
    },
  };
}
