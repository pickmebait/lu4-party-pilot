/**
 * Доменная модель трекера.
 *
 * Всё, что описывает состояние пати, лежит в одном объекте `Db`.
 * Он сериализуется в data.json — и хранится в браузере, и в репозитории.
 */

export const SLOT_DEFS = [
  { key: 'weapon', label: 'Оружие', max: 1 },
  { key: 'shield', label: 'Щит', max: 1 },
  { key: 'helmet', label: 'Шлем', max: 1 },
  { key: 'body', label: 'Нагрудник', max: 1 },
  { key: 'legs', label: 'Наушники', max: 1 },
  { key: 'boots', label: 'Ботинки', max: 1 },
  { key: 'gloves', label: 'Перчатки', max: 1 },
  { key: 'cloak', label: 'Плащ', max: 1 },
  { key: 'necklace', label: 'Ожерелье', max: 1 },
  { key: 'earring', label: 'Серьги', max: 2 },
  { key: 'ring', label: 'Кольца', max: 2 },
  { key: 'bracelet', label: 'Браслеты', max: 2 },
  { key: 'relic', label: 'Реликвия', max: 1 },
  { key: 'belt', label: 'Пояс', max: 1 },
] as const

export type SlotKey = (typeof SLOT_DEFS)[number]['key']

export const SLOT_KEYS = SLOT_DEFS.map((s) => s.key)

export const SLOT_MAX: Record<SlotKey, number> = SLOT_DEFS.reduce(
  (acc, s) => {
    acc[s.key] = s.max
    return acc
  },
  {} as Record<SlotKey, number>,
)

export const SLOT_LABEL: Record<SlotKey, string> = SLOT_DEFS.reduce(
  (acc, s) => {
    acc[s.key] = s.label
    return acc
  },
  {} as Record<SlotKey, string>,
)

/** Одна вещь, надетое на персонажа. */
export interface SlotEntry {
  itemId: number
  /** Заточка строкой: "+16", "ТГ" и т.п. */
  ench?: string
}

export interface Char {
  id: string
  name: string
  /** Класс: "SM", "Sword E", "Oracle"… — просто текст для удобства. */
  cls: string
  level: number
  /** Ключи слотов массивом, где null = пустой слот. */
  slots: Partial<Record<SlotKey, (SlotEntry | null)[]>>
}

export interface WarehouseStack {
  itemId: number
  count: number
}

export type MoveDir = 'in' | 'out'

export interface MoveLog {
  id: string
  /** ISO-время. */
  ts: string
  /** Кто забрал или положил. */
  who: string
  itemId: number
  count: number
  dir: MoveDir
  note?: string
}

export interface Warehouse {
  stacks: WarehouseStack[]
  log: MoveLog[]
}

/** 1 — срочно, 2 — нужно, 3 — было бы неплохо. */
export type Priority = 1 | 2 | 3

export const PRIORITY_LABEL: Record<Priority, string> = {
  1: 'Срочно',
  2: 'Нужно',
  3: 'Желательно',
}

export interface Wish {
  id: string
  itemId: number
  count: number
  priority: Priority
  /** Кто ищет. */
  seeker: string
  /** Для какого персонажа из пати. */
  forCharId?: string
  note?: string
  done: boolean
  doneAt?: string
}

/** Описание комплекта: id частей + расшифровка бонуса. */
export interface SetDef {
  id: string
  name: string
  /** id предметов, входящих в комплект. */
  pieces: number[]
  bonus?: string
}

export interface Db {
  /** Версия схемы — для миграций при изменении формата. */
  version: number
  /** ISO-время последнего изменения. */
  updatedAt: string
  /** Ник того, кто последний менял — для понятного конфликта при синхронизации. */
  updatedBy: string
  chars: Char[]
  warehouse: Warehouse
  wishes: Wish[]
  sets: SetDef[]
  /**
   * Свои названия предметов: "1146" -> "Клинок Драко".
   * Нужно для частных серверов, где в справочнике предмета нет.
   * Хранится в базе, поэтому названия видны всей пати.
   */
  customNames: Record<string, string>
}

/** Запись справочника предметов. */
export interface CatalogItem {
  /** Порядковый номер в справочнике. Ноль означает «пусто». */
  id: number
  name: string
  /** Техническое имя из клиента: "draco_blade". */
  tex?: string
  /** Имя комплекта, если предмет входит в сет. */
  set?: string
  /** Грейд 0-16: NG 0, D 7, C 9, B 12, A 14, S 16. */
  grade?: number
  /** Иконка относительно корня сайта: "icons/foo.webp". */
  icon?: string
  /** finished | recipe | part | resource | misc | other */
  kind?: string
  /** Слот по данным источника: "r_hand", "l_ear", "feet". */
  slot?: string
  /** Armor | Weapon | Jewelry | Sword 1H | … */
  type?: string
  /** Бонус комплекта, если предмет его часть. */
  bonus?: string
  /** Магическая защита. */
  mDef?: number
  /** Физическая защита. */
  physDef?: number
  /** Другие названия того же предмета. */
  aliases?: string[]
}

export interface Catalog {
  generatedAt: string
  /** Название источника — чтобы понимать, чей это датабаз. */
  source?: string
  items: CatalogItem[]
}
