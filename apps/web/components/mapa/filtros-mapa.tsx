import type { Ref } from "react"
import type { CategoriaDelMapa, FiltrosExtraMapa } from "@qps/core/mapa/filtros"

// Sin "use client": no usa estado, efectos ni APIs del navegador. Lo importa
// `app/mapa/mapa-contenido.tsx` (que sí es cliente) y le llegan las funciones
// por props; el componente solo las llama desde un `onClick` o un `onChange`.

export const BASE_BOTON = "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
export const BOTON_ACTIVO = "border-primary bg-primary text-primary-foreground"
export const BOTON_INACTIVO = "border-input bg-background text-foreground hover:bg-muted"

interface FiltrosQueProps {
  /** Lo último que se pidió (no lo que muestra el mapa todavía): así dos toques seguidos se suman. */
  extra: FiltrosExtraMapa
  categorias: CategoriaDelMapa[]
  /** Se prendió o apagó un filtro: llegan los filtros "qué" nuevos, completos. */
  onCambiar: (extra: FiltrosExtraMapa) => void
  /** El chip "Gratis": después de "Quitar filtros" el foco vuelve acá. */
  refGratis?: Ref<HTMLButtonElement>
}

/** El texto de una opción del selector: "Música (5)", o "Teatro (sin eventos)" si la elegida quedó en 0. */
function textoDeCategoria(categoria: CategoriaDelMapa): string {
  return categoria.cantidad === 0 ? `${categoria.name} (sin eventos)` : `${categoria.name} (${categoria.cantidad})`
}

/** Los filtros "qué" prendidos, por su nombre: "Gratis · Para chicos · Teatro". */
export function nombresDeFiltrosExtra(extra: FiltrosExtraMapa, categorias: CategoriaDelMapa[]): string {
  const nombres: string[] = []
  if (extra.gratis) nombres.push("Gratis")
  if (extra.chicos) nombres.push("Para chicos")
  if (extra.categoria !== null) {
    nombres.push(categorias.find((categoria) => categoria.slug === extra.categoria)?.name ?? extra.categoria)
  }
  return nombres.join(" · ")
}

/**
 * La fila "Qué" de `/mapa`: Gratis, Para chicos y la categoría. Cada cambio
 * sale por `onCambiar` con los tres filtros; navegar lo decide quien la usa.
 */
export function FiltrosQue({ extra, categorias, onCambiar, refGratis }: FiltrosQueProps) {
  return (
    <div role="group" aria-label="Qué tipo de plan" className="flex flex-wrap items-center gap-2">
      <button
        ref={refGratis}
        type="button"
        aria-pressed={extra.gratis}
        onClick={() => onCambiar({ ...extra, gratis: !extra.gratis })}
        className={`${BASE_BOTON} ${extra.gratis ? BOTON_ACTIVO : BOTON_INACTIVO}`}
      >
        Gratis
      </button>
      <button
        type="button"
        aria-pressed={extra.chicos}
        onClick={() => onCambiar({ ...extra, chicos: !extra.chicos })}
        className={`${BASE_BOTON} ${extra.chicos ? BOTON_ACTIVO : BOTON_INACTIVO}`}
      >
        Para chicos
      </button>
      <label
        className={`${BASE_BOTON} min-w-0 max-w-full gap-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary ${extra.categoria !== null ? BOTON_ACTIVO : BOTON_INACTIVO}`}
      >
        <span className="shrink-0">Categoría</span>
        <select
          value={extra.categoria ?? ""}
          onChange={(evento) => onCambiar({ ...extra, categoria: evento.target.value || null })}
          className="min-w-0 max-w-full truncate rounded bg-background px-2 py-1 text-foreground"
        >
          <option value="">Todas</option>
          {categorias.map((categoria) => (
            <option key={categoria.slug} value={categoria.slug}>
              {textoDeCategoria(categoria)}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
