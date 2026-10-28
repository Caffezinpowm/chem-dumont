import type { ChemData, Recipe, Reagent } from '../types';
import {
  buildCraftProcedure,
  craftSourceLabel,
  type CraftItem,
  type CraftProcedure,
  type CraftStep,
} from './crafting';
import { formulaSummary, reagentSprite } from './components';
import { BASE_URL } from './router';
import { currentTheme } from './state';
import { colorCss, esc, fmt, fmtDose, fmtInt } from './text';

interface DocumentPictureInPictureApi {
  requestWindow(options?: {
    width?: number;
    height?: number;
    disallowReturnToOpener?: boolean;
    preferInitialWindowPlacement?: boolean;
  }): Promise<Window>;
  window: Window | null;
}

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPictureApi;
  }
}

type CraftMode = 'pip' | 'dock';

interface CraftSession {
  procedure: CraftProcedure;
  stepIndex: number;
  completed: boolean;
  mode: CraftMode;
  root: HTMLElement | null;
  pipWindow: Window | null;
  themeObserver: MutationObserver | null;
  notice: string | null;
  noticeAtStep: number | null;
  closing: boolean;
}

interface FabricationOptions {
  initialRecipeId?: string;
  initialAmount?: number;
}

/** Quantidade inicial do roteiro de fabricação quando não há quantidade no link. */
export const DEFAULT_CRAFT_AMOUNT = 100;

let activeSession: CraftSession | null = null;
let requestToken = 0;

function supportsDocumentPip(): boolean {
  return (
    window.isSecureContext &&
    typeof window.documentPictureInPicture?.requestWindow === 'function'
  );
}

function cleanAmount(value: number): number {
  return Math.round(value * 100) / 100;
}

function sourceTag(source: CraftItem['source']): string {
  const label = craftSourceLabel(source);
  return label ? `<span class="craft-source craft-source--${source}">${esc(label)}</span>` : '';
}

function itemHtml(item: CraftItem): string {
  const color = colorCss(item.reagent?.cor_hex);
  const detail =
    item.source === 'cycle' || item.source === 'intermediate'
      ? `<span class="craft-item__detail">${esc(item.detail)}</span>`
      : '';
  return `<li class="craft-item" title="${esc(item.detail)}">
    <span class="craft-item__swatch" style="--craft-item-color:${color}" aria-hidden="true"></span>
    <span class="craft-item__name">
      <span>${esc(item.nome)}</span>
      <small>${esc(item.id)} ${sourceTag(item.source)}</small>
      ${detail}
    </span>
    <strong class="craft-item__amount">${fmtDose(item.amount)}u</strong>
  </li>`;
}

function itemsPanel(title: string, items: CraftItem[], tone: 'default' | 'catalyst' = 'default'): string {
  if (!items.length) return '';
  return `<section class="craft-panel${tone === 'catalyst' ? ' craft-panel--catalyst' : ''}">
    <div class="craft-panel__head">
      <h3>${esc(title)}</h3>
      <span>${fmtInt(items.length)} ${items.length === 1 ? 'item' : 'itens'}</span>
    </div>
    ${tone === 'catalyst' ? '<p class="craft-panel__note">Precisa estar presente, mas não é consumido pela reação.</p>' : ''}
    <ul class="craft-items">${items.map(itemHtml).join('')}</ul>
  </section>`;
}

function warningsHtml(warnings: string[]): string {
  if (!warnings.length) return '';
  return `<div class="craft-alert" role="note">
    <strong>Atenção</strong>
    <ul>${warnings.map((warning) => `<li>${esc(warning)}</li>`).join('')}</ul>
  </div>`;
}

function stepConditionsHtml(step: CraftStep): string {
  if (step.kind !== 'reaction') return '';
  return `<section class="craft-panel craft-panel--plain">
    <div class="craft-panel__head">
      <h3>Condições da receita</h3>
      <span>${esc(step.recipeId ?? '')}</span>
    </div>
    <div class="craft-conditions">
      <div><span>Temperatura</span><strong>${esc(step.temperature ?? 'Sem restrição de temperatura')}</strong></div>
      <div><span>Rendimento base</span><strong>${fmt(step.yieldAmount)}u</strong></div>
      <div><span>Lotes nesta etapa</span><strong>${fmtInt(step.runs)}</strong></div>
      <div><span>Receita</span><strong>${esc(step.recipeId ?? '—')}</strong></div>
    </div>
    ${
      step.requirements.length
        ? `<div class="craft-requirements">
            <span>Equipamento declarado</span>
            <ul>${step.requirements.map((requirement) => `<li>${esc(requirement)}</li>`).join('')}</ul>
          </div>`
        : ''
    }
  </section>`;
}

function outputHtml(step: CraftStep): string {
  if (!step.output) return '';
  return `<section class="craft-output">
    <span>${step.isFinal ? 'Resultado final' : 'Resultado desta etapa'}</span>
    <strong>${fmt(step.output.amount)}u de ${esc(step.output.nome)}</strong>
    ${
      step.byproducts.length
        ? `<p>Também gera: ${step.byproducts.map((product) => `${fmt(product.amount)}u de ${esc(product.nome)}`).join(', ')}.</p>`
        : ''
    }
  </section>`;
}

function effectsHtml(step: CraftStep): string {
  if (!step.effects.length) return '';
  return `<details class="craft-details">
    <summary>Efeitos da reação (${fmtInt(step.effects.length)})</summary>
    <ul>${step.effects.map((effect) => `<li>${esc(effect)}</li>`).join('')}</ul>
  </details>`;
}

function modeNoticeHtml(session: CraftSession): string {
  if (!session.notice) return '';
  return `<div class="craft-mode-note" role="status">
    <span aria-hidden="true">ⓘ</span>
    <p>${esc(session.notice)}</p>
  </div>`;
}

function headerHtml(session: CraftSession): string {
  const { procedure } = session;
  return `<header class="craft-head">
    <div class="craft-head__identity">
      ${reagentSprite(procedure.target, 'sm')}
      <div class="craft-head__copy">
        <span class="craft-head__eyebrow">fabricação guiada</span>
        <strong>${esc(procedure.target.nome)}</strong>
        <small>${esc(procedure.recipe.id)} · pedido ${fmt(procedure.targetAmount)}u</small>
      </div>
    </div>
    <div class="craft-head__actions">
      <span class="craft-mode-pill">${session.mode === 'pip' ? 'sempre no topo' : 'painel na página'}</span>
      ${
        session.mode === 'dock' && supportsDocumentPip()
          ? '<button class="craft-icon-button" type="button" data-craft-action="popout" title="Abrir janela flutuante" aria-label="Abrir janela flutuante">⧉</button>'
          : ''
      }
      <button class="craft-icon-button" type="button" data-craft-action="quit" title="Encerrar fabricação" aria-label="Encerrar fabricação">×</button>
    </div>
  </header>`;
}

function progressHtml(session: CraftSession): string {
  const total = session.procedure.steps.length;
  const current = session.completed ? total : Math.min(session.stepIndex + 1, total);
  const percent = total ? Math.round((current / total) * 100) : 0;
  return `<div class="craft-progress">
    <div class="craft-progress__label">
      <span>${session.completed ? 'Lote concluído' : `Etapa ${fmtInt(current)} de ${fmtInt(total)}`}</span>
      <span>${percent}%</span>
    </div>
    <div class="craft-progress__track" role="progressbar" aria-label="Progresso da fabricação" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}">
      <span style="width:${percent}%"></span>
    </div>
  </div>`;
}

function stepHtml(session: CraftSession, step: CraftStep): string {
  return `<div class="craft-scroll" data-craft-scroll>
    <span class="sr-only" aria-live="polite">Etapa ${fmtInt(session.stepIndex + 1)} de ${fmtInt(session.procedure.steps.length)}: ${esc(step.title)}</span>
    ${session.noticeAtStep === session.stepIndex ? modeNoticeHtml(session) : ''}
    <section class="craft-step">
      <div class="craft-step__meta">
        <span class="craft-eyebrow">${esc(step.eyebrow)}</span>
        ${step.kind === 'materials' ? '<span class="craft-badge">antes de aquecer</span>' : ''}
      </div>
      <h2 class="craft-step__title" data-craft-step-title tabindex="-1">${esc(step.title)}</h2>
      <p class="craft-step__lead">${esc(step.description)}</p>
      ${
        step.ingredients.length || step.catalysts.length
          ? '<p class="craft-dose-note">Produção em lotes inteiros. Quantidades de entrada arredondadas para cima; o excedente fica no recipiente.</p>'
          : ''
      }
      ${warningsHtml(step.warnings)}
      ${itemsPanel(step.kind === 'materials' ? 'Materiais de partida' : 'Ingredientes da reação', step.ingredients)}
      ${itemsPanel('Catalisadores', step.catalysts, 'catalyst')}
      ${stepConditionsHtml(step)}
      ${outputHtml(step)}
      ${effectsHtml(step)}
    </section>
  </div>`;
}

function completionHtml(session: CraftSession): string {
  const { procedure } = session;
  const finalStep = [...procedure.steps].reverse().find((step) => step.kind === 'reaction');
  const container = procedure.containers[0] ?? null;
  const byproducts = finalStep?.byproducts ?? [];
  return `<div class="craft-scroll" data-craft-scroll>
    ${session.noticeAtStep === session.stepIndex ? modeNoticeHtml(session) : ''}
    <section class="craft-complete">
      <div class="craft-complete__visual">${reagentSprite(procedure.target, 'lg')}</div>
      <p class="eyebrow">lote concluído</p>
      <h2 class="craft-step__title" data-craft-step-title tabindex="-1">${fmt(procedure.producedAmount)}u de ${esc(procedure.target.nome)}</h2>
      <p class="craft-complete__lead">${fmtInt(procedure.runs)} ${procedure.runs === 1 ? 'lote' : 'lotes'} da receita <code>${esc(procedure.recipe.id)}</code>${
        procedure.producedAmount > procedure.targetAmount + 1e-9
          ? ` · pedido de ${fmt(procedure.targetAmount)}u`
          : ''
      }.</p>
      <dl class="craft-complete__stats">
        <div><dt>Etapas</dt><dd>${fmtInt(procedure.steps.length)}</dd></div>
        <div><dt>Materiais-base</dt><dd>${fmtInt(procedure.shopping.length)}</dd></div>
        <div><dt>Catalisadores</dt><dd>${fmtInt(procedure.catalysts.length)}</dd></div>
        <div><dt>Recipiente</dt><dd>${container ? `${esc(container.nome)} · ${fmt(container.capacidade)}u` : '—'}</dd></div>
      </dl>
      ${
        byproducts.length
          ? `<p class="craft-complete__aside">Subprodutos previstos: ${byproducts
              .map((product) => `${fmt(product.amount)}u de ${esc(product.nome)}`)
              .join(', ')}.</p>`
          : ''
      }
      ${warningsHtml(procedure.warnings)}
      <div class="button-row">
        <button class="button button--primary button--small" type="button" data-craft-action="restart">Fazer outro lote</button>
      </div>
    </section>
  </div>`;
}

function stepNavHtml(session: CraftSession): string {
  if (session.completed) {
    return `<footer class="craft-nav">
      <button class="button button--ghost button--small" type="button" data-craft-action="prev">← Rever etapas</button>
      <span class="craft-nav__hint craft-nav__hint--note">o progresso fica nesta janela</span>
      <button class="button button--ghost button--small" type="button" data-craft-action="quit">Encerrar</button>
    </footer>`;
  }
  const last = session.stepIndex >= session.procedure.steps.length - 1;
  return `<footer class="craft-nav">
    <button class="button button--ghost button--small" type="button" data-craft-action="prev" ${session.stepIndex === 0 ? 'disabled' : ''}>← Anterior</button>
    <span class="craft-nav__hint"><kbd>←</kbd><kbd>→</kbd> <span>ou deslize</span></span>
    <button class="button button--primary button--small" type="button" data-craft-action="next">${last ? 'Concluir' : 'Próxima'} →</button>
  </footer>`;
}

function sessionHtml(session: CraftSession): string {
  const step = session.procedure.steps[session.stepIndex] ?? session.procedure.steps[0];
  const body = session.completed || !step ? completionHtml(session) : stepHtml(session, step);
  return `<div class="craft-shell">
    ${headerHtml(session)}
    ${progressHtml(session)}
    ${body}
    ${stepNavHtml(session)}
  </div>`;
}

function renderSession(session: CraftSession): void {
  if (!session.root) return;
  const root = session.root;
  root.innerHTML = sessionHtml(session);
  const doc = root.ownerDocument;
  if (session.mode === 'pip') {
    doc.title = session.completed
      ? `Lote concluído — ${session.procedure.target.nome} — Guia de Chem`
      : `Fabricar ${session.procedure.target.nome} — Guia de Chem`;
  }
  const scroll = root.querySelector<HTMLElement>('[data-craft-scroll]');
  if (scroll) scroll.scrollTop = 0;
  const focusTarget = root.querySelector<HTMLElement>('[data-craft-step-title]');
  const view = doc.defaultView ?? window;
  view.requestAnimationFrame(() => {
    focusTarget?.focus({ preventScroll: true });
  });
}

function advanceSession(session: CraftSession): void {
  if (session.completed) return;
  if (session.stepIndex >= session.procedure.steps.length - 1) {
    session.completed = true;
  } else {
    session.stepIndex += 1;
  }
  renderSession(session);
}

function previousSession(session: CraftSession): void {
  if (session.completed) {
    session.completed = false;
    session.stepIndex = Math.max(0, session.procedure.steps.length - 1);
  } else if (session.stepIndex > 0) {
    session.stepIndex -= 1;
  }
  renderSession(session);
}

function restartSession(session: CraftSession): void {
  session.completed = false;
  session.stepIndex = 0;
  renderSession(session);
}

function disposeSession(session: CraftSession): void {
  session.closing = true;
  session.themeObserver?.disconnect();
  session.themeObserver = null;
  if (activeSession === session) activeSession = null;
  const pip = session.pipWindow;
  session.pipWindow = null;
  if (pip && !pip.closed) {
    try {
      pip.close();
    } catch {
      /* A janela já pode ter sido fechada pelo sistema. */
    }
  }
  session.root?.remove();
  session.root = null;
}

function copyStylesTo(doc: Document): void {
  const chunks: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) chunks.push(rule.cssText);
    } catch {
      /* Folhas externas sem permissão de leitura são ignoradas. */
    }
  }
  const style = doc.createElement('style');
  style.textContent = chunks.join('\n');
  doc.head.append(style);
}

function preparePipDocument(pip: Window): void {
  const doc = pip.document;
  doc.documentElement.lang = 'pt-BR';
  doc.documentElement.dataset.theme = currentTheme();
  doc.head.replaceChildren();

  const charset = doc.createElement('meta');
  charset.setAttribute('charset', 'utf-8');
  const viewport = doc.createElement('meta');
  viewport.setAttribute('name', 'viewport');
  viewport.setAttribute('content', 'width=device-width, initial-scale=1');
  const base = doc.createElement('base');
  base.href = new URL(BASE_URL, window.location.origin).href;
  const title = doc.createElement('title');
  title.textContent = 'Fabricação — Guia de Chem';
  doc.head.append(charset, viewport, base, title);
  copyStylesTo(doc);

  doc.body.className = 'craft-doc';
  doc.body.replaceChildren();
}

function openPipSession(
  pip: Window,
  procedure: CraftProcedure,
  stepIndex = 0,
  completed = false,
): void {
  preparePipDocument(pip);
  const root = pip.document.createElement('div');
  root.className = 'craft-widget craft-widget--pip';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', `Fabricação de ${procedure.target.nome}`);
  pip.document.body.append(root);

  const session: CraftSession = {
    procedure,
    stepIndex,
    completed,
    mode: 'pip',
    root,
    pipWindow: pip,
    themeObserver: null,
    notice: null,
    noticeAtStep: null,
    closing: false,
  };
  activeSession = session;

  const observer = new MutationObserver(() => {
    pip.document.documentElement.dataset.theme = currentTheme();
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  session.themeObserver = observer;

  pip.addEventListener(
    'pagehide',
    () => {
      if (activeSession !== session || session.closing) return;
      session.closing = true;
      session.themeObserver?.disconnect();
      session.themeObserver = null;
      session.root = null;
      session.pipWindow = null;
      activeSession = null;
      openDockSession(
        procedure,
        session.stepIndex,
        session.completed,
        'A janela flutuante foi fechada. O roteiro continua neste painel.',
      );
    },
    { once: true },
  );

  mountWidget(root, session);
}

function openDockSession(
  procedure: CraftProcedure,
  stepIndex = 0,
  completed = false,
  notice: string | null = null,
): void {
  if (activeSession) disposeSession(activeSession);
  const dock = document.createElement('aside');
  dock.className = 'craft-widget craft-widget--dock';
  dock.setAttribute('role', 'dialog');
  dock.setAttribute('aria-modal', 'false');
  dock.setAttribute('aria-label', `Fabricação de ${procedure.target.nome}`);
  document.body.append(dock);

  const session: CraftSession = {
    procedure,
    stepIndex,
    completed,
    mode: 'dock',
    root: dock,
    pipWindow: null,
    themeObserver: null,
    notice,
    noticeAtStep: notice ? stepIndex : null,
    closing: false,
  };
  activeSession = session;
  mountWidget(dock, session);
}

function modalPreviewHtml(procedure: CraftProcedure): string {
  const steps = procedure.steps.slice(0, 4);
  const hidden = procedure.steps.length - steps.length;
  const container = procedure.containers[0] ?? null;
  return `<div class="craft-preview">
    <div class="craft-preview__stats">
      <span><strong>${fmtInt(procedure.steps.length)}</strong> etapas</span>
      <span><strong>${fmtInt(procedure.runs)}</strong> ${procedure.runs === 1 ? 'lote' : 'lotes'}</span>
      <span><strong>${fmt(procedure.producedAmount)}u</strong> produzidos</span>
      <span><strong>${fmtInt(procedure.shopping.length)}</strong> materiais-base</span>
    </div>
    <ol class="craft-preview__steps">
      ${steps
        .map(
          (step, index) =>
            `<li><span>${fmtInt(index + 1)}</span><strong>${esc(step.title)}</strong></li>`,
        )
        .join('')}
      ${hidden > 0 ? `<li class="craft-preview__more">+ ${fmtInt(hidden)} ${hidden === 1 ? 'etapa' : 'etapas'}</li>` : ''}
    </ol>
    ${
      container
        ? `<p class="craft-preview__container">Recipiente sugerido: <strong>${esc(container.nome)}</strong> · ${fmt(container.capacidade)}u</p>`
        : ''
    }
    ${procedure.truncated ? '<p class="craft-preview__warning">Há intermediários que não puderam ser expandidos; confira os materiais antes de começar.</p>' : ''}
    <p class="craft-preview__fine">Os intermediários usam a receita principal de cada reagente. A receita escolhida é usada no produto final. A produção roda em lotes inteiros e pode ultrapassar a quantidade desejada; quantidades de entrada são arredondadas para cima em unidades inteiras do dispensador.</p>
  </div>`;
}

function modalBrowserNote(supports: boolean): string {
  return supports
    ? 'A janela usa Document Picture-in-Picture e fica sobre outros apps no Chrome/Edge desktop. Em fullscreen exclusivo, o jogo pode cobri-la.'
    : 'Este navegador não oferece Document Picture-in-Picture. O roteiro abre em um painel fixo nesta página; Chrome/Edge desktop permite a janela sobre outros apps.';
}

export function fabricationModalHtml(
  target: Reagent,
  recipes: Recipe[],
  initialRecipeId?: string,
  initialAmount = DEFAULT_CRAFT_AMOUNT,
): string {
  if (!recipes.length) return '';
  const selected = recipes.find((recipe) => recipe.id === initialRecipeId) ?? recipes.find((recipe) => recipe.principal) ?? recipes[0];
  const amount = initialAmount > 0 && Number.isFinite(initialAmount) ? cleanAmount(initialAmount) : DEFAULT_CRAFT_AMOUNT;
  const supports = supportsDocumentPip();
  return `<dialog class="craft-modal" data-craft-modal aria-labelledby="craft-modal-title">
    <div class="craft-modal__sheet">
      <header class="craft-modal__head">
        <div class="craft-modal__identity">
          ${reagentSprite(target, 'md')}
          <div>
            <p class="eyebrow">fabricação guiada</p>
            <h2 id="craft-modal-title">Fabricar ${esc(target.nome)}</h2>
            <p>Escolha a quantidade final e a rota. O guia monta o roteiro a partir da árvore de produção extraída.</p>
          </div>
        </div>
        <button type="button" class="craft-icon-button" data-craft-close aria-label="Fechar janela de fabricação" title="Fechar">×</button>
      </header>
      <form class="craft-form" data-craft-form>
        <div class="craft-modal__fields">
          <label class="field">
            <span>Receita</span>
            <select name="recipe" data-craft-recipe>
              ${recipes
                .map(
                  (recipe) =>
                    `<option value="${esc(recipe.id)}" ${recipe.id === selected.id ? 'selected' : ''}>${esc(recipe.id)} — ${esc(formulaSummary(recipe, target.id))}</option>`,
                )
                .join('')}
            </select>
          </label>
          <label class="field field--amount">
            <span>Quantidade desejada</span>
            <div class="input-unit">
              <input name="amount" data-craft-amount type="number" min="0.1" step="0.1" value="${amount}" inputmode="decimal" />
              <span>u</span>
            </div>
          </label>
        </div>
        <p class="craft-modal__browser">${modalBrowserNote(supports)}</p>
        <div class="craft-modal__preview" data-craft-preview aria-live="polite"></div>
        <footer class="craft-modal__actions">
          <button class="button button--ghost" type="button" data-craft-close>Cancelar</button>
          <button class="button button--primary" type="submit" data-craft-start>${supports ? 'Iniciar janela flutuante' : 'Iniciar no painel'}</button>
        </footer>
      </form>
    </div>
  </dialog>`;
}

export function setupFabrication(
  root: HTMLElement,
  data: ChemData,
  target: Reagent,
  recipes: Recipe[],
  options: FabricationOptions = {},
): void {
  const modal = root.querySelector<HTMLDialogElement>('[data-craft-modal]');
  if (!modal) return;
  const form = modal.querySelector<HTMLFormElement>('[data-craft-form]');
  const recipeSelect = modal.querySelector<HTMLSelectElement>('[data-craft-recipe]');
  const amountInput = modal.querySelector<HTMLInputElement>('[data-craft-amount]');
  const preview = modal.querySelector<HTMLElement>('[data-craft-preview]');
  const startButton = modal.querySelector<HTMLButtonElement>('[data-craft-start]');
  const browserNote = modal.querySelector<HTMLElement>('.craft-modal__browser');
  const openers = root.querySelectorAll<HTMLButtonElement>('[data-craft-open]');
  if (!form || !recipeSelect || !amountInput || !preview || !startButton) return;

  const supports = supportsDocumentPip();
  if (browserNote) browserNote.textContent = modalBrowserNote(supports);
  startButton.textContent = supports ? 'Iniciar janela flutuante' : 'Iniciar no painel';

  const closeModal = (): void => {
    if (typeof modal.close === 'function' && modal.open) modal.close();
    else modal.removeAttribute('open');
  };

  const selectedRecipe = (): Recipe | null =>
    recipes.find((recipe) => recipe.id === recipeSelect.value) ?? recipes[0] ?? null;

  const currentAmount = (): number | null => {
    const value = Number(amountInput.value.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) return null;
    return cleanAmount(value);
  };

  const readProcedure = (): CraftProcedure | null => {
    const recipe = selectedRecipe();
    const amount = currentAmount();
    if (!recipe || !amount) return null;
    return buildCraftProcedure(data, target, recipe, amount);
  };

  const updatePreview = (): void => {
    amountInput.setCustomValidity('');
    amountInput.removeAttribute('aria-invalid');
    const procedure = readProcedure();
    if (!procedure) {
      preview.innerHTML = '<p class="craft-preview__error">Informe uma quantidade maior que zero para montar o roteiro.</p>';
      startButton.disabled = true;
      return;
    }
    preview.innerHTML = modalPreviewHtml(procedure);
    startButton.disabled = false;
  };

  const openModal = (): void => {
    updatePreview();
    if (!modal.open) {
      if (typeof modal.showModal === 'function') modal.showModal();
      else modal.setAttribute('open', '');
    }
    window.requestAnimationFrame(() => {
      amountInput.focus();
      amountInput.select();
    });
  };

  openers.forEach((button) => button.addEventListener('click', openModal));
  modal.querySelectorAll<HTMLElement>('[data-craft-close]').forEach((button) => {
    button.addEventListener('click', closeModal);
  });
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });
  recipeSelect.addEventListener('change', updatePreview);
  amountInput.addEventListener('input', updatePreview);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const amount = currentAmount();
    if (!amount) {
      amountInput.setCustomValidity('Informe uma quantidade maior que zero.');
      amountInput.setAttribute('aria-invalid', 'true');
      amountInput.reportValidity();
      return;
    }
    const procedure = readProcedure();
    if (!procedure) {
      preview.innerHTML = '<p class="craft-preview__error">Não foi possível montar as etapas com esta receita.</p>';
      startButton.disabled = true;
      return;
    }
    amountInput.value = String(amount);
    closeModal();
    beginFabrication(procedure);
  });

  if (options.initialRecipeId && recipes.some((recipe) => recipe.id === options.initialRecipeId)) {
    recipeSelect.value = options.initialRecipeId;
  }
  if (options.initialAmount && options.initialAmount > 0) {
    amountInput.value = String(cleanAmount(options.initialAmount));
  }
  updatePreview();
}

function beginFabrication(procedure: CraftProcedure): void {
  if (activeSession) disposeSession(activeSession);
  const token = ++requestToken;
  if (!supportsDocumentPip()) {
    openDockSession(
      procedure,
      0,
      false,
      'Este navegador não oferece Document Picture-in-Picture. O passo a passo continua neste painel.',
    );
    return;
  }

  let request: Promise<Window>;
  try {
    request = window.documentPictureInPicture!.requestWindow({ width: 420, height: 660 });
  } catch (error) {
    console.warn('Document Picture-in-Picture indisponível.', error);
    openDockSession(procedure, 0, false, 'Não foi possível abrir a janela flutuante. O passo a passo continua neste painel.');
    return;
  }

  void request
    .then((pip) => {
      if (token !== requestToken) {
        pip.close();
        return;
      }
      if (activeSession) disposeSession(activeSession);
      openPipSession(pip, procedure);
    })
    .catch((error) => {
      if (token !== requestToken) return;
      console.warn('Falha ao abrir Document Picture-in-Picture.', error);
      openDockSession(procedure, 0, false, 'Não foi possível abrir a janela flutuante. O passo a passo continua neste painel.');
    });
}

function popoutSession(session: CraftSession): void {
  if (session.mode !== 'dock' || !supportsDocumentPip()) return;
  let request: Promise<Window>;
  try {
    request = window.documentPictureInPicture!.requestWindow({ width: 420, height: 660 });
  } catch (error) {
    console.warn('Falha ao abrir Document Picture-in-Picture.', error);
    session.notice = 'Não foi possível abrir a janela flutuante. O roteiro continua neste painel.';
    session.noticeAtStep = session.stepIndex;
    renderSession(session);
    return;
  }
  void request
    .then((pip) => {
      if (activeSession !== session) {
        pip.close();
        return;
      }
      const { procedure, stepIndex, completed } = session;
      disposeSession(session);
      openPipSession(pip, procedure, stepIndex, completed);
    })
    .catch((error) => {
      console.warn('Falha ao abrir Document Picture-in-Picture.', error);
      session.notice = 'Não foi possível abrir a janela flutuante. O roteiro continua neste painel.';
      session.noticeAtStep = session.stepIndex;
      renderSession(session);
    });
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    !!target.closest('button, a, input, select, textarea, summary, [contenteditable="true"]')
  );
}

function handleWidgetKeydown(session: CraftSession, event: KeyboardEvent): void {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
  if (isInteractiveTarget(event.target)) return;
  if (event.key === 'ArrowRight' || event.key === ' ') {
    event.preventDefault();
    advanceSession(session);
    return;
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    previousSession(session);
  }
}

function bindSwipe(session: CraftSession, root: HTMLElement): void {
  let start: { x: number; y: number; pointerId: number } | null = null;
  root.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (isInteractiveTarget(event.target)) return;
    start = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  });
  root.addEventListener('pointerup', (event) => {
    if (!start || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    start = null;
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
    if ((root.ownerDocument.defaultView ?? window).getSelection()?.toString()) return;
    if (dx < 0) advanceSession(session);
    else previousSession(session);
  });
  root.addEventListener('pointercancel', () => {
    start = null;
  });

  // O toque precisa de touch events: ao iniciar um pan horizontal o navegador
  // cancela os pointer events, então medimos o gesto e bloqueamos o scroll só
  // quando ele é claramente horizontal.
  let touch: { x: number; y: number; swipe: boolean; decided: boolean } | null = null;
  root.addEventListener(
    'touchstart',
    (event) => {
      if (event.touches.length !== 1 || isInteractiveTarget(event.target)) {
        touch = null;
        return;
      }
      const point = event.touches[0];
      touch = { x: point.clientX, y: point.clientY, swipe: false, decided: false };
    },
    { passive: true },
  );
  root.addEventListener(
    'touchmove',
    (event) => {
      if (!touch) return;
      const point = event.touches[0];
      if (!point) return;
      const dx = point.clientX - touch.x;
      const dy = point.clientY - touch.y;
      if (!touch.decided) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        touch.decided = true;
        if (Math.abs(dx) > Math.abs(dy) * 1.2) touch.swipe = true;
        else {
          touch = null;
          return;
        }
      }
      if (touch?.swipe && event.cancelable) event.preventDefault();
    },
    { passive: false },
  );
  root.addEventListener(
    'touchend',
    (event) => {
      if (!touch) return;
      const point = event.changedTouches[0];
      const dx = point ? point.clientX - touch.x : 0;
      const dy = point ? point.clientY - touch.y : 0;
      const swiped = touch.swipe && Math.abs(dx) >= 56 && Math.abs(dx) >= Math.abs(dy) * 1.25;
      touch = null;
      if (!swiped) return;
      if ((root.ownerDocument.defaultView ?? window).getSelection()?.toString()) return;
      if (dx < 0) advanceSession(session);
      else previousSession(session);
    },
    { passive: true },
  );
  root.addEventListener('touchcancel', () => {
    touch = null;
  });
}

function handleWidgetClick(session: CraftSession, event: MouseEvent): void {
  const target = event.target as Element | null;
  const actionButton = target?.closest<HTMLElement>('[data-craft-action]');
  if (!actionButton) return;
  event.preventDefault();
  switch (actionButton.dataset.craftAction) {
    case 'next':
      advanceSession(session);
      break;
    case 'prev':
      previousSession(session);
      break;
    case 'restart':
      restartSession(session);
      break;
    case 'popout':
      popoutSession(session);
      break;
    case 'quit':
      disposeSession(session);
      break;
    default:
      break;
  }
}

function mountWidget(root: HTMLElement, session: CraftSession): void {
  root.addEventListener('click', (event) => handleWidgetClick(session, event));
  root.addEventListener('keydown', (event) => handleWidgetKeydown(session, event));
  bindSwipe(session, root);
  renderSession(session);
}
