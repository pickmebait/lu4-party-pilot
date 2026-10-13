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
      if (путь === '/api/party/rotate') return await rotateMaster(request, env, cors)
      if (путь === '/api/party/tokens') {
        if (request.method === 'POST') return await issueToken(request, env, cors)
        if (request.method === 'DELETE') return await revokeToken(request, env, cors)
        return json({ error: 'Нужен POST или DELETE' }, 405, cors)
      }

      return json({ error: 'Неизвестный адрес' }, 404, cors)
    } catch (e) {
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

/** Читает файл пати из репозитория. Отсутствие файла — это не ошибка. */
async function readFile(env: Env, partyId: string): Promise<RepoFile | { error: string }> {
  const r = repo(env)
  const url = `${apiBase(env)}/${filePath(env, partyId)}?ref=${encodeURIComponent(r.branch)}`
  const res = await githubFetch(env, url)

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
  return { ok: true, sha: json.content?.sha ?? '' }
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
  if (res.status === 404) return { ok: true }
  if (!res.ok) return { error: await describe(res) }
  return { ok: true }
}

async function githubFetch(
  env: Env,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  if (!env.GITHUB_TOKEN?.trim()) throw new Error('На сервере не задан GITHUB_TOKEN')

  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-02',
    'User-Agent': 'lu4-party-pilot',
    ...((init.headers as Record<string, string>) ?? {}),
  }
  return fetch(url, { ...init, headers })
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

function parseToken(token: string): (ParsedToken & { secret: string }) | null {
  const s = token.trim()
  const m = s.match(/^p2p_([a-z0-9]{4,24})_M_([a-z0-9]{20,40})$/i)
  if (m) return { partyId: m[1], kind: 'M', secret: m[2] }
  const c = s.match(/^p2p_([a-z0-9]{4,24})_C_([a-z0-9]{4,32})_([a-z0-9]{20,40})$/i)
  if (c) return { partyId: c[1], kind: 'C', charId: c[2], secret: c[3] }
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
  if (!access.ok) return json(access, access.status, cors)
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
  if (!access.ok) return json(access, access.status, cors)
  return json(access.file.db ?? emptyDb(new Date().toISOString()), 200, cors)
}

async function readMeta(request: Request, env: Env, cors: Cors): Promise<Response> {
  const access = await authorize(env, request)
  if (!access.ok) return json(access, access.status, cors)

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
  if (!access.ok) return json(access, access.status, cors)

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
      return json(
        { error: 'Этим токеном можно править только своего персонажа.' },
        403,
        cors,
      )
    }
  }

  // Оптимистичная блокировка: если клиент правил поверх старой версии,
  // молча затирать чужое изменение нельзя.
  const base = body?.baseUpdatedAt
  if (typeof base === 'string' && current.updatedAt && current.updatedAt !== base) {
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
  if ('error' in saved) {
    return json({ error: saved.error, conflict: saved.conflict ?? false }, 409, cors)
  }

  return json({ ok: true, updatedAt }, 200, cors)
}

/**
 * Новый мастер-токен. Все ранее выпущенные токены персонажей перестают
 * работать: держать в руках потерянный доступ нельзя, иначе старый мастер,
 * у которого токен увели, продолжил бы раздавать права.
 */
async function rotateMaster(request: Request, env: Env, cors: Cors): Promise<Response> {
  const access = await authorize(env, request)
  if (!access.ok) return json(access, access.status, cors)
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
  if (!access.ok) return json(access, access.status, cors)
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
  if (!access.ok) return json(access, access.status, cors)
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
    wishes: [],
    sets: [],
    customNames: {},
  }
}

function isDbLike(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false
  const d = v as Record<string, unknown>
  return (
    typeof d.updatedAt === 'string' &&
    Array.isArray(d.chars) &&
    !!d.warehouse &&
    typeof d.warehouse === 'object' &&
    Array.isArray((d.warehouse as Record<string, unknown>).stacks) &&
    Array.isArray(d.wishes)
  )
}

function cleanName(v: unknown): string {
  const s = typeof v === 'string' ? v.trim() : ''
  return s.slice(0, 40) || 'Моя пати'
}

async function readJson(request: Request): Promise<any> {
  try {
    return await request.json()
  } catch {
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
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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

function decodeBase64(b64: string): string {
  const bin = atob(b64.replace(/\n/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}