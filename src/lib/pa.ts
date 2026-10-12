/**
 * Платный аккаунт: сколько дней осталось.
 *
 * Считается от даты покупки и срока, а не от «последнего дня»: в игре
 * продление добавляется к текущему сроку, и дата покупки остаётся прежней,
 * так что пересчитывать окончание руками не нужно.
 *
 * Даты живут строками YYYY-MM-DD: их можно сравнивать между собой и они не
 * зависят от часового пояса, в отличие от Date.toISOString().
 */
import type { Pa } from '@/types'
import { addDays, isoKey, isoToday, parseKey } from './schedule'

/** Проверка даты в виде YYYY-MM-DD. */
export function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/**
 * Сколько дней ПА осталось.
 *
 * null — ПА не заполнен. Число — остаток; ноль и меньше означают, что
 * аккаунт кончился, и отрицательное значение не отбрасывается: по нему видно
 * упущенное время, а ноль теряет разницу между «сегодня последний день» и
 * «вторую неделю как нет».
 *
 * Куплено на 30 дней в день D: остаток в этот день — 30, на D+29 — 1,
 * на D+30 — 0.
 */
export function paLeft(pa?: Pa, сегодня: string = isoToday()): number | null {
  if (!pa || !isDateKey(pa.from) || !(pa.days > 0)) return null
  const конец = addDays(parseKey(pa.from), pa.days)
  // Разница между двумя полуночами: округление съедает час, который
  // появляется на переходе часового пояса.
  return Math.round((конец.getTime() - parseKey(сегодня).getTime()) / 86_400_000)
}

/** Дата, когда ПА перестанет действовать: день после последнего. */
export function paUntil(pa: Pa, сегодня: string = isoToday()): string {
  const осталось = paLeft(pa, сегодня) ?? 0
  return isoKey(addDays(parseKey(сегодня), осталось))
}

/** «12.11.2026» — для подсказок, где дата пишется словами. */
export function paDateRu(key: string): string {
  const [год, месяц, день] = key.split('-')
  return `${день}.${месяц}.${год}`
}

/**
 * Насколько срочно продлевать.
 *
 * «Скоро» — это не украшение: последние три дня ПА обычно и есть те, в
 * которые про него вспоминают, а вспомнить вовремя дешевле, чем потом
 * разбираться, почему персонаж не может войти на прайм.
 */
export type PaUrgency = 'ok' | 'soon' | 'over'

/** Сколько дней осталось и насколько это срочно. */
export function paUrgency(left: number): PaUrgency {
  if (left <= 0) return 'over'
  if (left <= 3) return 'soon'
  return 'ok'
}