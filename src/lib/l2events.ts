/**
 * Постоянные события сервера: эпические боссы и осады.
 *
 * Они повторяются по календарю, а не лежат в базе пати: это расписание игры,
 * одинаковое для всех. В базе хранится только то, что решает пати, — прайм,
 * выходные и отсутствия.
 *
 * Время событий задано по Москве. В календаре оно пересчитывается в пояс
 * пользователя, а если пояс недоступен — остаётся московским.
 *
 * Отсчёт идёт от ближайшего события вперёд. До него расписание не восстановлено,
 * и рисовать догадки о прошлом нельзя: «две недели назад» могло быть и не быть.
 * Поэтому дата-якорь — это первое событие, а не любое старое.
 */
import {
  PARTY_TIME_ZONE,
  addDaysKey,
  formatClock,
  inUserZone,
  instantOfWallTime,
  wallTimeAt,
  zoneOrParty,
  type WallTime,
} from './timezone'

export type EventKind = 'epic' | 'siege'

export interface GameEvent {
  id: 'ant-queen' | 'orfen' | 'core' | 'kh-siege' | 'castle-siege'
  /** Полное название для клетки, подсказки и сводки. */
  name: string
  kind: EventKind
  /** Время начала по Москве, минуты от полуночи. */
  timeMinutes: number
  /** Сколько длится событие: осады — два часа, боссы появляются мгновенно. */
  durationMinutes: number
  /** Ближайшее событие: от него считается период. */
  nearest: string
  /** Через сколько дней повторяется. */
  everyDays: number
}

export const GAME_EVENTS: readonly GameEvent[] = [
  {
    id: 'ant-queen',
    name: 'Ant Queen',
    kind: 'epic',
    timeMinutes: 22 * 60,
    durationMinutes: 0,
    nearest: '2026-10-26',
    everyDays: 7,
  },
  {
    id: 'orfen',
    name: 'Orfen',
    kind: 'epic',
    timeMinutes: 22 * 60,
    durationMinutes: 0,
    nearest: '2026-10-28',
    everyDays: 14,
  },
  {
    id: 'core',
    name: 'Core',
    kind: 'epic',
    timeMinutes: 22 * 60,
    durationMinutes: 0,
    nearest: '2026-11-04',
    everyDays: 14,
  },
  {
    id: 'kh-siege',
    name: 'Осады КХ',
    kind: 'siege',
    timeMinutes: 20 * 60,
    durationMinutes: 2 * 60,
    nearest: '2026-11-05',
    everyDays: 14,
  },
  {
    id: 'castle-siege',
    name: 'Осады замков',
    kind: 'siege',
    timeMinutes: 18 * 60,
    durationMinutes: 2 * 60,
    nearest: '2026-11-08',
    everyDays: 14,
  },
]

/** Номер дня для арифметики: сутки считаем по UTC, чтобы переход на летнее время не сдвигал дату. */
function номерДня(key: string): number {
  const [год, месяц, день] = key.split('-').map(Number)
  if (!год || !месяц || !день) return Number.NaN
  return Math.floor(Date.UTC(год, месяц - 1, день) / 86_400_000)
}

/** Было ли событие в этот день по московскому календарю. */
export function eventOn(event: GameEvent, key: string): boolean {
  const разница = номерДня(key) - номерДня(event.nearest)
  if (!Number.isFinite(разница) || разница < 0) return false
  return разница % event.everyDays === 0
}

/**
 * Событие в локальном дне пользователя.
 *
 * Московское событие в 22:00 у восточных поясов попадает на следующие
 * местные сутки, а у западных раннее событие могло бы попасть на
 * предыдущие. Поэтому и в клетке календаря, и в сводке оно должно стоять на
 * той дате, которую человек видит на своих часах. Смотрим три московских
 * дня вокруг локального: сдвиг больше суток у современных поясов не бывает.
 */
export function eventAt(
  event: GameEvent,
  localKey: string,
  timeZone = PARTY_TIME_ZONE,
): WallTime | null {
  const zone = zoneOrParty(timeZone)
  for (const key of [addDaysKey(localKey, -1), localKey, addDaysKey(localKey, 1)]) {
    if (!eventOn(event, key)) continue
    const wall = inUserZone(key, event.timeMinutes, zone)
    if (wall.key === localKey) return wall
  }
  return null
}

/** Что происходит в этот локальный день, в порядке объявления. */
export function eventsOn(key: string, timeZone = PARTY_TIME_ZONE): GameEvent[] {
  const zone = zoneOrParty(timeZone)
  return GAME_EVENTS.filter((e) => eventAt(e, key, zone) !== null)
}

/** Что происходит в каждом из дней: для календаря и подсказок. */
export function eventsByDay(
  keys: readonly string[],
  timeZone = PARTY_TIME_ZONE,
): Map<string, GameEvent[]> {
  const zone = zoneOrParty(timeZone)
  const out = new Map<string, GameEvent[]>()
  for (const key of keys) {
    const список = eventsOn(key, zone)
    if (список.length) out.set(key, список)
  }
  return out
}

/** Время события на часах пользователя: минуты от полуночи. */
export function eventClock(
  event: GameEvent,
  localKey?: string,
  timeZone = PARTY_TIME_ZONE,
): number {
  if (localKey) {
    const wall = eventAt(event, localKey, timeZone)
    if (wall) return wall.minutes
  }
  return inUserZone(event.nearest, event.timeMinutes, timeZone).minutes
}

/** Начало и конец события на часах пользователя. */
export interface EventWindow {
  from: WallTime
  to: WallTime
}

/** Конец события: у боссов совпадает с началом, у осад прибавляет длительность. */
function eventEnd(event: GameEvent, partyKey: string, timeZone: string): WallTime {
  if (event.durationMinutes <= 0) {
    return inUserZone(partyKey, event.timeMinutes, timeZone)
  }
  const start = instantOfWallTime({ key: partyKey, minutes: event.timeMinutes }, PARTY_TIME_ZONE)
  return wallTimeAt(start + event.durationMinutes * 60_000, timeZone)
}

/**
 * Окно события в локальном дне пользователя.
 *
 * localKey — клетка календаря. Событие могло начаться по Москве вчера или
 * сегодня, поэтому ищем тот круг повтора, чьё начало на часах пользователя
 * попадает именно в эту клетку. Без localKey берётся ближайшее событие.
 */
export function eventWindow(
  event: GameEvent,
  localKey?: string,
  timeZone = PARTY_TIME_ZONE,
): EventWindow | null {
  const zone = zoneOrParty(timeZone)
  if (!localKey) {
    return {
      from: inUserZone(event.nearest, event.timeMinutes, zone),
      to: eventEnd(event, event.nearest, zone),
    }
  }
  for (const key of [addDaysKey(localKey, -1), localKey, addDaysKey(localKey, 1)]) {
    if (!eventOn(event, key)) continue
    const from = inUserZone(key, event.timeMinutes, zone)
    if (from.key !== localKey) continue
    return { from, to: eventEnd(event, key, zone) }
  }
  return null
}

/**
 * Время события для клетки и подсказки: «22:00» у босса и «18:00–20:00»
 * у осад. Если конец перешёл на следующие местные сутки, добавляем «+1»:
 * без него «23:00–01:00» читается как ошибка, а не как ночная осада.
 */
export function eventTimeLabel(
  event: GameEvent,
  localKey?: string,
  timeZone = PARTY_TIME_ZONE,
): string {
  const окно = eventWindow(event, localKey, timeZone)
  if (!окно) return formatClock(eventClock(event, localKey, timeZone))
  const начало = formatClock(окно.from.minutes)
  if (event.durationMinutes <= 0) return начало
  const конец = formatClock(окно.to.minutes)
  return `${начало}–${конец}${окно.to.key > окно.from.key ? ' +1' : ''}`
}

/** Подпись для подсказки: имя, вид и время на часах пользователя. */
export function eventTitle(
  event: GameEvent,
  timeZone = PARTY_TIME_ZONE,
  localKey?: string,
): string {
  const вид = event.kind === 'epic' ? 'эпический босс' : 'осада'
  const zone = zoneOrParty(timeZone)
  const время = eventTimeLabel(event, localKey, zone)
  const база = `${event.name} · ${вид} · ${время}`
  return zone === PARTY_TIME_ZONE
    ? база
    : `${база} (по Москве ${formatClock(event.timeMinutes)})`
}

/** Строка для легенды: «Ant Queen · пн 22:00» в поясе пользователя. */
export function eventSchedule(event: GameEvent, timeZone = PARTY_TIME_ZONE): string {
  const wall = inUserZone(event.nearest, event.timeMinutes, timeZone)
  const дата = new Date(`${wall.key}T00:00:00Z`)
  const дни = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
  return `${event.name} · ${дни[дата.getUTCDay()]} ${eventTimeLabel(event, wall.key, timeZone)}`
}
