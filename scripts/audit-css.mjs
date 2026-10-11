/**
 * Поиск классов в стилях, которых нет в разметке.
 *
 * Классы в CSS пишутся руками, а убираются — забыв. После удаления кнопки
 * передачи остался .transfer-list, после переноса подписей блоков — старые
 * правила сетки. Найти их глазами по тысяче строк нереально, а повод
 * повозиться со стилем в том же коммите — есть.
 *
 * Считаются одиночные классы: составные вроде .gear-cell.filled разбираются
 * на части, потому что в разметке они пишутся по отдельности.
 *
 * Запуск: node scripts/audit-css.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const КОРОНЬ = process.cwd()

function файлы(папка, расширения) {
  const out = []
  for (const имя of readdirSync(папка)) {
    const полный = join(папка, имя)
    if (statSync(полный).isDirectory()) out.push(...файлы(полный, расширения))
    else if (расширения.some((р) => имя.endsWith(р))) out.push(полный)
  }
  return out
}

/** Классы, встречающиеся в разметке. */
function классыВРазметке() {
  const out = new Set()
  const разметка = [
    ...файлы(join(КОРОНЬ, 'src'), ['.tsx']),
    join(КОРОНЬ, 'index.html'),
  ]
  for (const файл of разметка) {
    const текст = readFileSync(файл, 'utf8')
    // className="..." и className={`...`} — оба варианта, плюс class=
    for (const m of текст.matchAll(/class(?:Name)?\s*=\s*(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g)) {
      const кусок = m[1] ?? m[2] ?? m[3] ?? ''
      for (const класс of кусок.split(/[\s${}'"`?:()[\],|!]+/)) {
        const чистый = класс.replace(/^.*\./, '').trim()
        if (чистый && /^[a-zA-Z][\w-]*$/.test(чистый)) out.add(чистый)
      }
    }
  }
  return out
}

const использованные = классыВРазметке()
const css = readFileSync(join(КОРОНЬ, 'src', 'styles.css'), 'utf8')

/** Классы, встречающиеся в правилах CSS. */
const вСтилях = new Map()
for (const m of css.matchAll(/\.([a-zA-Z][\w-]*)/g)) {
  if (!вСтилях.has(m[1])) вСтилях.set(m[1], [])
  вСтилях.get(m[1]).push(m.index)
}

const строки = [...вСтилях.entries()]
  .filter(([класс]) => !использованные.has(класс))
  .sort((a, b) => b[1].length - a[1].length)

console.log(`Классов в разметке: ${использованные.size}`)
console.log(`Классов в стилях: ${вСтилях.size}`)
console.log(`Классов без разметки: ${строки.length}`)
for (const [класс, места] of строки) {
  const строка = css.slice(0, места[0]).split('\n').length
  console.log(`  .${класс} — ${места.length} раз, первое на строке ${строка}`)
}
