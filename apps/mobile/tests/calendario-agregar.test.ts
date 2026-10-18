// 42-c: el orquestador (`lib/calendario/agregar.ts`), el adaptador puro
// `aEventoExpo` y `calendarioEditable` de `lib/calendario/dispositivo.ts`, y
// los detectores de la "rotura del lead" (ver el comentario de
// `agregar.ts`/`dispositivo.ts` para la corrección del 17/10: solo el
// camino B, sin `abrirPantallaDelSistema` — los tests del camino A del
// encargo original se caen, el resto queda igual).
//
// `lib/calendario/dispositivo.ts` es el ÚNICO archivo que importa
// `expo-calendar`; para testear `aEventoExpo` y `calendarioEditable` sin
// RN, se mockea `expo-calendar` entero (mismo patrón que
// `tests/compartir-ficha.test.ts`/`tests/iconos.test.ts`, pero con
// `vi.mock` en vez de un detector de texto para esta parte).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { agregarAlCalendario, type DepsCalendario, type EstadoPermisoCalendario } from '../lib/calendario/agregar'
import type { DatosCalendario } from '../lib/calendario/datos'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))

function datosConHora(): DatosCalendario {
  return {
    tipo: 'con-hora',
    inicio: new Date('2026-10-24T00:00:00.000Z'),
    fin: new Date('2026-10-24T04:00:00.000Z'),
    titulo: 'Peña en el club',
    lugar: 'Club Social, Mitre 123',
    notas: 'Ficha en Qué Pinta Salta: https://www.quepintasalta.com.ar/evento/x?o=app',
    url: 'https://www.quepintasalta.com.ar/evento/x?o=app',
    zonaHoraria: 'America/Argentina/Salta',
  }
}

function datosDiaCompleto(dia: string, diaFin: string): DatosCalendario {
  return {
    tipo: 'dia-completo',
    dia,
    diaFin,
    titulo: 'Muestra de arte',
    lugar: 'Museo MAC',
    notas: 'Ficha en Qué Pinta Salta: https://www.quepintasalta.com.ar/evento/x?o=app',
    url: 'https://www.quepintasalta.com.ar/evento/x?o=app',
    zonaHoraria: 'America/Argentina/Salta',
  }
}

describe('agregarAlCalendario — orden del orquestador (sin expo-calendar, con dobles)', () => {
  const concedido: EstadoPermisoCalendario = { concedido: true, puedeVolverAPreguntar: true }
  const negadoPeroPuedeVolver: EstadoPermisoCalendario = { concedido: false, puedeVolverAPreguntar: true }
  const negadoParaSiempre: EstadoPermisoCalendario = { concedido: false, puedeVolverAPreguntar: false }

  function depsBase(overrides: Partial<DepsCalendario> = {}): DepsCalendario {
    return {
      leerPermiso: vi.fn().mockResolvedValue(concedido),
      pedirPermiso: vi.fn().mockResolvedValue(concedido),
      calendarioEditable: vi.fn().mockResolvedValue({ crearEvento: vi.fn().mockResolvedValue(undefined) }),
      ...overrides,
    }
  }

  it('permiso ya concedido: no se pide de nuevo, y queda agregado', async () => {
    const pedirPermiso = vi.fn()
    const deps = depsBase({ leerPermiso: vi.fn().mockResolvedValue(concedido), pedirPermiso })
    const r = await agregarAlCalendario(datosConHora(), deps)
    expect(r).toEqual({ tipo: 'agregado' })
    expect(pedirPermiso).not.toHaveBeenCalled()
  })

  it('negado con canAskAgain: true, y sigue negado tras pedirPermiso: sin-permiso con puedeAbrirAjustes: false', async () => {
    const deps = depsBase({
      leerPermiso: vi.fn().mockResolvedValue(negadoPeroPuedeVolver),
      pedirPermiso: vi.fn().mockResolvedValue(negadoPeroPuedeVolver),
    })
    const r = await agregarAlCalendario(datosConHora(), deps)
    expect(r).toEqual({ tipo: 'sin-permiso', puedeAbrirAjustes: false })
    expect(deps.pedirPermiso).toHaveBeenCalledTimes(1)
  })

  it('negado con canAskAgain: false: no se llama a pedirPermiso, y puedeAbrirAjustes: true', async () => {
    const pedirPermiso = vi.fn()
    const deps = depsBase({ leerPermiso: vi.fn().mockResolvedValue(negadoParaSiempre), pedirPermiso })
    const r = await agregarAlCalendario(datosConHora(), deps)
    expect(r).toEqual({ tipo: 'sin-permiso', puedeAbrirAjustes: true })
    expect(pedirPermiso).not.toHaveBeenCalled()
  })

  it('pedirPermiso concede: sigue a buscar el calendario y queda agregado', async () => {
    const deps = depsBase({
      leerPermiso: vi.fn().mockResolvedValue(negadoPeroPuedeVolver),
      pedirPermiso: vi.fn().mockResolvedValue(concedido),
    })
    const r = await agregarAlCalendario(datosConHora(), deps)
    expect(r).toEqual({ tipo: 'agregado' })
  })

  it('sin calendario editable: sin-calendario', async () => {
    const deps = depsBase({ calendarioEditable: vi.fn().mockResolvedValue(null) })
    const r = await agregarAlCalendario(datosConHora(), deps)
    expect(r).toEqual({ tipo: 'sin-calendario' })
  })

  it('crearEvento tira error: error, sin excepción', async () => {
    const deps = depsBase({
      calendarioEditable: vi.fn().mockResolvedValue({ crearEvento: vi.fn().mockRejectedValue(new Error('boom')) }),
    })
    await expect(agregarAlCalendario(datosConHora(), deps)).resolves.toEqual({ tipo: 'error' })
  })

  it('leerPermiso tira error: error, sin excepción (nunca tira)', async () => {
    const deps = depsBase({ leerPermiso: vi.fn().mockRejectedValue(new Error('boom')) })
    await expect(agregarAlCalendario(datosConHora(), deps)).resolves.toEqual({ tipo: 'error' })
  })

  it('calendarioEditable tira error: error, sin excepción', async () => {
    const deps = depsBase({ calendarioEditable: vi.fn().mockRejectedValue(new Error('boom')) })
    await expect(agregarAlCalendario(datosConHora(), deps)).resolves.toEqual({ tipo: 'error' })
  })
})

// `aEventoExpo` y `calendarioEditable` viven en `lib/calendario/dispositivo.ts`
// (el único archivo con `import * as Calendar from 'expo-calendar'`), así
// que se mockea el módulo entero para poder importarlo bajo Vitest
// (`environment: 'node'`, sin RN).
describe('lib/calendario/dispositivo.ts — aEventoExpo y calendarioEditable (con expo-calendar mockeada)', () => {
  const EntityTypes = { EVENT: 'event' }

  function calendarioFake(overrides: Partial<{ id: string; allowsModifications: boolean; isPrimary: boolean; createEvent: ReturnType<typeof vi.fn> }>) {
    return {
      id: 'cal-1',
      allowsModifications: true,
      isPrimary: false,
      createEvent: vi.fn().mockResolvedValue({ id: 'ev-1' }),
      ...overrides,
    }
  }

  it('aEventoExpo — con hora: timeZone de Salta y los instantes sin tocar', async () => {
    vi.resetModules()
    vi.doMock('expo-calendar', () => ({ EntityTypes, getCalendars: vi.fn(), getCalendarPermissions: vi.fn(), requestCalendarPermissions: vi.fn() }))
    const { aEventoExpo } = await import('../lib/calendario/dispositivo')

    const evento = aEventoExpo(datosConHora())
    expect(evento.timeZone).toBe('America/Argentina/Salta')
    expect(evento.allDay).toBe(false)
    expect((evento.startDate as Date).toISOString()).toBe('2026-10-24T00:00:00.000Z')
    expect((evento.endDate as Date).toISOString()).toBe('2026-10-24T04:00:00.000Z')
    expect(evento.location).toBe('Club Social, Mitre 123')
    expect(evento.notes).toContain('quepintasalta.com.ar')
    vi.doUnmock('expo-calendar')
  })

  it('aEventoExpo — día completo de un solo día (2026-10-23): startDate y endDate (exclusivo) en UTC', async () => {
    vi.resetModules()
    vi.doMock('expo-calendar', () => ({ EntityTypes, getCalendars: vi.fn(), getCalendarPermissions: vi.fn(), requestCalendarPermissions: vi.fn() }))
    const { aEventoExpo } = await import('../lib/calendario/dispositivo')

    const evento = aEventoExpo(datosDiaCompleto('2026-10-23', '2026-10-23'))
    expect(evento.allDay).toBe(true)
    expect(evento.timeZone).toBe('UTC')
    expect((evento.startDate as Date).toISOString()).toBe('2026-10-23T00:00:00.000Z')
    expect((evento.endDate as Date).toISOString()).toBe('2026-10-24T00:00:00.000Z')
    vi.doUnmock('expo-calendar')
  })

  it('aEventoExpo — día completo de varios días (23 a 26): endDate es el día siguiente a diaFin', async () => {
    vi.resetModules()
    vi.doMock('expo-calendar', () => ({ EntityTypes, getCalendars: vi.fn(), getCalendarPermissions: vi.fn(), requestCalendarPermissions: vi.fn() }))
    const { aEventoExpo } = await import('../lib/calendario/dispositivo')

    const evento = aEventoExpo(datosDiaCompleto('2026-10-23', '2026-10-26'))
    expect((evento.startDate as Date).toISOString()).toBe('2026-10-23T00:00:00.000Z')
    expect((evento.endDate as Date).toISOString()).toBe('2026-10-27T00:00:00.000Z')
    vi.doUnmock('expo-calendar')
  })

  it('calendarioEditable — prefiere el principal editable, si hay varios', async () => {
    vi.resetModules()
    const noEditable = calendarioFake({ id: 'no-editable', allowsModifications: false, isPrimary: true })
    const editableSecundario = calendarioFake({ id: 'secundario', allowsModifications: true, isPrimary: false })
    const editablePrincipal = calendarioFake({ id: 'principal', allowsModifications: true, isPrimary: true })
    const getCalendars = vi.fn().mockResolvedValue([noEditable, editableSecundario, editablePrincipal])
    vi.doMock('expo-calendar', () => ({
      EntityTypes,
      getCalendars,
      getCalendarPermissions: vi.fn(),
      requestCalendarPermissions: vi.fn(),
    }))
    const { depsDelDispositivo } = await import('../lib/calendario/dispositivo')

    const calendario = await depsDelDispositivo().calendarioEditable()
    expect(calendario).not.toBeNull()
    await calendario?.crearEvento(datosConHora())
    expect(editablePrincipal.createEvent).toHaveBeenCalledTimes(1)
    expect(editableSecundario.createEvent).not.toHaveBeenCalled()
    expect(getCalendars).toHaveBeenCalledWith('event')
    vi.doUnmock('expo-calendar')
  })

  it('calendarioEditable — sin ninguno editable: null', async () => {
    vi.resetModules()
    const soloNoEditable = calendarioFake({ allowsModifications: false, isPrimary: true })
    vi.doMock('expo-calendar', () => ({
      EntityTypes,
      getCalendars: vi.fn().mockResolvedValue([soloNoEditable]),
      getCalendarPermissions: vi.fn(),
      requestCalendarPermissions: vi.fn(),
    }))
    const { depsDelDispositivo } = await import('../lib/calendario/dispositivo')

    const calendario = await depsDelDispositivo().calendarioEditable()
    expect(calendario).toBeNull()
    vi.doUnmock('expo-calendar')
  })

  it('calendarioEditable — sin principal, pero con uno editable (no principal): ese', async () => {
    vi.resetModules()
    const editable = calendarioFake({ allowsModifications: true, isPrimary: false })
    vi.doMock('expo-calendar', () => ({
      EntityTypes,
      getCalendars: vi.fn().mockResolvedValue([editable]),
      getCalendarPermissions: vi.fn(),
      requestCalendarPermissions: vi.fn(),
    }))
    const { depsDelDispositivo } = await import('../lib/calendario/dispositivo')

    const calendario = await depsDelDispositivo().calendarioEditable()
    expect(calendario).not.toBeNull()
    await calendario?.crearEvento(datosConHora())
    expect(editable.createEvent).toHaveBeenCalledTimes(1)
    vi.doUnmock('expo-calendar')
  })

  it('depsDelDispositivo — leerPermiso y pedirPermiso mapean granted/canAskAgain SIN writeOnly', async () => {
    vi.resetModules()
    const getCalendarPermissions = vi.fn().mockResolvedValue({ granted: false, canAskAgain: true })
    const requestCalendarPermissions = vi.fn().mockResolvedValue({ granted: true, canAskAgain: true })
    vi.doMock('expo-calendar', () => ({
      EntityTypes,
      getCalendars: vi.fn(),
      getCalendarPermissions,
      requestCalendarPermissions,
    }))
    const { depsDelDispositivo } = await import('../lib/calendario/dispositivo')
    const deps = depsDelDispositivo()

    await expect(deps.leerPermiso()).resolves.toEqual({ concedido: false, puedeVolverAPreguntar: true })
    expect(getCalendarPermissions).toHaveBeenCalledWith()

    await expect(deps.pedirPermiso()).resolves.toEqual({ concedido: true, puedeVolverAPreguntar: true })
    expect(requestCalendarPermissions).toHaveBeenCalledWith()
    vi.doUnmock('expo-calendar')
  })
})

// Detectores de la "rotura del lead" (ver `app/evento/[id].tsx` y
// `components/BotonCalendario.tsx`): mismo estilo de fixtures en memoria que
// `tests/iconos.test.ts`/`tests/dimensions.test.ts`/`tests/compartir-ficha.test.ts`.

/** `true` si `content` importa (o hace `require` de) `expo-calendar`, de
 * cualquier forma, incluidas subrutas como `expo-calendar/legacy`. */
export function importaExpoCalendar(content: string): boolean {
  return (
    /\bfrom\s+['"]expo-calendar(\/[^'"]*)?['"]/.test(content) ||
    /\brequire\(\s*['"]expo-calendar(\/[^'"]*)?['"]\s*\)/.test(content)
  )
}

function leerBalanceado(content: string, desdeIndex: number, abre: string, cierra: string): string {
  let profundidad = 1
  let j = desdeIndex
  for (; j < content.length; j++) {
    if (content[j] === abre) profundidad++
    else if (content[j] === cierra) {
      profundidad--
      if (profundidad === 0) break
    }
  }
  return content.slice(desdeIndex, j)
}

const NOMBRES_PROHIBIDOS_EN_EFECTO = [/\bagregarAlCalendario\s*\(/, /\bpedirPermiso\s*\(/, /\brequestCalendarPermissions\s*\(/]

/** Las violaciones de "el permiso se pide recién al tocar el botón": un
 * `useEffect(...)` cuyo cuerpo llama a `agregarAlCalendario`, `pedirPermiso`
 * o `requestCalendarPermissions`. Heurística con regex, como el resto de
 * los detectores de esta carpeta. */
export function usosProhibidosEnUseEffect(content: string): string[] {
  const violaciones: string[] = []
  const re = /useEffect\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content))) {
    const inicioArg = m.index + m[0].length
    const cuerpo = leerBalanceado(content, inicioArg, '(', ')')
    for (const patron of NOMBRES_PROHIBIDOS_EN_EFECTO) {
      if (patron.test(cuerpo)) {
        violaciones.push(`useEffect llama a algo prohibido (${patron})`)
      }
    }
  }
  return violaciones
}

function listarTsxYTs(root: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(root)) {
    const full = join(root, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      out.push(...listarTsxYTs(full))
    } else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
      out.push(full)
    }
  }
  return out
}

describe('importaExpoCalendar (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('detecta un import con comillas simples', () => {
    expect(importaExpoCalendar(`import * as Calendar from 'expo-calendar'`)).toBe(true)
  })

  it('detecta un import de una subruta (expo-calendar/legacy)', () => {
    expect(importaExpoCalendar(`import * as Calendar from 'expo-calendar/legacy'`)).toBe(true)
  })

  it('detecta un require', () => {
    expect(importaExpoCalendar(`const Calendar = require('expo-calendar')`)).toBe(true)
  })

  it('no confunde un import de otro paquete', () => {
    expect(importaExpoCalendar(`import { agregarAlCalendario } from '@/lib/calendario/agregar'`)).toBe(false)
  })

  it('sin ningún import: false', () => {
    expect(importaExpoCalendar(`export function Foo() { return null }`)).toBe(false)
  })
})

describe('usosProhibidosEnUseEffect (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('detecta agregarAlCalendario dentro de un useEffect', () => {
    const content = `useEffect(() => { agregarAlCalendario(datos, deps) }, [])`
    expect(usosProhibidosEnUseEffect(content).length).toBeGreaterThan(0)
  })

  it('detecta pedirPermiso dentro de un useEffect', () => {
    const content = `useEffect(() => { deps.pedirPermiso() }, [])`
    expect(usosProhibidosEnUseEffect(content).length).toBeGreaterThan(0)
  })

  it('detecta requestCalendarPermissions dentro de un useEffect', () => {
    const content = `useEffect(() => { Calendar.requestCalendarPermissions() }, [])`
    expect(usosProhibidosEnUseEffect(content).length).toBeGreaterThan(0)
  })

  it('no confunde un useEffect inocente (sin nada prohibido)', () => {
    const content = `useEffect(() => { setCargando(false) }, [])`
    expect(usosProhibidosEnUseEffect(content)).toEqual([])
  })

  it('no confunde una llamada a agregarAlCalendario FUERA de un useEffect (por ejemplo, en un onPress)', () => {
    const content = `function alAgregar() { agregarAlCalendario(datos, deps) }`
    expect(usosProhibidosEnUseEffect(content)).toEqual([])
  })

  it('sin ningún useEffect: sin violaciones', () => {
    expect(usosProhibidosEnUseEffect(`export function Foo() { return null }`)).toEqual([])
  })
})

describe('app/, components/ y lib/: expo-calendar solo se importa en lib/calendario/dispositivo.ts', () => {
  const APP_DIR = join(MOBILE_ROOT, 'app')
  const COMPONENTS_DIR = join(MOBILE_ROOT, 'components')
  const LIB_DIR = join(MOBILE_ROOT, 'lib')
  const DISPOSITIVO_RELATIVO = join('lib', 'calendario', 'dispositivo.ts')

  const archivos = [...listarTsxYTs(APP_DIR), ...listarTsxYTs(COMPONENTS_DIR), ...listarTsxYTs(LIB_DIR)]

  it('encuentra al menos un archivo para analizar, incluido dispositivo.ts', () => {
    expect(archivos.length).toBeGreaterThan(0)
    expect(archivos.some((f) => relative(MOBILE_ROOT, f) === DISPOSITIVO_RELATIVO)).toBe(true)
  })

  it('lib/calendario/dispositivo.ts sí importa expo-calendar (es el adaptador)', () => {
    const content = readFileSync(join(MOBILE_ROOT, DISPOSITIVO_RELATIVO), 'utf8')
    expect(importaExpoCalendar(content)).toBe(true)
  })

  it.each(
    archivos
      .map((file) => [relative(MOBILE_ROOT, file), file] as const)
      .filter(([label]) => label !== DISPOSITIVO_RELATIVO)
  )('%s: no importa expo-calendar directo', (label, file) => {
    const content = readFileSync(file, 'utf8')
    if (importaExpoCalendar(content)) {
      throw new Error(`${label}: importa expo-calendar directo (el único adaptador aprobado es lib/calendario/dispositivo.ts)`)
    }
    expect(importaExpoCalendar(content)).toBe(false)
  })
})

describe('components/BotonCalendario.tsx: ningún useEffect pide permiso ni toca el calendario', () => {
  const content = readFileSync(join(MOBILE_ROOT, 'components', 'BotonCalendario.tsx'), 'utf8')

  it('sin violaciones en BotonCalendario.tsx real', () => {
    expect(usosProhibidosEnUseEffect(content)).toEqual([])
  })
})
