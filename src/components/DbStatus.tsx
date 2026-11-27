import { useEffect, useState } from 'react'
import {
  естьНесохранённое,
  getSession,
  useDb,
  useОткрытаяФорма,
} from '@/lib/store'
import { живойСтатусОбновление, useLiveStatus } from '@/lib/liveStatus'
import { formatShortStamp } from '@/lib/util'

/** Сколько секунд проверка считается «только что». */
const СВЕЖО_МС = 30_000

/** Как часто проверяем, не вышла ли новая версия приложения. */
const ПРОВЕРКА_ВЕРСИИ_МС = 60_000

/** Запас времени, чтобы человек увидел «Обновить», прежде чем страница перезагрузится. */
const ПАУЗА_ПЕРЕД_ОБНОВЛЕНИЕМ_МС = 2000

function Часы() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 4.6V8l2.2 1.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function ЗначокОбновления() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M13 8a5 5 0 1 1-1.5-3.6M13 3v3.5H9.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Плашка актуальности справа от палитры.
 *
 * Отвечает на один вопрос: «то, что я вижу, — свежее?». Подробности уходят
 * в подсказку: когда проверяли, когда менялась сама база, что ответил сервер.
 *
 * Новую версию приложения ищем отдельно от базы — раз в минуту и при
 * возвращении на вкладку. Если нет открытых форм и несохранённых правок,
 * обновляемся сами; иначе ждём нажатия на плашку.
 */
export function DbStatus() {
  const live = useLiveStatus()
  const db = useDb()
  const формаОткрыта = useОткрытаяФорма()
  const session = getSession()
  const [сейчас, setСейчас] = useState(() => Date.now())

  /*
   * Раз в несколько секунд пересчитываем «только что» → дата. Сам по себе
   * статус меняется только при проверке, а подпись должна постареть и без
   * неё: иначе «Только что» висело бы, пока вкладку не тронут.
   */
  useEffect(() => {
    const таймер = setInterval(() => setСейчас(Date.now()), 5000)
    return () => clearInterval(таймер)
  }, [])

  /*
   * Наблюдатель за версией приложения.
   *
   * version.json лежит рядом с index.html и запрашивается с no-store:
   * GitHub Pages кеширует статику, а нам нужен именно свежий номер сборки.
   */
  useEffect(() => {
    let остановлено = false
    let таймер: ReturnType<typeof setTimeout> | null = null

    const проверить = async () => {
      try {
        const адрес = new URL('version.json', document.baseURI)
        адрес.searchParams.set('t', String(Date.now()))
        const res = await fetch(адрес, { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as { build?: unknown }
        if (остановлено) return
        if (typeof json.build === 'string' && json.build && json.build !== __BUILD_ID__) {
          живойСтатусОбновление(true)
        }
      } catch {
        // Нет сети или файла — попробуем в следующий раз, молча.
      }
    }

    const запланировать = (мс: number) => {
      if (остановлено) return
      if (таймер) clearTimeout(таймер)
      таймер = setTimeout(async () => {
        await проверить()
        if (!остановлено) запланировать(ПРОВЕРКА_ВЕРСИИ_МС)
      }, мс)
    }

    запланировать(0)

    const приВозврате = () => {
      if (document.visibilityState === 'visible') void проверить()
    }
    const приФокусе = () => void проверить()
    document.addEventListener('visibilitychange', приВозврате)
    window.addEventListener('focus', приФокусе)

    return () => {
      остановлено = true
      if (таймер) clearTimeout(таймер)
      document.removeEventListener('visibilitychange', приВозврате)
      window.removeEventListener('focus', приФокусе)
    }
  }, [])

  const обновление = live.updateReady
  const безопасно = !формаОткрыта && !естьНесохранённое()

  /*
   * Автоматическое обновление.
   *
   * db.updatedAt в зависимостях не для красоты: человек мог начать править
   * уже после того, как версия нашлась. Тогда таймер снимается, а новый
   * появится только когда правка снова окажется на сервере.
   */
  useEffect(() => {
    if (!обновление || !безопасно) return
    const таймер = setTimeout(() => window.location.reload(), ПАУЗА_ПЕРЕД_ОБНОВЛЕНИЕМ_МС)
    return () => clearTimeout(таймер)
  }, [обновление, безопасно, db.updatedAt])

  const обновить = () => {
    if (!безопасно) {
      const потерять = window.confirm(
        'В приложении есть несохранённые правки или открытая форма. Обновить страницу и потерять их?',
      )
      if (!потерять) return
    }
    window.location.reload()
  }

  let вид: 'fresh' | 'syncing' | 'stale' | 'error' | 'limited' | 'update'
  let подпись: string

  if (обновление) {
    вид = 'update'
    подпись = 'Обновить'
  } else if (live.kind === 'limited') {
    вид = 'limited'
    подпись = 'Лимит GitHub'
  } else if (live.kind === 'offline') {
    вид = 'error'
    подпись = 'Нет связи'
  } else if (live.kind === 'checking') {
    вид = 'syncing'
    подпись = 'Ждём вестей'
  } else if (live.kind === 'fresh' && live.checkedAt && сейчас - live.checkedAt < СВЕЖО_МС) {
    вид = 'fresh'
    подпись = 'Только что'
  } else if (live.checkedAt) {
    вид = 'stale'
    подпись = formatShortStamp(new Date(live.checkedAt).toISOString())
  } else {
    // Первая проверка ещё не вернулась. Это не ошибка и не «только что».
    вид = 'syncing'
    подпись = 'Ждём вестей'
  }

  const подсказка: string[] = []
  if (live.checkedAt) {
    подсказка.push(`Последняя проверка: ${formatShortStamp(new Date(live.checkedAt).toISOString())}`)
  } else {
    подсказка.push('Проверка ещё не проходила')
  }
  const база = live.dbUpdatedAt ?? session?.lastSyncedAt ?? null
  if (база) подсказка.push(`База изменена: ${formatShortStamp(база)}`)
  if (live.kind === 'limited' && live.retryAt) {
    подсказка.push(`Лимит GitHub сбросится: ${formatShortStamp(new Date(live.retryAt).toISOString())}`)
  }
  if (live.error) подсказка.push(`Ответ: ${live.error}`)
  if (обновление) {
    подсказка.push('Вышла новая версия приложения. Обновимся сами, когда нечего терять.')
  }

  const title = подсказка.join('\n')

  const содержимое = (
    <>
      {(вид === 'fresh' || вид === 'error') && <span className="db-dot" aria-hidden="true" />}
      {вид === 'syncing' && <span className="db-spinner" aria-hidden="true" />}
      {вид === 'stale' && <Часы />}
      {вид === 'limited' && <Часы />}
      {вид === 'update' && <ЗначокОбновления />}
      <span className="db-label">{подпись}</span>
    </>
  )

  if (вид === 'update') {
    return (
      <button
        type="button"
        className="db-status is-update"
        title={title}
        aria-label={`Обновить приложение. ${title}`}
        onClick={обновить}
      >
        {содержимое}
      </button>
    )
  }

  return (
    <div
      className={`db-status is-${вид}`}
      role="status"
      tabIndex={0}
      title={title}
      aria-label={`${подпись}. ${title}`}
    >
      {содержимое}
    </div>
  )
}
