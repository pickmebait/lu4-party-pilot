import { useSyncExternalStore } from 'react'
import {
  AFFILIATIONS,
  DEFAULT_AFFILIATION,
  MAX_MOD,
  MAX_SUBS,
  SLOT_KEYS,
  SLOT_MAX,
  type Affiliation,
  type CatalogItem,
  type Char,
  type Contacts,
  type Db,
  type MoveLog,
  type SetDef,
  type SlotEntry,
  type SlotKey,
  type Sub,
  type WarehouseStack,
  type Wish,
} from '@/types'
import { emptySlots, equip, partnerOf, unequip, type GearHolder } from './slots'
import { uid } from './util'

/**
 * Версия 6: у персонажа появились саб-классы.
 *
 * Версия 5: принадлежность.
 * Версия 4: контакты вне игры.
 * Версия 3: заточка в слоте стала числом от 0 до 16 (была произвольной
 * строкой). Старые значения переносятся функцией modOf, поэтому поднимать
 * версию для миграции не нужно — она и так вызывается при любой загрузке.
 *
 * Сабы приводятся normalizeChar при каждой загрузке, поэтому поднимать
 * версию ради них необязательно — но её рост виден в базе, и по нему
 * понятно, какие данные приложение уже умеет читать.
 */
export const DB_VERSION = 6
const DB_KEY = 'pp:db'
const SETTINGS_KEY = 'pp:settings'

export interface Settings {
  /** Ник текущего игрока — пишется в историю операций. */
  playerName: string
}

const DEFAULT_SETTINGS: Settings = {
  playerName: '',
}

export function emptyChar(): Char {
  return {
    id: uid('c'),
    name: '',
    cls: '',
    level: 0,
    affil: DEFAULT_AFFILIATION,
    slots: emptySlots(),
    subUnlocked: false,
    subs: [],
  }
}

/** Пустой саб-класс — чтобы не расходилось правило создания в двух местах. */
export function emptySub(): Sub {
  return { id: uid('s'), cls: '', level: 0, slots: emptySlots() }
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

  // Склад приходит из сети и может быть чем угодно: без склада, со складами
  // вместо массива, с нулевым количеством. Проверка идёт по самому значению,
  // поэтому лишних утверждений тут не нужно.
  const склад = d.warehouse as { stacks?: unknown; log?: unknown } | undefined
  const стопки = Array.isArray(склад?.stacks) ? склад.stacks : []
  const stacks = стопки
    .filter((s): s is WarehouseStack => !!s && typeof (s as WarehouseStack).itemId === 'number')
    .map((s) => ({ itemId: s.itemId, count: Math.max(0, Math.trunc(s.count) || 0) }))
    .filter((s) => s.count > 0)
  const log = Array.isArray(склад?.log) ? (склад.log as MoveLog[]) : []

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

/**
 * Слоты приводятся к полному набору: сколько бы ячеек ни пришло, в базе
 * их столько, сколько в игре. Иначе добавление слота в справочнике тихо
 * ломало бы старые базы — ячейка была бы, а слота под неё нет.
 */
function normalizeSlots(сырое: unknown): Char['slots'] {
  const slots = emptySlots()
  const old = (сырое ?? {}) as Record<string, unknown>
  for (const k of SLOT_KEYS) {
    const src = Array.isArray(old[k]) ? (old[k] as SlotEntry[]) : []
    const arr: (SlotEntry | null)[] = new Array(SLOT_MAX[k]).fill(null)
    for (let i = 0; i < SLOT_MAX[k]; i++) {
      const e = src[i]
      if (e && typeof e.itemId === 'number') {
        arr[i] = { itemId: e.itemId, mod: modOf(e), spans: e.spans }
      }
    }
    slots[k] = arr
  }
  return slots
}

function normalizeChar(c: Partial<Char>): Char {
  const сабы = Array.isArray(c.subs) ? c.subs : []
  const subUnlocked = c.subUnlocked === true || сабы.length > 0
  return {
    id: c.id || uid('c'),
    name: typeof c.name === 'string' ? c.name : '',
    cls: typeof c.cls === 'string' ? c.cls : '',
    level: Math.max(0, Math.trunc(Number(c.level)) || 0),
    // У персонажей, созданных до появления поля, стоит состав: он подходит
    // большинству, и человек поправит, если нужно.
    affil: affilOf(c.affil),
    slots: normalizeSlots(c.slots),
    contacts: contactsOf(c.contacts),
    // Сабы есть только у тех, кто прошёл квест. Отметка ставится, когда
    // добавлен первый саб: иначе в старой базе с сабами отметка была бы
    // выключена, и они остались бы невидимыми вместе с квестом.
    subUnlocked,
    // Больше MAX_SUBS в игре не бывает, лишнее отбрасываем — иначе в
    // переключателе появились бы вкладки, которые нельзя увидеть.
    subs: (subUnlocked ? сабы : []).slice(0, MAX_SUBS).map(normalizeSub),
  }
}

function normalizeSub(s: Partial<Sub>): Sub {
  return {
    id: s.id || uid('s'),
    cls: typeof s.cls === 'string' ? s.cls : '',
    level: Math.max(0, Math.trunc(Number(s.level)) || 0),
    slots: normalizeSlots(s.slots),
  }
}

/** Принадлежность приводится к одному из трёх значений, остальное — состав. */
function affilOf(сырое: unknown): Affiliation {
  return typeof сырое === 'string' && сырое in AFFIL_LABELS ? (сырое as Affiliation) : DEFAULT_AFFILIATION
}

const AFFIL_LABELS: Record<string, true> = Object.fromEntries(
  AFFILIATIONS.map((a) => [a.key, true]),
)

/**
 * Контакты приводятся к строке, а пустой результат убирается целиком.
 *
 * Если оставить объект из пустых строк, в шапке персонажа будет висеть
 * кнопка контактов, которая ничего не открывает.
 */
function contactsOf(сырое: unknown): Contacts | undefined {
  if (!сырое || typeof сырое !== 'object') return undefined
  const src = сырое as Record<string, unknown>
  const out: Contacts = {}
  for (const ключ of ['realName', 'phone', 'telegram', 'discord'] as const) {
    const v = typeof src[ключ] === 'string' ? (src[ключ] as string).trim() : ''
    if (v) out[ключ] = v
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * Заточка приводится к числу от 0 до 16.
 *
 * В старых базах она лежала строкой («+16», «ТГ»), поэтому берём первое
 * число из строки: «+16» станет 16, «ТГ» — 0. Всё, что вне диапазона,
 * обрезается, иначе в ячейке появилось бы +99.
 */
function modOf(e: SlotEntry): number | undefined {
  const старое = e as { mod?: unknown; ench?: unknown }
  const сырое = старое.mod ?? старое.ench
  if (сырое === undefined || сырое === null || сырое === '') return undefined
  const n = typeof сырое === 'number' ? сырое : Number(String(сырое).match(/-?\d+/)?.[0])
  if (!Number.isFinite(n)) return undefined
  return Math.min(MAX_MOD, Math.max(0, Math.trunc(n)))
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

/**
 * Контакты персонажа.
 *
 * Отдельная функция, а не updateChar, потому что пустые строки должны
 * убираться: иначе в шапке остаётся кнопка контактов у персонажа, у
 * которого заполнено одно поле из четырёх, а остальные пустые.
 */
export function setCharContacts(id: string, contacts: Contacts | undefined): void {
  commit({
    ...db,
    chars: db.chars.map((c) => (c.id === id ? { ...c, contacts: contactsOf(contacts) } : c)),
  })
}

export function removeChar(id: string): void {
  commit({ ...db, chars: db.chars.filter((c) => c.id !== id) })
}

/* ---------------------------------------------------------- основная и сабы */

/**
 * Какая ветка экипировки правится.
 *
 * null — основная профессия, иначе id саб-класса. Всё, что трогает слоты,
 * принимает её: без неё надеть меч на саб и снять с основной профессии было
 * бы не отличить.
 */
export type Branch = { charId: string; subId: string | null }

function findChar(charId: string): Char | undefined {
  return db.chars.find((c) => c.id === charId)
}

/** Слоты ветки. Для отсутствующего саба — пустые, а не чужие. */
function slotsOf(char: Char, subId: string | null): Char['slots'] {
  if (!subId) return char.slots
  return char.subs.find((s) => s.id === subId)?.slots ?? emptySlots()
}

/**
 * Копия персонажа с изменёнными слотами ветки.
 *
 * Правила надевания работают с GearHolder — любым набором слотов, — и
 * правят его на месте. Осталось разложить результат обратно: в основную
 * профессию или в нужного саба.
 */
function withGear(char: Char, subId: string | null, mutate: (h: GearHolder) => void): Char {
  const holder: GearHolder = { slots: { ...slotsOf(char, subId) } }
  mutate(holder)
  if (!subId) return { ...char, slots: holder.slots }
  return {
    ...char,
    subs: char.subs.map((s) => (s.id === subId ? { ...s, slots: holder.slots } : s)),
  }
}

/** Есть ли у персонажа такой саб. Иначе правка ушла бы в никуда. */
function hasSub(char: Char, subId: string | null): boolean {
  return subId === null || char.subs.some((s) => s.id === subId)
}

function commitChar(charId: string, next: Char): void {
  commit({ ...db, chars: db.chars.map((c) => (c.id === charId ? next : c)) })
}

/**
 * Отметка «квест на саб-класс пройден».
 *
 * Снимание отметки прячет сабов, но не стирает: отметили по ошибке —
 * вернули и ничего не потеряли. Проверку на MAX_SUBS держит addSub, здесь
 * она тоже нужна: в базе могло прийти четвёртый.
 */
export function setSubUnlocked(charId: string, on: boolean): void {
  const char = findChar(charId)
  if (!char) return
  commitChar(charId, {
    ...char,
    subUnlocked: on,
    subs: on ? char.subs.slice(0, MAX_SUBS) : char.subs,
  })
}

/**
 * Добавляет саб-класс и возвращает его id, либо null, если добавлять нельзя.
 *
 * Отказ здесь, а не в интерфейсе: кнопка может остаться на экране после
 * того, как данные обновились с сервера, где сабов уже три.
 */
export function addSub(charId: string): string | null {
  const char = findChar(charId)
  if (!char || !char.subUnlocked || char.subs.length >= MAX_SUBS) return null
  const sub = emptySub()
  commitChar(charId, { ...char, subs: [...char.subs, sub] })
  return sub.id
}

/** Правка профессии и уровня саб-класса. */
export function updateSub(charId: string, subId: string, patch: Partial<Sub>): void {
  const char = findChar(charId)
  if (!char || !hasSub(char, subId)) return
  commitChar(charId, {
    ...char,
    subs: char.subs.map((s) => (s.id === subId ? { ...s, ...patch } : s)),
  })
}

/** Удаляет саб-класс вместе с его экипировкой. */
export function removeSub(charId: string, subId: string): void {
  const char = findChar(charId)
  if (!char) return
  commitChar(charId, { ...char, subs: char.subs.filter((s) => s.id !== subId) })
}

/**
 * Надевает предмет с учётом правил занятости слотов.
 * Возвращает подписи слотов, которые пришлось занять заново.
 */
export function equipItem(
  target: Branch,
  slot: SlotKey,
  index: number,
  item: CatalogItem,
): string[] {
  const char = findChar(target.charId)
  if (!char || !hasSub(char, target.subId)) return []

  let displaced: string[] = []
  const copy = withGear(char, target.subId, (h) => {
    displaced = equip(h, slot, index, item)
  })
  commitChar(target.charId, copy)
  return displaced
}

/** Снимает предмет. Двуручное оружие и цельная броня освобождают оба слота. */
export function unequipItem(target: Branch, slot: SlotKey, index: number): void {
  const char = findChar(target.charId)
  if (!char || !hasSub(char, target.subId)) return
  commitChar(target.charId, withGear(char, target.subId, (h) => unequip(h, slot, index)))
}

/**
 * Вторая клетка, если предмет занимает обе.
 *
 * Двуручное оружие лежит и в правой руке, и в левой, цельная броня — в
 * верхе и в низу. В базе это две записи одного предмета, и без сверки они
 * расходятся: заточка, поставленная в одной клетке, не появлялась бы в
 * другой, а на экране один и тот же предмет показывал бы разные значения.
 *
 * Само правило поиска пары живёт в slots.ts — там же, где надевание и
 * снятие. Держать его здесь в третий раз значит через месяц забыть, что
 * одно из правил поправили, а другое нет.
 */
function partnerEntry(
  holder: GearHolder,
  slot: SlotKey,
  index: number,
): { slot: SlotKey; index: number } | null {
  const entry = holder.slots[slot]?.[index]
  if (!entry) return null

  const другой = partnerOf(holder, slot, entry.itemId, entry.spans === true)
  if (!другой) return null

  const позиция = (holder.slots[другой] ?? []).findIndex(
    (e) => e?.itemId === entry.itemId && (e?.spans === true || entry.spans === true),
  )
  return позиция === -1 ? null : { slot: другой, index: позиция }
}

/**
 * Заточка надетой вещи.
 *
 * Это не отдельный предмет, а свойство вещи в слоте: при снятии и
 * надевании заново она сбрасывается, как и заточка в игре.
 */
export function setSlotMod(
  target: Branch,
  slot: SlotKey,
  index: number,
  mod: number,
): void {
  const char = findChar(target.charId)
  if (!char || !hasSub(char, target.subId)) return
  const cur = slotsOf(char, target.subId)[slot]?.[index]
  if (!cur) return

  const значение = Math.min(MAX_MOD, Math.max(0, Math.trunc(mod) || 0))
  const copy = withGear(char, target.subId, (h) => {
    const arr = [...(h.slots[slot] ?? [])]
    arr[index] = { ...cur, mod: значение || undefined }
    h.slots[slot] = arr

    // У многослотного предмета вторая клетка показывает то же самое.
    const пара = partnerEntry(h, slot, index)
    const второй = пара ? h.slots[пара.slot]?.[пара.index] : null
    if (пара && второй) {
      const arr2 = [...(h.slots[пара.slot] ?? [])]
      arr2[пара.index] = { ...второй, mod: значение || undefined }
      h.slots[пара.slot] = arr2
    }
  })

  commitChar(target.charId, copy)
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

/* ------------------------------------------------------- сессия пати */

export interface PartySession {
  /** Токен доступа. Хранится только в этом браузере. */
  token: string
  partyId: string
  name: string
  role: 'owner' | 'member'
  /** Адрес Worker'а с базой. */
  apiUrl: string
  /**
   * Метка версии базы на сервере, на которой основаны локальные правки.
   *
   * Отдельная от db.updatedAt: та меняется при каждом локальном изменении,
   * а эта нужна для проверки «не затер ли кто-то моё». Пока совпадает с тем,
   * что лежит на сервере, — сохранение проходит без конфликта.
   */
  lastSyncedAt: string
}

const SESSION_KEY = 'pp:session'

let session: PartySession | null = loadSession()

function loadSession(): PartySession | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as PartySession
    if (!s?.token || !s?.apiUrl) return null
    return s
  } catch {
    return null
  }
}

const sessionListeners = new Set<() => void>()

export function useSession(): PartySession | null {
  return useSyncExternalStore(
    (cb) => {
      sessionListeners.add(cb)
      return () => sessionListeners.delete(cb)
    },
    () => session,
  )
}

export function getSession(): PartySession | null {
  return session
}

function saveSession(next: PartySession | null): void {
  session = next
  try {
    if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next))
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    /* приватный режим — сессия живёт только до перезагрузки */
  }
  for (const l of sessionListeners) l()
}

export function signIn(next: PartySession): void {
  saveSession(next)
}

/** Точечное изменение сессии — метки синхронизации, например. */
export function updateSession(patch: Partial<PartySession>): void {
  if (!session) return
  saveSession({ ...session, ...patch })
}

export function signOut(): void {
  saveSession(null)
}

/* ------------------------------------------------------------- общие операции */

/**
 * Заменяет базу целиком — вход в пати, импорт файла, принятие чужой версии.
 *
 * Важно: метку updatedAt берём из входящих данных, а не ставим новую.
 * Здесь мы не меняем игровые данные, а принимаем уже существующие.
 * Если бы ставили своё время, следующая же запись выглядела бы как
 * конфликт с сервером.
 */
export function replaceDb(next: unknown): void {
  const normalized = normalizeDb(next)
  db = { ...normalized, version: DB_VERSION }
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db))
  } catch {
    /* приватный режим */
  }
  emit()
}
