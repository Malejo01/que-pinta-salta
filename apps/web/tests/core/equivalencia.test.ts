/**
 * Los módulos movidos a `packages/core/src` (R22: 13 módulos; R25: 3 más —
 * `events/public-select`, `images/variants` y `auth/mensajes`, tarea 25-a;
 * R26: `metricas/links`, tarea 26-a) tienen que seguir siendo accesibles
 * desde `apps/web/lib/...` (el código
 * viejo no se borra, se convierte en un re-export). Este test, por cada
 * módulo:
 *
 *  1. Importa la ruta vieja (`@/lib/...`) y la nueva (`@qps/core/...`).
 *  2. Compara que expongan exactamente las mismas claves en runtime.
 *  3. Compara que cada export sea la *misma referencia* (`===`): si fuera
 *     una copia del código en vez de un re-export, esto lo detecta aunque
 *     las dos implementaciones calculen lo mismo.
 *
 * Varios de estos módulos exportan solo tipos (interfaces, type aliases):
 * en runtime su namespace queda vacío. Eso es válido, pero hay que
 * distinguirlo explícitamente de "no se pudo importar" o de un falso verde
 * por comparar dos arrays vacíos sin querer: por eso cada módulo de la
 * lista `SOLO_TIPOS` tiene su propio caso que lo deja dicho, y los demás
 * tienen un caso que exige al menos un export en runtime.
 *
 * Nota sobre el paralelismo (ronda 22-b): la tarea 22-a crea
 * `packages/core/src/**` en paralelo a este archivo. Si corrés esto antes
 * de que 22-a termine, los `import('@qps/core/...')` van a fallar con
 * "Cannot find module" — este archivo envuelve ese error para que el
 * mensaje diga explícitamente qué módulo falta, en vez de un stack de
 * resolución de Vite.
 */
import { describe, expect, it } from 'vitest'

interface ModuleSpec {
  /** Nombre del caso (coincide con la ruta relativa dentro de lib/ y core/). */
  name: string
  /** Specifier de import del módulo viejo. */
  old: string
  /** Specifier de import del módulo en @qps/core. */
  core: string
}

const MODULE_PATHS = [
  'types',
  'date-format',
  'event-display',
  'events/vigencia',
  'events/occurrences-summary',
  'events/merged',
  'home/types',
  'home/carousel',
  'home/transform',
  'home/filters',
  'radar/cadence',
  'scraper/dedup-key',
  'instagram-config',
  // R25, tarea 25-a: 3 módulos más movidos con el mismo patrón.
  'events/public-select',
  'images/variants',
  'auth/mensajes',
  // R26, tarea 26-a: metricas/links, movido con el mismo patrón.
  'metricas/links',
] as const

const MODULES: ModuleSpec[] = MODULE_PATHS.map((name) => ({
  name,
  old: `@/lib/${name}`,
  core: `@qps/core/${name}`,
}))

// Módulos de la lista que, a propósito, solo exportan tipos: en runtime su
// namespace queda vacío en los dos lados. Si algún día uno de estos pasa a
// tener también un export de runtime, hay que sacarlo de esta lista (y el
// caso "tiene al menos un export en runtime" de más abajo lo va a exigir).
const SOLO_TIPOS = new Set<string>(['home/types'])

async function importModuleOrFail(specifier: string, context: string): Promise<Record<string, unknown>> {
  try {
    return (await import(/* @vite-ignore */ specifier)) as Record<string, unknown>
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`No se pudo importar "${specifier}" (${context}): ${reason}`)
  }
}

describe('equivalencia lib/ viejo vs @qps/core (los 13 módulos de R22 + los 3 de R25 + metricas/links de R26)', () => {
  for (const mod of MODULES) {
    describe(mod.name, () => {
      it('expone las mismas claves en runtime en @/lib y en @qps/core', async () => {
        const oldModule = await importModuleOrFail(mod.old, 'módulo viejo en apps/web/lib')
        const coreModule = await importModuleOrFail(
          mod.core,
          'módulo en packages/core/src — ¿todavía no lo creó la tarea 22-a?',
        )
        expect(Object.keys(coreModule).sort()).toEqual(Object.keys(oldModule).sort())
      })

      if (SOLO_TIPOS.has(mod.name)) {
        it('caso "solo tipos": ninguno de los dos expone nada en runtime (explícito, no un falso verde)', async () => {
          const oldModule = await importModuleOrFail(mod.old, 'módulo viejo en apps/web/lib')
          const coreModule = await importModuleOrFail(mod.core, 'módulo en packages/core/src')
          expect(Object.keys(oldModule)).toEqual([])
          expect(Object.keys(coreModule)).toEqual([])
        })
      } else {
        it('tiene al menos un export en runtime (si esto da 0, no es un módulo "solo tipos")', async () => {
          const oldModule = await importModuleOrFail(mod.old, 'módulo viejo en apps/web/lib')
          expect(Object.keys(oldModule).length).toBeGreaterThan(0)
        })

        it('cada export es la misma referencia (mismo módulo, no una copia con la misma lógica)', async () => {
          const oldModule = await importModuleOrFail(mod.old, 'módulo viejo en apps/web/lib')
          const coreModule = await importModuleOrFail(mod.core, 'módulo en packages/core/src')
          for (const key of Object.keys(oldModule)) {
            expect(
              coreModule[key],
              `la clave "${key}" de "${mod.old}" no es la misma referencia que en "${mod.core}": parece una copia, no un re-export`,
            ).toBe(oldModule[key])
          }
        })
      }
    })
  }
})
