import { useState } from 'react'
import {
  SLOTS,
  SLOT_GROUPS,
  affiliationLabel,
  type Char,
  type SlotKey,
  type Sub,
} from '@/types'
import type { CatalogApi } from '@/lib/catalog'
import { useAccess } from '@/lib/access'
import { removeChar, removeSub, updateChar, updateSub, type Branch } from '@/lib/store'
import { CharEditForm } from './CharEditForm'
import { ContactsModal } from './ContactsModal'
import { ContactsBlock } from './ContactsBlock'
import { GearStack } from './GearStack'
import { SubBar } from './SubBar'
import { PaChip } from './PaChip'
import { ConfirmModal } from './ConfirmModal'
import { IconCheck } from './Icons'

/**
 * Карточка персонажа: шапка, переключатель веток и снаряжение.
 *
 * Живёт отдельно от Chars.tsx, где лежит оболочка вкладки. Файл вырос до
 * семи компонентов и шестисот строк, и правка шапки задевала пикер
 * предметов, который к шапке отношения не имеет.
 *
 * Здесь осталась только сборка: что где стоит и в каком порядке. Снаряжение,
 * контакты и полосу сабов вынесены в отдельные файлы — им по одному
 * владельцу, а здесь они просто ставятся на место.
 */
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
  // Саб, который сейчас убирают. Хранится именно он, а не флаг: в подписи
  // окна нужно назвать, что удаляется, и у флага не было бы что показать.
  const [убираемыйСаб, setУбираемыйСаб] = useState<Sub | null>(null)
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

  const { canEditChar, ownCharId } = useAccess()

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

  const контактов = Object.keys(char.contacts ?? {}).length

  /*
   * Токен персонажа правит ровно одного. Всё, что правит, у чужого
   * персонажа не показывается вовсе: иначе нажатие приводило бы к отказу
   * сервера, и выглядело бы как ошибка у человека, который всё сделал
   * правильно.
   */
  const правый = canEditChar(char.id)
  const свой = правый && ownCharId === char.id

  return (
    <article className={`char-card${свой ? ' own' : ''}`}>
      <header className="char-head">
        {editing ? (
          <div className="char-id">
            <CharEditForm
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
          </div>
        ) : (
          <>
            {/*
              Имя, премиум и кнопки — в одну строку, а плашки метаданных —
              под ними, на всю ширину карточки.

              Раньше всё это делило одну шапку, и на плашки оставалось 125
              пикселей из нужных 234: строка с профессией и уровнем
              обрезалась у каждого, у кого в шапке есть премиум. Отдельная
              строка даёт плашкам всю ширину — 312 пикселей, — и «Elemental
              Summoner · ур. 75 · 11 из 12» помещается целиком вместе с
              любым премиумом.
            */}
            <div className="char-head-top">
              <div className="char-name-row">
                {/*
                  Свой персонаж выделен ником, а не плашкой «твой».
                  Плашка стояла рядом с именем и занимала место, которого
                  не хватало самому имени; теперь подсказка о принадлежности
                  и о том, чей это персонаж, стоят в подсказке при наведении,
                  а видно это сразу по самому имени.
                */}
                <h3 className={свой ? 'own' : undefined} title={свой ? 'Персонаж, которого правит этот токен' : undefined}>
                  {char.name || 'Без имени'}
                </h3>
                <span className="chip affil" title="Принадлежность">
                  {affiliationLabel(char.affil)}
                </span>
              </div>

              {правый && (
                <div className="char-tools">
                  <button
                    className="icon-btn"
                    title="Редактировать персонажа"
                    onClick={() => setEditing(true)}
                  >
                    ✎
                  </button>
                  {/*
                    Знак, а не значок из Icons.
                    
                    Рядом стоят карандаш и корзина — оба контурные юникод-знаки.
                    Телефон был сплошным значком четырнадцати пикселей при
                    двенадцати соседних, и втрое тяжелее их: кнопка выглядела
                    чужеродно и тянула взгляд с кнопки правки. Обведённый ✆ того
                    же начертания встаёт в ряд ровно.

                    В блоке контактов значки остаются: там нужно отличать
                    мессенджеры друг от друга, и юникод-символы не различались.
                    Здесь действие одно, и путать тут нечего.
                  */}
                  <button
                    className={`icon-btn${контактов === 0 ? ' suggest' : ''}`}
                    title={контактов > 0 ? 'Изменить контакты' : 'Указать контакты'}
                    onClick={() => setEditContacts(true)}
                  >
                    ✆
                  </button>
                  <button
                    className="icon-btn danger"
                    title="Удалить персонажа"
                    onClick={() => setConfirmDelete(true)}
                  >
                    🗑
                  </button>
                </div>
              )}
            </div>

            {/*
              Профессия, уровень, состояние слотов и премиум — в одну строку.
              Раньше плашки переносились на вторую и третью, и шапка
              персонажа съедала по высоте целую ячейку экипировки.

              Премиум стоит здесь же, после счётчика слотов. Он занимал место
              рядом с кнопками и толкал их вправо, хотя это свойство аккаунта,
              а не действие: там, где прочие сведения о персонаже.

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
              <PaChip pa={char.pa} />
            </div>

            <ContactsBlock char={char} onEdit={правый ? () => setEditContacts(true) : undefined} />
          </>
        )}
      </header>

      <SubBar
        char={char}
        сабы={сабы}
        активный={саб?.id ?? null}
        правый={правый}
        onSelect={setВыбранный}
        onRemove={(id) => setУбираемыйСаб(сабы.find((s) => s.id === id) ?? null)}
      />

      <GearStack
        ветка={ветка}
        слоты={слоты}
        catalog={catalog}
        правый={правый}
        onPick={onPick}
      />

      {editContacts && (
        <ContactsModal char={char} правый={правый} onClose={() => setEditContacts(false)} />
      )}

      {/*
        Удаление персонажа и саб-класса спрашивает в окне, а не полоской под
        шапкой: полоска с двумя кнопками «Да» и «Нет» стояла рядом с кнопкой
        удаления и выглядела частью карточки, а не отдельным решением.
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