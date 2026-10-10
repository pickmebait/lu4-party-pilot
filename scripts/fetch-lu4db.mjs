#!/usr/bin/env node
/**
 * Собирает справочник предметов и иконки с lu4db.ru.
 *
 * Источник: GET https://lu4db.ru/api/craft-market/data — один JSON, в котором
 * лежит весь каталог предметов рынка: названия, грейды, слоты, типы,
 * принадлежность к сету, бонусы, характеристики и пути к иконкам.
 *
 * Иконки скачиваются к нам, а не подключаются горячей ссылкой: сайт должен
 * работать, даже если lu4db.ru лежит или закроет доступ. Всего около 3 МБ.
 *
 * Запуск:
 *   node scripts/fetch-lu4db.mjs
 *   node scripts/fetch-lu4db.mjs --no-icons   # без скачивания картинок
 *
 * Числовой id предмета — порядковый номер в отсортированном каталоге.
 * Он меняется, если источник обновится и появятся новые предметы, поэтому
 * после пересборки базу пати стоит наполнять заново.
 */
import { mkdirSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const API = 'https://lu4db.ru/api/craft-market/data'
const CDN = 'https://lu4db.ru'
const ICONS_DIR = 'public/icons'
const OUT = 'public/items.json'

const WANT_ICONS = !process.argv.includes('--no-icons')
// Небольшая вежливость: не заваливаем сайт и не ловим блокировку.
const CONCURRENCY = 8
const BATCH_PAUSE_MS = 120

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

/** Грейды источника переводим в числа: на них завязана вёрстка карточек. */
const GRADE_NUM = { S: 16, A: 14, B: 12, C: 9, D: 7, NG: 0 }

function die(msg) {
  console.error(`Ошибка: ${msg}`)
  process.exit(1)
}

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) die(`источник ответил ${res.status} (${url})`)
  return res.json()
}

async function getBinary(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  console.log('Забираю каталог с lu4db.ru…')
  const data = await getJson(API)
  const source = Object.values(data.itemCatalog?.items ?? {})
  if (source.length === 0) die('в ответе нет предметов — структура источника изменилась?')
  console.log(`  предметов в источнике: ${source.length}`)

  // Порядок id фиксируем сортировкой по техническому имени: тогда id
  // пересобираются одинаково при каждом запуске.
  source.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const iconFiles = new Set()
  const items = source.map((it, index) => {
    // id с единицы: ноль у нас означает «пусто».
    const id = index + 1

    if (it.icon) iconFiles.add(it.icon)
    let aliases = []
    if (Array.isArray(it.aliases)) {
      aliases = it.aliases
    } else if (it.aliases && typeof it.aliases === 'object') {
      for (const [aliasName, variant] of Object.entries(it.aliases)) {
        if (variant?.icon) iconFiles.add(variant.icon)
        aliases.push(aliasName)
      }
    }

    const bonus =
      it.setBonus ??
      (Array.isArray(it.setBonuses) && it.setBonuses.length ? it.setBonuses.join('; ') : undefined)

    return {
      id,
      name: it.name,
      tex: it.id,
      ...(it.grade ? { grade: GRADE_NUM[it.grade] ?? 0 } : {}),
      ...(it.icon ? { icon: localIcon(it.icon) } : {}),
      ...(it.kind ? { kind: it.kind } : {}),
      ...(it.slot ? { slot: it.slot } : {}),
      ...(it.equipmentType ? { type: it.equipmentType } : {}),
      ...(it.setName ? { set: it.setName } : {}),
      ...(bonus ? { bonus } : {}),
      ...(typeof it.mDef === 'number' ? { mDef: it.mDef } : {}),
      ...(typeof it.wiki?.physDef === 'number' ? { physDef: it.wiki.physDef } : {}),
      ...(aliases.length ? { aliases } : {}),
    }
  })

  const withIcons = items.filter((i) => i.icon).length
  console.log(`  с иконками: ${withIcons} из ${items.length}`)
  console.log(`  уникальных иконок: ${iconFiles.size}`)

  if (WANT_ICONS) await downloadIcons(iconFiles)

  const catalog = {
    generatedAt: new Date().toISOString(),
    source: `lu4db.ru (${data.itemCatalog?.generatedAt ?? '?'})`,
    items,
  }
  writeFileSync(OUT, `${JSON.stringify(catalog)}\n`, 'utf8')
  const size = statSync(OUT).size
  console.log(`\nГотово: ${OUT} (${items.length} предметов, ${Math.round(size / 1024)} КБ)`)
}

/** Путь вида /media/site/img/foo.webp -> icons/foo.webp — так он будет отдан с сайта. */
function localIcon(path) {
  return `icons/${path.split('/').pop()}`
}

/** Куда физически писать файл на диске. */
function iconFile(path) {
  return join(ICONS_DIR, path.split('/').pop())
}

async function downloadIcons(paths) {
  if (!existsSync(ICONS_DIR)) mkdirSync(ICONS_DIR, { recursive: true })
  const already = new Set(
    readdirSync(ICONS_DIR).map((f) => `/media/site/img/${f}`),
  )

  const todo = [...paths].filter((p) => !already.has(p))
  console.log(`\nСкачиваю иконки: ${todo.length} (уже есть ${already.size})`)

  let done = 0
  let failed = 0
  let bytes = 0

  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const batch = todo.slice(i, i + CONCURRENCY)
    await Promise.all(
      batch.map(async (p) => {
        try {
          const buf = await getBinary(CDN + p)
          writeFileSync(iconFile(p), buf)
          bytes += buf.length
        } catch (e) {
          failed++
          if (failed <= 5) console.warn(`  не скачалась ${p}: ${e.message}`)
        } finally {
          done++
        }
      }),
    )
    if (done % 200 < CONCURRENCY) {
      process.stdout.write(`  ${done} из ${todo.length}\r`)
    }
    if (i + CONCURRENCY < todo.length) await sleep(BATCH_PAUSE_MS)
  }

  process.stdout.write('\n')
  console.log(
    `  скачано ${done - failed} шт., ${Math.round(bytes / 1024)} КБ` +
      (failed ? `, не удалось ${failed}` : ''),
  )
}

await main()