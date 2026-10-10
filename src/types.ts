/**
 * Доменная модель трекера.
 *
 * Всё, что описывает состояние пати, лежит в одном объекте `Db`.
 * Он сериализуется в data.json — и хранится в браузере, и в репозитории.
 */

/**
 * Экипировка разделена на три группы, как в игре.
 *
 * Оружие: две руки — либо оружие и щит, либо двуручное оружие в обеих.
 * Броня: шлем, верх, низ, перчатки, ботинки; цельная броня занимает
 * верх и низ сразу.
 * Бижутерия: ожерелье, две серьги, два кольца.
 */
export interface SlotDef {
  key: string
  label: string
  /** Сколько ячеек в этом слоте: у серёг и колец — по две. */
  max: number
  /** Что можно положить в слот, если знать предмет. */
  accepts: (item: CatalogItem) => boolean
  /** Короткая подсказка для окна выбора. */
  hint: string
}

export const WEAPON_TYPES = new Set([
  'Weapon',
  'Sword 1H',
  'Sword 2H',
  'Sword Mag 1H',
  'Blunt 1H',
  'Blunt 2H',
  'Dagger',
  'Staff',
  'Bow',
  'Spear',
  'Fist',
  'Dual Sword',
])

const isArmor = (i: CatalogItem) => i.type === 'Armor'
const isJewelry = (i: CatalogItem) => i.type === 'Jewelry'

export const SLOTS: Record<string, SlotDef> = {
  rhand: {
    key: 'rhand',
    label: 'В правой руке',
    max: 1,
    accepts: (i) => i.slot === 'r_hand' || WEAPON_TYPES.has(i.type ?? ''),
    hint: 'Оружие: мечи, копья, луки, дробящие, кинжалы, посохи',
  },
  lhand: {
    key: 'lhand',
    label: 'В левой руке',
    max: 1,
    accepts: (i) => i.type === 'Shield' || i.slot === 'l_hand',
    hint: 'Щит. Занят, если оружие двуручное',
  },
  head: {
    key: 'head',
    label: 'Шлем',
    max: 1,
    accepts: (i) => isArmor(i) && i.slot === 'head',
    hint: 'Шлемы, капюшоны, диадемы',
  },
  chest: {
    key: 'chest',
    label: 'Верх',
    max: 1,
    accepts: (i) => isArmor(i) && i.slot === 'chest',
    hint: 'Нагрудники и халаты. Цельная броня занимает ещё и низ',
  },
  legs: {
    key: 'legs',
    label: 'Низ',
    max: 1,
    accepts: (i) => isArmor(i) && i.slot === 'legs',
    hint: 'Поножи и штаны',
  },
  gloves: {
    key: 'gloves',
    label: 'Перчатки',
    max: 1,
    accepts: (i) => isArmor(i) && i.slot === 'gloves',
    hint: 'Перчатки и рукавицы',
  },
  feet: {
    key: 'feet',
    label: 'Ботинки',
    max: 1,
    accepts: (i) => isArmor(i) && i.slot === 'feet',
    hint: 'Сапоги и башмаки',
  },
  neck: {
    key: 'neck',
    label: 'Ожерелье',
    max: 1,
    accepts: (i) => isJewelry(i) && i.slot === 'neck',
    hint: 'Ожерелья и амулеты',
  },
  ear: {
    key: 'ear',
    label: 'Серьги',
    max: 2,
    accepts: (i) => isJewelry(i) && i.slot === 'l_ear',
    hint: 'Серьги, по две штуки',
  },
  ring: {
    key: 'ring',
    label: 'Кольца',
    max: 2,
    accepts: (i) => isJewelry(i) && i.slot === 'l_ring',
    hint: 'Кольца, по две штуки',
  },
}

export const SLOT_GROUPS = [
  { key: 'weapon', label: 'Оружие', slots: ['rhand', 'lhand'] },
  { key: 'armor', label: 'Броня', slots: ['head', 'chest', 'legs', 'gloves', 'feet'] },
  { key: 'jewelry', label: 'Бижутерия', slots: ['neck', 'ear', 'ring'] },
] as const

export type SlotKey = keyof typeof SLOTS

export const SLOT_KEYS = Object.keys(SLOTS) as SlotKey[]

export const SLOT_MAX: Record<SlotKey, number> = SLOT_KEYS.reduce(
  (acc, k) => {
    acc[k] = SLOTS[k].max
    return acc
  },
  {} as Record<SlotKey, number>,
)

export const SLOT_LABEL: Record<SlotKey, string> = SLOT_KEYS.reduce(
  (acc, k) => {
    acc[k] = SLOTS[k].label
    return acc
  },
  {} as Record<SlotKey, string>,
)

/** Двуручное или дуальное оружие занимает обе руки. */
export function occupiesBothHands(item: CatalogItem | null | undefined): boolean {
  return !!item && (item.twoHanded === true || item.dual === true)
}

/** Цельная броня занимает верх и низ. */
export function occupiesChestAndLegs(item: CatalogItem | null | undefined): boolean {
  return !!item && item.fullbody === true
}

/** Одна вещь, надетое на персонажа. */
export interface SlotEntry {
  itemId: number
  /** Заточка строкой: "+16", "ТГ" и т.п. */
  ench?: string
  /**
   * Предмет занимает не один слот, а два: двуручное оружие — обе руки,
   * цельная броня — верх и низ. Помечаем ячейку, где его видно и можно
   * снять, чтобы не дублировать предмет в хранилище дважды.
   */
  spans?: boolean
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
  /** Класс оружия по данным источника: «Двуручные Мечи», «Копья»… */
  weaponClass?: string
  /** Занимает обе руки: двуручное или дуальное оружие. */
  twoHanded?: boolean
  /** Дуальное оружие: надевается парой в обе руки. */
  dual?: boolean
  /** Цельная броня: занимает верх и низ сразу. */
  fullbody?: boolean
  /** Физ. атака оружия. */
  atkPhys?: number
  /** Маг. атака оружия. */
  atkMag?: number
  /** Исходное название, если в нём были две формы через звёздочку. */
  fullName?: string
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
