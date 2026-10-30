"use client"

// La fila de acciones de una ficha/tarjeta de evento (R47, tarea 47-c,
// QPS-197/QPS-199): ♥ Guardar (privado), ✓ Voy (social) y Compartir, en ese
// orden. El orden sale SIEMPRE de `ORDEN_FILA_ACCIONES` (de
// `@qps/core/asistencia`): nunca se escribe a mano acá, porque un test de
// paridad (47-q) exige que la fila lo saque de core.
//
// Dos exports:
//
//   - `FilaAccionesEventoVista`: SIN estado y SIN un solo hook. Recibe el
//     estado y los `onClick` por props. Por qué: un test (QPS-199,
//     `tests/asistencia/fila-render.test.ts`) la llama como función común y
//     la pasa por `renderToStaticMarkup` en Node puro (sin jsdom: ese test
//     corre con `environment: 'node'`), así que no puede depender de
//     `useState`, `useToast`, `useAuthModal` ni de ningún otro hook.
//
//   - `FilaAccionesEvento`: el componente con estado, que llama a las server
//     actions (`marcarAsistencia`, `toggleFavorite`) y delega el dibujado en
//     la vista. Su click con estado lo prueba con DOM real (jsdom)
//     `tests/dom/fila-acciones-evento.dom.test.ts` (R61, QPS-199).
//
// Por qué Compartir llega como una prop (`compartir?: ReactNode`) en vez de
// importar `ShareButton` directamente en la vista: `ShareButton` puede
// depender de APIs del navegador (Web Share API, portapapeles), y la vista
// tiene que poder renderizarse en Node puro para el test. Con una prop, el
// test pasa un stub cualquiera y lo que se prueba de verdad (el ORDEN) sigue
// saliendo de `ORDEN_FILA_ACCIONES`, que es lo que hay que proteger.
import { Fragment, useState, type ReactNode } from "react"
import { Heart } from "lucide-react"
import { ORDEN_FILA_ACCIONES } from "@qps/core/asistencia"
import { marcarAsistencia, type CantidadesAsistencia } from "@/lib/asistencia"
import { toggleFavorite } from "@/lib/actions/favorites"
import { Button } from "@/components/ui/button"
import { BotonVoy } from "@/components/botones-asistencia"
import { useAuthModal } from "@/components/auth-modal"
import { useToast } from "@/hooks/use-toast"
import { textosDe } from "@/lib/i18n"
import type { Idioma } from "@/lib/i18n/idiomas"
import { useIdioma } from "@/lib/i18n/use-idioma"
import { cn } from "@/lib/utils"

export interface FilaAccionesEventoVistaProps {
  guardado: boolean
  voy: boolean
  cantidadVoy: number
  /** `false` para eventos sin `cantidadesAsistencia` (no PUBLISHED, o falló la lectura): no se dibuja el botón de Voy. */
  mostrarVoy: boolean
  haySesion: boolean
  /** Hay una acción en vuelo: los botones quedan `disabled`. */
  pendiente: boolean
  onClickGuardar: () => void
  onClickVoy: () => void
  compartir?: ReactNode
  /** Para el `aria-label` de los botones (no afecta el texto visible, que sale de `textoBotonVoy`/el diccionario). */
  titulo?: string
  className?: string
  /**
   * Idioma de los textos. Por prop y no con `useTextos()`: la vista no puede
   * usar hooks (ver arriba). Por defecto, castellano (los textos de siempre,
   * que en `es.ts` salen de core).
   */
  idioma?: Idioma
}

/**
 * La vista pura de la fila: sin estado, sin hooks. El orden de los botones
 * sale de recorrer `ORDEN_FILA_ACCIONES`, nunca de escribirlo a mano.
 */
export function FilaAccionesEventoVista({
  guardado,
  voy,
  cantidadVoy,
  mostrarVoy,
  haySesion,
  pendiente,
  onClickGuardar,
  onClickVoy,
  compartir,
  titulo,
  className,
  idioma = "es",
}: FilaAccionesEventoVistaProps) {
  const t = textosDe(idioma).asistencia
  const nombre = titulo ?? t.esteEvento
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-3">
        {ORDEN_FILA_ACCIONES.map((accion) => {
          if (accion === "guardar") {
            return (
              <Button
                key="guardar"
                type="button"
                size="lg"
                variant={guardado ? "default" : "outline"}
                className="min-h-11 flex-1 sm:flex-none"
                disabled={pendiente}
                aria-pressed={guardado}
                aria-label={guardado ? t.ariaQuitarGuardado(nombre) : t.ariaGuardar(nombre)}
                onClick={onClickGuardar}
              >
                <Heart className={cn("mr-2 size-4", guardado && "fill-current")} />
                {guardado ? t.guardado : t.guardar}
              </Button>
            )
          }

          if (accion === "voy") {
            if (!mostrarVoy) return null
            return (
              <BotonVoy
                key="voy"
                voy={voy}
                cantidadVoy={cantidadVoy}
                pendiente={pendiente}
                onClick={onClickVoy}
                titulo={titulo}
                idioma={idioma}
              />
            )
          }

          // accion === "compartir"
          if (!compartir) return null
          return <Fragment key="compartir">{compartir}</Fragment>
        })}
      </div>
      {!haySesion && <p className="text-sm text-muted-foreground">{t.entrarParaMarcar}</p>}
    </div>
  )
}

export interface FilaAccionesEventoProps {
  eventId: string
  titulo: string
  guardadoInicial: boolean
  voyInicial: boolean
  cantidadesIniciales: CantidadesAsistencia
  haySesion: boolean
  /** `false` para eventos sin `cantidadesAsistencia`: no se muestra el botón de Voy. */
  mostrarVoy: boolean
  compartir?: ReactNode
  /** Avisa al padre cada vez que cambia el ♥: también cuando cambia por efecto de marcar/sacar Voy. */
  onGuardadoChange?: (guardado: boolean) => void
  className?: string
}

/**
 * El componente con estado: UN solo estado `{ guardado, voy, cantidadVoy }`
 * (nunca dos `useState` separados) porque el ♥ y el Voy de la misma pantalla
 * no pueden contradecirse (invariante `voy ⇒ guardado` de
 * `@qps/core/asistencia`).
 */
export function FilaAccionesEvento({
  eventId,
  titulo,
  guardadoInicial,
  voyInicial,
  cantidadesIniciales,
  haySesion,
  mostrarVoy,
  compartir,
  onGuardadoChange,
  className,
}: FilaAccionesEventoProps) {
  const [estado, setEstado] = useState({
    guardado: guardadoInicial,
    voy: voyInicial,
    cantidadVoy: cantidadesIniciales.voy,
  })
  const [pendiente, setPendiente] = useState(false)
  const { open: openAuthModal } = useAuthModal()
  const { toast } = useToast()
  const idioma = useIdioma()
  const t = textosDe(idioma).asistencia

  /**
   * Tocar ♥: optimista (como hoy), pero el resultado del servidor manda. Si
   * vino `voyQuitado`, se saca el Voy y se baja `cantidadVoy` en 1 sin pasar
   * nunca de 0, con el aviso de `TEXTO_SACASTE_GUARDADO_CON_VOY`. Si el
   * resultado falla, se vuelve al estado anterior.
   */
  async function alTocarGuardar() {
    if (!haySesion) {
      openAuthModal()
      return
    }
    if (pendiente) return

    const anterior = estado
    const guardadoOptimista = !estado.guardado
    setPendiente(true)
    setEstado((previo) => ({ ...previo, guardado: guardadoOptimista }))
    onGuardadoChange?.(guardadoOptimista)

    try {
      const resultado = await toggleFavorite(eventId, "event")

      if (!resultado.success) {
        setEstado(anterior)
        onGuardadoChange?.(anterior.guardado)
        if (resultado.error === "AUTH_REQUIRED") {
          openAuthModal()
        } else {
          toast({
            title: t.errorTitulo,
            // El mensaje del servidor está en castellano: en inglés va el del diccionario.
            description: (idioma === "es" && resultado.message) || t.errorGuardados,
            variant: "destructive",
          })
        }
        return
      }

      const guardadoFinal = resultado.favorited ?? guardadoOptimista
      setEstado((previo) =>
        resultado.voyQuitado
          ? { guardado: guardadoFinal, voy: false, cantidadVoy: Math.max(0, previo.cantidadVoy - 1) }
          : { ...previo, guardado: guardadoFinal },
      )
      if (guardadoFinal !== guardadoOptimista) onGuardadoChange?.(guardadoFinal)

      if (resultado.voyQuitado) {
        toast({ description: t.sacasteGuardadoConVoy })
      }
    } catch {
      setEstado(anterior)
      onGuardadoChange?.(anterior.guardado)
      toast({
        title: t.errorConexionTitulo,
        description: t.errorConexionTexto,
        variant: "destructive",
      })
    } finally {
      setPendiente(false)
    }
  }

  /**
   * Tocar Voy: pesimista (espera la respuesta, como hoy con `pendiente`).
   * Aplica `guardado`, `propia` y `cantidades` del resultado — también en el
   * error, porque el `guardado` del error es el estado real que quedó en la
   * base (ver `lib/asistencia.ts`).
   */
  async function alTocarVoy() {
    if (!haySesion) {
      openAuthModal()
      return
    }
    if (pendiente) return

    setPendiente(true)
    try {
      const resultado = await marcarAsistencia(eventId, "voy")

      if (!resultado.ok) {
        if (resultado.guardado !== undefined) {
          setEstado((previo) => {
            if (previo.guardado !== resultado.guardado) onGuardadoChange?.(resultado.guardado!)
            return { ...previo, guardado: resultado.guardado! }
          })
        }
        if (resultado.error === "AUTH_REQUIRED") {
          openAuthModal()
        } else {
          toast({
            title: t.errorTitulo,
            description: resultado.error === "INVALID" ? t.eventoNoDisponible : t.errorMarca,
            variant: "destructive",
          })
        }
        return
      }

      setEstado((previo) => {
        if (previo.guardado !== resultado.guardado) onGuardadoChange?.(resultado.guardado)
        return {
          guardado: resultado.guardado,
          voy: resultado.propia === "voy",
          cantidadVoy: resultado.cantidades.voy,
        }
      })
    } catch {
      toast({
        title: t.errorConexionTitulo,
        description: t.errorConexionTexto,
        variant: "destructive",
      })
    } finally {
      setPendiente(false)
    }
  }

  return (
    <FilaAccionesEventoVista
      guardado={estado.guardado}
      voy={estado.voy}
      cantidadVoy={estado.cantidadVoy}
      mostrarVoy={mostrarVoy}
      haySesion={haySesion}
      pendiente={pendiente}
      onClickGuardar={alTocarGuardar}
      onClickVoy={alTocarVoy}
      compartir={compartir}
      titulo={titulo}
      className={className}
      idioma={idioma}
    />
  )
}
