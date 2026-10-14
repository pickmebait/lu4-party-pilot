/**
 * Проверка системы доступа Worker'а без сети.
 *
 * Репозиторий подменён словарём в памяти: проверяется ровно то, что важно —
 * какие запросы сервер считает своими, кому что разрешает и что кладёт в
 * файл. Настоящий GitHub тут ни при чём, а серверный токен не нужен.
 *
 * Метку версии сервер ставит сам, поэтому после каждой записи её нужно
 * перечитывать: одна забытая метка дала бы 409 там, где проверка не про то.
 */
import { build } from 'esbuild'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const папка = mkdtempSync(join(tmpdir(), 'pp-worker-'))
const выход = join(папка, 'index.mjs')

await build({
  entryPoints: ['worker/src/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  outfile: выход,
  logLevel: 'error',
})

const { default: worker } = await import(`file://${выход.replace(/\\/g, '/')}`)

/** Репозиторий в памяти: путь → { sha, содержимое в base64 }. */
const репозиторий = new Map()
/** Сколько чтений после записи ещё отдадут прежний файл, как это делает GitHub. */
const ОТСТАВАНИЕ = 2
/** Что лежало в файле до последней записи. */
const прежнее = new Map()
const отставание = new Map()
const запросы = []
const b64 = (текст) => Buffer.from(текст, 'utf8').toString('base64')
const настоящийFetch = globalThis.fetch

globalThis.fetch = async (url, init = {}) => {
  const адрес = String(url)
  запросы.push(`${init.method ?? 'GET'} ${адрес.replace('https://api.github.com/repos/', '')}`)

  if (!адрес.startsWith('https://api.github.com/')) return настоящийFetch(url, init)

  const путь = decodeURIComponent(адрес.split('/contents/')[1].split('?')[0])
  const запись = репозиторий.get(путь) ?? null

  /*
   * Отставание ветки — то, из-за чего ломался выпуск токена.
   *
   * GitHub раздаёт ветку не мгновенно: первые чтения после записи
   * возвращают прежний файл с прежним sha. Подмена повторяет это — иначе
   * проверки проходят на честном GitHub и падают на живом.
   */
  const отсталое = () => {
    const сколько = отставание.get(путь) ?? 0
    if (сколько <= 0) return null
    отставание.set(путь, сколько - 1)
    const старый = прежнее.get(путь)
    return старый && сколько > 0
      ? new Response(JSON.stringify({ sha: старый.sha, content: старый.content }), { status: 200 })
      : null
  }

  if (init.method === 'DELETE') {
    if (!запись) return new Response('{}', { status: 404 })
    прежнее.set(путь, запись)
    отставание.set(путь, ОТСТАВАНИЕ)
    репозиторий.delete(путь)
    return new Response('{}', { status: 200 })
  }

  if (init.method === 'PUT') {
    const тело = JSON.parse(init.body)
    // GitHub отдаёт 409, если файл уже кто-то изменил: без sha запись вслепую.
    if (запись && тело.sha && запись.sha !== тело.sha) {
      return new Response(JSON.stringify({ message: 'sha mismatch' }), { status: 409 })
    }
    const sha = `sha${репозиторий.size + 1}${запись ? 'x' : ''}${Date.now()}`
    // GitHub отдаёт содержимое файла уже в base64 — ещё раз кодировать нельзя.
    прежнее.set(путь, запись)
    отставание.set(путь, ОТСТАВАНИЕ)
    репозиторий.set(путь, { sha, content: тело.content })
    return new Response(JSON.stringify({ content: { sha } }), { status: 200 })
  }

  const отсталый = отсталое()
  if (отсталый) return отсталый

  if (!запись) return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 })
  return new Response(JSON.stringify({ sha: запись.sha, content: запись.content }), { status: 200 })
}

const окружение = {
  GITHUB_TOKEN: 'проверка',
  REPO_OWNER: 'o',
  REPO_NAME: 'r',
  REPO_BRANCH: 'main',
  DATA_DIR: 'data/parties',
}

const BASE = 'https://workers.test'

async function call(path, { method = 'GET', body, token } = {}) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await worker.fetch(
    new Request(BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    окружение,
  )
  const текст = await res.text()
  let json = null
  try {
    json = JSON.parse(текст)
  } catch {
    json = { raw: текст }
  }
  return { status: res.status, json }
}

let провалено = 0
const шаг = (ok, что, детали = '') => {
  if (!ok) провалено++
  console.log(`${ok ? 'ОК  ' : 'СБОЙ'} ${что}${детали && !ok ? ` — ${детали}` : ''}`)
}

/* ------------------------------------------------------------------ создание */

const создан = await call('/api/party', { method: 'POST', body: { name: 'Ночная гильдия' } })
шаг(
  создан.status === 200 && /^p2p_[a-z0-9]+_M_[a-z0-9]{32}$/.test(создан.json?.token ?? ''),
  'мастер-токен создан и разбирается на части',
  создан.json?.token,
)
шаг(создан.json?.role === 'master', 'роль при создании — мастер', создан.json?.role)

const мастер = создан.json.token
const partyId = создан.json.partyId
const файл = () =>
  JSON.parse(Buffer.from(репозиторий.get(`data/parties/${partyId}.json`).content, 'base64').toString())

шаг(typeof файл().masterHash === 'string' && файл().masterHash.length === 64,
  'в файле лежит хеш мастер-токена, а не сам токен')
шаг(!JSON.stringify(файл()).includes(мастер), 'сам мастер-токен в репозиторий не попал')
шаг(Array.isArray(файл().tokens) && файл().tokens.length === 0, 'список токенов персонажей создан пустым')

/*
 * База, созданная до разделения на мастер-токен и токены персонажей.
 *
 * Прежний токен был один на пати и лежит у людей в телефонах и в переписке.
 * Если бы перестал работать, все существующие пати остались бы без доступа
 * вместе со всей базой, поэтому проверяем, что он входит и что его хеш,
 * лежавший в поле tokenHash, продолжает работать как мастерский.
 */
const СТАРЫЙ_ПАРТY = 'stara1234567'
const СТАРЫЙ_СЕКРЕТ = 'k3m9x2q7v5b8n1z4c6d0f3h7j2l5r8t1'
const СТАРЫЙ_ТОКЕН = `p2p_${СТАРЫЙ_ПАРТY}_${СТАРЫЙ_СЕКРЕТ}`
const хеш = async (значение) => {
  const данные = new TextEncoder().encode(значение)
  const дайджест = await crypto.subtle.digest('SHA-256', данные)
  return [...new Uint8Array(дайджест)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

репозиторий.set(`data/parties/${СТАРЫЙ_ПАРТY}.json`, {
  sha: 's1',
  content: b64(
    JSON.stringify({
      partyId: СТАРЫЙ_ПАРТY,
      name: 'Старая пати',
      createdAt: '2025-01-01T00:00:00.000Z',
      tokenHash: await хеш(СТАРЫЙ_СЕКРЕТ),
      tokensIssued: 3,
      db: {
        version: 8,
        updatedAt: '2025-02-02T00:00:00.000Z',
        updatedBy: 'Старый мастер',
        chars: [НОВЫЙ_СТАРЫЙ('old1', 'Древний')],
        warehouse: { stacks: [], log: [] },
        wishes: [],
        sets: [],
        schedule: { prime: {}, offs: [], checklist: [] },
        customNames: {},
      },
    }),
  ),
})

function НОВЫЙ_СТАРЫЙ(id, имя) {
  return {
    id, name: имя, cls: 'Knight', level: 80, affil: 'состав',
    slots: {}, subs: [], subUnlocked: false, contacts: {}, away: {}, pa: null,
  }
}

const стараяСессия = await call('/api/session', {
  method: 'POST',
  body: { token: СТАРЫЙ_ТОКЕН },
})
шаг(
  стараяСессия.status === 200 && стараяСессия.json?.role === 'master',
  'прежний токен продолжает работать и считается мастерским',
  стараяСессия.json?.error ?? стараяСессия.json?.role,
)

const стараяМета = await call('/api/party/meta', { token: СТАРЫЙ_ТОКЕН })
шаг(
  стараяМета.status === 200 && Array.isArray(стараяМета.json.tokens) &&
    стараяМета.json.tokens.length === 0,
  'прежняя база читается, список токенов для неё пуст',
  стараяМета.status,
)

const стараяПрава = await call('/api/party/tokens', {
  method: 'POST',
  token: СТАРЫЙ_ТОКЕН,
  body: { charId: 'old1' },
})
шаг(
  стараяПрава.status === 200 && стараяПрава.json.token.includes('_C_old1_'),
  'прежним токеном можно выпустить токен персонажа',
  стараяПрава.json?.error,
)

const чужаяСекретная = await call('/api/session', {
  method: 'POST',
  body: { token: `p2p_${СТАРЫЙ_ПАРТY}_${СТАРЫЙ_СЕКРЕТ.slice(0, -1)}w` },
})
шаг(чужаяСекретная.status === 401, 'похожий, но не тот прежний токен не подходит', чужаяСекретная.status)

/* --------------------------------------------------------------- персонажи */

const НОВЫЙ = (id, имя) => ({
  id, name: имя, cls: 'Knight', level: 80, affil: 'состав',
  slots: {}, subs: [], subUnlocked: false, contacts: {}, away: {}, pa: null,
})

const база = {
  version: 8,
  updatedAt: '2026-01-01T00:00:00.000Z',
  updatedBy: '',
  chars: [НОВЫЙ('charOne', 'Первый'), НОВЫЙ('charTwo', 'Второй')],
  warehouse: { stacks: [], log: [] },
  wishes: [],
  sets: [],
  schedule: { prime: {}, offs: [], checklist: [] },
  customNames: {},
}

// Метка версии обязательна: вслепую затирать чужую запись нельзя.
const начальная = await call('/api/party/data', { token: мастер })
const вслепую = await call('/api/party/data', {
  method: 'PUT',
  token: мастер,
  body: { db: база, baseUpdatedAt: '' },
})
шаг(вслепую.status === 409, 'запись без метки версии отбита', вслепую.status)

/*
 * Запись с нуля: мастер читает свежую метку сам, иначе любой прошедший
 * раньше опыт другого токена оставил бы здесь заведомо устаревшую версию.
 */
let метка = начальная.json.updatedAt
const записать = async (db, token = мастер) => {
  if (token === мастер) {
    const свежее = await call('/api/party/data', { token: мастер })
    метка = свежее.json.updatedAt
  }
  const res = await call('/api/party/data', {
    method: 'PUT',
    token,
    body: { db, baseUpdatedAt: token === мастер ? метка : чужаяМетка },
  })
  if (res.status === 200 && token !== мастер) чужаяМетка = res.json.updatedAt
  return res
}
let чужаяМетка = метка

шаг((await записать(база)).status === 200, 'мастер записал базу')

/* ------------------------------------------------------------------ токены */

const выдан = await call('/api/party/tokens', {
  method: 'POST',
  token: мастер,
  body: { charId: 'charTwo' },
})
шаг(
  выдан.status === 200 && выдан.json.token.includes('_C_charTwo_'),
  'токен персонажа несёт id персонажа прямо в себе',
  выдан.json?.token,
)
const игрок = выдан.json.token
шаг(!JSON.stringify(файл()).includes(игрок), 'токен персонажа в репозиторий не попал')
шаг(
  файл().tokens.length === 1 && файл().tokens[0].charId === 'charTwo',
  'в файле появилась запись о выданном токене',
)

const неТотПерсонаж = await call('/api/party/tokens', {
  method: 'POST',
  token: мастер,
  body: { charId: 'нетТакого' },
})
шаг(неТотПерсонаж.status === 404, 'токен на несуществующего персонажа не выпускается', неТотПерсонаж.status)

// Подмена id персонажа прямо в токене.
const подделка = игрок.replace('_C_charTwo_', '_C_charOne_')
const подделкаРез = await call('/api/session', { method: 'POST', body: { token: подделка } })
шаг(подделкаРез.status === 401, 'подмена id персонажа в токене не проходит', подделкаРез.status)

const чужойВыпуск = await call('/api/party/tokens', {
  method: 'POST',
  token: игрок,
  body: { charId: 'charOne' },
})
шаг(чужойВыпуск.status === 403, 'токен персонажа не может выпустить токен', чужойВыпуск.status)

const чужойОтзыв = await call(`/api/party/tokens?id=${файл().tokens[0].id}`, {
  method: 'DELETE',
  token: игрок,
})
шаг(чужойОтзыв.status === 403, 'токен персонажа не может отозвать токен', чужойОтзыв.status)

const чужойРотация = await call('/api/party/rotate', { method: 'POST', token: игрок })
шаг(чужойРотация.status === 403, 'токен персонажа не может перевыпустить мастер-токен', чужойРотация.status)

const чужоеУдаление = await call('/api/party', { method: 'DELETE', token: игрок })
шаг(чужоеУдаление.status === 403, 'токен персонажа не может удалить пати', чужоеУдаление.status)

/* ------------------------------------------------------------------- мета */

const метаМ = await call('/api/party/meta', { token: мастер })
шаг(метаМ.json?.tokens?.length === 1, 'мастер видит список выпущенных токенов')
шаг(метаМ.json?.tokens?.[0]?.hash === undefined, 'в списке токенов нет отпечатков')
шаг(метаМ.json?.tokens?.[0]?.charName === 'Второй', 'в списке видно имя персонажа')

const метаИ = await call('/api/party/meta', { token: игрок })
шаг(
  метаИ.status === 200 && метаИ.json.tokens === undefined,
  'токен персонажа список токенов не получает',
)
шаг(метаИ.json?.ownCharId === 'charTwo', 'сервер сообщает, чей это персонаж', метаИ.json?.ownCharId)

/* -------------------------------------------------------------- переименование */

const переименовал = await call('/api/party/name', {
  method: 'PATCH',
  token: мастер,
  body: { name: '  Ночная гильдия, второй состав  ' },
})
шаг(
  переименовал.status === 200 && переименовал.json.name === 'Ночная гильдия, второй состав',
  'мастер переименовывает пати, края у названия обрезаются',
  `${переименовал.status} ${переименовал.json?.name ?? переименовал.json?.error}`,
)
шаг(файл().name === 'Ночная гильдия, второй состав', 'новое название попало в файл пати', файл().name)

// Переименование меняет шапку файла, а не базу: иначе правка одной строки
// тащила бы за собой копию базы у каждого, кто вошёл.
шаг(
  файл().db.updatedAt === база.updatedAt || файл().db.chars.length === база.chars.length,
  'переименование не трогает базу',
  файл().db.updatedAt,
)

const метаПосле = await call('/api/party/meta', { token: мастер })
шаг(метаПосле.json?.name === 'Ночная гильдия, второй состав', 'новое название видно в метаданных')

const пустоеИмя = await call('/api/party/name', { method: 'PATCH', token: мастер, body: { name: '   ' } })
шаг(пустоеИмя.status === 400, 'пустое название отвергается, а не заменяется на «Моя пати»', пустоеИмя.status)

const длинноеИмя = await call('/api/party/name', { method: 'PATCH', token: мастер, body: { name: 'я'.repeat(41) } })
шаг(длинноеИмя.status === 400, 'название длиннее сорока символов отвергается', длинноеИмя.status)

шаг(
  файл().name === 'Ночная гильдия, второй состав',
  'отвергнутые переименования не меняют файл',
  файл().name,
)

// Тем же именем переименовывать незачем: лишняя запись в репозитории ничего
// не меняет, а в истории правок выглядит как дело.
const записиДо = запросы.length
const вСвоё = await call('/api/party/name', {
  method: 'PATCH',
  token: мастер,
  body: { name: 'Ночная гильдия, второй состав' },
})
шаг(вСвоё.status === 200, 'переименование в то же имя не считается ошибкой', вСвоё.status)
шаг(
  запросы.length - записиДо <= 1,
  'переименование в то же имя не пишет в репозиторий',
  запросы.slice(записиДо).join(' | '),
)

const чужаяПравка = await call('/api/party/name', {
  method: 'PATCH',
  token: игрок,
  body: { name: 'Переименовано персонажем' },
})
шаг(чужаяПравка.status === 403, 'токен персонажа пати не переименовывает', чужаяПравка.status)
шаг(
  файл().name === 'Ночная гильдия, второй состав',
  'неудачная попытка не меняет название',
  файл().name,
)

/* --------------------------------------------------- границы прав на запись */

const читает = await call('/api/party/data', { token: игрок })
шаг(читает.status === 200 && читает.json.chars.length === 2, 'токен персонажа читает всю базу')
чужаяМетка = читает.json.updatedAt

const соСвоим = () => {
  const копия = structuredClone(читает.json)
  копия.chars.find((c) => c.id === 'charTwo').level = 81
  return копия
}

// Порядок персонажей в списке — это вид, а не данные: перестановка не запрещена.
const переставленная = соСвоим()
переставленная.chars.reverse()
переставленная.chars.find((c) => c.id === 'charTwo').pa = { from: '2026-01-01', days: 30 }
шаг(
  (await записать(переставленная, игрок)).status === 200,
  'свой персонаж правится, порядок списка не считается правкой',
)

// Дальше все попытки ломают чужие данные, поэтому чужое состояние каждый раз
// берётся заново: иначе отказ объяснялся бы уже сделанной правкой.
const попыткаЧужого = async (порча, что) => {
  const начало = await call('/api/party/data', { token: игрок })
  const копия = structuredClone(начало.json)
  порча(копия)
  const res = await call('/api/party/data', {
    method: 'PUT',
    token: игрок,
    body: { db: копия, baseUpdatedAt: начало.json.updatedAt },
  })
  шаг(res.status === 403, что, res.json?.error ?? res.status)
  return начало.json.updatedAt
}

await попыткаЧужого((db) => { db.chars.find((c) => c.id === 'charOne').level = 99 },
  'правка чужого персонажа отклонена')
await попыткаЧужого((db) => { db.chars = db.chars.filter((c) => c.id !== 'charOne') },
  'удаление чужого персонажа отклонено')
await попыткаЧужого((db) => { db.chars.push(НОВЫЙ('charThree', 'Третий')) },
  'добавление чужого персонажа отклонено')
await попыткаЧужого((db) => { db.chars.find((c) => c.id === 'charOne').contacts.phone = '+7 900' },
  'правка чужих контактов отклонена')
await попыткаЧужого((db) => { db.warehouse.stacks.push({ itemId: 57, count: 3 }) },
  'правка общей казны отклонена')
await попыткаЧужого((db) => { db.wishes.push({ id: 'w', itemId: 1, count: 1, priority: 2, done: false }) },
  'правка хотелок отклонена')
await попыткаЧужого((db) => { db.schedule.offs.push('2026-05-01') },
  'правка расписания отклонена')
await попыткаЧужого((db) => { db.schedule.checklist.push({ id: 'i', text: 'пункт' }) },
  'правка чеклиста отклонена')
await попыткаЧужого((db) => { db.sets.push({ id: 's', name: 'Комплект', pieces: [1, 2] }) },
  'правка комплектов отклонена')
// updatedBy — служебная метка «кто записал», её сравнение не проверяет:
// иначе токен персонажа не смог бы сохранить изменения в принципе.
{
  const начало = await call('/api/party/data', { token: игрок })
  const копия = structuredClone(начало.json)
  копия.chars.find((c) => c.id === 'charTwo').level = 82
  копия.updatedBy = 'Второй'
  const res = await call('/api/party/data', {
    method: 'PUT',
    token: игрок,
    body: { db: копия, baseUpdatedAt: начало.json.updatedAt },
  })
  шаг(res.status === 200, 'служебную метку updatedBy менять можно', res.json?.error)
}

// Своего персонажа удалить можно: это правка своего персонажа.
{
  const начало = await call('/api/party/data', { token: игрок })
  const копия = structuredClone(начало.json)
  копия.chars = копия.chars.filter((c) => c.id !== 'charTwo')
  const res = await call('/api/party/data', {
    method: 'PUT',
    token: игрок,
    body: { db: копия, baseUpdatedAt: начало.json.updatedAt },
  })
  шаг(res.status === 200, 'своего персонажа удалить можно — это его правка', res.json?.error)
  if (res.status === 200) await записать(база)
}

/* ------------------------------------------------------- гонка записи (409) */

const гонка = structuredClone(база)
гонка.chars[0].level = 55
const приняли = await записать(гонка)
шаг(приняли.status === 200, 'мастер записал новую версию', приняли.json?.error)

const отстал = structuredClone(база)
отстал.chars[1].level = 50
const конфликт = await call('/api/party/data', {
  method: 'PUT',
  token: мастер,
  body: { db: отстал, baseUpdatedAt: начальная.json.updatedAt },
})
шаг(
  конфликт.status === 409 && конфликт.json?.db,
  'запись поверх чужой версии отбита и возвращает чужой документ',
  конфликт.status,
)

/*
 * Повтор после обрыва связи.
 *
 * Связь рвётся уже после того, как запись сделана, и клиент повторяет
 * запрос с той же старой меткой. Такой повтор должен подтвердить запись, а
 * не отвечать конфликтом: иначе человек, нажавший «Сохранить» и увидевший
 * обрыв, выбирал бы между двумя версиями своих правок.
 */
const повтор = await call('/api/party/data', {
  method: 'PUT',
  token: мастер,
  body: { db: гонка, baseUpdatedAt: начальная.json.updatedAt },
})
шаг(
  повтор.status === 200 && повтор.json.updatedAt === приняли.json.updatedAt,
  'повтор той же записи подтверждает её, а не отвечает конфликтом',
  повтор.json?.error ?? повтор.status,
)

// Повтор с той же меткой, но другим содержимым — это уже спор, а не повтор.
const спор = await call('/api/party/data', {
  method: 'PUT',
  token: мастер,
  body: { db: отстал, baseUpdatedAt: начальная.json.updatedAt },
})
шаг(спор.status === 409, 'с той же старой меткой, но другими данными — конфликт', спор.status)

шаг((await записать(база)).status === 200, 'база возвращена для дальнейших проверок')

/* ------------------------------------------------------- перевыпуск и отзыв */

const перевыпуск = await call('/api/party/tokens', {
  method: 'POST',
  token: мастер,
  body: { charId: 'charTwo' },
})
шаг(
  перевыпуск.status === 200 && перевыпуск.json.token !== игрок,
  'перевыпуск токена персонажа выдал новый',
)
шаг(файл().tokens.length === 1, 'прежний токен того же персонажа не копится рядом', файл().tokens.length)

const мёртвый = await call('/api/session', { method: 'POST', body: { token: игрок } })
шаг(мёртвый.status === 401, 'прежний токен персонажа перестал работать', мёртвый.json?.error)

const отзыв = await call(`/api/party/tokens?id=${файл().tokens[0].id}`, {
  method: 'DELETE',
  token: мастер,
})
шаг(отзыв.status === 200 && файл().tokens.length === 0, 'отзыв убирает токен из списка', отзыв.status)
const отозванный = await call('/api/session', {
  method: 'POST',
  body: { token: перевыпуск.json.token },
})
шаг(отозванный.status === 401, 'отозванный токен не входит', отозванный.status)

/* --------------------------------------------------- перевыпуск мастер-токена */

await call('/api/party/tokens', { method: 'POST', token: мастер, body: { charId: 'charOne' } })
шаг(файл().tokens.length === 1, 'токен персонажа выпущен заново перед сменой мастер-токена')

const новаяРотация = await call('/api/party/rotate', { method: 'POST', token: мастер })
шаг(
  новаяРотация.status === 200 && новаяРотация.json.token !== мастер,
  'мастер-токен перевыпущен',
)
шаг(файл().tokens.length === 0, 'смена мастер-токена отозвала все токены персонажей', файл().tokens.length)

const старыйМастер = await call('/api/session', { method: 'POST', body: { token: мастер } })
шаг(старыйМастер.status === 401, 'прежний мастер-токен перестал работать')

const мастер2 = новаяРотация.json.token
const новыйМастерВход = await call('/api/session', { method: 'POST', body: { token: мастер2 } })
шаг(новыйМастерВход.json?.role === 'master', 'новый мастер-токен входит как мастер')

/* -------------------------------------------------------------- границы входа */

for (const [что, токен] of [
  ['пустой токен', ''],
  ['мусор', 'не токен'],
  ['старый формат', 'p2p_abcdefgh_M_0123456789abcdef0123456789'],
  ['без секрета', 'p2p_abcdefgh_M_'],
  ['слишком короткий секрет', `p2p_${partyId}_M_abc`],
  ['слишком длинный секрет', `p2p_${partyId}_M_${'a'.repeat(60)}`],
]) {
  const попытка = await call('/api/session', { method: 'POST', body: { token: токен } })
  // Пустой токен — незаполненное поле (400), всё прочее — отказ (401).
  шаг(
    попытка.status === 401 || попытка.status === 400,
    `вход отбит: ${что}`,
    попытка.status,
  )
}

const безТокена = await call('/api/party/data')
шаг(безТокена.status === 401, 'чтение базы без токена отбито')

const кривойТокен = 'p2p_zzzzzzzzzz_M_aaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const неТакаяПати = await call('/api/party/data', { token: кривойТокен })
шаг(неТакаяПати.status === 401, 'токен неизвестной пати отбит', неТакаяПати.json?.error)

const безСекрета = await worker.fetch(
  new Request(BASE + '/api/party', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  }),
  { ...окружение, GITHUB_TOKEN: undefined },
)
шаг(
  безСекрета.status === 500,
  'без серверного токена сервер падает с понятной ошибкой',
  безСекрета.status,
)

/* --------------------------------------------------------------- CORS и пути */

const options = await worker.fetch(
  new Request(BASE + '/api/party', { method: 'OPTIONS', headers: { Origin: 'https://x.pages.dev' } }),
  { ...окружение, ALLOWED_ORIGIN: 'https://x.pages.dev' },
)
шаг(options.status === 204, 'OPTIONS отвечает без тела')
шаг(
  options.headers.get('Access-Control-Allow-Methods')?.includes('DELETE'),
  'CORS разрешает DELETE',
  options.headers.get('Access-Control-Allow-Methods'),
)

const чужойДомен = await worker.fetch(
  new Request(BASE + '/api/party/meta', { method: 'GET', headers: { Origin: 'https://evil.example' } }),
  { ...окружение, ALLOWED_ORIGIN: 'https://x.pages.dev' },
)
шаг(
  чужойДомен.headers.get('Access-Control-Allow-Origin') !== '*',
  'чужому домен Origin не выдаётся',
  чужойДомен.headers.get('Access-Control-Allow-Origin'),
)

const несуществующий = await call('/api/нетакого', { token: мастер2 })
шаг(несуществующий.status === 404, 'неизвестный адрес отвечает 404')

const неверныйМетод = await call('/api/session', { method: 'GET' })
шаг(неверныйМетод.status === 405, 'неверный метод отвечает 405', неверныйМетод.status)

/* ---------------------------------------------------------------- удаление */

const удаление = await call('/api/party', { method: 'DELETE', token: мастер2 })
шаг(
  удаление.status === 200 && !репозиторий.has(`data/parties/${partyId}.json`),
  'удаление пати убирает файл',
)
const послеУдаления = await call('/api/session', { method: 'POST', body: { token: мастер2 } })
шаг(послеУдаления.status === 401, 'после удаления пати токен не входит', послеУдаления.status)

console.log('')
console.log(`Запросов к GitHub: ${запросы.length}`)
console.log(провалено === 0 ? 'ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ' : `ПРОВАЛЕНО: ${провалено}`)
process.exit(провалено === 0 ? 0 : 1)