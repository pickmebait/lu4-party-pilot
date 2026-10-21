import { SLOT_GROUPS, SLOTS, type Char, type SlotKey } from '@/types'
import type { CatalogApi } from '@/lib/catalog'
import { setSlotMod, unequipItem, type Branch } from '@/lib/store'
import { ItemIcon } from './ItemIcon'
import { IconClose } from './Icons'

export function GearStack({
  ветка,
  слоты,
  catalog,
  правый,
  onPick,
}: {
  ветка: Branch
  слоты: Char['slots']
  catalog: CatalogApi
  /** Можно ли править эту ветку. У чужого персонажа — только смотреть. */
  правый: boolean
  onPick: (target: Branch, slot: SlotKey, index: number) => void
}) {
  return (
    <div className="gear-stack">
      {SLOT_GROUPS.map((group) => (
        <section key={group.key} className={`stack-row stack-${group.key}`}>
          <h4>{group.label}</h4>
          <div className="stack-slots">
            {group.slots.map((key) => (
              <SlotCells
                key={key}
                ветка={ветка}
                слоты={слоты}
                catalog={catalog}
                slot={key}
                правый={правый}
                onPick={(index) => onPick(ветка, key, index)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

/**
 * Ячейки одного слота: у серёг и колец их по две, у остальных по одной.
 *
 * Обёртка разворачивается в ячейки через display: contents — благодаря этому
 * ячейки разных слотов становятся соседями сетки, у брони пять ячеек в
 * столбик, у бижутерии тоже пять, и пары не рвутся.
 */
function SlotCells({
  ветка,
  слоты,
  catalog,
  slot,
  правый,
  onPick,
}: {
  ветка: Branch
  слоты: Char['slots']
  catalog: CatalogApi
  slot: SlotKey
  правый: boolean
  onPick: (index: number) => void
}) {
  const def = SLOTS[slot]
  const arr = слоты[slot] ?? []

  return (
    <div className="gear-slot">
      {arr.map((entry, i) => {
        if (!entry) {
          /*
           * Пустая ячейка — не кнопка. У чужого персонажа она просто не
           * нажимается, а в форме правки открывает пикер напрямую: пикер —
           * тот же клик по месту, что был и раньше, но без накладных расходов
           * на понятие «выбрать пустую ячейку».
           */
          if (!правый) {
            return (
              <div key={i} className="gear-cell void ro" title={`${def.label}: пусто`}>
                +
              </div>
            )
          }
          return (
            <button
              key={i}
              className="gear-cell void"
              title={`${def.label}: выбрать предмет`}
              onClick={() => onPick(i)}
            >
              +
            </button>
          )
        }

        const item = catalog.byId(entry.itemId)
        const name = catalog.nameOf(entry.itemId)
        const grade = item?.gradeName
        const gradeCss = gradeCode(grade)
        const mod = entry.mod ?? 0

        /*
         * Парная копия в левой руке — призрак. У парного и двуручного
         * оружия на экране две ячейки, но предмет один, и вторая пара
         * кнопок с заточкой означала бы вторую вещь, которой нет:
         * снять заточку из левой руки и надеть правую отдельно нельзя,
         * поэтому управление только справа, а слева — метка «занимает
         * оба слота».
         */
        const ghost = slot === 'lhand' && entry.spans === true

        return (
          <div
            key={i}
            className={`gear-cell filled ${
              gradeCss !== null ? `g${gradeCss}` : ''
            } ${entry.spans ? 'spans' : ''}${ghost ? ' ghost' : ''}`}
            title={[
              `${def.label}: ${name}`,
              grade ? `ранг ${grade}` : '',
              item?.set,
              `№${entry.itemId}`,
              entry.mod ? `заточка +${entry.mod}` : '',
              entry.spans ? 'занимает два слота' : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          >
            {/*
              Иконка берётся из справочника, а не из названия: двенадцать
              одинаковых иконок на ткани в ячейке одинаково бесполезны, и
              текстура — единственное, что их различает.
            */}
            <div className="cell-icon">
              <ItemIcon item={item} name={name} />
            </div>
            <span className="cell-name">{name}</span>
            {/*
              Заточка всегда на виду: в ячейке двенадцать вещей, и спрятанная
              в подсказке цифра затирается — человек управляет снаряжением
              глазами, а не по памяти.

              У парной копии заточки нет: она принадлежит правой половине,
              и второй счётчик означал бы вторую вещь, которой нет, — вместо
              него метка «оба».
            */}
            {ghost ? (
              <span className="cell-ghost-mark" title="Предмет занимает оба слота">
                оба
              </span>
            ) : (
              <div className="cell-mod">
                <span className={`mod-value${mod > 0 ? ' on' : ''}`}>+{mod}</span>
              </div>
            )}

            {/*
              Кнопки снятия и управления заточкой. Без них пришлось бы сначала
              выбирать предмет, а потом правильно нажимать на стрелочки —
              два разных жеста там, где хватило бы одного.
            */}
            {правый && !ghost && (
              <div className="cell-tools">
                <button
                  className="mod-btn"
                  onClick={() => setSlotMod(ветка, slot, i, mod - 1)}
                  title="Убавить заточку на 1"
                >
                  −
                </button>
                <button
                  className="mod-btn"
                  onClick={() => setSlotMod(ветка, slot, i, mod + 1)}
                  title="Добавить заточку на 1"
                >
                  +
                </button>
                <button
                  className="icon-btn tiny danger"
                  title="Снять"
                  onClick={() => unequipItem(ветка, slot, i)}
                >
                  <IconClose />
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Числовой код грейда для цвета рамки, либо null если грейда нет. */
function gradeCode(grade?: string): number | null {
  if (!grade) return null
  const codes: Record<string, number> = {
    NG: 0,
    D: 1,
    C: 2,
    B: 3,
    A: 4,
    S: 5,
  }
  return codes[grade] ?? null
}
