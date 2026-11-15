import { useState } from 'react'
import { DEFAULT_AFFILIATION, type Affiliation } from '@/types'
import { levelToSave } from '@/lib/classes'
import { привестиНик } from '@/lib/nick'
import { AffiliationSelect } from './AffiliationSelect'
import { NickInput, никПодходит } from './NickInput'
import { ClassSelect, LevelInput } from './ClassLevel'

/** Короткая форма нового персонажа: имя, профессия, уровень, принадлежность. */
export function QuickAddForm({
  onDone,
  onCancel,
}: {
  onDone: (name: string, cls: string, level: number, affil: Affiliation) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [cls, setCls] = useState('')
  const [level, setLevel] = useState('')
  // Принадлежность всегда задана: по умолчанию состав, его подходит
  // большинству, и он же первый в порядке показа.
  const [affil, setAffil] = useState<Affiliation>(DEFAULT_AFFILIATION)
  // Правило «годится ли имя» — одно, и живёт рядом с полем: расходиться
  // ему не с чем.
  const ok = никПодходит(name)

  const submit = () => {
    if (!ok) return
    onDone(привестиНик(name), cls, levelToSave(level), affil)
  }

  return (
    <div className="form">
      <label>
        Имя персонажа
        <NickInput value={name} onChange={setName} autoFocus />
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

      <AffiliationSelect value={affil} onChange={setAffil} />

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
