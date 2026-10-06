/**
 * Клиент сервера Party Pilot.
 *
 * Токен пати — единственный способ доступа к общей базе. Он никак не связан
 * с GitHub: код приложения лежит на Pages, база — у Worker'а.
 */
import type { Db } from '@/types'

export interface PartyInfo {
  partyId: string
  name: string
  role: 'owner' | 'member'
  tokens: number
  updatedAt?: string | null
  updatedBy?: string | null
  chars?: number
}

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: string; conflict?: Db }

/** Не выкидываем текст ошибки от сервера в пользовательский интерфейс как есть. */
function msg(e: unknown): string {
  if (e instanceof Error) return e.message
  return 'неизвестная ошибка'
}

async function call<T>(
  base: string,
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<ApiResult<T>> {
  const url = `${base.replace(/\/+$/, '')}${path}`
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  }
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'
  if (init.token) headers.Authorization = `Bearer ${init.token}`

  try {
    const res = await fetch(url, { ...init, headers })
    let json: any = null
    try {
      json = await res.json()
    } catch {
      /* ответ без тела */
    }

    if (res.status === 401) {
      return { ok: false, error: 'Токен не подходит. Проверь его или запроси новый у лидера.' }
    }
    if (res.status === 403) {
      return { ok: false, error: json?.error ?? 'Недостаточно прав' }
    }
    if (res.status === 409) {
      return {
        ok: false,
        error: json?.error ?? 'В базе есть более свежая версия',
        conflict: json?.db,
      }
    }
    if (!res.ok) {
      return { ok: false, error: json?.error ?? `Сервер ответил ${res.status}` }
    }
    return { ok: true, value: json as T }
  } catch (e) {
    return {
      ok: false,
      error: `Не удалось связаться с сервером. Проверь адрес и интернет. (${msg(e)})`,
    }
  }
}

/** Создаёт новую пати. Токен приходит один раз и больше не показывается. */
export async function createParty(apiUrl: string, name: string): Promise<ApiResult<PartyInfo & { token: string }>> {
  return call<PartyInfo & { token: string }>(apiUrl, '/api/party', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

/** Проверяет токен и узнаёт, в какую пати он ведёт. */
export async function openSession(
  apiUrl: string,
  token: string,
): Promise<ApiResult<PartyInfo>> {
  return call<PartyInfo>(apiUrl, '/api/session', {
    method: 'POST',
    body: JSON.stringify({ token }),
  })
}

export async function fetchDb(apiUrl: string, token: string): Promise<ApiResult<Db>> {
  return call<Db>(apiUrl, '/api/party/data', { method: 'GET', token })
}

/**
 * Сохраняет базу.
 * baseUpdatedAt — версия, от которой клиент отталкивался. Сервер откажет,
 * если в базе уже есть другая, более свежая.
 */
export async function saveDb(
  apiUrl: string,
  token: string,
  db: Db,
  baseUpdatedAt: string,
): Promise<ApiResult<{ updatedAt: string }>> {
  return call<{ updatedAt: string }>(apiUrl, '/api/party/data', {
    method: 'PUT',
    token,
    body: JSON.stringify({ db, baseUpdatedAt }),
  })
}

export async function fetchMeta(apiUrl: string, token: string): Promise<ApiResult<PartyInfo>> {
  return call<PartyInfo>(apiUrl, '/api/party/meta', { method: 'GET', token })
}

/** Новый токен вместо старого. Старый перестаёт работать сразу. */
export async function rotateToken(
  apiUrl: string,
  token: string,
): Promise<ApiResult<{ token: string; partyId: string; name: string }>> {
  return call<{ token: string; partyId: string; name: string }>(apiUrl, '/api/party/rotate', {
    method: 'POST',
    token,
  })
}

/** Проверка, что сервер вообще на месте — для понятной ошибки при настройке. */
export async function ping(apiUrl: string): Promise<ApiResult<null>> {
  const res = await call<{ error: string }>(apiUrl, '/api/nope', { method: 'GET' })
  if (!res.ok && /Неизвестный адрес/.test(res.error)) {
    return { ok: true, value: null }
  }
  return res.ok ? { ok: true, value: null } : res
}
