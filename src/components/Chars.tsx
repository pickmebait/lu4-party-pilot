import { useState } from 'react'
import { SLOTS, SLOT_GROUPS, MAX_MOD, gradeCode, gradeLabel, type Char, type SlotKey } from '@/types'
import type { CatalogApi } from '@/lib/catalog'
import {
  addChar,
  emptyChar,
  equipItem,
  removeChar,
  setSlotMod,
  unequipItem,
  updateChar,
  useDb,
} from '@/lib/store'
import { ItemPicker } from './ItemPicker'
import { ItemIcon } from './ItemIcon'
import { ClassSelect, LevelInput } from './ClassLevel'
import { ContactsModal } from './ContactsModal'
import { IconClose, IconDiscord, IconPhone, IconTelegram, IconUser } from './Icons'
import {
  discordLabel,
  discordLink,
  hasContacts,
  phoneLink,
  telegramLabel,
  telegramLink,
} from '@/lib/contacts'
import { clampLevel } from '@/lib/classes'

interface PickerTarget {
  charId: string
  slot: SlotKey
  index: number
}

export function CharsView({ catalog }: { catalog: CatalogApi }) {
  const [target, setTarget] = useState<PickerTarget | null>(null)
  const [quickAdd, setQuickAdd] = useState(false)

  return (
    <section className="view">
      <div className="view-head">
        <h2>Персонажи</h2>
        <div className="view-actions">
          <button className="btn" onClick={() => setQuickAdd(true)}>
            + Персонаж
          </button>
        </div>
      </div>

      <div className="chars-grid">
        <DbChars catalog={catalog} onPick={(charId, slot, index) => setTarget({ charId, slot, index })} />
      </div>

      {quickAdd && (
        <div className="modal-backdrop" onClick={() => setQuickAdd(false)}>
          <div className="modal small" onClick={(e) => e.stopPropagation()}>
            <h3>Новый персонаж</h3>
            <QuickAddForm
              onDone={(name, cls, level) => {
                addChar({ ...emptyChar(), name, cls, level })
                setQuickAdd(false)
              }}
              onCancel={() => setQuickAdd(false)}
            />
          </div>
        </div>
      )}

      {target && <SlotPicker target={target} catalog={catalog} onClose={() => setTarget(null)} />}
    </section>
  )
}

/** Список персонажей: вынесен, чтобы пустое состояние не мешало вёрстке. */
function DbChars({
  catalog,
  onPick,
}: {
  catalog: CatalogApi
  onPick: (charId: string, slot: SlotKey, index: number) => void
}) {
  const db = useDb()

  if (db.chars.length === 0) {
    return (
      <div className="empty">
        <p>Персонажей пока нет.</p>
        <p className="hint">
          Добавь членов пати — потом наполни экипировку. После правок нажми «Сохранить»,
          чтобы остальные увидели изменения.
        </p>
      </div>
    )
  }

  return (
    <>
      {db.chars.map((c) => (
        <CharCard key={c.id} char={c} catalog={catalog} onPick={onPick} />
      ))}
    </>
  )
}

/** Окно выбора предмета с фильтрами по типу и грейду. */
function SlotPicker({
  target,
  catalog,
  onClose,
}: {
  target: PickerTarget
  catalog: CatalogApi
  onClose: () => void
}) {
  const onPick = (itemId: number) => {
    const chosen = catalog.byId(itemId)
    if (!chosen) return
    // Правила занятости живут в store: двуручное оружие освобождает
    // левую руку, цельная броня — низ.
    equipItem(target.charId, target.slot, target.index, chosen)
    onClose()
  }

  return (
    <ItemPicker
      catalog={catalog}
      slot={SLOTS[target.slot]}
      onPick={onPick}
      onClose={onClose}
    />
  )
}

function QuickAddForm({
  onDone,
  onCancel,
}: {
  onDone: (name: string, cls: string, level: number) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [cls, setCls] = useState('')
  const [level, setLevel] = useState('')
  const ok = name.trim().length > 0

  const submit = () => {
    if (!ok) return
    const l = clampLevel(level)
    onDone(name.trim(), cls, l === '' ? 0 : Number(l))
  }

  return (
    <div className="form">
      <label>
        Имя персонажа
        <input
          className="input"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      </label>

      <div className="row">
        <label className="grow">
          Профессия
          <ClassSelect value={cls} onChange={setCls} />
        </label>
        <label>
          Уровень
          <LevelInput value={level} onChange={setLevel} />
        </label>
      </div>

      <div className="form-actions">
        <button className="btn" onClick={onCancel}>
          Отмена
        </button>
        <button className="btn primary" disabled={!ok} onClick={submit}>
          Добавить
        </button>
      </div>
    </div>
  )
}

function CharCard({
  char,
  catalog,
  onPick,
}: {
  char: Char
  catalog: CatalogApi
  onPick: (charId: string, slot: SlotKey, index: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [contactsOpen, setContactsOpen] = useState(false)
  const [editContacts, setEditContacts] = useState(false)

  let filled = 0
  let total = 0
  for (const g of SLOT_GROUPS) {
    for (const key of g.slots) {
      total += SLOTS[key].max
      filled += (char.slots[key] ?? []).filter(Boolean).length
    }
  }

  return (
    <article className="char-card">
      <header className="char-head">
        <div className="char-id">
          {editing ? (
            <EditForm
              char={char}
              onDone={(patch) => {
                updateChar(char.id, patch)
                setEditing(false)
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <>
              <h3>{char.name || 'Без имени'}</h3>
              <div className="char-meta">
                {char.cls && <span className="chip">{char.cls}</span>}
                {char.level > 0 && <span className="chip">ур. {char.level}</span>}
                <span className="chip subtle">
                  {filled} / {total} слотов
                </span>
              </div>

              {/*
                Контакты сворачиваются: в пати их обычно заполняют один раз,
                а блок на четыре строки каждым персонажем съедал высоту
                карточки. Свёрнутое состояние показывает значки — видно,
                что контакты есть, и не надо гадать, заполнено ли поле.
                Каждый контакт — ссылка туда, куда человек и правда пойдёт:
                телефон звонит, телеграм и дискорд открывают профиль.
              */}
              {hasContacts(char.contacts) && (
                <div className={`char-contacts${contactsOpen ? ' open' : ''}`}>
                  <button
                    className="contacts-toggle"
                    title={contactsOpen ? 'Свернуть контакты' : 'Показать контакты'}
                    aria-expanded={contactsOpen}
                    onClick={() => setContactsOpen((v) => !v)}
                  >
                    <span className="contacts-marks">
                      {char.contacts?.realName && <IconUser size={11} />}
                      {char.contacts?.phone && <IconPhone size={11} />}
                      {char.contacts?.telegram && <IconTelegram size={11} />}
                      {char.contacts?.discord && <IconDiscord size={11} />}
                    </span>
                    <span className="chevron">{contactsOpen ? '▾' : '▸'}</span>
                  </button>

                  {contactsOpen && (
                    <>
                  {char.contacts?.realName && (
                    <span className="chip plain" title="Имя в реальной жизни">
                      <IconUser />
                      {char.contacts.realName}
                    </span>
                  )}
                  {phoneLink(char.contacts?.phone) && (
                    <a
                      className="chip link"
                      href={phoneLink(char.contacts?.phone)!}
                      title="Позвонить"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <IconPhone />
                      {char.contacts?.phone}
                    </a>
                  )}
                  {telegramLink(char.contacts?.telegram) && (
                    <a
                      className="chip link"
                      href={telegramLink(char.contacts?.telegram)!}
                      target="_blank"
                      rel="noreferrer"
                      title="Открыть профиль в телеграме"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <IconTelegram />
                      {telegramLabel(char.contacts?.telegram!)}
                    </a>
                  )}
                  {discordLink(char.contacts?.discord) && (
                    <a
                      className="chip link"
                      href={discordLink(char.contacts?.discord)!}
                      target="_blank"
                      rel="noreferrer"
                      title="Открыть профиль в дискорде"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <IconDiscord />
                      {discordLabel(char.contacts?.discord!)}
                    </a>
                  )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        <div className="char-tools">
          <button className="icon-btn" title="Переименовать" onClick={() => setEditing((v) => !v)}>
            ✎
          </button>
          <button
            className="icon-btn"
            title={hasContacts(char.contacts) ? 'Изменить контакты' : 'Указать контакты'}
            onClick={() => setEditContacts(true)}
          >
            <IconPhone size={14} />
          </button>
          <button className="icon-btn danger" title="Удалить персонажа" onClick={() => setConfirmDelete(true)}>
            🗑
          </button>
        </div>
      </header>

      {editContacts && (
        <ContactsModal
          char={char}
          onClose={() => {
            setEditContacts(false)
            // Только что открытые контакты показываем сразу, иначе после
            // сохранения ничего не изменилось бы и человек решил бы, что
            // правка не прошла.
            setContactsOpen(true)
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

      {/*
        Блоки идут друг под другом, а не справа друг от друга: каждый блок
        занимает всю ширину карточки, поэтому ячейка может быть шире и
        название предмета помещается целиком.

        Внутри блока ячейки тоже стоят друг под другом — так выглядит
        персонаж целиком, и карточка получается узкой: в экран влезает вся
        пати, а не один с половиной герой.

        Слоты разворачиваются в ячейки через display: contents — обёртки
        .gear-slot и .gear-cells не нужны, когда раскладку задаёт сетка.
        Благодаря этому ячейки разных слотов становятся соседями сетки: у
        брони пять ячеек в столбик, у бижутерии тоже пять, и пары не рвутся.
      */}
      <div className="gear-stack">
        {SLOT_GROUPS.map((group) => (
          <section key={group.key} className={`stack-row stack-${group.key}`}>
            <h4>{group.label}</h4>
            <div className="stack-slots">
              {group.slots.map((key) => (
                <SlotCells
                  key={key}
                  char={char}
                  catalog={catalog}
                  slot={key}
                  onPick={(index) => onPick(char.id, key, index)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

    </article>
  )
}

function SlotCells({
  char,
  catalog,
  slot,
  onPick,
}: {
  char: Char
  catalog: CatalogApi
  slot: SlotKey
  onPick: (index: number) => void
}) {
  const def = SLOTS[slot]
  const arr = char.slots[slot] ?? []

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
                  onClick={() => setSlotMod(char.id, slot, i, mod - 1)}
                  title="Убавить заточку на 1"
                >
                  −
                </button>
                <span className={`mod-value${mod > 0 ? ' on' : ''}`}>+{mod}</span>
                <button
                  className="mod-btn"
                  disabled={mod >= MAX_MOD}
                  onClick={() => setSlotMod(char.id, slot, i, mod + 1)}
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
                  onClick={() => unequipItem(char.id, slot, i)}
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

function EditForm({
  char,
  onDone,
  onCancel,
}: {
  char: Char
  onDone: (patch: Partial<Char>) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(char.name)
  const [cls, setCls] = useState(char.cls)
  const [level, setLevel] = useState(char.level > 0 ? String(char.level) : '')

  const save = () =>
    onDone({
      name: name.trim(),
      cls,
      level: clampLevel(level) === '' ? 0 : Number(clampLevel(level)),
    })

  return (
    <div className="edit-form">
      <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      <div className="row">
        <div className="grow">
          <ClassSelect value={cls} onChange={setCls} />
        </div>
        <LevelInput value={level} onChange={setLevel} />
      </div>
      <div className="row">
        <button className="btn tiny primary" onClick={save}>
          Сохранить
        </button>
        <button className="btn tiny" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </div>
  )
}
