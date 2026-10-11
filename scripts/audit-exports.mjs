/**
 * Поиск мёртвого кода: экспортов, на которые никто не ссылается.
 *
 * Скрипт вырос из ручной проверки после удаления кнопки передачи вещей:
 * вместе с ней исчезло окно, но осталась функция в сторе и набор классов
 * в стилях. Искать руками каждый раз долго, а найти что-то уникальное
 * трудно — поэтому считаем ссылки сами.
 *
 * Считается ссылка по имени во всём каталоге src. Одно вхождение означает,
 * что имя встречается только в своём объявлении и никем не используется.
 *
 * Запуск: node scripts/audit-exports.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const КОРОНЬ = join(process.cwd(), 'src')

/** Все файлы каталога с указанными расширениями. */
function файлы(папка, расширения) {
  const out = []
  for (const имя of readdirSync(папка)) {
    const полный = join(папка, имя)
    if (statSync(полный).isDirectory()) out.push(...файлы(полный, расширения))
    else if (расширения.some((р) => имя.endsWith(р))) out.push(полный)
  }
  return out
}

const ИСХОДНИКИ = файлы(КОРОНЬ, ['.ts', '.tsx'])
const содержимое = new Map(ИСХОДНИКИ.map((ф) => [ф, readFileSync(ф, 'utf8')]))
const весьКод = [...содержимое.values()].join('\n')

/** Объявления экспортов: функция, константа, класс, тип, интерфейс. */
const ОБРАЗЕЦЫ = [
  /export\s+(?:async\s+)?(?:function|const|class|type|interface|enum)\s+([A-Za-z0-9_]+)/g,
  /export\s+(?:type\s+)?\{([^}]+)\}/g,
]

function экспортированные(файл) {
  const найдено = []
  for (const образец of ОБРАЗЕЦЫ) {
    for (const совпадение of содержимое.get(файл).matchAll(образец)) {
      if (образец.source.includes('{')) {
        // export { a, b as c } — интересует новое имя
        for (const кусок of совпадение[1].split(',')) {
          const имя = кусок.trim().split(/\s+as\s+/).pop().trim()
          if (/^[A-Za-z0-9_]+$/.test(имя)) найдено.push(имя)
        }
      } else {
        найдено.push(совпадение[1])
      }
    }
  }
  return найдено
}

/** Сколько раз имя встречается во всём исходном коде. */
function ссылок(имя) {
  return (весьКод.match(new RegExp(`\\b${имя}\\b`, 'g')) || []).length
}

const строки = []
for (const файл of ИСХОДНИКИ) {
  for (const имя of экспортированные(файл)) {
    if (ссылок(имя) <= 1) строки.push(`${relative(process.cwd(), файл)} → ${имя}`)
  }
}

console.log(`Файлов: ${ИСХОДНИКИ.length}`)
console.log(`Экспортов без ссылок: ${строки.length}`)
for (const строка of строки) console.log(`  ${строка}`)

if (строки.length === 0) {
  console.log('')
  console.log('Мёртвых экспортов нет.')
} else {
  console.log('')
  console.log('Это кандидаты на удаление. Проверь каждый глазами: имя может')
  console.log('использоваться в скриптах из scripts/ или в шаблонах по строке.')
  process.exit(1)
}
