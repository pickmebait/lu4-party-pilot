import { useState } from 'react'
import { APP_NAME } from '@/lib/brand'
import type { IssuedParty } from '@/lib/partyAuth'

/**
 * Показ свежего токена с предупреждением, что он больше не появится.
 *
 * Стоит отдельно от карточки входа: пока токен на экране, вводить нечего,
 * и смешивать эти состояния в одной разметке — значит держать взаперти
 * десяток условий, которые никогда не встречаются одновременно.
 */
export function TokenIssued({
  party,
  busy,
  onEnter,
}: {
  party: IssuedParty
  busy: boolean
  onEnter: () => void
}) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(party.token)
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
          <h2>Пати «{party.name}» создана</h2>
          <p>Это твой токен доступа.</p>
        </div>
      </div>

      <div className="token-box">
        <code>{party.token}</code>
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
        меню «{party.name}» в правом верхнем углу. Там же видно, кому какой выдан, и можно
        перевыпустить или отозвать любой.
      </p>

      <button className="btn primary wide" disabled={busy} onClick={onEnter}>
        {busy ? 'Вхожу…' : 'Войти в пати'}
      </button>
    </div>
  )
}

/**
 * Сборка без адреса базы: приложение нельзя использовать до настройки.
 *
 * Это не поломка у игрока, а незавершённая настройка у того, кто разворачивал,
 * поэтому говорим прямо, кому и что делать.
 */
export function NotConfigured() {
  return (
    <div className="auth-card">
      <div className="auth-head">
        <div>
          <h2>{APP_NAME} не настроен</h2>
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
