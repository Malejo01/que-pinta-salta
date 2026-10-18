"use client"

import { useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertCircle, CheckCircle2, Loader2, Trash2 } from "lucide-react"
import { CONTACTO_EMAIL } from "@qps/core/contacto"

/**
 * Compara lo que escribió la persona contra "ELIMINAR". Acepta espacios de
 * más al principio o al final y no distingue mayúsculas de minúsculas (es
 * más fácil de tipear en el celular). El servidor, en cambio, exige el
 * literal exacto "ELIMINAR": por eso el cliente nunca manda lo que tipeó la
 * persona, siempre el literal fijo una vez que esta función dio OK.
 */
export function confirmacionValida(texto: string): boolean {
  return texto.trim().toUpperCase() === "ELIMINAR"
}

export function EliminarCuentaForm() {
  const [texto, setTexto] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [eliminada, setEliminada] = useState(false)

  const habilitado = confirmacionValida(texto) && !enviando

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!confirmacionValida(texto) || enviando) return

    setError(null)
    setEnviando(true)

    try {
      const res = await fetch("/api/cuenta/eliminar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmacion: "ELIMINAR" }),
      })

      if (!res.ok) {
        throw new Error("No se pudo eliminar la cuenta")
      }

      // Con scope "local" (@supabase/auth-js 2.106.0, método `_signOut` de
      // GoTrueClient), el cliente igual llama al servidor de Supabase a
      // cerrar esta sesión puntual (no las de todos los dispositivos). La
      // cuenta ya no existe en el servidor, así que esa llamada puede
      // responder 401, 403 o 404: en esos tres casos la librería ignora el
      // error y borra la sesión guardada en el navegador igual. Con
      // cualquier otro error, la librería devuelve { error } sin tirar y no
      // borra la sesión local; como no tira, el catch de abajo no se entera
      // y ese valor de retorno se descarta a propósito (QPS-186, fuera de
      // esta ronda): la cuenta ya está borrada en el servidor, no hay nada
      // que reintentar. En los dos casos mostramos la pantalla de éxito
      // igual.
      try {
        const supabase = createClient()
        await supabase.auth.signOut({ scope: "local" })
      } catch (signOutError) {
        console.error("Error al cerrar sesión local tras eliminar la cuenta:", signOutError)
      }

      setEliminada(true)
    } catch {
      setError(`No pudimos eliminar tu cuenta. Probá de nuevo en unos minutos o escribinos a ${CONTACTO_EMAIL}.`)
      setEnviando(false)
    }
  }

  if (eliminada) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-muted/30 p-6 text-center">
        <CheckCircle2 className="size-8 text-primary" />
        <p className="font-semibold text-foreground">Tu cuenta fue eliminada</p>
        <p className="text-sm text-muted-foreground">
          Esto fue para siempre y no se puede deshacer.
        </p>
        <Button asChild className="mt-2">
          <Link href="/">Volver a la portada</Link>
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="confirmacion-eliminar">
          Escribí <span className="font-semibold text-foreground">ELIMINAR</span> para confirmar
        </Label>
        <Input
          id="confirmacion-eliminar"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="ELIMINAR"
          autoComplete="off"
          disabled={enviando}
          className="bg-background/50 focus-visible:ring-destructive/50"
        />
      </div>

      <Button type="submit" variant="destructive" className="w-full font-medium" disabled={!habilitado}>
        {enviando ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Eliminando tu cuenta...
          </>
        ) : (
          <>
            <Trash2 className="mr-2 size-4" />
            Eliminar mi cuenta para siempre
          </>
        )}
      </Button>
    </form>
  )
}
