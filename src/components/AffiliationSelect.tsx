import { AFFILIATIONS, type Affiliation } from '@/types'

/**
 * Выбор принадлежности тремя кнопками.
 *
 * Живёт отдельным файлом, потому что нужен и форме создания, и форме
 * правки персонажа: лежал бы в одном из них — пришлось бы импортировать
 * формы друг из друга.
 *
 * Вариантов ровно три и они не меняются, поэтому список на три строки с
 * галочками был бы многословен: подписью служит сама кнопка.
 *
 * Подписи «Принадлежность» перед кнопками нет: варианты говорят сами за
 * себя («Состав», «Десятка», «Окно»), а слово занимало целую строку формы и
 * повторялось рядом с именем персонажа, где принадлежность и так стоит
 * плашкой. Для программ чтения подпись осталась в aria-label.
 */
export function AffiliationSelect({
  value,
  onChange,
}: {
  value: Affiliation
  onChange: (affil: Affiliation) => void
}) {
  return (
    <div className="segmented" role="group" aria-label="Принадлежность">
      {AFFILIATIONS.map((a) => (
        <button
          key={a.key}
          type="button"
          className={value === a.key ? 'on' : ''}
          onClick={() => onChange(a.key)}
        >
          {a.label}
        </button>
      ))}
    </div>
  )
}