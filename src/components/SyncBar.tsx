import { useCallback, useEffect, useRef, useState } from 'react'
import type { Db } from '@/types'
import { fetchDb, saveDb } from '@/lib/api'
import { useOwnCharName } from '@/lib/access'
import { ктоЗатронут, слитьСвое } from '@/lib/merge'
import {
  авторПравки,
  getDb,
  getSession,
  replaceDb,
  updateSession,
  useDb,
  useОткрытаяФорма,
} from '@/lib/store'
import { formatAgo } from '@/lib/util'
import { PartyMenu } from './PartyMenu'

type SyncState =
  | { kind: 'idle' }
  | { kind: 'busy'; what: string }
  | { kind: 'ok'; text: string }
  | { kind: 'err'; text: string }

/** Сколько ждать покоя, прежде чем отправлять правку. */
const ПАУЗА_СОХРАНЕНИЯ_МС = 2500

/** Как часто спрашивать сервер, пока вкладка открыта и правок не сохранено. */
const ПАУЗА_ПРОВЕРКИ_МС = 45_000

/**
 * Синхронизация с пати и меню доступа.
 *
 * Кнопок «Загрузить» и «Сохранить» больше нет, и это не косметика.
 * Правки хранятся в общей базе, за которую отвечает не только тот, кто
 * нажал кнопку: пока человек думает, передумает и напишет «Сохранить», его
 * копия успевает разойтись с чужой, и сохранение приходится разбирать.
 * Теперь всё происходит само: правка уходит после короткой паузы в
 * спокойствии, а база подтягивается при возвращении на вкладку.
 *
 * Что осталось на виду — только то, о чём человек должен знать: идёт
 * отправка, что приехало, что подтянулось вместе с его правкой и в чём
 * проблема. Спрятать и это нельзя: молча ушедшая в чужую базу правка
 * выглядела бы как потерянная.
 */
export function SyncBar() {
  const db = useDb()
  const session = getSession()!
  const имяСвоего = useOwnCharName()
  const формаОткрыта = useОткрытаяФорма()
  const [state, setState] = useState<SyncState>({ kind: 'idle' })
  const [incoming, setIncoming] = useState<Db | null>(null)

  const свойCharId = session.role === 'char' ? session.charId : null
  const загружается = useRef(false)
  const сохраняется = useRef(false)

  const естьСвоиПравки = () => (getDb().updatedAt ?? '') !== session.lastSyncedAt

  /**
   * Чтение сервера.
   *
   * молча = не сообщать об успехе: обновление идёт само каждые полминуты,
   * и надпись «загружено» мигала бы без причины. Говорим, когда приехало
   * что-то новое, когда сломалось или когда человек нажал кнопку сам.
   */
  const загрузить = useCallback(
    async (молча: boolean) => {
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
           * Есть несохранённое — не затираем молча.
           *
           * Если в базе кто-то уже работал, говорим и про это: сохранение
           * разберётся само, токен персонажа подставит свою правку в чужую
           * базу, мастеру покажем выбор.
           *
           * Сообщение ставится в любом случае. Раньше при выходе отсюда
           * надпись оставалась «Загружаю из пати…», и полоса зависала: кнопки
           * не нажимаются, а человек не понимает, чего ждёт.
           */
          const вПатиНовее = (remote.updatedAt ?? '') !== session.lastSyncedAt
          if (!молча || вПатиНовее) {
            setState(
              вПатиНовее
                ? {
                    kind: 'err',
                    text: `В пати есть более свежая версия (от: ${remote.updatedBy || 'неизвестно'}, ${formatAgo(remote.updatedAt)}). Правка подставится в неё сама.`,
                  }
                : {
                    kind: 'err',
                    text: 'Есть несохранённые правки — загрузка их бы затёрла.',
                  },
            )
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

  const сохранить = useCallback(async () => {
    if (сохраняется.current) return
    if (!естьСвоиПравки()) return
    сохраняется.current = true

    try {
      const current = getDb()
      const res = await saveDb(session.apiUrl, session.token, current, session.lastSyncedAt)

      if (res.ok) {
        updateSession({ lastSyncedAt: res.value.updatedAt })
        // Локальная метка должна совпасть с серверной, иначе следующая
        // правка снова сочтётся несохранённой.
        replaceDb({ ...current, updatedAt: res.value.updatedAt })
        setState({ kind: 'idle' })
        return
      }

      /*
       * Отказ по правам при токене персонажа — это не запрет. Человек правил
       * своего персонажа, а у него в копии устарел сосед. Сервер присылает
       * актуальную базу: подставляем в неё своего персонажа и сохраняем
       * снова. Так правка уходит и чужое не теряется.
       */
      if (res.forbidden && свойCharId) {
        const чей = ктоЗатронут(current, res.forbidden.db, свойCharId)
        const слияние = слитьСвое(current, res.forbidden.db, свойCharId, авторПравки())

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
        setState(
          чей.length
            ? { kind: 'ok', text: `Сохранено. Подтянуты изменения: ${чей.join(', ')}` }
            : { kind: 'idle' },
        )
        return
      }

      /*
       * Персонажа удалили, пока человек правил.
       *
       * Правка в этом случае не сохранится, а сообщение о выборе между
       * двумя версиями бессмысленно: выбирать нечего, персонажа больше нет.
       */
      if (res.conflict && свойCharId && !res.conflict.chars.some((c) => c.id === свойCharId)) {
        replaceDb(res.conflict)
        updateSession({ lastSyncedAt: res.conflict.updatedAt })
        setIncoming(null)
        setState({
          kind: 'err',
          text: 'Твоего персонажа удалили из пати, пока ты правил. Правка не сохранена.',
        })
        return
      }

      if (res.conflict) {
        setIncoming(res.conflict)
        setState({ kind: 'err', text: 'Кто-то опередил: в пати уже есть другое состояние.' })
        return
      }
      setState({ kind: 'err', text: res.error })
    } finally {
      сохраняется.current = false
    }
  }, [session.apiUrl, session.token, session.lastSyncedAt, свойCharId])

  /*
   * Автосохранение.
   *
   * Пауза собирает несколько правок подряд в одну отправку: иначе набор
   * уровня и заточки дал бы десяток записей в репозиторий и десяток
   * коммитов на одну минуту работы.
   *
   * Пока открыта форма правки, ждать незачем — правки в базе ещё нет, и
   * отправлять нечего. Сама форма поставит её, когда нажмут «Сохранить».
   */
  useEffect(() => {
    if (формаОткрыта) return
    if ((db.updatedAt ?? '') === session.lastSyncedAt) return
    if (state.kind === 'err' && incoming) return

    const таймер = setTimeout(() => {
      setState({ kind: 'busy', what: 'Сохраняю в пати…' })
      void сохранить()
    }, ПАУЗА_СОХРАНЕНИЯ_МС)
    return () => clearTimeout(таймер)
  }, [db.updatedAt, session.lastSyncedAt, формаОткрыта, сохранить, state.kind, incoming])

  /**
   * Обновление само, пока вкладка открыта.
   *
   * Три повода, а не таймер на каждую секунду: вернуться к вкладке,
   * переключиться на неё и подождать. Каждая проверка — это чтение из
   * репозитория, поэтому лишних обращений к GitHub быть не должно.
   */
  useEffect(() => {
    const тик = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (естьСвоиПравки()) return
      if (формаОткрыта) return
      void загрузить(true)
    }, ПАУЗА_ПРОВЕРКИ_МС)

    const вернулись = () => {
      if (document.visibilityState !== 'visible') return
      if (естьСвоиПравки()) return
      if (формаОткрыта) return
      void загрузить(true)
    }

    window.addEventListener('focus', вернулись)
    document.addEventListener('visibilitychange', вернулись)
    return () => {
      clearInterval(тик)
      window.removeEventListener('focus', вернулись)
      document.removeEventListener('visibilitychange', вернулись)
    }
  }, [загрузить, session, формаОткрыта])

  return (
    <div className="sync">
      <div className="sync-main">
        <PartyMenu />
        {имяСвоего && <span className="sync-who">ты — {имяСвоего}</span>}
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
              setState({ kind: 'idle' })
            }}
          >
            Взять версию из пати
          </button>
          <button className="btn tiny" onClick={() => setIncoming(null)}>
            Оставить мою
          </button>
        </div>
      )}
    </div>
  )
}