import type { Char, Schedule } from '@/types'
import {
  describeAbsence,
  formatDay,
  formatMinutes,
  formatWeekday,
  primeOf,
  primeThemeOf,
} from '@/lib/schedule'
import { eventsOn } from '@/lib/l2events'
import {
  PARTY_TIME_ZONE,
  dayShiftBetween,
  formatZoneWindow,
  userWindow,
} from '@/lib/timezone'
import { EventTrack, сдвигСловами } from './ScheduleEvents'

/**
 * Карточка дня: когда прайм, что происходит в игре, кто не придёт и сколько
 * состава остаётся.
 *
 * Считается по выбранному дню, а если ничего не выбрано — по сегодняшнему.
 * Список «пойдут» нужен, потому что отсутствия отмечены у немногих, а вопрос
 * «кого я жду вечером» — это про всех остальных.
 */
export function DaySummary({
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
  const неПридут = Math.max(0, состав.length - пойдут.length)
  const длительность = прайм.kind === 'окно' ? прайм.window.to - прайм.window.from : 0

  return (
    <div className="day-sum">
      <div className="sum-date">
        {formatWeekday(день)}, {formatDay(день, true)}
        {выбрано > 1 && <span className="sum-selected">первый из {выбрано}</span>}
      </div>

      {/*
        Выходной пати — такой же план вечера, как назначенный прайм, и
        выглядит он так же крупно и золотом. А вот «время не назначено» —
        это не план, а его отсутствие: тише и мельче, как раньше выходной.
      */}
      <div
        className={`sum-prime${прайм.kind === 'нет' ? ' none' : ''}`}
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
        и её приходилось бы искать глазами.
      */}
      <EventTrack
        день={день}
        прайм={прайм}
        тема={тема}
        события={события}
        timeZone={timeZone}
      />

      <div
        className="sum-attend"
        title={`Придут ${пойдут.length} из ${состав.length} состава${неПридут ? ` · не смогут ${неПридут}` : ''}`}
      >
        <span className="sum-attend-num">{пойдут.length}</span>
        <span className="sum-attend-cap">
          придут из <b>{состав.length}</b>
          <br />
          {уходят.length ? `${уходят.length} не смогут` : 'все на месте'}
        </span>
        <span
          className="sum-attend-bar"
          aria-label={`Придут ${пойдут.length} из ${состав.length} состава${
            неПридут ? `, не смогут ${неПридут}` : ''
          }`}
        >
          <span className="attend-ok" style={{ width: `${процент}%` }} />
          {неПридут > 0 && (
            <span className="attend-absent" style={{ width: `${100 - процент}%` }} />
          )}
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
