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

/** Сколько предметов показывать на одной странице. */
const PAGE_SIZE = 100

/** Потолок для поиска: справочник меньше двух тысяч предметов. */
const SEARCH_LIMIT = 5000

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
 * Список закрытый, ручного ввода по id нет. Сразу открывается весь список
 * предметов, подходящих под слот, — постранично, чтобы можно было
 * полистать, а не гадать. Поиск и фильтры только сужают этот список,
 * и пустым он становится ровно тогда, когда под условия не подошёл
 * ни один предмет.
 *
 * Важно: предмет, у которого тип или грейд определить не удалось,
 * показывается при любом выборе. Иначе фильтр молча прятал бы вещи,
 * и игрок решил бы, что их не существует.
 */
export function ItemPicker({ catalog, slot, accepts, title, onPick, onClose }: Props) {
  const [q, setQ] = useState('')
  const [type, setType] = useState<string | null>(null)
  const [grade, setGrade] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const acceptsFn = useMemo(() => accepts ?? slot?.accepts ?? (() => true), [accepts, slot])
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

  /** Предметы, подходящие под слот, по алфавиту: с ними удобно листать. */
  const pool = useMemo(
    () => catalog.all().filter(acceptsFn).sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [catalog, acceptsFn],
  )

  const typeField =
    filters.type === 'weapon' ? 'weaponType' : filters.type === 'armor' ? 'armorType' : null

  const typeOptions = useMemo(() => {
    if (filters.type === 'weapon') return WEAPON_TYPE_LABELS.map((v) => ({ value: v, label: v }))
    if (filters.type === 'armor') return ARMOR_TYPE_OPTIONS.map((v) => ({ value: v.value, label: v.label }))
    return []
  }, [filters.type])

  const matches = (it: CatalogItem) =>
    acceptsFn(it) && passesType(it, typeField, type) && passesGrade(it, grade)

  /** Сколько предметов в слоте с указанным типом и выбранным грейдом. */
  const typeCount = (value: string) =>
    pool.filter((it) => passesType(it, typeField, value) && passesGrade(it, grade)).length

  const gradeCount = (value: string) =>
    pool.filter((it) => passesType(it, typeField, type) && passesGrade(it, value)).length

  // С пустым поиском берём весь список слота по алфавиту. С поиском —
  // ранжированную выдачу справочника, она умеет искать по синонимам
  // и по техническому имени.
  const query = q.trim()
  const results = useMemo(
    () => (query ? catalog.search(q, SEARCH_LIMIT) : pool).filter(matches),
    [query, q, catalog, pool, acceptsFn, type, grade, typeField], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const total = pool.length
  const filtered = query.length > 0 || type !== null || grade !== null

  const pages = Math.max(1, Math.ceil(results.length / PAGE_SIZE))
  const pageNo = Math.min(page, pages - 1)
  const shown = results.slice(pageNo * PAGE_SIZE, (pageNo * PAGE_SIZE) + PAGE_SIZE)
  const from = results.length === 0 ? 0 : pageNo * PAGE_SIZE + 1
  const to = Math.min((pageNo + 1) * PAGE_SIZE, results.length)

  /** Любое изменение условий возвращает на первую страницу. */
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setPage(0)
    listRef.current?.scrollTo({ top: 0 })
  }
  const onQuery = reset(setQ)
  const onType = reset(setType)
  const onGrade = reset(setGrade)

  const goTo = (n: number) => {
    setPage(n)
    listRef.current?.scrollTo({ top: 0 })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title ?? slot?.label ?? 'выбор предмета'}
      >
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
          onChange={(e) => onQuery(e.target.value)}
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
                onChange={onType}
              />
            )}
            {filters.grade && (
              <FilterRow
                label="Грейд"
                options={GRADE_OPTIONS.map((g) => ({ value: g, label: g }))}
                value={grade}
                total={total}
                countFor={gradeCount}
                onChange={onGrade}
              />
            )}
          </div>
        )}

        <div className="picker-count">
          <span>
            {filtered ? `Подходит ${results.length} из ${total}` : `Всего в слоте: ${total}`}
            {results.length > 0 && ` · показано ${from}–${to}`}
          </span>
          {(type || grade || query) && (
            <button
              className="link-btn"
              onClick={() => {
                setType(null)
                setGrade(null)
                setQ('')
                setPage(0)
                listRef.current?.scrollTo({ top: 0 })
              }}
            >
              Сбросить всё
            </button>
          )}
        </div>

        <div className="picker-list scroll tall" ref={listRef}>
          {results.length === 0 && (
            <p className="hint">
              {filtered
                ? 'Под эти условия не подошёл ни один предмет.'
                : 'Справочник ещё загружается или пуст.'}{' '}
              {filtered && 'Попробуй снять часть фильтров или упростить запрос.'}
            </p>
          )}
          {shown.map((it) => (
            <Row
              key={it.id}
              it={it}
              inApp={catalog.knownIds.has(it.id)}
              onPick={onPick}
              onClose={onClose}
            />
          ))}
        </div>

        {pages > 1 && (
          <div className="pager">
            <button className="pg" onClick={() => goTo(pageNo - 1)} disabled={pageNo === 0}>
              ‹ Назад
            </button>
            <span className="pg-num">
              Страница {pageNo + 1} из {pages}
            </span>
            <button
              className="pg"
              onClick={() => goTo(pageNo + 1)}
              disabled={pageNo >= pages - 1}
            >
              Вперёд ›
            </button>
          </div>
        )}

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
  inApp,
  onPick,
  onClose,
}: {
  it: CatalogItem
  /** Уже надето в пати или лежит в казне — помечаем, чтобы было видно. */
  inApp: boolean
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
      className={`picker-row ${inApp ? 'in-app' : ''}`}
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
      {inApp && <span className="tag in-app-mark" title="Уже есть в пати">в пати</span>}
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