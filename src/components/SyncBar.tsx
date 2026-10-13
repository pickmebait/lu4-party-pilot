import { useState } from 'react'
import type { Db } from '@/types'
import { fetchDb, saveDb } from '@/lib/api'
import { getDb, getSession, replaceDb, updateSession, updateSettings, useSettings } from '@/lib/store'
import { formatAgo } from '@/lib/util'
import { PartyMenu } from './PartyMenu'

type SyncState =
  | { kind: 'idle' }
  | { kind: 'busy'; what: string }
  | { kind: 'ok'; text: string }
  | { kind: 'err'; text: string }

/**
 * Полоса синхронизации: ник, «Загрузить» и «Сохранить».
 *
 * Раньше здесь же жил доступ к пати — настройки, список участников,
 * выгрузка в файл. Всё это переехало в меню доступа: кнопка синхронизации
 * и кнопка настроек стояли рядом, а отвечали за разные вещи, и вторая
 * выглядела частью первой. Теперь полоса делает ровно одно — пишет и
 * читает общую базу.
 *
 * Спор о версиях не решён молча: если локальные правки не сохранены, а в
 * пати кто-то уже работал, показывается чужая версия и три кнопки —
 * принять её, отложить свою в файл или отойти. Терять чужую работу или
 * свою молча нельзя.
 */
export function SyncBar() {
  const settings = useSettings()
  const session = getSession()!
  const [state, setState] = useState<SyncState>({ kind: 'idle' })
  const [incoming, setIncoming] = useState<Db | null>(null)

  const busy = state.kind === 'busy'

  const doPull = async () => {
    setState({ kind: 'busy', what: 'Загружаю из пати…' })
    const res = await fetchDb(session.apiUrl, session.token)
    if (!res.ok) {
      setState({ kind: 'err', text: res.error })
      return
    }
    const remote = res.value
    const local = getDb()
    const dirty = (local.updatedAt ?? '') !== session.lastSyncedAt

    // Есть несохранённые правки и в базе кто-то уже работал — не затираем молча.
    if (dirty && (remote.updatedAt ?? '') !== session.lastSyncedAt) {
      setIncoming(remote)
      setState({
        kind: 'err',
        text: `В пати есть более свежая версия (от: ${remote.updatedBy || 'неизвестно'}, ${formatAgo(remote.updatedAt)}), а у тебя есть несохранённые правки. Выбери, что оставить.`,
      })
      return
    }
    replaceDb(remote)
    updateSession({ lastSyncedAt: remote.updatedAt })
    setState({
      kind: 'ok',
      text: `Загружено из пати${remote.updatedBy ? ` (от: ${remote.updatedBy})` : ''}`,
    })
  }

  const doPush = async () => {
    setState({ kind: 'busy', what: 'Сохраняю в пати…' })
    const current = getDb()
    // База на сервере та, что мы последний раз видели. Если с тех пор её
    // кто-то поменял — сервер отклонит, и мы покажем чужую версию.
    const res = await saveDb(session.apiUrl, session.token, current, session.lastSyncedAt)
    if (!res.ok) {
      if (res.conflict) {
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
        <button className="btn" disabled={busy} onClick={doPull}>
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
    </div>
  )
}