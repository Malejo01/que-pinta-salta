// 29-c (ops/paridad-web-app.md §3.9, inventario-web-mobile.md "Auth"):
// lectura estática de `app/(tabs)/cuenta.tsx` y `components/BotonGoogle.tsx`.
// Mismo patrón que `tests/iconos.test.ts` y `tests/campo-texto.test.ts`: sin
// montar nada de React Native.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const RUTA_CUENTA = fileURLToPath(new URL('../app/(tabs)/cuenta.tsx', import.meta.url))
const RUTA_BOTON_GOOGLE = fileURLToPath(new URL('../components/BotonGoogle.tsx', import.meta.url))
const SRC_CUENTA = readFileSync(RUTA_CUENTA, 'utf8')
const SRC_BOTON_GOOGLE = readFileSync(RUTA_BOTON_GOOGLE, 'utf8')

// Los dos archivos documentan en sus comentarios de cabecera por qué ya NO
// usan SeccionRadar/PantallaRadar (cuenta.tsx) ni GoogleSigninButton
// (BotonGoogle.tsx) — así que un chequeo de "no contiene la palabra X" sobre
// el texto crudo daría un falso positivo. Mismo patrón de limpieza que
// `tests/base-visual.test.ts` y `tests/estado-carga-detector.test.ts`.
function quitarComentarios(content: string): string {
  const lineasDeTexto = content.split('\n')
  const resultado: string[] = []
  let dentroDeBloqueComentario = false

  for (let linea of lineasDeTexto) {
    if (dentroDeBloqueComentario) {
      const finBloque = linea.indexOf('*/')
      if (finBloque === -1) {
        resultado.push('')
        continue
      }
      linea = linea.slice(finBloque + 2)
      dentroDeBloqueComentario = false
    }

    const inicioBloque = linea.indexOf('/*')
    if (inicioBloque !== -1 && linea.indexOf('*/', inicioBloque + 2) === -1) {
      linea = linea.slice(0, inicioBloque)
      dentroDeBloqueComentario = true
    }

    const idxComentarioDeLinea = linea.search(/(^|\s)\/\//)
    resultado.push(idxComentarioDeLinea === -1 ? linea : linea.slice(0, idxComentarioDeLinea))
  }

  return resultado.join('\n')
}

const CODIGO_CUENTA = quitarComentarios(SRC_CUENTA)
const CODIGO_BOTON_GOOGLE = quitarComentarios(SRC_BOTON_GOOGLE)

describe('cuenta.tsx: se va SeccionRadar de Cuenta (el Radar ahora es su propia pestaña)', () => {
  it('no importa SeccionRadar (fuera de los comentarios que explican el cambio)', () => {
    expect(CODIGO_CUENTA).not.toMatch(/SeccionRadar/)
  })

  it('no importa PantallaRadar', () => {
    expect(SRC_CUENTA).not.toMatch(/PantallaRadar/)
  })

  it('sí sigue importando SeccionNotificaciones', () => {
    expect(SRC_CUENTA).toMatch(/import\s*\{\s*SeccionNotificaciones\s*\}\s*from\s*['"]@\/components\/SeccionNotificaciones['"]/)
  })
})

describe('cuenta.tsx: están los accesos del menú de la web (navbar.tsx)', () => {
  it('"Mi Radar Salteño"', () => {
    expect(SRC_CUENTA).toContain('Mi Radar Salteño')
  })

  it('"Mis Favoritos"', () => {
    expect(SRC_CUENTA).toContain('Mis Favoritos')
  })

  it('los dos accesos navegan a /radar y /favoritos', () => {
    expect(SRC_CUENTA).toMatch(/router\.push\(\s*['"]\/radar['"]\s*\)/)
    expect(SRC_CUENTA).toMatch(/router\.push\(\s*['"]\/favoritos['"]\s*\)/)
  })
})

describe('cuenta.tsx: "Cerrar sesión" es lo último del bloque con sesión', () => {
  it('tiene el texto "Cerrar sesión"', () => {
    expect(SRC_CUENTA).toContain('Cerrar sesión')
  })

  it('aparece después de "Mi Radar Salteño", "Mis Favoritos" y "Ver la bienvenida" (en ese orden)', () => {
    const idxRadar = SRC_CUENTA.indexOf('Mi Radar Salteño')
    const idxFavoritos = SRC_CUENTA.indexOf('Mis Favoritos')
    const idxBienvenida = SRC_CUENTA.indexOf('Ver la bienvenida')
    const idxCerrarSesion = SRC_CUENTA.lastIndexOf('Cerrar sesión')

    expect(idxRadar).toBeGreaterThan(-1)
    expect(idxFavoritos).toBeGreaterThan(idxRadar)
    expect(idxBienvenida).toBeGreaterThan(idxFavoritos)
    expect(idxCerrarSesion).toBeGreaterThan(idxBienvenida)
  })
})

// R48, tarea 48-d: la fila de acceso a "Contraseña"/"Cambiar contraseña",
// antes de "Cerrar sesión" (como pide la tarea), con el mismo componente
// `FilaAcceso` que ya usan "Mi Radar Salteño"/"Mis Favoritos" (no uno nuevo).
describe('cuenta.tsx: la fila "Contraseña" (textosContrasena), antes de "Cerrar sesión"', () => {
  it('importa textosContrasena y tipoDeCuenta de @qps/core/auth/cuenta', () => {
    expect(SRC_CUENTA).toMatch(
      /import\s*\{[^}]*\btextosContrasena\b[^}]*\}\s*from\s*['"]@qps\/core\/auth\/cuenta['"]/,
    )
    expect(SRC_CUENTA).toMatch(
      /import\s*\{[^}]*\btipoDeCuenta\b[^}]*\}\s*from\s*['"]@qps\/core\/auth\/cuenta['"]/,
    )
  })

  it('el texto de la fila sale de textosContrasena(tipoDeCuenta(session.user)).titulo', () => {
    expect(SRC_CUENTA).toMatch(/textosContrasena\(tipoDeCuenta\(session\.user\)\)\.titulo/)
  })

  it('al tocarla, navega a /contrasena', () => {
    expect(SRC_CUENTA).toMatch(/router\.push\(\s*['"]\/contrasena['"]\s*\)/)
  })

  it('aparece después de "Mi Radar Salteño"/"Mis Favoritos" y ANTES de "Cerrar sesión" (lastIndexOf, lo último del bloque con sesión)', () => {
    const idxFavoritos = SRC_CUENTA.indexOf('Mis Favoritos')
    const idxContrasena = SRC_CUENTA.indexOf("router.push('/contrasena')")
    const idxCerrarSesion = SRC_CUENTA.lastIndexOf('Cerrar sesión')

    expect(idxFavoritos).toBeGreaterThan(-1)
    expect(idxContrasena).toBeGreaterThan(idxFavoritos)
    expect(idxCerrarSesion).toBeGreaterThan(idxContrasena)
  })

  it('reusa el componente FilaAcceso (no escribe otra fila/Pressable propio para esto)', () => {
    const idxContrasena = SRC_CUENTA.indexOf("router.push('/contrasena')")
    expect(idxContrasena).toBeGreaterThan(-1)
    const inicioEtiqueta = SRC_CUENTA.lastIndexOf('<FilaAcceso', idxContrasena)
    expect(inicioEtiqueta).toBeGreaterThan(-1)
    // Entre el inicio de la etiqueta <FilaAcceso y el onPress no hay otra
    // apertura de Pressable/FilaAcceso de por medio: es la misma etiqueta.
    const entreMedio = SRC_CUENTA.slice(inicioEtiqueta, idxContrasena)
    expect(entreMedio).not.toMatch(/<Pressable\b/)
  })
})

// R48, tarea 48-d (vuelta 2, decisión de Mauro): `entrar` pasa a usar
// `mensajeErrorIngreso` de core en vez de `mensajeDeError`/`MENSAJES_ERROR` —
// el plan de la ronda ya fijaba esos textos (QPS-124/48-a); la única
// diferencia real es que `invalid_credentials` pierde el salto de línea que
// tenía acá (ver el comentario que queda en `MENSAJES_ERROR`, en el propio
// cuenta.tsx). `MENSAJES_ERROR` sigue existiendo para `entrarConGoogle`/
// `salir()` (no se borra nada acá).
describe('cuenta.tsx: entrar() usa mensajeErrorIngreso de core, no mensajeDeError/los literales a mano', () => {
  it('importa mensajeErrorIngreso de @qps/core/auth/mensajes', () => {
    expect(SRC_CUENTA).toMatch(
      /import\s*\{[^}]*\bmensajeErrorIngreso\b[^}]*\}\s*from\s*['"]@qps\/core\/auth\/mensajes['"]/,
    )
  })

  it('el cuerpo de entrar() llama a mensajeErrorIngreso en los dos manejos de error, nunca a mensajeDeError', () => {
    const inicio = SRC_CUENTA.indexOf('async function entrar()')
    // Corta en la siguiente función async del archivo (crearCuenta), para
    // mirar solo el cuerpo de entrar() — mismo patrón que
    // tests/mensaje-alta.test.ts con crearCuenta/entrarConGoogle.
    const fin = SRC_CUENTA.indexOf('async function crearCuenta')
    expect(inicio).toBeGreaterThan(-1)
    expect(fin).toBeGreaterThan(inicio)
    const cuerpo = SRC_CUENTA.slice(inicio, fin)

    expect(cuerpo).toContain('mensajeErrorIngreso(errorEntrar)')
    expect(cuerpo).toContain('mensajeErrorIngreso(excepcion)')
    expect(cuerpo).not.toContain('mensajeDeError(')
  })

  it('los tres literales que el plan fijó en core ya no están escritos a mano en el cuerpo de entrar()', () => {
    const inicio = SRC_CUENTA.indexOf('async function entrar()')
    const fin = SRC_CUENTA.indexOf('async function crearCuenta')
    const cuerpo = SRC_CUENTA.slice(inicio, fin)

    // Los tres textos pasaron a @qps/core/auth/mensajes (mensajeErrorIngreso/
    // mensajeErrorAlta): si alguno volviera a escribirse a mano acá, sería
    // una segunda definición divergente de un texto que ya vive en core.
    expect(cuerpo).not.toContain('Probá de nuevo en un rato')
    expect(cuerpo).not.toContain('No se pudo completar la operación')
    expect(cuerpo).not.toContain('Si entraste con Google, usá el botón de Google')
  })
})

describe('cuenta.tsx: usa BotonGoogle (no GoogleSigninButton directo)', () => {
  it('importa BotonGoogle de @/components/BotonGoogle', () => {
    expect(SRC_CUENTA).toMatch(/import\s*\{\s*BotonGoogle\s*\}\s*from\s*['"]@\/components\/BotonGoogle['"]/)
  })

  it('usa <BotonGoogle', () => {
    expect(SRC_CUENTA).toMatch(/<BotonGoogle\b/)
  })

  it('le pasa entrarConGoogle como onPress', () => {
    expect(SRC_CUENTA).toMatch(/<BotonGoogle[\s\S]{0,200}onPress=\{entrarConGoogle\}/)
  })
})

describe('cuenta.tsx: conserva piezas de la R28 (no se pierden en el rediseño)', () => {
  it('el aviso "Si entraste con Google" (F6)', () => {
    expect(SRC_CUENTA).toContain('Si entraste con Google')
  })

  it('el ScrollView del login tiene keyboardShouldPersistTaps="handled"', () => {
    expect(SRC_CUENTA).toContain('keyboardShouldPersistTaps="handled"')
  })

  it('"Ver la bienvenida" (F9)', () => {
    expect(SRC_CUENTA).toContain('Ver la bienvenida')
  })

  it('registra el código de error de Google (F8), nunca el message crudo', () => {
    expect(SRC_CUENTA).toContain('registrarErrorGoogle(excepcion)')
  })

  it('la salida también cierra la sesión de Google', () => {
    expect(SRC_CUENTA).toContain('GoogleSignin.signOut()')
  })

  it('muestra la versión al pie', () => {
    expect(SRC_CUENTA).toMatch(/\{version\}/)
  })
})

describe('cuenta.tsx: texto secundario en mutedForeground, nunca en border', () => {
  it('no usa colores.border como color de texto', () => {
    expect(SRC_CUENTA).not.toMatch(/\bcolor:\s*colores\.border\b/)
  })
})

// 49-a (QPS-244): "Iniciar Sesion" (sin tilde) pasa a "Iniciar sesión".
describe('cuenta.tsx: "Iniciar sesión" con tilde', () => {
  it('tiene el texto con tilde', () => {
    expect(SRC_CUENTA).toContain('Iniciar sesión')
  })

  it('no queda "Iniciar Sesion" sin tilde', () => {
    expect(SRC_CUENTA).not.toContain('Iniciar Sesion')
  })
})

// 49-a (QPS-241): `primary` deja de usarse para texto chico en esta
// pantalla. Los tres `Texto tono="primario"` ("Ver la bienvenida" x2 y
// "¿Olvidaste tu contraseña?") pasan a foreground (sin tono); conservan el
// subrayado.
describe('cuenta.tsx: QPS-241, sin tono="primario" para texto chico', () => {
  it('no queda ningún tono="primario"', () => {
    expect(CODIGO_CUENTA).not.toMatch(/tono="primario"/)
  })

  it('"Ver la bienvenida" sigue subrayado (las dos ramas)', () => {
    const apariciones = [...CODIGO_CUENTA.matchAll(/Ver la bienvenida/g)]
    expect(apariciones).toHaveLength(2)
  })

  it('"¿Olvidaste tu contraseña?" sigue subrayado', () => {
    const idx = CODIGO_CUENTA.indexOf('¿Olvidaste tu contraseña?')
    expect(idx).toBeGreaterThan(-1)
    const antes = CODIGO_CUENTA.slice(Math.max(0, idx - 150), idx)
    expect(antes).toContain("textDecorationLine: 'underline'")
  })
})

// 33-b (QPS-150): el teclado abierto no tiene que tapar los toques, en las
// dos ramas de Cuenta (con sesión y sin sesión). Se separan los dos bloques
// con anclas únicas del archivo ("if (session) {" hasta el arranque de la
// rama sin sesión, marcado por el <ImageBackground> del fondo de login) para
// que el test distinga de verdad las dos ramas: si alguien le sacara
// `keyboardShouldPersistTaps` solo a la rama con sesión, el chequeo de esa
// rama (y no el de la rama sin sesión, que seguiría en verde) se pondría en
// rojo. Un `SRC_CUENTA.toContain(...)` suelto sobre todo el archivo (como el
// de la R28/R29, arriba) no detectaría eso.
//
// 33-q (hueco de evasión, revisor): las anclas y el `.toContain` de abajo se
// calculaban sobre `SRC_CUENTA` crudo, sin sacar comentarios. Eso significa
// que alguien podía borrar la prop real de una rama y dejar, al lado,
// `// keyboardShouldPersistTaps="handled"` comentado: el `.toContain` la
// encuentra igual (es una subcadena del archivo, esté comentada o no) y el
// test queda en verde con el bug real presente. Ahora los dos bloques se
// recortan sobre `CODIGO_CUENTA` (ya sin comentarios, definido arriba).
describe('cuenta.tsx: QPS-150, keyboardShouldPersistTaps en las dos ramas', () => {
  const idxSesion = CODIGO_CUENTA.indexOf('if (session) {')
  const idxLogin = CODIGO_CUENTA.indexOf('<ImageBackground')
  const bloqueSesion = CODIGO_CUENTA.slice(idxSesion, idxLogin)
  const bloqueLogin = CODIGO_CUENTA.slice(idxLogin)

  it('encuentra las dos anclas que delimitan las ramas', () => {
    expect(idxSesion).toBeGreaterThan(-1)
    expect(idxLogin).toBeGreaterThan(idxSesion)
  })

  it('la rama CON sesión tiene su propio ScrollView', () => {
    expect(bloqueSesion).toMatch(/<ScrollView\b/)
  })

  it('la rama CON sesión: keyboardShouldPersistTaps="handled"', () => {
    expect(bloqueSesion).toContain('keyboardShouldPersistTaps="handled"')
  })

  it('la rama SIN sesión: keyboardShouldPersistTaps="handled" (ya desde la R28)', () => {
    expect(bloqueLogin).toContain('keyboardShouldPersistTaps="handled"')
  })

  it('fixture de rotura (33-q): un comentario con la línea buena al lado de la prop real sacada no cuenta', () => {
    const fixtureRoto = [
      'if (session) {',
      '  return (',
      '    <ScrollView',
      '      // keyboardShouldPersistTaps="handled" (antes estaba acá)',
      '    >',
      '    </ScrollView>',
      '  )',
      '}',
      '<ImageBackground>',
    ].join('\n')
    const limpio = quitarComentarios(fixtureRoto)
    const idx = limpio.indexOf('if (session) {')
    const idxFin = limpio.indexOf('<ImageBackground')
    expect(limpio.slice(idx, idxFin)).not.toContain('keyboardShouldPersistTaps="handled"')
  })

  it('fixture sano (33-q): la prop real (no comentada) sí cuenta', () => {
    const fixtureSano = [
      'if (session) {',
      '  return (',
      '    <ScrollView keyboardShouldPersistTaps="handled">',
      '    </ScrollView>',
      '  )',
      '}',
      '<ImageBackground>',
    ].join('\n')
    const limpio = quitarComentarios(fixtureSano)
    const idx = limpio.indexOf('if (session) {')
    const idxFin = limpio.indexOf('<ImageBackground')
    expect(limpio.slice(idx, idxFin)).toContain('keyboardShouldPersistTaps="handled"')
  })
})

// 33-b (QPS-149): mientras dura el login con Google, se muestra un
// indicador. Cuenta ya usa `accionEnCurso` para "entrar"/"crear"/"salir"
// (mismo mecanismo que esos botones, sin estado nuevo): acá se verifica que
// 'google' siga ese patrón y que BotonGoogle reciba `cargando` y `disabled`
// igual que como los demás botones reciben su ActivityIndicator y su
// `disabled={accionEnCurso !== null}`.
//
// 33-q (mismo hueco que QPS-150, arriba): las seis aserciones de abajo
// usaban `SRC_CUENTA`/`SRC_BOTON_GOOGLE` crudos. Un `setAccionEnCurso('google')`
// comentado al lado del código real (que ya no lo llama) pasaba igual. Ahora
// usan `CODIGO_CUENTA`/`CODIGO_BOTON_GOOGLE` (sin comentarios).
describe('cuenta.tsx + BotonGoogle.tsx: QPS-149, el indicador durante el login con Google', () => {
  it('"google" es una de las opciones de accionEnCurso', () => {
    expect(CODIGO_CUENTA).toMatch(/useState<'entrar'\s*\|\s*'crear'\s*\|\s*'google'\s*\|\s*'salir'\s*\|\s*null>/)
  })

  it('entrarConGoogle pone accionEnCurso en \'google\' mientras dura el login', () => {
    expect(CODIGO_CUENTA).toMatch(/setAccionEnCurso\('google'\)/)
  })

  it('le pasa cargando={accionEnCurso === \'google\'} a BotonGoogle', () => {
    expect(CODIGO_CUENTA).toMatch(/<BotonGoogle[\s\S]{0,200}cargando=\{accionEnCurso === 'google'\}/)
  })

  it('BotonGoogle sigue disabled con accionEnCurso !== null, como los demás botones', () => {
    expect(CODIGO_CUENTA).toMatch(/<BotonGoogle[\s\S]{0,200}disabled=\{accionEnCurso !== null\}/)
  })

  it('BotonGoogle.tsx: con cargando=true se muestra el ActivityIndicator (y no el ícono ni el texto)', () => {
    expect(CODIGO_BOTON_GOOGLE).toMatch(/cargando\s*\?[\s\S]{0,80}<ActivityIndicator/)
  })

  it('BotonGoogle.tsx: el Pressable queda disabled mientras cargando es true', () => {
    expect(CODIGO_BOTON_GOOGLE).toMatch(/deshabilitado\s*=\s*Boolean\(disabled\)\s*\|\|\s*Boolean\(cargando\)/)
  })

  it('fixture de rotura (33-q): setAccionEnCurso(\'google\') comentado (código real ya no lo llama) no cuenta', () => {
    const fixtureRoto = `// setAccionEnCurso('google')\nsetAccionEnCurso('entrar')`
    expect(quitarComentarios(fixtureRoto)).not.toMatch(/setAccionEnCurso\('google'\)/)
  })

  it('fixture sano (33-q): la llamada real (no comentada) sí cuenta', () => {
    const fixtureSano = `setAccionEnCurso('google')`
    expect(quitarComentarios(fixtureSano)).toMatch(/setAccionEnCurso\('google'\)/)
  })
})

describe('BotonGoogle.tsx: outline (con borderWidth) y detrás de la condición de la variable', () => {
  it('define borderWidth (es outline, no relleno)', () => {
    expect(SRC_BOTON_GOOGLE).toMatch(/borderWidth\s*:/)
  })

  it('a ancho completo', () => {
    expect(SRC_BOTON_GOOGLE).toMatch(/width:\s*['"]100%['"]/)
  })

  it('importa leerEnv de @/lib/env', () => {
    expect(SRC_BOTON_GOOGLE).toMatch(/import\s*\{\s*leerEnv\s*\}\s*from\s*['"]@\/lib\/env['"]/)
  })

  it('lee googleWebClientId y devuelve null si falta (no se muestra sin la variable)', () => {
    expect(SRC_BOTON_GOOGLE).toMatch(/if\s*\(\s*!googleWebClientId\s*\)\s*return null/)
  })

  it('dibuja la G con react-native-svg (Svg + Path), no GoogleSigninButton (fuera de los comentarios)', () => {
    expect(SRC_BOTON_GOOGLE).toMatch(/from\s+['"]react-native-svg['"]/)
    expect(CODIGO_BOTON_GOOGLE).not.toContain('GoogleSigninButton')
  })

  it('el texto es "Google", como la web', () => {
    expect(SRC_BOTON_GOOGLE).toContain('Google</Texto>')
  })
})
