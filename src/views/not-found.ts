import type { ChemData } from '../types';
import { appHref } from '../lib/router';
import { emptyState, pageHeading } from '../lib/components';
import { esc, fmtInt } from '../lib/text';
import type { ViewResult } from './types';

export function notFoundView(data: ChemData, path: string): ViewResult {
  return {
    title: 'Página não encontrada — Guia de Chem',
    html: `<div class="page page--notfound">
      <div class="container">
        ${pageHeading({
          eyebrow: 'erro 404',
          title: 'Essa mistura não reagiu',
          intro: 'O endereço não corresponde a uma página do guia. Talvez o id do reagente tenha mudado ou o link esteja incompleto.',
        })}
        ${emptyState(
          'Página não encontrada',
          `Não existe conteúdo em <code>${esc(path)}</code>. A base tem ${fmtInt(data.meta.contagens.reagentes_total)} reagentes e ${fmtInt(data.meta.contagens.reacoes_total)} reações para explorar.`,
          `<div class="button-row">
            <a class="button button--primary" href="${appHref('/reagentes')}">Buscar reagentes</a>
            <a class="button button--ghost" href="${appHref('/grupos')}">Ver grupos</a>
            <a class="button button--ghost" href="${appHref('/calculadora')}">Abrir calculadora</a>
          </div>`,
        )}
      </div>
    </div>`,
  };
}
