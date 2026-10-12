/*
 * Круговые импорты между модулями src.
 *
 * Если A тянет B, а B тянет A, то при определённом порядке загрузки одна из
 * связей останется неразрешённой: компонент при этом обычно ещё успевает
 * объявиться, и ошибка всплывает не сразу, а как undefined вместо функции
 * при первом рендере. Нашлось при выносе карточки персонажа: выбор
 * принадлежности понадобился и Chars, и CharCard, и его положили в Chars —
 * а Chars и так тянет CharCard.
 *
 * Запуск: node scripts/audit-cycles.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const корень = path.resolve('src')

function все(dir) {
  const out = []
  for (const имя of fs.readdirSync(dir)) {
    const файл = path.join(dir, имя)
    if (fs.statSync(файл).isDirectory()) out.push(...все(файл))
    else if (/\.tsx?$/.test(имя)) out.push(файл)
  }
  return out
}

/** Разрешает импорт в путь внутри src. Алиас @/ ведёт в корень src. */
function цельДля(файл, импорт) {
  let цель = импорт.startsWith('@/')
    ? path.join(корень, импорт.slice(2))
    : path.resolve(path.dirname(файл), импорт)

  if (/\.tsx?$/.test(цель)) return цель
  if (fs.existsSync(цель + '.ts')) return цель + '.ts'
  if (fs.existsSync(цель + '.tsx')) return цель + '.tsx'
  if (fs.existsSync(path.join(цель, 'index.ts'))) return path.join(цель, 'index.ts')
  if (fs.existsSync(path.join(цель, 'index.tsx'))) return path.join(цель, 'index.tsx')
  return null
}

/** Наш модуль или нет. Чужие пакеты и стили обходить незачем. */
function наш(импорт) {
  if (!импорт.startsWith('.') && !импорт.startsWith('@/')) return false
  return /\.tsx?$/.test(импорт) || !/\.[a-z]+$/i.test(импорт)
}

const файлы = все(корень)
const граф = new Map()
const битые = []

for (const файл of файлы) {
  const код = fs.readFileSync(файл, 'utf8')
  const рёбра = new Set()
  // И «from '…'», и «import '…'» безымянный — обе формы тянут модуль.
  const регекс = /(?:\bfrom\s*|\bimport\s*)['"]([^'"]+)['"]/g
  let m
  while ((m = регекс.exec(код))) {
    if (!наш(m[1])) continue
    const цель = цельДля(файл, m[1])
    if (!цель) битые.push(path.relative(корень, файл) + ' → ' + m[1])
    else if (цель.startsWith(корень)) рёбра.add(цель)
  }
  граф.set(файл, рёбра)
}

/* Обход в глубину с отметкой на стеке: встретив соседа, который ещё в
   стеке, находим цикл. Одну и ту же цепочку не повторяем — она уже
   записана в любом порядке обхода. */
const циклы = []
const посещено = new Set()
const наСтеке = new Set()
const стек = []

function обход(узел) {
  посещено.add(узел)
  наСтеке.add(узел)
  стек.push(узел)
  for (const след of граф.get(узел) ?? []) {
    if (!посещено.has(след)) обход(след)
    else if (наСтеке.has(след)) {
      const цепочка = [...стек.slice(стек.indexOf(след)), след]
      const ключ = [...цепочка].sort().join('|')
      if (!циклы.some((c) => c.ключ === ключ)) циклы.push({ ключ, цепочка })
    }
  }
  стек.pop()
  наСтеке.delete(узел)
}

for (const файл of файлы) if (!посещено.has(файл)) обход(файл)

console.log('Файлов: ' + файлы.length)
console.log('Битых относительных импортов: ' + битые.length)
for (const б of битые) console.log('  ' + б)

console.log('Круговых импортов: ' + циклы.length)
for (const ц of циклы) {
  console.log('  ' + ц.цепочка.map((f) => path.relative(корень, f)).join(' → '))
}

if (битые.length || циклы.length) process.exit(1)