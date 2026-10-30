import type { KeyboardEvent, Ref } from "react"
import Link from "next/link"
import { consultaDelMapa, type CategoriaDelMapa, type FiltrosExtraMapa } from "@qps/core/mapa/filtros"
import type { FiltroMapa } from "@qps/core/mapa/pines"
import { langDeCategoria, nombreCategoria, textosDe } from "@/lib/i18n"
import type { Idioma } from "@/lib/i18n/idiomas"
import { rutaEn } from "@/lib/i18n/rutas"

// Sin "use client": no usa estado, efectos ni APIs del navegador. Lo importa
// `app/mapa/mapa-contenido.tsx` (que sí es cliente) y le llegan las funciones
// por props; el componente solo las llama desde un `onClick` o un `onChange`.

export const BASE_BOTON = "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
export const BOTON_ACTIVO = "border-primary bg-primary text-primary-foreground"
export const BOTON_INACTIVO = "border-input bg-background text-foreground hover:bg-muted"

/**
 * La URL de `/mapa` (o `/en/mapa`) para una fecha y unos filtros "qué": el
 * `href` de cada chip. Los nombres de los parámetros no se traducen.
 */
export function urlDelMapa(filtro: FiltroMapa, extra: FiltrosExtraMapa, idioma: Idioma = "es"): string {
  return rutaEn(idioma, `/mapa?${consultaDelMapa(filtro, extra)}`)
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

/**
 * Lo que hace de un chip-link un botón de alternar para el lector de pantalla y
 * el teclado: `role="button"` con `aria-pressed` (en un link común no valdría) y
 * Espacio, que en un link no hace nada, lo activa como Enter. El `href` sigue:
 * sin JavaScript navega, y Ctrl, Cmd o el botón del medio abren otra pestaña
 * (el `<Link>` no llama a `onNavigate` en esos casos).
 */
export function propsDeChip(activo: boolean) {
  return {
    role: "button",
    "aria-pressed": activo,
    onKeyDown: (evento: KeyboardEvent<HTMLAnchorElement>) => {
      if (evento.key !== " ") return
      evento.preventDefault()
      evento.currentTarget.click()
    },
  } as const
}

interface FiltrosQueProps {
  /** Lo último que se pidió (no lo que muestra el mapa todavía): así dos toques seguidos se suman. */
  extra: FiltrosExtraMapa
  /** La fecha pedida: va en el `href` de cada chip y en el "Aplicar categoría" sin JavaScript. */
  filtro: FiltroMapa
  categorias: CategoriaDelMapa[]
  /** Se prendió o apagó un filtro: llegan los filtros "qué" nuevos, completos. */
  onCambiar: (extra: FiltrosExtraMapa) => void
  /** El chip "Gratis": después de "Quitar filtros" el foco vuelve acá. */
  refGratis?: Ref<HTMLAnchorElement>
  /** Idioma de las etiquetas y de los links. Por defecto, castellano. */
  idioma?: Idioma
}

/** El texto de una opción del selector: "Música (5)", o "Teatro (0)" si la elegida quedó sin eventos (corto: a 320 px no se corta). */
function textoDeCategoria(categoria: CategoriaDelMapa, idioma: Idioma): string {
  return `${nombreCategoria(textosDe(idioma), categoria.slug, categoria.name)} (${categoria.cantidad})`
}

/** Los filtros "qué" prendidos, por su nombre: "Gratis · Para chicos · Teatro". */
export function nombresDeFiltrosExtra(extra: FiltrosExtraMapa, categorias: CategoriaDelMapa[], idioma: Idioma = "es"): string {
  const t = textosDe(idioma)
  const nombres: string[] = []
  if (extra.gratis) nombres.push(t.mapa.gratis)
  if (extra.chicos) nombres.push(t.mapa.paraChicos)
  if (extra.categoria !== null) {
    const categoria = categorias.find((candidata) => candidata.slug === extra.categoria)
    nombres.push(categoria ? nombreCategoria(t, categoria.slug, categoria.name) : extra.categoria)
  }
  return nombres.join(" · ")
}

/**
 * La fila "Qué" de `/mapa`: Gratis, Para chicos y la categoría. Cada cambio
 * sale por `onCambiar` con los tres filtros; navegar lo decide quien la usa.
 *
 * Gratis y Para chicos son links a su URL que se presentan como botones de
 * alternar (`propsDeChip`). El selector va adentro del `<form>` de
 * `mapa-contenido`: sin JavaScript se aplica con el botón "Aplicar categoría"
 * del `<noscript>`, que conserva el "cuándo" que ya estaba (un día recién
 * elegido en el selector de fecha se aplica con "Ver ese día").
 */
export function FiltrosQue({ extra, filtro, categorias, onCambiar, refGratis, idioma = "es" }: FiltrosQueProps) {
  const t = textosDe(idioma).mapa
  const conGratis = { ...extra, gratis: !extra.gratis }
  const conChicos = { ...extra, chicos: !extra.chicos }
  return (
    <div role="group" aria-label={t.queTipoDePlan} className="flex flex-wrap items-center gap-2">
      <Link
        ref={refGratis}
        href={urlDelMapa(filtro, conGratis, idioma)}
        prefetch={false}
        {...propsDeChip(extra.gratis)}
        onNavigate={navegarCon(() => onCambiar(conGratis))}
        className={`${BASE_BOTON} ${extra.gratis ? BOTON_ACTIVO : BOTON_INACTIVO}`}
      >
        {t.gratis}
      </Link>
      <Link
        href={urlDelMapa(filtro, conChicos, idioma)}
        prefetch={false}
        {...propsDeChip(extra.chicos)}
        onNavigate={navegarCon(() => onCambiar(conChicos))}
        className={`${BASE_BOTON} ${extra.chicos ? BOTON_ACTIVO : BOTON_INACTIVO}`}
      >
        {t.paraChicos}
      </Link>
      {/* Sin JavaScript el formulario manda lo de siempre (que el servidor ya sabe leer); con JS no se envía. */}
      {extra.gratis ? <input type="hidden" name="gratis" value="1" /> : null}
      {extra.chicos ? <input type="hidden" name="chicos" value="1" /> : null}
      <label
        className={`${BASE_BOTON} min-w-0 max-w-full gap-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary ${extra.categoria !== null ? BOTON_ACTIVO : BOTON_INACTIVO}`}
      >
        <span className="shrink-0">{t.categoria}</span>
        <select
          name="categoria"
          value={extra.categoria ?? ""}
          onChange={(evento) => onCambiar({ ...extra, categoria: evento.target.value || null })}
          className="min-w-0 max-w-full truncate rounded bg-background px-2 py-1 text-foreground"
        >
          <option value="">{t.todas}</option>
          {categorias.map((categoria) => (
            <option key={categoria.slug} value={categoria.slug} lang={langDeCategoria(idioma, categoria.slug)}>
              {textoDeCategoria(categoria, idioma)}
            </option>
          ))}
        </select>
      </label>
      <noscript>
        <button type="submit" name="cuando" value={filtro.tipo} className={`${BASE_BOTON} ${BOTON_INACTIVO}`}>
          {t.aplicarCategoria}
        </button>
      </noscript>
    </div>
  )
}
