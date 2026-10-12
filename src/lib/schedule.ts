/**
 * Даты и календарь для раздела «Расписание».
 *
 * Всё считается в местном времени и в строковом виде YYYY-MM-DD: такой вид
 * не зависит от часового пояса, в отличие от Date.toISOString(), который
 * на востоке сдвигает дату на день назад. Ключ дня в базе обязан быть тем
 * самым, который человек видит в календаре.
 */
import type { DayPrime, PrimeRange, PrimeWindow, Schedule } from '@/types'

const МЕСЯЦЫ = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
]
const МЕСЯЦЫ_РОД = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

/** Понедельник первым — так календарь и привычен. */
export const ДНИ_НЕДЕЛИ = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

function pad(n: number): string {
  return n < 10 ? '0' + n : String(n)
}

/** Дата в виде YYYY-MM-DD по местному времени. */
export function isoKey(дата: Date): string {
  return `${дата.getFullYear()}-${pad(дата.getMonth() + 1)}-${pad(дата.getDate())}`
}

/** Разбор YYYY-MM-DD в местную дату, без сдвига пояса. */
export function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

/** Сдвиг на n дней. */
export function addDays(дата: Date, n: number): Date {
  const копия = new Date(дата.getTime())
  копия.setDate(копия.getDate() + n)
  return копия
}

export function addMonths(дата: Date, n: number): Date {
  const копия = new Date(дата.getFullYear(), дата.getMonth() + n, 1)
  return копия
}

export function isoToday(): string {
  return isoKey(new Date())
}

/** Понедельник недели, в которую попала дата. */
function понедельникНедели(дата: Date): Date {
  const д = дата.getDay()
  // getDay: 0 — воскресенье. Сдвигаем так, чтобы понедельник стал нулём.
  return addDays(дата, д === 0 ? -6 : 1 - д)
}

export interface DayCell {
  key: string
  дата: Date
  /** Месяц, к которому относится клетка: 0–11. */
  месяц: number
  /** День другого месяца — показывается тусклым. */
  чужой: boolean
  сегодня: boolean
}

/**
 * Сетка месяца — всегда полные недели, от понедельника до воскресенья.
 *
 * Крайние дни соседних месяцев в сетке нужны: без них не видно, что
 * первого числа прайм уже шёл или что последнего воскресенья продлится
 * на понедельник. Гасим их только цветом, но оставляем нажимаемыми —
 * выбрать диапазон, начавшийся в прошлом месяце, должно быть можно.
 */
export function monthGrid(месяц: Date): DayCell[] {
  const первый = new Date(месяц.getFullYear(), месяц.getMonth(), 1)
  const начало = понедельникНедели(первый)
  const клетки: DayCell[] = []
  const сегодня = isoToday()
  for (let i = 0; i < 42; i++) {
    const d = addDays(начало, i)
    const key = isoKey(d)
    клетки.push({
      key,
      дата: d,
      месяц: d.getMonth(),
      чужой: d.getMonth() !== месяц.getMonth(),
      сегодня: key === сегодня,
    })
  }
  // Хвостовую неделю убираем, если весь месяц в неё не попал: пустая
  // полоса под календарём ничего не говорит и только занимает место.
  const всеЧужие = клетки.slice(35).every((к) => к.чужой)
  return всеЧужие ? клетки.slice(0, 35) : клетки.slice(0, 42)
}

/** «5 марта», «29 февраля 2028» — с годом только когда он отличается. */
export function formatDate(дата: Date, сГодом = false): string {
  const база = `${дата.getDate()} ${МЕСЯЦЫ_РОД[дата.getMonth()]}`
  return сГодом ? `${база} ${дата.getFullYear()}` : база
}

/** Название месяца с годом для заголовка календаря. */
export function formatMonth(дата: Date): string {
  return `${МЕСЯЦЫ[дата.getMonth()]} ${дата.getFullYear()}`
}

/** «20:00», «9:05» — минуты от полуночи в привычном виде. */
export function formatMinutes(минут: number): string {
  const m = Math.max(0, Math.min(24 * 60, Math.round(минут)))
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

/** Разбор «20:30» в минуты. Неверное — как 0. */
export function parseMinutes(текст: string): number {
  const [ч, мин] = текст.split(':').map(Number)
  if (!Number.isFinite(ч)) return 0
  return Math.max(0, Math.min(24 * 60, ч * 60 + (Number.isFinite(мин) ? мин : 0)))
}

/**
 * Что показывать на день.
 *
 * null — отменён, окно — назначено. Отличить «отменён» от «не назначено»
 * приходится потому, что это разные вещи: на отменённый день прайм не
 * собираются, а на неназначенный просто ещё не решили.
 */
export type PrimeState =
  | { kind: 'нет'; source: null }
  | { kind: 'окно'; window: PrimeWindow; source: 'диапазон' | 'день' }
  | { kind: 'отменён'; source: 'день' }

/** Ключ лежит в days: день решает сам, иначе ищем диапазон. */
export function primeOf(schedule: Schedule, key: string): PrimeState {
  if (Object.prototype.hasOwnProperty.call(schedule.days, key)) {
    const своё = schedule.days[key]
    if (своё === null) return { kind: 'отменён', source: 'день' }
    return { kind: 'окно', window: своё, source: 'день' }
  }
  const диапазон = rangeOf(schedule.ranges, key)
  if (диапазон) return { kind: 'окно', window: диапазон.window, source: 'диапазон' }
  return { kind: 'нет', source: null }
}

/** Первый диапазон, накрывающий дату. Диапазоны не пересекаются. */
export function rangeOf(ranges: PrimeRange[], key: string): PrimeRange | null {
  for (const r of ranges) {
    if (key >= r.from && key <= r.to) return r
  }
  return null
}

/**
 * Назначение окна на диапазон дат.
 *
 * Пересекающиеся диапазоны не остаются: иначе два прайма на один день
 * решались бы порядком в массиве, и человек получил бы не тот, который
 * ставил последним. Старые накрытые диапазоны убираются, а новый занимает
 * их место — так видно, что время занято, и не остаётся тайных правил.
 */
export function setRange(
  ranges: PrimeRange[],
  заменитьId: string,
  from: string,
  to: string,
  window: PrimeWindow,
  новыйId: string,
): PrimeRange[] {
  const пересекается = (r: PrimeRange) => r.from <= to && r.to >= from
  const остальные = ranges.filter((r) => r.id !== заменитьId && !пересекается(r))
  const новый: PrimeRange = { id: новыйId, from, to, window }
  return [...остальные, новый].sort((a, b) => a.from.localeCompare(b.from))
}

/** Убирает диапазон. Дни, что он держал, остаются как есть. */
export function removeRange(ranges: PrimeRange[], id: string): PrimeRange[] {
  return ranges.filter((r) => r.id !== id)
}

/** Переопределения для набора дней; ключ сохраняется и для отмены. */
export function setDays(
  days: Record<string, DayPrime>,
  keys: string[],
  значение: DayPrime,
): Record<string, DayPrime> {
  const out = { ...days }
  for (const k of keys) out[k] = значение
  return out
}

/** Снимает переопределение: день снова берёт прайм из диапазона. */
export function resetDays(days: Record<string, DayPrime>, keys: string[]): Record<string, DayPrime> {
  const out = { ...days }
  for (const k of keys) delete out[k]
  return out
}

/**
 * Дни между двумя датами включительно.
 *
 * Сравнение строк YYYY-MM-DD равносильно сравнению хронологическому,
 * поэтому сортировки не требуется — но на всякий случай строки берутся в
 * указанном порядке, и границы меняются местами, если перепутаны.
 */
export function daysBetween(с: string, по: string): string[] {
  const [a, b] = с <= по ? [с, по] : [по, с]
  const out: string[] = []
  let d = parseKey(a)
  // Страховка от бесконечного цикла на кривых данных: больше года
  // подряд не назначается.
  for (let i = 0; i < 400; i++) {
    const key = isoKey(d)
    out.push(key)
    if (key >= b) break
    d = addDays(d, 1)
  }
  return out
}