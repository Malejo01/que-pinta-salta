// Q5-2 · «Cerca mío» / «Elegí tu barrio» (propuesta §4.6), fijado con un
// detector estático: la posición se pide en UN solo archivo, dentro del
// handler del botón, y ese archivo no importa nada que escriba a la red ni
// guarde nada. Nadie usa `watchPosition` en la web.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const WEB = process.cwd()
const ARCHIVO = 'components/mapa/seccion-lugares-chicos.tsx'

function archivos(dir: string): string[] {
  const salida: string[] = []
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === '.next') continue
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) salida.push(...archivos(ruta))
    else if (/\.(ts|tsx)$/.test(nombre)) salida.push(ruta)
  }
  return salida
}

const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const fuentes = [...archivos(join(WEB, 'app')), ...archivos(join(WEB, 'components')), ...archivos(join(WEB, 'lib'))]

describe('la ubicación del navegador', () => {
  it('getCurrentPosition aparece en un solo archivo', () => {
    const usan = fuentes.filter((r) => sinComentarios(readFileSync(r, 'utf8')).includes('getCurrentPosition')).map((r) => relative(WEB, r))
    expect(usan).toEqual([ARCHIVO])
  })
  it('nadie usa watchPosition', () => {
    expect(fuentes.filter((r) => sinComentarios(readFileSync(r, 'utf8')).includes('watchPosition'))).toEqual([])
  })
  it('se pide solo dentro del handler del botón, sin alta precisión y con timeout', () => {
    const s = sinComentarios(readFileSync(join(WEB, ARCHIVO), 'utf8'))
    const handler = s.slice(s.indexOf('function alTocarCercaMio'), s.indexOf('function alElegirBarrio'))
    expect(handler).toContain('getCurrentPosition')
    expect(s.split('getCurrentPosition').length - 1).toBe(1)
    expect(handler).toMatch(/enableHighAccuracy: false/)
    expect(handler).toMatch(/timeout: \d/)
    expect(s).toMatch(/onClick=\{alTocarCercaMio\}/)
    expect(s).not.toMatch(/useEffect/)
  })
  it('el archivo no manda ni guarda nada: ni fetch, ni router, ni server actions, ni storage, ni cookies', () => {
    const s = readFileSync(join(WEB, ARCHIVO), 'utf8')
    const codigo = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    for (const prohibido of ['fetch(', 'next/navigation', 'useRouter', 'localStorage', 'sessionStorage', 'document.cookie', 'sendBeacon', '@vercel/analytics', "'use server'", '@/lib/actions', 'searchParams']) {
      expect(codigo, prohibido).not.toContain(prohibido)
    }
    const imports = [...codigo.matchAll(/from "([^"]+)"/g)].map((m) => m[1])
    expect(imports.sort()).toEqual(
      ['@/lib/i18n', '@/lib/i18n/idiomas', '@qps/core/date-format', '@qps/core/datos/barrios', '@qps/core/lugares/permanentes', '@qps/core/mapa/lugares-chicos', 'lucide-react', 'react'].sort(),
    )
  })
})
