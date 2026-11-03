// A6 (nube Q1) · Vacíos y sin conexión: los textos y las acciones de cada
// vacío de las cinco pantallas con lista — Inicio (modo categoría y "Hoy en
// Salta"), Buscar, Cines, Mis eventos (`app/(tabs)/favoritos.tsx`) y Radar
// (`components/PantallaRadar.tsx`) —, el mensaje de error de carga (sin red
// vs. el resto) y qué hacer cuando un refresco falla o vuelve a caer en la
// copia sin conexión. Puro: sin React ni `react-native`, así se prueba con
// Vitest (`tests/vacios-sin-conexion.test.ts`: cada pantalla × cada vacío ×
// con y sin conexión). Las pantallas solo dibujan lo que devuelve esto.
//
// Regla del ticket: cada vacío dice POR QUÉ está vacío y ofrece una ACCIÓN, y
// sin conexión se nota que lo que se ve es la copia de la última vez. Sin
// jerga técnica en pantalla ("caché", "servidor", "error 500"), y sin
// "guardado" para esa copia (ronda de correcciones de A6: en la app
// "guardar" es el corazón); sin "cargados" en los textos nuevos.
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
//     mismo orden de prioridad y con las mismas condiciones que los `push`
//     de la pantalla.
import type { Atajo } from '@qps/core/home/atajos'
import {
  MENSAJE_SIN_CONEXION_BUSCAR,
  MENSAJE_SIN_CONEXION_CINES,
  MENSAJE_SIN_CONEXION_FAVORITOS,
  MENSAJE_SIN_CONEXION_INICIO,
  MENSAJE_SIN_CONEXION_RADAR,
  MENSAJE_SIN_CONFIGURACION,
} from '@/lib/mensajes'
import { es } from '@/lib/i18n/diccionarios/es'
import type { Idioma } from '@/lib/i18n/idioma'
import { textosDe } from '@/lib/i18n/textos'

/** Las cinco pantallas con lista del ticket. */
export type PantallaConLista = 'inicio' | 'buscar' | 'cines' | 'favoritos' | 'radar'

/** Cómo se nombra cada fecha dentro de una frase ("... para hoy", "... para el finde"). */
// Q6-1: los textos de este archivo viven en el diccionario (`vacios`,
// `mensajes`, `portada.frases`); cada función recibe el idioma al final
// (castellano si no se pasa) y las constantes quedan en castellano.
export const FRASE_ATAJO: Record<Atajo, string> = es.portada.frases

// ---------------------------------------------------------------------------
// 1. El mensaje de error de carga: sin red vs. el resto.
// ---------------------------------------------------------------------------

/** Lo que trae la rama de error de cualquier carga de lib (`{ ok: false, ... }` o `{ tipo: 'error', ... }`). */
export interface ErrorDeCarga {
  error: string
  sinConexion?: boolean
}

/**
 * Sin red, por pantalla. En Inicio y Mis eventos (las que muestran la copia
 * de la R43) un error con `sinConexion` quiere decir que no había copia o
 * que venció: por eso el texto no dice "todavía no hay" ni promete nada. Mis
 * eventos y Radar usan el mismo texto sin sesión por falta de red.
 */
export const SIN_CONEXION_POR_PANTALLA: Record<PantallaConLista, string> = {
  inicio: MENSAJE_SIN_CONEXION_INICIO,
  favoritos: MENSAJE_SIN_CONEXION_FAVORITOS,
  buscar: MENSAJE_SIN_CONEXION_BUSCAR,
  cines: MENSAJE_SIN_CONEXION_CINES,
  radar: MENSAJE_SIN_CONEXION_RADAR,
}


/**
 * El texto de `ErrorCarga` para `pantalla`. Con `sinConexion`, el de "no
 * hay conexión" de esa pantalla; con `MENSAJE_SIN_CONFIGURACION` (la app sin
 * la configuración de datos), ese mismo texto tal cual — es para el equipo,
 * no tiene que ver con la red; con cualquier otro error (un 5xx), el neutro
 * de la pantalla, que nunca dice "Revisá tu conexión".
 */
export function mensajeErrorCarga(pantalla: PantallaConLista, { error, sinConexion }: ErrorDeCarga, idioma: Idioma = 'es'): string {
  const t = textosDe(idioma).mensajes
  if (sinConexion) return t.sinConexion[pantalla]
  if (error === MENSAJE_SIN_CONFIGURACION) return t.sinConfiguracion
  return t.servidor[pantalla]
}

/**
 * Pura. "Reintentar" de `ErrorCarga` volvió a terminar en un error: se
 * anuncia el texto (si no, para el lector de pantalla parecía que el botón
 * no hizo nada — la pantalla pasa por `Cargando` y vuelve al mismo
 * mensaje). `null` en la primera carga (no hubo reintento) o si salió bien.
 */
export function anuncioDeReintento(esReintento: boolean, resultado: { tipo: string; error?: string }): string | null {
  if (!esReintento || resultado.tipo !== 'error' || !resultado.error) return null
  return resultado.error
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
   * La línea visible junto al aviso ("Probamos de nuevo y seguimos sin
   * conexión.", "No pudimos actualizar..."), o `null`. `TITULO_SIN_CONEXION`
   * nunca va acá: eso ya lo dice `AvisoSinConexion`.
   */
  nota: string | null
}

/**
 * Pura. Un refresco (tirar para abajo, o "Reintentar" con algo ya a la
 * vista) terminó en `nuevo`, con `previo` en pantalla y `notaPrevia` (la
 * nota que había, si había):
 *
 * - si `nuevo` es un error y `previo` tenía datos (`'ok'`, frescos o la
 *   copia), se CONSERVA `previo` — nunca se cambia una lista que se estaba
 *   viendo por un "No pudimos cargar..." — y se avisa que no se pudo
 *   actualizar (con el porqué: sin conexión, o el texto neutro);
 * - si `nuevo` vuelve a ser la copia y `previo` también, queda `nuevo` y se
 *   avisa "Probamos de nuevo y seguimos sin conexión." (si no, "Reintentar"
 *   parecía no hacer nada);
 * - si `nuevo` es la copia y `previo` era una carga fresca, queda `nuevo`: el
 *   aviso de sin conexión aparece solo, y se anuncia su título (Android no
 *   anuncia una live region al montarse, R69 69-b);
 * - si `nuevo` es fresco y `previo` era la copia, se anuncia "Volvió la
 *   conexión."; si `previo` era fresco pero había una banda de "No pudimos
 *   actualizar", "Listo, actualizado." (la banda se va);
 * - en cualquier otro caso queda `nuevo`, sin aviso.
 */
export function decidirRefresco<E extends EstadoRefrescable>(
  previo: E,
  nuevo: E,
  notaPrevia: string | null = null,
  idioma: Idioma = 'es',
): DecisionRefresco<E> {
  const t = textosDe(idioma).mensajes
  if (nuevo.tipo === 'error' && previo.tipo === 'ok') {
    const texto = nuevo.sinConexion ? t.noSeActualizoSinConexion : t.noSeActualizo
    return { estado: previo, anuncio: texto, nota: texto }
  }

  if (nuevo.tipo === 'ok' && nuevo.desdeCache) {
    if (previo.tipo === 'ok' && previo.desdeCache) {
      return { estado: nuevo, anuncio: t.seguimosSinConexion, nota: t.seguimosSinConexion }
    }
    return { estado: nuevo, anuncio: t.tituloSinConexion, nota: null }
  }

  if (nuevo.tipo === 'ok' && previo.tipo === 'ok') {
    if (previo.desdeCache) return { estado: nuevo, anuncio: t.volvioLaConexion, nota: null }
    if (notaPrevia) return { estado: nuevo, anuncio: t.actualizado, nota: null }
  }

  return { estado: nuevo, anuncio: null, nota: null }
}

/**
 * Lo que devuelve `reintentarSesion()` (`lib/session`): volvió la sesión, la
 * red sigue caída (`isAuthRetryableFetchError`), o la sesión ya no existe
 * (por ejemplo, el token fue revocado: llega un `SIGNED_OUT`).
 */
export type ResultadoReintentoSesion = 'volvio' | 'sin-red' | 'sin-sesion'

/**
 * Pura. Qué se anuncia/ve después de "Reintentar" sin sesión (Mis eventos y
 * Radar): "Volvió la conexión." si volvió; "Probamos de nuevo y seguimos sin
 * conexión." solo si la red sigue caída; nada si la sesión ya no existe (la
 * pantalla pasa sola a "Entrá…"/"Ingresar…" con el `SIGNED_OUT`).
 */
export function avisoReintentoSesion(
  resultado: ResultadoReintentoSesion,
  idioma: Idioma = 'es',
): { anuncio: string | null; nota: string | null } {
  const t = textosDe(idioma).mensajes
  if (resultado === 'volvio') return { anuncio: t.volvioLaConexion, nota: null }
  if (resultado === 'sin-red') return { anuncio: t.seguimosSinConexion, nota: t.seguimosSinConexion }
  return { anuncio: null, nota: null }
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
  /** La pill elegida. "Hoy en Salta" se arma con los eventos del DÍA de hoy (`date === hoy`) dentro de esa pill. */
  atajo: Atajo
  /**
   * Si la pill elegida tiene algún evento (aunque no sea del día de hoy):
   * ahí están, más abajo, en las filas por categoría. Ojo con "Esta noche":
   * su ventana va de las 19:00 a las 05:59, así que un boliche a las 00:30
   * está en la pill pero NO en "Hoy en Salta" (es de mañana por fecha).
   */
  hayEventosEnAtajo: boolean
  /** Si el finde tiene eventos (para no ofrecer "Ver el finde" desde "Semana" cuando el finde está vacío). */
  hayEventosEnFinde: boolean
  /** Si lo que se ve es la copia sin conexión. */
  desdeCache: boolean
  /** Q6-1: el idioma de los textos (castellano si no se pasa). */
  idioma?: Idioma
}

/**
 * Pura. El vacío de "Hoy en Salta". Hasta A6 decía "Hoy no hay eventos
 * cargados" con cualquier pill, aunque con "Esta noche", "Finde" o "Semana"
 * hubiera eventos más abajo, y con "Semana" ofrecía "Ver esta semana": el
 * mismo atajo en el que ya se estaba.
 *
 * `null` = el caso de siempre (pill "Hoy", con conexión): la portada dibuja
 * el texto literal de la web y "Ver esta semana" (los fija
 * `tests/portada.test.ts`). En cualquier otro caso, un texto propio de la
 * pill y una acción que nunca es la pill elegida. Los textos son más cortos
 * que el de la web: la caja no depende de eso para su alto, que lo fija
 * `estilos.vacioHoyAlto` (minHeight 188, la cuenta de la regla (a) del
 * anuncio en el docstring de `seccionesPortada`).
 */
export function vacioHoyEnSalta({
  atajo,
  hayEventosEnAtajo,
  hayEventosEnFinde,
  desdeCache,
  idioma = 'es',
}: EntradaVacioHoy): VacioConAccion<DestinoInicio> | null {
  const t = textosDe(idioma).vacios
  const p = textosDe(idioma).portada
  const verSemana = { texto: p.verEstaSemana, destino: { tipo: 'atajo', atajo: 'semana' } } as const
  const verHoy = { texto: p.verLoDeHoy, destino: { tipo: 'atajo', atajo: 'hoy' } } as const
  const buscarTodas = { texto: p.buscarEnTodasLasFechas, destino: { tipo: 'buscar' } } as const

  if (atajo === 'hoy') {
    if (!desdeCache) return null
    return { texto: t.hoySinConexion, accion: verSemana }
  }

  if (atajo === 'esta-noche') {
    if (hayEventosEnAtajo) return { texto: t.nocheEnFilas, accion: verHoy }
    return {
      texto: desdeCache
        ? t.nocheSinConexion
        : t.nocheVacia,
      accion: verHoy,
    }
  }

  if (atajo === 'finde') {
    if (hayEventosEnAtajo) return { texto: t.findeEnFilas, accion: verHoy }
    return {
      texto: desdeCache
        ? t.findeSinConexion
        : t.findeVacio,
      accion: verSemana,
    }
  }

  // atajo === 'semana'
  if (hayEventosEnAtajo) {
    return {
      texto: t.semanaEnFilas,
      accion: hayEventosEnFinde ? { texto: p.verElFinde, destino: { tipo: 'atajo', atajo: 'finde' } } : buscarTodas,
    }
  }
  return {
    texto: desdeCache
      ? t.semanaSinConexion
      : t.semanaVacia,
    accion: buscarTodas,
  }
}

/**
 * Pura. El texto del vacío del modo categoría de Inicio (R66, 66-c). Las dos
 * acciones de esa caja no cambian ("Ver <Nombre> en todas las fechas" / "Ver
 * cartelera" y "Todas las categorías": `tests/portada-categorias.test.ts`
 * exige exactamente esos dos botones); lo que suma A6 es el porqué: con el
 * cine se aclara que tampoco hay películas en cartel, y sin conexión, que no
 * se ve lo de ahora. Con el cine y sin conexión, la caja vacía quiere decir
 * que la copia no trae películas — es de otro día y la cartelera de ayer no
 * sirve (`paraMostrar`, R43) —: se dice eso.
 */
export function textoVacioCategoria({
  nombre,
  atajo,
  esCine,
  desdeCache,
  idioma = 'es',
}: {
  nombre: string
  atajo: Atajo
  esCine: boolean
  desdeCache: boolean
  idioma?: Idioma
}): string {
  const t = textosDe(idioma).vacios
  const frase = textosDe(idioma).portada.frases[atajo]
  if (desdeCache) return esCine ? t.cineSinConexion : t.categoriaSinConexion(nombre, frase)
  return esCine ? t.cineVacio(nombre, frase) : t.categoriaVacia(nombre, frase)
}

// ---------------------------------------------------------------------------
// 4. Buscar.
// ---------------------------------------------------------------------------

/** Cuántos botones, como mucho, en un vacío: a 360 dp, con la cabecera fija (~228 dp) y el mensaje, un cuarto ya queda abajo del pliegue. */
export const MAXIMO_ACCIONES_VACIO = 3

/**
 * Pura. El mensaje del vacío de resultados de Buscar: nombra cada filtro
 * activo (ese es el porqué). Hasta A6, con texto se perdía "gratis".
 * `nombreCategoria` es el nombre a mostrar (puede ser `null` aunque haya una
 * categoría elegida, si el slug no está entre las categorías cargadas).
 */
export function textoSinResultadosBuscar({
  texto,
  soloGratis,
  nombreCategoria,
  atajo,
  idioma = 'es',
}: {
  texto: string
  soloGratis: boolean
  nombreCategoria: string | null
  atajo: Atajo | null
  idioma?: Idioma
}): string {
  const t = textosDe(idioma).vacios
  const frase = atajo ? textosDe(idioma).portada.frases[atajo] : null
  return texto ? t.buscarConTexto(texto, soloGratis, nombreCategoria, frase) : t.buscarSinTexto(soloGratis, nombreCategoria, frase)
}

/**
 * Los textos de las salidas del vacío de Buscar, en orden de prioridad (el
 * mismo orden de los `accionesVacio.push(...)` de la pantalla, que
 * `tests/vacios-sin-conexion.test.ts` compara): primero lo que más achica
 * (el texto), después la fecha, "Solo gratis" y la categoría — la última
 * porque los chips de categoría, con "Todas", están justo arriba del vacío.
 */
export const ACCIONES_VACIO_BUSCAR = {
  texto: es.vacios.limpiarBusqueda,
  atajo: es.vacios.verTodasLasFechas,
  soloGratis: es.vacios.sacarSoloGratis,
  categoria: es.vacios.todasLasCategorias,
}

/** Q6-1: las mismas salidas, en el idioma pedido. */
export function accionesVacioBuscarEn(idioma: Idioma): typeof ACCIONES_VACIO_BUSCAR {
  const t = textosDe(idioma).vacios
  return { texto: t.limpiarBusqueda, atajo: t.verTodasLasFechas, soloGratis: t.sacarSoloGratis, categoria: t.todasLasCategorias }
}

/**
 * Pura. Qué salidas ofrece el vacío de Buscar (como mucho
 * `MAXIMO_ACCIONES_VACIO`, por prioridad). Mismas condiciones que la
 * pantalla: `texto` no vacío, `atajo !== null`, `soloGratis`, y
 * `categoria !== null` — el SLUG elegido (`categoriaFiltro`), no el nombre.
 */
export function accionesVacioBuscar({
  texto,
  atajo,
  soloGratis,
  categoria,
  idioma = 'es',
}: {
  texto: string
  atajo: Atajo | null
  soloGratis: boolean
  categoria: string | null
  idioma?: Idioma
}): string[] {
  const textos = accionesVacioBuscarEn(idioma)
  const acciones: string[] = []
  if (texto) acciones.push(textos.texto)
  if (atajo !== null) acciones.push(textos.atajo)
  if (soloGratis) acciones.push(textos.soloGratis)
  if (categoria !== null) acciones.push(textos.categoria)
  return acciones.slice(0, MAXIMO_ACCIONES_VACIO)
}

/** La grilla "Explorar por categoria" sin categorías (la carga salió bien pero vino vacía): porqué + Reintentar. */
export const VACIO_CATEGORIAS_BUSCAR = es.vacios.categoriasBuscar

// ---------------------------------------------------------------------------
// 5. Cines.
// ---------------------------------------------------------------------------

export type AccionCines = 'limpiar-busqueda' | 'ver-eventos-de-hoy'

/**
 * Pura. El vacío de Cines: con búsqueda, el texto de la web
 * (`CinesView`) + "Limpiar búsqueda"; sin búsqueda, por qué no hay nada + "Ver
 * eventos de hoy" (Buscar con la fecha "Hoy"). Sin búsqueda la acción es la
 * única y va rellena (`Vacio` con `accionPrincipal`).
 */
export function vacioCines(busqueda: string, idioma: Idioma = 'es'): VacioConAccion<AccionCines> {
  const t = textosDe(idioma).vacios
  if (busqueda) {
    return { texto: t.cinesSinResultados(busqueda), accion: { texto: t.limpiarBusqueda, destino: 'limpiar-busqueda' } }
  }
  return { texto: t.cinesVacio, accion: { texto: t.verEventosDeHoy, destino: 'ver-eventos-de-hoy' } }
}

// ---------------------------------------------------------------------------
// 6. Mis eventos (Favoritos).
// ---------------------------------------------------------------------------

/**
 * El vacío de Mis eventos con conexión. Espejo del literal de
 * `app/(tabs)/favoritos.tsx` (`<Vacio mensaje="..."`), que tiene que seguir
 * siendo literal con "Mis eventos" (`tests/favoritos-pantalla.test.ts`).
 * Acá "guardaste" SÍ es el corazón.
 */
export const VACIO_FAVORITOS = {
  mensaje: es.vacios.favoritos,
  textoAccion: es.vacios.verLaAgenda,
}

/**
 * El vacío de Mis eventos mostrando la copia sin conexión. No explica los
 * pasados: eso va solo en el aviso (`DETALLE_FAVORITOS_PASADOS`) y solo si
 * de verdad se sacaron (una copia que ya venía vacía no tiene pasados).
 */
export const VACIO_FAVORITOS_SIN_CONEXION = {
  mensaje: es.vacios.favoritosSinConexion,
  textoAccion: es.vacios.verLaAgenda,
}

/** La línea de más del aviso de Mis eventos, solo si al mostrar la copia se sacaron eventos que ya pasaron (`seOcultaronPasados`). */
export const DETALLE_FAVORITOS_PASADOS = es.vacios.favoritosPasados

/** Pura. Qué vacío de Mis eventos va. */
export function vacioFavoritos(desdeCache: boolean, idioma: Idioma = 'es'): { mensaje: string; textoAccion: string } {
  if (idioma === 'es') return desdeCache ? VACIO_FAVORITOS_SIN_CONEXION : VACIO_FAVORITOS
  const t = textosDe(idioma).vacios
  return { mensaje: desdeCache ? t.favoritosSinConexion : t.favoritos, textoAccion: t.verLaAgenda }
}

/** Pura. El detalle del aviso de Mis eventos: solo si se sacaron pasados. */
export function detalleAvisoFavoritos(seOcultaronPasados: boolean, idioma: Idioma = 'es'): string | undefined {
  return seOcultaronPasados ? textosDe(idioma).vacios.favoritosPasados : undefined
}

// ---------------------------------------------------------------------------
// 7. Radar.
// ---------------------------------------------------------------------------

/** Encima de "Ingresar para armar tu Radar" (sin sesión, con conexión): para qué entrar. */
export const TEXTO_RADAR_SIN_SESION = es.vacios.radarSinSesion

/** La grilla de categorías del Radar, vacía: por qué, y qué sí se puede hacer mientras tanto. */
export const TEXTO_RADAR_SIN_CATEGORIAS = es.vacios.radarSinCategorias

/**
 * Pura. El buscador de lugares y cuentas del Radar sin sugerencias. Si lo
 * buscado coincide con algo que ya se sigue (las sugerencias excluyen lo ya
 * elegido), se dice eso en vez de "no hay coincidencias". Siempre con
 * "Limpiar búsqueda" (vacía el buscador).
 */
export function vacioBuscadorRadar({
  busqueda,
  coincideConLoQueYaSeguis,
  idioma = 'es',
}: {
  busqueda: string
  coincideConLoQueYaSeguis: boolean
  idioma?: Idioma
}): { texto: string; textoAccion: string } {
  const t = textosDe(idioma).vacios
  const buscado = busqueda.trim()
  return {
    texto: coincideConLoQueYaSeguis ? t.radarYaSeguis(buscado) : t.radarSinCoincidencias(buscado),
    textoAccion: t.limpiarBusqueda,
  }
}
