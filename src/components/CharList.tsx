import { affiliationLabel, type Affiliation, type Char, type SlotKey } from '@/types'
import type { CatalogApi } from '@/lib/catalog'
import type { Branch } from '@/lib/store'
import { CharCard } from './CharCard'
import { CharRow } from './CharRow'

/** Фильтр по принадлежности: любая из трёх либо показывать всех. */
export type Фильтр = Affiliation | 'все'

/**
 * Вид раздела: карточки в строку или персонажи в столбец.
 *
 * Строка — привычный вид, где персонажа видно целиком. Колонка — для
 * сравнения: вся пати по вертикали, по одной строке на человека, и
 * видно сразу, у кого что надето.
 */
export type Вид = 'строка' | 'колонка'

/**
 * Сам список и пустые состояния.
 *
 * Вынесено из оболочки вкладки, чтобы та занималась только фильтром и видом,
 * а «персонажей нет» и «в группе никого нет» стояли рядом с разметкой списка.
 */
export function СписокПерсонажей({
  вид,
  chars,
  всего,
  фильтр,
  сбросить,
  catalog,
  onPick,
}: {
  вид: Вид
  chars: Char[]
  всего: number
  фильтр: Фильтр
  сбросить: () => void
  catalog: CatalogApi
  onPick: (ветка: Branch, slot: SlotKey, index: number) => void
}) {
  if (всего === 0) {
    return (
      <div className="empty">
        <p>Персонажей пока нет.</p>
        <p className="hint">
          Добавь членов пати — потом наполни экипировку. После правок нажми «Сохранить»,
          чтобы остальные увидели изменения.
        </p>
      </div>
    )
  }

  /*
   * Пати пустое не бывает, а выбранная группа — бывает: без отдельного
   * случая фильтр просто гасил бы экран, и человек решил бы, что
   * персонажи пропали.
   */
  if (chars.length === 0) {
    return (
      <div className="empty">
        <p>В группе «{affiliationLabel(фильтр)}» никого нет.</p>
        <p className="hint">
          <button className="link-btn" onClick={сбросить}>
            Показать всех
          </button>
        </p>
      </div>
    )
  }

  return (
    <>
      {chars.map((c) =>
        вид === 'строка' ? (
          <CharCard key={c.id} char={c} catalog={catalog} onPick={onPick} />
        ) : (
          <CharRow key={c.id} char={c} catalog={catalog} onPick={onPick} />
        ),
      )}
    </>
  )
}
