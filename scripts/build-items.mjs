#!/usr/bin/env node
/**
 * Сборка справочника предметов из дампа твоего сервера и клиента.
 *
 * Зачем: на частном сервере названия и состав предметов отличаются от
 * официальных, поэтому общего справочника не существует. Собираем свой
 * из двух источников:
 *
 *   1) Сервер: data/stats/items/*.xml
 *      даёт связку id <-> техническое имя (tex) и принадлежность к сету.
 *   2) Клиент: lang/ru/systemmsg.txt
 *      даёт человеческое название по техническому имени.
 *
 * Пример:
 *   node scripts/build-items.mjs ^
 *     --items "D:\\l2server\\data\\stats\\items" ^
 *     --lang  "C:\\Games\\L2\\system\\lang\\ru\\systemmsg.txt"
 *
 * Оба аргумента необязательны: если дать только один, вторую часть
 * приложение заполнит из поля «введи вручную».
 */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { join, extname, basename } from 'node:path'

const args = parseArgs(process.argv.slice(2))

function parseArgs(argv) {
  const out = { items: '', lang: '', out: 'public/items.json' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--items') out.items = argv[++i] ?? ''
    else if (a === '--lang') out.lang = argv[++i] ?? ''
    else if (a === '--out') out.out = argv[++i] ?? ''
    else if (a === '--help' || a === '-h') {
      console.log(HELP)
      process.exit(0)
    } else if (a.startsWith('--')) {
      die(`Неизвестный аргумент: ${a}`)
    }
  }
  return out
}

const HELP = `
Сборка справочника предметов Party Pilot

  --items <путь>   каталог с *.xml предмета или сам файл (например data/stats/items)
  --lang  <путь>   файл systemmsg.txt или strings-ru.xml из клиента
  --out   <путь>   куда сохранить (по умолчанию public/items.json)
  -h, --help       эта справка
`

function die(msg) {
  console.error(`Ошибка: ${msg}`)
  process.exit(1)
}

function collectXmlFiles(target) {
  if (!target) return []
  if (!existsSync(target)) die(`Путь не найден: ${target}`)

  const st = statSync(target)
  if (st.isFile()) return [target]

  const files = []
  for (const entry of readdirSync(target)) {
    const p = join(target, entry)
    const s = statSync(p)
    if (s.isDirectory()) files.push(...collectXmlFiles(p))
    else if (extname(entry).toLowerCase() === '.xml') files.push(p)
  }
  return files
}

/** Достаёт значение атрибута из открывающего тега. */
function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'))
  return m ? m[1] : null
}

function attrInt(tag, name) {
  const v = attr(tag, name)
  if (v === null) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

/**
 * Разбирает XML предметов. Формат один и тот же у всех эмуляторов:
 *   <item id="1146" name="short_sword" type="weapon">
 *     <set name="no_set"/>
 *   </item>
 */
function parseItemsXml(files) {
  const items = new Map()

  for (const file of files) {
    let xml
    try {
      xml = readFileSync(file, 'utf8')
    } catch (e) {
      console.warn(`  пропущен (не читается): ${file}`)
      continue
    }

    // Каждый <item ...> вместе с содержимым до </item> (тег может быть самозакрытым).
    const re = /<item\b([^>]*?)(?:\/>|>([\s\S]*?)<\/item>)/gi
    let m
    let inFile = 0

    while ((m = re.exec(xml)) !== null) {
      const head = m[1] ?? ''
      const body = m[2] ?? ''
      const id = attrInt(head, 'id')
      const tex = attr(head, 'name')
      if (id === undefined || id <= 0 || !tex) continue

      const setTag = body.match(/<set\b[^>]*\bname\s*=\s*"([^"]*)"/i)
      const rawSet = setTag ? setTag[1] : null
      // no_set — это «не принадлежит сету», а не название комплекта.
      const set = rawSet && !/^no_?set$/i.test(rawSet) ? rawSet : undefined

      const type = attr(head, 'type') ?? undefined
      const grade = attrInt(head, 'grade') ?? gradeFromFilename(basename(file))

      const prev = items.get(id)
      items.set(id, {
        id,
        tex,
        set: set ?? prev?.set,
        type: type ?? prev?.type,
        grade: grade ?? prev?.grade,
      })
      inFile++
    }

    console.log(`  ${basename(file)}: ${inFile} предметов`)
  }

  return items
}

/**
 * У многих эмуляторов грейд вынесен в имя файла (armor_t1_...),
 * поэтому подтягиваем его оттуда, если в теге его нет.
 */
function gradeFromFilename(file) {
  const m = file.match(/(?:^|[_\-/])(?:t|grade|g)(\d{1,2})(?:[_\-.]|$)/i)
  if (!m) return undefined
  const n = Number(m[1])
  return Number.isFinite(n) && n >= 0 && n <= 16 ? n : undefined
}

/**
 * Разбирает файл с названиями. Поддерживаются два формата:
 *   systemmsg.txt:  item.draco_blade.0=Клинок Драко
 *   strings-ru.xml: <string ... name="item.draco_blade.0" value="Клинок Драко"/>
 */
function parseLang(file) {
  if (!file) return new Map()
  if (!existsSync(file)) die(`Файл с названиями не найден: ${file}`)

  const text = readFileSync(file, 'utf8')
  const names = new Map()

  const plain = /^\s*item\.([A-Za-z0-9_\-]+)\.\d+\s*=\s*(.+?)\s*$/gm
  let m
  let n = 0
  while ((m = plain.exec(text)) !== null) {
    const tex = m[1]
    const value = clean(m[2])
    if (tex && value) {
      names.set(tex, value)
      n++
    }
  }

  if (n === 0) {
    const xml = /<string\b[^>]*>/gi
    while ((m = xml.exec(text)) !== null) {
      const tag = m[0]
      const name = attr(tag, 'name')
      const value = attr(tag, 'value')
      if (!name || !value) continue
      const tex = name.match(/^item\.([A-Za-z0-9_\-]+)\.\d+$/)
      if (!tex) continue
      const v = clean(value)
      if (v) {
        names.set(tex[1], v)
        n++
      }
    }
  }

  console.log(`  ${basename(file)}: ${n} названий`)
  return names
}

/** Убираем экранирование и мусор из строки названия. */
function clean(s) {
  return decodeEscapes(
    s.replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/<[^>]+>/g, ''),
  ).trim()
}

/**
 * Клиент часто хранит кириллицу как \xNN-последовательности: вместо
 * «Клинок» в файле лежит «\xd0\x9a\xd0\xbb\xd0\xb8\xd0\xbd\xd0\xbe\xd0\xba».
 * Это не текст, а UTF-8 байты — собираем их обратно в буфер и декодируем.
 */
function decodeEscapes(s) {
  if (!/\\x[0-9a-fA-F]{2}/.test(s)) return s

  const bytes = []
  // Разбиваем так, чтобы каждая \xNN осталась отдельным куском,
  // а остальной текст добавлялся в общий буфер как есть.
  for (const part of s.split(/(\\x[0-9a-fA-F]{2})/)) {
    if (!part) continue
    if (part.startsWith('\\x')) {
      bytes.push(Number.parseInt(part.slice(2), 16))
    } else {
      for (const b of Buffer.from(part, 'utf8')) bytes.push(b)
    }
  }
  return Buffer.from(bytes).toString('utf8')
}

/** Убираем «Лишние слова», которые клиент добавляет автоматически. */
function prettify(name) {
  return name
    .replace(/\s*\[\s*\d+\s*\]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const itemFiles = collectXmlFiles(args.items)
const names = parseLang(args.lang)

if (itemFiles.length === 0) {
  die(
    'Не найдено ни одного xml с предметами. Укажи --items путь к data/stats/items сервера.\n' +
      'Без --items справочник собрать не из чего, но приложение продолжит работать: предметы\n' +
      'можно будет вводить по id вручную.',
  )
}

console.log('\nСобираю справочник…')
const items = parseItemsXml(itemFiles)

const result = []
let named = 0
let withSet = 0

for (const it of items.values()) {
  const name = names.get(it.tex)
  if (name) named++
  if (it.set) withSet++
  result.push({
    id: it.id,
    name: name ? prettify(name) : it.tex,
    tex: it.tex,
    set: it.set,
    grade: it.grade,
    type: it.type,
  })
}

result.sort((a, b) => a.id - b.id)

const catalog = {
  generatedAt: new Date().toISOString(),
  source: [
    args.items ? basename(args.items) : null,
    args.lang ? basename(args.lang) : null,
  ]
    .filter(Boolean)
    .join(' + '),
  items: result,
}

writeFileSync(args.out, `${JSON.stringify(catalog)}\n`, 'utf8')

console.log(`
Готово: ${args.out}
  всего предметов:   ${result.length}
  с названиями:       ${named}${names.size ? '' : ' (файл с названиями не задан — взято техническое имя)'}
  в составе сетов:    ${withSet}
`)

if (named === 0) {
  console.log(
    'Подсказка: названия берутся из lang/ru/systemmsg.txt клиента. Если в приложении\n' +
      'будут латинские имена вместо русских — не передал --lang.\n',
  )
}
