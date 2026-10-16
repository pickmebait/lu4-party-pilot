/**
 * Клиент сервера Const Party Pilot.
 *
 * Токен пати — единственный способ доступа к общей базе. Он никак не связан
 * с GitHub: код приложения лежит на Pages, база — у Worker'а.
 *
 * Два вида токена, и разница между ними проверяется на сервере, а не здесь:
 * мастер-токен правит всех, токен персонажа — только того, кому выдан.
 */
import type { Db } from '@/types'

/** Вид доступа, которым открыли пати. */
export type Role = 'master' | 'char'

export interface TokenInfo {
  id: string
  charId: string
  /** Имя персонажа на момент чтения: могло смениться после выпуска. */
  charName: string
  createdAt: string
}

export interface PartyInfo {
  partyId: string
  name: string
  role: Role
  /** Чей это персонаж. Есть только у токена персонажа. */
  charId?: string | null
  charName?: string | null
  chars?: number
}

export interface PartyMeta extends PartyInfo {
  createdAt: string
  ownCharId: string | null
  updatedAt: string | null
  updatedBy: string | null
  /** Выпущенные токены. Приходят только мастеру. */
  tokens?: TokenInfo[]
}

export type ApiResult<T> =
  | {
      ok: true
      value: T
      /**
       * Сколько запросов дошло до сервера на самом деле.
       *
       * Один — всё прошло с первой попытки. Больше одного значит, что связь
       * оборвалась или зависла и запрос ушёл заново: сервер мог выполнить и
       * первый, поэтому человек должен знать, что запись была повторена.
       */
      попыток: number
    }
  | {
      ok: false
      error: string
      /**
       * Код ответа сервера.
       *
       * Нужен, чтобы отличить «токен недействителен» от «сервер не
       * дозвонился». Первое означает, что сохранённую сессию пора выбросить,
       * второе — что человек просто без связи и выбрасывать его нельзя.
       */
      статус?: number
      /** Пришло при 409: в базе лежит более свежая версия. */
      conflict?: Db
      /**
       * Пришло при 403: токену персонажа нельзя писать чужое, но правка
       * своего персонажа в сливании допустима. Пришедшая база — то, что
       * сейчас лежит на сервере.
       */
      forbidden?: { db: Db }
    }

/** Не выкидываем текст ошибки от сервера в пользовательский интерфейс как есть. */
function msg(e: unknown): string {
  if (e instanceof Error) return e.message
  return 'неизвестная ошибка'
}

/**
 * Сколько ждём ответа сервера, прежде чем считать связь пропавшей.
 *
 * Замер: из шестидесяти запросов шесть обрываются совсем, а удачные укладываются
 * в 0,2–1,9 секунды. Связь при этом не просто рвётся, а висит около минуты и
 * обрывается сама. Ждать своего предела почти бесполезно: вместо ответа человек
 * получит ошибку, только через минуту.
 *
 * Пятнадцать секунд — с запасом на самую долгую удачную запись (Worker ждёт
 * GitHub пятнадцать секунд) и вчетверо меньше минуты, на которой связи и рвутся.
 * Повторяемые запросы после обрыва уйдут заново и ответят за доли секунды.
 */
const ОЖИДАНИЕ_ОТВЕТА_МС = 15_000

/**
 * Предел ожидания для записи — вдвое короче.
 *
 * Замеры: удачная запись укладывается в 1,9 секунды, а зависшая связь рвётся
 * сама через минуту. Ждать своего предела бессмысленно, ответа всё равно не
 * будет, а повтор записи уже стоит в очереди: вдвое меньшее ожидание
 * превращает минуту в две попытки по полминуты.
 */
const ОЖИДАНИЕ_ЗАПИСИ_МС = 8_000

/**
 * После скольких секунд тишины отправляем запрос ещё раз, не дожидаясь первого.
 *
 * Замер: удачный ответ приходит за 0,25–1,9 секунды, а оборванная связь при
 * этом не рвётся сразу, а висит. Ждать её — значит смотреть на «Сохраняю…»
 * полминуты при правке, которая давно в базе. Четыре секунды — заведомо дольше
 * любого удачного ответа и вдвое меньше худшего случая, который мы сокращаем.
 *
 * Дублируется только то, что можно выполнить дважды безвредно. Выпуск токена
 * дублем нельзя: две одновременные выдачи отзывают друг друга, и человек получил
 * бы уже отозванный. Создание и удаление пати — по той же причине.
 */
const ПОРОГ_ДУБЛЯ_МС = 4000

/**
 * Запрос, который можно повторить после обрыва связи.
 *
 * Повторяемость задаёт не глагол, а смысл запроса, и решается на месте вызова,
 * а не разбором адреса: адрес общий у выпуска и отзыва токена, и повтор одного
 * из них безвреден, а другого — нет. По адресу это не различить.
 *
 * Не повторяются четыре вызова, и каждый по своей причине:
 *
 *   создание пати   — повтор создал бы вторую пати, а первая осталась бы сиротой;
 *   перевыпуск      — повтор отозвал бы только что выданный мастер-токен и выпустил бы другой;
 *   отзыв токена    — повтор пришёл бы на уже отозванный и вернул отказ там, где всё вышло;
 *   удаление пати   — то же: повтор пришёл бы на уже удалённую.
 *
 * Выпуск токена персонажа повторяется: токен, ответ о котором потерялся, не
 * достался никому, и повтор выпускает другой, а этот остаётся отозванным.
 */

interface CallInit extends RequestInit {
  token?: string
  /** Повторить запрос после обрыва связи. Ставится только там, где это безвредно. */
  повторяемая?: boolean
  /** Сколько ждать ответа этой попытки; по умолчанию общий предел. */
  ожидание?: number
}

interface CallInit extends RequestInit {
  token?: string
  /** Повторить запрос после обрыва связи. Ставится только там, где это безвредно. */
  повторяемая?: boolean
  /** Сколько ждать ответа этой попытки; по умолчанию общий предел. */
  ожидание?: number
  /**
   * Слать ли второй запрос, если первый не ответил за ПОРОГ_ДУБЛЯ_МС.
   *
   * Только чтение. Два чтения не спорят, а два одинаковых запроса на запись —
   * всегда: читают файл до записи, несут один отпечаток, и второй упирается в
   * изменившийся файл. На живом сервере это воспроизводилось в шести случаях
   * из шести, и человек, который правит пати один, видел «кто-то опередил».
   * Повтор записи последовательный: обрыв связи и сам отправляет запрос
   * заново, а второй одновременный только мешает.
   */
  дубль?: boolean
  /**
   * Сообщить, что понадобилась ещё одна попытка, пока запрос ещё идёт.
   *
   * Нужно интерфейсу, чтобы показать человеку «отправляю заново», а не молчать
   * двадцать секунд под надписью «Сохраняю…».
   */
  onRetry?: (попытка: number) => void
}

/** Одна попытка: разбор ответа либо отметка, что связи не было. */
type Попытка<T> =
  | { ответ: ApiResult<T>; обрыв: false }
  | { ответ: null; обрыв: true; прерван: boolean; причина: string }

/** Только отрыв связи: у него нет ответа, есть причина. */
type Обрыв = Extract<Попытка<unknown>, { обрыв: true }>

/** Только отказ сервера: у него есть код и, иногда, пришедшая база. */
type Отказ<T> = Extract<ApiResult<T>, { ok: false }>

async function однаПопытка<T>(url: string, init: CallInit, headers: Record<string, string>): Promise<Попытка<T>> {
  const отмена = new AbortController()
  const будильник = setTimeout(() => отмена.abort(), init.ожидание ?? ОЖИДАНИЕ_ОТВЕТА_МС)
  try {
    const res = await fetch(url, { ...init, headers, signal: отмена.signal })
    let json: any = null
    try {
      json = await res.json()
    } catch {
      /* ответ без тела */
    }

    if (res.status === 401) {
      return { обрыв: false, ответ: { ok: false, статус: res.status, error: 'Токен не подходит. Проверь его или запроси новый у мастера пати.' } }
    }
    if (res.status === 403) {
      return {
        обрыв: false,
        ответ: {
          ok: false,
          статус: res.status,
          error: json?.error ?? 'Недостаточно прав',
          forbidden: json?.db ? { db: json.db as Db } : undefined,
        },
      }
    }
    if (res.status === 404) {
      return { обрыв: false, ответ: { ok: false, статус: res.status, error: json?.error ?? 'Не найдено' } }
    }
    if (res.status === 409) {
      return {
        обрыв: false,
        ответ: {
          ok: false,
          статус: res.status,
          error: json?.error ?? 'В базе есть более свежая версия',
          conflict: json?.db,
        },
      }
    }
    if (!res.ok) {
      return { обрыв: false, ответ: { ok: false, error: json?.error ?? `Сервер ответил ${res.status}` } }
    }
    return { обрыв: false, ответ: { ok: true, value: json as T, попыток: 1 } }
  } catch (e) {
    return {
      обрыв: true,
      прерван: отмена.signal.aborted,
      причина: msg(e),
      ответ: null,
    }
  } finally {
    clearTimeout(будильник)
  }
}

/**
 * Один запрос к серверу, с дублем и повтором.
 *
 * Замер с живого сайта: из тридцати попыток пять обрываются совсем, а удачные
 * ответы приходят за 0,25–1,9 секунды. Связь при этом не рвётся сразу, а висит
 * около получаса и обрывается сама. Из этого три следствия.
 *
 * Дубль. Если за четыре секунды ответа нет, уходит второй запрос. Первый при
 * этом не отменяется: он ещё может ответить, и тогда человек получит ответ с
 * задержкой четыре секунды вместо тридцати.
 *
 * Повтор. Если попытка оборвалась, а других в этот момент нет в работе, идёт
 * ещё одна. Повтор идёт только после обрыва: ответ пришёл — значит, связь была,
 * и второй запрос просто нагрузит сервер.
 *
 * Побеждает успех, а не первый ответ. Это важно для записи базы: два одинаковых
 * запроса доходят до сервера, первый записывает, второй получает 409 про
 * собственную же запись. Если взять первый ответ, человек увидит ложный
 * конфликт. Поэтому отказ ждёт, пока кончатся все попытки, и только тогда
 * показывается.
 */
async function call<T>(base: string, path: string, init: CallInit = {}): Promise<ApiResult<T>> {
  const url = `${base.replace(/\/+$/, '')}${path}`
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  }
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'
  if (init.token) headers.Authorization = `Bearer ${init.token}`

  // Служебные поля не уходят на сервер: fetch их не знает и бросил бы ошибку.
  const чистые: CallInit = {
    method: init.method,
    body: init.body,
    signal: init.signal,
    ожидание: init.ожидание,
  }

  let отправлено = 0
  let решён = false
  let успех: { ok: true; value: T; попыток: number } | null = null
  const отказы: Отказ<T>[] = []
  const обрывы: Обрыв[] = []

  /** Ответили все, кого ждали, — пора показывать отказ. */
  let закончить: () => void = () => undefined
  const всеЗакончили = new Promise<void>((окончить) => {
    закончить = окончить
  })

  const отказВОбрыв = (): ApiResult<T> => {
    const былПрерван = обрывы.some((о) => о.прерван)
    const последний = обрывы[обрывы.length - 1]
    return {
      ok: false,
      статус: 0,
      error: былПрерван
        ? 'Сервер не ответил вовремя. Правка, возможно, уже записана — вернись на вкладку, база подтянется сама.'
        : `Не удалось связаться с сервером. Проверь адрес и интернет. (${последний?.причина ?? 'нет ответа'})`,
    }
  }

  let живых = 0

  const отправить = () => {
    живых++
    отправлено++
    const номер = отправлено
    void однаПопытка<T>(url, чистые, headers).then((итог) => {
      живых--
      if (решён) return

      if (итог.обрыв) {
        обрывы.push(итог)
      } else if (итог.ответ.ok) {
        успех = { ...итог.ответ, попыток: отправлено }
        решён = true
        закончить()
        return
      } else {
        /*
         * Отказ не закрывает запрос: другая попытка ещё в работе и может
         * ответить успехом. Отмены по базе приходят именно так — двумя
         * одинаковыми запросами, где второй получает 409 на запись первого.
         */
        отказы.push(итог.ответ as Отказ<T>)
      }

      if (живых > 0) return

      // Последняя попытка в работе: можно и повторить после обрыва.
      if (
        init.повторяемая === true &&
        номер === 1 &&
        отправлено < 2 &&
        итог.обрыв === true
      ) {
        init.onRetry?.(2)
        отправить()
        return
      }

      решён = true
      закончить()
    })
  }

  отправить()

  let таймерДубля: ReturnType<typeof setTimeout> | null = null
  if (init.дубль === true) {
    таймерДубля = setTimeout(() => {
      // Дубль не нужен, если вторая попытка уже ушла: при мгновенном обрыве
      // повтор успевает начаться раньше, чем дойдёт дело до порога, и два
      // механизма выпустили бы три запроса вместо двух.
      if (решён || живых === 0 || отправлено > 1) return
      init.onRetry?.(отправлено + 1)
      отправить()
    }, ПОРОГ_ДУБЛЯ_МС)
  }

  await всеЗакончили
  if (таймерДубля !== null) clearTimeout(таймерДубля)

  if (успех) return успех
  // Из отказов важнее тот, что говорит о деле, а не о связи.
  const поДелу = отказы.find((о) => о.статус !== 0)
  return поДелу ?? отказВОбрыв()
}

/** Создаёт новую пати. Мастер-токен приходит один раз и больше не показывается. */
export async function createParty(apiUrl: string, name: string): Promise<ApiResult<PartyInfo & { token: string }>> {
  return call<PartyInfo & { token: string }>(apiUrl, '/api/party', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

/** Проверяет токен и узнаёт, в какую пати и с каким правом он ведёт. */
export async function openSession(apiUrl: string, token: string): Promise<ApiResult<PartyInfo>> {
  return call<PartyInfo>(apiUrl, '/api/session', {
    method: 'POST',
    повторяемая: true,
    дубль: true,
    body: JSON.stringify({ token }),
  })
}

export async function fetchDb(apiUrl: string, token: string): Promise<ApiResult<Db>> {
  return call<Db>(apiUrl, '/api/party/data', { method: 'GET', token, повторяемая: true, дубль: true })
}

/**
 * Сохраняет базу.
 * baseUpdatedAt — версия, от которой клиент отталкивался. Сервер откажет,
 * если в базе уже есть другая, более свежая.
 */
export async function saveDb(
  apiUrl: string,
  token: string,
  db: Db,
  baseUpdatedAt: string,
  onRetry?: (попытка: number) => void,
): Promise<ApiResult<{ updatedAt: string }>> {
  return call<{ updatedAt: string }>(apiUrl, '/api/party/data', {
    method: 'PUT',
    token,
    повторяемая: true,
    onRetry,
    ожидание: ОЖИДАНИЕ_ЗАПИСИ_МС,
    body: JSON.stringify({ db, baseUpdatedAt }),
  })
}

export async function fetchMeta(apiUrl: string, token: string): Promise<ApiResult<PartyMeta>> {
  return call<PartyMeta>(apiUrl, '/api/party/meta', { method: 'GET', token, повторяемая: true, дубль: true })
}

/**
 * Переименование пати.
 *
 * Имя живёт не в базе, а в шапке файла пати: правка базы тянула бы за собой
 * копию базы у каждого, кто вошёл, из-за одной строки в шапке.
 */
export async function renameParty(
  apiUrl: string,
  token: string,
  name: string,
): Promise<ApiResult<{ ok: true; name: string }>> {
  return call<{ ok: true; name: string }>(apiUrl, '/api/party/name', {
    method: 'PATCH',
    token,
    повторяемая: true,
    дубль: true,
    body: JSON.stringify({ name }),
  })
}

/**
 * Перевыпуск мастер-токена. Прежний перестаёт работать сразу, и вместе с
 * ним перестают работать все токены персонажей: держать потерянный доступ в
 * руках того, у кого его увели, нельзя.
 */
export async function rotateMaster(
  apiUrl: string,
  token: string,
): Promise<ApiResult<{ token: string; partyId: string; name: string }>> {
  return call<{ token: string; partyId: string; name: string }>(apiUrl, '/api/party/rotate', {
    method: 'POST',
    token,
  })
}

/**
 * Выпуск токена персонажа. На того же персонажа это перевыпуск: прежний
 * отзывается, новый приходит один раз и показывается только здесь.
 */
export async function issueCharToken(
  apiUrl: string,
  token: string,
  charId: string,
): Promise<ApiResult<{ token: string; charId: string; charName: string }>> {
  return call<{ token: string; charId: string; charName: string }>(apiUrl, '/api/party/tokens', {
    method: 'POST',
    token,
    повторяемая: true,
    body: JSON.stringify({ charId }),
  })
}

/** Отзыв одного токена персонажа. */
export async function revokeToken(
  apiUrl: string,
  token: string,
  id: string,
): Promise<ApiResult<{ ok: true }>> {
  return call<{ ok: true }>(apiUrl, `/api/party/tokens?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    token,
  })
}

/** Удаление пати целиком. Восстановить базу после неё нельзя. */
export async function deleteParty(
  apiUrl: string,
  token: string,
): Promise<ApiResult<{ ok: true; partyId: string }>> {
  return call<{ ok: true; partyId: string }>(apiUrl, '/api/party', { method: 'DELETE', token })
}