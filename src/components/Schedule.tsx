import { useMemo, useRef, useState } from 'react'
import type { PrimeWindow } from '@/types'
import {
  dayInfo,
  holidayName,
} from '@/lib/holidays'
import {
  ДНИ_НЕДЕЛИ,
  addMonths,
  daysBetween,
  formatDate,
  formatMinutes,
  formatMonth,
  isoToday,
  monthGrid,
  parseKey,
  parseMinutes,
  primeOf,
  rangeOf,
  type DayCell,
} from '@/lib/schedule'
import {
  removePrimeRange,
  resetDayPrime,
  setDayPrime,
  setPrimeRange,
  useDb,
} from '@/lib/store'
import { plural } from '@/lib/util'

/**
 * Расписание прайма: календарь с праздниками и назначением времени.
 *
 * Прайм назначается двумя способами, и оба нужны по делу:
 *   - на диапазон дат — обычное дело, «по четвергам с 20:00 до 23:00»;
 *   - по дням — когда в середине диапазона выходной, или на конкретный
 *     вечер время другое.
 *
 * Выбор дней мышью: зажал на одном и повёл — выделилось всё между ними.
 * Одиночный клик выбирает один день, и в режиме «по дням» это ровно то,
 * что нужно для исключения.
 */

/** Что назначаем выбранному: диапазон целиком или каждый день отдельно. */
type Режим = 'диапазон' | 'дни'

const ПО_УМОЛЧАНИЮ: PrimeWindow = { from: 20 * 60, to: 23 * 60 }

export function ScheduleView() {
  const db = useDb()
  const сегодня = isoToday()
  const [месяц, setМесяц] = useState(() => {
    const d = parseKey(сегодня)
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [выбор, setВыбор] = useState<string[]>([])
  const [якорь, setЯкорь] = useState<string | null>(null)
  const [режим, setРежим] = useState<Режим>('диапазон')
  const [окно, setОкно] = useState<PrimeWindow>(ПО_УМОЛЧАНИЮ)
  const тянем = useRef(false)

  const клетки = useMemo(() => monthGrid(месяц), [месяц])
  const выбрано = new Set(выбор)

  const границы = выбор.length > 0 ? [выбор[0], выбор[выбор.length - 1]] : null

  /*
   * Заполняем время перед применением. Берём у первого выбранного дня то,
   * что на нём уже стоит: иначе повторное назначение того же прайма
   * сдвинуло бы время на стандартные 20:00–23:00 молча.
   */
  useMemo(() => {
    if (!выбор.length) return
    const текущее = primeOf(db.schedule, выбор[0])
    if (текущее.kind === 'окно') setОкно(текущее.window)
    else if (текущее.kind === 'нет') setОкно(ПО_УМОЛЧАНИЮ)
  }, [выбор, db.schedule])

  /** Выделение мышью: от якоря до клетки под курсором. */
  const выделитьДо = (key: string) => {
    if (!тянем.current || !якорь) return
    setВыбор(daysBetween(якорь, key))
  }

  const начать = (клетка: DayCell) => {
    тянем.current = true
    setЯкорь(клетка.key)
    setВыбор([клетка.key])
  }

  const закончитьВыбор = () => {
    тянем.current = false
    setЯкорь(null)
  }

  const назначить = () => {
    if (!границы) return
    const [с, по] = границы
    if (режим === 'диапазон') {
      // Заменяем диапазон, если правка идёт по уже существующему:
      // иначе новое назначение разрезало бы его надвое.
      const текущий = rangeOf(db.schedule.ranges, с)
      setPrimeRange(с, по, окно, текущий && текущий.from === с ? текущий.id : undefined)
    } else {
      setDayPrime(выбор, окно)
    }
    setВыбор([])
  }

  const отменить = () => {
    if (!выбор.length) return
    setDayPrime(выбор, null)
    setВыбор([])
  }

  const вернуть = () => {
    if (!выбор.length) return
    resetDayPrime(выбор)
    setВыбор([])
  }

  return (
    <section className="view" onMouseUp={закончитьВыбор} onMouseLeave={закончитьВыбор}>
      <div className="view-head">
        <h2>
          Расписание
          {db.schedule.ranges.length > 0 && (
            <span className="head-note">
              {db.schedule.ranges.length}{' '}
              {plural(db.schedule.ranges.length, 'диапазон', 'диапазона', 'диапазонов')}
            </span>
          )}
        </h2>
        <div className="cal-nav">
          <button className="icon-btn" title="Предыдущий месяц" onClick={() => setМесяц(addMonths(месяц, -1))}>
            ‹
          </button>
          <span className="cal-title">{formatMonth(месяц)}</span>
          <button className="icon-btn" title="Следующий месяц" onClick={() => setМесяц(addMonths(месяц, 1))}>
            ›
          </button>
          <button
            className="btn tiny"
            onClick={() => {
              const d = parseKey(сегодня)
              setМесяц(new Date(d.getFullYear(), d.getMonth(), 1))
            }}
          >
            Сегодня
          </button>
        </div>
      </div>

      <div className="cal">
        <div className="cal-head">
          {ДНИ_НЕДЕЛИ.map((д) => (
            <div key={д} className={д === 'Сб' || д === 'Вс' ? 'weekend' : ''}>
              {д}
            </div>
          ))}
        </div>

        <div className="cal-grid">
          {клетки.map((клетка) => {
            const инфо = dayInfo(клетка.дата)
            const прайм = primeOf(db.schedule, клетка.key)
            const взят = выбрано.has(клетка.key)

            const классы = ['cal-day']
            if (клетка.чужой) классы.push('other')
            if (инфо.выходной) классы.push('weekend')
            if (инфо.праздник) классы.push('holiday')
            if (инфо.рабочий) классы.push('workday')
            if (инфо.сокращённый) классы.push('short')
            if (клетка.сегодня) классы.push('today')
            if (взят) классы.push('picked')

            return (
              <button
                key={клетка.key}
                className={классы.join(' ')}
                title={[
                  `${клетка.key}`,
                  инфо.праздник ? holidayName(клетка.дата) : '',
                  инфо.рабочий ? 'рабочий день, объявленный на выходном' : '',
                  инфо.сокращённый ? 'сокращённый рабочий день' : '',
                  прайм.kind === 'окно'
                    ? `прайм ${formatMinutes(прайм.window.from)}–${formatMinutes(прайм.window.to)}${
                        прайм.source === 'день' ? ' (своё время)' : ''
                      }`
                    : прайм.kind === 'отменён'
                      ? 'прайм отменён'
                      : 'прайм не назначен',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                onMouseDown={() => начать(клетка)}
                onMouseEnter={() => выделитьДо(клетка.key)}
                onClick={закончитьВыбор}
              >
                <span className="cal-num">{клетка.дата.getDate()}</span>
                {инфо.праздник && <span className="cal-mark" title={holidayName(клетка.дата)}>★</span>}
                {инфо.сокращённый && <span className="cal-mark short" title="Сокращённый день">•</span>}
                {прайм.kind === 'окно' && (
                  <span
                    className={`cal-prime${прайм.source === 'день' ? ' own' : ''}`}
                    title={прайм.source === 'день' ? 'Своё время на этот день' : 'Прайм из диапазона'}
                  >
                    {formatMinutes(прайм.window.from)}–{formatMinutes(прайм.window.to)}
                  </span>
                )}
                {прайм.kind === 'отменён' && <span className="cal-prime off">отмена</span>}
              </button>
            )
          })}
        </div>
      </div>

      <div className="cal-legend">
        <span className="legend weekend">выходной</span>
        <span className="legend holiday">праздник</span>
        <span className="legend workday">рабочий среди выходных</span>
        <span className="legend short">сокращённый</span>
        <span className="legend own">своё время на день</span>
      </div>

      {границы ? (
        <div className="cal-editor">
          <div className="editor-what">
            <strong>
              {выбор.length === 1
                ? formatDate(parseKey(выбор[0]), true)
                : `${formatDate(parseKey(границы[0]))} — ${formatDate(parseKey(границы[1]))} (${выбор.length} дн.)`}
            </strong>
            <div className="segmented">
              <button
                type="button"
                className={режим === 'диапазон' ? 'on' : ''}
                title="Один прайм на весь выбранный диапазон"
                onClick={() => setРежим('диапазон')}
              >
                На диапазон
              </button>
              <button
                type="button"
                className={режим === 'дни' ? 'on' : ''}
                title="Своё время на каждый выбранный день"
                onClick={() => setРежим('дни')}
              >
                По дням
              </button>
            </div>
          </div>

          <div className="row">
            <label>
              С
              <input
                className="input time"
                type="time"
                value={formatMinutes(окно.from)}
                onChange={(e) => setОкно({ ...окно, from: parseMinutes(e.target.value) })}
              />
            </label>
            <label>
              По
              <input
                className="input time"
                type="time"
                value={formatMinutes(окно.to)}
                onChange={(e) => setОкно({ ...окно, to: parseMinutes(e.target.value) })}
              />
            </label>
            <button
              className="btn primary"
              disabled={окно.from >= окно.to}
              onClick={назначить}
            >
              {режим === 'диапазон' ? 'Назначить на диапазон' : 'Назначить на дни'}
            </button>
            <button className="btn" onClick={отменить} title="Отменить прайм в выбранных днях">
              Отменить
            </button>
            <button
              className="btn"
              onClick={вернуть}
              title="Снять отступления: дни снова возьмут прайм из диапазона"
            >
              Вернуть из диапазона
            </button>
            <button className="btn tiny" onClick={() => setВыбор([])}>
              Снять выделение
            </button>
          </div>

          {окно.from >= окно.to && (
            <p className="hint">Прайм должен заканчиваться позже, чем начинается.</p>
          )}
        </div>
      ) : (
        <p className="hint">
          Выделите дни: зажмите на первом и проведите до последнего. Одиночный клик
          выбирает один день.
        </p>
      )}

      {db.schedule.ranges.length > 0 && (
        <div className="cal-ranges">
          <h4>Диапазоны</h4>
          {db.schedule.ranges.map((r) => (
            <div key={r.id} className="cal-range">
              <span className="range-dates">
                {formatDate(parseKey(r.from), true)} — {formatDate(parseKey(r.to), true)}
              </span>
              <span className="range-time">
                {formatMinutes(r.window.from)}–{formatMinutes(r.window.to)}
              </span>
              <button
                className="btn tiny danger"
                title="Убрать диапазон. Дни с отдельным временем останутся"
                onClick={() => removePrimeRange(r.id)}
              >
                Убрать
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}