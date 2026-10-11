/**
 * Палитры оформления.
 *
 * Палитра меняет только цвета — соотношение их светлоты всюду одно и то же:
 * фон самый тёмный, текст самый светлый, акцент лежит между ними. Поэтому
 * переключение не ломает вёрстку и не меняет читаемость, а меняет настроение.
 *
 * Три цвета в swatch — фон, акцент и текст — этого достаточно, чтобы
 * отличить палитру, не открывая её.
 */
export interface Palette {
  id: string
  name: string
  /** Что видно на кружке: фон, акцент, текст. */
  swatch: [string, string, string]
}

export const PALETTES: Palette[] = [
  { id: 'gold', name: 'Золото', swatch: ['#0d1017', '#d4af37', '#e6ebf5'] },
  { id: 'blood', name: 'Кровь', swatch: ['#12090b', '#c4453c', '#f2e4e6'] },
  { id: 'emerald', name: 'Изумруд', swatch: ['#07110e', '#3fae7d', '#e0f0e8'] },
  { id: 'ice', name: 'Лёд', swatch: ['#08111a', '#3fa9d4', '#e2eff7'] },
  { id: 'amethyst', name: 'Аметист', swatch: ['#0f0a18', '#9a6bd4', '#ece5f7'] },
  { id: 'coal', name: 'Уголь', swatch: ['#0e0e0f', '#d98324', '#ecebe9'] },
]

export const DEFAULT_PALETTE = PALETTES[0].id

const KEY = 'pp:palette'

export function loadPalette(): string {
  if (typeof localStorage === 'undefined') return DEFAULT_PALETTE
  const v = localStorage.getItem(KEY)
  return PALETTES.some((p) => p.id === v) ? (v as string) : DEFAULT_PALETTE
}

export function applyPalette(id: string): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.palette = id
  try {
    localStorage.setItem(KEY, id)
  } catch {
    /* приватный режим */
  }
}
