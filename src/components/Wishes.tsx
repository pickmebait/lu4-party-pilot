import { useEffect, useMemo, useState } from 'react'
import { MAX_MOD, PRIORITY_LABEL, type Priority, type Wish } from '@/types'
import type { CatalogApi } from '@/lib/catalog'
import { useAccess, useOwnCharName } from '@/lib/access'
import {
  addToWarehouse,
  addWishes,
  авторПравки,
  закрытьЦель,
  можетВестиЦель,
  можетСоздаватьДля,
  removeWish,
  useDb,
  формаОткрыта,
} from '@/lib/store'
import { formatAgo, plural } from '@/lib/util'
import { ItemPicker, matches, МНОЖЕСТВЕННЫЙ_ПОТОЛОК } from './ItemPicker'

/**
 * Четыре среза списка.
 *
 * «Выполненные» и «Завершённые» — не синонимы, хотя слова близки: первые
 * сделаны, вторые закрыты любым исходом, включая отказ. Того, кто задал цель
 * и потом передумал, интересно найти вместе с теми, кто закрыл её успехом, —
 * ради этого и второй срез.
 */
type Срез = 'активные' | 'все' | 'выполненные' | 'завершённые'

const СРЕЗЫ: { key: Срез; подпись: string }[] = [
  { key: 'активные', подпись: 'Активные' },
  { key: 'все', подпись: 'Все' },
  { key: 'выполненные', подпись: 'Выполненные' },
  { key: 'завершённые', подпись: 'Завершённые' },
]

/** Попадает ли цель в срез. */
function подходит(цель: Wish, срез: Срез): boolean {
  if (срез === 'все') return true
  if (срез === 'активные') return !цель.done && !цель.rejected
  if (срез === 'выполненные') return цель.done
  return цель.done || !!цель.rejected
}

/** Заготовка цели: предмет, его заточка и общие для пачки поля. */
interface Черновик {
  itemId: number
  mod: number | null
}
interface Общее {
  priority: Priority
  forCharId: string
  note: string
}

export function WishesView({ catalog }: { catalog: CatalogApi }) {
  const db = useDb()
  const { ownCharId, master } = useAccess()
  const имяСвоего = useOwnCharName()
  const [срез, setСрез] = useState<Срез>('активные')
  const [q, setQ] = useState('')
  const [picking, setPicking] = useState(false)
  const [пачка, setПачка] = useState<Черновик[] | null>(null)
  const [общее, setОбщее] = useState<Общее>({ priority: 2, forCharId: '', note: '' })

  // Черновик живёт в форме, а не в базе: пока он открыт, база извне не
  // подставляется, иначе собранный список рассыпался бы молча.
  useEffect(() => {
    if (!пачка) return
    формаОткрыта(true)
    return () => формаОткрыта(false)
  }, [!!пачка])

  const открыть = () => setPicking(true)

  const строки = useMemo(() => {
    const список = db.wishes
      .filter((цель) => подходит(цель, срез))
      .map((цель) => ({
        ...цель,
        name: catalog.nameOf(цель.itemId),
        grade: catalog.byId(цель.itemId)?.gradeName,
      }))
      .filter(
        (цель) =>
          matches(цель.name, q) ||
          matches(цель.seeker, q) ||
          matches(цель.forCharId ? (db.chars.find((c) => c.id === цель.forCharId)?.name ?? '') : '', q) ||
          matches(цель.note ?? '', q),
      )
    return список.sort((а, б) => {
      // Активные выше закрытых, но не в самом верху: иначе пятнадцать свежих
      // целей навсегда вытесняют то, что забыли закрыть.
      if (а.done !== б.done) return а.done ? 1 : -1
      if (!!а.rejected !== !!б.rejected) return а.rejected ? 1 : -1
      if (а.priority !== б.priority) return а.priority - б.priority
      return а.name.localeCompare(б.name, 'ru')
    })
  }, [db.wishes, db.chars, срез, q, catalog])

  const активных = db.wishes.filter((цель) => !цель.done && !цель.rejected).length

  const создать = () => {
    if (!пачка || пачка.length === 0) return
    addWishes(
      пачка.map((часть) => ({
        itemId: часть.itemId,
        mod: часть.mod ?? undefined,
        count: 1,
        priority: общее.priority,
        // Кто ищет — это тот, кто завёл цель. Спрашивать отдельно незачем:
        // он и так известен по токену, а пустое поле «кто ищет» в истории
        // целей читалось бы как «неизвестно».
        seeker: авторПравки(),
        forCharId: общее.forCharId || undefined,
        создатель: ownCharId ?? 'Мастер',
        note: общее.note.trim() || undefined,
      })),
    )
    setПачка(null)
    setОбщее({ priority: 2, forCharId: '', note: '' })
    setСрез('активные')
  }

  return (
    <section className="view">
      <div className="view-head">
        <h2>
          Цели <span className="muted">{активных} активных</span>
        </h2>
        <div className="view-actions">
          <div className="segmented" role="group" aria-label="Срез">
            {СРЕЗЫ.map((с) => (
              <button key={с.key} className={срез === с.key ? 'on' : ''} onClick={() => setСрез(с.key)}>
                {с.подпись}
              </button>
            ))}
          </div>
          <button className="btn primary" onClick={открыть}>
            + Цель
          </button>
        </div>
      </div>

      <p className="goal-note">
        {master
          ? 'Мастер-токен: цель можно завести для любого персонажа и закрыть любую.'
          : `Токен персонажа «${имяСвоего || 'без имени'}»: цели заводим для себя и закрыть можно только свои — чужие видны, но не трогаются.`}
      </p>

      <input
        className="input filter-wide"
        placeholder="Поиск по предмету, нику или комментарию…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {строки.length === 0 && (
        <div className="empty">
          <p>
            {срез === 'активные' ? 'Активных целей нет.' : 'В этом срезе пусто.'}
          </p>
          <p className="hint">
            Кнопка «+ Цель» открывает справочник, где предметы можно отмечать по одному и
            добавлять сразу пачкой — до {МНОЖЕСТВЕННЫЙ_ПОТОЛОК} штук. Затем задаются приоритет,
            персонаж и, по желанию, заточка с комментарием.
          </p>
        </div>
      )}

      <div className="wish-list">
        {строки.map((цель) => {
          const forChar = db.chars.find((c) => c.id === цель.forCharId)
          const моя = можетВестиЦель(цель)
          const закрыта = цель.done || !!цель.rejected
          return (
            <article
              key={цель.id}
              className={`wish ${закрыта ? 'done' : ''} ${цель.rejected ? 'rejected' : ''} p${цель.priority}`}
            >
              <label
                className="wish-check"
                title={
                  !моя
                    ? 'Закрыть цель может только её создатель или мастер'
                    : цель.done
                      ? 'Вернуть в активные'
                      : 'Отметить выполненной'
                }
              >
                <input
                  className="wish-box"
                  type="checkbox"
                  checked={цель.done}
                  disabled={!моя}
                  onChange={() => закрытьЦель(цель.id, цель.done ? 'активная' : 'выполнена')}
                />
              </label>
              <div className="wish-main">
                <div className="wish-title">
                  <span className="prio">{PRIORITY_LABEL[цель.priority]}</span>
                  <span className="name">{цель.name}</span>
                  {цель.mod !== undefined && <span className="chip mod">+{цель.mod}</span>}
                  {цель.count > 1 && <span className="chip">{цель.count} шт.</span>}
                  {цель.rejected && <span className="chip reject">отклонена</span>}
                </div>
                <div className="wish-meta">
                  <span>ищет: {цель.seeker || '—'}</span>
                  {forChar && <span>для: {forChar.name}</span>}
                  {цель.note && <span className="note">{цель.note}</span>}
                  {цель.done && цель.doneAt && (
                    <span className="muted">выполнено {formatAgo(цель.doneAt)}</span>
                  )}
                  {цель.rejected && цель.rejectedAt && (
                    <span className="muted">отклонено {formatAgo(цель.rejectedAt)}</span>
                  )}
                </div>
              </div>
              <div className="wish-tools">
                {моя && !закрыта && (
                  <>
                    <button
                      className="btn tiny"
                      title="Отметить выполненной и сразу положить в общую казну"
                      onClick={() => {
                        addToWarehouse(цель.itemId, цель.count)
                        закрытьЦель(цель.id, 'выполнена')
                      }}
                    >
                      Нашёл в казну
                    </button>
                    <button className="btn tiny" onClick={() => закрытьЦель(цель.id, 'выполнена')}>
                      Готово
                    </button>
                    <button
                      className="btn tiny"
                      title="Не сделали и делать не будем — цель уходит из активных"
                      onClick={() => закрытьЦель(цель.id, 'отклонена')}
                    >
                      Отклонить
                    </button>
                  </>
                )}
                {моя && закрыта && (
                  <button className="btn tiny" onClick={() => закрытьЦель(цель.id, 'активная')}>
                    Вернуть
                  </button>
                )}
                {моя && (
                  <button
                    className="icon-btn danger tiny"
                    title="Удалить цель"
                    onClick={() => removeWish(цель.id)}
                  >
                    🗑
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </div>

      {picking && (
        <ItemPicker
          catalog={catalog}
          title={`Что нужно? Отметь до ${МНОЖЕСТВЕННЫЙ_ПОТОЛОК} предметов`}
          onPick={() => undefined}
          onPickMany={(itemIds) => {
            setПачка(itemIds.map((itemId) => ({ itemId, mod: null })))
            setPicking(false)
            // Токен персонажа сразу получает единственного допустимого
            // адресата: показывать ему выбор «для кого» с чужими именами было
            // бы приглашением сделать то, что всё равно не сохранится.
            if (!master) {
              const свой = db.chars.find((c) => c.id === ownCharId)
              if (свой) setОбщее((о) => ({ ...о, forCharId: свой.id }))
            }
          }}
          onClose={() => setPicking(false)}
        />
      )}

      {пачка && (
        <ЦельФорма
          пачка={пачка}
          общее={общее}
          onChange={setОбщее}
          onПачка={setПачка}
          catalog={catalog}
          onSubmit={создать}
          onCancel={() => setПачка(null)}
        />
      )}
    </section>
  )
}

function ЦельФорма({
  пачка,
  общее,
  onChange,
  onПачка,
  catalog,
  onSubmit,
  onCancel,
}: {
  пачка: Черновик[]
  общее: Общее
  onChange: (о: Общее) => void
  onПачка: (п: Черновик[]) => void
  catalog: CatalogApi
  onSubmit: () => void
  onCancel: () => void
}) {
  const db = useDb()
  const { master, ownCharId } = useAccess()
  const свой = db.chars.find((c) => c.id === ownCharId)

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>
            Новых целей: {пачка.length}{' '}
            {plural(пачка.length, 'цель', 'цели', 'целей')}
          </h3>
          <button className="icon-btn" onClick={onCancel}>
            ✕
          </button>
        </div>

        <div className="form">
          <label>
            Приоритет
            <div className="segmented">
              {([1, 2, 3] as Priority[]).map((p) => (
                <button
                  key={p}
                  className={общее.priority === p ? 'on' : ''}
                  onClick={() => onChange({ ...общее, priority: p })}
                >
                  {PRIORITY_LABEL[p]}
                </button>
              ))}
            </div>
          </label>

          <label>
            Для кого
            <select
              className="input"
              value={общее.forCharId}
              disabled={!master}
              onChange={(e) => onChange({ ...общее, forCharId: e.target.value })}
            >
              <option value="">— не указан —</option>
              {db.chars
                .filter((c) => master || c.id === ownCharId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || 'Без имени'}
                  </option>
                ))}
            </select>
          </label>

          <label>
            Комментарий
            <input
              className="input"
              placeholder="например: с аукциона, к следующему прайму"
              value={общее.note}
              onChange={(e) => onChange({ ...общее, note: e.target.value })}
            />
          </label>

          <div className="label-row">
            <span>
              Предметы ({пачка.length} из {МНОЖЕСТВЕННЫЙ_ПОТОЛОК})
            </span>
            <button
              className="btn tiny"
              disabled={пачка.length >= МНОЖЕСТВЕННЫЙ_ПОТОЛОК}
              onClick={() => onПачка([])}
            >
              Выбрать заново
            </button>
          </div>

          <p className="hint">
            Заточка указывается на каждый предмет отдельно. Пусто значит «любая»: «Кольцо
            Печати» и «Кольцо Печати +14» — разные цели, и вторая сильно дороже.
          </p>

          <ul className="goal-items">
            {пачка.map((часть, номер) => (
              <li key={часть.itemId}>
                <span className="goal-item-name">{catalog.nameOf(часть.itemId)}</span>
                <input
                  className="input tiny-input"
                  inputMode="numeric"
                  placeholder="любая"
                  value={часть.mod ?? ''}
                  onChange={(e) => {
                    const цифры = e.target.value.replace(/[^\d]/g, '').slice(0, 2)
                    const мод = цифры === '' ? null : Math.min(MAX_MOD, Number(цифры))
                    onПачка(пачка.map((ч, i) => (i === номер ? { ...ч, mod: мод } : ч)))
                  }}
                />
                <button
                  className="icon-btn tiny"
                  title="Убрать из целей"
                  onClick={() => onПачка(пачка.filter((_, i) => i !== номер))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="form-actions">
          <button className="btn" onClick={onCancel}>
            Отмена
          </button>
          <button
            className="btn primary"
            disabled={пачка.length === 0 || !можетСоздаватьДля(общее.forCharId)}
            onClick={onSubmit}
          >
            Создать {пачка.length} {plural(пачка.length, 'цель', 'цели', 'целей')}
          </button>
        </div>

        {!master && !свой && (
          <p className="hint err-hint">
            Персонаж, которому выдан этот токен, не найден в базе — создать цель не для кого.
          </p>
        )}
      </div>
    </div>
  )
}
