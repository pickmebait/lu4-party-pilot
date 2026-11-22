import { Fragment } from 'react'
import type { ПериодДней, ПраймЗаПериод, Явка } from '@/lib/analytics'
import {
  ДНИ_НЕДЕЛИ,
  daysBetween,
  formatDay,
  formatDayRange,
  parseKey,
} from '@/lib/schedule'
import { affiliationOrder, type Char, type Db } from '@/types'
import { plural } from '@/lib/util'
import {
  датыСловами,
  длительность,
  дробь,
  конецНедели,
  месяцКоротко,
  началоНедели,
  пропущенныеДни,
} from './format'
import { Kpi } from './bits'

/* ----------------------------------------------------------- «Ритм» */

export function Ритм({
  db,
  сегодня,
  дней,
  сОт,
  прайм,
  явка,
  дниПрайма,
  начало,
  основные,
}: {
  db: Db
  сегодня: string
  дней: ПериодДней
  сОт: string | null
  прайм: ПраймЗаПериод
  явка: Явка
  дниПрайма: string[]
  начало: string
  /** Основной состав: «Окно» в исторических видах не участвует. */
  основные: Char[]
}) {
  const всего = основные.length
  const всегоПропусков = явка.поПерсонажам.reduce((сумма, п) => сумма + п.пропусков, 0)
  const пропустившие = явка.поПерсонажам.filter((п) => п.пропусков > 0)
  const дниСПропусками = явка.датыНеполных.length
  const процентПолных = явка.праймов
    ? Math.round((явка.полных / явка.праймов) * 100)
    : 0
  const календарных = дней === 0 ? daysBetween(начало, сегодня).length : дней

  /*
   * Календарь начинается с первого прайма периода, а не с его формальной
   * даты. За 90 дней в базе может не быть ни одной записи за первые недели:
   * пустые строки занимали бы пол-экрана и выглядели как потерянные данные,
   * хотя это просто начало истории пати.
   */
  const перваяДата = дниПрайма[0] ?? сОт ?? начало
  const началоCalendar = началоНедели(перваяДата)
  const календарь = daysBetween(началоCalendar, конецНедели(сегодня))

  const вПериоде = (key: string) =>
    key <= сегодня && key >= (сОт ?? начало) && key >= перваяДата
  const ячейка = (key: string) => {
    const выходной = db.schedule.offs.includes(key)
    const окно = db.schedule.prime[key]
    const естьПрайм = Boolean(окно) && !выходной
    const ушли = естьПрайм ? основные.filter((c) => c.away?.[key]) : []
    const пришло = всего - ушли.length
    let класс = 'dash-cal-cell'
    if (!вПериоде(key)) класс += ' out'
    else if (выходной) класс += ' off'
    else if (естьПрайм) {
      класс +=
        ушли.length === 0
          ? ' full'
          : ушли.length === 1
            ? ' nine'
            : ушли.length === 2
              ? ' eight'
              : ' seven'
    } else класс += ' none'
    const подсказка = !вПериоде(key)
      ? formatDay(key, true)
      : выходной
        ? `${formatDay(key, true)} · выходной пати`
        : естьПрайм
          ? `${formatDay(key, true)} · ${пришло} из ${всего}${ушли.length ? ` · нет: ${ушли.map((c) => c.name || 'Без имени').join(', ')}` : ' · все были'}`
          : `${formatDay(key, true)} · прайм не назначен`
    return { key, класс, подсказка, выходной, естьПрайм, пришло, ушли }
  }

  const строки = [...основные].sort((a, b) => {
    const порядок = affiliationOrder(a.affil) - affiliationOrder(b.affil)
    if (порядок !== 0) return порядок
    return (a.name || '').localeCompare(b.name || '', 'ru')
  })

  const максимумПропусков = Math.max(1, ...пропустившие.map((п) => п.пропусков))
  const топ = пропустившие[0]
  const топДни = топ
    ? пропущенныеДни(
        db.chars.find((c) => c.id === топ.charId),
        дниПрайма,
      )
    : []
  const топДоля = топ && всегоПропусков ? Math.round((топ.пропусков / всегоПропусков) * 100) : 0

  const месяцы = прайм.поМесяцам
  const максимумЧасов = Math.max(1, ...месяцы.map((м) => м.часов))

  return (
    <>
      <div className="dash-kpis five">
        <Kpi
          label="Праймы"
          value={прайм.дней}
          sub={
            дней === 0
              ? `с ${formatDay(начало)}`
              : `из ${календарных} календарных дней`
          }
        />
        <Kpi
          label="Часы прайма"
          value={
            <>
              {дробь(прайм.часов)} <small>ч</small>
            </>
          }
          sub={прайм.дней ? `окно ${длительность(прайм.среднееОкно)}` : 'праймов нет'}
        />
        <Kpi
          label="Средняя явка"
          value={
            явка.праймов ? (
              <>
                {дробь(явка.средняя)} <small>из {всего}</small>
              </>
            ) : (
              '—'
            )
          }
          sub={
            всегоПропусков
              ? `${всегоПропусков} ${plural(всегоПропусков, 'пропуск', 'пропуска', 'пропусков')} на ${дниСПропусками} ${plural(дниСПропусками, 'дне', 'днях', 'днях')}`
              : 'пропусков нет'
          }
        />
        <Kpi
          label="Полные сборы"
          value={
            <>
              {явка.полных} <small>из {явка.праймов}</small>
            </>
          }
          sub={`${процентПолных}% праймов без пропусков`}
        />
        <Kpi
          label="Пропуски"
          value={<span className="dash-bad-text">{всегоПропусков}</span>}
          sub={`у ${пропустившие.length} ${plural(пропустившие.length, 'человека', 'человек', 'человек')} · ${дниСПропусками} ${plural(дниСПропусками, 'день', 'дня', 'дней')} из ${явка.праймов}`}
        />
      </div>

      <div className="dash-grid-rhythm">
        <section className="dash-card dash-cal-card">
          <div className="dash-card-head">
            <h3>Календарь явки</h3>
            <span className="dash-card-sub">{formatDayRange([перваяДата, сегодня])}</span>
            <div className="dash-legend">
              <span>
                <i className="dash-sw full" />
                {всего}/{всего}
              </span>
              <span>
                <i className="dash-sw nine" />
                {Math.max(0, всего - 1)}/{всего}
              </span>
              <span>
                <i className="dash-sw eight" />
                {Math.max(0, всего - 2)}/{всего}
              </span>
              <span>
                <i className="dash-sw seven" />
                {Math.max(0, всего - 3)}/{всего}
              </span>
              <span>
                <i className="dash-sw off" />
                выходной
              </span>
            </div>
          </div>
          <div className="dash-cal-grid">
            {ДНИ_НЕДЕЛИ.map((д) => (
              <div className="dash-cal-dow" key={д}>
                {д}
              </div>
            ))}
            {календарь.map((key) => {
              const я = ячейка(key)
              return (
                <div key={key} className={я.класс} title={я.подсказка}>
                  <span className="dash-cal-date">{parseKey(key).getDate()}</span>
                  {я.выходной && я.класс.indexOf('out') === -1 && (
                    <span className="dash-cal-mark">вых.</span>
                  )}
                  {я.естьПрайм && я.класс.indexOf('out') === -1 && (
                    <span className="dash-cal-mark">
                      {я.пришло}/{всего}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        <section className="dash-card dash-miss-card">
          <div className="dash-card-head">
            <h3>Кто пропускал</h3>
            <span className="dash-card-tail">за период</span>
          </div>
          {явка.праймов === 0 ? (
            <p className="hint">За этот период праймов не было — считать нечего.</p>
          ) : пропустившие.length === 0 ? (
            <div className="dash-all-clear">
              <span className="dash-pulse" />
              <span>
                <b>Пропусков нет.</b> Все {явка.праймов}{' '}
                {plural(явка.праймов, 'прайм', 'прайма', 'праймов')} собрались полностью.
              </span>
            </div>
          ) : (
            <>
              <div className="dash-miss-list">
                {пропустившие.slice(0, 8).map((п) => (
                  <div className="dash-miss-row" key={п.charId}>
                    <div className="dash-miss-name">
                      {п.имя}
                      <small>
                        {датыСловами(
                          пропущенныеДни(
                            db.chars.find((c) => c.id === п.charId),
                            дниПрайма,
                          ),
                        )}
                      </small>
                    </div>
                    <div className="dash-miss-bar">
                      <i style={{ width: `${(п.пропусков / максимумПропусков) * 100}%` }} />
                    </div>
                    <div className="dash-miss-num">{п.пропусков}</div>
                  </div>
                ))}
              </div>
              {пропустившие.length > 8 && (
                <p className="dash-mini">и ещё {пропустившие.length - 8}.</p>
              )}
              <div className="dash-miss-foot">
                {всего - пропустившие.length > 0 && (
                  <>
                    Остальные <b>{всего - пропустившие.length}</b>{' '}
                    {plural(
                      всего - пропустившие.length,
                      'человек',
                      'человека',
                      'человек',
                    )}{' '}
                    не пропустили ни одного прайма.{' '}
                  </>
                )}
                {топ && топДоля >= 50 && (
                  <>
                    Больше половины пропусков — <b>{топ.имя}</b> ({топ.пропусков} из{' '}
                    {всегоПропусков}).
                  </>
                )}
                {топ && топДоля < 50 && (
                  <>
                    Чаще всего пропускал <b>{топ.имя}</b> — {топ.пропусков}{' '}
                    {plural(топ.пропусков, 'раз', 'раза', 'раз')}.
                  </>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      <div className="dash-grid-rhythm dash-grid-matrix">
        <section className="dash-card dash-matrix-card">
          <div className="dash-card-head">
            <h3>Матрица явки по праймам</h3>
            <span className="dash-card-sub">
              {дниПрайма.length} {plural(дниПрайма.length, 'прайм', 'прайма', 'праймов')} · зелёный
              — был, красный — пропустил
            </span>
            <span className="dash-card-tail">наведите на клетку</span>
          </div>
          {дниПрайма.length === 0 ? (
            <p className="hint">Праймов за период нет.</p>
          ) : (
            <div className="dash-matrix-scroll">
              <div
                className="dash-matrix"
                style={{
                  gridTemplateColumns: `120px repeat(${дниПрайма.length}, minmax(12px, 1fr))`,
                  minWidth: `${120 + дниПрайма.length * 16}px`,
                }}
              >
                <div />
                {дниПрайма.map((д, i) => {
                  const дата = parseKey(д)
                  const прошлый = i > 0 ? parseKey(дниПрайма[i - 1]) : null
                  const месяц = дата.getDate() === 1
                  // Недельная метка не должна вставать вплотную к началу
                  // месяца: «1» и «2» рядом читались бы как опечатка.
                  const неделя =
                    i % 7 === 0 && !(прошлый && прошлый.getDate() === 1)
                  const подпись =
                    месяц || i === 0 || неделя || i === дниПрайма.length - 1
                      ? дата.getDate()
                      : ''
                  return (
                    <div
                      key={д}
                      className={`dash-mx-head${месяц || i === 0 ? ' month' : ''}`}
                      title={formatDay(д, true)}
                    >
                      {подпись}
                    </div>
                  )
                })}
                {строки.map((c) => (
                  <Fragment key={c.id}>
                    <div className="dash-mx-name" title={c.name || 'Без имени'}>
                      <b>{c.name || 'Без имени'}</b>
                    </div>
                    {дниПрайма.map((д) => {
                      const пропустил = Boolean(c.away?.[д])
                      return (
                        <div
                          key={д}
                          className={`dash-mx-cell${пропустил ? ' no' : ''}`}
                          title={`${formatDay(д, true)} · ${пропустил ? 'пропустил' : 'был'}`}
                        />
                      )
                    })}
                  </Fragment>
                ))}
              </div>
            </div>
          )}
          <div className="dash-mx-legend">
            <span>
              <i className="dash-sw full" />
              был
            </span>
            <span>
              <i className="dash-sw bad" />
              пропустил
            </span>
            <span className="dash-mx-tail">
              {месяцКоротко(дниПрайма[0] ?? сегодня)} → {месяцКоротко(сегодня)}
            </span>
          </div>
        </section>

        <div className="dash-rhythm-side">
          <section className="dash-card dash-hours-card">
            <h3>Часы прайма по месяцам</h3>
            {месяцы.length === 0 ? (
              <p className="hint">Праймов за период нет.</p>
            ) : (
              <div className="dash-hours">
                {месяцы.map((м) => (
                  <div className="dash-hour-col" key={м.месяц}>
                    <b>{дробь(м.часов)} ч</b>
                    <div
                      className="dash-hour-bar"
                      style={{
                        height: `${Math.max(2, (м.часов / максимумЧасов) * 100)}%`,
                      }}
                    />
                    <span>{месяцКоротко(м.месяц)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="dash-hours-foot">
              <span>
                <b>{прайм.выходных}</b>{' '}
                {plural(прайм.выходных, 'выходной', 'выходных', 'выходных')} за период
              </span>
              <span>
                <b>{длительность(прайм.среднееОкно)}</b> окно
              </span>
            </div>
          </section>

          <section className="dash-card dash-conclusion">
            <h3>Что говорит история</h3>
            {явка.праймов === 0 ? (
              <p>
                За этот период праймов не было. Как только они появятся, здесь сложится картина
                явки.
              </p>
            ) : (
              <>
                <p>
                  {процентПолных >= 70
                    ? 'Пати стабильна: '
                    : процентПолных >= 40
                      ? 'Пати собирается не всегда: '
                      : 'Сборы редкие: '}
                  <b>{процентПолных}% сборов</b> за период были полными ({явка.полных} из{' '}
                  {явка.праймов}).
                </p>
                {топ ? (
                  <p>
                    Больше всего пропусков у <b>{топ.имя}</b> — {топ.пропусков}{' '}
                    {plural(топ.пропусков, 'раз', 'раза', 'раз')}
                    {топДни.length > 0 && (
                      <>
                        {' '}
                        (<span className="dash-hl">{датыСловами(топДни)}</span>)
                      </>
                    )}
                    .
                  </p>
                ) : (
                  <p>Пропусков не было: весь период пати собиралась полным составом.</p>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </>
  )
}
