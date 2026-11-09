/**
 * Даты и календарь для раздела «Расписание».
 *
 * Всё считается в местном времени и в строковом виде YYYY-MM-DD: такой вид
 * не зависит от часового пояса, в отличие от Date.toISOString(), который
 * на востоке сдвигает дату на день назад. Ключ дня в базе обязан быть тем
 * самым, который человек видит в календаре.
 */
import type { Absence, PrimeWindow, Schedule } from '@/types'
import { PARTY_TIME_ZONE, dayShiftBetween, formatZoneWindow, userWindow } from './timezone'

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

/**
 * Дни вокруг опорной даты: сколько-то до, сколько-то после, включая её саму.
 *
 * Нужно виду «Ближайшее»: это не календарная неделя, а окно вокруг
 * сегодняшнего дня, и оно может начинаться и кончаться в любые дни недели.
 */
export function daysAround(key: string, before: number, after: number): string[] {
  const дата = parseKey(key)
  return daysBetween(isoKey(addDays(дата, -before)), isoKey(addDays(дата, after)))
}

/**
 * «Ближайшее»: два дня до, сегодня и одиннадцать после — две строки по семь.
 *
 * Вторая неделя нужна, чтобы в одном окне было видно не только текущий вечер,
 * но и следующий круг осад и боссов: иначе планировать дальше недели
 * приходилось бы, переключая вид.
 */
export function actualDays(key: string): string[] {
  return daysAround(key, 2, 11)
}

/**
 * «Неделя»: текущая и следующая, понедельник — воскресенье.
 *
 * Семь дней остаются заготовкой выделения, а показываются две недели: вторая
 * строка отвечает на вопрос «что там на следующей», не уводя взгляд с
 * текущей.
 */
export function fortnightDays(key: string): string[] {
  const начало = понедельникНедели(parseKey(key))
  return daysBetween(isoKey(начало), isoKey(addDays(начало, 13)))
}

/**
 * Клетки для произвольного диапазона.
 *
 * У диапазона нет «чужих» дней: в неделе или в окне «Ближайшего» все даты
 * равноправны, даже если окно перешло в соседний месяц. Поэтому месяц
 * клетки остаётся её собственным, а чужой она не считается.
 */
export function rangeCells(keys: string[]): DayCell[] {
  const сегодня = isoToday()
  return keys.map((key) => {
    const дата = parseKey(key)
    return {
      key,
      дата,
      месяц: дата.getMonth(),
      чужой: false,
      сегодня: key === сегодня,
    }
  })
}

/**
 * Диапазон словами: «3–9 ноября 2026» или «28 октября — 3 ноября 2026».
 *
 * Год называется всегда: заголовок календаря должен отвечать на вопрос
 * «какой это год», а не заставлять вспоминать его по соседним месяцам.
 */
export function formatDayRange(keys: string[]): string {
  if (!keys.length) return ''
  const первый = parseKey(keys[0])
  const последний = parseKey(keys[keys.length - 1])
  if (keys.length === 1) return formatDay(keys[0], true)
  const год = последний.getFullYear()
  if (первый.getFullYear() === год && первый.getMonth() === последний.getMonth()) {
    return `${первый.getDate()}–${последний.getDate()} ${МЕСЯЦЫ_РОД[последний.getMonth()]} ${год}`
  }
  const начало =
    первый.getFullYear() === год
      ? `${первый.getDate()} ${МЕСЯЦЫ_РОД[первый.getMonth()]}`
      : `${первый.getDate()} ${МЕСЯЦЫ_РОД[первый.getMonth()]} ${первый.getFullYear()}`
  return `${начало} — ${последний.getDate()} ${МЕСЯЦЫ_РОД[последний.getMonth()]} ${год}`
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
  const keys = Object.keys(schedule.prime).filter((key) => key.startsWith(префикс))
  return primeHoursOn(schedule, keys)
}

/**
 * Часы прайма на произвольном наборе дней.
 *
 * Неделя и «Ближайшее» показывают свой период, и сводка в шапке должна
 * считать именно его, а не весь месяц. Выходные, как и в месячной сводке,
 * ничего не отнимают: прайм под ними сохранён.
 */
export function primeHoursOn(schedule: Schedule, keys: string[]): number {
  let минут = 0
  for (const key of keys) {
    if (schedule.offs.includes(key)) continue
    const окно = schedule.prime[key]
    if (!окно) continue
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
 * Сколько символов помещается в тему прайма.
 *
 * Двадцать — предел, после которого подпись перестаёт быть темой и
 * превращается в заметку: в клетке календаря она всё равно обрежется, а в
 * сводке займёт строку целиком.
 */
export const MAX_PRIME_THEME = 20

/**
 * Тема прайма в том виде, в котором её можно хранить и показывать.
 *
 * Края обрезаются, повторные пробелы схлопываются: человек вставляет тему из
 * чата, а переносы строк и двойные пробелы в клетке выглядят как поломка.
 * Длина считается по символам, а не по единицам UTF-16: эмодзи и составные
 * буквы не должны разрезаться пополам.
 */
export function cleanPrimeTheme(value: unknown): string {
  if (typeof value !== 'string') return ''
  const текст = value.trim().replace(/\s+/g, ' ')
  return Array.from(текст).slice(0, MAX_PRIME_THEME).join('')
}

/**
 * Записывает тему на дни. Пустая тема удаляет подпись: «стереть» и
 * «оставить как было» — разные действия, и второе здесь не нужно.
 */
export function setPrimeTheme(
  themes: Record<string, string>,
  keys: string[],
  value: unknown,
): Record<string, string> {
  const тема = cleanPrimeTheme(value)
  const out = { ...themes }
  for (const k of keys) {
    if (тема) out[k] = тема
    else delete out[k]
  }
  return out
}

/** Снимает темы с дней вместе с их праймом. */
export function clearPrimeTheme(
  themes: Record<string, string>,
  keys: string[],
): Record<string, string> {
  const out = { ...themes }
  for (const k of keys) delete out[k]
  return out
}

/** Тема прайма на день; пустая строка, если её нет. */
export function primeThemeOf(schedule: Schedule, key: string): string {
  return schedule.primeTheme?.[key] ?? ''
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
/* ------------------------------------------------------- правила показа */

/**
 * День словами: «7 октября» или «7 октября 2026».
 *
 * Раньше жил в файле вкладки рядом с разметкой, хотя это правило даты, а не
 * вид: formatMonth, isoKey и parseMinutes стоят здесь же. Правило, размазанное
 * по двум файлам, читают как две разные вещи — и правят одну, забыв про другую.
 */
export function formatDay(key: string, withYear = false): string {
  const d = parseKey(key)
  const база = `${d.getDate()} ${МЕСЯЦЫ_РОД[d.getMonth()]}`
  return withYear ? `${база} ${d.getFullYear()}` : база
}

/** День недели полностью: «понедельник». */
export function formatWeekday(key: string): string {
  const дни = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']
  return дни[parseKey(key).getDay()]
}

/**
 * «выходной» или «выходные» — по числу выбранных дней.
 *
 * На одном дне говорят «назначить выходной», на нескольких — «выходные»:
 * сказать про неделю «выходной» значит сказать о половине недели, чего не
 * произошло.
 */
export function offWord(сколькоДней: number): string {
  return сколькоДней === 1 ? 'выходной' : 'выходные'
}

/**
 * Отсутствие словами: «весь день» либо окно ухода.
 *
 * Единственное место, где окно ухода пишется словами. В клетке календаря это
 * выражение было написано трижды — в подсказке дня, в подсказке списка имён и в
 * раскрывающемся списке, — и при правке одного забывали другой: в одной подсказке
 * уже было «21:00–23:30», а в соседней по-прежнему пусто.
 *
 * Если передан день, окно пересчитывается в пояс пользователя. Без дня
 * печатается московское время — так проверки и старые вызовы не зависят от
 * пояса машины, на которой их запустили.
 *
 * Когда у пользователя окно начинается на соседнюю дату, рядом стоит «+1 дн.»:
 * иначе «04:30–05:30» в клетке среды читается как утро среды, хотя по
 * московскому дню это уже четверг.
 */
export function describeAbsence(
  a: Absence,
  dayKey?: string,
  timeZone = PARTY_TIME_ZONE,
): string {
  if (a.whole) return 'весь день'
  const окно = a.window!
  if (!dayKey) return `${formatMinutes(окно.from)}–${formatMinutes(окно.to)}`
  const местное = userWindow(dayKey, окно, timeZone)
  const сдвиг = dayShiftBetween(dayKey, местное.from.key)
  const метка = сдвиг === 0 ? '' : ` (${сдвиг > 0 ? '+' : ''}${сдвиг} дн.)`
  return `${formatZoneWindow(местное)}${метка}`
}

/**
 * Подпись отсутствующего целиком: ник, а при уходе на часть дня — ник с окном.
 *
 * Обе подсказки клетки календаря собирают этот список одинаково, и одинаково же
 * ошибаются: одна собирает «ник», другая «ник (окно)», а третья — отдельным
 * куском вёрстки. Список один, и собирать его одно место.
 */
export function absentLabel(
  имя: string,
  a: Absence,
  dayKey?: string,
  timeZone = PARTY_TIME_ZONE,
): string {
  return a.whole ? имя : `${имя} (${describeAbsence(a, dayKey, timeZone)})`
}

/**
 * Минуты в виде поля времени.
 *
 * Полночь для поля — 00:00, а внутри остаётся 24:00: прайм до утра обычен,
 * и `<input type="time">` больше 23:59 не принимает, показывая пустое поле.
 * «21:00–24:00» читается, «21:00–00:00» выглядит как нелепость, и сравнить их
 * как числа тоже нельзя. Поэтому только у конца 24:00 становится нулём.
 */
export function minutesForField(минут: number, конец: boolean): string {
  return formatMinutes(конец && минут === 24 * 60 ? 0 : минут)
}

/**
 * Обратно: из поля времени в минуты, с тем же правилом про полночь.
 *
 * Правило обязано быть ровно обратным к minutesForField, иначе прайм, кончающийся
 * в полночь, при каждом сохранении то превращался бы в 23:59, то прыгал бы на
 * следующие сутки. Держим их рядом и по той же причине.
 */
export function minutesFromField(текст: string, конец: boolean): number {
  const м = parseMinutes(текст)
  return конец && м === 0 ? 24 * 60 : м
}
