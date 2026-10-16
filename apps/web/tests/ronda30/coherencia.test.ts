/**
 * 30-q (cierre de la ronda 30): detectores que cruzan tareas, sobre lo que
 * ya está commiteado en `ronda/30-web-mejoras`. Sin red ni base, solo
 * lectura de archivos fuente con `fs` (rutas resueltas desde este test; si
 * una ruta no existe, el `readFileSync` tira y el test falla ruidosamente,
 * nunca un "no hay nada que revisar").
 *
 * 1. Ninguna clase `zinc-`/`bg-black`/`text-white` fija (sin su variante
 *    `dark:`) en ningún archivo no-test que tocó la ronda 30 (lista sacada
 *    de `git diff main --stat` sobre la rama), salvo las excepciones que ya
 *    declaró 30-d en `tests/estilos/modo-claro.test.ts` (y
 *    `tareas/30-d-claro-radar-cines.md`), más `components/share-button.tsx`
 *    (`bg-black/60`/`text-white`: botón flotante sobre el afiche, mismo
 *    patrón que `favorite-button.tsx:117`). El detector de 30-d solo cubre
 *    sus propios 6 archivos; este repite el mismo chequeo sobre la lista
 *    completa de la ronda, para agarrar lo que tocaron las otras tareas
 *    (30-a, 30-b, 30-c, 30-e, 30-f).
 * 2. Ninguna forma de tuteo de la lista de 30-e en `apps/web/app` o
 *    `apps/web/components` (directorios completos, no solo lo que tocó la
 *    ronda), salvo los archivos de la R29 (`app/auth/login/page.tsx`,
 *    `app/favoritos/**`, `components/favorite-button.tsx`),
 *    `components/event-form.tsx` (el formulario de admin, que sigue
 *    tuteando a propósito, fuera del alcance de 30-e) y, por el mismo
 *    motivo, `app/mis-eventos/mis-eventos-client.tsx` y
 *    `components/draft-events-manager.tsx` (deuda de voseo real pero fuera
 *    del alcance de 30-e, QPS-157).
 * 3. Ningún `type="password"` suelto fuera de `PasswordInput`
 *    (`components/ui/password-input.tsx`), salvo `app/auth/login/page.tsx`
 *    (R29).
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// apps/web/tests/ronda30 -> apps/web/tests -> apps/web
const ROOT = join(__dirname, '..', '..')
const read = (relPath: string) => readFileSync(join(ROOT, relPath), 'utf8')

/** Lista recursiva de archivos .ts/.tsx de un directorio, rutas relativas a ROOT (apps/web). */
function listarArchivosRecursivo(dirRelPath: string): string[] {
  const dirAbs = join(ROOT, dirRelPath)
  const entradas = readdirSync(dirAbs, { withFileTypes: true })
  const resultado: string[] = []
  for (const entrada of entradas) {
    const relPath = `${dirRelPath}/${entrada.name}`
    if (entrada.isDirectory()) {
      resultado.push(...listarArchivosRecursivo(relPath))
    } else if (entrada.isFile() && (entrada.name.endsWith('.ts') || entrada.name.endsWith('.tsx'))) {
      resultado.push(relPath)
    }
  }
  return resultado
}

// ---------------------------------------------------------------------------
// 1. Colores fijos (zinc-/bg-black/text-white) sin dark:
// ---------------------------------------------------------------------------

// Todos los archivos no-test que tocó la ronda 30, según
// `git -C <worktree> diff main --stat` sobre `ronda/30-web-mejoras`
// (6 commits: 30-a, 30-c, 30-f, 30-b, 30-d, 30-e).
const RONDA_30_ARCHIVOS_NO_TEST = [
  'app/@modal/(.)evento/[id]/page.tsx',
  'app/auth/sign-up/page.tsx',
  'app/buscar/buscar-content.tsx',
  'app/buscar/loading.tsx',
  'app/cines/loading.tsx',
  'app/cines/page.tsx',
  'app/evento/[id]/loading.tsx',
  'app/evento/[id]/page.tsx',
  'app/favoritos/loading.tsx',
  'app/loading.tsx',
  'app/radar/loading.tsx',
  'app/radar/page.tsx',
  'components/auth-modal.tsx',
  'components/change-password-form.tsx',
  'components/cines-view.tsx',
  'components/event-detail-page.tsx',
  'components/event-form.tsx',
  'components/event-modal-wrapper.tsx',
  'components/event-modal.tsx',
  'components/movie-card.tsx',
  'components/movie-modal.tsx',
  'components/radar-form.tsx',
  'components/share-button.tsx',
  'components/skeletons.tsx',
  'components/ui/password-input.tsx',
  'lib/actions/radar.ts',
  'lib/favoritos/es-favorito.ts',
] as const

// Mismo patrón que usa 30-d en tests/estilos/modo-claro.test.ts.
const CLASS_TOKEN_PATTERN =
  /[A-Za-z0-9_:/.[\]#-]*(?:zinc-\d+|bg-black(?:\/\d+)?|text-white)[A-Za-z0-9_:/.[\]#-]*/g

// Excepciones ya declaradas por 30-d en tests/estilos/modo-claro.test.ts
// (y documentadas con su motivo en tareas/30-d-claro-radar-cines.md): el
// badge flotante de movie-card.tsx sobre el afiche de la película, y el
// botón "Donar ahora" de radar-form.tsx con el rojo de marca fijo. Mismos
// tokens exactos; no se repite el motivo acá para no duplicar la fuente de
// verdad (está en el otro test).
const EXCEPCIONES_30D: Record<string, string[]> = {
  'components/movie-card.tsx': ['bg-black/70', 'hover:bg-black/80', 'text-white', 'border-zinc-700/50'],
  'components/radar-form.tsx': ['text-white'],
  // components/share-button.tsx:89 "bg-black/60"/"text-white": botón flotante
  // de compartir sobre el afiche del evento (fondo es la imagen, no el
  // tema), mismo patrón que favorite-button.tsx:117. Los dos call sites
  // (event-detail-page.tsx, event-modal-wrapper.tsx) además lo pisan con
  // clases de token vía `className`.
  'components/share-button.tsx': ['bg-black/60', 'text-white'],
}

describe('Ronda 30: ningún archivo tocado tiene clases zinc-/bg-black/text-white fijas sin dark: (fuera de lo declarado por 30-d)', () => {
  for (const relPath of RONDA_30_ARCHIVOS_NO_TEST) {
    it(`${relPath}: toda clase fija tiene su dark: (o está en las excepciones de 30-d)`, () => {
      const lineas = read(relPath).split('\n')
      const permitidas = EXCEPCIONES_30D[relPath] ?? []
      const violaciones: string[] = []

      lineas.forEach((linea, idx) => {
        const tokens = linea.match(CLASS_TOKEN_PATTERN) ?? []
        for (const token of tokens) {
          if (!token.includes('dark:') && !permitidas.includes(token)) {
            violaciones.push(`${relPath}:${idx + 1} -> "${token}"`)
          }
        }
      })

      expect(violaciones).toEqual([])
    })
  }
})

// ---------------------------------------------------------------------------
// 2. Tuteo en apps/web/app y apps/web/components (directorios completos)
// ---------------------------------------------------------------------------

// Formas sueltas: palabras completas (con límite de palabra), case-insensitive.
const FORMAS_TUTEO_SUELTAS = [
  'tienes',
  'debes',
  'selecciona',
  'escribe',
  'busca',
  'sigue',
  'personaliza',
  'decides',
  'quieres',
] as const

// Frases: se buscan como substring literal, case-insensitive (tienen tilde
// y/o espacios, no hace falta límite de palabra).
const FORMAS_TUTEO_FRASES = [
  'suscríbete',
  'regístrate',
  'inicia sesión',
  'únete',
  'guarda tus',
  'cambia tu',
  'recibe alertas',
] as const

// Excepciones: los archivos de la R29 (no tocados por 30-e, fuera de
// alcance) y components/event-form.tsx (el formulario de admin: el lead
// pidió explícitamente declararlo como excepción comentada en vez de
// aflojar el detector, porque sigue tuteando a propósito y no es parte de
// QPS-021).
const TUTEO_ARCHIVO_EXACTO_EXCEPTUADO = new Set([
  'app/auth/login/page.tsx',
  'components/favorite-button.tsx',
  'components/event-form.tsx',
  // Deuda de voseo fuera del alcance de 30-e (QPS-157): pantallas propias y panel de borradores.
  'app/mis-eventos/mis-eventos-client.tsx',
  'components/draft-events-manager.tsx',
])
const TUTEO_PREFIJO_EXCEPTUADO = ['app/favoritos/']

function tuteoEstaExceptuado(relPath: string): boolean {
  if (TUTEO_ARCHIVO_EXACTO_EXCEPTUADO.has(relPath)) return true
  return TUTEO_PREFIJO_EXCEPTUADO.some((prefijo) => relPath.startsWith(prefijo))
}

// El repo tiene comentarios en castellano que usan estas mismas palabras sin
// ser texto de pantalla (p. ej. "el host sigue siendo el propio", "busca
// flyers pendientes"). El detector es sobre lo que lee el usuario, no sobre
// los comentarios del código fuente: se descartan antes de buscar.
function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

describe('Ronda 30: ninguna forma de tuteo de la lista de 30-e en apps/web/app o apps/web/components (fuera de las excepciones de la R29 y event-form.tsx)', () => {
  const archivos = [...listarArchivosRecursivo('app'), ...listarArchivosRecursivo('components')].filter(
    (relPath) => !tuteoEstaExceptuado(relPath)
  )

  it('la lista de archivos a revisar no está vacía (si esto da 0, el detector no está revisando nada)', () => {
    expect(archivos.length).toBeGreaterThan(50)
  })

  it('ningún archivo (fuera de las excepciones declaradas) contiene una forma de tuteo de la lista de 30-e', () => {
    const violaciones: string[] = []

    for (const relPath of archivos) {
      const original = read(relPath)
      const sinComentar = sinComentarios(original)
      const lineasOriginal = original.split('\n')

      for (const forma of FORMAS_TUTEO_SUELTAS) {
        const regexGlobal = new RegExp(`\\b${forma}\\b`, 'iu')
        if (regexGlobal.test(sinComentar)) {
          const idx = lineasOriginal.findIndex((linea) => regexGlobal.test(linea))
          violaciones.push(`${relPath}:${idx >= 0 ? idx + 1 : '?'} -> "${forma}"`)
        }
      }
      for (const frase of FORMAS_TUTEO_FRASES) {
        if (sinComentar.toLowerCase().includes(frase.toLowerCase())) {
          const idx = lineasOriginal.findIndex((linea) => linea.toLowerCase().includes(frase.toLowerCase()))
          violaciones.push(`${relPath}:${idx >= 0 ? idx + 1 : '?'} -> "${frase}"`)
        }
      }
    }

    expect(violaciones).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 3. type="password" suelto fuera de PasswordInput
// ---------------------------------------------------------------------------

const PASSWORD_INPUT_DEFINICION = 'components/ui/password-input.tsx'
const PASSWORD_EXCEPCION_R29 = 'app/auth/login/page.tsx'
const TYPE_PASSWORD_LITERAL = /type=["']password["']/

describe('Ronda 30: ningún type="password" suelto fuera de PasswordInput (salvo app/auth/login/page.tsx, R29)', () => {
  const archivos = [...listarArchivosRecursivo('app'), ...listarArchivosRecursivo('components')].filter(
    (relPath) => relPath !== PASSWORD_INPUT_DEFINICION && relPath !== PASSWORD_EXCEPCION_R29
  )

  it('ningún archivo (fuera de las excepciones) tiene type="password" literal', () => {
    const violaciones: string[] = []
    for (const relPath of archivos) {
      const lineas = read(relPath).split('\n')
      lineas.forEach((linea, idx) => {
        if (TYPE_PASSWORD_LITERAL.test(linea)) {
          violaciones.push(`${relPath}:${idx + 1} -> "${linea.trim()}"`)
        }
      })
    }
    expect(violaciones).toEqual([])
  })

  it('PasswordInput alterna type="text"/type="password" según el estado, no lo deja fijo', () => {
    expect(read(PASSWORD_INPUT_DEFINICION)).toMatch(/type=\{visible \? ['"]text['"] : ['"]password['"]\}/)
  })

  it('la excepción declarada (login, R29) existe de verdad y tiene type="password"', () => {
    expect(TYPE_PASSWORD_LITERAL.test(read(PASSWORD_EXCEPCION_R29))).toBe(true)
  })
})
