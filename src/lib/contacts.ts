/**
 * Ссылки на профили из свободного текста.
 *
 * Телеграм пишут по-разному: @nick, t.me/nick, https://t.me/nick. Дискорд
 * — либо старый формат user#1234, либо обычный ник. Всё это нужно привести к
 * ссылке, иначе в шапке персонажа будет мёртвый текст вместо кнопки.
 */

/** Убирает пробелы и приводит букву к нужному регистру: t.me/Nick = t.me/nick. */
function ник(raw: string): string {
  return raw.trim().replace(/^@/, '').replace(/\s+/g, '')
}

export function telegramLink(raw: string | undefined): string | null {
  if (!raw) return null
  const v = raw.trim()
  if (!v) return null
  if (/^https?:\/\//i.test(v)) return v
  const n = ник(v).replace(/^t\.me\//i, '').replace(/^\//, '')
  return n ? `https://t.me/${n}` : null
}

export function discordLink(raw: string | undefined): string | null {
  if (!raw) return null
  const v = raw.trim()
  if (!v) return null
  if (/^https?:\/\//i.test(v)) return v
  // Старый формат user#1234 — самое ценное, что тут бывает: по нему профиль
  // находится однозначно.
  if (v.includes('#')) {
    const [user, tag] = v.split('#')
    if (user && tag) return `https://discord.com/users/${user}/${tag.replace(/\D/g, '')}`
  }
  return `https://discord.com/users/${v}`
}

/** Номер телефона в ссылку tel: — пробелы и скобки там лишние. */
export function phoneLink(raw: string | undefined): string | null {
  if (!raw) return null
  const v = raw.trim()
  return v ? `tel:${v.replace(/[^\d+]/g, '')}` : null
}

/** Короткая подпись для плашки: не показываем полную ссылку. */
export function telegramLabel(raw: string): string {
  return `@${ник(raw).replace(/^t\.me\//i, '')}`
}

export function discordLabel(raw: string): string {
  return `@${raw.trim().replace(/^@/, '')}`
}
