import type { Ref } from "react"
import Link from "next/link"
import { consultaDelMapa, type CategoriaDelMapa, type FiltrosExtraMapa } from "@qps/core/mapa/filtros"
import type { FiltroMapa } from "@qps/core/mapa/pines"

// Sin "use client": no usa estado, efectos ni APIs del navegador. Lo importa
// `app/mapa/mapa-contenido.tsx` (que sí es cliente) y le llegan las funciones
// por props; el componente solo las llama desde un `onClick` o un `onChange`.

export const BASE_BOTON = "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
export const BOTON_ACTIVO = "border-primary bg-primary text-primary-foreground"
export const BOTON_INACTIVO = "border-input bg-background text-foreground hover:bg-muted"

/** La URL de `/mapa` para una fecha y unos filtros "qué": el `href` de cada chip. */
export function urlDelMapa(filtro: FiltroMapa, extra: FiltrosExtraMapa): string {
  return `/mapa?${consultaDelMapa(filtro, extra)}`
}

/**
 * El `onNavigate` de un chip (que es un `<a href>` real, para que funcione sin
 * JavaScript, antes de hidratar y al compartirlo): con JS la navegación la
 * hace `accion` (la de `mapa-contenido`, que suma los toques seguidos y marca
 * la carga), no el `<Link>`. `onNavigate` solo corre en la navegación del
 * cliente: con Ctrl, Cmd o la rueda (abrir en otra pestaña) el link hace lo suyo.
 */
export function navegarCon(accion: () => void) {
  return (evento: { preventDefault: () => void }) => {
    evento.preventDefault()
    accion()
  }
}

interface FiltrosQueProps {
  /** Lo último que se pidió (no lo que muestra el mapa todavía): así dos toques seguidos se suman. */
  extra: FiltrosExtraMapa
  /** La fecha pedida: va en el `href` de cada chip y en el "Aplicar" sin JavaScript. */
  filtro: FiltroMapa
  categorias: CategoriaDelMapa[]
  /** Se prendió o apagó un filtro: llegan los filtros "qué" nuevos, completos. */
  onCambiar: (extra: FiltrosExtraMapa) => void
  /** El chip "Gratis": después de "Quitar filtros" el foco vuelve acá. */
  refGratis?: Ref<HTMLAnchorElement>
}

/** El texto de una opción del selector: "Música (5)", o "Teatro (0)" si la elegida quedó sin eventos (corto: a 320 px no se corta). */
function textoDeCategoria(categoria: CategoriaDelMapa): string {
  return `${categoria.name} (${categoria.cantidad})`
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
 *
 * Gratis y Para chicos son links a su URL (`aria-current` en el prendido: en
 * un link, `aria-pressed` no vale). El selector va adentro del `<form>` de
 * `mapa-contenido`: sin JavaScript se aplica con el botón "Aplicar" del
 * `<noscript>`.
 */
export function FiltrosQue({ extra, filtro, categorias, onCambiar, refGratis }: FiltrosQueProps) {
  const conGratis = { ...extra, gratis: !extra.gratis }
  const conChicos = { ...extra, chicos: !extra.chicos }
  return (
    <div role="group" aria-label="Qué tipo de plan" className="flex flex-wrap items-center gap-2">
      <Link
        ref={refGratis}
        href={urlDelMapa(filtro, conGratis)}
        prefetch={false}
        aria-current={extra.gratis ? "true" : undefined}
        onNavigate={navegarCon(() => onCambiar(conGratis))}
        className={`${BASE_BOTON} ${extra.gratis ? BOTON_ACTIVO : BOTON_INACTIVO}`}
      >
        Gratis
      </Link>
      <Link
        href={urlDelMapa(filtro, conChicos)}
        prefetch={false}
        aria-current={extra.chicos ? "true" : undefined}
        onNavigate={navegarCon(() => onCambiar(conChicos))}
        className={`${BASE_BOTON} ${extra.chicos ? BOTON_ACTIVO : BOTON_INACTIVO}`}
      >
        Para chicos
      </Link>
      {/* Sin JavaScript el formulario manda lo de siempre (que el servidor ya sabe leer); con JS no se envía. */}
      {extra.gratis ? <input type="hidden" name="gratis" value="1" /> : null}
      {extra.chicos ? <input type="hidden" name="chicos" value="1" /> : null}
      <label
        className={`${BASE_BOTON} min-w-0 max-w-full gap-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary ${extra.categoria !== null ? BOTON_ACTIVO : BOTON_INACTIVO}`}
      >
        <span className="shrink-0">Categoría</span>
        <select
          name="categoria"
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
      <noscript>
        <button type="submit" name="cuando" value={filtro.tipo} className={`${BASE_BOTON} ${BOTON_INACTIVO}`}>
          Aplicar
        </button>
      </noscript>
    </div>
  )
}
