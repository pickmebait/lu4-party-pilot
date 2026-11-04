/**
 * Часовые пояса расписания.
 *
 * В базе время событий, прайма и отсутствий хранится по Москве: это общий
 * ориентир пати, а не пояс конкретного браузера. Показываем его в поясе
 * пользователя, а если браузер пояс не сообщает — снова по Москве.
 *
 * Даты остаются ключами YYYY-MM-DD: они не зависят от пояса и совпадают с
 * клетками календаря. Пересчитывается только время внутри дня. Если из-за
 * пояса оно переходит через полночь, это видно по дате WallTime: она может
 * быть на день раньше или позже ключа дня.
 */
import type { PrimeWindow } from '@/types'

/** Пояс, в котором лежит общая база пати. */
export const PARTY_TIME_ZONE = 'Europe/Moscow'

/** Стенные часы: дата и минуты от полуночи в конкретном поясе. */
export interface WallTime {
  /** YYYY-MM-DD. */
  key: string
  /** Минуты от полуночи, 0–1439. */
  minutes: number
}

interface Parts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const pad = (n: number): string => (n < 10 ? '0' + n : String(n))

/** Кэш форматтеров: Intl.DateTimeFormat не дешёвый, а поясов немного. */
const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
    formatters.set(timeZone, f)
  }
  return f
}

/**
 * Пояс, который понимает Intl.
 *
 * Проверка нужна не из вредности: `resolvedOptions().timeZone` в старых
 * браузерах бывает пустым, а сохранённый где-то пояс может оказаться
 * выдуманным. И то, и другое должно молча уходить на Москву, а не ронять
 * весь календарь.
 */
export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 100) return false
  try {
    formatter(value)
    return true
  } catch {
    return false
  }
}

/** Пояс браузера или null, если его не удалось прочитать. */
let browserZone: string | null | undefined

export function browserTimeZone(): string | null {
  if (browserZone !== undefined) return browserZone
  let zone: string | undefined
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    zone = undefined
  }
  browserZone = isValidTimeZone(zone) ? zone : null
  return browserZone
}

/** Пояс пользователя с запасным вариантом «Москва». */
export function userTimeZone(): string {
  return browserTimeZone() ?? PARTY_TIME_ZONE
}

/** Любое значение → проверенный пояс, иначе Москва. */
export function zoneOrParty(value: unknown): string {
  return isValidTimeZone(value) ? value : PARTY_TIME_ZONE
}

/** Части даты и времени в поясе. */
function partsAt(instant: number, timeZone: string): Parts {
  const parts = formatter(timeZone).formatToParts(new Date(instant))
  const числа: Record<string, number> = {}
  for (const p of parts) {
    if (p.type !== 'literal') числа[p.type] = Number(p.value)
  }
  return {
    year: числа.year,
    month: числа.month,
    day: числа.day,
    hour: числа.hour,
    minute: числа.minute,
    second: числа.second,
  }
}

/** Стенные часы в поясе на момент instant. */
export function wallTimeAt(instant: number, timeZone = PARTY_TIME_ZONE): WallTime {
  const p = partsAt(instant, zoneOrParty(timeZone))
  return {
    key: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    minutes: p.hour * 60 + p.minute,
  }
}

/** Смещение пояса от UTC в минутах на момент instant. */
function offsetAt(instant: number, timeZone: string): number {
  const p = partsAt(instant, timeZone)
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((asUTC - instant) / 60_000)
}

/** Ключ дня, сдвинутый на n суток. Считаем по UTC, чтобы не ловить DST. */
export function addDaysKey(key: string, days: number): string {
  const [year, month, day] = key.split('-').map(Number)
  const d = new Date(Date.UTC(year, month - 1, day) + days * 86_400_000)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** Разница дат в сутках: localKey минус partyKey. */
export function dayShiftBetween(partyKey: string, localKey: string): number {
  const wall = (key: string): number => {
    const [year, month, day] = key.split('-').map(Number)
    return Date.UTC(year, month - 1, day)
  }
  return Math.round((wall(localKey) - wall(partyKey)) / 86_400_000)
}

/** UTC-момент, если бы стенные часы были в UTC. */
function utcOfWall(wall: WallTime): number {
  const [year, month, day] = wall.key.split('-').map(Number)
  return Date.UTC(year, month - 1, day, 0, 0, 0, 0) + wall.minutes * 60_000
}

function sameWall(a: WallTime, b: WallTime): boolean {
  return a.key === b.key && a.minutes === b.minutes
}

/**
 * Все моменты, когда в поясе показывается ровно это стенное время.
 *
 * Обычно он один. При переходе на летнее время бывает ноль (время
 * пропущено) или два (час повторился). Собираем оба варианта, а не выбираем
 * один вслепую: для поиска времени внутри дня важно знать оба.
 */
function instantsOfWallTime(wall: WallTime, timeZone: string): number[] {
  const target = utcOfWall(wall)
  const offsets = new Set<number>()
  /*
   * Смещения берём не только в самой точке, но и за сутки до и после. На
   * переходе DST одного смещения мало: до него пояс ещё старый, после —
   * уже новый. Трёх точек хватает для любого современного перехода.
   */
  for (const shift of [-36, -12, 0, 12, 36]) {
    offsets.add(offsetAt(target + shift * 3_600_000, timeZone))
  }
  const out: number[] = []
  for (const offset of offsets) {
    const instant = target - offset * 60_000
    if (sameWall(wallTimeAt(instant, timeZone), wall) && !out.includes(instant)) {
      out.push(instant)
    }
  }
  return out.sort((a, b) => a - b)
}

/**
 * Момент по стенным часам в поясе.
 *
 * Для несуществующего времени (дырка при переводе часов) возвращает
 * ближайшее представимое — вызывающие, которым важна точность, проверяют
 * результат через wallTimeAt.
 */
export function instantOfWallTime(wall: WallTime, timeZone = PARTY_TIME_ZONE): number {
  const zone = zoneOrParty(timeZone)
  const found = instantsOfWallTime(wall, zone)
  if (found.length) return found[0]
  const target = utcOfWall(wall)
  return target - offsetAt(target, zone) * 60_000
}

/** Время по Москве → время в поясе пользователя. */
export function inUserZone(
  dayKey: string,
  minutes: number,
  timeZone = PARTY_TIME_ZONE,
): WallTime {
  const instant = instantOfWallTime({ key: dayKey, minutes }, PARTY_TIME_ZONE)
  return wallTimeAt(instant, zoneOrParty(timeZone))
}

/** Окно прайма или отсутствия в поясе пользователя. */
export function userWindow(
  dayKey: string,
  window: PrimeWindow,
  timeZone = PARTY_TIME_ZONE,
): { from: WallTime; to: WallTime } {
  return {
    from: inUserZone(dayKey, window.from, timeZone),
    to: inUserZone(dayKey, window.to, timeZone),
  }
}

/** «21:00», «09:05» — без обращения к часовому поясу. */
export function formatClock(minutes: number): string {
  const m = Math.max(0, Math.min(24 * 60, Math.round(minutes)))
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

/**
 * Окно словами.
 *
 * Полночь на конце показывается как 24:00, а не 00:00: иначе окно
 * «21:00–00:00» читается как пустое или перевёрнутое, хотя это обычный
 * прайм до утра. Если конец перешёл на следующую дату, это и есть полночь.
 */
export function formatZoneWindow(window: { from: WallTime; to: WallTime }): string {
  const end =
    window.to.minutes === 0 && window.to.key > window.from.key
      ? '24:00'
      : formatClock(window.to.minutes)
  return `${formatClock(window.from.minutes)}–${end}`
}

/** Начало и конец московских суток в UTC-миллисекундах. */
function partyDayBounds(dayKey: string): { start: number; end: number } {
  return {
    start: instantOfWallTime({ key: dayKey, minutes: 0 }, PARTY_TIME_ZONE),
    end: instantOfWallTime({ key: addDaysKey(dayKey, 1), minutes: 0 }, PARTY_TIME_ZONE),
  }
}

/**
 * Момент внутри московских суток, когда у пользователя на часах clock.
 *
 * Перебираем соседние локальные даты: из-за разницы поясов один и тот же
 * московский день может начаться у пользователя вчера, сегодня или завтра.
 * Для конца окна разрешаем ровно полночь следующих московских суток — так
 * окно «до 24:00» остаётся выразимым.
 */
function instantForClockInPartyDay(
  dayKey: string,
  clock: number,
  timeZone: string,
  after: number,
  includeEnd: boolean,
): number | null {
  const { start, end } = partyDayBounds(dayKey)
  const zone = zoneOrParty(timeZone)
  const found: number[] = []
  for (let shift = -2; shift <= 2; shift++) {
    const localKey = addDaysKey(dayKey, shift)
    for (const instant of instantsOfWallTime({ key: localKey, minutes: clock }, zone)) {
      if (instant < start || instant > end) continue
      if (instant === end && !includeEnd) continue
      if (instant < after) continue
      found.push(instant)
    }
  }
  return found.length ? Math.min(...found) : null
}

/**
 * Локальные часы начала и конца → московское окно.
 *
 * Это обратная операция к userWindow, но без даты: пользователь вводит
 * только «23:00» и «01:30», а какая это локальная дата, решает московский
 * день. Поэтому окно всегда остаётся внутри выбранного дня пати, даже если
 * у пользователя оно начинается вчера или заканчивается завтра.
 *
 * null означает, что такого окна в этом дне нет: например, конец раньше
 * начала или локальное время попало в дырку перевода часов.
 */
export function partyWindowFromClock(
  dayKey: string,
  fromClock: number,
  toClock: number,
  timeZone = PARTY_TIME_ZONE,
): PrimeWindow | null {
  const zone = zoneOrParty(timeZone)
  const { start, end } = partyDayBounds(dayKey)
  const from = instantForClockInPartyDay(dayKey, fromClock, zone, start, false)
  if (from == null) return null
  const to = instantForClockInPartyDay(
    dayKey,
    ((toClock % 1440) + 1440) % 1440,
    zone,
    from + 60_000,
    true,
  )
  if (to == null) return null

  const fromWall = wallTimeAt(from, PARTY_TIME_ZONE)
  const toWall = wallTimeAt(to, PARTY_TIME_ZONE)
  if (fromWall.key !== dayKey) return null

  let toMinutes: number
  if (to === end) toMinutes = 24 * 60
  else if (toWall.key === dayKey) toMinutes = toWall.minutes
  else return null

  if (toMinutes <= fromWall.minutes) return null
  return { from: fromWall.minutes, to: toMinutes }
}
