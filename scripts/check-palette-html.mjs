/**
 * Список палитр в index.html и в модуле должны совпадать.
 *
 * Оформление ставится до загрузки приложения — маленьким скриптом прямо в
 * разметке, потому что модуль до отрисовки не доедет. Списка там два, и
 * разойтись они могут незаметно: скрипт тихо перестанет узнавать новую
 * палитру, и человек будет выбирать её и каждый раз получать чужую.
 */
import { readFileSync } from 'node:fs'
import { PALETTES } from '../src/lib/palette.ts'

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

/** Идентификаторы, перечисленные во встроенном скрипте. */
const скрипт = html.match(/localStorage\.getItem\('pp:palette'\)[\s\S]*?indexOf\(v\) !== -1/)
if (!скрипт) {
  console.error('В index.html нет скрипта выбора палитры — оформление не применится до отрисовки.')
  process.exit(1)
}

const перечислены = [...скрипт[0].matchAll(/'([a-z]+)'/g)]
  .map((m) => m[1])
  // Первое вхождение в match — это сам ключ 'pp:palette', его пропускаем.
  .filter((id) => id !== 'palette')

const настоящие = PALETTES.map((p) => p.id)

const лишние = перечислены.filter((id) => !настоящие.includes(id))
const забытые = настоящие.filter((id) => !перечислены.includes(id))

if (лишние.length || забытые.length) {
  if (забытые.length) console.error('В index.html нет палитр:', забытые.join(', '))
  if (лишние.length) console.error('В index.html лишние палитры:', лишние.join(', '))
  process.exit(1)
}

console.log(`Палитр в разметке и в коде совпадают: ${настоящие.length} (${настоящие.join(', ')})`)