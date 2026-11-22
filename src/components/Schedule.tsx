import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ДНИ_НЕДЕЛИ,
  absencesByDay,
  formatDayRange,
  formatMonth,
  primeHoursOn,
  primeOf,
  primeThemeOf,
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
import { useКалендарь, type Режим } from '@/lib/useScheduleCalendar'
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
 * Подписи видов календаря.
 *
 * Месяц — привычная сетка, неделя и «Ближайшее» — крупные карточки с осью
 * вечера: в четырнадцати клетках помещается то, что в месячной сетке
 * пришлось бы прятать в подсказку.
 */
const РЕЖИМЫ: { key: Режим; label: string; подсказка: string }[] = [
  { key: 'ближайшее', label: 'Ближайшее', подсказка: 'Два дня до сегодня и одиннадцать после' },
  { key: 'неделя', label: 'Неделя', подсказка: 'Текущая и следующая недели' },
  { key: 'месяц', label: 'Месяц', подсказка: 'Сетка всего месяца' },
]

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
  const [кто, setКто] = useState('')
  const [вкладка, setВкладка] = useState<'день' | 'чеклист' | 'редактор'>('день')
  const календарь = useRef<HTMLDivElement>(null)

  /*
   * Выбор дня открывает карточку, но не выбивает из редактора: там дни
   * выделяют протяжкой, и переключение вкладки на каждом нажатии не дало бы
   * довести выбор до конца.
   */
  const открытьДень = () =>
    setВкладка((текущая) => (текущая === 'редактор' ? текущая : 'день'))

  const {
    сегодня,
    месяц,
    режим,
    обзор,
    выбор,
    выбрано,
    границы,
    клетки,
    шестьНедель,
    крупныйВид,
    кСегодня,
    начать,
    выделитьДо,
    закончитьВыбор,
    выделитьНеделю,
    выделитьВыходные,
    выделитьМесяц,
    выбратьРежим,
    листнуть,
    вернутьсяКСегодня,
    сброситьВыбор,
  } = useКалендарь(открытьДень)

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
                data-label={р.label}
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
                  <button className="chip pick" onClick={сброситьВыбор} title="Снять выделение">
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
                  onСнятьВыделение={сброситьВыбор}
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
