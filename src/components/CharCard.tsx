import { useState, type ReactNode } from 'react'
import { SLOTS, SLOT_GROUPS, MAX_MOD, MAX_SUBS, affiliationLabel, gradeCode, gradeLabel, type Char, type SlotKey, type Sub } from '@/types'
import type { CatalogApi } from '@/lib/catalog'
import { addSub, removeChar, removeSub, setSlotMod, setSubUnlocked, unequipItem, updateChar, updateSub, type Branch } from '@/lib/store'
import { ItemIcon } from './ItemIcon'
import { ClassSelect, LevelInput } from './ClassLevel'
import { AffiliationSelect } from './AffiliationSelect'
import { ContactsModal } from './ContactsModal'
import { IconCheck, IconClose, IconDiscord, IconPhone, IconTelegram, IconUser } from './Icons'
import { discordLabel, discordLink, phoneLink, telegramLabel, telegramLink } from '@/lib/contacts'
import { clampLevel } from '@/lib/classes'

/**
 * Карточка персонажа: шапка с контактами и три блока экипировки.
 *
 * Живёт отдельно от Chars.tsx, где лежит оболочка вкладки. Файл разросся
 * до семи компонентов и шестисот строк, и правка шапки задевала пикер
 * предметов, который к шапке отношения не имеет.
 */

/** Одна строка списка контактов. */
interface КонтактСтрока {
  ключ: string
  подпись: string
  значение: string
  /** Куда ведёт строка. У имени ссылки нет: его некуда открывать. */
  ссылка?: string
  подсказка: string
  иконка: ReactNode
}

/**
 * Контакты персонажа в виде строк «подпись — значение».
 *
 * Значения читаются в локальные переменные и проверяются на пустоту до
 * того, как из них строится ссылка. Раньше здесь стояли непустые
 * утверждения: проверка шла по результату phoneLink, а значение бралось
 * из char.contacts, который к тому моменту мог уже оказаться пустым —
 * TypeScript соглашался на !, и поле менялось бы без всякой ошибки.
 */
function строкиКонтактов(контакты: Char['contacts']): КонтактСтрока[] {
  const строки: КонтактСтрока[] = []
  if (!контакты) return строки

  const имя = контакты.realName?.trim() ?? ''
  const телефон = контакты.phone?.trim() ?? ''
  const телеграм = контакты.telegram?.trim() ?? ''
  const дискорд = контакты.discord?.trim() ?? ''

  if (имя) {
    строки.push({
      ключ: 'realName',
      подпись: 'Имя',
      значение: имя,
      подсказка: 'Имя в реальной жизни',
      иконка: <IconUser size={12} />,
    })
  }

  const ссылкаТелефона = телефон ? phoneLink(телефон) : null
  if (телефон && ссылкаТелефона) {
    строки.push({
      ключ: 'phone',
      подпись: 'Телефон',
      значение: телефон,
      ссылка: ссылкаТелефона,
      подсказка: 'Позвонить',
      иконка: <IconPhone size={12} />,
    })
  }

  const ссылкаТелеграма = телеграм ? telegramLink(телеграм) : null
  if (телеграм && ссылкаТелеграма) {
    строки.push({
      ключ: 'telegram',
      подпись: 'Телеграм',
      значение: telegramLabel(телеграм),
      ссылка: ссылкаТелеграма,
      подсказка: 'Открыть профиль в телеграме',
      иконка: <IconTelegram size={12} />,
    })
  }

  const ссылкаДискорда = дискорд ? discordLink(дискорд) : null
  if (дискорд && ссылкаДискорда) {
    строки.push({
      ключ: 'discord',
      подпись: 'Дискорд',
      значение: discordLabel(дискорд),
      ссылка: ссылкаДискорда,
      подсказка: 'Открыть профиль в дискорде',
      иконка: <IconDiscord size={12} />,
    })
  }

  return строки
}

export function CharCard({
  char,
  catalog,
  onPick,
}: {
  char: Char
  catalog: CatalogApi
  onPick: (target: Branch, slot: SlotKey, index: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [contactsOpen, setContactsOpen] = useState(false)
  const [editContacts, setEditContacts] = useState(false)
  /*
   * Какая ветка экипировки показана: null — основная профессия, иначе id
   * саб-класса. Выбор живёт в карточке, а не в базе: это то, что смотрит
   * конкретный человек, и делиться им с пати незачем.
   *
   * Если саб удалили или отметку о квесте сняли, выбранного саба больше нет.
   * Подстановка ниже схлопывает такой выбор на основную профессию — иначе
   * карточка осталась бы с чужими слотами на экране.
   */
  const [выбранный, setВыбранный] = useState<string | null>(null)

  const сабы = char.subUnlocked ? char.subs : []
  const саб = выбранный ? (сабы.find((s) => s.id === выбранный) ?? null) : null
  const ветка: Branch = { charId: char.id, subId: саб?.id ?? null }

  // Всё, что ниже, смотрит на выбранную ветку, а не всегда на персонажа.
  const cls = саб ? саб.cls : char.cls
  const level = саб ? саб.level : char.level
  const слоты = саб ? саб.slots : char.slots

  let filled = 0
  let total = 0
  for (const g of SLOT_GROUPS) {
    for (const key of g.slots) {
      total += SLOTS[key].max
      filled += (слоты[key] ?? []).filter(Boolean).length
    }
  }

  /*
   * Контакты собираются списком, а не набором плашек: строки с подписью
   * читаются сами, и добавить пятое поле — одна строка здесь, а не новая
   * разметка в трёх местах.
   */
  const контактные = строкиКонтактов(char.contacts)

  return (
    <article className="char-card">
      <header className="char-head">
        <div className="char-id">
          {editing ? (
            <EditForm
              char={char}
              саб={саб}
              onDone={(патч, патчСаба) => {
                // Профессия и уровень принадлежат ветке: у саба свои. Имя и
                // принадлежность — самому персонажу, и правятся вместе с ним.
                updateChar(char.id, патч)
                if (патчСаба) updateSub(char.id, саб!.id, патчСаба)
                setEditing(false)
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <>
              <div className="char-name-row">
                <h3>{char.name || 'Без имени'}</h3>
                <span className="chip affil" title="Принадлежность">
                  {affiliationLabel(char.affil)}
                </span>
              </div>
              {/*
                Профессия, уровень и состояние слотов всегда в одну строку.
                Раньше плашки переносились на вторую и третью, и шапка
                персонажа съедала по высоте целую ячейку экипировки.

                Длиннее всех профессия — пусть ужимается первой, числа
                остаются читаемыми целиком.
              */}
              <div className="char-meta">
                {саб && <span className="chip branch" title="Показан саб-класс">саб</span>}
                {cls && <span className="chip cls">{cls}</span>}
                {level > 0 && <span className="chip lvl">ур. {level}</span>}
                {filled === total ? (
                  <span className="chip slots full" title={`Все ${total} слотов заняты`}>
                    <IconCheck />
                    Заполнено
                  </span>
                ) : (
                  // Без слова «слотов»: в строке уже есть профессия и
                  // уровень, и на «Elemental Summoner · ур. 75 · 11 из 12»
                  // всё умещается, а с «слотов» профессия не влезала.
                  <span className="chip slots" title={`${filled} из ${total} слотов занято`}>
                    {filled} из {total}
                  </span>
                )}
              </div>

              {/*
                Контакты вне игры.
                
                Раньше они были плашками — и выглядели ровно как плашки
                профессии и уровня прямо над ними, поэтому читались как
                ещё одна строчка метаданных, а не как способ связаться с
                человеком. Теперь это подписанный список: видно, что
                именно написано, без угадывания по значку.

                Свёрнутое состояние тоже несёт информацию — показывает
                имя, потому что в игре ники ничего не говорят, и именно
                по имени человека ищут.
              */}
              {контактные.length > 0 && (
                <div className={`char-contacts${contactsOpen ? ' open' : ''}`}>
                  <button
                    className="contacts-toggle"
                    title={contactsOpen ? 'Свернуть контакты' : 'Показать контакты'}
                    aria-expanded={contactsOpen}
                    onClick={() => setContactsOpen((v) => !v)}
                  >
                    <IconUser />
                    <span className="contacts-brief">
                      {char.contacts?.realName?.trim() || 'Контакты'}
                    </span>
                    {контактные.length > 1 && (
                      <span className="contacts-more" title="Заполнено полей">
                        {контактные.length}
                      </span>
                    )}
                    <span className="chevron">{contactsOpen ? '▾' : '▸'}</span>
                  </button>

                  {contactsOpen && (
                    <div className="contacts-list">
                      {контактные.map((строка) => (
                        <div className="contacts-row" key={строка.ключ}>
                          <span className="contacts-key">
                            {строка.иконка}
                            {строка.подпись}
                          </span>
                          {строка.ссылка ? (
                            <a
                              className="contacts-val link"
                              href={строка.ссылка}
                              target={строка.ссылка.startsWith('http') ? '_blank' : undefined}
                              rel={строка.ссылка.startsWith('http') ? 'noreferrer' : undefined}
                              title={строка.подсказка}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {строка.значение}
                            </a>
                          ) : (
                            <span className="contacts-val" title={строка.подсказка}>
                              {строка.значение}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
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
            title={контактные.length > 0 ? 'Изменить контакты' : 'Указать контакты'}
            onClick={() => setEditContacts(true)}
          >
            <IconPhone size={14} />
          </button>
          <button className="icon-btn danger" title="Удалить персонажа" onClick={() => setConfirmDelete(true)}>
            🗑
          </button>
        </div>
      </header>

      {/* Переключатель веток — на всю ширину карточки, а не в блоке шапки:
          справа от него живут три кнопки инструментов, и на пять вкладок
          с отметкой места там не оставалось — переключатель ложился на
          три строки. */}
      <SubBar char={char} сабы={сабы} активный={саб?.id ?? null} onSelect={setВыбранный} />

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
    </article>
  )
}

/**
 * Отметка о квесте на саб-класс и переключатель веток.
 *
 * Отметка стоит впереди и всегда на виду: пока квест не пройден, сабов
 * быть не может, и прятать это под настройку значило бы искать кнопку.
 *
 * Сабы перечислены профессией, а не «саб 1/2/3»: узнать, где какой, по
 * подписи можно, по номеру — нельзя. Пустой саб подписан «Саб N», чтобы
 * вкладки не слипались одинаковыми заглушками.
 */
function SubBar({
  char,
  сабы,
  активный,
  onSelect,
}: {
  char: Char
  сабы: Sub[]
  активный: string | null
  onSelect: (subId: string | null) => void
}) {
  const полный = сабы.length >= MAX_SUBS

  return (
    <div className="sub-bar">
      <button
        type="button"
        className={`sub-flag${char.subUnlocked ? ' on' : ''}`}
        title={
          char.subUnlocked
            ? 'Квест на саб-класс пройден. Нажмите, чтобы убрать сабов'
            : 'Квест на саб-класс ещё не пройден. Отметить, что пройден'
        }
        onClick={() => {
          // Снятие отметки возвращает показ основной профессии: выбранного
          // саба через мгновение не станет, и пустые слоты снятого саба
          // смотрелись бы как потерянная экипировка основной профессии.
          setSubUnlocked(char.id, !char.subUnlocked)
          if (char.subUnlocked) onSelect(null)
        }}
      >
        {char.subUnlocked ? '✓ Саб' : '○ Саб'}
      </button>

      {char.subUnlocked && (
        <>
          <div className="segmented sub-tabs">
            <button
              type="button"
              className={активный === null ? 'on' : ''}
              title="Основная профессия"
              onClick={() => onSelect(null)}
            >
              Осн.
            </button>
            {сабы.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={активный === s.id ? 'on' : ''}
                title={s.cls ? `Саб-класс: ${s.cls}` : `Саб-класс ${i + 1}, профессия не указана`}
                onClick={() => onSelect(s.id)}
              >
                {s.cls || `Саб ${i + 1}`}
              </button>
            ))}
          </div>

          {/*
            Обе кнопки живут рядом и появляются независимо: добавить саба
            можно и когда выбран другой (чтобы не искать, куда переключаться),
            а убрать — только когда выбран саб, а не основная профессия.
          */}
          {!полный && (
            <button
              type="button"
              className="sub-add"
              title={`Добавить саб-класс (${сабы.length} из ${MAX_SUBS})`}
              onClick={() => {
                const id = addSub(char.id)
                if (id) onSelect(id)
              }}
            >
              + саб
            </button>
          )}
          {активный && (
            <button
              type="button"
              className="icon-btn tiny danger sub-del"
              title="Убрать выбранный саб-класс вместе с его экипировкой"
              onClick={() => {
                removeSub(char.id, активный)
                onSelect(null)
              }}
            >
              <IconClose />
            </button>
          )}
        </>
      )}
    </div>
  )
}

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

/**
 * Форма правки персонажа.
 *
 * Профессия и уровень принадлежат ветке, а имя и принадлежность — самому
 * персонажу. Поэтому форма отдаёт два патча, а не один: иначе правка саба
 * переписала бы профессию основной профессии — или наоборот, и человек
 * обнаружил бы это через месяц.
 */
function EditForm({
  char,
  саб,
  onDone,
  onCancel,
}: {
  char: Char
  саб: Sub | null
  onDone: (патч: Partial<Char>, патчСаба?: Partial<Sub>) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(char.name)
  const [cls, setCls] = useState(саб ? саб.cls : char.cls)
  const [level, setLevel] = useState((саб ? саб.level : char.level) > 0 ? String(саб ? саб.level : char.level) : '')
  const [affil, setAffil] = useState(char.affil)

  const save = () => {
    const ур = clampLevel(level)
    const пара = { cls, level: ур === '' ? 0 : Number(ур) }
    if (саб) onDone({ name: name.trim(), affil }, пара)
    else onDone({ name: name.trim(), affil, ...пара })
  }

  return (
    <div className="edit-form">
      {саб && <div className="edit-sub">Саб-класс</div>}
      <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      <div className="row">
        <div className="grow">
          <ClassSelect value={cls} onChange={setCls} />
        </div>
        <LevelInput value={level} onChange={setLevel} />
      </div>
      {!саб && <AffiliationSelect value={affil} onChange={setAffil} />}
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
