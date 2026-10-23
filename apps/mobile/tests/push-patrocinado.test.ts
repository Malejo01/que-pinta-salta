// Ronda 51, tarea 51-e: el botón de baja rápida en el aviso push patrocinado
// mismo (`lib/push/categorias.ts`), qué hacer con una respuesta de push que
// puede traer ese botón (`interpretarRespuestaPush`, `lib/push/tap.ts`), y
// dos detectores de solo lectura sobre `components/ManejadorTapPush.tsx` y
// `components/AvisoPatrocinado.tsx` (mismo estilo que `tests/push-tap.test.ts`:
// fixtures en memoria primero, el archivo real después).
//
// `data` sigue siendo un dato externo y no confiable (ver el comentario de
// cabecera de `lib/push/tap.ts`): ninguno de los fixtures de abajo asume su
// forma, y las comparaciones de "patrocinado" son siempre con `===` contra
// el string exacto.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ACCION_BAJA_PATROCINADOS, CATEGORIA_PATROCINADO, TEXTO_BOTON_BAJA } from '@qps/core/notificaciones/patrocinados'
import { decidirBajaPatrocinados, interpretarRespuestaPush, type RespuestaPushMinima } from '../lib/push/tap'

const UUID = '0b9d4f5a-6a2b-4c1e-8f3d-9a7b6c5d4e3f'

// El identificador por defecto de Expo para un tap común (no un botón de
// acción), copiado de `expo-notifications` (`DEFAULT_ACTION_IDENTIFIER`)
// para no depender de importar el módulo nativo en un test puro.
const TAP_COMUN = 'expo.modules.notifications.actions.DEFAULT'

function respuesta(opts: {
  actionIdentifier?: string
  identifier?: string
  categoryIdentifier?: string | null
  data?: unknown
}): RespuestaPushMinima {
  return {
    actionIdentifier: opts.actionIdentifier,
    notification: {
      request: {
        identifier: opts.identifier ?? 'notif-1',
        content: {
          categoryIdentifier: opts.categoryIdentifier ?? null,
          data: opts.data,
        },
      },
    },
  }
}

// ---------------------------------------------------------------------------
// interpretarRespuestaPush
// ---------------------------------------------------------------------------
describe('interpretarRespuestaPush', () => {
  it('el botón de baja en un aviso patrocinado (categoryIdentifier) → baja-patrocinados', () => {
    const r = respuesta({ actionIdentifier: ACCION_BAJA_PATROCINADOS, categoryIdentifier: CATEGORIA_PATROCINADO })
    expect(interpretarRespuestaPush(r)).toEqual({ accion: 'baja-patrocinados' })
  })

  it('el botón de baja señalado por data.tipo (si la categoría no llegó a registrarse) → baja-patrocinados', () => {
    const r = respuesta({ actionIdentifier: ACCION_BAJA_PATROCINADOS, data: { tipo: CATEGORIA_PATROCINADO, eventId: UUID } })
    expect(interpretarRespuestaPush(r)).toEqual({ accion: 'baja-patrocinados' })
  })

  it('el botón de baja en un aviso que NO es patrocinado: no activa la baja, cae a eventoIdDesdeDatosPush (abre si hay id)', () => {
    const r = respuesta({ actionIdentifier: ACCION_BAJA_PATROCINADOS, categoryIdentifier: null, data: { eventId: UUID } })
    expect(interpretarRespuestaPush(r)).toEqual({ accion: 'abrir', id: UUID, patrocinado: false })
  })

  it('el botón de baja en un aviso que NO es patrocinado y sin ningún id → nada', () => {
    const r = respuesta({ actionIdentifier: ACCION_BAJA_PATROCINADOS })
    expect(interpretarRespuestaPush(r)).toEqual({ accion: 'nada' })
  })

  it('el tap (el favorito, aviso patrocinado) → abrir con patrocinado: true', () => {
    const r = respuesta({ actionIdentifier: TAP_COMUN, data: { eventId: UUID, tipo: CATEGORIA_PATROCINADO } })
    expect(interpretarRespuestaPush(r)).toEqual({ accion: 'abrir', id: UUID, patrocinado: true })
  })

  it('el tap de un aviso normal (favorito, sin tipo patrocinado) → abrir con patrocinado: false', () => {
    const r = respuesta({ actionIdentifier: TAP_COMUN, data: { eventId: UUID } })
    expect(interpretarRespuestaPush(r)).toEqual({ accion: 'abrir', id: UUID, patrocinado: false })
  })

  it('un actionIdentifier desconocido (ni el de baja ni el tap por defecto), con un id válido → abrir igual', () => {
    const r = respuesta({ actionIdentifier: 'algun-otro-boton', data: { eventId: UUID } })
    expect(interpretarRespuestaPush(r)).toEqual({ accion: 'abrir', id: UUID, patrocinado: false })
  })

  it('un actionIdentifier desconocido sin ningún id válido → nada', () => {
    const r = respuesta({ actionIdentifier: 'algun-otro-boton' })
    expect(interpretarRespuestaPush(r)).toEqual({ accion: 'nada' })
  })

  it.each([
    ['con mayúscula: "Patrocinado"', 'Patrocinado'],
    ['dentro de un array: ["patrocinado"]', ['patrocinado']],
    ['con un espacio de más: "patrocinado "', 'patrocinado '],
  ])('data.tipo raro (%s) en el tap no cuenta como patrocinado (comparación exacta)', (_nombre, tipoRaro) => {
    const r = respuesta({ actionIdentifier: TAP_COMUN, data: { eventId: UUID, tipo: tipoRaro } })
    expect(interpretarRespuestaPush(r)).toEqual({ accion: 'abrir', id: UUID, patrocinado: false })
  })

  it.each([
    ['con mayúscula: "Patrocinado"', 'Patrocinado'],
    ['dentro de un array: ["patrocinado"]', ['patrocinado']],
    ['con un espacio de más: "patrocinado "', 'patrocinado '],
  ])('data.tipo raro (%s) + el botón de baja: NO activa la baja (no es, exactamente, la categoría)', (_nombre, tipoRaro) => {
    const r = respuesta({ actionIdentifier: ACCION_BAJA_PATROCINADOS, data: { eventId: UUID, tipo: tipoRaro } })
    expect(interpretarRespuestaPush(r)).toEqual({ accion: 'abrir', id: UUID, patrocinado: false })
  })

  it('un data.url de otro host → nada (eventoIdDesdeDatosPush ya lo filtra, nunca se "abre" algo externo)', () => {
    const r = respuesta({ actionIdentifier: TAP_COMUN, data: { url: `https://evil.example/evento/${UUID}` } })
    expect(interpretarRespuestaPush(r)).toEqual({ accion: 'nada' })
  })
})

// ---------------------------------------------------------------------------
// decidirBajaPatrocinados (vuelta 1 de revisión de 51-e): el bug real era
// que, en un arranque en frío, la respuesta del botón de baja puede llegar
// ANTES de que `lib/session/index.tsx` resuelva `getSession()` — en ese
// instante `userId` es `null` pero NO porque falte sesión, sino porque
// todavía no se sabe. Tratar eso como "sin sesión" le mentía a quien sí
// tiene cuenta (avisaba "Entrá a tu cuenta…") y, peor, la preferencia nunca
// se guardaba.
// ---------------------------------------------------------------------------
describe('decidirBajaPatrocinados', () => {
  it('con userId (haya o no terminado de cargar): guardar', () => {
    expect(decidirBajaPatrocinados({ userId: 'user-1', cargando: false })).toEqual({ accion: 'guardar', userId: 'user-1' })
    expect(decidirBajaPatrocinados({ userId: 'user-1', cargando: true })).toEqual({ accion: 'guardar', userId: 'user-1' })
  })

  it('arranque en frío: sin userId todavía Y cargando: true → esperar (NO es "sin sesión", todavía no se sabe)', () => {
    expect(decidirBajaPatrocinados({ userId: null, cargando: true })).toEqual({ accion: 'esperar' })
  })

  it('sin userId y la sesión ya terminó de cargar (cargando: false) → pedir-sesion (ahí sí no hay cuenta)', () => {
    expect(decidirBajaPatrocinados({ userId: null, cargando: false })).toEqual({ accion: 'pedir-sesion' })
  })
})

// ---------------------------------------------------------------------------
// registrarCategoriasPush (lib/push/categorias.ts) — doble de
// expo-notifications, nunca el módulo real.
// ---------------------------------------------------------------------------
const estadoCategoria = vi.hoisted(() => ({
  error: null as unknown,
  llamadas: [] as unknown[][],
}))

vi.mock('expo-notifications', () => ({
  setNotificationCategoryAsync: vi.fn(async (...args: unknown[]) => {
    estadoCategoria.llamadas.push(args)
    if (estadoCategoria.error) throw estadoCategoria.error
    return undefined
  }),
}))

describe('registrarCategoriasPush', () => {
  afterEach(() => {
    estadoCategoria.error = null
    estadoCategoria.llamadas = []
  })

  it('registra CATEGORIA_PATROCINADO con la acción ACCION_BAJA_PATROCINADOS, el texto TEXTO_BOTON_BAJA y opensAppToForeground: true', async () => {
    const { registrarCategoriasPush } = await import('../lib/push/categorias')
    await registrarCategoriasPush()

    expect(estadoCategoria.llamadas).toHaveLength(1)
    const [identificador, acciones] = estadoCategoria.llamadas[0] as [
      string,
      { identifier: string; buttonTitle: string; options?: { opensAppToForeground?: boolean } }[],
    ]
    expect(identificador).toBe(CATEGORIA_PATROCINADO)
    expect(acciones).toHaveLength(1)
    expect(acciones[0].identifier).toBe(ACCION_BAJA_PATROCINADOS)
    expect(acciones[0].buttonTitle).toBe(TEXTO_BOTON_BAJA)
    expect(acciones[0].options?.opensAppToForeground).toBe(true)
  })

  it('no propaga si setNotificationCategoryAsync tira: el aviso igual llega, solo que sin el botón', async () => {
    estadoCategoria.error = new Error('no disponible en este entorno')
    const { registrarCategoriasPush } = await import('../lib/push/categorias')
    await expect(registrarCategoriasPush()).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Detector: components/ManejadorTapPush.tsx — el userId sale de useSession(),
// la baja pasa por decidirBajaPatrocinados (con el estado de carga de la
// sesión, no solo `session`), y cambiarPatrocinados( nunca recibe nada que
// venga de `data`.
// ---------------------------------------------------------------------------
describe('components/ManejadorTapPush.tsx: el userId sale de la sesión, nunca del push', () => {
  const RUTA = fileURLToPath(new URL('../components/ManejadorTapPush.tsx', import.meta.url))
  const src = readFileSync(RUTA, 'utf8')

  it('usa useSession() y destructura cargando (no solo session)', () => {
    expect(src).toMatch(/const\s*\{\s*session\s*,\s*cargando\s*\}\s*=\s*useSession\(\)/)
  })

  it('llama a cambiarPatrocinados(decision.userId, false): el primer argumento sale de la decisión, no de data/respuesta/resultado', () => {
    const m = /cambiarPatrocinados\(\s*([^,]+),\s*false\s*\)/.exec(src)
    expect(m).not.toBeNull()
    const primerArgumento = m![1]
    expect(primerArgumento).toBe('decision.userId')
  })

  // Vuelta 1 de revisión de 51-e: el bug real era mirar solo `session` (que
  // en un arranque en frío todavía puede no estar resuelta) para decidir si
  // avisar "Entrá a tu cuenta…" — este detector se rompe si alguien vuelve a
  // esa forma, aunque compile y los demás tests de arriba sigan en verde.
  it('la baja se decide con decidirBajaPatrocinados, a partir de un estado que incluye cargando (no solo userId)', () => {
    expect(src).toMatch(/decidirBajaPatrocinados\(/)
    expect(src).toMatch(/estadoCuentaRef\.current\s*=\s*\{[^}]*\bcargando\b[^}]*\}/)
  })

  it('el aviso "Entrá a tu cuenta…" sale SOLO de la rama decision.accion === \'pedir-sesion\' (ya resuelta por decidirBajaPatrocinados), nunca de un chequeo directo de session/userId', () => {
    const m = /if\s*\(\s*decision\.accion\s*===\s*'pedir-sesion'\s*\)\s*\{([^}]*)\}/.exec(src)
    expect(m).not.toBeNull()
    expect(m![1]).toMatch(/avisar\(\s*'Entrá a tu cuenta para apagar los avisos patrocinados\.'\s*\)/)

    // Ese texto aparece una sola vez en todo el archivo: si alguien lo
    // duplicara en un `if (!session)`/`if (!userId)` directo (el bug
    // original), esta cuenta ya no daría 1.
    const ocurrencias = src.match(/Entrá a tu cuenta para apagar los avisos patrocinados\./g) ?? []
    expect(ocurrencias).toHaveLength(1)
  })

  it('la decisión "esperar" no avisa nada (no hay avisar( entre "esperar" y el siguiente return)', () => {
    const inicio = src.indexOf("decision.accion === 'esperar'")
    expect(inicio).toBeGreaterThan(-1)
    const fin = src.indexOf('return', inicio)
    expect(fin).toBeGreaterThan(inicio)
    expect(src.slice(inicio, fin + 'return'.length)).not.toMatch(/avisar\(/)
  })

  it('no navega (router.push) en la rama de "baja-patrocinados": ese bloque no contiene router.push', () => {
    const inicio = src.indexOf("resultado.accion === 'baja-patrocinados'")
    expect(inicio).toBeGreaterThan(-1)
    // El siguiente ancla relevante es el comentario de la última rama ("nada").
    const fin = src.indexOf("// 'nada'", inicio)
    expect(fin).toBeGreaterThan(inicio)
    const bloque = src.slice(inicio, fin)
    expect(bloque).not.toMatch(/router\s*\.\s*push/)
  })

  it('fixture de rotura: si cambiarPatrocinados recibiera algo del push directamente (sin pasar por "decision"), este detector SÍ lo encontraría', () => {
    const fixtureRoto = 'cambiarPatrocinados(resultado.id, false)'
    const m = /cambiarPatrocinados\(\s*([^,]+),\s*false\s*\)/.exec(fixtureRoto)
    expect(m![1]).not.toBe('decision.userId')
  })

  it('fixture de rotura: si decidirBajaPatrocinados desapareciera y se volviera a "if (!session)", este detector lo encontraría', () => {
    const fixtureRoto = "if (!session) {\n  avisar('Entrá a tu cuenta para apagar los avisos patrocinados.')\n}"
    expect(fixtureRoto).not.toMatch(/decidirBajaPatrocinados\(/)
  })
})

// ---------------------------------------------------------------------------
// Detector: components/AvisoPatrocinado.tsx — sin sesión, null.
// ---------------------------------------------------------------------------
describe('components/AvisoPatrocinado.tsx: sin sesión devuelve null', () => {
  const RUTA = fileURLToPath(new URL('../components/AvisoPatrocinado.tsx', import.meta.url))
  const src = readFileSync(RUTA, 'utf8')

  it('devuelve null sin sesión, antes de cualquier otra cosa', () => {
    expect(src).toMatch(/if\s*\(\s*!session\s*\)\s*return\s+null/)
  })

  it('usa useSession() y cambiarPatrocinados', () => {
    expect(src).toMatch(/\buseSession\s*\(\s*\)/)
    expect(src).toMatch(/\bcambiarPatrocinados\s*\(/)
  })

  it('el userId que manda a cambiarPatrocinados sale de session.user.id (nunca de otro identificador)', () => {
    const m = /const\s+userId\s*=\s*([^\n]+)/.exec(src)
    expect(m).not.toBeNull()
    expect(m![1]).toMatch(/session\.user\.id/)
    expect(src).toMatch(/cambiarPatrocinados\(\s*userId\s*,\s*false\s*\)/)
  })

  it('no importa nada de lib/push/tap (no tiene por qué leer el data de un push)', () => {
    expect(src).not.toMatch(/from\s+['"]@\/lib\/push\/tap['"]/)
  })

  it('fixture de rotura: un user_id que no sea session.user.id (este detector SÍ lo encontraría)', () => {
    const fixtureRoto = "const userId = otroId"
    expect(fixtureRoto).not.toMatch(/const\s+userId\s*=\s*[^\n]*session\.user\.id/)
  })
})
