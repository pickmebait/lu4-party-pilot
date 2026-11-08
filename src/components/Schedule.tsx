import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { createPortal } from 'react-dom'
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
  eventTimeLabel,
  eventTitle,
  eventWindow,
  eventsByDay,
  eventsOn,
  type EventWindow,
  type GameEvent,
} from '@/lib/l2events'
import {
  PARTY_TIME_ZONE,
  browserTimeZone,
  dayShiftBetween,
  formatClock,
  formatZoneWindow,
  userTimeZone,
  userWindow,
  zoneLabel,
  type WallTime,
} from '@/lib/timezone'
import { dayTimeline, minutesOnDay, timelineOffset } from '@/lib/timeline'
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

/** «+1 дн.» рядом со временем, которое у пользователя попало на соседнюю дату. */
function сдвигСловами(сдвиг: number): string {
  if (!сдвиг) return ''
  return сдвиг > 0 ? `+${сдвиг} дн.` : `${сдвиг} дн.`
}

export function ScheduleView() {
  const db = useDb()
  /*
   * Пояс читается один раз на отрисовку и кэшируется внутри timezone.ts.
   * Если Intl не смог его отдать, userTimeZone вернёт Москву — тот же
   * запасной вариант, что и при вводе времени.
   */
  const пояс = userTimeZone()
  const поясБраузера = browserTimeZone()
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
  /** Счётчик прокруток к сегодняшнему дню: нужен, когда месяц не меняется. */
  const [кСегодня, setКСегодня] = useState(0)
  const тянем = useRef(false)
  const календарь = useRef<HTMLDivElement>(null)

  /*
   * На телефоне календарь прокручивается вбок, и сегодняшний день мог
   * оказаться за правым краем: неделя начинается с понедельника, а сегодня
   * бывает воскресенье. Прокручиваем к нему до отрисовки, чтобы «сегодня» не
   * приходилось искать вручную. На широком экране прокрутки нет, и эффект
   * ничего не делает.
   */
  useLayoutEffect(() => {
    const cal = календарь.current
    if (!cal) return
    const today = cal.querySelector<HTMLElement>('.cal-day.today')
    if (!today) {
      cal.scrollLeft = 0
      return
    }
    if (cal.scrollWidth <= cal.clientWidth + 1) return
    const рамка = cal.getBoundingClientRect()
    const день = today.getBoundingClientRect()
    cal.scrollLeft += день.left - рамка.left - (cal.clientWidth - день.width) / 2
  }, [месяц, кСегодня])

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
  const события = useMemo(
    () => eventsByDay(клетки.map((к) => к.key), пояс),
    [клетки, пояс],
  )

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
              setКСегодня((n) => n + 1)
            }}
          >
            Сегодня
          </button>
        </div>
      </div>

      {!мастер && <ScheduleNote имя={имяСвоего} />}

      <div className="schedule-board">
        <div className="schedule-main">
          <div className={`cal${шестьНедель ? ' cal-six' : ''}`} ref={календарь}>
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
                  timeZone={пояс}
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
                className={`event-legend kind-${event.kind}`}
                title={`${eventTitle(event, пояс)} · ${eventSchedule(event, пояс)}`}
              >
                <EventIcon />
                <span>{event.name}</span>
                <span className="event-legend-time">{eventTimeLabel(event, undefined, пояс)}</span>
              </span>
            ))}
          </div>

          {/*
            Пояс подписан явно: иначе «22:00» в клетке у человека из другого
            города выглядит как ошибка, а «время по Москве» после неудачного
            чтения Intl — как обычное местное.
          */}
          <div
            className="cal-zone-note"
            title="Время событий, прайма и отсутствий пересчитано из московского в ваш пояс. Дни календаря остаются прежними."
          >
            {zoneLabel(поясБраузера)}
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
                timeZone={пояс}
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
              пояс={пояс}
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
function подписьСписка(
  список: DayAbsent[],
  dayKey: string,
  timeZone: string,
): string {
  return список
    .map((a) => absentLabel(a.имя, a.absence, dayKey, timeZone))
    .join(', ')
}

/** Один день в сетке. Вынесен отдельно ради читаемости разметки. */
function DayBox({
  клетка,
  прайм,
  тема,
  отсутствуют,
  события,
  timeZone,
  взят,
  onStart,
  onEnter,
}: {
  клетка: DayCell
  прайм: ReturnType<typeof primeOf>
  тема: string
  отсутствуют: DayAbsent[]
  события: GameEvent[]
  timeZone: string
  взят: boolean
  onStart: (к: DayCell) => void
  onEnter: (key: string) => void
}) {
  /*
   * Подсказка отсутствующих — отдельным слоем поверх страницы.
   *
   * У клетки `overflow: hidden`, а у сетки — своя прокрутка, поэтому
   * подсказка внутри дня обрезалась бы по краю. Портал рисует её над всем
   * интерфейсом, а координаты берутся с самой цифры: список должен появиться
   * там, куда человек навёл мышь.
   */
  const [подсказка, setПодсказка] = useState<{ left: number; top: number; below: boolean } | null>(
    null,
  )

  const показатьСписок = (e: ReactMouseEvent<HTMLSpanElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const below = r.top < 220
    setПодсказка({
      left: r.left + r.width / 2,
      top: below ? r.bottom : r.top,
      below,
    })
  }

  const инфо = dayInfo(клетка.дата)
  const местный = прайм.kind === 'окно' ? userWindow(клетка.key, прайм.window, timeZone) : null
  const сдвиг = местный ? dayShiftBetween(клетка.key, местный.from.key) : 0
  const деньНедели = ДНИ_НЕДЕЛИ[(клетка.дата.getDay() + 6) % 7]
  /*
   * Два имени показываем только когда их всего два. С цифрой и «ещё N»
   * третье имя сжималось до огрызков; при трёх и больше оставляем одно,
   * а полный список открывается наведением на цифру.
   */
  const имёнВидноВЯчейке = отсутствуют.length > 2 ? 1 : ИМЁН_В_ЯЧЕЙКЕ

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
        ...события.map((e) => eventTitle(e, timeZone, клетка.key)),
        прайм.kind === 'окно'
          ? `прайм ${formatZoneWindow(местный!)}${сдвиг ? ` (${сдвигСловами(сдвиг)})` : ''}${
              timeZone !== PARTY_TIME_ZONE
                ? `, по Москве ${formatMinutes(прайм.window.from)}–${formatMinutes(прайм.window.to)}`
                : ''
            }${тема ? `, тема: ${тема}` : ''}`
          : прайм.kind === 'выходной'
            ? 'выходной пати'
            : 'прайм не назначен',
        отсутствуют.length > 0
          ? `нет: ${подписьСписка(отсутствуют, клетка.key, timeZone)}`
          : '',
      ]
        .filter(Boolean)
        .join(' · ')}
      onMouseDown={() => onStart(клетка)}
      onMouseEnter={() => onEnter(клетка.key)}
    >
      <span className="cal-top">
        <span className="cal-daynum">
          <span className="cal-num">{клетка.дата.getDate()}</span>
          <span className="cal-dow">{деньНедели}</span>
        </span>
        <span className="cal-marks">
          {клетка.сегодня && <span className="cal-today">сегодня</span>}
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
        Тело карточки: события сверху, отсутствующие — у самого прайма.
        Распорка `margin-top: auto` у отсутствующих держит их над нижним
        блоком, поэтому красная строка не скачет вслед за числом событий.
      */}
      <span className="cal-body">
        {события.length > 0 && (
          <span className="cal-events">
            {события.map((event) => (
              <EventBadge key={event.id} event={event} timeZone={timeZone} dayKey={клетка.key} />
            ))}
          </span>
        )}

        {/*
          Имена отсутствующих — полные, а не первая буква: в пати встречаются
          два Ирока, и по «И» нельзя понять, кого именно не ждать. Строка одна:
          лишние сворачиваются в «ещё N», а полный список в столбик — в
          подсказке на цифре и с временем ухода — в сводке.
        */}
        {отсутствуют.length > 0 && (
          <span
            className="cal-away"
            title={`Отсутствуют: ${подписьСписка(отсутствуют, клетка.key, timeZone)}`}
          >
            <span
              className="cal-away-badge"
              onMouseEnter={показатьСписок}
              onMouseLeave={() => setПодсказка(null)}
            >
              −{отсутствуют.length}
            </span>
            <span className="cal-away-names">
              {отсутствуют.slice(0, имёнВидноВЯчейке).map((a) => (
                <span key={a.charId} className="cal-away-name" title={a.имя}>
                  {a.имя}
                </span>
              ))}

              {отсутствуют.length > имёнВидноВЯчейке && (
                <span className="cal-away-more">ещё {отсутствуют.length - имёнВидноВЯчейке}</span>
              )}
            </span>
          </span>
        )}
      </span>

      {/*
        Нижняя полоса всегда одной высоты: строка времени и строка темы
        зарезервированы даже у выходного и у дня без прайма. Иначе разделитель
        прыгал вверх-вниз при прокрутке недели и глаз цеплялся за него.
      */}
      <span className={`cal-plan${прайм.kind === 'окно' ? '' : ' none'}`}>
        <span className="cal-prime">
          {прайм.kind === 'окно' ? (
            <>
              {formatZoneWindow(местный!)}
              {сдвиг !== 0 && (
                <span
                  className="cal-shift"
                  title={`У вас это ${сдвиг > 0 ? 'следующий' : 'предыдущий'} день`}
                >
                  {сдвиг > 0 ? `+${сдвиг}` : String(сдвиг)}
                </span>
              )}
            </>
          ) : прайм.kind === 'выходной' ? (
            'выходной'
          ) : (
            'прайм не назначен'
          )}
        </span>
        <span className="cal-theme" title={тема ? `Тема прайма: ${тема}` : undefined}>
          {прайм.kind === 'окно' && тема ? тема : ''}
        </span>
      </span>

      {подсказка &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className={`cal-away-tip${подсказка.below ? ' below' : ''}`}
            style={{ left: подсказка.left, top: подсказка.top }}
            role="tooltip"
          >
            <span className="cal-away-tip-head">Отсутствуют: {отсутствуют.length}</span>
            <ul>
              {отсутствуют.map((a) => (
                <li key={a.charId}>{a.имя || 'Без имени'}</li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </button>
  )
}

/*
 * Значок и подпись события.
 *
 * В клетке имя идёт первой строкой, а время — второй: «Осады замков» с
 * диапазоном «18:00–20:00» в одну строку не помещаются. Вид события красит
 * значок: эпические боссы одним цветом, осады другим, не золотым — иначе
 * осада сливалась бы с полосой прайма.
 */
function EventBadge({
  event,
  timeZone,
  dayKey,
}: {
  event: GameEvent
  timeZone: string
  dayKey?: string
}) {
  return (
    <span className={`event-badge kind-${event.kind}`} title={eventTitle(event, timeZone, dayKey)}>
      <span className="event-badge-icon">
        <EventIcon size={9} />
      </span>
      <span className="event-badge-name">{event.name}</span>
      <span className="event-badge-time">{eventTimeLabel(event, dayKey, timeZone)}</span>
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
  timeZone,
}: {
  день: string
  выбрано: number
  chars: Char[]
  schedule: Schedule
  timeZone: string
}) {
  const прайм = primeOf(schedule, день)
  const тема = primeThemeOf(schedule, день)
  const события = eventsOn(день, timeZone)
  const местный = прайм.kind === 'окно' ? userWindow(день, прайм.window, timeZone) : null
  const сдвиг = местный ? dayShiftBetween(день, местный.from.key) : 0
  const состав = chars.filter((c) => c.affil === 'roster')
  const уходят = chars.filter((c) => c.away?.[день])
  const пойдут = состав.filter((c) => !c.away?.[день])
  const процент = состав.length ? Math.round((пойдут.length / состав.length) * 100) : 0
  const длительность = прайм.kind === 'окно' ? прайм.window.to - прайм.window.from : 0

  /*
   * Ось вечера — общая для прайма и событий. Окна считаем в минутах от
   * полуночи выбранного дня: прайм, перешедший через полночь или сдвинутый
   * поясом на соседние сутки, остаётся на той же шкале.
   */
  const окна = события.map((event) => eventWindow(event, день, timeZone))
  const ось = dayTimeline(
    день,
    местный,
    окна.filter((окно): окно is EventWindow => окно !== null),
  )
  const позиция = (wall: WallTime) => timelineOffset(ось, minutesOnDay(день, wall))
  const подписьЧаса = (минуты: number) =>
    formatClock(((минуты % 1440) + 1440) % 1440).slice(0, 2)

  return (
    <div className="day-sum">
      <div className="sum-date">
        {formatWeekday(день)}, {formatDay(день, true)}
        {выбрано > 1 && <span className="sum-selected">первый из {выбрано}</span>}
      </div>

      <div
        className={`sum-prime${прайм.kind === 'выходной' ? ' off' : ''}`}
        title={
          прайм.kind === 'окно' && timeZone !== PARTY_TIME_ZONE
            ? `Время по вашему поясу. По Москве: ${formatMinutes(прайм.window.from)}–${formatMinutes(прайм.window.to)}`
            : undefined
        }
      >
        {прайм.kind === 'окно'
          ? formatZoneWindow(местный!)
          : прайм.kind === 'выходной'
            ? 'выходной пати'
            : 'время не назначено'}
        {прайм.kind === 'окно' && сдвиг !== 0 && (
          <span className="sum-prime-shift" title={`У вас это ${сдвиг > 0 ? 'следующий' : 'предыдущий'} день`}>
            {сдвигСловами(сдвиг)}
          </span>
        )}
        {длительность > 0 && (
          <span className="sum-prime-hours">{String(Math.round(длительность / 6) / 10).replace('.', ',')} ч</span>
        )}
      </div>

      {прайм.kind === 'окно' && тема && (
        <span className="sum-theme" title={`Тема прайма: ${тема}`}>
          {тема}
        </span>
      )}

      {/*
        Ось вечера: прайм полупрозрачной полосой, события — точками своего
        цвета. Точки не золотые, как прайм: иначе осада сливалась бы с полосой
        и её приходилось бы искать глазами. Красных полос отсутствий здесь
        нет — они остаются в списке ниже, где видно время ухода.
      */}
      <div
        className="sum-tl"
        role="img"
        aria-label={`Вечер с ${подписьЧаса(ось.from)} до ${подписьЧаса(ось.to)}: ${
          события.length > 0
            ? события.map((e) => `${e.name} ${eventTimeLabel(e, день, timeZone)}`).join(', ')
            : 'событий нет'
        }`}
      >
        <div className="sum-tl-labels">
          {события.map((event, i) => {
            const окно = окна[i]
            if (!окно) return null
            const left = позиция(окно.from)
            const край = left < 18 ? ' start' : left > 82 ? ' end' : ''
            return (
              <span
                key={event.id}
                className={`sum-tl-label kind-${event.kind}${край}`}
                style={{ left: `${left}%` }}
                title={eventTitle(event, timeZone, день)}
              >
                {event.name} <span>{eventTimeLabel(event, день, timeZone)}</span>
              </span>
            )
          })}
        </div>

        <div className="sum-tl-track">
          {прайм.kind === 'окно' && (
            <span
              className="sum-tl-prime"
              style={{
                left: `${позиция(местный!.from)}%`,
                width: `${позиция(местный!.to) - позиция(местный!.from)}%`,
              }}
              title={`Прайм ${formatZoneWindow(местный!)}${тема ? ` · ${тема}` : ''}`}
            />
          )}
          {события.map((event, i) => {
            const окно = окна[i]
            if (!окно) return null
            return (
              <span
                key={event.id}
                className={`sum-tl-mark kind-${event.kind}`}
                style={{ left: `${позиция(окно.from)}%` }}
                title={eventTitle(event, timeZone, день)}
              />
            )
          })}
          {ось.ticks.map((минуты) => (
            <span
              key={минуты}
              className="sum-tl-tick"
              style={{ left: `${timelineOffset(ось, минуты)}%` }}
            />
          ))}
        </div>

        <div className="sum-tl-ticks" aria-hidden="true">
          {ось.ticks.map((минуты) => (
            <span key={минуты} style={{ left: `${timelineOffset(ось, минуты)}%` }}>
              {подписьЧаса(минуты)}
            </span>
          ))}
        </div>
      </div>

      <div className="sum-attend" title={`Придут ${пойдут.length} из ${состав.length} состава`}>
        <span className="sum-attend-num">{пойдут.length}</span>
        <span className="sum-attend-cap">
          придут из <b>{состав.length}</b>
          <br />
          {уходят.length ? `${уходят.length} не смогут` : 'все на месте'}
        </span>
        <span
          className="sum-attend-bar"
          aria-label={`Придут ${пойдут.length} из ${состав.length} состава`}
        >
          <span style={{ width: `${процент}%` }} />
        </span>
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
                примечание={describeAbsence(c.away![день], день, timeZone)}
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
          <div className="sum-chips">
            {пойдут.map((c) => (
              <span
                key={c.id}
                className="sum-chip"
                title={`${c.name || 'Без имени'} · ${c.cls || 'профессия не указана'}${
                  c.level ? ` · ур. ${c.level}` : ''
                }`}
              >
                <b>{c.name || 'Без имени'}</b>
                {c.cls && <span className="sum-chip-char">{c.cls}</span>}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Строка списка отсутствующих: ник, под ним профессия с уровнем и время ухода.
 *
 * Одного ника мало: в пати есть два Ироки, и по списку не понять, кого именно
 * не ждать. Профессия и уровень — под ником и мельче: это справочное.
 * Примечание справа отвечает на вопрос «когда», ради которого в список и
 * смотрят. Пришедшие перечислены чипами ниже: их и так больше, и полные
 * строки на каждого растягивали карточку на несколько экранов.
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
