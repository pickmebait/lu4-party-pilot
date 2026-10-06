import { useMemo, useState } from 'react'
import type { CatalogApi } from '@/lib/catalog'
import { computeSets } from '@/lib/derived'
import { addSet, removeSet, updateSet, useDb } from '@/lib/store'
import { gradeLabel } from './ItemPicker'
import { ItemPicker } from './ItemPicker'

interface SetDraft {
  id: string | null
  name: string
  bonus: string
  pieces: number[]
}

export function SetsView({ catalog }: { catalog: CatalogApi }) {
  const db = useDb()
  const progress = useMemo(() => computeSets(db), [db])
  const [draft, setDraft] = useState<SetDraft | null>(null)
  const [pickingPiece, setPickingPiece] = useState(false)

  return (
    <section className="view">
      <div className="view-head">
        <h2>
          Комплекты{' '}
          <span className="muted">
            собрано {progress.filter((p) => p.complete).length} из {progress.length}
          </span>
        </h2>
        <div className="view-actions">
          <button
            className="btn primary"
            onClick={() => setDraft({ id: null, name: '', bonus: '', pieces: [] })}
          >
            + Комплект
          </button>
        </div>
      </div>

      {progress.length === 0 && (
        <div className="empty">
          <p>Комплектов пока нет.</p>
          <p className="hint">
            Собери список частей — приложение посчитает, сколько надето на пати, сколько лежит в
            казне и каких частей не хватает.
          </p>
        </div>
      )}

      <div className="sets-grid">
        {progress.map((p) => (
          <article key={p.set.id} className={`set-card ${p.complete ? 'complete' : ''}`}>
            <header>
              <h3>{p.set.name}</h3>
              <span className="pct">
                {p.equipped} / {p.total}
              </span>
            </header>

            {p.set.bonus && <div className="set-bonus">{p.set.bonus}</div>}

            <div className="bar">
              <span style={{ width: `${p.total ? (p.equipped / p.total) * 100 : 0}%` }} />
            </div>

            <ul className="pieces">
              {p.set.pieces.map((id) => {
                const name = catalog.nameOf(id)
                const grade = catalog.byId(id)?.grade
                const state = p.missing.includes(id) ? 'missing' : 'have'
                const extra = state === 'have' && p.stored > 0 && !p.complete ? '' : ''
                return (
                  <li key={id} className={state}>
                    <span className="tick">{state === 'have' ? '✓' : '·'}</span>
                    <span className="pname">{name}</span>
                    {typeof grade === 'number' && grade > 0 && (
                      <span className="chip grade">{gradeLabel(grade)}</span>
                    )}
                    <span className="cell-id">
                      #{id}
                      {extra}
                    </span>
                  </li>
                )
              })}
            </ul>

            <footer>
              <button
                className="btn tiny"
                onClick={() =>
                  setDraft({
                    id: p.set.id,
                    name: p.set.name,
                    bonus: p.set.bonus ?? '',
                    pieces: [...p.set.pieces],
                  })
                }
              >
                Изменить
              </button>
              <button className="btn tiny danger" onClick={() => removeSet(p.set.id)}>
                Удалить
              </button>
            </footer>
          </article>
        ))}
      </div>

      {draft && (
        <div className="modal-backdrop" onClick={() => setDraft(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{draft.id ? 'Изменить комплект' : 'Новый комплект'}</h3>
              <button className="icon-btn" onClick={() => setDraft(null)}>
                ✕
              </button>
            </div>

            <div className="form">
              <label>
                Название
                <input
                  className="input"
                  autoFocus
                  value={draft.name}
                  placeholder="например: Костюм Тар-Моса"
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <label>
                Бонус комплекта
                <input
                  className="input"
                  value={draft.bonus}
                  placeholder="например: Физ. АТК +50"
                  onChange={(e) => setDraft({ ...draft, bonus: e.target.value })}
                />
              </label>

              <div className="label-row">
                <span>Части комплекта ({draft.pieces.length})</span>
                <button className="btn tiny" onClick={() => setPickingPiece(true)}>
                  + Добавить часть
                </button>
              </div>

              {draft.pieces.length === 0 ? (
                <p className="hint">Ни одной части не добавлено.</p>
              ) : (
                <div className="piece-chips">
                  {draft.pieces.map((id) => (
                    <span key={id} className="piece-chip">
                      {catalog.nameOf(id)}
                      <button
                        className="icon-btn tiny"
                        onClick={() =>
                          setDraft({ ...draft, pieces: draft.pieces.filter((x) => x !== id) })
                        }
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {pickingPiece && (
              <ItemPicker
                catalog={catalog}
                title="Часть комплекта"
                onPick={(itemId) => {
                  if (!draft.pieces.includes(itemId)) {
                    setDraft({ ...draft, pieces: [...draft.pieces, itemId] })
                  }
                }}
                onClose={() => setPickingPiece(false)}
              />
            )}

            <div className="form-actions">
              <button className="btn" onClick={() => setDraft(null)}>
                Отмена
              </button>
              <button
                className="btn primary"
                disabled={!draft.name.trim() || draft.pieces.length === 0}
                onClick={() => {
                  if (draft.id) {
                    updateSet(draft.id, {
                      name: draft.name.trim(),
                      bonus: draft.bonus.trim() || undefined,
                      pieces: draft.pieces,
                    })
                  } else {
                    addSet({
                      name: draft.name.trim(),
                      bonus: draft.bonus.trim() || undefined,
                      pieces: draft.pieces,
                    })
                  }
                  setDraft(null)
                }}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
