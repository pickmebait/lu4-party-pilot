import { affiliationLabel, type Affiliation, type Char, type SlotKey } from '@/types'
import type { CatalogApi } from '@/lib/catalog'
import type { Branch } from '@/lib/store'
import { CharCard } from './CharCard'
import { CharRow, CharRowFoot, CharRowHead } from './CharRow'

/** Фильтр по принадлежности: любая из трёх либо показывать всех. */
export type Фильтр = Affiliation | 'все'

/**
 * Вид раздела: карточки в строку или персонажи в столбец.
 *
 * Строка — привычный вид, где персонажа видно целиком. Колонка — таблица
 * для сравнения: вся пати по вертикали, двенадцать слотов на своих местах,
 * видно сразу, у кого что надето и где дыры.
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

  /*
   * «Колонка» — одна таблица на всю пати, а не набор отдельных строк:
   * шапка с подписями слотов должна быть общей, иначе двенадцать колонок
   * не с чем сверить, а границы строк складываются в общую сетку.
   */
  if (вид === 'колонка') {
    return (
      <div className="chars-matrix">
        <div className="mx-scroll">
          <CharRowHead />
          {chars.map((c) => (
            <CharRow key={c.id} char={c} catalog={catalog} onPick={onPick} />
          ))}
        </div>
        <CharRowFoot />
      </div>
    )
  }

  return (
    <>
      {chars.map((c) => (
        <CharCard key={c.id} char={c} catalog={catalog} onPick={onPick} />
      ))}
    </>
  )
}
