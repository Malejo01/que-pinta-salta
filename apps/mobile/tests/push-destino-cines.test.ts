// Ronda 70, tarea 70-b (tests 70-q): el aviso del equipo con destino Cines.
// `interpretarRespuestaPush` (lib/push/tap.ts, puro) decide `abrir-cines` solo
// con `data.destino === 'cines'` EXACTO. `data` es un dato externo y no
// confiable (lo puede mandar cualquiera con el token de otra persona), así que
// el contrato es estricto: nada de mayúsculas, espacios ni arrays; el evento
// válido gana; un aviso patrocinado jamás abre Cines.
//
// Incluye el contrato servidor <-> app: lo que arma `datosPushAvisoEquipo`
// (core) es justo lo que la app sabe abrir.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { datosPushAvisoEquipo, DESTINO_CINES as DESTINO_CINES_CORE } from '@qps/core/notificaciones/equipo'
import { ACCION_BAJA_PATROCINADOS, CATEGORIA_PATROCINADO } from '@qps/core/notificaciones/patrocinados'
import { urlEvento } from '@qps/core/metricas/links'
import { DESTINO_CINES, interpretarRespuestaPush, type RespuestaPushMinima } from '../lib/push/tap'

const UUID = '0b9d4f5a-6a2b-4c1e-8f3d-9a7b6c5d4e3f'

function respuesta(
  data: unknown,
  extra: { actionIdentifier?: string; categoryIdentifier?: string | null } = {},
): RespuestaPushMinima {
  return {
    ...(extra.actionIdentifier ? { actionIdentifier: extra.actionIdentifier } : {}),
    notification: {
      request: {
        identifier: 'notif-de-prueba',
        content: { data, ...(extra.categoryIdentifier !== undefined ? { categoryIdentifier: extra.categoryIdentifier } : {}) },
      },
    },
  }
}

describe('el valor del destino', () => {
  it('es "cines" y la app usa el mismo valor que el servidor (core es la fuente única)', () => {
    expect(DESTINO_CINES).toBe('cines')
    expect(DESTINO_CINES_CORE).toBe('cines')
    expect(DESTINO_CINES).toBe(DESTINO_CINES_CORE)
  })
})

describe('data.destino === "cines" abre Cines', () => {
  it('{ destino: "cines" }: abrir-cines (y nada más que la acción: ninguna ruta ni url del push)', () => {
    expect(interpretarRespuestaPush(respuesta({ destino: 'cines' }))).toEqual({ accion: 'abrir-cines' })
  })

  it('con campos de más que no son un evento ni patrocinado: igual abrir-cines', () => {
    expect(interpretarRespuestaPush(respuesta({ destino: 'cines', otro: 1, tipo: 'novedad' }))).toEqual({ accion: 'abrir-cines' })
  })

  it('con una url de OTRO host al lado: abrir-cines y la url ajena no se usa', () => {
    const r = interpretarRespuestaPush(respuesta({ destino: 'cines', url: 'https://evil.example/evento/' + UUID }))
    expect(r).toEqual({ accion: 'abrir-cines' })
  })

  it('con una url javascript: al lado: abrir-cines', () => {
    expect(interpretarRespuestaPush(respuesta({ destino: 'cines', url: 'javascript:alert(1)' }))).toEqual({ accion: 'abrir-cines' })
  })

  it('con actionIdentifier de un tap común (por defecto de Expo): abrir-cines', () => {
    const r = interpretarRespuestaPush(respuesta({ destino: 'cines' }, { actionIdentifier: 'expo.modules.notifications.actions.DEFAULT' }))
    expect(r).toEqual({ accion: 'abrir-cines' })
  })
})

describe('el evento válido tiene precedencia sobre Cines', () => {
  it('url de evento + destino cines: abrir el evento', () => {
    const r = interpretarRespuestaPush(respuesta({ destino: 'cines', url: urlEvento(UUID, 'app') }))
    expect(r).toEqual({ accion: 'abrir', id: UUID, patrocinado: false })
  })

  it('eventId válido + destino cines: abrir el evento', () => {
    const r = interpretarRespuestaPush(respuesta({ destino: 'cines', eventId: UUID }))
    expect(r).toEqual({ accion: 'abrir', id: UUID, patrocinado: false })
  })

  it('url inválida + eventId válido + destino cines: gana el evento', () => {
    const r = interpretarRespuestaPush(respuesta({ destino: 'cines', url: 'https://evil.example/x', eventId: UUID.toUpperCase() }))
    expect(r).toEqual({ accion: 'abrir', id: UUID, patrocinado: false })
  })

  it('evento inválido + destino cines: sin evento que ganar, abre Cines', () => {
    expect(interpretarRespuestaPush(respuesta({ destino: 'cines', eventId: 'no-es-uuid', url: 'x' }))).toEqual({ accion: 'abrir-cines' })
  })
})

describe('cualquier otra cosa NO abre Cines', () => {
  it.each([
    ['"Cines" con mayúscula', 'Cines'],
    ['"CINES"', 'CINES'],
    ['" cines" con espacio delante', ' cines'],
    ['"cines " con espacio detrás', 'cines '],
    ['"cines\\n"', 'cines\n'],
    ['"cine" (singular)', 'cine'],
    ['"/cines" (una ruta)', '/cines'],
    ['"cines/1"', 'cines/1'],
    ['"cinesx"', 'cinesx'],
    ['vacío', ''],
    ['un array ["cines"]', ['cines']],
    ['un objeto { valor: "cines" }', { valor: 'cines' }],
    ['true', true],
    ['1', 1],
    ['null', null],
    ['undefined', undefined],
  ])('destino %s: nada', (_nombre, destino) => {
    expect(interpretarRespuestaPush(respuesta({ destino }))).toEqual({ accion: 'nada' })
  })

  it('sin destino y sin evento: nada', () => {
    expect(interpretarRespuestaPush(respuesta({}))).toEqual({ accion: 'nada' })
  })

  it('el destino fuera de data (en la raíz de la respuesta o en el content) no cuenta', () => {
    const r = { actionIdentifier: 'cines', destino: 'cines', notification: { request: { identifier: 'x', destino: 'cines', content: { destino: 'cines', data: {} } } } }
    expect(interpretarRespuestaPush(r as unknown as RespuestaPushMinima)).toEqual({ accion: 'nada' })
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['un string "cines"', 'cines'],
    ['un número', 42],
    ['un array con el objeto', [{ destino: 'cines' }]],
    ['un array vacío', []],
  ])('data %s (no es un objeto plano): nada', (_n, data) => {
    expect(interpretarRespuestaPush(respuesta(data))).toEqual({ accion: 'nada' })
  })

  it('sin content en la notificación: nada, sin tirar', () => {
    expect(interpretarRespuestaPush({ notification: { request: { identifier: 'x' } } })).toEqual({ accion: 'nada' })
  })
})

describe('un aviso patrocinado jamás abre Cines', () => {
  it('por categoría de notificación patrocinada + destino cines: nada', () => {
    const r = interpretarRespuestaPush(respuesta({ destino: 'cines' }, { categoryIdentifier: CATEGORIA_PATROCINADO }))
    expect(r).toEqual({ accion: 'nada' })
  })

  it('por data.tipo === "patrocinado" (si la categoría no llegó a registrarse) + destino cines: nada', () => {
    expect(interpretarRespuestaPush(respuesta({ destino: 'cines', tipo: CATEGORIA_PATROCINADO }))).toEqual({ accion: 'nada' })
  })

  it('los dos a la vez + destino cines: nada', () => {
    const r = interpretarRespuestaPush(respuesta({ destino: 'cines', tipo: 'patrocinado' }, { categoryIdentifier: 'patrocinado' }))
    expect(r).toEqual({ accion: 'nada' })
  })

  it('el botón de baja rápida en un patrocinado con destino cines: baja, no Cines', () => {
    const r = interpretarRespuestaPush(
      respuesta({ destino: 'cines', tipo: 'patrocinado' }, { actionIdentifier: ACCION_BAJA_PATROCINADOS, categoryIdentifier: 'patrocinado' }),
    )
    expect(r).toEqual({ accion: 'baja-patrocinados' })
  })

  it('el mismo botón en un aviso que NO es patrocinado se trata como un tap común: abre Cines', () => {
    const r = interpretarRespuestaPush(respuesta({ destino: 'cines' }, { actionIdentifier: ACCION_BAJA_PATROCINADOS }))
    expect(r).toEqual({ accion: 'abrir-cines' })
  })

  it('un patrocinado con evento válido sigue abriendo el evento con patrocinado: true (no se rompió por Cines)', () => {
    const r = interpretarRespuestaPush(respuesta({ url: urlEvento(UUID, 'app'), tipo: CATEGORIA_PATROCINADO, destino: 'cines' }, { categoryIdentifier: 'patrocinado' }))
    expect(r).toEqual({ accion: 'abrir', id: UUID, patrocinado: true })
  })

  it('tipo "Patrocinado" con mayúscula NO es patrocinado (comparación exacta, documentado): con destino cines abre Cines', () => {
    expect(interpretarRespuestaPush(respuesta({ destino: 'cines', tipo: 'Patrocinado' }))).toEqual({ accion: 'abrir-cines' })
  })
})

describe('contrato servidor <-> app: lo que arma el aviso del equipo es lo que la app abre', () => {
  it('destino cines del servidor -> abrir-cines', () => {
    const data = datosPushAvisoEquipo({ tipo: 'cines' })
    expect(interpretarRespuestaPush(respuesta(data))).toEqual({ accion: 'abrir-cines' })
  })

  it('destino evento del servidor -> abrir ese evento, sin marca de patrocinado', () => {
    const data = datosPushAvisoEquipo({ tipo: 'evento', eventId: UUID })
    expect(interpretarRespuestaPush(respuesta(data))).toEqual({ accion: 'abrir', id: UUID, patrocinado: false })
  })

  it('destino inicio del servidor (sin data) -> nada: solo abre la app', () => {
    const data = datosPushAvisoEquipo({ tipo: 'inicio' })
    expect(data).toBeUndefined()
    expect(interpretarRespuestaPush(respuesta(data))).toEqual({ accion: 'nada' })
  })

  it('el aviso del equipo nunca cae en la rama de baja de patrocinados, ni siquiera con ese botón', () => {
    for (const destino of [{ tipo: 'cines' }, { tipo: 'evento', eventId: UUID }] as const) {
      const r = interpretarRespuestaPush(respuesta(datosPushAvisoEquipo(destino), { actionIdentifier: ACCION_BAJA_PATROCINADOS }))
      expect(r.accion).not.toBe('baja-patrocinados')
    }
  })
})

describe('ManejadorTapPush: la ruta de Cines es un literal fijo', () => {
  const src = readFileSync(fileURLToPath(new URL('../components/ManejadorTapPush.tsx', import.meta.url)), 'utf8')

  it('para "abrir-cines" navega con router.push("/cines") literal, sin nada del push', () => {
    const bloque = src.slice(src.indexOf("resultado.accion === 'abrir-cines'"))
    expect(bloque.slice(0, 400)).toMatch(/router\.push\('\/cines'\)/)
  })

  it('la ruta existe en la app (app/cines/index.tsx o app/cines.tsx)', async () => {
    const { existsSync } = await import('node:fs')
    const base = fileURLToPath(new URL('../app/', import.meta.url))
    expect(existsSync(`${base}cines.tsx`) || existsSync(`${base}cines/index.tsx`) || existsSync(`${base}(tabs)/cines.tsx`)).toBe(true)
  })
})
