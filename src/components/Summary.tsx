import { useMemo, useState } from 'react'
import type { CatalogApi } from '@/lib/catalog'
import { useAccess } from '@/lib/access'
import { useDb } from '@/lib/store'
import {
  ПЕРИОДЫ,
  казнаЗаПериод,
  началоПериода,
  праймЗаПериод,
  снаряжение,
  хотелкиЗаПериод,
  явкаЗаПериод,
  type ПериодДней,
} from '@/lib/analytics'
import { ДНИ_НЕДЕЛИ, isoKey, parseKey } from '@/lib/schedule'
import { MAX_MOD, SLOTS } from '@/types'
import { plural } from '@/lib/util'

/**
 * Выбранный период живёт в модуле, а не в состоянии компонента.
 *
 * Раздел пересоздаётся при каждом уходе на другую вкладку, и период вместе с
 * ним: вернулся — получил тридцать дней вместо тех девяноста, что выбирал.
 * Хранить его в самом разделе значит забывать выбор без всякой причины.
 */
let выбранныйПериод: ПериодДней = 30

/** Русская десятичная запятая: 7.5 читалось бы как код. */
function дробь(число: number): string {
  return String(число).replace('.', ',')
}

/** Минуты словами: окно прайма «2 ч 8 мин», а не «128». */
function длительность(минут: number): string {
  const ч = Math.floor(минут / 60)
  const мин = Math.round(минут % 60)
  if (!ч) return `${мин} мин`
  if (!мин) return `${ч} ч`
  return `${ч} ч ${мин} мин`
}

/** «10.10» — день без года: год в сводке не читается. */
function деньКоротко(key: string): string {
  const d = parseKey(key)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** «2026-10» → «окт». */
function месяцКоротко(месяц: string): string {
  const названия = [
    'янв', 'фев', 'мар', 'апр', 'мая', 'июн',
    'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
  ]
  const номер = Number(месяц.slice(5, 7)) - 1
  return названия[номер] ?? месяц
}

export function SummaryView({ catalog }: { catalog: CatalogApi }) {
  const db = useDb()
  const { ownCharId } = useAccess()
  const [дней, setДней] = useState<ПериодДней>(выбранныйПериод)

  const выбрать = (новый: ПериодДней) => {
    выбранныйПериод = новый
    setДней(новый)
  }

  // Сегодня считается заново при смене базы: приложение могло висеть открытым
  // через полночь, и тогда «последние 30 дней» поехали бы на день назад.
  const сегодня = useMemo(() => isoKey(new Date()), [db])
  const сОт = началоПериода(дней, сегодня)

  const прайм = useMemo(() => праймЗаПериод(db, сОт, сегодня), [db, сОт, сегодня])
  const явка = useMemo(() => явкаЗаПериод(db, сОт, сегодня), [db, сОт, сегодня])
  const казна = useMemo(() => казнаЗаПериод(db, сОт), [db, сОт])
  const хотелки = useMemo(() => хотелкиЗаПериод(db, сОт), [db, сОт])
  const снаряжениеИтог = useMemo(() => снаряжение(db), [db])

  const подписьПериода = ПЕРИОДЫ.find((п) => п.дней === дней)?.подпись ?? ''

  const maxНедели = Math.max(1, ...прайм.поДнямНедели)
  const maxМесяца = Math.max(1, ...прайм.поМесяцам.map((м) => м.часов))

  // Свой персонаж: три цифры рядом, а не вперемешку с общими списками, где их
  // пришлось бы вылавливать глазами.
  const свой = ownCharId ? db.chars.find((c) => c.id === ownCharId) : undefined
  const моиПропуски =
    явка.праймов > 0 ? (явка.поПерсонажам.find((п) => п.charId === ownCharId)?.пропусков ?? 0) : null
  const мояГотовность = снаряжениеИтог.поПерсонажам.find((г) => г.charId === ownCharId)
  const мояКазна = казна.поЛюдям.find((д) => д.who === (свой?.name || ''))

  return (
    <section className="view">
      <div className="view-head">
        <h2>
          Сводка <span className="muted">за {подписьПериода}</span>
        </h2>
        <div className="view-actions">
          <div className="segmented" role="group" aria-label="Период">
            {ПЕРИОДЫ.map((п) => (
              <button
                key={п.дней}
                type="button"
                className={дней === п.дней ? 'on' : ''}
                onClick={() => выбрать(п.дней)}
              >
                {п.дней === 0 ? 'всё' : п.дней}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="sum-note">
        Праймы, выходные, отсутствия, передачи и закрытые хотелки хранятся с датами, и по ним
        считается любой период. Снаряжение и комплекты хранятся как текущее состояние — следа
        изменений в базе нет, поэтому такие плитки помечены «сейчас» и периодом не меняются.
      </p>

      <div className="sum-grid sum-grid-period">
        {/* ---------------------------------------------- расписание */}
        <article className="sum-card">
          <h3>Расписание</h3>
          <div className="sum-figure">
            <span className="sum-big">{дробь(прайм.часов)}</span>
            <span className="sum-unit">ч прайма за период</span>
          </div>
          {прайм.дней === 0 ? (
            <p className="hint">За этот период праймов не было.</p>
          ) : (
            <>
              <ul className="sum-lines">
                <li>
                  {прайм.дней} {plural(прайм.дней, 'день', 'дня', 'дней')} с праймом ·{' '}
                  {прайм.выходных} {plural(прайм.выходных, 'выходной', 'выходных', 'выходных')}
                </li>
                <li>окно в среднем {длительность(прайм.среднееОкно)}</li>
                {прайм.впереди > 0 && (
                  <li>впереди ещё {прайм.впереди} — в сумму не вошли</li>
                )}
              </ul>

              <div className="sum-sub-h">по дням недели</div>
              <div className="sum-bars sum-bars-week">
                {прайм.поДнямНедели.map((сколько, i) => (
                  <div key={i} className="sum-bar-cell" title={`${ДНИ_НЕДЕЛИ[i]}: ${сколько}`}>
                    {сколько > 0 && (
                      <div
                        className="sum-bar"
                        style={{ height: `${(сколько / maxНедели) * 100}%` }}
                      />
                    )}
                    <span className="sum-bar-n">{сколько || ''}</span>
                    <span className="sum-bar-l">{ДНИ_НЕДЕЛИ[i]}</span>
                  </div>
                ))}
              </div>

              {прайм.поМесяцам.length > 1 && (
                <>
                  <div className="sum-sub-h">часы по месяцам</div>
                  <div className="sum-bars sum-bars-month">
                    {прайм.поМесяцам.map((м) => (
                      <div
                        key={м.месяц}
                        className="sum-bar-cell"
                        title={`${месяцКоротко(м.месяц)}: ${дробь(м.часов)} ч`}
                      >
                        <div
                          className="sum-bar"
                          style={{ height: `${(м.часов / maxМесяца) * 100}%` }}
                        />
                        <span className="sum-bar-n">{дробь(м.часов)}</span>
                        <span className="sum-bar-l">{месяцКоротко(м.месяц)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </article>

        {/* --------------------------------------------------- явка */}
        <article className="sum-card">
          <h3>Сборы</h3>
          <div className="sum-figure">
            <span className="sum-big">
              {явка.полных} из {явка.праймов}
            </span>
            <span className="sum-unit">праймов собрались все</span>
          </div>
          {явка.праймов === 0 ? (
            <p className="hint">Назначенных праймов за период нет — считать нечего.</p>
          ) : (
            <>
              <ul className="sum-lines">
                <li>
                  в среднем приходило {дробь(явка.средняя)} из {db.chars.length}
                </li>
                <li>
                  неполных сборов {явка.датыНеполных.length} из {явка.праймов}
                </li>
              </ul>

              <div className="sum-sub-h">кто сколько пропустил</div>
              <ul className="sum-rows">
                {явка.поПерсонажам.map((п) => (
                  <li key={п.charId} className={п.пропусков > 0 ? 'warn' : ''}>
                    <span className="sum-row-name">{п.имя}</span>
                    <span className="sum-row-tail">
                      {п.пропусков > 0 ? `${п.пропусков} · ${п.доля}%` : 'ни разу'}
                    </span>
                  </li>
                ))}
              </ul>

              {явка.датыНеполных.length > 0 && (
                <>
                  <div className="sum-sub-h">дни, когда кто-то не был</div>
                  <ul className="sum-days">
                    {явка.датыНеполных.slice(0, 10).map((д) => (
                      <li key={д.день} title={д.отсутствуют.join(', ')}>
                        <span className="sum-day">{деньКоротко(д.день)}</span>
                        <span className="sum-day-who">{д.отсутствуют.join(', ')}</span>
                      </li>
                    ))}
                  </ul>
                  {явка.датыНеполных.length > 10 && (
                    <p className="hint">и ещё {явка.датыНеполных.length - 10}.</p>
                  )}
                </>
              )}
            </>
          )}
        </article>

        {/* ------------------------------------------------- казна */}
        <article className="sum-card">
          <h3>Казна</h3>
          <div className="sum-figure">
            <span className="sum-big">{казна.операций}</span>
            <span className="sum-unit">
              {plural(казна.операций, 'передача', 'передачи', 'передач')} за период
            </span>
          </div>
          {казна.операций === 0 ? (
            <p className="hint">
              Передач за период не записано.
              {казна.откуда ? ` Журнал начинается с ${деньКоротко(казна.откуда)}.` : ''}
            </p>
          ) : (
            <>
              <ul className="sum-lines">
                <li>
                  забрали {казна.забрали} · положили {казна.положили}
                </li>
                <li>{дробь(казна.вНеделю)} передачи в неделю</li>
              </ul>

              <div className="sum-sub-h">кто забрал больше</div>
              <ul className="sum-rows">
                {казна.поЛюдям.slice(0, 6).map((д) => (
                  <li key={д.who} className={д.разница < 0 ? 'warn' : ''}>
                    <span className="sum-row-name">{д.who}</span>
                    <span className="sum-row-tail">
                      {д.разница === 0
                        ? `${д.забрал} взял, ${д.положил} положил`
                        : `${д.разница > 0 ? 'отдал' : 'взял'} ${Math.abs(д.разница)}`}
                    </span>
                  </li>
                ))}
              </ul>

              {казна.топ.length > 0 && (
                <>
                  <div className="sum-sub-h">чаще всего разбирают</div>
                  <ul className="sum-rows">
                    {казна.топ.slice(0, 5).map((т) => (
                      <li key={т.itemId}>
                        <span className="sum-row-name">{catalog.nameOf(т.itemId)}</span>
                        <span className="sum-row-tail">
                          {т.count} {plural(т.count, 'раз', 'раза', 'раз')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
          {казна.обрезан && (
            <p className="sum-warn">
              Журнал хранит последние 500 передач, поэтому «всё время» по казне — это хвост, а не
              вся история{казна.откуда ? `: всё, что до ${деньКоротко(казна.откуда)}` : ''} не
              сохранилось.
            </p>
          )}
        </article>

        {/* ----------------------------------------------- хотелки */}
        <article className="sum-card">
          <h3>Хотелки</h3>
          <div className="sum-figure">
            <span className="sum-big">{хотелки.закрыто}</span>
            <span className="sum-unit">
              {plural(хотелки.закрыто, 'закрыта', 'закрыты', 'закрыто')} за период
            </span>
          </div>
          <ul className="sum-lines">
            <li>в работе {хотелки.активные}</li>
            <li>
              срочно {хотелки.поПриоритету[0]} · нужно {хотелки.поПриоритету[1]} · желательно{' '}
              {хотелки.поПриоритету[2]}
            </li>
          </ul>
          {хотелки.поИщущим.length > 0 && (
            <>
              <div className="sum-sub-h">кто ищет больше всего</div>
              <ul className="sum-rows">
                {хотелки.поИщущим.slice(0, 5).map((и) => (
                  <li key={и.кто}>
                    <span className="sum-row-name">{и.кто}</span>
                    <span className="sum-row-tail">
                      {и.сколько} {plural(и.сколько, 'штука', 'штуки', 'штук')}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </article>
      </div>

      {/* ------------------------------------------ текущее состояние */}
      <div className="sum-grid">
        <article className="sum-card">
          <h3>
            Готовность <span className="sum-mark">сейчас</span>
          </h3>
          {снаряжениеИтог.поПерсонажам.length === 0 ? (
            <p className="hint">Персонажей в пати нет.</p>
          ) : (
            <>
              <ul className="sum-rows sum-rows-bars">
                {снаряжениеИтог.поПерсонажам.map((г) => (
                  <li key={г.charId}>
                    <span className="sum-row-name">{г.имя}</span>
                    <span className="sum-bar-line">
                      <span
                        className="sum-bar-fill"
                        style={{ width: г.всего ? `${(г.занято / г.всего) * 100}%` : '0%' }}
                      />
                    </span>
                    <span className="sum-row-tail">
                      {г.занято}/{г.всего} · +{дробь(г.средняя)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="hint">
                Полоска — занятые слоты, справа средняя заточка из {MAX_MOD}.
              </p>
            </>
          )}
        </article>

        <article className="sum-card">
          <h3>
            Отставание <span className="sum-mark">сейчас</span>
          </h3>
          {снаряжениеИтог.отставание.length === 0 ? (
            <p className="hint">
              Расхождений в три и больше заточки нет: либо пати собрана одинаково, либо вещей
              слишком мало, чтобы сравнивать.
            </p>
          ) : (
            <>
              <ul className="sum-rows">
                {снаряжениеИтог.отставание.slice(0, 8).map((о, i) => (
                  <li key={i} className="warn">
                    <span className="sum-row-name">
                      {о.имя} — {слотЧитаемо(о.слот)}
                    </span>
                    <span className="sum-row-tail">
                      +{о.своя} против +{о.лучшая}
                    </span>
                  </li>
                ))}
              </ul>
              {снаряжениеИтог.отставание.length > 8 && (
                <p className="hint">
                  и ещё {снаряжениеИтог.отставание.length - 8} — всего{' '}
                  {снаряжениеИтог.отставание.length}.
                </p>
              )}
            </>
          )}
        </article>

        <article className="sum-card">
          <h3>
            Комплекты <span className="sum-mark">сейчас</span>
          </h3>
          {снаряжениеИтог.комплекты.length === 0 ? (
            <p className="hint">Комплектов в базе нет.</p>
          ) : (
            снаряжениеИтог.комплекты.map((к) => {
              const недособран = к.поЛюдям.filter((н) => н.надето > 0 && н.надето < к.всего)
              const собран = к.поЛюдям.filter((н) => н.надето === к.всего)
              return (
                <div key={к.set.id} className="sum-set">
                  <div className="sum-sub-h">
                    {к.set.name} · {к.всего} {plural(к.всего, 'часть', 'части', 'частей')}
                  </div>
                  {недособран.length > 0 ? (
                    <ul className="sum-rows">
                      {недособран.map((н) => (
                        <li key={н.charId}>
                          <span className="sum-row-name">{н.имя}</span>
                          <span className="sum-row-tail">
                            {н.надето} из {к.всего}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="hint">
                      {собран.length > 0
                        ? `Собран: ${собран.map((н) => н.имя).join(', ')}.`
                        : 'Ни у кого не собран.'}
                    </p>
                  )}
                </div>
              )
            })
          )}
        </article>
      </div>

      {/* ------------------------------------------------ свой герой */}
      {свой && (
        <article className="sum-card sum-card-own">
          <h3>
            {свой.name || 'Без имени'} <span className="sum-mark">мой персонаж</span>
          </h3>
          <div className="sum-own">
            {моиПропуски !== null && (
              <div className="sum-own-cell">
                <span className="sum-big small">
                  {моиПропуски} из {явка.праймов}
                </span>
                <span className="sum-unit">пропущено</span>
              </div>
            )}
            <div className="sum-own-cell">
              <span className="sum-big small">
                {мояГотовность?.занято ?? 0}/{мояГотовность?.всего ?? 0}
              </span>
              <span className="sum-unit">слотов занято</span>
            </div>
            <div className="sum-own-cell">
              <span className="sum-big small">+{дробь(мояГотовность?.средняя ?? 0)}</span>
              <span className="sum-unit">средняя заточка</span>
            </div>
            <div className="sum-own-cell">
              <span className="sum-big small">
                {мояКазна ? мояКазна.разница || 0 : 0}
              </span>
              <span className="sum-unit">
                {!мояКазна || мояКазна.разница === 0
                  ? 'в казне не участвовал'
                  : мояКазна.разница < 0
                    ? 'взял из казны'
                    : 'положил в казну'}
              </span>
            </div>
          </div>
        </article>
      )}

      {db.chars.length === 0 && (
        <div className="empty">
          <p>В пати пока нет персонажей.</p>
          <p className="hint">
            Как только они появятся, здесь станут видны сборы, заточка, комплекты и движение казны.
          </p>
        </div>
      )}
    </section>
  )
}

/** Ключ слота словами: «ring» в сводке читалось бы как ошибка. */
function слотЧитаемо(слот: string): string {
  return SLOTS[слот as keyof typeof SLOTS]?.label ?? слот
}