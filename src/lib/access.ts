/**
 * Права текущего пользователя.
 *
 * Два вида токена:
 *
 *   Мастер-токен — один на пати, полные права: правит любого персонажа,
 *   общую казну, хотелки, комплекты и расписание, а ещё выпускает и
 *   отзывает токены.
 *
 *   Токен персонажа — смотрит всё, но правит только того, кому выдан.
 *
 * Здесь только интерфейс: кнопки, которые всё равно не сработают, не
 * показываются. Настоящая проверка — на сервере, он сверяет документ целиком,
 * а не нажатую кнопку, поэтому подделать права в браузере нельзя.
 *
 * Право на правку всей пати, кроме персонажей, проверяется сервером целиком.
 * Здесь оно означает «не показывать кнопок».
 */
import { useDb, useSession } from './store'

export interface Access {
  role: 'master' | 'char'
  /** Мастер-токен: можно всё. */
  master: boolean
  /** id персонажа, которому выдан токен. У мастер-токена — null. */
  ownCharId: string | null
  /** Править этого персонажа можно. */
  canEditChar: (charId: string) => boolean
  /**
   * Править можно всё, кроме чужих персонажей: казна, хотелки, комплекты
   * и расписание общие, и токен персонажа их не касается.
   */
  canEditParty: boolean
}

export function useAccess(): Access {
  const session = useSession()
  const master = session?.role !== 'char'
  const ownCharId = master ? null : (session?.charId ?? null)

  return {
    role: master ? 'master' : 'char',
    master,
    ownCharId,
    canEditChar: (charId) => master || charId === ownCharId,
    canEditParty: master,
  }
}

/**
 * Имя персонажа, которому выдан токен.
 *
 * Нужно для подписей: без него плашка «только просмотр» говорила бы
 * «правит только свой персонаж», и человек, у которого персонаж удалили,
 * не понял бы, к кому это относится.
 */
export function useOwnCharName(): string {
  const db = useDb()
  const { ownCharId } = useAccess()
  if (!ownCharId) return ''
  return db.chars.find((c) => c.id === ownCharId)?.name?.trim() ?? ''
}