import type { TokenInfo } from '@/lib/api'
import { formatAgo, formatStamp } from '@/lib/util'

/**
 * Таблица выпущенных токенов.
 *
 * Отдельный файл, а не часть меню: разметка зависит только от списка токенов
 * и пояса, поэтому её можно проверить без сессии, сервера и открытых окон.
 * Даты читаются в поясе пользователя — тем же, что и время в расписании.
 */
export function TokensTable({
  токены,
  пояс,
  занят,
  onПеревыпустить,
  onОтозвать,
}: {
  токены: TokenInfo[]
  пояс: string
  занят: string | null
  onПеревыпустить: (t: TokenInfo) => void
  onОтозвать: (t: TokenInfo) => void
}) {
  if (токены.length === 0) return null

  return (
    <div className="party-token-scroll">
      <table className="party-token-table">
        <thead>
          <tr>
            <th>Персонаж</th>
            <th>Создан</th>
            <th>Активность</th>
            <th aria-label="Действия" />
          </tr>
        </thead>
        <tbody>
          {токены.map((t) => (
            <tr key={t.id}>
              <td className="party-token-name" title={t.charName}>
                {t.charName}
              </td>
              <td
                className="party-token-date"
                title={`Токен выпущен ${formatAgo(t.createdAt)}`}
              >
                {formatStamp(t.createdAt, пояс)}
              </td>
              <td
                className={`party-token-date${t.lastUsedAt ? '' : ' party-token-none'}`}
                title={
                  t.lastUsedAt
                    ? `Последняя активность ${formatAgo(t.lastUsedAt)}`
                    : 'Этим токеном ещё ни разу не пользовались'
                }
              >
                {t.lastUsedAt ? formatStamp(t.lastUsedAt, пояс) : 'не было'}
              </td>
              <td className="party-token-actions">
                <button
                  className="icon-btn tiny"
                  disabled={занят === t.id}
                  title="Выпустить новый токен; прежний перестанет работать"
                  aria-label={`Перевыпустить токен ${t.charName}`}
                  onClick={() => onПеревыпустить(t)}
                >
                  ↻
                </button>
                <button
                  className="icon-btn tiny danger"
                  disabled={занят === t.id}
                  title="Отозвать токен"
                  aria-label={`Отозвать токен ${t.charName}`}
                  onClick={() => onОтозвать(t)}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
