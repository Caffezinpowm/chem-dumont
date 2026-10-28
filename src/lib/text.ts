const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

export function attr(value: unknown): string {
  return esc(value).replace(/\n/g, '&#10;');
}

const numberFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const integerFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/**
 * Arredonda para cima em unidades inteiras. O ChemDispenser trabalha com
 * doses inteiras, então nunca exibimos uma quantidade menor do que a necessária.
 * O epsilon evita que ruído de ponto flutuante transforme 5 em 6.
 */
export function ceilUnit(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(0, Math.ceil(value - 1e-9));
}

/** Formata uma quantidade de dispensador, arredondada para cima em unidades inteiras. */
export function fmtDose(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return integerFormatter.format(ceilUnit(value));
}

export function fmt(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return numberFormatter.format(Math.round(value * 100) / 100);
}

export function fmtInt(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return integerFormatter.format(value);
}

export function unit(value: number | null | undefined, suffix = 'u'): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${fmt(value)} ${suffix}`;
}

export function percent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  return `${fmt(value * 100)}%`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(date);
}

export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function slugify(value: string): string {
  return normalizeText(value).replace(/\s+/g, '-');
}

export function capitalizeName(value: string): string {
  if (!value) return value;
  return value.charAt(0).toLocaleUpperCase('pt-BR') + value.slice(1);
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

export function formatRange(min: number | null, max: number | null, suffix = 'u'): string {
  if (min != null && max != null && min !== max) return `${fmt(min)}–${fmt(max)} ${suffix}`;
  if (min != null && max != null) return `${fmt(min)} ${suffix}`;
  if (min != null) return `≥ ${fmt(min)} ${suffix}`;
  if (max != null) return `≤ ${fmt(max)} ${suffix}`;
  return '—';
}

export function formatTemperature(min: number | null, max: number | null): string {
  if (min == null && max == null) return 'Sem restrição de temperatura';
  const kelvin = formatRange(min, max, 'K');
  const celsiusMin = min == null ? null : min - 273.15;
  const celsiusMax = max == null ? null : max - 273.15;
  const celsius = formatRange(celsiusMin, celsiusMax, '°C');
  return `${kelvin} (${celsius})`;
}

export function isSafeHex(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value);
}

/** Retorna uma cor CSS segura para uso em estilos inline. */
export function colorCss(reagentColor: string | null | undefined): string {
  return isSafeHex(reagentColor) ? reagentColor : 'var(--color-unknown)';
}

export function colorWithAlpha(reagentColor: string | null | undefined, alpha: number): string {
  if (!isSafeHex(reagentColor)) return 'transparent';
  const base = reagentColor.slice(0, 7);
  return `${base}${Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0')}`;
}

/** Preto ou branco para texto legível sobre uma cor de preenchimento. */
export function contrastInk(reagentColor: string | null | undefined): string {
  if (!isSafeHex(reagentColor)) return 'var(--ink)';
  const base = reagentColor.slice(1, 7);
  const r = parseInt(base.slice(0, 2), 16);
  const g = parseInt(base.slice(2, 4), 16);
  const b = parseInt(base.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.58 ? '#101512' : '#fdfbf3';
}

/** Converte um hex de 8 dígitos em rgba() para sombras. */
export function hexAlpha(reagentColor: string | null | undefined, alpha: number): string {
  if (!isSafeHex(reagentColor)) return 'rgba(126, 134, 130, 0.2)';
  const base = reagentColor.slice(1, 7);
  const r = parseInt(base.slice(0, 2), 16);
  const g = parseInt(base.slice(2, 4), 16);
  const b = parseInt(base.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function sourcePath(source: string): string {
  return source.replace(/:\d+$/, '');
}

export function sourceLine(source: string): number | null {
  const match = source.match(/:(\d+)$/);
  return match ? Number(match[1]) : null;
}

const REPO_BLOB = 'https://github.com/Project-Dumont/Dumont-Station/blob/dumont/';

export function sourceUrl(source: string): string {
  const file = sourcePath(source);
  const line = sourceLine(source);
  const path = file
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${REPO_BLOB}${path}${line ? `#L${line}` : ''}`;
}

export function shortSource(source: string): string {
  return source.replace('Resources/Prototypes/', '').replace('Resources/Locale/', 'Locale/');
}

const LEGACY_ORIGIN = '_Gabystation';

/** Rótulo público para a pasta legada do repositório. */
export function displayOrigin(origin: string): string {
  return origin === LEGACY_ORIGIN ? 'Dumont Station (legado)' : origin;
}

/** Caminho público sem expor o nome antigo da pasta legada. */
export function displaySource(source: string): string {
  const marker = `${LEGACY_ORIGIN}/`;
  const index = source.indexOf(marker);
  if (index === -1) return source;
  return `Legado · ${source.slice(index + marker.length)}`;
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
