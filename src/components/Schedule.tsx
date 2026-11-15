import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ДНИ_НЕДЕЛИ,
  absencesByDay,
  addDays,
  addMonths,
  actualDays,
  daysBetween,
  fortnightDays,
  formatDayRange,
  formatMonth,
  isoKey,
  isoToday,
  monthGrid,
  parseKey,
  primeHoursOn,
  primeOf,
  primeThemeOf,
  rangeCells,
  weekDays,
  weekendKeys,
  type DayCell,
} from '@/lib/schedule'
import {
  GAME_EVENTS,
  eventSchedule,
  eventTimeLabel,
  eventTitle,
  eventsByDay,
} from '@/lib/l2events'
import { browserTimeZone, userTimeZone, zoneLabel } from '@/lib/timezone'
import { useDb } from '@/lib/store'
import { useAccess, useOwnCharName } from '@/lib/access'
import { РедакторДней } from './ScheduleEditor'
import { ScheduleNote } from './ReadOnlyNote'
import { Checklist } from './ScheduleChecklist'
import { DayBox } from './ScheduleDay'
import { DaySummary } from './ScheduleSummary'

/** Период в шапке: часы прайма и число выходных. */
function периодСловами(часов: number, выходных: number): string {
  const прайм = часов > 0 ? `${String(часов).replace('.', ',')} ч прайма` : 'прайм не назначен'
  const отдых = выходных > 0 ? `выходных: ${выходных}` : 'выходных нет'
  return `${прайм} · ${отдых}`
}

/**
 * Как показан календарь: месяц целиком, текущая неделя или окно вокруг
 * сегодняшнего дня.
 *
 * Месяц — привычная сетка, неделя и «Ближайшее» — крупные карточки с осью
 * вечера: в четырнадцати клетках помещается то, что в месячной сетке
 * пришлось бы прятать в подсказку.
 */
type Режим = 'ближайшее' | 'неделя' | 'месяц'

const РЕЖИМЫ: { key: Режим; label: string; подсказка: string }[] = [
  { key: 'ближайшее', label: 'Ближайшее', подсказка: 'Два дня до сегодня и одиннадцать после' },
  { key: 'неделя', label: 'Неделя', подсказка: 'Текущая и следующая недели' },
  { key: 'месяц', label: 'Месяц', подсказка: 'Сетка всего месяца' },
]

/*
 * Режим переживает переход на другую вкладку: как и вид персонажей, это
 * способ посмотреть, а не данные пати. По умолчанию открывается «Ближайшее»:
 * это ответ на вопрос «что у нас на этой и следующей неделе», ради которого
 * в раздел и заходят.
 */
let сохранённыйРежим: Режим = 'ближайшее'

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
  const [режим, setРежим] = useState<Режим>(сохранённыйРежим)
  /*
   * Опора недели и «Ближайшего». При переключении режима возвращается к
   * сегодняшнему дню: по определению это текущая неделя и окно вокруг
   * сегодня, а стрелки позволяют отойти от него, если понадобится.
   */
  const [обзор, setОбзор] = useState(сегодня)
  const [выбор, setВыбор] = useState<string[]>([])
  const [якорь, setЯкорь] = useState<string | null>(null)
  const [кто, setКто] = useState('')
  const [вкладка, setВкладка] = useState<'день' | 'чеклист' | 'редактор'>('день')
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
    /*
     * Вбок прокручиваем к тому дню, на который смотрит человек: к
     * выделенному, а если его в этом диапазоне нет — к сегодняшнему. Иначе
     * при переключении вида с выделенного дня на «Неделю» календарь уезжал
     * к сегодняшнему дню и прятал выбор за левым краем.
     */
    const цель =
      cal.querySelector<HTMLElement>('.cal-day.picked') ||
      cal.querySelector<HTMLElement>('.cal-day.today')
    if (!цель) {
      cal.scrollLeft = 0
      return
    }
    /*
     * В месячной сетке вбок прокручивается сам календарь, а в крупной —
     * внутренняя сетка: она шире семи колонок и живёт со своим скроллом.
     * Выбираем тот контейнер, который действительно переполнен.
     */
    const полоса = cal.querySelector<HTMLElement>('.cal-grid')
    const контейнер = полоса && cal.scrollWidth <= cal.clientWidth + 1 ? полоса : cal
    if (контейнер.scrollWidth <= контейнер.clientWidth + 1) return
    const рамка = контейнер.getBoundingClientRect()
    const день = цель.getBoundingClientRect()
    /*
     * День уже целиком виден — не трогаем прокрутку.
     *
     * Иначе на широком экране, где крупная сетка всё равно шире колонки,
     * центрирование на сегодня сдвигало её влево и обрезало первый день
     * недели, хотя человек его не прятал. Прокручиваем только когда цель
     * действительно за краем.
     */
    const левыйКрай = день.left - рамка.left
    if (левыйКрай >= 0 && левыйКрай + день.width <= контейнер.clientWidth) return
    контейнер.scrollLeft += левыйКрай - (контейнер.clientWidth - день.width) / 2
  }, [месяц, кСегодня, режим, обзор])

  /*
   * Кто отмечает отсутствие.
   *
   * Мастеру — любой из пати, своему токену — только тот, кому он выдан. Список
   * при токене персонажа не прячем, а убираем совсем: выбирать не из чего, и
   * пустой список рядом с подписью выглядел бы как ошибка.
   */
  const герой = мастер ? (кто || db.chars[0]?.id || '') : (свойId ?? '')

  const клетки = useMemo(() => {
    if (режим === 'месяц') return monthGrid(месяц)
    return rangeCells(режим === 'неделя' ? fortnightDays(обзор) : actualDays(обзор))
  }, [режим, месяц, обзор])
  /*
   * В месяце из шести недель строк на одну больше, и клеткам достаётся
   * меньше высоты. Класс позволяет ужать только такие месяцы: в пятинедельных
   * номер, события и прайм остаются крупными.
   */
  const шестьНедель = режим === 'месяц' && клетки.length > 35
  const крупныйВид = режим !== 'месяц'
  const выбрано = new Set(выбор)
  const границы = выбор.length > 0 ? [выбор[0], выбор[выбор.length - 1]] : null

  const выделитьДо = (key: string) => {
    if (!тянем.current || !якорь) return
    setВыбор(daysBetween(якорь, key))
  }

  /*
   * Выбор дня открывает карточку, но не выбивает из редактора: там дни
   * выделяют протяжкой, и переключение вкладки на каждом нажатии не дало бы
   * довести выбор до конца.
   */
  const открытьДень = () =>
    setВкладка((текущая) => (текущая === 'редактор' ? текущая : 'день'))

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
  const опораВыбора = useMemo(() => {
    if (выбор.length) return выбор[выбор.length - 1]
    const свой = клетки.find((к) => к.сегодня)
    return (свой || клетки.find((к) => !к.чужой))?.key ?? сегодня
  }, [выбор, клетки, сегодня])

  const выделитьНеделю = () => {
    setВыбор(weekDays(опораВыбора))
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

  const выбратьРежим = (новый: Режим) => {
    сохранённыйРежим = новый
    setРежим(новый)
    if (новый !== 'месяц') {
      setОбзор(сегодня)
      /*
       * Выбор переезжает вместе с видом: если выделенный день остался за
       * пределами недели или окна, справа открывалась бы карточка дня,
       * которого нет в календаре.
       */
      const диапазон = новый === 'неделя' ? fortnightDays(сегодня) : actualDays(сегодня)
      if (!выбор.some((key) => диапазон.includes(key))) setВыбор([сегодня])
    }
    открытьДень()
  }

  const листнуть = (направление: -1 | 1) => {
    if (режим === 'месяц') {
      setМесяц(addMonths(месяц, направление))
      return
    }
    /*
     * Неделя листается на семь дней: вторая строка показывает следующую
     * неделю, и шаг на неделю сдвигает окно без скачка через день. Выделение
     * едет вместе с периодом: иначе справа оставалась бы карточка дня,
     * которого в показанном окне уже нет.
     */
    const шаг = направление * 7
    const новаяОпора = isoKey(addDays(parseKey(обзор), шаг))
    setОбзор(новаяОпора)
    setВыбор(
      выбор.length
        ? выбор.map((key) => isoKey(addDays(parseKey(key), шаг)))
        : [новаяОпора],
    )
    открытьДень()
  }

  const вернутьсяКСегодня = () => {
    const d = parseKey(сегодня)
    setМесяц(new Date(d.getFullYear(), d.getMonth(), 1))
    setОбзор(сегодня)
    setВыбор([сегодня])
    setЯкорь(null)
    тянем.current = false
    открытьДень()
    setКСегодня((n) => n + 1)
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

  const своихКлеток = useMemo(() => клетки.filter((к) => !к.чужой), [клетки])
  const выходныхВПериоде = useMemo(
    () => своихКлеток.filter((к) => db.schedule.offs.includes(к.key)).length,
    [своихКлеток, db.schedule.offs],
  )
  const часовПрайма = useMemo(
    () => primeHoursOn(db.schedule, своихКлеток.map((к) => к.key)),
    [db.schedule, своихКлеток],
  )
  /*
   * Крупная карточка показывает явку прямо в клетке: в неделе и «Ближайшем»
   * для этого есть место, а в месячной сетке счёт остаётся в правой сводке.
   */
  const составПати = useMemo(() => db.chars.filter((c) => c.affil === 'roster'), [db.chars])
  const пойдутПоДням = useMemo(() => {
    const карта = new Map<string, number>()
    for (const к of клетки) {
      карта.set(к.key, составПати.filter((c) => !c.away?.[к.key]).length)
    }
    return карта
  }, [клетки, составПати])

  const заголовокПериода =
    режим === 'месяц' ? formatMonth(месяц) : formatDayRange(клетки.map((к) => к.key))
  /*
   * В «Ближайшем» листать нечего, но стрелки остаются в разметке невидимыми:
   * иначе при переключении вида диапазон дат уезжал бы вбок вместе с ними.
   */
  const стрелкиСкрыты = режим === 'ближайшее'

  return (
    <section className="view schedule-view" onMouseUp={закончитьВыбор} onMouseLeave={закончитьВыбор}>
      <div className="view-head schedule-head">
        <div className="schedule-head-left">
          <div className="segmented cal-modes" role="group" aria-label="Вид календаря">
            {РЕЖИМЫ.map((р) => (
              <button
                key={р.key}
                type="button"
                className={режим === р.key ? 'on' : ''}
                title={р.подсказка}
                onClick={() => выбратьРежим(р.key)}
              >
                {р.label}
              </button>
            ))}
          </div>
          <span className="head-note">
            {периодСловами(часовПрайма, выходныхВПериоде)}
            {/*
              Пояс подписан здесь же, рядом с периодом: иначе «22:00» в клетке
              у человека из другого города выглядит как ошибка, а «время по
              Москве» после неудачного чтения Intl — как обычное местное.
            */}
            <span
              className="cal-zone-note"
              title="Время событий, прайма и отсутствий пересчитано из московского в ваш пояс. Дни календаря остаются прежними."
            >
              {zoneLabel(поясБраузера)}
            </span>
          </span>
        </div>
        <div className="cal-nav">
          <button
            className="icon-btn"
            title={режим === 'месяц' ? 'Предыдущий месяц' : 'Предыдущие семь дней'}
            style={{ visibility: стрелкиСкрыты ? 'hidden' : undefined }}
            aria-hidden={стрелкиСкрыты}
            tabIndex={стрелкиСкрыты ? -1 : undefined}
            onClick={() => листнуть(-1)}
          >
            ‹
          </button>
          <span className={`cal-title${режим === 'месяц' ? '' : ' range'}`}>{заголовокПериода}</span>
          <button
            className="icon-btn"
            title={режим === 'месяц' ? 'Следующий месяц' : 'Следующие семь дней'}
            style={{ visibility: стрелкиСкрыты ? 'hidden' : undefined }}
            aria-hidden={стрелкиСкрыты}
            tabIndex={стрелкиСкрыты ? -1 : undefined}
            onClick={() => листнуть(1)}
          >
            ›
          </button>
          <button className="btn tiny primary" onClick={вернутьсяКСегодня}>
            Сегодня
          </button>
        </div>
      </div>

      {!мастер && <ScheduleNote имя={имяСвоего} />}

      <div className="schedule-board">
        <div className="schedule-main">
          <div className={`cal${шестьНедель ? ' cal-six' : ''}${крупныйВид ? ' cal-big' : ''}`} ref={календарь}>
            {!крупныйВид && (
              <div className="cal-head">
                {ДНИ_НЕДЕЛИ.map((д) => (
                  <div key={д} className={д === 'Сб' || д === 'Вс' ? 'weekend' : ''}>
                    {д}
                  </div>
                ))}
              </div>
            )}

            <div className={`cal-grid${крупныйВид ? ' cal-grid-big' : ''}`}>
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
                  крупно={крупныйВид}
                  пойдут={пойдутПоДням.get(клетка.key) ?? 0}
                  состав={составПати.length}
                  onStart={начать}
                  onEnter={выделитьДо}
                />
              ))}
            </div>
          </div>

          {/*
            Легенды под календарём одной строкой: события слева, дни справа.
            Значки в клетках должны читаться без наведения на каждую дату,
            а расшифровка дней стоит там же, где и раньше, — только не
            отнимает отдельную строку у календаря.
          */}
          <div className="cal-legends">
            <div className="cal-event-legend" aria-label="События сервера">
              {GAME_EVENTS.map((event) => (
                <span
                  key={event.id}
                  className={`event-legend kind-${event.kind}`}
                  title={`${eventTitle(event, пояс)} · ${eventSchedule(event, пояс)}`}
                >
                  <span className="event-dot" aria-hidden="true" />
                  <span>{event.name}</span>
                  <span className="event-legend-time">{eventTimeLabel(event, undefined, пояс)}</span>
                </span>
              ))}
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

          {/*
            Заготовки выделения стоят отдельной полосой под легендами:
            календарь занимает почти весь экран, и ещё две высокие строки под
            ним заставляли бы прокручивать страницу.
          */}
          {!крупныйВид && (
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
            </div>
          )}
        </div>

        <aside className="schedule-side">
          {/*
            Карточка дня и подготовка — две подвкладки одного блока. Раньше
            они стояли друг под другом и делили высоту, из-за чего обе были
            тесными, а блок правки уезжал ниже экрана.
          */}
          <div className="side-tabs" role="tablist" aria-label="Блок расписания">
            <button
              className={`side-tab${вкладка === 'день' ? ' on' : ''}`}
              role="tab"
              aria-selected={вкладка === 'день'}
              onClick={() => setВкладка('день')}
            >
              Карточка дня
            </button>
            <button
              className={`side-tab${вкладка === 'чеклист' ? ' on' : ''}`}
              role="tab"
              aria-selected={вкладка === 'чеклист'}
              onClick={() => setВкладка('чеклист')}
            >
              Подготовка
              {db.schedule.checklist.length > 0 && (
                <span className="side-tab-count">{db.schedule.checklist.length}</span>
              )}
            </button>
            {(мастер || свойId) && (
              <button
                className={`side-tab${вкладка === 'редактор' ? ' on' : ''}`}
                role="tab"
                aria-selected={вкладка === 'редактор'}
                onClick={() => setВкладка('редактор')}
              >
                Редактор
              </button>
            )}
          </div>

          {/*
            Правка живёт вкладкой рядом с карточкой и подготовкой. Выбрал
            дни в календаре — перешёл в «Редактор», и форма уже на экране;
            ширина колонки при этом не меняется.
          */}
          <div className="side-scroll" role="tabpanel">
            {вкладка === 'день' && (
              <DaySummary
                день={выбор.length > 0 ? выбор[0] : сегодня}
                выбрано={выбор.length}
                chars={db.chars}
                schedule={db.schedule}
                timeZone={пояс}
              />
            )}

            {вкладка === 'чеклист' && <Checklist />}

            {вкладка === 'редактор' &&
              ((мастер || свойId) && границы ? (
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
              ))}
          </div>
        </aside>
      </div>
    </section>
  )
}
