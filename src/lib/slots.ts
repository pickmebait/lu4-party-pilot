import {
  MAX_WEAPON_SETS,
  SLOTS,
  WEAPON_SLOTS,
  type CatalogItem,
  type Char,
  type ItemEffectChoice,
  type SlotEntry,
  type SlotKey,
  type WeaponSet,
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
 *
 * Правила работают не с персонажем, а с любым набором слотов: правило
 * двуручного меча одинаково и для основной профессии, и для саб-класса.
 */

/** Всё, у чего есть слоты: персонаж или его саб-класс. */
export interface GearHolder {
  slots: Char['slots']
}

export function emptySlots(): Char['slots'] {
  const slots: Char['slots'] = {}
  for (const key of Object.keys(SLOTS) as SlotKey[]) {
    slots[key] = new Array(SLOTS[key].max).fill(null)
  }
  return slots
}

/** Пустой дополнительный набор оружия — две руки по одной ячейке. */
export function emptyWeaponSet(): WeaponSet {
  return {
    rhand: new Array(SLOTS.rhand.max).fill(null),
    lhand: new Array(SLOTS.lhand.max).fill(null),
  }
}

/**
 * Все наборы оружия ветки: первый — из обычных слотов, остальные — из
 * extraWeaponSets. Наборы всегда одного вида, поэтому карточка, строка и
 * подсчёт слотов не разбирают, откуда взялся второй.
 */
export function weaponSetsOf(
  слоты: Char['slots'],
  extraWeaponSets: readonly WeaponSet[] = [],
): WeaponSet[] {
  const первый: WeaponSet = {
    rhand: слоты.rhand ?? new Array(SLOTS.rhand.max).fill(null),
    lhand: слоты.lhand ?? new Array(SLOTS.lhand.max).fill(null),
  }
  return [первый, ...extraWeaponSets]
    .slice(0, MAX_WEAPON_SETS)
    .map((набор) => ({
      rhand: набор.rhand ?? new Array(SLOTS.rhand.max).fill(null),
      lhand: набор.lhand ?? new Array(SLOTS.lhand.max).fill(null),
    }))
}

/** Слоты одного дополнительного набора в виде обычного набора слотов. */
export function weaponSetSlots(набор: WeaponSet): Char['slots'] {
  const слоты: Char['slots'] = {}
  for (const key of WEAPON_SLOTS) слоты[key] = набор[key]
  return слоты
}

/** Слот, который предмет занимает вместе с указанным. */
export function partnerSlot(slot: SlotKey, item: CatalogItem | null | undefined): SlotKey | null {
  if (slot === 'rhand' && (item?.twoHanded || item?.dual)) return 'lhand'
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
export function conflictsFor(holder: GearHolder, slot: SlotKey, item: CatalogItem): SlotKey[] {
  const out: SlotKey[] = []

  // Новый предмет занимает два слота — второй должен освободиться.
  const partner = partnerSlot(slot, item)
  if (partner && (holder.slots[partner] ?? []).some(Boolean)) out.push(partner)

  // Обратный случай: надеваем обычный предмет в один из слотов пары,
  // а второй сейчас занят многослотным. Проверяем обе стороны, иначе
  // щит занял бы левую руку поверх двуручного меча.
  const newItemSpans = partner !== null
  if (!newItemSpans) {
    for (const [a, b] of SPAN_PAIRS) {
      if (slot !== a && slot !== b) continue
      if (!spansTogether(holder, a, b)) continue
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
function spansTogether(holder: GearHolder, a: SlotKey, b: SlotKey): boolean {
  const first = holder.slots[a]?.find(Boolean)
  const second = holder.slots[b]?.find(Boolean)
  if (!first || !second) return false
  if (first.itemId !== second.itemId) return false
  return first.spans === true || second.spans === true
}

/**
 * Надевает предмет. Возвращает подписи слотов, которые пришлось занять
 * заново, чтобы интерфейс мог об этом сказать.
 */
export function equip(
  holder: GearHolder,
  slot: SlotKey,
  index: number,
  item: CatalogItem,
  choice?: ItemEffectChoice,
): string[] {
  const displaced: string[] = []

  for (const key of conflictsFor(holder, slot, item)) {
    if ((holder.slots[key] ?? []).some(Boolean)) displaced.push(SLOTS[key].label)
    holder.slots[key] = (holder.slots[key] ?? blank(SLOTS[key].max)).map(() => null)
  }

  const entry: SlotEntry = { itemId: item.id }
  if (choice?.sa) entry.sa = choice.sa
  if (choice?.rare) entry.rare = true
  const own = [...(holder.slots[slot] ?? blank(SLOTS[slot].max))]
  const previous = own[index]
  if (previous && !previous.spans) displaced.push(SLOTS[slot].label)
  own[index] = entry
  holder.slots[slot] = own

  // Второй слот: предмет лежит в базе один раз, а виден в обоих местах.
  const partner = partnerSlot(slot, item)
  if (partner) {
    if ((holder.slots[partner] ?? []).some(Boolean)) displaced.push(SLOTS[partner].label)
    holder.slots[partner] = blank(SLOTS[partner].max).map(() => ({ ...entry, spans: true }))
  }

  return [...new Set(displaced)]
}

function blank(n: number): (SlotEntry | null)[] {
  return new Array(n).fill(null)
}

/**
 * Второй слот, если предмет занимает оба.
 *
 * Отметка spans стоит на копии, а не на оригинале: при надевании оригинал
 * кладётся туда, куда нажали, а копия — в парный слот. Поэтому пару ищем
 * сразу по обоим признакам: и по отметке у соседа, и по отметке у того,
 * что снимают.
 *
 * Раньше стояло только «есть отметка у соседа», и двуручное оружие снималось
 * лишь из одной руки — из правой в левой оставалась его копия. Обратная
 * проверка тоже не годится: два одинаковых предмета в разных руках — это
 * разные вещи, и снимать надо один.
 */
export function partnerOf(
  holder: GearHolder,
  slot: SlotKey,
  itemId: number,
  снятыйПомечен: boolean,
): SlotKey | null {
  for (const [a, b] of SPAN_PAIRS) {
    if (slot !== a && slot !== b) continue
    const другой = slot === a ? b : a
    const сосед = (holder.slots[другой] ?? []).some(
      (e) => e?.itemId === itemId && (e?.spans === true || снятыйПомечен),
    )
    if (сосед) return другой
  }
  return null
}

/**
 * Снимает предмет. Если он занимал два слота, освобождаются оба.
 */
export function unequip(holder: GearHolder, slot: SlotKey, index: number): void {
  const arr = [...(holder.slots[slot] ?? [])]
  const entry = arr[index]
  arr[index] = null
  holder.slots[slot] = arr
  if (!entry) return

  const другой = partnerOf(holder, slot, entry.itemId, entry.spans === true)
  if (другой) holder.slots[другой] = holder.slots[другой]!.map(() => null)
}