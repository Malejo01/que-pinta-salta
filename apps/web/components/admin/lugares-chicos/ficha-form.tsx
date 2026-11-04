'use client'

/**
 * Q5-1 · Formulario de la ficha de un lugar para chicos (alta y edición) en
 * /admin/lugares-chicos. Los horarios son una grilla de 7 días (sin dato /
 * cerrado / franjas), nunca JSON a mano. Llama a `guardarLugarChicos`.
 */
import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { guardarLugarChicos, type EstadoAccionLugar } from '@/lib/admin/lugares-chicos-actions'
import {
  ACCESOS_LUGAR,
  DIAS_SEMANA,
  ETIQUETA_ACCESO,
  ETIQUETA_DIA,
  ETIQUETA_TECHADO,
  ETIQUETA_TIPO,
  TECHADOS_LUGAR,
  TIPOS_LUGAR,
  type DiaSemana,
  type HorariosLugar,
} from '@qps/core/lugares/permanentes'
import { ETIQUETA_FUENTE, FUENTES_PARA_ELEGIR } from '@/lib/lugares-chicos/textos-admin'

export type ValoresFicha = {
  id?: string
  tipo?: string
  descripcion_corta?: string | null
  edad_min?: number | null
  edad_max?: number | null
  horarios?: HorariosLugar
  acceso?: string
  nota_precio?: string | null
  techado?: string | null
  tiene_rampa?: boolean | null
  tiene_bano_adaptado?: boolean | null
  tiene_cambiador?: boolean | null
  contacto_telefono?: string | null
  contacto_web?: string | null
  contacto_instagram?: string | null
  fuente?: string
  fuente_detalle?: string | null
}

const CAMPO = 'h-11 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const ETIQUETA = 'flex flex-col gap-1 text-sm font-medium text-foreground'

function triestado(valor: boolean | null | undefined): string {
  return valor === true ? 'si' : valor === false ? 'no' : ''
}

function FilaDia({ dia, inicial }: { dia: DiaSemana; inicial: HorariosLugar['semana'][DiaSemana] }) {
  const [modo, setModo] = useState(inicial === undefined ? 'sin_dato' : inicial.length === 0 ? 'cerrado' : 'franjas')
  const franjas = inicial ?? []
  const nombre = ETIQUETA_DIA.es[dia]
  return (
    <fieldset className="grid grid-cols-1 gap-2 rounded-md border border-border p-3 sm:grid-cols-[8rem_10rem_1fr] sm:items-center">
      <legend className="sr-only">{nombre}</legend>
      <span aria-hidden="true" className="text-sm font-medium">
        {nombre}
      </span>
      <label className="sr-only" htmlFor={`h_${dia}_modo`}>
        {`${nombre}: horario`}
      </label>
      <select id={`h_${dia}_modo`} name={`h_${dia}_modo`} value={modo} onChange={(e) => setModo(e.target.value)} className={CAMPO}>
        <option value="sin_dato">Sin dato</option>
        <option value="cerrado">Cerrado</option>
        <option value="franjas">Abre</option>
      </select>
      {modo === 'franjas' ? (
        <div className="flex flex-col gap-2">
          {[1, 2].map((n) => (
            <div key={n} className="flex items-center gap-2">
              <label className="sr-only" htmlFor={`h_${dia}_${n}_desde`}>{`${nombre}, franja ${n}: desde`}</label>
              <input id={`h_${dia}_${n}_desde`} name={`h_${dia}_${n}_desde`} type="time" defaultValue={franjas[n - 1]?.desde ?? ''} className={CAMPO} />
              <span aria-hidden="true">a</span>
              <label className="sr-only" htmlFor={`h_${dia}_${n}_hasta`}>{`${nombre}, franja ${n}: hasta`}</label>
              <input id={`h_${dia}_${n}_hasta`} name={`h_${dia}_${n}_hasta`} type="time" defaultValue={franjas[n - 1]?.hasta ?? ''} className={CAMPO} />
            </div>
          ))}
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">{modo === 'cerrado' ? 'Cerrado ese día' : 'No sabemos'}</span>
      )}
    </fieldset>
  )
}

function Triestado({ nombre, etiqueta, valor }: { nombre: string; etiqueta: string; valor: boolean | null | undefined }) {
  return (
    <label className={ETIQUETA}>
      {etiqueta}
      <select name={nombre} defaultValue={triestado(valor)} className={CAMPO}>
        <option value="">Sin verificar</option>
        <option value="si">Sí (verificado)</option>
        <option value="no">No (verificado)</option>
      </select>
    </label>
  )
}

export function FichaLugarChicosForm({
  valores,
  venueElegido,
  esAlta,
}: {
  valores: ValoresFicha
  /** Alta sobre un venue existente: su id y nombre. */
  venueElegido?: { id: string; nombre: string } | null
  esAlta: boolean
}) {
  const [estado, accion, pendiente] = useActionState<EstadoAccionLugar, FormData>(guardarLugarChicos, null)
  const horarios = valores.horarios ?? { version: 1, semana: {} }

  return (
    <form action={accion} className="flex flex-col gap-4" aria-describedby="ficha-estado">
      {valores.id ? <input type="hidden" name="id" value={valores.id} /> : null}

      {esAlta ? (
        venueElegido ? (
          <p className="text-sm">
            <input type="hidden" name="venue_id" value={venueElegido.id} />
            Lugar: <strong>{venueElegido.nombre}</strong>
          </p>
        ) : (
          <fieldset className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-2">
            <legend className="px-1 text-sm font-semibold">Lugar nuevo (no estaba en la lista)</legend>
            <label className={ETIQUETA}>
              Nombre
              <input name="nuevo_nombre" required minLength={3} maxLength={200} className={CAMPO} />
            </label>
            <label className={ETIQUETA}>
              Dirección comercial
              <input name="nueva_direccion" required minLength={3} maxLength={300} className={CAMPO} />
            </label>
          </fieldset>
        )
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={ETIQUETA}>
          Tipo
          <select name="tipo" required defaultValue={valores.tipo ?? ''} className={CAMPO}>
            <option value="" disabled>
              Elegí uno
            </option>
            {TIPOS_LUGAR.map((t) => (
              <option key={t} value={t}>
                {ETIQUETA_TIPO.es[t]}
              </option>
            ))}
          </select>
        </label>
        <label className={ETIQUETA}>
          Acceso
          <select name="acceso" defaultValue={valores.acceso ?? 'consultar'} className={CAMPO}>
            {ACCESOS_LUGAR.map((a) => (
              <option key={a} value={a}>
                {ETIQUETA_ACCESO.es[a]}
              </option>
            ))}
          </select>
        </label>
        <label className={ETIQUETA}>
          Edad mínima (opcional)
          <input name="edad_min" type="number" min={0} max={17} inputMode="numeric" defaultValue={valores.edad_min ?? ''} className={CAMPO} />
        </label>
        <label className={ETIQUETA}>
          Edad máxima (opcional)
          <input name="edad_max" type="number" min={0} max={17} inputMode="numeric" defaultValue={valores.edad_max ?? ''} className={CAMPO} />
        </label>
        <label className={ETIQUETA}>
          Techado
          <select name="techado" defaultValue={valores.techado ?? ''} className={CAMPO}>
            <option value="">Sin dato</option>
            {TECHADOS_LUGAR.map((t) => (
              <option key={t} value={t}>
                {ETIQUETA_TECHADO.es[t]}
              </option>
            ))}
          </select>
        </label>
        <label className={ETIQUETA}>
          Nota de precio (sin montos: se vencen)
          <input name="nota_precio" maxLength={200} defaultValue={valores.nota_precio ?? ''} placeholder="Entrada gratis los domingos" className={CAMPO} />
        </label>
      </div>

      <label className={ETIQUETA}>
        Descripción corta (texto propio, hasta 280)
        <textarea
          name="descripcion_corta"
          maxLength={280}
          rows={3}
          defaultValue={valores.descripcion_corta ?? ''}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">Horarios (hora de Salta)</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" name="h_siempre_abierto" defaultChecked={horarios.siempre_abierto === true} className="size-5" />
            Espacio abierto (plaza)
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" name="h_solo_con_reserva" defaultChecked={horarios.solo_con_reserva === true} className="size-5" />
            Solo con reserva
          </label>
        </div>
        {DIAS_SEMANA.map((dia) => (
          <FilaDia key={dia} dia={dia} inicial={horarios.semana[dia]} />
        ))}
        <label className={ETIQUETA}>
          Nota de horarios (feriados, vacaciones)
          <input name="h_nota" maxLength={280} defaultValue={horarios.nota ?? ''} className={CAMPO} />
        </label>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-1 text-sm font-semibold">Accesibilidad (solo lo verificado se muestra)</legend>
        <Triestado nombre="tiene_rampa" etiqueta="Rampa" valor={valores.tiene_rampa} />
        <Triestado nombre="tiene_bano_adaptado" etiqueta="Baño adaptado" valor={valores.tiene_bano_adaptado} />
        <Triestado nombre="tiene_cambiador" etiqueta="Cambiador" valor={valores.tiene_cambiador} />
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-1 text-sm font-semibold">Contacto comercial publicado por el lugar</legend>
        <label className={ETIQUETA}>
          Teléfono
          <input name="contacto_telefono" type="tel" maxLength={40} defaultValue={valores.contacto_telefono ?? ''} className={CAMPO} />
        </label>
        <label className={ETIQUETA}>
          Web
          <input name="contacto_web" type="url" maxLength={300} defaultValue={valores.contacto_web ?? ''} className={CAMPO} />
        </label>
        <label className={ETIQUETA}>
          Instagram
          <input name="contacto_instagram" maxLength={300} defaultValue={valores.contacto_instagram ?? ''} placeholder="@lugar" className={CAMPO} />
        </label>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={ETIQUETA}>
          {esAlta ? 'De dónde salen los datos' : 'Fuente (dejá como está si no cambió)'}
          <select name="fuente" defaultValue="" required={esAlta} className={CAMPO}>
            <option value="">{esAlta ? 'Elegí una' : `Sin cambios (${ETIQUETA_FUENTE[valores.fuente ?? ''] ?? valores.fuente ?? '—'})`}</option>
            {FUENTES_PARA_ELEGIR.map((f) => (
              <option key={f} value={f}>
                {ETIQUETA_FUENTE[f]}
              </option>
            ))}
          </select>
        </label>
        <label className={ETIQUETA}>
          Detalle de la fuente
          <input name="fuente_detalle" maxLength={300} defaultValue={valores.fuente_detalle ?? ''} placeholder="Link o «llamado del 3/11»" className={CAMPO} />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pendiente} className="h-11 min-h-11 px-5">
          {esAlta ? 'Crear borrador' : 'Guardar cambios'}
        </Button>
        <p id="ficha-estado" role="status" aria-live="polite" className={estado?.ok === false ? 'text-sm text-error' : 'text-sm text-muted-foreground'}>
          {estado?.mensaje ?? ''}
        </p>
      </div>
    </form>
  )
}
