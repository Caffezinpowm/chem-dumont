/**
 * Extrator do Guia de Chem — Dumont Station.
 *
 * Lê APENAS arquivos do repositório informado e escreve em:
 *   public/data/chem.json
 *   public/data/sprites.json
 *   public/data/relatorio.md
 *   public/sprites/<rsi>/
 *   relatorio.md (cópia na raiz do site)
 *
 * Uso:
 *   npm run extract
 *   npm run extract -- --repo "C:\caminho\para\Dumont-Station"
 *
 * O repositório é tratado como somente leitura. Nenhum comando git é executado.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

// Por padrão, usa um clone irmão ao projeto; pode ser trocado com --repo.
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_REPO = path.resolve(PROJECT_ROOT, '..', 'Dumont-Station');
const OUT_DATA = path.join(PROJECT_ROOT, 'public', 'data');
const OUT_SPRITES = path.join(PROJECT_ROOT, 'public', 'sprites');
const REPORT_ROOT = path.join(PROJECT_ROOT, 'relatorio.md');
const REPORT_PUBLIC = path.join(OUT_DATA, 'relatorio.md');
const REPO_URL = 'https://github.com/Project-Dumont/Dumont-Station';

type AnyRecord = Record<string, any>;
type Lang = 'pt-BR' | 'en-US' | 'literal' | 'ausente';

interface FtlEntry {
  text: string;
  file: string;
  line: number;
}

interface SourceBlock {
  type: string;
  startLine: number;
  id: string | null;
  idLine: number;
}

interface MappedSource {
  __file: string;
  __line: number;
}

const toPosix = (p: string) => p.replaceAll('\\', '/');
const relPosix = (root: string, p: string) => toPosix(path.relative(root, p));
const isObject = (v: unknown): v is AnyRecord => !!v && typeof v === 'object' && !Array.isArray(v);
const stripTag = (tag: unknown) => String(tag ?? '').replace(/^!type:/, '');
const finite = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const fmt = (n: number): string => {
  if (!Number.isFinite(n)) return '';
  const rounded = Math.round(n * 100) / 100;
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(rounded);
};

/** Remove as chaves internas de rastreabilidade antes de serializar. */
function publicValue(value: any): any {
  if (Array.isArray(value)) return value.map(publicValue);
  if (isObject(value)) {
    const out: AnyRecord = {};
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith('__')) continue;
      out[k] = publicValue(v);
    }
    return out;
  }
  return value;
}

function walkFiles(root: string, predicate: (file: string) => boolean): string[] {
  const out: string[] = [];
  const visit = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile() && predicate(full)) out.push(full);
    }
  };
  visit(root);
  return out;
}

function parseArgs(): { repo: string; help: boolean } {
  const args = process.argv.slice(2);
  let repo = DEFAULT_REPO;
  let help = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help' || args[i] === '-h') help = true;
    if (args[i] === '--repo') {
      if (!args[i + 1]) throw new Error('--repo exige um caminho.');
      repo = args[++i];
    }
  }
  return { repo: path.resolve(repo), help };
}

function ensureRepo(repo: string) {
  const required = [
    'Resources/Prototypes',
    'Resources/Locale/pt-BR',
    'Resources/Locale/en-US',
    'Resources/Textures/Objects/Specific/Chemistry',
    'Resources/Textures/Objects/Misc/reagent_fillings.rsi',
  ];
  for (const rel of required) {
    if (!fs.existsSync(path.join(repo, rel))) {
      throw new Error(`Repositório inválido: não encontrei ${rel} em ${repo}`);
    }
  }
}

function normalizeFtlValue(raw: string): string {
  let value = raw.trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      value = JSON.parse(value) as string;
    } catch {
      value = value.slice(1, -1);
    }
  }
  return value;
}

/**
 * Parser FTL deliberadamente simples. Os campos usados pelo guia
 * (nomes, descrições, aparências, sabores e verbos de mistura) são de uma linha.
 * Valores multilinha são preservados apenas na primeira linha.
 */
function loadLocale(repo: string, locale: 'pt-BR' | 'en-US') {
  const root = path.join(repo, 'Resources', 'Locale', locale);
  const entries = new Map<string, FtlEntry[]>();
  const duplicates: Array<{ key: string; files: string[] }> = [];
  const files = walkFiles(root, (p) => p.toLowerCase().endsWith('.ftl')).sort();
  for (const file of files) {
    const rel = relPosix(repo, file);
    const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line || /^\s*(#|$)/.test(line)) continue;
      const m = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const key = m[1];
      const value = normalizeFtlValue(m[2]);
      if (!value) continue;
      const item = { text: value, file: rel, line: i + 1 };
      const list = entries.get(key) ?? [];
      list.push(item);
      entries.set(key, list);
    }
  }
  for (const [key, list] of entries) {
    if (list.length > 1) {
      const uniqueFiles = [...new Set(list.map((x) => x.file))];
      if (uniqueFiles.length > 1) duplicates.push({ key, files: uniqueFiles });
    }
  }
  return { root, entries, duplicates, files: files.length };
}

type LocaleDb = ReturnType<typeof loadLocale>;

function originFromPath(rel: string): string {
  const m = rel.match(/^Resources\/Prototypes\/([^/]+)\//);
  if (!m) return 'base';
  return m[1] === 'Reagents' || m[1] === 'Recipes' ? 'base' : m[1];
}

function originFromLocaleFile(file: string): string | null {
  const m = file.match(/Resources\/Locale\/(?:pt-BR|en-US)\/([^/]+)\//);
  if (!m) return null;
  return m[1] === 'reagents' || m[1] === 'guidebook' || m[1] === 'damage' || m[1] === 'flavors' ? null : m[1];
}

function pickLocale(locale: LocaleDb, key: string, origin: string): FtlEntry | null {
  const list = locale.entries.get(key);
  if (!list?.length) return null;
  if (origin !== 'base') {
    const matching = list.find((x) => originFromLocaleFile(x.file) === origin);
    if (matching) return matching;
  }
  return list[0];
}

function resolveText(
  pt: LocaleDb,
  en: LocaleDb,
  key: string | null | undefined,
  origin: string,
): { text: string | null; lang: Lang; key: string | null; file: string | null } {
  if (!key) return { text: null, lang: 'ausente', key: null, file: null };
  const ptEntry = pickLocale(pt, key, origin);
  if (ptEntry) return { text: ptEntry.text, lang: 'pt-BR', key, file: ptEntry.file };
  const enEntry = pickLocale(en, key, origin);
  if (enEntry) return { text: enEntry.text, lang: 'en-US', key, file: enEntry.file };

  // Alguns protótipos antigos usam texto literal em vez de chave FTL.
  const looksLikeKey = /^[a-z0-9_.-]+$/.test(key) && /[-_.]/.test(key);
  if (!looksLikeKey || /\s/.test(key) || /[A-ZÀ-Ý]/.test(key)) {
    return { text: key, lang: 'literal', key, file: null };
  }
  return { text: null, lang: 'ausente', key, file: null };
}

function parseSourceBlocks(text: string): SourceBlock[] {
  const lines = text.split(/\r?\n/);
  const starts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^-\s+type:\s*[A-Za-z0-9_]+\s*(?:#.*)?$/.test(lines[i])) starts.push(i);
  }
  const out: SourceBlock[] = [];
  for (let s = 0; s < starts.length; s++) {
    const start = starts[s];
    const end = s + 1 < starts.length ? starts[s + 1] : lines.length;
    const typeMatch = lines[start].match(/^-\s+type:\s*([A-Za-z0-9_]+)/);
    let id: string | null = null;
    let idLine = start + 1;
    for (let i = start + 1; i < end; i++) {
      const m = lines[i].match(/^\s+id:\s*['"]?([^'"\s#]+)['"]?/);
      if (m) {
        id = m[1];
        idLine = i + 1;
        break;
      }
    }
    out.push({ type: typeMatch?.[1] ?? '?', startLine: start + 1, id, idLine });
  }
  return out;
}

function collectTags(texts: string[]): Set<string> {
  const tags = new Set<string>();
  for (const text of texts) {
    for (const m of text.matchAll(/!([A-Za-z0-9_:.-]+)/g)) tags.add(m[0]);
  }
  return tags;
}

function makeSchema(tags: Set<string>) {
  const types = [...tags].map(
    (tag) =>
      new yaml.Type(tag, {
        kind: 'mapping',
        construct(data: any) {
          return { __tag: tag, ...(isObject(data) ? data : {}) };
        },
      }),
  );
  return yaml.DEFAULT_SCHEMA.extend(types);
}

function deepMerge(base: any, override: any): any {
  if (Array.isArray(base) || Array.isArray(override)) return override ?? base;
  if (isObject(base) && isObject(override)) {
    const out: AnyRecord = { ...base };
    for (const [k, v] of Object.entries(override)) {
      out[k] = k in out ? deepMerge(out[k], v) : v;
    }
    return out;
  }
  return override === undefined ? base : override;
}

function slugSafe(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function humanize(id: string): string {
  return id
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Nomes CSS aceitos nos YAML (por exemplo, `white`) convertidos para hex.
// É apenas normalização de apresentação; a cor original continua em `cor`.
const NAMED_COLORS: Record<string, string> = {
  white: '#ffffff',
  black: '#000000',
  red: '#ff0000',
  tan: '#d2b48c',
  yellow: '#ffff00',
  skyblue: '#87ceeb',
  aquamarine: '#7fffd4',
  gray: '#808080',
  darkred: '#8b0000',
  olive: '#808000',
  saddlebrown: '#8b4513',
  orange: '#ffa500',
  purple: '#800080',
  green: '#008000',
  blue: '#0000ff',
};

function colorToHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  const named = NAMED_COLORS[raw];
  const candidate = named ?? raw;
  const short = candidate.match(/^#([0-9a-f]{3,4})$/i);
  if (short) {
    const expanded = short[1]
      .split('')
      .map((char) => char + char)
      .join('');
    return `#${expanded}`;
  }
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(candidate)) return candidate;
  return null;
}

function resourceLine(rel: string, line: number): string {
  return `${rel}:${line}`;
}

function numberOrNull(value: any): number | null {
  const n = finite(value);
  return n;
}

function numericAmount(value: any): number {
  if (typeof value === 'number') return value;
  if (isObject(value)) return finite(value.amount) ?? 0;
  return finite(value) ?? 0;
}

function wikiEscape(value: any): string {
  return String(value ?? '').replaceAll('|', '\\|').replace(/\r?\n/g, ' ');
}

async function main() {
  const { repo, help } = parseArgs();
  if (help) {
    console.log('Uso: npm run extract -- [--repo "C:\\caminho\\Dumont-Station"]');
    return;
  }
  ensureRepo(repo);
  console.log(`Lendo repositório: ${repo}`);

  fs.mkdirSync(OUT_DATA, { recursive: true });
  fs.mkdirSync(OUT_SPRITES, { recursive: true });

  const pt = loadLocale(repo, 'pt-BR');
  const en = loadLocale(repo, 'en-US');
  console.log(`Locale: ${pt.files} arquivos pt-BR, ${en.files} arquivos en-US.`);

  const protoRoot = path.join(repo, 'Resources', 'Prototypes');
  const allPrototypeFiles = walkFiles(protoRoot, (p) => /\.ya?ml$/i.test(p)).sort();
  const prototypeTexts = new Map<string, string>();
  const relevantPrototypeFiles: string[] = [];
  for (const file of allPrototypeFiles) {
    const text = fs.readFileSync(file, 'utf8');
    if (/^\s*-\s*type:\s*(?:reagent|reaction)\b/m.test(text)) {
      relevantPrototypeFiles.push(file);
      prototypeTexts.set(file, text);
    }
  }

  // Arquivos de apoio usados para dispensador, recipientes e categorias.
  const supportFiles = [
    'Resources/Prototypes/Chemistry/mixing_types.yml',
    'Resources/Prototypes/Chemistry/metabolism_groups.yml',
    'Resources/Prototypes/Entities/Structures/Dispensers/chem.yml',
    'Resources/Prototypes/Entities/Objects/Specific/chemical-containers.yml',
    'Resources/Prototypes/Entities/Objects/Specific/chemistry.yml',
    'Resources/Prototypes/Entities/Objects/Specific/chemistry-bottles.yml',
    'Resources/Prototypes/Entities/Objects/Specific/chemistry-vials.yml',
    'Resources/Prototypes/_Goobstation/Entities/Objects/Specific/Chemistry/chemistry-vials.yml',
    'Resources/Prototypes/Guidebook/chemicals.yml',
  ]
    .map((rel) => path.join(repo, rel))
    .filter((file) => {
      const ok = fs.existsSync(file);
      if (!ok) reportMissingSupport.push(relPosix(repo, file));
      return ok;
    });

  const supportTexts = new Map<string, string>();
  for (const file of supportFiles) {
    const text = fs.readFileSync(file, 'utf8');
    supportTexts.set(file, text);
    prototypeTexts.set(file, text);
  }

  const tags = collectTags([...prototypeTexts.values()]);
  const schema = makeSchema(tags);
  const parseErrors: Array<{ file: string; error: string }> = [];

  interface ParsedProto extends MappedSource {
    [key: string]: any;
  }

  const bySource = new Map<string, ParsedProto[]>();
  for (const file of relevantPrototypeFiles) {
    const rel = relPosix(repo, file);
    const text = prototypeTexts.get(file)!;
    let docs: any;
    try {
      docs = yaml.load(text, { schema });
    } catch (error) {
      parseErrors.push({ file: rel, error: String((error as Error).message ?? error) });
      continue;
    }
    if (!Array.isArray(docs)) continue;
    const blocks = parseSourceBlocks(text);
    const cursors = new Map<string, number>();
    const parsed: ParsedProto[] = [];
    for (const item of docs) {
      if (!isObject(item) || (item.type !== 'reagent' && item.type !== 'reaction')) continue;
      const type = String(item.type);
      let cursor = cursors.get(type) ?? 0;
      let block: SourceBlock | undefined;
      while (cursor < blocks.length) {
        const candidate = blocks[cursor++];
        if (candidate.type === type) {
          block = candidate;
          break;
        }
      }
      cursors.set(type, cursor);
      parsed.push({ ...item, __file: rel, __line: block?.idLine ?? block?.startLine ?? 1 });
    }
    bySource.set(file, parsed);
  }

  const allReagentsRaw: ParsedProto[] = [];
  const allReactionsRaw: ParsedProto[] = [];
  for (const parsed of bySource.values()) {
    for (const item of parsed) {
      if (item.type === 'reagent') allReagentsRaw.push(item);
      if (item.type === 'reaction') allReactionsRaw.push(item);
    }
  }

  // ---------------------------------------------------------------- reagentes
  const duplicateReagents: Array<{ id: string; files: string[] }> = [];
  const reagentRawById = new Map<string, ParsedProto>();
  for (const raw of allReagentsRaw) {
    const id = String(raw.id ?? '');
    if (!id) continue;
    if (reagentRawById.has(id)) {
      const existing = reagentRawById.get(id)!;
      duplicateReagents.push({ id, files: [existing.__file, raw.__file] });
    } else reagentRawById.set(id, raw);
  }

  const resolvedCache = new Map<string, AnyRecord>();
  const parentMissing = new Set<string>();
  const parentCycles: string[][] = [];
  const resolving = new Set<string>();

  function resolveReagent(id: string, stack: string[] = []): AnyRecord {
    if (resolvedCache.has(id)) return resolvedCache.get(id)!;
    if (resolving.has(id)) {
      parentCycles.push([...stack, id]);
      return {};
    }
    const raw = reagentRawById.get(id);
    if (!raw) return {};
    resolving.add(id);
    const parents = Array.isArray(raw.parent) ? raw.parent : raw.parent ? [raw.parent] : [];
    let merged: AnyRecord = {};
    for (const parent of parents) {
      if (!reagentRawById.has(parent)) {
        parentMissing.add(String(parent));
        continue;
      }
      merged = deepMerge(merged, resolveReagent(parent, [...stack, id]));
    }
    const own: AnyRecord = { ...raw };
    for (const key of ['parent', 'type', 'id', 'abstract', '__file', '__line']) delete own[key];
    merged = deepMerge(merged, own);
    merged.id = id;
    merged.__file = raw.__file;
    merged.__line = raw.__line;
    merged.abstract = raw.abstract === true;
    merged.parent = raw.parent;
    resolving.delete(id);
    resolvedCache.set(id, merged);
    return merged;
  }

  for (const id of reagentRawById.keys()) resolveReagent(id);

  // ------------------------------------------------------- recipientes / jugs
  function parseSupport(fileRel: string): any[] {
    const file = path.join(repo, fileRel);
    if (!fs.existsSync(file)) return [];
    try {
      const loaded = yaml.load(fs.readFileSync(file, 'utf8'), { schema });
      return Array.isArray(loaded) ? loaded : [];
    } catch (error) {
      parseErrors.push({ file: fileRel, error: String((error as Error).message ?? error) });
      return [];
    }
  }

  const chemDispenserProtos = parseSupport('Resources/Prototypes/Entities/Structures/Dispensers/chem.yml');
  const containerProtos = [
    ...parseSupport('Resources/Prototypes/Entities/Objects/Specific/chemical-containers.yml'),
    ...parseSupport('Resources/Prototypes/Entities/Objects/Specific/chemistry.yml'),
    ...parseSupport('Resources/Prototypes/Entities/Objects/Specific/chemistry-bottles.yml'),
    ...parseSupport('Resources/Prototypes/Entities/Objects/Specific/chemistry-vials.yml'),
    ...parseSupport('Resources/Prototypes/_Goobstation/Entities/Objects/Specific/Chemistry/chemistry-vials.yml'),
  ].filter((x) => x?.type === 'entity');

  const entityById = new Map<string, AnyRecord>();
  for (const entity of containerProtos) if (entity.id) entityById.set(String(entity.id), entity);

  function inheritedComponents(id: string, stack = new Set<string>()): AnyRecord[] {
    const entity = entityById.get(id);
    if (!entity || stack.has(id)) return [];
    stack.add(id);
    const parents = Array.isArray(entity.parent) ? entity.parent : entity.parent ? [entity.parent] : [];
    let inherited: AnyRecord[] = [];
    for (const parent of parents) inherited = mergeComponents(inherited, inheritedComponents(String(parent), stack));
    const own = Array.isArray(entity.components) ? entity.components : [];
    return mergeComponents(inherited, own);
  }

  function mergeComponents(base: AnyRecord[], overrides: AnyRecord[]): AnyRecord[] {
    const out = base.map((x) => ({ ...x }));
    for (const item of overrides) {
      if (!isObject(item) || !item.type) continue;
      const index = out.findIndex((x) => x.type === item.type);
      if (index >= 0) out[index] = deepMerge(out[index], item);
      else out.push({ ...item });
    }
    return out;
  }

  function maxVolumeFor(id: string): number | null {
    const components = inheritedComponents(id);
    for (const component of components) {
      if (component.type !== 'SolutionContainerManager') continue;
      const solutions = component.solutions;
      if (isObject(solutions)) {
        for (const solution of Object.values(solutions)) {
          const max = numberOrNull((solution as AnyRecord)?.maxVol);
          if (max != null) return max;
        }
      }
      const direct = numberOrNull(component.maxVol);
      if (direct != null) return direct;
    }
    return null;
  }

  const containerLineSources = new Map<string, string>();
  for (const file of [
    'Resources/Prototypes/Entities/Objects/Specific/chemical-containers.yml',
    'Resources/Prototypes/Entities/Objects/Specific/chemistry.yml',
    'Resources/Prototypes/Entities/Objects/Specific/chemistry-bottles.yml',
    'Resources/Prototypes/Entities/Objects/Specific/chemistry-vials.yml',
    'Resources/Prototypes/_Goobstation/Entities/Objects/Specific/Chemistry/chemistry-vials.yml',
  ]) {
    const filePath = path.join(repo, file);
    if (!fs.existsSync(filePath)) continue;
    for (const block of parseSourceBlocks(fs.readFileSync(filePath, 'utf8'))) {
      if (block.id) containerLineSources.set(block.id, resourceLine(file, block.idLine));
    }
  }

  // ASSUNÇÃO de apresentação: nomes em português para recipientes genéricos.
  // As capacidades são lidas do repositório, não digitadas.
  const containerSelection: Array<{ id: string; nome: string; categoria: string }> = [
    { id: 'Beaker', nome: 'Béquer', categoria: 'béquer' },
    { id: 'LargeBeaker', nome: 'Béquer grande', categoria: 'béquer' },
    { id: 'BluespaceBeaker', nome: 'Béquer bluespace', categoria: 'béquer' },
    { id: 'CryostasisBeaker', nome: 'Béquer de criostase', categoria: 'béquer' },
    { id: 'BaseChemistryEmptyVial', nome: 'Ampola', categoria: 'ampola' },
    { id: 'BluespaceChemistryVial', nome: 'Ampola bluespace', categoria: 'ampola' },
    { id: 'BaseChemistryEmptyBottle', nome: 'Frasco', categoria: 'frasco' },
    { id: 'Jug', nome: 'Jug', categoria: 'galão' },
    { id: 'TanqueDeReagenteMelhor', nome: 'Tanque de reagente', categoria: 'tanque' },
    { id: 'BaseSyringe', nome: 'Seringa', categoria: 'seringa' },
    { id: 'Pill', nome: 'Pílula', categoria: 'pílula' },
  ];
  const containers: AnyRecord[] = [];
  for (const sel of containerSelection) {
    const entity = entityById.get(sel.id);
    const capacity = entity ? maxVolumeFor(sel.id) : null;
    if (!entity || capacity == null) {
      reportMissingContainers.push(sel.id);
      continue;
    }
    containers.push({
      id: sel.id,
      nome: sel.nome,
      categoria: sel.categoria,
      capacidade: capacity,
      unidade: 'u',
      fonte: containerLineSources.get(sel.id) ?? null,
    });
  }
  containers.sort((a, b) => a.capacidade - b.capacidade || a.nome.localeCompare(b.nome, 'pt-BR'));

  const dispensable = new Map<string, string>();
  const dispensableIssues: string[] = [];
  const dispenser = chemDispenserProtos.find((x) => x?.type === 'entity' && x.id === 'ChemDispenser');
  if (dispenser) {
    const components = Array.isArray(dispenser.components) ? dispenser.components : [];
    const storage = components.find((c: AnyRecord) => c.type === 'StorageFill');
    const contents = Array.isArray(storage?.contents) ? storage.contents : [];
    for (const entry of contents) {
      const entityId = String(entry?.id ?? entry ?? '');
      if (!entityId) continue;
      const jug = entityById.get(entityId);
      if (!jug) {
        dispensableIssues.push(`Entidade de jug ausente: ${entityId}`);
        continue;
      }
      const comps = inheritedComponents(entityId);
      const scm = comps.find((c) => c.type === 'SolutionContainerManager');
      const solutions = scm?.solutions;
      if (!isObject(solutions)) {
        dispensableIssues.push(`Sem SolutionContainerManager: ${entityId}`);
        continue;
      }
      for (const solution of Object.values(solutions)) {
        const reagents = (solution as AnyRecord)?.reagents;
        if (!Array.isArray(reagents)) continue;
        for (const reagent of reagents) {
          const rid = String(reagent?.ReagentId ?? reagent?.reagentId ?? '');
          if (rid) dispensable.set(rid, `ChemDispenser → ${entityId}`);
        }
      }
    }
  } else {
    dispensableIssues.push('Protótipo ChemDispenser não encontrado em chem.yml.');
  }

  // ------------------------------------------------------------- categorias
  const mixingCategories = new Map<string, { id: string; nome: string; verbo: string | null }>();
  const mixingProtos = parseSupport('Resources/Prototypes/Chemistry/mixing_types.yml');
  for (const mix of mixingProtos) {
    if (!mix?.id) continue;
    const verb = resolveText(pt, en, mix.verbText ?? null, 'base');
    mixingCategories.set(String(mix.id), {
      id: String(mix.id),
      nome: verb.text ?? String(mix.id),
      verbo: mix.verbText ?? null,
    });
  }

  // ------------------------------------------------------------ metabolismo
  const metabolismNames = new Map<string, string>();
  for (const group of parseSupport('Resources/Prototypes/Chemistry/metabolism_groups.yml')) {
    if (!group?.id) continue;
    const label = resolveText(pt, en, group.name ?? null, 'base');
    metabolismNames.set(String(group.id), label.text ?? String(group.id));
  }

  // ------------------------------------------------------------- efeitos
  const unknownEffectTags = new Set<string>();
  const unknownConditionTags = new Set<string>();
  const unknownReactionEffectTags = new Set<string>();
  const thresholdCounts = new Map<string, number>();

  function damageLabel(type: string, group = false): string {
    const key = `${group ? 'damage-group' : 'damage-type'}-${type.toLowerCase()}`;
    return resolveText(pt, en, key, 'base').text ?? type;
  }

  function damageText(damage: any): string {
    if (!isObject(damage)) return 'altera a saúde';
    const parts: string[] = [];
    const add = (map: any, group: boolean) => {
      if (!isObject(map)) return;
      for (const [kind, raw] of Object.entries(map)) {
        const amount = finite(raw);
        if (amount == null || amount === 0) continue;
        const label = damageLabel(kind, group);
        parts.push(amount < 0 ? `cura ${fmt(-amount)} de ${label}` : `causa ${fmt(amount)} de ${label}`);
      }
    };
    add(damage.types, false);
    add(damage.groups, true);
    return parts.length ? parts.join('; ') : 'altera a saúde';
  }

  function thresholdRange(cond: AnyRecord): string {
    const min = finite(cond.min);
    const max = finite(cond.max);
    const cappedMax = max != null && max >= 2_147_483_648 ? null : max;
    if (cappedMax == null) {
      if (min != null) return `≥ ${fmt(min)}u`;
      return 'sem limite superior definido';
    }
    if (min == null || min === 0) return `≤ ${fmt(cappedMax)}u`;
    return `entre ${fmt(min)}u e ${fmt(cappedMax)}u`;
  }

  const reagentName = (id: string): string => {
    const raw = resolvedCache.get(id);
    if (!raw) return id;
    const resolved = resolveText(pt, en, raw.name ?? null, originFromPath(raw.__file));
    return resolved.text ?? id;
  };

  function effectLabel(key: unknown, origin = 'base'): string {
    if (typeof key !== 'string') return String(key ?? '');
    return resolveText(pt, en, key, origin).text ?? key;
  }

  function describeCondition(cond: AnyRecord): string {
    const tag = stripTag(cond.__tag);
    switch (tag) {
      case 'ReagentThreshold': {
        const rid = cond.reagent ? String(cond.reagent) : null;
        const who = rid ? ` de ${reagentName(rid)}` : '';
        return `há ${thresholdRange(cond)}${who} no organismo`;
      }
      case 'BloodReagentThreshold': {
        const rid = cond.reagent ? String(cond.reagent) : null;
        const who = rid ? ` de ${reagentName(rid)}` : '';
        return `há ${thresholdRange(cond)}${who} no sangue`;
      }
      case 'OrganType': {
        const name = String(cond.type ?? 'organismo');
        return cond.shouldHave === false ? `sem o órgão ${name}` : `com o órgão ${name}`;
      }
      case 'MobStateCondition': {
        const state = String(cond.mobstate ?? '');
        const map: Record<string, string> = { Alive: 'vivo', Critical: 'em estado crítico', Dead: 'morto' };
        return `o alvo está ${map[state] ?? state}`;
      }
      case 'Temperature': {
        const min = finite(cond.min);
        const max = finite(cond.max);
        if (min != null && max != null) return `temperatura entre ${fmt(min)} K e ${fmt(max)} K`;
        if (min != null) return `temperatura ≥ ${fmt(min)} K`;
        if (max != null) return `temperatura ≤ ${fmt(max)} K`;
        return 'condição de temperatura';
      }
      case 'TotalDamage': {
        const min = finite(cond.min);
        const max = finite(cond.max);
        if (min != null && max != null) return `dano total entre ${fmt(min)} e ${fmt(max)}`;
        if (min != null) return `dano total ≥ ${fmt(min)}`;
        if (max != null) return `dano total ≤ ${fmt(max)}`;
        return 'condição de dano total';
      }
      case 'TypedDamageThreshold': {
        return `limiar de dano específico (${damageText(cond.damage)})${cond.inverse ? ', invertido' : ''}`;
      }
      case 'StaminaDamageThreshold': {
        return `dano de stamina ${thresholdRange(cond)}`;
      }
      case 'UniqueBloodstreamChemThreshold': {
        return `quantidade de reagentes únicos no sangue ${thresholdRange(cond)}`;
      }
      case 'Hunger': {
        const min = finite(cond.min) ?? 0;
        const max = finite(cond.max);
        if (max == null) return `fome ≥ ${fmt(min)}`;
        return `fome entre ${fmt(min)} e ${fmt(max)}`;
      }
      case 'HasTag': return cond.invert ? `não possui a tag ${cond.tag}` : `possui a tag ${cond.tag}`;
      case 'HasComponentCondition': {
        const components = Array.isArray(cond.components) ? cond.components.map(String).join(', ') : String(cond.components ?? '');
        return `possui o(s) componente(s) ${components}`;
      }
      case 'HasComponentOnEquipmentCondition': {
        const components = Array.isArray(cond.components)
          ? cond.components.map((x: AnyRecord) => x.type ?? JSON.stringify(x)).join(', ')
          : String(cond.components ?? '');
        return cond.invert
          ? `não possui o(s) componente(s) de equipamento ${components}`
          : `possui o(s) componente(s) de equipamento ${components}`;
      }
      case 'PressureThreshold': {
        const min = finite(cond.min);
        const max = finite(cond.max);
        if (min != null && max != null) return `pressão entre ${fmt(min)} e ${fmt(max)} kPa`;
        return 'condição de pressão';
      }
      default:
        unknownConditionTags.add(tag || 'sem tag');
        return `condição não interpretada (\`${tag || 'sem tag'}\`)`;
    }
  }

  function describeConditions(effect: AnyRecord): string[] {
    const list = Array.isArray(effect.conditions) ? effect.conditions : effect.conditions ? [effect.conditions] : [];
    return list.filter(isObject).map(describeCondition);
  }

  function probabilityText(effect: AnyRecord): string {
    const p = finite(effect.probability);
    if (p == null) return '';
    return ` (chance: ${fmt(p * 100)}%)`;
  }

  function effectDescription(effect: AnyRecord): string {
    const tag = stripTag(effect.__tag);
    const chance = probabilityText(effect);
    const num = (key: string) => finite(effect[key]);
    const qty = (key: string) => {
      const n = num(key);
      return n == null ? '?' : fmt(n);
    };
    const reagentLabel = effect.reagent ? reagentName(String(effect.reagent)) : null;
    const add = (text: string) => text + chance;

    switch (tag) {
      case 'HealthChange':
        return add(damageText(effect.damage));
      case 'AdjustReagent':
        return add(
          effect.amount != null && finite(effect.amount)! > 0
            ? `adiciona ${fmt(Math.abs(finite(effect.amount)!))}u de ${reagentLabel ?? 'reagente'}`
            : `remove ${fmt(Math.abs(finite(effect.amount) ?? 0))}u de ${reagentLabel ?? 'reagente'}`,
        );
      case 'AddReagentToBlood':
        return add(`adiciona ${qty('amount')}u de ${reagentLabel ?? 'reagente'} ao sangue`);
      case 'ModifyBloodLevel':
        return add(`altera o volume de sangue em ${effect.amount > 0 ? '+' : ''}${qty('amount')}`);
      case 'ModifyBleedAmount':
        return add(
          finite(effect.amount)! > 0
            ? `aumenta o sangramento em ${qty('amount')}`
            : `reduz o sangramento em ${fmt(Math.abs(finite(effect.amount) ?? 0))}`,
        );
      case 'SatiateThirst':
        return add(`sacia a sede${effect.factor != null ? ` (fator ${fmt(finite(effect.factor)!)})` : ''}`);
      case 'SatiateHunger':
        return add(`sacia a fome${effect.factor != null ? ` (fator ${fmt(finite(effect.factor)!)})` : ''}`);
      case 'Oxygenate':
        return add(`ajusta a oxigenação${effect.factor != null ? ` (fator ${fmt(finite(effect.factor)!)})` : ''}`);
      case 'Jitter':
        return add('causa tremores');
      case 'ChemVomit':
      case 'Vomit':
        return add('provoca vômito');
      case 'Drunk':
        return add(`intoxica${effect.boozePower != null ? ` (poder alcoólico ${fmt(finite(effect.boozePower)!)})` : ''}`);
      case 'Paralyze':
        return add(`paralisa por ${effect.paralyzeTime != null ? fmt(finite(effect.paralyzeTime)!) : '?'} s`);
      case 'TakeStaminaDamage':
        return add(`altera a stamina em ${qty('amount')}${effect.immediate ? ' (imediato)' : ''}`);
      case 'SuppressPain':
        return add(`suprime a dor em ${qty('amount')} por ${effect.time != null ? fmt(finite(effect.time)!) : '?'} s`);
      case 'AdjustPainFeels':
        return add(`ajusta a percepção de dor em ${qty('amount')}`);
      case 'AdjustTemperature':
        return add(`altera a temperatura corporal em ${qty('amount')} K`);
      case 'MovespeedModifier':
      case 'NitriumMovespeedModifier': {
        const walk = finite(effect.walkSpeedModifier);
        const sprint = finite(effect.sprintSpeedModifier);
        const parts: string[] = [];
        if (walk != null) parts.push(`caminhada ×${fmt(walk)}`);
        if (sprint != null) parts.push(`corrida ×${fmt(sprint)}`);
        return add(`multiplica a velocidade (${parts.join(', ') || 'sem valores'})`);
      }
      case 'GenericStatusEffect': {
        const action = String(effect.type ?? 'Add').toLowerCase() === 'remove' ? 'remove' : 'aplica';
        const time = effect.time != null ? ` por ${fmt(finite(effect.time)!)} s` : '';
        return add(`${action} o status ${String(effect.key ?? '?')}${time}`);
      }
      case 'ModifyStatusEffect': {
        const action = String(effect.type ?? 'Add').toLowerCase() === 'remove' ? 'remove' : 'aplica';
        const time = effect.time != null ? ` por ${fmt(finite(effect.time)!)} s` : '';
        return add(`${action} o efeito ${String(effect.effectProto ?? '?')}${time}`);
      }
      case 'PopupMessage': {
        const messages = Array.isArray(effect.messages) ? effect.messages : [effect.messages];
        const text = messages
          .filter(Boolean)
          .map((m: string) => effectLabel(m, originFromPath(effect.__file ?? '')))
          .join(' / ');
        return add(text ? `exibe a mensagem “${text}”` : 'exibe uma mensagem');
      }
      case 'Emote':
        return add(`força o emote ${String(effect.emote ?? '?')}`);
      case 'Electrocute':
        return add('pode eletrocutar');
      case 'Ignite':
        return add('pode incendiar');
      case 'AdjustConsciousness': {
        const amount = finite(effect.amount);
        return add(`ajusta a consciência${amount != null ? ` em ${fmt(amount)}` : ''}`);
      }
      case 'AdjustAlert':
        return add(`${effect.clear ? 'remove' : 'adiciona'} o alerta ${String(effect.alertType ?? '?')}`);
      case 'ModifyLungGas': {
        const ratios = isObject(effect.ratios) ? effect.ratios : {};
        const parts = Object.entries(ratios).map(([gas, value]) => `${fmt(Number(value))} ${gas}`);
        return add(`modifica os gases pulmonares (${parts.join(', ') || 'sem valores'})`);
      }
      case 'ReduceRotting':
        return add(`reduz a decomposição em ${effect.seconds != null ? fmt(finite(effect.seconds)!) : '?'} s`);
      case 'ChemCleanBloodstream':
        return add(`limpa a corrente sanguínea (taxa ${qty('cleanseRate')})`);
      case 'ChemHealEyeDamage':
        return add('cura danos oculares');
      case 'ChemCureDnaDisease':
        return add('cura doenças de DNA');
      case 'ChemMutateDna':
        return add('muta o DNA');
      case 'MutateDiseases':
        return add(`aumenta a taxa de mutação de doenças em ${qty('mutationRate')}`);
      case 'DiseaseProgressChange':
        return add(
          `altera o progresso de doenças ${String(effect.affectedType ?? '')} em ${qty('progressModifier')}`,
        );
      case 'ImmunityModifier':
        return add(
          `modifica a imunidade (ganho ${qty('gainRateModifier')}, força ${qty('strengthModifier')}, duração ${qty('statusLifetime')} s)`,
        );
      case 'ResetNarcolepsy':
        return add('reseta a narcolepsia');
      case 'CureZombieInfection':
        return add(`cura a infecção zumbi${effect.innoculate ? ' e inocula' : ''}`);
      case 'CauseZombieInfection':
        return add('causa infecção zumbi');
      case 'DeCultify':
        return add(`reduz a influência cultista em ${qty('amount')}`);
      case 'ChangeFactionEntityEffect':
        return add(`muda a facção para ${String(effect.newFaction ?? '?')}`);
      case 'SpeciesChange':
        return add(`transforma em ${String(effect.newSpecies ?? 'outra espécie')}`);
      case 'RandomSpeciesChange':
        return add('transforma em uma espécie aleatória');
      case 'SexChange':
        return add('altera o sexo biológico');
      case 'Polymorph':
        return add(`transforma em ${String(effect.prototype ?? 'outro protótipo')}`);
      case 'MakeSentient':
        return add('torna o alvo senciente');
      case 'ToggleCurse':
        return add('alterna uma maldição');
      case 'BlindNonShadowling':
        return add('cega alvos que não sejam shadowlings');
      case 'HealShadowling':
        return add(`cura ${damageText(effect.damage)} (shadowling)`);
      case 'BleedSanguinePerniculate':
        return add('faz sangrar sanguine perniculate');
      case 'ReduceSeizureBuild':
        return add(`reduz a acumulação de convulsão em ${qty('reductionAmount')}`);
      case 'Hunger':
        return add(`aumenta a fome até ${qty('max')}`);
      case 'Breathing':
        return add('afeta a respiração');
      case 'Internals':
        return add(`altera o uso de internos (${effect.usingInternals ? 'ativado' : 'desativado'})`);
      case 'ModifySlimeComponent':
        return add(
          `modifica componentes de slime (bônus ${qty('extractBonus')}, chance ${qty('chanceModifier')})`,
        );
      case 'DropItemsEntityEffect':
        return add('faz o alvo derrubar itens');
      case 'ArtifactUnlock':
        return add('desbloqueia um artefato');
      case 'ArtifactDurabilityRestore':
        return add('restaura a durabilidade de um artefato');
      case 'PlantAdjustHealth':
        return add(`altera a saúde da planta em ${qty('amount')}`);
      case 'PlantAdjustWater':
        return add(`altera a água da planta em ${qty('amount')}`);
      case 'PlantAdjustNutrition':
        return add(`altera a nutrição da planta em ${qty('amount')}`);
      case 'PlantAdjustToxins':
        return add(`altera as toxinas da planta em ${qty('amount')}`);
      case 'PlantAdjustWeeds':
        return add(`altera as ervas daninhas em ${qty('amount')}`);
      case 'PlantAdjustPests':
        return add(`altera as pragas em ${qty('amount')}`);
      case 'PlantAdjustMutationLevel':
        return add(`altera o nível de mutação em ${qty('amount')}`);
      case 'PlantAdjustMutationMod':
        return add(`altera o modificador de mutação em ${qty('amount')}`);
      case 'PlantAdjustPotency':
        return add(`altera a potência da planta em ${qty('amount')}`);
      case 'PlantAffectGrowth':
        return add('afeta o crescimento da planta');
      case 'PlantDestroySeeds':
        return add('destrói sementes da planta');
      case 'PlantRestoreSeeds':
        return add('restaura sementes da planta');
      case 'PlantCryoxadone':
        return add('aplica rejuvenescimento criogênico à planta');
      case 'PlantDiethylamine':
        return add('aplica dietilamina à planta');
      case 'PlantPhalanximine':
        return add('aplica phalanximina à planta');
      case 'RobustHarvest':
        return add('melhora a colheita da planta');
      case 'FlammableReaction': {
        const multiplier = finite(effect.multiplier);
        return add(
          `torna o alvo inflamável${multiplier != null ? ` (multiplicador ×${fmt(multiplier)})` : ''}`,
        );
      }
      case 'ExplosionReactionEffect': {
        const max = finite(effect.maxIntensity);
        const perUnit = finite(effect.intensityPerUnit);
        const parts: string[] = [];
        if (max != null) parts.push(`intensidade máx. ${fmt(max)}`);
        if (perUnit != null) parts.push(`${fmt(perUnit)} por unidade`);
        return add(`causa uma explosão${parts.length ? ` (${parts.join('; ')})` : ''}`);
      }
      case 'AdjustSolutionThermalEnergyEffect': {
        const delta = finite(effect.delta);
        return add(
          `ajusta a energia térmica da solução${delta != null ? ` em ${fmt(delta)}` : ''}${
            effect.scaled ? ' (escalonado)' : ''
          }`,
        );
      }
      case 'RemoveComponentEffect': {
        const localized = effect.locale
          ? resolveText(pt, en, String(effect.locale), originFromPath('')).text
          : null;
        return add(localized ?? `remove o componente ${String(effect.component ?? '?')}`);
      }
      default:
        unknownEffectTags.add(tag || 'sem tag');
        return add(`efeito não traduzido pelo extrator (tag \`${tag || 'sem tag'}\`)`);
    }
  }

  function collectThresholds(effect: AnyRecord, group: string | null, effectText: string): Array<{
    reagente: string;
    reagente_nome: string;
    minimo: number | null;
    maximo: number | null;
    grupo_metabolismo: string | null;
    efeito: string;
    provavel_overdose: boolean;
  }> {
    const out: Array<{
      reagente: string;
      reagente_nome: string;
      minimo: number | null;
      maximo: number | null;
      grupo_metabolismo: string | null;
      efeito: string;
      provavel_overdose: boolean;
    }> = [];
    const visit = (value: any) => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!isObject(value)) return;
      if (stripTag(value.__tag) === 'ReagentThreshold') {
        const rid = String(value.reagent ?? effectOwnerId ?? 'desconhecido');
        const min = finite(value.min);
        const max = finite(value.max);
        const own = !value.reagent || value.reagent === effectOwnerId;
        // ASSUNÇÃO de apresentação: limiar mínimo >= 20u é destacado como possível overdose.
        const probable = own && min != null && min >= 20;
        const key = `${rid}|${min ?? ''}|${max ?? ''}|${group ?? ''}`;
        thresholdCounts.set(key, (thresholdCounts.get(key) ?? 0) + 1);
        out.push({
          reagente: rid,
          reagente_nome: reagentName(rid),
          minimo: min,
          maximo: max,
          grupo_metabolismo: group,
          efeito: effectText,
          provavel_overdose: probable,
        });
        return;
      }
      if (value.conditions) visit(value.conditions);
      if (value.effects) visit(value.effects);
    };
    visit(effect);
    return out;
  }

  let effectOwnerId = '';

  function buildEffects(raw: AnyRecord): {
    efeitos: AnyRecord[];
    efeitos_planta: AnyRecord[];
    limiares: AnyRecord[];
  } {
    effectOwnerId = String(raw.id ?? '');
    const efeitos: AnyRecord[] = [];
    const efeitos_planta: AnyRecord[] = [];
    const thresholdList: AnyRecord[] = [];
    const metab = raw.metabolisms;
    if (isObject(metab)) {
      for (const [group, value] of Object.entries(metab)) {
        if (!isObject(value)) continue;
        const effects = Array.isArray(value.effects) ? value.effects : [];
        const rate = finite(value.rate);
        for (const effect of effects) {
          if (!isObject(effect)) continue;
          const description = effectDescription(effect);
          const item = {
            contexto: 'metabolismo',
            grupo_metabolismo: group,
            grupo_metabolismo_nome: metabolismNames.get(group) ?? group,
            taxa: rate,
            tipo: stripTag(effect.__tag),
            descricao: description,
            condicoes: describeConditions(effect),
            probabilidade: finite(effect.probability),
            dados: publicValue(effect),
          };
          efeitos.push(item);
          thresholdList.push(...collectThresholds(effect, group, description));
        }
      }
    }
    const plant = raw.plantMetabolism;
    const plantEffects = Array.isArray(plant) ? plant : plant ? [plant] : [];
    for (const effect of plantEffects) {
      if (!isObject(effect)) continue;
      const description = effectDescription(effect);
      efeitos_planta.push({
        contexto: 'planta',
        tipo: stripTag(effect.__tag),
        descricao: description,
        condicoes: describeConditions(effect),
        probabilidade: finite(effect.probability),
        dados: publicValue(effect),
      });
    }

    const thresholdMap = new Map<string, AnyRecord>();
    for (const threshold of thresholdList) {
      const key = `${threshold.reagente}|${threshold.minimo ?? ''}|${threshold.maximo ?? ''}|${threshold.grupo_metabolismo ?? ''}`;
      const existing = thresholdMap.get(key);
      if (existing) {
        if (!existing.efeitos.includes(threshold.efeito)) existing.efeitos.push(threshold.efeito);
        existing.ocorrencias++;
        existing.provavel_overdose ||= threshold.provavel_overdose;
      } else {
        thresholdMap.set(key, {
          reagente: threshold.reagente,
          reagente_nome: threshold.reagente_nome,
          minimo: threshold.minimo,
          maximo: threshold.maximo,
          grupo_metabolismo: threshold.grupo_metabolismo,
          grupo_metabolismo_nome: threshold.grupo_metabolismo
            ? metabolismNames.get(threshold.grupo_metabolismo) ?? threshold.grupo_metabolismo
            : null,
          efeitos: [threshold.efeito],
          ocorrencias: 1,
          provavel_overdose: threshold.provavel_overdose,
        });
      }
    }
    return {
      efeitos,
      efeitos_planta,
      limiares: [...thresholdMap.values()].sort(
        (a, b) =>
          (a.reagente === raw.id ? -1 : 0) - (b.reagente === raw.id ? -1 : 0) ||
          (a.minimo ?? 0) - (b.minimo ?? 0),
      ),
    };
  }

  // -------------------------------------------------------------- reações
  const duplicateReactions: Array<{ id: string; files: string[] }> = [];
  const reactionById = new Map<string, ParsedProto>();
  for (const raw of allReactionsRaw) {
    const id = String(raw.id ?? '');
    if (!id) continue;
    if (reactionById.has(id)) {
      duplicateReactions.push({ id, files: [reactionById.get(id)!.__file, raw.__file] });
    } else reactionById.set(id, raw);
  }

  function describeReactionEffect(effect: AnyRecord): string {
    const tag = stripTag(effect.__tag);
    const chance = probabilityText(effect);
    const val = (k: string) => finite(effect[k]);
    switch (tag) {
      case 'ExplosionReactionEffect': {
        const parts: string[] = [];
        if (val('maxIntensity') != null) parts.push(`intensidade máx. ${fmt(val('maxIntensity')!)}`);
        if (val('intensityPerUnit') != null) parts.push(`${fmt(val('intensityPerUnit')!)} por unidade`);
        return `causa uma explosão${parts.length ? ` (${parts.join('; ')})` : ''}${chance}`;
      }
      case 'AreaReactionEffect': {
        const id = String(effect.prototypeId ?? '?');
        const duration = val('duration');
        return `cria uma área do protótipo ${id}${duration != null ? ` por ${fmt(duration)} s` : ''}${chance}`;
      }
      case 'EmpReactionEffect': {
        const range = val('maxRange');
        return `causa um pulso EMP${range != null ? ` (alcance máx. ${fmt(range)})` : ''}${chance}`;
      }
      case 'FlashReactionEffect':
        return `causa um clarão${chance}`;
      case 'CreateEntityReactionEffect':
        return `cria a entidade ${String(effect.entity ?? '?')}${chance}`;
      case 'CreateGas':
        return `libera o gás ${String(effect.gas ?? '?')}${chance}`;
      case 'PopupMessage': {
        const messages = Array.isArray(effect.messages) ? effect.messages : [effect.messages];
        const text = messages
          .filter(Boolean)
          .map((m: string) => effectLabel(m, originFromPath(effect.__file ?? '')))
          .join(' / ');
        return `exibe a mensagem “${text || '?'}”${chance}`;
      }
      case 'AdjustSolutionThermalEnergyEffect':
        return `ajusta a energia térmica da solução em ${val('delta') != null ? fmt(val('delta')!) : '?'}${
          effect.scaled ? ' (escalonado)' : ''
        }${chance}`;
      default:
        unknownReactionEffectTags.add(tag || 'sem tag');
        return `efeito de reação não interpretado (\`${tag || 'sem tag'}\`)${chance}`;
    }
  }

  // Mapeia reações por produto e cria as receitas no formato público.
  const recipesByProduct = new Map<string, AnyRecord[]>();
  const reactionProductNames = new Map<string, string[]>();
  const unknownIngredients: Array<{ reacao: string; ingrediente: string; fonte: string }> = [];
  const unknownProducts: Array<{ reacao: string; produto: string; fonte: string }> = [];
  const missingMixingCategories: Array<{ reacao: string; categoria: string }> = [];

  const allReactionRecords: AnyRecord[] = [];
  const recipeOrder = new Map<AnyRecord, number>();
  let recipeOrdinal = 0;
  for (const raw of reactionById.values()) {
    const id = String(raw.id);
    const reactants = isObject(raw.reactants) ? raw.reactants : {};
    const products = isObject(raw.products) ? raw.products : {};
    const ingredients = Object.entries(reactants).map(([rid, value]) => {
      if (!resolvedCache.has(rid)) {
        unknownIngredients.push({ reacao: id, ingrediente: rid, fonte: resourceLine(raw.__file, raw.__line) });
      }
      return {
        id: rid,
        nome: reagentName(rid),
        quantidade: numericAmount(value),
        catalisador: isObject(value) && value.catalyst === true,
      };
    });
    const output = Object.entries(products).map(([rid, value]) => {
      if (!resolvedCache.has(rid)) {
        unknownProducts.push({ reacao: id, produto: rid, fonte: resourceLine(raw.__file, raw.__line) });
      }
      return {
        id: rid,
        nome: reagentName(rid),
        quantidade: numericAmount(value),
      };
    });
    const requirements = Array.isArray(raw.requiredMixerCategories)
      ? raw.requiredMixerCategories.map((category: any) => String(category))
      : raw.requiredMixerCategories
        ? [String(raw.requiredMixerCategories)]
        : [];
    for (const category of requirements) {
      if (!mixingCategories.has(category)) missingMixingCategories.push({ reacao: id, categoria: category });
    }
    const effects = Array.isArray(raw.effects) ? raw.effects : raw.effects ? [raw.effects] : [];
    const record: AnyRecord = {
      id,
      origem: originFromPath(raw.__file),
      fonte: resourceLine(raw.__file, raw.__line),
      ingredientes: ingredients,
      produtos: output,
      temperatura_min: numberOrNull(raw.minTemp),
      temperatura_max: numberOrNull(raw.maxTemp),
      requer: requirements.map((category: string) => ({
        id: category,
        nome: mixingCategories.get(category)?.nome ?? category,
      })),
      quantizada: raw.quantized === true,
      efeitos_da_reacao: effects.filter(isObject).map(describeReactionEffect),
      prioridade: numberOrNull(raw.priority),
      impacto: raw.impact ?? null,
      conserva_energia: raw.conserveEnergy === true,
    };
    allReactionRecords.push(record);
    reactionProductNames.set(id, output.map((p) => p.id));
    for (const product of output) {
      // Cada produto recebe uma cópia própria da receita: uma única reação pode
      // gerar vários produtos e a escolha de "principal" é feita por produto.
      const productRecipe: AnyRecord = {
        ...record,
        produto_alvo: product.id,
        rendimento: product.quantidade,
        principal: false,
        total_alternativas: 0,
      };
      const list = recipesByProduct.get(product.id) ?? [];
      list.push(productRecipe);
      recipesByProduct.set(product.id, list);
      recipeOrder.set(productRecipe, recipeOrdinal++);
    }
  }

  // A receita "principal" é uma sugestão de leitura, nunca uma verdade de jogo:
  // 1) reação cujo id é igual ao id do produto; 2) origem base; 3) ordem do arquivo.
  for (const [productId, list] of recipesByProduct) {
    list.sort((a, b) => {
      const aExact = a.id === productId ? 0 : 1;
      const bExact = b.id === productId ? 0 : 1;
      const aBase = a.origem === 'base' ? 0 : 1;
      const bBase = b.origem === 'base' ? 0 : 1;
      return aExact - bExact || aBase - bBase || (recipeOrder.get(a)! - recipeOrder.get(b)!);
    });
    for (const recipe of list) recipe.total_alternativas = list.length;
    list[0].principal = true;
  }

  const usedIn = new Map<string, AnyRecord[]>();
  for (const recipe of allReactionRecords) {
    for (const ingredient of recipe.ingredientes) {
      const list = usedIn.get(ingredient.id) ?? [];
      list.push({
        reacao_id: recipe.id,
        catalisador: ingredient.catalisador,
        origem: recipe.origem,
        produtos: recipe.produtos,
        fonte: recipe.fonte,
      });
      usedIn.set(ingredient.id, list);
    }
  }

  // --------------------------------------------------- montagem final reagentes
  const reagents: AnyRecord[] = [];
  const missingColors: string[] = [];
  const duplicateNameKeys: Array<{ id: string; key: string }> = [];

  for (const id of reagentRawById.keys()) {
    const raw = resolvedCache.get(id)!;
    const origin = originFromPath(raw.__file);
    const nameResolved = resolveText(pt, en, raw.name ?? null, origin);
    const descResolved = resolveText(pt, en, raw.desc ?? null, origin);
    const physicalResolved = resolveText(pt, en, raw.physicalDesc ?? null, origin);
    let flavorResolved: { text: string | null; lang: Lang };
    if (Array.isArray(raw.flavor)) {
      const vals = raw.flavor.map((f: any) => resolveText(pt, en, `flavor-base-${String(f)}`, origin).text ?? String(f));
      flavorResolved = { text: vals.join(', '), lang: 'literal' };
    } else if (raw.flavor) {
      let found: { text: string | null; lang: Lang } = { text: null, lang: 'ausente' };
      for (const prefix of ['flavor-base-', 'flavor-complex-', 'flavor-']) {
        const candidate = resolveText(pt, en, `${prefix}${raw.flavor}`, origin);
        if (candidate.text) {
          found = { text: candidate.text, lang: candidate.lang };
          break;
        }
      }
      flavorResolved = found.text ? found : { text: String(raw.flavor), lang: 'literal' };
    } else {
      flavorResolved = { text: null, lang: 'ausente' };
    }

    const nameLang = nameResolved.lang;
    const descLang = descResolved.lang;
    let translationOverall: 'pt-BR' | 'mista' | 'en-US' | 'ausente' = 'ausente';
    if (nameLang === 'pt-BR' && descLang === 'pt-BR') translationOverall = 'pt-BR';
    else if ((nameLang === 'en-US' || nameLang === 'literal') && (descLang === 'en-US' || descLang === 'literal')) {
      translationOverall = 'en-US';
    } else if (nameLang !== 'ausente' || descLang !== 'ausente') translationOverall = 'mista';

    if (raw.name && raw.name === raw.desc) duplicateNameKeys.push({ id, key: String(raw.name) });
    const color = typeof raw.color === 'string' ? raw.color.trim() : null;
    const colorHex = colorToHex(color);
    if (!colorHex) missingColors.push(id);
    if (raw.name && nameResolved.text == null) {
      // Mantém a identificação pelo id, mas registra no relatório.
    }

    const effects = buildEffects(raw);
    const recipes = (recipesByProduct.get(id) ?? []).map((recipe) => ({ ...recipe }));

    reagents.push({
      id,
      nome: nameResolved.text ?? id,
      descricao: descResolved.text ?? '',
      grupo: raw.group ?? null,
      cor: color,
      cor_hex: colorHex,
      descricao_fisica: physicalResolved.text ?? null,
      sabor: flavorResolved.text ?? null,
      origem: origin,
      abstrato: raw.abstract === true,
      dispensavel: dispensable.has(id),
      dispensavel_via: dispensable.get(id) ?? null,
      fonte: resourceLine(raw.__file, raw.__line),
      linha: raw.__line,
      traducao: translationOverall,
      traducao_campos: {
        nome: nameLang,
        descricao: descLang,
        aparencia_fisica: physicalResolved.lang,
        sabor: flavorResolved.lang,
      },
      chaves_locale: {
        nome: raw.name ?? null,
        descricao: raw.desc ?? null,
        aparencia_fisica: raw.physicalDesc ?? null,
        sabor: raw.flavor ?? null,
      },
      efeitos: effects.efeitos,
      efeitos_planta: effects.efeitos_planta,
      limiares: effects.limiares,
      receitas: recipes,
      usado_em: usedIn.get(id) ?? [],
    });
  }

  reagents.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }) || a.id.localeCompare(b.id));

  const visibleGroups = [...new Set(reagents.map((r) => r.grupo).filter(Boolean) as string[])].sort((a, b) =>
    a.localeCompare(b, 'pt-BR'),
  );
  const nonAbstract = reagents.filter((r) => !r.abstrato);
  const dispensableReagents = reagents.filter((r) => r.dispensavel);
  const chemistryGroups = new Set(['Medicine', 'Toxins', 'Narcotics', 'Elements', 'Pyrotechnic', 'Special', 'Biological', 'Botanical', 'Exotic']);
  const suspicious = nonAbstract.filter(
    (r) => !r.dispensavel && r.receitas.length === 0 && (!r.grupo || chemistryGroups.has(r.grupo)),
  );

  // --------------------------------------------------------------- grupos guia
  const guidebookOrder: string[] = [];
  const guidebookProto = parseSupport('Resources/Prototypes/Guidebook/chemicals.yml').find(
    (x) => x?.type === 'guideEntry' && x.id === 'Chemicals',
  );
  if (guidebookProto && Array.isArray(guidebookProto.children)) {
    for (const child of guidebookProto.children) if (typeof child === 'string') guidebookOrder.push(child);
  }
  const extraGroups = visibleGroups.filter((g) => !guidebookOrder.includes(g));
  const groups = [...guidebookOrder, ...extraGroups];

  // --------------------------------------------------------------- comentados
  const commentedReactions: Array<{ file: string; line: number; text: string }> = [];
  for (const file of allPrototypeFiles) {
    const rel = relPosix(repo, file);
    const text = prototypeTexts.get(file) ?? fs.readFileSync(file, 'utf8');
    const lines = text.split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (/^\s*#\s*-\s*type:\s*reaction\b/.test(line)) {
        commentedReactions.push({ file: rel, line: idx + 1, text: line.trim() });
      }
    });
  }

  // ---------------------------------------------------------------- sprites
  const spriteNames = [
    'pills.rsi',
    'pills_canister.rsi',
    'bottle.rsi',
    'vial.rsi',
    'beaker.rsi',
    'beaker_large.rsi',
    'beaker_bluespace.rsi',
    'jug.rsi',
    'syringe.rsi',
    'dropper.rsi',
    'chem_bag.rsi',
    'chemg.rsi',
    'fillings.rsi',
    'reagent_fillings.rsi',
  ];
  const spriteRoots = [
    path.join(repo, 'Resources', 'Textures', 'Objects', 'Specific', 'Chemistry'),
    path.join(repo, 'Resources', 'Textures', 'Objects', 'Misc'),
  ];
  const copiedRoot = path.join(OUT_SPRITES);
  fs.rmSync(copiedRoot, { recursive: true, force: true });
  fs.mkdirSync(copiedRoot, { recursive: true });
  const spriteRecords: AnyRecord[] = [];
  const spriteIssues: string[] = [];
  for (const name of spriteNames) {
    const source = spriteRoots.map((root) => path.join(root, name)).find((p) => fs.existsSync(p));
    if (!source) {
      spriteIssues.push(`RSI ausente: ${name}`);
      continue;
    }
    const dest = path.join(copiedRoot, name);
    fs.cpSync(source, dest, { recursive: true });
    let meta: AnyRecord = {};
    try {
      meta = JSON.parse(fs.readFileSync(path.join(source, 'meta.json'), 'utf8'));
    } catch {
      spriteIssues.push(`meta.json inválido ou ausente: ${name}`);
    }
    const states = Array.isArray(meta.states)
      ? meta.states
          .map((state: any) => (typeof state === 'string' ? state : state?.name))
          .filter((x: any) => typeof x === 'string')
      : [];
    const missingStateFiles = states.filter((state: string) => !fs.existsSync(path.join(source, `${state}.png`)));
    if (missingStateFiles.length) spriteIssues.push(`${name}: estados sem PNG: ${missingStateFiles.join(', ')}`);
    const license = meta.license ?? null;
    const copyright = meta.copyright ?? null;
    if (!license) spriteIssues.push(`${name}: meta.json sem campo license`);
    if (!copyright) spriteIssues.push(`${name}: meta.json sem campo copyright`);
    spriteRecords.push({
      nome: name,
      caminho: `sprites/${name}`,
      tamanho: {
        x: finite(meta.size?.x) ?? null,
        y: finite(meta.size?.y) ?? null,
      },
      estados: states,
      licenca: license,
      copyright,
      origem: relPosix(repo, source),
      meta: {
        version: meta.version ?? null,
        license,
        copyright,
        size: meta.size ?? null,
      },
    });
  }
  const sprites = {
    meta: {
      gerado_em: new Date().toISOString(),
      repositorio: REPO_URL,
      raiz: 'sprites',
      observacao: 'PNGs e meta.json copiados sem conversão nem recoloração.',
    },
    rsis: spriteRecords,
  };

  // ---------------------------------------------------------------- metas
  const generatedAt = new Date().toISOString();
  const totalRecipes = allReactionRecords.length;
  const productsWithAlternatives = [...recipesByProduct.entries()].filter(([, list]) => list.length > 1);
  const dispenserReagents = [...dispensable.keys()].sort();

  const chem = {
    meta: {
      schema: 1,
      gerado_em: generatedAt,
      repositorio: REPO_URL,
      branch: 'dumont',
      descricao: 'Visualizador não oficial de química da Dumont Station.',
      fonte_da_verdade: 'O jogo é a fonte da verdade. Este guia é gerado a partir dos YAML do repositório.',
      arquivos_prototipo_analisados: allPrototypeFiles.length,
      arquivos_com_reagentes_ou_reacoes: relevantPrototypeFiles.length,
      locale: {
        pt_br_arquivos: pt.files,
        en_us_arquivos: en.files,
      },
      contagens: {
        reagentes_total: reagents.length,
        reagentes_nao_abstratos: nonAbstract.length,
        reagentes_por_grupo: Object.fromEntries(
          visibleGroups.map((group) => [group, reagents.filter((r) => r.grupo === group).length]),
        ),
        reacoes_total: totalRecipes,
        receitas_por_produto: Object.fromEntries(
          [...recipesByProduct.entries()].map(([id, list]) => [id, list.length]),
        ),
        produtos_com_receitas_alternativas: productsWithAlternatives.length,
        ingredientes_inexistentes: unknownIngredients.length,
        reagentes_sem_cor: missingColors.length,
        reagentes_dispensaveis: dispensableReagents.length,
        categorias_de_mistura: mixingCategories.size,
      },
      ignorados: {
        reagentes_abstratos: reagents.filter((r) => r.abstrato).map((r) => r.id),
        reacoes_abstratas: allReactionsRaw.filter((r) => r.abstract === true).map((r) => r.id),
        reacoes_comentadas: commentedReactions,
      },
      dispenser: {
        entidade: 'ChemDispenser',
        metodo: 'jugs no StorageFill do dispensador',
        fonte: 'Resources/Prototypes/Entities/Structures/Dispensers/chem.yml',
        reagentes: dispenserReagents,
        observacao:
          'Neste fork não existe um protótipo reagentDispenserInventory; o dispensador químico abastece seus frascos (jugs) via StorageFill.',
        problemas: dispensableIssues,
      },
      grupos_guia: groups,
      aviso_nao_oficial: true,
      licenca_codigo: 'AGPL-3.0-or-later',
      licenca_assets_padrao: 'CC-BY-SA-3.0 (ver sprites.json/meta.json)',
      gerado_com: 'tools/extract-chem.ts',
    },
    recipientes: containers,
    categorias_mistura: [...mixingCategories.values()],
    reagentes: reagents,
  };

  // --------------------------------------------------------------- relatório
  const missingPt = nonAbstract.filter(
    (r) => r.traducao_campos.nome !== 'pt-BR' || r.traducao_campos.descricao !== 'pt-BR',
  );
  const effectTags = new Set<string>();
  for (const r of reagents) for (const e of r.efeitos) effectTags.add(e.tipo);
  const conditionTags = new Set<string>();
  const collectConditionTags = (value: any) => {
    if (Array.isArray(value)) value.forEach(collectConditionTags);
    else if (isObject(value)) {
      if (value.__tag) conditionTags.add(stripTag(value.__tag));
      for (const v of Object.values(value)) collectConditionTags(v);
    }
  };
  for (const r of reagents) for (const e of r.efeitos) collectConditionTags(e.condicoesRaw ?? []);
  // O relatório usa as tags desconhecidas registradas durante a descrição.
  const inventoryNoRecipe = nonAbstract.filter((r) => !r.dispensavel && r.receitas.length === 0);
  const hiddenConsumableGroups = new Set(['Foods', 'AlcoholicDrinks', 'NonAlcoholicDrinks']);
  const inventoryConsumables = inventoryNoRecipe.filter((r) => hiddenConsumableGroups.has(r.grupo ?? ''));
  const inventoryReview = inventoryNoRecipe.filter((r) => !hiddenConsumableGroups.has(r.grupo ?? ''));
  const inventoryObservation = (r: (typeof inventoryNoRecipe)[number]): string => {
    if (hiddenConsumableGroups.has(r.grupo ?? '')) return 'bebida/comida — oculta por padrão';
    if (chemistryGroups.has(r.grupo ?? '')) return '**suspeito** — grupo químico sem receita';
    if (!r.grupo) return 'sem grupo no YAML — revisar';
    return 'fora dos grupos de química — revisar';
  };
  const tableRows = (rows: string[][]) =>
    ['| ' + rows[0].join(' | ') + ' |', '| ' + rows[0].map(() => '---').join(' | ') + ' |', ...rows.slice(1).map((r) => `| ${r.join(' | ')} |`)].join('\n');
  const reportOrigin = (origin: string): string =>
    origin === '_Gabystation' ? 'Dumont Station (legado)' : origin;
  const reportSource = (source: string): string => {
    const marker = '_Gabystation/';
    const index = source.indexOf(marker);
    return index === -1 ? source : `Legado · ${source.slice(index + marker.length)}`;
  };

  const report: string[] = [];
  report.push('# Relatório de extração — Guia de Chem');
  report.push('');
  report.push(`- **Gerado em:** ${generatedAt}`);
  report.push(`- **Repositório:** ${path.basename(repo)}`);
  report.push(`- **Branch de referência:** dumont`);
  report.push(`- **Arquivos YAML analisados:** ${allPrototypeFiles.length}`);
  report.push(`- **Arquivos com reagentes/receitas:** ${relevantPrototypeFiles.length}`);
  report.push('');
  report.push('## Resumo');
  report.push('');
  report.push(`- Reagentes encontrados: **${reagents.length}** (${nonAbstract.length} não abstratos, ${reagents.filter((r) => r.abstrato).length} abstratos).`);
  report.push(`- Reações encontradas: **${totalRecipes}** (${allReactionsRaw.filter((r) => r.abstract === true).length} abstratas; ${commentedReactions.length} reações comentadas foram ignoradas).`);
  report.push(`- Reagentes dispensáveis pelo dispensador químico: **${dispensableReagents.length}**.`);
  report.push(`- Receitas com ingrediente inexistente: **${unknownIngredients.length}**.`);
  report.push(`- Reagentes sem cor: **${missingColors.length}**.`);
  report.push(`- Produtos com mais de uma receita: **${productsWithAlternatives.length}**.`);
  report.push(`- Reagentes não abstratos sem receita e não dispensáveis: **${inventoryNoRecipe.length}** (${inventoryConsumables.length} bebidas/comidas ocultas por padrão; ${inventoryReview.length} fora delas para revisão, dos quais ${suspicious.length} em grupos típicos de química ou sem grupo).`);
  report.push('');
  report.push('## 1. Cobertura por origem');
  report.push('');
  const originCounts = new Map<string, { r: number; x: number }>();
  for (const reagent of reagents) {
    const c = originCounts.get(reagent.origem) ?? { r: 0, x: 0 };
    c.r++;
    originCounts.set(reagent.origem, c);
  }
  for (const recipe of allReactionRecords) {
    const c = originCounts.get(recipe.origem) ?? { r: 0, x: 0 };
    c.x++;
    originCounts.set(recipe.origem, c);
  }
  report.push(tableRows([['Origem', 'Reagentes', 'Reações'], ...[...originCounts.entries()].sort().map(([o, c]) => [reportOrigin(o), String(c.r), String(c.x)])]));
  report.push('');
  report.push('> A origem legada é exibida como **Dumont Station (legado)**; os caminhos completos permanecem nos dados e nos links dos YAMLs.');
  report.push('');
  report.push('## 2. Cobertura de tradução pt-BR');
  report.push('');
  report.push(`Reagentes não abstratos com nome ou descrição não vindos do pt-BR: **${missingPt.length}**. O site usa fallback en-US e mostra um selo de idioma; os itens sem nenhuma chave localizada aparecem com o id.`);
  report.push('');
  if (missingPt.length) {
    report.push(
      tableRows([
        ['Reagente', 'Nome', 'Descrição', 'Origem', 'Fonte'],
        ...missingPt.map((r) => [
          `\`${r.id}\``,
          r.traducao_campos.nome === 'pt-BR' ? 'pt-BR' : r.traducao_campos.nome,
          r.traducao_campos.descricao === 'pt-BR' ? 'pt-BR' : r.traducao_campos.descricao,
          reportOrigin(r.origem),
          `\`${reportSource(r.fonte)}\``,
        ]),
      ]),
    );
  }
  report.push('');
  report.push('## 3. Reagentes sem receita e não dispensáveis');
  report.push('');
  report.push('A lista reúne **todos** os reagentes não abstratos sem receita e fora do dispensador. A coluna “Classificação” separa bebidas/comidas ocultas por padrão dos registros que merecem revisão (sem grupo no YAML, fora dos grupos de química ou em grupo químico sem reação).');
  report.push('');
  report.push('> “Sem receita” não significa erro de extração: o protótipo pode ser obtido por outro sistema, ser apenas um registro base ou depender de conteúdo não prototipado. Abstratos e reagentes do dispensador ficam fora desta seção; bebidas/comidas continuam acessíveis pela lista completa do site.');
  report.push('');
  if (inventoryNoRecipe.length) {
    report.push(
      tableRows([
        ['Reagente', 'Grupo', 'Origem', 'Fonte', 'Classificação'],
        ...inventoryNoRecipe.map((r) => [
          `\`${r.id}\` — ${wikiEscape(r.nome)}`,
          r.grupo ?? '(sem grupo)',
          reportOrigin(r.origem),
          `\`${reportSource(r.fonte)}\``,
          inventoryObservation(r),
        ]),
      ]),
    );
  } else report.push('Nenhum.');
  report.push('');
  report.push('## 4. Reagentes sem cor');
  report.push('');
  report.push(missingColors.length ? missingColors.map((id) => `- \`${id}\``).join('\n') : 'Nenhum.');
  report.push('');
  report.push('## 5. IDs duplicados');
  report.push('');
  report.push(`- Reagentes: ${duplicateReagents.length ? duplicateReagents.map((d) => `\`${d.id}\` (${d.files.join(', ')})`).join('; ') : 'nenhum'}.`);
  report.push(`- Reações: ${duplicateReactions.length ? duplicateReactions.map((d) => `\`${d.id}\` (${d.files.join(', ')})`).join('; ') : 'nenhum'}.`);
  report.push('');
  report.push('## 6. Reações desativadas / ignoradas');
  report.push('');
  report.push(`- Reações com \`abstract: true\`: ${allReactionsRaw.filter((r) => r.abstract === true).length}.`);
  if (commentedReactions.length) {
    report.push('- Reações comentadas no YAML (não entram no JSON):');
    for (const item of commentedReactions) report.push(`  - \`${item.file}:${item.line}\` — \`${item.text}\``);
  } else report.push('- Nenhuma reação comentada encontrada.');
  report.push('');
  report.push('## 7. Receitas com ingrediente inexistente');
  report.push('');
  if (unknownIngredients.length) {
    report.push(
      tableRows([
        ['Reação', 'Ingrediente', 'Fonte'],
        ...unknownIngredients.map((i) => [`\`${i.reacao}\``, `\`${i.ingrediente}\``, `\`${i.fonte}\``]),
      ]),
    );
  } else report.push('Nenhuma.');
  report.push('');
  report.push('## 8. Receitas com produto inexistente');
  report.push('');
  report.push(unknownProducts.length ? unknownProducts.map((i) => `- \`${i.reacao}\` produz \`${i.produto}\` (${i.fonte})`).join('\n') : 'Nenhuma.');
  report.push('');
  report.push('## 9. Tags / efeitos não interpretados');
  report.push('');
  report.push(`- Tags de efeito de metabolismo sem tradução no extrator: ${unknownEffectTags.size}`);
  if (unknownEffectTags.size) report.push([...unknownEffectTags].sort().map((t) => `  - \`${t}\``).join('\n'));
  report.push(`- Tags de condição sem tradução: ${unknownConditionTags.size}`);
  if (unknownConditionTags.size) report.push([...unknownConditionTags].sort().map((t) => `  - \`${t}\``).join('\n'));
  report.push(`- Tags de efeito de reação sem tradução: ${unknownReactionEffectTags.size}`);
  if (unknownReactionEffectTags.size) report.push([...unknownReactionEffectTags].sort().map((t) => `  - \`${t}\``).join('\n'));
  report.push('');
  report.push(`> Observação: há ${effectTags.size} tags de efeito distintas no metabolismo. As que não aparecem acima receberam descrição legível; todas as receitas mostram a tag crua no JSON quando aplicável.`);
  report.push('');
  report.push('## 10. Receitas alternativas');
  report.push('');
  if (productsWithAlternatives.length) {
    report.push('O extrator mantém **todas** as reações por produto. A primeira é marcada como `principal` apenas para a árvore/calculadora; alternativas aparecem na página do reagente.');
    report.push('');
    for (const [product, list] of productsWithAlternatives.sort((a, b) => a[0].localeCompare(b[0]))) {
      report.push(`- **${product}** — ${list.map((r) => `\`${r.id}\` (${reportOrigin(r.origem)})`).join(', ')}`);
    }
  } else report.push('Nenhuma.');
  report.push('');
  report.push('## 11. Dispensador de química');
  report.push('');
  report.push('- **Descoberta relevante:** este fork não possui um protótipo `reagentDispenserInventory` no caminho do dispensador químico. O `ChemDispenser` usa `StorageFill` com frascos (`Jug...`) e o inventário é derivado do conteúdo desses frascos.');
  report.push(`- Reagentes dispensáveis encontrados: ${dispenserReagents.map((id) => `\`${id}\``).join(', ') || 'nenhum'}.`);
  if (dispensableIssues.length) report.push(`- Problemas: ${dispensableIssues.map(wikiEscape).join('; ')}`);
  report.push('');
  report.push('## 12. Sprites');
  report.push('');
  report.push(`- RSIs copiados: ${spriteRecords.length}.`);
  if (spriteIssues.length) report.push(spriteIssues.map((i) => `- ${wikiEscape(i)}`).join('\n'));
  else report.push('- Todos os metas e estados esperados foram encontrados.');
  report.push('');
  report.push('## 13. Observações de parsing e suposições');
  report.push('');
  report.push('- `!type:...` foi preservado com um schema YAML tolerante; tags desconhecidas não quebram a leitura.');
  report.push('- Herança de reagentes resolvida recursivamente. `abstract: true` não é herdado; o campo `abstract` do próprio protótipo é respeitado.');
  report.push('- A herança de componentes de entidades foi resolvida localmente para obter as capacidades dos recipientes.');
  report.push('- **ASSUNÇÃO:** a receita `principal` é apenas uma preferência de exibição (id igual ao produto, depois origem base e ordem do arquivo), não uma afirmação de que seja a melhor rota.');
  report.push('- **ASSUNÇÃO:** limiar de `ReagentThreshold` com mínimo ≥ 20u é exibido como “possível overdose” — é um destaque heurístico, não uma classificação do jogo.');
  report.push('- **ASSUNÇÃO:** nomes de categorias da interface e dos recipientes genéricos foram traduzidos manualmente no front-end/extrator; os fatos químicos, receitas e cores vêm do repositório.');
  report.push(`- Erros de parsing: ${parseErrors.length ? parseErrors.map((e) => `\`${e.file}\`: ${e.error}`).join('; ') : 'nenhum'}.`);
  if (parentMissing.size) report.push(`- Pais de reagentes ausentes: ${[...parentMissing].map((x) => `\`${x}\``).join(', ')}.`);
  if (parentCycles.length) report.push(`- Ciclos de herança: ${parentCycles.map((c) => c.join(' → ')).join('; ')}.`);
  if (missingMixingCategories.length) report.push(`- Categorias de mistura ausentes: ${missingMixingCategories.map((x) => `\`${x.reacao}:${x.categoria}\``).join(', ')}.`);
  if (reportMissingSupport.length) report.push(`- Arquivos de apoio não encontrados: ${reportMissingSupport.map((x) => `\`${x}\``).join(', ')}.`);
  if (reportMissingContainers.length) report.push(`- Recipientes não encontrados/sem capacidade: ${reportMissingContainers.map((x) => `\`${x}\``).join(', ')}.`);
  report.push('');
  report.push('## 14. Chaves de locale duplicadas');
  report.push('');
  const dupCount = pt.duplicates.length + en.duplicates.length;
  if (dupCount) {
    for (const dup of pt.duplicates.slice(0, 40)) report.push(`- pt-BR \`${dup.key}\`: ${dup.files.map(wikiEscape).join(', ')}`);
    for (const dup of en.duplicates.slice(0, 40)) report.push(`- en-US \`${dup.key}\`: ${dup.files.map(wikiEscape).join(', ')}`);
    if (dupCount > 80) report.push(`- … e mais ${dupCount - 80} chaves duplicadas.`);
  } else report.push('Nenhuma.');
  report.push('');
  report.push('## 15. Receitas por origem');
  report.push('');
  report.push(tableRows([['Origem', 'Reações'], ...[...originCounts.entries()].sort().map(([o, c]) => [reportOrigin(o), String(c.x)])]));
  report.push('');

  const reportText = report.join('\n');
  fs.writeFileSync(REPORT_ROOT, reportText, 'utf8');
  fs.writeFileSync(REPORT_PUBLIC, reportText, 'utf8');
  fs.writeFileSync(path.join(OUT_DATA, 'chem.json'), JSON.stringify(chem, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT_DATA, 'sprites.json'), JSON.stringify(sprites, null, 2), 'utf8');

  const counts = chem.meta.contagens;
  console.log('');
  console.log('Extração concluída.');
  console.log(`  Reagentes: ${counts.reagentes_total} (${counts.reagentes_nao_abstratos} não abstratos)`);
  console.log(`  Reações: ${counts.reacoes_total}`);
  console.log(`  Dispensáveis: ${counts.reagentes_dispensaveis}`);
  console.log(`  Receitas alternativas: ${counts.produtos_com_receitas_alternativas} produtos`);
  console.log(`  Sem tradução pt-BR: ${missingPt.length}`);
  console.log(`  RSIs copiados: ${spriteRecords.length}`);
  console.log(`  Relatório: ${relPosix(PROJECT_ROOT, REPORT_ROOT)}`);
  console.log(`  Dados: ${relPosix(PROJECT_ROOT, path.join(OUT_DATA, 'chem.json'))}`);
}

const reportMissingSupport: string[] = [];
const reportMissingContainers: string[] = [];

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
