import { useState } from 'react'
import {
  addChecklistItem,
  removeChecklistItem,
  updateChecklistItem,
  useDb,
} from '@/lib/store'
import { isMarked, toggleChecklist, useChecklistMarks } from '@/lib/checklistSession'
import { useAccess } from '@/lib/access'
import { IconClose } from './Icons'

/*
 * Подготовка к прайму.
 *
 * Живёт во второй подвкладке правого блока: список «что проверить перед
 * входом» один на всех и каждый день, а рядом с карточкой дня он читался
 * как часть конкретного дня. Пункты общие для пати, отметки — только в этой
 * вкладке. Иначе выходит, что один человек отметил всё и остальным
 * показалось, что уже готово.
 */
export function Checklist() {
  const db = useDb()
  // Пункты общие: токен персонажа их не правит. Отметки при этом остаются
  // доступны — они живут только в этой вкладке и в базу не попадают.
  const { canEditParty: правый } = useAccess()
  const [новый, setНовый] = useState('')
  const пункты = db.schedule.checklist
  useChecklistMarks()
  const готово = пункты.filter((i) => isMarked(i.id)).length
  const процент = пункты.length ? Math.round((готово / пункты.length) * 100) : 0

  const добавить = () => {
    if (!новый.trim()) return
    addChecklistItem(новый)
    setНовый('')
  }

  return (
    <div className="checklist">
      <div className="checklist-head">
        <h4>Подготовка к прайму</h4>
        {пункты.length > 0 && (
          <span className="checklist-count">
            {готово} из {пункты.length}
          </span>
        )}
      </div>

      {пункты.length > 0 && (
        <div
          className="checklist-bar"
          title={`Отмечено ${готово} из ${пункты.length}`}
          aria-label={`Отмечено ${готово} из ${пункты.length}`}
        >
          <span style={{ width: `${процент}%` }} />
        </div>
      )}

      {пункты.length === 0 ? (
        <p className="hint">Пусто. Добавьте, что нужно проверить перед праймом.</p>
      ) : (
        <ul className="checklist-items">
          {пункты.map((i) => (
            <li key={i.id} className={isMarked(i.id) ? 'done' : ''}>
              <input
                type="checkbox"
                checked={isMarked(i.id)}
                title="Отметка держится только до обновления страницы"
                onChange={() => toggleChecklist(i.id)}
              />
              <input
                className="checklist-text"
                value={i.text}
                readOnly={!правый}
                placeholder="что проверить"
                onChange={(e) => updateChecklistItem(i.id, { text: e.target.value })}
              />
              {правый && (
                <button
                  className="icon-btn tiny"
                  title="Убрать пункт"
                  onClick={() => removeChecklistItem(i.id)}
                >
                  <IconClose />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {правый && (
        <div className="checklist-add">
          <input
            className="input"
            value={новый}
            placeholder="Добавить пункт"
            onChange={(e) => setНовый(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') добавить()
              e.stopPropagation()
            }}
          />
          <button className="btn tiny" onClick={добавить} disabled={!новый.trim()}>
            +
          </button>
        </div>
      )}

      <p className="hint checklist-note">Отметки живут только в этой вкладке и не сохраняются в пати.</p>
    </div>
  )
}
