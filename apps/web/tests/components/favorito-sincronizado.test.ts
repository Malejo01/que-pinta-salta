/**
 * QPS-158 (Fase 2 de la R30, revisión del #54), reescrito en la R47 (tarea
 * 47-q) porque la R47-c (QPS-197/QPS-199) movió el ♥ del encabezado del
 * modal de Buscar a la fila de acciones: en `/buscar`, el corazón de la
 * tarjeta (`EventCard`) y el de la fila dentro del modal del mismo evento
 * (`FilaAccionesEvento`, dibujada por `BotonesAsistenciaDiferidos`) tienen
 * que mostrar lo mismo.
 *
 * La cadena de hoy (ya NO es "EventModal dibuja FavoriteButton"):
 *   `FilaAccionesEvento` (el ♥) llama a `onGuardadoChange(guardado)`
 *     → `BotonesAsistenciaDiferidos` lo pasa a `onFavoriteChange(eventId, guardado)`
 *       → `event-modal.tsx` reenvía esa prop tal cual
 *         → `app/buscar/buscar-content.tsx` la conecta a `handleToggleFavorite`,
 *           la misma función que usa `EventCard` (`onToggleFavorite`): una
 *           sola lista (`favorites`) para los dos lados.
 *
 * Lo nuevo de esta ronda (QPS-197: Voy contenido en Guardados) y lo más
 * fácil de romper: `onGuardadoChange` TAMBIÉN se tiene que disparar cuando
 * el ♥ cambia por efecto de marcar/sacar ✓ Voy (marcar Voy también guarda),
 * no solo cuando se toca el ♥ directamente.
 *
 * - `FavoriteButton` (la tarjeta, sin cambios de esta ronda) avisa con
 *   `onChange(favorited)` cuando el servidor confirma, y sigue a
 *   `initialIsFavorite` si el padre lo cambia (ajuste durante el render, no
 *   un efecto: `react-hooks/set-state-in-effect`).
 * - `EventCard` le pasa ese aviso al padre con el id (`onToggleFavorite`).
 *
 * Sin DOM (entorno node): detector estático sobre el código fuente.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { quitarComentarios } from '@qps/core/tests/convencion-entorno'

const ROOT = join(__dirname, '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

describe('FavoriteButton (la tarjeta): avisa y sigue al padre', () => {
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

describe('EventCard: pasa el aviso del corazón al padre con el id del evento', () => {
  it('onToggleFavorite con la firma correcta, conectado a FavoriteButton', () => {
    const src = read('components/event-card.tsx')
    expect(src).toMatch(/onToggleFavorite\?:\s*\(eventId: string, favorited: boolean\) => void/)
    expect(src).toMatch(/onChange=\{onToggleFavorite \? \(favorited\) => onToggleFavorite\(event\.id, favorited\) : undefined\}/)
  })
})

// ---------------------------------------------------------------------------
// La cadena nueva (R47-c): FilaAccionesEvento → BotonesAsistenciaDiferidos →
// event-modal.tsx → buscar-content.tsx.
// ---------------------------------------------------------------------------
describe('FilaAccionesEvento: onGuardadoChange se dispara al tocar el ♥ Y cuando el ♥ cambia por un Voy', () => {
  const src = read('components/fila-acciones-evento.tsx')

  it('la prop existe con la firma correcta', () => {
    expect(src).toMatch(/onGuardadoChange\?:\s*\(guardado: boolean\) => void/)
  })

  it('alTocarGuardar: avisa en el optimista y, si el servidor corrige, otra vez con el valor final', () => {
    const inicioFuncion = src.indexOf('async function alTocarGuardar')
    const inicioOtraFuncion = src.indexOf('async function alTocarVoy')
    expect(inicioFuncion).toBeGreaterThan(-1)
    expect(inicioOtraFuncion).toBeGreaterThan(inicioFuncion)
    const cuerpo = src.slice(inicioFuncion, inicioOtraFuncion)

    // Aviso optimista, antes de llamar al servidor.
    expect(cuerpo).toMatch(/onGuardadoChange\?\.\(guardadoOptimista\)/)
    // Si el servidor no confirma el optimista (p. ej. voyQuitado cambió el
    // valor final), se avisa otra vez con el valor real.
    expect(cuerpo).toMatch(/if \(guardadoFinal !== guardadoOptimista\) onGuardadoChange\?\.\(guardadoFinal\)/)
    // Si falla, se vuelve al valor anterior y se avisa ese valor (no se deja
    // al padre con el optimista que nunca pasó).
    expect(cuerpo).toMatch(/onGuardadoChange\?\.\(anterior\.guardado\)/)
  })

  it('alTocarVoy: camino NUEVO de esta ronda — si marcar/sacar Voy cambia el ♥, también avisa (sin esto, QPS-158 se rompe para Voy)', () => {
    const inicioFuncion = src.indexOf('async function alTocarVoy')
    expect(inicioFuncion).toBeGreaterThan(-1)
    const cuerpo = src.slice(inicioFuncion)

    // El resultado exitoso de marcarAsistencia('voy') puede traer un
    // "guardado" distinto del que tenía la pantalla (marcar Voy también
    // guarda): si cambió, FilaAccionesEvento tiene que avisar al padre.
    expect(cuerpo).toMatch(
      /if \(previo\.guardado !== resultado\.guardado\) onGuardadoChange\?\.\(resultado\.guardado!?\)/,
    )
  })

  it('no hay ningún onGuardadoChange comentado o deshabilitado en alTocarVoy (detector real, no un string cualquiera)', () => {
    const inicioFuncion = src.indexOf('async function alTocarVoy')
    const cuerpo = src.slice(inicioFuncion)
    const limpio = quitarComentarios(cuerpo)
    expect(limpio).toContain('onGuardadoChange?.(')
  })
})

describe('BotonesAsistenciaDiferidos: conecta onFavoriteChange(eventId, guardado) a onGuardadoChange de la fila', () => {
  const src = read('components/botones-asistencia-diferidos.tsx')

  it('acepta onFavoriteChange con la firma de QPS-158', () => {
    expect(src).toMatch(/onFavoriteChange\?:\s*\(eventId: string, favorited: boolean\) => void/)
  })

  it('le pasa a FilaAccionesEvento un onGuardadoChange que llama a onFavoriteChange con el eventId', () => {
    expect(src).toMatch(
      /onGuardadoChange=\{onFavoriteChange \? \(guardado\) => onFavoriteChange\(eventId, guardado\) : undefined\}/,
    )
  })

  it('el ♥ inicial es el isFavorite que ya trajo /buscar (no espera a obtenerAsistencia)', () => {
    expect(src).toMatch(/let guardadoInicial = isFavorite/)
  })
})

describe('event-modal.tsx: ya NO dibuja FavoriteButton directo — delega el ♥ en BotonesAsistenciaDiferidos', () => {
  const src = read('components/event-modal.tsx')

  it('no importa FavoriteButton (se mudó a la fila, R47-c)', () => {
    expect(src).not.toContain('from "@/components/favorite-button"')
    expect(src).not.toContain('<FavoriteButton')
  })

  it('reenvía isFavorite/onFavoriteChange/haySesion a BotonesAsistenciaDiferidos tal cual', () => {
    expect(src).toContain('import { BotonesAsistenciaDiferidos, BotonesSeguirDiferidos } from "@/components/botones-asistencia-diferidos"')
    expect(src).toMatch(
      /<BotonesAsistenciaDiferidos[\s\S]*?isFavorite={isFavorite}[\s\S]*?onFavoriteChange={onFavoriteChange}/,
    )
  })
})

describe('/buscar: la tarjeta y el modal actualizan la misma lista', () => {
  it('buscar-content conecta los dos a handleToggleFavorite, que fija el estado (no lo invierte)', () => {
    const src = read('app/buscar/buscar-content.tsx')
    expect(src).toMatch(/onToggleFavorite=\{handleToggleFavorite\}/)
    expect(src).toMatch(/onFavoriteChange=\{handleToggleFavorite\}/)
    expect(src).toMatch(/const handleToggleFavorite = \(eventId: string, favorited: boolean\)/)
  })
})
