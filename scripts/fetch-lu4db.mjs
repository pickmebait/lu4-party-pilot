#!/usr/bin/env node
/**
 * Полный справочник предметов с lu4db.ru.
 *
 * Источники:
 *   /api/craft-market/data  — каталог рынка: названия, иконки, рецепты
 *   /api/craft-market/wiki  — подробные описания экипировки: атака,
 *                             защита, SA-эффекты, бонусы комплектов
 *
 * Зачем два: в каталоге у большинства предметов нет ни слота, ни типа,
 * из-за чего половина вещей не попадала ни в один слот экипировки.
 * Вики эти данные восстанавливает.
 *
 * Слот восстанавливается по цепочке:
 *   1. поле slot источника
 *   2. префикс equipmentId: w_ оружие, l_ щит, h_ шлем, c_ верх,
 *      lg_ низ, gl_ перчатки, ft_ ботинки, nk_ ожерелье, ear_ серьга,
 *      rng_ кольцо
 *   3. секция (weapon / armor / jewelry) плюс вид из вики
 *   4. разбор названия
 * Предметы, которые не экипировка (рецепты, ресурсы, детали), слота не
 * получают — им он не нужен и в фильтр слота они не попадут.
 *
 * Запуск:
 *   node scripts/fetch-lu4db.mjs
 *   node scripts/fetch-lu4db.mjs --no-icons
 */
import { mkdirSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const API = 'https://lu4db.ru/api'
const CDN = 'https://lu4db.ru'
const ICONS_DIR = 'public/icons'
const OUT = 'public/items.json'

const WANT_ICONS = !process.argv.includes('--no-icons')
const CONCURRENCY = 8
const BATCH_PAUSE_MS = 120

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

/** Грейды источника в числа: на них завязана вёрстка карточек. */
const GRADE_NUM = { S: 16, A: 14, B: 12, C: 9, D: 7, NG: 0 }

/** Префикс equipmentId -> слот. Проверено по всем 205 предметам, где есть и слот. */
const EQUIP_SLOT = {
  w: 'r_hand',
  l: 'l_hand',
  h: 'head',
  c: 'chest',
  lg: 'legs',
  gl: 'gloves',
  ft: 'feet',
  nk: 'neck',
  ear: 'l_ear',
  rng: 'l_ring',
}

/** Слоты брони — для них считаем тип: тяжёлая, лёгкая или магическая. */
const ARMOR_SLOTS = new Set(['head', 'chest', 'legs', 'gloves', 'feet'])

function die(msg) {
  console.error(`Ошибка: ${msg}`)
  process.exit(1)
}

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) die(`источник ответил ${res.status} (${url})`)
  return res.json()
}

async function getBinary(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** «Bastard Sword*Sword of Revolution» -> «Bastard Sword / Sword of Revolution». */
function readableName(name) {
  return name.replace(/\*/g, ' / ')
}

/** Определяет слот по названию, когда других признаков нет. */
function slotFromName(name) {
  const n = ' ' + name.toLowerCase() + ' '
  if (/\b(shoes?|boots?|sandals?|slippers?)\b/.test(n)) return 'feet'
  if (/\b(gloves?|gauntlets?|mittens?)\b/.test(n)) return 'gloves'
  if (/\b(helmet|circlet|cap|hood|visor|hat|coif)\b/.test(n)) return 'head'
  if (/\b(gaiters?|leggings?|stockings?|pants|tights?|trousers)\b/.test(n)) return 'legs'
  if (/\b(shield|aspis|buckler|targe|shield)\b/.test(n)) return 'l_hand'
  if (/\bearrings?\b/.test(n)) return 'l_ear'
  if (/\bring\b/.test(n)) return 'l_ring'
  if (/\b(necklace|necklet|amulet)\b/.test(n)) return 'neck'
  if (/\b(breastplate|breastplate|armor|armour|robe|tunic|mail|jerkin|vest|coat)\b/.test(n)) {
    return 'chest'
  }
  return null
}

/**
 * Экипировкой считается только то, что надевают: готовые предметы и то,
 * что есть в вики (оружие и броня). Рецепты, детали и ресурсы слота не
 * получают — иначе «Recipe: Avadon Boots» попал бы в слот ботинок.
 */
function isEquipment(it, wikiEntry) {
  return it.kind === 'finished' || wikiEntry?.kind === 'weapon' || wikiEntry?.kind === 'armor'
}

function deriveSlot(it, wikiEntry) {
  if (!isEquipment(it, wikiEntry)) return null
  if (it.slot) return it.slot

  if (it.equipmentId) {
    const prefix = it.equipmentId.split('_')[0]
    if (EQUIP_SLOT[prefix]) return EQUIP_SLOT[prefix]
  }

  const section = (it.section || '').split('-')[0]
  const kind = wikiEntry?.kind

  if (section === 'weapon' || kind === 'weapon') return 'r_hand'
  if (section === 'jewelry' || kind === 'jewelry') {
    return slotFromName(it.name) ?? 'neck'
  }
  if (section === 'armor' || kind === 'armor') {
    return slotFromName(it.name) ?? slotFromName(wikiEntry?.pieceName ?? '') ?? 'chest'
  }

  return slotFromName(it.name)
}

/**
 * Типы оружия для фильтра в пикере.
 * Классы источника мельче, чем это разбиение, но каждое покрывается.
 */
const WEAPON_CLASS_TO_TYPE = {
  'Одноручные Мечи': 'Мечи',
  'Двуручные Мечи': 'Мечи',
  'Одноручные Магические Мечи': 'Мечи',
  'Дуал-мечи': 'Мечи',
  'Одноручные Бланты': 'Дробящие',
  'Двуручные Бланты': 'Дробящие',
  'Дуал-бланты': 'Дробящие',
  'Одноручное Магическое Дробящее': 'Дробящие',
  Кинжалы: 'Кинжалы',
  'Дуал-кинжалы': 'Кинжалы',
  'Магические Кинжалы': 'Кинжалы',
  Луки: 'Луки и арбалеты',
  Арбалеты: 'Луки и арбалеты',
  Копья: 'Копья',
  'Одноручное Магическое': 'Посохи',
  'Двуручное Магическое': 'Посохи',
  Кастеты: 'Кастеты',
}

/** Запасной путь для нескольких предметов без класса оружия. */
function weaponTypeFallback(it) {
  const t = it.equipmentType || ''
  const n = it.name || ''
  if (/^Sword/.test(t) || /Меч/i.test(n)) return 'Мечи'
  if (/^Blunt/.test(t) || /Дробящ/i.test(n)) return 'Дробящие'
  if (/Dagger/.test(t) || /Кинжал/i.test(n)) return 'Кинжалы'
  if (/Bow/.test(t) || /Лук/i.test(n)) return 'Луки и арбалеты'
  if (/Spear/.test(t) || /Копь/i.test(n)) return 'Копья'
  if (/Staff/.test(t) || /Посох/i.test(n)) return 'Посохи'
  if (/Fist|Cestus/i.test(t) || /Кастет/i.test(n)) return 'Кастеты'
  if (/axe|mace|club|hammer|flail|tobacco/i.test(n)) return 'Дробящие'
  if (/spear|halberd|glaive|pike/i.test(n)) return 'Копья'
  if (/bow|crossbow/i.test(n)) return 'Луки и арбалеты'
  if (/knife|dagger|kriss|khram/i.test(n)) return 'Кинжалы'
  if (/sword|blade|falchion/i.test(n)) return 'Мечи'
  return null
}

function deriveWeaponType(it, w) {
  const byClass = WEAPON_CLASS_TO_TYPE[w?.weaponClass]
  return byClass || weaponTypeFallback(it)
}

function mapVariant(v) {
  if (v === 'heavy') return 'heavy'
  if (v === 'light') return 'light'
  if (v === 'robe') return 'magic'
  return null
}

/**
 * Тип брони: тяжёлая, лёгкая, магическая.
 *
 * Отдельного поля в источнике нет, поэтому собираем по нескольким
 * признакам, от надёжного к спорному:
 *   1. суффикс в техническом имени: avadon_boots_heavy, _light, _robe
 *   2. слово в названии вещи: «Heavy Armor», «Light», «Robe»
 *   3. комплект: «Avadon Heavy Set», «Tallum Light Set»
 *   4. единственный вариант вещи, если он назван прямо
 *   5. материал в техническом имени: leather, plate, chain, robe
 * Если определить не вышло, тип остаётся пустым, и такая вещь видна при
 * любом выборе типа, а не прячется.
 */
function deriveArmorType(it, w, variants) {
  const tex = (it.id || '').toLowerCase()
  const name = (it.name || '').toLowerCase()
  const both = `${tex} ${name}`

  if (/_(heavy|hvy)($|_)|heavy armor/.test(both)) return 'heavy'
  if (/_(light|lth)($|_)|light armor/.test(both)) return 'light'
  if (/_robe($|_)|robe$/.test(both)) return 'magic'

  const sets = [it.setName, w?.setName].filter(Boolean).join(' ')
  if (/heavy/i.test(sets)) return 'heavy'
  if (/light/i.test(sets)) return 'light'
  if (/magic|robe/i.test(sets)) return 'magic'

  const own = variants.find((v) => v.name === it.name)
  if (own?.variant) return mapVariant(own.variant)
  if (variants.length === 1) return mapVariant(variants[0].variant)

  if (/leather|leggings|buckskin/.test(tex)) return 'light'
  if (/plate|chain|composite|scale/.test(tex)) return 'heavy'
  if (/robe|cloth|cotton|tunic|shirt|pants/.test(tex)) return 'magic'

  // Материал в техническом имени. В игре эти признаки однозначны:
  // кость, бронза, кольчуга и чешуя — тяжёлая броня, кожа и лён —
  // лёгкая, халат и маг��ческие ткани — магическая.
  if (/(plate|chain|scale|ring|bone|bronze|brigandine|kite|viking|heavy)/.test(tex)) {
    return 'heavy'
  }
  if (/(leather|linen|cloth|cotton|buckskin|leggings|elven|silver_crab|britannia|apprentice)/.test(tex)) {
    return 'light'
  }
  if (/(robe|mage|mystical|nightshade|sorcerer|shaman|pajama)/.test(tex)) return 'magic'

  return null
}

function localIcon(path) {
  return `icons/${path.split('/').pop()}`
}

function iconFile(path) {
  return join(ICONS_DIR, path.split('/').pop())
}

async function main() {
  console.log('Забираю каталог и вики с lu4db.ru…')
  const data = await getJson(`${API}/craft-market/data`)
  const { itemWiki } = await getJson(`${API}/craft-market/wiki`)

  const source = Object.values(data.itemCatalog?.items ?? {})
  if (source.length === 0) die('в ответе нет предметов — структура источника изменилась?')
  console.log(`  предметов в каталоге: ${source.length}`)
  console.log(`  записей в вики:        ${Object.keys(itemWiki ?? {}).length}`)

  // Рецепты крафта по id предмета.
  const recipesByCatalog = new Map()
  for (const r of data.itemRecipes ?? []) {
    if (!r.catalogId) continue
    recipesByCatalog.set(r.catalogId, r)
  }

  // Уровень и прочие торговые данные по id предмета.
  const marketByCatalog = new Map()
  for (const m of data.marketMaterials ?? []) {
    if (m.catalogId) marketByCatalog.set(m.catalogId, m)
  }

  // Вики по названию. У предметов с двумя формами название в вики может быть
  // как со звёздочкой, так и без, поэтому ищем обоими вариантами.
  const wikiByName = new Map()
  for (const [key, value] of Object.entries(itemWiki ?? {})) {
    wikiByName.set(key, value)
    wikiByName.set(key.replace(/\*/g, ' / '), value)
  }

  // Порядок id фиксируем сортировкой по техническому имени, чтобы номера
  // пересобирались одинаково при каждом запуске.
  source.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const iconFiles = new Set()
  const stats = { соСлотом: 0, безСлота: 0, изВики: 0, экипировка: 0, рецепты: 0, ресурсы: 0, сТипомОружия: 0, сТипомБрони: 0 }
  const noSlotNames = []

  const items = source.map((it, index) => {
    const id = index + 1 // ноль у нас означает «пусто»
    const wikiEntry = wikiByName.get(it.name) ?? wikiByName.get(it.name.replace(/\*/g, ' / ')) ?? null
    if (wikiEntry) stats.изВики++
    const slot = deriveSlot(it, wikiEntry)
    if (slot) stats.соСлотом++
    else {
      stats.безСлота++
      if (it.kind === 'finished') noSlotNames.push(it.name)
    }
    if (it.kind === 'recipe') stats.рецепты++
    if (it.kind === 'resource') stats.ресурсы++
    if (it.kind === 'finished' && slot) stats.экипировка++

    if (it.icon) iconFiles.add(it.icon)

    // Варианты брони: тяжёлая, лёгкая, мантия — у каждого свой значок
    // и свой набор бонусов комплекта.
    const variants = []
    const aliases = []
    if (Array.isArray(it.aliases)) {
      aliases.push(...it.aliases)
    } else if (it.aliases && typeof it.aliases === 'object') {
      for (const [aliasName, v] of Object.entries(it.aliases)) {
        aliases.push(aliasName)
        if (v?.icon) iconFiles.add(v.icon)
        variants.push({
          name: aliasName,
          ...(v?.icon ? { icon: localIcon(v.icon) } : {}),
          ...(v?.variant ? { variant: v.variant } : {}),
          ...(v?.setName ? { set: v.setName } : {}),
          ...(Array.isArray(v?.setBonuses) && v.setBonuses.length
            ? { setBonuses: v.setBonuses }
            : {}),
        })
      }
    }

    const w = { ...(it.wiki ?? {}), ...(wikiEntry ?? {}) }
    const recipe = recipesByCatalog.get(it.id)
    const market = marketByCatalog.get(it.id)

    const weaponType = slot === 'r_hand' ? deriveWeaponType(it, w) : null
    const armorType = ARMOR_SLOTS.has(slot) ? deriveArmorType(it, w, variants) : null
    if (weaponType) stats.сТипомОружия++
    if (armorType) stats.сТипомБрони++

    const out = {
      id,
      name: readableName(it.name),
      tex: it.id,
      ...(it.name.includes('*') ? { fullName: it.name } : {}),

      // что предмет из себя представляет
      ...(it.kind ? { kind: it.kind } : {}),
      ...(it.section ? { section: it.section } : {}),
      ...(slot ? { slot } : {}),
      ...(it.equipmentType ? { type: it.equipmentType } : {}),
      ...(it.equipmentId ? { equipmentId: it.equipmentId } : {}),
      ...(it.grade ? { grade: GRADE_NUM[it.grade] ?? 0 } : {}),
      ...(it.grade ? { gradeName: it.grade } : {}),

      // значок
      ...(it.icon ? { icon: localIcon(it.icon) } : {}),

      // комплекты
      ...(it.setName || w.setName ? { set: it.setName ?? w.setName } : {}),
      ...(it.setBonus || w.setBonus ? { bonus: it.setBonus ?? w.setBonus } : {}),
      ...(Array.isArray(w.setBonuses) && w.setBonuses.length ? { setBonuses: w.setBonuses } : {}),
      ...(Array.isArray(w.rareBonuses) && w.rareBonuses.length ? { rareBonuses: w.rareBonuses } : {}),
      ...(Array.isArray(w.masterworkTotalBonuses) && w.masterworkTotalBonuses.length
        ? { masterworkBonuses: w.masterworkTotalBonuses }
        : {}),
      // sets[] повторяет плоские setBonuses/rareBonuses/masterworkBonuses,
      // поэтому берём его только когда комплектов больше одного.
      ...(Array.isArray(w.sets) && w.sets.length > 1 ? { sets: w.sets } : {}),

      // оружие и броня
      ...(w.weaponClass ? { weaponClass: w.weaponClass } : {}),
      ...(weaponType ? { weaponType } : {}),
      ...(armorType ? { armorType } : {}),
      // Занимает обе руки. Луки двуручные, хотя слово «двуручное» в их
      // классе не написано, поэтому проверяем отдельно.
      ...(w.weaponClass && (/^Двуручн/.test(w.weaponClass) || w.weaponClass === 'Луки')
        ? { twoHanded: true }
        : {}),
      ...(w.weaponClass && w.weaponClass.startsWith('Дуал') ? { dual: true } : {}),
      // Цельная броня надевается вместо верха и низа сразу.
      ...(it.fullbody === true ? { fullbody: true } : {}),
      ...(typeof w.physAtk === 'number' ? { atkPhys: w.physAtk } : {}),
      ...(typeof w.magAtk === 'number' ? { atkMag: w.magAtk } : {}),
      ...(typeof w.physDef === 'number' ? { physDef: w.physDef } : {}),
      ...(typeof it.mDef === 'number' ? { mDef: it.mDef } : {}),
      ...(typeof w.mpIncrease === 'number' ? { mpIncrease: w.mpIncrease } : {}),
      ...(w.pieceName ? { pieceName: w.pieceName } : {}),
      ...(Array.isArray(w.saEffects) && w.saEffects.length ? { saEffects: w.saEffects } : {}),
      ...(w.rareEffect ? { rareEffect: w.rareEffect } : {}),

      // крафт
      ...(recipe
        ? {
            recipe: {
              ...(recipe.craftChance ? { chance: recipe.craftChance } : {}),
              ...(recipe.outputQty ? { outputQty: recipe.outputQty } : {}),
              ...(Array.isArray(recipe.ingredients) && recipe.ingredients.length
                ? { ingredients: recipe.ingredients }
                : {}),
            },
          }
        : {}),
      // altRecipes в источнике дублирует recipe из общего списка, поэтому
      // второй раз не пишем.
      ...(it.materialRecipe ? { materialRecipe: it.materialRecipe } : {}),

      // торговые данные
      ...(market && typeof market.level === 'number' ? { marketLevel: market.level } : {}),
      ...(it.derivedPrice === true ? { derivedPrice: true } : {}),

      ...(variants.length ? { variants } : {}),
      ...(aliases.length ? { aliases } : {}),
    }

    return out
  })

  console.log('\nПокрытие:')
  console.log(`  со слотом: ${stats.соСлотом} из ${items.length}`)
  console.log(`  из них экипировка: ${stats.экипировка}`)
  console.log(`  рецептов: ${stats.рецепты}, ресурсов: ${stats.ресурсы}`)
  console.log(`  нашлось в вики: ${stats.изВики}`)
  console.log(`  тип оружия определён: ${stats.сТипомОружия}`)
  console.log(`  тип брони определён: ${stats.сТипомБрони}`)
  if (noSlotNames.length) {
    console.log(`  готовых без слота: ${noSlotNames.length} → ${noSlotNames.slice(0, 6).join(', ')}`)
  }
  console.log(`  уникальных иконок: ${iconFiles.size}`)

  if (WANT_ICONS) await downloadIcons(iconFiles)

  const catalog = {
    generatedAt: new Date().toISOString(),
    source: `lu4db.ru (каталог ${data.itemCatalog?.generatedAt ?? '?'})`,
    itemCount: items.length,
    items,
  }
  writeFileSync(OUT, `${JSON.stringify(catalog)}\n`, 'utf8')
  console.log(
    `\nГотово: ${OUT} (${items.length} предметов, ${Math.round(statSync(OUT).size / 1024)} КБ)`,
  )
}

async function downloadIcons(paths) {
  if (!existsSync(ICONS_DIR)) mkdirSync(ICONS_DIR, { recursive: true })
  const already = new Set(readdirSync(ICONS_DIR).map((f) => `/media/site/img/${f}`))
  const todo = [...paths].filter((p) => !already.has(p))
  console.log(`\nСкачиваю иконки: ${todo.length} (уже есть ${already.size})`)

  let done = 0
  let failed = 0
  let bytes = 0

  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const batch = todo.slice(i, i + CONCURRENCY)
    await Promise.all(
      batch.map(async (p) => {
        try {
          const buf = await getBinary(CDN + p)
          writeFileSync(iconFile(p), buf)
          bytes += buf.length
        } catch (e) {
          failed++
          if (failed <= 5) console.warn(`  не скачалась ${p}: ${e.message}`)
        } finally {
          done++
        }
      }),
    )
    if (done % 200 < CONCURRENCY) process.stdout.write(`  ${done} из ${todo.length}\r`)
    if (i + CONCURRENCY < todo.length) await sleep(BATCH_PAUSE_MS)
  }

  process.stdout.write('\n')
  console.log(
    `  скачано ${done - failed} шт., ${Math.round(bytes / 1024)} КБ` +
      (failed ? `, не удалось ${failed}` : ''),
  )
}

await main()