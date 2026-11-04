// Q6-4 · Banco de evaluación de IA: los fixtures versionados de
// docs/evaluacion-ia pasan la validación y NO tienen datos personales.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  buscarEmails,
  buscarMenciones,
  buscarTelefonos,
  datosPersonalesEnFixture,
  detectarDatosPersonales,
} from '@/lib/ia/evaluacion/datos-personales'
import { CATEGORIAS, validarFixtureClasificacion, validarFixtureFlyers, validarFixtureTraduccion } from '@/lib/ia/evaluacion/fixtures'

const DIR = join(process.cwd(), '..', '..', 'docs', 'evaluacion-ia')
const leer = (archivo: string) => JSON.parse(readFileSync(join(DIR, archivo), 'utf8')) as Record<string, unknown> & { casos: Array<Record<string, unknown>> }

describe('detector de datos personales', () => {
  it('encuentra emails', () => {
    expect(buscarEmails('escribinos a reservas.salta@gmail.com o a info@lugar.com.ar')).toEqual(['reservas.salta@gmail.com', 'info@lugar.com.ar'])
  })
  it.each([
    '387 4123456',
    '0387 154123456',
    '+54 9 387 412-3456',
    '(0387) 421-5678',
    '3874123456',
    '387-412-3456',
    '421-5678',
  ])('encuentra el teléfono %s', (tel) => {
    expect(buscarTelefonos(`Reservas: ${tel} (WhatsApp)`)).toEqual([tel])
  })
  it.each([
    'Entrada $18.000',
    'Preventa $10.000 y $1.500.000',
    'Fecha: 2026-10-31',
    'Sábado 17/10/26',
    '2x1 de 02:00 a 03:00',
    'Av. Kennedy km 2.5',
    'Alberdi 1107',
    'Jujuy 913',
    'Del 6 al 14 de agosto',
    'TC 2000 EN SALTA 2026',
    'Gordillo 20 Años + 1',
    'Caseros 646 Local 7',
  ])('no confunde «%s» con un teléfono', (texto) => {
    expect(buscarTelefonos(texto)).toEqual([])
  })
  it('las @menciones, salvo las cuentas públicas y los reemplazos @[cuenta]', () => {
    const texto = 'Con @dj.persona_123 y @lametrosalta en @[cuenta]. Escribí a hola@lugar.com.'
    expect(buscarMenciones(texto)).toEqual(['dj.persona_123', 'lametrosalta'])
    expect(detectarDatosPersonales(texto, ['lametrosalta'])).toEqual([
      { tipo: 'email', valor: 'hola@lugar.com' },
      { tipo: 'mencion', valor: '@dj.persona_123' },
    ])
  })
  it('recorre el JSON con la ruta y no mira ids ni URLs de storage', () => {
    const json = {
      casos: [
        {
          id: 'x',
          origen: { tabla: 'events', id: '1234567890123' },
          imagen_url: 'https://x.supabase.co/storage/v1/object/public/flyers_ig/a/4013639938138879872.jpg',
          caption: 'Reservas 387 4123456',
        },
      ],
    }
    expect(datosPersonalesEnFixture(json)).toEqual([{ tipo: 'telefono', valor: '387 4123456', ruta: '$.casos[0].caption' }])
  })
})

describe.each([
  ['flyers.json', validarFixtureFlyers, 30],
  ['traduccion.json', validarFixtureTraduccion, 30],
  ['clasificacion.json', validarFixtureClasificacion, 30],
] as const)('fixture %s', (archivo, validar, minimo) => {
  const json = leer(archivo)

  it('pasa la validación (forma, campos y formatos)', () => {
    expect(validar(json).problemas).toEqual([])
  })

  it(`tiene al menos ${minimo} casos`, () => {
    expect(json.casos.length).toBeGreaterThanOrEqual(minimo)
  })

  it('no tiene emails ni teléfonos (falla si alguien agrega uno)', () => {
    const hallazgos = datosPersonalesEnFixture(json.casos).filter((h) => h.tipo !== 'mencion')
    expect(hallazgos).toEqual([])
  })

  it('las @menciones son solo de cuentas públicas', () => {
    const publicas = (json.cuentas_publicas as string[] | undefined) ?? []
    expect(datosPersonalesEnFixture(json.casos, publicas)).toEqual([])
  })

  it('un email o un teléfono metido en un caso hace fallar la validación', () => {
    const copia = structuredClone(json)
    const caso = copia.casos[0]
    const campo = 'caption' in caso ? 'caption' : 'descripcion'
    caso[campo] = `${String(caso[campo] ?? '')} Consultas: alguien@gmail.com o 387 4123456`
    const problemas = validar(copia).problemas
    expect(problemas.some((p) => p.includes('(email)'))).toBe(true)
    expect(problemas.some((p) => p.includes('(telefono)'))).toBe(true)
  })
})

describe('reglas propias de cada fixture', () => {
  it('flyers: todas las imágenes marcadas «no-descargada» guardan la URL pública de storage', () => {
    for (const c of leer('flyers.json').casos) {
      if (c.imagen === 'no-descargada') expect(String(c.imagen_url)).toMatch(/^https:\/\/splzietmyydqhmdxijcn\.supabase\.co\/storage\/v1\/object\/public\/flyers_ig\//)
    }
  })
  it('flyers: una hora 00:00 esperada es error (00:00 = sin hora → null)', () => {
    const json = leer('flyers.json')
    ;(json.casos[0].esperado as Record<string, unknown>).hora = '00:00'
    expect(validarFixtureFlyers(json).problemas.join(' ')).toMatch(/00:00/)
  })
  it('traducción: las referencias escritas por el agente están marcadas como tales', () => {
    for (const c of leer('traduccion.json').casos) expect(['agente', 'revisada']).toContain(c.referencia)
  })
  it('clasificación: las categorías son las del catálogo y las del prompt del flyer', () => {
    const json = leer('clasificacion.json')
    expect([...(json.categorias as string[])].sort()).toEqual([...CATEGORIAS].sort())
    // VALID_CATEGORIES no se exporta: se lee del fuente de llamadas-ia.ts.
    const fuente = readFileSync(join(process.cwd(), 'lib', 'ai', 'llamadas-ia.ts'), 'utf8')
    const desde = fuente.indexOf('= [', fuente.indexOf('const VALID_CATEGORIES'))
    const bloque = fuente.slice(desde, fuente.indexOf('\n]', desde))
    const delPrompt = [...bloque.matchAll(/'([a-z]+)'/g)].map((m) => m[1])
    expect([...CATEGORIAS].sort()).toEqual(delPrompt.sort())
  })
  it('un fixture roto da problemas claros', () => {
    expect(validarFixtureFlyers(null).problemas).toEqual(['no es un objeto JSON'])
    expect(validarFixtureTraduccion({ version: 2, uso: 'flyers', casos: [] }).problemas).toEqual(
      expect.arrayContaining(['version tiene que ser 1', 'uso tiene que ser «traduccion»', 'casos tiene que ser una lista no vacía']),
    )
    const json = leer('clasificacion.json')
    json.casos.push({ ...json.casos[0] })
    expect(validarFixtureClasificacion(json).problemas.join(' ')).toMatch(/id repetido/)
  })
})
