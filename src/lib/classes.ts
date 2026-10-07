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
 * Приводит введённый уровень к допустимому виду.
 * Больше двух цифр не пропускаем, границы подрезаем.
 */
export function clampLevel(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 2)
  if (digits === '') return ''
  return String(Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, Number(digits))))
}

/** Профессии, которые уже встречаются в базе, но их нет в списке. */
export function extraClasses(used: readonly string[]): string[] {
  const known = new Set<string>(CLASSES)
  const extra = used.filter((c) => c.trim() && !known.has(c.trim()))
  return [...new Set(extra)].sort((a, b) => a.localeCompare(b))
}
