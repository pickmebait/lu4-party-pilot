import { useState } from 'react'
import { makeSubMain, removeChar, removeSub, updateChar, updateSub } from '@/lib/store'
import type { Char, Sub } from '@/types'

/**
 * Действия над персонажем, одинаковые для карточки и строки.
 *
 * Оба вида раздела умеют править персонажа, удалять его, открывать контакты
 * и убирать выбранный саб. Разметка у них разная, а последствия нажатия —
 * одни и те же, и держать две копии значило бы однажды поправить одну:
 * например, перестать сбрасывать выбранный саб после удаления. Здесь
 * собраны состояния окон и сами действия, а каждая вёрстка сама решает,
 * какой кнопкой что вызвать.
 */
export type ДействияПерсонажа = ReturnType<typeof useДействияПерсонажа>

export function useДействияПерсонажа(
  char: Char,
  саб: Sub | null,
  выбратьСаб: (id: string | null) => void,
) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Саб, который сейчас убирают: хранится именно он, а не флаг, потому
  // что в подписи окна нужно назвать, что удаляется.
  const [убираемыйСаб, setУбираемыйСаб] = useState<Sub | null>(null)
  const [contactsOpen, setContactsOpen] = useState(false)

  const сохранить = (патч: Partial<Char>, патчСаба?: Partial<Sub>) => {
    // Профессия и уровень принадлежат ветке: у саба свои. Имя и
    // принадлежность — самому персонажу, и правятся вместе с ним.
    updateChar(char.id, патч)
    if (патчСаба && саб) updateSub(char.id, саб.id, патчСаба)
    setEditing(false)
  }

  const удалить = () => {
    removeChar(char.id)
    setConfirmDelete(false)
  }

  const удалитьСаб = () => {
    if (!убираемыйСаб) return
    removeSub(char.id, убираемыйСаб.id)
    выбратьСаб(null)
    setУбираемыйСаб(null)
  }

  const сделатьОсновой = (id: string) => {
    if (makeSubMain(char.id, id)) выбратьСаб(null)
  }

  const запроситьУдалениеСаба = (id: string) => {
    setУбираемыйСаб(char.subs.find((s) => s.id === id) ?? null)
  }

  return {
    editing,
    открытьПравку: () => setEditing(true),
    закрытьПравку: () => setEditing(false),
    сохранить,
    confirmDelete,
    открытьУдаление: () => setConfirmDelete(true),
    закрытьУдаление: () => setConfirmDelete(false),
    удалить,
    убираемыйСаб,
    запроситьУдалениеСаба,
    закрытьУдалениеСаба: () => setУбираемыйСаб(null),
    удалитьСаб,
    contactsOpen,
    открытьКонтакты: () => setContactsOpen(true),
    закрытьКонтакты: () => setContactsOpen(false),
    сделатьОсновой,
  }
}
