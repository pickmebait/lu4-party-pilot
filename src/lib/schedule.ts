/**
 * Даты и календарь для раздела «Расписание».
 *
 * Всё считается в местном времени и в строковом виде YYYY-MM-DD: такой вид
 * не зависит от часового пояса, в отличие от Date.toISOString(), который
 * на востоке сдвигает дату на день назад. Ключ дня в базе обязан быть тем
 * самым, который человек видит в календаре.
 */
import type { Absence, PrimeWindow, Schedule } from '@/types'

const МЕСЯЦЫ = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
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

/**
 * Строка вида YYYY-MM-DD и настоящая дата.
 *
 * Проверяется и разряд, и само число: «2026-02-30» разбирается в первый март
 * молча, и такая запись прошла бы в базу как дата, которой не бывает.
 */
export function isDateKey(key: unknown): key is string {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false
  const d = new Date(key + 'T00:00:00')
  return !Number.isNaN(d.getTime()) && isoKey(d) === key
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
 * Сколько часов прайма набрано в этом месяце.
 *
 * Раньше под вкладкой стояло число дней, и оно ничего не говорило о
 * нагрузке: десять дней по часу и два дня по десять часов — одно и то же
 * число, а работы разной в десять раз. Считаем именно часы, потому что их
 * и планируют: сколько за месяц выйдет на прайм.
 *
 * Месяц — тот, в котором человек сейчас. Календарь можно листать, а сводка
 * под вкладкой отвечает на вопрос «сколько у меня выходит», и он про текущий
 * месяц.
 *
 * Выходные не считаются: день без прайма не отнимает ничего, а сам прайм под
 * ним сохранён — снимем выходной, и часы вернутся.
 */
export function primeHours(schedule: Schedule, now = new Date()): number {
  const префикс = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
  let минут = 0
  for (const [key, окно] of Object.entries(schedule.prime)) {
    if (!key.startsWith(префикс)) continue
    if (schedule.offs.includes(key)) continue
    // Окно всегда в пределах суток: форма не даёт сохранить from >= to.
    минут += Math.max(0, окно.to - окно.from)
  }
  return Math.round(минут / 6) / 10
}

/**
 * Что показывать на день.
 *
 * Три состояния: прайм назначен, выходной пати или ничего не решено.
 * Отдельной отмены нет — она отличалась от «не назначено» только зачёркиванием
 * в календаре, а читалось это как сломанная запись.
 */
export type PrimeState =
  | { kind: 'нет' }
  | { kind: 'окно'; window: PrimeWindow }
  | { kind: 'выходной' }

/** Ключ лежит в prime: день решает сам. */
export function primeOf(schedule: Schedule, key: string): PrimeState {
  if (schedule.offs.includes(key)) return { kind: 'выходной' }
  const своё = schedule.prime[key]
  if (своё) return { kind: 'окно', window: своё }
  return { kind: 'нет' }
}

/**
 * Назначение окна на дни.
 *
 * День, помеченный выходным, время под собой сохраняет: снимем выходной —
 * и прайм вернётся. Иначе пришлось бы вводить две отметки на одну дату,
 * и одна из них молча затирала бы другую.
 */
export function setPrime(
  prime: Record<string, PrimeWindow>,
  keys: string[],
  значение: PrimeWindow,
): Record<string, PrimeWindow> {
  const out = { ...prime }
  for (const k of keys) out[k] = значение
  return out
}

/** Снимает назначение: день снова «ничего не решено». */
export function clearPrime(prime: Record<string, PrimeWindow>, keys: string[]): Record<string, PrimeWindow> {
  const out = { ...prime }
  for (const k of keys) delete out[k]
  return out
}

/**
 * Все семь дней недели, в которую попал день.
 *
 * Заготовка под выделение целой недели: месяц мышью обводить — двадцать с
 * лишним нажатий, а неделя — одно.
 */
export function weekDays(key: string): string[] {
  const начало = понедельникНедели(parseKey(key))
  return daysBetween(isoKey(начало), isoKey(addDays(начало, 6)))
}

/** Субботы и воскресенья среди указанных дней. */
export function weekendKeys(keys: string[]): string[] {
  return keys.filter((k) => {
    const d = parseKey(k).getDay()
    return d === 0 || d === 6
  })
}

/** Есть ли на днях что снимать: прайм или выходной. */
export function primeOn(schedule: Schedule, keys: string[]): boolean {
  return keys.some((k) => schedule.offs.includes(k) || schedule.prime[k] !== undefined)
}

export function addOffs(offs: string[], keys: string[]): string[] {
  return [...new Set([...offs, ...keys])].sort()
}

export function removeOffs(offs: string[], keys: string[]): string[] {
  const убрать = new Set(keys)
  return offs.filter((k) => !убрать.has(k))
}

/**
 * Свод по дням: сколько народу отсутствует и кто.
 *
 * Считается заранее для всех клеток месяца: в самой клетке места мало,
 * а подсказка должна говорить не «2», а кого именно.
 */
export interface DayAbsent {
  charId: string
  имя: string
  absence: Absence
}

export function absencesByDay(
  chars: { id: string; name: string; away: Record<string, Absence> }[],
  keys: string[],
): Map<string, DayAbsent[]> {
  const out = new Map<string, DayAbsent[]>()
  for (const key of keys) {
    const список: DayAbsent[] = []
    for (const c of chars) {
      const a = c.away?.[key]
      if (a) список.push({ charId: c.id, имя: c.name || 'Без имени', absence: a })
    }
    if (список.length) out.set(key, список)
  }
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