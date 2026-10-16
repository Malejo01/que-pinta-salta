/**
 * QPS-158 (Fase 2 de la R30, revisión del #54): en /buscar, el corazón de la
 * tarjeta y el del modal del mismo evento muestran lo mismo.
 *
 * - `FavoriteButton` avisa con `onChange(favorited)` cuando el servidor
 *   confirma, y sigue a `initialIsFavorite` si el padre lo cambia (ajuste
 *   durante el render, no un efecto: `react-hooks/set-state-in-effect`).
 * - `EventCard` y `EventModal` le pasan ese aviso al padre con el id.
 * - `/buscar` tiene una sola lista (`favorites`) y la actualiza desde los dos.
 *
 * Sin DOM (entorno node): detector estático sobre el código fuente.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

describe('FavoriteButton: avisa y sigue al padre', () => {
  const src = read('components/favorite-button.tsx')

  it('acepta onChange y lo llama con el estado confirmado por el servidor (después de los errores, antes del toast)', () => {
    expect(src).toMatch(/onChange\?:\s*\(favorited: boolean\) => void/)
    const llamada = src.indexOf('onChange?.(!!result.favorited)')
    expect(llamada).toBeGreaterThan(src.indexOf('if (result.error)'))
    expect(llamada).toBeLessThan(src.indexOf('if (result.favorited)'))
  })

  it('si cambia initialIsFavorite, el estado lo sigue sin useEffect', () => {
    expect(src).toMatch(/if \(initialIsFavorite !== initialPrevio\)/)
    expect(src).not.toMatch(/useEffect/)
  })
})

describe('/buscar: la tarjeta y el modal actualizan la misma lista', () => {
  it('EventCard pasa el aviso del corazón a onToggleFavorite con el id del evento', () => {
    const src = read('components/event-card.tsx')
    expect(src).toMatch(/onToggleFavorite\?:\s*\(eventId: string, favorited: boolean\) => void/)
    expect(src).toMatch(/onChange=\{onToggleFavorite \? \(favorited\) => onToggleFavorite\(event\.id, favorited\) : undefined\}/)
  })

  it('EventModal pasa el aviso del corazón a onFavoriteChange con el id del evento', () => {
    const src = read('components/event-modal.tsx')
    expect(src).toMatch(/onChange=\{onFavoriteChange \? \(favorited\) => onFavoriteChange\(event\.id, favorited\) : undefined\}/)
  })

  it('buscar-content conecta los dos a handleToggleFavorite, que fija el estado (no lo invierte)', () => {
    const src = read('app/buscar/buscar-content.tsx')
    expect(src).toMatch(/onToggleFavorite=\{handleToggleFavorite\}/)
    expect(src).toMatch(/onFavoriteChange=\{handleToggleFavorite\}/)
    expect(src).toMatch(/handleToggleFavorite = \(eventId: string, favorited: boolean\)/)
  })
})
