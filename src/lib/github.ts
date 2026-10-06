/**
 * Общая база пати = файл data.json в репозитории.
 *
 * Чтение  — обычный запрос к raw.githubusercontent.com, токен не нужен,
 *           репозиторий публичный.
 * Запись  — GitHub REST API, нужен fine-grained токен с правом
 *           Contents: Read and write на конкретный репозиторий.
 *
 * Токен живёт только в localStorage этого браузера и никогда не
 * отправляется никуда, кроме api.github.com.
 */
import type { Db } from '@/types'

export interface RemoteConfig {
  owner: string
  repo: string
  branch: string
  path: string
}

export interface RemoteProbe {
  exists: boolean
  sha: string | null
  db: Db | null
}

export type RemoteResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }

const API = 'https://api.github.com'

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function publicHeaders(token?: string): Record<string, string> {
  return token ? authHeaders(token) : { Accept: 'application/vnd.github+json' }
}

function b64encodeUtf8(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function b64decodeUtf8(b64: string): string {
  const bin = atob(b64.replace(/\n/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

export function validateConfig(cfg: RemoteConfig): string | null {
  if (!cfg.owner.trim()) return 'Не указан владелец репозитория'
  if (!cfg.repo.trim()) return 'Не указано имя репозитория'
  if (!cfg.branch.trim()) return 'Не указана ветка'
  if (!cfg.path.trim()) return 'Не указан путь к файлу данных'
  return null
}

export function rawUrl(cfg: RemoteConfig, cacheBust = Date.now()): string {
  return `https://raw.githubusercontent.com/${cfg.owner.trim()}/${cfg.repo.trim()}/${cfg.branch.trim()}/${cfg.path.trim()}?t=${cacheBust}`
}

/** Текущее состояние файла в репозитории: есть ли он, какой sha и что внутри. */
export async function probe(cfg: RemoteConfig, token?: string): Promise<RemoteResult<RemoteProbe>> {
  const bad = validateConfig(cfg)
  if (bad) return { ok: false, error: bad }

  const url = `${API}/repos/${cfg.owner.trim()}/${cfg.repo.trim()}/contents/${cfg.path.trim()}?ref=${encodeURIComponent(cfg.branch.trim())}`
  try {
    const res = await fetch(url, { headers: publicHeaders(token) })
    if (res.status === 404) {
      return { ok: true, value: { exists: false, sha: null, db: null } }
    }
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error:
          res.status === 401
            ? 'Токен отклонён GitHub. Проверь, что он не истёк и не отозван.'
            : 'GitHub не дал доступ к файлу. Для публичного репозитория токен не нужен — попробуй сохранить без токена.',
      }
    }
    if (!res.ok) {
      return { ok: false, error: `GitHub ответил ${res.status}` }
    }
    const json = (await res.json()) as { sha: string; content?: string; encoding?: string }
    let db: Db | null = null
    if (json.content) {
      try {
        db = JSON.parse(b64decodeUtf8(json.content)) as Db
      } catch {
        return { ok: false, error: 'Файл в репозитории есть, но это не валидный JSON' }
      }
    }
    return { ok: true, value: { exists: true, sha: json.sha, db } }
  } catch (e) {
    return {
      ok: false,
      error: `Сеть недоступна: ${e instanceof Error ? e.message : 'неизвестная ошибка'}`,
    }
  }
}

/**
 * Записать данные в репозиторий.
 * Перед записью перечитываем файл: если его уже изменил кто-то другой,
 * не затираем его молча — возвращаем ошибку с пояснением.
 */
export async function push(
  cfg: RemoteConfig,
  token: string,
  db: Db,
  author: string,
): Promise<RemoteResult<{ sha: string }>> {
  if (!token.trim()) {
    return { ok: false, error: 'Для записи в репозиторий нужен токен' }
  }
  const bad = validateConfig(cfg)
  if (bad) return { ok: false, error: bad }

  const current = await probe(cfg, token)
  if (!current.ok) return current

  const remoteUpdated = current.value.db?.updatedAt ?? ''
  const localUpdated = db.updatedAt
  if (remoteUpdated && remoteUpdated > localUpdated) {
    const who = current.value.db?.updatedBy || 'кто-то'
    return {
      ok: false,
      error: `В репозитории есть более свежая версия (от: ${who}, ${remoteUpdated}). Сначала загрузи данные, потом сохраняй свои изменения.`,
    }
  }

  const content = b64encodeUtf8(`${JSON.stringify(db, null, 2)}\n`)
  const who = author ? `${author}: ` : ''
  const message = `${who}обновил данные пати (${new Date().toISOString().slice(0, 16).replace('T', ' ')})`

  const body: Record<string, unknown> = {
    message,
    content,
    branch: cfg.branch.trim(),
  }
  if (current.value.sha) body.sha = current.value.sha

  try {
    const res = await fetch(
      `${API}/repos/${cfg.owner.trim()}/${cfg.repo.trim()}/contents/${cfg.path.trim()}`,
      {
        method: 'PUT',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    )
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error: 'GitHub отклонил запись. Проверь токен: у него должно быть право Contents: Read and write.',
      }
    }
    if (res.status === 409 || res.status === 422) {
      return {
        ok: false,
        error: 'Файл в репозитории изменился прямо сейчас. Нажми «Загрузить» и повтори сохранение.',
      }
    }
    if (!res.ok) {
      return { ok: false, error: `GitHub ответил ${res.status}: ${await res.text()}` }
    }
    const json = (await res.json()) as { content?: { sha?: string }; commit?: { sha?: string } }
    return { ok: true, value: { sha: json.content?.sha ?? json.commit?.sha ?? '' } }
  } catch (e) {
    return {
      ok: false,
      error: `Сеть недоступна: ${e instanceof Error ? e.message : 'неизвестная ошибка'}`,
    }
  }
}

/** Быстрая проверка, что конфиг вообще что-то осмысленное. */
export function describeTarget(cfg: RemoteConfig): string {
  return `${cfg.owner}/${cfg.repo}@${cfg.branch}/${cfg.path}`
}
