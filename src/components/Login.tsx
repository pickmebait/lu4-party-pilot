import { useState } from 'react'
import { createParty, fetchDb, openSession, type PartyInfo } from '@/lib/api'
import { API_URL, CONFIGURED } from '@/lib/config'
import { APP_NAME } from '@/lib/brand'
import { replaceDb, signIn, signOut } from '@/lib/store'
import { PaletteBar } from './PaletteBar'
import { Tagline } from './Tagline'

/**
 * Вход в приложение.
 *
 * Два пути: вставить токен, который выдал лидер пати, или завести свою пати
 * и получить токен, чтобы передать игрокам.
 *
 * Адрес базы вшит в сборку при развёртывании (VITE_API_URL) — вводить его
 * здесь незачем, поэтому и не предлагаем.
 */
export function Login({ onDone }: { onDone: (name: string) => void }) {
  const [token, setToken] = useState('')
  const [partyName, setPartyName] = useState('')
  const [mode, setMode] = useState<'enter' | 'create'>('enter')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [issued, setIssued] = useState<{
    token: string
    name: string
    partyId: string
  } | null>(null)

  const enter = async () => {
    const t = token.trim()
    if (!t) {
      setError('Вставь токен пати')
      return
    }
    setBusy(true)
    setError(null)

    const res = await openSession(API_URL, t, true)
    if (!res.ok) {
      setBusy(false)
      setError(res.error)
      return
    }
    const info: PartyInfo = res.value

    // База на сервере — источник истины. Подтягиваем её сразу при входе,
    // иначе локальные данные окажутся «от другой версии» и первое же
    // сохранение упрётся в конфликт.
    const loaded = await fetchDb(API_URL, t)

    setBusy(false)
    /*
     * Старая сессия выбрасывается до входа.
     *
     * Экран входа бывает не только на пустом месте: вышел из пати, сменил
     * браузерную папку, вернулся по старой вкладке. Если оставить прошлую
     * сессию на месте, вход по новому токену может завершиться, а приложение
     * откроет ту пати, из которой человек только что вышел. Вход идёт
     * ровно по тому токену, который введён или только что выдан.
     *
     * И вход идёт раньше базы: вход поднимает базу этой пати, а база из
     * сети кладётся поверх. Наоборот нельзя — тогда вход стёр бы только что
     * прочитанное.
     */
    signOut()
    signIn({
      token: t,
      partyId: info.partyId,
      name: info.name,
      role: info.role,
      charId: info.charId ?? null,
      apiUrl: API_URL,
      lastSyncedAt: loaded.ok ? loaded.value.updatedAt : '',
    })

    /*
     * О неудачном чтении здесь предупредить нечем: следующая строка переключает
     * приложение на основной экраном, и надпись уйдёт вместе с этим экраном.
     * Про пустую базу скажет полоса синхронизации — она останется на виду и
     * дотянет данные сама, как только связь вернётся.
     */
    if (loaded.ok) replaceDb(loaded.value)
    onDone(info.name)
  }

  const create = async () => {
    setBusy(true)
    setError(null)
    const res = await createParty(API_URL, partyName.trim())
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
    })
  }

  // Сборка без VITE_API_URL — это не поломка у игрока, а незавершённая
  // настройка у того, кто разворачивал. Говорим прямо, кому и что делать.
  if (!CONFIGURED) return <NotConfigured />

  if (issued) {
    return (
      <TokenIssued
        token={issued.token}
        name={issued.name}
        onDone={async () => {
          /*
           * Новая пати начинается пустой, и в неё ничего не переносится.
           *
           * Раньше сюда заливалась база из браузера — «чтобы не начинать с
           * нуля». Но в браузере лежала база прошлой пати, и новый мастер-токен
           * уезжал с чужими персонажами: человек создавал пати, входил, а видел
           * состав другой. Причина тут не в свежести, а в том, что переносить
           * было нечего: сервер только что создал пустую базу.
           *
           * Если что-то и лежит в браузере незаписанным, оно доживёт своей
           * очереди: синхронизация выложит его от прежней пати, а этой пати оно
           * не чужое.
           */
          const base = await fetchDb(API_URL, issued.token)
          signOut()
          signIn({
            token: issued.token,
            partyId: issued.partyId,
            name: issued.name,
            role: 'master',
            charId: null,
            apiUrl: API_URL,
            lastSyncedAt: base.ok ? base.value.updatedAt : '',
          })
          if (base.ok) replaceDb(base.value)
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
            <h1>{APP_NAME}</h1>
            <Tagline />
          </div>
          {/* Палитра действует на всё приложение, значит её можно выбрать и
              не заходя внутрь — тем более, что цвет страницы тут и виден. */}
          <PaletteBar />
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
              Токен выдаёт тот, у кого мастер-токен, — он в Дискорде, в чате или в личке.
              Токен хранится только в этом браузере.
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
              Создай пати и получи мастер-токен: он остаётся у тебя, а игрокам ты
              выпускаешь отдельный токен на каждого — по нему они видят всю пати, но
              правят только своего персонажа. Токены никак не связаны с GitHub.
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
              {busy ? 'Создаю…' : 'Создать пати и получить мастер-токен'}
            </button>
          </div>
        )}

        {error && <div className="sync-msg err">{error}</div>}
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
          Мастер-токен показывается один раз. Если потеряешь — перевыпусти в меню
          доступа справа вверху; прежний сразу перестанет работать вместе со всеми
          токенами игроков.
        </div>

        <p className="hint">
          Этот токен остаётся у тебя. Игрокам выпускай отдельные токены — по одному
          на персонажа, из меню «{name}» в правом верхнем углу. Там же видно, кому
          какой выдан, и можно перевыпустить или отозвать любой.
        </p>

        <button className="btn primary wide" onClick={onDone}>
          Войти в пати
        </button>
      </div>
    </div>
  )
}

/** Сборка без адреса базы: приложение нельзя использовать до настройки. */
function NotConfigured() {
  return (
    <div className="login-wrap">
      <div className="login">
        <div className="login-brand">
          <span className="logo">⚔</span>
          <div>
            <h1>Приложение не настроено</h1>
            <p className="tag">нет адреса базы</p>
          </div>
        </div>
        <p className="hint">
          Адрес базы должен быть зашит в сборку, но при сборке не был задан.
          Это значит, что разворачивал не ты — напиши тому, кто размещал сайт.
        </p>
        <p className="hint">
          Тому, кто разворачивает: задай переменную{' '}
          <code>VITE_API_URL</code> в репозитории (Settings → Secrets and
          variables → Actions → Variables) со значением адреса Worker'а и
          перезапусти деплой.
        </p>
      </div>
    </div>
  )
}
