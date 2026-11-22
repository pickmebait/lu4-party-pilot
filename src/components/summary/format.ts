import { addDays, formatDay, isoKey, parseKey } from '@/lib/schedule'
import { plural } from '@/lib/util'
import type { Char, Db } from '@/types'

/* --------------------------------------------------------------- мелочи */

/** Русская десятичная запятая: 7.5 читалось бы как код. */
export function дробь(число: number): string {
  return String(число).replace('.', ',')
}

/** Минуты словами: окно прайма «2 ч 8 мин», а не «128». */
export function длительность(минут: number): string {
  const ч = Math.floor(минут / 60)
  const мин = Math.round(минут % 60)
  if (!ч) return `${мин} мин`
  if (!мин) return `${ч} ч`
  return `${ч} ч ${мин} мин`
}

/** «окт» — месяц в подписи, где год не нужен. */
const МЕСЯЦЫ_КОРОТКО = [
  'янв', 'фев', 'мар', 'апр', 'мая', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
]

export function месяцКоротко(key: string): string {
  return МЕСЯЦЫ_КОРОТКО[parseKey(key).getMonth()] ?? key
}

/** «Сегодня», «Завтра», «21 ноября» — без года. */
export function деньСловами(день: string, сегодня: string): string {
  const разница = Math.round(
    (parseKey(день).getTime() - parseKey(сегодня).getTime()) / 86_400_000,
  )
  if (разница === 0) return 'Сегодня'
  if (разница === 1) return 'Завтра'
  if (разница === 2) return 'Послезавтра'
  return formatDay(день)
}

/** Сколько осталось до события: «9 ч 48 мин», «1 дн. 8 ч». */
export function доСобытия(минут: number): string {
  if (минут < 60) return `${Math.max(0, минут)} мин`
  if (минут >= 1440) {
    const дней = Math.floor(минут / 1440)
    const часов = Math.floor((минут % 1440) / 60)
    return `${дней} дн.${часов ? ` ${часов} ч` : ''}`
  }
  const часов = Math.floor(минут / 60)
  const остаток = минут % 60
  return `${часов} ч${остаток ? ` ${остаток} мин` : ''}`
}

/** «завтра», «через 5 дней» — для премиума. */
export function срокСловами(дней: number): string {
  if (дней <= 0) return 'истёк'
  if (дней === 1) return 'завтра'
  return `через ${дней} ${plural(дней, 'день', 'дня', 'дней')}`
}

/** Сдвиг дня для подписи: «+1 дн.». */
export function сдвигДня(сдвиг: number): string {
  if (!сдвиг) return ''
  return `${сдвиг > 0 ? '+' : '−'}${Math.abs(сдвиг)} дн.`
}

/** Понедельник недели, в которую попал день. */
export function началоНедели(key: string): string {
  const дата = parseKey(key)
  const день = дата.getDay()
  return isoKey(addDays(дата, день === 0 ? -6 : 1 - день))
}

/** Воскресенье недели, в которую попал день. */
export function конецНедели(key: string): string {
  const дата = parseKey(key)
  const день = (дата.getDay() + 6) % 7
  return isoKey(addDays(дата, 6 - день))
}

/** Самая ранняя дата, о которой в базе вообще есть запись. */
export function началоИстории(db: Db, сегодня: string): string {
  const ключи = [
    ...Object.keys(db.schedule.prime),
    ...db.schedule.offs,
  ]
    .filter((key) => key <= сегодня)
    .sort()
  return ключи[0] ?? сегодня
}

/** Есть ли у персонажа хоть один канал связи, кроме реального имени. */
export function естьСвязь(c: Char): boolean {
  const контакты = c.contacts
  return Boolean(
    контакты?.phone?.trim() ||
      контакты?.telegram?.trim() ||
      контакты?.discord?.trim(),
  )
}

/**
 * Даты пропусков словами.
 *
 * Соседние дни сворачиваются в диапазон: «4–13 ноя» читается как отпуск,
 * а «4, 5, 6, 7, 8, 9, 10, 11, 12, 13 ноя» занимает строку целиком.
 */
export function датыСловами(дни: string[]): string {
  const отсортированы = [...дни].sort()
  const группы: string[] = []
  let i = 0
  while (i < отсортированы.length) {
    let j = i
    while (j + 1 < отсортированы.length) {
      const разница = Math.round(
        (parseKey(отсортированы[j + 1]).getTime() - parseKey(отсортированы[j]).getTime()) /
          86_400_000,
      )
      if (разница !== 1) break
      j++
    }
    группы.push(диапазонДат(отсортированы[i], отсортированы[j]))
    i = j + 1
  }
  return группы.join(' · ')
}

export function диапазонДат(с: string, по: string): string {
  const первый = parseKey(с)
  const последний = parseKey(по)
  if (с === по) return `${первый.getDate()} ${месяцКоротко(с)}`
  if (первый.getMonth() === последний.getMonth()) {
    return `${первый.getDate()}–${последний.getDate()} ${месяцКоротко(с)}`
  }
  return `${первый.getDate()} ${месяцКоротко(с)} — ${последний.getDate()} ${месяцКоротко(по)}`
}

/** Дни, в которые персонаж пропустил прайм. */
export function пропущенныеДни(персонаж: Char | undefined, праймы: string[]): string[] {
  if (!персонаж) return []
  return праймы.filter((день) => персонаж.away?.[день])
}
