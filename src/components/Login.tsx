import { useState } from 'react'
import type { Db } from '@/types'
import { createParty, fetchDb, openSession, saveDb, type PartyInfo } from '@/lib/api'
import { BUILD_API_URL, PLACEHOLDER_API_URL, looksLikeUrl } from '@/lib/config'
import { getDb, replaceDb, signIn, updateSettings, useSettings } from '@/lib/store'

/**
 * Вход в приложение.
 *
 * Два пути: ввести токен, который дал лидер, или завести свою пати
 * и получить токен, чтобы передать его игрокам.
 */
export function Login({ onDone }: { onDone: (name: string) => void }) {
  const settings = useSettings()

  // Приоритет: адрес из сборки — потом уже сохранённый — потом спрашиваем.
  const preset = BUILD_API_URL || settings.apiUrl
  const [apiUrl, setApiUrl] = useState(preset)
  const [token, setToken] = useState('')
  const [partyName, setPartyName] = useState('')
  const [mode, setMode] = useState<'enter' | 'create'>('enter')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [issued, setIssued] = useState<{
    token: string
    name: string
    partyId: string
    role: 'owner' | 'member'
    apiUrl: string
  } | null>(null)
  const [showSettings, setShowSettings] = useState(!looksLikeUrl(preset))

  const url = apiUrl.trim().replace(/\/+$/, '')

  /** Адрес задаётся один раз и запоминается — дальше про него забываем. */
  const rememberUrl = () => {
    if (looksLikeUrl(url)) updateSettings({ apiUrl: url })
  }

  const enter = async () => {
    const t = token.trim()
    if (!t) {
      setError('Вставь токен пати')
      return
    }
    if (!looksLikeUrl(url)) {
      setError('Сначала укажи адрес базы — раскрой «Адрес сервера» внизу')
      setShowSettings(true)
      return
    }
    setBusy(true)
    setError(null)
    rememberUrl()
    const res = await openSession(url, t)
    if (!res.ok) {
      setBusy(false)
      setError(res.error)
      return
    }
    const info: PartyInfo = res.value

    // База на сервере — источник истины. Подтягиваем её сразу при входе,
    // иначе локальные данные окажутся «от другой версии» и первое же
    // сохранение упрётся в конфликт.
    const loaded = await fetchDb(url, t)
    if (loaded.ok) {
      replaceDb(loaded.value)
    } else if ((info.chars ?? 0) > 0) {
      // В базе что-то есть, но прочитать не вышло — предупреждаем,
      // чтобы игрок не подумал, что у пати пусто.
      setError('Войти удалось, но данные пати не загрузились. Попробуй «Загрузить» в шапке.')
    }

    setBusy(false)
    signIn({
      token: t,
      partyId: info.partyId,
      name: info.name,
      role: info.role,
      apiUrl: url,
      lastSyncedAt: loaded.ok ? loaded.value.updatedAt : '',
    })
    onDone(info.name)
  }

  const create = async () => {
    if (!looksLikeUrl(url)) {
      setError('Сначала укажи адрес базы — раскрой «Адрес сервера» внизу')
      setShowSettings(true)
      return
    }
    setBusy(true)
    setError(null)
    rememberUrl()
    const res = await createParty(url, partyName.trim())
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    // Войти сразу нельзя: signIn переключит приложение на основной экран
    // и размонтирует этот компонент вместе с токеном. Сначала показываем
    // токен — и только по кнопке пускаем в пати.
    setIssued({
      token: res.value.token,
      name: res.value.name,
      partyId: res.value.partyId,
      role: res.value.role,
      apiUrl: url,
    })
  }

  if (issued) {
    return (
      <TokenIssued
        token={issued.token}
        name={issued.name}
        onDone={async () => {
          // Только что созданная база пуста, но в браузере уже могут быть
          // данные. Заливаем их сразу — чтобы пати не начиналась с нуля и
          // первое сохранение не упиралось в конфликт.
          const base = await fetchDb(issued.apiUrl, issued.token)
          let lastSyncedAt = base.ok ? base.value.updatedAt : ''
          if (base.ok) {
            const mine: Db = {
              ...getDb(),
              updatedAt: new Date().toISOString(),
              updatedBy: settings.playerName,
            }
            const saved = await saveDb(issued.apiUrl, issued.token, mine, base.value.updatedAt)
            if (saved.ok) lastSyncedAt = saved.value.updatedAt
          }
          signIn({
            token: issued.token,
            partyId: issued.partyId,
            name: issued.name,
            role: issued.role,
            apiUrl: issued.apiUrl,
            lastSyncedAt,
          })
          onDone(issued.name)
        }}
      />
    )
  }

  return (
    <div className="login-wrap">
      <div className="login">
        <div className="login-brand">
          <span className="logo">⚔</span>
          <div>
            <h1>Party Pilot</h1>
            <p className="tag">экипировка пати · общая казна · хотелки</p>
          </div>
        </div>

        <div className="segmented login-tabs">
          <button className={mode === 'enter' ? 'on' : ''} onClick={() => { setMode('enter'); setError(null) }}>
            Войти по токену
          </button>
          <button className={mode === 'create' ? 'on' : ''} onClick={() => { setMode('create'); setError(null) }}>
            Создать свою пати
          </button>
        </div>

        {mode === 'enter' ? (
          <div className="form">
            <p className="hint">
              Токен даёт лидер пати — он в Дискорде, в чате или в личке. Токен хранится
              только в этом браузере.
            </p>
            <label>
              Токен пати
              <input
                className="input mono"
                autoFocus
                placeholder="p2p_…"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && enter()}
              />
            </label>
            <button className="btn primary wide" disabled={busy} onClick={enter}>
              {busy ? 'Проверяю…' : 'Войти'}
            </button>
          </div>
        ) : (
          <div className="form">
            <p className="hint">
              Создай пати и получи токен. Раздай его игрокам — по нему они получат
              доступ к общей базе. Токен никак не связан с GitHub.
            </p>
            <label>
              Название пати
              <input
                className="input"
                autoFocus
                placeholder="например: Ночная гильдия"
                value={partyName}
                onChange={(e) => setPartyName(e.target.value)}
              />
            </label>
            <button className="btn primary wide" disabled={busy} onClick={create}>
              {busy ? 'Создаю…' : 'Создать пати и получить токен'}
            </button>
          </div>
        )}

        {error && <div className="sync-msg err">{error}</div>}

        <div className="login-foot">
          <button className="link-btn" onClick={() => setShowSettings((v) => !v)}>
            {showSettings ? 'Скрыть' : 'Адрес сервера'}
          </button>
          {showSettings && (
            <label className="login-api">
              Адрес базы
              <input
                className="input mono"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder={PLACEHOLDER_API_URL}
              />
              <span className="hint">
                Нужен один раз. Обычному игроку пати это поле трогать не приходится:
                адрес подставляется сам при сборке.
              </span>
            </label>
          )}
        </div>
      </div>
    </div>
  )
}

/** Показ свежего токена с предупреждением, что он больше не появится. */
function TokenIssued({ token, name, onDone }: { token: string; name: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
    } catch {
      // Буфер обмена может быть недоступен — тогда копируй вручную.
      setCopied(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="login">
        <div className="login-brand">
          <span className="logo">⚔</span>
          <div>
            <h1>Пати «{name}» создана</h1>
            <p className="tag">это твой токен доступа</p>
          </div>
        </div>

        <div className="token-box">
          <code>{token}</code>
          <button className="btn" onClick={copy}>
            {copied ? 'Скопировано' : 'Скопировать'}
          </button>
        </div>

        <div className="sync-msg err">
          Токен показывается один раз. Если потеряешь — новый можно выпустить в
          настройках внутри приложения, старый сразу перестанет работать.
        </div>

        <p className="hint">
          Кидай этот токен игрокам в Дискорд или в чат. Они вставят его на экране
          входа и получат доступ к общей казне, хотелкам и комплектам пати.
        </p>

        <button className="btn primary wide" onClick={onDone}>
          Войти в пати
        </button>
      </div>
    </div>
  )
}
