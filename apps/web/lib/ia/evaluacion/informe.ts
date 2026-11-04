/**
 * Q6-4 · El informe del banco en texto (tablas Markdown: se leen en la
 * terminal y se pueden pegar en un PR o en el README). Puro.
 */
import type { Porcentaje, ResumenClasificacion, ResumenFlyers, ResumenTraduccion } from './metricas'
import { formatearUsd } from './precios'
import type { InformeReal } from './real'
import type { InformeSeco } from './seco'
import type { UsoEvaluado } from './tipos'

const NOMBRE_USO: Record<UsoEvaluado, string> = { flyers: 'Flyers', traduccion: 'Traducción', clasificacion: 'Clasificación' }

export function tabla(encabezados: string[], filas: Array<Array<string | number>>): string {
  const texto = filas.map((f) => f.map(String))
  const anchos = encabezados.map((e, i) => Math.max(e.length, ...texto.map((f) => (f[i] ?? '').length)))
  const linea = (celdas: string[]) => `| ${celdas.map((c, i) => c.padEnd(anchos[i])).join(' | ')} |`
  return [linea(encabezados), `|${anchos.map((a) => '-'.repeat(a + 2)).join('|')}|`, ...texto.map(linea)].join('\n')
}

function pct(p: Porcentaje): string {
  return p.pct === null ? '—' : `${String(p.pct).replace('.', ',')} % (${p.correctos}/${p.total})`
}

function miles(n: number): string {
  return Math.round(n).toLocaleString('es-AR')
}

export function tablaFlyers(filas: Array<{ nombre: string; resumen: ResumenFlyers }>): string {
  return tabla(
    ['', 'casos', 'fecha', 'hora', 'lugar', 'precio', 'total (4 campos)', 'categoría'],
    filas.map(({ nombre, resumen: r }) => [
      nombre,
      r.casos,
      pct(r.porCampo.fecha),
      pct(r.porCampo.hora),
      pct(r.porCampo.lugar),
      pct(r.porCampo.precio),
      pct(r.total),
      pct(r.porCampo.categoria),
    ]),
  )
}

export function tablaTraduccion(filas: Array<{ nombre: string; resumen: ResumenTraduccion }>): string {
  return tabla(
    ['', 'casos', 'rúbrica (0–4)', '4 de 4', 'conserva', 'sin castellano', 'largo', 'sin agregados', 'pasa validarTraduccion'],
    filas.map(({ nombre, resumen: r }) => [
      nombre,
      r.casos,
      r.promedio === null ? '—' : String(r.promedio).replace('.', ','),
      pct(r.completos),
      pct(r.porCriterio.conserva),
      pct(r.porCriterio.sinCastellano),
      pct(r.porCriterio.largo),
      pct(r.porCriterio.sinAgregados),
      r.validasProduccion ? pct(r.validasProduccion) : '—',
    ]),
  )
}

export function textoClasificacion(nombre: string, r: ResumenClasificacion): string {
  const confusiones = r.confusiones.slice(0, 8).map((c) => `${c.esperado} → ${c.obtenido} (${c.casos})`)
  return `${nombre}: ${pct(r.correctas)} correctas. Confusiones: ${confusiones.length ? confusiones.join('; ') : 'ninguna'}.`
}

export function formatearInformeSeco(inf: InformeSeco): string {
  const s: string[] = []
  s.push('# Banco de evaluación de IA — en seco (no se llamó a ningún modelo)')
  s.push('')
  s.push(
    `Fixtures: ${inf.fixtures.flyers.casos} flyers, ${inf.fixtures.traduccion.casos} traducciones, ${inf.fixtures.clasificacion.casos} clasificaciones ` +
      `(extraídos de producción el ${inf.fixtures.flyers.extraido}). Formato y datos personales: OK.`,
  )
  s.push('')
  s.push('## Pedidos armados con lib/ai (los mismos que manda la app)')
  s.push(
    tabla(
      ['uso', 'pedidos', 'con imagen', 'caracteres (prom., sistema + prompt)', 'maxTokens'],
      (Object.keys(inf.pedidos) as UsoEvaluado[]).map((u) => [NOMBRE_USO[u], inf.pedidos[u].casos, inf.pedidos[u].conImagen, miles(inf.pedidos[u].caracteresPromedio), inf.pedidos[u].maxTokens]),
    ),
  )
  s.push('')
  s.push('## Tokens y costo estimados por llamada y por mes')
  s.push(
    `Volúmenes de producción (últimos ${inf.volumenes.ventanaDias} días al ${inf.volumenes.consultado}): ` +
      `${inf.volumenes.porMes.flyers} flyers, ${inf.volumenes.porMes.traduccion} traducciones, ${inf.volumenes.porMes.clasificacion} clasificaciones por mes.`,
  )
  s.push('')
  s.push(
    tabla(
      ['uso', 'modelo', 'tokens entrada', 'tokens salida', 'por llamada', 'por 1000', 'por mes'],
      inf.costos.map((c) => [
        NOMBRE_USO[c.uso],
        c.estadoPrecio === 'referencia' ? `${c.modelo} (ref.)` : c.modelo,
        miles(c.tokensEntradaPromedio),
        miles(c.tokensSalidaPromedio),
        formatearUsd(c.usdPorLlamada),
        formatearUsd(c.usdPor1000),
        formatearUsd(c.usdPorMes),
      ]),
    ),
  )
  s.push('')
  s.push('**Total mensual estimado (los tres usos):**')
  s.push('')
  s.push(tabla(['modelo', 'USD por mes', 'precio'], inf.totalMensual.map((t) => [t.modelo, formatearUsd(t.usdPorMes), t.estadoPrecio])))
  s.push('')
  s.push('> Precios de docs/evaluacion-ia/precios.md: «verificar» = sin confirmar en la página oficial. Tokens por aproximación de caracteres (ver README).')
  s.push('')
  s.push('## Línea de base sin gasto: lo que extrajo la IA de producción vs. lo publicado')
  s.push(tablaFlyers(inf.lineaBase.flyers.map((b) => ({ nombre: b.modelo, resumen: b.resumen }))))
  s.push('')
  s.push('## Autocontrol (lo esperado contra sí mismo: tiene que dar 100 % y 4/4)')
  s.push(tablaFlyers([{ nombre: 'flyers', resumen: inf.autocontrol.flyers }]))
  s.push('')
  s.push(tablaTraduccion([{ nombre: 'referencias', resumen: inf.autocontrol.traduccion }]))
  s.push('')
  s.push(textoClasificacion('Clasificación', inf.autocontrol.clasificacion))
  return s.join('\n')
}

export function formatearInformeReal(inf: InformeReal): string {
  const s: string[] = []
  s.push(`# Banco de evaluación de IA — REAL (tope ${inf.tope} llamadas por uso y proveedor)`)
  s.push('')
  s.push(
    tabla(
      ['proveedor', 'modelo', 'llamadas', 'fallidas', 'tokens entrada', 'tokens salida', 'costo'],
      inf.resultados.map((r) => [
        r.proveedor,
        r.modelo,
        r.llamadas,
        Object.entries(r.fallidas).map(([k, v]) => `${k}: ${v}`).join(', ') || '0',
        miles(r.tokensEntrada),
        miles(r.tokensSalida),
        r.usd === null ? 'sin precio en precios.md' : formatearUsd(r.usd),
      ]),
    ),
  )
  const flyers = inf.resultados.filter((r) => r.porUso.flyers).map((r) => ({ nombre: r.modelo, resumen: r.porUso.flyers! }))
  if (flyers.length) s.push('', '## Flyers', tablaFlyers(flyers))
  const trad = inf.resultados.filter((r) => r.porUso.traduccion).map((r) => ({ nombre: r.modelo, resumen: r.porUso.traduccion! }))
  if (trad.length) s.push('', '## Traducción', tablaTraduccion(trad))
  const clas = inf.resultados.filter((r) => r.porUso.clasificacion)
  if (clas.length) s.push('', '## Clasificación', ...clas.map((r) => textoClasificacion(r.modelo, r.porUso.clasificacion!)))
  const tokens = inf.resultados.flatMap((r) =>
    (Object.entries(r.tokensPorUso) as Array<[UsoEvaluado, { llamadas: number; entradaPromedio: number; salidaPromedio: number }]>).map(([u, t]) => [
      r.modelo,
      NOMBRE_USO[u],
      t.llamadas,
      miles(t.entradaPromedio),
      miles(t.salidaPromedio),
    ]),
  )
  if (tokens.length) s.push('', '## Tokens medidos (para corregir la estimación en seco)', tabla(['modelo', 'uso', 'llamadas', 'entrada (prom.)', 'salida (prom.)'], tokens))
  return s.join('\n')
}
