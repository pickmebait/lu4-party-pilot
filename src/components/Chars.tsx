import { useState } from 'react'
import { SLOTS, type SlotKey } from '@/types'
import type { CatalogApi } from '@/lib/catalog'
import { addChar, emptyChar, equipItem, useDb } from '@/lib/store'
import { ItemPicker } from './ItemPicker'
import { CharCard } from './CharCard'
import { ClassSelect, LevelInput } from './ClassLevel'
import { clampLevel } from '@/lib/classes'

interface PickerTarget {
  charId: string
  slot: SlotKey
  index: number
}

export function CharsView({ catalog }: { catalog: CatalogApi }) {
  const [target, setTarget] = useState<PickerTarget | null>(null)
  const [quickAdd, setQuickAdd] = useState(false)

  return (
    <section className="view">
      <div className="view-head">
        <h2>Персонажи</h2>
        <div className="view-actions">
          <button className="btn" onClick={() => setQuickAdd(true)}>
            + Персонаж
          </button>
        </div>
      </div>

      <div className="chars-grid">
        <DbChars catalog={catalog} onPick={(charId, slot, index) => setTarget({ charId, slot, index })} />
      </div>

      {quickAdd && (
        <div className="modal-backdrop" onClick={() => setQuickAdd(false)}>
          <div className="modal small" onClick={(e) => e.stopPropagation()}>
            <h3>Новый персонаж</h3>
            <QuickAddForm
              onDone={(name, cls, level) => {
                addChar({ ...emptyChar(), name, cls, level })
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
  catalog,
  onPick,
}: {
  catalog: CatalogApi
  onPick: (charId: string, slot: SlotKey, index: number) => void
}) {
  const db = useDb()

  if (db.chars.length === 0) {
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

  return (
    <>
      {db.chars.map((c) => (
        <CharCard key={c.id} char={c} catalog={catalog} onPick={onPick} />
      ))}
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
    equipItem(target.charId, target.slot, target.index, chosen)
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
  onDone: (name: string, cls: string, level: number) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [cls, setCls] = useState('')
  const [level, setLevel] = useState('')
  const ok = name.trim().length > 0

  const submit = () => {
    if (!ok) return
    const l = clampLevel(level)
    onDone(name.trim(), cls, l === '' ? 0 : Number(l))
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
