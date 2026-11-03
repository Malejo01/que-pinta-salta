// Q6-1 · La app completa en inglés: Inicio, Buscar, Mis eventos, Radar y
// Cuenta. Lo que no cubre el detector de texto suelto
// (`tests/i18n-detector.test.ts`, con `PANTALLAS_MIGRADAS`):
//   1. los mensajes que llegan armados en castellano desde `lib/` y core
//      tienen su inglés (`en.errores.traducir`) y la clave es el texto real;
//   2. la lógica pura de los textos (vacíos, conteos, anuncios) en inglés;
//   3. los avisos LOCALES («Mañana: …», «Este finde pinta») en el idioma
//      elegido, leído del teléfono al programarlos, y reprogramados al cambiarlo;
//   4. los botones con texto no se cortan con la letra al 200 %.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

import { saltaWallClockToDate, saltaWallClockToUtcISO } from '@qps/core/date-format'
import type { DisplayEvent } from '@qps/core/home/types'
import { quitarComentarios } from '@qps/core/tests/convencion-entorno'
import { textoResultadosBuscar, textoSinResultadosBuscar } from '../lib/buscar-filtros'
import { decidirFinde, textoFinde } from '../lib/finde/finde'
import { CLAVE_AGENDA, VERSION_CACHE } from '../lib/sin-conexion/cache'
import { programarFinde, type ModuloNotificacionesFinde } from '../lib/finde'
import { textoCantidadEventos, textoPrecio } from '../lib/formato'
import { ERRORES_EN, en } from '../lib/i18n/diccionarios/en'
import { es } from '../lib/i18n/diccionarios/es'
import { CLAVE_IDIOMA, idiomaGuardado } from '../lib/i18n/idioma'
import { textosDe } from '../lib/i18n/textos'
import { etiquetaAccesibleFiltros, etiquetaVisibleFiltros, chipsRemovibles, textoVerEventos } from '../lib/portada-filtros'
import { segundaSalidaVacioGratis, textoVacioGratis, tituloGratis } from '../lib/portada-gratis'
import { salidasVacioParaChicos, textoVacioParaChicos, tituloParaChicos } from '../lib/portada-para-chicos'
import { estadoAnunciableBuscar, estadoAnunciablePortada } from '../lib/anunciar-conteo'
import { sincronizarRecordatorios, type DependenciasRecordatorios, type ModuloNotificacionesLocales } from '../lib/recordatorios'
import { planificarRecordatorios, textoDelRecordatorio } from '../lib/recordatorios/programacion'
import { resumenRadar } from '../lib/radar-vista'
import type { Almacen } from '../lib/sin-conexion/almacen'
import { textoGuardadoEn, TITULO_SIN_CONEXION } from '../lib/sin-conexion/aviso'
import { decidirRefresco, mensajeErrorCarga, type EstadoRefrescable, textoVacioCategoria, vacioBuscadorRadar, vacioHoyEnSalta } from '../lib/vacios'
import { enlacesLegales, textoAceptacion } from '../lib/legales'
import { TEXTOS_PUSH } from '../lib/push/estado'

// `vi.mock` se iza arriba de los imports: los módulos de avisos no tocan lo nativo.
vi.mock('expo-notifications', () => ({ SchedulableTriggerInputTypes: { DATE: 'date' } }))
vi.mock('@/lib/sin-conexion/almacen', () => ({ almacenPorDefecto: { leer: async () => null, escribir: async () => {}, borrar: async () => {} } }))

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const leer = (...partes: string[]) => readFileSync(join(RAIZ, ...partes), 'utf8')
const codigo = (...partes: string[]) => quitarComentarios(leer(...partes))

// ---------------------------------------------------------------------------
// 1. Los mensajes armados en castellano: cada uno tiene su inglés.
// ---------------------------------------------------------------------------

/** Los literales de `const MENSAJE_* = '…'` (y sus variantes) de un archivo. */
function constantesDeMensaje(fuente: string): string[] {
  return [...quitarComentarios(fuente).matchAll(/const (?:MENSAJE|SUGERENCIA)_[A-Z_]+\s*=\s*'([^']+)'/g)].map((m) => m[1]!)
}

describe('1. errores.traducir: lo que llega armado de lib/ y de core, en inglés', () => {
  const ARCHIVOS = [
    ['lib', 'mensajes.ts'],
    ['lib', 'datos', 'eventos.ts'],
    ['lib', 'datos', 'cines.ts'],
    ['lib', 'favoritos.ts'],
    ['lib', 'notificaciones.ts'],
    ['lib', 'radar.ts'],
    ['lib', 'asistencia.ts'],
    ['lib', 'google.ts'],
    ['app', '(tabs)', 'cuenta.tsx'],
  ]

  it.each(ARCHIVOS.map((a) => [a.join('/'), a] as const))('%s: cada MENSAJE_* tiene su traducción (la clave es el texto real)', (_n, partes) => {
    const mensajes = constantesDeMensaje(leer(...partes))
    expect(mensajes.length).toBeGreaterThan(0)
    for (const m of mensajes) {
      expect(ERRORES_EN[m], m).toBeTruthy()
      expect(ERRORES_EN[m], m).not.toBe(m)
    }
  })

  it('cuenta.tsx: MENSAJES_ERROR (la excepción documentada) también tiene su inglés', () => {
    const src = leer('app', '(tabs)', 'cuenta.tsx')
    const bloque = src.slice(src.indexOf('const MENSAJES_ERROR'), src.indexOf('const MENSAJE_GENERICO'))
    const valores = [...quitarComentarios(bloque).matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]!)
    expect(valores.length).toBeGreaterThanOrEqual(8)
    for (const v of valores) expect(en.errores.traducir(v), v).not.toBe(v)
  })

  it('en castellano no cambia nada; en inglés traduce renglón por renglón y deja lo desconocido como está', () => {
    expect(es.errores.traducir(TITULO_SIN_CONEXION)).toBe(TITULO_SIN_CONEXION)
    expect(en.errores.traducir(TITULO_SIN_CONEXION)).toBe(en.mensajes.tituloSinConexion)
    expect(en.errores.traducir('El email o la contraseña no son correctos.\nSi entraste con Google, usá el botón de Google.')).toBe(
      'The email or password is incorrect.\nIf you signed up with Google, use the Google button.',
    )
    expect(en.errores.traducir('algo que no conocemos')).toBe('algo que no conocemos')
  })

  it('es.mensajes son las constantes de lib/mensajes.ts (una sola definición) y en.mensajes, su inglés', () => {
    expect(textosDe('es').mensajes.sinConexion.inicio).toBe(mensajeErrorCarga('inicio', { error: 'x', sinConexion: true }))
    expect(mensajeErrorCarga('radar', { error: 'x', sinConexion: true }, 'en')).toBe(en.mensajes.sinConexion.radar)
    expect(mensajeErrorCarga('buscar', { error: 'x' }, 'en')).toBe(en.mensajes.servidor.buscar)
    for (const v of [en.mensajes.sinConfiguracion, en.mensajes.actualizado, en.mensajes.tituloSinConexion]) expect(v).toBeTruthy()
  })

  it('los textos del estado de push (Cuenta y Mis eventos) tienen los mismos estados en los dos idiomas', () => {
    expect(es.notificaciones.estadosPush).toBe(TEXTOS_PUSH)
    expect(Object.keys(en.notificaciones.estadosPush).sort()).toEqual(Object.keys(TEXTOS_PUSH).sort())
  })
})

// ---------------------------------------------------------------------------
// 2. La lógica pura de los textos, en inglés (y el castellano de siempre).
// ---------------------------------------------------------------------------
describe('2. vacíos, conteos y anuncios en inglés', () => {
  it('portada: título y vacío de Gratis y Para chicos, segunda salida', () => {
    expect(tituloGratis('Music', 'finde', 'en')).toBe('Free Music · Weekend')
    expect(tituloGratis(null, 'hoy')).toBe('Gratis · Hoy')
    expect(textoVacioGratis(null, '', 'esta-noche', 'en')).toBe('No free events tonight.')
    expect(textoVacioGratis('cine', 'Cinema', 'hoy', 'en')).toBe('No free Cinema events today. Films now showing are not free.')
    expect(tituloParaChicos(null, null, 'semana', true, 'en')).toBe('Free for kids · This week')
    expect(tituloParaChicos('Music', 'musica', 'hoy', false, 'en')).toBe('Music for kids · Today')
    expect(textoVacioParaChicos(null, '', 'finde', false, 'en')).toBe('No events for kids this weekend.')
    expect(segundaSalidaVacioGratis('musica', 'hoy', 'en')).toEqual({ tipo: 'todas-las-categorias', texto: 'All categories' })
    expect(salidasVacioParaChicos(null, 'hoy', false, 'en').principal.texto).toBe('See all ages')
    expect(textoVacioCategoria({ nombre: 'Music', atajo: 'hoy', esCine: false, desdeCache: true, idioma: 'en' })).toBe(
      'You are offline, so we cannot see Music events today.',
    )
  })

  it('«Hoy en Salta» vacío: la acción nunca es la pill elegida, también en inglés', () => {
    const v = vacioHoyEnSalta({ atajo: 'semana', hayEventosEnAtajo: true, hayEventosEnFinde: true, desdeCache: false, idioma: 'en' })
    expect(v).toEqual({ texto: en.vacios.semanaEnFilas, accion: { texto: 'See the weekend', destino: { tipo: 'atajo', atajo: 'finde' } } })
    expect(vacioHoyEnSalta({ atajo: 'hoy', hayEventosEnAtajo: false, hayEventosEnFinde: false, desdeCache: false, idioma: 'en' })).toBeNull()
  })

  it('Buscar: conteo y vacío con singular y plural', () => {
    const f = { texto: '', soloGratis: true, paraChicos: true, categoria: 'musica', nombreCategoria: 'Music', atajo: 'finde' as const }
    expect(textoResultadosBuscar(1, f, 'en')).toBe('1 free event for kids in Music · this weekend')
    expect(textoResultadosBuscar(3, f, 'en')).toBe('3 free events for kids in Music · this weekend')
    expect(textoResultadosBuscar(1, { ...f, texto: 'peña' }, 'en')).toBe('1 result for "peña" in Music · this weekend')
    expect(textoSinResultadosBuscar({ ...f, atajo: null }, 'en')).toBe('No free events for kids in Music for now.')
    expect(textoResultadosBuscar(2, f)).toBe('2 eventos gratis para chicos en Music · el finde')
  })

  it('el botón «Filtros», los chips removibles y «Ver N eventos»', () => {
    expect(etiquetaVisibleFiltros(2, 'en')).toBe('Filters · 2')
    expect(etiquetaAccesibleFiltros(1, 'en')).toBe('Filters, 1 active')
    expect(etiquetaAccesibleFiltros(0)).toBe('Filtros')
    expect(chipsRemovibles({ gratis: true, paraChicos: false, categoria: 'musica' }, 'Music', 'en')).toEqual([
      { clave: 'gratis', texto: 'Free', etiqueta: 'Remove Free' },
      { clave: 'categoria', texto: 'Music', etiqueta: 'Remove Music' },
    ])
    expect([textoVerEventos(1, 'en'), textoVerEventos(5, 'en')]).toEqual(['See 1 event', 'See 5 events'])
  })

  it('anuncios: la salida de la grilla y el de Buscar sin filtros', () => {
    const portada = estadoAnunciablePortada({ atajo: 'finde', categoria: null, gratis: true, paraChicos: false, tituloGrilla: 'x', anuncio: null, idioma: 'en' })
    expect(portada.alSalir).toBe('No filters: all events this weekend')
    expect(estadoAnunciablePortada({ atajo: 'finde', categoria: null, gratis: true, paraChicos: false, tituloGrilla: 'x', anuncio: null }).alSalir).toBe(
      'Sin filtros: todos los eventos del finde',
    )
    const buscar = estadoAnunciableBuscar({
      mostrarResultados: true,
      cantidad: 2,
      filtros: { texto: 'peña', soloGratis: true, paraChicos: false, categoria: null, nombreCategoria: null, atajo: null },
      idioma: 'en',
    })
    expect(buscar).toMatchObject({ conteo: '2 results for "peña"', titulo: 'free only', alSalir: 'No filters: browse by category' })
  })

  it('el aviso sin conexión, el refresco, el Radar, precio y legales', () => {
    const guardado = saltaWallClockToDate('2026-11-03T09:05:00')
    expect(textoGuardadoEn(guardado, saltaWallClockToDate('2026-11-03T12:00:00'), 'en')).toBe('Saved today at 09:05')
    expect(textoGuardadoEn(guardado, saltaWallClockToDate('2026-11-04T12:00:00'), 'en')).toBe('Saved yesterday at 09:05')
    const ok: EstadoRefrescable = { tipo: 'ok', desdeCache: null }
    expect(decidirRefresco(ok, { tipo: 'error', sinConexion: true }, null, 'en').nota).toBe(en.mensajes.noSeActualizoSinConexion)
    expect(resumenRadar('weekly', 'a@b.c', 'en')).toBe('Your Radar is on: it reaches a@b.c every week')
    expect(resumenRadar('disabled', 'a@b.c')).toBe('Tu Radar está pausado')
    expect(vacioBuscadorRadar({ busqueda: ' metro ', coincideConLoQueYaSeguis: false, idioma: 'en' }).textoAccion).toBe('Clear search')
    expect([textoPrecio('gratis', 'en'), textoPrecio(1500, 'en')]).toEqual(['Free', '$1.500'])
    expect([textoCantidadEventos(1, 'en'), textoCantidadEventos(2, 'en')]).toEqual(['1 event', '2 events'])
    // Las páginas legales existen solo en castellano: en inglés el link lo dice.
    expect(enlacesLegales(true, 'en').map((e) => e.texto)).toEqual(['Privacy policy (in Spanish)', 'Terms and conditions (in Spanish)'])
    expect(textoAceptacion(true, 'en')).toMatch(/\(in Spanish\)\.$/)
  })

  it('Cuenta: la fila de la contraseña y la versión', () => {
    expect(en.cuenta.filaContrasena('Cambiar contraseña')).toBe('Change password')
    expect(en.cuenta.filaContrasena('Contraseña')).toBe('Password')
    expect(es.cuenta.filaContrasena('Contraseña')).toBe('Contraseña')
    expect(en.cuenta.version('Versión 0.1.0 · preview')).toBe('Version 0.1.0 · preview')
    expect(en.cuenta.version('Versión desconocida')).toBe('Version unknown')
  })
})

// ---------------------------------------------------------------------------
// 3. Los avisos locales, en el idioma elegido.
// ---------------------------------------------------------------------------
function almacen(datos: Record<string, string> = {}): Almacen & { datos: Map<string, string> } {
  const m = new Map(Object.entries(datos))
  return {
    datos: m,
    leer: async (k) => m.get(k) ?? null,
    escribir: async (k, v) => void m.set(k, v),
    borrar: async (k) => void m.delete(k),
    claves: async () => [...m.keys()],
    borrarVarias: async (ks) => ks.forEach((k) => m.delete(k)),
  }
}

function notificaciones() {
  const programadas = new Map<string, { content: { title: string; body: string } }>()
  const modulo = {
    getPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
    getAllScheduledNotificationsAsync: vi.fn(async () => [...programadas.keys()].map((identifier) => ({ identifier }))),
    cancelScheduledNotificationAsync: vi.fn(async (id: string) => void programadas.delete(id)),
    scheduleNotificationAsync: vi.fn(async (p: { identifier: string; content: { title: string; body: string } }) => {
      programadas.set(p.identifier, p)
      return p.identifier
    }),
  }
  return { programadas, modulo }
}

function evento(id: string, inicioSalta: string, extra: Partial<DisplayEvent> = {}): DisplayEvent {
  return {
    id,
    slug: id,
    title: `Peña ${id}`,
    venue: 'La Casona',
    date: inicioSalta.slice(0, 10),
    time: inicioSalta.slice(11, 16),
    category: 'penas',
    categoryName: 'Peñas',
    price: 'gratis',
    image: '',
    description: '',
    address: '',
    startDateTime: saltaWallClockToUtcISO(inicioSalta),
    isFeatured: false,
    status: 'PUBLISHED',
    ...extra,
  }
}

const AHORA = saltaWallClockToDate('2026-11-03T10:00:00')

describe('3. «Mañana: …» (recordatorios locales de lo guardado)', () => {
  it('el texto, con y sin hora, en los dos idiomas', () => {
    expect(textoDelRecordatorio(' Peña ', '21:30')).toBe('Mañana: Peña a las 21:30')
    expect(textoDelRecordatorio('Peña', '')).toBe('Mañana: Peña')
    expect(textoDelRecordatorio('Peña', '21:30', 'en')).toBe('Tomorrow: Peña at 21:30')
    expect(textoDelRecordatorio('Peña', null, 'en')).toBe('Tomorrow: Peña')
  })

  it('en inglés usa el título traducido si lo hay, y el cuerpo sin lugar también va en inglés', () => {
    const plan = planificarRecordatorios(
      [
        evento('a', '2026-11-07T21:30:00', { titleEn: 'Folk night' }),
        evento('b', '2026-11-08T20:00:00', { venue: 'Lugar por confirmar' }),
      ],
      AHORA,
      undefined,
      'en',
    )
    expect(plan.map((r) => [r.titulo, r.cuerpo])).toEqual([
      ['Tomorrow: Folk night at 21:30', 'La Casona'],
      ['Tomorrow: Peña b at 20:00', 'Tap to see the event.'],
    ])
    expect(planificarRecordatorios([evento('b', '2026-11-08T20:00:00', { venue: 'Lugar por confirmar' })], AHORA)[0]!.cuerpo).toBe(
      'Tocá para ver el evento.',
    )
  })

  it('sin idioma en las dependencias, lee el guardado en el teléfono (Cuenta → Idioma)', async () => {
    const n = notificaciones()
    const deps: DependenciasRecordatorios = {
      notificaciones: n.modulo as unknown as ModuloNotificacionesLocales,
      almacen: almacen({ [CLAVE_IDIOMA]: 'en' }),
    }
    await sincronizarRecordatorios([evento('a', '2026-11-07T21:30:00')], AHORA, deps)
    expect(n.programadas.get('recordatorio-guardado:a')!.content.title).toBe('Tomorrow: Peña a at 21:30')
  })

  it('el idioma de las dependencias manda (el sincronizador le pasa el de la app)', async () => {
    const n = notificaciones()
    const deps: DependenciasRecordatorios = {
      notificaciones: n.modulo as unknown as ModuloNotificacionesLocales,
      almacen: almacen({ [CLAVE_IDIOMA]: 'en' }),
      idioma: 'es',
    }
    await sincronizarRecordatorios([evento('a', '2026-11-07T21:30:00')], AHORA, deps)
    expect(n.programadas.get('recordatorio-guardado:a')!.content.title).toBe('Mañana: Peña a a las 21:30')
  })

  it('idiomaGuardado: la preferencia guardada, o el idioma del teléfono con «Automático»', async () => {
    expect(await idiomaGuardado(almacen({ [CLAVE_IDIOMA]: 'en' }), 'es-AR')).toBe('en')
    expect(await idiomaGuardado(almacen({ [CLAVE_IDIOMA]: 'es' }), 'en-US')).toBe('es')
    expect(await idiomaGuardado(almacen(), 'en-US')).toBe('en')
    expect(await idiomaGuardado(almacen(), 'es-AR')).toBe('es')
  })
})

describe('3. «Este finde pinta»', () => {
  it('el texto, singular y plural, con y sin gratis, en los dos idiomas', () => {
    expect(textoFinde(1, 0)).toBe('Este finde pinta: 1 plan')
    expect(textoFinde(4, 2)).toBe('Este finde pinta: 4 planes, 2 gratis')
    expect(textoFinde(1, 1, 'en')).toBe('What’s on this weekend: 1 plan, 1 free')
    expect(textoFinde(5, 0, 'en')).toBe('What’s on this weekend: 5 plans')
  })

  const FINDE = [
    { paraAtajo: { start_date: saltaWallClockToUtcISO('2026-11-06T21:00:00'), category: 'penas' }, gratis: true },
    { paraAtajo: { start_date: saltaWallClockToUtcISO('2026-11-07T22:00:00'), category: 'penas' }, gratis: false },
  ]

  it('decidirFinde arma el título y el cuerpo en el idioma pedido', () => {
    const d = decidirFinde({ ahora: AHORA, activo: true, eventos: FINDE, guardadoEn: AHORA, diaAvisoEquipo: null, idioma: 'en' })
    expect(d).toMatchObject({ programar: true, titulo: 'What’s on this weekend: 2 plans, 1 free', cuerpo: en.avisos.findeCuerpo })
    const dEs = decidirFinde({ ahora: AHORA, activo: true, eventos: FINDE, guardadoEn: AHORA, diaAvisoEquipo: null })
    expect(dEs).toMatchObject({ titulo: 'Este finde pinta: 2 planes, 1 gratis', cuerpo: 'Mirá qué hay para el viernes, el sábado y el domingo.' })
  })

  it('programarFinde: sin idioma, el guardado en el teléfono; con idioma, ese', async () => {
    const agenda = {
      eventos: FINDE.map((e, i) => ({ evento: { id: `e${i}`, price: e.gratis ? 'gratis' : 1000 }, paraAtajo: e.paraAtajo, paraChicos: false })),
      categorias: [],
      peliculas: [],
    }
    const guardada = JSON.stringify({ v: VERSION_CACHE, guardadoEn: AHORA.toISOString(), datos: agenda })
    const n1 = notificaciones()
    await programarFinde(AHORA, {
      almacen: almacen({ [CLAVE_AGENDA]: guardada, [CLAVE_IDIOMA]: 'en' }),
      notificaciones: n1.modulo as unknown as ModuloNotificacionesFinde,
    })
    expect(n1.programadas.get('finde-pinta')!.content).toMatchObject({ title: 'What’s on this weekend: 2 plans, 1 free', body: en.avisos.findeCuerpo })
    const n2 = notificaciones()
    await programarFinde(AHORA, {
      almacen: almacen({ [CLAVE_AGENDA]: guardada, [CLAVE_IDIOMA]: 'en' }),
      notificaciones: n2.modulo as unknown as ModuloNotificacionesFinde,
      idioma: 'es',
    })
    expect(n2.programadas.get('finde-pinta')!.content.title).toBe('Este finde pinta: 2 planes, 1 gratis')
  })
})

describe('3. cambiar el idioma en Cuenta reprograma los avisos locales', () => {
  it('los dos sincronizadores leen el idioma de la app, se lo pasan a la programación y vuelven a correr al cambiarlo', () => {
    const recordatorios = codigo('components', 'SincronizadorRecordatorios.tsx')
    expect(recordatorios).toMatch(/const \{ idioma, listo \} = useIdioma\(\)/)
    expect(recordatorios.match(/sincronizarRecordatorios\([^\n]*\{ idioma \}\)/g)).toHaveLength(2)
    expect(recordatorios).toMatch(/if \(cargando \|\| !listo\) return/)
    expect(recordatorios).toMatch(/\}, \[userId, cargando, estado, idioma, listo\]\)/)
    const finde = codigo('components', 'SincronizadorFinde.tsx')
    expect(finde).toMatch(/const \{ idioma, listo \} = useIdioma\(\)/)
    expect(finde).toMatch(/if \(!listo\) return/)
    expect(finde).toMatch(/programarFinde\(new Date\(\), \{ idioma \}\)/)
    expect(finde.match(/registrarAvisoDelEquipo\(new Date\(\), \{ idioma \}\)/g)).toHaveLength(3)
    expect(finde).toMatch(/\}, \[estado, idioma, listo\]\)/)
    expect(codigo('components', 'InterruptorFinde.tsx')).toMatch(/await programarFinde\(new Date\(\), \{ idioma \}\)/)
  })

  it('el provider avisa cuándo ya leyó la preferencia guardada (para no programar dos veces con idiomas distintos)', () => {
    const provider = codigo('lib', 'i18n', 'index.tsx')
    expect(provider).toMatch(/const \[listo, setListo\] = useState\(false\)/)
    expect(provider).toMatch(/setPreferencia\(p\)\s*setListo\(true\)/)
    expect(provider).toMatch(/listo: true,\s*\}\)/)
  })

  it('la programación lee el idioma guardado cuando nadie se lo pasa (avisos con la app cerrada)', () => {
    expect(codigo('lib', 'recordatorios', 'index.ts')).toMatch(/deps\.idioma \?\? \(await idiomaGuardado\(deps\.almacen \?\? almacenPorDefecto\)\)/)
    expect(codigo('lib', 'finde', 'index.ts')).toMatch(/deps\.idioma \?\? idiomaGuardado\(almacen\)/)
  })
})

// ---------------------------------------------------------------------------
// 4. Botones, pills y chips con la letra al 200 % (fontScale 2).
// ---------------------------------------------------------------------------

/** Los estilos de `StyleSheet.create` (o del objeto `estilos`) por nombre, como texto. */
function estilosDe(fuente: string): Map<string, string> {
  const mapa = new Map<string, string>()
  for (const m of fuente.matchAll(/\n\s+(\w+):\s*(\{[^{}]*\})/g)) mapa.set(m[1]!, m[2]!)
  return mapa
}

/** El contenido de `nombre={…}` con las llaves balanceadas (o '' si no está). */
function atributoBalanceado(atributos: string, nombre: string): string {
  const inicio = atributos.indexOf(`${nombre}={`)
  if (inicio < 0) return ''
  let profundidad = 0
  for (let i = inicio + nombre.length + 1; i < atributos.length; i++) {
    if (atributos[i] === '{') profundidad++
    else if (atributos[i] === '}' && --profundidad === 0) return atributos.slice(inicio + nombre.length + 2, i)
  }
  return ''
}

/** Cada `<Pressable …>…</Pressable>` con texto: sus estilos y los textos de adentro. */
function botonesConTexto(fuente: string): { estilos: string[]; textos: string[] }[] {
  const botones: { estilos: string[]; textos: string[] }[] = []
  let desde = 0
  for (;;) {
    const inicio = fuente.indexOf('<Pressable', desde)
    if (inicio < 0) break
    // El fin de la etiqueta de apertura: el primer `>` fuera de llaves (los
    // `=>` de onPress y style={({ pressed }) => …} quedan adentro).
    let profundidad = 0
    let fin = -1
    for (let i = inicio; i < fuente.length; i++) {
      const c = fuente[i]
      if (c === '{') profundidad++
      else if (c === '}') profundidad--
      else if (c === '>' && profundidad === 0) {
        fin = i
        break
      }
    }
    if (fin < 0) break
    const atributos = fuente.slice(inicio, fin)
    const cierre = atributos.endsWith('/') ? fin : fuente.indexOf('</Pressable>', fin)
    const cuerpo = cierre > fin ? fuente.slice(fin + 1, cierre) : ''
    desde = fin + 1
    const textos = [...cuerpo.matchAll(/<Text(?:o)?\b[^>]*>/g)].map((t) => t[0])
    if (textos.length === 0) continue
    botones.push({ estilos: [...atributoBalanceado(atributos, 'style').matchAll(/estilos(?:Fila)?\.(\w+)/g)].map((e) => e[1]!), textos })
  }
  return botones
}

const CON_BOTONES = [
  ['app', '(tabs)', 'index.tsx'],
  ['app', '(tabs)', 'buscar.tsx'],
  ['app', '(tabs)', 'favoritos.tsx'],
  ['app', '(tabs)', 'cuenta.tsx'],
  ['components', 'PantallaRadar.tsx'],
  ['components', 'SeccionNotificaciones.tsx'],
  ['components', 'AvisoActivarPush.tsx'],
  ['components', 'AvisosSinSesion.tsx'],
  ['components', 'PillsAtajos.tsx'],
  ['components', 'ChipsCategorias.tsx'],
  ['components', 'HojaFiltros.tsx'],
  ['components', 'FilaCategoria.tsx'],
  ['components', 'BannerRadar.tsx'],
  ['components', 'Encabezado.tsx'],
  ['components', 'BotonGoogle.tsx'],
  ['components', 'EnlacesLegales.tsx'],
  ['components', 'HojaCompartirTarjeta.tsx'],
  ['components', 'BloqueCine.tsx'],
]

describe('4. los botones con texto crecen o envuelven (letra al 200 %, textos en inglés)', () => {
  it.each(CON_BOTONES.map((a) => [a.join('/'), a] as const))('%s: sin ancho ni alto fijo y sin numberOfLines={1} que corte', (_n, partes) => {
    const fuente = codigo(...partes)
    const estilos = estilosDe(fuente)
    const botones = botonesConTexto(fuente)
    expect(botones.length).toBeGreaterThan(0)
    // El detector encuentra los estilos de los botones (si no, no mediría nada).
    expect(botones.some((b) => b.estilos.length > 0)).toBe(true)
    for (const b of botones) {
      for (const nombre of b.estilos) {
        const estilo = estilos.get(nombre) ?? ''
        // `minWidth`/`minHeight` sí (el área táctil); `width`/`height` fijos, no.
        expect(estilo, `${nombre}: ancho fijo`).not.toMatch(/(?<![\w])width:\s*\d/)
        expect(estilo, `${nombre}: alto fijo`).not.toMatch(/(?<![\w])height:\s*\d/)
      }
      for (const texto of b.textos) {
        if (/numberOfLines=\{1\}/.test(texto)) expect(texto, 'numberOfLines={1} sin adjustsFontSizeToFit').toMatch(/adjustsFontSizeToFit/)
      }
    }
  })

  it('los botones en fila (ícono + texto) dejan que el texto envuelva: WhatsApp de Mis eventos y las filas de Cuenta', () => {
    const favoritos = codigo('app', '(tabs)', 'favoritos.tsx')
    expect(favoritos).toMatch(/botonWhatsApp: \{[^}]*maxWidth: '100%'/)
    expect(favoritos).toMatch(/textoBotonWhatsApp: \{[^}]*flexShrink: 1/)
    const cuenta = codigo('app', '(tabs)', 'cuenta.tsx')
    expect(cuenta).toMatch(/izquierda: \{[^}]*flexShrink: 1/)
    expect(cuenta).toMatch(/<Texto peso="semibold" style=\{estilosFila\.texto\}>/)
    expect(cuenta).toMatch(/texto: \{ flexShrink: 1 \}/)
  })

  it('el detector de arriba marca de verdad un ancho fijo y un numberOfLines={1} pelado', () => {
    const roto = `<Pressable onPress={() => x()} style={estilos.boton}><Texto numberOfLines={1}>Hola</Texto></Pressable>\nconst estilos = StyleSheet.create({\n  boton: { width: 120, minHeight: 48 },\n})`
    const [b] = botonesConTexto(roto)
    expect(b!.estilos).toEqual(['boton'])
    expect(estilosDe(roto).get('boton')).toMatch(/(?<![\w])width:\s*\d/)
    expect(b!.textos[0]).toMatch(/numberOfLines=\{1\}/)
    expect(b!.textos[0]).not.toMatch(/adjustsFontSizeToFit/)
  })

  it('los textos en inglés de botones y pills no son mucho más largos que en castellano (entran sin cortarse)', () => {
    const pares: [string, string][] = [
      [es.portada.verTodosLosPrecios, en.portada.verTodosLosPrecios],
      [es.portada.verEstaSemana, en.portada.verEstaSemana],
      [es.buscar.cualquierFecha, en.buscar.cualquierFecha],
      [es.buscar.soloGratis, en.buscar.soloGratis],
      [es.tarjeta.verTodos, en.tarjeta.verTodos],
      [es.encabezado.ingresar, en.encabezado.ingresar],
      [es.notificaciones.activar, en.notificaciones.activar],
      [es.radar.guardar, en.radar.guardar],
    ]
    for (const atajo of ['hoy', 'esta-noche', 'finde', 'semana'] as const) pares.push([es.portada.atajos[atajo], en.portada.atajos[atajo]])
    for (const [a, b] of pares) expect(b.length, b).toBeLessThanOrEqual(Math.ceil(a.length * 1.3) + 2)
  })
})
