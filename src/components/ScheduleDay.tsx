import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from 'react'
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

/*
 * На сервере раскладка имён всё равно не считается, а useLayoutEffect в SSR
 * только ругается в консоль. В браузере остаётся именно он: строку надо
 * уложить до первой отрисовки, иначе имена моргнут и прыгнут.
 */
const useПередОтрисовкой = typeof window === 'undefined' ? useEffect : useLayoutEffect

/**
 * Помещаются ли элементы потока в заданное число строк.
 *
 * Повторяет раскладку flexbox: элементы идут подряд, gap стоит только между
 * соседями, а не у края строки. Ширины округлены вверх, поэтому запас всегда
 * в пользу клетки: лучше свернуть одно имя в «+N», чем вылезти за рамку.
 */
function помещаетсяВСтроки(
  ширины: number[],
  ширина: number,
  зазор: number,
  строк: number,
): boolean {
  let строка = 1
  let занято = 0

  for (const ш of ширины) {
    if (ш > ширина) return false
    const прибавка = занято > 0 ? зазор + ш : ш
    if (занято + прибавка <= ширина) {
      занято += прибавка
    } else {
      строка += 1
      if (строка > строк) return false
      занято = ш
    }
  }

  return true
}

type РаскладкаОтсутствующих = {
  /** Сколько имён показываем полными. */
  видно: number
  /** Первый ник шире клетки: его режем многоточием, а не прячем в «+N». */
  резать: boolean
}

/**
 * Сколько имён отсутствующих влезает в клетку.
 *
 * CSS не умеет «показать N имён и добавить +N»: браузеру не объяснить, что
 * последний элемент зависит от того, сколько места осталось. Поэтому имена
 * меряются скрытой копией потока с теми же классами, а число видимых
 * подбирается перебором — от всех имён вниз, пока строка не уложится.
 *
 * Скрытая копия нужна и для запятых: они стоят псевдоэлементом у имени и
 * входят в его ширину точно так же, как в настоящей строке.
 */
function useРаскладкаОтсутствующих(
  имена: DayAbsent[],
  строк: number,
): { поток: RefObject<HTMLSpanElement>; видно: number; резать: boolean } {
  const поток = useRef<HTMLSpanElement>(null)
  const [раскладка, setРаскладка] = useState<РаскладкаОтсутствующих>({
    видно: имена.length,
    резать: false,
  })

  useПередОтрисовкой(() => {
    const узел = поток.current
    const родитель = узел?.parentElement
    if (!узел || !родитель || имена.length === 0) return

    const зазор = parseFloat(getComputedStyle(узел).columnGap) || 0

    /*
     * Проба живёт в той же клетке и наследует её шрифт. Абсолютное
     * положение убирает её из потока, поэтому настоящая строка не меняет
     * ширину во время замера.
     */
    const проба = document.createElement('span')
    проба.className = 'cal-away-flow cal-away-probe'
    проба.setAttribute('aria-hidden', 'true')

    const значок = document.createElement('span')
    значок.className = 'cal-away-badge'
    значок.textContent = `−${имена.length}`

    const именаПробы = имена.map((a) => {
      const имя = document.createElement('span')
      имя.className = 'cal-away-name'
      имя.textContent = a.имя
      return имя
    })

    const ещё = document.createElement('span')
    ещё.className = 'cal-away-more'
    ещё.textContent = '+1'

    проба.append(значок, ...именаПробы, ещё)
    родитель.appendChild(проба)

    const ширина = (элемент: HTMLElement) => Math.ceil(элемент.getBoundingClientRect().width)
    const ширинаЗначка = ширина(значок)
    const шириныИмён = именаПробы.map(ширина)
    const шириныЕщё = new Map<number, number>()
    const ширинаЕщё = (сколько: number) => {
      const была = шириныЕщё.get(сколько)
      if (была !== undefined) return была
      ещё.textContent = `+${сколько}`
      const стала = ширина(ещё)
      шириныЕщё.set(сколько, стала)
      return стала
    }

    const уложить = (сколько: number, скрыто: number, ширинаКлетки: number) => {
      const ширины = [ширинаЗначка, ...шириныИмён.slice(0, сколько)]
      if (скрыто > 0) ширины.push(ширинаЕщё(скрыто))
      return помещаетсяВСтроки(ширины, ширинаКлетки, зазор, строк)
    }

    let последняяШирина = 0
    const подобрать = () => {
      const ширинаКлетки = узел.clientWidth
      if (!ширинаКлетки || ширинаКлетки === последняяШирина) return
      последняяШирина = ширинаКлетки

      let видно = 1
      let резать = true
      for (let сколько = имена.length; сколько >= 1; сколько--) {
        if (уложить(сколько, имена.length - сколько, ширинаКлетки)) {
          видно = сколько
          резать = false
          break
        }
      }

      setРаскладка((старая) =>
        старая.видно === видно && старая.резать === резать
          ? старая
          : { видно, резать },
      )
    }

    подобрать()

    const наблюдатель =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(подобрать)
    наблюдатель?.observe(узел)

    return () => {
      наблюдатель?.disconnect()
      проба.remove()
    }
  }, [имена, строк])

  return { поток, видно: раскладка.видно, резать: раскладка.резать }
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
   * Имена отсутствующих — полные, а не первая буква: в пати встречаются
   * два Ирока, и по «И» нельзя понять, кого именно не ждать. Строка идёт
   * потоком и занимает всю ширину клетки; сколько имён оставить, решает
   * замер, а не фиксированное число.
   *
   * В крупной клетке над потоком остаётся слово «Отсутствуют»: рядом стоит
   * явка, и без подписи красная строка читалась бы как ещё один счётчик
   * состава. В месячной сетке места на подпись нет.
   */
  const { поток, видно, резать } = useРаскладкаОтсутствующих(отсутствуют, крупно ? 2 : 1)
  const видимые = отсутствуют.slice(0, Math.min(видно, отсутствуют.length))
  const скрытые = отсутствуют.slice(видимые.length)

  const блокОтсутствующих = отсутствуют.length > 0 && (
    <span
      className="cal-away"
      title={`Отсутствуют: ${подписьСписка(отсутствуют, клетка.key, timeZone)}`}
    >
      {крупно && <span className="cal-away-head">Отсутствуют</span>}
      <span
        className={`cal-away-flow ${крупно ? 'two' : 'one'}${резать ? ' cut' : ''}`}
        ref={поток}
      >
        <span
          className="cal-away-badge"
          onMouseEnter={показатьСписок}
          onMouseLeave={() => setПодсказка(null)}
        >
          −{отсутствуют.length}
        </span>

        {видимые.map((a, i) => (
          <span
            key={a.charId}
            className={`cal-away-name${i === 0 && резать ? ' cut' : ''}`}
            title={a.имя}
          >
            {a.имя}
          </span>
        ))}

        {скрытые.length > 0 && (
          <span
            className="cal-away-more"
            title={`Ещё: ${скрытые.map((a) => a.имя || 'Без имени').join(', ')}`}
          >
            +{скрытые.length}
          </span>
        )}
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
