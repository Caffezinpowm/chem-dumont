export type TranslationSource = 'pt-BR' | 'en-US' | 'literal' | 'ausente';
export type TranslationOverall = 'pt-BR' | 'mista' | 'en-US' | 'ausente';

export interface Ingredient {
  id: string;
  nome: string;
  quantidade: number;
  catalisador: boolean;
}

export interface Product {
  id: string;
  nome: string;
  quantidade: number;
}

export interface Requirement {
  id: string;
  nome: string;
}

export interface ReactionEffectText {
  [key: string]: unknown;
}

export interface Recipe {
  id: string;
  origem: string;
  fonte: string;
  ingredientes: Ingredient[];
  produtos: Product[];
  temperatura_min: number | null;
  temperatura_max: number | null;
  requer: Requirement[];
  quantizada: boolean;
  efeitos_da_reacao: string[];
  prioridade: number | null;
  impacto: unknown;
  conserva_energia: boolean;
  produto_alvo: string;
  rendimento: number;
  principal: boolean;
  total_alternativas: number;
}

export interface MetabolismEffect {
  contexto: 'metabolismo' | 'planta';
  grupo_metabolismo?: string;
  grupo_metabolismo_nome?: string;
  taxa?: number | null;
  tipo: string;
  descricao: string;
  condicoes: string[];
  probabilidade: number | null;
  dados: Record<string, unknown>;
}

export interface Threshold {
  reagente: string;
  reagente_nome: string;
  minimo: number | null;
  maximo: number | null;
  grupo_metabolismo: string | null;
  grupo_metabolismo_nome: string | null;
  efeitos: string[];
  ocorrencias: number;
  provavel_overdose: boolean;
}

export interface UsedIn {
  reacao_id: string;
  catalisador: boolean;
  origem: string;
  produtos: Product[];
  fonte: string;
}

export interface Reagent {
  id: string;
  nome: string;
  descricao: string;
  grupo: string | null;
  cor: string | null;
  cor_hex: string | null;
  descricao_fisica: string | null;
  sabor: string | null;
  origem: string;
  abstrato: boolean;
  dispensavel: boolean;
  dispensavel_via: string | null;
  fonte: string;
  linha: number;
  traducao: TranslationOverall;
  traducao_campos: {
    nome: TranslationSource;
    descricao: TranslationSource;
    aparencia_fisica: TranslationSource;
    sabor: TranslationSource;
  };
  chaves_locale: {
    nome: string | null;
    descricao: string | null;
    aparencia_fisica: string | null;
    sabor: unknown;
  };
  efeitos: MetabolismEffect[];
  efeitos_planta: MetabolismEffect[];
  limiares: Threshold[];
  receitas: Recipe[];
  usado_em: UsedIn[];
}

export interface Container {
  id: string;
  nome: string;
  categoria: string;
  capacidade: number;
  unidade: string;
  fonte: string | null;
}

export interface MixingCategory {
  id: string;
  nome: string;
  verbo: string | null;
}

export interface ChemData {
  meta: {
    schema: number;
    gerado_em: string;
    repositorio: string;
    branch: string;
    descricao: string;
    fonte_da_verdade: string;
    arquivos_prototipo_analisados: number;
    arquivos_com_reagentes_ou_reacoes: number;
    locale: {
      pt_br_arquivos: number;
      en_us_arquivos: number;
    };
    contagens: {
      reagentes_total: number;
      reagentes_nao_abstratos: number;
      reagentes_por_grupo: Record<string, number>;
      reacoes_total: number;
      receitas_por_produto: Record<string, number>;
      produtos_com_receitas_alternativas: number;
      ingredientes_inexistentes: number;
      reagentes_sem_cor: number;
      reagentes_dispensaveis: number;
      categorias_de_mistura: number;
    };
    ignorados: {
      reagentes_abstratos: string[];
      reacoes_abstratas: string[];
      reacoes_comentadas: Array<{ file: string; line: number; text: string }>;
    };
    dispenser: {
      entidade: string;
      metodo: string;
      fonte: string;
      reagentes: string[];
      observacao: string;
      problemas: string[];
    };
    grupos_guia: string[];
    aviso_nao_oficial: boolean;
    licenca_codigo: string;
    licenca_assets_padrao: string;
    gerado_com: string;
  };
  recipientes: Container[];
  categorias_mistura: MixingCategory[];
  reagentes: Reagent[];
}

export interface SpriteRsi {
  nome: string;
  caminho: string;
  tamanho: { x: number | null; y: number | null };
  estados: string[];
  licenca: string | null;
  copyright: string | null;
  origem: string;
  meta: {
    version: number | string | null;
    license: string | null;
    copyright: string | null;
    size: { x: number | null; y: number | null } | null;
  };
}

export interface SpriteData {
  meta: {
    gerado_em: string;
    repositorio: string;
    raiz: string;
    observacao: string;
  };
  rsis: SpriteRsi[];
}
