"use client"

/**
 * Q5-3 · El formulario «Sumá un lugar para chicos». Sin datos personales
 * obligatorios: solo el nombre y la dirección del LUGAR; el contacto es
 * opcional y dice para qué se usa.
 *
 * Anti-spam: el campo `sitio` es un honeypot (fuera de la vista y del orden de
 * tabulación, con aria-hidden) e `iniciado` es la hora en que el servidor
 * dibujó el formulario (tiempo mínimo). La server action decide.
 *
 * Q6-7: con JavaScript, el envío pasa por `onSubmit` (preventDefault + la
 * acción dentro de una transición) y no por el `action` del form: React 19
 * VACÍA el formulario después de cada acción del `action`, también cuando la
 * respuesta es un error, y la persona perdía todo lo que había escrito por un
 * link mal copiado. Sin JavaScript, el `action` sigue funcionando igual.
 */
import { startTransition, useActionState, useEffect, useRef, type FormEvent } from "react"
import Link from "next/link"
import { sumarLugarChicos, type EstadoPedido } from "@/lib/actions/sumar-lugar-chicos"
import { ETIQUETA_TIPO, TIPOS_LUGAR } from "@qps/core/lugares/permanentes"
import { textosDe } from "@/lib/i18n"
import type { Idioma } from "@/lib/i18n/idiomas"
import { rutaEn } from "@/lib/i18n/rutas"

const CAMPO =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:text-sm"
const ETIQUETA = "flex flex-col gap-1 text-sm font-medium text-foreground"

const CAMPO_DEL_ERROR: Partial<Record<string, string>> = {
  nombre: "nombre",
  direccion: "direccion",
  tipo: "tipo",
  link: "link",
  contacto: "contacto",
  comentario: "comentario",
}

export function FormularioSumarLugar({ idioma, iniciado }: { idioma: Idioma; iniciado: number }) {
  const t = textosDe(idioma).sumarLugar
  const [estado, accion, enviando] = useActionState<EstadoPedido, FormData>(sumarLugarChicos, { estado: "inicial" })
  const mensaje = useRef<HTMLParagraphElement>(null)
  const formulario = useRef<HTMLFormElement>(null)

  // Al terminar: el foco va al mensaje (éxito) o al campo con el error.
  useEffect(() => {
    if (estado.estado === "enviado") {
      mensaje.current?.focus()
      return
    }
    if (estado.estado === "error") {
      const campo = CAMPO_DEL_ERROR[estado.codigo]
      const el = campo ? formulario.current?.querySelector<HTMLElement>(`[name="${campo}"]`) : null
      ;(el ?? mensaje.current)?.focus()
    }
  }, [estado])

  if (estado.estado === "enviado") {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <p ref={mensaje} tabIndex={-1} role="status" className="text-base font-medium text-foreground focus:outline-none">
          {t.gracias}
        </p>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
          <a href={rutaEn(idioma, "/lugares-chicos/sumar")} className="inline-flex min-h-11 items-center text-sm font-medium text-foreground underline underline-offset-2">
            {t.otroMas}
          </a>
          <Link href={rutaEn(idioma, "/mapa?cuando=hoy&chicos=1&capa=chicos")} className="inline-flex min-h-11 items-center text-sm font-medium text-foreground underline underline-offset-2">
            {t.volverAlMapa}
          </Link>
        </div>
      </div>
    )
  }

  // Q6-7: la acción a mano, para que React no vacíe el formulario (ver arriba).
  const alEnviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    const datos = new FormData(evento.currentTarget)
    startTransition(() => accion(datos))
  }

  const error = estado.estado === "error" ? estado.codigo : null
  const errorDe = (campo: string) => (error && CAMPO_DEL_ERROR[error] === campo ? "error-sumar" : undefined)

  return (
    <form ref={formulario} action={accion} onSubmit={alEnviar} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="iniciado" value={iniciado} />
      <input type="hidden" name="idioma" value={idioma} />
      {/* Honeypot: una persona no lo ve ni llega con Tab. */}
      <div aria-hidden="true" className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
        <label>
          {t.sitioNoCompletar}
          <input type="text" name="sitio" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <label className={ETIQUETA}>
        {t.nombre}
        <input name="nombre" required minLength={3} maxLength={200} autoComplete="off" aria-invalid={errorDe("nombre") ? true : undefined} aria-describedby={errorDe("nombre")} className={CAMPO} />
      </label>
      <label className={ETIQUETA}>
        {t.direccion}
        <input name="direccion" required minLength={3} maxLength={300} autoComplete="off" aria-invalid={errorDe("direccion") ? true : undefined} aria-describedby={errorDe("direccion")} className={CAMPO} />
      </label>
      <label className={ETIQUETA}>
        {t.tipo}
        <select name="tipo" defaultValue="" aria-invalid={errorDe("tipo") ? true : undefined} aria-describedby={errorDe("tipo")} className={CAMPO}>
          <option value="">{t.tipoNoSe}</option>
          {TIPOS_LUGAR.map((tipo) => (
            <option key={tipo} value={tipo}>
              {ETIQUETA_TIPO[idioma][tipo]}
            </option>
          ))}
        </select>
      </label>
      <label className={ETIQUETA}>
        {t.link}
        <input name="link" type="url" inputMode="url" maxLength={300} autoComplete="off" aria-invalid={errorDe("link") ? true : undefined} aria-describedby={errorDe("link")} className={CAMPO} />
      </label>
      <label className={ETIQUETA}>
        {t.comentario}
        <textarea
          name="comentario"
          maxLength={1000}
          rows={4}
          aria-invalid={errorDe("comentario") ? true : undefined}
          aria-describedby={errorDe("comentario")}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:text-sm"
        />
      </label>
      <label className={ETIQUETA}>
        {t.contacto}
        <input
          name="contacto"
          maxLength={200}
          autoComplete="email"
          aria-invalid={errorDe("contacto") ? true : undefined}
          aria-describedby={["ayuda-contacto", errorDe("contacto")].filter(Boolean).join(" ")}
          className={CAMPO}
        />
        <span id="ayuda-contacto" className="text-xs font-normal text-muted-foreground">
          {t.contactoAyuda}
        </span>
      </label>
      <p className="text-xs text-muted-foreground">{t.noCasas}</p>

      <p id="error-sumar" ref={mensaje} tabIndex={-1} role="alert" className="text-sm font-medium text-error focus:outline-none">
        {error ? t.errores[error] : ""}
      </p>
      <button
        type="submit"
        disabled={enviando}
        aria-busy={enviando}
        className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60 sm:self-start"
      >
        {enviando ? t.enviando : t.enviar}
      </button>
    </form>
  )
}
