/**
 * Voseo rioplatense (tarea 30-e, ronda 30): varias pantallas tuteaban
 * ("tienes", "quieres", "selecciona", "sigue", "busca", "escribe", "debes",
 * "guarda", "únete", "regístrate", "inicia", "cambia tu"...) en vez de vosear
 * ("tenés", "querés", "seleccioná", "seguí", "buscá", "escribí", "tenés
 * que", "guardá", "sumate", "registrate", "iniciá", "cambiá tu"...). Esta
 * lista son exactamente las formas que se sacaron: si alguna vuelve a
 * aparecer en su archivo, alguien tuteó sin querer. Detector estático sobre
 * el código fuente, sin red ni base.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// apps/web/tests/textos -> apps/web/tests -> apps/web
const ROOT = join(__dirname, '..', '..')
const read = (relPath: string) => readFileSync(join(ROOT, relPath), 'utf8')

const FORMAS_TUTEO_SACADAS: { archivo: string; texto: string }[] = [
  // Radar (app/radar/page.tsx)
  { archivo: 'app/radar/page.tsx', texto: 'Personaliza tu suscripción' },
  { archivo: 'app/radar/page.tsx', texto: 'Tú decides' },
  { archivo: 'app/radar/page.tsx', texto: 'Suscríbete' },
  { archivo: 'app/radar/page.tsx', texto: 'recibe alertas' },
  // Radar (components/radar-form.tsx)
  { archivo: 'components/radar-form.tsx', texto: '¿Cada cuánto quieres recibir novedades?' },
  { archivo: 'components/radar-form.tsx', texto: 'Selecciona frecuencia' },
  { archivo: 'components/radar-form.tsx', texto: 'Sigue locales físicos' },
  { archivo: 'components/radar-form.tsx', texto: 'Busca locales físicos' },
  { archivo: 'components/radar-form.tsx', texto: 'Escribe arriba' },
  // Radar (lib/actions/radar.ts, solo mensajes de error)
  { archivo: 'lib/actions/radar.ts', texto: 'Debes iniciar sesión' },
  { archivo: 'lib/actions/radar.ts', texto: 'Debes seguir al menos' },
  // Login del modal (components/auth-modal.tsx)
  { archivo: 'components/auth-modal.tsx', texto: 'Guarda tus eventos' },
  { archivo: 'components/auth-modal.tsx', texto: 'Únete para guardar' },
  { archivo: 'components/auth-modal.tsx', texto: '¿No tienes cuenta?' },
  { archivo: 'components/auth-modal.tsx', texto: '¿Ya tienes cuenta?' },
  { archivo: 'components/auth-modal.tsx', texto: 'Regístrate' },
  { archivo: 'components/auth-modal.tsx', texto: 'Inicia Sesión' },
  // Registro (app/auth/sign-up/page.tsx)
  { archivo: 'app/auth/sign-up/page.tsx', texto: '¿Ya tienes cuenta?' },
  // Cambiar contraseña (components/change-password-form.tsx)
  { archivo: 'components/change-password-form.tsx', texto: 'Cambia tu contraseña' },
]

describe('Voseo rioplatense (30-e): las formas de tuteo que se sacaron no vuelven a aparecer', () => {
  it.each(FORMAS_TUTEO_SACADAS)('$archivo: no contiene "$texto"', ({ archivo, texto }) => {
    const contenido = read(archivo)
    expect(contenido).not.toContain(texto)
  })
})

/** Lista recursiva de archivos .ts/.tsx de un directorio, rutas relativas a ROOT. */
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

describe('"Como llegar" sin tilde no aparece en apps/web/components (ahora es "Cómo llegar")', () => {
  const archivosComponents = listarArchivosRecursivo('components')

  it.each(archivosComponents)('%s no contiene "Como llegar" sin tilde', (relPath) => {
    const contenido = read(relPath)
    expect(contenido).not.toContain('Como llegar')
  })
})
