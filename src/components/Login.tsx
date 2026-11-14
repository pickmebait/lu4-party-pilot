import { CONFIGURED } from '@/lib/config'
import { usePartyAuth, type AuthMode } from '@/lib/partyAuth'
import { NotConfigured, TokenIssued } from './AuthStates'

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
  mode,
  onModeChange,
}: {
  mode: AuthMode
  onModeChange: (mode: AuthMode) => void
}) {
  const auth = usePartyAuth()

  // Сборка без VITE_API_URL — это не поломка у игрока, а незавершённая
  // настройка у того, кто разворачивал.
  if (!CONFIGURED) return <NotConfigured />

  if (auth.issued) {
    return <TokenIssued party={auth.issued} busy={auth.busy} onEnter={auth.enterIssuedParty} />
  }

  const сменить = (next: AuthMode) => {
    onModeChange(next)
    auth.clearError()
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
          onClick={() => сменить('enter')}
        >
          Войти по токену
        </button>
        <button
          aria-pressed={mode === 'create'}
          className={mode === 'create' ? 'on' : ''}
          onClick={() => сменить('create')}
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
              value={auth.token}
              onChange={(e) => auth.setToken(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && auth.enterByToken()}
            />
          </div>
          <button className="btn primary wide" disabled={auth.busy} onClick={auth.enterByToken}>
            {auth.busy ? 'Проверяю…' : 'Войти'}
          </button>
          <p className="auth-note">
            Токен выдаёт мастер пати. Он хранится только в этом браузере и не связан с GitHub.
          </p>

          <div className="auth-sep">или</div>
          <button className="btn wide" onClick={() => сменить('create')}>
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
              value={auth.partyName}
              onChange={(e) => auth.setPartyName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && auth.createNewParty()}
            />
          </div>
          <button className="btn primary wide" disabled={auth.busy} onClick={auth.createNewParty}>
            {auth.busy ? 'Создаю…' : 'Создать пати и получить мастер-токен'}
          </button>
          <p className="auth-note">
            Мастер-токен остаётся у лидера. Игрокам выдаются отдельные токены — по одному на
            персонажа. Токены никак не связаны с GitHub.
          </p>

          <div className="auth-sep">или</div>
          <button className="btn wide" onClick={() => сменить('enter')}>
            Войти по токену
          </button>
        </>
      )}

      {auth.error && <div className="auth-error">{auth.error}</div>}

      <div className="auth-foot">
        <span className="lock">●</span> Мастер-токен показывается один раз. Игрокам — отдельные
        токены.
      </div>
    </div>
  )
}
