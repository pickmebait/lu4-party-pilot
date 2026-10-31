/**
 * Постоянные события сервера: эпические боссы и осады.
 *
 * Они повторяются по календарю, а не лежат в базе пати: это расписание игры,
 * одинаковое для всех. В базе хранится только то, что решает пати, — прайм,
 * выходные и отсутствия.
 *
 * Отсчёт идёт от ближайшего события вперёд. До него расписание не восстановлено,
 * и рисовать догадки о прошлом нельзя: «две недели назад» могло быть и не быть.
 * Поэтому дата-якорь — это первое событие, а не любое старое.
 */

export type EventKind = 'epic' | 'siege'

export interface GameEvent {
  id: 'ant-queen' | 'orfen' | 'core' | 'kh-siege' | 'castle-siege'
  /** Полное название для подсказки и сводки. */
  name: string
  /** Короткое имя для клетки календаря. */
  short: string
  kind: EventKind
  /** Время начала по местному времени, как его называют в пати. */
  time: string
  /** Ближайшее событие: от него считается период. */
  nearest: string
  /** Через сколько дней повторяется. */
  everyDays: number
}

export const GAME_EVENTS: readonly GameEvent[] = [
  {
    id: 'ant-queen',
    name: 'Ant Queen',
    short: 'Ant Queen',
    kind: 'epic',
    time: '20:00',
    nearest: '2026-10-26',
    everyDays: 7,
  },
  {
    id: 'orfen',
    name: 'Orfen',
    short: 'Orfen',
    kind: 'epic',
    time: '20:00',
    nearest: '2026-10-28',
    everyDays: 14,
  },
  {
    id: 'core',
    name: 'Core',
    short: 'Core',
    kind: 'epic',
    time: '20:00',
    nearest: '2026-11-04',
    everyDays: 14,
  },
  {
    id: 'kh-siege',
    name: 'Осады КХ',
    short: 'КХ',
    kind: 'siege',
    time: '20:00',
    nearest: '2026-11-05',
    everyDays: 14,
  },
  {
    id: 'castle-siege',
    name: 'Осады замков',
    short: 'Замки',
    kind: 'siege',
    time: '18:00',
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

/** Было ли событие в этот день. */
export function eventOn(event: GameEvent, key: string): boolean {
  const разница = номерДня(key) - номерДня(event.nearest)
  if (!Number.isFinite(разница) || разница < 0) return false
  return разница % event.everyDays === 0
}

/** Что происходит в этот день, в порядке объявления. */
export function eventsOn(key: string): GameEvent[] {
  return GAME_EVENTS.filter((e) => eventOn(e, key))
}

/** Что происходит в каждом из дней: для календаря и подсказок. */
export function eventsByDay(keys: readonly string[]): Map<string, GameEvent[]> {
  const out = new Map<string, GameEvent[]>()
  for (const key of keys) {
    const список = eventsOn(key)
    if (список.length) out.set(key, список)
  }
  return out
}

/** Подпись для подсказки: имя, вид и время. */
export function eventTitle(event: GameEvent): string {
  const вид = event.kind === 'epic' ? 'эпический босс' : 'осада'
  return `${event.name} · ${вид} · ${event.time}`
}

/** Строка для легенды: «Ant Queen · пн 20:00». */
export function eventSchedule(event: GameEvent): string {
  const дата = new Date(`${event.nearest}T00:00:00`)
  const дни = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
  return `${event.name} · ${дни[дата.getDay()]} ${event.time}`
}
