/** Небольшие утилиты, общие для всего приложения. */

let counter = 0

/** Короткий уникальный id. Не крипто — просто чтобы не было коллизий в одном браузере. */
export function uid(prefix = ''): string {
  counter += 1
  const t = Date.now().toString(36)
  const c = counter.toString(36)
  const r = Math.random().toString(36).slice(2, 7)
  return `${prefix}${t}${c}${r}`
}

/** 2026-10-06 21:34 */
export function formatStamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** "3 мин назад", "2 ч назад", "вчера" — для истории операций. */
export function formatAgo(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return iso
  const diff = Date.now() - t
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'только что'
  if (min < 60) return `${min} мин назад`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} ч назад`
  const d = Math.floor(h / 24)
  if (d === 1) return 'вчера'
  return `${d} дн назад`
}

/** Склонение: plural(5, 'предмет','предмета','предметов'). */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100
  const d = abs % 10
  if (abs > 10 && abs < 20) return many
  if (d > 1 && d < 5) return few
  if (d === 1) return one
  return many
}

/** Нормализация для поиска: без ё, в нижний регистр. */
export function normalize(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').trim()
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
