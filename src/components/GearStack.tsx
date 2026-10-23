import {
  MAX_WEAPON_SETS,
  SLOT_GROUPS,
  SLOTS,
  WEAPON_SLOTS,
  setLabel,
  type Char,
  type SlotEntry,
  type SlotKey,
  type WeaponSet,
} from '@/types'
import type { CatalogApi } from '@/lib/catalog'
import { weaponSetsOf } from '@/lib/slots'
import {
  addWeaponSet,
  removeWeaponSet,
  setSlotMod,
  unequipItem,
  type Branch,
} from '@/lib/store'
import { ItemIcon } from './ItemIcon'
import { IconClose } from './Icons'

export function GearStack({
  ветка,
  слоты,
  допНаборы = [],
  catalog,
  правый,
  onPick,
}: {
  ветка: Branch
  слоты: Char['slots']
  /** Второй и третий наборы оружия: первый уже лежит в слотах. */
  допНаборы?: readonly WeaponSet[]
  catalog: CatalogApi
  /** Можно ли править эту ветку. У чужого персонажа — только смотреть. */
  правый: boolean
  onPick: (target: Branch, slot: SlotKey, index: number) => void
}) {
  const наборы = weaponSetsOf(слоты, допНаборы)
  const основа: Branch = { charId: ветка.charId, subId: ветка.subId }

  return (
    <div className="gear-stack">
      {SLOT_GROUPS.flatMap((group) => {
        if (group.key === 'weapon') {
          return наборы.map((набор, i) => {
            const веткаНабора: Branch =
              i === 0 ? основа : { ...основа, weaponSet: i }
            return (
              <section
                key={`weapon-${i}`}
                className={`stack-row stack-weapon${i > 0 ? ' extra' : ''}`}
              >
                <div className="stack-head">
                  <h4>
                    {наборы.length > 1 ? `Набор оружия ${i + 1}` : 'Оружие'}
                  </h4>
                  {правый && (
                    <div className="stack-actions">
                      {i === наборы.length - 1 && наборы.length < MAX_WEAPON_SETS && (
                        <button
                          type="button"
                          className="btn tiny"
                          title="Добавить ещё один набор оружия"
                          onClick={() => addWeaponSet(основа)}
                        >
                          Добавить набор
                        </button>
                      )}
                      {наборы.length > 1 && (
                        <button
                          type="button"
                          className="btn tiny danger"
                          title={`Удалить набор оружия ${i + 1}`}
                          onClick={() => removeWeaponSet(основа, i)}
                        >
                          Удалить набор
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="stack-slots">
                  {WEAPON_SLOTS.map((key) => (
                    <SlotCells
                      key={key}
                      ветка={веткаНабора}
                      cells={набор[key]}
                      catalog={catalog}
                      slot={key}
                      правый={правый}
                      onPick={(index) => onPick(веткаНабора, key, index)}
                    />
                  ))}
                </div>
              </section>
            )
          })
        }

        return (
          <section key={group.key} className={`stack-row stack-${group.key}`}>
            <h4>{group.label}</h4>
            <div className="stack-slots">
              {group.slots.map((key) => (
                <SlotCells
                  key={key}
                  ветка={основа}
                  cells={слоты[key] ?? []}
                  catalog={catalog}
                  slot={key}
                  правый={правый}
                  onPick={(index) => onPick(основа, key, index)}
                />
              ))}
            </div>
          </section>
        )
      })}
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
  cells,
  catalog,
  slot,
  правый,
  onPick,
}: {
  ветка: Branch
  cells: readonly (SlotEntry | null)[]
  catalog: CatalogApi
  slot: SlotKey
  правый: boolean
  onPick: (index: number) => void
}) {
  const def = SLOTS[slot]
  const arr = cells

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
        const редкие = item?.rareEffects?.length
          ? item.rareEffects
          : item?.rareEffect
            ? [item.rareEffect]
            : []
        const активныеБонусы = (item?.enchantBonuses ?? []).filter((б) => mod >= б.mod)

        /*
         * Вторая ячейка пары — призрак. У парного и двуручного оружия,
         * а также у цельной брони на экране две ячейки, но предмет один.
         * Вторая ячейка только показывает, что место занято: без SA,
         * редкого эффекта, заточки и кнопок, иначе она выглядит как
         * отдельная вещь, которой нет.
         */
        const ghost = entry.spans === true

        return (
          <div
            key={i}
            className={`gear-cell filled ${
              gradeCss !== null ? `g${gradeCss}` : ''
            } ${entry.spans ? 'spans' : ''}${ghost ? ' ghost' : ''}`}
            title={
              ghost
                ? `${def.label}: ${name} · занимает два слота`
                : [
                    `${def.label}: ${name}`,
                    grade ? `ранг ${grade}` : '',
                    item ? setLabel(item) : '',
                    `№${entry.itemId}`,
                    entry.mod ? `заточка +${entry.mod}` : '',
                    entry.sa ? `SA: ${entry.sa}` : '',
                    entry.sa && item?.saCommon?.description
                      ? `общее для всех SA: ${item.saCommon.description}`
                      : '',
                    ...активныеБонусы.map((б) => `с +${б.mod}: ${б.description}`),
                    entry.rare
                      ? `редкий эффект: ${редкие
                          .map((э) => [э.name, э.description].filter(Boolean).join(': '))
                          .join('; ')}`
                      : '',
                    entry.spans ? 'занимает два слота' : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')
            }
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
            {/* Выбранные свойства видны метками: без них непонятно, что
                SA и редкий эффект действительно записались. На второй
                ячейке пары этих меток быть не должно. */}
            {!ghost && (entry.sa || entry.rare || активныеБонусы.length > 0) && (
              <span className="cell-effects">
                {entry.sa && (
                  <span
                    className="cell-effect"
                    title={`SA: ${entry.sa}${
                      item?.saCommon?.description
                        ? ` · общее: ${item.saCommon.description}`
                        : ''
                    }`}
                  >
                    {entry.sa}
                  </span>
                )}
                {entry.rare && (
                  <span
                    className="cell-effect rare"
                    title={
                      редкие.length
                        ? `Редкий эффект: ${редкие
                            .map((э) => [э.name, э.description].filter(Boolean).join(': '))
                            .join('; ')}`
                        : 'Редкий эффект'
                    }
                  >
                    R
                  </span>
                )}
                {активныеБонусы.map((б, j) => (
                  <span
                    className="cell-effect bonus"
                    key={j}
                    title={`Бонус заточки +${б.mod}: ${б.description}`}
                  >
                    +{б.mod}
                  </span>
                ))}
              </span>
            )}

            {/*
              Заточка — одной строкой: сначала число, справа кнопки. Стоит
              перед снятием, а само снятие появляется при наведении на
              ячейку, чтобы крестик не висел на каждой вещи постоянно.
            */}
            {ghost ? (
              <span className="cell-ghost-mark" title="Предмет занимает два слота">
                2 слота
              </span>
            ) : (
              <div className="cell-enchant">
                <span className={`mod-value${mod > 0 ? ' on' : ''}`}>+{mod}</span>
                {/* Кнопки — только своей вещи: чужую заточка не трогает. */}
                {правый && (
                  <>
                    <button
                      className="mod-btn"
                      onClick={() => setSlotMod(ветка, slot, i, mod + 1)}
                      title="Добавить заточку на 1"
                    >
                      +
                    </button>
                    <button
                      className="mod-btn"
                      onClick={() => setSlotMod(ветка, slot, i, mod - 1)}
                      title="Убавить заточку на 1"
                    >
                      −
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Снятие — по наведению на ячейку, но место под него оставлено
                всегда: иначе название прыгало бы при каждом касании. */}
            {правый && !ghost && (
              <button
                className="cell-remove"
                title="Снять"
                onClick={() => unequipItem(ветка, slot, i)}
              >
                <IconClose />
              </button>
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
