import type { ChemData, SpriteData } from '../types';
import { appHref } from '../lib/router';
import { downloadReportLink, pageHeading } from '../lib/components';
import { displaySource, esc, fmtDate, fmtInt, shortSource, sourceUrl } from '../lib/text';
import type { ViewResult } from './types';

function spriteLicenses(sprites: SpriteData | null): string {
  if (!sprites) {
    return `<div class="notice notice--warning"><strong>Metadados de sprite indisponíveis</strong><p>O arquivo <code>data/sprites.json</code> não pôde ser carregado. Os créditos completos dos RSIs estão no relatório de extração.</p></div>`;
  }
  return `<div class="table-wrap">
    <table class="data-table license-table">
      <thead>
        <tr><th>Rsi</th><th>Licença</th><th>Autoria / origem</th><th>Arquivo do repositório</th></tr>
      </thead>
      <tbody>
        ${sprites.rsis
          .map(
            (rsi) => `<tr>
              <td><strong>${esc(rsi.nome)}</strong><br><span class="muted small">${esc(rsi.estados.length)} estados</span></td>
              <td>${esc(rsi.licenca ?? rsi.meta.license ?? 'não declarada')}</td>
              <td class="license-table__credit">${esc(rsi.copyright ?? rsi.meta.copyright ?? 'Sem crédito declarado no meta.json')}</td>
              <td><a href="${sourceUrl(rsi.origem)}" target="_blank" rel="noopener noreferrer"><code>${esc(shortSource(displaySource(rsi.origem)))}</code> ↗</a></td>
            </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  </div>`;
}

export function aboutView(data: ChemData, sprites: SpriteData | null): ViewResult {
  const meta = data.meta;
  const fallbackCount = data.reagentes.filter(
    (reagent) => !reagent.abstrato && reagent.traducao !== 'pt-BR',
  ).length;
  const noColorCount = data.reagentes.filter(
    (reagent) => !reagent.abstrato && !reagent.cor_hex,
  ).length;
  const ungrouped = data.reagentes.filter((reagent) => !reagent.grupo).length;
  const commented = meta.ignorados.reacoes_comentadas;
  return {
    title: 'Créditos e fontes — Guia de Chem',
    html: `<div class="page page--about">
      <div class="container">
        ${pageHeading({
          eyebrow: 'sobre o projeto',
          title: 'Créditos e fontes',
          intro: 'Um guia estático, não oficial e gerado a partir dos YAML da Dumont Station. Nenhuma receita, cor ou quantidade foi digitada à mão.',
          actions: `${downloadReportLink()}<a class="button button--ghost" href="${meta.repositorio}" target="_blank" rel="noopener noreferrer">Repositório ↗</a>`,
        })}

        <div class="about-lead">
          <div class="about-lead__mark" aria-hidden="true">⌬</div>
          <div>
            <h2>O jogo é a fonte da verdade</h2>
            <p>O guia é um leitor dos protótipos de química. Se uma reação, efeito ou condição mudar no fork, os dados só acompanham depois de uma nova extração. Nada aqui substitui a leitura do código do servidor em caso de dúvida.</p>
            <p class="fine-print">Última extração: ${esc(fmtDate(meta.gerado_em))} · branch <code>${esc(meta.branch)}</code> · gerado com <code>${esc(meta.gerado_com)}</code>.</p>
          </div>
        </div>

        <section class="about-stats" aria-label="Números da extração">
          <div><span>${fmtInt(meta.arquivos_prototipo_analisados)}</span><small>arquivos YAML varridos</small></div>
          <div><span>${fmtInt(meta.arquivos_com_reagentes_ou_reacoes)}</span><small>arquivos de química</small></div>
          <div><span>${fmtInt(meta.contagens.reagentes_total)}</span><small>reagentes lidos</small></div>
          <div><span>${fmtInt(meta.contagens.reacoes_total)}</span><small>reações lidas</small></div>
          <div><span>${fmtInt(meta.locale.pt_br_arquivos)}</span><small>arquivos de locale pt-BR</small></div>
          <div><span>${fmtInt(sprites?.rsis.length ?? 0)}</span><small>RSIs de sprite copiados</small></div>
        </section>

        <div class="about-grid">
          <section class="about-panel">
            <p class="eyebrow">pipeline</p>
            <h2>Como os dados são gerados</h2>
            <ol class="pipeline">
              <li>
                <span class="pipeline__number">01</span>
                <div><strong>Varredura dos protótipos</strong><p>O extrator percorre todos os arquivos <code>.yml</code> em <code>Resources/Prototypes</code>, não apenas as pastas esperadas de reagentes e reações. Também resolve heranças de protótipo e junta reações declaradas em arquivos de forks.</p></div>
              </li>
              <li>
                <span class="pipeline__number">02</span>
                <div><strong>Resolução de locale</strong><p>Nomes, descrições, aparências e sabores usam o locale pt-BR. Quando a chave não existe, o texto original em en-US é mostrado e marcado com um selo de idioma. Nenhuma tradução é inventada.</p></div>
              </li>
              <li>
                <span class="pipeline__number">03</span>
                <div><strong>Índice reverso e auditoria</strong><p>Cada produto recebe suas rotas de produção, cada reagente recebe seus usos como ingrediente, e o relatório registra contagens, fontes, órfãos e escolhas de modelagem.</p></div>
              </li>
              <li>
                <span class="pipeline__number">04</span>
                <div><strong>Publicação estática</strong><p>O resultado é <code>chem.json</code> + <code>sprites.json</code> + RSIs copiados. O site é Vite + TypeScript, sem servidor e sem banco de dados em tempo de execução.</p></div>
              </li>
            </ol>
          </section>

          <aside class="about-panel about-panel--accent">
            <p class="eyebrow">arquivos gerados</p>
            <h2>O que está no pacote</h2>
            <dl class="about-files">
              <div><dt><code>data/chem.json</code></dt><dd>${fmtInt(meta.contagens.reagentes_total)} reagentes, ${fmtInt(meta.contagens.reacoes_total)} reações, receitas, efeitos, limiares e metadados.</dd></div>
              <div><dt><code>data/sprites.json</code></dt><dd>Licenças, autoria e estados dos ${fmtInt(sprites?.rsis.length ?? 14)} RSIs copiados.</dd></div>
              <div><dt><code>data/relatorio.md</code></dt><dd>Relatório legível com amostras, contagens, avisos e cobertura.</dd></div>
              <div><dt><code>sprites/</code></dt><dd>PNGs e <code>meta.json</code> copiados sem recoloração. O béquer usa a camada de líquido do próprio <code>beaker.rsi</code>, tingida pela cor do reagente.</dd></div>
            </dl>
            <p class="fine-print">Os arquivos estão disponíveis em <a href="${appHref('/data/relatorio.md')}" target="_blank" rel="noopener noreferrer">/data/relatorio.md</a>.</p>
          </aside>
        </div>

        <section class="about-panel">
          <p class="eyebrow">decisões de modelagem</p>
          <h2>O que o guia faz — e o que ele não faz</h2>
          <div class="decision-grid">
            <article class="decision">
              <span class="decision__tag">ocultação</span>
              <h3>Abstratos e consumíveis</h3>
              <p>Protótipos abstratos servem de base e não aparecem por padrão. Comidas e bebidas somam centenas de registros e também começam ocultas. Há filtros explícitos para liberar cada categoria.</p>
            </article>
            <article class="decision">
              <span class="decision__tag">receita principal</span>
              <h3>Uma rota destacada, todas preservadas</h3>
              <p>Quando um produto tem várias reações, o guia elege uma “principal” por uma heurística de interface. Todas as alternativas continuam listadas e selecionáveis; a escolha não afirma qual é canônica no jogo.</p>
            </article>
            <article class="decision">
              <span class="decision__tag">dispensador</span>
              <h3>Jugs, não uma lista inventada</h3>
              <p>O fork não tem <code>reagentDispenserInventory</code>. A lista de dispensáveis vem dos frascos declarados no <code>StorageFill</code> do ChemDispenser. Reagentes sem essa marca não são tratados como disponíveis.</p>
            </article>
            <article class="decision">
              <span class="decision__tag">sprites</span>
              <h3>Sem mapear pílula para reagente</h3>
              <p>O visual é um béquer do repositório com preenchimento tintado pela cor do reagente. Ele não representa a cor de uma pílula e o guia não associa pílulas a reagentes.</p>
            </article>
            <article class="decision">
              <span class="decision__tag">overdose</span>
              <h3>Marcação é heurística</h3>
              <p>A etiqueta “possível overdose” aparece quando um limiar tem mínimo ≥ 20u. É uma ajuda de leitura do guia, não uma regra do jogo. Os limiares e efeitos exibidos são os do YAML.</p>
            </article>
            <article class="decision">
              <span class="decision__tag">unidades</span>
              <h3>Unidades e cores explícitas</h3>
              <p>Volumes usam <code>u</code>, temperaturas aparecem em Kelvin e Celsius, e toda cor exibida vem acompanhada do hex. Oito reagentes não declaram cor e aparecem como “sem cor”, sem cor inventada.</p>
            </article>
          </div>
        </section>

        <section class="about-panel about-panel--limits">
          <p class="eyebrow">transparência</p>
          <h2>Limites conhecidos desta extração</h2>
          <ul class="limit-list">
            <li><strong>${fmtInt(fallbackCount)} reagentes não abstratos</strong> usam texto em inglês em pelo menos um campo por falta de chave pt-BR. O fallback é marcado na ficha.</li>
            <li><strong>${fmtInt(noColorCount)} reagentes não abstratos</strong> não têm cor declarada; o guia mostra “sem cor” e não gera um hex.</li>
            <li><strong>${fmtInt(meta.contagens.produtos_com_receitas_alternativas)} produtos</strong> têm mais de uma reação. A árvore usa a principal; troque a receita no seletor para ver outra rota.</li>
            <li><strong>${fmtInt(ungrouped)} reagentes</strong> não declaram <code>group</code> no YAML. Eles ficam em “Sem grupo” e continuam buscáveis.</li>
            <li><strong>${fmtInt(commented.length)} ${commented.length === 1 ? 'reação comentada' : 'reações comentadas'}</strong> ${commented.length === 1 ? 'foi' : 'foram'} encontrada${commented.length === 1 ? '' : 's'} no YAML e não ${commented.length === 1 ? 'entrou' : 'entraram'} no índice: ${commented.map((item) => `<code>${esc(item.file)}:${item.line}</code>`).join(', ')}.</li>
            <li><strong>Receitas com efeitos ou condições desconhecidas</strong> podem perder detalhes de exibição, mas nunca são completadas com fatos inventados. Zero ingredientes e produtos desconhecidos foram registrados nesta execução.</li>
          </ul>
        </section>

        <section class="about-panel">
          <p class="eyebrow">licenças e autoria</p>
          <h2>Créditos</h2>
          <div class="credit-intro">
            <div>
              <h3>Projeto e conteúdo do jogo</h3>
              <p><strong>Dumont Station</strong> e seus contribuidores. O guia não é afiliado à Project Dumont ou à Space Station 14. O código do jogo e os assets pertencem aos seus autores originais.</p>
              <p><strong>Código do guia:</strong> ${esc(meta.licenca_codigo)} · <strong>Assets do repositório:</strong> ${esc(meta.licenca_assets_padrao)}.</p>
              <p><strong>Fonte:</strong> <a href="${meta.repositorio}" target="_blank" rel="noopener noreferrer">${esc(meta.repositorio)}</a> (branch <code>${esc(meta.branch)}</code>).</p>
            </div>
            <div>
              <h3>Atribuições dos sprites</h3>
              <p>Os RSIs mantêm seus <code>meta.json</code> originais. Os créditos abaixo foram lidos desses arquivos e não foram reescritos.</p>
              <p><a class="text-link" href="${meta.repositorio}/tree/${encodeURIComponent(meta.branch)}/Resources/Textures/Objects/Specific/Chemistry" target="_blank" rel="noopener noreferrer">Ver texturas no repositório ↗</a></p>
            </div>
          </div>
          ${spriteLicenses(sprites)}
        </section>

        <section class="about-footnote">
          <p><strong>Guia não oficial.</strong> ${esc(meta.fonte_da_verdade)}</p>
          <p>Dados gerados a partir dos YAML do repositório Dumont Station (branch <code>${esc(meta.branch)}</code>). Se você encontrar divergência, compare com a linha do YAML indicada na ficha do reagente antes de alterar qualquer receita.</p>
        </section>
      </div>
    </div>`,
  };
}
