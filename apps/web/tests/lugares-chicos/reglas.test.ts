// Q5-1 · Detectores estáticos: OSM solo desde el script, admin con la sesión,
// y el grant por columnas de anon en la migración.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = join(process.cwd(), '..', '..')
const WEB = process.cwd()

function archivos(dir: string, ext = /\.(ts|tsx)$/): string[] {
  const salida: string[] = []
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === '.next') continue
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) salida.push(...archivos(ruta, ext))
    else if (ext.test(nombre)) salida.push(ruta)
  }
  return salida
}

describe('Overpass / OSM solo desde el importador a mano', () => {
  it('solo lib/lugares-chicos/osm.ts y el script importan el módulo del importador', () => {
    const usan = [...archivos(join(WEB, 'app')), ...archivos(join(WEB, 'components')), ...archivos(join(WEB, 'lib')), ...archivos(join(WEB, 'scripts'))]
      .filter((r) => /lugares-chicos\/osm['"]/.test(readFileSync(r, 'utf8')))
      .map((r) => relative(WEB, r))
    expect(usan).toEqual(['scripts/importar-lugares-chicos.ts'])
  })
  it('nadie más le pide a Overpass (ni la app, ni el navegador, ni una ruta de API)', () => {
    const lugares = [
      ...archivos(join(WEB, 'app')),
      ...archivos(join(WEB, 'components')),
      ...archivos(join(WEB, 'lib')),
      ...archivos(join(RAIZ, 'apps', 'mobile', 'app')),
      ...archivos(join(RAIZ, 'apps', 'mobile', 'lib')),
      ...archivos(join(RAIZ, 'apps', 'mobile', 'components')),
    ]
    const conOverpass = lugares.filter((r) => /overpass-api|interpreter\?data|URL_OVERPASS/.test(readFileSync(r, 'utf8'))).map((r) => relative(WEB, r))
    expect(conOverpass).toEqual(['lib/lugares-chicos/osm.ts'])
  })
  it('ningún workflow programa el importador', () => {
    const dir = join(RAIZ, '.github', 'workflows')
    for (const nombre of readdirSync(dir)) {
      expect(readFileSync(join(dir, nombre), 'utf8'), nombre).not.toMatch(/importar-lugares-chicos/)
    }
  })
  it('el script es modo consulta por defecto: escribe solo detrás de --aplicar', () => {
    const s = readFileSync(join(WEB, 'scripts', 'importar-lugares-chicos.ts'), 'utf8')
    const corte = s.indexOf('if (!aplicar)')
    expect(corte).toBeGreaterThan(0)
    expect(s.slice(0, corte)).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
    expect(s).toMatch(/estado: 'borrador'/)
    expect(s).not.toMatch(/estado: 'publicado'/)
  })
})

describe('el admin escribe con la sesión (RLS is_admin), nunca con service role', () => {
  it('lugares-chicos-actions no usa createAdminClient ni la service key', () => {
    const s = readFileSync(join(WEB, 'lib', 'admin', 'lugares-chicos-actions.ts'), 'utf8')
    expect(s).not.toMatch(/createAdminClient|SERVICE_ROLE/)
    expect(s).toMatch(/requireAdmin\(\)/)
  })
})

describe('migración: anon no ve cargado_por ni verificado_por (decisión 8)', () => {
  const sql = readFileSync(join(RAIZ, 'supabase', 'migrations', '20261103120000_q5_lugares_permanentes.sql'), 'utf8')
  it('no hay grant de toda la tabla a anon, y el grant por columnas no las nombra', () => {
    expect(sql).not.toMatch(/grant select on public\.lugares_permanentes to anon/i)
    const grant = sql.match(/grant select \(([\s\S]*?)\) on public\.lugares_permanentes to anon/i)
    expect(grant).not.toBeNull()
    expect(grant![1]).not.toMatch(/cargado_por|verificado_por/)
    expect(grant![1]).toMatch(/verificado_at/)
  })
})
