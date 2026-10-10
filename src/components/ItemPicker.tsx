import { useEffect, useMemo, useRef, useState } from 'react'
import type { CatalogItem } from '@/types'
import type { CatalogApi } from '@/lib/catalog'
import { normalize } from '@/lib/util'
import { ItemIcon } from './ItemIcon'

interface Props {
  catalog: CatalogApi
  title?: string
  /**
   * Фильтр по типу предмета. В оружейный слот показываются только
   * оружие, в слот бижутерии — только украшения: перепутать слот
   * больше нельзя.
   */
  accepts?: (item: CatalogItem) => boolean
  /** Подсказка, какие предметы сюда подходят. */
  hint?: string
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
export function ItemPicker({ catalog, title = 'Выбери предмет', accepts, hint, onPick, onClose }: Props) {
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

  const fits = useMemo(() => (item: CatalogItem) => (accepts ? accepts(item) : true), [accepts])

  const results = useMemo(() => catalog.search(q, 200).filter(fits), [catalog, q, fits])
  const showResults = q.trim().length > 0

  // При пустом поиске показываем то, что уже надето или лежит в казне:
  // чаще всего нужен именно этот предмет.
  const known = useMemo(() => {
    return [...catalog.knownIds]
      .map((id) => catalog.byId(id))
      .filter((it): it is CatalogItem => !!it && fits(it))
      .slice(0, 20)
  }, [catalog, fits])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>

        {hint && <p className="hint picker-hint">{hint}</p>}

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
                <Row key={it.id} it={it} onPick={onPick} onClose={onClose} />
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
              <Row key={it.id} it={it} onPick={onPick} onClose={onClose} />
            ))}
          </div>
        )}

        {!showResults && known.length === 0 && (
          <p className="hint picker-empty">
            Под этот слот подходит {catalog.countMatching(fits)} предметов. Начни вводить
            название — или ищи по техническому имени.
          </p>
        )}

        <div className="picker-foot">
          Справочник: {catalog.count} предметов
          {catalog.source ? ` · ${catalog.source}` : ''}
          {accepts ? '. Показаны только подходящие под слот' : ''}. Список закрытый.
        </div>
      </div>
    </div>
  )
}

function Row({
  it,
  onPick,
  onClose,
}: {
  it: CatalogItem
  onPick: (itemId: number) => void
  onClose: () => void
}) {
  const stats: string[] = []
  if (typeof it.atkPhys === 'number') stats.push(`физ. АТК ${it.atkPhys}`)
  if (typeof it.atkMag === 'number') stats.push(`маг. АТК ${it.atkMag}`)
  if (typeof it.physDef === 'number') stats.push(`физ. ЗАЩ ${it.physDef}`)
  if (typeof it.mDef === 'number') stats.push(`маг. ЗАЩ ${it.mDef}`)
  if (it.weaponClass) stats.push(it.weaponClass)
  if (it.twoHanded) stats.push('двуручное')
  if (it.dual) stats.push('дуальное')
  if (it.fullbody) stats.push('цельное')

  return (
    <button
      className="picker-row"
      onClick={() => {
        onPick(it.id)
        onClose()
      }}
      title={[it.set, ...stats].filter(Boolean).join(' · ')}
    >
      <ItemIcon item={it} name={it.name} size={26} />
      <span className="picker-name">{it.name}</span>
      {stats.length > 0 && <span className="picker-stats">{stats.slice(0, 2).join(' · ')}</span>}
      {typeof it.grade === 'number' && it.grade > 0 && (
        <span className="chip grade">{gradeLabel(it.grade)}</span>
      )}
      <span className="picker-id">#{it.id}</span>
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