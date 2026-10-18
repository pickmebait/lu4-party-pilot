import { useEffect, useRef, useState } from 'react'
import type { Char } from '@/types'
import {
  deleteParty,
  fetchMeta,
  issueCharToken,
  renameParty,
  revokeToken,
  rotateMaster,
  type PartyMeta,
  type TokenInfo,
} from '@/lib/api'
import { getSession, signIn, signOut, updateSession, useDb } from '@/lib/store'
import { formatAgo } from '@/lib/util'
import { ConfirmModal, ПАУЗА_ПАТИ_СЕКУНД } from './ConfirmModal'
import { TokenModal } from './TokenModal'

/**
 * Меню доступа: что это за пати, каким токеном в неё вошли и что с этим
 * токеном можно сделать.
 *
 * Раньше здесь были три разные вещи — синхронизация, настройки пати и выгрузка
 * в файл, — и панель настроек прятала главное: кто вошёл и на что имеет
 * право. Теперь кнопка всегда показывает название пати и вид токена, а
 * внутри — ровно те действия, которые доступны этому токену. У токена
 * персонажа из действий остаётся выход: всё остальное сервер всё равно
 * отклонил бы.
 *
 * Загрузка и выгрузка в файл убраны: база и так лежит на сервере, а файл
 * рядом с ней был вторым источником правды, который никто не поддерживал.
 */
export function PartyMenu() {
  const session = getSession()!
  const db = useDb()
  const [open, setOpen] = useState(false)
  const [meta, setMeta] = useState<PartyMeta | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Токен, который только что выпущен: показывается один раз. */
  const [выдан, setВыдан] = useState<{ token: string; заголовок: string } | null>(null)
  const [выборПерсонажа, setВыборПерсонажа] = useState(false)
  const [подтвердитьУдаление, setПодтвердитьУдаление] = useState(false)
  /** Правка названия пати: открыта по кнопке, живёт только пока открыта. */
  const [правкаИмени, setПравкаИмени] = useState(false)
  const [новоеИмя, setНовоеИмя] = useState('')
  const root = useRef<HTMLDivElement>(null)

  const свой = session.role === 'char' ? session.charId : null
  const имяСвоего = свой ? (db.chars.find((c) => c.id === свой)?.name?.trim() ?? '') : ''

  /*
   * Щелчок мимо кнопки закрывает меню. Слушатель ставится только пока меню
   * открыто: постоянный слушатель на документе жил бы всё время работы
   * приложения ради одного открытого окна.
   */
  useEffect(() => {
    if (!open) return
    const вне = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const клавиша = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', вне)
    document.addEventListener('keydown', клавиша)
    return () => {
      document.removeEventListener('mousedown', вне)
      document.removeEventListener('keydown', клавиша)
    }
  }, [open])

  /** Данные панели берём при открытии: там список токенов, он меняется не сам. */
  useEffect(() => {
    if (!open) return
    // Старая ошибка не должна висеть над свежим списком: она относилась к
    // прошлой попытке и к этому открытию отношения не имеет.
    setError(null)
    let отменено = false
    fetchMeta(session.apiUrl, session.token).then((res) => {
      if (отменено) return
      if (res.ok) setMeta(res.value)
      else setError(res.error)
    })
    return () => {
      отменено = true
    }
  }, [open, session.apiUrl, session.token])

  const мастер = session.role === 'master'

  const выпустить = async (charId: string) => {
    const персонаж = db.chars.find((c) => c.id === charId)
    setError(null)
    setBusy(charId)
    const res = await issueCharToken(session.apiUrl, session.token, charId)
    setBusy(null)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setВыборПерсонажа(false)
    setMeta(null)
    setВыдан({
      token: res.value.token,
      заголовок: `Токен для «${персонаж?.name || 'персонажа'}»`,
    })
  }

  const перевыпустить = async (t: TokenInfo) => {
    setError(null)
    setBusy(t.id)
    const res = await issueCharToken(session.apiUrl, session.token, t.charId)
    setBusy(null)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setMeta(null)
    setВыдан({ token: res.value.token, заголовок: `Новый токен для «${t.charName}»` })
  }

  const отозвать = async (t: TokenInfo) => {
    setError(null)
    setBusy(t.id)
    const res = await revokeToken(session.apiUrl, session.token, t.id)
    setBusy(null)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setMeta(null)
  }

  const переименовать = async () => {
    const имя = новоеИмя.trim()
    if (!имя) {
      setError('Название не может быть пустым')
      return
    }
    if (имя.length > 40) {
      setError('Название длиннее 40 символов')
      return
    }
    setError(null)
    setBusy('name')
    const res = await renameParty(session.apiUrl, session.token, имя)
    setBusy(null)
    if (!res.ok) {
      setError(res.error)
      return
    }
    // Название живёт в шапке приложения, поэтому оно меняется в сессии:
    // без этого кнопка в правом верхнем углу продолжила бы показывать
    // прежнее имя до перезагрузки.
    updateSession({ name: res.value.name })
    setПравкаИмени(false)
    setMeta(null)
  }

  const перевыпуститьМастер = async () => {
    setError(null)
    setBusy('master')
    const res = await rotateMaster(session.apiUrl, session.token)
    setBusy(null)
    if (!res.ok) {
      setError(res.error)
      return
    }
    // Мастер-токен сменился — старый в этом браузере уже не годится.
    signIn({ ...session, token: res.value.token })
    setMeta(null)
    setВыдан({
      token: res.value.token,
      заголовок: 'Новый мастер-токен',
    })
  }

  const удалитьПати = async () => {
    setBusy('delete')
    const res = await deleteParty(session.apiUrl, session.token)
    setBusy(null)
    if (!res.ok) {
      setError(res.error)
      setПодтвердитьУдаление(false)
      return
    }
    signOut()
    location.reload()
  }

  const выйти = () => {
    if (!confirm('Выйти из пати? Токен будет удалён из этого браузера.')) return
    signOut()
    location.reload()
  }

  /*
   * Список приводится к массиву на всякий случай: сервер отдаёт его только
   * мастеру и отдаёт списком, но при развёртывании в два захода старая
   * версия Worker'а пришлёт на этом месте число. Число на месте списка
   * токенов сорвало бы разметку, а не тихо показало пустоту.
   */
  const токены: TokenInfo[] = Array.isArray(meta?.tokens) ? meta.tokens : []
  const безТокена = мастер && токены.length === 0 && meta !== null

  return (
    <div className="party" ref={root}>
      <button
        className={`party-btn${open ? ' on' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="Название пати и вид токена"
      >
        <span className="party-name">{session.name}</span>
        <span className={`party-role ${мастер ? 'master' : 'char'}`}>
          {мастер ? 'мастер-токен' : `токен персонажа${имяСвоего ? `: ${имяСвоего}` : ''}`}
        </span>
      </button>

      {open && (
        <div className="party-panel">
          <h4>Пати «{session.name}»</h4>
          <p className="hint">
            {мастер
              ? 'Мастер-токен: полные права. Можно править любого персонажа, общую казну и расписание, выпускать и отзывать токены.'
              : 'Токен персонажа: видно всё, править можно только своего персонажа. Остальное — общая часть пати.'}
          </p>

          {meta && (
            <div className="kv">
              <span>В базе</span>
              <b>
                {meta.chars ?? 0} перс. · изменено{' '}
                {meta.updatedAt ? formatAgo(meta.updatedAt) : '—'}
                {meta.updatedBy ? ` (${meta.updatedBy})` : ''}
              </b>
            </div>
          )}

          {error && <p className="sync-msg err">{error}</p>}

          {/*
            Название пати правится только мастером: сервер отклонит правку
            от токена персонажа, а показывать поле, которое не сработает,
            незачем. Правка живёт на месте — нажали «Переименовать», под
            именем появилось поле, и оно же уходит по «Отмене» или Escape.
          */}
          {мастер && (
            <section className="party-rename">
              {правкаИмени ? (
                <>
                  <input
                    className="input"
                    autoFocus
                    value={новоеИмя}
                    maxLength={40}
                    placeholder="Название пати"
                    onChange={(e) => setНовоеИмя(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') переименовать()
                      if (e.key === 'Escape') {
                        // Ошибку правки закрывать не надо, но и меню вместе
                        // с ней закрывать нельзя: правка это не всё окно.
                        e.stopPropagation()
                        setПравкаИмени(false)
                      }
                    }}
                  />
                  <div className="party-rename-actions">
                    <button
                      className="btn tiny primary"
                      disabled={busy === 'name'}
                      onClick={переименовать}
                    >
                      Сохранить
                    </button>
                    <button className="btn tiny" onClick={() => setПравкаИмени(false)}>
                      Отмена
                    </button>
                  </div>
                </>
              ) : (
                <div className="party-rename-row">
                  <span className="party-rename-name">{session.name}</span>
                  <button
                    className="btn tiny"
                    onClick={() => {
                      setНовоеИмя(session.name)
                      setПравкаИмени(true)
                    }}
                  >
                    Переименовать
                  </button>
                </div>
              )}
            </section>
          )}

          {мастер && (
            <section className="party-tokens">
              <div className="party-section-head">
                <b>Токены персонажей</b>
                <button className="btn tiny primary" onClick={() => setВыборПерсонажа(true)}>
                  Выпустить
                </button>
              </div>

              {!meta && <p className="hint">Загружаю список…</p>}
              {безТокена && <p className="hint">Пока никому не выдан.</p>}

              {токены.map((t) => (
                <div className="party-token" key={t.id}>
                  <span className="party-token-name">{t.charName}</span>
                  <span className="party-token-ago" title={t.createdAt}>
                    {formatAgo(t.createdAt)}
                  </span>
                  <button
                    className="btn tiny"
                    disabled={busy === t.id}
                    title="Выпустить новый токен; прежний перестанет работать"
                    onClick={() => перевыпустить(t)}
                  >
                    Перевыпустить
                  </button>
                  <button
                    className="icon-btn tiny danger"
                    disabled={busy === t.id}
                    title="Отозвать токен"
                    onClick={() => отозвать(t)}
                  >
                    ✕
                  </button>
                </div>
              ))}

              <p className="hint">
                Токен персонажа видит всю пати, но правит только того, на кого выдан.
                Перевыпуск и пересоздание мастер-токена отзывают все ранее выпущенные.
              </p>
            </section>
          )}

          <div className="party-actions">
            {мастер && (
              <button
                className="btn"
                disabled={busy === 'master'}
                title="Прежний мастер-токен и все токены персонажей перестанут работать"
                onClick={перевыпуститьМастер}
              >
                Перевыпустить мастер-токен
              </button>
            )}
            <button className="btn danger" onClick={выйти}>
              Выйти
            </button>
            {мастер && (
              <button
                className="btn danger"
                disabled={busy === 'delete'}
                onClick={() => setПодтвердитьУдаление(true)}
              >
                Удалить пати
              </button>
            )}
          </div>
        </div>
      )}

      {выборПерсонажа && (
        <CharPicker
          chars={db.chars}
          занятые={new Set(токены.map((t) => t.charId))}
          onPick={выпустить}
          onClose={() => setВыборПерсонажа(false)}
        />
      )}

      {выдан && (
        <TokenModal
          заголовок={выдан.заголовок}
          текст="Токен показывается один раз: сервер хранит только его отпечаток и восстановить его не сможет. Перешлите его тому, кому он выпущен, — в мессенджере или лично."
          token={выдан.token}
          onClose={() => setВыдан(null)}
        />
      )}

      {подтвердитьУдаление && (
        <ConfirmModal
          заголовок={`Удалить пати «${session.name}»?`}
          текст="Из репозитория исчезнет вся база: персонажи, общая казна, цели, комплекты и расписание. Восстановить её будет нечем — копия остаётся только у тех, кто успел выгрузить файл. Токены всех, кто вошёл, перестанут работать."
          кнопка="Удалить пати"
          пауза={ПАУЗА_ПАТИ_СЕКУНД}
          onConfirm={удалитьПати}
          onCancel={() => setПодтвердитьУдаление(false)}
        />
      )}
    </div>
  )
}

/**
 * Выбор персонажа для выпуска токена.
 *
 * Список самых пати, а не пикер предметов: выбрать надо человека, а не вещь.
 * У кого токен уже есть, отмечается подписью — выпуск для такого персонажа
 * перевыпускает прежний, и это стоит сказать заранее.
 */
function CharPicker({
  chars,
  занятые,
  onPick,
  onClose,
}: {
  chars: Char[]
  занятые: Set<string>
  onPick: (charId: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const список = chars
    .filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal small" onClick={(e) => e.stopPropagation()}>
        <h3>Кому выпустить токен</h3>
        <input
          className="input"
          autoFocus
          placeholder="Поиск по имени…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <div className="picker-list">
          {список.length === 0 && <p className="hint">Никого не найдено.</p>}
          {список.map((c) => (
            <button key={c.id} className="picker-row" onClick={() => onPick(c.id)}>
              <span>{c.name || 'Без имени'}</span>
              {занятые.has(c.id) && (
                <span className="chip own" title="Токен будет перевыпущен: прежний перестанет работать">
                  перевыпуск
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="form-actions">
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  )
}