/**
 * Правка премиум аккаунта в форме персонажа.
 *
 * Отдельным блоком, а не ещё одной строкой в ряду: полей тут два, и они не
 * помещаются в строку с профессией — там уже всё занято. Заодно это место,
 * где видно и результат («осталось 27 дней»), иначе посчитанное в шапке
 * приходилось бы запоминать на глаз.
 *
 * Поля на всю ширину блока: даты и сроку нужно видеть целиком, а не в
 * обрезку поля шириной с два пальца — выпадающий список показывал одну цифру
 * и выглядел пустым.
 *
 * Поля пустые — значит премиум не заполнен: молчаливая пустота честнее, чем
 * ноль дней, который выглядел бы как только что купленное и кончившееся.
 */
import { useMemo } from 'react'
import type { Pa } from '@/types'
import { PA_DAYS } from '@/types'
import { paLeft } from '@/lib/pa'

export function PaEdit({
  from,
  days,
  onFrom,
  onDays,
  onClear,
  заполнено,
}: {
  from: string
  days: number
  onFrom: (v: string) => void
  onDays: (v: number) => void
  onClear: () => void
  заполнено: boolean
}) {
  /*
   * Варианты — из списка плюс текущее значение.
   *
   * Значение не из списка бывает, если срок в базе поставили вручную или он
   * появился в игре позже: молча выпадать на другой срок нельзя, а молча
   * показывать пустой выбор тоже нельзя. Поэтому текущее значение попадает
   * в список отдельной строкой.
   */
  const варианты = useMemo(() => {
    const все = new Set<number>([...PA_DAYS, days])
    return [...все].sort((a, b) => a - b)
  }, [days])

  const осталось = paLeft(from ? { from, days } : undefined)

  return (
    <div className="pa-edit">
      <div className="pa-edit-title">
        Премиум аккаунт
        {осталось !== null && (
          <span className={`pa-edit-left${осталось < 3 ? ' low' : ''}`}>
            {осталось > 0 ? `осталось ${осталось} дн.` : осталось === 0 ? 'истекает сегодня' : 'истёк'}
          </span>
        )}
      </div>

      <div className="pa-edit-fields">
        <label>
          Дата покупки
          <input className="input" type="date" value={from} onChange={(e) => onFrom(e.target.value)} />
        </label>

        <label>
          На сколько
          <select className="input" value={days} onChange={(e) => onDays(Number(e.target.value))}>
            {варианты.map((d) => (
              <option key={d} value={d}>
                {d} дн.
              </option>
            ))}
          </select>
        </label>

        {заполнено && (
          <button className="btn pa-edit-clear" onClick={onClear} title="Убрать дату и срок">
            Снять
          </button>
        )}
      </div>

      {осталось === null && <p className="hint">Пусто — премиум не заполнен.</p>}
    </div>
  )
}

/** Собирает пару из полей формы: пустая дата означает «не заполнено». */
export function paFromFields(from: string, days: number): Pa | undefined {
  return from ? { from, days } : undefined
}