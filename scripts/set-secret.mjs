#!/usr/bin/env node
/**
 * Загружает секрет GITHUB_TOKEN в Worker.
 *
 * Почему не `wrangler secret put`: он спрашивает токен в терминале, и
 * единственный способ передать его — оказаться в переписке или ввести руками.
 * Поэтому значение берётся из файла .dev.vars (который в .gitignore) и
 * нигде не печатается.
 *
 * Порядок важен: сначала npm run cf:deploy, потом эта скрипт. Иначе
 * следующий деплой перезапишет секрет.
 *
 * Переменные окружения:
 *   CLOUDFLARE_API_TOKEN — токен Cloudflare (npm run cf:login или свой)
 *   CLOUDFLARE_ACCOUNT_ID — id аккаунта
 *   WORKER_URL — адрес Worker'а для проверки (необязательно)
 */
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const FILE = '.dev.vars'
const SECRET_NAME = 'GITHUB_TOKEN'

function fail(msg) {
  console.error(msg)
  process.exit(1)
}

if (!existsSync(FILE)) {
  fail(`Нет файла ${FILE}. Создай его с одной строкой:\n  ${SECRET_NAME}=github_pat_…`)
}

const match = readFileSync(FILE, 'utf8').match(/^\s*GITHUB_TOKEN\s*=\s*(.+?)\s*$/m)
if (!match) fail(`В ${FILE} нет строки ${SECRET_NAME}=…`)

const token = match[1].replace(/^["']|["']$/g, '')
if (!token || /…|\.\.\./.test(token)) fail(`В ${FILE} вместо токена заглушка. Вставь настоящий.`)
if (!/^(ghp_|github_pat_)/.test(token)) fail('Это не похоже на GitHub токен.')

console.log(`Токен взят из ${FILE} (длина ${token.length}, значение не печатаю)`)

// Отдаём токен в stdin, а не аргументом командной строки: так он не попадает
// ни в список процессов, ни в историю команд. cmd.exe кавычки в аргументах
// ломает, поэтому JSON-строками здесь не пойти.
try {
  execFileSync('npx.cmd', ['wrangler', 'secret', 'put', SECRET_NAME], {
    input: `${token}\n`,
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: true,
    env: process.env,
  })
  console.log(`Секрет ${SECRET_NAME} загружен. Дальше ничего делать не нужно.`)
} catch {
  fail(
    'Не получилось загрузить секрет через wrangler.\n' +
      'Чаще всего это значит, что нет доступа к Cloudflare — войди: npm run cf:login',
  )
}
