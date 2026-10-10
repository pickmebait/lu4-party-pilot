/**
 * Маленький отдающий сервер для сборщика.
 *
 * Нужен только на время выкачки: страница masterwork.wiki подтягивает с него
 * scripts/masterwork-scrape.js, потому что скопировать длинный скрипт в
 * консоль вручную неудобно и легко испортить. CORS-заголовок обязателен:
 * страница живёт на другом домене.
 *
 * Запуск: node scripts/serve-scrape.mjs [порт]
 * Остановить: Ctrl+C
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const тут = dirname(fileURLToPath(import.meta.url))
const порт = Number(process.argv[2] || 8099)

createServer(async (req, res) => {
  const имя = (req.url || '/').split('?')[0].replace(/^\/+/, '') || 'masterwork-scrape.js'
  // Отдаём только из папки scripts и только известные файлы.
  const разрешён = ['masterwork-scrape.js', 'build-catalog.mjs']
  if (!разрешён.includes(имя)) {
    res.writeHead(404, cors()).end('нет такого файла')
    return
  }
  try {
    const тело = await readFile(join(тут, имя), 'utf8')
    res.writeHead(200, { ...cors(), 'Content-Type': 'text/javascript; charset=utf-8' })
    res.end(тело)
    console.log(`[${new Date().toISOString()}] отдал ${имя}, ${тело.length} байт`)
  } catch {
    res.writeHead(404, cors()).end('файл не найден')
  }
}).listen(порт, '127.0.0.1', () => {
  console.log(`Сборщик отдаётся на http://127.0.0.1:${порт}/masterwork-scrape.js`)
})

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  }
}