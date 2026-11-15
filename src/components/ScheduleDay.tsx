import { useState, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  ДНИ_НЕДЕЛИ,
  absentLabel,
  formatDay,
  formatMinutes,
  formatWeekday,
  type DayAbsent,
  type DayCell,
  type PrimeState,
} from '@/lib/schedule'
import { dayInfo, holidayName } from '@/lib/holidays'
import { eventTitle, type GameEvent } from '@/lib/l2events'
import {
  PARTY_TIME_ZONE,
  dayShiftBetween,
  formatZoneWindow,
  userWindow,
} from '@/lib/timezone'
import { EventBadge, EventTrack, сдвигСловами } from './ScheduleEvents'

/*
 * Сколько имён влезает в клетку дня.
 *
 * Клетки стали крупнее, но строка отсутствующих должна оставаться одной:
 * три имени столбиком уже наезжали на значки событий и время прайма. Два
 * имени читаются, остальные сворачиваются в «ещё N», а полный список с
 * временем ухода остаётся в подсказке клетки и в сводке справа.
 */
const ИМЁН_В_ЯЧЕЙКЕ = 2

/**
 * Подпись списка отсутствующих одной строкой.
 *
 * Обе подсказки клетки — сама клетка и список имён в её углу — показывают
 * один и тот же список, и собирали его дважды. На вид это не заметно, пока
 * правила совпадают: разъезжаются они правкой одной строки, а человек потом
 * водит мышью по календарю и видит в подсказке дни два разных времени ухода.
 */
function подписьСписка(список: DayAbsent[], dayKey: string, timeZone: string): string {
  return список.map((a) => absentLabel(a.имя, a.absence, dayKey, timeZone)).join(', ')
}

/** Один день в сетке. Вынесен отдельно ради читаемости разметки. */
export function DayBox({
  клетка,
  прайм,
  тема,
  отсутствуют,
  события,
  timeZone,
  взят,
  крупно,
  пойдут,
  состав,
  onStart,
  onEnter,
}: {
  клетка: DayCell
  прайм: PrimeState
  тема: string
  отсутствуют: DayAbsent[]
  события: GameEvent[]
  timeZone: string
  взят: boolean
  /** Крупная карточка недели или «Ближайшего»: с осью вечера и явкой. */
  крупно: boolean
  пойдут: number
  состав: number
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
  const имёнВидноВЯчейке = крупно
    ? отсутствуют.length > 3
      ? 2
      : 3
    : отсутствуют.length > 2
      ? 1
      : ИМЁН_В_ЯЧЕЙКЕ

  /*
   * Имена отсутствующих — полные, а не первая буква: в пати встречаются
   * два Ирока, и по «И» нельзя понять, кого именно не ждать. Строка одна:
   * лишние сворачиваются в «ещё N», а полный список в столбик — в
   * подсказке на цифре и с временем ухода — в сводке.
   *
   * В крупной клетке над списком стоит слово «Отсутствуют»: там рядом
   * появилась явка, и без подписи красная строка читалась бы как ещё один
   * счётчик состава. В месячной сетке места на подпись нет.
   */
  const блокОтсутствующих = отсутствуют.length > 0 && (
    <span
      className="cal-away"
      title={`Отсутствуют: ${подписьСписка(отсутствуют, клетка.key, timeZone)}`}
    >
      {крупно && <span className="cal-away-head">Отсутствуют</span>}
      <span className="cal-away-row">
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
    </span>
  )

  /* Доля пришедших на полосе явки: остаток красный — это отсутствующие. */
  const процентЯвки = состав ? Math.round((пойдут / состав) * 100) : 0
  const неПридут = Math.max(0, состав - пойдут)

  const классы = ['cal-day']
  if (клетка.чужой) классы.push('other')
  if (крупно) классы.push('big')
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
        {крупно ? (
          /*
           * В крупной клетке ось вечера заменяет список событий: на ней видно
           * и прайм, и когда именно начинается осада или босс. Событий на
           * день обычно одно-два, поэтому подписи не сливаются.
           */
          <EventTrack
            день={клетка.key}
            прайм={прайм}
            тема={тема}
            события={события}
            timeZone={timeZone}
            className="cal-tl"
            edgeThreshold={32}
            clampLabels
          />
        ) : (
          события.length > 0 && (
            <span className="cal-events">
              {события.map((event) => (
                <EventBadge key={event.id} event={event} timeZone={timeZone} dayKey={клетка.key} />
              ))}
            </span>
          )
        )}

        {крупно && (
          /*
           * Явка стоит вплотную над планом вечера, а отсутствующие — над ней:
           * вопрос «сколько нас» решается до чтения имён, но обе строки
           * должны быть рядом с итогом дня, а не висеть посреди клетки.
           */
          <span className="cal-foot">
            {блокОтсутствующих}

            <span
              className="cal-attend"
              title={`Придут ${пойдут} из ${состав} состава${неПридут ? ` · не смогут ${неПридут}` : ''}`}
            >
              <span className="cal-attend-head">
                <b>{пойдут}</b>
                <span>придут из {состав}</span>
              </span>
              <span className="cal-attend-bar">
                <span className="attend-ok" style={{ width: `${процентЯвки}%` }} />
                {неПридут > 0 && (
                  <span className="attend-absent" style={{ width: `${100 - процентЯвки}%` }} />
                )}
              </span>
            </span>
          </span>
        )}

        {!крупно && блокОтсутствующих}
      </span>

      {/*
        Нижняя полоса всегда одной высоты: строка времени и строка темы
        зарезервированы даже у выходного и у дня без прайма. Иначе разделитель
        прыгал вверх-вниз при прокрутке недели и глаз цеплялся за него.
      */}
      <span className={`cal-plan${прайм.kind === 'нет' ? ' none' : ''}`}>
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
            'Выходной'
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
