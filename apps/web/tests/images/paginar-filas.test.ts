/**
 * QPS-162: `scripts/imagenes-externas.ts` lee todas las filas, de a páginas.
 * Cliente falso que imita a PostgREST (tope de filas por respuesta y
 * `.range(desde, hasta)` inclusivo), sin red ni base. Filas inventadas.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { TAMANO_PAGINA, traerTodasLasFilas } from '@/lib/images/paginar-filas'

type Fila = { id: string; image_url: string }

function tabla(n: number): Fila[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `fila-${String(i).padStart(5, '0')}`,
    image_url: `https://ticketera.example/afiche-${i}.jpg`,
  }))
}

/** Como PostgREST: devuelve [desde, hasta] (inclusivo), pero nunca más de `tope` filas. */
function clienteFalso(filas: Fila[], tope = 1000) {
  const traer = vi.fn(async (desde: number, hasta: number) => ({
    data: filas.slice(desde, Math.min(hasta + 1, desde + tope)),
    error: null,
  }))
  return traer
}

describe('traerTodasLasFilas', () => {
  it('con 1470 filas (más que el tope de 1000) trae las 1470, sin repetidas ni faltantes', async () => {
    const filas = tabla(1470)
    const traer = clienteFalso(filas)
    const leidas = await traerTodasLasFilas(traer)
    expect(leidas).toHaveLength(1470)
    expect(new Set(leidas.map((f) => f.id)).size).toBe(1470)
    expect(leidas).toEqual(filas)
    expect(traer).toHaveBeenNthCalledWith(1, 0, 999)
    expect(traer).toHaveBeenNthCalledWith(2, 1000, 1999)
  })

  it('con 2500 filas pide de a 1000 y corta en la primera página vacía', async () => {
    const traer = clienteFalso(tabla(2500))
    expect(await traerTodasLasFilas(traer)).toHaveLength(2500)
    expect(traer).toHaveBeenCalledTimes(4) // 1000 + 1000 + 500 + vacía
  })

  it('si el servidor tiene un tope menor (500) no saltea filas: avanza por lo que llegó', async () => {
    const filas = tabla(1470)
    const leidas = await traerTodasLasFilas(clienteFalso(filas, 500))
    expect(leidas).toEqual(filas)
  })

  it('exactamente 1000 filas: las 1000, y una consulta más que vuelve vacía', async () => {
    const traer = clienteFalso(tabla(1000))
    expect(await traerTodasLasFilas(traer)).toHaveLength(1000)
    expect(traer).toHaveBeenCalledTimes(2)
  })

  it('tabla vacía o data null: lista vacía', async () => {
    expect(await traerTodasLasFilas(clienteFalso([]))).toEqual([])
    expect(await traerTodasLasFilas(async () => ({ data: null, error: null }))).toEqual([])
  })

  it('un error de la consulta corta con el mensaje (no devuelve una lista a medias)', async () => {
    let llamada = 0
    const traer = async () => {
      llamada++
      return llamada === 1
        ? { data: tabla(1000), error: null }
        : { data: null, error: { message: 'timeout de prueba' } }
    }
    await expect(traerTodasLasFilas(traer)).rejects.toThrow('timeout de prueba')
  })

  it('el tamaño de página por defecto es 1000', () => {
    expect(TAMANO_PAGINA).toBe(1000)
  })
})

describe('scripts/imagenes-externas.ts pagina events y cinema_movies', () => {
  const src = readFileSync(join(__dirname, '..', '..', 'scripts', 'imagenes-externas.ts'), 'utf8')

  it('usa traerTodasLasFilas para las dos tablas, con orden estable y .range()', () => {
    expect(src).toMatch(/from ['"]\.\.\/lib\/images\/paginar-filas['"]/)
    expect(src.match(/traerTodasLasFilas</g) ?? []).toHaveLength(2)
    expect(src.match(/\.order\(['"]id['"]\)/g) ?? []).toHaveLength(2)
    expect(src.match(/\.range\(desde, hasta\)/g) ?? []).toHaveLength(2)
  })
})
