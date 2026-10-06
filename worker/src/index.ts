/**
 * Сторона сервера Party Pilot.
 *
 * Базы пати лежат файлами в GitHub-репозитории. Один файл на пати:
 *
 *   data/parties/<partyId>.json
 *
 * Токен GitHub хранится в секрете Worker'а и в браузер не попадает никогда.
 * Токен пати — случайная строка; сервер читает из неё id пати и сверяет
 * секретную часть с хешем, который лежит в файле. Поэтому искать пати
 * приходится по прямому пути, а не перебором, а сам токен в репозитории
 * не хранится — только его SHA-256.
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

interface PartyFile {
  partyId: string
  name: string
  createdAt: string
  /** SHA-256 секретной части токена. Сам токен не хранится. */
  tokenHash: string
  tokensIssued: number
  db: unknown
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
      switch (url.pathname) {
        case '/api/party':
          return await createParty(request, env, cors)
        case '/api/session':
          return await openSession(request, env, cors)
        case '/api/party/data':
          return request.method === 'PUT'
            ? await writeData(request, env, cors)
            : await readData(request, env, cors)
        case '/api/party/meta':
          return await readMeta(request, env, cors)
        case '/api/party/rotate':
          return await rotateToken(request, env, cors)
        default:
          return json({ error: 'Неизвестный адрес' }, 404, cors)
      }
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
    return { sha: json.sha, data: JSON.parse(decodeBase64(json.content)) as PartyFile }
  } catch {
    return { error: 'Файл пати в репозитории повреждён: не читается JSON' }
  }
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

async function githubFetch(
  env: Env,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  if (!env.GITHUB_TOKEN?.trim()) throw new Error('На сервере не задан GITHUB_TOKEN')

  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
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

/* ------------------------------------------------------------------ пати */

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

/** Токен вида p2p_<id>_<секрет>. По нему сразу понятно, какой файл читать. */
function makeToken(partyId: string): string {
  return `p2p_${partyId}_${randToken(SECRET_BYTES)}`
}

function parseToken(token: string): { partyId: string; secret: string } | null {
  const m = token.trim().match(/^p2p_([a-z0-9]{4,24})_([a-z0-9]{20,32})$/i)
  if (!m) return null
  return { partyId: m[1], secret: m[2] }
}

async function hashHex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Проверяет токен по файлу пати: сверяется хеш секрета.
 * Токен целиком в репозитории не лежит, поэтому копия базы не даёт доступа.
 */
async function authorize(
  env: Env,
  request: Request,
): Promise<{ partyId: string; file: PartyFile; sha: string } | { error: string }> {
  const header = request.headers.get('Authorization') ?? ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { error: 'Нет токена' }

  const parsed = parseToken(token)
  if (!parsed) return { error: 'Токен недействителен' }

  const file = await readFile(env, parsed.partyId)
  if ('error' in file) return { error: file.error }
  if (!file.data) return { error: 'Токен не подходит. Проверь, что скопировал целиком.' }

  const hash = await hashHex(parsed.secret)
  if (hash !== file.data.tokenHash) return { error: 'Токен недействителен' }

  return { partyId: parsed.partyId, file: file.data, sha: file.sha }
}

/* -------------------------------------------------------------- обработчики */

/** Создаёт пати: новый файл в репозитории и токен, показываемый один раз. */
async function createParty(request: Request, env: Env, cors: Cors): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Нужен POST' }, 405, cors)

  const body = await readJson(request)
  const name = cleanName(body?.name)

  // Пробуем несколько раз: partyId короткий,collision возможен.
  for (let attempt = 0; attempt < 4; attempt++) {
    const partyId = newPartyId()
    const existing = await readFile(env, partyId)
    if ('error' in existing) return json({ error: existing.error }, 502, cors)
    if (existing.data) continue

    const token = makeToken(partyId)
    const secret = parseToken(token)!.secret
    const now = new Date().toISOString()

    const party: PartyFile = {
      partyId,
      name,
      createdAt: now,
      tokenHash: await hashHex(secret),
      tokensIssued: 1,
      db: emptyDb(now),
    }

    const saved = await writeFile(
      env,
      partyId,
      party,
      '',
      `${name}: создана пати (${partyId})`,
    )
    if ('error' in saved) {
      if (saved.conflict) continue
      return json({ error: saved.error }, 502, cors)
    }

    return json({ token, partyId, name, role: 'owner' }, 200, cors)
  }

  return json({ error: 'Не удалось выбрать свободное имя пати, попробуй ещё раз' }, 503, cors)
}

async function openSession(request: Request, env: Env, cors: Cors): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Нужен POST' }, 405, cors)

  const body = await readJson(request)
  const token = String(body?.token ?? '').trim()
  if (!token) return json({ error: 'Токен не указан' }, 400, cors)

  const parsed = parseToken(token)
  if (!parsed) return json({ error: 'Токен не подходит. Проверь, что скопировал целиком.' }, 401, cors)

  const file = await readFile(env, parsed.partyId)
  if ('error' in file) return json({ error: file.error }, 502, cors)
  if (!file.data) return json({ error: 'Токен не подходит. Проверь, что скопировал целиком.' }, 401, cors)

  if ((await hashHex(parsed.secret)) !== file.data.tokenHash) {
    return json({ error: 'Токен не подходит. Проверь, что скопировал целиком.' }, 401, cors)
  }

  return json(
    {
      partyId: file.data.partyId,
      name: file.data.name,
      role: 'owner',
      tokens: file.data.tokensIssued,
      joinedAt: file.data.createdAt,
    },
    200,
    cors,
  )
}

async function readData(request: Request, env: Env, cors: Cors): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'Нужен GET' }, 405, cors)

  const auth = await authorize(env, request)
  if ('error' in auth) return json(auth, 401, cors)

  return json(auth.file.db ?? emptyDb(new Date().toISOString()), 200, cors)
}

async function readMeta(request: Request, env: Env, cors: Cors): Promise<Response> {
  const auth = await authorize(env, request)
  if ('error' in auth) return json(auth, 401, cors)

  const db = auth.file.db as { updatedAt?: string; updatedBy?: string; chars?: unknown[] }
  return json(
    {
      name: auth.file.name,
      createdAt: auth.file.createdAt,
      tokens: auth.file.tokensIssued,
      updatedAt: db?.updatedAt ?? null,
      updatedBy: db?.updatedBy ?? null,
      chars: Array.isArray(db?.chars) ? db.chars.length : 0,
    },
    200,
    cors,
  )
}

async function writeData(request: Request, env: Env, cors: Cors): Promise<Response> {
  if (request.method !== 'PUT') return json({ error: 'Нужен PUT' }, 405, cors)

  const auth = await authorize(env, request)
  if ('error' in auth) return json(auth, 401, cors)

  const body = await readJson(request)
  const incoming = body?.db
  if (!isDbLike(incoming)) return json({ error: 'Данные выглядят повреждёнными' }, 400, cors)

  const current = auth.file.db as { updatedAt?: string }

  // Оптимистичная блокировка: если клиент правил поверх старой версии,
  // молча затирать чужое изменение нельзя.
  const base = body?.baseUpdatedAt
  if (typeof base === 'string' && current.updatedAt && current.updatedAt !== base) {
    return json(
      {
        error: 'В базе есть более свежая версия. Сначала загрузи данные.',
        conflict: true,
        db: auth.file.db,
      },
      409,
      cors,
    )
  }

  const updatedAt = typeof incoming.updatedAt === 'string' ? incoming.updatedAt : new Date().toISOString()
  const party: PartyFile = {
    ...auth.file,
    tokensIssued: auth.file.tokensIssued,
    db: { ...(incoming as object), updatedAt },
  }

  const who = party.db && typeof party.db === 'object' ? (party.db as { updatedBy?: string }).updatedBy : ''
  const saved = await writeFile(
    env,
    auth.partyId,
    party,
    auth.sha,
    `${who || 'без ника'}: обновил базу пати (${updatedAt.slice(0, 16).replace('T', ' ')})`,
  )
  if ('error' in saved) {
    return json({ error: saved.error, conflict: saved.conflict ?? false }, 409, cors)
  }

  return json({ ok: true, updatedAt }, 200, cors)
}

/** Новый токен: старый перестаёт работать сразу. */
async function rotateToken(request: Request, env: Env, cors: Cors): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Нужен POST' }, 405, cors)

  const auth = await authorize(env, request)
  if ('error' in auth) return json(auth, 401, cors)

  const token = makeToken(auth.partyId)
  const secret = parseToken(token)!.secret
  const party: PartyFile = {
    ...auth.file,
    tokenHash: await hashHex(secret),
    tokensIssued: auth.file.tokensIssued + 1,
  }

  const saved = await writeFile(
    env,
    auth.partyId,
    party,
    auth.sha,
    `${auth.file.name}: выпущен новый токен доступа`,
  )
  if ('error' in saved) return json({ error: saved.error }, 409, cors)

  return json({ token, partyId: auth.partyId, name: auth.file.name }, 200, cors)
}

/* ------------------------------------------------------------------ помощники */

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
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
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
