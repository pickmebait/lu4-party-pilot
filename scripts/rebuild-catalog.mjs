/**
 * Пересборка справочника предметов из постов вики.
 *
 * Читает .git/wiki-data/{weapons,jewelry,armor}_raw.json (их собирает браузер
 * через CDP), разбирает и кладёт public/items.json и public/icons-mw/.
 *
 * Запуск: node scripts/rebuild-catalog.mjs
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

function parseName(строка) {
  const parts = строка.trim().split(/\s+/)
  const тир = parts.find((p) => /^T\d+$/.test(p)) || null
  const грейд = parts.find((p) => ГРЕЙДЫ.has(p)) || null
  const name = parts.filter((p) => p !== тир && p !== грейд).join(' ')
  return { name, тир, грейд }
}

function itemId(cell) {
  const a = cell?.links?.find((l) => l.href?.includes('/item/'))
  if (!a) return null
  const m = a.href.match(/\/item\/(\d+)-/)
  return m ? Number(m[1]) : null
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
    const item = {
      id, name, fullName: first, gradeName: грейд, slot: 'r_hand',
      weaponType: type, atkPhys: atk[0] ?? null, atkMag: atk[1] ?? null,
      twoHanded: ['Двуручные мечи', 'Двуручные топоры', 'Двуручные посохи', 'Луки'].includes(type),
      dual: ['Парные мечи', 'Парные топоры', 'Парные кинжалы'].includes(type),
      icon: row[0].imgs?.[0]?.src || null,
      source: row[0].links?.[0]?.href || null,
    }
    if (item.dual) item.twoHanded = true
    out.push(item); last = item
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
  let slot = null
  for (const row of rows) {
    if (!row.length || (row.length === 1 && row[0].text === '')) continue
    const first = row[0]?.text || ''
    const secKey = Object.keys(СЛОТ_ДОСПЕХА).find((k) => first.includes(k))
    if (secKey && !row[1]?.links?.length) { slot = СЛОТ_ДОСПЕХА[secKey]; continue }
    const id = itemId(row[0])
    if (!id) continue
    const { name, грейд } = parseName(first)
    if (!name || !грейд) continue
    const typeText = row[1]?.text || ''
    const typeKey = Object.keys(ТИП_БРОНИ).find((k) => typeText.includes(k))
    out.push({
      id, name, fullName: first, gradeName: грейд, slot,
      armorType: typeKey ? ТИП_БРОНИ[typeKey] : null,
      physDef: Number(row[2]?.text) || null,
      mpIncrease: Number(row[3]?.text) || null,
      fullbody: first.includes('Полный'),
      icon: row[0].imgs?.[0]?.src || null,
      source: row[0].links?.[0]?.href || null,
    })
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
    out.push({
      id, name, fullName: first, gradeName: грейд, slot: finalSlot,
      mDef: Number(row[1]?.text) || null,
      mpIncrease: Number(row[2]?.text) || null,
      epic: first.includes('Epic') || first.includes('Эпическая'),
      icon: row[0].imgs?.[0]?.src || null,
      source: row[0].links?.[0]?.href || null,
    })
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
for (const it of items) {
  if (it.icon && it.icon.startsWith('http')) {
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
  },
  items,
}, null, 2), 'utf8')

console.log(`Справочник собран: ${items.length} предметов`)
console.log(`  Оружие: ${weapons.length} | Бижутерия: ${jewelry.length} | Доспехи: ${armor.length}`)
console.log(`  Двуручных: ${items.filter((i) => i.twoHanded).length}`)
console.log(`  С SA: ${weapons.filter((w) => w.saEffects?.length).length}`)
console.log(`  С rare: ${weapons.filter((w) => w.rareEffect).length}`)
