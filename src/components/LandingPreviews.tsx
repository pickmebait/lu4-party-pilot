import type { ReactNode } from 'react'

/**
 * Окно браузера вокруг превью.
 *
 * Скриншоты и нарисованные модули должны читаться одинаково: рамка с адресной
 * строкой отделяет «что уже есть» от самой страницы и не даёт превью
 * слиться с фоном лендинга.
 */
export function BrowserFrame({
  address,
  live,
  children,
}: {
  address: string
  live?: boolean
  children: ReactNode
}) {
  return (
    <div className="browser">
      <div className="browser-bar">
        <i />
        <i />
        <i />
        <span className="address">{address}</span>
        {live && <span className="live">live</span>}
      </div>
      {children}
    </div>
  )
}

/** Настоящий скриншот пати «Поросята» в рамке браузера. */
export function FeatureShot({
  src,
  width,
  height,
  alt,
  caption,
}: {
  src: string
  width: number
  height: number
  alt: string
  caption: ReactNode
}) {
  return (
    <div className="feature-shot">
      <BrowserFrame address="pickmebait.github.io/lu4-party-pilot" live>
        <img
          className="app-shot"
          src={src}
          width={width}
          height={height}
          alt={alt}
          loading="lazy"
          decoding="async"
        />
      </BrowserFrame>
      <p className="shot-caption">
        <b>Поросята</b> · {caption}
      </p>
    </div>
  )
}

interface BarRow {
  label: string
  width: string
  value: string
  tone?: 'accent' | 'err'
}

const ЯВКА: BarRow[] = [
  { label: 'придут', width: '72%', value: '8' },
  { label: 'опоздают', width: '18%', value: '2', tone: 'accent' },
  { label: 'нет', width: '10%', value: '1', tone: 'err' },
]

const ГОТОВНОСТЬ: BarRow[] = [
  { label: 'PickMe', width: '92%', value: '11' },
  { label: 'Ирока', width: '76%', value: '9' },
  { label: 'Сова', width: '58%', value: '7' },
]

const КАЗНА = [
  { name: 'Кристалл души', qty: '× 124' },
  { name: 'Кровь дракона', qty: '× 38' },
  { name: 'Свиток заточки', qty: '× 17' },
] as const

const КОМПЛЕКТЫ = [
  { name: 'Комплект «Мажор»', done: '4 из 5', width: '80%' },
  { name: 'Комплект «Дракон»', done: '2 из 6', width: '33%' },
] as const

const ЦЕЛИ = [
  { name: 'Сет для СХ', count: '4 / 7', width: '57%' },
  { name: 'Пушка на саб', count: '1 / 3', width: '33%' },
  { name: 'Бижа на олимп', count: '6 / 6', width: '100%' },
  { name: 'Расходники на прайм', count: '12 / 20', width: '60%' },
] as const

function полосаШирины(tone?: 'accent' | 'err'): string | undefined {
  if (tone === 'accent') return 'var(--accent)'
  if (tone === 'err') return 'var(--err)'
  return undefined
}

/** Превью сводки — одного из модулей, которые ещё в работе. */
export function SummaryPreview() {
  return (
    <BrowserFrame address="/ сводка">
      <div className="app">
        <div className="app-body">
          <div className="stats">
            <div className="stat">
              <b>5</b>
              <span>персонажей</span>
            </div>
            <div className="stat">
              <b>37/108</b>
              <span>слотов</span>
            </div>
            <div className="stat">
              <b>5.5 ч</b>
              <span>прайма</span>
            </div>
            <div className="stat">
              <b>3</b>
              <span>цели</span>
            </div>
          </div>
          <div className="summary-row">
            <div className="panel">
              <h4>Явка на прайм</h4>
              {ЯВКА.map((row) => (
                <div className="bar-row" key={row.label}>
                  <span>{row.label}</span>
                  <div className="bar">
                    <i style={{ width: row.width, background: полосаШирины(row.tone) }} />
                  </div>
                  <span>{row.value}</span>
                </div>
              ))}
            </div>
            <div className="panel">
              <h4>Готовность</h4>
              {ГОТОВНОСТЬ.map((row) => (
                <div className="bar-row" key={row.label}>
                  <span>{row.label}</span>
                  <div className="bar">
                    <i style={{ width: row.width }} />
                  </div>
                  <span>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </BrowserFrame>
  )
}

/** Превью общей казны. */
export function WarehousePreview() {
  return (
    <BrowserFrame address="/ казна">
      <div className="app">
        <div className="app-body">
          {КАЗНА.map((row) => (
            <div className="warehouse-row" key={row.name}>
              <span className="item-ico" />
              <span className="name">{row.name}</span>
              <span className="qty">{row.qty}</span>
            </div>
          ))}
          {КОМПЛЕКТЫ.map((set) => (
            <div className="set-line" key={set.name}>
              <div className="top">
                <span>{set.name}</span>
                <span>{set.done}</span>
              </div>
              <div className="bar">
                <i style={{ width: set.width }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </BrowserFrame>
  )
}

/** Превью целей пати. */
export function GoalsPreview() {
  return (
    <BrowserFrame address="/ цели">
      <div className="app">
        <div className="app-body">
          {ЦЕЛИ.map((goal) => (
            <div className="goal-row" key={goal.name}>
              <div className="goal-top">
                <span className="name">{goal.name}</span>
                <span className="count">{goal.count}</span>
              </div>
              <div className="bar">
                <i style={{ width: goal.width }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </BrowserFrame>
  )
}
