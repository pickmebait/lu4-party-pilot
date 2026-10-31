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
  filters: { type?: 'weapon' | 'armor' | 'jewelry'; grade?: boolean; itemType?: boolean }
}

/**
 * Типы оружия для фильтра — так их перечисляет вики в статье
 * «Все виды оружия». Разбивка мельче, чем у поиска: «Двуручные мечи» и
 * «Парные мечи» в поиске сливаются в просто «Мечи», а это разные вещи.
 */
export const WEAPON_TYPE_LABELS = [
  'Мечи',
  'Топоры',
  'Кинжалы',
  'Луки',
  'Двуручные мечи',
  'Двуручные топоры',
  'Кастеты',
  'Копья',
  'Магические мечи',
  'Магические посохи',
  'Магические кинжалы',
  'Двуручные посохи',
  'Парные мечи',
  'Парные топоры',
  'Парные кинжалы',
  'Другое',
] as const

export const ARMOR_TYPE_OPTIONS = [
  { value: 'heavy', label: 'Тяжёлая' },
  { value: 'light', label: 'Лёгкая' },
  { value: 'magic', label: 'Магическая' },
]
export const ARMOR_TYPE_LABELS: Record<string, string> = {
  heavy: 'Тяжёлая',
  light: 'Лёгкая',
  magic: 'Магическая',
}
export const ARMOR_ITEM_TYPE_OPTIONS = [
  { value: 'top', label: 'Верхние' },
  { value: 'bottom', label: 'Нижние' },
  { value: 'full', label: 'Полные' },
  { value: 'helmet', label: 'Шлемы' },
  { value: 'gloves', label: 'Перчатки' },
  { value: 'boots', label: 'Ботинки' },
  { value: 'shield', label: 'Щиты' },
  { value: 'accessory', label: 'Аксессуары' },
] as const
export const ARMOR_ITEM_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  ARMOR_ITEM_TYPE_OPTIONS.map((o) => [o.value, o.label]),
)
export const JEWELRY_TYPE_OPTIONS = [
  { value: 'l_ring', label: 'Кольца' },
  { value: 'l_ear', label: 'Серьги' },
  { value: 'neck', label: 'Ожерелья' },
  { value: 'epic', label: 'Эпическая' },
] as const

/** Грейды в порядке убывания: так привычнее игроку. */
export const GRADE_OPTIONS = ['NG', 'D', 'C', 'B', 'A'] as const

/**
 * Числовой код грейда для цвета метки.
 *
 * Источник отдаёт грейд строкой, но старая база была числом 0-16, и в
 * версии партии могут остаться оба вида — поэтому функция понимает и то и
 * другое. Код нужен, чтобы красить метку классом g0…g16.
 */
const GRADE_CODES: Record<string, number> = { NG: 0, D: 7, C: 9, B: 12, A: 14, S: 16 }

/**
 * Границы диапазонов для обратного перевода.
 *
 * Это не то же самое, что GRADE_CODES: там характерное значение грейда,
 * здесь — с какого числа он начинается. В игре 11 и 12 — это B, поэтому
 * граница B равна 11, а не 12.
 */
const GRADE_BANDS: { от: number; имя: string }[] = [
  { от: 15, имя: 'S' },
  { от: 13, имя: 'A' },
  { от: 11, имя: 'B' },
  { от: 9, имя: 'C' },
  { от: 7, имя: 'D' },
  { от: 6, имя: 'NG' },
]

/** Грейд словами. Принимает строку («B») и число (11) — версии баз разные. */
export function gradeLabel(grade?: number | string): string {
  if (typeof grade === 'string') return grade
  if (typeof grade !== 'number') return ''
  return GRADE_BANDS.find((полоса) => grade >= полоса.от)?.имя ?? 'NG'
}

/** Числовой код грейда для цвета метки, либо null если грейда нет. */
export function gradeCode(grade?: number | string): number | null {
  if (typeof grade === 'number') return grade
  if (typeof grade === 'string') return GRADE_CODES[grade] ?? null
  return null
}

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
    hint: 'Оружие: мечи, топоры, кинжалы, луки, копья, кастеты, посохи',
    filters: { type: 'weapon', grade: true },
  },
  lhand: {
    key: 'lhand',
    label: 'В левой руке',
    max: 1,
    accepts: (i) => i.slot === 'l_hand',
    hint: 'Щит. Занят, если оружие двуручное или парное',
    filters: { grade: true },
  },
  head: {
    key: 'head',
    label: 'Шлем',
    max: 1,
    accepts: (i) => i.slot === 'head',
    hint: 'Шлемы, капюшоны, диадемы и аксессуары',
    filters: { type: 'armor', grade: true, itemType: true },
  },
  chest: {
    key: 'chest',
    label: 'Верх',
    max: 1,
    accepts: (i) => i.slot === 'chest',
    hint: 'Нагрудники и халаты. Цельная броня занимает ещё и низ',
    filters: { type: 'armor', grade: true, itemType: true },
  },
  legs: {
    key: 'legs',
    label: 'Низ',
    max: 1,
    accepts: (i) => i.slot === 'legs',
    hint: 'Поножи и штаны',
    filters: { type: 'armor', grade: true, itemType: true },
  },
  gloves: {
    key: 'gloves',
    label: 'Перчатки',
    max: 1,
    accepts: (i) => i.slot === 'gloves',
    hint: 'Перчатки и рукавицы',
    filters: { type: 'armor', grade: true, itemType: true },
  },
  feet: {
    key: 'feet',
    label: 'Ботинки',
    max: 1,
    accepts: (i) => i.slot === 'feet',
    hint: 'Сапоги и башмаки',
    filters: { type: 'armor', grade: true, itemType: true },
  },
  neck: {
    key: 'neck',
    label: 'Ожерелье',
    max: 1,
    accepts: (i) => i.slot === 'neck',
    hint: 'Ожерелья и амулеты',
    filters: { type: 'jewelry', grade: true },
  },
  ear: {
    key: 'ear',
    label: 'Серьги',
    max: 2,
    accepts: (i) => i.slot === 'l_ear',
    hint: 'Серьги, по две штуки',
    filters: { type: 'jewelry', grade: true },
  },
  ring: {
    key: 'ring',
    label: 'Кольца',
    max: 2,
    accepts: (i) => i.slot === 'l_ring',
    hint: 'Кольца, по две штуки',
    filters: { type: 'jewelry', grade: true },
  },
}

/** Слоты, из которых состоит один набор оружия. */
export const WEAPON_SLOTS = ['rhand', 'lhand'] as const

/** Слоты, из которых состоит один набор брони. */
export const ARMOR_SLOTS = ['head', 'chest', 'legs', 'gloves', 'feet'] as const

export const SLOT_GROUPS = [
  { key: 'weapon', label: 'Оружие', slots: WEAPON_SLOTS },
  { key: 'armor', label: 'Броня', slots: ARMOR_SLOTS },
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

/** Наибольшая заточка в игре: +16. */
export const MAX_MOD = 16

/** Выбранные свойства оружия: один SA-эффект и отметка редкого. */
export interface ItemEffectChoice {
  /** Название выбранного SA-эффекта; пусто — без SA. */
  sa?: string
  /** Есть ли у вещи редкий эффект. */
  rare?: boolean
}

/** Одна вещь, надетое на персонажа. */
export interface SlotEntry extends ItemEffectChoice {
  itemId: number
  /**
   * Заточка: от 0 до 16, то есть +0…+16.
   *
   * Раньше здесь лежал свободный текст («+16», «ТГ»), и в него можно было
   * вписать что угодно. Теперь строго число, старое значение переносится
   * числом.
   */
  mod?: number
  /**
   * Предмет занимает не один слот, а два: двуручное оружие — обе руки,
   * цельная броня — верх и низ. Помечаем ячейку, где его видно и можно
   * снять, чтобы не дублировать предмет в хранилище дважды.
   */
  spans?: boolean
}

/**
 * Один дополнительный набор оружия.
 *
 * Первый набор живёт в обычных слотах rhand/lhand: его видно во всех старых
 * базах, и он не требует отдельного поля. Здесь лежат только второй и третий
 * наборы, по две ячейки в каждом.
 */
export interface WeaponSet {
  rhand: (SlotEntry | null)[]
  lhand: (SlotEntry | null)[]
}

/** Сколько наборов оружия можно завести на одну ветку. */
export const MAX_WEAPON_SETS = 3

/**
 * Один дополнительный набор брони.
 *
 * Первый набор живёт в обычных слотах head/chest/legs/gloves/feet: его видно
 * во всех старых базах, и он не требует отдельного поля. Здесь лежат только
 * второй и третий наборы. Бижутерия в набор не входит — её не переодевают
 * вместе с доспехом, и она остаётся общей для всех наборов.
 */
export interface ArmorSet {
  head: (SlotEntry | null)[]
  chest: (SlotEntry | null)[]
  legs: (SlotEntry | null)[]
  gloves: (SlotEntry | null)[]
  feet: (SlotEntry | null)[]
}

/** Сколько наборов брони можно завести на одну ветку. */
export const MAX_ARMOR_SETS = 3

/**
 * Контакты персонажа вне игры.
 *
 * В игре ники ничего не говорят, а связаться с кем-то надо. Хранится
 * свободным текстом, без проверки формата: телеграм-ссылку пишут и как
 * t.me/nick, и как @nick, и как https://t.me/nick — приводим к ссылке
 * только при показе.
 */
export interface Contacts {
  /** Имя в реальной жизни. */
  realName?: string
  /** Номер телефона: +7 999 123-45-67. */
  phone?: string
  /** Телеграм: @nick, t.me/nick или полная ссылка. */
  telegram?: string
  /** Дискорд: user#1234 или ник — превращаем в ссылку на профиль. */
  discord?: string
}

/**
 * Принадлежность персонажа: в какие локации он ходит.
 *
 * Задаёт и порядок в списке — состав, потом десятка, потом окно, — поэтому
 * порядок в массиве AFFILIATIONS важен, и менять его нельзя молча.
 */
export const AFFILIATIONS = [
  { key: 'roster', label: 'Состав' },
  { key: 'decade', label: 'Десятка' },
  { key: 'window', label: 'Окно' },
] as const

export type Affiliation = (typeof AFFILIATIONS)[number]['key']

/** Состав — обычный участник пати, подходит большинству. */
export const DEFAULT_AFFILIATION: Affiliation = 'roster'

const МЕТКИ: Record<Affiliation, string> = Object.fromEntries(
  AFFILIATIONS.map((a) => [a.key, a.label]),
) as Record<Affiliation, string>

export function affiliationLabel(key: string | undefined): string {
  return key && key in МЕТКИ ? МЕТКИ[key as Affiliation] : МЕТКИ[DEFAULT_AFFILIATION]
}

/** Меньше — выше в списке. */
export function affiliationOrder(key: string | undefined): number {
  const i = AFFILIATIONS.findIndex((a) => a.key === key)
  return i === -1 ? AFFILIATIONS.length : i
}

/**
 * Саб-класс: та же персонажка, но другая профессия, свой уровень и своя
 * экипировка. В игре их три на персонажа — столько и здесь.
 */
export interface Sub {
  id: string
  /** Профессия саб-класса — тот же список, что и у основной. */
  cls: string
  level: number
  /** Экипировка саб-класса — свои слоты, основная от этого не страдает. */
  slots: Partial<Record<SlotKey, (SlotEntry | null)[]>>
  /**
   * Второй и третий наборы оружия. Первый лежит в slots.rhand/lhand.
   * Отсутствие поля значит один набор.
   */
  extraWeaponSets?: WeaponSet[]
  /**
   * Второй и третий наборы брони. Первый лежит в slots.head/chest/legs/
   * gloves/feet. Отсутствие поля значит один набор.
   */
  extraArmorSets?: ArmorSet[]
}

/** Сколько сабов можно добавить на персонажа. */
export const MAX_SUBS = 3

export interface Char {
  id: string
  name: string
  /** Класс: "SM", "Sword E", "Oracle"… — просто текст для удобства. */
  cls: string
  level: number
  /**
   * Принадлежность. В базе всегда заполнена: у персонажей, созданных до
   * появления поля, проставляется состав.
   */
  affil: Affiliation
  /** Ключи слотов массивом, где null = пустой слот. */
  slots: Partial<Record<SlotKey, (SlotEntry | null)[]>>
  /**
   * Второй и третий наборы оружия. Первый лежит в slots.rhand/lhand.
   * Отсутствие поля значит один набор.
   */
  extraWeaponSets?: WeaponSet[]
  /**
   * Второй и третий наборы брони. Первый лежит в slots.head/chest/legs/
   * gloves/feet. Отсутствие поля значит один набор.
   */
  extraArmorSets?: ArmorSet[]
  /** Контакты вне игры. Отсутствует, если их не заполняли. */
  contacts?: Contacts
  /**
   * Пройден ли квест на саб-класс.
   *
   * Пока нет, сабы не добавляются: в игре без квеста их и не бывает.
   * Снятие отметки прячет сабов, но не стирает — вдруг отметили по ошибке.
   */
  subUnlocked: boolean
  /** Саб-классы, до MAX_SUBS штук. */
  subs: Sub[]
  /**
   * Отсутствия: YYYY-MM-DD → когда персонажа не будет.
   *
   * Хранится в персонаже, а не в расписании: это сведения о человеке, а не
   * о том, собираемся мы или нет. Их видно всей пати — по ним и планируют
   * состав на конкретный вечер.
   */
  away: Record<string, Absence>
  /**
   * Платный аккаунт: когда куплен и на сколько.
   *
   * Отсутствует, если не заполнен. Объектом, а не двумя полями: у ПА всего
   * два состояния — куплен или не заполнен, а пара полей добавила бы третье,
   * «даты нет, а срок есть», из которого остаток не считается.
   */
  pa?: Pa
}

/**
 * Платный аккаунт: дата покупки и срок.
 *
 * Хранится покупкой, а не датой окончания. Продление в игре добавляется к
 * текущему сроку: после покупки ещё 30 дней дата окончания сдвигается сама
 * собой на месяц вперёд, и вручную её пересчитывать не нужно.
 */
export interface Pa {
  /** Дата покупки, YYYY-MM-DD. */
  from: string
  /** На сколько дней купили. */
  days: number
}

/** На сколько дней в игре продаётся ПА. Других вариантов нет. */
export const PA_DAYS = [1, 3, 7, 14, 30, 100] as const

/* --------------------------------------------------------------- расписание */

/**
 * Окно прайма в минутах от полуночи.
 *
 * Минуты, а не «20:00»: сетка календаря рисуется в минутах, и сравнивать
 * окна между собой и с диапазонами удобнее числами, а не строками, —
 * «23:00» и «9:00» из строк не сравнить, из чисел сравнится.
 */
export interface PrimeWindow {
  from: number
  to: number
}

/**
 * Отсутствие персонажа.
 *
 * Либо весь день, либо окно: «не выйду после десяти» — это тоже
 * отсутствие, и платить за него не надо, а за весь день платят.
 */
export interface Absence {
  /** Весь день целиком. */
  whole: boolean
  /** Часть дня. Заполняется, только если whole = false. */
  window?: PrimeWindow
}

export interface Schedule {
  /**
   * Прайм по дням: YYYY-MM-DD → окно.
   *
   * Диапазонов нет: они просились для «с понедельника по пятницу», но на
   * деле оказались лишним слоем — правило «в праздник прайма нет» всё равно
   * приходилось вписывать отдельно на каждый день.
   *
   * Отдельной отмены тоже нет: день либо с праймом, либо выходной, либо
   * ничего не решено. Три состояния означали бы, что «отменённый» день и
   * день без прайма — разные вещи, а различать их пришлось бы зачёркиванием,
   * и в календаре это читалось как поломка записи.
   */
  prime: Record<string, PrimeWindow>
  /**
   * Выходные для всей пати. Даты, в которые не собираемся никуда: в них
   * не назначается прайм, и видно их сразу, а не по отсутствию записи.
   */
  offs: string[]
  /** Чеклист готовности: что проверить перед праймом. Общий для пати. */
  checklist: ChecklistItem[]
}

/**
 * Пункт чеклиста.
 *
 * Без отметки готовности: она личная и держится только в текущей вкладке
 * (см. checklistSession), потому что «я уже проверил» — не сведение о пати.
 * Общее у пункта только то, что он есть.
 */
export interface ChecklistItem {
  id: string
  text: string
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


// Модель целей живёт рядом с разбором и прогрессом: она нужна и расчётам,
// и проверкам, и хранить её здесь значило бы дублировать определение.
import type { Goal } from './lib/goals'

/** Описание комплекта: id частей + расшифровка бонуса. */
export interface SetDef {
  id: string
  name: string
  /** id предметов, входящих в комплект. */
  pieces: number[]
  bonus?: string
}

/** Вещь в том виде, в каком её стоит запомнить в истории. */
export interface ВещьВИстории {
  itemId: number
  /** Заточка; 0 — вещь без усиления. */
  mod: number
  /** Выбранный SA-эффект, если был. */
  sa?: string
  /** Был ли отмечен редкий эффект. */
  rare?: boolean
}

/**
 * Запись об изменении персонажа.
 *
 * В базе хранилось только текущее состояние, и по нему нельзя было ответить
 * на два вопроса, которые спрашивают чаще всего: как я развивался и что не
 * успел к тому прайму. Ответить на них можно было только заведя историю.
 *
 * Хранится не снимок снаряжения, а разница: «было и стало». По разницам
 * состояние на любой прошлый момент восстанавливается обратным ходом, и
 * год изменений занимает в базе десятки килобайт вместо мегабайта снимков.
 */
export type Изменение =
  | {
      /** ISO-время, когда записали. */
      ts: string
      /** Ник того, кто менял: персонаж или «Мастер». */
      кто: string
      charId: string
      вид: 'слот'
      /** Слот, в котором изменилась вещь. */
      слот: SlotKey
      /** id саб-класса, если это его слоты; null — основная профессия. */
      subId: string | null
      /**
       * Номер дополнительного набора оружия: 1 или 2.
       *
       * У первого набора поля нет — так старые записи истории остаются
       * прежними, а аналитика читает их без отдельного случая.
       */
      weaponSet?: number
      /**
       * Номер дополнительного набора брони: 1 или 2.
       *
       * Поле отдельное от weaponSet: номера наборов брони и оружия
       * независимы, и один и тот же второй набор может быть только у одного
       * вида снаряжения.
       */
      armorSet?: number
      /**
       * Слот целиком, по ячейкам.
       *
       * Не одна вещь: в кольцах и серьгах их по две, и средняя заточка по
       * одному кольцу вместо двух считалась бы вдвое выше настоящей.
       */
      было: (ВещьВИстории | null)[]
      стало: (ВещьВИстории | null)[]
    }
  | {
      ts: string
      кто: string
      charId: string
      вид: 'уровень'
      было: number
      стало: number
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
  goals: Goal[]
  sets: SetDef[]
  /**
   * Свои названия предметов: "1146" -> "Клинок Драко".
   * Нужно для частных серверов, где в справочнике предмета нет.
   * Хранится в базе, поэтому названия видны всей пати.
   */
  customNames: Record<string, string>
  /** Расписание прайма: общие диапазоны и отступления по дням. */
  schedule: Schedule
  /**
   * История изменений снаряжения и уровня, от новых к старым.
   *
   * Необязательна: у партий, созданных до её появления, её нет, и это не
   * поломка — просто нечего показывать. Обрезается по мере роста, см.
   * ПОТОЛОК_ИСТОРИИ в store.ts.
   */
  history?: Изменение[]
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
  /** Иконка относительно корня сайта: "icons-mw/foo.png". */
  icon?: string
  /** Исходная страница предмета на masterwork.wiki. */
  url?: string
  /** Исходная картинка на masterwork.wiki. */
  imageUrl?: string

  /* ---------------------------------------------------------------- комплекты */

  set?: string
  /** Название комплекта без варианта брони. */
  setName?: string
  /** Вариант комплекта: тяжёлый, лёгкий или магический. */
  setType?: 'heavy' | 'light' | 'magic'
  /** Устойчивый идентификатор комплекта: имя плюс вариант. */
  setId?: string
  /** Бонус комплекта одной строкой. */
  bonus?: string
  /** Бонусы комплекта по частям: тяжёлая, лёгкая, мантия. */
  setBonuses?: string[]
  /** Бонусы редкого варианта вещи. */
  rareBonuses?: string[]
  /** Бонусы после полной обработки. */
  masterworkBonuses?: string[]
  /** Все комплекты предмета, когда их больше одного. */
  sets?: {
    setId?: string
    setName: string
    setType?: 'heavy' | 'light' | 'magic'
    setBonuses?: string[]
    rareBonuses?: string[]
  }[]

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
   * Взято со статьи вики «Все доспехи и комплекты» и из названия вещи
   * («Dark Crystal Boots Heavy Armor»). У шлемов, перчаток и сапог тип
   * есть не везде — такие вещи видны при любом выборе.
   */
  armorType?: 'heavy' | 'light' | 'magic'
  /** Тип предмета брони: верх, низ, полный, шлем, перчатки, ботинки, щит, аксессуар. */
  armorItemType?: string
  /** Тип бижутерии для фильтра: кольца, серьги, ожерелья, эпическая. */
  jewelryType?: string
  /** Эпическая бижутерия по статье «Все виды бижутерии». */
  epic?: boolean
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
  /** SA-эффекты: название и описание, по одному на каждый из трёх вариантов. */
  saEffects?: { name?: string; description?: string }[]
  /** Общий бонус, который действует при любом из SA-вариантов. */
  saCommon?: { name?: string; description?: string }
  /** Особый эффект редкой вещи: название и описание. */
  rareEffect?: { name?: string; description?: string }
  /** Все редкие эффекты: у шлемов их бывает три, по варианту брони. */
  rareEffects?: { name?: string; description?: string }[]
  /** Бонусы, которые открываются при определённой заточке. */
  enchantBonuses?: { mod: number; description: string }[]
  /** Эпический бонус бижутерии. */
  epicBonus?: { name?: string; description?: string }

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

export interface CatalogSet {
  id: string
  name: string
  type?: 'heavy' | 'light' | 'magic'
  grade?: string
  tier?: string
  /** id предметов, которые входят в комплект. */
  pieces: number[]
  bonuses?: string[]
  /** Суммарные защита и MP комплекта, если источник их приводит. */
  totals?: string[]
}

export interface Catalog {
  generatedAt: string
  /** Название источника — чтобы понимать, чей это датабаз. */
  source?: string
  items: CatalogItem[]
  /** Комплекты брони: части, варианты и бонусы. */
  sets?: CatalogSet[]
  /** Статьи, из которых собран справочник. */
  posts?: { kind: string; url: string; title?: string; scrapedAt?: string; count?: number }[]
}

/**
 * Подпись комплекта для ячеек и списка.
 *
 * У тяжёлой, лёгкой и магической версии одного комплекта совпадает имя,
 * поэтому вариант показываем рядом. У шлема, который входит сразу в три
 * варианта, вместо типа стоит число вариантов.
 */
export function setLabel(item: CatalogItem): string {
  if (!item.set) return ''
  if (item.sets && item.sets.length > 1) return `${item.set} · ${item.sets.length} варианта`
  const type = item.setType ? ARMOR_TYPE_LABELS[item.setType] : ''
  return type ? `${item.set} · ${type}` : item.set
}
