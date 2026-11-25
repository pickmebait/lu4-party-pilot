import { Fragment, useMemo, useState } from 'react'
import {
  основнаяГотовность,
  следующийПрайм,
  type ОсновнаяСводка,
  type ПремиумСводка,
  type Явка,
} from '@/lib/analytics'
import { isMarked, toggleChecklist, useChecklistMarks } from '@/lib/checklistSession'
import { eventsOn, eventTitle, eventWindow } from '@/lib/l2events'
import { РОЛИ, РОЛЬ_ПОДПИСЬ, roleOfClass, rolesOfSubs } from '@/lib/roles'
import {
  ДНИ_НЕДЕЛИ,
  daysAround,
  formatDay,
  formatMinutes,
  formatWeekday,
  parseKey,
  primeOf,
} from '@/lib/schedule'
import { dayShiftBetween, formatZoneWindow, userWindow } from '@/lib/timezone'
import { AFFILIATIONS, type Char, type Db } from '@/types'
import { formatAgo, plural } from '@/lib/util'
import {
  датыСловами,
  деньСловами,
  доСобытия,
  дробь,
  длительность,
  естьСвязь,
  сдвигДня,
  срокСловами,
} from './format'
import type { СобытиеОси } from './model'
import { Kpi, ОсьПрайма, Повод } from './bits'

/* ------------------------------------------------------------- «Штаб» */

/**
 * Показывать в «Кто в пати» сабы, а не основы.
 *
 * Сабы собраны в одну вкладку: у персонажа их до трёх, и раскладывать пати
 * по отдельным веткам значило бы прятать остальные его профессии. Здесь
 * сразу видно, какие роли пати может закрыть любым из своих сабов.
 *
 * Как и режим сводки, выбор живёт в модуле: иначе он сбрасывался бы при
 * каждом возврате на вкладку.
 */
let выбранныеСабы = false

export function Штаб({
  db,
  сегодня,
  сейчас,
  часовойПояс,
  основные,
  явка30,
  готовность,
  премиум,
  onOpenSchedule,
  начальныеСабы,
}: {
  db: Db
  сегодня: string
  сейчас: Date
  /** Пояс пользователя: в нём же показываются окно и ось прайма. */
  часовойПояс: string
  /** Персонажи без «Окна»: запасные не входят в показатели состава. */
  основные: Char[]
  явка30: Явка
  готовность: ОсновнаяСводка
  премиум: ПремиумСводка
  onOpenSchedule?: () => void
  /** Начальная вкладка классов; в приложении не задаётся, нужна проверкам. */
  начальныеСабы?: boolean
}) {
  useChecklistMarks()

  const [сабы, setСабы] = useState(начальныеСабы ?? выбранныеСабы)
  const выбратьСабы = (новые: boolean) => {
    выбранныеСабы = новые
    setСабы(новые)
  }

  const всего = db.chars.length
  const всегоОсновных = основные.length
  const составПоМестам = AFFILIATIONS.map((a) => ({
    ...a,
    сколько: db.chars.filter((c) => c.affil === a.key).length,
  }))
  /*
   * «Окно» — запасные: в составе, явке и экипировке они не считаются, но
   * в списке «Кто в пати» остаются, чтобы было видно, кто ещё есть.
   */
  const основнойПоМестам = составПоМестам.filter((м) => м.key !== 'window')
  const готовностьОсновная = useMemo(
    () => основнаяГотовность(db, основные),
    [db, основные],
  )
  const безСвязи = db.chars.filter((c) => !естьСвязь(c))
  const пустые = db.chars.filter((c) => {
    const г = готовность.поПерсонажам.find((п) => п.charId === c.id)
    return !c.cls.trim() || !г || г.занято === 0
  })

  const следующий = следующийПрайм(db.schedule, сейчас.getTime())
  const местноеОкно = следующий
    ? userWindow(следующий.день, следующий.окно, часовойПояс)
    : null
  const сдвиг = местноеОкно ? dayShiftBetween(следующий!.день, местноеОкно.from.key) : 0
  const доСтарта = следующий?.доНачала ?? 0
  const доКонца = следующий?.доКонца ?? 0

  /*
   * События ищутся по местным датам прайма, а не по дню пати: у восточных
   * поясов вечер переходит на соседнюю дату, и ивент должен стоять рядом с
   * праймом на той же шкале. Если окно пересекает полночь, нужны обе даты.
   */
  const событияОси: СобытиеОси[] = []
  if (местноеОкно) {
    for (const день of new Set([местноеОкно.from.key, местноеОкно.to.key])) {
      for (const event of eventsOn(день, часовойПояс)) {
        const окно = eventWindow(event, день, часовойПояс)
        if (!окно) continue
        событияОси.push({
          id: `${event.id}:${окно.from.key}`,
          kind: event.kind,
          минута:
            окно.from.minutes +
            dayShiftBetween(местноеОкно.from.key, окно.from.key) * 1440,
          name: event.name,
          время: formatMinutes(окно.from.minutes),
          title: eventTitle(event, часовойПояс, день),
        })
      }
    }
  }

  // 14 дней — две недели вперёд, включая сегодняшний вечер.
  const дни14 = daysAround(сегодня, 0, 13)
  const праймы14 = дни14.filter((д) => primeOf(db.schedule, д).kind === 'окно')
  const выходные14 = дни14.filter((д) => primeOf(db.schedule, д).kind === 'выходной')
  const окна14 = праймы14.map((д) => {
    const состояние = primeOf(db.schedule, д)
    return состояние.kind === 'окно' ? состояние.window : null
  })
  const часов14 = Math.round(
    окна14.reduce((всего, о) => всего + (о ? о.to - о.from : 0), 0) / 6,
  ) / 10
  /*
   * Одинаковость окон проверяется уже на месте, а не по Москве: на переходе
   * на летнее время одни и те же 21:00–23:30 по Москве приходятся на разные
   * местные часы, и сводка не должна называть их одним временем.
   */
  const местные14 = праймы14.map((д, i) => {
    const окно = окна14[i]
    return окно ? userWindow(д, окно, часовойПояс) : null
  })
  const первоеОкно = местные14.find((о) => о !== null) ?? null
  const одинаковыеОкна =
    первоеОкно !== null &&
    местные14.every(
      (о) =>
        о &&
        о.from.minutes === первоеОкно.from.minutes &&
        о.to.minutes === первоеОкно.to.minutes &&
        dayShiftBetween(о.from.key, о.to.key) ===
          dayShiftBetween(первоеОкно.from.key, первоеОкно.to.key),
    )
  const местноеОкно14 = первоеОкно

  const отсутствия14 = db.chars
    .map((c) => ({
      персонаж: c,
      дни: праймы14.filter((д) => c.away?.[д]),
    }))
    .filter((п) => п.дни.length > 0)

  const отметки = db.schedule.checklist
  const готово = отметки.filter((п) => isMarked(п.id)).length
  const прогресс = отметки.length ? Math.round((готово / отметки.length) * 100) : 0

  /*
   * Основы — роль основного класса. Сабы — сразу все профессии персонажа:
   * вкладка одна, а ролей у человека может быть несколько, и прятать две
   * из трёх значило бы показывать не весь запас пати. Пустой саб не
   * превращается в «Без роли»: это незаполненная строка, а не класс.
   */
  const естьСабы = db.chars.some((c) => c.subs.some((s) => s.cls.trim()))
  const показыватьСабы = сабы && естьСабы
  /*
   * На вкладке сабов в счёт идут только персонажи с заполненным сабом:
   * остальные не участвуют в ролях, уровнях и распределении по местам.
   * Вкладка «основ» по-прежнему показывает всю пати.
   */
  const участники = показыватьСабы
    ? db.chars.filter((c) => c.subs.some((s) => s.cls.trim()))
    : db.chars
  const участникиПоМестам = AFFILIATIONS.map((a) => ({
    ...a,
    сколько: участники.filter((c) => c.affil === a.key).length,
  }))
  const роли = РОЛИ.map((роль) => ({
    роль,
    люди: участники.filter((c) =>
      показыватьСабы ? rolesOfSubs(c).includes(роль) : roleOfClass(c.cls) === роль,
    ),
  }))

  /*
   * Уровни на вкладке сабов считаются по самим сабам: у каждой профессии
   * свой уровень, поэтому один человек может стоять сразу в нескольких
   * строках. Уровень основы на этой вкладке не подмешивается. Цвет полоски
   * по-прежнему означает место персонажа в пати.
   */
  type СтрокаУровня = { персонаж: Char; уровень: number; класс?: string }
  const строкиУровней: СтрокаУровня[] = показыватьСабы
    ? участники.flatMap((c) =>
        c.subs
          .filter((s) => s.cls.trim())
          .map((s) => ({ персонаж: c, уровень: s.level, класс: s.cls })),
      )
    : участники.map((c) => ({ персонаж: c, уровень: c.level }))
  const поУровням = new Map<number, СтрокаУровня[]>()
  for (const с of строкиУровней) {
    const люди = поУровням.get(с.уровень) ?? []
    люди.push(с)
    поУровням.set(с.уровень, люди)
  }
  const уровни = [...поУровням.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([уровень, люди]) => ({
      уровень,
      сколько: люди.length,
      кто: люди
        .map((с) =>
          с.класс
            ? `${с.персонаж.name || 'Без имени'} (${с.класс})`
            : с.персонаж.name || 'Без имени',
        )
        .join(', '),
      места: AFFILIATIONS.map((a) => ({
        key: a.key,
        label: a.label,
        сколько: люди.filter((с) => с.персонаж.affil === a.key).length,
      })).filter((м) => м.сколько > 0),
    }))
  const максимумУровня = Math.max(1, ...уровни.map((у) => у.сколько))
  const сУровнем = строкиУровней.filter((с) => с.уровень > 0)
  const среднийУровень = сУровнем.length
    ? Math.round(сУровнем.reduce((всего, с) => всего + с.уровень, 0) / сУровнем.length)
    : 0
  const безУровняСтрок = строкиУровней.filter((с) => с.уровень <= 0)
  const безУровняЗаписи = [
    ...безУровняСтрок
      .reduce((карта, с) => {
        const имя = с.персонаж.name || 'Без имени'
        const классы = карта.get(имя) ?? []
        if (с.класс) классы.push(с.класс)
        карта.set(имя, классы)
        return карта
      }, new Map<string, string[]>())
      .entries(),
  ].map(([имя, классы]) => (классы.length ? `${имя} (${классы.join(', ')})` : имя))
  /*
   * Повод «Не указан уровень» остаётся про основы: вкладка сабов меняет
   * только блок уровней, а не общий список замечаний по пати.
   */
  const безУровня = участники.filter((c) => c.level <= 0)

  const истекли = премиум.поПерсонажам.filter(
    (п): п is typeof п & { осталось: number } => п.осталось !== null && п.осталось <= 0,
  )
  const истекают = премиум.поПерсонажам.filter(
    (п): п is typeof п & { осталось: number } =>
      п.осталось !== null && п.осталось > 0 && п.осталось <= 7,
  )

  const свободны = следующий
    ? основные.filter((c) => !c.away?.[следующий.день])
    : []
  const отсутствуют = следующий
    ? основные.filter((c) => c.away?.[следующий.день]).map((c) => c.name || 'Без имени')
    : []

  /*
   * Роль не закрыта — про основной состав, а не про сабы: искать в первую
   * очередь нужно человека на место, которое в основе пустует.
   */
  const нужныеРоли = ['танк', 'хил', 'бард', 'баф'] as const
  const ролиОсновных = new Set(основные.map((c) => roleOfClass(c.cls)))
  const нетРолей = нужныеРоли.filter((роль) => !ролиОсновных.has(роль))
  const рольНеЗакрыта = основные.length > 0 && нетРолей.length > 0

  const безПА = премиум.поПерсонажам.filter((п) => п.осталось === null)

  /*
   * Прайм на ближайшую неделю: окна должны быть, и все — одного времени.
   * Сравниваем уже местные окна: при переходе на летнее время московские
   * 21:00 могут стать разными часами, и это действительно рваный прайм.
   */
  const дни7 = daysAround(сегодня, 0, 6)
  const праймы7 = дни7.filter((д) => primeOf(db.schedule, д).kind === 'окно')
  const местныеОкна7: { label: string; key: string }[] = []
  for (const день of праймы7) {
    const состояние = primeOf(db.schedule, день)
    if (состояние.kind !== 'окно') continue
    const местное = userWindow(день, состояние.window, часовойПояс)
    const сдвиг = dayShiftBetween(местное.from.key, местное.to.key)
    местныеОкна7.push({
      label: `${formatZoneWindow(местное)}${сдвиг ? ` (${сдвигДня(сдвиг)})` : ''}`,
      key: `${местное.from.minutes}:${местное.to.minutes}:${сдвиг}`,
    })
  }
  const разныеОкна7 = new Set(местныеОкна7.map((о) => о.key)).size > 1
  const праймНеЗадан = праймы7.length === 0 || разныеОкна7
  const окна7Словами = [...new Map(местныеОкна7.map((о) => [о.key, о.label])).values()]

  const обновлено = Date.parse(db.updatedAt)
  const днейБезОбновления = Number.isFinite(обновлено)
    ? Math.floor((сейчас.getTime() - обновлено) / 86_400_000)
    : null
  const данныеСтары = днейБезОбновления !== null && днейБезОбновления > 7

  const поводов =
    (рольНеЗакрыта ? 1 : 0) +
    (праймНеЗадан ? 1 : 0) +
    (истекли.length > 0 ? 1 : 0) +
    (истекают.length > 0 ? 1 : 0) +
    (безПА.length > 0 ? 1 : 0) +
    (безУровня.length > 0 ? 1 : 0) +
    (безСвязи.length > 0 ? 1 : 0) +
    (пустые.length > 0 ? 1 : 0) +
    (отсутствия14.length > 0 ? 1 : 0) +
    (данныеСтары ? 1 : 0)

  return (
    <>
      <div className="dash-kpis">
        <Kpi
          label="Состав"
          value={
            <>
              {всегоОсновных} <small>чел.</small>
            </>
          }
          sub={основнойПоМестам.map((м) => `${м.сколько} ${м.label.toLowerCase()}`).join(' · ')}
        />
        <Kpi
          label="Явка за 30 дней"
          value={
            явка30.праймов > 0 ? (
              <>
                {дробь(явка30.средняя)} <small>из {всегоОсновных}</small>
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
          value={`${готовностьОсновная.собраны}/${готовностьОсновная.всего}`}
          progress={
            готовностьОсновная.всего > 0
              ? готовностьОсновная.собраны / готовностьОсновная.всего
              : 0
          }
          sub={
            <>
              средняя заточка{' '}
              <span className="dash-accent">+{дробь(готовностьОсновная.средняя)}</span> ·{' '}
              {готовностьОсновная.слотов} основных слотов
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
                окно={местноеОкно}
                сейчас={сейчас}
                часовойПояс={часовойПояс}
                события={событияОси}
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
                    <b>Все {свободны.length} придут</b>
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
                <b>Всё в порядке.</b> Роли закрыты, прайм назначен, ПА продлён, контакты
                заполнены, снаряжение собрано.
              </span>
            </div>
          ) : (
            <div className="dash-att-list">
              {рольНеЗакрыта && (
                <Повод tag="Р" tone="bad" title="Роль не закрыта" count={нетРолей.length}>
                  в основном составе нет:{' '}
                  {нетРолей.map((роль) => РОЛЬ_ПОДПИСЬ[роль].toLowerCase()).join(', ')}.
                </Повод>
              )}
              {праймНеЗадан && (
                <Повод
                  tag="ПР"
                  tone={праймы7.length === 0 ? 'bad' : 'warn'}
                  title="Прайм не задан"
                  count={праймы7.length === 0 ? 7 : окна7Словами.length}
                >
                  {праймы7.length === 0
                    ? 'на ближайшие 7 дней окна не назначены — составу не на что ориентироваться.'
                    : `окна разного времени: ${окна7Словами.join(', ')}.`}
                </Повод>
              )}
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
              {безПА.length > 0 && (
                <Повод tag="ПА" tone="warn" title="ПА не указан" count={безПА.length}>
                  {безПА.map((п) => п.имя).join(', ')} — не заполнена дата премиума, поэтому
                  проверка срока таких людей пропускает.
                </Повод>
              )}
              {безУровня.length > 0 && (
                <Повод tag="УР" tone="warn" title="Не указан уровень" count={безУровня.length}>
                  {безУровня.map((c) => c.name || 'Без имени').join(', ')} — уровень не
                  заполнен, и средний уровень считается без них.
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
              {данныеСтары && (
                <Повод tag="БД" tone="warn" title="Данные давно не обновлялись" count={1}>
                  последнее изменение — {formatAgo(db.updatedAt)}. Если правки были, возможно,
                  синхронизация молча отвалилась.
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
              {участники.length} {plural(участники.length, 'персонаж', 'персонажа', 'персонажей')}
            </span>
          </div>

          {/* Две вкладки вместо веток: «Основы» — основные классы, «Сабы» —
              сразу все саб-классы пати. У человека их до трёх, и роли на
              одной вкладке складываются из всего набора. */}
          {естьСабы && (
            <div className="segmented sub-tabs dash-role-tabs" role="group" aria-label="Классы">
              <button
                type="button"
                className={показыватьСабы ? '' : 'on'}
                title="Основные профессии"
                onClick={() => выбратьСабы(false)}
              >
                Основы
              </button>
              <button
                type="button"
                className={показыватьСабы ? 'on' : ''}
                title="Роли по всем сабам пати"
                onClick={() => выбратьСабы(true)}
              >
                Сабы
              </button>
            </div>
          )}

          <div className="dash-affil-bar">
            {участникиПоМестам.map((м) => (
              <i
                key={м.key}
                className={`dash-affil-${м.key}`}
                style={{ width: `${(м.сколько / участники.length) * 100}%` }}
              />
            ))}
          </div>
          <div className="dash-affil-legend">
            {участникиПоМестам.map((м) => (
              <span key={м.key}>
                <i className={`dash-affil-${м.key}`} />
                {м.label} {м.сколько}
              </span>
            ))}
          </div>

          <div className="dash-role-grid">
            {роли.map(({ роль, люди }) => {
              const пустойПрофиль =
                !показыватьСабы &&
                роль === 'без роли' &&
                люди.length === 1 &&
                !люди[0].cls.trim() &&
                (готовность.поПерсонажам.find((п) => п.charId === люди[0].id)?.занято ?? 0) === 0
              /*
               * На вкладке сабов один и тот же ник может стоять в разных
               * ролях. Подсказка у имени называет именно те сабы, из-за
               * которых человек попал в эту ячейку.
               */
              const подписьСаба = (c: Char) => {
                if (!показыватьСабы) return undefined
                const классы = c.subs
                  .filter((s) => s.cls.trim() && roleOfClass(s.cls) === роль)
                  .map((s) => s.cls)
                return классы.length ? `${c.name || 'Без имени'}: ${классы.join(', ')}` : undefined
              }
              return (
                <div key={роль} className={`dash-role${роль === 'без роли' ? ' norole' : ''}`}>
                  <b>{люди.length}</b>
                  <span>{РОЛЬ_ПОДПИСЬ[роль]}</span>
                  <small title={люди.map((c) => c.name || 'Без имени').join(', ')}>
                    {люди.map((c, i) => (
                      <Fragment key={c.id}>
                        {i > 0 && ', '}
                        <span className={`dash-name-${c.affil}`} title={подписьСаба(c)}>
                          {c.name || 'Без имени'}
                        </span>
                      </Fragment>
                    ))}
                    {пустойПрофиль ? ' — пустой профиль' : ''}
                  </small>
                </div>
              )
            })}
          </div>

          {уровни.length > 0 && (
            <>
              <div className="dash-levels">
                {уровни.map((у) => (
                  <div className="dash-level-line" key={у.уровень}>
                    <span>{у.уровень > 0 ? у.уровень : '—'}</span>
                    <span className="dash-lv-bar">
                      {у.места.map((м) => (
                        <i
                          key={м.key}
                          className={`dash-affil-${м.key}`}
                          style={{ width: `${(м.сколько / максимумУровня) * 100}%` }}
                          title={`${м.label}: ${м.сколько}`}
                        />
                      ))}
                    </span>
                    <b title={у.кто}>{у.сколько}</b>
                  </div>
                ))}
              </div>
              <div className="dash-roles-foot">
                {среднийУровень > 0 && (
                  <>
                    Средний уровень{показыватьСабы ? ' сабов' : ''} {среднийУровень}
                  </>
                )}
                {безУровняЗаписи.length > 0 && (
                  <>
                    {среднийУровень > 0 && ' · '}у{' '}
                    {безУровняЗаписи.join(', ')} уровень не задан
                  </>
                )}
                {среднийУровень === 0 && безУровняЗаписи.length === 0 && 'Уровни не заданы'}
              </div>
            </>
          )}
        </section>
      </div>
    </>
  )
}
