/**
 * 48-b: `/auth/login` respeta `next` (con `rutaSiguienteSegura`), no deja
 * ningún `router.push('/')` fijo en el camino de éxito, nunca muestra
 * `error.message`, y `useSearchParams` queda dentro de un `<Suspense>`.
 *
 * Sin red ni base: lectura estática del código fuente con `fs` (si la ruta
 * no existe, `readFileSync` tira y el test falla ruidosamente, nunca un "no
 * hay nada que revisar"). La única verificación real de que el `<Suspense>`
 * alcanza para que `next build` no falle es el propio `next build`, que de
 * noche no se corre: este test solo confirma que el patrón está en el
 * código, no que compile.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', '..')
const LOGIN_PATH = join(ROOT, 'app', 'auth', 'login', 'page.tsx')
const src = readFileSync(LOGIN_PATH, 'utf8')

describe('/auth/login: usa rutaSiguienteSegura sobre el next', () => {
  it('importa rutaSiguienteSegura de @qps/core/auth/cuenta', () => {
    expect(src).toMatch(/import\s*\{[^}]*rutaSiguienteSegura[^}]*\}\s*from\s*['"]@qps\/core\/auth\/cuenta['"]/)
  })

  it('lee next de useSearchParams y lo pasa por rutaSiguienteSegura', () => {
    expect(src).toMatch(/rutaSiguienteSegura\(\s*searchParams\.get\(['"]next['"]\)\s*\)/)
  })

  it('el router.push del camino de éxito usa la variable saneada, no un router.push(\'/\') fijo', () => {
    expect(src).toMatch(/router\.push\(next\)/)
    expect(src).not.toMatch(/router\.push\(\s*['"]\/['"]\s*\)/)
  })
})

describe('/auth/login: los errores de signInWithPassword pasan por mensajeErrorIngreso, nunca error.message', () => {
  it('importa mensajeErrorIngreso de @/lib/auth/mensajes', () => {
    expect(src).toMatch(/import\s*\{[^}]*mensajeErrorIngreso[^}]*\}\s*from\s*['"]@\/lib\/auth\/mensajes['"]/)
  })

  it('usa mensajeErrorIngreso(error) para setError en el login con password', () => {
    expect(src).toMatch(/setError\(mensajeErrorIngreso\(error\)\)/)
  })

  it('ningún camino muestra error.message (ni .message de ningún objeto de error)', () => {
    expect(src).not.toMatch(/\.message/)
  })
})

describe('/auth/login: useSearchParams está dentro de un <Suspense>', () => {
  it('importa Suspense de react y useSearchParams de next/navigation', () => {
    expect(src).toMatch(/import\s*\{[^}]*Suspense[^}]*\}\s*from\s*['"]react['"]/)
    expect(src).toMatch(/import\s*\{[^}]*useSearchParams[^}]*\}\s*from\s*['"]next\/navigation['"]/)
  })

  it('el default export envuelve el componente que usa useSearchParams en un <Suspense fallback={...}>', () => {
    expect(src).toMatch(/export default function LoginPage/)
    const bloqueDefault = src.slice(src.indexOf('export default function LoginPage'))
    expect(bloqueDefault).toMatch(/<Suspense\s+fallback=/)
  })

  it('useSearchParams se llama en un componente distinto del default export (el que queda envuelto, no el que envuelve)', () => {
    const inicioDefault = src.indexOf('export default function LoginPage')
    const usoSearchParams = src.indexOf('useSearchParams()')
    expect(usoSearchParams).toBeGreaterThan(-1)
    expect(usoSearchParams).toBeLessThan(inicioDefault)
  })
})
