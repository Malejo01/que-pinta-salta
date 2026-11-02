import { describe, expect, it } from 'vitest'
import {
  destinatarioDeEnvio,
  preferenciasDeAnonimo,
  sinTokensRepetidos,
  usuarioParaAvisoEquipoDeAnonimo,
  usuarioParaTandaDeAnonimo,
} from '@qps/core/notificaciones/anonimos'
import { armarTanda } from '@qps/core/notificaciones/tanda'
import { destinatariosAvisoEquipo } from '@qps/core/notificaciones/equipo'
import { saltaWallClockToDate } from '@qps/core/date-format'

const AHORA = saltaWallClockToDate('2030-10-20T20:00:00')
const fila = (over: Record<string, unknown> = {}) => ({
  id: '40000000-0000-4000-8000-0000000000a1',
  token: 'ExponentPushToken[anon]',
  avisos_equipo: true,
  avisos_patrocinados: false,
  ...over,
})

describe('@qps/core/notificaciones/anonimos (R82 / Q4-2)', () => {
  it('falla cerrado: solo `true` estricto prende un interruptor', () => {
    expect(preferenciasDeAnonimo({ avisos_equipo: null, avisos_patrocinados: 'true' as never })).toMatchObject({
      announcements: false,
      sponsored: false,
      favorite_reminders: false,
      follow_news: false,
    })
  })

  it('un anónimo nunca genera favoritos ni novedades, y el patrocinado solo si lo activó', () => {
    const patrocinado = { id: 'c1', titulo: 'T', cuerpo: 'C', eventId: '30000000-0000-4000-8000-000000000001' }
    const sin = armarTanda({ usuarios: [usuarioParaTandaDeAnonimo(fila(), [])], patrocinado }, AHORA)
    expect(sin).toEqual([])
    const con = armarTanda({ usuarios: [usuarioParaTandaDeAnonimo(fila({ avisos_patrocinados: true }), [])], patrocinado }, AHORA)
    expect(con.map((m) => m.kind)).toEqual(['patrocinado'])
    expect(con[0].userId).toBe(fila().id)
    expect(con[0].dedupeKey).toContain(fila().id)
  })

  it('aviso del equipo: entra con avisos_equipo y no con el interruptor apagado', () => {
    const r = destinatariosAvisoEquipo(
      [usuarioParaAvisoEquipoDeAnonimo(fila(), []), usuarioParaAvisoEquipoDeAnonimo(fila({ id: 'otro', token: 'ExponentPushToken[b]', avisos_equipo: false }), [])],
      AHORA,
    )
    expect(r.resumen).toMatchObject({ personas: 1, telefonos: 1 })
  })

  it('sinTokensRepetidos descarta los tokens que ya están con cuenta o repetidos', () => {
    const a = fila()
    const b = fila({ id: 'b', token: 'ExponentPushToken[b]' })
    expect(sinTokensRepetidos([a, b, { ...b, id: 'c' }], ['ExponentPushToken[anon]'])).toEqual([b])
  })

  it('destinatarioDeEnvio: push_token_id para anónimos, user_id para cuentas', () => {
    const ids = new Set(['t1'])
    expect(destinatarioDeEnvio('t1', ids)).toEqual({ user_id: null, push_token_id: 't1' })
    expect(destinatarioDeEnvio('u1', ids)).toEqual({ user_id: 'u1' })
  })
})
