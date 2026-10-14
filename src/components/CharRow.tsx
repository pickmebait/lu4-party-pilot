import { useState } from 'react'
import {
  MAX_MOD,
  SLOTS,
  SLOT_GROUPS,
  SLOT_KEYS,
  affiliationLabel,
  type Char,
  type SlotKey,
  type Sub,
} from '@/types'
import type { CatalogApi } from '@/lib/catalog'
import { useAccess } from '@/lib/access'
import { removeChar, removeSub, updateChar, updateSub, type Branch } from '@/lib/store'
import { ItemIcon } from './ItemIcon'
import { CharEditForm } from './CharEditForm'
import { ContactsModal } from './ContactsModal'
import { IconPhone, IconUser } from './Icons'
import { PaChip } from './PaChip'
import { ConfirmModal } from './ConfirmModal'

/**
 * Персонаж строкой — второй вид раздела.
 *
 * Карточка показывает персонажа целиком, но из-за этого в экран влезает
 * один с половиной герой: чтобы сравнить двоих, приходится прокручивать
 * вбок. Здесь наоборот — вся пати по вертикали, по одной строке на
 * персонажа, и видно сразу, у кого что надето и где не хватает.
 *
 * Отсюда и всё урезано: предмет — иконкой и заточкой без названия и ранга.
 * Название и ранг остались в подсказке: навести и прочитать можно всегда, а
 * на глаз двадцать названий не сравнить.
 *
 * Кнопок правки, контактов и удаления в строке нет: три значка в хвосте
 * съедали 135 пикселей и делали строку похожей на панель управления, а
 * правка и так делается в виде «Строка». Контакты открываются двойным щелчком
 * по имени, удаление — из карточки.
 *
 * Слева три строки — имя, плашки, переключатель веток — и все три есть у
 * всех, даже там, где переключать нечего. Пустая строка вместо блока
 * выглядит дырой; постоянная высота держит иконки снаряжения на одной
 * горизонтали по всей пати, а это ради вида и затевалось.
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
  // Саб, который сейчас убирают. Хранится именно он, а не флаг: в подписи
  // окна нужно назвать, что удаляется, и у флага не было бы что показать.
  const [убираемыйСаб, setУбираемыйСаб] = useState<Sub | null>(null)
  const [contactsOpen, setContactsOpen] = useState(false)

  const { canEditChar, ownCharId } = useAccess()

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

  /*
   * Токен персонажа правит ровно одного: у остальных ячейки просто не
   * нажимаются, сабы не добавляются и не убираются. Переключать ветку и
   * смотреть контакты можно всем — это ничего не меняет.
   */
  const правый = canEditChar(char.id)
  const свой = правый && ownCharId === char.id

  return (
    <article className={`char-row${свой ? ' own' : ''}`}>
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
            <button
              className="row-name"
              title="Открыть контакты"
              onClick={() => setContactsOpen(true)}
            >
              <IconUser />
              {/*
                Свой персонаж выделен ником, а не плашкой «твой»: плашка
                отнимала место у единственной строки, где профессия, уровень и
                премиум должны помещаться целиком.
              */}
              <strong className={свой ? 'own' : undefined} title={свой ? 'Персонаж, которого правит этот токен' : undefined}>
                {char.name || 'Без имени'}
              </strong>
              <span className="chip affil">{affiliationLabel(char.affil)}</span>
              {саб && <span className="chip branch">саб</span>}
              <span className="row-contacts" aria-hidden="true">
                <IconPhone size={12} />
              </span>
            </button>

            <div className="row-meta">
              {cls && <span className="chip cls">{cls}</span>}
              {level > 0 && <span className="chip lvl">ур. {level}</span>}
              <PaChip pa={char.pa} />
            </div>

            <div className="row-tabs">
              {сабы.length > 0 ? (
                <div className="segmented">
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
                <span className="row-tabs-empty">{char.subUnlocked ? 'сабов нет' : 'сабы недоступны'}</span>
              )}
            </div>
          </>
        )}
      </div>

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
                  правый={правый}
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
        {саб && правый && (
          <button
            type="button"
            className="btn tiny danger sub-del"
            title="Убрать выбранный саб-класс вместе с его экипировкой"
            onClick={() => setУбираемыйСаб(саб)}
          >
            Убрать саб
          </button>
        )}
      </div>

      {contactsOpen && (
        <ContactsModal
          char={char}
          правый={правый}
          onClose={() => {
            setContactsOpen(false)
            setConfirmDelete(false)
          }}
        />
      )}

      {/*
        Окно подтверждения вместо полоски «Да / Нет» в строке: полоска стояла
        вплотную к кнопке удаления и читалась как часть строки, а не как
        отдельное решение. Открывается отсюда же, если удаление вызвать
        удалённым способом.
      */}
      {confirmDelete && (
        <ConfirmModal
          заголовок={`Удалить «${char.name || 'персонажа'}»?`}
          текст="Вместе с персонажем пропадёт его снаряжение, отсутствия и контакты. Восстановить это нельзя — придётся собирать заново."
          кнопка="Удалить"
          onConfirm={() => {
            removeChar(char.id)
            setConfirmDelete(false)
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      {убираемыйСаб && (
        <ConfirmModal
          заголовок={`Убрать саб-класс${убираемыйСаб.cls ? ` «${убираемыйСаб.cls}»` : ''}?`}
          текст="Вместе с саб-классом пропадёт его снаряжение. Основная профессия и остальные сабы не пострадают."
          кнопка="Убрать саб"
          onConfirm={() => {
            removeSub(char.id, убираемыйСаб.id)
            setВыбранный(null)
            setУбираемыйСаб(null)
          }}
          onCancel={() => setУбираемыйСаб(null)}
        />
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
  правый,
  onPick,
}: {
  catalog: CatalogApi
  slot: SlotKey
  entry: { itemId: number; mod?: number; spans?: boolean } | null
  правый: boolean
  onPick: () => void
}) {
  const def = SLOTS[slot]

  if (!entry) {
    if (!правый) {
      return (
        <span className="slot-icon void ro" title={`${def.label}: пусто`}>
          +
        </span>
      )
    }
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
      disabled={!правый}
      title={[
        `${def.label}: ${name}`,
        item?.gradeName ? `ранг ${item.gradeName}` : '',
        `№${entry.itemId}`,
        `заточка +${mod} из ${MAX_MOD}`,
        entry.spans ? 'занимает два слота' : '',
        правый ? '' : 'только просмотр',
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