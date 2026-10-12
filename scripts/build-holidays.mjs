/*
 * Производственный календарь РФ из готового набора данных.
 *
 * Почему не isdayoff.ru напрямую: его API отдаёт 403 и не присылает
 * заголовков Access-Control-Allow-Origin, поэтому из браузера он не
 * доступен в принципе — ни при каком User-Agent. Проверено и curl, и
 * запросом с браузерными заголовками: ответ 403, тело пустое, CORS нет.
 *
 * Поэтому календарь кладётся в приложение файлом, а этот скрипт его
 * обновляет. Правительство переносит праздники ежегодно, так что запускать
 * его стоит раз в год, обычно в декабре, когда выходит постановление
 * о переносах на следующий год.
 *
 * Запуск: node scripts/build-holidays.mjs
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ИСТОЧНИК = 'https://raw.githubusercontent.com/d10xa/holidays-calendar/master/json/calendar.json'
const КУДА = 'src/lib/holidays-ru.json'

/** Дни недели: 0 — воскресенье. */
function деньНедели(iso) {
  return new Date(iso + 'T00:00:00Z').getUTCDay()
}
function выходной(iso) {
  const d = деньНедели(iso)
  return d === 0 || d === 6
}

async function забрать() {
  try {
    const ответ = await fetch(ИСТОЧНИК, {
      headers: { 'User-Agent': 'lu4-party-pilot' },
    })
    if (!ответ.ok) throw new Error('HTTP ' + ответ.status)
    return await ответ.json()
  } catch (ошибка) {
    // Сеть может лежать — откатываемся на прошлаю копию, лишь бы сборка не падала.
    if (existsSync(КУДА)) {
      console.warn('Не удалось обновить календарь:', ошибка.message)
      console.warn('Оставлен прежний', КУДА)
      return null
    }
    throw ошибка
  }
}

const сырой = await забрать()
if (!сырой) process.exit(0)

const годы = new Map()

function записать(iso, что) {
  const год = iso.slice(0, 4)
  if (!годы.has(год)) годы.set(год, { праздники: [], рабочие: [], сокращённые: [] })
  const запись = годы.get(год)
  // Внутри года храним только месяц и день: год и так задан ключом.
  const короткая = iso.slice(5)
  if (запись[что].includes(короткая)) return
  запись[что].push(короткая)
}

/*
 * В источнике holidays — это все нерабочие дни, включая выходные. Нам нужны
 * именно праздники, поэтому субботы и воскресенья выбрасываем: их и так
 * видно по календарю, а в списке праздников они бы только мешали.
 */
for (const iso of сырой.holidays ?? []) {
  if (выходной(iso)) continue
  записать(iso, 'праздники')
}
// Рабочие дни, попавшие на выходные, — «сокращённая» суббота или воскресенье.
for (const iso of сырой.nowork ?? []) {
  if (!выходной(iso)) continue
  записать(iso, 'рабочие')
}
for (const iso of сырой.preholidays ?? []) {
  if (выходной(iso)) continue
  записать(iso, 'сокращённые')
}

const выход = {}
for (const [год, запись] of [...годы.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))) {
  выход[год] = {
    праздники: запись.праздники.sort(),
    рабочие: запись.рабочие.sort(),
    сокращённые: запись.сокращённые.sort(),
  }
}

const файл = {
  /*
   * Откуда данные и когда обновлять. Вшито в файл, а не в комментарий,
   * потому что через год этот json будут читать, не помня, откуда он.
   */
  источник: 'd10xa/holidays-calendar (зеркало данных isdayoff.ru)',
  обновлено: new Date().toISOString().slice(0, 10),
  годы: выход,
}

writeFileSync(КУДА, JSON.stringify(файл, null, 1) + '\n', 'utf8')

let праздников = 0
for (const з of Object.values(выход)) праздников += з.праздники.length
console.log('Записано', КУДА)
console.log('  лет:', Object.keys(выход).length, '| праздничных дней:', праздников)
console.log('  годы:', Object.keys(выход).join(', '))
if (праздников < 100) {
  console.error('Мало праздников — похоже, источник отдался не тем. Файл лучше не публиковать.')
  process.exit(1)
}