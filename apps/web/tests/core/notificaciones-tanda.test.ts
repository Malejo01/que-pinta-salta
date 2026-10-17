/**
 * `notificaciones/tanda.ts` (R39, 39-b): `armarTanda`, que combina las
 * reglas puras de 39-a (`notificaciones/reglas.ts`) con los datos de cada
 * usuario (preferencias, tokens, favoritos, novedades, envíos ya
 * registrados) para armar la lista final de mensajes. Fixtures inventadas y
 * evidentes, en hora de Salta (`saltaWallClockToDate`/`saltaWallClockToUtcISO`),
 * sin red ni base.
 *
 * Casos pedidos por Mauro (`ops/rondas/39-push-backend/tareas/39-b-tanda.md`
 * y el encargo de la tarea): usuario sin tokens, `favorite_reminders` y
 * `follow_news` apagados por separado, dos tokens → dos mensajes con un solo
 * `dedupeKey`, un caso de cada regla de 39-a (silencio, tope, dedupe de "ya
 * enviado", agrupación de novedades), el tope mixto (lo de hoy + lo nuevo de
 * la tanda), el link contra `urlEvento` (no un string pegado a mano), un
 * usuario sin fila de preferencias, el dedupe de dos usuarios distintos con
 * el mismo evento, y que `announcements` no genere nada en esta ronda.
 */
import { describe, expect, it } from 'vitest'
import {
  armarTanda,
  type DatosParaTanda,
  type EnvioRegistradoParaTanda,
  type FavoritoParaTanda,
  type NovedadParaTanda,
  type UsuarioParaTanda,
} from '@qps/core/notificaciones/tanda'
import { saltaWallClockToDate, saltaWallClockToUtcISO } from '@qps/core/date-format'
import { urlEvento } from '@qps/core/metricas/links'
import { PREFERENCIAS_POR_DEFECTO, type PreferenciasNotificacion } from '@qps/core/notificaciones/preferencias'
import { claveDedupe } from '@qps/core/notificaciones/reglas'

const salta = (wallClock: string) => saltaWallClockToDate(wallClock)

function prefs(overrides: Partial<PreferenciasNotificacion> = {}): PreferenciasNotificacion {
  return { ...PREFERENCIAS_POR_DEFECTO, ...overrides }
}

let autoId = 0
function uuid(): string {
  autoId += 1
  const hex = autoId.toString(16).padStart(12, '0')
  return `00000000-0000-0000-0000-${hex}`
}

function usuario(overrides: Partial<UsuarioParaTanda> = {}): UsuarioParaTanda {
  return {
    userId: uuid(),
    preferencias: prefs(),
    tokens: ['ExponentPushToken[token-de-prueba]'],
    favoritos: [],
    novedades: [],
    enviosRegistrados: [],
    ...overrides,
  }
}

function favorito(overrides: Partial<FavoritoParaTanda> = {}): FavoritoParaTanda {
  return {
    eventId: uuid(),
    start_date: saltaWallClockToUtcISO('2026-10-20T21:00:00'),
    title: 'Recital de Prueba',
    ...overrides,
  }
}

function novedad(overrides: Partial<NovedadParaTanda> = {}): NovedadParaTanda {
  return {
    id: uuid(),
    eventId: uuid(),
    momento: salta('2026-10-20T10:00:00'),
    title: 'Evento Nuevo de Prueba',
    ...overrides,
  }
}

function envio(overrides: Partial<EnvioRegistradoParaTanda> = {}): EnvioRegistradoParaTanda {
  return {
    sent_at: saltaWallClockToUtcISO('2026-10-20T10:00:00'),
    dedupe_key: 'lo-que-sea',
    ...overrides,
  }
}

describe('sin tokens, no hay nada que mandar', () => {
  it('un usuario sin tokens no genera ningún mensaje, aunque tenga un favorito vencido', () => {
    const ahora = salta('2026-10-20T19:00:00') // 2h después del recordatorio (3h antes de las 21:00)
    const datos: DatosParaTanda = {
      usuarios: [usuario({ tokens: [], favoritos: [favorito()] })],
    }
    expect(armarTanda(datos, ahora)).toHaveLength(0)
  })
})

describe('interruptores de preferencia', () => {
  const ahora = salta('2026-10-20T18:00:00') // exactamente 3h antes del favorito

  it('favorite_reminders apagado: sin recordatorios, pero las novedades (si las tiene) sí salen', () => {
    const datos: DatosParaTanda = {
      usuarios: [
        usuario({
          preferencias: prefs({ favorite_reminders: false }),
          favoritos: [favorito()],
          novedades: [novedad({ momento: salta('2026-10-20T10:00:00') })],
        }),
      ],
    }
    const mensajes = armarTanda(datos, ahora)
    expect(mensajes).toHaveLength(1)
    expect(mensajes[0].kind).toBe('novedad')
  })

  it('follow_news apagado: sin novedades, pero el recordatorio de favoritos sí sale', () => {
    const datos: DatosParaTanda = {
      usuarios: [
        usuario({
          preferencias: prefs({ follow_news: false }),
          favoritos: [favorito()],
          novedades: [novedad({ momento: salta('2026-10-20T10:00:00') })],
        }),
      ],
    }
    const mensajes = armarTanda(datos, ahora)
    expect(mensajes).toHaveLength(1)
    expect(mensajes[0].kind).toBe('favorito')
  })
})

describe('dos tokens: dos mensajes iguales salvo `to`, un solo `dedupeKey`', () => {
  it('mismo título, cuerpo, userId, kind, eventId y dedupeKey; distinto `to`', () => {
    const ahora = salta('2026-10-20T18:00:00')
    const unFavorito = favorito()
    const datos: DatosParaTanda = {
      usuarios: [
        usuario({
          tokens: ['ExponentPushToken[celular-1]', 'ExponentPushToken[celular-2]'],
          favoritos: [unFavorito],
        }),
      ],
    }
    const mensajes = armarTanda(datos, ahora)
    expect(mensajes).toHaveLength(2)
    const [m1, m2] = mensajes
    expect(m1.to).not.toBe(m2.to)
    expect(new Set([m1.to, m2.to])).toEqual(
      new Set(['ExponentPushToken[celular-1]', 'ExponentPushToken[celular-2]']),
    )
    expect(m1.title).toBe(m2.title)
    expect(m1.body).toBe(m2.body)
    expect(m1.userId).toBe(m2.userId)
    expect(m1.kind).toBe(m2.kind)
    expect(m1.eventId).toBe(m2.eventId)
    expect(m1.dedupeKey).toBe(m2.dedupeKey)
    // Un solo dedupeKey entre los dos: quien escribe notification_sends inserta una sola fila.
    expect(new Set(mensajes.map((m) => m.dedupeKey)).size).toBe(1)
  })
})

describe('cada regla de 39-a aplicada', () => {
  it('horario de silencio: en silencio (23:30), ni el recordatorio vencido sale', () => {
    const ahora = salta('2026-10-20T23:30:00') // dentro de 23:00-09:00, el default
    const datos: DatosParaTanda = {
      usuarios: [usuario({ favoritos: [favorito({ start_date: saltaWallClockToUtcISO('2026-10-20T02:00:00') })] })],
    }
    expect(armarTanda(datos, ahora)).toHaveLength(0)
  })

  it('fuera de silencio (mismo favorito, otra hora) sí sale', () => {
    const ahora = salta('2026-10-20T10:00:00')
    const datos: DatosParaTanda = {
      usuarios: [usuario({ favoritos: [favorito({ start_date: saltaWallClockToUtcISO('2026-10-20T12:00:00') })] })],
    }
    expect(armarTanda(datos, ahora)).toHaveLength(1)
  })

  it('tope diario: con daily_cap 1 y dos favoritos vencidos, solo entra uno', () => {
    const ahora = salta('2026-10-20T18:00:00')
    const datos: DatosParaTanda = {
      usuarios: [
        usuario({
          preferencias: prefs({ daily_cap: 1 }),
          favoritos: [favorito(), favorito()],
        }),
      ],
    }
    expect(armarTanda(datos, ahora)).toHaveLength(1)
  })

  it('dedupe de "ya enviado": un favorito con dedupe_key ya en enviosRegistrados no se repite', () => {
    const ahora = salta('2026-10-20T18:00:00')
    const userId = uuid()
    const unFavorito = favorito()
    const dedupeKey = claveDedupe({ kind: 'favorito', userId, eventId: unFavorito.eventId })
    const datos: DatosParaTanda = {
      usuarios: [
        usuario({
          userId,
          favoritos: [unFavorito],
          enviosRegistrados: [envio({ dedupe_key: dedupeKey })],
        }),
      ],
    }
    expect(armarTanda(datos, ahora)).toHaveLength(0)
  })

  it('agrupación de novedades: 3 novedades de la misma hora de Salta dan un solo mensaje', () => {
    const ahora = salta('2026-10-20T10:30:00')
    const datos: DatosParaTanda = {
      usuarios: [
        usuario({
          novedades: [
            novedad({ momento: salta('2026-10-20T10:05:00') }),
            novedad({ momento: salta('2026-10-20T10:20:00') }),
            novedad({ momento: salta('2026-10-20T10:45:00') }),
          ],
        }),
      ],
    }
    const mensajes = armarTanda(datos, ahora)
    expect(mensajes).toHaveLength(1)
    expect(mensajes[0].kind).toBe('novedad')
  })
})

describe('el tope mixto: lo de hoy + lo nuevo de la tanda', () => {
  it('3 envíos previos hoy con daily_cap 4 y 3 candidatos nuevos: entra 1 solo', () => {
    const ahora = salta('2026-10-20T18:00:00')
    const datos: DatosParaTanda = {
      usuarios: [
        usuario({
          preferencias: prefs({ daily_cap: 4 }),
          favoritos: [favorito(), favorito(), favorito()],
          enviosRegistrados: [
            envio({ sent_at: saltaWallClockToUtcISO('2026-10-20T08:00:00'), dedupe_key: 'previo-1' }),
            envio({ sent_at: saltaWallClockToUtcISO('2026-10-20T09:00:00'), dedupe_key: 'previo-2' }),
            envio({ sent_at: saltaWallClockToUtcISO('2026-10-20T10:00:00'), dedupe_key: 'previo-3' }),
          ],
        }),
      ],
    }
    expect(armarTanda(datos, ahora)).toHaveLength(1)
  })
})

describe('el link es el que arma `urlEvento`', () => {
  it('el `data.url` del recordatorio de favoritos es exactamente `urlEvento(eventId, "app")`', () => {
    const ahora = salta('2026-10-20T18:00:00')
    const unFavorito = favorito()
    const datos: DatosParaTanda = {
      usuarios: [usuario({ favoritos: [unFavorito] })],
    }
    const [mensaje] = armarTanda(datos, ahora)
    expect(mensaje.data?.url).toBe(urlEvento(unFavorito.eventId, 'app'))
  })

  it('un eventId que no es un uuid válido: `urlEvento` da null y el mensaje sale sin `data`', () => {
    const ahora = salta('2026-10-20T18:00:00')
    const datos: DatosParaTanda = {
      usuarios: [usuario({ favoritos: [favorito({ eventId: 'no-es-un-uuid' })] })],
    }
    const [mensaje] = armarTanda(datos, ahora)
    expect(urlEvento('no-es-un-uuid', 'app')).toBeNull()
    expect(mensaje.data).toBeUndefined()
  })
})

describe('usuario sin fila de preferencias', () => {
  it('usa PREFERENCIAS_POR_DEFECTO (favorite_reminders y follow_news en true, daily_cap 4)', () => {
    const ahora = salta('2026-10-20T18:00:00')
    const datos: DatosParaTanda = {
      usuarios: [usuario({ preferencias: undefined, favoritos: [favorito()] })],
    }
    expect(PREFERENCIAS_POR_DEFECTO.favorite_reminders).toBe(true)
    expect(armarTanda(datos, ahora)).toHaveLength(1)
  })

  it('también funciona con preferencias: null', () => {
    const ahora = salta('2026-10-20T18:00:00')
    const datos: DatosParaTanda = {
      usuarios: [usuario({ preferencias: null, favoritos: [favorito()] })],
    }
    expect(armarTanda(datos, ahora)).toHaveLength(1)
  })
})

describe('dedupe entre usuarios distintos', () => {
  it('dos usuarios con el mismo evento favorito: dedupeKey distinto para cada uno', () => {
    const ahora = salta('2026-10-20T18:00:00')
    const eventId = uuid()
    const datos: DatosParaTanda = {
      usuarios: [
        usuario({ favoritos: [favorito({ eventId })] }),
        usuario({ favoritos: [favorito({ eventId })] }),
      ],
    }
    const mensajes = armarTanda(datos, ahora)
    expect(mensajes).toHaveLength(2)
    expect(mensajes[0].dedupeKey).not.toBe(mensajes[1].dedupeKey)
    expect(mensajes[0].userId).not.toBe(mensajes[1].userId)
  })
})

describe('announcements no genera nada en esta ronda', () => {
  it('con announcements en true, favorite_reminders y follow_news en true: nunca aparece kind "anuncio"', () => {
    const ahora = salta('2026-10-20T18:00:00')
    const datos: DatosParaTanda = {
      usuarios: [
        usuario({
          preferencias: prefs({ announcements: true, favorite_reminders: true, follow_news: true }),
          favoritos: [favorito()],
          novedades: [novedad({ momento: salta('2026-10-20T10:00:00') })],
        }),
      ],
    }
    const mensajes = armarTanda(datos, ahora)
    expect(mensajes.length).toBeGreaterThan(0)
    expect(mensajes.every((m) => m.kind !== 'anuncio')).toBe(true)
  })
})
