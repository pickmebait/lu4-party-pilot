import { useMemo, useState } from 'react'
import type { Char, Sub } from '@/types'
import { clampLevel } from '@/lib/classes'
import { AffiliationSelect } from './AffiliationSelect'
import { ClassSelect, LevelInput } from './ClassLevel'

/**
 * Форма правки персонажа.
 *
 * Живёт отдельно от карточки: ею пользуются оба вида раздела — и широкая
 * карточка, и строка во всю высоту. Держать две копии формы значило бы
 * через месяц поправить одну и забыть про вторую, а расходятся они тихо:
 * правка работает, но не та.
 *
 * Профессия и уровень принадлежат ветке, а имя и принадлежность — самому
 * персонажу. Поэтому форма отдаёт два патча, а не один: иначе правка саба
 * переписала бы профессию основной профессии — или наоборот, и человек
 * обнаружил бы это через месяц.
 *
 * занятые — профессии, которые персонажу уже нельзя занять: своя основная
 * и профессии остальных сабов. Список их не показывает, чтобы не предлагать
 * выбор, который всё равно запрещён.
 */
export function CharEditForm({
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

  const занятые = useMemo(
    () => [char.cls, ...char.subs.filter((s) => s.id !== саб?.id).map((s) => s.cls)],
    [char.cls, char.subs, саб],
  )

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
          <ClassSelect value={cls} onChange={setCls} exclude={саб ? занятые : undefined} />
        </div>
        <LevelInput value={level} onChange={setLevel} />
      </div>
      {/* У саба своей принадлежности нет: она принадлежит персонажу целиком. */}
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