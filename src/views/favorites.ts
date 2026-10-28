import type { ChemData } from '../types';
import { appHref } from '../lib/router';
import { reagentCard, emptyState, pageHeading } from '../lib/components';
import { getFavorites } from '../lib/state';
import { groupLabel } from '../lib/groups';
import { fmtInt } from '../lib/text';
import type { ViewResult } from './types';

export function favoritesView(data: ChemData): ViewResult {
  const ids = getFavorites();
  const byId = new Map(data.reagentes.map((reagent) => [reagent.id, reagent]));
  const favorites = ids
    .map((id) => byId.get(id))
    .filter((reagent) => !!reagent)
    .sort(
      (a, b) =>
        groupLabel(a.grupo).localeCompare(groupLabel(b.grupo), 'pt-BR') ||
        a.nome.localeCompare(b.nome, 'pt-BR'),
    );
  const missing = ids.length - favorites.length;
  const hasFavorites = favorites.length > 0;
  return {
    title: 'Favoritos — Guia de Chem',
    html: `<div class="page page--favorites">
      <div class="container">
        ${pageHeading({
          eyebrow: 'sua lista de bancada',
          title: 'Favoritos',
          intro: hasFavorites
            ? `${fmtInt(favorites.length)} ${favorites.length === 1 ? 'reagente salvo' : 'reagentes salvos'} neste navegador. A lista fica só no seu dispositivo, sem conta e sem servidor.`
            : 'Marque reagentes com a estrela para montar uma lista de consulta rápida. Tudo fica salvo apenas neste navegador.',
          actions: hasFavorites
            ? `<button class="button button--ghost" type="button" data-print>Imprimir lista</button><button class="button button--ghost" type="button" data-copy-link>Copiar link</button>`
            : '',
        })}

        ${
          hasFavorites
            ? `<div class="favorites-toolbar">
                <p class="muted small">Ordenados por grupo e nome. ${missing > 0 ? `${missing} ${missing === 1 ? 'id salvo não existe mais' : 'ids salvos não existem mais'} no conjunto de dados atual.` : 'Todos os ids salvos existem no conjunto atual.'}</p>
                <button class="button button--danger-ghost button--small" type="button" data-clear-favorites>Limpar todos os favoritos</button>
              </div>
              <div class="card-grid card-grid--list">
                ${favorites.map((reagent) => reagentCard(reagent)).join('')}
              </div>`
            : emptyState(
                'Sua bancada ainda está vazia',
                'Use o botão de estrela nos cartões, na ficha de um reagente ou na calculadora. A lista aparece aqui e sobrevive ao recarregar a página.',
                `<div class="button-row"><a class="button button--primary" href="${appHref('/reagentes')}">Explorar reagentes</a><a class="button button--ghost" href="${appHref('/grupos')}">Ver grupos</a></div>`,
              )
        }

        <section class="favorites-help">
          <div class="favorites-help__icon" aria-hidden="true">★</div>
          <div>
            <h2>Como funciona</h2>
            <p>Os favoritos usam <code>localStorage</code> com a chave <code>chem:favoritos</code>. Limpar os dados do navegador também apaga a lista. Nada é enviado para fora do site.</p>
          </div>
        </section>
      </div>
    </div>`,
  };
}
