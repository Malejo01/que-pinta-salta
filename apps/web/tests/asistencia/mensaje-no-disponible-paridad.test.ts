// Paridad web/app del texto "Ese evento ya no está disponible." (tarea 73-c):
// la web lo saca de `@qps/core/asistencia` y la app tiene su propia copia en
// `apps/mobile/lib/asistencia.ts` (y otra en `favoritos.ts`). Si una cambia
// sin la otra, la persona ve un mensaje distinto según dónde marque el Voy.
//
// Por qué se lee el archivo de la app como TEXTO y no se importa: ese módulo
// arrastra el cliente de Supabase y React Native, que no corren en el Vitest
// de la web. Se extrae la constante con una regex.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { MENSAJE_EVENTO_NO_DISPONIBLE } from '@qps/core/asistencia'

function constanteDeLaApp(archivo: string): string | null {
  const ruta = fileURLToPath(new URL(`../../../mobile/lib/${archivo}`, import.meta.url))
  const fuente = readFileSync(ruta, 'utf8')
  const m = fuente.match(/export const MENSAJE_EVENTO_NO_DISPONIBLE\s*=\s*(['"`])((?:(?!\1).)*)\1/)
  return m ? m[2] : null
}

describe('paridad del mensaje de evento no disponible (web, core y app)', () => {
  it('la constante de core no está vacía', () => {
    expect(MENSAJE_EVENTO_NO_DISPONIBLE.length).toBeGreaterThan(0)
  })

  it('apps/mobile/lib/asistencia.ts declara la constante y es idéntica a la de core', () => {
    const deLaApp = constanteDeLaApp('asistencia.ts')
    expect(deLaApp).not.toBeNull()
    expect(deLaApp).toBe(MENSAJE_EVENTO_NO_DISPONIBLE)
  })

  it('apps/mobile/lib/favoritos.ts (la otra copia en la app) también es idéntica a la de core', () => {
    const deLaApp = constanteDeLaApp('favoritos.ts')
    expect(deLaApp).not.toBeNull()
    expect(deLaApp).toBe(MENSAJE_EVENTO_NO_DISPONIBLE)
  })
})
