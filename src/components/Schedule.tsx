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
  clearAwayAll,
  clearPrime,
  markOffs,
  removeChecklistItem,
  setAway,
  unmarkOffs,
  updateChecklistItem,
  useDb,
} from '@/lib/store'
import { isMarked, toggleChecklist, useChecklistMarks } from '@/lib/checklistSession'
import { useAccess, useOwnCharName } from '@/lib/access'
import { IconClose } from './Icons'
import { ScheduleNote } from './ReadOnlyNote'

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
const ПО_УМОЛЧАНИЮ: PrimeWindow = { from: 21 * 60, to: 23 * 60 + 30 }

/*
 * Окно отсутствия по умолчанию — то же, что и прайм.
 *
 * Отдельное значение нужно только для того, чтобы не вычисляться из прайма:
 * прайм к этому моменту часто уже переставлен на другое время, а окно ухода
 * почти всегда внутри него, и незачем тащить за собой не то.
 */
const УХОД_ПО_УМОЛЧАНИЮ: PrimeWindow = { from: 21 * 60, to: 23 * 60 + 30 }

/**
 * Сколько имён влезает в угол клетки дня.
 *
 * Три: угол узкий, а четыре строки в него уже не входят. Остальные сворачиваются
 * в «ещё N», и наведение на него раскрывает весь список.
 */
const ПУСТЫХ_В_ЯЧЕЙКЕ = 3

/**
 * Полночь для поля времени.
 *
 * Прайм до утра обычен, а `<input type="time">` больше 23:59 не принимает
 * и показывает пустое поле. Поэтому конец окна в поле — это 00:00, а внутри
 * остаётся 24:00: «21:00–24:00» читается, «21:00–00:00» выглядит как
 * нелепость, и сравнить их как числа тоже нельзя.
 */
/**
 * «выходной» или «выходные» — по числу выбранных дней.
 *
 * На одном дне говорят «назначить выходной», на нескольких — «выходные»:
 * сказать про неделю «выходной» значит сказать о половине недели, чего не
 * произошло.
 */
function выходноеСлово(сколькоДней: number): string {
  return сколькоДней === 1 ? 'выходной' : 'выходные'
}

function вПоле(минут: number, конец: boolean): string {
  return formatMinutes(конец && минут === 24 * 60 ? 0 : минут)
}

function изПоля(текст: string, конец: boolean): number {
  const м = parseMinutes(текст)
  return конец && м === 0 ? 24 * 60 : м
}

/**
 * Переключатель из двух вариантов — «на весь день» или «на окно».
 *
 * Обычный флажок прятал за собой всё, что появлялось при его снятии: чтобы
 * добраться до времени ухода, надо было сначала догадаться, что флажок
 * вообще снимается, и только потом увидеть поля. Здесь оба варианта видны
 * сразу, и выбранный отмечен.
 */
function Переключатель<T extends string>({
  значение,
  варианты,
  onChange,
}: {
  значение: T
  варианты: { key: T; подпись: string; подсказка?: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="segment" role="group">
      {варианты.map((в) => (
        <button
          key={в.key}
          type="button"
          className={`seg${значение === в.key ? ' on' : ''}`}
          title={в.подсказка}
          aria-pressed={значение === в.key}
          onClick={() => onChange(в.key)}
        >
          {в.подпись}
        </button>
      ))}
    </div>
  )
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
  /*
   * На сколько отмечают отсутствие: весь день или окно. Переключателем
   * вместо флажка — с флажком время ухода было спрятано под ним и появлялось
   * только после того, как флажок снимут.
   */
  const [весьДень, setВесьДень] = useState(true)
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
  const выбрано = new Set(выбор)
  const границы = выбор.length > 0 ? [выбор[0], выбор[выбор.length - 1]] : null

  /*
   * Перед назначением подставляем то время, что уже стоит на первом
   * выбранном дне: иначе повторное назначение того же прайма молча
   * сдвинуло бы его на стандартные 21:00–23:30.
   */
  useMemo(() => {
    if (!выбор.length) return
    const текущее = primeOf(db.schedule, выбор[0])
    if (текущее.kind === 'окно') setОкно(текущее.window)
    else if (текущее.kind === 'нет') setОкно(ПО_УМОЛЧАНИЮ)
    const персонаж = db.chars.find((c) => c.id === герой)
    const его = персонаж?.away?.[выбор[0]]
    if (его) {
      setВесьДень(его.whole)
      if (!его.whole && его.window) setОкноУхода(его.window)
    }
  }, [выбор, db.schedule, db.chars, герой])

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
   * Снимает отметки об отсутствии у всех, кто их поставил на выделенные дни.
   *
   * Отдельная кнопка рядом с «Снять отметку»: та снимает своё, эта — всех.
   * На празднике, где отметились четверо, своё снимать — одна кнопка, а
   * остальных приходилось по очереди выбирать в списке «Кто».
   */
  const очиститьВсеОтсутствия = () => {
    if (!выбор.length) return
    clearAwayAll(выбор)
  }

  /*
   * Кто и на скольки из выделенных дней отмечен.
   *
   * С профессией и уровнем, а не только ником: в пати встречаются два
   * Ироки, и по одному нику не видно, кого именно отметили. Нужно и
   * заранее — по этой же строке видно, кого не придётся ждать.
   */
  const отмеченные = useMemo(() => {
    const out: { id: string; имя: string; cls: string; level: number; дней: number }[] = []
    for (const c of db.chars) {
      const дней = выбор.reduce((n, k) => (c.away?.[k] ? n + 1 : n), 0)
      if (дней) out.push({ id: c.id, имя: c.name || 'Без имени', cls: c.cls || '', level: c.level, дней })
    }
    return out
  }, [выбор, db.chars])

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

      {!мастер && <ScheduleNote имя={имяСвоего} />}

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
          <DaySummary
            день={выбор.length > 0 ? выбор[0] : сегодня}
            выбрано={выбор.length}
            chars={db.chars}
            schedule={db.schedule}
          />

          <Checklist />
        </aside>
      </div>

      {/*
        Редактор — под календарём, где он и стоял, но на всю ширину.

        Правая колонка оказалась для него тесной: блоков два, а места в трёхстах
        пикселях — одно поле в ряд, и каждый второй ряд уезжал на третью
        строку. В колонке под календарём чуть лучше, но не хватает: на блок
        выходило по 377 пикселей, и готовые окна прайма с полями в одну строку
        не влезали, а три кнопки переносились на третью строку.

        Поэтому панель лежит под всей раскладкой, а не под одной колонкой.
        Для календаря это то же самое место — он слева и выше, — но оба блока
        получают по половине экрана и укладываются в два ряда.

        Порядок блоков неслучаен: слева прайм — его ставят чаще, и он первым
        попадает под курсор после выделения дней; справа отсутствие, которым
        пользуются реже и по другому поводу.

        Появляется редактор и под токеном персонажа: там он состоит из одного
        блока и занимает всю ширину, а не половину.
      */}
    {(мастер || свойId) && границы && (
        <div className="cal-editor">
              <div className="editor-what">
                <strong>
                  {выбор.length === 1
                    ? деньПодпись(выбор[0], true)
                    : `${деньПодпись(границы[0])} — ${деньПодпись(границы[1])}`}
                </strong>
                <span className="editor-count">{выбор.length} дн.</span>
                {/*
                  Кнопка сброса — крестик сразу рядом с тем, что сброшено,
                  а не отдельной кнопкой в конце ряда действий: стояла там,
                  сливалась с остальными и тянула взгляд не туда.
                */}
                <button
                  className="icon-btn tiny"
                  title="Снять выделение"
                  onClick={() => setВыбор([])}
                >
                  <IconClose />
                </button>

                {/*
                  Что стоит на выделенных днях сейчас. Выделение переживает
                  назначение, и без этой строки не видно, что кнопка только
                  что сделала. Справа от всего: это ответ, а не подпись, и
                  читать его надо после того, как увидишь дни.
                */}
                <span className="editor-now">{чтоТам}</span>
              </div>

              <div className={`editor-grid${мастер ? '' : ' один'}`}>
                {/* Прайм и выходной — мастерские. Токен персонажа их не видит. */}
                {мастер && (
                <section className="editor-block">
                  <h4>Прайм</h4>
                  <div className="row time-row">
                    <label>
                      начало
                      <input
                        className="input time"
                        type="time"
                        value={вПоле(окно.from, false)}
                        onChange={(e) => setОкно({ ...окно, from: изПоля(e.target.value, false) })}
                      />
                    </label>
                    <label>
                      конец
                      <input
                        className="input time"
                        type="time"
                        value={вПоле(окно.to, true)}
                        onChange={(e) => setОкно({ ...окно, to: изПоля(e.target.value, true) })}
                      />
                    </label>
                  </div>

                  {/*
                    Порядок кнопок — по тому, чем пользуются: назначить прайм,
                    объявить выходной, снять всё.

                    «Очистить» в конце, а не сразу после «Назначить прайм»:
                    стоящие рядом «назначить» и «очистить» читаются как отмена
                    того, что только что сделал, и рука промахивалась мимо.

                    Слова полные: короткое «Выходной» не говорило о том, что кнопка что-то
                    назначает, — ровно как не говорило назначение прайма.
                  */}
                  <div className="row">
                    <button className="btn primary" disabled={окно.from >= окно.to} onClick={назначитьПрайм}>
                      Назначить прайм
                    </button>
                    {выходныхВВыборе === выбор.length ? (
                      <button className="btn" onClick={снятьВыходной}>
                        Не {выходноеСлово(выбор.length)}
                      </button>
                    ) : (
                      <button
                        className="btn"
                        onClick={отметитьВыходной}
                        title="Пати не собирается в эти дни"
                      >
                        Назначить {выходноеСлово(выбор.length)}
                      </button>
                    )}
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
                  {окно.from >= окно.to && (
                    <p className="hint">Прайм должен заканчиваться позже, чем начинается.</p>
                  )}
                </section>
                )}

                <section className="editor-block">
                  {/*
                    Заголовок и «кто» в одной строке.

                    Раньше «Кто» стоял отдельной строкой под заголовком и съедал
                    высоту целиком: в блоке высотой в пол-экрана половина уходила
                    на выбор одного имени из списка. Теперь он справа от
                    заголовка, и блок на строку ниже.

                    При своём токене списка нет вовсе: выбирать не из чего, и
                    пустой перечень рядом с подписью читался бы как поломка. Имя
                    просто написано — кто отмечает, и так видно.
                  */}
                  <div className="block-head">
                    <h4>Отсутствие</h4>
                    {мастер ? (
                      <select
                        className="input who"
                        value={герой}
                        onChange={(e) => setКто(e.target.value)}
                        disabled={db.chars.length === 0}
                        title="Кого отмечаем отсутствующим"
                      >
                        {db.chars.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name || 'Без имени'}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="who-fixed" title="Токен персонажа правит только его">
                        {db.chars.find((c) => c.id === герой)?.name || 'свой персонаж'}
                      </span>
                    )}
                  </div>

                  {/*
                    На сколько отмечают — переключателем из двух равноправных
                    вариантов, а не флажком.

                    С флажком время ухода было спрятано под ним и появлялось
                    только после того, как флажок снимут: чтобы поставить
                    отметку на часть дня, надо было догадаться, что «Весь
                    день» — это не «отметить отсутствие», а выбор одного из
                    двух вариантов. Теперь оба варианта видны сразу.
                  */}
                  <Переключатель
                    значение={весьДень ? 'всего' : 'окно'}
                    onChange={(v) => setВесьДень(v === 'всего')}
                    варианты={[
                      { key: 'всего', подпись: 'Весь день', подсказка: 'Не придёт целиком' },
                      {
                        key: 'окно',
                        подпись: 'Часть дня',
                        подсказка: 'Не выйдет только на время ухода',
                      },
                    ]}
                  />

                  {!весьДень && (
                    <div className="row time-row">
                      <label>
                        начало
                        <input
                          className="input time"
                          type="time"
                          value={вПоле(окноУхода.from, false)}
                          onChange={(e) => setОкноУхода({ ...окноУхода, from: изПоля(e.target.value, false) })}
                        />
                      </label>
                      <label>
                        конец
                        <input
                          className="input time"
                          type="time"
                          value={вПоле(окноУхода.to, true)}
                          onChange={(e) => setОкноУхода({ ...окноУхода, to: изПоля(e.target.value, true) })}
                        />
                      </label>
                    </div>
                  )}

                  {/*
                    Списка «не придут» здесь больше нет: те же имена стоят в
                    клетках календаря и в сводке справа, и в блоке они были
                    третьим упоминанием одного и того же. Кто отмечен — видно
                    по клеткам, а кнопка «Снять у всех» и так гаснет, когда
                    отметок нет.
                  */}

                  <div className="row">
                    <button className="btn primary" disabled={!герой} onClick={отметитьОтсутствие}>
                      Отметить отсутствие
                    </button>
                    <button
                      className="btn"
                      disabled={!герой || уходовНет === 0}
                      title={уходовНет === 0 ? 'У выбранного персонажа на этих днях отметки нет' : undefined}
                      onClick={снятьОтсутствие}
                    >
                      Снять отсутствие
                    </button>
                    {/*
                      Снимает отметки у всех, кто их поставил, на выбранных
                      днях. Отдельная от «Снять»: та берёт своё, эта — всех, и на
                      празднике, где отметились четверо, не надо было проходить
                      по списку «Кто» вручную.

                      Только мастеру: чужой персонаж токеном персонажа не
                      правится, и сервер такой запрос всё равно не примет.
                    */}
                    {мастер && (
                      <button
                        className="btn"
                        disabled={отмеченные.length === 0}
                        title={
                          отмеченные.length === 0
                            ? 'На выделенных днях ни у кого нет отметки об отсутствии'
                            : 'Снять отметки об отсутствии у всех на выделенных днях'
                        }
                        onClick={очиститьВсеОтсутствия}
                      >
                        Снять у всех
                      </button>
                    )}
                  </div>
                </section>
              </div>
            </div>
          )}
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
      {/*
        Имена отсутствующих — целиком, столбиком.

        Раньше в клетке стояла первая буква, а на нескольких людях — счётчик
        «−3». Буква ничего не говорила: в пати встречаются два Ирока, и по И
        нельзя было понять, кого именно не ждать. Полные имена читаются сразу.

        Длинные имена и длинные списки уходят за край: имя обрезается
        многоточием, лишние сворачиваются в «ещё N», а полный список остаётся
        в подсказке. Без обрезки неделя с отпуском растянула бы календарь.
      */}
      {отсутствуют.length > 0 && (
        <span
          className="cal-away"
          title={`Отсутствуют: ${отсутствуют
            .map(
              (a) =>
                `${a.имя}${
                  a.absence.whole
                    ? ''
                    : ` (${formatMinutes(a.absence.window!.from)}–${formatMinutes(a.absence.window!.to)})`
                }`,
            )
            .join(', ')}`}
        >
          {отсутствуют.slice(0, ПУСТЫХ_В_ЯЧЕЙКЕ).map((a) => (
            <span key={a.charId} className="cal-away-name" title={a.имя}>
              {a.имя}
            </span>
          ))}

          {/*
            Остальные — за «ещё N», и по наведению на него раскрывается весь
            список: в угол помещается три, а пати собирается всей, и молча
            сворачивать шестерых в «ещё 3» значило бы не сказать, кто именно.
          */}
          {отсутствуют.length > ПУСТЫХ_В_ЯЧЕЙКЕ && (
            <span className="cal-away-more">
              ещё {отсутствуют.length - ПУСТЫХ_В_ЯЧЕЙКЕ}
              <span className="cal-away-pop">
                {отсутствуют.map((a) => (
                  <span key={a.charId} className="cal-away-pop-row">
                    {a.имя}
                    {!a.absence.whole && (
                      <span className="cal-away-pop-when">
                        {formatMinutes(a.absence.window!.from)}–{formatMinutes(a.absence.window!.to)}
                      </span>
                    )}
                  </span>
                ))}
              </span>
            </span>
          )}
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
              <СтрокаСводки
                key={c.id}
                имя={c.name}
                cls={c.cls}
                level={c.level}
                примечание={описаниеОтсутствия(c.away![день])}
              />
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
 * Одна на оба списка. Списки про об одном составе, и разъезжаться им
 * незачем: если «Не придут» подробнее, а «Пойдут» с одним ником, то
 * непонятно, где вообще смотреть подробности.
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
  // Пункты общие: токен персонажа их не правит. Отметки при этом остаются
  // доступны — они живут только в этой вкладке и в базу не попадают.
  const { canEditParty: правый } = useAccess()
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