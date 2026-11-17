import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useDb } from '@/lib/store'
import {
  дниПраймов,
  началоПериода,
  основнаяГотовность,
  премиумСводка,
  праймЗаПериод,
  следующийПрайм,
  явкаЗаПериод,
  type ПериодДней,
  type ПраймЗаПериод,
  type ОсновнаяСводка,
  type ПремиумСводка,
  type Явка,
} from '@/lib/analytics'
import { isMarked, toggleChecklist, useChecklistMarks } from '@/lib/checklistSession'
import { РОЛИ, РОЛЬ_ПОДПИСЬ, roleOfClass } from '@/lib/roles'
import {
  ДНИ_НЕДЕЛИ,
  addDays,
  daysAround,
  daysBetween,
  formatDay,
  formatDayRange,
  formatMinutes,
  formatWeekday,
  isoKey,
  parseKey,
  primeOf,
} from '@/lib/schedule'
import {
  dayShiftBetween,
  formatZoneWindow,
  userTimeZone,
  userWindow,
  wallTimeAt,
} from '@/lib/timezone'
import { AFFILIATIONS, affiliationOrder, type Char, type Db } from '@/types'
import { plural } from '@/lib/util'

/**
 * Режимы сводки.
 *
 * «Сегодня» — это не период, а другой экран: штаб пати. Поэтому ключ режима
 * строкой, а не числом дней: иначе пришлось бы объяснять, почему ноль дней
 * значит «сейчас», а ноль in period means «всё время».
 */
type Режим = 'сегодня' | 30 | 90 | 0

const РЕЖИМЫ: { key: Режим; label: string }[] = [
  { key: 'сегодня', label: 'Сегодня' },
  { key: 30, label: 'За 30 дней' },
  { key: 90, label: 'За 90 дней' },
  { key: 0, label: 'За все время' },
]

/**
 * Выбранный режим живёт в модуле, а не в состоянии компонента.
 *
 * Раздел пересоздаётся при каждом уходе на другую вкладку. Если хранить
 * режим в компоненте, вернувшись, человек получил бы «Сегодня» вместо
 * периода, который выбирал. Это не данные пати, а способ посмотреть —
 * и он должен переживать переключение вкладок.
 */
let выбранныйРежим: Режим = 'сегодня'

/* --------------------------------------------------------------- мелочи */

/** Русская десятичная запятая: 7.5 читалось бы как код. */
function дробь(число: number): string {
  return String(число).replace('.', ',')
}

/** Минуты словами: окно прайма «2 ч 8 мин», а не «128». */
function длительность(минут: number): string {
  const ч = Math.floor(минут / 60)
  const мин = Math.round(минут % 60)
  if (!ч) return `${мин} мин`
  if (!мин) return `${ч} ч`
  return `${ч} ч ${мин} мин`
}

/** «окт» — месяц в подписи, где год не нужен. */
const МЕСЯЦЫ_КОРОТКО = [
  'янв', 'фев', 'мар', 'апр', 'мая', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
]

function месяцКоротко(key: string): string {
  return МЕСЯЦЫ_КОРОТКО[parseKey(key).getMonth()] ?? key
}

/** «Сегодня», «Завтра», «21 ноября» — без года. */
function деньСловами(день: string, сегодня: string): string {
  const разница = Math.round(
    (parseKey(день).getTime() - parseKey(сегодня).getTime()) / 86_400_000,
  )
  if (разница === 0) return 'Сегодня'
  if (разница === 1) return 'Завтра'
  if (разница === 2) return 'Послезавтра'
  return formatDay(день)
}

/** Сколько осталось до события: «9 ч 48 мин», «1 дн. 8 ч». */
function доСобытия(минут: number): string {
  if (минут < 60) return `${Math.max(0, минут)} мин`
  if (минут >= 1440) {
    const дней = Math.floor(минут / 1440)
    const часов = Math.floor((минут % 1440) / 60)
    return `${дней} дн.${часов ? ` ${часов} ч` : ''}`
  }
  const часов = Math.floor(минут / 60)
  const остаток = минут % 60
  return `${часов} ч${остаток ? ` ${остаток} мин` : ''}`
}

/** «завтра», «через 5 дней» — для премиума. */
function срокСловами(дней: number): string {
  if (дней <= 0) return 'истёк'
  if (дней === 1) return 'завтра'
  return `через ${дней} ${plural(дней, 'день', 'дня', 'дней')}`
}

/** Сдвиг дня для подписи: «+1 дн.». */
function сдвигДня(сдвиг: number): string {
  if (!сдвиг) return ''
  return `${сдвиг > 0 ? '+' : '−'}${Math.abs(сдвиг)} дн.`
}

/** Понедельник недели, в которую попал день. */
function началоНедели(key: string): string {
  const дата = parseKey(key)
  const день = дата.getDay()
  return isoKey(addDays(дата, день === 0 ? -6 : 1 - день))
}

/** Воскресенье недели, в которую попал день. */
function конецНедели(key: string): string {
  const дата = parseKey(key)
  const день = (дата.getDay() + 6) % 7
  return isoKey(addDays(дата, 6 - день))
}

/** Самая ранняя дата, о которой в базе вообще есть запись. */
function началоИстории(db: Db, сегодня: string): string {
  const ключи = [
    ...Object.keys(db.schedule.prime),
    ...db.schedule.offs,
  ]
    .filter((key) => key <= сегодня)
    .sort()
  return ключи[0] ?? сегодня
}

/** Есть ли у персонажа хоть один канал связи, кроме реального имени. */
function естьСвязь(c: Char): boolean {
  const контакты = c.contacts
  return Boolean(
    контакты?.phone?.trim() ||
      контакты?.telegram?.trim() ||
      контакты?.discord?.trim(),
  )
}

/**
 * Даты пропусков словами.
 *
 * Соседние дни сворачиваются в диапазон: «4–13 ноя» читается как отпуск,
 * а «4, 5, 6, 7, 8, 9, 10, 11, 12, 13 ноя» занимает строку целиком.
 */
function датыСловами(дни: string[]): string {
  const отсортированы = [...дни].sort()
  const группы: string[] = []
  let i = 0
  while (i < отсортированы.length) {
    let j = i
    while (j + 1 < отсортированы.length) {
      const разница = Math.round(
        (parseKey(отсортированы[j + 1]).getTime() - parseKey(отсортированы[j]).getTime()) /
          86_400_000,
      )
      if (разница !== 1) break
      j++
    }
    группы.push(диапазонДат(отсортированы[i], отсортированы[j]))
    i = j + 1
  }
  return группы.join(' · ')
}

function диапазонДат(с: string, по: string): string {
  const первый = parseKey(с)
  const последний = parseKey(по)
  if (с === по) return `${первый.getDate()} ${месяцКоротко(с)}`
  if (первый.getMonth() === последний.getMonth()) {
    return `${первый.getDate()}–${последний.getDate()} ${месяцКоротко(с)}`
  }
  return `${первый.getDate()} ${месяцКоротко(с)} — ${последний.getDate()} ${месяцКоротко(по)}`
}

/** Дни, в которые персонаж пропустил прайм. */
function пропущенныеДни(персонаж: Char | undefined, праймы: string[]): string[] {
  if (!персонаж) return []
  return праймы.filter((день) => персонаж.away?.[день])
}

/* ------------------------------------------------------------- разметка */

/**
 * Сводка: «Штаб пати» для текущего состояния и «Ритм пати» для истории.
 *
 * Период — настоящий фильтр только во втором режиме. В «Штабе» он отвечает
 * лишь на вопрос «как давно» у пары цифр, потому что снаряжение, ПА и
 * контакты хранятся как текущее состояние, без истории.
 */
export function SummaryView({ onOpenSchedule }: { onOpenSchedule?: () => void }) {
  const db = useDb()
  const [режим, setРежим] = useState<Режим>(выбранныйРежим)
  const [сейчас, setСейчас] = useState(() => new Date())

  // Время нужно настоящее: «до старта» — не украшение, а единственная
  // цифра, которую человек проверяет перед входом. Раз в полминуты хватает,
  // чтобы она не врала и не дёргала страницу.
  useEffect(() => {
    const таймер = window.setInterval(() => setСейчас(new Date()), 30_000)
    return () => window.clearInterval(таймер)
  }, [])

  const выбрать = (новый: Режим) => {
    выбранныйРежим = новый
    setРежим(новый)
  }

  const сегодня = isoKey(сейчас)
  const минутСейчас = сейчас.getHours() * 60 + сейчас.getMinutes()
  const дней: ПериодДней = режим === 'сегодня' ? 30 : режим
  const сОт = режим === 'сегодня' ? null : началоПериода(дней, сегодня)

  const явка30 = useMemo(
    () => явкаЗаПериод(db, началоПериода(30, сегодня), сегодня),
    [db, сегодня],
  )
  const прайм = useMemo(() => праймЗаПериод(db, сОт, сегодня), [db, сОт, сегодня])
  const явка = useMemo(() => явкаЗаПериод(db, сОт, сегодня), [db, сОт, сегодня])
  const дниПрайма = useMemo(
    () => дниПраймов(db.schedule, сОт, сегодня),
    [db, сОт, сегодня],
  )
  const готовность = useMemo(() => основнаяГотовность(db), [db])
  const премиум = useMemo(() => премиумСводка(db, сегодня), [db, сегодня])

  const начало = сОт ?? началоИстории(db, сегодня)
  const крошка =
    режим === 'сегодня'
      ? `${formatWeekday(сегодня)}, ${formatDay(сегодня)} · ${formatMinutes(минутСейчас)}`
      : formatDayRange([начало, сегодня])

  return (
    <section className="view dash-view">
      <div className="view-head dash-head">
        <div className="view-actions affil">
          <div className="segmented" role="group" aria-label="Режим сводки">
            {РЕЖИМЫ.map((р) => (
              <button
                key={String(р.key)}
                type="button"
                className={режим === р.key ? 'on' : ''}
                onClick={() => выбрать(р.key)}
              >
                {р.label}
              </button>
            ))}
          </div>
        </div>
        <span className="dash-crumb">{крошка}</span>
      </div>

      {db.chars.length === 0 ? (
        <div className="empty">
          <p>В пати пока нет персонажей.</p>
          <p className="hint">
            Как только они появятся, здесь станут видны прайм, явка, снаряжение и роли.
          </p>
        </div>
      ) : режим === 'сегодня' ? (
        <Штаб
          db={db}
          сегодня={сегодня}
          сейчас={сейчас}
          явка30={явка30}
          готовность={готовность}
          премиум={премиум}
          onOpenSchedule={onOpenSchedule}
        />
      ) : (
        <Ритм
          db={db}
          сегодня={сегодня}
          дней={дней}
          сОт={сОт}
          прайм={прайм}
          явка={явка}
          дниПрайма={дниПрайма}
          начало={начало}
        />
      )}
    </section>
  )
}

/* ------------------------------------------------------------- «Штаб» */

function Штаб({
  db,
  сегодня,
  сейчас,
  явка30,
  готовность,
  премиум,
  onOpenSchedule,
}: {
  db: Db
  сегодня: string
  сейчас: Date
  явка30: Явка
  готовность: ОсновнаяСводка
  премиум: ПремиумСводка
  onOpenSchedule?: () => void
}) {
  useChecklistMarks()

  const всего = db.chars.length
  const составПоМестам = AFFILIATIONS.map((a) => ({
    ...a,
    сколько: db.chars.filter((c) => c.affil === a.key).length,
  }))
  const безСвязи = db.chars.filter((c) => !естьСвязь(c))
  const пустые = db.chars.filter((c) => {
    const г = готовность.поПерсонажам.find((п) => п.charId === c.id)
    return !c.cls.trim() || !г || г.занято === 0
  })

  const следующий = следующийПрайм(db.schedule, сейчас.getTime())
  const часовойПояс = userTimeZone()
  const местноеОкно = следующий
    ? userWindow(следующий.день, следующий.окно, часовойПояс)
    : null
  const сдвиг = местноеОкно ? dayShiftBetween(следующий!.день, местноеОкно.from.key) : 0
  const доСтарта = следующий?.доНачала ?? 0
  const доКонца = следующий?.доКонца ?? 0

  // 14 дней — две недели вперёд, включая сегодняшний вечер.
  const дни14 = daysAround(сегодня, 0, 13)
  const праймы14 = дни14.filter((д) => primeOf(db.schedule, д).kind === 'окно')
  const выходные14 = дни14.filter((д) => primeOf(db.schedule, д).kind === 'выходной')
  const окон14 = праймы14.map((д) => {
    const состояние = primeOf(db.schedule, д)
    return состояние.kind === 'окно' ? состояние.window : null
  })
  const первоеОкно = окон14.find((о) => о !== null) ?? null
  const одинаковыеОкна =
    первоеОкно !== null &&
    окон14.every((о) => о && о.from === первоеОкно.from && о.to === первоеОкно.to)
  const местноеОкно14 =
    первоеОкно && праймы14.length
      ? userWindow(праймы14[0], первоеОкно, часовойПояс)
      : null
  const часов14 = Math.round(
    окон14.reduce((всего, о) => всего + (о ? о.to - о.from : 0), 0) / 6,
  ) / 10

  const отсутствия14 = db.chars
    .map((c) => ({
      персонаж: c,
      дни: праймы14.filter((д) => c.away?.[д]),
    }))
    .filter((п) => п.дни.length > 0)

  const отметки = db.schedule.checklist
  const готово = отметки.filter((п) => isMarked(п.id)).length
  const прогресс = отметки.length ? Math.round((готово / отметки.length) * 100) : 0

  const роли = РОЛИ.map((роль) => ({
    роль,
    люди: db.chars.filter((c) => roleOfClass(c.cls) === роль),
  })).filter((г) => г.люди.length > 0)

  const поУровням = new Map<number, number>()
  for (const c of db.chars) поУровням.set(c.level, (поУровням.get(c.level) ?? 0) + 1)
  const уровни = [...поУровням.entries()].sort((a, b) => b[0] - a[0])
  const максимумУровня = Math.max(1, ...уровни.map(([, сколько]) => сколько))
  const сУровнем = db.chars.filter((c) => c.level > 0)
  const среднийУровень = сУровнем.length
    ? Math.round(сУровнем.reduce((всего, c) => всего + c.level, 0) / сУровнем.length)
    : 0
  const безУровня = db.chars.filter((c) => c.level <= 0)

  const истекли = премиум.поПерсонажам.filter(
    (п): п is typeof п & { осталось: number } => п.осталось !== null && п.осталось <= 0,
  )
  const истекают = премиум.поПерсонажам.filter(
    (п): п is typeof п & { осталось: number } =>
      п.осталось !== null && п.осталось > 0 && п.осталось <= 7,
  )

  const свободны = следующий
    ? db.chars.filter((c) => !c.away?.[следующий.день])
    : []
  const отсутствуют = следующий
    ? db.chars.filter((c) => c.away?.[следующий.день]).map((c) => c.name || 'Без имени')
    : []

  const поводов =
    (истекли.length > 0 ? 1 : 0) +
    (истекают.length > 0 ? 1 : 0) +
    (безСвязи.length > 0 ? 1 : 0) +
    (пустые.length > 0 ? 1 : 0) +
    (отсутствия14.length > 0 ? 1 : 0)

  return (
    <>
      <div className="dash-kpis">
        <Kpi
          label="Состав"
          value={
            <>
              {всего} <small>чел.</small>
            </>
          }
          sub={составПоМестам.map((м) => `${м.сколько} ${м.label.toLowerCase()}`).join(' · ')}
        />
        <Kpi
          label="Явка за 30 дней"
          value={
            явка30.праймов > 0 ? (
              <>
                {дробь(явка30.средняя)} <small>из {всего}</small>
              </>
            ) : (
              '—'
            )
          }
          sub={
            явка30.праймов > 0
              ? `${явка30.полных} полных сборов из ${явка30.праймов} праймов`
              : 'праймов за 30 дней нет'
          }
        />
        <Kpi
          label="Экипировка"
          value={`${готовность.собраны}/${готовность.всего}`}
          sub={
            <>
              средняя заточка <span className="dash-accent">+{дробь(готовность.средняя)}</span> ·{' '}
              {готовность.слотов} основных слотов
            </>
          }
        />
        <Kpi
          label="Премиум"
          value={`${премиум.активен + премиум.истекает}/${всего}`}
          sub={
            премиум.заполнен === 0 ? (
              'ПА не заполнен'
            ) : (
              <>
                {истекают.length > 0 && (
                  <span className="dash-warn-text">
                    {истекают.length} {plural(истекают.length, 'истекает', 'истекают', 'истекают')}
                  </span>
                )}
                {истекают.length > 0 && истекли.length > 0 && ' · '}
                {истекли.length > 0 && (
                  <span className="dash-bad-text">
                    {истекли.length} {plural(истекли.length, 'истёк', 'истекли', 'истекли')}
                  </span>
                )}
                {истекают.length === 0 && истекли.length === 0 && 'все продлены'}
              </>
            )
          }
        />
      </div>

      <div className="dash-grid-hero">
        <section className="dash-card dash-prime-card">
          {следующий && местноеОкно ? (
            <>
              <div className="dash-prime-top">
                <div>
                  <span className="dash-mark gold">Следующий прайм</span>
                  <h2 className="dash-prime-time">{formatZoneWindow(местноеОкно)}</h2>
                  <div className="dash-prime-sub">
                    <b>
                      {деньСловами(следующий.день, сегодня)},{' '}
                      {formatWeekday(следующий.день)}
                    </b>{' '}
                    · {длительность(следующий.окно.to - следующий.окно.from)}
                    {сдвиг !== 0 && <span className="dash-shift"> ({сдвигДня(сдвиг)})</span>}
                    {' · '}
                    {следующий.тема || 'окно по расписанию'}
                  </div>
                </div>
                <div className="dash-countdown">
                  <b>{доСтарта > 0 ? доСобытия(доСтарта) : 'сейчас'}</b>
                  <span>
                    {доСтарта > 0
                      ? 'до старта'
                      : `ещё ${доСобытия(Math.max(0, доКонца))}`}
                  </span>
                </div>
              </div>

              <ОсьПрайма
                окно={следующий.окно}
                день={следующий.день}
                сегодня={сегодня}
                сейчас={сейчас}
                часовойПояс={часовойПояс}
              />

              <div className="dash-prime-foot">
                {отсутствуют.length > 0 ? (
                  <span className="dash-free bad">
                    <span className="dash-pulse bad" />
                    <b>{отсутствуют.length} не смогут</b>
                    <span className="dash-free-names"> — {отсутствуют.join(', ')}</span>
                  </span>
                ) : (
                  <span className="dash-free">
                    <span className="dash-pulse" />
                    <b>Все {свободны.length} свободны</b>
                  </span>
                )}
                <span className="dash-muted-note">
                  {отсутствия14.length > 0
                    ? `отсутствия на 14 дней у ${отсутствия14.length} ${plural(отсутствия14.length, 'человека', 'человек', 'человек')}`
                    : 'на 14 дней отсутствий не заявлено'}
                </span>
                {onOpenSchedule && (
                  <button className="btn dash-btn" type="button" onClick={onOpenSchedule}>
                    Расписание →
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <span className="dash-mark">Прайм</span>
              <h2 className="dash-prime-time dash-prime-empty">не назначен</h2>
              <p className="dash-prime-sub">
                На ближайшие два месяца в расписании нет прайма. Назначить время можно в
                разделе «Расписание».
              </p>
              {onOpenSchedule && (
                <div className="dash-prime-foot">
                  <button className="btn dash-btn" type="button" onClick={onOpenSchedule}>
                    Открыть расписание →
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        <section className="dash-card dash-check-card">
          <div className="dash-check-top">
            <h3>Собраться к прайму</h3>
            <span className="dash-check-count">
              {готово} из {отметки.length}
            </span>
          </div>
          <div className="dash-progress" aria-hidden="true">
            <i style={{ width: `${прогресс}%` }} />
          </div>
          {отметки.length === 0 ? (
            <p className="hint">Чеклист пуст. Пункты задаются в расписании.</p>
          ) : (
            <ul className="dash-check-list">
              {отметки.slice(0, 6).map((п) => {
                const отмечен = isMarked(п.id)
                return (
                  <li key={п.id}>
                    <button
                      type="button"
                      className={`dash-check-item${отмечен ? ' done' : ''}`}
                      aria-pressed={отмечен}
                      onClick={() => toggleChecklist(п.id)}
                    >
                      <span className="dash-check-box" aria-hidden="true">
                        {отмечен ? '✓' : ''}
                      </span>
                      <span>{п.text}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {отметки.length > 6 && (
            <p className="dash-mini">и ещё {отметки.length - 6}</p>
          )}
          <div className="dash-check-foot">
            Общий чеклист из расписания
            {onOpenSchedule && (
              <button className="btn dash-btn" type="button" onClick={onOpenSchedule}>
                Открыть
              </button>
            )}
          </div>
        </section>
      </div>

      <section className="dash-card dash-strip-card">
        <div className="dash-strip-head">
          <h3>Ближайшие 14 дней</h3>
          <span className="dash-strip-sub">
            {праймы14.length === 0
              ? 'прайм не назначен'
              : `${одинаковыеОкна && местноеОкно14 ? `прайм ${formatZoneWindow(местноеОкно14)}` : 'прайм по расписанию'} · ${праймы14.length} ${plural(праймы14.length, 'прайм', 'прайма', 'праймов')}${выходные14.length ? ` · ${выходные14.length} ${plural(выходные14.length, 'выходной', 'выходных', 'выходных')}` : ''} · ${дробь(часов14)} ч`}
          </span>
          <div className="dash-legend">
            <span>
              <i className="dash-sw today" />
              сегодня
            </span>
            <span>
              <i className="dash-sw prime" />
              прайм
            </span>
            <span>
              <i className="dash-sw off" />
              выходной пати
            </span>
          </div>
        </div>
        <div className="dash-days-scroll">
          <div className="dash-days">
            {дни14.map((д) => {
              const состояние = primeOf(db.schedule, д)
              const ушли = db.chars.filter((c) => c.away?.[д])
              const пришло = всего - ушли.length
              const класс = [
                'dash-day',
                д === сегодня ? 'today' : '',
                состояние.kind === 'выходной' ? 'off' : '',
                состояние.kind === 'окно' ? 'prime' : '',
                состояние.kind === 'окно' && ушли.length ? 'partial' : '',
                состояние.kind === 'нет' ? 'none' : '',
              ]
                .filter(Boolean)
                .join(' ')
              const подсказка =
                состояние.kind === 'выходной'
                  ? `${formatDay(д)} · выходной пати`
                  : состояние.kind === 'окно'
                    ? `${formatDay(д)} · ${пришло} из ${всего}${ушли.length ? ` · нет: ${ушли.map((c) => c.name || 'Без имени').join(', ')}` : ' · все были'}`
                    : `${formatDay(д)} · прайм не назначен`
              return (
                <div key={д} className={класс} title={подсказка}>
                  <span className="dash-day-dow">
                    {ДНИ_НЕДЕЛИ[(parseKey(д).getDay() + 6) % 7]}
                  </span>
                  <span className="dash-day-num">{parseKey(д).getDate()}</span>
                  <span className="dash-day-bar" />
                  <span className="dash-day-meta">
                    {состояние.kind === 'выходной'
                      ? 'выходной'
                      : состояние.kind === 'окно'
                        ? `${пришло}/${всего}`
                        : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <div className="dash-grid-bottom">
        <section className="dash-card dash-attention">
          <div className="dash-card-head">
            <h3>Требует внимания</h3>
            <span className="dash-card-sub">
              {поводов} {plural(поводов, 'повод', 'повода', 'поводов')} · данные на сегодня
            </span>
            {поводов > 0 && <span className="dash-card-tail">остальное в порядке</span>}
          </div>

          {поводов === 0 ? (
            <div className="dash-all-clear">
              <span className="dash-pulse" />
              <span>
                <b>Всё в порядке.</b> ПА продлён, контакты заполнены, снаряжение собрано.
              </span>
            </div>
          ) : (
            <div className="dash-att-list">
              {истекли.length > 0 && (
                <Повод tag="ПА" tone="bad" title="Премиум истёк" count={истекли.length}>
                  {истекли.map((п) => п.имя).join(', ')} — без премиума; проверить, не мешает ли
                  это прайму.
                </Повод>
              )}
              {истекают.length > 0 && (
                <Повод tag="ПА" tone="warn" title="Премиум заканчивается" count={истекают.length}>
                  {истекают
                    .map((п) => `${п.имя} — ${срокСловами(п.осталось)}`)
                    .join(' · ')}
                </Повод>
              )}
              {безСвязи.length > 0 && (
                <Повод tag="@" tone="warn" title="Нет канала связи" count={безСвязи.length}>
                  {безСвязи.map((c) => c.name || 'Без имени').join(', ')} — нет телефона,
                  телеграма или дискорда.
                </Повод>
              )}
              {пустые.length > 0 && (
                <Повод tag="!" tone="bad" title="Пустой персонаж" count={пустые.length}>
                  {пустые
                    .map((c) => {
                      const г = готовность.поПерсонажам.find((п) => п.charId === c.id)
                      const причины = [
                        !c.cls.trim() ? 'не задан класс' : '',
                        `${г?.занято ?? 0} из ${г?.всего ?? 0} слотов`,
                        c.level > 0 ? '' : 'нет уровня',
                      ]
                        .filter(Boolean)
                        .join(', ')
                      return `${c.name || 'Без имени'} — ${причины}`
                    })
                    .join('; ')}
                </Повод>
              )}
              {отсутствия14.length > 0 && (
                <Повод
                  tag="К"
                  tone="warn"
                  title="Отсутствия на 14 дней"
                  count={отсутствия14.length}
                >
                  {отсутствия14
                    .map((п) => `${п.персонаж.name || 'Без имени'} — ${датыСловами(п.дни)}`)
                    .join(' · ')}
                </Повод>
              )}
            </div>
          )}

          {отсутствия14.length > 0 ? (
            <div className="dash-all-clear warn">
              <span className="dash-pulse warn" />
              <span>
                <b>Состав на вечер может быть неполным.</b> Отсутствия заявлены у{' '}
                {отсутствия14.length}{' '}
                {plural(отсутствия14.length, 'человека', 'человек', 'человек')}.
              </span>
            </div>
          ) : (
            <div className="dash-all-clear">
              <span className="dash-pulse" />
              <span>
                <b>Отсутствий на 14 дней нет.</b> Все {всего} персонажей свободны — можно
                планировать прайм на весь состав.
              </span>
            </div>
          )}
        </section>

        <section className="dash-card dash-roles-card">
          <div className="dash-card-head">
            <h3>Кто в пати</h3>
            <span className="dash-card-tail">
              {всего} {plural(всего, 'персонаж', 'персонажа', 'персонажей')}
            </span>
          </div>

          <div className="dash-affil-bar">
            {составПоМестам.map((м) => (
              <i
                key={м.key}
                className={`dash-affil-${м.key}`}
                style={{ width: `${(м.сколько / всего) * 100}%` }}
              />
            ))}
          </div>
          <div className="dash-affil-legend">
            {составПоМестам.map((м) => (
              <span key={м.key}>
                <i className={`dash-affil-${м.key}`} />
                {м.label} {м.сколько}
              </span>
            ))}
          </div>

          {роли.length > 0 ? (
            <div className="dash-role-grid">
              {роли.map(({ роль, люди }) => (
                <div key={роль} className={`dash-role${роль === 'без роли' ? ' empty' : ''}`}>
                  <b>{люди.length}</b>
                  <span>{РОЛЬ_ПОДПИСЬ[роль]}</span>
                  <small title={люди.map((c) => c.name || 'Без имени').join(', ')}>
                    {люди.map((c) => c.name || 'Без имени').join(', ')}
                    {роль === 'без роли' &&
                    люди.length === 1 &&
                    !люди[0].cls.trim() &&
                    (готовность.поПерсонажам.find((п) => п.charId === люди[0].id)?.занято ?? 0) ===
                      0
                      ? ' — пустой профиль'
                      : ''}
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <p className="hint">Классы не заданы — роли считать не из чего.</p>
          )}

          {уровни.length > 0 && (
            <>
              <div className="dash-levels">
                {уровни.map(([уровень, сколько]) => (
                  <div className="dash-level-line" key={уровень}>
                    <span>{уровень > 0 ? уровень : '—'}</span>
                    <span className="dash-lv-bar">
                      <i style={{ width: `${(сколько / максимумУровня) * 100}%` }} />
                    </span>
                    <b>{сколько}</b>
                  </div>
                ))}
              </div>
              <div className="dash-roles-foot">
                {среднийУровень > 0 && <>Средний уровень {среднийУровень}</>}
                {безУровня.length > 0 && (
                  <>
                    {среднийУровень > 0 && ' · '}у{' '}
                    {безУровня.map((c) => c.name || 'Без имени').join(', ')} уровень не задан
                  </>
                )}
                {среднийУровень === 0 && безУровня.length === 0 && 'Уровни не заданы'}
              </div>
            </>
          )}
        </section>
      </div>

      <p className="dash-note">
        «Штаб» показывает текущее состояние. Снаряжение, ПА и контакты хранятся без истории,
        поэтому период в этом режиме меняет только давность явки.
      </p>
    </>
  )
}

/* ----------------------------------------------------------- «Ритм» */

function Ритм({
  db,
  сегодня,
  дней,
  сОт,
  прайм,
  явка,
  дниПрайма,
  начало,
}: {
  db: Db
  сегодня: string
  дней: ПериодДней
  сОт: string | null
  прайм: ПраймЗаПериод
  явка: Явка
  дниПрайма: string[]
  начало: string
}) {
  const всего = db.chars.length
  const всегоПропусков = явка.поПерсонажам.reduce((сумма, п) => сумма + п.пропусков, 0)
  const пропустившие = явка.поПерсонажам.filter((п) => п.пропусков > 0)
  const дниСПропусками = явка.датыНеполных.length
  const процентПолных = явка.праймов
    ? Math.round((явка.полных / явка.праймов) * 100)
    : 0
  const календарных = дней === 0 ? daysBetween(начало, сегодня).length : дней

  /*
   * Календарь начинается с первого прайма периода, а не с его формальной
   * даты. За 90 дней в базе может не быть ни одной записи за первые недели:
   * пустые строки занимали бы пол-экрана и выглядели как потерянные данные,
   * хотя это просто начало истории пати.
   */
  const перваяДата = дниПрайма[0] ?? сОт ?? начало
  const началоCalendar = началоНедели(перваяДата)
  const календарь = daysBetween(началоCalendar, конецНедели(сегодня))

  const вПериоде = (key: string) =>
    key <= сегодня && key >= (сОт ?? начало) && key >= перваяДата
  const ячейка = (key: string) => {
    const выходной = db.schedule.offs.includes(key)
    const окно = db.schedule.prime[key]
    const естьПрайм = Boolean(окно) && !выходной
    const ушли = естьПрайм ? db.chars.filter((c) => c.away?.[key]) : []
    const пришло = всего - ушли.length
    let класс = 'dash-cal-cell'
    if (!вПериоде(key)) класс += ' out'
    else if (выходной) класс += ' off'
    else if (естьПрайм) {
      класс +=
        ушли.length === 0
          ? ' full'
          : ушли.length === 1
            ? ' nine'
            : ушли.length === 2
              ? ' eight'
              : ' seven'
    } else класс += ' none'
    const подсказка = !вПериоде(key)
      ? formatDay(key, true)
      : выходной
        ? `${formatDay(key, true)} · выходной пати`
        : естьПрайм
          ? `${formatDay(key, true)} · ${пришло} из ${всего}${ушли.length ? ` · нет: ${ушли.map((c) => c.name || 'Без имени').join(', ')}` : ' · все были'}`
          : `${formatDay(key, true)} · прайм не назначен`
    return { key, класс, подсказка, выходной, естьПрайм, пришло, ушли }
  }

  const строки = [...db.chars].sort((a, b) => {
    const порядок = affiliationOrder(a.affil) - affiliationOrder(b.affil)
    if (порядок !== 0) return порядок
    return (a.name || '').localeCompare(b.name || '', 'ru')
  })

  const максимумПропусков = Math.max(1, ...пропустившие.map((п) => п.пропусков))
  const топ = пропустившие[0]
  const топДни = топ
    ? пропущенныеДни(
        db.chars.find((c) => c.id === топ.charId),
        дниПрайма,
      )
    : []
  const топДоля = топ && всегоПропусков ? Math.round((топ.пропусков / всегоПропусков) * 100) : 0

  const месяцы = прайм.поМесяцам
  const максимумЧасов = Math.max(1, ...месяцы.map((м) => м.часов))

  return (
    <>
      <div className="dash-kpis five">
        <Kpi
          label="Праймы"
          value={прайм.дней}
          sub={
            дней === 0
              ? `с ${formatDay(начало)}`
              : `из ${календарных} календарных дней`
          }
        />
        <Kpi
          label="Часы прайма"
          value={
            <>
              {дробь(прайм.часов)} <small>ч</small>
            </>
          }
          sub={прайм.дней ? `окно ${длительность(прайм.среднееОкно)}` : 'праймов нет'}
        />
        <Kpi
          label="Средняя явка"
          value={
            явка.праймов ? (
              <>
                {дробь(явка.средняя)} <small>из {всего}</small>
              </>
            ) : (
              '—'
            )
          }
          sub={
            всегоПропусков
              ? `${всегоПропусков} ${plural(всегоПропусков, 'пропуск', 'пропуска', 'пропусков')} на ${дниСПропусками} ${plural(дниСПропусками, 'дне', 'днях', 'днях')}`
              : 'пропусков нет'
          }
        />
        <Kpi
          label="Полные сборы"
          value={
            <>
              {явка.полных} <small>из {явка.праймов}</small>
            </>
          }
          sub={`${процентПолных}% праймов без пропусков`}
        />
        <Kpi
          label="Пропуски"
          value={<span className="dash-bad-text">{всегоПропусков}</span>}
          sub={`у ${пропустившие.length} ${plural(пропустившие.length, 'человека', 'человек', 'человек')} · ${дниСПропусками} ${plural(дниСПропусками, 'день', 'дня', 'дней')} из ${явка.праймов}`}
        />
      </div>

      <div className="dash-grid-rhythm">
        <section className="dash-card dash-cal-card">
          <div className="dash-card-head">
            <h3>Календарь явки</h3>
            <span className="dash-card-sub">{formatDayRange([перваяДата, сегодня])}</span>
            <div className="dash-legend">
              <span>
                <i className="dash-sw full" />
                {всего}/{всего}
              </span>
              <span>
                <i className="dash-sw nine" />
                {Math.max(0, всего - 1)}/{всего}
              </span>
              <span>
                <i className="dash-sw eight" />
                {Math.max(0, всего - 2)}/{всего}
              </span>
              <span>
                <i className="dash-sw seven" />
                {Math.max(0, всего - 3)}/{всего}
              </span>
              <span>
                <i className="dash-sw off" />
                выходной
              </span>
            </div>
          </div>
          <div className="dash-cal-grid">
            {ДНИ_НЕДЕЛИ.map((д) => (
              <div className="dash-cal-dow" key={д}>
                {д}
              </div>
            ))}
            {календарь.map((key) => {
              const я = ячейка(key)
              return (
                <div key={key} className={я.класс} title={я.подсказка}>
                  <span className="dash-cal-date">{parseKey(key).getDate()}</span>
                  {я.выходной && я.класс.indexOf('out') === -1 && (
                    <span className="dash-cal-mark">вых.</span>
                  )}
                  {я.естьПрайм && я.класс.indexOf('out') === -1 && (
                    <span className="dash-cal-mark">
                      {я.пришло}/{всего}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        <section className="dash-card dash-miss-card">
          <div className="dash-card-head">
            <h3>Кто пропускал</h3>
            <span className="dash-card-tail">за период</span>
          </div>
          {явка.праймов === 0 ? (
            <p className="hint">За этот период праймов не было — считать нечего.</p>
          ) : пропустившие.length === 0 ? (
            <div className="dash-all-clear">
              <span className="dash-pulse" />
              <span>
                <b>Пропусков нет.</b> Все {явка.праймов}{' '}
                {plural(явка.праймов, 'прайм', 'прайма', 'праймов')} собрались полностью.
              </span>
            </div>
          ) : (
            <>
              <div className="dash-miss-list">
                {пропустившие.slice(0, 8).map((п) => (
                  <div className="dash-miss-row" key={п.charId}>
                    <div className="dash-miss-name">
                      {п.имя}
                      <small>
                        {датыСловами(
                          пропущенныеДни(
                            db.chars.find((c) => c.id === п.charId),
                            дниПрайма,
                          ),
                        )}
                      </small>
                    </div>
                    <div className="dash-miss-bar">
                      <i style={{ width: `${(п.пропусков / максимумПропусков) * 100}%` }} />
                    </div>
                    <div className="dash-miss-num">{п.пропусков}</div>
                  </div>
                ))}
              </div>
              {пропустившие.length > 8 && (
                <p className="dash-mini">и ещё {пропустившие.length - 8}.</p>
              )}
              <div className="dash-miss-foot">
                {всего - пропустившие.length > 0 && (
                  <>
                    Остальные <b>{всего - пропустившие.length}</b>{' '}
                    {plural(
                      всего - пропустившие.length,
                      'человек',
                      'человека',
                      'человек',
                    )}{' '}
                    не пропустили ни одного прайма.{' '}
                  </>
                )}
                {топ && топДоля >= 50 && (
                  <>
                    Больше половины пропусков — <b>{топ.имя}</b> ({топ.пропусков} из{' '}
                    {всегоПропусков}).
                  </>
                )}
                {топ && топДоля < 50 && (
                  <>
                    Чаще всего пропускал <b>{топ.имя}</b> — {топ.пропусков}{' '}
                    {plural(топ.пропусков, 'раз', 'раза', 'раз')}.
                  </>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      <div className="dash-grid-rhythm dash-grid-matrix">
        <section className="dash-card dash-matrix-card">
          <div className="dash-card-head">
            <h3>Матрица явки по праймам</h3>
            <span className="dash-card-sub">
              {дниПрайма.length} {plural(дниПрайма.length, 'прайм', 'прайма', 'праймов')} · зелёный
              — был, красный — пропустил
            </span>
            <span className="dash-card-tail">наведите на клетку</span>
          </div>
          {дниПрайма.length === 0 ? (
            <p className="hint">Праймов за период нет.</p>
          ) : (
            <div className="dash-matrix-scroll">
              <div
                className="dash-matrix"
                style={{
                  gridTemplateColumns: `120px repeat(${дниПрайма.length}, minmax(12px, 1fr))`,
                  minWidth: `${120 + дниПрайма.length * 16}px`,
                }}
              >
                <div />
                {дниПрайма.map((д, i) => {
                  const дата = parseKey(д)
                  const прошлый = i > 0 ? parseKey(дниПрайма[i - 1]) : null
                  const месяц = дата.getDate() === 1
                  // Недельная метка не должна вставать вплотную к началу
                  // месяца: «1» и «2» рядом читались бы как опечатка.
                  const неделя =
                    i % 7 === 0 && !(прошлый && прошлый.getDate() === 1)
                  const подпись =
                    месяц || i === 0 || неделя || i === дниПрайма.length - 1
                      ? дата.getDate()
                      : ''
                  return (
                    <div
                      key={д}
                      className={`dash-mx-head${месяц || i === 0 ? ' month' : ''}`}
                      title={formatDay(д, true)}
                    >
                      {подпись}
                    </div>
                  )
                })}
                {строки.map((c) => (
                  <Fragment key={c.id}>
                    <div className="dash-mx-name" title={c.name || 'Без имени'}>
                      <b>{c.name || 'Без имени'}</b>
                    </div>
                    {дниПрайма.map((д) => {
                      const пропустил = Boolean(c.away?.[д])
                      return (
                        <div
                          key={д}
                          className={`dash-mx-cell${пропустил ? ' no' : ''}`}
                          title={`${formatDay(д, true)} · ${пропустил ? 'пропустил' : 'был'}`}
                        />
                      )
                    })}
                  </Fragment>
                ))}
              </div>
            </div>
          )}
          <div className="dash-mx-legend">
            <span>
              <i className="dash-sw full" />
              был
            </span>
            <span>
              <i className="dash-sw bad" />
              пропустил
            </span>
            <span className="dash-mx-tail">
              {месяцКоротко(дниПрайма[0] ?? сегодня)} → {месяцКоротко(сегодня)}
            </span>
          </div>
        </section>

        <div className="dash-rhythm-side">
          <section className="dash-card dash-hours-card">
            <h3>Часы прайма по месяцам</h3>
            {месяцы.length === 0 ? (
              <p className="hint">Праймов за период нет.</p>
            ) : (
              <div className="dash-hours">
                {месяцы.map((м) => (
                  <div className="dash-hour-col" key={м.месяц}>
                    <b>{дробь(м.часов)} ч</b>
                    <div
                      className="dash-hour-bar"
                      style={{
                        height: `${Math.max(2, (м.часов / максимумЧасов) * 100)}%`,
                      }}
                    />
                    <span>{месяцКоротко(м.месяц)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="dash-hours-foot">
              <span>
                <b>{прайм.выходных}</b>{' '}
                {plural(прайм.выходных, 'выходной', 'выходных', 'выходных')} за период
              </span>
              <span>
                <b>{длительность(прайм.среднееОкно)}</b> окно
              </span>
            </div>
          </section>

          <section className="dash-card dash-conclusion">
            <h3>Что говорит история</h3>
            {явка.праймов === 0 ? (
              <p>
                За этот период праймов не было. Как только они появятся, здесь сложится картина
                явки.
              </p>
            ) : (
              <>
                <p>
                  {процентПолных >= 70
                    ? 'Пати стабильна: '
                    : процентПолных >= 40
                      ? 'Пати собирается не всегда: '
                      : 'Сборы редкие: '}
                  <b>{процентПолных}% сборов</b> за период были полными ({явка.полных} из{' '}
                  {явка.праймов}).
                </p>
                {топ ? (
                  <p>
                    Больше всего пропусков у <b>{топ.имя}</b> — {топ.пропусков}{' '}
                    {plural(топ.пропусков, 'раз', 'раза', 'раз')}
                    {топДни.length > 0 && (
                      <>
                        {' '}
                        (<span className="dash-hl">{датыСловами(топДни)}</span>)
                      </>
                    )}
                    .
                  </p>
                ) : (
                  <p>Пропусков не было: весь период пати собиралась полным составом.</p>
                )}
              </>
            )}
          </section>
        </div>
      </div>

      <p className="dash-note">
        Явка считается по заявленным отсутствиям: не отметился — считается пришедшим. Выходные
        пати из счёта исключены, поэтому пропуски на них не начисляются.
      </p>
    </>
  )
}

/* ------------------------------------------------------------- детали */

function Kpi({
  label,
  value,
  sub,
}: {
  label: string
  value: ReactNode
  sub: ReactNode
}) {
  return (
    <div className="dash-kpi">
      <div className="dash-kpi-label">{label}</div>
      <div className="dash-kpi-value">{value}</div>
      <div className="dash-kpi-sub">{sub}</div>
    </div>
  )
}

function Повод({
  tag,
  tone,
  title,
  count,
  children,
}: {
  tag: string
  tone: 'bad' | 'warn'
  title: string
  count: number
  children: ReactNode
}) {
  return (
    <div className={`dash-att-row ${tone}`}>
      <span className="dash-att-ico">{tag}</span>
      <div className="dash-att-body">
        <div className="dash-att-title">
          {title} <span className={`dash-pill ${tone}`}>{count}</span>
        </div>
        <div className="dash-att-note">{children}</div>
      </div>
    </div>
  )
}

/**
 * Ось вечера: полоса прайма и отметка «сейчас».
 *
 * Шкала строится вокруг окна, а не берётся суточной: на сутках прайм в
 * два с половиной часа превратился бы в тонкую спичку. Полтора часа
 * запаса с каждой стороны показывают, далеко ли до старта.
 */
function ОсьПрайма({
  окно,
  день,
  сегодня,
  сейчас,
  часовойПояс,
}: {
  окно: { from: number; to: number }
  день: string
  сегодня: string
  сейчас: Date
  часовойПояс: string
}) {
  const местное = userWindow(день, окно, часовойПояс)
  const местноеНачало = местное.from.minutes
  const сдвигКонца = dayShiftBetween(местное.from.key, местное.to.key)
  const местныйКонец = местное.to.minutes + Math.max(0, сдвигКонца) * 1440
  const начало = Math.max(0, местноеНачало - 90)
  const конец = Math.max(начало + 180, местныйКонец + 90)
  const длина = Math.max(1, конец - начало)
  const левый = ((местноеНачало - начало) / длина) * 100
  const ширина = ((местныйКонец - местноеНачало) / длина) * 100
  const сейчасМестно = wallTimeAt(сейчас.getTime(), часовойПояс)
  const минутСейчас =
    сейчасМестно.minutes +
    dayShiftBetween(местное.from.key, сейчасМестно.key) * 1440
  const сейчасВШкале =
    день === сегодня && минутСейчас >= начало && минутСейчас <= конец
  const позицияСейчас = ((минутСейчас - начало) / длина) * 100
  /*
   * Подписи оси — по ровным получасам или часам, а не по процентам шкалы.
   * Проценты давали «20:53» и «22:15»: числа верные, но читаются как
   * случайные и заставляют считать, где же начало.
   */
  const шаг = длина <= 200 ? 30 : длина <= 480 ? 60 : 120
  const тики: { минута: number; позиция: number; подпись: string }[] = []
  for (
    let минута = Math.ceil(начало / шаг) * шаг;
    минута <= конец && тики.length < 9;
    минута += шаг
  ) {
    тики.push({
      минута,
      позиция: ((минута - начало) / длина) * 100,
      подпись: formatMinutes(((минута % 1440) + 1440) % 1440),
    })
  }

  return (
    <div className="dash-timeline" aria-hidden="true">
      <div className="dash-tl-track" />
      <div
        className="dash-tl-seg"
        style={{ left: `${левый}%`, width: `${ширина}%` }}
      />
      {сейчасВШкале && (
        <div className="dash-tl-now" style={{ left: `${позицияСейчас}%` }}>
          <em>сейчас</em>
        </div>
      )}
      <div className="dash-tl-ticks">
        {тики.map((т) => (
          <span
            key={т.минута}
            style={{ left: `${т.позиция}%` }}
            className={т.позиция < 3 ? 'first' : т.позиция > 97 ? 'last' : ''}
          >
            {т.подпись}
          </span>
        ))}
      </div>
    </div>
  )
}
