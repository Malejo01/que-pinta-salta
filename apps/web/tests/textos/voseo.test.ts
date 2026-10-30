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
  // Alta (app/auth/sign-up-success/page.tsx, tarea 48-b): título y cuerpo
  // tuteaban y faltaban tildes ("Revisa", "confirmacion", "por favor",
  // "haz click").
  { archivo: 'app/auth/sign-up-success/page.tsx', texto: 'Revisa tu email para confirmar' },
  { archivo: 'app/auth/sign-up-success/page.tsx', texto: 'Te hemos enviado un email de confirmacion' },
  { archivo: 'app/auth/sign-up-success/page.tsx', texto: 'Por favor revisa tu' },
  { archivo: 'app/auth/sign-up-success/page.tsx', texto: 'haz click en el enlace' },
  // Toasts de favoritos (components/favorite-button.tsx, tarea 33-e, ronda 33)
  { archivo: 'components/favorite-button.tsx', texto: 'Inténtalo de nuevo' },
  { archivo: 'components/favorite-button.tsx', texto: 'invitamos un cafecito' },
  // Desde Q3 los textos de favorite-button.tsx viven en el diccionario.
  { archivo: 'lib/i18n/diccionarios/es.ts', texto: 'Inténtalo de nuevo' },
  { archivo: 'lib/i18n/diccionarios/es.ts', texto: 'invitamos un cafecito' },
  // Desde Q3 los textos de auth-modal.tsx también viven en el diccionario.
  { archivo: 'lib/i18n/diccionarios/es.ts', texto: 'Guarda tus eventos' },
  { archivo: 'lib/i18n/diccionarios/es.ts', texto: 'Únete para guardar' },
  { archivo: 'lib/i18n/diccionarios/es.ts', texto: '¿No tienes cuenta?' },
  { archivo: 'lib/i18n/diccionarios/es.ts', texto: '¿Ya tienes cuenta?' },
  { archivo: 'lib/i18n/diccionarios/es.ts', texto: 'Regístrate' },
  { archivo: 'lib/i18n/diccionarios/es.ts', texto: 'Inicia Sesión' },
]

describe('Voseo rioplatense (30-e): las formas de tuteo que se sacaron no vuelven a aparecer', () => {
  it.each(FORMAS_TUTEO_SACADAS)('$archivo: no contiene "$texto"', ({ archivo, texto }) => {
    const contenido = read(archivo)
    expect(contenido).not.toContain(texto)
  })
})

describe('Toasts de favoritos (33-e): el pedido del cafecito está en voseo y es idéntico en los dos lugares', () => {
  const contenido = read('components/favorite-button.tsx')
  // Desde Q3 el texto vive una sola vez en el diccionario (`favorito.pedidoCafecito`)
  // y favorite-button.tsx lo usa en los dos lugares por su clave.
  const diccionario = read('lib/i18n/diccionarios/es.ts')

  it('no contiene "invitamos un cafecito" (tuteo invertido: el pedido es que nos inviten)', () => {
    expect(contenido).not.toContain('invitamos un cafecito')
    expect(diccionario).not.toContain('invitamos un cafecito')
  })

  it('el diccionario tiene el pedido en voseo, exactamente una vez', () => {
    const coincidencias = [
      ...diccionario.matchAll(/pedidoCafecito:\s*'¡Plan guardado! ❤️ Si Qué Pinta Salta te ayuda a organizar tu finde, invitanos un cafecito para ayudarnos a crear la App móvil\.'/g),
    ]
    expect(coincidencias.length).toBe(1)
  })

  it('el texto del toast y el del onClick del botón de donación son idénticos (la misma clave en los dos lugares)', () => {
    // La description del toast y el mensaje que recibe openDonationModal.
    expect(contenido).toMatch(/\?\s*t\.pedidoCafecito\s*:/)
    expect(contenido).toMatch(/openDonationModal\(t\.pedidoCafecito\)/)
    expect([...contenido.matchAll(/t\.pedidoCafecito\b/g)].length).toBe(2)
    // Ningún literal suelto del pedido que pueda separarse del diccionario.
    expect(contenido).not.toMatch(/invitanos un cafecito/)
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
