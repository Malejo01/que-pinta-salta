/**
 * tests/anunciantes/publicita.test.ts (R50): verifica que `/anunciantes`
 * ("Publicitá tu evento") muestra el tarifario final de
 * `@qps/core/publicidad/precios` (Mauro, 19/10 16:10), que no queda ningún
 * pendiente a la vista, y que el mail de contacto sale de `CONTACTO_EMAIL`
 * (`@qps/core/contacto`), nunca de un literal repetido en la página.
 *
 * Igual que `tests/asistencia/sin-me-interesa.test.ts`, `page.tsx` se lee
 * como texto (no se importa el módulo): así no hace falta levantar ningún
 * cliente de Supabase ni nada "vivo" para probar prosa y estructura.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ANUNCIANTES } from '@/lib/config/anunciantes'
import {
  PIE_TARIFARIO,
  TARIFARIO,
  textoPrecioFundador,
  textoPrecioLista,
  textoUsdAprox,
} from '@qps/core/publicidad/precios'

// apps/web/tests/anunciantes -> apps/web/tests -> apps/web -> apps -> raíz del worktree
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

const RUTA_PAGINA = 'apps/web/app/anunciantes/page.tsx'
const RUTA_CONFIG = 'apps/web/lib/config/anunciantes.ts'
const RUTA_PRECIOS = 'packages/core/src/publicidad/precios.ts'

function leer(rutaRelativa: string): string {
  return readFileSync(ROOT + rutaRelativa, 'utf8')
}

const paginaFuente = leer(RUTA_PAGINA)
const configFuente = leer(RUTA_CONFIG)
const preciosFuente = leer(RUTA_PRECIOS)

describe('/anunciantes: mail de contacto desde CONTACTO_EMAIL, nunca un literal', () => {
  it('importa mailtoContacto y CONTACTO_EMAIL de @qps/core/contacto', () => {
    expect(paginaFuente).toMatch(/import\s*\{[^}]*mailtoContacto[^}]*\}\s*from\s*["']@qps\/core\/contacto["']/)
    expect(paginaFuente).toMatch(/import\s*\{[^}]*CONTACTO_EMAIL[^}]*\}\s*from\s*["']@qps\/core\/contacto["']/)
  })

  it('usa mailtoContacto para armar el link del botón de mail', () => {
    expect(paginaFuente).toMatch(/mailtoContacto\(/)
  })

  it('no contiene "@quepintasalta.com.ar" como literal (la única fuente es packages/core/src/contacto.ts)', () => {
    expect(paginaFuente).not.toContain('@quepintasalta.com.ar')
  })
})

describe('/anunciantes: título "Publicitá tu evento"', () => {
  it('el <h1> dice exactamente "Publicitá tu evento"', () => {
    const match = paginaFuente.match(/<h1[^>]*>([^<]*)<\/h1>/)
    expect(match).not.toBeNull()
    expect(match?.[1].trim()).toBe('Publicitá tu evento')
  })

  it('metadata.title incluye "Publicitá tu evento"', () => {
    const match = paginaFuente.match(/title:\s*["']([^"']*)["']/)
    expect(match).not.toBeNull()
    expect(match?.[1]).toContain('Publicitá tu evento')
  })
})

describe('/anunciantes: sin pendientes a la vista', () => {
  it.each([
    [RUTA_CONFIG, configFuente],
    [RUTA_PAGINA, paginaFuente],
    [RUTA_PRECIOS, preciosFuente],
  ])('%s no contiene "[COMPLETAR"', (_ruta, fuente) => {
    expect(fuente).not.toContain('[COMPLETAR')
  })

  it('ningún texto del tarifario ni el pie contiene "[COMPLETAR"', () => {
    for (const p of TARIFARIO) {
      const texto = `${p.nombre} ${p.queIncluye} ${textoPrecioLista(p.precio)} ${textoPrecioFundador(p.precio)}`
      expect(texto).not.toContain('[COMPLETAR')
    }
    expect(PIE_TARIFARIO).not.toContain('[COMPLETAR')
  })
})

describe('/anunciantes: publicada en true -> se indexa, y la lógica de noindex sigue', () => {
  it('ANUNCIANTES.publicada es true', () => {
    expect(ANUNCIANTES.publicada).toBe(true)
  })

  it('page.tsx condiciona robots a ANUNCIANTES.publicada (noindex si algún día vuelve a false)', () => {
    expect(paginaFuente).toMatch(
      /\.\.\.\(ANUNCIANTES\.publicada\s*\?\s*\{\}\s*:\s*\{\s*robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}\s*\}\)/,
    )
  })
})

describe('/anunciantes: el TARIFARIO es exactamente la "Tabla final" del estudio de precios', () => {
  const ESPERADO = [
    { id: 'basica', nombre: 'Publicación básica', lista: 'Gratis', fundador: 'Gratis', usd: null },
    { id: 'destacado-3', nombre: 'Destacado fin de semana (3 días)', lista: '$ 8.500', fundador: '$ 6.000', usd: 'USD 5,6' },
    { id: 'destacado-7', nombre: 'Destacado semana (7 días)', lista: '$ 14.000', fundador: '$ 10.000', usd: 'USD 9,2' },
    { id: 'destacado-14', nombre: 'Destacado hasta tu fecha (hasta 14 días)', lista: '$ 24.000', fundador: '$ 17.000', usd: 'USD 15,7' },
    { id: 'pack-lanzamiento', nombre: 'Pack Lanzamiento de Evento', lista: '$ 20.000', fundador: '$ 14.000', usd: 'USD 13,1' },
    { id: 'plan-mensual', nombre: 'Plan Mensual Organizador/Venue', lista: '$ 42.000/mes', fundador: '$ 29.500/mes', usd: 'USD 27,5' },
    { id: 'plan-rrpp', nombre: 'Plan RRPP', lista: '$ 14.500/mes', fundador: '$ 10.000/mes', usd: 'USD 9,5' },
    { id: 'push', nombre: 'Push patrocinado', lista: 'Próximamente', fundador: 'Reservá prioridad', usd: null },
  ]

  it('tiene 8 productos, en el orden de la tabla', () => {
    expect(TARIFARIO).toHaveLength(8)
    expect(TARIFARIO.map((p) => p.id)).toEqual(ESPERADO.map((e) => e.id))
    expect(TARIFARIO.map((p) => p.nombre)).toEqual(ESPERADO.map((e) => e.nombre))
  })

  it.each(ESPERADO)('$nombre: lista $lista, fundador $fundador, USD $usd', (e) => {
    const p = TARIFARIO.find((x) => x.id === e.id)!
    expect(textoPrecioLista(p.precio)).toBe(e.lista)
    expect(textoPrecioFundador(p.precio)).toBe(e.fundador)
    expect(textoUsdAprox(p.precio)).toBe(e.usd)
  })

  it('la publicación básica es gratis y el push es "Próximamente"', () => {
    expect(TARIFARIO[0].precio.tipo).toBe('gratis')
    expect(TARIFARIO[7].precio.tipo).toBe('proximamente')
  })

  it('solo los dos planes llevan periodo mensual', () => {
    const mensuales = TARIFARIO.filter((p) => p.precio.tipo === 'pesos' && p.precio.periodo === 'mes').map((p) => p.id)
    expect(mensuales).toEqual(['plan-mensual', 'plan-rrpp'])
  })

  it('el push se vende como producto "Próximamente" y el config ya no guarda paquetes ni el comentario viejo (R51)', () => {
    const push = TARIFARIO.find((p) => /push patrocinado/i.test(p.nombre))
    expect(push?.precio.tipo).toBe('proximamente')
    expect(textoPrecioLista(push!.precio)).toBe('Próximamente')
    expect(configFuente).not.toMatch(/Aviso patrocinado/)
    expect(configFuente).not.toMatch(/paquetes/)
  })

  it('los productos que incluyen push aclaran que es "cuando lance la app" / "con la app"', () => {
    expect(TARIFARIO.find((p) => p.id === 'pack-lanzamiento')!.queIncluye).toMatch(/cuando lance la app/)
    expect(TARIFARIO.find((p) => p.id === 'plan-mensual')!.queIncluye).toMatch(/con la app/)
  })
})

describe('/anunciantes: la página usa el tarifario de core y los botones de contacto', () => {
  it('el respaldo sigue saliendo de @qps/core/publicidad/precios', () => {
    expect(paginaFuente).toMatch(/import\s*\{[^}]*\bTARIFARIO\b[^}]*\}\s*from\s*["']@qps\/core\/publicidad\/precios["']/)
    expect(paginaFuente).toMatch(/import\s*\{[^}]*\bPIE_TARIFARIO\b[^}]*\}\s*from\s*["']@qps\/core\/publicidad\/precios["']/)
  })

  it('usa cargarTarifarioVigente, recorre los productos y muestra el pie y la vigencia que arma', () => {
    expect(paginaFuente).toMatch(/import\s*\{[^}]*\bcargarTarifarioVigente\b[^}]*\}\s*from\s*["']@\/lib\/anunciantes\/precios["']/)
    expect(paginaFuente).toMatch(/cargarTarifarioVigente\(\s*createAdminClient\(\)/)
    expect(paginaFuente).toMatch(/\.productos\.map\(/)
    expect(paginaFuente).not.toMatch(/\bTARIFARIO\.map\(/)
    expect(paginaFuente).toMatch(/\{tarifario\.pie\}/)
    expect(paginaFuente).toMatch(/\{tarifario\.vigencia\}/)
  })

  it('la página sigue siendo ISR: sin cookies() ni cliente de sesión', () => {
    expect(paginaFuente).toContain('export const revalidate = 3600')
    const sinComentarios = paginaFuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(sinComentarios).not.toMatch(/\bcookies\(/)
    expect(sinComentarios).not.toMatch(/\bcreateClient\(/)
  })

  it('no repite montos en pesos como literal: salen todos de core', () => {
    expect(paginaFuente).not.toMatch(/\$\s*\d/)
  })

  it('mantiene el botón de WhatsApp (whatsappUrl) y el de mail', () => {
    expect(paginaFuente).toMatch(/import\s*\{[^}]*whatsappUrl[^}]*\}\s*from\s*["']@\/lib\/contacto["']/)
    expect(paginaFuente).toMatch(/whatsappUrl\(/)
    expect(paginaFuente).toContain('Hablar por WhatsApp')
    expect(paginaFuente).toContain('Escribinos por mail')
  })
})

describe('/anunciantes: precios finales, sin IVA aparte', () => {
  it.each([
    [RUTA_PAGINA, paginaFuente],
    [RUTA_CONFIG, configFuente],
    [RUTA_PRECIOS, preciosFuente],
  ])('%s: la única mención de IVA es "no se les suma IVA"', (_ruta, fuente) => {
    const sinPermitido = fuente.replace(/no se les suma IVA/g, '')
    expect(sinPermitido).not.toMatch(/\bIVA\b/i)
  })

  it('la página avisa que los precios son finales', () => {
    expect(paginaFuente).toContain('Precios finales: no se les suma IVA')
  })

  it('ningún texto del tarifario ni del pie habla de IVA', () => {
    const todo = [PIE_TARIFARIO, ...TARIFARIO.flatMap((p) => [p.nombre, p.queIncluye])].join(' ')
    expect(todo).not.toMatch(/\bIVA\b/i)
  })
})

describe('/anunciantes: "Cómo funciona" (3 pasos)', () => {
  it('tiene el título de la sección', () => {
    expect(paginaFuente).toContain('Cómo funciona')
  })

  it('menciona elegir el paquete y la fecha, el pago por transferencia o Mercado Pago, y que vence solo', () => {
    expect(paginaFuente).toMatch(/elegís el paquete y la fecha/i)
    expect(paginaFuente).toMatch(/transferencia o Mercado Pago/i)
    expect(paginaFuente).toMatch(/vence solo/i)
  })
})
