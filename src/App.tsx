import { useEffect, useMemo, useState } from 'react'
import { CharsView } from './components/Chars'
import { Login } from './components/Login'
import { PaletteBar } from './components/PaletteBar'
import { SyncBar } from './components/SyncBar'
import { WarehouseView } from './components/Warehouse'
import { GoalsView } from './components/Goals'
import { ScheduleView } from './components/Schedule'
import { SummaryView } from './components/Summary'
import { Tagline } from './components/Tagline'
import { APP_NAME } from './lib/brand'
import { startCatalogLoad, useCatalog } from './lib/catalog'
import { computeSummary, usedItemIds, type Summary } from './lib/derived'
import { openSession } from './lib/api'
import { migrateGear, signOut, updateSession, useDb, useSession } from './lib/store'
import type { Db } from './types'
import { applyPalette, loadPalette } from './lib/palette'
import { plural } from './lib/util'
import { primeHours } from './lib/schedule'

startCatalogLoad()

// Палитру ставим до первой отрисовки, иначе на тёмном фоне мелькнёт светлый.
applyPalette(loadPalette())

type Tab = 'summary' | 'chars' | 'schedule' | 'warehouse' | 'wishes'

const TABS: { key: Tab; label: string }[] = [
  { key: 'summary', label: 'Сводка' },
  { key: 'chars', label: 'Персонажи' },
  { key: 'schedule', label: 'Расписание' },
  { key: 'warehouse', label: 'Общая казна' },
  { key: 'wishes', label: 'Цели' },
]

/**
 * Цифры под названием вкладки.
 *
 * Раньше сводка стояла отдельной строкой под вкладками: чтобы увидеть,
 * сколько занято слотов или лежит в казне, надо было бросить взгляд ниже и
 * вправо. Теперь каждая цифра стоит под своим разделом — там, где её и
 * ждут, потому что вкладка уже открыта именно за этим.
 */
function заметка(ключ: Tab, s: Summary, db: Db): string {
  switch (ключ) {
    case 'summary':
      return s.chars === 0
        ? 'пусто'
        : `${s.chars} ${plural(s.chars, 'персонаж', 'персонажа', 'персонажей')}`
    case 'chars':
      return `${s.gearSlots.filled}/${s.gearSlots.total} слотов`
    case 'schedule': {
      const часов = primeHours(db.schedule)
      const ушли = db.chars.reduce((a, c) => a + Object.keys(c.away ?? {}).length, 0)
      if (часов === 0) return ушли ? `нет прайма, нет ${ушли}` : 'пусто'
      return `${часов} ${plural(часов, 'час', 'часа', 'часов')}${ушли ? `, нет ${ушли}` : ''}`
    }
    case 'warehouse': {
      // Комплекты переехали в казну, и цифра собранного идёт под ней же.
      const казна = s.warehouseKinds === 0
        ? 'пусто'
        : `${s.warehouseKinds} ${plural(s.warehouseKinds, 'позиция', 'позиции', 'позиций')} · ${s.warehouseItems} шт.`
      return s.setsTotal === 0
        ? казна
        : `${казна} · компл. ${s.setsDone} из ${s.setsTotal}`
    }
    case 'wishes':
      return `${s.goalsOpen} ${plural(s.goalsOpen, 'активная', 'активные', 'активных')}`
  }
}

export default function App() {
  const db = useDb()
  const session = useSession()
  const [tab, setTab] = useState<Tab>('chars')

  const catalog = useCatalog(useMemo(() => usedItemIds(db), [db]), db.customNames)

  // Считаем сводку до раннего выхода, чтобы порядок хуков не зависел от сессии.
  const sum = computeSummary(db)

  /*
   * Миграция снаряжения, которой нужен справочник.
   *
   * Запускается только мастер: токен персонажа не имеет права сохранять
   * чужие ветки, а миграция правит сразу всех. Ждём загрузки items.json —
   * до неё не отличить кастет от другого оружия.
   *
   * db в зависимостях намеренно: после загрузки серверной базы её надо
   * прогнать ещё раз, а повторный вызов на уже исправленной базе ничего
   * не сохраняет.
   */
  const items = catalog.catalog?.items
  useEffect(() => {
    if (session?.role !== 'master' || !items?.length) return
    migrateGear(items)
  }, [items, db, session?.role])

  /*
   * Сохранённая сессия проверяется, а не принимается на веру.
   *
   * Токен мог быть перевыпущен, отозван или достаться из другой пати — и
   * приложение молча открывалось с чужим токеном: все запросы отбивались, а
   * до экрана входа было не добраться. Теперь отказ по токену выбрасывает
   * сессию и открывает вход.
   *
   * Отказ по связи сессию не трогает: человек просто без интернета, и
   * выбрасывать его из пати на этом основании нельзя.
   */
  useEffect(() => {
    if (!session) return
    let отменено = false

    openSession(session.apiUrl, session.token).then((res) => {
      if (отменено) return
      if (res.ok || res.статус !== 401) {
        /*
         * Название пати подтягиваем вместе с проверкой.
         *
         * Сесия хранит копию названия, и без этого переименование было видно
         * только в той вкладке, где его сделали: переименовал на телефоне —
         * на компьютере по-прежнему старое имя, пока не выйдешь и не войдёшь
         * заново. Сервер ответил свежим именем, значит и в сессии должно
         * стоять свежее.
         *
         * Только когда оно разное: обновление создаёт новый объект сессии,
         * эффект перезапустится и пошёл бы по второму кругу.
         */
        if (res.ok && res.value.name && res.value.name !== session.name) {
          updateSession({ name: res.value.name })
        }
        return
      }
      signOut()
    })

    return () => {
      отменено = true
    }
  }, [session])

  // Без токена пати приложением пользоваться нельзя: вся база живёт на сервере.
  if (!session) return <Login onDone={() => undefined} />

  return (
    <div className={`app${tab === 'schedule' ? ' app-schedule' : ''}`}>
      <header className="top">
        <div className="brand">
          <span className="logo">⚔</span>
          <div>
            <h1>{APP_NAME}</h1>
            <Tagline />
          </div>
          <PaletteBar />
        </div>
        <SyncBar />
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
            <span className="tab-label">{t.label}</span>
            <span className="tab-note">{заметка(t.key, sum, db)}</span>
          </button>
        ))}
      </nav>

      <main>
        {tab === 'summary' && <SummaryView catalog={catalog} />}
        {tab === 'chars' && <CharsView catalog={catalog} />}
        {tab === 'schedule' && <ScheduleView />}
        {tab === 'warehouse' && <WarehouseView catalog={catalog} />}
        {tab === 'wishes' && <GoalsView catalog={catalog} />}
      </main>

      <footer className="foot">
        <span>
          Данные лежат в этом браузере. Общая база пати — на сервере, доступ по
          токену.
        </span>
      </footer>
    </div>
  )
}
