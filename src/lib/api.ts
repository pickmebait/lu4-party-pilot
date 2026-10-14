/**
 * Клиент сервера Const Party Pilot.
 *
 * Токен пати — единственный способ доступа к общей базе. Он никак не связан
 * с GitHub: код приложения лежит на Pages, база — у Worker'а.
 *
 * Два вида токена, и разница между ними проверяется на сервере, а не здесь:
 * мастер-токен правит всех, токен персонажа — только того, кому выдан.
 */
import type { Db } from '@/types'

/** Вид доступа, которым открыли пати. */
export type Role = 'master' | 'char'

export interface TokenInfo {
  id: string
  charId: string
  /** Имя персонажа на момент чтения: могло смениться после выпуска. */
  charName: string
  createdAt: string
}

export interface PartyInfo {
  partyId: string
  name: string
  role: Role
  /** Чей это персонаж. Есть только у токена персонажа. */
  charId?: string | null
  charName?: string | null
  chars?: number
}

export interface PartyMeta extends PartyInfo {
  createdAt: string
  ownCharId: string | null
  updatedAt: string | null
  updatedBy: string | null
  /** Выпущенные токены. Приходят только мастеру. */
  tokens?: TokenInfo[]
}

export type ApiResult<T> =
  | { ok: true; value: T }
  | {
      ok: false
      error: string
      /**
       * Код ответа сервера.
       *
       * Нужен, чтобы отличить «токен недействителен» от «сервер не
       * дозвонился». Первое означает, что сохранённую сессию пора выбросить,
       * второе — что человек просто без связи и выбрасывать его нельзя.
       */
      статус?: number
      /** Пришло при 409: в базе лежит более свежая версия. */
      conflict?: Db
      /**
       * Пришло при 403: токену персонажа нельзя писать чужое, но правка
       * своего персонажа в сливании допустима. Пришедшая база — то, что
       * сейчас лежит на сервере.
       */
      forbidden?: { db: Db }
    }

/** Не выкидываем текст ошибки от сервера в пользовательский интерфейс как есть. */
function msg(e: unknown): string {
  if (e instanceof Error) return e.message
  return 'неизвестная ошибка'
}

/**
 * Сколько ждём ответа сервера, прежде чем считать связь пропавшей.
 *
 * Ответ до workers.dev теряется примерно в одном запросе из пяти: Worker
 * отвечает за две секунды, а браузер так и не получает ничего и ждёт вечно.
 * Без предела приложение навсегда остаётся с надписью «Сохраняю…» и
 * заблокированными кнопками — выглядит как зависшее, а правка при этом
 * давно в базе.
 */
const ОЖИДАНИЕ_ОТВЕТА_МС = 25_000

async function call<T>(
  base: string,
  path: string,
  init: RequestInit & { token?: string } = {},
  повтор = 0,
): Promise<ApiResult<T>> {
  const url = `${base.replace(/\/+$/, '')}${path}`
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  }
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'
  if (init.token) headers.Authorization = `Bearer ${init.token}`

  const отмена = new AbortController()
  const будильник = setTimeout(() => отмена.abort(), ОЖИДАНИЕ_ОТВЕТА_МС)

  try {
    const res = await fetch(url, { ...init, headers, signal: отмена.signal })
    let json: any = null
    try {
      json = await res.json()
    } catch {
      /* ответ без тела */
    }

    if (res.status === 401) {
      return { ok: false, статус: res.status, error: 'Токен не подходит. Проверь его или запроси новый у мастера пати.' }
    }
    if (res.status === 403) {
      return {
        ok: false,
        статус: res.status,
        error: json?.error ?? 'Недостаточно прав',
        forbidden: json?.db ? { db: json.db as Db } : undefined,
      }
    }
    if (res.status === 404) {
      return { ok: false, статус: res.status, error: json?.error ?? 'Не найдено' }
    }
    if (res.status === 409) {
      return {
        ok: false,
        статус: res.status,
        error: json?.error ?? 'В базе есть более свежая версия',
        conflict: json?.db,
      }
    }
    if (!res.ok) {
      return { ok: false, error: json?.error ?? `Сервер ответил ${res.status}` }
    }
    return { ok: true, value: json as T }
  } catch (e) {
    /*
     * Ответ теряется по дороге чаще, чем кажется: замер показал одну такую
     * запись из пяти — Worker отвечает, а браузер обрывается через минуту и
     * видит ошибку сети при записанной правке.
     *
     * Запись повторяется один раз: сервер смотрит, что лишнее он уже
     * записал, и подтверждает повтор вместо того, чтобы ругаться конфликтом
     * на собственную правку. Без повтора человек увидел бы ошибку и решил,
     * что ничего не сохранилось.
     *
     * Повторяется только запись: чтение и выдача токена при обрыве ничего
     * не меняют, а повтор выпуска токена отозвал бы только что выданный и
     * выпустил новый — тот, которым уже никого не заменить.
     */
    if (init.method === 'PUT' && повтор === 0) {
      await new Promise((окончить) => setTimeout(окончить, 700))
      return call<T>(base, path, init, повтор + 1)
    }
    return {
      ok: false,
      статус: 0,
      error: отмена.signal.aborted
        ? 'Сервер не ответил вовремя. Правка, возможно, уже записана — попробуй «Загрузить».'
        : `Не удалось связаться с сервером. Проверь адрес и интернет. (${msg(e)})`,
    }
  } finally {
    clearTimeout(будильник)
  }
}

/** Создаёт новую пати. Мастер-токен приходит один раз и больше не показывается. */
export async function createParty(apiUrl: string, name: string): Promise<ApiResult<PartyInfo & { token: string }>> {
  return call<PartyInfo & { token: string }>(apiUrl, '/api/party', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

/** Проверяет токен и узнаёт, в какую пати и с каким правом он ведёт. */
export async function openSession(apiUrl: string, token: string): Promise<ApiResult<PartyInfo>> {
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

export async function fetchMeta(apiUrl: string, token: string): Promise<ApiResult<PartyMeta>> {
  return call<PartyMeta>(apiUrl, '/api/party/meta', { method: 'GET', token })
}

/**
 * Перевыпуск мастер-токена. Прежний перестаёт работать сразу, и вместе с
 * ним перестают работать все токены персонажей: держать потерянный доступ в
 * руках того, у кого его увели, нельзя.
 */
export async function rotateMaster(
  apiUrl: string,
  token: string,
): Promise<ApiResult<{ token: string; partyId: string; name: string }>> {
  return call<{ token: string; partyId: string; name: string }>(apiUrl, '/api/party/rotate', {
    method: 'POST',
    token,
  })
}

/**
 * Выпуск токена персонажа. На того же персонажа это перевыпуск: прежний
 * отзывается, новый приходит один раз и показывается только здесь.
 */
export async function issueCharToken(
  apiUrl: string,
  token: string,
  charId: string,
): Promise<ApiResult<{ token: string; charId: string; charName: string }>> {
  return call<{ token: string; charId: string; charName: string }>(apiUrl, '/api/party/tokens', {
    method: 'POST',
    token,
    body: JSON.stringify({ charId }),
  })
}

/** Отзыв одного токена персонажа. */
export async function revokeToken(
  apiUrl: string,
  token: string,
  id: string,
): Promise<ApiResult<{ ok: true }>> {
  return call<{ ok: true }>(apiUrl, `/api/party/tokens?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    token,
  })
}

/** Удаление пати целиком. Восстановить базу после неё нельзя. */
export async function deleteParty(
  apiUrl: string,
  token: string,
): Promise<ApiResult<{ ok: true; partyId: string }>> {
  return call<{ ok: true; partyId: string }>(apiUrl, '/api/party', { method: 'DELETE', token })
}