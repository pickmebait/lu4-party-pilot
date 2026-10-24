/**
 * Разовая миграция баз пати: кастеты занимают обе руки.
 *
 * Правило зависит от справочника, поэтому логика лежит в
 * src/lib/migrations.ts, а не дублируется здесь. Скрипт только читает файлы
 * пати, применяет ту же миграцию, что и приложение, и записывает обратно
 * лишь те базы, где действительно что-то изменилось.
 *
 * Данные не выбрасываются: вещь из левой руки уходит в казну, а в её журнал
 * пишется заточка, SA и редкий эффект. Повторный запуск ничего не меняет.
 *
 * Запуск:
 *   node scripts/migrate-fists.mjs --dry-run
 *   node scripts/migrate-fists.mjs
 */
import { build } from 'esbuild'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const сухой = process.argv.includes('--dry-run')
const сейчас = new Date().toISOString()

const папка = mkdtempSync(join(tmpdir(), 'кастеты-'))
const вход = join(папка, 'миграция.mts')
const выход = join(папка, 'миграция.mjs')
writeFileSync(
  вход,
  "export { fistIds, migrateFistHands } from '@/lib/migrations.ts'\n",
  'utf8',
)

try {
  await build({
    entryPoints: [вход],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    outfile: выход,
    logLevel: 'silent',
    alias: { '@': new URL('../src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') },
  })
  const { fistIds, migrateFistHands } = await import(pathToFileURL(выход).href)

  const каталог = JSON.parse(readFileSync('public/items.json', 'utf8'))
  const ids = fistIds(каталог.items)
  if (ids.size === 0) {
    console.error('В справочнике нет кастетов — миграция остановлена.')
    process.exit(1)
  }
  console.log(`Кастетов в справочнике: ${ids.size}`)

  const папкаБаз = 'data/parties'
  const файлы = readdirSync(папкаБаз).filter((f) => f.endsWith('.json'))
  if (файлы.length === 0) {
    console.log('Баз пати нет — мигрировать нечего.')
    process.exit(0)
  }

  let изменено = 0
  for (const файл of файлы) {
    const путь = join(папкаБаз, файл)
    const текст = readFileSync(путь, 'utf8')

    let партия
    try {
      партия = JSON.parse(текст)
    } catch (e) {
      console.error(`  ${файл}: не JSON, пропуск (${e.message})`)
      continue
    }
    if (!партия?.db?.warehouse || !Array.isArray(партия.db.chars)) {
      console.error(`  ${файл}: нет базы пати, пропуск`)
      continue
    }

    const итог = migrateFistHands(партия.db, ids, сейчас)
    if (!итог.changed) {
      console.log(`  ${файл}: без изменений`)
      continue
    }

    партия.db = { ...итог.db, updatedAt: сейчас, updatedBy: 'Миграция' }

    /*
     * Файлы в репозитории лежат с CRLF. JSON.stringify всегда отдаёт LF,
     * поэтому перевод строки возвращаем тот, который был: иначе вся база
     * попала бы в diff из-за одних окончаний строк.
     */
    const перевод = текст.includes('\r\n') ? '\r\n' : '\n'
    const новый = JSON.stringify(партия, null, 2).replace(/\n/g, перевод) + перевод

    if (!сухой) writeFileSync(путь, новый, 'utf8')
    изменено++
    const вКазну = итог.moved.length ? `, в казну: ${итог.moved.join(', ')}` : ''
    console.log(`  ${файл}: ${сухой ? 'будет исправлено' : 'исправлено'}${вКазну}`)
  }

  console.log(
    изменено === 0
      ? 'Изменений нет: все базы уже мигрированы.'
      : `${сухой ? 'Будет изменено' : 'Изменено'} баз: ${изменено}.`,
  )
} finally {
  rmSync(папка, { recursive: true, force: true })
}
