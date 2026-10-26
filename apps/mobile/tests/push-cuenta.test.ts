// Ronda 41, tarea 41-e: AvisoActivarPush (botón según el estado de push,
// variante 'favoritos'), y dos detectores de solo lectura sobre el texto
// real de app/(tabs)/cuenta.tsx (orden dentro de `salir()`) y sobre los
// textos nuevos de esta tarea (QPS-113 sin confirmar: nada de cifras de
// topes ni horarios).
//
// `botonParaEstado`/`seMuestraAvisoFavoritos` viven en el componente
// (AvisoActivarPush.tsx), que importa `react-native` (Pressable, StyleSheet,
// View) y `@/lib/push` (que a su vez importa `Linking` de `react-native` y
// `@/lib/session`): el paquete real de `react-native` no se puede parsear en
// este entorno de Vitest (mismo motivo documentado en
// tests/favoritos-armar.test.ts). Mismo patrón que tests/push-registro.test.ts
// (41-c): se mockean `react-native`, `@/components/Texto`, `@/lib/colores` y
// `@/lib/push` con dobles mínimos (no se llaman, solo hacen que el módulo
// resuelva), y se importan las dos funciones puras reales — nunca una copia
// de su lógica.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  Pressable: () => null,
  View: () => null,
  StyleSheet: { create: (estilos: unknown) => estilos },
}))
vi.mock('@/components/Texto', () => ({ Texto: () => null }))
vi.mock('@/lib/colores', () => ({ useColoresQPS: () => ({}) }))
vi.mock('@/lib/push', () => ({
  usePush: () => ({ estado: 'sin-pedir', activar: async () => {}, reintentar: async () => {}, abrirAjustes: () => {} }),
}))

// Las funciones puras reales (nunca una copia de su lógica). Los tipos son
// `import type`: se borran al compilar, así que no disparan una carga en
// runtime del módulo real (que sí necesita los dobles de arriba).
import { botonParaEstado, seMuestraAvisoFavoritos, type AccionBotonPush, type BotonPush } from '../components/AvisoActivarPush'
import { TEXTOS_PUSH, type EstadoPush } from '../lib/push/estado'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const RUTA_CUENTA = `${MOBILE_ROOT}/app/(tabs)/cuenta.tsx`
const SRC_CUENTA = readFileSync(RUTA_CUENTA, 'utf8')
const SRC_AVISO = readFileSync(`${MOBILE_ROOT}/components/AvisoActivarPush.tsx`, 'utf8')
const SRC_SECCION_NOTIFICACIONES = readFileSync(`${MOBILE_ROOT}/components/SeccionNotificaciones.tsx`, 'utf8')
const SRC_FAVORITOS = readFileSync(`${MOBILE_ROOT}/app/(tabs)/favoritos.tsx`, 'utf8')

const TODOS_LOS_ESTADOS: EstadoPush[] = [
  'sin-sesion',
  'sin-pedir',
  'pidiendo',
  'denegado',
  'bloqueado',
  'no-disponible',
  'error-registro',
  'activo',
]

// ---------------------------------------------------------------------------
// botonParaEstado: función pura, exhaustiva (8 estados).
// ---------------------------------------------------------------------------
describe('botonParaEstado: cubre los 8 estados de EstadoPush', () => {
  it('nunca devuelve undefined: siempre un BotonPush o null, para cada uno de los 8 estados', () => {
    for (const estado of TODOS_LOS_ESTADOS) {
      const resultado = botonParaEstado(estado)
      expect(resultado === null || typeof resultado === 'object').toBe(true)
    }
    expect(TODOS_LOS_ESTADOS).toHaveLength(8)
  })

  it('sin-pedir: "Activar notificaciones", accion activar', () => {
    expect(botonParaEstado('sin-pedir')).toEqual({ etiqueta: 'Activar notificaciones', accion: 'activar' })
  })

  it('denegado: "Activar notificaciones", accion activar (mismo botón que sin-pedir)', () => {
    expect(botonParaEstado('denegado')).toEqual({ etiqueta: 'Activar notificaciones', accion: 'activar' })
  })

  it('bloqueado: "Abrir ajustes", accion abrirAjustes', () => {
    expect(botonParaEstado('bloqueado')).toEqual({ etiqueta: 'Abrir ajustes', accion: 'abrirAjustes' })
  })

  it('error-registro: "Reintentar", accion reintentar', () => {
    expect(botonParaEstado('error-registro')).toEqual({ etiqueta: 'Reintentar', accion: 'reintentar' })
  })

  it('pidiendo: el mismo botón, deshabilitado (accion null), con TEXTOS_PUSH.pidiendo', () => {
    const resultado = botonParaEstado('pidiendo')
    expect(resultado).not.toBeNull()
    expect((resultado as BotonPush).accion).toBeNull()
    expect((resultado as BotonPush).etiqueta).toBe(TEXTOS_PUSH.pidiendo)
  })

  it('no-disponible: sin botón (null)', () => {
    expect(botonParaEstado('no-disponible')).toBeNull()
  })

  it('activo: sin botón (null) — una sola línea de texto, no un botón', () => {
    expect(botonParaEstado('activo')).toBeNull()
  })

  it('sin-sesion: sin botón (null)', () => {
    expect(botonParaEstado('sin-sesion')).toBeNull()
  })

  it('las acciones devueltas son siempre una de las tres válidas (activar/reintentar/abrirAjustes) o null', () => {
    const ACCIONES_VALIDAS: readonly (AccionBotonPush | null)[] = ['activar', 'reintentar', 'abrirAjustes', null]
    for (const estado of TODOS_LOS_ESTADOS) {
      const resultado = botonParaEstado(estado)
      if (resultado) expect(ACCIONES_VALIDAS).toContain(resultado.accion)
    }
  })
})

// ---------------------------------------------------------------------------
// seMuestraAvisoFavoritos: solo sin-pedir y denegado.
// ---------------------------------------------------------------------------
describe('seMuestraAvisoFavoritos: la variante favoritos solo se muestra con sin-pedir o denegado', () => {
  it('sin-pedir: true', () => {
    expect(seMuestraAvisoFavoritos('sin-pedir')).toBe(true)
  })

  it('denegado: true', () => {
    expect(seMuestraAvisoFavoritos('denegado')).toBe(true)
  })

  it.each<EstadoPush>(['activo', 'no-disponible', 'bloqueado', 'sin-sesion', 'pidiendo', 'error-registro'])(
    '%s: false (no se renderiza)',
    (estado) => {
      expect(seMuestraAvisoFavoritos(estado)).toBe(false)
    },
  )

  it('cubre los 8 estados sin excepción (ningún estado queda indefinido)', () => {
    for (const estado of TODOS_LOS_ESTADOS) {
      expect(typeof seMuestraAvisoFavoritos(estado)).toBe('boolean')
    }
  })
})

// ---------------------------------------------------------------------------
// AvisoActivarPush.tsx: detectores de solo lectura sobre el componente real
// (sin montar nada de React Native).
// ---------------------------------------------------------------------------
describe('AvisoActivarPush.tsx: estructura real del componente', () => {
  it('con estado sin-sesion, retorna null antes que cualquier otra cosa', () => {
    const idxSinSesion = SRC_AVISO.indexOf("estado === 'sin-sesion'")
    const idxReturnNull = SRC_AVISO.indexOf('return null', idxSinSesion)
    expect(idxSinSesion).toBeGreaterThan(-1)
    expect(idxReturnNull).toBeGreaterThan(idxSinSesion)
    expect(idxReturnNull - idxSinSesion).toBeLessThan(40)
  })

  it('la variante favoritos usa seMuestraAvisoFavoritos para decidir si se renderiza', () => {
    expect(SRC_AVISO).toMatch(/variante === 'favoritos'[\s\S]{0,40}!seMuestraAvisoFavoritos\(estado\)/)
  })

  it('usa usePush() de @/lib/push (no reimplementa el estado)', () => {
    expect(SRC_AVISO).toMatch(/import\s*\{\s*usePush\s*\}\s*from\s*['"]@\/lib\/push['"]/)
    expect(SRC_AVISO).toMatch(/usePush\(\)/)
  })

  it('usa Texto y useColoresQPS (la base visual), no react-native Text/colores a mano', () => {
    expect(SRC_AVISO).toMatch(/import\s*\{\s*Texto\s*\}\s*from\s*['"]@\/components\/Texto['"]/)
    expect(SRC_AVISO).toMatch(/import\s*\{\s*useColoresQPS\s*\}\s*from\s*['"]@\/lib\/colores['"]/)
  })
})

describe('components/SeccionNotificaciones.tsx: monta AvisoActivarPush variante cuenta, arriba de los interruptores', () => {
  it('importa AvisoActivarPush', () => {
    expect(SRC_SECCION_NOTIFICACIONES).toMatch(
      /import\s*\{\s*AvisoActivarPush\s*\}\s*from\s*['"]@\/components\/AvisoActivarPush['"]/,
    )
  })

  it('<AvisoActivarPush variante="cuenta" /> aparece antes de "Recordatorios de favoritos"', () => {
    const idxAviso = SRC_SECCION_NOTIFICACIONES.indexOf('<AvisoActivarPush variante="cuenta"')
    const idxFavoritos = SRC_SECCION_NOTIFICACIONES.indexOf('Recordatorios de favoritos')
    expect(idxAviso).toBeGreaterThan(-1)
    expect(idxFavoritos).toBeGreaterThan(idxAviso)
  })

  // R70 (70-a): "Avisos de Qué Pinta Salta" deja de ser "Pronto" y de estar
  // deshabilitado fijo: se prende y apaga y guarda solo `announcements`.
  it('"Avisos de Qué Pinta Salta" sigue visible, sin "Pronto", con su descripción y accessibilityLabel', () => {
    const idxFila = SRC_SECCION_NOTIFICACIONES.indexOf('<Texto>Avisos de Qué Pinta Salta</Texto>')
    const idxSwitch = SRC_SECCION_NOTIFICACIONES.indexOf('<Switch', idxFila)
    expect(idxFila).toBeGreaterThan(-1)
    expect(idxSwitch).toBeGreaterThan(idxFila)

    const tramoEtiqueta = SRC_SECCION_NOTIFICACIONES.slice(idxFila, idxSwitch)
    expect(tramoEtiqueta).not.toContain('Pronto')
    expect(tramoEtiqueta).toContain('Novedades y avisos del equipo de Qué Pinta Salta.')

    const finEtiquetaSwitch = SRC_SECCION_NOTIFICACIONES.indexOf('/>', idxSwitch)
    const tramoSwitch = SRC_SECCION_NOTIFICACIONES.slice(idxSwitch, finEtiquetaSwitch + 2)
    // R46: todo <Switch> lleva accessibilityLabel (tests/accesibilidad-detector.test.ts).
    expect(tramoSwitch).toContain('accessibilityLabel="Avisos de Qué Pinta Salta"')
    expect(tramoSwitch).toMatch(/accessibilityState=\{\{\s*checked:\s*announcements\s*,\s*busy:\s*guardandoAvisos\s*\}\}/)
  })

  it('el interruptor de announcements se puede tocar: onValueChange guarda solo esa columna (cambiarAvisosEquipo)', () => {
    const idxFila = SRC_SECCION_NOTIFICACIONES.indexOf('<Texto>Avisos de Qué Pinta Salta</Texto>')
    const idxSwitch = SRC_SECCION_NOTIFICACIONES.indexOf('<Switch', idxFila)
    const finEtiquetaSwitch = SRC_SECCION_NOTIFICACIONES.indexOf('/>', idxSwitch)
    const tramoSwitch = SRC_SECCION_NOTIFICACIONES.slice(idxSwitch, finEtiquetaSwitch + 2)
    expect(tramoSwitch).toContain('onValueChange={cambiarAnnouncements}')
    expect(tramoSwitch).not.toMatch(/\bdisabled\s*(\/|\n|$)/)
    expect(SRC_SECCION_NOTIFICACIONES).toContain('await cambiarAvisosEquipo(userId, nuevo)')
  })

  it('guardar() sigue mandando announcements tal como está en el estado (nunca un false fijo)', () => {
    const idxGuardar = SRC_SECCION_NOTIFICACIONES.indexOf('async function guardar()')
    const idxFinGuardar = SRC_SECCION_NOTIFICACIONES.indexOf('\n  }', idxGuardar)
    const cuerpoGuardar = SRC_SECCION_NOTIFICACIONES.slice(idxGuardar, idxFinGuardar)
    expect(cuerpoGuardar).toMatch(/\bannouncements,/)
    expect(cuerpoGuardar).not.toMatch(/announcements:\s*false/)
  })

  it('si el canal del Radar es push o ambos, muestra la línea sobre el email', () => {
    expect(SRC_SECCION_NOTIFICACIONES).toContain("radarChannel === 'push' || radarChannel === 'ambos'")
    expect(SRC_SECCION_NOTIFICACIONES).toContain('Por ahora el Radar te sigue llegando por email.')
  })

  // Ronda 51, tarea 51-d: "Avisos patrocinados" va DESPUÉS de "Novedades de
  // lo que seguís" y ANTES de "Avisos de Qué Pinta Salta" (que sigue
  // disabled con "Pronto", QPS-166, sin tocar).
  it('"Avisos patrocinados" aparece después de "Novedades de lo que seguís" y antes de "Avisos de Qué Pinta Salta"', () => {
    const idxFavoritos = SRC_SECCION_NOTIFICACIONES.indexOf('Recordatorios de favoritos')
    const idxNovedades = SRC_SECCION_NOTIFICACIONES.indexOf('Novedades de lo que seguís')
    // Ancla por la etiqueta JSX exacta (no el texto plano): "Avisos
    // patrocinados" también aparece antes, en comentarios de cabecera.
    const idxPatrocinados = SRC_SECCION_NOTIFICACIONES.indexOf('<Texto>Avisos patrocinados</Texto>')
    const idxAnnouncements = SRC_SECCION_NOTIFICACIONES.indexOf('Avisos de Qué Pinta Salta')

    expect(idxFavoritos).toBeGreaterThan(-1)
    expect(idxNovedades).toBeGreaterThan(idxFavoritos)
    expect(idxPatrocinados).toBeGreaterThan(idxNovedades)
    expect(idxAnnouncements).toBeGreaterThan(idxPatrocinados)
  })

  it('el interruptor de "Avisos patrocinados" tiene su descripción y accessibilityState con checked/busy', () => {
    const idxFila = SRC_SECCION_NOTIFICACIONES.indexOf('<Texto>Avisos patrocinados</Texto>')
    const idxSwitch = SRC_SECCION_NOTIFICACIONES.indexOf('<Switch', idxFila)
    const finSwitch = SRC_SECCION_NOTIFICACIONES.indexOf('/>', idxSwitch)
    expect(idxFila).toBeGreaterThan(-1)
    expect(idxSwitch).toBeGreaterThan(idxFila)

    const tramoEtiqueta = SRC_SECCION_NOTIFICACIONES.slice(idxFila, idxSwitch)
    expect(tramoEtiqueta).toContain('Hasta 1 por semana, de eventos de Salta.')
    expect(tramoEtiqueta).toContain('Patrocinado')

    const tramoSwitch = SRC_SECCION_NOTIFICACIONES.slice(idxSwitch, finSwitch + 2)
    expect(tramoSwitch).toContain('accessibilityLabel="Avisos patrocinados"')
    expect(tramoSwitch).toMatch(/accessibilityState=\{\{\s*checked:\s*sponsored\s*,\s*busy:\s*guardandoPatrocinados\s*\}\}/)
  })

  it('ya no queda ningún "Pronto" en la fila de "Avisos de Qué Pinta Salta" (R70)', () => {
    expect(SRC_SECCION_NOTIFICACIONES).not.toContain('etiquetaPronto')
    expect(SRC_SECCION_NOTIFICACIONES).not.toContain('>Pronto<')
  })
})

describe('app/(tabs)/favoritos.tsx: monta AvisoActivarPush variante favoritos, arriba de la lista', () => {
  it('importa AvisoActivarPush', () => {
    expect(SRC_FAVORITOS).toMatch(
      /import\s*\{\s*AvisoActivarPush\s*\}\s*from\s*['"]@\/components\/AvisoActivarPush['"]/,
    )
  })

  it('<AvisoActivarPush variante="favoritos" /> aparece antes del SectionList (arriba de la lista)', () => {
    const idxAviso = SRC_FAVORITOS.indexOf('<AvisoActivarPush variante="favoritos"')
    const idxLista = SRC_FAVORITOS.indexOf('<SectionList')
    expect(idxAviso).toBeGreaterThan(-1)
    expect(idxLista).toBeGreaterThan(idxAviso)
  })

  it('aparece solo en la rama con sesión (después de "if (!userId)"), nunca antes', () => {
    const idxSinSesion = SRC_FAVORITOS.indexOf('if (!userId) {')
    const idxAviso = SRC_FAVORITOS.indexOf('<AvisoActivarPush variante="favoritos"')
    expect(idxSinSesion).toBeGreaterThan(-1)
    expect(idxAviso).toBeGreaterThan(idxSinSesion)
  })

  it('no agrega ninguna llamada nueva a cargar() (sigue habiendo exactamente una, dentro de useFocusEffect)', () => {
    const llamadasACargar = SRC_FAVORITOS.match(/\bcargar\s*\(\s*\)/g) ?? []
    expect(llamadasACargar.length).toBe(1)
  })

  it('no toca useFocusEffect: sigue envolviendo un useCallback', () => {
    expect(SRC_FAVORITOS).toMatch(/useFocusEffect\s*\(\s*useCallback\s*\(/)
  })
})

// ---------------------------------------------------------------------------
// cuenta.tsx: borrarTokenDeEsteTelefono se llama antes de auth.signOut,
// dentro de salir().
// ---------------------------------------------------------------------------
describe('app/(tabs)/cuenta.tsx: salir() borra el token antes de cerrar la sesión', () => {
  it('importa borrarTokenDeEsteTelefono de @/lib/push/registro', () => {
    expect(SRC_CUENTA).toMatch(
      /import\s*\{\s*borrarTokenDeEsteTelefono\s*\}\s*from\s*['"]@\/lib\/push\/registro['"]/,
    )
  })

  it('dentro de salir(), borrarTokenDeEsteTelefono se llama antes que supabase.auth.signOut()', () => {
    const idxSalir = SRC_CUENTA.indexOf('async function salir()')
    const idxFinSalir = SRC_CUENTA.indexOf('\n  }', SRC_CUENTA.indexOf('setAccionEnCurso(null)', idxSalir))
    const cuerpoSalir = SRC_CUENTA.slice(idxSalir, idxFinSalir)

    const idxBorrar = cuerpoSalir.indexOf('borrarTokenDeEsteTelefono()')
    const idxSignOut = cuerpoSalir.indexOf('supabase.auth.signOut()')

    expect(idxBorrar).toBeGreaterThan(-1)
    expect(idxSignOut).toBeGreaterThan(-1)
    expect(idxBorrar).toBeLessThan(idxSignOut)
  })

  it('borrarTokenDeEsteTelefono() está dentro del mismo try que signOut (no en su propio try/catch aparte)', () => {
    const idxSalir = SRC_CUENTA.indexOf('async function salir()')
    const idxTry = SRC_CUENTA.indexOf('try {', idxSalir)
    const idxCatch = SRC_CUENTA.indexOf('} catch (excepcion) {', idxTry)
    const bloqueTry = SRC_CUENTA.slice(idxTry, idxCatch)

    expect(bloqueTry).toContain('borrarTokenDeEsteTelefono()')
    expect(bloqueTry).toContain('supabase.auth.signOut()')
    // Ni un segundo "try {" (su propio try/catch) entre el borrado y el
    // signOut: un catch de más ocultaría si algún día empieza a tirar
    // (borrarTokenDeEsteTelefono no tira, documentado en registro.ts).
    const idxBorrar = bloqueTry.indexOf('borrarTokenDeEsteTelefono()')
    const idxSignOut = bloqueTry.indexOf('supabase.auth.signOut()')
    const entreLosDos = bloqueTry.slice(idxBorrar, idxSignOut)
    expect(entreLosDos).not.toContain('try {')
    expect(entreLosDos).not.toContain('catch')
  })

  it('fixture de rotura: un try/catch propio alrededor del borrado SÍ se detectaría', () => {
    const fixtureRoto = [
      'async function salir() {',
      '  try {',
      '    try {',
      '      await borrarTokenDeEsteTelefono()',
      '    } catch {',
      '      // no debería estar',
      '    }',
      '    await supabase.auth.signOut()',
      '  } catch (excepcion) {',
      '    setError(mensajeDeError(excepcion))',
      '  } finally {',
      '    setAccionEnCurso(null)',
      '  }',
      '}',
    ].join('\n')
    const idxTry = fixtureRoto.indexOf('try {')
    const idxCatchExterno = fixtureRoto.indexOf('} catch (excepcion) {')
    const bloqueTry = fixtureRoto.slice(idxTry, idxCatchExterno)
    const idxBorrar = bloqueTry.indexOf('borrarTokenDeEsteTelefono()')
    const idxSignOut = bloqueTry.indexOf('supabase.auth.signOut()')
    const entreLosDos = bloqueTry.slice(idxBorrar, idxSignOut)
    expect(entreLosDos).toContain('catch')
  })
})

// ---------------------------------------------------------------------------
// QPS-113 sin confirmar: ningún texto nuevo de esta tarea promete cifras de
// topes ni horarios ("hasta 4 por día", "de 23 a 9", etc.).
// ---------------------------------------------------------------------------
describe('QPS-113 sin confirmar: los textos nuevos de 41-e no prometen cifras ni horarios', () => {
  // Los textos nuevos de esta tarea (no los de TEXTOS_PUSH, que ya puso
  // 41-c, ni el placeholder "23:00"/"09:00" del horario de silencio, que ya
  // existía desde la R27 y no es un texto nuevo de 41-e).
  const TEXTOS_NUEVOS = [
    'Te avisamos antes de tus favoritos y cuando haya algo nuevo de lo que seguís en tu Radar. Podés elegir qué te llega y el horario de silencio.',
    '¿Querés que te avisemos antes de tus favoritos?',
    'Activar notificaciones',
    'Abrir ajustes',
    'Reintentar',
    'Pronto',
    'Por ahora el Radar te sigue llegando por email.',
    // R70 (70-a): la invitación a activar los avisos.
    'Activá los avisos para enterarte de lo que pinta',
    'Te avisamos antes de lo que guardaste y te mandamos novedades de Qué Pinta Salta. Lo cambiás cuando quieras en Cuenta.',
    'Entrá a tu cuenta para activar los avisos',
    'Novedades y avisos del equipo de Qué Pinta Salta.',
  ]

  // Un tope ("hasta 4 por día", "4 notificaciones diarias") o un horario
  // ("de 23 a 9", "de 23:00 a 09:00", "de 23 a las 9").
  const PATRON_CIFRA_O_HORARIO =
    /\d+\s*(por\s*d[ií]a|al\s*d[ií]a|notificaci)|\bde\s*\d{1,2}(:\d{2})?\s*a\s*(las\s*)?\d{1,2}(:\d{2})?\b/i

  it.each(TEXTOS_NUEVOS)('"%s" no tiene cifras de topes ni horarios', (texto) => {
    expect(PATRON_CIFRA_O_HORARIO.test(texto)).toBe(false)
  })

  it('fixture de rotura: "hasta 4 por día" sí se detecta', () => {
    expect(PATRON_CIFRA_O_HORARIO.test('Te avisamos hasta 4 por día')).toBe(true)
  })

  it('fixture de rotura: "de 23 a 9" sí se detecta', () => {
    expect(PATRON_CIFRA_O_HORARIO.test('en el horario de 23 a 9')).toBe(true)
  })

  it('ninguno de los textos nuevos contiene directamente un dígito', () => {
    for (const texto of TEXTOS_NUEVOS) {
      expect(/\d/.test(texto)).toBe(false)
    }
  })
})
