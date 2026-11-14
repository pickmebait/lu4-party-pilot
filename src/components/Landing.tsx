import { useState } from 'react'
import charsShot from '@/assets/landing/party-pigs-chars-row.png'
import scheduleShot from '@/assets/landing/party-pigs-schedule-upcoming.png'
import { Login, type AuthMode } from './Login'
import { PaletteBar } from './PaletteBar'

/**
 * Лендинг для тех, кто ещё не вошёл в пати.
 *
 * Показывает, что уже работает (персонажи и расписание), и держит вход
 * прямо в первом экране: отдельная страница «о приложении» заставляла бы
 * искать кнопку входа по меню. Данные на скриншотах — настоящая пати
 * «Поросята», снятая из приложения, а не нарисованная витрина.
 */
export function Landing({ onDone }: { onDone: (name: string) => void }) {
  const [mode, setMode] = useState<AuthMode>('enter')

  const открытьВход = (next: AuthMode) => {
    setMode(next)
  }

  return (
    <div className="landing">
      <header className="site-head">
        <div className="wrap">
          <a className="brand" href="#top" aria-label="Const Party Pilot — наверх">
            <span className="logo">⚔</span>
            <span>
              Const Party Pilot<span className="stage">pre-alpha</span>
              <small>состав · экипировка · расписание</small>
            </span>
          </a>
          <nav className="nav" aria-label="Разделы страницы">
            <a href="#features">Возможности</a>
            <a href="#start">Как начать</a>
            <a href="#roadmap">Развитие</a>
          </nav>
          <div className="head-palette">
            <PaletteBar />
          </div>
          <a className="btn primary head-login" href="#login" onClick={() => открытьВход('enter')}>
            Войти
          </a>
        </div>
      </header>

      <main id="top">
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
              <Login mode={mode} onModeChange={setMode} onDone={onDone} />
            </div>
          </div>
        </section>

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

            <article className="feature">
              <div className="feature-copy">
                <h3>Персонажи</h3>
                <p>
                  Карточки состава, сабы, экипировка и премиум. Видно, кто готов, а кто ещё собирается.
                </p>
                <ul className="checklist">
                  <li>14 типов слотов и метки заточки</li>
                  <li>До трёх саб-классов с отдельной экипировкой</li>
                  <li>Премиум, контакты и явка — в одном месте</li>
                  <li>Вид «Строка» и вид «Колонка» для сравнения</li>
                </ul>
              </div>
              <div className="feature-shot">
                <div className="browser">
                  <div className="browser-bar">
                    <i />
                    <i />
                    <i />
                    <span className="address">pickmebait.github.io/lu4-party-pilot</span>
                    <span className="live">live</span>
                  </div>
                  <img
                    className="app-shot"
                    src={charsShot}
                    width="1440"
                    height="900"
                    alt="Поросята: персонажи в виде «Строка»"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <p className="shot-caption">
                  <b>Поросята</b> · вид «Строка»
                </p>
              </div>
            </article>

            <article className="feature flip">
              <div className="feature-copy">
                <h3>Расписание</h3>
                <p>
                  Общий календарь пати: прайм, выходные и явка. Время хранится по Москве, а показывается
                  в поясе смотрящего.
                </p>
                <ul className="checklist">
                  <li>«Ближайшее», неделя и месяц — один календарь</li>
                  <li>Прайм на диапазон дат и сдвиг на отдельный день</li>
                  <li>Выходные, праздники и события сервера</li>
                  <li>Явка: кто придёт, кто опаздывает, кого не будет</li>
                </ul>
              </div>
              <div className="feature-shot">
                <div className="browser">
                  <div className="browser-bar">
                    <i />
                    <i />
                    <i />
                    <span className="address">pickmebait.github.io/lu4-party-pilot</span>
                    <span className="live">live</span>
                  </div>
                  <img
                    className="app-shot"
                    src={scheduleShot}
                    width="1440"
                    height="760"
                    alt="Поросята: расписание в режиме «Ближайшее»"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <p className="shot-caption">
                  <b>Поросята</b> · «Ближайшее»
                </p>
              </div>
            </article>

            <div className="module-grid" id="modules">
              <article className="module-card">
                <span className="status-tag">развитие</span>
                <h3>Сводка</h3>
                <p>Общая картина пати: состав, слоты, прайм и активные цели на одном экране.</p>
                <div className="browser">
                  <div className="browser-bar">
                    <i />
                    <i />
                    <i />
                    <span className="address">/ сводка</span>
                  </div>
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
                          <div className="bar-row">
                            <span>придут</span>
                            <div className="bar">
                              <i style={{ width: '72%' }} />
                            </div>
                            <span>8</span>
                          </div>
                          <div className="bar-row">
                            <span>опоздают</span>
                            <div className="bar">
                              <i style={{ width: '18%', background: 'var(--accent)' }} />
                            </div>
                            <span>2</span>
                          </div>
                          <div className="bar-row">
                            <span>нет</span>
                            <div className="bar">
                              <i style={{ width: '10%', background: 'var(--err)' }} />
                            </div>
                            <span>1</span>
                          </div>
                        </div>
                        <div className="panel">
                          <h4>Готовность</h4>
                          <div className="bar-row">
                            <span>PickMe</span>
                            <div className="bar">
                              <i style={{ width: '92%' }} />
                            </div>
                            <span>11</span>
                          </div>
                          <div className="bar-row">
                            <span>Ирока</span>
                            <div className="bar">
                              <i style={{ width: '76%' }} />
                            </div>
                            <span>9</span>
                          </div>
                          <div className="bar-row">
                            <span>Сова</span>
                            <div className="bar">
                              <i style={{ width: '58%' }} />
                            </div>
                            <span>7</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </article>

              <article className="module-card">
                <span className="status-tag">развитие</span>
                <h3>Общая казна</h3>
                <p>Стопки предметов, комплекты и история: кто положил, кто забрал и когда.</p>
                <div className="browser">
                  <div className="browser-bar">
                    <i />
                    <i />
                    <i />
                    <span className="address">/ казна</span>
                  </div>
                  <div className="app">
                    <div className="app-body">
                      <div className="warehouse-row">
                        <span className="item-ico" />
                        <span className="name">Кристалл души</span>
                        <span className="qty">× 124</span>
                      </div>
                      <div className="warehouse-row">
                        <span className="item-ico" />
                        <span className="name">Кровь дракона</span>
                        <span className="qty">× 38</span>
                      </div>
                      <div className="warehouse-row">
                        <span className="item-ico" />
                        <span className="name">Свиток заточки</span>
                        <span className="qty">× 17</span>
                      </div>
                      <div className="set-line">
                        <div className="top">
                          <span>Комплект «Мажор»</span>
                          <span>4 из 5</span>
                        </div>
                        <div className="bar">
                          <i style={{ width: '80%' }} />
                        </div>
                      </div>
                      <div className="set-line">
                        <div className="top">
                          <span>Комплект «Дракон»</span>
                          <span>2 из 6</span>
                        </div>
                        <div className="bar">
                          <i style={{ width: '33%' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </article>

              <article className="module-card">
                <span className="status-tag">развитие</span>
                <h3>Цели</h3>
                <p>Хотелки пати с приоритетом, прогрессом и историей. Нашёл — сразу в казну.</p>
                <div className="browser">
                  <div className="browser-bar">
                    <i />
                    <i />
                    <i />
                    <span className="address">/ цели</span>
                  </div>
                  <div className="app">
                    <div className="app-body">
                      <div className="goal-row">
                        <div className="goal-top">
                          <span className="name">Сет для СХ</span>
                          <span className="count">4 / 7</span>
                        </div>
                        <div className="bar">
                          <i style={{ width: '57%' }} />
                        </div>
                      </div>
                      <div className="goal-row">
                        <div className="goal-top">
                          <span className="name">Пушка на саб</span>
                          <span className="count">1 / 3</span>
                        </div>
                        <div className="bar">
                          <i style={{ width: '33%' }} />
                        </div>
                      </div>
                      <div className="goal-row">
                        <div className="goal-top">
                          <span className="name">Бижа на олимп</span>
                          <span className="count">6 / 6</span>
                        </div>
                        <div className="bar">
                          <i style={{ width: '100%' }} />
                        </div>
                      </div>
                      <div className="goal-row">
                        <div className="goal-top">
                          <span className="name">Расходники на прайм</span>
                          <span className="count">12 / 20</span>
                        </div>
                        <div className="bar">
                          <i style={{ width: '60%' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="section" id="start">
          <div className="wrap">
            <div className="section-head">
              <div>
                <span className="eyebrow">Как начать</span>
                <h2>Три шага до общего экрана</h2>
              </div>
              <p>Мастер-токен остаётся у лидера. Игрокам выдаются отдельные токены — по одному на персонажа.</p>
            </div>
            <div className="steps">
              <article className="step">
                <h3>Создайте пати</h3>
                <p>Введите название — приложение заведёт отдельную базу и покажет мастер-токен.</p>
                <span className="mini-note">занимает минуту</span>
              </article>
              <article className="step">
                <h3>Сохраните мастер-токен</h3>
                <p>Он показывается один раз. Если потеряется — перевыпустите в меню доступа.</p>
                <span className="mini-note">только у лидера</span>
              </article>
              <article className="step">
                <h3>Выдайте токены игрокам</h3>
                <p>Каждый входит по своему токену, видит всю пати и правит только своего героя.</p>
                <span className="mini-note">без регистрации</span>
              </article>
            </div>
          </div>
        </section>

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
              <article className="road-col">
                <h3>Уже в игре</h3>
                <div className="road-item">
                  <span className="status done" />
                  <div>
                    Персонажи<span>экипировка, сабы, ПА, контакты</span>
                  </div>
                </div>
                <div className="road-item">
                  <span className="status done" />
                  <div>
                    Расписание<span>прайм, выходные, явка</span>
                  </div>
                </div>
                <div className="road-item">
                  <span className="status done" />
                  <div>
                    Токены пати<span>мастер и персонажи, отзыв и перевыпуск</span>
                  </div>
                </div>
              </article>
              <article className="road-col">
                <h3>В работе</h3>
                <div className="road-item">
                  <span className="status wip" />
                  <div>
                    Сводка<span>главные цифры пати на одном экране</span>
                  </div>
                </div>
                <div className="road-item">
                  <span className="status wip" />
                  <div>
                    Общая казна<span>склад, комплекты и история</span>
                  </div>
                </div>
                <div className="road-item">
                  <span className="status wip" />
                  <div>
                    Цели<span>хотелки, приоритеты и прогресс</span>
                  </div>
                </div>
              </article>
              <article className="road-col">
                <h3>Дальше</h3>
                <div className="road-item">
                  <span className="status next" />
                  <div>
                    Уведомления<span>прайм и изменения без ручной проверки</span>
                  </div>
                </div>
                <div className="road-item">
                  <span className="status next" />
                  <div>
                    Статистика<span>посещаемость и активность по неделям</span>
                  </div>
                </div>
                <div className="road-item">
                  <span className="status next" />
                  <div>
                    Мобильный вид<span>быстрый доступ с телефона</span>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="cta">
          <div className="wrap">
            <h2>Соберите пати в одном месте</h2>
            <p>Войдите по токену или создайте новую пати. Без регистрации и платных тарифов.</p>
            <div className="actions">
              <a className="btn primary" href="#login" onClick={() => открытьВход('enter')}>
                Войти по токену
              </a>
              <a className="btn" href="#login" onClick={() => открытьВход('create')}>
                Создать пати
              </a>
            </div>
            <p className="note">Токен хранится в браузере. Данные — в вашем репозитории.</p>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap">
          <span>Const Party Pilot · pre-alpha</span>
          <span className="links">
            <a href="#features">Возможности</a>
            <a href="#start">Как начать</a>
            <a href="#roadmap">Развитие</a>
          </span>
        </div>
      </footer>
    </div>
  )
}
