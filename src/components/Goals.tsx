import { useEffect, useMemo, useState } from 'react'
import type { CatalogApi } from '@/lib/catalog'
import { useAccess, useOwnCharName } from '@/lib/access'
import {
  addGoal,
  авторПравки,
  updateGoal,
  useDb,
  формаОткрыта,
} from '@/lib/store'
import { прогрессЦели, статусЦели, type Goal } from '@/lib/goals'
import { ItemPicker, matches, МНОЖЕСТВЕННЫЙ_ПОТОЛОК } from './ItemPicker'
import { GoalCard, заголовокЦели } from './GoalCard'
import { GoalForm, type Общее, type Черновик } from './GoalForm'

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

/** Общие поля новой цели: средний приоритет, без адресата и комментария. */
function пустоеОбщее(): Общее {
  return { priority: 2, forCharId: '', note: '' }
}

/**
 * Черновики из нового набора предметов.
 *
 * Заточка уже выбранных предметов сохраняется: человек, который заново
 * открыл справочник, чтобы добавить одну вещь, не должен заново вводить
 * заточки у всех остальных.
 */
function черновикиИзВыбора(ids: number[], прежние: Черновик[]): Черновик[] {
  const остаток = [...прежние]
  return ids.map((itemId) => {
    const найден = остаток.findIndex((часть) => часть.itemId === itemId)
    return найден >= 0 ? остаток.splice(найден, 1)[0] : { itemId, mod: null }
  })
}

export function GoalsView({ catalog }: { catalog: CatalogApi }) {
  const db = useDb()
  const { ownCharId, master } = useAccess()
  const имяСвоего = useOwnCharName()
  const [срез, setСрез] = useState<Срез>('активные')
  const [q, setQ] = useState('')
  const [picking, setPicking] = useState(false)
  const [пачка, setПачка] = useState<Черновик[] | null>(null)
  const [общее, setОбщее] = useState<Общее>(пустоеОбщее)
  /** Цель, которую сейчас правят. null — форма заводит новую. */
  const [правка, setПравка] = useState<Goal | null>(null)

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
      // Порядок: чем ближе к готово, тем выше. Сортировать надо по убыванию
      // процента, но не только по нему: у половины целей процент нулевой, и
      // одна приоритетная среди них не должна тонуть в толпе нулевых.
      if (а.прогресс.процент !== б.прогресс.процент) return б.прогресс.процент - а.прогресс.процент
      if (а.цель.priority !== б.цель.priority) return а.цель.priority - б.цель.priority
      // Название уже посчитано при разборе списка: повторный вызов в
      // компараторе спросил бы у справочника имя столько раз, сколько
      // сравнений сортировки, то есть O(n log n) лишних обращений.
      return а.заголовок.localeCompare(б.заголовок, 'ru')
    })
  }, [db.goals, db.chars, срез, q, catalog])

  const активных = db.goals.filter((цель) => статусЦели(цель) === 'активная').length

  const закрытьФорму = () => {
    setПачка(null)
    setПравка(null)
    setОбщее(пустоеОбщее())
  }

  const открытьСоздание = () => {
    setПравка(null)
    setПачка(null)
    setPicking(true)
  }

  /*
   * Правка цели.
   *
   * В форму кладётся снимок цели: пока она открыта, база не подменяется
   * (форма отмечена открытой), поэтому снимок и текущая запись совпадают.
   */
  const изменить = (цель: Goal) => {
    setПравка(цель)
    setПачка(
      цель.items.map((предмет) => ({
        itemId: предмет.itemId,
        mod: предмет.mod ?? null,
      })),
    )
    setОбщее({
      priority: цель.priority,
      forCharId: цель.forCharId ?? '',
      note: цель.note ?? '',
    })
  }

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
    закрытьФорму()
    setСрез('активные')
  }

  const сохранить = () => {
    if (!правка || !пачка || пачка.length === 0) return
    updateGoal(правка.id, {
      priority: общее.priority,
      forCharId: общее.forCharId || undefined,
      note: общее.note,
      items: пачка.map((часть) => ({
        itemId: часть.itemId,
        mod: часть.mod ?? undefined,
      })),
    })
    закрытьФорму()
  }

  /*
   * Справочник открывается поверх формы, а не вместо неё.
   *
   * Раньше форма закрывалась, и при возврате из справочника приоритет,
   * адресат и комментарий оказывались пустыми — их приходилось вводить
   * заново. Теперь форма остаётся под пикером и дожидается нового набора.
   * Порядок в разметке важен: у обоих окон один z-index, и пикер должен
   * идти вторым, иначе форма перекроет его своим затемнением.
   */
  const выбратьЗаново = () => setPicking(true)

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
          <button className="btn primary" onClick={открытьСоздание}>
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
            onEdit={() => изменить(цель)}
          />
        ))}
      </div>

      {пачка && (
        <GoalForm
          пачка={пачка}
          общее={общее}
          catalog={catalog}
          правка={!!правка}
          onChange={setОбщее}
          onПачка={setПачка}
          выбратьЗаново={выбратьЗаново}
          onSubmit={правка ? сохранить : создать}
          onCancel={закрытьФорму}
        />
      )}

      {/* Пикер идёт после формы: у обоих окон один z-index, и кто позже в
          разметке, тот и сверху. */}
      {picking && (
        <ItemPicker
          catalog={catalog}
          title={
            правка
              ? 'Список предметов цели'
              : `Что нужно? Отметь до ${МНОЖЕСТВЕННЫЙ_ПОТОЛОК} предметов`
          }
          multi={пачка?.map((часть) => часть.itemId)}
          manyLabel={правка ? 'Сохранить выбор' : undefined}
          onPick={() => undefined}
          onPickMany={(itemIds) => {
            setПачка((прежняя) => черновикиИзВыбора(itemIds, прежняя ?? []))
            setPicking(false)
            // Токен персонажа сразу получает единственного допустимого
            // адресата: показывать ему выбор «для кого» с чужими именами было
            // бы приглашением сделать то, что всё равно не сохранится.
            // При правке адресат уже выбран и менять его не надо.
            if (!master && !правка) {
              const свой = db.chars.find((c) => c.id === ownCharId)
              if (свой) setОбщее((о) => ({ ...о, forCharId: свой.id }))
            }
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </section>
  )
}
