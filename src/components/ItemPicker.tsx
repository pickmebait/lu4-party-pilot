import { useEffect, useMemo, useRef, useState } from 'react'
import type { CatalogItem } from '@/types'
import type { CatalogApi } from '@/lib/catalog'
import { normalize } from '@/lib/util'
import { ItemIcon } from './ItemIcon'

interface Props {
  catalog: CatalogApi
  title?: string
  onPick: (itemId: number) => void
  onClose: () => void
}

/**
 * Выбор предмета из справочника.
 *
 * Ручного ввода по id нет: список закрытый, предметы берутся только
 * из загруженной базы. Иначе в пати появляются «Предмет #99999», которых
 * нет ни в игре, ни в базе, и потом их не найти.
 */
export function ItemPicker({ catalog, title = 'Выбери предмет', onPick, onClose }: Props) {
  const [q, setQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const results = useMemo(() => catalog.search(q, 200), [catalog, q])
  const showResults = q.trim().length > 0

  // При пустом поиске показываем то, что уже есть в приложении: чаще всего
  // нужен именно этот предмет.
  const known = useMemo(() => {
    return [...catalog.knownIds]
      .sort((a, b) => a - b)
      .slice(0, 20)
      .map((id) => ({ id, name: catalog.nameOf(id), grade: catalog.byId(id)?.grade }))
  }, [catalog])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>

        <input
          ref={inputRef}
          className="input"
          placeholder="Поиск: название, техническое имя или номер…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        {catalog.error && <p className="hint warn">{catalog.error}</p>}

        {!showResults && known.length > 0 && (
          <div className="picker-section">
            <div className="picker-label">Уже в приложении</div>
            <div className="picker-list">
              {known.map((it) => (
                <Row key={it.id} it={it} id={it.id} name={it.name} grade={it.grade} onPick={onPick} onClose={onClose} />
              ))}
            </div>
          </div>
        )}

        {showResults && (
          <div className="picker-list scroll">
            {results.length === 0 && (
              <p className="hint">
                Ничего не найдено. Проверь раскладку или попробуй техническое имя
                предмета — например <code>avadon_boots</code>.
              </p>
            )}
            {results.map((it) => (
              <Row
                key={it.id}
                it={it}
                id={it.id}
                name={it.name}
                grade={it.grade}
                onPick={onPick}
                onClose={onClose}
              />
            ))}
          </div>
        )}

        <div className="picker-foot">
          Справочник: {catalog.count} предметов{catalog.source ? ` · ${catalog.source}` : ''}.
          Список закрытый — предметы добавляются только из него.
        </div>
      </div>
    </div>
  )
}

function Row({
  it,
  id,
  name,
  grade,
  onPick,
  onClose,
}: {
  it?: CatalogItem
  id: number
  name: string
  grade?: number
  onPick: (itemId: number) => void
  onClose: () => void
}) {
  return (
    <button
      className="picker-row"
      onClick={() => {
        onPick(id)
        onClose()
      }}
      title={it?.set ?? it?.type ?? undefined}
    >
      <ItemIcon item={it} name={name} size={26} />
      <span className="picker-name">{name}</span>
      {typeof grade === 'number' && grade > 0 && <span className="chip grade">{gradeLabel(grade)}</span>}
      <span className="picker-id">#{id}</span>
    </button>
  )
}

const GRADE_NAMES: Record<number, string> = {
  16: 'S',
  15: 'S',
  14: 'A',
  13: 'A',
  12: 'B',
  11: 'B',
  10: 'C',
  9: 'C',
  8: 'D',
  7: 'D',
  6: 'NG',
  5: 'NG',
  4: 'NG',
  3: 'NG',
  2: 'NG',
  1: 'NG',
}

export function gradeLabel(grade: number): string {
  return GRADE_NAMES[grade] ?? String(grade)
}

/** Фильтр по названию для уже готовых списков. */
export function matches(text: string, q: string): boolean {
  return !q.trim() || normalize(text).includes(normalize(q))
}