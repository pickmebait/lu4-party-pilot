/**
 * Аудит полноты справочника.
 *
 * Собирает все поля, которые приложение читает из предметов, и сверяет их с
 * тем, что реально лежит в public/items.json. Показывает, чего не хватает и
 * у скольких предметов.
 *
 * Поля берутся из исходников, а не из выдуманного списка: если код начнёт
 * читать новое поле, аудит это заметит.
 *
 * Запуск: node scripts/audit-fields.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'

const каталог = JSON.parse(readFileSync('public/items.json', 'utf8'))
const предметы = каталог.items

/** Читает все обращения к полям предметов в исходниках приложения. */
function поляИзИсходников() {
  const папки = ['src/components', 'src/lib']
  const поля = new Set()
  for (const папка of папки) {
    for (const имя of readdirSync(папка)) {
      if (!/\.(ts|tsx)$/.test(имя)) continue
      const исходник = readFileSync(`${папка}/${имя}`, 'utf8')
      for (const шаблон of [
        /\b(?:it|item|item2)\??\.([a-zA-Z_][a-zA-Z0-9_]*)/g,
        /catalog\.byId\([^)]*\)\??\.([a-zA-Z_][a-zA-Z0-9_]*)/g,
      ]) {
        for (const m of исходник.matchAll(шаблон)) поля.add(m[1])
      }
    }
  }
  return [...поля].sort()
}

/** Что лежит в справочнике. */
const естьВБазе = new Set()
for (const п of предметы) for (const к of Object.keys(п)) естьВБазе.add(к)

const читаетсяПриложением = поляИзИсходников()

/** Поля, которые есть в типе, но приложение их не читает. */
const источник = readFileSync('src/types.ts', 'utf8')
const блокТипа = источник.slice(источник.indexOf('export interface CatalogItem'))
const вТипе = [...блокТипа.matchAll(/^\s{2}([a-zA-Z_][a-zA-Z0-9_]*)\??:/gm)].map((m) => m[1])

console.log('Справочник:', предметы.length, 'предметов')
console.log('')
console.log('Поля, которые читает приложение:')
const отсутствуют = []
const пустые = []
for (const поле of читаетсяПриложением) {
  if (!естьВБазе.has(поле)) {
    const сколько = предметы.filter((п) => п[поле] !== undefined).length
    отсутствуют.push(`${поле} (${сколько})`)
    continue
  }
  const заполнено = предметы.filter((п) => п[поле] !== undefined).length
  const процент = Math.round((заполнено / предметы.length) * 100)
  if (заполнено < предметы.length) {
    пустые.push({ поле, заполнено, процент })
  } else {
    console.log(`  ${поле.padEnd(14)} ${String(заполнено).padStart(5)} из ${предметы.length}  100%`)
  }
}
console.log('')
if (отсутствуют.length) {
  console.log('Поля, которых в справочнике нет вообще:')
  for (const с of отсутствуют) console.log('  ' + с)
}
if (пустые.length) {
  console.log('Поля, заполненные не у всех предметов:')
  for (const { поле, заполнено, процент } of пустые) {
    console.log(`  ${поле.padEnd(14)} ${String(заполнено).padStart(5)} из ${предметы.length}  ${процент}%`)
  }
}

const неИспользуются = вТипе.filter((п) => !читаетсяПриложением.includes(п))
console.log('')
console.log(`В типе CatalogItem объявлено полей: ${вТипе.length}, приложение читает ${читаетсяПриложением.length}`)
console.log('Объявлены, но не читаются:', неИспользуются.join(', ') || '—')