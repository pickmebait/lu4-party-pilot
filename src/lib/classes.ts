/**
 * Профессии Lineage 2.
 *
 * Список приведён в том виде, в каком его дали для проекта, и отсортирован
 * по алфавиту — так проще искать в выпадающем списке.
 *
 * Хранится в карточке персонажа обычной строкой, а не ссылкой на элемент
 * списка: класс остаётся читаемым в JSON базы, и на сервере с нестандартными
 * профессиями ничего не ломается.
 */
export const CLASSES = [
  'Abyss Walker',
  'Bounty Hunter',
  'Bishop',
  'Bladedancer',
  'Dark Avenger',
  'Destroyer',
  'Elven Elder',
  'Elemental Summoner',
  'Gladiator',
  'Hawkeye',
  'Necromancer',
  'Overlord',
  'Paladin',
  'Phantom Ranger',
  'Phantom Summoner',
  'Plainswalker',
  'Prophet',
  'Shillien Elder',
  'Shillien Knight',
  'Silver Ranger',
  'Sorcerer',
  'Spellhowler',
  'Spellsinger',
  'Swordsinger',
  'Temple Knight',
  'Treasure Hunter',
  'Tyrant',
  'Warcryer',
  'Warlock',
  'Warlord',
  'Warsmith',
] as const

/** Минимальный и максимальный уровень персонажа. */
export const LEVEL_MIN = 1
export const LEVEL_MAX = 75

/**
 * Уровень при вводе.
 *
 * Цифры, не больше двух, и верхняя граница — сразу, при наборе. Нижняя
 * граница здесь намеренно не трогается: «0» в начале ввода это ещё не ноль, и
 * подставлять вместо него «1» значит путать человека на ровном месте.
 *
 * Отдельная функция от levelToSave именно поэтому: правило разное, и сводить
 * их в одну — экономия двух строк ценой тихой ошибки, потому что правило при
 * вводе было написано здесь, а правило при сохранении ещё в двух формах.
 */
export function levelForInput(raw: string): string {
  const цифры = raw.replace(/\D/g, '').slice(0, 2)
  if (цифры === '') return ''
  return Number(цифры) > LEVEL_MAX ? String(LEVEL_MAX) : цифры
}

/**
 * Уровень для сохранения.
 *
 * Полные границы, потому что в базу попадает число, а не текст в поле. Пустое
 * поле — не нулевой уровень, а «не указан», и это разные состояния: ноль
 * значит «ещё не вписан», а не «первый уровень».
 */
export function levelToSave(raw: string): number {
  const цифры = raw.replace(/\D/g, '')
  if (цифры === '') return 0
  return Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, Number(цифры.slice(0, 2))))
}

/** Профессии, которые уже встречаются в базе, но их нет в списке. */
export function extraClasses(used: readonly string[]): string[] {
  const known = new Set<string>(CLASSES)
  const extra = used.filter((c) => c.trim() && !known.has(c.trim()))
  return [...new Set(extra)].sort((a, b) => a.localeCompare(b))
}
