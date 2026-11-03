/**
 * Q5-1 · Lectura y validación del formulario de la ficha de un lugar para
 * chicos (/admin/lugares-chicos). Pura: recibe lo que trae el FormData como
 * un `(clave) => string | null` y devuelve el payload para la base o un error
 * en castellano. La server action solo agrega sesión, rol y la escritura.
 *
 * Los horarios llegan como una grilla de 7 días, nunca como JSON a mano
 * (§3.1): `h_<dia>_modo` = 'sin_dato' | 'cerrado' | 'franjas', y
 * `h_<dia>_<1|2>_desde` / `_hasta`. Más `h_siempre_abierto`,
 * `h_solo_con_reserva` y `h_nota`.
 */
import {
  ACCESOS_LUGAR,
  DIAS_SEMANA,
  FUENTES_VERIFICADAS,
  TECHADOS_LUGAR,
  esAccesoLugar,
  esTipoLugar,
  validarHorarios,
  type AccesoLugar,
  type DiaSemana,
  type Franja,
  type HorariosLugar,
  type TechadoLugar,
  type TipoLugarPermanente,
} from '@qps/core/lugares/permanentes'

export type Leer = (clave: string) => string | null

export function leerDeFormData(fd: FormData): Leer {
  return (clave) => {
    const v = fd.get(clave)
    return typeof v === 'string' ? v : null
  }
}

/** Lo editable de la ficha (sin estado, sin verificación, sin venue). */
export type DatosFicha = {
  tipo: TipoLugarPermanente
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
  fuente_detalle: string | null
}

export type ResultadoFicha = { ok: true; datos: DatosFicha } | { ok: false; error: string }

function texto(leer: Leer, clave: string, max: number): string | null {
  const v = leer(clave)?.trim() ?? ''
  if (!v) return null
  return v.slice(0, max)
}

function edad(leer: Leer, clave: string): number | null | 'invalida' {
  const v = leer(clave)?.trim() ?? ''
  if (!v) return null
  if (!/^\d{1,2}$/.test(v)) return 'invalida'
  const n = Number(v)
  return n >= 0 && n <= 17 ? n : 'invalida'
}

/** 'si' → true, 'no' → false, cualquier otra cosa → null (no verificado). */
function triestado(leer: Leer, clave: string): boolean | null {
  const v = leer(clave)
  if (v === 'si') return true
  if (v === 'no') return false
  return null
}

export function normalizarWeb(valor: string | null): string | null | 'invalida' {
  if (!valor) return null
  const v = /^https?:\/\//i.test(valor) ? valor : `https://${valor}`
  try {
    const u = new URL(v)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'invalida'
    if (!u.hostname.includes('.')) return 'invalida'
    return u.toString()
  } catch {
    return 'invalida'
  }
}

/** Acepta «@usuario», «usuario» o el link; guarda siempre https://www.instagram.com/usuario/. */
export function normalizarInstagram(valor: string | null): string | null | 'invalida' {
  if (!valor) return null
  const v = valor.trim()
  const m = v.match(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]{1,30})\/?(?:\?.*)?$/i) ?? v.match(/^@?([A-Za-z0-9._]{1,30})$/)
  if (!m) return 'invalida'
  return `https://www.instagram.com/${m[1]}/`
}

export function leerHorarios(leer: Leer): { ok: true; horarios: HorariosLugar } | { ok: false; error: string } {
  const semana: Partial<Record<DiaSemana, Franja[]>> = {}
  for (const dia of DIAS_SEMANA) {
    const modo = leer(`h_${dia}_modo`) ?? 'sin_dato'
    if (modo === 'sin_dato') continue
    if (modo === 'cerrado') {
      semana[dia] = []
      continue
    }
    if (modo !== 'franjas') return { ok: false, error: 'Horarios inválidos.' }
    const franjas: Franja[] = []
    for (const n of [1, 2]) {
      const desde = leer(`h_${dia}_${n}_desde`)?.trim() ?? ''
      const hasta = leer(`h_${dia}_${n}_hasta`)?.trim() ?? ''
      if (!desde && !hasta) continue
      franjas.push({ desde, hasta })
    }
    if (franjas.length === 0) return { ok: false, error: `${dia}: cargá al menos una franja o marcalo cerrado / sin dato.` }
    semana[dia] = franjas
  }
  return validarHorarios({
    version: 1,
    semana,
    siempre_abierto: leer('h_siempre_abierto') === 'on',
    solo_con_reserva: leer('h_solo_con_reserva') === 'on',
    nota: leer('h_nota') ?? undefined,
  })
}

export function leerFicha(leer: Leer): ResultadoFicha {
  const tipo = leer('tipo')
  if (!esTipoLugar(tipo)) return { ok: false, error: 'Elegí el tipo de lugar.' }
  const acceso = leer('acceso') ?? 'consultar'
  if (!esAccesoLugar(acceso)) return { ok: false, error: `El acceso va como ${ACCESOS_LUGAR.join(', ')}.` }

  const edadMin = edad(leer, 'edad_min')
  const edadMax = edad(leer, 'edad_max')
  if (edadMin === 'invalida' || edadMax === 'invalida') return { ok: false, error: 'Las edades van de 0 a 17.' }
  if (edadMin !== null && edadMax !== null && edadMin > edadMax) {
    return { ok: false, error: 'La edad mínima no puede ser mayor que la máxima.' }
  }

  const techadoCrudo = leer('techado') ?? ''
  const techado = (TECHADOS_LUGAR as readonly string[]).includes(techadoCrudo) ? (techadoCrudo as TechadoLugar) : null

  const web = normalizarWeb(texto(leer, 'contacto_web', 300))
  if (web === 'invalida') return { ok: false, error: 'La web no parece un link válido.' }
  const instagram = normalizarInstagram(texto(leer, 'contacto_instagram', 300))
  if (instagram === 'invalida') return { ok: false, error: 'El Instagram va como @usuario o el link del perfil.' }

  const telefono = texto(leer, 'contacto_telefono', 40)
  if (telefono && !/^[0-9+()\-\s]{6,40}$/.test(telefono)) return { ok: false, error: 'El teléfono solo lleva números, espacios, +, - y paréntesis.' }

  const horarios = leerHorarios(leer)
  if (!horarios.ok) return horarios

  return {
    ok: true,
    datos: {
      tipo,
      descripcion_corta: texto(leer, 'descripcion_corta', 280),
      edad_min: edadMin,
      edad_max: edadMax,
      horarios: horarios.horarios,
      acceso,
      nota_precio: texto(leer, 'nota_precio', 200),
      techado,
      tiene_rampa: triestado(leer, 'tiene_rampa'),
      tiene_bano_adaptado: triestado(leer, 'tiene_bano_adaptado'),
      tiene_cambiador: triestado(leer, 'tiene_cambiador'),
      contacto_telefono: telefono,
      contacto_web: web,
      contacto_instagram: instagram,
      fuente_detalle: texto(leer, 'fuente_detalle', 300),
    },
  }
}

/** Fuente de la verificación: solo las que confirmó alguien del equipo. */
export function leerFuenteVerificada(leer: Leer): (typeof FUENTES_VERIFICADAS)[number] | null {
  const f = leer('fuente')
  return (FUENTES_VERIFICADAS as readonly string[]).includes(f ?? '') ? (f as (typeof FUENTES_VERIFICADAS)[number]) : null
}

export const MOTIVOS_ARCHIVO = ['Cerró', 'Se mudó', 'Ya no tiene juegos', 'Duplicado', 'Pedido del lugar', 'Funciona en una casa particular'] as const

export function leerMotivoArchivo(leer: Leer): string | null {
  const v = leer('motivo_archivo')?.trim() ?? ''
  if (!v) return null
  return v.slice(0, 200)
}
