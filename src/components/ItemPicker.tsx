import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ARMOR_TYPE_OPTIONS,
  GRADE_OPTIONS,
  WEAPON_TYPE_LABELS,
  type CatalogItem,
  type SlotDef,
} from '@/types'
import type { CatalogApi } from '@/lib/catalog'
import { normalize } from '@/lib/util'
import { ItemIcon } from './ItemIcon'

interface Props {
  catalog: CatalogApi
  /** Слот экранировки: задаёт и то, что подходит, и какие фильтры показывать. */
  slot?: SlotDef
  /** Для мест без слота — казны и хотелок: просто ограничение по типу. */
  accepts?: (item: CatalogItem) => boolean
  title?: string
  onPick: (itemId: number) => void
  onClose: () => void
}

/**
 * Выбор предмета из справочника.
 *
 * Список закрытый, ручного ввода по id нет. Кроме поиска есть фильтры:
 * тип предмета (оружие или броня) и грейд. Они дополняют друг друга.
 *
 * Важно: предмет, у которого тип или грейд определить не удалось,
 * показывается при любом выборе. Иначе фильтр молча прятал бы вещи,
 * и игрок решил бы, что их не существует.
 */
export function ItemPicker({ catalog, slot, accepts, title, onPick, onClose }: Props) {
  const [q, setQ] = useState('')
  const [type, setType] = useState<string | null>(null)
  const [grade, setGrade] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const acceptsFn = useMemo(
    () => accepts ?? slot?.accepts ?? (() => true),
    [accepts, slot],
  )
  const filters = slot?.filters ?? {}

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

  // Список предметов, подходящих под слот, с раскладкой по вариантам фильтра.
  const pool = useMemo(() => catalog.all().filter(acceptsFn), [catalog, acceptsFn])

  const typeField =
    filters.type === 'weapon' ? 'weaponType' : filters.type === 'armor' ? 'armorType' : null

  const typeOptions = useMemo(() => {
    if (filters.type === 'weapon') return WEAPON_TYPE_LABELS.map((v) => ({ value: v, label: v }))
    if (filters.type === 'armor') return ARMOR_TYPE_OPTIONS.map((v) => ({ value: v.value, label: v.label }))
    return []
  }, [filters.type])

  /** Сколько предметов в слоте с указанным типом и выбранным грейдом. */
const typeCount = (value: string) =>
    pool.filter((it) => passesType(it, typeField, value) && passesGrade(it, grade)).length

  const gradeCount = (value: string) =>
    pool.filter((it) => passesType(it, typeField, type) && passesGrade(it, value)).length

  const matches = (it: CatalogItem) =>
    passesType(it, typeField, type) && passesGrade(it, grade)

  const results = useMemo(() => catalog.search(q, 200).filter(matches), [catalog, q, type, grade, typeField]) // eslint-disable-line react-hooks/exhaustive-deps
  const showResults = q.trim().length > 0

  const known = useMemo(() => {
    return [...catalog.knownIds]
      .map((id) => catalog.byId(id))
      .filter((it): it is CatalogItem => !!it && acceptsFn(it) && matches(it)) // eslint-disable-line react-hooks/exhaustive-deps
      .slice(0, 20)
  }, [catalog, acceptsFn, type, grade, typeField]) // eslint-disable-line react-hooks/exhaustive-deps

  const total = pool.length
  // Сколько предметов проходят фильтры — считаем по всему списку слота,
  // а не по тому, что сейчас видно в окне: иначе при пустом поиске
  // показывалось бы «0», хотя под фильтры что-то подходит.
  const matching = useMemo(() => pool.filter(matches).length, [pool, type, grade, typeField]) // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = type !== null || grade !== null || showResults

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title ?? slot?.label ?? "выбор предмета"}>
        <div className="modal-head">
          <h3>{title ?? slot?.label ?? 'Выбери предмет'}</h3>
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

        {(typeOptions.length > 0 || filters.grade) && (
          <div className="filters">
            {typeOptions.length > 0 && (
              <FilterRow
                label={filters.type === 'weapon' ? 'Тип оружия' : 'Тип брони'}
                options={typeOptions}
                value={type}
                total={total}
                countFor={typeCount}
                onChange={setType}
              />
            )}
            {filters.grade && (
              <FilterRow
                label="Грейд"
                options={GRADE_OPTIONS.map((g) => ({ value: g, label: g }))}
                value={grade}
                total={total}
                countFor={gradeCount}
                onChange={setGrade}
              />
            )}
          </div>
        )}

        <div className="picker-count">
          {filtered ? `Под фильтры подходит ${matching} из ${total}` : `Всего в слоте: ${total}`}
          {(type || grade) && (
            <button
              className="link-btn"
              onClick={() => {
                setType(null)
                setGrade(null)
              }}
            >
              Сбросить фильтры
            </button>
          )}
        </div>

        <div className="picker-list scroll tall">
          {!showResults &&
            known.length === 0 &&
            (type || grade ? (
              <p className="hint">Под выбранные фильтры ничего не подходит.</p>
            ) : (
              <p className="hint">
                Под этот слот подходит {total} предметов. Начни вводить название — или ищи по
                техническому имени.
              </p>
            ))}
          {showResults && results.length === 0 && (
            <p className="hint">
              Ничего не найдено. Проверь раскладку, фильтры или попробуй техническое имя
              предмета — например <code>avadon_boots</code>.
            </p>
          )}
          {!showResults &&
            known.map((it) => <Row key={it.id} it={it} onPick={onPick} onClose={onClose} />)}
          {showResults && results.map((it) => (
            <Row key={it.id} it={it} onPick={onPick} onClose={onClose} />
          ))}
        </div>

        <div className="picker-foot">
          Справочник: {catalog.count} предметов
          {catalog.source ? ` · ${catalog.source}` : ''}. Список закрытый — предмет выбирается
          только из него.
        </div>
      </div>
    </div>
  )
}

/** Неизвестный тип или грейд не прячет предмет: он проходит любой фильтр. */
function passesType(
  it: CatalogItem,
  field: 'weaponType' | 'armorType' | null,
  value: string | null,
): boolean {
  if (!value || !field) return true
  return it[field] === value
}

function passesGrade(it: CatalogItem, value: string | null): boolean {
  if (!value) return true
  return it.gradeName === value
}

function FilterRow({
  label,
  options,
  value,
  total,
  countFor,
  onChange,
}: {
  label: string
  options: { value: string; label: string }[]
  value: string | null
  total: number
  countFor: (v: string) => number
  onChange: (v: string | null) => void
}) {
  return (
    <div className="filter-row">
      <div className="filter-label">{label}</div>
      <div className="chips">
        <button className={`chip pick ${value === null ? 'on' : ''}`} onClick={() => onChange(null)}>
          все
          <span className="chip-count">{total}</span>
        </button>
        {options.map((o) => {
          const n = countFor(o.value)
          return (
            <button
              key={o.value}
              className={`chip pick ${value === o.value ? 'on' : ''} ${n === 0 ? 'zero' : ''}`}
              onClick={() => onChange(value === o.value ? null : o.value)}
            >
              {o.label}
              <span className="chip-count">{n}</span>
            </button>
          )
        })}
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
      title={[it.set, it.weaponClass, ...stats].filter(Boolean).join(' · ')}
    >
      <ItemIcon item={it} name={it.name} size={26} />
      <span className="picker-name">{it.name}</span>
      {stats.length > 0 && <span className="picker-stats">{stats.slice(0, 2).join(' · ')}</span>}
      {/* Тип и грейд видно в строке: сразу понятно, почему предмет
          остался в списке при выбранном фильтре. */}
      {it.weaponType && <span className="tag">{it.weaponType}</span>}
      {it.armorType && <span className="tag">{ARMOR_TYPE_LABELS[it.armorType] ?? it.armorType}</span>}
      {it.gradeName && <span className={`tag grade g-${it.gradeName}`}>{it.gradeName}</span>}
      <span className="picker-id">#{it.id}</span>
    </button>
  )
}

const ARMOR_TYPE_LABELS: Record<string, string> = {
  heavy: 'Тяжёлая',
  light: 'Лёгкая',
  magic: 'Магическая',
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