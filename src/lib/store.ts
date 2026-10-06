import { useSyncExternalStore } from 'react'
import {
  SLOT_KEYS,
  SLOT_MAX,
  type Char,
  type Db,
  type Priority,
  type SetDef,
  type SlotEntry,
  type SlotKey,
  type Wish,
} from '@/types'
import { uid } from './util'

export const DB_VERSION = 1
const DB_KEY = 'pp:db'
const SETTINGS_KEY = 'pp:settings'

/** Куда и откуда синхронизируем по умолчанию. */
export const DEFAULT_REMOTE = {
  owner: 'pickmebait',
  repo: 'lu4-party-pilot',
  branch: 'main',
  path: 'data/data.json',
}

export interface Settings {
  /** Ник текущего игрока — пишется в историю операций. */
  playerName: string
  remote: typeof DEFAULT_REMOTE
  /** Токен хранится только в этом браузере и никогда не попадает в репозиторий. */
  token: string
}

const DEFAULT_SETTINGS: Settings = {
  playerName: '',
  remote: DEFAULT_REMOTE,
  token: '',
}

export function emptyChar(): Char {
  const slots: Char['slots'] = {}
  for (const k of SLOT_KEYS) slots[k] = new Array(SLOT_MAX[k]).fill(null)
  return { id: uid('c'), name: '', cls: '', level: 0, slots }
}

export function emptyDb(): Db {
  return {
    version: DB_VERSION,
    updatedAt: new Date().toISOString(),
    updatedBy: '',
    chars: [],
    warehouse: { stacks: [], log: [] },
    wishes: [],
    sets: [],
    customNames: {},
  }
}

function normalizeDb(raw: unknown): Db {
  const base = emptyDb()
  if (!raw || typeof raw !== 'object') return base
  const d = raw as Partial<Db>

  const chars = Array.isArray(d.chars) ? d.chars.map(normalizeChar) : []
  const stacks = Array.isArray(d.warehouse?.stacks)
    ? d.warehouse!.stacks
        .filter((s) => s && typeof s.itemId === 'number')
        .map((s) => ({ itemId: s.itemId, count: Math.max(0, Math.trunc(s.count) || 0) }))
        .filter((s) => s.count > 0)
    : []
  const log = Array.isArray(d.warehouse?.log) ? d.warehouse!.log : []

  return {
    version: DB_VERSION,
    updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : base.updatedAt,
    updatedBy: typeof d.updatedBy === 'string' ? d.updatedBy : '',
    chars,
    warehouse: { stacks, log },
    wishes: Array.isArray(d.wishes) ? d.wishes : [],
    sets: Array.isArray(d.sets) ? d.sets : [],
    customNames:
      d.customNames && typeof d.customNames === 'object' && !Array.isArray(d.customNames)
        ? (d.customNames as Record<string, string>)
        : {},
  }
}

function normalizeChar(c: Partial<Char>): Char {
  const slots: Char['slots'] = {}
  for (const k of SLOT_KEYS) {
    const src = Array.isArray(c.slots?.[k]) ? (c.slots as any)[k] : []
    const max = SLOT_MAX[k]
    const arr: (SlotEntry | null)[] = new Array(max).fill(null)
    for (let i = 0; i < max; i++) {
      const e = src[i]
      if (e && typeof e.itemId === 'number') arr[i] = { itemId: e.itemId, ench: e.ench }
    }
    slots[k] = arr
  }
  return {
    id: c.id || uid('c'),
    name: typeof c.name === 'string' ? c.name : '',
    cls: typeof c.cls === 'string' ? c.cls : '',
    level: Math.max(0, Math.trunc(Number(c.level)) || 0),
    slots,
  }
}

function loadState(): { db: Db; settings: Settings } {
  if (typeof localStorage === 'undefined') {
    return { db: emptyDb(), settings: DEFAULT_SETTINGS }
  }
  let db = emptyDb()
  let settings = { ...DEFAULT_SETTINGS }
  try {
    const rawDb = localStorage.getItem(DB_KEY)
    if (rawDb) db = normalizeDb(JSON.parse(rawDb))
  } catch {
    /* повреждённые данные не должны ронять приложение */
  }
  try {
    const rawSet = localStorage.getItem(SETTINGS_KEY)
    if (rawSet) settings = { ...DEFAULT_SETTINGS, ...JSON.parse(rawSet) }
  } catch {
    /* игнорируем */
  }
  settings.remote = { ...DEFAULT_REMOTE, ...settings.remote }
  return { db, settings }
}

const initial = loadState()

let db: Db = initial.db
let settings: Settings = initial.settings
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useDb(): Db {
  return useSyncExternalStore(subscribe, () => db)
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, () => settings)
}

/** Любое изменение данных проходит через сюда: метка времени + сохранение. */
function commit(next: Db): void {
  db = { ...next, version: DB_VERSION, updatedAt: new Date().toISOString(), updatedBy: settings.playerName }
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db))
  } catch {
    /* приватный режим или переполнение — работаем без сохранения */
  }
  emit()
}

export function getDb(): Db {
  return db
}

export function updateSettings(patch: Partial<Settings>): void {
  settings = { ...settings, ...patch }
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    /* игнорируем */
  }
  // Имя игрока попадает в updatedAt-поле при следующем изменении, но уже
  // проставленное updatedBy стоит обновить сразу, чтобы не путать авторство.
  commit(db)
}

/* ---------------------------------------------------------------- персонажи */

export function addChar(partial: Partial<Char> = {}): string {
  const c = normalizeChar({ ...emptyChar(), ...partial })
  commit({ ...db, chars: [...db.chars, c] })
  return c.id
}

export function updateChar(id: string, patch: Partial<Char>): void {
  commit({
    ...db,
    chars: db.chars.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  })
}

export function removeChar(id: string): void {
  commit({ ...db, chars: db.chars.filter((c) => c.id !== id) })
}

export function setSlot(
  charId: string,
  slot: SlotKey,
  index: number,
  entry: SlotEntry | null,
): void {
  commit({
    ...db,
    chars: db.chars.map((c) => {
      if (c.id !== charId) return c
      const arr = [...(c.slots[slot] ?? new Array(SLOT_MAX[slot]).fill(null))]
      if (index >= 0 && index < arr.length) arr[index] = entry
      return { ...c, slots: { ...c.slots, [slot]: arr } }
    }),
  })
}

/** Заточка — это не отдельный предмет, а свойство надетой вещи. */
export function setSlotEnch(charId: string, slot: SlotKey, index: number, ench: string): void {
  const char = db.chars.find((c) => c.id === charId)
  const cur = char?.slots[slot]?.[index]
  if (!char || !cur) return
  setSlot(charId, slot, index, { ...cur, ench: ench.trim() || undefined })
}

/** Передать надетое другому персонажу: ищем пустой слот подходящего типа. */
export function transferSlot(fromId: string, slot: SlotKey, index: number, toId: string): boolean {
  const from = db.chars.find((c) => c.id === fromId)
  const to = db.chars.find((c) => c.id === toId)
  if (!from || !to || fromId === toId) return false

  const entry = from.slots[slot]?.[index]
  if (!entry) return false

  const free = (to.slots[slot] ?? []).findIndex((e) => e === null)
  if (free === -1) return false

  const fromSlots = [...(from.slots[slot] ?? [])]
  fromSlots[index] = null
  const toSlots = [...(to.slots[slot] ?? [])]
  toSlots[free] = entry

  commit({
    ...db,
    chars: db.chars.map((c) => {
      if (c.id === fromId) return { ...c, slots: { ...c.slots, [slot]: fromSlots } }
      if (c.id === toId) return { ...c, slots: { ...c.slots, [slot]: toSlots } }
      return c
    }),
  })
  return true
}

/* -------------------------------------------------------------------- казна */

function pushLog(dir: 'in' | 'out', itemId: number, count: number, who: string, note?: string) {
  return [
    {
      id: uid('l'),
      ts: new Date().toISOString(),
      who: who || 'неизвестно',
      itemId,
      count,
      dir,
      note: note || undefined,
    },
    ...db.warehouse.log,
  ].slice(0, 500)
}

export function addToWarehouse(itemId: number, count = 1, who?: string): void {
  if (count <= 0) return
  const stacks = [...db.warehouse.stacks]
  const i = stacks.findIndex((s) => s.itemId === itemId)
  if (i >= 0) stacks[i] = { ...stacks[i], count: stacks[i].count + count }
  else stacks.push({ itemId, count })
  commit({
    ...db,
    warehouse: {
      stacks: stacks.sort((a, b) => a.itemId - b.itemId),
      log: pushLog('in', itemId, count, who ?? settings.playerName),
    },
  })
}

export function takeFromWarehouse(itemId: number, count = 1, who?: string): void {
  const i = db.warehouse.stacks.findIndex((s) => s.itemId === itemId)
  if (i < 0) return
  const take = Math.min(count, db.warehouse.stacks[i].count)
  if (take <= 0) return
  const stacks = db.warehouse.stacks.map((s, idx) =>
    idx === i ? { ...s, count: s.count - take } : s,
  )
  commit({
    ...db,
    warehouse: {
      stacks: stacks.filter((s) => s.count > 0),
      log: pushLog('out', itemId, take, who ?? settings.playerName),
    },
  })
}

export function setWarehouseCount(itemId: number, count: number): void {
  const c = Math.max(0, Math.trunc(count) || 0)
  const stacks = db.warehouse.stacks
    .map((s) => (s.itemId === itemId ? { ...s, count: c } : s))
    .filter((s) => s.count > 0)
  commit({ ...db, warehouse: { ...db.warehouse, stacks } })
}

/** Пересчёт остатка без записи в историю — для ручной правки числа. */
export function dropFromWarehouse(itemId: number): void {
  commit({
    ...db,
    warehouse: { ...db.warehouse, stacks: db.warehouse.stacks.filter((s) => s.itemId !== itemId) },
  })
}

/* ------------------------------------------------------------------- хотелки */

export function addWish(w: Omit<Wish, 'id' | 'done'>): string {
  const wish: Wish = { id: uid('w'), done: false, ...w }
  commit({ ...db, wishes: [...db.wishes, wish] })
  return wish.id
}

export function updateWish(id: string, patch: Partial<Wish>): void {
  commit({ ...db, wishes: db.wishes.map((w) => (w.id === id ? { ...w, ...patch } : w)) })
}

export function removeWish(id: string): void {
  commit({ ...db, wishes: db.wishes.filter((w) => w.id !== id) })
}

/* ---------------------------------------------------------------------- сеты */

export function addSet(s: Omit<SetDef, 'id'>): string {
  const set: SetDef = { id: uid('s'), ...s }
  commit({ ...db, sets: [...db.sets, set] })
  return set.id
}

export function updateSet(id: string, patch: Partial<SetDef>): void {
  commit({ ...db, sets: db.sets.map((s) => (s.id === id ? { ...s, ...patch } : s)) })
}

export function removeSet(id: string): void {
  commit({ ...db, sets: db.sets.filter((s) => s.id !== id) })
}

/* -------------------------------------------------- свои названия предметов */

/** Запомнить название предмета, которого нет в справочнике. */
export function setCustomName(itemId: number, name: string): void {
  const key = String(itemId)
  const customNames = { ...db.customNames }
  const clean = name.trim()
  if (!clean) delete customNames[key]
  else customNames[key] = clean
  commit({ ...db, customNames })
}

/* ------------------------------------------------------------- общие операции */

export function replaceDb(next: unknown): void {
  commit(normalizeDb(next))
}

export function resetDb(): void {
  commit(emptyDb())
}

export function newWishPriorityDefault(): Priority {
  return 2
}
