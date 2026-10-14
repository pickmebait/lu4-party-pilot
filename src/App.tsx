import { useMemo, useState } from 'react'
import { CharsView } from './components/Chars'
import { Login } from './components/Login'
import { PaletteBar } from './components/PaletteBar'
import { SetsView } from './components/Sets'
import { SyncBar } from './components/SyncBar'
import { WarehouseView } from './components/Warehouse'
import { WishesView } from './components/Wishes'
import { ScheduleView } from './components/Schedule'
import { Tagline } from './components/Tagline'
import { APP_NAME } from './lib/brand'
import { startCatalogLoad, useCatalog } from './lib/catalog'
import { computeSummary, usedItemIds, type Summary } from './lib/derived'
import { useDb, useSession } from './lib/store'
import type { Db } from './types'
import { applyPalette, loadPalette } from './lib/palette'
import { plural } from './lib/util'

startCatalogLoad()

// Палитру ставим до первой отрисовки, иначе на тёмном фоне мелькнёт светлый.
applyPalette(loadPalette())

type Tab = 'chars' | 'schedule' | 'warehouse' | 'wishes' | 'sets'

const TABS: { key: Tab; label: string }[] = [
  { key: 'chars', label: 'Персонажи' },
  { key: 'schedule', label: 'Расписание' },
  { key: 'warehouse', label: 'Общая казна' },
  { key: 'wishes', label: 'Хотелки' },
  { key: 'sets', label: 'Комплекты' },
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
    case 'chars':
      return `${s.gearSlots.filled}/${s.gearSlots.total} слотов`
    case 'schedule': {
      const дней = Object.keys(db.schedule.prime).length + db.schedule.offs.length
      if (дней === 0) return 'пусто'
      const ушли = db.chars.reduce((a, c) => a + Object.keys(c.away ?? {}).length, 0)
      return `${дней} ${plural(дней, 'день', 'дня', 'дней')}${ушли ? `, нет ${ушли}` : ''}`
    }
    case 'warehouse':
      return s.warehouseKinds === 0
        ? 'пусто'
        : `${s.warehouseKinds} ${plural(s.warehouseKinds, 'позиция', 'позиции', 'позиций')} · ${s.warehouseItems} шт.`
    case 'wishes':
      return `${s.wishesOpen} ${plural(s.wishesOpen, 'активная', 'активные', 'активных')}`
    case 'sets':
      return `${s.setsDone} из ${s.setsTotal}`
  }
}

export default function App() {
  const db = useDb()
  const session = useSession()
  const [tab, setTab] = useState<Tab>('chars')

  const catalog = useCatalog(useMemo(() => usedItemIds(db), [db]), db.customNames)

  // Считаем сводку до раннего выхода, чтобы порядок хуков не зависел от сессии.
  const sum = computeSummary(db)

  // Без токена пати приложением пользоваться нельзя: вся база живёт на сервере.
  if (!session) return <Login onDone={() => undefined} />

  return (
    <div className="app">
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
        {tab === 'chars' && <CharsView catalog={catalog} />}
        {tab === 'schedule' && <ScheduleView />}
        {tab === 'warehouse' && <WarehouseView catalog={catalog} />}
        {tab === 'wishes' && <WishesView catalog={catalog} />}
        {tab === 'sets' && <SetsView catalog={catalog} />}
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
