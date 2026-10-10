/**
 * Сборщик данных с masterwork.wiki (вики Lu4: Gamma).
 *
 * Скрипт исполняется ВНУТРИ страницы вики обычным браузером, а не отдельным
 * HTTP-клиентом: сайт закрыт анти-DDoS защитой, которая требует выполнения
 * javascript и ставит сессионную cookie. Скрипт переиспользует уже
 * установленную браузером сессию и ходит по тем же адресам, что и сам сайт.
 *
 * robots.txt вики разрешает обход всего, кроме четырёх pdf. Запросы идут
 * последовательно с паузой, чтобы не нагружать сайт.
 *
 * Как пользоваться:
 *   1. Открыть https://masterwork.wiki/lu4-gamma/search?Search[search_type]=0
 *      и дождаться, пока пройдёт проверка браузера.
 *   2. Выполнить в консоли содержимое этого файла.
 *   3. Вызвать MW.СобратьСписок() — обойдёт пагинацию поиска по трём типам
 *      экипировки (оружие, доспехи, аксессуары) и соберёт все предметы.
 *   4. Вызывать MW.СобратьПартию(n) пока MW.готово() не станет true.
 *   5. Скачать части через MW.Скачать(номерЧасти) — каждая кладётся в
 *      data/masterwork/raw-NNN.json.
 *
 * Скрипт ничего не разбирает «на вкус»: он сохраняет как есть названия,
 * таблицы и подписи, а разбор делает scripts/build-catalog.mjs. Так при
 * обновлении видно, что именно изменилось на сайте.
 */
;(function () {
  if (window.MW) return

  const ОСНОВА = '/lu4-gamma'
  // Пауза между запросами. Защита вики обрывает сессию после нескольких
  // сотен запросов подряд, поэтому идём медленно: выкачка 3442 карточек
  // занимает около получаса, зато не мешает сайту.
  const ПАУЗА_МС = Number(window.MW_ПАУЗА || 450)
  const ПОПЫТОК = 4
  const ТИПЫ = [
    { код: 0, ключ: 'weapon', подпись: 'Оружие' },
    { код: 1, ключ: 'armor', подпись: 'Доспехи' },
    { код: 2, ключ: 'accessory', подпись: 'Аксессуар' },
  ]

  const MW = {
    meta: {
      сайт: 'masterwork.wiki',
      вики: 'lu4-gamma',
      начало: new Date().toISOString(),
      паузаМс: ПАУЗА_МС,
    },
    /** Краткая выжимка из списка: id, имя, иконка, грейд, тип. */
    краткий: {},
    /** Подробности из карточек, по id. */
    полный: {},
    /** id, которые не удалось прочитать. */
    ошибки: {},
    очередь: [],
    позиция: 0,
    запросов: 0,
    закончено: false,
  }

  const спит = (мс) => new Promise((r) => setTimeout(r, мс))

  async function взять(адрес) {
    let последняяОшибка = null
    for (let попытка = 1; попытка <= ПОПЫТОК; попытка++) {
      try {
        const r = await fetch(адрес, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
        MW.запросов++
        if (!r.ok) throw new Error('HTTP ' + r.status)
        return await r.text()
      } catch (e) {
        последняяОшибка = e
        // Видимо, сессия отвалилась: ждём и пробуем снова.
        await спит(ПАУЗА_МС * 5 * попытка)
      }
    }
    throw последняяОшибка || new Error('не удалось получить ' + адрес)
  }

  /** Таблица .flex-table → { заголовки, строки }. */
  function прочитатьТаблицу(узел) {
    if (!узел) return null
    const строки = [...узел.querySelectorAll('.flex-row')]
    if (!строки.length) return null
    const ячейки = (r) => [...r.querySelectorAll(':scope > .flex-cell')].map((c) => c.innerText.trim())
    const первая = строки[0]
    const этоШапка = первая.classList.contains('header-row')
    return {
      заголовки: этоШапка ? ячейки(первая) : [],
      строки: (этоШапка ? строки.slice(1) : строки).map(ячейки),
    }
  }

  /** Пара «подпись → значение» из блока .stat_line. */
  function прочитатьСтаты(корень) {
    const статы = {}
    корень.querySelectorAll('.stat_line').forEach((блок) => {
      const ключ = (блок.querySelector('.stat_name')?.innerText || '').trim()
      if (!ключ || ключ === 'Ограничения') return
      const блокЗначения = блок.querySelector('.stat_describe')
      if (блокЗначения) {
        const таблица = блокЗначения.querySelector('.flex-table')
        if (таблица) {
          статы[ключ] = { таблица: прочитатьТаблицу(таблица) }
          return
        }
        const текст = блокЗначения.innerText.replace(/\s+/g, ' ').trim()
        if (текст) статы[ключ] = текст
        return
      }
      // Значение иногда лежит во втором .stat_name, без обёртки.
      const имена = блок.querySelectorAll('.stat_name')
      if (имена.length > 1) статы[ключ] = имена[1].innerText.trim()
    })
    return статы
  }

  /** Ограничения: у каждого правила картинка check-yes или check-no. */
  function прочитатьОграничения(корень) {
    const блок = корень.querySelector('.stat_restrictions')
    if (!блок) return {}
    const итог = {}
    блок.querySelectorAll('.item_restriction').forEach((п) => {
      const знак = п.querySelector('img')?.getAttribute('src') || ''
      const имя = п.innerText.replace(/\s+/g, ' ').trim()
      if (!имя) return
      итог[имя] = знак.includes('check-yes')
    })
    return итог
  }

  /** Вкладки карточки: подпись → содержимое. */
  function прочитатьВкладки(корень) {
    const кнопки = [...корень.querySelectorAll('.items_nav.tabs .tab-toggle')]
    const панели = [...корень.querySelectorAll('.item_part.tab-content .tab-pane')]
    const итог = {}
    кнопки.forEach((к, i) => {
      const подпись = к.innerText.trim()
      const панель = панели[i]
      if (!подпись || !панель) return
      const таблицы = [...панель.querySelectorAll('.flex-table')].map(прочитатьТаблицу).filter(Boolean)
      итог[подпись] = {
        таблицы,
        текст: панель.innerText.replace(/\s+/g, ' ').trim().slice(0, 400),
      }
    })
    return итог
  }

  /** Разбор карточки предмета. Возвращает null, если это не карточка. */
  MW.Разобрать = function (html, краткий) {
    const d = new DOMParser().parseFromString(html, 'text/html')
    const голова = d.querySelector('.item_head')
    if (!голова) return null

    const узелИмени = голова.querySelector('.item-name__content')
    const клон = узелИмени ? узелИмени.cloneNode(true) : null
    if (клон) клон.querySelectorAll('.item-grade').forEach((n) => n.remove())
    const имя = клон ? клон.innerText.replace(/\s+/g, ' ').trim() : ''

    const путьТипа = (голова.querySelector('.item-name__type')?.innerText || '')
      .replace(/\s+/g, ' ')
      .trim()
    const части = путьТипа.split('/').map((s) => s.trim())

    return {
      id: краткий.id,
      имя: имя || краткий.имя,
      имяСписок: краткий.имя,
      грейд: (голова.querySelector('.item-grade')?.innerText || '').trim() || краткий.грейд,
      класс: краткий.класс || '',
      разряд: краткий.тип || '',
      иконка: голова.querySelector('.item-icon img')?.getAttribute('src') || краткий.иконка,
      адрес: `${ОСНОВА}/item/${краткий.slug}`,
      категория: части[0] || '',
      подтип: части[1] || '',
      слотНаСайте: части[2] || '',
      путьТипа,
      статы: прочитатьСтаты(d),
      ограничения: прочитатьОграничения(d),
      вкладки: прочитатьВкладки(d),
    }
  }

  /** Обход пагинации поиска: собирает краткую выжимку по всем предметам. */
  MW.СобратьСписок = async function () {
    for (const тип of ТИПЫ) {
      let страница = 1
      for (;;) {
        const адрес =
          `${ОСНОВА}/search/result?Search%5Bsearch_type%5D=0&per_page=100` +
          `&Search%5Bquery%5D=&Search%5Bitem_type%5D=${тип.код}&page=${страница}`
        const html = await взять(адрес)
        const d = new DOMParser().parseFromString(html, 'text/html')
        const строки = [...d.querySelectorAll('.find_items .flex-row:not(.header-row)')]
        let новых = 0
        for (const строка of строки) {
          const ссылка = строка.querySelector('a.item-name[href*="/lu4-gamma/item/"]')
          if (!ссылка) continue
          const m = ссылка.getAttribute('href').match(/\/item\/(\d+)-/)
          if (!m) continue
          const id = Number(m[1])
          if (MW.краткий[id]) continue
          const ячейки = [...строка.querySelectorAll('.flex-cell')]
          const контент = ссылка.querySelector('.item-name__content')
          const клон = контент ? контент.cloneNode(true) : null
          if (клон) клон.querySelectorAll('.item-grade, .item-class').forEach((n) => n.remove())
          MW.краткий[id] = {
            id,
            slug: ссылка.getAttribute('href').split('/').pop(),
            имя: (клон ? клон.innerText : '').replace(/\s+/g, ' ').trim(),
            иконка: ссылка.querySelector('.item-icon img')?.getAttribute('src') || '',
            грейд: ссылка.querySelector('.item-grade')?.innerText.trim() || '',
            класс: ссылка.querySelector('.item-class')?.innerText.trim() || '',
            тип: ячейки[1] ? ячейки[1].innerText.trim() : '',
            колонки: ячейки.length > 2 ? ячейки.slice(2).map((c) => c.innerText.trim()) : [],
            категория: тип.подпись,
          }
          новых++
        }
        if (новых === 0 || строки.length === 0) break
        страница++
        await спит(ПАУЗА_МС)
      }
    }
    MW.очередь = Object.values(MW.краткий).map((запись) => запись.id)
    MW.позиция = 0
    MW.закончено = false
    return Object.keys(MW.краткий).length
  }

  /** Обработать n карточек. Возвращает отчёт о ходе. */
  MW.СобратьПартию = async function (n) {
    let сделано = 0
    while (сделано < n && MW.позиция < MW.очередь.length) {
      const id = MW.очередь[MW.позиция]
      MW.позиция++
      try {
        const html = await взять(`${ОСНОВА}/item/${id}`)
        const разобран = MW.Разобрать(html, MW.краткий[id])
        if (разобран) MW.полный[id] = разобран
        else MW.ошибки[id] = 'страница не распознана'
      } catch (e) {
        MW.ошибки[id] = String((e && e.message) || e)
      }
      сделано++
      await спит(ПАУЗА_МС)
    }
    if (MW.позиция >= MW.очередь.length) MW.закончено = true
    return {
      сделано,
      позиция: MW.позиция,
      всего: MW.очередь.length,
      собрано: Object.keys(MW.полный).length,
      ошибок: Object.keys(MW.ошибки).length,
      запросов: MW.запросов,
      примерыОшибок: Object.entries(MW.ошибки).slice(0, 3),
    }
  }

  MW.готово = () => MW.закончено

  /**
   * Продолжить выкачку после перезагрузки страницы.
   * Сессию вики периодически обрывает, поэтому уже скачанные предметы
   * передаются обратно списком id — и повторно они не запрашиваются.
   */
  MW.Продолжить = function (собранные) {
    const есть = собранные instanceof Set ? собранные : new Set(собранные || [])
    MW.очередь = MW.очередь.filter((id) => !есть.has(String(id)) && !есть.has(id))
    MW.закончено = MW.очередь.length === 0
    return MW.очередь.length
  }

  /** Скачать часть данных: data/masterwork/raw-NNN.json */
  MW.Скачать = function (номерЧасти, размерЧасти) {
    const размер = размерЧасти || 400
    const все = Object.values(MW.полный)
    const кусок = все.slice(номерЧасти * размер, (номерЧасти + 1) * размер)
    const имя = `mw-raw-${String(номерЧасти).padStart(3, '0')}.json`
    const содержимое = JSON.stringify({
      meta: Object.assign({}, MW.meta, {
        часть: номерЧасти,
        частей: Math.ceil(все.length / размер),
        'в части': кусок.length,
        выкачано: MW.позиция,
        запросов: MW.запросов,
        ошибки: MW.ошибки,
      }),
      предметы: кусок,
    })
    const blob = new Blob([содержимое], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = имя
    document.body.appendChild(a)
    a.click()
    a.remove()
    return { имя, байт: содержимое.length, записей: кусок.length }
  }

  window.MW = MW
  console.log('[MW] сборщик готов. Дальше: await MW.СобратьСписок()')
})()