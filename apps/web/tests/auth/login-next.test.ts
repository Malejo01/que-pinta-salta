/**
 * 48-b: `/auth/login` respeta `next` (con `rutaSiguienteSegura`), no deja
 * ningún `router.push('/')` fijo en el camino de éxito, nunca muestra
 * `error.message`.
 *
 * B3: ya no se usa `useSearchParams` (obligaba a envolver todo el formulario
 * en un `<Suspense>` y el prerender estático mandaba un fallback vacío). El
 * `next` se lee de `window.location.search` al enviar el formulario; el
 * render del HTML completo lo prueba `tests/rendimiento/b3-login-y-pie.test.ts`.
 *
 * Sin red ni base: lectura estática del código fuente con `fs` (si la ruta
 * no existe, `readFileSync` tira y el test falla ruidosamente, nunca un "no
 * hay nada que revisar").
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

  it('lee next de la URL del navegador al enviar y lo pasa por rutaSiguienteSegura', () => {
    expect(src).toMatch(
      /rutaSiguienteSegura\(\s*new URLSearchParams\(window\.location\.search\)\.get\(['"]next['"]\)\s*\)/,
    )
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

describe('/auth/login: sin useSearchParams ni <Suspense> (B3, la ruta prerenderiza la pantalla entera)', () => {
  // Antes este bloque exigía el `<Suspense>` alrededor de `useSearchParams`.
  // B3 sacó los dos: con ellos, el HTML estático era el fallback vacío.
  const codigo = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

  it('no importa useSearchParams ni Suspense', () => {
    expect(codigo).not.toMatch(/useSearchParams/)
    expect(codigo).not.toMatch(/\bSuspense\b/)
  })

  it('el next se lee dentro del handler del formulario, no en el render', () => {
    const handler = codigo.slice(codigo.indexOf('const handleLogin'), codigo.indexOf('return (', codigo.indexOf('const handleLogin')))
    expect(handler).toMatch(/window\.location\.search/)
    expect(handler).toMatch(/router\.push\(next\)/)
  })
})
