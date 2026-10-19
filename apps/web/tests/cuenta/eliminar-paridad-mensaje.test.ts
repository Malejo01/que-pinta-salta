// Tarea 48-q (qa), punto 4: el borrado de cuenta, de punta a punta.
//
// Antes de escribir este archivo se leyeron (como pide la tarea)
// tests/cuenta/eliminar.test.ts, tests/cuenta/eliminar-endpoint.test.ts,
// tests/cuenta/flujo-eliminar-cuenta.test.ts y tests/cuenta/eliminar-rpc.test.ts.
// Ya cubren, de sobra:
//   - todo o nada con un doble del RPC transaccional, incluido el camino
//     feliz, el de fallo total, QPS-185 (createEvent concurrente) y QPS-187
//     (reintento idempotente) — flujo-eliminar-cuenta.test.ts.
//   - "No se borró nada" como respuesta EXACTA del endpoint cuando
//     eliminarCuenta falla en el paso "rpc" — eliminar-endpoint.test.ts,
//     describe 'si el RPC falla, el mensaje es específico ("No se borró
//     nada")...'.
//   - el RPC llamado siempre con el cliente de la persona (nunca la service
//     role), con Bearer y con cookie, incluido el caso cruzado Bearer de A +
//     cookie de B — eliminar-endpoint.test.ts, describe 'el cliente del
//     RPC: Bearer vs. cookie...'.
//   - la URL y el literal de confirmación iguales entre la web, la app y el
//     endpoint — flujo-eliminar-cuenta.test.ts, última sección.
//
// Lo que NINGUNO de esos cuatro archivos compara es el TEXTO que la persona
// ve cuando el borrado falla: `eliminar-cuenta-form.tsx` (web) tiene su
// propio literal fijo en el catch, y `apps/mobile/lib/cuenta.ts` tiene su
// propio `MENSAJE_GENERICO` — nadie los cruza entre sí, ni contra lo que la
// transacción de verdad puede prometer (QPS-190: todo o nada, nunca "a medio
// borrar"). Eso es lo que fija este archivo. Es, a propósito, un archivo
// chico: todo lo demás que pedía el punto 4 del encargo ya estaba cubierto
// (ver arriba), así que esto es lo único que faltaba y valía la pena.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CONTACTO_EMAIL } from '@qps/core/contacto'

const RAIZ_WEB = process.cwd() // apps/web cuando se corre `npx vitest` desde ahí
const RAIZ_MOBILE = join(RAIZ_WEB, '..', 'mobile')

const CONTENIDO_WEB = readFileSync(
  join(RAIZ_WEB, 'app', 'perfil', 'eliminar-cuenta', 'eliminar-cuenta-form.tsx'),
  'utf8',
)
const CONTENIDO_APP = readFileSync(join(RAIZ_MOBILE, 'lib', 'cuenta.ts'), 'utf8')

/**
 * Extrae el texto del `setError(\`...\`)` del catch de `handleSubmit` en
 * eliminar-cuenta-form.tsx. Interpola `${CONTACTO_EMAIL}` con el valor real
 * de la constante (importada de core, nunca copiada a mano), para comparar
 * el texto FINAL que ve la persona, no el template literal crudo.
 */
function extraerMensajeWeb(contenido: string): string {
  const match = contenido.match(/setError\(`([^`]+)`\)/)
  if (!match) {
    throw new Error(
      'No se encontró setError(`...`) en eliminar-cuenta-form.tsx con el patrón esperado: ¿cambió el código a otra forma?',
    )
  }
  return match[1].replace('${CONTACTO_EMAIL}', CONTACTO_EMAIL)
}

/** Mismo criterio para `MENSAJE_GENERICO` de apps/mobile/lib/cuenta.ts. */
function extraerMensajeApp(contenido: string): string {
  const match = contenido.match(/MENSAJE_GENERICO\s*=\s*`([^`]+)`/)
  if (!match) {
    throw new Error(
      'No se encontró MENSAJE_GENERICO = `...` en apps/mobile/lib/cuenta.ts con el patrón esperado: ¿cambió el código?',
    )
  }
  return match[1].replace('${CONTACTO_EMAIL}', CONTACTO_EMAIL)
}

describe('eliminar cuenta: el texto de fallo es EXACTAMENTE el mismo en la web y en la app', () => {
  it('los dos literales, con CONTACTO_EMAIL interpolado, son idénticos', () => {
    const mensajeWeb = extraerMensajeWeb(CONTENIDO_WEB)
    const mensajeApp = extraerMensajeApp(CONTENIDO_APP)
    expect(mensajeWeb).toBe(mensajeApp)
  })

  it('el texto es justo lo que la transacción de delete_my_account() puede prometer: "no se borró nada" (QPS-190, todo o nada) — nunca algo como "puede haber quedado a medio borrar"', () => {
    const mensajeWeb = extraerMensajeWeb(CONTENIDO_WEB)
    expect(mensajeWeb.startsWith('No se borró nada')).toBe(true)
    expect(mensajeWeb).not.toMatch(/parcial|a medio|algunos datos/i)
  })

  it('el texto incluye el email real de contacto (no un literal hardcodeado que pueda divergir de CONTACTO_EMAIL)', () => {
    const mensajeWeb = extraerMensajeWeb(CONTENIDO_WEB)
    const mensajeApp = extraerMensajeApp(CONTENIDO_APP)
    expect(mensajeWeb).toContain(CONTACTO_EMAIL)
    expect(mensajeApp).toContain(CONTACTO_EMAIL)
  })

  it('la web muestra ese mensaje ante CUALQUIER fallo del fetch (handleSubmit solo mira res.ok, nunca lee el cuerpo de la respuesta de error): si leyera res.json().error, mostraría un texto que varía según el status y that la web no puede prometer para todos los casos (ej. "Ya hay un pedido de borrado en curso" o "No autenticado", donde no está tan claro como con el fallo del RPC)', () => {
    expect(CONTENIDO_WEB).toMatch(/if\s*\(\s*!res\.ok\s*\)/)
    expect(CONTENIDO_WEB).not.toMatch(/res\.json\(\)/)
  })
})
