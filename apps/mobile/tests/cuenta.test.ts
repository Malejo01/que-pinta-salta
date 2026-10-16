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
