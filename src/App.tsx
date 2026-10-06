import { useMemo, useState } from 'react'
import { CharsView } from './components/Chars'
import { SetsView } from './components/Sets'
import { SyncBar } from './components/SyncBar'
import { WarehouseView } from './components/Warehouse'
import { WishesView } from './components/Wishes'
import { startCatalogLoad, useCatalog } from './lib/catalog'
import { computeSummary, usedItemIds } from './lib/derived'
import { useDb } from './lib/store'
import { plural } from './lib/util'

startCatalogLoad()

type Tab = 'chars' | 'warehouse' | 'wishes' | 'sets'

const TABS: { key: Tab; label: string }[] = [
  { key: 'chars', label: 'Персонажи' },
  { key: 'warehouse', label: 'Общая казна' },
  { key: 'wishes', label: 'Хотелки' },
  { key: 'sets', label: 'Комплекты' },
]

export default function App() {
  const db = useDb()
  const [tab, setTab] = useState<Tab>('chars')

  const catalog = useCatalog(useMemo(() => usedItemIds(db), [db]), db.customNames)
  const sum = computeSummary(db)

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo">⚔</span>
          <div>
            <h1>Party Pilot</h1>
            <p className="tag">экипировка пати · общая казна · хотелки</p>
          </div>
        </div>
        <SyncBar catalog={catalog} />
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
            {t.label}
            {t.key === 'chars' && sum.chars > 0 && <span className="badge">{sum.chars}</span>}
            {t.key === 'wishes' && sum.wishesOpen > 0 && (
              <span className="badge accent">{sum.wishesOpen}</span>
            )}
            {t.key === 'sets' && sum.setsDone > 0 && (
              <span className="badge">
                {sum.setsDone}/{sum.setsTotal}
              </span>
            )}
          </button>
        ))}
      </nav>

      {sum.chars > 0 && (
        <div className="statbar">
          <span>
            Слоты: <b>{sum.gearSlots.filled}</b> из {sum.gearSlots.total}
          </span>
          <span>
            Казна: <b>{sum.warehouseKinds}</b> {plural(sum.warehouseKinds, 'позиция', 'позиции', 'позиций')} /{' '}
            {sum.warehouseItems} шт.
          </span>
          <span>
            Хотелки: <b>{sum.wishesOpen}</b> активных
          </span>
          <span>
            Комплекты: <b>{sum.setsDone}</b> из {sum.setsTotal}
          </span>
        </div>
      )}

      <main>
        {tab === 'chars' && <CharsView catalog={catalog} />}
        {tab === 'warehouse' && <WarehouseView catalog={catalog} />}
        {tab === 'wishes' && <WishesView catalog={catalog} />}
        {tab === 'sets' && <SetsView catalog={catalog} />}
      </main>

      <footer className="foot">
        <span>Данные лежат в этом браузере. Общая база — файл data/data.json в репозитории.</span>
      </footer>
    </div>
  )
}
