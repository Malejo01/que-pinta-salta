// Q5-13 · Panel de uso: aperturas anónimas (validación y hashes), las
// cuentas del panel, «¿Llegamos al pedido de producción?» y el CSV.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { filaDeApertura, semanaIso, validarApertura } from '@/lib/uso/apertura'
import {
  activosPorDia,
  activosPorSemana,
  conCuentaPorDia,
  csvDiario,
  diasEntre,
  estadoProduccion,
  vistasPorDia,
  type FilaApertura,
} from '@/lib/uso/panel'

const ID = '0123456789abcdef0123456789abcdef'

describe('validarApertura', () => {
  it('acepta lo justo', () => {
    expect(validarApertura({ idMetricas: ID, plataforma: 'android', version: '1.0.8', conCuenta: true })).toEqual({
      idMetricas: ID,
      plataforma: 'android',
      version: '1.0.8',
      conCuenta: true,
    })
    expect(validarApertura({ idMetricas: ID, plataforma: 'ios' })).toEqual({ idMetricas: ID, plataforma: 'ios', version: null, conCuenta: false })
  })
  it.each([
    ['sin id', { plataforma: 'android' }],
    ['id con otra forma (un device_id con guiones)', { idMetricas: '12345678-1234-4234-8234-123456789012', plataforma: 'android' }],
    ['plataforma desconocida', { idMetricas: ID, plataforma: 'web' }],
    ['versión rara', { idMetricas: ID, plataforma: 'android', version: '1.0; drop' }],
    ['campos de más (nada personal se cuela)', { idMetricas: ID, plataforma: 'android', email: 'x@y.z' }],
    ['no es objeto', 'hola'],
  ])('rechaza: %s', (_n, cuerpo) => {
    expect(validarApertura(cuerpo)).toBeNull()
  })
})

describe('hashes: nunca el id crudo', () => {
  it('semana ISO', () => {
    expect(semanaIso('2026-11-03')).toBe('2026-W45')
    expect(semanaIso('2026-11-09')).toBe('2026-W46')
    expect(semanaIso('2027-01-01')).toBe('2026-W53')
  })
  it('sha256(id:día de Salta) y sha256(id:semana); el día es el de Salta, no el UTC', () => {
    // Martes 3/11 23:30 en Salta = miércoles 4/11 02:30 UTC.
    const fila = filaDeApertura({ idMetricas: ID, plataforma: 'android', version: null, conCuenta: false }, new Date('2026-11-04T02:30:00Z'))
    expect(fila.day).toBe('2026-11-03')
    expect(fila.hashDia).toBe(createHash('sha256').update(`${ID}:2026-11-03`).digest('hex'))
    expect(fila.hashSemana).toBe(createHash('sha256').update(`${ID}:2026-W45`).digest('hex'))
    expect(JSON.stringify(fila)).not.toContain(ID)
  })
})

describe('el endpoint', () => {
  const s = readFileSync(join(process.cwd(), 'app', 'api', 'app', 'apertura', 'route.ts'), 'utf8')
  it('orden de las guardas: User-Agent de la app, cuerpo chico, límite por IP, formato, límite por id, y recién ahí la base', () => {
    const i = (t: string) => s.indexOf(t)
    expect(i('QuePintaSaltaApp')).toBeLessThan(i('leerCuerpoJson('))
    expect(i('leerCuerpoJson(')).toBeLessThan(i('porIp.permitir('))
    expect(i('porIp.permitir(')).toBeLessThan(i('validarApertura('))
    expect(i('validarApertura(')).toBeLessThan(i('porId.permitir('))
    expect(i('porId.permitir(')).toBeLessThan(i("rpc('registrar_apertura_app'"))
  })
  it('no guarda ni loguea el id: a la base van los hashes', () => {
    expect(s).not.toMatch(/p_\w+:\s*datos\.idMetricas/)
    for (const linea of s.split('\n').filter((l) => l.includes('console.'))) expect(linea).not.toMatch(/datos|idMetricas|cuerpo/)
  })
})

const fila = (day: string, hash: string, conCuenta = false): FilaApertura => ({ day, hash_semana: hash, con_cuenta: conCuenta, plataforma: 'android' })

describe('cuentas del panel', () => {
  const dias = diasEntre('2026-11-01', '2026-11-03')
  const filas = [fila('2026-11-01', 'a'), fila('2026-11-02', 'a', true), fila('2026-11-02', 'b'), fila('2026-11-03', 'c')]
  it('días entre dos fechas', () => {
    expect(dias).toEqual(['2026-11-01', '2026-11-02', '2026-11-03'])
  })
  it('activos por día (una fila por hash del día) y con sesión', () => {
    expect(activosPorDia(filas, dias).map((p) => p.valor)).toEqual([1, 2, 1])
    expect(conCuentaPorDia(filas, dias).map((p) => p.valor)).toEqual([0, 1, 0])
  })
  it('activos por semana: hashes semanales distintos (la misma persona dos días cuenta una vez)', () => {
    expect(activosPorSemana(filas)).toEqual([
      { clave: '2026-W44', valor: 1 },
      { clave: '2026-W45', valor: 3 },
    ])
  })
  it('vistas web y app', () => {
    const v = vistasPorDia(
      [
        { day: '2026-11-01', origin: 'app', views: 3 },
        { day: '2026-11-01', origin: 'hero', views: 5 },
        { day: '2026-11-02', origin: 'directo', views: 2 },
      ],
      dias,
    )
    expect(v.app.map((p) => p.valor)).toEqual([3, 0, 0])
    expect(v.web.map((p) => p.valor)).toEqual([5, 2, 0])
  })
})

describe('¿Llegamos al pedido de producción?', () => {
  it('con menos de 14 días, en curso; con 12 activos por semana, cumple; lo de Play Console queda para mirar a mano', () => {
    const muchos = Array.from({ length: 12 }, (_, i) => fila('2026-10-27', `h${i}`)).concat(Array.from({ length: 12 }, (_, i) => fila('2026-11-03', `k${i}`)))
    const e = estadoProduccion(muchos, '2026-11-03')
    expect(e.diasCorridos).toBe(9)
    expect(e.diasQueFaltan).toBe(6)
    expect(e.criterios[0]!.estado).toBe('en-curso')
    expect(e.criterios[1]!.estado).toBe('cumple')
    expect(e.criterios.filter((c) => c.estado === 'manual')).toHaveLength(4)
    expect(estadoProduccion([fila('2026-10-27', 'x')], '2026-11-10').criterios.map((c) => c.estado).slice(0, 2)).toEqual(['cumple', 'no-cumple'])
  })
})

describe('CSV', () => {
  it('una línea por día, y nada que una planilla lea como fórmula', () => {
    const dias = ['2026-11-01', '2026-11-02']
    const csv = csvDiario(dias, { activos: [{ clave: '2026-11-01', valor: 3 }, { clave: '2026-11-02', valor: 4 }] })
    expect(csv).toBe('dia,activos\n2026-11-01,3\n2026-11-02,4\n')
    expect(csvDiario(['=1+1'], { a: [{ clave: 'x', valor: 1 }] })).toContain("'=1+1")
  })
  it('la ruta del CSV y la página exigen admin', () => {
    expect(readFileSync(join(process.cwd(), 'app', 'admin', 'uso', 'csv', 'route.ts'), 'utf8')).toMatch(/if \(!\(await esAdmin\(\)\)\) return new Response\('No autorizado', \{ status: 403 \}\)/)
    expect(readFileSync(join(process.cwd(), 'app', 'admin', 'uso', 'page.tsx'), 'utf8')).toMatch(/if \(!\(await esAdmin\(\)\)\) redirect/)
  })
  it('lo que se cuenta con la service key son solo totales (head: true)', () => {
    const datos = readFileSync(join(process.cwd(), 'lib', 'uso', 'datos.ts'), 'utf8')
    const conAdmin = datos.split('\n').filter((l) => l.includes('admin.from('))
    expect(conAdmin.length).toBeGreaterThan(0)
    for (const l of conAdmin) expect(l).toContain("{ count: 'exact', head: true }")
  })
})
