import { useEffect, useLayoutEffect, useRef } from 'react'
import { dayInfo } from '@/lib/holidays'
import { formatClock, formatZoneWindow, userWindow, type WallTime } from '@/lib/timezone'
import {
  eventTimeLabel,
  eventTitle,
  eventWindow,
  type EventWindow,
  type GameEvent,
} from '@/lib/l2events'
import { parseKey, type PrimeState } from '@/lib/schedule'
import { dayTimeline, minutesOnDay, timelineOffset } from '@/lib/timeline'

/*
 * События и ось вечера.
 *
 * Ось одна на сводку и на крупные клетки недели: правила расчёта окна,
 * перехода через полночь и подписей часов не должны разъезжаться между
 * двумя видами. Сюда же вынесена подпись сдвига дня: её показывают и клетка,
 * и сводка, а собранная дважды она разошлась бы при первой правке.
 */

/** «+1 дн.» рядом со временем, которое у пользователя попало на соседнюю дату. */
export function сдвигСловами(сдвиг: number): string {
  if (!сдвиг) return ''
  return сдвиг > 0 ? `+${сдвиг} дн.` : `${сдвиг} дн.`
}

/*
 * На сервере раскладка подписей всё равно не выполняется, а useLayoutEffect
 * в SSR только ругается в консоль. В браузере остаётся именно он: подписи
 * надо разложить до первой отрисовки, иначе они моргнут на глазах.
 */
const useПередОтрисовкой = typeof window === 'undefined' ? useEffect : useLayoutEffect

/*
 * Подпись события в месячной сетке.
 *
 * Цветная точка, название и время стоят в одну строку — так же, как событие
 * выглядит на оси в неделе и «Ближайшем». Две строки в низкой клетке месяца
 * отнимали высоту у отсутствующих и прайма, а звезда ещё и читалась как
 * отдельная категория.
 */
export function EventBadge({
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
      <span className="event-dot" aria-hidden="true" />
      <span className="event-badge-name">{event.name}</span>
      <span className="event-badge-time">{eventTimeLabel(event, dayKey, timeZone)}</span>
    </span>
  )
}

/**
 * Ось вечера: прайм полупрозрачной полосой, события — точками своего цвета.
 *
 * Одна на сводку и на крупные клетки недели: правила расчёта окна, перехода
 * через полночь и подписей часов не должны разъезжаться между двумя видами.
 */
export function EventTrack({
  день,
  прайм,
  тема,
  события,
  timeZone,
  className = '',
  showLabels = true,
  edgeThreshold = 18,
  clampLabels = false,
}: {
  день: string
  прайм: PrimeState
  тема: string
  события: GameEvent[]
  timeZone: string
  className?: string
  showLabels?: boolean
  /**
   * Насколько близко к краю подпись прижимается внутрь. В узкой клетке
   * порог шире: половина подписи не помещается в восемнадцать процентов.
   */
  edgeThreshold?: number
  /**
   * Удерживать подписи внутри полосы по их настоящей ширине.
   *
   * В крупной клетке подпись стоит по центру отметки, но у края окна она
   * вылезала бы за клетку. Порог по процентам не спасает: у осады подпись
   * шире, чем расстояние от отметки до края. Поэтому после раскладки меряем
   * её и сдвигаем внутрь ровно настолько, насколько нужно.
   */
  clampLabels?: boolean
}) {
  const местный = прайм.kind === 'окно' ? userWindow(день, прайм.window, timeZone) : null
  const окна = события.map((event) => eventWindow(event, день, timeZone))
  const ось = dayTimeline(
    день,
    местный,
    окна.filter((окно): окно is EventWindow => окно !== null),
  )
  const позиция = (wall: WallTime) => timelineOffset(ось, minutesOnDay(день, wall))
  const подписьЧаса = (минуты: number) =>
    formatClock(((минуты % 1440) + 1440) % 1440).slice(0, 2)

  /*
   * Тип дня задаёт тон полосы вечера. Выходной пати важнее календаря: у него
   * штриховка в теле клетки, и полоса должна читаться поверх неё.
   */
  const инфо = dayInfo(parseKey(день))
  const типДня =
    прайм.kind === 'выходной'
      ? 'off'
      : инфо.выходной || инфо.праздник
        ? 'weekend'
        : инфо.рабочий || инфо.сокращённый
          ? 'workday'
          : 'plain'

  const подписи = useRef<HTMLDivElement>(null)

  /*
   * Подписи у краёв сдвигаются внутрь по своей настоящей ширине. Проценты
   * здесь не годятся: «Осады замков 19:00–21:00» шире, чем половина клетки,
   * и любая привязка к отметке выносила бы её за рамку.
   */
  useПередОтрисовкой(() => {
    const полоса = подписи.current
    if (!clampLabels || !showLabels || !полоса) return

    const уложить = () => {
      const ширина = полоса.clientWidth
      if (!ширина) return
      полоса.querySelectorAll<HTMLElement>('.sum-tl-label').forEach((подпись) => {
        const доля = Number(подпись.dataset.left)
        if (!Number.isFinite(доля)) return
        const половина = подпись.offsetWidth / 2
        /* Два пикселя запаса, чтобы подпись не липла к рамке клетки. */
        const запас = Math.min(2, Math.max(0, ширина / 2 - половина))
        const центр = Math.min(
          Math.max((доля / 100) * ширина, половина + запас),
          ширина - половина - запас,
        )
        подпись.style.left = `${центр}px`
      })
    }

    уложить()
    if (typeof ResizeObserver === 'undefined') return
    const наблюдатель = new ResizeObserver(уложить)
    наблюдатель.observe(полоса)
    return () => наблюдатель.disconnect()
  }, [clampLabels, showLabels, день, события, timeZone])

  return (
    <div
      className={`sum-tl day-${типДня}${className ? ` ${className}` : ''}`}
      role="img"
      aria-label={`Вечер с ${подписьЧаса(ось.from)} до ${подписьЧаса(ось.to)}: ${
        события.length > 0
          ? события.map((e) => `${e.name} ${eventTimeLabel(e, день, timeZone)}`).join(', ')
          : 'событий нет'
      }`}
    >
      {showLabels && (
        <div className="sum-tl-labels" ref={подписи}>
          {события.map((event, i) => {
            const окно = окна[i]
            if (!окно) return null
            const left = позиция(окно.from)
            const край = clampLabels
              ? ''
              : left < edgeThreshold
                ? ' start'
                : left > 100 - edgeThreshold
                  ? ' end'
                  : ''
            return (
              <span
                key={event.id}
                className={`sum-tl-label kind-${event.kind}${край}`}
                style={{ left: `${left}%` }}
                data-left={left}
                title={eventTitle(event, timeZone, день)}
              >
                {event.name} <span>{eventTimeLabel(event, день, timeZone)}</span>
              </span>
            )
          })}
        </div>
      )}

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
  )
}
