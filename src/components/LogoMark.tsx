/**
 * Знак «Компас»: роза ветров с клинком вместо стрелки.
 *
 * Прямее всего говорит «пилот»: держим курс на состав и события. Контур
 * собирается при первом появлении, а дальше знак живёт спокойным пульсом:
 * медленно поворачиваются риски, дышит свечение, отмечается центральный узел.
 * Движение отключается само, если система просит меньше анимации.
 *
 * pathLength="1" на всех контурах — чтобы штрих рисовался одинаково на
 * большом знаке лендинга и на маленькой плитке в шапке.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      className={`logo-mark${className ? ` ${className}` : ''}`}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
    >
      <circle className="lm-halo" cx="50" cy="50" r="45" pathLength={1} />
      <g className="lm-slow">
        <path
          className="lm-line lm-thin"
          d="M50 1 V7 M50 93 V99 M1 50 H7 M93 50 H99 M15 15 L20 20 M80 80 L85 85 M85 15 L80 20 M20 80 L15 85"
          pathLength={1}
        />
      </g>
      <circle className="lm-line lm-thin" cx="50" cy="50" r="34" pathLength={1} />
      <path className="lm-line" d="M50 9 L57 43 L50 50 L43 43 Z" pathLength={1} />
      <path className="lm-line" d="M50 91 L43 57 L50 50 L57 57 Z" pathLength={1} />
      <path className="lm-line" d="M9 50 L43 43 L50 50 L43 57 Z" pathLength={1} />
      <path className="lm-line" d="M91 50 L57 57 L50 50 L57 43 Z" pathLength={1} />
      <path className="lm-fill" d="M50 21 L54 46 L50 50 L46 46 Z" />
      <circle className="lm-node" cx="50" cy="50" r="3.2" />
    </svg>
  )
}
