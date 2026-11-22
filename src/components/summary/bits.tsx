import type { CSSProperties, ReactNode } from 'react'
import { formatMinutes } from '@/lib/schedule'
import { dayShiftBetween, wallTimeAt, type WallTime } from '@/lib/timezone'
import type { СобытиеОси } from './model'

/* ------------------------------------------------------------- детали */

export function Kpi({
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

export function Повод({
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
export function ОсьПрайма({
  окно,
  сейчас,
  часовойПояс,
  события,
}: {
  /** Окно уже пересчитано в пояс пользователя. */
  окно: { from: WallTime; to: WallTime }
  сейчас: Date
  часовойПояс: string
  /** События вечера: точки на шкале, как в расписании. */
  события: СобытиеОси[]
}) {
  const местноеНачало = окно.from.minutes
  const сдвигКонца = dayShiftBetween(окно.from.key, окно.to.key)
  const местныйКонец = окно.to.minutes + Math.max(0, сдвигКонца) * 1440
  /*
   * События берём только рядом с праймом: у окна, перешедшего через
   * полночь, в набор попадают и события следующих суток, а растягивать
   * шкалу на весь следующий вечер незачем.
   */
  const близкие = события.filter(
    (с) => с.минута >= местноеНачало - 240 && с.минута <= местныйКонец + 240,
  )
  const начало = Math.max(
    0,
    Math.min(местноеНачало - 90, ...близкие.map((с) => с.минута - 30)),
  )
  const конец = Math.max(
    начало + 180,
    местныйКонец + 90,
    ...близкие.map((с) => с.минута + 30),
  )
  const длина = Math.max(1, конец - начало)
  const левый = ((местноеНачало - начало) / длина) * 100
  const ширина = ((местныйКонец - местноеНачало) / длина) * 100
  const сейчасМестно = wallTimeAt(сейчас.getTime(), часовойПояс)
  const минутСейчас =
    сейчасМестно.minutes +
    dayShiftBetween(окно.from.key, сейчасМестно.key) * 1440
  /*
   * Сравниваем местные минуты с местной шкалой, а не день окна с местным
   * «сегодня». У восточных поясов прайм после полуночи попадает на соседнюю
   * дату, и старая проверка прятала отметку ровно в тот момент, когда она
   * нужнее всего.
   */
  const сейчасВШкале = минутСейчас >= начало && минутСейчас <= конец
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

  const позицияСобытия = (минута: number) => ((минута - начало) / длина) * 100

  /*
   * Подписи событий раскладываются по рядам, как в расписании, но ещё и с
   * проверкой на наложение: у Core и Orfen время совпадает, и две подписи в
   * одну строку превратились бы в кашу. Ширину оцениваем по числу знаков —
   * настоящую здесь не измерить до отрисовки, а запас в пару процентов
   * надёжнее, чем тесно прижатые слова.
   */
  const подписи: {
    событие: СобытиеОси
    позиция: number
    край: '' | 'start' | 'end'
    ряд: number
  }[] = []
  const занятые: { from: number; to: number }[][] = []
  for (const событие of [...близкие].sort((a, b) => a.минута - b.минута)) {
    const позиция = позицияСобытия(событие.минута)
    const ширинаПодписи = Math.min(
      42,
      3 + (событие.name.length + событие.время.length + 1) * 0.86,
    )
    const край =
      позиция - ширинаПодписи / 2 < 0
        ? 'start'
        : позиция + ширинаПодписи / 2 > 100
          ? 'end'
          : ''
    const from =
      край === 'start'
        ? позиция
        : край === 'end'
          ? позиция - ширинаПодписи
          : позиция - ширинаПодписи / 2
    const to =
      край === 'start'
        ? позиция + ширинаПодписи
        : край === 'end'
          ? позиция
          : позиция + ширинаПодписи / 2
    let ряд = 0
    while ((занятые[ряд] ?? []).some((з) => from < з.to && to > з.from)) ряд++
    if (!занятые[ряд]) занятые[ряд] = []
    занятые[ряд].push({ from, to })
    подписи.push({ событие, позиция, край, ряд })
  }
  /*
   * Ряды подписей поднимают всю ось вниз: иначе названия ивентов налезли бы
   * на полосу прайма. Без событий сдвиг нулевой, и ось остаётся компактной.
   */
  const сдвигОси = занятые.length === 0 ? 0 : занятые.length * 13 + 3
  const стильОси = { '--tl-shift': `${сдвигОси}px` } as CSSProperties

  return (
    <div className="dash-timeline" style={стильОси} aria-hidden="true">
      {подписи.length > 0 && (
        <div className="dash-tl-labels">
          {подписи.map(({ событие, позиция, край, ряд }) => (
            <span
              key={событие.id}
              className={`dash-tl-label kind-${событие.kind}${край ? ` ${край}` : ''}`}
              style={{ left: `${позиция}%`, top: `${ряд * 13}px` }}
              title={событие.title}
            >
              {событие.name} <span>{событие.время}</span>
            </span>
          ))}
        </div>
      )}
      <div className="dash-tl-track" />
      <div
        className="dash-tl-seg"
        style={{ left: `${левый}%`, width: `${ширина}%` }}
      />
      {близкие.map((с) => (
        <span
          key={с.id}
          className={`dash-tl-mark kind-${с.kind}`}
          style={{ left: `${позицияСобытия(с.минута)}%` }}
          title={с.title}
        />
      ))}
      {сейчасВШкале && (
        <div
          className={`dash-tl-now${позицияСейчас < 6 ? ' start' : позицияСейчас > 94 ? ' end' : ''}`}
          style={{ left: `${позицияСейчас}%` }}
        >
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
