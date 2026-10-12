import { useMemo } from 'react'
import { CLASSES, LEVEL_MAX, LEVEL_MIN, clampLevel, extraClasses } from '@/lib/classes'
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
 */
export function ClassSelect({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
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
  const options = extra.length > 0 ? [...CLASSES, ...extra] : CLASSES

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
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 2)
        if (digits === '') {
          onChange('')
          return
        }
        onChange(Number(digits) > LEVEL_MAX ? String(LEVEL_MAX) : digits)
      }}
      onBlur={() => {
        if (value === '') return
        onChange(clampLevel(value))
      }}
      onKeyDown={(e) => e.stopPropagation()}
      title={`Уровень от ${LEVEL_MIN} до ${LEVEL_MAX}`}
    />
  )
}
