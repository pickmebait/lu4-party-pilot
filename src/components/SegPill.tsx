import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * Переключатель с одной плашкой на всех.
 *
 * Плашка не привязана к кнопке фоном: она живёт отдельным слоем и едет к
 * выбранному варианту. Так переключатель читается одинаково и на двух
 * вариантах «Строка/Колонка», и на четырёх «Все/Состав/Десятка/Окно».
 *
 * Ширину плашки меряем по самой кнопке, а не делим контейнер на равные доли:
 * подписи у вариантов разной длины, и в «Сводке» равные доли увели бы группу
 * за край телефона. Замер идёт до первой отрисовки, поэтому плашка не
 * успевает мелькнуть в левом углу.
 */
const useПередОтрисовкой = typeof window === 'undefined' ? useEffect : useLayoutEffect

type Вариант<T extends string | number> = {
  key: T
  label: string
  title?: string
}

export function SegPill<T extends string | number>({
  варианты,
  значение,
  onВыбрать,
  ariaLabel,
  className,
}: {
  варианты: readonly Вариант<T>[]
  значение: T
  onВыбрать: (значение: T) => void
  ariaLabel: string
  className?: string
}) {
  const группа = useRef<HTMLDivElement>(null)
  const [плашка, setПлашка] = useState<{ left: number; width: number } | null>(null)

  useПередОтрисовкой(() => {
    const узел = группа.current
    if (!узел) return

    let жив = true
    const измерить = () => {
      const выбрана = узел.querySelector<HTMLButtonElement>('button.on')
      if (!выбрана || !жив) return
      const рамка = узел.getBoundingClientRect()
      const кнопка = выбрана.getBoundingClientRect()
      setПлашка({
        left: кнопка.left - рамка.left - узел.clientLeft,
        width: кнопка.width,
      })
    }

    измерить()

    if (typeof ResizeObserver === 'undefined') return
    const наблюдатель = new ResizeObserver(измерить)
    наблюдатель.observe(узел)
    узел.querySelectorAll('button').forEach((кнопка) => наблюдатель.observe(кнопка))
    document.fonts?.ready.then(измерить).catch(() => {})

    return () => {
      жив = false
      наблюдатель.disconnect()
    }
  }, [значение, варианты.length])

  return (
    <div
      ref={группа}
      className={`segmented seg-pill-switch${className ? ` ${className}` : ''}`}
      role="group"
      aria-label={ariaLabel}
      data-ready={плашка ? 'true' : 'false'}
    >
      <span
        className="seg-pill"
        style={
          плашка
            ? { width: `${плашка.width}px`, transform: `translateX(${плашка.left}px)` }
            : undefined
        }
        aria-hidden="true"
      />
      {варианты.map((вариант) => {
        const выбран = вариант.key === значение
        return (
          <button
            key={String(вариант.key)}
            type="button"
            className={выбран ? 'on' : ''}
            data-label={вариант.label}
            title={вариант.title}
            aria-pressed={выбран}
            onClick={() => onВыбрать(вариант.key)}
          >
            {вариант.label}
          </button>
        )
      })}
    </div>
  )
}
