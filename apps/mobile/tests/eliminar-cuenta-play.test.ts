// tests/eliminar-cuenta-play.test.ts (R44, tarea 44-c): QPS-191 (lista de
// "qué se borra" + mail de contacto en la pantalla) y QPS-193
// (`signOut({ scope: 'local' })` en `lib/cuenta.ts`).
//
// No importa nada de `tests/eliminar-cuenta.test.ts` (prohibido tocar ese
// archivo y mejor no acoplarse a él): copia la *forma* de sus `vi.mock`,
// pero guardando el argumento con el que se llama a `signOut` en vez de
// solo contar las llamadas.
//
// La pantalla (`app/eliminar-cuenta.tsx`) no se importa: `vitest.config.ts`
// es `environment: 'node'` e incluye solo `tests/**/*.test.ts` — nada de
// React Native acá. Se prueba con un detector de texto (`readFileSync`),
// igual que `tests/eliminar-cuenta.test.ts` hace con `lib/cuenta.ts`.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({
  ultimoSignOut: undefined as unknown,
  signOutLlamado: 0,
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signOut: vi.fn(async (opciones?: unknown) => {
        estado.signOutLlamado++
        estado.ultimoSignOut = opciones
      }),
    },
  },
}))

vi.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    signOut: vi.fn(async () => {}),
  },
}))

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
}))

import { limpiarTrasEliminarCuenta } from '@/lib/cuenta'

beforeEach(() => {
  estado.signOutLlamado = 0
  estado.ultimoSignOut = undefined
})

// ---------------------------------------------------------------------------
// QPS-193: limpiarTrasEliminarCuenta llama a signOut con { scope: 'local' },
// nunca con el global por defecto, entró o no con Google.
// ---------------------------------------------------------------------------
describe('limpiarTrasEliminarCuenta: QPS-193, signOut con scope local', () => {
  it('llama a signOut exactamente una vez, con { scope: "local" } (sin campos de más)', async () => {
    await limpiarTrasEliminarCuenta(false)

    expect(estado.signOutLlamado).toBe(1)
    expect(estado.ultimoSignOut).toEqual({ scope: 'local' })
  })

  it('con entroConGoogle: true, el scope sigue siendo "local"', async () => {
    await limpiarTrasEliminarCuenta(true)

    expect(estado.signOutLlamado).toBe(1)
    expect(estado.ultimoSignOut).toEqual({ scope: 'local' })
  })
})

describe('lib/cuenta.ts (detector de texto): signOut({ scope: "local" }), nunca pelado', () => {
  it('contiene signOut({ scope: \'local\' }) y no contiene ningún auth.signOut() pelado', () => {
    const ruta = fileURLToPath(new URL('../lib/cuenta.ts', import.meta.url))
    const codigo = readFileSync(ruta, 'utf8')
    expect(codigo.trim().length).toBeGreaterThan(0)
    expect(codigo).toContain("signOut({ scope: 'local' })")
    expect(codigo).not.toMatch(/auth\.signOut\(\)/)
  })
})

// ---------------------------------------------------------------------------
// QPS-191: la pantalla (app/eliminar-cuenta.tsx), por detector de texto.
// ---------------------------------------------------------------------------
describe('app/eliminar-cuenta.tsx (detector de texto): QPS-191, el mail de contacto', () => {
  const ruta = fileURLToPath(new URL('../app/eliminar-cuenta.tsx', import.meta.url))
  const codigo = readFileSync(ruta, 'utf8')

  it('se puede leer y no está vacío', () => {
    expect(codigo.trim().length).toBeGreaterThan(0)
  })

  it('importa CONTACTO_EMAIL de @qps/core/contacto', () => {
    expect(codigo).toMatch(/import\s*\{\s*CONTACTO_EMAIL\s*\}\s*from\s*['"]@qps\/core\/contacto['"]/)
  })

  it('no repite el literal del mail ni deja un [COMPLETAR', () => {
    expect(codigo).not.toContain('@quepintasalta.com.ar')
    expect(codigo).not.toContain('[COMPLETAR')
  })

  it('el mail va en un texto seleccionable (para poder copiarlo)', () => {
    expect(codigo).toContain('selectable')
  })

  it('agrega el ítem exacto del historial de avisos a la lista de "qué se borra"', () => {
    expect(codigo).toContain('• El historial de los avisos que te mandamos.')
  })

  it('no abre el mail con Linking.openURL ni con un link mailto: armado a mano', () => {
    expect(codigo).not.toContain('openURL')
    expect(codigo).not.toContain('mailto:')
  })

  // -------------------------------------------------------------------------
  // Hallazgo de ux-ui (44-c2): nada avisaba que el mail se puede copiar.
  // Como la pantalla no puede abrir mailto: (tests/aperturas-url.test.ts),
  // copiar el mail es la única salida de quien no puede borrar la cuenta
  // desde la app, así que el aviso tiene que estar sí o sí: para quien ve la
  // pantalla (leyenda visible) y para TalkBack (accessibilityHint).
  // -------------------------------------------------------------------------
  it('el mail tiene un accessibilityLabel que lo identifica como correo de contacto', () => {
    expect(codigo).toMatch(/accessibilityLabel=\{`Correo de contacto: \$\{CONTACTO_EMAIL\}`\}/)
  })

  it('el bloque del mail tiene un accessibilityHint cuyo texto nombra "copiar"', () => {
    expect(codigo).toMatch(/accessibilityHint="[^"]*copiar[^"]*"/i)
  })

  it('hay una leyenda visible (no solo el accessibilityHint) que dice cómo copiar el mail', () => {
    // Si alguien borra la leyenda visible pero deja el accessibilityHint,
    // sacar el accessibilityHint del código no debería dejar ningún rastro
    // de "copiar" en lo que queda.
    const sinAccessibilityHint = codigo.replace(/accessibilityHint="[^"]*"/g, '')
    expect(sinAccessibilityHint.toLowerCase()).toMatch(/copiar/)
  })
})
