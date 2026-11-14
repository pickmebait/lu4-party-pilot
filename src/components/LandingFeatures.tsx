import type { ComponentType, ReactNode } from 'react'
import charsShot from '@/assets/landing/party-pigs-chars-row.png'
import scheduleShot from '@/assets/landing/party-pigs-schedule-upcoming.png'
import { FeatureShot, GoalsPreview, SummaryPreview, WarehousePreview } from './LandingPreviews'

interface Feature {
  title: string
  lead: string
  points: string[]
  src: string
  width: number
  height: number
  alt: string
  caption: ReactNode
}

/*
 * Только то, что уже работает. Будущие модули стоят ниже отдельной сеткой
 * с пометкой «развитие»: обещать на первом экране то, чего ещё нет, — значит
 * превратить лендинг в список несбывшегося.
 */
const ЧТО_РАБОТАЕТ: Feature[] = [
  {
    title: 'Персонажи',
    lead: 'Карточки состава, сабы, экипировка и премиум. Видно, кто готов, а кто ещё собирается.',
    points: [
      '14 типов слотов и метки заточки',
      'До трёх саб-классов с отдельной экипировкой',
      'Премиум, контакты и явка — в одном месте',
      'Вид «Строка» и вид «Колонка» для сравнения',
    ],
    src: charsShot,
    width: 1440,
    height: 900,
    alt: 'Поросята: персонажи в виде «Строка»',
    caption: 'вид «Строка»',
  },
  {
    title: 'Расписание',
    lead: 'Общий календарь пати: прайм, выходные и явка. Время хранится по Москве, а показывается в поясе смотрящего.',
    points: [
      '«Ближайшее», неделя и месяц — один календарь',
      'Прайм на диапазон дат и сдвиг на отдельный день',
      'Выходные, праздники и события сервера',
      'Явка: кто придёт, кто опаздывает, кого не будет',
    ],
    src: scheduleShot,
    width: 1440,
    height: 760,
    alt: 'Поросята: расписание в режиме «Ближайшее»',
    caption: '«Ближайшее»',
  },
]

interface Module {
  title: string
  lead: string
  Preview: ComponentType
}

const МОДУЛИ: Module[] = [
  {
    title: 'Сводка',
    lead: 'Общая картина пати: состав, слоты, прайм и активные цели на одном экране.',
    Preview: SummaryPreview,
  },
  {
    title: 'Общая казна',
    lead: 'Стопки предметов, комплекты и история: кто положил, кто забрал и когда.',
    Preview: WarehousePreview,
  },
  {
    title: 'Цели',
    lead: 'Хотелки пати с приоритетом, прогрессом и историей. Нашёл — сразу в казну.',
    Preview: GoalsPreview,
  },
]

/**
 * Рассказ о том, что уже работает, с настоящими скриншотами пати «Поросята»,
 * и сетка модулей в разработке.
 */
export function LandingFeatures() {
  return (
    <section className="section" id="features">
      <div className="wrap">
        <div className="section-head">
          <div>
            <span className="eyebrow">Что внутри</span>
            <h2>
              Не таблица в Discord,
              <br />а рабочее место пати
            </h2>
          </div>
          <p>
            Персонажи и расписание уже в игре. Каждый модуль показывает то, что важно перед праймом,
            а не архив скриншотов.
          </p>
        </div>

        {ЧТО_РАБОТАЕТ.map((feature, i) => (
          <article className={`feature${i % 2 ? ' flip' : ''}`} key={feature.title}>
            <div className="feature-copy">
              <h3>{feature.title}</h3>
              <p>{feature.lead}</p>
              <ul className="checklist">
                {feature.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
            <FeatureShot
              src={feature.src}
              width={feature.width}
              height={feature.height}
              alt={feature.alt}
              caption={feature.caption}
            />
          </article>
        ))}

        <div className="module-grid" id="modules">
          {МОДУЛИ.map(({ title, lead, Preview }) => (
            <article className="module-card" key={title}>
              <span className="status-tag">развитие</span>
              <h3>{title}</h3>
              <p>{lead}</p>
              <Preview />
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
