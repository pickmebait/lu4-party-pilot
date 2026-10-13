import { useEffect, useState } from 'react'

/** Сколько секунд надо подождать, прежде чем кнопка удаления оживёт. */
const ПАУЗА_СЕКУНД = 5

/**
 * Окно подтверждения необратимого действия.
 *
 * Пауза перед кнопкой — не украшение, а страховка от промаха: удаление
 * персонажа уносит его снаряжение, отсутствия и отметки о саб-классах, и
 * вернуть всё руками нельзя. Пять секунд — это ровно столько, чтобы рука,
 * нажавшая «удалить», поняла, что видит не то, и успела нажать «Отмена»,
 * не читая.
 *
 * Пауза идёт только пока окно открыто: если его закрыли и открыли снова,
 * отсчёт начинается заново, а не продолжается с прошлого раза.
 *
 * Escape отменяет — так же, как щелчок по фону.
 */
export function ConfirmModal({
  заголовок,
  текст,
  кнопка,
  onConfirm,
  onCancel,
}: {
  заголовок: string
  текст: string
  /** Подпись кнопки удаления: что именно удаляем. */
  кнопка: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const [осталось, setОсталось] = useState(ПАУЗА_СЕКУНД)

  useEffect(() => {
    const таймер = setInterval(() => {
      setОсталось((было) => {
        if (было <= 1) {
          clearInterval(таймер)
          return 0
        }
        return было - 1
      })
    }, 1000)
    return () => clearInterval(таймер)
  }, [])

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      {/*
        Escape ловится на самом окне, а не на кнопке удаления: фокус стоит на
        «Отмене», и слушатель на кнопке срабатывал бы только если бы её
        выбрали мышью. Событие всплывает от любого элемента внутри окна, так
        что срабатывает всегда, пока открыто окно.
      */}
      <div
        className="modal small"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel()
        }}
      >
        <h3>{заголовок}</h3>
        <p className="hint">{текст}</p>

        <div className="form-actions">
          <button
            className="btn danger"
            disabled={осталось > 0}
            onClick={onConfirm}
            title={осталось > 0 ? `Подождите ${осталось} с.` : undefined}
          >
            {осталось > 0 ? `${кнопка} (${осталось})` : кнопка}
          </button>
          <button className="btn" onClick={onCancel} autoFocus>
            Отмена
          </button>
        </div>
      </div>
    </div>
  )
}