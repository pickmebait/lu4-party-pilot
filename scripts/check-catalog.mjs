/**
 * Проверка собранного справочника.
 *
 * Ловит то, что не видно глазами: предмет без слота, который попал в слот,
 * оружие без типа, дуальное без признака двуручности, дубликаты id,
 * неизвестный грейд, оставшиеся предметы других версий.
 *
 * Запуск: node scripts/check-catalog.mjs
 * Код возврата 0 — всё в порядке, 1 — есть ошибки.
 */
import { readFileSync } from 'node:fs'

const каталог = JSON.parse(readFileSync('public/items.json', 'utf8'))
const предметы = каталог.items

/**
 * Имена слотов берём из src/types.ts, а не пишем здесь руками: иначе
 * проверка рано или поздно начнёт считать хорошие предметы плохими.
 * Слоты в справочнике перечислены в проверках accepts — «i.slot === '…'».
 * Ключи самого объекта SLOTS другие (rhand против r_hand), это идентификаторы
 * интерфейса, а не значения поля slot.
 */
function прочитатьСлоты() {
  const исходник = readFileSync('src/types.ts', 'utf8')
  const слоты = [...исходник.matchAll(/i\.slot === '([^']+)'/g)].map((m) => m[1])
  if (!слоты.length) throw new Error('не нашлось ни одного слота в src/types.ts')
  return слоты
}

/**
 * Грейды и типы оружия тоже берём из src/types.ts, как и слоты: иначе
 * справочник и фильтр разъезжаются, и проверка ругается на то, что в
 * интерфейсе уже не существует.
 */
function прочитатьМассив(имя) {
  const исходник = readFileSync('src/types.ts', 'utf8')
  const m = исходник.match(new RegExp(`export const ${имя} = \\[([\\s\\S]*?)\\]`))
  if (!m) throw new Error(`не нашёлся массив ${имя} в src/types.ts`)
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

const СЛОТЫ = new Set(прочитатьСлоты())
const ГРЕЙДЫ = new Set(прочитатьМассив('GRADE_OPTIONS'))
const ТИПЫ_ОРУЖИЯ = new Set(прочитатьМассив('WEAPON_TYPE_LABELS'))
const ТИПЫ_БРОНИ = new Set(['heavy', 'light', 'magic'])
const ТИПЫ_ПРЕДМЕТОВ = new Set([
  'top',
  'bottom',
  'full',
  'helmet',
  'gloves',
  'boots',
  'shield',
  'accessory',
])
const КОМПЛЕКТЫ = new Map((каталог.sets ?? []).map((с) => [с.id, с]))

const ошибки = []
const ошибка = (текст) => ошибки.push(текст)
const виден = (текст) => console.log('  ' + текст)

// Дубликаты id — главная беда: по id предмет ищется во всех списках.
const поId = new Map()
for (const п of предметы) {
  if (поId.has(п.id)) ошибка(`дубль id ${п.id}: "${поId.get(п.id).name}" и "${п.name}"`)
  else поId.set(п.id, п)
}

for (const п of предметы) {
  // Базовые поля
  if (typeof п.id !== 'number') ошибка(`нечисловой id у "${п.name}"`)
  if (!п.name || !п.name.trim()) ошибка(`пустое имя у предмета ${п.id}`)
  if (!п.tex) ошибка(`нет технического имени у "${п.name}"`)

  // Чужие версии сервера не должны просачиваться в подборку
  if (/^MW\s/.test(п.name)) ошибка(`предмет чужой версии в подборке: "${п.name}"`)
  if (/^\(?not use\)?$/i.test(п.name)) ошибка(`служебная запись в подборке: "${п.name}"`)

  // Грейд
  if (п.gradeName !== undefined && !ГРЕЙДЫ.has(п.gradeName)) {
    ошибка(`неизвестный грейд "${п.gradeName}" у "${п.name}"`)
  }

  // Слот
  if (п.slot !== undefined && !СЛОТЫ.has(п.slot)) {
    ошибка(`неизвестный слот "${п.slot}" у "${п.name}"`)
  }

  // Ссылки на источник и картинку: по ним обновляют справочник.
  if (!п.url || !/^https:\/\/masterwork\.wiki\//.test(п.url)) {
    ошибка(`нет ссылки на источник у "${п.name}"`)
  }
  if (!п.imageUrl || !/^https:\/\/masterwork\.wiki\//.test(п.imageUrl)) {
    ошибка(`нет ссылки на картинку у "${п.name}"`)
  }

  // Тип предмета брони и правила его слота.
  if (п.armorItemType !== undefined && !ТИПЫ_ПРЕДМЕТОВ.has(п.armorItemType)) {
    ошибка(`неизвестный тип предмета брони "${п.armorItemType}" у "${п.name}"`)
  }
  if (п.armorItemType === 'shield' && п.slot !== 'l_hand') {
    ошибка(`щит не в левой руке: "${п.name}"`)
  }
  if (п.armorItemType === 'accessory' && п.slot !== 'head') {
    ошибка(`аксессуар не в шлеме: "${п.name}"`)
  }

  if (п.slot === 'r_hand') {
    if (!п.weaponType) ошибка(`оружие без типа: "${п.name}"`)
    else if (!ТИПЫ_ОРУЖИЯ.has(п.weaponType)) {
      ошибка(`неизвестный тип оружия "${п.weaponType}" у "${п.name}"`)
    }
    // Парное идёт парой в обе руки: без двуручности оно заняло бы только
    // правую руку, и игрок смог бы надеть щит поверх второй пары.
    if (п.dual && !п.twoHanded) ошибка(`парное оружие без признака двуручности: "${п.name}"`)
    if (п.dual && !/^Парные/.test(п.weaponType || '')) {
      ошибка(`парное оружие с типом "${п.weaponType}": "${п.name}"`)
    }
    if (п.saEffects && п.saEffects.length !== 3) {
      ошибка(`у "${п.name}" ${п.saEffects.length} SA, а не три`)
    }
    for (const sa of п.saEffects ?? []) {
      if (!sa.name || !sa.description) ошибка(`пустой SA у "${п.name}"`)
    }
    if (п.saCommon && !п.saCommon.description) {
      ошибка(`пустой общий SA у "${п.name}"`)
    }
    if (п.rareEffects?.length && !п.rareEffect) {
      ошибка(`у "${п.name}" есть rareEffects, но нет rareEffect`)
    }
    for (const rare of п.rareEffects ?? []) {
      if (!rare.name || !rare.description) ошибка(`пустой редкий эффект у "${п.name}"`)
    }
    for (const bonus of п.enchantBonuses ?? []) {
      if (!Number.isInteger(bonus.mod) || bonus.mod <= 0 || !bonus.description) {
        ошибка(`плохой бонус заточки у "${п.name}"`)
      }
    }
  }

  if (п.slot && ['head', 'chest', 'legs', 'gloves', 'feet'].includes(п.slot)) {
    if (п.armorType !== undefined && !ТИПЫ_БРОНИ.has(п.armorType)) {
      ошибка(`неизвестный тип брони "${п.armorType}" у "${п.name}"`)
    }
    if (п.weaponType) ошибка(`броня с типом оружия: "${п.name}"`)
  }

  // Цельная броня занимает верх и низ
  if (п.fullbody && п.slot !== 'chest') ошибка(`цельная броня не в слоте верха: "${п.name}"`)

  // Комплекты: у предмета может быть несколько вариантов, например у шлема.
  if (п.setId && !КОМПЛЕКТЫ.has(п.setId)) {
    ошибка(`неизвестный комплект "${п.setId}" у "${п.name}"`)
  }
  for (const набор of п.sets ?? []) {
    if (!КОМПЛЕКТЫ.has(набор.setId)) {
      ошибка(`неизвестный комплект "${набор.setId}" у "${п.name}"`)
    }
  }

  // Иконка: путь должен вести в ту папку, которую мы собираем
  if (п.icon && !п.icon.startsWith('icons-mw/')) {
    ошибка(`иконка ведёт не в icons-mw: "${п.name}" → ${п.icon}`)
  }

  // Неправдоподобные характеристики: на вики попадаются битые строки
  if (typeof п.atkPhys === 'number' && п.atkPhys > 5000) {
    ошибка(`неправдоподобная атака ${п.atkPhys} у "${п.name}"`)
  }
  if (typeof п.atkMag === 'number' && п.atkMag > 5000) {
    ошибка(`неправдоподобная маг. атака ${п.atkMag} у "${п.name}"`)
  }
  if (typeof п.physDef === 'number' && (п.physDef < 0 || п.physDef > 1000)) {
    ошибка(`неправдоподобная защита ${п.physDef} у "${п.name}"`)
  }
}

// Одно и то же имя с разными id: в списке это две почти одинаковые строки.
// Они законны, если различается SA-класс или иконка: предметы видны глазом
// разными. Настоящий дубль — совпадение по всем полям сразу.
const поИмени = new Map()
for (const п of предметы) {
  if (!поИмени.has(п.name)) поИмени.set(п.name, [])
  поИмени.get(п.name).push(п)
}
const подпись = (п) =>
  [
    п.slot ?? '',
    п.gradeName ?? '',
    п.atkPhys ?? '',
    п.atkMag ?? '',
    п.physDef ?? '',
    п.mDef ?? '',
    п.weaponType ?? '',
    п.armorType ?? '',
    п.variant ?? '',
    п.icon ?? '',
  ].join('|')
let дублей = 0
const примерыДублей = []
for (const [имя, список] of поИмени) {
  if (список.length < 2) continue
  if (new Set(список.map(подпись)).size === 1) {
    дублей += список.length
    if (примерыДублей.length < 5) примерыДублей.push(`${имя} ×${список.length}`)
  }
}

// Комплекты: идентификаторы не повторяются, все части есть в справочнике.
const идыКомплектов = new Set()
for (const набор of каталог.sets ?? []) {
  if (!набор.id || идыКомплектов.has(набор.id)) {
    ошибка(`дубль или пустой id комплекта: "${набор.id}"`)
  }
  идыКомплектов.add(набор.id)
  if (!набор.name) ошибка(`пустое имя комплекта ${набор.id}`)
  if (!Array.isArray(набор.pieces) || набор.pieces.length < 2) {
    ошибка(`в комплекте ${набор.id} меньше двух частей`)
    continue
  }
  for (const id of набор.pieces) {
    if (!поId.has(id)) ошибка(`в комплекте ${набор.id} нет предмета ${id}`)
  }
}

// Итоги
const вСлотах = предметы.filter((п) => п.slot)
const оружие = предметы.filter((п) => п.slot === 'r_hand')
const брони = предметы.filter((п) => ['head', 'chest', 'legs', 'gloves', 'feet'].includes(п.slot))

console.log('Справочник:', предметы.length, 'предметов')
console.log('  в слотах:', вСлотах.length, '| оружия:', оружие.length, '| брони:', брони.length)
console.log('  комплектов:', КОМПЛЕКТЫ.size)
console.log('  без грейда:', предметы.filter((п) => !п.gradeName).length)
console.log(
  '  тип оружия задан у',
  оружие.filter((п) => п.weaponType).length,
  '| двуручных',
  оружие.filter((п) => п.twoHanded && !п.dual).length,
  '| парных',
  оружие.filter((п) => п.dual).length,
)
console.log(
  '  тип брони задан у',
  брони.filter((п) => п.armorType).length,
  'из',
  брони.length,
)
if (дублей) {
  виден(`полных дублей осталось: ${дублей} — ${примерыДублей.join(', ')}`)
}

if (ошибки.length) {
  console.log('\nОшибок:', ошибки.length)
  const свёрнутые = new Map()
  for (const e of ошибки) {
    const ключ = e.replace(/"[^"]*"/g, '"…"').replace(/\d+/g, 'N')
    свёрнутые.set(ключ, (свёрнутые.get(ключ) || 0) + 1)
  }
  for (const [текст, n] of свёрнутые) виден(`${n}× ${текст}`)
  process.exit(1)
}
console.log('\nОшибок нет')