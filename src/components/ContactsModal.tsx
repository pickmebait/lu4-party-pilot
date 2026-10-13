import { useState } from 'react'
import { setCharContacts } from '@/lib/store'
import type { Char, Contacts } from '@/types'

/**
 * Окно контактов персонажа.
 *
 * Пишут по-разному — @nick, t.me/nick, +7 999 123-45-67 — поэтому рядом с
 * каждым полем показан пример, в каком виде ссылка будет рабочей. Хранить
 * приводится к ссылке только при показе, в базе остаётся то, что человек
 * напечатал.
 *
 * правый = false — окно открывается только посмотреть: из вида «Колонка»
 * контакты открываются щелчком по имени, и у чужого персонажа правки быть
 * не должно.
 */
export function ContactsModal({
  char,
  правый = true,
  onClose,
}: {
  char: Char
  правый?: boolean
  onClose: () => void
}) {
  const [c, setC] = useState<Contacts>(char.contacts ?? {})
  const [имя] = useState(char.name || 'персонажа')

  const поле = (ключ: keyof Contacts, подпись: string, пример: string, тип = 'text') => (
    <label>
      {подпись}
      <input
        className="input"
        type={тип}
        autoFocus={правый && ключ === 'realName'}
        readOnly={!правый}
        value={c[ключ] ?? ''}
        placeholder={правый ? пример : 'не заполнено'}
        onChange={(e) => setC({ ...c, [ключ]: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
          if (e.key === 'Enter' && правый) {
            setCharContacts(char.id, c)
            onClose()
          }
        }}
      />
    </label>
  )

  const пусто = !c.realName && !c.phone && !c.telegram && !c.discord

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal small" onClick={(e) => e.stopPropagation()}>
        <h3>Контакты — {имя}</h3>
        <p className="hint">
          {правый
            ? 'Как связаться с человеком вне игры. Поля пустые — ничего не показывается.'
            : 'Только просмотр: токен персонажа правит контакты только своего персонажа.'}
        </p>

        <div className="form">
          {поле('realName', 'Имя в реальной жизни', 'Иван Петров')}
          {поле('phone', 'Телефон', '+7 999 123-45-67', 'tel')}
          {поле('telegram', 'Телеграм', '@nick или t.me/nick')}
          {поле('discord', 'Дискорд', 'ivan#1234 или ник')}
        </div>

        <div className="form-actions">
          {правый && (
            <>
              <button
                className="btn"
                onClick={() => {
                  setCharContacts(char.id, undefined)
                  onClose()
                }}
                disabled={пусто}
              >
                Очистить
              </button>
              <button className="btn" onClick={onClose}>
                Отмена
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  setCharContacts(char.id, c)
                  onClose()
                }}
              >
                Сохранить
              </button>
            </>
          )}
          {!правый && (
            <button className="btn primary" onClick={onClose} autoFocus>
              Закрыть
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
