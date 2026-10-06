import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Catalog, CatalogItem } from '@/types'
import { normalize } from './util'

const CATALOG_URL = `${import.meta.env.BASE_URL}items.json`

interface CatalogState {
  loading: boolean
  catalog: Catalog | null
  error: string | null
}

export interface CatalogApi extends CatalogState {
  count: number
  /** Предмет по id или null, если его нет в справочнике. */
  byId: (id: number) => CatalogItem | null
  /** Название для показа. Никогда не пустая строка. */
  nameOf: (id: number) => string
  /** Поиск по названию, техническому имени и id. */
  search: (q: string, limit?: number) => CatalogItem[]
  /** Предметы, которые уже есть в инвентаре/казне — чтобы выбирать из них. */
  knownIds: Set<number>
}

const EMPTY: CatalogState = { loading: true, catalog: null, error: null }

let cache: CatalogState = EMPTY
let index: Map<number, CatalogItem> | null = null
let byName: Map<string, CatalogItem[]> | null = null
const subscribers = new Set<() => void>()

function buildIndex(items: CatalogItem[]) {
  index = new Map()
  byName = new Map()
  for (const it of items) {
    index.set(it.id, it)
    const keys = new Set<string>()
    keys.add(normalize(it.name))
    if (it.tex) {
      const t = normalize(it.tex)
      keys.add(t)
      // «draco_blade» должно находиться по «драко» — режем на части.
      for (const part of t.split(/[\s_\-.]+/)) if (part.length >= 3) keys.add(part)
    }
    for (const k of keys) {
      if (!k) continue
      const arr = byName!.get(k)
      if (arr) arr.push(it)
      else byName!.set(k, [it])
    }
  }
}

async function load() {
  try {
    const res = await fetch(CATALOG_URL, { cache: 'no-cache' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = (await res.json()) as Catalog
    const items = Array.isArray(json.items) ? json.items : []
    buildIndex(items)
    cache = { loading: false, catalog: { ...json, items }, error: null }
  } catch (e) {
    cache = {
      loading: false,
      catalog: { generatedAt: '', items: [] },
      error:
        e instanceof Error
          ? `Справочник предметов не загрузился (${e.message}). Приложение работает, но искать предметы по названию нельзя — заполни поле вручную.`
          : 'Справочник предметов не загрузился',
    }
  }
  for (const s of subscribers) s()
}

export function startCatalogLoad(): void {
  if (cache.loading) void load()
}

function subscribe(cb: () => void): () => void {
  subscribers.add(cb)
  if (cache.loading) void load()
  return () => subscribers.delete(cb)
}

/** Подписка на справочник. Первый рендер отдаёт loading, дальше — данные. */
export function useCatalog(
  knownIds: Set<number>,
  customNames: Record<string, string> = {},
): CatalogApi {
  const [state, setState] = useState<CatalogState>(cache)

  useEffect(() => {
    setState(cache)
    return subscribe(() => setState(cache))
  }, [])

  const byId = useCallback(
    (id: number): CatalogItem | null => (index ? (index.get(id) ?? null) : null),
    [],
  )

  const nameOf = useCallback(
    (id: number): string => {
      const mine = customNames[String(id)]
      if (mine) return mine
      const it = index?.get(id)
      if (it) return it.name
      return `Предмет #${id}`
    },
    [customNames],
  )

  const search = useCallback((q: string, limit = 60): CatalogItem[] => {
    if (!byName) return []
    const query = normalize(q)
    if (!query) return []

    // Сначала точное совпадение начала строки, потом вхождение — так
    // «клинок» показывает «Клинок Драко» выше, чем «Кровавый Клинок».
    const starts: CatalogItem[] = []
    const inner: CatalogItem[] = []
    const seen = new Set<number>()

    const push = (list: CatalogItem[] | undefined, bucket: CatalogItem[]) => {
      if (!list) return
      for (const it of list) {
        if (seen.has(it.id)) continue
        seen.add(it.id)
        bucket.push(it)
      }
    }

    if (/^\d+$/.test(query)) {
      const id = Number(query)
      const exact = index?.get(id)
      if (exact) {
        push([exact], starts)
      }
      // с id 1146 находим и соседние диапазоны
      push(byName.get(query), starts)
    }

    for (const [key, list] of byName) {
      if (key.startsWith(query)) push(list, starts)
      else if (key.includes(query)) push(list, inner)
    }

    // В группе «вхождение не в начале» короткие названия полезнее длинных:
    // по запросу «драко» «Клинок Драко» интереснее, чем «Костюм Драко Охотника».
    inner.sort((a, b) => a.name.length - b.name.length)

    return [...starts, ...inner].slice(0, limit)
  }, [])

  return useMemo(
    () => ({
      ...state,
      count: state.catalog?.items.length ?? 0,
      byId,
      nameOf,
      search,
      knownIds,
    }),
    [state, byId, nameOf, search, knownIds],
  )
}
