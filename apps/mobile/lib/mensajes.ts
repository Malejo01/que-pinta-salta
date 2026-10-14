// Mensajes compartidos por varios módulos de datos de la app (QPS-131, R27
// tarea 27-b). `MENSAJE_SIN_CONFIGURACION` vivía repetido, literal, en
// `lib/asistencia.ts`, `lib/datos/eventos.ts` y `lib/datos/cines.ts`: ahora
// vive una sola vez acá y esos tres módulos lo reexportan (sus tests siguen
// valiendo sin cambios, porque siguen pudiendo importarlo con el mismo
// nombre desde el mismo archivo de siempre).
export const MENSAJE_SIN_CONFIGURACION = 'La app no tiene la configuración de datos: avisá al equipo.'
