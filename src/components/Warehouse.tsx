import { useMemo, useState } from 'react'
import type { CatalogApi } from '@/lib/catalog'
import {
  addToWarehouse,
  dropFromWarehouse,
  setWarehouseCount,
  takeFromWarehouse,
  useDb,
} from '@/lib/store'
import { formatAgo, formatStamp, plural } from '@/lib/util'
import { ItemPicker, gradeLabel, matches } from './ItemPicker'

export function WarehouseView({ catalog }: { catalog: CatalogApi }) {
  const db = useDb()
  const [q, setQ] = useState('')
  const [showLog, setShowLog] = useState(false)
  const [picking, setPicking] = useState(false)

  const rows = useMemo(() => {
    const list = db.warehouse.stacks
      .map((s) => ({ ...s, name: catalog.nameOf(s.itemId), grade: catalog.byId(s.itemId)?.grade }))
      .filter((s) => matches(s.name, q) || String(s.itemId) === q.trim())
    return list.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }, [db.warehouse.stacks, q, catalog])

  const totals = useMemo(
    () => ({
      kinds: db.warehouse.stacks.length,
      items: db.warehouse.stacks.reduce((a, s) => a + s.count, 0),
    }),
    [db.warehouse.stacks],
  )

  const history = useMemo(
    () =>
      [...db.warehouse.log]
        .filter((l) => matches(catalog.nameOf(l.itemId), q))
        .slice(0, 200),
    [db.warehouse.log, q, catalog],
  )

  return (
    <section className="view">
      <div className="view-head">
        <h2>
          Общая казна{' '}
          <span className="muted">
            {totals.kinds} {plural(totals.kinds, 'позиция', 'позиции', 'позиций')} ·{' '}
            {totals.items} шт.
          </span>
        </h2>
        <div className="view-actions">
          <button className="btn" onClick={() => setShowLog((v) => !v)}>
            {showLog ? 'Скрыть историю' : `История (${db.warehouse.log.length})`}
          </button>
          <button className="btn primary" onClick={() => setPicking(true)}>
            + Положить
          </button>
        </div>
      </div>

      <input
        className="input filter-wide"
        placeholder="Поиск по названию или id…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {rows.length === 0 && (
        <div className="empty">
          <p>Казна пуста.</p>
          <p className="hint">
            Кнопка «+ Положить» записывает предмет и сразу запоминает, кто его положил. Когда кто-то
            забирает вещь — жми «−», и запись появится в истории.
          </p>
        </div>
      )}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Предмет</th>
              <th className="num">Кол-во</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.itemId}>
                <td>
                  <div className="cell-title">
                    <span className={typeof s.grade === 'number' ? `chip grade g${s.grade}` : ''}>
                      {s.name}
                    </span>
                    {typeof s.grade === 'number' && s.grade > 0 && (
                      <span className="chip grade">{gradeLabel(s.grade)}</span>
                    )}
                  </div>
                  <div className="cell-id">#{s.itemId}</div>
                </td>
                <td className="num">
                  <div className="counter">
                    <button
                      className="icon-btn tiny"
                      title="Забрать одну штуку"
                      onClick={() => takeFromWarehouse(s.itemId, 1)}
                    >
                      −
                    </button>
                    <input
                      className="input tiny-input"
                      inputMode="numeric"
                      value={s.count}
                      onChange={(e) => setWarehouseCount(s.itemId, Number(e.target.value.replace(/\D/g, '')))}
                    />
                    <button
                      className="icon-btn tiny"
                      title="Положить одну штуку"
                      onClick={() => addToWarehouse(s.itemId, 1)}
                    >
                      +
                    </button>
                  </div>
                </td>
                <td className="right">
                  <button
                    className="icon-btn danger tiny"
                    title="Убрать позицию из казны"
                    onClick={() => dropFromWarehouse(s.itemId)}
                  >
                    🗑
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showLog && (
        <div className="log-panel">
          <h3>История операций</h3>
          {history.length === 0 ? (
            <p className="hint">Пока пусто.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Кто</th>
                  <th>Предмет</th>
                  <th className="num">Кол-во</th>
                  <th>Когда</th>
                </tr>
              </thead>
              <tbody>
                {history.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <span className={`chip ${l.dir === 'in' ? 'in' : 'out'}`}>
                        {l.dir === 'in' ? ' положил' : ' забрал'}
                      </span>{' '}
                      {l.who}
                    </td>
                    <td>{catalog.nameOf(l.itemId)}</td>
                    <td className="num">{l.count}</td>
                    <td className="muted" title={formatStamp(l.ts)}>
                      {formatAgo(l.ts)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {picking && (
        <ItemPicker
          catalog={catalog}
          title="Что кладём в казну?"
          onPick={(itemId) => addToWarehouse(itemId, 1)}
          onClose={() => setPicking(false)}
        />
      )}
    </section>
  )
}
