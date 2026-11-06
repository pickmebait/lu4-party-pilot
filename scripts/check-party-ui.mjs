/**
 * Проверка таблицы токенов без браузера.
 *
 * Даты токенов должны читаться в поясе пользователя так же, как время в
 * расписании. Ошибка здесь тихая: таблица нарисуется, только покажет не те
 * часы — и человек будет искать, когда на самом деле входил. Поэтому
 * компонент вызывается с настоящими метками и фиксированными поясами, а
 * ответ проверяется по разметке.
 */
import { build } from 'esbuild'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const ТЕСТ = `
import { renderToStaticMarkup } from 'react-dom/server'
import { TokensTable } from '@/components/PartyTokens.tsx'

let пройдено = 0
const ошибки: string[] = []
const равно = (подпись: string, получили: unknown, ждём: unknown) => {
  пройдено++
  if (JSON.stringify(получили) !== JSON.stringify(ждём)) {
    ошибки.push(подпись + ': получили ' + JSON.stringify(получили) + ', ждём ' + JSON.stringify(ждём))
  }
}
const есть = (подпись: string, текст: string, фрагмент: string) => {
  пройдено++
  if (!текст.includes(фрагмент)) ошибки.push(подпись + ': нет «' + фрагмент + '»')
}
const нет = (подпись: string, текст: string, фрагмент: string) => {
  пройдено++
  if (текст.includes(фрагмент)) ошибки.push(подпись + ': лишнее «' + фрагмент + '»')
}

const токены = [
  {
    id: 't1',
    charId: 'c1',
    charName: 'PickMe',
    createdAt: '2026-10-22T15:29:29.090Z',
    lastUsedAt: null,
  },
  {
    id: 't2',
    charId: 'c2',
    charName: 'Ирока',
    createdAt: '2026-10-22T15:31:36.092Z',
    lastUsedAt: '2026-11-03T09:33:28.623Z',
  },
]

const пусто = renderToStaticMarkup(
  <TokensTable
    токены={[]}
    пояс="Europe/Moscow"
    занят={null}
    onПеревыпустить={() => {}}
    onОтозвать={() => {}}
  />,
)
равно('пустой список не рисует пустую таблицу', пусто, '')

const москва = renderToStaticMarkup(
  <TokensTable
    токены={токены}
    пояс="Europe/Moscow"
    занят={null}
    onПеревыпустить={() => {}}
    onОтозвать={() => {}}
  />,
)
есть('таблица имеет свой скролл', москва, 'party-token-scroll')
есть('колонка персонажа', москва, 'Персонаж')
есть('колонка создания', москва, 'Создан')
есть('колонка активности', москва, 'Активность')
есть('создание в поясе Москвы', москва, '2026-10-22 18:29')
есть('активность в поясе Москвы', москва, '2026-11-03 12:33')
есть('без входа написано «не было»', москва, 'не было')
есть('кнопка перевыпуска подписана именем', москва, 'Перевыпустить токен PickMe')
есть('кнопка отзыва подписана именем', москва, 'Отозвать токен Ирока')
равно('«не было» выделено только у токена без входа', (москва.match(/party-token-none/g) ?? []).length, 1)

const восток = renderToStaticMarkup(
  <TokensTable
    токены={токены}
    пояс="Asia/Vladivostok"
    занят={null}
    onПеревыпустить={() => {}}
    onОтозвать={() => {}}
  />,
)
есть('создание во Владивостоке перешло на следующую дату', восток, '2026-10-23 01:29')
есть('активность во Владивостоке', восток, '2026-11-03 19:33')
нет('московское время не осталось', восток, '2026-10-22 18:29')
нет('московская активность не осталась', восток, '2026-11-03 12:33')

const занят = renderToStaticMarkup(
  <TokensTable
    токены={токены}
    пояс="Europe/Moscow"
    занят="t1"
    onПеревыпустить={() => {}}
    onОтозвать={() => {}}
  />,
)
равно('занятый токен блокирует обе кнопки', (занят.match(/disabled/g) ?? []).length, 2)

export default { пройдено, ошибки }
`

/*
 * Сборка лежит внутри node_modules проекта, а не в системной временной
 * папке: react и react-dom остаются внешними, и Node ищет их вверх по
 * каталогам. Из системного temp он их не найдёт.
 */
const папка = mkdtempSync(join(process.cwd(), 'node_modules', '.pp-party-ui-'))
const вход = join(папка, 'тест.tsx')
const выход = join(папка, 'тест.mjs')
writeFileSync(вход, ТЕСТ, 'utf8')

try {
  await build({
    entryPoints: [вход],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    outfile: выход,
    jsx: 'automatic',
    logLevel: 'silent',
    packages: 'external',
    alias: { '@': new URL('../src', import.meta.url).pathname.replace(/^[/\\]([A-Za-z]:)/, '$1') },
  })
  const модуль = await import(pathToFileURL(выход).href)
  const { пройдено, ошибки } = модуль.default
  if (ошибки.length) {
    console.error(`ПРОВАЛЕНО ${ошибки.length} из ${пройдено}:`)
    for (const о of ошибки) console.error('  ✗ ' + о)
    process.exit(1)
  }
  console.log(`ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ (${пройдено})`)
} finally {
  rmSync(папка, { recursive: true, force: true })
}
