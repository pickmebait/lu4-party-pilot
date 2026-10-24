/**
 * Сборка public/items.json из трёх статей masterwork.wiki.
 *
 * Источники:
 *   data/masterwork/posts/weapons.json   все виды оружия
 *   data/masterwork/posts/jewelry.json   все виды бижутерии
 *   data/masterwork/posts/armor.json     все доспехи и комплекты
 *
 * Запуск:
 *   node scripts/build-catalog.mjs                 скачать недостающие иконки
 *   node scripts/build-catalog.mjs --no-icons      только items.json
 *   node scripts/build-catalog.mjs --refresh-icons заново скачать все иконки
 *
 * Скрипт намеренно падает, если данные не сходятся: лучше остановиться на
 * сборке, чем записать справочник с потерянными SA, слотами или комплектами.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'

const КОРЕНЬ = fileURLToPath(new URL('..', import.meta.url))
const ПАПКА_ПОСТОВ = join(КОРЕНЬ, 'data', 'masterwork', 'posts')
const ПУБЛИЧНАЯ = join(КОРЕНЬ, 'public')
const ПАПКА_ИКОНОК = join(ПУБЛИЧНАЯ, 'icons-mw')
const ФАЙЛ_КАТАЛОГА = join(ПУБЛИЧНАЯ, 'items.json')
const ИСТОЧНИК = 'https://masterwork.wiki'
const ПАУЗА_МС = 140

const аргументы = new Set(process.argv.slice(2))
const безИконок = аргументы.has('--no-icons')
const обновитьИконки = аргументы.has('--refresh-icons')

const ГРЕЙДЫ = { NG: 0, D: 7, C: 9, B: 12, A: 14 }
const ГРЕЙДЫ_СЛОВАМИ = new Set(Object.keys(ГРЕЙДЫ))

/**
 * Классы оружия в статье и подписи фильтра. «Посохи» в игре — магические
 * посохи, поэтому в фильтре они называются так же, как остальные магические
 * ветки. Список должен совпадать с WEAPON_TYPE_LABELS в src/types.ts.
 */
const ТИПЫ_ОРУЖИЯ = new Map([
  ['Мечи', 'Мечи'],
  ['Топоры', 'Топоры'],
  ['Кинжалы', 'Кинжалы'],
  ['Луки', 'Луки'],
  ['Двуручные мечи', 'Двуручные мечи'],
  ['Двуручные топоры', 'Двуручные топоры'],
  ['Кастеты', 'Кастеты'],
  ['Копья', 'Копья'],
  ['Магические мечи', 'Магические мечи'],
  ['Посохи', 'Магические посохи'],
  ['Магические кинжалы', 'Магические кинжалы'],
  ['Двуручные посохи', 'Двуручные посохи'],
  ['Парные мечи', 'Парные мечи'],
  ['Парные топоры', 'Парные топоры'],
  ['Парные кинжалы', 'Парные кинжалы'],
  ['Другое', 'Другое'],
])

const СЛОТЫ_БИЖУТЕРИИ = { ring: 'l_ring', earring: 'l_ear', necklace: 'neck' }
const ТИПЫ_ПРЕДМЕТОВ_БРОНИ = new Set([
  'top',
  'bottom',
  'full',
  'helmet',
  'gloves',
  'boots',
  'shield',
  'accessory',
])

function прочитать(файл) {
  return JSON.parse(readFileSync(join(ПАПКА_ПОСТОВ, файл), 'utf8'))
}

function проверить(условие, сообщение) {
  if (!условие) throw new Error(сообщение)
}

function чисто(значение) {
  return String(значение ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function абсолютный(путь) {
  return new URL(путь, ИСТОЧНИК).href
}

function имяИконки(src) {
  const имя = String(src || '').split('/').pop() || ''
  проверить(/^[a-zA-Z0-9_.-]+\.png$/.test(имя), `плохое имя иконки: "${src}"`)
  return имя
}

function иконка(src) {
  return `icons-mw/${имяИконки(src)}`
}

function редкие(эффекты) {
  return (эффекты ?? []).map((э) => ({
    name: чисто(э.name) || undefined,
    description: чисто(э.description) || undefined,
  }))
}

function предметОружия(сырой) {
  const тип = ТИПЫ_ОРУЖИЯ.get(сырой.weaponClass)
  проверить(тип, `неизвестный класс оружия: "${сырой.weaponClass}"`)
  проверить(ГРЕЙДЫ_СЛОВАМИ.has(сырой.gradeName), `неизвестный грейд оружия: "${сырой.gradeName}"`)

  const sa = (сырой.saEffects ?? []).map((э) => ({
    name: чисто(э.name) || undefined,
    description: чисто(э.description) || undefined,
  }))
  проверить(sa.length === 0 || sa.length === 3, `у "${сырой.name}" SA ${sa.length}, а не 0 или 3`)
  for (const э of sa) {
    проверить(э.name && э.description, `у "${сырой.name}" пустой SA`)
  }

  const всеРедкие = редкие(сырой.rareEffects)
  for (const э of всеРедкие) {
    проверить(э.name && э.description, `у "${сырой.name}" пустой редкий эффект`)
  }

  const заточка = (сырой.enchantBonuses ?? [])
    .map((б) => ({ mod: Number(б.mod), description: чисто(б.description) }))
    .sort((a, b) => a.mod - b.mod)
  for (const б of заточка) {
    проверить(Number.isInteger(б.mod) && б.mod > 0, `у "${сырой.name}" плохая заточка ${б.mod}`)
    проверить(б.description, `у "${сырой.name}" пустое описание заточки +${б.mod}`)
  }

  /*
   * Кастеты в игре занимают обе руки, хотя в статье они не названы
   * двуручными. Это правило одинаково для всех кастетов, поэтому опираемся
   * на класс оружия, а не на отдельный список предметов.
   */
  const двуручное =
    сырой.weaponClass === 'Кастеты' ||
    сырой.weaponClass === 'Луки' ||
    сырой.weaponClass.startsWith('Двуручные') ||
    сырой.weaponClass.startsWith('Парные')
  const парное = сырой.weaponClass.startsWith('Парные')

  return {
    id: сырой.id,
    name: чисто(сырой.name),
    tex: сырой.slug,
    fullName: чисто(сырой.name),
    kind: 'finished',
    section: `weapon-${сырой.gradeName}`,
    slot: 'r_hand',
    type: 'Weapon',
    equipmentId: сырой.slug,
    grade: ГРЕЙДЫ[сырой.gradeName],
    gradeName: сырой.gradeName,
    icon: иконка(сырой.icon),
    url: сырой.url,
    imageUrl: абсолютный(сырой.imageSrc),
    weaponClass: сырой.weaponClass,
    weaponType: тип,
    twoHanded: двуручное || undefined,
    dual: парное || undefined,
    atkPhys: сырой.atkPhys,
    atkMag: сырой.atkMag,
    saEffects: sa.length ? sa : undefined,
    saCommon: сырой.saCommon
      ? {
          name: чисто(сырой.saCommon.name) || undefined,
          description: чисто(сырой.saCommon.description) || undefined,
        }
      : undefined,
    rareEffect: всеРедкие[0],
    rareEffects: всеРедкие.length ? всеРедкие : undefined,
    enchantBonuses: заточка.length ? заточка : undefined,
  }
}

function предметБижутерии(сырой) {
  проверить(ГРЕЙДЫ_СЛОВАМИ.has(сырой.gradeName), `неизвестный грейд бижутерии: "${сырой.gradeName}"`)
  const слот = СЛОТЫ_БИЖУТЕРИИ[сырой.jewelryType]
  проверить(слот, `неизвестный тип бижутерии: "${сырой.jewelryType}"`)
  проверить(слот === сырой.slot, `у "${сырой.name}" слот ${сырой.slot} не совпадает с типом ${сырой.jewelryType}`)
  проверить(Number(сырой.mDef) > 0, `у "${сырой.name}" нет маг. защиты`)
  const всеРедкие = редкие(сырой.rareEffects)
  for (const э of всеРедкие) {
    проверить(э.name && э.description, `у "${сырой.name}" пустой редкий эффект`)
  }

  return {
    id: сырой.id,
    name: чисто(сырой.name),
    tex: сырой.slug,
    fullName: чисто(сырой.name),
    kind: 'finished',
    section: `jewelry-${сырой.gradeName}`,
    slot: слот,
    type: 'Jewelry',
    equipmentId: сырой.slug,
    grade: ГРЕЙДЫ[сырой.gradeName],
    gradeName: сырой.gradeName,
    icon: иконка(сырой.icon),
    url: сырой.url,
    imageUrl: абсолютный(сырой.imageSrc),
    jewelryType: сырой.jewelryType,
    epic: сырой.epic || undefined,
    mDef: Number(сырой.mDef),
    mpIncrease: Number.isFinite(Number(сырой.mpIncrease)) ? Number(сырой.mpIncrease) : undefined,
    rareEffect: всеРедкие[0],
    rareEffects: всеРедкие.length ? всеРедкие : undefined,
    epicBonus: сырой.epicBonus
      ? {
          name: чисто(сырой.epicBonus.name) || undefined,
          description: чисто(сырой.epicBonus.description) || undefined,
        }
      : undefined,
  }
}

function предметБрони(сырой) {
  проверить(ГРЕЙДЫ_СЛОВАМИ.has(сырой.gradeName), `неизвестный грейд брони: "${сырой.gradeName}"`)
  проверить(ТИПЫ_ПРЕДМЕТОВ_БРОНИ.has(сырой.armorItemType), `неизвестный тип предмета брони: "${сырой.armorItemType}"`)
  проверить(сырой.slot, `у "${сырой.name}" нет слота`)
  if (сырой.fullbody) проверить(сырой.slot === 'chest', `цельная броня "${сырой.name}" не в слоте верха`)
  if (сырой.armorItemType === 'shield') проверить(сырой.slot === 'l_hand', `щит "${сырой.name}" не в левой руке`)
  if (сырой.armorItemType === 'accessory') проверить(сырой.slot === 'head', `аксессуар "${сырой.name}" не в шлеме`)

  const всеРедкие = редкие(сырой.rareEffects)
  for (const э of всеРедкие) {
    проверить(э.name && э.description, `у "${сырой.name}" пустой редкий эффект`)
  }

  const наборы = (сырой.sets ?? []).map((с) => ({
    setId: с.setId,
    setName: чисто(с.setName),
    setType: с.setType || undefined,
    setBonuses: (с.setBonuses ?? []).map(чисто).filter(Boolean),
  }))
  проверить(наборы.length === 0 || наборы.every((с) => с.setId && с.setName), `у "${сырой.name}" неполный комплект`)

  return {
    id: сырой.id,
    name: чисто(сырой.name),
    tex: сырой.slug,
    fullName: чисто(сырой.name),
    kind: 'finished',
    section: `armor-${сырой.gradeName}`,
    slot: сырой.slot,
    type:
      сырой.armorItemType === 'shield'
        ? 'Shield'
        : сырой.armorItemType === 'accessory'
          ? 'Accessory'
          : 'Armor',
    equipmentId: сырой.slug,
    grade: ГРЕЙДЫ[сырой.gradeName],
    gradeName: сырой.gradeName,
    icon: иконка(сырой.icon),
    url: сырой.url,
    imageUrl: абсолютный(сырой.imageSrc),
    armorType: сырой.armorType || undefined,
    armorItemType: сырой.armorItemType,
    fullbody: сырой.fullbody || undefined,
    physDef: сырой.pdef,
    mpIncrease: сырой.mp,
    set: чисто(сырой.set) || undefined,
    setName: чисто(сырой.set) || undefined,
    setType: сырой.setType || undefined,
    setId: наборы.length === 1 ? наборы[0].setId : undefined,
    setBonuses: сырой.setBonuses?.length ? сырой.setBonuses.map(чисто).filter(Boolean) : undefined,
    bonus: сырой.setBonuses?.length ? сырой.setBonuses.map(чисто).filter(Boolean).join(' · ') : undefined,
    sets: наборы.length ? наборы : undefined,
    rareEffect: всеРедкие[0],
    rareEffects: всеРедкие.length ? всеРедкие : undefined,
  }
}

function прочитатьПодписиИзTypes() {
  const исходник = readFileSync(join(КОРЕНЬ, 'src', 'types.ts'), 'utf8')
  const прочитатьМассив = (имя) => {
    const m = исходник.match(new RegExp(`export const ${имя} = \\[([\\s\\S]*?)\\]`))
    проверить(m, `в src/types.ts нет массива ${имя}`)
    return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
  }
  return {
    оружие: new Set(прочитатьМассив('WEAPON_TYPE_LABELS')),
    предметыБрони: new Set(прочитатьМассив('ARMOR_ITEM_TYPE_OPTIONS')),
    грейды: new Set(прочитатьМассив('GRADE_OPTIONS')),
  }
}

function проверитьКаталог(предметы, комплекты) {
  const подписи = прочитатьПодписиИзTypes()

  const ids = new Set()
  for (const п of предметы) {
    проверить(Number.isInteger(п.id) && п.id > 0, `плохой id: ${п.id}`)
    проверить(!ids.has(п.id), `дубль id ${п.id}`)
    ids.add(п.id)
    проверить(п.name, `пустое имя у ${п.id}`)
    проверить(п.tex, `нет tex у "${п.name}"`)
    проверить(п.gradeName && подписи.грейды.has(п.gradeName), `неизвестный грейд у "${п.name}"`)
    проверить(п.icon?.startsWith('icons-mw/'), `иконка не в icons-mw у "${п.name}"`)
    проверить(п.url?.startsWith(`${ИСТОЧНИК}/`), `нет ссылки на источник у "${п.name}"`)
    проверить(п.imageUrl?.startsWith(`${ИСТОЧНИК}/`), `нет ссылки на картинку у "${п.name}"`)
    if (п.slot === 'r_hand') {
      проверить(подписи.оружие.has(п.weaponType), `неизвестный тип оружия "${п.weaponType}"`)
      проверить(п.atkPhys > 0 && п.atkMag > 0, `у "${п.name}" нет атаки`)
      проверить(!п.dual || п.twoHanded, `парное без двуручности: "${п.name}"`)
      if (п.saEffects) проверить(п.saEffects.length === 3, `у "${п.name}" не три SA`)
    }
    if (['head', 'chest', 'legs', 'gloves', 'feet', 'l_hand'].includes(п.slot)) {
      проверить(подписи.предметыБрони.has(п.armorItemType), `неизвестный предмет брони "${п.armorItemType}"`)
      if (п.armorType) проверить(['heavy', 'light', 'magic'].includes(п.armorType), `неизвестный тип брони "${п.armorType}"`)
      if (п.fullbody) проверить(п.slot === 'chest', `цельная броня не в верхе: "${п.name}"`)
    }
    if (['l_ring', 'l_ear', 'neck'].includes(п.slot)) {
      проверить(п.mDef > 0, `у бижутерии "${п.name}" нет маг. защиты`)
    }
  }

  for (const к of комплекты) {
    проверить(к.id && к.name && к.pieces.length >= 2, `плохой комплект ${к.id}`)
    for (const id of к.pieces) проверить(ids.has(id), `в комплекте ${к.id} нет предмета ${id}`)
  }

  const оружие = предметы.filter((п) => п.slot === 'r_hand')
  const бижутерия = предметы.filter((п) => ['l_ring', 'l_ear', 'neck'].includes(п.slot))
  const броня = предметы.filter((п) => ['head', 'chest', 'legs', 'gloves', 'feet', 'l_hand'].includes(п.slot))
  проверить(оружие.length === 414, `оружия ${оружие.length}, ждём 414`)
  проверить(бижутерия.length === 63, `бижутерии ${бижутерия.length}, ждём 63`)
  проверить(броня.length === 292, `брони ${броня.length}, ждём 292`)
  проверить(предметы.length === 769, `всего предметов ${предметы.length}, ждём 769`)
  проверить(комплекты.length === 65, `комплектов ${комплекты.length}, ждём 65`)
  проверить(оружие.filter((п) => п.saEffects?.length === 3).length === 172, 'не сходится число оружия с SA')
  проверить(оружие.filter((п) => п.saCommon).length === 33, 'не сходится число общих SA')
  проверить(оружие.filter((п) => п.rareEffects?.length).length === 129, 'не сходится число редких эффектов')
  проверить(оружие.filter((п) => п.rareEffects?.length === 2).length === 17, 'не сходится число двойных rare')
  проверить(оружие.filter((п) => п.enchantBonuses?.length).length === 138, 'не сходится число бонусов заточки')
  проверить(броня.filter((п) => п.fullbody).length === 20, 'не сходится число цельной брони')
  проверить(броня.filter((п) => п.armorItemType === 'shield').length === 26, 'не сходится число щитов')
  проверить(броня.filter((п) => п.armorItemType === 'accessory').length === 6, 'не сходится число аксессуаров')
  проверить(броня.filter((п) => п.set).length === 220, 'не сходится число предметов в комплектах')
  проверить(бижутерия.filter((п) => п.epic).length === 4, 'не сходится число эпической бижутерии')
  проверить(бижутерия.filter((п) => п.rareEffects?.length).length === 12, 'не сходится число редкой бижутерии')
  проверить(new Set(предметы.map((п) => п.icon)).size === 587, 'не сходится число иконок')

  return { оружие, бижутерия, броня }
}

function проверитьИконку(путь) {
  проверить(existsSync(путь), `нет иконки ${путь}`)
  const размер = statSync(путь).size
  проверить(размер > 100, `пустая иконка ${путь}`)
  const буфер = readFileSync(путь)
  проверить(
    буфер.subarray(0, 8).toString('hex') === '89504e470d0a1a0a',
    `файл не PNG: ${путь}`,
  )
}

async function скачатьИконку(имя, папка) {
  const url = `${ИСТОЧНИК}/i64/${encodeURIComponent(имя)}`
  let последняяОшибка
  for (let попытка = 1; попытка <= 4; попытка++) {
    try {
      const ответ = await fetch(url, {
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; lu4-party-pilot catalog builder)',
          referer: `${ИСТОЧНИК}/lu4-gamma/posts/post/793-all-weapon-types`,
        },
      })
      if (!ответ.ok) throw new Error(`HTTP ${ответ.status}`)
      const buffer = Buffer.from(await ответ.arrayBuffer())
      if (buffer.length <= 100) throw new Error(`маленький файл ${buffer.length} Б`)
      if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
        throw new Error('ответ не PNG')
      }
      writeFileSync(join(папка, имя), buffer)
      return
    } catch (ошибка) {
      последняяОшибка = ошибка
      if (попытка < 4) await sleep(600 * попытка)
    }
  }
  throw new Error(`не скачалась иконка ${имя}: ${последняяОшибка?.message ?? последняяОшибка}`)
}

async function скачатьВсе(имена, папка) {
  let готово = 0
  for (const имя of [...имена].sort()) {
    await скачатьИконку(имя, папка)
    готово++
    if (готово % 50 === 0 || готово === имена.size) {
      console.log(`  иконки: ${готово}/${имена.size}`)
    }
    await sleep(ПАУЗА_МС)
  }
}

function удалитьЛишниеИконки(имена) {
  for (const файл of readdirSync(ПАПКА_ИКОНОК)) {
    const путь = join(ПАПКА_ИКОНОК, файл)
    if (!statSync(путь).isFile()) continue
    if (!имена.has(файл)) rmSync(путь)
  }
}

async function подготовитьИконки(имена) {
  if (безИконок) {
    for (const имя of имена) проверитьИконку(join(ПАПКА_ИКОНОК, имя))
    console.log(`Иконки не трогаем: ${имена.size} файлов уже на месте`)
    return
  }

  if (!обновитьИконки) {
    mkdirSync(ПАПКА_ИКОНОК, { recursive: true })
    const отсутствуют = [...имена].filter((имя) => !existsSync(join(ПАПКА_ИКОНОК, имя)))
    console.log(`Иконки: нужно ${имена.size}, не хватает ${отсутствуют.length}`)
    if (отсутствуют.length) {
      await скачатьВсе(new Set(отсутствуют), ПАПКА_ИКОНОК)
    }
    for (const имя of имена) проверитьИконку(join(ПАПКА_ИКОНОК, имя))
    удалитьЛишниеИконки(имена)
    return
  }

  const временная = join(ПУБЛИЧНАЯ, `icons-mw.tmp-${process.pid}`)
  const старая = join(ПУБЛИЧНАЯ, `icons-mw.old-${process.pid}`)
  rmSync(временная, { recursive: true, force: true })
  mkdirSync(временная, { recursive: true })
  console.log(`Скачиваю все иконки заново: ${имена.size}`)
  try {
    await скачатьВсе(имена, временная)
    for (const имя of имена) проверитьИконку(join(временная, имя))
    if (existsSync(ПАПКА_ИКОНОК)) renameSync(ПАПКА_ИКОНОК, старая)
    renameSync(временная, ПАПКА_ИКОНОК)
    rmSync(старая, { recursive: true, force: true })
  } catch (ошибка) {
    rmSync(временная, { recursive: true, force: true })
    if (existsSync(старая)) {
      if (existsSync(ПАПКА_ИКОНОК)) rmSync(ПАПКА_ИКОНОК, { recursive: true, force: true })
      renameSync(старая, ПАПКА_ИКОНОК)
    }
    throw ошибка
  }
}

async function main() {
  const оружие = прочитать('weapons.json')
  const бижутерия = прочитать('jewelry.json')
  const броня = прочитать('armor.json')

  const предметы = [
    ...оружие.items.map(предметОружия),
    ...броня.items.map(предметБрони),
    ...бижутерия.items.map(предметБижутерии),
  ].sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name, 'ru'))

  const комплекты = броня.sets.map((с) => ({
    id: с.id,
    name: чисто(с.name),
    type: с.type || undefined,
    grade: с.grade || undefined,
    tier: с.tier || undefined,
    pieces: с.pieces.map((п) => п.id),
    bonuses: (с.bonuses ?? []).map(чисто).filter(Boolean),
    totals: (с.totals ?? []).map(чисто).filter(Boolean),
  }))

  const { оружие: оружиеВКаталоге, бижутерия: бижутерияВКаталоге, броня: броняВКаталоге } =
    проверитьКаталог(предметы, комплекты)

  const именаИконок = new Set(предметы.map((п) => п.icon.replace('icons-mw/', '')))
  await подготовитьИконки(именаИконок)

  const каталог = {
    generatedAt: new Date().toISOString(),
    source: 'masterwork.wiki · Lu4: Gamma · оружие, бижутерия, доспехи и комплекты',
    posts: [
      {
        kind: 'weapons',
        url: оружие.sourceUrl,
        title: оружие.sourceTitle,
        scrapedAt: оружие.scrapedAt,
        count: оружие.items.length,
      },
      {
        kind: 'jewelry',
        url: бижутерия.sourceUrl,
        title: бижутерия.sourceTitle,
        scrapedAt: бижутерия.scrapedAt,
        count: бижутерия.items.length,
      },
      {
        kind: 'armor',
        url: броня.sourceUrl,
        title: броня.sourceTitle,
        scrapedAt: броня.scrapedAt,
        count: броня.items.length,
      },
    ],
    items: предметы,
    sets: комплекты,
  }

  writeFileSync(ФАЙЛ_КАТАЛОГА, JSON.stringify(каталог, null, 2) + '\n', 'utf8')
  console.log('')
  console.log(`Собрано: ${предметы.length} предметов, ${комплекты.length} комплектов`)
  console.log(
    `  оружие ${оружиеВКаталоге.length} · бижутерия ${бижутерияВКаталоге.length} · броня ${броняВКаталоге.length}`,
  )
  console.log(`  иконки: ${именаИконок.size}`)
  console.log(`  файл: ${ФАЙЛ_КАТАЛОГА}`)
}

main().catch((ошибка) => {
  console.error('')
  console.error('Сборка остановлена:', ошибка instanceof Error ? ошибка.message : ошибка)
  process.exit(1)
})
