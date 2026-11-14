import { useState } from 'react'
import { createParty, fetchDb, openSession, type PartyInfo } from '@/lib/api'
import { API_URL } from '@/lib/config'
import { replaceDb, signIn, signOut, type PartySession } from '@/lib/store'

/** Что делает карточка входа: ввод готового токена или создание пати. */
export type AuthMode = 'enter' | 'create'

/** Свежая пати: токен показывается один раз, до входа в приложение. */
export interface IssuedParty {
  token: string
  name: string
  partyId: string
}

type PartyIdentity = Pick<PartyInfo, 'partyId' | 'name' | 'role' | 'charId'>

/**
 * Сессия для входа по токену.
 *
 * Один конструктор на оба пути — вход и создание, — чтобы поля не разъехались:
 * забытый apiUrl или charId здесь тихо ломает все запросы уже после входа.
 * Адрес базы вшит в сборку, поэтому берётся из config, а не от пользователя.
 */
export function partySession(
  accessToken: string,
  info: PartyIdentity,
  lastSyncedAt: string,
): PartySession {
  return {
    token: accessToken,
    partyId: info.partyId,
    name: info.name,
    role: info.role,
    charId: info.charId ?? null,
    apiUrl: API_URL,
    lastSyncedAt,
  }
}

/**
 * Вход в пати без привязки к разметке.
 *
 * Карточка входа и экран создания идут одним путём: сервер подтверждает токен,
 * читается база, и только потом сессия переключает приложение. Порядок важен:
 * вход раньше базы поднимает локальную копию, а база из сети кладётся поверх.
 * Наоборот нельзя — вход стёр бы только что прочитанное.
 */
export function usePartyAuth() {
  const [token, setToken] = useState('')
  const [partyName, setPartyName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [issued, setIssued] = useState<IssuedParty | null>(null)

  /**
   * Общая часть входа: подтянуть базу и открыть сессию.
   *
   * Если базу прочитать не удалось, вход всё равно состоится: следующая
   * строка переключает приложение, а о пустой базе скажет полоса
   * синхронизации — она останется на виду и дотянет данные сама.
   */
  const join = async (accessToken: string, info: PartyIdentity): Promise<void> => {
    const base = await fetchDb(API_URL, accessToken)

    /*
     * Старая сессия выбрасывается до входа.
     *
     * Экран входа бывает не только на пустом месте: вышел из пати, сменил
     * браузерную папку, вернулся по старой вкладке. Если оставить прошлую
     * сессию на месте, вход по новому токену может завершиться, а приложение
     * откроет ту пати, из которой человек только что вышел.
     */
    signOut()
    signIn(partySession(accessToken, info, base.ok ? base.value.updatedAt : ''))
    if (base.ok) replaceDb(base.value)
  }

  /** Вход по токену, который выдал мастер пати. */
  const enterByToken = async (): Promise<void> => {
    if (busy) return
    const value = token.trim()
    if (!value) {
      setError('Вставь токен пати')
      return
    }
    setBusy(true)
    setError(null)

    const res = await openSession(API_URL, value, true)
    if (!res.ok) {
      setBusy(false)
      setError(res.error)
      return
    }
    await join(value, res.value)
  }

  /**
   * Создать пати и показать мастер-токен.
   *
   * Войти сразу нельзя: signIn переключит приложение и размонтирует карточку
   * вместе с токеном. Сначала показываем токен — и только по кнопке пускаем
   * в пати.
   */
  const createNewParty = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError(null)

    const res = await createParty(API_URL, partyName.trim())
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setIssued({
      token: res.value.token,
      name: res.value.name,
      partyId: res.value.partyId,
    })
  }

  /**
   * Войти в только что созданную пати.
   *
   * Новая пати начинается пустой, и в неё ничего не переносится: в браузере
   * могла лежать база прошлой пати, и мастер-токен уехал бы с чужими
   * персонажами. Сервер только что создал пустую базу, переносить нечего.
   */
  const enterIssuedParty = async (): Promise<void> => {
    if (!issued || busy) return
    setBusy(true)
    setError(null)
    await join(issued.token, {
      partyId: issued.partyId,
      name: issued.name,
      role: 'master',
      charId: null,
    })
  }

  const clearError = (): void => setError(null)

  return {
    token,
    setToken,
    partyName,
    setPartyName,
    busy,
    error,
    issued,
    enterByToken,
    createNewParty,
    enterIssuedParty,
    clearError,
  }
}
