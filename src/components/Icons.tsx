/**
 * Значки для контактов.
 *
 * Раньше стояли юникод-символы — ☎ ✈ ◈ — и человек гадал, где телеграм, а
 * где дискорд. Теперь это настоящие пиктограммы мессенджеров, узнаваемые
 * без подсказки.
 *
 * Рисуются текущим цветом: fill="currentColor" наследует цвет плашки, и
 * при смене палитры или наведении значок меняет цвет вместе с ней.
 */

interface Props {
  size?: number
}

export function IconPhone({ size = 13 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6.6 10.8c1.45 2.83 3.77 5.15 6.6 6.6l2.2-2.2c.28-.28.68-.36 1.03-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1C10.6 21 3 13.4 3 4c0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.24.2 2.45.57 3.57.11.35.03.75-.25 1.03l-2.2 2.2z" />
    </svg>
  )
}

export function IconTelegram({ size = 13 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M9.8 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.7 13.3 3.6 12c-.88-.25-.89-.86.2-1.3l16-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.8c-.19.92-.74 1.14-1.5.72l-3.72-2.2-2 1.93c-.22.22-.42.42-.83.42z" />
    </svg>
  )
}

export function IconDiscord({ size = 13 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20 4.5A16 16 0 0 0 15.9 3l-.2 1a14 14 0 0 0-7.4 0l-.2-1A16 16 0 0 0 4 4.5C1.7 8 1 11.4 1.3 14.8A16.2 16.2 0 0 0 6.2 17l1-1.6c-.55-.2-1.08-.45-1.57-.75l.39-.3a11.6 11.6 0 0 0 9.96 0l.39.3c-.5.3-1.02.55-1.57.75l1 1.6a16.2 16.2 0 0 0 4.9-2.2c.4-3.9-.7-7.3-3.1-10.3zM8.3 13.2c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2zm7.4 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2z" />
    </svg>
  )
}

export function IconUser({ size = 13 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-3.33 0-10 1.67-10 5v3h20v-3c0-3.33-6.67-5-10-5z" />
    </svg>
  )
}

/**
 * Крестик снятия.
 *
 * Раньше здесь стоял символ ✕ из шрифта. На строке в 13 пикселей он
 * рисовался ниже рамки: метрики шрифта решают, где окажется начертание, а
 * кнопка задаёт свою высоту. Замер по прямоугольнику текста показывал, что
 * всё по центру, а глазами крест был вне кнопки. Нарисованный крест от
 * шрифта не зависит: координаты заданы нами.
 */
export function IconClose({ size = 8 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M1.5 1.5 10.5 10.5M10.5 1.5 1.5 10.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Галочка «все слоты заняты». */
export function IconCheck({ size = 11 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M1.5 6.5 4.5 9.5 10.5 2.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Значок «показать подробности» рядом с сообщением.
 *
 * Раньше техническая часть сообщения была вписана в него же: «В пати
 * изменилось (от: Ирок, 3 минуты назад)». Кто автор и когда — это про
 * устройство, а человек правил персонажа и ждёт, пока ляжет правка. Смешанная
 * надпись читается как отчёт, а не как ответ.
 *
 * Теперь надпись короткая, а всё устройство — здесь, по нажатию. Рисуется
 * текущим цветом, как остальные значки: цвет плашки меняется по исходу
 * дела, и значок должен меняться вместе с ней.
 */
export function IconInfo({ size = 12 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 7v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="4.9" r="0.95" fill="currentColor" />
    </svg>
  )
}

/*
 * Значки событий расписания.
 *
 * Буквы в клетке календаря читались бы как ещё один набор сокращений, которые
 * надо расшифровывать. Пиктограмма узнаётся до чтения подписи: корона —
 * королева, капля — Орфен, пламя — Кор, щит — осада КХ, башня — замки.
 *
 * Рисуются текущим цветом, как и остальные значки: цвет плашки задаётся
 * событием, а сам рисунок остаётся читаемым в любой палитре.
 */

/** Корона: Ant Queen. */
export function IconCrown({ size = 12 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 18.5 4.6 7l4.7 3.6L12 5l2.7 5.6L19.4 7 21 18.5H3zm1.9 1.5h14.2v1.6H4.9V20z" />
    </svg>
  )
}

/** Капля: Orfen. */
export function IconDrop({ size = 12 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.5S5.8 9.9 5.8 14.2a6.2 6.2 0 0 0 12.4 0C18.2 9.9 12 2.5 12 2.5zm-2 12.1c0 1.7 1.3 3 3 3.2a.8.8 0 0 1-.2 1.6 4.6 4.6 0 0 1-4.4-4.8.8.8 0 0 1 1.6 0z" />
    </svg>
  )
}

/** Пламя: Core. */
export function IconFlame({ size = 12 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13.2 2.2c.5 3.9 3.6 5.5 4.4 9.1a6.3 6.3 0 0 1-11.2 5.6c-.7-.9-1.1-2-1.2-3.2-.1-2.4 1.2-4.3 2.9-5.9-.2 1.7.3 3 1.6 3.9.9-2.9 2.2-5.4 3.5-9.5z" />
    </svg>
  )
}

/** Щит: осада КХ. */
export function IconShield({ size = 12 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="m12 2.2 8 2.9v6.2c0 4.9-3.4 8.4-8 10.5-4.6-2.1-8-5.6-8-10.5V5.1l8-2.9zm0 2.2L6 6.5v4.8c0 3.6 2.3 6.4 6 8.2 3.7-1.8 6-4.6 6-8.2V6.5l-6-2.1z" />
    </svg>
  )
}

/** Башня: осада замков. */
export function IconCastle({ size = 12 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 21V7h3V4h3v3h2V4h2v3h2V4h3v3h3v14h-7v-5a3 3 0 0 0-6 0v5H3zm3-8h2v2H6v-2zm10 0h2v2h-2v-2z" />
    </svg>
  )
}
