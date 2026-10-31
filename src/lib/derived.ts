import type { ArmorSet, Char, Db, SetDef, SlotEntry, SlotKey, WeaponSet } from '@/types'
import { ARMOR_SLOTS, SLOT_KEYS, affiliationOrder, WEAPON_SLOTS } from '@/types'
import { статусЦели, цельВыполнена } from './goals'

/**
 * Персонажи в порядке показа: свой, потом состав, потом десятка, потом окно.
 *
 * Свой — тот, ради которого человек вошёл, и он всегда сверху. Искать свою
 * карточку среди чужих приходилось бы каждый раз, а это ровно тот, кого
 * правит именно он. Свой не выпадает из вида: строка «Сводка» и фильтры
 * отбирают персонажей раньше сортировки, и попадает он туда только если
 * подходит под них.
 *
 * Сортировка устойчивая — внутри принадлежности порядок добавления не
 * меняется, поэтому пересортировка не таскает людей по карточкам.
 */
export function sortedChars(chars: readonly Char[], свойCharId?: string | null): Char[] {
  const свой = свойCharId ?? ''
  return [...chars].sort((a, b) => {
    const свойA = a.id === свой ? 0 : 1
    const свойB = b.id === свой ? 0 : 1
    if (свойA !== свойB) return свойA - свойB
    return affiliationOrder(a.affil) - affiliationOrder(b.affil)
  })
}

export interface SetProgress {
  set: SetDef
  /** Сколько уникальных частей объявлено в комплекте. */
  total: number
  /** Сколько частей реально надето на кого-то из пати (уникальных). */
  equipped: number
  /** Сколько частей лежит в общей казне (уникальных). */
  stored: number
  /** id частей, которые надеты. */
  worn: number[]
  /** id частей, которые лежат в казне. */
  storedIds: number[]
  /** id частей, которых нет нигде. */
  missing: number[]
  complete: boolean
}

/**
 * Наборы слотов персонажа: своя профессия и каждый саб-класс.
 *
 * Набор, а не персонаж: правила надевания работают с любым набором слотов
 * одинаково — двуручный меч занимает обе руки и у основной профессии, и у
 * саба, — и переписывать их для сабов значило бы держать две копии.
 */
export interface ВеткаСлотов {
  slots: Char['slots']
  extraWeaponSets?: readonly WeaponSet[]
  extraArmorSets?: readonly ArmorSet[]
}

export function branchesOf(char: Char): ВеткаСлотов[] {
  return [
    {
      slots: char.slots,
      extraWeaponSets: char.extraWeaponSets,
      extraArmorSets: char.extraArmorSets,
    },
    ...char.subs.map((s) => ({
      slots: s.slots,
      extraWeaponSets: s.extraWeaponSets,
      extraArmorSets: s.extraArmorSets,
    })),
  ]
}

/** Все id предметов, которые сейчас надеты — на ком угодно и в какой ветке. */
export function equippedItemIds(db: Db): Set<number> {
  const out = new Set<number>()
  for (const c of db.chars) {
    for (const ветка of branchesOf(c)) {
      for (const k of SLOT_KEYS) {
        for (const e of ветка.slots[k] ?? []) {
          const entry = e as SlotEntry | null
          if (entry) out.add(entry.itemId)
        }
      }
      for (const набор of ветка.extraWeaponSets ?? []) {
        for (const k of WEAPON_SLOTS) {
          for (const e of набор[k] ?? []) if (e) out.add(e.itemId)
        }
      }
      for (const набор of ветка.extraArmorSets ?? []) {
        for (const k of ARMOR_SLOTS) {
          for (const e of набор[k] ?? []) if (e) out.add(e.itemId)
        }
      }
    }
  }
  return out
}

/** Все id предметов, которые встречаются в приложении — для подсказок в поиске. */
export function usedItemIds(db: Db): Set<number> {
  const out = equippedItemIds(db)
  for (const s of db.warehouse.stacks) out.add(s.itemId)
  // Все предметы целей, а не только первые: подсказки и поиск по справочнику
  // должны знать про вещь, даже если она в цели вторая.
  for (const цель of db.goals) for (const предмет of цель.items) out.add(предмет.itemId)
  for (const s of db.sets) for (const p of s.pieces) out.add(p)
  return out
}

export function computeSets(db: Db): SetProgress[] {
  const eq = equippedItemIds(db)
  const stored = new Set(db.warehouse.stacks.map((s) => s.itemId))

  return db.sets
    .map((set) => {
      const pieces = [...new Set(set.pieces)]
      const worn: number[] = []
      const storedIds: number[] = []
      const missing: number[] = []
      for (const p of pieces) {
        if (eq.has(p)) worn.push(p)
        else if (stored.has(p)) storedIds.push(p)
        else missing.push(p)
      }
      return {
        set,
        total: pieces.length,
        equipped: worn.length,
        stored: storedIds.length,
        worn,
        storedIds,
        missing,
        // Собран только тот комплект, где все части надето. Наличие в казне
        // не засчитывается: бонус дают вещи на персонажах.
        complete: pieces.length > 0 && worn.length === pieces.length,
      }
    })
    .sort((a, b) => Number(a.complete) - Number(b.complete) || a.set.name.localeCompare(b.set.name))
}

/**
 * Занятые слоты ветки — то, что человек видит на карточке.
 *
 * Одно место вместо четырёх. Считалось по-разному: на карточке и в строке —
 * по одной ветке через группы слотов и предельные размеры, в сводке и в
 * разборе — по всем веткам через сами массивы. Числа сходились только потому,
 * что нормализация дополняет слот до предельного размера. Разница в охвате
 * намеренная, но нигде не была названа, и следующий правлящий счёл бы её как
 * ошибку.
 */
export function слотыВетки(
  слоты: Char['slots'],
  extraWeaponSets: readonly WeaponSet[] = [],
  extraArmorSets: readonly ArmorSet[] = [],
): { занято: number; всего: number } {
  let занято = 0
  let всего = 0
  for (const k of SLOT_KEYS as readonly SlotKey[]) {
    const ячейки = слоты[k] ?? []
    всего += ячейки.length
    for (const e of ячейки) if (e) занято += 1
  }
  for (const набор of extraWeaponSets) {
    for (const k of WEAPON_SLOTS) {
      const ячейки = набор[k] ?? []
      всего += ячейки.length
      for (const e of ячейки) if (e) занято += 1
    }
  }
  for (const набор of extraArmorSets) {
    for (const k of ARMOR_SLOTS) {
      const ячейки = набор[k] ?? []
      всего += ячейки.length
      for (const e of ячейки) if (e) занято += 1
    }
  }
  return { занято, всего }
}

/**
 * Занятые слоты персонажа целиком, включая сабы.
 *
 * Сабы считаются наравно с основной профессией: надето оно на том же
 * персонаже, и в комплекте эта вещь тоже засчитывается. Поэтому у персонажа
 * с одним сабом здесь двадцать четыре слота, а на карточке — двенадцать.
 */
export function слотыПерсонажа(char: Char): { занято: number; всего: number } {
  let занято = 0
  let всего = 0
  for (const ветка of branchesOf(char)) {
    const счёт = слотыВетки(ветка.slots, ветка.extraWeaponSets, ветка.extraArmorSets)
    занято += счёт.занято
    всего += счёт.всего
  }
  return { занято, всего }
}

export interface Summary {
  chars: number
  /** Сколько слотов всего и сколько занято — полезно видеть прогресс по чарам. */
  gearSlots: { total: number; filled: number }
  warehouseItems: number
  warehouseKinds: number
  goalsOpen: number
  goalsDone: number
  setsDone: number
  setsTotal: number
}

export function computeSummary(db: Db): Summary {
  let total = 0
  let filled = 0
  for (const c of db.chars) {
    const счёт = слотыПерсонажа(c)
    total += счёт.всего
    filled += счёт.занято
  }
  const sets = computeSets(db)
  return {
    chars: db.chars.length,
    gearSlots: { total, filled },
    warehouseKinds: db.warehouse.stacks.length,
    warehouseItems: db.warehouse.stacks.reduce((a, s) => a + s.count, 0),
    // Отклонённая цель в работе не числится: её решение уже принято, и держать
    // её в счётчике активных значит врать о том, над чем пати работает.
    goalsOpen: db.goals.filter((цель) => статусЦели(цель) === 'активная').length,
    goalsDone: db.goals.filter((цель) => цельВыполнена(цель)).length,
    setsDone: sets.filter((s) => s.complete).length,
    setsTotal: sets.length,
  }
}
