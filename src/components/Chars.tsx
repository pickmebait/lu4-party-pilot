import { useState } from 'react'
import { SLOTS, SLOT_GROUPS, type Char, type SlotKey } from '@/types'
import type { CatalogApi } from '@/lib/catalog'
import {
  addChar,
  emptyChar,
  equipItem,
  removeChar,
  setSlotEnch,
  transferSlot,
  unequipItem,
  updateChar,
  useDb,
} from '@/lib/store'
import { ItemPicker, gradeLabel, matches } from './ItemPicker'
import { ItemIcon } from './ItemIcon'
import { ClassSelect, LevelInput } from './ClassLevel'
import { clampLevel } from '@/lib/classes'

interface PickerTarget {
  charId: string
  slot: SlotKey
  index: number
}

/** Значение фильтра «покажи только этот предмет». */
const NO_FILTER = ''

export function CharsView({ catalog }: { catalog: CatalogApi }) {
  const [target, setTarget] = useState<PickerTarget | null>(null)
  const [q, setQ] = useState(NO_FILTER)
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

      <input
        className="input filter-wide"
        placeholder="Фильтр по предмету во всех слотах…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="chars-grid">
        <DbChars
          catalog={catalog}
          filter={q}
          onPick={(charId, slot, index) => setTarget({ charId, slot, index })}
        />
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

/** Список персонажей: вынесен, чтобы фильтр читался из одного места. */
function DbChars({
  catalog,
  filter,
  onPick,
}: {
  catalog: CatalogApi
  filter: string
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
        <CharCard key={c.id} char={c} catalog={catalog} filter={filter} onPick={onPick} />
      ))}
    </>
  )
}

/** Окно выбора предмета с фильтром по типу слота. */
function SlotPicker({
  target,
  catalog,
  onClose,
}: {
  target: PickerTarget
  catalog: CatalogApi
  onClose: () => void
}) {
  const db = useDb()
  const slotDef = SLOTS[target.slot]
  const char = db.chars.find((c) => c.id === target.charId)

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
      title={`${slotDef.label} — ${char?.name || 'персонаж'}`}
      accepts={slotDef.accepts}
      hint={slotDef.hint}
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

function CharCard({
  char,
  catalog,
  filter,
  onPick,
}: {
  char: Char
  catalog: CatalogApi
  filter: string
  onPick: (charId: string, slot: SlotKey, index: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  let filled = 0
  let total = 0
  for (const g of SLOT_GROUPS) {
    for (const key of g.slots) {
      total += SLOTS[key].max
      filled += (char.slots[key] ?? []).filter(Boolean).length
    }
  }

  return (
    <article className="char-card">
      <header className="char-head">
        <div className="char-id">
          {editing ? (
            <EditForm
              char={char}
              onDone={(patch) => {
                updateChar(char.id, patch)
                setEditing(false)
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <>
              <h3>{char.name || 'Без имени'}</h3>
              <div className="char-meta">
                {char.cls && <span className="chip">{char.cls}</span>}
                {char.level > 0 && <span className="chip">ур. {char.level}</span>}
                <span className="chip subtle">
                  {filled} / {total} слотов
                </span>
              </div>
            </>
          )}
        </div>
        <div className="char-tools">
          <button className="icon-btn" title="Переименовать" onClick={() => setEditing((v) => !v)}>
            ✎
          </button>
          <button className="icon-btn danger" title="Удалить персонажа" onClick={() => setConfirmDelete(true)}>
            🗑
          </button>
        </div>
      </header>

      {confirmDelete && (
        <div className="confirm">
          <span>Удалить «{char.name || 'персонажа'}»?</span>
          <button
            className="btn tiny danger"
            onClick={() => {
              removeChar(char.id)
              setConfirmDelete(false)
            }}
          >
            Да
          </button>
          <button className="btn tiny" onClick={() => setConfirmDelete(false)}>
            Нет
          </button>
        </div>
      )}

      {SLOT_GROUPS.map((group) => (
        <section key={group.key} className="gear-group">
          <h4>{group.label}</h4>
          <div className="gear">
            {group.slots.map((key) => (
              <SlotCells
                key={key}
                char={char}
                catalog={catalog}
                slot={key}
                filter={filter}
                onPick={(index) => onPick(char.id, key, index)}
              />
            ))}
          </div>
        </section>
      ))}

    </article>
  )
}

function SlotCells({
  char,
  catalog,
  slot,
  filter,
  onPick,
}: {
  char: Char
  catalog: CatalogApi
  slot: SlotKey
  filter: string
  onPick: (index: number) => void
}) {
  const def = SLOTS[slot]
  const arr = char.slots[slot] ?? []
  const [enchEdit, setEnchEdit] = useState<{ index: number; value: string } | null>(null)
  const [transfer, setTransfer] = useState<number | null>(null)

  return (
    <div className="gear-slot">
      <div className="gear-label">
        {def.label}
        {def.max > 1 && <span className="gear-count">{arr.filter(Boolean).length}/{def.max}</span>}
      </div>
      <div className="gear-cells">
        {arr.map((entry, i) => {
          const name = entry ? catalog.nameOf(entry.itemId) : ''
          // При активном фильтре приглушаем всё, что не подходит по названию.
          const hide = filter.trim() !== NO_FILTER && (!entry || !matches(name, filter))

          if (!entry) {
            return (
              <button
                key={i}
                className={`gear-cell empty ${hide ? 'dim' : ''}`}
                title={`${def.label}: пусто`}
                onClick={() => onPick(i)}
              >
                +
              </button>
            )
          }

          const item = catalog.byId(entry.itemId)
          const grade = item?.grade
          const editingEnch = enchEdit?.index === i

          return (
            <div
              key={i}
              className={`gear-cell filled ${hide ? 'dim' : ''} ${
                typeof grade === 'number' ? `g${Math.min(16, Math.max(0, grade))}` : ''
              } ${entry.spans ? 'spans' : ''}`}
              title={[
                name,
                entry.ench ? `(${entry.ench})` : '',
                entry.spans ? 'занимает два слота' : '',
                item?.twoHanded ? 'двуручное' : '',
                item?.dual ? 'дуальное' : '',
                item?.fullbody ? 'цельная броня' : '',
                item?.weaponClass,
                typeof item?.atkPhys === 'number' ? `физ. АТК ${item.atkPhys}` : '',
                typeof item?.atkMag === 'number' ? `маг. АТК ${item.atkMag}` : '',
                typeof item?.physDef === 'number' ? `физ. ЗАЩ ${item.physDef}` : '',
                typeof item?.mDef === 'number' ? `маг. ЗАЩ ${item.mDef}` : '',
                item?.set,
              ]
                .filter(Boolean)
                .join(' · ')}
            >
              {editingEnch ? (
                <div className="ench-editor">
                  <input
                    className="input tiny-input"
                    autoFocus
                    value={enchEdit.value}
                    placeholder="+16"
                    onChange={(e) => setEnchEdit({ index: i, value: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setSlotEnch(char.id, slot, i, enchEdit.value)
                        setEnchEdit(null)
                      }
                      if (e.key === 'Escape') setEnchEdit(null)
                    }}
                  />
                  <button
                    className="btn tiny"
                    onClick={() => {
                      setSlotEnch(char.id, slot, i, enchEdit.value)
                      setEnchEdit(null)
                    }}
                  >
                    ✓
                  </button>
                </div>
              ) : (
                <>
                  <button className="cell-main" onClick={() => onPick(i)}>
                    <span className="cell-icon">
                      <ItemIcon item={item} name={name} size={26} />
                    </span>
                    <span className="cell-text">
                      <span className="cell-name">{name}</span>
                      <span className="cell-sub">
                        {entry.ench && <span className="chip ench">{entry.ench}</span>}
                        {typeof grade === 'number' && grade > 0 && (
                          <span className="chip grade">{gradeLabel(grade)}</span>
                        )}
                        {entry.spans && <span className="chip span">2 слота</span>}
                        <span className="cell-id">#{entry.itemId}</span>
                      </span>
                    </span>
                  </button>
                  <div className="cell-tools">
                    <button
                      className="icon-btn tiny"
                      title="Заточка"
                      onClick={() => setEnchEdit({ index: i, value: entry.ench ?? '' })}
                    >
                      ✦
                    </button>
                    <button
                      className="icon-btn tiny"
                      title="Передать другому персонажу"
                      onClick={() => setTransfer(i)}
                    >
                      →
                    </button>
                    <button
                      className="icon-btn tiny danger"
                      title={entry.spans ? 'Снять с обоих слотов' : 'Снять'}
                      onClick={() => unequipItem(char.id, slot, i)}
                    >
                      ✕
                    </button>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {transfer !== null && (
        <TransferModal
          char={char}
          from={{ slot, index: transfer }}
          onClose={() => setTransfer(null)}
        />
      )}
    </div>
  )
}

function TransferModal({
  char,
  from,
  onClose,
}: {
  char: Char
  from: { slot: SlotKey; index: number }
  onClose: () => void
}) {
  const db = useDb()
  const [note, setNote] = useState<string | null>(null)
  const others = db.chars.filter((c) => c.id !== char.id)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal small" onClick={(e) => e.stopPropagation()}>
        <h3>Передать предмет</h3>
        <p className="hint">
          Передать вещь из слота «{SLOTS[from.slot].label}» другому персонажу?
          Слот получателя должен быть свободен.
        </p>
        <div className="transfer-list">
          {others.map((c) => {
            const free = (c.slots[from.slot] ?? []).some((e) => e === null)
            return (
              <button
                key={c.id}
                className="btn"
                disabled={!free}
                title={free ? 'Передать' : 'Слот занят'}
                onClick={() => {
                  const ok = transferSlot(char.id, from.slot, from.index, c.id)
                  if (ok) onClose()
                  else setNote(`У «${c.name || 'персонажа без имени'}» слот занят.`)
                }}
              >
                {c.name || 'Без имени'}
                {!free && <span className="chip subtle">занято</span>}
              </button>
            )
          })}
          {others.length === 0 && <p className="hint">Добавь второго персонажа, чтобы передавать вещи.</p>}
        </div>
        {note && <div className="sync-msg err">{note}</div>}
        <div className="form-actions">
          <button className="btn" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}

function EditForm({
  char,
  onDone,
  onCancel,
}: {
  char: Char
  onDone: (patch: Partial<Char>) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(char.name)
  const [cls, setCls] = useState(char.cls)
  const [level, setLevel] = useState(char.level > 0 ? String(char.level) : '')

  const save = () =>
    onDone({
      name: name.trim(),
      cls,
      level: clampLevel(level) === '' ? 0 : Number(clampLevel(level)),
    })

  return (
    <div className="edit-form">
      <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      <div className="row">
        <div className="grow">
          <ClassSelect value={cls} onChange={setCls} />
        </div>
        <LevelInput value={level} onChange={setLevel} />
      </div>
      <div className="row">
        <button className="btn tiny primary" onClick={save}>
          Сохранить
        </button>
        <button className="btn tiny" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </div>
  )
}
