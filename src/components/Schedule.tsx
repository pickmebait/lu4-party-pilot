import { useMemo, useRef, useState } from 'react'
import type { Char, Schedule } from '@/types'
import { dayInfo, holidayName } from '@/lib/holidays'
import {
  ДНИ_НЕДЕЛИ,
  absencesByDay,
  addMonths,
  daysBetween,
  absentLabel,
  describeAbsence,
  formatDay,
  formatMinutes,
  formatMonth,
  formatWeekday,
  isoToday,
  monthGrid,
  parseKey,
  primeHours,
  primeOf,
  primeThemeOf,
  weekDays,
  weekendKeys,
  type DayAbsent,
  type DayCell,
} from '@/lib/schedule'
import {
  GAME_EVENTS,
  eventSchedule,
  eventTitle,
  eventsByDay,
  eventsOn,
  type GameEvent,
} from '@/lib/l2events'
import {
  addChecklistItem,
  removeChecklistItem,
  updateChecklistItem,
  useDb,
} from '@/lib/store'
import { isMarked, toggleChecklist, useChecklistMarks } from '@/lib/checklistSession'
import { useAccess, useOwnCharName } from '@/lib/access'
import { РедакторДней } from './ScheduleEditor'
import { IconClose, IconEvent } from './Icons'
import { ScheduleNote } from './ReadOnlyNote'

/*
 * Сколько имён влезает в клетку дня.
 *
 * Клетки стали крупнее, но строка отсутствующих должна оставаться одной:
 * три имени столбиком уже наезжали на значки событий и время прайма. Два
 * имени читаются, остальные сворачиваются в «ещё N», а полный список с
 * временем ухода остаётся в подсказке клетки и в сводке справа.
 */
const ИМЁН_В_ЯЧЕЙКЕ = 2

/** Месяц в шапке: часы прайма и число выходных. */
function месяцСловами(часов: number, выходных: number): string {
  const прайм = часов > 0 ? `${String(часов).replace('.', ',')} ч прайма` : 'прайм не назначен'
  const отдых = выходных > 0 ? `выходных: ${выходных}` : 'выходных нет'
  return `${прайм} · ${отдых}`
}

export function ScheduleView() {
  const db = useDb()
  /*
   * Прайм и выходные — только мастеру. А вот отсутствие — другое дело: это
   * свойство персонажа, лежит оно в персонаже же, рядом со снаряжением и
   * сабами, и токен персонажа правит своего целиком. Раньше блок не
   * показывался вовсе, и получалось, что отметиться за свой счёт нечем.
   */
  const { master: мастер, ownCharId: свойId } = useAccess()
  const имяСвоего = useOwnCharName()
  const сегодня = isoToday()
  const [месяц, setМесяц] = useState(() => {
    const d = parseKey(сегодня)
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [выбор, setВыбор] = useState<string[]>([])
  const [якорь, setЯкорь] = useState<string | null>(null)
  const [кто, setКто] = useState('')
  const [вкладка, setВкладка] = useState<'день' | 'чеклист'>('день')
  const тянем = useRef(false)

  /*
   * Кто отмечает отсутствие.
   *
   * Мастеру — любой из пати, своему токену — только тот, кому он выдан. Список
   * при токене персонажа не прячем, а убираем совсем: выбирать не из чего, и
   * пустой список рядом с подписью выглядел бы как ошибка.
   */
  const герой = мастер ? (кто || db.chars[0]?.id || '') : (свойId ?? '')

  const клетки = useMemo(() => monthGrid(месяц), [месяц])
  /*
   * В месяце из шести недель строк на одну больше, и клеткам достаётся
   * меньше высоты. Класс позволяет ужать только такие месяцы: в пятинедельных
   * номер, события и прайм остаются крупными.
   */
  const шестьНедель = клетки.length > 35
  const выбрано = new Set(выбор)
  const границы = выбор.length > 0 ? [выбор[0], выбор[выбор.length - 1]] : null

  const выделитьДо = (key: string) => {
    if (!тянем.current || !якорь) return
    setВыбор(daysBetween(якорь, key))
  }

  const открытьДень = () => setВкладка('день')

  const начать = (клетка: DayCell) => {
    тянем.current = true
    setЯкорь(клетка.key)
    setВыбор([клетка.key])
    открытьДень()
  }

  const закончитьВыбор = () => {
    тянем.current = false
    setЯкорь(null)
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

  const выделитьНеделю = () => {
    setВыбор(weekDays(опора))
    открытьДень()
  }
  const выделитьВыходные = () => {
    setВыбор(weekendKeys(клетки.filter((к) => !к.чужой).map((к) => к.key)))
    открытьДень()
  }
  const выделитьМесяц = () => {
    setВыбор(клетки.filter((к) => !к.чужой).map((к) => к.key))
    открытьДень()
  }

  // Кто отсутствует в дни показанного месяца — для метки в клетке.
  const отсутствия = useMemo(
    () => absencesByDay(db.chars, клетки.map((к) => к.key)),
    [db.chars, клетки],
  )

  // Осады и эпические боссы в клетках: общее расписание сервера, не база пати.
  const события = useMemo(() => eventsByDay(клетки.map((к) => к.key)), [клетки])

  const выходныхВМесяце = useMemo(
    () => клетки.filter((к) => !к.чужой && db.schedule.offs.includes(к.key)).length,
    [клетки, db.schedule.offs],
  )
  const часовПрайма = primeHours(db.schedule, месяц)

  return (
    <section className="view schedule-view" onMouseUp={закончитьВыбор} onMouseLeave={закончитьВыбор}>
      <div className="view-head">
        <h2>
          Расписание
          <span className="head-note">{месяцСловами(часовПрайма, выходныхВМесяце)}</span>
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

      {!мастер && <ScheduleNote имя={имяСвоего} />}

      <div className="schedule-board">
        <div className="schedule-main">
          <div className={`cal${шестьНедель ? ' cal-six' : ''}`}>
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
                  тема={primeThemeOf(db.schedule, клетка.key)}
                  отсутствуют={отсутствия.get(клетка.key) ?? []}
                  события={события.get(клетка.key) ?? []}
                  взят={выбрано.has(клетка.key)}
                  onStart={начать}
                  onEnter={выделитьДо}
                />
              ))}
            </div>
          </div>

          {/*
            Легенда событий стоит под календарём, а не в подсказке: значки в
            клетках должны читаться без наведения на каждую дату по очереди.
          */}
          <div className="cal-event-legend" aria-label="События сервера">
            {GAME_EVENTS.map((event) => (
              <span
                key={event.id}
                className="event-legend"
                title={`${eventTitle(event)} · ${eventSchedule(event)}`}
              >
                <EventIcon />
                <span>{event.name}</span>
                <span className="event-legend-time">{event.time}</span>
              </span>
            ))}
          </div>

          {/*
            Заготовки выделения и расшифровка дней в одной строке: календарь
            занимает почти весь экран, и ещё две высокие строки под ним
            заставляли бы прокручивать страницу.
          */}
          <div className="cal-tools">
            <div className="cal-pick">
              <span
                className="cal-pick-label"
                title="Зажмите день и протяните до последнего — или выберите готовый диапазон"
              >
                Выделить
              </span>
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

            <div className="cal-legend">
              <span className="legend workday" title="Рабочий день, объявленный на выходном, и сокращённый предпраздничный день">
                рабочий
              </span>
              <span className="legend weekend">выходной</span>
              <span className="legend holiday">праздник</span>
              <span className="legend off">выходной пати</span>
              <span className="legend away">кто-то отсутствует</span>
            </div>
          </div>
        </div>

        <aside className="schedule-side">
          {/*
            Сводка и чеклист — две подвкладки одного блока. Раньше они стояли
            друг под другом и делили высоту, из-за чего обе были тесными, а
            блок правки уезжал ниже экрана.
          */}
          <div className="side-tabs" role="tablist" aria-label="Блок расписания">
            <button
              className={`side-tab${вкладка === 'день' ? ' on' : ''}`}
              role="tab"
              aria-selected={вкладка === 'день'}
              onClick={() => setВкладка('день')}
            >
              Сводка
            </button>
            <button
              className={`side-tab${вкладка === 'чеклист' ? ' on' : ''}`}
              role="tab"
              aria-selected={вкладка === 'чеклист'}
              onClick={() => setВкладка('чеклист')}
            >
              Чеклист
              {db.schedule.checklist.length > 0 && (
                <span className="side-tab-count">{db.schedule.checklist.length}</span>
              )}
            </button>
          </div>

          <div className="side-scroll" role="tabpanel">
            {вкладка === 'день' ? (
              <DaySummary
                день={выбор.length > 0 ? выбор[0] : сегодня}
                выбрано={выбор.length}
                chars={db.chars}
                schedule={db.schedule}
              />
            ) : (
              <Checklist />
            )}
          </div>

          {/*
            Правка живёт в правой колонке, а не под всей раскладкой. Выбрал
            дни — блок уже на экране, и не надо прокручивать страницу вниз,
            чтобы назначить прайм. Сводка над ним прокручивается внутри своей
            области, поэтому форма не уезжает за край.
          */}
          {(мастер || свойId) && границы ? (
            <РедакторДней
              выбор={выбор}
              герой={герой}
              chars={db.chars}
              мастер={мастер}
              onСменаГероя={setКто}
              onСнятьВыделение={() => setВыбор([])}
            />
          ) : (
            <div className="side-empty">
              <strong>Выберите дни</strong>
              <span>
                Зажмите день в календаре и протяните до последнего — здесь появятся прайм и
                отметка отсутствия.
              </span>
            </div>
          )}
        </aside>
      </div>
    </section>
  )
}

/**
 * Подпись списка отсутствующих одной строкой.
 *
 * Обе подсказки клетки — сама клетка и список имён в её углу — показывают
 * один и тот же список, и собирали его дважды. На вид это не заметно, пока
 * правила совпадают: разъезжаются они правкой одной строки, а человек потом
 * водит мышью по календарю и видит в подсказке дни два разных времени ухода.
 */
function подписьСписка(список: DayAbsent[]): string {
  return список.map((a) => absentLabel(a.имя, a.absence)).join(', ')
}

/** Один день в сетке. Вынесен отдельно ради читаемости разметки. */
function DayBox({
  клетка,
  прайм,
  тема,
  отсутствуют,
  события,
  взят,
  onStart,
  onEnter,
}: {
  клетка: DayCell
  прайм: ReturnType<typeof primeOf>
  тема: string
  отсутствуют: DayAbsent[]
  события: GameEvent[]
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
  if (события.length > 0) классы.push('with-event')

  return (
    <button
      className={классы.join(' ')}
      title={[
        `${formatWeekday(клетка.key)}, ${formatDay(клетка.key, true)}`,
        инфо.праздник ? holidayName(клетка.дата) : '',
        инфо.рабочий ? 'рабочий день, объявленный на выходном' : '',
        инфо.сокращённый ? 'сокращённый рабочий день' : '',
        ...события.map((e) => `${eventTitle(e)} (${eventSchedule(e)})`),
        прайм.kind === 'окно'
          ? `прайм ${formatMinutes(прайм.window.from)}–${formatMinutes(прайм.window.to)}${тема ? `, тема: ${тема}` : ''}`
          : прайм.kind === 'выходной'
            ? 'выходной пати'
            : 'прайм не назначен',
        отсутствуют.length > 0 ? `нет: ${подписьСписка(отсутствуют)}` : '',
      ]
        .filter(Boolean)
        .join(' · ')}
      onMouseDown={() => onStart(клетка)}
      onMouseEnter={() => onEnter(клетка.key)}
    >
      <span className="cal-top">
        <span className="cal-num">{клетка.дата.getDate()}</span>
        <span className="cal-marks">
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
        </span>
      </span>

      {/*
        Выходной пати — сразу под номером, а не последней строкой клетки.
        Внизу он стоял на месте времени и читался как ещё одно значение дня;
        рядом с числом видно, что это решение про весь день, а не про вечер.
      */}
      {прайм.kind === 'выходной' && (
        <span className="cal-off" title="Выходной пати — в этот день не собираемся">
          выходной
        </span>
      )}

      {события.length > 0 && (
        <span className="cal-events">
          {события.map((event) => (
            <EventBadge key={event.id} event={event} />
          ))}
        </span>
      )}

      {/*
        Тема прайма — одна строка с обрезкой. Полный текст остаётся в
        подсказке: двадцать символов в клетку помещаются не всегда, а
        переносить подпись на вторую строку значит вытеснить отсутствия.
      */}
      {прайм.kind === 'окно' && тема && (
        <span className="cal-theme" title={`Тема прайма: ${тема}`}>
          {тема}
        </span>
      )}

      {/*
        Имена отсутствующих — полные, а не первая буква: в пати встречаются
        два Ирока, и по «И» нельзя понять, кого именно не ждать. Строка одна:
        лишние сворачиваются в «ещё N», полный список с временем ухода
        остаётся в подсказке клетки и в сводке.
      */}
      {отсутствуют.length > 0 && (
        <span className="cal-away" title={`Отсутствуют: ${подписьСписка(отсутствуют)}`}>
          {отсутствуют.slice(0, ИМЁН_В_ЯЧЕЙКЕ).map((a) => (
            <span key={a.charId} className="cal-away-name" title={a.имя}>
              {a.имя}
            </span>
          ))}

          {отсутствуют.length > ИМЁН_В_ЯЧЕЙКЕ && (
            <span className="cal-away-more">ещё {отсутствуют.length - ИМЁН_В_ЯЧЕЙКЕ}</span>
          )}
        </span>
      )}

      {прайм.kind === 'окно' && (
        <span className="cal-prime">
          {formatMinutes(прайм.window.from)}–{formatMinutes(прайм.window.to)}
        </span>
      )}
    </button>
  )
}

/*
 * Значок и подпись события.
 *
 * В клетке достаточно короткого имени и времени; полное название, вид и
 * повтор остаются в подсказке. В сводке, где места больше, выводится полное
 * имя — там событие и открывают, чтобы понять, что сегодня вечером.
 */
function EventBadge({ event, full = false }: { event: GameEvent; full?: boolean }) {
  return (
    <span className={`event-badge${full ? ' full' : ''}`} title={eventTitle(event)}>
      <EventIcon />
      <span className="event-badge-name">{full ? event.name : event.short}</span>
      <span className="event-badge-time">{event.time}</span>
    </span>
  )
}

/*
 * Значок события один на все виды.
 *
 * Раньше у королевы была корона, у Орфена капля, у Кора пламя, у осад щит и
 * башня. Пять разных рисунков в маленькой клетке читались как пять разных
 * категорий, хотя это одно и то же — «сегодня вечером событие сервера».
 * Общая звезда уравнивает их и оставляет название главным.
 */
function EventIcon({ size = 11 }: { size?: number }) {
  return <IconEvent size={size} />
}

/**
 * Сводка по дню: когда прайм, что происходит в игре, кто не придёт и сколько
 * состава остаётся.
 *
 * Считается по выбранному дню, а если ничего не выбрано — по сегодняшнему.
 * Список «пойдут» нужен, потому что отсутствия отмечены у немногих, а вопрос
 * «кого я жду вечером» — это про всех остальных.
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
  const тема = primeThemeOf(schedule, день)
  const события = eventsOn(день)
  const состав = chars.filter((c) => c.affil === 'roster')
  const уходят = chars.filter((c) => c.away?.[день])
  const пойдут = состав.filter((c) => !c.away?.[день])
  const процент = состав.length ? Math.round((пойдут.length / состав.length) * 100) : 0
  const длительность = прайм.kind === 'окно' ? прайм.window.to - прайм.window.from : 0

  return (
    <div className="day-sum">
      <div className="sum-date">
        {formatWeekday(день)}, {formatDay(день, true)}
        {выбрано > 1 && <span className="sum-selected">первый из {выбрано}</span>}
      </div>

      <div className={`sum-prime${прайм.kind === 'выходной' ? ' off' : ''}`}>
        {прайм.kind === 'окно'
          ? `${formatMinutes(прайм.window.from)}–${formatMinutes(прайм.window.to)}`
          : прайм.kind === 'выходной'
            ? 'выходной пати'
            : 'время не назначено'}
        {длительность > 0 && (
          <span className="sum-prime-hours">{String(Math.round(длительность / 6) / 10).replace('.', ',')} ч</span>
        )}
        {прайм.kind === 'окно' && тема && (
          <span className="sum-theme" title={`Тема прайма: ${тема}`}>
            {тема}
          </span>
        )}
      </div>

      {события.length > 0 && (
        <div className="sum-events">
          {события.map((event) => (
            <EventBadge key={event.id} event={event} full />
          ))}
        </div>
      )}

      <div className="sum-stats">
        <span className="sum-stat ok" title="Сколько человек из состава придёт">
          <b>{пойдут.length}</b>
          <span>Придут</span>
        </span>
        <span className={`sum-stat bad${уходят.length > 0 ? ' has' : ''}`} title="Сколько человек отметилось об отсутствии">
          <b>{уходят.length}</b>
          <span>Не придут</span>
        </span>
        <span className="sum-stat all" title="Весь состав пати">
          <b>{состав.length}</b>
          <span>В составе</span>
        </span>
      </div>

      <div
        className="sum-bar"
        title={`Придут ${пойдут.length} из ${состав.length} состава`}
        aria-label={`Придут ${пойдут.length} из ${состав.length} состава`}
      >
        <span style={{ width: `${процент}%` }} />
      </div>

      <div className="sum-block sum-block-bad">
        <div className="sum-title">
          <span>Не придут</span>
          <span className="sum-count">{уходят.length}</span>
        </div>
        {уходят.length === 0 ? (
          <p className="hint">все на месте</p>
        ) : (
          <ul className="sum-list">
            {уходят.map((c) => (
              <СтрокаСводки
                key={c.id}
                имя={c.name}
                cls={c.cls}
                level={c.level}
                примечание={describeAbsence(c.away![день])}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="sum-block sum-block-ok">
        <div className="sum-title">
          <span>Придут</span>
          <span className="sum-count">{пойдут.length}</span>
        </div>
        {chars.length === 0 ? (
          <p className="hint">в пати пока никого нет</p>
        ) : пойдут.length === 0 ? (
          <p className="hint">в составе никого не осталось</p>
        ) : (
          <ul className="sum-list">
            {пойдут.map((c) => (
              <СтрокаСводки key={c.id} имя={c.name} cls={c.cls} level={c.level} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/**
 * Строка обоих списков сводки: ник, а под ним профессия с уровнем.
 *
 * Одна на оба списка. Списки про одном составе, и разъезжаться им незачем:
 * если «Не придут» подробнее, а «Пойдут» с одним ником, то непонятно, где
 * вообще смотреть подробности.
 *
 * Ник, профессия и уровень идут тремя строками фактов. Одного ника мало: в
 * пати есть два Ироки, и по списку не понять, кого именно спрашивать.
 * Профессия и уровень — под ником и мельче: это справочное, главное — кто
 * придёт, а примечание справа — уточнение про конкретный день.
 */
function СтрокаСводки({
  имя,
  cls,
  level,
  примечание,
}: {
  имя: string
  cls: string
  level: number
  примечание?: string
}) {
  return (
    <li>
      <span className="sum-who">
        <span>{имя || 'Без имени'}</span>
        <span className="sum-char">
          {cls || 'профессия не указана'}
          {level ? ` · ур. ${level}` : ''}
        </span>
      </span>
      {примечание && <span className="sum-when">{примечание}</span>}
    </li>
  )
}

/*
 * Чеклист к прайму.
 *
 * Живёт во второй подвкладке правого блока: список «что проверить перед
 * входом» один на всех и каждый день, а рядом со сводкой по дню он читался
 * как часть конкретного дня. Пункты общие для пати, отметки — только в этой
 * вкладке. Иначе выходит, что один человек отметил всё и остальным
 * показалось, что уже готово.
 */
function Checklist() {
  const db = useDb()
  // Пункты общие: токен персонажа их не правит. Отметки при этом остаются
  // доступны — они живут только в этой вкладке и в базу не попадают.
  const { canEditParty: правый } = useAccess()
  const [новый, setНовый] = useState('')
  const пункты = db.schedule.checklist
  useChecklistMarks()
  const готово = пункты.filter((i) => isMarked(i.id)).length
  const процент = пункты.length ? Math.round((готово / пункты.length) * 100) : 0

  const добавить = () => {
    if (!новый.trim()) return
    addChecklistItem(новый)
    setНовый('')
  }

  return (
    <div className="checklist">
      <div className="checklist-head">
        <h4>Чеклист к прайму</h4>
        {пункты.length > 0 && (
          <span className="checklist-count">
            {готово} из {пункты.length}
          </span>
        )}
      </div>

      {пункты.length > 0 && (
        <div
          className="checklist-bar"
          title={`Отмечено ${готово} из ${пункты.length}`}
          aria-label={`Отмечено ${готово} из ${пункты.length}`}
        >
          <span style={{ width: `${процент}%` }} />
        </div>
      )}

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
                readOnly={!правый}
                placeholder="что проверить"
                onChange={(e) => updateChecklistItem(i.id, { text: e.target.value })}
              />
              {правый && (
                <button
                  className="icon-btn tiny"
                  title="Убрать пункт"
                  onClick={() => removeChecklistItem(i.id)}
                >
                  <IconClose />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {правый && (
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
      )}

      <p className="hint checklist-note">Отметки живут только в этой вкладке и не сохраняются в пати.</p>
    </div>
  )
}
