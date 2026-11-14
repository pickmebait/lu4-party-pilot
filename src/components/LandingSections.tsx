import { APP_NAME } from '@/lib/brand'
import type { AuthMode } from '@/lib/partyAuth'
import { Login } from './Login'
import { PaletteBar } from './PaletteBar'

const РАЗДЕЛЫ = [
  { href: '#features', label: 'Возможности' },
  { href: '#start', label: 'Как начать' },
  { href: '#roadmap', label: 'Развитие' },
]

/** Шапка лендинга: название, разделы, палитра и вход. */
export function LandingHeader({ onEnter }: { onEnter: () => void }) {
  return (
    <header className="site-head">
      <div className="wrap">
        <a className="brand" href="#top" aria-label={`${APP_NAME} — наверх`}>
          <span className="logo">⚔</span>
          <span>
            {APP_NAME}
            <span className="stage">pre-alpha</span>
            <small>состав · экипировка · расписание</small>
          </span>
        </a>
        <nav className="nav" aria-label="Разделы страницы">
          {РАЗДЕЛЫ.map((раздел) => (
            <a href={раздел.href} key={раздел.href}>
              {раздел.label}
            </a>
          ))}
        </nav>
        <div className="head-palette">
          <PaletteBar />
        </div>
        <a className="btn primary head-login" href="#login" onClick={onEnter}>
          Войти
        </a>
      </div>
    </header>
  )
}

/**
 * Первый экран: обещание и вход.
 *
 * Карточка входа стоит рядом с заголовком, а не на отдельной странице:
 * иначе человеку пришлось бы искать кнопку входа по меню.
 */
export function LandingHero({
  mode,
  onModeChange,
}: {
  mode: AuthMode
  onModeChange: (mode: AuthMode) => void
}) {
  return (
    <section className="hero">
      <div className="wrap">
        <div className="hero-copy">
          <span className="kicker">LU4.org</span>
          <h1>
            Вся пати
            <br />
            <span className="gold">на одном экране</span>
          </h1>
          <p className="lead">
            Состав, экипировка, прайм, казна и цели. Общий токен вместо аккаунтов, данные — в вашем
            репозитории.
          </p>
          <div className="points">
            <span className="point">
              <b>Без регистрации</b> — только токен
            </span>
            <span className="point">
              <b>Токен</b> хранится в браузере
            </span>
            <span className="point">
              <b>Без платных</b> тарифов
            </span>
          </div>
          <p className="hero-note">
            Уже работает: <b>персонажи</b> и <b>расписание</b>. Дальше — сводка, казна и цели.
          </p>
        </div>

        <div className="auth-slot" id="login">
          <Login mode={mode} onModeChange={onModeChange} />
        </div>
      </div>
    </section>
  )
}

const ШАГИ = [
  {
    title: 'Создайте пати',
    text: 'Введите название — приложение заведёт отдельную базу и покажет мастер-токен.',
    note: 'занимает минуту',
  },
  {
    title: 'Сохраните мастер-токен',
    text: 'Он показывается один раз. Если потеряется — перевыпустите в меню доступа.',
    note: 'только у лидера',
  },
  {
    title: 'Выдайте токены игрокам',
    text: 'Каждый входит по своему токену, видит всю пати и правит только своего героя.',
    note: 'без регистрации',
  },
]

/** Как начать: три шага от создания пати до игроков внутри. */
export function LandingStart() {
  return (
    <section className="section" id="start">
      <div className="wrap">
        <div className="section-head">
          <div>
            <span className="eyebrow">Как начать</span>
            <h2>Три шага до общего экрана</h2>
          </div>
          <p>
            Мастер-токен остаётся у лидера. Игрокам выдаются отдельные токены — по одному на
            персонажа.
          </p>
        </div>
        <div className="steps">
          {ШАГИ.map((шаг) => (
            <article className="step" key={шаг.title}>
              <h3>{шаг.title}</h3>
              <p>{шаг.text}</p>
              <span className="mini-note">{шаг.note}</span>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

interface RoadmapColumn {
  title: string
  status: 'done' | 'wip' | 'next'
  items: { title: string; note: string }[]
}

/*
 * Развитие честно делится на три состояния: что уже в игре, что в работе и
 * что только планируется. Пункт, переехавший из «дальше» в «в игре», должен
 * менять только состояние — текст остаётся тем же.
 */
const РАЗВИТИЕ: RoadmapColumn[] = [
  {
    title: 'Уже в игре',
    status: 'done',
    items: [
      { title: 'Персонажи', note: 'экипировка, сабы, ПА, контакты' },
      { title: 'Расписание', note: 'прайм, выходные, явка' },
      { title: 'Токены пати', note: 'мастер и персонажи, отзыв и перевыпуск' },
    ],
  },
  {
    title: 'В работе',
    status: 'wip',
    items: [
      { title: 'Сводка', note: 'главные цифры пати на одном экране' },
      { title: 'Общая казна', note: 'склад, комплекты и история' },
      { title: 'Цели', note: 'хотелки, приоритеты и прогресс' },
    ],
  },
  {
    title: 'Дальше',
    status: 'next',
    items: [
      { title: 'Уведомления', note: 'прайм и изменения без ручной проверки' },
      { title: 'Статистика', note: 'посещаемость и активность по неделям' },
      { title: 'Мобильный вид', note: 'быстрый доступ с телефона' },
    ],
  },
]

/** Развитие: что уже работает, что в работе и что дальше. */
export function LandingRoadmap() {
  return (
    <section className="section" id="roadmap">
      <div className="wrap">
        <div className="section-head">
          <div>
            <span className="eyebrow">Развитие</span>
            <h2>Приложение растёт вместе с пати</h2>
          </div>
          <p>
            Сначала — состав и расписание. Теперь добавляем сводку, казну и цели. Дальше — то, что
            попросят сами игроки.
          </p>
        </div>
        <div className="roadmap">
          {РАЗВИТИЕ.map((колонка) => (
            <article className="road-col" key={колонка.title}>
              <h3>{колонка.title}</h3>
              {колонка.items.map((item) => (
                <div className="road-item" key={item.title}>
                  <span className={`status ${колонка.status}`} />
                  <div>
                    {item.title}
                    <span>{item.note}</span>
                  </div>
                </div>
              ))}
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

/** Нижний призыв: те же два входа, что и на первом экране. */
export function LandingCta({ onEnter }: { onEnter: (mode: AuthMode) => void }) {
  return (
    <section className="cta">
      <div className="wrap">
        <h2>Соберите пати в одном месте</h2>
        <p>Войдите по токену или создайте новую пати. Без регистрации и платных тарифов.</p>
        <div className="actions">
          <a className="btn primary" href="#login" onClick={() => onEnter('enter')}>
            Войти по токену
          </a>
          <a className="btn" href="#login" onClick={() => onEnter('create')}>
            Создать пати
          </a>
        </div>
        <p className="note">Токен хранится в браузере. Данные — в вашем репозитории.</p>
      </div>
    </section>
  )
}

/** Подвал: название и те же разделы, чтобы не листать наверх. */
export function LandingFooter() {
  return (
    <footer className="footer">
      <div className="wrap">
        <span>{APP_NAME} · pre-alpha</span>
        <span className="links">
          {РАЗДЕЛЫ.map((раздел) => (
            <a href={раздел.href} key={раздел.href}>
              {раздел.label}
            </a>
          ))}
        </span>
      </div>
    </footer>
  )
}
