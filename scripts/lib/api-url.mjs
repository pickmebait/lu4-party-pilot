/** Адрес воркера для скриптов. Один на все: чтобы нигде не расходился. */
export const API_URL = (
  process.env.PP_API_URL ?? 'https://lu4-party-pilot.lu4-pilot.workers.dev'
).replace(/\/+$/, '')