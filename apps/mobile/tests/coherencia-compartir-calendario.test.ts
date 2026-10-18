// R42, tarea 42-q parte 1: cruces entre 42-a (`lib/calendario/datos.ts`),
// 42-b (`lib/compartir.ts`) y 42-c (`lib/calendario/dispositivo.ts`), con un
// evento inventado (uuid de prueba). Sin red ni base: fixtures en memoria;
// para `dispositivo.ts` se mockea `expo-calendar` entero, mismo patrón que
// `tests/calendario-agregar.test.ts`.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { datosCalendario, type EventoParaCalendario } from '../lib/calendario/datos'
import { datosTarjetaCompartir, mensajeCompartirEvento, type EventoParaTarjetaCompartir } from '../lib/compartir'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))

// Uuid de prueba (el mismo formato que usa `tests/calendario-datos.test.ts`),
// nunca un id real.
const UUID = '7c2e9a10-4b3f-4d8e-9a1c-2f6b5d4e3a10'

const VENUE = { name: 'Centro Cultural de Prueba', address: 'Av. Ficticia 456' }

function eventoCalendario(overrides: Partial<EventoParaCalendario> = {}): EventoParaCalendario {
  return {
    id: UUID,
    title: 'Festival de Prueba',
    start_date: '2026-10-23T21:00:00-03:00',
    end_date: null,
    venue: { ...VENUE, is_placeholder: false },
    ...overrides,
  }
}

function eventoTarjeta(overrides: Partial<EventoParaTarjetaCompartir> = {}): EventoParaTarjetaCompartir {
  return {
    id: UUID,
    title: 'Festival de Prueba',
    start_date: '2026-10-23T21:00:00-03:00',
    image_url: null,
    venue: { name: VENUE.name },
    ...overrides,
  }
}

describe('coherencia 42-a/42-b/42-c — mismo evento, mismos links', () => {
  it('datosCalendario, mensajeCompartirEvento y datosTarjetaCompartir apuntan al mismo /evento/<id>', () => {
    const calendario = datosCalendario(eventoCalendario())
    expect(calendario).not.toBeNull()
    if (!calendario) throw new Error('se esperaba datosCalendario')

    const mensaje = mensajeCompartirEvento({
      eventId: UUID,
      titulo: 'Festival de Prueba',
      fecha: 'viernes, 23 de octubre',
      hora: '21:00',
      lugar: 'Centro Cultural de Prueba, Av. Ficticia 456',
    })
    expect(mensaje).not.toBeNull()
    if (!mensaje) throw new Error('se esperaba mensajeCompartirEvento')

    const tarjeta = datosTarjetaCompartir(eventoTarjeta())
    expect(tarjeta).not.toBeNull()
    if (!tarjeta) throw new Error('se esperaba datosTarjetaCompartir')

    // Las notas del calendario y el texto de "Compartir" llevan el mismo
    // link, con `?o=app` (los dos usan `urlEvento(id, 'app')`).
    expect(calendario.url).toBe(`https://www.quepintasalta.com.ar/evento/${UUID}?o=app`)
    expect(mensaje.endsWith(calendario.url)).toBe(true)
    expect(calendario.notas).toContain(calendario.url)

    // El `linkVisible` de la tarjeta es el MISMO path, pero sin `https://` y
    // sin `?o=` (nadie lo tipea con el origen).
    expect(tarjeta.linkVisible).toBe(`www.quepintasalta.com.ar/evento/${UUID}`)
    expect(tarjeta.linkVisible.startsWith('https://')).toBe(false)
    expect(tarjeta.linkVisible).not.toContain('?o=')

    // Mismo id, mismo path `/evento/<id>` en los tres.
    expect(calendario.url).toContain(`/evento/${UUID}`)
    expect(mensaje).toContain(`/evento/${UUID}`)
    expect(tarjeta.linkVisible).toContain(`/evento/${UUID}`)
  })
})

describe('coherencia 42-a/42-b — sin hora, coherente en las dos puntas', () => {
  it('00:00 de Salta: dia-completo en el calendario y "· Sin hora" en la tarjeta', () => {
    const calendario = datosCalendario(eventoCalendario({ start_date: '2026-10-23T03:00:00Z', end_date: null }))
    expect(calendario?.tipo).toBe('dia-completo')

    const tarjeta = datosTarjetaCompartir(eventoTarjeta({ start_date: '2026-10-23T03:00:00Z' }))
    expect(tarjeta?.fechaHora).toContain('· Sin hora')
  })

  it('23:30 de Salta (2026-10-24T02:30:00Z): con-hora en el calendario, y la tarjeta fecha en el día de Salta (23), no en el día UTC (24)', () => {
    const calendario = datosCalendario(eventoCalendario({ start_date: '2026-10-24T02:30:00Z', end_date: null }))
    expect(calendario?.tipo).toBe('con-hora')

    const tarjeta = datosTarjetaCompartir(eventoTarjeta({ start_date: '2026-10-24T02:30:00Z' }))
    expect(tarjeta?.fechaHora).not.toBeNull()
    if (!tarjeta) throw new Error('se esperaba datosTarjetaCompartir')
    // Día de Salta: 23. Un .toISOString().slice(0, 10) daría 24 (el día UTC).
    expect(tarjeta.fechaHora).toContain('23 de octubre')
    expect(tarjeta.fechaHora).not.toContain('24 de octubre')
    // La hora de pared en Salta es 23:30, no la hora UTC (02:30).
    expect(tarjeta.fechaHora).toContain('23:30')
  })
})

// `aEventoExpo` vive en `lib/calendario/dispositivo.ts`, el único archivo que
// importa `expo-calendar`; se mockea el módulo entero para poder importarlo
// bajo Vitest (mismo patrón que `tests/calendario-agregar.test.ts`).
describe('coherencia 42-a/42-c — aEventoExpo sobre un datosCalendario sin hora', () => {
  it('startDate a medianoche UTC del día de Salta, endDate (exclusivo) a medianoche UTC del día siguiente, allDay y timeZone UTC', async () => {
    vi.resetModules()
    vi.doMock('expo-calendar', () => ({
      EntityTypes: { EVENT: 'event' },
      getCalendars: vi.fn(),
      getCalendarPermissions: vi.fn(),
      requestCalendarPermissions: vi.fn(),
    }))
    const { aEventoExpo } = await import('../lib/calendario/dispositivo')

    // Evento sin hora, día de Salta 2026-10-23, sin end_date (dia === diaFin).
    const calendario = datosCalendario(eventoCalendario({ start_date: '2026-10-23T03:00:00Z', end_date: null }))
    expect(calendario?.tipo).toBe('dia-completo')
    if (!calendario || calendario.tipo !== 'dia-completo') throw new Error('se esperaba dia-completo')
    expect(calendario.dia).toBe('2026-10-23')
    expect(calendario.diaFin).toBe('2026-10-23')

    const evento = aEventoExpo(calendario)
    expect(evento.allDay).toBe(true)
    expect(evento.timeZone).toBe('UTC')
    expect((evento.startDate as Date).toISOString()).toBe('2026-10-23T00:00:00.000Z')
    // Fin exclusivo: medianoche UTC del día SIGUIENTE a diaFin.
    expect((evento.endDate as Date).toISOString()).toBe('2026-10-24T00:00:00.000Z')

    vi.doUnmock('expo-calendar')
  })
})

describe('sin datos de la sesión en lib/calendario/ y lib/compartir.ts', () => {
  const ARCHIVOS = [
    join('lib', 'calendario', 'datos.ts'),
    join('lib', 'calendario', 'agregar.ts'),
    join('lib', 'calendario', 'dispositivo.ts'),
    join('lib', 'compartir.ts'),
  ]

  // Patrones de uso REAL de datos de la sesión (no el texto de un comentario
  // que explique la regla, como el de `datos.ts`: "nunca un dato de la
  // sesión (`session`, `email`, `user`)" — esa frase no debe hacer fallar el
  // test, por eso no se busca la palabra suelta "session"/"email"/"user",
  // sino el patrón de uso).
  const PATRONES_PROHIBIDOS: [string, RegExp][] = [
    ['useSession(...)', /\buseSession\s*\(/],
    ['algo.session (propiedad de sesión)', /\.session\b/],
    ['user.email', /\buser\.email\b/],
    ['user.id', /\buser\.id\b/],
  ]

  it.each(ARCHIVOS)('%s: sin useSession, .session, user.email ni user.id', (relativo) => {
    const content = readFileSync(join(MOBILE_ROOT, relativo), 'utf8')
    for (const [nombre, patron] of PATRONES_PROHIBIDOS) {
      if (patron.test(content)) {
        throw new Error(`${relativo}: encontrado un uso prohibido de la sesión (${nombre})`)
      }
    }
  })

  it('el detector de verdad detecta un uso prohibido (fixture en memoria, tiene que fallar de verdad)', () => {
    const conUseSession = `const { data } = useSession()`
    const conSessionProp = `const token = auth.session.token`
    const conUserEmail = `enviarA(user.email)`
    const conUserId = `guardarFavorito(user.id)`
    const inocente = 'nunca un dato de la sesión (`session`, `email`, `user`).'

    expect(/\buseSession\s*\(/.test(conUseSession)).toBe(true)
    expect(/\.session\b/.test(conSessionProp)).toBe(true)
    expect(/\buser\.email\b/.test(conUserEmail)).toBe(true)
    expect(/\buser\.id\b/.test(conUserId)).toBe(true)

    // El comentario explicativo real de `datos.ts` no debe disparar ningún patrón.
    for (const [, patron] of PATRONES_PROHIBIDOS) {
      expect(patron.test(inocente)).toBe(false)
    }
  })
})
