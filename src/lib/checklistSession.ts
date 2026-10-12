/**
 * Отметки чеклиста — только для текущей вкладки браузера.
 *
 * «Взять зелья» отмечает себе каждый сам, и общая отметка только мешает:
 * выглядит так, будто уже всё сделали. Поэтому здесь они и не хранятся —
 * ни в localStorage, ни в базе пати. Обновление страницы сбрасывает всё,
 * и это правильно: к следующему прайму список надо проходить заново.
 *
 * Модуль живёт, пока открыта страница, поэтому отметки переживают
 * переключение вкладок внутри приложения — но не перезагрузку.
 */
import { useSyncExternalStore } from 'react'

let отметки: Record<string, boolean> = {}
let версия = 0
const слушатели = new Set<() => void>()

function пересчитать() {
  версия++
  for (const с of слушатели) с()
}

function подписаться(с: () => void): () => void {
  слушатели.add(с)
  return () => слушатели.delete(с)
}

/** Отмечен ли пункт в этой вкладке. */
export function isMarked(id: string): boolean {
  return отметки[id] === true
}

export function markChecklist(id: string): void {
  отметки = { ...отметки, [id]: true }
  пересчитать()
}

export function unmarkChecklist(id: string): void {
  const следующий = { ...отметки }
  delete следующий[id]
  отметки = следующий
  пересчитать()
}

export function toggleChecklist(id: string): void {
  if (отметки[id]) unmarkChecklist(id)
  else markChecklist(id)
}

/**
 * Подписка на изменения отметок.
 *
 * Отдаём номер версии, а не сам объект: объект меняется ссылкой, и
 * useSyncExternalStore сравнивает результат getSnapshot — версия меняется
 * числом, и перерисовка гарантирована.
 */
export function useChecklistMarks(): number {
  return useSyncExternalStore(подписаться, () => версия, () => версия)
}