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
 */
export function ContactsModal({ char, onClose }: { char: Char; onClose: () => void }) {
  const [c, setC] = useState<Contacts>(char.contacts ?? {})
  const [имя] = useState(char.name || 'персонажа')

  const поле = (ключ: keyof Contacts, подпись: string, пример: string, тип = 'text') => (
    <label>
      {подпись}
      <input
        className="input"
        type={тип}
        autoFocus={ключ === 'realName'}
        value={c[ключ] ?? ''}
        placeholder={пример}
        onChange={(e) => setC({ ...c, [ключ]: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
          if (e.key === 'Enter') {
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
          Как связаться с человеком вне игры. Поля пустые — ничего не показывается.
        </p>

        <div className="form">
          {поле('realName', 'Имя в реальной жизни', 'Иван Петров')}
          {поле('phone', 'Телефон', '+7 999 123-45-67', 'tel')}
          {поле('telegram', 'Телеграм', '@nick или t.me/nick')}
          {поле('discord', 'Дискорд', 'ivan#1234 или ник')}
        </div>

        <div className="form-actions">
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
        </div>
      </div>
    </div>
  )
}
