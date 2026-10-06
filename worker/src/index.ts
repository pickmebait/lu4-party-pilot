/**
 * Сторона сервера Party Pilot.
 *
 * Хранит базы пати и проверяет токены доступа. Никакой связи с GitHub:
 * код приложения лежит на Pages, а данные — здесь.
 *
 * Ключи в KV:
 *   token:<sha256 токена>  -> { partyId, name, role, createdAt }
 *   party:<partyId>        -> база пати целиком (Db)
 *   party:<partyId>:meta   -> { name, createdAt, tokens }
 *
 * В KV попадает только хеш токена, поэтому содержимое хранилища не даёт
 * войти в чужую пату, даже если оно кому-то доступно.
 */

export interface Env {
  DB: KVNamespace
  /** С какого адреса разрешены запросы. Пусто = любой. */
  ALLOWED_ORIGIN?: string
}

type Role = 'owner' | 'member'

/** Заголовки CORS обычным объектом — так проще склеивать с ответом. */
type Cors = Record<string, string>

interface TokenRecord {
  partyId: string
  name: string
  role: Role
  createdAt: string
}

interface PartyMeta {
  name: string
  createdAt: string
  tokens: number
}

const MAX_PARTIES = 10_000
const MAX_DB_BYTES = 512 * 1024

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
          // GET читает, PUT сохраняет — один адрес, чтобы клиенту
          // не приходилось держать в настройках два разных.
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
      const msg = e instanceof Error ? e.message : 'Внутренняя ошибка'
      return json({ error: msg }, 500, cors)
    }
  },
}

/** Создаёт новую пати и возвращает её токен. Токен показывается один раз. */
async function createParty(request: Request, env: Env, cors: Cors): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Нужен POST' }, 405, cors)

  const body = await readJson(request)
  const name = cleanName(body?.name)

  // Простая защита от бессмысленного потока запросов: считаем пати.
  const count = Number((await env.DB.get('parties:count')) ?? '0')
  if (!Number.isFinite(count) || count >= MAX_PARTIES) {
    return json({ error: 'Достигнут лимит пати на этом развёртывании' }, 429, cors)
  }

  const partyId = randId(16)
  const token = `p2p_${randToken(20)}`
  const now = new Date().toISOString()
  const meta: PartyMeta = { name, createdAt: now, tokens: 1 }

  await env.DB.put(`party:${partyId}:meta`, JSON.stringify(meta))
  await env.DB.put(`party:${partyId}`, JSON.stringify(emptyDb(now)))
  await env.DB.put(
    await tokenKey(token),
    JSON.stringify({ partyId, name, role: 'owner', createdAt: now }),
  )
  await env.DB.put('parties:count', String(count + 1))

  // Возвращаем токен ровно один раз — дальше хранится только хеш.
  return json({ token, partyId, name, role: 'owner' }, 200, cors)
}

/** Проверка токена при входе на сайт. */
async function openSession(request: Request, env: Env, cors: Cors): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Нужен POST' }, 405, cors)

  const body = await readJson(request)
  const token = String(body?.token ?? '').trim()
  if (!token) return json({ error: 'Токен не указан' }, 400, cors)

  const rec = await env.DB.get(await tokenKey(token))
  if (!rec) return json({ error: 'Токен не подходит. Проверь, что скопировал целиком.' }, 401, cors)

  const record: TokenRecord = JSON.parse(rec)
  const metaRaw = await env.DB.get(`party:${record.partyId}:meta`)
  const meta: PartyMeta = metaRaw
    ? JSON.parse(metaRaw)
    : { name: record.name, createdAt: record.createdAt, tokens: 1 }

  return json(
    {
      partyId: record.partyId,
      name: meta.name,
      role: record.role,
      tokens: meta.tokens,
      joinedAt: record.createdAt,
    },
    200,
    cors,
  )
}

async function readData(request: Request, env: Env, cors: Cors): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'Нужен GET' }, 405, cors)

  const auth = await authorize(request, env)
  if ('error' in auth) return json(auth, 401, cors)

  const raw = await env.DB.get(`party:${auth.partyId}`)
  if (!raw) return json(emptyDb(new Date().toISOString()), 200, cors)
  return new Response(raw, { status: 200, headers: cors })
}

async function readMeta(request: Request, env: Env, cors: Cors): Promise<Response> {
  const auth = await authorize(request, env)
  if ('error' in auth) return json(auth, 401, cors)

  const raw = await env.DB.get(`party:${auth.partyId}:meta`)
  if (!raw) return json({ error: 'Пати не найдена' }, 404, cors)
  const meta: PartyMeta = JSON.parse(raw)

  const dbRaw = await env.DB.get(`party:${auth.partyId}`)
  const db = dbRaw ? JSON.parse(dbRaw) : null

  return json(
    {
      ...meta,
      updatedAt: db?.updatedAt ?? null,
      updatedBy: db?.updatedBy ?? null,
      chars: db?.chars?.length ?? 0,
    },
    200,
    cors,
  )
}

/** Запись базы. Оптимистичная блокировка по baseUpdatedAt. */
async function writeData(request: Request, env: Env, cors: Cors): Promise<Response> {
  if (request.method !== 'PUT') return json({ error: 'Нужен PUT' }, 405, cors)

  const auth = await authorize(request, env)
  if ('error' in auth) return json(auth, 401, cors)

  const body = await readJson(request)
  const incoming = body?.db
  if (!isDbLike(incoming)) return json({ error: 'Данные выглядят повреждёнными' }, 400, cors)

  const payload = JSON.stringify(incoming)
  if (payload.length > MAX_DB_BYTES) {
    return json({ error: 'База слишком большая (больше 512 КБ)' }, 413, cors)
  }

  const key = `party:${auth.partyId}`
  const currentRaw = await env.DB.get(key)
  const current = currentRaw ? JSON.parse(currentRaw) : null

  // Если клиент отправлял на основе старой версии — отказываем, чтобы не
  // затереть чужое изменение молча.
  const base = body?.baseUpdatedAt
  if (current && typeof base === 'string' && current.updatedAt && current.updatedAt !== base) {
    return json(
      {
        error: 'В базе есть более свежая версия. Сначала загрузи данные.',
        conflict: true,
        db: current,
      },
      409,
      cors,
    )
  }

  await env.DB.put(key, payload)
  return json({ ok: true, updatedAt: incoming.updatedAt }, 200, cors)
}

/** Смена токена: старый перестаёт работать, новый показывается один раз. */
async function rotateToken(request: Request, env: Env, cors: Cors): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Нужен POST' }, 405, cors)

  const auth = await authorize(request, env)
  if ('error' in auth) return json(auth, 401, cors)
  if (auth.role !== 'owner') {
    return json({ error: 'Менять токен может только автор пати' }, 403, cors)
  }

  const token = `p2p_${randToken(20)}`
  const now = new Date().toISOString()
  const metaKey = `party:${auth.partyId}:meta`
  const metaRaw = (await env.DB.get(metaKey)) ?? '{}'
  const meta: PartyMeta = JSON.parse(metaRaw)

  await env.DB.put(
    await tokenKey(token),
    JSON.stringify({ partyId: auth.partyId, name: meta.name, role: 'owner', createdAt: now }),
  )
  await env.DB.put(metaKey, JSON.stringify({ ...meta, tokens: meta.tokens + 1 }))

  return json({ token, partyId: auth.partyId, name: meta.name }, 200, cors)
}

/* ------------------------------------------------------------------ помощники */

async function authorize(
  request: Request,
  env: Env,
): Promise<{ partyId: string; role: Role } | { error: string }> {
  const header = request.headers.get('Authorization') ?? ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { error: 'Нет токена' }

  const raw = await env.DB.get(await tokenKey(token))
  if (!raw) return { error: 'Токен недействителен' }

  const rec: TokenRecord = JSON.parse(raw)
  return { partyId: rec.partyId, role: rec.role }
}

/**
 * Ключ токена в KV — это его SHA-256, а не сам токен.
 * Поэтому содержимое базы нельзя использовать, чтобы войти в пату.
 */
async function tokenKey(token: string): Promise<string> {
  const data = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `token:${hex}`
}

function randId(nbytes: number): string {
  return randToken(nbytes)
}

/**
 * Токен из криптостойчивых байт в Base32 без неоднозначных символов.
 * 20 байт = 160 бит, перебора не существует.
 */
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

/** Поверхностная проверка: этого достаточно, чтобы не положить в базу мусор. */
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

/**
 * Заголовки CORS. Без явного ALLOWED_ORIGIN разрешаем любой источник:
 * доступ всё равно защищён токеном, а так приложение можно открыть
 * и с другого домена.
 */
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
