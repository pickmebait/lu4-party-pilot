import type { CSSProperties } from 'react'
import { PRIORITY_LABEL, type Priority } from '@/types'
import type { CatalogApi } from '@/lib/catalog'
import {
  можетВестиЦель,
  отметитьВсё,
  отметитьПредмет,
  отклонитьЦель,
  removeGoal,
  вернутьЦель,
  добытьВсё,
} from '@/lib/store'
import {
  закрытаВ,
  прогрессЦели,
  статусЦели,
  type Goal,
} from '@/lib/goals'
import { formatAgo } from '@/lib/util'
import { ItemIcon } from './ItemIcon'

/** Приоритет — не строчка текста, а цвет левой полосы карточки. */
const ЦВЕТ_ПРИОРИТЕТА: Record<Priority, string> = {
  1: '#e0705e',
  2: '#e0b45e',
  3: '#6f8fd0',
}

/**
 * Заголовок карточки.
 *
 * У цели из одного предмета он и есть название. У цели из нескольких — первый
 * предмет и счётчик остальных: перечислять пятнадцать в заголовке значит
 * сделать его в три строки, а человеку достаточно знать, с чего начать.
 */
export function заголовокЦели(цель: Goal, catalog: CatalogApi): string {
  const первый = цель.items[0]
  if (!первый) return 'Без предметов'
  const имя = catalog.nameOf(первый.itemId)
  return цель.items.length > 1
    ? `${имя} и ещё ${цель.items.length - 1}`
    : имя
}

/**
 * Карточка цели: приоритет, прогресс, список предметов и действия.
 *
 * Правка вынесена в отдельную кнопку: отметить предмет добытым — это одно
 * дело, а изменить требование цели — другое. Пока кнопки не было, опечатку
 * в заточке или лишний предмет можно было исправить только удалением цели
 * и заводом новой, а вместе с ней терялась отметка о добытом.
 */
export function GoalCard({
  цель,
  прогресс,
  для,
  заголовок,
  catalog,
  onEdit,
}: {
  цель: Goal
  прогресс: ReturnType<typeof прогрессЦели>
  для?: string
  заголовок: string
  catalog: CatalogApi
  onEdit: () => void
}) {
  const статус = статусЦели(цель)
  const моя = можетВестиЦель(цель)
  const закрытаВремя = закрытаВ(цель)
  // Выполненность берётся из статуса, а не считается снова: статусЦели уже
  // проверил все пункты, и спрашивать второй раз — значит пройти по ним
  // ещё раз ради одного и того же ответа.
  const всеГотовы = статус === 'выполнена'

  return (
    <article
      className={`goal-card ${статус === 'выполнена' ? 'done' : ''} ${цель.rejected ? 'rejected' : ''}`}
      style={{ '--приоритет': ЦВЕТ_ПРИОРИТЕТА[цель.priority] } as CSSProperties}
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
          <button
            className="btn tiny"
            title="Изменить приоритет, адресата, комментарий и список предметов"
            onClick={onEdit}
          >
            Изменить
          </button>
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
              onClick={() => добытьВсё(цель.id)}
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
