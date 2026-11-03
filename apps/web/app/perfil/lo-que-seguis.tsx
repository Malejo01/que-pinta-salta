"use client"

// "Lo que seguís" (R47, tarea 47-d, QPS-197): la sección de `/perfil`
// ("Cuenta") que muestra EXACTAMENTE lo que el usuario sigue (lugares,
// cuentas de Instagram y categorías) y deja dejar de seguir cada uno desde
// ahí. `/radar` sigue siendo el formulario con todas las opciones tildables,
// pero no muestra "lo que seguís" de un vistazo: por eso esto es una
// sección y no un link a `/radar`.
//
// Dos exports, mismo patrón que `boton-seguir.tsx` (misma ronda): la Vista
// es SIN estado y sin hooks, para que un test la pueda invocar como función
// común y pasarla por `renderToStaticMarkup` en Node puro. El componente con
// estado llama a `cambiarSeguimiento` y, si sale bien, saca el ítem de su
// lista local; si falla, lo deja y avisa con `useToast` (mismo patrón que
// `BotonSeguir`).
import { useState } from "react"
import Link from "next/link"
import { MapPin, Instagram, Tags } from "lucide-react"
import type { TipoSeguimiento } from "@qps/core/radar/seguimiento"
import { cambiarSeguimiento } from "@/lib/actions/radar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { textosDe } from "@/lib/i18n"
import type { Idioma } from "@/lib/i18n/idiomas"
import { rutaEn } from "@/lib/i18n/rutas"

export interface LugarSeguido {
  id: string
  nombre: string
  /** Q5-6: para el link a la ficha; sin slug, el link va por id (redirige). */
  slug?: string
}

export interface CuentaSeguida {
  id: string
  username: string
}

export interface CategoriaSeguida {
  id: string
  nombre: string
}

export interface LoQueSeguisVistaProps {
  lugares: LugarSeguido[]
  cuentas: CuentaSeguida[]
  categorias: CategoriaSeguida[]
  /** El tipo y el id correctos (nunca "copiado y pegado" entre los tres grupos). */
  onDejarDeSeguir: (tipo: TipoSeguimiento, id: string) => void
  /** Q6-2: el idioma de la página (/perfil o /en/perfil). Por defecto, castellano. */
  idioma?: Idioma
}

/** La vista pura: sin estado, sin hooks. */
export function LoQueSeguisVista({ lugares, cuentas, categorias, onDejarDeSeguir, idioma = "es" }: LoQueSeguisVistaProps) {
  const t = textosDe(idioma).loQueSeguis
  // Los nombres de lugares y categorías vienen de la base, en castellano.
  const langContenido = idioma === "en" ? "es-AR" : undefined
  const vacio = lugares.length === 0 && cuentas.length === 0 && categorias.length === 0

  if (vacio) {
    return (
      <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
        <p>
          {t.vacio}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href={rutaEn(idioma, "/radar")}>{t.irAlRadar}</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {lugares.length > 0 && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            <MapPin className="size-3.5" />
            {t.lugares}
          </h3>
          <ul className="space-y-1.5">
            {lugares.map((lugar) => (
              <li key={lugar.id} className="flex items-center justify-between gap-3 text-sm">
                {/* Q5-6: el nombre lleva a la ficha del lugar (por id, redirige al slug). */}
                <Link
                  href={rutaEn(idioma, `/lugar/${lugar.slug ?? lugar.id}`)}
                  lang={langContenido}
                  className="truncate font-medium text-foreground underline-offset-2 hover:text-primary hover:underline"
                >
                  {lugar.nombre}
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={t.dejarDeSeguirAria(lugar.nombre)}
                  onClick={() => onDejarDeSeguir("lugar", lugar.id)}
                >
                  {t.dejarDeSeguir}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {cuentas.length > 0 && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            <Instagram className="size-3.5" />
            {t.cuentas}
          </h3>
          <ul className="space-y-1.5">
            {cuentas.map((cuenta) => (
              <li key={cuenta.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium text-foreground">@{cuenta.username}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={t.dejarDeSeguirAria(`@${cuenta.username}`)}
                  onClick={() => onDejarDeSeguir("cuenta", cuenta.id)}
                >
                  {t.dejarDeSeguir}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {categorias.length > 0 && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            <Tags className="size-3.5" />
            {t.categorias}
          </h3>
          <ul className="space-y-1.5">
            {categorias.map((categoria) => (
              <li key={categoria.id} className="flex items-center justify-between gap-3 text-sm">
                <span lang={langContenido} className="truncate font-medium text-foreground">{categoria.nombre}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={t.dejarDeSeguirAria(categoria.nombre)}
                  onClick={() => onDejarDeSeguir("categoria", categoria.id)}
                >
                  {t.dejarDeSeguir}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export interface LoQueSeguisProps {
  lugares: LugarSeguido[]
  cuentas: CuentaSeguida[]
  categorias: CategoriaSeguida[]
  /** Q6-2: el idioma de la página. Por defecto, castellano. */
  idioma?: Idioma
}

/**
 * El componente con estado: llama a `cambiarSeguimiento({ tipo, id, seguir:
 * false })` y, si sale bien, saca el ítem de la lista local correspondiente.
 * Si falla, lo deja (sigue apareciendo) y avisa con un toast de error.
 */
export function LoQueSeguis({ lugares: lugaresIniciales, cuentas: cuentasIniciales, categorias: categoriasIniciales, idioma = "es" }: LoQueSeguisProps) {
  const t = textosDe(idioma).loQueSeguis
  const [lugares, setLugares] = useState(lugaresIniciales)
  const [cuentas, setCuentas] = useState(cuentasIniciales)
  const [categorias, setCategorias] = useState(categoriasIniciales)
  const { toast } = useToast()

  async function alDejarDeSeguir(tipo: TipoSeguimiento, id: string) {
    try {
      const resultado = await cambiarSeguimiento({ tipo, id, seguir: false })

      if (!resultado.ok) {
        toast({
          title: t.errorTitulo,
          description: t.errorTexto,
          variant: "destructive",
        })
        return
      }

      if (tipo === "lugar") setLugares((anteriores) => anteriores.filter((lugar) => lugar.id !== id))
      else if (tipo === "cuenta") setCuentas((anteriores) => anteriores.filter((cuenta) => cuenta.id !== id))
      else setCategorias((anteriores) => anteriores.filter((categoria) => categoria.id !== id))
    } catch {
      toast({
        title: t.errorConexionTitulo,
        description: t.errorConexionTexto,
        variant: "destructive",
      })
    }
  }

  return (
    <Card className="bg-card/60 backdrop-blur-sm shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">{t.titulo}</CardTitle>
        <CardDescription>{t.bajada}</CardDescription>
      </CardHeader>
      <CardContent>
        <LoQueSeguisVista
          lugares={lugares}
          cuentas={cuentas}
          categorias={categorias}
          onDejarDeSeguir={alDejarDeSeguir}
          idioma={idioma}
        />
      </CardContent>
    </Card>
  )
}
