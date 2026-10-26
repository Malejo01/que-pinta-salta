/**
 * `contenidoAvisoPatrocinado` y `validarTextosCampania` (Ronda 70, tarea 70-c),
 * de `packages/core/src/notificaciones/patrocinados.ts`. Puros. Complementan
 * `tests/core/notificaciones-patrocinados.test.ts` (que no los cubre).
 */
import { describe, expect, it } from 'vitest'
import {
  CATEGORIA_PATROCINADO,
  ETIQUETA_PATROCINADO,
  LARGO_MAXIMO_CUERPO,
  LARGO_MAXIMO_TITULO,
  contenidoAvisoPatrocinado,
  tituloAvisoPatrocinado,
  validarCampania,
  validarTextosCampania,
} from '@qps/core/notificaciones/patrocinados'
import { urlEvento } from '@qps/core/metricas/links'

const EVENTO = '0b9d4f5a-6a2b-4c1e-8f3d-9a7b6c5d4e3f'

describe('contenidoAvisoPatrocinado', () => {
  it('título con la etiqueta "Patrocinado", cuerpo tal cual, categoría y data con url y tipo', () => {
    const c = contenidoAvisoPatrocinado({ titulo: 'Entradas 2x1', cuerpo: 'Texto de prueba', eventId: EVENTO })
    expect(c).toEqual({
      title: `${ETIQUETA_PATROCINADO} · Entradas 2x1`,
      body: 'Texto de prueba',
      categoryId: CATEGORIA_PATROCINADO,
      data: { url: urlEvento(EVENTO, 'app'), tipo: CATEGORIA_PATROCINADO },
    })
  })

  it('el título sale de tituloAvisoPatrocinado (una sola fuente)', () => {
    expect(contenidoAvisoPatrocinado({ titulo: 'X', cuerpo: 'Y', eventId: EVENTO })?.title).toBe(tituloAvisoPatrocinado('X'))
  })

  it.each([[''], ['no-es-uuid'], ['../../admin'], ['0b9d4f5a-6a2b-4c1e-8f3d']])('eventId %j sin link válido: null (no se manda un patrocinado sin ficha)', (eventId) => {
    expect(contenidoAvisoPatrocinado({ titulo: 'X', cuerpo: 'Y', eventId })).toBeNull()
  })

  it('el link usa el origen "app"', () => {
    const c = contenidoAvisoPatrocinado({ titulo: 'X', cuerpo: 'Y', eventId: EVENTO })
    expect(c?.data.url).toContain('o=app')
  })
})

describe('validarTextosCampania', () => {
  const ok = (extra: Record<string, unknown> = {}) => ({ titulo: 'Entradas 2x1', cuerpo: 'Texto de prueba', ...extra })

  it('válida: devuelve título y cuerpo recortados', () => {
    expect(validarTextosCampania(ok({ titulo: '  Hola  ', cuerpo: '  Chau  ' }))).toEqual({ ok: true, titulo: 'Hola', cuerpo: 'Chau' })
  })

  it('no pide eventId ni fechas', () => {
    expect(validarTextosCampania(ok()).ok).toBe(true)
  })

  it('límites: título 50 y cuerpo 150 entran; 51 y 151 no', () => {
    expect(LARGO_MAXIMO_TITULO).toBe(50)
    expect(LARGO_MAXIMO_CUERPO).toBe(150)
    expect(validarTextosCampania(ok({ titulo: 'a'.repeat(50), cuerpo: 'b'.repeat(150) })).ok).toBe(true)
    expect(validarTextosCampania(ok({ titulo: 'a'.repeat(51) })).ok).toBe(false)
    expect(validarTextosCampania(ok({ cuerpo: 'b'.repeat(151) })).ok).toBe(false)
  })

  it.each([[''], ['   '], [undefined], [null], [7]])('título %j: rechazado', (titulo) => {
    expect(validarTextosCampania(ok({ titulo })).ok).toBe(false)
  })

  it.each([['salto', 'a\nb'], ['tab', 'a\tb'], ['NUL', `a${String.fromCharCode(0)}b`]])('control (%s): rechazado', (_n, titulo) => {
    expect(validarTextosCampania(ok({ titulo })).ok).toBe(false)
  })

  it.each(['actualización', 'Seguridad', 'tu cuenta', 'GOOGLE', 'android', 'sistema', 'ALERTA', 'urgente', 'ACTUALIZACION'])(
    'palabra que imita al sistema "%s" en el título: rechazada (sin importar tildes ni mayúsculas)',
    (palabra) => {
      expect(validarTextosCampania(ok({ titulo: `Aviso ${palabra} hoy` })).ok).toBe(false)
      expect(validarTextosCampania(ok({ cuerpo: `Aviso ${palabra} hoy` })).ok).toBe(false)
    },
  )

  it('devuelve los errores de los dos campos juntos', () => {
    const r = validarTextosCampania({ titulo: '', cuerpo: '' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.map((e) => e.campo).sort()).toEqual(['cuerpo', 'titulo'])
  })

  it.each([[null], [undefined], ['texto'], [3]])('entrada %j: rechazada sin tirar', (entrada) => {
    expect(validarTextosCampania(entrada).ok).toBe(false)
  })

  it('mismas reglas que validarCampania para los textos (la prueba no es más laxa que el guardado)', () => {
    const casos = [
      ok({ titulo: 'a'.repeat(51) }),
      ok({ cuerpo: 'Revisá tu cuenta' }),
      ok({ titulo: 'Hola\nmundo' }),
      ok({ titulo: '' }),
      ok(),
    ]
    const ahora = new Date('2026-11-01T10:00:00Z')
    for (const c of casos) {
      const completa = {
        ...c,
        eventId: EVENTO,
        startsAt: '2026-11-03T00:00:00Z',
        endsAt: '2026-11-05T00:00:00Z',
      }
      const textos = validarTextosCampania(c)
      const guardado = validarCampania(completa, ahora, [])
      expect(textos.ok).toBe(guardado.ok)
      if (!textos.ok && !guardado.ok) {
        expect(textos.errores).toEqual(guardado.errores.filter((e) => e.campo === 'titulo' || e.campo === 'cuerpo'))
      }
    }
  })
})
