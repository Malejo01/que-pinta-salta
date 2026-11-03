/**
 * Q5-1 · Lugares permanentes para chicos: el tipo de dominio y la lógica pura
 * que comparten la web (admin, mapa, ficha) y la app.
 *
 * Contrato: docs/propuestas/lugares-para-chicos.md §2 y §3.4, con las
 * decisiones de Mauro de docs/tanda-q5/README.md. La tabla es
 * `public.lugares_permanentes` (migración 20261103120000).
 *
 * Nada de acá toca la red ni la base: son funciones puras y testeables.
 */
import { formatSaltaClock, formatSaltaDayKey } from '../date-format'

export const TIPOS_LUGAR = ['pelotero', 'salon_juegos', 'plaza_juegos', 'espacio_cultural_infantil'] as const
export type TipoLugarPermanente = (typeof TIPOS_LUGAR)[number]

export const ESTADOS_LUGAR = ['borrador', 'publicado', 'vencido', 'archivado'] as const
export type EstadoLugarPermanente = (typeof ESTADOS_LUGAR)[number]

export const ACCESOS_LUGAR = ['gratis', 'pago', 'consultar'] as const
export type AccesoLugar = (typeof ACCESOS_LUGAR)[number]

export const TECHADOS_LUGAR = ['techado', 'aire_libre', 'mixto'] as const
export type TechadoLugar = (typeof TECHADOS_LUGAR)[number]

/** Fuentes que alguien del equipo confirmó: las únicas que permiten publicar. */
export const FUENTES_VERIFICADAS = ['visita', 'web_oficial', 'redes_oficiales', 'llamado', 'organismo_publico'] as const
/** Las que solo sirven para arrancar un borrador. */
export const FUENTES_DE_BORRADOR = ['openstreetmap', 'pedido_publico'] as const
export type FuenteLugar = (typeof FUENTES_VERIFICADAS)[number] | (typeof FUENTES_DE_BORRADOR)[number]

export const DIAS_SEMANA = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'] as const
export type DiaSemana = (typeof DIAS_SEMANA)[number]

/** 'HH:MM', hora de pared de Salta (no es un instante: «a qué hora abre los martes»). */
export type Franja = { desde: string; hasta: string }

export type HorariosLugar = {
  version: 1
  siempre_abierto?: boolean
  solo_con_reserva?: boolean
  /** Día ausente = sin dato. Día con `[]` = cerrado. */
  semana: Partial<Record<DiaSemana, Franja[]>>
  nota?: string
}

/** Lo que lee el público (sin `cargado_por` ni `verificado_por`, decisión 8). */
export type LugarPermanentePublico = {
  id: string
  venue_id: string
  tipo: TipoLugarPermanente
  estado: EstadoLugarPermanente
  descripcion_corta: string | null
  edad_min: number | null
  edad_max: number | null
  horarios: HorariosLugar
  acceso: AccesoLugar
  nota_precio: string | null
  techado: TechadoLugar | null
  tiene_rampa: boolean | null
  tiene_bano_adaptado: boolean | null
  tiene_cambiador: boolean | null
  contacto_telefono: string | null
  contacto_web: string | null
  contacto_instagram: string | null
  fuente: FuenteLugar
  osm_ref: string | null
  verificado_at: string | null
}

/** Las columnas que puede pedir `anon` (sin las dos de quién cargó / verificó). */
export const COLUMNAS_PUBLICAS_LUGAR =
  'id, venue_id, tipo, estado, descripcion_corta, edad_min, edad_max, horarios, acceso, nota_precio, techado, tiene_rampa, tiene_bano_adaptado, tiene_cambiador, contacto_telefono, contacto_web, contacto_instagram, fuente, osm_ref, verificado_at'

export function esTipoLugar(valor: unknown): valor is TipoLugarPermanente {
  return typeof valor === 'string' && (TIPOS_LUGAR as readonly string[]).includes(valor)
}
export function esEstadoLugar(valor: unknown): valor is EstadoLugarPermanente {
  return typeof valor === 'string' && (ESTADOS_LUGAR as readonly string[]).includes(valor)
}
export function esAccesoLugar(valor: unknown): valor is AccesoLugar {
  return typeof valor === 'string' && (ACCESOS_LUGAR as readonly string[]).includes(valor)
}
export function esFuenteVerificada(valor: unknown): boolean {
  return typeof valor === 'string' && (FUENTES_VERIFICADAS as readonly string[]).includes(valor)
}

// ---------------------------------------------------------------------------
// Textos (es / en)
// ---------------------------------------------------------------------------

export type IdiomaLugar = 'es' | 'en'

export const ETIQUETA_TIPO: Record<IdiomaLugar, Record<TipoLugarPermanente, string>> = {
  es: {
    pelotero: 'Pelotero',
    salon_juegos: 'Salón de juegos',
    plaza_juegos: 'Plaza con juegos',
    espacio_cultural_infantil: 'Espacio cultural para chicos',
  },
  en: {
    pelotero: 'Indoor playground',
    salon_juegos: 'Play centre',
    plaza_juegos: 'Playground',
    espacio_cultural_infantil: 'Cultural space for kids',
  },
}

export const ETIQUETA_ACCESO: Record<IdiomaLugar, Record<AccesoLugar, string>> = {
  es: { gratis: 'Gratis', pago: 'Pago', consultar: 'Consultar precio' },
  en: { gratis: 'Free', pago: 'Paid', consultar: 'Ask for prices' },
}

export const ETIQUETA_TECHADO: Record<IdiomaLugar, Record<TechadoLugar, string>> = {
  es: { techado: 'Techado', aire_libre: 'Al aire libre', mixto: 'Techado y al aire libre' },
  en: { techado: 'Indoors', aire_libre: 'Outdoors', mixto: 'Indoors and outdoors' },
}

export const ETIQUETA_DIA: Record<IdiomaLugar, Record<DiaSemana, string>> = {
  es: { lun: 'Lunes', mar: 'Martes', mie: 'Miércoles', jue: 'Jueves', vie: 'Viernes', sab: 'Sábado', dom: 'Domingo' },
  en: { lun: 'Monday', mar: 'Tuesday', mie: 'Wednesday', jue: 'Thursday', vie: 'Friday', sab: 'Saturday', dom: 'Sunday' },
}

/** «De 2 a 10 años», «Desde 3 años», «Hasta 6 años», «Todas las edades». */
export function textoEdades(min: number | null, max: number | null, idioma: IdiomaLugar = 'es'): string {
  const es = idioma === 'es'
  if (min === null && max === null) return es ? 'Todas las edades' : 'All ages'
  if (min !== null && max !== null) {
    if (min === max) return es ? `${min} ${min === 1 ? 'año' : 'años'}` : `Age ${min}`
    return es ? `De ${min} a ${max} años` : `Ages ${min} to ${max}`
  }
  if (min !== null) return es ? `Desde ${min} ${min === 1 ? 'año' : 'años'}` : `Ages ${min} and up`
  return es ? `Hasta ${max} años` : `Up to age ${max}`
}

/** Solo lo verificado (null nunca se lee como «no»). */
export function accesibilidadVerificada(
  lugar: Pick<LugarPermanentePublico, 'tiene_rampa' | 'tiene_bano_adaptado' | 'tiene_cambiador'>,
  idioma: IdiomaLugar = 'es',
): string[] {
  const es = idioma === 'es'
  const lista: string[] = []
  if (lugar.tiene_rampa === true) lista.push(es ? 'Rampa' : 'Ramp access')
  if (lugar.tiene_bano_adaptado === true) lista.push(es ? 'Baño adaptado' : 'Accessible toilet')
  if (lugar.tiene_cambiador === true) lista.push(es ? 'Cambiador' : 'Baby changing')
  return lista
}

// ---------------------------------------------------------------------------
// Horarios
// ---------------------------------------------------------------------------

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/
const MAX_FRANJAS_POR_DIA = 2
const MAX_NOTA = 280

export type ResultadoHorarios = { ok: true; horarios: HorariosLugar } | { ok: false; error: string }

/**
 * Valida y normaliza `horarios` (§2.3). Lo usan la server action del admin, el
 * importador y el formulario público: el SQL solo exige objeto con `version`.
 */
export function validarHorarios(entrada: unknown): ResultadoHorarios {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) return { ok: false, error: 'Horarios inválidos.' }
  const h = entrada as Record<string, unknown>
  if (h.version !== 1) return { ok: false, error: 'Versión de horarios desconocida.' }
  const semanaCruda = h.semana ?? {}
  if (!semanaCruda || typeof semanaCruda !== 'object' || Array.isArray(semanaCruda)) {
    return { ok: false, error: 'La semana tiene que ser un objeto.' }
  }
  const semana: Partial<Record<DiaSemana, Franja[]>> = {}
  for (const [clave, valor] of Object.entries(semanaCruda as Record<string, unknown>)) {
    if (!(DIAS_SEMANA as readonly string[]).includes(clave)) return { ok: false, error: `Día desconocido: ${clave}.` }
    if (!Array.isArray(valor)) return { ok: false, error: `${clave}: las franjas van en una lista.` }
    if (valor.length > MAX_FRANJAS_POR_DIA) return { ok: false, error: `${clave}: hasta ${MAX_FRANJAS_POR_DIA} franjas por día.` }
    const franjas: Franja[] = []
    for (const f of valor) {
      const desde = (f as Record<string, unknown> | null)?.desde
      const hasta = (f as Record<string, unknown> | null)?.hasta
      if (typeof desde !== 'string' || typeof hasta !== 'string' || !HORA.test(desde) || !HORA.test(hasta)) {
        return { ok: false, error: `${clave}: las horas van como HH:MM.` }
      }
      if (hasta <= desde) return { ok: false, error: `${clave}: la franja no puede cruzar la medianoche.` }
      franjas.push({ desde, hasta })
    }
    franjas.sort((a, b) => a.desde.localeCompare(b.desde))
    if (franjas.length === 2 && franjas[1]!.desde < franjas[0]!.hasta) {
      return { ok: false, error: `${clave}: las franjas se pisan.` }
    }
    semana[clave as DiaSemana] = franjas
  }
  const nota = typeof h.nota === 'string' ? h.nota.trim().slice(0, MAX_NOTA) : ''
  const horarios: HorariosLugar = { version: 1, semana }
  if (h.siempre_abierto === true) horarios.siempre_abierto = true
  if (h.solo_con_reserva === true) horarios.solo_con_reserva = true
  if (nota) horarios.nota = nota
  return { ok: true, horarios }
}

/** Lee lo que vino de la base sin romper: si no valida, «sin dato». */
export function horariosSeguros(entrada: unknown): HorariosLugar {
  const r = validarHorarios(entrada)
  return r.ok ? r.horarios : { version: 1, semana: {} }
}

const DIA_POR_INDICE: DiaSemana[] = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab']

/** Día de la semana en Salta (no el del servidor ni el UTC). */
export function diaDeSemanaSalta(ahora: Date): DiaSemana {
  const clave = formatSaltaDayKey(ahora) // YYYY-MM-DD en Salta
  const [a, m, d] = clave.split('-').map(Number) as [number, number, number]
  return DIA_POR_INDICE[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]!
}

export type EstadoApertura = 'abierto' | 'cerrado' | 'con_reserva' | 'siempre_abierto' | 'sin_dato'

/** ¿Está abierto ahora, según la hora de pared de Salta? */
export function estadoApertura(horarios: HorariosLugar, ahora: Date): EstadoApertura {
  if (horarios.siempre_abierto) return 'siempre_abierto'
  if (horarios.solo_con_reserva) return 'con_reserva'
  const franjas = horarios.semana[diaDeSemanaSalta(ahora)]
  if (franjas === undefined) return 'sin_dato'
  const hora = formatSaltaClock(ahora)
  return franjas.some((f) => f.desde <= hora && hora < f.hasta) ? 'abierto' : 'cerrado'
}

/** Para el filtro «Abierto ahora»: solo lo que sabemos que está abierto. */
export function abiertoAhora(horarios: HorariosLugar, ahora: Date): boolean {
  const e = estadoApertura(horarios, ahora)
  return e === 'abierto' || e === 'siempre_abierto'
}

function textoFranjas(franjas: Franja[], idioma: IdiomaLugar): string {
  const y = idioma === 'es' ? ' y ' : ' and '
  return franjas.map((f) => (idioma === 'es' ? `${f.desde} a ${f.hasta}` : `${f.desde}–${f.hasta}`)).join(y)
}

/** «Hoy: 16:00 a 20:30», «Hoy cerrado», «Espacio abierto», «Con reserva», «Horario sin confirmar». */
export function textoHorarioDeHoy(horarios: HorariosLugar, ahora: Date, idioma: IdiomaLugar = 'es'): string {
  const es = idioma === 'es'
  if (horarios.siempre_abierto) return es ? 'Espacio abierto' : 'Open space'
  if (horarios.solo_con_reserva) return es ? 'Con reserva' : 'By reservation'
  const franjas = horarios.semana[diaDeSemanaSalta(ahora)]
  if (franjas === undefined) return es ? 'Horario sin confirmar' : 'Hours not confirmed'
  if (franjas.length === 0) return es ? 'Hoy cerrado' : 'Closed today'
  return `${es ? 'Hoy' : 'Today'}: ${textoFranjas(franjas, idioma)}`
}

/** Las 7 filas para la ficha: «Martes · 16:00 a 20:30», «Lunes · Cerrado», «Domingo · Sin dato». */
export function filasDeHorarios(horarios: HorariosLugar, idioma: IdiomaLugar = 'es'): { dia: DiaSemana; etiqueta: string; texto: string }[] {
  const es = idioma === 'es'
  return DIAS_SEMANA.map((dia) => {
    const franjas = horarios.semana[dia]
    const texto =
      franjas === undefined ? (es ? 'Sin dato' : 'No data') : franjas.length === 0 ? (es ? 'Cerrado' : 'Closed') : textoFranjas(franjas, idioma)
    return { dia, etiqueta: ETIQUETA_DIA[idioma][dia], texto }
  })
}

// ---------------------------------------------------------------------------
// Revisión periódica (§3.4): 90 días comercios, 180 días plazas y espacios
// ---------------------------------------------------------------------------

export const PLAZO_REVISION_DIAS: Record<TipoLugarPermanente, number> = {
  pelotero: 90,
  salon_juegos: 90,
  plaza_juegos: 180,
  espacio_cultural_infantil: 180,
}

const DIA_MS = 24 * 60 * 60 * 1000

export type EstadoRevision = 'sin_verificar' | 'al_dia' | 'para_revisar' | 'puede_haber_cambiado'

/** Cuándo vence la verificación (null si nunca se verificó). */
export function venceLaVerificacion(tipo: TipoLugarPermanente, verificadoAt: string | Date | null): Date | null {
  if (!verificadoAt) return null
  const t = new Date(verificadoAt).getTime()
  if (!Number.isFinite(t)) return null
  return new Date(t + PLAZO_REVISION_DIAS[tipo] * DIA_MS)
}

/**
 * al_dia → dentro del plazo; para_revisar → pasó el plazo (cola del admin);
 * puede_haber_cambiado → pasó el doble (la lista pública lo avisa). No
 * despublica nada sola: pasar a `vencido` es una decisión de un admin.
 */
export function estadoDeRevision(tipo: TipoLugarPermanente, verificadoAt: string | Date | null, ahora: Date): EstadoRevision {
  const vence = venceLaVerificacion(tipo, verificadoAt)
  if (!vence) return 'sin_verificar'
  const restante = vence.getTime() - ahora.getTime()
  if (restante >= 0) return 'al_dia'
  if (-restante > PLAZO_REVISION_DIAS[tipo] * DIA_MS) return 'puede_haber_cambiado'
  return 'para_revisar'
}

// ---------------------------------------------------------------------------
// Publicar: qué falta
// ---------------------------------------------------------------------------

export type DatosParaPublicar = {
  tipo: string | null
  acceso: string | null
  fuente: string | null
  verificado_at: string | null
  venue: { latitude: number | null; longitude: number | null; canonical_venue_id: string | null }
}

/**
 * Lista de lo que falta para publicar (vacía = se puede). La base además lo
 * exige con checks; esto es para decirle al admin qué completar.
 */
export function faltantesParaPublicar(
  d: DatosParaPublicar,
  enSalta: (lat: unknown, lng: unknown) => boolean,
  ahora: Date = new Date(),
): string[] {
  const faltan: string[] = []
  if (!esTipoLugar(d.tipo)) faltan.push('el tipo')
  if (!esAccesoLugar(d.acceso)) faltan.push('el acceso (gratis, pago o consultar)')
  if (!esFuenteVerificada(d.fuente)) faltan.push('una fuente verificada (visita, web o redes del lugar, llamado u organismo público)')
  if (!d.verificado_at) faltan.push('la fecha de verificación')
  else if (esTipoLugar(d.tipo) && estadoDeRevision(d.tipo, d.verificado_at, ahora) !== 'al_dia') {
    faltan.push('volver a verificarlo (la última verificación pasó su plazo)')
  }
  if (d.venue.canonical_venue_id) faltan.push('que el lugar sea el canónico (este está fusionado con otro)')
  if (!enSalta(d.venue.latitude, d.venue.longitude)) faltan.push('la ubicación dentro de Salta')
  return faltan
}

// ---------------------------------------------------------------------------
// Distancia (Q5-2: «Cerca mío» / «Elegí tu barrio», siempre en el navegador)
// ---------------------------------------------------------------------------

/** Distancia en línea recta, en metros (haversine). */
export function distanciaMetros(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000
  const rad = (g: number) => (g * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** «a 850 m en línea recta», «a 1,4 km en línea recta». */
export function textoDistancia(metros: number, idioma: IdiomaLugar = 'es'): string {
  const es = idioma === 'es'
  if (metros < 1000) {
    const m = Math.max(50, Math.round(metros / 50) * 50)
    return es ? `a ${m} m en línea recta` : `${m} m away (straight line)`
  }
  const km = (Math.round(metros / 100) / 10).toLocaleString(es ? 'es-AR' : 'en-GB')
  return es ? `a ${km} km en línea recta` : `${km} km away (straight line)`
}

/** Atribución ODbL de OpenStreetMap: visible donde se muestren datos de OSM. */
export const ATRIBUCION_OSM: Record<IdiomaLugar, string> = {
  es: '© colaboradores de OpenStreetMap',
  en: '© OpenStreetMap contributors',
}
export const URL_LICENCIA_OSM = 'https://www.openstreetmap.org/copyright'
