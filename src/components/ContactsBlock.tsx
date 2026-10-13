import { useMemo, useState, type ReactNode } from 'react'
import type { Char } from '@/types'
import { discordLabel, discordLink, phoneLink, telegramLabel, telegramLink } from '@/lib/contacts'
import { IconDiscord, IconPhone, IconTelegram, IconUser } from './Icons'

/** Одна строка списка контактов. */
interface КонтактСтрока {
  ключ: string
  подпись: string
  значение: string
  /** Куда ведёт строка. У имени ссылки нет: его некуда открывать. */
  ссылка?: string
  подсказка: string
  иконка: ReactNode
}

/**
 * Контакты персонажа в виде строк «подпись — значение».
 *
 * Значения читаются в локальные переменные и проверяются на пустоту до
 * того, как из них строится ссылка. Раньше здесь стояли непустые
 * утверждения: проверка шла по результату phoneLink, а значение бралось
 * из char.contacts, который к тому моменту мог уже оказаться пустым —
 * TypeScript соглашался на !, и поле менялось бы без всякой ошибки.
 */
function строкиКонтактов(контакты: Char['contacts']): КонтактСтрока[] {
  const строки: КонтактСтрока[] = []
  if (!контакты) return строки

  const имя = контакты.realName?.trim() ?? ''
  const телефон = контакты.phone?.trim() ?? ''
  const телеграм = контакты.telegram?.trim() ?? ''
  const дискорд = контакты.discord?.trim() ?? ''

  if (имя) {
    строки.push({
      ключ: 'realName',
      подпись: 'Имя',
      значение: имя,
      подсказка: 'Имя в реальной жизни',
      иконка: <IconUser size={12} />,
    })
  }

  const ссылкаТелефона = телефон ? phoneLink(телефон) : null
  if (телефон && ссылкаТелефона) {
    строки.push({
      ключ: 'phone',
      подпись: 'Телефон',
      значение: телефон,
      ссылка: ссылкаТелефона,
      подсказка: 'Позвонить',
      иконка: <IconPhone size={12} />,
    })
  }

  const ссылкаТелеграма = телеграм ? telegramLink(телеграм) : null
  if (телеграм && ссылкаТелеграма) {
    строки.push({
      ключ: 'telegram',
      подпись: 'Телеграм',
      значение: telegramLabel(телеграм),
      ссылка: ссылкаТелеграма,
      подсказка: 'Открыть профиль в телеграме',
      иконка: <IconTelegram size={12} />,
    })
  }

  const ссылкаДискорда = дискорд ? discordLink(дискорд) : null
  if (дискорд && ссылкаДискорда) {
    строки.push({
      ключ: 'discord',
      подпись: 'Дискорд',
      значение: discordLabel(дискорд),
      ссылка: ссылкаДискорда,
      подсказка: 'Открыть профиль в дискорде',
      иконка: <IconDiscord size={12} />,
    })
  }

  return строки
}

/**
 * Блок контактов персонажа в карточке.
 *
 * Свёрнутое состояние показывает имя и значки заполненных каналов: чтобы
 * понять, что написано, не надо ничего раскрывать. Раньше в свёрнутом виде
 * было только имя, а остальное спрятано — и чтобы узнать, записан ли
 * телеграм, приходилось раскрывать и раскрывать обратно.
 *
 * Раскрытое состояние осталось списком «подпись — значение»: там нужно
 * видеть само значение, а не значок канала.
 *
 * Блок показан всегда, даже когда заполнять нечего. Раньше он просто
 * исчезал, и по карточке было не видно, что поле для связи есть и осталось
 * пустым: пустота молчаливого блока читалась как «контактов не
 * предусмотрено».
 */
export function ContactsBlock({ char, onEdit }: { char: Char; onEdit: () => void }) {
  const [open, setOpen] = useState(false)
  const строки = useMemo(() => строкиКонтактов(char.contacts), [char.contacts])

  const имя = char.contacts?.realName?.trim()
  // Каналы без имени в шапке не нужны: их иконки и так показывают, что
  // написано, а полные значения живут в раскрытом списке.
  const каналы = строки.filter((с) => с.ключ !== 'realName' && с.ссылка)

  return (
    <div className={`char-contacts${open ? ' open' : ''}`}>
      <button
        className="contacts-toggle"
        title={open ? 'Свернуть контакты' : 'Показать контакты'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <IconUser />
        <span className="contacts-brief">
          {строки.length > 0 ? имя || 'Контакты' : 'Контакты не заполнены'}
        </span>
        {каналы.length > 0 && (
          <span className="contacts-channels">
            {каналы.map((с) => (
              <a
                key={с.ключ}
                className="contacts-channel"
                href={с.ссылка}
                target={с.ссылка!.startsWith('http') ? '_blank' : undefined}
                rel={с.ссылка!.startsWith('http') ? 'noreferrer' : undefined}
                title={`${с.подпись}: ${с.значение} — ${с.подсказка.toLowerCase()}`}
                onClick={(e) => e.stopPropagation()}
              >
                {с.иконка}
              </a>
            ))}
          </span>
        )}
        <span className="chevron">{open ? '▾' : '▸'}</span>
      </button>

      {open &&
        (строки.length > 0 ? (
          <div className="contacts-list">
            {строки.map((строка) => (
              <div className="contacts-row" key={строка.ключ}>
                <span className="contacts-key">
                  {строка.иконка}
                  {строка.подпись}
                </span>
                {строка.ссылка ? (
                  <a
                    className="contacts-val link"
                    href={строка.ссылка}
                    target={строка.ссылка.startsWith('http') ? '_blank' : undefined}
                    rel={строка.ссылка.startsWith('http') ? 'noreferrer' : undefined}
                    title={строка.подсказка}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {строка.значение}
                  </a>
                ) : (
                  <span className="contacts-val" title={строка.подсказка}>
                    {строка.значение}
                  </span>
                )}
              </div>
            ))}
            <div className="contacts-row">
              <span className="contacts-key" />
              <button className="btn tiny" onClick={onEdit}>
                Изменить
              </button>
            </div>
          </div>
        ) : (
          <div className="contacts-list">
            <p className="contacts-none">
              Не заполнены. Заполнить — кнопкой с трубкой справа.
            </p>
          </div>
        ))}
    </div>
  )
}