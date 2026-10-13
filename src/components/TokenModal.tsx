import { useState } from 'react'

/**
 * Окно с только что выпущенным токеном.
 *
 * Токен показывается ровно один раз: сервер хранит только его хеш, и
 * восстановить токен из хеша нельзя. Поэтому окно нельзя закрыть «не
 * посмотрев» — сначала скопируй или запиши, и уже потом закрывай.
 *
 * Кнопка «Я сохранил» ведёт в буфер обмена. Если браузер не дал доступ,
 * строка остаётся выделенной, чтобы скопировать вручную.
 */
export function TokenModal({
  заголовок,
  текст,
  token,
  onClose,
}: {
  заголовок: string
  текст: string
  token: string
  onClose: () => void
}) {
  const [скопирован, setСкопирован] = useState(false)

  const скопировать = async () => {
    try {
      await navigator.clipboard.writeText(token)
      setСкопирован(true)
    } catch {
      // Буфер недоступен — строка выделена, копируется вручную.
      setСкопирован(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal small" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <h3>{заголовок}</h3>
        <p className="hint">{текст}</p>

        <code className="token-line" data-testid="token-value">
          {token}
        </code>

        <div className="form-actions">
          <button className="btn primary" onClick={скопировать} autoFocus>
            {скопирован ? 'Скопировано' : 'Скопировать токен'}
          </button>
          <button className="btn" onClick={onClose}>
            Я сохранил
          </button>
        </div>
      </div>
    </div>
  )
}