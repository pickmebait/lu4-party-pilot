import { useMemo } from 'react'
import { CLASSES, LEVEL_MAX, LEVEL_MIN, extraClasses, levelForInput } from '@/lib/classes'
import { useDb } from '@/lib/store'

/**
 * Выбор профессии.
 *
 * Кроме справочника показываем профессии, которые уже есть в базе, но которых
 * в справочнике нет: иначе сохранение чужого персонажа молча сбросило бы его
 * профессию в пустоту.
 *
 * Из базы берёмся и основные профессии, и профессии саб-классов. Сабы — те
 * же люди, только в другой профессии, и список должен показывать их наравне:
 * иначе профессию, которой нет в справочнике, в сабе выбрать было нельзя, и
 * правка молча сбрасывала бы её в пустоту.
 *
 * exclude — профессии, которые выбирать нельзя. Им одним персонаж не может
 * быть занят дважды: основная профессия и уже занятые сабы. Убрать их из
 * списка надёжнее, чем ругаться после сохранения: человек в списке видит
 * сразу, что свободно.
 */
export function ClassSelect({
  value,
  onChange,
  exclude,
}: {
  value: string
  onChange: (v: string) => void
  /** Профессии, недоступные для выбора. */
  exclude?: string[]
}) {
  const db = useDb()
  const used = useMemo(
    () =>
      db.chars
        .flatMap((c) => [c.cls ?? '', ...c.subs.map((s) => s.cls ?? '')])
        .map((c) => c.trim())
        .filter(Boolean),
    [db.chars],
  )
  const extra = useMemo(() => extraClasses(used), [used])
  const все = extra.length > 0 ? [...CLASSES, ...extra] : CLASSES

  /*
   * Текущее значение из исключений убираем: иначе в старой базе, где у саба
   * могла стоять профессия основной, список оказался бы пустым и правка
   * молча сбрасывала бы профессию.
   */
  const занято = useMemo(() => {
    const s = new Set((exclude ?? []).map((c) => c.trim()).filter(Boolean))
    s.delete(value.trim())
    return s
  }, [exclude, value])
  const options = useMemo(() => все.filter((c) => !занято.has(c)), [все, занято])

  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— не указана —</option>
      {options.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  )
}

/**
 * Уровень: не больше двух цифр и в границах 1–75.
 *
 * Подрезаем прямо во время набора, а не по blur: событие потери фокуса
 * приходит далеко не всегда (проверено — в части окружений не приходит
 * вовсе), а показывать пользователю «99» при максимуме 75 неверно.
 * Сверху режем сразу: набрать корректное значение не мешает, ведь всё,
 * что больше 75, всё равно недопустимо. Нижнюю границу трогаем только при
 * уходе из поля и при сохранении — иначе «0» в начале ввода превратился бы
 * в «1» и путал бы.
 */
export function LevelInput({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <input
      className="input level"
      inputMode="numeric"
      autoComplete="off"
      placeholder={`${LEVEL_MIN}–${LEVEL_MAX}`}
      value={value}
      onChange={(e) => onChange(levelForInput(e.target.value))}
      onBlur={() => {
        if (value === '') return
        onChange(levelForInput(value))
      }}
      onKeyDown={(e) => e.stopPropagation()}
      title={`Уровень от ${LEVEL_MIN} до ${LEVEL_MAX}`}
    />
  )
}
