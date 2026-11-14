import { useState } from 'react'
import type { AuthMode } from '@/lib/partyAuth'
import { LandingFeatures } from './LandingFeatures'
import {
  LandingCta,
  LandingFooter,
  LandingHeader,
  LandingHero,
  LandingRoadmap,
  LandingStart,
} from './LandingSections'

/**
 * Лендинг для тех, кто ещё не вошёл в пати.
 *
 * Показывает, что уже работает (персонажи и расписание), и держит вход
 * прямо в первом экране: отдельная страница «о приложении» заставляла бы
 * искать кнопку входа по меню. Данные на скриншотах — настоящая пати
 * «Поросята», снятая из приложения, а не нарисованная витрина.
 */
export function Landing() {
  const [mode, setMode] = useState<AuthMode>('enter')

  return (
    <div className="landing">
      <LandingHeader onEnter={() => setMode('enter')} />
      <main id="top">
        <LandingHero mode={mode} onModeChange={setMode} />
        <LandingFeatures />
        <LandingStart />
        <LandingRoadmap />
        <LandingCta onEnter={setMode} />
      </main>
      <LandingFooter />
    </div>
  )
}
