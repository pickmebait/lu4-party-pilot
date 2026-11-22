import { useState, type ReactNode } from 'react'
import {
  MAX_MOD,
  affiliationLabel,
  gradeCode,
  type Char,
  type SlotEntry,
  type SlotKey,
} from '@/types'
import type { CatalogApi } from '@/lib/catalog'
import type { Branch } from '@/lib/store'
import { armorSetSlots, armorSetsOf, weaponSetSlots, weaponSetsOf } from '@/lib/slots'
import { РОЛЬ_ПОДПИСЬ, roleOfClass, type Роль } from '@/lib/roles'
import {
  discordLabel,
  discordLink,
  phoneLink,
  telegramLabel,
  telegramLink,
} from '@/lib/contacts'
import { ItemIcon } from './ItemIcon'
import { useПерсонаж } from '@/lib/useChar'
import { useДействияПерсонажа } from '@/lib/useCharActions'
import { CharDialogs } from './CharDialogs'
import { IconDiscord, IconPhone, IconTelegram, IconUser } from './Icons'
import { PaChip } from './PaChip'

/**
 * Персонаж строкой — второй вид раздела.
 *
 * Карточка показывает персонажа целиком, но из-за этого в экран влезает
 * один с половиной герой: чтобы сравнить двоих, приходится прокручивать
 * вбок. Здесь наоборот — вся пати по вертикали, по одной строке на
 * персонажа, и видно сразу, у кого что надето и где не хватает.
 *
 * Строка — не лента иконок, а таблица. Двенадцать слотов стоят на своих
 * местах: шлем под шлемом, кольцо под кольцом. Раньше пустые ячейки
 * пропускались, и у одного персонажа двенадцать значков шли подряд, у
 * другого — девять: сравнить по вертикали было нельзя. Теперь пустая
 * ячейка остаётся на месте и в просмотре показывает прочерк, а не плюс:
 * плюс выглядит действием, которого у чужого персонажа нет.
 *
 * Второй набор оружия и брони не добавляет колонок, а переключается
 * кнопкой в счётчике: иначе броня и бижутерия уезжали вправо, и общая
 * вертикаль ломалась. Какой набор показан, видно по подписи кнопки.
 *
 * Роль выводится из класса, как в сводке: отдельного поля в базе нет, и
 * при смене профессии роль должна поехать за ней сама.
 */

interface СлотМатрицы {
  key: SlotKey
  /** Номер ячейки внутри слота: у серёг и колец их по две. */
  index: number
  short: string
  label: string
}

interface ГруппаМатрицы {
  key: 'weapon' | 'armor' | 'jewelry'
  label: string
  slots: СлотМатрицы[]
}

/**
 * Двенадцать колонок снаряжения в том порядке, в каком они сравниваются.
 *
 * Это не SLOT_GROUPS из справочника: там слоты перечислены для выбора
 * предмета, а здесь важен порядок ячеек и короткие подписи, которые
 * помещаются в 34 пикселя.
 */
const ГРУППЫ_МАТРИЦЫ: ГруппаМатрицы[] = [
  {
    key: 'weapon',
    label: 'Оружие',
    slots: [
      { key: 'rhand', index: 0, short: 'Пр.', label: 'Правая рука' },
      { key: 'lhand', index: 0, short: 'Лев.', label: 'Левая рука' },
    ],
  },
  {
    key: 'armor',
    label: 'Броня',
    slots: [
      { key: 'head', index: 0, short: 'Шлем', label: 'Шлем' },
      { key: 'chest', index: 0, short: 'Верх', label: 'Верх' },
      { key: 'legs', index: 0, short: 'Низ', label: 'Низ' },
      { key: 'gloves', index: 0, short: 'Перч.', label: 'Перчатки' },
      { key: 'feet', index: 0, short: 'Боты', label: 'Ботинки' },
    ],
  },
  {
    key: 'jewelry',
    label: 'Бижутерия',
    slots: [
      { key: 'neck', index: 0, short: 'Ожер.', label: 'Ожерелье' },
      { key: 'ear', index: 0, short: 'Сер. 1', label: 'Серьга 1' },
      { key: 'ear', index: 1, short: 'Сер. 2', label: 'Серьга 2' },
      { key: 'ring', index: 0, short: 'Кол. 1', label: 'Кольцо 1' },
      { key: 'ring', index: 1, short: 'Кол. 2', label: 'Кольцо 2' },
    ],
  },
]

/** Класс роли для цвета точки. Ключи ролей — из сводки. */
const КЛАСС_РОЛИ: Record<Роль, string> = {
  танк: 'tank',
  хил: 'heal',
  бард: 'bard',
  баф: 'buff',
  ДД: 'dd',
  'без роли': 'none',
}

/**
 * Шапка матрицы: одна на весь список, поэтому живёт отдельно от строки.
 *
 * Подписи групп и слотов повторяют сетку строки один в один: колонки
 * обязаны совпасть, иначе таблица читается как набор значков.
 */
export function CharRowHead() {
  return (
    <div className="mx-head">
      <div className="mx-h mx-h-id">Персонаж</div>
      <div className="mx-h">Роль</div>
      <div className="mx-h">Класс · ур.</div>
      <div className="mx-h mx-h-gear">
        <div className="mx-gear-head">
          {ГРУППЫ_МАТРИЦЫ.map((group) => (
            <div key={group.key} className={`mx-group ${group.key}`}>
              <div className="mx-group-label">{group.label}</div>
              <div className="mx-slots">
                {group.slots.map((slot) => (
                  <span
                    key={`${slot.key}-${slot.index}`}
                    className="mx-slot-label"
                    title={slot.label}
                  >
                    {slot.short}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mx-h">Слоты</div>
      <div className="mx-h">Связь</div>
      <div className="mx-h">ПА</div>
    </div>
  )
}

/** Подпись под матрицей: что значат прочерк, заточка и переключатель. */
export function CharRowFoot() {
  return (
    <div className="mx-foot">
      <span className="mx-legend">
        <span>
          <b>—</b> пусто
        </span>
        <span>
          <b>+</b> надеть
        </span>
        <span>
          <b>+12</b> заточка
        </span>
        <span>наборы — переключателем в строке</span>
      </span>
      <span>роль — производная от класса</span>
    </div>
  )
}

interface СтрокаСвязи {
  ключ: string
  подпись: string
  значение: string
  ссылка?: string
  иконка: ReactNode
}

/**
 * Контакты теми же правилами, что и в карточке: телефон — tel:, телеграм и
 * дискорд — ссылкой на профиль. Имя остаётся подписью без ссылки.
 *
 * Здесь они сведены к значкам: в таблице ширина считается по колонкам, а
 * раскрытый список контактов открывается щелчком по имени.
 */
function строкиСвязи(char: Char): СтрокаСвязи[] {
  const контакты = char.contacts
  if (!контакты) return []

  const строки: СтрокаСвязи[] = []

  const имя = контакты.realName?.trim() ?? ''
  if (имя) {
    строки.push({
      ключ: 'realName',
      подпись: 'Имя',
      значение: имя,
      иконка: <IconUser size={11} />,
    })
  }

  const телефон = контакты.phone?.trim() ?? ''
  const телефонСсылка = телефон ? phoneLink(телефон) : null
  if (телефон && телефонСсылка) {
    строки.push({
      ключ: 'phone',
      подпись: 'Телефон',
      значение: телефон,
      ссылка: телефонСсылка,
      иконка: <IconPhone size={11} />,
    })
  }

  const телеграм = контакты.telegram?.trim() ?? ''
  const телеграмСсылка = телеграм ? telegramLink(телеграм) : null
  if (телеграм && телеграмСсылка) {
    строки.push({
      ключ: 'telegram',
      подпись: 'Телеграм',
      значение: telegramLabel(телеграм),
      ссылка: телеграмСсылка,
      иконка: <IconTelegram size={11} />,
    })
  }

  const дискорд = контакты.discord?.trim() ?? ''
  const дискордСсылка = дискорд ? discordLink(дискорд) : null
  if (дискорд && дискордСсылка) {
    строки.push({
      ключ: 'discord',
      подпись: 'Дискорд',
      значение: discordLabel(дискорд),
      ссылка: дискордСсылка,
      иконка: <IconDiscord size={11} />,
    })
  }

  return строки
}

export function CharRow({
  char,
  catalog,
  onPick,
}: {
  char: Char
  catalog: CatalogApi
  onPick: (ветка: Branch, slot: SlotKey, index: number) => void
}) {
  // Как и на карточке: ветка, права и счётчик слотов выводит общий хук.
  const {
    сабы,
    саб,
    выбратьСаб: setВыбранный,
    ветка,
    слоты,
    допНаборы,
    допБроня,
    cls,
    level,
    правый,
    свой,
    счётчик,
  } = useПерсонаж(char)
  const наборы = weaponSetsOf(слоты, допНаборы)
  const броня = armorSetsOf(слоты, допБроня)
  const занято = счётчик.занято
  const всего = счётчик.всего

  /*
   * Наборы переключаются по кругу, а не выбираются из списка: их не больше
   * трёх, и кнопка в счётчике должна занимать одну строку. Если у саба
   * наборов меньше, остаток от деления не даст выйти за край.
   */
  const [выбранныйНабор, setВыбранныйНабор] = useState(0)
  const [выбраннаяБроня, setВыбраннаяБроня] = useState(0)
  const номерОружия = выбранныйНабор % наборы.length
  const номерБрони = выбраннаяБроня % броня.length
  const наборОружия = наборы[номерОружия]
  const наборБрони = броня[номерБрони]

  const роль = roleOfClass(cls)
  const связи = строкиСвязи(char)

  // Правка, контакты и подтверждения — те же действия, что и у карточки:
  // разметка шапки своя, а последствия нажатий общие.
  const действия = useДействияПерсонажа(char, саб, setВыбранный)

  return (
    <article className={`char-row${свой ? ' own' : ''}`}>
      <div className="mx-id">
        <div className="mx-id-top">
          <button
            type="button"
            className="mx-name"
            title="Открыть контакты"
            onClick={действия.открытьКонтакты}
          >
            <span className="mx-ava" aria-hidden="true">
              {(char.name || '?').trim().charAt(0).toUpperCase()}
            </span>
            <strong
              className={свой ? 'own' : undefined}
              title={свой ? 'Персонаж, которого правит этот токен' : undefined}
            >
              {char.name || 'Без имени'}
            </strong>
          </button>
          <span className="chip affil">{affiliationLabel(char.affil)}</span>
        </div>

        <div className="mx-tabs">
          {сабы.length > 0 ? (
            <div className="segmented" role="group" aria-label="Ветка персонажа">
              <button
                type="button"
                className={саб === null ? 'on' : ''}
                title="Основная профессия"
                onClick={() => setВыбранный(null)}
              >
                Осн.
              </button>
              {сабы.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  className={саб?.id === s.id ? 'on' : ''}
                  title={s.cls ? `Саб-класс: ${s.cls}` : `Саб-класс ${i + 1}, профессия не указана`}
                  onClick={() => setВыбранный(s.id)}
                >
                  {s.cls || `Саб ${i + 1}`}
                </button>
              ))}
            </div>
          ) : (
            <span className="mx-quiet">
              {char.subUnlocked ? 'сабов нет' : 'сабы недоступны'}
            </span>
          )}
          {саб && правый && (
            <span className="mx-sub-tools">
              <button
                type="button"
                className="mx-sub-act"
                title="Сделать выбранный саб основной профессией. Основа встанет на его место"
                onClick={() => действия.сделатьОсновой(саб.id)}
              >
                Осн.
              </button>
              <button
                type="button"
                className="mx-sub-act danger"
                title="Удалить выбранный саб-класс вместе с его экипировкой"
                onClick={() => действия.запроситьУдалениеСаба(саб.id)}
              >
                Удал.
              </button>
            </span>
          )}
        </div>
      </div>

      <span className={`mx-role ${КЛАСС_РОЛИ[роль]}`} title={`Роль по классу: ${РОЛЬ_ПОДПИСЬ[роль]}`}>
        {РОЛЬ_ПОДПИСЬ[роль]}
      </span>

      <div className="mx-class">
        <b title={cls || undefined}>{cls || '—'}</b>
        <small>{level > 0 ? `ур. ${level}` : 'уровень не указан'}</small>
      </div>

      {/*
        Снаряжение — три группы по фиксированным ячейкам. Источник берётся
        по группе: у оружия и брони он свой набор, у бижутерии — общий для
        всех наборов, её не переодевают вместе с доспехом.
      */}
      <div className="mx-gear">
        {ГРУППЫ_МАТРИЦЫ.map((group) => {
          const источник: Char['slots'] =
            group.key === 'weapon'
              ? weaponSetSlots(наборОружия)
              : group.key === 'armor'
                ? armorSetSlots(наборБрони)
                : слоты
          const веткаГруппы: Branch =
            group.key === 'weapon' && номерОружия > 0
              ? { ...ветка, weaponSet: номерОружия }
              : group.key === 'armor' && номерБрони > 0
                ? { ...ветка, armorSet: номерБрони }
                : ветка

          return (
            <div key={group.key} className={`mx-group ${group.key}`} title={group.label}>
              <div className="mx-slots">
                {group.slots.map((slot) => (
                  <SlotIcon
                    key={`${slot.key}-${slot.index}`}
                    catalog={catalog}
                    label={slot.label}
                    entry={(источник[slot.key] ?? [])[slot.index] ?? null}
                    правый={правый}
                    onPick={() => onPick(веткаГруппы, slot.key, slot.index)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div
        className={`mx-count${занято === всего ? ' full' : ''}`}
        title={`${занято} из ${всего} слотов занято${
          наборы.length > 1
            ? ` · оружие: набор ${номерОружия + 1} из ${наборы.length}`
            : ''
        }${броня.length > 1 ? ` · броня: набор ${номерБрони + 1} из ${броня.length}` : ''}`}
      >
        <b>
          {занято}/{всего}
        </b>
        <small>слотов</small>
        {наборы.length > 1 && (
          <button
            type="button"
            className="mx-set"
            title={`Набор оружия ${номерОружия + 1} из ${наборы.length}. Нажмите, чтобы показать следующий`}
            onClick={() => setВыбранныйНабор((n) => (n + 1) % наборы.length)}
          >
            набор {номерОружия + 1}/{наборы.length}
          </button>
        )}
        {броня.length > 1 && (
          <button
            type="button"
            className="mx-set"
            title={`Набор брони ${номерБрони + 1} из ${броня.length}. Нажмите, чтобы показать следующий`}
            onClick={() => setВыбраннаяБроня((n) => (n + 1) % броня.length)}
          >
            броня {номерБрони + 1}/{броня.length}
          </button>
        )}
      </div>

      <div className="mx-links">
        {связи.length > 0 ? (
          связи.map((строка) =>
            строка.ссылка ? (
              <a
                key={строка.ключ}
                className="mx-link"
                href={строка.ссылка}
                target={строка.ссылка.startsWith('http') ? '_blank' : undefined}
                rel={строка.ссылка.startsWith('http') ? 'noreferrer' : undefined}
                title={`${строка.подпись}: ${строка.значение}`}
              >
                {строка.иконка}
              </a>
            ) : (
              <span
                key={строка.ключ}
                className="mx-link"
                title={`${строка.подпись}: ${строка.значение}`}
              >
                {строка.иконка}
              </span>
            ),
          )
        ) : (
          <span className="mx-none">—</span>
        )}
      </div>

      <div className="mx-pa">
        <PaChip pa={char.pa} compact />
      </div>

      {/*
        Окна подтверждения вместо полоски «Да / Нет» в строке: полоска стояла
        вплотную к кнопке удаления и читалась как часть строки, а не как
        отдельное решение. Сами окна общие с карточкой.
      */}
      <CharDialogs
        char={char}
        правый={правый}
        действия={действия}
        onCloseContacts={действия.закрытьУдаление}
      />
    </article>
  )
}

/**
 * Один слот в строке: иконка и заточка.
 *
 * Заточка показана только когда она есть. «+0» на каждом из двадцати
 * слотов всей пати — это двадцать нулей, которые ни о чём не говорят и
 * закрывают собой иконки; в карточке, где на персонажа двенадцать ячеек и
 * видно крупно, нули ещё терпимы, здесь — нет.
 *
 * Пустая ячейка у чужого персонажа — прочерк, а не плюс: плюс обещает
 * действие, которого нет. У владельца она остаётся кнопкой, потому что
 * надеть предмет можно и из этого вида.
 */
function SlotIcon({
  catalog,
  label,
  entry,
  правый,
  onPick,
}: {
  catalog: CatalogApi
  label: string
  entry: SlotEntry | null
  правый: boolean
  onPick: () => void
}) {
  if (!entry) {
    if (!правый) {
      return (
        <span className="slot-icon void ro mx-empty" title={`${label}: пусто`}>
          —
        </span>
      )
    }
    return (
      <button
        type="button"
        className="slot-icon void"
        title={`${label}: пусто — надеть`}
        onClick={onPick}
      >
        +
      </button>
    )
  }

  const item = catalog.byId(entry.itemId)
  const name = catalog.nameOf(entry.itemId)
  const mod = entry.mod ?? 0
  const ghost = entry.spans === true
  const grade = gradeCode(item?.gradeName)

  return (
    <button
      type="button"
      className={`slot-icon filled${ghost ? ' ghost' : ''}${grade !== null ? ` g${grade}` : ''}`}
      disabled={!правый}
      title={[
        `${label}: ${name}`,
        item?.gradeName ? `ранг ${item.gradeName}` : '',
        `№${entry.itemId}`,
        mod > 0 ? `заточка +${mod} из ${MAX_MOD}` : '',
        entry.sa ? `SA: ${entry.sa}` : '',
        entry.rare ? 'редкий эффект' : '',
        ghost ? 'второй слот пары' : '',
        правый ? '' : 'только просмотр',
      ]
        .filter(Boolean)
        .join(' · ')}
      onClick={onPick}
    >
      <ItemIcon item={item} name={name} size={20} />
      {!ghost && mod > 0 && <span className="slot-mod">+{mod}</span>}
    </button>
  )
}
