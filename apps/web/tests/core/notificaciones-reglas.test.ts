/**
 * `notificaciones/reglas.ts` (R39, 39-a): recordatorio de favoritos, horario
 * de silencio, tope diario, agrupado de novedades y canal del Radar.
 * Fixtures inventadas y evidentes, en hora de Salta
 * (`saltaWallClockToDate`/`saltaWallClockToUtcISO`), sin red ni base.
 *
 * Bordes pedidos por Mauro (`tareas/39-a-core-reglas.md`): recordatorio 3h
 * exactas antes (el minuto justo, el anterior y el posterior); evento sin
 * hora explícita (día anterior a las 18:00 de Salta); silencio 23:00-09:00
 * en 22:59/23:00/08:59/09:00; una ventana que no cruza la medianoche
 * (13:00-15:00); tope con 3, 4 y 5 envíos (`daily_cap` 4); el tope cuenta el
 * día de Salta y no el UTC; 4 novedades de la misma hora pasan a 1 agrupada
 * y el tope de 3 por día; los tres canales del Radar; y la clave de dedupe
 * de dos usuarios distintos con el mismo evento es distinta.
 */
import { describe, expect, it } from 'vitest'
import {
  HORA_RECORDATORIO_FAVORITO_SIN_HORA_EXPLICITA,
  HORAS_ANTES_RECORDATORIO_FAVORITO,
  MAX_NOVEDADES_POR_DIA,
  agruparNovedadesPorHora,
  claveDedupe,
  claveDedupePatrocinado,
  contarEnviosDelDiaSalta,
  debeEnviarRecordatorioFavorito,
  debeMandarEmail,
  debeMandarPush,
  esDedupeKeyPatrocinadoDeLaSemana,
  estaEnHorarioDeSilencio,
  hayLugarEnTopeDiario,
  limitarNovedadesPorDia,
  momentoRecordatorioFavorito,
  prepararNovedadesParaEnviar,
  semanaSalta,
  type NovedadParaAgrupar,
} from '@qps/core/notificaciones/reglas'
import { saltaWallClockToDate, saltaWallClockToUtcISO } from '@qps/core/date-format'

const salta = (wallClock: string) => saltaWallClockToDate(wallClock)

describe('recordatorio de favoritos', () => {
  it('con hora explícita: el momento calculado es exactamente HORAS_ANTES_RECORDATORIO_FAVORITO antes del inicio', () => {
    const evento = { start_date: saltaWallClockToUtcISO('2026-10-20T21:00:00') }
    const momento = momentoRecordatorioFavorito(evento)
    expect(momento.toISOString()).toBe(saltaWallClockToUtcISO('2026-10-20T18:00:00'))
    expect(HORAS_ANTES_RECORDATORIO_FAVORITO).toBe(3)
  })

  it('3 horas exactas antes: el minuto justo manda, el anterior no, el posterior sí', () => {
    const evento = { start_date: saltaWallClockToUtcISO('2026-10-20T21:00:00') }

    const elAnterior = salta('2026-10-20T17:59:00') // 3h01 antes: todavía no
    const elJusto = salta('2026-10-20T18:00:00') // exactamente 3h antes
    const elPosterior = salta('2026-10-20T18:01:00') // 2h59 antes: ya pasó el umbral, sigue debiéndose mandar

    expect(debeEnviarRecordatorioFavorito({ evento, ahora: elAnterior, yaEnviado: false })).toBe(false)
    expect(debeEnviarRecordatorioFavorito({ evento, ahora: elJusto, yaEnviado: false })).toBe(true)
    expect(debeEnviarRecordatorioFavorito({ evento, ahora: elPosterior, yaEnviado: false })).toBe(true)
  })

  it('ya enviado: no manda de nuevo aunque el momento ya haya llegado', () => {
    const evento = { start_date: saltaWallClockToUtcISO('2026-10-20T21:00:00') }
    const ahora = salta('2026-10-20T18:00:00')
    expect(debeEnviarRecordatorioFavorito({ evento, ahora, yaEnviado: true })).toBe(false)
  })

  it('sin hora explícita (00:00): el momento es el día anterior a las 18:00 de Salta', () => {
    // Evento del 20/10 "sin hora" (00:00 de Salta, lo que hasExplicitTime trata como sin hora).
    const evento = { start_date: saltaWallClockToUtcISO('2026-10-20T00:00:00') }
    const momento = momentoRecordatorioFavorito(evento)
    expect(momento.toISOString()).toBe(
      saltaWallClockToUtcISO(`2026-10-19T${HORA_RECORDATORIO_FAVORITO_SIN_HORA_EXPLICITA}:00`),
    )

    const antesDeLas18 = salta('2026-10-19T17:59:00')
    const alas18 = salta('2026-10-19T18:00:00')
    expect(debeEnviarRecordatorioFavorito({ evento, ahora: antesDeLas18, yaEnviado: false })).toBe(false)
    expect(debeEnviarRecordatorioFavorito({ evento, ahora: alas18, yaEnviado: false })).toBe(true)
  })

  it('sin hora explícita, cambio de mes: el "día anterior" del 01/11 es el 31/10', () => {
    const evento = { start_date: saltaWallClockToUtcISO('2026-11-01T00:00:00') }
    const momento = momentoRecordatorioFavorito(evento)
    expect(momento.toISOString()).toBe(saltaWallClockToUtcISO('2026-10-31T18:00:00'))
  })

  it('start_date basura: no manda (ni revienta), nunca', () => {
    const evento = { start_date: 'esto-no-es-una-fecha' }
    expect(Number.isNaN(momentoRecordatorioFavorito(evento).getTime())).toBe(true)
    expect(
      debeEnviarRecordatorioFavorito({ evento, ahora: salta('2026-10-20T18:00:00'), yaEnviado: false }),
    ).toBe(false)
  })
})

describe('horario de silencio', () => {
  // Ventana que cruza la medianoche: el default (23:00 a 09:00).
  const prefsDefault = { quiet_start: '23:00', quiet_end: '09:00' }

  it('22:59 no está silenciado, 23:00 sí (borde de inicio: inclusivo)', () => {
    expect(estaEnHorarioDeSilencio(salta('2026-10-20T22:59:00'), prefsDefault)).toBe(false)
    expect(estaEnHorarioDeSilencio(salta('2026-10-20T23:00:00'), prefsDefault)).toBe(true)
  })

  it('08:59 está silenciado, 09:00 no (borde de fin: exclusivo)', () => {
    expect(estaEnHorarioDeSilencio(salta('2026-10-21T08:59:00'), prefsDefault)).toBe(true)
    expect(estaEnHorarioDeSilencio(salta('2026-10-21T09:00:00'), prefsDefault)).toBe(false)
  })

  it('a la mitad de la ventana (02:00) sigue silenciado', () => {
    expect(estaEnHorarioDeSilencio(salta('2026-10-21T02:00:00'), prefsDefault)).toBe(true)
  })

  it('a la mitad del día (14:00) no está silenciado', () => {
    expect(estaEnHorarioDeSilencio(salta('2026-10-20T14:00:00'), prefsDefault)).toBe(false)
  })

  it('ventana que NO cruza la medianoche (13:00 a 15:00): mismos bordes, inicio inclusivo y fin exclusivo', () => {
    const prefs = { quiet_start: '13:00', quiet_end: '15:00' }
    expect(estaEnHorarioDeSilencio(salta('2026-10-20T12:59:00'), prefs)).toBe(false)
    expect(estaEnHorarioDeSilencio(salta('2026-10-20T13:00:00'), prefs)).toBe(true)
    expect(estaEnHorarioDeSilencio(salta('2026-10-20T14:30:00'), prefs)).toBe(true)
    expect(estaEnHorarioDeSilencio(salta('2026-10-20T14:59:00'), prefs)).toBe(true)
    expect(estaEnHorarioDeSilencio(salta('2026-10-20T15:00:00'), prefs)).toBe(false)
  })

  it('quiet_start === quiet_end: ventana vacía, nunca silencia (antes, justo e inmediatamente después de esa hora)', () => {
    const prefs = { quiet_start: '10:00', quiet_end: '10:00' }
    expect(estaEnHorarioDeSilencio(salta('2026-10-20T09:59:00'), prefs)).toBe(false)
    expect(estaEnHorarioDeSilencio(salta('2026-10-20T10:00:00'), prefs)).toBe(false)
    expect(estaEnHorarioDeSilencio(salta('2026-10-20T10:01:00'), prefs)).toBe(false)
  })

  it('acepta "HH:MM:SS" (lo que devuelve la columna `time` de la base) igual que "HH:MM"', () => {
    const prefsConSegundos = { quiet_start: '23:00:00', quiet_end: '09:00:00' }
    const momentos = ['2026-10-20T22:59:00', '2026-10-20T23:00:00', '2026-10-21T08:59:00', '2026-10-21T09:00:00']
    for (const momento of momentos) {
      expect(estaEnHorarioDeSilencio(salta(momento), prefsConSegundos)).toBe(
        estaEnHorarioDeSilencio(salta(momento), prefsDefault),
      )
    }
  })
})

describe('tope diario', () => {
  it('con daily_cap 4: 3 envíos todavía dejan lugar, 4 no, 5 tampoco', () => {
    expect(hayLugarEnTopeDiario(3, 4)).toBe(true)
    expect(hayLugarEnTopeDiario(4, 4)).toBe(false)
    expect(hayLugarEnTopeDiario(5, 4)).toBe(false)
  })

  it('cuenta el día de Salta, no el UTC: 22:00 de Salta y 02:00 UTC del día siguiente son el mismo día', () => {
    const ahora = salta('2026-10-20T22:30:00') // 20/10 22:30 de Salta
    const envios = [
      { sent_at: saltaWallClockToUtcISO('2026-10-20T22:00:00') }, // mismo día de Salta
      { sent_at: '2026-10-21T02:00:00.000Z' }, // 02:00 UTC del 21, que son las 23:00 del 20 en Salta: mismo día de Salta
      { sent_at: saltaWallClockToUtcISO('2026-10-19T23:00:00') }, // día anterior de Salta: no cuenta
    ]
    expect(contarEnviosDelDiaSalta(envios, ahora)).toBe(2)
  })

  it('sin envíos del día de Salta, cuenta 0', () => {
    const ahora = salta('2026-10-20T10:00:00')
    const envios = [{ sent_at: saltaWallClockToUtcISO('2026-10-19T10:00:00') }]
    expect(contarEnviosDelDiaSalta(envios, ahora)).toBe(0)
  })
})

describe('novedades de lo que el usuario sigue', () => {
  function novedad(id: string, wallClock: string): NovedadParaAgrupar {
    return { id, momento: saltaWallClockToDate(wallClock) }
  }

  it('4 novedades de la misma hora de Salta pasan a 1 solo grupo', () => {
    const novedades = [
      novedad('n1', '2026-10-20T10:05:00'),
      novedad('n2', '2026-10-20T10:20:00'),
      novedad('n3', '2026-10-20T10:45:00'),
      novedad('n4', '2026-10-20T10:59:00'),
    ]
    const grupos = agruparNovedadesPorHora(novedades)
    expect(grupos).toHaveLength(1)
    expect(grupos[0].novedades.map((n) => n.id).sort()).toEqual(['n1', 'n2', 'n3', 'n4'])
  })

  it('una novedad a las 10:59 y otra a las 11:01 quedan en grupos distintos', () => {
    const grupos = agruparNovedadesPorHora([
      novedad('n1', '2026-10-20T10:59:00'),
      novedad('n2', '2026-10-20T11:01:00'),
    ])
    expect(grupos).toHaveLength(2)
  })

  it('tope de MAX_NOVEDADES_POR_DIA (3) por día: con 4 grupos del mismo día, descarta el cuarto', () => {
    expect(MAX_NOVEDADES_POR_DIA).toBe(3)
    const novedades = [
      novedad('n1', '2026-10-20T08:00:00'),
      novedad('n2', '2026-10-20T10:00:00'),
      novedad('n3', '2026-10-20T14:00:00'),
      novedad('n4', '2026-10-20T20:00:00'),
    ]
    const grupos = agruparNovedadesPorHora(novedades)
    expect(grupos).toHaveLength(4)
    const limitados = limitarNovedadesPorDia(grupos)
    expect(limitados).toHaveLength(3)
    expect(limitados.map((g) => g.novedades[0].id)).toEqual(['n1', 'n2', 'n3'])
  })

  it('prepararNovedadesParaEnviar combina las dos reglas: agrupa por hora y tapa en 3 por día', () => {
    const novedades = [
      novedad('n1', '2026-10-20T10:05:00'),
      novedad('n2', '2026-10-20T10:50:00'), // mismo grupo que n1
      novedad('n3', '2026-10-20T12:00:00'),
      novedad('n4', '2026-10-20T16:00:00'),
      novedad('n5', '2026-10-20T20:00:00'), // cuarto grupo del día: se descarta
    ]
    const resultado = prepararNovedadesParaEnviar(novedades)
    expect(resultado).toHaveLength(3)
    expect(resultado[0].novedades.map((n) => n.id).sort()).toEqual(['n1', 'n2'])
  })

  it('días distintos no comparten tope: 3 grupos cada día, los dos días al tope', () => {
    const novedades = [
      novedad('a1', '2026-10-20T08:00:00'),
      novedad('a2', '2026-10-20T10:00:00'),
      novedad('a3', '2026-10-20T14:00:00'),
      novedad('a4', '2026-10-20T20:00:00'),
      novedad('b1', '2026-10-21T08:00:00'),
      novedad('b2', '2026-10-21T10:00:00'),
      novedad('b3', '2026-10-21T14:00:00'),
      novedad('b4', '2026-10-21T20:00:00'),
    ]
    const resultado = prepararNovedadesParaEnviar(novedades)
    const idsDelPrimero = resultado.map((g) => g.novedades[0].id)
    expect(idsDelPrimero).toEqual(['a1', 'a2', 'a3', 'b1', 'b2', 'b3'])
  })
})

describe('canal del Radar', () => {
  it('"email": manda email, no push', () => {
    expect(debeMandarEmail('email')).toBe(true)
    expect(debeMandarPush('email')).toBe(false)
  })

  it('"push": manda push, no email', () => {
    expect(debeMandarEmail('push')).toBe(false)
    expect(debeMandarPush('push')).toBe(true)
  })

  it('"ambos": manda los dos', () => {
    expect(debeMandarEmail('ambos')).toBe(true)
    expect(debeMandarPush('ambos')).toBe(true)
  })
})

describe('clave de dedupe', () => {
  it('mismo evento, dos usuarios distintos: la clave es distinta (el unique de la tabla es de toda la tabla)', () => {
    const claveA = claveDedupe({ kind: 'favorito', userId: 'usuario-a', eventId: 'evento-1' })
    const claveB = claveDedupe({ kind: 'favorito', userId: 'usuario-b', eventId: 'evento-1' })
    expect(claveA).not.toBe(claveB)
  })

  it('mismo usuario y evento: la clave es igual (así funciona el dedupe de "uno por evento")', () => {
    const clave1 = claveDedupe({ kind: 'favorito', userId: 'usuario-a', eventId: 'evento-1' })
    const clave2 = claveDedupe({ kind: 'favorito', userId: 'usuario-a', eventId: 'evento-1' })
    expect(clave1).toBe(clave2)
  })

  it('mismo usuario, distinto "extra" (p. ej. distinta hora agrupada de novedades): la clave es distinta', () => {
    const claveHora1 = claveDedupe({ kind: 'novedad', userId: 'usuario-a', extra: '2026-10-20T10' })
    const claveHora2 = claveDedupe({ kind: 'novedad', userId: 'usuario-a', extra: '2026-10-20T11' })
    expect(claveHora1).not.toBe(claveHora2)
  })
})

describe('clave de dedupe de avisos patrocinados (D2/Ronda 51, tarea 51-a)', () => {
  const semana = semanaSalta(new Date('2026-10-20T18:00:00-03:00'))
  const otraSemana = semanaSalta(new Date('2026-10-27T18:00:00-03:00'))

  it('claveDedupePatrocinado usa claveDedupe con kind "patrocinado" y extra la semana, no un string armado a mano', () => {
    const clave = claveDedupePatrocinado('usuario-a', semana)
    expect(clave).toBe(claveDedupe({ kind: 'patrocinado', userId: 'usuario-a', extra: semana }))
  })

  it('esDedupeKeyPatrocinadoDeLaSemana: true contra su propia clave', () => {
    const clave = claveDedupePatrocinado('usuario-a', semana)
    expect(esDedupeKeyPatrocinadoDeLaSemana(clave, 'usuario-a', semana)).toBe(true)
  })

  it('esDedupeKeyPatrocinadoDeLaSemana: false contra la clave de OTRO usuario, misma semana', () => {
    const clave = claveDedupePatrocinado('usuario-a', semana)
    expect(esDedupeKeyPatrocinadoDeLaSemana(clave, 'usuario-b', semana)).toBe(false)
  })

  it('esDedupeKeyPatrocinadoDeLaSemana: false contra la clave de OTRA semana, mismo usuario', () => {
    const clave = claveDedupePatrocinado('usuario-a', semana)
    expect(esDedupeKeyPatrocinadoDeLaSemana(clave, 'usuario-a', otraSemana)).toBe(false)
  })

  it('una clave patrocinada no matchea el prefijo de novedad ("novedad:")', () => {
    const clave = claveDedupePatrocinado('usuario-a', semana)
    const prefijoDeNovedad = claveDedupe({ kind: 'novedad', userId: '' })
    expect(clave.startsWith(prefijoDeNovedad)).toBe(false)
  })
})
