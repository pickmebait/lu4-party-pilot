import { SLOTS, type ItemEffectChoice, type SlotKey } from '@/types'
import type { CatalogApi } from '@/lib/catalog'
import { equipItem, type Branch } from '@/lib/store'
import { ItemPicker } from './ItemPicker'

/**
 * Куда надевается предмет: ветка (персонаж целиком или его саб-класс),
 * слот и номер ячейки.
 *
 * Ветка хранится целиком, а не разобранными charId и subId: пикер живёт
 * отдельно от карточки и не должен знать, что такое саб-класс.
 */
export interface PickerTarget extends Branch {
  slot: SlotKey
  index: number
}

/** Окно выбора предмета с фильтрами по типу и грейду. */
export function SlotPicker({
  target,
  catalog,
  onClose,
}: {
  target: PickerTarget
  catalog: CatalogApi
  onClose: () => void
}) {
  const onPick = (itemId: number, choice?: ItemEffectChoice) => {
    const chosen = catalog.byId(itemId)
    if (!chosen) return
    // Правила занятости живут в store: двуручное оружие освобождает
    // левую руку, цельная броня — низ. Выбранные SA и редкий эффект
    // сохраняются вместе с вещью в ячейке.
    equipItem(target, target.slot, target.index, chosen, choice)
    onClose()
  }

  return (
    <ItemPicker
      catalog={catalog}
      slot={SLOTS[target.slot]}
      onPick={onPick}
      onClose={onClose}
    />
  )
}
