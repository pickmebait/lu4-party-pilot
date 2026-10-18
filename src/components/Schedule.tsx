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
  isoToday,
  monthGrid,
  parseKey,
  primeOf,
  weekDays,
  weekendKeys,
  type DayAbsent,
  type DayCell,
} from '@/lib/schedule'
import {
  addChecklistItem,
  removeChecklistItem,
  updateChecklistItem,
  useDb,
} from '@/lib/store'
import { isMarked, toggleChecklist, useChecklistMarks } from '@/lib/checklistSession'
import { useAccess, useOwnCharName } from '@/lib/access'
import { РедакторДней } from './ScheduleEditor'
import { IconClose } from './Icons'
import { ScheduleNote } from './ReadOnlyNote'

/**
 * Переключатель из двух вариантов — «на весь день» или «на окно».
 *
 * Обычный флажок прятал за собой всё, что появлялось при его снятии: чтобы
 * добраться до времени ухода, надо было сначала догадаться, что флажок
 * вообще снимается, и только потом увидеть поля. Здесь оба варианта видны
 * сразу, и выбранный отмечен.
 */


/*
 * Сколько имён влезает в угол клетки дня.
 *
 * Три: угол узкий, а четыре строки в него уже не входят. Остальные сворачиваются
 * в «ещё N», и наведение на него раскрывает весь список.
 */
const ИМЁН_В_ЯЧЕЙКЕ = 3

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
      <РедакторДней
        выбор={выбор}
        герой={герой}
        chars={db.chars}
        мастер={мастер}
        onСменаГероя={setКто}
        onСнятьВыделение={() => setВыбор([])}
      />
    )}
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
        отсутствуют.length > 0 ? `нет: ${подписьСписка(отсутствуют)}` : '',
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
        <span className="cal-away" title={`Отсутствуют: ${подписьСписка(отсутствуют)}`}>
          {отсутствуют.slice(0, ИМЁН_В_ЯЧЕЙКЕ).map((a) => (
            <span key={a.charId} className="cal-away-name" title={a.имя}>
              {a.имя}
            </span>
          ))}

          {/*
            Остальные — за «ещё N», и по наведению на него раскрывается весь
            список: в угол помещается три, а пати собирается всей, и молча
            сворачивать шестерых в «ещё 3» значило бы не сказать, кто именно.
          */}
          {отсутствуют.length > ИМЁН_В_ЯЧЕЙКЕ && (
            <span className="cal-away-more">
              ещё {отсутствуют.length - ИМЁН_В_ЯЧЕЙКЕ}
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
        {выбрано > 1 ? `выбранные дни · ${выбрано} шт.` : formatDay(день, true)}
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
                примечание={describeAbsence(c.away![день])}
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
