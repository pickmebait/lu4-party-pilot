import { useEffect, useMemo, useState } from 'react'
import { MAX_MOD, PRIORITY_LABEL, type Priority } from '@/types'
import type { CatalogApi } from '@/lib/catalog'
import { useAccess, useOwnCharName } from '@/lib/access'
import {
  addGoal,
  авторПравки,
  addToWarehouse,
  можетВестиЦель,
  можетСоздаватьДля,
  отклонитьЦель,
  отметитьВсё,
  отметитьПредмет,
  removeGoal,
  useDb,
  формаОткрыта,
  вернутьЦель,
} from '@/lib/store'
import { закрытаВ, прогрессЦели, статусЦели, цельВыполнена, type Goal } from '@/lib/goals'
import { formatAgo, plural } from '@/lib/util'
import { ItemIcon } from './ItemIcon'
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

function попадает(цель: Goal, срез: Срез): boolean {
  const статус = статусЦели(цель)
  if (срез === 'все') return true
  if (срез === 'активные') return статус === 'активная'
  if (срез === 'выполненные') return статус === 'выполнена'
  return статус !== 'активная'
}

/** Приоритет — не строчка текста, а цвет левой полосы карточки. */
const ЦВЕТ_ПРИОРИТЕТА: Record<Priority, string> = {
  1: '#e0705e',
  2: '#e0b45e',
  3: '#6f8fd0',
}

interface Черновик {
  itemId: number
  mod: number | null
}
interface Общее {
  priority: Priority
  forCharId: string
  note: string
}

export function GoalsView({ catalog }: { catalog: CatalogApi }) {
  const db = useDb()
  const { ownCharId, master } = useAccess()
  const имяСвоего = useOwnCharName()
  const [срез, setСрез] = useState<Срез>('активные')
  const [q, setQ] = useState('')
  const [picking, setPicking] = useState(false)
  const [пачка, setПачка] = useState<Черновик[] | null>(null)
  const [общее, setОбщее] = useState<Общее>({ priority: 2, forCharId: '', note: '' })

  useEffect(() => {
    if (!пачка) return
    формаОткрыта(true)
    return () => формаОткрыта(false)
  }, [!!пачка])

  const карточки = useMemo(() => {
    const список = db.goals
      .filter((цель) => попадает(цель, срез))
      .map((цель) => ({
        цель,
        прогресс: прогрессЦели(цель),
        для: db.chars.find((c) => c.id === цель.forCharId),
        заголовок: заголовокЦели(цель, catalog),
      }))
      .filter(
        ({ цель, заголовок, для }) =>
          matches(заголовок, q) ||
          matches(цель.seeker, q) ||
          matches(для?.name ?? '', q) ||
          matches(цель.note ?? '', q),
      )
    return список.sort((а, б) => {
      // Активные выше закрытых, но не в самом верху: иначе пятнадцать свежих
      // целей навсегда вытесняют то, что забыли закрыть.
      if (а.прогресс.процент !== б.прогресс.процент) return б.прогресс.процент - а.прогресс.процент
      if (а.цель.priority !== б.цель.priority) return а.цель.priority - б.цель.priority
      return заголовокЦели(а.цель, catalog).localeCompare(заголовокЦели(б.цель, catalog), 'ru')
    })
  }, [db.goals, db.chars, срез, q, catalog])

  const активных = db.goals.filter((цель) => статусЦели(цель) === 'активная').length

  const создать = () => {
    if (!пачка || пачка.length === 0) return
    addGoal({
      items: пачка.map((часть) => ({
        itemId: часть.itemId,
        mod: часть.mod ?? undefined,
        count: 1,
        готово: false,
      })),
      priority: общее.priority,
      // Кто ищет — это тот, кто завёл цель. Спрашивать отдельно незачем: он и
      // так известен по токену, а пустое поле «кто ищет» в истории целей
      // читалось бы как «неизвестно».
      seeker: авторПравки(),
      forCharId: общее.forCharId || undefined,
      создатель: ownCharId ?? 'Мастер',
      note: общее.note.trim() || undefined,
    })
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
          <button className="btn primary" onClick={() => setPicking(true)}>
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

      {карточки.length === 0 && (
        <div className="empty">
          <p>{срез === 'активные' ? 'Активных целей нет.' : 'В этом срезе пусто.'}</p>
          <p className="hint">
            Кнопка «+ Цель» открывает справочник, где предметы отмечаются по одному или сразу
            пачкой — до {МНОЖЕСТВЕННЫЙ_ПОТОЛОК} штук. Они становятся одной целью с общим
            прогрессом: добыл часть — отметь галочку, и полоса сдвинется.
          </p>
        </div>
      )}

      <div className="goal-grid">
        {карточки.map(({ цель, прогресс, для, заголовок }) => (
          <GoalCard
            key={цель.id}
            цель={цель}
            прогресс={прогресс}
            для={для?.name}
            заголовок={заголовок}
            catalog={catalog}
          />
        ))}
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
          catalog={catalog}
          onChange={setОбщее}
          onПачка={setПачка}
          onSubmit={создать}
          onCancel={() => setПачка(null)}
        />
      )}
    </section>
  )
}

/**
 * Заголовок карточки.
 *
 * У цели из одного предмета он и есть название. У цели из нескольких — первый
 * предмет и счётчик остальных: перечислять пятнадцать в заголовке значит
 * сделать его в три строки, а человеку достаточно знать, с чего начать.
 */
function заголовокЦели(цель: Goal, catalog: CatalogApi): string {
  const первый = цель.items[0]
  if (!первый) return 'Без предметов'
  const имя = catalog.nameOf(первый.itemId)
  return цель.items.length > 1
    ? `${имя} и ещё ${цель.items.length - 1}`
    : имя
}

function GoalCard({
  цель,
  прогресс,
  для,
  заголовок,
  catalog,
}: {
  цель: Goal
  прогресс: ReturnType<typeof прогрессЦели>
  для?: string
  заголовок: string
  catalog: CatalogApi
}) {
  const статус = статусЦели(цель)
  const моя = можетВестиЦель(цель)
  const закрытаВремя = закрытаВ(цель)
  const всеГотовы = цельВыполнена(цель)

  return (
    <article
      className={`goal-card ${статус === 'выполнена' ? 'done' : ''} ${цель.rejected ? 'rejected' : ''}`}
      style={{ '--приоритет': ЦВЕТ_ПРИОРИТЕТА[цель.priority] } as React.CSSProperties}
    >
      <header className="goal-head">
        <span className="prio">{PRIORITY_LABEL[цель.priority]}</span>
        {для && <span className="goal-for">{для}</span>}
        {цель.rejected && <span className="chip reject">отклонена</span>}
      </header>

      <h3 className="goal-title" title={заголовок}>
        {заголовок}
      </h3>

      {/*
        Прогресс-полоса вместо «3 из 5»: одно число в процентах читается
        быстрее, а рядом «2 из 5» отвечает, сколько именно осталось.
      */}
      <div className="goal-progress" title={`Добыто ${прогресс.готово} из ${прогресс.всего}`}>
        <div className="goal-bar">
          <span style={{ width: `${прогресс.процент}%` }} />
        </div>
        <span className="goal-pct">{прогресс.процент}%</span>
        <span className="goal-count">
          {прогресс.готово} из {прогресс.всего}
        </span>
      </div>

      <ul className="goal-items">
        {цель.items.map((предмет, номер) => (
          <li key={`${предмет.itemId}-${номер}`} className={предмет.готово ? 'got' : ''}>
            <label className="goal-check" title={моя ? (предмет.готово ? 'Вернуть в работу' : 'Отметить добытым') : 'Закрывает цель только её создатель или мастер'}>
              <input
                type="checkbox"
                checked={предмет.готово}
                disabled={!моя || !!цель.rejected}
                onChange={() => отметитьПредмет(цель.id, номер, !предмет.готово)}
              />
            </label>
            <ItemIcon item={catalog.byId(предмет.itemId)} name={catalog.nameOf(предмет.itemId)} size={22} />
            <span className="goal-item-name">{catalog.nameOf(предмет.itemId)}</span>
            {/*
              Заточка показывается тем же блоком, что и в разделе персонажей:
              здесь она требование к вещи, а не состояние, поэтому кнопок «−» и
              «+» нет — только число, которое и сравнивают между целями.
            */}
            <span className="cell-mod readonly" title="Заточка, если нужна конкретная">
              <span className={`mod-value${предмет.mod ? ' on' : ''}`}>
                {предмет.mod ? `+${предмет.mod}` : '—'}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <div className="goal-meta">
        <span>ищет: {цель.seeker || '—'}</span>
        {цель.note && <span className="note">{цель.note}</span>}
        {закрытаВремя && (
          <span className="muted">
            {цель.rejected ? 'отклонено' : 'выполнено'} {formatAgo(закрытаВремя)}
          </span>
        )}
      </div>

      {моя && (
        <footer className="goal-tools">
          {!всеГотовы && !цель.rejected && (
            <button className="btn tiny" onClick={() => отклонитьЦель(цель.id)}>
              Отклонить
            </button>
          )}
          {цель.rejected && (
            <button className="btn tiny" onClick={() => вернутьЦель(цель.id)}>
              Вернуть в работу
            </button>
          )}
          {всеГотовы && !цель.rejected && (
            <button className="btn tiny" onClick={() => отметитьВсё(цель.id, false)}>
              Открыть заново
            </button>
          )}
          {!всеГотовы && (
            <button
              className="btn tiny primary-soft"
              title="Отметить добытым всё сразу и сложить в общую казну"
              onClick={() => {
                for (const предмет of цель.items) {
                  if (!предмет.готово) addToWarehouse(предмет.itemId, предмет.count)
                }
                отметитьВсё(цель.id, true)
              }}
            >
              Всё добыто
            </button>
          )}
          <button
            className="icon-btn danger tiny"
            title="Удалить цель"
            onClick={() => removeGoal(цель.id)}
          >
            🗑
          </button>
        </footer>
      )}
    </article>
  )
}

function ЦельФорма({
  пачка,
  общее,
  catalog,
  onChange,
  onПачка,
  onSubmit,
  onCancel,
}: {
  пачка: Черновик[]
  общее: Общее
  catalog: CatalogApi
  onChange: (о: Общее) => void
  onПачка: (п: Черновик[]) => void
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
            Одна цель на {пачка.length} {plural(пачка.length, 'предмет', 'предмета', 'предметов')}
          </h3>
          <button className="icon-btn" onClick={onCancel}>
            ✕
          </button>
        </div>

        <div className="form">
          <label>
            Приоритет
            <div className="segmented">
              {([1, 2, 3] as Priority[]).map((п) => (
                <button
                  key={п}
                  className={общее.priority === п ? 'on' : ''}
                  onClick={() => onChange({ ...общее, priority: п })}
                >
                  {PRIORITY_LABEL[п]}
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
            Заточка указывается на каждый предмет отдельно. Прочерк значит «любая»: «Кольцо
            Печати» и «Кольцо Печати +14» — разные цели, и вторая сильно дороже.
          </p>

          <ul className="goal-items goal-items-form">
            {пачка.map((часть, номер) => (
              <li key={часть.itemId}>
                <ItemIcon item={catalog.byId(часть.itemId)} name={catalog.nameOf(часть.itemId)} size={22} />
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
                  title="Убрать из цели"
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
            Завести цель
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