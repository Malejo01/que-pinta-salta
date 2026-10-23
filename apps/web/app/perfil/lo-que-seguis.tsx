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

export interface LugarSeguido {
  id: string
  nombre: string
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
}

/** La vista pura: sin estado, sin hooks. */
export function LoQueSeguisVista({ lugares, cuentas, categorias, onDejarDeSeguir }: LoQueSeguisVistaProps) {
  const vacio = lugares.length === 0 && cuentas.length === 0 && categorias.length === 0

  if (vacio) {
    return (
      <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
        <p>
          Todavía no seguís nada. Seguí un lugar desde la ficha de un evento, o elegí categorías en el Radar.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/radar">Ir al Radar</Link>
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
            Lugares
          </h3>
          <ul className="space-y-1.5">
            {lugares.map((lugar) => (
              <li key={lugar.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium text-foreground">{lugar.nombre}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Dejar de seguir ${lugar.nombre}`}
                  onClick={() => onDejarDeSeguir("lugar", lugar.id)}
                >
                  Dejar de seguir
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
            Cuentas de Instagram
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
                  aria-label={`Dejar de seguir @${cuenta.username}`}
                  onClick={() => onDejarDeSeguir("cuenta", cuenta.id)}
                >
                  Dejar de seguir
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
            Categorías
          </h3>
          <ul className="space-y-1.5">
            {categorias.map((categoria) => (
              <li key={categoria.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium text-foreground">{categoria.nombre}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Dejar de seguir ${categoria.nombre}`}
                  onClick={() => onDejarDeSeguir("categoria", categoria.id)}
                >
                  Dejar de seguir
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
}

/**
 * El componente con estado: llama a `cambiarSeguimiento({ tipo, id, seguir:
 * false })` y, si sale bien, saca el ítem de la lista local correspondiente.
 * Si falla, lo deja (sigue apareciendo) y avisa con un toast de error.
 */
export function LoQueSeguis({ lugares: lugaresIniciales, cuentas: cuentasIniciales, categorias: categoriasIniciales }: LoQueSeguisProps) {
  const [lugares, setLugares] = useState(lugaresIniciales)
  const [cuentas, setCuentas] = useState(cuentasIniciales)
  const [categorias, setCategorias] = useState(categoriasIniciales)
  const { toast } = useToast()

  async function alDejarDeSeguir(tipo: TipoSeguimiento, id: string) {
    try {
      const resultado = await cambiarSeguimiento({ tipo, id, seguir: false })

      if (!resultado.ok) {
        toast({
          title: "Error",
          description: "No pudimos dejar de seguir. Probá de nuevo.",
          variant: "destructive",
        })
        return
      }

      if (tipo === "lugar") setLugares((anteriores) => anteriores.filter((lugar) => lugar.id !== id))
      else if (tipo === "cuenta") setCuentas((anteriores) => anteriores.filter((cuenta) => cuenta.id !== id))
      else setCategorias((anteriores) => anteriores.filter((categoria) => categoria.id !== id))
    } catch {
      toast({
        title: "Error de conexión",
        description: "No pudimos conectarnos al servidor. Probá de nuevo.",
        variant: "destructive",
      })
    }
  }

  return (
    <Card className="bg-card/60 backdrop-blur-sm shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">Lo que seguís</CardTitle>
        <CardDescription>Los lugares, cuentas de Instagram y categorías que elegiste seguir para tu Radar.</CardDescription>
      </CardHeader>
      <CardContent>
        <LoQueSeguisVista
          lugares={lugares}
          cuentas={cuentas}
          categorias={categorias}
          onDejarDeSeguir={alDejarDeSeguir}
        />
      </CardContent>
    </Card>
  )
}
