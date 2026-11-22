import {
  affiliationLabel,
  type Char,
  type SlotKey,
} from '@/types'
import type { CatalogApi } from '@/lib/catalog'
import type { Branch } from '@/lib/store'
import { useПерсонаж } from '@/lib/useChar'
import { useДействияПерсонажа } from '@/lib/useCharActions'
import { CharEditForm } from './CharEditForm'
import { CharDialogs } from './CharDialogs'
import { ContactsBlock } from './ContactsBlock'
import { GearStack } from './GearStack'
import { SubBar } from './SubBar'
import { PaChip } from './PaChip'
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
  // Ветка, слоты, права и счётчик занятых слотов выводит общий хук: то же
  // самое нужно строке, и выводить это дважды значило бы однажды разойтись.
  const { сабы, саб, выбратьСаб: setВыбранный, ветка, слоты, допНаборы, допБроня, cls, level, правый, свой, счётчик } =
    useПерсонаж(char)
  const действия = useДействияПерсонажа(char, саб, setВыбранный)

  const filled = счётчик.занято
  const total = счётчик.всего


  const контактов = Object.keys(char.contacts ?? {}).length


  return (
    <article className={`char-card${свой ? ' own' : ''}`}>
      <header className="char-head">
        {действия.editing ? (
          <div className="char-id">
            <CharEditForm
              char={char}
              саб={саб}
              onDone={действия.сохранить}
              onCancel={действия.закрытьПравку}
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
                    onClick={действия.открытьПравку}
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
                    onClick={действия.открытьКонтакты}
                  >
                    ✆
                  </button>
                  <button
                    className="icon-btn danger"
                    title="Удалить персонажа"
                    onClick={действия.открытьУдаление}
                  >
                    🗑
                  </button>
                </div>
              )}
            </div>

            {/*
              Профессия и уровень — одной плашкой через пробел, слоты
              записаны коротко «4/12», премиум — «ПА 12 дн.». Так даже у
              самой длинной профессии с сабом все плашки помещаются в
              строку: раньше последняя выходила за край карточки на 31 px.

              Премиум стоит здесь же, после счётчика слотов. Он занимал место
              рядом с кнопками и толкал их вправо, хотя это свойство аккаунта,
              а не действие: там, где прочие сведения о персонаже.

              Длиннее всех профессия — пусть ужимается первой, числа
              остаются читаемыми целиком.
            */}
            <div className="char-meta">
              {саб && <span className="chip branch" title="Показан саб-класс">саб</span>}
              {cls && (
                <span className="chip cls">
                  {cls}
                  {level > 0 && <span className="meta-lvl"> {level}</span>}
                </span>
              )}
              {!cls && level > 0 && <span className="chip lvl">ур. {level}</span>}
              {filled === total ? (
                <span className="chip slots full" title={`Все ${total} слотов заняты`}>
                  <IconCheck />
                  {filled}/{total}
                </span>
              ) : (
                <span className="chip slots" title={`${filled} из ${total} слотов занято`}>
                  {filled}/{total}
                </span>
              )}
              <PaChip pa={char.pa} compact />
            </div>

            <ContactsBlock char={char} onEdit={правый ? действия.открытьКонтакты : undefined} />
          </>
        )}
      </header>

      <SubBar
        char={char}
        сабы={сабы}
        активный={саб?.id ?? null}
        правый={правый}
        onSelect={setВыбранный}
        onPromote={действия.сделатьОсновой}
        onRemove={действия.запроситьУдалениеСаба}
      />

      <GearStack
        ветка={ветка}
        слоты={слоты}
        допНаборы={допНаборы}
        допБроня={допБроня}
        catalog={catalog}
        правый={правый}
        onPick={onPick}
      />

      {/*
        Удаление персонажа и саб-класса спрашивает в окне, а не полоской под
        шапкой: полоска с двумя кнопками «Да» и «Нет» стояла рядом с кнопкой
        удаления и выглядела частью карточки, а не отдельным решением.
        Сами окна общие со строкой.
      */}
      <CharDialogs char={char} правый={правый} действия={действия} />
    </article>
  )
}