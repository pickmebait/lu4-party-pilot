import { useState } from 'react'
import {
  SLOT_DEFS,
  SLOT_LABEL,
  type Char,
  type SlotKey,
} from '@/types'
import type { CatalogApi } from '@/lib/catalog'
import {
  addChar,
  emptyChar,
  removeChar,
  setSlot,
  setSlotEnch,
  transferSlot,
  updateChar,
  useDb,
} from '@/lib/store'
import { ItemPicker, gradeLabel, matches } from './ItemPicker'

interface PickerTarget {
  charId: string
  slot: SlotKey
  index: number
}

export function CharsView({ catalog }: { catalog: CatalogApi }) {
  const db = useDb()
  const [target, setTarget] = useState<PickerTarget | null>(null)
  const [q, setQ] = useState('')
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

      {db.chars.length === 0 && (
        <div className="empty">
          <p>Персонажей пока нет.</p>
          <p className="hint">
            Добавь членов пати — потом наполни слоты экипировки. Всё хранится в этом браузере,
            синхронизация с репозиторием настраивается в шапке.
          </p>
          <button className="btn primary" onClick={() => setQuickAdd(true)}>
            Добавить персонажа
          </button>
        </div>
      )}

      <div className="chars-grid">
        {db.chars.map((c) => (
          <CharCard
            key={c.id}
            char={c}
            catalog={catalog}
            filter={q}
            onPick={(slot, index) => setTarget({ charId: c.id, slot, index })}
          />
        ))}
      </div>

      {db.chars.length > 0 && (
        <input
          className="input filter-wide"
          placeholder="Фильтр по предмету во всех слотах…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      )}

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

      {target && (
        <ItemPicker
          catalog={catalog}
          title={`${SLOT_LABEL[target.slot]} — ${nameOfChar(db, target.charId)}`}
          onPick={(itemId) => setSlot(target.charId, target.slot, target.index, { itemId })}
          onClose={() => setTarget(null)}
        />
      )}
    </section>
  )
}

function nameOfChar(db: ReturnType<typeof useDb>, id: string): string {
  return db.chars.find((c) => c.id === id)?.name || 'персонаж'
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

  return (
    <div className="form">
      <label>
        Имя персонажа
        <input
          className="input"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && ok) onDone(name.trim(), cls.trim(), Number(level) || 0)
          }}
        />
      </label>
      <label>
        Класс
        <input
          className="input"
          placeholder="SM, Маг, Оракул…"
          value={cls}
          onChange={(e) => setCls(e.target.value)}
        />
      </label>
      <label>
        Уровень
        <input
          className="input"
          inputMode="numeric"
          value={level}
          onChange={(e) => setLevel(e.target.value.replace(/\D/g, ''))}
        />
      </label>
      <div className="form-actions">
        <button className="btn" onClick={onCancel}>
          Отмена
        </button>
        <button
          className="btn primary"
          disabled={!ok}
          onClick={() => onDone(name.trim(), cls.trim(), Number(level) || 0)}
        >
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
  onPick: (slot: SlotKey, index: number) => void
}) {
  const db = useDb()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [transferFrom, setTransferFrom] = useState<{ slot: SlotKey; index: number } | null>(null)
  const [enchEdit, setEnchEdit] = useState<{ slot: SlotKey; index: number; value: string } | null>(null)
  const [transferNote, setTransferNote] = useState<string | null>(null)

  const filled = SLOT_DEFS.reduce(
    (a, s) => a + (char.slots[s.key] ?? []).filter(Boolean).length,
    0,
  )
  const total = SLOT_DEFS.reduce((a, s) => a + s.max, 0)

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
          <button
            className="icon-btn danger"
            title="Удалить персонажа"
            onClick={() => setConfirmDelete(true)}
          >
            🗑
          </button>
        </div>
      </header>

      {confirmDelete && (
        <div className="confirm">
          <span>Удалить «{char.name || 'персонажа'}»?</span>
          <button className="btn tiny danger" onClick={() => { removeChar(char.id); setConfirmDelete(false) }}>
            Да
          </button>
          <button className="btn tiny" onClick={() => setConfirmDelete(false)}>
            Нет
          </button>
        </div>
      )}

      <div className="gear">
        {SLOT_DEFS.map((s) => {
          const arr = char.slots[s.key] ?? []
          return (
            <div className="gear-slot" key={s.key}>
              <div className="gear-label">{s.label}</div>
              <div className="gear-cells">
                {arr.map((entry, i) => {
                  if (!entry) {
                    return (
                      <button
                        key={i}
                        className={`gear-cell empty ${filter ? 'dim' : ''}`}
                        title={`${s.label}: пусто`}
                        onClick={() => onPick(s.key, i)}
                      >
                        +
                      </button>
                    )
                  }
                  const name = catalog.nameOf(entry.itemId)
                  const grade = catalog.byId(entry.itemId)?.grade
                  const hide = filter.trim() && !matches(name, filter)
                  const editingEnch = enchEdit?.slot === s.key && enchEdit.index === i
                  return (
                    <div
                      key={i}
                      className={`gear-cell filled ${hide ? 'dim' : ''} ${
                        typeof grade === 'number' ? `g${Math.min(16, Math.max(0, grade))}` : ''
                      }`}
                      title={`${name}${entry.ench ? ` (${entry.ench})` : ''} — ${s.label}`}
                    >
                      {editingEnch ? (
                        <div className="ench-editor">
                          <input
                            className="input tiny-input"
                            autoFocus
                            value={enchEdit.value}
                            placeholder="+16"
                            onChange={(e) => setEnchEdit({ ...enchEdit, value: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                setSlotEnch(char.id, s.key, i, enchEdit.value)
                                setEnchEdit(null)
                              }
                              if (e.key === 'Escape') setEnchEdit(null)
                            }}
                          />
                          <button
                            className="btn tiny"
                            onClick={() => {
                              setSlotEnch(char.id, s.key, i, enchEdit.value)
                              setEnchEdit(null)
                            }}
                          >
                            ✓
                          </button>
                        </div>
                      ) : (
                        <button className="cell-main" onClick={() => onPick(s.key, i)}>
                          <span className="cell-name">{name}</span>
                          <span className="cell-sub">
                            {entry.ench && <span className="chip ench">{entry.ench}</span>}
                            {typeof grade === 'number' && grade > 0 && (
                              <span className="chip grade">{gradeLabel(grade)}</span>
                            )}
                            <span className="cell-id">#{entry.itemId}</span>
                          </span>
                        </button>
                      )}
                      <div className="cell-tools">
                        <button
                          className="icon-btn tiny"
                          title="Заточка"
                          onClick={() => setEnchEdit({ slot: s.key, index: i, value: entry.ench ?? '' })}
                        >
                          ✦
                        </button>
                        <button
                          className="icon-btn tiny"
                          title="Передать другому персонажу"
                          onClick={() => setTransferFrom({ slot: s.key, index: i })}
                        >
                          →
                        </button>
                        <button
                          className="icon-btn tiny danger"
                          title="Снять"
                          onClick={() => setSlot(char.id, s.key, i, null)}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {transferFrom && (
        <div className="modal-backdrop" onClick={() => { setTransferFrom(null); setTransferNote(null) }}>
          <div className="modal small" onClick={(e) => e.stopPropagation()}>
            <h3>Передать предмет</h3>
            <p className="hint">
              Кому отдать «{catalog.nameOf(char.slots[transferFrom.slot]?.[transferFrom.index]?.itemId ?? 0)}»?
              Слот должен быть свободен.
            </p>
            <div className="transfer-list">
              {db.chars
                .filter((c) => c.id !== char.id)
                .map((c) => {
                  const free = (c.slots[transferFrom.slot] ?? []).some((e) => e === null)
                  return (
                    <button
                      key={c.id}
                      className="btn"
                      disabled={!free}
                      title={free ? 'Передать' : `Слот «${SLOT_LABEL[transferFrom.slot]}» занят`}
                      onClick={() => {
                        const ok = transferSlot(char.id, transferFrom.slot, transferFrom.index, c.id)
                        if (ok) {
                          setTransferFrom(null)
                          setTransferNote(null)
                        } else {
                          setTransferNote(
                            `У «${c.name || 'персонажа без имени'}» нет свободного слота «${SLOT_LABEL[transferFrom.slot]}».`,
                          )
                        }
                      }}
                    >
                      {c.name || 'Без имени'}
                      {!free && <span className="chip subtle">занято</span>}
                    </button>
                  )
                })}
              {db.chars.filter((c) => c.id !== char.id).length === 0 && (
                <p className="hint">Добавь второго персонажа, чтобы передавать вещи.</p>
              )}
            </div>
            {transferNote && <div className="sync-msg err">{transferNote}</div>}
            <div className="form-actions">
              <button
                className="btn"
                onClick={() => {
                  setTransferFrom(null)
                  setTransferNote(null)
                }}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
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
  const [level, setLevel] = useState(String(char.level))
  return (
    <div className="edit-form">
      <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      <div className="row">
        <input
          className="input"
          placeholder="Класс"
          value={cls}
          onChange={(e) => setCls(e.target.value)}
        />
        <input
          className="input narrow"
          inputMode="numeric"
          value={level}
          onChange={(e) => setLevel(e.target.value.replace(/\D/g, ''))}
        />
      </div>
      <div className="row">
        <button
          className="btn tiny primary"
          onClick={() => onDone({ name: name.trim(), cls: cls.trim(), level: Number(level) || 0 })}
        >
          Сохранить
        </button>
        <button className="btn tiny" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </div>
  )
}
