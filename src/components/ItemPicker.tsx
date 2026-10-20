import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ARMOR_TYPE_OPTIONS,
  GRADE_OPTIONS,
  JEWELRY_TYPE_OPTIONS,
  WEAPON_TYPE_LABELS,
  type CatalogItem,
  type SlotDef,
} from '@/types'
import type { CatalogApi } from '@/lib/catalog'
import { normalize } from '@/lib/util'
import { ItemIcon } from './ItemIcon'

/** Сколько предметов показывать на одной странице. */
const PAGE_SIZES = [5, 10, 20] as const

/** Потолок для поиска: справочник меньше двух тысяч предметов. */
const SEARCH_LIMIT = 5000

/**
 * Сколько предметов можно набрать за один раз.
 *
 * Пятнадцать — не округлённое число, а длина списка, который ещё можно
 * разглядеть в форме: дальше он перестаёт помещаться на экране, и половина
 * целей выбрана, но не замечена.
 */
export const МНОЖЕСТВЕННЫЙ_ПОТОЛОК = 15

interface Props {
  catalog: CatalogApi
  /** Слот экранировки: задаёт и то, что подходит, и какие фильтры показывать. */
  slot?: SlotDef
  /** Для мест без слота — казны и целей: просто ограничение по типу. */
  accepts?: (item: CatalogItem) => boolean
  title?: string
  onPick: (itemId: number) => void
  /**
   * Режим множественного выбора.
   *
   * Список не закрывается после выбора, строка отмечается, а внизу появляется
   * кнопка, которая возвращает всё набраное разом. Нужен там, где человек за
   * один заход перечисляет список: пятнадцать целей подряд выбирать по одному
   * и каждый раз открывать пикер заново — пятнадцать лишних кругов.
   */
  multi?: number[]
  onPickMany?: (itemIds: number[]) => void
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
export function ItemPicker({ catalog, slot, accepts, title, onPick, multi, onPickMany, onClose }: Props) {
  const [q, setQ] = useState('')
  const [type, setType] = useState<string | null>(null)
  const [grade, setGrade] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState<number>(20)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Множественный выбор живёт здесь, а не у вызывающего: пикер открыт поверх
  // формы цели, и держать набор в её состоянии значило бы терять его при
  // каждом перерисовывании формы.
  const [отмечено, setОтмечено] = useState<number[]>(multi ?? [])
  const множественный = !!onPickMany
  const полный = множественный && отмечено.length >= МНОЖЕСТВЕННЫЙ_ПОТОЛОК

  const переключить = (id: number) => {
    setОтмечено((прежние) => {
      if (прежние.includes(id)) return прежние.filter((x) => x !== id)
      if (прежние.length >= МНОЖЕСТВЕННЫЙ_ПОТОЛОК) return прежние
      return [...прежние, id]
    })
  }

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
    filters.type === 'weapon' ? 'weaponType' : filters.type === 'armor' ? 'armorType' : filters.type === 'jewelry' ? 'jewelryType' : null

  const typeOptions = useMemo(() => {
    if (filters.type === 'weapon') return WEAPON_TYPE_LABELS.map((v) => ({ value: v, label: v }))
    if (filters.type === 'armor') return ARMOR_TYPE_OPTIONS.map((v) => ({ value: v.value, label: v.label }))
    if (filters.type === 'jewelry') return JEWELRY_TYPE_OPTIONS.map((v) => ({ value: v.value, label: v.label }))
    return []
  }, [filters.type])

  /**
   * Показываем фильтр типа только если в данных есть хоть один предмет
   * с этим типом. Иначе вылезут три кнопки с нулём — выглядит как поломка.
   */
  const естьТипВДанных = useMemo(
    () =>
      typeOptions.some((o) =>
        pool.some((it) => {
          if (typeField === 'weaponType') return it.weaponType === o.value
          if (typeField === 'armorType') return it.armorType === o.value
          if (typeField === 'jewelryType') return jewelryTypeOf(it) === o.value
          return false
        }),
      ),
    [typeOptions, pool, typeField],
  )
  const показыватьТип = typeOptions.length > 0 && естьТипВДанных

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

  const pages = Math.max(1, Math.ceil(results.length / pageSize))
  const pageNo = Math.min(page, pages - 1)
  const shown = results.slice(pageNo * pageSize, (pageNo * pageSize) + pageSize)
  const from = results.length === 0 ? 0 : pageNo * pageSize + 1
  const to = Math.min((pageNo + 1) * pageSize, results.length)

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

  const onPageSize = (n: number) => {
    setPageSize(n)
    setPage(0)
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

        {(показыватьТип || filters.grade) && (
          <div className="filters">
            {показыватьТип && (
              <FilterRow
                label={filters.type === 'weapon' ? 'Тип оружия' : filters.type === 'armor' ? 'Тип брони' : 'Тип бижутерии'}
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
              multi={множественный}
              chosen={отмечено.includes(it.id)}
              blocked={полный && !отмечено.includes(it.id)}
              onPick={множественный ? переключить : onPick}
              onClose={onClose}
            />
          ))}
        </div>

        {pages > 1 && (
          <div className="pager">
            <button className="pg" onClick={() => goTo(pageNo - 1)} disabled={pageNo === 0}>
              ‹ Назад
            </button>
            <div className="pager-mid">
              <span className="pg-num">
                Страница {pageNo + 1} из {pages}
              </span>
              <div className="pg-size" role="group" aria-label="Предметов на странице">
                {PAGE_SIZES.map((n) => (
                  <button
                    key={n}
                    className={`pg-size-btn ${pageSize === n ? 'on' : ''}`}
                    onClick={() => onPageSize(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
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
          {множественный ? (
            <>
              <div className="picker-multi">
                <span>
                  выбрано {отмечено.length} из {МНОЖЕСТВЕННЫЙ_ПОТОЛОК}
                  {полный && ' — больше не поместится'}
                </span>
                <button
                  className="btn primary"
                  disabled={отмечено.length === 0}
                  onClick={() => onPickMany?.(отмечено)}
                >
                  Добавить выбранное
                </button>
              </div>
              <div className="picker-foot-note">
                Справочник: {catalog.count} предметов
                {catalog.source ? ` · ${catalog.source}` : ''}. Список закрытый — предмет
                выбирается только из него.
              </div>
            </>
          ) : (
            <>
              Справочник: {catalog.count} предметов
              {catalog.source ? ` · ${catalog.source}` : ''}. Список закрытый — предмет
              выбирается только из него.
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** Неизвестный тип или грейд не прячет предмет: он проходит любой фильтр. */
function jewelryTypeOf(it: CatalogItem): string | null {
  if (it.epic) return "epic"
  if (it.slot === 'l_ring') return 'l_ring'
  if (it.slot === 'l_ear') return 'l_ear'
  if (it.slot === 'neck') return 'neck'
  return null
}

function passesType(
  it: CatalogItem,
  field: 'weaponType' | 'armorType' | 'jewelryType' | null,
  value: string | null,
): boolean {
  if (!value || !field) return true
  if (field === 'jewelryType') return jewelryTypeOf(it) === value
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
  multi,
  chosen,
  blocked,
  onPick,
  onClose,
}: {
  it: CatalogItem
  /** Уже надето в пати или лежит в казне — помечаем, чтобы было видно. */
  inApp: boolean
  /** Режим множественного выбора: строка не закрывает список. */
  multi?: boolean
  chosen?: boolean
  /** Потолок выбора достигнут — строка гасится, но не исчезает. */
  blocked?: boolean
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

  const [effectsOpen, setEffectsOpen] = useState(false)
  const естьЭффекты = (it.saEffects?.length ?? 0) > 0 || !!it.rareEffect

  return (
    /*
     * Разворачиваемые эффекты — соседняя строка под основной, а не вложенная
     * кнопка в кнопку: вложенную кнопку браузер не разбирает, и клик по
     * «▼ Эффекты» одновременно выбирал бы предмет. Поэтому сама строка —
     * div с ролью button, а блок эффектов лежит под ней, вне кликабельной
     * области.
     */
    <>
    <div
      role="button"
      tabIndex={0}
      className={`picker-row ${inApp ? 'in-app' : ''} ${multi ? 'multi' : ''} ${chosen ? 'chosen' : ''} ${blocked ? 'blocked' : ''}`}
      onClick={() => {
        onPick(it.id)
        // В множественном режиме список остаётся открытым: закрывать его после
        // каждой отметки значило бы выбирать пятнадцать предметов пятнадцать
        // разными заходами.
        if (!multi) onClose()
      }}
      title={[
        it.set,
        it.weaponClass,
        ...stats,
        blocked ? 'Потолок выбора — снимите что-нибудь' : '',
      ]
        .filter(Boolean)
        .join(' · ')}
    >
      {multi && (
        <span className="picker-check" aria-hidden="true">
          {chosen ? '✓' : ''}
        </span>
      )}
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
      {естьЭффекты && (
        <button
          className={`link-btn picker-expand${effectsOpen ? ' on' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            setEffectsOpen((v) => !v)
          }}
          title={effectsOpen ? 'Скрыть эффекты' : 'Показать эффекты'}
        >
          {effectsOpen ? '▲' : '▼ Эффекты'}
        </button>
      )}
    </div>
    {effectsOpen && естьЭффекты && (
      <div className="picker-effects">
        {it.saEffects?.map((sa, i) => (
          <div key={i} className="picker-effect">
            <span className="picker-effect-name">{sa.name}</span>
            <span className="picker-effect-desc">{sa.description}</span>
          </div>
        ))}
        {it.rareEffect && (
          <div className="picker-effect rare">
            <span className="picker-effect-name">{it.rareEffect.name || 'Rare'}</span>
            {it.rareEffect.description && (
              <span className="picker-effect-desc">{it.rareEffect.description}</span>
            )}
          </div>
        )}
      </div>
    )}
    </>
  )
}

const ARMOR_TYPE_LABELS: Record<string, string> = {
  heavy: 'Тяжёлая',
  light: 'Лёгкая',
  magic: 'Магическая',
}

/** Фильтр по названию для уже готовых списков. */
export function matches(text: string, q: string): boolean {
  return !q.trim() || normalize(text).includes(normalize(q))
}