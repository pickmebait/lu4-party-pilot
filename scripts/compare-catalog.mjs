/**
 * Сравнение текущего справочника с тем, что лежит в последнем коммите.
 *
 * Показывает, что именно исчезло при пересборке и почему: настоящий дубль
 * или потеря данных. Сборку приходится переделывать после смены правил
 * дедупликации, и без такого сравнения легко снова выкинуть лишнее.
 *
 * Запуск: node scripts/compare-catalog.mjs [ревизия]
 */
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const ревизия = process.argv[2] || 'HEAD'
const git = process.platform === 'win32' ? 'C:\\Program Files\\Git\\cmd\\git.exe' : 'git'

const прошлый = JSON.parse(
  execSync(`"${git}" show ${ревизия}:public/items.json`, { maxBuffer: 1 << 26 }).toString('utf8'),
).items
const текущий = JSON.parse(readFileSync('public/items.json', 'utf8')).items

/** То, по чему предмет узнают в пикере: имя, слот, грейд, статы, тип, SA-класс, иконка. */
const подпись = (п) =>
  [
    п.name,
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

const естьТеперь = new Map(текущий.map((п) => [подпись(п), п]))
const идентификаторы = new Set(текущий.map((п) => п.id))
const исчезли = прошлый.filter((п) => !идентификаторы.has(п.id))

console.log(`Было (${ревизия}):`, прошлый.length)
console.log('Стало:', текущий.length)
console.log('Исчезло записей:', исчезли.length)
console.log('')

let какДубль = 0
const подозрительные = []
for (const п of исчезли) {
  const близнец = естьТеперь.get(подпись(п))
  if (близнец && близнец.tex !== п.tex) {
    какДубль++
  } else {
    подозрительные.push(
      `  ${п.id} ${п.name} (tex ${п.tex}) → ${близнец ? `${близнец.id} (tex ${близнец.tex})` : 'БЛИЗНЕЦА НЕТ'}`,
    )
  }
}

console.log('Совпало со всем, кроме технического имени (настоящие дубли):', какДубль)
console.log('Исчезло по другой причине:', подозрительные.length)
for (const строка of подозрительные.slice(0, 15)) console.log(строка)

if (подозрительные.length) {
  console.log('')
  console.log('Это надо разобрать вручную: предметы исчезли, а близнеца с тем же')
  console.log('набором полей нет — значит пропала не копия, а сам предмет.')
  process.exit(1)
}
console.log('')
console.log('Пропавших предметов нет: убраны только копии.')