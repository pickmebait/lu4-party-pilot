import { useState } from 'react'
import type { ArmorSet, Char, Sub, WeaponSet } from '@/types'
import { useAccess } from '@/lib/access'
import { слотыВетки } from '@/lib/derived'
import type { Branch } from '@/lib/store'

/**
 * Всё, что выводится из персонажа, — одинаково для обоих видов раздела.
 *
 * Карточка и строка показывают одно и то же про разные ветки, права и счётчик
 * слотов, и выводили это каждый по-своему. Расхождение выглядело бы как ошибка:
 * на строке написано «занято 10», на карточке «9», и правильным ни один не
 * покажется. Здесь всё общее выводится один раз, а у каждого вида остаётся
 * только его собственная вёрстка.
 */
export interface СостояниеПерсонажа {
  /** Сабы, которые видны: без отметки о квесте их нет и показывать нельзя. */
  сабы: Sub[]
  /** Выбранный саб либо основная профессия. */
  саб: Sub | null
  /** Что человек сейчас смотрит и правит. */
  ветка: Branch
  слоты: Char['slots']
  /** Второй и третий наборы оружия выбранной ветки. */
  допНаборы: WeaponSet[]
  /** Второй и третий наборы брони выбранной ветки. */
  допБроня: ArmorSet[]
  cls: string
  level: number
  /** Вправе ли этот пользователь править персонажа. */
  правый: boolean
  /** Правит ли он именно этого — своим ником он выделен. */
  свой: boolean
  счётчик: { занято: number; всего: number }
}

export function useПерсонаж(char: Char): СостояниеПерсонажа & { выбратьСаб: (id: string | null) => void } {
  /*
   * Выбранный саб мог быть удалён или скрыт снятием отметки о квесте, и тогда
   * показывать надо основную профессию, а не пустоту: подстановка ниже
   * схлопывает такой выбор сам, без отдельной проверки в каждом виде.
   */
  const [выбранный, setВыбранный] = useState<string | null>(null)
  const { canEditChar, ownCharId } = useAccess()

  const сабы = char.subUnlocked ? char.subs : []
  const саб = выбранный ? (сабы.find((s) => s.id === выбранный) ?? null) : null
  const правый = canEditChar(char.id)
  const допНаборы = саб ? (саб.extraWeaponSets ?? []) : (char.extraWeaponSets ?? [])
  const допБроня = саб ? (саб.extraArmorSets ?? []) : (char.extraArmorSets ?? [])

  return {
    сабы,
    саб,
    выбратьСаб: setВыбранный,
    ветка: { charId: char.id, subId: саб?.id ?? null },
    слоты: саб ? саб.slots : char.slots,
    допНаборы,
    допБроня,
    cls: саб ? саб.cls : char.cls,
    level: саб ? саб.level : char.level,
    правый,
    свой: правый && ownCharId === char.id,
    счётчик: слотыВетки(саб ? саб.slots : char.slots, допНаборы, допБроня),
  }
}