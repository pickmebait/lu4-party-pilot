/**
 * Сторона сервера Const Party Pilot.
 *
 * Базы пати лежат файлами в GitHub-репозитории. Один файл на пати:
 *
 *   data/parties/<partyId>.json
 *
 * Токен GitHub хранится в секрете Worker'а и в браузер не попадает никогда.
 * Токены пати — случайные строки; сервер читает из них id пати и сверяет
 * секретную часть с хешем, который лежит в файле. Поэтому искать пати
 * приходится по прямому пути, а не перебором, а сами токены в репозитории
 * не хранятся — только их SHA-256.
 *
 * Два вида доступа:
 *
 *   Мастер-токен — один на пати, выдаётся при создании и при перевыпуске.
 *   Полные права, правит кого угодно, может выпускать и отзывать токены.
 *
 *   Токен персонажа — выпускается мастером на конкретного персонажа.
 *   Смотрит всё, правит только этого персонажа: проверка идёт на сервере,
 *   по всему документу целиком, а не по нажатой кнопке.
 */
export interface Env {
  /** Секрет: fine-grained токен с правом Contents: Read and write. */
  GITHUB_TOKEN?: string
  REPO_OWNER?: string
  REPO_NAME?: string
  REPO_BRANCH?: string
  /** Каталог с базами внутри репозитория. */
  DATA_DIR?: string
  /** С какого адреса разрешены запросы. Пусто = любой. */
  ALLOWED_ORIGIN?: string
}

/** Выпущенный токен персонажа. Сам токен в файле не лежит — только хеш. */
interface IssuedToken {
  /** Идентификатор записи в списке: по нему её отзывают. */
  id: string
  /** SHA-256 секретной части. */
  hash: string
  /** id персонажа, которому этот токен позволяет править. */
  charId: string
  /** Имя на момент выпуска: персонажа могли переименовать. */
  charName: string
  createdAt: string
}

interface PartyFile {
  partyId: string
  name: string
  createdAt: string
  /** SHA-256 секрета мастер-токена. */
  masterHash: string
  tokens: IssuedToken[]
  db: unknown
}

/**
 * Файл пати, прочитанный из репозитория.
 *
 * Поле tokenHash в нём больше не пишется, но в базах, созданных до
 * разделения на мастер-токен и токены персонажей, осталось — и именно в нём
 * лежит хеш того самого мастер-токена.
 */
interface StoredPartyFile extends Omit<PartyFile, 'masterHash'> {
  masterHash?: string
  /** Прежнее поле. Читается при миграции и больше не используется. */
  tokenHash?: string
}

const DEFAULT_OWNER = 'pickmebait'
const DEFAULT_REPO = 'lu4-party-pilot'
const DEFAULT_BRANCH = 'main'
const DEFAULT_DIR = 'data/parties'

/** Сколько секретных байт в токене: 20 байт = 160 бит, перебора не будет. */
const SECRET_BYTES = 20
const ID_BYTES = 8

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request, env)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

    try {
      const url = new URL(request.url)
      const путь = url.pathname

      if (путь === '/api/party') {
        if (request.method === 'POST') return await createParty(request, env, cors)
        if (request.method === 'DELETE') return await deleteParty(request, env, cors)
        return json({ error: 'Нужен POST или DELETE' }, 405, cors)
      }
      if (путь === '/api/session') {
        if (request.method === 'POST') return await openSession(request, env, cors)
        return json({ error: 'Нужен POST' }, 405, cors)
      }
      if (путь === '/api/party/data') {
        return request.method === 'PUT'
          ? await writeData(request, env, cors)
          : await readData(request, env, cors)
      }
      if (путь === '/api/party/meta') return await readMeta(request, env, cors)
      if (путь === '/api/party/name') return await renameParty(request, env, cors)
      if (путь === '/api/party/rotate') return await rotateMaster(request, env, cors)
      if (путь === '/api/party/tokens') {
        if (request.method === 'POST') return await issueToken(request, env, cors)
        if (request.method === 'DELETE') return await revokeToken(request, env, cors)
        return json({ error: 'Нужен POST или DELETE' }, 405, cors)
      }

      return json({ error: 'Неизвестный адрес' }, 404, cors)
    } catch (e) {
      /*
       * Лимит запросов GitHub — это не поломка сервера, а известное состояние:
       * лимит общий на токен и восстанавливается сам. Отвечаем 429 и говорим,
       * когда можно повторить. Клиент по этому ответу отступает, а не долбит
       * сохранение каждые полторы секунды, тратя остаток лимита.
       */
      if (e instanceof GitHubRateLimitError) {
        return json(
          { error: e.message, retryAfter: e.retryAfterSec, resetAt: e.resetAt },
          429,
          { ...cors, 'Retry-After': String(e.retryAfterSec) },
        )
      }
      return json({ error: e instanceof Error ? e.message : 'Внутренняя ошибка' }, 500, cors)
    }
  },
}

/* ------------------------------------------------------------- репозиторий */

interface RepoFile {
  sha: string
  data: PartyFile | null
}

function repo(env: Env) {
  return {
    owner: (env.REPO_OWNER || DEFAULT_OWNER).trim(),
    name: (env.REPO_NAME || DEFAULT_REPO).trim(),
    branch: (env.REPO_BRANCH || DEFAULT_BRANCH).trim(),
  }
}

function dir(env: Env): string {
  return (env.DATA_DIR || DEFAULT_DIR).trim().replace(/^\/+|\/+$/g, '')
}

function apiBase(env: Env): string {
  const r = repo(env)
  return `https://api.github.com/repos/${r.owner}/${r.name}/contents`
}

function filePath(env: Env, partyId: string): string {
  return `${dir(env)}/${partyId}.json`
}

/** Пауза перед повторной попыткой. */
function пауза(мс: number): Promise<void> {
  return new Promise((окончить) => setTimeout(окончить, мс))
}

/** Сколько ждём раздачи записанного, не дольше. */
const ЖДАТЬ_СВЕЖЕСТИ_МС = 4000

/**
 * Первая и последняя пауза между чтениями при ожидании свежести.
 *
 * Раньше здесь стояло 250 мс на каждое чтение: за четыре секунды ожидания
 * уходило до шестнадцати запросов к GitHub. Лимит общий на токен, и такая
 * проверка съедала его быстрее, чем сами записи. Первое чтение по-прежнему
 * раннее — обычная свежесть наступает за доли секунды, — а дальше пауза
 * растёт: если GitHub ещё не раздал новое, спешить всё равно некуда.
 */
const ПАУЗА_СВЕЖЕСТИ_МС = 250
const ПАУЗА_СВЕЖЕСТИ_ПРЕДЕЛ_МС = 1000

/**
 * Чем прерывать запрос к GitHub, если он завис.
 *
 * Восемь оказалось мало: GitHub изредка думает дольше и ронял запись с
 * «не ответил вовремя» на живом сервере. Пятнадцать — с запасом, и всё же
 * предел: без него один зависший запрос держал ответ открытым минутами.
 */
const ТАЙМАУТ_GITHUB_МС = 15_000

/**
 * Читает файл пати из репозитория. Отсутствие файла — это не ошибка.
 *
 * Содержимое приходит как base64 вместе с sha блоба. Именно sha и служит
 * признаком свежести: если чтение отдало прежнее содержимое, sha будет от
 * прежней записи.
 */
async function readFile(
  env: Env,
  partyId: string,
  таймаут = ТАЙМАУТ_GITHUB_МС,
): Promise<RepoFile | { error: string }> {
  const r = repo(env)
  const url = `${apiBase(env)}/${filePath(env, partyId)}?ref=${encodeURIComponent(r.branch)}`
  const res = await githubFetch(env, url, {}, таймаут)

  if (res.status === 404) return { sha: '', data: null }
  if (!res.ok) return { error: await describe(res) }

  const json = (await res.json()) as { sha?: string; content?: string }
  if (!json.sha || !json.content) return { sha: '', data: null }

  try {
    const raw = JSON.parse(decodeBase64(json.content)) as StoredPartyFile
    return { sha: json.sha, data: normalizeParty(raw, partyId) }
  } catch {
    return { error: 'Файл пати в репозитории повреждён: не читается JSON' }
  }
}

/**
 * Ждёт, пока репозиторий начнёт отдавать только что записанное содержимое.
 *
 * GitHub раздаёт ветку не мгновенно: сразу после записи чтение возвращает
 * прежний файл. На этом ломалось всё, что связано с выпуском токена, — на
 * выданный токен тут же отвечали «недействителен», и следующая же правка
 * упиралась в «в базе есть более свежая версия».
 *
 * Ждать дольше нескольких секунд нельзя: запись уже ушла на GitHub и не
 * сорвётся, а вот ответ клиенту, который висит, обрывает связь и заставляет
 * повторять — и повтор получает конфликт про собственную правку. Поэтому у
 * ожидания есть предел, а у каждого чтения — свой короткий таймаут.
 */
async function дождатьсяСвежести(env: Env, partyId: string, sha: string): Promise<void> {
  if (!sha) return
  const конец = Date.now() + ЖДАТЬ_СВЕЖЕСТИ_МС
  let паузаМс = ПАУЗА_СВЕЖЕСТИ_МС
  while (Date.now() < конец) {
    /*
     * Запись уже прошла, и если чтение упёрлось в лимит, ждать нечего:
     * данные в репозитории, а каждое следующее чтение только расходует
     * остаток лимита. Пусть клиент узнает о лимите из следующего запроса,
     * который и так случится не раньше сброса.
     */
    let чтение: RepoFile | { error: string }
    try {
      чтение = await readFile(env, partyId, 2000)
    } catch (e) {
      if (e instanceof GitHubRateLimitError) return
      throw e
    }
    if (!('error' in чтение) && чтение.sha === sha) return
    await пауза(паузаМс)
    паузаМс = Math.min(паузаМс * 2, ПАУЗА_СВЕЖЕСТИ_ПРЕДЕЛ_МС)
  }
}

/** Ждёт, пока файл действительно исчез. Тот же лаг, что и после записи. */
async function дождатьсяИсчезновения(env: Env, partyId: string): Promise<void> {
  const конец = Date.now() + ЖДАТЬ_СВЕЖЕСТИ_МС
  let паузаМс = ПАУЗА_СВЕЖЕСТИ_МС
  while (Date.now() < конец) {
    let чтение: RepoFile | { error: string }
    try {
      чтение = await readFile(env, partyId, 2000)
    } catch (e) {
      if (e instanceof GitHubRateLimitError) return
      throw e
    }
    if (!('error' in чтение) && чтение.data === null) return
    await пауза(паузаМс)
    паузаМс = Math.min(паузаМс * 2, ПАУЗА_СВЕЖЕСТИ_ПРЕДЕЛ_МС)
  }
}

/**
 * Приводит файл к нынешнему виду.
 *
 * Базы, созданные до появления токенов персонажей, лежат со старым полем
 * tokenHash — это как раз хеш мастер-токена, он и становится мастерским.
 * Миграция проходит при каждом чтении и однажды записывается вместе с
 * ближайшей правкой базы.
 */
function normalizeParty(raw: StoredPartyFile, partyId: string): PartyFile {
  const masterHash = typeof raw.masterHash === 'string' && raw.masterHash
    ? raw.masterHash
    : typeof raw.tokenHash === 'string' ? raw.tokenHash : ''
  return {
    partyId,
    name: typeof raw.name === 'string' ? raw.name : 'Моя пати',
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
    masterHash,
    tokens: Array.isArray(raw.tokens) ? raw.tokens.filter(isIssuedToken) : [],
    db: raw.db ?? emptyDb(new Date().toISOString()),
  }
}

function isIssuedToken(t: unknown): t is IssuedToken {
  if (!t || typeof t !== 'object') return false
  const v = t as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.hash === 'string' &&
    typeof v.charId === 'string' &&
    typeof v.createdAt === 'string'
  )
}

/** Пишет файл пати. Без sha GitHub отклонит — это защита от гонки. */
async function writeFile(
  env: Env,
  partyId: string,
  party: PartyFile,
  sha: string,
  message: string,
): Promise<{ ok: true; sha: string } | { error: string; conflict?: boolean }> {
  const r = repo(env)
  const body: Record<string, unknown> = {
    message,
    content: encodeBase64(`${JSON.stringify(party, null, 2)}\n`),
    branch: r.branch,
  }
  if (sha) body.sha = sha

  const res = await githubFetch(env, `${apiBase(env)}/${filePath(env, partyId)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })

  if (res.status === 409 || res.status === 422) {
    return { error: 'Файл в репозитории изменился прямо сейчас. Повтори сохранение.', conflict: true }
  }
  if (!res.ok) return { error: await describe(res) }

  const json = (await res.json()) as { content?: { sha?: string } }
  const shaОтвет = json.content?.sha ?? ''

  /*
   * Пока репозиторий не начал отдавать новое содержимое, читать базу рано:
   * всё, что спрашивают сразу после записи — право по только что выпущенному
   * токену, версия для проверки конфликта, — получит прежнее и откажет по
   * ошибке. Поэтому запись не считается законченной, пока чтение не
   * совпадёт с записанным.
   */
  await дождатьсяСвежести(env, partyId, shaОтвет)

  return { ok: true, sha: shaОтвет }
}

/** Удаляет файл пати. Файла нет — считаем, что уже удалён. */
async function deleteFile(
  env: Env,
  partyId: string,
  sha: string,
  message: string,
): Promise<{ ok: true } | { error: string }> {
  const r = repo(env)
  const res = await githubFetch(env, `${apiBase(env)}/${filePath(env, partyId)}`, {
    method: 'DELETE',
    body: JSON.stringify({ message, sha, branch: r.branch }),
    headers: { 'Content-Type': 'application/json' },
  })
  if (res.status === 404) {
    // Файла нет: удалять уже нечего, но и ждать нечего — он и так отсутствует.
    return { ok: true }
  }
  if (!res.ok) return { error: await describe(res) }
  await дождатьсяИсчезновения(env, partyId)
  return { ok: true }
}

/**
 * GitHub отказал по лимиту, а не по правам.
 *
 * Оба случая приходят с кодом 403, и по коду их не различить. Различают
 * заголовки: x-ratelimit-remaining: 0 — кончился часовой лимит, retry-after —
 * GitHub просит подождать (вторичный лимит). Текст ответа говорит о том же,
 * но на него одного полагаться нельзя: GitHub меняет формулировки.
 *
 * Отдельный класс нужен верхнему обработчику: по нему он отвечает 429 и
 * называет время, когда можно повторить. Клиент по этому ответу отступает,
 * вместо того чтобы повторять сохранение каждые полторы секунды.
 */
class GitHubRateLimitError extends Error {
  readonly retryAfterSec: number
  readonly resetAt: string | null

  constructor(retryAfterSec: number, resetAt: string | null, detail: string) {
    super(сообщениеОЛимите(retryAfterSec, resetAt, detail))
    this.name = 'GitHubRateLimitError'
    this.retryAfterSec = retryAfterSec
    this.resetAt = resetAt
  }
}

/**
 * Узнаёт лимит по ответу GitHub. Возвращает null, если это обычный отказ.
 *
 * detail передаётся, когда тело уже прочитано (describe). В githubFetch тело
 * не трогаем: там достаточно заголовков, а тело ещё пригодится вызывающему.
 */
function лимитGitHub(res: Response, detail = ''): GitHubRateLimitError | null {
  if (res.status !== 403 && res.status !== 429) return null

  const осталось = res.headers.get('x-ratelimit-remaining')
  const retryAfter = res.headers.get('retry-after')
  const reset = res.headers.get('x-ratelimit-reset')
  const поЗаголовкам = осталось === '0' || retryAfter !== null
  const поТексту = /rate limit|abuse detection/i.test(detail)
  if (!поЗаголовкам && !поТексту) return null

  const сейчас = Date.now()
  const сбросМс = reset ? Number(reset) * 1000 : NaN
  const естьСброс = Number.isFinite(сбросМс) && сбросМс > сейчас
  const поReset = естьСброс ? Math.ceil((сбросМс - сейчас) / 1000) : 0
  const поЗаголовку = retryAfter ? Math.max(0, Math.ceil(Number(retryAfter))) : 0

  return new GitHubRateLimitError(
    поReset || поЗаголовку || 60,
    естьСброс ? new Date(сбросМс).toISOString() : null,
    detail,
  )
}

function сообщениеОЛимите(секунд: number, resetAt: string | null, detail: string): string {
  const когда = resetAt
    ? `Лимит сбросится в ${utcЧчМм(resetAt)}, через ${длительность(секунд)}.`
    : `Повторить можно через ${длительность(секунд)}.`
  const ответGitHub = detail ? ` Ответ GitHub: ${detail.slice(0, 240)}` : ''
  return (
    'GitHub отказывает: сработал лимит запросов. ' +
    `${когда} Это ограничение GitHub, а не права токена — после сброса сохранение пройдёт само.` +
    ответGitHub
  )
}

function utcЧчМм(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'неизвестно когда'
  const ч = String(d.getUTCHours()).padStart(2, '0')
  const м = String(d.getUTCMinutes()).padStart(2, '0')
  return `${ч}:${м} UTC`
}

function длительность(секунд: number): string {
  const с = Math.max(1, Math.ceil(секунд))
  if (с < 90) return `${с} с`
  const мин = Math.ceil(с / 60)
  if (мин < 90) return `${мин} мин`
  const ч = Math.floor(мин / 60)
  const остаток = мин % 60
  return остаток ? `${ч} ч ${остаток} мин` : `${ч} ч`
}

async function githubFetch(
  env: Env,
  url: string,
  init: RequestInit = {},
  таймаут = ТАЙМАУТ_GITHUB_МС,
): Promise<Response> {
  if (!env.GITHUB_TOKEN?.trim()) throw new Error('На сервере не задан GITHUB_TOKEN')

  /*
   * Запрос к GitHub прерывается по своему времени.
   *
   * Без этого один зависший запрос держал запись открытой: замер показал
   * семьдесят секунд и оборванную связь вместо ответа. Связь рвётся у клиента,
   * он повторяет запрос и получает «в базе более свежая версия» про правку,
   * которую только что успешно сохранил.
   */
  const отмена = new AbortController()
  const будильник = setTimeout(() => отмена.abort(), таймаут)

  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    /*
     * Версия API зашита, а не берётся из заголовка по дате: GitHub отзывает
     * неподдерживаемые версии, и на 2022-11-02 перестал отвечать весь
     * сервер — ошибка приходила при любой записи в пати.
     *
     * Поддерживаются сейчас две: эта и 2026-03-10. Поддержка прежней
     * закончится, и напишем сюда новую, когда отключат и её.
     */
    'X-GitHub-Api-Version': '2022-11-28',
    /*
     * Просим GitHub не отдавать кэшированное содержимое: файл базы меняется
     * на каждой правке, и кэш по ветке здесь означает чтение не того, что
     * только что записали.
     */
    'Cache-Control': 'no-cache',
    'User-Agent': 'lu4-party-pilot',
    ...((init.headers as Record<string, string>) ?? {}),
  }

  try {
    const res = await fetch(url, { ...init, headers, signal: отмена.signal })
    /*
     * Лимит виден уже по заголовкам. Бросаем здесь, не читая тело: иначе
     * пришлось бы клонировать ответ, а вызывающему он уже не нужен — это
     * отказ, а не данные.
     */
    const лимит = лимитGitHub(res)
    if (лимит) throw лимит
    return res
  } catch (e) {
    // Обрыв по таймауту — это тоже сетевая ошибка, и о ней честнее сказать
    // прямо: «не дождались ответа», а не «GitHub ответил 500».
    if (отмена.signal.aborted) throw new Error('GitHub не ответил вовремя')
    throw e
  } finally {
    clearTimeout(будильник)
  }
}

async function describe(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  let detail = ''
  try {
    const json = JSON.parse(text)
    detail = json?.message ?? ''
  } catch {
    detail = text.slice(0, 200)
  }

  /*
   * Лимит бывает виден только в тексте: заголовки не всегда доходят, а
   * вторичный лимит GitHub умеет отдавать 403 без x-ratelimit-remaining.
   * Проверяем до подсказки о правах, иначе человеку советуют чинить токен,
   * который в порядке, и он ищет причину не там.
   */
  const лимит = лимитGitHub(res, detail)
  if (лимит) throw лимит

  const hint =
    res.status === 401 || res.status === 403
      ? ' Проверь токен сервера: у него должно быть право Contents: Read and write на этот репозиторий.'
      : res.status === 404
        ? ' Проверь, что репозиторий существует и имя указано верно.'
        : ''
  return `GitHub ответил ${res.status}${detail ? `: ${detail}` : ''}${hint}`
}

/* ------------------------------------------------------------------ токены */

function randToken(nbytes: number): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(nbytes))
  let bits = 0
  let value = 0
  let out = ''
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31]
  return out
}

function newPartyId(): string {
  return randToken(ID_BYTES).slice(0, 10)
}

type ParsedToken =
  | { partyId: string; kind: 'M' }
  | { partyId: string; kind: 'C'; charId: string }

/**
 * Мастер-токен: p2p_<id>_M_<секрет>
 * Токен персонажа: p2p_<id>_C_<idПерсонажа>_<секрет>
 *
 * Вид токена виден прямо в строке, поэтому приложение может показать, чем
 * именно вход, ещё до похода на сервер. Секретная часть всегда последняя и
 * всегда одинаковой длины — разбирать токен можно по фиксированным позициям,
 * а не гадая, где кончилось поле.
 */
function makeToken(partyId: string, kind: 'M' | 'C', charId = ''): string {
  const хвост = kind === 'C' ? `C_${charId}` : 'M'
  return `p2p_${partyId}_${хвост}_${randToken(SECRET_BYTES)}`
}

/**
 * Разбор токена.
 *
 * Кроме двух нынешних форм принимается прежняя — p2p_<id>_<секрет>. Так был
 * единственный токен на пати, и он у людей уже в телефонах и в переписке.
 * Форма прежняя мастерская: хеш секрета лежит в том же поле, что и раньше,
 * поэтому такой токен продолжает работать и после перехода.
 *
 * Сначала проверяются новые формы, потом прежняя: секрет нового токена
 * всегда длиннее, чем в прежнем формате, и формы не пересекаются.
 *
 * Идентификатор персонажа допускается от двух символов. Настоящие id длиннее
 * (время создания плюс случайная часть), но ограничение снизу нужно ровно
 * настолько, чтобы отсечь мусор, и не больше: токен, выпущенный на честный
 * короткий id, обязан работать.
 */
function parseToken(token: string): (ParsedToken & { secret: string }) | null {
  const s = token.trim()

  const m = s.match(/^p2p_([a-z0-9]{4,24})_M_([a-z0-9]{20,40})$/i)
  if (m) return { partyId: m[1], kind: 'M', secret: m[2] }

  const c = s.match(/^p2p_([a-z0-9]{4,24})_C_([a-z0-9]{2,32})_([a-z0-9]{20,40})$/i)
  if (c) return { partyId: c[1], kind: 'C', charId: c[2], secret: c[3] }

  const старый = s.match(/^p2p_([a-z0-9]{4,24})_([a-z0-9]{20,32})$/i)
  if (старый) return { partyId: старый[1], kind: 'M', secret: старый[2] }

  return null
}

function tokenSecret(token: string): string {
  const parts = token.split('_')
  return parts[parts.length - 1]
}

async function hashHex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Проверка доступа по файлу пати. Возвращает, чем именно вход. */
type Access =
  | { ok: true; partyId: string; file: PartyFile; sha: string; master: true; charId: null }
  | { ok: true; partyId: string; file: PartyFile; sha: string; master: false; charId: string }
  | { ok: false; error: string; status: number }

async function authorize(env: Env, request: Request): Promise<Access> {
  const denied = (error: string, status = 401): Access => ({ ok: false, error, status })

  const header = request.headers.get('Authorization') ?? ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  if (!token) return denied('Нет токена')

  const parsed = parseToken(token)
  if (!parsed) return denied('Токен недействителен')

  const file = await readFile(env, parsed.partyId)
  if ('error' in file) return denied(file.error, 502)
  if (!file.data) return denied('Токен не подходит. Проверь, что скопировал целиком.')

  const hash = await hashHex(parsed.secret)

  if (parsed.kind === 'M') {
    if (hash !== file.data.masterHash) return denied('Токен недействителен')
    return {
      ok: true,
      partyId: parsed.partyId,
      file: file.data,
      sha: file.sha,
      master: true,
      charId: null,
    }
  }

  const выпущен = file.data.tokens.find((t) => t.hash === hash)
  if (!выпущен) return denied('Токен недействителен: его отозвали или мастер выпустил новый.')
  if (выпущен.charId !== parsed.charId) return denied('Токен недействителен')

  return {
    ok: true,
    partyId: parsed.partyId,
    file: file.data,
    sha: file.sha,
    master: false,
    charId: parsed.charId,
  }
}

/** Только мастер. Остальным 403 — молча давать доступ к выдаче токенов нельзя. */
function требуетсяМастер(access: Access): access is Extract<Access, { ok: true }> {
  if (!access.ok) return false
  return access.master
}

/* -------------------------------------------------------------- обработчики */

/** Создаёт пати: новый файл в репозитории и мастер-токен, показываемый один раз. */
async function createParty(request: Request, env: Env, cors: Cors): Promise<Response> {
  const body = await readJson(request)
  const name = cleanName(body?.name)

  // Пробуем несколько раз: partyId короткий, collision возможен.
  for (let attempt = 0; attempt < 4; attempt++) {
    const partyId = newPartyId()
    const existing = await readFile(env, partyId)
    if ('error' in existing) return json({ error: existing.error }, 502, cors)
    if (existing.data) continue

    const token = makeToken(partyId, 'M')
    const now = new Date().toISOString()

    const party: PartyFile = {
      partyId,
      name,
      createdAt: now,
      masterHash: await hashHex(tokenSecret(token)),
      tokens: [],
      db: emptyDb(now),
    }

    const saved = await writeFile(env, partyId, party, '', `${name}: создана пати (${partyId})`)
    if ('error' in saved) {
      if (saved.conflict) continue
      return json({ error: saved.error }, 502, cors)
    }

    return json({ token, partyId, name, role: 'master' }, 200, cors)
  }

  return json({ error: 'Не удалось выбрать свободное имя пати, попробуй ещё раз' }, 503, cors)
}

/**
 * Удаляет пати целиком.
 *
 * Отдельная голая кнопка: файл пати удаляется из репозитория безвозвратно, и
 * вместе с ним уходят все персонажи, казна и расписание. Подтверждение с
 * тридцатисекундной паузой — на стороне интерфейса.
 */
async function deleteParty(request: Request, env: Env, cors: Cors): Promise<Response> {
  const access = await authorize(env, request)
  if (!access.ok) return json({ error: access.error }, access.status, cors)
  if (!требуетсяМастер(access)) {
    return json({ error: 'Удалить пати может только тот, у кого мастер-токен.' }, 403, cors)
  }

  const done = await deleteFile(
    env,
    access.partyId,
    access.sha,
    `${access.file.name}: пати удалена`,
  )
  if ('error' in done) return json({ error: done.error }, 502, cors)
  return json({ ok: true, partyId: access.partyId }, 200, cors)
}

/**
 * Переименование пати.
 *
 * Отдельная запись в файл, а не поле в базе: имя пати живёт в шапке файла и
 * показывается всем, кто вошёл, — от состава до токена персонажа. Правка
 * базы переписывала бы всю базу ради одной строки и заставила бы каждого
 * участника подтягивать копию из-за переименования.
 *
 * Имя пати в файле — не украшение: по нему пишется commit пати и ищется пати
 * в списке правок. Переименование правит и то, и другое, потому что запись
 * берёт новое имя.
 */
async function renameParty(request: Request, env: Env, cors: Cors): Promise<Response> {
  const access = await authorize(env, request)
  if (!access.ok) return json({ error: access.error }, access.status, cors)
  if (!требуетсяМастер(access)) {
    return json({ error: 'Переименовать пати может только тот, у кого мастер-токен.' }, 403, cors)
  }

  const body = await readJson(request)
  const имя = проверкаИмениПати(body?.name)
  if (!имя.ok) return json({ error: имя.error }, 400, cors)

  // Заодно отсекаем переименование в то же самое: лишняя запись в
  // репозитории ничего не меняет, а в истории правок выглядит как дело.
  if (имя.value === access.file.name) {
    return json({ ok: true, name: access.file.name }, 200, cors)
  }

  /*
   * Конфликт здесь почти никогда не о названии.
   *
   * Проверка идёт по отпечатку файла, а он сдвигается от любой чужой записи:
   * стоит кому-то из пати в это же время сохранить правку персонажа, и
   * отпечаток уже не тот. Переименование трогает одну строку в шапке и ничего в
   * базе, поэтому повтор ничего не теряет — а человек, назвавший пати в разгар
   * чужой работы, получил бы отказ и решил бы, что правка запрещена.
   *
   * Две попытки, а не цикл: третья означала бы, что пишет вся пати сразу, и
   * тогда верное место для отказа — уже человек.
   */
  let свежий = access
  for (let попытка = 0; попытка < 2; попытка++) {
    const party: PartyFile = { ...свежий.file, name: имя.value }
    const saved = await writeFile(
      env,
      свежий.partyId,
      party,
      свежий.sha,
      `${свежий.file.name} → ${имя.value}: переименована пати`,
    )
    if (!('error' in saved)) return json({ ok: true, name: имя.value }, 200, cors)
    if (!saved.conflict) return json({ error: saved.error }, 502, cors)

    const заново = await authorize(env, request)
    if (!заново.ok) return json({ error: заново.error }, заново.status, cors)
    if (!требуетсяМастер(заново)) {
      return json({ error: 'Права мастер-токена отозваны, пока переименовывали пати.' }, 403, cors)
    }
    // Пока шёл повтор, пати уже переименовали в это же имя — дело сделано.
    if (заново.file.name === имя.value) {
      return json({ ok: true, name: имя.value }, 200, cors)
    }
    свежий = заново
  }

  return json({ error: 'Файл пати меняют слишком часто, попробуй ещё раз', conflict: true }, 409, cors)
}

async function openSession(request: Request, env: Env, cors: Cors): Promise<Response> {
  const body = await readJson(request)
  const token = String(body?.token ?? '').trim()
  if (!token) return json({ error: 'Токен не указан' }, 400, cors)

  const parsed = parseToken(token)
  if (!parsed) return json({ error: 'Токен не подходит. Проверь, что скопировал целиком.' }, 401, cors)

  const file = await readFile(env, parsed.partyId)
  if ('error' in file) return json({ error: file.error }, 502, cors)
  if (!file.data) return json({ error: 'Токен не подходит. Проверь, что скопировал целиком.' }, 401, cors)

  const hash = await hashHex(parsed.secret)

  if (parsed.kind === 'M') {
    if (hash !== file.data.masterHash) {
      return json({ error: 'Токен не подходит. Проверь, что скопировал целиком.' }, 401, cors)
    }
    return json(
      {
        partyId: file.data.partyId,
        name: file.data.name,
        role: 'master',
        chars: countChars(file.data.db),
      },
      200,
      cors,
    )
  }

  const выпущен = file.data.tokens.find((t) => t.hash === hash)
  if (!выпущен || выпущен.charId !== parsed.charId) {
    return json(
      { error: 'Токен не подходит: его отозвали или мастер выпустил новый.' },
      401,
      cors,
    )
  }

  return json(
    {
      partyId: file.data.partyId,
      name: file.data.name,
      role: 'char',
      charId: parsed.charId,
      charName: charName(file.data.db, parsed.charId),
      chars: countChars(file.data.db),
    },
    200,
    cors,
  )
}

async function readData(request: Request, env: Env, cors: Cors): Promise<Response> {
  const access = await authorize(env, request)
  if (!access.ok) return json({ error: access.error }, access.status, cors)
  return json(access.file.db ?? emptyDb(new Date().toISOString()), 200, cors)
}

async function readMeta(request: Request, env: Env, cors: Cors): Promise<Response> {
  const access = await authorize(env, request)
  if (!access.ok) return json({ error: access.error }, access.status, cors)

  const db = access.file.db as { updatedAt?: string; updatedBy?: string }
  const тело: Record<string, unknown> = {
    name: access.file.name,
    partyId: access.file.partyId,
    createdAt: access.file.createdAt,
    role: access.master ? 'master' : 'char',
    ownCharId: access.charId,
    updatedAt: db?.updatedAt ?? null,
    updatedBy: db?.updatedBy ?? null,
    chars: countChars(access.file.db),
  }

  // Список выпущенных токенов видит только мастер: он их и выдаёт.
  if (access.master) {
    тело.tokens = access.file.tokens.map((t) => ({
      id: t.id,
      charId: t.charId,
      charName: charName(access.file.db, t.charId) ?? t.charName,
      createdAt: t.createdAt,
    }))
  }

  return json(тело, 200, cors)
}

async function writeData(request: Request, env: Env, cors: Cors): Promise<Response> {
  const access = await authorize(env, request)
  if (!access.ok) return json({ error: access.error }, access.status, cors)

  const body = await readJson(request)
  const incoming = body?.db
  if (!isDbLike(incoming)) return json({ error: 'Данные выглядят повреждёнными' }, 400, cors)

  const current = access.file.db as { updatedAt?: string }

  /*
   * Токен персонажа правит только своего персонажа.
   *
   * Проверяется весь документ целиком, а не отдельные поля: запретить легко,
   * пропустить легко, и список запрещённого однажды станет короче списка
   * добавленного. Сравнивается всё, кроме персонажа, которому токен
   * принадлежит, и служебных меток «кто и когда записал».
   *
   * Порядок персонажей в списке — это вид, а не данные: он меняется от
   * сортировки и не считается попыткой подменить чужого.
   */
  if (!access.master) {
    const было = неизменяемое(access.file.db, access.charId)
    const стало = неизменяемое(incoming, access.charId)
    if (было !== стало) {
      /*
       * Отказ отдаёт текущую базу.
       *
       * Почти всегда это не попытка подменить чужого, а обычная совместная
       * работа: человек правит своего персонажа, а у него в копии устарел
       * соседский, потому что сосед только что сохранился. Раньше такой
       * отказ был тупиком — сохранить нельзя было вообще, пока не нажмёшь
       * «Загрузить», а это теряло правку на середине работы.
       *
       * С базой в ответе клиент может взять её и подставить своего
       * персонажа — ровно то, что этому токену и разрешено.
       */
      return json(
        {
          error: 'В пати есть более свежая версия. Твои изменения подставлены в неё.',
          forbidden: true,
          db: access.file.db,
        },
        403,
        cors,
      )
    }
  }

  // Оптимистичная блокировка: если клиент правил поверх старой версии,
  // молча затирать чужое изменение нельзя.
  const base = body?.baseUpdatedAt
  if (typeof base === 'string' && current.updatedAt && current.updatedAt !== base) {
    /*
     * Повтор после обрыва связи.
     *
     * Связь с сервером рвётся уже после того, как запись сделана, и клиент
     * повторяет запрос. Без этой оговорки человек, нажавший «Сохранить» и
     * увидевший обрыв, получал бы «в базе более свежая версия» про собственное
     * только что сохранённое — и выбирал бы, какую из двух версий своих правок
     * оставить.
     *
     * Отличить повтор от настоящего спора можно только сравнением: если в базе
     * уже ровно то, что просят записать, запись состоялась, и повтор должен
     * её подтвердить, а не отвергнуть.
     */
    if (одноИТоЖе(incoming, access.file.db)) {
      return json({ ok: true, updatedAt: current.updatedAt }, 200, cors)
    }

    return json(
      {
        error: 'В базе есть более свежая версия. Сначала загрузи данные.',
        conflict: true,
        db: access.file.db,
      },
      409,
      cors,
    )
  }

  /*
   * Метку версии ставит сервер, а не клиент.
   *
   * Иначе версию определяет тот, кто её прислал, и две записи подряд из
   * одного клиента выглядели бы как одна и та же версия: следующая проверка
   * «не затер ли кто-то моё» прошла бы, хотя база уже другая.
   *
   * Метка обязана отличаться от прежней, поэтому при совпадении (две записи
   * в одну миллисекунду) она сдвигается вперёд.
   */
  const now = new Date().toISOString()
  const updatedAt = now > (current.updatedAt ?? '') ? now : bumpMs(current.updatedAt ?? now)

  const party: PartyFile = {
    ...access.file,
    db: { ...(incoming as object), updatedAt },
  }

  const who = party.db && typeof party.db === 'object' ? (party.db as { updatedBy?: string }).updatedBy : ''
  const saved = await writeFile(
    env,
    access.partyId,
    party,
    access.sha,
    `${who || 'без ника'}: обновил базу пати (${updatedAt.slice(0, 16).replace('T', ' ')})`,
  )
  if (!('error' in saved)) return json({ ok: true, updatedAt }, 200, cors)

  /*
   * Отказ по отпечатку — не обязательно чужое действие.
   *
   * Два одинаковых запроса, ушедших одновременно, читают файл до записи и
   * несут один отпечаток. Первый записывает, второй упирается в изменившийся
   * отпечаток и получает «файл изменился прямо сейчас» — хотя в базе ровно то,
   * что он сам и хотел положить. Воспроизводится в шести случаях из шести, и
   * человек, который правит пати в одиночку, видит «кто-то опередил».
   *
   * Прежде чем ругаться, перечитываем файл: если там уже наша база, запись
   * состоялась, и повтор должен её подтвердить. Отличаться могут только
   * метки — их сервер ставит сам, и в одноИТоЖе они не в счёт.
   */
  if (saved.conflict) {
    const заново = await authorize(env, request)
    if (заново.ok && одноИТоЖе(заново.file.db, incoming)) {
      return json(
        { ok: true, updatedAt: (заново.file.db as { updatedAt?: string }).updatedAt ?? updatedAt },
        200,
        cors,
      )
    }
  }

  return json({ error: saved.error, conflict: saved.conflict ?? false }, 409, cors)
}

/**
 * Новый мастер-токен. Все ранее выпущенные токены персонажей перестают
 * работать: держать в руках потерянный доступ нельзя, иначе старый мастер,
 * у которого токен увели, продолжил бы раздавать права.
 */
async function rotateMaster(request: Request, env: Env, cors: Cors): Promise<Response> {
  const access = await authorize(env, request)
  if (!access.ok) return json({ error: access.error }, access.status, cors)
  if (!требуетсяМастер(access)) {
    return json({ error: 'Перевыпустить мастер-токен может только мастер.' }, 403, cors)
  }

  const token = makeToken(access.partyId, 'M')
  const party: PartyFile = {
    ...access.file,
    masterHash: await hashHex(tokenSecret(token)),
    tokens: [],
  }

  const saved = await writeFile(
    env,
    access.partyId,
    party,
    access.sha,
    `${access.file.name}: перевыпущен мастер-токен, старые отозваны`,
  )
  if ('error' in saved) return json({ error: saved.error }, 409, cors)

  return json({ token, partyId: access.partyId, name: access.file.name }, 200, cors)
}

/**
 * Выпуск токена персонажа. На того же персонажа — перевыпуск: прежний
 * отзывается, новый показывается один раз.
 */
async function issueToken(request: Request, env: Env, cors: Cors): Promise<Response> {
  const access = await authorize(env, request)
  if (!access.ok) return json({ error: access.error }, access.status, cors)
  if (!требуетсяМастер(access)) {
    return json({ error: 'Выпустить токен может только мастер.' }, 403, cors)
  }

  const body = await readJson(request)
  const charId = String(body?.charId ?? '').trim()
  if (!charId) return json({ error: 'Персонаж не указан' }, 400, cors)

  const имя = charName(access.file.db, charId)
  if (!имя) return json({ error: 'Персонажа с таким id нет в пати' }, 404, cors)

  const token = makeToken(access.partyId, 'C', charId)
  const запись: IssuedToken = {
    id: randToken(6),
    hash: await hashHex(tokenSecret(token)),
    charId,
    charName: имя,
    createdAt: new Date().toISOString(),
  }

  const party: PartyFile = {
    ...access.file,
    // Перевыпуск на того же персонажа заменяет прежний, а не копится рядом.
    tokens: [...access.file.tokens.filter((t) => t.charId !== charId), запись],
  }

  const saved = await writeFile(
    env,
    access.partyId,
    party,
    access.sha,
    `${access.file.name}: выпущен токен для «${имя}»`,
  )
  if ('error' in saved) return json({ error: saved.error }, 409, cors)

  return json({ token, charId, charName: имя, id: запись.id }, 200, cors)
}

async function revokeToken(request: Request, env: Env, cors: Cors): Promise<Response> {
  const access = await authorize(env, request)
  if (!access.ok) return json({ error: access.error }, access.status, cors)
  if (!требуетсяМастер(access)) {
    return json({ error: 'Отозвать токен может только мастер.' }, 403, cors)
  }

  const id = new URL(request.url).searchParams.get('id') ?? ''
  if (!id) return json({ error: 'Токен не указан' }, 400, cors)
  if (!access.file.tokens.some((t) => t.id === id)) {
    return json({ error: 'Такого токена нет' }, 404, cors)
  }

  const party: PartyFile = {
    ...access.file,
    tokens: access.file.tokens.filter((t) => t.id !== id),
  }
  const saved = await writeFile(env, access.partyId, party, access.sha, `${access.file.name}: отозван токен`)
  if ('error' in saved) return json({ error: saved.error }, 409, cors)

  return json({ ok: true }, 200, cors)
}

/**
 * Обе базы несут одно и то же содержимое.
 *
 * Служебные метки «кто и когда записал» не в счёт: при повторе запроса они
 * те же, но при «сохранить без изменений» могут отличаться — и это всё равно
 * одна и та же база.
 */
function одноИТоЖе(a: unknown, b: unknown): boolean {
  const безМеток = (v: unknown) => {
    const копия = structuredClone(v) as Record<string, unknown>
    delete копия.updatedAt
    delete копия.updatedBy
    return JSON.stringify(копия)
  }
  try {
    return безМеток(a) === безМеток(b)
  } catch {
    return false
  }
}

/** Следующая миллисекунда после отметки — чтобы версия всегда двигалась вперёд. */
function bumpMs(iso: string): string {
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? new Date().toISOString() : new Date(t + 1).toISOString()
}

/* ------------------------------------------------------------------ помощники */

/**
 * Всё, что токен персонажа менять не должен, приведённое к строке.
 *
 * Свой персонаж вынимается и не сравнивается, служебные метки снимаются,
 * остальные персонажи сортируются по id — их порядок в списке это вид, а не
 * данные.
 *
 * Остальные персонажи сравниваются целиком, а не по одному идентификатору:
 * сверять только список id значило бы пропустить любую правку чужого
 * снаряжения, контактов или отсутствий.
 */
function неизменяемое(db: unknown, ownCharId: string): string {
  const d = structuredClone(db) as Record<string, unknown>
  delete d.updatedAt
  delete d.updatedBy
  if (Array.isArray(d.chars)) {
    d.chars = (d.chars as { id?: unknown }[])
      .filter((c) => c?.id !== ownCharId)
      .sort((a, b) => String(a?.id ?? '').localeCompare(String(b?.id ?? '')))
  }
  return JSON.stringify(d)
}

function charName(db: unknown, charId: string): string | null {
  if (!db || typeof db !== 'object') return null
  const chars = (db as { chars?: unknown }).chars
  if (!Array.isArray(chars)) return null
  const найден = chars.find((c) => (c as { id?: string })?.id === charId) as
    | { name?: string }
    | undefined
  return найден?.name?.trim() || null
}

function countChars(db: unknown): number {
  if (!db || typeof db !== 'object') return 0
  const chars = (db as { chars?: unknown }).chars
  return Array.isArray(chars) ? chars.length : 0
}

function emptyDb(now: string) {
  return {
    version: 1,
    updatedAt: now,
    updatedBy: '',
    chars: [],
    warehouse: { stacks: [], log: [] },
    goals: [],
    sets: [],
    customNames: {},
  }
}

/**
 * Похожа ли база на настоящую.
 *
 * Поле целей принимается в обеих формах: новое `goals`, где цель это список
 * предметов, и прежнее `wishes`, где цель была одним предметом. Требование
 * одного поля означало бы, что старая база перестала бы приниматься, а новая
 * перестала бы записываться — и человек, у которого в базе лежит его работа,
 * не смог бы её сохранить.
 *
 * Сервер сверяет документ целиком и не разбирает цели по частям: ему достаточно
 * убедиться, что это база, а не мусор.
 */
function isDbLike(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false
  const d = v as Record<string, unknown>
  const естьЦели = Array.isArray(d.goals) || Array.isArray(d.wishes)
  return (
    typeof d.updatedAt === 'string' &&
    Array.isArray(d.chars) &&
    !!d.warehouse &&
    typeof d.warehouse === 'object' &&
    Array.isArray((d.warehouse as Record<string, unknown>).stacks) &&
    естьЦели
  )
}

function cleanName(v: unknown): string {
  const s = typeof v === 'string' ? v.trim() : ''
  return s.slice(0, 40) || 'Моя пати'
}

/**
 * Имя пати при переименовании.
 *
 * Отдельная проверка, а не cleanName: при создании пустое имя тихо
 * становится «Моя пати», а при переименовании пати в «Моя пати» человек
 * думает, что назвал её, и потом удивляется, почему в шапке не то.
 * Пустое имя при переименовании — ошибка, а не замена.
 */
function проверкаИмениПати(v: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const s = typeof v === 'string' ? v.trim() : ''
  if (!s) return { ok: false, error: 'Название не может быть пустым' }
  if (s.length > 40) return { ok: false, error: 'Название длиннее 40 символов' }
  return { ok: true, value: s }
}

/**
 * Тело запроса может быть ужатым, и это не украшение, а необходимость.
 *
 * Проверено замером: тело запроса больше 33 000 байт до воркера не доходит
 * вовсе — соединение рвётся на девятнадцатой секунде, и никакое повторение не
 * помогает. Черта одна и та же по HTTP/1.1 и по HTTP/2, по чужому хосту тело
 * такого веса уходит без единой заминки, а значит и обойти её нельзя иначе,
 * как уменьшить само тело.
 *
 * База — это повторяющиеся поля игровых данных, и жмётся она в десять раз.
 * Полная пати на 24 персонажа — 23 килобайта, а по дороге два.
 *
 * Сжимается только передача. В репозиторий по-прежнему ложится обычный
 * читаемый JSON: файл остаётся страховкой, в которую можно заглянуть глазами.
 *
 * Старое тело принимается как раньше — на случай, пока у кого-то в кэше
 * лежит прежняя версия приложения.
 */
async function readJson(request: Request): Promise<any> {
  let тело: any
  try {
    тело = await request.json()
  } catch {
    return null
  }

  if (тело?.сжато !== true || typeof тело.данные !== 'string') return тело

  try {
    const сырое = decodeBase64ToBytes(тело.данные)
    const распакованный = new Blob([сырое]).stream().pipeThrough(new DecompressionStream('gzip'))
    return JSON.parse(await new Response(распакованный).text())
  } catch {
    /*
     * Не распаковалось — отвечаем отказом, а не падением: тело с таким
     * содержимым означает либо порчу на дороге, либо чужой клиент, и
     * продолжать с ним незачем.
     */
    return null
  }
}

function json(body: unknown, status: number, cors: Cors): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
  })
}

type Cors = Record<string, string>

function corsHeaders(request: Request, env: Env): Cors {
  const origin = request.headers.get('Origin') ?? ''
  const allowed = env.ALLOWED_ORIGIN?.trim()
  const value = allowed ? (origin === allowed ? origin : allowed) : '*'
  return {
    'Access-Control-Allow-Origin': value,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
  }
}

function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function decodeBase64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\n/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function decodeBase64(b64: string): string {
  return new TextDecoder().decode(decodeBase64ToBytes(b64))
}