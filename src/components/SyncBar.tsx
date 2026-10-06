import { useState } from 'react'
import type { Db } from '@/types'
import type { CatalogApi } from '@/lib/catalog'
import { describeTarget, probe, push, type RemoteConfig } from '@/lib/github'
import {
  getDb,
  replaceDb,
  updateSettings,
  useDb,
  useSettings,
} from '@/lib/store'
import { downloadJson, formatAgo, formatStamp } from '@/lib/util'

type SyncState =
  | { kind: 'idle' }
  | { kind: 'busy'; what: 'pull' | 'push' }
  | { kind: 'ok'; text: string }
  | { kind: 'err'; text: string }

export function SyncBar({ catalog }: { catalog: CatalogApi }) {
  const db = useDb()
  const settings = useSettings()
  const [state, setState] = useState<SyncState>({ kind: 'idle' })
  const [open, setOpen] = useState(false)
  const [cfg, setCfg] = useState<RemoteConfig>(settings.remote)
  const [incoming, setIncoming] = useState<Db | null>(null)

  const busy = state.kind === 'busy'

  const doPull = async () => {
    setState({ kind: 'busy', what: 'pull' })
    const res = await probe(cfg)
    if (!res.ok) {
      setState({ kind: 'err', text: res.error })
      return
    }
    if (!res.value.exists || !res.value.db) {
      setState({
        kind: 'err',
        text: `Файл ${describeTarget(cfg)} не найден. Сначала сохрани данные — он создастся при первой записи.`,
      })
      return
    }
    const remote = res.value.db
    const local = getDb()
    const remoteNewer = (remote.updatedAt ?? '') > (local.updatedAt ?? '')
    if (remoteNewer && local.chars.length + db.wishes.length > 0) {
      // Не затираем локальные данные молча — показываем оба варианта.
      setIncoming(remote)
      setState({
        kind: 'err',
        text: `В репозитории более свежая версия (от: ${remote.updatedBy || 'неизвестно'}, ${formatAgo(remote.updatedAt)}). Выбери, что оставить.`,
      })
      return
    }
    replaceDb(remote)
    setState({
      kind: 'ok',
      text: `Загружено из репозитория${remote.updatedBy ? ` (от: ${remote.updatedBy})` : ''}`,
    })
  }

  const doPush = async () => {
    setState({ kind: 'busy', what: 'push' })
    updateSettings({ remote: cfg })
    const res = await push(cfg, settings.token, getDb(), settings.playerName)
    if (!res.ok) {
      setState({ kind: 'err', text: res.error })
      return
    }
    // Запись в репозитории меняет файл — забираем свежую метку времени.
    const fresh = await probe(cfg, settings.token)
    if (fresh.ok && fresh.value.db) replaceDb(fresh.value.db)
    setState({ kind: 'ok', text: `Сохранено в ${describeTarget(cfg)}` })
  }

  const doExport = () => {
    downloadJson(`party-pilot-${new Date().toISOString().slice(0, 10)}.json`, getDb())
    setState({ kind: 'ok', text: 'Файл с данными сохранён на диск' })
  }

  const doImport = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Db
        replaceDb(parsed)
        setState({ kind: 'ok', text: 'Данные загружены из файла' })
      } catch {
        setState({ kind: 'err', text: 'Не удалось прочитать файл: это не валидный JSON' })
      }
    }
    reader.readAsText(file)
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
        <button
          className="btn"
          disabled={busy}
          onClick={doPush}
          title={settings.token ? 'Записать data.json в репозиторий' : 'Нужен токен — открой настройки'}
        >
          Сохранить
        </button>
        <button className="icon-btn" onClick={() => setOpen((v) => !v)} title="Настройки синхронизации">
          ⚙
        </button>
      </div>

      {catalog.count > 0 && (
        <div className="sync-note muted">
          Справочник: {catalog.count} предметов
        </div>
      )}

      {state.kind === 'busy' && (
        <div className="sync-msg">{state.what === 'pull' ? 'Загружаю…' : 'Сохраняю…'}</div>
      )}
      {state.kind === 'ok' && <div className="sync-msg ok">{state.text}</div>}
      {state.kind === 'err' && <div className="sync-msg err">{state.text}</div>}

      {incoming && (
        <div className="sync-actions">
          <button
            className="btn primary tiny"
            onClick={() => {
              replaceDb(incoming)
              setIncoming(null)
              setState({ kind: 'ok', text: 'Принята версия из репозитория' })
            }}
          >
            Взять версию из репозитория
          </button>
          <button
            className="btn tiny"
            onClick={() => {
              downloadJson(`party-pilot-local-${new Date().toISOString().slice(0, 10)}.json`, getDb())
              setIncoming(null)
              setState({ kind: 'ok', text: 'Локальная копия выгружена, теперь можно сохранять поверх' })
            }}
          >
            Сохранить мою версию в файл и перезаписать
          </button>
          <button className="btn tiny" onClick={() => setIncoming(null)}>
            Отмена
          </button>
        </div>
      )}

      {open && (
        <div className="sync-panel">
          <h4>Общая база в репозитории</h4>
          <p className="hint">
            Все данные лежат в одном файле <code>data/data.json</code>. Чтение — без токена,
            репозиторий публичный. Запись требует токена.
          </p>

          <div className="grid-2">
            <label>
              Владелец
              <input className="input" value={cfg.owner} onChange={(e) => setCfg({ ...cfg, owner: e.target.value })} />
            </label>
            <label>
              Репозиторий
              <input className="input" value={cfg.repo} onChange={(e) => setCfg({ ...cfg, repo: e.target.value })} />
            </label>
            <label>
              Ветка
              <input className="input" value={cfg.branch} onChange={(e) => setCfg({ ...cfg, branch: e.target.value })} />
            </label>
            <label>
              Путь к файлу
              <input className="input" value={cfg.path} onChange={(e) => setCfg({ ...cfg, path: e.target.value })} />
            </label>
          </div>

          <label>
            Токен (хранится только в этом браузере)
            <input
              className="input"
              type="password"
              placeholder="github_pat_…"
              value={settings.token}
              onChange={(e) => updateSettings({ token: e.target.value })}
            />
          </label>
          <p className="hint">
            Fine-grained токен с правом <b>Contents: Read and write</b> только на этот репозиторий.
            Токен не попадает в репозиторий и не передаётся третьим лицам. Подробнее — в README.
          </p>

          <div className="row gap">
            <button
              className="btn primary"
              onClick={() => {
                updateSettings({ remote: cfg })
                setState({ kind: 'ok', text: 'Настройки сохранены' })
              }}
            >
              Сохранить настройки
            </button>
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
          </div>

          <p className="hint">
            Локально данные менялись: {formatStamp(db.updatedAt)}
            {db.updatedBy ? ` (${db.updatedBy})` : ''}
          </p>
        </div>
      )}
    </div>
  )
}
