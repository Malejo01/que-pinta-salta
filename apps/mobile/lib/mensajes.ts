// Mensajes compartidos por varios módulos de datos de la app (QPS-131, R27
// tarea 27-b). `MENSAJE_SIN_CONFIGURACION` vivía repetido, literal, en
// `lib/asistencia.ts`, `lib/datos/eventos.ts` y `lib/datos/cines.ts`: ahora
// vive una sola vez acá y esos tres módulos lo reexportan (sus tests siguen
// valiendo sin cambios, porque siguen pudiendo importarlo con el mismo
// nombre desde el mismo archivo de siempre).
export const MENSAJE_SIN_CONFIGURACION = 'La app no tiene la configuración de datos: avisá al equipo.'

// A6 (nube Q1) · Vacíos y sin conexión. Hasta acá, una falla de red y un
// error del servidor (un 5xx) decían lo mismo en las cinco pantallas con
// lista ("No pudimos cargar los eventos. Revisá tu conexión."): con un 5xx
// ese "Revisá tu conexión" mandaba a la persona a revisar algo que andaba
// bien. Ahora `sinConexion` (que ya llegaba de `lib/datos/*`,
// `lib/favoritos.ts`, `lib/radar.ts` y de `cargarAgendaConCache`/
// `cargarFavoritosConCache`) llega a la pantalla, y `mensajeErrorCarga`
// (`lib/vacios.ts`) elige uno de estos textos. Los `MENSAJE_ERROR_RED` de
// `lib/datos/*` y `lib/favoritos.ts` NO cambian: los siguen mostrando tal
// cual las fichas (`app/evento/[id].tsx`, `app/pelicula/[id].tsx`,
// `app/flyer/[id].tsx`), que no son de este ticket.
//
// Sin jerga técnica en pantalla (nada de "servidor", "caché", "error 500"),
// y sin "guardado" para la copia sin conexión: en la app "guardar" es el
// corazón (A6, ronda de correcciones). El único "guardado" que queda es el
// título del aviso, `TITULO_SIN_CONEXION` ("Sin conexión, mostrando lo
// último guardado"), que fija un test desde la R43 y no es de este ticket.

/**
 * Sin red y sin nada que mostrar, una por pantalla. En Inicio y Mis eventos
 * vale tanto si no había copia como si venció (por eso no dice "todavía no
 * hay"); en Mis eventos y Radar es también el texto sin sesión cuando la
 * sesión no se pudo confirmar por falta de red (`sinConexion` de
 * `useSession()`): ahí "Entrá…"/"Ingresar…" mentía.
 */
export const MENSAJE_SIN_CONEXION_INICIO = 'No hay conexión, así que no podemos traer la agenda. Conectate y tocá Reintentar.'
export const MENSAJE_SIN_CONEXION_FAVORITOS = 'No hay conexión, así que no podemos traer Mis eventos. Conectate y tocá Reintentar.'
export const MENSAJE_SIN_CONEXION_BUSCAR = 'No hay conexión, así que no podemos buscar eventos. Conectate y tocá Reintentar.'
export const MENSAJE_SIN_CONEXION_CINES = 'No hay conexión, así que no podemos traer la cartelera. Conectate y tocá Reintentar.'
export const MENSAJE_SIN_CONEXION_RADAR = 'No hay conexión, así que no podemos traer tu Radar. Conectate y tocá Reintentar.'

/** Error que no es de red (un 5xx, una respuesta rara): neutro, sin mandar a revisar la conexión. */
export const MENSAJE_ERROR_SERVIDOR_EVENTOS = 'No pudimos cargar los eventos. Probá de nuevo en un rato.'
export const MENSAJE_ERROR_SERVIDOR_CINES = 'No pudimos cargar la cartelera. Probá de nuevo en un rato.'
export const MENSAJE_ERROR_SERVIDOR_FAVORITOS = 'No pudimos cargar Mis eventos. Probá de nuevo en un rato.'
export const MENSAJE_ERROR_SERVIDOR_RADAR = 'No pudimos cargar tu Radar. Probá de nuevo en un rato.'

/** "Reintentar" volvió a fallar por red (con la copia a la vista, o sin sesión): se ve y se anuncia. */
export const MENSAJE_SEGUIMOS_SIN_CONEXION = 'Probamos de nuevo y seguimos sin conexión.'

/** "Reintentar" salió de la copia a datos frescos, o volvió la sesión: se anuncia. */
export const MENSAJE_VOLVIO_LA_CONEXION = 'Volvió la conexión.'

/** Se fue la banda de "No pudimos actualizar" (el refresco siguiente salió bien): se anuncia. */
export const MENSAJE_ACTUALIZADO = 'Listo, actualizado.'

/** Un refresco falló por red con datos ya en pantalla: se conservan (no se reemplazan por el error). */
export const MENSAJE_NO_SE_ACTUALIZO_SIN_CONEXION = 'No pudimos actualizar: no hay conexión.'

/** Un refresco falló por otra cosa con datos ya en pantalla: mismo criterio, texto neutro. */
export const MENSAJE_NO_SE_ACTUALIZO = 'No pudimos actualizar. Probá de nuevo en un rato.'

/**
 * Guardar el Radar sin red (`guardarRadar`, `lib/radar.ts`): deja claro que
 * lo elegido NO se perdió — la pantalla conserva el estado editado (y el
 * "Tenés cambios sin guardar") hasta el próximo Guardar — y que lo que ya
 * estaba puede haber quedado a medias: `guardarRadar` escribe en varios
 * pasos (settings, después borrar e insertar cada lista) y una caída en el
 * medio deja una parte escrita (eso es previo a A6; acá solo se avisa).
 */
export const MENSAJE_RADAR_GUARDAR_SIN_CONEXION =
  'No pudimos guardar tu Radar y puede haber quedado a medias hasta que vuelvas a guardar. Tus cambios siguen acá: cuando vuelva la conexión, tocá Guardar de nuevo.'
