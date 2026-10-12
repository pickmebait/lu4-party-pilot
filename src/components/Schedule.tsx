import { useMemo, useRef, useState } from 'react'
import type { Absence, Char, PrimeWindow, Schedule } from '@/types'
import { dayInfo, holidayName } from '@/lib/holidays'
import {
  ДНИ_НЕДЕЛИ,
  absencesByDay,
  addMonths,
  daysBetween,
  formatMinutes,
  formatMonth,
  isoToday,
  monthGrid,
  parseKey,
  parseMinutes,
  primeOf,
  primeOn,
  type DayAbsent,
  type DayCell,
} from '@/lib/schedule'
import {
  addChecklistItem,
  assignPrime,
  clearAway,
  clearPrime,
  markOffs,
  removeChecklistItem,
  setAway,
  unmarkOffs,
  updateChecklistItem,
  useDb,
} from '@/lib/store'
import { isMarked, toggleChecklist, useChecklistMarks } from '@/lib/checklistSession'
import { IconClose } from './Icons'

/**
 * Расписание прайма: календарь с праздниками, выходными и отметками
 * об отсутствии.
 *
 * Всё назначается по дням. Диапазоны («с понедельника по пятницу») были
 * задуманы как удобство, но на деле оказались лишним слоем: правило «в
 * праздник прайма нет» всё равно приходилось вписывать отдельно на каждый
 * день, и в итоге человек думал, что назначил месяц, а правил был один.
 *
 * Дни выбираются мышью: зажал на первом и повёл — выделилось всё между
 * ними. Одиночный клик выбирает один день.
 */

/** Стандартное окно прайма — с чего начинаем, когда назначаем заново. */
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
  const [окно, setОкно] = useState<PrimeWindow>(ПО_УМОЛЧАНИЮ)
  const [кто, setКто] = useState('')
  const [весьДень, setВесьДень] = useState(true)
  const тянем = useRef(false)

  const клетки = useMemo(() => monthGrid(месяц), [месяц])
  const выбрано = new Set(выбор)
  const границы = выбор.length > 0 ? [выбор[0], выбор[выбор.length - 1]] : null

  /*
   * Перед назначением подставляем то время, что уже стоит на первом
   * выбранном дне: иначе повторное назначение того же прайма молча
   * сдвинуло бы его на стандартные 20:00–23:00.
   */
  useMemo(() => {
    if (!выбор.length) return
    const текущее = primeOf(db.schedule, выбор[0])
    if (текущее.kind === 'окно') setОкно(текущее.window)
    else if (текущее.kind === 'нет') setОкно(ПО_УМОЛЧАНИЮ)
    const персонаж = db.chars.find((c) => c.id === (кто || db.chars[0]?.id))
    const его = персонаж?.away?.[выбор[0]]
    if (его) {
      setВесьДень(его.whole)
      if (!его.whole && его.window) setОкно(его.window)
    }
  }, [выбор, db.schedule, db.chars, кто])

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

  const назначитьПрайм = () => {
    if (!выбор.length) return
    assignPrime(выбор, окно)
    setВыбор([])
  }

  const очистить = () => {
    if (!выбор.length) return
    clearPrime(выбор)
    setВыбор([])
  }

  const отметитьВыходной = () => {
    if (!выбор.length) return
    markOffs(выбор)
    setВыбор([])
  }

  const снятьВыходной = () => {
    if (!выбор.length) return
    unmarkOffs(выбор)
    setВыбор([])
  }

  const герой = кто || db.chars[0]?.id || ''

  const отметитьОтсутствие = () => {
    if (!герой || !выбор.length) return
    const отсутствие: Absence = весьДень
      ? { whole: true }
      : { whole: false, window: окно }
    setAway(герой, выбор, отсутствие)
    setВыбор([])
  }

  const снятьОтсутствие = () => {
    if (!герой || !выбор.length) return
    clearAway(герой, выбор)
    setВыбор([])
  }

  // Кто отсутствует в дни показанного месяца.
  // Кто отсутствует в дни показанного месяца — для метки в клетке.
  const отсутствия = useMemo(
    () => absencesByDay(db.chars, клетки.map((к) => к.key)),
    [db.chars, клетки],
  )

  const выходныхВВыборе = выбор.filter((k) => db.schedule.offs.includes(k)).length
  /*
   * «Очистить» доступна только когда на выбранных днях что-то есть. Иначе
   * кнопка обещает снять то, чего нет, и привыкает, что она всегда жмётся:
   * человек перестаёт смотреть и однажды нажмёт не туда.
   */
  const естьЧтоОчистить = primeOn(db.schedule, выбор)
  const выходныхВМесяце = useMemo(
    () => клетки.filter((к) => !к.чужой && db.schedule.offs.includes(к.key)).length,
    [клетки, db.schedule.offs],
  )

  return (
    <section className="view" onMouseUp={закончитьВыбор} onMouseLeave={закончитьВыбор}>
      <div className="view-head">
        <h2>
          Расписание
          {выходныхВМесяце > 0 && (
            <span className="head-note">выходных: {выходныхВМесяце}</span>
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

      <div className="cal-layout">
        <div>
          <div className="cal">
            <div className="cal-head">
              {ДНИ_НЕДЕЛИ.map((д) => (
                <div key={д} className={д === 'Сб' || д === 'Вс' ? 'weekend' : ''}>
                  {д}
                </div>
              ))}
            </div>

            <div className="cal-grid">
              {клетки.map((клетка) => (
                <DayBox
                  key={клетка.key}
                  клетка={клетка}
                  прайм={primeOf(db.schedule, клетка.key)}
                  отсутствуют={отсутствия.get(клетка.key) ?? []}
                  взят={выбрано.has(клетка.key)}
                  onStart={начать}
                  onEnter={выделитьДо}
                />
              ))}
            </div>
          </div>

          {/*
           * Легенда идёт в порядке «рабочий — выходной — праздник»: чем ближе к
           * началу, тем реже день встречается и тем он обычнее.
           */}
          <div className="cal-legend">
            <span className="legend workday" title="Рабочий день, объявленный на выходном, и сокращённый предпраздничный день">
              рабочий
            </span>
            <span className="legend weekend">выходной</span>
            <span className="legend holiday">праздник</span>
            <span className="legend off">выходной пати</span>
            <span className="legend away">кто-то отсутствует</span>
          </div>

          {границы ? (
            <div className="cal-editor">
              {/*
                Кнопка сброса — крестик сразу рядом с тем, что сброшено,
                а не отдельной кнопкой в конце ряда действий: стояла там,
                сливалась с остальными и тянула взгляд не туда.
              */}
              <div className="editor-what">
                <strong>
                  {выбор.length === 1
                    ? деньПодпись(выбор[0], true)
                    : `${деньПодпись(границы[0])} — ${деньПодпись(границы[1])} (${выбор.length} дн.)`}
                </strong>
                <button
                  className="icon-btn tiny"
                  title="Снять выделение"
                  onClick={() => setВыбор([])}
                >
                  <IconClose />
                </button>
              </div>

              <div className="editor-blocks">
                <div className="editor-block">
                  <h4>Прайм</h4>
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
                  </div>
                  <div className="row">
                    <button className="btn primary" disabled={окно.from >= окно.to} onClick={назначитьПрайм}>
                      Назначить прайм
                    </button>
                    <button
                      className="btn"
                      onClick={очистить}
                      disabled={!естьЧтоОчистить}
                      title={
                        естьЧтоОчистить
                          ? 'Снять с выбранных дней и время прайма, и отметку о выходном'
                          : 'На выбранных днях ничего не назначено'
                      }
                    >
                      Очистить
                    </button>
                  </div>
                  <div className="row">
                    {выходныхВВыборе === выбор.length && выбор.length > 0 ? (
                      <button className="btn" onClick={снятьВыходной}>
                        Не выходной
                      </button>
                    ) : (
                      <button className="btn" onClick={отметитьВыходной} title="Пати не собирается в эти дни">
                        Назначить выходной
                      </button>
                    )}
                  </div>
                  {окно.from >= окно.to && (
                    <p className="hint">Прайм должен заканчиваться позже, чем начинается.</p>
                  )}
                </div>

                <div className="editor-block">
                  <h4>Отсутствие</h4>
                  <div className="row">
                    <label className="grow">
                      Кто
                      <select
                        className="input"
                        value={герой}
                        onChange={(e) => setКто(e.target.value)}
                        disabled={db.chars.length === 0}
                      >
                        {db.chars.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name || 'Без имени'}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="check">
                      <input type="checkbox" checked={весьДень} onChange={(e) => setВесьДень(e.target.checked)} />
                      Весь день
                    </label>
                  </div>
                  {!весьДень && (
                    <div className="row">
                      <label>
                        Не выйдет с
                        <input
                          className="input time"
                          type="time"
                          value={formatMinutes(окно.from)}
                          onChange={(e) => setОкно({ ...окно, from: parseMinutes(e.target.value) })}
                        />
                      </label>
                      <label>
                        до
                        <input
                          className="input time"
                          type="time"
                          value={formatMinutes(окно.to)}
                          onChange={(e) => setОкно({ ...окно, to: parseMinutes(e.target.value) })}
                        />
                      </label>
                    </div>
                  )}
                  <div className="row">
                    <button className="btn primary" disabled={!герой} onClick={отметитьОтсутствие}>
                      Отметить
                    </button>
                    <button className="btn" disabled={!герой} onClick={снятьОтсутствие}>
                      Снять отметку
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="hint">
              Выделите дни: зажмите на первом и проведите до последнего. Одиночный клик
              выбирает один день.
            </p>
          )}

          <Checklist />
        </div>

        <aside className="cal-side">
          <DaySummary
            день={выбор.length > 0 ? выбор[0] : сегодня}
            выбрано={выбор.length}
            chars={db.chars}
            schedule={db.schedule}
          />
        </aside>
      </div>
    </section>
  )
}

/** Один день в сетке. Вынесен отдельно ради читаемости разметки. */
function DayBox({
  клетка,
  прайм,
  отсутствуют,
  взят,
  onStart,
  onEnter,
}: {
  клетка: DayCell
  прайм: ReturnType<typeof primeOf>
  отсутствуют: DayAbsent[]
  взят: boolean
  onStart: (к: DayCell) => void
  onEnter: (key: string) => void
}) {
  const инфо = dayInfo(клетка.дата)

  const классы = ['cal-day']
  if (клетка.чужой) классы.push('other')
  if (инфо.выходной) классы.push('weekend')
  if (инфо.праздник) классы.push('holiday')
  /*
   * Рабочий среди выходных и сокращённый день — одно и то же для плана:
   * работать всё равно придётся. Различие остаётся только в подсказке и в
   * точке у номера, и в легенде они теперь тоже одним пунктом.
   */
  if (инфо.рабочий || инфо.сокращённый) классы.push('workday')
  if (клетка.сегодня) классы.push('today')
  if (взят) классы.push('picked')
  if (прайм.kind === 'выходной') классы.push('off')

  return (
    <button
      className={классы.join(' ')}
      title={[
        клетка.key,
        инфо.праздник ? holidayName(клетка.дата) : '',
        инфо.рабочий ? 'рабочий день, объявленный на выходном' : '',
        инфо.сокращённый ? 'сокращённый рабочий день' : '',
        прайм.kind === 'окно'
          ? `прайм ${formatMinutes(прайм.window.from)}–${formatMinutes(прайм.window.to)}`
          : прайм.kind === 'выходной'
            ? 'выходной пати'
            : 'прайм не назначен',
        отсутствуют.length > 0
          ? `нет: ${отсутствуют
              .map((a) => `${a.имя}${a.absence.whole ? '' : ` (${formatMinutes(a.absence.window!.from)}–${formatMinutes(a.absence.window!.to)})`}`)
              .join(', ')}`
          : '',
      ]
        .filter(Boolean)
        .join(' · ')}
      onMouseDown={() => onStart(клетка)}
      onMouseEnter={() => onEnter(клетка.key)}
    >
      <span className="cal-num">{клетка.дата.getDate()}</span>
      {инфо.праздник && (
        <span className="cal-mark" title={holidayName(клетка.дата)}>
          ★
        </span>
      )}
      {инфо.сокращённый && (
        <span className="cal-mark short" title="Сокращённый предпраздничный день">
          •
        </span>
      )}
      {отсутствуют.length > 0 && (
        <span className="cal-away" title={`Отсутствуют: ${отсутствуют.map((a) => a.имя).join(', ')}`}>
          {отсутствуют.length === 1 ? отсутствуют[0].имя.slice(0, 1) : `−${отсутствуют.length}`}
        </span>
      )}
      {прайм.kind === 'окно' && (
        <span className="cal-prime">
          {formatMinutes(прайм.window.from)}–{formatMinutes(прайм.window.to)}
        </span>
      )}
      {прайм.kind === 'выходной' && <span className="cal-prime off">выходной</span>}
    </button>
  )
}

/**
 * Сводка по дню: когда прайм, кто не придёт и кто пойдёт из состава.
 *
 * Считается по выбранному дню, а если ничего не выбрано — по сегодняшнему.
 * Отдельный список «кто пойдёт» нужен, потому что отсутствия отмечены у
 * немногих, а вопрос «кого я жду вечером» — это про всех остальных.
 */
function DaySummary({
  день,
  выбрано,
  chars,
  schedule,
}: {
  день: string
  выбрано: number
  chars: Char[]
  schedule: Schedule
}) {
  const прайм = primeOf(schedule, день)
  const уходят = chars.filter((c) => c.away?.[день])
  const пойдут = chars.filter((c) => c.affil === 'roster' && !c.away?.[день])

  return (
    <div className="day-sum">
      <h4>Сводка по дню</h4>
      <div className="sum-date">
        {выбрано > 1 ? `выбранные дни · ${выбрано} шт.` : деньПодпись(день, true)}
      </div>

      <div className={`sum-prime${прайм.kind === 'выходной' ? ' off' : ''}`}>
        {прайм.kind === 'окно'
          ? `${formatMinutes(прайм.window.from)}–${formatMinutes(прайм.window.to)}`
          : прайм.kind === 'выходной'
            ? 'выходной'
            : 'время не назначено'}
      </div>

      <div className="sum-block">
        <div className="sum-title">Не придут: {уходят.length}</div>
        {уходят.length === 0 ? (
          <p className="hint">все на месте</p>
        ) : (
          <ul className="sum-list">
            {уходят.map((c) => (
              <li key={c.id}>
                <span>{c.name || 'Без имени'}</span>
                <span className="sum-when">
                  {описаниеОтсутствия(c.away![день])}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="sum-block">
        <div className="sum-title">Пойдут из состава: {пойдут.length}</div>
        {пойдут.length === 0 ? (
          <p className="hint">в составе никого не осталось</p>
        ) : (
          <ul className="sum-list">
            {пойдут.map((c) => (
              <li key={c.id}>
                <span>{c.name || 'Без имени'}</span>
                <span className="sum-when">ур. {c.level || '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function описаниеОтсутствия(a: Absence): string {
  if (a.whole) return 'весь день'
  return `${formatMinutes(a.window!.from)}–${formatMinutes(a.window!.to)}`
}

/*
 * Чеклист к прайму.
 *
 * Стоит под календар��ем, а не рядом со сводкой по дню, потому что он не
 * про конкретный день: список «что проверить перед входом» один на всех и
 * каждый день, а рядом со сводкой он читался как часть того дня.
 *
 * Пункты общие для пати, отметки — только в этой вкладке. Иначе выходит,
 * что один человек отметил всё и остальным показалось, что уже готово.
 */
function Checklist() {
  const db = useDb()
  const [новый, setНовый] = useState('')
  const пункты = db.schedule.checklist
  useChecklistMarks()
  const готово = пункты.filter((i) => isMarked(i.id)).length

  const добавить = () => {
    if (!новый.trim()) return
    addChecklistItem(новый)
    setНовый('')
  }

  return (
    <div className="checklist">
      <h4>
        Чеклист к прайму
        {пункты.length > 0 && (
          <span className="checklist-count">
            {готово} из {пункты.length} · только в этой вкладке
          </span>
        )}
      </h4>

      {пункты.length === 0 ? (
        <p className="hint">Пусто. Добавьте, что нужно проверить перед праймом.</p>
      ) : (
        <ul className="checklist-items">
          {пункты.map((i) => (
            <li key={i.id} className={isMarked(i.id) ? 'done' : ''}>
              <input
                type="checkbox"
                checked={isMarked(i.id)}
                title="Отметка держится только до обновления страницы"
                onChange={() => toggleChecklist(i.id)}
              />
              <input
                className="checklist-text"
                value={i.text}
                placeholder="что проверить"
                onChange={(e) => updateChecklistItem(i.id, { text: e.target.value })}
              />
              <button
                className="icon-btn tiny"
                title="Убрать пункт"
                onClick={() => removeChecklistItem(i.id)}
              >
                <IconClose />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="checklist-add">
        <input
          className="input"
          value={новый}
          placeholder="Добавить пункт"
          onChange={(e) => setНовый(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') добавить()
            e.stopPropagation()
          }}
        />
        <button className="btn tiny" onClick={добавить} disabled={!новый.trim()}>
          +
        </button>
      </div>
    </div>
  )
}

function деньПодпись(key: string, сГодом = false): string {
  const d = parseKey(key)
  const месяц = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
  ][d.getMonth()]
  const база = `${d.getDate()} ${месяц}`
  return сГодом ? `${база} ${d.getFullYear()}` : база
}