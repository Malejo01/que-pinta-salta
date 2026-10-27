// A6 (nube Q1) · Vacíos y sin conexión: los textos y las acciones de cada
// vacío de las cinco pantallas con lista — Inicio (modo categoría y "Hoy en
// Salta"), Buscar, Cines, Mis eventos (`app/(tabs)/favoritos.tsx`) y Radar
// (`components/PantallaRadar.tsx`) —, el mensaje de error de carga (sin red
// vs. el resto) y qué hacer cuando un refresco falla o vuelve a caer en lo
// guardado. Puro: sin React ni `react-native`, así se prueba con Vitest
// (`tests/vacios-sin-conexion.test.ts`: cada pantalla × cada vacío × con y
// sin conexión). Las pantallas solo dibujan lo que devuelve esto.
//
// Regla del ticket: cada vacío dice POR QUÉ está vacío y ofrece una ACCIÓN, y
// sin conexión se nota que lo que se ve es lo guardado. Sin jerga técnica en
// pantalla ("caché", "servidor", "error 500"): "lo guardado", "conexión".
//
// Tres textos siguen viviendo como literales en la pantalla porque un
// detector existente los fija ahí, y acá hay un espejo que
// `tests/vacios-sin-conexion.test.ts` compara contra el archivo real:
//   - el vacío de "Hoy en Salta" con la pill "Hoy" (texto de la web,
//     `tests/portada.test.ts`): `vacioHoyEnSalta` devuelve `null` en ese
//     caso y la portada dibuja el literal de siempre;
//   - el vacío de Mis eventos con red (`<Vacio mensaje="...Mis eventos...">`
//     literal, `tests/favoritos-pantalla.test.ts`): `VACIO_FAVORITOS`;
//   - las acciones del vacío de Buscar (`accionesVacio.push(...)` literales,
//     `tests/portada-categorias.test.ts`): `ACCIONES_VACIO_BUSCAR`, en el
//     mismo orden de prioridad que los `push` de la pantalla.
import type { Atajo } from '@qps/core/home/atajos'
import {
  MENSAJE_ERROR_SERVIDOR_CINES,
  MENSAJE_ERROR_SERVIDOR_EVENTOS,
  MENSAJE_ERROR_SERVIDOR_FAVORITOS,
  MENSAJE_ERROR_SERVIDOR_RADAR,
  MENSAJE_NO_SE_ACTUALIZO,
  MENSAJE_NO_SE_ACTUALIZO_SIN_CONEXION,
  MENSAJE_SEGUIMOS_SIN_CONEXION,
  MENSAJE_SIN_CONEXION_BUSCAR,
  MENSAJE_SIN_CONEXION_CINES,
  MENSAJE_SIN_CONEXION_RADAR,
  MENSAJE_SIN_CONEXION_SIN_GUARDADO,
  MENSAJE_SIN_CONFIGURACION,
} from '@/lib/mensajes'
import { TITULO_SIN_CONEXION } from '@/lib/sin-conexion/aviso'

/** Las cinco pantallas con lista del ticket. */
export type PantallaConLista = 'inicio' | 'buscar' | 'cines' | 'favoritos' | 'radar'

/** Cómo se nombra cada fecha dentro de una frase ("... para hoy", "... para el finde"). Igual que `FRASE_ATAJO` de la portada. */
export const FRASE_ATAJO: Record<Atajo, string> = {
  hoy: 'hoy',
  'esta-noche': 'esta noche',
  finde: 'el finde',
  semana: 'esta semana',
}

// ---------------------------------------------------------------------------
// 1. El mensaje de error de carga: sin red vs. el resto.
// ---------------------------------------------------------------------------

/** Lo que trae la rama de error de cualquier carga de lib (`{ ok: false, ... }` o `{ tipo: 'error', ... }`). */
export interface ErrorDeCarga {
  error: string
  sinConexion?: boolean
}

const SIN_CONEXION_POR_PANTALLA: Record<PantallaConLista, string> = {
  // Inicio y Mis eventos guardan lo último bueno (R43): si llegó un error
  // con `sinConexion`, es porque no había nada guardado (o venció).
  inicio: MENSAJE_SIN_CONEXION_SIN_GUARDADO,
  favoritos: MENSAJE_SIN_CONEXION_SIN_GUARDADO,
  buscar: MENSAJE_SIN_CONEXION_BUSCAR,
  cines: MENSAJE_SIN_CONEXION_CINES,
  radar: MENSAJE_SIN_CONEXION_RADAR,
}

const SERVIDOR_POR_PANTALLA: Record<PantallaConLista, string> = {
  inicio: MENSAJE_ERROR_SERVIDOR_EVENTOS,
  buscar: MENSAJE_ERROR_SERVIDOR_EVENTOS,
  cines: MENSAJE_ERROR_SERVIDOR_CINES,
  favoritos: MENSAJE_ERROR_SERVIDOR_FAVORITOS,
  radar: MENSAJE_ERROR_SERVIDOR_RADAR,
}

/**
 * El texto de `ErrorCarga` para `pantalla`. Con `sinConexion`, el de "no
 * hay conexión" de esa pantalla; con `MENSAJE_SIN_CONFIGURACION` (la app sin
 * la configuración de datos), ese mismo texto tal cual — es para el equipo,
 * no tiene que ver con la red; con cualquier otro error (un 5xx), el neutro
 * de la pantalla, que nunca dice "Revisá tu conexión".
 */
export function mensajeErrorCarga(pantalla: PantallaConLista, { error, sinConexion }: ErrorDeCarga): string {
  if (sinConexion) return SIN_CONEXION_POR_PANTALLA[pantalla]
  if (error === MENSAJE_SIN_CONFIGURACION) return error
  return SERVIDOR_POR_PANTALLA[pantalla]
}

// ---------------------------------------------------------------------------
// 2. Refrescos: con lo de antes a la vista, qué queda y qué se avisa.
// ---------------------------------------------------------------------------

/**
 * Lo mínimo que `decidirRefresco` mira de cada estado de pantalla: `tipo`
 * (`'ok'`, `'error'` o lo que sea de cada pantalla: `'cargando'`,
 * `'invitar'`...), `desdeCache` en la rama `'ok'` (Inicio y Mis eventos) y
 * `sinConexion` en la rama `'error'`.
 */
export interface EstadoRefrescable {
  tipo: string
  desdeCache?: { guardadoEn: Date } | null
  sinConexion?: boolean
}

export interface DecisionRefresco<E> {
  /** El estado que queda en pantalla. */
  estado: E
  /** Lo que se le anuncia al lector de pantalla (`announceForAccessibility`), o `null`. */
  anuncio: string | null
  /**
   * La línea visible junto al aviso ("Seguimos sin conexión...", "No
   * pudimos actualizar..."), o `null`. `TITULO_SIN_CONEXION` nunca va acá:
   * eso ya lo dice `AvisoSinConexion`.
   */
  nota: string | null
}

/**
 * Pura. Un refresco (tirar para abajo, o "Reintentar" con algo ya a la
 * vista) terminó en `nuevo`, con `previo` en pantalla:
 *
 * - si `nuevo` es un error y `previo` tenía datos (`'ok'`, frescos o
 *   guardados), se CONSERVA `previo` — nunca se cambia una lista que se
 *   estaba viendo por un "No pudimos cargar..." — y se avisa que no se pudo
 *   actualizar (con el porqué: sin conexión, o el texto neutro);
 * - si `nuevo` vuelve a venir de lo guardado y `previo` también, queda
 *   `nuevo` y se avisa "Seguimos sin conexión" (si no, "Reintentar" parecía
 *   no hacer nada);
 * - si `nuevo` viene de lo guardado y `previo` era una carga fresca, queda
 *   `nuevo`: el aviso de sin conexión aparece solo, y se anuncia su título
 *   (Android no anuncia una live region al montarse, R69 69-b);
 * - en cualquier otro caso queda `nuevo`, sin aviso.
 */
export function decidirRefresco<E extends EstadoRefrescable>(previo: E, nuevo: E): DecisionRefresco<E> {
  if (nuevo.tipo === 'error' && previo.tipo === 'ok') {
    const texto = nuevo.sinConexion ? MENSAJE_NO_SE_ACTUALIZO_SIN_CONEXION : MENSAJE_NO_SE_ACTUALIZO
    return { estado: previo, anuncio: texto, nota: texto }
  }

  if (nuevo.tipo === 'ok' && nuevo.desdeCache) {
    if (previo.tipo === 'ok' && previo.desdeCache) {
      return { estado: nuevo, anuncio: MENSAJE_SEGUIMOS_SIN_CONEXION, nota: MENSAJE_SEGUIMOS_SIN_CONEXION }
    }
    return { estado: nuevo, anuncio: TITULO_SIN_CONEXION, nota: null }
  }

  return { estado: nuevo, anuncio: null, nota: null }
}

// ---------------------------------------------------------------------------
// 3. Inicio: "Hoy en Salta" y el modo categoría.
// ---------------------------------------------------------------------------

/** A dónde lleva la acción de un vacío de Inicio. */
export type DestinoInicio = { tipo: 'atajo'; atajo: Atajo } | { tipo: 'buscar' }

export interface VacioConAccion<D> {
  texto: string
  accion: { texto: string; destino: D }
}

export interface EntradaVacioHoy {
  /** La pill elegida. "Hoy en Salta" se arma con los eventos de HOY dentro de esa pill. */
  atajo: Atajo
  /** Si la pill elegida tiene algún evento (aunque no sea de hoy): ahí están, más abajo, en las filas por categoría. */
  hayEventosEnAtajo: boolean
  /** Si lo que se ve es lo último guardado (sin conexión). */
  desdeCache: boolean
}

/**
 * Pura. El vacío de "Hoy en Salta" (la caja de `estilos.vacioHoy`, ~188 dp:
 * NUNCA más chica, la regla (a) del anuncio cuenta con ese alto — ver el
 * docstring de `seccionesPortada`). Hasta A6 decía "Hoy no hay eventos
 * cargados" con cualquier pill, aunque con "Finde" o "Semana" hubiera
 * eventos más abajo, y con "Semana" ofrecía "Ver esta semana": el mismo
 * atajo en el que ya se estaba.
 *
 * `null` = el caso de siempre (pill "Hoy", con conexión): la portada dibuja
 * el texto literal de la web y "Ver esta semana" (los fija
 * `tests/portada.test.ts`). En cualquier otro caso, un texto propio de la
 * pill y una acción que nunca es la pill elegida.
 */
export function vacioHoyEnSalta({ atajo, hayEventosEnAtajo, desdeCache }: EntradaVacioHoy): VacioConAccion<DestinoInicio> | null {
  const verSemana = { texto: 'Ver esta semana', destino: { tipo: 'atajo', atajo: 'semana' } } as const
  const verHoy = { texto: 'Ver lo de hoy', destino: { tipo: 'atajo', atajo: 'hoy' } } as const

  if (atajo === 'hoy') {
    if (!desdeCache) return null
    return {
      texto: 'En lo último guardado no hay eventos para hoy. Mirá qué viene en los próximos días.',
      accion: verSemana,
    }
  }

  if (atajo === 'esta-noche') {
    return {
      texto: desdeCache
        ? 'En lo último guardado no hay eventos para esta noche. Fijate qué hay durante el día.'
        : 'Esta noche no hay eventos cargados. Fijate qué hay durante el día o en los próximos días.',
      accion: verHoy,
    }
  }

  if (atajo === 'finde') {
    if (hayEventosEnAtajo) {
      return {
        texto: 'Hoy no hay eventos del finde. Lo que viene el finde está más abajo, por categoría.',
        accion: verHoy,
      }
    }
    return {
      texto: desdeCache
        ? 'En lo último guardado no hay eventos para el finde. Mirá qué viene en la semana.'
        : 'No hay eventos cargados para el finde. Mirá qué viene en la semana.',
      accion: verSemana,
    }
  }

  // atajo === 'semana'
  if (hayEventosEnAtajo) {
    return {
      texto: 'Hoy no hay eventos cargados. Lo que viene esta semana está más abajo, por categoría.',
      accion: { texto: 'Ver el finde', destino: { tipo: 'atajo', atajo: 'finde' } },
    }
  }
  return {
    texto: desdeCache
      ? 'En lo último guardado no hay eventos para esta semana. Buscá entre todas las fechas.'
      : 'No hay eventos cargados para esta semana. Buscá entre todas las fechas.',
    accion: { texto: 'Buscar en todas las fechas', destino: { tipo: 'buscar' } },
  }
}

/**
 * Pura. El texto del vacío del modo categoría de Inicio (R66, 66-c). Las dos
 * acciones de esa caja no cambian ("Ver <Nombre> en todas las fechas" / "Ver
 * cartelera" y "Todas las categorías": `tests/portada-categorias.test.ts`
 * exige exactamente esos dos botones); lo que suma A6 es el porqué: con el
 * cine se aclara que tampoco hay películas en cartel, y sin conexión, que es
 * lo último guardado.
 */
export function textoVacioCategoria({
  nombre,
  atajo,
  esCine,
  desdeCache,
}: {
  nombre: string
  atajo: Atajo
  esCine: boolean
  desdeCache: boolean
}): string {
  const que = esCine ? `películas en cartel ni eventos de ${nombre}` : `eventos de ${nombre}`
  return desdeCache
    ? `En lo último guardado no hay ${que} para ${FRASE_ATAJO[atajo]}.`
    : `No hay ${que} para ${FRASE_ATAJO[atajo]}.`
}

// ---------------------------------------------------------------------------
// 4. Buscar.
// ---------------------------------------------------------------------------

/** Cuántos botones, como mucho, en un vacío: a 360 dp, con la cabecera fija (~228 dp) y el mensaje, un cuarto ya queda abajo del pliegue. */
export const MAXIMO_ACCIONES_VACIO = 3

export interface FiltrosBuscar {
  texto: string
  soloGratis: boolean
  /** El nombre de la categoría elegida (o `null`). */
  nombreCategoria: string | null
  atajo: Atajo | null
}

/**
 * Pura. El mensaje del vacío de resultados de Buscar: nombra cada filtro
 * activo (ese es el porqué). Hasta A6, con texto se perdía "gratis"
 * ("No se encontraron eventos para "x"" con "Solo gratis" prendido).
 */
export function textoSinResultadosBuscar({ texto, soloGratis, nombreCategoria, atajo }: FiltrosBuscar): string {
  const gratis = soloGratis ? ' gratis' : ''
  const enCategoria = nombreCategoria ? ` en ${nombreCategoria}` : ''
  if (texto) {
    const sufijoFecha = atajo ? ` · ${FRASE_ATAJO[atajo]}` : ''
    return `No se encontraron eventos${gratis} para "${texto}"${enCategoria}${sufijoFecha}`
  }
  const cuando = atajo ? ` para ${FRASE_ATAJO[atajo]}` : ' por ahora'
  return `No hay eventos${gratis}${enCategoria}${cuando}.`
}

/**
 * Los textos de las salidas del vacío de Buscar, en orden de prioridad (el
 * mismo orden de los `accionesVacio.push(...)` de la pantalla, que
 * `tests/vacios-sin-conexion.test.ts` compara): primero lo que más achica
 * (el texto), después la fecha, "Solo gratis" y la categoría — la última
 * porque los chips de categoría, con "Todas", están justo arriba del vacío.
 */
export const ACCIONES_VACIO_BUSCAR = {
  texto: 'Limpiar búsqueda',
  atajo: 'Ver todas las fechas',
  soloGratis: 'Sacar “Solo gratis”',
  categoria: 'Todas las categorías',
} as const

/** Pura. Qué salidas ofrece el vacío de Buscar con estos filtros (como mucho `MAXIMO_ACCIONES_VACIO`, por prioridad). */
export function accionesVacioBuscar({ texto, soloGratis, nombreCategoria, atajo }: FiltrosBuscar): string[] {
  const acciones: string[] = []
  if (texto) acciones.push(ACCIONES_VACIO_BUSCAR.texto)
  if (atajo !== null) acciones.push(ACCIONES_VACIO_BUSCAR.atajo)
  if (soloGratis) acciones.push(ACCIONES_VACIO_BUSCAR.soloGratis)
  if (nombreCategoria !== null) acciones.push(ACCIONES_VACIO_BUSCAR.categoria)
  return acciones.slice(0, MAXIMO_ACCIONES_VACIO)
}

/** La grilla "Explorar por categoria" sin categorías (la carga salió bien pero vino vacía): porqué + Reintentar. */
export const VACIO_CATEGORIAS_BUSCAR = 'Todavía no hay categorías cargadas. Puede ser algo de un momento: tocá Reintentar.'

// ---------------------------------------------------------------------------
// 5. Cines.
// ---------------------------------------------------------------------------

export type AccionCines = 'limpiar-busqueda' | 'ver-eventos-de-hoy'

/**
 * Pura. El vacío de Cines: con búsqueda, el texto de la web
 * (`CinesView`) + "Limpiar búsqueda"; sin búsqueda, por qué no hay nada (la
 * cartelera del día todavía no se cargó) + "Ver eventos de hoy" (Buscar con
 * la fecha "Hoy").
 */
export function vacioCines(busqueda: string): VacioConAccion<AccionCines> {
  if (busqueda) {
    return {
      texto: `No hay resultados para "${busqueda}". Probá buscando con otro título.`,
      accion: { texto: 'Limpiar búsqueda', destino: 'limpiar-busqueda' },
    }
  }
  return {
    texto: 'Todavía no hay películas cargadas en la cartelera de hoy. Mientras tanto, mirá qué otros eventos hay.',
    accion: { texto: 'Ver eventos de hoy', destino: 'ver-eventos-de-hoy' },
  }
}

// ---------------------------------------------------------------------------
// 6. Mis eventos (Favoritos).
// ---------------------------------------------------------------------------

/**
 * El vacío de Mis eventos con conexión. Espejo del literal de
 * `app/(tabs)/favoritos.tsx` (`<Vacio mensaje="..."`), que tiene que seguir
 * siendo literal con "Mis eventos" (`tests/favoritos-pantalla.test.ts`).
 */
export const VACIO_FAVORITOS = {
  mensaje: 'Todavía no guardaste ningún evento en Mis eventos. Tocá el corazón o “Voy” en un evento y aparece acá.',
  textoAccion: 'Ver la agenda',
} as const

/** El vacío de Mis eventos mostrando lo guardado: lo que había ya pasó (lo guardado nunca muestra eventos pasados). */
export const VACIO_FAVORITOS_GUARDADO = {
  mensaje: 'En lo último guardado no queda ningún evento por venir: los que ya pasaron no se muestran.',
  textoAccion: 'Ver la agenda',
} as const

/** La línea de más del aviso de Mis eventos sin conexión (R43: `paraMostrarFavoritos` saca los pasados). */
export const DETALLE_FAVORITOS_GUARDADO = 'De lo guardado, no mostramos los eventos que ya pasaron.'

/** Pura. Qué vacío de Mis eventos va. */
export function vacioFavoritos(desdeCache: boolean): { mensaje: string; textoAccion: string } {
  return desdeCache ? VACIO_FAVORITOS_GUARDADO : VACIO_FAVORITOS
}

// ---------------------------------------------------------------------------
// 7. Radar.
// ---------------------------------------------------------------------------

/** Encima de "Ingresar para armar tu Radar" (sin sesión, con conexión): para qué entrar. */
export const TEXTO_RADAR_SIN_SESION = 'Entrá con tu cuenta para elegir qué eventos te llegan al correo.'

/** La grilla de categorías del Radar, vacía: por qué, y qué sí se puede hacer mientras tanto. */
export const TEXTO_RADAR_SIN_CATEGORIAS =
  'Todavía no hay categorías para elegir. Mientras tanto, podés seguir lugares y cuentas de Instagram acá abajo.'

/**
 * Pura. El buscador de lugares y cuentas del Radar sin sugerencias. Si lo
 * buscado coincide con algo que ya se sigue (las sugerencias excluyen lo ya
 * elegido), se dice eso en vez de "no hay coincidencias". Siempre con
 * "Limpiar" (vacía el buscador).
 */
export function vacioBuscadorRadar({
  busqueda,
  coincideConLoQueYaSeguis,
}: {
  busqueda: string
  coincideConLoQueYaSeguis: boolean
}): { texto: string; textoAccion: string } {
  const buscado = busqueda.trim()
  return {
    texto: coincideConLoQueYaSeguis
      ? `Ya seguís todo lo que coincide con "${buscado}".`
      : `No encontramos lugares ni cuentas con "${buscado}". Probá con otro nombre.`,
    textoAccion: 'Limpiar',
  }
}
