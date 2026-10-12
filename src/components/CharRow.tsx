import { useState } from 'react'
import {
  MAX_MOD,
  SLOTS,
  SLOT_GROUPS,
  SLOT_KEYS,
  affiliationLabel,
  type Char,
  type SlotKey,
} from '@/types'
import type { CatalogApi } from '@/lib/catalog'
import {
  removeChar,
  removeSub,
  updateChar,
  updateSub,
  type Branch,
} from '@/lib/store'
import { ItemIcon } from './ItemIcon'
import { CharEditForm } from './CharEditForm'
import { ContactsModal } from './ContactsModal'
import { IconPhone, IconUser } from './Icons'
import { PaChip } from './PaChip'

/**
 * Персонаж строкой — второй вид раздела.
 *
 * Карточка показывает персонажа целиком, но из-за этого в экран влезает
 * один с половиной герой: чтобы сравнить двоих, приходится прокручивать
 * вбок. Здесь наоборот — вся пати по вертикали, по одной строке на
 * персонажа, и видно сразу, у кого что надето и где не хватает.
 *
 * Отсюда и всё урезано: контактов нет (они не про снаряжение, а в этом
 * виде важно именно снаряжение), предмет — иконкой и заточкой без
 * названия и ранга. Название и ранг остались в подсказке: навести и
 * прочитать можно всегда, а на глаз двадцать названий не сравнить.
 */
export function CharRow({
  char,
  catalog,
  onPick,
}: {
  char: Char
  catalog: CatalogApi
  onPick: (ветка: Branch, slot: SlotKey, index: number) => void
}) {
  const [выбранный, setВыбранный] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [contactsOpen, setContactsOpen] = useState(false)

  /*
   * Как и в карточке: выбранный саб мог быть удалён или скрыт снятием
   * отметки, и тогда показывать надо основную профессию, а не пустоту.
   */
  const сабы = char.subUnlocked ? char.subs : []
  const саб = выбранный ? (сабы.find((s) => s.id === выбранный) ?? null) : null
  const ветка: Branch = { charId: char.id, subId: саб?.id ?? null }

  const слоты = саб ? саб.slots : char.slots
  const cls = саб ? саб.cls : char.cls
  const level = саб ? саб.level : char.level

  let занято = 0
  for (const key of SLOT_KEYS) занято += (слоты[key] ?? []).filter(Boolean).length
  const всего = Object.values(SLOTS).reduce((a, s) => a + s.max, 0)

  return (
    <article className="char-row">
      <div className="row-id">
        {editing ? (
          <CharEditForm
            char={char}
            саб={саб}
            onDone={(патч, патчСаба) => {
              updateChar(char.id, патч)
              if (патчСаба) updateSub(char.id, саб!.id, патчСаба)
              setEditing(false)
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            <div className="row-name">
              <IconUser />
              <strong>{char.name || 'Без имени'}</strong>
              <span className="chip affil">{affiliationLabel(char.affil)}</span>
              {саб && <span className="chip branch">саб</span>}
            </div>
            <div className="row-meta">
              {cls && <span className="chip cls">{cls}</span>}
              {level > 0 && <span className="chip lvl">ур. {level}</span>}
              {/* Платный аккаунт в этом виде идёт в ряду с профессией: в строке
                  для плашек есть место, а шапка карточки отдаёт ему отдельную
                  строку из-за тесноты. */}
              <PaChip pa={char.pa} />
            </div>
          </>
        )}
      </div>

      {/*
        Переключатель веток. Сабов в этом виде не спрятать: строка показывает
        одну ветку, и без переключателя экипировка саба стала бы недостижимой.
      */}
      {char.subUnlocked && (
        <div className="segmented row-tabs">
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
      )}

      {/*
        Снаряжение идёт теми же тремя группами, что и в карточке: оружие,
        броня, бижутерия. Порядок объявления слотов в справочнике для сравнения
        ничего не значит — оружие оказалось бы вразнобой между бронёй и
        бижутерией, и глаз цеплялся бы не за то.
      */}
      <div className="row-gear">
        {SLOT_GROUPS.map((group, gi) => (
          <div key={group.key} className="row-gear-group" title={group.label}>
            {gi > 0 && <span className="row-gear-gap" />}
            {group.slots.flatMap((key) =>
              (слоты[key] ?? []).map((entry, i) => (
                <SlotIcon
                  key={key + i}
                  catalog={catalog}
                  slot={key}
                  entry={entry}
                  onPick={() => onPick(ветка, key, i)}
                />
              )),
            )}
          </div>
        ))}
      </div>

      <div className="row-tail">
        <span
          className={`chip slots${занято === всего ? ' full' : ''}`}
          title={`${занято} из ${всего} слотов занято`}
        >
          {занято} из {всего}
        </span>
        {саб && (
          <button
            type="button"
            className="btn tiny danger sub-del"
            title="Убрать выбранный саб-класс вместе с его экипировкой"
            onClick={() => {
              removeSub(char.id, саб.id)
              setВыбранный(null)
            }}
          >
            Убрать саб
          </button>
        )}
        <div className="char-tools">
          <button
            className="icon-btn"
            title="Редактировать персонажа"
            onClick={() => setEditing((v) => !v)}
          >
            ✎
          </button>
          <button
            className="icon-btn"
            title="Указать контакты"
            onClick={() => setContactsOpen(true)}
          >
            <IconPhone size={14} />
          </button>
          <button
            className="icon-btn danger"
            title="Удалить персонажа"
            onClick={() => setConfirmDelete(true)}
          >
            🗑
          </button>
        </div>
      </div>

      {contactsOpen && (
        <ContactsModal
          char={char}
          onClose={() => {
            setContactsOpen(false)
            setConfirmDelete(false)
          }}
        />
      )}

      {confirmDelete && (
        <div className="confirm">
          <span>Удалить «{char.name || 'персонажа'}»?</span>
          <button
            className="btn tiny danger"
            onClick={() => {
              removeChar(char.id)
              setConfirmDelete(false)
            }}
          >
            Да
          </button>
          <button className="btn tiny" onClick={() => setConfirmDelete(false)}>
            Нет
          </button>
        </div>
      )}
    </article>
  )
}

/**
 * Один слот в строке: иконка и заточка.
 *
 * Заточка показана только когда она есть. «+0» на каждом из двадцати
 * слотов всей пати — это двадцать нулей, которые ни о чём не говорят и
 * закрывают собой иконки; в карточке, где на персонажа двенадцать ячеек и
 * видно крупно, нули ещё терпимы, здесь — нет. Сама заточка видна целиком
 * и в подсказке.
 */
function SlotIcon({
  catalog,
  slot,
  entry,
  onPick,
}: {
  catalog: CatalogApi
  slot: SlotKey
  entry: { itemId: number; mod?: number; spans?: boolean } | null
  onPick: () => void
}) {
  const def = SLOTS[slot]

  if (!entry) {
    return (
      <button className="slot-icon void" title={`${def.label}: пусто`} onClick={onPick}>
        +
      </button>
    )
  }

  const item = catalog.byId(entry.itemId)
  const name = catalog.nameOf(entry.itemId)
  const mod = entry.mod ?? 0

  return (
    <button
      className="slot-icon filled"
      title={[
        `${def.label}: ${name}`,
        item?.gradeName ? `ранг ${item.gradeName}` : '',
        `№${entry.itemId}`,
        `заточка +${mod} из ${MAX_MOD}`,
        entry.spans ? 'занимает два слота' : '',
      ]
        .filter(Boolean)
        .join(' · ')}
      onClick={onPick}
    >
      <ItemIcon item={item} name={name} size={20} />
      {mod > 0 && <span className="slot-mod">+{mod}</span>}
    </button>
  )
}