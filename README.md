# Guia de Chem — Dumont Station

Guia de química **não oficial**, em português, gerado a partir dos arquivos YAML do fork
[Project-Dumont/Dumont-Station](https://github.com/Project-Dumont/Dumont-Station). O site é
estático (Vite + TypeScript, sem framework) e não mantém fatos de química escritos à mão: nomes,
receitas, quantidades, cores, efeitos e condições vêm da extração do repositório.

> O repositório de origem é tratado como **somente leitura**. A extração não executa comandos
> git, não altera arquivos do fork e grava tudo neste projeto.

## Requisitos

- Node.js **20.19+** ou **22.12+** (exigência do Vite 7)
- npm
- Um clone local do Dumont-Station com `Resources/Prototypes`, `Resources/Locale/pt-BR`,
  `Resources/Locale/en-US` e as texturas de química

Se o Node não estiver no `PATH` do PowerShell, ajuste o caminho da instalação:

```powershell
$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH
```

## Instalação

```powershell
Set-Location 'caminho\para\quimica-dumont'
npm.cmd install
```

## Extração

O extrator lê o fork e regenera os dados do site:

```powershell
npm.cmd run extract
```

Por padrão, o extrator procura o clone na pasta irmã `..\Dumont-Station`. Para usar outro clone:

```powershell
npm.cmd run extract -- --repo "D:\caminho\para\Dumont-Station"
```

### O que a extração grava

| Arquivo | Conteúdo |
| --- | --- |
| `public/data/chem.json` | Reagentes, receitas, efeitos, limiares, recipientes, categorias de mistura, dispensador e metadados |
| `public/data/sprites.json` | RSIs copiados, estados, licenças e copyright |
| `public/data/relatorio.md` | Relatório de cobertura e pendências (também servido pelo site) |
| `public/sprites/<rsi>/` | PNGs e `meta.json` dos RSIs de química |
| `relatorio.md` | Cópia do relatório na raiz do projeto |

A extração imprime um resumo com contagens, RSIs copiados e caminhos gerados. Ela falha com
mensagem explícita se o caminho informado não parecer um clone do Dumont-Station.

## Desenvolvimento

```powershell
npm.cmd run dev
```

O Vite serve em `http://localhost:5173` por padrão. Para conferir a build de produção:

```powershell
npm.cmd run build
npm.cmd run preview
```

`npm.cmd run check` roda apenas a checagem de tipos (`tsc --noEmit`), incluindo o extrator.
`npm.cmd run build` também faz essa checagem antes de empacotar.

## Rotas

O roteador usa History API (sem `#`). URLs importantes:

| Rota | Conteúdo |
| --- | --- |
| `/` | Início, destaques, grupos e dispensador |
| `/reagentes` | Lista, busca, filtros e ordenação |
| `/reagentes/dylovene` | Detalhe do reagente, efeitos, receitas e árvore de produção |
| `/grupos` | Grupos de reagentes |
| `/grupos/medicina` | Guia imprimível do grupo |
| `/calculadora` | Calculadora de lotes e lista de compras |
| `/favoritos` | Reagentes salvos no navegador |
| `/sobre` | Créditos, licenças e relatório |

Parâmetros de consulta usados pela interface:

- `?q=` — busca (nome pt-BR, id, ingredientes; ignora acentos)
- `?grupo=` — filtro por grupo
- `?abstratos=1` — inclui reagentes abstratos
- `?consumiveis=1` — inclui bebidas/comidas ocultas por padrão
- `?dispensaveis=1` — somente reagentes do dispensador químico
- `?receita=1` — somente reagentes com receita
- `?ordem=` — `nome`, `grupo`, `origem` ou `receitas`
- `?ocultos=1` — mostra os grupos de consumo na página de grupos
- `?reagente=&receita=&qtd=` — estado da calculadora

## Fabricação guiada

Na página de um reagente com receita, o botão **Fabricar** abre um modal para escolher a
quantidade final e a rota. O modal abre com **100u** por padrão; o parâmetro `?qtd=` na URL redefine
a quantidade inicial. O roteiro é montado com os mesmos dados da árvore de produção:

1. uma etapa de preparação agrupa os materiais-base e os catalisadores;
2. cada reação aparece em ordem topológica, com os intermediários primeiro e o lote final por
   último;
3. cada etapa mostra ingredientes, quantidades, temperatura, equipamento declarado,
   catalisadores, rendimento, subprodutos e efeitos da reação.

O avanço funciona por clique, pelas teclas <kbd>←</kbd>/<kbd>→</kbd> (ou <kbd>Espaço</kbd>) e por
swipe. A conclusão mostra o total produzido, materiais-base, catalisadores, recipiente sugerido e
subprodutos, com opção de refazer o lote.

O plano trabalha com **lotes inteiros** e arredonda as doses para cima em unidades inteiras, porque o
ChemDispenser dosa em unidades inteiras. Por isso a produção pode ultrapassar a quantidade desejada:
um pedido de 50u com rendimento de 3u/lote vira 17 lotes e 51u produzidos. As proporções da receita
continuam exatas; o excedente permanece no recipiente.

### Janela sempre no topo e painel reserva

O MVP usa **Document Picture-in-Picture** quando o navegador oferece a API — Chrome e Edge no
desktop, em contexto seguro, após um gesto do usuário. A janela flutuante fica sobre outros apps e
recebe o mesmo CSS e o mesmo tema claro/escuro da página; o tema é sincronizado em tempo real.

Quando a API não está disponível ou a janela é recusada, o roteiro abre em um painel fixo no canto
inferior direito da página. Se a janela PiP for fechada pelo sistema, o painel reaparece na mesma
etapa. O botão interno <kbd>×</kbd> encerra a sessão de fabricação; o botão <kbd>⧉</kbd> do painel
tenta reabrir a janela flutuante.

Limitações da janela:

- o site não controla posição, tamanho ou foco da janela PiP;
- ela não é garantida sobre um jogo em **fullscreen exclusivo**;
- não há atalhos globais enquanto o jogo está em foco;
- o progresso da fabricação não é salvo em `localStorage` — fechar a janela ou recarregar a página
  encerra a sessão.

Os fatos do roteiro vêm de `public/data/chem.json`. Receitas alternativas são escolhidas para o
produto final; os intermediários usam a receita principal de cada reagente.

## Estrutura do projeto

```text
quimica-dumont/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── relatorio.md                 # gerado pelo extrator
├── public/
│   ├── .nojekyll                # GitHub Pages
│   ├── _redirects               # Netlify
│   ├── favicon.svg
│   ├── og-image.jpg             # preview de compartilhamento (Open Graph/Twitter)
│   ├── data/
│   │   ├── chem.json            # gerado
│   │   ├── sprites.json         # gerado
│   │   └── relatorio.md         # gerado
│   └── sprites/<rsi>/           # copiados do fork
├── src/
│   ├── main.ts                  # boot, rotas, eventos globais
│   ├── data.ts                  # carregamento e caches
│   ├── types.ts                 # contrato do chem.json
│   ├── styles.css + styles/     # CSS por área
│   ├── lib/
│   │   ├── router.ts            # History API + base do Vite
│   │   ├── search.ts            # busca sem acento e ranking
│   │   ├── production.ts        # árvore recursiva e lista de compras
│   │   ├── crafting.ts          # roteiro de fabricação a partir da árvore
│   │   ├── fabrication.ts       # modal, Document PiP e painel reserva
│   │   ├── components.ts        # cartões, receitas, planner, sprites
│   │   ├── groups.ts            # rótulos e slugs de grupos
│   │   ├── state.ts             # tema e favoritos (localStorage)
│   │   └── text.ts              # formatação e escape
│   └── views/                   # home, listas, detalhe, grupos, calculadora, sobre
└── tools/
    └── extract-chem.ts          # extrator único
```

## Modelo de dados

`chem.json` tem `meta`, `recipientes`, `categorias_mistura` e `reagentes`.

Cada reagente traz:

- identidade: `id`, `nome`, `descricao`, `grupo`, `origem`, `abstrato`
- apresentação: `cor`, `cor_hex`, `descricao_fisica`, `sabor`
- dispensador: `dispensavel`, `dispensavel_via`
- rastreabilidade: `fonte`, `linha`, `chaves_locale`, `traducao`, `traducao_campos`
- química: `efeitos`, `efeitos_planta`, `limiares`, `receitas`, `usado_em`

Cada receita traz ingredientes (com `catalisador`), produtos, faixa de temperatura, requisitos,
quantização, efeitos da reação, prioridade, impacto e conservação de energia. O campo
`principal` é apenas um critério de apresentação; `total_alternativas` é o total de receitas
daquele produto, incluindo a receita corrente.

A tradução é resolvida por chave de locale. Quando não há pt-BR, o site usa en-US e mostra um
selo; quando não há valor localizado, mostra o id. Campos sem cor ficam `null` e aparecem como
“sem cor” — nenhuma cor é inventada.

## Build e publicação

A base é configurável por `VITE_BASE` e é normalizada para começar e terminar com `/`:

```powershell
# raiz de um domínio ou preview local
npm.cmd run build

# GitHub Pages em https://usuario.github.io/quimica-dumont/
$env:VITE_BASE = '/quimica-dumont/'
npm.cmd run build
Remove-Item Env:VITE_BASE
```

A build:

- copia `dist/index.html` para `dist/404.html`, para deep links no GitHub Pages;
- inclui `public/.nojekyll`;
- inclui `public/_redirects` para Netlify;
- referencia dados e sprites com a base configurada.

As metatags Open Graph/Twitter de `index.html` usam o domínio de produção
`https://chem-dumont.vercel.app/` e a imagem `public/og-image.jpg`. Se o domínio mudar, atualize
também `canonical`, `og:url`, `og:image`, `twitter:image` e os campos `*:alt`.

Para publicar no GitHub Pages, envie o conteúdo de `dist/` para a branch de publicação (ou use
uma action que clone o Dumont-Station, rode `npm ci`, `npm run extract -- --repo <clone>` e
`npm run build` com `VITE_BASE` definido).

> Sempre rode a extração antes da build de publicação. `public/data/chem.json` e os sprites são
> artefatos gerados e não devem ser editados à mão.

## Critérios e limitações

- **Receita principal é heurística.** A interface prioriza a receita cujo id coincide com o
  produto, depois a origem base, depois a ordem do arquivo. Todas as alternativas continuam
  acessíveis na calculadora e na árvore de produção.
- **Overdose é indicativa.** Limiares com mínimo `>= 20u` são rotulados como “possível overdose”
  apenas para leitura rápida; não são uma regra de jogo.
- **Dispensador vem dos jarros.** O fork não expõe `reagentDispenserInventory`; a lista é
  derivada dos `StorageFill` do `ChemDispenser` e documentada no relatório.
- **Sprite é ilustrativo.** A imagem do reagente usa a camada de líquido `beaker5` do próprio
  `beaker.rsi`, desenhada sobre o vidro e tingida pela cor do reagente. Ela não representa a
  cor de comprimidos nem de outros recipientes.
- **Grupos de consumo ficam ocultos por padrão** (`Foods`, `AlcoholicDrinks`,
  `NonAlcoholicDrinks`). Use `?consumiveis=1` ou o alternador na lista.
- **Reagentes abstratos ficam ocultos por padrão** e podem ser incluídos com `?abstratos=1`.
- **Textos de interface e nomes genéricos de recipientes** podem ser traduzidos manualmente;
  isso é apresentação, não fato químico.
- **Tudo roda no navegador.** Favoritos e tema usam `localStorage`; não há backend, login ou
  sincronização entre dispositivos.
- **Cobertura depende do fork.** Reagentes sem receita podem ser registros base, conteúdo obtido
  por outros sistemas ou protótipos não receitáveis. O relatório separa bebidas/comidas ocultas
  de possíveis lacunas de química.

## Créditos

- Dados e sprites: [Project-Dumont/Dumont-Station](https://github.com/Project-Dumont/Dumont-Station),
  sob as licenças indicadas em `public/data/sprites.json` e nos `meta.json` de cada RSI.
- Código do site: este projeto, distribuído para uso comunitário.
- Space Station 14: [space-station-14/space-station-14](https://github.com/space-station-14/space-station-14).

Guia não oficial; não afiliado à Project Dumont nem à Space Wizards Federation.
