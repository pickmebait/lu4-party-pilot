#!/usr/bin/env node
/**
 * Загружает секреты Worker'а из локального файла .dev.vars.
 *
 * Зачем не `wrangler secret put`: он спрашивает токен в терминале, и
 * единственный способ передать его — оказаться в переписке или ввести руками.
 * Этот скрипт берёт значение из файла на диске (который в .gitignore) и
 * отдаёт wrangler'у молча, ничего не печатая.
 */
import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const FILE = '.dev.vars'

if (!existsSync(FILE)) {
  console.error(`Нет файла ${FILE}`)
  console.error('Создай его с одной строкой:')
  console.error('  GITHUB_TOKEN=github_pat_…')
  process.exit(1)
}

const text = readFileSync(FILE, 'utf8')
const match = text.match(/^\s*GITHUB_TOKEN\s*=\s*(.+?)\s*$/m)

if (!match) {
  console.error(`В ${FILE} нет строки GITHUB_TOKEN=…`)
  process.exit(1)
}

const token = match[1].replace(/^["']|["']$/g, '')

if (!token || token.includes('…') || token.includes('...')) {
  console.error(`В ${FILE} вместо токена заглушка. Вставь настоящий токен.`)
  process.exit(1)
}

if (!/^(ghp_|github_pat_)/.test(token)) {
  console.error('Это не похоже на GitHub токен.')
  process.exit(1)
}

console.log(`Нашёл токен в ${FILE} (длина ${token.length}, значение не печатаю)`)

const secrets = { GITHUB_TOKEN: token }

const res = spawnSync('npx', ['wrangler', 'secret', 'bulk', JSON.stringify(secrets)], {
  stdio: ['ignore', 'inherit', 'inherit'],
  shell: true,
})

if (res.status !== 0) {
  console.error('wrangler вернул ошибку. Скорее всего, ты ещё не вошёл: npm run cf:login')
  process.exit(res.status ?? 1)
}

console.log('Секрет GITHUB_TOKEN загружен. Дальше: npm run cf:deploy')
