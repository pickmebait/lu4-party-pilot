/**
 * Состояние плашки актуальности базы.
 *
 * Живёт отдельно от сессии и базы намеренно. Опрос меты идёт каждые семь
 * секунд; если бы его результат лежал в сессии, App перезапускал бы
 * openSession и перерисовывал всё приложение на каждой проверке. Здесь же
 * обновляется только маленькая плашка.
 */
import { useSyncExternalStore } from 'react'

export type LiveKind = 'stale' | 'checking' | 'fresh' | 'offline' | 'limited'

export interface LiveStatus {
  kind: LiveKind
  /** Когда сервер последний раз подтвердил, что база прочитана. */
  checkedAt: number | null
  /** Версия базы на сервере, если сервер её назвал. */
  dbUpdatedAt: string | null
  /** До какого времени GitHub просил не трогать лимит. */
  retryAt: number | null
  /** Последняя причина отказа — для подсказки, не для громкой надписи. */
  error: string | null
  /** Вышла новая версия приложения и ждёт обновления. */
  updateReady: boolean
}

let state: LiveStatus = {
  kind: 'stale',
  checkedAt: null,
  dbUpdatedAt: null,
  retryAt: null,
  error: null,
  updateReady: false,
}

const listeners = new Set<() => void>()

function set(patch: Partial<LiveStatus>): void {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}

export function useLiveStatus(): LiveStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
    () => state,
  )
}

/** Началась настоящая загрузка или запись: показываем крутилку. */
export function живойСтатусНачали(): void {
  set({ kind: 'checking', error: null })
}

/** Сервер ответил: база на экране сверена с ним. */
export function живойСтатусУспех(dbUpdatedAt: string | null): void {
  set({
    kind: 'fresh',
    checkedAt: Date.now(),
    dbUpdatedAt: dbUpdatedAt ?? state.dbUpdatedAt,
    retryAt: null,
    error: null,
  })
}

/** Сервер не ответил. */
export function живойСтатусОбрыв(error: string): void {
  set({ kind: 'offline', error })
}

/** GitHub исчерпал лимит: ждём названного срока, не долбим запросами. */
export function живойСтатусЛимит(retryAt: number, error: string): void {
  set({ kind: 'limited', retryAt, error })
}

/** Ошибка, которая не делает базу неактуальной: просто оставляем причину. */
export function живойСтатусЗаметка(error: string): void {
  set({ error })
}

/** Новая версия приложения. */
export function живойСтатусОбновление(updateReady: boolean): void {
  set({ updateReady })
}
