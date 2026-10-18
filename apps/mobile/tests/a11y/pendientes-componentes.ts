// 46-b: línea de base de `tests/accesibilidad-detector.test.ts` para
// `components/**` — lo que el barrido encuentra HOY (18/10, rama
// ronda/46-calidad-app), no lo que dice la tabla del plan (que es de un
// commit viejo: ver las diferencias anotadas en el reporte de la tarea).
//
// Un archivo que no aparece acá tiene línea de base 0 para las seis reglas:
// el detector falla si encuentra algo en un archivo ausente de esta lista.
//
// Esta lista SOLO puede bajar (el detector falla también si un número acá
// queda más alto que lo que el barrido encuentra de verdad): cuando 46-c o
// 46-d arreglen un tocable, hay que bajar (o borrar) la entrada acá, en el
// mismo commit que el arreglo — si no, el detector marca "menos hallazgos
// que la línea de base" y falla igual, a propósito, para que la lista no
// quede vieja.
//
// `sin-escalar` y `escala-suelta` no tienen entradas acá (ninguna, en ningún
// archivo): las dos están en 0 desde esta ronda y el test principal las
// exige en 0 siempre, sin pasar por esta línea de base.

/** Las seis reglas que detecta `tests/accesibilidad-detector.test.ts`. */
export type ReglaAccesibilidad = 'sin-rol' | 'sin-etiqueta' | 'link-externo' | 'area-chica' | 'sin-escalar' | 'escala-suelta'

/** Archivo (ruta relativa a `apps/mobile`, con `/`) -> cantidad de
 * hallazgos por regla que el barrido encuentra hoy en ese archivo. */
export type LineaBaseAccesibilidad = Record<string, Partial<Record<ReglaAccesibilidad, number>>>

export const PENDIENTES_COMPONENTES: LineaBaseAccesibilidad = {
  // El "ojito" de mostrar/ocultar contraseña: 44×44 (estilos.ojito), sin
  // hitSlop que lo compense. Arreglo sugerido: hitSlopPara(44) (llega a 48)
  // o subir minWidth/minHeight a 48.
  'components/CampoTexto.tsx': { 'area-chica': 1 },
  // El botón de usuario (ícono solo, con sesión): 40×40 (estilos.botonUsuario).
  'components/Encabezado.tsx': { 'area-chica': 1 },
  // El Pressable de "Voy"/"Me interesa" (la función `boton(tipo, cantidad)`
  // se declara una sola vez en el archivo, aunque se llama dos veces): sin
  // accessibilityRole.
  'components/BotonesAsistencia.tsx': { 'sin-rol': 1 },
  // `ErrorCarga` y `Vacio` comparten la misma clave de estilo `boton`
  // (minHeight: 44): dos Pressable distintos, dos hallazgos.
  'components/EstadoCarga.tsx': { 'area-chica': 2 },
  // "Ver todos" de cada fila de categoría: estilos.botonVerTodos, minHeight: 44.
  'components/FilaCategoria.tsx': { 'area-chica': 1 },
  // DiapositivaHero (la tarjeta grande del carrusel) no tiene
  // accessibilityRole; los puntos de paginación (estilos.punto, height: 6)
  // tienen hitSlop={10} pero no les alcanza para llegar a 48 en el eje
  // horizontal (6 o 20 + 2×10 = 26 o 40, los dos < 48) — a diferencia de la
  // excepción documentada de `buscar.tsx`, este caso NO está en la lista de
  // excepciones de abajo: sigue siendo un hallazgo real hasta que 46-c deje
  // anotado, en el propio Hero.tsx, por qué no hace falta que lleguen (y
  // entonces sí pase a la lista de excepciones) o hasta que se arregle.
  'components/Hero.tsx': { 'sin-rol': 1, 'area-chica': 1 },
  // Tres Pressable sin accessibilityRole (la fila de "Lugares y
  // Organizadores" de las sugerencias de búsqueda no tiene rol; "Canal del
  // Radar" y "Guardar Preferencias" tampoco) — ojo, de esos tres solo el de
  // la sugerencia es el que suma a `sin-rol` en el barrido real, porque los
  // otros dos SÍ tienen accessibilityRole="radio"/"checkbox"/"button": ver
  // el detalle en el reporte de la tarea. `area-chica`: la fila de
  // frecuencia, cada ítem de categoría y la fila de sugerencia, los tres con
  // minHeight: 44 (el `minHeight: 36` del chip de lugar/cuenta está en un
  // `View`, no en el `Pressable` que lo acompaña: el heurístico no lo ve,
  // documentado en el reporte).
  'components/PantallaRadar.tsx': { 'sin-rol': 1, 'area-chica': 3 },
  // Los tres Switch de arriba (recordatorios, novedades, avisos) no tienen
  // accessibilityLabel; el chip de "Canal del Radar" y "Guardar
  // notificaciones" no tienen accessibilityRole.
  'components/SeccionNotificaciones.tsx': { 'sin-rol': 2, 'sin-etiqueta': 3 },
  // La pill de cada atajo (Hoy/Esta noche/Finde/Semana): estilos.pill,
  // minHeight: 44.
  'components/PillsAtajos.tsx': { 'area-chica': 1 },
}
