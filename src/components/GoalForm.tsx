import { MAX_MOD, PRIORITY_LABEL, type Priority } from '@/types'
import type { CatalogApi } from '@/lib/catalog'
import { useAccess } from '@/lib/access'
import { можетСоздаватьДля, useDb } from '@/lib/store'
import { plural } from '@/lib/util'
import { ItemIcon } from './ItemIcon'
import { МНОЖЕСТВЕННЫЙ_ПОТОЛОК } from './ItemPicker'

/** Предмет в форме цели: выбранная вещь и желаемая заточка. */
export interface Черновик {
  itemId: number
  mod: number | null
}

/** Общие поля цели — одни и те же при заведении и при правке. */
export interface Общее {
  priority: Priority
  forCharId: string
  note: string
}

/**
 * Форма цели: приоритет, адресат, комментарий и список предметов.
 *
 * Одна и та же форма заводит цель и правит уже заведённую. Разница только в
 * заголовке и подписи кнопки: поля у цели одни и те же, и вторая копия формы
 * разошлась бы с первой при первой же правке.
 */
export function GoalForm({
  пачка,
  общее,
  catalog,
  правка = false,
  onChange,
  onПачка,
  выбратьЗаново,
  onSubmit,
  onCancel,
}: {
  пачка: Черновик[]
  общее: Общее
  catalog: CatalogApi
  /** Это правка уже заведённой цели, а не создание новой. */
  правка?: boolean
  onChange: (о: Общее) => void
  onПачка: (п: Черновик[]) => void
  /** Открыть справочник: форма при этом остаётся на месте. */
  выбратьЗаново: () => void
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
            {правка
              ? 'Изменить цель'
              : `Одна цель на ${пачка.length} ${plural(пачка.length, 'предмет', 'предмета', 'предметов')}`}
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
            {/*
              Кнопка открывает справочник поверх формы, а не закрывает её:
              иначе при возврате из пикера пришлось бы заново вводить
              приоритет, адресата и комментарий.
            */}
            <button className="btn tiny" onClick={выбратьЗаново}>
              Выбрать заново
            </button>
          </div>

          <p className="hint">
            Заточка указывается на каждый предмет отдельно. Прочерк значит «любая»: «Кольцо
            Печати» и «Кольцо Печати +14» — разные цели, и вторая сильно дороже.
          </p>

          <ul className="goal-items goal-items-form">
            {пачка.map((часть, номер) => (
              // В цели может лежать один и тот же предмет дважды — например,
              // две пары перчаток, — поэтому номер в ключе обязателен.
              <li key={`${часть.itemId}-${номер}`}>
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

          {правка && (
            <p className="hint">
              Добытые предметы остаются добытыми, если вещь и заточка не менялись. Новая
              заточка — уже другое требование, и её придётся добывать заново.
            </p>
          )}
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
            {правка ? 'Сохранить' : 'Завести цель'}
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
