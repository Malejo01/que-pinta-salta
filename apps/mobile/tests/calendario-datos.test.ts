// 42-a: `datosCalendario`/`puedeAgregarseAlCalendario` (lib/calendario/datos.ts).
// Sin red ni RN: fechas ISO con offset explícito (nunca dependen de la zona
// de la máquina que corre el test) y se afirma sobre instantes (`toISOString()`)
// o días de Salta ("YYYY-MM-DD"), nunca sobre `getHours()`/`.toISOString().slice(0, 10)`.
import { describe, expect, it } from 'vitest'
import {
  DURACION_CALENDARIO_HORAS,
  datosCalendario,
  puedeAgregarseAlCalendario,
  type EventoParaCalendario,
} from '../lib/calendario/datos'

const UUID = '0b9d4f5a-6a2b-4c1e-8f3d-9a7b6c5d4e3f'

function evento(overrides: Partial<EventoParaCalendario> = {}): EventoParaCalendario {
  return {
    id: UUID,
    title: 'Peña en el club',
    start_date: '2026-10-23T21:00:00-03:00',
    end_date: null,
    venue: { name: 'Club Social', address: 'Mitre 123', is_placeholder: false },
    ...overrides,
  }
}

describe('datosCalendario — id inválido', () => {
  it('id que no es uuid: null', () => {
    expect(datosCalendario(evento({ id: 'no-es-un-uuid' }))).toBeNull()
  })
})

describe('datosCalendario — start_date inválido', () => {
  it('start_date inválido: null (y no revienta con RangeError)', () => {
    expect(datosCalendario(evento({ start_date: 'no-es-una-fecha' }))).toBeNull()
  })

  it('start_date inválido con end_date también inválido: null', () => {
    expect(datosCalendario(evento({ start_date: 'basura', end_date: 'mas-basura' }))).toBeNull()
  })
})

describe('datosCalendario — con hora', () => {
  it('sin end_date: fin = inicio + 4 h (cruza la medianoche)', () => {
    const datos = datosCalendario(evento({ start_date: '2026-10-23T21:00:00-03:00', end_date: null }))
    expect(datos?.tipo).toBe('con-hora')
    if (datos?.tipo !== 'con-hora') throw new Error('se esperaba con-hora')
    expect(datos.inicio.toISOString()).toBe('2026-10-24T00:00:00.000Z')
    expect(datos.fin.toISOString()).toBe('2026-10-24T04:00:00.000Z')
  })

  it('con end_date posterior: usa ese fin', () => {
    const datos = datosCalendario(
      evento({ start_date: '2026-10-23T21:00:00-03:00', end_date: '2026-10-23T23:30:00-03:00' })
    )
    if (datos?.tipo !== 'con-hora') throw new Error('se esperaba con-hora')
    expect(datos.fin.toISOString()).toBe('2026-10-24T02:30:00.000Z')
  })

  it('con end_date anterior o igual al inicio: inicio + 4 h', () => {
    const anterior = datosCalendario(
      evento({ start_date: '2026-10-23T21:00:00-03:00', end_date: '2026-10-23T20:00:00-03:00' })
    )
    if (anterior?.tipo !== 'con-hora') throw new Error('se esperaba con-hora')
    expect(anterior.fin.toISOString()).toBe('2026-10-24T04:00:00.000Z')

    const igual = datosCalendario(
      evento({ start_date: '2026-10-23T21:00:00-03:00', end_date: '2026-10-23T21:00:00-03:00' })
    )
    if (igual?.tipo !== 'con-hora') throw new Error('se esperaba con-hora')
    expect(igual.fin.toISOString()).toBe('2026-10-24T04:00:00.000Z')
  })

  it('con end_date inválido: inicio + 4 h', () => {
    const datos = datosCalendario(evento({ start_date: '2026-10-23T21:00:00-03:00', end_date: 'no-es-una-fecha' }))
    if (datos?.tipo !== 'con-hora') throw new Error('se esperaba con-hora')
    expect(datos.fin.toISOString()).toBe('2026-10-24T04:00:00.000Z')
  })
})

describe('datosCalendario — sin hora (día completo)', () => {
  it('00:00 de Salta: día completo con dia = el día de Salta', () => {
    const datos = datosCalendario(evento({ start_date: '2026-10-23T03:00:00Z', end_date: null }))
    if (datos?.tipo !== 'dia-completo') throw new Error('se esperaba dia-completo')
    expect(datos.dia).toBe('2026-10-23')
    expect(datos.diaFin).toBe('2026-10-23')
  })

  it('el borde de la zona: 23:30 de Salta (02:30 UTC del día siguiente) tiene hora explícita, no es día completo', () => {
    const datos = datosCalendario(evento({ start_date: '2026-10-24T02:30:00Z', end_date: null }))
    // Un .toISOString().slice(0, 10) daría '2026-10-24' (el día en UTC); el
    // día real en Salta es el 23, y como tiene hora explícita (23:30 no es
    // 00:00) la rama correcta es 'con-hora', no 'dia-completo'.
    expect(datos?.tipo).toBe('con-hora')
    if (datos?.tipo !== 'con-hora') throw new Error('se esperaba con-hora')
    expect(datos.inicio.toISOString()).toBe('2026-10-24T02:30:00.000Z')
  })

  it('sin hora con end_date de un día de Salta posterior: diaFin es ese día', () => {
    const datos = datosCalendario(evento({ start_date: '2026-10-23T03:00:00Z', end_date: '2026-10-26T03:00:00Z' }))
    if (datos?.tipo !== 'dia-completo') throw new Error('se esperaba dia-completo')
    expect(datos.dia).toBe('2026-10-23')
    expect(datos.diaFin).toBe('2026-10-26')
  })

  // Detector de la rotura "armar el día completo con la fecha UTC en vez del
  // día de Salta" (plan R42), encontrada por el lead corriendo esa rotura a
  // mano en `calcularHorarioDiaCompleto`: cambiar `formatSaltaDayKey` por
  // `new Date(...).toISOString().slice(0, 10)`.
  //
  // El `dia` del INICIO no se puede proteger con ningún caso de borde: un
  // evento sin hora es, por definición, 00:00 de Salta = 03:00Z del MISMO
  // día, así que el día UTC y el día de Salta de `start_date` siempre
  // coinciden. El que sí se rompe es `diaFin`, y solo si la HORA del
  // `end_date` es tarde en el día de Salta (21:00 en adelante): recién ahí
  // el día de Salta y el día UTC de ese instante difieren. Un `end_date`
  // temprano (como el de arriba, 03:00Z = 00:00 de Salta) NO agarra la
  // rotura, porque con esa hora el día UTC y el día de Salta siguen
  // coincidiendo: por eso hace falta este caso aparte, no alcanza con
  // "simplificar" reusando el de arriba.
  it('sin hora con end_date TARDE en el día de Salta (21:00+, UTC ya un día después): diaFin es el día de Salta, no el día UTC', () => {
    // end_date: 2026-10-26T22:00:00-03:00 = 2026-10-27T01:00:00Z.
    // Día de Salta del end_date: 26. Día UTC del end_date: 27.
    const datos = datosCalendario(evento({ start_date: '2026-10-23T03:00:00Z', end_date: '2026-10-26T22:00:00-03:00' }))
    if (datos?.tipo !== 'dia-completo') throw new Error('se esperaba dia-completo')
    expect(datos.dia).toBe('2026-10-23')
    // Con la rotura (día UTC) esto da '2026-10-27': el evento del calendario
    // se estira un día de más.
    expect(datos.diaFin).toBe('2026-10-26')
  })

  // Caso simétrico: el end_date cae el MISMO día de Salta que el inicio
  // (no hay que estirar el evento ningún día), pero en UTC ya es el día
  // siguiente. `diaFin` tiene que quedarse igual a `dia`, no adelantarse.
  it('sin hora con end_date del MISMO día de Salta que el inicio (22:00, UTC ya el día siguiente): diaFin no se adelanta', () => {
    // end_date: 2026-10-26T22:00:00-03:00 = 2026-10-27T01:00:00Z, mismo día
    // de Salta (26) que el start_date.
    const datos = datosCalendario(evento({ start_date: '2026-10-26T03:00:00Z', end_date: '2026-10-26T22:00:00-03:00' }))
    if (datos?.tipo !== 'dia-completo') throw new Error('se esperaba dia-completo')
    expect(datos.dia).toBe('2026-10-26')
    // Con la rotura (día UTC) esto da '2026-10-27' en vez de quedarse en el
    // mismo día.
    expect(datos.diaFin).toBe('2026-10-26')
  })

  it('sin hora con end_date inválido: diaFin = dia', () => {
    const datos = datosCalendario(evento({ start_date: '2026-10-23T03:00:00Z', end_date: 'no-es-una-fecha' }))
    if (datos?.tipo !== 'dia-completo') throw new Error('se esperaba dia-completo')
    expect(datos.diaFin).toBe(datos.dia)
  })
})

describe('datosCalendario — el lugar', () => {
  it('nombre y dirección: "<nombre>, <dirección>"', () => {
    const datos = datosCalendario(evento({ venue: { name: 'Club Social', address: 'Mitre 123', is_placeholder: false } }))
    expect(datos?.lugar).toBe('Club Social, Mitre 123')
  })

  it('solo nombre (sin dirección): va solo el nombre', () => {
    const datos = datosCalendario(evento({ venue: { name: 'Club Social', address: '  ', is_placeholder: false } }))
    expect(datos?.lugar).toBe('Club Social')
  })

  it('solo dirección (sin nombre): va solo la dirección', () => {
    const datos = datosCalendario(evento({ venue: { name: '  ', address: 'Mitre 123', is_placeholder: false } }))
    expect(datos?.lugar).toBe('Mitre 123')
  })

  it('la dirección ya contiene el nombre (sin mayúsculas ni tildes): va solo la dirección', () => {
    const datos = datosCalendario(
      evento({ venue: { name: 'Teatro Provincial', address: 'Teatro Provincial, Mitre 23', is_placeholder: false } })
    )
    expect(datos?.lugar).toBe('Teatro Provincial, Mitre 23')
  })

  it('la dirección contiene el nombre con tildes/mayúsculas distintas: igual se detecta', () => {
    const datos = datosCalendario(
      evento({ venue: { name: 'Peña El Andino', address: 'PENA EL ANDINO, Zuviría 456', is_placeholder: false } })
    )
    expect(datos?.lugar).toBe('PENA EL ANDINO, Zuviría 456')
  })

  it('is_placeholder: true: undefined, nunca "Lugar por confirmar"', () => {
    const datos = datosCalendario(
      evento({ venue: { name: 'Lugar por confirmar', address: '', is_placeholder: true } })
    )
    expect(datos?.lugar).toBeUndefined()
  })

  it('sin venue: undefined', () => {
    const datos = datosCalendario(evento({ venue: null }))
    expect(datos?.lugar).toBeUndefined()
  })

  it('los dos vacíos o solo espacios: undefined', () => {
    const datos = datosCalendario(evento({ venue: { name: '  ', address: '', is_placeholder: false } }))
    expect(datos?.lugar).toBeUndefined()
  })
})

describe('datosCalendario — notas y link', () => {
  it('las notas contienen urlEvento(id, "app") y nada de la sesión', () => {
    const datos = datosCalendario(evento())
    expect(datos?.url).toBe(`https://www.quepintasalta.com.ar/evento/${UUID}?o=app`)
    expect(datos?.notas).toContain(datos?.url)
    for (const prohibido of ['session', 'email', 'user']) {
      expect(datos?.notas.toLowerCase()).not.toContain(prohibido)
      expect(datos?.url.toLowerCase()).not.toContain(prohibido)
    }
  })

  it('zonaHoraria siempre America/Argentina/Salta', () => {
    expect(datosCalendario(evento())?.zonaHoraria).toBe('America/Argentina/Salta')
  })
})

describe('datosCalendario — el título', () => {
  it('recorta espacios', () => {
    expect(datosCalendario(evento({ title: '  Peña en el club  ' }))?.titulo).toBe('Peña en el club')
  })

  it('vacío (o solo espacios): "Evento en Qué Pinta Salta"', () => {
    expect(datosCalendario(evento({ title: '   ' }))?.titulo).toBe('Evento en Qué Pinta Salta')
  })
})

describe('puedeAgregarseAlCalendario', () => {
  it('un evento que terminó ayer: false', () => {
    const terminoAyer = { start_date: '2026-10-15T21:00:00-03:00', end_date: null }
    expect(puedeAgregarseAlCalendario(terminoAyer, new Date('2026-10-17T12:00:00-03:00'))).toBe(false)
  })

  it('uno de esta noche: true', () => {
    const estaNoche = { start_date: '2026-10-17T21:00:00-03:00', end_date: null }
    expect(puedeAgregarseAlCalendario(estaNoche, new Date('2026-10-17T12:00:00-03:00'))).toBe(true)
  })
})

describe('DURACION_CALENDARIO_HORAS', () => {
  it('vale 4 (si Mauro la cambia, este test se actualiza a propósito)', () => {
    expect(DURACION_CALENDARIO_HORAS).toBe(4)
  })
})
