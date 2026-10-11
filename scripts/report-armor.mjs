/**
 * Разбор покрытия типом брони.
 *
 * Тип (тяжёлая, лёгкая, магическая) нужен для фильтра. Он есть не у всех
 * вещей, и в этом скрипте видно, у каких именно и что можно вытянуть.
 *
 * Запуск: node scripts/report-armor.mjs [сколькоПоказать]
 */
import { readFileSync } from 'node:fs'

const показать = Number(process.argv[2] || 15)
const каталог = JSON.parse(readFileSync('public/items.json', 'utf8'))
const брони = каталог.items.filter((п) => ['head', 'chest', 'legs', 'gloves', 'feet'].includes(п.slot))

const ИМЯ_СЛОТА = {
  head: 'шлемы',
  chest: 'верх',
  legs: 'низ',
  gloves: 'перчатки',
  feet: 'сапоги',
}

console.log('Брони в справочнике:', брони.length)
console.log('')
console.log('Покрытие по слотам:')
for (const [слот, имя] of Object.entries(ИМЯ_СЛОТА)) {
  const вещи = брони.filter((п) => п.slot === слот)
  const сТипом = вещи.filter((п) => п.armorType)
  const процент = Math.round((сТипом.length / вещи.length) * 100)
  console.log(
    `  ${имя.padEnd(10)} ${String(сТипом.length).padStart(5)} из ${String(вещи.length).padStart(4)}   ${процент}%`,
  )
}

const безТипа = брони.filter((п) => !п.armorType)
console.log('')
console.log('Без типа:', безТипа.length, 'из', брони.length)

const поСлоту = {}
for (const п of безТипа) {
  поСлоту[п.slot] = (поСлоту[п.slot] || 0) + 1
}
console.log('  по слотам:', JSON.stringify(поСлоту))
console.log('')

/** Материал в названии: в игре он однозначно задаёт тип брони. */
const МАТЕРИАЛ = {
  heavy:
    /\b(Mithril|Plate|Mail|Scale|Bone|Bronze|Keti|Chain|Composite|Angelic|Eviscerator|Divine|Doom|Noble|Dragon|Holy|Sanctuary|Crimson|Rapacious|Bladed|Solaris|Baron)\b/i,
  light: /\b(Leather|Elven|Dwarven|Wooden|Buck|Linen|Silver|Light)\b/i,
  magic: /\b(Robe|Cotton|Ceremonial|Nightshade|Shaman|Mystic|Apprentice|Novice|Mage)\b/i,
}

const поМатериалу = { heavy: 0, light: 0, magic: 0 }
let безМаркера = 0
const примерыМатериала = []
const примерыБезМаркера = []

for (const п of безТипа) {
  let найден = null
  for (const [тип, ре] of Object.entries(МАТЕРИАЛ)) {
    if (ре.test(п.name)) {
      найден = тип
      break
    }
  }
  if (найден) {
    поМатериалу[найден]++
    if (примерыМатериала.length < 8) примерыМатериала.push(`${найден}: ${п.name}`)
  } else {
    безМаркера++
    if (примерыБезМаркера.length < 8) примерыБезМаркера.push(п.name)
  }
}

console.log('Из них выводится по материалу в названии:')
console.log(
  `  тяжёлая ${поМатериалу.heavy} | лёгкая ${поМатериалу.light} | магическая ${поМатериалу.magic}`,
)
console.log('  примеры:', примерыМатериала.join(' · '))
console.log('')
console.log('Совсем без маркеров в названии:', безМаркера)
console.log('  примеры:', примерыБезМаркера.join(' · '))
console.log('')
console.log('Примеры вещей без типа:')
for (const п of безТипа.slice(0, показать)) {
  console.log(`  ${ИМЯ_СЛОТА[п.slot].padEnd(10)} ${п.name}`)
}