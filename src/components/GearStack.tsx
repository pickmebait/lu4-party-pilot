import { MAX_MOD, SLOT_GROUPS, SLOTS, gradeCode, gradeLabel, type Char, type SlotKey } from '@/types'
import type { CatalogApi } from '@/lib/catalog'
import { setSlotMod, unequipItem, type Branch } from '@/lib/store'
import { ItemIcon } from './ItemIcon'
import { IconClose } from './Icons'

/**
 * Снаряжение персонажа в карточке: три группы, в каждой ячейки столбиком.
 *
 * Блоки идут друг под другом, а не справа друг от друга: каждый блок
 * занимает всю ширину карточки, поэтому ячейка может быть шире и название
 * предмета помещается целиком. В экран влезает вся пати, а не один с
 * половиной герой.
 *
 * Внутри блока ячейки тоже стоят друг под другом — так выглядит персонаж
 * целиком, и карточка получается узкой.
 *
 * Порядок групп задан в SLOT_GROUPS: оружие, броня, бижутерия.
 */
export function GearStack({
  ветка,
  слоты,
  catalog,
  onPick,
}: {
  ветка: Branch
  слоты: Char['slots']
  catalog: CatalogApi
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
 * Обёртки .gear-slot и .gear-cells разворачиваются в ячейки через
 * display: contents — благодаря этому ячейки разных слотов становятся
 * соседями сетки, у брони пять ячеек в столбик, у бижутерии тоже пять, и
 * пары не рвутся.
 */
function SlotCells({
  ветка,
  слоты,
  catalog,
  slot,
  onPick,
}: {
  ветка: Branch
  слоты: Char['slots']
  catalog: CatalogApi
  slot: SlotKey
  onPick: (index: number) => void
}) {
  const def = SLOTS[slot]
  const arr = слоты[slot] ?? []

  return (
    <div className="gear-slot">
      <div className="gear-cells">
        {arr.map((entry, i) => {
          const name = entry ? catalog.nameOf(entry.itemId) : ''

          if (!entry) {
            return (
              <button
                key={i}
                className="gear-cell void"
                title={`${def.label}: пусто`}
                onClick={() => onPick(i)}
              >
                +
              </button>
            )
          }

          const item = catalog.byId(entry.itemId)
          const grade = item?.gradeName
          const gradeCss = gradeCode(grade)
          const mod = entry.mod ?? 0

          return (
            <div
              key={i}
              className={`gear-cell filled ${
                gradeCss !== null ? `g${gradeCss}` : ''
              } ${entry.spans ? 'spans' : ''}`}
              title={[
                `${def.label}: ${name}`,
                grade ? `ранг ${grade}` : '',
                `№${entry.itemId}`,
                entry.mod ? `заточка +${entry.mod}` : '',
                entry.spans ? 'занимает два слота' : '',
                item?.twoHanded ? 'двуручное' : '',
                item?.dual ? 'дуальное' : '',
                item?.fullbody ? 'цельная броня' : '',
                item?.weaponClass,
                typeof item?.atkPhys === 'number' ? `физ. АТК ${item.atkPhys}` : '',
                typeof item?.atkMag === 'number' ? `маг. АТК ${item.atkMag}` : '',
                typeof item?.physDef === 'number' ? `физ. ЗАЩ ${item.physDef}` : '',
                typeof item?.mDef === 'number' ? `маг. ЗАЩ ${item.mDef}` : '',
                item?.set,
              ]
                .filter(Boolean)
                .join(' · ')}
            >
              {/*
                Всё в одну строку: иконка, ранг, название, счётчик заточки.
                Раньше ранг и заточка стояли под названием, и ячейка была
                вдвое выше — карточка не помещалась в экран по высоте.
              */}
              <button className="cell-main" onClick={() => onPick(i)}>
                <span className="cell-icon">
                  <ItemIcon item={item} name={name} size={24} />
                </span>
                {grade && <span className="chip grade">{gradeLabel(grade)}</span>}
                {entry.spans && <span className="chip span">2</span>}
                <span className="cell-name">{name}</span>
              </button>

              {/*
                Заточка всегда на виду: в ячейке двенадцать вещей, спрятать
                её под наведение — значит забыть про неё и упустить
                перезаточку перед походом. Кнопки стоят отдельными элементами
                от .cell-main, потому что кнопка внутри кнопки браузером не
                разбирается, а нажатие на + открывало бы пикер предмета.
              */}
              <div className="cell-mod" title={`Заточка от 0 до ${MAX_MOD}`}>
                <button
                  className="mod-btn"
                  disabled={mod <= 0}
                  onClick={() => setSlotMod(ветка, slot, i, mod - 1)}
                  title="Убавить заточку на 1"
                >
                  −
                </button>
                <span className={`mod-value${mod > 0 ? ' on' : ''}`}>+{mod}</span>
                <button
                  className="mod-btn"
                  disabled={mod >= MAX_MOD}
                  onClick={() => setSlotMod(ветка, slot, i, mod + 1)}
                  title="Добавить заточку на 1"
                >
                  +
                </button>
              </div>

              {/*
                Снять вещь. Кнопка в правом верхнем углу, по наведению и
                только на заполненной ячейке: у пустой и так понятно, что
                снимать нечего.

                Место под неё зарезервировано в .cell-main постоянно, а не
                только при наведении: иначе наведение сдвигало бы счётчик
                заточки и накрывало его — а нажать на + нужно как раз для
                того, ради чего ячейку и наводят.
              */}
              <div className="cell-tools">
                <button
                  className="icon-btn tiny danger"
                  title={entry.spans ? 'Снять с обоих слотов' : 'Снять'}
                  onClick={() => unequipItem(ветка, slot, i)}
                >
                  <IconClose />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}