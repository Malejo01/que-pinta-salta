/**
 * Q5-13 · Gráfico de barras en SVG, sin dependencias (Server Component).
 * Accesible: `role="img"` con un resumen en `aria-label`, y la tabla con los
 * mismos datos en un <details> (la alternativa completa al gráfico).
 */
import type { PuntoSerie } from '@/lib/uso/panel'

export function GraficoBarras({
  titulo,
  serie,
  etiqueta = (clave: string) => clave.slice(5),
  color = 'currentColor',
}: {
  titulo: string
  serie: readonly PuntoSerie[]
  etiqueta?: (clave: string) => string
  color?: string
}) {
  const ancho = 640
  const alto = 160
  const margen = 24
  const maximo = Math.max(1, ...serie.map((p) => p.valor))
  const paso = serie.length > 0 ? (ancho - margen) / serie.length : 0
  const total = serie.reduce((s, p) => s + p.valor, 0)
  const ultimo = serie.at(-1)
  const resumen = `${titulo}: ${serie.length} puntos, máximo ${maximo}, total ${total}${ultimo ? `, último ${ultimo.valor}` : ''}.`

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-sm font-semibold">{titulo}</figcaption>
      <svg viewBox={`0 0 ${ancho} ${alto + margen}`} role="img" aria-label={resumen} className="h-auto w-full text-primary">
        <line x1={margen} y1={alto} x2={ancho} y2={alto} stroke="currentColor" strokeOpacity={0.3} />
        <text x={0} y={12} fontSize={10} fill="currentColor" fillOpacity={0.7}>
          {maximo}
        </text>
        {serie.map((p, i) => {
          const h = (p.valor / maximo) * (alto - 16)
          return (
            <g key={p.clave}>
              <rect x={margen + i * paso + 1} y={alto - h} width={Math.max(1, paso - 2)} height={h} fill={color} rx={1}>
                <title>{`${p.clave}: ${p.valor}`}</title>
              </rect>
              {serie.length <= 16 || i % Math.ceil(serie.length / 8) === 0 ? (
                <text x={margen + i * paso + paso / 2} y={alto + 14} fontSize={9} textAnchor="middle" fill="currentColor" fillOpacity={0.7}>
                  {etiqueta(p.clave)}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">Ver los datos en una tabla</summary>
        <table className="mt-2 w-full max-w-sm text-left">
          <thead>
            <tr>
              <th scope="col" className="pr-4 font-medium">Período</th>
              <th scope="col" className="font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {serie.map((p) => (
              <tr key={p.clave}>
                <td className="pr-4 tabular-nums">{p.clave}</td>
                <td className="tabular-nums">{p.valor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
