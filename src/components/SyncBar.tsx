import { useState } from 'react'
import type { Db } from '@/types'
import {
  fetchDb,
  fetchMeta,
  rotateToken,
  saveDb,
  type PartyInfo,
} from '@/lib/api'
import type { CatalogApi } from '@/lib/catalog'
import {
  getDb,
  getSession,
  replaceDb,
  signIn,
  signOut,
  updateSession,
  updateSettings,
  useDb,
  useSettings,
} from '@/lib/store'
import { downloadJson, formatAgo, formatStamp } from '@/lib/util'

type SyncState =
  | { kind: 'idle' }
  | { kind: 'busy'; what: string }
  | { kind: 'ok'; text: string }
  | { kind: 'err'; text: string }

export function SyncBar({ catalog }: { catalog: CatalogApi }) {
  const db = useDb()
  const settings = useSettings()
  const session = getSession()!
  const [state, setState] = useState<SyncState>({ kind: 'idle' })
  const [open, setOpen] = useState(false)
  const [incoming, setIncoming] = useState<Db | null>(null)
  const [meta, setMeta] = useState<PartyInfo | null>(null)
  const [rotated, setRotated] = useState<string | null>(null)

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
    // кто-то поменял — сервер откажет, и мы покажем чужую версию.
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

  const doExport = () => {
    downloadJson(`party-pilot-${new Date().toISOString().slice(0, 10)}.json`, getDb())
    setState({ kind: 'ok', text: 'Файл с данными сохранён на диск' })
  }

  const doImport = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        replaceDb(JSON.parse(String(reader.result)) as Db)
        setState({ kind: 'ok', text: 'Данные загружены из файла' })
      } catch {
        setState({ kind: 'err', text: 'Не удалось прочитать файл: это не валидный JSON' })
      }
    }
    reader.readAsText(file)
  }

  const openPanel = async () => {
    const next = !open
    setOpen(next)
    if (next) {
      const res = await fetchMeta(session.apiUrl, session.token)
      if (res.ok) setMeta(res.value)
    }
  }

  const doRotate = async () => {
    if (
      !confirm(
        'Выпустить новый токен? Старый перестанет работать сразу — у всех, кто его\n' +
          'сохранил, придётся вводить новый.',
      )
    ) {
      return
    }
    setState({ kind: 'busy', what: 'Выпускаю новый токен…' })
    const res = await rotateToken(session.apiUrl, session.token)
    if (!res.ok) {
      setState({ kind: 'err', text: res.error })
      return
    }
    signIn({ ...session, token: res.value.token })
    setRotated(res.value.token)
    // Метка синхронизации сохраняется: база-то та же, сменился только ключ.
    setState({ kind: 'ok', text: 'Новый токен выпущен, старый отключён' })
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
        <button className="icon-btn" onClick={openPanel} title="Настройки пати">
          ⚙
        </button>
      </div>

      <div className="sync-note muted">
        пати: {session.name}
        {catalog.count > 0 && ` · справочник: ${catalog.count}`}
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
          <button
            className="btn tiny"
            onClick={() => {
              downloadJson(`party-pilot-mine-${new Date().toISOString().slice(0, 10)}.json`, getDb())
              setIncoming(null)
              setState({ kind: 'ok', text: 'Твоя версия выгружена в файл, теперь сохраняй поверх' })
            }}
          >
            Выгрузить мою версию в файл
          </button>
          <button className="btn tiny" onClick={() => setIncoming(null)}>
            Отмена
          </button>
        </div>
      )}

      {open && (
        <div className="sync-panel">
          <h4>Пати «{session.name}»</h4>
          <p className="hint">
            Доступ идёт по токену, GitHub тут ни при чём. Токен хранится только в этом
            браузере. {session.role === 'owner' ? 'Ты автор пати.' : 'Ты участник пати.'}
          </p>

          {meta && (
            <div className="kv">
              <span>Записей в базе</span>
              <b>
                {meta.chars ?? 0} перс. · изменено {meta.updatedAt ? formatAgo(meta.updatedAt) : '—'}
                {meta.updatedBy ? ` (${meta.updatedBy})` : ''}
              </b>
            </div>
          )}

          {rotated && (
            <div className="token-box">
              <code>{rotated}</code>
              <button
                className="btn"
                onClick={() => navigator.clipboard.writeText(rotated).catch(() => {})}
              >
                Скопировать
              </button>
              <span className="hint">Старый токен больше не работает.</span>
            </div>
          )}

          <div className="row gap">
            <button className="btn" onClick={doExport}>
              Выгрузить в файл
            </button>
            <label className="btn file">
              Загрузить из файла
              <input
                type="file"
                accept="application/json"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) doImport(f)
                  e.target.value = ''
                }}
              />
            </label>
            {session.role === 'owner' && (
              <button className="btn danger" disabled={busy} onClick={doRotate}>
                Сменить токен
              </button>
            )}
            <button
              className="btn danger"
              onClick={() => {
                if (confirm('Выйти из пати? Токен будет удалён из этого браузера.')) {
                  signOut()
                  location.reload()
                }
              }}
            >
              Выйти
            </button>
          </div>

          <p className="hint">
            Локальные изменения: {formatStamp(db.updatedAt)}
            {db.updatedBy ? ` (${db.updatedBy})` : ''}. После правок нажми «Сохранить».
          </p>
        </div>
      )}
    </div>
  )
}
