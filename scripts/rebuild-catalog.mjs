/**
 * Пересборка справочника предметов из постов вики.
 *
 * Читает .git/wiki-data/{weapons,jewelry,armor}_raw.json (их собирает браузер
 * через CDP), разбирает и кладёт public/items.json и public/icons-mw/.
 *
 * Запуск: node scripts/rebuild-catalog.mjs
 *
 * Про комплекты. На странице доспехов у каждого комплекта две строки: одна —
 * сам комплект с бонусами, вторая — его детали. Обе ссылаются на одни и те же
 * id предметов, поэтому комплект нельзя класть в справочник как вещь: он
 * надеть нельзя, а id у него уже занят деталью. Поэтому строку комплекта
 * пропускаем, а его имя, тип и бонусы отдаём деталям — так у детали появляется
 * принадлежность к комплекту, а id остаются разными.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const ГРЕЙДЫ = new Set(['NG', 'D', 'C', 'B', 'A'])

const ТИП_ОРУЖИЯ = {
  'Мечи ранга': 'Мечи',
  'Топоры ранга': 'Топоры',
  'Кинжалы ранга': 'Кинжалы',
  'Луки ранга': 'Луки',
  'Двуручные мечи ранга': 'Двуручные мечи',
  'Двуручные топоры ранга': 'Двуручные топоры',
  'Двуручные посохи ранга': 'Двуручные посохи',
  'Парные мечи ранга': 'Парные мечи',
  'Парные топоры ранга': 'Парные топоры',
  'Парные кинжалы ранга': 'Парные кинжалы',
  'Кастеты ранга': 'Кастеты',
  'Копья ранга': 'Копья',
  'Маг. мечи ранга': 'Магические мечи',
  'Маг. посохи ранга': 'Магические посохи',
  'Маг. кинжалы ранга': 'Магические кинжалы',
  'Посохи ранга': 'Посохи',
}

const СЛОТ_ДОСПЕХА = {
  'Верхний': 'chest',
  'Нижний': 'legs',
  'Полный': 'chest',
  'Шлем': 'head',
  'Перчатки': 'gloves',
  'Ботинки': 'feet',
  'Щит': 'l_hand',
}

const СЛОТ_БИЖУТЕРИИ = {
  'Кольца': 'l_ring',
  'Серьги': 'l_ear',
  'Ожерелья': 'neck',
  'Эпическая': null,
}

const ТИП_БРОНИ = { 'Магический': 'magic', 'Легкий': 'light', 'Тяжелый': 'heavy' }

/** Тип комплекта из строки «Легкий комплект» в обзоре. */
const ТИП_КОМПЛЕКТА = {
  'Магический комплект': 'magic',
  'Легкий комплект': 'light',
  'Тяжелый комплект': 'heavy',
}

function parseName(строка) {
  const parts = строка.trim().split(/\s+/)
  const тир = parts.find((p) => /^T\d+$/.test(p)) || null
  const грейд = parts.find((p) => ГРЕЙДЫ.has(p)) || null
  const name = parts.filter((p) => p !== тир && p !== грейд).join(' ')
  return { name, тир, грейд }
}

/** Ссылка на карточку предмета. В ячейке может быть ещё и ссылка на улучшение,
 *  поэтому берём ту, что ведёт в /item/. */
function ссылкаПредмета(cell) {
  return cell?.links?.find((l) => l.href?.includes('/item/'))?.href || null
}

/** Первый id предмета в ячейке — он у вещи один. */
function itemId(cell) {
  const href = ссылкаПредмета(cell)
  if (!href) return null
  const m = href.match(/\/item\/(\d+)-/)
  return m ? Number(m[1]) : null
}

/** Все id, на которые ссылается ячейка. У обзора комплекта их несколько. */
function ссылкиЯчейки(cell) {
  return (cell?.links || [])
    .map((l) => {
      const m = l.href?.match(/\/item\/(\d+)-/)
      return m ? Number(m[1]) : null
    })
    .filter((n) => typeof n === 'number')
}

/** Техническое имя из адреса карточки: «…/item/44-leather-helmet» → «leather-helmet». */
function texИзИсточника(source) {
  const m = (source || '').match(/\/item\/\d+-(.+)$/)
  return m ? m[1] : undefined
}

/** Число или undefined: пустые и битые ячейки в справочнике не нужны. */
function числоИлиНет(значение) {
  const n = Number(значение)
  return Number.isFinite(n) && n !== 0 ? n : undefined
}

/** Пустые поля (null, undefined, «») не пишем: приложение разбирает их как отсутствие. */
function чистый(п) {
  for (const k of Object.keys(п)) {
    const v = п[k]
    if (v === undefined || v === null || v === '') delete п[k]
  }
  return п
}

function parseWeapon(rows) {
  const out = []
  let type = null
  let last = null
  for (const row of rows) {
    if (!row.length || (row.length === 1 && row[0].text === '')) { last = null; continue }
    const first = row[0]?.text || ''
    const secKey = Object.keys(ТИП_ОРУЖИЯ).find((k) => first.includes(k))
    if (secKey && !row[1]?.links?.length) { type = ТИП_ОРУЖИЯ[secKey]; last = null; continue }
    const id = itemId(row[0])
    if (!id) continue
    const { name, грейд } = parseName(first)
    if (!name || !грейд) continue
    const atk = (row[1]?.text || '').split('/').map((s) => Number(s.trim()))
    const source = ссылкаПредмета(row[0])
    const item = {
      id, name, fullName: first, gradeName: грейд, slot: 'r_hand',
      weaponType: type, atkPhys: atk[0] ?? null, atkMag: atk[1] ?? null,
      twoHanded: ['Двуручные мечи', 'Двуручные топоры', 'Двуручные посохи', 'Луки'].includes(type),
      dual: ['Парные мечи', 'Парные топоры', 'Парные кинжалы'].includes(type),
      icon: row[0].imgs?.[0]?.src || null,
      source: source || null,
    }
    item.tex = texИзИсточника(item.source)
    if (item.dual) item.twoHanded = true
    out.push(чистый(item)); last = item
  }
  // SA и rare
  last = null
  for (const row of rows) {
    if (!row.length || (row.length === 1 && row[0].text === '')) continue
    const id = itemId(row[0])
    if (id) { last = out.find((p) => p.id === id); continue }
    if (!last) continue
    const c1 = row[1]?.text || ''
    const c2 = row[2]?.text || ''
    if (c1 && c2 && c1.length > 2 && !c1.includes('•')) {
      const names = c1.split(/\n+/).map((s) => s.trim()).filter(Boolean)
      const descs = c2.split(/\n+/).map((s) => s.trim()).filter(Boolean)
      if (names.length > 1 && descs.length > 1 && names.length <= 4) {
        last.saEffects = names.map((n, i) => ({ name: n, description: descs[i] || descs[descs.length - 1] || '' }))
        continue
      }
    }
    if (c1 && c2 && c1.length > 2 && !c1.includes('•') && !last.saEffects) {
      const names = c1.split(/\n+/).map((s) => s.trim()).filter(Boolean)
      if (names.length <= 1) last.rareEffect = { name: c1.trim(), description: c2.trim() }
    }
  }
  return out
}

function parseArmor(rows) {
  const out = []
  const комплекты = []
  let slot = null
  for (const row of rows) {
    if (!row.length || (row.length === 1 && row[0].text === '')) continue
    const first = row[0]?.text || ''
    const secKey = Object.keys(СЛОТ_ДОСПЕХА).find((k) => first.includes(k))
    if (secKey && !row[1]?.links?.length) { slot = СЛОТ_ДОСПЕХА[secKey]; continue }

    const ссылки = ссылкиЯчейки(row[0])
    // Обзор комплекта: в имени «комплект», а ссылки ведут на несколько деталей.
    if (/комплект/i.test(first) && ссылки.length >= 2) {
      const строки = first.split('\n').map((s) => s.trim()).filter(Boolean)
      const типКлюч = Object.keys(ТИП_КОМПЛЕКТА).find((k) => строки.some((s) => s.includes(k)))
      const { name } = parseName(строки[0] || '')
      комплекты.push({
        name,
        type: типКлюч ? ТИП_КОМПЛЕКТА[типКлюч] : undefined,
        pieces: ссылки,
        bonuses: (row[1]?.text || '').split('\n').map((s) => s.trim()).filter(Boolean),
      })
      continue
    }

    const id = itemId(row[0])
    if (!id) continue
    const { name, грейд } = parseName(first)
    if (!name || !грейд) continue
    const typeText = row[1]?.text || ''
    const typeKey = Object.keys(ТИП_БРОНИ).find((k) => typeText.includes(k))
    const source = ссылкаПредмета(row[0])
    out.push(чистый({
      id, name, fullName: first, gradeName: грейд, slot,
      armorType: typeKey ? ТИП_БРОНИ[typeKey] : undefined,
      physDef: числоИлиНет(row[2]?.text),
      mpIncrease: числоИлиНет(row[3]?.text),
      fullbody: first.includes('Полный'),
      icon: row[0].imgs?.[0]?.src || undefined,
      source: source || undefined,
      tex: texИзИсточника(source),
    }))
  }

  // Комплект к деталям: имя и бонусы. Тип берём и оттуда же — у шлемов,
  // перчаток и сапог на вики его нет, а у комплекта он написан.
  for (const к of комплекты) {
    for (const id of к.pieces) {
      const деталь = out.find((п) => п.id === id)
      if (!деталь) continue
      if (!деталь.set) {
        деталь.set = к.name
        if (к.bonuses.length) деталь.setBonuses = к.bonuses
      }
      if (!деталь.armorType && к.type) деталь.armorType = к.type
    }
  }
  return out
}

function parseJewelry(rows) {
  const out = []
  let slot = null
  for (const row of rows) {
    if (!row.length || (row.length === 1 && row[0].text === '')) continue
    const first = row[0]?.text || ''
    const secKey = Object.keys(СЛОТ_БИЖУТЕРИИ).find((k) => first.includes(k))
    if (secKey && !row[1]?.links?.length) { slot = СЛОТ_БИЖУТЕРИИ[secKey]; continue }
    const id = itemId(row[0])
    if (!id) continue
    const { name, грейд } = parseName(first)
    if (!name || !грейд) continue
    let finalSlot = slot
    if (!finalSlot) {
      const text = (name + ' ' + first).toLowerCase()
      if (/ring/.test(text)) finalSlot = 'l_ring'
      else if (/earring/.test(text)) finalSlot = 'l_ear'
      else if (/necklace|ожерелье|amulet|amulette/.test(text)) finalSlot = 'neck'
    }
    const source = ссылкаПредмета(row[0])
    out.push(чистый({
      id, name, fullName: first, gradeName: грейд, slot: finalSlot,
      mDef: числоИлиНет(row[1]?.text),
      mpIncrease: числоИлиНет(row[2]?.text),
      epic: first.includes('Epic') || first.includes('Эпическая'),
      icon: row[0].imgs?.[0]?.src || undefined,
      source: source || undefined,
      tex: texИзИсточника(source),
    }))
  }
  return out
}

// Собираем каталог из промежуточных данных
const weapons = parseWeapon(JSON.parse(readFileSync('.git/wiki-data/weapons_raw.json', 'utf8')))
const jewelry = parseJewelry(JSON.parse(readFileSync('.git/wiki-data/jewelry_raw.json', 'utf8')))
const armor = parseArmor(JSON.parse(readFileSync('.git/wiki-data/armor_raw.json', 'utf8')))

const items = [...weapons, ...jewelry, ...armor].sort((a, b) => a.id - b.id)

// Иконки: локальные пути (файлы скачаны в public/icons-mw/)
mkdirSync('public/icons-mw', { recursive: true })
// Адрес иконки в исходнике относительный («/i64/…»), а на вики он висит на
// своём домене — поэтому берём только имя файла и складываем в локальную папку.
for (const it of items) {
  if (it.icon && !it.icon.startsWith('icons-mw/')) {
    const filename = it.icon.split('/').pop()
    it.icon = `icons-mw/${filename}`
  }
}

writeFileSync('public/items.json', JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: 'masterwork.wiki · lu4-gamma · посты 793, 802, 803',
  notes: {
    format: 'луки занимают 2 слота; двуручное и парное оружие — 2 слота; цельная броня — верх+низ',
    icons: 'адреса на masterwork.wiki, локальные файлы в public/icons-mw',
    sets: 'комплект не кладётся отдельной вещью: его имя и бонусы достаются деталям',
  },
  items,
}, null, 2), 'utf8')

console.log(`Справочник собран: ${items.length} предметов`)
console.log(`  Оружие: ${weapons.length} | Бижутерия: ${jewelry.length} | Доспехи: ${armor.length}`)
console.log(`  Двуручных: ${items.filter((i) => i.twoHanded).length}`)
console.log(`  С SA: ${weapons.filter((w) => w.saEffects?.length).length}`)
console.log(`  С rare: ${weapons.filter((w) => w.rareEffect).length}`)
console.log(`  С комплектом: ${items.filter((i) => i.set).length}`)
