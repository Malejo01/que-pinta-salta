// Q6-1b · Lo que quedó en castellano después de Q6-1: Eliminar mi cuenta,
// Contraseña, la pantalla de error general (`ErrorBoundary`), los títulos
// del `<Stack>`, la ficha del evento y sus componentes (fila de acciones,
// calendario, seguir, aviso patrocinado) y los avisos de la baja rápida de
// patrocinados (`ManejadorTapPush`). El detector de texto suelto
// (`tests/i18n-detector.test.ts`, `PANTALLAS_MIGRADAS`) mira el JSX; acá:
//   1. los mensajes que llegan armados (lib/cuenta, lib/contrasena, core) tienen su inglés;
//   2. los textos en los dos idiomas (y que el castellano es el de siempre);
//   3. el cableado: el idioma llega a cada lugar (también fuera del provider);
//   4. la letra al 200 %: lo tocado envuelve en vez de cortarse.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { TEXTO_SACASTE_GUARDADO_CON_VOY, textoBotonVoy } from '@qps/core/asistencia'
import { textosContrasena, validarContrasenaNueva } from '@qps/core/auth/cuenta'
import { mensajeErrorContrasena } from '@qps/core/auth/mensajes'
import { CONTACTO_EMAIL } from '@qps/core/contacto'
import { textoSeguir, textoSeguirCuenta } from '@qps/core/radar/seguimiento'
import { vibeLabels } from '@qps/core/types'
import { quitarComentarios } from '@qps/core/tests/convencion-entorno'
import { ERRORES_EN, en } from '../lib/i18n/diccionarios/en'
import { es } from '../lib/i18n/diccionarios/es'
import { CLAVE_IDIOMA, idiomaGuardado } from '../lib/i18n/idioma'
import type { Almacen } from '../lib/sin-conexion/almacen'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const leer = (...partes: string[]) => readFileSync(join(RAIZ, ...partes), 'utf8')
const codigo = (...partes: string[]) => quitarComentarios(leer(...partes))

// ---------------------------------------------------------------------------
// 1. Los mensajes armados en castellano: cada uno tiene su inglés.
// ---------------------------------------------------------------------------
describe('1. errores.traducir: Eliminar mi cuenta, Contraseña y la ficha', () => {
  it('lib/cuenta.ts: los dos mensajes de error (la clave es el texto real, con el mail de contacto)', () => {
    const fuente = quitarComentarios(leer('lib', 'cuenta.ts'))
    const sinRed = fuente.match(/const MENSAJE_SIN_RED = '([^']+)'/)?.[1]
    const generico = fuente.match(/const MENSAJE_GENERICO = `([^`]+)`/)?.[1]?.replace('${CONTACTO_EMAIL}', CONTACTO_EMAIL)
    expect(sinRed).toBeTruthy()
    expect(generico).toContain(CONTACTO_EMAIL)
    for (const m of [sinRed!, generico!]) {
      expect(ERRORES_EN[m], m).toBeTruthy()
      expect(en.errores.traducir(m)).not.toBe(m)
      expect(es.errores.traducir(m)).toBe(m)
    }
    expect(en.errores.traducir(generico!)).toContain(CONTACTO_EMAIL)
  })

  it('lib/contrasena.ts: la validación, la falta de configuración y los errores de Supabase (core)', () => {
    const sinConfig = quitarComentarios(leer('lib', 'contrasena.ts')).match(/const MENSAJE_SIN_CONFIG = '([^']+)'/)?.[1]
    const corta = validarContrasenaNueva('', '')
    const distintas = validarContrasenaNueva('123456', '654321')
    const mensajes = [
      sinConfig!,
      corta.ok ? '' : corta.mensaje,
      distintas.ok ? '' : distintas.mensaje,
      mensajeErrorContrasena({ code: 'weak_password' }),
      mensajeErrorContrasena({ code: 'same_password' }),
      mensajeErrorContrasena({ code: 'reauthentication_needed' }),
      mensajeErrorContrasena({ status: 401 }),
      mensajeErrorContrasena({}),
    ]
    for (const m of mensajes) {
      expect(m).toBeTruthy()
      expect(en.errores.traducir(m), m).not.toBe(m)
    }
  })

  it('«Lo sacaste de tus guardados…» (core) se avisa traducido', () => {
    expect(en.errores.traducir(TEXTO_SACASTE_GUARDADO_CON_VOY)).not.toBe(TEXTO_SACASTE_GUARDADO_CON_VOY)
  })
})

// ---------------------------------------------------------------------------
// 2. Los textos, en los dos idiomas.
// ---------------------------------------------------------------------------
describe('2. los textos: el castellano es el de siempre y el inglés está', () => {
  it('Eliminar mi cuenta: la lista en inglés tiene los mismos ítems que la de castellano (la de la web)', () => {
    expect(es.eliminarCuenta.queSeBorra).toHaveLength(7)
    expect(en.eliminarCuenta.queSeBorra).toHaveLength(es.eliminarCuenta.queSeBorra.length)
    expect(es.eliminarCuenta.queSeBorra).toContain('Tus marcas de "Voy".')
    expect(en.eliminarCuenta.queSeBorra.join(' ')).toMatch(/Going/)
    expect(new Set(en.eliminarCuenta.queSeBorra).size).toBe(7)
  })

  it('Eliminar mi cuenta: la palabra a escribir es la que exige el servidor (ELIMINAR), también en inglés', () => {
    const esperada = quitarComentarios(leer('lib', 'cuenta.ts')).match(/const CONFIRMACION_ESPERADA = '([^']+)'/)?.[1]
    expect(esperada).toBe('ELIMINAR')
    expect(es.eliminarCuenta.palabra).toBe(esperada)
    expect(en.eliminarCuenta.palabra).toBe(esperada)
    expect(es.eliminarCuenta.confirmar).toContain(esperada!)
    expect(en.eliminarCuenta.confirmar).toContain(esperada!)
  })

  it('Contraseña: en castellano, los textos de core por tipo de cuenta; en inglés, los mismos modos traducidos', () => {
    for (const modo of ['google', 'email', 'mixta', 'desconocida'] as const) {
      expect(es.contrasena.modos[modo]).toEqual(textosContrasena(modo))
      expect(Object.keys(en.contrasena.modos[modo]).sort()).toEqual(['boton', 'descripcion', 'titulo'])
      expect(en.contrasena.modos[modo].descripcion).not.toBe(es.contrasena.modos[modo].descripcion)
    }
    // La fila de Cuenta y el título de la pantalla dicen lo mismo en inglés.
    expect(en.cuenta.filaContrasena(textosContrasena('email').titulo)).toBe(en.contrasena.modos.email.titulo)
    expect(en.cuenta.filaContrasena(textosContrasena('google').titulo)).toBe(en.contrasena.modos.google.titulo)
  })

  it('la fila de acciones: Guardar, Voy (con el mismo umbral de core) y las etiquetas', () => {
    expect([es.fila.guardar, es.fila.guardado]).toEqual(['♥ Guardar', '♥ Guardado'])
    expect([en.fila.guardar, en.fila.guardado]).toEqual(['♥ Save', '♥ Saved'])
    for (const n of [0, 2, 3, 40]) {
      expect(es.fila.voy(n)).toBe(`✓ ${textoBotonVoy(n)}`)
      expect(en.fila.voy(n).includes('·')).toBe(es.fila.voy(n).includes('·'))
    }
  })

  it('seguir: en castellano el texto de core; en inglés Follow/Following', () => {
    for (const s of [true, false]) {
      expect(es.seguir.lugar(s)).toBe(textoSeguir(s))
      expect(es.seguir.cuenta('usina', s)).toBe(textoSeguirCuenta('usina', s))
    }
    expect(en.seguir.lugar(false)).toBe('+ Follow')
    expect(en.seguir.cuenta('usina', true)).toBe('Following @usina')
    // WCAG 2.5.3: la etiqueta contiene la palabra visible.
    expect(en.seguir.seguirA('Usina')).toContain('Follow')
    expect(en.seguir.dejarDeSeguirA('Usina')).toContain('Unfollow')
  })

  it('la ficha: «Solo adultos» es el de core en castellano; el vacío y su salida, en los dos idiomas', () => {
    expect(es.ficha.soloAdultos).toBe(vibeLabels.adultos)
    expect(en.ficha.soloAdultos).toBe('Adults only (18+)')
    expect(es.ficha.yaNoEsta).toBe('Este evento ya no está disponible.')
    expect(es.ficha.volverAInicio).toBe('Volver a Inicio')
  })
})

// ---------------------------------------------------------------------------
// 3. El cableado.
// ---------------------------------------------------------------------------
describe('3. el idioma llega a cada pantalla y componente', () => {
  it('Eliminar mi cuenta: título, lista, contacto, campo, botón y error, del diccionario', () => {
    const s = codigo('app', 'eliminar-cuenta.tsx')
    expect(s).toContain('const textos = useTextos()')
    expect(s).toContain('<Stack.Screen options={{ title: t.titulo }} />')
    expect(s).toContain('label={t.confirmar}')
    expect(s).toContain('placeholder={t.palabra}')
    expect(s).toContain('accessibilityLabel={t.boton}')
    expect(s).toContain('{textos.errores.traducir(error)}')
  })

  it('Contraseña: los textos por tipo de cuenta del diccionario y el error traducido', () => {
    const s = codigo('app', 'contrasena.tsx')
    expect(s).toContain('const textos = tc.modos[tipoDeCuenta(session.user)]')
    expect(s).not.toContain('textosContrasena(')
    expect(s).toContain('{t.errores.traducir(error)}')
    expect(s.match(/label=\{tc\.(contrasenaNueva|repetila)\}/g)).toHaveLength(2)
  })

  it('la pantalla de error general: fuera del provider, con useTextosSinProvider (nunca useTextos)', () => {
    const s = codigo('app', '_layout.tsx')
    const boundary = s.slice(s.indexOf('export function ErrorBoundary'), s.indexOf('const estilosError'))
    expect(boundary).toContain('useTextosSinProvider()')
    expect(boundary).not.toContain('useTextos()')
    expect(boundary).toContain('{te.titulo}')
    expect(boundary).toContain('{te.reintentar}')
    expect(es.errorGeneral.titulo).toBe('Algo salió mal.')
    expect(en.errorGeneral.titulo).toBe('Something went wrong.')
  })

  it('useTextosSinProvider: arranca con el idioma del teléfono, después el guardado, y no tira si falla la lectura', () => {
    const s = codigo('lib', 'i18n', 'index.tsx')
    const hook = s.slice(s.indexOf('export function useTextosSinProvider'))
    expect(hook).toContain("useState<Idioma>(() => idiomaEfectivo('auto'))")
    expect(hook).toMatch(/idiomaGuardado\(almacen\)\.then\(/)
    // El segundo argumento del `then`: un rechazo no rompe la pantalla de error.
    expect(hook).toMatch(/\(\) => \{\},\s*\)/)
    expect(hook).toContain('if (vigente) setIdioma(guardado)')
  })

  it('idiomaGuardado (lo que lee useTextosSinProvider): el guardado; si falla la lectura, el del teléfono; sin teléfono legible, castellano', async () => {
    const guardado: Almacen = {
      leer: async (k) => (k === CLAVE_IDIOMA ? 'en' : null),
      escribir: async () => {},
      borrar: async () => {},
      claves: async () => [],
      borrarVarias: async () => {},
    }
    const roto: Almacen = { ...guardado, leer: async () => { throw new Error('sin almacén') } }
    expect(await idiomaGuardado(guardado, 'es-AR')).toBe('en')
    expect(await idiomaGuardado(roto, 'es-AR')).toBe('es')
    expect(await idiomaGuardado(roto, 'en-GB')).toBe('en')
  })

  it('los títulos del Stack salen del diccionario, adentro del IdiomaProvider', () => {
    const s = codigo('app', '_layout.tsx')
    const rutas = s.slice(s.indexOf('function Rutas()'), s.indexOf('function RootLayout()'))
    expect(rutas).toContain('const t = useTextos()')
    expect(rutas).toContain('options={{ title: t.ficha.titulo }}')
    expect(rutas).toContain('options={{ title: t.cines.titulo }}')
    expect(rutas).toContain('options={{ title: t.lugaresChicos.titulo }}')
    expect(rutas).toContain('options={{ title: t.lugaresChicos.tituloFicha }}')
    const layout = s.slice(s.indexOf('function RootLayout()'))
    expect(layout.indexOf('<Rutas />')).toBeGreaterThan(layout.indexOf('<IdiomaProvider>'))
    expect(layout.indexOf('<Rutas />')).toBeLessThan(layout.indexOf('</IdiomaProvider>'))
    expect([es.ficha.titulo, es.cines.titulo, es.lugaresChicos.titulo, es.lugaresChicos.tituloFicha]).toEqual([
      'Evento',
      'Cines',
      'Lugares para chicos',
      'Lugar para chicos',
    ])
  })

  it('la ficha: el vacío, el error y «Solo adultos» del diccionario', () => {
    const s = codigo('app', 'evento', '[id].tsx')
    expect(s).toContain('<Vacio mensaje={tf.yaNoEsta} textoAccion={tf.volverAInicio}')
    expect(s).toContain('<ErrorCarga mensaje={t.errores.traducir(estado.error)}')
    expect(s).toContain('{tf.soloAdultos}')
    expect(s).not.toContain('vibeLabels')
  })

  it('fila de acciones, calendario y seguir: las funciones de texto reciben el idioma de la app', () => {
    const fila = codigo('components', 'FilaAccionesEvento.tsx')
    expect(fila).toContain('botonesDeLaFila(estado, mostrarVoy, idioma)')
    expect(fila).toContain('etiquetaAccesible(boton.accion as ')
    expect(fila).toMatch(/boton\.seleccionado, idioma\)/)
    expect(fila).toContain('{t.errores.traducir(estado.error)}')
    expect(fila).toContain('{t.errores.traducir(avisoEnLinea)}')
    expect(fila).toContain('avisar(t.errores.traducir(TEXTO_SACASTE_GUARDADO_CON_VOY))')
    expect(codigo('components', 'BotonCalendario.tsx')).toContain('mensajePara(resultado, idioma)')
    expect(codigo('components', 'BotonSeguir.tsx')).toContain('textoDeBotonSeguir(tipo, etiqueta, siguiendo, idioma)')
    expect(codigo('components', 'AvisoPatrocinado.tsx')).toContain('{textos.errores.traducir(estado.mensaje)}')
  })

  it('ManejadorTapPush: sin textos sueltos; los avisos leen el idioma de una ref al momento de avisar', () => {
    const s = codigo('components', 'ManejadorTapPush.tsx')
    expect(s).not.toMatch(/avisar\(\s*'/)
    expect(s).not.toContain('Listo: no te vamos')
    expect(s).toContain('const textos = () => textosDe(idiomaRef.current)')
    expect(s).toMatch(/idiomaRef\.current = idioma\s*\}, \[idioma\]\)/)
    expect(s).toContain('avisar(textos().errores.traducir(resultadoCambio.mensaje))')
    // Todas las llamadas a resolverBajaPendiente pasan la ref del idioma.
    const llamadas = [...s.matchAll(/resolverBajaPendiente\(([^)]*)\)/g)].map((m) => m[1]!)
    expect(llamadas.length).toBeGreaterThanOrEqual(3)
    for (const args of llamadas) expect(args).toMatch(/idiomaRef/)
  })
})

// ---------------------------------------------------------------------------
// 4. Letra al 200 %: lo tocado envuelve (los anchos/altos fijos los mira la
// sección 4 de tests/i18n-pantallas.test.ts, que suma estos archivos).
// ---------------------------------------------------------------------------
describe('4. letra al 200 %: los botones tocados envuelven en vez de cortarse', () => {
  it('fila de acciones, seguir y calendario: el texto encoge/envuelve y el botón no se pasa del ancho', () => {
    const fila = codigo('components', 'FilaAccionesEvento.tsx')
    expect(fila).toMatch(/boton: \{[^}]*maxWidth: '100%'/)
    expect(fila).toMatch(/textoBoton: \{[^}]*flexShrink: 1/)
    const seguir = codigo('components', 'BotonSeguir.tsx')
    expect(seguir).toMatch(/boton: \{[^}]*maxWidth: '100%'/)
    expect(seguir).toMatch(/texto: \{[^}]*flexShrink: 1/)
    const calendario = codigo('components', 'BotonCalendario.tsx')
    expect(calendario).toContain('style={estilos.textoCta}')
    expect(calendario).toMatch(/textoCta: \{ flexShrink: 1, textAlign: 'center' \}/)
  })

  it('la pantalla de error: el botón tiene piso de 48 dp y no se pasa del ancho', () => {
    const s = codigo('app', '_layout.tsx')
    expect(s).toMatch(/boton: \{[^}]*minHeight: 48[^}]*maxWidth: '100%'/)
    expect(s).not.toMatch(/numberOfLines=\{1\}/)
  })

  it('ninguno de los archivos tocados corta texto con numberOfLines={1} (salvo el badge de categoría de la ficha, con tope de escala)', () => {
    for (const partes of [
      ['app', 'eliminar-cuenta.tsx'],
      ['app', 'contrasena.tsx'],
      ['components', 'FilaAccionesEvento.tsx'],
      ['components', 'BotonCalendario.tsx'],
      ['components', 'BotonSeguir.tsx'],
      ['components', 'AvisoPatrocinado.tsx'],
    ]) {
      expect(codigo(...partes), partes.join('/')).not.toMatch(/numberOfLines=\{1\}/)
    }
    // El badge de la categoría (dato de la base, en castellano) es el único con una línea, y con tope de escala.
    const ficha = codigo('app', 'evento', '[id].tsx')
    expect(ficha.match(/numberOfLines=\{1\}/g)).toHaveLength(1)
    expect(ficha).toMatch(/numberOfLines=\{1\} maxFontSizeMultiplier=\{ESCALA_MAXIMA_COMPACTA\}/)
  })

  it('los textos en inglés de los botones no son mucho más largos que en castellano', () => {
    const pares: [string, string][] = [
      [es.fila.guardar, en.fila.guardar],
      [es.fila.voy(40), en.fila.voy(40)],
      [es.calendario.agregar, en.calendario.agregar],
      [es.calendario.abrirAjustes, en.calendario.abrirAjustes],
      [es.seguir.lugar(true), en.seguir.lugar(true)],
      [es.patrocinado.boton, en.patrocinado.boton],
      [es.eliminarCuenta.boton, en.eliminarCuenta.boton],
      [es.contrasena.volver, en.contrasena.volver],
      [es.errorGeneral.reintentar, en.errorGeneral.reintentar],
    ]
    for (const [a, b] of pares) expect(b.length, b).toBeLessThanOrEqual(Math.ceil(a.length * 1.3) + 2)
  })
})
