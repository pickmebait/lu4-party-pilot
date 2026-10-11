import { useState } from 'react'
import { PALETTES, applyPalette, loadPalette } from '@/lib/palette'

/**
 * Переключатель палитры рядом с логотипом.
 *
 * Кружок раскрашен тремя цветами самой палитры — фон, акцент и текст.
 * Порядок и соотношение цветов во всех палитрах одинаковые, меняется только
 * тон, поэтому шесть кружков читаются как один ряд вариантов, а не как
 * разнородные пятна.
 */
export function PaletteBar() {
  const [текущая, setТекущая] = useState(loadPalette)

  return (
    <div className="palettes" role="group" aria-label="Палитра оформления">
      {PALETTES.map((p) => {
        const выбрана = p.id === текущая
        return (
          <button
            key={p.id}
            className={`palette${выбрана ? ' on' : ''}`}
            title={p.name}
            aria-label={p.name}
            aria-pressed={выбрана}
            style={{
              background: `linear-gradient(135deg, ${p.swatch[0]} 0 45%, ${p.swatch[1]} 45% 72%, ${p.swatch[2]} 72% 100%)`,
            }}
            onClick={() => {
              applyPalette(p.id)
              setТекущая(p.id)
            }}
          />
        )
      })}
    </div>
  )
}
