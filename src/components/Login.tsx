import { useState } from 'react'
import { createParty, fetchDb, openSession, type PartyInfo } from '@/lib/api'
import { API_URL, CONFIGURED } from '@/lib/config'
import { replaceDb, signIn, signOut } from '@/lib/store'

export type AuthMode = 'enter' | 'create'

/**
 * Вход в приложение.
 *
 * Два пути: вставить токен, который выдал лидер пати, или завести свою пати
 * и получить токен, чтобы передать игрокам. Карточка стоит прямо в первом
 * экране лендинга, поэтому её высота и ширина рассчитаны на соседство с
 * заголовком, а не на отдельную страницу.
 *
 * Адрес базы вшит в сборку при развёртывании (VITE_API_URL) — вводить его
 * здесь незачем, поэтому и не предлагаем.
 */
export function Login({
  onDone,
  mode,
  onModeChange,
}: {
  onDone: (name: string) => void
  mode: AuthMode
  onModeChange: (mode: AuthMode) => void
}) {
  const [token, setToken] = useState('')
  const [partyName, setPartyName] = useState('')
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
     * приложение на основной экран, и надпись уйдёт вместе с этим экраном.
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
    <div className="auth-card">
      <div className="auth-head">
        <div>
          <h2>Вход в пати</h2>
          <p>Один токен — и вы внутри.</p>
        </div>
        <span className="auth-badge">pre-alpha</span>
      </div>

      <div className="tabs" role="group" aria-label="Вход или создание пати">
        <button
          aria-pressed={mode === 'enter'}
          className={mode === 'enter' ? 'on' : ''}
          onClick={() => {
            onModeChange('enter')
            setError(null)
          }}
        >
          Войти по токену
        </button>
        <button
          aria-pressed={mode === 'create'}
          className={mode === 'create' ? 'on' : ''}
          onClick={() => {
            onModeChange('create')
            setError(null)
          }}
        >
          Создать пати
        </button>
      </div>

      {mode === 'enter' ? (
        <>
          <div className="field">
            <label htmlFor="party-token">Токен пати</label>
            <input
              id="party-token"
              className="input mono"
              autoFocus
              placeholder="p2p_…"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && enter()}
            />
          </div>
          <button className="btn primary wide" disabled={busy} onClick={enter}>
            {busy ? 'Проверяю…' : 'Войти'}
          </button>
          <p className="auth-note">
            Токен выдаёт мастер пати. Он хранится только в этом браузере и не связан с GitHub.
          </p>

          <div className="auth-sep">или</div>
          <button
            className="btn wide"
            onClick={() => {
              onModeChange('create')
              setError(null)
            }}
          >
            Создать пати и получить мастер-токен
          </button>
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor="party-name">Название пати</label>
            <input
              id="party-name"
              className="input"
              autoFocus
              placeholder="например: Ночная гильдия"
              value={partyName}
              onChange={(e) => setPartyName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
            />
          </div>
          <button className="btn primary wide" disabled={busy} onClick={create}>
            {busy ? 'Создаю…' : 'Создать пати и получить мастер-токен'}
          </button>
          <p className="auth-note">
            Мастер-токен остаётся у лидера. Игрокам выдаются отдельные токены — по одному на
            персонажа. Токены никак не связаны с GitHub.
          </p>

          <div className="auth-sep">или</div>
          <button
            className="btn wide"
            onClick={() => {
              onModeChange('enter')
              setError(null)
            }}
          >
            Войти по токену
          </button>
        </>
      )}

      {error && <div className="auth-error">{error}</div>}

      <div className="auth-foot">
        <span className="lock">●</span> Мастер-токен показывается один раз. Игрокам — отдельные
        токены.
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
    <div className="auth-card">
      <div className="auth-head">
        <div>
          <h2>Пати «{name}» создана</h2>
          <p>Это твой токен доступа.</p>
        </div>
      </div>

      <div className="token-box">
        <code>{token}</code>
        <button className="btn" onClick={copy}>
          {copied ? 'Скопировано' : 'Скопировать'}
        </button>
      </div>

      <div className="auth-warning">
        Мастер-токен показывается один раз. Если потеряешь — перевыпусти в меню доступа справа
        вверху; прежний сразу перестанет работать вместе со всеми токенами игроков.
      </div>

      <p className="auth-note">
        Этот токен остаётся у тебя. Игрокам выпускай отдельные токены — по одному на персонажа, из
        меню «{name}» в правом верхнем углу. Там же видно, кому какой выдан, и можно перевыпустить
        или отозвать любой.
      </p>

      <button className="btn primary wide" onClick={onDone}>
        Войти в пати
      </button>
    </div>
  )
}

/** Сборка без адреса базы: приложение нельзя использовать до настройки. */
function NotConfigured() {
  return (
    <div className="auth-card">
      <div className="auth-head">
        <div>
          <h2>Приложение не настроено</h2>
          <p>Нет адреса базы.</p>
        </div>
      </div>
      <p className="auth-note">
        Адрес базы должен быть зашит в сборку, но при сборке не был задан. Это значит, что
        разворачивал не ты — напиши тому, кто размещал сайт.
      </p>
      <p className="auth-note">
        Тому, кто разворачивает: задай переменную <code>VITE_API_URL</code> в репозитории (Settings →
        Secrets and variables → Actions → Variables) со значением адреса Worker'а и перезапусти
        деплой.
      </p>
    </div>
  )
}
