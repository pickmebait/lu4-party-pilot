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
  weekDays,
  weekendKeys,
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

/** Окно отсутствия по умолчанию: типичный вечерний прайм без двух крайних часов. */
const УХОД_ПО_УМОЛЧАНИЮ: PrimeWindow = { from: 21 * 60, to: 23 * 60 }

/*
 * Готовые окна прайма.
 *
 * Одни и те же вечерние часы ставятся изо дня в день, а набирать их каждый
 * раз в двух полях — работа ради работы. Четыре варианта покрывают всё, чем
 * пати обычно собирается; что нужно нестандартное, пишется руками.
 */
const БЫСТРЫЕ_ОКНА: PrimeWindow[] = [
  { from: 19 * 60, to: 22 * 60 },
  ПО_УМОЛЧАНИЮ,
  { from: 21 * 60, to: 24 * 60 },
]

/**
 * Полночь для поля времени.
 *
 * Прайм до утра обычен, а `<input type="time">` больше 23:59 не принимает
 * и показывает пустое поле. Поэтому конец окна в поле — это 00:00, а внутри
 * остаётся 24:00: «21:00–24:00» читается, «21:00–00:00» выглядит как
 * нелепость, и сравнить их как числа тоже нельзя.
 */
function вПоле(минут: number, конец: boolean): string {
  return formatMinutes(конец && минут === 24 * 60 ? 0 : минут)
}

function изПоля(текст: string, конец: boolean): number {
  const м = parseMinutes(текст)
  return конец && м === 0 ? 24 * 60 : м
}

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
  /*
   * Окно отсутствия — отдельное поле, а не то же самое.
   *
   * Раньше оба блока писали в одно состояние: выставил время ухода и правь
   * время прайма — молча едет первое. В момент постановки это почти
   * гарантированная ошибка, потому что блоки стоят рядом и оба подписаны
   * «с — по».
   */
  const [окноУхода, setОкноУхода] = useState<PrimeWindow>(УХОД_ПО_УМОЛЧАНИЮ)
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
      if (!его.whole && его.window) setОкноУхода(его.window)
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

  /*
   * Действия больше не сбрасывают выделение.
   *
   * Раньше каждое заканчивалось сбросом, и подряд назначить прайм на
   * понедельник и вторник было можно только двумя полными обводами мышью.
   * Оставляем дни выделенными: результат виден по клеткам сам собой, а под
   * заголовком редактора написано, что там сейчас стоит.
   */
  const назначитьПрайм = () => {
    if (!выбор.length) return
    assignPrime(выбор, окно)
  }

  const очистить = () => {
    if (!выбор.length) return
    clearPrime(выбор)
  }

  const отметитьВыходной = () => {
    if (!выбор.length) return
    markOffs(выбор)
  }

  const снятьВыходной = () => {
    if (!выбор.length) return
    unmarkOffs(выбор)
  }

  const герой = кто || db.chars[0]?.id || ''

  const отметитьОтсутствие = () => {
    if (!герой || !выбор.length) return
    const отсутствие: Absence = весьДень
      ? { whole: true }
      : { whole: false, window: окноУхода }
    setAway(герой, выбор, отсутствие)
  }

  const снятьОтсутствие = () => {
    if (!герой || !выбор.length) return
    clearAway(герой, выбор)
  }

  /*
   * Заготовки выделения.
   *
   * Опора — последний выделенный день, иначе сегодняшний, иначе первое
   * число показанного месяца: кнопка должна выделять что-то осмысленное
   * всегда, а не молча ничего.
   */
  const опора = useMemo(() => {
    if (выбор.length) return выбор[выбор.length - 1]
    const свой = клетки.find((к) => к.сегодня)
    return (свой || клетки.find((к) => !к.чужой))?.key ?? сегодня
  }, [выбор, клетки, сегодня])

  const выделитьНеделю = () => setВыбор(weekDays(опора))
  const выделитьВыходные = () => setВыбор(weekendKeys(клетки.filter((к) => !к.чужой).map((к) => к.key)))
  const выделитьМесяц = () => setВыбор(клетки.filter((к) => !к.чужой).map((к) => к.key))

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

  /*
   * Что стоит на выделенных днях прямо сейчас.
   *
   * Выделение после назначения остаётся, и без этой строки непонятно, что
   * кнопка только что сделала и что будет если нажать ещё раз. Строка
   * перечитывает базу и потому всегда говорит правду.
   */
  const чтоТам = useMemo(() => {
    if (!выбор.length) return ''
    const виды = new Set(выбор.map((k) => primeOf(db.schedule, k).kind))
    if (виды.size > 1) return 'на выделенных днях разное'
    const вид = primeOf(db.schedule, выбор[0])
    if (вид.kind === 'окно') return `сейчас ${formatMinutes(вид.window.from)}–${formatMinutes(вид.window.to)}`
    if (вид.kind === 'выходной') return 'сейчас выходной пати'
    return 'сейчас ничего не назначено'
  }, [выбор, db.schedule])

  /*
   * На скольких выделенных днях у выбранного персонажа уже стоит отметка
   * об отсутствии. Без неё «Снять отметку» нажимается вслепую: кнопка обещает
   * снять то, чего может и не быть.
   */
  const уходовНет = useMemo(() => {
    if (!герой) return 0
    const c = db.chars.find((x) => x.id === герой)
    if (!c) return 0
    return выбор.filter((k) => c.away?.[k]).length
  }, [герой, выбор, db.chars])

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
           * Заготовки выделения.
           *
           * Мышь остаётся для произвольных диапазонов, но месяц ею обводить
           * неудобно: двадцать с лишним нажатий и промах на границе, а прайм
           * обычно ставят сразу на неделю, на выходные или на месяц.
           */}
          <div className="cal-pick">
            <span className="cal-pick-label">Выделить</span>
            <button
              className="chip pick"
              onClick={выделитьНеделю}
              title="Неделя вокруг последнего выделенного дня, иначе вокруг сегодняшнего"
            >
              неделю
            </button>
            <button
              className="chip pick"
              onClick={выделитьВыходные}
              title="Субботы и воскресенья показанного месяца"
            >
              выходные
            </button>
            <button className="chip pick" onClick={выделитьМесяц} title="Все дни показанного месяца">
              месяц
            </button>
            {выбор.length > 0 && (
              <button className="chip pick" onClick={() => setВыбор([])} title="Снять выделение">
                снять
              </button>
            )}
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

          {/*
            Подсказка про выделение всегда на месте, а не только когда пусто:
            она короткая, а без неё забывают про второй способ — зажать и
            протянуть.
          */}
          <p className="hint cal-hint">
            Выделите дни: зажмите на первом и проведите до последнего. Одиночный клик
            выбирает один день.
          </p>
        </div>

        <aside className="cal-side">
          {/*
            Редактор стоит в правой колонке, а не под календарём. Раньше он
            открывался внизу, и чтобы назначить прайм, надо было увести взгляд
            от только что выделенных дней куда-то за пределы экрана, а потом
            вернуть, чтобы проверить результат. Теперь выделение, действия и
            сводка — в одном месте, куда глаз и так возвращается.
          */}
          {границы && (
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
                    : `${деньПодпись(границы[0])} — ${деньПодпись(границы[1])}`}
                </strong>
                <span className="editor-count">{выбор.length} дн.</span>
                <button
                  className="icon-btn tiny"
                  title="Снять выделение"
                  onClick={() => setВыбор([])}
                >
                  <IconClose />
                </button>
              </div>

              {/*
                Что стоит на этих днях сейчас. Выделение переживает назначение,
                и без этой строки не видно, что кнопка только что сделала —
                результат виден только если знать, куда смотреть.
              */}
              <p className="editor-now">{чтоТам}</p>

              <div className="editor-block">
                <h4>Прайм</h4>
                <div className="row time-row">
                  <label>
                    С
                      <input
                        className="input time"
                        type="time"
                        value={вПоле(окно.from, false)}
                        onChange={(e) => setОкно({ ...окно, from: изПоля(e.target.value, false) })}
                      />
                    </label>
                    <label>
                      По
                      <input
                        className="input time"
                        type="time"
                        value={вПоле(окно.to, true)}
                        onChange={(e) => setОкно({ ...окно, to: изПоля(e.target.value, true) })}
                      />
                    </label>
                  </div>

                  {/*
                    Готовые окна. Одни и те же вечерние часы ставятся изо дня
                    в день, а набирать их каждый раз в двух полях — работа
                    ради работы. Нестандартное дописывается руками.
                  */}
                  <div className="presets">
                    {БЫСТРЫЕ_ОКНА.map((п) => (
                      <button
                        key={`${п.from}-${п.to}`}
                        className={`chip pick${окно.from === п.from && окно.to === п.to ? ' on' : ''}`}
                        title={`С ${formatMinutes(п.from)} по ${formatMinutes(п.to)}`}
                        onClick={() => setОкно({ from: п.from, to: п.to })}
                      >
                        {короткоеВремя(п.from)}–{короткоеВремя(п.to)}
                      </button>
                    ))}
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
                <label className="editor-field">
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

                {!весьДень && (
                  <div className="row time-row">
                    <label>
                      Не выйдет с
                      <input
                        className="input time"
                        type="time"
                        value={вПоле(окноУхода.from, false)}
                        onChange={(e) => setОкноУхода({ ...окноУхода, from: изПоля(e.target.value, false) })}
                      />
                    </label>
                    <label>
                      до
                      <input
                        className="input time"
                        type="time"
                        value={вПоле(окноУхода.to, true)}
                        onChange={(e) => setОкноУхода({ ...окноУхода, to: изПоля(e.target.value, true) })}
                      />
                    </label>
                  </div>
                )}

                <div className="row">
                  <button className="btn primary" disabled={!герой} onClick={отметитьОтсутствие}>
                    Отметить
                  </button>
                  <button
                    className="btn"
                    disabled={!герой || уходовНет === 0}
                    title={уходовНет ? 'На выбранных днях отметки об отсутствии нет' : undefined}
                    onClick={снятьОтсутствие}
                  >
                    Снять отметку
                  </button>
                </div>
                {уходовНет > 0 && <p className="editor-now">отмечено на {уходовНет} дн. выделения</p>}
              </div>
            </div>
          )}


          <DaySummary
            день={выбор.length > 0 ? выбор[0] : сегодня}
            выбрано={выбор.length}
            chars={db.chars}
            schedule={db.schedule}
          />

          <Checklist />
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
 * Стоит под календарйем, а не рядом со сводкой по дню, потому что он не
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

/**
 * «20:00» → «20», но «20:30» → «20:30».
 *
 * На кнопке готового окна минуты лишние: «19–22» читается сразу, а
 * «19:00–22:00» приходится разбирать. Ведущий ноль у часов тоже мешает —
 * «09–23» выглядит набором цифр.
 */
function короткоеВремя(минут: number): string {
  const [ч, мин] = formatMinutes(минут).split(':')
  const часы = ч.replace(/^0(?=\d$)/, '')
  return мин === '00' ? часы : `${часы}:${мин}`
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