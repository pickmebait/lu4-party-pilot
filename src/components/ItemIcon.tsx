import { useState } from 'react'
import type { CatalogItem } from '@/types'

/**
 * Иконка предмета.
 *
 * Часть иконок на lu4db.ru отсутствует (18 файлов отдают 404), поэтому
 * при ошибке загрузки показываем заглушку с первой буквой названия —
 * список остаётся читаемым, а не пустым.
 */
export function ItemIcon({
  item,
  name,
  size = 24,
}: {
  item?: CatalogItem | null
  name: string
  size?: number
}) {
  const [failed, setFailed] = useState(false)
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?'

  if (!item?.icon || failed) {
    return (
      <span
        className="icon-fallback"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
        aria-hidden="true"
      >
        {initial}
      </span>
    )
  }

  return (
    <img
      className="icon"
      src={`${import.meta.env.BASE_URL}${item.icon}`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}