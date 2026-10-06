import { useMemo, useState } from 'react'
import { PRIORITY_LABEL, type Priority, type Wish } from '@/types'
import type { CatalogApi } from '@/lib/catalog'
import { addToWarehouse, addWish, removeWish, updateWish, useDb } from '@/lib/store'
import { formatAgo } from '@/lib/util'
import { ItemPicker, matches } from './ItemPicker'

type Filter = 'open' | 'all' | 'done'

export function WishesView({ catalog }: { catalog: CatalogApi }) {
  const db = useDb()
  const [filter, setFilter] = useState<Filter>('open')
  const [q, setQ] = useState('')
  const [draft, setDraft] = useState<{ itemId: number; count: number; priority: Priority; seeker: string; forCharId: string; note: string } | null>(
    null,
  )
  const [checking, setChecking] = useState(false)

  const open = db.wishes.filter((w) => !w.done).length

  const rows = useMemo(() => {
    const list = db.wishes
      .filter((w) => (filter === 'all' ? true : filter === 'done' ? w.done : !w.done))
      .map((w) => ({ ...w, name: catalog.nameOf(w.itemId) }))
      .filter((w) => matches(w.name, q) || matches(w.seeker, q) || matches(w.note ?? '', q))
    return list.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1
      if (a.priority !== b.priority) return a.priority - b.priority
      return a.name.localeCompare(b.name, 'ru')
    })
  }, [db.wishes, filter, q, catalog])

  const done = (w: Wish) =>
    updateWish(w.id, { done: true, doneAt: new Date().toISOString() })

  const undone = (w: Wish) => updateWish(w.id, { done: false, doneAt: undefined })

  return (
    <section className="view">
      <div className="view-head">
        <h2>
          Хотелки <span className="muted">{open} активных</span>
        </h2>
        <div className="view-actions">
          <div className="segmented">
            {(['open', 'all', 'done'] as Filter[]).map((f) => (
              <button
                key={f}
                className={filter === f ? 'on' : ''}
                onClick={() => setFilter(f)}
              >
                {f === 'open' ? 'Активные' : f === 'all' ? 'Все' : 'Выполненные'}
              </button>
            ))}
          </div>
          <button className="btn primary" onClick={() => setChecking(true)}>
            + Хотелка
          </button>
        </div>
      </div>

      <input
        className="input filter-wide"
        placeholder="Поиск по предмету, нику или заметке…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {rows.length === 0 && (
        <div className="empty">
          <p>Хотелок пока нет.</p>
          <p className="hint">
            Добавь то, что ищете для пати. Укажи, кто ищет и для кого — так не придётся
            переспрашивать в чате.
          </p>
        </div>
      )}

      <div className="wish-list">
        {rows.map((w) => {
          const forChar = db.chars.find((c) => c.id === w.forCharId)
          return (
            <article key={w.id} className={`wish ${w.done ? 'done' : ''} p${w.priority}`}>
              <label className="wish-check" title={w.done ? 'Вернуть в активные' : 'Отметить выполненной'}>
                <input type="checkbox" checked={w.done} onChange={() => (w.done ? undone(w) : done(w))} />
              </label>
              <div className="wish-main">
                <div className="wish-title">
                  <span className="prio">{PRIORITY_LABEL[w.priority]}</span>
                  <span className="name">{w.name}</span>
                  {w.count > 1 && (
                    <span className="chip">{w.count} шт.</span>
                  )}
                </div>
                <div className="wish-meta">
                  <span>ищет: {w.seeker || '—'}</span>
                  {forChar && <span>для: {forChar.name}</span>}
                  {w.note && <span className="note">{w.note}</span>}
                  {w.done && w.doneAt && (
                    <span className="muted">выполнено {formatAgo(w.doneAt)}</span>
                  )}
                </div>
              </div>
              <div className="wish-tools">
                {!w.done && (
                  <>
                    <button
                      className="btn tiny"
                      title="Отметить выполненной и сразу положить в общую казну"
                      onClick={() => {
                        addToWarehouse(w.itemId, w.count)
                        done(w)
                      }}
                    >
                      Нашёл в казну
                    </button>
                    <button className="btn tiny" onClick={() => done(w)}>
                      Готово
                    </button>
                  </>
                )}
                {w.done && (
                  <button className="btn tiny" onClick={() => undone(w)}>
                    Вернуть
                  </button>
                )}
                <button
                  className="icon-btn danger tiny"
                  title="Удалить"
                  onClick={() => removeWish(w.id)}
                >
                  🗑
                </button>
              </div>
            </article>
          )
        })}
      </div>

      {checking && (
        <ItemPicker
          catalog={catalog}
          title="Что нужно?"
          onPick={(itemId) => {
            const char = db.chars[0]
            setDraft({
              itemId,
              count: 1,
              priority: 2,
              seeker: char?.name ?? '',
              forCharId: char?.id ?? '',
              note: '',
            })
          }}
          onClose={() => setChecking(false)}
        />
      )}

      {draft && (
        <WishForm
          draft={draft}
          onChange={setDraft}
          onSubmit={() => {
            addWish({
              itemId: draft.itemId,
              count: Math.max(1, draft.count || 1),
              priority: draft.priority,
              seeker: draft.seeker.trim(),
              forCharId: draft.forCharId || undefined,
              note: draft.note.trim() || undefined,
            })
            setDraft(null)
          }}
          onCancel={() => setDraft(null)}
        />
      )}
    </section>
  )
}

function WishForm({
  draft,
  onChange,
  onSubmit,
  onCancel,
}: {
  draft: { itemId: number; count: number; priority: Priority; seeker: string; forCharId: string; note: string }
  onChange: (d: { itemId: number; count: number; priority: Priority; seeker: string; forCharId: string; note: string }) => void
  onSubmit: () => void
  onCancel: () => void
}) {
  const db = useDb()
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal small" onClick={(e) => e.stopPropagation()}>
        <h3>Новая хотелка</h3>
        <div className="form">
          <label>
            Приоритет
            <div className="segmented">
              {([1, 2, 3] as Priority[]).map((p) => (
                <button
                  key={p}
                  className={draft.priority === p ? 'on' : ''}
                  onClick={() => onChange({ ...draft, priority: p })}
                >
                  {PRIORITY_LABEL[p]}
                </button>
              ))}
            </div>
          </label>
          <div className="row">
            <label className="grow">
              Сколько нужно
              <input
                className="input"
                inputMode="numeric"
                value={draft.count}
                onChange={(e) => onChange({ ...draft, count: Number(e.target.value.replace(/\D/g, '')) || 1 })}
              />
            </label>
            <label className="grow">
              Кто ищет
              <input
                className="input"
                value={draft.seeker}
                placeholder="ник"
                onChange={(e) => onChange({ ...draft, seeker: e.target.value })}
              />
            </label>
          </div>
          <label>
            Для кого
            <select
              className="input"
              value={draft.forCharId}
              onChange={(e) => onChange({ ...draft, forCharId: e.target.value })}
            >
              <option value="">— не указан —</option>
              {db.chars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || 'Без имени'}
                </option>
              ))}
            </select>
          </label>
          <label>
            Заметка
            <input
              className="input"
              placeholder="например: с аукциона или с дропа"
              value={draft.note}
              onChange={(e) => onChange({ ...draft, note: e.target.value })}
            />
          </label>
          <div className="form-actions">
            <button className="btn" onClick={onCancel}>
              Отмена
            </button>
            <button className="btn primary" onClick={onSubmit}>
              Добавить
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
