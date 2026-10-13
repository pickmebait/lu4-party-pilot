import { useCallback, useEffect, useRef, useState } from 'react'
import type { Db } from '@/types'
import { fetchDb, saveDb } from '@/lib/api'
import { useOwnCharName } from '@/lib/access'
import { ктоЗатронут, слитьСвое } from '@/lib/merge'
import { getDb, getSession, replaceDb, updateSession, updateSettings, useSettings } from '@/lib/store'
import { formatAgo } from '@/lib/util'
import { PartyMenu } from './PartyMenu'

type SyncState =
  | { kind: 'idle' }
  | { kind: 'busy'; what: string }
  | { kind: 'ok'; text: string }
  | { kind: 'err'; text: string }

/** Как часто спрашивать сервер, пока вкладка открыта и правок не сохранено. */
const ПАУЗА_ПРОВЕРКИ_МС = 45_000

/**
 * Полоса синхронизации: ник, «Загрузить», «Сохранить» и меню доступа.
 *
 * Раньше синхронизация была только ручной: пока не нажмёшь «Загрузить»,
 * чужую правку не видно. С несколькими людьми в пати это значило, что
 * каждый работает со своей копией и удивляется, откуда взялись чужие
 * изменения или почему их нет. Теперь база подтягивается сама, а сохранение
 * не затирает чужую работу.
 *
 * Токен персонажа правит только своего персонажа, поэтому его правка
 * сливается с чужой версией: всё, кроме его персонажа, берётся с сервера.
 * Мастер-токен при споре показывает выбор — решить, чья версия останется,
 * может только человек, у которого есть право решить.
 */
export function SyncBar() {
  const settings = useSettings()
  const session = getSession()!
  const имяСвоего = useOwnCharName()
  const [state, setState] = useState<SyncState>({ kind: 'idle' })
  const [incoming, setIncoming] = useState<Db | null>(null)

  const busy = state.kind === 'busy'
  const свойCharId = session.role === 'char' ? session.charId : null
  const загружается = useRef(false)

  const естьСвоиПравки = () => (getDb().updatedAt ?? '') !== session.lastSyncedAt

  /**
   * Чтение сервера.
   *
   * молча = не сообщать об успехе: обновление идёт само каждые полминуты,
   * и надпись «загружено» мигала бы без причины. Говорим только когда
   * что-то приехало или что-то сломалось.
   */
  const загрузить = useCallback(
    async (молча: boolean, показыватьПредупреждение: boolean) => {
      if (загружается.current) return
      загружается.current = true
      if (!молча) setState({ kind: 'busy', what: 'Загружаю из пати…' })

      try {
        const res = await fetchDb(session.apiUrl, session.token)
        if (!res.ok) {
          if (!молча) setState({ kind: 'err', text: res.error })
          return
        }

        const remote = res.value
        const local = getDb()
        const свои = (local.updatedAt ?? '') !== session.lastSyncedAt

        if (свои) {
          /*
           * Есть несохранённое, и в базе кто-то уже работал — не затираем
           * молча. Сохранение само разберётся: токен персонажа подставит
           * свою правку в чужую базу, мастеру покажем выбор.
           */
          if ((remote.updatedAt ?? '') !== session.lastSyncedAt && показыватьПредупреждение) {
            setState({
              kind: 'err',
              text: `В пати есть более свежая версия (от: ${remote.updatedBy || 'неизвестно'}, ${formatAgo(remote.updatedAt)}), а у тебя есть несохранённые правки. Нажми «Сохранить» — твоё подставится в неё.`,
            })
          }
          return
        }

        const изменилось = (remote.updatedAt ?? '') !== session.lastSyncedAt
        if (!изменилось && молча) return

        replaceDb(remote)
        updateSession({ lastSyncedAt: remote.updatedAt })
        setState({
          kind: 'ok',
          text: `Загружено из пати${remote.updatedBy ? ` (от: ${remote.updatedBy})` : ''}`,
        })
      } finally {
        загружается.current = false
      }
    },
    [session.apiUrl, session.token, session.lastSyncedAt],
  )

  /**
   * Обновление само, пока вкладка открыта.
   *
   * Три повода, а не таймер на каждую секунду: вернуться к вкладке,
   * переключиться на неё и подождать. Каждая проверка — это чтение из
   * репозитория, поэтому лишних обращений к GitHub быть не должно.
   */
  useEffect(() => {
    if (!session) return

    const тик = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (естьСвоиПравки()) return
      void загрузить(true, false)
    }, ПАУЗА_ПРОВЕРКИ_МС)

    const вернулись = () => {
      if (document.visibilityState !== 'visible') return
      if (естьСвоиПравки()) return
      void загрузить(true, true)
    }

    window.addEventListener('focus', вернулись)
    document.addEventListener('visibilitychange', вернулись)
    return () => {
      clearInterval(тик)
      window.removeEventListener('focus', вернулись)
      document.removeEventListener('visibilitychange', вернулись)
    }
  }, [загрузить, session])

  const doPush = async () => {
    setState({ kind: 'busy', what: 'Сохраняю в пати…' })
    const current = getDb()
    const res = await saveDb(session.apiUrl, session.token, current, session.lastSyncedAt)

    if (!res.ok) {
      /*
       * Отказ по правам при токене персонажа — это не запрет. Человек правил
       * своего персонажа, а у него в копии устарел сосед. Сервер присылает
       * актуальную базу: подставляем в неё своего персонажа и сохраняем
       * снова. Так правка уходит и чужое не теряется.
       */
      if (res.forbidden && свойCharId) {
        const чей = ктоЗатронут(current, res.forbidden.db, свойCharId)
        const слияние = слитьСвое(current, res.forbidden.db, свойCharId, settings.playerName)

        if (слияние.персонажаНет) {
          replaceDb(слияние.db)
          updateSession({ lastSyncedAt: слияние.db.updatedAt })
          setState({
            kind: 'err',
            text: 'Твоего персонажа удалили из пати, пока ты правил. Правка не сохранена.',
          })
          return
        }

        const повтор = await saveDb(
          session.apiUrl,
          session.token,
          слияние.db,
          res.forbidden.db.updatedAt,
        )
        if (!повтор.ok) {
          setState({ kind: 'err', text: повтор.error })
          return
        }

        replaceDb({ ...слияние.db, updatedAt: повтор.value.updatedAt })
        updateSession({ lastSyncedAt: повтор.value.updatedAt })
        setState({
          kind: 'ok',
          text: чей.length
            ? `Сохранено. Подтянуты изменения: ${чей.join(', ')}`
            : 'Сохранено в общую базу пати',
        })
        return
      }

      if (res.conflict) {
        /*
         * Персонажа удалили, пока человек правил.
         *
         * Правка в этом случае не сохранится, а сообщение о выборе между
         * двумя версиями бессмысленно: выбирать нечего, персонажа больше
         * нет. Говорим прямо и подставляем базу, чтобы человек увидел, что
         * произошло.
         */
        if (свойCharId && !res.conflict.chars.some((c) => c.id === свойCharId)) {
          replaceDb(res.conflict)
          updateSession({ lastSyncedAt: res.conflict.updatedAt })
          setIncoming(null)
          setState({
            kind: 'err',
            text: 'Твоего персонажа удалили из пати, пока ты правил. Правка не сохранена.',
          })
          return
        }

        setIncoming(res.conflict)
        setState({ kind: 'err', text: 'Кто-то опередил: в пати уже есть другое состояние.' })
        return
      }
      setState({ kind: 'err', text: res.error })
      return
    }

    updateSession({ lastSyncedAt: res.value.updatedAt })
    // Локальная метка должна совпасть с серверной, иначе следующая
    // запись снова сочтётся конфликтом.
    replaceDb({ ...current, updatedAt: res.value.updatedAt })
    setState({ kind: 'ok', text: 'Сохранено в общую базу пати' })
  }

  return (
    <div className="sync">
      <div className="sync-main">
        <input
          className="input player"
          placeholder="Твой ник в игре"
          value={settings.playerName}
          onChange={(e) => updateSettings({ playerName: e.target.value })}
          title="Пишется в историю операций в казне"
        />
        <button className="btn" disabled={busy} onClick={() => загрузить(false, false)}>
          Загрузить
        </button>
        <button className="btn primary" disabled={busy} onClick={doPush} title="Записать в общую базу пати">
          Сохранить
        </button>
        <PartyMenu />
      </div>

      {state.kind === 'busy' && <div className="sync-msg">{state.what}</div>}
      {state.kind === 'ok' && <div className="sync-msg ok">{state.text}</div>}
      {state.kind === 'err' && <div className="sync-msg err">{state.text}</div>}

      {incoming && (
        <div className="sync-actions">
          <button
            className="btn primary tiny"
            onClick={() => {
              replaceDb(incoming)
              updateSession({ lastSyncedAt: incoming.updatedAt })
              setIncoming(null)
              setState({ kind: 'ok', text: 'Принята версия из пати' })
            }}
          >
            Взять версию из пати
          </button>
          <button className="btn tiny" onClick={() => setIncoming(null)}>
            Оставить мою
          </button>
        </div>
      )}

      {имяСвоего && <span className="sync-note">ты — {имяСвоего}</span>}
    </div>
  )
}