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
 * Переключение режима не должно двигать карточку: оба пути занимают ровно
 * одну и ту же высоту. Поэтому поле и главная кнопка у режимов общие, а
 * пояснения лежат стопкой в одной ячейке сетки — видимое задаёт высоту,
 * скрытое резервирует место под более длинный текст.
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

  const вход = mode === 'enter'
  const подписьКнопки = auth.busy ? (вход ? 'Проверяю…' : 'Создаю…') : вход ? 'Войти' : 'Создать пати'

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
          type="button"
          aria-pressed={вход}
          className={вход ? 'on' : ''}
          onClick={() => сменить('enter')}
        >
          <span className="tab-icon" aria-hidden="true">
            <IconKey />
          </span>
          <span className="tab-copy">
            <span className="tab-title">Войти по токену</span>
            <span className="tab-hint">есть приглашение</span>
          </span>
        </button>
        <button
          type="button"
          aria-pressed={!вход}
          className={вход ? '' : 'on'}
          onClick={() => сменить('create')}
        >
          <span className="tab-icon" aria-hidden="true">
            <IconPlus />
          </span>
          <span className="tab-copy">
            <span className="tab-title">Создать пати</span>
            <span className="tab-hint">я лидер</span>
          </span>
        </button>
      </div>

      <div className="auth-body">
        <div className="field">
          <label htmlFor={вход ? 'party-token' : 'party-name'}>
            {вход ? 'Токен пати' : 'Название пати'}
          </label>
          <input
            key={mode}
            id={вход ? 'party-token' : 'party-name'}
            className={`input${вход ? ' mono' : ''}`}
            autoFocus
            placeholder={вход ? 'p2p_…' : 'например: Ночная гильдия'}
            value={вход ? auth.token : auth.partyName}
            onChange={(e) => (вход ? auth.setToken(e.target.value) : auth.setPartyName(e.target.value))}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              if (вход) auth.enterByToken()
              else auth.createNewParty()
            }}
          />
        </div>

        <button
          className="btn primary wide"
          disabled={auth.busy}
          onClick={вход ? auth.enterByToken : auth.createNewParty}
        >
          {подписьКнопки}
        </button>

        <div className="auth-notes">
          <p className={вход ? 'auth-note' : 'auth-note reserve'} aria-hidden={!вход}>
            Токен выдаёт мастер пати. Он хранится только в этом браузере и не связан с GitHub.
          </p>
          <p className={вход ? 'auth-note reserve' : 'auth-note'} aria-hidden={вход}>
            Мастер-токен остаётся у лидера. Игрокам выдаются отдельные токены — по одному на
            персонажа. Токены никак не связаны с GitHub.
          </p>
        </div>
      </div>

      {auth.error && <div className="auth-error">{auth.error}</div>}

      <div className="auth-foot">
        <span className="lock">●</span> Мастер-токен показывается один раз. Игрокам — отдельные
        токены.
      </div>
    </div>
  )
}

/** Ключ: вход по готовому приглашению. */
function IconKey() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="7" cy="12" r="4" />
      <path d="M11 12h10M16 12v3M20 12v3" />
    </svg>
  )
}

/** Плюс: создать свою пати. */
function IconPlus() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
