// Ronda 41, tarea 41-q (QA, cierre): lo que cruza el backend (core) y la
// app. `armarTanda` (`@qps/core/notificaciones/tanda`, 39-b/41-a) arma el
// `data` del mensaje con `urlEvento(eventId, 'app')`
// (`@qps/core/metricas/links`); del otro lado, `eventoIdDesdeDatosPush`
// (`lib/push/tap.ts`, 41-d) es quien lo lee cuando la persona toca el aviso.
// Si alguno de los dos cambia de forma sin que el otro se entere (el nombre
// del campo, el formato de la URL, el host), el link del push deja de
// abrir la ficha — y ningún test de cada lado por separado lo nota, porque
// cada uno prueba su propio formato "tal como lo recuerda", no el que el
// otro lado produce de verdad.
import { describe, expect, it } from 'vitest'
import { saltaWallClockToDate } from '@qps/core/date-format'
import { armarTanda, type DatosParaTanda } from '@qps/core/notificaciones/tanda'
import { PREFERENCIAS_POR_DEFECTO } from '@qps/core/notificaciones/preferencias'
import { eventoIdDesdeDatosPush } from '../lib/push/tap'

const USER_ID = '10000000-0000-4000-8000-000000000099'
const EVENT_ID = '20000000-0000-4000-8000-000000000099'
const TOKEN = 'ExponentPushToken[de-prueba-cruce]'

describe('el data de armarTanda (core) lo entiende eventoIdDesdeDatosPush (app)', () => {
  it('un favorito "debido" (con hora explícita, ya pasó el momento del recordatorio): el mensaje trae data.url, y eventoIdDesdeDatosPush da el mismo eventId', () => {
    const ahora = saltaWallClockToDate('2030-10-20T20:00:00')
    // Favorito inventado, con hora explícita, 3h antes de ahora: "debido".
    const datos: DatosParaTanda = {
      usuarios: [
        {
          userId: USER_ID,
          preferencias: PREFERENCIAS_POR_DEFECTO,
          tokens: [TOKEN],
          favoritos: [
            {
              eventId: EVENT_ID,
              title: 'Show de Prueba (cruce core/app)',
              start_date: saltaWallClockToDate('2030-10-20T21:00:00').toISOString(),
            },
          ],
          novedades: [],
          enviosRegistrados: [],
        },
      ],
    }

    const mensajes = armarTanda(datos, ahora)
    expect(mensajes).toHaveLength(1)
    const [mensaje] = mensajes
    expect(mensaje.kind).toBe('favorito')
    expect(mensaje.eventId).toBe(EVENT_ID)
    expect(mensaje.data).toBeDefined()
    expect(typeof mensaje.data?.url).toBe('string')

    // El lado de la app: lo mismo que recibiría `respuesta.notification.request.content.data`.
    const idRecuperado = eventoIdDesdeDatosPush(mensaje.data)
    expect(idRecuperado).toBe(EVENT_ID)
  })

  it('un grupo de novedades con un solo evento: mismo contrato (data.url → eventoIdDesdeDatosPush → el mismo eventId)', () => {
    const ahora = saltaWallClockToDate('2030-10-20T20:00:00')
    const datos: DatosParaTanda = {
      usuarios: [
        {
          userId: USER_ID,
          preferencias: PREFERENCIAS_POR_DEFECTO,
          tokens: [TOKEN],
          favoritos: [],
          novedades: [{ id: EVENT_ID, eventId: EVENT_ID, title: 'Novedad de Prueba', momento: ahora }],
          enviosRegistrados: [],
        },
      ],
    }

    const mensajes = armarTanda(datos, ahora)
    expect(mensajes).toHaveLength(1)
    const [mensaje] = mensajes
    expect(mensaje.kind).toBe('novedad')
    expect(mensaje.eventId).toBe(EVENT_ID)

    const idRecuperado = eventoIdDesdeDatosPush(mensaje.data)
    expect(idRecuperado).toBe(EVENT_ID)
  })

  it('un grupo de novedades con DOS eventos: eventId queda null (no hay "el" evento) y el mensaje no trae data — eventoIdDesdeDatosPush(undefined) da null, nunca un id cualquiera', () => {
    const ahora = saltaWallClockToDate('2030-10-20T20:00:00')
    const OTRO_EVENT_ID = '20000000-0000-4000-8000-000000000098'
    const datos: DatosParaTanda = {
      usuarios: [
        {
          userId: USER_ID,
          preferencias: PREFERENCIAS_POR_DEFECTO,
          tokens: [TOKEN],
          favoritos: [],
          novedades: [
            { id: EVENT_ID, eventId: EVENT_ID, title: 'Novedad A', momento: ahora },
            { id: OTRO_EVENT_ID, eventId: OTRO_EVENT_ID, title: 'Novedad B', momento: ahora },
          ],
          enviosRegistrados: [],
        },
      ],
    }

    const mensajes = armarTanda(datos, ahora)
    expect(mensajes).toHaveLength(1)
    const [mensaje] = mensajes
    expect(mensaje.eventId).toBeNull()
    expect(mensaje.data).toBeUndefined()
    expect(eventoIdDesdeDatosPush(mensaje.data)).toBeNull()
  })
})
