import { useEffect, useMemo, useRef, useState } from 'react'
import type { CatalogApi } from '@/lib/catalog'
import { useDb, setCustomName } from '@/lib/store'
import { normalize } from '@/lib/util'

interface Props {
  catalog: CatalogApi
  /** Что уже есть в приложении — показываем этот блок первым. */
  title?: string
  onPick: (itemId: number) => void
  onClose: () => void
}

/** Модальное окно выбора предмета: поиск по справочнику или ввод id вручную. */
export function ItemPicker({ catalog, title = 'Выбери предмет', onPick, onClose }: Props) {
  const db = useDb()
  const [q, setQ] = useState('')
  const [manual, setManual] = useState<{ id: string; name: string } | null>(null)
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

  const results = useMemo(() => catalog.search(q, 80), [catalog, q])

  // Что уже есть в приложении — самые вероятные кандидаты при пустом поиске.
  const known = useMemo(() => {
    const ids = [...catalog.knownIds].sort((a, b) => a - b)
    return ids.slice(0, 20).map((id) => ({
      id,
      name: catalog.nameOf(id),
      grade: catalog.byId(id)?.grade,
    }))
  }, [catalog])

  const showResults = q.trim().length > 0

  const pickManual = () => {
    if (!manual) return
    const id = Number(manual.id)
    if (!Number.isInteger(id) || id <= 0) return
    if (manual.name.trim()) setCustomName(id, manual.name.trim())
    onPick(id)
    onClose()
  }

  const renameId = manual ? Number(manual.id) : 0
  const renameKnown =
    renameId > 0 && !catalog.byId(renameId) ? (db.customNames[String(renameId)] ?? '') : ''

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
          placeholder="Поиск: название, латинское имя или ID предмета…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        {catalog.error && <p className="hint warn">{catalog.error}</p>}

        {!showResults && known.length > 0 && (
          <div className="picker-section">
            <div className="picker-label">Уже в приложении</div>
            <div className="picker-list">
              {known.map((it) => (
                <button key={it.id} className="picker-row" onClick={() => { onPick(it.id); onClose() }}>
                  <span className="picker-name">{it.name}</span>
                  <span className="picker-id">#{it.id}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {showResults && (
          <div className="picker-list scroll">
            {results.length === 0 && (
              <p className="hint">
                Ничего не найдено. Возможно, предмета нет в справочнике — заполни ID вручную
                ниже.
              </p>
            )}
            {results.map((it) => (
              <button key={it.id} className="picker-row" onClick={() => { onPick(it.id); onClose() }}>
                <span className="picker-name">{it.name}</span>
                {typeof it.grade === 'number' && it.grade > 0 && (
                  <span className="chip grade">{gradeLabel(it.grade)}</span>
                )}
                <span className="picker-id">#{it.id}</span>
              </button>
            ))}
          </div>
        )}

        <div className="picker-section manual">
          <div className="picker-label">Нет в справочнике — введи вручную</div>
          <div className="manual-row">
            <input
              className="input narrow"
              inputMode="numeric"
              placeholder="ID"
              value={manual?.id ?? ''}
              onChange={(e) => setManual({ id: e.target.value.replace(/\D/g, ''), name: manual?.name ?? '' })}
            />
            <input
              className="input"
              placeholder="Название (видно всей пати)"
              value={manual?.name ?? renameKnown}
              onChange={(e) => setManual({ id: manual?.id ?? '', name: e.target.value })}
            />
            <button className="btn primary" onClick={pickManual} disabled={!manual?.id}>
              Добавить
            </button>
          </div>
          {catalog.count > 0 && (
            <p className="hint">
              В справочнике {catalog.count} предметов. Если твой сервер использует другой датабаз —
              пересобери его командой <code>npm run items</code>.
            </p>
          )}
        </div>
      </div>
    </div>
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

/** Строка поиска с подсветкой — маленький переиспользуемый инпут. */
export function SearchBox({
  value,
  onChange,
  placeholder,
  className = 'input',
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  className?: string
}) {
  return (
    <input
      className={className}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

/** Фильтр по названию для уже готовых списков. */
export function matches(text: string, q: string): boolean {
  return !q.trim() || normalize(text).includes(normalize(q))
}
