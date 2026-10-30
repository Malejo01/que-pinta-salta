/**
 * R75-q (QPS-349): detectores de código fuente del panel de ubicar
 * (`components/admin/lugar-mapa-ubicar.tsx`). Sin red ni base; solo lee texto.
 * El comportamiento está en `tests/dom/r75-lugar-mapa-ubicar.dom.test.ts`.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))

function sinComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const codigo = sinComentarios(readFileSync(path.join(WEB_ROOT, 'components/admin/lugar-mapa-ubicar.tsx'), 'utf8'))

/** Desde `inicio` hasta el cierre de la llave que abre en la primera `{` posterior. */
function bloque(desde: string, abre = '{'): string {
  const i = codigo.indexOf(desde)
  expect(i, `no se encontró ${desde}`).toBeGreaterThanOrEqual(0)
  const a = codigo.indexOf(abre, i + desde.length - 1)
  let nivel = 0
  for (let k = a; k < codigo.length; k++) {
    if (codigo[k] === '{') nivel++
    else if (codigo[k] === '}' && --nivel === 0) return codigo.slice(a, k + 1)
  }
  throw new Error('llaves sin cerrar')
}

describe('lugar-mapa-ubicar: la pestaña llega por prop', () => {
  it('no importa useSearchParams ni usePathname', () => {
    expect(codigo).not.toContain('useSearchParams')
    expect(codigo).not.toContain('usePathname')
  })

  it('`ver` está en las props', () => {
    const props = codigo.slice(codigo.indexOf('interface LugarMapaUbicarProps'))
    expect(props.slice(0, props.indexOf('}'))).toMatch(/\bver:\s*string/)
    expect(codigo).toMatch(/function LugarMapaUbicar\(\{[^}]*\bver\b[^}]*\}/)
  })
})

describe('lugar-mapa-ubicar: resultados', () => {
  it('la key de los resultados no usa lat/lng', () => {
    const m = codigo.match(/<li\s+key=\{([^}]*(?:\}[^}]*)?)\}/)
    expect(m).not.toBeNull()
    expect(m![1]).not.toMatch(/\.lat|\.lng|\blat\b|\blng\b/)
    expect(m![1]).toContain('numeroBusqueda')
  })

  it('onMover borra los resultados y sube la generación', () => {
    const cuerpo = bloque('onMover={(nueva) =>')
    expect(cuerpo).toContain('setResultados([])')
    expect(cuerpo).toContain('generacionRef.current += 1')
  })

  it('elegir un resultado borra los resultados y sube la generación', () => {
    const cuerpo = bloque('const elegirResultado')
    expect(cuerpo).toContain('setResultados([])')
    expect(cuerpo).toContain('generacionRef.current += 1')
  })

  it('la búsqueda descarta la respuesta si la generación cambió', () => {
    expect(codigo).toMatch(/generacionRef\.current\s*!==\s*generacion/)
  })
})

describe('lugar-mapa-ubicar: guardado', () => {
  it('la rama del pin movido no llama a router.replace ni router.refresh', () => {
    const inicio = codigo.indexOf('if (actual.lat !== enviada.lat')
    expect(inicio).toBeGreaterThanOrEqual(0)
    const rama = bloque('if (actual.lat !== enviada.lat', '{')
    expect(rama).not.toMatch(/router\.(replace|refresh)/)
    expect(rama).toContain('Moviste el pin mientras se guardaba')
    expect(rama).not.toContain('setMovido(false)')
  })

  it('la rama sin movimiento hace replace con `guardado=` y refresh', () => {
    const resto = codigo.slice(codigo.indexOf('} else {', codigo.indexOf('if (actual.lat !== enviada.lat')))
    expect(resto).toMatch(/router\.replace\(`[^`]*guardado=\$\{venueId\}/)
    expect(resto).toContain('router.refresh()')
  })
})

describe('lugar-mapa-ubicar: timer de enfriamiento', () => {
  it('el cleanup del efecto de montaje hace clearTimeout', () => {
    // El efecto de montaje: desde `montadoRef.current = true` hasta su `}, [])`.
    const i = codigo.indexOf('montadoRef.current = true')
    expect(i).toBeGreaterThanOrEqual(0)
    const efecto = codigo.slice(i, codigo.indexOf('}, [])', i))
    expect(efecto).toContain('montadoRef.current = false')
    expect(efecto).toContain('clearTimeout(enfriamientoRef.current)')
  })

  it('antes de crear un timer nuevo se cancela el anterior', () => {
    const i = codigo.indexOf('const handleBuscar')
    const cuerpo = codigo.slice(i)
    expect(cuerpo.indexOf('clearTimeout(enfriamientoRef.current)')).toBeGreaterThanOrEqual(0)
    expect(cuerpo.indexOf('clearTimeout(enfriamientoRef.current)')).toBeLessThan(cuerpo.indexOf('setTimeout('))
  })

  it('no hace setState de la búsqueda después de desmontar (montadoRef)', () => {
    expect(codigo).toMatch(/if \(!montadoRef\.current/)
  })
})
