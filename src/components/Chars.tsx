import { useState } from 'react'
import { AFFILIATIONS } from '@/types'
import type { CatalogApi } from '@/lib/catalog'
import { useAccess } from '@/lib/access'
import { addChar, emptyChar, useDb } from '@/lib/store'
import { sortedChars } from '@/lib/derived'
import { СписокПерсонажей, type Вид, type Фильтр } from './CharList'
import { QuickAddForm } from './QuickAddForm'
import { SegPill } from './SegPill'
import { SlotPicker, type PickerTarget } from './SlotPicker'

/*
 * Вид и фильтр живут в модуле, а не в состоянии компонента.
 *
 * Раздел пересоздаётся при каждом переходе на другую вкладку: вернулся — и
 * получил строку вместо колонки, хотя её выбирал минуту назад, чтобы сравнить
 * двоих. Это не данные пати и не то, что человек менял, — просто способ
 * посмотреть, и он должен переживать переключение вкладок.
 */
let сохранённыйВид: Вид = 'строка'
let сохранённыйФильтр: Фильтр = 'все'

const ВИДЫ: { key: Вид; label: string; подсказка: string }[] = [
  { key: 'строка', label: 'Строка', подсказка: 'Персонажи в строку, карточка целиком' },
  { key: 'колонка', label: 'Колонка', подсказка: 'Персонажи в столбец, компактно' },
]

const ФИЛЬТРЫ: { key: Фильтр; label: string }[] = [
  { key: 'все', label: 'Все' },
  ...AFFILIATIONS.map((a) => ({ key: a.key, label: a.label })),
]

export function CharsView({ catalog }: { catalog: CatalogApi }) {
  const [target, setTarget] = useState<PickerTarget | null>(null)
  const [quickAdd, setQuickAdd] = useState(false)
  const [фильтр, setФильтр] = useState<Фильтр>(сохранённыйФильтр)
  const [вид, setВид] = useState<Вид>(сохранённыйВид)

  const выбратьФильтр = (новый: Фильтр) => {
    сохранённыйФильтр = новый
    setФильтр(новый)
  }
  const выбратьВид = (новый: Вид) => {
    сохранённыйВид = новый
    setВид(новый)
  }

  const db = useDb()
  const { master, ownCharId } = useAccess()
  // Свой персонаж — сверху: его ищут в первую очередь, а найти его в
  // середине списка приходилось бы перебирать чужие карточки.
  const все = sortedChars(db.chars, ownCharId)
  const показанные = фильтр === 'все' ? все : все.filter((c) => c.affil === фильтр)

  return (
    <section className="view">
      <div className="view-head">
        <div className="view-actions affil">
          {/*
           * Фильтр и вид стоят слева, как в расписании и сводке: заголовок
           * раздела повторял бы подпись вкладки, а место нужно самим
           * карточкам. Кнопка добавления — справа, у неё другое назначение.
           */}
          <SegPill
            варианты={ФИЛЬТРЫ}
            значение={фильтр}
            onВыбрать={выбратьФильтр}
            ariaLabel="Фильтр по принадлежности"
          />
          <SegPill
            варианты={ВИДЫ.map((в) => ({
              key: в.key,
              label: в.label,
              title: в.подсказка,
            }))}
            значение={вид}
            onВыбрать={выбратьВид}
            ariaLabel="Вид раздела"
          />
          {фильтр !== 'все' && (
            <span className="head-note">
              показано {показанные.length} из {все.length}
            </span>
          )}
        </div>

        {/*
          Добавление персонажа доступно только мастеру: новый персонаж не
          может оказаться «своим» у того, кто вошёл по токену персонажа,
          и сервер такой состав всё равно не примет.
        */}
        {master && (
          <button className="btn tiny primary" onClick={() => setQuickAdd(true)}>
            Добавить персонажа
          </button>
        )}
      </div>

      <div className={вид === 'строка' ? 'chars-grid' : 'chars-col'}>
        <СписокПерсонажей
          вид={вид}
          chars={показанные}
          всего={все.length}
          фильтр={фильтр}
          сбросить={() => выбратьФильтр('все')}
          catalog={catalog}
          onPick={(ветка, slot, index) => setTarget({ ...ветка, slot, index })}
        />
      </div>

      {quickAdd && (
        <div className="modal-backdrop" onClick={() => setQuickAdd(false)}>
          <div className="modal small" onClick={(e) => e.stopPropagation()}>
            <h3>Новый персонаж</h3>
            <QuickAddForm
              onDone={(name, cls, level, affil) => {
                addChar({ ...emptyChar(), name, cls, level, affil })
                setQuickAdd(false)
              }}
              onCancel={() => setQuickAdd(false)}
            />
          </div>
        </div>
      )}

      {target && <SlotPicker target={target} catalog={catalog} onClose={() => setTarget(null)} />}
    </section>
  )
}
