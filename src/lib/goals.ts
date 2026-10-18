/**
 * Цели: модель, разбор базы и прогресс.
 *
 * Отдельный модуль, а не часть хранилища, потому что три вещи отсюда нужны и
 * расчётам сводки, и проверкам, а хранилище браузерное и в node не запускается.
 *
 * Ключевое отличие от прежних хотелок: цель — это список предметов, а не один
 * предмет. Добывают их по разному и в разные дни, поэтому готовность нужна по
 * каждому пункту отдельно, а состояние цели выводится из них и не хранится.
 * Хранить «выполнена» рядом с «добыты все предметы» — значит завести два
 * источника правды и однажды получить цель, которая выполнена, хотя ничего не
 * добыто.
 */

/** Наибольшая заточка в игре: +16. Дублируется, чтобы модуль стоял особняком. */
const MAX_MOD = 16

let счётчик = 0

/** Короткий уникальный id цели: не крипто, просто чтобы не совпали в пати. */
export function idЦели(): string {
  счётчик += 1
  return `g${Date.now().toString(36)}${счётчик.toString(36)}`
}

/** Предмет внутри цели. */
export interface ЦельПредмет {
  itemId: number
  /**
   * Заточка, если нужна конкретная: +0…+16.
   *
   * Не задана — значит «любая». Разница большая: «Кольцо Печати» и «Кольцо
   * Печати +14» — разные цели, и вторая сильно дороже.
   */
  mod?: number
  count: number
  /** Добыт ли именно этот предмет. */
  готово: boolean
  /** Когда отмечен добытым. */
  готовоAt?: string
}

export interface Goal {
  id: string
  items: ЦельПредмет[]
  priority: 1 | 2 | 3
  /** Кто ищет: ник создателя цели. */
  seeker: string
  /** Для какого персонажа из пати. */
  forCharId?: string
  /**
   * Кто завёл цель: id персонажа или «Мастер».
   *
   * Пусто у целей, заведённых до появления поля. Такую цель не вёл никто из
   * нынешних, и закрыть её может только мастер — править чужим правом никто
   * не вправе.
   */
  создатель?: string
  note?: string
  /** Отклонена: не сделали и делать не будем. */
  rejected?: boolean
  rejectedAt?: string
}

/**
 * Разбор целей из базы.
 *
 * Принимаются обе формы: новая, где цель это список предметов, и старая, где
 * цель — это один предмет. Старая форма больше не пишется, но в базах у людей
 * она лежит, и молча выбросить её значит выбросить чужую работу.
 *
 * Форма определяется по каждому элементу отдельно, а не по наличию поля в
 * базе: список, где смешались старые и новые записи, разбирается целиком, а не
 * наполовину.
 */
export function normalizeGoals(сырое: unknown): Goal[] {
  if (!Array.isArray(сырое)) return []
  const out: Goal[] = []
  for (const запись of сырое) {
    if (!запись || typeof запись !== 'object') continue
    const ц = запись as Record<string, unknown>
    const предметы = предметыЗаписи(ц)
    // Цель без предметов бессмысленна: пустая карточка только занимает место.
    if (предметы.length === 0) continue
    out.push({
      id: typeof ц.id === 'string' && ц.id ? ц.id : idЦели(),
      items: предметы,
      priority: приоритет(ц.priority),
      seeker: typeof ц.seeker === 'string' ? ц.seeker : '',
      forCharId: typeof ц.forCharId === 'string' && ц.forCharId ? ц.forCharId : undefined,
      создатель: typeof ц.создатель === 'string' && ц.создатель ? ц.создатель : undefined,
      note: typeof ц.note === 'string' && ц.note ? ц.note : undefined,
      // Отказ несовместим с выполнением: если предметы добыты, цель сделана,
      // и «решено не делать» уже не про неё.
      rejected: предметы.some((п) => !п.готово) && ц.rejected === true,
      rejectedAt: ц.rejected === true && typeof ц.rejectedAt === 'string' ? ц.rejectedAt : undefined,
    })
  }
  return out
}

/** Предметы записи: новый список либо один предмет из старой формы. */
function предметыЗаписи(ц: Record<string, unknown>): ЦельПредмет[] {
  if (Array.isArray(ц.items)) {
    return ц.items.map((п) => нормальныйПредмет(п)).filter((п): п is ЦельПредмет => !!п)
  }
  // Старая хотелка: цель — это сам предмет, а готовность лежала в done.
  const один = нормальныйПредмет(
    ц,
    ц.done === true,
    typeof ц.doneAt === 'string' ? ц.doneAt : undefined,
  )
  return один ? [один] : []
}

/** Один предмет цели из чего угодно, что пришло по сети. */
function нормальныйПредмет(
  сырое: unknown,
  готово = false,
  готовоAt?: string,
): ЦельПредмет | null {
  if (!сырое || typeof сырое !== 'object') return null
  const п = сырое as Record<string, unknown>
  const itemId = Math.trunc(Number(п.itemId))
  if (!Number.isFinite(itemId) || itemId <= 0) return null
  const mod = Math.trunc(Number(п.mod))
  return {
    itemId,
    mod: Number.isFinite(mod) && mod > 0 ? Math.min(MAX_MOD, mod) : undefined,
    count: Math.max(1, Math.trunc(Number(п.count)) || 1),
    готово: готово || п.готово === true,
    готовоAt: готовоAt ?? (typeof п.готовоAt === 'string' ? п.готовоAt : undefined),
  }
}

function приоритет(сырое: unknown): 1 | 2 | 3 {
  const n = Math.trunc(Number(сырое))
  return n >= 1 && n <= 3 ? (n as 1 | 2 | 3) : 2
}

/** Готовность цели: сколько добыто из скольких и это в процентах. */
export function прогрессЦели(цель: Goal): {
  готово: number
  всего: number
  процент: number
} {
  const всего = цель.items.length
  const готово = цель.items.filter((п) => п.готово).length
  return { готово, всего, процент: всего ? Math.round((готово / всего) * 100) : 0 }
}

/** Добыты ли все предметы цели. */
export function цельВыполнена(цель: Goal): boolean {
  return цель.items.length > 0 && цель.items.every((п) => п.готово)
}

/** Когда цель закрылась: последний добытый предмет либо отказ. */
export function закрытаВ(цель: Goal): string | undefined {
  if (цель.rejected) return цель.rejectedAt
  if (!цельВыполнена(цель)) return undefined
  let последняя: string | undefined
  for (const п of цель.items) {
    if (п.готовоAt && (!последняя || п.готовоAt > последняя)) последняя = п.готовоAt
  }
  return последняя
}

export type СтатусЦели = 'активная' | 'выполнена' | 'отклонена'

export function статусЦели(цель: Goal): СтатусЦели {
  if (цель.rejected) return 'отклонена'
  return цельВыполнена(цель) ? 'выполнена' : 'активная'
}