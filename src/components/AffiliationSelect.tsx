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
 */
export function AffiliationSelect({
  value,
  onChange,
}: {
  value: Affiliation
  onChange: (affil: Affiliation) => void
}) {
  return (
    <label>
      Принадлежность
      <div className="segmented">
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
    </label>
  )
}