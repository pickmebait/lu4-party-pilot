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
  /** Какие фильтры показывать в пикере для этого слота. */
  filters: { type?: 'weapon' | 'armor'; grade?: boolean }
}

/** Типы оружия для фильтра: 17 классов источника сведены к семи. */
export const WEAPON_TYPE_LABELS = [
  'Мечи',
  'Дробящие',
  'Кинжалы',
  'Луки и арбалеты',
  'Копья',
  'Посохи',
  'Кастеты',
] as const

export const ARMOR_TYPE_OPTIONS = [
  { value: 'heavy', label: 'Тяжёлая' },
  { value: 'light', label: 'Лёгкая' },
  { value: 'magic', label: 'Магическая' },
] as const

/** Грейды в порядке убывания: так привычнее игроку. */
export const GRADE_OPTIONS = ['NG', 'D', 'C', 'B', 'A'] as const

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

/**
 * Что можно положить в слот.
 *
 * Проверяем только поле slot: в справочнике с восстановленными слотами
 * его есть у всей экипировки, а вот type заполнен меньше чем у половины.
 * Раньше проверка требовала type === 'Armor', из-за чего 12 шлемов и
 * 15 щитов в список не попадали.
 */
export const SLOTS: Record<string, SlotDef> = {
  rhand: {
    key: 'rhand',
    label: 'В правой руке',
    max: 1,
    accepts: (i) => i.slot === 'r_hand',
    hint: 'Оружие: мечи, копья, луки, дробящие, кинжалы, посохи',
    filters: { type: 'weapon', grade: true },
  },
  lhand: {
    key: 'lhand',
    label: 'В левой руке',
    max: 1,
    accepts: (i) => i.slot === 'l_hand',
    hint: 'Щит. Занят, если оружие двуручное',
    filters: { grade: true },
  },
  head: {
    key: 'head',
    label: 'Шлем',
    max: 1,
    accepts: (i) => i.slot === 'head',
    hint: 'Шлемы, капюшоны, диадемы',
    filters: { type: 'armor', grade: true },
  },
  chest: {
    key: 'chest',
    label: 'Верх',
    max: 1,
    accepts: (i) => i.slot === 'chest',
    hint: 'Нагрудники и халаты. Цельная броня занимает ещё и низ',
    filters: { type: 'armor', grade: true },
  },
  legs: {
    key: 'legs',
    label: 'Низ',
    max: 1,
    accepts: (i) => i.slot === 'legs',
    hint: 'Поножи и штаны',
    filters: { type: 'armor', grade: true },
  },
  gloves: {
    key: 'gloves',
    label: 'Перчатки',
    max: 1,
    accepts: (i) => i.slot === 'gloves',
    hint: 'Перчатки и рукавицы',
    filters: { type: 'armor', grade: true },
  },
  feet: {
    key: 'feet',
    label: 'Ботинки',
    max: 1,
    accepts: (i) => i.slot === 'feet',
    hint: 'Сапоги и башмаки',
    filters: { type: 'armor', grade: true },
  },
  neck: {
    key: 'neck',
    label: 'Ожерелье',
    max: 1,
    accepts: (i) => i.slot === 'neck',
    hint: 'Ожерелья и амулеты',
    filters: { grade: true },
  },
  ear: {
    key: 'ear',
    label: 'Серьги',
    max: 2,
    accepts: (i) => i.slot === 'l_ear',
    hint: 'Серьги, по две штуки',
    filters: { grade: true },
  },
  ring: {
    key: 'ring',
    label: 'Кольца',
    max: 2,
    accepts: (i) => i.slot === 'l_ring',
    hint: 'Кольца, по две штуки',
    filters: { grade: true },
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
  /** Исходное название, если в нём были две формы через звёздочку. */
  fullName?: string

  /* ------------------------------------------------------ что это за предмет */

  /** finished — готовая вещь, recipe, part, resource, misc, other. */
  kind?: string
  /** Рыночная секция: armor-A, weapon-C, jewelry-B, resources-1… */
  section?: string
  /** Слот экипировки: r_hand, l_hand, head, chest, legs, gloves, feet, neck, l_ear, l_ring. */
  slot?: string
  /** Armor | Weapon | Jewelry | Shield | Sword 1H… */
  type?: string
  /** Идентификатор вещи у эмулятора: "ear_adamantite", "ft_avadon". */
  equipmentId?: string
  /** Грейд 0-16: NG 0, D 7, C 9, B 12, A 14, S 16. */
  grade?: number
  /** Грейд словами, как в источнике: "NG", "B", "A". */
  gradeName?: string
  /** Иконка относительно корня сайта: "icons/foo.webp". */
  icon?: string

  /* ---------------------------------------------------------------- комплекты */

  set?: string
  /** Бонус комплекта одной строкой. */
  bonus?: string
  /** Бонусы комплекта по частям: тяжёлая, лёгкая, мантия. */
  setBonuses?: string[]
  /** Бонусы редкого варианта вещи. */
  rareBonuses?: string[]
  /** Бонусы после полной обработки. */
  masterworkBonuses?: string[]
  /** Все комплекты предмета, когда их больше одного. */
  sets?: { setName: string; setBonuses?: string[]; rareBonuses?: string[] }[]

  /* ----------------------------------------------------------- оружие и броня */

  /** Класс оружия по данным источника: «Двуручные Мечи», «Копья»… */
  weaponClass?: string
  /**
   * Тип оружия для фильтра: семь групп, в которые сведены семнадцать
   * классов источника. Пусто, если определить не удалось.
   */
  weaponType?: string
  /**
   * Тип брони для фильтра: `heavy`, `light` или `magic`.
   * Пусто у части стартовой брони — такие вещи видны при любом
   * выборе типа, чтобы фильтр ничего не прятал молча.
   */
  armorType?: 'heavy' | 'light' | 'magic'
  /** Занимает обе руки: двуручное или дуальное. */
  twoHanded?: boolean
  /** Дуальное оружие: надевается парой в обе руки. */
  dual?: boolean
  /** Цельная броня: занимает верх и низ сразу. */
  fullbody?: boolean
  /** Физ. атака оружия. */
  atkPhys?: number
  /** Маг. атака оружия. */
  atkMag?: number
  /** Физ. защита брони. */
  physDef?: number
  /** Маг. защита брони. */
  mDef?: number
  /** Прирост маны. */
  mpIncrease?: number
  /** Название части: у брони может отличаться от названия вещи. */
  pieceName?: string
  /** SA-эффекты: тир, цвет, название, описание. */
  saEffects?: { tier?: string; color?: string; name?: string; effect?: string }[]
  /** Особый эффект редкой вещи. */
  rareEffect?: string

  /* --------------------------------------------------------------------- крафт */

  recipe?: {
    chance?: string
    outputQty?: number
    ingredients?: { name: string; qty: number; catalogId?: string }[]
  }
  materialRecipe?: { outputQty?: number; ingredients?: { name: string; qty: number }[] }

  /* ------------------------------------------------------------ торговые данные */

  /** Требуемый уровень по данным рынка. */
  marketLevel?: number
  derivedPrice?: boolean

  /* ------------------------------------------------------------------- прочее */

  /** Варианты вещи: тяжёлая, лёгкая, мантия — со своими значками и бонусами. */
  variants?: {
    name: string
    icon?: string
    variant?: string
    set?: string
    setBonuses?: string[]
  }[]
  /** Другие названия того же предмета. */
  aliases?: string[]
}

export interface Catalog {
  generatedAt: string
  /** Название источника — чтобы понимать, чей это датабаз. */
  source?: string
  items: CatalogItem[]
}
