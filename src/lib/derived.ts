import type { Db, SetDef, SlotEntry, SlotKey } from '@/types'
import { SLOT_KEYS } from '@/types'

export interface SetProgress {
  set: SetDef
  /** Сколько уникальных частей объявлено в комплекте. */
  total: number
  /** Сколько частей реально надето на кого-то из пати (уникальных). */
  equipped: number
  /** Сколько частей лежит в общей казне (уникальных). */
  stored: number
  /** id частей, которых нет нигде. */
  missing: number[]
  complete: boolean
}

/** Все id предметов, которые сейчас надеты. */
export function equippedItemIds(db: Db): Set<number> {
  const out = new Set<number>()
  for (const c of db.chars) {
    for (const k of SLOT_KEYS) {
      for (const e of c.slots[k] ?? []) {
        const entry = e as SlotEntry | null
        if (entry) out.add(entry.itemId)
      }
    }
  }
  return out
}

/** Все id предметов, которые встречаются в приложении — для подсказок в поиске. */
export function usedItemIds(db: Db): Set<number> {
  const out = equippedItemIds(db)
  for (const s of db.warehouse.stacks) out.add(s.itemId)
  for (const w of db.wishes) out.add(w.itemId)
  for (const s of db.sets) for (const p of s.pieces) out.add(p)
  return out
}

export function computeSets(db: Db): SetProgress[] {
  const eq = equippedItemIds(db)
  const stored = new Set(db.warehouse.stacks.map((s) => s.itemId))

  return db.sets
    .map((set) => {
      const pieces = [...new Set(set.pieces)]
      let equipped = 0
      let storedCount = 0
      const missing: number[] = []
      for (const p of pieces) {
        if (eq.has(p)) equipped += 1
        else if (stored.has(p)) storedCount += 1
        else missing.push(p)
      }
      return {
        set,
        total: pieces.length,
        equipped,
        stored: storedCount,
        missing,
        complete: pieces.length > 0 && equipped === pieces.length,
      }
    })
    .sort((a, b) => Number(a.complete) - Number(b.complete) || a.set.name.localeCompare(b.set.name))
}

export interface Summary {
  chars: number
  /** Сколько слотов всего и сколько занято — полезно видеть прогресс по чарам. */
  gearSlots: { total: number; filled: number }
  warehouseItems: number
  warehouseKinds: number
  wishesOpen: number
  wishesDone: number
  setsDone: number
  setsTotal: number
}

export function computeSummary(db: Db): Summary {
  let total = 0
  let filled = 0
  for (const c of db.chars) {
    for (const k of SLOT_KEYS as readonly SlotKey[]) {
      const arr = c.slots[k] ?? []
      total += arr.length
      for (const e of arr) if (e) filled += 1
    }
  }
  const sets = computeSets(db)
  return {
    chars: db.chars.length,
    gearSlots: { total, filled },
    warehouseKinds: db.warehouse.stacks.length,
    warehouseItems: db.warehouse.stacks.reduce((a, s) => a + s.count, 0),
    wishesOpen: db.wishes.filter((w) => !w.done).length,
    wishesDone: db.wishes.filter((w) => w.done).length,
    setsDone: sets.filter((s) => s.complete).length,
    setsTotal: sets.length,
  }
}
