import {
  SLOTS,
  type CatalogItem,
  type Char,
  type SlotEntry,
  type SlotKey,
} from '@/types'

/**
 * Правила надевания.
 *
 * Обычный предмет занимает один слот. Два случая занимают сразу два:
 *   - двуручное или дуальное оружие — обе руки;
 *   - цельная броня — верх и низ.
 *
 * Второй слот помечается spans: в базе предмет лежит один раз, а видно
 * его в обоих местах. Так при подсчёте комплектов вещь не считается дважды.
 */

export function emptySlots(): Char['slots'] {
  const slots: Char['slots'] = {}
  for (const key of Object.keys(SLOTS) as SlotKey[]) {
    slots[key] = new Array(SLOTS[key].max).fill(null)
  }
  return slots
}

/** Слот, который предмет занимает вместе с указанным. */
export function partnerSlot(slot: SlotKey, item: CatalogItem | null | undefined): SlotKey | null {
  if (slot === 'rhand' && item?.twoHanded) return 'lhand'
  if (slot === 'chest' && item?.fullbody) return 'legs'
  return null
}

/**
 * Пары слотов, которые занимает один предмет:
 * руки — двуручное оружие, верх и низ — цельная броня.
 */
const SPAN_PAIRS: [SlotKey, SlotKey][] = [
  ['rhand', 'lhand'],
  ['chest', 'legs'],
]

/**
 * Что нужно освободить перед надеванием.
 * Возвращает слоты, которые придётся занять другим предметом.
 */
export function conflictsFor(char: Char, slot: SlotKey, item: CatalogItem): SlotKey[] {
  const out: SlotKey[] = []

  // Новый предмет занимает два слота — второй должен освободиться.
  const partner = partnerSlot(slot, item)
  if (partner && (char.slots[partner] ?? []).some(Boolean)) out.push(partner)

  // Обратный случай: надеваем обычный предмет в один из слотов пары,
  // а второй сейчас занят многослотным. Проверяем обе стороны, иначе
  // щит занял бы левую руку поверх двуручного меча.
  const newItemSpans = partner !== null
  if (!newItemSpans) {
    for (const [a, b] of SPAN_PAIRS) {
      if (slot !== a && slot !== b) continue
      if (!spansTogether(char, a, b)) continue
      out.push(slot === a ? b : a)
    }
  }

  return [...new Set(out)]
}

/**
 * Заняты ли оба слота пары одним и тем же многослотным предметом.
 *
 * Пометка spans ставится только на второй слот пары — на том, где предмет
 * видно, но не задают. Поэтому проверяем флаг с обеих сторон, иначе правило
 * не срабатывало никогда.
 */
function spansTogether(char: Char, a: SlotKey, b: SlotKey): boolean {
  const first = char.slots[a]?.find(Boolean)
  const second = char.slots[b]?.find(Boolean)
  if (!first || !second) return false
  if (first.itemId !== second.itemId) return false
  return first.spans === true || second.spans === true
}

/**
 * Надевает предмет. Возвращает подписи слотов, которые пришлось занять
 * заново, чтобы интерфейс мог об этом сказать.
 */
export function equip(char: Char, slot: SlotKey, index: number, item: CatalogItem): string[] {
  const displaced: string[] = []

  for (const key of conflictsFor(char, slot, item)) {
    if ((char.slots[key] ?? []).some(Boolean)) displaced.push(SLOTS[key].label)
    char.slots[key] = (char.slots[key] ?? blank(SLOTS[key].max)).map(() => null)
  }

  const entry: SlotEntry = { itemId: item.id }
  const own = [...(char.slots[slot] ?? blank(SLOTS[slot].max))]
  const previous = own[index]
  if (previous && !previous.spans) displaced.push(SLOTS[slot].label)
  own[index] = entry
  char.slots[slot] = own

  // Второй слот: предмет лежит в базе один раз, а виден в обоих местах.
  const partner = partnerSlot(slot, item)
  if (partner) {
    if ((char.slots[partner] ?? []).some(Boolean)) displaced.push(SLOTS[partner].label)
    char.slots[partner] = blank(SLOTS[partner].max).map(() => ({ ...entry, spans: true }))
  }

  return [...new Set(displaced)]
}

function blank(n: number): (SlotEntry | null)[] {
  return new Array(n).fill(null)
}

/**
 * Снимает предмет. Если он занимал два слота, освобождаются оба.
 */
export function unequip(char: Char, slot: SlotKey, index: number): void {
  const arr = [...(char.slots[slot] ?? [])]
  const entry = arr[index]
  arr[index] = null
  char.slots[slot] = arr
  if (!entry?.spans) return

  // Второй слот с тем же предметом освобождаем: иначе после снятия
  // двуручного оружия в левой руке осталась бы его копия.
  for (const key of Object.keys(SLOTS) as SlotKey[]) {
    if (key === slot) continue
    if (!char.slots[key]?.some((e) => e?.itemId === entry.itemId)) continue
    char.slots[key] = char.slots[key]!.map(() => null)
    break
  }
}

/** Подходит ли предмет в слот — с учётом того, что слот занят партнёром. */
export function fits(slot: SlotKey, item: CatalogItem): boolean {
  return SLOTS[slot].accepts(item)
}

/** Все слоты, занятые предметом, — нужно для подсчёта комплектов. */
export function slotsOf(char: Char, itemId: number): SlotKey[] {
  const out: SlotKey[] = []
  for (const key of Object.keys(SLOTS) as SlotKey[]) {
    if (char.slots[key]?.some((e) => e?.itemId === itemId)) out.push(key)
  }
  return out
}