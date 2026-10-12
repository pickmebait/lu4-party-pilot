import { useState } from 'react'
import {
  AFFILIATIONS,
  DEFAULT_AFFILIATION,
  SLOTS,
  affiliationLabel,
  type Affiliation,
  type Char,
  type SlotKey,
} from '@/types'
import type { CatalogApi } from '@/lib/catalog'
import { addChar, emptyChar, equipItem, useDb, type Branch } from '@/lib/store'
import { sortedChars } from '@/lib/derived'
import { ItemPicker } from './ItemPicker'
import { CharCard } from './CharCard'
import { CharRow } from './CharRow'
import { AffiliationSelect } from './AffiliationSelect'
import { ClassSelect, LevelInput } from './ClassLevel'
import { clampLevel } from '@/lib/classes'

/**
 * Куда надевается предмет: ветка (персонаж целиком или его саб-класс),
 * слот и номер ячейки.
 *
 * Ветка хранится целиком, а не разобранными charId и subId: пикер живёт
 * отдельно от карточки и не должен знать, что такое саб-класс.
 */
interface PickerTarget extends Branch {
  slot: SlotKey
  index: number
}

/** Фильтр по принадлежности: любая из трёх либо показывать всех. */
type Фильтр = Affiliation | 'все'

/**
 * Вид раздела: карточки в строку или персонажи в столбец.
 *
 * Строка — привычный вид, где персонажа видно целиком. Колонка — для
 * сравнения: вся пати по вертикали, по одной строке на человека, и
 * видно сразу, у кого что надето.
 *
 * Выбор живёт в состоянии вкладки, а не в базе: это способ посмотреть,
 * а не данные пати.
 */
type Вид = 'строка' | 'колонка'

const ВИДЫ: { key: Вид; label: string; подсказка: string }[] = [
  { key: 'строка', label: 'Строка', подсказка: 'Персонажи в строку, карточка целиком' },
  { key: 'колонка', label: 'Колонка', подсказка: 'Персонажи в столбец, компактно' },
]

export function CharsView({ catalog }: { catalog: CatalogApi }) {
  const [target, setTarget] = useState<PickerTarget | null>(null)
  const [quickAdd, setQuickAdd] = useState(false)
  const [фильтр, setФильтр] = useState<Фильтр>('все')
  const [вид, setВид] = useState<Вид>('строка')

  const db = useDb()
  const все = sortedChars(db.chars)
  const показанные = фильтр === 'все' ? все : все.filter((c) => c.affil === фильтр)

  return (
    <section className="view">
      <div className="view-head">
        <h2>
          Персонажи
          {фильтр !== 'все' && (
            <span className="head-note">
              показано {показанные.length} из {все.length}
            </span>
          )}
        </h2>
        <div className="view-actions affil">
          {/*
           * Фильтр и кнопка стоят рядом и растягиваются по общей высоте:
           * кнопка ниже — шапка перестаёт занимать две строки.
           */}
          <div className="segmented" role="group" aria-label="Фильтр по принадлежности">
            <button
              type="button"
              className={фильтр === 'все' ? 'on' : ''}
              onClick={() => setФильтр('все')}
            >
              Все
            </button>
            {AFFILIATIONS.map((a) => (
              <button
                key={a.key}
                type="button"
                className={фильтр === a.key ? 'on' : ''}
                onClick={() => setФильтр(a.key)}
              >
                {a.label}
              </button>
            ))}
          </div>
          <div className="segmented" role="group" aria-label="Вид раздела">
            {ВИДЫ.map((в) => (
              <button
                key={в.key}
                type="button"
                className={вид === в.key ? 'on' : ''}
                title={в.подсказка}
                onClick={() => setВид(в.key)}
              >
                {в.label}
              </button>
            ))}
          </div>
          <button className="btn add-char" onClick={() => setQuickAdd(true)}>
            + Персонаж
          </button>
        </div>
      </div>

      <div className={вид === 'строка' ? 'chars-grid' : 'chars-col'}>
        <DbChars
          вид={вид}
          chars={показанные}
          всего={все.length}
          фильтр={фильтр}
          сбросить={() => setФильтр('все')}
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

/** Список персонажей: вынесен, чтобы пустое состояние не мешало вёрстке. */
function DbChars({
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

/** Окно выбора предмета с фильтрами по типу и грейду. */
function SlotPicker({
  target,
  catalog,
  onClose,
}: {
  target: PickerTarget
  catalog: CatalogApi
  onClose: () => void
}) {
  const onPick = (itemId: number) => {
    const chosen = catalog.byId(itemId)
    if (!chosen) return
    // Правила занятости живут в store: двуручное оружие освобождает
    // левую руку, цельная броня — низ.
    equipItem(target, target.slot, target.index, chosen)
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

function QuickAddForm({
  onDone,
  onCancel,
}: {
  onDone: (name: string, cls: string, level: number, affil: Affiliation) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [cls, setCls] = useState('')
  const [level, setLevel] = useState('')
  // Принадлежность всегда задана: по умолчанию состав, его подходит
  // большинству, и он же первый в порядке показа.
  const [affil, setAffil] = useState<Affiliation>(DEFAULT_AFFILIATION)
  const ok = name.trim().length > 0

  const submit = () => {
    if (!ok) return
    const l = clampLevel(level)
    onDone(name.trim(), cls, l === '' ? 0 : Number(l), affil)
  }

  return (
    <div className="form">
      <label>
        Имя персонажа
        <input
          className="input"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      </label>

      <div className="row">
        <label className="grow">
          Профессия
          <ClassSelect value={cls} onChange={setCls} />
        </label>
        <label>
          Уровень
          <LevelInput value={level} onChange={setLevel} />
        </label>
      </div>

      <AffiliationSelect value={affil} onChange={setAffil} />

      <div className="form-actions">
        <button className="btn" onClick={onCancel}>
          Отмена
        </button>
        <button className="btn primary" disabled={!ok} onClick={submit}>
          Добавить
        </button>
      </div>
    </div>
  )
}


