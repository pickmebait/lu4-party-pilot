/**
 * Локальный сервер для сборщика данных с masterwork.wiki.
 *
 * Нужен на время выкачки и делает две вещи:
 *
 *  1. Отдаёт странице вики scripts/masterwork-scrape.js и уже сохранённый
 *     список предметов. Копировать длинный скрипт в консоль вручную
 *     неудобно, а список незачем перекачивать после каждого обрыва.
 *
 *  2. Принимает от страницы собранные карточки (POST /save) и складывает их
 *     в data/masterwork/parts. Это главное: защита вики рвёт сессию каждые
 *     несколько минут, поэтому выкачка идёт через страницу с автосохранением,
 *     а данные переживают перезагрузку.
 *
 * Страница после обрыва сама перезагружается, проходит проверку браузера,
 * забирает список и список уже собранного с этого сервера и продолжает.
 *
 * Запуск: node scripts/serve-scrape.mjs [порт]
 */
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const тут = dirname(fileURLToPath(import.meta.url))
const корень = join(тут, '..')
const ПАПКА = join(корень, 'data', 'masterwork')
const ЧАСТИ = join(ПАПКА, 'parts')
const порт = Number(process.argv[2] || 8099)

await mkdir(ЧАСТИ, { recursive: true })

createServer(async (req, res) => {
  const путь = (req.url || '/').split('?')[0]
  try {
    if (req.method === 'POST' && путь === '/save') return await сохранить(req, res)
    if (req.method === 'GET' && путь === '/done') return await отдатьСобранное(res)
    return await отдатьФайл(res, путь)
  } catch (e) {
    res.writeHead(500, cors()).end(String((e && e.message) || e))
  }
}).listen(порт, '127.0.0.1', () => {
  console.log(`Сборщик: http://127.0.0.1:${порт}/masterwork-scrape.js`)
  console.log(`Список:   http://127.0.0.1:${порт}/list.json`)
  console.log(`Сохранено: http://127.0.0.1:${порт}/done`)
  console.log(`Части складываются в ${ЧАСТИ}`)
})

/** Сохранить порцию карточек, присланных страницей. */
async function сохранить(req, res) {
  const куски = []
  for await (const ч of req) куски.push(ч)
  const тело = Buffer.concat(куски)
  let данные
  try {
    данные = JSON.parse(тело.toString('utf8'))
  } catch {
    res.writeHead(400, cors()).end('не разобралось как json')
    return
  }
  const номер = String(данные.номерЧасти ?? 0).padStart(3, '0')
  const имя = join(ЧАСТИ, `mw-raw-${номер}.json`)
  await writeFile(имя, JSON.stringify(данные), 'utf8')
  const файлы = (await readdir(ЧАСТИ)).filter((f) => f.endsWith('.json'))
  console.log(
    `[${new Date().toISOString()}] часть ${номер}: ${данные.предметы?.length ?? 0} записей, ` +
      `всего частей ${файлы.length}`,
  )
  res.writeHead(200, cors()).end(JSON.stringify({ ok: true, имя, частей: файлы.length }))
}

/** Какие предметы уже сохранены — чтобы не качать их повторно. */
async function отдатьСобранное(res) {
  let файлы = []
  try {
    файлы = (await readdir(ЧАСТИ)).filter((f) => f.startsWith('mw-raw-') && f.endsWith('.json')).sort()
  } catch {
    файлы = []
  }
  const ids = []
  for (const имя of файлы) {
    try {
      const данные = JSON.parse(await readFile(join(ЧАСТИ, имя), 'utf8'))
      for (const п of данные.предметы || []) ids.push(п.id)
    } catch {
      console.log(`[!] не читается ${имя}, пропускаю`)
    }
  }
  res.writeHead(200, cors()).end(JSON.stringify({ частей: файлы.length, ids }))
}

const ОТДАЁМ = {
  '/masterwork-scrape.js': join(тут, 'masterwork-scrape.js'),
  '/masterwork-driver.js': join(тут, 'masterwork-driver.js'),
  '/list.json': join(ПАПКА, 'list.json'),
}

async function отдатьФайл(res, путь) {
  const имя = путь.replace(/^\/+/, '') || 'masterwork-scrape.js'
  const файл = ОТДАЁМ['/' + имя]
  if (!файл) {
    res.writeHead(404, cors()).end('нет такого файла')
    return
  }
  try {
    const тело = await readFile(файл, 'utf8')
    res.writeHead(200, { ...cors(), 'Content-Type': 'application/json; charset=utf-8' })
    res.end(тело)
  } catch {
    res.writeHead(404, cors()).end('файл не найден')
  }
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  }
}