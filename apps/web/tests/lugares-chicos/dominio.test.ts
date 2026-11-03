// Q5-1 · Lógica pura de @qps/core/lugares/permanentes (horarios, plazos, publicar).
import { describe, expect, it } from 'vitest'
import { saltaWallClockToDate } from '@qps/core/date-format'
import { coordenadasEnSalta } from '@qps/core/mapa/zona'
import {
  PLAZO_REVISION_DIAS,
  abiertoAhora,
  accesibilidadVerificada,
  diaDeSemanaSalta,
  distanciaMetros,
  estadoApertura,
  estadoDeRevision,
  faltantesParaPublicar,
  filasDeHorarios,
  horariosSeguros,
  textoDistancia,
  textoEdades,
  textoHorarioDeHoy,
  validarHorarios,
  venceLaVerificacion,
  type HorariosLugar,
} from '@qps/core/lugares/permanentes'

const PELOTERO: HorariosLugar = {
  version: 1,
  semana: {
    lun: [],
    mar: [{ desde: '16:00', hasta: '20:30' }],
    sab: [
      { desde: '10:00', hasta: '13:00' },
      { desde: '15:00', hasta: '21:00' },
    ],
  },
}
// Martes 3/11/2026 en Salta.
const MARTES_17 = saltaWallClockToDate('2026-11-03T17:00:00')
const MARTES_21 = saltaWallClockToDate('2026-11-03T21:00:00')

describe('validarHorarios', () => {
  it('acepta la forma del §2.3 y ordena las franjas', () => {
    const r = validarHorarios({ version: 1, semana: { sab: [{ desde: '15:00', hasta: '21:00' }, { desde: '10:00', hasta: '13:00' }] }, nota: ' feriados ' })
    expect(r).toEqual({ ok: true, horarios: { version: 1, semana: { sab: [{ desde: '10:00', hasta: '13:00' }, { desde: '15:00', hasta: '21:00' }] }, nota: 'feriados' } })
  })
  it.each([
    ['sin versión', { semana: {} }],
    ['día desconocido', { version: 1, semana: { fer: [] } }],
    ['hora mal escrita', { version: 1, semana: { lun: [{ desde: '9', hasta: '12:00' }] } }],
    ['cruza la medianoche', { version: 1, semana: { lun: [{ desde: '22:00', hasta: '02:00' }] } }],
    ['más de dos franjas', { version: 1, semana: { lun: [{ desde: '08:00', hasta: '09:00' }, { desde: '10:00', hasta: '11:00' }, { desde: '12:00', hasta: '13:00' }] } }],
    ['franjas que se pisan', { version: 1, semana: { lun: [{ desde: '08:00', hasta: '12:00' }, { desde: '11:00', hasta: '13:00' }] } }],
    ['no es objeto', 'lunes a viernes'],
  ])('rechaza: %s', (_n, entrada) => {
    expect(validarHorarios(entrada).ok).toBe(false)
  })
  it('horariosSeguros: lo inválido de la base se lee como «sin dato»', () => {
    expect(horariosSeguros({ cualquier: 'cosa' })).toEqual({ version: 1, semana: {} })
  })
})

describe('apertura en hora de Salta', () => {
  it('el día es el de Salta, no el UTC (martes 23:30 en Salta = miércoles en UTC)', () => {
    expect(diaDeSemanaSalta(saltaWallClockToDate('2026-11-03T23:30:00'))).toBe('mar')
  })
  it('abierto / cerrado / sin dato', () => {
    expect(estadoApertura(PELOTERO, MARTES_17)).toBe('abierto')
    expect(estadoApertura(PELOTERO, MARTES_21)).toBe('cerrado')
    expect(estadoApertura(PELOTERO, saltaWallClockToDate('2026-11-02T17:00:00'))).toBe('cerrado') // lunes []
    expect(estadoApertura(PELOTERO, saltaWallClockToDate('2026-11-04T17:00:00'))).toBe('sin_dato') // miércoles ausente
  })
  it('«Abierto ahora» solo cuenta lo que sabemos abierto (plaza siempre abierta sí, con reserva no)', () => {
    expect(abiertoAhora(PELOTERO, MARTES_17)).toBe(true)
    expect(abiertoAhora({ version: 1, siempre_abierto: true, semana: {} }, MARTES_21)).toBe(true)
    expect(abiertoAhora({ version: 1, solo_con_reserva: true, semana: {} }, MARTES_17)).toBe(false)
  })
  it('textos de hoy en castellano y en inglés', () => {
    expect(textoHorarioDeHoy(PELOTERO, MARTES_17)).toBe('Hoy: 16:00 a 20:30')
    expect(textoHorarioDeHoy(PELOTERO, MARTES_17, 'en')).toBe('Today: 16:00–20:30')
    expect(textoHorarioDeHoy({ version: 1, solo_con_reserva: true, semana: {} }, MARTES_17)).toBe('Con reserva')
    expect(textoHorarioDeHoy({ version: 1, siempre_abierto: true, semana: {} }, MARTES_17, 'en')).toBe('Open space')
    expect(textoHorarioDeHoy(PELOTERO, saltaWallClockToDate('2026-11-02T10:00:00'))).toBe('Hoy cerrado')
    expect(textoHorarioDeHoy(PELOTERO, saltaWallClockToDate('2026-11-04T10:00:00'))).toBe('Horario sin confirmar')
  })
  it('las 7 filas distinguen «Cerrado» de «Sin dato»', () => {
    const filas = filasDeHorarios(PELOTERO)
    expect(filas).toHaveLength(7)
    expect(filas[0]).toEqual({ dia: 'lun', etiqueta: 'Lunes', texto: 'Cerrado' })
    expect(filas[2]!.texto).toBe('Sin dato')
    expect(filas[5]!.texto).toBe('10:00 a 13:00 y 15:00 a 21:00')
  })
})

describe('revisión periódica (90 / 180 días)', () => {
  const ahora = new Date('2026-11-03T12:00:00Z')
  const haceDias = (d: number) => new Date(ahora.getTime() - d * 86_400_000).toISOString()
  it('plazos por tipo', () => {
    expect(PLAZO_REVISION_DIAS).toEqual({ pelotero: 90, salon_juegos: 90, plaza_juegos: 180, espacio_cultural_infantil: 180 })
    expect(venceLaVerificacion('pelotero', haceDias(0))!.getTime() - ahora.getTime()).toBe(90 * 86_400_000)
    expect(venceLaVerificacion('pelotero', null)).toBeNull()
  })
  it.each([
    ['pelotero', 89, 'al_dia'],
    ['pelotero', 91, 'para_revisar'],
    ['pelotero', 181, 'puede_haber_cambiado'],
    ['plaza_juegos', 179, 'al_dia'],
    ['plaza_juegos', 200, 'para_revisar'],
    ['plaza_juegos', 361, 'puede_haber_cambiado'],
  ] as const)('%s verificado hace %i días → %s', (tipo, dias, esperado) => {
    expect(estadoDeRevision(tipo, haceDias(dias), ahora)).toBe(esperado)
  })
  it('sin verificar', () => {
    expect(estadoDeRevision('pelotero', null, ahora)).toBe('sin_verificar')
  })
})

describe('faltantesParaPublicar', () => {
  const HOY = new Date('2026-11-03T12:00:00Z')
  const base = {
    tipo: 'plaza_juegos',
    acceso: 'gratis',
    fuente: 'visita',
    verificado_at: '2026-11-01T12:00:00Z',
    venue: { latitude: -24.79, longitude: -65.41, canonical_venue_id: null },
  }
  it('completo: nada', () => {
    expect(faltantesParaPublicar(base, coordenadasEnSalta, new Date('2026-11-03T12:00:00Z'))).toEqual([])
  })
  it('OSM o pedido público no alcanzan, y la ubicación tiene que estar en Salta', () => {
    expect(faltantesParaPublicar({ ...base, fuente: 'openstreetmap' }, coordenadasEnSalta, HOY).join(' ')).toMatch(/fuente verificada/)
    expect(faltantesParaPublicar({ ...base, fuente: 'pedido_publico' }, coordenadasEnSalta, HOY).join(' ')).toMatch(/fuente verificada/)
    expect(faltantesParaPublicar({ ...base, venue: { latitude: null, longitude: null, canonical_venue_id: null } }, coordenadasEnSalta, HOY)).toEqual(['la ubicación dentro de Salta'])
    expect(faltantesParaPublicar({ ...base, verificado_at: null }, coordenadasEnSalta, HOY)).toEqual(['la fecha de verificación'])
    expect(faltantesParaPublicar({ ...base, venue: { ...base.venue, canonical_venue_id: 'x' } }, coordenadasEnSalta, HOY)).toHaveLength(1)
  })
  it('un vencido no se vuelve a publicar con la verificación vieja', () => {
    const ahora = new Date('2027-06-01T12:00:00Z') // 7 meses después: pasó los 180 días de la plaza
    expect(faltantesParaPublicar(base, coordenadasEnSalta, ahora)).toEqual(['volver a verificarlo (la última verificación pasó su plazo)'])
  })
})

describe('textos', () => {
  it('edades', () => {
    expect(textoEdades(null, null)).toBe('Todas las edades')
    expect(textoEdades(2, 10)).toBe('De 2 a 10 años')
    expect(textoEdades(3, null)).toBe('Desde 3 años')
    expect(textoEdades(null, 6)).toBe('Hasta 6 años')
    expect(textoEdades(2, 10, 'en')).toBe('Ages 2 to 10')
    expect(textoEdades(1, null)).toBe('Desde 1 año')
  })
  it('accesibilidad: solo lo verificado (null nunca es «no»)', () => {
    expect(accesibilidadVerificada({ tiene_rampa: true, tiene_bano_adaptado: null, tiene_cambiador: false })).toEqual(['Rampa'])
    expect(accesibilidadVerificada({ tiene_rampa: true, tiene_bano_adaptado: true, tiene_cambiador: true }, 'en')).toEqual(['Ramp access', 'Accessible toilet', 'Baby changing'])
  })
  it('distancia en línea recta', () => {
    const plaza9 = { lat: -24.7883, lng: -65.4106 }
    const unKmAlNorte = { lat: -24.7793, lng: -65.4106 }
    expect(Math.round(distanciaMetros(plaza9, unKmAlNorte) / 10) * 10).toBe(1000)
    expect(textoDistancia(830)).toBe('a 850 m en línea recta')
    expect(textoDistancia(1440)).toBe('a 1,4 km en línea recta')
    expect(textoDistancia(1440, 'en')).toBe('1.4 km away (straight line)')
    expect(textoDistancia(10)).toBe('a 50 m en línea recta')
  })
})
