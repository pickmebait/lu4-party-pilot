/**
 * Миграции данных, которым нужен справочник предметов.
 *
 * Обычные миграции живут в store.ts: там при загрузке любой базы поля
 * приводятся к нынешнему виду. Но есть правила, которые нельзя понять по
 * одному itemId — например, что кастеты занимают обе руки. Это свойство
 * лежит в справочнике, а не в базе пати, поэтому такая миграция запускается
 * после загрузки items.json.
 *
 * Функции здесь чистые: получают базу и набор id, возвращают новую базу.
 * Так их можно проверить без браузера и без сети.
 */
import type { CatalogItem, Char, Db, MoveLog, SlotEntry, WeaponSet } from '@/types'
import { uid } from './util'

export interface FistHandsMigration {
  db: Db
  changed: boolean
  /** Предметы, снятые с левой руки и убранные в казну. */
  moved: number[]
}

type WeaponCells = {
  rhand?: (SlotEntry | null)[]
  lhand?: (SlotEntry | null)[]
}

/**
 * Кастеты — двуручное оружие.
 *
 * В старой базе кастет мог лежать только в правой руке, а слева — щит или
 * вторая пара кулаков. Теперь обе руки заняты одним кастетом. Миграция
 * дорисовывает вторую руку, а всё, что там было, не выбрасывает: снятая
 * вещь уходит в казну и отмечается в её истории. Так данные не исчезают, а
 * человек видит, куда делась вещь.
 */
export function migrateFistHands(
  db: Db,
  fistIds: ReadonlySet<number>,
  now = new Date().toISOString(),
): FistHandsMigration {
  if (fistIds.size === 0) return { db, changed: false, moved: [] }

  let changed = false
  const moved: number[] = []
  let stacks = db.warehouse.stacks
  let log = db.warehouse.log

  const вКазну = (entry: SlotEntry) => {
    moved.push(entry.itemId)
    const копия = stacks.map((s) => ({ ...s }))
    const i = копия.findIndex((s) => s.itemId === entry.itemId)
    if (i >= 0) копия[i] = { ...копия[i], count: копия[i].count + 1 }
    else копия.push({ itemId: entry.itemId, count: 1 })
    stacks = копия

    const свойства = [
      entry.mod ? `заточка +${entry.mod}` : '',
      entry.sa ? `SA: ${entry.sa}` : '',
      entry.rare ? 'редкий эффект' : '',
    ].filter(Boolean)
    log = [
      {
        id: uid('l'),
        ts: now,
        who: 'Миграция',
        itemId: entry.itemId,
        count: 1,
        dir: 'in',
        note: `Кастет занимает обе руки: вещь снята с левой руки${
          свойства.length ? ` (${свойства.join(', ')})` : ''
        }`,
      } satisfies MoveLog,
      ...log,
    ].slice(0, 500)
  }

  /**
   * Дорисовывает вторую руку у кастета.
   *
   * Возвращает только изменённые ячейки: если кастет уже носит вторую руку,
   * объект не трогаем, и лишнего сохранения не будет.
   */
  const cells = (src: WeaponCells): WeaponCells | null => {
    const right = (src.rhand ?? [])[0] ?? null
    if (!right || !fistIds.has(right.itemId)) return null

    const left = (src.lhand ?? [])[0] ?? null
    /*
     * Если слева уже лежит тот же кастет с отметкой spans, это нормальная
     * вторая ячейка пары. Всё остальное — отдельная вещь, которая до
     * исправления считалась надетой. Её нельзя просто затереть: отправляем
     * в казну, чтобы она не пропала.
     */
    if (left && !(left.itemId === right.itemId && left.spans === true)) {
      вКазну(left)
    }

    const правый: SlotEntry = { ...right }
    delete правый.spans
    const левый: SlotEntry = { ...правый, spans: true }
    const новыеПравая = [правый]
    const новыеЛевая = [левый]

    const совпало =
      JSON.stringify(src.rhand ?? []) === JSON.stringify(новыеПравая) &&
      JSON.stringify(src.lhand ?? []) === JSON.stringify(новыеЛевая)
    if (совпало) return null

    changed = true
    return { rhand: новыеПравая, lhand: новыеЛевая }
  }

  const ветка = <T extends { slots: Char['slots']; extraWeaponSets?: WeaponSet[] }>(
    holder: T,
  ): T => {
    let slots = holder.slots
    const новыеСлоты = cells(slots)
    if (новыеСлоты) slots = { ...slots, ...новыеСлоты }

    let extraWeaponSets = holder.extraWeaponSets
    if (extraWeaponSets) {
      let наборИзменён = false
      const новыеНаборы = extraWeaponSets.map((набор) => {
        const новыеЯчейки = cells(набор)
        if (!новыеЯчейки) return набор
        наборИзменён = true
        return { ...набор, ...новыеЯчейки }
      })
      if (наборИзменён) extraWeaponSets = новыеНаборы
    }

    if (slots === holder.slots && extraWeaponSets === holder.extraWeaponSets) return holder
    const итог: T = { ...holder, slots }
    if (extraWeaponSets !== holder.extraWeaponSets) итог.extraWeaponSets = extraWeaponSets
    return итог
  }

  const chars = db.chars.map((char) => {
    const основа = ветка(char)
    const subs = char.subs.map((sub) => ветка(sub))
    const сабыИзменились = subs.some((sub, i) => sub !== char.subs[i])
    if (основа === char && !сабыИзменились) return char
    changed = true
    return сабыИзменились ? { ...основа, subs } : основа
  })

  const база: Db = {
    ...db,
    chars,
    ...(moved.length ? { warehouse: { stacks, log } } : {}),
  }
  return { db: changed ? база : db, changed, moved }
}

/** id всех кастетов в справочнике. */
export function fistIds(items: readonly CatalogItem[]): Set<number> {
  return new Set(
    items.filter((item) => item.weaponClass === 'Кастеты').map((item) => item.id),
  )
}
