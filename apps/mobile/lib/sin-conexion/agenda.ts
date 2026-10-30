// La carga de Inicio con caché (R43, 43-b; plan §§4-6, ops/rondas/43-sin-conexion/plan.md).
//
// Punto 4 del plan (TTL y topes, propuesta sin confirmar): la agenda vive
// bajo `CLAVE_AGENDA` con `TTL_AGENDA_MS` (48 h), recortada a
// `TOPE_ITEMS_AGENDA` eventos (400, los más próximos — la consulta de
// `lib/datos/eventos.ts` ya viene ordenada por `start_date` ascendente, así
// que "los más próximos" son los primeros 400, sin reordenar) y
// `TOPE_CARACTERES_AGENDA` (1.000.000) de JSON. El `datos` que se guarda no
// es el array de eventos pelado: es `{ eventos, categorias, peliculas }`
// (decisión 2 del plan), así que `recortarParaCache` necesita el
// `margenCaracteres` de lo que pesan `categorias` y `peliculas` más las
// llaves del objeto que las envuelve — se calcula en `margenDeAgenda`, nunca
// a mano (ver el comentario de `OpcionesRecorte.margenCaracteres` en
// `./cache.ts`: ese es justo el bloqueante que ya costó una vuelta en 43-a).
//
// Punto 5: la caché solo se muestra si `cargar()` falló por red
// (`sinConexion: true`) y hay una caché válida (TTL no vencido). Cualquier
// otro error —incluido `MENSAJE_SIN_CONFIGURACION`, que nunca trae
// `sinConexion`— muestra el error de siempre, nunca la caché. La caché se
// escribe solo después de una carga buena, nunca mientras se está mostrando
// la caché (no hay ningún `guardarCache` en la rama de `tipo: 'ok'` con
// `desdeCache` distinto de `null`).
//
// Punto 6: al mostrar la caché, `paraMostrar` vuelve a filtrar los eventos
// con `isVigente(item.paraAtajo, ahora)` (la `ahora` de la pantalla, no la de
// cuando se guardó) y descarta las películas si no se guardaron el mismo día
// de Salta que `ahora` — la cartelera de ayer no sirve.
//
// Vuelta 1 de la revisión de 43-b (seguridad): lo que vuelve de AsyncStorage
// es DATO, no instrucción — puede venir de un backup de Android restaurado
// (Expo deja `allowBackup` en `true`) o de un teléfono con root, con la
// versión correcta (`leerCache`/43-a sí valida eso) pero `datos` de otra
// forma. `cargarAgendaConCache` envuelve el tramo que llama a `paraMostrar`
// en un `try/catch`: si `datos` no tiene la forma de `DatosAgenda`, se trata
// exactamente igual que "no hay caché" (el error de siempre), nunca se
// escapa la excepción.
//
// A3 (nube Q1): los eventos de la agenda traen `paraChicos` (el chip "Para
// chicos"). Una caché guardada antes de A3 no lo tiene: `paraMostrar` lo
// completa con `completarParaChicos` (`lib/para-chicos.ts`: la categoría
// `infantil`, porque la caché no guarda los tags), así la pantalla siempre
// recibe un booleano. No se sube `VERSION_CACHE` (`./cache.ts`): subirla
// tiraría la caché de los testers por un dato que se puede completar.
import { isVigente } from '@qps/core/events/vigencia'
import { formatDateInSalta } from '@qps/core/home/transform'
import type { CategoriaBasica, EventoVigenteParaInicio } from '@/lib/datos/eventos'
import type { Pelicula } from '@/lib/datos/cines'
import { completarParaChicos } from '@/lib/para-chicos'
import type { Almacen } from './almacen'
import {
  CLAVE_AGENDA,
  guardarCache,
  leerCache,
  recortarDescripcion,
  recortarParaCache,
  TOPE_CARACTERES_AGENDA,
  TOPE_ITEMS_AGENDA,
  TTL_AGENDA_MS,
} from './cache'

/** Lo que guarda y lee la caché de Inicio: la última carga buena (decisión 2 del plan). */
export interface DatosAgenda {
  eventos: EventoVigenteParaInicio[]
  categorias: CategoriaBasica[]
  peliculas: Pelicula[]
}

export interface DepsCargarAgenda {
  /** La carga que hoy arma la pantalla (43-c): las tres consultas en paralelo, con `sinConexion` como el O lógico de las tres. */
  cargar: () => Promise<{ ok: true; datos: DatosAgenda } | { ok: false; error: string; sinConexion?: boolean }>
  ahora: Date
  almacen?: Almacen
}

// A6 (nube Q1): la rama de error suma `sinConexion: true` cuando `cargar()`
// falló por red y no había nada guardado que sirviera (no había caché, venció
// o tenía otra forma). Antes se perdía acá: la pantalla no podía distinguir
// "no hay conexión y no hay nada guardado" de un error del servidor, y
// mostraba para los dos el mismo "... Revisá tu conexión." Se eligió sumarlo
// acá (y no capturarlo en la pantalla envolviendo `cargar`) porque es lo que
// ya sabe esta función y la pantalla no tiene que repetir nada; los tests que
// fijaban `toEqual({ tipo: 'error', error })` para esos casos se actualizaron
// a propósito. Un error que no es de red sigue sin la clave (no `false`).
export type ResultadoCargaAgenda =
  | { tipo: 'ok'; datos: DatosAgenda; desdeCache: { guardadoEn: Date } | null }
  | { tipo: 'error'; error: string; sinConexion?: true }

/** Igual que `sinDescripcionLargaAgenda` del fixture de `cache.ts`: la descripción vive anidada en `item.evento.description`. */
function sinDescripcionLargaAgenda(item: EventoVigenteParaInicio): EventoVigenteParaInicio {
  return { ...item, evento: { ...item.evento, description: recortarDescripcion(item.evento.description) } }
}

/**
 * Cuánto pesan `categorias` y `peliculas`, más las llaves del objeto que las
 * envuelve junto a `eventos` (`{ eventos, categorias, peliculas }`), ya
 * puesto en JSON — lo que `recortarParaCache` necesita en
 * `margenCaracteres` para que el recorte de `eventos` sea exacto (ver el
 * comentario de cabecera). Se calcula igual que `MARGEN_SOBRE_CACHE`
 * (`./cache.ts`): se arma el objeto real con `eventos: []` y se le resta el
 * largo de `'[]'` (2 caracteres), así nunca se desincroniza si cambian
 * `categorias` o `peliculas`.
 */
function margenDeAgenda(categorias: CategoriaBasica[], peliculas: Pelicula[]): number {
  const envoltorioVacio = JSON.stringify({ eventos: [] as EventoVigenteParaInicio[], categorias, peliculas })
  const arrayVacio = JSON.stringify([] as EventoVigenteParaInicio[])
  return envoltorioVacio.length - arrayVacio.length
}

/**
 * Carga la agenda de Inicio con caché: si `cargar()` sale bien, guarda (ya
 * recortada) y devuelve los datos frescos; si falla por red, muestra la
 * caché (si hay y no venció); si falla por otra cosa, o no hay caché,
 * devuelve el error de siempre.
 */
export async function cargarAgendaConCache(deps: DepsCargarAgenda): Promise<ResultadoCargaAgenda> {
  const { cargar, ahora, almacen } = deps
  const resultado = await cargar()

  if (resultado.ok) {
    const { eventos, categorias, peliculas } = resultado.datos
    const eventosRecortados = recortarParaCache(eventos, {
      topeCaracteres: TOPE_CARACTERES_AGENDA,
      topeItems: TOPE_ITEMS_AGENDA,
      margenCaracteres: margenDeAgenda(categorias, peliculas),
      sinDescripcionLarga: sinDescripcionLargaAgenda,
    })

    // Si ni la lista vacía entra (en la práctica, imposible con estos topes),
    // no hay nada válido para guardar: se deja la caché vieja como está. Si
    // el guardado falla por cualquier otro motivo, `guardarCache` ya devuelve
    // `false` sin tirar: no cambia nada para la pantalla.
    if (eventosRecortados !== null) {
      await guardarCache(CLAVE_AGENDA, { eventos: eventosRecortados, categorias, peliculas }, { ahora, almacen })
    }

    return { tipo: 'ok', datos: resultado.datos, desdeCache: null }
  }

  if (!resultado.sinConexion) {
    return { tipo: 'error', error: resultado.error }
  }

  const cache = await leerCache<DatosAgenda>(CLAVE_AGENDA, { ahora, ttlMs: TTL_AGENDA_MS, almacen })
  if (cache === null) {
    return { tipo: 'error', error: resultado.error, sinConexion: true }
  }

  // `paraMostrar` tira si `cache.datos` no tiene la forma esperada (`.filter`
  // sobre algo que no es array, o `isVigente` sobre un `paraAtajo` ausente,
  // ya adentro de `@qps/core`): ver el comentario de cabecera. Una caché así
  // se trata igual que si no existiera.
  try {
    const datos = paraMostrar(cache.datos, cache.guardadoEn, ahora)
    return { tipo: 'ok', datos, desdeCache: { guardadoEn: cache.guardadoEn } }
  } catch {
    return { tipo: 'error', error: resultado.error, sinConexion: true }
  }
}

/**
 * Pura. Al mostrar la agenda guardada: saca los eventos que ya no son
 * vigentes (con la `ahora` de la pantalla, no la de cuando se guardó) y deja
 * las películas solo si se guardaron el mismo día de Salta que `ahora` — si
 * no, `peliculas: []` (la cartelera de ayer no sirve).
 *
 * A3 (nube Q1): cada evento sale con `paraChicos` booleano; si la caché es
 * anterior a A3 y no lo tiene, se completa (`completarParaChicos`).
 */
export function paraMostrar(datos: DatosAgenda, guardadoEn: Date, ahora: Date): DatosAgenda {
  const eventos = datos.eventos.filter((item) => isVigente(item.paraAtajo, ahora)).map(completarParaChicos)
  const mismoDia = formatDateInSalta(guardadoEn) === formatDateInSalta(ahora)
  return { eventos, categorias: datos.categorias, peliculas: mismoDia ? datos.peliculas : [] }
}
